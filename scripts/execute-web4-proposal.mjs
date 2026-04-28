#!/usr/bin/env node
/**
 * Execute a timelock proposal on youtick.near
 * Usage: node execute-web4-proposal.mjs <proposal_id>
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.near.org';
const CONTRACT_ID = 'youtick.near';
const proposalId = Number(process.argv[2] ?? 0);

const credsPath = path.join(os.homedir(), '.near-credentials', 'mainnet', `${CONTRACT_ID}.json`);
const raw = readFileSync(credsPath, 'utf-8');
const creds = JSON.parse(raw);

const moduleUrl = pathToFileURL(
  path.join(process.cwd(), 'apps/web/node_modules/near-api-js/lib/index.js'),
).href;

const { Account, KeyPair, KeyPairSigner, actions } = await import(moduleUrl);
const keyPair = KeyPair.fromString(creds.private_key || creds.secret_key);
const signer = new KeyPairSigner(keyPair);
const account = new Account(CONTRACT_ID, RPC_URL, signer);

console.log(`Executing proposal ${proposalId} on ${CONTRACT_ID} via ${RPC_URL}...`);
const tx = await account.signAndSendTransaction({
  receiverId: CONTRACT_ID,
  actions: [
    actions.functionCall('execute_action', { id: proposalId }, '30000000000000', '0'),
  ],
});
console.log('Executed successfully. TX:', tx.transaction.hash);
