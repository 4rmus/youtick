import { dependencyFetch } from './dependency-fetch';
import { assertDurableObjectRecordCapacity } from './durable-object-capacity';
import type { Env } from './env';
import type { JsonObject } from './types';
import {
    MAX_SOURCE_BYTES,
    MIN_CREATOR_UPLOAD_FEE_USD_MICROS,
    CREATOR_FEE_QUOTE_LIFETIME_MS,
    ACCOUNT_ID_PATTERN,
    JOB_ID_PATTERN,
} from './constants';
import {
    formatLog,
    readJsonObject,
    requireObject,
    requireExactKeys,
    sha256Hex,
    allowedOrigins,
    base64Decode,
    bytesToBase64,
    errorStatus,
    safeErrorCode,
    json,
    withCors,
} from './helpers';
import { validCreatorFeeQuoteConfig } from './config';

type CreatorFeeQuoteRequest = {
    creator_id: string;
    job_id: string;
    expected_source_bytes: string;
};
const CREATOR_FEE_RATE_SOURCE = 'outlayer-price-oracle-wrap-near-v1';
const OUTLAYER_NEAR_ASSET_ID = 'wrap.near';
const CREATOR_FEE_MAX_SOURCE_AGE_MS = 60_000;
const CREATOR_FEE_RATE_LIMIT = 5;
const CREATOR_FEE_RATE_WINDOW_MS = 60_000;
const YOCTO_NEAR = 10n ** 24n;

export async function forwardCreatorFeeQuote(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!allowedOrigins(env).has(origin)) throw new Error('origin_denied');
        if (!env.LIVEPEER_CONTROL || !validCreatorFeeQuoteConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        const input = parseCreatorFeeQuoteRequest(await readJsonObject(request.clone()));
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
            `creator-fee-quote:${env.NEAR_NETWORK}:${env.MARKET_CONTRACT_ID}:${input.creator_id}`,
        ));
        return withCors(await object.fetch(new Request('https://object/internal/creator-fee-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        })), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('creator_fee_quote_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

export async function issueCreatorFeeQuote(
    state: DurableObjectState,
    env: Env,
    request: Request,
): Promise<Response> {
    try {
        const input = parseCreatorFeeQuoteRequest(await readJsonObject(request));
        await enforceCreatorFeeQuoteRateLimit(state);
        const now = Date.now();
        const rate = await readOutlayerNearUsd(env, now);
        const sourceBytes = BigInt(input.expected_source_bytes);
        const byteFeeUsdMicro = (sourceBytes * 3n + 9_999n) / 10_000n;
        const feeUsdMicro = byteFeeUsdMicro < MIN_CREATOR_UPLOAD_FEE_USD_MICROS
            ? MIN_CREATOR_UPLOAD_FEE_USD_MICROS
            : byteFeeUsdMicro;
        const feeNearYocto = (feeUsdMicro * YOCTO_NEAR + rate.nearUsdMicro - 1n)
            / rate.nearUsdMicro;
        const quoteKeyVersion = Number(env.CREATOR_FEE_QUOTE_KEY_VERSION);
        const quoteWithoutId = {
            domain: 'youtick.creator-fee-quote',
            version: '1',
            network: env.NEAR_NETWORK!,
            contract_id: env.MARKET_CONTRACT_ID!,
            creator_id: input.creator_id,
            job_id: input.job_id,
            expected_source_bytes: input.expected_source_bytes,
            fee_usd_micro: feeUsdMicro.toString(),
            near_usd_micro: rate.nearUsdMicro.toString(),
            fee_near_yocto: feeNearYocto.toString(),
            rate_source: CREATOR_FEE_RATE_SOURCE,
            rate_timestamp_ms: String(rate.timestampMs),
            expires_at_ms: String(rate.timestampMs + CREATOR_FEE_QUOTE_LIFETIME_MS),
            quote_key_version: quoteKeyVersion,
        };
        const canonicalMessage = canonicalCreatorFeeQuoteMessage(quoteWithoutId);
        const quoteId = await sha256Hex(canonicalMessage);
        const privateKey = await importCreatorFeeQuotePrivateKey(env);
        const signature = new Uint8Array(await crypto.subtle.sign(
            'Ed25519',
            privateKey,
            new TextEncoder().encode(canonicalMessage),
        ));
        return json({
            quote: { ...quoteWithoutId, quote_id: quoteId },
            signature: bytesToBase64(signature),
            public_key_version: quoteKeyVersion,
        });
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('creator_fee_quote_issue_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

function parseCreatorFeeQuoteRequest(value: JsonObject): CreatorFeeQuoteRequest {
    requireExactKeys(value, [
        'creator_id', 'job_id', 'expected_source_bytes',
    ], 'invalid_creator_fee_quote_request');
    if (typeof value.creator_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(value.creator_id)
        || typeof value.job_id !== 'string'
        || !JOB_ID_PATTERN.test(value.job_id)
        || typeof value.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(value.expected_source_bytes)
        || BigInt(value.expected_source_bytes) > MAX_SOURCE_BYTES) {
        throw new Error('invalid_creator_fee_quote_request');
    }
    return value as CreatorFeeQuoteRequest;
}

export async function enforceCreatorFeeQuoteRateLimit(state: DurableObjectState): Promise<void> {
    const now = Date.now();
    const expiresAtMs = await state.storage.transaction(async (transaction) => {
        const current = await transaction.get<{ windowStartedAtMs: number; count: number }>('quote-rate:v1');
        const next = !current || now - current.windowStartedAtMs >= CREATOR_FEE_RATE_WINDOW_MS
            ? { windowStartedAtMs: now, count: 1 }
            : { ...current, count: current.count + 1 };
        if (next.count > CREATOR_FEE_RATE_LIMIT) throw new Error('creator_fee_quote_rate_limited');
        await assertDurableObjectRecordCapacity(transaction, ['quote-rate:v1'], 'rate_limit');
        await transaction.put('quote-rate:v1', next);
        return next.windowStartedAtMs + CREATOR_FEE_RATE_WINDOW_MS;
    });
    await state.storage.setAlarm(expiresAtMs);
}

export async function expireCreatorFeeQuoteRateLimit(state: DurableObjectState): Promise<boolean> {
    const record = await state.storage.get<{ windowStartedAtMs: number }>('quote-rate:v1');
    if (!record) return false;
    const expiresAtMs = record.windowStartedAtMs + CREATOR_FEE_RATE_WINDOW_MS;
    if (Date.now() < expiresAtMs) {
        await state.storage.setAlarm(expiresAtMs);
        return true;
    }
    await state.storage.deleteAll();
    return true;
}

async function readOutlayerNearUsd(
    env: Env,
    now: number,
): Promise<{ nearUsdMicro: bigint; timestampMs: number }> {
    let response: Response;
    let payload: { result?: unknown; error?: unknown };
    try {
        response = await dependencyFetch('near_rpc', 'oracle_price', env.NEAR_RPC_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'creator-fee-near-usd',
                method: 'query',
                params: {
                    request_type: 'call_function',
                    finality: 'final',
                    account_id: env.NEAR_NETWORK === 'mainnet'
                        ? 'price-oracle.near'
                        : 'price-oracle.testnet',
                    method_name: 'get_price_data',
                    args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({
                        asset_ids: [OUTLAYER_NEAR_ASSET_ID],
                    }))),
                },
            }),
            signal: AbortSignal.timeout(2_500),
        });
        payload = await response.json() as typeof payload;
    } catch {
        throw new Error('rate_source_unavailable');
    }
    if (!response.ok || payload.error || !payload.result) {
        throw new Error('rate_source_unavailable');
    }
    const rpcResult = requireObject(payload.result, 'rate_source_invalid');
    if (!Array.isArray(rpcResult.result)
        || rpcResult.result.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
        throw new Error('rate_source_invalid');
    }
    let root: JsonObject;
    try {
        root = requireObject(JSON.parse(new TextDecoder().decode(
            Uint8Array.from(rpcResult.result as number[]),
        )), 'rate_source_invalid');
    } catch {
        throw new Error('rate_source_invalid');
    }
    if (typeof root.timestamp !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(root.timestamp)
        || !Number.isInteger(root.recency_duration_sec)
        || (root.recency_duration_sec as number) < 1
        || !Array.isArray(root.prices)
        || root.prices.length !== 1) {
        throw new Error('rate_source_invalid');
    }
    if ((root.recency_duration_sec as number) * 1_000 > CREATOR_FEE_MAX_SOURCE_AGE_MS) {
        throw new Error('rate_source_stale');
    }
    const entry = requireObject(root.prices[0], 'rate_source_invalid');
    if (entry.asset_id !== OUTLAYER_NEAR_ASSET_ID) throw new Error('rate_source_invalid');
    if (entry.price === null) throw new Error('rate_source_unavailable');
    const price = requireObject(entry.price, 'rate_source_invalid');
    if (typeof price.multiplier !== 'string'
        || !/^[1-9][0-9]{0,38}$/.test(price.multiplier)
        || !Number.isInteger(price.decimals)
        || (price.decimals as number) < 0
        || (price.decimals as number) > 30) {
        throw new Error('rate_source_invalid');
    }
    const timestampMsBig = BigInt(root.timestamp) / 1_000_000n;
    if (timestampMsBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('rate_source_invalid');
    const timestampMs = Number(timestampMsBig);
    if (timestampMs > now) throw new Error('rate_source_invalid');
    if (now - timestampMs > CREATOR_FEE_MAX_SOURCE_AGE_MS) {
        throw new Error('rate_source_stale');
    }
    const nearUsdMicro = decimalPriceToMicro(
        BigInt(price.multiplier),
        price.decimals as number,
    );
    if (nearUsdMicro < 1n) throw new Error('rate_source_invalid');
    return { nearUsdMicro, timestampMs };
}

function decimalPriceToMicro(multiplier: bigint, decimals: number): bigint {
    if (decimals <= 6) return multiplier * (10n ** BigInt(6 - decimals));
    return multiplier / (10n ** BigInt(decimals - 6));
}

function canonicalCreatorFeeQuoteMessage(quote: Record<string, string | number>): string {
    return [
        quote.domain,
        quote.version,
        quote.network,
        quote.contract_id,
        quote.creator_id,
        quote.job_id,
        quote.expected_source_bytes,
        quote.fee_usd_micro,
        quote.near_usd_micro,
        quote.fee_near_yocto,
        quote.rate_source,
        quote.rate_timestamp_ms,
        quote.expires_at_ms,
        quote.quote_key_version,
    ].join('\n');
}

export async function importCreatorFeeQuotePrivateKey(env: Env): Promise<CryptoKey> {
    try {
        return await crypto.subtle.importKey(
            'pkcs8',
            base64Decode(env.CREATOR_FEE_QUOTE_PRIVATE_KEY!),
            'Ed25519',
            false,
            ['sign'],
        );
    } catch {
        throw new Error('runtime_not_configured');
    }
}
