// V2 testnet bootstrap (roadmap: separate V2 environment). One protected workflow run creates fresh
// accounts under the parent, deploys and initializes Market V2 and ckd-gate from attested CI bytes,
// and registers the money-holding accounts with USDC. ckd-gate is created with no access key at
// all, so nobody can ever redeploy it. Same discipline as public-testnet-bootstrap.mjs: verified
// inputs, a budget, transactions signed and published before any broadcast, one send each, and a
// final-state postcheck.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, lstatSync, readdirSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { actions, PublicKey, KeyPairSigner, createTransaction, encodeTransaction, decodeSignedTransaction, baseEncode, baseDecode } from 'near-api-js';

export const ROLES = ['market_v2', 'ckd_gate', 'relayer', 'bridge_operator', 'payment_operator', 'tax'];
export const BRIDGE_METHODS = ['finalize_livepeer_publication', 'suspend_livepeer_sales', 'mark_watched', 'release_expired'];
/** Accounts the parent registers with USDC in the last transaction: they hold or pay USDC. */
export const USDC_ROLES = ['market_v2', 'relayer', 'tax'];
/** Market V2 accepts only this token on testnet (`TESTNET_USDC` in contracts/market-v2/src/lib.rs). */
export const TESTNET_USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
export const ARTIFACT_FILES = ['youtick_market_v2.wasm', 'youtick_market_v2_abi.json', 'market-v2.Cargo.lock',
    'ckd_gate.wasm', 'ckd_gate_abi.json', 'ckd-gate.Cargo.lock', 'provenance.json'];
const POLICY_URL = new URL('./v2-testnet-bootstrap-policy.json', import.meta.url);
const EMPTY_CODE = '11111111111111111111111111111111';
const check = (condition, code) => { if (!condition) throw new Error(`v2_bootstrap_${code}`); };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = isDeepStrictEqual;
const account = (p, role) => p.accounts.find((a) => a.role === role);
const decimal = (v) => {
    check((typeof v === 'string' && /^[0-9]+$/.test(v)) || (Number.isSafeInteger(v) && v >= 0), 'invalid_decimal');
    return BigInt(v);
};
const ed25519 = (key) => {
    try { return typeof key === 'string' && key.startsWith('ed25519:') && PublicKey.from(key).data.length === 32; }
    catch { return false; }
};

function save(path, value, exclusive = false) {
    const fd = openSync(path, exclusive ? 'wx' : 'w', 0o600);
    try { writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
}

export function validatePolicy(p) {
    check(p.schema === 'youtick.v2-testnet-bootstrap.v1' && p.operation === 'FRESH_V2_ACCOUNTS_DEPLOY_INIT', 'policy_operation');
    // The committed file is a template; its `status` note must be removed when it is filled in.
    check(!Object.hasOwn(p, 'status'), 'policy_is_template');
    check(p.network === 'testnet' && p.rpc_url === 'https://test.rpc.fastnear.com', 'testnet_only');
    check(/^[a-z0-9._-]+\.testnet$/.test(p.parent.account_id) && ed25519(p.parent.public_key), 'parent_account');
    check(same(p.accounts.map((a) => a.role), ROLES), 'account_roles');
    check(new Set(p.accounts.map((a) => a.account_id)).size === ROLES.length, 'duplicate_account');
    const keys = [];
    for (const a of p.accounts) {
        check(a.account_id.endsWith(`.${p.parent.account_id}`)
            && a.account_id.split('.').length === p.parent.account_id.split('.').length + 1
            && /^[a-z0-9._-]{2,64}$/.test(a.account_id), 'direct_child_required');
        check(decimal(a.funding_yocto) > 0n, 'funding_required');
        if (a.role === 'ckd_gate') {
            // Keyless from birth: whoever could redeploy the gate could collect every user's secret.
            check(a.keys.length === 0, 'ckd_gate_must_be_keyless');
            continue;
        }
        check(a.keys.length === (a.role === 'bridge_operator' ? 2 : 1) && a.keys[0].permission === 'FullAccess', 'management_key');
        keys.push(...a.keys.map((k) => k.public_key));
    }
    const finite = account(p, 'bridge_operator').keys[1].permission.FunctionCall;
    check(finite?.receiver_id === account(p, 'market_v2').account_id && same(finite.method_names, BRIDGE_METHODS)
        && decimal(finite.allowance) > 0n && decimal(finite.allowance) <= decimal(account(p, 'bridge_operator').funding_yocto), 'operator_permission');
    const market = p.market;
    keys.push(market.quote_public_key, market.vat_public_key);
    check(keys.every(ed25519) && ed25519(p.governance_public_keys.admin) && ed25519(p.governance_public_keys.guardian), 'ed25519_required');
    check(new Set(keys).size === keys.length && !keys.includes(p.parent.public_key), 'distinct_keys');
    check(Buffer.from(PublicKey.from(market.quote_public_key).data).toString('base64') === market.quote_public_key_base64
        && market.quote_key_version === 1 && market.vat_key_version === 1, 'market_keys');
    check(decimal(market.operational_reserve_yocto) > 0n, 'market_reserve');
    check(p.roles.platform === p.parent.account_id && p.roles.takedown === p.roles.guardian && p.roles.admin !== p.roles.guardian
        && [p.roles.admin, p.roles.guardian].every((id) => /^[a-z0-9._-]+\.testnet$/.test(id) && !p.accounts.some((a) => a.account_id === id)),
    'governance_roles');
    const gate = p.ckd_gate;
    check(same(Object.keys(gate).sort(), ['ckd_domain', 'client_id', 'fast_auth', 'fast_auth_domain', 'guard', 'issuer', 'mpc'])
        && gate.issuer === 'https://login.testnet.fast-auth.com/' && gate.fast_auth === 'fast-auth.testnet'
        && gate.mpc === 'v1.signer-prod.testnet' && gate.guard === 'auth0.jwt.fast-auth.testnet'
        && gate.fast_auth_domain === 1 && gate.ckd_domain === 2 && /^[A-Za-z0-9_-]{1,128}$/.test(gate.client_id), 'ckd_gate_config');
    check(p.usdc.contract_id === TESTNET_USDC && decimal(p.usdc.storage_deposit_yocto) > 0n
        && decimal(p.usdc.storage_deposit_yocto) <= 10_000_000_000_000_000_000_000n, 'usdc');
    check(decimal(p.initialization_gas) > 0n && decimal(p.initialization_gas) <= 100_000_000_000_000n, 'initialization_gas');
    check(/^[a-f0-9]{64}$/.test(p.wasm_sha256.market_v2) && /^[a-f0-9]{64}$/.test(p.wasm_sha256.ckd_gate), 'wasm_hashes');
    const transfers = p.accounts.reduce((sum, a) => sum + decimal(a.funding_yocto), 0n)
        + decimal(p.usdc.storage_deposit_yocto) * BigInt(USDC_ROLES.length);
    check(transfers + decimal(p.max_upfront_fees_yocto) <= decimal(p.max_parent_debit_yocto), 'budget');
    check(Number.isSafeInteger(p.expected_protocol_version) && p.expected_protocol_version >= 87, 'protocol_version');
}

export function verifyArtifact(dir, sourceSha, runId, attempt) {
    check(same(readdirSync(dir).sort(), [...ARTIFACT_FILES, 'SHA256SUMS'].sort()), 'artifact_file_set');
    for (const name of [...ARTIFACT_FILES, 'SHA256SUMS']) {
        const stat = lstatSync(resolve(dir, name)); check(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0, 'artifact_file_type');
    }
    const provenance = JSON.parse(readFileSync(resolve(dir, 'provenance.json')));
    check(same(provenance, { schema: 'youtick.v2-runtime-artifact.v1', source_sha: sourceSha, ci: { run_id: runId, run_attempt: attempt } }), 'artifact_provenance');
    check(ARTIFACT_FILES.map((name) => `${hash(readFileSync(resolve(dir, name)))}  ${name}\n`).join('') === readFileSync(resolve(dir, 'SHA256SUMS'), 'utf8'), 'artifact_checksums');
    for (const [file, crate] of [['market-v2.Cargo.lock', 'market-v2'], ['ckd-gate.Cargo.lock', 'ckd-gate']]) {
        check(readFileSync(resolve(dir, file)).equals(readFileSync(new URL(`../../../contracts/${crate}/Cargo.lock`, import.meta.url))), 'artifact_lockfile');
    }
    return { market_v2: readFileSync(resolve(dir, 'youtick_market_v2.wasm')), ckd_gate: readFileSync(resolve(dir, 'ckd_gate.wasm')) };
}

export function loadInputs(artifactDir, sourceSha, runId, attempt, policyHash, policyUrl = POLICY_URL) {
    check(/^[a-f0-9]{40}$/.test(sourceSha) && /^[1-9][0-9]*$/.test(runId) && /^[1-9][0-9]*$/.test(attempt), 'source_identity');
    const bytes = readFileSync(policyUrl);
    check(hash(bytes) === policyHash, 'policy_hash');
    const policy = JSON.parse(bytes); validatePolicy(policy);
    const wasm = verifyArtifact(artifactDir, sourceSha, runId, attempt);
    for (const role of ['market_v2', 'ckd_gate']) check(hash(wasm[role]) === policy.wasm_sha256[role], 'wasm_hash');
    return { policy, policyHash, sourceSha, runId, attempt, wasm };
}

/** One transaction per account, then one USDC registration transaction (receiver: USDC). */
export function plannedTransactions(p) {
    return [...p.accounts.map((a) => ({ role: a.role, receiver_id: a.account_id })), { role: 'usdc_registration', receiver_id: p.usdc.contract_id }];
}

export function buildActions(p, role, wasm) {
    if (role === 'usdc_registration') {
        return USDC_ROLES.map((r) => actions.functionCall('storage_deposit', { account_id: account(p, r).account_id, registration_only: true },
            decimal(p.initialization_gas) / 4n, decimal(p.usdc.storage_deposit_yocto)));
    }
    const a = account(p, role);
    const result = [actions.createAccount(), actions.transfer(decimal(a.funding_yocto))];
    for (const key of a.keys) {
        const pk = PublicKey.from(key.public_key);
        const finite = key.permission.FunctionCall;
        result.push(key.permission === 'FullAccess' ? actions.addFullAccessKey(pk)
            : actions.addFunctionCallAccessKey(pk, finite.receiver_id, finite.method_names, decimal(finite.allowance)));
    }
    if (role === 'market_v2') result.push(actions.deployContract(wasm.market_v2), actions.functionCall('new', { config: {
        platform_account_id: p.roles.platform, bridge_account_id: account(p, 'bridge_operator').account_id,
        takedown_authority_id: p.roles.takedown, admin_account_id: p.roles.admin, guardian_account_id: p.roles.guardian,
        quote_public_key: p.market.quote_public_key_base64, quote_key_version: p.market.quote_key_version,
        near_operational_reserve: p.market.operational_reserve_yocto, tax_account_id: account(p, 'tax').account_id,
        vat_public_key: p.market.vat_public_key, vat_key_version: p.market.vat_key_version,
        payment_operator_id: account(p, 'payment_operator').account_id,
    } }, decimal(p.initialization_gas), 0n));
    if (role === 'ckd_gate') result.push(actions.deployContract(wasm.ckd_gate), actions.functionCall('new', { ...p.ckd_gate }, decimal(p.initialization_gas), 0n));
    return result;
}

export function upfrontFee(batch, config, gasPrice, expectedProtocol) {
    check(config.protocol_version === expectedProtocol, 'unsupported_protocol');
    const runtime = config.runtime_config; const costs = runtime.transaction_costs;
    check(same(costs.pessimistic_gas_price_inflation_ratio, [1, 1]), 'unsupported_fee_inflation');
    let send = 0n; let execution = 0n; let prepaid = 0n;
    const add = (fee, count = 1n) => {
        check(fee && fee.send_not_sir !== undefined && fee.execution !== undefined, 'fee_config');
        send += decimal(fee.send_not_sir) * count; execution += decimal(fee.execution) * count;
    };
    add(costs.action_receipt_creation_config);
    const f = costs.action_creation_config;
    for (const action of batch) {
        if (action.createAccount) add(f.create_account_cost);
        else if (action.transfer) add(f.transfer_cost);
        else if (action.addKey) {
            check(action.addKey.publicKey.keyType === 0, 'ed25519_required');
            const permission = action.addKey.accessKey.permission;
            if (permission.fullAccess) add(f.add_key_cost.full_access_cost);
            else {
                const finite = permission.functionCall; check(finite, 'key_permission');
                add(f.add_key_cost.function_call_cost);
                add(f.add_key_cost.function_call_cost_per_byte, BigInt(finite.methodNames.reduce((sum, name) => sum + Buffer.byteLength(name) + 1, 0)));
            }
        } else if (action.deployContract) {
            add(f.deploy_contract_cost); add(f.deploy_contract_cost_per_byte, BigInt(action.deployContract.code.length));
        } else if (action.functionCall) {
            add(f.function_call_cost); add(f.function_call_cost_per_byte, BigInt(Buffer.byteLength(action.functionCall.methodName) + action.functionCall.args.length));
            prepaid += action.functionCall.gas;
        } else check(false, 'unsupported_action');
    }
    check(runtime.min_gas_purchase_price !== undefined, 'fee_config');
    const price = decimal(gasPrice); const minimum = decimal(runtime.min_gas_purchase_price);
    check(prepaid <= decimal(runtime.wasm_config.limit_config.max_total_prepaid_gas), 'protocol_gas_limit');
    return send * price + (execution + prepaid) * (price > minimum ? price : minimum);
}

function rpcClient(p, fetchImpl) {
    return async (method, params, allowMissing = false) => {
        let body;
        try {
            const response = await fetchImpl(p.rpc_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 'v2-testnet-bootstrap', method, params }), signal: AbortSignal.timeout(15_000) });
            check(response.ok, 'rpc_http'); body = await response.json();
        } catch { throw new Error('v2_bootstrap_rpc_unavailable'); }
        if (allowMissing && body.error?.cause?.name === 'UNKNOWN_ACCOUNT') return null;
        check(!body.error && body.result !== undefined, 'rpc_error'); return body.result;
    };
}

export async function snapshot(ctx, fetchImpl = fetch) {
    const p = ctx.policy; const rpc = rpcClient(p, fetchImpl);
    check((await rpc('status', [])).chain_id === 'testnet', 'rpc_network');
    const block = (await rpc('block', { finality: 'final' })).header;
    check(Number.isSafeInteger(block.height) && block.height > 0 && baseDecode(block.hash).length === 32, 'final_block');
    const query = (request_type, account_id, extra = {}) => rpc('query', { request_type, account_id, block_id: block.hash, ...extra }, request_type === 'view_account');
    const [config, gas, parent, key, targets, governance, usdc] = await Promise.all([
        rpc('EXPERIMENTAL_protocol_config', { block_id: block.hash }), rpc('gas_price', [block.hash]),
        query('view_account', p.parent.account_id), query('view_access_key', p.parent.account_id, { public_key: p.parent.public_key }),
        Promise.all(p.accounts.map((a) => query('view_account', a.account_id))),
        Promise.all(['admin', 'guardian'].map((role) => query('view_access_key', p.roles[role], { public_key: p.governance_public_keys[role] }))),
        query('view_account', p.usdc.contract_id),
    ]);
    check(config.protocol_version === p.expected_protocol_version && parent && parent.locked === '0' && usdc, 'chain_state');
    check(key.permission === 'FullAccess' && Number.isSafeInteger(key.nonce) && key.nonce >= 0
        && governance.every((k) => k.permission === 'FullAccess'), 'signer_permission');
    const fees = plannedTransactions(p).map((t) => upfrontFee(buildActions(p, t.role, ctx.wasm), config, gas.gas_price, p.expected_protocol_version));
    const storage = decimal(parent.storage_usage) * decimal(config.runtime_config.storage_amount_per_byte);
    const funding = p.accounts.reduce((sum, a) => sum + decimal(a.funding_yocto), 0n) + decimal(p.usdc.storage_deposit_yocto) * BigInt(USDC_ROLES.length);
    return { block, config, parent, nonce: key.nonce, targets, fees, funding, available: decimal(parent.amount) - storage };
}

/** Funding still to be sent from step `start` on (the USDC deposits belong to the last step). */
function remainingFunding(p, start) {
    return plannedTransactions(p).slice(start).reduce((sum, t) => sum + (t.role === 'usdc_registration'
        ? decimal(p.usdc.storage_deposit_yocto) * BigInt(USDC_ROLES.length) : decimal(account(p, t.role).funding_yocto)), 0n);
}

export function checkBudget(ctx, state, start = 0, alreadyQuoted = 0n) {
    const fees = state.fees.slice(start).reduce((sum, n) => sum + n, 0n);
    check(fees + alreadyQuoted <= decimal(ctx.policy.max_upfront_fees_yocto), 'fee_budget');
    check(state.funding + fees + alreadyQuoted <= decimal(ctx.policy.max_parent_debit_yocto), 'total_budget');
    check(state.available >= remainingFunding(ctx.policy, start) + fees, 'parent_balance');
}

export async function prepare(ctx, privateKeyFile, directory, fetchImpl = fetch) {
    const state = await snapshot(ctx, fetchImpl); check(state.targets.every((a) => a === null), 'existing_target_reconcile'); checkBudget(ctx, state);
    check(!existsSync(directory), 'existing_plan_reconcile');
    const keyStat = lstatSync(privateKeyFile); check(keyStat.isFile() && !keyStat.isSymbolicLink() && (keyStat.mode & 0o777) === 0o600, 'private_key_file');
    let signer;
    try { signer = KeyPairSigner.fromSecretKey(JSON.parse(readFileSync(privateKeyFile)).private_key); }
    catch { throw new Error('v2_bootstrap_signer_key_invalid'); }
    check((await signer.getPublicKey()).toString() === ctx.policy.parent.public_key, 'signer_key_mismatch');
    mkdirSync(directory, { mode: 0o700 }); mkdirSync(resolve(directory, 'signed'), { mode: 0o700 });
    const transactions = [];
    for (const [i, t] of plannedTransactions(ctx.policy).entries()) {
        const tx = createTransaction(ctx.policy.parent.account_id, PublicKey.from(ctx.policy.parent.public_key), t.receiver_id,
            BigInt(state.nonce) + BigInt(i + 1), buildActions(ctx.policy, t.role, ctx.wasm), baseDecode(state.block.hash));
        const { txHash, signedTransaction } = await signer.signTransaction(tx);
        writeFileSync(resolve(directory, 'signed', `${t.role}.txt`), Buffer.from(encodeTransaction(signedTransaction)).toString('base64'), { flag: 'wx', mode: 0o600 });
        transactions.push({ ...t, nonce: tx.nonce.toString(), tx_hash: baseEncode(txHash), fee_quote_yocto: state.fees[i].toString(),
            action_types: tx.actions.map((x) => x.enum) });
    }
    const plan = { schema: 'youtick.v2-testnet-bootstrap-plan.v1', source_sha: ctx.sourceSha, ci_run_id: ctx.runId,
        ci_run_attempt: ctx.attempt, policy_sha256: ctx.policyHash, parent_id: ctx.policy.parent.account_id,
        block_height: state.block.height, block_hash: state.block.hash, initial_parent_balance_yocto: state.parent.amount,
        fee_quote_total_yocto: state.fees.reduce((s, n) => s + n, 0n).toString(), transactions };
    save(resolve(directory, 'public-plan.json'), plan, true);
    return { plan, sha256: hash(readFileSync(resolve(directory, 'public-plan.json'))) };
}

async function postcheck(ctx, t, rpc) {
    const p = ctx.policy;
    const block = (await rpc('block', { finality: 'final' })).header;
    const query = (request_type, account_id, extra = {}) => rpc('query', { request_type, account_id, block_id: block.hash, ...extra });
    const view = async (contract, method_name, args = {}) => {
        const r = await query('call_function', contract, { method_name, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
        check(Array.isArray(r.result), 'view_result'); return JSON.parse(Buffer.from(r.result).toString('utf8'));
    };
    if (t.role === 'usdc_registration') {
        const balances = await Promise.all(USDC_ROLES.map((r) => view(p.usdc.contract_id, 'storage_balance_of', { account_id: account(p, r).account_id })));
        check(balances.every((b) => b !== null), 'usdc_registration');
        return { block_height: block.height, block_hash: block.hash, usdc_storage: balances };
    }
    const a = account(p, t.role);
    const [state, keys] = await Promise.all([query('view_account', a.account_id), query('view_access_key_list', a.account_id)]);
    const expectedCode = ctx.wasm[a.role] ? baseEncode(Buffer.from(p.wasm_sha256[a.role], 'hex')) : EMPTY_CODE;
    check(state.code_hash === expectedCode && state.locked === '0' && decimal(state.amount) >= decimal(a.funding_yocto), 'target_account_state');
    const keyView = keys.keys.map((k) => ({ public_key: k.public_key, permission: k.access_key.permission })).sort((x, y) => x.public_key.localeCompare(y.public_key));
    check(same(keyView, [...a.keys].sort((x, y) => x.public_key.localeCompare(y.public_key))), 'target_keys');
    let contractState;
    if (a.role === 'market_v2') {
        const [governance, tax, vat, operator, escrow, usdc, quoteVersion, reserve] = await Promise.all([
            view(a.account_id, 'get_governance_state'), view(a.account_id, 'get_tax_account_id'),
            view(a.account_id, 'get_vat_public_key', { key_version: p.market.vat_key_version }), view(a.account_id, 'get_payment_operator_id'),
            view(a.account_id, 'get_escrow_balance'), view(a.account_id, 'get_usdc_contract_id'),
            view(a.account_id, 'get_quote_key_version'), view(a.account_id, 'get_storage_reserve_status'),
        ]);
        check(governance.state_version === 3 && governance.bridge_rotation_proposed_at_ms === null
            && quoteVersion === p.market.quote_key_version && reserve.reserve_covered === true
            && reserve.operational_reserve_yocto === p.market.operational_reserve_yocto, 'market_versions_and_reserve');
        check(governance.admin_account_id === p.roles.admin && governance.guardian_account_id === p.roles.guardian
            && governance.active_bridge_account_id === account(p, 'bridge_operator').account_id
            && governance.bridge_frozen === false && governance.new_purchases_paused === false
            && governance.pending_bridge_account_id === null, 'market_governance');
        check(tax === account(p, 'tax').account_id && vat === p.market.vat_public_key && operator === account(p, 'payment_operator').account_id
            && escrow === '0' && usdc === p.usdc.contract_id, 'market_state');
        contractState = { governance, tax, vat, operator, escrow, usdc, quoteVersion, reserve };
    } else if (a.role === 'ckd_gate') {
        contractState = await view(a.account_id, 'config');
        check(same(contractState, p.ckd_gate), 'ckd_gate_config');
        check(keyView.length === 0, 'ckd_gate_keyless');
    }
    return { block_height: block.height, block_hash: block.hash, account: state, keys: keyView, ...(contractState ? { contract_state: contractState } : {}) };
}

async function finalTransaction(rpc, txHash, parent, first, pause) {
    let result = first;
    for (let i = 0; i < 12; i++) {
        if (result?.final_execution_status === 'FINAL') return result;
        if (i > 0) await pause(2000);
        try { result = await rpc('tx', { tx_hash: txHash, sender_account_id: parent, wait_until: 'FINAL' }); }
        catch { result = null; }
    }
    return result?.final_execution_status === 'FINAL' ? result : null;
}

export async function execute(ctx, directory, planHash, fetchImpl = fetch, pause = sleep) {
    const planBytes = readFileSync(resolve(directory, 'public-plan.json')); check(hash(planBytes) === planHash, 'plan_hash');
    const plan = JSON.parse(planBytes); const p = ctx.policy; const planned = plannedTransactions(p);
    check(plan.schema === 'youtick.v2-testnet-bootstrap-plan.v1' && plan.policy_sha256 === ctx.policyHash
        && plan.source_sha === ctx.sourceSha && plan.ci_run_id === ctx.runId && plan.ci_run_attempt === ctx.attempt
        && plan.parent_id === p.parent.account_id && plan.transactions.length === planned.length, 'plan_identity');
    const output = resolve(directory, 'receipt.json'); check(!existsSync(output), 'existing_receipt_reconcile');
    const receipt = { schema: 'youtick.v2-testnet-bootstrap-receipt.v1', source_sha: ctx.sourceSha, policy_sha256: ctx.policyHash,
        plan_sha256: planHash, status: 'IN_PROGRESS', transactions: [] };
    save(output, receipt, true);
    const rpc = rpcClient(p, fetchImpl); let quoted = 0n;
    try {
        for (const [i, t] of planned.entries()) {
            const state = await snapshot(ctx, fetchImpl);
            check(state.targets.slice(i).every((x) => x === null), 'existing_target_reconcile');
            check(state.block.height >= plan.block_height && state.block.height - plan.block_height <= 300, 'plan_expired');
            checkBudget(ctx, state, i, quoted);
            const entry = plan.transactions[i];
            check(entry.role === t.role && entry.receiver_id === t.receiver_id && BigInt(state.nonce) + 1n === decimal(entry.nonce), 'nonce_or_target_changed');
            const encoded = readFileSync(resolve(directory, 'signed', `${t.role}.txt`), 'utf8');
            const signed = decodeSignedTransaction(Buffer.from(encoded, 'base64'));
            const expected = createTransaction(p.parent.account_id, PublicKey.from(p.parent.public_key), t.receiver_id,
                decimal(entry.nonce), buildActions(p, t.role, ctx.wasm), baseDecode(plan.block_hash));
            const bytes = encodeTransaction(expected);
            check(Buffer.from(encodeTransaction(signed.transaction)).equals(Buffer.from(bytes))
                && baseEncode(Buffer.from(hash(bytes), 'hex')) === entry.tx_hash, 'signed_transaction_changed');
            const record = { ...entry, status: 'SUBMITTING', latest_fee_quote_yocto: state.fees[i].toString() };
            receipt.transactions.push(record); save(output, receipt);
            console.log(JSON.stringify({ event: 'v2_bootstrap_before_send', role: t.role, tx_hash: entry.tx_hash }));
            let result;
            try { result = await rpc('send_tx', { signed_tx_base64: encoded, wait_until: 'FINAL' }); }
            catch { result = null; }
            result = await finalTransaction(rpc, entry.tx_hash, p.parent.account_id, result, pause);
            if (!result) { record.status = 'AMBIGUOUS'; receipt.status = 'AMBIGUOUS'; save(output, receipt); return receipt; }
            check(result.transaction?.hash === entry.tx_hash && result.transaction.signer_id === p.parent.account_id
                && result.transaction.receiver_id === t.receiver_id, 'transaction_identity');
            const outcomes = [result.transaction_outcome, ...(result.receipts_outcome ?? [])];
            check(!result.status?.Failure && Object.hasOwn(result.status ?? {}, 'SuccessValue')
                && outcomes.every((o) => o?.outcome?.status && !Object.hasOwn(o.outcome.status, 'Failure')), 'transaction_failed');
            record.status = 'FINAL'; record.final_result = result; save(output, receipt);
            record.postcheck = await postcheck(ctx, t, rpc); record.status = 'VERIFIED';
            const parent = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: p.parent.account_id });
            const debit = decimal(plan.initial_parent_balance_yocto) - decimal(parent.amount);
            check(debit >= 0n && debit <= decimal(p.max_parent_debit_yocto), 'observed_debit_limit');
            receipt.observed_parent_debit_yocto = debit.toString(); quoted += state.fees[i]; save(output, receipt);
        }
        receipt.status = 'PASS'; save(output, receipt); return receipt;
    } catch (error) {
        receipt.status = 'FAILED_RECONCILE_REQUIRED'; receipt.error = error.message?.startsWith('v2_bootstrap_') ? error.message : 'v2_bootstrap_unexpected_error';
        save(output, receipt); throw new Error(receipt.error);
    }
}

const main = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (main) {
    try {
        const [command, artifactDir, sourceSha, runId, attempt, policyHash, ...extra] = process.argv.slice(2);
        check(['verify', 'preflight', 'prepare', 'execute'].includes(command), 'command');
        const ctx = loadInputs(artifactDir, sourceSha, runId, attempt, policyHash);
        if (command === 'verify') { check(extra.length === 0, 'arguments'); console.log(JSON.stringify({ status: 'PASS', policy_sha256: policyHash })); }
        if (command === 'preflight') {
            check(extra.length === 0, 'arguments'); const state = await snapshot(ctx); check(state.targets.every((a) => a === null), 'existing_target_reconcile'); checkBudget(ctx, state);
            console.log(JSON.stringify({ status: 'PASS', block_height: state.block.height, available_yocto: state.available.toString(), funding_yocto: state.funding.toString(), fee_quotes_yocto: state.fees.map(String) }));
        }
        if (command === 'prepare') { check(extra.length === 2, 'arguments'); const r = await prepare(ctx, extra[0], extra[1]); console.log(JSON.stringify({ plan_sha256: r.sha256, transactions: r.plan.transactions })); }
        if (command === 'execute') { check(extra.length === 2 && process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === '4rmus/youtick', 'protected_workflow_required'); const r = await execute(ctx, extra[0], extra[1]); console.log(JSON.stringify({ status: r.status })); if (r.status !== 'PASS') process.exitCode = 1; }
    } catch (error) { console.error(error.message?.startsWith('v2_bootstrap_') ? error.message : 'v2_bootstrap_failed'); process.exitCode = 1; }
}
