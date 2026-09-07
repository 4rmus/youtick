import { KeyPair, KeyPairSigner } from 'near-api-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { playbackAuthorizationCacheRecordCount, type Env } from './index';

const ORIGIN = 'https://youtick.net';
const RPC_URL = 'https://rpc.testnet.near.org';
const MARKET_ID = 'paid-media-livepeer-v1.testnet';
const BLOCK_HASH = '11111111111111111111111111111111';
const PUBLICATION_ID = 'job-001';
const PLAYBACK_ID = 'playback_001';
const ACCOUNT_ID = 'buyer.testnet';
const PROFILE_HASH = '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77';
const API_KEY = 'test-livepeer-api-key';
let version = 0;
const abuseTestEnabled = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
}).process?.env?.PLAYBACK_V2_ABUSE_TEST === '1';
const loadTestEnabled = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
}).process?.env?.PLAYBACK_V2_LOAD_TEST === '1';

async function jwtKeys(): Promise<{ privatePem: string; publicKey: string; verifyKey: CryptoKey }> {
    const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
    ) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey) as ArrayBuffer);
    const privatePem = `-----BEGIN PRIVATE KEY-----\n${base64(pkcs8)}\n-----END PRIVATE KEY-----`;
    const publicPem = `-----BEGIN PUBLIC KEY-----\n${base64(spki)}\n-----END PUBLIC KEY-----`;
    return {
        privatePem: base64(new TextEncoder().encode(privatePem)),
        publicKey: base64(new TextEncoder().encode(publicPem)),
        verifyKey: pair.publicKey,
    };
}

async function createEnv(): Promise<{ env: Env; verifyKey: CryptoKey; idFromName: ReturnType<typeof vi.fn> }> {
    const keys = await jwtKeys();
    version += 1;
    const idFromName = vi.fn(() => { throw new Error('v2_must_not_use_durable_objects'); });
    return {
        env: {
            CF_VERSION_METADATA: {
                id: `worker-version-test-${version}`,
                tag: 'test',
                timestamp: '2026-08-08T00:00:00.000Z',
            },
            LIVEPEER_BRIDGE_ENABLED: 'true',
            LIVEPEER_PLAYBACK_ISSUANCE_ENABLED: 'true',
            LIVEPEER_PLAYBACK_V2_ENABLED: 'true',
            ALLOWED_ORIGINS: ORIGIN,
            NEAR_NETWORK: 'testnet',
            NEAR_RPC_URL: RPC_URL,
            MARKET_CONTRACT_ID: MARKET_ID,
            LIVEPEER_API_KEY: API_KEY,
            LIVEPEER_JWT_PRIVATE_KEY: keys.privatePem,
            LIVEPEER_JWT_PUBLIC_KEY: keys.publicKey,
            LIVEPEER_JWT_ISSUER: ORIGIN,
            LIVEPEER_CONTROL: { idFromName } as unknown as DurableObjectNamespace,
        },
        verifyKey: keys.verifyKey,
        idFromName,
    };
}

function playbackDependencies(input: Parameters<typeof playbackRpc>[0] & {
    providerPolicy?: string;
}) {
    const rpc = playbackRpc(input);
    const provider = vi.fn(async () => Response.json({
        type: 'vod',
        meta: { playbackPolicy: { type: input.providerPolicy ?? 'jwt' }, source: [] },
    }));
    const fetcher = vi.fn((url: RequestInfo | URL, init?: RequestInit) => (
        String(url).startsWith('https://livepeer.studio/api/playback/')
            ? provider()
            : rpc(url, init)
    ));
    return { fetcher, provider, rpc };
}

async function playbackRequest(overrides?: {
    accountId?: string;
    certificateExpiresAtMs?: number;
    origin?: string;
    requestOrigin?: string;
    requestSignature?: string;
    certificateSignature?: string;
}): Promise<{ request: Request; walletPublicKey: string; accountId: string; renew: () => Promise<Request> }> {
    const now = Date.now();
    const accountId = overrides?.accountId ?? ACCOUNT_ID;
    const origin = overrides?.origin ?? ORIGIN;
    const deviceKey = KeyPair.fromRandom('ed25519');
    const walletKey = KeyPair.fromRandom('ed25519');
    const certificate = {
        domain: 'youtick.device-session',
        version: '1',
        network: 'testnet',
        account_id: accountId,
        session_public_key: deviceKey.getPublicKey().toString(),
        origin_hash: await sha256(origin),
        scopes: ['play'],
        issued_at_ms: String(now),
        expires_at_ms: String(overrides?.certificateExpiresAtMs ?? now + 8 * 60 * 60 * 1000),
    };
    const walletNonce = crypto.getRandomValues(new Uint8Array(32));
    const signedCertificate = await new KeyPairSigner(walletKey).signNep413Message(accountId, {
        message: canonicalJson(certificate),
        recipient: MARKET_ID,
        nonce: walletNonce,
    });
    const body = {
        publication_id: PUBLICATION_ID,
        generation: 1,
        playback_id: PLAYBACK_ID,
    };
    const renew = async () => {
        const requestEnvelope = {
            domain: 'youtick.playback-request',
            version: '1',
            network: 'testnet',
            contract_id: MARKET_ID,
            account_id: accountId,
            origin,
            request_nonce: base64Url(crypto.getRandomValues(new Uint8Array(32))),
            request_expires_at_ms: String(Date.now() + 5 * 60 * 1000),
            body_sha256: await sha256(canonicalJson(body)),
            certificate_sha256: await sha256(canonicalJson(certificate)),
        };
        const deviceSignature = deviceKey.sign(
            new TextEncoder().encode(canonicalPlaybackRequest(requestEnvelope)),
        ).signature;
        const requestSignature = overrides?.requestSignature ?? base64(deviceSignature);
        return new Request('https://bridge.youtick.net/v2/playback-tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: overrides?.requestOrigin ?? origin },
            body: JSON.stringify({
                body,
                certificate,
                certificate_proof: {
                    public_key: walletKey.getPublicKey().toString(),
                    signature: overrides?.certificateSignature ?? base64(signedCertificate.signature),
                    nonce: base64Url(walletNonce),
                },
                request: requestEnvelope,
                request_signature: requestSignature,
            }),
        });
    };
    return { request: await renew(), walletPublicKey: walletKey.getPublicKey().toString(), accountId, renew };
}

function playbackRpc(input: {
    walletPublicKey: string;
    accountId?: string;
    accessKeyExists?: boolean;
    accessKeyPermission?: unknown;
    availability?: string;
    entitlement?: boolean;
    playbackId?: string;
    betaState?: unknown;
    publicUploadPolicy?: unknown;
}) {
    return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const rpc = JSON.parse(String(init?.body)) as {
            params: {
                request_type: string;
                finality?: string;
                block_id?: string;
                account_id: string;
                public_key?: string;
                method_name?: string;
            };
        };
        if (rpc.params.request_type === 'view_access_key') {
            expect(rpc.params.finality).toBe('final');
            expect(rpc.params.account_id).toBe(input.accountId ?? ACCOUNT_ID);
            expect(rpc.params.public_key).toBe(input.walletPublicKey);
            if (input.accessKeyExists === false) return Response.json({ error: { cause: 'UNKNOWN_ACCESS_KEY' } });
            return Response.json({
                result: { block_hash: BLOCK_HASH, permission: input.accessKeyPermission ?? 'FullAccess' },
            });
        }
        if (rpc.params.method_name === 'get_publication') {
            expect(rpc.params.finality).toBe('final');
            return rpcResult({
                publication_id: PUBLICATION_ID,
                generation: 1,
                playback_id: input.playbackId ?? PLAYBACK_ID,
                profile_id: 'paid-media-livepeer-v1',
                profile_config_sha256: PROFILE_HASH,
                availability: input.availability ?? 'ACTIVE',
            });
        }
        if (rpc.params.method_name === 'get_public_testnet_beta_state') {
            return rpcResult(input.betaState);
        }
        if (rpc.params.method_name === 'get_public_upload_policy') return rpcResult(input.publicUploadPolicy);
        if (rpc.params.block_id) expect(rpc.params.block_id).toBe(BLOCK_HASH);
        else expect(rpc.params.finality).toBe('final');
        expect(rpc.params.method_name).toBe('has_entitlement');
        return rpcResult(input.entitlement ?? true);
    });
}

function rpcResult(value: unknown): Response {
    return Response.json({
        result: {
            block_hash: BLOCK_HASH,
            result: Array.from(new TextEncoder().encode(JSON.stringify(value))),
        },
    });
}

function canonicalPlaybackRequest(request: Record<string, string>): string {
    return [
        request.domain,
        request.version,
        request.network,
        request.contract_id,
        request.account_id,
        request.origin,
        request.request_nonce,
        request.request_expires_at_ms,
        request.body_sha256,
        request.certificate_sha256,
    ].join('\n');
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map((key) => (
            `${JSON.stringify(key)}:${canonicalJson(object[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64(value: Uint8Array): string {
    return btoa(String.fromCharCode(...value));
}

function base64Url(value: Uint8Array): string {
    return base64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodePart(value: string): Record<string, unknown> {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
}

describe('stateless playback v2', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('denies new public-beta tokens at the exact end time before entitlement or provider reads', async () => {
        const now = 1_785_589_300_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const { env } = await createEnv();
        Object.assign(env, {
            LIVEPEER_NEW_UPLOADS_ENABLED: 'true',
            LIVEPEER_PROVIDER_MUTATIONS_ENABLED: 'true',
            LIVEPEER_OPERATOR_MUTATIONS_ENABLED: 'true',
            LIVEPEER_OPERATOR_JOB_ID: '',
            LIVEPEER_SPONSORED_UPLOADS_ENABLED: 'true',
            LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED: 'true',
            LIVEPEER_CREATOR_ALLOWLIST: '*',
            LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '20000000',
            LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '2000000',
            PUBLIC_BETA_RATE_LIMITER: {
                limit: vi.fn().mockResolvedValue({ success: true }),
            } as RateLimit,
        });
        const signed = await playbackRequest();
        const dependencies = playbackDependencies({
            ...signed,
            betaState: {
                version: 1,
                started_at_ms: String(now - 14 * 24 * 60 * 60 * 1_000),
                upload_closes_at_ms: String(now - 24 * 60 * 60 * 1_000),
                ends_at_ms: String(now),
                closed_at_ms: null,
                total_job_count: 2,
            },
        });
        vi.stubGlobal('fetch', dependencies.fetcher);

        const response = await handler.fetch(signed.request, env);

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'playback_denied' });
        expect(dependencies.provider).not.toHaveBeenCalled();
        expect(dependencies.rpc).toHaveBeenCalledOnce();
    });

    it('issues a 180-second JWT from final chain reads without touching Durable Object state', async () => {
        const { env, verifyKey, idFromName } = await createEnv();
        const signed = await playbackRequest();
        const dependencies = playbackDependencies(signed);
        vi.stubGlobal('fetch', dependencies.fetcher);

        const response = await handler.fetch(signed.request.clone(), env);

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(idFromName).not.toHaveBeenCalled();
        expect(dependencies.rpc).toHaveBeenCalledTimes(3);
        expect(dependencies.provider).toHaveBeenCalledOnce();
        const result = await response.json() as Record<string, string>;
        expect(result).toMatchObject({
            schema: 'youtick.livepeer-playback-token.v2',
            playback_id: PLAYBACK_ID,
            hls_url: `https://playback.livepeer.studio/asset/hls/${PLAYBACK_ID}/index.m3u8`,
        });
        const [headerPart, payloadPart, signaturePart] = result.token.split('.');
        const payload = decodePart(payloadPart);
        expect(Number(payload.exp) - Number(payload.iat)).toBe(180);
        expect(payload.sub).toBe(PLAYBACK_ID);
        const signature = Uint8Array.from(
            atob(signaturePart.replace(/-/g, '+').replace(/_/g, '/').padEnd(88, '=')),
            (character) => character.charCodeAt(0),
        );
        expect(await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            verifyKey,
            signature,
            new TextEncoder().encode(`${headerPart}.${payloadPart}`),
        )).toBe(true);

        const replay = await handler.fetch(signed.request, env);
        expect(replay.status).toBe(200);
        expect(idFromName).not.toHaveBeenCalled();
        expect(dependencies.rpc).toHaveBeenCalledTimes(3);
        expect(dependencies.provider).toHaveBeenCalledOnce();
    });

    it('counts the beta policy read for initial, cached and fresh renewal requests', async () => {
        let now = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const { env } = await createEnv();
        Object.assign(env, {
            LIVEPEER_NEW_UPLOADS_ENABLED: 'true',
            LIVEPEER_PROVIDER_MUTATIONS_ENABLED: 'true',
            LIVEPEER_OPERATOR_MUTATIONS_ENABLED: 'true',
            LIVEPEER_OPERATOR_JOB_ID: '',
            LIVEPEER_SPONSORED_UPLOADS_ENABLED: 'true',
            LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED: 'true',
            LIVEPEER_CREATOR_ALLOWLIST: '*',
            LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS: '20000000',
            LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS: '2000000',
            PUBLIC_BETA_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) } as RateLimit,
        });
        const signed = await playbackRequest();
        const dependencies = playbackDependencies({
            ...signed, betaState: { version: 1, ends_at_ms: String(now + 86400000), closed_at_ms: null },
        });
        vi.stubGlobal('fetch', dependencies.fetcher);
        const initial = await handler.fetch(signed.request, env);
        expect(initial.status).toBe(200);
        expect((await handler.fetch(await signed.renew(), env)).status).toBe(200);
        expect(dependencies.rpc).toHaveBeenCalledTimes(5);
        now += 150_000;
        const renewed = await handler.fetch(await signed.renew(), env);
        expect(renewed.status).toBe(200);
        expect((await renewed.json() as { token: string }).token)
            .not.toBe((await initial.json() as { token: string }).token);
        const measurements = info.mock.calls.map(([value]) => JSON.parse(String(value)))
            .filter((entry) => entry.event === 'stateless_playback_authorization_completed');
        expect(measurements.map(({ details }) => [details.cacheResult, details.rpcCalls, details.policyRpcCalls]))
            .toEqual([['MISS', 4, 1], ['HIT', 1, 1], ['MISS', 3, 1]]);
        expect(dependencies.rpc).toHaveBeenCalledTimes(8);
    });

    it('checks the public policy while uploads are closed without reading a legacy beta deadline', async () => {
        const { env } = await createEnv();
        Object.assign(env, {
            VIDEO_ENVIRONMENT: 'public-testnet', LIVEPEER_NEW_UPLOADS_ENABLED: 'false',
            LIVEPEER_PROVIDER_MUTATIONS_ENABLED: 'false',
            PUBLIC_BETA_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) } as RateLimit,
        });
        const signed = await playbackRequest();
        const dependencies = playbackDependencies({ ...signed, publicUploadPolicy: {
            version: 1, environment: 'public-testnet', network: 'testnet', market_contract_id: MARKET_ID,
            max_source_bytes: '5000000000', job_ttl_ms: '86400000', signed_quote_required: true,
            profiles: [{ profile_id: 'paid-media-livepeer-v1', profile_config_sha256: PROFILE_HASH }],
        } });
        vi.stubGlobal('fetch', dependencies.fetcher);
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        expect((await handler.fetch(signed.request, env)).status).toBe(200);
        expect((await handler.fetch(await signed.renew(), env)).status).toBe(200);
        expect(dependencies.rpc).toHaveBeenCalledTimes(5);
        const completed = info.mock.calls.map(([value]) => JSON.parse(String(value)))
            .filter((entry) => entry.event === 'stateless_playback_authorization_completed');
        expect(completed.map((entry) => entry.details.rpcCalls)).toEqual([4, 1]);
    });

    it.each([
        ['expired certificate', { certificateExpiresAtMs: Date.now() - 1 }, undefined, 403, 'playback_denied'],
        ['wrong origin', { requestOrigin: 'https://other.example' }, undefined, 400, 'protocol_binding_mismatch'],
        ['invalid device signature', { requestSignature: base64(new Uint8Array(64)) }, undefined, 403, 'playback_denied'],
        ['invalid wallet signature', { certificateSignature: base64(new Uint8Array(64)) }, undefined, 403, 'playback_denied'],
        ['removed wallet key', {}, { accessKeyExists: false }, 403, 'playback_denied'],
        ['non-wallet function-call key', {}, { accessKeyPermission: { FunctionCall: {} } }, 403, 'playback_denied'],
        ['wrong playback', {}, { playbackId: 'other_playback' }, 403, 'playback_denied'],
        ['takedown', {}, { availability: 'TAKEDOWN' }, 403, 'playback_denied'],
        ['missing entitlement', {}, { entitlement: false }, 403, 'playback_denied'],
    ])('fails closed for %s', async (_label, requestOverride, rpcOverride, status, code) => {
        const { env, idFromName } = await createEnv();
        const signed = await playbackRequest(requestOverride);
        const dependencies = playbackDependencies({ ...signed, ...rpcOverride });
        vi.stubGlobal('fetch', dependencies.fetcher);

        const response = await handler.fetch(signed.request, env);

        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error: code });
        expect(idFromName).not.toHaveBeenCalled();
    });

    it('fails closed when the provider playback policy is no longer JWT protected', async () => {
        const { env, idFromName } = await createEnv();
        const signed = await playbackRequest();
        const dependencies = playbackDependencies({ ...signed, providerPolicy: 'public' });
        vi.stubGlobal('fetch', dependencies.fetcher);

        const response = await handler.fetch(signed.request, env);

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'playback_denied' });
        expect(dependencies.rpc).toHaveBeenCalledTimes(3);
        expect(dependencies.provider).toHaveBeenCalledOnce();
        expect(idFromName).not.toHaveBeenCalled();
    });

    it('classifies playback dependency outages as internal SLO failures', async () => {
        const { env } = await createEnv();
        const signed = await playbackRequest();
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rpc_down'); }));
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const response = await handler.fetch(signed.request, env);

        expect(response.status).toBe(503);
        expect(errorLog.mock.calls.map(([value]) => JSON.parse(String(value)))).toContainEqual({
            event: 'stateless_playback_request_failed',
            details: { code: 'playback_authorization_unavailable', httpCode: 503, latencyMs: expect.any(Number) },
        });
    });

    it('rechecks final publication after the 30-second cache bound and blocks takedown', async () => {
        let now = 1_785_589_310_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const { env } = await createEnv();
        const signed = await playbackRequest();
        const dependencyInput = { ...signed, availability: 'ACTIVE' };
        const dependencies = playbackDependencies(dependencyInput);
        vi.stubGlobal('fetch', dependencies.fetcher);

        expect((await handler.fetch(signed.request.clone(), env)).status).toBe(200);
        now += 30_000;
        dependencyInput.availability = 'TAKEDOWN';
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const blocked = await handler.fetch(signed.request, env);

        expect(blocked.status).toBe(403);
        expect(await blocked.json()).toEqual({ error: 'playback_denied' });
        expect(dependencies.rpc).toHaveBeenCalledTimes(4);
        expect(dependencies.provider).toHaveBeenCalledOnce();
        expect(warning.mock.calls.map(([value]) => JSON.parse(String(value)))).toContainEqual({
            event: 'takedown_playback_token_attempted',
            details: { protocol: 'DEVICE_SESSION_CERTIFICATE' },
        });
    });

    it('rechecks the wallet key after the 60-second certificate cache bound', async () => {
        let now = 1_785_589_310_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const { env } = await createEnv();
        const signed = await playbackRequest();
        const dependencyInput = { ...signed, accessKeyExists: true };
        const dependencies = playbackDependencies(dependencyInput);
        vi.stubGlobal('fetch', dependencies.fetcher);

        expect((await handler.fetch(signed.request.clone(), env)).status).toBe(200);
        now += 60_000;
        dependencyInput.accessKeyExists = false;
        const blocked = await handler.fetch(signed.request, env);

        expect(blocked.status).toBe(403);
        expect(await blocked.json()).toEqual({ error: 'playback_denied' });
        expect(dependencies.rpc).toHaveBeenCalledTimes(4);
        expect(dependencies.provider).toHaveBeenCalledOnce();
    });

    it.runIf(abuseTestEnabled)(
        'rejects 100k unauthorized requests without external, DO or cache growth',
        async () => {
            const { env, idFromName } = await createEnv();
            const signed = await playbackRequest();
            const body = await signed.request.text();
            const external = vi.fn();
            vi.stubGlobal('fetch', external);
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const cacheRecordsBefore = playbackAuthorizationCacheRecordCount();
            let denied = 0;

            for (let batch = 0; batch < 1_000; batch += 1) {
                const responses = await Promise.all(Array.from({ length: 100 }, () => handler.fetch(
                    new Request('https://bridge.youtick.net/v2/playback-tokens', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Origin: 'https://denied.example' },
                        body,
                    }),
                    env,
                )));
                denied += responses.filter((response) => response.status === 400).length;
            }

            expect(denied).toBe(100_000);
            expect(external).not.toHaveBeenCalled();
            expect(idFromName).not.toHaveBeenCalled();
            expect(playbackAuthorizationCacheRecordCount()).toBe(cacheRecordsBefore);
        },
        120_000,
    );

    it.runIf(loadTestEnabled)(
        'keeps 1k authorized warm requests below the local 500ms p95 target',
        async () => {
            const { env, idFromName } = await createEnv();
            const signed = await playbackRequest();
            const body = await signed.request.clone().text();
            const dependencies = playbackDependencies(signed);
            vi.stubGlobal('fetch', dependencies.fetcher);
            const infoLog = vi.spyOn(console, 'info').mockImplementation(() => undefined);
            const warm = await handler.fetch(signed.request, env);
            expect(warm.status).toBe(200);
            const latencies: number[] = [];
            let errors = 0;

            for (let batch = 0; batch < 20; batch += 1) {
                const responses = await Promise.all(Array.from({ length: 50 }, async () => {
                    const startedAt = performance.now();
                    const response = await handler.fetch(new Request(
                        'https://bridge.youtick.net/v2/playback-tokens',
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
                            body,
                        },
                    ), env);
                    latencies.push(performance.now() - startedAt);
                    return response;
                }));
                errors += responses.filter((response) => response.status !== 200).length;
            }

            const ordered = [...latencies].sort((left, right) => left - right);
            const p95 = ordered[Math.ceil(ordered.length * 0.95) - 1];
            infoLog.mockRestore();
            const benchmark = JSON.stringify({
                benchmark: 'playback_v2_warm_local',
                evidenceClass: 'LOCAL_TEST',
                distinctAccounts: 1,
                concurrency: 50,
                mediaDelivery: 'EXTERNAL_NOT_RUN',
                requests: latencies.length,
                p95Ms: Number(p95.toFixed(3)),
                errors,
            });
            (globalThis as unknown as {
                process?: { stdout?: { write: (value: string) => void } };
            }).process?.stdout?.write(`${benchmark}\n`);
            expect(errors / latencies.length).toBeLessThan(0.005);
            expect(p95).toBeLessThan(500);
            expect(dependencies.rpc).toHaveBeenCalledTimes(3);
            expect(dependencies.provider).toHaveBeenCalledOnce();
            expect(idFromName).not.toHaveBeenCalled();
            expect(playbackAuthorizationCacheRecordCount()).toBeLessThanOrEqual(1024);
        },
        120_000,
    );

    it.runIf(loadTestEnabled)('measures 1k distinct local identities without claiming media capacity', async () => {
        let now = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const { env, idFromName } = await createEnv();
        const identities = await Promise.all(Array.from({ length: 1000 }, (_, i) => (
            playbackRequest({ accountId: `viewer-${i}.testnet` })
        )));
        const rpcByAccount = new Map(identities.map((identity) => [identity.accountId, playbackRpc(identity)]));
        const firstRpc = rpcByAccount.get(identities[0].accountId)!;
        const external = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            if (String(url).startsWith('https://livepeer.studio/api/playback/')) {
                return Response.json({ type: 'vod', meta: { playbackPolicy: { type: 'jwt' }, source: [] } });
            }
            const { params } = JSON.parse(String(init?.body));
            const accountId = params.request_type === 'view_access_key' ? params.account_id
                : params.method_name === 'has_entitlement'
                    ? JSON.parse(atob(params.args_base64)).account_id : identities[0].accountId;
            return (rpcByAccount.get(accountId) ?? firstRpc)(url, init);
        });
        vi.stubGlobal('fetch', external);
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        expect(new Set(identities.map((identity) => identity.walletPublicKey)).size).toBe(1000);

        for (const scenario of ['initial', 'short_repeat', 'renewal_after_150s']) {
            if (scenario === 'renewal_after_150s') now += 150_000;
            const requests = await Promise.all(identities.map((identity) => identity.renew()));
            info.mockClear();
            external.mockClear();
            const latencies: number[] = [];
            const responses = await Promise.all(requests.map(async (request) => {
                const started = performance.now();
                const response = await handler.fetch(request, env);
                latencies.push(performance.now() - started);
                return response;
            }));
            const completed = info.mock.calls.map(([value]) => JSON.parse(String(value)))
                .filter((entry) => entry.event === 'stateless_playback_authorization_completed');
            const errors = responses.filter((response) => response.status !== 200).length;
            const ordered = latencies.sort((a, b) => a - b);
            const rpcCalls = completed.reduce((sum, entry) => sum + entry.details.rpcCalls, 0);
            const providerCalls = completed.reduce((sum, entry) => sum + entry.details.providerCalls, 0);
            const report = {
                benchmark: 'playback_v2_distinct_local', scenario, evidenceClass: 'LOCAL_TEST',
                distinctAccounts: identities.length, concurrency: requests.length, requests: requests.length,
                p95Ms: Number(ordered[Math.ceil(ordered.length * 0.95) - 1].toFixed(3)),
                errors, cacheHits: completed.filter((entry) => entry.details.cacheResult === 'HIT').length,
                rpcCalls, providerCalls, cacheRecords: playbackAuthorizationCacheRecordCount(),
                mediaDelivery: 'EXTERNAL_NOT_RUN', expiryClock: 'SIMULATED',
            };
            (globalThis as unknown as { process: { stdout: { write: (value: string) => void } } })
                .process.stdout.write(`${JSON.stringify(report)}\n`);
            expect(errors).toBe(0);
            expect(completed).toHaveLength(1000);
            expect(rpcCalls + providerCalls).toBe(external.mock.calls.length);
            expect(playbackAuthorizationCacheRecordCount()).toBeLessThanOrEqual(1024);
        }
        expect(idFromName).not.toHaveBeenCalled();
    }, 120_000);

    it('is fail-closed unless the independent v2 gate is enabled', async () => {
        const { env } = await createEnv();
        env.LIVEPEER_PLAYBACK_V2_ENABLED = 'false';
        const signed = await playbackRequest();
        const rpc = vi.fn();
        vi.stubGlobal('fetch', rpc);

        const response = await handler.fetch(signed.request, env);

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'control_plane_disabled' });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('is fail-closed when all playback issuance is disabled', async () => {
        const { env } = await createEnv();
        env.LIVEPEER_PLAYBACK_ISSUANCE_ENABLED = 'false';
        const signed = await playbackRequest();
        const rpc = vi.fn();
        vi.stubGlobal('fetch', rpc);

        const response = await handler.fetch(signed.request, env);

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'control_plane_disabled' });
        expect(rpc).not.toHaveBeenCalled();
    });
});
