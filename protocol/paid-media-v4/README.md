# Paid media v4 contract protocol

Status: `CODE_ONLY / NOT_DEPLOYED`

This protocol is the paid-only launch surface implemented by
`contracts/nft-ticket` and `contracts/access-control`.

## Roles

- creator: creates and may restart its own media job;
- independent verifier: records one full-byte Lighthouse readback receipt;
- five distinct KMS operators: each records durable store/readback;
- source cleanup account: records fresh R2 HEAD/GET not-found and zero
  object/multipart inventory;
- any account: may call the combined finalizer after every gate passes;
- buyer: purchases a published item with Circle USDC;
- platform account: accrues the 2% commission.

The verifier and source cleanup accounts must be distinct from each other and
from all five KMS operators.

PR-1 authenticates receipts through immutable NEAR predecessor accounts. It
does not yet provide operator rotation or a signed-receipt relay. PR-3 must bind
runtime identities to registry-governed rotation before any deployment.

## Bound tuple

Every publication gate binds:

- `job_id`;
- `generation`;
- canonical `manifest_sha256`.

Restart increments `generation` and clears all earlier evidence. Evidence from
an older generation cannot publish.

`create_paid_job` also binds the exact source byte length and a browser-generated
Ed25519 ingest key. The key is used only for the private R2 control routes, so
the wallet authorizes the job once and does not receive `signMessage` prompts.

## Browser ingest control

PR-2 adds persisted `Create`, `UploadPart grant`, provider `ListParts`,
`Complete` and `Abort` routes. The browser stores its device key and file
fingerprint in IndexedDB, re-queries provider inventory after reload/reselect,
and uploads only missing fixed 64 MiB parts. The final part must equal the exact
remaining byte length.

Every control request binds method, route, timestamp, nonce and body digest to
the on-chain device key. Origin, creator, job, generation, prefix and part scope
fail closed. Media bytes are sent only to the signed private R2 URL.

The active Durable Object alarm and the bucket lifecycle policy both enforce a
24-hour raw-source limit. Apply `r2-cors.json` and `r2-lifecycle.json` to the
private bucket before enabling the feature.

Status remains `CODE_ONLY / FEATURE_DISABLED / NOT_DEPLOYED`. Real R2 tests for
exact part behavior, 30%/70% browser interruption and the exact 20 GB device
matrix remain release gates.

## Required publication facts

`finalize_paid_publish` succeeds only after:

1. the independent verifier records `full_readback=true`, manifest CID,
   canonical manifest SHA-256, pack-root SHA-256, logical byte count and pack
   count;
2. all five configured KMS operators independently record
   `stored_and_read_back=true`;
3. the cleanup account records both HEAD and GET not-found plus exact
   `object_count=0` and `multipart_count=0`.

Receipt digests and roots are lowercase 64-character SHA-256 hex. Replaying the
same receipt or finalizer call is idempotent. A conflicting replay fails.

## Purchase and entitlement

`ft_on_transfer` accepts only the Circle USDC account selected from the market
contract network:

- NEAR testnet:
  `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`;
- NEAR mainnet:
  `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`.

The message is:

```json
{"publication_id":"job-1"}
```

An accepted purchase records one entitlement and allocates exactly 98% to the
creator and 2% to the platform. Prices that cannot split exactly at USDC's
integer precision are rejected when the job is created. A wrong amount or
duplicate entitlement returns the full transfer amount.

Failed creator or platform withdrawals restore the on-chain liability.

## Deliberate boundary

This PR does not deploy contracts or implement browser ingest, processor,
verifier runtime, KMS worker submission/rotation, playback or mainnet cutover.
Those are later PRs in
`docs/architecture/decentralized-paid-media-v4-plan.md`.
