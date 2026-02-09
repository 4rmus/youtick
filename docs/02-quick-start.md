# Quick Start Guide

> **Get YouTick running locally in 5 minutes**

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18.0+ | Recommended: 20.x LTS |
| npm | 9.0+ | Comes with Node.js |
| NEAR Wallet | - | [mynearwallet.com](https://app.mynearwallet.com) |

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/4rmus/youtick-mvp.git
cd youtick-mvp
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

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## First Steps

### 1. Connect Wallet
1. Click "Connect Wallet" button
2. Choose MyNEARWallet
3. Approve connection

### 2. Upload Your First Video
1. Navigate to `/upload`
2. Fill in video details (title, description, price)
3. Select video file
4. Click "Upload Video"
5. Wait for encryption and upload (progress shown)

### 3. Watch a Video
1. Browse `/discover`
2. Find content you want to watch
3. Purchase ticket (costs NEAR)
4. Video will auto-decrypt for ticket holders

## Project Structure

```
youtick-mvp/
├── apps/
│   └── web/                 # Next.js frontend
│       ├── app/             # App Router pages
│       │   ├── page.tsx     # Landing page
│       │   ├── upload/      # Upload flow
│       │   ├── discover/    # Browse videos
│       │   ├── watch/       # Video playback
│       │   └── profile/     # User dashboard
│       ├── components/      # React components
│       ├── hooks/           # Custom hooks
│       └── lib/             # Business logic
│           ├── nova/        # Nova Protocol
│           ├── near.ts      # NEAR integration
│           └── session-manager.ts # Session Keys
├── contracts/
│   └── nft-ticket/          # NEAR smart contract
│       └── src/lib.rs       # Rust contract
└── docs/                    # Documentation
```

## Common Commands

```bash
# Development
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run lint         # Run linter

# Contract (in contracts/nft-ticket/)
cargo build --target wasm32-unknown-unknown --release
cargo test           # Run contract tests

# View Contract
near view youtick-prod-v1.near nft_metadata '{}'
near view youtick-prod-v1.near get_event '{"encrypted_cid":"YOUR_CID"}'
```

## Troubleshooting

### Wallet Connection Issues
```bash
# Clear localStorage and reconnect
localStorage.clear()
```

### Nova Protocol Errors
- Check Nova API key configuration
- Verify network configuration matches (mainnet)

### IPFS Upload Timeout
- Check network connectivity
- Verify file size is under 100MB for testing
- Try alternate IPFS gateway

---

**Previous**: [← Overview](./01-overview.md) | **Next**: [Architecture →](./03-architecture.md)
