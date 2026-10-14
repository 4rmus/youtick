import assert from 'node:assert/strict';
import test from 'node:test';
import { base58, EXPECTED_CONFIG, verifyCkdGate, wasmHashes } from './verify-ckd-gate.mjs';

const WASM = new TextEncoder().encode('\0asm fake gate');
const ACCOUNT = 'gate.testnet';

function chain({ keys = [], codeHash = wasmHashes(WASM).code_hash, config = EXPECTED_CONFIG.testnet, metadata = { version: '0.2.0' } } = {}) {
    const calls = [];
    const fetchImpl = async (_url, init) => {
        const { params } = JSON.parse(init.body);
        calls.push(params);
        assert.equal(params.finality, 'final');
        const bytes = (value) => [...new TextEncoder().encode(JSON.stringify(value))];
        switch (params.request_type) {
        case 'view_access_key_list': return Response.json({ jsonrpc: '2.0', result: { keys } });
        case 'view_account': return Response.json({ jsonrpc: '2.0', result: { code_hash: codeHash, block_height: 7 } });
        case 'call_function':
            return Response.json({ jsonrpc: '2.0', result: { result: bytes(params.method_name === 'config' ? config : metadata) } });
        default: throw new Error(`unexpected ${params.request_type}`);
        }
    };
    return { calls, fetchImpl };
}

test('a keyless gate running the given WASM with the expected configuration passes', async () => {
    const { calls, fetchImpl } = chain();
    const result = await verifyCkdGate({ network: 'testnet', account: ACCOUNT, wasm: WASM, fetchImpl });
    assert.equal(result.status, 'PASS');
    assert.deepEqual(result.checks.map((check) => [check.name, check.pass]),
        [['no_access_keys', true], ['code_hash', true], ['config', true]]);
    assert.deepEqual(result.source_metadata, { version: '0.2.0' });
    // Read-only: only queries, never a transaction.
    assert(calls.every((params) => ['view_access_key_list', 'view_account', 'call_function'].includes(params.request_type)));
});

test('a remaining key, other code or another configuration fails', async () => {
    const withKey = await verifyCkdGate({ network: 'testnet', account: ACCOUNT, wasm: WASM,
        fetchImpl: chain({ keys: [{ public_key: 'ed25519:x', access_key: { permission: 'FullAccess' } }] }).fetchImpl });
    assert.equal(withKey.status, 'FAIL');
    assert.equal(withKey.checks[0].pass, false);
    const otherCode = await verifyCkdGate({ network: 'testnet', account: ACCOUNT, wasm: WASM,
        fetchImpl: chain({ codeHash: '11111111111111111111111111111111' }).fetchImpl });
    assert.equal(otherCode.checks[1].pass, false);
    for (const config of [{ ...EXPECTED_CONFIG.testnet, client_id: 'other' }, { ...EXPECTED_CONFIG.testnet, extra: 1 }]) {
        const result = await verifyCkdGate({ network: 'testnet', account: ACCOUNT, wasm: WASM, fetchImpl: chain({ config }).fetchImpl });
        assert.equal(result.checks[2].pass, false);
        assert.equal(result.status, 'FAIL');
    }
});

test('mainnet needs an explicit configuration until NEAR Auth approval, and bad input is refused', async () => {
    await assert.rejects(() => verifyCkdGate({ network: 'mainnet', account: 'gate.near', wasm: WASM, fetchImpl: chain().fetchImpl }),
        /expected_config_missing/);
    const result = await verifyCkdGate({ network: 'mainnet', account: 'gate.near', wasm: WASM, expectedConfig: EXPECTED_CONFIG.testnet,
        fetchImpl: chain().fetchImpl });
    assert.equal(result.status, 'PASS');
    await assert.rejects(() => verifyCkdGate({ network: 'devnet', account: ACCOUNT, wasm: WASM }), /invalid_arguments/);
    await assert.rejects(() => verifyCkdGate({ network: 'testnet', account: 'Bad Account', wasm: WASM }), /invalid_arguments/);
    await assert.rejects(() => verifyCkdGate({ network: 'testnet', account: ACCOUNT, wasm: WASM,
        fetchImpl: async () => new Response('busy', { status: 503 }) }), /rpc_unavailable/);
});

test('code hashes are base58 of the WASM sha256, with leading zero bytes kept', () => {
    assert.equal(base58(Uint8Array.from([0, 0, 1])), '112');
    assert.equal(base58(Uint8Array.from([255])), '5Q');
    const { sha256, code_hash } = wasmHashes(WASM);
    assert.equal(sha256.length, 64);
    assert.match(code_hash, /^[1-9A-HJ-NP-Za-km-z]{43,44}$/);
});
