---
title: Claim Register
status: live
area: claims
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/llm-wiki.md
  - docs/README.md
  - docs/overview.md
  - docs/architecture/storage.md
  - docs/launch-plan-2026-05.md
  - docs/release-runbook.md
  - docs/operations/known-issues.md
---

# Claim Register

Kritik iddialar burada tutulur. Para, security, launch, deploy veya canli sistem kararini etkileyen iddialarda kanit yolu ve drift riski mutlaka yazilir.

| Claim | Status | Evidence | Last checked | Risk |
|---|---|---|---|---|
| YouTick public alpha yazilimdir; production-ready diye anlatilmamalidir. | live | `docs/README.md`, `docs/release-runbook.md` | 2026-05-19 | copy drift |
| Dogru decentralization dili "hybrid decentralized"dir. | live | `docs/README.md`, `docs/architecture/README.md`, `docs/operations/known-issues.md` | 2026-05-19 | marketing drift |
| Media browser tarafinda AES-CTR ile sifrelenir. | live | `docs/overview.md`, `docs/architecture/storage.md`, `apps/web/lib/kms/encryption.ts` | 2026-05-19 | code drift |
| Lighthouse aktif birincil write path'tir; Crust legacy compatibility ve diagnostik/fallback yuzeyidir. | live | `docs/architecture/storage.md`, `docs/frontend.md`, `apps/web/lib/storage/**`, `apps/web/lib/crust/**` | 2026-05-19 | provider drift |
| Playback 3-of-5 KMS share threshold kullanir. | live | `docs/architecture/storage.md`, `docs/frontend.md`; 2026-05-19 mainnet registry read-only check: `required_shares=3`, `total_operators=5` | 2026-05-19 | runtime drift |
| Ticket ownership ve entitlement source of truth NEAR tarafidir. | live | `docs/overview.md`, `docs/architecture/smart-contract.md`, `contracts/nft-ticket/src/**` | 2026-05-19 | code drift |
| Playback sirasinda normal hedef wallet popup acmamaktir; signless access key + Play grant kullanilir. | live | `docs/architecture/session-keys.md`, `docs/architecture/wallet-integration.md` | 2026-05-19 | UX regression |
| Full upload-buy-watch smoke public alpha icin acik GO/NO-GO gate'tir; son kayitlarda full browser smoke NOT RUN. | live | `docs/launch-plan-2026-05.md`, `docs/release-runbook.md`, `docs/llm-wiki/log.md`, `docs/llm-wiki/operations/live-health-gates.md` | 2026-05-19 | live drift |
| Storage API `/uploads/intent` auth gerektirir. | live | 2026-05-19 live check: `provider-health` ready; auth'suz `POST /uploads/intent` -> `Unauthorized` | 2026-05-19 | endpoint drift |
| Current mainnet `youtick.near` code hash is `HA3i8Se8Mrsd14Ye2qYvwehRgP9Phrd76psgyy9Y1bCF`. | live | Live RPC returned `HA3i8Se8Mrsd14Ye2qYvwehRgP9Phrd76psgyy9Y1bCF`; latest deploy block `198989245`, tx `3iFMyZZszb1aHpvZfY1FM4V56SvhbpDxdy4s3aZ1EaMB`; R2 `BXbii...` and hotfix `7WB9...` are historical | 2026-05-19 | runtime drift |
| Repo current source build and working-tree WASM artefact match live `youtick.near`. | live | current source build and `contracts/nft-ticket/res/youtick_nft_opt.wasm` both return `HA3i8Se8Mrsd14Ye2qYvwehRgP9Phrd76psgyy9Y1bCF`; HEAD artefact was older before local build refresh | 2026-05-19 | artefact hygiene |
| Access-control timelock current alpha gate icin deferred. | live | `docs/launch-plan-2026-05.md`, `docs/release-runbook.md` | 2026-05-19 | governance drift |
| Real KMS operator endpoints veya private secret materyali wiki'ye yazilmamalidir. | live | `docs/llm-wiki.md`, `docs/release-runbook.md`, `docs/operations/known-issues.md` | 2026-05-19 | security |
| Mainnet registry 5 aktif decryption operator listeliyor. | live | 2026-05-19 mainnet registry read-only check: 5 operator, 5 active | 2026-05-19 | runtime drift |
| Mainnet KMS operator health check'leri hazir gorunuyor. | live | 2026-05-19 live health: 5/5 `/health` -> `ok:true`, `ready:true`, `network:mainnet`; endpointler bilerek yazilmadi | 2026-05-19 | runtime drift |
| Trial pool balance canli olarak 0.826 NEAR gorunuyor. | live | 2026-05-19 mainnet `get_trial_pool_balance` -> `826000000000000000000000` yoctoNEAR | 2026-05-19 | balance drift |

## Sonraki check

- Full upload-buy-watch smoke.
- Tracked WASM artefact/source/live hash farkini ayri degerlendir.
- Web4/domain smoke.
