---
title: Workers
status: live
area: architecture
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/overview.md
  - docs/architecture/storage.md
  - workers/storage-api/src/index.ts
  - workers/media-delivery/src/index.ts
  - workers/youtick-kms/src/index.ts
  - workers/web4-proxy/src/index.ts
---

# Workers

## Kisa ozet

Worker'lar farkli sinirlara sahip. Storage API, media delivery, KMS ve Web4 proxy birbirinin yerine gecmez.

## Aktif gercek

| Worker | Sorumluluk |
|---|---|
| `workers/storage-api` | Lighthouse provider secret, upload auth/intent/file, provider health, CID status |
| `workers/media-delivery` | Sifreli IPFS manifest/segment routing, Range forwarding, cache, gateway fallback |
| `workers/youtick-kms` | KMS share storage, retrieve authorization, registry/access/entitlement check |
| `workers/web4-proxy` | Web4 static app ve same-origin `/api/*` proxy |

## Kanitlar

- `docs/overview.md`: active components.
- `docs/architecture/storage.md`: storage-api ve media-delivery boundary.
- Worker source dosyalari.

## Celiskiler veya dikkat noktalar

- Direct `youtick.near.page` veya raw IPFS gateway static-only olabilir; API-backed flows icin supported entrypoint Web4 proxy/domain tarafidir.
- Worker health canli durumdur; docs'tan kesin karar verilmez.

## Sonraki check

- `workers/storage-api` check/test.
- `workers/youtick-kms` check/test.
- `workers/media-delivery` check/test.
- Canli health endpointleri.
