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
}));
vi.mock('@/lib/livepeer-upload', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/livepeer-upload')>();
    return { ...actual, requestLivepeerUploadIntent: intent.request };
});

import { fingerprintLivepeerSource, loadLivepeerJobSessionKey, persistLivepeerJobSessionKey, writeLivepeerUploadDraft } from '@/lib/livepeer-upload';
import {
    authorizeV2PaidJob, buildUploadMessage, prepareV2UploadResume, UPLOAD_GAS, UPLOAD_KEY_DEPOSIT, UploadError, uploadDelegateBytes,
    uploadKeyDelegateBytes,
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

function harness(options: { relayer?: Array<[number, unknown]>; job?: (reads: number) => unknown } = {}) {
    const popup = new FakePopup();
    let listener: ((event: { origin: string; data: unknown; source?: unknown }) => void) | null = null;
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const relayer = [...(options.relayer ?? [
        [202, { uploadId: UPLOAD_ID, state: 'signing', txHash: null }],
        [200, { uploadId: UPLOAD_ID, state: 'submitted', txHash: 'h' }],
    ])];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
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
    const deps = { view, accessKey: async () => ({ nonce: 7n, blockHeight: 1_000n }), fetch: fetcher, sleep: async () => undefined, now: () => NOW, oidc, randomNonce: () => 'n' };
    const approve = () => void vi.waitFor(() => expect(popup.location.href).not.toBe('about:blank'), { timeout: 2_000 }).then(() => {
        const state = new URL(popup.location.href).searchParams.get('state');
        listener?.({ origin: new URL(config.auth.provider.issuer).origin, source: popup, data: { type: 'authorization_response', response: { state, code: 'code' } } });
    }, () => undefined);
    return { popup, requests, view, deps, approve };
}

const file = new File([new Uint8Array(1_024)], 'clip.mp4', { type: 'video/mp4', lastModified: 1 });
const JOB = 'lp-0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6';

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); intent.request.mockReset(); });

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
        intent.request.mockResolvedValue({ schema: 'youtick.livepeer-upload-intent.v2', job_id: JOB, created: false });
        const pending = prepareV2UploadResume({ config, session, jobId: JOB, file, popup: h.popup, redirectUri: 'https://youtick.test', deps: h.deps });
        pending.catch(() => undefined);
        await vi.waitFor(() => { const stored = loadLivepeerJobSessionKey(session.accountId, JOB); expect(stored).not.toBeNull(); replacement = stored!.keyPair.getPublicKey().toString(); });
        h.approve();
        await expect(pending).resolves.toMatchObject({ job_id: JOB });
        const relay = h.requests.find((request) => request.url === 'https://relayer.test/v1/upload-keys')!;
        expect(relay.body.args).toEqual({ job_id: JOB, new_public_key: replacement, expires_at_ms: String(NOW + 24 * 60 * 60 * 1000) });
        expect(intent.request).toHaveBeenCalledWith(expect.objectContaining({ jobId: JOB, recovery: 'resume', expectedSourceBytes: file.size }));
    });

    it('needs no approval when this tab still holds the job key', async () => {
        await draft();
        const keyPair = KeyPair.fromRandom('ed25519');
        persistLivepeerJobSessionKey(session.accountId, JOB, keyPair, String(NOW + 60_000));
        const h = harness({ job: () => ({ job_id: JOB, creator_id: session.accountId, status: 'Authorized', upload_public_key: keyPair.getPublicKey().toString(), upload_key_expires_at_ms: String(NOW + 60_000) }) });
        intent.request.mockResolvedValue({ job_id: JOB, generation: 1, state: 'PROCESSING' });
        await expect(prepareV2UploadResume({ config, session, jobId: JOB, file, popup: h.popup, redirectUri: 'https://youtick.test', deps: h.deps }))
            .resolves.toEqual({ job_id: JOB, generation: 1, state: 'PROCESSING' });
        expect(h.requests).toEqual([]);
        expect(h.popup.closed).toBe(true);
        const published = harness({ job: () => ({ job_id: JOB, creator_id: session.accountId, status: 'Published', upload_public_key: 'ed25519:old', upload_key_expires_at_ms: '1' }) });
        await expect(prepareV2UploadResume({ config, session, jobId: JOB, file, popup: published.popup, redirectUri: 'https://youtick.test', deps: published.deps }))
            .rejects.toBeInstanceOf(UploadError);
    });
});
