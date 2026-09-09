# Testing

## Web

```bash
cd apps/web
npm ci
npm test -- --run
npm run test:livepeer-canary
# Local Brave device storage / mock wallet and chain only
node scripts/device-session-browser-check.mjs
npm run lint
npm run build
```

Catalogue freshness/read-budget regressions are in `catalog-refresh.test.ts`
and `near-read-budget.test.ts`. Discover (when the derived model is enabled)
and connected Profile activity refresh every 15 seconds while visible, refresh
on focus when stale, and do not add React Query retries. Contract view calls
use one abortable same-origin query with a 6,500ms deadline, covering response
body delivery as well as headers. The proxy retains its existing 6,000ms budget.
Transaction submission providers are unchanged. This is a per-contract-read
deadline; a Discover fallback page can perform count and list reads sequentially.

The suite must cover upload processing, purchase, entitlement, creator
playback, stranger denial, sale suspension, takedown and disabled gates.

## Livepeer Bridge

```bash
cd workers/livepeer-bridge
npm ci
npm test -- --run
npm run test:provider-canary
npm run check
npx wrangler deploy --dry-run
```

Provider canary tests use mocks unless explicitly run with approved external
credentials. A dry run does not deploy.
The local fault regressions prove bounded NEAR read fallback/circuit behavior
and one-attempt Livepeer create degradation. They do not constitute provider,
staging or distributed-isolate chaos evidence.

## Contracts

Use Rust 1.86.0 and cargo-near 0.17.0:

```bash
cd contracts/nft-ticket
cargo +1.86.0 test --lib
cargo +1.86.0 test --test paid_media_livepeer_v1
cargo +1.86.0 test --test sandbox
cargo +1.86.0 fmt --all --check
cargo +1.86.0 clippy --all-targets -- -D warnings
cargo +1.86.0 near build non-reproducible-wasm

cd ../access-control
cargo +1.86.0 test
cargo +1.86.0 fmt --all --check
cargo +1.86.0 clippy --all-targets
cargo +1.86.0 near build non-reproducible-wasm

cd ../..
node scripts/check-paid-media-livepeer-v1-abi.mjs
node scripts/check-paid-media-livepeer-v1.mjs
```

## Read model

```bash
node --test scripts/apply-market-read-model-d1.test.mjs \
  scripts/fastnear-dev.test.mjs \
  scripts/fetch-neardata-market-block.test.mjs \
  scripts/market-event-catalog.test.mjs \
  scripts/market-read-api.test.mjs \
  scripts/rebuild-market-read-model.test.mjs
```

These are pure local adapter/reducer/schema/API tests with mocked input. The
catalog regression also keeps the Rust producer and both final-event consumer
allowlists aligned with the recorded 18-event final testnet evidence, while
treating `contract_migrated` as accepted but not emitted by either fresh-ID
contract. They create no D1 database, binding or network connection. The
explicit
`fetch-neardata-market-block.mjs` CLI performs a read-only testnet/mainnet GET
and must be reported separately from local tests.

### FASTNEAR local D1 experiment

`node scripts/run-fastnear-dev.mjs --contract=<account.testnet> --pages=1`
reads public FASTNEAR testnet history and writes only the private Miniflare D1
under `.wrangler/fastnear-dev/`. Install the existing Bridge development
dependencies first (`cd workers/livepeer-bridge && npm ci`). No new package,
Cloudflare login, remote D1 target, Worker flag, cron or deployment is needed.

Rerun the same command to continue a persisted page cursor; `--pages=10`
allows at most ten pages in one invocation. `--inspect` reads local tables and
the existing Discover API without any provider request. `--restart` discards
only the local scan cursor after token expiry, preserving verified events.
On 429 the command stops without advancing and reports `Retry-After`; run it
again after that delay. There is no automatic background loop.
Live reads are paced at least 2.1 seconds apart per host. This is a local
precaution, not a guarantee about shared IP or account quotas.

Each finished sweep restarts account history on the next run, so previously
unseen transactions indexed behind an old cursor can be reconciled. Only
transactions not already verified as FINAL are downloaded and checked again.
The verified hash cache is bounded to 1,000 entries and is committed atomically
with the staged events and cursor in the existing dev state row. FINAL includes
all receipts; the benchmark never appends receipts to a previously FINAL transaction.
`--restart` also clears this cache, forcing fresh verification while retaining events.

This dev experiment limits a sweep to 1,000 transactions/events. When new records
arrive it rebuilds the bounded history in memory, but only replaces tables whose
projection hash changed. No new events means no event-table/projection/watermark
writes; only the scan checkpoint advances. Pending changes survive partial pages,
including an empty final page. Old dev checkpoints are reverified once without
deleting the saved events or published snapshot. It verifies receipt FINAL status
through archival RPC and compares event payloads/projections with the existing
Neardata parser on the visited event blocks. It does not prove
that no undiscovered event block exists, full production history completeness,
or an indexing-delay bound. No source subscription/support interaction is needed.

The private database uses the existing initial projection schema plus dev-only
staging/cursor tables. It is not the deployed database or a production migration;
its API watermark means last observed event, not a contiguous chain checkpoint.
It remains unready (503) with no observed events. All writes and schema creation
stay inside Miniflare; the runner has no remote mode. The installed local runtime
uses compatibility date `2026-05-14`, while the deployed Worker uses a later date.

The default runner closes after reporting counts, local API timing and source
request/byte totals. JSON receipts are saved under `.wrangler/fastnear-dev/evidence/`.
Mocked tests are `LOCAL_TEST`; a real-history local-D1 run is `LOCAL_TEST` plus
`PROVIDER` read evidence, never Preview/Production performance acceptance.

Run `node scripts/benchmark-fastnear-dev.mjs` for bounded 100/500/1,000-event
load and freshness checks. It uses real ephemeral Miniflare D1 and the existing
API, with synthetic provider responses only (no external requests). It records
local row metrics, repeated-history cost, 1/10/50 concurrent API requests,
checkpoint recovery, late receipts and the 1,000-event ceiling. Network pacing,
index delay and freshness are explicitly modelled, not live p95 evidence.
Receipts are saved in `.wrangler/fastnear-dev-load/evidence/`; the real-history
dev database is preserved.

## Local chaos matrix

| Report scenario | Executable local evidence |
|---|---|
| NEAR primary timeout/429/invalid response | `near-rpc-route.test.ts` |
| Livepeer 429/5xx/timeout | `index.test.ts` provider admission tests |
| Duplicate/out-of-order webhook | `finalize.test.ts` terminal/processing tests |
| Queue redelivery | `finalize.test.ts` ACK/retry/duplicate tests |
| Ambiguous transaction broadcast | `finalize.test.ts` persisted signed-transaction test |
| Mixed Worker versions | `release-smoke.test.mjs` exact-version rejection |
| Delayed/early DO alarm | `finalize.test.ts` persisted retry timestamp test |
| Temporary D1/read-model outage | `market-read-api.test.mjs`, `apply-market-read-model-d1.test.mjs` and `useAllVideos.test.ts` |

This matrix is deterministic `LOCAL_TEST` evidence. It proves bounded source
behavior only; it is not a provider, Queue, D1, deployment or staging chaos
run.

## Docs

```bash
cd docs
npm ci
npm run build
```

## Supply chain

```bash
node --test scripts/ci-security.test.mjs
node --test scripts/check-rust-wasm-advisories.test.mjs
node --test scripts/generate-contract-spdx.test.mjs
npm --prefix apps/web audit --omit=dev --audit-level=high
npm --prefix workers/livepeer-bridge audit --omit=dev --audit-level=high
npm --prefix docs audit --omit=dev --audit-level=high
```

The workflow regression requires every tracked third-party GitHub Action to use
a full commit SHA. CI requires the three runtime npm audits above. The reusable
CodeQL workflow is an explicit `CI Gate` dependency for pull requests and
pushes, while retaining its weekly/manual entrypoints. Local source inspection
does not prove an analysis run; report it as `UNPROVEN` until GitHub executes
the exact revision. CI downloads checksum-pinned cargo-audit 0.22.2 and fails
when a RustSec vulnerability is reachable from either contract's normal WASM
graph.
The same exact normal-WASM package lists are joined with full Cargo metadata to
produce deterministic SPDX 2.3 documents. CI retains the two contract SBOMs as
an exact-SHA artifact for 30 days; test/dev-only packages and local source paths
must be absent. This CI artifact is not a release attestation and a local
generation does not prove that GitHub produced or retained it.
The remaining `time` vulnerability is test/dev-only and stays visible because
its fix requires Rust 1.88 while NEAR contract builds are pinned to Rust 1.86.
NEAR SDK's default `wee_alloc` feature is disabled, so its unmaintained warning
is absent from both normal WASM graphs. Other lockfile-only informational
warnings stay visible; they do not silently become passing production claims.

## Observability policy

```bash
node --test scripts/slo-policy.test.mjs
```

This locks only the report-defined starting thresholds to bounded source event
names. `SOURCE_ONLY` is not a dashboard, delivered alert or runtime SLO result;
missing and provider-owned signals remain explicit in the policy.
The 256-record Durable Object gate is bound to the bounded
`durable_object_storage_observed.projectedRecordCount` source; this is not a
deployed storage-byte, operation-count or active-object metric.

Local, mocked and CI results must be reported separately from provider,
testnet, staging, deployment and production evidence.
