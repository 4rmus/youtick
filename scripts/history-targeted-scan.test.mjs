import assert from 'node:assert/strict';
import test from 'node:test';
import {
    dryRunTargetedScan,
    listMarketTransactions,
    marketReceiptBlocks,
    planTargetedScan,
    RECEIPT_LOOKBACK_BLOCKS,
} from './history-targeted-scan.mjs';

const CONTRACT = 'video-market-v1-260907.youtick-dev-v3.testnet';
const hash = (n) => `${'A'.repeat(43)}${n}`;
const entry = (n, height) => ({ account_id: CONTRACT, transaction_hash: hash(n), tx_block_height: height });

function indexFetch({ pages, transactions, finalHeight = 2_000 }) {
    const calls = [];
    const fetchImpl = async (url, init) => {
        const body = JSON.parse(init.body);
        calls.push({ url, body });
        if (url.endsWith('/v0/account')) {
            const page = body.resume_token ? Number(body.resume_token) : 0;
            return Response.json({ account_txs: pages[page], ...(page + 1 < pages.length ? { resume_token: String(page + 1) } : {}) });
        }
        if (url.endsWith('/v0/transactions')) {
            return Response.json({ transactions: body.tx_hashes.map((h) => transactions[h]) });
        }
        if (body.method === 'block') return Response.json({ result: { header: { height: finalHeight } } });
        throw new Error(`unexpected ${url}`);
    };
    return { fetchImpl, calls };
}

const receipt = (executor, height) => ({ receipt: { receiver_id: executor }, execution_outcome: { block_height: height, outcome: { executor_id: executor } } });

test('pages newest-first and stops below the receipt lookback floor', async () => {
    const { fetchImpl, calls } = indexFetch({ pages: [[entry(1, 1_500), entry(2, 1_200)], [entry(3, 1_000 - RECEIPT_LOOKBACK_BLOCKS + 1), entry(4, 700)]] });
    const txs = await listMarketTransactions({ network: 'testnet', contractId: CONTRACT, sinceHeight: 1_000 }, fetchImpl);
    assert.deepEqual(txs.map((tx) => tx.hash), [hash(3), hash(2), hash(1)]);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.resume_token, '1');
});

test('rejects index entries for another account or malformed hashes', async () => {
    const { fetchImpl } = indexFetch({ pages: [[{ ...entry(1, 1_500), account_id: 'other.testnet' }]] });
    await assert.rejects(listMarketTransactions({ network: 'testnet', contractId: CONTRACT, sinceHeight: 1_000 }, fetchImpl),
        /targeted_scan_index_invalid/);
});

test('keeps only market receipt blocks and defers transactions that finish beyond the target', async () => {
    const transactions = {
        [hash(1)]: { transaction: { hash: hash(1) }, receipts: [receipt('usdc.testnet', 1_101), receipt(CONTRACT, 1_102), receipt('creator.testnet', 1_103), receipt(CONTRACT, 1_104)] },
        [hash(2)]: { transaction: { hash: hash(2) }, receipts: [receipt(CONTRACT, 1_390), receipt(CONTRACT, 1_401)] },
        [hash(3)]: { transaction: { hash: hash(3) }, receipts: [receipt(CONTRACT, 995), receipt(CONTRACT, 1_003)] },
    };
    const { fetchImpl } = indexFetch({ pages: [], transactions });
    const txs = [{ hash: hash(3), txBlockHeight: 994 }, { hash: hash(1), txBlockHeight: 1_100 }, { hash: hash(2), txBlockHeight: 1_389 }];
    const blocks = await marketReceiptBlocks(txs, { network: 'testnet', contractId: CONTRACT }, fetchImpl);
    assert.deepEqual(blocks.get(hash(1)), [1_102, 1_104]);
    const plan = planTargetedScan({ transactions: txs, receiptBlocks: blocks, fromHeight: 1_000, targetHeight: 1_400 });
    // A receipt at 995 precedes the watermark; the one at 1003 still counts.
    assert.deepEqual(plan.candidates, [1_003, 1_102, 1_104]);
    assert.deepEqual(plan.deferred, [hash(2)]);
});

test('fails closed when the index returns fewer transactions than requested', async () => {
    const fetchImpl = async () => Response.json({ transactions: [] });
    await assert.rejects(marketReceiptBlocks([{ hash: hash(1), txBlockHeight: 1 }], { network: 'testnet', contractId: CONTRACT }, fetchImpl),
        /targeted_scan_transactions_incomplete/);
});

test('dry run reads only candidate blocks, counts events and never writes', async () => {
    const transactions = {
        [hash(1)]: { transaction: { hash: hash(1) }, receipts: [receipt(CONTRACT, 1_102)] },
        [hash(2)]: { transaction: { hash: hash(2) }, receipts: [receipt(CONTRACT, 1_250), receipt(CONTRACT, 1_252)] },
    };
    const { fetchImpl } = indexFetch({ pages: [[entry(2, 1_249), entry(1, 1_101), entry(9, 600)]], transactions, finalHeight: 2_000 });
    const read = [];
    const fetchBlock = async ({ blockHeight }) => {
        read.push(blockHeight);
        const events = blockHeight === 1_252 ? [] : [{ event: { event: blockHeight === 1_102 ? 'media_job_authorized' : 'entitlement_purchased' } }];
        return { block_height: blockHeight, events };
    };
    const result = await dryRunTargetedScan({ network: 'testnet', contractId: CONTRACT, fromHeight: 1_000, safetyBlocks: 600 },
        { fetchImpl, fetchBlock });
    assert.deepEqual(read, [1_102, 1_250, 1_252]);
    assert.equal(result.target_height, 1_400);
    assert.equal(result.skipped_blocks, 400 - 3);
    assert.deepEqual(result.event_counts, { media_job_authorized: 1, entitlement_purchased: 1 });
    assert.equal(result.writes, 0);
});

test('refuses a target that is not ahead of the watermark', async () => {
    const { fetchImpl } = indexFetch({ pages: [[]], transactions: {}, finalHeight: 1_500 });
    await assert.rejects(dryRunTargetedScan({ network: 'testnet', contractId: CONTRACT, fromHeight: 1_000, safetyBlocks: 600 }, { fetchImpl }),
        /targeted_scan_target_not_ahead/);
});
