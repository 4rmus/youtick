# YouTick paid media market contract

Status: `V4 SUPERSEDED / CODE ONLY / NOT DEPLOYED`

This crate builds the superseded paid-only v4 market contract. It is retained
as code-only history while the Livepeer v1 target is implemented. The deployed
public-alpha contract remains unchanged until a separately approved cutover.

The contract supports:

- creator-owned paid media jobs;
- exact source byte length plus a generation-bound browser ingest key;
- generation-bound full-byte Lighthouse verification;
- five distinct KMS store/readback receipts;
- raw R2 source delete/not-found evidence;
- one idempotent combined finalizer;
- Circle USDC purchase with a 98% creator / 2% platform split;
- one paid entitlement per buyer and publication;
- creator and platform withdrawal with liability restoration on failed transfer.

It does not expose gift, trial, free, onboarding, prepaid, Studio, upload-session
or object-v1 launch methods or state.

`create_paid_job` accepts the source length and browser-generated Ed25519 public
key in the same wallet transaction that authorizes the paid job. The source is
limited to `20_000_000_000` bytes. Restart rotates the key and increments the
generation.

Protocol details and exact bindings are in
`protocol/paid-media-v4/README.md`.

## Build and verify

Use Rust 1.86 because newer WASM output is not supported by the pinned NEAR
runtime:

```bash
cargo +1.86.0 fmt --all --check
cargo +1.86.0 clippy --all-targets -- -D warnings
cargo +1.86.0 test --lib
cargo +1.86.0 test --test paid_media_v4
cargo +1.86.0 test --test sandbox
cargo +1.86.0 near build non-reproducible-wasm
```

No artifact from this directory is approved for deployment until it is produced
by a green `main` CI run and PR-5 authorizes testnet deployment.
