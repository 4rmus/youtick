#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const keyFile = process.env.ONBOARDING_KEY_FILE;
const confirm = process.env.CONFIRM_SET_WEB4_ONBOARDING_SECRET;
const workerDir = process.env.WEB4_PROXY_DIR || path.join('workers', 'web4-proxy');

if (!keyFile) {
  throw new Error('ONBOARDING_KEY_FILE is required');
}

if (confirm !== 'web4-proxy') {
  throw new Error('Refusing to update ONBOARDING_KEYS. Set CONFIRM_SET_WEB4_ONBOARDING_SECRET=web4-proxy.');
}

const keyData = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
const secretKey = keyData.secret_key;
if (!secretKey || !secretKey.startsWith('ed25519:')) {
  throw new Error('Key file does not contain an ed25519 secret_key');
}

const wrangler = spawn('npx', ['wrangler', 'secret', 'put', 'ONBOARDING_KEYS'], {
  cwd: workerDir,
  stdio: ['pipe', 'inherit', 'inherit'],
});

wrangler.stdin.write(secretKey);
wrangler.stdin.end();

const code = await new Promise((resolve) => {
  wrangler.on('close', resolve);
});

if (code !== 0) {
  throw new Error(`wrangler secret put failed with exit code ${code}`);
}

console.log('Updated web4-proxy ONBOARDING_KEYS secret.');
