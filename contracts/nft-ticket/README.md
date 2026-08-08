# YouTick paid media market contract

Status: `LIVEPEER_V1 / CODE_ONLY / BLOCKED_BY_P0_DECISIONS / NOT_DEPLOYED`

This crate builds the paid-only Livepeer v1 market contract. It is intended for
fresh contract IDs; no deployed public-alpha contract is migrated in place.

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
- globally unique asset hash and playback ID bindings;
- mutable sale availability separated from immutable publication identity;
- Circle USDC tickets at 2 USDC or more with a 98% creator / 2% platform split;
- durable entitlement history and withdrawal liability restoration.
- NEAR withdrawal bounded by its recorded liability, storage staking and the
  configured operational reserve.

The ABI contains only the Livepeer job, publication, entitlement, takedown and
payment surfaces. Pause/resume, reconciliation and an exact same-job replay
cannot charge the creator again; a conflicting replay fails. A new job is a new
charge and no automatic provider-failure refund is implemented. The MediaJob
Borsh layout has no migration entrypoint and must use a fresh contract ID.

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

The contract remains code-only. Testnet, staging and production activation need
the later plan gates and separate approval.
