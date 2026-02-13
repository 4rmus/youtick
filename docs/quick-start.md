# Quick Start Guide

> **Get YouTick running locally in 5 minutes**

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18.0+ | Recommended: 20.x LTS |
| npm | 9.0+ | Comes with Node.js |
| Rust | Latest stable | Required for smart contract development only |
| NEAR CLI | Latest | `npm install -g near-cli` |
| NEAR Wallet | -- | [mynearwallet.com](https://app.mynearwallet.com) |

---

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/4rmus/youtick.git
cd youtick
```

### 2. Install Dependencies

```bash
cd apps/web
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Network Configuration
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick-prod-v1.near

# Nova Protocol
NEXT_PUBLIC_NOVA_NETWORK=mainnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk.near
NEXT_PUBLIC_NOVA_API_KEY=
NEXT_PUBLIC_NOVA_ACCOUNT_ID=

# Relayer (Optional - for sponsored transactions)
RELAYER_ACCOUNT_ID=relayer.youtick-prod-v1.near
RELAYER_PRIVATE_KEY=ed25519:...
```

For a full list of all environment variables and their descriptions, see the [Environment Reference](./guides/environment.md).

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## First Steps

### 1. Connect Wallet

1. Click "Connect Wallet" button
2. Choose MyNEARWallet
3. Approve connection

### 2. Upload Your First Video

1. Navigate to the upload page
2. Fill in video details (title, description, price)
3. Select a video file
4. Click "Upload Video"
5. The system will: create a Nova group, encrypt the video, upload to IPFS, and mint an NFT event on NEAR

### 3. Watch a Video

1. Browse available content
2. Find content you want to watch
3. Purchase an NFT ticket (costs NEAR)
4. The video will auto-decrypt for ticket holders

---

## Project Structure

```
youtick-demo/
├── apps/
│   └── web/                 # Next.js 16 frontend
│       ├── app/             # App Router pages and API routes
│       │   ├── api/         # API routes (nova-proxy, trial)
│       │   ├── claim/       # Gift claim page
│       │   ├── ticket/      # Ticket view pages
│       │   └── trial/       # Trial onboarding page
│       ├── components/      # React components
│       ├── hooks/           # Custom React hooks
│       └── lib/             # Core business logic
│           ├── nova/        # Nova Protocol integration
│           ├── crust/       # Crust Network storage
│           ├── crypto/      # Cryptographic utilities
│           ├── session-manager.ts # Session key management
│           └── gift-service.ts    # Gift link system
├── contracts/
│   └── nft-ticket/          # NEAR smart contract (Rust)
│       └── src/lib.rs       # Main contract
├── docs/                    # Documentation
└── scripts/                 # Utility scripts
```

---

## Common Commands

```bash
# Development
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run lint         # Run linter

# Contract (in contracts/nft-ticket/)
cargo near build     # Build contract WASM
cargo test           # Run contract tests

# View Contract State
near view youtick-prod-v1.near nft_metadata '{}'
near view youtick-prod-v1.near get_event '{"encrypted_cid":"YOUR_CID"}'
```

---

## Troubleshooting

### Wallet Connection Issues

```bash
# Clear localStorage and reconnect
localStorage.clear()
```

### Nova Protocol Errors

- Verify your Nova API key is set in `.env.local`
- Confirm network configuration matches (both NEAR and Nova should use the same network)
- Check that the Nova contract ID is correct (`nova-sdk.near` for mainnet)

### IPFS Upload Timeout

- Check network connectivity
- Verify file size is under 100MB for testing
- The system uses multi-gateway failover (Pinata, ipfs.io, dweb.link) automatically

### Session Key Errors

- Session keys expire after 24 hours -- reconnect your wallet to generate a new one
- Ensure your prepaid balance has sufficient funds for signless transactions

---

## Next Steps

| Goal | Read |
|------|------|
| Understand the full architecture | [Architecture Overview](./architecture/README.md) |
| Learn the upload/watch/purchase flows | [User Flows](./guides/user-flows.md) |
| Integrate with Nova SDK | [Nova SDK Guide](./guides/nova-sdk.md) |
| Work on the smart contract | [Smart Contract Architecture](./architecture/smart-contract.md) |
| Set up environment variables | [Environment Reference](./guides/environment.md) |

---

**Previous**: [Overview](./overview.md) | **Next**: [Architecture](./architecture/README.md)
