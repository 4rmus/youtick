import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NearWalletBase } from '@hot-labs/near-connect';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PINNED_WALLET_MANIFEST } from '@/lib/pinned-wallet-manifest';
import { prepareGooglePurchase, runGoogleSigning, signingApi, signingAttemptKey, reviewAttemptKey, type SigningReview } from '@/lib/near-auth-signing';
import { NearAuthSigning } from '@/components/NearAuthSigning';
import { createNearAuthLab } from '@/lib/near-auth-lab';

const selection = vi.hoisted(() => ({ accountId: 'sponsor.testnet' }));
const device = vi.hoisted(() => ({ prepare: vi.fn(), suspend: vi.fn().mockResolvedValue(undefined), cleared: undefined as undefined | (() => void) }));
vi.mock('@/lib/wallet-account', () => ({ selectedWalletAccount: () => ({ accountId: selection.accountId }) }));
vi.mock('@/lib/device-session', () => ({ preparePlaybackDevice: device.prepare, suspendDeviceSession: device.suspend,
    onDeviceSessionCleared: (listener: () => void) => { device.cleared = listener; return () => { device.cleared = undefined; }; } }));
vi.mock('@/lib/constants', async (load) => ({ ...await load<typeof import('@/lib/constants')>(),
    FEATURE_FLAGS: { publicTestnetVideoV1: true, enablePlaybackAuthorizerV2: true } }));
const send = vi.fn();
const network = vi.fn();

it.each(['signing', 'purchase'])('suspends existing playback when the %s preflight returns 401', async action => {
    network.mockResolvedValueOnce(Response.json({ error: 'session_required' }, { status: 401 }));
    await expect(action === 'signing' ? signingApi({ action: 'prepare' }) : prepareGooglePurchase('video-1', 'sponsor.testnet'))
        .rejects.toThrow('session_expired');
    expect(device.suspend).toHaveBeenCalledOnce(); expect(send).not.toHaveBeenCalled();
});
it.each(['authorize', 'complete'])('distinguishes pre-payment expiry from uncertain completion: %s', async action => {
    network.mockResolvedValueOnce(Response.json({ error: 'signing_check_failed', action, reason: 'authorization_expired' }, { status: 422 }));
    await expect(signingApi({ action })).rejects.toThrow(action === 'authorize' ? 'authorization_expired' : 'signing_check_failed');
    expect(send).not.toHaveBeenCalled();
});
const wallet = { manifest: PINNED_WALLET_MANIFEST.wallets[0], getAccounts: vi.fn(async () => []), signAndSendTransaction: send } as unknown as NearWalletBase;
let review: SigningReview;
let locked: boolean;
let failure: string;
beforeEach(() => {
    locked = false; failure = ''; selection.accountId = 'sponsor.testnet';
    device.prepare.mockReset(); device.cleared = undefined;
    review = { ticket: 'synthetic-ticket', accountId: '00'.repeat(32), sponsor: 'sponsor.testnet', publicKey: 'ed25519:synthetic',
        transaction: [1, 2, 3], transactionHash: '4'.repeat(44), expiresAt: Date.now() + 300000 };
    send.mockReset().mockResolvedValue({ transaction: { hash: '3'.repeat(44) } });
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) => {
        if (locked) return callback(null); locked = true;
        try { return await callback({}); } finally { locked = false; }
    } } });
    network.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
        if (url === '/api/auth-lab/account') return Response.json({ implicitAccount: review.accountId, accounts: [review.accountId] });
        const body = JSON.parse(init.body as string);
        if (url === 'https://test.rpc.fastnear.com/') {
            if (failure === 'broadcast') throw new Error('timeout');
            expect(body.method).toBe('broadcast_tx_commit');
            expect(body.params).toEqual(['synthetic-signed-transaction']);
            return Response.json({ result: {} });
        }
        expect(url).toBe('/api/auth-lab/signing');
        if (body.action === 'prepare-purchase') {
            expect(body).toEqual({ action: 'prepare-purchase', sponsor: 'sponsor.testnet', publicationId: 'video-1', playbackSession: review.purchase!.playbackSession });
            return Response.json({ ...review, ...(failure === 'changed-session-account' ? { accountId: 'ff'.repeat(32) } : {}) });
        }
        if (body.action === failure) return Response.json({ error: 'signing_check_failed' }, { status: 422 });
        if (body.action === 'authorize') return Response.json({ approvalExpiresAtMs: Date.now()+60_000, receiverId: 'fast-auth.testnet', actions: [{ type: 'FunctionCall', params: { methodName: 'sign' } }] });
        if (body.action === 'complete' && failure === 'logout') device.cleared?.();
        if (body.action === 'complete') return Response.json({ signedTransaction: 'synthetic-signed-transaction',
            transactionHash: review.transactionHash, accountId: review.accountId });
        if (body.action === 'verify') return Response.json({ verified: true, transactionHash: review.transactionHash });
        throw new Error('unexpected_action');
    });
    vi.stubGlobal('fetch', network);
});

function ticketReview() {
    review.purchase = { marketContractId: 'market.testnet', usdcContractId: '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af',
        publicationId: 'video-1', priceUsdc: '2000000', title: 'Synthetic video', playbackSession: {
            session_public_key: 'ed25519:device', certificate_sha256: 'a'.repeat(64), authorization_duration_ms: '2592000000' } };
    device.prepare.mockImplementation(async () => ({ ...review.purchase!.playbackSession }));
}

it('prepares the existing local device for the server-derived account without opening a signing request', async () => {
    ticketReview();
    expect(await prepareGooglePurchase('video-1', 'sponsor.testnet')).toEqual(review);
    expect(device.prepare).toHaveBeenCalledWith(review.accountId);
    expect(send).not.toHaveBeenCalled();
    expect(network.mock.calls.filter(([url]) => url === 'https://test.rpc.fastnear.com/')).toHaveLength(0);
});

it('rejects preparation if the server session account changed', async () => {
    ticketReview(); failure = 'changed-session-account';
    await expect(prepareGooglePurchase('video-1', 'sponsor.testnet')).rejects.toThrow('account_changed');
    expect(send).not.toHaveBeenCalled();
});

it('preserves the completed transfer lock and allows only one separate ticket attempt', async () => {
    ticketReview();
    const oldKey = signingAttemptKey(review.accountId);
    localStorage.setItem(oldKey, '{"state":"verified","innerHash":"old-hash"}');
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).resolves.toMatchObject({ verified: true });
    expect(localStorage.getItem(oldKey)).toBe('{"state":"verified","innerHash":"old-hash"}');
    expect(JSON.parse(localStorage.getItem(reviewAttemptKey(review))!).state).toBe('verified');
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow('signing_already_started');
    expect(send).toHaveBeenCalledOnce();
});

it.each(['old-pending', 'device-changed', 'wrong-market', 'logout'])('stops ticket payment/broadcast for %s', async (reason) => {
    ticketReview(); failure = reason;
    if (reason === 'old-pending') localStorage.setItem(signingAttemptKey(review.accountId), '{"state":"outer_pending"}');
    if (reason === 'device-changed') device.prepare.mockResolvedValue({ ...review.purchase!.playbackSession, session_public_key: 'ed25519:other' });
    if (reason === 'wrong-market') review.purchase!.marketContractId = 'other.testnet';
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(reason === 'logout' ? 1 : 0);
    expect(network.mock.calls.filter(([url]) => url === 'https://test.rpc.fastnear.com/')).toHaveLength(0);
});

it('shows purchase budgets without opening Google or a wallet on render', () => {
    const html = renderToStaticMarkup(createElement(NearAuthSigning, { auth: createNearAuthLab('synthetic-client'), publicationId: 'video-1' }));
    expect(html).toContain('0,12'); expect(html).toContain('test USDC'); expect(html).toContain('ilk cihazı');
    expect(send).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled(); expect(device.prepare).not.toHaveBeenCalled();
});
afterEach(() => { vi.unstubAllGlobals(); });

it('renders the disclosure and budgets without automatically requesting approval or payment', () => {
    const html = renderToStaticMarkup(createElement(NearAuthSigning, { auth: createNearAuthLab('synthetic-client') }));
    expect(html).toContain('0,35 test NEAR'); expect(html).toContain('0,002 test NEAR');
    expect(html).not.toContain('Sponsor onayını aç ve imzalı testi gönder');
    expect(send).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
});

it('requires server validation before one sponsor request and one signed broadcast', async () => {
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).resolves.toMatchObject({ verified: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ signerId: 'sponsor.testnet', network: 'testnet', receiverId: 'fast-auth.testnet' }));
    expect(send.mock.calls[0][0]).not.toHaveProperty('approvalExpiresAtMs');
    expect(network.mock.calls.filter(([url]) => url === 'https://test.rpc.fastnear.com/')).toHaveLength(1);
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow('signing_already_started');
    expect(send).toHaveBeenCalledTimes(1);
});

it.each(['authorize', 'wrong-sponsor', 'expired', 'another-tab'])('does not reach the wallet: %s', async (reason) => {
    failure = reason;
    if (reason === 'wrong-sponsor') selection.accountId = 'another.testnet';
    if (reason === 'expired') review.expiresAt = 1;
    if (reason === 'another-tab') locked = true;
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
});

it.each(['wallet', 'complete', 'broadcast', 'verify'])('blocks retries after an uncertain %s stage', async (reason) => {
    failure = reason;
    if (reason === 'wallet') send.mockRejectedValue(new Error('authorization_expired'));
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow(reason === 'wallet' ? 'outer_unknown' : undefined);
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow('signing_already_started');
    expect(send).toHaveBeenCalledTimes(1);
    expect(network.mock.calls.filter(([url]) => url === 'https://test.rpc.fastnear.com/')).toHaveLength(['broadcast', 'verify'].includes(reason) ? 1 : 0);
});

it.each(['transfer','purchase'])('does not start a sponsor request when %s approval expires while waiting', async kind => {
    for (const expiry of ['token','review']) {
        if(kind==='purchase') ticketReview();
        const start=Date.now(); const clock=vi.spyOn(Date,'now').mockReturnValue(start);
        review.expiresAt=start+(expiry==='review'?30_000:300_000);
        vi.mocked(wallet.getAccounts).mockImplementationOnce(async () => { clock.mockReturnValue(start+(expiry==='review'?31_000:61_000)); return []; });
        try {
            await expect(runGoogleSigning(wallet,review,'synthetic-token')).rejects.toThrow(expiry==='review'?'review_expired':'authorization_expired');
            expect(send).not.toHaveBeenCalled(); expect(localStorage.getItem(reviewAttemptKey(review))).toBeNull();
        } finally { clock.mockRestore(); }
    }
});

it('rechecks expiry after the final device read, not only account selection', async () => {
    ticketReview(); const start=Date.now(); const clock=vi.spyOn(Date,'now').mockReturnValue(start);
    device.prepare.mockImplementationOnce(async () => review.purchase!.playbackSession)
        .mockImplementationOnce(async () => { clock.mockReturnValue(start+61_000); return review.purchase!.playbackSession; });
    try {
        await expect(runGoogleSigning(wallet,review,'synthetic-token')).rejects.toThrow('authorization_expired');
        expect(send).not.toHaveBeenCalled(); expect(localStorage.getItem(reviewAttemptKey(review))).toBeNull();
    } finally { clock.mockRestore(); }
});

it.each([undefined,0,'invalid'])('rejects missing or invalid server approval deadline: %s', async deadline => {
    const read=network.getMockImplementation()!;
    network.mockImplementation(async (url,init) => JSON.parse(init.body as string).action==='authorize'
        ? Response.json({approvalExpiresAtMs:deadline,receiverId:'fast-auth.testnet',actions:[]}) : read(url,init));
    await expect(runGoogleSigning(wallet,review,'synthetic-token')).rejects.toThrow('authorization_expired');
    expect(send).not.toHaveBeenCalled(); expect(localStorage.getItem(reviewAttemptKey(review))).toBeNull();
});
