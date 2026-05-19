---
title: Known Risks
status: live
area: operations
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/operations/known-issues.md
  - docs/launch-plan-2026-05.md
  - docs/release-runbook.md
---

# Known Risks

## Kisa ozet

Known risks sayfasi, public alpha sinirlarini saklamamak icindir. Cozulmus, accepted ve live-check isteyen riskler birbirinden ayrilmalidir.

## Aktif gercek

Onemli risk siniflari:

- Hybrid decentralization risk remains: KMS Workers + KV, Lighthouse primary, owner-controlled NFT market admin.
- Full encrypted upload/purchase/watch smoke canli gate olarak ayrica takip edilmeli.
- KMS operator health ve registry threshold canli drift gosterir; 2026-05-19 read-only check PASS idi.
- `youtick.near` current live code hash `HA3i...`; repo docs/vault buna gore uzlasti, working-tree WASM artefact diff'i ayrica commit/revert karari ister.
- Onboarding key ve operator config secret materyali repo/vault icine girmemeli.
- Direct gateway/Web4 API farki kullanici akisini etkileyebilir.

## Kanitlar

- `docs/operations/known-issues.md`: living transparency report.
- `docs/launch-plan-2026-05.md`: ship blockers ve checkpoint.
- `docs/release-runbook.md`: mainnet health gate.

## Celiskiler veya dikkat noktalar

- "Resolved in source" ile "resolved live" ayni sey degildir.
- Dated live claims ucuzsa yeniden check edilmeli.
- Code hash gibi deploy kimligi iddialari tek basina dokumandan alinmamali.
- Security-sensitive bilgiler ozete indirgenmeli; public/private key ayrimi bile gereksizse yazilmamali.

## Ilgili sayfalar

- [[launch-status|Launch status]]
- [[live-health-gates|Live health gates]]
- [[audits/security|Security audit]]
