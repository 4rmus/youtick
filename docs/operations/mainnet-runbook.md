# Mainnet Runbook

> Uygulamanin `core-only` mainnet acilisi icin operasyon rehberi

---

## Launch Scope

- Acik: upload, discover, buy, watch, gift, trial
- Kapali: cross-chain checkout (`NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=false`)
- Varsayilan publish yolu: upload session
- Varsayilan domain: `https://youtick.net`

---

## Required Config

### Web

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_KMS_URL=https://youtick-kms.example.workers.dev
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=false
NEXT_PUBLIC_ENABLE_LEGACY_UPLOAD_FALLBACK=false
```

### KMS Worker

- `NEAR_CONTRACT_ID=youtick.near`
- `NEAR_ACCESS_CONTRACT_ID=access.youtick.near`
- `NEAR_REGISTRY_CONTRACT_ID=registry.youtick.near`
- `REGISTRY_OPERATOR_ACCOUNT_ID=<worker operator account>`
- `OPERATOR_SHARE_SECRET=<worker secret>`
- `ALLOWED_ORIGINS=https://youtick.near.page,https://youtick.net,https://www.youtick.net`
- Mainnet KV namespace'leri testnet'ten ayri olmali

### Relayer Fallback

- `RELAYER_ACCOUNT_ID`
- `RELAYER_PRIVATE_KEY`
- Bu hesap registry'de aktif olmali
- Bu hesap mevcut contract yuzeyinde trial olusturma yetkisine sahip olmali

---

## Deploy Order

1. Contract hesaplarini ve env degerlerini dogrula
2. Registry icinde aktif operator ve relayer kayitlarini kontrol et
3. Her KMS worker icin ayri secret ve ayri KV binding ata
4. KMS worker'lari deploy et
5. `GET /health` ile contract, network, registry ve ready durumunu dogrula
6. Web uygulamasini `npm run build` ve `npm run build:web4` ile paketle
7. Web4 deploy akisini calistir
8. `youtick.net` ve `youtick.near.page` uzerinden smoke test calistir

---

## Smoke Checklist

- Creator upload + publish basarili
- Buyer purchase + playback basarili
- Gift claim mevcut hesapta calisiyor
- Gift claim yeni hesapta calisiyor
- Trial create calisiyor
- Moderation ile banned event satin alinamiyor
- `GET /health` dogru contract ve network donduruyor
- `GET /health` eksik registry/share-secret durumunda `503` donuyor
- `www.youtick.net` canonical domaine yonleniyor

---

## Rollback

1. Web tarafinda son saglam Web4 CID'ine don
2. Sorunlu worker deploy'unu onceki saglam surume geri al
3. Gerekirse registry operator kaydini pasiflestir
4. Cross-chain checkout aciksa tekrar kapat
5. Trial veya gift sorunu varsa onboarding key'i ve relayer'i gecici olarak devre disi birak

---

## Release Gate

Launch oncesi bu komutlar yesil olmali:

```bash
cd apps/web
npm run lint
npm test -- --run
npm run build
npm run build:web4
```

```bash
cd contracts/nft-ticket && cargo test
cd contracts/access-control && cargo test
cd contracts/operator-registry && cargo test
cd contracts/nft-ticket-tests && cargo test
```
