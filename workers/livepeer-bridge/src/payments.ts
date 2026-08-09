import {
    QuoteRequest,
    verifyQuoteSignature,
    type OneClickQuoteResponse,
} from '@defuse-protocol/one-click-sdk-typescript';
import { assertDurableObjectRecordCapacity } from './durable-object-capacity';

export interface PaymentEnv {
    ALLOWED_ORIGINS?: string;
    NEAR_NETWORK?: string;
    NEAR_RPC_URL?: string;
    MARKET_CONTRACT_ID?: string;
    MULTI_ASSET_PAYMENTS_MODE?: string;
    MULTI_ASSET_PAYMENT_ASSET_IDS?: string;
    ONECLICK_API_KEY?: string;
    LIVEPEER_CONTROL?: DurableObjectNamespace;
}

type JsonObject = Record<string, unknown>;
type PaymentMode = 'off' | 'preview' | 'live';
type PaymentPurpose =
    | { type: 'ticket'; publication_id: string }
    | { type: 'upload'; expected_source_bytes: string };
type PaymentQuoteInput = {
    dry: boolean;
    account_id: string;
    origin_asset_id: string;
    refund_address: string;
    purpose: PaymentPurpose;
};
type PaymentAsset = {
    asset_id: string;
    network: 'arbitrum' | 'base' | 'near';
    symbol: 'USDC' | 'USDT' | 'wNEAR';
    decimals: number;
    contract_address: string;
};

const ONECLICK_API_BASE = 'https://1click.chaindefuser.com';
const MAINNET_USDC_CONTRACT_ID = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const DESTINATION_ASSET_ID = `nep141:${MAINNET_USDC_CONTRACT_ID}`;
const DEFAULT_ALLOWED_ORIGINS = 'https://youtick.net,https://www.youtick.net';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 20_000_000_000n;
const MIN_TICKET_PRICE_USDC = 2_000_000n;
const MIN_UPLOAD_FEE_USDC = 500_000n;
const QUOTE_DEADLINE_MS = 2 * 60 * 60 * 1000;
const QUOTE_RATE_LIMIT = 5;
const QUOTE_RATE_WINDOW_MS = 60_000;
const STATUS_RATE_WINDOW_MS = 5_000;
const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const INTEGER_PATTERN = /^[1-9][0-9]{0,19}$/;
const PAYMENT_STATUSES = new Set([
    'KNOWN_DEPOSIT_TX',
    'PENDING_DEPOSIT',
    'INCOMPLETE_DEPOSIT',
    'PROCESSING',
    'SUCCESS',
    'REFUNDED',
    'FAILED',
]);
const ONECLICK_REQUEST_KEYS = new Set([
    'dry',
    'swapType',
    'slippageTolerance',
    'originAsset',
    'depositType',
    'destinationAsset',
    'amount',
    'refundTo',
    'refundType',
    'recipient',
    'recipientType',
    'deadline',
    'confidentiality',
    'depositMode',
    'quoteWaitingTimeMs',
    'appFees',
    'insured',
]);
const ONECLICK_QUOTE_KEYS = new Set([
    'depositAddress',
    'depositMemo',
    'amountIn',
    'amountInFormatted',
    'amountInUsd',
    'minAmountIn',
    'amountOut',
    'amountOutFormatted',
    'amountOutUsd',
    'minAmountOut',
    'deadline',
    'timeWhenInactive',
    'timeEstimate',
    'virtualChainRecipient',
    'virtualChainRefundRecipient',
    'customRecipientMsg',
    'refundFee',
    'withdrawFee',
]);
const PAYMENT_ASSETS: Record<string, PaymentAsset> = Object.fromEntries([
    {
        asset_id: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
        network: 'arbitrum',
        symbol: 'USDC',
        decimals: 6,
        contract_address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    },
    {
        asset_id: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
        network: 'base',
        symbol: 'USDC',
        decimals: 6,
        contract_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    },
    {
        asset_id: 'nep141:wrap.near',
        network: 'near',
        symbol: 'wNEAR',
        decimals: 24,
        contract_address: 'wrap.near',
    },
    {
        asset_id: 'nep141:usdt.tether-token.near',
        network: 'near',
        symbol: 'USDT',
        decimals: 6,
        contract_address: 'usdt.tether-token.near',
    },
].map((asset) => [asset.asset_id, asset])) as Record<string, PaymentAsset>;

const PAYMENT_ERROR_STATUS: Record<string, number> = {
    internal_error: 500,
    invalid_payment_quote_request: 400,
    invalid_payment_status_request: 400,
    origin_denied: 403,
    payment_asset_denied: 400,
    payment_contract_mismatch: 503,
    durable_object_record_limit: 503,
    payment_live_disabled: 503,
    payment_market_invalid: 502,
    payment_market_unavailable: 503,
    payment_publication_unavailable: 409,
    payment_quote_rate_limited: 429,
    payment_quotes_disabled: 503,
    payment_route_temporarily_unavailable: 503,
    payment_status_rate_limited: 429,
    oneclick_quote_rejected: 422,
    oneclick_response_invalid: 502,
    oneclick_swap_not_found: 404,
    oneclick_unavailable: 503,
    runtime_not_configured: 503,
};

export async function paymentAssets(request: Request, env: PaymentEnv): Promise<Response> {
    return paymentRoute(request, env, 'assets', async () => {
        const mode = paymentMode(env);
        if (!mode) throw new Error('runtime_not_configured');
        const assets = configuredAssets(env, mode === 'off');
        if (mode !== 'off' && !validQuoteConfig(env)) throw new Error('runtime_not_configured');
        return paymentJson({
            schema: 'youtick.payment-assets.v1',
            mode,
            destination_asset_id: DESTINATION_ASSET_ID,
            assets,
        });
    });
}

export async function paymentQuote(request: Request, env: PaymentEnv): Promise<Response> {
    return paymentRoute(request, env, 'quote', async () => {
        const mode = paymentMode(env);
        if (mode === 'off') throw new Error('payment_quotes_disabled');
        if (!mode || !validQuoteConfig(env)) throw new Error('runtime_not_configured');

        const input = parseQuoteInput(await readJsonObject(request.clone()));
        if (mode === 'preview' && !input.dry) throw new Error('payment_live_disabled');
        const asset = configuredAssets(env).find(({ asset_id }) => asset_id === input.origin_asset_id);
        if (!asset) throw new Error('payment_asset_denied');
        if (!validRefundAddress(asset, input.refund_address)) {
            throw new Error('invalid_payment_quote_request');
        }

        await enforceRemoteRateLimit(
            env,
            'quote',
            `${input.account_id}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`,
        );
        const amountOut = await derivePaymentAmount(env, input.purpose);
        const deadline = new Date(Date.now() + QUOTE_DEADLINE_MS).toISOString();
        const quoteRequest: QuoteRequest = {
            dry: input.dry,
            swapType: QuoteRequest.swapType.EXACT_OUTPUT,
            slippageTolerance: 100,
            originAsset: asset.asset_id,
            depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
            destinationAsset: DESTINATION_ASSET_ID,
            amount: amountOut,
            refundTo: input.refund_address,
            refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
            recipient: input.account_id,
            recipientType: QuoteRequest.recipientType.DESTINATION_CHAIN,
            deadline,
        };
        const quoteResponse = await oneClickRequest(env, '/v0/quote', {
            method: 'POST',
            body: JSON.stringify(quoteRequest),
        }, 'quote');
        validateQuoteResponse(quoteResponse, quoteRequest);
        if (!input.dry
            && (requireObject(quoteResponse.quote, 'oneclick_response_invalid').timeEstimate as number) > 600) {
            throw new Error('payment_route_temporarily_unavailable');
        }

        return paymentJson({
            schema: 'youtick.payment-quote.v1',
            purpose: input.purpose,
            amount_out_usdc: amountOut,
            origin_asset: asset,
            destination_asset_id: DESTINATION_ASSET_ID,
            quote_response: quoteResponse,
        });
    });
}

export async function paymentStatus(request: Request, env: PaymentEnv): Promise<Response> {
    return paymentRoute(request, env, 'status', async () => {
        if (!validStatusConfig(env)) throw new Error('runtime_not_configured');
        const { depositAddress, depositMemo } = parseStatusInput(new URL(request.url));
        await enforceRemoteRateLimit(env, 'status', `${depositAddress}:${depositMemo || ''}`);
        const query = new URLSearchParams({ depositAddress });
        if (depositMemo) query.set('depositMemo', depositMemo);
        const response = await oneClickRequest(
            env,
            `/v0/status?${query.toString()}`,
            { method: 'GET' },
            'status',
        );
        const quoteResponse = requireObject(response.quoteResponse, 'oneclick_response_invalid');
        validateStoredQuote(quoteResponse, depositAddress, depositMemo);
        if (typeof response.status !== 'string' || !PAYMENT_STATUSES.has(response.status)) {
            throw new Error('oneclick_response_invalid');
        }
        if (typeof response.updatedAt !== 'string' || !Number.isFinite(Date.parse(response.updatedAt))) {
            throw new Error('oneclick_response_invalid');
        }
        const swapDetails = requireObject(response.swapDetails, 'oneclick_response_invalid');
        console.info(JSON.stringify({
            event: 'payment_status_observed',
            details: { status: response.status },
        }));
        return paymentJson({
            schema: 'youtick.payment-status.v1',
            status: response.status,
            updated_at: response.updatedAt,
            quote_response: quoteResponse,
            swap_details: swapDetails,
        });
    });
}

export function paymentOptions(request: Request, env: PaymentEnv): Response {
    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigins(env).has(origin)) return paymentJson({ error: 'origin_denied' }, 403);
    return withPaymentCors(new Response(null, { status: 204 }), origin);
}

export async function paymentRateLimit(
    state: DurableObjectState,
    request: Request,
): Promise<Response> {
    try {
        const input = await readJsonObject(request);
        requireExactKeys(input, ['kind'], 'invalid_payment_quote_request');
        if (input.kind !== 'quote' && input.kind !== 'status') {
            throw new Error('invalid_payment_quote_request');
        }
        const now = Date.now();
        const kind = input.kind;
        const expiresAtMs = await state.storage.transaction(async (transaction) => {
            const key = `payment-rate:${kind}:v1`;
            const current = await transaction.get<{ window_started_at_ms: number; count: number }>(key);
            const windowMs = kind === 'quote' ? QUOTE_RATE_WINDOW_MS : STATUS_RATE_WINDOW_MS;
            const next = !current || now - current.window_started_at_ms >= windowMs
                ? { window_started_at_ms: now, count: 1 }
                : { ...current, count: current.count + 1 };
            if (next.count > (kind === 'quote' ? QUOTE_RATE_LIMIT : 1)) {
                throw new Error(kind === 'quote'
                    ? 'payment_quote_rate_limited'
                    : 'payment_status_rate_limited');
            }
            await assertDurableObjectRecordCapacity(transaction, [key]);
            await transaction.put(key, next);
            return next.window_started_at_ms + windowMs;
        });
        await state.storage.setAlarm(expiresAtMs);
        return paymentJson({ accepted: true });
    } catch (error) {
        return paymentError(error);
    }
}

export async function expirePaymentRateLimit(state: DurableObjectState): Promise<boolean> {
    const records = await Promise.all([
        state.storage.get<{ window_started_at_ms: number }>('payment-rate:quote:v1'),
        state.storage.get<{ window_started_at_ms: number }>('payment-rate:status:v1'),
    ]);
    const expiries = records.flatMap((record, index) => record
        ? [record.window_started_at_ms + (index === 0 ? QUOTE_RATE_WINDOW_MS : STATUS_RATE_WINDOW_MS)]
        : []);
    if (expiries.length === 0) return false;
    const next = Math.max(...expiries);
    if (Date.now() < next) {
        await state.storage.setAlarm(next);
        return true;
    }
    await state.storage.deleteAll();
    return true;
}

async function paymentRoute(
    request: Request,
    env: PaymentEnv,
    operation: 'assets' | 'quote' | 'status',
    handler: () => Promise<Response>,
): Promise<Response> {
    const startedAtMs = Date.now();
    const origin = request.headers.get('Origin') || '';
    try {
        if (!allowedOrigins(env).has(origin)) throw new Error('origin_denied');
        const response = withPaymentCors(await handler(), origin);
        console.info(JSON.stringify({
            event: 'payment_route_completed',
            details: {
                operation,
                httpCode: response.status,
                latencyMs: Math.max(0, Date.now() - startedAtMs),
            },
        }));
        return response;
    } catch (error) {
        const response = paymentError(error);
        console.error(JSON.stringify({
            event: 'payment_route_failed',
            details: {
                operation,
                code: paymentErrorCode(error),
                httpCode: response.status,
                latencyMs: Math.max(0, Date.now() - startedAtMs),
            },
        }));
        return withPaymentCors(response, allowedOrigins(env).has(origin) ? origin : '');
    }
}

async function derivePaymentAmount(env: PaymentEnv, purpose: PaymentPurpose): Promise<string> {
    const [binding, publicationValue] = await Promise.all([
        readMarketView(env, 'get_usdc_contract_id', {}),
        purpose.type === 'ticket'
            ? readMarketView(env, 'get_publication', { publication_id: purpose.publication_id })
            : Promise.resolve(undefined),
    ]);
    if (binding !== MAINNET_USDC_CONTRACT_ID) throw new Error('payment_contract_mismatch');
    if (purpose.type === 'upload') {
        const sourceBytes = BigInt(purpose.expected_source_bytes);
        const byteFee = (sourceBytes * 3n + 9_999n) / 10_000n;
        return (byteFee < MIN_UPLOAD_FEE_USDC ? MIN_UPLOAD_FEE_USDC : byteFee).toString();
    }
    const publication = requireObject(publicationValue, 'payment_publication_unavailable');
    if (publication.publication_id !== purpose.publication_id
        || publication.availability !== 'ACTIVE'
        || typeof publication.price_usdc !== 'string'
        || !INTEGER_PATTERN.test(publication.price_usdc)
        || BigInt(publication.price_usdc) < MIN_TICKET_PRICE_USDC) {
        throw new Error('payment_publication_unavailable');
    }
    return publication.price_usdc;
}

async function readMarketView(env: PaymentEnv, methodName: string, args: JsonObject): Promise<unknown> {
    let response: Response;
    try {
        response = await fetch(env.NEAR_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: `multi-asset-payment-${methodName}`,
                method: 'query',
                params: {
                    request_type: 'call_function',
                    finality: 'final',
                    account_id: env.MARKET_CONTRACT_ID,
                    method_name: methodName,
                    args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify(args))),
                },
            }),
            signal: AbortSignal.timeout(5_000),
        });
    } catch {
        throw new Error('payment_market_unavailable');
    }
    if (!response.ok) throw new Error('payment_market_unavailable');
    let payload: JsonObject;
    try {
        payload = requireObject(await response.json(), 'payment_market_invalid');
    } catch (error) {
        if (error instanceof Error && error.message === 'payment_market_invalid') throw error;
        throw new Error('payment_market_invalid');
    }
    if (payload.error) throw new Error('payment_market_unavailable');
    const result = requireObject(payload.result, 'payment_market_invalid');
    if (!Array.isArray(result.result)
        || result.result.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
        throw new Error('payment_market_invalid');
    }
    try {
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result as number[])));
    } catch {
        throw new Error('payment_market_invalid');
    }
}

async function oneClickRequest(
    env: PaymentEnv,
    path: string,
    init: RequestInit,
    kind: 'quote' | 'status',
): Promise<JsonObject> {
    let response: Response;
    try {
        response = await fetch(`${ONECLICK_API_BASE}${path}`, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': env.ONECLICK_API_KEY!,
            },
            signal: AbortSignal.timeout(10_000),
        });
    } catch {
        throw new Error('oneclick_unavailable');
    }
    if (!response.ok) {
        if (kind === 'status' && response.status === 404) throw new Error('oneclick_swap_not_found');
        if (kind === 'quote' && response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new Error('oneclick_quote_rejected');
        }
        throw new Error('oneclick_unavailable');
    }
    try {
        return requireObject(await response.json(), 'oneclick_response_invalid');
    } catch (error) {
        if (error instanceof Error && error.message === 'oneclick_response_invalid') throw error;
        throw new Error('oneclick_response_invalid');
    }
}

function validateQuoteResponse(value: JsonObject, expected: QuoteRequest): void {
    const request = requireObject(value.quoteRequest, 'oneclick_response_invalid');
    const quote = requireObject(value.quote, 'oneclick_response_invalid');
    verifySignedQuote(value);
    validateOneClickFields(request, quote);
    if (typeof value.correlationId !== 'string'
        || !value.correlationId
        || typeof value.timestamp !== 'string'
        || !Number.isFinite(Date.parse(value.timestamp))
        || typeof value.signature !== 'string'
        || !value.signature
        || request.dry !== expected.dry
        || request.swapType !== expected.swapType
        || request.slippageTolerance !== expected.slippageTolerance
        || request.originAsset !== expected.originAsset
        || request.depositType !== expected.depositType
        || request.destinationAsset !== expected.destinationAsset
        || request.amount !== expected.amount
        || request.refundTo !== expected.refundTo
        || request.refundType !== expected.refundType
        || request.recipient !== expected.recipient
        || request.recipientType !== expected.recipientType
        || request.deadline !== expected.deadline
        || unsafeOneClickFields(request, quote)
        || quote.amountOut !== expected.amount
        || typeof quote.amountIn !== 'string'
        || !/^[1-9][0-9]*$/.test(quote.amountIn)
        || typeof quote.timeEstimate !== 'number'
        || !Number.isSafeInteger(quote.timeEstimate)
        || quote.timeEstimate < 0
        || (expected.dry && quote.depositAddress !== undefined)
        || (!expected.dry && (!validOpaqueValue(quote.depositAddress)
            || typeof quote.deadline !== 'string'
            || !Number.isFinite(Date.parse(quote.deadline))
            || quote.deadline !== expected.deadline))) {
        throw new Error('oneclick_response_invalid');
    }
}

function validateStoredQuote(
    value: JsonObject,
    depositAddress: string,
    depositMemo?: string,
): void {
    const request = requireObject(value.quoteRequest, 'oneclick_response_invalid');
    const quote = requireObject(value.quote, 'oneclick_response_invalid');
    verifySignedQuote(value);
    validateOneClickFields(request, quote);
    if (request.dry !== false
        || request.swapType !== 'EXACT_OUTPUT'
        || typeof request.slippageTolerance !== 'number'
        || !Number.isSafeInteger(request.slippageTolerance)
        || request.slippageTolerance < 0
        || request.slippageTolerance > 100
        || typeof request.originAsset !== 'string'
        || !PAYMENT_ASSETS[request.originAsset]
        || request.depositType !== 'ORIGIN_CHAIN'
        || request.destinationAsset !== DESTINATION_ASSET_ID
        || typeof request.amount !== 'string'
        || !INTEGER_PATTERN.test(request.amount)
        || request.refundType !== 'ORIGIN_CHAIN'
        || request.recipientType !== 'DESTINATION_CHAIN'
        || typeof request.recipient !== 'string'
        || !ACCOUNT_ID_PATTERN.test(request.recipient)
        || unsafeOneClickFields(request, quote)
        || quote.amountOut !== request.amount
        || quote.depositAddress !== depositAddress
        || (quote.depositMemo === undefined ? depositMemo !== undefined : quote.depositMemo !== depositMemo)) {
        throw new Error('oneclick_response_invalid');
    }
}

function verifySignedQuote(value: JsonObject): void {
    try {
        if (!verifyQuoteSignature(value as unknown as OneClickQuoteResponse)) {
            throw new Error('oneclick_response_invalid');
        }
    } catch {
        throw new Error('oneclick_response_invalid');
    }
}

function unsafeOneClickFields(request: JsonObject, quote: JsonObject): boolean {
    return 'customRecipientMsg' in request
        || (request.appFees !== undefined
            && (!Array.isArray(request.appFees) || request.appFees.length !== 0))
        || (request.insured !== undefined && request.insured !== false)
        || 'customRecipientMsg' in quote
        || 'appFees' in quote
        || 'insured' in quote;
}

function validateOneClickFields(request: JsonObject, quote: JsonObject): void {
    if (Object.keys(request).some((key) => !ONECLICK_REQUEST_KEYS.has(key))
        || (request.confidentiality !== undefined && request.confidentiality !== 'public')
        || (request.depositMode !== undefined
            && request.depositMode !== 'SIMPLE'
            && request.depositMode !== 'MEMO')
        || (request.quoteWaitingTimeMs !== undefined && request.quoteWaitingTimeMs !== 0)
        || Object.keys(quote).some((key) => !ONECLICK_QUOTE_KEYS.has(key))
        || (quote.depositMemo !== undefined && !validOpaqueValue(quote.depositMemo))
        || (quote.refundFee !== undefined
            && (typeof quote.refundFee !== 'string' || !/^[0-9]+$/.test(quote.refundFee)))
        || (quote.withdrawFee !== undefined
            && (typeof quote.withdrawFee !== 'string' || !/^[0-9]+$/.test(quote.withdrawFee)))) {
        throw new Error('oneclick_response_invalid');
    }
}

function parseQuoteInput(value: JsonObject): PaymentQuoteInput {
    requireExactKeys(
        value,
        ['dry', 'account_id', 'origin_asset_id', 'refund_address', 'purpose'],
        'invalid_payment_quote_request',
    );
    if (typeof value.dry !== 'boolean'
        || typeof value.account_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(value.account_id)
        || typeof value.origin_asset_id !== 'string'
        || typeof value.refund_address !== 'string') {
        throw new Error('invalid_payment_quote_request');
    }
    const purpose = requireObject(value.purpose, 'invalid_payment_quote_request');
    if (purpose.type === 'ticket') {
        requireExactKeys(purpose, ['type', 'publication_id'], 'invalid_payment_quote_request');
        if (typeof purpose.publication_id !== 'string'
            || !IDENTIFIER_PATTERN.test(purpose.publication_id)) {
            throw new Error('invalid_payment_quote_request');
        }
    } else if (purpose.type === 'upload') {
        requireExactKeys(purpose, ['type', 'expected_source_bytes'], 'invalid_payment_quote_request');
        if (typeof purpose.expected_source_bytes !== 'string'
            || !INTEGER_PATTERN.test(purpose.expected_source_bytes)
            || BigInt(purpose.expected_source_bytes) > MAX_SOURCE_BYTES) {
            throw new Error('invalid_payment_quote_request');
        }
    } else {
        throw new Error('invalid_payment_quote_request');
    }
    return { ...value, purpose } as PaymentQuoteInput;
}

function parseStatusInput(url: URL): { depositAddress: string; depositMemo?: string } {
    const keys = Array.from(url.searchParams.keys());
    if (keys.some((key) => key !== 'deposit_address' && key !== 'deposit_memo')
        || url.searchParams.getAll('deposit_address').length !== 1
        || url.searchParams.getAll('deposit_memo').length > 1) {
        throw new Error('invalid_payment_status_request');
    }
    const depositAddress = url.searchParams.get('deposit_address');
    const depositMemo = url.searchParams.get('deposit_memo') ?? undefined;
    if (!validOpaqueValue(depositAddress)
        || (depositMemo !== undefined && !validOpaqueValue(depositMemo))) {
        throw new Error('invalid_payment_status_request');
    }
    return { depositAddress, depositMemo };
}

function validRefundAddress(asset: PaymentAsset, value: string): boolean {
    return asset.network === 'near'
        ? ACCOUNT_ID_PATTERN.test(value)
        : /^0x[0-9a-fA-F]{40}$/.test(value);
}

function validOpaqueValue(value: unknown): value is string {
    return typeof value === 'string'
        && value.length >= 1
        && value.length <= 256
        && !/[\u0000-\u001f\u007f]/.test(value);
}

async function enforceRemoteRateLimit(
    env: PaymentEnv,
    kind: 'quote' | 'status',
    identity: string,
): Promise<void> {
    const digest = await sha256Hex(identity);
    const object = env.LIVEPEER_CONTROL!.get(env.LIVEPEER_CONTROL!.idFromName(
        `payment-rate:${kind}:${digest}`,
    ));
    const response = await object.fetch(new Request('https://object/internal/payment-rate-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
    }));
    if (response.ok) return;
    let code: unknown;
    try {
        code = (await response.json() as JsonObject).error;
    } catch {
        throw new Error('runtime_not_configured');
    }
    if (code === 'payment_quote_rate_limited' || code === 'payment_status_rate_limited') {
        throw new Error(code);
    }
    throw new Error('runtime_not_configured');
}

function configuredAssets(env: PaymentEnv, allowEmpty = false): PaymentAsset[] {
    const requested = (env.MULTI_ASSET_PAYMENT_ASSET_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const unique = new Set(requested);
    if ((requested.length === 0 && !allowEmpty)
        || unique.size !== requested.length
        || requested.some((assetId) => !PAYMENT_ASSETS[assetId])) {
        throw new Error('runtime_not_configured');
    }
    if (requested.length === 0) return [];
    return requested.map((assetId) => PAYMENT_ASSETS[assetId]);
}

function paymentMode(env: PaymentEnv): PaymentMode | null {
    return env.MULTI_ASSET_PAYMENTS_MODE === 'off'
        || env.MULTI_ASSET_PAYMENTS_MODE === 'preview'
        || env.MULTI_ASSET_PAYMENTS_MODE === 'live'
        ? env.MULTI_ASSET_PAYMENTS_MODE
        : null;
}

function validQuoteConfig(env: PaymentEnv): boolean {
    return env.NEAR_NETWORK === 'mainnet'
        && isHttpsUrl(env.NEAR_RPC_URL)
        && ACCOUNT_ID_PATTERN.test(env.MARKET_CONTRACT_ID || '')
        && validStatusConfig(env);
}

function validStatusConfig(env: PaymentEnv): boolean {
    return Boolean(env.LIVEPEER_CONTROL)
        && typeof env.ONECLICK_API_KEY === 'string'
        && env.ONECLICK_API_KEY.length >= 16
        && env.ONECLICK_API_KEY.length <= 4096
        && !/\s/u.test(env.ONECLICK_API_KEY);
}

function allowedOrigins(env: PaymentEnv): Set<string> {
    return new Set((env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean));
}

function isHttpsUrl(value?: string): boolean {
    try {
        return new URL(value || '').protocol === 'https:' && !value?.startsWith('<');
    } catch {
        return false;
    }
}

async function readJsonObject(request: Request): Promise<JsonObject> {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BODY_BYTES) throw new Error('invalid_payment_quote_request');
    try {
        return requireObject(
            JSON.parse(new TextDecoder().decode(bytes)),
            'invalid_payment_quote_request',
        );
    } catch (error) {
        if (error instanceof Error && error.message === 'invalid_payment_quote_request') throw error;
        throw new Error('invalid_payment_quote_request');
    }
}

function requireObject(value: unknown, code: string): JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
    return value as JsonObject;
}

function requireExactKeys(value: JsonObject, expected: string[], code: string): void {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        throw new Error(code);
    }
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function paymentErrorCode(error: unknown): string {
    return error instanceof Error && PAYMENT_ERROR_STATUS[error.message]
        ? error.message
        : 'internal_error';
}

function paymentError(error: unknown): Response {
    const code = paymentErrorCode(error);
    return paymentJson({ error: code }, PAYMENT_ERROR_STATUS[code]);
}

function paymentJson(body: JsonObject, status = 200): Response {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function withPaymentCors(response: Response, origin: string): Response {
    const headers = new Headers(response.headers);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Vary', 'Origin');
    return new Response(response.body, { status: response.status, headers });
}
