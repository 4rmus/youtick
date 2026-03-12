# Quick Start Guide

> Get YouTick running locally in minutes

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ |
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
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ONBOARDING_KEY=ed25519:...
# Optional: override KMS worker endpoint
NEXT_PUBLIC_KMS_URL=http://localhost:8787
```

See full variable list in [Environment Reference](./guides/environment.md).

### 4. Start app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## First Run Flow

1. Connect wallet.
2. Upload video metadata and file.
3. For paid videos, app encrypts with AES-CTR, uploads ciphertext to IPFS, stores key in KMS, then creates event/NFT on-chain.
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
- Ensure prepaid balance is sufficient for signless operations.

### KMS connection issues

- Confirm `NEXT_PUBLIC_KMS_URL` is reachable.
- If using local worker, ensure Wrangler dev server is running.

### IPFS playback issues

- Retry playback; gateway failover is automatic.
- Verify uploaded CID exists on `crustipfs.xyz` or fallback gateways.

---

## Next Steps

| Goal | Read |
|------|------|
| Understand architecture | [Architecture Overview](./architecture/README.md) |
| Follow user journeys | [User Flows](./guides/user-flows.md) |
| Work on frontend modules | [Frontend](./frontend.md) |
| Contract internals | [Smart Contract Architecture](./architecture/smart-contract.md) |
