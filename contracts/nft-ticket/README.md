# YouTick paid media market contract

Status: `LIVEPEER_V1 / CODE_ONLY / BLOCKED_BY_P0_DECISIONS / NOT_DEPLOYED`

This crate builds the paid-only Livepeer v1 market contract. It is intended for
fresh contract IDs; no deployed public-alpha contract is migrated in place.

The contract supports:

- creator-owned, generation-bound paid media jobs;
- the exact `paid-media-livepeer-v1` profile and configuration hash;
- bridge-only, idempotent Livepeer publication finalization;
- globally unique asset hash and playback ID bindings;
- mutable sale availability separated from immutable publication identity;
- Circle USDC purchase with a 98% creator / 2% platform split;
- durable entitlement history and withdrawal liability restoration.

The ABI does not contain the superseded v4 KMS, CID, byte-receipt, source-delete
or browser ingest-key fields. Resume and takedown authority remain P0 decisions,
so PR-1 adds no such governance method.

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
