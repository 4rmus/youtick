# YouTick paid media access-control contract

Status: `LIVEPEER_V1 / CODE ONLY / NOT DEPLOYED`

This crate builds the Livepeer v1 playback authorization contract for fresh
contract IDs. Its only session scope is `Play`; a subject, the contract owner,
or the market contract may issue a grant after proving control of the ephemeral
session key.

Core behavior:

- `state_version=2` fresh-state contract with a readable owner/market/pause
  state summary;
- short-lived origin-, device- and mandatory resource-bound Play grants;
- proof of possession for the ephemeral Ed25519 session key;
- individual or subject-wide revocation;
- at most 16 active legacy grants per owner, 16-record pagination and bounded
  expired/revoked cleanup;
- independently disableable new-grant issuance while existing verification
  remains available;
- scope and contract pause controls behind a 24-hour timelock;
- two-step ownership transfer.

`issue_session_grant` accepts one `request` object. This is a fresh-v2 ABI and
is not an in-place upgrade of the current testnet Access contract.

The local decommission regression proposes issuance disablement, permits a
grant created during the 24-hour delay, executes the disablement, rejects every
new grant, preserves verification of the already-issued grant, then proves
subject revoke and bounded cleanup. Runtime execution remains a separately
approved testnet action.

## Build and verify

```bash
cargo +1.86.0 test
cargo +1.86.0 near build non-reproducible-wasm
```

Local pinned build evidence: Rust 1.86.0 and cargo-near 0.17.0 produced a
204,387-byte WASM with SHA-256
`4cda2b77cee5b9d670805de3b62e05688ac1f4439d6ac487212d2711b99baf80`.
It has not been deployed or activated.
