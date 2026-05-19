---
title: System Architecture
status: live
area: architecture
last_checked: 2026-05-19
confidence: high
sources:
  - docs/architecture/README.md
  - docs/overview.md
  - docs/frontend.md
---

# System Architecture

## Kisa ozet

YouTick bes aktif katmandan olusur: web app, market contract, access contract, registry contract ve KMS operatorleri.

## Aktif gercek

| Katman | Sorumluluk |
|---|---|
| Web app | Media encryption, upload, purchase/watch UX |
| Market contract | Events, tickets, purchase logs, creator ownership |
| Access contract | Kisa sureli session grant |
| Registry contract | Aktif decryption operatorleri ve relayer bilgisi |
| KMS operators | Key share saklama ve authorization sonrasi release |

Storage katmani encrypted media tutar. Lighthouse primary write provider'dir. Browser final playback key'i reconstruce eder ve media'yi decrypt eder.

## Kanitlar

- `docs/architecture/README.md`: layer modeli ve flow.
- `docs/frontend.md`: frontend directory ve flow mapping.
- `docs/overview.md`: aktif bilesen listesi.

## Dikkat noktalar

- Bu model hybrid decentralized. KMS operators Cloudflare Workers + KV kullandigi icin tam merkeziyetsizlik claim'i yapilmaz.
- Registry operator listesi canli drift gosterebilir; release oncesi RPC check gerekir.
- Access timelock current alpha gate icin deferred.

## Ilgili sayfalar

- [[storage-and-delivery|Storage ve delivery]]
- [[kms-and-access|KMS ve access]]
- [[contracts|Contracts]]
- [[workers|Workers]]
