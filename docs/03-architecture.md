# System Architecture

> **Three-Layer Decentralized Architecture**

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER BROWSER                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    NEXT.JS APPLICATION                           │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │  Pages   │  │Components│  │  Hooks   │  │   Lib    │        │    │
│  │  │(App Dir) │  │  (UI)    │  │ (Logic)  │  │(Services)│        │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│    NEAR PROTOCOL     │ │   LIT PROTOCOL   │ │   IPFS/LIGHTHOUSE    │
│                      │ │                  │ │                      │
│ • Wallet Connection  │ │ • PKP Management │ │ • Encrypted Storage  │
│ • NFT Minting        │ │ • Encryption     │ │ • CID Addressing     │
│ • Payment Processing │ │ • Access Control │ │ • Perpetual Storage  │
│ • Session Keys       │ │ • Lit Actions    │ │                      │
│ • Chain Signatures   │ │                  │ │                      │
└──────────────────────┘ └──────────────────┘ └──────────────────────┘
         │                        │                      │
         └────────────────────────┼──────────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │      SMART CONTRACT       │
                    │    v1.utick.testnet       │
                    │                           │
                    │ • NEP-171 NFT Standard    │
                    │ • Event Management        │
                    │ • Prepaid Balance         │
                    │ • Gift Drops              │
                    └───────────────────────────┘
```

## Layer Details

### Layer 1: Frontend (Presentation)

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | Next.js 16.0.10 | Server-side rendering, routing |
| UI Library | React 19.2.3 | Component architecture |
| Styling | Tailwind CSS 4.x | Utility-first CSS |
| Icons | Lucide React | Consistent iconography |
| Dialogs | Radix UI | Accessible modals |

**Key Files:**
- `app/` - Page components (App Router)
- `components/` - Reusable UI components
- `hooks/` - Custom React hooks
- `lib/` - Business logic and services

### Layer 2: Infrastructure (Services)

#### NEAR Protocol Integration
```typescript
// Connection Configuration
const near = {
  networkId: "testnet",
  nodeUrl: "https://test.rpc.fastnear.com",
  walletUrl: "https://testnet.mynearwallet.com",
  contractId: "v1.utick.testnet"
};
```

**Responsibilities:**
- Wallet authentication
- NFT minting and transfers
- Payment processing (98% creator, 2% platform)
- Session key management for signless UX

#### Lit Protocol Integration
```typescript
// Lit Network Configuration
const litConfig = {
  network: "datil-dev",  // Testnet
  chain: "ethereum",
  authMethods: ["near"],
  pkpMinting: "relay" | "direct"
};
```

**Responsibilities:**
- Client-side encryption (AES-256-GCM)
- Programmable Key Pairs (PKP)
- Access Control Conditions (ACC)
- Lit Actions for on-chain verification

#### IPFS/Lighthouse Integration
```typescript
// Lighthouse Configuration
const lighthouseConfig = {
  apiKey: process.env.LIGHTHOUSE_API_KEY,
  gateway: "https://gateway.lighthouse.storage",
  encryption: "lit"  // Use Lit for encryption, not Lighthouse native
};
```

**Responsibilities:**
- Encrypted video storage
- Content ID (CID) generation
- Perpetual storage guarantee

### Layer 3: Smart Contract (Blockchain)

**Contract**: `v1.utick.testnet`
**Language**: Rust (NEAR SDK 5.1.0)
**Standard**: NEP-171 (NFT)

```rust
// Core Data Structures
pub struct Event {
    pub title: String,
    pub description: String,
    pub encrypted_cid: String,
    pub price: U128,
    pub creator: AccountId,
    pub tickets_sold: u64,
}

pub struct VideoMetadata {
    pub encrypted_cid: String,
    pub thumbnail_cid: Option<String>,
    pub duration_seconds: Option<u64>,
}
```

## Data Flow Diagrams

### Video Upload Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Select  │───▶│  Create  │───▶│ Encrypt  │───▶│  Upload  │───▶│   Mint   │
│  Video   │    │ Session  │    │  (Lit)   │    │  (IPFS)  │    │   NFT    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
     │         MPC Derivation   AES-256-GCM    Returns CID      On-Chain
     │         (Chain Sig)                                      Event Created
```

### Video Watch Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Request │───▶│  Check   │───▶│ Verify   │───▶│ Decrypt  │───▶│  Stream  │
│  Watch   │    │   NFT    │    │  (Lit)   │    │  Video   │    │  Video   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
     │          Contract View    Lit Action      IPFS Fetch      Browser
     │          nft_tokens()     Ownership       + Decrypt       Playback
```

### Payment Flow

```
Buyer pays 5 NEAR
        │
        ▼
┌───────────────────┐
│  Smart Contract   │
│  buy_ticket()     │
└───────────────────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
┌──────┐  ┌──────┐
│ 4.9N │  │ 0.1N │
│Creator│  │ Plat │
│ (98%) │  │ (2%) │
└──────┘  └──────┘
```

## Security Model

| Layer | Security Measure |
|-------|------------------|
| Transport | HTTPS everywhere |
| Storage | AES-256-GCM encryption |
| Access | NFT ownership verification |
| Keys | MPC (no single point of failure) |
| Sessions | 7-day max, scoped permissions |

## Scalability

| Metric | Current Capacity | Notes |
|--------|------------------|-------|
| Concurrent Users | ~1,000 | Limited by RPC rate limits |
| Storage | Unlimited | IPFS scales horizontally |
| Transactions | ~1,000 TPS | NEAR Protocol limit |
| Video Size | 100MB recommended | Lighthouse limit |

---

**Previous**: [← Quick Start](./02-quick-start.md) | **Next**: [NEAR Integration →](./04-near-integration.md)
