import { KeyPair } from 'near-api-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { LivepeerControl, type Env } from './index';

const ORIGIN = 'https://youtick.net';
const RPC_URL = 'https://rpc.testnet.near.org';
const MARKET_ID = 'paid-media-livepeer-v1.testnet';
const ACCESS_ID = 'access.testnet';
const BLOCK_HASH = '11111111111111111111111111111111';
const JOB_ID = 'job-001';
const PLAYBACK_ID = 'playback_001';
const ACCOUNT_ID = 'buyer.testnet';
const DEVICE_HASH = 'a'.repeat(64);

type TestState = {
    state: DurableObjectState;
    values: Map<string, unknown>;
};

function createState(): TestState {
    const values = new Map<string, unknown>();
    let transactionTail = Promise.resolve();
    const get = async <T>(key: string) => structuredClone(values.get(key)) as T | undefined;
    const put = async (key: string, value: unknown) => values.set(key, structuredClone(value));
    const storage = {
        get,
        put,
        delete: async (key: string) => values.delete(key),
        transaction: async <T>(callback: (transaction: { get: typeof get; put: typeof put }) => Promise<T>) => {
            const run = transactionTail.then(() => callback({ get, put }));
            transactionTail = run.then(() => undefined, () => undefined);
            return run;
        },
    };
    return { state: { storage } as unknown as DurableObjectState, values };
}

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

async function createEnv(): Promise<{ env: Env; verifyKey: CryptoKey; testState: TestState }> {
    const keys = await jwtKeys();
    const env: Env = {
        LIVEPEER_BRIDGE_ENABLED: 'true',
        ALLOWED_ORIGINS: ORIGIN,
        NEAR_NETWORK: 'testnet',
        NEAR_RPC_URL: RPC_URL,
        MARKET_CONTRACT_ID: MARKET_ID,
        ACCESS_CONTRACT_ID: ACCESS_ID,
        LIVEPEER_JWT_PRIVATE_KEY: keys.privatePem,
        LIVEPEER_JWT_PUBLIC_KEY: keys.publicKey,
        LIVEPEER_JWT_ISSUER: ORIGIN,
    };
    const testState = createState();
    testState.values.set('job:v1', {
        schema: 'youtick.livepeer-control-job.v1',
        state: 'ONCHAIN_PUBLISHED',
        network: 'testnet',
        contractId: MARKET_ID,
        jobId: JOB_ID,
        generation: 1,
        creator: 'creator.testnet',
        expectedSourceBytes: '20000000',
        profileId: 'paid-media-livepeer-v1',
        profileConfigSha256: '9'.repeat(64),
        createdAtMs: Date.now(),
        playbackId: PLAYBACK_ID,
    });
    testState.values.set('reconcile:v1', {
        schema: 'youtick.livepeer-reconcile.v1',
        status: 'HEALTHY',
        consecutiveErrors: 0,
        nextReconcileAtMs: Date.now() + 900_000,
        lastGoodAtMs: Date.now(),
    });
    const control = new LivepeerControl(testState.state, env);
    env.LIVEPEER_CONTROL = {
        idFromName: vi.fn((name: string) => {
            expect(name).toBe(`job:testnet:${MARKET_ID}:${JOB_ID}:1`);
            return { toString: () => name };
        }),
        get: vi.fn(() => ({ fetch: (request: Request) => control.fetch(request) })),
    } as unknown as DurableObjectNamespace;
    return { env, verifyKey: keys.verifyKey, testState };
}

async function playbackRequest(overrides?: {
    resource?: string;
    accountId?: string;
    origin?: string;
}): Promise<{
    request: Request;
    publicKey: string;
    originHash: string;
}> {
    const keyPair = KeyPair.fromRandom('ed25519');
    const accountId = overrides?.accountId ?? ACCOUNT_ID;
    const origin = overrides?.origin ?? ORIGIN;
    const originHash = await sha256(origin);
    const body = {
        job_id: JOB_ID,
        generation: 1,
        playback_id: PLAYBACK_ID,
        grant_id: `play:${JOB_ID}:${accountId}`,
        origin_hash: originHash,
        device_hash: DEVICE_HASH,
        requested_ttl_seconds: 180,
    };
    const envelope = {
        domain: 'youtick.paid-media-livepeer-v1.control',
        version: '2',
        method: 'POST',
        route: '/v1/playback-tokens',
        network: 'testnet',
        contract_id: MARKET_ID,
        account_id: accountId,
        resource: overrides?.resource ?? `playback:${JOB_ID}:1:${PLAYBACK_ID}`,
        session_public_key: keyPair.getPublicKey().toString(),
        origin,
        device_nonce: base64Url(crypto.getRandomValues(new Uint8Array(32))),
        expires_at_ms: String(Date.now() + 60_000),
        body_sha256: await sha256(canonicalJson(body)),
    };
    const signature = keyPair.sign(new TextEncoder().encode(canonicalMessage(envelope))).signature;
    return {
        publicKey: envelope.session_public_key,
        originHash,
        request: new Request('https://bridge.youtick.net/v1/playback-tokens', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: origin,
                'X-Youtick-Signature': base64(signature),
            },
            body: JSON.stringify({ body, envelope }),
        }),
    };
}

function playbackRpc(input: {
    publicKey: string;
    originHash: string;
    publication?: Record<string, unknown>;
    entitlement?: boolean;
    grant?: Record<string, unknown>;
    verification?: Record<string, unknown>;
}) {
    const publication = {
        publication_id: JOB_ID,
        generation: 1,
        playback_id: PLAYBACK_ID,
        availability: 'ACTIVE',
        ...input.publication,
    };
    const grant = {
        owner_id: ACCOUNT_ID,
        session_pk: input.publicKey,
        scope: 'Play',
        resource_id: JOB_ID,
        expires_at_ms: Date.now() + 240_000,
        origin_hash: input.originHash,
        device_hash: DEVICE_HASH,
        revoked: false,
        ...input.grant,
    };
    const verification = {
        valid: true,
        owner_id: ACCOUNT_ID,
        reason: null,
        ...input.verification,
    };
    return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
            params: {
                finality?: string;
                block_id?: string;
                account_id: string;
                method_name: string;
            };
        };
        if (body.params.method_name === 'get_publication') {
            expect(body.params.finality).toBe('final');
            expect(body.params.account_id).toBe(MARKET_ID);
            return rpcResult(publication);
        }
        expect(body.params.block_id).toBe(BLOCK_HASH);
        if (body.params.method_name === 'has_entitlement') {
            expect(body.params.account_id).toBe(MARKET_ID);
            return rpcResult(input.entitlement ?? true);
        }
        expect(body.params.account_id).toBe(ACCESS_ID);
        if (body.params.method_name === 'get_session_grant') return rpcResult(grant);
        if (body.params.method_name === 'verify_session_grant') return rpcResult(verification);
        throw new Error(`unexpected_method:${body.params.method_name}`);
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

function canonicalMessage(envelope: Record<string, string>): string {
    return [
        envelope.domain,
        envelope.version,
        envelope.method,
        envelope.route,
        envelope.network,
        envelope.contract_id,
        envelope.account_id,
        envelope.resource,
        envelope.session_public_key,
        envelope.origin,
        envelope.device_nonce,
        envelope.expires_at_ms,
        envelope.body_sha256,
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

describe('Livepeer bridge PR-5 playback tokens', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('uses one final block and returns a grant-bounded ES256 token with no-store', async () => {
        const { env, verifyKey } = await createEnv();
        const signed = await playbackRequest();
        const request = signed.request.clone();
        const rpc = playbackRpc(signed);
        vi.stubGlobal('fetch', rpc);

        const response = await handler.fetch(request, env);
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const result = await response.json() as Record<string, string>;
        expect(result).toMatchObject({
            schema: 'youtick.livepeer-playback-token.v1',
            playback_id: PLAYBACK_ID,
            hls_url: `https://playback.livepeer.studio/asset/hls/${PLAYBACK_ID}/index.m3u8`,
        });
        expect(rpc).toHaveBeenCalledTimes(4);

        const [headerPart, payloadPart, signaturePart] = result.token.split('.');
        expect(decodePart(headerPart)).toEqual({ alg: 'ES256', typ: 'JWT' });
        const payload = decodePart(payloadPart);
        expect(payload).toMatchObject({
            action: 'pull',
            iss: ORIGIN,
            pub: env.LIVEPEER_JWT_PUBLIC_KEY,
            sub: PLAYBACK_ID,
            video: 'none',
        });
        expect(Number(payload.exp) - Number(payload.iat)).toBe(180);
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
        expect(replay.status).toBe(409);
        expect(await replay.json()).toEqual({ error: 'device_nonce_replayed' });
    });

    it.each([
        ['account', { grant: { owner_id: 'other.testnet' } }],
        ['origin', { grant: { origin_hash: 'b'.repeat(64) } }],
        ['device', { grant: { device_hash: 'b'.repeat(64) } }],
        ['generation', { publication: { generation: 2 } }],
        ['playback', { publication: { playback_id: 'other_playback' } }],
        ['takedown', { publication: { availability: 'TAKEDOWN' } }],
        ['revoked', { grant: { revoked: true } }],
        ['expired', { grant: { expires_at_ms: Date.now() - 1 } }],
        ['entitlement', { entitlement: false }],
    ])('fails closed on wrong %s binding', async (_name, override) => {
        const { env } = await createEnv();
        const signed = await playbackRequest();
        vi.stubGlobal('fetch', playbackRpc({ ...signed, ...override }));

        const response = await handler.fetch(signed.request, env);
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'playback_denied' });
    });

    it('shortens the token to the remaining on-chain grant lifetime', async () => {
        const { env } = await createEnv();
        const signed = await playbackRequest();
        vi.stubGlobal('fetch', playbackRpc({
            ...signed,
            grant: { expires_at_ms: Date.now() + 90_000 },
        }));

        const response = await handler.fetch(signed.request, env);
        expect(response.status).toBe(200);
        const result = await response.json() as { token: string };
        const payload = decodePart(result.token.split('.')[1]);
        expect(Number(payload.exp) - Number(payload.iat)).toBeGreaterThanOrEqual(89);
        expect(Number(payload.exp) - Number(payload.iat)).toBeLessThanOrEqual(90);
    });

    it.each(['DRIFT_BLOCKED', 'PROVIDER_UNKNOWN', 'NEAR_UNKNOWN']) (
        'does not read NEAR or issue a JWT while reconciliation is %s',
        async (status) => {
            const { env, testState } = await createEnv();
            testState.values.set('reconcile:v1', {
                schema: 'youtick.livepeer-reconcile.v1',
                status,
                consecutiveErrors: 1,
                nextReconcileAtMs: Date.now() + 60_000,
            });
            const signed = await playbackRequest();
            const rpc = vi.fn();
            vi.stubGlobal('fetch', rpc);

            const response = await handler.fetch(signed.request, env);

            expect(response.status).toBe(403);
            expect(await response.json()).toEqual({ error: 'playback_denied' });
            expect(rpc).not.toHaveBeenCalled();
        },
    );

    it('rejects a mismatched signed resource before any chain read', async () => {
        const { env } = await createEnv();
        const signed = await playbackRequest({ resource: `playback:${JOB_ID}:2:${PLAYBACK_ID}` });
        const rpc = playbackRpc(signed);
        vi.stubGlobal('fetch', rpc);

        const response = await handler.fetch(signed.request, env);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'protocol_binding_mismatch' });
        expect(rpc).not.toHaveBeenCalled();
    });
});
