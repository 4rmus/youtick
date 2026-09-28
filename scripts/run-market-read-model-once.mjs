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
    const { watermark, startBlockHeight } = await readWatermark(db, input, false);
    return watermark === null ? startBlockHeight : watermark.block_height + 1;
}

export async function readMarketReadModelScanCursor(db, input) {
    const { watermark, startBlockHeight } = await readWatermark(db, input, true);
    const nextBlockHeight = watermark === null ? startBlockHeight : watermark.block_height + 1;
    const scanHeight = watermark?.scan_height ?? nextBlockHeight;
    if (!Number.isSafeInteger(scanHeight) || scanHeight < nextBlockHeight
        || !Number.isSafeInteger(watermark?.scan_revision ?? 0)
        || (watermark?.scan_revision ?? 0) < 0) {
        throw new Error('invalid_read_model_watermark');
    }
    return { nextBlockHeight, scanHeight,
        storedScanHeight: watermark?.scan_height ?? null, scanRevision: watermark?.scan_revision ?? 0,
        anchorHeight: watermark?.block_height ?? null, anchorHash: watermark?.block_hash ?? null };
}

export async function advanceMarketReadModelScanCursor(db, input, position, scanHeight) {
    if (position.anchorHeight === null || !Number.isSafeInteger(scanHeight)
        || scanHeight <= position.scanHeight) throw new Error('invalid_read_model_watermark');
    await db.batch([db.prepare(`
        UPDATE finality_watermarks
        SET scan_height = ?, scan_revision = scan_revision + 1
        WHERE network = ? AND contract_id = ? AND block_height = ? AND block_hash = ?
          AND scan_revision = ? AND scan_height IS ?
    `).bind(scanHeight, input.network, input.contractId, position.anchorHeight, position.anchorHash,
        position.scanRevision, position.storedScanHeight)]);
}

export async function resetMarketReadModelScanCursor(db, input, position) {
    if (position.anchorHeight === null) return;
    await db.batch([db.prepare(`
        UPDATE finality_watermarks SET scan_height = NULL, scan_revision = scan_revision + 1
        WHERE network = ? AND contract_id = ? AND block_height = ? AND block_hash = ?
          AND scan_revision = ? AND scan_height IS ?
    `).bind(input.network, input.contractId, position.anchorHeight, position.anchorHash,
        position.scanRevision, position.storedScanHeight)]);
}

async function readWatermark(db, input, includeScanCursor) {
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
        SELECT block_height, block_hash${includeScanCursor ? ', scan_height, scan_revision' : ''} FROM finality_watermarks
        WHERE network = ? AND contract_id = ?
    `).bind(network, contractId).first();
    if (watermark !== null && (!Number.isSafeInteger(watermark?.block_height)
        || watermark.block_height < startBlockHeight
        || watermark.block_height >= Number.MAX_SAFE_INTEGER
        || typeof watermark.block_hash !== 'string'
        || !HASH_PATTERN.test(watermark.block_hash))) {
        throw new Error('invalid_read_model_watermark');
    }

    return { watermark, startBlockHeight };
}
