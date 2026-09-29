import { currentCatalogEnabled, refreshCurrentCatalog, CURRENT_CATALOG_QUERY_BUDGET } from './current-catalog.mjs';
import { fetchNeardataMarketBlock } from '../scripts/fetch-neardata-market-block.mjs';
import {
    applyFinalMarketBlockBatch, MAX_FINAL_BLOCKS_PER_BATCH,
    MAX_FINAL_BATCH_QUERIES, MAX_FINAL_EVENTS_PER_BATCH,
} from '../scripts/apply-market-read-model-d1.mjs';
import { runNearFinalityProbe } from '../workers/livepeer-bridge/scripts/near-finality-canary.mjs';
import {
    advanceMarketReadModelScanCursor,
    nextMarketReadModelBlockHeight,
    readMarketReadModelScanCursor,
    resetMarketReadModelScanCursor,
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
    'invalid_d1_block_batch_size',
    'non_contiguous_d1_block_batch',
    'd1_final_block_event_limit_exceeded',
    'd1_block_batch_query_limit_exceeded',
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
    const boundedFetch = dependencies.signal
        ? (url, init) => fetch(url, { ...init, signal: AbortSignal.any([init.signal, dependencies.signal]) })
        : fetch;
    const fetchFinalHeight = dependencies.fetchFinalHeight ?? ((env) => fetchNearFinalBlockHeight(env, boundedFetch));
    const fetchBlock = dependencies.fetchBlock ?? ((input) => fetchNeardataMarketBlock(input, boundedFetch));
    const finalBlockHeight = await fetchFinalHeight(env);
    if (!Number.isSafeInteger(finalBlockHeight)
        || finalBlockHeight < config.startBlockHeight) {
        throw new Error('invalid_read_model_final_height');
    }

    const isPublic = env.VIDEO_ENVIRONMENT === 'public-testnet';
    let position = isPublic ? await readMarketReadModelScanCursor(env.MARKET_READ_MODEL, config) : null;
    if (isPublic && position.storedScanHeight !== null
        && position.scanHeight > finalBlockHeight && position.nextBlockHeight <= finalBlockHeight) {
        await resetMarketReadModelScanCursor(env.MARKET_READ_MODEL, config, position);
        position = await readMarketReadModelScanCursor(env.MARKET_READ_MODEL, config);
        if (position.scanHeight > finalBlockHeight && position.nextBlockHeight <= finalBlockHeight) {
            throw new Error('invalid_read_model_watermark');
        }
    }
    let nextBlockHeight = position?.nextBlockHeight
        ?? await nextMarketReadModelBlockHeight(env.MARKET_READ_MODEL, config);
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
    const now = dependencies.now ?? Date.now;
    const sleep = dependencies.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const started = dependencies.startedAt ?? now();
    let lastFetchAt = started - 350;
    const limit = isPublic ? 150 : MAX_BLOCKS_PER_RUN;
    let scanHeight = position?.scanHeight ?? nextBlockHeight;
    let requestCount = 0;
    let remainingQueries = dependencies.queryBudget ?? MAX_FINAL_BATCH_QUERIES;
    while (requestCount < limit && nextBlockHeight <= finalBlockHeight) {
        const blocks = [];
        let batchQueries = 0;
        let budgetReached = false;
        while (blocks.length < (isPublic ? MAX_FINAL_BLOCKS_PER_BATCH : 1) && requestCount < limit
            && scanHeight <= finalBlockHeight && (!isPublic || now() - started < 50_000)) {
            if (isPublic) {
                await sleep(Math.min(Math.max(0, 350 - (now() - lastFetchAt)), Math.max(0, 50_000 - (now() - started))));
                if (now() - started >= 50_000) break;
                lastFetchAt = now();
            }
            const block = await fetchBlock({ network: config.network, contractId: config.contractId,
                blockHeight: scanHeight, ...(isPublic ? { requirePredecessor: true } : {}) });
            requestCount += 1;
            if (block === null) {
                if (!isPublic || scanHeight === config.startBlockHeight) throw new Error('invalid_neardata_block');
            } else {
                if (block.block_height !== scanHeight || (isPublic && (block.prev_block_height === undefined
                    || block.prev_block_hash === undefined))) throw new Error('invalid_neardata_block');
                if (!Array.isArray(block.events)) throw new Error('invalid_d1_final_block');
                if (block.events.length > MAX_FINAL_EVENTS_PER_BATCH) throw new Error('d1_final_block_event_limit_exceeded');
                // ponytail: reserve the worst-case three queries per event; count exact costs if this wastes material capacity.
                const blockQueries = 3 * block.events.length + 1;
                if (batchQueries + blockQueries > remainingQueries) {
                    budgetReached = true;
                    break;
                }
                blocks.push(block);
                batchQueries += blockQueries;
            }
            scanHeight += 1;
        }
        // Only a successor linked to the watermark can turn null heights into final progress.
        if (!blocks.length) break;
        try {
            await applyFinalMarketBlockBatch(env.MARKET_READ_MODEL, blocks, remainingQueries);
        } catch (error) {
            if (isPublic) await resetMarketReadModelScanCursor(env.MARKET_READ_MODEL, config, position);
            throw error;
        }
        remainingQueries -= batchQueries;
        const block = blocks.at(-1);
        last = { block_height: block.block_height, block_hash: block.block_hash, event_count: block.events.length };
        blockCount += blocks.length;
        nextBlockHeight = block.block_height + 1;
        position = { ...position, anchorHeight: block.block_height, anchorHash: block.block_hash,
            storedScanHeight: null };
        if (budgetReached) break;
    }
    if (isPublic && scanHeight > nextBlockHeight && scanHeight > position.scanHeight
        && position.anchorHeight !== null) {
        await advanceMarketReadModelScanCursor(env.MARKET_READ_MODEL, config, position, scanHeight);
    }
    return {
        schema: TELEMETRY_SCHEMA,
        status: nextBlockHeight <= finalBlockHeight ? 'catching_up' : 'applied',
        block_count: blockCount,
        final_block_height: finalBlockHeight,
        remaining_blocks: Math.max(0, finalBlockHeight - nextBlockHeight + 1),
        ...last,
    };
}

export async function ingestMarketReadModelBackfill(env, body, dependencies = {}) {
    if (env.READ_MODEL_BACKFILL_ENABLED !== 'true') {
        return { schema: BACKFILL_TELEMETRY_SCHEMA, status: 'disabled' };
    }
    const config = ingestionConfig(env);
    const continuationEnabled = env.READ_MODEL_BACKFILL_CONTINUE_ENABLED === 'true';
    const queue = env.READ_MODEL_BACKFILL_QUEUE;
    if (continuationEnabled && (!queue || typeof queue.send !== 'function')) {
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
        if (!continuationEnabled) {
            return {
                schema: BACKFILL_TELEMETRY_SCHEMA,
                status: 'stale_ignored',
                next_block_height: nextBlockHeight,
            };
        }
        await sendBackfillMessage(queue, nextBlockHeight);
        return {
            schema: BACKFILL_TELEMETRY_SCHEMA,
            status: 'stale_requeued',
            next_block_height: nextBlockHeight,
        };
    }

    const result = await ingestEnabledMarketReadModelBatch(env, dependencies, config);
    const telemetry = { ...result, schema: BACKFILL_TELEMETRY_SCHEMA };
    if (result.remaining_blocks > 0 && continuationEnabled) {
        const continuationBlockHeight = result.block_height === undefined
            ? nextBlockHeight : result.block_height + 1;
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
    if ((env.VIDEO_ENVIRONMENT === 'public-testnet'
            && (env.MARKET_CONTRACT_ID !== env.READ_MODEL_CONTRACT_ID || !env.READ_MODEL_CONTRACT_ID?.endsWith('.testnet')))
        || env.READ_MODEL_NETWORK !== 'testnet'
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
        // Each promise is registered independently: a failed probe cannot skip ingestion.
        for (const isFinalityProbe of controller?.cron === FINALITY_PROBE_CRON ? [true, false] : [false]) {
            const task = isFinalityProbe
                ? runNearFinalityProbe({
                    rpcUrl: env.READ_MODEL_NEAR_RPC_URL,
                    fetchImpl: dependencies.fetchImpl,
                    now: dependencies.now,
                })
                : runScheduledIngestion(env, dependencies);
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
        }
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

export async function runScheduledIngestion(env, dependencies = {}) {
    if (!currentCatalogEnabled(env)) return ingestMarketReadModelBatch(env, dependencies);
    const now = dependencies.now ?? Date.now;
    const startedAt = now();
    const signal = AbortSignal.timeout(50_000);
    const logger = dependencies.logger ?? console;
    const schema = 'youtick.current-catalog-refresh.v1';
    try {
        const result = await refreshCurrentCatalog(env, { ...dependencies, signal });
        logger.log(JSON.stringify({ schema, ...result, duration_ms: now() - startedAt }));
    } catch (error) {
        const code = error instanceof Error ? error.message : '';
        const allowed = new Set(['d1_bootstrap_publication_limit_exceeded', 'catalog_snapshot_conflict',
            'catalog_publication_conflict', 'catalog_capacity_exceeded', 'catalog_timestamp_invalid',
            'invalid_near_publication_page', 'invalid_d1_bootstrap_publication', 'duplicate_d1_bootstrap_publication',
            'near_rpc_unavailable', 'catalog_query_limit']);
        logger.error(JSON.stringify({ schema, status: 'failed', error_code: allowed.has(code) ? code : 'catalog_refresh_failed', duration_ms: now() - startedAt }));
    }
    if (now() - startedAt >= 50_000) return { schema: TELEMETRY_SCHEMA, status: 'budget_exhausted' };
    return ingestMarketReadModelBatch(env, { ...dependencies, startedAt, signal,
        queryBudget: MAX_FINAL_BATCH_QUERIES - CURRENT_CATALOG_QUERY_BUDGET });
}
