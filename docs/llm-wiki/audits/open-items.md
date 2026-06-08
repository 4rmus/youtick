---
title: Open Audit Items
status: live
area: audits
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/launch-plan-2026-05.md
  - docs/operations/known-issues.md
---

# Open Audit Items

## Kisa ozet

Bu sayfa, wiki icin acik kalan audit takip listesidir. Her madde repo veya canli check ile kapatilmalidir.

## Acik maddeler

| Madde | Neden onemli | Sonraki check |
|---|---|---|
| Full upload-buy-watch smoke | Public alpha icin en kritik user path | Browser + chain + KMS + playback |
| Registry threshold live state | 3-of-5 claim'i canli drift gosterebilir | Verified 2026-05-19; tekrar release oncesi check |
| KMS operator health | Playback availability | Verified 2026-05-19; tekrar release oncesi check |
| Storage API auth live behavior | Lighthouse budget ve upload guard | Auth'suz intent verified 2026-05-19; signed upload smoke hala ayri |
| `youtick.near` WASM artefact commit karari | Working-tree `contracts/nft-ticket/res/youtick_nft_opt.wasm` current live `HA3i...` ile eslesti; bu binary diff commit mi edilecek yoksa docs-only calismadan ayrilacak mi netlesmeli | Artifact reconciliation |
| Web4/API entrypoint davranisi | Direct gateway static-only gap | `youtick.net` ve direct route smoke |
| Trial pool/funding | guest/trial UX | `get_trial_pool_balance` |

## Dikkat noktalar

- Bu liste yorum degil, kapatilabilir is listesi olmali.
- Kapanan madde [[log|log.md]] ve gerekiyorsa [[claims|claims.md]] icine islenir.
