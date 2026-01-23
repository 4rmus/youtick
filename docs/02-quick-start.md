# Quick Start Guide

> **Get YouTick running locally in 5 minutes**

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18.0+ | Recommended: 20.x LTS |
| npm | 9.0+ | Comes with Node.js |
| NEAR Wallet | - | [testnet.mynearwallet.com](https://testnet.mynearwallet.com) |
| Lighthouse API Key | - | [lighthouse.storage](https://lighthouse.storage) |

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
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=v1.utick.testnet

# Lit Protocol
NEXT_PUBLIC_LIT_ACTION_IPFS_CID=your_lit_action_cid
NEXT_PUBLIC_LIT_CAPACITY_TOKEN_ID=your_capacity_token
LIT_DELEGATION_WALLET_PRIVATE_KEY=0x...

# Storage
LIGHTHOUSE_API_KEY=your_lighthouse_api_key

# Relayer (Optional - for sponsored transactions)
RELAYER_ACCOUNT_ID=relayer.v1.utick.testnet
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
│           ├── lit.ts       # Lit Protocol
│           ├── near.ts      # NEAR integration
│           └── lighthouse.ts # IPFS storage
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
near view v1.utick.testnet nft_metadata '{}'
near view v1.utick.testnet get_event '{"encrypted_cid":"YOUR_CID"}'
```

## Troubleshooting

### Wallet Connection Issues
```bash
# Clear localStorage and reconnect
localStorage.clear()
```

### Lit Protocol Errors
- Check if `LIT_DELEGATION_WALLET_PRIVATE_KEY` is set
- Verify Lit Action CID is correct and pinned

### IPFS Upload Timeout
- Check `LIGHTHOUSE_API_KEY` is valid
- Verify file size is under 100MB for testing

---

**Previous**: [← Overview](./01-overview.md) | **Next**: [Architecture →](./03-architecture.md)
