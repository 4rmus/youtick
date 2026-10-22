# Livepeer Bridge Worker

This Worker is the control plane for direct browser-to-Livepeer upload and
authenticated playback. Source video and HLS bytes must never be sent through
its routes. The public publication-cover route is the only exception: after a
final NEAR check, it returns a cached, size-limited first-frame image without
exposing the upstream JWT or private thumbnail URL.

It also exposes a stateless NEAR Intents 1Click adapter. The adapter derives the
final Circle USDC amount from final NEAR state, verifies signed 1Click responses
and returns deposit instructions. It never receives funds, grants playback or
creates a payment ledger.

## Safety state

`LIVEPEER_BRIDGE_ENABLED=false` is the default. New UploadJob intents separately
require `LIVEPEER_NEW_UPLOADS_ENABLED=true`; switching it off leaves an existing
intent, signed heartbeat and TUS recovery path available. Both legacy and v2
playback token routes require `LIVEPEER_PLAYBACK_ISSUANCE_ENABLED=true`.
Stateless playback v2 additionally requires `LIVEPEER_PLAYBACK_V2_ENABLED=true`.
Legacy/v2 shadow comparison separately requires
`LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED=true`; it defaults to false, returns only
the legacy response and runs the existing v2 decision path through
`waitUntil` without signing another JWT or writing Durable Object state.
All Durable Object paths share a 256 persistent-record ceiling. Creating record
257 fails closed as `durable_object_record_limit`; idempotent replay or update
of an existing key remains available at the ceiling. Retention/archive rules,
not silent deletion, free capacity.
New provider creates separately require `LIVEPEER_PROVIDER_MUTATIONS_ENABLED=true`;
turning it off does not block provider reads or an existing TUS recovery.
NEAR finalize and sales-suspension sign/broadcast require
`LIVEPEER_OPERATOR_MUTATIONS_ENABLED=true`; final-chain reconciliation remains
readable while it is off.
All tracked defaults are false. The native-NEAR creator-fee gate is independently
disabled. Installing, testing or dry-running this package does not deploy or
activate it.

Sponsored creator upload is independently gated by
`LIVEPEER_SPONSORED_UPLOADS_ENABLED=false`; NEAR sign/broadcast additionally
requires `LIVEPEER_SPONSOR_RELAYER_MUTATIONS_ENABLED=false` to be enabled.
`POST /v1/sponsored-upload-quotes` reuses the creator allowlist, admission
budget and quote key and adds a fixed `100000` micro-USDC sponsor fee.
`POST /v1/sponsored-upload-relays`
accepts one canonical Ed25519 SignedDelegate for the exact Circle-USDC
`ft_transfer_call`, persists only ambiguous outer-transaction state in the
existing Durable Object class and reconciles against the final market job.
The dedicated relayer account ID/key epoch are public configuration; its
private key is a Worker secret and must not reuse the market or operator role.

`POST /v2/playback-tokens` verifies an eight-hour maximum wallet-authorized
device certificate, a session-key-signed request, final publication state,
entitlement and Livepeer JWT playback policy, then returns a playback-ID-bound
JWT lasting at most 180 seconds. The route calls no Durable Object and performs
no persistent write. A replay
within the signed request lifetime can only request the same authorized
playback capability; final chain checks still run and the JWT remains bounded.

The per-isolate v2 cache is capped at 1,024 records. Publication and provider
policy entries last 30 seconds, wallet-certificate verification lasts 60
seconds, positive entitlement lasts five minutes and negative entitlement lasts
three seconds. A fully warm request performs no NEAR or provider call; cache
misses fail closed. `LIVEPEER_API_KEY` is therefore required when v2 is enabled.

When shadow is enabled and the browser supplies `shadow_v2`, the legacy route
strips that field before Durable Object forwarding. After the legacy response
is fixed, background work logs only ALLOW/DENY/UNAVAILABLE, the two bounded
reason codes and whether they match. It produces no v2 token and cannot alter
the legacy status or response body.

Rate-limit objects delete all state when their minute/5-second window expires.
Control nonces retain only the signed request's bounded expiry and are removed
by the job alarm in 128-record batches; legacy timestamp-only entries use the
same five-minute maximum request window. Webhook dedup records expire after 30 days and admission-reopen audit records
after 90 days. Testnet terminal UploadJob summaries have a separate, default-off
D1 archive gate. Archive commit/retry and the 14-day eligibility timestamp are
implemented locally, but UploadJob deletion remains absent until a real D1
commit and legacy-v1 playback independence are proven. Operator-outbox archive
remains later lifecycle work.

The closed pilot admission coordinator allows two active jobs globally, one per
creator, and two attempts per creator per UTC day. Each normal reservation has
a random lease ID, a 30-minute expiry and a five-minute signed heartbeat from
the same session-only upload key. Missing heartbeats release the slot by alarm.
A separate 15-minute ambiguous-create reservation expires without closing
admission for unrelated creators; its job object remains the authority that
prevents a second provider create. The operator-only status route reports these
exact limits. Production Queue wiring remains Phase 3 work.

UploadJob's implemented transitions use one allowed-predecessor table and stamp
`stateChangedAtMs` on every real change. Existing v1 records without that field
remain readable. A signed intent whose final on-chain job matches is persisted
as `AUTHORIZED`; a successful coordinator reservation advances it to `LEASED`,
and the state becomes `PROVIDER_CREATE_PENDING` immediately before the external
create call. Admission failure leaves `AUTHORIZED` recoverable with a fresh
request nonce. The first session-key-signed heartbeat advances the job to
`UPLOADING`; authenticated provider processing advances it to `PROCESSING`.
An exact coordinator lease denial marks `UPLOAD_EXPIRED`; coordinator outages
do not. A creator-session-signed cancellation is accepted only from
`AUTHORIZED` or `LEASED`, before provider creation starts. It records terminal
`CANCELLED`, idempotently releases an existing lease and explicitly returns
`refundable: false`; provider-pending and later states reject cancellation.
Authenticated `asset.failed` or
`asset.deleted` events set `PROVIDER_FAILED`, stamp the terminal time and
idempotently release the admission slot; destructive cleanup remains disabled.
Failed finalize outbox calls persist `FINALIZE_RETRY` and reuse the same
publication/idempotency data. They also persist a capped attempt count, last
HTTP status and next-attempt timestamp across 60/120/240/480/900-second backoff;
an unrelated early alarm cannot bypass that timestamp, and success clears the
retry metadata.

Provider creation records exactly one attempt, its start time and the explicit
`RECONCILE_ONLY` retry policy before the external request. Success records its
completion time. Any uncertain response records an ambiguity time and bounded
`provider_create_ambiguous`, `provider_unavailable` or
`provider_admission_closed` class. A later upload-intent never performs a
second create. 402/429 immediately keeps the existing provider-wide admission
closure behavior. One 5xx/timeout leaves unrelated creators open; two
independent 5xx/timeouts inside 60 seconds close shared admission. Reopening
that circuit requires the existing operator-authenticated
`INVENTORY_RECONCILED` evidence and clears the reconciled ambiguous
reservations.

The NEAR operator outbox keeps nonce, block hash and signed transaction bytes
only while retry/reconciliation may still need them. Exact final-chain
confirmation stamps `confirmedAtMs`, retains only method, idempotency/payload
hashes, creation time and an optional public transaction hash, and removes raw
finalization input plus retry-only fields. The independent
`OPERATOR_OUTBOX_ARCHIVE_ENABLED=false` gate can write that bounded testnet
summary to D1 with exact readback and a 90-day cleanup-eligibility timestamp.
Archive failure retries through a bounded alarm scan. No confirmed record is
deleted; real D1 commit, elapsed retention and audit-hold proof remain required.

New UploadJob records use `youtick.livepeer-control-job.v2`. Upload-intent
control envelope v3 signs a bounded browser source fingerprint and the job
persists its first value; a same-job retry with another fingerprint fails
before another provider resource is created. Stored v1 records remain readable
but cannot silently acquire a fingerprint during recovery. Heartbeats remain
control envelope v2. Creator cancellation also uses control envelope v2 and
the exact final on-chain job-bound session key.

### Media provider boundary

Every provider call crosses the `MediaProvider` contract in `src/media-provider.ts`:
upload creation, TUS offset reads, asset and playback reads, ready-asset
verification, deletion, playback token signing (`signPlayback`), webhook
authentication and normalization (`verifyWebhook`, `parseWebhook`), the asset
identity binding (`identityMatches`), the playback host allowlist
(`hostAllowlist`), the profile catalog (`supportsProfile`, `describeProfile`)
and the cover read (`readCover`). Each adapter also declares `capabilities`
(storyboard, MP4, source hash, delete webhook, custom ladder, how the source
byte count is proven, and whether the playback token travels in a header or the
URL path).

Studio hosts, headers and credentials appear only in the two Studio runtime
modules. `src/livepeer-provider.ts` is the Studio adapter: the API and TUS
hosts, the playback host allowlist, the `Livepeer-Signature` and `Livepeer-Jwt`
header names, the ES256 playback JWT, the `t=,v1=` webhook HMAC, the
`creatorId` `<jobId>:<generation>` routing value, the webhook dedup digest
(`sha256(timestamp, rawBodyHash, asset.id, status.phase)`, unchanged) and the
frozen `profiles.json` catalog. `src/livepeer-verification.ts` (below) carries
the Studio probes, including the forged ES256 token shapes and the
`livepeer_media` dependency label. `index.ts` selects an adapter with
`mediaProvider(env, job | publicationHash)` from one registry
(`MEDIA_PROVIDER_REGISTRY`): a job record's optional `provider` field (absent
means `studio`, so every existing record reads unchanged; an unknown value fails
closed with `runtime_not_configured`) or a publication's
`profile_config_sha256` through each registered `supportsProfile`, which also
backs every request-side profile check; the default is Studio. `/__health`
reports `mediaProvider.kind`.

Webhook ingress keeps the pinned `youtick.livepeer-webhook-queue.v1` message and
forwards the exact raw body; the direct path adds the internal
`X-YouTick-Provider` header and the Queue path falls back to the job record.
The job object consumes a `NormalizedWebhookEvent` (`ready`, `processing`,
`failed`, `deleted`, plus the provider phase and digest); its own alarm and
reconcile observations are synthesized in that envelope by
`src/provider-webhook.ts`. `src/cover-image.ts` is the neutral bounded cover
reader. Dependency logs keep the `livepeer_*` labels for Studio;
`media_api`, `media_tus` and `media_cdn` are reserved for other adapters.
Deploy identities (Worker name, `LivepeerControl`, Queue names, `LIVEPEER_*`
variables and secrets, schema literals) and the on-chain method names are
unchanged.

UploadJob state stores only normalized asset, playback, project and
resumable-upload identifiers. Ready-asset verification is invoked through
`MediaProvider.verifyReadyAsset` and returns only normalized publication
evidence. `src/provider-verification.ts` is the provider-neutral core: identity
through the adapter's `identityMatches`, ready state, the byte proof chosen by
the `sourceBytesProof` capability (Studio keeps `declared-size`; `tus-offset`
reads the upload offset at readiness and reuses stored evidence in `published`
mode), the HLS invariants of an adapter-declared `ManifestPolicy` (alternate
media, allowed query keys, `EXT-X-ENDLIST`, init segment, denied statuses per
surface), anonymous denial probes, the request/time budget and the
pending/checkpoint contract, all unchanged for Studio. Token placement is the
adapter's `capabilities.tokenPlacement`; the core refuses a `path` adapter whose
authorized request sets a header and a `header` adapter that rewrites the URL.
A unit test keeps Studio hosts, headers and MIME types out of the neutral
modules and out of `index.ts`. `src/livepeer-verification.ts` holds the Studio
probes: `Livepeer-Jwt` header credentials, forged ES256 shapes, the MP4
cross-check with the portrait transpose quirk, the VTT storyboard and the
download URL. Published-mode reconciliation passes `mode: 'published'`; the
Studio adapter ignores mode, upload URL and stored evidence.

The canonical `tus-offset` byte proof is `SourceBytesEvidence`
`{ method: 'tus-offset', offsetBytes, lengthBytes, observedAtMs }`. The job
object stores it on the job record (`sourceBytesEvidence`) no later than the
`READY_VERIFIED` write that clears the upload URL, and passes it back as
`storedEvidence` in published mode. Evidence that is missing in published mode
raises `verification_evidence_missing`, which is outside the strong and
inventory drift sets: the job stays `PROVIDER_UNKNOWN` and no sales suspension
is queued. Evidence that does not match the expected bytes is
`provider_state_invalid` (strong drift).

M2 notes: the pending/checkpoint contract is reachable today only through an
adapter's deferred denial list (Studio storyboard thumbnails). A Stream ready
webhook can arrive before every rendition is listed, so M2-G3 must add a pending
path for missing renditions instead of failing with a strong drift code.

Webhook Queue transport is source-complete behind
`LIVEPEER_WEBHOOK_QUEUE_ENABLED=false`. When enabled with a `LIVEPEER_EVENTS`
binding, ingress verifies the Livepeer HMAC and timestamp, sends the bounded raw
event to Queue and returns `202` without entering the job object or probing the
provider. The consumer ACKs successful and permanently invalid messages, and
retries temporary job-object failures. New messages carry a decimal enqueue
timestamp; every valid ACK/retry emits bounded `queueLagMs` without job,
payload or provider identifiers. The accepted pilot policy is locked to
batch 10, five-second timeout, three retries, concurrency 1, four-day retention
and `youtick-livepeer-events-dlq-testnet`; ingress and consumption fail closed
if the policy values drift. The dedicated testnet Queue and DLQ now exist, and
the tracked Wrangler file contains the matching producer/consumer source
configuration. No Worker is deployed and the provider reports zero attached
producers/consumers, so the tracked gate remains false. Any later deployment
must match
Cloudflare's [consumer configuration](https://developers.cloudflare.com/queues/configuration/configure-queues/)
and [dead-letter Queue](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/)
contracts.

`MULTI_ASSET_PAYMENTS_MODE=off` is also the default. `preview` permits only dry
quotes; `live` permits firm quotes. Status lookups stay available while quote
creation is off so an existing conversion can still be followed.
Successful assets/quote/status routes emit only operation, HTTP code and
latency. A validated status response separately emits its allowlisted payment
status; deposit/refund addresses, quote payloads and API credentials are never
included.

## V2 Market ticket playback (`/v3/playback-tokens`)

Off unless `MARKET_PROTOCOL=v2` and `LIVEPEER_PLAYBACK_V3_ENABLED=true` (with the usual
`LIVEPEER_BRIDGE_ENABLED` and `LIVEPEER_PLAYBACK_ISSUANCE_ENABLED`). A V2 deployment points
`MARKET_CONTRACT_ID` at `contracts/market-v2`. V1 deployments are unchanged.

- **Request.** The body is `{ request, signature }`.
  - `request` is the protocol's "Playback request" (`protocol/youtick-market-v2`).
  - The device session key signs it.
  - The network, contract and origin must match the deployment, and the request must expire
    within 5 minutes.
- **Authorization.** It comes from the final `get_ticket` view, with `get_publication` read at
  the same block.
  - The ticket must be `purchased`, `watched`, `watched_in_escrow` or `released`.
  - The publication must be `ACTIVE` or `SALES_SUSPENDED`.
  - The session key must be listed on the ticket and unexpired.
- **First play.** A `purchased` ticket is marked watched through the operator outbox first
  (`/internal/mark-watched`). The watch moves no money; the gross amount stays in escrow.
  - The outbox signs `mark_watched` with 100 TGas.
  - It confirms from the final ticket status (`watched`, `watched_in_escrow` or `released`).
  - A pending outcome returns `503 playback_pending`. A contract refusal (refunded or voided
    ticket, takedown) returns `403 playback_denied`. No token is issued in either case.
- **Operator key.** In V2 the on-chain operator function-call key must allow exactly
  `finalize_publication`, `suspend_sales`, `mark_watched` and `release_expired` (the
  provider-neutral names of gate MC). A key that still carries `finalize_livepeer_publication`
  or `suspend_livepeer_sales` is refused with `runtime_not_configured`; V1 deployments keep
  exactly those two V1 names. The operator account must be the V2 contract's active Bridge.
- **Profile id.** A V2 Bridge accepts only `paid-media-v1` on new upload intents and
  finalizations, and plays stored publications under either `paid-media-v1` or
  `paid-media-livepeer-v1`. A job stored under `paid-media-livepeer-v1` is never finalized on
  V2: one holding a publication becomes `ONCHAIN_PUBLISHED` if that publication is already final
  on chain, otherwise `UPLOAD_EXPIRED`; an unpublished one becomes `UPLOAD_EXPIRED` (an
  `AUTHORIZED` job only when an alarm fires). `CREATE_PENDING` and `CREATE_AMBIGUOUS` jobs are
  left untouched, since `JOB_STATE_TRANSITIONS` has no `UPLOAD_EXPIRED` edge from them: no retry
  loop and no finalize, and their admission reservation expires on its own. Sponsored upload
  quotes and relays are closed on V2 (the compact upload format carries the V1 profile id). V1
  keeps `paid-media-livepeer-v1` throughout.
- **Tokens.** Each token lives at most 180 seconds, and never longer than the device's
  remaining validity.
- **Escrow release.** With `MARKET_V2_RELEASE_ENABLED=true`, the `scheduled` handler releases
  crypto tickets still in escrow (purchased or watched) older than 30 days.
  - It reads up to 25 due ticket IDs from `MARKET_READ_MODEL` (`market_v2_tickets`, migration
    `0010`), leaving out tickets of taken-down publications.
  - It sends one `release_expired` batch through the operator outbox, with 150 TGas.
  - The batch is confirmed once none of its tickets is still `purchased` or
    `watched_in_escrow`. Confirmed records are
    deleted, and a failed batch is retried by the next run.
  - The V2 operator key must also allow `release_expired`.
  - The V2 deployment config must add a cron trigger (for example every 15 minutes). V1
    deployments get no trigger.
- **Client rule.** Sign a playback request only after the viewer presses play. The first
  accepted request marks the ticket watched. A refund stays possible after that, but only for a
  technical failure and only through youtick (`refund_ticket`). Any device on the ticket can do
  this; there is no replay cache within the 5-minute request window.
- **Outbox records.** Confirmed `mark_watched` records are deleted, never archived, so the
  operator object's record budget does not grow with tickets. The final ticket status on chain is
  the durable record. A failed transaction on a ticket that is still `purchased` clears its
  record, and the next play signs a fresh one.
- **Upload scope on the V2 testnet.** With `MARKET_PROTOCOL=v2`, `NEAR_NETWORK=testnet`, a
  `VIDEO_ENVIRONMENT` other than `public-testnet` and a `LIVEPEER_CREATOR_ALLOWLIST` of named
  accounts, the operator finalizes any job of an allowlisted creator; `LIVEPEER_OPERATOR_JOB_ID`
  is not needed. A `*` allowlist, mainnet and V1 deployments keep the single-job scope.

## Commands

```bash
npm ci
npm test -- --run
npm run test:provider-canary
npm run test:playback-v2-abuse
npm run test:playback-v2-load
npm run check
npx wrangler deploy --dry-run
```

The provider-canary test command is mocked and performs no external mutation.
It also covers a read-only NEAR finality probe contract: the CLI reads
`NEAR_RPC_URL`, queries `final` then `optimistic` blocks with five-second
timeouts and prints only block heights/lag. Tests use a mocked RPC; no schedule
or alert is provisioned.
The two playback stress commands are also local/mocked opt-in checks; their
latency is not staging or production evidence.
Live canary commands require separate approval, bounded credentials and an
explicit cleanup plan.

## Configuration

Public bindings and placeholders are in `wrangler.toml`. Put API, webhook,
operator, JWT, NEAR operator, sponsor-relayer and quote-signing private values
in Worker secrets, never in that file or `.dev.vars` committed to git.

Set the 1Click partner credential only as a secret:

```bash
npx wrangler secret put ONECLICK_API_KEY
```

Payment routes are `GET /v1/payments/assets`, `POST /v1/payments/quote` and
`GET /v1/payments/status`. Quote creation is mainnet-only, uses exact-output
Circle USDC and rejects `customRecipientMsg`, charged `appFees` or
`insured=true`. Empty app fees and `insured=false` are accepted as no-cost
provider defaults. Enabled source assets are the intersection of the built-in
definitions and `MULTI_ASSET_PAYMENT_ASSET_IDS`.

The Durable Object migration in `wrangler.toml` is required for the
legacy `LivepeerControl` class. Stateless playback v2 does not use that binding.
See
[configuration](../../docs/getting-started/configuration.md) and
[security](../../docs/security.md).
