import assert from 'node:assert/strict';
import test from 'node:test';
import { runNearFinalityProbe } from './near-finality-canary.mjs';

test('finality probe emits bounded lag from final then optimistic blocks', async () => {
    const requests = [];
    const heights = { final: 100, optimistic: 103 };
    const receipt = await runNearFinalityProbe({
        rpcUrl: 'https://rpc.testnet.near.org',
        now: () => 1_785_600_000_000,
        fetchImpl: async (_url, init) => {
            const request = JSON.parse(init.body);
            requests.push(request);
            return Response.json({
                jsonrpc: '2.0',
                id: request.id,
                result: { header: { height: heights[request.params.finality] } },
            });
        },
    });

    assert.deepEqual(requests.map(({ method, params }) => ({ method, params })), [
        { method: 'block', params: { finality: 'final' } },
        { method: 'block', params: { finality: 'optimistic' } },
    ]);
    assert.deepEqual(receipt, {
        schema: 'youtick.near-finality-probe.v1',
        event: 'rpc_finality_observed',
        observed_at_ms: 1_785_600_000_000,
        final_block_height: '100',
        optimistic_block_height: '103',
        lag_blocks: 3,
        rpc_calls: 2,
    });
});

test('finality probe rejects an inverted or malformed RPC view', async (t) => {
    await t.test('inverted heights', async () => {
        let call = 0;
        await assert.rejects(runNearFinalityProbe({
            rpcUrl: 'https://rpc.testnet.near.org',
            fetchImpl: async (_url, init) => {
                const request = JSON.parse(init.body);
                const height = call++ === 0 ? 103 : 100;
                return Response.json({ jsonrpc: '2.0', id: request.id, result: { header: { height } } });
            },
        }), /near_finality_probe_invalid/);
    });

    await t.test('malformed response', async () => {
        await assert.rejects(runNearFinalityProbe({
            rpcUrl: 'https://rpc.testnet.near.org',
            fetchImpl: async () => Response.json({ result: { header: { height: '100' } } }),
        }), /near_finality_probe_invalid/);
    });
});

test('finality probe keeps RPC capabilities out of errors and receipts', async () => {
    const rpcUrl = 'https://rpc.example.net/account-secret';
    await assert.rejects(
        runNearFinalityProbe({ rpcUrl, fetchImpl: async () => { throw new Error(rpcUrl); } }),
        (error) => error.message === 'near_finality_probe_unavailable'
            && !error.message.includes('account-secret'),
    );
});
