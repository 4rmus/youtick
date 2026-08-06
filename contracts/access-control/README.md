# YouTick paid media access-control contract

Status: `LIVEPEER_V1 / CODE ONLY / NOT DEPLOYED`

This crate builds the Livepeer v1 playback authorization contract for fresh
contract IDs. Its only session scope is `Play`; a subject, the contract owner,
or the market contract may issue a grant after proving control of the ephemeral
session key.

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

Deployment and activation require separate approval.
