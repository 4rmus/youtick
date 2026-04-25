# Quick Start Guide

> Get YouTick running locally in minutes

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 20.9+ |
| npm | 9+ |
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
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=dev-1773607954211-252231.v2-0.utick.testnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=dev-1773607954211-252231.v2-0.utick.testnet
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access-1773606802388.v2-0.utick.testnet
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry-1773606802388.v2-0.utick.testnet
```

See full variable list in [Configuration Reference](./getting-started/configuration.md).

### 4. Start app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## First Run Flow

1. Connect wallet.
2. Upload video metadata and file.
3. For paid videos, app encrypts with AES-CTR, uploads ciphertext to IPFS, stores key material through KMS flow, then creates event/NFT on-chain.
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
cargo near build
cargo test
```

---

## Troubleshooting

### Wallet/session key issues

- Reconnect wallet and re-create session key.
- Upload session yetkisini yeniden olustur.

### KMS connection issues

- Confirm active KMS operators are registered in `NEXT_PUBLIC_REGISTRY_CONTRACT_ID`.
- If using local worker, register that worker endpoint in the test registry and ensure Wrangler dev server is running.

### IPFS playback issues

- Retry playback; gateway failover is automatic.
- Verify uploaded CID exists on `crustipfs.xyz` or fallback gateways.

---

## Next Steps

| Goal | Read |
|------|------|
| Understand architecture | [Architecture Overview](./architecture/README.md) |
| Storage & playback model | [Storage & Delivery](./architecture/storage.md) |
| Work on frontend modules | [Frontend](./frontend.md) |
| Contract internals | [Smart Contract Architecture](./architecture/smart-contract.md) |
