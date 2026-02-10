# Architecture Overview

> YouTick System Architecture, Component Design, and Data Flows

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           YouTick Platform                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │   Creator    │    │    Viewer    │    │  Gift Link   │               │
│  │   Upload     │    │    Watch     │    │   Claimer    │               │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘               │
│         │                   │                   │                        │
│         ▼                   ▼                   ▼                        │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │                    Frontend (Next.js 16)                      │       │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐              │       │
│  │  │ UploadForm │  │ IpfsPlayer │  │  ClaimPage │              │       │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘              │       │
│  └────────┼───────────────┼───────────────┼─────────────────────┘       │
│           │               │               │                              │
│           ▼               ▼               ▼                              │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                      Core Libraries                             │     │
│  │                                                                 │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐     │     │
│  │  │  Nova SDK   │  │   IPFS      │  │  Session Manager    │     │     │
│  │  │ (Encrypt)   │  │  (Storage)  │  │  (NEAR Session Key) │     │     │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘     │     │
│  │         │                │                    │                 │     │
│  │  ┌──────┴──────┐  ┌──────┴──────┐  ┌─────────┴─────────┐       │     │
│  │  │ Shade Agent │  │ Multi-GW    │  │ Signless Txns     │       │     │
│  │  │ (TEE Keys)  │  │ (Failover)  │  │ (Function Keys)   │       │     │
│  │  └─────────────┘  └─────────────┘  └───────────────────┘       │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Decentralized Services                             │
├───────────────────┬───────────────────┬──────────────────────────────────┤
│   NEAR Protocol   │       IPFS        │      Nova Protocol               │
│                   │                   │                                   │
│ ┌───────────────┐ │ ┌───────────────┐ │ ┌─────────────────────────────┐  │
│ │ NFT Contract  │ │ │ IPFS Gateways │ │ │ Shade Agent (Phala TEE)     │  │
│ │ (youtick-     │ │ │               │ │ │ - AES-256-GCM Encryption    │  │
│ │  prod-v1.near)│ │ │ Upload:       │ │ │ - Group-based Access        │  │
│ │               │ │ │ Crust Network │ │ │ - Automatic Key Rotation    │  │
│ │ - Events      │ │ │               │ │ │ - NEAR Auth Verification    │  │
│ │ - Tickets     │ │ │ Retrieval:    │ │ └─────────────────────────────┘  │
│ │ - Prepaid     │ │ │ pinata.cloud  │ │                                   │
│ │ - Gifts       │ │ │ ipfs.io       │ │ ┌─────────────────────────────┐  │
│ │ - Trials      │ │ │ dweb.link     │ │ │ Nova Contract               │  │
│ └───────────────┘ │ └───────────────┘ │ │ (nova-sdk.near)             │  │
│                   │                   │ │ - Group Management          │  │
│                   │                   │ │ - Member Access Control     │  │
│                   │                   │ └─────────────────────────────┘  │
└───────────────────┴───────────────────┴──────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Frontend | Next.js | 16.0.10 | App Router, React Server Components |
| Frontend | React | 19.2.3 | UI Components |
| Frontend | TypeScript | 5.x | Type Safety |
| Frontend | Tailwind CSS | 4.x | Utility-first styling |
| Blockchain | NEAR Protocol | Mainnet | Smart Contract, Payments, Session Keys |
| Blockchain | near-api-js | 7.x | NEAR JavaScript SDK |
| Contract | Rust + NEAR SDK | 5.1.0 | Smart Contract development |
| Storage | IPFS | Crust Network | Decentralized encrypted video storage |
| Encryption | Nova Protocol | TEE | AES-256-GCM via Shade Agent |

---

## Core Principles

### Client-Side Decentralization

All operations run in the user's browser with no server-side dependencies:

| Operation | Method | Server Required |
|-----------|--------|:---------------:|
| Video Upload | Nova encrypt + IPFS (Crust) | No |
| Video Retrieval | Multi-gateway failover | No |
| Encryption/Decryption | Nova SDK (TEE Shade Agent) | No |
| NFT Minting | Session Key → NEAR contract | No |
| Payments | NEAR smart contract (98/2 split) | No |
| Gift Claims | Access Key drops (client-side) | No |
| Trial Creation | Onboarding Key (on-chain) | No |
| Group Access | Nova SDK (client-side) | No |
| RPC Communication | Multi-endpoint failover | No |

### Signless UX via Session Keys

Session Keys eliminate wallet pop-ups after initial setup:

```
1. User connects wallet (one-time)
2. Generate Function Call Access Key
3. Store key locally in browser
4. All future transactions use local key
5. No more wallet confirmations until key expires (24h)
```

See [Session Keys](./session-keys.md) for full implementation details.

### Token-Gated Access via Nova Groups

NFT ownership controls content access through Nova encryption groups:

```
1. Creator uploads → Nova creates encryption group
2. Creator encrypts video → uploads encrypted blob to IPFS
3. Buyer purchases NFT ticket on NEAR
4. Smart contract + Nova SDK add buyer to encryption group
5. Nova TEE decrypts content for verified group members
```

See [Nova Protocol](./nova-protocol.md) for the encryption architecture.

---

## Component Architecture

### Frontend Layer

```
apps/web/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── nova-proxy/     # Nova SDK proxy
│   │   └── trial/          # Trial account endpoints
│   ├── claim/              # Gift claim page
│   ├── ticket/             # Ticket view pages
│   └── trial/              # Trial onboarding page
├── components/
│   ├── UploadForm.tsx      # Video upload with Nova encryption
│   ├── IpfsPlayer.tsx      # Decrypted video playback
│   ├── MintButton.tsx      # NFT minting interface
│   ├── GiftLinkGenerator.tsx  # Gift link creation
│   ├── TicketPurchaseCard.tsx # Purchase flow
│   ├── TrialOnboarding.tsx    # Trial account setup
│   └── OnboardingKeyInit.tsx  # Onboarding key initialization
├── hooks/
│   ├── useAllVideos.ts     # Video listing
│   ├── useOwnedTokens.ts   # NFT ownership queries
│   └── useEventDescription.ts # Event metadata
└── lib/
    ├── nova/               # Nova Protocol integration
    │   ├── index.ts        # SDK singleton and exports
    │   ├── client.ts       # Nova API client
    │   ├── auth.ts         # Authentication helpers
    │   ├── groups.ts       # Group management
    │   ├── types.ts        # Type definitions
    │   └── config.ts       # Configuration
    ├── crust/              # Crust Network storage
    ├── crypto/             # Cryptographic utilities
    ├── session-manager.ts  # NEAR session key management
    ├── gift-service.ts     # Gift link generation
    ├── batch-transactions.ts # Transaction batching
    └── constants.ts        # Application constants
```

### Contract Layer

```
contracts/nft-ticket/
├── src/
│   └── lib.rs              # Main contract (Rust)
├── Cargo.toml              # Dependencies
└── build.sh                # Build script
```

---

## Data Flows

### Upload Flow

```
Creator → UploadForm
    │
    ├─[1]─ Session Key check (cached or generate new)
    │
    ├─[2]─ Nova SDK → Create encryption group for video
    │
    ├─[3]─ Nova SDK → Encrypt video (AES-256-GCM in TEE)
    │
    ├─[4]─ IPFS → Upload encrypted blob via Crust Network
    │
    ├─[5]─ NEAR Contract → create_event_prepaid(cid, groupId, price)
    │
    └─[6]─ Event listed on platform
```

### Watch Flow

```
Viewer → IpfsPlayer
    │
    ├─[1]─ NEAR Contract → verify_ownership(account_id, token_id)
    │
    ├─[2]─ Nova SDK → Verify group membership
    │
    ├─[3]─ IPFS → Fetch encrypted video (multi-gateway failover)
    │
    ├─[4]─ Nova SDK → Decrypt via Shade Agent (TEE)
    │
    └─[5]─ Stream decrypted video to player
```

### Purchase Flow

```
Buyer → TicketPurchaseCard
    │
    ├─[1]─ Session Manager → Check prepaid balance or wallet funds
    │
    ├─[2]─ NEAR Contract → buy_ticket_prepaid(cid) or buy_ticket(cid)
    │          │
    │          ├── 98% → Creator account
    │          └── 2%  → Platform (retained in contract)
    │
    ├─[3]─ Nova SDK → Add buyer to video encryption group
    │
    └─[4]─ NFT minted to buyer → immediate access granted
```

### Gift Flow

```
Creator → GiftLinkGenerator
    │
    ├─[1]─ NEAR Contract → create_gift_drop(cid, public_keys)
    │          Deposit: 0.15 NEAR per link
    │
    ├─[2]─ Generate shareable claim URLs with access keys
    │
    └─[3]─ Share links to recipients

Recipient → Claim Page
    │
    ├─[1]─ NEAR Contract → claim_gift() or claim_gift_and_create_account()
    │          If new user: creates trial account (0.10 NEAR)
    │          NFT storage: 0.01 NEAR
    │
    ├─[2]─ Nova SDK → Add recipient to encryption group
    │
    ├─[3]─ Access key deleted after claim (single-use)
    │
    └─[4]─ Recipient can now watch the video
```

---

## Contract Addresses

| Contract | Network | Address |
|----------|---------|---------|
| NFT Ticket | Mainnet | `youtick-prod-v1.near` |
| Nova SDK | Mainnet | `nova-sdk.near` |

---

## Architecture Documents

| Document | Description |
|----------|-------------|
| [Smart Contract](./smart-contract.md) | NFT ticket contract architecture, data structures, and method reference |
| [Nova Protocol](./nova-protocol.md) | TEE encryption system, group management, and Shade Agent |
| [Shade Agent](./shade-agent.md) | Phala Network TEE key management internals |
| [Session Keys](./session-keys.md) | Signless UX implementation and session lifecycle |
| [Chain Signatures](./chain-signatures.md) | NEAR MPC for cross-chain operations |
| [Storage](./storage.md) | IPFS and Crust Network storage architecture |

---

*See also: [User Flows](../guides/user-flows.md) for end-to-end interaction diagrams*
