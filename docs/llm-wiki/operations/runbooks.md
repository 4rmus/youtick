---
title: Runbooks
status: live
area: operations
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/release-runbook.md
  - docs/operations/mainnet-deploy-runbook.md
  - docs/operations/incident-kms-operator-down.md
  - docs/operations/incident-takedown.md
---

# Runbooks

## Kisa ozet

Operasyonel kararlarda once mevcut runbook okunur. Bu wiki runbook'larin yerine gecmez; hizli harita gorevi gorur.

## Ana runbooklar

| Runbook | Kullan |
|---|---|
| `docs/release-runbook.md` | release pre-flight, health gate, deploy order |
| `docs/operations/mainnet-deploy-runbook.md` | mainnet contract/KMS activation |
| `docs/operations/incident-kms-operator-down.md` | KMS operator incident |
| `docs/operations/incident-takedown.md` | takedown/emergency operasyonu |
| `docs/operations/known-issues.md` | risk ve transparency tracker |

## Dikkat noktalar

- Destructive migration/reset path review olmadan calistirilmaz.
- Registry direct admin pathleri yerine timelock propose/execute kullanilir.
- KMS deploy operator operator yapilir; herhangi bir unhealthy durumda durulur.

## Sonraki check

- Her canli operasyon sonrasi release note/log entry ekle.
- Runbook ve [[claims|claims.md]] celiskilerini lint et.
