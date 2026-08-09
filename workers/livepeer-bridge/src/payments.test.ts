import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyQuoteSignature = vi.hoisted(() => vi.fn(() => true));
vi.mock('@defuse-protocol/one-click-sdk-typescript', async (importOriginal) => ({
    ...await importOriginal<typeof import('@defuse-protocol/one-click-sdk-typescript')>(),
    verifyQuoteSignature,
}));

import handler, { type Env } from './index';
import { expirePaymentRateLimit, paymentRateLimit } from './payments';

const ORIGIN = 'https://app.youtick.net';
const RPC_URL = 'https://rpc.mainnet.near.org';
const CONTRACT_ID = 'paid-media.near';
const API_KEY = `eyJx${'a'.repeat(266)}.${'b'.repeat(266)}.sig`;
const BASE_USDC = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
const ARB_USDC = 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near';
const USDC_CONTRACT = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const DESTINATION_USDC = `nep141:${USDC_CONTRACT}`;
const REFUND_ADDRESS = '0x2527D02599Ba641c19FEa793cD0F167589a0f10D';
const DEPOSIT_ADDRESS = '0x1111111111111111111111111111111111111111';

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
    const list = async (options?: { limit?: number }) => new Map(
        [...values.entries()].slice(0, options?.limit ?? values.size),
    );
    const storage = {
        get,
        put,
        list,
        deleteAll: async () => values.clear(),
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
    return {
        CF_VERSION_METADATA: {
            id: 'payment-worker-test',
            tag: 'test',
            timestamp: '2026-08-08T00:00:00.000Z',
        },
        ALLOWED_ORIGINS: ORIGIN,
        NEAR_NETWORK: 'mainnet',
        NEAR_RPC_URL: RPC_URL,
        MARKET_CONTRACT_ID: CONTRACT_ID,
        MULTI_ASSET_PAYMENTS_MODE: 'preview',
        MULTI_ASSET_PAYMENT_ASSET_IDS: `${BASE_USDC},${ARB_USDC}`,
        ONECLICK_API_KEY: API_KEY,
        LIVEPEER_CONTROL: {
            idFromName: (name: string) => ({ toString: () => name }),
            get: () => ({ fetch: async () => Response.json({ accepted: true }) }),
        } as unknown as DurableObjectNamespace,
        ...overrides,
    };
}

function quoteRequest(body?: Record<string, unknown>): Request {
    return new Request('https://bridge.youtick.net/v1/payments/quote', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: ORIGIN,
            'CF-Connecting-IP': '203.0.113.9',
        },
        body: JSON.stringify({
            dry: true,
            account_id: 'buyer.near',
            origin_asset_id: BASE_USDC,
            refund_address: REFUND_ADDRESS,
            purpose: { type: 'upload', expected_source_bytes: '1000000000' },
            ...body,
        }),
    });
}

function statusRequest(depositAddress = DEPOSIT_ADDRESS, depositMemo?: string): Request {
    const query = new URLSearchParams({ deposit_address: depositAddress });
    if (depositMemo) query.set('deposit_memo', depositMemo);
    return new Request(`https://bridge.youtick.net/v1/payments/status?${query}`, {
        headers: { Origin: ORIGIN },
    });
}

function rpcResult(value: unknown): Response {
    return Response.json({
        result: { result: [...new TextEncoder().encode(JSON.stringify(value))] },
    });
}

function signedQuote(
    quoteRequestValue: Record<string, unknown>,
    options?: {
        depositAddress?: string;
        depositMemo?: string;
        timeEstimate?: number;
        mutateRequest?: (value: Record<string, unknown>) => void;
        mutateQuote?: (value: Record<string, unknown>) => void;
    },
): Record<string, unknown> {
    const request = structuredClone(quoteRequestValue);
    options?.mutateRequest?.(request);
    const quote: Record<string, unknown> = {
        amountIn: '2022434',
        amountInFormatted: '2.022434',
        amountInUsd: '2.02',
        minAmountIn: '2000000',
        amountOut: request.amount,
        amountOutFormatted: '2',
        amountOutUsd: '2',
        minAmountOut: request.amount,
        timeEstimate: options?.timeEstimate ?? 35,
    };
    if (request.dry === false) {
        quote.depositAddress = options?.depositAddress ?? DEPOSIT_ADDRESS;
        quote.deadline = request.deadline;
        quote.timeWhenInactive = request.deadline;
    }
    if (options?.depositMemo) quote.depositMemo = options.depositMemo;
    options?.mutateQuote?.(quote);
    return {
        correlationId: 'oneclick-correlation-id',
        timestamp: '2026-08-08T12:00:00.000Z',
        signature: 'signed-by-oneclick',
        quoteRequest: request,
        quote,
    };
}

function installQuoteFetch(options?: Parameters<typeof signedQuote>[1]): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === RPC_URL) {
            const rpc = JSON.parse(String(init?.body)) as { params: { method_name: string } };
            if (rpc.params.method_name === 'get_usdc_contract_id') return rpcResult(USDC_CONTRACT);
            if (rpc.params.method_name === 'get_publication') {
                return rpcResult({
                    publication_id: 'publication-1',
                    price_usdc: '2500000',
                    availability: 'ACTIVE',
                });
            }
        }
        if (url === 'https://1click.chaindefuser.com/v0/quote') {
            return Response.json(signedQuote(
                JSON.parse(String(init?.body)) as Record<string, unknown>,
                options,
            ));
        }
        throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

beforeEach(() => {
    vi.restoreAllMocks();
    verifyQuoteSignature.mockReset();
    verifyQuoteSignature.mockReturnValue(true);
});

describe('multi-asset payment routes', () => {
    it('lists only configured static assets while quote creation is off', async () => {
        const response = await handler.fetch(new Request(
            'https://bridge.youtick.net/v1/payments/assets',
            { headers: { Origin: ORIGIN } },
        ), createEnv({
            MULTI_ASSET_PAYMENTS_MODE: 'off',
            MULTI_ASSET_PAYMENT_ASSET_IDS: BASE_USDC,
            ONECLICK_API_KEY: undefined,
        }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            schema: 'youtick.payment-assets.v1',
            mode: 'off',
            destination_asset_id: DESTINATION_USDC,
            assets: [{
                asset_id: BASE_USDC,
                network: 'base',
                symbol: 'USDC',
                decimals: 6,
                contract_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            }],
        });
    });

    it('allows an empty asset list while every new quote is off', async () => {
        const response = await handler.fetch(new Request(
            'https://bridge.youtick.net/v1/payments/assets',
            { headers: { Origin: ORIGIN } },
        ), createEnv({
            MULTI_ASSET_PAYMENTS_MODE: 'off',
            MULTI_ASSET_PAYMENT_ASSET_IDS: '',
            ONECLICK_API_KEY: undefined,
        }));

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ mode: 'off', assets: [] });
    });

    it('keeps firm quotes disabled in preview mode', async () => {
        const response = await handler.fetch(quoteRequest({ dry: false }), createEnv());

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'payment_live_disabled' });
    });

    it('derives the upload exact-output amount and sends only the API key upstream', async () => {
        const fetchMock = installQuoteFetch();
        const response = await handler.fetch(quoteRequest(), createEnv());
        const payload = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(payload.amount_out_usdc).toBe('500000');
        expect(payload.destination_asset_id).toBe(DESTINATION_USDC);
        const upstreamCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/v0/quote'))!;
        const upstreamInit = upstreamCall[1] as RequestInit;
        expect(upstreamInit.headers).toEqual({
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
        });
        expect(upstreamInit.headers).not.toHaveProperty('Authorization');
        const upstreamBody = JSON.parse(String(upstreamInit.body));
        expect(upstreamBody).toMatchObject({
            dry: true,
            swapType: 'EXACT_OUTPUT',
            slippageTolerance: 100,
            originAsset: BASE_USDC,
            depositType: 'ORIGIN_CHAIN',
            destinationAsset: DESTINATION_USDC,
            amount: '500000',
            refundTo: REFUND_ADDRESS,
            refundType: 'ORIGIN_CHAIN',
            recipient: 'buyer.near',
            recipientType: 'DESTINATION_CHAIN',
        });
        expect(upstreamBody).not.toHaveProperty('customRecipientMsg');
        expect(upstreamBody).not.toHaveProperty('appFees');
        expect(upstreamBody).not.toHaveProperty('insured');
        expect(JSON.stringify(payload)).not.toContain(API_KEY);
        expect(verifyQuoteSignature).toHaveBeenCalledOnce();
    });

    it('reads an active ticket price from final market state', async () => {
        const fetchMock = installQuoteFetch();
        const response = await handler.fetch(quoteRequest({
            purpose: { type: 'ticket', publication_id: 'publication-1' },
        }), createEnv());
        const payload = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(payload.amount_out_usdc).toBe('2500000');
        const calls = fetchMock.mock.calls.filter(([url]) => String(url) === RPC_URL);
        expect(calls.map(([, init]) => (
            JSON.parse(String((init as RequestInit).body)).params.method_name
        ))).toEqual(['get_usdc_contract_id', 'get_publication']);
    });

    it.each([
        ['customRecipientMsg', (value: Record<string, unknown>) => { value.customRecipientMsg = '{}'; }],
        ['appFees', (value: Record<string, unknown>) => { value.appFees = [{ fee: 10 }]; }],
        ['insured', (value: Record<string, unknown>) => { value.insured = true; }],
    ])('rejects signed responses containing %s', async (_field, mutateRequest) => {
        installQuoteFetch({ mutateRequest });
        const response = await handler.fetch(quoteRequest(), createEnv());

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: 'oneclick_response_invalid' });
        expect(verifyQuoteSignature).toHaveBeenCalledOnce();
    });

    it('accepts only the safe defaults that 1Click may echo', async () => {
        installQuoteFetch({
            mutateRequest: (value) => {
                value.confidentiality = 'public';
                value.depositMode = 'SIMPLE';
                value.quoteWaitingTimeMs = 0;
                value.appFees = [];
                value.insured = false;
            },
        });

        const response = await handler.fetch(quoteRequest(), createEnv());

        expect(response.status).toBe(200);
    });

    it('rejects an invalid signature', async () => {
        installQuoteFetch();
        verifyQuoteSignature.mockReturnValue(false);

        const response = await handler.fetch(quoteRequest(), createEnv());

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: 'oneclick_response_invalid' });
    });

    it('shows slow dry routes but rejects a slow firm route', async () => {
        installQuoteFetch({ timeEstimate: 601 });
        const dry = await handler.fetch(quoteRequest(), createEnv());
        expect(dry.status).toBe(200);

        installQuoteFetch({ timeEstimate: 601 });
        const firm = await handler.fetch(quoteRequest({ dry: false }), createEnv({
            MULTI_ASSET_PAYMENTS_MODE: 'live',
        }));
        expect(firm.status).toBe(503);
        expect(await firm.json()).toEqual({ error: 'payment_route_temporarily_unavailable' });
    });

    it('rejects a firm quote whose signed deposit deadline is stale', async () => {
        installQuoteFetch({
            mutateQuote: (value) => { value.deadline = '2026-08-07T00:00:00.000Z'; },
        });

        const response = await handler.fetch(quoteRequest({ dry: false }), createEnv({
            MULTI_ASSET_PAYMENTS_MODE: 'live',
        }));

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: 'oneclick_response_invalid' });
    });

    it.each([429, 500])('maps an upstream %s response without leaking its body', async (status) => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (
            String(input) === RPC_URL
                ? rpcResult(USDC_CONTRACT)
                : Response.json({ apiKey: API_KEY, refund: REFUND_ADDRESS }, { status })
        )));

        const response = await handler.fetch(quoteRequest(), createEnv());

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'oneclick_unavailable' });
        expect(JSON.stringify(log.mock.calls)).not.toContain(API_KEY);
        expect(JSON.stringify(log.mock.calls)).not.toContain(REFUND_ADDRESS);
    });

    it('maps an upstream timeout without exposing runtime details', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            if (String(input) === RPC_URL) return rpcResult(USDC_CONTRACT);
            throw new DOMException('timed out with secret detail', 'TimeoutError');
        }));

        const response = await handler.fetch(quoteRequest(), createEnv());

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'oneclick_unavailable' });
    });

    it('rejects a refund address that does not match the selected source network', async () => {
        const response = await handler.fetch(quoteRequest({
            refund_address: 'buyer.near',
        }), createEnv());

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_payment_quote_request' });
    });

    it('maps a rejected quote without exposing the upstream body', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input) === RPC_URL) {
                const rpc = JSON.parse(String(init?.body)) as { params: { method_name: string } };
                return rpc.params.method_name === 'get_usdc_contract_id'
                    ? rpcResult(USDC_CONTRACT)
                    : rpcResult(null);
            }
            return Response.json({ message: 'secret vendor explanation' }, { status: 400 });
        }));

        const response = await handler.fetch(quoteRequest(), createEnv());

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ error: 'oneclick_quote_rejected' });
    });

    it('keeps status lookup available while new quotes are off', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const quoteRequestValue = {
            dry: false,
            swapType: 'EXACT_OUTPUT',
            slippageTolerance: 100,
            originAsset: BASE_USDC,
            depositType: 'ORIGIN_CHAIN',
            destinationAsset: DESTINATION_USDC,
            amount: '2500000',
            refundTo: REFUND_ADDRESS,
            refundType: 'ORIGIN_CHAIN',
            recipient: 'buyer.near',
            recipientType: 'DESTINATION_CHAIN',
            deadline: '2026-08-08T14:00:00.000Z',
        };
        const fetchMock = vi.fn(async (_input: RequestInfo | URL) => Response.json({
            correlationId: 'status-correlation-id',
            quoteResponse: signedQuote(quoteRequestValue),
            status: 'SUCCESS',
            updatedAt: '2026-08-08T12:05:00.000Z',
            swapDetails: { destinationChainTxHashes: [] },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const response = await handler.fetch(statusRequest(), createEnv({
            MULTI_ASSET_PAYMENTS_MODE: 'off',
        }));

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            schema: 'youtick.payment-status.v1',
            status: 'SUCCESS',
            updated_at: '2026-08-08T12:05:00.000Z',
        });
        expect(String(fetchMock.mock.calls[0][0])).toBe(
            `https://1click.chaindefuser.com/v0/status?depositAddress=${DEPOSIT_ADDRESS}`,
        );
        expect(verifyQuoteSignature).toHaveBeenCalledOnce();
        const logs = info.mock.calls.map(([value]) => JSON.parse(String(value)));
        expect(logs).toContainEqual({
            event: 'payment_status_observed',
            details: { status: 'SUCCESS' },
        });
        expect(logs).toContainEqual({
            event: 'payment_route_completed',
            details: {
                operation: 'status',
                httpCode: 200,
                latencyMs: expect.any(Number),
            },
        });
        expect(JSON.stringify(logs)).not.toContain(DEPOSIT_ADDRESS);
        expect(JSON.stringify(logs)).not.toContain(REFUND_ADDRESS);
        expect(JSON.stringify(logs)).not.toContain(API_KEY);
    });

    it('rejects a status response bound to another deposit address', async () => {
        const quoteRequestValue = {
            dry: false,
            swapType: 'EXACT_OUTPUT',
            slippageTolerance: 100,
            originAsset: BASE_USDC,
            depositType: 'ORIGIN_CHAIN',
            destinationAsset: DESTINATION_USDC,
            amount: '2500000',
            refundTo: REFUND_ADDRESS,
            refundType: 'ORIGIN_CHAIN',
            recipient: 'buyer.near',
            recipientType: 'DESTINATION_CHAIN',
            deadline: '2026-08-08T14:00:00.000Z',
        };
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({
            correlationId: 'status-correlation-id',
            quoteResponse: signedQuote(quoteRequestValue, {
                depositAddress: '0x2222222222222222222222222222222222222222',
            }),
            status: 'PROCESSING',
            updatedAt: '2026-08-08T12:05:00.000Z',
            swapDetails: {},
        })));

        const response = await handler.fetch(statusRequest(), createEnv({
            MULTI_ASSET_PAYMENTS_MODE: 'off',
        }));

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: 'oneclick_response_invalid' });
    });

    it('requires an allowed browser origin', async () => {
        const response = await handler.fetch(new Request(
            'https://bridge.youtick.net/v1/payments/assets',
            { headers: { Origin: 'https://evil.example' } },
        ), createEnv());

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'origin_denied' });
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});

describe('payment Durable Object rate limits', () => {
    it('limits quotes to five per minute', async () => {
        const now = 1_785_589_310_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const { state, values, alarms } = createState();
        const responses = [];
        for (let index = 0; index < 6; index += 1) {
            responses.push(await paymentRateLimit(state, new Request(
                'https://object/internal/payment-rate-limit',
                { method: 'POST', body: JSON.stringify({ kind: 'quote' }) },
            )));
        }

        expect(responses.slice(0, 5).every(({ status }) => status === 200)).toBe(true);
        expect(responses[5].status).toBe(429);
        expect(await responses[5].json()).toEqual({ error: 'payment_quote_rate_limited' });
        expect(alarms.at(-1)).toBe(now + 60_000);

        vi.spyOn(Date, 'now').mockReturnValue(now + 60_000);
        expect(await expirePaymentRateLimit(state)).toBe(true);
        expect(values.size).toBe(0);
    });

    it('limits status polling to once per five seconds', async () => {
        const now = 1_785_589_310_000;
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const { state, values, alarms } = createState();
        const first = await paymentRateLimit(state, new Request(
            'https://object/internal/payment-rate-limit',
            { method: 'POST', body: JSON.stringify({ kind: 'status' }) },
        ));
        const second = await paymentRateLimit(state, new Request(
            'https://object/internal/payment-rate-limit',
            { method: 'POST', body: JSON.stringify({ kind: 'status' }) },
        ));

        expect(first.status).toBe(200);
        expect(second.status).toBe(429);
        expect(await second.json()).toEqual({ error: 'payment_status_rate_limited' });
        expect(alarms.at(-1)).toBe(now + 5_000);

        vi.spyOn(Date, 'now').mockReturnValue(now + 5_000);
        expect(await expirePaymentRateLimit(state)).toBe(true);
        expect(values.size).toBe(0);
    });

    it('does not create a rate-limit record above the object ceiling', async () => {
        const { state, values } = createState();
        for (let index = 0; index < 256; index += 1) {
            values.set(`existing:${String(index).padStart(3, '0')}`, { index });
        }

        const response = await paymentRateLimit(state, new Request(
            'https://object/internal/payment-rate-limit',
            { method: 'POST', body: JSON.stringify({ kind: 'quote' }) },
        ));

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'durable_object_record_limit' });
        expect(values.size).toBe(256);
        expect(values.has('payment-rate:quote:v1')).toBe(false);
    });
});
