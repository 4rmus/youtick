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
