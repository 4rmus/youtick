---
title: Security Audit
status: live
area: audits
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/security.md
  - docs/operations/known-issues.md
  - docs/release-runbook.md
---

# Security Audit

## Kisa ozet

Security posture public alpha seviyesinde anlatilmali. Secret materyal, real operator config ve private key bilgisi wiki'ye yazilmaz.

## Aktif guvenlik sinirlari

- Browser-side encryption.
- NEAR ticket entitlement.
- Access grant policy.
- Operator registry enforcement.
- KMS threshold shares.
- Lighthouse secret Storage API arkasinda.

## Kanitlar

- `docs/security.md`: playback authorization, registry ve KMS threat model.
- `docs/operations/known-issues.md`: resolved ve accepted security riskleri.
- `docs/release-runbook.md`: secret scan ve KMS endpoint fallback uyarilari.

## Dikkat noktalar

- "Resolved in source" live deploy anlamina gelmez.
- KMS endpoints registry-only/fail-closed olmali; tracked file icine fallback URL eklenmez.
- Secret scan false positive uretir; asil hedef real reusable deploy key veya production env degeridir.

## Sonraki check

- Release oncesi secret scan.
- KMS health + registry threshold.
- Upload auth live smoke.
