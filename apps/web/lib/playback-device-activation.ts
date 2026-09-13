import { actions } from 'near-api-js';
import { FEATURE_FLAGS, GAS_CONSTANTS, NEAR_CONFIG } from './constants';
import { getDeviceSession, onDeviceSessionCleared, preparePlaybackDevice } from './device-session';
import { hasLivepeerEntitlement, readLivepeerPublication } from './livepeer-publication';
import { getProvider, viewContract } from './near';
import type { LivepeerPlaybackInput } from './livepeer-playback';
import type { WalletInstance } from './types';

// Called only by the explicit device button. Playback and token renewal never submit a transaction.
export async function activatePlaybackDevice(wallet: WalletInstance, input: LivepeerPlaybackInput, signal: AbortSignal): Promise<void> {
    if (!FEATURE_FLAGS.publicTestnetVideoV1 || !FEATURE_FLAGS.enablePlaybackAuthorizerV2) throw new Error('device_activation_disabled');
    const lifetime = new AbortController();
    const active = AbortSignal.any([signal, lifetime.signal]);
    const unsubscribe = onDeviceSessionCleared(() => lifetime.abort());
    const requireAccount = async () => {
        active.throwIfAborted();
        const accounts = await wallet.getAccounts?.();
        active.throwIfAborted();
        if (accounts?.[0]?.accountId !== input.accountId) throw new Error('device_activation_account_changed');
    };
    try {
        await requireAccount();
        const publication = await readLivepeerPublication(input.jobId);
        active.throwIfAborted();
        if (!publication || publication.generation !== input.generation || publication.playback_id !== input.playbackId
            || publication.availability === 'TAKEDOWN' || !await hasLivepeerEntitlement(input.accountId, input.jobId)) {
            throw new Error('playback_denied');
        }
        active.throwIfAborted();
        const governance = await viewContract<{ bridge_frozen?: boolean }>(getProvider(), NEAR_CONFIG.marketContractId, 'get_governance_state', {});
        active.throwIfAborted();
        if (governance?.bridge_frozen !== false) throw new Error('device_activation_unavailable');
        const authorization = await preparePlaybackDevice(input.accountId);
        await requireAccount();
        try {
            await wallet.signAndSendTransaction({
                receiverId: NEAR_CONFIG.marketContractId,
                actions: [actions.functionCall('activate_playback_device', {
                    publication_id: input.jobId, playback_session: authorization,
                }, GAS_CONSTANTS.mediumGas, 1n)],
            });
        } catch { /* A missing wallet reply is not proof that the transaction failed. Read the same record. */ }
        for (const delay of [0, 1_000, 2_000, 4_000, 8_000]) {
            active.throwIfAborted();
            if (delay) await new Promise<void>((resolve, reject) => {
                const finish = () => { active.removeEventListener('abort', cancel); resolve(); };
                const timer = setTimeout(finish, delay);
                const cancel = () => { clearTimeout(timer); reject(active.reason); };
                active.addEventListener('abort', cancel, { once: true });
            });
            active.throwIfAborted();
            const session = await getDeviceSession(input.accountId).catch(() => null);
            active.throwIfAborted();
            if (session?.certificate.session_public_key === authorization.session_public_key) return;
        }
        throw new Error('device_activation_pending');
    } finally { unsubscribe(); }
}
