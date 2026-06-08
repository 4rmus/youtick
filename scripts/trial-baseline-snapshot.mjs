#!/usr/bin/env node
/**
 * Trial baseline snapshot — closes GO/NO-GO gate item "trial baseline counter".
 *
 * Read-only. Polls on-chain counters and appends a timestamped JSONL snapshot,
 * computing deltas vs the previous snapshot. The trial-pool drawdown between
 * snapshots is a direct, falsifiable proxy for trial claims (each trial account
 * costs TRIAL_ACCOUNT_STORAGE_COST = 0.002 NEAR). No contract change needed.
 *
 * Usage (run on a cron, e.g. hourly):
 *   node scripts/trial-baseline-snapshot.mjs
 * Env overrides:
 *   RPC_URL (default https://rpc.mainnet.near.org)
 *   NFT_CONTRACT (default youtick.near)
 *   REGISTRY_CONTRACT (default registry.youtick.near)
 *   OUT_FILE (default docs/operations/trial-baseline/snapshots.jsonl)
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const RPC_URL = process.env.RPC_URL || 'https://rpc.mainnet.near.org';
const NFT = process.env.NFT_CONTRACT || 'youtick.near';
const REGISTRY = process.env.REGISTRY_CONTRACT || 'registry.youtick.near';
const OUT_FILE = process.env.OUT_FILE || 'docs/operations/trial-baseline/snapshots.jsonl';
const TRIAL_COST_NEAR = 0.002; // TRIAL_ACCOUNT_STORAGE_COST
const YOCTO = 1e24;

async function view(account, method, args = {}) {
  const body = {
    jsonrpc: '2.0', id: 1, method: 'query',
    params: {
      request_type: 'call_function', finality: 'final',
      account_id: account, method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    },
  };
  const res = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(typeof json.error === 'string' ? json.error : JSON.stringify(json.error));
  const r = json.result;
  if (!r || !Array.isArray(r.result)) {
    throw new Error(r?.error || 'no result for ' + account + '.' + method);
  }
  return JSON.parse(Buffer.from(r.result).toString());
}

async function safeView(account, method, args) {
  try { return await view(account, method, args); }
  catch (e) { return { __error: String(e.message || e) }; }
}

async function lastSnapshot() {
  try {
    const txt = await readFile(OUT_FILE, 'utf8');
    const lines = txt.trim().split('\n').filter(Boolean);
    if (!lines.length) return null;
    return JSON.parse(lines[lines.length - 1]);
  } catch { return null; }
}

function num(v) { return typeof v === 'string' || typeof v === 'number' ? Number(v) : null; }

async function main() {
  const [supply, trialPool, purchaseCount, commissionPool, threshold] = await Promise.all([
    safeView(NFT, 'nft_total_supply'),
    safeView(NFT, 'get_trial_pool_balance'),
    safeView(NFT, 'get_purchase_count'),
    safeView(NFT, 'get_commission_pool'),
    safeView(REGISTRY, 'get_threshold_config'),
  ]);

  const snap = {
    ts: new Date().toISOString(),
    nft_total_supply: num(supply),
    trial_pool_yocto: typeof trialPool === 'string' ? trialPool : null,
    trial_pool_near: typeof trialPool === 'string' ? Number(trialPool) / YOCTO : null,
    purchase_count: num(purchaseCount),
    commission_pool_yocto: typeof commissionPool === 'string' ? commissionPool : null,
    threshold: threshold && !threshold.__error ? threshold : null,
    errors: Object.entries({ supply, trialPool, purchaseCount, commissionPool, threshold })
      .filter(([, v]) => v && v.__error)
      .map(([k, v]) => `${k}: ${v.__error}`),
  };

  const prev = await lastSnapshot();
  if (prev) {
    const dPurchase = snap.purchase_count != null && prev.purchase_count != null
      ? snap.purchase_count - prev.purchase_count : null;
    const dPoolNear = snap.trial_pool_near != null && prev.trial_pool_near != null
      ? prev.trial_pool_near - snap.trial_pool_near : null; // drawdown is positive
    snap.delta = {
      since: prev.ts,
      purchases: dPurchase,
      trial_pool_drawdown_near: dPoolNear != null ? Number(dPoolNear.toFixed(6)) : null,
      estimated_trial_claims: dPoolNear != null ? Math.round(dPoolNear / TRIAL_COST_NEAR) : null,
    };
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await appendFile(OUT_FILE, JSON.stringify(snap) + '\n');

  console.log('[trial-baseline] snapshot appended ->', OUT_FILE);
  console.log('  supply=%s purchase_count=%s trial_pool=%s NEAR',
    snap.nft_total_supply, snap.purchase_count,
    snap.trial_pool_near?.toFixed(4));
  if (snap.delta) {
    console.log('  delta since %s: purchases=%s trial_drawdown=%s NEAR (~%s trial claims)',
      snap.delta.since, snap.delta.purchases,
      snap.delta.trial_pool_drawdown_near, snap.delta.estimated_trial_claims);
  }
  if (snap.errors.length) console.log('  view errors:', snap.errors.join('; '));
}

main().catch((e) => { console.error('[trial-baseline] failed:', e.message || e); process.exit(1); });
