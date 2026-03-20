#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const NETWORK_ID = 'mainnet';
const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.fastnear.com';
const CONTRACT_ID = process.env.NFT_CONTRACT_ID || 'youtick.near';
const CREDENTIALS_PATH = process.env.NFT_CREDENTIALS_PATH || path.join(
  os.homedir(),
  '.near-credentials',
  NETWORK_ID,
  `${CONTRACT_ID}.json`,
);
const WASM_PATH = process.env.NFT_WASM_PATH || path.join(
  process.cwd(),
  'contracts',
  'nft-ticket',
  'target',
  'near',
  'youtick_nft.wasm',
);

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

async function main() {
  ensureFileExists(WASM_PATH, 'NFT WASM');
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
  const wasm = readFileSync(WASM_PATH);

  console.log(JSON.stringify({
    network: NETWORK_ID,
    rpcUrl: RPC_URL,
    contractId: CONTRACT_ID,
    wasmPath: WASM_PATH,
    credentialsPath: CREDENTIALS_PATH,
  }, null, 2));

  await account.deployContract(wasm);
  console.log(`Deployed NFT contract to ${CONTRACT_ID}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
