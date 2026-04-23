# Installation Guide

> YouTick'i yerelde calistirmak icin gereken adimlar

---

## Gerekenler

| Arac | Versiyon |
|------|----------|
| Node.js | 20.9+ |
| npm | 9+ |
| Git | Guncel |
| Rust | Opsiyonel, contract gelistirme icin |

---

## 1. Repoyu klonla

```bash
git clone https://github.com/4rmus/youtick.git
cd youtick
```

## 2. Web uygulamasini hazirla

```bash
cd apps/web
npm install
cp .env.example .env.local
```

`.env.local` icinde minimum su degiskenler gereklidir:

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
```

Local KMS worker ile calisacaksan su satiri da ekle:

```txt
NEXT_PUBLIC_KMS_URL=http://localhost:8787
```

## 3. Uygulamayi baslat

```bash
npm run dev
```

Tarayicida `http://localhost:3000` adresini ac.

---

## Opsiyonel: Contract gelistirme

```bash
rustup target add wasm32-unknown-unknown
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release
cargo test
```

---

## Opsiyonel: Local KMS worker

KMS worker ile de yerelde calismak istiyorsan:

```bash
cd workers/youtick-kms
npm install
npx wrangler dev
```

Sonra web uygulamasinda `NEXT_PUBLIC_KMS_URL=http://localhost:8787` kullan.

---

## Ilk kontrol listesi

Uygulama acildiginda sunlari kontrol et:

1. Landing page yukleniyor mu?
2. `/discover` sayfasi event cekebiliyor mu?
3. Cuzdan baglama akisi aciliyor mu?
4. Local KMS kullaniyorsan `/watch` akisinda key istegi hata vermiyor mu?

---

## SIk gorulen sorunlar

| Sorun | Kontrol et |
|-------|------------|
| Uygulama contract'a baglanmiyor | `NEXT_PUBLIC_NEAR_NETWORK` ve `NEXT_PUBLIC_NFT_CONTRACT_ID` |
| Video acilmiyor | `NEXT_PUBLIC_KMS_URL` ve worker loglari |
| Hediye linki yanlis domaine gidiyor | `NEXT_PUBLIC_APP_URL` |
| Cross-chain odeme secenekleri bos | `NEXT_PUBLIC_ONE_CLICK_API_TOKEN` |

---

**Next:** [Configuration Reference](./configuration.md)
