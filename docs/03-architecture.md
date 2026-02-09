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
│    NEAR PROTOCOL     │ │  NOVA PROTOCOL   │ │      IPFS            │
│                      │ │                  │ │                      │
│ • Wallet Connection  │ │ • TEE Encryption │ │ • Encrypted Storage  │
│ • NFT Minting        │ │ • Group Access   │ │ • CID Addressing     │
│ • Payment Processing │ │ • Key Management │ │ • Perpetual Storage  │
│ • Session Keys       │ │ • Shade Agent    │ │                      │
└──────────────────────┘ └──────────────────┘ └──────────────────────┘
         │                        │                      │
         └────────────────────────┼──────────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │      SMART CONTRACT       │
                    │   youtick-prod-v1.near    │
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
  networkId: "mainnet",
  nodeUrl: "https://free.rpc.fastnear.com",
  walletUrl: "https://app.mynearwallet.com",
  contractId: "youtick-prod-v1.near"
};
```

**Responsibilities:**
- Wallet authentication
- NFT minting and transfers
- Payment processing (98% creator, 2% platform)
- Session key management for signless UX

#### Nova Protocol Integration
```typescript
// Nova Network Configuration
const novaConfig = {
  networkId: "mainnet",
  contractId: "nova-sdk.near",
};
```

**Responsibilities:**
- TEE-based encryption (AES-256-GCM)
- Group-based access control
- Shade Agent key management
- Automatic key rotation on member changes

#### IPFS Integration
```typescript
// IPFS Gateway Configuration
const ipfsConfig = {
  gateway: "https://gateway.pinata.cloud/ipfs",
  fallbackGateways: [
    "https://ipfs.io/ipfs",
    "https://dweb.link/ipfs"
  ]
};
```

**Responsibilities:**
- Encrypted video storage
- Content ID (CID) generation
- Perpetual storage guarantee

### Layer 3: Smart Contract (Blockchain)

**Contract**: `youtick-prod-v1.near`
**Language**: Rust (NEAR SDK 5.1.0)
**Standard**: NEP-171 (NFT)

```rust
// Core Data Structures
pub struct Event {
    pub title: String,
    pub description: String,
    pub encrypted_cid: String,
    pub nova_group_id: String,  // Nova access group
    pub price: U128,
    pub creator: AccountId,
    pub tickets_sold: u64,
}

pub struct VideoMetadata {
    pub encrypted_cid: String,
    pub nova_group_id: String,
    pub thumbnail_cid: Option<String>,
    pub duration_seconds: Option<u64>,
}
```

## Data Flow Diagrams

### Video Upload Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Select  │───▶│  Create  │───▶│ Encrypt  │───▶│  Upload  │───▶│   Mint   │
│  Video   │    │  Group   │    │  (Nova)  │    │  (IPFS)  │    │   NFT    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
     │          Nova Group       AES-256-GCM    Returns CID      On-Chain
     │          Creation         via TEE                         Event Created
```

### Video Watch Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Request │───▶│  Check   │───▶│  Verify  │───▶│ Decrypt  │───▶│  Stream  │
│  Watch   │    │   NFT    │    │  (Nova)  │    │  Video   │    │  Video   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
     │          Contract View    Shade Agent      IPFS Fetch      Browser
     │          nft_tokens()     Membership       + Decrypt       Playback
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
| Storage | AES-256-GCM encryption via Nova TEE |
| Access | NFT ownership + Nova group membership |
| Keys | TEE isolation (no single point of failure) |
| Sessions | 7-day max, scoped permissions |

## Scalability

| Metric | Current Capacity | Notes |
|--------|------------------|-------|
| Concurrent Users | ~1,000 | Limited by RPC rate limits |
| Storage | Unlimited | IPFS scales horizontally |
| Transactions | ~1,000 TPS | NEAR Protocol limit |
| Video Size | 100MB recommended | Gateway limit |

---

**Previous**: [← Quick Start](./02-quick-start.md) | **Next**: [NEAR Integration →](./04-near-integration.md)
