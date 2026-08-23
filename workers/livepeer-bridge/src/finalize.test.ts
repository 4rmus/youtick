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
const HLS_ERROR = '#EXTM3U\n#EXT-X-ERROR:access_denied\n#EXT-X-ENDLIST\n';
const MIXED_IFRAME_HLS = '#EXTM3U\n#EXT-X-ERROR\n#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=128000,URI="iframe.m3u8"\n';
const THUMBNAIL_VTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nkeyframes_0.jpg\n';

type TestState = {
    state: DurableObjectState;
    values: Map<string, unknown>;
    alarms: number[];
};

function createState(): TestState {
    const values = new Map<string, unknown>();
    const alarms: number[] = [];
    let transactionTail = Promise.resolve();
    const get = async <T>(key: string) => structuredClone(values.get(key)) as T | undefined;
    const put = async (key: string, value: unknown) => values.set(key, structuredClone(value));
    const remove = async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        return keys.reduce((count, entry) => count + Number(values.delete(entry)), 0);
    };
    const list = async (options?: { prefix?: string; startAfter?: string; limit?: number }) => new Map(
        [...values.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .filter(([key]) => !options?.prefix || key.startsWith(options.prefix))
            .filter(([key]) => !options?.startAfter || key > options.startAfter)
            .slice(0, options?.limit ?? values.size),
    );
    const storage = {
        get,
        put,
        delete: remove,
        list,
        setAlarm: async (at: number | Date) => alarms.push(Number(at)),
        transaction: async <T>(callback: (transaction: {
            get: typeof get;
            put: typeof put;
            list: typeof list;
        }) => Promise<T>) => {
            const run = transactionTail.then(() => callback({ get, put, list }));
            transactionTail = run.then(() => undefined, () => undefined);
            return run;
        },
    };
    return { state: { storage } as unknown as DurableObjectState, values, alarms };
}

function createEnv(overrides?: Partial<Env>): Env {
    const key = KeyPair.fromRandom('ed25519');
    return {
        CF_VERSION_METADATA: {
            id: 'worker-version-test',
            tag: 'test',
            timestamp: '2026-08-08T00:00:00.000Z',
        },
        LIVEPEER_BRIDGE_ENABLED: 'true',
        LIVEPEER_NEW_UPLOADS_ENABLED: 'true',
        LIVEPEER_PROVIDER_MUTATIONS_ENABLED: 'true',
        LIVEPEER_OPERATOR_MUTATIONS_ENABLED: 'true',
        LIVEPEER_API_KEY: API_KEY,
        LIVEPEER_PROJECT_ID: PROJECT_ID,
        LIVEPEER_API_TOKEN_NAME: TOKEN_NAME,
        LIVEPEER_CREATOR_ALLOWLIST: 'creator.testnet',
        LIVEPEER_WEBHOOK_SECRET: WEBHOOK_SECRET,
        LIVEPEER_WEBHOOK_QUEUE_BATCH_SIZE: '10',
        LIVEPEER_WEBHOOK_QUEUE_BATCH_TIMEOUT_SECONDS: '5',
        LIVEPEER_WEBHOOK_QUEUE_MAX_RETRIES: '3',
        LIVEPEER_WEBHOOK_QUEUE_MAX_CONCURRENCY: '1',
        LIVEPEER_WEBHOOK_QUEUE_RETENTION_SECONDS: '345600',
        LIVEPEER_WEBHOOK_QUEUE_DLQ: 'youtick-livepeer-events-dlq-testnet',
        NEAR_NETWORK: 'testnet',
        NEAR_RPC_URL: RPC_URL,
        MARKET_CONTRACT_ID: CONTRACT_ID,
        NEAR_OPERATOR_ACCOUNT_ID: OPERATOR_ID,
        NEAR_OPERATOR_PRIVATE_KEY: key.toString(),
        NEAR_OPERATOR_KEY_EPOCH: '1',
        ...overrides,
    };
}

function createOperatorArchiveDatabase(): {
    database: D1Database;
    rows: Map<string, Record<string, unknown>>;
} {
    const rows = new Map<string, Record<string, unknown>>();
    const statement = (sql: string, values: unknown[] = []): D1PreparedStatement => ({
        bind: (...next: unknown[]) => statement(sql, next),
        run: async () => {
            if (!sql.includes('INSERT INTO operator_outbox_archives')) {
                throw new Error('unexpected_d1_run');
            }
            const key = JSON.stringify(values.slice(0, 5));
            if (!rows.has(key)) {
                rows.set(key, {
                    method: values[5],
                    payload_sha256: values[6],
                    tx_hash: values[7],
                    created_at_ms: values[8],
                    confirmed_at_ms: values[9],
                    archive_requested_at_ms: values[10],
                    cleanup_eligible_at_ms: values[11],
                    archive_sha256: values[12],
                });
            }
            return { success: true } as D1Result;
        },
        first: async <T>() => rows.get(JSON.stringify(values)) as T | undefined || null,
    }) as unknown as D1PreparedStatement;
    return {
        database: { prepare: (sql: string) => statement(sql) } as D1Database,
        rows,
    };
}

async function thumbnailPlaybackEnv(): Promise<Partial<Env>> {
    const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
    ) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey) as ArrayBuffer);
    const privatePem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`;
    const publicPem = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...spki))}\n-----END PUBLIC KEY-----`;
    return {
        ACCESS_CONTRACT_ID: 'paid-media-access.testnet',
        LIVEPEER_JWT_PRIVATE_KEY: btoa(privatePem),
        LIVEPEER_JWT_PUBLIC_KEY: btoa(publicPem),
        LIVEPEER_JWT_ISSUER: 'https://youtick.test',
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
        sourceType: 'mp4' as const,
        profileId: 'paid-media-livepeer-v1',
        profileConfigSha256: '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77',
        createdAtMs: Date.now(),
        apiTokenName: TOKEN_NAME,
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
                    url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/index.m3u8`,
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

async function publishedJob() {
    const job = jobRecord();
    const publicationValue = {
        job_id: job.jobId,
        generation: job.generation,
        creator_id: job.creator,
        expected_source_bytes: job.expectedSourceBytes,
        profile_id: job.profileId,
        profile_config_sha256: job.profileConfigSha256,
        asset_id_hash: await sha256(ASSET_ID),
        playback_id: PLAYBACK_ID,
        project_id_hash: await sha256(PROJECT_ID),
        verified_source_bytes: job.expectedSourceBytes,
        provider_source_fingerprint: 'd'.repeat(64),
        ready_at_ms: '1785589200000',
        availability: 'ACTIVE',
    };
    return {
        ...job,
        state: 'ONCHAIN_PUBLISHED',
        tusEndpoint: undefined,
        publication: publicationValue,
    };
}

function reconcileFetch(
    publicationValue: Awaited<ReturnType<typeof publishedJob>>['publication'],
    asset = providerAsset(),
) {
    const contractValue = {
        publication_id: publicationValue.job_id,
        ...publicationValue,
        published_availability: publicationValue.availability,
        availability: publicationValue.availability,
    };
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes(`/asset/${ASSET_ID}`)) return Response.json(asset);
        if (url.includes(`/playback/${PLAYBACK_ID}`)) return Response.json(providerPlayback());
        if (url === RPC_URL) return rpcResult(contractValue);
        if (url.includes('.m3u8')) return new Response(HLS_ERROR, { status: 200 });
        return new Response(null, { status: 403 });
    });
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

async function signedWebhookRequest(
    value: { timestamp: number } & Record<string, unknown>,
    secret = WEBHOOK_SECRET,
): Promise<Request> {
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

async function suspendSalesRequest(publicationId = 'job-001'): Promise<Request> {
    const payloadSha256 = await sha256(canonicalJson({ publication_id: publicationId }));
    return new Request('https://object/internal/suspend-sales', {
        method: 'POST',
        body: JSON.stringify({
            idempotencyKey: `${publicationId}:suspend-sales`,
            payloadSha256,
            publicationId,
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
        const objectFetch = vi.fn(async (_request: Request) => Response.json({ accepted: true }));
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

        const directValue = webhook();
        const snapshotValue = {
            ...directValue,
            payload: { asset: { id: ASSET_ID, snapshot: directValue.payload.asset } },
        };
        const snapshot = await handler.fetch(await signedWebhookRequest(snapshotValue), env);
        expect(snapshot.status).toBe(200);
        expect(objectFetch).toHaveBeenCalledTimes(2);
    });

    it('ACKs a verified webhook after Queue processing without blocking ingress on the job object', async () => {
        let now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const objectFetch = vi.fn(async (_request: Request) => Response.json({ accepted: true }));
        const send = vi.fn<(message: unknown, options?: unknown) => Promise<void>>(async () => undefined);
        const env = createEnv({
            LIVEPEER_WEBHOOK_QUEUE_ENABLED: 'true',
            LIVEPEER_EVENTS: { send } as unknown as Queue,
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'job-id' })),
                get: vi.fn(() => ({ fetch: objectFetch })),
            } as unknown as DurableObjectNamespace,
        });

        const value = webhook();
        const response = await handler.fetch(await signedWebhookRequest(value), env);

        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ accepted: true, queued: true });
        expect(send).toHaveBeenCalledOnce();
        expect(send.mock.calls[0][0]).toMatchObject({
            schema: 'youtick.livepeer-webhook-queue.v1',
            network: 'testnet',
            contract_id: CONTRACT_ID,
            job_id: 'job-001',
            generation: 1,
            enqueued_at_ms: String(now),
        });
        expect(objectFetch).not.toHaveBeenCalled();
        expect(info.mock.calls.map(([value]) => JSON.parse(String(value)))).toContainEqual({
            event: 'webhook_ack_completed',
            details: {
                delivery: 'QUEUE',
                httpCode: 202,
                latencyMs: expect.any(Number),
            },
        });

        const ack = vi.fn();
        const retry = vi.fn();
        now += 250;
        await handler.queue({
            messages: [{ body: send.mock.calls[0][0], ack, retry }],
        } as unknown as MessageBatch<unknown>, env);

        expect(objectFetch).toHaveBeenCalledOnce();
        expect(await (objectFetch.mock.calls[0][0] as Request).json()).toEqual(value);
        expect(ack).toHaveBeenCalledOnce();
        expect(retry).not.toHaveBeenCalled();
        expect(info.mock.calls.map(([value]) => JSON.parse(String(value)))).toContainEqual({
            event: 'webhook_queue_delivery_completed',
            details: {
                outcome: 'ACK',
                queueLagMs: 250,
            },
        });
    });

    it('retries a valid Queue webhook when the job object is temporarily unavailable', async () => {
        const now = 1_785_600_000_500;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const objectFetch = vi.fn(async () => Response.json(
            { error: 'temporarily_unavailable' },
            { status: 503 },
        ));
        const env = createEnv({
            LIVEPEER_WEBHOOK_QUEUE_ENABLED: 'true',
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'job-id' })),
                get: vi.fn(() => ({ fetch: objectFetch })),
            } as unknown as DurableObjectNamespace,
        });
        const value = webhook();
        const raw = new TextEncoder().encode(JSON.stringify(value));
        const ack = vi.fn();
        const retry = vi.fn();

        await handler.queue({
            messages: [{
                body: {
                    schema: 'youtick.livepeer-webhook-queue.v1',
                    network: 'testnet',
                    contract_id: CONTRACT_ID,
                    job_id: 'job-001',
                    generation: 1,
                    enqueued_at_ms: '1785600000000',
                    raw_body_base64: btoa(String.fromCharCode(...raw)),
                },
                ack,
                retry,
            }],
        } as unknown as MessageBatch<unknown>, env);

        expect(objectFetch).toHaveBeenCalledOnce();
        expect(ack).not.toHaveBeenCalled();
        expect(retry).toHaveBeenCalledOnce();
        expect(info.mock.calls.map(([value]) => JSON.parse(String(value)))).toContainEqual({
            event: 'webhook_queue_delivery_completed',
            details: {
                outcome: 'RETRY',
                queueLagMs: 500,
            },
        });
    });

    it('does not consume messages when the approved pilot Queue policy drifts', async () => {
        const objectFetch = vi.fn();
        const env = createEnv({
            LIVEPEER_WEBHOOK_QUEUE_ENABLED: 'true',
            LIVEPEER_WEBHOOK_QUEUE_MAX_RETRIES: '4',
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(),
                get: vi.fn(() => ({ fetch: objectFetch })),
            } as unknown as DurableObjectNamespace,
        });
        const ack = vi.fn();
        const retry = vi.fn();

        await handler.queue(
            { messages: [{ body: {}, ack, retry }] } as unknown as MessageBatch<unknown>,
            env,
        );

        expect(objectFetch).not.toHaveBeenCalled();
        expect(ack).not.toHaveBeenCalled();
        expect(retry).toHaveBeenCalledOnce();
    });

    it('ACKs a Queue poison message without entering the job object', async () => {
        const objectFetch = vi.fn(async () => Response.json({ accepted: true }));
        const env = createEnv({
            LIVEPEER_WEBHOOK_QUEUE_ENABLED: 'true',
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'job-id' })),
                get: vi.fn(() => ({ fetch: objectFetch })),
            } as unknown as DurableObjectNamespace,
        });
        const ack = vi.fn();
        const retry = vi.fn();

        await handler.queue({
            messages: [{
                body: {
                    schema: 'youtick.livepeer-webhook-queue.v1',
                    network: 'mainnet',
                    contract_id: CONTRACT_ID,
                    job_id: 'job-001',
                    generation: 1,
                    enqueued_at_ms: String(Date.now()),
                    raw_body_base64: 'e30=',
                },
                ack,
                retry,
            }],
        } as unknown as MessageBatch<unknown>, env);

        expect(objectFetch).not.toHaveBeenCalled();
        expect(ack).toHaveBeenCalledOnce();
        expect(retry).not.toHaveBeenCalled();
    });

    it('ACKs a terminal ready replay and older update without provider reads', async () => {
        const testState = createState();
        testState.values.set('job:v1', await publishedJob());
        let control!: LivepeerControl;
        const admissionFetch = vi.fn(async (_request: Request) => Response.json({ accepted: true }));
        const namespace = {
            idFromName: vi.fn((name: string) => ({ toString: () => name })),
            get: vi.fn((id: { toString(): string }) => ({
                fetch: (request: Request) => id.toString().startsWith('job:')
                    ? control.fetch(request)
                    : admissionFetch(request),
            })),
        } as unknown as DurableObjectNamespace;
        const env = createEnv({
            LIVEPEER_WEBHOOK_QUEUE_ENABLED: 'true',
            LIVEPEER_CONTROL: namespace,
        });
        control = new LivepeerControl(testState.state, env);
        const readyEvent = webhook('asset.ready');
        const lateProcessingEvent = webhook('asset.updated', Date.now() - 60_000);
        const queueBody = (value: ReturnType<typeof webhook>) => ({
            schema: 'youtick.livepeer-webhook-queue.v1',
            network: 'testnet',
            contract_id: CONTRACT_ID,
            job_id: 'job-001',
            generation: 1,
            enqueued_at_ms: String(Date.now()),
            raw_body_base64: btoa(String.fromCharCode(
                ...new TextEncoder().encode(JSON.stringify(value)),
            )),
        });
        const readyAck = vi.fn();
        const lateAck = vi.fn();
        const retry = vi.fn();
        const providerFetch = vi.fn(async () => {
            throw new Error('terminal replay must not read the provider');
        });
        vi.stubGlobal('fetch', providerFetch);

        await handler.queue({
            messages: [
                { body: queueBody(readyEvent), ack: readyAck, retry },
                { body: queueBody(lateProcessingEvent), ack: lateAck, retry },
            ],
        } as unknown as MessageBatch<unknown>, env);

        expect(testState.values.get('job:v1')).toMatchObject({ state: 'ONCHAIN_PUBLISHED' });
        expect(testState.alarms).toHaveLength(2);
        expect(readyAck).toHaveBeenCalledOnce();
        expect(lateAck).toHaveBeenCalledOnce();
        expect(retry).not.toHaveBeenCalled();
        expect(providerFetch).not.toHaveBeenCalled();
        expect(admissionFetch).toHaveBeenCalledOnce();
    });

    it('accepts the previous webhook secret during the rotation overlap', async () => {
        const previousSecret = 'previous-webhook-secret';
        const objectFetch = vi.fn(async () => Response.json({ accepted: true }));
        const env = createEnv({
            LIVEPEER_WEBHOOK_SECRET_PREVIOUS: previousSecret,
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'id' })),
                get: vi.fn(() => ({ fetch: objectFetch })),
            } as unknown as DurableObjectNamespace,
        });

        const response = await handler.fetch(
            await signedWebhookRequest(webhook('asset.updated'), previousSecret),
            env,
        );

        expect(response.status).toBe(200);
        expect(objectFetch).toHaveBeenCalledOnce();
    });

    it.each(['asset.failed', 'asset.deleted'])(
        'records %s as terminal provider failure and releases admission',
        async (event) => {
            const testState = createState();
            const job = jobRecord();
            testState.values.set('job:v1', job);
            const operatorFetch = vi.fn(async (_request: Request) => Response.json({ accepted: true }));
            const control = new LivepeerControl(testState.state, createEnv({
                LIVEPEER_CONTROL: {
                    idFromName: vi.fn(() => ({ toString: () => 'operator-id' })),
                    get: vi.fn(() => ({ fetch: operatorFetch })),
                } as unknown as DurableObjectNamespace,
            }));
            const providerFetch = vi.fn();
            vi.stubGlobal('fetch', providerFetch);

            const response = await control.fetch(internalWebhookRequest(webhook(event)));

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ accepted: true, provider_failed: true });
            expect(testState.values.get('job:v1')).toMatchObject({
                state: 'PROVIDER_FAILED',
                stateChangedAtMs: expect.any(Number),
                terminalAtMs: expect.any(Number),
            });
            expect(providerFetch).not.toHaveBeenCalled();
            expect(operatorFetch).toHaveBeenCalledOnce();
            expect(new URL(operatorFetch.mock.calls[0][0].url).pathname).toBe('/internal/admission/mark');
            expect(await operatorFetch.mock.calls[0][0].clone().json()).toMatchObject({
                jobId: 'job-001',
                generation: 1,
                state: 'PROVIDER_FAILED',
            });
        },
    );

    it('records an authenticated provider processing phase without probing provider media', async () => {
        const now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const testState = createState();
        testState.values.set('job:v1', jobRecord());
        const control = new LivepeerControl(testState.state, createEnv());
        const providerFetch = vi.fn();
        vi.stubGlobal('fetch', providerFetch);

        const response = await control.fetch(internalWebhookRequest(webhook('asset.updated')));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ accepted: true, processing: true });
        expect(testState.values.get('job:v1')).toMatchObject({
            state: 'PROCESSING',
            stateChangedAtMs: now,
        });
        expect(providerFetch).not.toHaveBeenCalled();
    });

    it.each(['PROVIDER_FAILED', 'UPLOAD_EXPIRED'])(
        'ignores a late ready event for terminal %s without retrying provider work',
        async (state) => {
            const testState = createState();
            testState.values.set('job:v1', { ...jobRecord(), state, terminalAtMs: Date.now() });
            const control = new LivepeerControl(testState.state, createEnv());
            const providerFetch = vi.fn();
            vi.stubGlobal('fetch', providerFetch);

            const response = await control.fetch(internalWebhookRequest(webhook()));

            expect(response.status).toBe(202);
            expect(await response.json()).toEqual({ accepted: true, ignored: true, terminal: true });
            expect(providerFetch).not.toHaveBeenCalled();
        },
    );

    it('recovers when a ready asset.updated follows an early asset.ready read', async () => {
        const testState = createState();
        testState.values.set('job:v1', jobRecord());
        const operatorFetch = vi.fn(async (request: Request) => (
            new URL(request.url).pathname === '/internal/finalize'
                ? Response.json({ accepted: true, finalized: true })
                : Response.json({ accepted: true })
        ));
        const control = new LivepeerControl(testState.state, createEnv({
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'operator-id' })),
                get: vi.fn(() => ({ fetch: operatorFetch })),
            } as unknown as DurableObjectNamespace,
        }));
        let assetReads = 0;
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes(`/asset/${ASSET_ID}`)) {
                assetReads += 1;
                return Response.json(providerAsset(assetReads === 1
                    ? { status: { phase: 'processing' } }
                    : undefined));
            }
            if (url.includes(`/playback/${PLAYBACK_ID}`)) return Response.json(providerPlayback());
            if (url.endsWith('.m3u8')) return new Response(HLS_ERROR, { status: 200 });
            return new Response(null, { status: 403 });
        }));

        const early = await control.fetch(internalWebhookRequest(webhook()));
        expect(early.status).toBe(409);
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'UPLOAD_READY' });

        const processing = await control.fetch(internalWebhookRequest(
            webhook('asset.updated', Date.now() + 1),
        ));
        expect(processing.status).toBe(200);
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'PROCESSING' });

        const update = webhook('asset.updated', Date.now() + 2);
        update.payload.asset.status = { phase: 'ready' };
        const recovered = await control.fetch(internalWebhookRequest(update));

        expect(recovered.status).toBe(200);
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'ONCHAIN_PUBLISHED' });
        expect(assetReads).toBe(2);
        expect(operatorFetch.mock.calls.filter(([request]) => (
            new URL(request.url).pathname === '/internal/finalize'
        ))).toHaveLength(1);
    });

    it.each([
        ['project', providerAsset({ projectId: 'wrong-project' }), providerPlayback(), 'provider_identity_mismatch'],
        ['token', providerAsset({ createdByTokenName: 'wrong-token' }), providerPlayback(), 'provider_identity_mismatch'],
        ['policy', providerAsset({ playbackPolicy: { type: 'public' } }), providerPlayback(), 'provider_state_invalid'],
        ['playback', providerAsset(), providerPlayback({ playbackPolicy: { type: 'public' } }), 'provider_playback_mismatch'],
        ['source port', providerAsset(), providerPlayback({ source: [
            {
                type: 'html5/application/vnd.apple.mpegurl',
                url: `https://asset-cdn.lp-playback.studio:8443/hls/${PLAYBACK_ID}/index.m3u8`,
            },
            {
                type: 'html5/video/mp4',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/static720p0.mp4`,
            },
        ] }), 'provider_playback_mismatch'],
        ['source credentials', providerAsset(), providerPlayback({ source: [
            {
                type: 'html5/application/vnd.apple.mpegurl',
                url: `https://user:password@asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/index.m3u8`,
            },
            {
                type: 'html5/video/mp4',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/static720p0.mp4`,
            },
        ] }), 'provider_playback_mismatch'],
        ['unsupported output type', providerAsset(), providerPlayback({ source: [
            {
                type: 'html5/application/vnd.apple.mpegurl',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/index.m3u8`,
            },
            {
                type: 'html5/video/mp4',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/static720p0.mp4`,
                width: 1280,
                height: 720,
                bitrate: 3_000_000,
            },
            {
                type: 'html5/video/h264',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/video.h264`,
            },
        ] }), 'provider_playback_mismatch'],
        ['missing required MP4 rendition', providerAsset(), providerPlayback({ source: [
            {
                type: 'html5/application/vnd.apple.mpegurl',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/index.m3u8`,
            },
            {
                type: 'html5/video/mp4',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/alternate.mp4`,
                width: 854,
                height: 480,
                bitrate: 1_000_000,
            },
        ] }), 'provider_playback_mismatch'],
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

    it('finalizes an HLS-only asset', async () => {
        const testState = createState();
        testState.values.set('job:v1', jobRecord());
        const operatorFetch = vi.fn(async () => Response.json({ accepted: true, finalized: true }));
        const control = new LivepeerControl(testState.state, createEnv({
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'operator-id' })),
                get: vi.fn(() => ({ fetch: operatorFetch })),
            } as unknown as DurableObjectNamespace,
        }));
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes(`/asset/${ASSET_ID}`)) return Response.json(providerAsset());
            if (url.includes(`/playback/${PLAYBACK_ID}`)) return Response.json(providerPlayback({ source: [{
                type: 'html5/application/vnd.apple.mpegurl',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/index.m3u8`,
            }] }));
            if (url.endsWith('.m3u8')) return new Response(HLS_ERROR, { status: 200 });
            return new Response(null, { status: 403 });
        }));

        const response = await control.fetch(internalWebhookRequest());

        expect(response.status).toBe(200);
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'ONCHAIN_PUBLISHED' });
    });

    it('deduplicates ready transitions, proves private playback, and clears the TUS capability', async () => {
        const testState = createState();
        testState.values.set('job:v1', jobRecord());
        const operatorFetch = vi.fn(async (_request: Request) => Response.json({ accepted: true, finalized: true }));
        const env = createEnv({
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'operator-id' })),
                get: vi.fn(() => ({ fetch: operatorFetch })),
            } as unknown as DurableObjectNamespace,
        });
        const control = new LivepeerControl(testState.state, env);
        const canonicalHls = `https://playback.livepeer.studio/asset/hls/${PLAYBACK_ID}/index.m3u8`;
        const providerHls = `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/index.m3u8`;
        const alternateHls = `https://livepeercdn.studio/recordings/recording-001/index.m3u8`;
        const alternateMp4 = `https://asset-cdn.lp-playback.com/hls/recording-001/static360p0.mp4`;
        const playback = providerPlayback({ source: [
            {
                type: 'html5/application/vnd.apple.mpegurl',
                url: providerHls,
            },
            {
                type: 'html5/application/vnd.apple.mpegurl',
                url: alternateHls,
            },
            {
                type: 'html5/video/mp4',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/static720p0.mp4`,
                width: 1280,
                height: 720,
                bitrate: 3_000_000,
            },
            {
                type: 'html5/video/mp4',
                url: alternateMp4,
                width: 204,
                height: 360,
                bitrate: 449_890,
            },
        ] });
        const providerFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
            const url = String(input);
            if (url.includes(`/asset/${ASSET_ID}`)) return Response.json(providerAsset());
            if (url.includes(`/playback/${PLAYBACK_ID}`)) return Response.json(playback);
            if (url === canonicalHls) return new Response(HLS_ERROR, { status: 200 });
            return new Response(null, { status: 403 });
        });
        vi.stubGlobal('fetch', providerFetch);
        const readyEvent = webhook();

        const first = await control.fetch(internalWebhookRequest(readyEvent));
        expect(first.status).toBe(200);
        expect(testState.values.get('job:v1')).toMatchObject({
            state: 'ONCHAIN_PUBLISHED',
            stateChangedAtMs: expect.any(Number),
            publication: { playback_id: PLAYBACK_ID, verified_source_bytes: EXPECTED_BYTES },
        });
        expect(testState.values.get('job:v1')).not.toHaveProperty('tusEndpoint');
        expect(testState.values.get('reconcile:v1')).toMatchObject({ status: 'PROVIDER_UNKNOWN' });
        expect(testState.alarms).toHaveLength(1);
        expect(providerFetch).toHaveBeenCalledTimes(17);
        const calls = providerFetch.mock.calls.map(([input, init]) => ({
            url: String(input),
            method: (init as RequestInit | undefined)?.method,
            headers: new Headers((init as RequestInit | undefined)?.headers),
            redirect: (init as RequestInit | undefined)?.redirect,
        }));
        for (const hlsUrl of [canonicalHls, providerHls, alternateHls]) {
            expect(calls.filter((call) => call.url === hlsUrl)).toHaveLength(4);
            expect(calls.filter((call) => call.url === hlsUrl && call.headers.has('Livepeer-Jwt'))).toHaveLength(3);
        }
        const anonymousOutputs = calls.filter((call) => [
            `https://livepeercdn.com/asset/${PLAYBACK_ID}/video`,
            `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/static720p0.mp4`,
            alternateMp4,
        ].includes(call.url));
        expect(anonymousOutputs).toHaveLength(3);
        for (const call of anonymousOutputs) {
            expect(call.method).toBe('GET');
            expect(call.redirect).toBe('manual');
            expect(call.headers.has('Livepeer-Jwt')).toBe(false);
        }
        expect(operatorFetch.mock.calls.filter(([request]) => (
            new URL(request.url).pathname === '/internal/finalize'
        ))).toHaveLength(1);

        const duplicate = await control.fetch(internalWebhookRequest(readyEvent));
        expect(duplicate.status).toBe(200);
        expect(await duplicate.json()).toMatchObject({ duplicate: true, finalized: true });
        expect(providerFetch).toHaveBeenCalledTimes(17);
        expect(operatorFetch.mock.calls.filter(([request]) => (
            new URL(request.url).pathname === '/internal/finalize'
        ))).toHaveLength(1);
    });

    it('marks a published job healthy and schedules the 15 minute alarm', async () => {
        const now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const testState = createState();
        const job = await publishedJob();
        testState.values.set('job:v1', job);
        testState.values.set('reconcile:v1', {
            schema: 'youtick.livepeer-reconcile.v1',
            status: 'PROVIDER_UNKNOWN',
            consecutiveErrors: 0,
            nextReconcileAtMs: now,
        });
        const control = new LivepeerControl(testState.state, createEnv());
        vi.stubGlobal('fetch', reconcileFetch(job.publication));

        await control.alarm();

        expect(testState.values.get('reconcile:v1')).toMatchObject({
            status: 'HEALTHY',
            consecutiveErrors: 0,
            lastGoodAtMs: now,
            nextReconcileAtMs: now + 15 * 60 * 1000,
        });
        expect(testState.alarms.at(-1)).toBe(now + 15 * 60 * 1000);
    });

    it('retries a queued finalization from the job alarm', async () => {
        const now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const testState = createState();
        testState.values.set('job:v1', jobRecord());
        let finalizeCalls = 0;
        const operatorFetch = vi.fn(async (request: Request) => {
            if (new URL(request.url).pathname !== '/internal/finalize') {
                return Response.json({ accepted: true });
            }
            finalizeCalls += 1;
            return Response.json(
                { accepted: true, finalized: finalizeCalls > 1 },
                { status: finalizeCalls > 1 ? 200 : 202 },
            );
        });
        const control = new LivepeerControl(testState.state, createEnv({
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'operator-id' })),
                get: vi.fn(() => ({ fetch: operatorFetch })),
            } as unknown as DurableObjectNamespace,
        }));
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes(`/asset/${ASSET_ID}`)) return Response.json(providerAsset());
            if (url.includes(`/playback/${PLAYBACK_ID}`)) return Response.json(providerPlayback());
            if (url.endsWith('.m3u8')) return new Response(HLS_ERROR, { status: 200 });
            return new Response(null, { status: 403 });
        }));

        const ready = await control.fetch(internalWebhookRequest());
        expect(ready.status).toBe(202);
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'FINALIZE_QUEUED' });
        expect(testState.alarms.at(-1)).toBe(now + 60_000);

        await control.alarm();

        expect(finalizeCalls).toBe(2);
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'ONCHAIN_PUBLISHED' });
        expect(testState.values.get('reconcile:v1')).toMatchObject({ status: 'PROVIDER_UNKNOWN' });
    });

    it('persists FINALIZE_RETRY on a failed outbox call and resumes the same publication', async () => {
        let now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const testState = createState();
        const ready = { ...(await publishedJob()), state: 'READY_VERIFIED' };
        testState.values.set('job:v1', ready);
        let finalizeCalls = 0;
        const operatorFetch = vi.fn(async (request: Request) => {
            if (new URL(request.url).pathname !== '/internal/finalize') {
                return Response.json({ accepted: true });
            }
            finalizeCalls += 1;
            return finalizeCalls === 1
                ? Response.json({ error: 'near_finalize_failed' }, { status: 503 })
                : Response.json({ accepted: true, finalized: true });
        });
        const control = new LivepeerControl(testState.state, createEnv({
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'operator-id' })),
                get: vi.fn(() => ({ fetch: operatorFetch })),
            } as unknown as DurableObjectNamespace,
        }));

        await control.alarm();
        expect(testState.values.get('job:v1')).toMatchObject({
            state: 'FINALIZE_RETRY',
            publication: ready.publication,
            finalizeRetry: {
                attempts: 1,
                lastHttpStatus: 503,
                nextAttemptAtMs: now + 60_000,
            },
        });
        expect(testState.alarms.at(-1)).toBe(now + 60_000);

        await control.alarm();
        expect(finalizeCalls).toBe(1);
        expect(testState.alarms.at(-1)).toBe(now + 60_000);

        now += 60_000;
        await control.alarm();
        expect(finalizeCalls).toBe(2);
        expect(testState.values.get('job:v1')).toMatchObject({
            state: 'ONCHAIN_PUBLISHED',
            publication: ready.publication,
        });
        expect(testState.values.get('job:v1')).not.toHaveProperty('finalizeRetry');
    });

    it('caps finalize retry metadata and backoff at the fifth attempt', async () => {
        let now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const testState = createState();
        testState.values.set('job:v1', { ...(await publishedJob()), state: 'READY_VERIFIED' });
        const operatorFetch = vi.fn(async (request: Request) => (
            new URL(request.url).pathname === '/internal/finalize'
                ? Response.json({ error: 'near_finalize_failed' }, { status: 503 })
                : Response.json({ accepted: true })
        ));
        const control = new LivepeerControl(testState.state, createEnv({
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'operator-id' })),
                get: vi.fn(() => ({ fetch: operatorFetch })),
            } as unknown as DurableObjectNamespace,
        }));

        for (const [index, delaySeconds] of [60, 120, 240, 480, 900, 900].entries()) {
            await control.alarm();
            const retry = testState.values.get('job:v1') as {
                finalizeRetry: { attempts: number; lastHttpStatus: number; nextAttemptAtMs: number };
            };
            expect(retry.finalizeRetry).toEqual({
                attempts: Math.min(index + 1, 5),
                lastHttpStatus: 503,
                nextAttemptAtMs: now + delaySeconds * 1000,
            });
            now = retry.finalizeRetry.nextAttemptAtMs;
        }
        expect(operatorFetch).toHaveBeenCalledTimes(6);
    });

    it('does not read provider or NEAR while the runtime flag is disabled', async () => {
        const now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const testState = createState();
        testState.values.set('job:v1', await publishedJob());
        const control = new LivepeerControl(testState.state, createEnv({
            LIVEPEER_BRIDGE_ENABLED: 'false',
        }));
        const externalFetch = vi.fn();
        vi.stubGlobal('fetch', externalFetch);

        await control.alarm();

        expect(externalFetch).not.toHaveBeenCalled();
        expect(testState.alarms.at(-1)).toBe(now + 15 * 60 * 1000);
    });

    it('purges webhook dedup records after the accepted 30 day retention', async () => {
        const now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const testState = createState();
        testState.values.set('job:v1', await publishedJob());
        testState.values.set('webhook:expired', {
            state: 'VERIFIED',
            receivedAtMs: now - 30 * 24 * 60 * 60 * 1000,
        });
        testState.values.set('webhook:retained', {
            state: 'VERIFIED',
            receivedAtMs: now - 30 * 24 * 60 * 60 * 1000 + 1,
        });
        const control = new LivepeerControl(testState.state, createEnv({
            LIVEPEER_BRIDGE_ENABLED: 'false',
        }));

        await control.alarm();

        expect(testState.values.has('webhook:expired')).toBe(false);
        expect(testState.values.has('webhook:retained')).toBe(true);
        expect(testState.values.has('job:v1')).toBe(true);
    });

    it('blocks immediately and enqueues one sales suspension only after repeated drift', async () => {
        let now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const testState = createState();
        const job = await publishedJob();
        testState.values.set('job:v1', job);
        testState.values.set('reconcile:v1', {
            schema: 'youtick.livepeer-reconcile.v1',
            status: 'HEALTHY',
            consecutiveErrors: 0,
            nextReconcileAtMs: now,
            lastGoodAtMs: now - 1,
        });
        const control = new LivepeerControl(testState.state, createEnv());
        vi.stubGlobal('fetch', reconcileFetch(job.publication, providerAsset({
            playbackPolicy: { type: 'public' },
        })));

        await control.alarm();
        expect(testState.values.get('reconcile:v1')).toMatchObject({
            status: 'DRIFT_BLOCKED',
            lastDrift: { observations: 1 },
            nextReconcileAtMs: now + 60_000,
        });
        expect(testState.values.has('outbox:job-001:suspend-sales')).toBe(false);

        now += 60_000;
        await control.alarm();
        expect(testState.values.get('reconcile:v1')).toMatchObject({
            lastDrift: { observations: 2 },
            nextReconcileAtMs: now + 120_000,
        });
        now += 120_000;
        await control.alarm();

        expect(testState.values.get('reconcile:v1')).toMatchObject({
            status: 'DRIFT_BLOCKED',
            lastDrift: { observations: 3 },
            salesSuspensionQueuedAtMs: now - 120_000,
            nextReconcileAtMs: now + 240_000,
        });
        expect(testState.values.get('outbox:job-001:suspend-sales')).toMatchObject({
            state: 'PENDING',
            method: 'suspend_livepeer_sales',
            jobId: 'job-001',
            generation: 1,
        });
        expect([...testState.values.keys()].filter((key) => key.endsWith(':suspend-sales'))).toHaveLength(1);
    });

    it('treats provider 5xx as unknown without queuing a chain mutation', async () => {
        const now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const testState = createState();
        const job = await publishedJob();
        testState.values.set('job:v1', job);
        const control = new LivepeerControl(testState.state, createEnv());
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));

        await control.alarm();

        expect(testState.values.get('reconcile:v1')).toMatchObject({
            status: 'PROVIDER_UNKNOWN',
            consecutiveErrors: 1,
            nextReconcileAtMs: now + 60_000,
        });
        expect([...testState.values.keys()].some((key) => key.endsWith(':suspend-sales'))).toBe(false);
    });

    it('treats provider authentication errors as unknown, not sale-suspending drift', async () => {
        const now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const testState = createState();
        const job = await publishedJob();
        testState.values.set('job:v1', job);
        const control = new LivepeerControl(testState.state, createEnv());
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));

        await control.alarm();
        await control.alarm();

        expect(testState.values.get('reconcile:v1')).toMatchObject({
            status: 'PROVIDER_UNKNOWN',
            consecutiveErrors: 2,
        });
        expect([...testState.values.keys()].some((key) => key.endsWith(':suspend-sales'))).toBe(false);
    });

    it('still requires two healthy observations when an outage interrupts drift recovery', async () => {
        let now = 1_785_600_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const testState = createState();
        const job = await publishedJob();
        testState.values.set('job:v1', job);
        testState.values.set('reconcile:v1', {
            schema: 'youtick.livepeer-reconcile.v1',
            status: 'HEALTHY',
            consecutiveErrors: 0,
            nextReconcileAtMs: now,
            lastGoodAtMs: now - 1,
        });
        const control = new LivepeerControl(testState.state, createEnv());

        vi.stubGlobal('fetch', reconcileFetch(job.publication, providerAsset({
            playbackPolicy: { type: 'public' },
        })));
        await control.alarm();
        now += 60_000;
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
        await control.alarm();
        now += 60_000;
        vi.stubGlobal('fetch', reconcileFetch(job.publication));
        await control.alarm();
        expect(testState.values.get('reconcile:v1')).toMatchObject({
            status: 'DRIFT_BLOCKED',
            recovery: { observations: 1 },
        });

        now += 60_000;
        await control.alarm();

        expect(testState.values.get('reconcile:v1')).toMatchObject({
            status: 'HEALTHY',
            lastGoodAtMs: now,
        });
    });

    it('auto-closes creator admission on a provider inventory identity mismatch', async () => {
        const jobState = createState();
        const admissionState = createState();
        const job = await publishedJob();
        jobState.values.set('job:v1', job);
        admissionState.values.set('admission:v1', {
            schema: 'youtick.livepeer-admission.v2',
            status: 'OPEN',
            reservations: {},
            daily: { utcDay: '2026-08-02', globalAttempts: 0, creatorAttempts: {} },
            monthly: { utcMonth: '2026-08', reservedBudgetUsdMicros: '0' },
        });
        let admission!: LivepeerControl;
        const env = createEnv();
        env.LIVEPEER_CONTROL = {
            idFromName: vi.fn((name: string) => ({ toString: () => name })),
            get: vi.fn((id: DurableObjectId) => ({
                fetch: (request: Request) => id.toString().startsWith('admission:')
                    ? admission.fetch(request)
                    : Response.json({ accepted: true }),
            })),
        } as unknown as DurableObjectNamespace;
        admission = new LivepeerControl(admissionState.state, env);
        const control = new LivepeerControl(jobState.state, env);
        vi.stubGlobal('fetch', reconcileFetch(job.publication, providerAsset({
            projectId: 'wrong-project',
        })));

        await control.alarm();

        expect(jobState.values.get('reconcile:v1')).toMatchObject({
            status: 'DRIFT_BLOCKED',
            lastDrift: { code: 'provider_identity_mismatch' },
        });
        expect(admissionState.values.get('admission:v1')).toMatchObject({
            status: 'AUTO_CLOSED',
            closure: { code: 'provider_budget_or_inventory' },
        });
    });

    it('fails closed when the canonical HLS route permits anonymous playback', async () => {
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
        const canonicalHls = `https://playback.livepeer.studio/asset/hls/${PLAYBACK_ID}/index.m3u8`;
        const providerFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
            const url = String(input);
            if (url.includes(`/asset/${ASSET_ID}`)) return Response.json(providerAsset());
            if (url.includes(`/playback/${PLAYBACK_ID}`)) return Response.json(providerPlayback());
            if (url === canonicalHls) return new Response(MIXED_IFRAME_HLS, { status: 200 });
            return new Response(null, { status: 403 });
        });
        vi.stubGlobal('fetch', providerFetch);

        const response = await control.fetch(internalWebhookRequest());
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'provider_playback_exposed' });
        const hlsCall = providerFetch.mock.calls.find(([input]) => String(input) === canonicalHls);
        expect(hlsCall).toBeDefined();
        const init = hlsCall![1];
        expect(init?.method).toBe('GET');
        expect(init?.redirect).toBe('manual');
        expect(new Headers(init?.headers).has('Livepeer-Jwt')).toBe(false);
        expect(operatorFetch).not.toHaveBeenCalled();
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'UPLOAD_READY' });
    });

    it('fails closed when the provider HLS source permits anonymous playback', async () => {
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
        const canonicalHls = `https://playback.livepeer.studio/asset/hls/${PLAYBACK_ID}/index.m3u8`;
        const providerHls = `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/index.m3u8`;
        const providerFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
            const url = String(input);
            if (url.includes(`/asset/${ASSET_ID}`)) return Response.json(providerAsset());
            if (url.includes(`/playback/${PLAYBACK_ID}`)) return Response.json(providerPlayback());
            if (url === canonicalHls) return new Response(HLS_ERROR, { status: 200 });
            if (url === providerHls) return new Response(MIXED_IFRAME_HLS, { status: 200 });
            return new Response(null, { status: 403 });
        });
        vi.stubGlobal('fetch', providerFetch);

        const response = await control.fetch(internalWebhookRequest());
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'provider_playback_exposed' });
        const hlsCall = providerFetch.mock.calls.find(([input]) => String(input) === providerHls);
        expect(hlsCall).toBeDefined();
        const init = hlsCall![1];
        expect(init?.method).toBe('GET');
        expect(init?.redirect).toBe('manual');
        expect(new Headers(init?.headers).has('Livepeer-Jwt')).toBe(false);
        expect(operatorFetch).not.toHaveBeenCalled();
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'UPLOAD_READY' });
    });

    it('fails closed when an additional provider MP4 source permits anonymous playback', async () => {
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
        const canonicalHls = `https://playback.livepeer.studio/asset/hls/${PLAYBACK_ID}/index.m3u8`;
        const alternateMp4 = `https://asset-cdn.lp-playback.com/hls/recording-001/static360p0.mp4`;
        const playback = providerPlayback({ source: [
            {
                type: 'html5/application/vnd.apple.mpegurl',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/index.m3u8`,
            },
            {
                type: 'html5/video/mp4',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/static720p0.mp4`,
                width: 1280,
                height: 720,
                bitrate: 3_000_000,
            },
            {
                type: 'html5/video/mp4',
                url: alternateMp4,
                width: 204,
                height: 360,
                bitrate: 449_890,
            },
        ] });
        const providerFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
            const url = String(input);
            if (url.includes(`/asset/${ASSET_ID}`)) return Response.json(providerAsset());
            if (url.includes(`/playback/${PLAYBACK_ID}`)) return Response.json(playback);
            if (url === canonicalHls) return new Response(HLS_ERROR, { status: 200 });
            if (url === alternateMp4) return new Response(null, { status: 200 });
            return new Response(null, { status: 403 });
        });
        vi.stubGlobal('fetch', providerFetch);

        const response = await control.fetch(internalWebhookRequest());
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'provider_playback_exposed' });
        const mp4Call = providerFetch.mock.calls.find(([input]) => String(input) === alternateMp4);
        expect(mp4Call).toBeDefined();
        const init = mp4Call![1];
        expect(init?.method).toBe('GET');
        expect(init?.redirect).toBe('manual');
        expect(new Headers(init?.headers).has('Livepeer-Jwt')).toBe(false);
        expect(operatorFetch).not.toHaveBeenCalled();
        expect(testState.values.get('job:v1')).toMatchObject({ state: 'UPLOAD_READY' });
    });

    it('proves thumbnail VTT and images are private before finalization', async () => {
        const testState = createState();
        testState.values.set('job:v1', jobRecord());
        const operatorFetch = vi.fn(async (_request: Request) => Response.json({ accepted: true, finalized: true }));
        const env = createEnv({
            ...await thumbnailPlaybackEnv(),
            LIVEPEER_CONTROL: {
                idFromName: vi.fn(() => ({ toString: () => 'operator-id' })),
                get: vi.fn(() => ({ fetch: operatorFetch })),
            } as unknown as DurableObjectNamespace,
        });
        const control = new LivepeerControl(testState.state, env);
        const canonicalHls = `https://playback.livepeer.studio/asset/hls/${PLAYBACK_ID}/index.m3u8`;
        const vtt = `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/thumbnails/thumbnails.vtt`;
        const thumbnail = `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/thumbnails/keyframes_0.jpg`;
        const playback = providerPlayback({ source: [
            {
                type: 'html5/application/vnd.apple.mpegurl',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/index.m3u8`,
            },
            {
                type: 'html5/video/mp4',
                url: `https://asset-cdn.lp-playback.studio/hls/${PLAYBACK_ID}/static720p0.mp4`,
                width: 1280,
                height: 720,
                bitrate: 3_000_000,
            },
            { type: 'text/vtt', url: vtt },
        ] });
        const providerFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.includes(`/asset/${ASSET_ID}`)) return Response.json(providerAsset());
            if (url.includes(`/playback/${PLAYBACK_ID}`)) return Response.json(playback);
            if (url === canonicalHls) return new Response(HLS_ERROR, { status: 200 });
            if (url === vtt && new Headers(init?.headers).has('Livepeer-Jwt')) {
                return new Response(THUMBNAIL_VTT, { status: 200 });
            }
            return new Response(null, { status: 403 });
        });
        vi.stubGlobal('fetch', providerFetch);

        const response = await control.fetch(internalWebhookRequest());
        expect(response.status).toBe(200);
        const calls = providerFetch.mock.calls.map(([input, init]) => ({
            url: String(input),
            headers: new Headers((init as RequestInit | undefined)?.headers),
            redirect: (init as RequestInit | undefined)?.redirect,
        }));
        expect(calls.filter((call) => call.url === vtt && !call.headers.has('Livepeer-Jwt'))).toHaveLength(1);
        expect(calls.filter((call) => call.url === vtt && call.headers.has('Livepeer-Jwt'))).toHaveLength(1);
        expect(calls.filter((call) => call.url === thumbnail && !call.headers.has('Livepeer-Jwt'))).toHaveLength(1);
        expect(calls.filter((call) => call.url === thumbnail && call.redirect === 'manual')).toHaveLength(1);
        expect(operatorFetch.mock.calls.filter(([request]) => (
            new URL(request.url).pathname === '/internal/finalize'
        ))).toHaveLength(1);
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
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const first = await control.fetch(await finalizeRequest());
        expect(first.status).toBe(202);
        expect(warning.mock.calls.map(([value]) => JSON.parse(String(value)))).toContainEqual({
            event: 'operator_nonce_pending_observed',
            details: {
                method: 'finalize_livepeer_publication',
                state: 'BROADCAST',
                ageMs: expect.any(Number),
            },
        });
        const second = await control.fetch(await finalizeRequest());
        expect(second.status).toBe(200);
        expect(await second.json()).toMatchObject({ finalized: true });
        expect(sent).toHaveLength(2);
        expect(sent[1]).toBe(sent[0]);
        const confirmed = testState.values.get('outbox:job-001:1:finalize') as Record<string, unknown>;
        expect(confirmed).toMatchObject({
            state: 'CONFIRMED',
            method: 'finalize_livepeer_publication',
            confirmedAtMs: expect.any(Number),
            txHash: expect.any(String),
        });
        expect(confirmed).not.toHaveProperty('submission');
        expect(confirmed).not.toHaveProperty('nonce');
        expect(confirmed).not.toHaveProperty('blockHash');
        expect(confirmed).not.toHaveProperty('signedTxBase64');
    });

    it('blocks operator broadcast while keeping the outbox recoverable', async () => {
        const testState = createState();
        const env = createEnv({ LIVEPEER_OPERATOR_MUTATIONS_ENABLED: 'false' });
        const control = new LivepeerControl(testState.state, env);
        const sent: string[] = [];
        let finalized = false;
        vi.stubGlobal('fetch', operatorRpc({
            onSend: (signedTx) => {
                sent.push(signedTx);
                finalized = true;
            },
            publicationFor: () => finalized ? contractPublication(publication()) : null,
        }));

        const denied = await control.fetch(await finalizeRequest());
        expect(denied.status).toBe(503);
        expect(await denied.json()).toEqual({ error: 'operator_mutations_disabled' });
        expect(testState.values.get('outbox:job-001:1:finalize')).toMatchObject({ state: 'PENDING' });
        expect(sent).toHaveLength(0);

        env.LIVEPEER_OPERATOR_MUTATIONS_ENABLED = 'true';
        const resumed = await control.fetch(await finalizeRequest());
        expect(resumed.status).toBe(200);
        expect(await resumed.json()).toMatchObject({ finalized: true });
        expect(sent).toHaveLength(1);
    });

    it('does not create an operator outbox record above the object ceiling', async () => {
        const testState = createState();
        for (let index = 0; index < 256; index += 1) {
            testState.values.set(`existing:${String(index).padStart(3, '0')}`, { index });
        }
        const control = new LivepeerControl(testState.state, createEnv());
        const externalFetch = vi.fn();
        vi.stubGlobal('fetch', externalFetch);

        const response = await control.fetch(await finalizeRequest());

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'durable_object_record_limit' });
        expect(testState.values.size).toBe(256);
        expect(testState.values.has('outbox:job-001:1:finalize')).toBe(false);
        expect(externalFetch).not.toHaveBeenCalled();
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

    it('executes one idempotent suspend_livepeer_sales outbox transaction', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv());
        let suspended = false;
        const sent: string[] = [];
        vi.stubGlobal('fetch', operatorRpc({
            onSend: (signedTx) => {
                sent.push(signedTx);
                suspended = true;
            },
            publicationFor: () => ({
                ...contractPublication(publication()),
                availability: suspended ? 'SALES_SUSPENDED' : 'ACTIVE',
            }),
        }));

        const first = await control.fetch(await suspendSalesRequest());
        const firstConfirmedAtMs = (testState.values.get('outbox:job-001:suspend-sales') as {
            confirmedAtMs: number;
        }).confirmedAtMs;
        const duplicate = await control.fetch(await suspendSalesRequest());

        expect(first.status).toBe(200);
        expect(await first.json()).toMatchObject({ suspended: true });
        expect(duplicate.status).toBe(200);
        expect(await duplicate.json()).toMatchObject({ suspended: true });
        expect(sent).toHaveLength(1);
        expect(new TextDecoder().decode(base64Decode(sent[0]))).toContain('suspend_livepeer_sales');
        const confirmed = testState.values.get('outbox:job-001:suspend-sales') as Record<string, unknown>;
        expect(confirmed).toMatchObject({
            state: 'CONFIRMED',
            method: 'suspend_livepeer_sales',
            confirmedAtMs: firstConfirmedAtMs,
            txHash: expect.any(String),
        });
        expect(confirmed).not.toHaveProperty('publicationId');
        expect(confirmed).not.toHaveProperty('nonce');
        expect(confirmed).not.toHaveProperty('blockHash');
        expect(confirmed).not.toHaveProperty('signedTxBase64');
    });

    it('rejects reuse of an operator idempotency key for another method', async () => {
        const testState = createState();
        const request = await finalizeRequest();
        const input = await request.clone().json() as {
            idempotencyKey: string;
            payloadSha256: string;
        };
        testState.values.set(`outbox:${input.idempotencyKey}`, {
            schema: 'youtick.livepeer-operator-outbox.v1',
            state: 'PENDING',
            method: 'suspend_livepeer_sales',
            idempotencyKey: input.idempotencyKey,
            payloadSha256: input.payloadSha256,
            createdAtMs: Date.now(),
        });
        const control = new LivepeerControl(testState.state, createEnv());

        const response = await control.fetch(request);

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'outbox_conflict' });
    });

    it('archives a bounded confirmed operator record with a 90 day cleanup boundary', async () => {
        const testState = createState();
        const archive = createOperatorArchiveDatabase();
        const control = new LivepeerControl(testState.state, createEnv({
            OPERATOR_OUTBOX_ARCHIVE_ENABLED: 'true',
            MARKET_READ_MODEL: archive.database,
        }));
        let finalized = false;
        vi.stubGlobal('fetch', operatorRpc({
            onSend: () => { finalized = true; },
            publicationFor: () => finalized ? contractPublication(publication()) : null,
        }));

        expect((await control.fetch(await finalizeRequest())).status).toBe(200);
        const pending = testState.values.get('outbox:job-001:1:finalize') as {
            confirmedAtMs: number;
            archive: Record<string, unknown>;
        };
        expect(pending.archive).toMatchObject({ status: 'PENDING', attempts: 0 });
        expect(testState.values.get('operator:archive-scan:v1')).toEqual({});
        await control.alarm();

        const committed = testState.values.get('outbox:job-001:1:finalize') as {
            confirmedAtMs: number;
            archive: Record<string, unknown>;
        };
        expect(committed.archive).toMatchObject({
            status: 'COMMITTED',
            attempts: 1,
            archiveSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
            cleanupEligibleAtMs: committed.confirmedAtMs + 90 * 24 * 60 * 60 * 1000,
        });
        expect(archive.rows.size).toBe(1);
        const row = [...archive.rows.values()][0];
        expect(row).toMatchObject({
            method: 'finalize_livepeer_publication',
            cleanup_eligible_at_ms: committed.confirmedAtMs + 90 * 24 * 60 * 60 * 1000,
        });
        expect(JSON.stringify(row)).not.toContain('playback-123');
        expect(JSON.stringify(row)).not.toContain('signedTxBase64');
        expect(testState.values.has('outbox:job-001:1:finalize')).toBe(true);
        await control.alarm();
        expect(archive.rows.size).toBe(1);
        expect(testState.values.has('outbox:job-001:1:finalize')).toBe(true);
    });

    it('keeps the confirmed operator record and backs off when D1 is unavailable', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv({
            OPERATOR_OUTBOX_ARCHIVE_ENABLED: 'true',
        }));
        let finalized = false;
        vi.stubGlobal('fetch', operatorRpc({
            onSend: () => { finalized = true; },
            publicationFor: () => finalized ? contractPublication(publication()) : null,
        }));

        expect((await control.fetch(await finalizeRequest())).status).toBe(200);
        await control.alarm();

        expect(testState.values.get('outbox:job-001:1:finalize')).toMatchObject({
            state: 'CONFIRMED',
            archive: {
                status: 'RETRY',
                attempts: 1,
                nextAttemptAtMs: expect.any(Number),
            },
        });
        const retryAtMs = (testState.values.get('outbox:job-001:1:finalize') as {
            archive: { nextAttemptAtMs: number };
        }).archive.nextAttemptAtMs;
        expect(testState.values.get('operator:archive-scan:v1')).toEqual({
            after: 'outbox:job-001:1:finalize',
            earliestRetryAtMs: retryAtMs,
        });
        await control.alarm();
        expect(testState.values.get('operator:archive-scan:v1')).toEqual({
            earliestRetryAtMs: retryAtMs,
        });
        expect(testState.values.has('outbox:job-001:1:finalize')).toBe(true);
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
                const jobId = order[sent.length];
                expect(testState.values.get(`outbox:${jobId}:1:finalize`)).toMatchObject({
                    state: 'SIGNED',
                    nonce: String(11 + sent.length),
                });
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
        expect(testState.values.get('operator:last-nonce')).toBe('12');
        expect(testState.values.get('outbox:job-001:1:finalize')).toMatchObject({ state: 'CONFIRMED' });
        expect(testState.values.get('outbox:job-002:1:finalize')).toMatchObject({ state: 'CONFIRMED' });
    });
});
