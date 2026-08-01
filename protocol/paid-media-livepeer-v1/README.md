# Paid media Livepeer v1 protocol

Status: `CODE_ONLY / BLOCKED_BY_P0_DECISIONS / NOT_DEPLOYED`

This directory locks the messages shared by the future web, bridge Worker and
NEAR contracts. It does not implement or enable any runtime.

## Constants

- protocol: `youtick.paid-media-livepeer-v1.protocol.v1`;
- control-signature domain: `youtick.paid-media-livepeer-v1.control`;
- publication profile: `paid-media-livepeer-v1`;
- maximum declared source size: decimal `20_000_000_000` bytes;
- initial browser claim: desktop Chrome and desktop Edge only;
- operator methods: `finalize_livepeer_publication` and
  `suspend_livepeer_sales`, both with zero deposit;
- operator key: finite-allowance FunctionCall key for the exact receiver;
  FullAccess is forbidden.

The size constant is an admission and contract value. Whether Livepeer can
reject `20_000_000_001` before provider cost remains a P0 decision/canary and
must not be inferred from this schema.

## Bound identity

Every job, provider and playback message binds the network, contract, job ID,
generation, creator, profile ID, profile configuration SHA-256 and expected
source byte count. Provider identities additionally bind the Livepeer project,
asset ID hash and playback ID.

Asset ID and playback ID uniqueness is global within the v1 contract, not only
within one job. An old generation cannot publish. Exact finalize replay is
idempotent; any conflicting replay fails.

## Canonical control request

The signed envelope fields are UTF-8 strings joined with one LF (`\n`) in this
exact order, with no trailing LF:

```text
domain
version
method
route
network
contract_id
account_id
resource
session_public_key
origin
device_nonce
expires_at_ms
body_sha256
```

Every string field rejects CR and LF. `body_sha256` is the lowercase SHA-256 of
the UTF-8 request body serialized as canonical JSON: object keys sorted by
Unicode code point, arrays kept in order, no insignificant whitespace. The
golden vector is the executable interoperability example.

The initial routes are `POST /v1/upload-intents` and
`POST /v1/playback-tokens`. Upload binds `job:<job_id>:<generation>`; playback
binds `playback:<job_id>:<generation>:<playback_id>`. Expiry, nonce replay,
origin, account, session key and final on-chain checks remain mandatory runtime
checks in later PRs.

## Publication tuple

`finalize_livepeer_publication` accepts the tuple represented by
`finalize_publication` in the schema. The bridge must re-fetch provider state
before submission. Optional provider fingerprints are provider-issued audit
metadata and are not independent integrity evidence.

Publication availability is separate from immutable identity:

- `ACTIVE`: new sales and entitled playback are allowed;
- `SALES_SUSPENDED`: new sales fail; existing entitlement playback is allowed;
- `TAKEDOWN`: new sales and playback tokens fail; entitlement history remains.

Refund and resume authority remain P0 product/governance decisions.

## Playback token request

The playback request reuses the canonical envelope and binds the account,
resource, job generation, grant and exact playback ID. The later Worker must
read entitlement and grant at one final block, issue short-lived ES256 JWTs,
return `Cache-Control: no-store` and use the `Livepeer-Jwt` HLS header.

## Validation

Run:

```bash
node scripts/check-paid-media-livepeer-v1.mjs
```

The check validates `golden-vectors.json` against `schema.json`, recomputes the
canonical body hash and signed message, verifies target-document truth and
checks local links in the PR-0 documents.

Architecture decision: [ADR-010](../../docs/adr/adr-010-livepeer-paid-media.md).
Implementation sequence:
[NEAR + Livepeer Paid Media v1](../../docs/architecture/near-livepeer-paid-media-implementation-plan.md).
