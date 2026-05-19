#!/usr/bin/env node

// LLM wiki live-check.
// Runs read-only mainnet checks and compares them against the wiki's recorded
// claims, so live-drift surfaces without a scheduled agent. Run it manually or
// from your own cron; it never bills and never prints secret endpoints.
//
// Public checks (always): youtick.near code hash, registry threshold + operator
// count, trial pool balance.
// Optional checks (only if configured, aggregate counts only — no URLs):
//   KMS_OPERATORS_PATH  JSON file with decryptionOperators[].endpoint
//   STORAGE_API_URL     base URL of the storage-api worker
//
// Exit code: 0 = no drift, 1 = code-hash drift vs claims.md or an RPC failure.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.fastnear.com';
const NFT_CONTRACT = process.env.NFT_CONTRACT_ID || 'youtick.near';
const REGISTRY_CONTRACT = process.env.REGISTRY_CONTRACT_ID || 'registry.youtick.near';
const TIMEOUT_MS = 15000;

const lines = [];
const log = (msg) => { lines.push(msg); };
let drift = false;

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function rpc(params) {
  const body = { jsonrpc: '2.0', id: 'wiki-live-check', method: 'query', params };
  const json = await fetchJson(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function viewAccount(accountId) {
  return rpc({ request_type: 'view_account', finality: 'final', account_id: accountId });
}

async function viewFunction(accountId, methodName, args = {}) {
  const result = await rpc({
    request_type: 'call_function',
    finality: 'final',
    account_id: accountId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  return JSON.parse(Buffer.from(result.result).toString());
}

function claimedCodeHash() {
  const claimsPath = path.join(root, 'docs', 'llm-wiki', 'claims.md');
  if (!existsSync(claimsPath)) return null;
  const match = readFileSync(claimsPath, 'utf8').match(/code hash is `([A-Za-z0-9]+)`/);
  return match ? match[1] : null;
}

async function main() {
  log(`# LLM Wiki live-check (${new Date().toISOString().slice(0, 10)})`);
  log(`RPC: ${RPC_URL}`);
  log('');

  // 1. Code hash drift.
  try {
    const account = await viewAccount(NFT_CONTRACT);
    const liveHash = account.code_hash;
    const claimed = claimedCodeHash();
    log(`## ${NFT_CONTRACT} code hash`);
    log(`- live: ${liveHash}`);
    if (claimed) {
      const ok = claimed === liveHash;
      log(`- claims.md: ${claimed} ${ok ? '(match)' : '(DRIFT)'}`);
      if (!ok) drift = true;
    } else {
      log('- claims.md: no recorded hash found');
    }
  } catch (err) {
    log(`## ${NFT_CONTRACT} code hash`);
    log(`- ERROR: ${err.message}`);
    drift = true;
  }
  log('');

  // 2. Registry threshold + operators.
  try {
    const threshold = await viewFunction(REGISTRY_CONTRACT, 'get_threshold_config');
    const operators = await viewFunction(REGISTRY_CONTRACT, 'list_decryption_operators');
    const required = threshold.required_shares ?? threshold.requiredShares;
    const total = threshold.total_operators ?? threshold.totalOperators ?? (Array.isArray(operators) ? operators.length : '?');
    log('## Registry');
    log(`- threshold: ${required}-of-${total}`);
    log(`- decryption operators listed: ${Array.isArray(operators) ? operators.length : '?'}`);
  } catch (err) {
    log('## Registry');
    log(`- ERROR: ${err.message}`);
  }
  log('');

  // 3. Trial pool balance.
  try {
    const balance = await viewFunction(NFT_CONTRACT, 'get_trial_pool_balance');
    const yocto = typeof balance === 'string' ? balance : String(balance);
    const near = Number(BigInt(yocto) / 10n ** 21n) / 1000;
    log('## Trial pool');
    log(`- balance: ${near} NEAR (${yocto} yoctoNEAR)`);
  } catch (err) {
    log('## Trial pool');
    log(`- ERROR: ${err.message}`);
  }
  log('');

  // 4. Optional: KMS operator health (aggregate only, no endpoints printed).
  const kmsPath = process.env.KMS_OPERATORS_PATH
    || path.join(root, 'scripts', 'config', 'mainnet-kms-operators.local.json');
  log('## KMS operator health');
  if (existsSync(kmsPath)) {
    try {
      const cfg = JSON.parse(readFileSync(kmsPath, 'utf8'));
      const ops = cfg.decryptionOperators || [];
      const real = ops.filter((o) => o.endpoint && !o.endpoint.includes('example'));
      if (real.length === 0) {
        log('- skipped: config has only example endpoints');
      } else {
        let healthy = 0;
        for (const op of real) {
          try {
            const health = await fetchJson(`${op.endpoint.replace(/\/+$/, '')}/health`);
            if (health.ok && health.ready) healthy += 1;
          } catch {
            /* counted as unhealthy */
          }
        }
        log(`- ${healthy}/${real.length} operators report ok+ready`);
        if (healthy < real.length) drift = true;
      }
    } catch (err) {
      log(`- ERROR reading config: ${err.message}`);
    }
  } else {
    log('- skipped: set KMS_OPERATORS_PATH to a real operator config to enable');
  }
  log('');

  // 5. Optional: Storage API provider health.
  log('## Storage API');
  if (process.env.STORAGE_API_URL) {
    try {
      const base = process.env.STORAGE_API_URL.replace(/\/+$/, '');
      const health = await fetchJson(`${base}/provider-health`);
      log(`- provider-health: ${JSON.stringify(health)}`);
    } catch (err) {
      log(`- ERROR: ${err.message}`);
    }
  } else {
    log('- skipped: set STORAGE_API_URL to enable');
  }
  log('');

  log(drift ? '> RESULT: drift or failure detected — re-ingest into claims.md.' : '> RESULT: no drift detected.');
  console.log(lines.join('\n'));
  process.exit(drift ? 1 : 0);
}

main().catch((err) => {
  console.error(`live-check failed: ${err.message}`);
  process.exit(1);
});
