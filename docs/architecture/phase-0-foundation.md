# Phase 0 architecture foundation

Status: `PILOT_DECISIONS_ACCEPTED / EXTERNAL_EVIDENCE_PENDING / RUNTIME_CLOSED`

This document records decisions and current evidence. The user accepted the
pilot directions and recommended bounded parameters below on 2026-08-09.
These decisions do not by themselves authorize a particular deployment,
contract migration, wallet signature, funding, traffic change or feature-gate
change.

## Decision register

### ADR-001 — Playback temporary authority

- Status: `ACCEPTED_FOR_PILOT`
- Decision: replace on-chain short-lived Play grants and per-token
  Durable Object nonce writes with a wallet-authorized, origin/account/scope
  bound device-session certificate. Each request is signed by the session key;
  the authorizer checks final publication and entitlement state and returns a
  short-lived playback-ID-bound JWT without persistent writes.
- Transition: keep the v1 grant path behind a closed, separately controlled
  fallback while v2 shadow/canary evidence is gathered. Do not delete legacy
  grants before a migration and rollback decision.
- Current evidence: the separately gated `/v2/playback-tokens` source path
  verifies the wallet certificate, device request, final publication and
  same-block entitlement plus bounded provider policy, then issues a 180-second
  JWT without a Durable Object or persistent write. Local cold/hit, expiry and
  100k unauthorized-request tests exist. A separately gated shadow source now
  compares bounded v1/v2 decisions without a second JWT or persistent write;
  deployed samples do not exist. The legacy v1 route remains closed.
- User decision: the device-session certificate lasts at most eight hours, the
  playback JWT lasts 180 seconds, and `SALES_SUSPENDED` blocks new sales while
  preserving playback for existing entitlements. Takedown still blocks
  playback. The legacy path remains closed and separate until v2 shadow/canary
  evidence permits decommissioning.

### ADR-002 — Browser key policy

- Status: `ACCEPTED / SESSION_ONLY`
- Decision: new device-session and signless keys are session-scoped and never
  written to localStorage. Persistent device keys are out of scope.
- Signless FunctionCall keys, while the legacy path exists, must have the exact
  receiver, exact single method and finite allowance within approved bounds.
  `FullAccess`, empty/wildcard/additional methods, unlimited allowance and
  unknown permission state fail closed.
- Current source: signless secrets are written only to sessionStorage; legacy
  localStorage entries are removed. On-chain permission is checked at finality
  before use; unsafe or incompatible keys are cleared and unknown RPC state
  falls back without provisioning a duplicate key. Explicit disconnect asks
  the wallet to revoke all subject grants and delete the exact signless key;
  rejected approval preserves the connection and local key.
- Remaining proof: current-branch CI and deployed wallet/browser smoke.

### ADR-003 — Market upgrade and governance

- Status: `ACCEPTED_FOR_FRESH_V2_PILOT`
- Decision: versioned contract state, separate emergency freeze,
  governance-controlled authority rotation and a tested migration/forward-fix
  lifecycle. Freeze reduces privilege immediately; unfreeze and rotation do
  not.
- Current source: Market v2 has `state_version=2`, separate admin/guardian,
  guardian-only immediate freeze, admin-only unfreeze and a pending two-step
  bridge rotation. Freeze/unfreeze/propose/cancel/execute changes emit NEP-297
  formatted events. Frozen state rejects bridge finalization and sales
  suspension. This is local source and is not deployed.
- Pilot governance: guardian may freeze immediately; admin and guardian must be
  separate accounts. Freeze, unfreeze and authority changes must emit events.
  The first testnet/internal-pilot version has no multisig or timelock.
  Multisig and timelock are mandatory before mainnet general access.
- Pilot accounts: admin is
  `lp-arch-admin-260809.youtick-dev-v3.testnet`; guardian is
  `lp-arch-guardian-260809.youtick-dev-v3.testnet`. They are distinct testnet
  accounts with separate keys. Their credentials are stored on the same local
  host, so this proves account separation, not mainnet-grade custody separation.
- Migration decision: use new isolated market/access IDs with empty pilot
  state; do not import or overwrite the existing testnet pair. The pilot admin
  alone may unfreeze and execute a proposed rotation; admin or guardian may
  cancel it. This exception intentionally differs from the report's mainnet
  governance rule. Mainnet snapshot/import, multisig, timelock and custody
  separation remain mandatory later gates.
- Mainnet direction: use a fresh contract ID and an independently audited
  snapshot/import with invariant verification; do not overwrite the existing
  contract in place. Governance is a 2-of-3 multisig with a 24-hour timelock
  for unfreeze, authority rotation and privilege expansion. Guardian emergency
  pause/freeze remains immediate and may only reduce privilege.

### ADR-004 — Derived read model

- Status: `ACCEPTED_FOR_PILOT / LOCAL_PARTIAL`
- Decision: a read model may serve discover/profile/audit queries but
  never becomes payment, entitlement or balance authority. It is rebuilt from
  final NEAR events and deduplicates by `(block_height, receipt_id,
  event_index)` with a finality watermark.
- Initial store: D1 is accepted for the pilot; moving to managed
  Postgres requires measured query/volume evidence, not speculative dual-store
  support.
- Current evidence: a source-only D1 schema, deterministic final-event JSONL
  reducer, bounded Neardata final-block adapter, atomic per-final-block D1 writer,
  contiguous single-step cursor runner, rebuild-complete publication event,
  GET-only read API and closed Web transition pass locally. No scheduled Worker,
  cron trigger, D1 binding or deployed database exists.
- Pilot parameters: testnet final events come from Neardata, starting at fresh
  Market v2 deployment block `263118001`. The cursor advances only after a complete
  final block, including empty blocks. Platform/SRE owns operations and privacy
  execution; the chain remains the zero-data-loss source (`RPO 0`) and a full
  rebuild must complete within four hours (`RTO 4h`). Pilot-derived data is
  retained through pilot end plus 90 days, then deleted unless an active audit
  hold applies.
- Still required: provider-side Worker/cron/D1 binding, measured rebuild
  recovery, lag alerts and a named human owner before pilot traffic.

### ADR-005 — Upload orchestration state

- Status: `ACCEPTED_FOR_PILOT`
- Decision: one bounded UploadJob DO per job/generation, a separate
  lease/budget coordinator, fast authenticated webhook ACK to Queue, and a
  consumer that verifies provider state and advances finalization. Terminal
  state is archived only if policy requires it, then deleted.
- Current evidence: a per-job DO and shared admission object exist. The
  coordinator permits two global jobs, one active job per creator and two
  attempts per creator/day; an ambiguous reservation releases after 15 minutes
  without globally closing unrelated creators. The optional Queue path verifies
  the webhook at ingress, ACKs after enqueue and processes it in the per-job
  consumer; its tracked gate is false and no real Queue binding exists.
  Rate-limit, dedup and admission-audit cleanup now exist. A default-off
  testnet D1 writer archives bounded terminal summaries and records the 14-day
  eligibility boundary locally. A second default-off D1 writer archives only
  bounded confirmed-operator summaries and records the 90-day eligibility
  boundary. Neither path has a real D1 binding/commit or destructive cleanup.
  The Worker
  requires both a positive per-job reservation and monthly budget, persists an
  `AUTO_CLOSED/monthly_budget_exceeded` state before rejecting a new job, and
  reopens it automatically only after the UTC month changes.
- Pilot parameters: two concurrent jobs globally, at most two attempts per
  creator/day, a 15-minute ambiguous-create window, a 20,000,000 micro-USD
  monthly cap, a 2,000,000 micro-USD per-job reservation and the funded pilot
  creator as the initial allowlist entry. A normal lease lasts 30 minutes and
  must heartbeat every five minutes. UploadJob terminal state is retained 14
  days, webhook dedup 30 days and operator audit 90 days. Terminal deletion is
  permitted only after its D1 archive commit is proven and legacy v1 playback
  no longer reads that job. The pilot Queue uses batch size 10, five-second
  batch timeout, three delivery retries, consumer concurrency 1, four-day
  retention and a dead-letter Queue. These Queue settings remain unbound and
  inactive in tracked runtime configuration.
- Persistent Durable Object state must remain at or below 256 auditable records
  per object. Reaching the bound closes the relevant new mutation until cleanup
  or archive succeeds; it does not authorize data loss. Shared source now counts
  new keys inside the same storage transaction, rejects record 257 and permits
  updates/replays of an existing key at the ceiling.

### ADR-006 — Refund and credit policy

- Status: `ACCEPTED_FOR_TECHNICAL_PILOT / MAINNET_DECISION_REQUIRED`
- Current repository policy: no automatic provider-failure refund; closed
  canary refunds are manual and recorded.
- Decision: the technical pilot is explicitly non-refundable. No automatic
  provider-failure refund or implied platform credit is introduced.
- Mainnet general access remains blocked until product/legal/finance/contract
  owners confirm the policy, user-facing terms and accounting invariants.

### Accepted later-phase resilience and acceptance policy

- Source retention: YouTick does not keep a platform source-media backup.
  Creators retain their source files. Provider asset loss suspends sales and
  playback; recovery requires creator re-upload and a new publication or
  takedown. D1 remains only a rebuildable metadata read model.
- Playback transition: the allowed legacy/v2 authorization mismatch ratio is
  exactly zero. Any mismatch fails the gate; a deployed shadow sample is still
  required.
- Upload recovery: successful same-resource resume must be at least 99%; second
  payment count and second provider-asset count must both be zero.
- Durable Object bound: at most 256 persistent records per object. Shared
  source enforcement is ready; deployed storage evidence is still required.

## Accepted Phase 0 pilot parameters

These values were accepted on 2026-08-09. Recording them does not change runtime
configuration or authorize mainnet behavior.

| ID | Accepted pilot decision | Status |
|---|---|---|
| MIG-001 | Fresh isolated Market v2 and Access IDs; no import or overwrite of the existing testnet pair. | ACCEPTED |
| GOV-001 | Guardian-only immediate freeze; admin-only unfreeze/propose/execute; admin or guardian cancel; all changes emit events. No pilot multisig/timelock. | ACCEPTED_FOR_TESTNET_PILOT |
| PLAY-001 | Preserve entitled playback during `SALES_SUSPENDED`; takedown blocks it. | ACCEPTED |
| PLAY-002 | Eight-hour device certificate and 180-second JWT; session-only key. | ACCEPTED |
| UP-001 | Global concurrency 2; two attempts per creator/day; 15-minute ambiguous-create window. | ACCEPTED |
| UP-002 | Monthly 20,000,000 micro-USD; per-job 2,000,000 micro-USD; initial allowlist `lp-arch-creator-260809.youtick-dev-v3.testnet`. | ACCEPTED_NOT_CONFIGURED |
| UP-003 | Normal lease TTL 30 minutes; heartbeat interval 5 minutes. | ACCEPTED_NOT_CONFIGURED |
| QUEUE-001 | Batch 10/5 seconds; 3 retries; concurrency 1; retention 4 days; DLQ. | ACCEPTED_NOT_BOUND |
| DATA-001 | Neardata testnet source; deployment-block start; complete-block cursor; Workers Paid; one-minute cron; max 180 blocks/run; Platform/SRE; RPO 0/RTO 4h; pilot plus 90-day retention. | ACCEPTED_NOT_BOUND |
| RET-001 | UploadJob 14 days; webhook dedup 30 days; operator audit 90 days; terminal delete only after D1 archive commit and v1 playback independence. | PARTIAL_LOCAL |
| PLAY-003 | Legacy/v2 shadow mismatch ratio exactly 0. | ACCEPTED_NOT_MEASURED |
| UP-004 | Upload resume success at least 99%; second payment and second provider asset both exactly 0. | ACCEPTED_NOT_MEASURED |
| STATE-001 | At most 256 persistent records per Durable Object. | ACCEPTED_SOURCE_READY |
| GOV-002 | Mainnet 2-of-3 multisig plus 24-hour timelock; guardian emergency pause/freeze remains immediate and privilege-reducing only. | ACCEPTED_NOT_IMPLEMENTED |
| MIG-002 | Fresh mainnet contract ID plus independently audited snapshot/import and invariant verification; no in-place overwrite. | ACCEPTED_NOT_IMPLEMENTED |

The testnet/internal-pilot direction is recorded, but contract deploy/freeze,
traffic, provider upload and runtime enablement still require an exact target
packet with artifact SHA, account IDs, rollback and cleanup proof.

## Testnet pilot role accounts

Created and funded on 2026-08-09 after explicit user authorization. This is
`TESTNET_MUTATION`, not a contract deployment or runtime activation.

| Role | Account | Initial balance | Public key | Creation transaction |
|---|---|---:|---|---|
| Admin | `lp-arch-admin-260809.youtick-dev-v3.testnet` | 0.100 NEAR | `ed25519:5ffJRpG2zNtjZrrzWyZ2akyqLFmp6Uzi5NTfC54MiQwc` | `5JyUokUXfhzi9wTvyZarQJT6MPoEGrBwbuF3dLBCdkWp` |
| Guardian | `lp-arch-guardian-260809.youtick-dev-v3.testnet` | 0.100 NEAR | `ed25519:Eby9tXX5iwqPofNZXh5KL1jfKKfrSxYBpfDZM6q7ZTsi` | `EKBxroFh9BvkhbNxn7XPiTNtsNQio83cTGgk6SQLN4X4` |
| Pilot creator | `lp-arch-creator-260809.youtick-dev-v3.testnet` | 0.100 NEAR | `ed25519:6iqK3Khhav71LFcsQBTVGtPUfzdqd95bC4DSfzpo4ngw` | `D1TUs7BrMjzDpWnW2q75ztP9bPhGqQ3uXitj1rpiU8j7` |

At final block `263114435`, each account held 0.100 NEAR, used 182 bytes, had no
contract code and had exactly one FullAccess key. The six generated legacy
and per-key credential files remain outside the repository and were tightened
to mode `0600` without reading or copying their secret contents. The local NEAR
CLI was updated from 0.11.1 to 0.29.0 because the old client could not parse the
current testnet RPC response.

## State inventory

`Unknown` means a policy decision is required; it is not an implicit unlimited
value.

| State | Current canonical owner | Current growth/lifecycle | Target owner | Target cleanup | Status |
|---|---|---|---|---|---|
| Media job | NEAR market | One bounded record per paid job; permanent in current contract | NEAR market v2 | Versioned migration; retention is economic state | PARTIAL |
| Publication | NEAR market | One record/index entry per publication | NEAR market v2 | Takedown preserves audit history; migration | PARTIAL |
| Entitlement | NEAR market | One boolean entry per sale; permanent | NEAR market v2 | Product/legal decision; never cache authority | PARTIAL |
| Creator/platform liabilities | NEAR market | Balance maps plus platform/NEAR ledgers | NEAR market v2 | Migration invariants and storage reserve | PARTIAL |
| Legacy Play grant | Access contract | Grant plus per-owner vector; expiry does not delete; no pagination/cleanup bound | Removed from playback hot path | Stop issuance, bounded cleanup after approved transition | MISSING |
| Signless secret | Browser sessionStorage | Current-tab session; legacy localStorage entry is removed on access | Browser session | Session end or explicit clear | PASS (LOCAL_TEST) |
| Upload job key | Browser sessionStorage | Per account/job; retained for signed lease heartbeat and removed after upload success | Browser session | Same-job recovery or expiry | PARTIAL |
| Device certificate | Browser memory/request | Eight-hour wallet proof plus memory-only device key | Browser/request | Expiry, page reload or explicit disconnect; no browser/server persistence | PASS_LOCAL |
| Playback nonce | V1 job DO; none in V2 | V1 persists one key per token request; V2 uses short signed expiry without a write | None after V1 retirement | No persistent state | PARTIAL |
| Upload job | Cloudflare job DO | Job record, webhook dedup, reconcile/finalize and default-off terminal archive metadata; no destructive terminal cleanup | UploadJob DO per generation | Real D1 archive proof plus guarded `deleteAll()` after v1 independence | PARTIAL |
| Admission | Shared Cloudflare DO | Two global/one per creator; 30-minute normal lease, five-minute heartbeat, 15-minute ambiguity; published/expired reservation removed | Coordinator DO | Lease expiry alarms and rolling counters | PARTIAL |
| Operator outbox | Cloudflare DO | Pending/signed/broadcast plus minimized confirmed records; default-off bounded D1 archive and 90-day eligibility; no delete | Operator DO | Real archive commit, elapsed retention and no audit hold before delete | PARTIAL |
| Payment rate limit | Cloudflare DO | Window counters overwrite but object lifecycle is undefined | Sharded edge/DO | Window alarm and delete | PARTIAL |
| Webhook dedup | Job DO | Digest keys expire after 30 days | UploadJob DO/Queue consumer | Retention after provider/event window | PARTIAL |
| Read model | Source-only | Neardata adapter, D1 schema/writer, reducer and GET API; no scheduler/binding/deploy | D1 for pilot | Rebuild/archive per accepted retention policy | PARTIAL |
| Release configuration | GitHub variables, Cloudflare bindings/secrets | Environment-scoped; external retention unknown | Platform/SRE | Versioned sanitized snapshot and secret-store backup procedure | PARTIAL |

Cost ownership remains platform unless an approved product/economic policy
explicitly assigns creator cost. Accepted pilot quotas, budgets and retention
are recorded above; deployed enforcement remains separately evidenced.

## Threat model

| Threat | Current control | Open gap / required proof | Owner role | Priority |
|---|---|---|---|---|
| XSS steals a browser key | Per-request nonce CSP, session-scoped signless secret, no persistent device key and secure revoke | Active-tab compromise can still read in-memory authority; deployed CSP/wallet smoke and independent review are absent | Frontend + Security | P0 |
| FullAccess/wildcard access key accepted | Exact receiver/method/finite allowance check at finality before use | Current branch has local regression evidence only; CI/browser runtime proof absent | Frontend + Security | P0 |
| Unauthorized playback flood | Origin/signature/final-chain checks; runtime closed | No playback route rate limit; each accepted request writes nonce state; load/abuse proof absent | Edge + Security | P0/P1 |
| Hot publication / hot DO | Per-job DO names isolate publications | Every viewer of one publication hits one job DO and writes state | Edge + SRE | P0/P1 |
| Webhook replay/out-of-order/duplicate | HMAC/timestamp, 30-day digest dedup and source-only Queue producer/consumer tests | Real Queue redelivery/order, retry cap, DLQ and staging evidence absent | Edge + QA | P1 |
| Provider create ambiguity | One persisted create attempt, explicit ambiguous state/alarm and operator reopen audit; one transient failure leaves unrelated creators open, while two independent failures inside 60 seconds close admission | Provider/staging fault drill and inventory reconciliation remain external | Edge + SRE | P1 |
| TUS endpoint leak/reuse | Endpoint bound to job, no-store responses, log redaction | Reload recovery identity/fingerprint flow and terminal revoke proof absent | Frontend + Edge | P1 |
| Bridge key compromise | Finite operator permission expected | Market cannot freeze or rotate bridge; no governance drill | Contract + Security | P0 |
| Quote-signing key compromise | Separate disabled gate and key version | Disable/rotate/expiry runbook and contract parity drill absent | Edge + Contract + SRE | P0/P1 |
| NEAR RPC stale/fork/timeout | Final reads, separate read/broadcast proxy paths, bounded deadlines/body/rate maps, no broadcast replay and a three-failure read circuit | Dedicated-provider, distributed-edge and staging fault evidence are absent | Edge + Security | P1 |
| Contract storage exhaustion | Paid job and entitlement creation | Legacy grants/owner vectors unbounded; reserve runway metric/alarm absent | Contract + SRE | P0/P1 |
| 1Click response manipulation | Signed quote/status validation, canonical assets, mode off | Mainnet canary, compromise runbook and privacy policy absent | Payments + Security | P1 |
| Provider asset loss/public exposure | Provider identity/policy verify and sales-suspend reconcile | No source restore, secondary provider or complete incident drill | Edge + SRE | P0 gate |
| Contract migration stops halfway | Fresh-ID policy avoids in-place migration | Target migration method/invariants/manifest and recovery drill undecided | Contract + Security | P0 |

## P0 owner and test matrix

Repository CODEOWNERS maps all critical paths to `@4rmus`. Role owners below
describe the required review disciplines; named specialist assignments remain
an approval item.

| Finding | Accountable path owner | Required role review | Minimum failing test/proof before fix | Exit proof |
|---|---|---|---|---|
| AUTH-001 unsafe signless permission | `@4rmus` / `apps/web` | Frontend + Security | FullAccess, empty methods, extra method, wrong receiver, null/unlimited, below-minimum, above-maximum and RPC-unknown cases | Exact finite permission only; duplicate key not created on unknown |
| AUTH-002 persistent browser secret/CSP | `@4rmus` / `apps/web` | Frontend + Security | Migration from legacy localStorage, session clear, XSS/CSP header assertions, revoke flow | Secret absent from localStorage and production CSP has approved nonce/hash policy |
| GOV-001 bridge authority | `@4rmus` / `contracts` | Contract + Security | Unauthorized freeze/rotate/unfreeze, frozen finalize/suspend, timelock and event tests | Testnet freeze/rotate/verify/unfreeze drill with approved accounts |
| GOV-002 state migration | `@4rmus` / `contracts` | Contract + Security | Old fixture migration, liability/entitlement/index invariants, one-time guard | Snapshot/manifest and approved testnet migration drill |
| Stateless playback blocker | `@4rmus` / `workers`, `protocol`, `apps/web` | Edge + Security | 100k unauthorized requests with zero persistent growth; replay/origin/account/playback mismatch | Shadow/canary metrics and zero writes per issuance |
| Contract storage exhaustion | `@4rmus` / `contracts` | Contract + SRE | Per-user grant bound, cleanup pagination and reserve threshold tests | Storage/runway metric and alarm active |
| Runtime/config mismatch | `@4rmus` / `.github`, `scripts`, `workers`, `apps/web` | Platform + Security | Enabled/mismatched gates and wrong IDs fail before mutation | Exact-SHA health/config parity with all gates closed |

## Runtime gate and configuration evidence

Observed 2026-08-09 from read-only commands. Values that could act as
credentials are not copied.

### Tracked configuration

| File | SHA-256 | Relevant closed defaults |
|---|---|---|
| `workers/livepeer-bridge/wrangler.toml` | `594b4578d9fa0455e5446426bbdc67499cfe9816ed5a12addf81c0a281a201ed` | Bridge=false; playback-v2=false; webhook-queue=false; native-NEAR=false; multi-asset=off; creator allowlist, monthly budget and operation reservation empty |
| `apps/web/wrangler.jsonc` | `a36dfef1036267cf0175a364c3baa29308f5639749578a3b3defdfb5b77401b6` | Deployment wrapper only; web feature values are release inputs |
| `.github/workflows/ci.yml` | `26d69a68a15b9de1539d08885dcdc67fc7622d205eceaf9e68bd401b1d90c0b8` | CI web flags false/off; runtime npm and production-WASM vulnerability audits required |
| `docs/architecture/README.md` | `10f3ceb401972e53bd4f90b13e3dcef758f93a0b4f0d5a609f20f36d0868fe45` | Independent web/Worker and playback-v2 gates default false |
| `protocol/paid-media-livepeer-v1/README.md` | `d4f3157a61f2713a4afae4548042c966342481afa0383e686b1f8451a7ef74ed` | Runtime disabled; stateless playback v2 transition specified |

### GitHub release variables

- `DEPLOY_PREVIEW_ENABLED=false`.
- Preview: web Livepeer=false, Worker Bridge=false, native-NEAR=false,
  multi-asset=off, network=testnet.
- Production-named variables: web Livepeer=false, Worker Bridge=false,
  native-NEAR=false, multi-asset=off, network=testnet.
- Repository-scope secret-name query returned an empty list. Organization or
  environment secret stores were not proven or copied.
- `Preview` environment secret names are `CLOUDFLARE_API_TOKEN`,
  `NEAR_RPC_URL` and `ONECLICK_API_KEY`; `Production` exposes only the
  `ONECLICK_API_KEY` name. Values were not read. Both environments restrict
  deployment to protected branches; no reviewer/wait rule was returned by the
  read-only environment query.

### Cloudflare and public endpoints

- Preview Worker current deployment `30466205` sends 100% traffic to version
  `1e5ac4a9-c35e-4a3a-9819-33ddc1a4d86b`.
- That version has `LIVEPEER_BRIDGE_ENABLED=false`, native-NEAR=false,
  multi-asset=off, empty creator allowlist/operation reservation and only the
  secret binding names `NEAR_RPC_URL` and `ONECLICK_API_KEY` in the read-only
  metadata.
- `https://bridge-preview.youtick.net/__health` returned HTTP 200 with version
  `1e5ac4a9`, `stage=DISABLED`, `providerMutationEnabled=false`,
  `controlPlaneReady=false` and `playbackReady=false`.
- Candidate version `c81a0dfa` is tagged with source SHA `4fed6b4` but is not
  receiving traffic; the serving bootstrap version is a rollback target.
- Preview Web deployment `f034b03f` sends 100% traffic to bootstrap version
  `16ee8963`, tagged with source SHA `360c4312`. Candidate Web version
  `2f525cbc` is tagged with `4fed6b4` but is not receiving traffic. The serving
  and candidate script etags differ, so HTTP 200 is not exact-current-SHA proof.
- Baseline CI run `31280577835` passed for `4fed6b4`, but component jobs were
  path-filtered and only release-tooling tests ran in CI Gate. Deploy Preview
  run `31280599346` then failed browser smoke because the versioned Cloudflare
  Insights beacon URL did not match the path-specific CSP entry; rollback to
  the two bootstrap versions succeeded.
- `https://preview.youtick.net/` returned HTTP 200. Its CSP still contains
  `script-src 'unsafe-inline'`, matching the AUTH-002 gap.
- The local source now permits the Cloudflare Insights origin instead of one
  non-matching beacon path. This is `LOCAL_TEST` only and is not deployed;
  removing `unsafe-inline` still requires the ADR-002 nonce/hash design.
- The production Worker name `youtick-livepeer-bridge` returned Cloudflare
  error `10007` (not found). `bridge.youtick.net` and `app.youtick.net` did not
  resolve. This is absence of a production target, not proof of a production
deployment.

### Testnet contract snapshot

Final read-only queries at block heights `263045915–263045916` observed:

| Contract | Account | Code hash | Storage bytes | Current public state |
|---|---|---|---:|---|
| Market | `ytlp-pv-market-32a01cc.testnet` | `7FWe8hQm2jDUzjwhPwFAcGu8nQ6ejuXSFSDJxvaKB75d` | 262428 | publications=0; platform USDC=0; platform NEAR=0; quote-key version=1 |
| Access | `ytlp-pv-access-32a01cc.testnet` | `Ad4PtqtR1Gnf2Du6yjLzNCrJxdbNZ7QpZNK3pvrgtzWR` | 191711 | Account and code present; owner/market/pause getters are absent |

The market's public `get_usdc_contract_id` value matches the Preview release
variable. Existing local WASM artifacts hash to the same two on-chain code
hashes:

- market artifact: 261731 bytes, SHA-256
  `5cddc46668a675ce797650e0dfa5f1dea72110ef820a2bc0167450a54fbaa3f4`;
- access artifact: 191198 bytes, SHA-256
  `8ef5ee0d1d8581638793eac2c9d6120c2d5d0088fbc0370791634a20b226bd76`.

This proves artifact-to-testnet code parity, not reproducible build provenance
or current-source deployment. The installed `cargo-near` is 0.18.0 while the
required version is 0.17.0, so no non-compliant rebuild was used as evidence.
Bridge/takedown/access owner state remains `UNPROVEN` because the current ABI
has no authority getters; raw Borsh state was not guessed or decoded.

### Fresh v2 closed testnet pair

The accepted fresh-state pilot pair was deployed without changing any
Preview/Production contract variable or runtime gate:

| Contract | Account | Local/on-chain SHA-256 | Balance/storage at block 263118694 | Read state |
|---|---|---|---|---|
| Market v2 | `lp-arch-market-v2-260809.youtick-dev-v3.testnet` | `1e355484d68cf9bea4bc9f4bace257411db0c7e80385bd61513c4dbed5932cfc` | 4.4979695572354603 NEAR / 288.0 KB | version 2; admin/guardian distinct; original bridge active; unfrozen; no pending rotation |
| Access v2 | `lp-arch-access-v2-260809.youtick-dev-v3.testnet` | `4cda2b77cee5b9d670805de3b62e05688ac1f4439d6ac487212d2711b99baf80` | 2.9984290129394735 NEAR / 204.9 KB | version 2; approved admin owner; fresh Market bound; unpaused; issuance enabled |

The old disabled pair funded the fresh deployment but was not overwritten:
its code hashes and contract state remained unchanged, with 5.4964095717479457
NEAR on the old Market and 6.9983872288491924 NEAR on the old Access after
funding. The funding account retained 0.757614068681722899999998 NEAR.

The testnet quote public key has SHA-256
`c7fad2f945dafa9305f0b48ceac4432e1e8a9fe1d8742672ce629c84d9059c0a`;
its PKCS8 private key remains outside the repository in a mode-0600 file and
is not installed as a Worker secret. The active bridge has a separate finite
function-call key, `ed25519:5HZnNtPKc6cVBTTvwtHacxQQJrU2uPQPEkGKkJyALFXc`,
with 0.02 NEAR initial allowance, the fresh Market as its only receiver and
only `finalize_livepeer_publication`/`suspend_livepeer_sales` methods.

The governance drill emitted freeze/propose/rotate/unfreeze events, preserved
freeze across rotation, proved old/new bridge authority boundaries and restored
the original bridge unfrozen with no pending rotation. The Access drill used
one non-persisted session key, verified one resource-bound grant, revoked it and
bounded-cleaned it; final grant reads returned `null` and `[]`.

This is a sanitized configuration snapshot, not a full backup of secrets,
Durable Object contents, contract state or provider state. Those remain
`EXTERNAL_EVIDENCE_REQUIRED` and require environment-specific approval if a
backup operation can mutate or expose protected data.

## Telemetry and structured-log gap

### Present

- JSON error events through `formatLog(event, details)`.
- Recursive redaction for keys matching token/signature/secret/key/authorization
  and TUS/upload URLs.
- Safe error-code allowlist; raw upstream errors are not returned.
- `/__health` exposes version and closed readiness flags.
- Real Cloudflare requests emit `edge_request_completed` with request ID,
  environment, release version, path-only route, method, HTTP code and latency.
- All direct NEAR RPC and Livepeer API/TUS/media fetches emit
  `dependency_request_completed` with only dependency, bounded operation,
  HTTP code and latency. URLs, request bodies and credentials are not logged.
- Upload job persistence emits `state_transition` only after a successful
  state write, with bounded from/to states and no job/provider identifiers.
- Selected admission rejection fields: status, active reservations and daily
  attempts.

### Missing before the Phase 0 metric gate can pass

| Required signal | Current status | Minimum next artifact |
|---|---|---|
| Request count and route/error status | PARTIAL | Completion events exist; platform aggregation/dashboard is unproven |
| p50/p95/p99 latency | PARTIAL | Per-request latency exists and `observability/slo-policy.json` locks the five report-defined pilot thresholds to source events; histogram aggregation, dashboard and runtime results are unproven |
| NEAR RPC count/latency/finality lag | PARTIAL | Per-call operation/status/latency events exist; a read-only bounded probe computes final-to-optimistic lag outside hot paths. Approved lag threshold, deployed schedule/aggregation and delivery are unproven |
| Provider call count/latency/429/5xx | PARTIAL | Livepeer API/TUS/media operation/status/latency events exist; deployed aggregation/dashboard is unproven |
| DO read/write/storage bytes and active objects | PARTIAL | Shared source rejects record 257 while preserving existing-key replay at the accepted 256-record ceiling; Cloudflare metric query/dashboard and state-kind tags remain missing |
| State transition count | PARTIAL | UploadJob transition events exist; deployed aggregation and admission/operator/reconcile transition coverage remain unproven |
| Queue depth/webhook lag | MISSING | Source handler exists; no Queue binding, traffic or dashboard exists |
| Contract storage/reserve runway | PARTIAL | Market `get_storage_reserve_status` shares the withdrawal guard calculation and exposes usage, stake, configured reserve, balance, headroom/runway and coverage locally; deployed polling/dashboard/alert delivery are unproven |
| Artifact size/cold start/release SHA | PARTIAL | Exact-SHA release manifest records and verifies byte counts for both Web bundles, Bridge bundle, configs and lockfiles; current-branch artifact output and cold-start runtime metric are absent |

Proposed base log fields are the report's allowlist: `request_id`, `trace_id`,
`environment`, `release_sha`, `route`, hashed account/provider identifiers,
job/publication IDs, state transition, safe error code, latency, RPC/provider
call counts and cache result. Tokens, signatures, TUS URLs, private/API keys and
raw authorization headers remain forbidden.

## Phase 0 acceptance summary

- PASS: state inventory; repository/config/runtime gate evidence.
- PARTIAL: threat review; role ownership; sanitized config snapshot.
- PARTIAL: request and dependency metrics/structured logging; state, Queue,
  contract-storage, cold-start metrics and dashboards remain missing.
- PASS: pilot ADR decisions, bounded parameters and role accounts.
- NEEDS_APPROVAL: named reviewers, protected configuration backup, deployed
  metric/dashboard evidence and mainnet financial confirmation. Mainnet
  governance and migration architecture are accepted but not implemented,
  audited or activated.

Phase 1 local source now includes Market v2 governance, bounded Access v2,
bounded RPC routes, nonce CSP and secure browser-authority revocation. The
fresh closed testnet governance/grant drills passed. Remaining Phase 0/1
closure evidence is current-branch CI, deployed browser/wallet smoke,
owner/security review, protected configuration backup and deployed base
metrics. Runtime and economic behavior remain closed.
