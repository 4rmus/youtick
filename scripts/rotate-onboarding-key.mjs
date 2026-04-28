#!/usr/bin/env node
/**
 * Rotate the onboarding Function Call Access Key on youtick.near.
 *
 * Usage:
 *   node scripts/rotate-onboarding-key.mjs <OLD_PUBLIC_KEY> <NEW_PUBLIC_KEY>
 *
 * Example:
 *   node scripts/rotate-onboarding-key.mjs \
 *     ed25519:OLD_KEY \
 *     ed25519:NEW_KEY
 *
 * Prerequisites:
 *   - Mainnet credentials for youtick.near in ~/.near-credentials/mainnet/youtick.near.json
 *   - Node.js 18+
 */

import { Account, KeyPair, KeyPairSigner, actions, PublicKey } from '../apps/web/node_modules/near-api-js/lib/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const cid = 'youtick.near';
const credsPath = path.join(os.homedir(), '.near-credentials/mainnet', `${cid}.json`);

const oldPk = process.argv[2];
const newPk = process.argv[3];

if (!oldPk || !newPk) {
  console.error('Usage: node rotate-onboarding-key.mjs <OLD_PUBLIC_KEY> <NEW_PUBLIC_KEY>');
  process.exit(1);
}

if (!fs.existsSync(credsPath)) {
  console.error(`Credentials not found: ${credsPath}`);
  process.exit(1);
}

const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
const signer = new KeyPairSigner(KeyPair.fromString(creds.private_key || creds.secret_key));
const acc = new Account(cid, 'https://rpc.fastnear.com', signer);

console.log(`Rotating onboarding key on ${cid}...`);
console.log(`  Remove: ${oldPk}`);
console.log(`  Add:    ${newPk}`);

const tx = await acc.signAndSendTransaction({
  receiverId: cid,
  actions: [
    actions.deleteKey(PublicKey.fromString(oldPk)),
    actions.functionCall('add_onboarding_key', { public_key: newPk }, '30000000000000', '0'),
  ],
});

console.log('Rotation complete. TX:', tx.transaction.hash);
console.log('');
console.log('Next steps:');
console.log('  1. Update the ONBOARDING_KEYS env var in your Web4 proxy / web app.');
console.log('  2. Redeploy the web app so the new key is served from /api/onboarding-key.');
console.log('  3. Verify the old key no longer appears in `near view youtick.near list_access_keys`.');
