# YouTick architecture transformation progress

Status: `PHASE_6_LOCAL_PARTIAL / ARCHITECTURE_VALUES_ACCEPTED / RUNTIME_GATES_CLOSED`

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
| DEC-002 | PARTIAL | The technical pilot is explicitly non-refundable. Product/legal/finance confirmation for mainnet general access is still absent. | Preserve no-automatic-refund behavior; no implied credit or mainnet policy claim. |
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
  retention and dead-letter Queue; no binding or activation yet.
- D1 operations: Neardata testnet final blocks, deployment-block start,
  complete-block cursor, Workers Paid, one-minute cron, max 180 blocks/run,
  Platform/SRE ownership, RPO 0, RTO 4h and pilot end plus 90-day retention.
- Finance: technical pilot is explicitly non-refundable.
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
| Base metrics and structured log schema active | PARTIAL | Edge requests, every direct NEAR/Livepeer API/TUS/media fetch, persisted UploadJob transitions, upload-intent control, verified Queue ACK/delivery lag, payment quote/status routes, bounded legacy/v2 shadow decisions, playback internal errors, takedown-token attempts, pending operator nonce age and bounded read-model routes emit events. Market exposes the exact storage/reserve guard; a read-only probe computes final-to-optimistic RPC lag; exact-SHA release manifests record verified bundle/config/lockfile byte counts. URLs, payloads, credentials, nonce values and job/provider identifiers are omitted. A source-only policy locks five report thresholds to those sources. DO storage, Queue depth, cold-start metrics and deployed aggregation remain missing. `LOCAL_TEST`; deployed activation `UNPROVEN`. |

### Phase 1 — P0 security and governance

| Exit gate | Status | Evidence |
|---|---|---|
| P0 signless-key tests pass | PASS | FullAccess, empty/additional methods, wrong receiver, null/unlimited, below-minimum and above-maximum allowance are rejected at finality. Exact finite permission passes; RPC unknown fails closed without duplicate provisioning. Secure disconnect covers subject-grant revoke, exact-key deletion and wallet-rejection preservation. Targeted matrix 12/12 and related grant suite 11/11. `LOCAL_TEST`; CI/runtime proof absent. |
| Browser secret is not broad persistent localStorage state | PASS_LOCAL | Signless secrets use sessionStorage; legacy `youtick:signless-keystore:` localStorage entries are removed and no persistent-device option exists. Explicit disconnect wallet-signs `revoke_subject_sessions` plus deletion of the exact signless key, and fails closed if approval is rejected. A production nonce CSP has no `unsafe-inline`; local production HTTP/browser smoke passed. `LOCAL_TEST`; deployed wallet/browser proof is absent. |
| Bridge freeze/rotation rehearsed on testnet | PASS | Fresh Market v2 artifact hash matches on-chain code. Guardian freeze, frozen rotation, old/new authority checks, admin unfreeze and restoration of the original bridge were executed with NEP-297 events. Final state is unfrozen with no pending rotation. `TESTNET_MUTATION`. |
| Migration verified on fixture | ACCEPTED_PILOT_EXCEPTION | Market v2 source has `state_version=2`; the accepted pilot uses fresh empty IDs and does not claim old-state migration. Mainnet snapshot/import remains a later gate. |
| Access pause/resource semantics fixed | PASS | Fresh Access v2 requires a bounded Play resource, applies global/scope pause during verification, caps each owner at 16 active grants, paginates list/cleanup and can disable new issuance. Contract 14/14 and web call-shape 11/11 pass. On testnet one session-only grant verified, revoked and cleaned to empty. `LOCAL_TEST` + `TESTNET_MUTATION`. |
| RPC abuse test proves bounded resources | PASS_LOCAL | Read/broadcast routes are separate; experimental methods are absent; 64 KiB request and 2 MiB response caps, 2.5-second upstream and six-second read deadlines, bounded rate maps, IP/account limits, read-only fallback, broadcast no-replay, safe provider metrics and a three-failure circuit breaker have 15/15 route regressions, including proof that an open circuit skips the failed upstream. Dedicated authenticated primary is supported but not deployed; per-instance rate limiting is not a distributed edge guarantee. `LOCAL_TEST`. |
| No open P0 except controlled legacy playback grant | PASS_LOCAL | Nonce CSP and secure revoke/clear UX now pass locally. Bridge governance, fresh-v2 state choice, AUTH-001 and Access bounds pass locally/testnet as recorded. The controlled legacy playback path remains closed by runtime gates; deployed verification is `UNPROVEN`. |
| Security regressions are mandatory CI gates | PARTIAL | Relevant CSP, signless, Access and governance tests run in the Web/Contracts jobs. All tracked third-party Actions are commit-SHA pinned; runtime npm advisories and RustSec findings reachable from normal contract WASM graphs are required CI Gate dependencies; source-only CodeQL covers JavaScript/TypeScript and Rust. Current-branch CI and CodeQL execution remain `UNPROVEN`. `LOCAL_TEST`. |

### Phase 2 — stateless playback and bounded state

| Exit gate | Status | Evidence |
|---|---|---|
| V2 authorizer works in production-like staging | PARTIAL | The separately gated v2 route works in local Worker integration tests. It verifies real device and NEP-413 signatures, final publication/entitlement and a 180-second JWT; the all-playback issuance gate rejects both v1 and v2 before any RPC read. Production-like staging is `UNPROVEN`. `LOCAL_TEST`. |
| Persistent write per token is zero | PASS_LOCAL | V2 invokes the authorizer directly without `LIVEPEER_CONTROL`; success and same-request replay tests prove no DO access while final reads repeat. V1 remains an independently closed fallback. `LOCAL_TEST`. |
| Cold and cache-hit NEAR reads meet approved bounds | PASS_LOCAL | Cold v2 performs three final NEAR reads plus one provider-policy read. The bounded 1,024-record cache makes a fully warm replay use zero NEAR/provider reads. Publication/provider expire at 30 seconds, wallet proof at 60 seconds, positive entitlement at five minutes and negative at three seconds. Takedown and removed-key boundary tests pass. `LOCAL_TEST`; deployed latency is absent. |
| Legacy/v2 shadow mismatch below approved threshold | PARTIAL | The accepted mismatch ratio is exactly 0. A separately gated source path embeds an independently signed v2 proof in a legacy request, fixes and returns only the legacy result, then runs the existing v2 decision without JWT or durable writes through `waitUntil`. A mismatch regression logs only bounded ALLOW/DENY/UNAVAILABLE and reason codes. Both shadow flags default false and are not release-wired. Deployed samples and a pass result remain `EXTERNAL_EVIDENCE_REQUIRED`. `LOCAL_TEST`. |
| Device-certificate UX and revoke/clear verified | PASS_LOCAL | Web creates an eight-hour wallet-authorized certificate, stores its secret only in sessionStorage and clears it on disconnect. Wrong origin, expired certificate, invalid/removed/non-FullAccess wallet key and invalid device signature fail closed locally. A stolen certificate remains usable until expiry unless its wallet key is removed; deployed wallet UX is `UNPROVEN`. `LOCAL_TEST`. |
| Access grant issuance can be disabled | PASS_LOCAL | Fresh Access v2 has an independent, readable issuance flag behind the existing owner timelock. One regression proves the exact 24-hour decommission sequence: a grant issued during the delay remains verifiable, execution rejects new issuance, and subject revoke plus bounded cleanup still work. Testnet execution remains absent. `LOCAL_TEST`. |
| DO retention/cleanup proven automatically | PARTIAL | Creator-fee/payment rate-limit objects alarm and `deleteAll()` at window expiry; signed control nonces expire with their at-most-five-minute request and purge in 128-record batches; normal/ambiguous admission leases release at 30/15 minutes, webhook dedup purges at 30 days and admission-reopen audit at 90 days. Independent default-off UploadJob and operator outbox D1 archive sources persist bounded summaries, commit/retry metadata and 14/90-day eligibility boundaries locally. Real D1 commits, both destructive deletes and a complete class-wide max-record contract remain absent. `LOCAL_TEST`. |

### Phase 3 — upload and Livepeer control plane

| Exit gate | Status | Evidence |
|---|---|---|
| Multiple creators upload concurrently | PARTIAL | The serialized coordinator now admits two different creators concurrently, preserves one active job per creator and rejects a third. Actual parallel provider/TUS E2E is `UNPROVEN`. `LOCAL_TEST`. |
| One stuck job does not close global admission | PASS_LOCAL | A generic `CREATE_AMBIGUOUS` or first transient provider failure releases after the accepted 15 minutes while admission stays open; its per-job DO still prevents duplicate provider create. Provider-wide 402/429 immediate closure and two independent 5xx/timeouts inside 60 seconds remain separate circuit-breaker conditions. `LOCAL_TEST`. |
| Lease timeout auto-releases | PASS_LOCAL | Normal reservations receive a random lease ID, expire after 30 minutes and renew from the same session-only upload key every five minutes. Coordinator alarm release, wrong-lease rejection and web signing pass locally. The separate ambiguous timeout remains 15 minutes. Real long-upload/browser/staging proof is absent. `LOCAL_TEST`. |
| Reload/crash resumes the same TUS resource | PARTIAL | An authenticated retry after browser-key replacement and job-object restart returns the same TUS URL without a second provider create; client HEAD/offset resume also passes. The independent new-upload gate rejects an unrecorded intent while the same recorded Job returns its existing TUS resource. The v2 session draft checks name/bytes/lastModified plus bounded source SHA-256; signed upload-intent v3 persists that declaration and rejects a conflicting recovery. Real browser reload/staging and provider-computed full-source fingerprint proof are absent. `LOCAL_TEST`. |
| Webhook ACK avoids heavy provider probing | PARTIAL | The gated ingress verifies HMAC/timestamp, sends a bounded Queue message and returns `202` before job-object/provider work. Consumer ACK/retry/poison behavior and fail-closed policy drift pass locally. Pilot policy is batch 10/5 seconds, three retries, concurrency 1, four-day retention and DLQ; no Queue binding or staging traffic exists. `LOCAL_TEST`. |
| Duplicate/out-of-order queue tests pass | PASS_LOCAL | Duplicate ready-event processing remains idempotent, and duplicate late `asset.updated/processing` Queue delivery cannot regress an `ONCHAIN_PUBLISHED` job; both messages ACK and schedule reconcile only. Real Queue redelivery remains `UNPROVEN`. `LOCAL_TEST`. |
| Worker split across domain boundaries | PARTIAL | The vendor-neutral port is 88 lines; separate 319-line provider/transport, 251-line ready-verification, 75-line webhook-normalization, 77-line UploadJob archive, 76-line operator archive and 33-line observed-fetch modules own external details. `workers/livepeer-bridge/src/index.ts` is 5,289 lines and still contains routes, domain state, a small environment composition factory, NEAR and DO logic. `LOCAL_TEST`. |
| UploadJob terminal cleanup works | BLOCKED | The 14-day policy and default-off bounded D1 archive source pass locally, but deletion is intentionally absent until a real D1 archive commit is proven and v1 playback no longer reads the job. Neither external precondition exists, so no destructive cleanup is scheduled. |
| Provider cost/budget metrics visible | PARTIAL | Source requires and reports positive monthly/per-job reservation values and auto-closes before exceeding the configured cap. This is a guard, not actual-cost accounting. Livepeer's public [Studio pricing](https://livepeer.studio/pricing) is minute-based and includes plan/minimum-spend terms, while the bridge upload intent has no duration and the asset response has no per-job billed-cost field. Machine-readable commercial terms plus invoice/usage reconciliation are `EXTERNAL_EVIDENCE_REQUIRED`. |

### Phase 4 — events, read model and finance

| Exit gate | Status | Evidence |
|---|---|---|
| Standard events emitted on testnet | PARTIAL | Market source emits the economic/publication/withdrawal/governance catalog as `youtick_market@1.0.0`; fresh-v2 testnet previously proved governance events only. The new economic catalog is local and not deployed. `LOCAL_TEST` + prior `TESTNET` governance evidence. |
| Read model rebuilds from chain | PARTIAL | The bounded Neardata adapter reads an exact testnet final block, verifies receipt/event bindings and feeds the deterministic reducer/atomic D1 writer. Temporary D1 API failures return a bounded 503; scheduled ingestion emits and throws only a bounded error code, while initial Discover falls back to NEAR without cursor mixing. A live read parsed the deployment block and a legacy governance event. No scheduler, D1 binding or zero-to-tip rebuild exists. `LOCAL_TEST` + `TESTNET_READ`. |
| Event idempotency/finality watermark tests pass | PARTIAL | Exact contract replays emit no duplicate event. Reducer deduplicates `(block_height, receipt_id, event_index)`, rejects conflicts and the D1 writer advances a complete final block, including an empty block, atomically. No real D1 transaction exists. `LOCAL_TEST`. |
| Discover/profile use read API | PARTIAL | A disabled-by-default Web client reads active Discover pages and creator publication/sales history from the versioned D1 API. Initial Discover failure falls back to canonical NEAR without mixing cursors; creator available balance/withdrawal and all purchase/playback authority stay on NEAR. Release metadata forces the new gate false; no D1 binding/deploy exists. `LOCAL_TEST`. |
| Purchase/playback remain canonical-chain based | PASS | Current architecture and Worker final reads retain NEAR authority. `LOCAL_STATIC`; target runtime activation is not implied. |
| Sale ledger and withdrawal audit available | PARTIAL | Event reducer/D1 projections include sale ledger, entitlements and withdrawal history; rebuild and D1 retain the same exact withdrawal event status. Creator aggregate sales use exact decimal-string/BigInt addition rather than lossy SQLite integer casts. No deployed D1, support authorization or accounting reconciliation exists. `LOCAL_TEST`. |
| Refund/credit policy approved | PARTIAL | Technical pilot is explicitly non-refundable. Mainnet product/legal/finance confirmation and accounting invariants remain open. |

### Phase 5 — scale, cost and SRE

| Exit gate | Status | Evidence |
|---|---|---|
| SLO dashboards and alerts active | PARTIAL | `observability/slo-policy.json` locks five report thresholds, binds all nine alert classes to a primary role/action and inventories the report's six domain controls. All six controls are source-ready, including guardian pause/admin unpause for global new purchases. The policy is `SOURCE_ONLY`: no named on-call, deployed aggregation, dashboard, notification route, delivered alert or drill receipt exists. `LOCAL_TEST`. |
| Hot-publication latency/error target met | EXTERNAL_EVIDENCE_REQUIRED | No approved load target execution exists. |
| DO growth bounded and cleanup verified | PARTIAL | The accepted ceiling is 256 persistent records per Durable Object; shared transactional source rejects record 257 and permits existing-key replay at the ceiling. Control nonce, webhook dedup, rate-limit and admission-audit cleanup pass locally; confirmed operator records are minimized and have a default-off bounded D1 archive/90-day eligibility source. Real operator archive commit/delete, UploadJob destructive cleanup and deployed record metrics remain absent. `LOCAL_TEST`. |
| Upload-resume success above approved threshold | EXTERNAL_EVIDENCE_REQUIRED | The accepted gate is at least 99% same-resource resume with exactly zero second payments and zero second provider assets. Local recovery/canary regressions pass, but no deployed pilot sample or payment/provider receipt aggregation exists. |
| RPC/provider fault injection degrades safely | PARTIAL | The report's eight chaos scenarios now map to deterministic local regressions: bounded NEAR failures/circuit, Livepeer 429/5xx/timeout admission behavior, duplicate/out-of-order webhook, Queue retry/redelivery, ambiguous broadcast reuse, exact-version rejection, early/delayed alarm timing and bounded D1/API/Web fallback. This is complete source-matrix coverage, not a real chaos run. Provider, Cloudflare Queue/D1, mixed deployed versions and staging evidence remain `EXTERNAL_EVIDENCE_REQUIRED`. `LOCAL_TEST`. |
| Cost model and budget alarm defined | PARTIAL | Approved pilot monthly/per-job reservation values fail closed locally and provider 402/429 closes admission. Actual Livepeer billed-usage/invoice reconciliation and delivered budget alerts remain external. `LOCAL_TEST`. |
| Security/supply-chain gates mandatory | PARTIAL | All tracked third-party Actions are commit-SHA pinned and locally enforced; runtime npm high-severity advisories and RustSec vulnerabilities reachable from normal contract WASM graphs block the CI Gate. The same graph now produces source-verified SPDX 2.3 contract SBOMs and requires a 30-day exact-SHA CI artifact. Source-only CodeQL plus release provenance and Web/Bridge runtime SPDX SBOM attestations exist but have not run. `wee_alloc` is absent from production WASM; test/dev `time`, contract SBOM artifact/attestation, required-check protection and current-branch CI/attestation evidence remain open. `LOCAL_TEST`. |
| Exact-SHA mainnet release candidate reproducible | PARTIAL | Release/security/SLO tooling tests 101/101; no mainnet candidate artifact or activation evidence. `LOCAL_TEST`. |

### Phase 6 — resilience, audit and mainnet

| Exit gate | Status | Evidence |
|---|---|---|
| External audit P0/P1 closed | EXTERNAL_EVIDENCE_REQUIRED | No audit report supplied. |
| Bridge/provider/migration drills complete | EXTERNAL_EVIDENCE_REQUIRED | Fresh mainnet ID plus independently audited snapshot/import is accepted, but no mainnet implementation, audit or current drill packet exists. |
| Provider asset-loss response drill succeeds | PARTIAL | The source-only incident policy suspends sales/playback and requires creator re-upload with a new publication or takedown. No deployed provider-loss drill, support receipt or user-facing terms exist. `LOCAL_STATIC`. |
| Dark deploy and internal mainnet canary proven | EXTERNAL_EVIDENCE_REQUIRED | Preview is disabled; production app/Bridge DNS did not resolve; no mainnet mutation is authorized. |
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
| PLAY-001 | 2 | PASS_LOCAL | Eight-hour NEP-413 device certificate, session-only device key, signed request binding and disconnect clear pass locally; deployed wallet proof is absent. |
| PLAY-002 | 2 | PASS_LOCAL | V2 verifies final publication/entitlement and returns a 180-second playback-bound JWT without Access grant or DO writes. The all-playback issuance gate closes both legacy and v2 routes before RPC use; staging/load and deployed-gate proof are absent. |
| PLAY-003 | 2 | PARTIAL | Bounded TTL cache, cold/hit read counts, provider JWT-policy check and 30/60-second takedown/key-removal bounds pass locally. Default-off legacy/v2 shadow execution returns only the legacy response, reuses the v2 decision without another JWT/write and emits bounded decision/reason-code comparison. The accepted mismatch ratio is 0; event-driven invalidation and deployed cache/shadow/latency samples remain absent. |
| DO-001 | 2 | PARTIAL | Shared transactional enforcement rejects record 257 and permits existing-key replay at the accepted 256-record ceiling. Rate-limit `deleteAll()`, 30-day webhook dedup and 90-day admission audit cleanup pass automatically. Independent default-off UploadJob and confirmed operator D1 archives enforce bounded summaries plus 14/90-day eligibility locally without deletion. Real archive commits, operator/UploadJob destructive cleanup and deployed metrics remain absent. |
| UP-001 | 3 | PASS_LOCAL | Coordinator limits, budgets, 30-minute lease, five-minute heartbeat, wrong-token rejection, alarm release and 15-minute ambiguity isolation pass locally. A default-off new-upload gate rejects unrecorded intents while recorded intent/heartbeat/TUS recovery remains available. Real browser/large-upload/staging evidence is absent. |
| UP-002 | 3 | PARTIAL | One allowed-predecessor table and timestamps cover real `AUTHORIZED → LEASED → PROVIDER_CREATE_PENDING → UPLOAD_READY → UPLOADING → PROCESSING → READY_VERIFIED → FINALIZE_RETRY/QUEUED → ONCHAIN_PUBLISHED` signals plus cancel/expiry/provider-failure terminals. Creator cancellation is pre-provider-only and non-refundable. Provider create uses one fail-closed `RECONCILE_ONLY` attempt; finalize retry uses capped 60–900-second backoff. Default-off terminal D1 archive/14-day eligibility passes locally, but real commit, v1 playback independence and deletion are absent. `LOCAL_TEST`. |
| UP-003 | 3 | PARTIAL | Authenticated retry after browser-key replacement/object restart and after `UPLOADING` recovers the same TUS URL with no second provider create. The accepted gate is at least 99% resume success with zero second payments/assets. The v2 session draft rejects same-metadata/different-content files; upload-intent control v3 signs its bounded SHA-256 and UploadJob v2 rejects a conflicting retry. Deployed samples and payment/provider receipts remain absent. `LOCAL_TEST`. |
| LP-001 | 3 | PARTIAL | Gated HMAC-verified Queue ingress and ACK/retry/poison consumer pass locally. Approved batch/retry/concurrency/retention/DLQ values fail closed on drift. Real binding, platform config, redelivery and staging proof are absent. |
| LP-002 | 3 | PARTIAL | The concrete `MediaProvider` implementation now lives with separate API/TUS transport and raw normalization; ready validation, bounded private-media probes and pure webhook normalization also have explicit modules. The independent provider-mutation gate blocks create before lease/provider use while keeping an authorized job recoverable; provider reads and existing TUS recovery stay available. Conservative cost reservation exists, but actual billing reconciliation is external. No runtime asset-delete call site exists, so an unused mutation was not added. `LOCAL_TEST`. |
| WEB-001 | 3 | PASS_LOCAL | One canonical UI stage follows the target lifecycle and a pure predecessor table enforces forward/retry/reset/terminal edges. A fingerprint-verified v2 draft restores safe UI projections; provider-processing resumes visibility-aware Query polling without reopening payment, while interrupted upload returns to upload-ready. The finality retry and composed job/publication read now live in the existing publication use-case service, leaving the component without a direct network primitive or timer. Real browser reload/staging proof remains absent. `LOCAL_TEST`. |
| EVENT-001 | 4 | PARTIAL | Market v2 locally emits job, rebuild-complete publication, entitlement, withdrawal, bridge and quote-key events with common context/idempotency fields and no capabilities. The fresh testnet v2 has zero publications, but the updated artifact is not deployed; `contract_migrated`, testnet economic-event proof and final receipt/event indexing remain absent. |
| DATA-001 | 4 | PARTIAL | Source-only D1 schema, deterministic rebuild, complete-block atomic writer, bounded Neardata adapter, testnet-only scheduled entrypoint, contiguous cursor, >16-event fail-closed policy, structured lag telemetry, GET-only API and closed Discover/profile client pass locally. D1 query/ingestion exceptions are reduced to bounded 503/error codes and initial Discover fallback never mixes cursors. Start block is 263118001; no Worker/cron deployment, D1 binding/alert delivery or deployed RTO drill exists. |
| PAY-001 | 4 | PARTIAL | Technical pilot is non-refundable; source-only exact sale ledger, creator aggregate and withdrawal audit pass locally. Mainnet policy approval, deployed D1 and accounting reconciliation remain absent. |
| SRE-001 | 0–5 | PARTIAL | Redacted request/dependency/Queue/payment telemetry, Market reserve/RPC-finality sources and a machine-readable `SOURCE_ONLY` policy exist. All nine alerts have a role/action and all six domain controls are source-ready. Guarded release inputs remain closed; the contract purchase control requires a separately approved on-chain pause receipt. Queue depth, DO storage, cold-start/platform aggregation, named on-call, deployed control exercise, dashboard, delivered alerts and drills are absent. |
| PERF-001 | 5 | PARTIAL | Opt-in local runs reject 100,000 wrong-origin requests with zero growth and serve 1,000 authorized warm requests at 9.15 ms p95 with zero errors, no warm external/DO calls and bounded cache. Mocked local latency is not deployed evidence. |
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
