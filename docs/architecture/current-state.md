# Current state

> Reconciled on 2026-08-27 against exact GitHub
> [`main@f745bc0b624335cf82c9462da1ff3dc097e0bf9c`](https://github.com/4rmus/youtick/commit/f745bc0b624335cf82c9462da1ff3dc097e0bf9c).
> This snapshot separates source, CI, Preview and Production evidence. It does
> not authorize a deployment, feature activation or external mutation.

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
2. fresh environment evidence;
3. this dated snapshot;
4. the append-only checkpoint history;
5. the target phase plan and older design documents.

`LOCAL_STATIC`, `LOCAL_TEST`, `CI`, `PREVIEW` and `PRODUCTION` are independent
evidence classes. A passing source or CI result does not prove deployment.

## Current evidence

| Layer | Status | Evidence |
|---|---|---|
| Source | `PASS` | `main@f745bc0...` contains merged PRs #140-144. Sponsored uploads exist in source but remain default-off. |
| CI | `PASS` | [Run 33075562805](https://github.com/4rmus/youtick/actions/runs/33075562805) passed dependency audits, both CodeQL languages and CI Gate for exact `f745bc0...`; component jobs were path-filtered rather than rerun. |
| Preview | `PASS_CLOSED` | [Deploy run 33076391705, attempt 2](https://github.com/4rmus/youtick/actions/runs/33076391705/attempts/2) promoted the exact-main closed packet and recorded deployment `6126728124` as successful. |
| Production | `LEGACY_ONLY / NEW_STACK_CLOSED` | `youtick.net` still serves the unchanged `youtick-web4` origin. The modern app and Bridge Production endpoints are absent. |

The protected Preview release promoted these exact versions to 100% traffic:

- Web: `530ffca0-ff75-465d-8260-be2dab0c1384`;
- Bridge: `8d4c26a0-309b-43e5-b35a-48cc9420ebf2`;
- dark read model: `5a5948d1-a443-4e3b-8b06-5c4d48950b98`.

Fresh Bridge health returned `stage=DISABLED`. New upload, provider/operator
mutation, playback, Queue, both archive paths, sponsored quote and sponsor relay
readiness were all `false`. The deploy and multi-creator canary repository
variables were restored to `false`.

Preview publication reads remain independently enabled at
`read-preview.youtick.net`. The newly deployed dark read model keeps its API,
ingestion, backfill and continuation flags disabled, so this is not
continuous-ingestion or D1 write proof. The protected release also proved that
the Production root body and headers were unchanged.

## Recent source sequence

| PR | Main commit | Purpose | Runtime meaning |
|---|---|---|---|
| [#140](https://github.com/4rmus/youtick/pull/140) | `64626c6...` | Record the Phase 3 runner closure | Documentation only |
| [#141](https://github.com/4rmus/youtick/pull/141) | `7bdc88c...` | Recover guarded Preview candidates | Release safety source |
| [#142](https://github.com/4rmus/youtick/pull/142) | `6d372f4...` | Allow the enabled canary packet to be redeployed | Previously served Preview baseline |
| [#143](https://github.com/4rmus/youtick/pull/143) | `e8f75d8...` | Add NEAR-sponsored creator uploads | Present in the deployed Preview package; sponsor flags closed |
| [#144](https://github.com/4rmus/youtick/pull/144) | `f745bc0...` | Accept the legacy Bridge health shape during baseline inference | Enabled the successful exact-main reclose |

## Phase summary

| Phase | Purpose | Current assessment |
|---|---|---|
| 0 | Boundaries and activation freeze | Mostly complete for the pilot; independent threat review and named owners remain open. |
| 1 | Wallet, contract and governance security | Strong local/testnet/CI evidence; mainnet governance and independent review remain open. |
| 2 | Stateless playback and bounded state | Strong Preview/testnet evidence; retention cleanup and Production proof remain incomplete. |
| 3 | Resumable concurrent upload | Active phase. Source runner exists, but the full two-creator payment-to-publication E2E is unproven. |
| 4 | Events, read model and finance | Bounded testnet/Preview evidence exists; continuous ingestion and mainnet accounting remain closed. |
| 5 | Scale, cost and operations | Partial; delivered alerts, load evidence and billed-cost reconciliation remain external. |
| 6 | Audit, resilience and mainnet | Not ready; external audit, drills, governance and gradual Production activation remain blocked. |

## Decisions and blockers

- The sponsor product decision is a fixed `0.10 USDC` added to the upload fee
  and accrued in platform balance. Merged source currently calculates the sponsor
  fee dynamically from gas price and a NEAR/USD rate. Sponsored upload activation
  remains blocked until Bridge, contract, protocol and tests use one model.
- The real two-creator payment, Bridge admission, concurrent TUS upload, provider
  and publication flow remains unproven.
- UploadJob deletion remains blocked until its D1 archive commit is proven and
  legacy playback no longer depends on the job.
- Full read-model rebuild and four-hour RTO remain deliberately deferred beyond v1.
- Production/mainnet capability remains unproven.

## Next product gate

`SPONSOR_FIXED_FEE_SOURCE_RECONCILIATION_DECISION_REQUIRED`

After this snapshot becomes canonical on `main`, lock the smallest Bridge,
contract, protocol and test scope that replaces dynamic sponsor pricing with the
fixed `0.10 USDC` product decision. Do not implement, commit, activate flags or
deploy in that decision gate.
