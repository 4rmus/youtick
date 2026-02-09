# Architecture Overview

> YouTick System Architecture and Technology Stack

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
│ │ (v1.utick)    │ │ │               │ │ │ - AES-256-GCM Encryption    │  │
│ │               │ │ │ Upload:       │ │ │ - Group-based Access        │  │
│ │ - Events      │ │ │ Pinata        │ │ │ - Automatic Key Rotation    │  │
│ │ - Tickets     │ │ │               │ │ │ - NEAR Auth Verification    │  │
│ │ - Prepaid     │ │ │ Retrieval:    │ │ └─────────────────────────────┘  │
│ │ - Gifts       │ │ │ ipfs.io       │ │                                   │
│ │ - Trials      │ │ │ dweb.link     │ │ ┌─────────────────────────────┐  │
│ └───────────────┘ │ │ pinata.cloud  │ │ │ Nova Contract (testnet)     │  │
│                   │ └───────────────┘ │ │ - Group Management          │  │
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
| Blockchain | NEAR Protocol | Testnet | Smart Contract, Payments |
| Blockchain | near-api-js | 7.x | NEAR SDK |
| Contract | Rust + NEAR SDK | 5.1.0 | Smart Contract |
| Storage | IPFS | Pinata | Decentralized video storage |
| Encryption | Nova Protocol | TEE | Shade Agent key management |

---

## Core Principles

### 100% Decentralization

All operations run client-side:

| Operation | Method | Server Required |
|-----------|--------|-----------------|
| Upload | Nova encrypt + IPFS | No |
| Retrieval | Multi-gateway failover | No |
| Encryption | Nova SDK (TEE) | No |
| NFT Minting | Session Key | No |
| Payments | NEAR smart contract | No |
| Trial Creation | Onboarding Key | No (fallback only) |

### Signless UX

Session Keys enable transactions without wallet popups:

```
1. User connects wallet once
2. Generate Function Call Access Key
3. Store key locally (browser)
4. Future transactions use local key
5. No more wallet confirmations
```

### Token-Gated Access

NFT ownership gates content access via Nova groups:

```
1. Creator uploads → Nova encrypts video
2. Creator creates Nova group for video
3. Buyer purchases NFT ticket
4. Contract adds buyer to Nova group
5. Nova decrypts content for group member
```

---

## Component Architecture

### Frontend Layer

```
apps/web/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Landing page
│   ├── profile/            # User dashboard
│   ├── watch/[id]/         # Video player
│   └── claim/              # Gift claim
├── components/
│   ├── UploadForm.tsx      # Video upload
│   ├── IpfsPlayer.tsx      # Decrypted playback
│   ├── VideoPlayer.tsx     # Player component
│   └── landing/            # Landing page sections
└── lib/
    ├── nova/               # Nova SDK integration
    ├── session-manager.ts  # Session keys
    └── gift-service.ts     # Gift system
```

### Contract Layer

```
contracts/nft-ticket/
├── src/
│   └── lib.rs              # Main contract
├── Cargo.toml              # Dependencies
└── build.sh                # Build script
```

### Key Libraries

| Library | File | Purpose |
|---------|------|---------|
| Nova | `lib/nova/` | Encrypt/decrypt via TEE |
| Session | `lib/session-manager.ts` | Signless transactions |
| Gift | `lib/gift-service.ts` | Gift link system |

---

## Data Flow

### Upload Flow

```
Creator → UploadForm
    │
    ▼
[Nova SDK] ── Create group, encrypt video
    │
    ▼
[IPFS] ── Upload encrypted blob
    │
    ▼
[NEAR Contract] ── create_event_prepaid(cid, groupId, price)
    │
    ▼
Event listed on platform
```

### Watch Flow

```
Viewer → IpfsPlayer
    │
    ▼
[NEAR Contract] ── verify_ownership(account_id)
    │
    ▼
[IPFS] ── Fetch encrypted video (gateway failover)
    │
    ▼
[Nova SDK] ── Verify membership, decrypt via Shade Agent
    │
    ▼
Stream decrypted video
```

### Purchase Flow

```
Buyer → EventCard
    │
    ▼
[Session Manager] ── Check prepaid balance
    │
    ▼
[NEAR Contract] ── buy_ticket_prepaid(cid)
    │
    ▼
[Contract] ── 98% → Creator, 2% → Platform
    │
    ▼
[Nova SDK] ── Add buyer to video group
    │
    ▼
NFT minted to buyer, immediate access
```

---

## Contract Addresses

| Contract | Network | Address |
|----------|---------|---------|
| NFT Ticket | Testnet | `v1.utick.testnet` |
| Nova | Testnet | `nova.testnet` |

---

## Related Documentation

- [Smart Contract](./smart-contract.md) - Contract architecture
- [Nova Protocol](./nova-protocol.md) - Encryption system
- [Shade Agent](./shade-agent.md) - TEE key management
- [Session Keys](./session-keys.md) - Signless UX

---

*See also: [User Flows](../guides/user-flows.md)*
