# Testing

## Web

```bash
cd apps/web
npm ci
npm test -- --run
npm run test:livepeer-canary
# Local Brave device storage / mock wallet and chain only
node scripts/device-session-browser-check.mjs
# Local Brave + ffmpeg: real player SDK, synthetic media; no provider/wallet calls
node scripts/player-browser-check.mjs
# Focused 30-second synthetic source: actual 360p / 720p / 1080p decoding
node scripts/player-browser-check.mjs --full-hd
# Combined 120-second 1080p fixture, full controls and native MP4 renewal (still not Safari HLS acceptance):
node scripts/player-browser-check.mjs --full-hd --extended
# Local device-activation UI: real React/transaction encoding, mock wallet/chain/token
node scripts/player-device-browser-check.mjs
npm run lint
npm run build
```

Catalogue freshness/read-budget regressions are in `catalog-refresh.test.ts`
and `near-read-budget.test.ts`. Discover (when the derived model is enabled)
refreshes every 15 seconds per loaded page while visible: 15 seconds for one
page, 45 for three. Every refresh still follows the complete cursor chain;
deeper browsing trades freshness for fewer scheduled requests. Returning to one
page restores the 15-second interval. Connected Profile activity remains at
15 seconds. Both refresh on focus when stale and do not add React Query retries;
focus, manual refresh and initial loading are outside the scheduled polling budget.
Contract view calls
use one abortable same-origin query with a 6,500ms deadline, covering response
body delivery as well as headers. The proxy retains its existing 6,000ms budget.
Transaction submission providers are unchanged. This is a per-contract-read
deadline; a Discover fallback page can perform count and list reads sequentially.

The V1 wallet connector (`@hot-labs/near-connect`) is created on visit only on
the V1 pages (`/discover`, `/upload`, `/watch`, `/profile`). Creating it fetches
the wallet list from GitHub (jsDelivr as fallback) and opens its own browser
storage, so the public, V2 and missing pages create it only on the first
Connect. `wallet-provider-pages.test.ts` covers that split, Connect after the
restore and pinned Meteor registration, and client-side navigation;
`legal-pages.test.ts` keeps the connector out of the public privacy notice.

The suite must cover upload processing, purchase, entitlement, creator
playback, stranger denial, sale suspension, takedown and disabled gates.

### Local run against public testnet (V1)

`next dev` cannot serve the V1 flow. The `/api/near-rpc` proxy needs the
Cloudflare rate-limit bindings and answers 503 without them, so Discover
fails to load. Build with OpenNext and run the Worker locally instead.
`--local` keeps the rate limiters in Miniflare and writes nothing to
Cloudflare. The `NEXT_PUBLIC_*` values are compiled in, so rebuild after
changing them.

```bash
cd apps/web
export NEXT_PUBLIC_NEAR_NETWORK=testnet \
  NEXT_PUBLIC_MARKET_CONTRACT_ID=video-market-v1-260907.youtick-dev-v3.testnet \
  NEXT_PUBLIC_ACCESS_CONTRACT_ID=video-access-v1-260907.youtick-dev-v3.testnet \
  NEXT_PUBLIC_VIDEO_ENVIRONMENT=public-testnet \
  NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1=true \
  NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2=true \
  NEXT_PUBLIC_LIVEPEER_BRIDGE_URL=https://bridge-public-testnet.youtick.net \
  NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE=false \
  NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS=true \
  NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL=false \
  NEXT_PUBLIC_ENABLE_NEAR_AUTH_V2=false \
  NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE=off \
  NEXT_PUBLIC_USDC_CONTRACT_ID=3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af \
  NEXT_PUBLIC_LIVEPEER_CREATOR_FEE_GAS_RESERVE_YOCTO=300000000000000000000000 \
  NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO=300000000000000000000000
npx opennextjs-cloudflare build
npx wrangler dev --env preview --local --ip 127.0.0.1 --port 3000
```

The contract IDs come from
`workers/livepeer-bridge/scripts/public-testnet-bootstrap-policy.json`.
Without the gas reserve, "Check payment options" fails with the generic
"The upload could not continue" message (`creator_fee_gas_reserve_not_configured`).
The value matches the `*_GAS_RESERVE_YOCTO` GitHub variables (0.3 NEAR).
The flags follow the web side of the `acceptance` mode in
`publicTestnetFlags` (`scripts/release-metadata.mjs`), with one exception.
The derived read model stays off, because `read-public-testnet.youtick.net`
only allows the deployed origin. Discover then reads from the chain. In
public-testnet mode the upload fee is paid only through the sponsored path.
With sponsored uploads off, "Pay and upload" fails with
`sponsored_upload_unavailable` before any wallet approval.
`sponsored_upload_wallet_unsupported` means the wallet cannot sign the
one-step sponsored approval; use Meteor.
With the playback authorizer off, playback falls back to the older per-video
Play grant and asks for a wallet transaction before each new video.
Meteor logs two CSP errors for `rsms.me/inter` and `fonts.cdnfonts.com`
from its sandboxed `about:srcdoc` frame. They are expected: the app CSP
blocks third-party stylesheets, and Meteor falls back to system fonts.
Sign-in, ticket purchase and playback use your own testnet wallet and real
testnet transactions. Treat the result as a local manual check, not as
Preview or Production evidence.

### Local run against the V2 testnet

The V2 pages (`/tickets`, `/invite`, `/studio`) need the V2 Workers and Market V2 compiled in,
and the shared NEAR Auth testnet client only allows `http://localhost:3000`. Like the V1 run,
build with OpenNext and serve the Worker locally; `--local` keeps the rate limiters in
Miniflare. Rebuild after changing any `NEXT_PUBLIC_*` value. Account ids are the V2 testnet
bootstrap of 2026-10-07 (`docs/v2-testnet-runbook.md`); the relayer, payment service and
Bridge must be deployed in `acceptance` mode.

```bash
cd apps/web
export NEXT_PUBLIC_NEAR_NETWORK=testnet \
  NEXT_PUBLIC_MARKET_CONTRACT_ID=v2-market-261007.youtick-dev-v3.testnet \
  NEXT_PUBLIC_MARKET_V2_CONTRACT_ID=v2-market-261007.youtick-dev-v3.testnet \
  NEXT_PUBLIC_ACCESS_CONTRACT_ID=v2-market-261007.youtick-dev-v3.testnet \
  NEXT_PUBLIC_CKD_GATE_ACCOUNT_ID=v2-ckd-gate-261007.youtick-dev-v3.testnet \
  NEXT_PUBLIC_ENABLE_NEAR_AUTH_V2=true \
  NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID=np8paqIpMWmNbzT4xAvOOapZBjsOpptl \
  NEXT_PUBLIC_RELAYER_URL=https://relayer-v2-testnet.youtick.net \
  NEXT_PUBLIC_PAYMENT_SERVICE_URL=https://pay-v2-testnet.youtick.net \
  NEXT_PUBLIC_LIVEPEER_BRIDGE_URL=https://bridge-v2-testnet.youtick.net \
  NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1=true \
  NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2=false \
  NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE=false \
  NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS=false \
  NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL=false \
  NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE=off \
  NEXT_PUBLIC_USDC_CONTRACT_ID=3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af \
  NEXT_PUBLIC_V2_CRYPTO_RAIL_DISABLED_LANGUAGES=xx
unset NEXT_PUBLIC_VIDEO_ENVIRONMENT
npx opennextjs-cloudflare build
npx wrangler dev --env preview --local --ip 127.0.0.1 --port 3000
```

What each value does:
- `NEXT_PUBLIC_MARKET_CONTRACT_ID` must equal Market V2. The upload client signs its Bridge
  envelopes with it, and the V2 Bridge is bound to Market V2; `/studio` refuses to run when the
  two differ. `NEXT_PUBLIC_ACCESS_CONTRACT_ID` is only required to be set; V2 has no
  access-control contract, so Market V2 stands in, as in the V2 Bridge release.
- `NEXT_PUBLIC_VIDEO_ENVIRONMENT` stays unset: the public-testnet mode would demand the
  sponsored upload path, which the V2 Bridge keeps off.
- `NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1=true` enables the shared upload client that
  `/studio` reuses for preflight, intent, tus upload and heartbeat.
- `NEXT_PUBLIC_V2_CRYPTO_RAIL_DISABLED_LANGUAGES=xx` lifts the product rule that hides the
  crypto checkout from a Turkish browser (the default list is `tr`, roadmap E7); without it a
  Turkish-language browser sees "Ticket sales are not available here yet" on `/tickets/buy`.
  Leave it out to test the rule itself.
- `NEXT_PUBLIC_V2_DEVICE_LINK_ENABLED=true` shows "Watch on this device" and renews a device in
  its last seven days. It needs a relayer deployed with `DAILY_DEVICE_LIMIT` and
  `TICKET_DAILY_DEVICE_LIMIT`, which no environment has yet; leave it out until then.
- `NEXT_PUBLIC_V2_CARD_RAIL=sandbox` shows the card option (E8.2). It needs a payment service with
  the card path on and a Cleeng sandbox configuration, which no environment has yet; leave it out
  until then.
- Open the app as `http://localhost:3000`, never `127.0.0.1:3000`: the NEAR Auth client allows
  only that origin, and the Claude desktop browser pane blocks the sign-in pop-up, so sign in
  from a normal browser.

Acceptance walk (PROVIDER evidence on testnet only; nothing here is Preview or Production
evidence):
1. `/invite?code=…` with a code from `POST /internal/invites` (owner, admin token): sign in with
   Google or a passkey; the account opens, the credit is paid, `/tickets` loads.
2. `/studio`: pick a short MP4, a title and a price of at least 5 USDC, approve the fee once on
   the NEAR Auth screen. The creator's implicit account must be in the Bridge allowlist
   (`docs/v2-testnet-runbook.md`, "NEAR Auth creators"); otherwise preflight answers
   `admission_closed`. Expected chain: relayer `/v1/uploads` → `get_media_job` shows the job →
   tus upload → Bridge finalization → the publication appears on `/discover`.
3. A second account (passkey) buys the ticket on `/tickets/buy?publication=<job id>` and plays
   it from `/tickets`.
4. Resume: close the tab after the fee is paid, reopen `/studio` with the same file and use
   *Resume this upload*; the relayer replaces the upload key (`/v1/upload-keys`) before the
   Bridge resumes.

The unit coverage is `__tests__/unit/v2-upload.test.ts` (delegates byte-equal to the protocol
`upload` vector, relayer approval flow, key replacement; LOCAL_TEST).

Walked on 2026-10-13 (PROVIDER, testnet; details in `docs/v2-testnet-runbook.md`, Evidence):
Google creator upload published in 4.5 minutes after the fee approval, passkey buyer paid
5 USDC, played the screening and the creator received the 3.958333 USDC share on first play.
Two things to expect: a passkey's first sign-in can end with "Sign-in did not complete" while
the passkey itself is created, and the second attempt signs in; and a fresh passkey account
needs USDC from the Circle faucet (https://faucet.circle.com, NEAR Testnet) when no invite
code is at hand.

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

`npm run probe:stream` (`scripts/stream-probe.mjs`, the Cloudflare Stream M0
proof round) is owner-run only and writes to the provider: every live
subcommand needs `STREAM_PROBE_MUTATIONS=true` plus `STREAM_ACCOUNT_ID` and
`STREAM_API_TOKEN` in the shell, and a per-gate approval. Never run it from an
agent session or CI; `--dry-run` prints the request plan without network
calls. Its mocked tests (`scripts/stream-probe.test.mjs`) run inside
`npm run test:provider-canary`.

## Relayer

```bash
cd workers/relayer
npm ci
npm test -- --run
npm run check
```

The tests use a decoded-transaction chain model and fake id_tokens (real RS256 verification is
tested with generated keys). They are LOCAL_TEST only: no NEAR Auth, MPC, `ckd-gate` or USDC
provider was called. The device-link tests (`/v1/devices`) replay the protocol `add_device`
vectors against a chain model of the Market's `add_device` rules; the real gas use and the
deployed Market are not exercised.

## Payment service

```bash
cd workers/payment-service
npm ci
npm test -- --run
node --test scripts/refunds.test.mjs scripts/card-orders.test.mjs scripts/cleeng-webhook.test.mjs
npm run check
```

The VAT attestation tests reproduce the protocol golden vector with the reference test key
(LOCAL_TEST). The refund inbox tests run the real D1 migration on in-memory SQLite (Node 24
`node:sqlite`) with a fake Market V2 view; the operator tool tests use a fake service, chain and
signer. The card path tests (E8) reproduce the golden `payment_reference_hmac` and `card_purchase`
message, and drive orders, provider events and the card operator through a fake provider adapter
and a fake chain. The Cleeng adapter tests (E8.1) feed it Cleeng's documented webhook and API
shapes through a fake `fetch`; they show the mapping matches the documentation, not that Cleeng
sends it (EXTERNAL_NOT_RUN until the sandbox). No RPC, signer secret or provider is used.

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

In CI the `Contracts (tests)` job restores the contract `target` directories
from a cache keyed on the Rust version and every `contracts/**/Cargo.lock`;
cargo still rebuilds the workspace crates. `Contracts (quality)` builds from a
clean target because it packages the runtime artifacts. A pull request that
only changes `.claude/`, `.agents/`, `claudedocs/`, `AGENTS.md` or the root
prose files runs no component jobs; `CI Gate` still runs.

## Market v2 protocol

The V2 byte formats live in `protocol/youtick-market-v2`. The checker rebuilds every golden
vector, verifies signatures and the NEAR Auth size budget:

```bash
node scripts/check-youtick-market-v2.mjs
# after an intended format change, regenerate and review the diff:
node scripts/check-youtick-market-v2.mjs --write
```

After `--write`, rerun the consumers that reproduce the vectors byte for byte: the Market v2
contract tests below, `workers/relayer` (`npm test -- --run`) and `apps/web`
(`npm test -- --run`, `__tests__/unit/v2-upload.test.ts`). The upload profile id is
`paid-media-v1` (gate MC, 2026-10-22); V1 keeps `paid-media-livepeer-v1`.

## Market v2 contract

`contracts/market-v2` runs on V2 testnet only (`v2-market-261007.youtick-dev-v3.testnet`);
code upgrades are owner-signed (`docs/v2-testnet-runbook.md`). Same toolchain as the other
contracts:

```bash
cd contracts/market-v2
cargo +1.86.0 test --lib
cargo +1.86.0 test --test market_v2
cargo +1.86.0 test --test sandbox
cargo +1.86.0 fmt --all --check
cargo +1.86.0 clippy --all-targets -- -D warnings
cargo +1.86.0 near build non-reproducible-wasm
```

`market_v2` includes `protocol_golden_vectors_are_accepted_byte_for_byte` and
`protocol_upload_vector_creates_a_job_under_the_neutral_profile`, which read
`protocol/youtick-market-v2/golden-vectors.json`. `sandbox` also asserts that the WASM no longer
exports the V1 method names (`finalize_livepeer_publication`, `suspend_livepeer_sales`,
`takedown_livepeer_publication`).

## ckd-gate

`contracts/ckd-gate` uses its own pins (near-sdk `=5.18.1`, fast-auth `base-jwt-guard` from git).
Always build with `--locked` and never run `cargo update`:

```bash
cd contracts/ckd-gate
cargo +1.86.0 test --locked
cargo +1.86.0 fmt --all --check
cargo +1.86.0 clippy --locked --all-targets -- -D warnings
cargo +1.86.0 near build non-reproducible-wasm --locked
```

A deployable gate comes only from the reproducible build (Docker, image pinned by digest in
`Cargo.toml`; needs a clean, committed tree; on macOS set `TMPDIR` under the home directory, because
Docker Desktop does not share `/var/folders`). CI's *ckd-gate reproducible build* job runs it whenever
the crate changes and keeps the WASM and its hashes for 90 days:

```bash
cd contracts/ckd-gate
cargo near build reproducible-wasm
node ../../scripts/verify-ckd-gate.mjs hash target/near/ckd_gate.wasm
```

`scripts/verify-ckd-gate.mjs check` reads a deployed gate (no transaction): no access keys, code hash
equal to a given WASM, and the expected `config`. Its unit test is `scripts/verify-ckd-gate.test.mjs`
(mocked RPC, LOCAL_TEST); run against a real gate it is PROVIDER evidence for that network only.

```bash
node scripts/verify-ckd-gate.mjs check --network testnet \
  --account v2-ckd-gate-261007.youtick-dev-v3.testnet --wasm <ckd_gate.wasm>
```

## Read model

```bash
node --test scripts/apply-market-read-model-d1.test.mjs \
  scripts/fastnear-dev.test.mjs \
  scripts/fetch-neardata-market-block.test.mjs \
  scripts/market-event-catalog.test.mjs \
  scripts/market-v2-read-model.test.mjs \
  scripts/v2-sparse-read-model.test.mjs \
  scripts/market-read-api.test.mjs \
  scripts/current-catalog.test.mjs \
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

The Discover index regression applies `0007_publications_discover_index.sql`
only to in-memory SQLite. It verifies unchanged public/creator pagination across
same-block ties and an indexed cursor seek without temporary sorting. The API
also works without the index; its performance benefit requires a separately
approved D1 migration. Worker deployment does not apply this migration.

Paid ingestion reserves at most 995 write queries per invocation, leaving five
of D1's 1,000 queries for Queue validation, cursor read/reset/reread and final
scan advancement or failure reset. It budgets
three queries per event plus one per complete block; the writer also checks
the actual statement count against the remaining budget before executing.
Dense-block tests cover scheduled/public, legacy and Queue paths, exact resume
without duplicate projections, and rollback on a late conflict. Multi-block
batches and the single-block writer keep the 16-event limit. On the paid path
17-, 64- and 298-event blocks are each written alone within a 895-query share,
exactly once; a 299-event block commits its predecessors and then halts with
`d1_final_block_query_budget_exceeded`. The catalogue regression measures a
95-publication first write plus a 298-event block at no more than 1,000 queries.
These are local SQLite tests with a modelled invocation limit,
not evidence of hosted D1 throughput or a configured alert.

### Neardata receipt order

The same-block regression passes raw Neardata data through the real parser and
D1 writer. It uses reverse-sorted receipt IDs, multiple logs in one receipt and
an unrelated shard. It checks the final takedown state, unchanged event identity
and payloads, agreement with the reducer, and idempotent replay. The parser keeps
the unfiltered receipt position as `execution_index`; `event_index` remains the
original log position.

Source basis: the [NEAR ordering fix](https://github.com/near/nearcore/commit/545d0417df530475584e2e357ac6a4478c0667bc)
is present in the [indexer pinned by FASTNEAR](https://github.com/fastnear/redis-node/blob/f7a524f147e1a9ea842cf95ab6d74fe9e6511a8a/Cargo.toml#L44).
Its [streamer preserves outcome order](https://github.com/fastnear/nearcore/blob/f0677c47a4352db8f7aca4cbdcd19b63e133214c/chain/indexer/src/streamer/mod.rs#L77-L178),
and the [Neardata conversion preserves the receipt vector](https://github.com/fastnear/libs/blob/cf64abf540ef8f552bf237e19a5ecf8a91c5c32f/primitives/src/block_with_tx_hash.rs#L31-L65).
The [node serializes that block](https://github.com/fastnear/redis-node/blob/f7a524f147e1a9ea842cf95ab6d74fe9e6511a8a/src/bin/node.rs#L1013-L1053),
the [saver retains the JSON](https://github.com/fastnear/redis-node/blob/f7a524f147e1a9ea842cf95ab6d74fe9e6511a8a/src/bin/caching_saver.rs#L306-L321),
and [Neardata returns its body](https://github.com/fastnear/neardata-server/blob/7324d9131e7e8285306606ba05822b007e44c53a/src/api.rs#L360-L385).
This supports same-shard order for one Market contract, not a global order
between shards. It is source evidence, not verification of the live provider's
version or archives produced before the upstream fix.

This change preserves supplied order for newly parsed blocks; it does not repair
past projections or add order metadata to `chain_events`. Legacy envelopes remain
supported separately; mixing envelopes with and without `execution_index` is
still rejected. No historical rebuild, remote migration or provider call is part
of this local regression.

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
a full commit SHA. CI requires the runtime npm audits above. The reusable
CodeQL workflow is an explicit `CI Gate` dependency for pushes to `main`, while
retaining its weekly/manual entrypoints; pull requests do not run it.
On pull requests the npm audit runs only when a `package.json` or
`package-lock.json` changes, and the WASM audit only when a contract
`Cargo.toml`/`Cargo.lock` or its audit scripts change; pushes to `main` always
run both. Draft pull requests run no CI jobs; marking one ready for review does. Local source inspection
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

## Protected release tooling

Existing local tests for Market code-update policy and release modes (no live writes):

```bash
node --test workers/livepeer-bridge/scripts/market-code-update.test.mjs
node --test scripts/release-metadata.test.mjs scripts/cloudflare-release.test.mjs scripts/release-smoke.test.mjs
```

A refreshed policy keeps both Market maintenance guards true. A live snapshot
while maintenance is off must reject; local test success does not authorize
workflow dispatch, maintenance calls or profile activation.


## Current-state catalogue (local, closed by default)

`current-catalog.test.mjs` uses synthetic RPC and transactional in-memory SQLite
for exact-final snapshots, 48-publication bounds, stale/conflicting/partial data,
atomic concurrency, lost-response reconciliation, historical-table preservation,
v2 cursor scope and expiry, and the shared scheduled-invocation budget.
`apps/web/__tests__/unit/current-catalog.test.ts` verifies source validation,
409 restart, stale/expired card rendering and the closed client flag.

```bash
node --test scripts/current-catalog.test.mjs
cd apps/web
npm test -- --run __tests__/unit/current-catalog.test.ts __tests__/unit/catalog-refresh.test.ts __tests__/unit/useAllVideos.test.ts __tests__/unit/market-read-model.test.ts
npx tsc --noEmit
```

### Targeted history scan (dry run)

```bash
node --test scripts/history-targeted-scan.test.mjs
# Read-only against the live index and neardata; never writes D1:
node scripts/history-targeted-scan.mjs --dry-run --network=testnet \
  --contract=video-market-v1-260907.youtick-dev-v3.testnet --from=<D1 watermark>
```

Tests use mocked FastNEAR and neardata responses: index paging and the receipt
lookback floor, market-only receipt blocks, deferral of transactions that finish
beyond the target, fail-closed incomplete or foreign index data, and a dry run
that reads only candidate blocks. The live dry run is evidence of the index and
event counts only; it does not prove the writer or reconciliation.

### Pilot alerts

```bash
node --test scripts/pilot-alerts.test.mjs scripts/slo-policy.test.mjs scripts/ci-security.test.mjs
```

The evaluator is tested with mocked Cloudflare and Google Chat responses only.
It checks thresholds, one threaded envelope per breach, fail-closed alerts for
query errors, unknown response shapes and missing read-model telemetry, and that
every log needle is a substring of a line the source emits. The telemetry
response shape, token permissions and Chat delivery are not proven locally.

Migration `0008_current_catalog.sql` is additive. Neither local tests nor a
successful packet build applies it remotely. The optional public-testnet
`catalog_mode` is `off` by default; `shadow` selects only snapshot generation,
`current` also selects the v2 Web reader. Both are rejected in `closed` mode.
The migration must be verified before an enabled release; these tests do not
claim hosted freshness or permit stopping the historical scanner.
