'use client';

import { useEffect } from 'react';
import { NEAR_CONFIG, ONBOARDING_CONFIG } from '@/lib/constants';
import { getCurrentRpcUrl } from '@/lib/rpc-failover';

/**
 * Injects the onboarding key into localStorage on app load.
 * This enables decentralized (relayer-less) trial account creation
 * and free ticket claims directly from the client.
 *
 * Also monitors trial pool health via read-only RPC calls.
 */
export function OnboardingKeyInit() {
    useEffect(() => {
        const key = ONBOARDING_CONFIG.secretKey;
        if (!key) return;

        const storageKey = `onboarding_key:${NEAR_CONFIG.contractId}`;
        const existing = localStorage.getItem(storageKey);

        if (existing !== key) {
            localStorage.setItem(storageKey, key);
        }

        // Validate key is still usable (non-blocking)
        validateOnboardingKey(key).catch(() => {});

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

    const poolYocto = typeof poolBalanceRaw === 'string' ? BigInt(poolBalanceRaw) : BigInt(0);
    const poolNear = Number(poolYocto) / 1e24;
    const count = typeof dailyCount === 'number' ? dailyCount : 0;

    if (poolNear < 1) {
        console.warn('[ONBOARDING_MONITOR] WARNING: Trial pool balance < 1 NEAR — new trials may fail');
    }
    if (count > 80) {
        console.warn(`[ONBOARDING_MONITOR] WARNING: Daily trial count ${count}/100 — approaching limit`);
    }
}
