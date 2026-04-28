#!/usr/bin/env node
/**
 * Simple contract deploy script using near-api-js
 * Usage: node deploy-contract.mjs <accountId> <wasmPath>
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.near.org';
const accountId = process.argv[2];
const wasmPath = process.argv[3];

if (!accountId || !wasmPath) {
  console.error('Usage: node deploy-contract.mjs <accountId> <wasmPath>');
  process.exit(1);
}

const networkId = accountId.endsWith('.near') ? 'mainnet' : 'testnet';
const credsPath = path.join(os.homedir(), '.near-credentials', networkId, `${accountId}.json`);

const raw = readFileSync(credsPath, 'utf-8');
const creds = JSON.parse(raw);

const moduleUrl = pathToFileURL(
  path.join(process.cwd(), 'apps/web/node_modules/near-api-js/lib/index.js'),
).href;

const { Account, KeyPair, KeyPairSigner } = await import(moduleUrl);
const keyPair = KeyPair.fromString(creds.private_key || creds.secret_key);
const signer = new KeyPairSigner(keyPair);
const account = new Account(accountId, RPC_URL, signer);
const wasm = readFileSync(wasmPath);

console.log(`Deploying to ${accountId} via ${RPC_URL}...`);
await account.deployContract(wasm);
console.log(`Deployed successfully to ${accountId}`);
