---
title: KMS Module Card
status: live
area: module-card
last_checked: 2026-05-19
confidence: high
sources:
  - workers/youtick-kms/src/index.ts
  - apps/web/lib/kms
  - contracts/operator-registry/src/lib.rs
  - docs/architecture/storage.md
---

# KMS Module Card

## Ne yapar?

KMS katmani sifreli videonun AES key share'lerini operatorlerde saklar ve yetkili playback icin share retrieval saglar.

## Ilk oku

1. [[../architecture/kms-and-access|KMS and access]]
2. [[wallet-playback|Wallet playback card]]
3. `apps/web/lib/kms/client.ts`
4. `workers/youtick-kms/src/index.ts`

## En sik kaynak dosyalar

| Konu | Dosya |
|---|---|
| Client auth/retrieve | `apps/web/lib/kms/client.ts` |
| Share math | `apps/web/lib/kms/shares.ts` |
| Encryption | `apps/web/lib/kms/encryption.ts` |
| Worker routes/auth | `workers/youtick-kms/src/index.ts` |
| Threshold source | `contracts/operator-registry/src/lib.rs`, `apps/web/lib/registry.ts` |

## Dar dogrulama

```bash
cd apps/web && npm test -- --run __tests__/unit/kms-client.test.ts
cd workers/youtick-kms && npm run check && npm test -- --run
```

## Dikkat

- Normal akista KMS endpointleri registry discovery ile bulunur; eski public fallback dili ekleme.
- Real operator endpointleri, secret ve private config wiki'ye yazilmaz.
- Playback hedefi: connect once, izlerken yeni wallet popup olmasin.
- Threshold claim'i canli drift riski tasir; release oncesi yeniden check gerekir.
