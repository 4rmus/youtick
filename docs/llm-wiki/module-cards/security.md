---
title: Security Module Card
status: live
area: module-card
last_checked: 2026-05-19
confidence: medium
sources:
  - SECURITY.md
  - docs/operations/known-issues.md
  - workers/youtick-kms/src/index.ts
  - contracts
---

# Security Module Card

## Ne yapar?

Security lens'i secret handling, auth, authorization, KMS, storage upload guard, CORS, rate limit, contract mutation ve payment risklerini kontrol eder.

## Ilk oku

1. [[../audits/security|Security audit]]
2. [[../claims|Claim register]]
3. Degisen dosyalar
4. Ilgili module card

## Riskli alanlar

| Konu | Kaynak |
|---|---|
| Secrets/env | `.env*`, `workers/*/wrangler.toml`, `scripts/config/*.local.json` |
| KMS auth | `workers/youtick-kms/src/index.ts`, `apps/web/lib/kms/client.ts` |
| Access grant | `contracts/access-control/src/lib.rs`, `apps/web/lib/access-grants.ts` |
| Upload auth | `workers/storage-api/src/index.ts`, `apps/web/lib/storage/storage-api.ts` |
| Contract mutation | `contracts/*/src/**` |
| CORS/API proxy | `workers/web4-proxy/src/index.ts`, `apps/web/app/api/**` |

## Dar dogrulama

```bash
cd workers/youtick-kms && npm run check && npm test -- --run
cd workers/storage-api && npm run check && npm test -- --run
cd contracts/nft-ticket && cargo test --lib
```

## Dikkat

- Secret, private key, real operator endpoint veya `.near-credentials` wiki'ye yazilmaz.
- Security sorularinda sadece wiki cevabi yeterli degildir; kaynak veya live check gerekir.
- `localhost` ve test fallback davranisi mainnet claim gibi anlatilmaz.
