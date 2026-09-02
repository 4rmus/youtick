# Current state

> Reconciled on 2026-09-02 against exact `main`
> [`292f7b8d917540e3453fc61f4aa9c6fae304baa6`](https://github.com/4rmus/youtick/commit/292f7b8d917540e3453fc61f4aa9c6fae304baa6),
> exact-main CI, protected Preview receipts and fresh finality reads.
> This snapshot separates source, CI, Preview, provider and Production evidence.
> It does not authorize a deployment, feature activation or external mutation.

This is the short operational snapshot. The phased target remains the external
architecture plan, while [`transformation-progress.md`](transformation-progress.md)
retains the append-only checkpoint history through Checkpoint 186. Dated
"next gate" text in either historical document is not current work selection.

## Product and authority

- NEAR owns job, payment, publication, settlement and entitlement truth.
- Livepeer owns media ingest, processing, storage and HLS delivery.
- The Bridge owns control and authorization; source video does not pass through it.
- D1 is a rebuildable Discover/Profile read model, never financial authority.

## Evidence order

Use this order when facts disagree:

1. exact GitHub `main`;
2. fresh environment and finality evidence;
3. this dated snapshot;
4. the append-only checkpoint history;
5. the target phase plan and older design documents.

`LOCAL_STATIC`, `LOCAL_TEST`, `CI`, `PROVIDER`, `PREVIEW`, `PRODUCTION`,
`EXTERNAL_NOT_RUN` and `UNPROVEN` are independent evidence classes. A passing
source or CI result does not prove deployment, and a Preview result does not
prove Production or mainnet behavior.

## Current evidence

| Subject | Class | Status | Evidence |
|---|---|---|---|
| Application source | `LOCAL_STATIC` | `PASS` | Exact `main` is `292f7b8d...` with tree `0cdd4a54...`. PRs #161-171 contain the bounded sponsor recovery and playback-v2 release work. PR #170 makes a paused or unreadable Market fail before wallet submission and keeps v2 purchase to one USDC transaction; PR #171 bounds the same-candidate release retry used by protected reclose. All release flags remain default-off. |
| CI | `CI` | `PASS` | [Main run 33623661479](https://github.com/4rmus/youtick/actions/runs/33623661479) passed for exact `292f7b8d...`. |
| Sponsored paid-job recovery | `PREVIEW / PROVIDER` | `PASS_BOUNDED` | Exact source `6a623454...` used [Deploy Preview run 33490967180](https://github.com/4rmus/youtick/actions/runs/33490967180): attempt 2 opened only the sponsor recovery packet and attempt 3 reclosed it. One canary run completed the existing job `Authorized -> Published`, added exactly one publication, created no payment/job/key, left creator and platform balances unchanged and deleted the recovery file only after success. Provider creation was bounded to `0 or 1`; an independent provider inventory count is `UNPROVEN`. |
| Guided buyer purchase | `PREVIEW` | `PASS_TESTNET` | Real-wallet buyer `lp-p3-creator-b-250825.youtick-dev-v3.testnet` selected publication `lp-85ef5b7e-c6a0-4e9b-8f58-a5f41ba1fbdd` through Discover and bought one ticket for exact `2,000,000` micro-USDC in [`HtCaLHz...`](https://testnet.nearblocks.io/txns/HtCaLHzfzC7zpSVJMSXhBH1gXPL2UxgDPRYvmgme1uaq). Buyer changed `19,400,000 -> 17,400,000`, Market USDC `3,740,000 -> 5,740,000`, creator liability `1,960,000 -> 3,920,000` and platform liability `1,780,000 -> 1,820,000`. Exactly one entitlement and purchase event were added; publication count stayed at three. |
| Playback v2 | `PREVIEW` | `PASS` | [Deploy Preview run 33609515929, attempt 2](https://github.com/4rmus/youtick/actions/runs/33609515929/attempts/2) opened only playback-v2 at exact `1d1c3647...`, with canonical NEAR Discover fallback enabled. Creator-B used one wallet `signMessage`; the selected video rendered and advanced to `0:09 / 0:10`. No FunctionCall key, browser grant or persistent token write was added. |
| Wallet and purchase safety | `PREVIEW / CI` | `PASS_WITH_WARNINGS` | The first guided attempt in [`E6L18ySn...`](https://testnet.nearblocks.io/txns/E6L18ySngMVdsF63izdqFKNJgoLadVgVD7enEwDKzppL) reached a paused Market, fully refunded the `2 USDC` and created no entitlement. The exact legacy scoped key from that attempt was later deleted once in [`5Kw5Qhr...`](https://testnet.nearblocks.io/txns/5Kw5QhrWYXMcKpjNECsFEhKBrasUpMenjLTLqWAtNxHh); Creator-B now has one FullAccess key and zero grants. PR #170 prevents the paused-Market wallet submission and removes legacy AddKey behavior from v2 purchases. |
| Market safety | `PREVIEW` | `PASS_PAUSED` | Admin unpaused once in [`H1NW8gPo...`](https://testnet.nearblocks.io/txns/H1NW8gPoXenUwZTThqtixREvYPUteA6mZWBg1daDkNQh), Creator-B purchased once in [`HtCaLHz...`](https://testnet.nearblocks.io/txns/HtCaLHzfzC7zpSVJMSXhBH1gXPL2UxgDPRYvmgme1uaq), and guardian paused in [`DrPjtW2Q...`](https://testnet.nearblocks.io/txns/DrPjtW2QV64GYYxJjZMj8NRPR9td5GvDc9ximvdVm842). Fresh finality reads show `new_purchases_paused=true`, Creator-B entitlement true, the publication active at `2,000,000` and final balances unchanged. |
| Final Preview | `PREVIEW` | `PASS_CLOSED` | [Deploy Preview run 33624730436, attempt 2](https://github.com/4rmus/youtick/actions/runs/33624730436/attempts/2) reclosed exact `292f7b8d...`. Bridge health is `stage=DISABLED`; upload, provider/operator mutation, sponsor quote/relay, playback, Queue and archive readiness are all false. Deploy and all canary repository gates are false. |
| Production | `PRODUCTION / UNPROVEN` | `LEGACY_ONLY / NEW_STACK_CLOSED` | The protected releases did not deploy Production. `youtick.net` retained body SHA-256 `a62de757f70aea8d5cb752b12ac50c30435ac8a6e7661cb817562b206c95e065` and the `youtick-web4` origin. Production feature variables remain false. `bridge.youtick.net` did not resolve, so direct Production Bridge health is `UNPROVEN`. |

## Exact Preview receipts

| Window | Source and run | Serving result |
|---|---|---|
| Sponsor recovery reclose | `6a623454...`; [run 33490967180, attempt 3](https://github.com/4rmus/youtick/actions/runs/33490967180/attempts/3) | Web `7b262579-7474-49c2-9137-97ab96af7fd3`; Bridge `cb7fedea-e9e4-40dc-b25b-e62fda762e44`; read model `298f092d-f3ef-45c3-a75d-4842bf950527`; `DISABLED`. |
| Guided UAT playback-only open | `1d1c3647...`; [run 33609515929, attempt 2](https://github.com/4rmus/youtick/actions/runs/33609515929/attempts/2) | Web `1774bb2c-4b6e-42ba-a3e6-5a9fbf1044cc`; Bridge `8ed0a3bf-adc2-4cd4-a2e0-739955343af1`; read model `97431fea-ea66-498c-8921-ee8fea359902`; playback-only `ENABLED`. |
| Final closed Preview | `292f7b8d...`; [run 33624730436, attempt 2](https://github.com/4rmus/youtick/actions/runs/33624730436/attempts/2) | Web `98accbab-0e5a-420a-81e9-6c7c6f3937da`; Bridge `7bcb5c3d-c0ff-4392-9950-f02d52c0cc39`; read model `eee8ca37-1f66-496a-adf9-19b057af1e19`; `DISABLED`. |

The first guided-UAT reclose, [run 33609515929 attempt 3](https://github.com/4rmus/youtick/actions/runs/33609515929/attempts/3),
stopped before promotion when release smoke observed a transient `403` instead
of the expected closed response. It left the closed candidate at 0% and did not
change stable traffic. PR #171 added only a bounded same-candidate propagation
retry; the later exact-main receipt and fresh health close that incident without
treating the failed run as deployment evidence.

## Recent source sequence

| PR | Main commit | Purpose | Runtime meaning |
|---|---|---|---|
| [#161](https://github.com/4rmus/youtick/pull/161) | `5b61f0f...` | Align sponsor recovery release policy | Source safety; default-off |
| [#162](https://github.com/4rmus/youtick/pull/162) | `5a26be3...` | Allow protected same-SHA Preview reclose | Release safety |
| [#163](https://github.com/4rmus/youtick/pull/163) | `20be6e5...` | Scope recovery to the exact job | Source safety |
| [#164](https://github.com/4rmus/youtick/pull/164) | `af14bd4...` | Add bounded second-key exception | One approved testnet exception completed |
| [#165](https://github.com/4rmus/youtick/pull/165) | `2b82bb6...` | Use Node `Buffer` at the TUS boundary | Recovery adapter fix |
| [#166](https://github.com/4rmus/youtick/pull/166) | `6a62345...` | Keep `File` for fingerprint and `Buffer` for TUS | Recovery runtime completed |
| [#167](https://github.com/4rmus/youtick/pull/167) | `e4f0abc...` | Add default-off playback-v2 Preview gate | Buyer pilot completed |
| [#168](https://github.com/4rmus/youtick/pull/168) | `338432e...` | Recognize playback-only stable baseline during reclose | Final Preview reclose completed |
| [#169](https://github.com/4rmus/youtick/pull/169) | `687ecee...` | Reconcile the technical V1 pilot snapshot | Documentation only |
| [#170](https://github.com/4rmus/youtick/pull/170) | `1d1c364...` | Guard playback-v2 ticket purchase submission | Guided real-wallet purchase completed |
| [#171](https://github.com/4rmus/youtick/pull/171) | `292f7b8...` | Bound candidate override propagation retries | Final Preview reclose completed |

## Phase summary

| Phase | Purpose | Current assessment |
|---|---|---|
| 0 | Boundaries and activation freeze | Mostly complete for the pilot; independent threat review and named owners remain open. |
| 1 | Wallet, contract and governance security | Strong local/testnet/CI evidence; mainnet governance and independent review remain open. |
| 2 | Stateless playback and bounded state | Technical and real-wallet single-buyer v2 playback are proven on Preview/testnet; retention cleanup and Production proof remain incomplete. |
| 3 | Resumable concurrent upload | Active. One existing paid job was recovered and published, but the full two-creator payment-to-publication concurrency flow remains a separate, optional gate and is not proven by this pilot. |
| 4 | Events, read model and finance | Two exact `2 USDC` purchases and splits are proven on testnet, including one Discover-to-watch guided UAT; continuous ingestion and mainnet accounting remain closed. |
| 5 | Scale, cost and operations | Partial; delivered alerts, load evidence and billed-cost reconciliation remain external. |
| 6 | Audit, resilience and mainnet | Not ready; external audit, drills, governance and gradual Production activation remain blocked. |

## Decisions and blockers

- The bounded V1 testnet slice now proves one sponsored paid-job recovery, two
  exact two-USDC purchases, permanent entitlements and v2 playback without
  persistent token writes. The normal-user Discover-to-watch UAT is accepted
  with non-blocking findings.
- All Preview mutation and canary gates are default-off and currently false.
  Market purchases are paused and final Preview health is fully closed.
- Two-creator concurrency is not implied by the single creator/buyer pilot. It
  remains a separate optional Phase 3 gate.
- Provider inventory cardinality, continuous read-model ingestion, UploadJob
  deletion, 90-day cleanup, full rebuild/RTO, Production/mainnet behavior and
  independent audit remain unproven or deliberately deferred.
- The remaining UAT findings are presentational or operational: the Pay control
  can appear active while Market is paused, playback-v2 still shows legacy-key
  copy, Meteor can emit non-blocking iframe/reporting console noise, and the
  guardian pause command must use a balance-safe gas ceiling. None produced an
  open P0/P1 issue; the guardian balance and gas ceiling must be rechecked before
  another paid runtime.
- No automatic product or runtime gate is open. Two-creator concurrency remains
  deferred until product need justifies its separate gate.
