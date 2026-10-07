import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { KeyPair, PublicKey, baseEncode, encodeTransaction, decodeSignedTransaction } from 'near-api-js';
import {
    ARTIFACT_FILES, BRIDGE_METHODS, TESTNET_USDC, USDC_ROLES, validatePolicy, buildActions, plannedTransactions, upfrontFee, prepare, execute, loadInputs,
} from './v2-testnet-bootstrap.mjs';
import { generate, KEY_NAMES } from './v2-testnet-keygen.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const codeHash = (value) => baseEncode(Buffer.from(hash(value), 'hex'));
const EMPTY = '11111111111111111111111111111111';
const key = () => KeyPair.fromRandom('ed25519').getPublicKey().toString();

/** The committed template filled the way the runbook says (fresh keys, CI hashes, no status note). */
function filledPolicy(parentKey, wasm) {
    const policy = JSON.parse(readFileSync(new URL('./v2-testnet-bootstrap-policy.json', import.meta.url)));
    delete policy.status;
    policy.parent.public_key = parentKey;
    const quote = key();
    policy.market.quote_public_key = quote;
    policy.market.quote_public_key_base64 = Buffer.from(PublicKey.from(quote).data).toString('base64');
    policy.market.vat_public_key = key();
    policy.wasm_sha256 = { market_v2: hash(wasm.market_v2), ckd_gate: hash(wasm.ckd_gate) };
    for (const a of policy.accounts) for (const k of a.keys) k.public_key = key();
    return policy;
}

function fixture(mode = 'normal') {
    const root = mkdtempSync(join(tmpdir(), 'v2-bootstrap-'));
    const directory = join(root, 'plan'); const keyFile = join(root, 'parent.json');
    const parent = KeyPair.fromRandom('ed25519');
    const wasm = { market_v2: Buffer.from('market v2 wasm'), ckd_gate: Buffer.from('ckd gate wasm') };
    const policy = filledPolicy(parent.getPublicKey().toString(), wasm);
    const ctx = { policy, policyHash: hash(JSON.stringify(policy)), sourceSha: '1'.repeat(40), runId: '123', attempt: '1', wasm };
    writeFileSync(keyFile, JSON.stringify({ private_key: parent.toString() }), { mode: 0o600 });
    const fee = { send_not_sir: 1, execution: 2 };
    const config = { protocol_version: 87, runtime_config: {
        storage_amount_per_byte: '10000000000000000000', min_gas_purchase_price: '10',
        wasm_config: { limit_config: { max_total_prepaid_gas: '1000000000000000' } },
        transaction_costs: { pessimistic_gas_price_inflation_ratio: [1, 1], action_receipt_creation_config: fee,
            action_creation_config: { create_account_cost: fee, transfer_cost: fee, deploy_contract_cost: fee,
                deploy_contract_cost_per_byte: fee, function_call_cost: fee, function_call_cost_per_byte: fee,
                add_key_cost: { full_access_cost: fee, function_call_cost: fee, function_call_cost_per_byte: fee } } },
    } };
    let nonce = 10; let height = 100; let amount = 18_000_000_000_000_000_000_000_000n;
    const states = new Map(); const transactions = new Map(); const sent = []; const calls = []; const usdc = new Set();
    if (mode === 'existing') states.set(policy.accounts[1].account_id, { amount: '1', locked: '0', storage_usage: 100, code_hash: EMPTY, keys: [] });
    const block = () => ({ height, hash: baseEncode(Buffer.alloc(32, height % 256)) });
    const response = (result) => ({ ok: true, json: async () => ({ result }) });
    const missing = () => ({ ok: true, json: async () => ({ error: { cause: { name: 'UNKNOWN_ACCOUNT' } } }) });
    const planned = plannedTransactions(policy);
    const fetchImpl = async (_url, request) => {
        const { method, params } = JSON.parse(request.body); calls.push(method);
        if (method === 'status') return response({ chain_id: mode === 'mainnet' ? 'mainnet' : 'testnet' });
        if (method === 'block') return response({ header: block() });
        if (method === 'EXPERIMENTAL_protocol_config') return response(config);
        if (method === 'gas_price') return response({ gas_price: '1' });
        if (method === 'tx') return transactions.has(params.tx_hash) ? response(transactions.get(params.tx_hash)) : missing();
        if (method === 'send_tx') {
            assert.ok(existsSync(join(directory, 'public-plan.json')), 'public plan must precede sending');
            const signed = decodeSignedTransaction(Buffer.from(params.signed_tx_base64, 'base64'));
            const tx = signed.transaction; const txHash = codeHash(encodeTransaction(tx));
            const receipt = JSON.parse(readFileSync(join(directory, 'receipt.json')));
            assert.equal(receipt.transactions.at(-1).tx_hash, txHash, 'hash must be persisted before fetch');
            const t = planned[sent.length];
            assert.equal(tx.receiverId, t.receiver_id); assert.equal(tx.nonce, BigInt(nonce + 1));
            assert.equal(parent.verify(Buffer.from(hash(encodeTransaction(tx)), 'hex'), Uint8Array.from(signed.signature.ed25519Signature.data)), true);
            sent.push(tx);
            nonce++; height++;
            if (t.role === 'usdc_registration') {
                for (const action of tx.actions) usdc.add(JSON.parse(Buffer.from(action.functionCall.args).toString()).account_id);
            } else {
                const funding = tx.actions.find((x) => x.transfer).transfer.deposit;
                amount -= funding;
                const deploy = tx.actions.find((x) => x.deployContract);
                const init = tx.actions.find((x) => x.functionCall)?.functionCall;
                const keys = tx.actions.filter((x) => x.addKey).map((x) => {
                    const permission = x.addKey.accessKey.permission; const f = permission.functionCall;
                    return { public_key: `ed25519:${baseEncode(Uint8Array.from(x.addKey.publicKey.ed25519Key.data))}`, access_key: { nonce: 0, permission: permission.fullAccess
                        ? 'FullAccess' : { FunctionCall: { allowance: f.allowance.toString(), method_names: f.methodNames, receiver_id: f.receiverId } } } };
                });
                states.set(t.receiver_id, { amount: funding.toString(), locked: '0', storage_usage: 100,
                    code_hash: deploy ? codeHash(Buffer.from(deploy.deployContract.code)) : EMPTY, keys,
                    init: init ? JSON.parse(Buffer.from(init.args).toString()) : null });
                if (mode === 'gate-key' && t.role === 'ckd_gate') keys.push({ public_key: key(), access_key: { nonce: 0, permission: 'FullAccess' } });
            }
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
        if (params.request_type === 'view_account' && params.account_id === policy.usdc.contract_id) return response({ amount: '1', locked: '0', storage_usage: 1, code_hash: 'x' });
        if (params.request_type === 'call_function' && params.account_id === policy.usdc.contract_id) {
            const args = JSON.parse(Buffer.from(params.args_base64, 'base64').toString());
            return response({ result: Array.from(Buffer.from(JSON.stringify(usdc.has(args.account_id) ? { total: '1', available: '0' } : null))) });
        }
        const state = states.get(params.account_id); if (!state) return missing();
        if (params.request_type === 'view_account') return response(state);
        if (params.request_type === 'view_access_key_list') return response({ keys: state.keys });
        assert.equal(params.request_type, 'call_function');
        const c = state.init.config;
        const views = c ? {
            get_governance_state: { state_version: 3, admin_account_id: c.admin_account_id, guardian_account_id: c.guardian_account_id,
                active_bridge_account_id: c.bridge_account_id, pending_bridge_account_id: null, bridge_frozen: false, new_purchases_paused: false,
                bridge_rotation_proposed_at_ms: null },
            get_tax_account_id: c.tax_account_id, get_vat_public_key: c.vat_public_key, get_payment_operator_id: c.payment_operator_id,
            get_escrow_balance: '0', get_usdc_contract_id: TESTNET_USDC, get_quote_key_version: c.quote_key_version,
            get_storage_reserve_status: { reserve_covered: true, operational_reserve_yocto: c.near_operational_reserve },
        } : { config: state.init };
        assert.ok(Object.hasOwn(views, params.method_name));
        return response({ result: Array.from(Buffer.from(JSON.stringify(views[params.method_name]))) });
    };
    return { ctx, config, directory, keyFile, fetchImpl, sent, calls, states, usdc,
        prepare: () => prepare(ctx, keyFile, directory, fetchImpl),
        execute: (digest) => execute(ctx, directory, digest, fetchImpl, async () => {}),
        cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('the pinned USDC account is the one Market V2 hard-codes for testnet', () => {
    const source = readFileSync(new URL('../../../contracts/market-v2/src/lib.rs', import.meta.url), 'utf8');
    assert.equal(/const TESTNET_USDC: &str = "([0-9a-f]{64})";/.exec(source)?.[1], TESTNET_USDC);
    const policy = JSON.parse(readFileSync(new URL('./v2-testnet-bootstrap-policy.json', import.meta.url)));
    assert.equal(policy.usdc.contract_id, TESTNET_USDC);
});

test('the committed policy is a template the workflow refuses', () => {
    const policy = JSON.parse(readFileSync(new URL('./v2-testnet-bootstrap-policy.json', import.meta.url)));
    assert.throws(() => validatePolicy(policy), /policy_is_template/);
    delete policy.status;
    assert.throws(() => validatePolicy(policy), /ed25519_required|market_keys|wasm_hashes/);
});

test('bootstrap creates a keyless ckd-gate, initializes Market V2 and registers USDC accounts', async (t) => {
    for (const mode of ['normal', 'lost-response']) await t.test(mode, async () => {
        const f = fixture(mode);
        try {
            validatePolicy(f.ctx.policy);
            const prepared = await f.prepare(); assert.equal(f.sent.length, 0);
            const receipt = await f.execute(prepared.sha256);
            assert.equal(receipt.status, 'PASS'); assert.equal(f.sent.length, 7);
            assert.deepEqual(receipt.transactions.map((x) => x.status), Array(7).fill('VERIFIED'));
            const kinds = (tx) => tx.actions.map((x) => Object.keys(x).find((k) => k !== 'enum' && x[k]));
            assert.deepEqual(kinds(f.sent[1]), ['createAccount', 'transfer', 'deployContract', 'functionCall'], 'ckd-gate gets no key');
            assert.deepEqual(receipt.transactions[1].postcheck.keys, []);
            assert.deepEqual(receipt.transactions[1].postcheck.contract_state, f.ctx.policy.ckd_gate);
            const market = JSON.parse(Buffer.from(f.sent[0].actions.at(-1).functionCall.args).toString()).config;
            assert.equal(f.sent[0].actions.at(-1).functionCall.methodName, 'new');
            assert.equal(market.vat_public_key, f.ctx.policy.market.vat_public_key);
            assert.equal(market.tax_account_id, f.ctx.policy.accounts[5].account_id);
            assert.equal(market.payment_operator_id, f.ctx.policy.accounts[4].account_id);
            assert.equal(market.bridge_account_id, f.ctx.policy.accounts[3].account_id);
            assert.deepEqual(kinds(f.sent[3]), ['createAccount', 'transfer', 'addKey', 'addKey']);
            assert.deepEqual(f.sent[6].actions.map((a) => a.functionCall.methodName), ['storage_deposit', 'storage_deposit', 'storage_deposit']);
            assert.deepEqual([...f.usdc].sort(), USDC_ROLES.map((r) => f.ctx.policy.accounts.find((a) => a.role === r).account_id).sort());
            if (mode === 'lost-response') assert.ok(f.calls.includes('tx'));
            await assert.rejects(f.execute(prepared.sha256), /existing_receipt_reconcile/);
            assert.equal(f.sent.length, 7);
        } finally { f.cleanup(); }
    });
    for (const mode of ['existing', 'mainnet']) await t.test(mode, async () => {
        const f = fixture(mode);
        try { await assert.rejects(f.prepare(), mode === 'existing' ? /existing_target_reconcile/ : /rpc_network/); assert.equal(f.sent.length, 0); assert.equal(existsSync(f.directory), false); }
        finally { f.cleanup(); }
    });
    await t.test('a fee rise after signing stops before any send', async () => {
        const f = fixture();
        try {
            const prepared = await f.prepare();
            f.config.runtime_config.min_gas_purchase_price = '1000000000000000000000000';
            await assert.rejects(f.execute(prepared.sha256), /fee_budget/);
            assert.equal(f.sent.length, 0);
        } finally { f.cleanup(); }
    });
    await t.test('a key on ckd-gate fails the postcheck', async () => {
        const f = fixture('gate-key');
        try {
            const prepared = await f.prepare();
            await assert.rejects(f.execute(prepared.sha256), /target_keys/);
            assert.equal(f.sent.length, 2);
        } finally { f.cleanup(); }
    });
});

test('policy rules: keyless gate, exact Bridge methods, distinct keys, budget, pinned gate config', () => {
    const f = fixture();
    try {
        const fresh = () => structuredClone(f.ctx.policy);
        const cases = [
            [(p) => { p.accounts[1].keys = [{ public_key: key(), permission: 'FullAccess' }]; }, /ckd_gate_must_be_keyless/],
            [(p) => { p.accounts[3].keys[1].permission.FunctionCall.method_names = [...BRIDGE_METHODS, 'refund_unwatched']; }, /operator_permission/],
            [(p) => { p.market.vat_public_key = p.accounts[0].keys[0].public_key; }, /distinct_keys/],
            [(p) => { p.max_parent_debit_yocto = '1'; }, /budget/],
            [(p) => { p.ckd_gate.client_id = 'other client'; }, /ckd_gate_config/],
            [(p) => { p.ckd_gate.mpc = 'v1.signer'; }, /ckd_gate_config/],
            [(p) => { p.rpc_url = 'https://rpc.mainnet.near.org'; }, /testnet_only/],
            [(p) => { p.expected_protocol_version = 85; }, /protocol_version/],
        ];
        for (const [mutate, error] of cases) {
            const p = fresh(); mutate(p); assert.throws(() => validatePolicy(p), error);
        }
        assert.equal(buildActions(f.ctx.policy, 'usdc_registration', f.ctx.wasm).length, 3);
        assert.throws(() => upfrontFee(buildActions(f.ctx.policy, 'tax', f.ctx.wasm), { ...f.config, protocol_version: 86 }, '1', 87), /unsupported_protocol/);
    } finally { f.cleanup(); }
});

test('inputs: exact CI artifact files, provenance, checksums and lockfiles', () => {
    const root = mkdtempSync(join(tmpdir(), 'v2-artifact-'));
    try {
        const dir = join(root, 'v2'); mkdirSync(dir);
        const contents = {
            'youtick_market_v2.wasm': 'market v2 wasm', 'youtick_market_v2_abi.json': '{}',
            'market-v2.Cargo.lock': readFileSync(new URL('../../../contracts/market-v2/Cargo.lock', import.meta.url)),
            'ckd_gate.wasm': 'ckd gate wasm', 'ckd_gate_abi.json': '{}',
            'ckd-gate.Cargo.lock': readFileSync(new URL('../../../contracts/ckd-gate/Cargo.lock', import.meta.url)),
            'provenance.json': JSON.stringify({ schema: 'youtick.v2-runtime-artifact.v1', source_sha: '1'.repeat(40), ci: { run_id: '123', run_attempt: '1' } }),
        };
        for (const [name, value] of Object.entries(contents)) writeFileSync(join(dir, name), value);
        writeFileSync(join(dir, 'SHA256SUMS'), ARTIFACT_FILES.map((name) => `${hash(readFileSync(join(dir, name)))}  ${name}\n`).join(''));
        const wasm = { market_v2: readFileSync(join(dir, 'youtick_market_v2.wasm')), ckd_gate: readFileSync(join(dir, 'ckd_gate.wasm')) };
        const policyFile = join(root, 'policy.json');
        writeFileSync(policyFile, JSON.stringify(filledPolicy(key(), wasm)));
        const policyHash = hash(readFileSync(policyFile));
        const ctx = loadInputs(dir, '1'.repeat(40), '123', '1', policyHash, policyFile);
        assert.equal(ctx.wasm.ckd_gate.toString(), 'ckd gate wasm');
        assert.throws(() => loadInputs(dir, '2'.repeat(40), '123', '1', policyHash, policyFile), /artifact_provenance/);
        assert.throws(() => loadInputs(dir, '1'.repeat(40), '123', '1', '0'.repeat(64), policyFile), /policy_hash/);
        writeFileSync(join(dir, 'ckd_gate.wasm'), 'tampered');
        assert.throws(() => loadInputs(dir, '1'.repeat(40), '123', '1', policyHash, policyFile), /artifact_checksums/);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('keygen writes private keys only to a new directory outside the repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'v2-keygen-'));
    const repo = new URL('../../..', import.meta.url).pathname;
    try {
        const out = join(root, 'keys');
        const publicKeys = generate(out, repo);
        assert.deepEqual(Object.keys(publicKeys), [...KEY_NAMES, 'quote_base64']);
        assert.deepEqual(readdirSync(out).sort(), KEY_NAMES.map((name) => `${name}.json`).sort());
        const stored = JSON.parse(readFileSync(join(out, 'vat.json')));
        assert.ok(!JSON.stringify(publicKeys).includes(stored.private_key), 'printed output carries no private key');
        assert.equal(KeyPair.fromString(stored.private_key).getPublicKey().toString(), publicKeys.vat);
        assert.throws(() => generate(out, repo), /keygen_directory_exists/);
        assert.throws(() => generate(join(repo, 'tmp-keys-should-not-exist'), repo), /keygen_directory_inside_repository/);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
