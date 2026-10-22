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
reader. Dependency logs keep the `livepeer_*` labels for Studio; Cloudflare
Stream logs `stream_api`, `stream_tus` and `stream_media`; `media_api`,
`media_tus` and `media_cdn` stay reserved.
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

### Cloudflare Stream adapter (M2, flag off)

`src/cloudflare-stream-provider.ts` and `src/cloudflare-stream-verification.ts`
implement `MediaProvider` for Cloudflare Stream behind
`MEDIA_PROVIDER_STREAM_ENABLED` (default `"false"`). A new intent selects Stream
only with the flag on and the `paid-media-v1` descriptor hash from
`protocol/paid-media-v1/stream-profile.json`; the job record stores
`provider: 'stream'` at creation. With the flag on, Market V2 runs Stream-only
(OD19): Studio hashes are refused for new intents and the Studio configuration
is not required by any validator. V1 is unchanged. Existing Stream jobs and
publications keep working with the flag off (rollback is a flag flip), as long
as the Stream configuration is present.

- Upload: `POST /accounts/{STREAM_ACCOUNT_ID}/stream?direct_user=true` (tus,
  `Upload-Length` = expected bytes, `maxDurationSeconds` = cap, bare
  `requiresignedurls`, `expiry` = min(creation + 6 h, the job's absolute
  deadline) (`STREAM_UPLOAD_EXPIRY_MS`; never the 30-minute admission lease,
  which heartbeats renew but Stream does not),
  `filename`/`filetype`, routing as plain `jobid`/`generation` and a JSON
  `meta` value). The 201 `Location` must be on `upload.cloudflarestream.com`
  without a port and `stream-media-id` 32 lowercase hex; asset id = playback id
  = UID, project id = account id. A post-create HEAD (length = expected,
  offset 0) and GET (echoed cap, signed URLs, meta route) gate the job; a
  refused or unverifiable creation (including a 201 with an unusable
  `Location`) is deleted. Storage exhaustion (413) is
  `provider_admission_closed`; every 429 and 5xx is `provider_unavailable`
  (transient, never an admission latch).
- Byte proof (option A): at readiness one tus HEAD must show
  `Upload-Offset == Upload-Length == expected_source_bytes`; overflow or any
  mismatch is `provider_tus_state_invalid` (job `PROVIDER_FAILED`, UID deleted,
  never finalized); a URL past creation + 24 h or answering 404/410 is
  `provider_tus_url_expired` (`UPLOAD_EXPIRED`, UID deleted). The evidence and
  the publication's `ready_at_ms` are stored on the job; published-mode
  re-verification never sends a HEAD and reproduces the stored publication.
- Verification: identity is UID = asset = playback, the account and the meta
  route; the video must be `ready`, `readyToStream` and `requireSignedURLs`.
  Manifests: alternate media allowed (not required), `p`/`s` query keys,
  `EXT-X-MAP` and `EXT-X-ENDLIST` required (every recorded playlist has both).
  Expected renditions are the descriptor heights capped by the source. The
  denial matrix is the spike's (docs report §9.3): anonymous, forged and
  expired credentials must be refused with 401 (403 also counts) on every
  surface; a wrong-subject token gets 404
  on the HLS master and variants, DASH, `thumbnail.jpg`/`.gif` and the MP4
  download; iframe and watch are probed for 401/403 only; a valid viewer token gets
  403 (or 404 without a generated MP4) on the download; a query-stripped
  segment answering 401, 403 or 404 counts as denied. A listed `p`/`s` segment
  URL is never fetched anonymously and no authorized segment is ever fetched.
  A ready webhook that precedes the full ladder (`pctComplete < 100`) is
  pending (look again after 15 s, bounded by max(`STREAM_STUCK_TIMEOUT_MS`,
  60 minutes)), never a drift code.
- Webhooks: `POST /v1/stream-webhooks`, `Webhook-Signature: time=<s>,sig1=<hex>`
  HMAC-SHA256 over `time.body` with `STREAM_WEBHOOK_SECRET`, then
  `STREAM_WEBHOOK_SECRET_PREVIOUS` (rotation is PUT-then-deploy; whether
  Stream keeps the old secret alive is unproven), five-minute tolerance. Every
  delivery whose signature verifies advances `stream.lastWebhookAtMs`, before
  routing and before the body is parsed; an unroutable or unparsable one gets
  `202 {accepted, ignored}`, a forged one 403. With the Queue on, a Stream
  message carries optional `provider` and `signed_time_ms` fields (Studio
  messages are unchanged). `ready` is readiness, `error` is
  `PROVIDER_FAILED` with the reason code and an immediate DELETE (even while GET
  still says `inprogress`), `queued`/`inprogress` is processing. Stream has no
  delete event: loss shows as `provider_asset_missing` in reconciliation.
- Admission: a Stream intent reads `GET /stream/storage-usage`; the admission
  object then decides, serialized with the budget: a new reservation over
  `STREAM_RESERVATION_SECONDS_BUDGET` is denied with reason
  `reservation_budget` (also on the Stream-only preflight), and one where used
  minutes + our open reservations + the cap exceed
  min(`STREAM_STORAGE_MINUTES_CAPACITY`, Stream's reported limit) is refused
  with `provider_admission_closed`. The admission record's optional `stream`
  block keeps the open reservations (`openReservedSeconds`, each held at most
  24 h). A reservation is released at `READY_VERIFIED` and at every terminal
  state. `verifiedStorageSeconds` (durations at `READY_VERIFIED`) is
  informational only, never closes admission, and restarts from the last
  reported usage on an operator reopen. Studio jobs on the same admission
  object are not counted.
- Lifecycle and poll: `UPLOAD_EXPIRED` (including a job-deadline expiry) and
  `PROVIDER_FAILED` delete the UID exactly once (gated by
  `LIVEPEER_PROVIDER_MUTATIONS_ENABLED`; a 429/5xx/network DELETE is retried
  once, then an ambiguous delete closes admission). The job alarm polls
  `GET /stream/{uid}` every 5 minutes while uploading and every minute while
  processing: `error` fails and deletes; a job whose `status.state` and
  `pctComplete` (from webhooks or polls, `streamProgress` on the job) have not
  changed for `STREAM_STUCK_TIMEOUT_MS` fails and deletes
  (`provider_job_stuck`) only after one more confirming GET; `ready` runs
  readiness (a lost webhook cannot strand a paid job); `pendingupload` with a
  lapsed lease expires and deletes; any pre-ready job ends at creation + 24 h.
- Playback: `/v3/playback-tokens` picks the adapter from the publication's
  `profile_config_sha256` and signs RS256 itself (no Workers binding): header
  `{alg: 'RS256', kid}`, claims exactly `{sub, kid, exp, nbf: iat - 60}`, never
  `downloadable`, lifetime `min(180 s, device remaining)` and at most 24 h. The
  token replaces the UID in `https://customer-<code>.cloudflarestream.com/<token>/manifest/video.m3u8`;
  the response keeps schema `youtick.livepeer-playback-token.v3`, adds
  `provider: 'cloudflare-stream'` and has no `preview_vtt_url`. The provider
  policy check is the same GET (`requireSignedURLs && readyToStream`), cached
  30 s like `/v2`. `/v1`
  and `/v2` tokens fail closed for a Stream publication. Covers use a 120 s
  token on `/<token>/thumbnails/thumbnail.jpg` with no request header.
- Cron: every run with the flag on logs `stream_storage_headroom`.
  `/__health` gains `streamConfigured` (never true with the flag off) and, only
  with the flag on, a `stream` block `{openReservedSeconds,
  reservationBudgetSeconds, storageMinutesUsed, storageMinutesCapacity,
  lastWebhookAtMs, stuckProcessingJobs, lastStuckAtMs}` (stuck jobs = stuck
  terminations in the last 24 h) and nothing else about quotas.

Configuration (vars in `wrangler.toml` as placeholders, filled by the release
tooling): `MEDIA_PROVIDER_STREAM_ENABLED`, `STREAM_ACCOUNT_ID` (32 hex),
`STREAM_CUSTOMER_CODE`, `STREAM_SIGNING_KEY_ID` (32 hex),
`STREAM_SIGNING_PUBLIC_KEY` (base64 of the SPKI PEM, checked for shape only;
never used to sign), `STREAM_MAX_DURATION_SECONDS` (1..36000 and at most the
descriptor cap 7200), `STREAM_STORAGE_MINUTES_CAPACITY` (at least one cap),
`STREAM_RESERVATION_SECONDS_BUDGET` (at least one cap; the release tooling
refuses the same with `stream_limits_inconsistent`), `STREAM_STUCK_TIMEOUT_MS`. Secrets:
`STREAM_API_TOKEN` (`Stream:Edit`), `STREAM_WEBHOOK_SECRET` (at least 16
characters), optional `STREAM_WEBHOOK_SECRET_PREVIOUS`, `STREAM_SIGNING_KEY_PEM`
(a PKCS8 or PKCS1 PEM, a JWK JSON, or base64 of either; detected by prefix).
With the flag off, empty Stream values mean "not configured", never an error.

M0 switches: each value an M0 probe has not recorded is a config value or a
fixture-driven branch, not a guess presented as fact.

| Unknown | Where it lives | Closed by |
|---|---|---|
| Which `Upload-Metadata` keys land in `meta` (U1) | routing accepts plain `jobid`/`jobId`/`job_id` + `generation`, a JSON `meta` value, or the `youtick-<job>-g<n>` name; all present shapes must agree | M0-P4 |
| Echo of `maxDurationSeconds` after creation (U1) | post-create GET must echo the cap, else the UID is deleted | M0-P3/P4 |
| Whether `totalStorageMinutes` already includes reservations booked at URL creation (U9, U25) | headroom adds our open reservations on top (a deliberate double count); drop the `open / 60` term if it does | M0-P3 |
| Body and status of storage exhaustion (U9) | 413 only; every 429 is transient; the fixture body is invented | M0-P3 |
| Whether `expiry` shortens the upload URL or drops the reservation (U25) | `expiry` = min(creation + 6 h, absolute deadline); reservations counted up to 24 h; drop the field if it does not help | M0-P3 |
| `EXT-X-ENDLIST` on every variant at readiness (U4, U21) | required (constant; spike and dashboard 2026-10-22 both had it) | M0-P1/P7 |
| Manifest shape at the ready webhook (U21) | pending rule from authorized reads while `pctComplete < 100`, window max(stuck timeout, 60 min) | M0-P1/P7 |
| Billing of an authorized segment read (U22) | never done (constant `false`) | M0-P9 |
| `pem` encoding of `POST /stream/keys` (U24) and JWK use | prefix detection, PKCS1 wrapped into PKCS8 | M0-P8 |
| Required or tolerated JWT claims (U23) | exactly `{sub, kid, exp, nbf}`, header `{alg, kid}` | M0-P8 |
| Valid-token status on `downloads/default.mp4` without a generated MP4 | 403 or 404 both accepted | M0-P1 |
| `readyToStreamAt` presence | `ready_at_ms` from `readyToStreamAt`, else `modified`; stored at readiness | M0-P1/P4 |
| tus HEAD hours after ready (U7) | HEAD only at readiness, refused past creation + 24 h | M0-P2 |
| Webhook secret retrieval, rotation and retries (U6) | two configured secrets accepted; poll covers lost deliveries | M0-P4 |

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

Public bindings and placeholders are in `wrangler.toml` (the Stream keys are
listed under "Cloudflare Stream adapter"). Put API, webhook,
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
