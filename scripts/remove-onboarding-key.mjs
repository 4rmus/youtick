#!/usr/bin/env node
import { Account, KeyPair, KeyPairSigner, actions } from '../apps/web/node_modules/near-api-js/lib/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const cid = process.env.NFT_CONTRACT_ID || 'youtick.near';
const rpcUrl = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.fastnear.com';
const pk = process.env.ONBOARDING_PUBLIC_KEY;
const confirm = process.env.CONFIRM_REMOVE_ONBOARDING_KEY;

if (!pk) {
  throw new Error('ONBOARDING_PUBLIC_KEY is required, for example ed25519:<public-key>');
}

if (!pk.startsWith('ed25519:')) {
  throw new Error('ONBOARDING_PUBLIC_KEY must start with ed25519:');
}

if (confirm !== cid) {
  throw new Error(`Refusing to remove onboarding key on ${cid}. Set CONFIRM_REMOVE_ONBOARDING_KEY=${cid} only after the new key is live and verified.`);
}

const credsPath = path.join(os.homedir(), '.near-credentials/mainnet', `${cid}.json`);
const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
const signer = new KeyPairSigner(KeyPair.fromString(creds.private_key || creds.secret_key));
const acc = new Account(cid, rpcUrl, signer);

console.log(`Removing onboarding key on ${cid} via ${rpcUrl}...`);
const tx = await acc.signAndSendTransaction({
  receiverId: cid,
  actions: [actions.functionCall('remove_onboarding_key', { public_key: pk }, '30000000000000', '0')],
});
console.log('Done! TX:', tx.transaction.hash);
