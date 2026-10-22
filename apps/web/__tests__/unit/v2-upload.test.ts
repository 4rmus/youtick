import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import vectors from '../../../../protocol/youtick-market-v2/golden-vectors.json';
import { NEAR_AUTH_PROVIDERS } from '@/lib/near-auth/config';
import type { OidcEnvironment, PopupLike } from '@/lib/near-auth/oidc';
import type { V2Config } from '@/lib/v2/config';

vi.unmock('near-api-js');

const featureFlags = vi.hoisted(() => ({
    enablePaidMediaLivepeerV1: true,
    enableLivepeerNearCreatorFee: false,
    enableSponsoredLivepeerUploads: false,
    enablePlaybackAuthorizerV2: false,
    publicTestnetBeta: false,
    publicTestnetVideoV1: false,
}));
const mediaConfig = vi.hoisted(() => ({ profile: 'legacy' as 'legacy' | 'stream', streamCustomerCode: '' }));
const near = vi.hoisted(() => ({ viewContract: vi.fn(), query: vi.fn() }));
const intent = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@/lib/device-session', () => ({ preparePlaybackDevice: vi.fn(), rememberPlaybackDelegate: vi.fn() }));
vi.mock('@/lib/signless-access-key', () => ({ signAndSendWithSignlessProvision: vi.fn() }));
vi.mock('@/lib/near', () => ({ getProvider: () => ({ query: near.query }), viewContract: near.viewContract }));
vi.mock('tus-js-client', () => ({ Upload: class {} }));
vi.mock('@/lib/constants', () => ({
    APP_CONFIG: { publicAppUrl: 'https://app.youtick.net', livepeerBridgeUrl: 'https://bridge.youtick.net' },
    FEATURE_FLAGS: featureFlags,
    MEDIA_UPLOAD_POLICY: { paidSourceMaxBytes: 20_000_000_000, livepeerTusChunkBytes: 32 * 1024 * 1024 },
    GAS_CONSTANTS: { mediumGas: 100_000_000_000_000n },
    NEAR_CONFIG: { marketContractId: 'market-v2.youtick.testnet', usdcContractId: 'usdc.fakes.testnet' },
    NEAR_NETWORK: 'testnet',
    V2_MEDIA_CONFIG: mediaConfig,
}));
vi.mock('@/lib/livepeer-upload', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/livepeer-upload')>();
    return { ...actual, requestLivepeerUploadIntent: intent.request };
});

import { fingerprintLivepeerSource, loadLivepeerJobSessionKey, persistLivepeerJobSessionKey, writeLivepeerUploadDraft } from '@/lib/livepeer-upload';
import {
    authorizeV2PaidJob, buildUploadMessage, prepareV2UploadResume, PROFILE_ID, UPLOAD_GAS, UPLOAD_KEY_DEPOSIT, UploadError, uploadDelegateBytes,
    uploadKeyDelegateBytes, v2UploadProfileHash,
} from '@/lib/v2/upload';
import { KeyPair } from 'near-api-js';

const upload = vectors.upload;
const MARKET = vectors.fixture.contract_id;
const USDC = vectors.fixture.usdc_contract_id;
const config: V2Config = {
    auth: { network: 'testnet', clientId: 'client-1', provider: NEAR_AUTH_PROVIDERS.testnet! },
    marketContractId: MARKET, gateAccountId: 'ckd-gate.testnet', relayerUrl: 'https://relayer.test', bridgeUrl: 'https://bridge.youtick.net',
    paymentServiceUrl: null,
};
const session = { accountId: upload.creator_id, publicKey: upload.creator_public_key };
// Stored job keys are rejected once expired, so the clock is the real one.
const NOW = Date.now();

describe('upload delegates against the protocol vectors', () => {
    it('builds the create_paid_job message and the fee delegate byte for byte', () => {
        const msg = buildUploadMessage({
            jobId: upload.msg.job_id, title: upload.msg.title, priceUsdc: upload.msg.price_usdc, expectedSourceBytes: upload.msg.expected_source_bytes,
            profileConfigSha256: upload.msg.profile_config_sha256, uploadPublicKey: upload.msg.upload_public_key, uploadKeyExpiresAtMs: upload.msg.upload_key_expires_at_ms,
        });
        expect(msg).toBe(upload.ft_transfer_call_args.msg);
        // Market V2 uses the provider-neutral profile id, not V1's paid-media-livepeer-v1.
        expect(PROFILE_ID).toBe('paid-media-v1');
        expect(JSON.parse(msg).profile_id).toBe(PROFILE_ID);
        expect(upload.msg.profile_id).toBe(PROFILE_ID);
        const vector = upload.delegate;
        const bytes = uploadDelegateBytes({
            senderId: vector.sender_id, publicKey: vector.public_key, usdcContractId: vector.receiver_id, args: vector.args,
            nonce: BigInt(vector.nonce), maxBlockHeight: BigInt(vector.max_block_height),
        });
        expect(Buffer.from(bytes).toString('base64')).toBe(vector.bytes_base64);
        expect(UPLOAD_GAS).toBe(BigInt(vector.gas));
    });

    it('builds the replace_upload_key delegate byte for byte', () => {
        const vector = upload.replace_upload_key.delegate;
        const bytes = uploadKeyDelegateBytes({
            senderId: vector.sender_id, publicKey: vector.public_key, marketContractId: vector.receiver_id, args: vector.args,
            nonce: BigInt(vector.nonce), maxBlockHeight: BigInt(vector.max_block_height),
        });
        expect(Buffer.from(bytes).toString('base64')).toBe(vector.bytes_base64);
        expect(UPLOAD_KEY_DEPOSIT).toBe(BigInt(vector.deposit_yocto));
    });

    it('refuses what Market V2 refuses', () => {
        const base = {
            jobId: upload.msg.job_id, title: upload.msg.title, priceUsdc: upload.msg.price_usdc, expectedSourceBytes: upload.msg.expected_source_bytes,
            profileConfigSha256: upload.msg.profile_config_sha256, uploadPublicKey: upload.msg.upload_public_key, uploadKeyExpiresAtMs: upload.msg.upload_key_expires_at_ms,
        };
        expect(() => buildUploadMessage({ ...base, title: ' \n ' })).toThrow('invalid_title');
        expect(() => buildUploadMessage({ ...base, title: 'ş'.repeat(101) })).toThrow('invalid_title');
        expect(() => buildUploadMessage({ ...base, priceUsdc: '4999999' })).toThrow('invalid_ticket_price');
        expect(() => buildUploadMessage({ ...base, expectedSourceBytes: '20000000001' })).toThrow('source_limit_exceeded');
    });
});

class FakePopup implements PopupLike {
    closed = false;
    location = { href: 'about:blank' };
    close() { this.closed = true; }
}

const UPLOAD_ID = 'cd'.repeat(32);

function harness(options: {
    relayer?: Array<[number, unknown]>; job?: (reads: number) => unknown; health?: unknown; healthStatus?: number;
} = {}) {
    const popup = new FakePopup();
    let listener: ((event: { origin: string; data: unknown; source?: unknown }) => void) | null = null;
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const relayer = [...(options.relayer ?? [
        [202, { uploadId: UPLOAD_ID, state: 'signing', txHash: null }],
        [200, { uploadId: UPLOAD_ID, state: 'submitted', txHash: 'h' }],
    ])];
    const health: unknown[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith('/__health')) {
            health.push(init?.method);
            if (options.health instanceof Error) throw options.health;
            return Response.json(options.health ?? {}, { status: options.healthStatus ?? 200 });
        }
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requests.push({ url: String(url), body });
        if (String(url).endsWith('/oauth/token')) return Response.json({ access_token: 'signing-token', id_token: 'id' });
        const [status, value] = relayer.shift() ?? [500, {}];
        return Response.json(value, { status });
    }) as unknown as typeof fetch;
    const oidc: OidcEnvironment = {
        addMessageListener(next) { listener = next; return () => { listener = null; }; },
        fetch: fetcher,
        randomBytes: (length) => new Uint8Array(length).fill(9),
        sha256: async (data) => new Uint8Array(createHash('sha256').update(data).digest()),
        setInterval: () => 1,
        clearInterval: () => undefined,
    };
    let reads = 0;
    const view = vi.fn(async () => { reads += 1; return (options.job ? options.job(reads) : null) as never; });
    const accessKey = vi.fn(async () => ({ nonce: 7n, blockHeight: 1_000n }));
    const deps = { view, accessKey, fetch: fetcher, sleep: async () => undefined, now: () => NOW, oidc, randomNonce: () => 'n' };
    const approve = () => void vi.waitFor(() => expect(popup.location.href).not.toBe('about:blank'), { timeout: 2_000 }).then(() => {
        const state = new URL(popup.location.href).searchParams.get('state');
        listener?.({ origin: new URL(config.auth.provider.issuer).origin, source: popup, data: { type: 'authorization_response', response: { state, code: 'code' } } });
    }, () => undefined);
    return { popup, requests, view, deps, approve, health, accessKey };
}

const file = new File([new Uint8Array(1_024)], 'clip.mp4', { type: 'video/mp4', lastModified: 1 });
const JOB = 'lp-0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6';

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); intent.request.mockReset(); mediaConfig.profile = 'legacy'; });

describe('NEAR Auth upload fee', () => {
    it('asks for approval of the exact delegate, relays it and confirms the job key on chain', async () => {
        let uploadKey = '';
        const h = harness({ job: (reads) => (reads >= 3 ? { job_id: JOB, creator_id: session.accountId, status: 'Authorized', upload_public_key: uploadKey } : null) });
        const pending = authorizeV2PaidJob({
            config, usdcContractId: USDC, session, jobId: JOB, title: 'Stüdyo kaydı', priceUsdc: '5000000', expectedSourceBytes: 2_000_000_000,
            popup: h.popup, redirectUri: 'https://youtick.test', deps: h.deps,
        });
        pending.catch(() => undefined);
        await vi.waitFor(() => { const key = loadLivepeerJobSessionKey(session.accountId, JOB); expect(key).not.toBeNull(); uploadKey = key!.keyPair.getPublicKey().toString(); });
        h.approve();
        expect(await pending).toBe(uploadKey);
        const relay = h.requests.find((request) => request.url === 'https://relayer.test/v1/uploads')!;
        const args = relay.body.args as { receiver_id: string; amount: string; msg: string };
        expect(args.receiver_id).toBe(MARKET);
        expect(args.amount).toBe('600000');
        expect(JSON.parse(args.msg)).toMatchObject({ action: 'create_paid_job', job_id: JOB, title: 'Stüdyo kaydı', price_usdc: '5000000', upload_public_key: uploadKey });
        expect(relay.body).toMatchObject({ nonce: '8', max_block_height: '1600' });
        // The approval carried exactly the bytes the relayer rebuilds.
        const approvedBytes = new URL(h.popup.location.href).searchParams.get('delegateAction')!.split(',').map(Number);
        const expected = uploadDelegateBytes({ senderId: session.accountId, publicKey: session.publicKey, usdcContractId: USDC, args, nonce: 8n, maxBlockHeight: 1_600n });
        expect(approvedBytes).toEqual(Array.from(expected));
        expect(h.requests.at(-1)).toEqual({ url: 'https://relayer.test/v1/uploads/status', body: { upload_id: UPLOAD_ID } });
        expect(h.popup.closed).toBe(true);
    });

    it('reuses an authorized job with this key, and sends to resume when the key is lost', async () => {
        const keyPair = KeyPair.fromRandom('ed25519');
        persistLivepeerJobSessionKey(session.accountId, JOB, keyPair, String(NOW + 60_000));
        const same = harness({ job: () => ({ job_id: JOB, creator_id: session.accountId, status: 'Authorized', upload_public_key: keyPair.getPublicKey().toString() }) });
        await expect(authorizeV2PaidJob({
            config, usdcContractId: USDC, session, jobId: JOB, title: 'x', priceUsdc: '5000000', expectedSourceBytes: 1_024,
            popup: same.popup, redirectUri: 'https://youtick.test', deps: same.deps,
        })).resolves.toBe(keyPair.getPublicKey().toString());
        expect(same.requests).toEqual([]);
        expect(same.popup.closed).toBe(true);

        const lost = harness({ job: () => ({ job_id: JOB, creator_id: session.accountId, status: 'Authorized', upload_public_key: 'ed25519:other' }) });
        await expect(authorizeV2PaidJob({
            config, usdcContractId: USDC, session, jobId: JOB, title: 'x', priceUsdc: '5000000', expectedSourceBytes: 1_024,
            popup: lost.popup, redirectUri: 'https://youtick.test', deps: lost.deps,
        })).rejects.toThrow('livepeer_resume_required');
        const foreign = harness({ job: () => ({ job_id: JOB, creator_id: 'b'.repeat(64), status: 'Authorized', upload_public_key: 'ed25519:other' }) });
        await expect(authorizeV2PaidJob({
            config, usdcContractId: USDC, session, jobId: JOB, title: 'x', priceUsdc: '5000000', expectedSourceBytes: 1_024,
            popup: foreign.popup, redirectUri: 'https://youtick.test', deps: foreign.deps,
        })).rejects.toThrow('livepeer_paid_job_conflict');
    });

    it('reports relayer refusals by code and treats job_exists as paid', async () => {
        const refused = harness({ relayer: [[409, { error: 'insufficient_balance' }]] });
        const pending = authorizeV2PaidJob({
            config, usdcContractId: USDC, session, jobId: JOB, title: 'x', priceUsdc: '5000000', expectedSourceBytes: 1_024,
            popup: refused.popup, redirectUri: 'https://youtick.test', deps: refused.deps,
        });
        pending.catch(() => undefined);
        refused.approve();
        await expect(pending).rejects.toThrow('insufficient_balance');
        expect(refused.popup.closed).toBe(true);

        sessionStorage.clear();
        let key = '';
        const exists = harness({
            relayer: [[409, { error: 'job_exists' }]],
            job: (reads) => (reads >= 2 ? { job_id: JOB, creator_id: session.accountId, status: 'Authorized', upload_public_key: key } : null),
        });
        const paid = authorizeV2PaidJob({
            config, usdcContractId: USDC, session, jobId: JOB, title: 'x', priceUsdc: '5000000', expectedSourceBytes: 1_024,
            popup: exists.popup, redirectUri: 'https://youtick.test', deps: exists.deps,
        });
        paid.catch(() => undefined);
        await vi.waitFor(() => { const stored = loadLivepeerJobSessionKey(session.accountId, JOB); expect(stored).not.toBeNull(); key = stored!.keyPair.getPublicKey().toString(); });
        exists.approve();
        expect(await paid).toBe(key);
        expect(exists.requests.filter((request) => request.url.endsWith('/v1/uploads/status'))).toEqual([]);
    });
});

describe('media profile selector', () => {
    const STREAM_HASH = '1128da32be3187c804326ef68a3c4c5344b47fc956a09ee88f8c0779ea5f4c64';

    async function pay(h: ReturnType<typeof harness>, state: { key: string }) {
        let uploadKey = '';
        const pending = authorizeV2PaidJob({
            config, usdcContractId: USDC, session, jobId: JOB, title: 'Clip', priceUsdc: '5000000', expectedSourceBytes: 1_024,
            popup: h.popup, redirectUri: 'https://youtick.test', deps: h.deps,
        });
        pending.catch(() => undefined);
        await vi.waitFor(() => { const key = loadLivepeerJobSessionKey(session.accountId, JOB); expect(key).not.toBeNull(); uploadKey = key!.keyPair.getPublicKey().toString(); state.key = uploadKey; });
        h.approve();
        await pending;
        const relay = h.requests.find((request) => request.url === 'https://relayer.test/v1/uploads')!;
        return { msg: (relay.body.args as { msg: string }).msg, uploadKey };
    }

    function confirmedJob(h: { key: string }) {
        return (reads: number) => (reads >= 3 ? { job_id: JOB, creator_id: session.accountId, status: 'Authorized', upload_public_key: h.key } : null);
    }

    it('keeps the create_paid_job message byte-identical with the selector unset, and never reads /__health', async () => {
        const state = { key: '' };
        const h = harness({ job: (reads) => confirmedJob(state)(reads) });
        const run = pay(h, state);
        const { msg, uploadKey } = await run;
        const expiresAt = loadLivepeerJobSessionKey(session.accountId, JOB)!.uploadKeyExpiresAtMs;
        // The exact bytes produced before the selector existed: the legacy profile under paid-media-v1.
        expect(msg).toBe(`{"action":"create_paid_job","job_id":"${JOB}","title":"Clip","price_usdc":"5000000","expected_source_bytes":"1024",`
            + `"profile_id":"paid-media-v1","profile_config_sha256":"96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77",`
            + `"upload_public_key":"${uploadKey}","upload_key_expires_at_ms":"${expiresAt}"}`);
        expect(v2UploadProfileHash()).toBe('96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77');
        expect(h.health).toEqual([]);
    });

    it('pays a stream job under the Stream descriptor hash after /__health reports Stream configured', async () => {
        mediaConfig.profile = 'stream';
        const state = { key: '' };
        const h = harness({ job: (reads) => confirmedJob(state)(reads), health: { status: 'ok', streamConfigured: true } });
        const run = pay(h, state);
        const { msg } = await run;
        expect(JSON.parse(msg)).toMatchObject({ profile_id: 'paid-media-v1', profile_config_sha256: STREAM_HASH });
        expect(Object.keys(JSON.parse(msg))).toEqual(['action', 'job_id', 'title', 'price_usdc', 'expected_source_bytes', 'profile_id',
            'profile_config_sha256', 'upload_public_key', 'upload_key_expires_at_ms']);
        expect(v2UploadProfileHash()).toBe(STREAM_HASH);
        expect(h.health).toEqual(['GET']);
    });

    it.each([
        ['flag absent', { status: 'ok' }, 200],
        ['flag false', { status: 'ok', streamConfigured: false }, 200],
        ['flag truthy but not true', { status: 'ok', streamConfigured: 'true' }, 200],
        ['health refused', { status: 'error', streamConfigured: true }, 503],
        ['health unreachable', new TypeError('Failed to fetch'), 200],
    ])('stops a stream upload before any approval or fee when %s', async (_name, health, healthStatus) => {
        mediaConfig.profile = 'stream';
        const h = harness({ health, healthStatus });
        await expect(authorizeV2PaidJob({
            config, usdcContractId: USDC, session, jobId: JOB, title: 'Clip', priceUsdc: '5000000', expectedSourceBytes: 1_024,
            popup: h.popup, redirectUri: 'https://youtick.test', deps: h.deps,
        })).rejects.toThrow('media_provider_not_ready');
        expect(h.requests).toEqual([]);
        expect(h.accessKey).not.toHaveBeenCalled();
        expect(h.popup.location.href).toBe('about:blank');
        expect(h.popup.closed).toBe(true);
    });

    it('resumes with the hash the chain job was paid under', async () => {
        writeLivepeerUploadDraft(session.accountId, {
            schema: 'youtick.livepeer-ui-draft.v2', stage: 'authorized', jobId: JOB, title: 'x', price: '5', sourceBytes: file.size,
            sourceName: file.name, sourceLastModified: file.lastModified, sourceFingerprintSha256: await fingerprintLivepeerSource(file),
        });
        const keyPair = KeyPair.fromRandom('ed25519');
        persistLivepeerJobSessionKey(session.accountId, JOB, keyPair, String(NOW + 60_000));
        const h = harness({ job: () => ({
            job_id: JOB, creator_id: session.accountId, status: 'Authorized', upload_public_key: keyPair.getPublicKey().toString(),
            upload_key_expires_at_ms: String(NOW + 60_000), profile_id: 'paid-media-v1', profile_config_sha256: STREAM_HASH,
        }) });
        intent.request.mockResolvedValue({ job_id: JOB, generation: 1, state: 'PROCESSING' });
        await prepareV2UploadResume({ config, session, jobId: JOB, file, popup: h.popup, redirectUri: 'https://youtick.test', deps: h.deps });
        expect(intent.request).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'paid-media-v1', profileConfigSha256: STREAM_HASH }));
        // Resuming takes no fee, so the selector and /__health play no part.
        expect(h.health).toEqual([]);
    });
});

describe('NEAR Auth upload resume', () => {
    async function draft() {
        writeLivepeerUploadDraft(session.accountId, {
            schema: 'youtick.livepeer-ui-draft.v2', stage: 'authorized', jobId: JOB, title: 'x', price: '5', sourceBytes: file.size,
            sourceName: file.name, sourceLastModified: file.lastModified, sourceFingerprintSha256: await fingerprintLivepeerSource(file),
        });
    }

    it('replaces a lost upload key through the relayer before asking the Bridge to resume', async () => {
        await draft();
        let replacement = '';
        const h = harness({
            job: (reads) => ({ job_id: JOB, creator_id: session.accountId, status: 'Authorized', upload_public_key: reads >= 3 ? replacement : 'ed25519:old', upload_key_expires_at_ms: String(NOW + 60_000) }),
        });
        intent.request
            .mockResolvedValueOnce({ job_id: JOB, generation: 1, state: 'UPLOADING' })
            .mockResolvedValueOnce({ schema: 'youtick.livepeer-upload-intent.v2', job_id: JOB, created: false });
        const pending = prepareV2UploadResume({ config, session, jobId: JOB, file, popup: h.popup, redirectUri: 'https://youtick.test', deps: h.deps });
        pending.catch(() => undefined);
        await vi.waitFor(() => { const stored = loadLivepeerJobSessionKey(session.accountId, JOB); expect(stored).not.toBeNull(); replacement = stored!.keyPair.getPublicKey().toString(); });
        h.approve();
        await expect(pending).resolves.toMatchObject({ job_id: JOB });
        const relay = h.requests.find((request) => request.url === 'https://relayer.test/v1/upload-keys')!;
        expect(relay.body.args).toEqual({ job_id: JOB, new_public_key: replacement, expires_at_ms: String(NOW + 24 * 60 * 60 * 1000) });
        // The V2 Bridge has no `recovery: 'resume'`: the state is read first, then the plain intent renews the lease.
        expect(intent.request).toHaveBeenCalledTimes(2);
        expect(intent.request).toHaveBeenNthCalledWith(1, expect.objectContaining({ jobId: JOB, recovery: 'reconcile', expectedSourceBytes: file.size }));
        expect(intent.request).toHaveBeenNthCalledWith(2, expect.not.objectContaining({ recovery: expect.anything() }));
        // The Bridge compares the intent body's profile_id with the chain job's (paid-media-v1).
        for (const [call] of intent.request.mock.calls) expect(call).toMatchObject({ profileId: 'paid-media-v1' });
    });

    it('needs no approval when this tab still holds the job key', async () => {
        await draft();
        const keyPair = KeyPair.fromRandom('ed25519');
        persistLivepeerJobSessionKey(session.accountId, JOB, keyPair, String(NOW + 60_000));
        const h = harness({ job: () => ({ job_id: JOB, creator_id: session.accountId, status: 'Authorized', upload_public_key: keyPair.getPublicKey().toString(), upload_key_expires_at_ms: String(NOW + 60_000) }) });
        intent.request.mockResolvedValue({ job_id: JOB, generation: 1, state: 'PROCESSING' });
        await expect(prepareV2UploadResume({ config, session, jobId: JOB, file, popup: h.popup, redirectUri: 'https://youtick.test', deps: h.deps }))
            .resolves.toEqual({ job_id: JOB, generation: 1, state: 'PROCESSING' });
        // Past the upload, the Bridge is not asked for an intent again.
        expect(intent.request).toHaveBeenCalledTimes(1);
        expect(h.requests).toEqual([]);
        expect(h.popup.closed).toBe(true);
        const published = harness({ job: () => ({ job_id: JOB, creator_id: session.accountId, status: 'Published', upload_public_key: 'ed25519:old', upload_key_expires_at_ms: '1' }) });
        await expect(prepareV2UploadResume({ config, session, jobId: JOB, file, popup: published.popup, redirectUri: 'https://youtick.test', deps: published.deps }))
            .rejects.toBeInstanceOf(UploadError);
    });
});

describe('upload refusal copy', () => {
    it('explains the platform-wide reservation budget and capacity without naming the provider', async () => {
        const { uploadErrorMessage } = await import('@/components/v2/UploadForm');
        const { LivepeerAdmissionDeniedError } = await import('@/lib/livepeer-upload');
        const copy = [
            uploadErrorMessage(new LivepeerAdmissionDeniedError('reservation_budget', null)),
            uploadErrorMessage(new LivepeerAdmissionDeniedError('capacity', null)),
            uploadErrorMessage(new Error('provider_admission_closed')),
            uploadErrorMessage(new UploadError('media_provider_not_ready')),
        ];
        expect(copy[0]).toBe('Another upload is in progress on the platform. Please try again in a few minutes. No fee was taken.');
        expect(copy[1]).toMatch(/^Uploads are at capacity right now/);
        expect(copy[2]).toMatch(/^Uploads are at capacity right now.*stays here to resume\.$/);
        expect(copy[3]).toBe('Uploads are not available right now. No fee was taken; please try again later.');
        for (const text of copy) expect(text).not.toMatch(/livepeer|cloudflare|stream|studio|\(/i);
        // Other reasons keep today's admission_denied copy.
        const busy = 'Uploads are busy right now. Please try again in a few minutes.';
        expect(uploadErrorMessage(new LivepeerAdmissionDeniedError('daily_limit', 1))).toBe(busy);
        expect(uploadErrorMessage(new LivepeerAdmissionDeniedError(null, null))).toBe(busy);
    });
});
