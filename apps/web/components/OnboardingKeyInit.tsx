'use client';

import { useEffect, useState } from 'react';
import { NEAR_CONFIG, APP_CONFIG } from '@/lib/constants';
import { isYoctoAmountBelowNear } from '@/lib/near-amount';
import { getCurrentRpcUrl } from '@/lib/rpc-failover';
import { useLanguage } from '@/components/providers/LanguageContext';

/**
 * Validates any manually provisioned onboarding key and monitors trial pool health.
 * Uses sessionStorage instead of localStorage to reduce persistence risk.
 */
const isDev = process.env.NODE_ENV === 'development';

export function OnboardingKeyInit() {
    const { t } = useLanguage();
    const systemCopy = t.system_messages;
    const [apiWarning, setApiWarning] = useState<string | null>(null);

    useEffect(() => {
        const storageKey = `onboarding_key:${NEAR_CONFIG.contractId}`;
        const existingKey = sessionStorage.getItem(storageKey);

        async function bootstrap() {
            let turnstileToken: string | null = null;

            if (APP_CONFIG.turnstileSiteKey) {
                if (isLocalBrowserHost()) {
                    return;
                }

                turnstileToken = await getTurnstileToken(APP_CONFIG.turnstileSiteKey);
                if (!turnstileToken) {
                    setApiWarning(getUnsupportedApiMessage(systemCopy));
                    return;
                }
            }

            const url = turnstileToken
                ? `/api/onboarding-key?turnstileToken=${encodeURIComponent(turnstileToken)}`
                : '/api/onboarding-key';

            try {
                const res = await fetch(url);
                if (!res.ok) {
                    setApiWarning(getUnsupportedApiMessage(systemCopy));
                    return;
                }
                const data = await res.json();
                if (data?.key) {
                    setApiWarning(null);
                    sessionStorage.setItem(storageKey, data.key);
                    console.log(
                        '[ONBOARDING_KEY] Bootstrapped onboarding key from secure endpoint'
                    );
                }
            } catch {
                setApiWarning(getUnsupportedApiMessage(systemCopy));
            }
        }

        if (!existingKey && !isDev) {
            bootstrap();
        }

        // Re-read after potential bootstrap so validation covers the new key
        const activeKey = sessionStorage.getItem(storageKey);

        if (activeKey && !isDev) {
            // Validate key is still usable (non-blocking)
            validateOnboardingKey(activeKey).catch(() => {});
        }

        // Non-blocking: monitor trial pool health (skip in dev to reduce noise)
        if (!isDev) {
            monitorTrialPool().catch(() => {});
        }
    }, [systemCopy]);

    if (!apiWarning) return null;

    return (
        <div role="alert" className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-near-red/40 bg-zinc-950/95 p-3 text-xs text-near-red shadow-lg">
            {apiWarning}
        </div>
    );
}

function getUnsupportedApiMessage(copy: Record<string, string>): string {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    if (host.endsWith('.near.page') || host.includes('ipfs') || host.includes('gateway')) {
        return copy.guest_api_static;
    }
    return copy.guest_api_unavailable;
}

function isLocalBrowserHost(): boolean {
    if (typeof window === 'undefined') return false;

    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** Dynamically load Turnstile script and render an invisible challenge */
function getTurnstileToken(siteKey: string): Promise<string | null> {
    return new Promise((resolve) => {
        if (typeof window === 'undefined') {
            resolve(null);
            return;
        }

        const w = window as unknown as {
            turnstile?: {
                render: (selector: string, opts: Record<string, unknown>) => string;
                remove: (widgetId: string) => void;
            };
        };

        function render() {
            if (!w.turnstile) {
                resolve(null);
                return;
            }

            const containerId = 'turnstile-onboarding-' + Math.random().toString(36).slice(2);
            const container = document.createElement('div');
            container.id = containerId;
            container.style.position = 'absolute';
            container.style.visibility = 'hidden';
            container.style.width = '0';
            container.style.height = '0';
            document.body.appendChild(container);

            const widgetId = w.turnstile.render(`#${containerId}`, {
                sitekey: siteKey,
                size: 'invisible',
                callback: (token: string) => {
                    w.turnstile?.remove(widgetId);
                    container.remove();
                    resolve(token);
                },
                'error-callback': () => {
                    w.turnstile?.remove(widgetId);
                    container.remove();
                    resolve(null);
                },
                'expired-callback': () => {
                    w.turnstile?.remove(widgetId);
                    container.remove();
                    resolve(null);
                },
            });
        }

        if (!w.turnstile) {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            script.onload = render;
            script.onerror = () => resolve(null);
            document.head.appendChild(script);
        } else {
            render();
        }
    });
}

/**
 * Validate that the onboarding key is still a valid access key on the contract.
 * If invalid, remove from sessionStorage so gift-service doesn't use a stale key.
 */
async function validateOnboardingKey(secretKey: string): Promise<void> {
    try {
        const { KeyPair } = await import('near-api-js');
        const keyPair = KeyPair.fromString(
            secretKey as import('near-api-js').KeyPairString
        );
        const publicKey = keyPair.getPublicKey().toString();

        const rpcUrl = getCurrentRpcUrl();
        const contractId = NEAR_CONFIG.contractId;

        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'onboarding-key-check',
                method: 'query',
                params: {
                    request_type: 'view_access_key',
                    finality: 'final',
                    account_id: contractId,
                    public_key: publicKey,
                },
            }),
        });

        const data = await response.json();

        if (data.error) {
            console.warn(
                '[ONBOARDING_KEY] Key no longer valid on contract, removing from sessionStorage'
            );
            sessionStorage.removeItem(`onboarding_key:${contractId}`);
            console.log('[DECENTRALIZATION_METRIC] onboarding_key_invalid');
        } else {
            console.log('[DECENTRALIZATION_METRIC] onboarding_key_valid');
        }
    } catch {
        // Non-blocking: validation failure doesn't affect operation
    }
}

/**
 * Check trial pool balance and daily usage via read-only RPC calls.
 * Logs warnings if pool is low or daily limit is close.
 */
async function monitorTrialPool(): Promise<void> {
    const rpcUrl = getCurrentRpcUrl();
    const contractId = NEAR_CONFIG.contractId;

    const viewCall = async (methodName: string): Promise<unknown> => {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: `onboarding-monitor-${methodName}`,
                method: 'query',
                params: {
                    request_type: 'call_function',
                    finality: 'final',
                    account_id: contractId,
                    method_name: methodName,
                    args_base64: btoa('{}'),
                },
            }),
        });
        const data = await response.json();
        if (data.error || !data.result?.result) return null;
        return JSON.parse(new TextDecoder().decode(new Uint8Array(data.result.result)));
    };

    const [poolBalanceRaw, dailyCount] = await Promise.all([
        viewCall('get_trial_pool_balance'),
        viewCall('get_daily_trial_count'),
    ]);

    const poolYocto = typeof poolBalanceRaw === 'string' ? poolBalanceRaw : '0';
    const count = typeof dailyCount === 'number' ? dailyCount : 0;

    if (isYoctoAmountBelowNear(poolYocto, '1')) {
        console.debug(
            '[ONBOARDING_MONITOR] WARNING: Trial pool balance < 1 NEAR — new trials may fail'
        );
    }
    if (count > 80) {
        console.debug(
            `[ONBOARDING_MONITOR] WARNING: Daily trial count ${count}/100 — approaching limit`
        );
    }
}
