#!/usr/bin/env node
// Read-only planner for the targeted history scan (docs/architecture/youtick-history-targeted-scan-design.md).
// It never writes D1: it lists the market-contract receipt blocks after a watermark and counts their events.

import { pathToFileURL } from 'node:url';
import { fetchNeardataMarketBlock } from './fetch-neardata-market-block.mjs';

const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const TX_HASH_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const INDEX_HOSTS = { testnet: 'https://tx.test.fastnear.com', mainnet: 'https://tx.main.fastnear.com' };
const RPC_HOSTS = { testnet: 'https://test.rpc.fastnear.com', mainnet: 'https://rpc.mainnet.fastnear.com' };
export const INDEX_PAGE_SIZE = 100;
export const TRANSACTION_BATCH_SIZE = 20;
// A receipt chain started before the watermark can still execute after it; look this far back for its transaction.
export const RECEIPT_LOOKBACK_BLOCKS = 200;
// Stay this far behind final so the index has caught up with every receipt in range.
export const DEFAULT_SAFETY_BLOCKS = 600;
const MAX_INDEX_PAGES = 200;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function requireNetwork(network) {
    if (!Object.hasOwn(INDEX_HOSTS, network)) throw new Error('invalid_targeted_scan_network');
}

function requireContract(contractId) {
    if (typeof contractId !== 'string' || !ACCOUNT_PATTERN.test(contractId)) {
        throw new Error('invalid_targeted_scan_contract');
    }
}

function requireHeight(value, code) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(code);
    return value;
}

async function postJson(fetchImpl, url, body) {
    const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok || text.length > MAX_RESPONSE_BYTES) throw new Error('targeted_scan_index_unavailable');
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('targeted_scan_index_invalid');
    }
}

// Market transactions newest first, until the page reaches `sinceHeight - RECEIPT_LOOKBACK_BLOCKS`.
export async function listMarketTransactions({ network, contractId, sinceHeight }, fetchImpl = fetch) {
    requireNetwork(network);
    requireContract(contractId);
    requireHeight(sinceHeight, 'invalid_targeted_scan_from');
    const floor = sinceHeight - RECEIPT_LOOKBACK_BLOCKS;
    const transactions = new Map();
    let resumeToken;
    for (let page = 0; page < MAX_INDEX_PAGES; page += 1) {
        const value = await postJson(fetchImpl, `${INDEX_HOSTS[network]}/v0/account`, {
            account_id: contractId,
            limit: INDEX_PAGE_SIZE,
            ...(resumeToken ? { resume_token: resumeToken } : {}),
        });
        if (!Array.isArray(value?.account_txs)) throw new Error('targeted_scan_index_invalid');
        let reachedFloor = false;
        for (const entry of value.account_txs) {
            if (entry?.account_id !== contractId
                || typeof entry.transaction_hash !== 'string' || !TX_HASH_PATTERN.test(entry.transaction_hash)
                || !Number.isSafeInteger(entry.tx_block_height)) {
                throw new Error('targeted_scan_index_invalid');
            }
            if (entry.tx_block_height <= floor) {
                reachedFloor = true;
                continue;
            }
            transactions.set(entry.transaction_hash, entry.tx_block_height);
        }
        resumeToken = value.resume_token;
        if (reachedFloor || !resumeToken || value.account_txs.length === 0) {
            return [...transactions].map(([hash, height]) => ({ hash, txBlockHeight: height }))
                .sort((a, b) => a.txBlockHeight - b.txBlockHeight || (a.hash < b.hash ? -1 : 1));
        }
    }
    throw new Error('targeted_scan_index_page_limit');
}

// For each transaction, the blocks where a receipt executed on the market contract.
export async function marketReceiptBlocks(transactions, { network, contractId }, fetchImpl = fetch) {
    requireNetwork(network);
    requireContract(contractId);
    const result = new Map();
    for (let index = 0; index < transactions.length; index += TRANSACTION_BATCH_SIZE) {
        const batch = transactions.slice(index, index + TRANSACTION_BATCH_SIZE).map((tx) => tx.hash);
        const value = await postJson(fetchImpl, `${INDEX_HOSTS[network]}/v0/transactions`, { tx_hashes: batch });
        if (!Array.isArray(value?.transactions) || value.transactions.length !== batch.length) {
            throw new Error('targeted_scan_transactions_incomplete');
        }
        for (const tx of value.transactions) {
            const hash = tx?.transaction?.hash;
            if (!batch.includes(hash) || !Array.isArray(tx.receipts)) throw new Error('targeted_scan_transactions_invalid');
            const blocks = new Set();
            for (const receipt of tx.receipts) {
                const height = receipt?.execution_outcome?.block_height;
                const executor = receipt?.execution_outcome?.outcome?.executor_id ?? receipt?.receipt?.receiver_id;
                if (!Number.isSafeInteger(height)) throw new Error('targeted_scan_transactions_invalid');
                if (executor === contractId) blocks.add(height);
            }
            result.set(hash, [...blocks].sort((a, b) => a - b));
        }
    }
    return result;
}

// Candidate blocks in (fromHeight, targetHeight]; a transaction with any market receipt beyond the target waits.
export function planTargetedScan({ transactions, receiptBlocks, fromHeight, targetHeight }) {
    const candidates = new Set();
    const deferred = [];
    for (const tx of transactions) {
        const blocks = receiptBlocks.get(tx.hash) ?? [];
        if (blocks.some((height) => height > targetHeight)) {
            deferred.push(tx.hash);
            continue;
        }
        for (const height of blocks) if (height > fromHeight) candidates.add(height);
    }
    return { candidates: [...candidates].sort((a, b) => a - b), deferred };
}

export async function fetchFinalHeight(network, fetchImpl = fetch) {
    requireNetwork(network);
    const value = await postJson(fetchImpl, RPC_HOSTS[network], {
        jsonrpc: '2.0', id: 'targeted-scan', method: 'block', params: { finality: 'final' },
    });
    return requireHeight(value?.result?.header?.height, 'targeted_scan_final_invalid');
}

export async function dryRunTargetedScan(input, dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl ?? fetch;
    const fetchBlock = dependencies.fetchBlock ?? ((request) => fetchNeardataMarketBlock(request, fetchImpl));
    const { network, contractId } = input;
    const fromHeight = requireHeight(input.fromHeight, 'invalid_targeted_scan_from');
    const finalHeight = input.finalHeight ?? await fetchFinalHeight(network, fetchImpl);
    const safety = input.safetyBlocks ?? DEFAULT_SAFETY_BLOCKS;
    const targetHeight = finalHeight - safety;
    if (targetHeight <= fromHeight) throw new Error('targeted_scan_target_not_ahead');
    const transactions = await listMarketTransactions({ network, contractId, sinceHeight: fromHeight }, fetchImpl);
    const receiptBlocks = await marketReceiptBlocks(transactions, { network, contractId }, fetchImpl);
    const plan = planTargetedScan({ transactions, receiptBlocks, fromHeight, targetHeight });
    const eventCounts = {};
    const blocks = [];
    for (const height of plan.candidates) {
        const block = await fetchBlock({ network, contractId, blockHeight: height });
        if (!block || block.block_height !== height || !Array.isArray(block.events)) {
            throw new Error('targeted_scan_block_invalid');
        }
        blocks.push({ height, events: block.events.length });
        for (const item of block.events) {
            const name = item?.event?.event;
            eventCounts[name] = (eventCounts[name] ?? 0) + 1;
        }
    }
    return {
        schema: 'youtick.targeted-scan-dry-run.v1',
        network,
        contract_id: contractId,
        from_height: fromHeight,
        final_height: finalHeight,
        target_height: targetHeight,
        skipped_blocks: targetHeight - fromHeight - plan.candidates.length,
        transactions_considered: transactions.length,
        deferred_transactions: plan.deferred,
        candidate_blocks: blocks,
        event_counts: eventCounts,
        writes: 0,
    };
}

function parseArgs(argv) {
    const args = Object.fromEntries(argv.map((value) => value.split('=', 2)));
    const fromHeight = Number(args['--from']);
    return {
        network: args['--network'] ?? 'testnet',
        contractId: args['--contract'],
        fromHeight,
        ...(args['--safety'] ? { safetyBlocks: Number(args['--safety']) } : {}),
    };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const argv = process.argv.slice(2);
    if (!argv.includes('--dry-run')) {
        console.error('Only --dry-run is implemented; this script never writes D1.');
        process.exit(2);
    }
    try {
        const result = await dryRunTargetedScan(parseArgs(argv.filter((value) => value !== '--dry-run')));
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'targeted_scan_failed' }));
        process.exit(1);
    }
}
