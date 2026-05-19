---
title: Launch Status
status: live
area: operations
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/launch-plan-2026-05.md
  - docs/release-runbook.md
  - docs/operations/known-issues.md
---

# Launch Status

## Kisa ozet

Kilitli plan `docs/launch-plan-2026-05.md`. Public alpha durusu korunur; production-ready claim'i yapilmaz.

## Aktif gercek

2026-05-12 checkpoint'ine gore:

- SB-1 Storage API auth: done.
- SB-2 onboarding key rotation: done.
- SB-3 emergency registry proposals: current alpha scope icin done.
- R1 IPFS gateway split: done.
- R2 module split: deployed + verified olarak dokumanda geciyor.
- Kalan onemli gate: full upload-buy-watch smoke.

## Canli check - 2026-05-19

Bu pass'te canli read-only ve health kontrolleri calisti:

| Gate | Sonuc |
|---|---|
| Registry threshold | PASS: `required_shares=3`, `total_operators=5` |
| Decryption operator listesi | PASS: 5 operator, 5 active |
| KMS health | PASS: 5/5 `ok:true`, `ready:true`, `network:mainnet` |
| Storage API provider health | PASS: provider `lighthouse`, `ready:true`, `uploadsEnabled:true`, `uploadGuardReady:true` |
| Auth'suz upload intent | PASS: `Unauthorized` |
| Trial pool | PASS/read-only: `0.826 NEAR` gorundu |
| `youtick.near` code hash | PASS: latest live `HA3i8Se8Mrsd14Ye2qYvwehRgP9Phrd76psgyy9Y1bCF`; deploy block `198989245`, tx `3iFMyZZszb1aHpvZfY1FM4V56SvhbpDxdy4s3aZ1EaMB`; R2 `BXbii...` and hotfix `7WB9...` are historical |
| Full upload-buy-watch smoke | NOT RUN |

## Kanitlar

- `docs/launch-plan-2026-05.md`: locked plan ve checkpoint.
- `docs/release-runbook.md`: release posture ve health gate.
- `docs/operations/known-issues.md`: resolved/pending risk tracker.

## Celiskiler veya dikkat noktalar

- Ilk bootstrap canli RPC veya Worker health check yapmadan yazilmisti; 2026-05-19'da read-only live check eklendi.
- "Done" yazan eski R2 maddeleri tarihsel olarak dogru; 2026-05-19 check'i R2 sonrasi ikinci deploy'u buldu.
- Full upload-buy-watch smoke sonucu gelmeden real paid encrypted creator content icin kesin GO denmez.

## Sonraki check

- [[live-health-gates|Live health gates]] kos.
- Full upload-buy-watch smoke sonucunu [[log|log.md]] ve [[claims|claims.md]] icine isle.
- Repo docs ve vault current hash referanslari `HA3i...` ile uzlasti; binary artefact diff'i commit/revert karari olarak ayri takip et.
