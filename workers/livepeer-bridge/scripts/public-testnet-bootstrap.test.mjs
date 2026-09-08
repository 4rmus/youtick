import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { KeyPair, baseEncode, encodeTransaction, decodeSignedTransaction, actions } from 'near-api-js';
import { validatePolicy, buildActions, upfrontFee, prepare, execute } from './public-testnet-bootstrap.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const codeHash = (value) => baseEncode(Buffer.from(hash(value), 'hex'));
const EMPTY = '11111111111111111111111111111111';

function fixture(mode = 'normal') {
    const root = mkdtempSync(join(tmpdir(), 'public-bootstrap-'));
    const directory = join(root, 'plan'); const keyFile = join(root, 'parent.json');
    const key = KeyPair.fromRandom('ed25519');
    const policy = JSON.parse(readFileSync(new URL('./public-testnet-bootstrap-policy.json', import.meta.url)));
    policy.parent.public_key = key.getPublicKey().toString();
    const wasm = { market: Buffer.from('market wasm'), access: Buffer.from('access wasm') };
    policy.wasm_sha256 = Object.fromEntries(Object.entries(wasm).map(([name, bytes]) => [name, hash(bytes)]));
    const ctx = { policy, policyHash: hash(JSON.stringify(policy)), sourceSha: '1'.repeat(40), runId: '123', attempt: '1', wasm };
    writeFileSync(keyFile, JSON.stringify({ private_key: key.toString() }), { mode: 0o600 });
    const fee = { send_not_sir: 1, execution: 2 };
    const config = { protocol_version: 85, runtime_config: {
        storage_amount_per_byte: '10000000000000000000', min_gas_purchase_price: '10',
        wasm_config: { limit_config: { max_total_prepaid_gas: '1000000000000000' } },
        transaction_costs: { pessimistic_gas_price_inflation_ratio: [1, 1], action_receipt_creation_config: fee,
            action_creation_config: { create_account_cost: fee, transfer_cost: fee, deploy_contract_cost: fee,
                deploy_contract_cost_per_byte: fee, function_call_cost: fee, function_call_cost_per_byte: fee,
                add_key_cost: { full_access_cost: fee, function_call_cost: fee, function_call_cost_per_byte: fee } } },
    } };
    let nonce = 10; let height = 100; let amount = 10_096_045_917_506_722_899_999_998n;
    const states = new Map(); const transactions = new Map(); const sent = []; const calls = [];
    if (mode === 'existing') states.set(policy.accounts[0].account_id, { amount: '1', locked: '0', storage_usage: 100, code_hash: EMPTY });
    const block = () => ({ height, hash: baseEncode(Buffer.alloc(32, height)) });
    const response = (result) => ({ ok: true, json: async () => ({ result }) });
    const missing = () => ({ ok: true, json: async () => ({ error: { cause: { name: 'UNKNOWN_ACCOUNT' } } }) });
    const fetchImpl = async (_url, request) => {
        const { method, params } = JSON.parse(request.body); calls.push(method);
        if (method === 'status') return response({ chain_id: mode === 'mainnet' ? 'mainnet' : 'testnet' });
        if (method === 'block') return response({ header: block() });
        if (method === 'EXPERIMENTAL_protocol_config') return response(config);
        if (method === 'gas_price') return response({ gas_price: '1' });
        if (method === 'tx') {
            assert.equal(params.sender_account_id, policy.parent.account_id);
            return transactions.has(params.tx_hash) ? response(transactions.get(params.tx_hash)) : missing();
        }
        if (method === 'send_tx') {
            assert.ok(existsSync(join(directory, 'public-plan.json')), 'public plan must precede sending');
            const signed = decodeSignedTransaction(Buffer.from(params.signed_tx_base64, 'base64'));
            const tx = signed.transaction; const txHash = codeHash(encodeTransaction(tx));
            assert.notEqual(txHash, codeHash(encodeTransaction(signed)), 'use unsigned transaction hash');
            const receipt = JSON.parse(readFileSync(join(directory, 'receipt.json')));
            assert.equal(receipt.transactions.at(-1).tx_hash, txHash, 'hash must be persisted before fetch');
            assert.equal(receipt.transactions.at(-1).status, 'SUBMITTING');
            const a = policy.accounts[sent.length];
            assert.equal(tx.receiverId, a.account_id); assert.equal(tx.signerId, policy.parent.account_id);
            assert.equal(tx.nonce, BigInt(nonce + 1));
            assert.equal(key.verify(Buffer.from(hash(encodeTransaction(tx)), 'hex'), Uint8Array.from(signed.signature.ed25519Signature.data)), true);
            assert.deepEqual(tx.actions.map((x) => Object.keys(x)[0]), a.role === 'operator'
                ? ['createAccount', 'transfer', 'addKey', 'addKey'] : a.role === 'relayer'
                    ? ['createAccount', 'transfer', 'addKey'] : ['createAccount', 'transfer', 'addKey', 'deployContract', 'functionCall']);
            sent.push(tx);
            if (mode === 'pending' && sent.length === 1) throw new Error('connection lost');
            nonce++; height++;
            const funding = tx.actions.find((x) => x.transfer).transfer.deposit;
            amount -= funding + 100_000_000_000_000n;
            const deploy = tx.actions.find((x) => x.deployContract);
            const init = tx.actions.find((x) => x.functionCall)?.functionCall;
            const keys = tx.actions.filter((x) => x.addKey).map((x) => {
                const permission = x.addKey.accessKey.permission;
                const f = permission.functionCall;
                return { public_key: `ed25519:${baseEncode(Uint8Array.from(x.addKey.publicKey.ed25519Key.data))}`, access_key: { nonce: 0, permission: permission.fullAccess
                    ? 'FullAccess' : { FunctionCall: { allowance: f.allowance.toString(), method_names: f.methodNames, receiver_id: f.receiverId } } } };
            });
            states.set(a.account_id, { amount: (funding + (init ? 1000n : 0n)).toString(), locked: '0', storage_usage: 100,
                code_hash: deploy ? codeHash(Buffer.from(deploy.deployContract.code)) : EMPTY, keys,
                init: init ? { method: init.methodName, args: JSON.parse(Buffer.from(init.args).toString()) } : null });
            if (mode === 'bad-keys') states.get(a.account_id).keys.pop();
            const final = { final_execution_status: 'FINAL', status: { SuccessValue: '' },
                transaction: { hash: txHash, signer_id: tx.signerId, receiver_id: tx.receiverId },
                transaction_outcome: { outcome: { status: { SuccessReceiptId: 'receipt' } } },
                receipts_outcome: [{ outcome: { status: { SuccessValue: '' } } }] };
            transactions.set(txHash, final);
            if (mode === 'lost-response' && sent.length === 1) throw new Error('response lost after inclusion');
            return response(final);
        }
        assert.equal(method, 'query');
        if (params.request_type === 'view_access_key') return response({ permission: 'FullAccess', nonce });
        if (params.request_type === 'view_account' && params.account_id === policy.parent.account_id) return response({ amount: amount.toString(), locked: '0', storage_usage: 182, code_hash: EMPTY });
        const state = states.get(params.account_id); if (!state) return missing();
        if (params.request_type === 'view_account') return response(state);
        if (params.request_type === 'view_access_key_list') return response({ keys: state.keys });
        assert.equal(params.request_type, 'call_function');
        const c = state.init.args.config; const views = c ? {
            get_governance_state: { state_version: 2, admin_account_id: c.admin_account_id, guardian_account_id: c.guardian_account_id,
                active_bridge_account_id: c.bridge_account_id, bridge_frozen: true, new_purchases_paused: true,
                pending_bridge_account_id: null, bridge_rotation_proposed_at_ms: null },
            get_public_upload_policy: { version: 1, environment: 'public-testnet', network: 'testnet', market_contract_id: params.account_id,
                max_source_bytes: '5000000000', job_ttl_ms: '86400000', signed_quote_required: true,
                profiles: ['28ba12452dd2cc55e64baf73a3dbf665784eeb8fd87892163818513165bbd3b2', '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77'].map((profile_config_sha256) => ({ profile_id: 'paid-media-livepeer-v1', profile_config_sha256 })) },
            get_quote_key_version: c.quote_key_version, get_publications_count: 0, get_platform_balance: '0', get_platform_near_balance: '0',
            get_storage_reserve_status: { reserve_covered: true, operational_reserve_yocto: c.near_operational_reserve, storage_stake_yocto: '1' },
            get_public_testnet_beta_state: null,
        } : { get_contract_state: { state_version: 2, owner_id: state.init.args.owner_id,
            market_contract_id: state.init.args.market_contract_id, pending_owner_id: null, paused: false, grant_issuance_enabled: true } };
        assert.ok(Object.hasOwn(views, params.method_name));
        return response({ result: Array.from(Buffer.from(JSON.stringify(views[params.method_name]))) });
    };
    return { ctx, config, root, directory, keyFile, fetchImpl, sent, calls, states,
        prepare: () => prepare(ctx, keyFile, directory, fetchImpl),
        execute: (digest) => execute(ctx, directory, digest, fetchImpl, async () => {}),
        cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('bootstrap signs exact account batches, persists hashes first, and reconciles without resend', async (t) => {
    for (const mode of ['normal', 'lost-response']) await t.test(mode, async () => {
        const f = fixture(mode);
        try {
            validatePolicy(f.ctx.policy);
            const prepared = await f.prepare(); assert.equal(f.sent.length, 0);
            const receipt = await f.execute(prepared.sha256);
            assert.equal(receipt.status, 'PASS'); assert.equal(f.sent.length, 4);
            assert.deepEqual(receipt.transactions.map((x) => x.status), ['VERIFIED', 'VERIFIED', 'VERIFIED', 'VERIFIED']);
            const market = f.sent[2].actions.at(-1).functionCall;
            assert.equal(market.methodName, 'new_public_testnet');
            const config = JSON.parse(Buffer.from(market.args).toString()).config;
            assert.equal(config.quote_public_key, f.ctx.policy.quote.public_key_base64);
            assert.equal(f.sent[3].actions.at(-1).functionCall.methodName, 'new');
            assert.equal(receipt.transactions[3].postcheck.contract_state.grant_issuance_enabled, true);
            if (mode === 'lost-response') assert.ok(f.calls.includes('tx'));
            await assert.rejects(f.execute(prepared.sha256), /existing_receipt_reconcile/);
            assert.equal(f.sent.length, 4);
        } finally { f.cleanup(); }
    });
    for (const mode of ['existing', 'mainnet']) await t.test(mode, async () => {
        const f = fixture(mode);
        try { await assert.rejects(f.prepare(), mode === 'existing' ? /existing_target_reconcile/ : /rpc_network/); assert.equal(f.sent.length, 0); assert.equal(existsSync(f.directory), false); }
        finally { f.cleanup(); }
    });
    for (const mode of ['pending', 'bad-keys', 'expensive']) await t.test(mode, async () => {
        const f = fixture(mode);
        try {
            const prepared = await f.prepare();
            if (mode === 'expensive') f.config.runtime_config.min_gas_purchase_price = '1000000000000000000000000';
            if (mode === 'pending') {
                const receipt = await f.execute(prepared.sha256); assert.equal(receipt.status, 'AMBIGUOUS');
                assert.equal(f.calls.filter((m) => m === 'tx').length, 12);
            } else await assert.rejects(f.execute(prepared.sha256), mode === 'bad-keys' ? /target_keys/ : /fee_budget/);
            assert.equal(f.sent.length, mode === 'expensive' ? 0 : 1);
        } finally { f.cleanup(); }
    });
});

test('fee preflight uses the gas purchase floor and exact byte costs', () => {
    const f = fixture();
    try {
        const batch = [actions.functionCall('abc', Buffer.from('12345'), 100n, 0n)];
        // Receipt + function call + eight charged bytes: S=10, E=20; prepaid=100.
        assert.equal(upfrontFee(batch, f.config, '1'), 10n + 120n * 10n);
        assert.equal(buildActions(f.ctx.policy, f.ctx.policy.accounts[0], f.ctx.wasm).length, 4);
        f.ctx.policy.accounts[0].keys[1].permission.FunctionCall.allowance = '0';
        assert.throws(() => validatePolicy(f.ctx.policy), /operator_permission/);
    } finally { f.cleanup(); }
});
