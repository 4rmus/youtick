import { KeyPair, SignedTransaction } from 'near-api-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LivepeerControl, type Env } from './index';

const RPC_URL = 'https://rpc.testnet.near.org';
const CONTRACT_ID = 'market-v2.youtick.testnet';
const OPERATOR_ID = 'bridge.testnet';
const BLOCK_HASH = '11111111111111111111111111111111';
const TICKET_ID = 'b'.repeat(64);
const V2_METHODS = ['finalize_livepeer_publication', 'suspend_livepeer_sales', 'mark_watched'];

function createState() {
    const values = new Map<string, unknown>();
    let tail = Promise.resolve();
    const get = async <T>(key: string) => structuredClone(values.get(key)) as T | undefined;
    const put = async (key: string, value: unknown) => values.set(key, structuredClone(value));
    const list = async (options?: { prefix?: string }) => new Map(
        [...values.entries()].filter(([key]) => !options?.prefix || key.startsWith(options.prefix)),
    );
    const storage = {
        get, put, list,
        delete: async (key: string) => Number(values.delete(key)),
        setAlarm: async () => undefined,
        transaction: async <T>(callback: (transaction: { get: typeof get; put: typeof put; list: typeof list }) => Promise<T>) => {
            const run = tail.then(() => callback({ get, put, list }));
            tail = run.then(() => undefined, () => undefined);
            return run;
        },
    };
    return { state: { storage } as unknown as DurableObjectState, values };
}

function createEnv(overrides?: Partial<Env>): Env {
    return {
        CF_VERSION_METADATA: { id: 'worker-version-mark-watched', tag: 'test', timestamp: '2026-10-07T00:00:00.000Z' },
        LIVEPEER_BRIDGE_ENABLED: 'true',
        LIVEPEER_OPERATOR_MUTATIONS_ENABLED: 'true',
        MARKET_PROTOCOL: 'v2',
        NEAR_NETWORK: 'testnet',
        NEAR_RPC_URL: RPC_URL,
        MARKET_CONTRACT_ID: CONTRACT_ID,
        NEAR_OPERATOR_ACCOUNT_ID: OPERATOR_ID,
        NEAR_OPERATOR_PRIVATE_KEY: KeyPair.fromRandom('ed25519').toString(),
        NEAR_OPERATOR_KEY_EPOCH: '1',
        ...overrides,
    };
}

function hex(value: Uint8Array): string {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function markWatchedRequest(ticketId = TICKET_ID): Promise<Request> {
    const canonical = JSON.stringify({ ticket_id: ticketId });
    const payloadSha256 = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))));
    return new Request('https://object/internal/mark-watched', {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: `${ticketId}:mark-watched`, payloadSha256, ticketId }),
    });
}

function rpc(options: {
    statusAfterSend: string;
    initialStatus?: string;
    methodNames?: string[];
    sendFails?: boolean;
    onSend?: (tx: string) => void;
}) {
    let status = options.initialStatus ?? 'purchased';
    return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { method: string; params: Record<string, unknown> };
        if (body.method === 'query' && body.params.request_type === 'view_access_key') {
            return Response.json({ result: { nonce: 10, block_hash: BLOCK_HASH, permission: { FunctionCall: {
                allowance: '8000000000000000000000', receiver_id: CONTRACT_ID, method_names: options.methodNames ?? V2_METHODS,
            } } } });
        }
        if (body.method === 'query' && body.params.method_name === 'get_ticket') {
            return Response.json({ result: { block_hash: BLOCK_HASH,
                result: Array.from(new TextEncoder().encode(JSON.stringify({ ticket_id: TICKET_ID, status }))) } });
        }
        if (body.method === 'send_tx') {
            options.onSend?.(String(body.params.signed_tx_base64));
            if (options.sendFails) {
                status = options.statusAfterSend;
                return Response.json({ result: { status: { Failure: {} } } });
            }
            status = options.statusAfterSend;
            return Response.json({ result: { status: { SuccessValue: '' } } });
        }
        if (body.method === 'tx') return Response.json({ error: { cause: { name: 'UNKNOWN_TRANSACTION' } } });
        throw new Error(`unexpected_rpc:${body.method}`);
    });
}

describe('mark_watched operator outbox (V2 Market)', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('signs mark_watched with 100 TGas and confirms from the final ticket status', async () => {
        const sent: string[] = [];
        vi.stubGlobal('fetch', rpc({ statusAfterSend: 'watched', onSend: (tx) => sent.push(tx) }));
        const state = createState();
        const response = await new LivepeerControl(state.state, createEnv()).fetch(await markWatchedRequest());
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ accepted: true, watched: true });
        expect(sent).toHaveLength(1);
        const signed = SignedTransaction.decode(Buffer.from(sent[0], 'base64'));
        expect(signed.transaction.receiverId).toBe(CONTRACT_ID);
        const call = signed.transaction.actions[0].functionCall!;
        expect(call.methodName).toBe('mark_watched');
        expect(BigInt(call.gas)).toBe(100_000_000_000_000n);
        expect(JSON.parse(new TextDecoder().decode(Uint8Array.from(call.args as ArrayLike<number>)))).toEqual({ ticket_id: TICKET_ID });

        // The confirmed record is deleted; a replay confirms from chain state without a second
        // transaction or a new record.
        expect([...state.values.keys()].filter((key) => key.startsWith('outbox:'))).toEqual([]);
        const replay = await new LivepeerControl(state.state, createEnv()).fetch(await markWatchedRequest());
        expect(replay.status).toBe(200);
        expect(sent).toHaveLength(1);
        expect([...state.values.keys()].filter((key) => key.startsWith('outbox:'))).toEqual([]);
    });

    it('creates no record and sends nothing for an already settled ticket', async () => {
        const sent: string[] = [];
        vi.stubGlobal('fetch', rpc({ initialStatus: 'released', statusAfterSend: 'released', onSend: (tx) => sent.push(tx) }));
        const state = createState();
        const response = await new LivepeerControl(state.state, createEnv()).fetch(await markWatchedRequest());
        expect(response.status).toBe(200);
        expect(sent).toEqual([]);
        expect(state.values.size).toBe(0);
    });

    it('keeps the operator record budget flat across many first plays', async () => {
        const state = createState();
        for (let index = 0; index < 300; index += 1) {
            const ticketId = index.toString(16).padStart(64, '0');
            let status = 'purchased';
            vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
                const body = JSON.parse(String(init?.body)) as { method: string; params: Record<string, unknown> };
                if (body.params?.request_type === 'view_access_key') {
                    return Response.json({ result: { nonce: 10 + index, block_hash: BLOCK_HASH, permission: { FunctionCall: {
                        allowance: '8000000000000000000000', receiver_id: CONTRACT_ID, method_names: V2_METHODS,
                    } } } });
                }
                if (body.params?.method_name === 'get_ticket') {
                    return Response.json({ result: { block_hash: BLOCK_HASH,
                        result: Array.from(new TextEncoder().encode(JSON.stringify({ ticket_id: ticketId, status }))) } });
                }
                if (body.method === 'send_tx') {
                    status = 'watched';
                    return Response.json({ result: { status: { SuccessValue: '' } } });
                }
                throw new Error(`unexpected_rpc:${body.method}`);
            }));
            const response = await new LivepeerControl(state.state, createEnv()).fetch(await markWatchedRequest(ticketId));
            expect(response.status).toBe(200);
        }
        expect([...state.values.keys()].filter((key) => key.startsWith('outbox:'))).toEqual([]);
        expect(state.values.size).toBeLessThanOrEqual(2);
    });

    it('re-signs after a failed transaction while the ticket is still purchased', async () => {
        const sent: string[] = [];
        vi.stubGlobal('fetch', rpc({ statusAfterSend: 'purchased', sendFails: true, onSend: (tx) => sent.push(tx) }));
        const state = createState();
        const failed = await new LivepeerControl(state.state, createEnv()).fetch(await markWatchedRequest());
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ error: 'playback_pending' });
        expect([...state.values.keys()].filter((key) => key.startsWith('outbox:'))).toEqual([]);

        vi.stubGlobal('fetch', rpc({ statusAfterSend: 'watched', onSend: (tx) => sent.push(tx) }));
        const retried = await new LivepeerControl(state.state, createEnv()).fetch(await markWatchedRequest());
        expect(retried.status).toBe(200);
        expect(sent).toHaveLength(2);
        expect(sent[1]).not.toBe(sent[0]);
    });

    it('maps a contract refusal for a refunded ticket to playback_denied', async () => {
        vi.stubGlobal('fetch', rpc({ statusAfterSend: 'refunded', sendFails: true }));
        const response = await new LivepeerControl(createState().state, createEnv()).fetch(await markWatchedRequest());
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'playback_denied' });
    });

    it('requires the V2 key method set and the V2 protocol', async () => {
        vi.stubGlobal('fetch', rpc({ statusAfterSend: 'watched', methodNames: ['finalize_livepeer_publication', 'suspend_livepeer_sales'] }));
        const wrongKey = await new LivepeerControl(createState().state, createEnv()).fetch(await markWatchedRequest());
        expect(wrongKey.status).toBe(503);
        expect(await wrongKey.json()).toEqual({ error: 'runtime_not_configured' });

        vi.stubGlobal('fetch', rpc({ statusAfterSend: 'watched' }));
        const v1 = await new LivepeerControl(createState().state, createEnv({ MARKET_PROTOCOL: undefined })).fetch(await markWatchedRequest());
        expect(v1.status).toBe(403);
        expect(await v1.json()).toEqual({ error: 'operator_unauthorized' });
    });

    it('rejects malformed outbox input before any RPC', async () => {
        const fetcher = rpc({ statusAfterSend: 'watched' });
        vi.stubGlobal('fetch', fetcher);
        const bad = new Request('https://object/internal/mark-watched', {
            method: 'POST',
            body: JSON.stringify({ idempotencyKey: 'x:mark-watched', payloadSha256: 'a'.repeat(64), ticketId: 'x' }),
        });
        const response = await new LivepeerControl(createState().state, createEnv()).fetch(bad);
        expect(response.status).toBe(400);
        expect(fetcher).not.toHaveBeenCalled();
    });
});
