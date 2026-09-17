import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { actions } from 'near-api-js';
import { createHash } from 'node:crypto';
import type { NearWalletBase } from '@hot-labs/near-connect';
import type { createNearAuthLab } from '@/lib/near-auth-lab';
import { createGoogleUploadWallet } from '@/lib/near-auth-upload-wallet';
import { PINNED_WALLET_MANIFEST } from '@/lib/pinned-wallet-manifest';

vi.unmock('near-api-js');
const state = vi.hoisted(() => ({ device: vi.fn(), suspend: vi.fn().mockResolvedValue(undefined), cleared: undefined as undefined | (() => void) }));
vi.mock('@/lib/device-session', () => ({ preparePlaybackDevice: state.device, suspendDeviceSession: state.suspend,
    onDeviceSessionCleared: (listener: () => void) => { state.cleared = listener; return () => { state.cleared = undefined; }; } }));
vi.mock('@/lib/wallet-account', () => ({ selectedWalletAccount: () => ({ accountId: 'sponsor.testnet' }) }));
const originalConfirm = window.confirm;
const ACCOUNT = 'ab'.repeat(32);
const USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const device = { session_public_key: 'ed25519:synthetic-device', certificate_sha256: 'a'.repeat(64), authorization_duration_ms: '2592000000' };
const send = vi.fn(); const google = vi.fn(); const network = vi.fn(); const confirm = vi.fn();
const sponsor = { accountId: 'sponsor.testnet', wallet: { manifest: PINNED_WALLET_MANIFEST.wallets[0],
    getAccounts: vi.fn(), signAndSendTransaction: send } as unknown as NearWalletBase };
const auth = { requestSigningAuthorization: google } as unknown as ReturnType<typeof createNearAuthLab>;
const input = () => ({ blockHeightTtl: 200, delegateActions: [{ receiverId: USDC,
    actions: [actions.functionCall('ft_transfer_call', { synthetic: 'args' }, 100000000000000n, 1n)] }] });

it('suspends playback when the Google upload account check returns 401', async () => {
    network.mockResolvedValueOnce(Response.json({ error: 'session_required' }, { status: 401 }));
    const wallet = createGoogleUploadWallet(ACCOUNT, sponsor, auth, new AbortController().signal);
    await expect(wallet.getAccounts!()).rejects.toThrow('session_expired');
    expect(state.suspend).toHaveBeenCalledOnce(); expect(send).not.toHaveBeenCalled(); expect(google).not.toHaveBeenCalled();
});
let failure: string;
beforeEach(() => {
    failure = ''; state.device.mockReset().mockResolvedValue(device); state.cleared = undefined;
    send.mockReset().mockResolvedValue({ transaction: { hash: '3'.repeat(44) } }); google.mockReset().mockResolvedValue('synthetic-token');
    confirm.mockReset().mockReturnValue(true); window.confirm = confirm;
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: unknown, callback: (value: object) => unknown) => callback({}) } });
    network.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
        if (url === '/api/auth-lab/account') return Response.json({ implicitAccount: failure === 'account' ? 'cd'.repeat(32) : ACCOUNT, accounts: [ACCOUNT] });
        expect(url).toBe('/api/auth-lab/signing');
        const body = JSON.parse(init.body as string);
        if (body.action === 'prepare-upload') return Response.json({ ticket: 'synthetic-ticket', accountId: ACCOUNT, sponsor: 'sponsor.testnet',
            jobId: 'lp-synthetic', title: 'Synthetic upload', sourceBytes: '9452298', priceUsdc: '2000000', totalFeeUsdc: '600000', playbackSession: device,
            delegate: [1, 2, 3], expiresAt: failure === 'expired' ? 1 : Date.now() + 120000 });
        if (body.action === 'authorize-upload') return ['authorization', 'oversized-token'].includes(failure)
            ? Response.json({ error: 'signing_check_failed', reason: failure === 'oversized-token' ? 'invalid_approval' : 'authorization_expired', action: body.action }, { status: 422 })
            : Response.json({ receiverId: 'fast-auth.testnet', actions: [], approvalExpiresAtMs: Date.now() + 60_000 });
        if (body.action === 'complete-upload') {
            if (failure === 'logout') state.cleared?.();
            if (failure === 'completion') return Response.json({ error: 'signing_check_failed' }, { status: 422 });
            if (failure === 'completion-expired') return Response.json({ error: 'signing_check_failed', action: body.action, reason: 'authorization_expired' }, { status: 422 });
            return Response.json({ accountId: ACCOUNT, jobId: 'lp-synthetic', signedDelegate: 'synthetic-signed-delegate' });
        }
        throw new Error('unexpected_request');
    });
    vi.stubGlobal('fetch', network);
});
afterEach(() => { window.confirm = originalConfirm; vi.unstubAllGlobals(); });

it('waits for the user, uses delegateAction approval, and returns proof to the existing uploader without submitting an upload', async () => {
    const wallet = createGoogleUploadWallet(ACCOUNT, sponsor, auth, new AbortController().signal);
    expect(send).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled(); expect(google).not.toHaveBeenCalled();
    await expect(wallet.signDelegateActions!(input())).resolves.toEqual({ signedDelegateActions: ['synthetic-signed-delegate'] });
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('0,35 test NEAR'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('0.600000 test USDC'));
    expect(google).toHaveBeenCalledWith([1, 2, 3], 'delegateAction');
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).not.toHaveProperty('approvalExpiresAtMs');
    expect(JSON.parse(localStorage.getItem(`youtick:auth-lab:upload:testnet:market.testnet:${ACCOUNT}:lp-synthetic`)!)).toEqual({
        accountId: ACCOUNT, sponsor: 'sponsor.testnet', jobId: 'lp-synthetic', state: 'mpc_verified', outerHash: '3'.repeat(44),
        delegateSha256: createHash('sha256').update(new Uint8Array([1, 2, 3])).digest('hex'),
    });
    await expect(wallet.signDelegateActions!(input())).rejects.toThrow('signing_already_started');
    expect(send).toHaveBeenCalledOnce(); expect(google).toHaveBeenCalledOnce();
    expect(network.mock.calls.every(([url]) => url.startsWith('/api/auth-lab/'))).toBe(true);
});

it.each(['cancel', 'account', 'device', 'expired', 'signal'])('does not charge the sponsor after %s', async (reason) => {
    failure = reason;
    if (reason === 'cancel') confirm.mockReturnValue(false);
    if (reason === 'device') state.device.mockResolvedValue({ ...device, certificate_sha256: 'b'.repeat(64) });
    const controller = new AbortController(); if (reason === 'signal') controller.abort();
    const wallet = createGoogleUploadWallet(ACCOUNT, sponsor, auth, controller.signal);
    await expect(wallet.signDelegateActions!(input())).rejects.toThrow();
    expect(send).not.toHaveBeenCalled(); expect(google).not.toHaveBeenCalled();
});

it.each(['wallet', 'completion', 'completion-expired', 'logout'])('does not re-sign after uncertain %s', async (reason) => {
    failure = reason; if (reason === 'wallet') send.mockRejectedValue(new Error('unknown'));
    const wallet = createGoogleUploadWallet(ACCOUNT, sponsor, auth, new AbortController().signal);
    await expect(wallet.signDelegateActions!(input())).rejects.toThrow(reason === 'completion-expired'
        ? 'google_upload_completion_expired' : reason === 'wallet' ? 'outer_unknown' : 'google_upload_completion_pending');
    await expect(wallet.signDelegateActions!(input())).rejects.toThrow('signing_already_started');
    expect(send).toHaveBeenCalledOnce();
    const saved = localStorage.getItem(`youtick:auth-lab:upload:testnet:market.testnet:${ACCOUNT}:lp-synthetic`)!;
    expect(JSON.parse(saved).state).toBe(reason === 'wallet' ? 'outer_pending' : 'outer_submitted');
    expect(saved).not.toMatch(/synthetic-token|synthetic-ticket|synthetic-signed-delegate/);
});

it('retains the server rejection reason after Google approval without charging the sponsor', async () => {
    failure = 'authorization';
    const wallet = createGoogleUploadWallet(ACCOUNT, sponsor, auth, new AbortController().signal);
    await expect(wallet.signDelegateActions!(input())).rejects.toThrow('signing_check_failed: authorize-upload / authorization_expired');
    expect(google).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    expect(localStorage.getItem(`youtick:auth-lab:upload:testnet:market.testnet:${ACCOUNT}:lp-synthetic`)).toBeNull();
});

it('rejects unrelated calls, wrong TTL, receivers and extra actions', async () => {
    const wallet = createGoogleUploadWallet(ACCOUNT, sponsor, auth, new AbortController().signal);
    await expect(wallet.signAndSendTransaction({ receiverId: USDC, actions: [] })).rejects.toThrow('google_upload_action_unsupported');
    for (const failure of ['ttl', 'receiver', 'extra-action']) {
        const value = input();
        if (failure === 'ttl') value.blockHeightTtl = 201;
        if (failure === 'receiver') value.delegateActions[0].receiverId = 'other.testnet';
        if (failure === 'extra-action') value.delegateActions[0].actions.push(actions.transfer(1n));
        await expect(wallet.signDelegateActions!(value)).rejects.toThrow('invalid_upload_action');
    }
    expect(network).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

it.each([undefined, 0, 'invalid', Date.now() - 1])('rejects invalid or expired server approval time %s before a sponsor call', async (expiry) => {
    const fetch = network.getMockImplementation()!;
    network.mockImplementation(async (url, init) => {
        if (JSON.parse(init.body || '{}').action === 'authorize-upload') {
            return Response.json({ receiverId: 'fast-auth.testnet', actions: [], approvalExpiresAtMs: expiry });
        }
        return fetch(url, init);
    });
    const wallet = createGoogleUploadWallet(ACCOUNT, sponsor, auth, new AbortController().signal);
    await expect(wallet.signDelegateActions!(input())).rejects.toThrow('authorization_expired');
    expect(send).not.toHaveBeenCalled();
});

it.each(['token', 'review'])('rechecks %s time after awaiting the selected sponsor', async (expiry) => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const accounts = vi.mocked(sponsor.wallet.getAccounts);
    accounts.mockImplementationOnce(async () => { clock.mockReturnValue(start + (expiry === 'token' ? 61_000 : 121_000)); return []; });
    try {
        const wallet = createGoogleUploadWallet(ACCOUNT, sponsor, auth, new AbortController().signal);
        await expect(wallet.signDelegateActions!(input())).rejects.toThrow(expiry === 'token' ? 'authorization_expired' : 'review_expired');
        expect(send).not.toHaveBeenCalled();
        expect(localStorage.getItem(`youtick:auth-lab:upload:testnet:market.testnet:${ACCOUNT}:lp-synthetic`)).toBeNull();
    } finally { clock.mockRestore(); }
});

it('holds the signing lock across a pending sponsor call and refuses a second tab/click', async () => {
    let held = false;
    vi.stubGlobal('navigator', { locks: { request: async (_key: string, _options: unknown, run: (lock: object | null) => unknown) => {
        if (held) return run(null);
        held = true;
        try { return await run({}); } finally { held = false; }
    } } });
    let finish!: (value: unknown) => void;
    send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const wallet = createGoogleUploadWallet(ACCOUNT, sponsor, auth, new AbortController().signal);
    const first = wallet.signDelegateActions!(input());
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    await expect(wallet.signDelegateActions!(input())).rejects.toThrow('signing_already_started');
    finish({ transaction: { hash: '3'.repeat(44) } });
    await first;
    expect(google).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledOnce();
});

it('does not create an attempt or charge when the server rejects the token size', async () => {
    failure='oversized-token'; google.mockResolvedValue('x'.repeat(7169));
    const wallet=createGoogleUploadWallet(ACCOUNT,sponsor,auth,new AbortController().signal);
    await expect(wallet.signDelegateActions!(input())).rejects.toThrow('signing_check_failed: authorize-upload / invalid_approval');
    expect(send).not.toHaveBeenCalled();
    expect(localStorage.getItem(`youtick:auth-lab:upload:testnet:market.testnet:${ACCOUNT}:lp-synthetic`)).toBeNull();
});
