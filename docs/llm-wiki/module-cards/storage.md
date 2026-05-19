---
title: Storage Module Card
status: live
area: module-card
last_checked: 2026-05-19
confidence: high
sources:
  - workers/storage-api/src/index.ts
  - workers/media-delivery/src/index.ts
  - apps/web/lib/storage
  - docs/architecture/storage.md
---

# Storage Module Card

## Ne yapar?

Storage katmani upload intent, Lighthouse write path, encrypted asset delivery ve IPFS/gateway read path sorumluluklarini ayirir.

## Ilk oku

1. [[../architecture/storage-and-delivery|Storage and delivery]]
2. [[../flows/upload|Upload flow]]
3. `apps/web/lib/storage/**`
4. `workers/storage-api/src/index.ts`
5. `workers/media-delivery/src/index.ts`

## En sik kaynak dosyalar

| Konu | Dosya |
|---|---|
| Upload hook | `apps/web/hooks/useUpload.ts` |
| Storage API client | `apps/web/lib/storage/storage-api.ts` |
| Upload guard/provider | `workers/storage-api/src/index.ts` |
| Media delivery | `workers/media-delivery/src/index.ts` |
| IPFS reads | `apps/web/lib/ipfs/**`, `apps/web/lib/video-delivery.ts` |
| Crust legacy | `apps/web/lib/crust/**` |

## Dar dogrulama

```bash
cd apps/web && npm test -- --run __tests__/unit/storage-api.test.ts
cd workers/storage-api && npm run check && npm test -- --run
cd workers/media-delivery && npm run check && npm test -- --run
```

## Dikkat

- Lighthouse aktif birincil write path; Crust legacy compatibility ve diagnostik/fallback yuzeyidir.
- Storage provider, bandwidth/media delivery ve KMS access ayni sey degildir.
- Upload basarisi sadece UI toast ile kapanmaz; provider, chain veya playback kaniti gerekir.
