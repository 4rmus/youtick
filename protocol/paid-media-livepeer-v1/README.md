# Paid media Livepeer v1 protocol

Status: `PR_6_LOCAL_CODE / SPONSORED_UPLOAD_QUOTE_LOCAL / WEB_JOB_KEY_LIFECYCLE_LOCAL / WEB_UI_WIRING_LOCAL / PRODUCT_P0_LOCKED / BOUNDED_CHROME_EDGE_CANARY_PASS / D6_PARTIAL / RUNTIME_DISABLED`

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
- accepted source containers: MP4, MOV, AVI, WebM, WMV, MKV and FLV;
- browser upload chunks: fixed `33_554_432` bytes (32 MiB), one sequential
  PATCH at a time; only the final PATCH may be smaller;
- creator upload fee: `max(500_000, ceil(source_bytes / 1_000_000_000 * 300_000))`
  micro-USDC, charged once when a new job is created;
- sponsored upload fee: fixed `100_000` micro-USDC, added to the upload fee;
- sponsored upload delegate gas: fixed `100_000_000_000_000` gas with exactly
  one yoctoNEAR attached;
- ticket minimum: `2_000_000` micro-USDC; larger integer micro-USDC values are
  allowed and the existing 98/2 creator/platform split is unchanged;
- initial browser claim: desktop Chrome and desktop Edge only;
- operator methods: `finalize_livepeer_publication` and
  `suspend_livepeer_sales`, both with zero deposit;
- operator key: finite-allowance FunctionCall key for the exact receiver;
  FullAccess is forbidden.

The one-time public testnet beta overlays the existing protocol without changing
the Market Borsh layout: sponsored USDC is mandatory, source size is at most
1,000,000,000 bytes, each creator gets one job per UTC day, the global cap is
10 jobs, upload admission lasts 13 days, the beta ends after 14 days and each
job has an absolute 24-hour deadline. Raw versioned records enforce those
limits with 100,000-byte opening and 25,000-byte emergency runway floors.

The size constant is an admission and contract value. Browser, bridge and
contract reject `20_000_000_001` before provider mutation. One exact decimal
`20_000_000_000`-byte provider upload remains a production canary; a +1-byte
provider upload is neither required nor allowed.

The 20 GB value is a per-file product limit, not a monthly source-byte quota.
Admission has no monthly operation cap. Provider transcode, storage and delivery
costs remain minute-based and are not used to add a duration fee to the creator's
byte-based upload fee.

Upload is bound to the bridge-issued opaque TUS resource URL. The client reads
`Upload-Offset` and `Upload-Length` with HEAD before resuming, never creates a
second asset for a retry, never retries a 409 blindly and never sends parallel
PATCH requests to one resource. Pause, resume, reconciliation and a same-job
retry do not charge again. A new job is a new charge. No automatic refund is
defined. The technical-pilot creator upload fee is explicitly non-refundable,
including creator cancellation and provider failure.

Before requesting wallet approval, the browser calls the non-mutating
`/v1/upload-preflight` route. It checks the current creator allowlist and
admission capacity with the same rules used by upload-intent reservation, but
does not reserve capacity. The signed upload intent remains the authoritative
post-payment check, so a same-job retry is required if availability changes.

Creator upload authorization v2 uses one job-bound application Ed25519 key.
The browser creates it before payment, stores its secret only under the exact
account and job in `sessionStorage`, and sends only the public key in the one
USDC or native-NEAR payment transaction. The contract records payment and key
atomically. The Worker verifies the signed control request against the exact
final on-chain job key before provider admission. An accepted intent deletes
only the local secret.

Native NEAR payment uses `youtick.creator-fee-quote.v1`. The signed quote binds
network, fresh contract ID, creator, job, bytes, USD fee, NEAR/USD rate, exact
yoctoNEAR fee, source identity, timestamps and quote-key version. The contract
uses checked integer conversion and stores the quote SHA-256. The Worker reads
the Outlayer `wrap.near` cached view through the configured NEAR RPC and signs
the resulting job-bound quote only when the returned price is non-null and the
oracle's recency window is at most 60 seconds. Pyth Core on NEAR and
client/CEX/alternate API fallbacks are not settlement sources; empty or stale
oracle data disables only the native NEAR rail.

Sponsored USDC upload uses quote domain `youtick.sponsored-upload-quote` and
version `1`. The paid-job request is serialized without whitespace in this
fixed field order: creator, job, title, ticket price, source bytes, profile,
profile hash, upload public key and upload-key expiry. Its SHA-256 is bound into
the signed quote. The quote also binds the exact USDC receiver and
`ft_transfer_call`, 100 Tgas, one yoctoNEAR, issuance time, a maximum 200-block
delegate window and two-minute expiry. Sponsor pricing does not read the gas
price or NEAR/USD oracle; those remain specific to the native-NEAR rail.

The contract recomputes the byte fee, requires an exact `100_000` micro-USDC
sponsor fee and enforces `total_fee_usdc = upload_fee_usdc + 100_000`. It
accepts that total as one USDC transfer. It stores the total in the existing
USDC fee fields and the quote ID in `fee_quote_hash`; no Market state field or
event type is added. Omitting both sponsor fields preserves the existing USDC
path. The Bridge relayer source remains independently gated and disabled by
default.

The bridge operator uses a separate finite-allowance FunctionCall key for the
exact market and only `finalize_livepeer_publication` and
`suspend_livepeer_sales`. A separate guardian can freeze those bridge mutations
immediately. The technical-pilot admin alone can unfreeze and execute an
auditable pending bridge rotation; the runtime never holds a FullAccess key.
Multisig and timelock remain mandatory before mainnet general access.

Market v2 emits `youtick_market@1.0.0` NEP-297 events for job authorization and
upload-key replacement; publication finalization, sales suspension and
takedown; entitlement purchase; creator withdrawal start/success/failure;
platform withdrawal start; bridge governance; and quote-key rotation. Each
event contains contract/block context and a business idempotency key. Exact
replays emit no duplicate economic event. Raw upload keys, TUS URLs and provider
credentials are forbidden; key replacement includes only the public-key hash.
The fresh-ID design has no migration entrypoint, so `contract_migrated` remains
unimplemented rather than being emitted inaccurately.

The legacy Access transition contract is bounded for the fresh pilot ID: Play
grants require an exact resource, global/scope pause affects verification, each
owner has at most 16 active grants, listing and cleanup are paginated, and new
issuance can be disabled without deleting existing records. The v2 grant call
uses one explicit `request` object.

## Bound identity

Every job, provider and playback message binds the network, contract, job ID,
generation, creator, profile ID, profile configuration SHA-256 and expected
source byte count. Upload intents additionally bind the accepted source type
and the browser's bounded first/last-block source fingerprint.
Provider identities additionally bind the Livepeer project, asset ID hash and
playback ID.

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

The control routes are `POST /v1/upload-intents`,
`POST /v1/upload-heartbeats`, `POST /v1/upload-cancellations` and
`POST /v1/playback-tokens`. Upload intent, heartbeat and cancellation bind
`job:<job_id>:<generation>`; playback
binds `playback:<job_id>:<generation>:<playback_id>`. Expiry, nonce replay,
origin, account, session key and final on-chain checks are implemented in the
disabled Worker and remain mandatory at runtime.

Upload intent, heartbeat, cancellation and legacy playback-token routes consume
their signed `device_nonce` before downstream capacity/provider/authorization
work. The persisted nonce expires with the request and is removed in bounded
alarm batches; replay before expiry fails closed.

Upload-intent requests use control envelope version `3` because their exact
signed body requires `source_fingerprint_sha256`. Heartbeat, cancellation and
legacy v1 playback-token requests remain envelope version `2`; routes reject
the wrong version instead of silently accepting the changed body contract.

Upload intent v2 returns a random lease ID, 30-minute expiry and five-minute
heartbeat interval. Heartbeats use the same session-only upload key, recheck
the final on-chain job/key and never create another provider resource. The web
preserves that local key through provider processing and clears it once the
NEAR publication exists. Failure/reload keeps the key for same-resource recovery.

In the public testnet beta packet, an upload intent may additionally sign
`recovery: "reconcile"`. It requires an existing exact job and returns only
`{ job_id, generation, state }`, without TUS/provider identifiers. It consumes
a fresh nonce and uses the same final job/key, source fingerprint and beta
deadline checks. It never creates or deletes an asset or charges another fee.
The durable alarm also reconciles unpublished jobs through the existing ready
verification/finalize path, with bounded 60–900 second backoff and no deadline
extension. Provider read failures remain unavailable during backoff.

Replacing a waiting asset is rejected. Deletion remains restricted to the
existing exact takedown/expired operation. Public-beta upload-key replacement
is not offered: the original beta request hash binds the original key and its
expiry. A missing/mismatched browser key fails before any wallet action; an
already-uploaded job can still be reconciled by its durable alarm. Restoring a
lost key is not claimed as supported by this source package.

The creator may use that same job-bound session key to cancel only while the
durable job is `AUTHORIZED` or `LEASED`, before provider creation begins. The
bridge records terminal `CANCELLED`, idempotently releases any lease and returns
`refundable: false`. Provider-pending, uploaded and later states reject this
route; it is not a provider deletion operation. The on-chain paid job remains
the non-refundable audit record and a later upload requires a new job.
Repeated cancellation with a fresh nonce is idempotent; replaying an already
consumed nonce is rejected.

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
- technical-pilot creator upload fees remain non-refundable after creator
  cancellation, provider loss or takedown;
- only the creator may restart an unpublished job; restart increments the
  generation and invalidates older intent, webhook and finalize work;
- a published job cannot restart and requires a new publication job.

The Worker now persists verified readiness and an idempotent NEAR finalize
outbox. Remaining takedown and operator runbook work belongs to PR-6;
this protocol text does not claim that those runtime paths are deployed.

## Playback token request

The playback request reuses the canonical envelope and binds the account,
resource, job generation, grant, exact playback ID and the on-chain grant's
origin and device hashes. The Worker must read entitlement and grant at one
final block, issue short-lived ES256 JWTs, return `Cache-Control: no-store` and
use the `Livepeer-Jwt` HLS header.

## Stateless playback v2 transition

The separately gated `POST /v2/playback-tokens` route removes the Access grant
and Durable Object nonce from the playback hot path. It accepts exactly five
top-level fields: `body`, `certificate`, `certificate_proof`, `request` and
`request_signature`.

- `body` binds `publication_id`, `generation` and the exact `playback_id`.
- The `youtick.device-session` version-1 certificate binds network, account,
  device public key, origin hash, the sole `play` scope, issue time and expiry.
  Its lifetime is at most eight hours.
- `certificate_proof` is a NEP-413 wallet signature whose recipient is the
  configured Market contract. The signing key must still exist as a final
  FullAccess key; removing it invalidates the certificate.
- The `youtick.playback-request` version-1 envelope binds network, Market
  contract, account, origin, request nonce, expiry and SHA-256 hashes of both
  the canonical body and certificate. The device session key signs the ten
  fields in their schema order, joined by newline.
- The authorizer checks the exact final publication tuple and a same-block
  entitlement. `ACTIVE` and `SALES_SUSPENDED` allow existing entitlement;
  `TAKEDOWN` and every uncertain read fail closed.
- The authorizer also checks Livepeer playback metadata and requires a `vod`
  resource protected by the `jwt` policy. Provider uncertainty fails closed.

The route issues an ES256 playback-ID-bound JWT lasting at most 180 seconds,
returns `Cache-Control: no-store`, does not call a Durable Object and makes no
persistent write. Replaying the same still-valid signed request does not expand
authority: it repeats final checks for the same account/origin/publication and
returns another bounded token. This is deliberate stateless behavior, not a
claim of one-time request consumption.

The bounded per-isolate cache holds at most 1,024 entries: publication and
provider policy for 30 seconds, wallet-certificate verification for 60 seconds,
positive entitlement for five minutes and negative entitlement for three
seconds. A fully warm authorization uses zero NEAR/provider calls. Takedown and
wallet-key removal are rechecked at their 30/60-second bounds respectively.

The browser keeps the generated device secret only in memory and clears it on
explicit disconnect or page reload. V1 remains an independent closed fallback;
v2 has no deployment evidence. The local opt-in abuse test rejects 100,000
wrong-origin requests without external calls, Durable Object access or cache
growth.

The default-off shadow transition permits one optional `shadow_v2` field on a
legacy wire request. That field is the exact independently signed five-field v2
request above and is not covered by, nor able to modify, the legacy envelope.
The Worker removes it before Durable Object forwarding, returns only the legacy
result, and evaluates the v2 decision in background without JWT issuance or
persistent state. Logs contain only bounded decision and reason-code enums.

## Validation

Run:

```bash
node scripts/check-paid-media-livepeer-v1.mjs
```

The check validates `golden-vectors.json` against `schema.json`, recomputes the
canonical body hashes and signed messages, and verifies the creator and sponsored
fee quotes.

Current architecture: [YouTick architecture](../../docs/architecture/README.md).
