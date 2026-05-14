# Quick Start Guide

> Get YouTick running locally in minutes

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 24 LTS |
| npm | 10+ |
| Rust (optional) | Stable |
| NEAR wallet | Any supported wallet |

---

## Installation

### 1. Clone

```bash
git clone https://github.com/4rmus/youtick.git
cd youtick
```

### 2. Install frontend dependencies

```bash
cd apps/web
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Minimum `.env.local`:

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=false
# Required for real upload; can be omitted if you only test navigation/wallet UI.
# NEXT_PUBLIC_STORAGE_API_URL=http://localhost:8788
```

See full variable list in [Configuration Reference](./getting-started/configuration.md).
Cross-chain checkout only opens when this value is exactly `true`; the default
local flow is NEAR-first.

### 4. Start app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Enable real upload

Upload is Lighthouse-primary in the current source. For a real upload smoke
test:

1. Run or deploy `workers/storage-api`.
2. Configure its Lighthouse secret + `UPLOAD_AUTH_SECRET` (NEP-413 upload
   challenge — required after SB-1).
3. Set `NEXT_PUBLIC_STORAGE_API_URL` in `apps/web/.env.local`.

Without these, the worker rejects `/uploads/intent` with `Unauthorized`.
Navigation and wallet screens still run locally; upload won't complete.

---

## First Run Flow

1. Connect wallet.
2. Upload video metadata and file.
3. For paid videos, app encrypts with AES-CTR, uploads ciphertext to Lighthouse/IPFS through the Storage API, stores key material through KMS flow, then creates event/NFT on-chain.
4. Browse from `/discover` and open `/watch`.

---

## Common Commands

```bash
# Frontend
npm run dev
npm run build
npm run lint
npm run test -- --run

# Contract (optional)
cd ../../contracts/nft-ticket
cargo near build non-reproducible-wasm   # matches mainnet R2 deploy
cargo test --lib
cargo test --test sandbox
```

---

## Troubleshooting

### Wallet/session key issues

- Reconnect wallet and re-create session key.
- Upload session yetkisini yeniden olustur.

### KMS connection issues

- Confirm active KMS operators are registered in `NEXT_PUBLIC_REGISTRY_CONTRACT_ID`.
- If using testnet or a local worker, deploy your own market/access/registry set, register that worker endpoint via `propose_action` + 24h timelock + `execute_action`, and ensure Wrangler dev server is running.
- `SIGNLESS_PLAYBACK_UNAVAILABLE` in the player means the local signless access key was lost; reconnect the wallet to mint a new one.

### IPFS playback issues

- Retry playback; gateway failover is automatic.
- Verify uploaded CID exists through the Storage API status endpoint or fallback gateways.

### Web4 API issues

- `youtick.net` uses the Web4 proxy and supports `/api/onboarding-key` plus `/api/crust/*`.
- Direct `youtick.near.page` or raw IPFS gateway URLs are static-only and do not support onboarding/storage-order API calls.

---

## Next Steps

| Goal | Read |
|------|------|
| Understand architecture | [Architecture Overview](./architecture/README.md) |
| Storage & playback model | [Storage & Delivery](./architecture/storage.md) |
| Work on frontend modules | [Frontend](./frontend.md) |
| Contract internals | [Smart Contract Architecture](./architecture/smart-contract.md) |
