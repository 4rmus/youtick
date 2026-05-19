---
title: Upload Flow
status: live
area: flows
last_checked: 2026-05-19
confidence: high
sources:
  - docs/frontend.md
  - docs/architecture/session-keys.md
  - apps/web/hooks/useUpload.ts
  - apps/web/lib/upload-session-manager.ts
  - apps/web/lib/storage/storage-api.ts
---

# Upload Flow

## Kisa ozet

Upload path, creator'in tek onayla yayin yapmasini hedefleyen dar kapsamli upload session modelini kullanir.

## Aktif gercek

1. Metadata ve dosya sinirlari validate edilir.
2. Upload session authority ve budget hazirlanir.
3. Thumbnail/poster assetleri Lighthouse'a Storage API uzerinden yuklenir.
4. Paid path'te medya AES-CTR ile sifrelenir.
5. Ciphertext + delivery manifest Lighthouse/IPFS'e gider.
6. AES key Shamir share'lere bolunur ve KMS operatorlerine dagitilir.
7. On-chain `nft_mint_prepaid` + `create_event_prepaid` aksiyonlari tamamlanir.

## Kanitlar

- `docs/frontend.md`: upload core flow.
- `docs/architecture/session-keys.md`: upload session modelini aciklar.
- `apps/web/hooks/useUpload.ts`: status metinleri ve Lighthouse manifest dogrulama.

## Celiskiler veya dikkat noktalar

- Upload session, signless playback key'i degildir.
- `*_prepaid` aktif upload session yoludur; deprecated sayilmaz.
- Large upload ve direct/scoped upload davranisi Storage API intent cevabina bagli olabilir.

## Sonraki check

- Kisa test video upload smoke.
- Storage API auth challenge + intent + file akisi.
- Delivery manifest verify.
