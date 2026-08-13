import { fetchNeardataMarketBlock } from '../scripts/fetch-neardata-market-block.mjs';
import { runNearFinalityProbe } from '../workers/livepeer-bridge/scripts/near-finality-canary.mjs';
import {
    nextMarketReadModelBlockHeight,
    runMarketReadModelOnce,
} from '../scripts/run-market-read-model-once.mjs';
import { marketReadApi } from './api.mjs';

const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const MAX_BLOCKS_PER_RUN = 180;
const MAX_RPC_RESPONSE_BYTES = 256 * 1024;
const TELEMETRY_SCHEMA = 'youtick.read-model-ingestion.v1';
const BACKFILL_TELEMETRY_SCHEMA = 'youtick.read-model-backfill.v1';
const BACKFILL_MESSAGE_SCHEMA = 'youtick.read-model-backfill-message.v1';
const FINALITY_PROBE_CRON = '* * * * *';
const FINALITY_TELEMETRY_SCHEMA = 'youtick.near-finality-probe.v1';
const INGESTION_ERROR_CODES = new Set([
    'd1_final_block_event_limit_exceeded',
    'invalid_d1_event_batch_size',
    'invalid_d1_final_block',
    'invalid_neardata_block',
    'invalid_neardata_event',
    'invalid_neardata_outcome',
    'invalid_neardata_request',
    'invalid_read_model_final_height',
    'invalid_read_model_final_rpc',
    'invalid_read_model_ingestion_config',
    'invalid_read_model_runner_config',
    'invalid_read_model_watermark',
    'mixed_d1_final_block_batch',
    'neardata_unavailable',
    'read_model_final_rpc_unavailable',
]);
const BACKFILL_ERROR_CODES = new Set([
    ...INGESTION_ERROR_CODES,
    'invalid_read_model_backfill_batch',
    'invalid_read_model_backfill_config',
    'invalid_read_model_backfill_message',
    'read_model_backfill_gap',
    'read_model_backfill_queue_unavailable',
]);
const FINALITY_ERROR_CODES = new Set([
    'near_finality_probe_config_invalid',
    'near_finality_probe_invalid',
    'near_finality_probe_unavailable',
]);

export async function ingestMarketReadModelBatch(env, dependencies = {}) {
    if (env.READ_MODEL_INGESTION_ENABLED !== 'true') {
        return { schema: TELEMETRY_SCHEMA, status: 'disabled' };
    }
    return ingestEnabledMarketReadModelBatch(env, dependencies);
}

async function ingestEnabledMarketReadModelBatch(env, dependencies, config = ingestionConfig(env)) {
    const fetchFinalHeight = dependencies.fetchFinalHeight ?? fetchNearFinalBlockHeight;
    const fetchBlock = dependencies.fetchBlock ?? fetchNeardataMarketBlock;
    const finalBlockHeight = await fetchFinalHeight(env);
    if (!Number.isSafeInteger(finalBlockHeight)
        || finalBlockHeight < config.startBlockHeight) {
        throw new Error('invalid_read_model_final_height');
    }

    let nextBlockHeight = await nextMarketReadModelBlockHeight(
        env.MARKET_READ_MODEL, config,
    );
    if (nextBlockHeight > finalBlockHeight) {
        return {
            schema: TELEMETRY_SCHEMA,
            status: 'caught_up',
            block_count: 0,
            final_block_height: finalBlockHeight,
            remaining_blocks: 0,
        };
    }

    let last;
    let blockCount = 0;
    while (blockCount < MAX_BLOCKS_PER_RUN && nextBlockHeight <= finalBlockHeight) {
        last = await runMarketReadModelOnce(env.MARKET_READ_MODEL, config, fetchBlock);
        blockCount += 1;
        nextBlockHeight = last.block_height + 1;
    }
    return {
        schema: TELEMETRY_SCHEMA,
        status: nextBlockHeight <= finalBlockHeight ? 'catching_up' : 'applied',
        block_count: blockCount,
        final_block_height: finalBlockHeight,
        remaining_blocks: Math.max(0, finalBlockHeight - last.block_height),
        ...last,
    };
}

export async function ingestMarketReadModelBackfill(env, body, dependencies = {}) {
    if (env.READ_MODEL_BACKFILL_ENABLED !== 'true') {
        return { schema: BACKFILL_TELEMETRY_SCHEMA, status: 'disabled' };
    }
    const config = ingestionConfig(env);
    const queue = env.READ_MODEL_BACKFILL_QUEUE;
    if (!queue || typeof queue.send !== 'function') {
        throw new Error('invalid_read_model_backfill_config');
    }
    const requestedBlockHeight = backfillMessageBlockHeight(body, config);
    const nextBlockHeight = await nextMarketReadModelBlockHeight(
        env.MARKET_READ_MODEL, config,
    );
    if (requestedBlockHeight > nextBlockHeight) {
        throw new Error('read_model_backfill_gap');
    }
    if (requestedBlockHeight < nextBlockHeight) {
        await sendBackfillMessage(queue, nextBlockHeight);
        return {
            schema: BACKFILL_TELEMETRY_SCHEMA,
            status: 'stale_requeued',
            next_block_height: nextBlockHeight,
        };
    }

    const result = await ingestEnabledMarketReadModelBatch(env, dependencies, config);
    const telemetry = { ...result, schema: BACKFILL_TELEMETRY_SCHEMA };
    if (result.remaining_blocks > 0) {
        const continuationBlockHeight = result.block_height + 1;
        await sendBackfillMessage(queue, continuationBlockHeight);
        return { ...telemetry, next_block_height: continuationBlockHeight };
    }
    return telemetry;
}

function backfillMessageBlockHeight(body, config) {
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).length !== 2
        || body.schema !== BACKFILL_MESSAGE_SCHEMA
        || !Number.isSafeInteger(body.next_block_height)
        || body.next_block_height < config.startBlockHeight) {
        throw new Error('invalid_read_model_backfill_message');
    }
    return body.next_block_height;
}

async function sendBackfillMessage(queue, nextBlockHeight) {
    try {
        await queue.send({
            schema: BACKFILL_MESSAGE_SCHEMA,
            next_block_height: nextBlockHeight,
        }, { contentType: 'json' });
    } catch {
        throw new Error('read_model_backfill_queue_unavailable');
    }
}

export async function fetchNearFinalBlockHeight(env, fetchImpl = fetch) {
    const url = validRpcUrl(env.READ_MODEL_NEAR_RPC_URL);
    const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0', id: 'youtick-read-model-final',
            method: 'block', params: { finality: 'final' },
        }),
        signal: AbortSignal.timeout(2_500),
    });
    const contentLength = Number(response.headers.get('Content-Length') || '0');
    if (!response.ok || (contentLength > 0 && contentLength > MAX_RPC_RESPONSE_BYTES)) {
        throw new Error('read_model_final_rpc_unavailable');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 2 || bytes.byteLength > MAX_RPC_RESPONSE_BYTES) {
        throw new Error('invalid_read_model_final_rpc');
    }
    try {
        const value = JSON.parse(new TextDecoder().decode(bytes));
        const height = value?.result?.header?.height;
        if (value?.jsonrpc !== '2.0' || value?.id !== 'youtick-read-model-final'
            || !Number.isSafeInteger(height) || height < 1) {
            throw new Error('invalid');
        }
        return height;
    } catch {
        throw new Error('invalid_read_model_final_rpc');
    }
}

function ingestionConfig(env) {
    const startBlockHeight = Number(env.READ_MODEL_START_BLOCK_HEIGHT);
    if (env.READ_MODEL_NETWORK !== 'testnet'
        || !ACCOUNT_PATTERN.test(env.READ_MODEL_CONTRACT_ID || '')
        || !/^[1-9][0-9]*$/.test(env.READ_MODEL_START_BLOCK_HEIGHT || '')
        || !Number.isSafeInteger(startBlockHeight)
        || env.READ_MODEL_MAX_BLOCKS_PER_RUN !== String(MAX_BLOCKS_PER_RUN)
        || !validRpcUrl(env.READ_MODEL_NEAR_RPC_URL)
        || !env.MARKET_READ_MODEL) {
        throw new Error('invalid_read_model_ingestion_config');
    }
    return {
        network: env.READ_MODEL_NETWORK,
        contractId: env.READ_MODEL_CONTRACT_ID,
        startBlockHeight,
    };
}

function validRpcUrl(value) {
    try {
        const url = new URL(value);
        if (value !== value.trim() || /\s/u.test(value) || /\p{Cc}/u.test(value)
            || url.protocol !== 'https:' || url.username || url.password
            || url.hash) throw new Error('invalid');
        return url.toString();
    } catch {
        throw new Error('invalid_read_model_ingestion_config');
    }
}

export const marketReadModelWorker = {
    fetch: marketReadApi,
    scheduled(controller, env, ctx, dependencies = {}) {
        const logger = dependencies.logger ?? console;
        const isFinalityProbe = controller?.cron === FINALITY_PROBE_CRON;
        const task = isFinalityProbe
            ? runNearFinalityProbe({
                rpcUrl: env.READ_MODEL_NEAR_RPC_URL,
                fetchImpl: dependencies.fetchImpl,
                now: dependencies.now,
            })
            : ingestMarketReadModelBatch(env, dependencies);
        const work = task.then(
            (result) => {
                logger.log(isFinalityProbe ? result : JSON.stringify(result));
                return result;
            },
            (error) => {
                const value = error instanceof Error ? error.message : '';
                const errorCodes = isFinalityProbe
                    ? FINALITY_ERROR_CODES
                    : INGESTION_ERROR_CODES;
                const errorCode = errorCodes.has(value)
                    ? value
                    : isFinalityProbe
                        ? 'near_finality_probe_failed'
                        : 'read_model_ingestion_failed';
                const failure = {
                    schema: isFinalityProbe ? FINALITY_TELEMETRY_SCHEMA : TELEMETRY_SCHEMA,
                    status: 'failed',
                    error_code: errorCode,
                };
                logger.error(isFinalityProbe ? failure : JSON.stringify(failure));
                throw new Error(errorCode);
            },
        );
        ctx.waitUntil(work);
    },
    async queue(batch, env, _ctx, dependencies = {}) {
        const logger = dependencies.logger ?? console;
        if (!batch || !Array.isArray(batch.messages) || batch.messages.length !== 1) {
            for (const message of batch?.messages ?? []) message.retry();
            logger.error(JSON.stringify({
                schema: BACKFILL_TELEMETRY_SCHEMA,
                status: 'failed',
                error_code: 'invalid_read_model_backfill_batch',
            }));
            return;
        }
        const [message] = batch.messages;
        try {
            const result = await ingestMarketReadModelBackfill(
                env, message.body, dependencies,
            );
            logger.log(JSON.stringify(result));
            if (result.status === 'disabled') message.retry();
            else message.ack();
        } catch (error) {
            const value = error instanceof Error ? error.message : '';
            const errorCode = BACKFILL_ERROR_CODES.has(value)
                ? value
                : 'read_model_backfill_failed';
            logger.error(JSON.stringify({
                schema: BACKFILL_TELEMETRY_SCHEMA,
                status: 'failed',
                error_code: errorCode,
            }));
            message.retry();
        }
    },
};

export default marketReadModelWorker;
