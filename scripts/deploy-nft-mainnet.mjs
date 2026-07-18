#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const NETWORK_ID = process.env.NFT_NETWORK_ID;
const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.fastnear.com';
const CONTRACT_ID = process.env.NFT_CONTRACT_ID;
const MANIFEST_PATH = process.env.NFT_ARTIFACT_MANIFEST;
const EXPECTED_OLD_HASH = process.env.NFT_EXPECTED_OLD_HASH;
const CREDENTIALS_PATH = process.env.NFT_CREDENTIALS_PATH || path.join(
  os.homedir(),
  '.near-credentials',
  NETWORK_ID,
  `${CONTRACT_ID}.json`,
);
function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

required(NETWORK_ID, 'NFT_NETWORK_ID');
required(CONTRACT_ID, 'NFT_CONTRACT_ID');
required(MANIFEST_PATH, 'NFT_ARTIFACT_MANIFEST');
required(EXPECTED_OLD_HASH, 'NFT_EXPECTED_OLD_HASH');
if (NETWORK_ID !== 'mainnet') throw new Error('This script only deploys to mainnet');

async function loadNearApiJs() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'apps/web/node_modules/near-api-js/lib/index.js'),
  ).href;

  return import(moduleUrl);
}

function ensureFileExists(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`);
  }
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readContractCode() {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'deploy-verification',
      method: 'query',
      params: {
        request_type: 'view_code',
        finality: 'final',
        account_id: CONTRACT_ID,
      },
    }),
  });
  if (!response.ok) throw new Error(`RPC code query failed with HTTP ${response.status}`);
  const body = await response.json();
  if (body.error || !body.result?.code_base64 || !body.result?.hash) {
    throw new Error(`RPC code query failed: ${JSON.stringify(body.error || body)}`);
  }
  return {
    codeHash: body.result.hash,
    wasmSha256: sha256Hex(Buffer.from(body.result.code_base64, 'base64')),
  };
}

async function main() {
  ensureFileExists(MANIFEST_PATH, 'Artifact manifest');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  if (!manifest.commitSha || !manifest.rustc || !manifest.wasmFile || !manifest.wasmSha256 || !manifest.abiFile || !manifest.abiSha256) {
    throw new Error('Artifact manifest is incomplete');
  }
  const abiPath = path.resolve(path.dirname(MANIFEST_PATH), manifest.abiFile);
  ensureFileExists(abiPath, 'Contract ABI');
  if (sha256Hex(readFileSync(abiPath)) !== manifest.abiSha256) {
    throw new Error('ABI SHA-256 mismatch');
  }
  const wasmPath = path.resolve(path.dirname(MANIFEST_PATH), manifest.wasmFile);
  const expectedConfirmation = `DEPLOY:${CONTRACT_ID}:${NETWORK_ID}:${manifest.wasmSha256}`;
  if (process.env.NFT_DEPLOY_CONFIRM !== expectedConfirmation) {
    throw new Error(`Set NFT_DEPLOY_CONFIRM=${expectedConfirmation}`);
  }

  ensureFileExists(wasmPath, 'NFT WASM');
  ensureFileExists(CREDENTIALS_PATH, 'NFT credentials');

  const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  const secretKey = credentials.secret_key || credentials.private_key;
  if (!secretKey) {
    throw new Error(`Missing secret key in ${CREDENTIALS_PATH}`);
  }

  const { Account, KeyPair, KeyPairSigner } = await loadNearApiJs();
  const keyPair = KeyPair.fromString(secretKey);
  const signer = new KeyPairSigner(keyPair);
  const account = new Account(CONTRACT_ID, RPC_URL, signer);
  const wasm = readFileSync(wasmPath);
  const actualWasmSha256 = sha256Hex(wasm);
  if (actualWasmSha256 !== manifest.wasmSha256) {
    throw new Error(`WASM SHA-256 mismatch: expected ${manifest.wasmSha256}, got ${actualWasmSha256}`);
  }
  const before = await readContractCode();
  if (before.codeHash !== EXPECTED_OLD_HASH) {
    throw new Error(`Current code hash mismatch: expected ${EXPECTED_OLD_HASH}, got ${before.codeHash}`);
  }

  console.log(JSON.stringify({
    network: NETWORK_ID,
    rpcUrl: RPC_URL,
    contractId: CONTRACT_ID,
    commitSha: manifest.commitSha,
    wasmPath,
    wasmSha256: manifest.wasmSha256,
    currentCodeHash: before.codeHash,
  }, null, 2));

  await account.deployContract(wasm);
  const after = await readContractCode();
  if (after.wasmSha256 !== manifest.wasmSha256) {
    throw new Error(`Post-deploy WASM mismatch: expected ${manifest.wasmSha256}, got ${after.wasmSha256}`);
  }
  console.log(`Deployed verified NFT artifact to ${CONTRACT_ID}; code hash ${after.codeHash}`);

  if (process.env.RUN_MIGRATION !== '1') {
    console.log('Migration skipped — set RUN_MIGRATION=1 to call migrate() explicitly');
    return;
  }

  // Run state migration only when the target state layout requires it.
  // Do not enable this for normal v1.0 code-only deploys.
  const { actions } = await loadNearApiJs();
  await account.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [
      actions.functionCall('migrate', {}, '300000000000000', '0'),
    ],
  });
  console.log(`State migration completed for ${CONTRACT_ID}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
