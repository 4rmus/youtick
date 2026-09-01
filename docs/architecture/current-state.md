# Current state

> Reconciled on 2026-09-01 against exact `main`
> [`338432ef545c36dbd08fb4535721f3c22d51fa24`](https://github.com/4rmus/youtick/commit/338432ef545c36dbd08fb4535721f3c22d51fa24),
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
| Application source | `LOCAL_STATIC` | `PASS` | Exact `main` is `338432ef...` with tree `e36736bb...`. PRs #161-168 contain the bounded sponsor recovery, same-SHA reclose, exact-job safety, one-time second-key exception, Node upload adapters, playback-v2 Preview gate and playback-only baseline fix. All release flags remain default-off. |
| CI | `CI` | `PASS` | [PR run 33502837658](https://github.com/4rmus/youtick/actions/runs/33502837658) passed for PR #168 and [main run 33503963314](https://github.com/4rmus/youtick/actions/runs/33503963314) passed for exact `338432ef...`. |
| Sponsored paid-job recovery | `PREVIEW / PROVIDER` | `PASS_BOUNDED` | Exact source `6a623454...` used [Deploy Preview run 33490967180](https://github.com/4rmus/youtick/actions/runs/33490967180): attempt 2 opened only the sponsor recovery packet and attempt 3 reclosed it. One canary run completed the existing job `Authorized -> Published`, added exactly one publication, created no payment/job/key, left creator and platform balances unchanged and deleted the recovery file only after success. Provider creation was bounded to `0 or 1`; an independent provider inventory count is `UNPROVEN`. |
| Buyer purchase | `PREVIEW` | `PASS_TESTNET` | Buyer `lp-buyer-260803191501.youtick-dev-v3.testnet` bought publication `lp-85ef5b7e-c6a0-4e9b-8f58-a5f41ba1fbdd` once for exact `2,000,000` micro-USDC. Buyer changed `16,999,997 -> 14,999,997`, Market USDC `1,740,000 -> 3,740,000`, creator liability `0 -> 1,960,000` and platform liability `1,740,000 -> 1,780,000`. One entitlement and one purchase event were observed. |
| Playback v2 | `PREVIEW` | `PASS` | [Deploy Preview run 33496089969, attempt 2](https://github.com/4rmus/youtick/actions/runs/33496089969/attempts/2) opened the playback-only packet at `e4f0abc7...`. One wallet `signMessage` authorized four short-lived v2 token checks; Chrome and Edge initial/refreshed playback showed video frames. Anonymous, malformed, wrong-key, wrong-subject and expired tokens were denied. Buyer chain nonce stayed unchanged and browser persistent storage stayed empty. |
| Market safety | `PREVIEW` | `PASS_PAUSED` | Admin unpaused once in transaction [`DaxfNZq...`](https://testnet.nearblocks.io/txns/DaxfNZqXD7zkTJHw6Jq54ELoLYnJorksyhAFuYkEY8oU), buyer purchased once in [`965uDnno...`](https://testnet.nearblocks.io/txns/965uDnnoT1rDPU6GWV7deZHZdBK5dMVrVq7JLN2PLnmH), and guardian paused in [`DWaUE7L...`](https://testnet.nearblocks.io/txns/DWaUE7Lfq3Mvsc3KdhrogRZUgDeVri3tnmeVqSFsMaz8). Fresh finality reads still show `new_purchases_paused=true`, the publication active at `2,000,000`, entitlement true and all final balances unchanged. |
| Final Preview | `PREVIEW` | `PASS_CLOSED` | [Deploy Preview run 33504692680, attempt 2](https://github.com/4rmus/youtick/actions/runs/33504692680/attempts/2) reclosed exact `338432ef...`. Bridge health is `stage=DISABLED`; upload, provider/operator mutation, sponsor quote/relay, playback, Queue and archive readiness are all false. Deploy, playback, sponsor and multi-creator repository gates are false. |
| Production | `PRODUCTION / UNPROVEN` | `LEGACY_ONLY / NEW_STACK_CLOSED` | The protected releases did not deploy Production. `youtick.net` retained body SHA-256 `a62de757f70aea8d5cb752b12ac50c30435ac8a6e7661cb817562b206c95e065` and the `youtick-web4` origin. Production feature variables remain false. `bridge.youtick.net` did not resolve, so direct Production Bridge health is `UNPROVEN`. |

## Exact Preview receipts

| Window | Source and run | Serving result |
|---|---|---|
| Sponsor recovery reclose | `6a623454...`; [run 33490967180, attempt 3](https://github.com/4rmus/youtick/actions/runs/33490967180/attempts/3) | Web `7b262579-7474-49c2-9137-97ab96af7fd3`; Bridge `cb7fedea-e9e4-40dc-b25b-e62fda762e44`; read model `298f092d-f3ef-45c3-a75d-4842bf950527`; `DISABLED`. |
| Playback-only open | `e4f0abc7...`; [run 33496089969, attempt 2](https://github.com/4rmus/youtick/actions/runs/33496089969/attempts/2) | Web `8ce0587c-6a67-468f-8956-8d7d9b4042a2`; Bridge `ddcd1452-e7d6-4539-92c2-7ec010c61ee7`; read model `8f740285-4fe0-417c-8c00-1e7daee7fedd`; playback-only `ENABLED`. |
| Final closed Preview | `338432ef...`; [run 33504692680, attempt 2](https://github.com/4rmus/youtick/actions/runs/33504692680/attempts/2) | Web `f685d745-b074-4632-8552-cf1cc23e96dd`; Bridge `9e2d1391-5c41-4dde-883d-5af08c7c0647`; read model `2df41f19-864a-422c-ae8c-400be3993c8d`; `DISABLED`. |

The first playback reclose attempt, [run 33496089969 attempt 3](https://github.com/4rmus/youtick/actions/runs/33496089969/attempts/3),
failed at `release_smoke_bridge_policy_invalid`. It left the closed candidate at
0% and did not change traffic. PR #168 fixed only the playback-only legacy
baseline inference; the later exact-main receipt and fresh health close that
incident without treating the failed run as deployment evidence.

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

## Phase summary

| Phase | Purpose | Current assessment |
|---|---|---|
| 0 | Boundaries and activation freeze | Mostly complete for the pilot; independent threat review and named owners remain open. |
| 1 | Wallet, contract and governance security | Strong local/testnet/CI evidence; mainnet governance and independent review remain open. |
| 2 | Stateless playback and bounded state | Single-buyer v2 playback is proven on Preview/testnet; retention cleanup and Production proof remain incomplete. |
| 3 | Resumable concurrent upload | Active. One existing paid job was recovered and published, but the full two-creator payment-to-publication concurrency flow remains a separate, optional gate and is not proven by this pilot. |
| 4 | Events, read model and finance | One exact purchase and split are proven on testnet; continuous ingestion and mainnet accounting remain closed. |
| 5 | Scale, cost and operations | Partial; delivered alerts, load evidence and billed-cost reconciliation remain external. |
| 6 | Audit, resilience and mainnet | Not ready; external audit, drills, governance and gradual Production activation remain blocked. |

## Decisions and blockers

- The bounded V1 testnet slice now proves one sponsored paid-job recovery, one
  two-USDC purchase, permanent entitlement and v2 playback without persistent
  token writes.
- All Preview mutation and canary gates are default-off and currently false.
  Market purchases are paused and final Preview health is fully closed.
- Two-creator concurrency is not implied by the single creator/buyer pilot. It
  remains a separate optional Phase 3 gate.
- Provider inventory cardinality, continuous read-model ingestion, UploadJob
  deletion, 90-day cleanup, full rebuild/RTO, Production/mainnet behavior and
  independent audit remain unproven or deliberately deferred.
- No automatic product or runtime gate is open. `WORKSPACE_CONSOLIDATION` is
  the next planned item, but it is destructive maintenance and requires its
  own explicit approval.
