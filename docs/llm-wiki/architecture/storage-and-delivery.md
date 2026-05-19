---
title: Storage and Delivery
status: live
area: architecture
last_checked: 2026-05-19
confidence: high
sources:
  - docs/architecture/storage.md
  - docs/frontend.md
  - apps/web/hooks/useUpload.ts
  - apps/web/lib/storage/storage-api.ts
  - workers/storage-api/src/index.ts
  - workers/media-delivery/src/index.ts
---

# Storage and Delivery

## Kisa ozet

Storage, delivery ve KMS ayni sey degildir. Storage encrypted dosyalarin kaliciligini, media-delivery sifreli dosyanin okunmasini, KMS ise playback key share'lerini yonetir.

## Aktif gercek

Upload path:

1. Browser AES-256-CTR key uretir.
2. Video chunk/segment olarak sifrelenir.
3. Encrypted assetler Lighthouse/IPFS'e yuklenir.
4. AES key share'lere bolunur.
5. KMS operatorleri kendi share'lerini saklar.

Delivery path:

- `workers/storage-api`: Lighthouse secret, upload guard, provider health, CID status ve signed upload intent siniri.
- `workers/media-delivery`: `/ipfs/:cid/:path*`, Range forwarding, edge cache ve public gateway fallback.
- `apps/web/lib/ipfs/*`: IPFS read path ve gateway fallback.
- `apps/web/lib/crust/*`: Crust write/compat surface; primary read path degil.

## Kanitlar

- `docs/architecture/storage.md`: active model ve gateway strategy.
- `docs/frontend.md`: Lighthouse primary upload ve IPFS read path.
- `apps/web/hooks/useUpload.ts`: Lighthouse upload statuslari ve delivery manifest upload.

## Celiskiler veya dikkat noktalar

- Crust tamamen yok edilmis degil; legacy compatibility ve diagnostics icin duruyor.
- Lighthouse primary write path olsa da IPFS gateway availability canli degisebilir.
- Worker request limitleri ve direct/scoped upload support'u canli Storage API intent cevabindan okunmali.

## Ilgili sayfalar

- [[kms-and-access|KMS ve access]]
- [[flows/upload|Upload akisi]]
- [[operations/live-health-gates|Live health gates]]
