#!/usr/bin/env node
/**
 * deploy-crust.mjs — Build, upload to Crust IPFS, and update Web4 static URL
 *
 * Usage:
 *   node scripts/deploy-crust.mjs                  # Build + upload + show CID
 *   node scripts/deploy-crust.mjs --set-url        # Build + upload + auto-update contract
 *   node scripts/deploy-crust.mjs --skip-build     # Upload existing out/ without rebuilding
 *
 * Prerequisites:
 *   - Node.js 18+
 *   - NEAR credentials at ~/.near-credentials/mainnet/<contract>.json
 *   - near-cli-rs installed (for --set-url)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createPrivateKey, createPublicKey, sign as cryptoSign } from 'crypto';
import { execSync } from 'child_process';

// ─── Config ──────────────────────────────────────────────────
const CONTRACT_ID = 'youtick.near';
const CRUST_UPLOAD_URL = 'https://crustipfs.xyz/api/v0/add';
const CREDS_PATH = join(process.env.HOME, '.near-credentials/mainnet', `${CONTRACT_ID}.json`);
const WEB_DIR = new URL('../apps/web', import.meta.url).pathname;
const OUT_DIR = join(WEB_DIR, 'out');

const SET_URL = process.argv.includes('--set-url');
const SKIP_BUILD = process.argv.includes('--skip-build');

// ─── Helpers ─────────────────────────────────────────────────

/** Recursively collect all files in a directory */
function walkDir(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full, base));
    } else {
      files.push({ absolute: full, relative: relative(base, full) });
    }
  }
  return files;
}

/** Decode bs58-encoded key (NEAR key format) */
function bs58Decode(str) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = 0n;
  for (const char of str) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid bs58 character: ${char}`);
    result = result * 58n + BigInt(idx);
  }
  const bytes = [];
  while (result > 0n) {
    bytes.unshift(Number(result & 0xffn));
    result >>= 8n;
  }
  // Leading zeros
  for (const char of str) {
    if (char === '1') bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes);
}

/** Encode bytes as hex string */
function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Generate W3Auth header from NEAR credentials (Node.js native crypto) */
function generateW3Auth() {
  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));
  const privateKeyStr = creds.private_key || creds.secret_key;

  if (!privateKeyStr) {
    throw new Error(`No private_key or secret_key found in ${CREDS_PATH}`);
  }

  // Parse the key — format is "ed25519:BASE58_ENCODED_KEY"
  const keyData = privateKeyStr.replace('ed25519:', '');
  const fullKey = bs58Decode(keyData);

  // NEAR stores 64 bytes: 32-byte seed + 32-byte public key
  // Or just 32-byte seed depending on format
  const seed = fullKey.length === 64 ? fullKey.slice(0, 32) : fullKey;

  // Create Node.js crypto key objects from seed
  const privateKeyObj = createPrivateKey({
    key: Buffer.concat([
      // PKCS8 DER prefix for Ed25519 private key
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      Buffer.from(seed),
    ]),
    format: 'der',
    type: 'pkcs8',
  });

  // Derive public key
  const publicKeyDer = createPublicKey(privateKeyObj).export({ type: 'spki', format: 'der' });
  // Ed25519 SPKI DER: last 32 bytes are the raw public key
  const publicKeyRaw = publicKeyDer.slice(-32);
  const address = bs58Encode(publicKeyRaw);

  // Sign the address bytes
  const message = Buffer.from(address);
  const signature = cryptoSign(null, message, privateKeyObj);
  const signatureHex = toHex(signature);

  // W3Auth format: Basic base64("near-{address}:{signature_hex}")
  const payload = `near-${address}:${signatureHex}`;
  const header = `Basic ${Buffer.from(payload).toString('base64')}`;

  return { header, address };
}

/** Encode bytes as bs58 string */
function bs58Encode(bytes) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = 0n;
  for (const byte of bytes) {
    num = num * 256n + BigInt(byte);
  }
  let str = '';
  while (num > 0n) {
    str = ALPHABET[Number(num % 58n)] + str;
    num /= 58n;
  }
  // Leading zeros
  for (const byte of bytes) {
    if (byte === 0) str = '1' + str;
    else break;
  }
  return str || '1';
}

/** Build multipart form data manually (no external deps) */
function buildMultipartBody(files) {
  const boundary = `----CrustDeploy${Date.now()}`;
  const parts = [];

  for (const file of files) {
    const content = readFileSync(file.absolute);
    const header = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${file.relative}"`,
      `Content-Type: application/octet-stream`,
      `Abspath: /${file.relative}`,
      '',
      '',
    ].join('\r\n');

    parts.push(Buffer.from(header));
    parts.push(content);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log('============================================');
  console.log('  YouTick Web4 → Crust IPFS Deployment');
  console.log('============================================\n');

  // Step 1: Build
  if (!SKIP_BUILD) {
    console.log('[1/3] Building static export...');
    execSync('npm run build:web4', { cwd: WEB_DIR, stdio: 'inherit' });
    console.log('');
  } else {
    console.log('[1/3] Skipping build (--skip-build)\n');
  }

  // Verify out/ exists
  try {
    statSync(OUT_DIR);
  } catch {
    console.error('ERROR: out/ directory not found. Run without --skip-build first.');
    process.exit(1);
  }

  // Collect files
  const files = walkDir(OUT_DIR);
  const totalSize = files.reduce((sum, f) => sum + statSync(f.absolute).size, 0);
  console.log(`  Files: ${files.length}, Total: ${(totalSize / 1024 / 1024).toFixed(1)} MB\n`);

  // Step 2: Upload to Crust IPFS
  console.log('[2/3] Uploading to Crust IPFS...');

  // Generate W3Auth
  console.log('  Generating W3Auth token...');
  const { header: authHeader } = generateW3Auth();
  console.log('  W3Auth token ready ✓\n');

  // Build multipart body
  console.log(`  Preparing ${files.length} files for upload...`);
  const { body, contentType } = buildMultipartBody(files);
  console.log(`  Upload size: ${(body.length / 1024 / 1024).toFixed(1)} MB\n`);

  // Upload
  console.log('  Uploading to crustipfs.xyz...');
  const url = `${CRUST_UPLOAD_URL}?wrap-with-directory=true&cid-version=1`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': contentType,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`  ERROR: Crust returned HTTP ${response.status}: ${text}`);
    process.exit(1);
  }

  // Parse NDJSON response — last line with empty Name is the root directory
  const text = await response.text();
  const lines = text.trim().split('\n').map(line => JSON.parse(line));
  const rootEntry = lines.find(l => l.Name === '') || lines[lines.length - 1];
  const cid = rootEntry.Hash;

  console.log(`\n  ✓ Upload complete!`);
  console.log(`  Root CID: ${cid}`);
  console.log(`  Gateway:  https://ipfs.io/ipfs/${cid}`);
  console.log('');

  // Step 3: Update contract
  console.log('[3/3] Contract URL update...');
  console.log(`  Contract: ${CONTRACT_ID}`);
  console.log(`  New URL:  ipfs://${cid}\n`);

  if (SET_URL) {
    console.log('  Updating contract...');
    try {
      execSync(
        `near contract call-function as-transaction ${CONTRACT_ID} web4_set_static_url json-args '{"url":"ipfs://${cid}"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as ${CONTRACT_ID} network-config mainnet sign-with-keychain send`,
        { stdio: 'inherit' }
      );
      console.log('\n  ✓ Contract updated!');
    } catch (err) {
      console.error('  ERROR: Contract update failed. Run manually:');
      console.log(`  near contract call-function as-transaction ${CONTRACT_ID} web4_set_static_url json-args '{"url":"ipfs://${cid}"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as ${CONTRACT_ID} network-config mainnet sign-with-keychain send`);
    }
  } else {
    console.log('  To update the contract URL, run:');
    console.log(`  near contract call-function as-transaction ${CONTRACT_ID} web4_set_static_url json-args '{"url":"ipfs://${cid}"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as ${CONTRACT_ID} network-config mainnet sign-with-keychain send`);
    console.log('\n  Or re-run with --set-url flag');
  }

  console.log('\n============================================');
  console.log(`  Live URL: https://${CONTRACT_ID}.page/`);
  console.log('============================================');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
