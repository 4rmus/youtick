# YouTick paid media access-control contract

Status: `V4 TARGET / CODE ONLY / NOT DEPLOYED`

This crate builds the fresh v4 playback authorization contract. Its only
session scope is `Play`; publishing is authorized by the market/media-job flow
and no gift, trial or claim scopes remain in the ABI.

Core behavior:

- short-lived origin- and device-bound Play grants;
- proof of possession for the ephemeral Ed25519 session key;
- individual or subject-wide revocation;
- scope and contract pause controls behind a 24-hour timelock;
- two-step ownership transfer.

## Build and verify

```bash
cargo +1.86.0 test
cargo +1.86.0 near build non-reproducible-wasm
```

The deployed public-alpha access contract remains unchanged until a separately
approved v4 cutover.
