# YouTick

> **Decentralized Video-on-Demand Platform on NEAR Protocol**

YouTick is an open-source decentralized VOD platform where creators upload encrypted videos to IPFS and monetize through NFT-gated access. Built on NEAR Protocol with client-side encryption, Cloudflare Edge KMS key custody, and Crust-backed IPFS storage, it delivers 98% revenue to creators.

![NEAR Protocol](https://img.shields.io/badge/Blockchain-NEAR%20Protocol-00C1DE?style=flat&logo=near&logoColor=white)
![Rust](https://img.shields.io/badge/Contract-Rust-DEA584?style=flat&logo=rust&logoColor=white)
![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-000000?style=flat&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/Language-TypeScript%205-3178C6?style=flat&logo=typescript&logoColor=white)
![KMS](https://img.shields.io/badge/Encryption-Edge%20KMS-0EA5E9?style=flat)
![IPFS](https://img.shields.io/badge/Storage-IPFS%20%2B%20Crust-65C2CB?style=flat&logo=ipfs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)

---

## Key Features

| Feature | Description |
|---------|-------------|
| **NFT-Gated Video** | NEP-171 compliant NFT tickets grant permanent, transferable video access |
| **Revenue Split** | 98% to creator, 1% trial pool, 1% commission — enforced on-chain, instant settlement |
| **Signless UX** | NEAR Session Keys eliminate wallet pop-ups after one-time setup |
| **Encryption + KMS** | Client-side AES encryption with Cloudflare Edge KMS-backed key custody |
| **Gift Drops** | Access-key-based shareable gift links — no recipient wallet required |
| **Trial Accounts** | Sponsored onboarding for new users — zero crypto knowledge needed |
| **Prepaid Balance** | Gas tank for session key operations — deposit once, transact signlessly |
| **wNEAR Payments** | Purchase tickets with wrapped NEAR via NEP-141 `ft_on_transfer` |
| **Content Moderation** | On-chain ban system with typed `BanReason` enum |
| **Purchase Audit Trail** | Full on-chain purchase logs with buyer, creator, and amount tracking |
| **Multi-Gateway IPFS** | 7+ gateway failover for reliable decentralized content delivery |
| **Cross-Chain Payments** | EVM chain integration via Wagmi/Viem (experimental) |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                          │
│   Next.js 16  ·  React 19  ·  TypeScript 5  ·  Tailwind 4   │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Upload   │  │  Player  │  │ Purchase │  │ Gift/Trial │  │
│  │  Form     │  │  (IPFS)  │  │  Card    │  │   Claim    │  │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬──────┘  │
│        └──────────────┴─────────────┴─────────────┘          │
│                           │                                   │
│  ┌────────────────────────┴────────────────────────────────┐ │
│  │  KMS Client · Session Manager · Gift Service · Crust SDK │ │
│  └────────────────────────┬────────────────────────────────┘ │
└───────────────────────────┼──────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
     ┌──────┴──────┐ ┌─────┴─────┐ ┌──────┴──────┐
     │    NEAR     │ │    KMS    │ │    IPFS     │
     │  Protocol   │ │  Worker   │ │   (Crust)   │
     │             │ │ + KV/Auth │ │             │
     │ NFT Tickets │ │ AES-256   │ │ Encrypted   │
     │ Payments    │ │ Group     │ │ Video Blobs │
     │ Sessions    │ │ Access    │ │ Multi-GW    │
     │ Gift Drops  │ │ Key Mgmt  │ │ Failover    │
     └─────────────┘ └───────────┘ └─────────────┘
```

**Core Principles:**
- **Client-First UX** — Core media and ticket flows run in-browser, with minimal backend services for KMS and sponsored onboarding
- **Key Custody Security** — Encryption keys are stored and served via authenticated KMS access checks
- **On-Chain Access Control** — NFT ownership = decryption permission
- **Multi-Layer Failover** — RPC endpoints and IPFS gateways with automatic retry

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | Next.js (App Router) | 16.0.10 |
| UI | React | 19.2.3 |
| Styling | Tailwind CSS | 4.x |
| Language | TypeScript | 5.x |
| Blockchain | NEAR Protocol | Mainnet |
| Smart Contract | Rust (NEAR SDK) | 5.5.0 |
| NFT Standard | NEP-171 / 177 / 178 | — |
| Encryption | Browser AES + KMS | AES-CTR chunked |
| Storage | IPFS (Crust Network) | Multi-gateway |
| Wallet | NEAR Wallet Selector | 10.1.4 |
| Data Fetching | TanStack React Query | 5.x |

---

## Quick Start

### Prerequisites

- Node.js 18+ (LTS)
- Git
- A NEAR wallet ([mynearwallet.com](https://app.mynearwallet.com))

### Installation

```bash
# Clone
git clone https://github.com/4rmus/youtick.git
cd youtick

# Install frontend dependencies
cd apps/web
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local — see docs/getting-started/configuration.md

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Contract Development (Optional)

```bash
# Install Rust + WASM target
rustup target add wasm32-unknown-unknown

# Build contract
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release

# Run contract tests
cargo test
```

> See [docs/getting-started/installation.md](docs/getting-started/installation.md) for the full setup guide.

---

## Project Structure

```
youtick/
├── apps/web/                    # Next.js 16 frontend application
│   ├── app/                     # App Router pages
│   │   ├── claim/               # Gift claim page
│   │   ├── discover/            # Video discovery
│   │   ├── profile/             # User dashboard
│   │   ├── ticket/              # Ticket view/redirect
│   │   ├── upload/              # Video upload
│   │   ├── watch/               # Video playback
│   │   ├── trial/               # Trial onboarding
│   │   └── api/                 # API routes (trial, sponsored)
│   ├── components/              # 54+ React components
│   │   ├── UploadForm.tsx       # Multi-step upload with encryption
│   │   ├── IpfsPlayer.tsx       # Decrypted video playback
│   │   ├── TicketPurchaseCard.tsx # Purchase UI with cost breakdown
│   │   ├── GiftLinkGenerator.tsx # Gift link creation
│   │   └── VideoCard.tsx        # Reusable video card (grid/slider)
│   ├── hooks/                   # Custom React hooks
│   │   ├── useAllVideos.ts      # Paginated video listing
│   │   ├── useOwnedTokens.ts   # NFT ownership queries
│   │   ├── useNearPrice.ts     # NEAR/USD conversion
│   │   └── useSessionState.ts   # Session/access state sync
│   └── lib/                     # Business logic
│       ├── kms/                 # Cloudflare Edge KMS integration
│       ├── crust/               # Crust Network storage (7 modules)
│       ├── crypto/              # AES-GCM + AES-CTR chunked encryption
│       ├── session-manager.ts   # Session key lifecycle
│       ├── gift-service.ts      # Gift link generation
│       └── batch-transactions.ts # Transaction batching
├── contracts/
│   └── nft-ticket/              # NEAR smart contract (Rust)
│       ├── src/lib.rs           # Main contract (2400+ lines, V8)
│       └── tests/               # Integration tests
├── docs/                        # Modular documentation
│   ├── architecture/            # System design
│   ├── guides/                  # How-to guides
│   ├── api/                     # API reference
│   └── getting-started/         # Setup guides
├── scripts/                     # Deployment & utility scripts
└── mcp-servers/                 # MCP server integrations
```

---

## Smart Contract

**Contract ID:** `youtick.near` (Mainnet)
**Language:** Rust · **NEAR SDK:** 5.5.0 · **Storage Version:** V8

### Key Methods

| Category | Methods |
|----------|---------|
| **Events** | `create_event`, `create_event_prepaid`, `get_event`, `get_events_paginated` |
| **Tickets** | `buy_ticket`, `buy_ticket_prepaid`, `gift_ticket`, `nft_mint` |
| **Prepaid** | `deposit_funds`, `withdraw_funds`, `get_user_balance` |
| **Gift Drops** | `create_gift_drop`, `claim_gift`, `claim_gift_and_create_account` |
| **Trial** | `create_sponsored_trial_direct`, `claim_free_ticket_direct`, `upgrade_trial_account` |
| **wNEAR** | `ft_on_transfer` (NEP-141 receiver) |
| **Admin** | `ban_event` |
| **NEP-171** | Full NFT standard (core, enumeration, approval) |

### Commission Structure

```
Ticket Price
├── 98%  → Creator (instant transfer)
├── 1%   → Trial Account Pool (funds new user onboarding)
└── 1%   → Commission Pool (owner-withdrawable)

Additional costs per ticket:
├── 0.01 NEAR  → NFT storage deposit
└── 0-0.1 NEAR → Platform service fee (configurable)
```

> See [docs/architecture/smart-contract.md](docs/architecture/smart-contract.md) for the complete V8 specification.

---

## User Flows

### Upload
1. Connect wallet → Create Session Key (one signature)
2. Generate AES key in browser
3. Encrypt video client-side (AES-CTR chunked)
4. Upload encrypted blob to IPFS (Crust Network)
5. Store key in KMS + mint NFT/create event on NEAR (signless via session key)

### Purchase
1. Browse `/discover` → Select video
2. Buy ticket (direct NEAR, prepaid balance, or wNEAR)
3. Smart contract splits payment: 98% creator / 1% trial pool / 1% commission
4. NFT ticket minted to buyer's wallet
5. Access unlocked via on-chain ownership checks

### Watch
1. Open video → Verify NFT ownership on-chain
2. Request decryption key from KMS with signed session key
3. Fetch encrypted blob from IPFS (multi-gateway failover)
4. Decrypt in browser and stream progressively

### Gift
1. Creator generates gift links (`create_gift_drop`)
2. Share link → Recipient opens `/claim#key=...`
3. Claim with new account (sponsored) or existing wallet
4. NFT minted and watch access granted

> See [docs/guides/user-flows.md](docs/guides/user-flows.md) for detailed sequence diagrams.

---

## Security

- **Client-Side Encryption** — Videos encrypted in browser before upload; raw content never transmitted
- **KMS Key Management** — Decryption keys served by authenticated Edge KMS checks
- **NFT Ownership Verification** — On-chain proof required before decryption
- **Session Key Scoping** — Function-call access keys limited to contract methods + 1 NEAR allowance
- **Signless Withdrawal Cap** — Maximum 0.1 NEAR per session key withdrawal
- **Rate Limiting** — Daily trial account creation limits (configurable)
- **Content Moderation** — On-chain ban system with typed reasons

> See [docs/security.md](docs/security.md) for the complete security model.

---

## Cost Comparison

| Cost Category | Traditional VOD | YouTick |
|---------------|:---------------:|:-------:|
| Servers | $5,000/mo | $0 |
| CDN / Bandwidth | $2,000/mo | IPFS (included) |
| Storage | $1,000/mo | ~$4/GB one-time |
| Payment Processing | 2.9% + $0.30/tx | ~$0.01/tx (gas) |
| DRM / Encryption | $500/mo | Edge KMS (included) |
| **Total (10K users)** | **~$8,500/mo** | **~$200 one-time** |

---

## Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

- [Overview](docs/overview.md) — Platform introduction
- [Getting Started](docs/getting-started/installation.md) — Installation and setup
- [Architecture](docs/architecture/README.md) — System design
- [Smart Contract](docs/architecture/smart-contract.md) — V8 contract specification
- [User Flows](docs/guides/user-flows.md) — End-to-end flow diagrams
- [API Reference](docs/api/contract-methods.md) — Contract method reference
- [Security](docs/security.md) — Security model and threat analysis
- [Testing](docs/testing.md) — Test infrastructure and guide
- [Contributing](docs/contributing.md) — Contribution guidelines
- [Roadmap](docs/roadmap.md) — Development roadmap

---

## Contributing

We welcome contributions. See [CONTRIBUTING](docs/contributing.md) for guidelines.

```bash
# Fork → Clone → Branch → Code → Test → PR
git checkout -b feature/your-feature
npm test
git push origin feature/your-feature
```

---

## License

[MIT License](LICENSE)

---

## Links

- [NEAR Protocol](https://near.org) — Layer 1 blockchain
- [Crust Network](https://crust.network) — Decentralized IPFS storage

---

**Contract:** `youtick.near` · **Network:** NEAR Mainnet · **Encryption:** Browser AES + Edge KMS

*Own Your Content. Own Your Audience. Own Your Revenue.*
