# YouTick

> Decentralized video platform on NEAR with browser-side encryption, KMS-backed key custody and IPFS delivery

YouTick is an open-source VOD platform where creators upload encrypted videos to IPFS and sell access through NFT tickets. The active architecture uses browser-side AES encryption, a Cloudflare KMS worker for key custody, and Crust-backed IPFS delivery.

![NEAR Protocol](https://img.shields.io/badge/Blockchain-NEAR%20Protocol-00C1DE?style=flat&logo=near&logoColor=white)
![Rust](https://img.shields.io/badge/Contract-Rust-DEA584?style=flat&logo=rust&logoColor=white)
![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-000000?style=flat&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/Language-TypeScript%205-3178C6?style=flat&logo=typescript&logoColor=white)
![KMS](https://img.shields.io/badge/Encryption-Edge%20KMS-0EA5E9?style=flat)
![IPFS](https://img.shields.io/badge/Storage-IPFS%20%2B%20Crust-65C2CB?style=flat&logo=ipfs&logoColor=white)

---

## Core Features

| Ozellik | Aciklama |
|---------|----------|
| NFT-Gated Access | Ticket sahipligi zincirde tutulur |
| 98% Creator Payout | Gelirin buyuk kismi creator'a gider |
| Browser Encryption | Medya tarayicida sifrelenir |
| KMS Key Custody | Anahtarlar KMS worker'da tutulur |
| Crust/IPFS Delivery | Sifreli medya birden fazla gateway ile okunur |
| Gift Links | Paylasilabilir tek kullanimlik linkler |
| Trial Accounts | Onboarding key ile dusuk surtunmeli baslangic |
| Cross-Chain Checkout | Deneysel 1Click + MetaMask yolu, varsayilan olarak kapali |

---

## Architecture

```text
Browser App
  -> encrypts media
  -> uploads to Crust/IPFS
  -> stores/retrieves keys from KMS
  -> reads/writes ownership on NEAR
```

Temel bilesenler:

- `apps/web`
- `workers/youtick-kms`
- `contracts/nft-ticket`

Not: kontratta eski uyumluluk alanlari gorulebilir, fakat aktif yeni akis KMS tabanlidir.

---

## Quick Start

```bash
git clone https://github.com/4rmus/youtick.git
cd youtick
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

Minimum env:

```env
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_KMS_URL=https://youtick-kms.example.workers.dev
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=false
```

---

## Useful Docs

- [Docs index](./docs/README.md)
- [System architecture](./docs/architecture/README.md)
- [Storage and delivery](./docs/architecture/storage.md)
- [Quick start](./docs/quick-start.md)
- [Configuration](./docs/getting-started/configuration.md)
- [Contract methods](./docs/api/contract-methods.md)
- [Security](./docs/security.md)
- [Business (TR)](./docs/business/youtick-avrupa-sirketlesme-raporu-2026-04.md)

---

## Status

Dokumanlar ve README'ler aktif KMS + Crust + NEAR mimarisine gore guncellenmistir. Eski mimari anlatimlari temizlenmistir.
