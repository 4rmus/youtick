import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NearWalletBase } from '@hot-labs/near-connect';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PINNED_WALLET_MANIFEST } from '@/lib/pinned-wallet-manifest';
import { prepareGooglePurchase, runGoogleSigning, signingApi, signingPreparationMessage, signingAttemptKey, reviewAttemptKey, type SigningReview } from '@/lib/near-auth-signing';
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

it.each(['ticket_balance_required', 'ticket_first_device_only', 'ticket_not_available', 'budget_not_verified'])('preserves the safe purchase preparation reason: %s', async reason => {
    network.mockResolvedValueOnce(Response.json({ error: 'signing_check_failed', action: 'prepare-purchase', reason }, { status: 422 }));
    await expect(signingApi({ action: 'prepare-purchase' })).rejects.toThrow(`signing_check_failed: prepare-purchase / ${reason}`);
    expect(signingPreparationMessage(`signing_check_failed: prepare-purchase / ${reason}`)).toContain(reason);
    expect(send).not.toHaveBeenCalled();
});

it.each(['PRIVATE_TOKEN', 'ticket_balance_required PRIVATE_TOKEN', '__proto__', 'constructor'])('does not display an unrecognized preparation error: %s', async reason => {
    network.mockResolvedValueOnce(Response.json({ error: 'signing_check_failed', action: 'prepare-purchase', reason }, { status: 422 }));
    await expect(signingApi({ action: 'prepare-purchase' })).rejects.toThrow(/^signing_check_failed$/);
    expect(signingPreparationMessage(reason)).toBe('Hazırlık tamamlanamadı. Yeni ödeme başlatılmadı.');
});

it('explains a blocking record before wallet connection without modifying it', () => {
    ticketReview();
    const key = reviewAttemptKey(review), value = '{"state":"outer_pending"}';
    localStorage.setItem(key, value);
    const html = renderToStaticMarkup(createElement(NearAuthSigning, { auth: createNearAuthLab('synthetic-client'),
        publicationId: 'video-1', accountId: review.accountId }));
    expect(html).toContain('Kontrol kodu: signing_already_started');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Sponsor cüzdanını seç/);
    expect(localStorage.getItem(key)).toBe(value);
    expect(network).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(device.prepare).not.toHaveBeenCalled();
});

it.each([
    [{ stage: 'google_approval', code: 'ERR_JWT_CLAIM_VALIDATION_FAILED', claim: 'fatxn', claimCheck: 'missing', token: 'PRIVATE_TOKEN' },
        'signing_check_failed: authorize-upload / stage=google_approval, code=ERR_JWT_CLAIM_VALIDATION_FAILED, claim=fatxn, claimCheck=missing'],
    [{ stage: 'upload_preflight', code: 'PRIVATE_CODE', claim: 'PRIVATE_CLAIM', claimCheck: 'PRIVATE_REASON', message: 'PRIVATE_MESSAGE' },
        'signing_check_failed: authorize-upload / stage=upload_preflight'],
    [{ stage: 'PRIVATE_STAGE', code: 'PRIVATE_CODE', claim: {}, claimCheck: [] }, 'signing_check_failed'],
])('displays only whitelisted authorization diagnostics: %j', async (diagnostic, expected) => {
    network.mockResolvedValueOnce(Response.json({ error: 'signing_check_failed', reason: 'signing_check_failed', action: 'authorize-upload', diagnostic }, { status: 422 }));
    await expect(signingApi({ action: 'authorize-upload' })).rejects.toThrow(expected as string);
    expect(send).not.toHaveBeenCalled();
});

it('keeps known expiry errors unchanged when diagnostic metadata is present', async () => {
    network.mockResolvedValueOnce(Response.json({ error: 'signing_check_failed', reason: 'authorization_expired', action: 'complete-upload',
        diagnostic: { code: 'ERR_JWT_EXPIRED', claim: 'exp' } }, { status: 422 }));
    await expect(signingApi({ action: 'complete-upload' })).rejects.toThrow('signing_check_failed: complete-upload / authorization_expired');
});

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
    const oldRecord = JSON.stringify({ state: 'verified', innerHash: '2'.repeat(44), outerHash: '3'.repeat(44) });
    localStorage.setItem(oldKey, oldRecord);
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).resolves.toMatchObject({ verified: true });
    expect(localStorage.getItem(oldKey)).toBe(oldRecord);
    expect(JSON.parse(localStorage.getItem(reviewAttemptKey(review))!).state).toBe('verified');
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow('signing_already_started');
    expect(send).toHaveBeenCalledOnce();
});

it('V1 buys a different publication while preserving the completed ticket record', async () => {
    ticketReview();
    await runGoogleSigning(wallet, review, 'synthetic-token');
    const firstKey = reviewAttemptKey(review), firstRecord = localStorage.getItem(firstKey);
    review.purchase!.publicationId = 'video-2'; review.transactionHash = '5'.repeat(44);
    expect(reviewAttemptKey(review)).not.toBe(firstKey);
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).resolves.toMatchObject({ verified: true });
    expect(localStorage.getItem(firstKey)).toBe(firstRecord);
    expect(send).toHaveBeenCalledTimes(2);
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow('signing_already_started');
});

it.each(['legacy', 'other-publication'])('V1 preserves and blocks unresolved records: %s', async kind => {
    ticketReview();
    const prefix = `youtick:auth-lab:ticket:testnet:market.testnet:${review.accountId}`;
    const key = kind === 'legacy' ? prefix : `${prefix}:other-video`;
    for (const value of ['', '{broken', '{}', 'null', '{"state":"verified"}', '{"state":"outer_pending"}', '{"state":"inner_pending"}']) {
        localStorage.setItem(key, value);
        await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow('signing_already_started');
        await expect(prepareGooglePurchase('video-1', 'sponsor.testnet')).rejects.toThrow('signing_already_started');
        expect(localStorage.getItem(key)).toBe(value);
    }
    expect(send).not.toHaveBeenCalled(); expect(device.prepare).not.toHaveBeenCalled();
});

it('V1 allows a new ticket after a complete legacy record without deleting it', async () => {
    ticketReview();
    const key = `youtick:auth-lab:ticket:testnet:market.testnet:${review.accountId}`;
    const value = JSON.stringify({ state: 'verified', outerHash: '3'.repeat(44), innerHash: '4'.repeat(44) });
    localStorage.setItem(key, value);
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).resolves.toMatchObject({ verified: true });
    expect(localStorage.getItem(key)).toBe(value);
});

it('V1 blocks a pending ticket that appears during the last device check', async () => {
    ticketReview();
    const key = `youtick:auth-lab:ticket:testnet:market.testnet:${review.accountId}:other-video`;
    let checks = 0;
    device.prepare.mockImplementation(async () => {
        if (++checks === 2) localStorage.setItem(key, '{"state":"outer_pending"}');
        return review.purchase!.playbackSession;
    });
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow('signing_already_started');
    expect(send).not.toHaveBeenCalled(); expect(localStorage.getItem(reviewAttemptKey(review))).toBeNull();
    expect(localStorage.getItem(key)).toBe('{"state":"outer_pending"}');
});

it('V1 does not send when attempt storage is unreadable', async () => {
    ticketReview();
    const read = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('storage denied'); });
    try {
        await expect(prepareGooglePurchase('video-1', 'sponsor.testnet')).rejects.toThrow('signing_storage_unavailable');
        const html = renderToStaticMarkup(createElement(NearAuthSigning, { auth: createNearAuthLab('synthetic-client'),
            publicationId: 'video-1', accountId: review.accountId }));
        expect(html).toContain('Kontrol kodu: signing_storage_unavailable');
        expect(html).not.toContain('Kontrol kodu: signing_already_started');
        await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow('signing_already_started');
        expect(send).not.toHaveBeenCalled();
    } finally { read.mockRestore(); }
});

it.each(['old-pending', 'device-changed', 'wrong-market', 'logout'])('stops ticket payment/broadcast for %s', async (reason) => {
    ticketReview(); failure = reason;
    if (reason === 'old-pending') localStorage.setItem(reviewAttemptKey(review), '{"state":"outer_pending"}');
    if (reason === 'device-changed') device.prepare.mockResolvedValue({ ...review.purchase!.playbackSession, session_public_key: 'ed25519:other' });
    if (reason === 'wrong-market') review.purchase!.marketContractId = 'other.testnet';
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(reason === 'logout' ? 1 : 0);
    expect(network.mock.calls.filter(([url]) => url === 'https://test.rpc.fastnear.com/')).toHaveLength(0);
});

it('shows purchase budgets without opening Google or a wallet on render', () => {
    const html = renderToStaticMarkup(createElement(NearAuthSigning, { auth: createNearAuthLab('synthetic-client'), publicationId: 'video-1' }));
    expect(html).toContain('0,12'); expect(html).toContain('test USDC'); expect(html).toContain('mevcut geçerli cihaz');
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


it.each(['{"state":"outer_pending"}', '{"state":"inner_pending"}', '{broken'])('keeps the independent demo record while buying exactly one ticket: %s', async value => {
    ticketReview();
    const key = signingAttemptKey(review.accountId);
    localStorage.setItem(key, value);
    const read = vi.spyOn(localStorage, 'getItem');
    try {
        await expect(prepareGooglePurchase('video-1', 'sponsor.testnet')).resolves.toEqual(review);
        await expect(runGoogleSigning(wallet, review, 'synthetic-token')).resolves.toMatchObject({ verified: true });
        expect(read.mock.calls.some(([name]) => name === key)).toBe(false);
        expect(send).toHaveBeenCalledOnce();
        await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow('signing_already_started');
    } finally { read.mockRestore(); }
    expect(localStorage.getItem(key)).toBe(value);
    delete review.purchase;
    await expect(runGoogleSigning(wallet, review, 'synthetic-token')).rejects.toThrow('signing_already_started');
    expect(send).toHaveBeenCalledOnce();
});
