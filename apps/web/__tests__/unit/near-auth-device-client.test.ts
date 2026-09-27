import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.unmock('near-api-js');
import { actions, createTransaction, encodeTransaction, KeyPair } from 'near-api-js';
import { approveDeviceRecovery, continueDeviceRecovery, deviceStatus, prepareDeviceRecovery, type DeviceReview } from '@/lib/near-auth-device-client';
import type { MpcStatus } from '../../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
import { isMpcSettled } from '../../../../protocol/paid-media-livepeer-v1/mpc-sponsor';
const mocks = vi.hoisted(() => ({ session: vi.fn(), prepare: vi.fn(), read: vi.fn(), block: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/device-session', () => ({ getDeviceSession: mocks.session, preparePlaybackDevice: mocks.prepare, readPreparedPlaybackDevice: mocks.read }));
vi.mock('@/lib/near-auth-signing', () => ({ signingAttemptBlockReason: mocks.block }));
vi.mock('@/lib/constants', () => ({ NEAR_CONFIG: { marketContractId: 'market.testnet' } }));
const input = { accountId: 'a'.repeat(64), jobId: 'video-1', generation: 1, playbackId: 'playback-1' };
const device = { session_public_key: KeyPair.fromRandom('ed25519').getPublicKey().toString(), certificate_sha256: 'c'.repeat(64), authorization_duration_ms: '2592000000' };
const review: DeviceReview = { accountId: input.accountId, transaction: [1, 2], ticket: 'opaque', transactionHash: 'hash', expiresAt: Date.now() + 300000,
    device: { publicationId: input.jobId, generation: 1, playbackId: input.playbackId, playbackSession: device, marketContractId: 'market.testnet' } };
const bytes = encodeTransaction(createTransaction(input.accountId, KeyPair.fromRandom('ed25519').getPublicKey(), 'market.testnet', 1n,
    [actions.functionCall('activate_playback_device', { publication_id: input.jobId, playback_session: device }, 100000000000000n, 1n)], new Uint8Array(32)));
const payment = { purpose: 'device', state: 'MPC_VERIFIED', accountId: input.accountId, resourceId: input.jobId, market: 'market.testnet', network: 'testnet', amountUsdc: '0',
    operationId: 'b'.repeat(64), payloadBase64: Buffer.from(bytes).toString('base64') } as MpcStatus;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch); mocks.session.mockResolvedValue(null); mocks.prepare.mockResolvedValue(device); mocks.read.mockResolvedValue(device); mocks.block.mockReturnValue(null);
    localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());
it.each(['closed', 'ticket-pending', 'upload-pending', 'device-pending', 'legacy'])('checks %s before key creation or approval', async state => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ enabled: state !== 'closed', payment: state.endsWith('pending') ? { ...payment, purpose: state.split('-')[0] } : null }));
    if (state === 'legacy') mocks.block.mockReturnValue('signing_already_started');
    await expect(prepareDeviceRecovery(input, new AbortController().signal)).rejects.toThrow(); expect(mocks.prepare).not.toHaveBeenCalled();
});
it('prepares without approval; checks the existing device again before and after explicit approval', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ enabled: true, payment: null })).mockResolvedValueOnce(Response.json({ review }));
    const signal = new AbortController().signal;
    expect(await prepareDeviceRecovery(input, signal)).toEqual(review);
    const authorize = vi.fn().mockResolvedValue('private-token'), onSubmit = vi.fn();
    mocks.fetch.mockResolvedValueOnce(Response.json({ enabled: true, payment: null })).mockResolvedValueOnce(Response.json({ payment }));
    await approveDeviceRecovery(review, authorize, signal, onSubmit);
    expect(authorize).toHaveBeenCalledExactlyOnceWith(review.transaction); expect(onSubmit).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce(); expect(mocks.read).toHaveBeenCalledTimes(3);
});
it('account switch or missing/replaced key during approval cannot submit or generate another key', async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ enabled: true, payment: null }));
    const controller = new AbortController();
    await expect(approveDeviceRecovery(review, async () => { controller.abort(); return 'token'; }, controller.signal, vi.fn())).rejects.toThrow();
    const onSubmit = vi.fn();
    await expect(approveDeviceRecovery(review, async () => { mocks.read.mockResolvedValue(null); return 'token'; }, new AbortController().signal, onSubmit)).rejects.toThrow('device_changed');
    expect(onSubmit).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
});
it('reload/status never sends; explicit continuation is bound to account/video/key and cannot resend a submitted operation', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ enabled: true, payment })); await deviceStatus();
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).action).toBe('status');
    const signal = new AbortController().signal;
    await expect(continueDeviceRecovery(payment, { ...input, accountId: 'wrong' }, signal)).rejects.toThrow();
    mocks.read.mockResolvedValueOnce(null);
    await expect(continueDeviceRecovery(payment, input, signal)).rejects.toThrow('device_changed');
    mocks.fetch.mockResolvedValueOnce(Response.json({ payment: { ...payment, state: 'DEVICE_SUBMITTED' } }));
    await continueDeviceRecovery(payment, input, signal);
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({ action: 'execute', operationId: payment.operationId });
    await continueDeviceRecovery({ ...payment, state: 'DEVICE_SUBMITTED' }, input, signal);
    expect(mocks.fetch).toHaveBeenCalledTimes(2); expect(mocks.prepare).not.toHaveBeenCalled();
    expect(isMpcSettled({ ...payment, state: 'DEVICE_SETTLED' })).toBe(true);
});

it('an already active device retries playback without a key change, review or approval', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ enabled: true, payment: null }));
    mocks.session.mockResolvedValue({ certificate: {} });
    expect(await prepareDeviceRecovery(input, new AbortController().signal)).toBeNull();
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.fetch).toHaveBeenCalledOnce();
});
