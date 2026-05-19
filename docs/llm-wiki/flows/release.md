---
title: Release Flow
status: live
area: flows
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/release-runbook.md
  - docs/launch-plan-2026-05.md
  - docs/operations/mainnet-deploy-runbook.md
---

# Release Flow

## Kisa ozet

Release karari icin build/test yeterli degildir. KMS operator health, registry threshold, trial state ve full smoke ayrica dogrulanir.

## Aktif gercek

Deploy sirasi:

1. Contracts, sadece source degistiyse ve migration riski anlasildiysa.
2. Registry timelock proposals/executions, operator config degisiyorsa.
3. KMS workers, operator operator.
4. Web app / Web4 assets.
5. Smoke tests.
6. Known issues ve release notes update.

## Kanitlar

- `docs/release-runbook.md`: pre-flight, health gate, deploy order, rollback.
- `docs/launch-plan-2026-05.md`: public alpha checkpoint ve kalan gate.

## Celiskiler veya dikkat noktalar

- Web veya worker, registry threshold saglanmayan state'e deploy edilmez.
- Contract rollback normal yol degildir; fix-forward ve incident note gerekir.
- Access timelock build'i current alpha karari yeniden acilmadan deploy edilmez.

## Ilgili sayfalar

- [[operations/live-health-gates|Live health gates]]
- [[operations/runbooks|Runbooks]]
- [[operations/launch-status|Launch status]]
