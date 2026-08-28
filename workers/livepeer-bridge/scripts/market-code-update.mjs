import { createHash } from 'node:crypto';
import {
    copyFile,
    lstat,
    mkdir,
    readFile,
    readdir,
    writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ARTIFACT_SCHEMA = 'youtick.testnet-market-runtime-artifact.v1';
const EVIDENCE_SCHEMA = 'youtick.testnet-market-code-update.v1';
const POLICY_SCHEMA = 'youtick.testnet-market-code-update-policy.v1';
const TARGET_CONTRACT_ID = 'lp-arch-market-v2-260809.youtick-dev-v3.testnet';
const ARTIFACT_FILES = [
    'SHA256SUMS',
    'manifest.json',
    'youtick_nft.wasm',
    'youtick_nft_abi.json',
];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const RPC_TIMEOUT_MS = 10_000;

export async function createMarketRuntimeArtifact({
    wasmPath,
    abiPath,
    lockfilePath,
    outputDir,
    sourceSha,
    runId,
    runAttempt,
}) {
    requireGitSha(sourceSha);
    requirePositiveInteger(runId, 'market_artifact_run_id_invalid');
    requirePositiveInteger(runAttempt, 'market_artifact_run_attempt_invalid');
    const [wasm, abi, lockfile] = await Promise.all([
        readFile(wasmPath),
        readFile(abiPath),
        readFile(lockfilePath),
    ]);
    if (wasm.length === 0) throw new Error('market_artifact_wasm_empty');
    parseJsonObject(abi, 'market_artifact_abi_invalid');

    await mkdir(outputDir, { recursive: true });
    const wasmName = 'youtick_nft.wasm';
    const abiName = 'youtick_nft_abi.json';
    await Promise.all([
        copyFile(wasmPath, resolve(outputDir, wasmName)),
        copyFile(abiPath, resolve(outputDir, abiName)),
    ]);

    const wasmSha256 = sha256(wasm);
    const abiSha256 = sha256(abi);
    const manifest = {
        schema: ARTIFACT_SCHEMA,
        source_sha: sourceSha,
        ci: {
            run_id: String(runId),
            run_attempt: String(runAttempt),
        },
        target: {
            network: 'testnet',
            contract_id: TARGET_CONTRACT_ID,
            operation: 'CODE_UPDATE_ONLY',
        },
        toolchain: {
            rust: '1.86.0',
            cargo_near: '0.17.0',
            lockfile_sha256: sha256(lockfile),
        },
        files: {
            wasm: {
                name: wasmName,
                bytes: wasm.length,
                sha256: wasmSha256,
                code_hash: base58Encode(Buffer.from(wasmSha256, 'hex')),
            },
            abi: {
                name: abiName,
                bytes: abi.length,
                sha256: abiSha256,
            },
        },
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(resolve(outputDir, 'manifest.json'), manifestBytes);
    await writeFile(resolve(outputDir, 'SHA256SUMS'), [
        `${wasmSha256}  ${wasmName}`,
        `${abiSha256}  ${abiName}`,
        `${sha256(manifestBytes)}  manifest.json`,
        '',
    ].join('\n'));
    return manifest;
}

export async function verifyMarketRuntimeArtifact({
    artifactDir,
    sourceSha,
    runId,
    runAttempt,
}) {
    requireGitSha(sourceSha);
    requirePositiveInteger(runId, 'market_artifact_run_id_invalid');
    requirePositiveInteger(runAttempt, 'market_artifact_run_attempt_invalid');
    const names = (await readdir(artifactDir)).sort();
    if (JSON.stringify(names) !== JSON.stringify(ARTIFACT_FILES)) {
        throw new Error('market_artifact_file_set_invalid');
    }
    const entries = await Promise.all(ARTIFACT_FILES.map((name) => lstat(resolve(artifactDir, name))));
    if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
        throw new Error('market_artifact_file_type_invalid');
    }
    const [wasm, abi, manifestBytes, sums] = await Promise.all([
        readFile(resolve(artifactDir, 'youtick_nft.wasm')),
        readFile(resolve(artifactDir, 'youtick_nft_abi.json')),
        readFile(resolve(artifactDir, 'manifest.json')),
        readFile(resolve(artifactDir, 'SHA256SUMS'), 'utf8'),
    ]);
    const manifest = parseJsonObject(manifestBytes, 'market_artifact_manifest_invalid');
    assertExactKeys(manifest, ['schema', 'source_sha', 'ci', 'target', 'toolchain', 'files']);
    assertExactKeys(manifest.ci, ['run_id', 'run_attempt']);
    assertExactKeys(manifest.target, ['network', 'contract_id', 'operation']);
    assertExactKeys(manifest.toolchain, ['rust', 'cargo_near', 'lockfile_sha256']);
    assertExactKeys(manifest.files, ['wasm', 'abi']);
    assertExactKeys(manifest.files.wasm, ['name', 'bytes', 'sha256', 'code_hash']);
    assertExactKeys(manifest.files.abi, ['name', 'bytes', 'sha256']);

    if (manifest.schema !== ARTIFACT_SCHEMA
        || manifest.source_sha !== sourceSha
        || manifest.ci.run_id !== String(runId)
        || manifest.ci.run_attempt !== String(runAttempt)
        || manifest.target.network !== 'testnet'
        || manifest.target.contract_id !== TARGET_CONTRACT_ID
        || manifest.target.operation !== 'CODE_UPDATE_ONLY'
        || manifest.toolchain.rust !== '1.86.0'
        || manifest.toolchain.cargo_near !== '0.17.0'
        || !SHA256_PATTERN.test(manifest.toolchain.lockfile_sha256)
        || manifest.files.wasm.name !== 'youtick_nft.wasm'
        || manifest.files.abi.name !== 'youtick_nft_abi.json') {
        throw new Error('market_artifact_manifest_mismatch');
    }
    parseJsonObject(abi, 'market_artifact_abi_invalid');
    const wasmSha256 = sha256(wasm);
    const abiSha256 = sha256(abi);
    if (wasm.length === 0
        || manifest.files.wasm.bytes !== wasm.length
        || manifest.files.wasm.sha256 !== wasmSha256
        || manifest.files.wasm.code_hash !== base58Encode(Buffer.from(wasmSha256, 'hex'))
        || manifest.files.abi.bytes !== abi.length
        || manifest.files.abi.sha256 !== abiSha256) {
        throw new Error('market_artifact_content_mismatch');
    }
    const expectedSums = [
        `${wasmSha256}  youtick_nft.wasm`,
        `${abiSha256}  youtick_nft_abi.json`,
        `${sha256(manifestBytes)}  manifest.json`,
        '',
    ].join('\n');
    if (sums !== expectedSums) throw new Error('market_artifact_checksums_invalid');
    return { manifest, wasm };
}

export async function runMarketCodeUpdate({
    artifactDir,
    policyPath,
    rpcUrl,
    sourceSha,
    runId,
    runAttempt,
    expectedWasmSha256,
    expectedStateSha256,
    privateKey,
    fetchImpl = fetch,
    derivePublicKeyImpl = derivePublicKey,
    deployImpl = deployContractCode,
    now = () => Date.now(),
}) {
    if (!SHA256_PATTERN.test(expectedWasmSha256 || '')) {
        throw new Error('market_code_update_expected_wasm_invalid');
    }
    if (!SHA256_PATTERN.test(expectedStateSha256 || '')) {
        throw new Error('market_code_update_expected_state_invalid');
    }
    const validatedRpcUrl = requireRpcUrl(rpcUrl);
    const { manifest, wasm } = await verifyMarketRuntimeArtifact({
        artifactDir,
        sourceSha,
        runId,
        runAttempt,
    });
    if (manifest.files.wasm.sha256 !== expectedWasmSha256) {
        throw new Error('market_code_update_wasm_ack_mismatch');
    }
    const policy = await readPolicy(policyPath);
    let deployPublicKey;
    try {
        deployPublicKey = await derivePublicKeyImpl(privateKey);
    } catch {
        throw new Error('market_code_update_deploy_key_invalid');
    }
    if (deployPublicKey !== policy.deploy_public_key) {
        throw new Error('market_code_update_deploy_key_mismatch');
    }

    const before = await readRuntimeSnapshot(policy, validatedRpcUrl, deployPublicKey, fetchImpl);
    assertRuntimeSnapshot(
        before,
        policy,
        policy.expected_current_code_hash,
        policy.expected_current_wasm_bytes,
    );
    if (before.state_sha256 !== expectedStateSha256) {
        throw new Error('market_code_update_state_ack_mismatch');
    }
    if (manifest.files.wasm.code_hash === before.code_hash) {
        throw new Error('market_code_update_already_current');
    }
    const codeGrowth = Math.max(0, manifest.files.wasm.bytes - before.code_bytes);
    const storageGrowthCost = BigInt(codeGrowth) * BigInt(before.storage_reserve.storage_byte_cost_yocto);
    const requiredHeadroom = storageGrowthCost + BigInt(policy.max_deploy_cost_yocto);
    if (BigInt(before.storage_reserve.reserve_headroom_yocto) < requiredHeadroom) {
        throw new Error('market_code_update_reserve_insufficient');
    }

    let transaction;
    try {
        transaction = await deployImpl({
            rpcUrl: validatedRpcUrl,
            targetContractId: policy.target_contract_id,
            privateKey,
            wasmBytes: wasm,
        });
    } catch (error) {
        const failure = broadcastFailure(error);
        const reconciled = await bestEffortRuntimeSnapshot(
            policy,
            validatedRpcUrl,
            deployPublicKey,
            fetchImpl,
        );
        const code = reconciled?.code_hash === manifest.files.wasm.code_hash
            && reconciled?.state_sha256 === before.state_sha256
            ? 'market_code_update_reconcile_required'
            : 'market_code_update_ambiguous';
        throw evidenceError(code, {
            status: code === 'market_code_update_reconcile_required'
                ? 'RECONCILE_REQUIRED'
                : 'AMBIGUOUS',
            sourceSha,
            runId,
            runAttempt,
            policy,
            before,
            after: reconciled,
            transaction: failure.transactionHash
                ? { transaction: { hash: failure.transactionHash } }
                : null,
            broadcastErrorCode: failure.code,
            providerErrorCode: failure.providerErrorCode,
            now,
        });
    }

    let after;
    try {
        after = await readRuntimeSnapshot(policy, validatedRpcUrl, deployPublicKey, fetchImpl);
        assertRuntimeSnapshot(after, policy, manifest.files.wasm.code_hash, manifest.files.wasm.bytes);
        if (after.state_sha256 !== before.state_sha256
            || after.platform_balance !== before.platform_balance
            || after.platform_near_balance !== before.platform_near_balance
            || after.publication_count !== before.publication_count) {
            throw new Error('market_code_update_state_changed');
        }
        if (!transactionHash(transaction)) throw new Error('market_code_update_receipt_invalid');
    } catch (error) {
        const observed = after || await bestEffortRuntimeSnapshot(
            policy,
            validatedRpcUrl,
            deployPublicKey,
            fetchImpl,
        );
        const code = error instanceof Error ? error.message : 'market_code_update_postcheck_failed';
        throw evidenceError(code, {
            status: 'POSTCHECK_FAILED',
            sourceSha,
            runId,
            runAttempt,
            policy,
            before,
            after: observed,
            transaction,
            now,
        });
    }
    return updateEvidence({
        status: 'PASS',
        sourceSha,
        runId,
        runAttempt,
        policy,
        before,
        after,
        transaction,
        now,
    });
}

async function readPolicy(path) {
    const policy = parseJsonObject(await readFile(path), 'market_code_update_policy_invalid');
    assertExactKeys(policy, [
        'schema', 'network', 'target_contract_id', 'access_contract_id',
        'bridge_operator_account_id', 'deploy_public_key', 'expected_current_code_hash',
        'expected_current_wasm_bytes', 'max_deploy_cost_yocto',
        'expected_governance', 'expected_quote_key_version', 'expected_usdc_contract_id',
        'expected_access_state', 'expected_bridge_key',
    ]);
    assertExactKeys(policy.expected_governance, [
        'state_version', 'admin_account_id', 'guardian_account_id',
        'active_bridge_account_id', 'pending_bridge_account_id', 'bridge_frozen',
        'new_purchases_paused', 'bridge_rotation_proposed_at_ms',
    ]);
    assertExactKeys(policy.expected_access_state, [
        'state_version', 'owner_id', 'pending_owner_id', 'market_contract_id',
        'paused', 'grant_issuance_enabled',
    ]);
    assertExactKeys(policy.expected_bridge_key, [
        'public_key', 'allowance', 'receiver_id', 'method_names',
    ]);
    if (policy.schema !== POLICY_SCHEMA
        || policy.network !== 'testnet'
        || policy.target_contract_id !== TARGET_CONTRACT_ID
        || typeof policy.access_contract_id !== 'string'
        || typeof policy.bridge_operator_account_id !== 'string'
        || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(policy.deploy_public_key)
        || !/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(policy.expected_current_code_hash)
        || !Number.isSafeInteger(policy.expected_current_wasm_bytes)
        || policy.expected_current_wasm_bytes < 1
        || !POSITIVE_INTEGER_PATTERN.test(policy.max_deploy_cost_yocto || '')
        || !Number.isSafeInteger(policy.expected_quote_key_version)
        || !POSITIVE_INTEGER_PATTERN.test(policy.expected_bridge_key.allowance || '')
        || !Array.isArray(policy.expected_bridge_key.method_names)
        || policy.expected_bridge_key.method_names.length === 0) {
        throw new Error('market_code_update_policy_invalid');
    }
    return policy;
}

async function readRuntimeSnapshot(policy, rpcUrl, deployPublicKey, fetchImpl) {
    const block = await rpc(rpcUrl, 'block', { finality: 'final' }, fetchImpl);
    const blockHeight = block.header?.height;
    const blockHash = block.header?.hash;
    if (!Number.isSafeInteger(blockHeight)
        || blockHeight < 1
        || typeof blockHash !== 'string'
        || !/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(blockHash)) {
        throw new Error('market_code_update_rpc_invalid');
    }
    const [
        account,
        code,
        state,
        targetKeys,
        governance,
        quoteKeyVersion,
        usdcContractId,
        platformBalance,
        platformNearBalance,
        publicationCount,
        storageReserve,
        accessState,
        bridgeKeys,
    ] = await Promise.all([
        query(rpcUrl, { request_type: 'view_account', account_id: policy.target_contract_id }, fetchImpl, blockHash),
        query(rpcUrl, {
            request_type: 'view_code',
            account_id: policy.target_contract_id,
        }, fetchImpl, blockHash),
        query(rpcUrl, {
            request_type: 'view_state',
            account_id: policy.target_contract_id,
            prefix_base64: '',
            include_proof: false,
        }, fetchImpl, blockHash),
        query(rpcUrl, {
            request_type: 'view_access_key_list',
            account_id: policy.target_contract_id,
        }, fetchImpl, blockHash),
        view(rpcUrl, policy.target_contract_id, 'get_governance_state', fetchImpl, blockHash),
        view(rpcUrl, policy.target_contract_id, 'get_quote_key_version', fetchImpl, blockHash),
        view(rpcUrl, policy.target_contract_id, 'get_usdc_contract_id', fetchImpl, blockHash),
        view(rpcUrl, policy.target_contract_id, 'get_platform_balance', fetchImpl, blockHash),
        view(rpcUrl, policy.target_contract_id, 'get_platform_near_balance', fetchImpl, blockHash),
        view(rpcUrl, policy.target_contract_id, 'get_publications_count', fetchImpl, blockHash),
        view(rpcUrl, policy.target_contract_id, 'get_storage_reserve_status', fetchImpl, blockHash),
        view(rpcUrl, policy.access_contract_id, 'get_contract_state', fetchImpl, blockHash),
        query(rpcUrl, {
            request_type: 'view_access_key_list',
            account_id: policy.bridge_operator_account_id,
        }, fetchImpl, blockHash),
    ]);
    if (typeof code.code_base64 !== 'string') throw new Error('market_code_update_code_invalid');
    const codeBytes = Buffer.from(code.code_base64, 'base64');
    if (codeBytes.length === 0
        || base58Encode(Buffer.from(sha256(codeBytes), 'hex')) !== account.code_hash) {
        throw new Error('market_code_update_code_invalid');
    }
    if (!Array.isArray(state.values)) throw new Error('market_code_update_state_invalid');
    const stateRows = state.values.map((row) => {
        if (!row || typeof row.key !== 'string' || typeof row.value !== 'string') {
            throw new Error('market_code_update_state_invalid');
        }
        return `${row.key}\n${row.value}`;
    }).sort();
    const fullAccessKeys = Array.isArray(targetKeys.keys)
        ? targetKeys.keys.filter((entry) => entry?.access_key?.permission === 'FullAccess')
        : [];
    if (fullAccessKeys.length !== 1 || fullAccessKeys[0].public_key !== deployPublicKey) {
        throw new Error('market_code_update_deploy_key_set_mismatch');
    }
    return {
        block_height: blockHeight,
        block_hash: blockHash,
        code_hash: account.code_hash,
        code_bytes: codeBytes.length,
        state_sha256: sha256(Buffer.from(`${stateRows.join('\n')}\n`)),
        governance,
        quote_key_version: quoteKeyVersion,
        usdc_contract_id: usdcContractId,
        platform_balance: platformBalance,
        platform_near_balance: platformNearBalance,
        publication_count: publicationCount,
        storage_reserve: storageReserve,
        access_state: accessState,
        bridge_keys: bridgeKeys.keys,
    };
}

function assertRuntimeSnapshot(snapshot, policy, expectedCodeHash, expectedCodeBytes) {
    if (!Number.isSafeInteger(snapshot.block_height)
        || snapshot.block_height < 1
        || snapshot.code_hash !== expectedCodeHash
        || snapshot.code_bytes !== expectedCodeBytes
        || JSON.stringify(snapshot.governance) !== JSON.stringify(policy.expected_governance)
        || snapshot.quote_key_version !== policy.expected_quote_key_version
        || snapshot.usdc_contract_id !== policy.expected_usdc_contract_id
        || !/^[0-9]+$/.test(snapshot.platform_balance || '')
        || !/^[0-9]+$/.test(snapshot.platform_near_balance || '')
        || !Number.isSafeInteger(snapshot.publication_count)
        || snapshot.publication_count < 0
        || !validStorageReserve(snapshot.storage_reserve)
        || JSON.stringify(snapshot.access_state) !== JSON.stringify(policy.expected_access_state)) {
        throw new Error('market_code_update_runtime_mismatch');
    }
    const expected = policy.expected_bridge_key;
    const matching = Array.isArray(snapshot.bridge_keys) && snapshot.bridge_keys.some((entry) => {
        const permission = entry?.access_key?.permission?.FunctionCall;
        return entry.public_key === expected.public_key
            && permission?.receiver_id === expected.receiver_id
            && JSON.stringify([...(permission.method_names || [])].sort())
                === JSON.stringify([...expected.method_names].sort())
            && permission.allowance === expected.allowance;
    });
    if (!matching) throw new Error('market_code_update_bridge_key_mismatch');
}

function validStorageReserve(value) {
    const expectedKeys = [
        'storage_usage_bytes', 'storage_byte_cost_yocto', 'storage_stake_yocto',
        'operational_reserve_yocto', 'account_balance_yocto',
        'reserve_headroom_yocto', 'reserve_runway_bytes', 'reserve_covered',
    ];
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys.sort())
        || value.reserve_covered !== true) {
        return false;
    }
    const numericKeys = expectedKeys.filter((key) => !['reserve_covered'].includes(key));
    if (numericKeys.some((key) => !/^[0-9]+$/.test(value[key] || ''))
        || !POSITIVE_INTEGER_PATTERN.test(value.storage_byte_cost_yocto)) {
        return false;
    }
    const usage = BigInt(value.storage_usage_bytes);
    const byteCost = BigInt(value.storage_byte_cost_yocto);
    const stake = usage * byteCost;
    const protectedBalance = stake + BigInt(value.operational_reserve_yocto);
    const accountBalance = BigInt(value.account_balance_yocto);
    if (stake !== BigInt(value.storage_stake_yocto) || accountBalance < protectedBalance) {
        return false;
    }
    const headroom = accountBalance - protectedBalance;
    return headroom === BigInt(value.reserve_headroom_yocto)
        && headroom / byteCost === BigInt(value.reserve_runway_bytes);
}

async function bestEffortRuntimeSnapshot(policy, rpcUrl, deployPublicKey, fetchImpl) {
    try {
        return await readRuntimeSnapshot(policy, rpcUrl, deployPublicKey, fetchImpl);
    } catch {
        return null;
    }
}

class MarketCodeUpdateError extends Error {
    constructor(code, evidence) {
        super(code);
        this.evidence = evidence;
    }
}

class MarketCodeBroadcastError extends Error {
    constructor(code, transactionHash = null, providerErrorCode = 'rpc_error') {
        super('market_code_update_broadcast_failed');
        this.broadcastErrorCode = code;
        this.transactionHash = transactionHash;
        this.providerErrorCode = providerErrorCode;
    }
}

function broadcastFailure(error) {
    const allowed = [
        'transaction_prepare_failed',
        'transaction_submit_failed',
        'transaction_execution_failed',
    ];
    const providerAllowed = [
        'rpc_http_408',
        'rpc_http_429',
        'rpc_http_500',
        'rpc_http_502',
        'rpc_http_503',
        'rpc_invalid_nonce',
        'rpc_invalid_request',
        'rpc_method_not_found',
        'rpc_timeout',
        'rpc_transport_error',
        'transaction_execution_failed',
    ];
    return {
        code: allowed.includes(error?.broadcastErrorCode)
            ? error.broadcastErrorCode
            : 'transaction_error_unclassified',
        providerErrorCode: providerAllowed.includes(error?.providerErrorCode)
            ? error.providerErrorCode
            : 'rpc_error',
        transactionHash: transactionHash({ transaction: { hash: error?.transactionHash } }),
    };
}

function evidenceError(code, input) {
    return new MarketCodeUpdateError(code, updateEvidence({
        ...input,
        errorCode: code,
    }));
}

function updateEvidence({
    status,
    errorCode = null,
    broadcastErrorCode = null,
    providerErrorCode = null,
    sourceSha,
    runId,
    runAttempt,
    policy,
    before,
    after,
    transaction,
    now,
}) {
    const observed = after || before;
    return {
        schema: EVIDENCE_SCHEMA,
        status,
        error_code: errorCode,
        broadcast_error_code: broadcastErrorCode,
        provider_error_code: providerErrorCode,
        source_sha: sourceSha,
        ci_run_id: String(runId),
        ci_run_attempt: String(runAttempt),
        target_contract_id: policy.target_contract_id,
        before_code_hash: before.code_hash,
        before_code_bytes: before.code_bytes,
        before_state_sha256: before.state_sha256,
        before_reserve: reserveEvidence(before),
        after_code_hash: after?.code_hash || null,
        after_code_bytes: after?.code_bytes || null,
        state_sha256: after?.state_sha256 || null,
        after_reserve: after ? reserveEvidence(after) : null,
        final_block_height: String(observed.block_height),
        final_block_hash: observed.block_hash,
        transaction_hash: transactionHash(transaction),
        observed_at_ms: now(),
    };
}

function reserveEvidence(snapshot) {
    if (!validStorageReserve(snapshot?.storage_reserve)) return null;
    return {
        account_balance_yocto: snapshot.storage_reserve.account_balance_yocto,
        storage_usage_bytes: snapshot.storage_reserve.storage_usage_bytes,
        reserve_headroom_yocto: snapshot.storage_reserve.reserve_headroom_yocto,
        reserve_runway_bytes: snapshot.storage_reserve.reserve_runway_bytes,
    };
}

async function derivePublicKey(privateKey) {
    if (typeof privateKey !== 'string' || privateKey.length < 80 || /[\r\n]/.test(privateKey)) {
        throw new Error('invalid');
    }
    const { KeyPairSigner } = await import('near-api-js');
    return (await KeyPairSigner.fromSecretKey(privateKey).getPublicKey()).toString();
}

async function deployContractCode({ rpcUrl, targetContractId, privateKey, wasmBytes }) {
    const {
        Account,
        JsonRpcProvider,
        KeyPairSigner,
        actions,
        encodeTransaction,
    } = await import('near-api-js');
    const provider = new JsonRpcProvider({ url: rpcUrl }, { retries: 1 });
    const signer = KeyPairSigner.fromSecretKey(privateKey);
    const account = new Account(targetContractId, provider, signer);
    let signedTransaction;
    try {
        signedTransaction = await account.createSignedTransaction({
            receiverId: targetContractId,
            actions: [actions.deployContract(wasmBytes)],
        });
    } catch (error) {
        throw new MarketCodeBroadcastError(
            'transaction_prepare_failed',
            null,
            safeProviderErrorCode(error),
        );
    }
    const signedTransactionHash = base58Encode(Buffer.from(
        sha256(encodeTransaction(signedTransaction)),
        'hex',
    ));
    let transaction;
    try {
        transaction = await provider.sendTransactionUntil(signedTransaction, 'FINAL');
    } catch (error) {
        throw new MarketCodeBroadcastError(
            'transaction_submit_failed',
            signedTransactionHash,
            safeProviderErrorCode(error),
        );
    }
    if (typeof transaction?.status === 'object'
        && transaction.status !== null
        && Object.hasOwn(transaction.status, 'Failure')) {
        throw new MarketCodeBroadcastError(
            'transaction_execution_failed',
            signedTransactionHash,
            'transaction_execution_failed',
        );
    }
    return transaction;
}

function safeProviderErrorCode(error) {
    const status = Number(error?.cause);
    if ([408, 429, 500, 502, 503].includes(status)) return `rpc_http_${status}`;
    const kinds = [error?.name, error?.constructor?.name, error?.type]
        .filter((value) => typeof value === 'string');
    if (kinds.some((value) => value.includes('Nonce'))) return 'rpc_invalid_nonce';
    if (kinds.some((value) => /Invalid|Validation|Expired|SizeExceeded|Signature/.test(value))) {
        return 'rpc_invalid_request';
    }
    if (kinds.some((value) => value.includes('MethodNotFound'))) return 'rpc_method_not_found';
    if (kinds.some((value) => value.includes('Timeout'))) return 'rpc_timeout';
    if (kinds.some((value) => value === 'TypeError' || value === 'FetchError')) {
        return 'rpc_transport_error';
    }
    return 'rpc_error';
}

async function query(rpcUrl, params, fetchImpl, blockId) {
    return rpc(rpcUrl, 'query', {
        ...(blockId ? { block_id: blockId } : { finality: 'final' }),
        ...params,
    }, fetchImpl);
}

async function view(rpcUrl, accountId, methodName, fetchImpl, blockId) {
    const result = await query(rpcUrl, {
        request_type: 'call_function',
        account_id: accountId,
        method_name: methodName,
        args_base64: 'e30=',
    }, fetchImpl, blockId);
    if (!Array.isArray(result.result)) throw new Error('market_code_update_rpc_invalid');
    try {
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result)));
    } catch {
        throw new Error('market_code_update_rpc_invalid');
    }
}

let rpcId = 0;
async function rpc(url, method, params, fetchImpl) {
    const id = `market-code-update-${rpcId += 1}`;
    let response;
    let payload;
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
            signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
        });
        payload = await response.json();
    } catch {
        throw new Error('market_code_update_rpc_unavailable');
    }
    if (!response.ok
        || payload?.jsonrpc !== '2.0'
        || payload?.id !== id
        || payload?.error
        || !payload?.result
        || typeof payload.result !== 'object') {
        throw new Error('market_code_update_rpc_invalid');
    }
    return payload.result;
}

function transactionHash(value) {
    const hash = value?.transaction?.hash || value?.transaction_outcome?.id || null;
    return typeof hash === 'string' && /^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(hash)
        ? hash
        : null;
}

function parseJsonObject(bytes, code) {
    try {
        const value = JSON.parse(Buffer.from(bytes).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
        return value;
    } catch {
        throw new Error(code);
    }
}

function assertExactKeys(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
        throw new Error('market_artifact_manifest_invalid');
    }
}

function requireGitSha(value) {
    if (!GIT_SHA_PATTERN.test(value || '')) throw new Error('market_artifact_source_sha_invalid');
}

function requirePositiveInteger(value, code) {
    if (!POSITIVE_INTEGER_PATTERN.test(String(value || ''))) throw new Error(code);
}

function requireRpcUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('market_code_update_rpc_url_invalid');
    }
    if (url.protocol !== 'https:'
        || url.username
        || url.password
        || url.hash
        || !url.hostname) {
        throw new Error('market_code_update_rpc_url_invalid');
    }
    return url.toString();
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function base58Encode(bytes) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let value = BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
    let encoded = '';
    while (value > 0n) {
        encoded = `${alphabet[Number(value % 58n)]}${encoded}`;
        value /= 58n;
    }
    for (const byte of bytes) {
        if (byte !== 0) break;
        encoded = `1${encoded}`;
    }
    return encoded || '1';
}

function parseArgs(tokens) {
    const [command, ...rest] = tokens;
    const options = {};
    for (let index = 0; index < rest.length; index += 2) {
        const name = rest[index];
        const value = rest[index + 1];
        if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) {
            throw new Error('market_code_update_cli_invalid');
        }
        const key = name.slice(2);
        if (Object.hasOwn(options, key)) throw new Error('market_code_update_cli_invalid');
        options[key] = value;
    }
    return { command, options };
}

function option(options, name) {
    const value = options[name]?.trim();
    if (!value) throw new Error(`market_code_update_${name.replaceAll('-', '_')}_missing`);
    return value;
}

function assertOnlyOptions(options, allowed) {
    if (Object.keys(options).some((name) => !allowed.includes(name))) {
        throw new Error('market_code_update_cli_invalid');
    }
}

const isMain = process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
    try {
        const { command, options } = parseArgs(process.argv.slice(2));
        if (command === 'artifact') {
            assertOnlyOptions(options, [
                'wasm', 'abi', 'lockfile', 'output-dir', 'sha', 'run-id', 'run-attempt',
            ]);
            const manifest = await createMarketRuntimeArtifact({
                wasmPath: option(options, 'wasm'),
                abiPath: option(options, 'abi'),
                lockfilePath: option(options, 'lockfile'),
                outputDir: option(options, 'output-dir'),
                sourceSha: option(options, 'sha'),
                runId: option(options, 'run-id'),
                runAttempt: option(options, 'run-attempt'),
            });
            console.log(JSON.stringify({
                schema: manifest.schema,
                source_sha: manifest.source_sha,
                wasm_sha256: manifest.files.wasm.sha256,
            }));
        } else if (command === 'snapshot') {
            assertOnlyOptions(options, ['policy']);
            const policy = await readPolicy(option(options, 'policy'));
            const rpcUrl = requireRpcUrl(process.env.NEAR_RPC_URL);
            const snapshot = await readRuntimeSnapshot(
                policy,
                rpcUrl,
                policy.deploy_public_key,
                fetch,
            );
            assertRuntimeSnapshot(
                snapshot,
                policy,
                policy.expected_current_code_hash,
                policy.expected_current_wasm_bytes,
            );
            console.log(JSON.stringify({
                schema: POLICY_SCHEMA,
                target_contract_id: policy.target_contract_id,
                block_height: String(snapshot.block_height),
                block_hash: snapshot.block_hash,
                code_hash: snapshot.code_hash,
                state_sha256: snapshot.state_sha256,
                new_purchases_paused: snapshot.governance.new_purchases_paused,
                platform_balance: snapshot.platform_balance,
                platform_near_balance: snapshot.platform_near_balance,
                publication_count: snapshot.publication_count,
                reserve_runway_bytes: snapshot.storage_reserve.reserve_runway_bytes,
            }));
        } else if (command === 'verify-artifact') {
            assertOnlyOptions(options, ['artifact-dir', 'sha', 'run-id', 'run-attempt']);
            const { manifest } = await verifyMarketRuntimeArtifact({
                artifactDir: option(options, 'artifact-dir'),
                sourceSha: option(options, 'sha'),
                runId: option(options, 'run-id'),
                runAttempt: option(options, 'run-attempt'),
            });
            console.log(JSON.stringify({
                schema: manifest.schema,
                source_sha: manifest.source_sha,
                wasm_sha256: manifest.files.wasm.sha256,
            }));
        } else if (command === 'deploy') {
            assertOnlyOptions(options, [
                'artifact-dir', 'policy', 'sha', 'run-id', 'run-attempt',
                'expected-wasm-sha256', 'expected-state-sha256', 'output',
            ]);
            const output = option(options, 'output');
            let evidence;
            try {
                evidence = await runMarketCodeUpdate({
                    artifactDir: option(options, 'artifact-dir'),
                    policyPath: option(options, 'policy'),
                    rpcUrl: process.env.NEAR_RPC_URL,
                    sourceSha: option(options, 'sha'),
                    runId: option(options, 'run-id'),
                    runAttempt: option(options, 'run-attempt'),
                    expectedWasmSha256: option(options, 'expected-wasm-sha256'),
                    expectedStateSha256: option(options, 'expected-state-sha256'),
                    privateKey: process.env.PREVIEW_MARKET_DEPLOY_PRIVATE_KEY,
                });
            } catch (error) {
                if (error instanceof MarketCodeUpdateError) {
                    await writeFile(output, `${JSON.stringify(error.evidence, null, 2)}\n`, { mode: 0o600 });
                }
                throw error;
            }
            await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
            console.log(JSON.stringify({
                schema: evidence.schema,
                status: evidence.status,
                source_sha: evidence.source_sha,
                target_contract_id: evidence.target_contract_id,
                after_code_hash: evidence.after_code_hash,
            }));
        } else {
            throw new Error('market_code_update_cli_invalid');
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : 'market_code_update_failed');
        process.exitCode = 1;
    }
}
