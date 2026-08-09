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

Provider upload creation, TUS offset reads and keyed asset/playback reads now
cross the vendor-neutral `MediaProvider` contract in `src/media-provider.ts`.
The 319-line `src/livepeer-provider.ts` owns the `MediaProvider` implementation,
Livepeer request-upload/TUS sequence, API paths, HTTP error classification and
raw asset/playback conversion into neutral identity, policy, phase, size, hash
and `hls`/`mp4`/`vtt` source fields.
UploadJob state stores only normalized asset, playback, project and
resumable-upload identifiers. Ready-asset identity, exact-size, output and
private-media verification is invoked through `MediaProvider.verifyReadyAsset`
and returns only normalized publication evidence. The 251-line
`src/provider-verification.ts` module owns those fail-closed HLS, MP4, VTT,
thumbnail and download probes; signing keys and environment validation remain
in the Worker and cross the boundary only as a token callback. The small
Only a small environment/secret composition factory and cost guard remain in
`index.ts`; the adapter split is still partial because actual provider billing
reconciliation is external.
Provider asset deletion is not exposed by the runtime today, so a speculative
unused delete operation is intentionally not added.

Livepeer event payload parsing, snapshot selection, creator/job routing, phase
normalization and deterministic dedup input now live in the 75-line
`src/provider-webhook.ts`. HMAC verification, timestamp tolerance, accepted job
ID policy, Queue dispatch and Durable Object authority stay in `index.ts`.

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
if the policy values drift. No Queue or DLQ binding is provisioned by this
source-only slice, so the tracked gate remains false. Provider setup must match
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
operator, JWT, NEAR operator and quote-signing private values in Worker secrets,
never in that file or `.dev.vars` committed to git.

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
