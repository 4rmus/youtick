---
title: YouTick Overview
status: live
area: overview
last_checked: 2026-05-19
confidence: high
sources:
  - docs/overview.md
  - docs/README.md
  - README.md
---

# YouTick Overview

## Kisa ozet

YouTick, videolarini sifreli yukleyip erisimi NFT/dijital bilet sahipligiyle satan creator-first bir video platformudur.

Dogru urun durusu: public alpha, hybrid decentralized. Production-ready veya tam merkeziyetsiz diye anlatilmamali.

## Aktif gercek

Temel akis:

1. Creator videoyu secer.
2. Browser videoyu AES-CTR ile sifreler.
3. Sifreli medya Lighthouse/IPFS tarafina gider.
4. AES key Shamir share'lere bolunur.
5. KMS operatorleri kendi share'lerini saklar.
6. Viewer bilet alir veya gift/trial ile erisim kazanir.
7. Access-control kontratinda kisa sureli Play grant uretilir.
8. Player yeterli KMS share'i toplar, key'i browser'da yeniden kurar ve videoyu oynatir.

## Aktif bilesenler

- `apps/web`: Next.js frontend.
- `workers/storage-api`: Lighthouse secret, upload guard ve provider health siniri.
- `workers/media-delivery`: sifreli manifest/segment delivery ve gateway fallback siniri.
- `workers/youtick-kms`: KMS share storage ve authorization check.
- `workers/web4-proxy`: Web4 ve same-origin API proxy.
- `contracts/nft-ticket`: ticket, market, gift, trial ve payment logic.
- `contracts/access-control`: playback grant yonetimi.
- `contracts/operator-registry`: operator registry ve threshold config.

## Kanitlar

- `docs/overview.md`: core flow ve aktif bilesenleri listeliyor.
- `docs/README.md`: public alpha, not production-ready ve hybrid decentralized durusunu sabitliyor.
- `docs/architecture/README.md`: layer sorumluluklarini acikliyor.

## Celiskiler veya dikkat noktalar

- Mainnet canli durum dokumandan sapabilir. Release veya launch karari icin [[operations/live-health-gates|live health gates]] yeniden kosulmali.
- Eski Nova alanlari Borsh compatibility icin kalabilir; yeni akis olarak yorumlanmamali.
- `*_prepaid` naming aktif upload session yoludur; deprecated sayilmamali.

## Ilgili sayfalar

- [[architecture/system|Sistem mimarisi]]
- [[architecture/storage-and-delivery|Storage ve delivery]]
- [[architecture/kms-and-access|KMS ve access]]
- [[flows/purchase-and-watch|Satin alma ve izleme]]
- [[operations/launch-status|Launch durumu]]

## Sonraki check

- Full upload-buy-watch smoke sonucu wiki'ye islenmeli.
- Registry threshold ve operator health canli olarak yeniden dogrulanmali.
