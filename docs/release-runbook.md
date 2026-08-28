# Release runbook

Repository cleanup is not a release. There is no script in this repository
that deploys or migrates the old live contract set.

## Preconditions

- record the exact commit SHA
- use fresh market and access contract IDs
- pass web, Bridge, contract, protocol and docs CI
- confirm the Worker and web Livepeer gates are false
- confirm the native-NEAR creator-fee gates are false
- confirm both multi-asset payment modes are `off`
- verify the live market code hash and `get_usdc_contract_id()` against the web
  Circle USDC contract ID
- verify Circle USDC storage registration for the market and the canary user
- approve a positive `NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO`
- verify the 1Click partner credential returns signed quotes without app fees,
  enabled insurance or `customRecipientMsg`
- review Worker secrets, allowed origins and finite operator-key allowance
- obtain legal approval for user-facing policy text

## Staging

1. Build and deploy the exact reviewed SHA with all gates false.
2. Confirm removed URLs return 404 and unsupported watch inputs are rejected.
3. Run the approved closed canary: upload, processing, publication, purchase,
   entitlement, creator playback, stranger denial, suspension and takedown.
4. Verify video bodies travel directly to Livepeer.
5. Record contract IDs, Worker version, web version, timestamps and rollback
   targets.

## Existing testnet Market code update

The internal-testnet Market v2 account may receive a layout-preserving code
update without an init call or migration. This is not a fresh deployment and
does not authorize sponsor activation.

1. Use only the exact current `main` SHA and its successful push CI run. The
   Contracts quality job must produce the retained `market-contract-<sha>`
   artifact containing only the Market WASM, ABI, manifest and checksums.
2. Run the read-only `market-code-update.mjs snapshot` command and approve its
   exact WASM and raw-state hashes. The target account, old code hash, roles,
   pause state, Access binding and deploy public key are source-locked.
3. Dispatch `Preview Market Code Update` with the exact SHA, CI run, WASM hash,
   state hash and typed confirmation. The protected `Preview` reviewer gate and
   the environment-scoped Market deploy key are mandatory.
4. The workflow may send exactly one `DeployContract` action to the existing
   Market account. It cannot call init/migrate, change keys, transfer funds,
   update Access, configure secrets or deploy Cloudflare resources.
5. Require the post-update code hash to match the retained artifact and the raw
   contract state to remain byte-for-byte unchanged. Preserve the transaction
   hash and redacted invariant evidence. Do not retry or automatically roll
   back an ambiguous result; stop for read-only reconciliation.

The previous Market WASM does not enforce creator-job pause semantics and is
not an approved rollback target. Recovery is fix-forward under a separate gate.

## Multi-asset Preview and canary

1. Enable `preview` on both web and Bridge for dry quotes only. NEAR Intents has
   no testnet path, so use the reviewed mainnet market and no deposit address.
2. Confirm the signed exact-output quote, token contract, refund address, fees,
   deadline and ten-minute route limit in the browser.
3. After partner fee policy approval, open `live` only in a separately reviewed
   canary change. Start with Base USDC, then Arbitrum USDC.
4. For each route, record three small successful conversions and one controlled
   incomplete-deposit refund before one ticket and one upload canary.
5. Treat 1Click `SUCCESS` only as conversion completion. Record the final user
   USDC balance plus market entitlement or the exact upload job key separately.

## Activation

Enable the Worker and web gates only through a separate reviewed change after
the closed canary passes. Keep the native-NEAR creator-fee path disabled until
its price-source and failure-policy gate is approved.

Production multi-asset mode remains blocked by release policy in this slice;
changing it from `off` requires a separate approval after the mainnet canaries.

## Rollback

Disable the web and Worker gates first, then restore the last reviewed web and
Worker versions. Contract state is not rolled back; pause affected operations
and use a reviewed fix-forward. Record what changed and verify that playback
tokens and new upload intents are no longer issued.

When disabling new multi-asset quotes, retain the 1Click secret until every
known deposit reaches a terminal status. No automatic conversion back to the
source asset is attempted after USDC reaches the user's NEAR account.
