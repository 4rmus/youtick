import { Account, KeyPair, KeyPairSigner, actions } from '../apps/web/node_modules/near-api-js/lib/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const cid = 'youtick.near';
const creds = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.near-credentials/mainnet', cid + '.json'), 'utf-8'));
const signer = new KeyPairSigner(KeyPair.fromString(creds.private_key || creds.secret_key));
const acc = new Account(cid, 'https://rpc.fastnear.com', signer);
const pk = 'ed25519:BpZrWLxqsVqgBv7uLW6SLC7b4BmtAebN8gCLXRRFyfaW';

console.log('Adding onboarding key...');
const tx = await acc.signAndSendTransaction({
  receiverId: cid,
  actions: [actions.functionCall('add_onboarding_key', { public_key: pk }, '30000000000000', '0')],
});
console.log('Done! TX:', tx.transaction.hash);
