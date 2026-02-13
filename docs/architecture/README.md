# Architecture Overview

> YouTick System Architecture, Component Design, and Data Flows

---

## System Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            YouTick Platform                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐  │
│  │   Creator    │    │    Viewer    │    │  Gift Link   │    │   Trial    │  │
│  │   Upload     │    │    Watch     │    │   Claimer    │    │   User     │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └─────┬──────┘  │
│         │                   │                   │                  │          │
│         ▼                   ▼                   ▼                  ▼          │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                     Frontend (Next.js 16 + React 19)                   │   │
│  │                                                                        │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐   │   │
│  │  │ UploadForm │  │ IpfsPlayer │  │  ClaimPage │  │ TrialOnboard  │   │   │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └──────┬────────┘   │   │
│  │        │               │               │                │             │   │
│  │  ┌─────┴───────────────┴───────────────┴────────────────┴──────┐      │   │
│  │  │                   Core Libraries (lib/)                      │      │   │
│  │  │                                                              │      │   │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │      │   │
│  │  │  │ Nova SDK │  │  Crust   │  │ Session  │  │  Gift    │    │      │   │
│  │  │  │ (TEE)    │  │ (IPFS)   │  │ Manager  │  │ Service  │    │      │   │
│  │  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │      │   │
│  │  └─────────────────────────────────────────────────────────────┘      │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Decentralized Services                                │
├───────────────────────┬──────────────────────┬───────────────────────────────┤
│    NEAR Protocol      │        IPFS          │      Nova Protocol            │
│                       │                      │                               │
│ ┌───────────────────┐ │ ┌──────────────────┐ │ ┌───────────────────────────┐ │
│ │ NFT Contract (V8) │ │ │ Upload:          │ │ │ Shade Agent (Phala TEE)   │ │
│ │ youtick-prod-v1   │ │ │ Crust Network    │ │ │ - AES-256-GCM encryption │ │
│ │                   │ │ │                  │ │ │ - Group-based access      │ │
│ │ - Events          │ │ │ Retrieval:       │ │ │ - Auto key rotation      │ │
│ │ - Tickets (NFT)   │ │ │ 7+ gateways     │ │ │ - NEAR auth verification │ │
│ │ - Prepaid Balance │ │ │ (auto-failover)  │ │ └───────────────────────────┘ │
│ │ - Gift Drops      │ │ │                  │ │                               │
│ │ - Trial Accounts  │ │ │ crustipfs.xyz    │ │ ┌───────────────────────────┐ │
│ │ - Commission Pool │ │ │ ipfs.io          │ │ │ Nova Contract             │ │
│ │ - Purchase Audit  │ │ │ dweb.link        │ │ │ (nova-sdk.near)           │ │
│ │ - Content Mod     │ │ │ 4everland.io     │ │ │ - Group Management        │ │
│ │ - wNEAR Receiver  │ │ │ + 3 more         │ │ │ - Member Access Control   │ │
│ └───────────────────┘ │ └──────────────────┘ │ └───────────────────────────┘ │
│                       │                      │                               │
│ RPC Failover:         │                      │                               │
│ fastnear -> near.org  │                      │                               │
│ -> lava.build         │                      │                               │
└───────────────────────┴──────────────────────┴───────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Frontend | Next.js (App Router) | 16.0.10 | Pages, routing, SSR |
| UI | React | 19.2.3 | Component rendering |
| Language | TypeScript | 5.x | Type safety |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| Blockchain | NEAR Protocol | Mainnet | Smart contract, payments, session keys |
| NEAR SDK (JS) | near-api-js | 7.x | Frontend blockchain interaction |
| Smart Contract | Rust + NEAR SDK | 5.5.0 | NFT ticket contract (V8) |
| NFT Standards | NEP-171/177/178 | -- | Core, metadata, approval |
| FT Standard | NEP-141 | -- | wNEAR payment receiver |
| Encryption | Nova Protocol (TEE) | AES-256-GCM | Client-side via Shade Agent |
| Storage | IPFS + Crust Network | Multi-gateway | Encrypted video storage |
| Wallet | NEAR Wallet Selector | 10.1.4 | Multi-wallet support |
| Data Fetching | TanStack React Query | 5.x | Caching and state |

---

## Core Principles

### Client-Side Decentralization

All operations run in the user's browser with no server-side dependencies:

| Operation | Method | Server Required |
|-----------|--------|:---------------:|
| Video Upload | Nova encrypt + IPFS (Crust) | No |
| Video Retrieval | Multi-gateway failover (7+ gateways) | No |
| Encryption/Decryption | Nova SDK (TEE Shade Agent) | No |
| NFT Minting | Session Key -> NEAR contract | No |
| Payments | NEAR smart contract (98/2 split) | No |
| wNEAR Payments | ft_on_transfer (NEP-141) | No |
| Gift Claims | Access Key drops (client-side) | No |
| Trial Creation | Onboarding Key (on-chain) | No |
| Group Access | Nova SDK (client-side) | No |
| RPC Communication | Multi-endpoint failover | No |
| Content Moderation | On-chain ban/unban | No |

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
1. Creator uploads -> Nova creates encryption group
2. Creator encrypts video -> uploads encrypted blob to IPFS
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
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   ├── nova-proxy/       # Nova SDK proxy
│   │   └── trial/            # Trial account endpoints
│   ├── claim/                # Gift claim page
│   ├── discover/             # Video discovery page
│   ├── profile/              # User profile page
│   ├── ticket/               # Ticket view pages
│   │   └── [cid]/            # Dynamic ticket detail
│   └── trial/                # Trial onboarding page
├── components/               # 54+ React components
│   ├── providers/            # Context providers
│   │   ├── WalletProvider    # NEAR wallet state
│   │   ├── LanguageContext   # i18n (en/tr)
│   │   └── ThemeProvider     # Dark/light theme
│   ├── UploadForm.tsx        # Video upload with Nova encryption
│   ├── IpfsPlayer.tsx        # Decrypted video playback
│   ├── MintButton.tsx        # NFT minting interface
│   ├── TicketPurchaseCard.tsx # Purchase flow with cost breakdown
│   ├── NovaAccessSync.tsx    # Auto-sync Nova memberships
│   ├── NovaThumbnail.tsx     # Nova-encrypted thumbnails
│   ├── VideoCard.tsx         # Video card component
│   ├── AccountSetupDialog.tsx # Account setup wizard
│   └── OnboardingKeyInit.tsx # Onboarding key initialization
├── hooks/
│   ├── useAllVideos.ts       # Video listing with pagination
│   ├── useOwnedTokens.ts    # NFT ownership queries
│   ├── useNovaAccessSync.ts  # Nova access synchronization
│   └── useNearPrice.ts      # NEAR price feed
└── lib/
    ├── nova/                 # Nova Protocol integration (12 modules)
    │   ├── index.ts          # SDK singleton and exports
    │   ├── client.ts         # Nova API client
    │   ├── auth.ts           # Authentication helpers
    │   ├── groups.ts         # Group management
    │   ├── key-storage.ts    # Encryption key storage
    │   ├── attestation.ts    # TEE attestation verification
    │   ├── costs.ts          # Nova cost calculations
    │   ├── post-purchase.ts  # Post-purchase group membership
    │   ├── pending-access-queue.ts # Retry failed group additions
    │   ├── public-groups.ts  # Public group utilities
    │   ├── types.ts          # Type definitions
    │   └── config.ts         # Configuration
    ├── crust/                # Crust Network storage (7 modules)
    │   ├── index.ts          # Module entry
    │   ├── client.ts         # Upload client
    │   ├── gateway.ts        # Multi-gateway retrieval
    │   ├── storage-order.ts  # Crust storage orders
    │   ├── w3auth.ts         # W3Auth authentication
    │   ├── types.ts          # Type definitions
    │   └── config.ts         # Configuration
    ├── crypto/               # Cryptographic utilities
    │   ├── aes-gcm.ts        # AES-256-GCM encryption
    │   └── aes-ctr-chunked.ts # AES-CTR for large files
    ├── session-manager.ts    # NEAR session key management
    ├── gift-service.ts       # Gift link generation
    ├── batch-transactions.ts # Transaction batching
    ├── near.ts               # NEAR utilities
    ├── types.ts              # Shared type definitions
    └── translations.ts       # i18n strings (en/tr)
```

### Contract Layer

```
contracts/nft-ticket/
├── src/
│   └── lib.rs                # V8 contract (2400+ lines, 80+ methods)
├── Cargo.toml                # Dependencies (NEAR SDK 5.5.0)
└── build.sh                  # Build script
```

---

## Data Flows

### Upload Flow

```
Creator -> UploadForm
    |
    |-[1]- Session Key check (cached or generate new)
    |
    |-[2]- Nova SDK -> Create encryption group for video
    |
    |-[3]- AES-256-GCM encrypt video client-side
    |
    |-[4]- Store AES key in Nova TEE (group-controlled access)
    |
    |-[5]- Upload encrypted blob to IPFS via Crust Network
    |
    |-[6]- NEAR Contract -> create_event_prepaid(cid, groupId, price)
    |       Nova group ID indexed in event_nova_groups mapping
    |
    '-[7]- Event listed on platform
```

### Watch Flow

```
Viewer -> IpfsPlayer
    |
    |-[1]- NEAR Contract -> verify_ownership(account_id, token_id)
    |
    |-[2]- Nova SDK -> Verify group membership
    |
    |-[3]- Nova SDK -> Retrieve AES key from TEE (membership required)
    |
    |-[4]- IPFS -> Fetch encrypted video (multi-gateway failover)
    |
    |-[5]- Decrypt video client-side with AES key
    |
    '-[6]- Stream decrypted video to player
```

### Purchase Flow

```
Buyer -> TicketPurchaseCard
    |
    |-[1]- Session Manager -> Check prepaid balance or wallet funds
    |
    |-[2]- NEAR Contract -> buy_ticket_prepaid(cid) or buy_ticket(cid)
    |          |
    |          |- 98% -> Creator account
    |          |- 1%  -> Trial Pool
    |          '- 1%  -> Commission Pool
    |
    |-[3]- Purchase log recorded on-chain (PurchaseLog)
    |
    |-[4]- Nova SDK -> Add buyer to video encryption group
    |       (queued for retry on failure via pending-access-queue)
    |
    '-[5]- NFT minted to buyer -> immediate access granted
```

### Gift Flow

```
Creator -> GiftLinkGenerator
    |
    |-[1]- NEAR Contract -> create_gift_drop(cid, public_keys)
    |          Deposit: 0.15 NEAR per link
    |
    |-[2]- Generate shareable claim URLs with access keys
    |
    '-[3]- Share links to recipients

Recipient -> Claim Page
    |
    |-[1]- NEAR Contract -> claim_gift() or claim_gift_and_create_account()
    |          If new user: creates trial account (0.10 NEAR from gift deposit)
    |          NFT storage: 0.01 NEAR
    |
    |-[2]- Nova SDK -> Add recipient to encryption group
    |
    |-[3]- Access key deleted after claim (single-use)
    |
    '-[4]- Recipient can now watch the video
```

### wNEAR Purchase Flow

```
Buyer (holding wNEAR) -> ft_transfer_call
    |
    |-[1]- Send wNEAR to youtick-prod-v1.near via ft_transfer_call
    |          msg: JSON with event CID and receiver
    |
    |-[2]- Contract ft_on_transfer processes purchase
    |          Same 98/2 split as direct NEAR
    |
    |-[3]- NFT minted, purchase logged
    |
    '-[4]- Nova group membership added
```

---

## Contract Addresses

| Contract | Network | Address |
|----------|---------|---------|
| NFT Ticket | Mainnet | `youtick-prod-v1.near` |
| NFT Ticket | Testnet | `v1.utick.testnet` |
| Nova SDK | Mainnet | `nova-sdk.near` |
| Nova SDK | Testnet | `nova-sdk-6.testnet` |

---

## Architecture Documents

| Document | Description |
|----------|-------------|
| [Smart Contract](./smart-contract.md) | V8 contract specification, data structures, 80+ methods |
| [Nova Protocol](./nova-protocol.md) | TEE encryption, group management, Shade Agent |
| [Shade Agent](./shade-agent.md) | Phala Network TEE key management internals |
| [Session Keys](./session-keys.md) | Signless UX implementation and session lifecycle |
| [Chain Signatures](./chain-signatures.md) | NEAR MPC for cross-chain operations |
| [Storage](./storage.md) | IPFS and Crust Network storage architecture |

---

*See also: [User Flows](../guides/user-flows.md) for end-to-end interaction diagrams*
