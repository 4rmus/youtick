# Market read model

Status: `D1_PROVISIONED / MIGRATIONS_APPLIED / FINALITY_SCHEDULED / WRITE_GATES_CLOSED`

NEAR remains authoritative for payments, balances, entitlements and playback
authorization. This derived model is only for discover, profile, dashboard and
audit queries and can be deleted and rebuilt from final chain events.

`d1/0001_initial.sql` defines the pilot D1 event identity, finality watermark
and derived projection tables. `d1/0002_contiguous_watermark.sql` rejects a
skipped/older block or a different hash at the current height while permitting
an exact replay. `d1/0003_upload_job_archives.sql` adds the separate bounded
terminal UploadJob summary, and `d1/0004_operator_outbox_archives.sql` adds the
bounded confirmed operator summary used by their independent Bridge archive
gates. The dedicated testnet D1 and dark Preview binding are recorded below;
no ingestion or API activation is claimed. Platform/SRE owns the pilot
path: NEAR is the `RPO 0` source, the
rebuild target is `RTO 4h`, and derived data is retained through pilot end plus
90 days unless an active audit hold applies.

[NEAR now recommends Neardata for new indexers](https://docs.near.org/data-infrastructure/indexers).
The source-only adapter reads
one exact finalized block, verifies its block/receipt/event bindings and emits
the final block envelope accepted by the D1 writer:

```bash
node scripts/fetch-neardata-market-block.mjs \
  --network=testnet \
  --contract=lp-arch-market-v2-260809.youtick-dev-v3.testnet \
  --height=263118001
```

`263118001` is the final block containing the fresh Market v2 deployment
receipt. A read-only live check also parsed its historical `bridge_frozen`
event at block `263118248`. Those older governance logs predate the new common
context fields, so the adapter deterministically fills only receipt/block
identity and an event-position idempotency key. It never invents economic data.

The deterministic local rebuild command accepts one final event envelope per
JSONL line:

```bash
node scripts/rebuild-market-read-model.mjs --input /absolute/path/final-events.jsonl
```

Each event envelope contains `network`, `finality=final`, `block_height`,
`block_hash`, `receipt_id`, `event_index` and the exact NEP-297 `event` object.
The reducer sorts final events, rejects block/position/idempotency conflicts and
prints a canonical projection snapshot. It performs no network or D1 write.
Guardian purchase-pause and admin purchase-unpause events are retained in the
governance audit projection; they do not create or remove entitlement rows.

`scripts/apply-market-read-model-d1.mjs` contains the source-only incremental
writer. It accepts one complete final block for one contract, including a block
with zero market events, binds every SQL value as a prepared parameter and
submits event rows, projections and the watermark in one D1 `batch()`. The batch
is capped at 16 events so the worst case stays within
the [documented 50-query free-plan Worker invocation limit](https://developers.cloudflare.com/d1/platform/limits/).
Cloudflare documents `batch()` as a transaction that rolls back the sequence on
failure. A conflicting event aborts the batch; an exact replay is idempotent.
If one complete block contains more than 16 Market events, ingestion fails with
`d1_final_block_event_limit_exceeded` before any write and leaves the watermark
unchanged. The pilot must alert and stop at that block; it must not split or
partially publish it. After an explicit capacity/schema change, the operator
replays that exact block and normal contiguous processing resumes.

`scripts/bootstrap-market-read-model-d1.mjs` is the source-only v1 starting
point for a fresh D1. It reads the publication count and at most 48 current
publications from the same exact final NEAR block, then emits a bounded JSON
snapshot without writing to D1:

```bash
READ_MODEL_NEAR_RPC_URL=https://dedicated-testnet-rpc/ \
  node scripts/bootstrap-market-read-model-d1.mjs \
  --network=testnet \
  --contract=lp-arch-market-v2-260809.youtick-dev-v3.testnet
```

Its exported apply function refuses any non-empty D1 and atomically inserts
only the finality watermark and current publication rows. It deliberately does
not invent historical events, sales, entitlements, withdrawals or governance
records. The existing canary D1 is therefore not an eligible target; live use
requires a newly provisioned empty database and a separate activation gate.

`scripts/run-market-read-model-once.mjs` is the source-only single-step runner.
It reads one contract watermark, fetches only the deployment start block when
the cursor is absent or exactly `watermark + 1` afterward, and applies that one
complete block. Concurrent reads may request the same next block, but the
contiguous-watermark trigger permits only an exact replay and D1 rolls back a
late old/gap write together with its event and projection statements. The
scheduled wrapper reuses this function sequentially in a bounded batch.

`worker.mjs` combines the GET API with a source-only scheduled entrypoint.
`READ_MODEL_INGESTION_ENABLED` is closed unless exactly `true`; activation also
requires the D1 binding, `READ_MODEL_NETWORK=testnet`, exact contract ID and
decimal `READ_MODEL_START_BLOCK_HEIGHT=263118001`. The pilot policy is a
one-minute cron and exactly `READ_MODEL_MAX_BLOCKS_PER_RUN=180`: one bounded
final-height RPC read, then at most 180 contiguous Neardata blocks. This needs a
Workers Paid plan because Free permits only 50 external subrequests per
invocation and cannot keep pace with roughly one NEAR block per second. Mainnet
ingestion is intentionally rejected in this pilot source. The tracked Wrangler
config has only the read-only finality cron, no Queue trigger and every
read-model write/API gate is closed.

The same Worker also contains a source-only Queue backfill entrypoint guarded
independently by `READ_MODEL_BACKFILL_ENABLED=false`. A valid message names only
the exact next D1 watermark height. It processes the same maximum 180 contiguous
blocks. Automatic continuation is separately closed unless
`READ_MODEL_BACKFILL_CONTINUE_ENABLED=true`; while closed, a stale replay is
acknowledged without emitting another message and no producer binding is needed.
While enabled, remaining backlog emits one continuation and a stale cursor is
repaired from the D1 watermark. A future or malformed cursor is retried without
writing, so a message cannot choose or skip a block. The tracked and release
configs deliberately contain no Queue binding or consumer: provisioning,
single-concurrency policy, retry/DLQ policy and activation remain a separate
external gate.

## Provisioned testnet foundation

The v1 D1 foundation was created and bootstrapped on 2026-08-15. The tracked
dark Worker config targets it without adding a Queue consumer or public route:

- database: `youtick-market-read-model-v1-testnet`
- database ID: `50b1e14f-2b06-444b-98cf-b828f11277ef`
- region: `EEUR`
- source binding: `MARKET_READ_MODEL` in `wrangler.toml`
- migrations: `0001_initial.sql` through
  `0004_operator_outbox_archives.sql`, all applied remotely
- runtime gates: `READ_MODEL_ENABLED=false`,
  `READ_MODEL_INGESTION_ENABLED=false`, `READ_MODEL_BACKFILL_ENABLED=false` and
  `READ_MODEL_BACKFILL_CONTINUE_ENABLED=false`
- exposure: `workers_dev=false`, `preview_urls=false`, no route or Queue; the
  one-minute finality cron performs only two RPC reads

Remote verification found one `ACTIVE` publication and the watermark at block
`264030390`. The publication came from exact final block `264030389`; the next
complete block contained no market events and advanced only the watermark.
Event, governance, media-job, entitlement, sale, withdrawal and archive tables
remain empty. The old bounded-canary D1 is preserved separately. This proves a
v1 bootstrap plus one forward block, not an API activation or full rebuild.

Every scheduled invocation emits exactly one secrets-free JSON record with
schema `youtick.read-model-ingestion.v1`. Success records include status,
processed block count, observed final height, last applied block and remaining
backlog. Failures expose only a bounded stable `error_code` and are rethrown.
This is an alert contract, not proof of a configured log sink or delivered
alert.

Terminal UploadJob archive is independently closed by
`UPLOAD_JOB_ARCHIVE_ENABLED=false` in the Bridge. When explicitly enabled with
the same D1 binding, only testnet `CANCELLED`, `UPLOAD_EXPIRED` and
`PROVIDER_FAILED` summaries are written: job/creator identity, terminal time,
expected bytes, source fingerprint, hashed provider identities, archive hash
and the accepted 14-day eligibility time. TUS URLs, session keys, provider
tokens and raw asset/project IDs are excluded. D1 insert plus exact readback is
idempotent; failure persists bounded retry metadata in the job object. This
archive does not delete the job. A real D1 commit and machine-verified removal
of legacy v1 playback dependency are still required before any destructive
cleanup source may be added.

Confirmed operator outbox archive is independently closed by
`OPERATOR_OUTBOX_ARCHIVE_ENABLED=false`. When explicitly enabled with the same
testnet D1 binding, it stores only operator/contract identity, key epoch,
idempotency key, method, payload hash, optional public transaction hash and
timestamps. Finalization submissions, publication IDs, nonce, block hash,
signed transaction bytes and private keys are excluded. D1 insertion plus
exact readback is idempotent; a bounded cursor scans at most 32 records per
alarm and archive failures use the same capped 60–900-second retry policy. A
commit records `cleanupEligibleAtMs = confirmedAtMs + 90 days`, but does not
delete the confirmed outbox record. Real D1 commit, expired retention and audit
hold evidence are required before destructive cleanup source may be added.

`api.mjs` is a GET-only, disabled-by-default D1 Worker module. It exposes
`/v1/publications`, `/v1/publications/:id`,
`/v1/creators/:account/publications` and
`/v1/creators/:account/sales-summary`. Every response carries the finality
watermark; cache identity binds both the watermark and exact request URL.
Payments, balances, entitlements and playback authorization never use it.
Activation requires `READ_MODEL_ENABLED=true`, a deployed `MARKET_READ_MODEL`
binding, an exact network and contract ID, plus an exact HTTPS
`READ_MODEL_WEB_ORIGIN` for CORS. The tracked config and deployed binding remain
dark; no public route exists. The Web client is separately guarded
by `NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL=false` and an exact HTTPS
`NEXT_PUBLIC_MARKET_READ_MODEL_URL`. Discover falls back to canonical NEAR only
when its first derived request is unavailable and never mixes cursor sources.
Temporary D1 query failures return only `read_model_unavailable` with HTTP 503.
Scheduled ingestion logs and rejects with a bounded error code instead of
rethrowing raw database errors.
Creator profile may show derived publication history and aggregate sales, while
available balance, withdrawal, purchase, entitlement and playback remain on
canonical NEAR state. Sale amounts remain decimal strings; the pilot API folds
them with JavaScript `BigInt` instead of SQLite `INTEGER`, so contract-sized
values do not silently overflow. This exact fold intentionally scans the
creator's ledger and must be replaced by a measured materialized projection
before its row volume breaches the Worker/D1 latency budget.

Run its local contract tests with:

```bash
node --test scripts/apply-market-read-model-d1.test.mjs \
  scripts/fetch-neardata-market-block.test.mjs \
  scripts/market-read-api.test.mjs \
  scripts/rebuild-market-read-model.test.mjs
```

Still required before pilot traffic: an exact-main release of this continuation
guard, a supervised Queue consumer policy, a named human Platform/SRE owner and
a measured four-hour rebuild drill. Alert delivery remains an explicitly
accepted risk; the bounded ingestion failure codes still need active supervision.
