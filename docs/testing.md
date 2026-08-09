# Testing

## Web

```bash
cd apps/web
npm ci
npm test -- --run
npm run test:livepeer-canary
npm run lint
npm run build
```

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
  scripts/fetch-neardata-market-block.test.mjs \
  scripts/market-read-api.test.mjs \
  scripts/rebuild-market-read-model.test.mjs
```

These are pure local adapter/reducer/schema/API tests with mocked input. They
create no D1 database, binding or network connection. The explicit
`fetch-neardata-market-block.mjs` CLI performs a read-only testnet/mainnet GET
and must be reported separately from local tests.

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
