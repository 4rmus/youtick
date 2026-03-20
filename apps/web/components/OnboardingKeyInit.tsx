'use client';

import { useEffect } from 'react';
import { NEAR_CONFIG } from '@/lib/constants';
import { isYoctoAmountBelowNear } from '@/lib/near-amount';
import { getCurrentRpcUrl } from '@/lib/rpc-failover';

/**
 * Validates any manually provisioned onboarding key and monitors trial pool health.
 */
export function OnboardingKeyInit() {
    useEffect(() => {
        const storageKey = `onboarding_key:${NEAR_CONFIG.contractId}`;
        const existingKey = localStorage.getItem(storageKey);

        if (process.env.NEXT_PUBLIC_ONBOARDING_KEY) {
            console.warn('[ONBOARDING_KEY] Ignoring NEXT_PUBLIC_ONBOARDING_KEY. Public onboarding key bootstrap is disabled.');
        }

        if (existingKey) {
            // Validate key is still usable (non-blocking)
            validateOnboardingKey(existingKey).catch(() => {});
        }

        // Non-blocking: monitor trial pool health
        monitorTrialPool().catch(() => {});
    }, []);

    return null;
}

/**
 * Validate that the onboarding key is still a valid access key on the contract.
 * If invalid, remove from localStorage so gift-service doesn't use a stale key.
 */
async function validateOnboardingKey(secretKey: string): Promise<void> {
    try {
        const { KeyPair } = await import('near-api-js');
        const keyPair = KeyPair.fromString(secretKey as import('near-api-js').KeyPairString);
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
            console.warn('[ONBOARDING_KEY] Key no longer valid on contract, removing from localStorage');
            localStorage.removeItem(`onboarding_key:${contractId}`);
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
        return JSON.parse(
            new TextDecoder().decode(new Uint8Array(data.result.result))
        );
    };

    const [poolBalanceRaw, dailyCount] = await Promise.all([
        viewCall('get_trial_pool_balance'),
        viewCall('get_daily_trial_count'),
    ]);

    const poolYocto = typeof poolBalanceRaw === 'string' ? poolBalanceRaw : '0';
    const count = typeof dailyCount === 'number' ? dailyCount : 0;

    if (isYoctoAmountBelowNear(poolYocto, '1')) {
        console.warn('[ONBOARDING_MONITOR] WARNING: Trial pool balance < 1 NEAR — new trials may fail');
    }
    if (count > 80) {
        console.warn(`[ONBOARDING_MONITOR] WARNING: Daily trial count ${count}/100 — approaching limit`);
    }
}
