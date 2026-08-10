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
The tracked Preview/Production release contract forces the web gate to `false`
and carries no read-model URL.

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
