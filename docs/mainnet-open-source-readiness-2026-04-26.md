# YouTick Mainnet and Open Source Readiness Report

> Date: 2026-04-26  
> Scope: live mainnet state, source code, KMS workers, runbooks, roadmap and open source release readiness  
> Current recommendation: publish as **public alpha**, not as production-ready or fully decentralized mainnet software

---

## Short Conclusion

YouTick is close to a credible public alpha. The source code has a serious
architecture: browser-side encryption, NEAR-based entitlements, an access
contract, an operator registry and share-based KMS custody.
The current decentralization posture is hybrid: NEAR and encrypted IPFS storage
carry core state and media delivery, while KMS operators still run on
Cloudflare Workers with KV-backed share storage.

The live mainnet KMS/operator layer is now aligned with the source-level design:

- `registry.youtick.near` returns five active decryption operators.
- The registry threshold config is `5 / 3`.
- Timelock proposals `1..6` were reviewed and executed.
- Five KMS worker endpoints return `200` / `ok: true`.
- The workers were redeployed from the current source after registry activation,
  and `/health` now matches the current source behavior.

So the right wording is:

> YouTick is source-ready for public alpha and the live mainnet KMS/operator
> layer is active. Do not call it production-ready until end-to-end encrypted
> upload, purchase and playback are verified on mainnet.

---

## Verified Live State

These checks were run against NEAR mainnet and public KMS worker health
endpoints on 2026-04-26.

| Check | Result | Meaning |
|---|---|---|
| `registry.youtick.near.list_decryption_operators` | 5 active records | KMS operator registry is active. |
| `registry.youtick.near.get_threshold_config` | `{ total_operators: 5, required_shares: 3 }` | Target threshold is configured. |
| `registry.youtick.near.get_timelock(1..6)` | `null` | Operator / relayer proposals were executed. |
| KMS A-E `/health` | `200`, `ok: true` | Workers are reachable and ready. |
| KMS A-E `/health` shape | current source shape | Workers were redeployed from current source. |
| `youtick.near.nft_total_supply` | `"0"` | Current enumerable NFT supply is zero. |
| `youtick.near.get_events_count` | `0` | No active event count is visible. |
| `youtick.near.get_trial_pool_balance` | `"0"` | Trial/free sponsor flows are not funded. |

The KMS worker result is important: the system-level KMS layer is now active.
The remaining launch-critical check is a live encrypted upload / purchase /
watch smoke test.

---

## Source Code State

### KMS

The code path is good and should be kept:

- The web app reads active decryption operators from the registry.
- The browser splits the AES key into Shamir shares.
- One share is sent to each active operator.
- Playback retrieves shares in parallel and reconstructs the key after the
  threshold is met.
- Workers refuse mainnet readiness when required secrets or registry identity
  are missing.
- Worker `/health` checks RPC, KV and registry operator authority.

Current gap:

- Live 3-of-5 share storage and reconstruction still needs to be verified
  through an end-to-end encrypted upload / purchase / watch smoke test.

### Contracts

The contract direction is correct:

- Registry and access sensitive admin actions are forced through
  `propose_action` and `execute_action`.
- NFT market V1 admin actions remain owner-only for public alpha.
- Registry/access direct admin wrappers intentionally panic.
- `operator-registry` validates threshold config against actual registered
  operators.
- `nft-ticket` migration reset is gated behind test/migration builds.

Current gap:

- Keep new deploy helpers aligned with the split posture: NFT owner-only V1
  admin, registry/access timelock admin.

### Web App

The app builds and tests locally. Cross-chain checkout is still experimental and
should stay off by default for mainnet launch messaging unless separately
reviewed.

Current deploy state:

- A fresh Web4 static build was uploaded to IPFS:
  `ipfs://bafybeiepp3qv635pidmh7yvckwa22ogv6oc22f6nziaj55mu2n7rejpzee`.
- The uploaded root and `/watch/` route returned `200` through `ipfs.io`.
- Web4 URL update proposal `0` exists on `youtick.near` and must wait 24 hours
  before execution.

One local hygiene note:

- Local `.env.local` still had an old `NEXT_PUBLIC_KMS_URL` value. The current
  KMS client does not rely on that path, but old env values should be removed
  from deployment environments to avoid confusion.

---

## Test Results

Latest local verification:

| Area | Command | Result |
|---|---|---|
| Web tests | `npm test -- --run` in `apps/web` | 22 files, 178 tests passed |
| Web lint | `npm run lint` in `apps/web` | 0 errors, 17 warnings |
| Web build | `npm run build` in `apps/web` | passed |
| KMS worker | `npm test -- --run` in `workers/youtick-kms` | 3 files, 40 tests passed |
| KMS type check | `npm run check` in `workers/youtick-kms` | passed |
| NFT contract | `cargo test --lib` in `contracts/nft-ticket` | 28 tests passed |
| Access contract | `cargo test` in `contracts/access-control` | 8 tests passed, 2 warnings |
| Registry contract | `cargo test` in `contracts/operator-registry` | 4 tests passed |

Missing verification before real creator launch:

- live `upload -> purchase -> watch` smoke test,
- live 3-of-5 share reconstruction test,
- trial/free flow behavior when `trial_pool` is zero.

---

## Documentation and Runbook Consistency

This report is now the current source of truth for release posture. Older
documents should be read with the labels below:

| Document | Status | Required handling |
|---|---|---|
| `docs/mainnet-open-source-readiness-2026-04-26.md` | current | Use for launch decision. |
| `docs/operations/known-issues.md` | current risk log | Keep updated after deployment. |
| `docs/operations/mainnet-deploy-runbook.md` | current runbook | NFT owner-only V1 admin; registry/access timelock. |
| `docs/release-runbook.md` | current short release checklist | Keep admin posture split by contract. |
| historical analysis and planning reports | removed | Do not treat old analysis drafts as live operational truth. |

Fixed consistency rules:

- Do not say “production-ready” until live mainnet checks pass.
- Do not say “fully decentralized” until KMS/operator hosting, persistence
  redundancy and governance are no longer owner/operator centralized.
- “KMS active” now means registry has five active operators and all five worker
  health checks are green. End-to-end playback still needs its own smoke test.
- Keep NFT owner-only V1 admin separate from registry/access timelock admin.
- Keep “resolved in source” separate from “deployed and verified on mainnet”.
- Do not describe any clean mainnet reset as complete unless the reset
  transaction was explicitly executed and recorded.
- Use testnet/local defaults for contributor onboarding where possible; use
  mainnet only for deliberate public-alpha validation.

---

## Launch Gate

Before accepting real paid encrypted creator content, all items below should be
true:

- [x] `registry.youtick.near.list_decryption_operators` returns five active records.
- [x] `registry.youtick.near.get_threshold_config` returns `5 / 3`.
- [x] KMS A-E `/health` returns `200` and `ok: true`.
- [x] Live KMS health output matches current source behavior.
- [ ] Web app and all five KMS workers are deployed in the same compatibility window.
  Web4 build is uploaded; timelock proposal `0` still needs execution.
- [ ] One paid test video passes upload, KMS share storage, purchase and playback.
- [ ] `known-issues.md` is updated after deployment.
- [x] Root `LICENSE` exists.
- [x] Security reporting channel is final.
- [x] README says public alpha, not production-ready.

---

## Recommended Next Actions

1. Execute Web4 URL timelock proposal `0` on `youtick.near` after the 24-hour
   delay passes.
2. Run one live encrypted upload / purchase / watch smoke test.
3. Verify live 3-of-5 KMS share reconstruction during playback.
4. Decide whether trial/free flows should be funded or disabled while
   `trial_pool` is zero.
5. Update `known-issues.md` from “pending deployment” to verified statuses only
   after mainnet checks pass.
6. Keep the public wording conservative: “public alpha”.

---

## Final Position

The project is not blocked by lack of product vision. The mainnet KMS/operator
layer is now active, but release discipline still matters: deploy the matching
web app, run the live encrypted smoke test, keep known issues current and keep
public wording honest. Until that is done, YouTick should remain a public alpha.
