# YouTick paid media market contract

Status: `LIVEPEER_V1 / MARKET_V2_CODE_ONLY / RUNTIME_DISABLED / CURRENT_SOURCE_NOT_DEPLOYED`

This crate builds the paid-only Livepeer v1 market contract. It is intended for
fresh contract IDs in new environments; no deployed public-alpha contract is
migrated in place. The existing isolated internal-testnet Market v2 pair is the
only approved code-update target: its persistent layout is unchanged, and the
guarded update performs no init call or state migration.

The contract supports:

- creator-owned, generation-bound paid media jobs;
- atomic job creation through Circle USDC `ft_transfer_call`, charging
  `max(500_000, ceil(source_bytes / 1_000_000_000 * 300_000))` micro-USDC once
  per new job;
- native NEAR job creation through a short-lived, server-signed quote with
  checked integer conversion and a separate NEAR platform ledger;
- an immutable job-bound upload public key with creator-only unpublished-key
  replacement;
- the exact `paid-media-livepeer-v1` profile and configuration hash;
- bridge-only, idempotent Livepeer publication finalization;
- versioned governance state with a separate guardian-only emergency freeze,
  admin-only unfreeze and an auditable pending bridge rotation;
- a layout-preserving global new-purchase pause: guardian closes ticket sales
  and new creator paid jobs immediately, admin alone reopens, exact job replays
  and recovery remain available, and both transitions emit governance events;
- globally unique asset hash and playback ID bindings;
- mutable sale availability separated from immutable publication identity;
- Circle USDC tickets at 2 USDC or more with a 98% creator / 2% platform split;
- durable entitlement history and withdrawal liability restoration.
- NEAR withdrawal bounded by its recorded liability, storage staking and the
  configured operational reserve, with `get_storage_reserve_status` exposing
  the exact shared guard calculation without adding contract state.
- NEP-297 economic, publication, withdrawal and governance events with bounded
  idempotency fields and no upload/provider capabilities.

The ABI contains only the Livepeer job, publication, entitlement, governance,
takedown and payment surfaces. Upload pause/resume, reconciliation and an exact same-job replay
cannot charge the creator again; a conflicting replay fails. A new job is a new
charge and no automatic provider-failure refund is implemented. The MediaJob
Borsh layout has no migration entrypoint. New Market v2 deployments must use a
fresh contract ID; the internal-testnet exception is a code-only update of the
existing v2 account after exact raw-state and code-hash preflight. The purchase
pause uses a dedicated namespaced storage key and does not change that Borsh
layout. The accepted technical-pilot governance has no multisig or timelock;
`propose_bridge` and `execute_bridge_rotation` are both admin-only. Multisig and
timelock remain mandatory before mainnet general access.

The event catalog is source-complete except `contract_migrated`, which cannot be
truthfully emitted by this fresh-ID/no-migration design. Receipt ID and event
index are attached by the final-block indexer; the contract emits contract ID,
block height/time and the business idempotency key.

Protocol details and exact bindings are in
[`protocol/paid-media-livepeer-v1`](../../protocol/paid-media-livepeer-v1/README.md).

## Build and verify

Use Rust 1.86 because newer WASM output is not supported by the pinned NEAR
runtime:

```bash
cargo +1.86.0 fmt --all --check
cargo +1.86.0 clippy --all-targets -- -D warnings
cargo +1.86.0 test --lib
cargo +1.86.0 test --test paid_media_livepeer_v1
cargo +1.86.0 test --test sandbox
cargo +1.86.0 near build non-reproducible-wasm
```

The current source remains undeployed. Its existing-testnet code update is
available only through the manual protected workflow after separate approval;
staging, sponsor activation and Production remain later gates.
The previous testnet WASM is not a safe rollback while the global pause is
active because it does not apply that pause to creator paid-job paths. Recovery
is forward-only with a separately reviewed artifact that retains these guards.
