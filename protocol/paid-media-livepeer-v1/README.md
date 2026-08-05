# Paid media Livepeer v1 protocol

Status: `PR_6_LOCAL_CODE / WEB_JOB_KEY_LIFECYCLE_LOCAL / WEB_UI_WIRING_LOCAL / PRODUCT_P0_LOCKED / BOUNDED_CHROME_EDGE_CANARY_PASS / D6_PARTIAL / RUNTIME_DISABLED`

This directory locks the messages shared by the future web, bridge Worker and
NEAR contracts. A dedicated testnet contract exists for bounded allowance
evidence; no Worker, web, staging or production runtime is enabled.

## Constants

- protocol: `youtick.paid-media-livepeer-v1.protocol.v1`;
- control-signature domain: `youtick.paid-media-livepeer-v1.control`;
- publication profile: `paid-media-livepeer-v1`;
- profile configuration SHA-256:
  `96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77`
  for the canonical 720p H.264 Baseline configuration;
- maximum declared source size: decimal `20_000_000_000` bytes;
- browser upload chunks: fixed `33_554_432` bytes (32 MiB), one sequential
  PATCH at a time; only the final PATCH may be smaller;
- creator upload fee: `ceil(source_bytes / 1_000_000_000 * 300_000)` micro-USDC,
  charged once when a new job is created;
- ticket minimum: `2_000_000` micro-USDC; larger integer micro-USDC values are
  allowed and the existing 98/2 creator/platform split is unchanged;
- initial browser claim: desktop Chrome and desktop Edge only;
- operator methods: `finalize_livepeer_publication` and
  `suspend_livepeer_sales`, both with zero deposit;
- operator key: finite-allowance FunctionCall key for the exact receiver;
  FullAccess is forbidden.

The size constant is an admission and contract value. Browser, bridge and
contract reject `20_000_000_001` before provider mutation. One exact decimal
`20_000_000_000`-byte provider upload remains a production canary; a +1-byte
provider upload is neither required nor allowed.

The 20 GB value is a per-file product limit, not a monthly source-byte quota.
Monthly admission uses a separate provider-operation budget. Its production
value is a D6 decision and the Worker fails closed while it is unset. Provider
transcode, storage and delivery costs remain minute-based and are not used to
add a duration fee to the creator's byte-based upload fee.

Upload is bound to the bridge-issued opaque TUS resource URL. The client reads
`Upload-Offset` and `Upload-Length` with HEAD before resuming, never creates a
second asset for a retry, never retries a 409 blindly and never sends parallel
PATCH requests to one resource. Pause, resume, reconciliation and a same-job
retry do not charge again. A new job is a new charge. No automatic refund is
defined.

Creator upload authorization v2 uses one job-bound application Ed25519 key.
The browser creates it before payment, stores its secret only under the exact
account and job in `sessionStorage`, and sends only the public key in the one
USDC or native-NEAR payment transaction. The contract records payment and key
atomically. The Worker verifies the signed control request against the exact
final on-chain job key before provider admission. Normal upload never calls
`AddKey`, `DeleteKey` or `signAndSendTransactions`; an accepted intent deletes
only the local secret. The previous access-key control v1 vector remains as
`HISTORICAL_NOT_ACCEPTED` evidence.

Native NEAR payment uses `youtick.creator-fee-quote.v1`. The signed quote binds
network, fresh contract ID, creator, job, bytes, USD fee, NEAR/USD rate, exact
yoctoNEAR fee, source identity, timestamps and quote-key version. The contract
uses checked integer conversion and stores the quote SHA-256. The Worker reads
the Outlayer `wrap.near` cached view through the configured NEAR RPC and signs
the resulting job-bound quote only when the returned price is non-null and the
oracle's recency window is at most 60 seconds. Pyth Core on NEAR and
client/CEX/alternate API fallbacks are not settlement sources; empty or stale
oracle data disables only the native NEAR rail.

The bridge operator uses a separate finite-allowance FunctionCall key for the
exact market and only `finalize_livepeer_publication` and
`suspend_livepeer_sales`. The platform governance account controls add/remove
and rotation; the runtime never holds a FullAccess key.

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

The browser sends the base64 Ed25519 signature of the canonical message in
`X-Youtick-Signature`. For upload intents, the bridge proves that
`session_public_key` exactly matches the unexpired `upload_public_key` stored on
the media job at the same final NEAR block and atomically rejects a reused
`device_nonce`.

The initial routes are `POST /v1/upload-intents` and
`POST /v1/playback-tokens`. Upload binds `job:<job_id>:<generation>`; playback
binds `playback:<job_id>:<generation>:<playback_id>`. Expiry, nonce replay,
origin, account, session key and final on-chain checks are implemented in the
disabled Worker and remain mandatory at runtime.

## Publication tuple

`finalize_livepeer_publication` accepts
`{ "submission": <finalize_publication> }`, where `finalize_publication` is the
tuple represented in the schema. The bridge must re-fetch provider state before
submission. Optional provider fingerprints are provider-issued audit metadata
and are not independent integrity evidence.

Publication availability is separate from immutable identity:

- `ACTIVE`: new sales and entitled playback are allowed;
- `SALES_SUSPENDED`: new sales fail; existing entitlement playback is allowed;
- `TAKEDOWN`: new sales and playback tokens fail; entitlement history remains.

The accepted product policy is:

- sale cannot open before a provider-ready publication is finalized;
- `SALES_SUSPENDED` rejects new purchases and preserves existing entitlement
  playback;
- `TAKEDOWN` rejects new purchases and playback while preserving entitlement
  history and an auditable action record;
- closed-canary refunds for permanent provider loss or takedown are manual and
  recorded; automatic refund logic is deferred until volume justifies it;
- only the creator may restart an unpublished job; restart increments the
  generation and invalidates older intent, webhook and finalize work;
- a published job cannot restart and requires a new publication job.

The Worker now persists verified readiness and an idempotent NEAR finalize
outbox. Remaining takedown, refund and operator runbook work belongs to PR-6;
this protocol text does not claim that those runtime paths are deployed.

## Playback token request

The playback request reuses the canonical envelope and binds the account,
resource, job generation, grant, exact playback ID and the on-chain grant's
origin and device hashes. The Worker must read entitlement and grant at one
final block, issue short-lived ES256 JWTs, return `Cache-Control: no-store` and
use the `Livepeer-Jwt` HLS header.

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
