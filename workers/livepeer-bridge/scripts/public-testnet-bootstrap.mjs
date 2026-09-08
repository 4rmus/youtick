import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, lstatSync, readdirSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { actions, PublicKey, KeyPairSigner, createTransaction, encodeTransaction, decodeSignedTransaction, baseEncode, baseDecode } from 'near-api-js';
import { verifyMarketRuntimeArtifact } from './market-code-update.mjs';

const METHODS = ['finalize_livepeer_publication', 'suspend_livepeer_sales'];
const ROLES = ['operator', 'relayer', 'market', 'access'];
const EMPTY_CODE = '11111111111111111111111111111111';
const PROFILE_HASHES = ['28ba12452dd2cc55e64baf73a3dbf665784eeb8fd87892163818513165bbd3b2', '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77'];
const check = (condition, code) => { if (!condition) throw new Error(`bootstrap_${code}`); };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = isDeepStrictEqual;
const account = (p, role) => p.accounts.find((a) => a.role === role);
const decimal = (v) => {
    check((typeof v === 'string' && /^[0-9]+$/.test(v)) || (Number.isSafeInteger(v) && v >= 0), 'invalid_decimal');
    return BigInt(v);
};

function save(path, value, exclusive = false) {
    const fd = openSync(path, exclusive ? 'wx' : 'w', 0o600);
    try { writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
}

export function validatePolicy(p) {
    check(p.schema === 'youtick.public-testnet-bootstrap.v1' && p.operation === 'FRESH_ACCOUNT_CREATE_DEPLOY_INIT', 'policy_operation');
    check(p.network === 'testnet' && p.rpc_url === 'https://test.rpc.fastnear.com', 'testnet_only');
    check(/^[a-z0-9._-]+\.testnet$/.test(p.parent.account_id), 'parent_account');
    check(same(p.accounts.map((a) => a.role), ROLES), 'account_roles');
    check(new Set(p.accounts.map((a) => a.account_id)).size === 4, 'duplicate_account');
    const keys = [p.quote.public_key];
    for (const a of p.accounts) {
        check(a.account_id.endsWith(`.${p.parent.account_id}`)
            && a.account_id.split('.').length === p.parent.account_id.split('.').length + 1
            && /^[a-z0-9._-]{2,64}$/.test(a.account_id), 'direct_child_required');
        check(decimal(a.funding_yocto) > 0n, 'funding_required');
        check(a.keys.length === (a.role === 'operator' ? 2 : 1) && a.keys[0].permission === 'FullAccess', 'management_key');
        keys.push(...a.keys.map((k) => k.public_key));
    }
    const finite = account(p, 'operator').keys[1].permission.FunctionCall;
    check(finite?.receiver_id === account(p, 'market').account_id && same(finite.method_names, METHODS)
        && decimal(finite.allowance) > 0n && decimal(finite.allowance) <= decimal(account(p, 'operator').funding_yocto), 'operator_permission');
    check(keys.length === 6 && new Set(keys).size === 6, 'distinct_keys');
    for (const key of [...keys, p.parent.public_key, ...Object.values(p.governance_public_keys)]) {
        check(key.startsWith('ed25519:') && PublicKey.from(key).data.length === 32, 'ed25519_required');
    }
    check(!keys.includes(p.parent.public_key), 'parent_key_reuse');
    check(p.roles.platform === p.parent.account_id && p.roles.access_owner === p.roles.admin
        && p.roles.takedown === p.roles.guardian && p.roles.admin !== p.roles.guardian, 'governance_roles');
    check([p.roles.admin, p.roles.guardian].every((id) => /^[a-z0-9._-]+\.testnet$/.test(id)
        && !p.accounts.some((a) => a.account_id === id)), 'governance_account');
    check(Buffer.from(PublicKey.from(p.quote.public_key).data).toString('base64') === p.quote.public_key_base64 && p.quote.version === 1, 'quote_key');
    check(decimal(p.initialization_gas) > 0n && decimal(p.initialization_gas) <= 100_000_000_000_000n, 'initialization_gas');
    const transfers = p.accounts.reduce((sum, a) => sum + decimal(a.funding_yocto), 0n);
    check(transfers + decimal(p.max_upfront_fees_yocto) <= decimal(p.max_parent_debit_yocto), 'budget');
    check(p.expected_protocol_version === 85, 'unsupported_protocol');
}

export async function loadInputs(artifactDir, sourceSha, runId, attempt, policyHash) {
    check(/^[a-f0-9]{40}$/.test(sourceSha) && /^[1-9][0-9]*$/.test(runId) && /^[1-9][0-9]*$/.test(attempt), 'source_identity');
    const bytes = readFileSync(new URL('./public-testnet-bootstrap-policy.json', import.meta.url));
    check(hash(bytes) === policyHash, 'policy_hash');
    const policy = JSON.parse(bytes); validatePolicy(policy);
    const market = await verifyMarketRuntimeArtifact({ artifactDir: resolve(artifactDir, 'market'), sourceSha, runId, runAttempt: attempt });
    check(market.manifest.toolchain.lockfile_sha256 === hash(readFileSync(new URL('../../../contracts/nft-ticket/Cargo.lock', import.meta.url))), 'market_lockfile');
    const dir = resolve(artifactDir, 'access');
    const names = ['youtick_access_control.wasm', 'youtick_access_control_abi.json', 'Cargo.lock', 'provenance.json'];
    check(same(readdirSync(dir).sort(), [...names, 'SHA256SUMS'].sort()), 'access_file_set');
    for (const name of [...names, 'SHA256SUMS']) {
        const stat = lstatSync(resolve(dir, name)); check(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0, 'access_file_type');
    }
    const provenance = JSON.parse(readFileSync(resolve(dir, 'provenance.json')));
    check(same(provenance, { schema: 'youtick.access-runtime-artifact.v1', source_sha: sourceSha, ci: { run_id: runId, run_attempt: attempt } }), 'access_provenance');
    check(names.map((name) => `${hash(readFileSync(resolve(dir, name)))}  ${name}\n`).join('') === readFileSync(resolve(dir, 'SHA256SUMS'), 'utf8'), 'access_checksums');
    check(readFileSync(resolve(dir, 'Cargo.lock')).equals(readFileSync(new URL('../../../contracts/access-control/Cargo.lock', import.meta.url))), 'access_lockfile');
    const wasm = { market: market.wasm, access: readFileSync(resolve(dir, 'youtick_access_control.wasm')) };
    for (const role of ['market', 'access']) check(hash(wasm[role]) === policy.wasm_sha256[role], 'wasm_hash');
    return { policy, policyHash, sourceSha, runId, attempt, wasm };
}

export function buildActions(p, a, wasm) {
    const result = [actions.createAccount(), actions.transfer(decimal(a.funding_yocto))];
    for (const key of a.keys) {
        const pk = PublicKey.from(key.public_key);
        const finite = key.permission.FunctionCall;
        result.push(key.permission === 'FullAccess' ? actions.addFullAccessKey(pk)
            : actions.addFunctionCallAccessKey(pk, finite.receiver_id, finite.method_names, decimal(finite.allowance)));
    }
    if (a.role === 'market') result.push(actions.deployContract(wasm.market), actions.functionCall('new_public_testnet', { config: {
        platform_account_id: p.roles.platform, bridge_account_id: account(p, 'operator').account_id,
        takedown_authority_id: p.roles.takedown, admin_account_id: p.roles.admin, guardian_account_id: p.roles.guardian,
        quote_public_key: p.quote.public_key_base64, quote_key_version: p.quote.version, near_operational_reserve: p.operational_reserve_yocto,
    } }, decimal(p.initialization_gas), 0n));
    if (a.role === 'access') result.push(actions.deployContract(wasm.access), actions.functionCall('new', {
        owner_id: p.roles.access_owner, market_contract_id: account(p, 'market').account_id,
    }, decimal(p.initialization_gas), 0n));
    return result;
}

export function upfrontFee(batch, config, gasPrice) {
    check(config.protocol_version === 85, 'unsupported_protocol');
    const runtime = config.runtime_config; const costs = runtime.transaction_costs;
    check(same(costs.pessimistic_gas_price_inflation_ratio, [1, 1]), 'unsupported_fee_inflation');
    let send = 0n; let execution = 0n; let prepaid = 0n;
    const add = (fee, count = 1n) => { send += decimal(fee.send_not_sir) * count; execution += decimal(fee.execution) * count; };
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
    const price = decimal(gasPrice); const minimum = decimal(runtime.min_gas_purchase_price);
    check(prepaid <= decimal(runtime.wasm_config.limit_config.max_total_prepaid_gas), 'protocol_gas_limit');
    // Protocol 85's account-creation charge comes from this gas-purchase refund, not an extra transfer.
    return send * price + (execution + prepaid) * (price > minimum ? price : minimum);
}

function rpcClient(p, fetchImpl) {
    return async (method, params, allowMissing = false) => {
        let response; let body;
        try {
            response = await fetchImpl(p.rpc_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 'public-testnet-bootstrap', method, params }), signal: AbortSignal.timeout(15_000) });
            check(response.ok, 'rpc_http'); body = await response.json();
        } catch { throw new Error('bootstrap_rpc_unavailable'); }
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
    const [config, gas, parent, key, targets, governance] = await Promise.all([
        rpc('EXPERIMENTAL_protocol_config', { block_id: block.hash }), rpc('gas_price', [block.hash]),
        query('view_account', p.parent.account_id), query('view_access_key', p.parent.account_id, { public_key: p.parent.public_key }),
        Promise.all(p.accounts.map((a) => query('view_account', a.account_id))),
        Promise.all(['admin', 'guardian'].map((role) => query('view_access_key', p.roles[role], { public_key: p.governance_public_keys[role] }))),
    ]);
    check(config.protocol_version === p.expected_protocol_version && parent && parent.locked === '0', 'parent_state');
    check(key.permission === 'FullAccess' && Number.isSafeInteger(key.nonce) && key.nonce >= 0
        && governance.every((k) => k.permission === 'FullAccess'), 'signer_permission');
    const batches = p.accounts.map((a) => buildActions(p, a, ctx.wasm));
    const fees = batches.map((batch) => upfrontFee(batch, config, gas.gas_price));
    const storage = decimal(parent.storage_usage) * decimal(config.runtime_config.storage_amount_per_byte);
    const funding = p.accounts.reduce((sum, a) => sum + decimal(a.funding_yocto), 0n);
    return { block, config, parent, nonce: key.nonce, targets, fees, funding, available: decimal(parent.amount) - storage };
}

export function checkBudget(ctx, state, start = 0, alreadyQuoted = 0n) {
    const fees = state.fees.slice(start).reduce((sum, n) => sum + n, 0n);
    const remaining = ctx.policy.accounts.slice(start).reduce((sum, a) => sum + decimal(a.funding_yocto), 0n);
    check(fees + alreadyQuoted <= decimal(ctx.policy.max_upfront_fees_yocto), 'fee_budget');
    check(state.funding + fees + alreadyQuoted <= decimal(ctx.policy.max_parent_debit_yocto), 'total_budget');
    check(state.available >= remaining + fees, 'parent_balance');
}

export async function prepare(ctx, privateKeyFile, directory, fetchImpl = fetch) {
    const state = await snapshot(ctx, fetchImpl); check(state.targets.every((a) => a === null), 'existing_target_reconcile'); checkBudget(ctx, state);
    check(!existsSync(directory), 'existing_plan_reconcile');
    const keyStat = lstatSync(privateKeyFile); check(keyStat.isFile() && !keyStat.isSymbolicLink() && (keyStat.mode & 0o777) === 0o600, 'private_key_file');
    let signer;
    try { signer = KeyPairSigner.fromSecretKey(JSON.parse(readFileSync(privateKeyFile)).private_key); }
    catch { throw new Error('bootstrap_signer_key_invalid'); }
    check((await signer.getPublicKey()).toString() === ctx.policy.parent.public_key, 'signer_key_mismatch');
    mkdirSync(directory, { mode: 0o700 }); mkdirSync(resolve(directory, 'signed'), { mode: 0o700 });
    const transactions = [];
    for (const [i, a] of ctx.policy.accounts.entries()) {
        const tx = createTransaction(ctx.policy.parent.account_id, PublicKey.from(ctx.policy.parent.public_key), a.account_id,
            BigInt(state.nonce) + BigInt(i + 1), buildActions(ctx.policy, a, ctx.wasm), baseDecode(state.block.hash));
        const { txHash, signedTransaction } = await signer.signTransaction(tx);
        writeFileSync(resolve(directory, 'signed', `${a.role}.txt`), Buffer.from(encodeTransaction(signedTransaction)).toString('base64'), { flag: 'wx', mode: 0o600 });
        transactions.push({ role: a.role, receiver_id: a.account_id, nonce: tx.nonce.toString(), tx_hash: baseEncode(txHash),
            funding_yocto: a.funding_yocto, fee_quote_yocto: state.fees[i].toString(), action_types: tx.actions.map((x) => x.enum) });
    }
    const plan = { schema: 'youtick.public-testnet-bootstrap-plan.v1', source_sha: ctx.sourceSha, ci_run_id: ctx.runId,
        ci_run_attempt: ctx.attempt, policy_sha256: ctx.policyHash, parent_id: ctx.policy.parent.account_id,
        block_height: state.block.height, block_hash: state.block.hash, initial_parent_balance_yocto: state.parent.amount,
        fee_quote_total_yocto: state.fees.reduce((s, n) => s + n, 0n).toString(), transactions };
    save(resolve(directory, 'public-plan.json'), plan, true);
    return { plan, sha256: hash(readFileSync(resolve(directory, 'public-plan.json'))) };
}

async function postcheck(ctx, a, rpc) {
    const block = (await rpc('block', { finality: 'final' })).header;
    const query = (request_type, extra = {}) => rpc('query', { request_type, account_id: a.account_id, block_id: block.hash, ...extra });
    const [state, keys] = await Promise.all([query('view_account'), query('view_access_key_list')]);
    const expectedCode = ctx.wasm[a.role] ? baseEncode(Buffer.from(ctx.policy.wasm_sha256[a.role], 'hex')) : EMPTY_CODE;
    // Contract execution rewards can increase the recipient's balance above its funding.
    check(state.code_hash === expectedCode && state.locked === '0' && decimal(state.amount) >= decimal(a.funding_yocto), 'target_account_state');
    const keyView = keys.keys.map((k) => ({ public_key: k.public_key, permission: k.access_key.permission })).sort((x, y) => x.public_key.localeCompare(y.public_key));
    check(same(keyView, [...a.keys].sort((x, y) => x.public_key.localeCompare(y.public_key))), 'target_keys');
    const view = async (method_name) => {
        const r = await query('call_function', { method_name, args_base64: 'e30=' });
        check(Array.isArray(r.result), 'view_result'); return JSON.parse(Buffer.from(r.result).toString('utf8'));
    };
    let contractState;
    if (a.role === 'market') {
        const p = ctx.policy;
        const [governance, policy, quoteVersion, count, usdcBalance, nearBalance, reserve, beta] = await Promise.all([
            view('get_governance_state'), view('get_public_upload_policy'), view('get_quote_key_version'), view('get_publications_count'),
            view('get_platform_balance'), view('get_platform_near_balance'), view('get_storage_reserve_status'), view('get_public_testnet_beta_state'),
        ]);
        check(governance.state_version === 2 && governance.admin_account_id === p.roles.admin && governance.guardian_account_id === p.roles.guardian
            && governance.active_bridge_account_id === account(p, 'operator').account_id && governance.bridge_frozen === true
            && governance.new_purchases_paused === true && governance.pending_bridge_account_id === null
            && governance.bridge_rotation_proposed_at_ms === null, 'market_governance');
        check(policy?.version === 1 && policy.environment === 'public-testnet' && policy.network === 'testnet'
            && policy.market_contract_id === a.account_id && policy.max_source_bytes === '5000000000'
            && policy.job_ttl_ms === '86400000' && policy.signed_quote_required === true
            && policy.profiles.every((p) => p.profile_id === 'paid-media-livepeer-v1')
            && same(policy.profiles.map((p) => p.profile_config_sha256), PROFILE_HASHES), 'market_policy');
        check(quoteVersion === p.quote.version && count === 0 && usdcBalance === '0' && nearBalance === '0' && beta === null, 'market_empty_state');
        check(reserve.reserve_covered === true && reserve.operational_reserve_yocto === p.operational_reserve_yocto
            && decimal(state.amount) >= decimal(reserve.storage_stake_yocto) + decimal(p.operational_reserve_yocto), 'market_reserve');
        contractState = { governance, policy, quoteVersion, count, usdcBalance, nearBalance, reserve, beta };
    } else if (a.role === 'access') {
        contractState = await view('get_contract_state');
        check(contractState.state_version === 2 && contractState.owner_id === ctx.policy.roles.access_owner
            && contractState.market_contract_id === account(ctx.policy, 'market').account_id && contractState.pending_owner_id === null
            && contractState.paused === false && contractState.grant_issuance_enabled === true, 'access_state');
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
    const plan = JSON.parse(planBytes); const p = ctx.policy;
    check(plan.schema === 'youtick.public-testnet-bootstrap-plan.v1' && plan.policy_sha256 === ctx.policyHash
        && plan.source_sha === ctx.sourceSha && plan.ci_run_id === ctx.runId && plan.ci_run_attempt === ctx.attempt
        && plan.parent_id === p.parent.account_id && plan.transactions.length === 4, 'plan_identity');
    const output = resolve(directory, 'receipt.json'); check(!existsSync(output), 'existing_receipt_reconcile');
    const receipt = { schema: 'youtick.public-testnet-bootstrap-receipt.v1', source_sha: ctx.sourceSha, policy_sha256: ctx.policyHash,
        plan_sha256: planHash, status: 'IN_PROGRESS', transactions: [] };
    save(output, receipt, true);
    const rpc = rpcClient(p, fetchImpl); let quoted = 0n;
    try {
        for (const [i, a] of p.accounts.entries()) {
            const state = await snapshot(ctx, fetchImpl);
            check(state.targets.slice(i).every((x) => x === null), 'existing_target_reconcile');
            check(state.block.height >= plan.block_height && state.block.height - plan.block_height <= 300, 'plan_expired');
            checkBudget(ctx, state, i, quoted);
            const t = plan.transactions[i];
            check(t.role === a.role && t.receiver_id === a.account_id && BigInt(state.nonce) + 1n === decimal(t.nonce), 'nonce_or_target_changed');
            const encoded = readFileSync(resolve(directory, 'signed', `${a.role}.txt`), 'utf8');
            const signed = decodeSignedTransaction(Buffer.from(encoded, 'base64'));
            const expected = createTransaction(p.parent.account_id, PublicKey.from(p.parent.public_key), a.account_id,
                decimal(t.nonce), buildActions(p, a, ctx.wasm), baseDecode(plan.block_hash));
            const bytes = encodeTransaction(expected);
            check(Buffer.from(encodeTransaction(signed.transaction)).equals(Buffer.from(bytes))
                && baseEncode(Buffer.from(hash(bytes), 'hex')) === t.tx_hash, 'signed_transaction_changed');
            const record = { ...t, status: 'SUBMITTING', latest_fee_quote_yocto: state.fees[i].toString() };
            receipt.transactions.push(record); save(output, receipt);
            console.log(JSON.stringify({ event: 'bootstrap_before_send', role: a.role, tx_hash: t.tx_hash }));
            let result;
            try { result = await rpc('send_tx', { signed_tx_base64: encoded, wait_until: 'FINAL' }); }
            catch { result = null; }
            result = await finalTransaction(rpc, t.tx_hash, p.parent.account_id, result, pause);
            if (!result) { record.status = 'AMBIGUOUS'; receipt.status = 'AMBIGUOUS'; save(output, receipt); return receipt; }
            check(result.transaction?.hash === t.tx_hash && result.transaction.signer_id === p.parent.account_id
                && result.transaction.receiver_id === a.account_id, 'transaction_identity');
            const outcomes = [result.transaction_outcome, ...(result.receipts_outcome ?? [])];
            check(!result.status?.Failure && Object.hasOwn(result.status ?? {}, 'SuccessValue')
                && outcomes.every((o) => o?.outcome?.status && !Object.hasOwn(o.outcome.status, 'Failure')), 'transaction_failed');
            record.status = 'FINAL'; record.final_result = result; save(output, receipt);
            record.postcheck = await postcheck(ctx, a, rpc); record.status = 'VERIFIED';
            const parent = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: p.parent.account_id });
            const debit = decimal(plan.initial_parent_balance_yocto) - decimal(parent.amount);
            check(debit >= 0n && debit <= decimal(p.max_parent_debit_yocto), 'observed_debit_limit');
            receipt.observed_parent_debit_yocto = debit.toString(); quoted += state.fees[i]; save(output, receipt);
        }
        receipt.status = 'PASS'; save(output, receipt); return receipt;
    } catch (error) {
        receipt.status = 'FAILED_RECONCILE_REQUIRED'; receipt.error = error.message?.startsWith('bootstrap_') ? error.message : 'bootstrap_unexpected_error';
        save(output, receipt); throw new Error(receipt.error);
    }
}

const main = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (main) {
    try {
        const [command, artifactDir, sourceSha, runId, attempt, policyHash, ...extra] = process.argv.slice(2);
        check(['verify', 'preflight', 'prepare', 'execute'].includes(command), 'command');
        const ctx = await loadInputs(artifactDir, sourceSha, runId, attempt, policyHash);
        if (command === 'verify') { check(extra.length === 0, 'arguments'); console.log(JSON.stringify({ status: 'PASS', policy_sha256: policyHash })); }
        if (command === 'preflight') {
            check(extra.length === 0, 'arguments'); const state = await snapshot(ctx); check(state.targets.every((a) => a === null), 'existing_target_reconcile'); checkBudget(ctx, state);
            console.log(JSON.stringify({ status: 'PASS', block_height: state.block.height, available_yocto: state.available.toString(), funding_yocto: state.funding.toString(), fee_quotes_yocto: state.fees.map(String) }));
        }
        if (command === 'prepare') { check(extra.length === 2, 'arguments'); const r = await prepare(ctx, extra[0], extra[1]); console.log(JSON.stringify({ plan_sha256: r.sha256, transactions: r.plan.transactions })); }
        if (command === 'execute') { check(extra.length === 2 && process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === '4rmus/youtick', 'protected_workflow_required'); const r = await execute(ctx, extra[0], extra[1]); console.log(JSON.stringify({ status: r.status })); if (r.status !== 'PASS') process.exitCode = 1; }
    } catch (error) { console.error(error.message?.startsWith('bootstrap_') ? error.message : 'bootstrap_failed'); process.exitCode = 1; }
}
