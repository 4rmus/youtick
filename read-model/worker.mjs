import { currentCatalogEnabled, refreshCurrentCatalog, CURRENT_CATALOG_QUERY_BUDGET } from './current-catalog.mjs';
import { fetchNeardataMarketBlock } from '../scripts/fetch-neardata-market-block.mjs';
import { discoverMarketEventBlocks, fetchFastnearIndexHead } from '../scripts/fastnear-market-discovery.mjs';
import {
    applyFinalMarketBlockBatch, finalBlockQueryCost, MAX_FINAL_BLOCKS_PER_BATCH,
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
// Environments whose scanner keeps a cursor, proves each block's predecessor and paces its fetches, so a
// skipped height (neardata `null`) is crossed through the next linked block instead of failing the run:
// the public testnet. The V1 testnet keeps the strict one-block scan.
const LINKED_SCAN_ENVIRONMENTS = new Set(['public-testnet']);
// W3.5: environments that read only the blocks FastNEAR's transaction index names
// (scripts/fastnear-market-discovery.mjs). Every block from free neardata (30 a minute) cannot keep up
// with the chain, and Market V2 events are rare; `release_expired` re-checks every ticket on chain.
const SPARSE_SCAN_ENVIRONMENTS = new Set(['v2-testnet']);
// The index lags the chain by a few blocks and stores a transaction once its receipts ran; stay behind.
const SPARSE_SAFETY_BLOCKS = 120;
// Transactions included before the watermark can still log events after it.
const SPARSE_TX_LOOKBACK_BLOCKS = 600;
const SPARSE_MAX_WINDOW_BLOCKS = 100_000;
const SPARSE_MAX_EVENT_BLOCKS = 20;
const SPARSE_HEADER_ATTEMPTS = 10;
const SPARSE_WINDOW_HALVINGS = 8;
// DELETE and upsert of the final watermark write, and the escrow read.
const SPARSE_RESERVED_QUERIES = 3;
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
    'd1_final_block_query_budget_exceeded',
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
    'fastnear_discovery_incomplete',
    'fastnear_discovery_limit',
    'fastnear_discovery_unavailable',
    'invalid_fastnear_discovery',
    'invalid_fastnear_discovery_request',
    'invalid_read_model_rpc',
    'read_model_rpc_unavailable',
    'read_model_watermark_conflict',
    'read_model_header_unavailable',
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
    if (SPARSE_SCAN_ENVIRONMENTS.has(env.VIDEO_ENVIRONMENT)) {
        return ingestSparseMarketReadModelBatch(env, dependencies, config, { boundedFetch, fetchFinalHeight, fetchBlock });
    }
    const finalBlockHeight = await fetchFinalHeight(env);
    if (!Number.isSafeInteger(finalBlockHeight)
        || finalBlockHeight < config.startBlockHeight) {
        throw new Error('invalid_read_model_final_height');
    }

    const linkedScan = LINKED_SCAN_ENVIRONMENTS.has(env.VIDEO_ENVIRONMENT);
    let position = linkedScan ? await readMarketReadModelScanCursor(env.MARKET_READ_MODEL, config) : null;
    if (linkedScan && position.storedScanHeight !== null
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
    const limit = linkedScan ? 150 : MAX_BLOCKS_PER_RUN;
    let scanHeight = position?.scanHeight ?? nextBlockHeight;
    let requestCount = 0;
    let remainingQueries = dependencies.queryBudget ?? MAX_FINAL_BATCH_QUERIES;
    const invocationQueries = remainingQueries;
    // A fetched dense block waiting for the preceding batch to commit; it is never fetched twice.
    let carried = null;
    while (requestCount < limit && nextBlockHeight <= finalBlockHeight) {
        const blocks = [];
        let batchQueries = 0;
        let budgetReached = false;
        while (blocks.length < (linkedScan ? MAX_FINAL_BLOCKS_PER_BATCH : 1) && requestCount < limit
            && scanHeight <= finalBlockHeight && (!linkedScan || now() - started < 50_000)) {
            let block = carried;
            carried = null;
            if (!block) {
                if (linkedScan) {
                    await sleep(Math.min(Math.max(0, 350 - (now() - lastFetchAt)), Math.max(0, 50_000 - (now() - started))));
                    if (now() - started >= 50_000) break;
                    lastFetchAt = now();
                }
                block = await fetchBlock({ network: config.network, contractId: config.contractId,
                    blockHeight: scanHeight, ...(linkedScan ? { requirePredecessor: true } : {}) });
                requestCount += 1;
            }
            if (block === null) {
                if (!linkedScan || scanHeight === config.startBlockHeight) throw new Error('invalid_neardata_block');
            } else {
                if (block.block_height !== scanHeight || (linkedScan && (block.prev_block_height === undefined
                    || block.prev_block_hash === undefined))) throw new Error('invalid_neardata_block');
                if (!Array.isArray(block.events)) throw new Error('invalid_d1_final_block');
                // ponytail: reserve the worst-case three queries per event; count exact costs if this wastes material capacity.
                const blockQueries = finalBlockQueryCost(block.events.length);
                const dense = block.events.length > MAX_FINAL_EVENTS_PER_BATCH;
                if (blockQueries > invocationQueries) {
                    // Poison block: commit what precedes it, then stop at it with an alarm code; never split it.
                    if (blocks.length) {
                        budgetReached = true;
                        break;
                    }
                    throw new Error('d1_final_block_query_budget_exceeded');
                }
                if (dense && blocks.length) {
                    carried = block;
                    break;
                }
                if (batchQueries + blockQueries > remainingQueries) {
                    budgetReached = true;
                    break;
                }
                blocks.push(block);
                batchQueries += blockQueries;
                if (dense) {
                    scanHeight += 1;
                    break;
                }
            }
            scanHeight += 1;
        }
        // Only a successor linked to the watermark can turn null heights into final progress.
        if (!blocks.length) break;
        try {
            await applyFinalMarketBlockBatch(env.MARKET_READ_MODEL, blocks, remainingQueries);
        } catch (error) {
            if (linkedScan) await resetMarketReadModelScanCursor(env.MARKET_READ_MODEL, config, position);
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
    if (linkedScan && scanHeight > nextBlockHeight && scanHeight > position.scanHeight
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

/**
 * W3.5 sparse scan: event blocks come from the transaction index, everything between them is skipped.
 * Each event block is read from neardata and written as in the full scan; once every event block up
 * to the coverage height is written, the watermark moves to that height's header from RPC. The run
 * then compares Market V2's escrow at the watermark with the purchased crypto tickets it projected.
 */
async function ingestSparseMarketReadModelBatch(env, dependencies, config, { boundedFetch, fetchFinalHeight, fetchBlock }) {
    const db = env.MARKET_READ_MODEL;
    const logger = dependencies.logger ?? console;
    const now = dependencies.now ?? Date.now;
    const sleep = dependencies.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const fetchIndexHead = dependencies.fetchIndexHead ?? ((network) => fetchFastnearIndexHead(network, boundedFetch));
    const discover = dependencies.discoverEventBlocks ?? ((input) => discoverMarketEventBlocks(input, boundedFetch));
    const fetchEscrow = dependencies.fetchEscrowBalance
        ?? ((height) => fetchMarketEscrowBalance(env, config.contractId, height, boundedFetch));

    const [finalBlockHeight, indexHead] = await Promise.all([fetchFinalHeight(env), fetchIndexHead(config.network)]);
    if (!Number.isSafeInteger(finalBlockHeight) || finalBlockHeight < config.startBlockHeight) {
        throw new Error('invalid_read_model_final_height');
    }
    if (!Number.isSafeInteger(indexHead) || indexHead < 1) throw new Error('invalid_fastnear_discovery');
    const stored = await db.prepare(`
        SELECT block_height, block_hash FROM finality_watermarks WHERE network = ? AND contract_id = ?
    `).bind(config.network, config.contractId).first();
    if (stored !== null && (!Number.isSafeInteger(stored?.block_height) || stored.block_height < config.startBlockHeight - 1
        || typeof stored.block_hash !== 'string')) {
        throw new Error('invalid_read_model_watermark');
    }
    // The row being replaced: each write deletes it only while it still holds this block.
    let watermark = stored === null ? null : { block_height: stored.block_height, block_hash: stored.block_hash };
    const nextBlockHeight = stored === null ? config.startBlockHeight : stored.block_height + 1;
    const watermarkHeight = nextBlockHeight - 1;
    const target = Math.min(finalBlockHeight, indexHead) - SPARSE_SAFETY_BLOCKS;
    let coverage = Math.min(target, watermarkHeight + SPARSE_MAX_WINDOW_BLOCKS);
    const telemetry = { schema: TELEMETRY_SCHEMA, mode: 'sparse', final_block_height: finalBlockHeight };
    if (coverage <= watermarkHeight) return { ...telemetry, status: 'caught_up', block_count: 0, remaining_blocks: 0 };

    // Event blocks already below the watermark are discovered again over the lookback window: one the
    // index had not stored when the watermark passed it cannot be written any more, so it raises an alarm.
    const fromTxHeight = Math.max(config.startBlockHeight, nextBlockHeight - SPARSE_TX_LOOKBACK_BLOCKS);
    let discovered;
    for (let attempt = 0; ; attempt += 1) {
        try {
            discovered = await discover({ network: config.network, contractId: config.contractId,
                fromTxHeight, toTxHeight: coverage, minBlockHeight: fromTxHeight, maxBlockHeight: coverage });
            break;
        } catch (error) {
            // A window busier than the index's page limit halves until it fits.
            if (!(error instanceof Error) || error.message !== 'fastnear_discovery_limit'
                || attempt === SPARSE_WINDOW_HALVINGS || coverage - watermarkHeight < 2) throw error;
            coverage = watermarkHeight + Math.floor((coverage - watermarkHeight) / 2);
        }
    }
    if (!Array.isArray(discovered) || discovered.some((height, index) => !Number.isSafeInteger(height)
        || height < fromTxHeight || height > coverage || (index > 0 && height <= discovered[index - 1]))) {
        throw new Error('invalid_fastnear_discovery');
    }
    const heights = discovered.filter((height) => height >= nextBlockHeight);
    const below = discovered.filter((height) => height < nextBlockHeight);

    const invocationQueries = dependencies.queryBudget ?? MAX_FINAL_BATCH_QUERIES;
    // Kept back for the final watermark write (DELETE and upsert) and the escrow read.
    let remainingQueries = invocationQueries - SPARSE_RESERVED_QUERIES;
    const telemetryExtra = {};
    if (below.length > 0) {
        remainingQueries -= 1;
        const written = await db.prepare(`
            SELECT DISTINCT block_height FROM chain_events
            WHERE network = ? AND contract_id = ? AND block_height >= ? AND block_height <= ?
        `).bind(config.network, config.contractId, below[0], below.at(-1)).all();
        const known = new Set((written?.results ?? []).map((row) => row.block_height));
        const missed = below.filter((height) => !known.has(height));
        if (missed.length > 0) {
            telemetryExtra.missed_event_blocks = missed;
            logger.error(JSON.stringify({ schema: TELEMETRY_SCHEMA, status: 'missed_event_blocks', block_heights: missed }));
        }
    }

    const write = async (block) => {
        try {
            await applyFinalMarketBlockBatch(db, [block], remainingQueries + SPARSE_RESERVED_QUERIES,
                watermark ? { replaceWatermark: watermark } : {});
        } catch (error) {
            // Another writer moved the watermark between the read and this write; nothing was written.
            if (String(error?.message ?? '').includes('non_contiguous_finality_watermark')) {
                throw new Error('read_model_watermark_conflict');
            }
            throw error;
        }
        watermark = { block_height: block.block_height, block_hash: block.block_hash };
    };

    let lastFetchAt = now() - 350;
    let last = null;
    let blockCount = 0;
    for (const height of heights.slice(0, SPARSE_MAX_EVENT_BLOCKS)) {
        await sleep(Math.max(0, 350 - (now() - lastFetchAt)));
        lastFetchAt = now();
        const block = await fetchBlock({ network: config.network, contractId: config.contractId,
            blockHeight: height, requirePredecessor: true });
        if (!block || block.block_height !== height || !Array.isArray(block.events)) throw new Error('invalid_neardata_block');
        // One extra query deletes the replaced watermark row.
        const cost = finalBlockQueryCost(block.events.length) + 1;
        if (cost > invocationQueries - SPARSE_RESERVED_QUERIES - 1) throw new Error('d1_final_block_query_budget_exceeded');
        if (cost > remainingQueries) break;
        await write(block);
        remainingQueries -= cost;
        last = block;
        blockCount += 1;
    }
    const lastEventHeight = last?.block_height ?? watermarkHeight;
    if (blockCount < heights.length) {
        return { ...telemetry, ...telemetryExtra, status: 'catching_up', block_count: blockCount,
            remaining_blocks: target - lastEventHeight, block_height: last?.block_height,
            block_hash: last?.block_hash, event_count: last?.events.length };
    }

    // Every event block up to the coverage height is written: move the watermark there. The coverage
    // block comes from neardata like the event blocks: a regular RPC node has garbage-collected heights
    // more than a few epochs old, and the media-account D1 rescans from the start block (2026-10-26).
    // A block the index missed keeps its events; `null` is a skipped height.
    let coverageBlock = null;
    let attempts = 0;
    for (let height = coverage; !coverageBlock && height > lastEventHeight && attempts < SPARSE_HEADER_ATTEMPTS; height -= 1) {
        await sleep(Math.max(0, 350 - (now() - lastFetchAt)));
        lastFetchAt = now();
        coverageBlock = await fetchBlock({ network: config.network, contractId: config.contractId,
            blockHeight: height, requirePredecessor: true });
        attempts += 1;
        if (coverageBlock && (coverageBlock.block_height !== height || !Array.isArray(coverageBlock.events))) throw new Error('invalid_neardata_block');
    }
    // Ten skipped heights in a row do not happen on NEAR; never stall without an alarm.
    if (!coverageBlock && attempts === SPARSE_HEADER_ATTEMPTS) throw new Error('read_model_header_unavailable');
    if (coverageBlock) {
        await write(coverageBlock);
        last = coverageBlock;
    }
    // The safety margin behind final is by design; only a window cap leaves work for the next run.
    const result = { ...telemetry, ...telemetryExtra, status: coverage < target ? 'catching_up' : 'applied',
        block_count: blockCount, remaining_blocks: target - coverage, coverage_block_height: coverage };
    if (!last) return result;
    Object.assign(result, { block_height: last.block_height, block_hash: last.block_hash, event_count: last.events.length });

    // Escrow holds the gross of every crypto ticket not yet settled, refunded or released
    // (purchased, or watched with the money still in escrow); a gap in the index shows up here.
    // The check only reports: the blocks above are already written.
    try {
        const chain = await fetchEscrow(last.block_height);
        const rows = await db.prepare(`
            SELECT gross_amount FROM market_v2_tickets
            WHERE network = ? AND contract_id = ? AND rail = 'crypto'
              AND status IN ('purchased', 'watched') AND settled_at_ms IS NULL
        `).bind(config.network, config.contractId).all();
        const readModel = (rows?.results ?? []).reduce((sum, row) => sum + BigInt(row.gross_amount), 0n).toString();
        result.escrow = { chain_usdc_micro: chain, read_model_usdc_micro: readModel, matched: chain === readModel };
    } catch (error) {
        const code = error instanceof Error ? error.message : '';
        result.escrow = { matched: null, error_code: INGESTION_ERROR_CODES.has(code) ? code : 'read_model_escrow_check_failed' };
        return result;
    }
    if (!result.escrow.matched) {
        logger.error(JSON.stringify({ schema: TELEMETRY_SCHEMA, status: 'escrow_mismatch',
            block_height: last.block_height, ...result.escrow }));
    }
    return result;
}

async function nearRpc(env, id, method, params, fetchImpl) {
    let response;
    try {
        response = await fetchImpl(validRpcUrl(env.READ_MODEL_NEAR_RPC_URL), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
            signal: AbortSignal.timeout(2_500),
        });
    } catch {
        throw new Error('read_model_rpc_unavailable');
    }
    const contentLength = Number(response.headers.get('Content-Length') || '0');
    if (!response.ok || (contentLength > 0 && contentLength > MAX_RPC_RESPONSE_BYTES)) {
        throw new Error('read_model_rpc_unavailable');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 2 || bytes.byteLength > MAX_RPC_RESPONSE_BYTES) throw new Error('invalid_read_model_rpc');
    let value;
    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new Error('invalid_read_model_rpc');
    }
    if (value?.jsonrpc !== '2.0' || value?.id !== id) throw new Error('invalid_read_model_rpc');
    return value;
}

export async function fetchMarketEscrowBalance(env, contractId, height, fetchImpl = fetch) {
    const value = await nearRpc(env, 'youtick-read-model-escrow', 'query', {
        request_type: 'call_function', account_id: contractId, method_name: 'get_escrow_balance',
        args_base64: btoa('{}'), block_id: height,
    }, fetchImpl);
    const bytes = value.result?.result;
    if (value.error || !Array.isArray(bytes) || bytes.length > 64) throw new Error('read_model_rpc_unavailable');
    try {
        const balance = JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes)));
        if (typeof balance !== 'string' || !/^(0|[1-9][0-9]{0,39})$/.test(balance)) throw new Error('invalid');
        return balance;
    } catch {
        throw new Error('invalid_read_model_rpc');
    }
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
    if (((LINKED_SCAN_ENVIRONMENTS.has(env.VIDEO_ENVIRONMENT) || SPARSE_SCAN_ENVIRONMENTS.has(env.VIDEO_ENVIRONMENT))
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
