import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletInstance } from '@/lib/types';

const state = vi.hoisted(() => ({
    flags: { publicTestnetVideoV1: true, enablePlaybackAuthorizerV2: true },
    prepare: vi.fn(), session: vi.fn(), publication: vi.fn(), entitlement: vi.fn(), view: vi.fn(),
    cleared: undefined as undefined | (() => void),
}));
vi.mock('@/lib/constants', () => ({ FEATURE_FLAGS: state.flags, GAS_CONSTANTS: { mediumGas: 100_000_000_000_000n }, NEAR_CONFIG: { marketContractId: 'market.testnet' } }));
vi.mock('@/lib/device-session', () => ({
    preparePlaybackDevice: state.prepare, getDeviceSession: state.session,
    onDeviceSessionCleared: (listener: () => void) => { state.cleared = listener; return () => { state.cleared = undefined; }; },
}));
vi.mock('@/lib/livepeer-publication', () => ({ readLivepeerPublication: state.publication, hasLivepeerEntitlement: state.entitlement }));
vi.mock('@/lib/near', () => ({ getProvider: () => ({}), viewContract: state.view }));

import { activatePlaybackDevice } from '@/lib/playback-device-activation';

const input = { accountId: 'buyer.testnet', jobId: 'job-1', generation: 1, playbackId: 'playback-1' };
const authorization = { session_public_key: 'ed25519:device', certificate_sha256: 'a'.repeat(64), authorization_duration_ms: '2592000000' };
const session = { certificate: { session_public_key: authorization.session_public_key } };
let wallet: WalletInstance;

describe('explicit playback device transaction', () => {
    beforeEach(() => {
        vi.useFakeTimers(); vi.resetAllMocks();
        state.flags.publicTestnetVideoV1 = state.flags.enablePlaybackAuthorizerV2 = true;
        state.prepare.mockResolvedValue(authorization);
        state.session.mockResolvedValue(session);
        state.publication.mockResolvedValue({ generation: 1, playback_id: input.playbackId, availability: 'SALES_SUSPENDED' });
        state.entitlement.mockResolvedValue(true);
        state.view.mockResolvedValue({ bridge_frozen: false, new_purchases_paused: true });
        wallet = { getAccounts: vi.fn().mockResolvedValue([{ accountId: input.accountId }]), signAndSendTransaction: vi.fn().mockResolvedValue({}), signAndSendTransactions: vi.fn() };
    });
    afterEach(() => vi.useRealTimers());

    it('sends exactly one Market activation with 1 yocto, without purchasing again', async () => {
        await activatePlaybackDevice(wallet, input, new AbortController().signal);
        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
        const transaction = vi.mocked(wallet.signAndSendTransaction).mock.calls[0][0];
        expect(transaction.receiverId).toBe('market.testnet');
        expect(transaction.actions).toHaveLength(1);
        expect(transaction.actions[0]).toMatchObject({
            methodName: 'activate_playback_device', gas: 100_000_000_000_000n, deposit: 1n,
            args: { publication_id: input.jobId, playback_session: authorization },
        });
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
        expect(state.session).toHaveBeenCalledWith(input.accountId);
    });

    it('reconciles a missing wallet reply using the same device, with no second transaction', async () => {
        vi.mocked(wallet.signAndSendTransaction).mockRejectedValue(new Error('reply_lost'));
        state.session.mockResolvedValueOnce(null).mockResolvedValue(session);
        const result = activatePlaybackDevice(wallet, input, new AbortController().signal);
        await vi.runAllTimersAsync();
        await expect(result).resolves.toBeUndefined();
        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
        expect(state.prepare).toHaveBeenCalledOnce();
        expect(state.session).toHaveBeenCalledTimes(2);
    });

    it('keeps an unresolved result pending instead of blindly resubmitting', async () => {
        state.session.mockResolvedValue(null);
        const result = activatePlaybackDevice(wallet, input, new AbortController().signal);
        const rejected = expect(result).rejects.toThrow('device_activation_pending');
        await vi.runAllTimersAsync(); await rejected;
        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
        expect(state.session).toHaveBeenCalledTimes(5);
    });

    it.each(['unpaid', 'takedown', 'generation', 'frozen', 'account', 'disabled', 'preparation logout'])('does not open the wallet for %s', async problem => {
        if (problem === 'unpaid') state.entitlement.mockResolvedValue(false);
        if (problem === 'takedown') state.publication.mockResolvedValue({ generation: 1, playback_id: input.playbackId, availability: 'TAKEDOWN' });
        if (problem === 'generation') state.publication.mockResolvedValue({ generation: 2, playback_id: input.playbackId, availability: 'ACTIVE' });
        if (problem === 'frozen') state.view.mockResolvedValue({ bridge_frozen: true });
        if (problem === 'account') vi.mocked(wallet.getAccounts!).mockResolvedValueOnce([{ accountId: input.accountId }]).mockResolvedValue([{ accountId: 'other.testnet' }]);
        if (problem === 'disabled') state.flags.publicTestnetVideoV1 = false;
        if (problem === 'preparation logout') state.prepare.mockImplementation(async () => { state.cleared?.(); return authorization; });
        await expect(activatePlaybackDevice(wallet, input, new AbortController().signal)).rejects.toThrow();
        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
    });

    it('rejects a late wallet completion after logout', async () => {
        let finish!: () => void;
        vi.mocked(wallet.signAndSendTransaction).mockImplementation(() => new Promise(resolve => { finish = () => resolve({}); }));
        const result = activatePlaybackDevice(wallet, input, new AbortController().signal);
        const rejected = expect(result).rejects.toThrow();
        await vi.waitFor(() => expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce());
        state.cleared?.(); finish(); await rejected;
        expect(state.session).not.toHaveBeenCalled();
    });
});
