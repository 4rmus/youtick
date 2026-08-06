# Release runbook

Repository cleanup is not a release. There is no script in this repository
that deploys or migrates the old live contract set.

## Preconditions

- record the exact commit SHA
- use fresh market and access contract IDs
- pass web, Bridge, contract, protocol and docs CI
- confirm the Worker and web Livepeer gates are false
- confirm the native-NEAR creator-fee gates are false
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

## Activation

Enable the Worker and web gates only through a separate reviewed change after
the closed canary passes. Keep the native-NEAR creator-fee path disabled until
its price-source and failure-policy gate is approved.

## Rollback

Disable the web and Worker gates first, then restore the last reviewed web and
Worker versions. Contract state is not rolled back; pause affected operations
and use a reviewed fix-forward. Record what changed and verify that playback
tokens and new upload intents are no longer issued.
