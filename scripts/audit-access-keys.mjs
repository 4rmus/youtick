#!/usr/bin/env node
/**
 * Access-key audit for the protocol owner account — read-only.
 *
 * Flags the keys that should be reviewed/revoked before a wider launch:
 *   - FullAccess keys (each is total control: deploy, transfer, drain)
 *   - FunctionCall keys with the contract account itself as receiver AND empty
 *     method_names (= may call ANY method on the protocol contract)
 *
 * It does NOT sign or delete anything. It prints the exact `near` commands the
 * owner can run after confirming each key is unknown/unneeded.
 *
 * Usage:
 *   node scripts/audit-access-keys.mjs
 * Env: RPC_URL (default mainnet), ACCOUNT (default youtick.near)
 */
const RPC_URL = process.env.RPC_URL || 'https://rpc.mainnet.near.org';
const ACCOUNT = process.env.ACCOUNT || 'youtick.near';

async function main() {
  const res = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'query',
      params: { request_type: 'view_access_key_list', finality: 'final', account_id: ACCOUNT },
    }),
  });
  const json = await res.json();
  const keys = json.result?.keys || [];

  const full = [];
  const broadOwnContract = [];
  const byReceiver = new Map();

  for (const k of keys) {
    const perm = k.access_key?.permission;
    if (perm === 'FullAccess') { full.push(k.public_key); continue; }
    const fc = perm?.FunctionCall;
    if (!fc) continue;
    const recv = fc.receiver_id;
    const methods = fc.method_names || [];
    byReceiver.set(recv, (byReceiver.get(recv) || 0) + 1);
    if (recv === ACCOUNT && methods.length === 0) broadOwnContract.push(k.public_key);
  }

  console.log(`\n=== Access-key audit: ${ACCOUNT} ===`);
  console.log(`Total keys: ${keys.length}  |  FullAccess: ${full.length}  |  FunctionCall: ${keys.length - full.length}`);

  console.log(`\n[FLAG] FullAccess keys (${full.length}) — each is total control. Target: reduce to ONE hardware-wallet key, then multisig.`);
  for (const pk of full) console.log('  -', pk);

  console.log(`\n[FLAG] FunctionCall keys with ANY method on ${ACCOUNT} (${broadOwnContract.length}) — can call any contract method (subject to the contract's own owner checks). Review and revoke if not a known relayer/onboarding key.`);
  for (const pk of broadOwnContract) console.log('  -', pk);

  const others = [...byReceiver.entries()].filter(([r]) => r !== ACCOUNT).sort((a, b) => b[1] - a[1]);
  if (others.length) {
    console.log(`\n[info] FunctionCall keys scoped to OTHER contracts (dApp logins; not a direct ${ACCOUNT} risk):`);
    for (const [r, n] of others) console.log(`  ${n.toString().padStart(3)}  ${r}`);
    console.log('  (If this account is also the protocol owner, consider migrating protocol ownership to a fresh, dedicated account that is NOT used for dApp logins.)');
  }

  const toRevoke = [...full, ...broadOwnContract];
  if (toRevoke.length) {
    console.log(`\n=== Suggested revoke commands (run ONLY after confirming each key is unknown/unneeded; keep at least one trusted FullAccess key) ===`);
    for (const pk of toRevoke) {
      console.log(`# near account delete-key ${ACCOUNT} '${pk}' network-config mainnet sign-with-keychain send`);
    }
    console.log('\n⚠️  Deleting your last/only FullAccess key locks you out permanently. Verify which FullAccess key your signer holds before deleting any.');
  }
}

main().catch((e) => { console.error('audit failed:', e.message || e); process.exit(1); });
