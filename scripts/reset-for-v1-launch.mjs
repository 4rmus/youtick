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
const WEB4_STATIC_URL = process.env.WEB4_STATIC_URL || null;

function ensureFileExists(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`);
  }
}

async function loadNearApiJs() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'apps/web/node_modules/near-api-js/lib/index.js'),
  ).href;

  return import(moduleUrl);
}

ensureFileExists(CREDENTIALS_PATH, 'NFT credentials');

const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
const secretKey = credentials.secret_key || credentials.private_key;
if (!secretKey) {
  throw new Error(`Missing secret key in ${CREDENTIALS_PATH}`);
}

const { Account, KeyPair, KeyPairSigner, actions } = await loadNearApiJs();
const keyPair = KeyPair.fromString(secretKey);
const signer = new KeyPairSigner(keyPair);
const account = new Account(CONTRACT_ID, RPC_URL, signer);

console.log(JSON.stringify({
  network: NETWORK_ID,
  rpcUrl: RPC_URL,
  contractId: CONTRACT_ID,
  credentialsPath: CREDENTIALS_PATH,
  web4StaticUrl: WEB4_STATIC_URL,
}, null, 2));

const tx = await account.signAndSendTransaction({
  receiverId: CONTRACT_ID,
  actions: [
    actions.functionCall(
      'reset_for_v1_launch',
      { web4_static_url: WEB4_STATIC_URL },
      '300000000000000',
      '0',
    ),
  ],
});

console.log(`reset_for_v1_launch executed. TX: ${tx.transaction.hash}`);
