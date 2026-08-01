import { KeyPair } from 'near-api-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { LivepeerControl, type Env } from './index';

const RPC_URL = 'https://rpc.testnet.near.org';
const CONTRACT_ID = 'paid-media-livepeer-v1.testnet';
const OPERATOR_ID = 'livepeer-bridge.testnet';
const BLOCK_HASH = '11111111111111111111111111111111';
const API_KEY = 'test-livepeer-api-key';
const WEBHOOK_SECRET = 'test-livepeer-webhook-secret';
const PROJECT_ID = 'project-123';
const TOKEN_NAME = 'paid-media-canary';
const ASSET_ID = 'asset-123';
const PLAYBACK_ID = 'playback-123';
const EXPECTED_BYTES = '20000000';

type TestState = {
    state: DurableObjectState;
    values: Map<string, unknown>;
};

function createState(): TestState {
    const values = new Map<string, unknown>();
    let transactionTail = Promise.resolve();
    const get = async <T>(key: string) => structuredClone(values.get(key)) as T | undefined;
    const put = async (key: string, value: unknown) => values.set(key, structuredClone(value));
    const remove = async (key: string) => values.delete(key);
    const storage = {
        get,
        put,
        delete: remove,
        transaction: async <T>(callback: (transaction: {
            get: typeof get;
            put: typeof put;
        }) => Promise<T>) => {
            const run = transactionTail.then(() => callback({ get, put }));
            transactionTail = run.then(() => undefined, () => undefined);
            return run;
        },
    };
    return { state: { storage } as unknown as DurableObjectState, values };
}

function createEnv(overrides?: Partial<Env>): Env {
    const key = KeyPair.fromRandom('ed25519');
    return {
        LIVEPEER_BRIDGE_ENABLED: 'true',
        LIVEPEER_API_KEY: API_KEY,
        LIVEPEER_PROJECT_ID: PROJECT_ID,
        LIVEPEER_API_TOKEN_NAME: TOKEN_NAME,
        LIVEPEER_WEBHOOK_SECRET: WEBHOOK_SECRET,
        NEAR_NETWORK: 'testnet',
        NEAR_RPC_URL: RPC_URL,
        MARKET_CONTRACT_ID: CONTRACT_ID,
        NEAR_OPERATOR_ACCOUNT_ID: OPERATOR_ID,
        NEAR_OPERATOR_PRIVATE_KEY: key.toString(),
        NEAR_OPERATOR_KEY_EPOCH: '1',
        ...overrides,
    };
}

function jobRecord() {
    return {
        schema: 'youtick.livepeer-control-job.v1',
        state: 'UPLOAD_READY',
        network: 'testnet',
        contractId: CONTRACT_ID,
        jobId: 'job-001',
        generation: 1,
        creator: 'creator.testnet',
        expectedSourceBytes: EXPECTED_BYTES,
        profileId: 'paid-media-livepeer-v1',
        profileConfigSha256: '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77',
        createdAtMs: Date.now(),
        assetId: ASSET_ID,
        playbackId: PLAYBACK_ID,
        projectId: PROJECT_ID,
        tusEndpoint: 'https://origin.livepeer.com/api/asset/upload/tus?token=secret',
    };
}

function providerAsset(overrides?: Record<string, unknown>) {
    return {
        id: ASSET_ID,
        playbackId: PLAYBACK_ID,
        projectId: PROJECT_ID,
        createdByTokenName: TOKEN_NAME,
        creatorId: { type: 'unverified', value: 'job-001:1' },
        name: 'youtick-job-001-g1',
        playbackPolicy: { type: 'jwt' },
        status: { phase: 'ready', updatedAt: 1_785_589_200_000 },
        size: Number(EXPECTED_BYTES),
        hash: [{ algorithm: 'sha256', hash: 'd'.repeat(64) }],
        downloadUrl: `https://livepeercdn.com/asset/${PLAYBACK_ID}/video`,
        ...overrides,
    };
}

function providerPlayback(overrides?: Record<string, unknown>) {
    return {
        type: 'vod',
        meta: {
            playbackPolicy: { type: 'jwt' },
            source: [
                {
                    type: 'html5/application/vnd.apple.mpegurl',
                    url: `https://playback.livepeer.studio/hls/${PLAYBACK_ID}/index.m3u8`,
                },
                {
                    type: 'html5/video/mp4',
                    url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/static720p0.mp4`,
                    width: 1280,
                    height: 720,
                    bitrate: 3_000_000,
                },
            ],
            ...overrides,
        },
    };
}

function webhook(event = 'asset.ready', timestamp = Date.now()) {
    return {
        id: 'provider-event-id-is-not-trusted',
        webhookId: 'webhook-123',
        createdAt: timestamp - 1,
        timestamp,
        event,
        payload: {
            asset: {
                id: ASSET_ID,
                creatorId: { type: 'unverified', value: 'job-001:1' },
                status: { phase: event === 'asset.ready' ? 'ready' : 'processing' },
            },
        },
    };
}

function internalWebhookRequest(value = webhook()): Request {
    return new Request('https://object/internal/livepeer-webhook', {
        method: 'POST',
        body: JSON.stringify(value),
    });
}

async function signedWebhookRequest(value: ReturnType<typeof webhook>, secret = WEBHOOK_SECRET): Promise<Request> {
    const raw = JSON.stringify(value);
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const signature = hex(new Uint8Array(await crypto.subtle.sign(
        'HMAC', key, new TextEncoder().encode(raw),
    )));
    return new Request('https://bridge.youtick.net/v1/livepeer-webhooks', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Livepeer-Signature': `t=${value.timestamp},v1=${signature}`,
        },
        body: raw,
    });
}

function publication(jobId = 'job-001') {
    return {
        job_id: jobId,
        generation: 1,
        creator_id: 'creator.testnet',
        expected_source_bytes: EXPECTED_BYTES,
        profile_id: 'paid-media-livepeer-v1',
        profile_config_sha256: '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77',
        asset_id_hash: 'b'.repeat(64),
        playback_id: `${PLAYBACK_ID}-${jobId}`,
        project_id_hash: 'c'.repeat(64),
        verified_source_bytes: EXPECTED_BYTES,
        provider_source_fingerprint: 'd'.repeat(64),
        ready_at_ms: '1785589200000',
        availability: 'ACTIVE',
    };
}

async function finalizeRequest(value = publication()): Promise<Request> {
    const payloadSha256 = await sha256(canonicalJson({ submission: value }));
    return new Request('https://object/internal/finalize', {
        method: 'POST',
        body: JSON.stringify({
            idempotencyKey: `${value.job_id}:${value.generation}:finalize`,
            payloadSha256,
            submission: value,
        }),
    });
}

function contractPublication(value: ReturnType<typeof publication>) {
    return {
        publication_id: value.job_id,
        ...value,
        published_availability: value.availability,
        availability: value.availability,
    };
}

function rpcResult(value: unknown): Response {
    return Response.json({
        result: {
            block_hash: BLOCK_HASH,
            result: Array.from(new TextEncoder().encode(JSON.stringify(value))),
        },
    });
}

function operatorRpc(options?: {
    onSend?: (signedTx: string) => void;
    publicationFor?: (jobId: string) => unknown;
    sendThrowsOnce?: boolean;
    methodNames?: string[];
}) {
    let sendCount = 0;
    return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
            method: string;
            params: Record<string, unknown>;
        };
        if (body.method === 'query' && body.params.request_type === 'view_access_key') {
            return Response.json({
                result: {
                    nonce: 10,
                    block_hash: BLOCK_HASH,
                    permission: {
                        FunctionCall: {
                            allowance: '8000000000000000000000',
                            receiver_id: CONTRACT_ID,
                            method_names: options?.methodNames
                                ?? ['finalize_livepeer_publication', 'suspend_livepeer_sales'],
                        },
                    },
                },
            });
        }
        if (body.method === 'query' && body.params.method_name === 'get_publication') {
            const args = JSON.parse(new TextDecoder().decode(base64Decode(String(body.params.args_base64)))) as {
                publication_id: string;
            };
            return rpcResult(options?.publicationFor?.(args.publication_id) ?? null);
        }
        if (body.method === 'tx') {
            return Response.json({ error: { cause: { name: 'UNKNOWN_TRANSACTION' } } });
        }
        if (body.method === 'send_tx') {
            sendCount += 1;
            options?.onSend?.(String(body.params.signed_tx_base64));
            if (options?.sendThrowsOnce && sendCount === 1) throw new Error('network timeout');
            return Response.json({ result: { status: { SuccessValue: '' } } });
        }
        throw new Error(`unexpected_rpc:${body.method}`);
    });
}

function hex(value: Uint8Array): string {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Decode(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
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
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

describe('Livepeer bridge PR-4 finalize flow', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('verifies the exact raw webhook body and safely ignores unknown events', async () => {
        const objectFetch = vi.fn(async () => Response.json({ accepted: true }));
        const namespace = {
            idFromName: vi.fn(() => ({ toString: () => 'id' })),
            get: vi.fn(() => ({ fetch: objectFetch })),
        } as unknown as DurableObjectNamespace;
        const env = createEnv({ LIVEPEER_CONTROL: namespace });

        const invalid = await handler.fetch(await signedWebhookRequest(webhook(), 'wrong-secret-value'), env);
        expect(invalid.status).toBe(403);
        expect(objectFetch).not.toHaveBeenCalled();

        const unknown = await handler.fetch(await signedWebhookRequest(webhook('stream.started')), env);
        expect(unknown.status).toBe(202);
        expect(await unknown.json()).toEqual({ accepted: true, ignored: true });
        expect(objectFetch).not.toHaveBeenCalled();

        const processing = await handler.fetch(await signedWebhookRequest(webhook('asset.updated')), env);
        expect(processing.status).toBe(200);
        expect(namespace.idFromName).toHaveBeenCalledWith(
            'job:testnet:paid-media-livepeer-v1.testnet:job-001:1',
        );
        expect(objectFetch).toHaveBeenCalledOnce();
    });

    it.each([
        ['project', providerAsset({ projectId: 'wrong-project' }), providerPlayback(), 'provider_identity_mismatch'],
        ['token', providerAsset({ createdByTokenName: 'wrong-token' }), providerPlayback(), 'provider_identity_mismatch'],
        ['policy', providerAsset({ playbackPolicy: { type: 'public' } }), providerPlayback(), 'provider_state_invalid'],
        ['playback', providerAsset(), providerPlayback({ playbackPolicy: { type: 'public' } }), 'provider_playback_mismatch'],
        ['size', providerAsset({ size: Number(EXPECTED_BYTES) + 1 }), providerPlayback(), 'provider_state_invalid'],
    ])('fails closed on wrong provider %s', async (_name, asset, playback, code) => {
        const testState = createState();
        testState.values.set('job:v1', jobRecord());
        const control = new LivepeerControl(testState.state, createEnv());
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (
            String(input).includes(`/asset/${ASSET_ID}`)
                ? Response.json(asset)
                : Response.json(playback)
        )));

        const response = await control.fetch(internalWebhookRequest());
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: code });
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'UPLOAD_READY' });
    });

    it('deduplicates ready transitions, proves private playback, and clears the TUS capability', async () => {
        const testState = createState();
        testState.values.set('job:v1', jobRecord());
        const operatorFetch = vi.fn(async () => Response.json({ accepted: true, finalized: true }));
        const env = createEnv({
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'operator-id' })),
                get: vi.fn(() => ({ fetch: operatorFetch })),
            } as unknown as DurableObjectNamespace,
        });
        const control = new LivepeerControl(testState.state, env);
        const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes(`/asset/${ASSET_ID}`)) return Response.json(providerAsset());
            if (url.includes(`/playback/${PLAYBACK_ID}`)) return Response.json(providerPlayback());
            return new Response(null, { status: 403 });
        });
        vi.stubGlobal('fetch', providerFetch);
        const readyEvent = webhook();

        const first = await control.fetch(internalWebhookRequest(readyEvent));
        expect(first.status).toBe(200);
        expect(testState.values.get('job:v1')).toMatchObject({
            state: 'ONCHAIN_PUBLISHED',
            publication: { playback_id: PLAYBACK_ID, verified_source_bytes: EXPECTED_BYTES },
        });
        expect(testState.values.get('job:v1')).not.toHaveProperty('tusEndpoint');
        expect(providerFetch).toHaveBeenCalledTimes(14);
        expect(operatorFetch).toHaveBeenCalledOnce();

        const duplicate = await control.fetch(internalWebhookRequest(readyEvent));
        expect(duplicate.status).toBe(200);
        expect(await duplicate.json()).toMatchObject({ duplicate: true, finalized: true });
        expect(providerFetch).toHaveBeenCalledTimes(14);
        expect(operatorFetch).toHaveBeenCalledOnce();
    });

    it('accepts one concurrent ready-event verifier', async () => {
        const testState = createState();
        testState.values.set('job:v1', jobRecord());
        let releaseAsset!: () => void;
        const assetGate = new Promise<void>((resolve) => {
            releaseAsset = resolve;
        });
        const operatorFetch = vi.fn(async () => Response.json({ accepted: true, finalized: true }));
        const control = new LivepeerControl(testState.state, createEnv({
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'operator-id' })),
                get: vi.fn(() => ({ fetch: operatorFetch })),
            } as unknown as DurableObjectNamespace,
        }));
        const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes(`/asset/${ASSET_ID}`)) {
                await assetGate;
                return Response.json(providerAsset());
            }
            if (url.includes(`/playback/${PLAYBACK_ID}`)) return Response.json(providerPlayback());
            return new Response(null, { status: 403 });
        });
        vi.stubGlobal('fetch', providerFetch);
        const readyEvent = webhook();

        const first = control.fetch(internalWebhookRequest(readyEvent));
        await vi.waitFor(() => expect(providerFetch).toHaveBeenCalledOnce());
        const duplicate = await control.fetch(internalWebhookRequest(readyEvent));
        expect(duplicate.status).toBe(202);
        expect(await duplicate.json()).toMatchObject({ duplicate: true, processing: true });
        releaseAsset();
        expect((await first).status).toBe(200);
        expect(providerFetch.mock.calls.filter(([input]) => (
            String(input).includes(`/asset/${ASSET_ID}`)
        ))).toHaveLength(1);
    });

    it('reuses the persisted signed transaction after a crash-like broadcast timeout', async () => {
        const testState = createState();
        const env = createEnv();
        const control = new LivepeerControl(testState.state, env);
        const sent: string[] = [];
        let finalized = false;
        const rpc = operatorRpc({
            sendThrowsOnce: true,
            onSend: (signedTx) => {
                if (sent.length === 0) {
                    expect(testState.values.get('outbox:job-001:1:finalize')).toMatchObject({
                        state: 'SIGNED',
                        signedTxBase64: signedTx,
                        txHash: expect.any(String),
                    });
                }
                sent.push(signedTx);
                if (sent.length === 2) finalized = true;
            },
            publicationFor: () => finalized ? contractPublication(publication()) : null,
        });
        vi.stubGlobal('fetch', rpc);

        const first = await control.fetch(await finalizeRequest());
        expect(first.status).toBe(202);
        const second = await control.fetch(await finalizeRequest());
        expect(second.status).toBe(200);
        expect(await second.json()).toMatchObject({ finalized: true });
        expect(sent).toHaveLength(2);
        expect(sent[1]).toBe(sent[0]);
        expect(testState.values.get('outbox:job-001:1:finalize')).toMatchObject({
            state: 'CONFIRMED',
            nonce: '11',
        });
    });

    it('rejects a conflicting final chain tuple instead of declaring success', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv());
        const wrong = contractPublication(publication());
        wrong.playback_id = 'wrong-playback-id';
        vi.stubGlobal('fetch', operatorRpc({ publicationFor: () => wrong }));

        const response = await control.fetch(await finalizeRequest());
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'near_finalize_mismatch' });
        expect(testState.values.get('outbox:job-001:1:finalize')).toMatchObject({ state: 'PENDING' });
    });

    it.each([
        [['finalize_livepeer_publication']],
        [['finalize_livepeer_publication', 'suspend_livepeer_sales', 'withdraw']],
    ])('rejects an operator key without the exact method allowlist', async (methodNames) => {
        const control = new LivepeerControl(createState().state, createEnv());
        vi.stubGlobal('fetch', operatorRpc({ methodNames }));

        const response = await control.fetch(await finalizeRequest());
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'runtime_not_configured' });
    });

    it('serializes two jobs onto distinct nonces and confirms the exact chain tuples', async () => {
        const testState = createState();
        const env = createEnv();
        const control = new LivepeerControl(testState.state, env);
        const finalized = new Set<string>();
        const order = ['job-001', 'job-002'];
        const sent: string[] = [];
        vi.stubGlobal('fetch', operatorRpc({
            onSend: (signedTx) => {
                sent.push(signedTx);
                finalized.add(order[sent.length - 1]);
            },
            publicationFor: (jobId) => finalized.has(jobId)
                ? contractPublication(publication(jobId))
                : null,
        }));

        const [first, second] = await Promise.all([
            control.fetch(await finalizeRequest(publication('job-001'))),
            control.fetch(await finalizeRequest(publication('job-002'))),
        ]);
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(sent).toHaveLength(2);
        expect(sent[0]).not.toBe(sent[1]);
        expect(testState.values.get('outbox:job-001:1:finalize')).toMatchObject({ nonce: '11' });
        expect(testState.values.get('outbox:job-002:1:finalize')).toMatchObject({ nonce: '12' });
    });
});
