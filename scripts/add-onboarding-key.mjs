#!/usr/bin/env node
import { Account, KeyPair, KeyPairSigner, actions } from '../apps/web/node_modules/near-api-js/lib/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const cid = process.env.NFT_CONTRACT_ID || 'youtick.near';
const rpcUrl = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.fastnear.com';
const pk = process.env.ONBOARDING_PUBLIC_KEY;
const confirm = process.env.CONFIRM_ADD_ONBOARDING_KEY;

if (!pk) {
  throw new Error('ONBOARDING_PUBLIC_KEY is required, for example ed25519:<public-key>');
}

if (confirm !== cid) {
  throw new Error(`Refusing to add onboarding key on ${cid}. Set CONFIRM_ADD_ONBOARDING_KEY=${cid} after rotating the key material.`);
}

const creds = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.near-credentials/mainnet', cid + '.json'), 'utf-8'));
const signer = new KeyPairSigner(KeyPair.fromString(creds.private_key || creds.secret_key));
const acc = new Account(cid, rpcUrl, signer);

console.log(`Adding onboarding key on ${cid} via ${rpcUrl}...`);
const tx = await acc.signAndSendTransaction({
  receiverId: cid,
  actions: [actions.functionCall('add_onboarding_key', { public_key: pk }, '30000000000000', '0')],
});
console.log('Done! TX:', tx.transaction.hash);
