import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProductUploadWallet, continueUploadPayment, uploadStatus } from '@/lib/near-auth-upload-client';
import { googleUploadAttemptKey, productUploadAttemptKey } from '@/lib/near-auth-upload-attempt';
const mocks = vi.hoisted(() => ({ account: vi.fn(), device: vi.fn(), guard: vi.fn(), resume: vi.fn(), authorize: vi.fn(), fetch: vi.fn(),
    cleared: undefined as undefined | (() => void) }));
vi.mock('@/lib/near-auth-product', () => ({ readProductAccount: mocks.account }));
vi.mock('@/lib/device-session', () => ({ preparePlaybackDevice: mocks.device, onDeviceSessionCleared: (fn: () => void) => { mocks.cleared = fn; return () => {}; } }));
vi.mock('@/lib/livepeer-upload', () => ({ assertLivepeerUploadDraftReady: mocks.guard, resumeSponsoredUploadPayment: mocks.resume }));
vi.mock('@/lib/constants', () => ({ NEAR_CONFIG: { marketContractId: 'market.testnet', usdcContractId: 'usdc.testnet' } }));
const accountId = 'a'.repeat(64), jobId = 'lp-product', operationId = 'b'.repeat(64);
const device = { session_public_key: 'ed25519:synthetic', certificate_sha256: 'c'.repeat(64), authorization_duration_ms: '2592000000' };
const expected = { creator_id: accountId, job_id: jobId, title: 'Video', price_usdc: '2000000', expected_source_bytes: '5' };
let review: Record<string, unknown>, payment: Record<string, unknown> | null, enabled: boolean, submitted: number;
const input = () => ({ blockHeightTtl: 200, delegateActions: [{ receiverId: 'usdc.testnet', actions: [{ functionCall: {
    methodName: 'ft_transfer_call', gas: 100000000000000n, deposit: 1n,
    args: new TextEncoder().encode(JSON.stringify({ receiver_id: 'market.testnet', amount: '600000', msg: JSON.stringify(expected) })),
} }] }] });
const wallet = (signal = new AbortController().signal) => createProductUploadWallet(accountId, mocks.authorize, signal);
beforeEach(async () => {
    vi.clearAllMocks(); localStorage.clear(); submitted = 0; payment = null; enabled = true;
    mocks.account.mockResolvedValue({ accountId, accountReady: true }); mocks.device.mockResolvedValue(device);
    mocks.guard.mockReturnValue(undefined); mocks.authorize.mockResolvedValue('private-approval'); mocks.resume.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: object, callback: (lock: object) => unknown) => callback({}) } });
    window.confirm = vi.fn().mockReturnValue(true);
    review = { accountId, jobId, title: 'Video', sourceBytes: '5', priceUsdc: '2000000', totalFeeUsdc: '600000',
        delegate: [1, 2, 3], playbackSession: device, expiresAt: Date.now() + 60000, ticket: 'private-review' };
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([1, 2, 3]))), n => n.toString(16).padStart(2, '0')).join('');
    mocks.fetch.mockImplementation(async (_url, init) => {
        const body = JSON.parse(init.body);
        if (body.action === 'prepare') return Response.json({ review });
        if (body.action === 'submit') {
            submitted++;
            payment = { network: 'testnet', market: 'market.testnet', accountId, purpose: 'upload', resourceId: jobId, operationId,
                state: 'MPC_VERIFIED', payloadHash: hash, amountUsdc: '600000', upload: { request: expected, playbackSession: device, signedDelegateBase64: 'approved-delegate' } };
            return Response.json({ payment });
        }
        if (body.action === 'status') return Response.json({ enabled, payment });
        throw new Error('unexpected_action');
    });
    vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('reviews exact upload, requests delegate approval and returns only the persisted MPC signature', async () => {
    expect(await wallet().signDelegateActions!(input() as never)).toEqual({ signedDelegateActions: ['approved-delegate'] });
    expect(mocks.authorize).toHaveBeenCalledWith([1, 2, 3]); expect(submitted).toBe(1);
    const saved = localStorage.getItem(productUploadAttemptKey('market.testnet', accountId, jobId))!;
    expect(saved).toContain('payloadHash'); expect(saved).not.toMatch(/private-approval|private-review|approved-delegate/);
    expect(mocks.resume).not.toHaveBeenCalled();
});
it.each(['lab', 'product', 'pending', 'closed', 'draft', 'cancel', 'device', 'amount', 'account', 'abort'])('stops before submit on %s', async reason => {
    const controller = new AbortController();
    if (reason === 'lab' || reason === 'product') localStorage.setItem((reason === 'lab' ? googleUploadAttemptKey : productUploadAttemptKey)('market.testnet', accountId, jobId), 'preserved');
    if (reason === 'pending') payment = { state: 'SUBMITTED' };
    if (reason === 'closed') enabled = false;
    if (reason === 'draft') mocks.guard.mockImplementation(() => { throw new Error('livepeer_draft_missing'); });
    if (reason === 'cancel') vi.mocked(window.confirm).mockReturnValue(false);
    if (reason === 'device') mocks.device.mockResolvedValue({ ...device, certificate_sha256: 'changed' });
    if (reason === 'amount') review.totalFeeUsdc = '900000';
    if (reason === 'account') mocks.account.mockResolvedValue({ accountId: 'b'.repeat(64), accountReady: true });
    if (reason === 'abort') mocks.authorize.mockImplementation(async () => { controller.abort(); return 'private-approval'; });
    await expect(wallet(controller.signal).signDelegateActions!(input() as never)).rejects.toThrow();
    expect(submitted).toBe(0); expect(mocks.resume).not.toHaveBeenCalled();
    if (reason === 'lab') expect(localStorage.getItem(googleUploadAttemptKey('market.testnet', accountId, jobId))).toBe('preserved');
});
it('lost submit reply keeps the attempt and recovery uses status, not another review/approval', async () => {
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (url, init) => { const response = await original(url, init); if (JSON.parse(init.body).action === 'submit') throw new Error('lost reply'); return response; });
    await expect(wallet().signDelegateActions!(input() as never)).rejects.toThrow('lost reply');
    await expect(wallet().signDelegateActions!(input() as never)).rejects.toThrow('mpc_pending');
    const calls = mocks.fetch.mock.calls.length;
    await continueUploadPayment(accountId, operationId, new AbortController().signal);
    expect(mocks.fetch.mock.calls.slice(calls).map(([, init]) => JSON.parse(init.body).action)).toEqual(['status']);
    expect(mocks.resume).toHaveBeenCalledOnce(); expect(submitted).toBe(1); expect(mocks.authorize).toHaveBeenCalledOnce();
});
it('flag-off status is read-only and continuation rejects wrong operation, account and disabled sends', async () => {
    await wallet().signDelegateActions!(input() as never); enabled = false;
    await uploadStatus(); expect(mocks.resume).not.toHaveBeenCalled();
    await expect(continueUploadPayment(accountId, operationId, new AbortController().signal)).rejects.toThrow('mpc_pending');
    enabled = true;
    await expect(continueUploadPayment(accountId, 'c'.repeat(64), new AbortController().signal)).rejects.toThrow('account_changed');
    payment!.accountId = 'd'.repeat(64);
    await expect(continueUploadPayment(accountId, operationId, new AbortController().signal)).rejects.toThrow('account_changed');
    expect(mocks.resume).not.toHaveBeenCalled(); expect(submitted).toBe(1);
});
it('device removal during approval prevents submission and never stores the token', async () => {
    mocks.authorize.mockImplementation(async () => { mocks.cleared!(); return 'private-approval'; });
    await expect(wallet().signDelegateActions!(input() as never)).rejects.toThrow(); expect(submitted).toBe(0);
    expect(localStorage.getItem(productUploadAttemptKey('market.testnet', accountId, jobId))).toBeNull();
});
it('no arbitrary wallet send or changed delegate action is supported', async () => {
    await expect(wallet().signAndSendTransaction({} as never)).rejects.toThrow('google_upload_action_unsupported');
    const bad = input(); bad.delegateActions[0].actions[0].functionCall.deposit = 2n;
    await expect(wallet().signDelegateActions!(bad as never)).rejects.toThrow('invalid_upload_action'); expect(mocks.fetch).not.toHaveBeenCalled();
});
