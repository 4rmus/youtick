# YouTick architecture transformation progress

Status: `PHASE_4_EVENT_PASS_TESTNET / PHASE_2_STAGING_NEXT / RUNTIME_GATES_CLOSED`

This file tracks the phased architecture plan in
`/Users/arair/Desktop/youtick/youtick-fazli-mimari-donusum-plani.md`. The plan
is the target; repository code, tests and separately classified runtime
evidence describe the current state. No status in this file authorizes a
deployment, traffic change, feature-gate change, contract mutation or provider
mutation.

## Baseline

- Recorded: 2026-08-09, Europe/Istanbul
- Branch: `agent/youtick-architecture-loop-20260809`
- Base: `origin/main@4fed6b466fe4da84e8d3d7bf1a39e9d52d079ce1`
- Upstream: `origin/main`
- Worktree at branch creation: clean
- Other worktrees were left unchanged.
- The previous local branch commit `9268a7f` is patch-equivalent to merged PR
  #90 (`git cherry origin/main agent/cloudflare-bridge-version-propagation`
  returned `-`).

## Status and evidence rules

Statuses are `PASS`, `PARTIAL`, `MISSING`, `DECISION_REQUIRED`,
`EXTERNAL_EVIDENCE_REQUIRED` and `BLOCKED`.

Evidence classes remain separate:

- `LOCAL_STATIC`: tracked source, configuration or documentation inspection.
- `LOCAL_TEST`: a command executed in this checkout.
- `CI`: a terminal GitHub Actions result for the relevant SHA.
- `TESTNET`, `PROVIDER`, `DEPLOY`, `PRODUCTION`: direct evidence from that
  environment. One class never implies another.
- Anything not run or observed is `UNPROVEN`.

## Report and repository differences

| ID | Status | Difference | Independent work allowed |
|---|---|---|---|
| DEC-001 | ACCEPTED | Use fresh isolated Market v2 and Access IDs with empty pilot state; do not import or overwrite the existing testnet pair. Mainnet also uses a fresh contract ID plus independently audited snapshot/import and invariant verification. | Market v2 carries `state_version=2`; no old-state migration claim. Mainnet implementation/audit remain later gates. |
| DEC-002 | ACCEPTED_FOR_TECHNICAL_PILOT | The technical pilot uses option A: explicitly non-refundable. Product/legal/finance confirmation for mainnet general access is still absent. | Preserve no-automatic-refund behavior; no reserve, escrow, implied credit or mainnet policy claim. |
| DEC-003 | ACCEPTED | `SALES_SUSPENDED` preserves playback for existing entitlements while blocking new sales; takedown blocks playback. | Implement this exact semantic in v2. |
| DEC-004 | ACCEPTED_FOR_PILOT | Pilot values are concurrency 2, attempts 2/day, ambiguity 15 minutes, monthly 20,000,000 micro-USD, per-job 2,000,000 micro-USD and retention 14/30/90 days. Testnet governance may omit multisig/timelock. | Values remain unconfigured until their bounded implementation/release checkpoint. |
| DEC-005 | ACCEPTED_GUARDED | UploadJob retention is 14 days, but terminal deletion may run only after the D1 archive commit is proven and legacy v1 playback no longer reads that job. | Keep destructive cleanup absent until both machine-verifiable preconditions exist. |
| DEC-006 | ACCEPTED_FOR_PILOT | Normal upload lease TTL is 30 minutes and the heartbeat interval is five minutes. The separate ambiguous-create timeout remains 15 minutes. | Implement lease ID/expiry/heartbeat locally behind the closed Bridge gate. |
| DEC-007 | ACCEPTED_FOR_PILOT | Testnet final events use Neardata from the fresh Market v2 deployment block; cursor advances after each complete final block. The source policy requires Workers Paid, one-minute cron and max 180 sequential blocks/run. Platform/SRE owns the D1 path, with chain-backed RPO 0, RTO 4h and pilot-end plus 90-day retention. | Keep the source and binding undeployed until ingestion, recovery measurement and a named human owner pass. |
| DEC-008 | ACCEPTED | YouTick keeps no platform source-media backup. Creators retain source files; provider asset loss suspends sales/playback and requires creator re-upload with a new publication or takedown. | Remove the source-archive protocol contract and backup-provider gates. Keep D1 as a rebuildable metadata read model only. |
| DEC-009 | ACCEPTED | Legacy/v2 authorization mismatch must be 0; upload resume success must be at least 99%; second payment and provider-asset counts must both be 0. | Encode exact source-only gates; deployed pilot samples remain external evidence. |
| DEC-010 | ACCEPTED | Persistent Durable Object state is capped at 256 records per object. | Shared source enforcement rejects record 257 and preserves existing-key updates; deployed storage metrics remain required and unarchived state is never deleted to meet the cap. |
| DEC-011 | ACCEPTED_MAINNET_DIRECTION | Mainnet uses 2-of-3 multisig plus a 24-hour timelock for unfreeze, authority rotation and privilege expansion; guardian pause/freeze remains immediate and privilege-reducing. | Implementation, custody separation, audit and drill evidence remain mandatory before general access. |

## User decisions recorded 2026-08-09

- Playback: eight-hour device-session certificate, 180-second JWT and preserved
  entitled playback during `SALES_SUSPENDED`.
- Browser keys: session only; no persistent key.
- Contract pilot: guardian can freeze immediately; admin and guardian are
  separate; admin alone unfreezes and executes a proposed rotation; admin or
  guardian may cancel. All changes emit events. Multisig and timelock are
  deferred for the first testnet/internal-pilot version and remain mandatory
  before mainnet general access. Fresh v2 IDs replace in-place import for the
  pilot.
- Read model: D1 for the pilot.
- Upload: separate UploadJob, coordinator and Queue accepted.
- Upload limits: global concurrency 2, creator attempts 2/day, ambiguous create
  15 minutes, monthly budget 20,000,000 micro-USD, per-job reservation
  2,000,000 micro-USD and initial creator allowlist
  `lp-arch-creator-260809.youtick-dev-v3.testnet`.
- Retention: UploadJob 14 days, webhook dedup 30 days, operator audit 90 days.
- Normal upload lease: 30-minute TTL and five-minute heartbeat.
- Queue: batch 10, five-second timeout, three retries, concurrency 1, four-day
  retention and dead-letter Queue. Dedicated testnet Queue/DLQ resources and
  source binding now exist; no deployed producer/consumer or activation exists.
- D1 operations: Neardata testnet final blocks, deployment-block start,
  complete-block cursor, Workers Paid, one-minute cron, max 180 blocks/run,
  Platform/SRE ownership, RPO 0, RTO 4h and pilot end plus 90-day retention.
- Finance: technical pilot is explicitly non-refundable; option A was
  reaffirmed on 2026-08-15 without authorizing an automatic refund, reserve,
  escrow or implied platform credit.
- Resilience: no platform source-media backup. Creators retain source files;
  provider asset loss suspends sales/playback and requires creator re-upload
  with a new publication or takedown.
- Acceptance gates: zero legacy/v2 decision mismatch, upload resume at least
  99%, zero second payment, zero second provider asset and at most 256 persistent
  records per Durable Object.
- Mainnet architecture: fresh contract ID with independently audited
  snapshot/import; 2-of-3 multisig and 24-hour timelock for unfreeze, authority
  rotation and privilege expansion; guardian pause/freeze remains immediate.
- Pilot parameter decisions are complete in `phase-0-foundation.md`. Separate
  funded testnet admin, guardian and pilot-creator accounts exist.
- External execution remains gated by exact target/account/artifact checks;
  this record does not treat local work as a testnet deployment or pilot run.

## PAY-001 technical-pilot policy decision — 2026-08-15

- DURUM:
  `DECISION_ACCEPTED_FOR_TECHNICAL_PILOT / MAINNET_POLICY_UNPROVEN / RUNTIME_UNCHANGED`.
- KARAR: Option A is fixed for the technical testnet/internal pilot. A completed
  purchase is explicitly non-refundable. There is no automatic on-chain or
  off-chain refund, platform reserve, settlement hold/escrow or implied credit.
  Any goodwill credit would be a separately approved manual operation and is
  not promised by this policy.
- SCOPE: This is not mainnet product/legal/finance approval. Mainnet general
  access still requires approved user-facing terms, support handling,
  accounting invariants and contract/treasury review. Existing entitlement,
  takedown and sales-suspension semantics are unchanged.
- READ-ONLY CURRENT TRUTH:
  - `origin/main@c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`; exact-main CI
    `31895385141` and Deploy Preview `31895517069` succeeded;
  - Preview Web version `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` and Bridge
    version `86305272-4ebb-4ca4-9d0e-11e3bd182b17` carry the exact-main tag.
    Bridge health is `stage=DISABLED`; provider/operator/upload/playback/Queue
    mutation gates are false. The public read API remains separately active at
    source tag `76e85f44e0d7ab38b0c96ab1302dcfde576b42dd`, with ingestion and
    backfill false;
  - dark read-model version `62451057-c6b6-40ff-a8f6-0ac6723d0a1c` carries
    the exact-main tag and all four runtime/write flags false. Dedicated
    backfill primary/DLQ producer-consumer counts are `0/0` and `0/0`;
  - bound D1 `50b1e14f-2b06-444b-98cf-b828f11277ef` is at watermark
    `264071553` / `5cC4NH1a2VYyt8gQmjnmPJ54cE1YvDKrqTx4436HYJb2`, with one
    publication, five chain events, one entitlement, one sale, one withdrawal
    and two governance rows. Both read-only queries report `rows_written=0`
    and `changed_db=false`;
  - `read-preview.youtick.net`, `bridge-preview.youtick.net`,
    `preview.youtick.net` and `youtick.net` returned HTTP 200. Production Web
    and Bridge Workers do not exist in the account and `app.youtick.net` /
    `bridge.youtick.net` did not resolve.
- KANIT: read-only Git/GitHub/Cloudflare control-plane, HTTP and D1 evidence.
  No deploy, Queue/D1 write, provider, wallet, payment, chain, email, alert or
  support mutation occurred.
- FAZ KAPISI: `PASS_FOR_TECHNICAL_PILOT` for the PAY-001 policy decision only.
  PAY-001 remains partial for mainnet approval and accounting closure.
- UZLAŞTIRMA: Checkpoints 130–143 are now recorded below with their original
  evidence classes. The PAY-001 pilot decision is included in the closure.
- SONRAKİ: EVENT-001 standard event catalog; do not activate runtime, Queue/D1
  writes or a new economic flow automatically.

## Phase exit gates

### Phase 0 — foundation and activation freeze

| Exit gate | Status | Evidence |
|---|---|---|
| All ADRs accepted | PASS_FOR_PILOT | Fresh-v2, governance, playback, D1, upload, budget/retention and technical-pilot non-refundable decisions are explicit. Mainnet finance/governance remain later gates. `LOCAL_STATIC`. |
| State inventory complete | PASS | Current and target owners, growth, retention and cleanup gaps are recorded in `phase-0-foundation.md`. Unknown policy values remain explicit rather than guessed. `LOCAL_STATIC`. |
| Threat model reviewed | PARTIAL | Required scenarios and test strategies are recorded; independent security review is `UNPROVEN`. `LOCAL_STATIC`. |
| Every P0 has owner and test strategy | PARTIAL | Role owner and `@4rmus` repository owner are mapped; named specialist/reviewer assignment is not confirmed. `LOCAL_STATIC`. |
| Runtime gates closed | PASS | Tracked defaults and guarded Preview/Production release inputs force new upload, all-playback issuance, provider mutation and operator mutation false alongside the existing false/off gates. The serving Preview Worker reports `stage=DISABLED`, `providerMutationEnabled=false`, `controlPlaneReady=false`, `playbackReady=false`; it predates the new source fields and is not presented as their deploy proof. Production Bridge/app DNS did not resolve. `LOCAL_STATIC` + prior `DEPLOY`; production capability remains absent rather than activated. |
| Staging/testnet configuration backed up | PARTIAL | Sanitized file hashes, GitHub gate variables, deployed Preview version/binding names and public health are recorded in `phase-0-foundation.md`. Secret values were intentionally not copied; a full secret-store backup is `UNPROVEN`. |
| Base metrics and structured log schema active | PARTIAL | Edge requests, every direct NEAR/Livepeer API/TUS/media fetch, persisted UploadJob transitions, upload-intent control, verified Queue ACK/delivery lag, payment quote/status routes, bounded legacy/v2 shadow decisions, playback internal errors, takedown-token attempts, pending operator nonce age and bounded read-model routes emit events. The first real request per Worker isolate marks `coldStart=true`; later requests mark `false`. Capacity checks emit bounded current/pending/projected DO record counts with one of four state kinds and no extra storage read. Market exposes the exact storage/reserve guard; a read-only probe computes final-to-optimistic RPC lag; exact-SHA release manifests record verified bundle/config/lockfile byte counts. URLs, payloads, credentials, nonce values and job/provider identifiers are omitted. A source-only policy locks report thresholds to those sources. DO bytes/read/write/active-object metrics, Queue depth and deployed aggregation remain missing. `LOCAL_TEST`; deployed activation and observations are `UNPROVEN`. |

### Phase 1 — P0 security and governance

| Exit gate | Status | Evidence |
|---|---|---|
| P0 signless-key tests pass | PASS | FullAccess, empty/additional methods, wrong receiver, null/unlimited, below-minimum and above-maximum allowance are rejected at finality. Exact finite permission passes; RPC unknown fails closed without duplicate provisioning. Secure disconnect covers subject-grant revoke, exact-key deletion, wallet-rejection preservation and bounded final-state reconciliation when the wallet callback is lost. Targeted matrix 14/14 and related grant suite 11/11. `LOCAL_TEST`; the current dirty reconciliation diff has no CI/deploy proof. |
| Browser secret is not broad persistent localStorage state | PASS_PREVIEW | Signless secrets use sessionStorage; legacy `youtick:signless-keystore:` localStorage entries are removed and no persistent-device option exists. Explicit disconnect wallet-signs `revoke_subject_sessions` plus deletion of the exact signless key, and fails closed if approval is rejected. Checkpoints 159–160 prove final testnet revoke/current-key deletion and deployed callback recovery without a second wallet prompt. Checkpoint 162 then proves final deletion of the two older broad FunctionCall keys; Checkpoint 163 removes the temporary cleanup surface and re-verifies exactly one FullAccess wallet key. The cleanup wallet skipped the expected approval stop, and that deviation remains recorded rather than treated as reusable UX. A production nonce CSP has no `unsafe-inline`; local production HTTP/browser smoke passed. `LOCAL_TEST` + `TESTNET_MUTATION` + isolated `PREVIEW_DEPLOYMENT/RUNTIME`. |
| Bridge freeze/rotation rehearsed on testnet | PASS | Fresh Market v2 artifact hash matches on-chain code. Guardian freeze, frozen rotation, old/new authority checks, admin unfreeze and restoration of the original bridge were executed with NEP-297 events. Final state is unfrozen with no pending rotation. `TESTNET_MUTATION`. |
| Migration verified on fixture | ACCEPTED_PILOT_EXCEPTION | Market v2 source has `state_version=2`; the accepted pilot uses fresh empty IDs and does not claim old-state migration. Mainnet snapshot/import remains a later gate. |
| Access pause/resource semantics fixed | PASS | Fresh Access v2 requires a bounded Play resource, applies global/scope pause during verification, caps each owner at 16 active grants, paginates list/cleanup and can disable new issuance. Contract 14/14 and web call-shape 11/11 pass. On testnet one session-only grant verified, revoked and cleaned to empty. `LOCAL_TEST` + `TESTNET_MUTATION`. |
| RPC abuse test proves bounded resources | PASS_LOCAL | Read/broadcast routes are separate; experimental methods are absent; 64 KiB request and 2 MiB response caps, 2.5-second upstream and six-second read deadlines, bounded rate maps, IP/account limits, read-only fallback, broadcast no-replay, safe provider metrics and a three-failure circuit breaker have 15/15 route regressions, including proof that an open circuit skips the failed upstream. Dedicated authenticated primary is supported but not deployed; per-instance rate limiting is not a distributed edge guarantee. `LOCAL_TEST`. |
| No open P0 except controlled legacy playback grant | PASS_LOCAL | Nonce CSP and secure revoke/clear UX now pass locally. Bridge governance, fresh-v2 state choice, AUTH-001 and Access bounds pass locally/testnet as recorded. The controlled legacy playback path remains closed by runtime gates; deployed verification is `UNPROVEN`. |
| Security regressions are mandatory CI gates | PASS_CI | Relevant CSP, signless, Access and governance tests run in the Web/Contracts jobs. All tracked third-party Actions are commit-SHA pinned; runtime npm advisories, RustSec and the reusable JavaScript/TypeScript plus Rust CodeQL workflow are explicit dependencies of the ruleset-required `CI Gate`. Exact-main run `31340805068` passed both CodeQL languages and `CI Gate` for `df381b0f5b263870128b911768de616169ddeb97`; both main analyses report zero results and alerts #3–#5 are `fixed` without dismissal. `CI`. |

### Phase 2 — stateless playback and bounded state

| Exit gate | Status | Evidence |
|---|---|---|
| V2 authorizer works in production-like staging | PASS_PREVIEW | Checkpoint 149 reused the exact CI-green PR-head code, installed only the validated Livepeer credential in a new secret version, and held the candidate at 0%. Three version-overridden valid requests returned 200 and independently verified 180-second ES256 JWTs; each tail event reported three final NEAR reads and one Livepeer policy read, all 200. Stable-only 100% and every runtime flag false were restored. `LOCAL_TEST` + exact-head `CI` + bounded `PREVIEW_DEPLOYMENT` + `TESTNET_READ` + `PREVIEW_RUNTIME`. |
| Persistent write per token is zero | PASS_LOCAL | V2 invokes the authorizer directly without `LIVEPEER_CONTROL`; success and same-request replay tests prove no DO access while final reads repeat. V1 remains an independently closed fallback. `LOCAL_TEST`. |
| Cold and cache-hit NEAR reads meet approved bounds | PASS_PREVIEW | Cold v2 performs three final NEAR reads plus one provider-policy read. Checkpoint 152 reused one signed request over a single keep-alive connection: the first Preview call was `MISS` with `rpcCalls=3` and `providerCalls=1`; the next eleven were all `HIT` with both counts zero. All 12 returned 200; cache-hit client p95 was 100 ms, below the approved 500 ms target, while tail authorization latency was 0 ms. Publication/provider expire at 30 seconds, wallet proof at 60 seconds, positive entitlement at five minutes and negative at three seconds. Takedown and removed-key boundary tests pass. Stable-only 100% and every runtime flag false were restored. `LOCAL_TEST` + exact-head `CI` + bounded `PREVIEW_DEPLOYMENT` + `TESTNET_READ` + `PROVIDER_READ` + `PREVIEW_RUNTIME`. |
| Legacy/v2 shadow mismatch below approved threshold | PASS_PREVIEW | The accepted mismatch ratio is exactly 0. Checkpoint 150 recorded one valid `DENY/DENY` pair and Checkpoint 151 recorded one valid `ALLOW/ALLOW` pair against the same 0%-traffic candidate, for aggregate mismatch `0/2`. The positive pair used one zero-deposit, 180-second testnet legacy `Play` grant. Both samples returned only the legacy response contract; v2 shadow issued no JWT and added no durable write. Direct v2 and every mutation/Queue/archive gate stayed closed. Stable-only 100% and every runtime flag false were restored after each sample. `LOCAL_TEST` + exact-head `CI` + bounded `PREVIEW_DEPLOYMENT` + `TESTNET_READ/WRITE` + `PROVIDER_READ` + `PREVIEW_RUNTIME`. |
| Device-certificate UX and revoke/clear verified | PASS_PREVIEW | Checkpoint 156 aligned the isolated Web and guarded Bridge candidate with the exact entitled buyer. One user-approved wallet certificate produced direct-v2 HTTP 200 and rendered the player; automatic same-page refresh and Checkpoint 158's repeat both returned 200 without another certificate prompt. Checkpoints 159–160 prove final testnet subject revoke/current-key deletion and deployed callback recovery to persistent `Connect` without a second wallet prompt. Checkpoint 162 removed both older broad FunctionCall keys at finality; Checkpoint 163 removed the temporary cleanup signer surface and re-verified exactly one FullAccess wallet key. The cleanup wallet's unexpected no-stop submission is recorded as a deviation and is not part of the accepted product UX. Public Web and Bridge deployments stayed stable-only 100% with every Bridge runtime flag false. `LOCAL_TEST` + exact-head prior `CI` + isolated `PREVIEW_DEPLOYMENT` + `TESTNET_READ/WRITE` + `PROVIDER_READ` + browser `PREVIEW_RUNTIME`. |
| Access grant issuance can be disabled | PASS_LOCAL | Fresh Access v2 has an independent, readable issuance flag behind the existing owner timelock. One regression proves the exact 24-hour decommission sequence: a grant issued during the delay remains verifiable, execution rejects new issuance, and subject revoke plus bounded cleanup still work. Testnet execution remains absent. `LOCAL_TEST`. |
| DO retention/cleanup proven automatically | PARTIAL | Creator-fee/payment rate-limit objects alarm and `deleteAll()` at window expiry; signed control nonces expire with their at-most-five-minute request and purge in 128-record batches; normal/ambiguous admission leases release at 30/15 minutes, webhook dedup purges at 30 days and admission-reopen audit at 90 days. Independent default-off UploadJob and operator outbox D1 archive sources persist bounded summaries, commit/retry metadata and 14/90-day eligibility boundaries locally. Checkpoint 169 audits every persistent new-key path and proves all four state kinds reject record 257 before write while existing-key updates remain available at 256. Real D1 commits and both destructive deletes remain absent. `LOCAL_TEST`. |

### Phase 3 — upload and Livepeer control plane

| Exit gate | Status | Evidence |
|---|---|---|
| Multiple creators upload concurrently | PARTIAL | The serialized coordinator now admits two different creators concurrently, preserves one active job per creator and rejects a third. Actual parallel provider/TUS E2E is `UNPROVEN`. `LOCAL_TEST`. |
| One stuck job does not close global admission | PASS_LOCAL | A generic `CREATE_AMBIGUOUS` or first transient provider failure releases after the accepted 15 minutes while admission stays open; its per-job DO still prevents duplicate provider create. Provider-wide 402/429 immediate closure and two independent 5xx/timeouts inside 60 seconds remain separate circuit-breaker conditions. `LOCAL_TEST`. |
| Lease timeout auto-releases | PASS_LOCAL | Normal reservations receive a random lease ID, expire after 30 minutes and renew from the same session-only upload key every five minutes. Coordinator alarm release, wrong-lease rejection and web signing pass locally. The separate ambiguous timeout remains 15 minutes. Real long-upload/browser/staging proof is absent. `LOCAL_TEST`. |
| Reload/crash resumes the same TUS resource | PARTIAL | An authenticated retry after browser-key replacement and job-object restart returns the same TUS URL without a second provider create; client HEAD/offset resume also passes. The independent new-upload gate rejects an unrecorded intent while the same recorded Job returns its existing TUS resource. The v2 session draft checks name/bytes/lastModified plus bounded source SHA-256; signed upload-intent v3 persists that declaration and rejects a conflicting recovery. Real browser reload/staging and provider-computed full-source fingerprint proof are absent. `LOCAL_TEST`. |
| Webhook ACK avoids heavy provider probing | PARTIAL | Exact-main Preview proved that the gated ingress verifies a real Livepeer signature, enqueues the bounded event and returns `202` before job-object/provider work; the terminal ready replay and older processing update then ACKed. Post-ACK reconciliation maintenance still performed read-only provider asset/playback/media probes, so a strict zero-provider-read interpretation remains open even though no mutation or duplicate economic side effect occurred. `LOCAL_TEST` + `PREVIEW_QUEUE`. |
| Duplicate/out-of-order queue tests pass | PASS_PREVIEW | Exact-main Preview delivered one real terminal `asset.ready` replay followed by one older `asset.updated/processing` event. Both messages ACKed, the older event did not regress `ONCHAIN_PUBLISHED`, and payment, provider asset, publication and finalize counts stayed singletons. General redelivery/load evidence remains outside this bounded canary. `LOCAL_TEST` + `PREVIEW_QUEUE`. |
| Worker split across domain boundaries | PARTIAL | The vendor-neutral port is 88 lines; separate 319-line provider/transport, 251-line ready-verification, 75-line webhook-normalization, 77-line UploadJob archive, 76-line operator archive and 33-line observed-fetch modules own external details. `workers/livepeer-bridge/src/index.ts` is 5,289 lines and still contains routes, domain state, a small environment composition factory, NEAR and DO logic. `LOCAL_TEST`. |
| UploadJob terminal cleanup works | BLOCKED | The 14-day policy and default-off bounded D1 archive source pass locally, but deletion is intentionally absent until a real D1 archive commit is proven and v1 playback no longer reads the job. Neither external precondition exists, so no destructive cleanup is scheduled. |
| Provider cost/budget metrics visible | PARTIAL | Source requires and reports positive monthly/per-job reservation values and auto-closes before exceeding the configured cap. This is a guard, not actual-cost accounting. Livepeer's public [Studio pricing](https://livepeer.studio/pricing) is minute-based and includes plan/minimum-spend terms, while the bridge upload intent has no duration and the asset response has no per-job billed-cost field. Machine-readable commercial terms plus invoice/usage reconciliation are `EXTERNAL_EVIDENCE_REQUIRED`. |

### Phase 4 — events, read model and finance

| Exit gate | Status | Evidence |
|---|---|---|
| Standard events emitted on testnet | PASS_TESTNET_FINAL | Checkpoint 145 combines 11 existing pilot events with the seven previously missing events produced on an isolated fresh-ID canary. All 18 applicable catalog entries have exact final block hash, receipt ID and event index evidence; `contract_migrated` is `NOT_APPLICABLE_FRESH_ID`. The canary is frozen and purchase-paused. `LOCAL_TEST` + `TESTNET_MUTATION` + exact-final `TESTNET_READ`. |
| Read model rebuilds from chain | DEFERRED_POST_PLAN / NOT_A_V1_GATE | Bounded contiguous Neardata-to-D1 paths are proven, including the current v1 watermark `264071553`. Checkpoint 133 removed full zero-to-tip rebuild and RTO 4h from v1/Phase 4/Phase 6 exit gates; automatic continuation remains closed. `LOCAL_TEST` + bounded `D1_WRITE`; full rebuild is deliberately not claimed. |
| Event idempotency/finality watermark tests pass | PASS_TESTNET_BOUNDED / CONTINUOUS_UNPROVEN | Reducer/D1 contracts deduplicate `(block_height, receipt_id, event_index)`, reject conflicts and require contiguous final blocks. Checkpoints 142–143 advanced v1 D1 by 41,163 blocks to exact hash `5cC4NH1a2VYyt8gQmjnmPJ54cE1YvDKrqTx4436HYJb2`; gaps and stale/incomplete inputs failed closed. Queue/continuous ingestion remain off. `LOCAL_TEST` + `CI` + bounded `D1_WRITE`. |
| Discover/profile use read API | PASS_PREVIEW / PRODUCTION_CLOSED | `read-preview.youtick.net` serves publication-only D1 reads to Preview Discover/Profile. Creator sales, balances and withdrawals are not public; purchase/playback authority remains on NEAR. Checkpoint 140 proved fail-closed rollback and final exact-main Preview Web/Bridge/dark Worker deployment. Production Web/API remain absent. `CI` + `PREVIEW_DEPLOYMENT` + browser UAT. |
| Purchase/playback remain canonical-chain based | PASS | Current architecture and Worker final reads retain NEAR authority. `LOCAL_STATIC`; target runtime activation is not implied. |
| Sale ledger and withdrawal audit available | PASS_TESTNET / MAINNET_UNPROVEN | Checkpoint 143 projected one 2 USDC sale, one entitlement and one terminal 1.96 USDC withdrawal from exact final testnet events; decimal creator/platform amounts reconcile to `1960000/40000`. Financial projections remain non-public. Production/mainnet accounting and continuous ingestion are `UNPROVEN`. `LOCAL_TEST` + `TESTNET_MUTATION` + `D1_WRITE`. |
| Refund/credit policy approved | PASS_FOR_TECHNICAL_PILOT / MAINNET_PARTIAL | Option A is accepted for the technical pilot: no automatic refund, reserve, escrow or implied credit. Mainnet product/legal/finance confirmation, user-facing terms and accounting invariants remain open. `LOCAL_STATIC` + read-only current-runtime verification. |

### Phase 5 — scale, cost and SRE

| Exit gate | Status | Evidence |
|---|---|---|
| SLO dashboards and alerts active | PARTIAL | `observability/slo-policy.json` locks five report thresholds, binds all nine alert classes to a primary role/action and inventories the report's six domain controls. The finality source emits structured `lag_blocks` at one-minute cadence, but no deployed alert policy, notification route, delivered alert or drill receipt exists. Cloudflare support is not an activation path; a currently supported alert channel requires a separate decision. `LOCAL_TEST` + `PREVIEW_DEPLOYMENT`. |
| Hot-publication latency/error target met | EXTERNAL_EVIDENCE_REQUIRED | No approved load target execution exists. |
| DO growth bounded and cleanup verified | PARTIAL | The accepted ceiling is 256 persistent records per Durable Object; shared transactional source emits state-kind/current/pending/projected counts from the existing bounded capacity read, rejects record 257 and permits existing-key replay at the ceiling. Control nonce, webhook dedup, rate-limit and admission-audit cleanup pass locally; confirmed operator records are minimized and have a default-off bounded D1 archive/90-day eligibility source. Real operator archive commit/delete, UploadJob destructive cleanup and deployed record/byte/active-object metrics remain absent. `LOCAL_TEST`. |
| Upload-resume success above approved threshold | EXTERNAL_EVIDENCE_REQUIRED | The accepted gate is at least 99% same-resource resume with exactly zero second payments and zero second provider assets. Local recovery/canary regressions pass, but no deployed pilot sample or payment/provider receipt aggregation exists. |
| RPC/provider fault injection degrades safely | PARTIAL | The report's eight chaos scenarios now map to deterministic local regressions: bounded NEAR failures/circuit, Livepeer 429/5xx/timeout admission behavior, duplicate/out-of-order webhook, Queue retry/redelivery, ambiguous broadcast reuse, exact-version rejection, early/delayed alarm timing and bounded D1/API/Web fallback. This is complete source-matrix coverage, not a real chaos run. Provider, Cloudflare Queue/D1, mixed deployed versions and staging evidence remain `EXTERNAL_EVIDENCE_REQUIRED`. `LOCAL_TEST`. |
| Cost model and budget alarm defined | PARTIAL | Approved pilot monthly/per-job reservation values fail closed locally and provider 402/429 closes admission. Actual Livepeer billed-usage/invoice reconciliation and delivered budget alerts remain external. `LOCAL_TEST`. |
| Security/supply-chain gates mandatory | PARTIAL | All tracked third-party Actions are commit-SHA pinned; runtime npm high-severity advisories, RustSec and reusable JavaScript/TypeScript plus Rust CodeQL are required by `CI Gate`. Exact-main `c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc` CI `31895385141` passed before Preview deployment `31895517069`; earlier main CodeQL alerts #3–#5 remain fixed without dismissal. Contract and Worker runtime SPDX/mainnet attestations remain incomplete. `CI` + `PREVIEW_DEPLOYMENT`. |
| Exact-SHA mainnet release candidate reproducible | PASS_PREVIEW / MAINNET_UNPROVEN | Checkpoint 140 proved exact-main Preview deployment plus fail-closed rollback and recovery. No mainnet candidate artifact, production Worker or activation evidence exists. `CI` + `PREVIEW_DEPLOYMENT`; mainnet remains `UNPROVEN`. |

### Phase 6 — resilience, audit and mainnet

| Exit gate | Status | Evidence |
|---|---|---|
| External audit P0/P1 closed | EXTERNAL_EVIDENCE_REQUIRED | No audit report supplied. |
| Bridge/provider/migration drills complete | EXTERNAL_EVIDENCE_REQUIRED | Fresh mainnet ID plus independently audited snapshot/import is accepted, but no mainnet implementation, audit or current drill packet exists. |
| Provider asset-loss response drill succeeds | PARTIAL | The source-only incident policy suspends sales/playback and requires creator re-upload with a new publication or takedown. No deployed provider-loss drill, support receipt or user-facing terms exist. `LOCAL_STATIC`. |
| Dark deploy and internal mainnet canary proven | PASS_PREVIEW / MAINNET_UNPROVEN | Exact-main Preview Web/Bridge/dark read-model deployment and publication-read UAT passed with mutation/write gates closed. Production app/Bridge Workers and DNS remain absent; no mainnet canary or mutation is authorized. |
| Refund/support/incident processes ready | PARTIAL | Pilot non-refundable direction, a source-only nine-alert incident table and a six-domain kill-switch matrix are recorded. All six controls are source-ready; global new purchases uses guardian pause/admin unpause and preserves existing entitlements. Named humans, deployed control proof, delivered notification route, drill receipts, mainnet terms and support approval remain absent. `LOCAL_TEST` + `LOCAL_STATIC`. |
| Mainnet checklist approved by governance | EXTERNAL_EVIDENCE_REQUIRED | The required model is accepted as 2-of-3 multisig plus a 24-hour timelock, with immediate privilege-reducing guardian pause/freeze. Implementation, custody, audit, drill and governance approval evidence are absent. |
| General access can open gradually | BLOCKED | Depends on all preceding phase gates and explicit activation approval. |

## Section 14 backlog

| ID | Phase | Status | Current evidence / next proof |
|---|---:|---|---|
| AUTH-001 | 1 | PASS | Exact final permission validation and rejection matrix pass locally; CI/runtime proof is absent. |
| AUTH-002 | 1 | PASS_LOCAL | Session-only secret, legacy localStorage cleanup, nonce CSP and secure on-chain revoke/exact-key deletion pass locally; deployed wallet/browser proof is absent. |
| GOV-001 | 1 | PASS_TESTNET | Market v2 governance and events pass locally; the fresh closed testnet freeze/rotate/unfreeze drill succeeded. Mainnet requires the accepted 2-of-3 multisig and 24-hour timelock; implementation/audit evidence is absent. |
| GOV-002 | 1 | ACCEPTED_PILOT_EXCEPTION | Fresh Market/Access v2 IDs were deployed and old IDs were not overwritten. Mainnet uses an accepted fresh ID plus independently audited snapshot/import; implementation remains later work. |
| AUTH-003 | 1 | PASS_TESTNET | Required resource, pause semantics, field/per-owner bounds, cleanup and independent issuance control pass locally; a grant issue/verify/revoke/cleanup drill succeeded on the fresh Access v2 testnet ID. The source-only issuance-decommission sequence now passes; its testnet execution is absent. |
| RPC-001 | 1 | PASS_LOCAL | Separate bounded read/broadcast paths, deadlines, response caps, rate maps and no-replay broadcast pass locally. Dedicated provider and distributed edge quota evidence remain external. |
| PLAY-001 | 2 | PASS_LOCAL | Eight-hour NEP-413 device certificate, memory-only device key, signed request binding and disconnect/page-reload clear pass locally; deployed wallet proof is absent. |
| PLAY-002 | 2 | PASS_PREVIEW | Local authorization and 1,000-request load evidence pass. Checkpoint 149's 0%-traffic candidate issued independently verified 180-second ES256 JWTs for three version-overridden valid requests; every request performed three final testnet NEAR reads plus one successful Livepeer policy read. Stable-only 100% and all runtime flags false were restored. |
| PLAY-003 | 2 | PARTIAL_PREVIEW | Bounded TTL cache, cold/hit read counts, provider JWT-policy check and 30/60-second takedown/key-removal bounds pass locally. Checkpoints 150–151 close the deployed shadow slice at mismatch `0/2`. Checkpoint 152 adds one deployed cold miss followed by eleven deployed cache hits with zero warm NEAR/provider reads and 100 ms client p95. Direct v2, provider mutation and persistent shadow writes stayed closed after restore. Event-driven invalidation remains absent. |
| DO-001 | 2 | PARTIAL | Shared transactional enforcement emits a bounded `durable_object_storage_observed` event for `upload_job`, `admission`, `operator` or `rate_limit`, rejects record 257 and permits existing-key replay at the accepted 256-record ceiling. Rate-limit `deleteAll()`, 30-day webhook dedup and 90-day admission audit cleanup pass automatically. Independent default-off UploadJob and confirmed operator D1 archives enforce bounded summaries plus 14/90-day eligibility locally without deletion. Real archive commits, operator/UploadJob destructive cleanup and deployed metrics remain absent. |
| UP-001 | 3 | PASS_LOCAL | Coordinator limits, budgets, 30-minute lease, five-minute heartbeat, wrong-token rejection, alarm release and 15-minute ambiguity isolation pass locally. A default-off new-upload gate rejects unrecorded intents while recorded intent/heartbeat/TUS recovery remains available. Real browser/large-upload/staging evidence is absent. |
| UP-002 | 3 | PARTIAL | One allowed-predecessor table and timestamps cover real `AUTHORIZED → LEASED → PROVIDER_CREATE_PENDING → UPLOAD_READY → UPLOADING → PROCESSING → READY_VERIFIED → FINALIZE_RETRY/QUEUED → ONCHAIN_PUBLISHED` signals plus cancel/expiry/provider-failure terminals. Creator cancellation is pre-provider-only and non-refundable. Provider create uses one fail-closed `RECONCILE_ONLY` attempt; finalize retry uses capped 60–900-second backoff. Default-off terminal D1 archive/14-day eligibility passes locally, but real commit, v1 playback independence and deletion are absent. `LOCAL_TEST`. |
| UP-003 | 3 | PARTIAL | Authenticated retry after browser-key replacement/object restart and after `UPLOADING` recovers the same TUS URL with no second provider create. The accepted gate is at least 99% resume success with zero second payments/assets. The v2 session draft rejects same-metadata/different-content files; upload-intent control v3 signs its bounded SHA-256 and UploadJob v2 rejects a conflicting retry. Deployed samples and payment/provider receipts remain absent. `LOCAL_TEST`. |
| LP-001 | 3 | PARTIAL | Gated HMAC-verified Queue ingress and ACK/retry/poison consumer pass locally. Dedicated testnet Queue `0a0a7e4fe00547439c24aafc8f5316c2` and DLQ `82246e5e383d488d935a97169fe3cb63` exist with the exact source producer/consumer policy. Both provider attachment counts remain zero; deployed binding, redelivery and staging proof are absent. |
| LP-002 | 3 | PARTIAL | The concrete `MediaProvider` implementation now lives with separate API/TUS transport and raw normalization; ready validation, bounded private-media probes and pure webhook normalization also have explicit modules. The independent provider-mutation gate blocks create before lease/provider use while keeping an authorized job recoverable; provider reads and existing TUS recovery stay available. Conservative cost reservation exists, but actual billing reconciliation is external. No runtime asset-delete call site exists, so an unused mutation was not added. `LOCAL_TEST`. |
| WEB-001 | 3 | PASS_LOCAL | One canonical UI stage follows the target lifecycle and a pure predecessor table enforces forward/retry/reset/terminal edges. A fingerprint-verified v2 draft restores safe UI projections; provider-processing resumes visibility-aware Query polling without reopening payment, while interrupted upload returns to upload-ready. The finality retry and composed job/publication read now live in the existing publication use-case service, leaving the component without a direct network primitive or timer. Real browser reload/staging proof remains absent. `LOCAL_TEST`. |
| EVENT-001 | 4 | PASS_TESTNET_FINAL | Mandatory tooling locks the Rust producer, both consumers and the recorded 18-event final testnet evidence to one catalog. The isolated canary supplied the seven previously missing events without changing the existing pilot contract; every applicable event now has a physical final-chain identity. `contract_migrated` remains `NOT_APPLICABLE_FRESH_ID`, not a fabricated event. Mainnet emission remains `UNPROVEN`. |
| DATA-001 | 4 | PASS_V1_BOUNDED / CONTINUOUS_CLOSED | V1 D1 `50b1e14f-2b06-444b-98cf-b828f11277ef` has migrations 0001–0004, watermark `264071553`, one publication, five chain events, one entitlement, one sale, one withdrawal and two governance rows. Preview publication reads are active; ingestion/backfill/continuation and dedicated Queues remain unbound. Full rebuild/RTO 4h are deferred post-plan and are not v1 gates. |
| PAY-001 | 4 | PASS_TESTNET / MAINNET_PARTIAL | Checkpoint 143 proves one 2 USDC purchase, 1.96 USDC creator credit/withdrawal, 0.04 USDC platform fee and matching D1 projections; purchases were re-paused. The technical-pilot policy is option A, explicitly non-refundable, with no automatic refund/reserve/escrow or implied credit. Mainnet product/legal/finance, user-facing terms and production accounting remain open. |
| SRE-001 | 0–5 | PARTIAL | Redacted request/dependency/Queue/payment telemetry, a one-shot per-isolate cold-start field, bounded state-kind/projected DO record telemetry, Market reserve/RPC-finality sources and a machine-readable `SOURCE_ONLY` policy exist. The exact read-model finality source is deployed at one-minute cadence and its structured `lag_blocks` field is queryable. All nine alerts have a role/action and all six domain controls are source-ready. Guarded release inputs remain closed; the contract purchase control requires a separately approved on-chain pause receipt. The account-level native Workers Observability alert feature, named on-call, delivered notifications, deployed control exercises and drills remain absent. |
| PERF-001 | 5 | PARTIAL_PREVIEW | Opt-in local runs reject 100,000 wrong-origin requests with zero growth; the latest 1,000-request authorized warm run passed at 9.507 ms p95 with zero errors, no warm external/DO calls and bounded cache. Checkpoint 152's bounded Preview sample adds eleven consecutive cache hits at 100 ms client p95, zero errors and zero warm NEAR/provider reads. This is not a load/soak or multi-creator result. |
| PERF-002 | 5 | EXTERNAL_EVIDENCE_REQUIRED | No current multi-creator/20 GB load evidence. |
| MEDIA-001 | 5 | DECISION_REQUIRED | Current protocol locks one 720p profile; ABR/provider economics need approval. |
| SEC-001 | 6 | EXTERNAL_EVIDENCE_REQUIRED | Independent audit scope/report absent. |

## Checkpoints

### CHECKPOINT 1 — Phase 0 / SRE-001

- DURUM: `PARTIAL`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Establish an evidence-backed Phase 0 baseline without opening runtime gates.
- DEĞİŞEN YOLLAR: `docs/architecture/transformation-progress.md`,
  `docs/architecture/phase-0-foundation.md`
- DOĞRULAMA:
  - selected Web tests → 4 files, 20 tests passed (`LOCAL_TEST`)
  - selected Bridge tests → 2 files, 59 tests passed (`LOCAL_TEST`)
  - protocol + ABI checks → OK, market=28/access=23 (`LOCAL_TEST`)
  - release tooling → 86 tests passed (`LOCAL_TEST`)
  - Preview `/__health` → HTTP 200, deployed version `1e5ac4a9`, stage
    `DISABLED` (`DEPLOY`)
- KANIT: `LOCAL_STATIC`, `LOCAL_TEST`, `DEPLOY`
- FAZ KAPISI: State inventory complete; runtime gates closed. ADR approval,
  threat review, full config backup and telemetry remain open.
- RİSK/BLOCKER: P0 signless-key validation, localStorage secret, governance,
  migration decision and base metrics are open.
- SONRAKİ: Finalize Phase 0 foundation docs and request only the decisions that
  block further authorized work.

### CHECKPOINT 2 — Phase 0 / SRE-001

- DURUM: `PASS`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Add bounded request-completion telemetry without changing route behavior.
- DEĞİŞEN YOLLAR: `workers/livepeer-bridge/src/index.ts`,
  `workers/livepeer-bridge/src/index.test.ts`, Phase 0 progress documents
- DOĞRULAMA:
  - `npm test -- --run src/index.test.ts` → 45/45 passed (`LOCAL_TEST`)
  - Bridge full suite → 5 files, 133 tests passed (`LOCAL_TEST`)
  - mock provider-canary suite → 63 tests passed (`LOCAL_TEST`, not `PROVIDER`)
  - `npm run check` → passed (`LOCAL_TEST`)
  - `npx wrangler deploy --dry-run` → 628.18 KiB / gzip 135.64 KiB,
    closed defaults (`LOCAL_STATIC`, not `DEPLOY`)
  - docs build → passed (`LOCAL_TEST`)
  - completion-log test proves query string/body are absent (`LOCAL_TEST`)
- KANIT: `LOCAL_STATIC`, `LOCAL_TEST`
- FAZ KAPISI: Structured request log schema is active in source; dependency,
  storage and dashboard metrics remain open.
- RİSK/BLOCKER: Deploy/runtime observation requires separate approval; numeric
  SLO and alert thresholds are undecided.
- SONRAKİ: Run the full affected-component and docs checks, then stop at the
  Phase 0 approval decisions.

### CHECKPOINT 3 — Phase 0 / configuration baseline

- DURUM: `PASS`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Record serving Preview versions and testnet contract identity without
  reading secret values or mutating external state.
- DEĞİŞEN YOLLAR: Phase 0 progress documents only
- DOĞRULAMA:
  - Cloudflare deployments → Preview Web `16ee8963@100%`, Bridge
    `1e5ac4a9@100%`; both are rollback/bootstrap versions (`DEPLOY`)
  - candidate versions → Web `2f525cbc`, Bridge `c81a0dfa`, both tagged
    `4fed6b4` and receiving no traffic (`DEPLOY`)
  - Production Web/Bridge worker names → Cloudflare `10007` (`DEPLOY` absence,
    not `PRODUCTION` readiness)
  - final testnet contract views → accounts/code present, publications and
    platform balances zero (`TESTNET`)
  - local WASM SHA-256 → both NEAR code hashes match (`LOCAL_STATIC` +
    `TESTNET` parity; no build-provenance claim)
- KANIT: `LOCAL_STATIC`, `TESTNET`, `DEPLOY`
- FAZ KAPISI: Sanitized config baseline is stronger but remains `PARTIAL`:
  secret values, DO state and authority state were not copied or inferred.
- RİSK/BLOCKER: Preview serves rollback/bootstrap SHAs rather than `4fed6b4`;
  this is recorded without traffic mutation. Installed cargo-near 0.18.0 is not
  the required 0.17.0.
- SONRAKİ: Build docs, run diff checks and return to the ADR/owner approval gate.

### CHECKPOINT 4 — Phase 0 / AUTH-002 production blocker

- DURUM: `PASS`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Fix the exact Cloudflare Insights CSP mismatch that caused Preview
  browser smoke to fail, without enabling any runtime feature.
- BASELINE_FAILURE:
  - CI `31280577835` succeeded for `4fed6b4`, but Web/Bridge/Contracts/Protocol/
    Docs jobs were path-filtered; only release tooling ran in CI Gate.
  - Deploy Preview `31280599346` failed with `release_smoke_browser_errors`
    because the versioned Insights beacon URL did not match the path-specific
    CSP source. The workflow restored both bootstrap versions.
- DEĞİŞEN YOLLAR: `apps/web/next.config.ts`,
  `apps/web/__tests__/unit/next-config.test.ts`, progress documents
- DOĞRULAMA:
  - targeted CSP test → 1/1 passed (`LOCAL_TEST`)
  - release smoke → 13/13 passed (`LOCAL_TEST`)
  - Web full suite → 14 files, 87 tests passed (`LOCAL_TEST`)
  - Web lint → passed (`LOCAL_TEST`)
  - Web production build with false/off gates → passed (`LOCAL_TEST`)
  - docs build and `git diff --check` → passed (`LOCAL_TEST`)
- KANIT: `LOCAL_STATIC`, `LOCAL_TEST`, historical baseline `CI`/`DEPLOY`
- FAZ KAPISI: One production blocker is fixed in source. AUTH-002 remains
  `PARTIAL`: localStorage secret, revoke UI and nonce/hash CSP are open.
- RİSK/BLOCKER: The fix is not deployed and no Preview/browser runtime claim is
  made. Full CSP redesign requires ADR-002 approval.
- SONRAKİ: Rebuild docs, run diff checks and return to the Phase 0 approval gate.

### CHECKPOINT 5 — Phase 0 / AUTH-001 and AUTH-002 production blockers

- DURUM: `PASS`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Fail closed on unsafe signless permissions and remove persistent
  signless secrets without enabling runtime features.
- KARAR KAPSAMI: Device-session and browser-session directions, D1 pilot,
  UploadJob/coordinator/Queue, pilot governance exception and technical-pilot
  non-refundable policy were recorded. Unspecified migration, suspension,
  retention, budget and account values remain open.
- DEĞİŞEN YOLLAR: `apps/web/lib/signless-access-key.ts`,
  `apps/web/lib/access-grants.ts`,
  `apps/web/__tests__/unit/signless-access-key.test.ts`,
  `apps/web/__tests__/unit/access-grants.test.ts`, Phase 0 progress documents
- DOĞRULAMA:
  - new permission/storage test before fix → 10/10 failed as expected
    (`LOCAL_TEST` baseline)
  - targeted signless + grant suites → 21/21 passed (`LOCAL_TEST`)
  - Web full suite → 15 files, 97 tests passed (`LOCAL_TEST`)
  - Web lint → passed (`LOCAL_TEST`)
  - browser-canary unit suite → 5/5 passed (`LOCAL_TEST`, not `PROVIDER`)
  - first Web build attempt → stopped because required public contract IDs were
    omitted from the command (`BASELINE_FAILURE`, not a source regression)
  - controlled Web build with false/off gates and recorded testnet IDs → passed
    (`LOCAL_TEST`, not `TESTNET` or `DEPLOY`)
- KANIT: `LOCAL_STATIC`, `LOCAL_TEST`
- FAZ KAPISI: AUTH-001 and persistent signless storage are closed locally.
  Phase 0 remains `PARTIAL`; Phase 1 is not declared started.
- RİSK/BLOCKER: CI/browser runtime proof, nonce/hash CSP and revoke UX remain.
  Migration method, concrete pilot accounts/unfreeze authority and
  `SALES_SUSPENDED` behavior are still decisions.
- SONRAKİ: Validate the complete diff/docs, then continue with the next
  independent Phase 0 metric/security preparation.

### CHECKPOINT 6 — Phase 0 / SRE-001 dependency telemetry

- DURUM: `PASS`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Measure direct NEAR and Livepeer dependency calls without logging URLs,
  payloads, tokens or signatures.
- DEĞİŞEN YOLLAR: `workers/livepeer-bridge/src/index.ts`,
  `workers/livepeer-bridge/src/index.test.ts`, Phase 0 progress documents
- DOĞRULAMA:
  - new dependency-log regression before fix → 1/1 failed as expected
    (`LOCAL_TEST` baseline)
  - targeted dependency-log regression → 1/1 passed (`LOCAL_TEST`)
  - Bridge full suite → 5 files, 134 tests passed (`LOCAL_TEST`)
  - mock provider-canary suite → 63/63 passed (`LOCAL_TEST`, not `PROVIDER`)
  - Bridge TypeScript check → passed (`LOCAL_TEST`)
  - Wrangler deploy dry-run → 629.47 KiB / gzip 135.96 KiB with closed
    defaults (`LOCAL_STATIC`, not `DEPLOY`)
- KANIT: `LOCAL_STATIC`, `LOCAL_TEST`
- FAZ KAPISI: NEAR/provider call count, HTTP result and latency sources exist
  locally. Aggregation, finality lag, dashboards and state/storage metrics remain
  open, so the metric gate remains `PARTIAL`.
- RİSK/BLOCKER: Log volume/cost must be measured in a deployed pilot before a
  sampling decision; no sampling rate is invented here.
- SONRAKİ: Rebuild docs and run whole-diff checks, then audit the remaining
  independent Phase 0 state-transition metric gap.

### CHECKPOINT 7 — Phase 0 / SRE-001 state-transition telemetry

- DURUM: `PASS`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Count successful UploadJob state changes without logging job, account or
  provider identifiers.
- DEĞİŞEN YOLLAR: `workers/livepeer-bridge/src/index.ts`,
  `workers/livepeer-bridge/src/index.test.ts`, Phase 0 progress documents
- DOĞRULAMA:
  - new transition regression before fix → 1/1 failed as expected (`LOCAL_TEST`
    baseline)
  - targeted transition regression → 1/1 passed (`LOCAL_TEST`)
  - Bridge full suite → 5 files, 135 tests passed (`LOCAL_TEST`)
  - Bridge TypeScript check → passed (`LOCAL_TEST`)
  - Wrangler deploy dry-run → 630.04 KiB / gzip 136.13 KiB with closed
    defaults (`LOCAL_STATIC`, not `DEPLOY`)
- KANIT: `LOCAL_STATIC`, `LOCAL_TEST`
- FAZ KAPISI: UploadJob transition count source exists locally. Deployed
  aggregation and other state-family metrics remain open, so the Phase 0 metric
  gate remains `PARTIAL`.
- RİSK/BLOCKER: No identifiers are emitted, which limits per-job debugging by
  design; correlation policy needs explicit privacy/operations approval.
- SONRAKİ: Run docs and whole-diff checks, then reassess whether another Phase 0
  task is independent of the remaining product/governance parameters.

### CHECKPOINT 8 — Phase 0 / SRE-001 provider budget guard

- DURUM: `PASS`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Enforce the existing release contract's monthly provider budget without
  choosing a product budget value.
- DEĞİŞEN YOLLAR: `workers/livepeer-bridge/src/index.ts`,
  `workers/livepeer-bridge/src/index.test.ts`,
  `workers/livepeer-bridge/wrangler.toml`, Phase 0 progress documents
- BASELINE_FAILURE:
  - release metadata carried `LIVEPEER_MONTHLY_OPERATION_BUDGET_USD_MICROS`,
    but Worker `Env` ignored it, admission status always returned `null`, and a
    same-month legacy monthly closure reopened.
- DOĞRULAMA:
  - new cap regression before fix → failed because missing monthly budget still
    admitted a reservation (`LOCAL_TEST` baseline)
  - targeted budget regression → 1/1 passed (`LOCAL_TEST`)
  - Bridge full suite → 5 files, 135 tests passed (`LOCAL_TEST`)
  - Bridge TypeScript check → passed (`LOCAL_TEST`)
  - mock provider-canary suite → 63/63 passed (`LOCAL_TEST`, not `PROVIDER`)
  - Wrangler deploy dry-run → 631.83 KiB / gzip 136.46 KiB; monthly budget,
    per-job reservation and allowlist remain empty with all feature gates closed
    (`LOCAL_STATIC`, not `DEPLOY`)
  - GitHub variable inventory → Preview/Production allowlist, monthly budget and
    per-job reservation variables absent; `DEPLOY_PREVIEW_ENABLED=false` and
    Web/Bridge flags false (`DEPLOY` configuration metadata, no mutation)
- KANIT: `LOCAL_STATIC`, `LOCAL_TEST`, read-only `DEPLOY` configuration
- FAZ KAPISI: Budget guard is fail-closed in source; actual pilot values,
  deployed status/metrics and cost evidence remain open.
- RİSK/BLOCKER: A value is intentionally not invented. Existing reservations
  may resume after budget closure, but new reservations remain closed until the
  next UTC month or an audited operator resolution.
- SONRAKİ: Validate the evidence-backed decision packet and whole diff, then
  stop at the remaining Phase 0 user decisions.

### CHECKPOINT 9 — Phase 0 closure audit

- DURUM: `BLOCKED / DECISION_REQUIRED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Reconcile the current worktree with report sections 5.2–5.6 after all
  decision-independent Phase 0 checkpoints.
- DOĞRULANAN:
  - state inventory, threat matrix, P0 owner/test matrix and closed runtime
    evidence are present;
  - request, dependency and UploadJob-transition telemetry sources exist, and
    provider budgets fail closed without configured values;
  - tracked Worker configuration SHA was refreshed after adding the blank
    monthly-budget field;
  - no testnet/provider/deploy/traffic/contract mutation is authorized by the
    recorded pilot directions.
- AÇIK KAPILAR:
  - ADR-001: certificate lifetime, JWT lifetime confirmation, legacy fallback
    and `SALES_SUSPENDED` playback behavior;
  - ADR-003: fresh-v2/migration choice, exact admin/guardian accounts and
    unfreeze/rotation authority;
  - ADR-004/005: retention, owner, recovery, concurrency, lease, budget and
    creator-allowlist values;
  - ADR-006: mainnet policy confirmation remains outside the technical pilot;
  - named reviewer approval, protected configuration backup and deployed
    metric/dashboard evidence remain external.
- DURMA GEREKÇESİ: Contract fields would encode an unapproved migration and
  authority model; playback v2 would encode unapproved expiry/suspension
  semantics; cleanup would delete state using unapproved retention; D1/Queue
  and deployed metrics belong behind later phase or external gates. Advancing
  any of them now would silently choose policy or open a later phase.
- SONRAKİ: Resume only with the exact Phase 0 decision packet and, for any
  external action, a separately bounded target/account/artifact authorization.

### CHECKPOINT 10 — Phase 0 / testnet role provisioning

- DURUM: `PASS`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- YETKİ: User explicitly authorized creating and funding new testnet accounts
  for the requested admin, guardian and creator roles.
- MUTASYON:
  - `lp-arch-admin-260809.youtick-dev-v3.testnet` → 0.100 NEAR,
    transaction `5JyUokUXfhzi9wTvyZarQJT6MPoEGrBwbuF3dLBCdkWp`;
  - `lp-arch-guardian-260809.youtick-dev-v3.testnet` → 0.100 NEAR,
    transaction `EKBxroFh9BvkhbNxn7XPiTNtsNQio83cTGgk6SQLN4X4`;
  - `lp-arch-creator-260809.youtick-dev-v3.testnet` → 0.100 NEAR,
    transaction `D1TUs7BrMjzDpWnW2q75ztP9bPhGqQ3uXitj1rpiU8j7`.
- DOĞRULAMA:
  - all three account names were absent before creation;
  - final RPC reads returned 0.100 NEAR total / 0.098 NEAR transferable for
    each account;
  - each account has exactly one distinct FullAccess public key;
  - generated credential files are outside the repository and mode `0600`;
  - funding source remains testnet-only with 0.980 NEAR total after the three
    creations.
- KANIT: `TESTNET_MUTATION`, `LOCAL_SECURITY`
- SINIR: No contract was deployed or initialized; no GitHub/Cloudflare variable,
  feature gate, provider asset, traffic or production state changed. Co-located
  local credentials are not mainnet custody separation.
- FAZ KAPISI: Exact pilot role accounts and initial creator allowlist identity
  are resolved. The user subsequently accepted the remaining bounded pilot
  parameters; implementation and external evidence remain separate gates.

### CHECKPOINT 11 — Phase 1 / GOV-001 Market v2 local governance

- DURUM: `PASS / LOCAL_ONLY`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- KARAR: Fresh v2 state; guardian-only immediate freeze; admin-only unfreeze,
  propose and execute; admin/guardian cancel; no pilot timelock/multisig.
- DEĞİŞEN YOLLAR: Market contract source/tests/sandbox, ABI checker, protocol and
  architecture evidence documents.
- BASELINE_FAILURE: New governance regression did not compile against the old
  six-argument constructor and immutable bridge surface (`LOCAL_TEST` red).
- UYGULAMA:
  - `state_version=2`, separate admin/guardian and active/pending bridge state;
  - freeze blocks both finalize and sales-suspension bridge mutations;
  - proposed rotation is auditable and leaves the new bridge frozen when freeze
    is active; old bridge loses authority after execution;
  - freeze, unfreeze, propose, cancel and execute emit `EVENT_JSON` records with
    standard `youtick_market`, version `1.0.0`;
  - fresh constructor accepts one explicit `config` object and rejects shared
    admin/guardian identities.
- DOĞRULAMA:
  - Market lib + paid-media suites → 24/24 passed (`LOCAL_TEST`);
  - near-workspaces sandbox → 1/1 passed (`LOCAL_TEST`, not `TESTNET`);
  - Rust fmt and clippy `-D warnings` → passed (`LOCAL_TEST`);
  - Rust 1.86.0 + official temporary cargo-near 0.17.0 build → passed;
    WASM 287,236 bytes, SHA-256
    `1e355484d68cf9bea4bc9f4bace257411db0c7e80385bd61513c4dbed5932cfc`
    (`LOCAL_STATIC`);
  - exact ABI check → market=34, access=23 (`LOCAL_TEST`).
- KANIT: `LOCAL_STATIC`, `LOCAL_TEST`
- SINIR: No contract account was created, deployed or initialized by this
  checkpoint; no runtime/config/traffic/provider state changed.
- FAZ KAPISI: GOV-001 source behavior is locally proven. Fresh testnet deploy,
  role-state reads and freeze/rotate/unfreeze drill remain required before the
  Phase 1 gate can pass. Mainnet remains blocked on multisig/timelock.

### CHECKPOINT 12 — Phase 1 / AUTH-003 Access v2 transition bounds

- DURUM: `PASS / LOCAL_ONLY`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- KARAR: Fresh Access v2 ID; legacy grant state is a bounded transition bridge,
  not the target playback authority.
- DEĞİŞEN YOLLAR: Access contract/source tests, the web grant call, ABI checker
  and protocol/API/architecture documents.
- BASELINE_FAILURE: New pause verification, pagination/cleanup, limit and
  issuance-state tests failed to compile against the unbounded v1 surface
  (`LOCAL_TEST` red).
- UYGULAMA:
  - `state_version=2` and readable owner/market/pause/issuance state;
  - Play requires a non-empty resource of at most 128 bytes; origin/device
    bindings are bounded to 128 bytes and the session public key to 64 bytes;
  - global and scope pause deny both verification and `can_play`;
  - at most 16 active grants per owner, with 16-record pagination and bounded
    expired/revoked cleanup;
  - new issuance can be disabled independently while existing reads remain;
  - `issue_session_grant` now takes one explicit `request` object and the sole
    web call site follows that fresh-v2 ABI.
- DOĞRULAMA:
  - Access lib suite → 14/14 passed (`LOCAL_TEST`);
  - Web access-grant suite → 11/11 passed (`LOCAL_TEST`);
  - Rust fmt and clippy `-D warnings` → passed (`LOCAL_TEST`);
  - Rust 1.86.0 + official temporary cargo-near 0.17.0 build → passed;
    WASM 204,387 bytes, SHA-256
    `4cda2b77cee5b9d670805de3b62e05688ac1f4439d6ac487212d2711b99baf80`
    (`LOCAL_STATIC`);
  - exact ABI check → market=34, access=26 (`LOCAL_TEST`).
- KANIT: `LOCAL_STATIC`, `LOCAL_TEST`
- SINIR: No contract account was created, deployed or initialized; no runtime,
  configuration, provider or traffic state changed.
- FAZ KAPISI: AUTH-003 source behavior is locally proven. The fresh Market and
  Access pair still requires an exact closed testnet deployment and drill.

### CHECKPOINT 13 — Phase 1 / fresh v2 closed testnet deployment and drill

- DURUM: `PASS / TESTNET_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- YETKİ: User approved new funded testnet accounts, testnet/internal pilot and
  all proposed bounded pilot values. Mainnet and runtime activation are not
  included.
- HEDEFLER:
  - Market: `lp-arch-market-v2-260809.youtick-dev-v3.testnet`;
  - Access: `lp-arch-access-v2-260809.youtick-dev-v3.testnet`;
  - temporary rotation target:
    `lp-arch-bridge-next-260809.youtick-dev-v3.testnet`.
- FONLAMA:
  - old disabled Market → source 4.5 NEAR, tx
    `LKxh1N3E4HgSCMyTa437aXBkaAmi66NFYJFmmNpb9Ug`;
  - old disabled Access → source 3 NEAR, tx
    `6GMxbZWLhxg2dPf632AnG68beiaYwuedgt2HaD1zcCLz`;
  - fresh Market 4.5 NEAR, tx
    `56Pr6czEVkVeic8rLKsVChSb92fhAgs2Hb7C1WYYLmQe`;
  - fresh Access 3 NEAR, tx
    `GxC15MGJQrTs4BtkAK1Hjs28Pi5cT45wLFYc1JEd5wmJ`;
  - temporary bridge 0.1 NEAR, tx
    `vSpWySdrjAnBNPMfAe5JpGQASm17FSWNo2MEyrLP1js`;
  - creator drill top-up 0.1 NEAR, tx
    `66hAAjzcXY5k9NfEnUScqwB9YKMCDpRUqRwdqdU7UquH`.
- DAĞITIM:
  - Market local/on-chain SHA-256
    `1e355484d68cf9bea4bc9f4bace257411db0c7e80385bd61513c4dbed5932cfc`,
    deploy/init tx `49N5Fe7Cf9grnRDCuZUcRDSsXiXsDzK5czZZDzHdXFha`;
  - Access local/on-chain SHA-256
    `4cda2b77cee5b9d670805de3b62e05688ac1f4439d6ac487212d2711b99baf80`,
    deploy/init tx `2LD7hRLcvYVzZh1Kfsu762c4yFbqwNXfS2faMiyjZFg4`.
- YÖNETİŞİM TATBİKATI:
  - guardian freeze tx `DQJRMFjakEPVaTmHaAdzv2NSBLYe8c9WtkHHjHDW96LV`;
  - next-bridge propose/execute tx
    `GGGDbbnbFXrmDfNmUqTYpzaMCLi3TdNRhuErjvy2WyYW` /
    `7vWRJAsnUjHQAZoboZnMy8N2fb7kXUWz3a1bjgVVv9qh`;
  - admin unfreeze tx `A5yxxuWVBjLDdHyKdJPdXENkbdC92Dx9bMJo9heDgPg5`;
  - original-bridge restore propose/execute tx
    `HnpYw9ryiDZhzKszAHYoNUrX2GQpShLXWVSEnZhfrJCv` /
    `HVKKQo7YpHr7MjirnhKrpyJvL9BoLWoXNAcj9CbfcsUq`;
  - all successful governance changes emitted `youtick_market@1.0.0`
    `EVENT_JSON`; frozen/authority failures matched the expected contract
    errors.
- SINIRLI OPERATÖR ANAHTARI:
  - public key `ed25519:5HZnNtPKc6cVBTTvwtHacxQQJrU2uPQPEkGKkJyALFXc`,
    add-key tx `8WndqkEummhQHFwVstX5W9ZMWL2sD6e75BvgNNMoSE1b`;
  - exact fresh Market receiver, two operator methods, 0.02 NEAR initial
    allowance; allowed method reached contract authorization, `freeze_bridge`
    was rejected by the access-key permission before execution;
  - private key is mode 0600 outside the repository and is not a deployed
    Worker secret.
- ACCESS TATBİKATI:
  - a non-persisted session key issued one exact resource-bound grant, tx
    `FeRsjcCE1UziVEVTNVHmB5f3UnsD6PzB59kHiyvoUsri`;
  - view verification returned `valid=true` for the creator;
  - revoke tx `BcLY3gtyyDeJYsgtAaqCF5yccmNPAG8bps7nb6RjagPA` returned subsequent
    `valid=false / Session grant is revoked`;
  - bounded cleanup returned 1, tx
    `DEd729VsvB5xpStVJUjKVBFTieRXRxfUe7kaqht3CKpZ`; final direct/list reads
    returned `null` and `[]`.
- SON DURUM: At blocks 263118694–263118885, Market is version 2, original bridge
  active, unfrozen and without pending rotation. Access is version 2, unpaused,
  issuance-enabled and empty for the pilot creator. Old pair code hashes remain
  unchanged and safely funded.
- RUNTIME KAPISI: `DEPLOY_PREVIEW_ENABLED=false`; Preview and Production still
  reference the old pair; web/Bridge paid-media and creator-fee flags remain
  false. No Cloudflare variable/secret, provider asset, DNS or traffic changed.
- KANIT: `LOCAL_STATIC`, `LOCAL_TEST`, `TESTNET_MUTATION`, read-only GitHub
  configuration. This is not Preview/Production activation or mainnet proof.

### CHECKPOINT 14 — Phase 1 / RPC proxy bounded read and broadcast paths

- DURUM: `PASS / LOCAL_ONLY`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- DEĞİŞEN YOLLAR: Web RPC read/broadcast routes, shared proxy guard, signless
  transaction provider, route/failover tests and configuration documents.
- BASELINE_FAILURE: The new suite could not resolve a broadcast route; the old
  route mixed experimental/read/broadcast methods and had no timeout, response
  cap or rate limit (`LOCAL_TEST` red).
- UYGULAMA:
  - `/api/near-rpc` accepts stable read methods only;
  - `/api/near-rpc/broadcast` accepts only `send_tx` and the two broadcast
    methods, uses one upstream and never replays;
  - signless transactions use a split provider: nonce/read calls go to read,
    signed transaction submission goes to broadcast;
  - request 64 KiB, response 2 MiB, upstream 2.5 seconds and total read six
    seconds;
  - per-instance fixed-window limits: read 60/IP and 60/account/minute,
    broadcast 10/IP/minute, with at most 2,048 tracked keys;
  - optional server-only dedicated URL/Authorization primary, public read
    fallback, three transient failures/30-second circuit breaker and safe
    provider outcome/latency logs without account/IP/payload values.
- DOĞRULAMA: Route abuse/fallback/deadline/replay suite 14/14; related
  failover/access-grant suites 15/15; lint passed (`LOCAL_TEST`).
- SINIR: Dedicated provider values are not configured or release-wired;
  in-memory limits are per isolate and not a distributed edge quota. No deploy,
  secret, runtime, DNS, provider or traffic state changed.
- FAZ KAPISI: RPC source resource/replay bounds are locally proven. Dedicated
  provider and distributed rate-limit deployment evidence remain external.

### CHECKPOINT 15 — Phase 1 / nonce CSP and secure disconnect

- DURUM: `PASS / LOCAL_ONLY`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- DEĞİŞEN YOLLAR: Next Proxy/root layout, CSP and signless-key tests, secure
  wallet disconnect flow and architecture evidence documents.
- BASELINE_FAILURE:
  - the old CSP was a static header and allowed inline script/style;
  - explicit disconnect cleared browser state without revoking all subject
    grants or deleting the on-chain signless function-call key;
  - the two new secure-revoke regressions failed before implementation
    (`LOCAL_TEST` red).
- UYGULAMA:
  - Next Proxy generates a cryptographically random nonce per HTML request and
    places one CSP on both the request and response;
  - production `script-src`/`style-src` use the nonce and contain no
    `unsafe-inline`; only development permits `unsafe-eval`;
  - root HTML is intentionally dynamic so Next can apply the request nonce;
  - explicit disconnect wallet-signs `revoke_subject_sessions` and, when
    present, deletes the exact session-only signless public key;
  - a rejected cleanup keeps the local key and wallet connection so the UI
    cannot claim a secure disconnect that did not happen.
- DOĞRULAMA:
  - CSP Proxy suite 2/2 and static-header removal 1/1 passed;
  - signless permission/storage/revoke suite 12/12 passed;
  - Web full suite 16 files, 110/110 tests; lint and production build passed;
  - production build marks application HTML routes dynamic and keeps only
    `robots.txt`/`sitemap.xml` static;
  - local production HTTP smoke returned nonce CSP without `unsafe-inline`,
    all 36 response scripts shared the request nonce and a second request used
    a different nonce;
  - local browser smoke loaded and interacted with the landing page with no
    console error or warning (`LOCAL_TEST`, not `DEPLOY`).
- SINIR: Per-request nonce makes HTML dynamic and gives up static page caching.
  No Preview/Production deploy, wallet signature, contract call, gate, secret,
  provider, DNS or traffic state changed in this checkpoint.
- FAZ KAPISI: AUTH-002 and the remaining Phase 1 source P0 close locally.
  Current-branch CI, deployed CSP/wallet smoke and independent security review
  remain external evidence.

### CHECKPOINT 16 — Phase 2 / stateless playback v2

- DURUM: `PARTIAL / LOCAL_ONLY`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- DEĞİŞEN YOLLAR: Web device-session/playback client, Bridge v2 authorizer and
  tests, closed release smoke, protocol/configuration and architecture evidence.
- BASELINE_FAILURE:
  - the new Worker suite received 404 because `/v2/playback-tokens` did not
    exist;
  - the new Web v2 suite still required a legacy Play grant;
  - the failing tests were recorded before implementation (`LOCAL_TEST` red).
- UYGULAMA:
  - the wallet authorizes an exact account/network/origin/`play` certificate
    for at most eight hours using NEP-413;
  - the generated Ed25519 device key and proof are stored only in
    `sessionStorage` and cleared on explicit disconnect;
  - each five-minute request binds account, origin, Market, publication,
    generation, playback ID, body hash and certificate hash, then is signed by
    the device key;
  - the Bridge verifies the device signature, final FullAccess wallet key and
    wallet proof, exact final publication tuple and same-block entitlement;
  - `ACTIVE` and `SALES_SUSPENDED` permit an existing entitlement, while
    `TAKEDOWN`, mismatches and uncertain reads fail closed;
  - the result is an ES256 playback-ID-bound JWT lasting at most 180 seconds;
  - v2 calls no Durable Object and performs no persistent write. A same-request
    replay repeats final checks for the same bounded authority rather than
    consuming stored nonce state.
- DOĞRULAMA:
  - v2 Worker matrix 11/11, including real device/NEP-413 signatures, removed or
    non-FullAccess wallet key, wrong origin/playback, expiry and takedown;
  - Worker full suite 6 files, 146/146; type check and mocked provider canary
    63/63 passed;
  - Web device/v2 tests 5/5; Web full suite 18 files, 115/115, lint and
    production build with the explicit fresh testnet pair and all runtime flags
    false passed;
  - replay success uses six final reads across two requests and zero DO access;
  - release tooling 86/86, closed release smoke 13/13, docs build, protocol
    check and Worker dry-run passed; dry-run reported both Bridge gates false.
- SINIR:
  - no Preview/Production release wiring, deploy, traffic, secret, provider,
    DNS or contract mutation occurred;
  - production-like staging, bounded cache/hit reads, legacy shadow metrics,
    approved mismatch threshold, 100k abuse/load proof and automatic DO
    lifecycle remain open;
  - clearing browser storage cannot revoke a copied certificate immediately;
    its authority ends at eight hours or sooner when the wallet signing key is
    removed.
- FAZ KAPISI: PLAY-001 and PLAY-002 close locally. Phase 2 stays partial until
  its staging, cache/shadow/load and DO-lifecycle gates have real evidence.

### CHECKPOINT 17 — Phase 2 / bounded cache, abuse and lifecycle

- DURUM: `PARTIAL / LOCAL_ONLY`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- DEĞİŞEN YOLLAR: V2 provider-policy/cache path, playback abuse test, DO alarm
  cleanup, Worker tests/scripts and architecture/protocol documents.
- BASELINE_FAILURE:
  - a valid chain entitlement still received a token when mocked Livepeer
    playback policy had changed to `public`;
  - replay repeated all three NEAR reads and never checked provider policy;
  - rate-limit objects scheduled no cleanup alarm, an expired webhook dedup
    record remained, and admission audit expiry was not scheduled;
  - the new focused regressions failed before implementation (`LOCAL_TEST` red).
- UYGULAMA:
  - v2 now requires Livepeer `vod` + `jwt` playback policy and fails closed on
    provider uncertainty;
  - a 1,024-record per-isolate LRU/TTL cache uses the report's conservative
    lower bounds: publication/provider 30 seconds, wallet proof 60 seconds,
    positive entitlement five minutes and negative entitlement three seconds;
  - cold authorization uses three NEAR reads and one provider read; a fully
    warm replay uses zero, while preserving zero DO access and zero persistent
    playback state;
  - cache-safe telemetry emits only hit/miss, RPC/provider counts and latency;
  - creator-fee/payment rate-limit objects alarm at exact window expiry and
    `deleteAll()`; webhook dedup expires after 30 days and admission-reopen audit
    after 90 days in 128-record cleanup batches.
- DOĞRULAMA:
  - v2 matrix 14/14 plus one opt-in 100k abuse test passed;
  - the abuse run completed locally with 100,000/100,000 denied, zero external
    fetch, zero Durable Object access and zero cache growth;
  - 30-second takedown and 60-second removed-wallet-key boundary tests pass;
  - Worker full suite 6 files, 150 passed and one opt-in test skipped by default;
    type check, mocked provider canary 63/63 and Wrangler dry-run passed;
  - dry-run still reports `LIVEPEER_BRIDGE_ENABLED=false` and
    `LIVEPEER_PLAYBACK_V2_ENABLED=false`.
- SINIR:
  - no deploy, runtime gate, secret, traffic, DNS, provider or chain mutation;
  - cache invalidation is TTL-only until standard events exist;
  - UploadJob terminal archive/14-day delete, operator outbox archive/90-day
    delete and full lifecycle max-record proof depend on later upload/read-model
    work;
  - production-like staging and legacy/v2 shadow mismatch threshold/evidence
    remain open.
- FAZ KAPISI: PLAY-003 gains local bounded-cache evidence and DO-001 becomes
  partial. Phase 2 remains open for staging, shadow and remaining lifecycle
  dependencies; source work may continue into their prerequisite phases while
  all runtime gates stay closed.

### CHECKPOINT 18 — Phase 3 / admission concurrency and stuck-job isolation

- DURUM: `PARTIAL / LOCAL_ONLY`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- DEĞİŞEN YOLLAR: Admission coordinator limits, ambiguous-timeout lifecycle,
  operator status response, Worker tests and architecture evidence.
- BASELINE_FAILURE:
  - the coordinator rejected a second active job from a different allowlisted
    creator because global capacity was hard-coded to one;
  - an individual 15-minute `CREATE_AMBIGUOUS` timeout changed the whole
    coordinator to `AUTO_CLOSED`;
  - operator status did not expose the effective concurrency/attempt/timeout
    limits;
  - all three focused regressions failed before implementation (`LOCAL_TEST`
    red).
- UYGULAMA:
  - accepted pilot limits are constants: global concurrency 2, creator
    concurrency 1, creator attempts 2/UTC day and ambiguity timeout 15 minutes;
  - two different creators can hold reservations concurrently and the third is
    rejected by the serialized coordinator transaction;
  - an expired ambiguous reservation is removed without reducing the global
    admission state. The per-job object remains and therefore still blocks a
    duplicate provider create for that job/generation;
  - provider-wide budget/inventory and 402/429 circuit-breaker closure remains
    a separate global signal;
  - operator-only admission status returns the exact effective limits.
- DOĞRULAMA:
  - focused creator concurrency, same-creator concurrency/daily quota,
    preflight capacity, ambiguity timeout and operator-status tests passed;
  - Worker full suite 6 files, 151 passed and one opt-in abuse test skipped by
    default; type check and diff whitespace check passed.
- SINIR:
  - no provider call, upload, deploy, runtime flag, secret, traffic, DNS or
    chain mutation occurred;
  - this proves coordinator admission behavior, not two simultaneous real TUS
    uploads;
  - general lease IDs, expiry/heartbeat, provider actual-cost accounting,
    UploadJob class split, Queue webhook consumer and terminal archive/delete
    remain open.
- FAZ KAPISI: UP-001 advances but remains partial. The stuck ambiguity no longer
  closes unrelated admission; real multi-creator upload and general lease
  lifecycle still require later local/staging evidence.

### CHECKPOINT 19 — Phase 3 / same-resource recovery and closed Queue path

- DURUM: `PARTIAL / LOCAL_ONLY / SOURCE_GATE_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- DEĞİŞEN YOLLAR: Authenticated UploadJob recovery regression, webhook Queue
  producer/consumer, closed Worker flag, Worker tests and architecture evidence.
- BASELINE_FAILURE:
  - browser-key replacement plus a restarted job object had no explicit proof
    that the existing TUS capability is returned without a second provider
    create;
  - verified webhook ingress synchronously entered the job object, where a ready
    event may perform provider probes before the public response;
  - no Queue consumer ACK/retry/poison contract existed.
- UYGULAMA:
  - a rotated browser request key can submit a newly authorized request after an
    object restart and recover the exact persisted TUS URL with `created:false`;
  - `LIVEPEER_WEBHOOK_QUEUE_ENABLED=false` independently gates the Queue path;
  - when enabled with a binding, ingress verifies the Livepeer signature and
    timestamp, sends a schema-bound event and returns `202` before job/provider
    work;
  - the consumer validates deployment binding and message bounds, ACKs success
    and permanent poison messages, and retries temporary job-object failures.
- DOĞRULAMA:
  - focused Queue producer/consumer/retry/poison tests passed;
  - Worker full suite: 6 files, 155 passed and one opt-in abuse test skipped by
    default; type check passed;
  - provider canary: 63/63; opt-in 100k unauthorized playback run passed with no
    external/DO/cache growth;
  - root release tests 86/86, protocol ABI check and docs build passed;
  - Wrangler dry-run exposed the Queue flag as `false` and no Queue binding;
    final whitespace check passed.
- SINIR:
  - no Queue, provider mutation, upload, deploy, runtime flag, secret, traffic,
    DNS or chain mutation occurred;
  - real browser reload, Queue redelivery/order, retry cap, DLQ and staging proof
    remain absent;
  - general lease heartbeat, UploadJob class split and terminal archive/delete
    remain open.
- FAZ KAPISI: UP-003 and LP-001 gain local evidence but remain partial. Phase 3
  stays open until real Queue/reload evidence and remaining lifecycle work are
  complete.

### CHECKPOINT 20 — Phase 3 / LP-001 Queue ordering safety

- DURUM: `PASS_LOCAL / RUNTIME_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Duplicate and late provider events delivered through the Queue consumer
  must not regress a terminal UploadJob state.
- DEĞİŞEN YOLLAR: Queue ordering regression test and Phase 3 evidence.
- DOĞRULAMA:
  - focused out-of-order Queue regression passed;
  - Worker full suite: 6 files, 156 passed and one opt-in abuse test skipped;
  - type check and diff whitespace check passed.
- KANIT: `LOCAL_TEST`.
- FAZ KAPISI: The duplicate/out-of-order test gate passes locally. LP-001 remains
  partial at phase level because no real Queue binding/redelivery, retry cap,
  DLQ or staging traffic exists.
- RİSK/BLOCKER:
  - terminal `deleteAll()` is `DECISION_REQUIRED`: v1 playback reads UploadJob
    state and no D1 audit archive exists, so deletion would break fallback;
  - no external mutation occurred.
- SONRAKİ: UP-001 general lease ID/expiry/heartbeat contract behind closed
  runtime gates.

### CHECKPOINT 21 — Phase 3 / UP-001 lease parameter gate

- DURUM: `NEEDS_APPROVAL / INDEPENDENT_WORK_CONTINUES`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Add expiring normal upload leases without inventing a timeout.
- DEĞİŞEN YOLLAR: Decision/evidence record only; runtime code unchanged.
- DOĞRULAMA: The report requires `expires_at` and `last_heartbeat_at`; accepted
  decisions contain only the separate 15-minute ambiguous-create timeout.
- KANIT: `LOCAL_STATIC`.
- FAZ KAPISI: Ambiguous-job auto-release remains `PASS_LOCAL`; general lease
  timeout stays open.
- RİSK/BLOCKER: Normal lease TTL and heartbeat interval require numeric product/
  platform approval. Reusing 15 minutes could expire valid large uploads.
- SONRAKİ: EVENT-001 standard economic/domain event catalog, which is independent
  of lease timing and external runtime mutation.

### CHECKPOINT 22 — Phase 4 / EVENT-001 economic event catalog

- DURUM: `PARTIAL / LOCAL_ONLY / TESTNET_UPDATE_NOT_RUN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Emit rebuildable, idempotent market lifecycle events without logging an
  upload or provider capability.
- DEĞİŞEN YOLLAR: Market event emitter/call sites, withdrawal callback ID,
  economic replay tests, API/protocol/contract docs and progress evidence.
- BASELINE_FAILURE:
  - the new lifecycle test failed before implementation because job creation
    emitted no NEP-297 event;
  - the first full local sandbox run once returned different `published_at_ms`
    values for an exact finalize replay while publication count stayed one.
    One controlled isolated retry of the same sandbox test passed; this remains
    recorded as local sandbox flake risk rather than being hidden.
- UYGULAMA:
  - kept `youtick_market@1.0.0` and added contract/block/predecessor context plus
    a business `idempotency_key` to every event;
  - added job authorize/key-replace, publication finalize/suspend/takedown,
    entitlement purchase, creator withdrawal start/success/failure, platform
    withdrawal start and quote-key rotation events;
  - exact successful replays emit no duplicate economic event;
  - upload public key appears only as SHA-256; private keys, TUS URLs and provider
    credentials are absent;
  - no fake `contract_migrated` event is emitted because this fresh-ID contract
    has no migration entrypoint.
- DOĞRULAMA:
  - red/green focused economic lifecycle regression passed;
  - Market Rust: 6 unit + 21 integration tests passed; local sandbox passed on
    the one controlled retry;
  - Rust 1.86 fmt/clippy passed; ABI `market=34, access=26` passed;
  - non-reproducible WASM build passed (`9ae2b55a...1960025`);
  - docs build and diff whitespace check passed.
- KANIT: `LOCAL_TEST`; previous testnet governance events are separate
  `TESTNET` evidence. New economic events are not testnet evidence.
- FAZ KAPISI: EVENT-001 advances but remains partial. A final-block indexer must
  add `(block_height, receipt_id, event_index)`, deploy the current code to an
  approved testnet target and prove the catalog before the gate can pass.
- RİSK/BLOCKER: `contract_migrated` needs a real migration design; no deploy,
  chain transaction, runtime flag or external mutation occurred.
- SONRAKİ: DATA-001 minimal D1 event-store schema and deterministic rebuild
  command behind source-only/no-binding boundaries.

### CHECKPOINT 23 — Phase 4 / DATA-001 D1 schema and pure rebuild

- DURUM: `PARTIAL / LOCAL_ONLY / NO_D1_BINDING`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Prove deterministic final-event identity, watermark and derived
  projections before creating any database or ingestion service.
- DEĞİŞEN YOLLAR: D1 migration SQL, standard-library rebuild command/tests,
  read-model/test docs and architecture evidence.
- UYGULAMA:
  - D1 schema separates immutable final events, per-contract watermark and
    derived job/publication/entitlement/sale/withdrawal/governance tables;
  - physical identity is `(network, contract_id, block_height, receipt_id,
    event_index)` and business idempotency is independently unique;
  - the pure reducer accepts only `final` envelopes, sorts them, rejects block,
    position and idempotency conflicts, then produces canonical projections;
  - all amount fields remain decimal strings and the output is never used as
    payment, entitlement or playback authority.
- DOĞRULAMA:
  - reducer/schema tests 3/3 passed, including shuffled/duplicate input,
    non-final rejection and conflicting idempotency rejection;
  - the SQL migration executed successfully against local in-memory SQLite;
  - diff whitespace check passed.
- KANIT: `LOCAL_TEST`. This is not D1, indexer, deploy or production evidence.
- FAZ KAPISI: DATA-001 and watermark gates become partial. Chain fetch, D1 batch
  transaction/write, restart cursor, read API and zero-from-chain deployed
  rebuild remain open.
- RİSK/BLOCKER: Privacy/retention owner and recovery target are still
  `DECISION_REQUIRED`; no D1 database, binding, network call or external mutation
  occurred.
- SONRAKİ: DATA-001 source-only D1 batch plan/apply transaction contract and
  restart cursor test, without provisioning D1.

### CHECKPOINT 24 — Phase 4 / DATA-001 atomic D1 apply contract

- DURUM: `PARTIAL / LOCAL_ONLY / NO_D1_BINDING`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Apply one final contract block to events, projections and watermark as
  one idempotent D1 transaction.
- DEĞİŞEN YOLLAR: Source-only D1 batch writer/tests and read-model docs.
- UYGULAMA:
  - accepts only one network/contract/final block per call and rejects mixed
    batches before preparing writes;
  - binds every value through prepared statements and submits all work through
    one `db.batch()` transaction;
  - exact event replay is idempotent; a changed payload under the same physical
    or business key violates the non-null invariant and rolls back the whole
    batch;
  - event count is capped at 16, derived from the documented 50-query free-plan
    invocation floor and the worst-case three statements per event plus one
    watermark statement.
- DOĞRULAMA:
  - D1 apply + rebuild suite 6/6 passed against in-memory SQLite;
  - tests prove projection/watermark commit, exact replay, conflict rollback and
    mixed-block rejection;
  - diff whitespace check passed.
- KANIT: `LOCAL_TEST` plus official Cloudflare D1 transaction/limit
  documentation; no real D1 call occurred.
- FAZ KAPISI: DATA-001 advances but remains partial. A final-block source,
  restart cursor/lag policy, binding and deployed zero-to-tip rebuild are open.
- RİSK/BLOCKER: D1 resource/binding creation and any remote migration require
  separate environment approval; privacy/retention owner and recovery target
  remain undecided.
- SONRAKİ: DATA-001 source-only ingestion cursor contract that resumes from the
  committed D1 watermark and rejects optimistic/non-contiguous input.

### CHECKPOINT 25 — Phase 5 / PERF-001 authorized warm playback

- DURUM: `PARTIAL / LOCAL_BENCHMARK_ONLY`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Measure the report's sub-500 ms cache-hit playback target without
  provider, NEAR, deploy or persistent state mutation.
- DEĞİŞEN YOLLAR: Opt-in playback-v2 load test, package command and Worker docs.
- UYGULAMA: Warm one valid device-session request, then issue 1,000 authorized
  requests in 20 batches of 50 while measuring per-request latency.
- DOĞRULAMA:
  - `npm run test:playback-v2-load` passed;
  - latest full closure result: 1,000 requests, p95 `9.15 ms`, zero errors;
  - the cold warm-up made exactly three mocked NEAR reads and one mocked provider
    read; all measured requests made zero additional external or DO calls and
    cache size remained at most 1,024;
  - Worker full suite 156 passed/two opt-in tests skipped by default, type check,
    provider canary 63/63, both opt-in stress runs and Wrangler dry-run passed;
  - root release/read-model tests 92/92, docs build, protocol/ABI and diff
    whitespace checks passed;
  - dry-run still exposed Bridge, playback-v2 and webhook-Queue gates as false
    and no Queue or D1 binding.
- KANIT: `LOCAL_TEST` only. This number cannot be compared directly to staging
  or production latency.
- FAZ KAPISI: PERF-001 advances but remains partial. Deployed hot-publication
  p95/error/cache metrics and longer soak/incident behavior remain open.
- RİSK/BLOCKER: Dedicated RPC/provider staging and deployment require external
  configuration/approval; no external mutation occurred.
- SONRAKİ: PERF-001 bounded authorized soak error/cache invariant, then Phase 5
  external-evidence gate review.

### CHECKPOINT 26 — Phase 4 / DATA-001 GET read API

- DURUM: `PARTIAL / LOCAL_ONLY / NO_D1_BINDING`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Serve rebuildable discover/profile projections without moving economic
  authority away from NEAR or silently activating a database.
- UYGULAMA:
  - added a disabled-by-default, GET-only D1 Worker module;
  - active discover pagination, creator publication history, publication detail
    and aggregate creator sales use prepared statements;
  - every success carries the finality watermark and an ETag bound to both the
    watermark and exact request URL;
  - invalid path/cursor input fails before a query; non-GET requests fail.
- DOĞRULAMA: focused SQLite-backed API suite 4/4 passed, including pagination,
  suspended creator content, aggregate-only sales, 304 and cross-resource ETag
  isolation.
- KANIT: `LOCAL_TEST`; no D1 resource, binding, deploy, web switch or traffic.
- FAZ KAPISI: DATA-001 and Discover/profile advance but remain partial until
  ingestion, binding and the web transition run behind a separately closed gate.

### CHECKPOINT 27 — Phase 3 / UP-001 lease and LP-001 Queue policy

- DURUM: `UP-001 PASS_LOCAL / LP-001 PARTIAL / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- YETKİ: User accepted the proposed 30-minute lease, five-minute heartbeat and
  pilot Queue values. This did not authorize Cloudflare resource creation or a
  runtime gate change.
- UYGULAMA:
  - coordinator reservations carry random lease ID, expiry and last heartbeat;
  - signed browser heartbeats recheck the final on-chain upload key and renew
    the exact lease; successful upload clears the session-only key while failed
    upload/reload preserves same-resource recovery;
  - alarms release silent normal leases after 30 minutes; ambiguous create keeps
    its separate 15-minute rule;
  - Queue policy is exact batch 10, timeout 5 seconds, retries 3, concurrency 1,
    retention 4 days and testnet DLQ; ingress/consumer retry rather than process
    if values drift.
- DOĞRULAMA: focused Worker admission/heartbeat suite 51/51 and full Web suite
  116/116 passed; Web lint and Worker type check passed. Full closure is recorded
  at the next checkpoint after all new source is included.
- KANIT: `LOCAL_TEST`; `LIVEPEER_BRIDGE_ENABLED=false` and
  `LIVEPEER_WEBHOOK_QUEUE_ENABLED=false`; no Queue/DLQ binding or provider call.
- FAZ KAPISI: UP-001 passes locally. LP-001 remains partial until provider-side
  binding, retry/DLQ readback, redelivery and staging traffic are proven.

### CHECKPOINT 28 — Phase 4 / DATA-001 Neardata final-block source

- DURUM: `PARTIAL / SOURCE_TO_D1_CONTRACT / NO_D1_BINDING`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Replace the open final-block-source decision with a bounded, verifiable
  testnet adapter and make empty-block cursor advancement explicit.
- UYGULAMA:
  - exact Neardata network/height fetch has a 10-second deadline and 16 MiB cap;
  - successful receipt outcomes for the exact Market contract are converted to
    stable `(block_height, receipt_id, event_index)` envelopes;
  - failed receipts are ignored; block/receipt/common-event mismatches fail;
  - historical fresh-v2 governance logs lacking the later common context are
    enriched only from immutable receipt/block identity with deterministic
    legacy idempotency keys;
  - atomic D1 apply now advances the watermark for a complete final block even
    when it contains no market event.
- DOĞRULAMA:
  - Neardata adapter + D1 focused tests 9/9 passed;
  - read-only final RPC resolved Market deploy tx `49N5...XFha` to start block
    `263118001`;
  - live Neardata read parsed that empty deployment block and one
    `bridge_frozen` event at block `263118248` with the expected guardian.
- KANIT: `LOCAL_TEST` + `TESTNET_READ`; no chain, D1, Queue, deploy, secret,
  provider or traffic mutation.
- FAZ KAPISI: Final source/start/empty-block semantics are locally proven.
  DATA-001 remains partial pending a provider-side scheduled Worker and D1
  binding, lag alerts, >16-event-block policy and measured four-hour rebuild.

### CHECKPOINT 29 — Accepted pilot values / local closure

- DURUM: `LOCAL_GREEN / TESTNET_READ_GREEN / EXTERNAL_RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Close the accepted lease, Queue-policy and Neardata/D1 source slices
  without treating local evidence as a deployment or pilot activation.
- DOĞRULAMA:
  - root suite 102/102 passed;
  - Worker suite 159 passed with two opt-in tests skipped, and type check passed;
  - Web suite 116/116, lint and a production build with explicit safe local
    testnet values and all runtime flags false passed;
  - docs build, contract formatting, protocol/ABI and whitespace checks passed;
  - live read-only Neardata replay again resolved block `263118248` and its
    `bridge_frozen` event to the expected guardian.
- KANIT: `LOCAL_TEST` + `TESTNET_READ`. No Queue/DLQ or D1 resource/binding,
  deploy, provider call, runtime flag change, secret write or chain mutation.
- FAZ KAPISI: Accepted pilot values are locally encoded and verified. Phase 3
  Queue and Phase 4 D1 remain partial until an exact external activation packet
  is separately authorized and provider/deploy evidence is collected.

### CHECKPOINT 30 — Phase 4 / DATA-001 contiguous cursor runner

- DURUM: `PASS_LOCAL / SOURCE_ONLY / NO_SCHEDULE_OR_D1_BINDING`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Make restart and concurrent scheduler behavior deterministic without an
  unbounded catch-up loop or a provider-side resource.
- UYGULAMA:
  - one invocation reads the contract watermark and fetches only the deployment
    start block or exactly `watermark + 1`;
  - a D1 trigger accepts a next block or exact same-height/hash replay and
    rejects skipped, old or same-height/different-hash writes;
  - the trigger runs inside the event/projection/watermark batch, so a late or
    invalid writer rolls back every statement rather than leaving partial data.
- DOĞRULAMA:
  - focused D1 apply/cursor suite 7/7 passed, including an event/projection gap
    rollback, exact replay, restart advance and pre-fetch config failure;
  - full root suite 105/105, docs build and whitespace checks passed.
- KANIT: `LOCAL_TEST`. Cloudflare documents D1 `batch()` rollback on any failed
  statement and D1's SQLite trigger compatibility; no D1 database, binding,
  scheduled Worker, deploy, network fetch or runtime flag was created/changed.
- FAZ KAPISI: Source cursor/restart semantics pass locally. DATA-001 remains
  partial pending the actual scheduled Worker/D1 binding, lag alert, named human
  owner, >16-event-block policy and measured four-hour rebuild drill.

### CHECKPOINT 31 — Phase 4 / DATA-001 oversized-block policy

- DURUM: `PASS_LOCAL / FAIL_CLOSED / ALERT_WIRING_PENDING`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Prevent a large final block from being partially projected under the
  pilot's 50-query invocation budget.
- UYGULAMA: A complete block above 16 Market events fails with the stable
  `d1_final_block_event_limit_exceeded` code before preparing a write. The pilot
  policy is stop/alert, keep the cursor unchanged, approve capacity/schema work,
  then replay that exact block; splitting or partially publishing it is banned.
- DOĞRULAMA: focused D1 apply/cursor suite 8/8 and full root suite 106/106
  passed; the overflow test proves both event store and watermark remain empty.
- KANIT: `LOCAL_TEST`; no D1/alert resource, deploy, binding or runtime change.
- FAZ KAPISI: The >16-event behavior is explicit and locally proven. DATA-001
  remains partial pending scheduled Worker/D1 binding, real alert delivery,
  named human owner and measured four-hour rebuild drill.

### CHECKPOINT 32 — Phase 4 / EVENT-001 + DATA-001 Web read transition

- DURUM: `PASS_LOCAL / TESTNET_READ / WEB_GATE_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Make publication events sufficient for a zero-lookup rebuild and wire
  read-heavy Web screens without moving economic/playback authority to D1.
- UYGULAMA:
  - `publication_finalized` now emits public `title`, `playback_id` and
    `published_at_ms`; reducer, D1 schema/writer and versioned API carry them;
  - the read API requires an exact HTTPS Web origin and emits bounded CORS;
  - Discover uses derived cursor pagination behind a new false-by-default gate,
    falls back to NEAR only on the initial request and never mixes cursor types;
  - creator profile uses D1 only for publication history and aggregate sales;
    available balance, withdrawal, purchase, entitlement and playback remain on
    canonical NEAR state;
  - release metadata and both workflows force the derived Web gate to `false`
    and leave the read-model URL empty.
- DOĞRULAMA:
  - Web 123/123, lint, type check and production build with all gates false
    passed;
  - root 106/106, read pipeline focused 15/15 and release metadata 28/28 passed;
  - Rust 1.86: 6 unit + 21 lifecycle + 1 sandbox, fmt and clippy passed;
  - protocol ABI `market=34/access=26`, docs build and whitespace check passed;
  - read-only testnet `get_publications_count` returned `0` for the fresh Market
    v2, so no historical publication requires field enrichment.
- KANIT: `LOCAL_TEST` + `TESTNET_READ`; the default Rust 1.93 sandbox run was
  discarded after its known bulk-memory/wasm-opt incompatibility and rerun on
  the repository-pinned Rust 1.86. No contract/D1/Worker deploy, binding, flag,
  secret, provider call or chain mutation occurred.
- FAZ KAPISI: Rebuild-complete publication rows and the closed Web transition
  pass locally. EVENT-001/DATA-001 remain partial pending the updated testnet
  artifact, economic event traffic, scheduled D1 ingestion/binding, alert and
  deployed Web/D1 smoke evidence.

### CHECKPOINT 33 — Phase 4 / DATA-001 sustainable scheduled catch-up

- DURUM: `PASS_LOCAL / TESTNET_READ / WORKERS_PAID_REQUIRED / NO_CRON_BINDING`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Ensure the source scheduled handler can keep pace with final NEAR
  blocks rather than permanently falling behind.
- BULGU: Cloudflare cron expressions run at best once per minute while NEAR
  produces roughly one block per second. The initial one-block-per-cron wrapper
  was therefore rejected before deployment. Workers Free also permits only 50
  external subrequests per invocation, which is insufficient for this source.
- UYGULAMA:
  - pilot policy is Workers Paid, one-minute cron and exact max 180 blocks/run;
  - one bounded 2.5-second final-height RPC read sets the run tip;
  - the worker applies up to 180 contiguous Neardata blocks sequentially and
    stops at the observed final tip, cap or first failure;
  - each block still commits event/projection/watermark atomically and overlap
    can only exact-replay, never skip the cursor;
  - gate/config drift and mainnet fail before ingestion.
- DOĞRULAMA:
  - focused D1/scheduler suite 12/12 and full root suite 110/110 passed;
  - live read-only dedicated RPC returned final testnet height `263136681`;
  - deployment start gap was 18,680 blocks. At roughly 60 new blocks/minute,
    max 180 closes backlog at a theoretical ~120 blocks/minute, about 2.6 hours;
  - docs build and whitespace checks passed.
- KANIT: `LOCAL_TEST` + `TESTNET_READ`. The calculation is not a measured D1 or
  Neardata RTO drill. No Worker/D1/cron resource, binding, deploy, flag, secret
  or chain mutation occurred.
- FAZ KAPISI: Scheduled source capacity is bounded and theoretically compatible
  with the four-hour target. DATA-001 remains partial pending Workers Paid plan
  proof, actual Worker/cron/D1 binding, provider latency/rate-limit measurement,
  lag alert delivery, named human owner and zero-to-tip rebuild drill.

### CHECKPOINT 34 — Phase 4 / DATA-001 ingestion telemetry contract

- DURUM: `PASS_LOCAL / SOURCE_ONLY / ALERT_DELIVERY_PENDING`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Make scheduled catch-up and failure state machine-readable without
  logging provider responses, RPC URLs, secrets or event payloads.
- UYGULAMA:
  - every scheduled run emits one `youtick.read-model-ingestion.v1` JSON record;
  - success contains status, block count, final height, last applied height/hash,
    event count and remaining blocks;
  - failure contains only `status=failed` and a bounded stable error code, then
    rethrows so the platform records a failed invocation;
  - closed-gate runs perform no RPC/D1/Neardata call.
- DOĞRULAMA: focused scheduler suite 12/12 verifies disabled no-I/O, success lag
  fields, bounded 180-block catch-up and redacted config-failure logging.
- KANIT: `LOCAL_TEST`; no log sink, dashboard, notification route, Worker, cron,
  D1 binding, deploy or external mutation.
- FAZ KAPISI: The source alert contract passes locally. DATA-001/SRE-001 remain
  partial until provider observability is configured and a synthetic failure
  proves an alert reaches the named on-call owner.

### CHECKPOINT 35 — Testnet/internal-pilot activation packet

- DURUM: `PASS_LOCAL_DOC / RUNTIME_CLOSED / EXTERNAL_NOT_RUN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Convert the accepted pilot decisions into one ordered, fail-closed
  activation, evidence, rollback and cleanup packet.
- UYGULAMA:
  - `docs/testnet-pilot-runbook.md` fixes the exact testnet accounts and accepted
    playback, upload, Queue, D1, budget and retention values;
  - contract update, D1/Queue/DLQ creation, alert proof, rebuild drill, derived
    read, upload canary and rollback are sequenced with explicit stop conditions;
  - each result must remain classified as local, CI, testnet, provider, deploy
    or runtime evidence;
  - mainnet, general traffic, automatic refund, multisig and timelock activation
    remain outside this packet.
- DOĞRULAMA: Docs build and whitespace checks pass; no credentials are included.
- KANIT: `LOCAL_STATIC`; no contract, D1, Queue, cron, Worker, Web, provider,
  secret, traffic or runtime mutation occurred.
- FAZ KAPISI: The execution packet is source-complete. Pilot activation remains
  blocked on a reviewed exact SHA, Workers Paid proof, provider resources,
  named human owner, delivered alert and measured rebuild/Queue drills.

### CHECKPOINT 36 — Phase 4 / PAY-001 exact financial projections

- DURUM: `PASS_LOCAL / SOURCE_ONLY / ACCOUNTING_RECONCILIATION_PENDING`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Ensure the pilot creator summary and withdrawal audit cannot disagree
  with the exact event ledger because of database number coercion or status
  naming drift.
- BULGU:
  - D1 stored contract amounts as decimal strings but the API cast them to
    SQLite `INTEGER`, whose 64-bit range is smaller than the contract's `u128`;
  - deterministic rebuild shortened withdrawal states while D1 retained the
    complete event name.
- UYGULAMA:
  - creator aggregate sales now fold validated decimal strings with JavaScript
    `BigInt`, returning an error on corrupt rows instead of a wrong total;
  - rebuild now keeps the exact withdrawal event name, matching D1;
  - no new table, dependency, public audit endpoint or authority path was added.
- DOĞRULAMA: financial/read-model focused suite 21/21 and full root suite
  112/112 passed; docs build and whitespace checks passed.
- KANIT: `LOCAL_TEST`. Cloudflare documents SQLite semantics and warns that
  large numeric values retrieved through JavaScript may lose precision. No D1,
  Worker, contract, provider, flag, secret, traffic or runtime mutation occurred.
- FAZ KAPISI: Local financial projections are exact for pilot data. PAY-001
  remains partial pending deployed economic events, D1/accounting
  reconciliation, support authorization and mainnet product/legal/finance
  approval. The ledger scan is intentionally pilot-only and must be measured
  before a materialized aggregate is justified.

### CHECKPOINT 37 — Phase 5 / supply-chain source gates

- DURUM: `PARTIAL_LOCAL / SOURCE_ONLY / CI_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Remove mutable CI dependencies and make high-severity runtime package
  advisories fail before the required CI Gate succeeds.
- UYGULAMA:
  - every third-party Action in CI, Preview, Production promotion and CodeQL is
    pinned to a reviewed 40-character commit SHA;
  - a local regression rejects any tracked workflow that returns to a moving
    tag, branch or shortened hash;
  - the CI Gate now requires high-severity runtime npm audits for Web, Bridge
    and docs;
  - Web runtime dependencies were resolved inside existing declared ranges;
    `package.json` and runtime feature flags did not change;
  - source-only CodeQL covers JavaScript/TypeScript and Rust on pull requests,
    protected branch pushes and a weekly schedule.
- RUST SINIRI:
  - vulnerable `rustls-webpki` and `tar` lock entries were updated and contract
    test/quality suites remained green;
  - the remaining `time` advisory is reached only through native test/dev
    tooling, not the normal WASM dependency graph;
  - its fixed release requires Rust 1.88 while the NEAR contract build is
    pinned to Rust 1.86. No hidden ignore or misleading mandatory audit gate was
    added; the toolchain decision remains explicit.
- DOĞRULAMA: local runtime npm audits report zero vulnerabilities; the
  workflow SHA regression is 1/1; root suite is 113/113; Web is 123/123 plus
  lint, type-check and production build; Market is 6/6 unit, 21/21 lifecycle
  and 1/1 sandbox plus fmt/clippy; Access is 14/14 plus fmt/clippy.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. No GitHub settings, branch protection,
  CodeQL result, CI run, SBOM, attestation, deploy, provider, secret, feature
  gate, traffic or runtime mutation occurred.
- FAZ KAPISI: The repository now has bounded source gates, but Phase 5 remains
  partial until current-branch CI/CodeQL run, a clean Rust advisory policy,
  signed provenance/SBOM and required-check enforcement are proven.

### CHECKPOINT 38 — Phase 5 / release SBOM and provenance source

- DURUM: `PARTIAL_LOCAL / SOURCE_ONLY / ATTESTATION_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Bind the existing exact-SHA release bundles to verifiable build origin
  and runtime dependency inventories without adding another SBOM dependency.
- UYGULAMA:
  - Web and Bridge builds use the pinned npm CLI to generate SPDX 2.3 runtime
    SBOMs with development dependencies omitted;
  - the assemble job receives only `actions:read`, `contents:read`,
    `id-token:write` and `attestations:write` permissions;
  - GitHub's official `actions/attest` is commit-SHA pinned and attests the
    exact canonical `SHA256SUMS` subjects;
  - the two Web bundles share the Web runtime SBOM; the Bridge bundle uses its
    own runtime SBOM. The release manifest and deploy payload remain unchanged.
- DOĞRULAMA: local npm 11 generated valid SPDX 2.3 documents for Web (116
  packages) and Bridge (87 packages); workflow SHA/provenance regression is
  2/2 and workflow YAML parses locally.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. No GitHub attestation, artifact, CI run,
  deploy, provider, secret, feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: SBOM/provenance source is complete for the deployable Web and
  Bridge bundles. The gate remains partial until one exact-SHA GitHub run
  creates both provenance and SBOM attestations and independent `gh
  attestation verify` checks pass. Contract SBOM and the Rust advisory policy
  remain separate open work.

### CHECKPOINT 39 — Phase 5 / production-WASM RustSec gate

- DURUM: `PASS_LOCAL_SOURCE / CI_UNPROVEN / WARNINGS_OPEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Make Rust dependency scanning mandatory without pretending that a
  native test/dev dependency is shipped inside either NEAR WASM contract.
- UYGULAMA:
  - CI downloads cargo-audit 0.22.2 from RustSec and verifies the pinned Linux
    archive SHA-256 before installation;
  - cargo-audit scans both complete lockfiles, while `cargo tree --target
    wasm32-unknown-unknown --edges normal` defines the deployable graph;
  - a small fail-closed checker rejects every RustSec vulnerability whose exact
    package and version is reachable from that graph;
  - lockfile-only vulnerabilities outside the normal WASM graph and reachable
    informational warnings remain explicit in the job output.
- DOĞRULAMA: both current normal WASM graphs contain 44 unique packages and no
  reachable vulnerability. `RUSTSEC-2026-0009` (`time`) is test/dev-only;
  reachable `RUSTSEC-2022-0054` marks `wee_alloc` unmaintained. Pass, reachable
  failure and malformed-audit regressions are 3/3; combined security tests are
  5/5, full root tests are 117/117, workflow YAML parses and docs build locally.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. No CI run, advisory database policy,
  GitHub setting, contract build/deploy, secret, feature gate, traffic or
  runtime mutation occurred.
- FAZ KAPISI: Production-WASM vulnerability enforcement is source-complete and
  required by the CI Gate. Phase 5 remains partial until GitHub executes it;
  `wee_alloc` is removed or explicitly risk-accepted, the Rust 1.86 test/dev
  `time` conflict is resolved, and contract SBOM/current-branch CodeQL evidence
  exists.

### CHECKPOINT 40 — Phase 5 / remove unmaintained WASM allocator

- DURUM: `PASS_LOCAL / WASM_REBUILT / TESTNET_NOT_UPDATED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Remove the only RustSec informational warning reachable from the
  deployable contract graphs without changing NEAR SDK or contract APIs.
- UYGULAMA:
  - both production and unit-test NEAR SDK declarations remain pinned to 5.5.0
    but set `default-features=false`; the required `legacy` and `unit-testing`
    features remain explicit;
  - this disables NEAR SDK's default `wee_alloc` feature and uses Rust's
    standard WASM allocator;
  - regenerated lockfiles remove `wee_alloc`, `memory_units` and their orphaned
    legacy dependencies. No contract method, state or event schema changed;
  - the sandbox replay assertion now reads stored publication state after the
    first finalize and after replay, proving the timestamp and complete value
    remain unchanged.
- DOĞRULAMA:
  - both normal WASM graphs fell from 44 to 41 unique packages; reachable
    vulnerabilities and informational RustSec warnings are zero;
  - Market 6/6 unit and 21/21 lifecycle pass; the strengthened sandbox passed
    three consecutive isolated runs after one pre-fix timing mismatch;
  - Access 14/14, both fmt/clippy, both Rust 1.86 WASM builds and exact ABI
    market=34/access=26 pass;
  - local non-reproducible artifacts grew by about 6 KiB: Market 304,915 bytes,
    Access 210,440 bytes. Size is recorded, not treated as reproducible hash
    evidence.
- KANIT: `LOCAL_TEST` + `LOCAL_BUILD`. No contract deploy/update, testnet state,
  wallet signature, GitHub setting, CI run, provider, secret, feature gate,
  traffic or runtime mutation occurred.
- FAZ KAPISI: The deployable WASM graphs have no current RustSec vulnerability
  or informational warning. Phase 5 remains partial because the native
  test/dev-only `time` advisory, contract SBOM and external CI/CodeQL evidence
  remain open. The newly built WASM is not authorized for testnet deployment by
  this checkpoint.

### CHECKPOINT 41 — Phase 3 / first MediaProvider boundary

- DURUM: `PARTIAL_LOCAL / CREATE_PATH_ONLY / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Stop the UploadJob domain from owning the raw Livepeer upload-create and
  TUS handshake while preserving every current fail-closed behavior.
- UYGULAMA:
  - `src/media-provider.ts` defines a 19-line vendor-neutral source type,
    create input, normalized result and `MediaProvider.createUpload` contract;
  - `LivepeerProvider` implements that port and exclusively owns the Livepeer
    request-upload payload, 402/429 classification, response normalization,
    trusted TUS Location check, exact length binding and zero-offset HEAD;
  - UploadJob passes only job/generation/expected bytes/source type and stores
    only normalized asset, playback, project and TUS identifiers;
  - no second provider, factory/config layer or speculative fallback was added.
- DOĞRULAMA: focused UploadJob/route suite 51/51; full Worker 159/159 with two
  opt-in tests skipped; mocked provider-canary 63/63; TypeScript check and
  Wrangler dry-run pass. The dry-run reports all runtime gates false.
- KANIT: `LOCAL_TEST` + `LOCAL_BUILD`. Provider canaries were mocked. No
  Livepeer request, upload, Queue, deploy, secret, feature gate, traffic or
  runtime mutation occurred.
- FAZ KAPISI: LP-002 advances from missing to partial. Provider reads,
  ready-asset normalization/verification, playback/media probing and cost
  estimation still need to cross the port; the 5,000-line Worker monolith and
  staging/provider E2E remain open.

### CHECKPOINT 42 — Phase 3 / provider read transport boundary

- DURUM: `PARTIAL_LOCAL / API_TRANSPORT_BOUND / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Remove arbitrary Livepeer asset/playback path construction and HTTP
  status mapping from domain call sites.
- UYGULAMA:
  - `MediaProvider` now exposes only keyed `readAsset` and `readPlayback`
    operations in addition to `createUpload`;
  - `LivepeerProvider` owns URL encoding, the fixed Livepeer API base,
    five-second timeout, bearer header and stable 404/429/5xx/invalid-JSON error
    classification;
  - stateless playback policy, ready verification/reconcile and cover lookup use
    these keyed reads; the previous arbitrary `providerJson(path)` helper was
    removed;
  - request ordering, cache policy, verification rules and stored state did not
    change.
- DOĞRULAMA: upload route suite 51/51; provider read/verification/cover/playback
  focused suites 71/71 with two opt-in load tests skipped; TypeScript check
  passes.
- KANIT: `LOCAL_TEST`. No provider request, upload, Queue, deploy, secret,
  feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: Vendor API transport now crosses the port. LP-002 remains partial
  until raw Livepeer documents are normalized inside the adapter and provider
  media probes/cost estimation move behind explicit operations. The Worker
  module split and real provider/staging evidence remain open.

### CHECKPOINT 43 — Phase 3 / normalized provider read model

- DURUM: `PARTIAL_LOCAL / RAW_API_CONTAINED / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Prevent raw Livepeer response shapes from leaking into playback and
  ready-publication domain decisions.
- UYGULAMA:
  - `MediaProvider.readAsset` returns neutral identity binding, policy, phase,
    updated time, byte size, download URL and optional SHA-256 fields;
  - `MediaProvider.readPlayback` returns neutral `kind`, policy and bounded
    source records whose kinds are `hls`, `mp4`, `vtt` or `unknown`;
  - `LivepeerProvider` alone reads `creatorId`, `playbackPolicy`, `meta`, MIME
    source types and provider hash arrays;
  - stateless policy checks, reconcile/finalize verification and cover lookup
    consume only normalized fields. Existing identity, exact-size, 720p,
    private-media and source-count checks remain fail closed.
- DOĞRULAMA: upload suite 51/51 and provider read/verification/cover/playback
  suites 71/71 pass, with two opt-in load tests skipped; TypeScript check passes.
- KANIT: `LOCAL_TEST`. No provider request, upload, Queue, deploy, secret,
  feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: Raw API documents are contained at the adapter. LP-002 and the
  Worker split remain partial until the implementation leaves the monolith,
  webhook normalization/media probes/cost estimation cross explicit ports and
  a real provider/staging canary proves behavior.

### CHECKPOINT 44 — Phase 3 / ready-asset verification port

- DURUM: `PARTIAL_LOCAL / READY_VERIFICATION_PORT / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Keep UploadJob finalization independent of Livepeer verification and
  media-probe details without weakening the accepted fail-closed checks.
- UYGULAMA:
  - `MediaProvider.verifyReadyAsset` accepts normalized job, generation,
    expected-size and provider identity inputs;
  - `LivepeerProvider` validates provider configuration before verification and
    returns only hashed asset/project identity, playback ID, exact verified
    bytes, optional source fingerprint and ready time;
  - identity binding, project/token/name checks, ready/JWT policy, exact source
    size, bounded known outputs, canonical 720p MP4 and anonymous denial for
    HLS, MP4, VTT, thumbnails and source download remain mandatory;
  - finalization maps that neutral evidence to the on-chain publication and no
    longer coordinates provider reads or media probes directly.
- DOĞRULAMA: full Worker 159/159 with two opt-in tests skipped; mocked
  provider-canary 63/63; TypeScript check and Wrangler dry-run pass. The dry-run
  reports every runtime gate false.
- KANIT: `LOCAL_TEST` + `LOCAL_BUILD`. No Livepeer request, upload, Queue,
  deploy, secret, feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: Ready verification now crosses an explicit provider operation.
  LP-002 and the Worker split remain partial because the Livepeer class and
  verification/probe helpers are still in the 5,061-line monolith; webhook
  normalization, actual-cost estimation and real provider/staging evidence
  remain open.

### CHECKPOINT 45 — Phase 3 / TUS state port

- DURUM: `PARTIAL_LOCAL / TUS_STATE_PORT / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Put the existing authoritative TUS `HEAD` check behind the provider
  port while preserving upload-create ambiguity safety.
- UYGULAMA:
  - `MediaProvider.readTusOffset` returns canonical decimal offset and total
    length strings, avoiding JavaScript number precision loss;
  - `LivepeerProvider` rejects non-Livepeer HTTPS endpoints, non-200/204
    responses, malformed headers and offsets greater than total length;
  - newly created resources still require exact expected length and zero offset
    before the TUS URL is persisted or returned;
  - `suspendOrDelete` was not added because the runtime has no provider-asset
    mutation call site. Sales suspension is a separate on-chain operation; an
    unused destructive API would be speculative.
- DOĞRULAMA: TypeScript check and focused upload suite 52/52 pass, including a
  new nonzero-offset fail-closed case.
- KANIT: `LOCAL_TEST`. No TUS/provider request, asset deletion, upload, Queue,
  deploy, secret, feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: The target TUS read operation now crosses `MediaProvider`.
  LP-002 remains partial until the adapter implementation leaves the monolith,
  webhook normalization and cost estimation cross explicit boundaries, and a
  real provider/staging canary proves behavior. Provider deletion remains tied
  to a future approved takedown workflow rather than dead source code.

### CHECKPOINT 46 — Phase 5 / provider cost evidence gate

- DURUM: `EXTERNAL_EVIDENCE_REQUIRED / NO_FAKE_ESTIMATE / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Decide whether `MediaProvider.estimateCost` can be implemented from
  current provider contracts without inventing a financial number.
- KANIT:
  - Livepeer Studio's public pricing page currently expresses transcoding,
    storage and delivery in video minutes and applies plan/minimum-spend terms;
  - the documented asset read shape supplies media identity/state/size, not a
    per-job billed amount;
  - YouTick's current upload intent has exact source bytes but no trusted video
    duration, so bytes cannot be converted into those minute-based charges;
  - the existing configured per-job USD-micros value is therefore only a
    conservative admission reservation, not measured provider cost.
- KARAR: No hard-coded rate, bytes-to-minutes guess or misleading
  `estimateCost` method is added. Completion requires approved machine-readable
  commercial terms, a trusted duration input, and reconciliation against a
  provider invoice or billing/usage export.
- DOĞRULAMA: Official-source review plus existing local budget tests. No
  provider API call, account/billing read, secret, upload, deploy, feature gate,
  traffic or runtime mutation occurred.
- FAZ KAPISI: Cost reservation remains `PASS_LOCAL`; actual-cost accounting and
  LP-002 cost estimation remain external. This evidence gap does not authorize
  opening Preview, testnet runtime or production.

### CHECKPOINT 47 — Phase 3 / Livepeer normalization module split

- DURUM: `PARTIAL_LOCAL / NORMALIZER_MODULE_SPLIT / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Move Livepeer-specific raw response interpretation out of the Worker
  monolith without adding a second provider or dependency-injection framework.
- UYGULAMA:
  - new `src/livepeer-provider.ts` owns asset `creatorId`, playback policy,
    status, hash-array and Livepeer MIME-to-neutral-source normalization;
  - `src/media-provider.ts` remains the vendor-neutral port and data contract;
  - `LivepeerProvider.readAsset/readPlayback` now delegate only raw documents to
    those pure normalizers;
  - provider HTTP transport, ready verification and probes remain unchanged.
- DOĞRULAMA: TypeScript check and focused finalize/cover/playback suites 71/71
  pass with two opt-in load tests skipped.
- KANIT: `LOCAL_TEST`. No provider call, upload, Queue, deploy, secret, feature
  gate, traffic or runtime mutation occurred.
- FAZ KAPISI: The Worker split advances from missing to partial and `index.ts`
  falls from 5,084 to 5,028 lines. LP-002 remains partial until provider
  transport and verification helpers leave the monolith; webhook normalization,
  real provider/staging evidence and the external cost gate remain open.

### CHECKPOINT 48 — Phase 3 / Livepeer transport module split

- DURUM: `PARTIAL_LOCAL / TRANSPORT_MODULE_SPLIT / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Move the existing Livepeer API/TUS transport out of the Worker monolith
  while preserving telemetry, timeout and fail-closed behavior exactly.
- UYGULAMA:
  - `LivepeerTransport` now owns request-upload payload/response handling,
    asset/playback keyed reads, bearer/API paths, HTTP error mapping, TUS create,
    trusted Location and exact `HEAD` state checks;
  - one 33-line shared `dependency-fetch.ts` preserves the existing bounded
    dependency/status/latency log for NEAR, provider and media calls;
  - source-type metadata moved to the vendor-neutral port so request validation
    and transport use one exhaustive mapping;
  - the Worker keeps a small `MediaProvider` wrapper only to compose transport
    with ready-asset business verification.
- DOĞRULAMA: TypeScript check and focused upload/finalize/cover/playback suites
  123/123 pass with two opt-in load tests skipped.
- KANIT: `LOCAL_TEST`. No provider/TUS call, upload, Queue, deploy, secret,
  feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: `index.ts` falls from 5,028 to 4,849 lines and provider transport
  now has a real module boundary. LP-002 remains partial until ready verification
  and probe helpers leave the monolith; webhook normalization, real
  provider/staging evidence and the external cost gate remain open.

### CHECKPOINT 49 — Phase 3 / UploadJob transition invariant

- DURUM: `PARTIAL_LOCAL / TRANSITION_INVARIANT / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Prevent implemented UploadJob states from being assigned through an
  invalid predecessor while keeping stored v1 records readable.
- UYGULAMA:
  - one exhaustive table permits only create-pending to ambiguous/upload-ready,
    upload-ready to ready-verified, and ready-verified/finalize-queued to the
    existing finalization states;
  - a single transition helper rejects every other non-idempotent change and
    stamps `stateChangedAtMs`;
  - same-state finalize retries preserve their previous transition time;
  - the timestamp is optional only for backward compatibility with existing v1
    records; all newly created records set it with `createdAtMs`.
- DOĞRULAMA: TypeScript check and focused upload/finalize suites 93/93 pass;
  pending, upload-ready and published records assert a numeric transition time.
- KANIT: `LOCAL_TEST`. No provider/TUS call, upload, Queue, deploy, secret,
  feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: UP-002 advances but remains partial. The target still needs real
  uploading/processing/error/terminal event sources, per-transition retry and
  cleanup metadata, terminal archive and destructive-cleanup proof. Those
  states are not added as unused labels.

### CHECKPOINT 50 — Phase 3 / provider processing state

- DURUM: `PARTIAL_LOCAL / PROCESSING_EVENT_BOUND / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Represent a target UploadJob state only when an authenticated event can
  prove it, rather than adding an unused enum label.
- UYGULAMA:
  - an `asset.updated` event bound to the current asset and exact provider phase
    `processing` advances `UPLOAD_READY → PROCESSING`;
  - the transition performs no provider/media/NEAR request and records the
    existing structured transition log and `stateChangedAtMs`;
  - a later ready event may advance `PROCESSING → READY_VERIFIED` through the
    same provider identity, size, output and privacy verification;
  - duplicate or late processing delivery cannot regress a published job.
- DOĞRULAMA: TypeScript check and finalize suite 42/42 pass, including direct
  processing persistence with zero external fetch and processing-to-published
  recovery.
- KANIT: `LOCAL_TEST`. No provider/TUS call, upload, Queue, deploy, secret,
  feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: UP-002 gains a real `PROCESSING` event source but remains partial.
  Upload progress, explicit authorization/lease states, provider failure,
  expiry/cancel and terminal cleanup still require real signals and policies.

### CHECKPOINT 51 — Phase 3 / provider failure terminal

- DURUM: `PARTIAL_LOCAL / PROVIDER_FAILURE_TERMINAL / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Stop ignoring authenticated provider failure/deletion events and release
  pilot capacity without regressing an already published job.
- UYGULAMA:
  - asset-bound `asset.failed` or `asset.deleted` moves upload-ready,
    processing, ready-verified or finalize-queued jobs to `PROVIDER_FAILED`;
  - the transition stamps both `stateChangedAtMs` and `terminalAtMs`, performs no
    provider/media/NEAR request and prevents later finalization alarms;
  - admission marking treats provider failure as an idempotent terminal release
    while retaining the monthly reservation as conservative spend accounting;
  - a published job remains terminal and schedules normal reconcile instead of
    moving backwards.
- DOĞRULAMA: TypeScript check and focused upload/finalize suites 94/94 pass;
  both failure event forms persist terminal state, call only admission mark and
  release the same slot idempotently.
- KANIT: `LOCAL_TEST`. No provider/TUS call, asset deletion, upload, Queue,
  deploy, secret, feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: UP-002 gains one real terminal error path. It remains partial
  because upload progress, authorization/lease, expiry/cancel, retry metadata,
  D1 terminal archive and guarded 14-day cleanup proof remain open.

### CHECKPOINT 52 — Phase 3 / signed uploading state

- DURUM: `PARTIAL_LOCAL / UPLOADING_HEARTBEAT_BOUND / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Add the target uploading state from an existing authenticated signal
  and preserve TUS recovery after that transition.
- UYGULAMA:
  - the first valid session-key-signed upload heartbeat advances the job and
    admission reservation from upload-ready to `UPLOADING`;
  - later heartbeats are idempotent and renew the same lease without changing
    its transition timestamp;
  - provider processing/ready/failure events accept `UPLOADING` as a valid
    predecessor;
  - a repeated upload-intent request while uploading returns the same stored TUS
    endpoint and never calls provider create again.
- DOĞRULAMA: TypeScript check and focused upload/finalize suites 95/95 pass;
  the new signed-heartbeat regression proves `UPLOADING`, admission renewal,
  identical recovery URL and exactly one provider create.
- KANIT: `LOCAL_TEST`. No provider/TUS call, upload, Queue, deploy, secret,
  feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: UP-002/UP-003 advance but remain partial. Explicit persisted
  authorization/lease states, expiry/cancel, file-fingerprint recovery, retry
  metadata and real browser/staging evidence remain open.

### CHECKPOINT 53 — Phase 3 / upload expiry terminal

- DURUM: `PARTIAL_LOCAL / LEASE_DENIAL_TERMINAL / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Turn a real expired-lease signal into a bounded UploadJob terminal
  state without misclassifying coordinator outages.
- UYGULAMA:
  - a valid signed heartbeat whose coordinator reply is exactly HTTP 409 with
    `admission_denied` moves upload-ready/uploading to `UPLOAD_EXPIRED`;
  - the terminal stamps `stateChangedAtMs`/`terminalAtMs` and idempotently
    releases any remaining admission reservation;
  - malformed, non-409 or coordinator-unavailable responses map to
    `admission_closed` and leave the job recoverable;
  - ready webhooks for provider-failed/upload-expired jobs are ACKed as terminal
    ignores, preventing retry loops and state regression.
- DOĞRULAMA: TypeScript check and focused upload/finalize suites 99/99 pass;
  exact denial expires, a 503 does not, both terminal states ignore late ready,
  and admission release is idempotent.
- KANIT: `LOCAL_TEST`. No provider/TUS call, upload, Queue, deploy, secret,
  feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: UP-002 gains a second real terminal path. Explicit authorization
  and lease states, cancel, retry metadata, D1 terminal archive and guarded
  14-day cleanup proof remain open.

### CHECKPOINT 54 — Phase 3 / finalize retry state

- DURUM: `PARTIAL_LOCAL / FINALIZE_RETRY_BOUND / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Make failed finalization delivery explicit and resumable without
  changing the verified publication or creating a second outbox identity.
- UYGULAMA:
  - a non-successful finalize outbox response moves ready-verified or
    finalize-queued jobs to `FINALIZE_RETRY`;
  - the job keeps the same normalized publication and the existing alarm uses
    the same deterministic finalize idempotency key;
  - a later accepted-but-pending response may return to finalize-queued, while
    confirmed completion advances directly to on-chain-published;
  - provider failure remains a valid terminal predecessor from retry state.
- DOĞRULAMA: TypeScript check and focused upload/finalize suites 100/100 pass;
  the new regression persists retry after an HTTP 503 and publishes the same
  payload on the next alarm with exactly two outbox calls.
- KANIT: `LOCAL_TEST`. No provider/TUS call, upload, Queue, deploy, secret,
  feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: UP-002 gains its target finalize-retry path but remains partial.
  Explicit authorization/lease states, cancel, per-transition retry counters,
  D1 terminal archive and guarded 14-day cleanup proof remain open.

### CHECKPOINT 55 — Phase 3 / canonical web upload stage

- DURUM: `PARTIAL_LOCAL / DERIVED_TERMINAL_FLAGS / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Remove contradictory upload-complete/publication-ready UI combinations
  without introducing a speculative frontend state-machine abstraction.
- UYGULAMA:
  - `UploadStage` remains the single canonical stage value in the paid-upload
    form;
  - `uploaded` is derived only from processing/published, and
    `publicationReady` only from published;
  - account/file resets, existing-publication recovery, upload completion and
    publication polling now change the stage instead of maintaining duplicate
    boolean state.
- DOĞRULAMA: Focused ESLint passes; the web unit suite passes 123/123; the
  production build, including TypeScript and all 15 static-page generations,
  passes with documented testnet placeholder contract IDs and every paid-media,
  playback-v2, native-NEAR and derived-read-model runtime gate closed.
- KANIT: `LOCAL_TEST`. The initial build without required contract IDs failed
  closed before page generation, as designed. No wallet, provider, testnet,
  deploy, secret, feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: WEB-001 advances but remains partial. A versioned persisted state
  model, explicit transition/retry policy and real reload/staging/browser proof
  are still required; operational `busy`, progress and error data remain
  separate because they are not duplicate lifecycle truth.

### CHECKPOINT 56 — Phase 3 / provider ready-verification module

- DURUM: `PARTIAL_LOCAL / VERIFICATION_MODULE_SPLIT / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Move ready-asset validation and private-media probes out of the Worker
  monolith without weakening identity, output or anonymous-access checks.
- UYGULAMA:
  - the new 251-line `provider-verification.ts` owns exact provider identity,
    project/token/name, JWT/ready, source-size, bounded-output and canonical
    720p MP4 validation;
  - it also owns fail-closed anonymous HLS/MP4/VTT/thumbnail/download probes,
    trusted playback URL validation and bounded VTT reference parsing;
  - the module reads only through `MediaProvider` and receives SHA-256 plus an
    optional short-lived playback-token signer as callbacks; secrets and
    environment authority remain in `index.ts`;
  - publication-cover reuse imports only the shared playback URL and first-VTT
    helpers, eliminating duplicate provider rules.
- DOĞRULAMA: TypeScript passes; the full Worker suite passes 167/167 with two
  opt-in load tests skipped; provider canaries pass 63/63; Wrangler dry-run
  bundles successfully with Bridge, playback-v2, Queue and native-NEAR gates
  false and multi-asset mode off; `git diff --check` passes.
- KANIT: `LOCAL_TEST`. Canary tests used mocks and the Wrangler command was
  `--dry-run`; no provider/TUS call, upload, Queue, deploy, secret, feature gate,
  traffic or runtime mutation occurred.
- FAZ KAPISI: `index.ts` falls from 4,937 to 4,709 lines and the ready probe
  boundary is explicit. LP-002 and the Worker split remain partial because the
  provider composition wrapper, webhook normalization and actual cost/billing
  reconciliation remain open; real provider/staging evidence is also absent.

### CHECKPOINT 57 — Phase 3 / provider webhook normalization module

- DURUM: `PARTIAL_LOCAL / WEBHOOK_NORMALIZATION_SPLIT / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Separate provider event-shape interpretation from webhook trust and
  delivery authority without changing Queue or Durable Object behavior.
- UYGULAMA:
  - the new 75-line `provider-webhook.ts` owns bounded event parsing, asset vs
    snapshot selection, accepted asset-event routing, creator binding split,
    provider-phase normalization and deterministic dedup digest input;
  - the shared platform job-ID validator and SHA-256 implementation cross as
    callbacks instead of being duplicated;
  - signature verification, secret overlap, five-minute timestamp tolerance,
    Queue policy/dispatch and Durable Object mutation remain in `index.ts`.
- DOĞRULAMA: TypeScript passes; the full Worker suite passes 167/167 with two
  opt-in load tests skipped; provider canaries pass 63/63; Wrangler dry-run
  bundles successfully with all runtime gates closed; `git diff --check`
  passes.
- KANIT: `LOCAL_TEST`. Canary tests used mocks and the Wrangler command was
  `--dry-run`; no provider/TUS call, upload, Queue, deploy, secret, feature gate,
  traffic or runtime mutation occurred.
- FAZ KAPISI: `index.ts` falls from 4,709 to 4,647 lines. LP-002 and the Worker
  split remain partial because provider composition and conservative-vs-actual
  cost accounting still live in the monolith, and real provider/staging proof
  is absent.

### CHECKPOINT 58 — Phase 3 / concrete MediaProvider implementation split

- DURUM: `PARTIAL_LOCAL / PROVIDER_IMPLEMENTATION_SPLIT / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Move the concrete provider composition class out of the Worker while
  keeping environment and secret authority at the application boundary.
- UYGULAMA:
  - the 302-line `livepeer-provider.ts` now exports the complete concrete
    `MediaProvider` implementation and composes its transport with ready
    verification;
  - the implementation accepts only an API key plus explicit hashing/token
    callbacks and a ready-verification enable bit; it does not import `Env` or
    know Worker secret names;
  - a 15-line Worker factory validates environment configuration and supplies
    callbacks; upload, playback-policy, ready and cover callers all use it.
- DOĞRULAMA: TypeScript passes; the full Worker suite passes 167/167 with two
  opt-in load tests skipped; provider canaries pass 63/63; Wrangler dry-run
  bundles successfully with all runtime gates closed; `git diff --check`
  passes.
- KANIT: `LOCAL_TEST`. Canary tests used mocks and the Wrangler command was
  `--dry-run`; no provider/TUS call, upload, Queue, deploy, secret, feature gate,
  traffic or runtime mutation occurred.
- FAZ KAPISI: `index.ts` falls from 4,647 to 4,611 lines. The concrete adapter
  boundary is complete locally, but LP-002 remains partial because actual
  billing/cost reconciliation and real provider/staging evidence are external;
  no unused destructive provider operation was invented.

### CHECKPOINT 59 — Phase 3 / fingerprinted session draft recovery

- DURUM: `PARTIAL_LOCAL / SOURCE_FINGERPRINT_DRAFT / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Prevent an upload draft from binding a same-metadata but different
  source file to an existing paid job after a wallet redirect or reload.
- UYGULAMA:
  - the session-only draft now uses exact schema
    `youtick.livepeer-ui-draft.v2` and rejects legacy/malformed records;
  - a domain-separated SHA-256 digest covers source length plus up to 1 MiB
    from the first and last source blocks, reading at most 2 MiB for a large
    file;
  - recovery additionally retains exact name, byte length and `lastModified`
    checks; async file selection uses a generation guard so stale hashing cannot
    restore an earlier selection;
  - no TUS URL or browser secret is added to the draft, and storage remains
    `sessionStorage` only.
- DOĞRULAMA: Focused ESLint passes; the upload suite passes 23/23 including a
  same-name/same-size/same-date different-content rejection; all web tests pass
  123/123; the production build and TypeScript pass with all runtime gates
  closed and all 15 static pages generated; `git diff --check` passes.
- KANIT: `LOCAL_TEST`. No wallet, provider/TUS call, upload, Queue, testnet,
  deploy, secret, feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: UP-003/WEB-001 advance but remain partial. The fingerprint is a
  local source-selection guard, not yet a signed server/provider binding; real
  reload/resume browser and staging proof remain absent.

### CHECKPOINT 60 — Phase 3 / signed source-fingerprint recovery binding

- DURUM: `PARTIAL_LOCAL / SIGNED_FINGERPRINT_BINDING / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Prevent a valid upload session from recovering an existing TUS
  capability for a source declaration different from the first accepted one.
- UYGULAMA:
  - upload-intent control envelope version `3` requires exact
    `source_fingerprint_sha256`; canonical body hashing and the existing
    session-key Ed25519 signature bind it to account/job/generation/origin;
  - new `youtick.livepeer-control-job.v2` records persist the first fingerprint,
    and `sameJob` rejects a conflicting retry before another provider create;
  - stored v1 records remain readable for existing finalization/playback paths
    but cannot silently acquire a recovery fingerprint;
  - heartbeat and legacy playback-token envelopes remain version `2`, and every
    route rejects the wrong version explicitly; protocol schema/vector/checker
    now lock that split.
- DOĞRULAMA: The protocol checker passes; focused Worker upload tests pass
  57/57 including conflicting-fingerprint and v2-upload rejection; the full
  Worker suite passes 169/169 with two opt-in load tests skipped; provider
  canaries pass 63/63; all web tests pass 123/123; the web production build and
  Wrangler dry-run pass with every runtime gate closed; `git diff --check`
  passes.
- KANIT: `LOCAL_TEST`. Canary tests used mocks and Wrangler used `--dry-run`;
  no wallet, provider/TUS call, upload, Queue, testnet, deploy, secret, feature
  gate, traffic or runtime mutation occurred.
- FAZ KAPISI: UP-003 advances materially but remains partial. The server binds
  the browser-declared bounded fingerprint; it does not compute a full-file hash
  or prove actual provider bytes. Real reload/resume browser and staging proof
  remain absent.

### CHECKPOINT 61 — Phase 3 / monotonic session recovery stage

- DURUM: `PARTIAL_LOCAL / VERSIONED_RECOVERY_STAGE / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Persist meaningful upload recovery progress without creating another
  competing set of UI booleans or storing provider capabilities.
- UYGULAMA:
  - the existing `youtick.livepeer-ui-draft.v2` now requires one bounded stage:
    `payment_pending`, `authorized`, `upload_ready`, `uploading` or
    `provider_processing`;
  - real payment/job/intent/TUS call sites advance that stage, while one order
    table makes duplicate/lower updates idempotent so retries cannot regress it;
  - rewriting the same job/fingerprint draft preserves the furthest stage;
    malformed records are removed and all restored fields receive bounded type
    validation;
  - the draft remains `sessionStorage`-only, contains neither TUS URL nor key,
    and publication observation still clears it.
- DOĞRULAMA: Focused ESLint and upload tests pass 23/23, including monotonic
  advance and rewrite behavior; all web tests pass 123/123; the production
  build and TypeScript pass with all runtime gates closed and all 15 static
  pages generated; `git diff --check` passes.
- KANIT: `LOCAL_TEST`. No wallet, provider/TUS call, upload, Queue, testnet,
  deploy, secret, feature gate, traffic or runtime mutation occurred.
- FAZ KAPISI: WEB-001 advances but remains partial. Persisted progress is now
  versioned and monotonic, but restore does not yet drive the UI directly,
  network side effects still live in the component, and real reload/staging
  browser evidence is absent.

### CHECKPOINT 62 — Phase 3 / visibility-aware publication polling

- DURUM: `PARTIAL_LOCAL / QUERY_POLLING / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Stop fixed background polling after upload while preserving prompt
  publication detection and the existing status UX.
- UYGULAMA:
  - the manual recursive timer is replaced by the already-installed TanStack
    Query provider with a job/account-scoped key;
  - the query reads the existing job/publication services every five seconds,
    stops once publication exists, disables immediate retry storms, pauses its
    interval while the tab is hidden and refetches when focus returns;
  - a small reaction preserves the prior processing/finalizing/error text,
    clears the session draft and advances the canonical UI stage on publication.
- DOĞRULAMA: Focused ESLint passes; all web tests pass 123/123; the production
  build and TypeScript pass with all runtime gates closed and all 15 static
  pages generated; `git diff --check` passes.
- KANIT: `LOCAL_TEST`. No wallet, provider/TUS call, upload, Query network
  traffic, testnet, deploy, secret, feature gate or runtime mutation occurred.
- FAZ KAPISI: WEB-001 gains the target polling/visibility behavior but remains
  partial. The query still composes read services in the component, restored
  draft stage does not yet drive recovery actions, and real browser/staging
  evidence is absent.

### CHECKPOINT 63 — Phase 3 / target UI upload lifecycle

- DURUM: `PARTIAL_LOCAL / TARGET_UI_STAGES / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Make the canonical UI stage describe the real upload lifecycle instead
  of grouping several network operations under coarse labels.
- UYGULAMA:
  - `UploadStage` now exactly covers `draft`, `preflight`, `payment_required`,
    `payment_pending`, `authorized`, `intent_pending`, `upload_ready`,
    `uploading`, `provider_processing` and `published`;
  - each stage is set at its real payment/job/intent/TUS/publication boundary,
    and upload-complete/publication-ready remain derived from this one value;
  - a non-mutating admission preflight now runs before payment options, while
    the existing fresh pre-wallet preflight remains to close the stale-capacity
    window;
  - the existing five-step visual projection maps from the richer lifecycle,
    and byte progress renders only in the actual `uploading` stage.
- DOĞRULAMA: Focused ESLint passes; all web tests pass 123/123; the production
  build and TypeScript pass with all runtime gates closed and all 15 static
  pages generated; `git diff --check` passes.
- KANIT: `LOCAL_TEST`. No wallet, provider/TUS call, upload, preflight network
  traffic, testnet, deploy, secret, feature gate or runtime mutation occurred.
- FAZ KAPISI: WEB-001 now has the target canonical stage vocabulary and real
  call-site mapping, but remains partial until transitions are enforced by one
  policy, restored stage drives recovery, component side effects are reduced
  and browser/staging evidence exists.

### CHECKPOINT 64 — Phase 3 / enforced UI stage transitions

- DURUM: `PARTIAL_LOCAL / UI_PREDECESSOR_POLICY / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Prevent a future callback or retry from placing the upload UI in an
  impossible lifecycle state.
- UYGULAMA:
  - the 24-line `livepeer-upload-state.ts` owns one exhaustive predecessor map
    for every `UploadStage` value;
  - normal forward edges are explicit; retries may return from authorized or
    upload preparation/progress to `payment_pending` so exact-job reconciliation
    can resume without a second payment;
  - same-state repeats, any-state new-file/account reset to `draft`, and an
    authoritative publication jump to `published` are the only exceptions;
  - every component stage write now uses the functional transition helper, and
    invalid edges fail with `invalid_upload_stage_transition`.
- DOĞRULAMA: Focused ESLint passes; two pure transition regressions cover the
  complete target path plus retry/reset/published/invalid edges; all web tests
  pass 125/125; the production build and TypeScript pass with all runtime gates
  closed and all 15 static pages generated; `git diff --check` passes.
- KANIT: `LOCAL_TEST`. No wallet, provider/TUS call, upload, Query/preflight
  traffic, testnet, deploy, secret, feature gate or runtime mutation occurred.
- FAZ KAPISI: WEB-001 now has one enforced canonical lifecycle and invalid
  boolean/stage combinations are locally closed. It remains partial because
  restored stage does not yet drive recovery, the component still coordinates
  network use cases, and real browser/staging evidence is absent.

### CHECKPOINT 65 — Phase 3 / verified draft stage restoration

- DURUM: `PARTIAL_LOCAL / RESTORE_DRIVEN_UI / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Use validated session recovery state to resume the correct UI behavior
  instead of always presenting a brand-new draft after file reselection.
- UYGULAMA:
  - after exact metadata and bounded-fingerprint validation, `payment_pending`
    restores to payment options, `authorized` remains authorized,
    `upload_ready` remains ready, interrupted `uploading` becomes safely paused
    `upload_ready`, and `provider_processing` remains processing;
  - the predecessor policy explicitly allows only those draft restoration
    edges, and three pure transition tests lock every projection;
  - processing restoration activates the existing Query path and keeps payment
    disabled; other restored states can restart preflight/reconciliation through
    the explicit reset edge without regressing the persisted monotonic stage.
- DOĞRULAMA: Focused ESLint passes; upload/state suites pass 26/26; all web tests
  pass 126/126; the production build and TypeScript pass with all runtime gates
  closed and all 15 static pages generated; `git diff --check` passes.
- KANIT: `LOCAL_TEST`. No wallet, provider/TUS call, upload, Query/preflight
  traffic, testnet, deploy, secret, feature gate or runtime mutation occurred.
- FAZ KAPISI: WEB-001 now has versioned, fingerprint-gated restore-driven UI and
  visibility-aware polling, but remains partial because component-level network
  orchestration is still broad and no real reload/staging browser evidence
  exists.

### CHECKPOINT 66 — Phase 3 / authorized and leased UploadJob states

- DURUM: `PARTIAL_LOCAL / AUTHORIZED_LEASED_PERSISTED / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Represent authorization, lease acquisition and provider-create start as
  distinct durable facts rather than collapsing them into one pending state.
- UYGULAMA:
  - after signature, final on-chain job/key and source-fingerprint checks, a new
    job is persisted as `AUTHORIZED` with its request nonce before admission;
  - successful coordinator reservation advances it to `LEASED` with the exact
    random lease ID/expiry; immediately before the external provider call the
    job advances to `PROVIDER_CREATE_PENDING`;
  - admission failure leaves `AUTHORIZED` durable and retryable with a new nonce;
    a regression proves reopening the allowlist continues the same job to
    `UPLOAD_READY` without a prior provider call;
  - expired ready/uploading leases still refresh in place, and legacy stored
    `CREATE_PENDING` remains readable as an ambiguous in-flight predecessor
    rather than being replayed.
- DOĞRULAMA: TypeScript and focused upload tests pass 57/57; structured logs
  prove `NONE → AUTHORIZED → LEASED → PROVIDER_CREATE_PENDING → UPLOAD_READY`
  without identifiers; the full Worker suite passes 169/169 with two opt-in
  load tests skipped; provider canaries pass 63/63; Wrangler dry-run bundles
  with every runtime gate closed; `git diff --check` passes.
- KANIT: `LOCAL_TEST`. Canary tests used mocks and Wrangler used `--dry-run`;
  no provider/TUS call, upload, admission traffic, Queue, testnet, deploy,
  secret, feature gate or runtime mutation occurred.
- FAZ KAPISI: UP-002 now has real authorization, lease and provider-pending
  states. It remains partial because creator cancel, per-transition retry
  metadata, terminal D1 archive/14-day cleanup and real staging evidence remain
  open.

### CHECKPOINT 67 — Phase 3 / bounded finalize retry metadata

- DURUM: `PARTIAL_LOCAL / FINALIZE_RETRY_POLICY / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Make finalization retry timing durable and observable so another alarm
  cannot accidentally create a tight NEAR retry loop.
- UYGULAMA:
  - every unsuccessful finalize response persists a capped attempt count, the
    bounded numeric HTTP status and exact `nextAttemptAtMs` on the UploadJob;
  - backoff advances through 60, 120, 240, 480 and 900 seconds, then remains at
    900 seconds with attempts capped at five, keeping storage bounded;
  - the shared Durable Object alarm checks the persisted deadline and reschedules
    without calling the outbox when it fires early;
  - accepted/finalized delivery removes retry metadata while preserving the
    same verified publication and deterministic finalize idempotency key.
- DOĞRULAMA: TypeScript and finalize tests pass 46/46; regressions prove early
  alarm suppression, success cleanup and six failures capped at attempt five;
  the full Worker suite passes 170/170 with two opt-in load tests skipped;
  Wrangler dry-run bundles with every runtime gate closed; `git diff --check`
  passes.
- KANIT: `LOCAL_TEST`. Wrangler used `--dry-run`; no provider/TUS/NEAR call,
  upload, alarm traffic, Queue, testnet, deploy, secret, feature gate or runtime
  mutation occurred.
- FAZ KAPISI: UP-002 gains one complete retry policy but remains partial because
  provider/create retry metadata, creator cancel, terminal D1 archive/14-day
  cleanup and real staging evidence remain open.

### CHECKPOINT 68 — Phase 3 / creator-signed pre-provider cancellation

- DURUM: `PARTIAL_LOCAL / CANCELLED_TERMINAL / NON_REFUNDABLE / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Let a creator stop an authorized job before any provider resource is
  created without implying a refund or destructive provider cleanup.
- UYGULAMA:
  - control envelope v2 now includes `POST /v1/upload-cancellations`, signed by
    the exact unexpired creator session key bound to the final on-chain job;
  - only durable `AUTHORIZED` and `LEASED` jobs can become terminal `CANCELLED`;
    provider-create-pending and all later states fail with
    `upload_cancel_denied` before any state or provider mutation;
  - signed retries with a fresh nonce are idempotent while an exact nonce replay
    is rejected; an existing coordinator lease is released, terminal time and
    bounded state-transition logs are recorded, and every successful response
    explicitly returns `refundable: false`;
  - a fingerprint-verified restored authorized web draft exposes
    `Cancel job (no refund)` and clears its session key/draft only after bridge
    confirmation, then resets to a new-job draft.
- DOĞRULAMA: Worker cancellation tests pass 2/2; the full Worker suite passes
  172/172 with two opt-in load tests skipped; provider canaries pass 63/63.
  All web tests pass 127/127, browser-canary tests pass 5/5, focused ESLint and
  the closed-gate production build pass with all 15 pages generated. Worker
  TypeScript, protocol checker, `git diff --check` and Wrangler dry-run pass
  with every runtime flag closed.
- KANIT: `LOCAL_TEST`. All feature/runtime gates remain closed; no wallet,
  provider/TUS/NEAR call, upload, admission traffic, Queue, testnet, deploy,
  secret, fee refund or runtime mutation occurred.
- FAZ KAPISI: UP-002 now has an explicit creator cancellation event/call site
  and non-refundable terminal. It remains partial because post-provider
  cancellation is intentionally denied, provider/create retry metadata,
  guarded terminal D1 archive/14-day cleanup and real staging evidence remain
  open.

### CHECKPOINT 69 — Phase 3 / provider-create attempt policy

- DURUM: `PARTIAL_LOCAL / CREATE_RECONCILE_ONLY / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Give provider creation an explicit bounded retry policy without risking
  a second asset after an uncertain response.
- UYGULAMA:
  - `PROVIDER_CREATE_PENDING` persists exactly one attempt, its start time and
    `RECONCILE_ONLY` before the external create request;
  - success records `completedAtMs`; an uncertain/invalid/5xx result records
    bounded `provider_create_ambiguous` and `ambiguousAtMs`, while 402/429
    records `provider_admission_closed` and preserves the provider-wide circuit
    breaker;
  - a later signed upload-intent sees `CREATE_AMBIGUOUS`, returns fail-closed and
    performs no second provider create;
  - the policy is deliberately not exponential create retry: provider reads
    may retry safely, but an uncertain non-idempotent create requires inventory
    reconciliation first.
- DOĞRULAMA: Focused pending/success/ambiguous/429 regressions pass 3/3; Worker
  TypeScript and the full Worker suite pass 172/172 with two opt-in load tests
  skipped; provider canaries pass 63/63; Wrangler dry-run bundles with every
  runtime flag closed.
- KANIT: `LOCAL_TEST`. Canary provider behavior is mocked and Wrangler is
  `--dry-run`; no provider/TUS/NEAR call, asset, upload, admission traffic,
  Queue, testnet, deploy, secret, feature gate or runtime mutation occurred.
- FAZ KAPISI: UP-002 now has explicit create and finalize retry policies. It
  remains partial because guarded terminal D1 archive/14-day cleanup and real
  staging evidence remain open.

### CHECKPOINT 70 — Phase 3 / guarded terminal D1 archive boundary

- DURUM: `PARTIAL_LOCAL / ARCHIVE_SOURCE / CLEANUP_BLOCKED / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Make the accepted 14-day UploadJob boundary machine-readable without
  deleting state before its two external safety preconditions are proven.
- UYGULAMA:
  - `0003_upload_job_archives.sql` stores only bounded testnet summaries for
    `CANCELLED`, `UPLOAD_EXPIRED` and `PROVIDER_FAILED`; raw TUS endpoints,
    session keys, tokens and provider asset/project IDs are excluded, with the
    latter identities represented only by SHA-256;
  - terminal jobs persist `PENDING/RETRY/COMMITTED` archive metadata, a capped
    60–900-second retry deadline, exact archive hash and
    `cleanupEligibleAtMs = terminalAtMs + 14 days`;
  - D1 insertion is idempotent and requires exact readback before local
    `COMMITTED`; conflict or unavailable binding keeps the complete job and
    schedules bounded retry;
  - `UPLOAD_JOB_ARCHIVE_ENABLED=false` is the tracked default and no D1 binding
    is provisioned. No UploadJob cleanup or terminal `deleteAll()` source is
    added because real D1 commit and v1 playback independence remain unproven.
- DOĞRULAMA: Terminal archive/absence regressions pass 2/2; the full Worker
  suite passes 174/174 with two opt-in load tests skipped; provider canaries
  pass 63/63. D1 migration/read-model suites pass 18/18, Worker TypeScript,
  protocol checker, 87 release-contract tests, docs build, `git diff --check`
  and closed-gate Wrangler dry-run pass.
- KANIT: `LOCAL_TEST`. D1 is an in-memory SQLite/fake binding only and Wrangler
  is `--dry-run`; there is no real D1 commit/binding, provider/TUS/NEAR call,
  Queue, testnet mutation, deploy, secret, flag activation or deletion.
- FAZ KAPISI: Archive source and eligibility policy are local; terminal cleanup
  remains `BLOCKED` until both external preconditions are independently proven.
  This blocker does not prevent other non-destructive local work.

### CHECKPOINT 71 — Phase 2 / confirmed operator outbox minimization

- DURUM: `PARTIAL_LOCAL / CONFIRMED_RECORD_MINIMIZED / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Stop retaining retry-only signed transaction material after exact final
  chain state makes rebroadcast unnecessary.
- UYGULAMA:
  - all three operator confirmation paths use one terminal helper and stamp
    `confirmedAtMs` exactly once;
  - confirmed records retain schema, idempotency key, payload SHA-256, creation
    time and public transaction hash, while removing nonce, block hash and
    `signedTxBase64`;
  - crash-like ambiguous broadcast still reuses the exact persisted signed
    transaction until confirmation, so minimization does not weaken recovery;
  - concurrent jobs reserve distinct nonces before broadcast and the durable
    high-watermark remains monotonic; only their confirmed records are reduced.
- DOĞRULAMA: Focused crash/suspend/concurrency tests pass 3/3 and Worker
  TypeScript passes; the final combined Worker suite passes 176/176 with two
  opt-in load tests skipped.
- KANIT: `LOCAL_TEST`. RPC and chain behavior are mocked; no NEAR/provider/TUS
  call, broadcast, deploy, secret, feature flag or runtime mutation occurred.
- FAZ KAPISI: Operator confirmed-state growth and secret-adjacent retention are
  reduced locally. The accepted 90-day archive/delete policy remains partial
  because no archive sink, real commit or deletion gate exists.

### CHECKPOINT 72 — Phase 3 / heartbeat replay and control-nonce lifecycle

- DURUM: `PASS_LOCAL / HEARTBEAT_REPLAY_CLOSED / NONCE_RETENTION_BOUNDED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Apply the control protocol's replay rule to lease heartbeats and stop
  short-lived request nonces from growing indefinitely in each job object.
- UYGULAMA:
  - heartbeat job/lease validation, nonce conflict check and nonce write now run
    in one storage transaction before any coordinator heartbeat call;
  - upload-intent, heartbeat, cancellation and legacy playback-token nonce
    records store the exact signed request expiry; a replay before expiry fails
    with `device_nonce_replayed`;
  - job alarms remove expired nonce records in at most 128-record batches and
    schedule immediate continuation only when a full expired batch remains;
  - legacy numeric nonce records remain safe by treating their value as the
    acceptance time plus the existing five-minute maximum request window, and
    nonce cleanup never schedules later than an already earlier alarm.
- DOĞRULAMA: Heartbeat replay, current/legacy expiry and 129-record batch
  continuation regressions pass 3/3; Worker TypeScript and the full Worker suite
  pass 176/176 with two opt-in load tests skipped; provider canaries pass 63/63,
  closed-gate Wrangler dry-run, web tests 127/127/build, docs build, D1 tests
  18/18, protocol and `git diff --check` pass.
- KANIT: `LOCAL_TEST`. Coordinator/RPC/provider behavior is mocked; no network,
  provider/TUS/NEAR call, upload, Queue, testnet, deploy, secret, feature gate
  or runtime mutation occurred.
- FAZ KAPISI: Control-request replay and nonce retention are locally bounded.
  Full DO lifecycle remains partial because operator archive/delete and guarded
  UploadJob deletion still require separate evidence.

### CHECKPOINT 73 — Phase 2 / guarded operator outbox D1 archive boundary

- DURUM: `PARTIAL_LOCAL / ARCHIVE_SOURCE / DELETE_BLOCKED / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Make the accepted 90-day confirmed-operator boundary machine-readable
  without deleting audit state before real archive and retention evidence.
- UYGULAMA:
  - operator records now persist explicit bounded fields instead of spreading
    raw finalize/suspend input; exact method identity is retained and reuse of
    one idempotency key across methods fails with `outbox_conflict`;
  - confirmation removes legacy raw submission/publication data together with
    nonce, block hash and signed transaction bytes, then creates bounded
    `PENDING/RETRY/COMMITTED` archive metadata;
  - `0004_operator_outbox_archives.sql` stores only testnet contract/operator
    identity, key epoch, idempotency/method/payload hash, optional public
    transaction hash, timestamps, archive hash and
    `cleanupEligibleAtMs = confirmedAtMs + 90 days`;
  - D1 insertion is idempotent and requires exact readback. A cursor scans at
    most 32 records per alarm and failures use capped 60–900-second retry;
  - `OPERATOR_OUTBOX_ARCHIVE_ENABLED=false` is independently forced by tracked
    Wrangler, release metadata/artifacts and both deploy workflows. No D1
    binding is provisioned and no confirmed outbox delete source is added.
- DOĞRULAMA: New operator minimization/conflict/archive/unavailable regressions
  pass in the 49/49 finalize suite. Worker TypeScript and the full suite pass
  179/179 with two opt-in load tests skipped; provider canaries pass 63/63; D1
  suites pass 28/28; release/security tooling passes 93/93; protocol checker,
  docs build, `git diff --check` and closed-gate Wrangler dry-run pass.
- KANIT: `LOCAL_TEST`. D1 is in-memory/fake only and Wrangler is `--dry-run`;
  no real D1 commit/binding, RPC/NEAR/provider/TUS call, broadcast, deploy,
  secret, feature-gate activation, traffic or deletion occurred.
- FAZ KAPISI: Operator archive source and 90-day eligibility advance DO-001,
  but deletion remains `BLOCKED` until a real exact D1 commit, elapsed retention
  and no-active-audit-hold proof are independently available. UploadJob
  destructive cleanup remains separately blocked.

### CHECKPOINT 74 — Phase 0 / external pilot evidence packet boundary

- DURUM: `PASS_LOCAL_STATIC / PACKET_SPEC_READY / EXTERNAL_MUTATION_UNAPPROVED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Turn the accepted pilot values into an exact, secret-free evidence
  packet without treating those values as authorization to mutate Cloudflare,
  provider, deploy or runtime state.
- UYGULAMA:
  - the pilot order now includes D1 migrations `0001` through `0004` and keeps
    ingestion, API, Web derived read, UploadJob archive and operator archive
    independently closed at dark deployment;
  - D1 foundation, Queue foundation, dark deploy, read canary, Queue canary and
    paid upload canary are separate approval scopes; approval of one does not
    authorize another and ambiguous mutations are never automatically retried;
  - the packet requires secret-free scope, artifact, before-state, receipt,
    verification and rollback records bound by `SHA256SUMS`, exact commit SHA,
    actor/time and evidence class;
  - private keys, authorization/provider tokens, TUS URLs, signed transactions
    and raw media are explicitly forbidden from the packet.
- DOĞRULAMA: VitePress production build and `git diff --check` pass; migration,
  gate and packet sections are present in the rendered documentation source.
- KANIT: `LOCAL_STATIC` + docs build. No Cloudflare/D1/Queue/provider/NEAR call,
  resource creation, deploy, traffic, secret, runtime activation or deletion.
- FAZ KAPISI: The execution/evidence contract is ready, but all real `DEPLOY`,
  `PROVIDER` and `RUNTIME` acceptance evidence remains
  `EXTERNAL_EVIDENCE_REQUIRED` and each mutation still needs exact-scope
  approval.

### CHECKPOINT 75 — SUPERSEDED Phase 6 / DR-001 restore manifest foundation

- DURUM: `SUPERSEDED_BY_CHECKPOINT_94 / REMOVED_FROM_TARGET`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- TARİHSEL AMAÇ: This checkpoint once added a source-archive manifest contract
  without choosing or mutating an archive provider or key service.
- TARİHSEL UYGULAMA: The schema, golden vector and checker once bound archive
  identity to the finalized publication and rejected secret-adjacent fields.
- TARİHSEL DOĞRULAMA: Protocol checker, Node syntax, VitePress and diff checks
  passed at that checkpoint.
- SON DURUM: Checkpoint 94 supersedes this target and removes the manifest,
  backup-provider work and restore gate. This checkpoint is audit history only.

### CHECKPOINT 76 — Cross-phase / remaining gate reclassification

- DURUM: `NEEDS_APPROVAL / SAFE_LOCAL_QUEUE_EXHAUSTED / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Stop at the exact boundary between completed independent local work and
  actions that require a missing product decision, immutable SHA or external
  mutation authority.
- UYGULAMA:
  - the former source-archive decision was unresolved at this checkpoint; it is
    superseded by Checkpoint 94 and no archive contract remains in the target;
  - legacy/v2 mismatch and upload-resume success thresholds are explicit
    `DECISION_REQUIRED`, so local measurements cannot invent a pass condition;
  - RustSec normal-WASM enforcement is corrected as implemented locally, while
    current-branch CI/CodeQL execution remains `UNPROVEN` rather than local;
  - all remaining phase closures require at least one of: reviewed immutable
    commit/artifacts, D1/Queue/deploy/provider/runtime mutation, real retention
    elapsed, named operations owner, external audit or an undecided product
    threshold. Blocked cleanup source remains absent.
- DOĞRULAMA: Worker TypeScript and full suite pass 179/179 with two opt-in load
  tests skipped; protocol checker, VitePress build, `git diff --check` pass and
  staged file count is zero. The prior same-checkpoint release/security 93/93,
  D1 28/28, provider-canary 63/63 and closed-gate Wrangler dry-run evidence is
  unchanged.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. No CI, Cloudflare/D1/Queue/provider,
  deploy, runtime, traffic, NEAR, wallet, payment, archive or deletion mutation.
- FAZ KAPISI: The goal remains active and incomplete. The next dependency is a
  user-authorized explicit-path publish/review SHA; only after that may a
  separately approved testnet D1/Queue dark foundation run begin with every
  runtime gate closed.

### CHECKPOINT 77 — Phase 5 / source-only SLO contract

- DURUM: `PARTIAL_LOCAL / SLO_SOURCE_CONTRACT / DASHBOARD_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Make the report's pilot latency/error thresholds machine-readable and
  bind them to bounded source events without claiming a deployed dashboard or
  delivered alert.
- UYGULAMA:
  - upload-intent control emits provider-free latency and reuse/create outcome;
  - verified webhook enqueue emits Queue ACK latency only after `send()`
    succeeds, while stateless playback logs bounded internal-error codes;
  - the D1 read API emits route-category/status/latency without creator,
    publication or query values;
  - `observability/slo-policy.json` locks playback cache-hit p95 `<500 ms`,
    playback internal-error ratio `<0.005`, Queue ACK p95 `<500 ms`, upload
    intent control p95 `<750 ms` and Discover read p95 `<300 ms`;
  - all nine report alert classes declare their actual source state. Takedown
    token issuance, stuck operator nonce, contract storage reserve and RPC
    finality lag remain `MISSING_SIGNAL`; Queue backlog remains
    `EXTERNAL_METRIC_REQUIRED`.
- DOĞRULAMA: Worker TypeScript and full suite pass 180/180 with two opt-in load
  tests skipped; provider canaries pass 63/63; read-model/SLO tests pass 30/30;
  mandatory release/security/SLO tooling passes 94/94. Wrangler dry-run shows
  Bridge, UploadJob archive, operator archive, playback v2, webhook Queue and
  creator-fee flags false plus multi-asset mode off; no D1 or Queue binding is
  present.
- KANIT: `LOCAL_TEST` only. No metrics sink, aggregation, dashboard,
  notification route, delivered alert, Cloudflare/D1/Queue/provider/NEAR call,
  deploy, traffic, secret or runtime activation occurred.
- FAZ KAPISI: SRE-001 advances from generic telemetry to an executable source
  contract. Runtime SLO results and alert delivery remain
  `EXTERNAL_EVIDENCE_REQUIRED`; absent source signals remain explicit rather
  than being inferred from local tests.

### CHECKPOINT 78 — Phase 5 / takedown and operator-nonce alert sources

- DURUM: `PARTIAL_LOCAL / TAKEDOWN_SOURCE_READY / NONCE_SOURCE_PARTIAL`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Close two missing alert-source gaps without exposing buyer,
  publication, transaction or nonce identity and without inventing an operator
  stuck-age threshold.
- UYGULAMA:
  - a token request against a final-chain `TAKEDOWN` publication emits
    `takedown_playback_token_attempted` for both device-session-certificate and
    legacy-session-grant paths; the client still receives only the generic
    `playback_denied` response;
  - an unconfirmed operator broadcast with a reserved nonce emits
    `operator_nonce_pending_observed` with only method, bounded state and age;
    nonce, transaction hash, idempotency key, job and publication are absent;
  - the policy marks takedown attempts `SOURCE_READY` and operator nonce
    `SOURCE_PARTIAL`; the latter explicitly requires an approved stuck-age
    threshold plus deployed aggregation.
- DOĞRULAMA: Focused playback/finalize suites pass 79/79 with two opt-in tests
  skipped; Worker TypeScript and full suite pass 180/180 with the same two
  skips; mandatory release/security/SLO tooling passes 94/94 and
  `git diff --check` passes.
- KANIT: `LOCAL_TEST`. RPC, publication, provider and Durable Object behavior
  are mocked. No log sink, dashboard, alert delivery, Cloudflare/D1/Queue,
  provider/NEAR call, deploy, traffic, secret or runtime activation occurred.
- FAZ KAPISI: The two source gaps advance, but neither proves a delivered
  production alert. Operator nonce alert activation remains `DECISION_REQUIRED`
  for its age threshold and `EXTERNAL_EVIDENCE_REQUIRED` for aggregation and
  delivery.

### CHECKPOINT 79 — Phase 0/5 / Market storage reserve visibility

- DURUM: `PARTIAL_LOCAL / RESERVE_SOURCE / ALERT_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Remove the source-level contract-reserve visibility gap without adding
  persistent state or claiming that a local view is an active mainnet alarm.
- UYGULAMA:
  - Market exposes `get_storage_reserve_status` with storage bytes, byte cost,
    storage stake, configured operational reserve, account balance, reserve
    headroom/runway and a `reserve_covered` result;
  - the view and `withdraw_platform_near` use one shared calculation, so the
    monitored boundary cannot drift from the enforced withdrawal guard;
  - no contract state/layout changes, new threshold, poller or network call are
    introduced;
  - the source-only SLO policy moves contract reserve from `MISSING_SIGNAL` to
    `SOURCE_PARTIAL` and names deployed polling, aggregation and alert delivery
    as missing.
- DOĞRULAMA: Market rustfmt/clippy pass; unit tests pass 7/7, exact paid-media
  tests 21/21 and sandbox 1/1. Both contracts build ABI; the exact checker
  passes with Market 35 and Access 26 methods. SLO/release/security tooling
  passes 94/94.
- KANIT: `LOCAL_TEST` + generated local ABI. The sandbox is local NEAR
  simulation; no testnet/mainnet view, contract deploy, account funding,
  polling, dashboard, notification route, runtime flag or external mutation.
- FAZ KAPISI: Contract reserve visibility advances from missing to partial.
  The report's active reserve alarm and mainnet No-Go closure remain
  `EXTERNAL_EVIDENCE_REQUIRED` until the reviewed artifact is deployed and the
  exact source is polled into a delivered alert.

### CHECKPOINT 80 — Phase 0 / release artifact byte evidence reclassification

- DURUM: `PASS_LOCAL_SOURCE / ARTIFACT_RUN_UNPROVEN / COLD_START_MISSING`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Reconcile the Phase 0 metric matrix with the release source that already
  records artifact size, without presenting fixture bytes as a real candidate
  artifact measurement.
- UYGULAMA:
  - the existing exact-SHA manifest records SHA-256 plus byte count for Preview
    Web, Production Web, Bridge, both configs and both runtime lockfiles;
  - verification recomputes every byte count and hash from regular files and
    rejects any mismatch;
  - no duplicate metric script or dependency is added. Cold-start remains a
    separate missing runtime metric.
- DOĞRULAMA: Mandatory release/security/SLO tooling passes 94/94, including
  valid manifest generation/verification and tamper rejection; the tracked
  release workflow invokes the same source for exact-SHA artifacts.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. Test bundle sizes are fixture values;
  there is no current-branch GitHub artifact, CI run, attestation, deploy or
  cold-start observation.
- FAZ KAPISI: Build artifact size advances from missing to source-ready. Phase
  0 metrics remain partial because current artifact/runtime aggregation, DO
  storage, Queue depth and cold start still require external platform evidence.

### CHECKPOINT 81 — Phase 0/5 / read-only NEAR finality-lag source

- DURUM: `PARTIAL_LOCAL / READ_ONLY_PROBE / ALERT_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Add a bounded RPC-finality source without increasing playback, upload,
  health or payment hot-path calls and without treating a mocked probe as a
  delivered alert.
- UYGULAMA:
  - `runNearFinalityProbe` performs exactly two sequential, five-second-bounded
    read-only JSON-RPC `block` calls: `final` then `optimistic`;
  - it validates JSON-RPC identity and safe integer heights, rejects malformed
    or inverted views and emits only observation time, decimal heights, lag and
    call count;
  - endpoint URL, path/query capability and upstream error payload are absent
    from receipts/errors;
  - no Worker route, health dependency, feature flag, cron or threshold is
    introduced. The policy moves RPC finality from `MISSING_SIGNAL` to
    `SOURCE_PARTIAL`.
- DOĞRULAMA: Focused finality tests pass 5/5; the complete mocked
  provider/canary suite passes 68/68. Worker TypeScript and full suite pass
  180/180 with two opt-in load tests skipped; mandatory
  release/security/SLO tooling passes 94/94. Protocol and exact ABI checks,
  docs build, `git diff --check` and closed-gate Wrangler dry-run pass; staged
  file count is zero.
- KANIT: `LOCAL_TEST`. Both block responses are mocked; no live RPC read,
  provider/NEAR mutation, deploy, schedule, dashboard, alert delivery, secret
  or runtime activation occurred.
- FAZ KAPISI: RPC finality-lag source advances from missing to partial. Alarm
  activation remains `DECISION_REQUIRED` for the lag threshold and
  `EXTERNAL_EVIDENCE_REQUIRED` for scheduled collection and delivered alerts.

### CHECKPOINT 82 — Phase 5 / contract normal-WASM SPDX source

- DURUM: `PARTIAL_LOCAL / CONTRACT_SBOM_SOURCE / CI_ARTIFACT_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Reuse the enforced production-WASM package boundary to produce bounded
  contract inventories without claiming a local file as a CI/release
  attestation.
- UYGULAMA:
  - a standard-library-only generator joins each contract's exact
    `cargo tree --target wasm32-unknown-unknown --edges normal` package list
    with full locked Cargo metadata and emits deterministic SPDX 2.3 JSON;
  - malformed/missing/ambiguous packages fail closed, duplicates collapse and
    the workspace root must be present;
  - output contains package names, versions, declared licenses, Cargo purls and
    a flattened root dependency inventory, but no local source path;
  - the mandatory Rust WASM audit job creates both SBOMs and retains the
    exact-SHA `contract-sbom-<sha>` artifact for 30 days;
  - contract files are not added to the Cloudflare release artifact and no
    contract SBOM attestation claim is introduced.
- DOĞRULAMA: Focused generator/security/RustSec tests pass 8/8. Real local
  locked metadata and normal-WASM graphs generate 41-package SPDX documents
  for both Market and Access; neither contains `near-workspaces`, `tokio`, a
  `file://` source nor a local user/runner path. Mandatory
  release/security/SLO tooling passes 97/97; docs build and `git diff --check`
  pass, and staged file count is zero.
- KANIT: `LOCAL_TEST` + generated local SPDX. No GitHub CI run/artifact,
  attestation, contract build/deploy, testnet/mainnet mutation, provider call,
  runtime flag or secret change occurred.
- FAZ KAPISI: Contract SBOM advances from missing to source-ready. Current-SHA
  CI artifact retention and any signed contract attestation remain
  `EXTERNAL_EVIDENCE_REQUIRED`; mainnet release stays closed.

### CHECKPOINT 83 — Phase 5 / bounded RPC and provider fault degradation

- DURUM: `PARTIAL_LOCAL / RPC_CIRCUIT_PROVEN / PROVIDER_BREAKER_SOURCE`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Prove and complete the report's bounded 429/5xx/timeout degradation
  source without adding a chaos framework, another service or automatic
  provider mutation.
- UYGULAMA:
  - the existing NEAR read proxy circuit remains three transient failures and
    30 seconds; a deterministic regression now proves that an open circuit
    skips the failed upstream, while broadcast remains single-upstream and is
    never replayed;
  - Livepeer asset/TUS create 5xx and transport timeout are normalized to the
    bounded `provider_unavailable` class. The job persists exactly one create
    attempt with `RECONCILE_ONLY` and remains `CREATE_AMBIGUOUS`;
  - one transient provider failure leaves unrelated creators open. Two
    independent failures inside 60 seconds close the shared admission DO with
    bounded count/timestamps; existing 402/429 immediate closure is unchanged;
  - the circuit accepts no budget-window shortcut. Only the existing
    operator-authenticated `INVENTORY_RECONCILED` evidence reopens it and clears
    the reconciled ambiguous reservations;
  - no dependency, config value, route, feature flag, automatic retry or state
    schema migration is added; the new admission field is optional and bounded.
- DOĞRULAMA: Focused NEAR route tests pass 15/15 and admission/transport tests
  pass 65/65. Full Web tests pass 128/128; full Worker tests pass 182/182 with
  two opt-in load tests skipped; mocked provider/canary tests pass 68/68.
  Worker TypeScript, Web lint and the closed-env 15-page Web build pass.
  Mandatory release/security/SLO tooling passes 97/97; docs build and
  `git diff --check` pass. Wrangler dry-run is 712.57 KiB / gzip 150.42 KiB
  with upload, archive, playback-v2, Queue, creator-fee and payment gates all
  false/off; staged file count is zero.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. Faults and provider results are mocked;
  Wrangler is `--dry-run`. No live RPC/provider call, asset, upload, Queue,
  D1, wallet, contract/testnet/mainnet mutation, deploy, secret, runtime flag
  or traffic change occurred.
- FAZ KAPISI: Local bounded degradation advances materially but remains
  `PARTIAL`. Real provider/staging injection, mixed-version deployment, delayed
  DO alarm, Queue redelivery and D1-unavailable chaos evidence are still
  `EXTERNAL_EVIDENCE_REQUIRED`; mainnet activation remains closed.

### CHECKPOINT 84 — Phase 5 / local chaos matrix and bounded D1 outage

- DURUM: `PARTIAL_LOCAL / CHAOS_SOURCE_MATRIX / EXTERNAL_RUN_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Complete deterministic source coverage for the report's eight chaos
  scenarios without creating a second test framework or presenting mocks as a
  provider/platform chaos run.
- UYGULAMA:
  - `docs/testing.md` maps all eight scenarios to the existing executable
    regressions: NEAR failure/circuit, Livepeer 429/5xx, webhook order,
    Queue redelivery, ambiguous broadcast, mixed version, delayed alarm and
    temporary D1/read-model outage;
  - the D1 read API converts a thrown database error to HTTP 503 with only
    `read_model_unavailable`; its completion event contains route/status/
    latency and no raw database error;
  - scheduled ingestion now rethrows the same bounded code it logs. Only an
    explicit allowlist of source-owned ingestion codes may pass through;
    arbitrary snake-case provider/database text becomes
    `read_model_ingestion_failed`;
  - the existing Web behavior falls back to canonical NEAR only on the initial
    derived request and never mixes a NEAR page into an established D1 cursor;
  - no dependency, runtime binding, retry loop, feature flag or external
    resource is added.
- DOĞRULAMA: Focused D1 API/scheduler tests pass 22/22; the exact read-model
  suite passes 31/31 and Web tests pass 128/128. The current Worker suite passes
  182/182 with two opt-in load tests skipped; mandatory release/security/SLO
  tooling passes 97/97. Docs build, `git diff --check` and staged-file count
  verification pass.
- KANIT: `LOCAL_TEST`. D1 exceptions, Queue delivery, provider responses,
  alarm timing and version mismatch are mocked. No D1/Queue binding, live
  provider/RPC call, deployment, traffic, secret, feature flag, contract or
  testnet/mainnet mutation occurred.
- FAZ KAPISI: All eight report scenarios have deterministic source-level
  degradation evidence. Phase 5 remains `PARTIAL` until the same matrix is run
  against approved staging/provider/Cloudflare resources with receipts and
  rollback evidence; mainnet activation remains closed.

### CHECKPOINT 85 — Phase 5–6 / source-only incident ownership

- DURUM: `PARTIAL_LOCAL / ROLE_OWNER_BOUND / RUNTIME_RESPONSE_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Bind every critical alert class to one primary role and one first safe
  action without inventing a named on-call, delivered route or runtime-ready
  kill switch.
- UYGULAMA:
  - `observability/slo-policy.json` gives all nine alert classes an allowlisted
    Platform/SRE, Security or Contract operations owner role and a stable
    runbook action;
  - the pilot runbook explains each first step, keeps external mutations behind
    separate approval and preserves the non-refundable boundary;
  - incident execution remains `MANUAL_APPROVAL_REQUIRED`; named on-call,
    notification delivery and drill evidence remain
    `EXTERNAL_EVIDENCE_REQUIRED`;
  - Queue backlog records the missing independent new-upload stop that preserves
    recovery. Provider exposure and elevated playback errors record that the v2
    gate is not an all-issuance stop and the global Bridge gate does not preserve
    independent upload recovery;
  - no route, dependency, secret, notification integration, feature flag or
    runtime control is added.
- DOĞRULAMA: The focused SLO/runbook test passes 1/1; mandatory
  release/security/SLO tooling passes 97/97. Docs build and
  `git diff --check` pass; staged file count remains zero.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. No named human accepted ownership; no
  alert was delivered or drilled. No Cloudflare/D1/Queue/provider/NEAR call,
  deploy, traffic, secret, runtime flag, contract or testnet/mainnet mutation
  occurred.
- FAZ KAPISI: Source incident coverage now includes all critical role/action
  bindings, but Phase 5 and Phase 6 remain `PARTIAL`. Runtime readiness still
  requires named people, delivered routes, the missing domain controls and
  approved drill receipts; mainnet activation remains closed.

### CHECKPOINT 86 — Phase 5–6 / independent upload and playback kill switches

- DURUM: `PARTIAL_LOCAL / DOMAIN_CONTROLS_SOURCE_READY / RUNTIME_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Close the two source control gaps found by the incident audit without
  using the global Bridge switch, disabling upload recovery or opening any
  runtime gate.
- UYGULAMA:
  - `LIVEPEER_NEW_UPLOADS_ENABLED` is checked inside the existing UploadJob
    transaction: false rejects an unrecorded intent before Job persistence or
    provider create, while a recorded Job still returns the same TUS resource;
  - preflight also fails closed when new uploads are disabled. Signed heartbeat,
    existing intent recovery, cancellation and reconciliation do not depend on
    the new gate;
  - `LIVEPEER_PLAYBACK_ISSUANCE_ENABLED` guards both legacy v1 and stateless v2
    token routes before NEAR/provider reads. V2 keeps its separate version gate;
  - health now reports `newUploadReady` and includes the all-issuance gate in
    legacy/v2 playback readiness;
  - Wrangler defaults, release metadata, generated Bridge config and both
    guarded workflows force both new controls to false. The SLO policy/runbook
    bind the Queue and playback incident actions to those exact controls;
  - no service, route, dependency, secret, state schema or external resource is
    added.
- DOĞRULAMA: Focused upload/playback tests pass 98/98 with two opt-in tests
  skipped; Worker TypeScript passes. Full Worker tests pass 185/185 with the
  same two skips; mocked provider canaries pass 68/68. Mandatory
  release/security/SLO tooling passes 99/99 and docs build passes. Wrangler
  4.90.0 dry-run packages 713.31 KiB / gzip 150.52 KiB and reports Bridge,
  new-upload, playback-issuance, playback-v2, Queue, archive and creator-fee
  gates false plus multi-asset mode off.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`; Wrangler is `--dry-run`. No CI,
  Cloudflare/D1/Queue/provider/RPC/wallet/contract call, deploy, traffic,
  secret, runtime flag, payment or testnet/mainnet mutation occurred.
- FAZ KAPISI: The missing source controls are closed, but incident readiness and
  Phase 5–6 remain `PARTIAL` until exact deployed config, rollback smoke,
  named on-call, delivered alerts and approved drill receipts prove the same
  behavior externally. Mainnet activation remains closed.

### CHECKPOINT 87 — Phase 5–6 / provider and operator mutation controls

- DURUM: `PARTIAL_LOCAL / FIVE_OF_SIX_SOURCE_READY / PURCHASE_CONTROL_MISSING`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Separate provider create and NEAR operator mutation from the global
  Bridge gate, then audit all six report-required domain controls without
  silently adding a contract state migration.
- UYGULAMA:
  - `LIVEPEER_PROVIDER_MUTATIONS_ENABLED=false` rejects provider create before
    admission lease or provider use. The authorized Job remains recoverable;
    an existing TUS intent and provider read/reconcile paths remain available;
  - `LIVEPEER_OPERATOR_MUTATIONS_ENABLED=false` permits final-chain/outbox
    reconciliation but stops access-key reservation, signing and broadcast.
    A pending outbox resumes from the same idempotency record after re-enable;
  - health reports provider and operator mutation readiness separately, and new
    upload readiness also requires the provider-mutation gate;
  - Wrangler defaults, release metadata, generated Bridge config and guarded
    Preview/Production workflows force both controls false;
  - the machine-readable policy and pilot runbook inventory playback issuance,
    new purchases, new uploads, provider mutation, multi-asset quote and
    contract operator operations. Five are source-ready;
  - global new purchases remains `MISSING_CONTRACT_CONTROL`: publication-level
    `suspend_livepeer_sales` is not a global purchase gate. No contract field,
    ABI change, migration or authority decision is invented in this slice.
- DOĞRULAMA: Focused upload/operator tests pass 117/117 and Worker TypeScript
  passes. Full Worker tests pass 187/187 with two opt-in load tests skipped;
  mocked provider canaries pass 68/68. Mandatory release/security/SLO tooling
  passes 101/101 and docs build passes. Wrangler 4.90.0 dry-run packages
  713.93 KiB / gzip 150.63 KiB and reports new-upload, playback-issuance,
  provider-mutation and operator-mutation false plus multi-asset mode off.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`; Wrangler is `--dry-run`. No CI,
  Cloudflare/D1/Queue/provider/RPC/wallet/contract call, deploy, traffic,
  secret, runtime flag, payment or testnet/mainnet mutation occurred.
- FAZ KAPISI: Worker domain controls advance, but the six-control requirement
  remains `PARTIAL` until a reviewed global purchase authority/state/event
  contract and later deployed rollback drill exist. Mainnet activation stays
  closed.

### CHECKPOINT 88 — Phase 5–6 / global new-purchase contract control

- DURUM: `PARTIAL_LOCAL / SIX_OF_SIX_SOURCE_READY / RUNTIME_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Close the final report-required domain-control gap with the accepted
  guardian-pause/admin-unpause authority model, without changing Market v2's
  serialized state layout or authorizing a testnet deployment.
- UYGULAMA:
  - guardian-only `pause_new_purchases` writes one namespaced raw storage key;
    admin-only `unpause_new_purchases` removes it. Repeated calls are
    idempotent and do not emit duplicate events;
  - the control is intentionally outside `Contract`: serialized state bytes
    are identical immediately before and after both transitions, so the
    existing Borsh layout and `state_version=2` remain unchanged;
  - a paused ticket transfer returns the full FT amount before ledger or
    entitlement mutation. Existing entitlements/playback and creator job/upload
    creation remain available;
  - `new_purchases_paused` and `new_purchases_unpaused` carry the common
    NEP-297 context and are accepted by the Neardata catalog, deterministic
    rebuild and D1 governance audit projection;
  - `get_governance_state.new_purchases_paused`, the exact ABI checker, SLO
    policy, method catalog and pilot runbook expose the same source contract.
    All six domain controls are now source-ready;
  - no dependency, contract migration entrypoint, D1 schema or runtime flag is
    added.
- DOĞRULAMA: Market lib 7/7, paid-media 22/22 and sandbox 1/1 pass; Rust fmt
  and clippy `-D warnings` pass. Read-model tests pass 34/34 and mandatory
  release/security/SLO tooling passes 101/101. Local cargo-near 0.18.0 builds a
  307,163-byte WASM with SHA-256
  `d2f7a9b04bf215bbe5138523fe1e049a2707cc01a2bd35b52a657aa60e646833`;
  exact ABI check passes with market=37/access=26 and the protocol checker
  passes. Docs build and `git diff --check` pass.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`; the local cargo-near version is not the
  CI-pinned 0.17.0 toolchain. No CI, RPC, wallet, contract call, D1/Queue,
  Cloudflare/provider, deploy, traffic, payment, runtime flag or
  testnet/mainnet mutation occurred.
- FAZ KAPISI: The six-control source requirement is complete, but incident
  readiness and Phase 5–6 remain `PARTIAL` until the reviewed artifact is
  deployed under separate approval and exact contract state/event receipts,
  rollback drill, named on-call and delivered-alert evidence exist. Mainnet
  general access remains blocked on multisig, timelock, audit and the remaining
  Phase 6 gates.

### CHECKPOINT 89 — Phase 5 / SRE-001 Queue delivery lag signal

- DURUM: `PARTIAL_LOCAL / QUEUE_LAG_SOURCE_READY / DEPTH_AND_ALERT_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Produce the report-required Queue latency source without inventing a
  backlog threshold, provisioning a Queue or logging job/provider identity.
- UYGULAMA:
  - verified webhook Queue messages carry a decimal `enqueued_at_ms` inside the
    already bounded message schema;
  - every valid job-object ACK or retry emits
    `webhook_queue_delivery_completed` with only `outcome` and non-negative
    `queueLagMs`. Poison messages keep their bounded rejection event;
  - SLO policy moves Queue backlog from a wholly missing external metric to
    `SOURCE_PARTIAL`. Queue depth, deployed aggregation, an approved lag
    threshold and delivered alert remain explicit external/decision gaps;
  - the pilot runbook binds the existing close-new-upload action to both this
    lag event and the real Queue/DLQ reads. Recovery paths remain open;
  - no dependency, binding, route, state object or runtime flag is added.
- BASELINE_FAILURE: The focused regression failed before implementation:
  producer messages omitted `enqueued_at_ms`, and valid ACK/retry processing
  emitted no delivery-lag event (`LOCAL_TEST` red).
- DOĞRULAMA: Focused Queue tests pass 50/50 and Worker TypeScript passes. Full
  Worker tests pass 187/187 with two opt-in load tests skipped; mocked provider
  canaries pass 68/68. Mandatory release/security/SLO tooling passes 101/101
  and docs build passes. Wrangler 4.90.0 dry-run packages 714.50 KiB / gzip
  150.77 KiB and reports new-upload, playback-issuance, provider-mutation,
  operator-mutation, Queue and archive controls false plus multi-asset mode
  off.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`; Wrangler is `--dry-run`. No CI,
  Cloudflare Queue/DLQ/D1, provider/RPC, deploy, traffic, runtime flag, payment
  or testnet/mainnet mutation occurred.
- FAZ KAPISI: Queue delivery lag is source-ready, but Phase 5 SLO/incident
  readiness remains `PARTIAL` until real Queue depth and delivery timing are
  aggregated against an approved threshold and a named on-call receives and
  drills the alert.

### CHECKPOINT 90 — Phase 5 / SRE-001 payment lifecycle telemetry

- DURUM: `PARTIAL_LOCAL / PAYMENT_ROUTE_SIGNAL_READY / AGGREGATION_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Add the report-required payment quote/status source while keeping
  multi-asset quote creation off and all payment identities out of logs.
- UYGULAMA:
  - the existing payment route wrapper emits `payment_route_completed` with
    only allowlisted operation, HTTP code and non-negative latency;
  - failures use the same bounded shape plus the existing stable error code;
  - a validated 1Click status emits `payment_status_observed` with only the
    allowlisted status enum. Deposit/refund addresses, account, quote payload,
    API key and provider response details are absent;
  - no route, dependency, payment state, rate limit, custody behavior or
    runtime flag is changed. Quote mode remains `off` in guarded release
    configuration.
- BASELINE_FAILURE: The focused success test observed no quote/status lifecycle
  event before implementation (`LOCAL_TEST` red).
- DOĞRULAMA: Payment tests pass 22/22 and Worker TypeScript passes. Full Worker
  tests pass 187/187 with two opt-in load tests skipped; mocked provider
  canaries pass 68/68. Docs build and `git diff --check` pass; staged file count
  remains zero.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. No CI, 1Click/provider/RPC, wallet,
  payment, deploy, traffic, runtime flag or testnet/mainnet mutation occurred.
- FAZ KAPISI: Payment quote/status/completion state now has bounded source
  events, but Phase 5 remains `PARTIAL` until deployed aggregation, actual
  status observations, invoice/usage reconciliation and approved alert/support
  evidence exist.

### CHECKPOINT 91 — Phase 3 / WEB-001 component network boundary

- DURUM: `PASS_LOCAL / USE_CASE_NETWORK_BOUNDARY / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Complete the report's local frontend network boundary without adding a
  second state machine, hook or dependency.
- UYGULAMA:
  - the wallet-return finality retry moved unchanged from the React component
    to the existing publication use-case service, preserving the five bounded
    attempts plus exact creator/upload-key match;
  - the Query job/publication read composition moved to the same service, so
    the component owns UI state and invokes use cases but contains no direct
    network primitive or retry timer;
  - visible publication polling now backs off from five to 10, 20 and at most
    30 seconds as observations accumulate; the existing Query policy still
    pauses the interval while hidden and refreshes on focus;
  - the existing versioned stage, predecessor policy and fingerprinted
    recovery remain unchanged.
- BASELINE_FAILURE: Focused regressions failed before implementation because
  both new use-case exports and the bounded poll-interval function were absent
  (`LOCAL_TEST` red).
- DOĞRULAMA: Publication/upload/state suites pass 36/36; the full Web suite
  passes 131/131, full ESLint passes, and the closed-gate production build
  generates all 15 pages. The docs production build also passes.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. No browser, wallet, RPC, provider/TUS,
  upload, testnet, deploy, traffic, secret or runtime-gate mutation occurred.
- FAZ KAPISI: WEB-001 source requirements now pass locally. Phase 3 remains
  open on real browser reload/staging evidence, external Queue/provider proof
  and guarded terminal cleanup.

### CHECKPOINT 92 — Phase 2 / legacy-v2 shadow authorization source

- DURUM: `PARTIAL_LOCAL / SHADOW_SOURCE_READY / THRESHOLD_UNDECIDED / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- AMAÇ: Implement the report's shadow-decision stage without changing a legacy
  playback response, minting a second token or opening a runtime gate.
- UYGULAMA:
  - the Web's independent default-off flag optionally embeds the exact signed
    five-field v2 request as `shadow_v2` inside a legacy request; proof creation
    failure is ignored so legacy playback remains authoritative;
  - the Worker accepts only the legacy root shape plus that one optional field,
    strips it before Durable Object forwarding and fixes the legacy response;
  - only after that response exists, `waitUntil` reuses the existing device,
    final-chain entitlement and provider-policy decision path without invoking
    JWT signing or any Durable Object write;
  - `playback_shadow_authorization_compared` contains only bounded
    ALLOW/DENY/UNAVAILABLE decisions, stable reason codes and `decisionMatch`;
    account, publication, playback ID, certificate, token and payload are absent;
  - `NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2` and
    `LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED` both default false and are not part of
    guarded Preview/Production release metadata.
- BASELINE_FAILURE: Web regressions found no shadow flag/payload, while the
  Worker rejected the optional field as `invalid_control_request` and returned
  HTTP 400 instead of the unchanged legacy HTTP 200 (`LOCAL_TEST` red).
- DOĞRULAMA: Web constants/legacy/v2 suites pass 20/20; the full Web suite
  passes 132/132, lint, TypeScript and the closed-gate production build pass.
  Worker legacy/v2/route suites pass 100 with two opt-in load tests skipped;
  the full Worker suite passes 188 with the same two opt-in skips, TypeScript
  passes, provider canaries pass 68/68 and the paid-media protocol checker
  passes. Mandatory release/security tests pass 101/101, the docs build passes,
  and Wrangler dry-run reports 717.77 KiB / gzip 151.67 KiB with every runtime
  gate, including the new shadow gate, closed.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. No browser wallet, NEAR/Livepeer call,
  JWT, DO mutation, deploy, traffic, secret, flag change or testnet/mainnet
  mutation occurred.
- FAZ KAPISI: Shadow execution moves from missing to source-ready, but the
  Phase 2 mismatch gate remains `PARTIAL`: the accepted threshold, deployed
  sample set, aggregation and pass evidence are still absent.

### CHECKPOINT 93 — Cross-phase / accepted values and Durable Object ceiling

- DURUM: `PARTIAL_LOCAL / DECISIONS_ACCEPTED / DO_CAP_SOURCE_READY / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- YETKİ: The user accepted the then-current architecture values. Checkpoint 94
  later supersedes the archive value; no Cloudflare, contract, mainnet,
  provider, payment or traffic mutation was authorized here.
- KARAR:
  - superseded by Checkpoint 94: the pilot archive was then recorded as a
    platform-managed encrypted R2 with separated key custody;
  - legacy/v2 authorization mismatch ratio is exactly 0;
  - same-resource upload resume is at least 99%, with second payment and second
    provider-asset counts both exactly 0;
  - each Durable Object holds at most 256 persistent records;
  - mainnet governance is 2-of-3 multisig plus a 24-hour timelock for unfreeze,
    authority rotation and privilege expansion; guardian pause/freeze remains
    immediate and privilege-reducing;
  - mainnet uses a fresh contract ID plus independently audited snapshot/import
    and invariant verification, never an in-place overwrite.
- UYGULAMA:
  - `observability/slo-policy.json` records the exact zero, 99% and 256 gates
    and preserves deployed samples/metrics as external evidence;
  - one shared Durable Object capacity guard counts existing and intended new
    keys in the same storage transaction, rejects record 257 with bounded
    `durable_object_record_limit`, and leaves existing-key replay/update usable
    at the ceiling;
  - job nonce/webhook/outbox, admission audit, operator outbox/scan, creator-fee
    and payment-rate record creation use the guard; singleton paths are also
    checked when first created;
  - architecture, protocol and pilot runbook text recorded the then-current
    values without provisioning external resources or opening runtime gates.
- DOĞRULAMA: Focused Worker index/playback/finalize/payment suites pass 158/158;
  the full Worker suite passes 190 with two opt-in load tests skipped and
  TypeScript passes. Provider canaries pass 68/68, mandatory release/security
  tests pass 101/101, the protocol checker and docs build pass. Wrangler
  dry-run reports 720.05 KiB / gzip 152.15 KiB with every runtime gate closed.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. The previously funded testnet role
  accounts were not recreated or funded again. No wallet, NEAR, external backup,
  D1/Queue, provider, deploy, secret, traffic, payment, deletion or flag
  mutation occurred.
- FAZ KAPISI: DEC-008 through DEC-011 and the numeric decision portions of
  PLAY-003/UP-003/DO-001 are resolved. Their phase exits remain `PARTIAL` or
  `EXTERNAL_EVIDENCE_REQUIRED` until deployed samples, storage metrics,
  provider-loss handling, mainnet governance/migration implementation, audit
  and drills exist.

### CHECKPOINT 94 — Remove platform source-media backup from the target

- DURUM: `DECISION_APPLIED_LOCAL / D1_RETAINED / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@4fed6b4`
- YETKİ: The user explicitly rejected a platform R2/KMS backup and explicitly
  kept D1.
- KARAR:
  - YouTick does not keep a platform source-media backup;
  - creators retain their source files;
  - provider asset loss suspends sales/playback and requires creator re-upload
    with a new publication or takedown;
  - D1 remains the rebuildable metadata read model and is not media storage.
- UYGULAMA:
  - the active architecture plan and foundation remove source-archive,
    secondary-provider and restore gates;
  - the paid-media protocol removes the source-archive manifest schema, golden
    vector and checker logic;
  - the testnet runbook records creator source retention without changing D1,
    Queue or Durable Object metadata-retention work;
  - Checkpoints 75 and 93 remain historical evidence but no longer define the
    active target.
- KANIT: `LOCAL_STATIC` + protocol checker. No D1, Cloudflare, provider,
  contract, deploy, traffic, secret, payment, deletion or runtime mutation.

### CHECKPOINT 95 — Keep the device-session secret out of browser storage

- DURUM: `CODEQL_FINDING_FIXED_LOCAL / REVALIDATION_PENDING / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@73a221a`
- BULGU: GitHub CodeQL reported high-severity clear-text storage of the
  device-session authority in `sessionStorage`.
- UYGULAMA:
  - the device session is kept only in module memory;
  - explicit disconnect and page reload clear the authority;
  - no encryption key or replacement secret is added to browser storage;
  - protocol and active architecture evidence now match this boundary.
- DOĞRULAMA: The focused web test proves same-page reuse without any
  `sessionStorage`/`localStorage` write and proves module reload loses the
  session. Full web and CodeQL revalidation are pending the follow-up SHA.
- KANIT: `LOCAL_STATIC`. No wallet, provider, contract, D1, deploy, traffic,
  secret or runtime mutation.

### CHECKPOINT 96 — Remove polynomial log-redaction expressions

- DURUM: `CODEQL_FINDING_FIXED_LOCAL / REVALIDATION_PENDING / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@44da556`
- BULGU: GitHub CodeQL reported high-severity polynomial regular-expression
  behavior while sanitizing attacker-controlled log field names.
- UYGULAMA:
  - ambiguous `upload.*url`, `signed.*transaction` and `private.*key`
    expressions are removed;
  - bounded, linear substring checks preserve and slightly broaden redaction;
  - the regression test includes a long repeated field name and proves its
    value is still redacted.
- DOĞRULAMA: Focused/full Worker and CodeQL revalidation are pending the
  follow-up SHA.
- KANIT: `LOCAL_STATIC`. No provider, contract, D1, deploy, traffic, secret or
  runtime mutation.

### CHECKPOINT 97 — Phase 1 / exact-SHA CI and CodeQL closure

- DURUM: `PARTIAL_CI / CODE_SCANNING_CLEAR / REQUIRED_CODEQL_MISSING / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@0f65b84`
- AMAÇ: Close the pending revalidation for Checkpoints 95 and 96 without
  treating CI as deployment or runtime evidence.
- DOĞRULAMA:
  - GitHub Actions CI run `31334340394` passed all required jobs for PR head
    `0f65b84218e88181ffc6679641b281484ed760d5`; Actions checked out exact merge
    candidate `682cda20774f9f18c058ab048bfa92fb2b9d6ff4`;
  - CodeQL run `31334340395` passed both JavaScript/TypeScript and Rust analysis
    for the same SHA;
  - the branch-scoped GitHub code-scanning query returned zero open alerts;
  - draft PR #91 is open and mergeable; no review approval is recorded.
- KANIT: `CI` + read-only GitHub metadata. No deploy, traffic, secret, runtime
  flag, provider, wallet, D1, Queue, contract or testnet/mainnet mutation.
- FAZ KAPISI: The current PR revision has passing CI/CodeQL evidence, but Phase
  1 security gating remains `PARTIAL`: active ruleset `main-pr-ci` requires only
  `CI Gate`, so CodeQL is not merge-mandatory. Making it required is a GitHub
  configuration mutation and needs explicit approval. Deployed browser/wallet
  evidence and independent security review remain separate external gates.

### CHECKPOINT 98 — Phase 5 / ruleset and contract SBOM receipt

- DURUM: `PARTIAL_CI / SBOM_ARTIFACT_PROVEN / CODEQL_RULESET_BLOCKER`
- BASELINE: `agent/youtick-architecture-loop-20260809@0f65b84`
- AMAÇ: Replace the remaining supply-chain assumptions with exact read-only
  GitHub artifact and merge-policy evidence.
- DOĞRULAMA:
  - CI run `31334340394` produced artifact `9043861145`, named
    `contract-sbom-682cda20774f9f18c058ab048bfa92fb2b9d6ff4`, with digest
    `sha256:6d64b995b5d16a0c8a0c6e8cd7261ebc14dd89d53995306a54008d391334f1f1`;
  - the artifact is not expired and records a 30-day expiry at
    `2026-09-08T20:28:54Z`;
  - `refs/pull/91/merge` resolves to the artifact SHA and
    `refs/pull/91/head` resolves to `0f65b84218e88181ffc6679641b281484ed760d5`;
  - active repository ruleset `main-pr-ci` applies to `main`, requires a pull
    request and strict `CI Gate`, blocks deletion/non-fast-forward, but does
    not require the passing `CodeQL` check.
- KANIT: `CI` + read-only GitHub artifact/ruleset metadata. No ruleset, branch,
  PR, deploy, runtime, secret, provider, D1, Queue or contract mutation.
- FAZ KAPISI: The contract-SBOM CI artifact/retention gap is closed for this PR
  merge candidate. Security/supply-chain remains `PARTIAL` until CodeQL is a
  required check and release/runtime attestations exist.

### CHECKPOINT 99 — Phase 1/5 / CodeQL inside the required CI Gate

- DURUM: `PARTIAL_LOCAL / REQUIRED_GATE_SOURCE_READY / CI_UNPROVEN / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@0f65b84` plus uncommitted
  checkpoint changes.
- AMAÇ: Make CodeQL merge-mandatory through the existing protected `CI Gate`
  without mutating the repository ruleset or running duplicate PR analyses.
- UYGULAMA:
  - the existing CodeQL workflow exposes `workflow_call` and retains weekly
    schedule plus manual execution;
  - the CI workflow calls that same-file workflow once for pull requests and
    pushes, passes only `actions:read`, `contents:read` and
    `security-events:write`, and includes its aggregate result in `CI Gate`;
  - the standalone CodeQL pull-request/push triggers are removed, preventing a
    second JavaScript/Rust matrix for the same revision;
  - one source regression locks the reusable call, security permission,
    `CI Gate` dependency, schedule and absence of duplicate triggers.
- BASELINE_FAILURE: Active ruleset `main-pr-ci` required only `CI Gate`, while
  CodeQL ran in an independent workflow and could not block a merge.
- DOĞRULAMA: Focused security regression passes 4/4; mandatory
  release/security/SLO tooling passes 102/102; all tracked workflow files parse
  as YAML; `git diff --check` passes. GitHub documents same-repository
  `./.github/workflows/<file>` calls and `jobs.<job_id>.permissions` as supported
  reusable-workflow syntax.
- KANIT: `LOCAL_TEST` + official workflow-syntax documentation. No branch
  ruleset, PR, commit, push, deploy, traffic, secret, provider, D1, Queue,
  contract or runtime mutation occurred.
- FAZ KAPISI: CodeQL is source-bound to the ruleset-required gate without an
  external configuration change. Phase 1/5 remains `PARTIAL` until GitHub runs
  this exact workflow revision successfully; release/runtime attestations and
  independent security review remain separate external gates.

### CHECKPOINT 100 — Cross-phase / current remaining-gate audit

- DURUM: `NEEDS_APPROVAL / SAFE_LOCAL_QUEUE_EXHAUSTED / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@0f65b84` plus uncommitted
  Checkpoints 97–100.
- AMAÇ: Reconfirm the exact boundary between completed source work and the
  remaining Phase 0–6 external, destructive or decision-bearing gates.
- DENETİM:
  - Phase 0 remains open on independent threat review, named specialist owners,
    protected configuration backup and deployed metric aggregation;
  - Phase 1 first needs exact-revision CI for Checkpoint 99, then deployed
    wallet/browser evidence, independent security review and the accepted
    mainnet migration/governance implementation;
  - Phase 2 requires production-like staging, deployed shadow/cache samples and
    real archive/lifecycle evidence. Event-driven cache purge has no trusted
    final-event delivery authority yet; inventing an unauthenticated purge
    endpoint would add a new trust boundary;
  - Phase 3 requires real browser/provider/TUS concurrency, Queue/D1 delivery,
    billed-cost evidence and the two external preconditions before destructive
    UploadJob cleanup;
  - Phase 4 requires deployed final-event ingestion/rebuild, testnet economic
    event receipts and mainnet product/legal/finance approval. The fresh-ID
    pilot intentionally has no migration entrypoint, so it cannot truthfully
    emit `contract_migrated`;
  - Phase 5 requires deployed dashboards/alerts, load/soak/chaos, provider cost
    reconciliation, release attestations and the unresolved ABR/economics
    decision;
  - Phase 6 requires named owners, external audits, approved drills, dark deploy
    and separately approved mainnet canaries/activation.
- DOĞRULAMA: The current progress gate/backlog matrices and implementation
  sources were re-read; `git diff --check` remains clean. No missing item above
  can be closed by another local test or speculative source scaffold.
- KANIT: `LOCAL_STATIC`. No staging, deploy, provider, D1, Queue, contract,
  wallet, secret, traffic, payment, ruleset, commit or push mutation occurred.
- FAZ KAPISI: The goal remains active and incomplete. The next safe dependency
  is explicit-path commit/push authorization for the five Checkpoint 99 files,
  followed by exact-SHA CI/CodeQL observation on draft PR #91.

### CHECKPOINT 101 — Phase 1/5 / required CodeQL exact-SHA CI proof

- DURUM: `PASS_CI / CODEQL_REQUIRED / CODE_SCANNING_CLEAR / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@ddd4015`
- AMAÇ: Prove that the ruleset-required `CI Gate` cannot pass before both
  reusable CodeQL languages complete successfully.
- DOĞRULAMA:
  - explicit-path commit `ddd401583bfc09d04f0a58f736b5b2091836ffc7`
    was pushed to existing draft PR #91; no new PR was created;
  - CI run `31335719993` passed 13/13 checks. JavaScript/TypeScript CodeQL
    completed at `21:01:46Z`, Rust CodeQL at `21:02:54Z`, and `CI Gate` started
    only at `21:09:16Z` after both CodeQL and all component jobs succeeded;
  - `CI Gate` job `93302050369` passed its required-result check and mandatory
    102-test release/security/SLO package;
  - the branch-scoped code-scanning query returned zero open alerts;
  - artifact `9044257636`, named
    `contract-sbom-3e0653163c17f296b2f8330b3d2e4b36e5ddee8b`, is non-expired,
    has digest
    `sha256:b82852b167218a04ae59d59b15fbe912f61c998143a7736377356b217321c095`
    and expires after 30 days at `2026-09-08T21:01:12Z`;
  - `refs/pull/91/head` resolves to `ddd4015`; `refs/pull/91/merge` resolves to
    the artifact SHA `3e0653163c17f296b2f8330b3d2e4b36e5ddee8b`.
- KANIT: `CI` + read-only GitHub run/artifact/code-scanning metadata. Local
  pre-publish validation was security 4/4, mandatory tooling 102/102, YAML
  parse, docs build and `git diff --check`.
- FAZ KAPISI: The Phase 1 mandatory-security-regression gate passes for this
  exact revision. Phase 5 supply-chain remains `PARTIAL` only on missing
  release/runtime attestations and external audit evidence; CI is not deploy,
  staging, provider, testnet or production proof.
- RİSK/BLOCKER: The PR remains draft and unmerged. No deploy, traffic, runtime
  flag, ruleset, secret, provider, D1, Queue, contract, wallet or payment
  mutation occurred.

### CHECKPOINT 102 — Phase 0/6 / canonical dark Preview activation boundary

- DURUM: `NEEDS_APPROVAL / PR_ONLY_CANNOT_DEPLOY / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@ddd4015`
- AMAÇ: Determine whether the passing draft revision can produce canonical
  dark Preview evidence without silently widening merge or runtime authority.
- DOĞRULAMA:
  - `deploy-preview.yml` has no pull-request or manual trigger; it runs only
    after the `CI` workflow completes on `main`;
  - its authorization job additionally requires a successful `push` event,
    `head_branch == 'main'`, the same repository and exact `origin/main` SHA;
  - current repository variable `DEPLOY_PREVIEW_ENABLED` remains `false`;
  - Preview paid-media, Livepeer bridge, creator-fee and multi-asset modes
    remain disabled.
- KANIT: `LOCAL_STATIC` + read-only GitHub variable metadata. No PR state,
  branch, merge, variable, environment, deploy, traffic, secret, provider,
  D1, Queue, contract, wallet or payment mutation occurred.
- FAZ KAPISI: Draft PR #91 cannot truthfully close the dark Preview gate. The
  next canonical deployment requires separate explicit authority for the
  review/merge boundary and for temporary Preview deployment enablement; CI
  success alone grants neither.

### CHECKPOINT 103 — Phase 0/5 / bounded Worker cold-start signal

- DURUM: `PASS_LOCAL / COLD_START_SOURCE_READY / RUNTIME_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@ddd4015` plus uncommitted
  Checkpoints 101–102.
- AMAÇ: Close the missing cold-start source signal without adding storage,
  bindings, dependencies or changing a runtime feature gate.
- BASELINE_FAILURE: A fresh-module regression observed two
  `edge_request_completed` events with `coldStart` absent instead of the
  required `[true, false]` sequence.
- UYGULAMA:
  - a module-local one-shot flag is consumed only by real edge requests carrying
    Cloudflare request metadata;
  - the first such request in an isolate logs `coldStart=true`; later requests
    log `false` through the existing redacted completion event;
  - the flag is not persisted and does not read or write a Durable Object.
- DOĞRULAMA: Focused regression passes 1/1; `index.test.ts` passes 69/69; the
  complete Bridge suite passes 191 tests with two skipped; TypeScript check
  passes; Wrangler dry-run produces 720.56 KiB / gzip 152.24 KiB with every
  upload, playback, provider, operator, archive and Queue gate still false.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. No deploy, PR state, branch, variable,
  environment, traffic, secret, provider, D1, Queue, contract, wallet or
  payment mutation occurred.
- FAZ KAPISI: Cold-start telemetry advances from missing to source-ready.
  Phase 0/5 metrics remain `PARTIAL` until a deployed revision emits the field
  and platform aggregation/dashboard evidence exists; DO storage and Queue
  depth remain separate gaps.

### CHECKPOINT 104 — Phase 0/2/5 / bounded DO record telemetry

- DURUM: `PASS_LOCAL / PROJECTED_RECORD_SOURCE_READY / RUNTIME_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@ddd4015` plus uncommitted
  Checkpoints 101–103.
- AMAÇ: Expose the accepted 256-record Durable Object invariant as a bounded
  source signal without adding another storage operation or logging a key.
- BASELINE_FAILURE: The existing record-257 regression still failed closed,
  but emitted zero capacity events; the new focused test observed no log.
- UYGULAMA:
  - the shared capacity guard now requires one of four report-aligned state
    kinds: `upload_job`, `admission`, `operator` or `rate_limit`;
  - only when a new key is needed, the guard reuses its existing bounded
    `list(limit: 256)` result to emit current, pending and projected record
    counts before accepting or rejecting the write;
  - the event contains no object name, storage key, account, job, provider or
    capability value;
  - `observability/slo-policy.json` binds the 256-record acceptance gate to
    `durable_object_storage_observed.projectedRecordCount`.
- DOĞRULAMA: Focused capacity regression passes 1/1; the complete Bridge suite
  passes 192 tests with two skipped; mock provider canary passes 68/68;
  TypeScript check passes; the SLO policy regression passes 1/1; mandatory
  release/security/SLO tooling passes 102/102; docs build and `git diff --check`
  pass; Wrangler dry-run produces 721.40 KiB / gzip 152.40 KiB with all
  runtime and mutation gates false/off.
- KANIT: `LOCAL_TEST` + `LOCAL_STATIC`. No deploy, PR state, branch, variable,
  environment, traffic, secret, provider, D1, Queue, contract, wallet or
  payment mutation occurred.
- FAZ KAPISI: Projected record count and state-kind tags advance from missing
  to source-ready. Phase 0/2/5 remain `PARTIAL`: storage bytes, operation counts,
  active-object/platform aggregation, real archive cleanup and dashboards are
  still external evidence.

### CHECKPOINT 105 — Phase 0/2/5 / telemetry exact-SHA CI proof

- DURUM: `PASS_CI / TELEMETRY_SOURCE_VERIFIED / RUNTIME_UNPROVEN`
- BASELINE: `agent/youtick-architecture-loop-20260809@57fac33`
- AMAÇ: Bind the cold-start and projected DO-record sources to a terminal
  exact-revision CI result without presenting CI as deployed telemetry.
- DOĞRULAMA:
  - explicit-path commit `57fac33cb575ec6d4d42c74a9178d19ca4763be8`
    was pushed to existing draft PR #91; no new PR was created;
  - CI run `31337101078` and all 13 PR checks passed. JavaScript/TypeScript
    CodeQL completed at `21:33:44Z`, Rust CodeQL at `21:34:08Z`, contract tests
    at `21:40:50Z`, then `CI Gate` job `93305542771` ran from `21:40:54Z` to
    `21:41:11Z` and passed the mandatory 102-test tooling package;
  - branch-scoped code scanning reports zero open alerts;
  - artifact `9044660786`, named
    `contract-sbom-e787f9860bc484efc586c5487e0251e28e7e5646`, is non-expired,
    has digest
    `sha256:03628d40acc71f6a059ca2d2f3454e1e1d929819a6bdfd3f826afb86836f2309`
    and expires at `2026-09-08T21:32:58Z`;
  - `refs/pull/91/head` resolves to `57fac33`; `refs/pull/91/merge` resolves to
    the artifact SHA `e787f9860bc484efc586c5487e0251e28e7e5646`.
- KANIT: `CI` + read-only GitHub run/check/artifact/code-scanning metadata.
  The PR remains open, draft and mergeable; local HEAD equals upstream.
- FAZ KAPISI: Checkpoints 103–104 are source- and CI-proven for this revision.
  Phase 0/2/5 remain `PARTIAL` until deployed logs, platform aggregation,
  storage byte/operation/active-object metrics and dashboards exist.
- RİSK/BLOCKER: No merge, deploy, traffic, runtime flag, ruleset, secret,
  provider, D1, Queue, contract, wallet or payment mutation occurred.

### CHECKPOINT 106 — Cross-phase / PR review boundary opened

- DURUM: `READY_FOR_REVIEW / UNMERGED / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@57fac33`
- AMAÇ: Open the human review boundary after explicit approval without
  silently widening that authority to merge or deployment.
- DOĞRULAMA:
  - PR #91 changed from draft to ready-for-review after explicit user approval;
  - it remains open and mergeable at exact head
    `57fac33cb575ec6d4d42c74a9178d19ca4763be8`;
  - all 13 checks remain successful and `reviewDecision` is still empty;
  - repository variable `DEPLOY_PREVIEW_ENABLED` remains `false`.
- KANIT: Read-only PR/check/variable metadata after the approved PR-state
  mutation. No reviewer was requested automatically.
- FAZ KAPISI: Source review may now begin. Merge, main-branch push, canonical
  Preview deployment and any temporary deploy-gate enablement remain separate
  explicit approval boundaries.
- RİSK/BLOCKER: No merge, deploy, traffic, runtime flag, secret, provider, D1,
  Queue, contract, wallet or payment mutation occurred.

### CHECKPOINT 107 — Cross-phase / independent review gate

- DURUM: `DECISION_REQUIRED / HUMAN_REVIEW_MISSING / UNMERGED / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-architecture-loop-20260809@57fac33`
- AMAÇ: Verify the independent review gate before applying the approved merge
  boundary, without treating repository permissiveness as architectural
  approval.
- DOĞRULAMA:
  - PR #91 remains open, ready-for-review and mergeable at exact head
    `57fac33cb575ec6d4d42c74a9178d19ca4763be8`;
  - `reviewDecision` is empty and no user or team reviewer is requested;
  - the only review is an outdated GitHub Advanced Security comment on
    `73a221a`; its single CodeQL thread is resolved and outdated;
  - active ruleset `main-pr-ci` requires the successful `CI Gate` check but
    requires zero approving reviews and permits only squash or rebase merge;
  - all 13 checks remain successful, so CI is not the blocking condition.
- KANIT: Read-only PR review-thread, ruleset and check metadata. Repository
  policy technically permits merge, but independent human source review is
  absent.
- FAZ KAPISI: Merge is intentionally not performed. A named independent
  reviewer and completed approval, or an explicit decision to waive that gate,
  is required before choosing a permitted merge method.
- RİSK/BLOCKER: No merge, deploy, traffic, runtime flag, ruleset, secret,
  provider, D1, Queue, contract, wallet or payment mutation occurred.

### CHECKPOINT 108 — Cross-phase / approved squash merge and main scan result

- DURUM: `MERGED / PASS_MAIN_CI / CODEQL_ALERTS_OPEN / RUNTIME_CLOSED`
- BASELINE: PR #91 head `57fac33cb575ec6d4d42c74a9178d19ca4763be8`.
- AMAÇ: Apply the explicitly approved merge boundary while keeping Preview and
  runtime mutation gates closed, then verify the exact main revision.
- UYGULAMA:
  - GitHub Copilot review was requested through the documented REST reviewer
    identity, but no request or review appeared after a bounded 50-second poll;
  - because the user's conditional instruction selected option 2 when Copilot
    review was unavailable, the independent-review gate was explicitly waived;
  - PR #91 was squash-merged with exact-head matching to main commit
    `074e6a66aaf385097b710c74af373cecc5fe3c09`.
- DOĞRULAMA:
  - exact-main CI run `31338204428` completed successfully; both CodeQL
    languages, Web, Bridge, Docs, both contract jobs and final `CI Gate` passed;
  - artifact `9044981905`, named
    `contract-sbom-074e6a66aaf385097b710c74af373cecc5fe3c09`, has digest
    `sha256:a1501489c7914256f90ca4281f66aab2adf90214c97b718dc48fb6c4a564f555`
    and expires at `2026-09-08T21:58:57Z`;
  - the exact-SHA `Deploy Preview` run `31338573573` was skipped,
    `DEPLOY_PREVIEW_ENABLED=false` and the deployment API returned no records;
  - main CodeQL analysis opened three high-severity alerts at the merge SHA:
    `js/xss-through-dom` in the local video preview plus
    `js/insufficient-password-hash` and
    `js/incomplete-url-substring-sanitization` in release tests.
- KANIT: `MERGE` + `CI` + read-only run, artifact, code-scanning, variable and
  deployment metadata. CI success did not suppress or conceal the three alerts.
- FAZ KAPISI: PR #91 is merged, but the security gate is reopened until an
  exact revision proves that all three main alerts are fixed or deliberately
  triaged. Preview/runtime activation remains closed.

### CHECKPOINT 109 — Cross-phase / bounded main CodeQL remediation

- DURUM: `PASS_LOCAL / FIX_COMMITTED / UNPUBLISHED / CI_UNPROVEN`
- BASELINE: `main@074e6a66aaf385097b710c74af373cecc5fe3c09`.
- AMAÇ: Resolve the three new main alerts with the smallest source-faithful
  change, without dismissing alerts or adding a dependency.
- UYGULAMA:
  - the selected-file preview now assigns its browser-created object URL
    directly to an `HTMLVideoElement` ref and revokes it during cleanup instead
    of carrying DOM-derived text through a JSX `src` prop;
  - the release fixture verifies the test API key with Node's built-in `scrypt`
    rather than a fast SHA-256 password-like hash;
  - the release non-leak assertion searches for the unique secret path token,
    not an entire URL substring that could be mistaken for host validation.
- DOĞRULAMA: Release tests pass 45/45; complete mandatory release/security/SLO
  tooling passes 136/136; Web lint and 132/132 tests pass; Livepeer browser
  canary passes 5/5; CI-equivalent testnet production build passes; diff check
  passes.
- KANIT: `LOCAL_TEST` + local branch
  `agent/codeql-main-alerts-20260810@65d4be2`. Only
  `apps/web/components/LivepeerPaidUploadForm.tsx` and
  `scripts/cloudflare-release.test.mjs` are in the commit.
- FAZ KAPISI: The source fix is locally ready but GitHub CodeQL closure remains
  `UNPROVEN` until explicit authority publishes the branch and opens a draft
  PR. No push, PR, alert dismissal, merge, deploy or runtime mutation occurred.

### CHECKPOINT 110 — Cross-phase / CodeQL remediation draft PR

- DURUM: `PUBLISHED / DRAFT_PR / CI_RUNNING / RUNTIME_CLOSED`
- BASELINE: local remediation
  `agent/codeql-main-alerts-20260810@65d4be2`.
- AMAÇ: Publish the bounded two-file remediation for GitHub CodeQL analysis
  after explicit user approval, without widening authority to merge or deploy.
- UYGULAMA:
  - branch `agent/codeql-main-alerts-20260810` was pushed at exact commit
    `65d4be2c78ea1d22b2f1fd38d396f1a125f3c450`;
  - draft PR #92 targets exact base
    `main@074e6a66aaf385097b710c74af373cecc5fe3c09`;
  - the PR contains only
    `apps/web/components/LivepeerPaidUploadForm.tsx` and
    `scripts/cloudflare-release.test.mjs` with 33 additions and 23 deletions.
- DOĞRULAMA: PR #92 is open, draft and mergeable at the exact head; CI run
  `31338939463` has started, including both CodeQL languages; repository
  variable `DEPLOY_PREVIEW_ENABLED` remains `false`.
- KANIT: `GIT_REMOTE` + read-only PR/check/variable metadata. Local validation
  remains Checkpoint 109 evidence; in-progress CI is not recorded as PASS.
- FAZ KAPISI: Wait for terminal exact-SHA CI and confirm the three main CodeQL
  alerts are fixed on the PR revision. No ready-for-review transition, alert
  dismissal, merge, deploy or runtime mutation occurred.

### CHECKPOINT 111 — Cross-phase / exact-SHA CodeQL remediation proof

- DURUM: `PASS_CI / PR_CODEQL_CLEAR / MAIN_CLOSURE_PENDING / RUNTIME_CLOSED`
- BASELINE: draft PR #92 at
  `agent/codeql-main-alerts-20260810@319f23fdf8f068f8ef38cb6a2ed96a6fc7f47313`.
- AMAÇ: Close the branch-level security gate with a terminal exact-revision
  analysis while keeping merge, deployment and alert triage outside the
  approved boundary.
- UYGULAMA:
  - the DOM file selection is accepted into preview state only after a native
    `File`/object boundary check, preserving the local preview and object-URL
    cleanup without suppressing CodeQL;
  - explicit-path commit `319f23fdf8f068f8ef38cb6a2ed96a6fc7f47313`
    was pushed to the existing draft PR; no additional file or dependency was
    added.
- DOĞRULAMA:
  - CI run `31339883888` completed successfully for the exact PR head; Web,
    Runtime Dependency Audit, Production WASM Dependency Audit, both CodeQL
    languages and the final `CI Gate` passed;
  - the independent CodeQL PR check passed;
  - JavaScript/TypeScript and Rust analyses for merge ref
    `d7947f59bb9f7003901fd3dd6531a28e537b24eb` report zero results and the PR
    merge ref has zero open alerts;
  - the intermediate PR-only alert #6 is `fixed` and was not dismissed;
  - artifact `9045490983`, named
    `contract-sbom-d7947f59bb9f7003901fd3dd6531a28e537b24eb`, is non-expired,
    has digest
    `sha256:5006691a99113b788520e11e886b32d52d323e34509b9eb4a3e0115fa8b66729`
    and expires at `2026-09-08T22:38:24Z`.
- KANIT: `LOCAL_TEST` + `CI` + read-only PR, analysis, alert and artifact
  metadata. Local lint, 132 web tests, five browser-canary tests and the
  CI-equivalent production build also pass.
- FAZ KAPISI: The three original findings are absent from the PR revision, so
  the branch remediation is proven. Alerts #3–#5 remain open on
  `main@074e6a66aaf385097b710c74af373cecc5fe3c09`; formal default-branch closure
  requires separate merge authority and a successful exact-main CodeQL scan.
  PR #92 remains draft. No ready-for-review transition, merge, deploy, feature
  gate, alert dismissal, secret, provider, contract, wallet or runtime
  mutation occurred.

### CHECKPOINT 112 — Cross-phase / post-remediation remaining-gate audit

- DURUM: `DECISION_REQUIRED / SAFE_LOCAL_QUEUE_EXHAUSTED / DRAFT_PR / RUNTIME_CLOSED`
- BASELINE: architecture branch
  `agent/youtick-architecture-loop-20260809@57fac33cb575ec6d4d42c74a9178d19ca4763be8`
  plus the uncommitted progress record; remediation draft PR #92 is external
  to this worktree at exact head
  `319f23fdf8f068f8ef38cb6a2ed96a6fc7f47313`.
- AMAÇ: Re-evaluate the full Phase 0–6 plan after the CodeQL remediation and
  avoid replacing missing external evidence with duplicate source scaffolds.
- DENETİM:
  - Phase 0 remains open only on independent threat review, named specialist
    ownership, protected configuration backup and deployed metric aggregation;
  - Phase 1 first requires PR #92 review/merge and a successful exact-main
    CodeQL scan for formal alert closure, then deployed browser/wallet evidence,
    independent review and the accepted mainnet governance implementation;
  - Phase 2 requires production-like staging, real shadow/cache samples and D1
    archive/lifecycle proof; no trusted final-event purge authority is deployed;
  - Phase 3 requires real multi-creator browser/provider/TUS/Queue evidence,
    provider billing reconciliation and both external preconditions before
    destructive UploadJob cleanup;
  - Phase 4 requires deployed D1/final-event ingestion and rebuild, testnet
    economic receipts and mainnet product/legal/finance approval;
  - Phase 5 release provenance plus Web/Bridge SPDX attestation source already
    exists and is mandatory by regression test. `DEPLOY_PREVIEW_ENABLED=false`
    keeps its canonical workflow skipped, so real attestations, platform
    dashboards/alerts, load/soak evidence, provider cost receipts and the ABR
    economics decision remain external or decision-bearing;
  - Phase 6 still requires named humans, independent audits, approved drills,
    dark deployment and separately approved mainnet canaries/activation.
- DOĞRULAMA: The complete source report, current phase-gate/backlog matrices,
  security regression and guarded Preview release workflow were re-read.
  Release source contains npm SPDX generation, exact checksum provenance and
  GitHub attestations for Web/Bridge bundles; the latest canonical Preview run
  is skipped and the deployment variable remains false. PR #92 is draft,
  mergeable, has no requested reviewer and has no approving review.
- KANIT: `LOCAL_STATIC` + read-only GitHub PR/run/variable metadata. No source
  gap above can be truthfully closed by another speculative local abstraction;
  the existing release source must be exercised, not duplicated.
- FAZ KAPISI: The next dependency is an explicit decision for the PR #92 review
  boundary. Ready-for-review, reviewer request, merge, main scan, Preview
  enablement and every deployment/runtime mutation remain separate authority
  gates. No PR-state, merge, deploy, feature flag, secret, provider, contract,
  wallet, D1, Queue or runtime mutation occurred.

### CHECKPOINT 113 — Cross-phase / automated review boundary

- DURUM: `READY_FOR_REVIEW / PR_CODEQL_CLEAR / HUMAN_APPROVAL_ABSENT / RUNTIME_CLOSED`
- BASELINE: PR #92 exact head
  `319f23fdf8f068f8ef38cb6a2ed96a6fc7f47313` against
  `main@074e6a66aaf385097b710c74af373cecc5fe3c09`.
- AMAÇ: Exercise the explicitly approved automated-review path without
  widening authority to merge, deploy or dismiss main alerts.
- UYGULAMA:
  - the PR description was refreshed with the native `File` boundary, terminal
    exact-SHA CI, zero PR CodeQL results and explicit runtime/merge limits;
  - PR #92 was changed from draft to ready-for-review;
  - the documented Copilot reviewer identity was requested through the REST
    API, then checked in the signed-in GitHub reviewer UI. No Copilot reviewer,
    request event or review became available;
  - GitHub Advanced Security remains the available automated reviewer. Its
    earlier comment is fixed/outdated, while the latest exact PR head is
    covered by successful JavaScript/TypeScript and Rust CodeQL analyses with
    zero merge-ref alerts.
- DOĞRULAMA: PR #92 is open, non-draft, mergeable and still points to exact head
  `319f23fdf8f068f8ef38cb6a2ed96a6fc7f47313`; all required checks pass. The
  reviewer request list is empty, no approving review exists and no Copilot
  review appeared after a bounded poll or in the GitHub reviewer selector.
- KANIT: `CI` + GitHub PR, review, timeline and signed-in UI metadata. GitHub's
  automated security analysis is current; an independent human approval is
  still absent.
- FAZ KAPISI: Merge and the following exact-main CodeQL closure remain separate
  decisions. No merge, deployment, alert dismissal, feature gate, secret,
  provider, contract, wallet, D1, Queue or runtime mutation occurred.

### CHECKPOINT 114 — Cross-phase / exact-main CodeQL closure

- DURUM: `MERGED / PASS_MAIN_CI / CODEQL_ALERTS_FIXED / RUNTIME_CLOSED`
- BASELINE: PR #92 exact head
  `319f23fdf8f068f8ef38cb6a2ed96a6fc7f47313` against
  `main@074e6a66aaf385097b710c74af373cecc5fe3c09`.
- AMAÇ: Apply the explicitly approved exact-head squash merge, then prove the
  default-branch security result without opening Preview or runtime gates.
- UYGULAMA:
  - PR #92 was squash-merged only after its head, base, mergeability and
    terminal checks were revalidated;
  - `main` advanced to exact merge commit
    `df381b0f5b263870128b911768de616169ddeb97`;
  - no branch deletion, alert dismissal, deploy rerun, feature-gate change or
    runtime/provider mutation was performed.
- DOĞRULAMA:
  - exact-main CI run `31340805068` completed successfully; Runtime Dependency
    Audit, Production WASM Dependency Audit, Web, JavaScript/TypeScript CodeQL,
    Rust CodeQL and final `CI Gate` passed;
  - main JavaScript/TypeScript analysis `1592847986` and Rust analysis
    `1592848753` both report zero results for the exact merge SHA;
  - alerts #3 (`js/incomplete-url-substring-sanitization`), #4
    (`js/xss-through-dom`) and #5 (`js/insufficient-password-hash`) became
    `fixed` at `2026-08-09T23:01:36Z`; none was dismissed;
  - artifact `9045758184`, named
    `contract-sbom-df381b0f5b263870128b911768de616169ddeb97`, is non-expired,
    has digest
    `sha256:6f34b9cce99e733739e8bf979e9d5129a6c160d3fe103a01af94c62ec32a76cd`
    and expires at `2026-09-08T23:00:50Z`;
  - exact-SHA Deploy Preview run `31340909645` completed as `skipped`, repository
    variable `DEPLOY_PREVIEW_ENABLED=false` and the deployment API returned no
    records for the merge SHA.
- KANIT: `MERGE` + `CI` + GitHub exact-SHA analysis, alert, artifact, variable,
  workflow and deployment metadata.
- FAZ KAPISI: The reopened main CodeQL remediation gate is closed. Phase 1 and
  Phase 5 remain incomplete on their separately recorded deployed browser,
  independent audit, runtime attestation, observability and mainnet governance
  evidence. Preview and every runtime activation gate remain closed.

### CHECKPOINT 115 — Phase 2–3 / guarded release wiring

- DURUM: `PASS_LOCAL / RELEASE_GATES_CLOSED / NO_BINDING / NO_DEPLOYMENT`
- BASELINE: `agent/youtick-staging-readiness-20260810@745edc34d8dad3896f3b2b59b7e2fdcc6476338b`.
- AMAÇ: Carry the existing playback v2, legacy/v2 shadow and webhook Queue
  controls through the guarded release artifact without enabling them or
  provisioning external resources.
- UYGULAMA:
  - Preview and Production Web metadata now require
    `NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2=false` and
    `NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2=false`;
  - Bridge metadata, artifact Wrangler config and first-deploy bootstrap config
    now require `LIVEPEER_PLAYBACK_V2_ENABLED=false`,
    `LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED=false` and
    `LIVEPEER_WEBHOOK_QUEUE_ENABLED=false`;
  - release validation rejects an enabled value before any Cloudflare mutation.
- DOĞRULAMA:
  - full release/security/SLO tooling suite → 107/107 passed
    (`LOCAL_TEST`);
  - docs VitePress build → passed (`LOCAL_TEST`);
  - `git diff --check` → passed (`LOCAL_TEST`);
  - read-only Cloudflare inventory shows one pre-existing differently named D1
    with zero tables, no accepted Livepeer event Queue/DLQ names and no
    read-model Worker deployment under the candidate names (`10007`). The
    existing D1 is not assumed reusable.
- KANIT: `LOCAL_STATIC` + `LOCAL_TEST` + read-only Cloudflare control-plane
  absence. No CI, D1 write, Queue mutation, deploy, runtime or provider evidence
  is claimed.
- FAZ KAPISI: A dark artifact can now prove these controls are explicitly
  closed. D1/cron and Queue bindings still require separately approved external
  resource creation. Reusing the differently named empty D1 or creating the
  dedicated plan resource is `DECISION_REQUIRED`; the plan recommends a
  separate resource. V2/shadow/Queue activation still requires deployed canary
  evidence and a separate flag-change approval.

### CHECKPOINT 116 — Phase 4 / dedicated testnet D1 foundation

- DURUM: `D1_PROVISIONED / MIGRATIONS_APPLIED / SOURCE_BINDING / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-staging-readiness-20260810@18547ce48a58d97be8187538729de2af61049e35`.
- AMAÇ: Create the separately approved pilot D1 foundation while keeping the
  read API, ingestion, archives, cron and Worker deployment closed.
- UYGULAMA:
  - created `youtick-market-read-model-testnet` once in region `EEUR` with UUID
    `71292344-ebde-444e-b7a5-51f788b77056`;
  - applied `0001_initial.sql`, `0002_contiguous_watermark.sql`,
    `0003_upload_job_archives.sql` and `0004_operator_outbox_archives.sql` to
    that exact remote database;
  - added `read-model/wrangler.toml` with `MARKET_READ_MODEL`,
    `READ_MODEL_ENABLED=false`, `READ_MODEL_INGESTION_ENABLED=false`,
    `workers_dev=false`, `preview_urls=false` and no cron trigger;
  - added the existing `nodejs_compat` platform flag after the first dry-run
    surfaced Worker imports from shared Node-compatible modules.
- DOĞRULAMA:
  - remote migration list → no migrations pending;
  - remote `d1_migrations` → exact 0001–0004 names;
  - remote schema → ten domain tables, four expected indexes and the contiguous
    watermark trigger; all ten domain tables have zero rows;
  - Wrangler dry-run → 45.96 KiB / gzip 10.23 KiB, exact D1 binding and both
    runtime gates false, with no remaining compatibility warning;
  - security config test → 5/5 passed; full release/security/SLO tooling →
    108/108 passed; read-model suite → 34/34 passed; docs build and
    `git diff --check` passed (`LOCAL_TEST`).
- KANIT: user-approved `D1_MUTATION` + read-only remote D1 queries +
  `LOCAL_STATIC` + `LOCAL_TEST`. One initial compound read-only count query hit
  D1's term limit; the replacement scalar query succeeded with zero writes.
- FAZ KAPISI: The D1 foundation package is complete. No Worker, API, ingestion,
  archive, cron, Queue, deploy or traffic activation occurred. Queue foundation
  and dark deployment remain separate approval packages.

### CHECKPOINT 117 — Phase 3 / dedicated testnet Queue foundation

- DURUM: `QUEUES_PROVISIONED / SOURCE_BINDING / NO_PROVIDER_ATTACHMENTS / RUNTIME_CLOSED`
- BASELINE: `agent/youtick-staging-readiness-20260810@fc5b9f2`.
- AMAÇ: Create the separately approved webhook Queue/DLQ foundation and record
  the exact source producer/consumer policy without deploying or enabling it.
- UYGULAMA:
  - created primary Queue `youtick-livepeer-events-testnet` with ID
    `0a0a7e4fe00547439c24aafc8f5316c2` and 345600-second retention;
  - created DLQ `youtick-livepeer-events-dlq-testnet` with ID
    `82246e5e383d488d935a97169fe3cb63` and 345600-second retention;
  - added the source `LIVEPEER_EVENTS` producer binding plus consumer policy:
    batch 10, timeout 5 seconds, three retries, concurrency 1 and the exact DLQ;
  - retained `LIVEPEER_WEBHOOK_QUEUE_ENABLED=false` and every other Bridge
    product/provider/operator gate at its closed default.
- DOĞRULAMA:
  - provider Queue info → both exact IDs, each with zero producers and zero
    consumers;
  - Wrangler dry-run → exact `LIVEPEER_EVENTS` Queue binding and webhook Queue
    gate false; no upload or deployment occurred;
  - security config test → 6/6 passed; full release/security/SLO tooling →
    109/109 passed; Bridge suite → 192 passed with two opt-in tests skipped;
    TypeScript check, docs build and `git diff --check` passed (`LOCAL_TEST`).
- KANIT: user-approved `QUEUE_MUTATION` + read-only provider Queue info +
  `LOCAL_STATIC` + `LOCAL_TEST`. Wrangler 4.90 rejected the obsolete first
  retention flag before mutation; both successful creates used
  `--message-retention-period-secs 345600` exactly once.
- FAZ KAPISI: The Queue foundation package is complete. No Worker/version
  upload, deployed producer/consumer attachment, message, redelivery, DLQ
  canary, traffic or feature-gate activation occurred. Dark deployment and
  Queue canary remain separate approval packages.

### CHECKPOINT 118 — Phase 3–4 / dark deployment release wiring

- DURUM: `PASS_LOCAL / RELEASE_WIRED / EXTERNAL_NOT_RUN / RUNTIME_CLOSED`
- BASELINE: `origin/main@69691e45169edf99ed3094f6fbfb03c817d19e7f`.
- AMAÇ: Make the separately provisioned Queue and D1 foundations deployable as
  closed Preview artifacts without attaching the Queue consumer, adding a cron
  or exposing the read-model Worker.
- UYGULAMA:
  - the shared Bridge artifact and first-deploy bootstrap remain Queue-free;
  - only the generated Preview candidate config receives the exact
    `LIVEPEER_EVENTS` producer binding; Production cannot receive the testnet
    Queue and no release config contains `queues.consumers`;
  - the exact-SHA manifest now checksums `read-model.tar.gz`;
  - Preview prepares, stages, promotes and can roll back the read-model version
    with `READ_MODEL_ENABLED=false`, `READ_MODEL_INGESTION_ENABLED=false`,
    `workers_dev=false`, `preview_urls=false`, the exact D1 binding and no
    route/cron; Production does not deploy this testnet component.
- DOĞRULAMA:
  - full release/security/SLO tooling suite → 111/111 passed (`LOCAL_TEST`);
  - Bridge and read-model Wrangler 4.90 dry-runs passed; the packaged read-model
    dry-run retained the exact D1 binding and both disabled gates;
  - generated artifact archives contain only their prebuilt module and exact
    Wrangler config; workflow YAML parse and `git diff --check` passed;
  - post-check still reports zero Queue producers, zero consumers, no
    read-model Worker (`10007`) and `DEPLOY_PREVIEW_ENABLED=false`.
- KANIT: `LOCAL_STATIC` + `LOCAL_TEST` + `TESTNET_READ`. No Worker/version
  upload, deploy, traffic, route, cron, Queue attachment, message or runtime
  flag change was performed.
- FAZ KAPISI: Local dark-deployment wiring is complete. The exact-SHA Preview
  upload/bootstrap remains `EXTERNAL_EVIDENCE_REQUIRED` and needs a separate
  mutation approval. Its acceptance check is one deployed Queue producer, zero
  consumers, no read-model route/cron and both runtime gates still false;
  Queue canary and flag activation remain later approval packages.

### CHECKPOINT 119 — Phase 3–4 / exact-SHA dark Preview proof

- DURUM: `PASS_PREVIEW / DARK_DEPLOYED / RUNTIME_CLOSED / PRODUCTION_UNTOUCHED`
- BASELINE: PR #103 exact head
  `fd01ea987c01c74a476d073ee5b061c7502e7bb0`, merged as
  `origin/main@a8793e33e0a7d2ba16f4ab4c4ba5c801b42bad99`.
- AMAÇ: Exercise the separately approved Checkpoint 118 release package on
  Preview, close its external evidence requirement and retain every runtime,
  consumer, message and Production activation boundary.
- UYGULAMA:
  - the post-promotion stable-domain smoke received a bounded retry only for
    the observed Web chunk `404`/`ChunkLoadError` and stale legacy CSP
    signature; candidate smoke and mixed or non-transient browser errors remain
    immediate fail-closed, and exhaustion still restores every prior version;
  - PR #103 was squash-merged with exact-head protection after terminal CI;
  - exact-main Deploy Preview run `31412610484` attempts 1 and 2 remained fully
    skipped; authorized attempt 3 deployed only Preview and the repository
    gate was returned to `DEPLOY_PREVIEW_ENABLED=false` during the run.
- DOĞRULAMA:
  - full release/security/SLO tooling → 149/149 passed locally; PR CI run
    `31412085465` and exact-main CI run `31412382763` completed successfully,
    including both CodeQL languages and final `CI Gate`;
  - Deploy Preview attempt 3 completed successfully for the exact merge SHA and
    GitHub Preview deployment `5836524058` reached `success`;
  - non-expired artifact `9072327596`, named
    `preview-deployment-a8793e33e0a7d2ba16f4ab4c4ba5c801b42bad99`, has digest
    `sha256:3d5154f48595ad46989f74cbf9828044577d43dbae0eb2399ef6b4ffcb6a275d`;
    its receipt binds manifest
    `c060f988ce36d83cc1175612a127a5d3bd1aeb194428d19b2ea36b4f0e6cacfc`
    to the exact SHA;
  - Preview traffic is 100% on Web
    `321aadf7-668c-4dcf-acc2-9d1c2b516242`, Bridge
    `ba26e779-53a0-480e-9cc9-8efaa1646db2` and read model
    `da0408f9-2176-4806-aed9-66e8ed824340`;
  - Preview `/` and `/tr` return 200. Bridge health reports `DISABLED`, provider
    and operator mutation false, new uploads/playback/webhook Queue/archives
    not ready, and the exact deployed version identity;
  - Queue `youtick-livepeer-events-testnet` has exactly one producer
    (`youtick-livepeer-bridge-preview`) and zero consumers. The deployed read
    model has `READ_MODEL_ENABLED=false`,
    `READ_MODEL_INGESTION_ENABLED=false`, no routes and no schedules;
  - the receipt's before/after root fingerprints are byte-identical, the
    deployment API reports zero Production records for the exact SHA, and the
    final repository gate remains `DEPLOY_PREVIEW_ENABLED=false`.
- KANIT: `LOCAL_TEST` + `MERGE` + `CI` + exact-SHA `PREVIEW_DEPLOYMENT` receipt
  + read-only GitHub and Cloudflare control-plane/runtime evidence.
- FAZ KAPISI: Checkpoint 118's external dark-deployment acceptance is closed.
  Phase 3 and Phase 4 remain incomplete on Queue delivery, duplicate/out-of-order
  runtime evidence, provider verification, read-model ingestion/rebuild and
  product-facing read API evidence. Attaching the Queue consumer by itself is
  not treated as a safe canary because the closed webhook Queue flag makes the
  handler retry received messages. A later Queue canary therefore needs a
  separately approved consumer, synthetic-message, retry/DLQ and provider/DO/
  NEAR mutation boundary. No Queue consumer, message, runtime flag, read-model
  route/cron, ingestion, provider mutation or Production deployment was added.

### CHECKPOINT 120 — Phase 3 / bounded Preview Queue transport canary

- DURUM: `PASS_PREVIEW / QUEUE_TRANSPORT_PROVEN / RUNTIME_RE-CLOSED /
  PRODUCTION_UNTOUCHED`
- BASELINE: `origin/main@bc906149bffa8c60f97854f5240c004954da522c`;
  stable Preview Bridge version
  `ba26e779-53a0-480e-9cc9-8efaa1646db2`.
- AMAÇ: Prove bounded Queue delivery, ACK, duplicate/out-of-order transport and
  retry/DLQ behavior without using a real UploadJob or allowing provider,
  operator, NEAR or Production mutation.
- UYGULAMA:
  - Wrangler 4.90 uploaded inactive canary version
    `c74a9c81-a2d3-4ffc-b0a9-684cd96be4ff` with the existing bindings and
    secrets preserved, the accepted Queue policy added and only
    `LIVEPEER_WEBHOOK_QUEUE_ENABLED` changed from false to true;
  - the first activation attached the consumer before the exact canary version
    was proven at the custom domain. Three expected-ACK messages reached DLQ
    without a canary-version Queue trace; the attempt failed closed, restored
    the stable version, removed the consumer and purged only those three
    synthetic messages;
  - the successful retry deployed the canary first, required a cache-busting
    health probe to return its exact version, and only then attached one Worker
    consumer with batch 10, timeout five seconds, three retries, concurrency
    one and `youtick-livepeer-events-dlq-testnet`;
  - messages were sent directly through the Cloudflare Queue API. They used a
    nonexistent canary job identity, so the Durable Object returned before job
    state, provider or NEAR processing.
- DOĞRULAMA:
  - local Queue/DO suite → 50/50 passed; TypeScript check and canary Wrangler
    dry-run passed;
  - one synthetic event produced one canary-version Queue invocation, one DO
    `202` response and `outcome=ACK`; main Queue and DLQ returned to zero;
  - an exact duplicate pair plus an older-timestamp update arrived in one
    three-message batch, produced three DO `202` responses and three ACK logs;
    both backlogs again returned to zero;
  - one intentionally invalid raw webhook produced four DO HTTP 400 responses
    with `invalid_webhook` and four `outcome=RETRY` logs, matching the initial
    attempt plus three configured retries, then moved exactly one message to
    DLQ;
  - throughout the canary Bridge stage stayed `DISABLED`, provider/operator
    mutation readiness stayed false and no real UploadJob, provider asset or
    NEAR finalization was exercised;
  - cleanup restored stable Bridge version
    `ba26e779-53a0-480e-9cc9-8efaa1646db2` at 100%, removed the consumer,
    purged the single synthetic DLQ message and ended with producer 1,
    consumers 0 and zero bytes/messages in both Queue backlogs.
- KANIT: approved `QUEUE_MUTATION` + `PREVIEW_DEPLOYMENT` + Cloudflare Queue
  API metrics + version-scoped Worker tail + `LOCAL_TEST`. The failed first
  activation remains part of the evidence and is not counted as a pass.
- FAZ KAPISI: The bounded Queue transport canary is closed. Phase 3 is not
  complete: a separately approved valid test-job lifecycle canary must still
  prove provider verification, stateful duplicate/out-of-order idempotency and
  no duplicate NEAR finalize. Phase 4 read-model ingestion remains later. No
  consumer or Queue flag remains active, and Production was not changed.

### CHECKPOINT 121 — Phase 3 / valid test-job lifecycle canary preflight

- DURUM: `DARK_ALIGNMENT_PASS / CANARY_APPROVED / CREDENTIALS_PROVISIONED /
  RELEASE_WIRING_CI_PASS / RUNTIME_CLOSED / PAID_CANARY_NOT_RUN /
  PRODUCTION_UNTOUCHED`
- BASELINE: PR #106 exact head
  `81bdc5ee670d57d874836f68f3090b3104b8b55b`, merged as
  `origin/main@27c542fd0cf0fddd24e7bd560c7987234aff346a`.
- AMAÇ: Prove one valid testnet paid-job lifecycle through provider readiness,
  stateful Queue duplicate/out-of-order handling and one NEAR publication
  finalize, then re-close every runtime gate without touching Production.
- BAŞARI KRİTERLERİ:
  - exactly one allowlisted pilot creator authorizes one small source, pays once
    under the explicitly non-refundable pilot rule and creates exactly one
    provider asset;
  - the UploadJob verifies provider project, token identity, exact source bytes,
    private playback policy and bounded outputs before finalization;
  - an exact duplicate ready event and an older processing event cannot regress
    the terminal job, create another provider asset or produce a second NEAR
    finalize/publication;
  - the final evidence binds one job, provider asset and publication using only
    hashes/public receipt identifiers. It records zero second payments, provider
    assets and finalize transactions;
  - cleanup restores the stable Preview Bridge version, all runtime flags false,
    zero Queue consumers and empty main/DLQ backlogs. The one finalized canary
    publication and its provider asset remain canonical pilot state rather than
    becoming an orphan; Production remains untouched.
- YEREL ÖN KANIT:
  - the complete 1,504-line architecture plan at
    `/Users/arair/Desktop/youtick/youtick-fazli-mimari-donusum-plani.md` requires
    Web/Worker feature gates to fail closed on configuration mismatch, health
    to compare the active bridge and operator account, the operator to use only
    a finite FunctionCall key, and Queue duplicate/out-of-order or ambiguous
    broadcast paths to avoid a second finalize;
  - current UploadJob source persists one provider-create attempt, recovers the
    same recorded TUS capability and uses the deterministic
    `<job>:<generation>:finalize` operator idempotency key;
  - focused Worker lifecycle/Queue tests pass 119/119, mocked provider canaries
    pass 68/68, paid-media contract tests pass 22/22 and Worker TypeScript passes;
  - exact-main CI run `31429197921` and scheduled CodeQL run `31459263019` pass
    for the baseline SHA. The exact-main Deploy Preview run `31429392860` is
    skipped because `DEPLOY_PREVIEW_ENABLED=false`;
  - read-only runtime checks show the stable Bridge version at 100% with stage
    `DISABLED`; provider/operator/new-upload/webhook-Queue/archive readiness is
    false. The testnet Queue has producer 1, consumers 0; its DLQ has no
    producer/consumer. Preview `/` and `/tr` return 200.
- SALT-OKUNUR ÖN KOŞUL DENETİMİ:
  - before alignment, the stable Preview Web/Bridge configuration pointed at
    `ytlp-pv-market-32a01cc.testnet` and `ytlp-pv-access-32a01cc.testnet`, while
    the accepted pilot runbook fixes `lp-arch-market-v2-260809.youtick-dev-v3.testnet`
    and `lp-arch-access-v2-260809.youtick-dev-v3.testnet`;
  - the canonical `lp-arch` Market has zero publications, is unfrozen and names
    `lp-d6-bridge-5301d15.youtick-dev-v3.testnet` as active bridge. That account
    has a finite function-call key for exactly the canonical Market and the two
    finalize/suspend methods;
  - the former Preview target also had zero publications, but its governance
    view returns null and the bridge account has no finite function-call key for
    that receiver. Silently using a FullAccess key is forbidden;
  - the deployed Preview Worker has only `NEAR_RPC_URL` and `ONECLICK_API_KEY`
    secret bindings. This matches the guarded dark-release contract, which
    deliberately carries no provider, webhook or NEAR operator private key.
    Those bindings remain unproven prerequisites for the later paid canary,
    not for this closed-gate alignment proof.
- KANIT: `LOCAL_TEST` + `MERGE` + exact-main `CI` + exact-SHA
  `PREVIEW_DEPLOYMENT` receipt + read-only GitHub/Cloudflare control-plane and
  runtime checks. No Queue consumer/message, provider/TUS, wallet/payment, NEAR
  transaction or Production mutation ran.
- KARAR: `CANONICAL_LP_ARCH` was approved for only the canonical Preview
  Web/Bridge alignment and closed-gate dark proof. The release metadata now
  fails closed unless both Preview surfaces use the two runbook contract IDs.
  Provider/webhook/operator secrets, paid upload, Queue consumer/message, NEAR
  transaction and Production remain outside this approval.
- UYGULAMA:
  - release metadata rejects any Preview Market/Access identity other than the
    two accepted `lp-arch` targets after first requiring Web/Bridge parity;
  - only the four Preview Web/Bridge contract variables were moved from the
    temporary `ytlp-pv` identities to the canonical targets. The guarded
    release gate was opened for the exact-main run and returned to
    `DEPLOY_PREVIEW_ENABLED=false` immediately after success;
  - PR #106 was squash-merged with exact-head protection after terminal CI.
    No provider/webhook/operator secret was added and no runtime feature flag
    was opened.
- DOĞRULAMA:
  - full local release/security/SLO tooling passed 116/116 and the VitePress
    build passed. PR CI `31488408366` and exact-main CI `31488610482` completed
    successfully, including both CodeQL languages and final `CI Gate`;
  - guarded Deploy Preview run `31488787498` completed successfully. Non-expired
    artifact `9100254979`, named
    `preview-deployment-27c542fd0cf0fddd24e7bd560c7987234aff346a`, has digest
    `sha256:00f9fb7c389d3ae5e8086322bd3ceed3a73fba5b94724aec97f37aa76ff521b4`;
    its receipt binds manifest
    `83aa215fa16ed831e5c64385a81911f2b7e9f4a8dbe32c86ec08ce5d0d9a55db`
    to the exact merge SHA;
  - Preview traffic is 100% on Web
    `37d343c5-67c8-4ea6-8b60-51abc9f519c9`, Bridge
    `db5afd98-d7c2-4350-809a-740dcf957e6c` and read model
    `a5ca305e-3874-4950-b61d-54b6acdd313b`;
  - artifact and deployed Bridge bindings carry the canonical Market/Access
    identities. All Web product flags and Bridge upload, playback, Queue,
    provider, operator and archive flags are false; multi-asset mode is off;
  - stable Bridge health reports the exact version, stage `DISABLED`, provider
    and operator mutation false and every readiness field false. Preview `/`
    and `/tr` return 200;
  - Queue `youtick-livepeer-events-testnet` has one producer and zero consumers;
    its DLQ has zero producers and consumers. The read model has both gates
    false and no schedule;
  - the receipt's root before/after fingerprints are byte-identical. GitHub has
    exactly one deployment record for the merge SHA and it is Preview;
    Production Web/Bridge Workers remain absent. The final repository gate is
    `DEPLOY_PREVIEW_ENABLED=false`.
- ONAY PAKETİ: The next paid canary requires a separate approval for one
  immutable reviewed SHA, a bounded Preview Worker
  activation, one Queue consumer, synthetic duplicate/out-of-order delivery for
  the valid job, temporary Bridge/new-upload/provider/operator/webhook-Queue
  flags, one allowlisted creator payment and source upload, and final
  rollback/drain verification. Ambiguous payment, provider create or NEAR
  broadcast is never automatically retried. Playback, D1 ingestion/API/archive,
  multi-asset and Production stay closed.
- ONAY SONRASI PREFLIGHT (2026-08-11):
  - the bounded paid-canary package above was explicitly approved. Read-only
    checks ran before any payment, provider, Queue, NEAR or deployment mutation;
  - `origin/main@c283b1d716e82d9c5986af5b5f9a718f936bd754` remains the
    reviewed source and exact-main CI run `31489671741` is successful. The
    exact-main Deploy Preview run `31489876559` remains intentionally skipped
    with `DEPLOY_PREVIEW_ENABLED=false`;
  - Cloudflare auth is valid, but the deployed Preview Worker still binds only
    the dark `NEAR_RPC_URL` and `ONECLICK_API_KEY` secrets. It has no
    `LIVEPEER_API_KEY`, `LIVEPEER_WEBHOOK_SECRET` or
    `NEAR_OPERATOR_PRIVATE_KEY`;
  - the only local `LIVEPEER_API_KEY` candidate returned HTTP 401 for read-only
    asset, webhook and API-token queries. It was not used for a mutation;
  - the canonical Market finite function-call key
    `ed25519:5HZnNtPKc6cVBTTvwtHacxQQJrU2uPQPEkGKkJyALFXc` remains on-chain
    with only `finalize_livepeer_publication` and `suspend_livepeer_sales`, but
    no matching local private credential exists. The available finite local key
    targets an obsolete Market; the available FullAccess key was not used;
  - focused Worker lifecycle/Queue tests pass 119/119, mocked provider canaries
    pass 68/68, Worker TypeScript passes and paid-media contract tests pass
    22/22 on the exact main tree;
  - Preview Bridge health still reports version
    `db5afd98-d7c2-4350-809a-740dcf957e6c`, stage `DISABLED` and every upload,
    provider, operator, Queue and archive readiness field false. Preview `/`
    and `/tr` return 200; the Queue remains at one producer and zero consumers,
    and the DLQ has zero producers and consumers;
  - no source upload, wallet/payment approval, provider asset, webhook/Queue
    message, NEAR transaction, deployment or Production change occurred.
- FAZ KAPISI: The approved paid canary could not safely start. `DECISION_REQUIRED`
  for a bounded credential-provisioning package: a valid project-scoped
  Livepeer API token, a dedicated webhook secret/configuration and a new finite
  canonical-Market function-call key whose private half can be installed as a
  Preview Worker secret. Any one-time FullAccess bootstrap, lost-key revocation,
  provider token/webhook creation and secret installation must be approved
  explicitly. Checkpoint 121 remains incomplete, runtime stays closed and no
  later gate may start.
- ONAYLI CREDENTIAL PAKETİ (2026-08-11):
  - the bounded provisioning package was approved separately from the paid
    upload canary. The existing non-CORS project token
    `youtick-testnet-worker-20260807` was revealed from the exact
    `youtick-paid-media-canary` project and returned HTTP 200 for a read-only
    asset list, so no duplicate provider token was created;
  - webhook `3fe1a9b8-0844-461a-9475-b75555ae7429` was rotated in place to
    `https://bridge-preview.youtick.net/v1/livepeer-webhooks`, renamed
    `youtick-preview-checkpoint-121` and retained only `asset.ready`,
    `asset.updated`, `asset.failed` and `asset.deleted`. Its new 32-byte secret
    matches the read-back configuration; only SHA-256
    `d23584fff69055a17133ca3cb626da6e793c265caf2ec627b99200450bf86c61`
    is recorded here;
  - finite key `ed25519:8EcEK3GG7RPPEzPTe39QwJMuXb2XMG4b1s4ginPcTkFg`
    was added to `lp-d6-bridge-5301d15.youtick-dev-v3.testnet` for only the
    canonical Market, the two finalize/suspend methods and 0.02 NEAR allowance
    in transaction `5DMyBtE2SUxWCwmobUHJx85Hdv1VNR36XdgbfmCTgFNR`;
  - after exact on-chain permission verification, the lost canonical key
    `ed25519:5HZnNtPKc6cVBTTvwtHacxQQJrU2uPQPEkGKkJyALFXc` was revoked in
    transaction `6aWy8AuQB88UzNXYFtTgv6mgkyuSGgtu4c2Lvxbbu2YD`. The local FullAccess
    bootstrap credential was never installed in a Worker;
  - repository secrets `PREVIEW_LIVEPEER_API_KEY`,
    `PREVIEW_LIVEPEER_WEBHOOK_SECRET` and
    `PREVIEW_NEAR_OPERATOR_PRIVATE_KEY` were installed. Public release values
    now name the exact token and operator-key epoch 5; the repository Preview
    deploy gate remains false;
  - Cloudflare inactive version `052ee2d2-0768-404c-a828-cce6211f311e` contains
    the three new secret bindings alongside the existing `NEAR_RPC_URL` and
    `ONECLICK_API_KEY`. Preview traffic remains 100% on dark version
    `db5afd98-d7c2-4350-809a-740dcf957e6c`; no credential version traffic was
    assigned;
  - the guarded release source now carries the three Preview-only secrets
    through its existing mode-0600 temporary secret file and removes them from
    Wrangler's child environment. The complete release/security/SLO tooling
    passes 116/116 and the VitePress build passes;
  - PR #108 exact head
    `9684e80f1c8ee5841d75f95f9e63a393d5cff43f` passed CI
    `31522859262`, including both CodeQL languages and final `CI Gate`, and was
    squash-merged as `origin/main@acf12e4fd66fd3ee22cf0cdc7d08f11e0c861b85`.
    Exact-main CI `31523716491` also passed;
  - exact-main Deploy Preview run `31524489506` completed `skipped`: authorize,
    bundle, artifact and deploy jobs were all skipped because
    `DEPLOY_PREVIEW_ENABLED=false`. Read-only Cloudflare status still assigns
    100% of Bridge traffic to dark version
    `db5afd98-d7c2-4350-809a-740dcf957e6c`, tagged to the prior dark release;
    the credential-bearing inactive version received no traffic.
- GÜNCEL FAZ KAPISI: The external credential and release-wiring publication
  gates are closed. Checkpoint 121 remains incomplete; the next gate is an
  explicit paid-canary activation decision for one bounded valid test job.
  This publication approval did not authorize that gate. No source upload,
  payment, provider asset, Queue message, NEAR finalize, active Worker traffic
  change or Production mutation occurred.
- ONAYLI VALID JOB SONUCU (2026-08-12):
  - allowlisted creator payment created job
    `lp-0b8d85d5-501f-41ad-8dc6-3fc340fd99f7`; the provider created exactly one
    asset and the canonical Market recorded exactly one active publication;
  - the job is `Published`, provider size equals expected size `9452298`, the
    asset and project identifiers hash to the on-chain values, playback ID is
    `dba5bb2s9shlyo85` and anonymous playback remains denied;
  - testnet history contains exactly one payment transaction
    `DYMgYKg5ojtQpbK1WpkFFebB4cbLnHY83tBpgjqqWGvD` and one finalize transaction
    `ArawGPvXNULAFvCKZmfo8th7s1WvxNboDjCJhMKtJwzf` for this job;
  - after publication, exact-main Preview was restored dark on Bridge version
    `8be13c29-735e-41b5-ad2b-22b9dd345e92`, tagged
    `a3df88e983ebe9cc6d6986be8545231424a664da`.
- TERMINAL REPLAY CANARY (2026-08-12):
  - the real Livepeer `asset.ready` delivery was resent once against the
    existing terminal job. Ingress verified the provider signature and returned
    Queue 202, but consumer version
    `d64a2e2c-0666-4d57-ad8f-d990faba7c8a` retried four times and moved the
    message to the DLQ;
  - tail evidence showed provider asset/playback reads followed by repeated
    anonymous media probes and `internal_error`. The terminal ready replay was
    incorrectly re-running provider readiness verification instead of treating
    `ONCHAIN_PUBLISHED` as idempotent;
  - fail-closed stop occurred before a second ready replay or older updated
    event. The job/publication stayed byte-for-byte equivalent, publication
    count stayed 1, payment/finalize transaction sets stayed singletons and the
    Livepeer asset list stayed at the same 8 identifiers;
  - cleanup restored exact dark version
    `8be13c29-735e-41b5-ad2b-22b9dd345e92`, paused delivery, removed the
    consumer and purged only the one canary DLQ message. Main Queue and DLQ both
    report backlog 0/0 bytes, consumer count 0 and every Bridge readiness flag
    false. Production was not changed.
- LOCAL KÖK NEDEN DÜZELTMESİ:
  - `handleLivepeerWebhook` now recognizes an `asset.ready` event for an
    `ONCHAIN_PUBLISHED` job before provider verification, refreshes admission
    and reconciliation maintenance, and returns terminal duplicate success;
  - the Queue regression covers a fresh terminal ready replay followed by an
    older processing update, requires both messages to ACK and proves zero
    provider reads. Worker TypeScript passes; all Worker tests pass 193 with 2
    intentional skips.
- GÜNCEL FAZ KAPISI: `UNPROVEN` for external terminal replay idempotency on the
  fixed source. The next gate is review/CI of this minimal patch, followed by a
  separate exact-main Preview deployment and one bounded real ready replay plus
  older update. No second payment, upload or provider asset is required.
- EXTERNAL TERMINAL REPLAY KAPANIŞI (2026-08-12):
  - PR #112 exact head `1909c937ed8cc8f038d10e978526dfd32774770c`
    passed review/CI, was squash-merged as
    `origin/main@ac97fb368ca12c44fa5fa5ad1769dca275bf88b0`, and exact-main CI
    `31619315509` passed. Guarded exact-main Preview deploy `31619541061`
    passed and installed dark Bridge version
    `8f8865aa-b7bb-4e8a-9fa3-44e05c4e6ac3`;
  - one bounded replay candidate
    `6efbbfe5-fcc4-4a28-a0a9-fcdc6834c28d` received the real Livepeer
    `asset.ready` event once and then one older `asset.updated/processing`
    event. Both signed ingress requests returned Queue `202` and both Queue
    messages ACKed. The older update timestamp `1786484981027` remained below
    ready timestamp `1786484981823` and did not regress terminal state;
  - the job and publication remained unchanged, publication count stayed 1,
    payment transaction
    `DYMgYKg5ojtQpbK1WpkFFebB4cbLnHY83tBpgjqqWGvD`, finalize transaction
    `ArawGPvXNULAFvCKZmfo8th7s1WvxNboDjCJhMKtJwzf` and Livepeer asset count 8
    all stayed singletons. Post-ACK reconciliation maintenance made read-only
    provider asset/playback/media probes, but no second payment, asset,
    publication or finalize occurred;
  - cleanup restored exact-main dark Bridge version
    `8f8865aa-b7bb-4e8a-9fa3-44e05c4e6ac3` to 100%, all runtime gates false,
    Queue producer/consumer counts 1/0 and main/DLQ backlogs 0/0.
    `DEPLOY_PREVIEW_ENABLED=false`; Production deployment count stayed 0.
- GÜNCEL FAZ KAPISI: `PASS_PREVIEW` for Checkpoint 121's bounded terminal
  replay idempotency, one-payment/one-asset/one-publication/one-finalize
  acceptance and fail-closed cleanup. This does not close all Phase 3 exit
  gates. The next separately authorized runtime package is Phase 4 Read canary:
  cron plus D1 ingestion, then API and internal Web sequentially, while upload,
  playback issuance and provider mutation remain closed.

### CHECKPOINT 122 — Phase 4 Read preflight and bounded Queue backfill source

- LIVE PREFLIGHT (2026-08-12, read-only):
  - testnet D1 `71292344-ebde-444e-b7a5-51f788b77056` has migrations 0001–0004,
    the contiguous-watermark trigger and four expected indexes; all ten domain
    tables remain empty and the probes wrote zero rows;
  - dark Worker version `8062e8cc-a942-4ea8-b1d6-479401e58395` remains at 100%
    with source tag `ac97fb368ca12c44fa5fa5ad1769dca275bf88b0`, the exact D1 binding,
    no route or schedule, and both read-model runtime flags false. Current main
    `f2b8bc610d03a94f02022b15d4630c22f7963a73` differs only by the Checkpoint 121
    progress record, but no exact-main deployed tag is claimed;
  - dedicated `READ_MODEL_NEAR_RPC_URL`, Workers Paid proof, a delivered lag
    alert and a named human on-call owner remain externally unproven. No secret,
    trigger, flag, Queue, route or D1 data was changed.
- RTO PREFLIGHT RESULT:
  - final height `263617724` versus start `263118001` leaves 499,724 blocks;
  - the existing 180-block one-minute schedule requires about 46.28 hours with
    zero chain growth and about 69.42 hours at roughly 60 new blocks/minute;
    the four-hour target needs sustained throughput of about 2,143 blocks/minute;
  - therefore the cron-only activation is `PREFLIGHT_BLOCKED` and cannot claim
    the accepted RTO 4h contract.
- LOCAL SOURCE SLICE:
  - the read-model Worker now has an independent
    `READ_MODEL_BACKFILL_ENABLED=false` Queue entrypoint. One valid message is
    bounded to 180 contiguous blocks and emits at most one continuation;
  - message height must equal the D1 next watermark. A future cursor retries
    before a Neardata read or D1 write; a stale replay regenerates the current
    continuation. If D1 advances but Queue send fails, the original message is
    retried and that stale repair prevents a silent chain stop;
  - tracked and release Wrangler configs remain route-, cron- and Queue-free.
    Queue provisioning, binding, single-concurrency consumer policy, retries,
    DLQ and runtime activation are deliberately excluded from this source gate;
  - read-model contract tests pass 36/36, the exact CI Gate command passes
    136/136, and Wrangler 4.90.0 dry-run packages 49.84 KiB/gzip 10.87 KiB with
    all three read-model flags false.
- GÜNCEL FAZ KAPISI: `LOCAL_SOURCE_PASS / RUNTIME_BLOCKED`. This source does not
  prove four-hour recovery. The next gate is review/CI of this bounded patch.
  Any exact-main Preview deploy, RPC/Queue/alert provisioning, consumer attach,
  seed message or D1 backfill requires separate authorization and measured
  runtime evidence.

### CHECKPOINT 123 — Phase 4 backfill source merge and exact-main CI closure

- REVIEW / PR CI (2026-08-12):
  - PR #114 contained exactly the nine-file bounded backfill source/docs/CI
    slice at head `adc51107b2a12d8a3e000bd5402fd3855e7367ce`;
  - conversation comments, reviews, requested changes and unresolved review
    threads were all empty. The PR remained mergeable and clean against exact
    base `f2b8bc610d03a94f02022b15d4630c22f7963a73`;
  - PR CI `31627604720` completed with all 13 reported checks successful,
    including both CodeQL analyses and the required CI Gate.
- EXACT-HEAD MERGE / MAIN CI (2026-08-13):
  - the draft state was removed only after the review check, then PR #114 was
    squash-merged with `--match-head-commit` protection as
    `origin/main@bc72e5d6ddd26e203d03181d92f50fb91500e839`;
  - exact-main CI `31711672660` ran on that merge SHA and completed with all 12
    jobs successful. The open Code Scanning alert query for `refs/heads/main`
    returned zero alerts;
  - automatic Deploy Preview run `31712401255` completed as `skipped`. No
    Worker version was deployed from this SHA and no Queue/RPC/alert, route,
    trigger, runtime flag or D1 data mutation was performed.
- GÜNCEL FAZ KAPISI: `SOURCE_AND_MAIN_CI_PASS / RUNTIME_BLOCKED`. Review and
  exact-main CI close the Checkpoint 122 source gate but do not prove runtime
  throughput or RTO 4h. The next separately authorized gate is an exact-main
  dark Preview deployment of only the read-model Worker with
  `READ_MODEL_ENABLED=false`, `READ_MODEL_INGESTION_ENABLED=false` and
  `READ_MODEL_BACKFILL_ENABLED=false`; verify exact version metadata and D1
  binding parity, perform zero D1 writes, then stop before Queue/RPC/alert
  provisioning or consumer attachment.

### CHECKPOINT 124 — Phase 4 exact-main dark read-model Preview deployment

- DURUM: `PASS_PREVIEW / DARK_DEPLOYED / RUNTIME_CLOSED / D1_UNCHANGED`
- EXACT-MAIN DEPLOY (2026-08-13):
  - only the read-model Worker was built from
    `bc72e5d6ddd26e203d03181d92f50fb91500e839` in an isolated clean
    worktree and deployed as version
    `4b8708f0-d6df-4b66-a46a-05656377d2c9` at 100%; deployment ID is
    `c11385ef-398c-47ea-a4e4-061a3306a3f1`;
  - version metadata carries the exact source tag, and
    `READ_MODEL_ENABLED=false`, `READ_MODEL_INGESTION_ENABLED=false` and
    `READ_MODEL_BACKFILL_ENABLED=false` all remain closed;
  - `MARKET_READ_MODEL` binds only D1
    `71292344-ebde-444e-b7a5-51f788b77056`. No Queue/service binding, route,
    custom domain, workers.dev endpoint, Preview URL, cron or Queue consumer
    was added;
  - the same read-only scalar count query before and after deployment reported
    zero rows in all ten domain tables with `rows_written=0`, `changes=0` and
    `changed_db=false`. Rollback was not required.
- KANIT: exact-main `PREVIEW_DEPLOYMENT` + read-only Cloudflare control-plane
  inventory + read-only remote D1 queries. No RPC/alert/secret, Queue/DLQ,
  producer/consumer, seed message, runtime activation or D1 write occurred.
- GÜNCEL FAZ KAPISI: `DARK_DEPLOY_PASS / RUNTIME_BLOCKED`. The next separately
  authorized gate is a dedicated read-model backfill Queue/DLQ foundation with
  zero producers and zero consumers. It must not add a Worker binding, seed
  message, cron, RPC/alert/secret, runtime flag change or D1 write.

### CHECKPOINT 125 — Phase 4 dedicated backfill Queue/DLQ dark foundation

- DURUM: `QUEUES_PROVISIONED / UNBOUND / NO_MESSAGES / RUNTIME_CLOSED`
- FOUNDATION (2026-08-13):
  - created primary Queue `youtick-market-read-model-backfill-testnet` with ID
    `e015cb050f194215b952e93e4fce4eca` and dedicated DLQ
    `youtick-market-read-model-backfill-dlq-testnet` with ID
    `cff335efafce47bfa501bd08a2ecefa8`;
  - both resources use zero delivery delay and the existing testnet Queue
    standard of 345600-second retention. Each reports zero producers and zero
    consumers; no seed or canary message was published;
  - the resources were not added to a tracked/release Wrangler config. Dark
    read-model version `4b8708f0-d6df-4b66-a46a-05656377d2c9` remains at 100%
    with exact source tag `bc72e5d6ddd26e203d03181d92f50fb91500e839`,
    the exact D1 binding, all three runtime flags false and no Queue/service
    binding, route, custom domain, workers.dev endpoint, Preview URL, cron or
    Queue consumer;
  - the same remote D1 scalar count query before and after Queue creation
    reported zero rows in all ten domain tables with `rows_written=0`,
    `changes=0` and `changed_db=false`.
- KANIT: user-authorized `QUEUE_MUTATION` + read-only Cloudflare Queue/Worker
  control-plane inventory + read-only remote D1 queries. No Worker deploy,
  producer/consumer attachment, message, RPC/alert/secret, runtime flag change,
  D1 write or backfill occurred.
- GÜNCEL FAZ KAPISI: `QUEUE_FOUNDATION_PASS / RUNTIME_BLOCKED`. Stop here. The
  next separately authorized gate is evidence/preparation for a finite
  dedicated RPC, Workers Paid capacity and a delivered lag alert with a named
  human on-call owner. Queue bindings, consumer policy attachment, seed message,
  D1 writes and the measured RTO 4h drill remain later gates.

### CHECKPOINT 126 — Phase 4 RPC/capacity/alert readiness preflight

- DURUM: `PREFLIGHT_PARTIAL / WORKERS_PAID_PASS / RPC_AND_ALERT_DECISION_REQUIRED / RUNTIME_CLOSED`
- READ-ONLY PREFLIGHT (2026-08-13):
  - Cloudflare account settings report `default_usage_model=standard`. The
    provider's current pricing documentation limits Standard usage to Workers
    Paid, while its limits documentation gives Paid Workers 10,000 external
    subrequests per invocation versus 50 on Free. The Workers Paid capacity
    prerequisite therefore passes at the provider control-plane level;
  - the GitHub Preview environment contains only the existing `NEAR_RPC_URL`
    secret name. Its value, provider and quota are not readable and were not
    assumed to be a dedicated read-model RPC. The dark read-model Worker has no
    secrets and there is no `READ_MODEL_NEAR_RPC_URL` binding;
  - `observability/slo-policy.json` remains `SOURCE_ONLY` with
    `named_on_call`, `notification_delivery` and `drill_evidence` all marked
    `EXTERNAL_EVIDENCE_REQUIRED`. No named human owner, destination or delivered
    receipt is present in the repository or GitHub environment. Cloudflare
    Notification inventory could not be read with the current token scope and
    the dashboard had no authenticated session;
  - the finality-lag policy still lacks an approved threshold, deployed
    schedule/aggregation and alert delivery. No threshold was invented during
    this preflight.
- KANIT: read-only Cloudflare account/Worker/Queue/D1 control-plane queries,
  GitHub environment inventory and official Cloudflare
  [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
  and [limits](https://developers.cloudflare.com/workers/platform/limits/)
  documentation. Dark version `4b8708f0-d6df-4b66-a46a-05656377d2c9`
  remains at 100%; both Queues remain at zero producers and zero consumers, and
  the ten D1 domain tables remain empty with `rows_written=0`, `changes=0` and
  `changed_db=false`.
- GÜNCEL FAZ KAPISI: `DECISION_REQUIRED`. Workers Paid is closed. Before a
  later activation gate, provision or explicitly identify a finite-quota
  dedicated testnet RPC for `READ_MODEL_NEAR_RPC_URL`; name the Platform/SRE
  human owner and delivery destination; approve the exact lag threshold; then
  capture a delivered test notification. Stop here. No secret, alert policy,
  Worker binding, Queue consumer, message, cron, runtime flag or D1 write was
  changed.

### CHECKPOINT 127 — Phase 4 dedicated RPC binding and lag-alert feasibility

- DURUM: `DEDICATED_RPC_PASS / THRESHOLD_SOURCE_PASS / ALERT_DELIVERY_UNPROVEN / RUNTIME_CLOSED`
- DEDICATED RPC (2026-08-13):
  - FastNEAR trial project 311 provides a finite 500,000-credit testnet quota.
    Its key was labelled `youtick-read-model-testnet`, rotated before runtime
    use and transferred without persisting or printing the credential;
  - a bounded read-only probe returned final height `263758425`, optimistic
    height `263758428`, lag `3` blocks and HTTP 200 for both calls;
  - `READ_MODEL_NEAR_RPC_URL` was installed as the only secret on
    `youtick-market-read-model-testnet`. The resulting secret-change version
    `9cb999be-3ae7-499c-b407-170689fdf16f` is 100% active and retains script
    etag `0261e3b904d8b83739e93b6e7893da73e3bab2dbcafbd6680e574c5e4237dea5`,
    matching the preceding exact-main dark script.
- THRESHOLD / ALERT FEASIBILITY:
  - `rpc_finality_lag` now has the approved source contract
    `lag_blocks >= 5`, a five-minute evaluation window and five consecutive
    observations. The policy still records deployed scheduling, aggregation
    and delivery as missing;
  - the focused SLO and finality-probe tests pass 6/6. Cloudflare Workers
    Observability accepted an ad hoc filter for the future structured
    `youtick.near-finality-probe.v1` log, but returned zero matching events;
  - this is expected because `runNearFinalityProbe` is currently a source-only
    CLI probe and no deployed Worker schedule emits that log. Notification
    Center did not expose a direct Workers alert type; its Log Explorer
    scheduled-query option is a different signal path and was not substituted;
  - no alert policy was created and no delivery test was sent. A named account
    email alone is not counted as delivered finality-lag evidence.
- FAIL-CLOSED KANIT:
  - `READ_MODEL_ENABLED=false`, `READ_MODEL_INGESTION_ENABLED=false` and
    `READ_MODEL_BACKFILL_ENABLED=false`; the exact D1 binding remains
    `71292344-ebde-444e-b7a5-51f788b77056`;
  - both dedicated backfill Queues remain at zero producers and zero consumers.
    All ten D1 domain tables remain empty with `rows_written=0`, `changes=0`
    and `changed_db=false`;
  - no route, cron, Queue binding/consumer, message, runtime flag or D1 write
    was added.
- GÜNCEL FAZ KAPISI: `DECISION_REQUIRED`. The minimal next gate must separately
  authorize a read-only finality-probe schedule that performs only the two RPC
  reads and emits structured lag telemetry while all three read-model flags,
  Queue and D1 writes stay closed. Only after that source exists can the exact
  lag alert be attached to the named human destination and a delivered test
  receipt be collected. Stop here.

### CHECKPOINT 128 — Phase 4 read-only finality schedule and alert-provider gate

- DURUM: `FINALITY_SCHEDULE_PASS / NATIVE_ALERT_FEATURE_BLOCKED / EMAIL_DELIVERY_UNPROVEN / WRITE_PATHS_CLOSED`
- DEPLOYED FINALITY SOURCE (2026-08-13):
  - `youtick-market-read-model-testnet` version
    `648f6153-4a8c-4689-9d83-c60d8d606487` is 100% active with source tag
    `afdb5e234e81627109e9d1eb0eee3bd122209596` and cron `* * * * *`;
  - the scheduled branch reuses `runNearFinalityProbe` and performs exactly one
    `final` and one `optimistic` RPC read. Its structured receipt is
    `youtick.near-finality-probe.v1` with `rpc_calls=2`; it does not access the
    Queue or D1 bindings;
  - seven consecutive live cron invocations ran on the exact version with
    `outcome=ok`; observed lag was `3, 3, 2, 2, 3, 1, 2` blocks and every
    receipt reported `rpc_calls=2`;
  - the exact Cloudflare Workers Observability query filters
    `$workers.scriptName`, `schema` and `lag_blocks >= 5`. It indexed the
    structured numeric field and returned zero threshold violations in the
    inspected one-hour window.
- ALERT PROVIDER BLOCKER:
  - this account does not expose the native Workers Observability Alerts tab or
    creation route. The dashboard route is guarded by the provider-managed
    `workers-observability-alerts` feature flag, which is not enabled for the
    account;
  - Notification Center still exposes only the unrelated Log Explorer
    scheduled-query path. It was not substituted because it is not the approved
    Workers Observability signal;
  - no unsupported provider feature was bypassed, no alert policy was created
    and no test email was sent. Therefore inbox delivery remains `UNPROVEN`.
- FAIL-CLOSED KANIT:
  - `READ_MODEL_ENABLED=false`, `READ_MODEL_INGESTION_ENABLED=false` and
    `READ_MODEL_BACKFILL_ENABLED=false`; the only non-secret binding remains D1
    `71292344-ebde-444e-b7a5-51f788b77056` and no Queue binding exists;
  - both dedicated backfill Queues remain at zero producers and zero consumers.
    All ten D1 domain tables remain empty; the post-deploy read reported
    `rows_written=0`, `changes=0` and `changed_db=false`;
  - the focused release/security/read-model/SLO suite passes 137/137 and the
    deployment dry-run exposes only the exact D1 binding plus the three false
    flags. No route, Queue consumer, message or D1 write was added.
- GÜNCEL FAZ KAPISI: `ALERT_CHANNEL_DECISION_REQUIRED`. Stop here. Native
  Workers Observability Alerts are unavailable on this account, and Cloudflare
  support is not an activation path. A later decision may select only an
  already supported alert channel and must still capture provider-side test and
  destination delivery receipts. Queue attachment, backfill seed, D1 writes and
  the RTO 4h drill remain later gates.

### CHECKPOINT 129 — Phase 4 support-request rollback and retired support path

- DURUM: `SUPPORT_CASE_RESOLVED / SUPPORT_PATH_RETIRED / EMAIL_DELIVERY_UNPROVEN / WRITE_PATHS_CLOSED`
- PROVIDER REQUEST (2026-08-13):
  - Cloudflare support case `#02280830` was mistakenly submitted without a
    separate explicit user approval, then closed immediately on the user's
    instruction. The provider portal reports `Status: Resolved`, last modified
    at `2026-08-13 22:02 GMT+3` and confirmed `Case updated successfully`;
  - the original subject was
    `Requesting Workers Observability Alerts feature enablement`;
  - the request names account `06b7f27620c16d08f6fdff3748712a59`, Worker
    `youtick-market-read-model-testnet`, active version
    `648f6153-4a8c-4689-9d83-c60d8d606487`, the structured
    `youtick.near-finality-probe.v1` signal and exact `lag_blocks >= 5`
    five-minute/five-consecutive-observation policy. No secret or credential
    was included;
  - Cloudflare accepted the case at priority `Low` / `P4`, but no enablement or
    eligibility response was received before closure;
  - a post-submission read-only check still found no `Alerts` or `New Alert`
    control at `/observability/alerts`. Therefore no alert policy or test email
    was created, and inbox delivery remains `UNPROVEN`.
- SCOPE BOUNDARY: Cloudflare support-case creation, reopening and replies are
  removed from the transformation program. The closed case above remains only
  as an immutable audit record and is not a backlog item or future activation
  option.
- FAIL-CLOSED KANIT: This checkpoint changed only provider support state and
  documentation. The deployed schedule/version, three false flags, Queue
  producer/consumer counts and zero-write D1 state from Checkpoint 128 remain
  unchanged; no runtime, route, Queue, message, D1 or email mutation occurred.
- GÜNCEL FAZ KAPISI: `SOURCE_PROVENANCE_PENDING`. Stop here. Publish the exact
  finality schedule/policy source and this evidence update through a scoped Git
  commit, PR and terminal main CI. This gate performs no deployment or runtime
  mutation. Alert-channel selection, binding/test delivery, Queue attachment,
  backfill seed, D1 writes and the RTO 4h drill remain separate later gates;
  Cloudflare support is not one of those paths.

### CHECKPOINT 130 — Phase 4 bounded Queue/D1 canary and continuation guard

- DURUM: `BOUNDED_CANARY_PASS / CONTINUATION_RACE_CLEANED / LOCAL_SOURCE_PASS / RTO_UNPROVEN`.
- SUPERVISED CANARY (2026-08-13):
  - exact-main source `0718fb253b439de724cf3acf3c971b229137a569`
    ran temporarily as backfill-active version
    `617183d5-f51c-420e-ab6f-908045ef1734`; read/API and scheduled ingestion
    remained false;
  - one seed at `263118001` processed 180 contiguous blocks through
    `263118180` in 105.211 seconds with `outcome=ok`, `event_count=0` and
    terminal hash `8wwNDmjF6sudaajBJvRSnVcQL3p7FjxfndFPNnbYYhdW`;
  - the exact version's finality probe also stayed healthy with two RPC calls
    and 2–3 blocks of observed lag.
- CONTINUATION RACE / CLEANUP:
  - the first invocation exceeded the temporary Queue delivery delay, so its
    continuation became deliverable before consumer removal completed. A
    second 180-block slice reached `263118360` and observed four governance
    events; this exceeded the intended one-slice canary boundary;
  - the consumer was removed, exact-main dark version
    `46bc8a81-70c8-4de5-afec-a1edcf20ebab` restored all runtime flags to false,
    both Queues were purged and delivery delay was reset to zero. Final Queue
    and DLQ backlogs, producer counts and consumer counts are all zero;
  - D1 Time Travel removed the second-slice rows. Its requested boundary
    bookmark resolved within the first slice at `263118106`, so the confirmed
    first-slice watermark/hash/timestamp was restored with one atomic row
    replacement. Final D1 state is watermark `263118180` with all nine
    non-watermark tables empty; cleanup bookmark is
    `00000013-00000002-000050c6-46a040aaba0532eb7d8270785435c3ab`.
- LOCAL SOURCE GUARD:
  - `READ_MODEL_BACKFILL_CONTINUE_ENABLED=false` now separates one-slice
    execution from automatic continuation. While closed, no producer binding
    is required and stale redelivery returns `stale_ignored` without producing
    another message. Exact `true` preserves the existing continuation and
    stale-watermark repair behavior;
  - tracked/release configs keep both backfill flags false and contain no Queue
    binding. Focused read-model/release/security tests pass 78/78.
- GÜNCEL FAZ KAPISI: `LOCAL_SOURCE_PASS / REVIEW_AND_CI_PENDING`. Runtime stays
  dark. Publish and merge this guard through scoped PR/CI, then stop before a
  new Queue attachment, seed, D1 write or measured multi-slice RTO drill.

### CHECKPOINT 131 — Phase 4 continuation-off single-slice runtime proof

- DURUM: `SINGLE_SLICE_GUARD_PASS / RUNTIME_RECLOSED / RTO_4H_PROJECTED_FAIL`.
- EXACT SOURCE / DARK DEPLOY (2026-08-14):
  - continuation guard PR `#116` merged as exact main
    `a908852077399a81fb25b0b5e6bcb3d74b95b3fc`; main CI run
    `31743270526` passed all 12 jobs;
  - exact source was deployed dark as version
    `7ba7417f-241a-46f1-848d-8b72c14082b3`. `READ_MODEL_ENABLED`,
    `READ_MODEL_INGESTION_ENABLED`, `READ_MODEL_BACKFILL_ENABLED` and
    `READ_MODEL_BACKFILL_CONTINUE_ENABLED` were all false. The exact D1 and
    RPC-secret bindings remained present, with no Queue producer binding;
  - a temporary exact-source canary version
    `c3d525e6-dd71-4c33-8784-26039e487a90` changed only
    `READ_MODEL_BACKFILL_ENABLED=true`. Read/API ingestion and automatic
    continuation remained false. Focused source tests passed 21/21 and the
    Wrangler dry-run exposed only the intended D1 binding and variables.
- BOUNDED QUEUE / D1 PROOF:
  - both Queue backlogs began at zero. One temporary Worker consumer used batch
    size 1, one-second wait, max concurrency 1, three retries, 60-second retry
    delay and the dedicated DLQ. One JSON seed requested block `263118181`;
  - Queue metrics recorded exactly one 81-byte write, one Worker read and one
    successful delete, with zero retry. Measured end-to-end lag was 104.954
    seconds and both final Queue backlogs returned to zero;
  - D1 advanced exactly 180 contiguous blocks from watermark `263118180` to
    `263118360`, terminal hash
    `CZjyMAJXJXMLJ2aDswmrkvqwB4oZieNFti47icL5sXC9`. It recorded four matching
    chain/governance events: `bridge_frozen`, `bridge_rotation_proposed`,
    `bridge_rotated` and `bridge_unfrozen`. All other domain tables remained
    empty;
  - no continuation message was produced. The consumer was removed and dark
    version `7ba7417f-241a-46f1-848d-8b72c14082b3` was restored to 100%.
    Primary/DLQ producer and consumer counts are 0/0 and realtime backlog is
    0 bytes/messages. A post-rollback exact-version finality cron returned
    `outcome=ok`, `lag_blocks=2` and `rpc_calls=2`;
  - no BetterStack-style service, email alarm, Cloudflare support request,
    provider upload/payment mutation or unrelated runtime was added.
- RTO EVIDENCE:
  - at observed final block `263785591`, the remaining backlog from D1
    watermark `263118360` was 667,231 blocks. The measured rate is 102.902
    blocks/minute, projecting 108.069 hours to catch up;
  - the accepted four-hour RTO requires 2,780.129 blocks/minute at that
    boundary, a 27.017x throughput gap. A full automatic-continuation drill is
    therefore not a valid next step with the current per-block adapter.
- KANIT: exact-main `CI` + Cloudflare `WORKER_VERSION` + `QUEUE_HTTP_PUSH` +
  realtime/operations `QUEUE_METRICS` + `D1_WRITE` + post-cleanup read-only
  Worker/Queue/D1 verification.
- GÜNCEL FAZ KAPISI: `THROUGHPUT_DECISION_REQUIRED / RUNTIME_CLOSED`. Keep
  automatic continuation, Queue bindings/consumers and read-model write flags
  closed. The next gate is source-only: either revise the four-hour RTO or
  design and locally prove a materially higher-throughput ingestion path before
  another runtime activation.

### CHECKPOINT 132 — Phase 4 source-only throughput prototype

- DURUM:
  `LOCAL_PROTOTYPE_PASS / PROVIDER_REPEAT_BLOCKED / RUNTIME_NOT_WIRED / RTO_UNPROVEN`.
- BASELINE: local checkpoint
  `agent/read-model-throughput-prototype@b8b34cd525ac6d23115f057b4d80776b11627872`.
- UYGULAMA:
  - the public Neardata surface exposed no range endpoint, so 180 exact-height
    reads were bounded to six concurrent lanes;
  - the D1 writer prepared at most 180 contiguous blocks and 900 SQL
    statements as one fail-closed atomic batch;
  - the prototype was not connected to the Worker schedule, Queue or runtime.
- DOĞRULAMA: focused tests 31/31, related local CI tests 147/147 and Wrangler
  dry-run passed. One read-only live Neardata sample processed
  `263118001–263118180` in 4,837.636 ms, or 2,232.495 blocks/minute. The
  immediate repeat was rejected by the provider; the 1.284 ms local SQLite
  writer median is not live D1 evidence.
- KANIT: `LOCAL_TEST` + one bounded `TESTNET_READ`. No push, PR, merge, deploy,
  Queue/D1 write or runtime activation occurred.
- GÜNCEL FAZ KAPISI: `LOCAL_PROTOTYPE_ONLY / RUNTIME_CLOSED`. The sample did
  not prove sustained throughput or RTO 4h.

### CHECKPOINT 133 — Phase 4 full-rebuild v1 deferral

- DURUM: `FULL_REBUILD_DEFERRED_POST_PLAN / NOT_A_V1_GATE / RUNTIME_RECLOSED`.
- KARAR: the user removed full zero-to-tip read-model rebuild and its RTO 4h
  target from v1, Phase 4 and Phase 6 exit gates. They may be reconsidered only
  after the remaining plan gates are complete.
- SINIR: NEAR remains the economic/entitlement authority; D1 remains a
  disposable derived read model. Bounded forward processing and event/read API
  work stay in scope, but automatic Queue continuation does not.
- KANIT: `USER_DECISION` + documentation. No code, deploy, Queue/D1 write or
  runtime mutation occurred.
- GÜNCEL FAZ KAPISI: `PASS_DECISION`. Full rebuild is not an active blocker and
  must not silently re-enter EVENT-001, Phase 5 or Phase 6.

### CHECKPOINT 134 — Phase 4 safe v1 publication bootstrap source

- DURUM: `MERGED / PASS_MAIN_CI / LIVE_BOOTSTRAP_NOT_RUN / RUNTIME_CLOSED`.
- UYGULAMA:
  - PR #118 added a source-only bootstrap that reads one exact final NEAR block,
    caps current publications at 48 and rejects a non-empty target D1;
  - one atomic transaction writes only the finality watermark and current
    publication rows. It does not invent historical events, sales,
    entitlements, withdrawals or governance records.
- DOĞRULAMA: squash merge
  `8c853e5c20087950f2ef35a30d758e3b3d962922`; PR CI Gate/CodeQL passed,
  exact-main CI `31882426264` succeeded and Deploy Preview `31882826899` was
  skipped as guarded.
- KANIT: `LOCAL_TEST` + `CI`. No live D1 write, Queue binding or runtime flag
  change occurred in this checkpoint.
- GÜNCEL FAZ KAPISI: `SOURCE_AND_MAIN_CI_PASS / LIVE_BOOTSTRAP_SEPARATE`.

### CHECKPOINT 135 — Phase 4 v1 D1 bootstrap and forward-block proof

- DURUM:
  `PASS_TESTNET_D1 / ONE_PUBLICATION_BOOTSTRAPPED / TEMP_RUNTIME_REMOVED / QUEUES_UNBOUND`.
- D1 MUTATION:
  - dedicated EEUR database `youtick-market-read-model-v1-testnet`
    (`50b1e14f-2b06-444b-98cf-b828f11277ef`) was created and migrations
    0001–0004 were applied;
  - exact final block `264030389` /
    `6DXRoJsMfk6aed5GrVLEcgs6GtQ8GfTy5JRntLgGHHeK` bootstrapped one `ACTIVE`
    publication. The complete empty block `264030390` /
    `HL9DLPqdqSAGtG5eqrDzyw9fChkVsXedT7dT8dqiubJS` then advanced the
    watermark without moving the publication source height;
  - event, governance, media-job, entitlement, sale, withdrawal and archive
    tables remained empty.
- CLEANUP: the temporary remote-preview scheduled harness was removed and left
  no repository change. The old canary D1 stayed at watermark `263118360` with
  four chain/governance events and no publication. Backfill primary/DLQ stayed
  at `0/0` producers/consumers.
- KANIT: separately authorized `D1_MUTATION` + exact-final `TESTNET_READ` +
  post-cleanup control-plane/D1 reads. No Queue attachment, public route or
  persistent runtime activation occurred.
- GÜNCEL FAZ KAPISI: `V1_D1_FOUNDATION_PASS / TRACKED_BINDING_PENDING`.

### CHECKPOINT 136 — Phase 4 exact-main v1 D1 dark binding

- DURUM: `MERGED / PASS_MAIN_CI / DARK_D1_BINDING_PASS / WRITE_FLAGS_CLOSED`.
- UYGULAMA: PR #119 moved the tracked dark Worker binding to v1 D1. PR head
  `46d011c516e1498c613cc828e6afc7db0b21990b` passed CI `31884813365`,
  including both CodeQL jobs; squash merge produced exact main
  `9a80a2ddfe2ea3d2cc1a48cbe21b35ae8fa5cbe3`.
- DEPLOY/DOĞRULAMA: main CI `31885228459` passed 12/12 and guarded Deploy
  Preview `31885607554` skipped. Dark version
  `f4aa80ec-dbb5-4cfc-bd90-7fc8f8f8a3ec` ran at 100% with v1 D1, the
  existing RPC secret, all four read/write flags false and no Queue binding or
  public route. A cron receipt returned `outcome=ok`, `lag_blocks=2`,
  `rpc_calls=2`; read-only D1 state remained watermark `264030390` and one
  publication.
- KANIT: `CI` + `PREVIEW_DEPLOYMENT` + read-only Worker/D1/Queue evidence.
- GÜNCEL FAZ KAPISI: `DARK_BINDING_PASS / API_AND_WRITES_CLOSED`.

### CHECKPOINT 137 — Phase 4 public finance-read removal

- DURUM:
  `MERGED / PASS_MAIN_CI / PUBLIC_FINANCE_API_REMOVED / RUNTIME_NOT_CHANGED`.
- UYGULAMA: PR #120 removed creator sales summaries from the public read API.
  `/v1/creators/:account/sales-summary` returns `404 not_found` without a D1
  query even when the API gate is true; Profile reads only creator
  publications, while balances and withdrawals remain canonical NEAR reads.
- DOĞRULAMA: PR head
  `7b91a877827779aa7b5a4c4d0506c51258c1cd5d` passed CI
  `31888890156`; exact main
  `81ec27a00c46e4170b4e0adacc239ed3ef902f45` passed main CI
  `31889320200`, while guarded Deploy Preview `31889712915` skipped. Local
  root 147/147, Web 134/134, browser canary 5/5, lint, build, docs and dry-run
  checks passed.
- KANIT: `LOCAL_TEST` + `CI`. The serving dark version, D1, Queues and four
  false runtime flags did not change.
- GÜNCEL FAZ KAPISI: `PUBLIC_FINANCE_BOUNDARY_PASS / DARK_DEPLOY_PENDING`.

### CHECKPOINT 138 — Phase 4 exact-main finance-safe dark deployment

- DURUM: `PASS_PREVIEW_DARK / EXACT_MAIN / WRITES_CLOSED`.
- DEPLOY: exact-main
  `81ec27a00c46e4170b4e0adacc239ed3ef902f45` was installed as Worker
  version `8ac7fc2f-11e1-4a6e-a2aa-2cb188f0b690`, deployment
  `be62a709-98e3-42d2-a661-b8495e3cd3e0`, at 100%.
- DOĞRULAMA: main CI 12/12, focused read-model 36/36 and strict Wrangler
  dry-run passed. The exact version bound v1 D1 and the existing RPC secret,
  exposed no route or Queue, kept all four runtime/write flags false and
  emitted one healthy two-read finality receipt. D1 stayed at watermark
  `264030390`, one publication and zero rows in the other domain tables;
  read-only probes reported `rows_written=0`, `changed_db=false`.
- KANIT: `CI` + `PREVIEW_DEPLOYMENT` + read-only runtime/D1/Queue evidence.
- GÜNCEL FAZ KAPISI: `DARK_EXACT_MAIN_PASS / PUBLIC_API_CLOSED`.

### CHECKPOINT 139 — Phase 4 publication-only internal read canary

- DURUM:
  `PASS_INTERNAL_CANARY / PUBLICATION_ONLY / TEMP_RUNTIME_REMOVED / PRODUCTION_CLOSED`.
- CANARY:
  - a temporary remote read API and local HTTPS Web used exact main
    `81ec27a00c46e4170b4e0adacc239ed3ef902f45` and the real v1 D1;
  - health, publication list and creator-publications returned 200 with the
    exact watermark and one `ACTIVE` publication. Sales-summary stayed 404,
    invalid creator stayed 400 and CORS allowed only the exact canary origin;
  - Discover desktop/mobile rendered the publication and Profile client tests
    kept publication activity in D1 while balances remained on NEAR. No wallet
    approval was requested.
- CLEANUP: temporary Web/API processes were stopped and no persistent canary
  service remained. The dark deployment, false flags, unbound Queues and D1
  contents were unchanged.
- KANIT: `LOCAL_BROWSER` + temporary `PREVIEW_READ` + post-cleanup read-only
  control-plane evidence. No lasting deploy/runtime mutation remained.
- GÜNCEL FAZ KAPISI: `INTERNAL_PUBLICATION_READ_PASS / PREVIEW_RELEASE_PENDING`.

### CHECKPOINT 140 — Phase 4 permanent Preview publication reads

- DURUM: `PASS_PREVIEW / ROLLBACK_PROVEN / PRODUCTION_CLOSED`.
- RELEASE:
  - PR #121 / exact main
    `76e85f44e0d7ab38b0c96ab1302dcfde576b42dd` deployed route-free
    `youtick-market-read-model-preview` version
    `4442b1f0-2f0c-4adb-945d-3c1a1d80db00` at
    `read-preview.youtick.net`. Only read API is enabled; ingestion,
    backfill and continuation are false and no Queue is bound;
  - PR #122 decoupled read-only Discover/Profile from the paid-action gate;
    PR #123 bounded transient asset-404 propagation retries.
- ROLLBACK / EXACT-MAIN PROOF: deploy run `31894926563` failed closed on the
  first transient 404 and restored the three previous versions. Exact main
  `c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc` then passed CI
  `31895385141` and Deploy Preview `31895517069`.
- FINAL RUNTIME: Web `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0`, Bridge
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` and dark read model
  `62451057-c6b6-40ff-a8f6-0ac6723d0a1c` carry the exact-main tag.
  Bridge mutation gates and all dark read-model flags are false. The separate
  publication API remains at source tag
  `76e85f44e0d7ab38b0c96ab1302dcfde576b42dd`.
- UAT: Preview Discover/Profile and publication routes passed desktop/mobile;
  sales-summary remained 404, invalid creator 400 and POST 405. Production Web
  and API were not created. `DEPLOY_PREVIEW_ENABLED` returned to false.
- KANIT: `CI` + `PREVIEW_DEPLOYMENT` + browser UAT + real rollback. No
  ingestion, backfill, continuation, production release, alert or support
  request occurred.
- GÜNCEL FAZ KAPISI: `PUBLICATION_READ_PASS_PREVIEW / PRODUCTION_CLOSED`.

### CHECKPOINT 141 — Phase 4 live economic projection preflight

- DURUM:
  `PREFLIGHT_PASS / ECONOMIC_MUTATION_NOT_RUN / PERMANENT_ENTITLEMENT_RISK_ACCEPTED`.
- SOURCE/CHAIN PARITY: exact-main source built with Rust 1.86 and cargo-near
  0.18 produced Market WASM hash
  `d2f7a9b04bf215bbe5138523fe1e049a2707cc01a2bd35b52a657aa60e646833`,
  matching the live testnet contract. Projection/event 35/35, Market 7/7 and
  paid-media lifecycle 22/22 tests passed.
- READ-ONLY PREFLIGHT: purchases were paused; the target publication was
  `ACTIVE` at 2 USDC; buyer/creator balances, storage registration, separate
  local signers and Market reserve were sufficient. D1 watermark `264030390`
  lagged the observed final tip by 28,863 blocks and contained no entitlement,
  sale or withdrawal rows; Queues stayed unbound.
- RISK: the proposed testnet purchase would leave a permanent entitlement and
  had no refund/delete path. Catch-up and economic mutations therefore required
  separate approvals.
- KANIT: `LOCAL_TEST` + exact-final `TESTNET_READ` + read-only D1/Queue/runtime
  evidence. No chain or D1 mutation occurred.
- GÜNCEL FAZ KAPISI: `MANUAL_CATCHUP_APPROVAL_REQUIRED`.

### CHECKPOINT 142 — Phase 4 bounded manual v1 D1 catch-up

- DURUM:
  `BOUNDED_MANUAL_CATCHUP_PASS / QUEUE_UNBOUND / ECONOMIC_MUTATION_NOT_RUN / RUNTIME_CLOSED`.
- D1 MUTATION: from starting watermark `264030390` /
  `HL9DLPqdqSAGtG5eqrDzyw9fChkVsXedT7dT8dqiubJS`, an explicitly
  authorized detached exact-main worktree advanced 35,078 contiguous blocks to
  fixed final target `264065468` /
  `8YM5LV4yQ4CRm58Xorb2intg1bysLMjH37gegx1u8jNC` without Queue bindings.
- FAIL-CLOSED PROOF: FastNEAR reported zero successful target-contract events
  in every bounded range; 100-block header lists were height/hash/parent
  checked. The D1 trigger rejected gaps, while wrong contract, stale parallel
  work, RPC timeout and incomplete indexed tail left the cursor unchanged.
- FINAL STATE: one publication remained; chain events, media jobs,
  entitlements, sales, withdrawals, governance and archives stayed zero. The
  dark exact-main version remained at 100% with four false flags; primary/DLQ
  remained `0/0`; `DEPLOY_PREVIEW_ENABLED=false`.
- KANIT: separately authorized bounded `D1_WRITE` + exact-final `TESTNET_READ`
  + post-write read-only verification. No purchase, withdrawal, Queue,
  continuous ingestion, alert or support request occurred.
- GÜNCEL FAZ KAPISI: `ECONOMIC_CANARY_APPROVAL_REQUIRED`.

### CHECKPOINT 143 — Phase 4 live testnet sale and withdrawal projection

- DURUM:
  `LIVE_ECONOMIC_PROJECTION_PASS / PURCHASES_REPAUSED / QUEUE_UNBOUND / RUNTIME_RECLOSED`.
- TESTNET MUTATION:
  - admin unpaused purchases in transaction
    `Hav1jP5TBAnS7g3R8Wjf25Ex21nXLTdSZ5uUzT589iwL`;
  - buyer transaction `FcsWfzpKdxXiX2uuBNYHp9wPM4Ri9vigCmdBnzdahHxS`
    paid 2 USDC and created one permanent entitlement, allocating 1.96 USDC to
    the creator and 0.04 USDC to the platform;
  - guardian transaction `EvbrnfLg5fm1EEDnqDpmxVzTBKjTyQAEFKKLen7BXSCH`
    re-paused purchases;
  - creator transaction `mzzxY7tE9yr7HxxFR7Zo9EMKdCnLSk54yCcop4TDy5L`
    withdrew 1.96 USDC successfully.
- D1 PROJECTION: a separately authorized Queue-free bounded apply advanced
  6,085 blocks to `264071553` /
  `5cC4NH1a2VYyt8gQmjnmPJ54cE1YvDKrqTx4436HYJb2`. Five exact final
  events produced `chain_events=5`, `viewer_entitlements=1`, `sale_ledger=1`,
  `withdrawal_history=1`, `governance_audit=2`; the sale reconciles
  `2000000=1960000+40000` and withdrawal is terminal-success.
- CLEANUP/CURRENT BOUNDARY: final chain state has purchases paused, entitlement
  true, creator contract balance zero and expected buyer/creator/Market USDC
  balances. Exact-main CI/Preview deployment remained passed, dark runtime
  flags remained false and dedicated Queues remained unbound.
- KANIT: explicitly authorized `TESTNET_MUTATION` + bounded `D1_WRITE` +
  exact-final chain/D1 reconciliation + read-only cleanup verification. The
  later chain tip moved on, so continuous ingestion remains `UNPROVEN`.
- GÜNCEL FAZ KAPISI: `PAY_001_POLICY_DECISION_REQUIRED`; no automatic next
  runtime or economic action.

### CHECKPOINT 130–143 / PAY-001 document reconciliation closure

- DURUM:
  `DOCUMENT_RECONCILIATION_PASS / PAY_001_PILOT_POLICY_PASS / RUNTIME_UNCHANGED`.
- BASELINE: `origin/main@c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`,
  exact-main CI `31895385141`, Deploy Preview `31895517069` and local PAY-001
  decision commit `cf2e043243a8aef9b13b96506092950b883f22a3`.
- UZLAŞTIRMA:
  - missing Checkpoints 132–143 were copied from the plan into this canonical
    evidence log with local/CI/testnet/D1/deploy classes kept separate;
  - Phase 4 and Section 14 summaries now reflect the v1 D1 watermark, Preview
    publication reads, live testnet economic projection and the accepted
    non-refundable technical-pilot option A;
  - Checkpoint 132 remains an unpublished local prototype; Checkpoint 133 keeps
    full rebuild/RTO 4h deferred beyond the active plan.
- CURRENT READ-ONLY RECHECK (2026-08-15):
  - exact main and its terminal CI/deploy results are unchanged;
  - Preview Web and Bridge plus dark read model remain at the recorded 100%
    versions. Bridge mutation gates and all four dark read-model flags are
    false; publication API read-only mode is true with ingestion/backfill/
    continuation false;
  - v1 D1 remains at `264071553` with counts `1/5/1/1/1/2` for publication,
    chain-event, entitlement, sale, withdrawal and governance rows. Queries
    reported `rows_written=0`, `changed_db=false`;
  - dedicated primary/DLQ each report zero producers and zero consumers;
    read API, Bridge Preview, Web Preview and `youtick.net` returned HTTP 200;
    `DEPLOY_PREVIEW_ENABLED=false`.
- DOĞRULAMA: VitePress docs build and `git diff --check` passed; Checkpoint
  130–143 headings are unique and the critical SHA/run/D1/watermark/PAY-001
  tokens match the plan.
- KANIT: `LOCAL_STATIC` + `LOCAL_TEST` + read-only
  Git/GitHub/Cloudflare/HTTP/D1 evidence.
  This reconciliation performed no deploy, Queue/D1 write, provider, wallet,
  chain, email, alert or support mutation. Its branch CI is `UNPROVEN` until a
  later explicit publish/PR workflow.
- GÜNCEL FAZ KAPISI: `PASS_LOCAL_DOCUMENTATION`. The single next gate is
  EVENT-001 standard event-catalog closure. Stop before any runtime, Queue/D1
  or economic activation.

### CHECKPOINT 144 — Phase 4 / EVENT-001 catalog parity gate

- DURUM:
  `PASS_LOCAL_SOURCE / PARTIAL_TESTNET / CI_UNPROVEN / RUNTIME_UNCHANGED`.
- BASELINE: local branch
  `agent/pay-001-non-refundable-20260815@63edf7158b3e7b340bc42e8a1103784e950bb4e3`,
  two commits ahead of `origin/main@c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`.
- AMAÇ: Close catalog drift locally without inventing a migration event or
  authorizing a contract deploy/testnet transaction.
- UYGULAMA:
  - a standard-library-only mandatory CI regression extracts the Market v2
    Rust event call sites and the two final-event consumer allowlists;
  - it requires the 15 applicable plan events plus
    `bridge_rotation_cancelled`, `new_purchases_paused` and
    `new_purchases_unpaused` to be emitted and accepted exactly;
  - both consumers continue accepting `contract_migrated`, but the fresh-ID
    pilot does not emit it because no migration entrypoint exists;
  - API/testing docs now expose the cancellation event and the same
    `NOT_APPLICABLE_FRESH_ID` boundary.
- DOĞRULAMA:
  - focused catalog regression `1/1` and the read-model/catalog group `42/42`
    passed;
  - Rust 1.86 fmt/clippy passed; Market unit tests `7/7` and paid-media
    lifecycle tests `22/22` passed;
  - mandatory release/security/SLO/catalog tooling passed `155/155`;
  - VitePress docs build and diff whitespace checks passed.
- CURRENT READ-ONLY RECHECK (2026-08-15):
  - exact main CI `31895385141` and Deploy Preview `31895517069` remain
    successful for `c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`;
  - Preview Web version `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0`, Bridge
    version `86305272-4ebb-4ca4-9d0e-11e3bd182b17` and dark read-model
    version `62451057-c6b6-40ff-a8f6-0ac6723d0a1c` are each at 100%;
  - Bridge reports `stage=DISABLED` and every mutation/upload/playback/Queue
    readiness field false. The dark read model has all four runtime flags
    false; publication API version `4442b1f0-2f0c-4adb-945d-3c1a1d80db00`
    has read-only mode true and ingestion/backfill/continuation false;
  - Bridge health and publication reads returned HTTP 200; the publication
    response still reports watermark `264071553`.
- KANIT: `LOCAL_STATIC` + `LOCAL_TEST` + read-only GitHub/Cloudflare/HTTP.
  Branch CI and the remaining 13 live event receipts are `UNPROVEN`.
- RİSK/BLOCKER: No deploy, Queue/D1 activation or write, provider, wallet,
  contract/chain, alert, email or support mutation occurred. Full EVENT-001
  testnet proof requires a separately approved bounded contract deployment and
  chain transaction set; no fake migration action is part of that set.
- GÜNCEL FAZ KAPISI:
  `EVENT_001_SOURCE_PASS / TESTNET_CATALOG_APPROVAL_REQUIRED`. Stop here; do
  not advance to Phase 2–3 staging/runtime evidence automatically.

### CHECKPOINT 145 — Phase 4 / EVENT-001 final testnet catalog proof

- DURUM:
  `PASS_TESTNET_FINAL / CANARY_RECLOSED / CI_UNPROVEN / RUNTIME_UNCHANGED`.
- BASELINE: local
  `agent/pay-001-non-refundable-20260815@6cbb390cde03c7c6ebc739f9ad26c3f3876e103c`,
  three commits ahead of
  `origin/main@c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`.
- YETKİ: The user separately approved the bounded EVENT-001 contract deploy
  and testnet transaction set. Queue/D1, provider and Cloudflare activation
  were not included.
- PREFLIGHT:
  - exact main CI `31895385141` and Deploy Preview `31895517069` remained
    successful; the public Bridge health stayed `stage=DISABLED` with every
    mutation/upload/playback/Queue readiness field false;
  - Rust 1.86/cargo-near rebuilt Market WASM with SHA-256
    `d2f7a9b04bf215bbe5138523fe1e049a2707cc01a2bd35b52a657aa60e646833`,
    matching the reviewed pilot artifact;
  - the canonical Neardata parser recovered 11 distinct applicable catalog
    events with exact final physical identities from the existing fresh pilot
    contract before any new mutation.
- ISOLATED DEPLOY:
  - the first proposed parent account failed local/on-chain key parity before
    signing; no account or fund mutation occurred;
  - transaction `AiPAvgBjnZD1LfA7tHTwYjFEmThzm6hx5Yi2WMpFfzop` created and
    funded `lp-event-144.dev-election2.testnet` with 7.5 testnet NEAR;
  - deploy/init transaction
    `9cBiinfZismi7ZFcjR2Vqcuo8sGKeiuTLNmJCVA66B4x` installed the exact WASM
    behind separate platform/bridge/admin/guardian authorities. The generated
    canary FullAccess key remains in the local legacy keychain and is not
    committed.
- BOUNDED CANARY:
  - one 0.05 NEAR non-refundable native job fee authorized
    `event-144-20260815`; its upload key was replaced and the bridge finalized
    one synthetic publication without any provider call;
  - one 2 USDC testnet purchase created a permanent canary entitlement and
    split `1960000/40000` into creator/platform liabilities;
  - both unregistered payout recipients caused the intended transfer failure:
    creator `withdrawal_failed` was emitted and both liabilities were restored;
    platform withdrawal emitted its required `started` event and restored;
  - the publication then emitted sales suspension and one-way takedown. Bridge
    proposal/cancellation and quote-key rotation supplied the remaining
    governance events;
  - two public-RPC cancellation attempts rate-limited before signing. A bounded
    retry through the preconfigured FastNEAR testnet connection succeeded once;
    no duplicate cancellation event was emitted.
- FINAL EVENT PROOF:
  - `docs/architecture/event-catalog-testnet-evidence.json` records exactly 18
    applicable `youtick_market@1.0.0` events, each with contract, transaction,
    final block/hash, receipt ID, event index and business idempotency key;
  - the mandatory catalog regression proves the evidence names equal the Rust
    producer and both final-event consumer catalogs and that all 18 physical
    identities are unique;
  - `contract_migrated` remains `NOT_APPLICABLE_FRESH_ID` because neither
    contract exposes a migration entrypoint.
- FINAL STATE:
  - canary bridge is frozen, new purchases are paused, pending rotation is
    empty, active bridge is the original bounded bridge, quote-key version is
    2, publication is `TAKEDOWN` and reserve coverage is true;
  - canary holds the permanent entitlement, 2 USDC contract balance,
    `1960000/40000` creator/platform liabilities and the 0.05 NEAR platform
    balance. Account/storage-deposit deletion was not authorized or attempted;
  - the existing pilot contract remains bridge-unfrozen, purchase-paused and
    without a pending rotation. Preview Bridge remains disabled and the public
    read API watermark remains `264071553`.
- DOĞRULAMA: catalog/evidence regression `1/1`, full read-model/catalog group
  `42/42`, Market unit/lifecycle `7/7 + 22/22`, mandatory
  release/security/SLO/catalog tooling `155/155`, live final Neardata evidence
  replay `18/18`, VitePress build and diff whitespace checks passed.
- KANIT: exact reviewed `TESTNET_DEPLOY` + authorized `TESTNET_MUTATION` +
  exact-final `TESTNET_READ` + `LOCAL_TEST`. Branch CI remains `UNPROVEN` until
  publish/PR.
- SINIR: No Cloudflare Worker deploy/flag, Queue producer/consumer, D1 write,
  provider call, Livepeer asset, alert, email or support request occurred.
- GÜNCEL FAZ KAPISI: `EVENT_001_PASS_TESTNET_FINAL`. The single next gate is
  Phase 2 V2 authorizer production-like staging evidence; stop before any
  Cloudflare deploy or runtime activation without separate approval.

### CHECKPOINT 146 — Phase 2 / V2 authorizer production-like staging attempt

- DURUM:
  `BLOCKED_PROVIDER_READ / FAIL_CLOSED / STABLE_RESTORED / NO_JWT`.
- BASELINE: `origin/main@c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`;
  draft PR `#124` exact head
  `6a327835e736a746e08d827644bc9d4a46222bc3` is merge-clean and CI run
  `31906629289` completed successfully, including CI Gate and both CodeQL
  languages. The canary source used that exact PR head.
- YETKİ: The user separately approved one bounded Preview Bridge candidate
  upload, stable 100% + candidate 0% deployment, version-override requests,
  offline local signing, up to three final testnet NEAR reads, exactly one
  Livepeer playback-policy GET, tail evidence and unconditional restoration to
  stable-only 100%. Web deploy, Queue/D1 activation, provider mutation and chain
  transaction were outside scope.
- LOCAL PREFLIGHT:
  - focused V2 integration tests passed `16/16`; two external opt-in cases
    remained skipped, and typecheck passed;
  - 1,000 authorized warm requests completed with zero errors and p95
    `14.19 ms`;
  - Wrangler dry-run produced a `726.54 KiB` bundle (`152.62 KiB` gzip);
  - only `LIVEPEER_BRIDGE_ENABLED`,
    `LIVEPEER_PLAYBACK_ISSUANCE_ENABLED` and
    `LIVEPEER_PLAYBACK_V2_ENABLED` were true. Provider/operator mutation, new
    upload, shadow, Queue and archive flags stayed false; the candidate had no
    Queue, D1 or Durable Object binding.
- BOUNDED DEPLOY: candidate version
  `afffab60-80a4-46a9-8f7b-1fe844a2b1c6` was uploaded with source tag
  `6a327835e736a746e08d827644bc9d4a46222bc3` and added beside stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` at exactly `0%`. Public traffic
  remained on stable at `100%`; only explicit version-overridden requests
  reached the candidate.
- CANARY/TELMETRY:
  - candidate `/__health` returned 200 and the gated V2 surface was ready;
  - an invalid V2 request returned 400 without dependency reads;
  - the signed cold request made exactly three final testnet RPC reads:
    `device_certificate_key` 200 and two `playback_authorization` reads 200;
  - the single Livepeer `playback_read` returned 401 after 408 ms. The Worker
    then emitted `provider_unavailable` and returned 503 in 1,325 ms;
  - no JWT was issued. Fail-closed stopped the flow before the replay sample,
    so successful cold/replay behavior remains `UNPROVEN`.
- RESTORE: the first stable-only deployment request was rejected with Cloudflare
  code `10220` because the candidate upload introduced a newer
  `LIVEPEER_API_KEY` secret version. Wrangler's guarded rollback path confirmed
  that named secret change and forced the already-approved rollback. The final
  deployment contains only stable version
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` at `100%`; public health reports
  `stage=DISABLED` and provider/operator mutation, new upload, playback V1/V2,
  shadow, Queue and archive readiness all false.
- KANIT: `LOCAL_TEST` + exact-head `CI` + bounded `PREVIEW_DEPLOYMENT` +
  version-override HTTP/tail evidence + final `PREVIEW_RUNTIME_READ`. No Web
  deploy, Queue/D1 activation or write, provider mutation, Livepeer asset,
  wallet prompt, chain transaction, alert, email or support request occurred.
- GÜNCEL FAZ KAPISI: `BLOCKED_PROVIDER_READ`. The single next action is an
  explicitly approved Livepeer credential-parity diagnosis/remediation and a
  fresh bounded retry; do not advance to later Phase 2–3 evidence automatically.

### CHECKPOINT 147 — Phase 2 / V2 authorizer credential-parity diagnosis

- DURUM: `ROOT_CAUSE_ISOLATED / PROVIDER_CREDENTIAL_401 /
  EXISTING_TOKEN_IDENTIFIED / LOCAL_CREDENTIAL_PARITY_MISMATCH /
  READ_PREFLIGHT_READY_LOCAL / PROVIDER_READ_CONFIRMATION_REQUIRED /
  RETRY_NOT_RUN / RUNTIME_CLOSED`.
- BASELINE: the current baseline commit is
  `agent/phase2-v2-authorizer-staging-20260815@28a204a7ff6be66608b2469870fa32eae1b8b0f9`;
  `origin/main` remains `c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`.
  Draft PR `#124` remains open/merge-clean at exact head
  `6a327835e736a746e08d827644bc9d4a46222bc3`; CI run `31906629289`
  and exact-main CI run `31895385141` are successful. The current diagnosis
  branch has no PR.
- VARSAYIMLAR VE ÖLÇÜLEBİLİR KABUL:
  - the provider request contract is `Authorization: Bearer <API key>`; the
    existing Worker implementation matches Livepeer's current official
    authentication contract, so an endpoint/header code change is not assumed;
  - Cloudflare and GitHub expose secret names and metadata, not values. The
    signed-in Livepeer project exposes the existing token locally, but its API
    validity and the validity of repository secret `PREVIEW_LIVEPEER_API_KEY`
    remain `UNPROVEN` until the read preflight passes;
  - remediation passes only when the exact existing non-CORS token for the
    canary project returns HTTP 200 for one known playback-policy GET before
    any Worker upload. The secret and response body must not be logged;
  - the bounded V2 retry may start only after that preflight, with the candidate
    at 0%, stable at 100%, only the three read-path flags enabled, every
    provider/operator/upload/shadow/Queue/archive mutation flag false and an
    approved unconditional stable-only restore path.
- TANI:
  - the signed-in Livepeer Studio session resolves to project
    `youtick-paid-media-canary` (`53baeeda-930d-45be-bda6-a41090e6d25e`) and
    exactly one API-key record, `youtick-testnet-worker-20260807`, with CORS
    access `None`. Its value was copied locally without being printed and was
    hidden again in the dashboard;
  - the revealed existing token has a valid bounded credential shape but does
    not equal the ignored local `.dev.vars` value. This directly confirms
    local credential-parity drift without revealing either value;
  - the ignored, mode-0600 local `.dev.vars` contains one syntactically valid
    `LIVEPEER_API_KEY` entry with no outer whitespace, but one direct read-only
    GET for known canary playback `dba5bb2s9shlyo85` returned HTTP 401. No
    response body or secret value was printed;
  - Checkpoint 146's candidate-bound key produced the same HTTP 401 class. The
    exact equality or provenance of those hidden values cannot be read back;
  - stable version `86305272-4ebb-4ca4-9d0e-11e3bd182b17` and failed candidate
    `afffab60-80a4-46a9-8f7b-1fe844a2b1c6` both list the expected
    `LIVEPEER_API_KEY` secret binding. Cloudflare returns only its name/type;
  - repository secret metadata shows `PREVIEW_LIVEPEER_API_KEY` was last
    updated on 2026-08-11, when the existing project token passed the earlier
    paid-canary preflight. This historical success is not current provider
    validity proof;
  - the smallest remediation is operational: reveal/reuse the existing current
    project-scoped token, validate the single read, then supply that validated
    value through a mode-0600 ephemeral candidate secret file. No provider
    change, token creation/rotation or Worker source change is justified. If
    the existing token cannot be validated, rotation is a separate explicit
    decision.
- LOCAL RETRY HAZIRLIĞI:
  - the existing `provider-canary.mjs` now accepts the narrow
    `--read-playback <id>` mode. It validates the API-key/playback-ID shape,
    performs exactly one five-second `GET /api/playback/<id>` and requires HTTP
    200 plus VOD/JWT policy before returning a receipt;
  - the receipt contains only schema, status, bounded kind/policy and a SHA-256
    playback-ID digest. The API key, raw playback ID and response body are not
    emitted. Network, non-200, malformed response and non-JWT policy outcomes
    fail closed with bounded error codes;
  - the default provider canary remains mutation-disabled unless its existing
    explicit flag is true. Read mode has no create, upload or delete call;
  - canonical pre-upload command is `node --env-file-if-exists=.dev.vars scripts/provider-canary.mjs --read-playback <known-playback-id>`. The current
    ignored credential returns bounded `provider_read_preflight_failed_401`;
    candidate upload must not start until the same command returns the redacted
    HTTP-200 VOD/JWT receipt.
- RUNTIME SON DURUMU: a fresh cache-busting public health read still serves
  stable version `86305272-4ebb-4ca4-9d0e-11e3bd182b17`, reports
  `stage=DISABLED`, and keeps upload, provider/operator mutation, playback
  V1/V2, shadow, Queue and archive readiness false. The previous exact 100%
  assignment remains the last verified Cloudflare control-plane evidence. The
  earlier unqualified Wrangler read targeted the production Worker name from
  local `wrangler.toml` and returned independent code `10007`; it did not prove
  an account mismatch.
- DOĞRULAMA: provider/canary tests pass `71/71`; focused V2 tests pass `16/16`
  with two external opt-in cases skipped; the opt-in 1,000-request warm test
  passes with zero errors and fresh local p95 `11.208 ms`. Worker TypeScript check,
  VitePress build and `git diff --check` pass.
- KANIT: current `LOCAL_TEST` + one failed `PROVIDER_READ` + read-only
  `LIVEPEER_DASHBOARD_METADATA` + read-only `GITHUB_METADATA` + fresh public
  `PREVIEW_RUNTIME_READ`. `CI` is historical exact-SHA evidence above.
  Successful `PROVIDER_READ`, `TESTNET`, fresh `DEPLOY` and successful V2
  `RUNTIME` evidence are `UNPROVEN`; the bounded retry was not run.
- GÜNCEL FAZ KAPISI: `PHASE2_V2_BLOCKED_PROVIDER_READ` remains open.
  `DECISION_REQUIRED` immediately before transmitting the locally revealed
  credential in one read-only provider preflight. Secret installation/rotation,
  candidate upload/deploy, traffic shift and the bounded authorizer retry each
  remain separate explicit-approval boundaries. Do not advance to a later gate.

### CHECKPOINT 148 — Phase 2 / V2 provider-read closure

- DURUM: `PASS_PROVIDER_READ / CREDENTIAL_PARITY_ROOT_CAUSE_CONFIRMED /
  BOUNDED_RETRY_READY_FOR_DECISION / RUNTIME_CLOSED / CURRENT_GATE_CLOSED`.
- BASELINE: local branch
  `agent/phase2-v2-authorizer-staging-20260815@28a204a7ff6be66608b2469870fa32eae1b8b0f9`;
  `origin/main@c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`.
  The three-path dirty worktree remains preserved. Unrelated draft PR `#124`
  is still open/merge-clean at `6a327835e736a746e08d827644bc9d4a46222bc3`
  with successful CI run `31906629289`; the current local diff has no PR, so
  current-diff `CI` remains `UNPROVEN`.
- KABUL VE PROVIDER KANITI:
  - the user explicitly approved one read-only Livepeer credential preflight;
  - the existing `youtick-paid-media-canary` project token was supplied from
    the local clipboard without printing or persisting it;
  - exactly one `GET /api/playback/<known-id>` returned the redacted receipt
    `status=200`, `kind=vod`, `policy=jwt` and only a SHA-256 playback-ID
    digest. The API key, raw playback ID and provider response body were not
    emitted;
  - no token creation/rotation, provider change, asset mutation, secret
    installation, deploy, traffic shift or bounded retry occurred.
- EN KÜÇÜK DÜZELTME: no Worker authentication-header or provider-code change
  is required. The current project token is valid; the failed local and prior
  candidate reads were credential-parity drift. Before a bounded retry, the
  exact validated value must be supplied through the already planned
  mode-0600 ephemeral candidate secret input. Whether the GitHub repository
  secret or any existing Cloudflare binding equals that value remains
  `UNPROVEN`; replacing/installing a secret is a separate explicit decision.
- LOCAL_TEST: provider/canary `71/71`; focused V2 `16/16` with two external
  opt-in cases skipped; 1,000-request warm run has zero errors and local p95
  `11.208 ms`; Worker TypeScript check, VitePress build and
  `git diff --check` pass.
- CI: `UNPROVEN` for the current dirty diff. Run `31906629289` is successful
  historical evidence for unrelated PR `#124`, not evidence for this diff.
- TESTNET: successful provider read used the existing testnet canary project
  and policy record; V2 authorizer testnet execution itself was not run and is
  `UNPROVEN`.
- DEPLOY: not run. Repository variable `DEPLOY_PREVIEW_ENABLED=false`.
- RUNTIME: a fresh cache-busting public health read serves stable version
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17`, reports `stage=DISABLED`, and keeps
  provider/operator mutation, upload, playback V1/V2, shadow, Queue and archive
  readiness false. The last exact control-plane assignment remains stable 100%.
  The earlier `10007` came from querying the production Worker name rather than
  `youtick-livepeer-bridge-preview`; it was not an account-scope failure.
- GÜNCEL FAZ KAPISI: `PHASE2_V2_BLOCKED_PROVIDER_READ` is closed. Stop here.
  The single proposed next gate is `PHASE2_V2_BOUNDED_RETRY_DECISION_REQUIRED`;
  do not install a secret, deploy, shift traffic or execute the bounded retry
  without separate explicit approval.

### CHECKPOINT 149 — Phase 2 / V2 bounded production-like staging retry

- DURUM: `PASS_PREVIEW_V2 / JWT_ISSUED / COLD_AND_REPLAY_PASS /
  DEPLOYED_CACHE_HIT_UNPROVEN / STABLE_RESTORED / RUNTIME_CLOSED`.
- BASELINE VE CI: candidate code is exact draft PR `#124` head
  `6a327835e736a746e08d827644bc9d4a46222bc3`; run `31906629289` passed all
  required jobs, CI Gate and both CodeQL languages. The current local
  three-path dirty diff remains preserved and its CI is `UNPROVEN`.
- YETKİ VE SINIR: the user explicitly approved secret installation, bounded
  Preview deploy, version-override traffic and the V2 retry. Web deploy,
  non-zero candidate traffic, provider/chain mutation, Queue/D1 activation and
  Production remained outside the executed scope.
- SECRET VE CANDIDATE:
  - `wrangler versions secret put` created candidate
    `e7659cae-f164-403f-ba41-d6d372eb5e50` by changing only
    `LIVEPEER_API_KEY`; the value was piped from the local clipboard and was
    neither printed nor persisted;
  - its script etag exactly matches failed candidate
    `afffab60-80a4-46a9-8f7b-1fe844a2b1c6`; only Bridge, playback issuance and
    playback V2 flags are true. Provider/operator mutation, new upload, shadow,
    Queue and archive flags are false; no Queue, D1 or Durable Object binding is
    present;
  - Cloudflare deployment assigned stable
    `86305272-4ebb-4ca4-9d0e-11e3bd182b17` exactly 100% and candidate exactly
    0%. Candidate `/__health` returned its exact version ID with
    `playbackV2Ready=true`; an invalid V2 request returned 400.
- BOUNDED CANARY:
  - the mode-0600 local entitled-buyer key signed two ephemeral device
    certificates and request bodies entirely offline: one for the interrupted
    shell command and one for the corrected command. The corrected signed
    request was reused once for replay; no wallet prompt or chain transaction
    occurred;
  - a shell reserved-variable error occurred after the first valid request had
    already been sent, before its local summary was produced. The corrected
    command then sent the planned cold and replay requests. Total valid V2
    invocations were therefore three, not two;
  - all three invocations returned HTTP 200. The two locally summarized
    responses had client latency 1,509 ms and 1,830 ms; both JWTs had three
    segments, `alg=ES256`, `typ=JWT`, valid signatures, exact action/issuer/
    subject/video bindings, 180-second TTL and matching response expiry;
  - candidate-version tail recorded authorization latency 1,159/1,165/1,522 ms.
    Every invocation was `cacheResult=MISS`, `rpcCalls=3`, `providerCalls=1`;
    all device-key, publication, entitlement and Livepeer playback-policy reads
    returned 200. Requests reached more than one edge colo/isolate, so a
    deployed cache-hit sample remains `UNPROVEN`; local warm evidence remains
    the only zero-read cache-hit proof.
- RESTORE VE RUNTIME: candidate was removed from the active deployment.
  Cloudflare control-plane status now assigns only stable version
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` at exactly 100%. Stable version
  metadata lists all eleven tracked runtime flags false; a fresh cache-busting
  public health read returns that exact version, `stage=DISABLED`, and every
  upload/provider/operator/playback V1/V2/shadow/Queue/archive readiness false.
  Repository variable `DEPLOY_PREVIEW_ENABLED=false`.
- LOCAL_TEST: provider/canary `71/71`; focused V2 `16/16` with two external
  opt-in cases skipped; 1,000-request warm run zero errors and p95 `11.208 ms`;
  TypeScript, VitePress and `git diff --check` pass.
- CI: `PASS` for exact candidate source SHA `6a327835...`; current dirty diff
  remains `UNPROVEN`.
- TESTNET: `PASS_READ` for three final NEAR reads and one Livepeer policy read
  per invocation; no testnet write occurred.
- DEPLOY: `PASS_BOUNDED_PREVIEW`; candidate was 0% and restore is stable-only
  100%. No Production deploy occurred.
- RUNTIME: `PASS_PREVIEW_V2` for version-overridden authorization and JWT
  issuance; final public runtime is closed. Deployed cache-hit behavior remains
  `UNPROVEN`.
- GÜNCEL FAZ KAPISI: the production-like V2 authorizer staging gate is closed.
  Stop here. The single proposed next gate is
  `PHASE2_SHADOW_STAGING_DECISION_REQUIRED`; do not enable shadow execution or
  advance further without a new explicit decision.

### CHECKPOINT 150 — Phase 2 / bounded legacy-v2 shadow staging

- DURUM: `PARTIAL_PREVIEW_SHADOW / DENY_MATCH_PASS / MISMATCH_0_OF_1 /
  ALLOW_SAMPLE_BLOCKED_NO_LEGACY_GRANT / STABLE_RESTORED / RUNTIME_CLOSED`.
- BASELINE VE CI: local branch remains
  `agent/phase2-v2-authorizer-staging-20260815@28a204a7ff6be66608b2469870fa32eae1b8b0f9`;
  `origin/main@c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`. Draft PR `#124`
  remains open, draft and mergeable at exact head
  `6a327835e736a746e08d827644bc9d4a46222bc3`; run `31906629289`, CI Gate
  and both CodeQL languages remain successful. The candidate runtime source
  and package inputs have no diff from that exact PR head; the current
  provider-canary/docs dirty diff remains preserved and its CI is `UNPROVEN`.
- VARSAYIMLAR VE ÖLÇÜLEBİLİR KABUL:
  - candidate traffic must remain 0% while stable remains 100%; only Bridge,
    legacy playback issuance and v2 shadow may be true. Direct v2,
    provider/operator mutation, new upload, Queue and archive flags stay false;
  - the user-visible result must remain the legacy response contract. Shadow
    runs only after that result is fixed, emits bounded decisions/reason codes,
    produces no JWT and adds no durable write;
  - closure requires at least one valid `ALLOW/ALLOW` pair and one valid
    `DENY/DENY` pair, zero mismatch across both, exact candidate tail evidence,
    and an unconditional stable-only restore. One-sided evidence cannot close
    the gate;
  - no grant issuance, payment, provider mutation, Livepeer asset operation,
    Queue/D1 activation, Web/Production deploy or non-zero candidate traffic is
    authorized by this bounded run.
- TESTNET PREFLIGHT:
  - publication `lp-0b8d85d5-501f-41ad-8dc6-3fc340fd99f7` was ACTIVE at final
    block `264094810`, generation 1 and playback
    `dba5bb2s9shlyo85`;
  - the selected negative account had a live FullAccess key but
    `has_entitlement=false` at the same block. This allowed independently valid
    legacy and device-certificate proofs without a chain mutation;
  - read-only `list_session_grants` checks returned zero grants for the six
    available buyer/creator/test credential owners. In particular, the
    entitled buyer used in Checkpoint 149 has no legacy `Play` grant. A valid
    positive legacy request therefore cannot be produced from current state
    without an explicitly approved grant-issuance transaction.
- CANDIDATE VE GUARDS:
  - a local-only temporary Wrangler configuration was dry-run, used and then
    deleted. Candidate `dca6bc56-82ba-4126-bb67-e9453d47fcf3`, tagged with
    exact source SHA `6a327835...`, inherited the already validated secret
    bindings without printing values and added only the existing
    `LIVEPEER_CONTROL` binding required by legacy playback;
  - candidate metadata has Bridge, legacy playback issuance and shadow true;
    direct v2 plus every provider/operator/new-upload/Queue/archive flag false.
    It has no Queue or D1 binding;
  - Cloudflare assigned stable
    `86305272-4ebb-4ca4-9d0e-11e3bd182b17` exactly 100% and candidate exactly
    0%. Version-overridden health returned the exact candidate ID,
    `playbackReady=true`, `playbackShadowV2Ready=true`, mutation/readiness
    guards false; direct `/v2/playback-tokens` returned 503.
- BOUNDED RUNTIME:
  - one preliminary request used the production origin and failed before DO or
    shadow execution with `origin_denied`; the inherited Preview allowlist was
    then read and no setting was changed;
  - one correctly bound request used an ephemeral signed legacy session key
    and an independently signed eight-hour device certificate. The legacy
    result was HTTP 403 `playback_denied`, `no-store`, in 1,674 ms;
  - candidate tail recorded legacy `DENY/playback_denied` and v2
    `DENY/playback_denied` with `decisionMatch=true`; observed mismatch is
    exactly `0/1` for the valid comparison;
  - legacy execution made four successful final testnet reads and wrote only
    its bounded replay nonce. V2 shadow made three successful reads
    (`device_certificate_key`, publication and entitlement), stopped on the
    negative entitlement, made zero Livepeer provider calls, emitted no JWT
    and produced no shadow storage event.
- RESTORE VE RUNTIME: tail was stopped before restore. Candidate was removed
  from the deployment; the control plane now assigns only stable version
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` at exactly 100%. Stable metadata lists
  all eleven tracked flags false. A fresh cache-busting public health read
  returns that exact version, `stage=DISABLED`, and every playback, mutation,
  upload, Queue and archive readiness false. Repository variable
  `DEPLOY_PREVIEW_ENABLED=false`.
- LOCAL_TEST: playback/shadow and v2 files pass `33/33` with two external
  opt-in cases skipped; Worker TypeScript check passes. Final VitePress build
  and `git diff --check` are recorded after this checkpoint edit.
- CI: `PASS` for exact candidate source SHA `6a327835...`; current dirty diff
  is `UNPROVEN`.
- TESTNET: `PASS_READ_DENY_PAIR`; no testnet write occurred. Positive pair is
  `BLOCKED_NO_LEGACY_GRANT`.
- DEPLOY: `PASS_BOUNDED_PREVIEW`; candidate stayed 0%, stable stayed 100% and
  final assignment is stable-only 100%. No Production/Web deploy occurred.
- RUNTIME: `PARTIAL_PREVIEW_SHADOW`; the valid negative pair passed with zero
  mismatch. Positive shadow behavior remains `UNPROVEN`, so the approved
  two-sided acceptance criterion is not met.
- GÜNCEL FAZ KAPISI: `PHASE2_SHADOW_STAGING` remains open and
  `DECISION_REQUIRED` for a narrowly scoped testnet legacy `Play` grant before
  one positive `ALLOW/ALLOW` shadow sample. Stop here. The single proposed next
  gate is `PHASE2_SHADOW_ALLOW_GRANT_DECISION_REQUIRED`; do not issue a grant,
  deploy or run another sample without a new explicit decision.

### CHECKPOINT 151 — Phase 2 / positive legacy-v2 shadow closure

- DURUM: `PASS_PREVIEW_SHADOW / ALLOW_MATCH_PASS / AGGREGATE_MISMATCH_0_OF_2 /
  ONE_SHORT_LIVED_TESTNET_GRANT / STABLE_RESTORED / RUNTIME_CLOSED /
  GRANT_EXPIRED`.
- YETKİ VE SINIR: the user's `devam et` approved the single proposed
  `PHASE2_SHADOW_ALLOW_GRANT_DECISION_REQUIRED` gate. Executed scope was one
  zero-deposit short-lived testnet legacy `Play` grant, the existing candidate
  at 0%, one version-overridden positive shadow sample and stable-only restore.
  Payment, provider/asset mutation, Queue/D1, Web/Production, non-zero traffic,
  secret change and grant revocation were not executed.
- BASELINE VE CI: local branch remains
  `agent/phase2-v2-authorizer-staging-20260815@28a204a7ff6be66608b2469870fa32eae1b8b0f9`;
  `origin/main@c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`. Draft PR `#124`
  remains open, draft and mergeable at exact candidate source head
  `6a327835e736a746e08d827644bc9d4a46222bc3`; all checks, CI Gate and both
  CodeQL languages are successful. The current three-path dirty diff remains
  preserved and its CI is `UNPROVEN`.
- VARSAYIMLAR VE ÖLÇÜLEBİLİR KABUL:
  - the one transaction must call only `issue_session_grant` on fresh Access
    v2, attach zero deposit and request a 180-second Play grant bound to the
    entitled buyer, exact publication, Preview origin and ephemeral device;
  - the candidate must remain 0% beside stable 100%. Only Bridge, legacy
    playback issuance and shadow may be true; direct v2 and every mutation,
    upload, Queue and archive flag remain false;
  - the one user-visible response must be HTTP 200 legacy v1/no-store. Tail
    must record `ALLOW/authorized` for both decisions, `decisionMatch=true`,
    no shadow JWT/storage write and only read-only NEAR/Livepeer dependencies;
  - combined with Checkpoint 150's valid negative pair, closure requires exact
    aggregate mismatch `0/2`, stable-only restore and natural grant expiry.
- PREFLIGHT:
  - at final block `264095844`, Access v2 reported `paused=false`,
    `grant_issuance_enabled=true`, Play `max_ttl_ms=600000` with required origin
    and device bindings, and zero grants for the buyer;
  - the publication was ACTIVE at generation 1 with exact playback ID; buyer
    entitlement was true, its local credential resolved to a live FullAccess
    key and the account had sufficient gas balance;
  - Worker playback/shadow tests passed `33/33` with two external opt-in cases
    skipped, Worker TypeScript passed, Web access-grant/shadow tests passed
    `14/14`, and the targeted Access grant policy test passed `1/1`. An initial
    incomplete `--exact` filter selected zero Rust tests and is not counted.
- DEPLOY GUARDS:
  - existing candidate `dca6bc56-82ba-4126-bb67-e9453d47fcf3` was reused; no
    upload, secret or binding change occurred. Candidate remained exactly 0%
    while stable `86305272-4ebb-4ca4-9d0e-11e3bd182b17` remained 100%;
  - version-overridden health returned the exact candidate ID,
    `playbackReady=true`, `playbackShadowV2Ready=true`; direct v2 returned 503
    and provider/operator/new-upload/Queue/archive readiness remained false.
- TESTNET WRITE:
  - transaction `Etz5NaqYG9joD5M2FSC9JdM7gj3NG41Zy8RkEfLt4SZk` reached final status
    `FINAL`. It contains one `issue_session_grant` action to
    `lp-arch-access-v2-260809.youtick-dev-v3.testnet`, zero deposit and no other
    action;
  - a final-state read at block `264096074` matched buyer, exact publication,
    Preview origin/device bindings, `scope=Play`, `revoked=false` and the
    requested 180-second TTL. The ephemeral session private key remained only
    in process memory and was not printed or persisted;
  - no revoke/cleanup transaction was sent. The first post-restore check found
    one active record with approximately 81 seconds remaining. A later final
    read at block `264096398` found the retained record but `activeCount=0`
    and zero remaining lifetime, proving natural expiry without another write.
- POSITIVE SHADOW SAMPLE:
  - the single version-overridden request returned HTTP 200 in 1,143 ms,
    `Cache-Control: no-store`, exact schema
    `youtick.livepeer-playback-token.v1` and exact playback ID. Its JWT had
    three segments, matching issuer/subject and a 174-second bounded TTL;
  - candidate tail reported 724 ms edge latency. Legacy execution made four
    successful final NEAR reads and wrote only its bounded replay nonce;
  - v2 shadow made three successful NEAR reads plus one successful Livepeer
    playback-policy read, emitted no JWT or storage event, and logged
    `legacyDecision=ALLOW`, `legacyReasonCode=authorized`,
    `v2Decision=ALLOW`, `v2ReasonCode=authorized`, `decisionMatch=true`;
  - combined with Checkpoint 150's valid `DENY/DENY` pair against the same
    candidate, the accepted two-sided mismatch ratio is exactly `0/2`.
- RESTORE VE RUNTIME: tail was stopped before restore. Candidate was removed
  from the active deployment. Cloudflare now assigns only stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` at exactly 100%; stable metadata lists
  all eleven tracked flags false. A fresh cache-busting public health read
  returns that exact version, `stage=DISABLED`, and every playback, mutation,
  upload, Queue and archive readiness false. Repository variable
  `DEPLOY_PREVIEW_ENABLED=false`.
- LOCAL_TEST: `PASS` as detailed above; final VitePress and
  `git diff --check` pass after the expiry update.
- CI: `PASS` for exact candidate source SHA `6a327835...`; current dirty diff
  is `UNPROVEN`.
- TESTNET: `PASS_WRITE_BOUNDED` for the one final zero-deposit grant action and
  `PASS_READ` for final grant/publication/entitlement/authorization evidence.
  `PASS_EXPIRY` for the final-state zero-active-grant read.
- DEPLOY: `PASS_BOUNDED_PREVIEW`; candidate stayed 0%, stable stayed 100% and
  final assignment is stable-only 100%. No Production/Web deploy occurred.
- RUNTIME: `PASS_PREVIEW_SHADOW`; positive and negative decision pairs both
  matched, aggregate mismatch is exactly zero and final public runtime is
  closed.
- GÜNCEL FAZ KAPISI: `PHASE2_SHADOW_STAGING` is closed with exact two-sided
  mismatch `0/2`, stable-only restore and natural grant expiry. Stop here. The
  single proposed next gate is `PHASE2_CACHE_HIT_PREVIEW_DECISION_REQUIRED`;
  do not deploy or run another sample without a new explicit decision.

### CHECKPOINT 152 — Phase 2 / bounded deployed V2 cache hit

- DURUM: `PASS_PREVIEW_CACHE_HIT / ONE_COLD_MISS / ELEVEN_WARM_HITS /
  WARM_RPC_0 / WARM_PROVIDER_0 / CACHE_HIT_P95_100_MS / STABLE_RESTORED /
  RUNTIME_CLOSED`.
- YETKİ VE SINIR: the user's approval applied only to the proposed bounded
  cache-hit gate: stable 100%, existing v2 candidate 0%, at most twelve
  version-overridden same-request reads and unconditional stable-only restore.
  Secret changes, testnet writes, provider mutation, Queue/D1, Durable Object,
  Web/Production and non-zero candidate traffic were not executed.
- BASELINE VE CI: local branch remains
  `agent/phase2-v2-authorizer-staging-20260815@28a204a7ff6be66608b2469870fa32eae1b8b0f9`;
  `origin/main@c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`. Draft PR `#124`
  remains open, draft and mergeable at exact candidate source head
  `6a327835e736a746e08d827644bc9d4a46222bc3`; all checks, CI Gate and both
  CodeQL languages are successful. The current three-path dirty diff remains
  preserved and its CI is `UNPROVEN`.
- VARSAYIMLAR VE ÖLÇÜLEBİLİR KABUL:
  - one independently signed v2 request body must be reused serially over one
    HTTP/1.1 keep-alive connection, with a hard maximum of twelve invocations;
  - every response must be HTTP 200 v2, exact issuer/subject and 180-second JWT
    TTL. At least one exact-candidate tail event must report
    `cacheResult=HIT`, `rpcCalls=0`, `providerCalls=0`;
  - cache-hit client p95 must remain below the approved 500 ms starting target,
    internal error ratio must remain below 0.5%, and the cold call must remain
    bounded at no more than three NEAR reads plus one provider-policy read;
  - candidate remains 0%; only Bridge, playback issuance and direct v2 are
    true. Legacy, shadow, mutation, upload, Queue and archive readiness remain
    false, followed by stable-only restore.
- PREFLIGHT:
  - stable public runtime served exact version
    `86305272-4ebb-4ca4-9d0e-11e3bd182b17`, `stage=DISABLED`, with every
    readiness false. Wrangler OAuth resolved the expected Cloudflare account;
  - existing candidate `e7659cae-f164-403f-ba41-d6d372eb5e50` retained exact
    source tag `6a327835...-v2-retry`, the validated secret bindings and no DO,
    Queue or D1 binding. Metadata had only Bridge, playback issuance and v2
    true; every mutation/shadow/Queue/archive flag false;
  - at final block `264096824`, the publication remained ACTIVE at generation
    1 with exact playback ID; buyer entitlement was true and its credential was
    a live FullAccess key;
  - focused v2 tests passed `16/16` with two external opt-in cases skipped;
    TypeScript passed. The opt-in 1,000-request warm test passed with zero
    errors and fresh p95 `9.507 ms`.
- DEPLOY GUARDS: Cloudflare assigned stable exactly 100% and candidate exactly
  0%. Version-overridden health returned the exact candidate ID,
  `playbackV2Ready=true`; legacy/shadow and every provider/operator/new-upload/
  Queue/archive readiness remained false. No upload or setting change occurred.
- BOUNDED CACHE SAMPLE:
  - the exact same signed body and certificate were sent twelve times. All
    twelve returned HTTP 200 schema `youtick.livepeer-playback-token.v2`, exact
    playback/issuer/subject and 180-second JWT TTL; error ratio was zero;
  - the first request opened the connection and took 1,450 ms. The next eleven
    reused the same socket and took 89–100 ms; their nearest-rank p95 was
    100 ms, below the 500 ms target;
  - candidate tail recorded the first call as `cacheResult=MISS`,
    `rpcCalls=3`, `providerCalls=1`, authorization latency 995 ms. All next
    eleven events were `cacheResult=HIT`, `rpcCalls=0`, `providerCalls=0`,
    authorization latency 0 ms;
  - the candidate has no persistent-state binding, and no testnet/provider
    write path was enabled or invoked.
- RESTORE VE RUNTIME: the filtered tail was stopped before restore. Candidate
  was removed from the active deployment. Cloudflare now assigns only stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` at exactly 100%; stable metadata lists
  all eleven tracked flags false. A fresh cache-busting public health read
  returns that exact version, `stage=DISABLED`, and every playback, mutation,
  upload, Queue and archive readiness false. Repository variable
  `DEPLOY_PREVIEW_ENABLED=false`.
- LOCAL_TEST: `PASS` for focused v2, opt-in warm load and TypeScript; final
  VitePress and `git diff --check` follow this checkpoint edit.
- CI: `PASS` for exact candidate source SHA `6a327835...`; current dirty diff
  is `UNPROVEN`.
- TESTNET: `PASS_READ`; the one cold request performed three final reads and
  eleven warm requests performed zero. No testnet write occurred.
- DEPLOY: `PASS_BOUNDED_PREVIEW`; candidate stayed 0%, stable stayed 100% and
  final assignment is stable-only 100%. No Production/Web deploy occurred.
- RUNTIME: `PASS_PREVIEW_CACHE_HIT`; all responses succeeded, warm read counts
  were zero and deployed cache-hit p95 met the approved target.
- GÜNCEL FAZ KAPISI: `PHASE2_CACHE_HIT_PREVIEW` is closed. Stop here. The
  single proposed next gate is
  `PHASE2_DEVICE_CERT_UX_PREVIEW_DECISION_REQUIRED`; do not deploy Web, prompt
  a wallet or advance automatically without a new explicit decision.

### CHECKPOINT 153 — Phase 2 / device-certificate browser UX preflight

- DURUM: `BLOCKED_WALLET_NOT_READY / NO_SIGNATURE / NO_TESTNET_WRITE /
  STABLE_RESTORED / RUNTIME_CLOSED`.
- YETKİ VE SINIR: the user's continuation approved only the proposed
  device-certificate UX gate. The bounded target was one successful wallet
  `signMessage`, one direct v2 playback and reload-based memory-clear proof.
  Payment, grant or other chain write, provider mutation, Queue/D1,
  Production and non-zero candidate traffic were excluded.
- BASELINE VE CI: local branch remains
  `agent/phase2-v2-authorizer-staging-20260815@28a204a7ff6be66608b2469870fa32eae1b8b0f9`;
  `origin/main@c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`. Draft PR `#124`
  remains open, draft and mergeable at exact head
  `6a327835e736a746e08d827644bc9d4a46222bc3`; all checks, CI Gate and both
  CodeQL languages are successful. The pre-existing three-path dirty diff was
  preserved; this updated dirty diff has no CI and is `UNPROVEN`.
- VARSAYIMLAR VE ÖLÇÜLEBİLİR KABUL:
  - exact PR Web and Bridge source must be used; Web and Bridge candidates
    must remain 0% while both stable versions remain 100%; version overrides
    or an isolated preview origin must select only the candidates;
  - the connected wallet must expose the entitled buyer
    `lp-d6-buyer-5301d15.youtick-dev-v3.testnet`. At most one wallet
    `signMessage` approval may certify an eight-hour memory-only device key;
  - direct v2 must return HTTP 200 for publication
    `lp-0b8d85d5-501f-41ad-8dc6-3fc340fd99f7`, generation 1 and playback
    `dba5bb2s9shlyo85`; a second same-page request must reuse the certificate
    without another approval;
  - reload must discard the in-memory device key and require a new signature.
    Disconnect is excluded because the current UI first requests an on-chain
    `revoke_subject_sessions` transaction. Stable-only restore and all public
    readiness false are unconditional.
- LOCAL PREFLIGHT:
  - `apps/web` trees at main `c80377b...`, PR `6a327835...` and local HEAD are
    byte-identical at tree `ea1f2e55c62319114cdeb961fe10f15cb7a16936`;
  - Web device-session and direct-v2 tests passed `6/6`; Web TypeScript passed;
    Bridge v2/index tests passed `86` with two skipped external opt-in cases;
  - an exact-source OpenNext Preview build completed with only the Web
    paid-media UI gate and direct-v2 authorizer enabled; no repository source
    file changed during the build.
- DEPLOY PREFLIGHT:
  - Web candidate `e45d468a-1823-431f-8d5c-77c04fae37dd`, tag
    `6a327835...-device-cert-v2`, was uploaded. Cloudflare assigned it exactly
    0% beside stable Web `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` at 100%; its
    isolated preview alias served the candidate `/watch` bundle;
  - Bridge candidate `e7659cae-f164-403f-ba41-d6d372eb5e50` was assigned 0%
    beside stable Bridge `86305272-4ebb-4ca4-9d0e-11e3bd182b17` at 100%.
    One dictionary version-override selected both exact candidates: the Web
    watch chunk changed to the candidate bundle and Bridge health returned the
    exact candidate with only direct-v2 readiness true;
  - Brave automation cannot attach the Cloudflare override header. A second
    undeployed Bridge version `97ec4f30-7857-4d92-b146-ddbf2445b65b`
    preserved the existing secret bindings, allowed only Preview plus the Web
    candidate origin, kept every mutation/Queue/archive flag false and enabled
    only Bridge/playback issuance/direct-v2. The Worker has preview URLs
    disabled, so this version was not exposed or deployed.
- BROWSER PREFLIGHT VE BLOCKER:
  - the isolated Web candidate loaded successfully in the existing Brave
    profile and exposed the wallet selector. Meteor Wallet opened, but was
    locked and displayed creator account
    `lp-arch-creator-260809.youtick-dev-v3.testnet`, not the entitled buyer;
  - no password was read or entered, no account was changed, no connection was
    approved and no device certificate or playback request was produced.
    Nightly was not installed and the Intear embedded surface was blocked;
  - the required browser proof therefore remains `UNPROVEN`. The independent
    blocker is a user-unlocked Meteor session switched to the exact entitled
    buyer; wallet credentials must not be shared with automation.
- RESTORE VE RUNTIME: no non-zero canary ran. Web candidate and Bridge
  candidate were removed from active deployments. Cloudflare now assigns only
  Web stable `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` and Bridge stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17`, each at exactly 100%. Fresh Bridge
  health returns the exact stable ID, `stage=DISABLED` and every playback,
  mutation, upload, Queue and archive readiness false. Repository variable
  `DEPLOY_PREVIEW_ENABLED=false`.
- LOCAL_TEST: `PASS` for the focused Web/Bridge suites, TypeScript and exact
  Web source-tree identity; final docs build and diff checks follow this edit.
- CI: `PASS` for exact source SHA `6a327835...`; current dirty diff is
  `UNPROVEN`.
- TESTNET: `NOT_RUN`; no read/write acceptance sample or transaction was
  executed for this gate.
- DEPLOY: `PASS_PREFLIGHT_ONLY`; both exact candidates were proven at 0% and
  both public Workers were restored stable-only 100%. No Production deploy or
  non-zero traffic shift occurred.
- RUNTIME: `BLOCKED_WALLET_NOT_READY`; no signature, v2 playback or reload
  proof exists. Public stable runtime is closed.
- GÜNCEL FAZ KAPISI: `PHASE2_DEVICE_CERT_UX_PREVIEW` remains open and
  `DECISION_REQUIRED`. Stop here. The single proposed next gate is
  `PHASE2_DEVICE_CERT_UX_PREVIEW_WALLET_READY_DECISION_REQUIRED`: the user
  unlocks Meteor locally, switches to exact buyer account, shares no password,
  then explicitly approves the one-signature bounded continuation.

### CHECKPOINT 154 — Phase 2 / device-certificate locked-wallet retry

- DURUM: `EXACT_BUYER_CONFIRMED / BLOCKED_WALLET_LOCKED / NO_SIGNATURE /
  V2_NOT_RUN / STABLE_RESTORED / RUNTIME_CLOSED`.
- YETKİ VE SINIR: the user explicitly approved one device-certificate
  `signMessage`. The bounded attempt allowed the already prepared Preview Web
  and Bridge candidates, but still excluded `AddKey`, payment, grant or other
  chain write, provider mutation, Queue/D1, Production and disconnect. Because
  Brave cannot attach the Cloudflare version-override header, the previously
  approved Preview traffic scope was used only long enough to expose the
  guarded Bridge candidate to the isolated Web origin.
- RECHECK VE KABUL: branch, local HEAD, `origin/main`, dirty paths and PR #124
  remain unchanged from Checkpoint 153. PR #124 is still open, draft and
  mergeable at exact head `6a327835...`; all reported checks remain successful.
  Acceptance still requires exactly one wallet signature, direct-v2 HTTP 200,
  same-page certificate reuse without a second prompt, reload requiring a new
  signature and unconditional stable-only restore.
- BOUNDED DEPLOY:
  - Bridge candidate `97ec4f30-7857-4d92-b146-ddbf2445b65b` was first added at
    0% beside stable `86305272-4ebb-4ca4-9d0e-11e3bd182b17` at 100%; an exact
    version override returned candidate health with only direct-v2 readiness
    true. The isolated Web origin received a 204 CORS preflight with its exact
    `Access-Control-Allow-Origin` value;
  - Bridge Preview was then bounded to candidate 100% and stable 0%. Public
    health returned the exact candidate version. Provider/operator mutation,
    new upload, legacy/shadow playback, Queue and archive readiness remained
    false. Web public traffic and Web deployment were not changed;
  - after the locked-wallet result, Bridge was restored to stable-only 100%.
    Fresh public health returned the exact stable version, `stage=DISABLED`
    and every playback, mutation, upload, Queue and archive readiness false.
    Web also remains stable-only 100% and `DEPLOY_PREVIEW_ENABLED=false`.
- BROWSER VE RUNTIME:
  - the isolated Web showed the exact entitled buyer
    `lp-d6-buyer-5301d15.youtick-dev-v3.testnet`, the expected publication and
    `Confirming ticket access`;
  - Meteor opened the exact testnet `sign_message` request for that buyer, but
    required the wallet password before displaying the signing decision. The
    automation did not read or enter a password and closed the popup. No
    signature proof, `/v2/playback-tokens` request, JWT or playback resulted;
  - the candidate tail observed only a GET cover request and its read-only NEAR
    and Livepeer dependencies. It observed no direct-v2 authorization event or
    write path. This is preflight evidence, not successful runtime acceptance.
- LOCAL_TEST: `PASS`; Web device-session/direct-v2 tests passed `6/6` and Web
  TypeScript passed. Bridge V2/index tests passed `86` with two external opt-in
  cases skipped and Bridge TypeScript passed.
- CI: `PASS` for exact source SHA `6a327835...`; current dirty documentation
  and provider-canary diff remains `UNPROVEN`.
- TESTNET: `PASS_READ_PREFLIGHT_ONLY / V2_NOT_RUN`; no testnet transaction or
  write occurred.
- DEPLOY: `PASS_BOUNDED_ATTEMPT / STABLE_RESTORED`; the guarded candidate was
  temporarily public only for this browser attempt and final control-plane
  assignments are Web stable 100% and Bridge stable 100%.
- RUNTIME: `BLOCKED_WALLET_LOCKED`; exact buyer/account routing is proven, but
  the one-signature, direct-v2 200, same-page reuse and reload-clear acceptance
  remain `UNPROVEN`.
- GÜNCEL FAZ KAPISI: `PHASE2_DEVICE_CERT_UX_PREVIEW` remains open. Stop here.
  The single proposed continuation is
  `PHASE2_DEVICE_CERT_UX_PREVIEW_WALLET_UNLOCKED_RETRY_DECISION_REQUIRED`: the
  user unlocks the already open Meteor tab locally without sharing the
  password, then explicitly approves one fresh bounded signature attempt.

### CHECKPOINT 155 — Phase 2 / post-signature playback failure diagnosis

- DURUM: `USER_REPORTED_SIGNATURE_APPROVAL / PLAYBACK_FAILED /
  ROOT_CAUSE_STABLE_CONTROL_PLANE_DISABLED / NO_JWT_PROOF /
  STABLE_100 / RUNTIME_CLOSED`.
- OBSERVED BROWSER STATE: after unlocking Meteor and approving the pending
  request locally, the user reported that video did not open. The exact Web
  candidate page currently shows the entitled buyer, expected publication and
  `Playback is temporarily unavailable. Please try again.` with a `Try again`
  button. The browser console also contains wallet-connector `Iframe not
  loaded` errors; those errors do not prove whether a valid signature proof was
  returned and are not counted as successful authorization evidence.
- ROOT CAUSE:
  - Checkpoint 154 restored Bridge to stable-only before the user-local wallet
    approval because the wallet was locked and no password could be entered by
    automation. The pending page therefore resumed against the closed stable
    Bridge rather than candidate `97ec4f30...`;
  - Cloudflare control-plane status still assigns only stable Bridge
    `86305272-4ebb-4ca4-9d0e-11e3bd182b17` at 100%. Fresh health reports
    `stage=DISABLED` and direct-v2 readiness false;
  - an independent empty POST from the exact isolated Web origin to the public
    `/v2/playback-tokens` route returned HTTP 503
    `control_plane_disabled`. Source order checks the three Bridge/playback/v2
    runtime flags before parsing or verifying a request. The visible playback
    failure is therefore explained by the intentional stable guard, not by a
    provider/video failure.
- SAFETY: no new deploy, traffic shift, provider mutation, Queue/D1 action,
  wallet prompt or chain transaction was initiated during this diagnosis.
  Web remains stable-only `874a3f92...` at 100%, Bridge remains stable-only
  `86305272...` at 100%, all public readiness fields are false and repository
  variable `DEPLOY_PREVIEW_ENABLED=false`.
- LOCAL_TEST: focused Web/Bridge tests and type checks are rerun below after
  this evidence edit. No source code change is required by the diagnosed
  failure.
- CI: exact candidate source SHA `6a327835...` remains green; the current dirty
  evidence/provider-canary diff remains `UNPROVEN`.
- TESTNET: `USER_REPORTED_SIGNATURE_APPROVAL / AUTHORIZATION_UNPROVEN`; no
  successful v2 read receipt, JWT or testnet write exists for this attempt.
- DEPLOY: `NOT_RUN_THIS_DIAGNOSIS / STABLE_100`.
- RUNTIME: `FAIL_EXPECTED_CLOSED_STABLE`; the failed attempt does not close the
  one-signature, v2 HTTP 200, same-page reuse or reload-clear acceptance.
- GÜNCEL FAZ KAPISI: `PHASE2_DEVICE_CERT_UX_PREVIEW` remains open. Stop here.
  The single proposed continuation is
  `PHASE2_DEVICE_CERT_UX_PREVIEW_ALIGNED_RETRY_DECISION_REQUIRED`: only after a
  new explicit approval, start candidate traffic and tail first, then create
  one fresh wallet request while Meteor is already unlocked; restore stable
  immediately after the success/failure verdict.

### CHECKPOINT 156 — Phase 2 / aligned device-certificate browser acceptance

- DURUM: `PASS_PREVIEW_DEVICE_CERT / PASS_V2_PLAYBACK /
  PASS_SAME_PAGE_CERTIFICATE_REUSE / PASS_RELOAD_MEMORY_CLEAR /
  NO_SECOND_SIGNATURE / STABLE_RESTORED / CURRENT_GATE_CLOSED`.
- YETKİ VE SINIR: the user explicitly approved temporary Bridge candidate
  100%, exact-version tail and the existing `Try again` action. A fresh wallet
  signature was excluded unless separately confirmed. Reload was used only to
  prove memory clear; its new Meteor request was not approved. Payment,
  `AddKey`, grant/revoke or other chain write, disconnect, provider mutation,
  Queue/D1 and Production remained excluded.
- BASELINE VE PREFLIGHT:
  - local branch/HEAD and the three preserved dirty paths remained unchanged;
    draft PR #124 was open, mergeable and green at exact candidate source
    `6a327835e736a746e08d827644bc9d4a46222bc3`;
  - stable Bridge was initially 100% and `stage=DISABLED`. Candidate
    `97ec4f30-7857-4d92-b146-ddbf2445b65b` carried the exact source tag and had
    only Bridge, playback issuance and direct v2 true. Mutation, new-upload,
    legacy/shadow, Queue and archive flags were false, payment mode was off and
    no Queue, D1 or Durable Object binding was present.
- ALIGNED BROWSER CANARY:
  - Bridge Preview was temporarily assigned candidate 100% and stable 0%;
    exact-version health returned `playbackV2Ready=true` with all excluded
    readiness fields false. Tail was active before the browser retry;
  - the existing in-memory certificate from the user's one approved Meteor
    signature was reused by `Try again`; no new wallet window opened. The first
    direct-v2 POST returned HTTP 200 in 987 ms. Tail recorded `cacheResult=MISS`,
    exactly three final NEAR reads and one Livepeer playback-policy read, all
    HTTP 200. The browser accepted the token and rendered the video controls;
  - after about 151 seconds, the page's automatic token refresh produced a
    second direct-v2 POST. It returned HTTP 200 in 1,671 ms and no wallet prompt
    appeared, proving same-page certificate reuse. The second edge invocation
    was another `MISS` with three NEAR reads and one provider read; this gate
    proves browser certificate reuse, not an additional cache-hit sample;
  - page reload removed the module-memory device authority. The page returned
    to `Confirming ticket access`, the Meteor connector requested completion
    and Brave exposed a newly blocked popup. No second signature was approved
    and no post-reload direct-v2 POST occurred before tail shutdown.
- RESTORE VE RUNTIME: tail was stopped before restore. Bridge candidate was
  removed from the active deployment and stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` returned to 100%. Fresh public health
  reports the exact stable ID, `stage=DISABLED` and every playback, mutation,
  upload, Queue and archive readiness false. Web public deployment remains
  stable-only `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` at 100% and repository
  variable `DEPLOY_PREVIEW_ENABLED=false`.
- LOCAL_TEST: focused Web/Bridge tests, both type checks, VitePress build and
  `git diff --check` are rerun below after this evidence edit.
- CI: `PASS` for exact candidate source SHA `6a327835...`; the current dirty
  evidence/provider-canary diff remains `UNPROVEN`.
- TESTNET: `PASS_READ`; the two successful v2 authorizations performed six
  final NEAR reads and two Livepeer policy reads. No testnet transaction or
  write occurred.
- DEPLOY: `PASS_BOUNDED_PREVIEW / STABLE_RESTORED`; only Bridge Preview traffic
  was temporarily shifted, Web public traffic was unchanged and final
  assignments are stable-only 100%.
- RUNTIME: `PASS_PREVIEW_DEVICE_CERT_UX`; one approved certificate supported
  initial playback and same-page token refresh, while reload required a new
  signature and did not retain the browser secret.
- GÜNCEL FAZ KAPISI: `PHASE2_DEVICE_CERT_UX_PREVIEW` is closed. Stop here; do
  not advance automatically. The single proposed next gate is
  `PHASE2_DEVICE_CERT_REVOKE_PREVIEW_DECISION_REQUIRED`: explicitly approve and
  bound the current on-chain disconnect/revoke path, or keep that separate
  chain-write acceptance `UNPROVEN`.

### CHECKPOINT 157 — Phase 2 / post-closure playback repeat diagnosis

- DURUM: `SIGNED_MESSAGE_BODY_CONSISTENT / PREFLIGHT_ORIGIN_DENIED /
  ROOT_CAUSE_STABLE_RESTORED / NO_CODE_CHANGE / RUNTIME_CLOSED /
  DECISION_REQUIRED`.
- OBSERVED BROWSER VE MESSAGE:
  - the exact isolated Web page shows buyer
    `lp-d6-buyer-5301d15.youtick-dev-v3.testnet`, publication
    `lp-0b8d85d5-501f-41ad-8dc6-3fc340fd99f7` and the retryable playback error;
  - the user-reported device message was issued at
    `2026-08-16T13:50:03.990Z`, expires eight hours later, carries the expected
    `youtick.device-session` domain, `testnet` network and `play` scope, and its
    `origin_hash` exactly equals SHA-256 of the isolated Web origin. The actual
    signature bytes were not supplied, so independent cryptographic signature
    validation is `UNPROVEN`; no secret or wallet password was read or logged;
  - the connector's `Iframe not loaded` console entry is not the blocking
    network result. The browser separately reports that the Bridge preflight
    lacks `Access-Control-Allow-Origin` and never sends the POST.
- ROOT CAUSE VE LIVE PROBE:
  - Cloudflare restored stable-only at `2026-08-16T13:13:08.078208Z`, before
    this new device message was issued. Current control-plane status assigns
    only stable Bridge `86305272-4ebb-4ca4-9d0e-11e3bd182b17` at 100%; fresh
    health returns that exact ID, `stage=DISABLED`, and all playback, mutation,
    upload, Queue and archive readiness fields false;
  - an `OPTIONS /v2/playback-tokens` probe from the exact isolated Web origin
    returned HTTP 403 `origin_denied` without a CORS allow-origin header. This
    matches source: preflight accepts only configured origins, while the stable
    config allows public Web origins and intentionally excludes this isolated
    canary origin;
  - even if only the stable CORS allowlist were widened, the following POST
    would still fail closed because Bridge/playback/direct-v2 flags are false.
    Therefore a CORS-only source or config edit would not restore playback;
  - candidate `97ec4f30-7857-4d92-b146-ddbf2445b65b` has Preview URLs disabled.
    Its inferred version-alias URL returned Cloudflare 1042/HTTP 404, so the
    existing candidate cannot be selected by the browser without a bounded
    Bridge Preview traffic assignment.
- MINIMUM REMEDIATION: no repository source change is justified. To repeat
  playback, obtain a fresh explicit approval, start an exact-version tail,
  temporarily assign the already verified Bridge candidate 100%, use the
  existing `Try again` action, stop before any new `signMessage`, record the
  verdict and restore stable-only 100% with every runtime flag closed.
- LOCAL_TEST: `PASS`; Web device-session/direct-v2 tests passed `6/6`, Bridge
  direct-v2/index tests passed `86` with two external opt-in tests skipped, and
  both Web and Bridge TypeScript checks passed. No source code changed.
- CI: `PASS` only for draft PR #124 exact head
  `6a327835e736a746e08d827644bc9d4a46222bc3`; all reported checks including CI
  Gate and CodeQL are green. Current dirty evidence/provider-canary changes are
  not that CI artifact and remain `UNPROVEN`.
- TESTNET: `NOT_RUN_THIS_DIAGNOSIS`; no authorization POST, provider read,
  testnet RPC read or chain write occurred.
- DEPLOY: `NOT_RUN_THIS_DIAGNOSIS / STABLE_100`; no version upload, deployment
  or traffic shift occurred.
- RUNTIME: `FAIL_EXPECTED_CLOSED_STABLE`; the observed browser failure is fully
  explained before provider/video access and does not invalidate Checkpoint
  156's bounded candidate acceptance.
- GÜNCEL FAZ KAPISI: `PHASE2_DEVICE_CERT_UX_PREVIEW` remains closed. The
  previously proposed revoke gate is not started while the user is resolving
  playback. Stop here. The single proposed operational gate is
  `PHASE2_DEVICE_CERT_PLAYBACK_REPEAT_DECISION_REQUIRED`.

### CHECKPOINT 158 — Phase 2 / approved playback repeat and visual acceptance

- DURUM: `PASS_BOUNDED_PLAYBACK_REPEAT / PASS_V2_HTTP_200 /
  PASS_VIDEO_FRAME_RENDERED / NO_NEW_SIGNMESSAGE / STABLE_RESTORED /
  OPERATIONAL_GATE_CLOSED`.
- YETKİ VE SINIR: the user explicitly approved temporary Bridge candidate
  100%, exact-version tail and the existing `Try again` action, with a mandatory
  stop before any new `signMessage`. The bounded retry excluded a fresh wallet
  signature, payment, grant/revoke or other chain write, provider/operator
  mutation, upload, Queue/D1/archive and Production.
- PREFLIGHT:
  - the browser still showed exact buyer
    `lp-d6-buyer-5301d15.youtick-dev-v3.testnet`, the expected publication and
    `Try again`; no wallet action was pending in the Web page;
  - stable Bridge `86305272-4ebb-4ca4-9d0e-11e3bd182b17` was initially 100%
    with `stage=DISABLED`. Candidate
    `97ec4f30-7857-4d92-b146-ddbf2445b65b` had the exact PR source tag, allowed
    the isolated Web origin, enabled only Bridge/playback issuance/direct-v2,
    kept payment mode off and all mutation/upload/shadow/Queue/archive flags
    false, and had no Queue, D1 or Durable Object binding;
  - repository and GitHub truth remained unchanged: local HEAD `28a204a7...`,
    `origin/main` `c80377b...`, draft PR #124 exact head `6a327835...` open,
    mergeable and green, the three pre-existing dirty paths preserved, and
    `DEPLOY_PREVIEW_ENABLED=false`.
- BOUNDED RUNTIME:
  - exact-version tail started before Cloudflare assigned candidate 100% and
    stable 0% at `2026-08-16T14:18:51.800764Z`. Fresh health returned the exact
    candidate ID, `playbackV2Ready=true`, all excluded readiness fields false,
    and the isolated Web preflight returned HTTP 204 with the exact CORS
    allow-origin header;
  - the single approved `Try again` reused the current in-memory device
    certificate. No new wallet window or `signMessage` appeared. Browser
    preflight returned 204 and the direct-v2 POST returned HTTP 200 in 1,678 ms;
  - exact tail recorded `cacheResult=MISS`, exactly three final NEAR reads and
    one Livepeer playback-policy read, all HTTP 200. It also recorded the
    publication cover path HTTP 200;
  - the Web page replaced the error with player controls. A single Play action
    rendered an actual video frame in the player, closing the distinction
    between token issuance and visible media playback.
- RESTORE VE SAFETY: after the success verdict, the exact-version tail was
  stopped before restore. Candidate was removed from the active deployment;
  Cloudflare assigned only stable Bridge
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` 100% at
  `2026-08-16T14:21:07.605775Z`. Fresh health returns that exact ID,
  `stage=DISABLED`, and every playback, mutation, upload, Queue and archive
  readiness field false. Web stable remains
  `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` 100% and
  `DEPLOY_PREVIEW_ENABLED=false`.
- LOCAL_TEST: focused Web/Bridge tests, both type checks, VitePress build and
  `git diff --check` are rerun below after this evidence edit. No source code
  changed in this operational gate.
- CI: `PASS` for PR #124 exact head `6a327835...`; the current dirty
  evidence/provider-canary diff is not that CI artifact and remains
  `UNPROVEN`.
- TESTNET: `PASS_READ`; the successful authorization performed three final
  NEAR reads and one provider playback-policy read. No testnet transaction or
  write occurred.
- DEPLOY: `PASS_BOUNDED_PREVIEW / STABLE_RESTORED`; only Bridge Preview traffic
  changed temporarily. No version upload, Web traffic change or Production
  deployment occurred.
- RUNTIME: `PASS_VISIBLE_PLAYBACK / RUNTIME_RECLOSED`; the reported CORS error
  disappeared under the aligned candidate, the existing certificate was
  accepted without a new signature and a video frame rendered before the
  fail-closed stable restore.
- GÜNCEL FAZ KAPISI: `PHASE2_DEVICE_CERT_PLAYBACK_REPEAT` is closed. Stop here;
  do not advance automatically. The single proposed next architectural gate
  returns to `PHASE2_DEVICE_CERT_REVOKE_PREVIEW_DECISION_REQUIRED`.

### CHECKPOINT 159 — Phase 2 / revoke finality and lost-wallet-callback diagnosis

- DURUM: `PASS_TESTNET_REVOKE / PASS_EXACT_CURRENT_KEY_DELETE /
  BLOCKED_WALLET_CALLBACK / PASS_LOCAL_BOUNDED_RECONCILIATION /
  BLOCKED_STALE_ACCESS_KEY / STABLE_100 / CURRENT_GATE_OPEN`.
- VARSAYIMLAR VE KABUL KRİTERLERİ:
  - the exact subject is
    `lp-d6-buyer-5301d15.youtick-dev-v3.testnet`, the exact Access contract is
    `lp-arch-access-v2-260809.youtick-dev-v3.testnet`, and only the current
    sessionStorage signless public key is in this device's bounded revoke
    scope;
  - acceptance requires a final zero-deposit `revoke_subject_sessions`, final
    deletion of that exact current public key, every listed owner grant
    `revoked=true`, local cache/key clear and visible Web disconnect. RPC
    ambiguity must leave the browser connected. Any older unrelated access
    key is an independent remediation decision, not silently deleted here.
- TESTNET MUTATION EVIDENCE:
  - the user approved both already-open Meteor transactions locally. Official
    testnet RPC reports transaction
    `EU81uxvvL4h1GL9v2EaeFR8Qwkom6LK2Dc84mCwsdPku` `FINAL/SuccessValue`; it is
    signed by the exact buyer, calls only `revoke_subject_sessions` on the
    exact Access contract with `owner_id` equal to that buyer, zero deposit and
    100 Tgas;
  - transaction `CgmiHtU47CcjknaVZmYzpmx1MzysAcLpQQH2m7fDGrfm`
    is independently `FINAL/SuccessValue`; it is signed by and received by the
    exact buyer and deletes only the current browser key
    `ed25519:8HeKV6...PEq8`;
  - final-state reads at blocks `264196921` and `264196927` show the listed
    grant `revoked=true` and that exact key absent. No secret key, password or
    signed credential value was read or logged.
- CALLBACK ROOT CAUSE:
  - after both final successes, the deployed Web remained on buyer/Disconnect
    behind `Complete your request in Meteor Wallet`; the user independently
    reported that Meteor opened but no approval or Webapp-return window was
    available;
  - console/connector evidence shows the wallet flow ending with
    `closed_success` followed by near-connect 0.11.4 `Iframe not loaded` while
    forwarding the result. The public npm registry has no version newer than
    the deployed 0.11.4. The unresolved wallet Promise prevents the existing
    code from reaching cache clear and connector disconnect. On-chain success
    therefore does not count as UI revoke/clear acceptance.
- MINIMUM LOCAL FIX:
  - `revokeBrowserAuthority` now performs a final-state preflight. If the exact
    current key is already absent and all at-most-16 owner grants are revoked,
    it clears the session key without opening a second wallet prompt;
  - otherwise it keeps the wallet request and a bounded five-minute,
    two-second final-state reconciliation in a race. Callback success remains
    valid; a lost callback is accepted only after the exact key is absent and
    every listed grant is revoked. Unknown RPC state or timeout fails closed.
    No provider, deploy, traffic, secret or runtime flag changed.
- INDEPENDENT BLOCKER: final account-key reads still show the wallet FullAccess
  key and an older FunctionCall key `ed25519:DyRDL3...` with empty method names
  and 0.25 NEAR allowance to the Access contract. Historical final transaction
  `5P16r1gpsvnsuNLjxXtvQ9WgWR8meAvwYMP5qHmpiNi1` created it in an earlier
  session. Its private-key ownership is `UNPROVEN`; deleting it would be a new
  exact chain write and remains `BLOCKED_STALE_ACCESS_KEY` pending a separate
  explicit approval.
- LOCAL_TEST: `PASS`; focused signless/wallet-provider tests passed `16/16`,
  the complete Web suite passed `137/137`, targeted ESLint passed, Web
  TypeScript passed and `git diff --check` passed. The two new cases prove lost
  callback reconciliation and no-second-prompt behavior after finality.
- CI: `PASS` only for draft PR #124 exact head `6a327835...`; PR remains open,
  draft, mergeable and every reported check is green. Local HEAD is
  `28a204a7...`; the current dirty callback fix/evidence/provider-canary diff is
  not that artifact and remains `UNPROVEN` in CI.
- TESTNET: `PASS_WRITE`; both exact user-approved transactions and their final
  state are independently verified. No additional wallet request, signature or
  chain write was initiated after the callback failure.
- DEPLOY: `NOT_RUN`; no Web or Bridge version was uploaded and no traffic
  changed. Control-plane status remains Bridge stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` 100% and Web stable
  `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` 100%.
- RUNTIME: `BLOCKED_WALLET_CALLBACK / STABLE_CLOSED`; fresh Bridge health
  returns the exact stable ID, `stage=DISABLED`, and all playback, mutation,
  upload, Queue and archive readiness false. The isolated Web URL returns 200,
  but visible disconnect/local clear and the local fallback are not deployed
  or browser-proven.
- GÜNCEL FAZ KAPISI: `PHASE2_DEVICE_CERT_REVOKE_PREVIEW` remains open. Stop
  here. The single proposed continuation is
  `PHASE2_REVOKE_CALLBACK_FIX_PREVIEW_DECISION_REQUIRED`: after explicit deploy
  approval, deploy only the Web callback-reconciliation diff to an isolated
  Preview candidate and prove that the already-final chain state completes
  disconnect without a new transaction or `signMessage`; then restore Web
  stable-only 100% and stop.

### CHECKPOINT 160 — Phase 2 / deployed revoke-callback recovery acceptance

- DURUM: `PASS_PREVIEW_CALLBACK_RECOVERY / PASS_NO_SECOND_WALLET_PROMPT /
  PASS_RELOAD_DISCONNECTED / STABLE_TRAFFIC_UNCHANGED /
  BLOCKED_TWO_STALE_ACCESS_KEYS / CURRENT_GATE_CLOSED`.
- YETKİ VE KABUL SINIRI: the user approved the proposed isolated Web Preview
  deploy and no-signature disconnect retry. Scope excluded public traffic
  shift, Bridge/provider/secret mutation, a new transaction, `signMessage`,
  stale-key deletion and Production. Acceptance required the already-final
  revoked state to reach visible `Connect`, open no new wallet UI, remain
  disconnected after reload, and leave Web/Bridge stable 100% with every
  Bridge runtime flag false.
- PREFLIGHT:
  - local branch/HEAD remained
    `agent/phase2-v2-authorizer-staging-20260815` at `28a204a7...`; the only Web
    diff was the callback reconciliation and its unit test, with canonical diff
    SHA-256 `2f4f57cb4190b217c50fbefeb0fe2265ccca579a421c18f1ae8264d6af42c0ec`.
    Existing documentation and Bridge provider-canary edits were preserved;
  - draft PR #124 remained open, mergeable and green at exact head
    `6a327835...`. The local dirty Web diff is not that CI artifact and stayed
    `UNPROVEN` in CI;
  - official final testnet reads at block `264199379` showed the prior exact
    deleted key absent, one listed owner grant and that grant `revoked=true`;
  - Cloudflare auth was valid. Public deployment status initially assigned Web
    stable `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` 100% and Bridge stable
    `86305272-4ebb-4ca4-9d0e-11e3bd182b17` 100%. Bridge health reported
    `stage=DISABLED` and all playback, mutation, upload, Queue and archive
    readiness false. Repository `DEPLOY_PREVIEW_ENABLED=false`.
- BUILD VE DEPLOY:
  - the OpenNext Preview build completed with the exact repository Preview
    public variables and both Web playback flags false. No secret value was
    printed or copied;
  - candidate `901b6690-188c-422c-9f3c-381b96133140` was first uploaded to a
    new 0%-traffic alias. Because browser sessionStorage is origin-bound, that
    origin could not exercise the existing buyer session and was not used for
    acceptance;
  - the identical bundle was uploaded as candidate
    `f9485d12-3382-41fc-bd4e-d7bb746ad823` on the existing isolated
    `phase2-device-cert-v2` alias. Both operations were version uploads only;
    neither created a deployment nor changed public traffic. Exact candidate
    metadata reports the expected tag/message, fetch handler and only the
    static-assets binding.
- BROWSER ACCEPTANCE:
  - the updated existing-origin page restored exact buyer
    `lp-d6-buyer-5301d15.youtick-dev-v3.testnet` and exposed one `Disconnect`
    button with no pending Meteor modal;
  - one click changed the navigation to `Connect` within five seconds. Browser
    tab inventory was identical before and after: no new wallet tab, approval
    window, transaction request or `signMessage` appeared;
  - a full reload still showed `Connect` and did not restore the buyer. This is
    deployed visible disconnect/clear persistence without inspecting or
    logging browser storage or secret material.
- INDEPENDENT KEY FINDING: final account-key read at block `264199991` shows
  one wallet FullAccess key and two FunctionCall keys. Both FunctionCall keys
  target the exact Access contract, have empty method lists and 0.25 NEAR
  allowance; their key nonces are rooted at blocks `264185022` and `264197023`.
  The latter therefore predates this acceptance click and is consistent with
  the user-reported post-revoke viewing attempt. Neither is the prior exact
  deleted key. Their private-key ownership is `UNPROVEN`; deleting them would
  require a new wallet-approved chain write and remains
  `BLOCKED_TWO_STALE_ACCESS_KEYS`.
- LOCAL_TEST: `PASS`; before upload the final Web suite passed `137/137`,
  focused callback/wallet tests passed `16/16`, TypeScript and targeted ESLint
  passed, the OpenNext Preview production build succeeded, docs build passed
  and `git diff --check` passed.
- CI: `PASS` only for PR #124 exact head `6a327835...`; current dirty Web diff
  remains `UNPROVEN` in CI.
- TESTNET: `PASS_READ / NO_AUTHORIZED_WRITE_THIS_GATE`; the browser opened no
  wallet approval and this gate submitted no transaction. Final reads show the
  prior exact key absent and every listed grant revoked. The two independently
  blocked broad keys are not counted as remediated.
- DEPLOY: `PASS_ISOLATED_VERSION_UPLOAD / PUBLIC_TRAFFIC_UNCHANGED`; candidate
  `f9485d12...` was browser-tested only by version alias. Final public status
  still assigns Web stable `874a3f92...` 100% and Bridge stable `86305272...`
  100%.
- RUNTIME: `PASS_PREVIEW_REVOKE_CALLBACK_RECOVERY / RUNTIME_CLOSED`; visible
  disconnect and reload persistence passed on the isolated candidate. Fresh
  Bridge health remains `stage=DISABLED` with every readiness field false and
  `DEPLOY_PREVIEW_ENABLED=false`.
- GÜNCEL FAZ KAPISI: `PHASE2_REVOKE_CALLBACK_FIX_PREVIEW` is closed. Stop here;
  do not advance automatically. The single proposed next gate is
  `PHASE2_STALE_SIGNLESS_KEYS_REMEDIATION_DECISION_REQUIRED`: inventory the two
  exact broad FunctionCall public keys, prepare one bounded wallet transaction
  containing only their two `DeleteKey` actions, stop before approval, and
  execute only after a new explicit user confirmation.

### CHECKPOINT 161 — Phase 2 / stale signless-key deletion plan locked

- DURUM: `PASS_FINAL_KEY_INVENTORY / PASS_LOCAL_TWO_DELETEKEY_PLAN /
  NO_WALLET_OPENED / NO_CHAIN_WRITE / DECISION_REQUIRED`.
- YETKİ VE KABUL SINIRI: the user approved continuation of the proposed
  preparation gate. This loop was bounded to final read inventory and canonical
  transaction construction. Wallet connect/approval, transaction signing or
  broadcast, deploy, traffic, provider, secret and Production mutations were
  excluded.
- FINAL KEY INVENTORY: official testnet RPC at block `264208617` returned
  exactly three keys for
  `lp-d6-buyer-5301d15.youtick-dev-v3.testnet`: one FullAccess wallet key and
  exactly two FunctionCall keys, with no other key class. Both FunctionCall
  keys target `lp-arch-access-v2-260809.youtick-dev-v3.testnet`, expose empty
  method lists and have 0.25 NEAR allowance:
  - `ed25519:5hw89fx3GiyJZr7euwHUhNbyBygd2be8K73Qr4SnYFaK`, key nonce
    `264197023000000`;
  - `ed25519:DyRDL3hmNYj7fk1SaV6zrgpJtMCZPr8U22TWJdhv48TA`, key nonce
    `264185022000000`.
- EXCLUSIONS: the exact key deleted in Checkpoint 159 remains absent. The one
  FullAccess wallet key is not a deletion target. The plan contains no grant
  revoke, AddKey, FunctionCall, Transfer, deposit, contract receiver or third
  public key.
- CANONICAL TRANSACTION PLAN: local `near-api-js` action construction passed
  with receiver equal to the buyer account and exactly two actions, in stable
  lexical key order:
  1. `DeleteKey(ed25519:5hw89fx3...YFaK)`;
  2. `DeleteKey(ed25519:DyRDL3...48TA)`.
  Both actions are native access-key deletion actions; gas/deposit parameters
  do not apply. Signing nonce and recent block hash are deliberately not frozen
  in this preparation because they must be obtained immediately before wallet
  signing.
- SIGNER-SURFACE BLOCKER: the current Web `Connect` implementation detects any
  wallet advertising `signInWithFunctionCallKey`, creates a new key and passes
  `addFunctionCallKey` into `connector.connect`. Using it for cleanup could add
  a third stale key before deleting these two. The installed near-connect API
  can call `connect()` without `addFunctionCallKey`, but the application exposes
  no cleanup-only path. No verified Meteor arbitrary-transaction deep link was
  established from its public documentation, so no undocumented link was
  improvised.
- LOCAL_TEST: `PASS_STATIC`; final RPC inventory assertions required exactly
  two matching FunctionCall keys, one FullAccess key, zero other keys and prior
  deleted-key absence. Native action construction required the exact buyer
  receiver, exactly two `DeleteKey` actions and zero FunctionCall/Transfer
  actions. No repository source code changed in this checkpoint.
- CI: `PASS` only for PR #124 exact head `6a327835...`; the existing dirty Web,
  docs and provider-canary diff remains `UNPROVEN` in CI.
- TESTNET: `PASS_READ / WRITE_NOT_RUN`; all key data came from final RPC reads.
  No wallet UI, signature, transaction or broadcast occurred.
- DEPLOY: `NOT_RUN`; public status remains Web stable `874a3f92...` 100% and
  Bridge stable `86305272...` 100%.
- RUNTIME: `RUNTIME_CLOSED`; fresh Bridge health remains `stage=DISABLED` with
  every playback, mutation, upload, Queue and archive readiness false;
  `DEPLOY_PREVIEW_ENABLED=false`.
- GÜNCEL FAZ KAPISI: `PHASE2_STALE_SIGNLESS_KEYS_REMEDIATION` remains open at
  `DECISION_REQUIRED`; stop before wallet approval. The single proposed next
  gate is `PHASE2_STALE_KEYS_CLEANUP_SIGNER_PREVIEW_DECISION_REQUIRED`: after
  explicit deploy approval, add the minimum isolated cleanup-only signer path
  that connects without `addFunctionCallKey`, rechecks the exact two-key set,
  prepares the locked two-DeleteKey transaction and stops with the wallet
  approval screen visible but unapproved.

### CHECKPOINT 162 — Phase 2 / stale-key cleanup signer and unexpected submission

- DURUM: `PASS_ISOLATED_CLEANUP_SIGNER / PASS_EXACT_TWO_DELETEKEY_FINAL /
  FAIL_STOP_BEFORE_APPROVAL / SUBMISSION_TRIGGER_UNPROVEN /
  STABLE_TRAFFIC_UNCHANGED / CURRENT_GATE_CLOSED_WITH_DEVIATION`.
- YETKİ VE KABUL SINIRI: the user approved the isolated cleanup signer Preview
  gate. Scope allowed one Web version upload and a wallet connection without
  `addFunctionCallKey`, but required stopping with the exact two-`DeleteKey`
  approval visible and unapproved. Public traffic, Bridge/provider/secret
  changes, a new key, Production and transaction approval/broadcast were
  excluded. The stop-before-approval acceptance did not hold: after the exact
  buyer connection returned, the wallet flow submitted the prepared
  transaction without an approval screen being captured. No compensating write
  or key recreation was attempted.
- EN KÜÇÜK SOURCE DEĞİŞİKLİĞİ:
  - `WalletProvider` exposes a cleanup-only connection method whose entire
    signer difference is `connector.connect()` with no
    `addFunctionCallKey` argument; the normal product `Connect` path remains
    unchanged;
  - an unlinked temporary `/cleanup-stale-keys` page accepts only exact buyer
    `lp-d6-buyer-5301d15.youtick-dev-v3.testnet`;
  - immediately before constructing a transaction, a fail-closed final RPC
    guard requires exactly three keys: one FullAccess key and the two locked
    FunctionCall keys with the exact Access receiver, empty method list and
    0.25 NEAR allowance. The transaction receiver is the buyer and its only
    actions are the two locked `DeleteKey` actions in lexical order;
  - the current-gate five-file source/test diff has canonical SHA-256
    `7f293c182c7c693b21ba37de4cbe64f23f44c6042be12244c4907b2a806d46df`.
- PREFLIGHT: local branch/HEAD remained
  `agent/phase2-v2-authorizer-staging-20260815@28a204a7...` and
  `origin/main@c80377bf...`; existing user/agent Web callback, docs and Bridge
  provider-canary changes were preserved. Final RPC reads at blocks
  `264209814` and `264210056` both returned exactly one FullAccess key plus the
  two locked stale keys. Cloudflare OAuth was valid. Draft PR #124 remained
  open, draft and mergeable at `6a327835...` with every reported check green;
  repository `DEPLOY_PREVIEW_ENABLED=false`.
- LOCAL_TEST: `PASS`; focused cleanup/wallet tests pass `7/7`, the full Web
  suite passes `142/142`, TypeScript passes, source lint passes with generated
  `.next`, `.open-next` and `out` excluded, the OpenNext Cloudflare build
  succeeds and contains `/cleanup-stale-keys`, and `git diff --check` passes.
  An initial accidental `pnpm` invocation detected the npm-installed dependency
  tree and moved packages under its ignored area; `npm install --ignore-scripts`
  restored the lockfile-native tree. Neither `package.json` nor
  `package-lock.json` changed.
- DEPLOY: `PASS_ISOLATED_VERSION_UPLOAD / PUBLIC_TRAFFIC_UNCHANGED`; exact
  candidate `3a6f1a1a-b4eb-4ca4-a0ca-782e497fb97f` was uploaded only to the
  existing `phase2-device-cert-v2` version alias. Candidate metadata reports
  the expected message/tag, fetch handler and only the static-assets binding;
  both exact-version and alias cleanup URLs returned 200. No
  `wrangler versions deploy` or traffic change ran. Final public Web status
  remains stable `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` at 100%.
- BROWSER VE TESTNET YAZIMI:
  - the isolated page initially showed only `Connect without adding a key`.
    The visible near-connect selector opened Meteor, then its Web App; the flow
    returned exact buyer `lp-d6-buyer-5301d15.youtick-dev-v3.testnet`;
  - no automation click was issued on `Open two-key deletion approval`.
    Nevertheless the Meteor tab transitioned through its sign route and closed,
    while the cleanup page reported `Deletion transaction submitted`. Whether
    this came from wallet-session auto-signing or another connect/UI interaction
    is `UNPROVEN`; the required visible unapproved screen was not obtained;
  - official testnet RPC independently proves transaction
    `4uhQMXQWb3MT9okJ5YzHS521zR9uoMMKBXVTYSHEWjej` finalized successfully in
    block `264210191`. Signer and receiver are both the exact buyer, the signing
    key is the pre-existing FullAccess key, and the only actions are
    `DeleteKey(ed25519:5hw89fx3...YFaK)` followed by
    `DeleteKey(ed25519:DyRDL3...48TA)`. There is no AddKey, FunctionCall,
    Transfer, contract receiver or third action;
  - a subsequent final RPC read at block `264210238` returned exactly one key,
    the same FullAccess key, with both stale keys absent.
- CI: `PASS` only for historical draft PR #124 exact head `6a327835...` and run
  `31906629289`. The current dirty cleanup/callback/provider-canary/docs diff is
  not that artifact and remains `UNPROVEN` in CI.
- TESTNET: `PASS_WRITE_FINAL_WITH_SCOPE_DEVIATION`; the desired exact two-key
  deletion state is final and independently verified, but the required manual
  approval stop failed. The write cannot and should not be rolled back by
  recreating broad keys.
- RUNTIME: `RUNTIME_CLOSED`; final Bridge deployment remains stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` 100%. Fresh cache-busting health
  returns that exact version, `stage=DISABLED`, and all provider/operator
  mutation, upload, playback V1/V2/shadow, Queue and archive readiness false.
  Public Web remains stable-only 100%; the cleanup candidate is alias-only.
- GÜNCEL FAZ KAPISI: `PHASE2_STALE_SIGNLESS_KEYS_REMEDIATION` is closed by
  final chain state, with the stop-before-approval deviation recorded. Stop
  here and do not advance automatically. The single proposed next gate is
  `PHASE2_STALE_KEYS_CLEANUP_SURFACE_REMOVAL_DECISION_REQUIRED`: after explicit
  approval, remove the temporary page, cleanup-only connector method and their
  one-off tests, then verify the isolated alias no longer exposes the cleanup
  surface while public traffic remains unchanged.

### CHECKPOINT 163 — Phase 2 / temporary stale-key cleanup surface removed

- DURUM: `PASS_SOURCE_REMOVAL / PASS_EXACT_VERSION_404 / PASS_ALIAS_404 /
  PASS_FINAL_ONE_KEY_READ / STABLE_TRAFFIC_UNCHANGED / CURRENT_GATE_CLOSED`.
- YETKİ VE KABUL SINIRI: the user approved only the proposed cleanup-surface
  removal gate: delete the temporary page, cleanup-only connector method and
  one-off tests; upload a replacement version to the same isolated alias; prove
  the route is closed while public traffic, Bridge flags, secrets and chain
  state remain unchanged. No traffic deployment, provider/secret mutation,
  wallet action, signature or testnet write was authorized or performed.
- PREFLIGHT:
  - local branch/HEAD remained
    `agent/phase2-v2-authorizer-staging-20260815@28a204a7...` and
    `origin/main@c80377bf...`; the pre-existing callback, docs and Bridge
    provider-canary edits were preserved;
  - draft PR #124 remained open, draft and mergeable at exact head
    `6a327835...`, with every reported check green. The current dirty diff is
    not that artifact and remains `UNPROVEN` in CI;
  - Cloudflare OAuth was valid. Public Web assigned stable
    `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` 100%; Bridge assigned stable
    `86305272-4ebb-4ca4-9d0e-11e3bd182b17` 100%. Fresh Bridge health was
    `stage=DISABLED` with every readiness field false, and repository
    `DEPLOY_PREVIEW_ENABLED=false`;
  - NEAR's deprecated public testnet endpoint returned 429 during the first
    read. The deployed Web read-only RPC proxy then returned final block
    `264211429`, exactly one FullAccess buyer key and no FunctionCall key.
- SOURCE REMOVAL:
  - deleted the unlinked `/cleanup-stale-keys` page, its exact key-set helper
    and helper unit test;
  - removed only `connectWithoutAccessKey` and its one-off WalletProvider test.
    The normal product wallet connection and the earlier callback
    reconciliation remain unchanged;
  - source and rebuilt artifact searches return no `cleanup-stale-keys`,
    `connectWithoutAccessKey` or stale-key helper reference. The final worktree
    contains only the five pre-existing callback/docs/provider-canary dirty
    paths; no cleanup file or WalletProvider diff remains.
- LOCAL_TEST: `PASS`; Web unit/integration tests pass `137/137`, source lint and
  final TypeScript pass, the closed-feature OpenNext build succeeds and its
  route manifest contains no cleanup route, and `git diff --check` passes. A
  pre-build TypeScript run saw only the prior candidate's stale generated `.next/types`
  route; the rebuild removed that derived entry and the repeated TypeScript
  run passed. `package.json` and `package-lock.json` remain unchanged.
- DEPLOY: `PASS_ISOLATED_VERSION_UPLOAD / PUBLIC_TRAFFIC_UNCHANGED`; replacement
  candidate `4cb64e0f-eed0-4ed5-8062-09bcf4f5958e` was uploaded only to the
  existing `phase2-device-cert-v2` version alias. Metadata reports the expected
  removal message/tag, fetch handler and only the static-assets binding. No
  `wrangler versions deploy`, route/trigger change or public traffic shift ran.
- PREVIEW ACCEPTANCE: the exact-version root and alias root return 200. Both
  exact-version and alias `/cleanup-stale-keys` return 404 with cache-busting
  probes; the public stable route also returns 404. Public Web deployment
  remains stable `874a3f92...` exactly 100%.
- CI: `PASS` only for historical PR #124 exact head `6a327835...` and run
  `31906629289`; current dirty callback/docs/provider-canary changes remain
  `UNPROVEN` in CI.
- TESTNET: `PASS_READ / WRITE_NOT_RUN`; final read through the deployed Web RPC
  proxy at block `264211814` still returns exactly the same one FullAccess key
  and no stale FunctionCall key. No wallet UI, signature, transaction or
  broadcast occurred in this gate.
- RUNTIME: `PASS_SURFACE_CLOSED / RUNTIME_CLOSED`; the isolated cleanup route is
  closed. Bridge remains stable `86305272...` 100%, `stage=DISABLED`, with all
  provider/operator mutation, upload, playback V1/V2/shadow, Queue and archive
  readiness false. Web remains stable-only `874a3f92...` 100% and repository
  `DEPLOY_PREVIEW_ENABLED=false`.
- GÜNCEL FAZ KAPISI: `PHASE2_STALE_KEYS_CLEANUP_SURFACE_REMOVAL` is closed.
  Stop here and do not advance automatically. The single proposed next gate is
  `PHASE2_DEVICE_CERT_CHANGESET_CI_DECISION_REQUIRED`: explicitly review the
  remaining five-path dirty callback/provider-canary/docs changes, select only
  the intended paths for a commit/PR update, and obtain exact-SHA CI before any
  further runtime gate.

### CHECKPOINT 164 — Phase 2 / device-certificate changeset exact-SHA CI

- DURUM: `PASS_EXPLICIT_PATH_SCOPE / PASS_DRAFT_STACKED_PR /
  PASS_EXACT_SHA_CI / RUNTIME_UNCHANGED / CURRENT_GATE_CLOSED`.
- VARSAYIMLAR VE ÖLÇÜLEBİLİR KABUL:
  - the intended changeset is exactly the five paths left by Checkpoint 163;
  - because the working branch descends from draft PR #124, PR #125 must target
    that exact ancestor branch so its aggregate diff contains no unrelated
    #124 path;
  - acceptance requires a clean worktree, an explicit five-path staged list,
    `git diff --cached --check`, a draft PR with the same five paths and an
    exact-head successful required `CI Gate`;
  - no merge, deploy, secret/provider change, traffic shift, wallet action,
    testnet write or runtime-flag activation is in scope.
- PREFLIGHT VE KAPSAM:
  - initial branch/HEAD was
    `agent/phase2-v2-authorizer-staging-20260815@28a204a7ff6be66608b2469870fa32eae1b8b0f9`;
    `origin/main` was `c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`;
  - review confirmed exactly these five dirty paths:
    `apps/web/__tests__/unit/signless-access-key.test.ts`,
    `apps/web/lib/signless-access-key.ts`,
    `docs/architecture/transformation-progress.md`,
    `workers/livepeer-bridge/scripts/provider-canary.mjs` and
    `workers/livepeer-bridge/scripts/provider-canary.test.mjs`;
  - the Web change reconciles a lost wallet callback only after final access-key
    deletion and bounded final subject-grant revocation are both proven. The
    provider canary adds only a redacted, GET-only playback-policy read with a
    five-second timeout; provider mutation remains disabled by default;
  - explicit-path staging listed only those five paths and
    `git diff --cached --check` passed. Commit
    `ab2719a0f52ff3dd54eaaed436ef75d82d00310c` was pushed with a clean
    worktree;
  - draft PR #125 initially inherited the main-targeted ancestor diff. Its base
    was corrected to draft PR #124's exact head branch
    `agent/pay-001-non-refundable-20260815@6a327835...`; final GitHub metadata
    reports exactly the five intended paths, two commits, `OPEN`, `DRAFT` and
    `MERGEABLE`.
- LOCAL_TEST: `PASS`; Web unit/integration tests pass `137/137`, source lint and
  the closed-feature OpenNext Cloudflare build pass. Bridge provider-canary
  tests pass `71/71`, the full Bridge suite passes `193` with `2` skipped,
  Bridge type-check and Wrangler dry-run pass, Docs build passes, and final
  `git diff --check` passes.
- CI: `PASS_EXACT_SHA`; PR #125 run
  `31961433546` targets exact head `ab2719a0...`. Attempt 1 passed Web, Bridge,
  Docs, Contracts, CodeQL, protocol and runtime dependency audit, but the
  production WASM audit could not fetch the external RustSec advisory database
  and received HTTP 401; its non-JSON failure output caused `CI Gate` to fail.
  No changed path owns that job. One failed-job retry at the same SHA succeeded:
  Production WASM Dependency Audit job `95201119100` passed, CI Gate job
  `95201178118` passed, and run attempt 2 completed `success`.
- TESTNET: `NOT_RUN`; no wallet, signature, chain query, transaction or provider
  request was initiated for this source/CI gate.
- DEPLOY: `NOT_RUN`; the CI Bridge job executed only Wrangler dry-run. No Worker
  version upload, route update or traffic deployment occurred.
- RUNTIME: `PASS_READ_ONLY / RUNTIME_CLOSED`; fresh control-plane reads still
  assign Bridge stable `86305272-4ebb-4ca4-9d0e-11e3bd182b17` and Web stable
  `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` at exactly 100%. Fresh cache-busting
  Bridge health returns the same version, `stage=DISABLED`, and every provider,
  operator, upload, playback V1/V2/shadow, Queue and archive readiness field
  false. Repository `DEPLOY_PREVIEW_ENABLED=false`.
- GÜNCEL FAZ KAPISI: `PHASE2_DEVICE_CERT_CHANGESET_CI_DECISION_REQUIRED` is
  closed. Stop here and do not merge or advance automatically. The single
  proposed next gate is `PHASE2_CHANGESET_STACK_REVIEW_DECISION_REQUIRED`:
  review the #124 -> #125 dependency and exact diffs, then decide the merge
  order separately without performing either merge.

### CHECKPOINT 165 — Phase 2 / changeset stack review and merge order

- DURUM: `PASS_EXACT_STACK_REVIEW / PASS_MERGE_ORDER_DECISION /
  MERGE_NOT_RUN / RUNTIME_UNCHANGED / CURRENT_GATE_CLOSED`.
- VARSAYIMLAR VE ÖLÇÜLEBİLİR KABUL:
  - PR #124 and PR #125 must remain independently reviewable changesets;
  - acceptance requires fresh Git ancestry, exact base/head SHA, commit list,
    file diff and CI status for both PRs, plus an explicit merge sequence that
    does not fold #125 back into #124 or expose the aggregate stack as #125;
  - no merge, rebase, force-push, deploy, secret/provider change, traffic
    shift, wallet action, testnet write or runtime activation is in scope.
- GÜNCEL REPO VE GITHUB GERÇEĞİ:
  - the worktree is clean at
    `agent/phase2-v2-authorizer-staging-20260815@834d368144b4e7fef4f9118302d415e1e4607669`;
    `origin/main` is `c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`;
  - exact ancestry is
    `main@c80377bf... -> #124@6a327835... -> #125@834d3681...`;
  - PR #124 is `OPEN`, `DRAFT`, `MERGEABLE/CLEAN`, targets `main`, and contains
    four commits. Its exact diff is six files, `+785/-19`: CI catalog wiring,
    contract/testing docs, the 18-event final testnet evidence, progress
    evidence and the EVENT-001 catalog-parity test;
  - at reviewed head `834d3681...`, PR #125 is `OPEN`, `DRAFT`,
    `MERGEABLE/CLEAN`, targets PR #124's exact head branch, and contains three
    commits. Its exact pre-checkpoint diff is five files,
    `+1620/-17`: bounded final-chain wallet-callback reconciliation, its tests,
    the redacted GET-only provider read and its tests, plus progress evidence;
  - the only path shared by both diffs is
    `docs/architecture/transformation-progress.md`. Comparing #125 directly
    from current `main` exposes the ten-file aggregate stack at `+2405/-36`,
    so the current stacked base is material to exact review scope.
- EXACT DIFF REVIEW:
  - #124's required catalog test keeps the Rust producer, both final-event
    consumers and the recorded 18-event testnet evidence equal. The evidence
    is `PASS_TESTNET_FINAL`, records 18 unique applicable events, marks only
    `contract_migrated` as `NOT_APPLICABLE_FRESH_ID`, and leaves the canary
    frozen with purchases paused;
  - #125 clears the local signless key after either the wallet callback or a
    bounded proof that the exact final access key is absent and all bounded
    subject grants are revoked. The provider preflight performs one validated,
    five-second playback-policy GET and emits only redacted status/policy and
    playback-ID digest; mutation remains disabled by default;
  - no actionable correctness or scope finding was identified in either exact
    diff. `git diff --check` passes independently for both PR ranges.
- MERGE YÖNTEMİ VE SIRA KARARI:
  - repository settings disable merge commits and allow squash/rebase. PRs
    #120-#123 were squash-merged: each merge SHA differs from its PR head and
    the current `main` history is single-parent;
  - therefore the safe order is: separately approve and squash-merge #124
    first; then rebuild #125 on the resulting exact `main` using only #125's
    three commits (`28a204a7...`, `ab2719a0...`, `834d3681...`), retarget it to
    `main`, re-confirm the exact five-path diff and obtain fresh exact-head CI;
    only then request a separate #125 merge decision;
  - merging #125 into its current base would update #124's head and collapse
    the review boundary. Retargeting #125 before #124 merges, or retaining its
    old ancestry after a squash, would expose the aggregate stack. Neither is
    accepted. No merge, rebase or force-push was performed in this checkpoint.
- LOCAL_TEST: `PASS`; EVENT-001 catalog parity passes `1/1`, Bridge
  provider-canary tests pass `71/71`, focused Web signless-access-key tests pass
  `14/14`, and both exact PR ranges pass `git diff --check`.
- CI: `PASS_EXISTING_EXACT_HEADS`; PR #124 required `CI Gate` and all reported
  checks remain green at exact head `6a327835...` in run `31906629289`. PR #125
  required `CI Gate` and all reported checks remain green at reviewed head
  `834d3681...` in run `31962078263`. This checkpoint is a docs-only follow-up;
  its resulting head requires its own CI before this gate is handed off. These
  results do not cover the future post-#124 restacked #125 SHA; that future CI
  remains `UNPROVEN`.
- TESTNET: `NOT_RUN`; this was a repository/GitHub review gate. No provider
  read, wallet action, signature, chain query, transaction or write occurred.
- DEPLOY: `NOT_RUN`; no version upload, route change or traffic deployment
  occurred.
- RUNTIME: `UNCHANGED_BY_GATE`; no runtime flag, secret, provider or traffic
  mutation occurred. The last verified stable-only/closed runtime state from
  Checkpoint 164 remains the prior evidence and is not reclassified as a new
  runtime probe here.
- GÜNCEL FAZ KAPISI: `PHASE2_CHANGESET_STACK_REVIEW_DECISION_REQUIRED` is
  closed. Stop here; do not merge or restack automatically. The single proposed
  next gate is `PHASE2_PR124_SQUASH_MERGE_DECISION_REQUIRED`: after explicit
  approval, revalidate #124's exact head/checks and squash-merge only #124;
  stop again before rebuilding or retargeting #125.

### CHECKPOINT 166 — Phase 2 / PR #124 guarded squash merge

- DURUM: `PASS_EXACT_HEAD_SQUASH_MERGE / PASS_POST_MERGE_MAIN_CI /
  DEPLOY_SKIPPED / RUNTIME_CLOSED / PR125_BASE_PRESERVED /
  CURRENT_GATE_CLOSED`.
- YETKİ, VARSAYIMLAR VE KABUL:
  - the user explicitly approved only the proposed #124 squash-merge gate and
    the reversible branch-retention guard required to keep #125 independently
    reviewable;
  - acceptance requires #124 head `6a327835...` and all checks to remain green,
    one squash commit on `main`, #125 to remain based on the preserved #124
    branch, the repository auto-delete setting to be restored, exact-main CI to
    pass, Deploy Preview to remain disabled, and runtime to remain stable-only
    with every Phase 2 flag closed;
  - #125 rebase, retarget or force-push, provider/secret mutation, traffic
    shift, wallet action, testnet write and Production are excluded.
- PREFLIGHT:
  - #124 was `OPEN`, `DRAFT`, `MERGEABLE/CLEAN`, targeted
    `main@c80377bfb7ad03e2df9d8c1d5a23db4dbfd643fc`, and still had exact head
    `6a327835e736a746e08d827644bc9d4a46222bc3`, six files at `+785/-19` and all
    reported checks green in run `31906629289`;
  - #125 was `OPEN`, `DRAFT`, `MERGEABLE/CLEAN` at `853554c4...` and based on
    `agent/pay-001-non-refundable-20260815@6a327835...`;
  - repository settings allowed squash/rebase, disabled merge commits and had
    `delete_branch_on_merge=true`. GitHub's documented deleted-base behavior
    would retarget #125 to `main`; the user separately approved temporarily
    disabling that setting. Repository `DEPLOY_PREVIEW_ENABLED=false`.
- GUARDED MERGE:
  - a cleanup trap first set `delete_branch_on_merge=false`, verified the
    result, marked only #124 ready and invoked squash merge with
    `--match-head-commit 6a327835e736a746e08d827644bc9d4a46222bc3`;
  - GitHub merged #124 at `2026-08-16T17:57:32Z` as exact `main` commit
    `7205fe941d95011de0af1691d6a274b0fa373b15`, whose only parent is prior
    `main@c80377bf...`. Its tree is byte-for-byte equal to #124 head;
  - the #124 head branch still resolves to `6a327835...`; #125 remains draft,
    open and based on that exact branch. The cleanup restored repository
    `delete_branch_on_merge=true`. No #125 rebase, retarget or force-push
    occurred; the only follow-up change is this append-only evidence record.
- LOCAL_TEST: `PASS_TREE_PARITY / NO_NEW_SOURCE_TEST`; `git diff --exit-code`
  between squash `main@7205fe94...` and #124 head `6a327835...` is empty. This
  merge gate introduced no new application source. The evidence-log follow-up
  is docs-only and must pass its own exact-head CI before handoff.
- CI: `PASS_EXACT_MAIN_SHA`; post-merge push run `31963154548` targets exact
  `main@7205fe941d95011de0af1691d6a274b0fa373b15` and completed `success`.
  Runtime/production WASM audits, both CodeQL languages, Docs, Web, Bridge,
  Livepeer Protocol, both Contracts jobs and mandatory `CI Gate` passed.
- TESTNET: `NOT_RUN`; no provider read, wallet action, signature, chain query,
  transaction or write occurred.
- DEPLOY: `SKIPPED`; exact-main Deploy Preview workflow run `31963541461`
  completed `skipped` because `DEPLOY_PREVIEW_ENABLED=false`. No version upload,
  route change or traffic deployment occurred.
- RUNTIME: `PASS_READ_ONLY / RUNTIME_CLOSED`; Bridge remains stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` 100% and Web remains stable
  `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` 100%. Fresh cache-busting Bridge
  health returns the same version, `stage=DISABLED`, and provider/operator
  mutation, new upload, control plane, playback V1/V2/shadow, Queue and both
  archive readiness fields are false.
- GÜNCEL FAZ KAPISI: `PHASE2_PR124_SQUASH_MERGE_DECISION_REQUIRED` is closed.
  Stop here; do not rebuild, retarget or merge #125 automatically. The single
  proposed next gate is `PHASE2_PR125_RESTACK_DECISION_REQUIRED`: after explicit
  approval, create a safety reference, replay only #125's post-`6a327835...`
  commits on exact `main@7205fe94...`, push with lease, retarget #125 to `main`,
  prove the exact five-path diff and obtain fresh exact-head CI; do not merge
  #125 in that gate.

### CHECKPOINT 167 — Phase 2 / PR #125 exact-main restack

- DURUM: `PASS_REMOTE_SAFETY_REF / PASS_ONE_TO_ONE_REBASE /
  PASS_MAIN_RETARGET / PASS_EXACT_FIVE_PATH_SCOPE / PASS_EXACT_SHA_CI /
  RUNTIME_CLOSED / CURRENT_GATE_CLOSED`.
- YETKİ, VARSAYIMLAR VE KABUL:
  - the user explicitly approved only the proposed #125 restack gate: preserve
    the old head, replay the five post-#124 commits on exact squash `main`, use
    an exact force-with-lease, retarget the existing draft PR to `main`, prove
    the same five-path scope and obtain fresh exact-head CI;
  - acceptance requires a clean worktree, byte-identical old/new trees, a
    one-to-one five-commit range diff, remote safety recovery, exact `main`
    base, successful required CI and closed runtime;
  - #125 merge/ready state, deploy, secret/provider mutation, traffic shift,
    wallet action, testnet write and Production are excluded.
- PREFLIGHT:
  - the clean local and remote branch head was
    `009ade26cf331a1a3fa21d531f8c6cb8cf718445`; PR #125 was `OPEN`, `DRAFT`,
    `MERGEABLE/CLEAN`, based on preserved #124 branch
    `agent/pay-001-non-refundable-20260815@6a327835...`;
  - the range contained exactly five commits and exactly five paths at
    `+1765/-17`. Squash `main@7205fe941d95011de0af1691d6a274b0fa373b15`
    and old base `6a327835...` had byte-identical trees;
  - repository `DEPLOY_PREVIEW_ENABLED=false`; no unrelated worktree path was
    present.
- SAFETY VE RESTACK:
  - remote and local safety branch
    `safety/phase2-pr125-pre-restack-20260816-009ade2` preserves exact old head
    `009ade26cf331a1a3fa21d531f8c6cb8cf718445`;
  - `git rebase --onto 7205fe94... 6a327835...` replayed all five commits
    without conflict. `git range-diff` reports exact one-to-one equality:
    `28a204a7 -> c18083b7`, `ab2719a0 -> 90836e3d`,
    `834d3681 -> ec9d77fe`, `853554c4 -> c4c68fdf` and
    `009ade26 -> 6381f348`;
  - `git diff --exit-code` between `009ade26...` and `6381f348...` is empty,
    proving the complete pre/post-restack trees are identical. The new branch
    has exact squash
    `main` as ancestor and only those five commits above it;
  - the push used
    `--force-with-lease=refs/heads/agent/phase2-v2-authorizer-staging-20260815:009ade26...`.
    The lease held, remote head became `6381f3488dfdd80f36b4dd69abae4aae4214f273`,
    and PR #125 base was changed to exact `main@7205fe94...`;
  - GitHub reports the existing PR still `OPEN` and `DRAFT`, with exactly five
    paths and `+1765/-17`: two Web authority files, the progress evidence file
    and two Bridge provider-canary files. No #124 catalog/contract/testing/CI
    path re-entered the diff.
- LOCAL_TEST: `PASS`; EVENT-001 catalog parity passes `1/1`, Bridge
  provider-canary tests pass `71/71`, focused Web signless-access-key tests pass
  `14/14`, Docs build passes, and the exact `main...HEAD` range passes
  `git diff --check`.
- CI: `PASS_EXACT_RESTACK_SHA`; PR #125 run `31964574153` targets exact head
  `6381f3488dfdd80f36b4dd69abae4aae4214f273` on the `main`-based PR and
  completed `success`. Docs, Web, Bridge, both CodeQL languages, dependency
  audits and mandatory `CI Gate` passed; unchanged Contracts and Livepeer
  Protocol jobs skipped as designed. This append-only evidence commit must
  pass its own exact-head CI before handoff.
- TESTNET: `NOT_RUN`; no provider read, wallet action, signature, chain query,
  transaction or write occurred.
- DEPLOY: `NOT_RUN`; CI performed only the Bridge Wrangler dry-run. No version
  upload, route change or traffic deployment occurred.
- RUNTIME: `PASS_READ_ONLY / RUNTIME_CLOSED`; Bridge remains stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` 100% and Web remains stable
  `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` 100%. Fresh cache-busting Bridge
  health returns the same version, `stage=DISABLED`, and provider/operator
  mutation, new upload, control plane, playback V1/V2/shadow, Queue and both
  archive readiness fields are false.
- GÜNCEL FAZ KAPISI: `PHASE2_PR125_RESTACK_DECISION_REQUIRED` is closed. Stop
  here and do not ready or merge #125 automatically. The single proposed next
  gate is `PHASE2_PR125_MERGE_DECISION_REQUIRED`: separately review the final
  exact head, five-path diff and checks, then after explicit approval mark only
  #125 ready and squash-merge it with an exact-head lock; revalidate post-merge
  `main` CI, deploy skip and closed runtime before any later gate.

### CHECKPOINT 168 — Phase 2 / PR #125 exact-head squash merge

- DURUM: `PASS_EXACT_HEAD_SQUASH_MERGE / PASS_POST_MERGE_MAIN_CI /
  DEPLOY_SKIPPED / RUNTIME_CLOSED / CURRENT_GATE_CLOSED`.
- YETKİ, VARSAYIMLAR VE KABUL:
  - the user explicitly approved only the proposed #125 merge gate: revalidate
    the final exact head, five-path scope and checks, mark only #125 ready,
    squash-merge it with an exact-head lock, and verify post-merge CI, deploy
    skip and closed runtime;
  - acceptance requires exact head `965455151db8b539bd7d60cb721ebc6e6f267030`,
    exact base `main@7205fe941d95011de0af1691d6a274b0fa373b15`,
    unchanged five-path scope, successful required PR and post-merge `main` CI,
    byte-identical squash/PR trees, skipped Deploy Preview and stable-only
    runtime with all Phase 2 flags closed;
  - provider/secret mutation, deploy, traffic shift, wallet action, testnet
    write, Production and automatic merge of this evidence follow-up are
    excluded.
- PREFLIGHT:
  - #125 was `OPEN`, `DRAFT`, `MERGEABLE/CLEAN`, targeted exact
    `main@7205fe94...`, and still had exact head `96545515...`, six commits and
    exactly five paths at `+1838/-17`: two Web authority files, this progress
    evidence file and two Bridge provider-canary files;
  - all reported checks remained green at exact head in CI run `31964783386`,
    including mandatory `CI Gate` job `95208424667`; the exact range passed
    `git diff --check` and no other open PR used the #125 head branch as its
    base;
  - repository settings allowed squash/rebase, disabled merge commits and had
    `delete_branch_on_merge=true`; repository
    `DEPLOY_PREVIEW_ENABLED=false`.
- EXACT-HEAD MERGE:
  - only #125 was marked ready and the squash merge used
    `--match-head-commit 965455151db8b539bd7d60cb721ebc6e6f267030`;
  - GitHub merged #125 at `2026-08-16T19:02:20Z` as exact `main` commit
    `dd8934ed51f27dc9f80ab5a2eac8a0eaa7bbdb1a`, whose only parent is prior
    `main@7205fe94...`. Its tree `99d6fe32558ea4c9bbdb2de62d6767d2579deb2c`
    is byte-for-byte equal to the exact PR head tree;
  - GitHub automatically deleted the merged feature branch as configured. The
    remote recovery branch
    `safety/phase2-pr125-pre-restack-20260816-009ade2` remains intact. No
    provider, secret, deploy, traffic or runtime mutation occurred.
- LOCAL_TEST: `PASS_TREE_PARITY / NO_NEW_SOURCE_TEST`; `git diff --exit-code`
  between squash `main@dd8934ed...` and exact PR head `96545515...` is empty.
  The merge introduced no source delta beyond the already-tested PR tree. This
  evidence follow-up changes only this Markdown file and must pass Docs build,
  `git diff --check` and its own exact-head CI before handoff.
- CI: `PASS_EXACT_MAIN_SHA`; post-merge push run `31966375527` targets exact
  `main@dd8934ed51f27dc9f80ab5a2eac8a0eaa7bbdb1a` and completed `success`.
  Runtime/production WASM audits, both CodeQL languages, Docs, Web, Bridge and
  mandatory `CI Gate` job `95212296686` passed; unchanged Contracts and
  Livepeer Protocol jobs skipped as designed.
- TESTNET: `NOT_RUN`; no provider read, wallet action, signature, chain query,
  transaction or write occurred.
- DEPLOY: `SKIPPED`; exact-main Deploy Preview workflow run `31966509229`
  completed `skipped` because `DEPLOY_PREVIEW_ENABLED=false`. No version upload,
  route change or traffic deployment occurred.
- RUNTIME: `PASS_READ_ONLY / RUNTIME_CLOSED`; Bridge remains stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` 100% and Web remains stable
  `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` 100%. Fresh cache-busting Bridge
  health returns the same version, `stage=DISABLED`, and provider/operator
  mutation, new upload, control plane, playback V1/V2/shadow, Queue and both
  archive readiness fields are false.
- GÜNCEL FAZ KAPISI: `PHASE2_PR125_MERGE_DECISION_REQUIRED` is closed. Stop
  here; do not merge this docs-only evidence follow-up automatically. The
  single proposed next gate is
  `PHASE2_PR125_MERGE_EVIDENCE_PR_DECISION_REQUIRED`: review this one-file
  append-only checkpoint at its exact head and exact-head CI, then separately
  decide whether to squash-merge only that evidence PR; do not advance to a
  later Phase 2 runtime gate in the same loop.

### CHECKPOINT 169 — Phase 2 / class-wide Durable Object record ceiling

- DURUM: `PASS_LOCAL / CLASS_WIDE_MAX_RECORD_CONTRACT /
  PASS_READ_ONLY_RUNTIME_CLOSED / CURRENT_GATE_CLOSED`.
- YETKİ, VARSAYIMLAR VE KABUL:
  - the user approved only the proposed local class-wide capacity-contract
    gate on exact baseline `main@1479e7fa858c27912aa6467e56e2c2722a45f106`;
  - acceptance requires every persistent new-key family in `LivepeerControl` to
    use the shared 256-record guard, record 257 to fail before write for
    `upload_job`, `admission`, `operator` and `rate_limit`, and an existing-key
    update to remain available at 256;
  - D1 writes, deletion, deploy, testnet/provider access, secret changes,
    runtime activation and traffic shift are excluded.
- SOURCE AUDIT VE UYGULAMA:
  - tracked Wrangler declares one Durable Object binding and one migrated class,
    `LIVEPEER_CONTROL` / `LivepeerControl`;
  - every persistent new-key family is guarded: job/control nonce/reconcile,
    webhook dedup and job outbox; admission singleton and reopen audit;
    operator outbox, nonce watermark and archive cursor; creator-fee and payment
    rate limits. Existing singleton, job and outbox writes are updates only;
  - the audit found two guard/write pairs outside a storage transaction: initial
    reconcile singleton creation and operator archive-cursor creation/update.
    Both now run the capacity check and write in one transaction; the shared
    guard accepts only `DurableObjectTransaction`, making a future non-atomic
    caller a TypeScript error;
  - the shared regression is expanded to all four state kinds and proves both
    pre-write rejection at projected record 257 and the no-list existing-key
    update path at 256. Admission singleton creation and operator outbox
    creation now have direct class-level overflow regressions; existing
    upload-job/outbox and payment-rate regressions complete the four path
    families. No new abstraction or runtime feature was added.
- LOCAL_TEST: `PASS`; focused capacity/index/finalize/payment suites pass
  `153/153`; the complete Bridge suite passes `202` with two opt-in tests
  skipped; mocked provider canaries pass `71/71`; TypeScript and
  `git diff --check` pass; the Docs production build passes. Wrangler dry-run
  reports 721.91 KiB / gzip 152.42 KiB and every tracked configuration gate
  false; this is `LOCAL_STATIC`, not deploy or runtime evidence.
- CI: `BASELINE_PASS / CHANGESET_UNPROVEN`; GitHub's latest main CI run
  `31969328128` passes at exact baseline
  `1479e7fa858c27912aa6467e56e2c2722a45f106`. This six-path local worktree
  has no commit, push, PR or exact-head Actions run, so baseline CI is not
  reclassified as changeset evidence.
- TESTNET: `NOT_RUN`; no provider read, wallet action, signature, chain query,
  transaction, D1 write or external mutation occurred.
- DEPLOY: `NOT_RUN`; Wrangler was dry-run only. Exact-baseline Deploy Preview
  run `31969470241` remains `skipped` with repository variable
  `DEPLOY_PREVIEW_ENABLED=false`; no version upload, route change or traffic
  deployment occurred for this gate.
- RUNTIME: `PASS_READ_ONLY / RUNTIME_CLOSED`; fresh deployment status reports
  Bridge stable `86305272-4ebb-4ca4-9d0e-11e3bd182b17` 100% and Web stable
  `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` 100%. A cache-busting Bridge health
  probe returns the same version, `stage=DISABLED`, and provider/operator
  mutation, new upload, control plane, playback V1/V2/shadow, Queue and both
  archive readiness fields false. No flag, secret, provider or traffic
  mutation occurred.
- GÜNCEL FAZ KAPISI:
  `PHASE2_DO_CLASS_WIDE_MAX_RECORD_CONTRACT_LOCAL_DECISION_REQUIRED` is closed.
  Stop here. Phase 2 retention remains `PARTIAL` only for real archive commits
  and their separately guarded destructive cleanup. The single proposed next
  gate is `PHASE2_OPERATOR_OUTBOX_D1_ARCHIVE_COMMIT_PREFLIGHT_DECISION_REQUIRED`:
  perform a read-only exact-SHA/binding/migration/eligible-record/rollback
  preflight and stop before any deploy, D1 write, runtime activation or delete.

### CHECKPOINT 170 — Phase 2 / operator outbox D1 archive commit preflight

- DURUM: `PREFLIGHT_BLOCKED / REMOTE_MIGRATION_PASS /
  BRIDGE_D1_BINDING_MISSING / ELIGIBLE_RECORD_UNPROVEN / RUNTIME_CLOSED /
  CURRENT_GATE_CLOSED`.
- YETKİ, VARSAYIMLAR VE KABUL:
  - the user approved only the proposed read-only exact-SHA, D1
    binding/migration, eligible-record and rollback preflight;
  - commit/push/PR, deploy, D1 write, archive activation, traffic shift,
    provider/chain mutation and deletion are excluded;
  - acceptance requires each prerequisite to be independently proven. A
    historical finalize receipt is not substituted for a current Durable Object
    read, and baseline CI is not substituted for the dirty changeset's CI.
- EXACT REPO VE GITHUB:
  - local `HEAD`, fetched `origin/main` and GitHub `main` are exact
    `1479e7fa858c27912aa6467e56e2c2722a45f106`. The existing six-path dirty
    worktree from Checkpoint 169 is preserved without staging or overwrite;
  - exact-main CI run `31969328128` is successful and Deploy Preview run
    `31969470241` is skipped with repository variable
    `DEPLOY_PREVIEW_ENABLED=false`. The local changeset has no commit, push, PR
    or exact-head CI. The only open PRs are unrelated older drafts #94 and #95.
- D1 VE MIGRATION READ:
  - remote testnet D1 `youtick-market-read-model-v1-testnet` remains exact ID
    `50b1e14f-2b06-444b-98cf-b828f11277ef`, region `EEUR`;
  - remote `d1_migrations` lists `0001` through
    `0004_operator_outbox_archives.sql`; Wrangler reports no pending migration.
    `operator_outbox_archives` and its cleanup index exist with the tracked
    composite primary key and bounded columns;
  - the archive table contains zero rows. Every remote SQL receipt in this
    preflight reports `changed_db=false` and `rows_written=0`; D1 info reports
    zero write queries and rows written in the preceding 24 hours.
- BINDING VE ELIGIBLE-RECORD SONUCU:
  - the dark read-model deployment
    `62451057-c6b6-40ff-a8f6-0ac6723d0a1c` is stable 100%, binds the exact D1
    and keeps all four read-model flags false;
  - tracked Bridge Wrangler, generated release artifact and active Bridge
    version `86305272-4ebb-4ca4-9d0e-11e3bd182b17` have no
    `MARKET_READ_MODEL` binding. The release validator currently rejects extra
    Bridge bindings. `OPERATOR_OUTBOX_ARCHIVE_ENABLED=false`, and fresh health
    returns `operatorOutboxArchiveReady=false`;
  - active public configuration still targets canonical Market
    `lp-arch-market-v2-260809.youtick-dev-v3.testnet`, operator account
    `lp-d6-bridge-5301d15.youtick-dev-v3.testnet` and key epoch 5. Final testnet
    block `264234095` shows the expected epoch-5 finite key still limited to
    `finalize_livepeer_publication` and `suspend_livepeer_sales` on that Market;
  - historical Checkpoint 121 proves job
    `lp-0b8d85d5-501f-41ad-8dc6-3fc340fd99f7` finalized once in transaction
    `ArawGPvXNULAFvCKZmfo8th7s1WvxNboDjCJhMKtJwzf`. The deployed source would
    retain a confirmed outbox record with `PENDING` archive metadata and has no
    delete path. This is a strong candidate inference, not current state proof:
    no authenticated read-only operator-outbox status route exists and direct
    Durable Object storage inspection is unavailable. Eligibility therefore
    remains `UNPROVEN`.
- ROLLBACK SINIRI:
  - current stop state already is the safe rollback state: stable Bridge/Web
    100%, archive flag false, no Bridge D1 binding and zero archive rows;
  - the release rollback mechanism restores version traffic only and explicitly
    does not reverse Durable Object state. A future D1 insert is idempotent and
    append-only; successful archive evidence must not be deleted as rollback.
    Failure must restore stable 100% plus the false flag and preserve any D1/DO
    retry evidence for investigation.
- LOCAL_TEST: `PASS`; focused operator archive success/failure regressions pass
  `2/2`; release plus D1 suites pass `78/78`; `git diff --check` passes.
- CI: `BASELINE_PASS / CHANGESET_UNPROVEN`; run `31969328128` covers only
  exact baseline `1479e7fa...`, not the dirty six-path changeset.
- TESTNET: `PASS_READ_ONLY`; one final access-key-list query verifies block
  `264234095`, canonical receiver/method scope and epoch-5 public key. No
  transaction, signature, key change or chain write occurred.
- DEPLOY: `NOT_RUN`; no version upload, route, schedule, binding, flag or
  traffic change occurred.
- RUNTIME: `PASS_READ_ONLY / RUNTIME_CLOSED`; Bridge stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17`, Web stable
  `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` and read model stable
  `62451057-c6b6-40ff-a8f6-0ac6723d0a1c` each remain 100%. Fresh Bridge health
  returns `stage=DISABLED` and every provider/operator/upload/playback/Queue/
  archive readiness field false.
- GÜNCEL FAZ KAPISI:
  `PHASE2_OPERATOR_OUTBOX_D1_ARCHIVE_COMMIT_PREFLIGHT_DECISION_REQUIRED` is
  closed with a blocked result. A real archive commit cannot be attempted from
  current source/runtime. Stop here. The single proposed next gate is
  `PHASE2_CAPACITY_CHANGESET_CI_DECISION_REQUIRED`: review only the six dirty
  paths, create an explicit-path commit/draft PR and obtain exact-head CI; do
  not merge, deploy, add the D1 binding, expose operator status, activate the
  archive flag or write/delete D1 in that gate.

### CHECKPOINT 171 — Phase 2 / capacity changeset exact-head CI

- DURUM: `PASS_CHANGESET_SCOPE / PASS_SOURCE_HEAD_CI / NO_DEPLOY /
  RUNTIME_CLOSED / CURRENT_GATE_CLOSED`.
- YETKİ VE KABUL:
  - the user approved only review of the existing six dirty paths,
    explicit-path commit/push, a draft PR and exact-head CI;
  - acceptance requires the PR diff to contain exactly those six paths, CI to
    pass on the exact PR head and stable-only runtime plus false flags to remain
    unchanged. Merge, deploy, binding changes, operator status exposure,
    archive activation and D1 write/delete remain excluded.
- CHANGESET VE PR:
  - explicit staging contained only
    `docs/architecture/transformation-progress.md`,
    `workers/livepeer-bridge/src/durable-object-capacity.test.ts`,
    `workers/livepeer-bridge/src/durable-object-capacity.ts`,
    `workers/livepeer-bridge/src/finalize.test.ts`,
    `workers/livepeer-bridge/src/index.test.ts` and
    `workers/livepeer-bridge/src/index.ts`; cached diff check passed and the
    worktree contained no additional path;
  - source commit `5a5b8186ad99d35811dd814ed6eb63bdc95b6344` was
    pushed to `agent/phase2-do-capacity-contract-20260816`. Draft PR #127 is
    open against `main`, exact head `5a5b8186...`, with exactly the same six
    files. It was not made ready and was not merged;
  - the GitHub connector lacked PR-create permission (`403`), so the already
    authenticated scoped `gh` fallback created only the draft PR. No other
    GitHub mutation was performed.
- LOCAL_TEST: `PASS`; the source remains exactly the locally verified
  Checkpoint 169 implementation: focused Bridge suites `153/153`, complete
  Bridge `202` passed with two opt-in skips, mocked provider canaries `71/71`,
  TypeScript, Wrangler dry-run, Docs build and diff checks passed. The release
  plus D1 suites from Checkpoint 170 passed `78/78`.
- CI: `PASS_EXACT_SOURCE_HEAD`; pull-request run `31971406756` completed
  successfully at exact SHA `5a5b8186ad99d35811dd814ed6eb63bdc95b6344`.
  Bridge, Docs, dependency audits, JavaScript/TypeScript CodeQL, Rust CodeQL and
  the aggregate CI Gate passed; Contracts, Web and Livepeer Protocol were
  path-filtered skips. There were zero failed or pending checks. This
  append-only evidence commit is intentionally not used as self-referential CI
  evidence; its own exact-head Actions result must be checked externally before
  handoff.
- TESTNET: `NOT_RUN`; no provider read, wallet action, signature, chain query,
  transaction or D1 mutation occurred.
- DEPLOY: `NOT_RUN`; repository variable `DEPLOY_PREVIEW_ENABLED=false`, GitHub
  reports zero deployments for exact source SHA `5a5b8186...`, and no version,
  route, binding, schedule, flag or traffic mutation occurred.
- RUNTIME: `PASS_READ_ONLY / RUNTIME_CLOSED`; Wrangler reports Bridge stable
  `86305272-4ebb-4ca4-9d0e-11e3bd182b17` 100% and Web stable
  `874a3f92-acd1-44d3-b23b-6e38c7ccd6e0` 100%. A fresh cache-busting Bridge
  health probe returns the exact Bridge version, `stage=DISABLED`, and false
  for provider/operator mutation, new upload, control plane, playback V1/V2/
  shadow, Queue and both archive readiness fields.
- GÜNCEL FAZ KAPISI:
  `PHASE2_CAPACITY_CHANGESET_CI_DECISION_REQUIRED` is closed. Stop here. The
  single proposed next gate is
  `PHASE2_PR127_EXACT_HEAD_REVIEW_DECISION_REQUIRED`: verify the final
  append-only evidence head and its exact-head CI, then decide separately
  whether to make PR #127 ready and squash-merge it. Do not merge or advance to
  a runtime/archive gate without explicit approval.
