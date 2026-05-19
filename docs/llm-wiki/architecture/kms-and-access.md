---
title: KMS and Access
status: live
area: architecture
last_checked: 2026-05-19
confidence: high
sources:
  - docs/architecture/storage.md
  - docs/architecture/session-keys.md
  - docs/security.md
  - workers/youtick-kms/src/index.ts
  - contracts/access-control/src/lib.rs
  - contracts/operator-registry/src/lib.rs
---

# KMS and Access

## Kisa ozet

KMS, full playback key saklayan tek merkez degildir. AES key share'lere bolunur; player yeterli share'i toplayinca key'i browser'da yeniden kurar.

## Aktif gercek

- KMS operators encrypted share saklar.
- Access-control contract kisa sureli Play grant verir.
- Operator registry aktif operatorleri ve threshold config'i belirler.
- KMS retrieve, registry status + access grant + entitlement check sonrasinda share dondurur.
- Normal hedef: paid playback sirasinda yeniden wallet popup acilmamasi.

## Kanitlar

- `docs/architecture/storage.md`: 3-of-5 share reconstruction modelini anlatir.
- `docs/architecture/session-keys.md`: signless access key + 10 dakikalik Play grant akisi.
- `docs/security.md`: registry enforcement ve threshold sorularini listeler.
- `workers/youtick-kms/src/index.ts`: worker authorization ve share retrieval yuzeyi.

## Celiskiler veya dikkat noktalar

- 3-of-5 threshold dokumanda live olarak geciyor; canli registry check yapilmadan current mainnet state diye kesin yazma.
- Gercek operator endpointleri veya secret config wiki'ye yazilmaz.
- KMS health canli drift gosterir; release oncesi her operator `/health` ile kontrol edilmeli.

## Ilgili sayfalar

- [[storage-and-delivery|Storage ve delivery]]
- [[wallet-and-signless-flow|Wallet ve signless flow]]
- [[flows/purchase-and-watch|Satin alma ve izleme]]
- [[operations/live-health-gates|Live health gates]]
