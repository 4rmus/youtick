# YouTick

> Public-alpha, hybrid decentralized video platform on NEAR with browser-side encryption, KMS-backed key custody and IPFS delivery

YouTick is an open-source VOD platform where creators upload encrypted videos to IPFS and sell access through NFT tickets. The active architecture is hybrid decentralized: NEAR stores ownership and access rules, the browser encrypts media, KMS workers custody threshold key shares on Cloudflare/KV, and Lighthouse is the write provider behind the Storage API Worker. Playback uses the Media Delivery Worker and public IPFS gateway fallback; the legacy Crust runtime fallback has been removed.

![NEAR Protocol](https://img.shields.io/badge/Blockchain-NEAR%20Protocol-00C1DE?style=flat&logo=near&logoColor=white)
![Rust](https://img.shields.io/badge/Contract-Rust-DEA584?style=flat&logo=rust&logoColor=white)
![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-000000?style=flat&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/Language-TypeScript%205-3178C6?style=flat&logo=typescript&logoColor=white)
![KMS](https://img.shields.io/badge/Encryption-Edge%20KMS-0EA5E9?style=flat)
![IPFS](https://img.shields.io/badge/Storage-IPFS%20%2B%20Lighthouse-65C2CB?style=flat&logo=ipfs&logoColor=white)

---

## Core Features

| Feature | Description |
|---------|-------------|
| NFT-Gated Access | Ticket ownership is recorded on-chain |
| 98% Creator Payout | The bulk of revenue goes to the creator |
| Browser Encryption | Media is encrypted in the browser |
| Threshold Key Custody | Keys are split (SSS) across multiple KMS operators |
| Lighthouse/IPFS Delivery | Encrypted media is read via the Storage API and multiple gateways |
| Gift Links | Shareable single-use claim links |
| Trial Accounts | Low-friction start through an onboarding key |
| Cross-Chain Checkout | Experimental 1Click + MetaMask path; opens only when `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true` |

---

## Architecture

```text
Browser App
  -> encrypts media
  -> uploads to Lighthouse/IPFS through Storage API
  -> splits/reconstructs keys via multiple KMS operators
  -> reads/writes ownership on NEAR
```

Core components:

- `apps/web` — Next.js 16 frontend (HOT Connect, signless access keys)
- `workers/youtick-kms` — 5 KMS operator workers
- `workers/storage-api` — Lighthouse + NEP-413 upload challenge
- `workers/media-delivery` — encrypted IPFS manifest/segment routing
- `workers/web4-proxy` — Web4 + same-origin `/api/*` proxy
- `contracts/nft-ticket` — market + ticket + gift + trial (R2 split)
- `contracts/access-control` — session grant + scope policy
- `contracts/operator-registry` — KMS operator registry + threshold

Mainnet: `youtick.near`, `access.youtick.near`, `registry.youtick.near`.

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

KMS endpoints are not configured through env, and real operator configs
are kept out of git. The web app reads active operators from the
registry contract; if the registry can't be read, the KMS flow fails
closed and does not fall back to a fixed or stale endpoint. Cross-chain
checkout is off by default; `false`, empty or undefined values do not
open the path.

For the upload flow, `NEXT_PUBLIC_STORAGE_API_URL` must point at a
Storage API Worker, and the worker side must have Lighthouse secrets
and an upload guard ready. If you only want to try UI or wallet flows,
this step can be deferred.

---

## Useful Docs

- [Docs index](./docs/README.md)
- [Public alpha user guide](./docs/public/alpha-user-guide.md)
- [Architecture overview (public)](./docs/public/architecture-overview.md)
- [System architecture](./docs/architecture/README.md)
- [Storage and delivery](./docs/architecture/storage.md)
- [Quick start](./docs/quick-start.md)
- [Configuration](./docs/getting-started/configuration.md)
- [Contract methods](./docs/api/contract-methods.md)
- [Security](./docs/security.md)
- [Public alpha limits](./docs/operations/known-issues.md)
- [Open source release checklist](./docs/open-source-release.md)

---

## Status

YouTick is public-alpha software. The repository contains the web app, workers
and contracts for encrypted upload, ticket purchase and playback, but it should
not be described as production-ready, independently audited or fully
decentralized.

Current public sources of truth:

- [Public Alpha Limits](./docs/operations/known-issues.md)
- [Transparency](./docs/public/transparency.md)
- [Release Runbook](./docs/release-runbook.md)
