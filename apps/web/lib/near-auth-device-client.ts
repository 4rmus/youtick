import { decodeTransaction } from 'near-api-js';
import { isMpcSettled, type MpcStatus } from '../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
import { DEVICE_GAS } from '../../../protocol/paid-media-livepeer-v1/device-recovery';
import { getDeviceSession, preparePlaybackDevice, readPreparedPlaybackDevice } from './device-session';
import { signingAttemptBlockReason } from './near-auth-signing';
import { NEAR_CONFIG } from './constants';
import type { LivepeerPlaybackInput } from './livepeer-playback';
import type { prepareGoogleDevice } from './near-auth-device-server';
export type DeviceReview = Awaited<ReturnType<typeof prepareGoogleDevice>>;
export async function deviceApi<T>(body: object, signal?: AbortSignal): Promise<T> {
    const response = await fetch('/api/auth/device', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json();
    if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'device_check_failed');
    return value as T;
}
export const deviceStatus = (signal?: AbortSignal) => deviceApi<{ enabled: boolean; payment: MpcStatus | null }>({ action: 'status', operationId: '' }, signal);

function legacyGuard(input: LivepeerPlaybackInput) {
    const blocked = signingAttemptBlockReason({ accountId: input.accountId,
        purchase: { marketContractId: NEAR_CONFIG.marketContractId, publicationId: input.jobId } });
    if (blocked) throw new Error(blocked);
    // Legacy upload attempts have no authoritative terminal state here; keep their original recovery path.
    const prefix = `youtick:auth-lab:upload:testnet:${NEAR_CONFIG.marketContractId}:${input.accountId}:`;
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith(prefix)) throw new Error('signing_already_started');
}
export async function prepareDeviceRecovery(input: LivepeerPlaybackInput, signal: AbortSignal) {
    const current = await deviceStatus(signal); signal.throwIfAborted();
    if (!current.enabled) throw new Error('device_activation_disabled');
    if (current.payment && !isMpcSettled(current.payment)) throw new Error('mpc_pending');
    legacyGuard(input);
    const existing = await getDeviceSession(input.accountId); signal.throwIfAborted();
    if (existing) return null;
    const playbackSession = await preparePlaybackDevice(input.accountId); signal.throwIfAborted();
    const { review } = await deviceApi<{ review: DeviceReview }>({ action: 'prepare', publicationId: input.jobId,
        generation: input.generation, playbackId: input.playbackId, playbackSession }, signal);
    if (review.accountId !== input.accountId || review.device.publicationId !== input.jobId
        || review.device.generation !== input.generation || review.device.playbackId !== input.playbackId
        || review.device.marketContractId !== NEAR_CONFIG.marketContractId) throw new Error('account_changed');
    await assertDevice(review.accountId, review.device.playbackSession); signal.throwIfAborted();
    return review;
}
async function assertDevice(accountId: string, expected: DeviceReview['device']['playbackSession']) {
    const device = await readPreparedPlaybackDevice(accountId);
    if (!device || device.session_public_key !== expected.session_public_key || device.certificate_sha256 !== expected.certificate_sha256
        || device.authorization_duration_ms !== expected.authorization_duration_ms) throw new Error('device_changed');
}
export async function approveDeviceRecovery(review: DeviceReview, authorize: (bytes: number[]) => Promise<string>, signal: AbortSignal, onSubmit: () => void) {
    const current = await deviceStatus(signal); signal.throwIfAborted();
    if (!current.enabled || current.payment && !isMpcSettled(current.payment)) throw new Error('mpc_pending');
    legacyGuard({ accountId: review.accountId, jobId: review.device.publicationId, generation: review.device.generation, playbackId: review.device.playbackId });
    if (review.expiresAt <= Date.now()) throw new Error('review_expired');
    await assertDevice(review.accountId, review.device.playbackSession); signal.throwIfAborted();
    const token = await authorize(review.transaction);
    signal.throwIfAborted(); await assertDevice(review.accountId, review.device.playbackSession); signal.throwIfAborted();
    onSubmit();
    return deviceApi<{ payment: MpcStatus }>({ action: 'submit', review: review.ticket, approvalToken: token }, signal);
}
// Only an explicit continuation can send the already approved inner transaction. Status/reload never sends.
export async function continueDeviceRecovery(payment: MpcStatus, input: LivepeerPlaybackInput, signal: AbortSignal) {
    if (payment.purpose !== 'device' || payment.accountId !== input.accountId || payment.resourceId !== input.jobId
        || payment.market !== NEAR_CONFIG.marketContractId || payment.network !== 'testnet' || payment.amountUsdc !== '0') throw new Error('account_changed');
    if (payment.state !== 'MPC_VERIFIED') return { payment };
    const tx = decodeTransaction(Uint8Array.from(atob(payment.payloadBase64), c => c.charCodeAt(0)));
    const call = tx.actions.length === 1 ? tx.actions[0].functionCall : undefined;
    if (tx.signerId !== input.accountId || tx.receiverId !== payment.market || !call
        || call.methodName !== 'activate_playback_device' || call.gas !== DEVICE_GAS || call.deposit !== 1n) throw new Error('invalid_intent');
    const args = JSON.parse(new TextDecoder().decode(new Uint8Array(call.args)));
    if (args.publication_id !== input.jobId) throw new Error('account_changed');
    await assertDevice(input.accountId, args.playback_session); signal.throwIfAborted();
    return deviceApi<{ payment: MpcStatus }>({ action: 'execute', operationId: payment.operationId }, signal);
}
