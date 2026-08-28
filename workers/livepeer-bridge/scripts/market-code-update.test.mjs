import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    mkdtemp,
    readFile,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { KeyPair } from 'near-api-js';
import {
    createMarketRuntimeArtifact,
    runMarketCodeUpdate,
    verifyMarketRuntimeArtifact,
} from './market-code-update.mjs';

const POLICY_PATH = fileURLToPath(new URL('./market-code-update-policy.json', import.meta.url));
const RPC_URL = 'https://rpc.testnet.near.org/';
const SOURCE_SHA = 'a'.repeat(40);
const RUN_ID = '123';
const RUN_ATTEMPT = '1';
const TX_HASH = '7'.repeat(44);

test('artifact creation and verification lock the exact file set and hashes', async () => {
    const fixture = await artifactFixture();
    const verified = await verifyMarketRuntimeArtifact({
        artifactDir: fixture.artifactDir,
        sourceSha: SOURCE_SHA,
        runId: RUN_ID,
        runAttempt: RUN_ATTEMPT,
    });
    assert.equal(verified.manifest.files.wasm.sha256, fixture.manifest.files.wasm.sha256);

    await writeFile(resolve(fixture.artifactDir, 'unexpected.txt'), 'unexpected');
    await assert.rejects(verifyMarketRuntimeArtifact({
        artifactDir: fixture.artifactDir,
        sourceSha: SOURCE_SHA,
        runId: RUN_ID,
        runAttempt: RUN_ATTEMPT,
    }), /market_artifact_file_set_invalid/);
});

test('artifact verification rejects tampered WASM bytes', async () => {
    const fixture = await artifactFixture();
    await writeFile(resolve(fixture.artifactDir, 'youtick_nft.wasm'), 'tampered');
    await assert.rejects(verifyMarketRuntimeArtifact({
        artifactDir: fixture.artifactDir,
        sourceSha: SOURCE_SHA,
        runId: RUN_ID,
        runAttempt: RUN_ATTEMPT,
    }), /market_artifact_content_mismatch/);
});

test('market update sends once and preserves the exact state digest', async () => {
    const fixture = await runtimeFixture();
    const evidence = await runMarketCodeUpdate(fixture.input);
    assert.equal(fixture.deployCalls.length, 1);
    assert.equal(fixture.deployCalls[0].targetContractId, fixture.policy.target_contract_id);
    assert.deepEqual(fixture.deployCalls[0].wasmBytes, fixture.wasm);
    assert.equal(evidence.before_code_hash, fixture.policy.expected_current_code_hash);
    assert.equal(evidence.after_code_hash, fixture.manifest.files.wasm.code_hash);
    assert.equal(evidence.state_sha256, fixture.stateSha256);
    assert.equal(evidence.transaction_hash, TX_HASH);
    assert.equal(evidence.broadcast_error_code, null);
    assert.equal(evidence.provider_error_code, null);
    assert.equal(evidence.status, 'PASS');
    assert.equal(evidence.error_code, null);
    assert.ok(fixture.rpcRequests.filter(({ method }) => method === 'query').every(
        ({ params }) => params.block_id === '9'.repeat(44) && !('finality' in params),
    ));
});

test('market update rejects drift and a wrong deploy key before broadcast', async (t) => {
    await t.test('state acknowledgement drift', async () => {
        const fixture = await runtimeFixture();
        fixture.input.expectedStateSha256 = 'f'.repeat(64);
        await assert.rejects(
            runMarketCodeUpdate(fixture.input),
            /market_code_update_state_ack_mismatch/,
        );
        assert.equal(fixture.deployCalls.length, 0);
    });

    await t.test('wrong current code hash', async () => {
        const fixture = await runtimeFixture({
            currentWasm: Buffer.from('unexpected-current'),
            expectedCurrentWasm: Buffer.from('market-wasm-v1'),
        });
        await assert.rejects(
            runMarketCodeUpdate(fixture.input),
            /market_code_update_runtime_mismatch/,
        );
        assert.equal(fixture.deployCalls.length, 0);
    });

    await t.test('wrong deploy key', async () => {
        const fixture = await runtimeFixture();
        fixture.input.derivePublicKeyImpl = async () => 'ed25519:11111111111111111111111111111111';
        await assert.rejects(
            runMarketCodeUpdate(fixture.input),
            /market_code_update_deploy_key_mismatch/,
        );
        assert.equal(fixture.deployCalls.length, 0);
    });

    await t.test('extra FullAccess key', async () => {
        const fixture = await runtimeFixture({ extraFullAccessKey: true });
        await assert.rejects(
            runMarketCodeUpdate(fixture.input),
            /market_code_update_deploy_key_set_mismatch/,
        );
        assert.equal(fixture.deployCalls.length, 0);
    });

    await t.test('bridge allowance drift', async () => {
        const fixture = await runtimeFixture({ bridgeAllowance: '1' });
        await assert.rejects(
            runMarketCodeUpdate(fixture.input),
            /market_code_update_bridge_key_mismatch/,
        );
        assert.equal(fixture.deployCalls.length, 0);
    });

    await t.test('insufficient reserve headroom', async () => {
        const fixture = await runtimeFixture({ reserveHeadroomYocto: '1' });
        await assert.rejects(
            runMarketCodeUpdate(fixture.input),
            /market_code_update_reserve_insufficient/,
        );
        assert.equal(fixture.deployCalls.length, 0);
    });
});

test('market update never retries an ambiguous broadcast', async (t) => {
    await t.test('unchanged code requires reconciliation', async () => {
        const fixture = await runtimeFixture({ deployError: true, deployChangesCode: false });
        await assert.rejects(runMarketCodeUpdate(fixture.input), (error) => {
            assert.match(error.message, /market_code_update_ambiguous/);
            assert.equal(error.evidence.status, 'AMBIGUOUS');
            assert.equal(error.evidence.transaction_hash, TX_HASH);
            assert.equal(error.evidence.broadcast_error_code, 'transaction_submit_failed');
            assert.equal(error.evidence.provider_error_code, 'rpc_http_429');
            assert.doesNotMatch(JSON.stringify(error.evidence), /private_provider_error/);
            return true;
        });
        assert.equal(fixture.deployCalls.length, 1);
    });

    await t.test('changed code without a receipt requires reconciliation', async () => {
        const fixture = await runtimeFixture({ deployError: true, deployChangesCode: true });
        await assert.rejects(runMarketCodeUpdate(fixture.input), (error) => {
            assert.match(error.message, /market_code_update_reconcile_required/);
            assert.equal(error.evidence.status, 'RECONCILE_REQUIRED');
            assert.equal(error.evidence.after_code_hash, fixture.manifest.files.wasm.code_hash);
            assert.equal(error.evidence.transaction_hash, TX_HASH);
            assert.equal(error.evidence.broadcast_error_code, 'transaction_submit_failed');
            assert.equal(error.evidence.provider_error_code, 'rpc_http_429');
            return true;
        });
        assert.equal(fixture.deployCalls.length, 1);
    });

    await t.test('unknown provider details stay redacted', async () => {
        const fixture = await runtimeFixture({
            deployError: true,
            deployChangesCode: false,
            deployProviderErrorCode: 'private_provider_error',
        });
        await assert.rejects(runMarketCodeUpdate(fixture.input), (error) => {
            assert.equal(error.evidence.provider_error_code, 'rpc_error');
            assert.doesNotMatch(JSON.stringify(error.evidence), /private_provider_error/);
            return true;
        });
    });
});

test('real deploy path signs once before one-attempt RPC broadcast', async () => {
    const source = await readFile(new URL('./market-code-update.mjs', import.meta.url), 'utf8');
    const deploy = source.slice(
        source.indexOf('async function deployContractCode'),
        source.indexOf('async function query'),
    );
    assert.match(deploy, /new JsonRpcProvider\(\{ url: rpcUrl \}, \{ retries: 1 \}\)/);
    assert.match(deploy, /createSignedTransaction/);
    assert.match(deploy, /encodeTransaction\(signedTransaction\)/);
    assert.match(deploy, /sendTransactionUntil\(signedTransaction, 'FINAL'\)/);
    assert.match(deploy, /safeProviderErrorCode/);
    assert.doesNotMatch(deploy, /signAndSendTransaction/);
});

test('market update rejects post-deploy state drift', async () => {
    const fixture = await runtimeFixture({ postStateDrift: true });
    await assert.rejects(runMarketCodeUpdate(fixture.input), (error) => {
        assert.match(error.message, /market_code_update_state_changed/);
        assert.equal(error.evidence.status, 'POSTCHECK_FAILED');
        assert.equal(error.evidence.transaction_hash, TX_HASH);
        return true;
    });
    assert.equal(fixture.deployCalls.length, 1);
});

test('market update preserves evidence when post-deploy reserve is malformed', async () => {
    const fixture = await runtimeFixture({ postReserveMalformed: true });
    await assert.rejects(runMarketCodeUpdate(fixture.input), (error) => {
        assert.match(error.message, /market_code_update_runtime_mismatch/);
        assert.equal(error.evidence.status, 'POSTCHECK_FAILED');
        assert.equal(error.evidence.before_reserve.reserve_headroom_yocto,
            '200000000000000000000000');
        assert.equal(error.evidence.after_reserve, null);
        assert.equal(error.evidence.transaction_hash, TX_HASH);
        return true;
    });
    assert.equal(fixture.deployCalls.length, 1);
});

async function artifactFixture() {
    const root = await mkdtemp(join(tmpdir(), 'market-artifact-'));
    const artifactDir = resolve(root, 'artifact');
    const wasmPath = resolve(root, 'market.wasm');
    const abiPath = resolve(root, 'market.json');
    const lockfilePath = resolve(root, 'Cargo.lock');
    await Promise.all([
        writeFile(wasmPath, Buffer.from('market-wasm-v2')),
        writeFile(abiPath, '{"schema_version":"0.4.0"}\n'),
        writeFile(lockfilePath, 'lockfile'),
    ]);
    const manifest = await createMarketRuntimeArtifact({
        wasmPath,
        abiPath,
        lockfilePath,
        outputDir: artifactDir,
        sourceSha: SOURCE_SHA,
        runId: RUN_ID,
        runAttempt: RUN_ATTEMPT,
    });
    return { root, artifactDir, manifest };
}

async function runtimeFixture({
    currentWasm = Buffer.from('market-wasm-v1'),
    expectedCurrentWasm = currentWasm,
    deployError = false,
    deployChangesCode = true,
    postStateDrift = false,
    postReserveMalformed = false,
    extraFullAccessKey = false,
    bridgeAllowance,
    reserveHeadroomYocto = '200000000000000000000000',
    deployProviderErrorCode = 'rpc_http_429',
} = {}) {
    const artifact = await artifactFixture();
    const policy = JSON.parse(await readFile(POLICY_PATH, 'utf8'));
    const wasm = await readFile(resolve(artifact.artifactDir, 'youtick_nft.wasm'));
    const deployKey = KeyPair.fromRandom('ed25519');
    policy.deploy_public_key = deployKey.getPublicKey().toString();
    policy.expected_current_code_hash = codeHash(expectedCurrentWasm);
    policy.expected_current_wasm_bytes = expectedCurrentWasm.length;
    const policyPath = resolve(artifact.root, 'policy.json');
    await writeFile(policyPath, `${JSON.stringify(policy)}\n`);
    const stateRows = [{ key: 'c3RhdGU=', value: 'dmFsdWU=' }];
    const stateSha256 = stateDigest(stateRows);
    let deployed = false;
    const deployCalls = [];
    const rpcRequests = [];
    const fetchImpl = async (_url, init) => {
        const request = JSON.parse(init.body);
        rpcRequests.push(request);
        const result = rpcResult({
            request,
            policy,
            codeWasm: deployed ? wasm : currentWasm,
            stateRows: deployed && postStateDrift
                ? [...stateRows, { key: 'ZHJpZnQ=', value: 'MQ==' }]
                : stateRows,
            extraFullAccessKey,
            bridgeAllowance,
            reserveHeadroomYocto,
            reserveMalformed: deployed && postReserveMalformed,
        });
        return Response.json({ jsonrpc: '2.0', id: request.id, result });
    };
    const deployImpl = async (input) => {
        deployCalls.push(input);
        if (deployChangesCode) deployed = true;
        if (deployError) {
            const error = new Error('private_provider_error');
            error.transactionHash = TX_HASH;
            error.broadcastErrorCode = 'transaction_submit_failed';
            error.providerErrorCode = deployProviderErrorCode;
            throw error;
        }
        return { transaction: { hash: TX_HASH } };
    };
    return {
        ...artifact,
        policy,
        wasm,
        stateSha256,
        deployCalls,
        rpcRequests,
        input: {
            artifactDir: artifact.artifactDir,
            policyPath,
            rpcUrl: RPC_URL,
            sourceSha: SOURCE_SHA,
            runId: RUN_ID,
            runAttempt: RUN_ATTEMPT,
            expectedWasmSha256: artifact.manifest.files.wasm.sha256,
            expectedStateSha256: stateSha256,
            privateKey: deployKey.toString(),
            fetchImpl,
            deployImpl,
            now: () => 1_785_600_000_000,
        },
    };
}

function rpcResult({
    request,
    policy,
    codeWasm,
    stateRows,
    extraFullAccessKey,
    bridgeAllowance,
    reserveHeadroomYocto,
    reserveMalformed,
}) {
    if (request.method === 'block') {
        return { header: { height: 265_900_000, hash: '9'.repeat(44) } };
    }
    const params = request.params;
    if (params.request_type === 'view_account') {
        return { code_hash: codeHash(codeWasm), block_height: 265_900_000 };
    }
    if (params.request_type === 'view_code') {
        return { code_base64: codeWasm.toString('base64'), block_height: 265_900_000 };
    }
    if (params.request_type === 'view_state') {
        return { values: stateRows, block_height: 265_900_000 };
    }
    if (params.request_type === 'view_access_key_list') {
        if (params.account_id === policy.target_contract_id) {
            const keys = [{
                public_key: policy.deploy_public_key,
                access_key: { nonce: 1, permission: 'FullAccess' },
            }];
            if (extraFullAccessKey) {
                keys.push({
                    public_key: 'ed25519:11111111111111111111111111111111',
                    access_key: { nonce: 1, permission: 'FullAccess' },
                });
            }
            return { keys };
        }
        return {
            keys: [{
                public_key: policy.expected_bridge_key.public_key,
                access_key: {
                    nonce: 1,
                    permission: {
                        FunctionCall: {
                            allowance: bridgeAllowance || policy.expected_bridge_key.allowance,
                            receiver_id: policy.expected_bridge_key.receiver_id,
                            method_names: policy.expected_bridge_key.method_names,
                        },
                    },
                },
            }],
        };
    }
    if (params.request_type === 'call_function') {
        const views = {
            get_governance_state: policy.expected_governance,
            get_quote_key_version: policy.expected_quote_key_version,
            get_usdc_contract_id: policy.expected_usdc_contract_id,
            get_platform_balance: '540000',
            get_platform_near_balance: '0',
            get_publications_count: 1,
            get_storage_reserve_status: reserveMalformed ? null : {
                storage_usage_bytes: '1000',
                storage_byte_cost_yocto: '10000000000000000000',
                storage_stake_yocto: '10000000000000000000000',
                operational_reserve_yocto: '1000000000000000000000000',
                account_balance_yocto: String(
                    1_010_000_000_000_000_000_000_000n + BigInt(reserveHeadroomYocto),
                ),
                reserve_headroom_yocto: reserveHeadroomYocto,
                reserve_runway_bytes: String(
                    BigInt(reserveHeadroomYocto) / 10_000_000_000_000_000_000n,
                ),
                reserve_covered: true,
            },
            get_contract_state: policy.expected_access_state,
        };
        return { result: [...Buffer.from(JSON.stringify(views[params.method_name]))] };
    }
    throw new Error(`unexpected_rpc:${params.request_type}`);
}

function stateDigest(rows) {
    const canonical = rows.map((row) => `${row.key}\n${row.value}`).sort();
    return createHash('sha256').update(`${canonical.join('\n')}\n`).digest('hex');
}

function codeHash(wasm) {
    return base58Encode(createHash('sha256').update(wasm).digest());
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
