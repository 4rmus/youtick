# Current state

> Reconciled on 2026-08-28 from PR #147 base `main`
> [`ca72a8029bb3ba56c50db14297499417a05a28ca`](https://github.com/4rmus/youtick/commit/ca72a8029bb3ba56c50db14297499417a05a28ca)
> through the PR #147 candidate changeset, and separately against the currently
> served Preview runtime. The final PR head, merge SHA and post-merge `main`
> evidence are outside this snapshot.
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
| Application source | `PASS_FIXED_FEE / SAFE_UPDATE_PROPOSED` | `ca72a802...` contains merged PRs #140-146. PR #146 reconciles one fixed `100_000` micro-USDC sponsor fee. The PR #147 candidate proposes reusing the existing testnet Market/Access pair, extending the existing pause to new creator jobs and adding a manual protected code-update lane. Required checks must pass on its final head before merge; retained deploy provenance remains a post-merge `push/main` CI responsibility and sponsor flags remain default-off. |
| CI | `PASS` | [Run 33113271994](https://github.com/4rmus/youtick/actions/runs/33113271994) passed dependency audits, both CodeQL languages, Web, Bridge, contracts, protocol and CI Gate for exact `ca72a802...`. |
| Preview | `PASS_CLOSED / EXACT_SOURCE_NOT_DEPLOYED` | [Deploy run 33076391705, attempt 2](https://github.com/4rmus/youtick/actions/runs/33076391705/attempts/2) promoted the then-current `f745bc0...` closed packet and recorded deployment `6126728124` as successful. Exact-main [run 33114081379](https://github.com/4rmus/youtick/actions/runs/33114081379) was fully skipped with `DEPLOY_PREVIEW_ENABLED=false`, so it built no release artifact and deployed nothing. |
| Production | `LEGACY_ONLY / NEW_STACK_CLOSED` | `youtick.net` still serves the unchanged `youtick-web4` origin. The modern app and Bridge Production endpoints are absent. |

The protected Preview release promoted these exact versions to 100% traffic:

- Web: `530ffca0-ff75-465d-8260-be2dab0c1384`;
- Bridge: `8d4c26a0-309b-43e5-b35a-48cc9420ebf2`;
- dark read model: `5a5948d1-a443-4e3b-8b06-5c4d48950b98`.

Fresh Bridge health returned version `8d4c26a0-309b-43e5-b35a-48cc9420ebf2`
and `stage=DISABLED`. New upload, provider/operator mutation, playback, Queue,
both archive paths, sponsored quote and sponsor relay readiness were all
`false`. `DEPLOY_PREVIEW_ENABLED` and
`PREVIEW_MULTI_CREATOR_UPLOAD_CANARY_ENABLED` are both `false`.

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
| [#145](https://github.com/4rmus/youtick/pull/145) | `dd0ebd3...` | Reconcile the current-state snapshot | Documentation only; Preview deploy skipped |
| [#146](https://github.com/4rmus/youtick/pull/146) | `ca72a80...` | Fix the sponsor fee at `0.10 USDC` | Source and CI pass; exact source not Preview-deployed, sponsor flags closed |

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

- The sponsor product decision is now reconciled in exact `main`: Web, Bridge,
  contract, protocol and tests require a fixed `0.10 USDC` added to the upload
  fee and accrued in platform balance. Exact-main CI passes.
- This is `SOURCE` + `CI` evidence only. The current fixed-fee Market source is
  recorded as `CODE_ONLY / RUNTIME_DISABLED / CURRENT_SOURCE_NOT_DEPLOYED`;
  exact source was not deployed to Preview, sponsor quote/relay flags remain
  false and no fixed-fee live payment is proven.
- The safe-update changeset preserves the current testnet Market and Access IDs
  and Borsh state. While the global pause is true, new plain-USDC, sponsored-USDC
  and native-NEAR creator jobs are closed; exact replay and recovery remain
  available. PR CI verifies the exact Market WASM/ABI build but does not retain
  a deploy artifact. Only post-merge same-repository `push/main` CI can retain
  and attest that artifact; the protected update workflow is manual and has not
  run.
- The real two-creator payment, Bridge admission, concurrent TUS upload, provider
  and publication flow remains unproven.
- UploadJob deletion remains blocked until its D1 archive commit is proven and
  legacy playback no longer depends on the job.
- Full read-model rebuild and four-hour RTO remain deliberately deferred beyond v1.
- Production/mainnet capability remains unproven.

## Next product gate

`SPONSOR_FIXED_FEE_EXISTING_TESTNET_MARKET_CODE_UPDATE_APPROVAL_REQUIRED`

After this changeset is canonical on `main`, refresh the read-only Market state
hash and explicitly approve only the existing testnet Market code update from
the retained exact-main CI artifact. The update must preserve the paused raw
state byte-for-byte and perform no init, migration, Access change, funding,
secret/config/flag change, sponsor activation, payment, relay, provider,
D1/Queue, Cloudflare or Production mutation. Closed Preview deployment and
sponsor activation remain separate later gates.
