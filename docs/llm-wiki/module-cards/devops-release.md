---
title: Devops Release Module Card
status: live
area: module-card
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/launch-plan-2026-05.md
  - docs/release-runbook.md
  - docs/operations/known-issues.md
  - scripts
---

# Devops Release Module Card

## Ne yapar?

Release/devops katmani build, deploy, Web4, worker health, contract hash ve public alpha gate kontrollerini tutar.

## Ilk oku

1. [[../operations/launch-status|Launch status]]
2. [[../operations/live-health-gates|Live health gates]]
3. `docs/launch-plan-2026-05.md`
4. `docs/release-runbook.md`
5. Degisen deploy script veya worker config

## En sik kaynak dosyalar

| Konu | Dosya |
|---|---|
| Launch checkpoint | `docs/launch-plan-2026-05.md` |
| Release gate | `docs/release-runbook.md` |
| Known issues | `docs/operations/known-issues.md` |
| Web4 deploy | `apps/web/scripts/build-web4.mjs`, `scripts/deploy-web4.sh`, `workers/web4-proxy/src/index.ts` |
| Contract deploy | `scripts/deploy-nft-mainnet.mjs`, `contracts/nft-ticket/res/**` |
| Registry ops | `scripts/prestage-emergency-proposals.mjs`, `scripts/bootstrap-registry-mainnet.js` |

## Dar dogrulama

```bash
cd apps/web && npm run build
cd workers/web4-proxy && npm run check && npm test -- --run
cd contracts/nft-ticket && cargo test --lib
```

## Dikkat

- `npm run build` Web4 live demek degildir; Web4 build/output ve live origin ayri kontrol edilir.
- Canli hash, KMS health, trial pool ve domain sonucu zamanla degisir.
- Full upload-buy-watch smoke olmadan release GO kesin yazilmaz.
