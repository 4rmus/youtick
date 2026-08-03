# YouTick Livepeer bridge Worker

Status: `PR-6 LOCAL CODE COMPLETE / 80_MIB_AND_CHROME_EDGE_CANARY_PASS / D6_PARTIAL / DISABLED / NOT DEPLOYED`

This Worker is the persisted upload-intent control plane for paid-media
Livepeer v1. The implementation is complete enough for local and mocked tests,
but provider mutation and deployment remain disabled. PR #67 was merged as
`origin/main@4afd0160d851bcfc85ae2733fbab3641941ed927`; that source integration
did not enable the runtime.

## Boundaries

- `LIVEPEER_BRIDGE_ENABLED` remains `false` in `wrangler.toml`.
- Upload requests carry a canonical Ed25519 device signature. The Worker checks
  that key on the creator account at the same final NEAR block as the job.
- A job generation creates at most one provider intent. `CREATE_AMBIGUOUS`
  never retries blindly.
- The Worker creates the TUS resource with the final job's exact byte length,
  verifies the stored length and zero offset, then returns only that opaque URL.
- The browser PATCHes that resource directly with fixed 32 MiB TUS chunks and
  one sequential request at a time; only the final chunk may be smaller.
- Media request bodies never pass through this Worker.
- One SQLite-backed Durable Object class is used with named job, admission and
  operator instances.
- The fixed admission object fails closed on an empty creator allowlist or an
  unset/invalid operation budget. It reserves the one-active-job,
  two-daily-create and configured monthly dollar budget before any Livepeer
  create request. Decimal 20 GB remains a per-file limit, not a monthly quota.
- Final NEAR job reads happen before an atomic intent reservation.
- Job-side reservation outbox records contain only an idempotency key and
  payload hash. The operator outbox adds signed transaction bytes only after
  provider readiness is verified.
- `POST /v1/livepeer-webhooks` verifies the exact raw request body, timestamp
  and every `v1` HMAC candidate before parsing or Durable Object routing.
- A ready event is digest-deduplicated, then the bridge re-fetches the asset
  and playback objects and checks project, token name, JWT policy, playback
  binding, exact source size and unauthenticated HLS/MP4/download denial.
- The operator object persists nonce, recent block hash, signed transaction
  bytes and transaction hash before broadcast. Retries query the same hash and
  require the final `get_publication` view to match the submitted tuple.
- `POST /v1/playback-tokens` verifies the canonical session-key signature,
  consumes the nonce once, and reads publication, entitlement and the Play
  grant at one final NEAR block. Account, resource, origin, device, generation,
  playback ID, revocation and expiry mismatches fail closed.
- Playback JWTs use Livepeer's ES256 `pull` claims, are bounded by the remaining
  grant lifetime, returned with `Cache-Control: no-store` and used only through
  the `Livepeer-Jwt` HLS header. The browser refreshes from its in-memory grant;
  neither the grant secret nor JWT is persisted by the Livepeer path.
- Each published job reconciles Livepeer and final NEAR state with its own
  alarm. Drift and provider/NEAR uncertainty stop new JWTs; repeated strong
  drift can only enqueue the idempotent `suspend_livepeer_sales` method.
- Structured logs redact secrets, bearer upload URLs and signed transactions.

## Local checks

```bash
cd workers/livepeer-bridge
npm test -- --run
npm run check
npx wrangler deploy --dry-run
```

`GET /__health` reports process health and the disabled capability state.
`POST /v1/upload-intents` and `POST /v1/playback-tokens` remain unavailable
while the runtime flag is false.
`LIVEPEER_API_KEY` is a Worker secret and must never be placed in `wrangler.toml`
or a browser environment variable. `LIVEPEER_WEBHOOK_SECRET` and
`NEAR_OPERATOR_PRIVATE_KEY` are also Worker secrets.
`LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN` and optional
`LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS` are separate, at least
32-character Worker secrets used only by the admission reopen operation. The Livepeer-issued
`LIVEPEER_JWT_PRIVATE_KEY` is a Worker secret; only its matching public key is a
plain deployment variable. The operator key must be a finite-allowance
FunctionCall key for the exact market and approved methods; FullAccess is
rejected.

`LIVEPEER_CREATOR_ALLOWLIST` is intentionally empty by default.
`LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS` and
`LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS` are also intentionally empty.
D6 must approve positive values in millionths of a dollar; a missing value
closes admission before provider mutation. This reservation is not a Livepeer
hard cap. Rotation uses these local gates before any separately approved
runtime change:

- Write `LIVEPEER_API_TOKEN_NAME` into every new job; keep the old token until
  no pre-publication job uses it and the 24-hour rollback window ends.
- Set the new webhook secret as `LIVEPEER_WEBHOOK_SECRET` and the old value as
  `LIVEPEER_WEBHOOK_SECRET_PREVIOUS`; accept both for 24 hours, then remove the
  previous secret only after delivery evidence is clean.
- Set the new admission operator token as current and the old value as
  `LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS`; accept both for 24 hours, prove
  an evidence-bound reopen with the new token, then remove the previous token.
- Add and prove the new Livepeer JWT public key before signing with its private
  key; retain the old provider signing key for at least 15 minutes.
- Add the new NEAR FunctionCall key with the same receiver and exact two-method
  allowlist. Change `NEAR_OPERATOR_KEY_EPOCH` only after the old epoch's outbox
  records are `CONFIRMED`; retain the old key for the 24-hour rollback window.

These steps are a disabled local contract, not evidence that rotation was
rehearsed or that any old key was deleted.

`POST /v1/operations/admission-reopen` remains unavailable while the runtime
flag is false. When separately activated, it requires the operator token and
the configured `LIVEPEER_PAID_MEDIA_OPERATOR_ID`, then binds the request to the
exact network, contract, closure code/time, incident ID, evidence SHA-256 and
idempotency key. An ambiguous reservation can be released only with a fixed
provider-absence or completed-TUS-termination resolution code. Reopen does not
reset daily counters or the monthly reserved operation budget. The actual operator identity,
secret creation and runtime use remain activation gates, not local evidence.

## Provider canary

The provider canary is mutation-disabled unless the operator explicitly sets
`LIVEPEER_PROVIDER_CANARY_MUTATIONS=true`. It creates one JWT-gated upload
intent, uploads no media bytes, deletes the asset and records only hashed
provider identities and HTTP status evidence.

```bash
npm run test:provider-canary
LIVEPEER_PROVIDER_CANARY_MUTATIONS=true npm run canary:provider
```

Use a dedicated Sandbox project and backend-only API key in `.dev.vars`. Never
commit the key or enable CORS access for it. The old `canary:tus-resume`,
`canary:network-endpoint` and `canary:browser` CLI paths are retired: they could
create a TUS resource yet delete only its asset. Their past results remain
historical evidence, not runnable provider commands. The only supported
media-upload mutation path is `canary:playback` or `canary:playback:live`, which
requires TUS `DELETE` plus `HEAD` `404`/`410` before asset deletion.

The bounded 2026-08-03 run passed signed HLS playback, refresh and the negative
JWT matrix in desktop Chrome and Edge. This is provider/browser evidence, not
Worker/web deployment or runtime-issued grant/token evidence. See the
[testnet execution receipt](../../docs/evidence/livepeer-testnet-e2e-2026-08-03.md).

The first 2026-08-02 Sandbox playback canary stopped at a JWT-free HLS response
of HTTP 200 but selected provider `meta.source`, not the product's canonical HLS
route. Its raw URL was not retained, so it remains inconclusive for that route.
A separate, explicitly approved canonical rerun then requested
`playback.livepeer.studio/asset/hls/{playbackId}/index.m3u8` without a JWT and
also received HTTP 200, despite the returned asset and playback records reporting
`playbackPolicy.type = jwt`. Both post-run inventories were empty. A read-only
baseline then showed the same endpoint returns HTTP 200 with an HLS error
manifest for a nonexistent playback ID, so HTTP status alone is not an access
decision. For an HTTP `200` HLS response, the local canary accepts only a
non-playable HLS error manifest as denied; HTTP `401`/`403` already count as
denied. It requires a playable HLS manifest for correct-token success. If a
top-level list is playable, it probes every recognized first-level variant or
media reference (at most 32) without a JWT and with manual redirect handling;
an unrecognized URI attribute fails closed.
It checks both the canonical product HLS route and every provider-reported
top-level HLS output. Its redacted receipt keeps only status, manifest class,
reference count and reference kind. A public, unknown or over-limit reference
fails closed. The hard-disabled Worker independently checks the same HLS set,
but does not treat its top-level check as browser evidence. The completed run
remains inconclusive: signed playback, JWT refresh and Chrome/Edge playback are
not proven. No further asset may be created without a new approval; see [the
canonical status-only evidence](../../docs/evidence/livepeer-playback-canonical-canary-2026-08-02.md).

An earlier approved full Sandbox attempt reached the browser step and cleaned both
the asset and its temporary signing key; direct inventories returned `0` for
both. It did not measure Chrome playback: the then-current local runner treated an unset page
state as completed and exited before the client attempted playback, so Edge did
not run. The harness now waits only for `pass` or `fail` and emits a redacted
failure class. This was local harness hardening, not browser/provider evidence;
a newly approved asset was required for the corrected Chrome/Edge rerun. See
[the invalid browser attempt evidence](../../docs/evidence/livepeer-playback-browser-canary-2026-08-02.md).

`canary:playback` is a separate, opt-in provider manifest receipt. The current
bounded run requires one exact 80 MiB valid MP4 plus a dedicated, already-registered Sandbox
signing key; it does not create or rotate signing keys. It validates provider
HLS/MP4/download output bindings, probes anonymous denial for the canonical and
provider-reported HLS outputs plus MP4/download, and checks every recognized
first-level HLS reference (at most 32) if either top-level HLS list is playable.
An unrecognized URI attribute fails closed.
It accepts up to 16 returned provider source records: HLS, MP4 and thumbnail
`text/vtt`. It requires at least one HLS and one canonical 1280x720 MP4
rendition, and probes every distinct HLS/MP4 output. Every VTT must deny
anonymous access, be read with a correct short-lived JWT, and yield at most 32
trusted thumbnail references; each thumbnail image must also deny anonymous
access. A duplicate URL is probed once. Any other source type, unknown thumbnail
reference or limit breach fails closed. This v1 policy treats thumbnails as paid
media, not public previews.
It probes malformed, wrong-key, wrong-subject, expired, correct and refreshed
JWTs only on the product's canonical HLS route. It verifies TUS termination
before uploading bytes: an `OPTIONS` response must advertise the `termination`
extension and either `Tus-Version: 1.0.0` or the exact legacy Livepeer signature
`204` plus `Tus-Resumable: 1.0.0`, without sending `Tus-Resumable` on that
OPTIONS request. Advertisement is only a prerequisite; cleanup still requires `DELETE`
then `HEAD` `404`/`410` before deleting the asset. If this preflight fails, no
TUS resource was attempted and cleanup deletes the asset. Once TUS `POST` has
started, an unknown or unproven resource keeps the asset undeleted and fails
closed rather than creating an orphan upload capability. Its failure output
includes only the deterministic
correlation ID needed for manual asset recovery, never the asset ID or TUS URL.
The non-live `canary:playback` deliberately records
`browser_matrix_proven: false`; `canary:playback:live` can set it true only after
both browsers pass. A browser receipt requires at least one JWT-header request
in both the initial and refreshed playback rounds. It also requires anonymous,
malformed, wrong-key and expired denial in each browser; the anonymous probe
must send no JWT header. Browser XHR redirect behavior
is still real-Chrome/Edge canary evidence, not a Node `redirect: 'manual'`
equivalent.

Before any mutation, the canary requires an exact 80 MiB local MP4 and uses
`ffprobe` to require MP4 format, at least one video stream and a positive
duration. The source is then sent as exact 32 + 32 + 16 MiB sequential PATCHes.
After the first chunk the canary pauses, issues a new authoritative HEAD on the
same resource and resumes from that offset. It verifies `Upload-Offset` and
`Upload-Length`, never retries 409 blindly and never creates a second asset. It
records advertised `Tus-Max-Size` when present; the current public Livepeer
guide does not publish an exact single-file maximum, which is not an
unlimited-size guarantee.

After an explicit signing-key mutation approval, `canary:playback:live` first
verifies that installed desktop Chrome and Edge are executable. Only then can
it create one temporary Sandbox signing key in process memory, start both
through Playwright on a loopback-only challenge and delete both the asset and a
positively identified signing key. It fails closed before provider mutation
when either browser is unavailable. A lost signing-key creation response is not
deleted by inventory guesswork: it returns only hashes of newly observed key
IDs with `manual_required`. It requires both mutation switches and never writes
the key, JWT or playback URL to a file or receipt.

Do not run either mutation command until one allowlisted test creator and one
separate buyer identity are recorded for that exact bounded run. Their absence
is a hard pre-provider stop, even when `.dev.vars` contains an API key. The
initial stopped gate and later bounded pass are recorded in
[the 32 MiB and fee evidence](../../docs/evidence/livepeer-32mib-fee-local-gate-2026-08-03.md)
and [the testnet execution receipt](../../docs/evidence/livepeer-testnet-e2e-2026-08-03.md).

```bash
LIVEPEER_PLAYBACK_CANARY_MUTATIONS=true \
LIVEPEER_PLAYBACK_CANARY_PRIVATE_KEY='...' \
LIVEPEER_PLAYBACK_CANARY_PUBLIC_KEY='...' \
npm run canary:playback -- /path/to/exact-80mib-valid.mp4
```

```bash
LIVEPEER_PLAYBACK_CANARY_MUTATIONS=true \
LIVEPEER_PLAYBACK_CANARY_SIGNING_KEY_MUTATIONS=true \
npm run canary:playback:live -- /path/to/exact-80mib-valid.mp4
```
