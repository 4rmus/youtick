import { beforeEach, describe, expect, it, vi } from 'vitest';
import vectors from '../../../protocol/paid-media-livepeer-v1/golden-vectors.json';
import handler, {
    LivepeerControl,
    formatLog,
    forwardUploadIntent,
    jobObjectName,
    operatorObjectName,
    type Env,
} from './index';

const ORIGIN = 'https://app.youtick.net';
const RPC_URL = 'https://rpc.testnet.near.org';
const CONTRACT_ID = 'paid-media-livepeer-v1.testnet';

type TestState = {
    state: DurableObjectState;
    values: Map<string, unknown>;
};

function createState(): TestState {
    const values = new Map<string, unknown>();
    let transactionTail = Promise.resolve();
    const get = async <T>(key: string) => structuredClone(values.get(key)) as T | undefined;
    const put = async (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
    };
    const storage = {
        get,
        put,
        transaction: async <T>(callback: (transaction: {
            get: typeof get;
            put: typeof put;
        }) => Promise<T>) => {
            const run = transactionTail.then(() => callback({ get, put }));
            transactionTail = run.then(() => undefined, () => undefined);
            return run;
        },
    };
    return {
        state: { storage } as unknown as DurableObjectState,
        values,
    };
}

function createEnv(overrides?: Partial<Env>): Env {
    return {
        LIVEPEER_BRIDGE_ENABLED: 'false',
        ALLOWED_ORIGINS: ORIGIN,
        NEAR_NETWORK: 'testnet',
        NEAR_RPC_URL: RPC_URL,
        MARKET_CONTRACT_ID: CONTRACT_ID,
        ...overrides,
    };
}

function controlRequest(overrides?: {
    body?: Record<string, unknown>;
    envelope?: Record<string, unknown>;
}): Request {
    const input = structuredClone(vectors.upload_intent) as {
        body: Record<string, unknown>;
        envelope: Record<string, unknown>;
    };
    const body = { ...input.body, ...overrides?.body };
    const envelope: Record<string, unknown> = {
        ...input.envelope,
        expires_at_ms: String(Date.now() + 5 * 60 * 1000),
        ...overrides?.envelope,
    };
    return new Request('https://bridge.youtick.net/v1/upload-intents', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: String(envelope.origin),
        },
        body: JSON.stringify({ body, envelope }),
    });
}

function rpcResponse(): Response {
    const body = vectors.upload_intent.body;
    const job = {
        job_id: body.job_id,
        creator_id: vectors.upload_intent.envelope.account_id,
        profile_id: body.profile_id,
        profile_config_sha256: body.profile_config_sha256,
        expected_source_bytes: body.expected_source_bytes,
        generation: body.generation,
        status: 'Authorized',
    };
    return Response.json({
        result: {
            result: Array.from(new TextEncoder().encode(JSON.stringify(job))),
        },
    });
}

describe('Livepeer bridge PR-2 foundation', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps public control hard-disabled even if the runtime flag is set', async () => {
        const health = await handler.fetch(
            new Request('https://bridge.youtick.net/__health'),
            createEnv(),
        );
        expect(await health.json()).toMatchObject({
            stage: 'DISABLED',
            publicControlImplemented: false,
            providerMutationEnabled: false,
            controlPlaneReady: false,
        });

        const response = await handler.fetch(
            controlRequest(),
            createEnv({ LIVEPEER_BRIDGE_ENABLED: 'true' }),
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'control_plane_disabled' });
    });

    it('routes the locked identity to one named job object', async () => {
        const fetchStub = vi.fn(async () => Response.json({ state: 'INTENT_RESERVED' }));
        const idFromName = vi.fn(() => ({ toString: () => 'object-id' }));
        const get = vi.fn(() => ({ fetch: fetchStub }));
        const response = await forwardUploadIntent(controlRequest(), createEnv({
            LIVEPEER_CONTROL: { idFromName, get } as unknown as DurableObjectNamespace,
        }));

        expect(response.status).toBe(200);
        expect(idFromName).toHaveBeenCalledWith(
            'job:testnet:paid-media-livepeer-v1.testnet:job-001:1',
        );
        expect(fetchStub).toHaveBeenCalledOnce();
        expect(jobObjectName('testnet', CONTRACT_ID, 'job-001', 1))
            .toBe('job:testnet:paid-media-livepeer-v1.testnet:job-001:1');
        expect(operatorObjectName('testnet', 'ed25519:key', 2))
            .toBe('operator:testnet:ed25519:key:2');
    });

    it('accepts one concurrent reservation winner after final NEAR reads', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv());
        let releaseFetch!: () => void;
        const gate = new Promise<void>((resolve) => {
            releaseFetch = resolve;
        });
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const rpcBody = JSON.parse(String(init?.body)) as {
                params: { finality: string; account_id: string; method_name: string };
            };
            expect(rpcBody.params).toMatchObject({
                finality: 'final',
                account_id: CONTRACT_ID,
                method_name: 'get_media_job',
            });
            await gate;
            return rpcResponse();
        });
        vi.stubGlobal('fetch', fetchMock);

        const first = control.fetch(controlRequest());
        const second = control.fetch(controlRequest());
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        expect(testState.values.has('job:v1')).toBe(false);
        releaseFetch();

        const responses = await Promise.all([first, second]);
        expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
        const bodies = await Promise.all(responses.map((response) => response.json())) as Array<{
            created: boolean;
        }>;
        expect(bodies.filter((body) => body.created)).toHaveLength(1);
        expect(testState.values.has('job:v1')).toBe(true);
    });

    it('preserves the reservation across object restart or eviction', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => rpcResponse()));
        const testState = createState();
        const firstInstance = new LivepeerControl(testState.state, createEnv());
        const created = await firstInstance.fetch(controlRequest());
        expect(created.status).toBe(201);

        const restartedInstance = new LivepeerControl(testState.state, createEnv());
        const replay = await restartedInstance.fetch(controlRequest());
        expect(replay.status).toBe(200);
        expect(await replay.json()).toMatchObject({
            state: 'INTENT_RESERVED',
            created: false,
        });
    });

    it('persists one idempotent outbox record and rejects a conflict', async () => {
        const testState = createState();
        const control = new LivepeerControl(testState.state, createEnv());
        const outbox = {
            idempotencyKey: 'job-001:1:finalize',
            method: 'finalize_livepeer_publication',
            jobId: 'job-001',
            generation: 1,
            payloadSha256: 'b'.repeat(64),
        };
        const request = (payload = outbox) => new Request('https://object/internal/outbox', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        expect((await control.fetch(request())).status).toBe(201);
        const replay = await control.fetch(request());
        expect(replay.status).toBe(200);
        expect(await replay.json()).toMatchObject({ created: false, state: 'PENDING' });

        const conflict = await control.fetch(request({ ...outbox, payloadSha256: 'c'.repeat(64) }));
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toEqual({ error: 'outbox_conflict' });
    });

    it('rejects protocol drift and redacts sensitive log fields', async () => {
        const invalid = await forwardUploadIntent(controlRequest({
            envelope: { body_sha256: '0'.repeat(64) },
        }), createEnv({
            LIVEPEER_CONTROL: {} as DurableObjectNamespace,
        }));
        expect(invalid.status).toBe(400);

        const log = formatLog('failed', {
            authorization: 'Bearer secret',
            url: 'https://tus.example/upload/1',
            signedTransaction: 'signed-bytes',
            nested: { privateKey: 'key', jobId: 'job-001' },
        });
        expect(log).not.toContain('Bearer secret');
        expect(log).not.toContain('tus.example');
        expect(log).not.toContain('signed-bytes');
        expect(log).not.toContain('"key"');
        expect(log).toContain('job-001');
    });
});
