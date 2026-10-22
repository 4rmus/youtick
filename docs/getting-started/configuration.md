# Configuration

## Web

Required public variables:

```text
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=<fresh-market-account>
NEXT_PUBLIC_ACCESS_CONTRACT_ID=<fresh-access-account>
NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1=false
NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2=false
NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2=false
NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE=false
NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL=false
NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE=off
NEXT_PUBLIC_LIVEPEER_BRIDGE_URL=https://<bridge-host>
NEXT_PUBLIC_LIVEPEER_CREATOR_FEE_GAS_RESERVE_YOCTO=<approved-positive-yoctonear>
NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO=<approved-positive-yoctonear>
```

`NEXT_PUBLIC_USDC_CONTRACT_ID` may override the network's known USDC
contract. Missing or invalid market/access IDs fail closed. The gas reserve is
required by the upload transaction and must be an approved positive integer.
A true web gate does not enable the Worker.

The derived read path has a separate closed gate. When explicitly enabled,
`NEXT_PUBLIC_MARKET_READ_MODEL_URL` must be an exact HTTPS origin. The D1 Worker
must independently have `READ_MODEL_ENABLED=true`, its D1 binding, exact
network/contract values and `READ_MODEL_WEB_ORIGIN` equal to the Web origin.
The tracked Preview release permits the web gate only with
`NEXT_PUBLIC_MARKET_READ_MODEL_URL=https://read-preview.youtick.net`. Production
forces the web gate to `false` and carries no read-model URL.

The source-only D1 Worker ingestion contract remains undeployed:

```text
READ_MODEL_INGESTION_ENABLED=false
READ_MODEL_NETWORK=testnet
READ_MODEL_CONTRACT_ID=<fresh-market-account>
READ_MODEL_START_BLOCK_HEIGHT=263118001
READ_MODEL_MAX_BLOCKS_PER_RUN=180
READ_MODEL_NEAR_RPC_URL=https://<dedicated-testnet-rpc>/
```

Pilot activation requires Workers Paid and a one-minute cron. One final-height
RPC read bounds each run; then at most 180 complete blocks are applied in order.
No tracked Wrangler file currently creates the Worker, cron or D1 binding.

Terminal UploadJob archive is another independent Bridge gate:

```text
UPLOAD_JOB_ARCHIVE_ENABLED=false
OPERATOR_OUTBOX_ARCHIVE_ENABLED=false
MARKET_READ_MODEL=<unbound D1 binding>
```

It is testnet-only and may be enabled only after `0003_upload_job_archives.sql`
is applied to the exact pilot D1. Archive success never enables 14-day
`deleteAll()`; destructive cleanup remains blocked until legacy v1 playback no
longer reads UploadJob state and the D1 commit is externally proven.

Operator outbox archive uses the independent
`OPERATOR_OUTBOX_ARCHIVE_ENABLED=false` gate and requires
`0004_operator_outbox_archives.sql` on the same exact testnet D1. It archives a
bounded confirmed summary and records the accepted 90-day eligibility time.
It never deletes the outbox record; real commit, elapsed retention and audit
hold evidence remain external prerequisites.

Optional server-only web RPC values:

```text
NEAR_RPC_PRIMARY_URL=https://<dedicated-near-rpc-host>/
NEAR_RPC_PRIMARY_AUTHORIZATION=Bearer <provider-token>
```

Both values must be present for the dedicated primary to be used. They must
never use a `NEXT_PUBLIC_` name. The read route and broadcast route are
separate; broadcast uses one upstream without replay. The local pilot guards
requests at 64 KiB, responses at 2 MiB, each upstream at 2.5 seconds and a read
request at six seconds. Per-instance rate limits are 60 read requests per
IP/account per minute and 10 broadcasts per IP per minute. A distributed edge
rate-limit binding remains required before general access.

Multi-asset checkout accepts `off`, `preview` or `live`. `preview` shows only a
dry quote; `live` can create a deposit address. The shared payment gas reserve
is mandatory before either mode can start a conversion. Web and Bridge modes
must match. A stored conversion continues status polling when the mode returns
to `off`, but no new quote is created.

## Livepeer Bridge

Non-secret values belong in `workers/livepeer-bridge/wrangler.toml`:

- `LIVEPEER_BRIDGE_ENABLED=false`
- `LIVEPEER_NEW_UPLOADS_ENABLED=false`
- `LIVEPEER_PLAYBACK_ISSUANCE_ENABLED=false`
- `LIVEPEER_PROVIDER_MUTATIONS_ENABLED=false`
- `LIVEPEER_OPERATOR_MUTATIONS_ENABLED=false`
- `LIVEPEER_PLAYBACK_V2_ENABLED=false`
- `LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED=false`
- `LIVEPEER_WEBHOOK_QUEUE_ENABLED=false`
- Queue pilot policy: batch `10`, timeout `5s`, retries `3`, concurrency `1`,
  retention `345600s`, DLQ `youtick-livepeer-events-dlq-testnet`
- `LIVEPEER_NEAR_CREATOR_FEE_ENABLED=false`
- `ALLOWED_ORIGINS`
- `NEAR_NETWORK`, `NEAR_RPC_URL`
- `MARKET_CONTRACT_ID`, `ACCESS_CONTRACT_ID`
- `LIVEPEER_PROJECT_ID`, `LIVEPEER_API_TOKEN_NAME`
- `LIVEPEER_CREATOR_ALLOWLIST`
- `LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS`
- `LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS`
- `LIVEPEER_PAID_MEDIA_OPERATOR_ID`
- `LIVEPEER_JWT_PUBLIC_KEY`, `LIVEPEER_JWT_ISSUER`
- `NEAR_OPERATOR_ACCOUNT_ID`, `NEAR_OPERATOR_KEY_EPOCH`
- `CREATOR_FEE_QUOTE_KEY_VERSION`
- `MULTI_ASSET_PAYMENTS_MODE=off`
- `MULTI_ASSET_PAYMENT_ASSET_IDS`

Set these only as Worker secrets:

- `LIVEPEER_API_KEY`
- `LIVEPEER_WEBHOOK_SECRET` and optional previous value during rotation
- `LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN` and optional previous value
- `LIVEPEER_JWT_PRIVATE_KEY`
- `NEAR_OPERATOR_PRIVATE_KEY`
- `CREATOR_FEE_QUOTE_PRIVATE_KEY`
- `ONECLICK_API_KEY`

The monthly and per-job provider budget values must both be configured before
admission can open. Do not enable either runtime gate as part of configuration
or deployment preparation.

Stateless playback requires all three of the web paid-media gate, the web v2
authorizer gate and the Bridge v2 gate, plus `LIVEPEER_API_KEY` for the bounded
provider-policy check. The v2 pair is currently a source-only closed default
and is not wired into Preview/Production release variables.

Webhook Queue transport is also source-only and closed. Enabling it requires a
`LIVEPEER_EVENTS` Queue producer/consumer binding and DLQ whose provider-side
configuration exactly matches the tracked pilot policy. The Worker fails closed
on value drift. Dedicated testnet Queue/DLQ resources and their source Wrangler
configuration now exist, but no Worker deployment or provider-side
producer/consumer attachment exists and the runtime gate remains false.

Multi-asset quotes are mainnet-only. The allowlist is a comma-separated subset
of the built-in canonical 1Click asset IDs. Release environments retain
`ONECLICK_API_KEY` and the positive payment gas reserve in every mode so an
existing conversion can still finish after quote creation is switched off.

### V2 Bridge on Cloudflare Stream

The V2 testnet Bridge is Stream-only (owner decision OD19, 2026-10-22): its
release (`scripts/v2-testnet-bridge-release.mjs`) writes no Livepeer Studio
configuration (`LIVEPEER_PROJECT_ID`, `LIVEPEER_API_TOKEN_NAME`,
`LIVEPEER_JWT_PUBLIC_KEY` and `LIVEPEER_JWT_ISSUER` are empty) and deploys none
of `LIVEPEER_API_KEY`, `LIVEPEER_WEBHOOK_SECRET` or `LIVEPEER_JWT_PRIVATE_KEY`.
V1 (Preview, public testnet) keeps the Studio values above.

Non-secret values, written into `[vars]` by the release:

- `MEDIA_PROVIDER_STREAM_ENABLED`: `false` by default; set per release with the
  workflow input `stream_enabled` (never a mode flag). `acceptance` requires
  `true`.
- `STREAM_ACCOUNT_ID`: the media Cloudflare account id (the Worker's own
  account, 32 hex).
- `STREAM_CUSTOMER_CODE`: the `<code>` of
  `customer-<code>.cloudflarestream.com`, read from the first upload's playback
  URL. Until it is committed the release writes it empty with the flag off and
  refuses the flag on (`stream_customer_code_unconfigured`).
- `STREAM_SIGNING_KEY_ID`, `STREAM_SIGNING_PUBLIC_KEY`: the `id` of
  `POST /accounts/{id}/stream/keys` and base64 of the SPKI PEM public half
  (RSA, at least 2048 bits). Sentinels until the owner creates the key
  (`stream_signing_key_unconfigured`).
- `STREAM_MAX_DURATION_SECONDS` (`7200`), `STREAM_STORAGE_MINUTES_CAPACITY`
  (`1000`), `STREAM_RESERVATION_SECONDS_BUDGET` (`7200`): owner decision OD3.
  The duration must be 1..7200, the descriptor cap the Bridge enforces
  (`stream_max_duration_invalid` otherwise).
  The release refuses a budget below the cap or a capacity below one upload at
  the cap (`stream_limits_inconsistent`); the smoke test requires the Bridge's
  `/__health` `stream` block to echo the budget and the capacity.
- `STREAM_STUCK_TIMEOUT_MS` (`900000`): a job still at 0 % after 15 minutes is
  failed and its video deleted; not measured yet (M0-P7).

Worker secrets, deployed only when the release turns Stream on (GitHub
`v2-testnet` secrets in brackets):

- `STREAM_API_TOKEN` (`V2_STREAM_API_TOKEN`): `Stream:Edit` on the media
  account only.
- `STREAM_WEBHOOK_SECRET` (`V2_STREAM_WEBHOOK_SECRET`): the `secret` returned
  by `PUT /accounts/{id}/stream/webhook`; optional
  `STREAM_WEBHOOK_SECRET_PREVIOUS` (`V2_STREAM_WEBHOOK_SECRET_PREVIOUS`). The
  secret is issued by the PUT, so a rotation is PUT then deploy, with a gap.
- `STREAM_SIGNING_KEY_PEM` (`V2_STREAM_SIGNING_KEY_PEM`): the private half,
  PKCS8 PEM (as text or base64) or, if the returned `pem` is PKCS1, the
  returned JWK. PKCS1 itself is refused (`stream_signing_key_pkcs1`); which
  form Stream returns is unproven until M0-P8. The release checks that it
  derives `STREAM_SIGNING_PUBLIC_KEY`.

The release's preflight reads `GET /accounts/{id}/stream/webhook` with the
Stream token and requires `notificationUrl` to be
`https://<bridge workers.dev host>/v1/stream-webhooks`. It compares the secret
only if the response carries one (undocumented, M0-P4); otherwise the receipt
records `secret: not_returned` and the post-deploy webhook canary is the proof.
A returned secret that differs fails `stream_webhook_secret_mismatch_or_masked`
(Stream may return a masked value; unproven). The workflow input
`stream_webhook_secret_preflight=skip` (deploy env
`STREAM_WEBHOOK_SECRET_PREFLIGHT`, attested in the release manifest) keeps the
URL check, skips the comparison and records `secret-not-compared` in the
receipt; on an `acceptance` run the receipt also carries a warning.

The relayer guards the same boundary for NEAR Auth uploads (gate M2-G7):
`UPLOAD_PROFILE_HASH_ALLOWLIST` in `workers/relayer` is an optional
comma-separated list of lowercase SHA-256 hex digests. When set, the relayer
refuses (`profile_not_allowed`, before any signature or fee) an upload whose
`profile_config_sha256` is not listed; Market V2 itself accepts any 64-hex
digest. Unset or empty keeps that behaviour; a malformed list refuses every
upload (`uploads_misconfigured`, 503) while the other routes keep working. Since M3
the V2 testnet release (`scripts/v2-testnet-release.mjs`) pins it to the Stream
descriptor hash (`protocol/paid-media-v1/stream-profile.json`), deployed with the
Bridge's Stream flag, so only a web build with `NEXT_PUBLIC_V2_MEDIA_PROFILE=stream`
can start a V2 upload there; for other targets an empty list keeps the permissive
behaviour.
