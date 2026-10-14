#!/usr/bin/env node
// Read-only checks for a deployed ckd-gate (roadmap E4). The gate is immutable by design: whoever holds
// a key on its account could redeploy it and collect every user's CKD secret, and a code change means a
// new gate and new secrets. This script proves, from chain state alone, that a gate account
//   1. has no access keys,
//   2. runs exactly the given WASM (NEAR code hash = base58(sha256(wasm))),
//   3. was initialised with the expected configuration,
// and reports its NEP-330 source metadata. It never signs or sends a transaction.
//
//   node scripts/verify-ckd-gate.mjs hash <ckd_gate.wasm>
//   node scripts/verify-ckd-gate.mjs check --network testnet --account <gate> --wasm <ckd_gate.wasm> [--rpc <url>]

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
export const DEFAULT_RPC = Object.freeze({
    testnet: 'https://test.rpc.fastnear.com',
    mainnet: 'https://free.rpc.fastnear.com',
});
// The `new` arguments the client and relayer rely on. Mainnet waits for NEAR Auth approval (roadmap X2).
export const EXPECTED_CONFIG = Object.freeze({
    testnet: Object.freeze({
        guard: 'auth0.jwt.fast-auth.testnet',
        mpc: 'v1.signer-prod.testnet',
        fast_auth: 'fast-auth.testnet',
        fast_auth_domain: 1,
        issuer: 'https://login.testnet.fast-auth.com/',
        client_id: 'np8paqIpMWmNbzT4xAvOOapZBjsOpptl',
        ckd_domain: 2,
    }),
    mainnet: null,
});

export function base58(bytes) {
    let value = 0n;
    for (const byte of bytes) value = value * 256n + BigInt(byte);
    let out = '';
    while (value > 0n) {
        out = BASE58[Number(value % 58n)] + out;
        value /= 58n;
    }
    for (const byte of bytes) {
        if (byte !== 0) break;
        out = `1${out}`;
    }
    return out;
}

export function wasmHashes(bytes) {
    const digest = createHash('sha256').update(bytes).digest();
    return { sha256: digest.toString('hex'), code_hash: base58(digest) };
}

async function rpc(fetchImpl, url, params) {
    let response;
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'verify-ckd-gate', method: 'query', params: { finality: 'final', ...params } }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch {
        throw new Error('rpc_unavailable');
    }
    const body = response.ok ? await response.json().catch(() => null) : null;
    if (!body || body.error) throw new Error('rpc_unavailable');
    return body.result;
}

async function view(fetchImpl, url, account, method) {
    const result = await rpc(fetchImpl, url, {
        request_type: 'call_function', account_id: account, method_name: method, args_base64: 'e30=',
    });
    if (!Array.isArray(result?.result)) return { error: result?.error ?? 'no_result' };
    try {
        return { value: JSON.parse(Buffer.from(result.result).toString('utf8')) };
    } catch {
        return { error: 'invalid_json' };
    }
}

function sameJson(left, right) {
    const keys = (value) => Object.keys(value ?? {}).sort();
    return JSON.stringify(keys(left)) === JSON.stringify(keys(right))
        && keys(right).every((key) => left[key] === right[key]);
}

export async function verifyCkdGate({ network, account, wasm, rpcUrl, expectedConfig, fetchImpl = fetch }) {
    if (!Object.hasOwn(DEFAULT_RPC, network) || typeof account !== 'string' || !ACCOUNT_PATTERN.test(account)
        || !(wasm instanceof Uint8Array) || wasm.byteLength === 0) {
        throw new Error('invalid_arguments');
    }
    const expected = expectedConfig ?? EXPECTED_CONFIG[network];
    if (!expected) throw new Error('expected_config_missing');
    const url = rpcUrl ?? DEFAULT_RPC[network];
    const hashes = wasmHashes(wasm);
    const [keys, state, config, metadata] = await Promise.all([
        rpc(fetchImpl, url, { request_type: 'view_access_key_list', account_id: account }),
        rpc(fetchImpl, url, { request_type: 'view_account', account_id: account }),
        view(fetchImpl, url, account, 'config'),
        view(fetchImpl, url, account, 'contract_source_metadata'),
    ]);
    const keyCount = Array.isArray(keys?.keys) ? keys.keys.length : null;
    const checks = [
        { name: 'no_access_keys', pass: keyCount === 0, detail: { access_keys: keyCount } },
        { name: 'code_hash', pass: state?.code_hash === hashes.code_hash,
            detail: { chain: state?.code_hash ?? null, wasm: hashes.code_hash, wasm_sha256: hashes.sha256 } },
        { name: 'config', pass: config.value !== undefined && sameJson(config.value, expected),
            detail: config.value ?? { error: config.error } },
    ];
    return {
        schema: 'youtick.ckd-gate-verification.v1',
        network, account, block_height: state?.block_height ?? null,
        status: checks.every((check) => check.pass) ? 'PASS' : 'FAIL',
        checks,
        // Informational: a reproducible build fills `link` and `build_info`; the testnet gate predates it.
        source_metadata: metadata.value ?? null,
    };
}

function option(args, name) {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
}

async function main(args) {
    const [command, ...rest] = args;
    if (command === 'hash' && rest.length === 1) {
        console.log(JSON.stringify(wasmHashes(await readFile(rest[0]))));
        return 0;
    }
    if (command === 'check') {
        const result = await verifyCkdGate({
            network: option(rest, '--network'), account: option(rest, '--account'),
            wasm: new Uint8Array(await readFile(option(rest, '--wasm') ?? '')), rpcUrl: option(rest, '--rpc'),
        });
        console.log(JSON.stringify(result, null, 2));
        return result.status === 'PASS' ? 0 : 1;
    }
    console.error('usage: verify-ckd-gate.mjs hash <wasm> | check --network <testnet|mainnet> --account <gate> --wasm <wasm> [--rpc <url>]');
    return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
        console.error(error instanceof Error ? error.message : 'verify_failed');
        process.exitCode = 1;
    });
}
