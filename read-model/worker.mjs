import { fetchNeardataMarketBlock } from '../scripts/fetch-neardata-market-block.mjs';
import {
    nextMarketReadModelBlockHeight,
    runMarketReadModelOnce,
} from '../scripts/run-market-read-model-once.mjs';
import { marketReadApi } from './api.mjs';

const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const MAX_BLOCKS_PER_RUN = 180;
const MAX_RPC_RESPONSE_BYTES = 256 * 1024;
const TELEMETRY_SCHEMA = 'youtick.read-model-ingestion.v1';
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

export async function ingestMarketReadModelBatch(env, dependencies = {}) {
    if (env.READ_MODEL_INGESTION_ENABLED !== 'true') {
        return { schema: TELEMETRY_SCHEMA, status: 'disabled' };
    }
    const config = ingestionConfig(env);
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
    scheduled(_controller, env, ctx, dependencies = {}) {
        const logger = dependencies.logger ?? console;
        const work = ingestMarketReadModelBatch(env, dependencies).then(
            (result) => {
                logger.log(JSON.stringify(result));
                return result;
            },
            (error) => {
                const value = error instanceof Error ? error.message : '';
                const errorCode = INGESTION_ERROR_CODES.has(value)
                    ? value
                    : 'read_model_ingestion_failed';
                logger.error(JSON.stringify({
                    schema: TELEMETRY_SCHEMA,
                    status: 'failed',
                    error_code: errorCode,
                }));
                throw new Error(errorCode);
            },
        );
        ctx.waitUntil(work);
    },
};

export default marketReadModelWorker;
