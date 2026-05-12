#!/usr/bin/env node
import { KeyPair } from '../apps/web/node_modules/near-api-js/lib/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const outDir = process.env.ONBOARDING_KEY_DIR || path.join(os.homedir(), '.near-credentials/mainnet');
const label = process.env.ONBOARDING_KEY_LABEL || `youtick-onboarding-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const outPath = path.join(outDir, `${label}.json`);

fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });

if (fs.existsSync(outPath)) {
  throw new Error(`Refusing to overwrite existing key file: ${outPath}`);
}

const keyPair = KeyPair.fromRandom('ed25519');
const publicKey = keyPair.getPublicKey().toString();
const secretKey = keyPair.toString();

fs.writeFileSync(
  outPath,
  JSON.stringify({ public_key: publicKey, secret_key: secretKey }, null, 2) + '\n',
  { mode: 0o600 },
);

console.log(`Wrote onboarding key file: ${outPath}`);
console.log(`Public key: ${publicKey}`);
console.log('Secret key: written to file only');
