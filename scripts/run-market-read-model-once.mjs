import { applyFinalMarketBlock } from './apply-market-read-model-d1.mjs';
import { fetchNeardataMarketBlock } from './fetch-neardata-market-block.mjs';

const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const HASH_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export async function runMarketReadModelOnce(db, input, fetchBlock = fetchNeardataMarketBlock) {
    const blockHeight = await nextMarketReadModelBlockHeight(db, input);
    const block = await fetchBlock({
        network: input.network,
        contractId: input.contractId,
        blockHeight,
    });
    await applyFinalMarketBlock(db, block);
    return {
        block_height: block.block_height,
        block_hash: block.block_hash,
        event_count: block.events.length,
    };
}

export async function nextMarketReadModelBlockHeight(db, input) {
    const network = input?.network;
    const contractId = input?.contractId;
    const startBlockHeight = input?.startBlockHeight;
    if (!['testnet', 'mainnet'].includes(network)
        || typeof contractId !== 'string'
        || !ACCOUNT_PATTERN.test(contractId)
        || !Number.isSafeInteger(startBlockHeight)
        || startBlockHeight < 1) {
        throw new Error('invalid_read_model_runner_config');
    }

    const watermark = await db.prepare(`
        SELECT block_height, block_hash FROM finality_watermarks
        WHERE network = ? AND contract_id = ?
    `).bind(network, contractId).first();
    if (watermark !== null && (!Number.isSafeInteger(watermark?.block_height)
        || watermark.block_height < startBlockHeight
        || watermark.block_height >= Number.MAX_SAFE_INTEGER
        || typeof watermark.block_hash !== 'string'
        || !HASH_PATTERN.test(watermark.block_hash))) {
        throw new Error('invalid_read_model_watermark');
    }

    return watermark === null
        ? startBlockHeight
        : watermark.block_height + 1;
}
