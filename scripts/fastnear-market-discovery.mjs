// Sparse discovery of Market event blocks through FastNEAR's transaction index (W3.5).
// The V2 read model no longer reads every block from neardata (30 blocks a minute on the free tier,
// slower than the chain). It asks the index which transactions touched the contract, keeps the
// blocks where a receipt of the contract succeeded and logged an event, and reads only those blocks
// from neardata with the usual parser. Market V2 re-checks every ticket in `release_expired`, so a
// block the index misses delays a release; it never moves money. See docs/v2-testnet-runbook.md.

const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const HASH_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const EVENT_PREFIX = 'EVENT_JSON:';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const FASTNEAR_TX_API = Object.freeze({
    testnet: 'https://tx.test.fastnear.com',
    mainnet: 'https://tx.main.fastnear.com',
});
// The index's documented page size and batch limit.
export const ACCOUNT_PAGE_SIZE = 200;
export const TRANSACTIONS_PER_REQUEST = 20;
// One run never follows more pages than this; a busier window fails instead of advancing.
export const MAX_ACCOUNT_PAGES = 5;

async function post(network, path, body, fetchImpl) {
    const base = FASTNEAR_TX_API[network];
    if (!base) throw new Error('invalid_fastnear_discovery_request');
    let response;
    try {
        response = await fetchImpl(`${base}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });
    } catch {
        throw new Error('fastnear_discovery_unavailable');
    }
    const contentLength = Number(response.headers.get('Content-Length') || '0');
    if (!response.ok || (contentLength > 0 && contentLength > MAX_RESPONSE_BYTES)) {
        throw new Error('fastnear_discovery_unavailable');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 2 || bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error('invalid_fastnear_discovery');
    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new Error('invalid_fastnear_discovery');
    }
}

/** The highest block the index has seen; the read model never covers past it. */
export async function fetchFastnearIndexHead(network, fetchImpl = fetch) {
    const value = await post(network, '/v0/blocks', {}, fetchImpl);
    const heights = Array.isArray(value?.blocks) ? value.blocks.map((block) => block?.block_height) : [];
    if (heights.length === 0 || !heights.every((height) => Number.isSafeInteger(height) && height > 0)) {
        throw new Error('invalid_fastnear_discovery');
    }
    return Math.max(...heights);
}

/**
 * Heights in [minBlockHeight, maxBlockHeight] where a receipt executed by `contractId` succeeded and
 * logged an event, for transactions included in [fromTxHeight, toTxHeight]. Sorted, unique.
 */
export async function discoverMarketEventBlocks(input, fetchImpl = fetch) {
    const { network, contractId, fromTxHeight, toTxHeight, minBlockHeight, maxBlockHeight } = input ?? {};
    if (!FASTNEAR_TX_API[network] || typeof contractId !== 'string' || !ACCOUNT_PATTERN.test(contractId)
        || ![fromTxHeight, toTxHeight, minBlockHeight, maxBlockHeight].every((value) => Number.isSafeInteger(value) && value > 0)
        || fromTxHeight > toTxHeight || minBlockHeight > maxBlockHeight) {
        throw new Error('invalid_fastnear_discovery_request');
    }
    const hashes = new Set();
    let resumeToken;
    for (let page = 0; ; page += 1) {
        if (page === MAX_ACCOUNT_PAGES) throw new Error('fastnear_discovery_limit');
        const value = await post(network, '/v0/account', {
            account_id: contractId, from_tx_block_height: fromTxHeight, to_tx_block_height: toTxHeight,
            desc: false, limit: ACCOUNT_PAGE_SIZE, ...(resumeToken ? { resume_token: resumeToken } : {}),
        }, fetchImpl);
        if (!Array.isArray(value?.account_txs) || value.account_txs.length > ACCOUNT_PAGE_SIZE
            || (value.resume_token !== undefined && value.resume_token !== null && typeof value.resume_token !== 'string')) {
            throw new Error('invalid_fastnear_discovery');
        }
        for (const entry of value.account_txs) {
            if (entry?.account_id !== contractId || typeof entry.transaction_hash !== 'string'
                || !HASH_PATTERN.test(entry.transaction_hash) || !Number.isSafeInteger(entry.tx_block_height)
                || entry.tx_block_height < fromTxHeight || entry.tx_block_height > toTxHeight) {
                throw new Error('invalid_fastnear_discovery');
            }
            hashes.add(entry.transaction_hash);
        }
        if (!value.resume_token) break;
        resumeToken = value.resume_token;
    }

    const heights = new Set();
    const list = [...hashes];
    for (let offset = 0; offset < list.length; offset += TRANSACTIONS_PER_REQUEST) {
        const batch = list.slice(offset, offset + TRANSACTIONS_PER_REQUEST);
        const value = await post(network, '/v0/transactions', { tx_hashes: batch }, fetchImpl);
        const transactions = value?.transactions;
        // Every requested hash must come back: a silently missing transaction would hide its events.
        if (!Array.isArray(transactions) || transactions.length !== batch.length) {
            throw new Error('fastnear_discovery_incomplete');
        }
        const returned = new Set();
        for (const item of transactions) {
            const hash = item?.transaction?.hash;
            if (typeof hash !== 'string' || !batch.includes(hash) || !Array.isArray(item.receipts)) {
                throw new Error('invalid_fastnear_discovery');
            }
            returned.add(hash);
            for (const receipt of item.receipts) {
                const outcome = receipt?.execution_outcome;
                const result = outcome?.outcome;
                if (!outcome || !result || !Number.isSafeInteger(outcome.block_height) || !Array.isArray(result.logs)) {
                    throw new Error('invalid_fastnear_discovery');
                }
                if (result.executor_id !== contractId || !successful(result.status)
                    || !result.logs.some((log) => typeof log === 'string' && log.startsWith(EVENT_PREFIX))) continue;
                if (outcome.block_height >= minBlockHeight && outcome.block_height <= maxBlockHeight) {
                    heights.add(outcome.block_height);
                }
            }
        }
        if (returned.size !== batch.length) throw new Error('fastnear_discovery_incomplete');
    }
    return [...heights].sort((a, b) => a - b);
}

function successful(status) {
    return status && typeof status === 'object' && !Array.isArray(status)
        && (Object.hasOwn(status, 'SuccessValue') || Object.hasOwn(status, 'SuccessReceiptId'));
}
