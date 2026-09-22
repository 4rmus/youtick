import compactVectors from '../../../../protocol/paid-media-livepeer-v1/compact-upload-vectors.json';
import { packCompactUpload } from '../../../../protocol/paid-media-livepeer-v1/compact-upload';
import profiles from '../../../../protocol/paid-media-livepeer-v1/profiles.json';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { EncryptJWT, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { actions, baseEncode, buildDelegateAction, decodeSignedTransaction, decodeTransaction, encodeSignedDelegate, encodeTransaction, PublicKey, Signature } from 'near-api-js';
import { canonicalDeviceCertificate, type MarketDeviceCertificate } from '@/lib/device-session';

vi.unmock('near-api-js');
const mocks = vi.hoisted(() => ({ key: null as CryptoKey | null, account: '', publicKey: '', preflight: vi.fn() }));
vi.mock('jose', async (load) => ({ ...await load<typeof import('jose')>(), createRemoteJWKSet: () => async () => mocks.key }));
vi.mock('@/lib/near-auth-account-preflight', () => ({ nearAuthAccountPreflight: mocks.preflight }));
import { POST } from '@/app/api/auth-lab/signing/route';
import { prepareGoogleSigning, authorizeGoogleSigning, completeGoogleSigning, verifyGoogleTransaction, verifyApproval } from '@/lib/near-auth-signing-server';
import { prepareGoogleUpload, authorizeGoogleUpload, completeGoogleUpload } from '@/lib/near-auth-upload-server';

const ORIGIN = 'http://localhost:3000';
const SUBJECT = 'google-oauth2|synthetic-signing';
const SECRET = '11'.repeat(32);
const BLOCK = baseEncode(new Uint8Array(32).fill(7));
const OUTER = baseEncode(new Uint8Array(32).fill(8));
const pair = generateKeyPairSync('ed25519');
const publicBytes = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
const USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
let purchaseInput: { publicationId: string; playbackSession: { session_public_key: string; certificate_sha256: string; authorization_duration_ms: string } };
let ticketViews: Record<string, unknown>;
let deviceRecords: unknown[];
let buyerNear: string;
let rsa: CryptoKey;
let nonce: number;
let gasPrice: string;
let outer: Record<string, unknown>;
let inner: Record<string, unknown>;
const fetchMock = vi.fn();
beforeAll(async () => {
    const keys = await generateKeyPair('RS256'); rsa = keys.privateKey; mocks.key = keys.publicKey;
    mocks.account = publicBytes.toString('hex'); mocks.publicKey = `ed25519:${baseEncode(publicBytes)}`;
});
beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'true'); vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
    vi.stubEnv('NEAR_AUTH_LAB_CLIENT_ID', 'synthetic-client'); vi.stubEnv('NEAR_AUTH_LAB_SESSION_SECRET', SECRET);
    vi.stubEnv('NEXT_PUBLIC_VIDEO_ENVIRONMENT', 'public-testnet'); vi.stubEnv('NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2', 'true');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1', 'true'); vi.stubEnv('NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS', 'true');
    vi.stubEnv('NEXT_PUBLIC_LIVEPEER_BRIDGE_URL', 'https://bridge.invalid');
    vi.stubEnv('NEXT_PUBLIC_MARKET_CONTRACT_ID', 'market.testnet'); vi.stubEnv('NEXT_PUBLIC_USDC_CONTRACT_ID', USDC);
    nonce = 10; gasPrice = '100000000'; outer = {}; inner = {};
    const certificate: MarketDeviceCertificate = { domain: 'youtick.device-session', version: '3', network: 'testnet',
        contract_id: 'market.testnet', account_id: mocks.account, session_public_key: `ed25519:${baseEncode(new Uint8Array(32).fill(9))}`,
        origin_hash: createHash('sha256').update(ORIGIN).digest('hex'), scopes: ['play'], authorization_duration_ms: '2592000000' };
    purchaseInput = { publicationId: 'video-1', playbackSession: { session_public_key: certificate.session_public_key,
        certificate_sha256: createHash('sha256').update(canonicalDeviceCertificate(certificate)).digest('hex'), authorization_duration_ms: '2592000000' } };
    deviceRecords = []; buyerNear = '1000000000000000000000000';
    ticketViews = { get_publication: { publication_id: 'video-1', title: 'Synthetic video', price_usdc: '2000000', generation: 1, availability: 'ACTIVE' },
        get_governance_state: { bridge_frozen: false, new_purchases_paused: false }, has_entitlement: false,
        get_usdc_contract_id: USDC, ft_metadata: { decimals: 6 }, storage_balance_of: { total: '1250000000000000000000' },
        ft_balance_of: '3000000', get_playback_device: null, get_media_job: null, get_quote_key_version: 1, get_compact_upload_version: 1 };
    mocks.preflight.mockReset().mockResolvedValue({ implicitAccount: mocks.account, accounts: [mocks.account], publicKey: mocks.publicKey });
    fetchMock.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
        if (url === 'https://bridge.invalid/__health') return Response.json({ status: 'ok', service: 'livepeer-bridge', compactUpload: {version: 1, network: 'testnet', market: 'market.testnet'}, sponsoredUploadRelayReady: true, newUploadReady: true });
        expect(url).toBe('https://test.rpc.fastnear.com/');
        const { method, params } = JSON.parse(init.body as string);
        let result: unknown;
        if (method === 'block') result = { header: { height: 1000 } };
        else if (method === 'query' && params.request_type === 'call_function') result = { block_hash: BLOCK, result: [...Buffer.from(JSON.stringify(
            ({ paused: false, mpc_address: 'v1.signer-prod.testnet', mpc_domain_id: 1, ...ticketViews } as Record<string, unknown>)[params.method_name]))] };
        else if (method === 'query' && params.request_type === 'view_state') {
            expect(params.prefix_base64).toBe(Buffer.from(`youtick:market:playback-devices:v1:${mocks.account}`).toString('base64'));
            expect(params.block_id).toBe(BLOCK);
            result = { values: deviceRecords, block_hash: BLOCK };
        }
        else if (method === 'query') result = params.request_type === 'view_access_key'
            ? { permission: 'FullAccess', nonce, block_hash: BLOCK, block_height: 1000 }
            : { amount: params.account_id === mocks.account ? buyerNear : '1000000000000000000000000', locked: '0', storage_usage: 200 };
        else if (method === 'gas_price') result = { gas_price: gasPrice };
        else if (method === 'EXPERIMENTAL_protocol_config') result = { protocol_version: 85, runtime_config: { min_gas_purchase_price: '1000000000', storage_amount_per_byte: '10000000000000000000' } };
        else if (method === 'tx') result = params.tx_hash === OUTER ? outer : inner;
        else throw new Error('unexpected_broadcast');
        return Response.json({ result });
    });
    vi.stubGlobal('fetch', fetchMock);
});

function uploadFixture() {
    const sha = (value: string) => createHash('sha256').update(value).digest('hex');
    const request = { creator_id: mocks.account, job_id: 'lp-synthetic-upload', title: 'Synthetic upload', price_usdc: '2000000',
        expected_source_bytes: '9452298', profile_id: 'paid-media-livepeer-v1', profile_config_sha256: profiles.adaptive.hash,
        upload_public_key: purchaseInput.playbackSession.session_public_key, upload_key_expires_at_ms: String(Date.now() + 86399000) };
    const quote = { domain: 'youtick.sponsored-upload-quote', version: '1', network: 'testnet', contract_id: 'market.testnet', creator_id: mocks.account,
        job_id: request.job_id, request_sha256: sha(JSON.stringify(request)), expected_source_bytes: request.expected_source_bytes,
        upload_fee_usdc: '500000', sponsor_fee_usdc: '100000', total_fee_usdc: '600000', delegate_receiver_id: USDC,
        delegate_method: 'ft_transfer_call', delegate_gas: '100000000000000', delegate_deposit_yocto: '1', issued_at_ms: String(Date.now() - 1000),
        quote_block_height: '1000', max_delegate_block_height: '1200', expires_at_ms: String(Date.now() + 119000), quote_key_version: 1, quote_id: '' };
    quote.quote_id = sha(Object.entries(quote).filter(([field]) => field !== 'quote_id').map(([, value]) => String(value)).join('\n'));
    const message = { action: 'create_paid_job', ...request, playback_session: purchaseInput.playbackSession,
        sponsor_quote: quote, sponsor_quote_signature: Buffer.alloc(64, 7).toString('base64') };
    const args = { receiver_id: 'market.testnet', amount: '600000', memo: 'YouTick creator upload fee', msg: JSON.stringify(message) };
    return { args, message, encoded: () => Buffer.from(JSON.stringify(args)).toString('base64') };
}

async function compactFixture(fixture: ReturnType<typeof uploadFixture>) {
    const msg = await packCompactUpload(fixture.message, key => PublicKey.fromString(key).data, {
        network: 'testnet', market: 'market.testnet', creator: mocks.account, usdc: USDC, keyString: bytes => `ed25519:${baseEncode(bytes)}`,
    });
    const args = { receiver_id: 'market.testnet', amount: fixture.args.amount, msg };
    return { ...fixture, args, encoded: () => Buffer.from(JSON.stringify(args)).toString('base64') };
}

it('produces a verified MPC-signed delegate for the existing upload relay, without broadcasting or uploading', async () => {
    const sourceFixture = uploadFixture();
    const fixture = await compactFixture(sourceFixture);
    const review = await prepareGoogleUpload(SUBJECT, ORIGIN, 'sponsor.testnet', sourceFixture.encoded());
    expect(review.priceUsdc).toBe(sourceFixture.message.price_usdc);
    expect(review.totalFeeUsdc).toBe('600000'); expect(review.sourceBytes).toBe('9452298');
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const approval = await token(review.delegate, { exp: expiresAt });
    const call = await authorizeGoogleUpload(SUBJECT, ORIGIN, review.ticket, approval);
    expect(call.approvalExpiresAtMs).toBe(expiresAt * 1000);
    const signature = sign(null, createHash('sha256').update(Buffer.from(review.delegate)).digest(), pair.privateKey);
    const receipt = { outcome: { tokens_burnt: '1000', status: { SuccessValue: '' } } };
    outer = { final_execution_status: 'FINAL', status: { SuccessValue: Buffer.from(JSON.stringify({ signature: [...signature] })).toString('base64') },
        transaction: { hash: OUTER, signer_id: 'sponsor.testnet', receiver_id: 'fast-auth.testnet', actions: [{ FunctionCall: {
            method_name: 'sign', gas: 300000000000000, deposit: '1', args: Buffer.from(JSON.stringify(call.actions[0].params.args)).toString('base64'),
        } }] }, transaction_outcome: receipt, receipts_outcome: [receipt] };
    const reply = await completeGoogleUpload(SUBJECT, ORIGIN, review.ticket, OUTER);
    const delegate = buildDelegateAction({ senderId: mocks.account, receiverId: USDC, publicKey: PublicKey.fromString(mocks.publicKey),
        nonce: 11n, maxBlockHeight: 1200n, actions: [actions.functionCall('ft_transfer_call', fixture.args, 100000000000000n, 1n)] });
    expect(reply.signedDelegate).toBe(Buffer.from(encodeSignedDelegate({ delegateAction: delegate,
        signature: new Signature({ keyType: 0, data: signature }) })).toString('base64'));
    expect(reply.accountId).toBe(mocks.account); expect(reply.jobId).toBe(fixture.message.job_id);
    vi.useFakeTimers(); vi.setSystemTime((expiresAt + 1) * 1000);
    await expect(completeGoogleUpload(SUBJECT, ORIGIN, review.ticket, OUTER)).rejects.toMatchObject({ code: 'ERR_JWT_EXPIRED' });
    vi.useRealTimers();
    ticketViews.get_media_job = { job_id: fixture.message.job_id };
    await expect(completeGoogleUpload(SUBJECT, ORIGIN, review.ticket, OUTER)).rejects.toThrow('upload_not_ready');
    expect(fetchMock.mock.calls.every(([url, init]) => url === 'https://bridge.invalid/__health' || ['query', 'tx', 'block', 'gas_price', 'EXPERIMENTAL_protocol_config'].includes(JSON.parse(init.body).method))).toBe(true);
});

it.each(['wrong-account', 'amount', 'expired-quote', 'quote-hash', 'existing-job', 'existing-device', 'balance', 'disabled', 'extra-field', 'wrong-device'])('rejects upload preparation: %s', async (failure) => {
    const fixture = uploadFixture();
    if (failure === 'wrong-account') fixture.message.creator_id = 'another.testnet';
    if (failure === 'amount') fixture.args.amount = '700000';
    if (failure === 'expired-quote') fixture.message.sponsor_quote.expires_at_ms = '1';
    if (failure === 'quote-hash') fixture.message.sponsor_quote.quote_id = 'b'.repeat(64);
    if (failure === 'existing-job') ticketViews.get_media_job = { job_id: fixture.message.job_id };
    if (failure === 'existing-device') deviceRecords = [{}];
    if (failure === 'balance') ticketViews.ft_balance_of = '0';
    if (failure === 'disabled') vi.stubEnv('NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS', 'false');
    if (failure === 'extra-field') Object.assign(fixture.message, { extra: 'field' });
    if (failure === 'wrong-device') fixture.message.playback_session.certificate_sha256 = 'b'.repeat(64);
    fixture.args.msg = JSON.stringify(fixture.message);
    await expect(prepareGoogleUpload(SUBJECT, ORIGIN, 'sponsor.testnet', fixture.encoded())).rejects.toThrow();
});

it('binds upload Google approval to the session, exact prefixed delegate and current nonce', async () => {
    const fixture = await compactFixture(uploadFixture()); const review = await prepareGoogleUpload(SUBJECT, ORIGIN, 'sponsor.testnet', fixture.encoded());
    await expect(authorizeGoogleUpload(SUBJECT, ORIGIN, review.ticket, await token(review.delegate.slice(4)))).rejects.toThrow();
    await expect(authorizeGoogleUpload('another-subject', ORIGIN, review.ticket, await token(review.delegate))).rejects.toThrow();
    nonce++;
    await expect(authorizeGoogleUpload(SUBJECT, ORIGIN, review.ticket, await token(review.delegate))).rejects.toThrow('account_changed');
});

it.each(['token', 'review'])('rejects an upload %s that expires during the final chain checks', async (expiry) => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    try {
        const review = await prepareGoogleUpload(SUBJECT, ORIGIN, 'sponsor.testnet', (await compactFixture(uploadFixture())).encoded());
        const approval = await token(review.delegate, { exp: Math.floor(start / 1000) + (expiry === 'token' ? 60 : 300) });
        const fetch = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation(async (...args) => {
            const response = await fetch(...args);
            const { params = {} } = JSON.parse(args[1]?.body as string || '{}');
            if (params.request_type === 'view_state') clock.mockReturnValue(start + (expiry === 'token' ? 61_000 : 121_000));
            return response;
        });
        await expect(authorizeGoogleUpload(SUBJECT, ORIGIN, review.ticket, approval)).rejects.toThrow('authorization_expired');
    } finally { clock.mockRestore(); }
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function token(bytes: number[], changes: JWTPayload = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: 'https://login.testnet.fast-auth.com/', sub: SUBJECT, aud: 'auth0.jwt.fast-auth.testnet',
        azp: 'synthetic-client', scope: 'openid transaction:sign', fatxn: bytes, iat: now, exp: now + 60, ...changes })
        .setProtectedHeader({ alg: 'RS256' }).sign(rsa);
}
const prepare = () => prepareGoogleSigning(SUBJECT, ORIGIN, 'sponsor.testnet');
const preparePurchase = () => prepareGoogleSigning(SUBJECT, ORIGIN, 'sponsor.testnet', purchaseInput);
async function signedOuter(purchase = false) {
    const review = await (purchase ? preparePurchase() : prepare());
    const approval = await token(review.transaction);
    const call = await authorizeGoogleSigning(SUBJECT, ORIGIN, review.ticket, approval);
    const signature = sign(null, createHash('sha256').update(Buffer.from(review.transaction)).digest(), pair.privateKey);
    const receipt = { outcome: { tokens_burnt: '1000', status: { SuccessValue: '' } } };
    outer = { final_execution_status: 'FINAL', status: { SuccessValue: Buffer.from(JSON.stringify({ signature: [...signature] })).toString('base64') },
        transaction: { hash: OUTER, signer_id: 'sponsor.testnet', receiver_id: 'fast-auth.testnet', actions: [{ FunctionCall: {
            method_name: 'sign', gas: 300000000000000, deposit: '1', args: Buffer.from(JSON.stringify(call.actions[0].params.args)).toString('base64'),
        } }] }, transaction_outcome: receipt, receipts_outcome: [receipt] };
    inner = { final_execution_status: 'FINAL', status: { SuccessValue: '' }, transaction: {
        hash: review.transactionHash, signer_id: mocks.account, receiver_id: mocks.account, public_key: mocks.publicKey, actions: [{ Transfer: { deposit: '1' } }],
    }, transaction_outcome: receipt, receipts_outcome: [receipt] };
    if (purchase) {
        const tx = decodeTransaction(new Uint8Array(review.transaction));
        const fc = tx.actions[0].functionCall!;
        inner = { ...inner, status: { SuccessValue: Buffer.from('"2000000"').toString('base64') }, transaction: {
            hash: review.transactionHash, signer_id: mocks.account, receiver_id: USDC, public_key: mocks.publicKey, nonce: Number(tx.nonce),
            actions: [{ FunctionCall: { method_name: fc.methodName, gas: Number(fc.gas), deposit: '1', args: Buffer.from(fc.args).toString('base64') } }],
        }, receipts_outcome: [{ outcome: { ...receipt.outcome, executor_id: 'market.testnet', logs: [`EVENT_JSON:${JSON.stringify({
            standard: 'youtick_market', version: '1.0.0', event: 'entitlement_purchased', data: [{ account_id: mocks.account,
                contract_id: 'market.testnet', publication_id: 'video-1', asset: 'USDC', amount: '2000000' }],
        })}`] } }] };
    }
    return { review, approval };
}

it('verifies a real RSA approval and real Ed25519 signature before producing the exact self-transfer', async () => {
    const { review } = await signedOuter();
    const reply = await completeGoogleSigning(SUBJECT, ORIGIN, review.ticket, OUTER);
    const decoded = decodeSignedTransaction(Buffer.from(reply.signedTransaction, 'base64'));
    expect(decoded.transaction.signerId).toBe(mocks.account);
    expect(decoded.transaction.receiverId).toBe(mocks.account);
    expect(decoded.transaction.actions).toHaveLength(1);
    expect(decoded.transaction.actions[0].transfer?.deposit).toBe(1n);
    expect(reply.transactionHash).toBe(review.transactionHash);
    expect(await verifyGoogleTransaction(SUBJECT, ORIGIN, review.ticket)).toEqual({ verified: true, transactionHash: review.transactionHash, feeYocto: '2000' });
});

function settleTicket() {
    const authorizedAt = Date.now() - 1000;
    ticketViews.has_entitlement = true;
    ticketViews.get_playback_device = { ...purchaseInput.playbackSession, authorizing_public_key: mocks.publicKey,
        authorized_at_ms: String(authorizedAt), expires_at_ms: String(authorizedAt + 2592000000) };
}

it.each(['purchase', 'upload'])('V1 reuses the same valid playback device for another %s', async (kind) => {
    settleTicket(); ticketViews.has_entitlement = false; deviceRecords = [{ key: 'existing', value: 'not-decoded' }];
    if (kind === 'purchase') await expect(preparePurchase()).resolves.toHaveProperty('purchase');
    else await expect(prepareGoogleUpload(SUBJECT, ORIGIN, 'sponsor.testnet', uploadFixture().encoded())).resolves.toHaveProperty('delegate');
    const reads = fetchMock.mock.calls.filter(([, init]) => init.body).map(([, init]) => JSON.parse(init.body));
    expect(reads).toContainEqual(expect.objectContaining({ method: 'query', params: expect.objectContaining({
        block_id: BLOCK, account_id: 'market.testnet', method_name: 'get_playback_device',
        args_base64: Buffer.from(JSON.stringify({ account_id: mocks.account,
            session_public_key: purchaseInput.playbackSession.session_public_key })).toString('base64'),
    }) }));
});

it.each(['purchase', 'upload'])('V1 rejects an invalid existing device without changing it: %s', async (kind) => {
    for (const failure of ['missing', 'key', 'certificate', 'expired', 'future', 'duration', 'malformed-time']) {
        settleTicket(); ticketViews.has_entitlement = false; deviceRecords = [{ key: 'existing', value: 'not-decoded' }];
        const device = ticketViews.get_playback_device as Record<string, unknown>;
        if (failure === 'missing') ticketViews.get_playback_device = null;
        if (failure === 'key') device.session_public_key = mocks.publicKey;
        if (failure === 'certificate') device.certificate_sha256 = 'f'.repeat(64);
        if (failure === 'expired') Object.assign(device, { authorized_at_ms: String(Date.now()-2592001000), expires_at_ms: String(Date.now()-1000) });
        if (failure === 'future') Object.assign(device, { authorized_at_ms: String(Date.now()+10000), expires_at_ms: String(Date.now()+2592010000) });
        if (failure === 'duration') device.expires_at_ms = String(Date.now()+10000);
        if (failure === 'malformed-time') device.authorized_at_ms = 'not-a-time';
        const before = JSON.stringify(ticketViews.get_playback_device);
        const action = kind === 'purchase' ? preparePurchase()
            : prepareGoogleUpload(SUBJECT, ORIGIN, 'sponsor.testnet', uploadFixture().encoded());
        await expect(action).rejects.toThrow();
        expect(JSON.stringify(ticketViews.get_playback_device)).toBe(before);
    }
});

it('V1 rechecks the reused device before requesting and completing a purchase signature', async () => {
    settleTicket(); ticketViews.has_entitlement = false; deviceRecords = [{ key: 'existing', value: 'not-decoded' }];
    const { review, approval } = await signedOuter(true);
    ticketViews.get_playback_device = null;
    await expect(authorizeGoogleSigning(SUBJECT, ORIGIN, review.ticket, approval)).rejects.toThrow('ticket_first_device_only');
    await expect(completeGoogleSigning(SUBJECT, ORIGIN, review.ticket, OUTER)).rejects.toThrow('ticket_first_device_only');
});

it('signs one exact ticket payment with the canonical first-device certificate and verifies payment, entitlement and device', async () => {
    const { review } = await signedOuter(true);
    expect(review.purchase).toMatchObject({ priceUsdc: '2000000', marketContractId: 'market.testnet', playbackSession: purchaseInput.playbackSession });
    const reply = await completeGoogleSigning(SUBJECT, ORIGIN, review.ticket, OUTER);
    const decoded = decodeSignedTransaction(Buffer.from(reply.signedTransaction, 'base64'));
    expect(Buffer.from(encodeTransaction(decoded.transaction))).toEqual(Buffer.from(review.transaction));
    expect(decoded.transaction.receiverId).toBe(USDC);
    const call = decoded.transaction.actions[0].functionCall!;
    expect(call.methodName).toBe('ft_transfer_call'); expect(call.gas).toBe(100000000000000n); expect(call.deposit).toBe(1n);
    const args = JSON.parse(Buffer.from(call.args).toString());
    expect(args.amount).toBe('2000000'); expect(args.receiver_id).toBe('market.testnet');
    expect(JSON.parse(args.msg)).toEqual({ action: 'buy_ticket', publication_id: 'video-1', playback_session: purchaseInput.playbackSession });
    settleTicket();
    expect(await verifyGoogleTransaction(SUBJECT, ORIGIN, review.ticket)).toMatchObject({ verified: true, transactionHash: review.transactionHash });
    expect(fetchMock.mock.calls.every(([url, init]) => url === 'https://bridge.invalid/__health' || ['query', 'tx', 'block', 'gas_price', 'EXPERIMENTAL_protocol_config'].includes(JSON.parse(init.body).method))).toBe(true);
});

it.each(['disabled', 'wrong-origin-certificate', 'changed-device', 'duration', 'extra-device-field', 'bad-publication', 'owned', 'closed-sale', 'paused', 'wrong-token', 'unregistered', 'usdc-balance', 'near-balance', 'existing-device'])('rejects purchase preparation: %s', async (failure) => {
    if (failure === 'disabled') vi.stubEnv('NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2', 'false');
    if (failure === 'wrong-origin-certificate') purchaseInput.playbackSession.certificate_sha256 = 'f'.repeat(64);
    if (failure === 'changed-device') purchaseInput.playbackSession.session_public_key = mocks.publicKey;
    if (failure === 'duration') purchaseInput.playbackSession.authorization_duration_ms = '1';
    if (failure === 'extra-device-field') Object.assign(purchaseInput.playbackSession, { accountId: 'other.testnet' });
    if (failure === 'bad-publication') purchaseInput.publicationId = '../invalid';
    if (failure === 'owned') ticketViews.has_entitlement = true;
    if (failure === 'closed-sale') Object.assign(ticketViews.get_publication as object, { availability: 'SALES_SUSPENDED' });
    if (failure === 'paused') Object.assign(ticketViews.get_governance_state as object, { new_purchases_paused: true });
    if (failure === 'wrong-token') ticketViews.get_usdc_contract_id = 'other.testnet';
    if (failure === 'unregistered') ticketViews.storage_balance_of = null;
    if (failure === 'usdc-balance') ticketViews.ft_balance_of = '1999999';
    if (failure === 'near-balance') buyerNear = '100000000000000000000000';
    if (failure === 'existing-device') deviceRecords = [{ key: 'existing', value: 'not-decoded' }];
    await expect(preparePurchase()).rejects.toThrow();
});

it.each(['price', 'owned', 'device', 'nonce', 'subject'])('rechecks purchase before sponsor payment and before returning a signed transaction: %s', async (failure) => {
    const { review, approval } = await signedOuter(true);
    if (failure === 'price') Object.assign(ticketViews.get_publication as object, { price_usdc: '3000000' });
    if (failure === 'owned') ticketViews.has_entitlement = true;
    if (failure === 'device') deviceRecords = [{}];
    if (failure === 'nonce') nonce++;
    const subject = failure === 'subject' ? 'other-user' : SUBJECT;
    await expect(authorizeGoogleSigning(subject, ORIGIN, review.ticket, approval)).rejects.toThrow();
    await expect(completeGoogleSigning(subject, ORIGIN, review.ticket, OUTER)).rejects.toThrow();
});

it.each(['receiver', 'gas', 'extra-action'])('keeps the purchase intent restricted even for an authenticated malformed ticket: %s', async (failure) => {
    const review = await preparePurchase();
    const tx = decodeTransaction(new Uint8Array(review.transaction));
    if (failure === 'receiver') tx.receiverId = 'wrong.testnet';
    if (failure === 'gas') tx.actions[0].functionCall!.gas += 1n;
    if (failure === 'extra-action') tx.actions.push(actions.transfer(1n));
    const bytes = encodeTransaction(tx);
    const now = Math.floor(Date.now() / 1000);
    const ticket = await new EncryptJWT({ sponsor: 'sponsor.testnet', kind: 'ticket', transaction: Buffer.from(bytes).toString('base64') })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuer('youtick-auth-lab-signing').setAudience(ORIGIN)
        .setSubject(SUBJECT).setIssuedAt(now).setExpirationTime(now + 300).encrypt(Buffer.from(SECRET, 'hex'));
    await expect(authorizeGoogleSigning(SUBJECT, ORIGIN, ticket, await token(Array.from(bytes)))).rejects.toThrow();
});

it.each(['refund', 'no-event', 'other-executor', 'no-entitlement', 'wrong-device', 'wrong-authorizer', 'expired-device', 'pending', 'receipt-failure'])('does not report purchase success on %s', async (failure) => {
    const { review } = await signedOuter(true); settleTicket();
    if (failure === 'refund') inner.status = { SuccessValue: Buffer.from('"0"').toString('base64') };
    if (failure === 'no-event') inner.receipts_outcome = [];
    if (failure === 'other-executor') inner.receipts_outcome = [{ outcome: { executor_id: 'untrusted.testnet', logs: [] } }];
    if (failure === 'no-entitlement') ticketViews.has_entitlement = false;
    if (failure === 'wrong-device') Object.assign(ticketViews.get_playback_device as object, { certificate_sha256: 'f'.repeat(64) });
    if (failure === 'wrong-authorizer') Object.assign(ticketViews.get_playback_device as object, { authorizing_public_key: 'ed25519:other' });
    if (failure === 'expired-device') Object.assign(ticketViews.get_playback_device as object, { expires_at_ms: '1' });
    if (failure === 'pending') inner.final_execution_status = 'EXECUTED_OPTIMISTIC';
    if (failure === 'receipt-failure') inner.transaction_outcome = { outcome: { status: { Failure: {} }, tokens_burnt: '100' } };
    await expect(verifyGoogleTransaction(SUBJECT, ORIGIN, review.ticket)).rejects.toThrow();
});

it.each(['subject', 'audience', 'scope', 'client', 'payload', 'extra-claim', 'expired', 'bad-signature'])('rejects invalid signing approval: %s', async (failure) => {
    const review = await prepare();
    const changes: JWTPayload = {};
    if (failure === 'subject') changes.sub = 'another-user';
    if (failure === 'audience') changes.aud = 'other';
    if (failure === 'scope') changes.scope = 'openid';
    if (failure === 'client') changes.azp = 'other-client';
    if (failure === 'payload') changes.fatxn = [1, 2, 3];
    if (failure === 'extra-claim') changes.email = 'synthetic@example.invalid';
    if (failure === 'expired') changes.exp = 1;
    let jwt = await token(review.transaction, changes);
    if (failure === 'bad-signature') jwt = jwt.slice(0, jwt.lastIndexOf('.') + 1) + 'bad';
    await expect(authorizeGoogleSigning(SUBJECT, ORIGIN, review.ticket, jwt)).rejects.toThrow();
});

it.each(['ticket', 'session', 'origin', 'nonce', 'price'])('stops on changed %s', async (failure) => {
    const review = await prepare(); const jwt = await token(review.transaction);
    if (failure === 'nonce') nonce++;
    if (failure === 'price') gasPrice = '1000000001';
    await expect(authorizeGoogleSigning(failure === 'session' ? 'wrong' : SUBJECT, failure === 'origin' ? 'http://127.0.0.1:3000' : ORIGIN,
        failure === 'ticket' ? 'tampered' : review.ticket, jwt)).rejects.toThrow();
});

it.each(['empty-result', 'wrong-signature', 'wrong-sponsor', 'wrong-action', 'receipt-failure'])('rejects outer result: %s', async (failure) => {
    const { review } = await signedOuter();
    const result = outer as { status: { SuccessValue: string }; transaction: { signer_id: string; actions: unknown[] }; receipts_outcome: unknown[] };
    if (failure === 'empty-result') result.status.SuccessValue = '';
    if (failure === 'wrong-signature') result.status.SuccessValue = Buffer.from(JSON.stringify({ signature: Array(64).fill(1) })).toString('base64');
    if (failure === 'wrong-sponsor') result.transaction.signer_id = 'wrong.testnet';
    if (failure === 'wrong-action') result.transaction.actions = [];
    if (failure === 'receipt-failure') result.receipts_outcome = [{ outcome: { tokens_burnt: '0', status: { Failure: {} } } }];
    await expect(completeGoogleSigning(SUBJECT, ORIGIN, review.ticket, OUTER)).rejects.toThrow();
});

it('does not claim success for an unfinalized inner transaction', async () => {
    const { review } = await signedOuter(); inner.final_execution_status = 'EXECUTED_OPTIMISTIC';
    await expect(verifyGoogleTransaction(SUBJECT, ORIGIN, review.ticket)).rejects.toThrow('inner_not_verified');
});

it('keeps the API closed for anonymous, cross-origin, production and oversized requests', async () => {
    const now = Math.floor(Date.now() / 1000);
    const session = await new EncryptJWT({ identity_issuer: 'https://login.testnet.fast-auth.com/', client_id: 'synthetic-client' })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setSubject(SUBJECT).setIssuer('youtick-auth-lab').setAudience(ORIGIN)
        .setIssuedAt(now).setExpirationTime(now + 300).encrypt(Buffer.from(SECRET, 'hex'));
    const req = (origin = ORIGIN, cookie = '', body = JSON.stringify({ action: 'prepare', sponsor: 'sponsor.testnet' })) => new Request(`${ORIGIN}/api/auth-lab/signing`, {
        method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body,
    });
    const cookie = `youtick_auth_lab=${session}`;
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req('https://other.example', cookie))).status).toBe(403);
    expect((await POST(req(ORIGIN, cookie, 'x'.repeat(32769)))).status).toBe(413);
    expect((await POST(req(ORIGIN, cookie, JSON.stringify({ action: 'prepare-purchase', sponsor: 'sponsor.testnet',
        ...purchaseInput, receiverId: 'wrong.testnet' })))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    const purchaseBody = JSON.stringify({ action: 'prepare-purchase', sponsor: 'sponsor.testnet', ...purchaseInput });
    expect((await POST(req(ORIGIN, cookie, purchaseBody))).status).toBe(200);
    fetchMock.mockClear();
    vi.stubEnv('NODE_ENV', 'production');
    expect((await POST(req(ORIGIN, cookie))).status).toBe(404);
    expect((await POST(req(ORIGIN, cookie, purchaseBody))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
    [new Error('rpc_unavailable'), 'rpc_unavailable'],
    [Object.assign(new Error('private expiry details'), { code: 'ERR_JWT_EXPIRED' }), 'authorization_expired'],
    [Object.assign(new Error('private timeout details'), { name: 'TimeoutError' }), 'check_timeout'],
    [new Error('private token and identity details'), 'signing_check_failed'],
    [new Error('ticket_balance_required'), 'ticket_balance_required', 'prepare-purchase'],
    [new Error('ticket_first_device_only'), 'ticket_first_device_only', 'prepare-purchase'],
    [new Error('ticket_balance_required PRIVATE_TOKEN'), 'signing_check_failed', 'prepare-purchase'],
])('returns only a safe check reason and phase on rejection: %s', async (error, reason, action = 'prepare-upload') => {
    const now = Math.floor(Date.now() / 1000);
    const session = await new EncryptJWT({ identity_issuer: 'https://login.testnet.fast-auth.com/', client_id: 'synthetic-client' })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setSubject(SUBJECT).setIssuer('youtick-auth-lab').setAudience(ORIGIN)
        .setIssuedAt(now).setExpirationTime(now + 300).encrypt(Buffer.from(SECRET, 'hex'));
    mocks.preflight.mockRejectedValueOnce(error);
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const reply = await POST(new Request(`${ORIGIN}/api/auth-lab/signing`, { method: 'POST',
            headers: { Origin: ORIGIN, Cookie: `youtick_auth_lab=${session}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, sponsor: 'sponsor.testnet', ...(action === 'prepare-purchase'
                ? { publicationId: 'video-1', playbackSession: {} } : { encodedArgs: 'private-body' }) }),
        }));
        expect(reply.status).toBe(422);
        expect(await reply.json()).toEqual({ error: 'signing_check_failed', reason, action });
        expect(JSON.parse(log.mock.calls[0][0])).toEqual({ event: 'near_auth_signing_check_failed', action, reason, durationMs: expect.any(Number) });
        expect(fetchMock).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
});

it.each(['review', 'missing-claim', 'signature', 'preflight', 'unknown'])('reports only safe upload authorization diagnostics: %s', async failure => {
    const now = Math.floor(Date.now() / 1000);
    const session = await new EncryptJWT({ identity_issuer: 'https://login.testnet.fast-auth.com/', client_id: 'synthetic-client' })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setSubject(SUBJECT).setIssuer('youtick-auth-lab').setAudience(ORIGIN)
        .setIssuedAt(now).setExpirationTime(now + 300).encrypt(Buffer.from(SECRET, 'hex'));
    const review = await prepareGoogleUpload(SUBJECT, ORIGIN, 'sponsor.testnet', uploadFixture().encoded());
    let ticket = review.ticket;
    const approval = await token(review.delegate, failure === 'missing-claim' ? { fatxn: undefined } : {});
    const previousKey = mocks.key;
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        if (failure === 'review') ticket = await new EncryptJWT({})
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).encrypt(Buffer.alloc(32, 2));
        if (failure === 'signature') mocks.key = (await generateKeyPair('RS256')).publicKey;
        fetchMock.mockClear();
        if (failure === 'preflight') fetchMock.mockRejectedValueOnce(new TypeError('PRIVATE_DIAGNOSTIC_SENTINEL'));
        if (failure === 'unknown') fetchMock.mockRejectedValueOnce(Object.assign(new Error('PRIVATE_DIAGNOSTIC_SENTINEL'), {
            code: 'PRIVATE_CODE', claim: 'PRIVATE_CLAIM', reason: 'PRIVATE_REASON', payload: { token: approval },
        }));
        const reply = await POST(new Request(`${ORIGIN}/api/auth-lab/signing`, { method: 'POST',
            headers: { Origin: ORIGIN, Cookie: `youtick_auth_lab=${session}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'authorize-upload', ticket, token: approval }),
        }));
        expect(reply.status).toBe(422);
        const diagnostic = failure === 'review' ? { stage: 'upload_review', code: 'ERR_JWE_DECRYPTION_FAILED' }
            : failure === 'missing-claim' ? { stage: 'google_approval', code: 'ERR_JWT_CLAIM_VALIDATION_FAILED', claim: 'fatxn', claimCheck: 'missing' }
            : failure === 'signature' ? { stage: 'google_approval', code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' }
            : failure === 'preflight' ? { stage: 'upload_preflight', code: 'TypeError' } : { stage: 'upload_preflight' };
        const body = await reply.json();
        expect(body).toEqual({ error: 'signing_check_failed', reason: 'signing_check_failed', action: 'authorize-upload', diagnostic });
        expect(JSON.parse(log.mock.calls[0][0])).toEqual({ event: 'near_auth_signing_check_failed',
            action: 'authorize-upload', reason: 'signing_check_failed', diagnostic, durationMs: expect.any(Number) });
        const emitted = JSON.stringify([body, log.mock.calls]);
        for (const privateValue of [SUBJECT, SECRET, session, ticket, approval, 'PRIVATE_']) expect(emitted).not.toContain(privateValue);
        expect(fetchMock).toHaveBeenCalledTimes(['preflight', 'unknown'].includes(failure) ? 1 : 0);
        for (const [, init] of fetchMock.mock.calls) expect(JSON.parse(init.body).method).toBe('query');
    } finally { mocks.key = previousKey; log.mockRestore(); }
});

it.each(compactVectors)('reads the same cross-language compact upload: $request.job_id', async vector => {
    const previous = { account: mocks.account, publicKey: mocks.publicKey };
    vi.useFakeTimers(); vi.setSystemTime(1785589300000);
    mocks.account = vector.request.creator_id; mocks.publicKey = vector.account_public_key;
    mocks.preflight.mockResolvedValue({ implicitAccount: mocks.account, accounts: [mocks.account], publicKey: mocks.publicKey });
    try {
        const args = Buffer.from(JSON.stringify(vector.args)).toString('base64');
        const review = await prepareGoogleUpload(SUBJECT, ORIGIN, 'sponsor.testnet', args);
        expect(review.title).toBe(vector.request.title); expect(review.totalFeeUsdc).toBe(vector.quote.total_fee_usdc);
        expect(review.playbackSession).toEqual(vector.normal_message.playback_session);
        expect(review.expiresAt).toBeLessThanOrEqual(Number(vector.quote.expires_at_ms));
        const call = await authorizeGoogleUpload(SUBJECT, ORIGIN, review.ticket, await token(review.delegate));
        expect(call.receiverId).toBe('fast-auth.testnet');
        await expect(prepareGoogleUpload(SUBJECT, 'http://localhost:3001', 'sponsor.testnet', args)).rejects.toThrow();
    } finally { Object.assign(mocks, previous); }
});

it.each([7168, 7169])('checks the actual verified-token wire boundary before a sponsor call: %s', async length => {
    const bytes = [1, 2, 3], now = Math.floor(Date.now()/1000);
    const claims = { iss: 'https://login.testnet.fast-auth.com/', sub: SUBJECT, aud: 'auth0.jwt.fast-auth.testnet',
        azp: 'synthetic-client', scope: 'openid transaction:sign', fatxn: bytes, iat: now, exp: now+60, jti: '' };
    let approval = '';
    for (const kid of ['', 'a', 'aa']) {
        const sign = (jti: string) => new SignJWT({...claims,jti}).setProtectedHeader({alg:'RS256',kid}).sign(rsa);
        const start = await sign('');
        const guess = Math.floor((length-start.length)*3/4);
        for(let n = guess-3; n <= guess+3; n++) {
            const candidate=await sign('x'.repeat(n));
            if(candidate.length===length) { approval=candidate; break; }
        }
        if(approval) break;
    }
    expect(approval.length).toBe(length);
    if(length===7168) await expect(verifyApproval(approval,SUBJECT,Uint8Array.from(bytes))).resolves.toMatchObject({token:approval});
    else await expect(verifyApproval(approval,SUBJECT,Uint8Array.from(bytes))).rejects.toThrow('invalid_approval');
    expect(fetchMock).not.toHaveBeenCalled();
});

it.each(['market', 'bridge', 'network', 'binding', 'closed'])('stops compact upload before approval when deployment support is missing: %s', async reason => {
    const network = fetchMock.getMockImplementation()!;
    if(reason==='market') ticketViews.get_compact_upload_version = null;
    fetchMock.mockImplementation(async (url, init) => {
        if(url==='https://bridge.invalid/__health' && reason!=='market') return Response.json({
            status:'ok',service:'livepeer-bridge',compactUpload:{version:reason==='bridge'?undefined:1,
                network:reason==='network'?'mainnet':'testnet',market:reason==='binding'?'wrong.testnet':'market.testnet'},
            sponsoredUploadRelayReady:reason!=='closed',newUploadReady:true,
        });
        return network(url,init);
    });
    await expect(prepareGoogleUpload(SUBJECT,ORIGIN,'sponsor.testnet',uploadFixture().encoded())).rejects.toThrow('compact_upload_unavailable');
    expect(fetchMock.mock.calls.every(([url, init]) => url === 'https://bridge.invalid/__health' || JSON.parse(init.body).method !== 'send_tx')).toBe(true);
});

it.each(['transfer', 'purchase'])('rechecks %s approval and review expiry after the chain reads', async kind => {
    for (const expiry of ['token', 'review']) {
        const start=Date.now(); const clock=vi.spyOn(Date,'now').mockReturnValue(start);
        const read=fetchMock.getMockImplementation()!;
        try {
            const review=await (kind==='purchase'?preparePurchase():prepare());
            const approval=await token(review.transaction,{exp:Math.floor(start/1000)+(expiry==='token'?60:600)});
            fetchMock.mockImplementation(async (...args) => {
                const response=await read(...args);
                const {params={}}=JSON.parse(args[1]?.body as string || '{}');
                if(params.method_name==='mpc_domain_id') clock.mockReturnValue(start+(expiry==='token'?61_000:301_000));
                return response;
            });
            await expect(authorizeGoogleSigning(SUBJECT,ORIGIN,review.ticket,approval)).rejects.toThrow('authorization_expired');
        } finally { fetchMock.mockImplementation(read); clock.mockRestore(); }
    }
});

it.each([999,1200,1201])('requires the quote block window separately from delegate headroom: %s', async height => {
    let current=1199;
    const read=fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (...args) => {
        const response=await read(...args);
        const {method,params={}}=JSON.parse(args[1]?.body as string || '{}');
        if(params.request_type!=='view_access_key' && method!=='block') return response;
        const body=await response.json();
        if(method==='block') body.result.header.height=current;
        else body.result.block_height=current;
        return Response.json(body);
    });
    const review=await prepareGoogleUpload(SUBJECT,ORIGIN,'sponsor.testnet',uploadFixture().encoded());
    const approval=await token(review.delegate);
    current=height;
    const result=authorizeGoogleUpload(SUBJECT,ORIGIN,review.ticket,approval);
    if(height===1200) await expect(result).resolves.toMatchObject({receiverId:'fast-auth.testnet'});
    else await expect(result).rejects.toThrow('upload_expired');
});

it('checks the last block after all upload preflight reads', async () => {
    let finalHeight=1199;
    const read=fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (...args) => {
        const {method,params={}}=JSON.parse(args[1]?.body as string || '{}');
        if(method==='block') return Response.json({result:{header:{height:finalHeight}}});
        const response=await read(...args);
        if(params.request_type==='view_access_key') { const body=await response.json(); body.result.block_height=1199; return Response.json(body); }
        return response;
    });
    const review=await prepareGoogleUpload(SUBJECT,ORIGIN,'sponsor.testnet',uploadFixture().encoded());
    const approval=await token(review.delegate);
    finalHeight=1201;
    await expect(authorizeGoogleUpload(SUBJECT,ORIGIN,review.ticket,approval)).rejects.toThrow('upload_expired');
});

it('returns the earlier verified approval/review deadline without changing signing bytes', async () => {
    const review=await prepare();
    const approval=await token(review.transaction,{exp:Math.floor(Date.now()/1000)+600});
    const call=await authorizeGoogleSigning(SUBJECT,ORIGIN,review.ticket,approval);
    expect(call.approvalExpiresAtMs).toBe(review.expiresAt);
    expect(call.actions[0].params.args.sign_payload).toEqual(review.transaction);
});
