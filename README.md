# YouTick

> Public-alpha, hybrid decentralized video platform on NEAR with browser-side encryption, KMS-backed key custody and IPFS delivery

YouTick is an open-source VOD platform where creators upload encrypted videos to IPFS and sell access through NFT tickets. The active architecture is hybrid decentralized: NEAR stores ownership and access rules, the browser encrypts media, KMS workers custody threshold key shares on Cloudflare/KV, and Lighthouse is the primary write provider behind the Storage API Worker. Crust remains for legacy compatibility and opt-in diagnostics.

![NEAR Protocol](https://img.shields.io/badge/Blockchain-NEAR%20Protocol-00C1DE?style=flat&logo=near&logoColor=white)
![Rust](https://img.shields.io/badge/Contract-Rust-DEA584?style=flat&logo=rust&logoColor=white)
![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-000000?style=flat&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/Language-TypeScript%205-3178C6?style=flat&logo=typescript&logoColor=white)
![KMS](https://img.shields.io/badge/Encryption-Edge%20KMS-0EA5E9?style=flat)
![IPFS](https://img.shields.io/badge/Storage-IPFS%20%2B%20Lighthouse-65C2CB?style=flat&logo=ipfs&logoColor=white)

---

## Core Features

| Ozellik | Aciklama |
|---------|----------|
| NFT-Gated Access | Ticket sahipligi zincirde tutulur |
| 98% Creator Payout | Gelirin buyuk kismi creator'a gider |
| Browser Encryption | Medya tarayicida sifrelenir |
| Threshold Key Custody | Anahtarlar parcalanarak (SSS) birden fazla KMS operatorunde tutulur |
| Lighthouse/IPFS Delivery | Sifreli medya Storage API ve birden fazla gateway ile okunur |
| Gift Links | Paylasilabilir tek kullanimlik linkler |
| Trial Accounts | Onboarding key ile dusuk surtunmeli baslangic |
| Cross-Chain Checkout | Deneysel 1Click + MetaMask yolu; sadece `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true` iken acilir |

---

## Architecture

```text
Browser App
  -> encrypts media
  -> uploads to Lighthouse/IPFS through Storage API
  -> splits/reconstructs keys via multiple KMS operators
  -> reads/writes ownership on NEAR
```

Temel bilesenler:

- `apps/web`
- `workers/youtick-kms`
- `workers/storage-api`
- `workers/media-delivery`
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
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=false
```

KMS endpointleri env ile verilmez ve gercek operator config'i git'e konmaz.
Web app aktif operatorleri registry kontratindan okur; registry okunamazsa KMS
akisi fail-closed davranir, sabit veya eski endpoint'e dusmez.
Cross-chain checkout varsayilan olarak kapalidir; `false`, bos veya tanimsiz env bu yolu acmaz.
Upload akisi icin `NEXT_PUBLIC_STORAGE_API_URL` bir Storage API Worker'a
bakmali ve worker tarafinda Lighthouse secret'lari ile upload guard hazir
olmalidir. Sadece UI veya wallet akisini deneyeceksen bu adimi erteleyebilirsin.

---

## Useful Docs

- [Docs index](./docs/README.md)
- [System architecture](./docs/architecture/README.md)
- [Storage and delivery](./docs/architecture/storage.md)
- [Quick start](./docs/quick-start.md)
- [Configuration](./docs/getting-started/configuration.md)
- [Contract methods](./docs/api/contract-methods.md)
- [Security](./docs/security.md)
- [Known issues](./docs/operations/known-issues.md)
- [Mainnet readiness report](./docs/mainnet-open-source-readiness-2026-04-26.md)

---

## Status

Uygulama kaynak kod seviyesinde aktif KMS + Lighthouse/IPFS + NEAR mimarisine gore
hazirlanmistir. Canli mainnet durumu public alpha seviyesindedir; production
ready veya tam merkeziyetsiz olarak sunulmadan once canli `upload -> purchase -> watch`
smoke testleri ve kalan operasyonel kontroller tamamlanmalidir.

Guncel karar kaynagi:

- [Mainnet and Open Source Readiness](./docs/mainnet-open-source-readiness-2026-04-26.md)
- [Known Issues](./docs/operations/known-issues.md)
