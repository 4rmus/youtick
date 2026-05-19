---
title: Contracts
status: live
area: architecture
last_checked: 2026-05-19
confidence: high
sources:
  - docs/architecture/smart-contract.md
  - contracts/nft-ticket/src/**
  - contracts/access-control/src/lib.rs
  - contracts/operator-registry/src/lib.rs
---

# Contracts

## Kisa ozet

YouTick contract katmani uc ana parcadan olusur: `nft-ticket`, `access-control`, `operator-registry`.

## Aktif gercek

| Contract | Sorumluluk |
|---|---|
| `youtick.near` / `nft-ticket` | event, ticket, gift, trial, upload session, purchase logs |
| `access.youtick.near` / `access-control` | Play/Publish/Claim grant policy |
| `registry.youtick.near` / `operator-registry` | KMS operatorleri, relayerlar, threshold ve admin timelock |

`nft-ticket` R2 sonrasi module split ile `market.rs`, `gift.rs`, `treasury.rs`, `views.rs`, `web4.rs`, `moderation.rs`, `timelock.rs` gibi dosyalara ayrildi.

2026-05-19 canli RPC check'i, dokumanlarda gecen R2 code hash ile `youtick.near` live code hash'inin ayni olmadigini gosterdi. Koken netlesti:

- R2 deploy block `198052723`: `BXbiiT86A8mjVNwvZhNLhUDqvmTVUe7anHotTpQPXg2F`
- Hotfix deploy block `198060926`, tx `6gg1BCt7xuFYh2DABibazAFouRR7CrSdFzgWRTGKxjpt`: `7WB9gut5Y9bLF234fVHeqGnewTRL32Pc3dXfkDZEAmPr`
- Latest deploy block `198989245`, tx `3iFMyZZszb1aHpvZfY1FM4V56SvhbpDxdy4s3aZ1EaMB`: current live `HA3i8Se8Mrsd14Ye2qYvwehRgP9Phrd76psgyy9Y1bCF`

Bu tek basina davranis bozuklugu degildir; asil takip noktasi repo dokumanlarinin current mainnet hash'i tarihsel hash'lerle karistirmamasi ve `contracts/nft-ticket/res/youtick_nft_opt.wasm` artefact diff'inin bilincli karara baglanmasidir.

## Kanitlar

- `docs/architecture/smart-contract.md`: module layout, economy model ve public method families.
- `docs/launch-plan-2026-05.md`: R2 deploy ve code hash notlari.
- Contract source dosyalari.

## Celiskiler veya dikkat noktalar

- `nft-ticket` owner-only admin V1 public alpha siniridir; production governance claim'i degildir.
- Registry timelock kullanir; access timelock current alpha icin deferred.
- Migration/reset methodlari normal build ve operasyon icin varsayilmaz.

## Ilgili sayfalar

- [[product/pricing-and-payments|Pricing ve payments]]
- [[kms-and-access|KMS ve access]]
- [[operations/known-risks|Bilinen riskler]]
