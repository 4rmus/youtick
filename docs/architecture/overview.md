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
│  │  │  Crust      │  │  Lit        │  │  Session Manager    │     │     │
│  │  │  (Storage)  │  │  (Encrypt)  │  │  (NEAR Session Key) │     │     │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘     │     │
│  │         │                │                    │                 │     │
│  │  ┌──────┴──────┐  ┌──────┴──────┐  ┌─────────┴─────────┐       │     │
│  │  │ W3Auth      │  │ PKP Manager │  │ Chain Signatures  │       │     │
│  │  │ (Auth)      │  │ (PKP Mint)  │  │ (MPC Derivation)  │       │     │
│  │  └─────────────┘  └─────────────┘  └───────────────────┘       │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Decentralized Services                             │
├───────────────────┬───────────────────┬──────────────────────────────────┤
│   NEAR Protocol   │   Crust / IPFS    │      Lit Protocol                │
│                   │                   │                                   │
│ ┌───────────────┐ │ ┌───────────────┐ │ ┌─────────────────────────────┐  │
│ │ NFT Contract  │ │ │ IPFS Gateway  │ │ │ Lit Nodes (Datil-Test)      │  │
│ │ (v1.utick)    │ │ │ (crustipfs)   │ │ │ - Encryption/Decryption     │  │
│ │               │ │ │               │ │ │ - Access Control Conditions │  │
│ │ - Events      │ │ │ Upload:       │ │ │ - PKP Management            │  │
│ │ - Tickets     │ │ │ crustipfs.xyz │ │ │ - Session Signatures        │  │
│ │ - Prepaid     │ │ │               │ │ └─────────────────────────────┘  │
│ │ - Gifts       │ │ │ Retrieval:    │ │                                   │
│ │ - Trials      │ │ │ ipfs.io       │ │ ┌─────────────────────────────┐  │
│ └───────────────┘ │ │ dweb.link     │ │ │ MPC Signer (testnet)        │  │
│                   │ │ w3s.link      │ │ │ - ETH Address Derivation    │  │
│ ┌───────────────┐ │ │ crustipfs.xyz │ │ │ - Cross-chain Signatures    │  │
│ │ MPC Contract  │ │ └───────────────┘ │ └─────────────────────────────┘  │
│ │ (v1.signer)   │ │                   │                                   │
│ └───────────────┘ │                   │                                   │
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
| Storage | Crust Network | W3Auth | Decentralized IPFS |
| Encryption | Lit Protocol | 7.3.1 | Access Control, PKP |
| Signing | NEAR Chain Signatures | MPC | Cross-chain Operations |

---

## Core Principles

### 100% Decentralization

All operations run client-side:

| Operation | Method | Server Required |
|-----------|--------|-----------------|
| Upload | Crust W3Auth + Session Key | No |
| Retrieval | Multi-gateway failover | No |
| Encryption | Lit Protocol SDK | No |
| NFT Minting | Session Key | No |
| Payments | NEAR smart contract | No |
| Trial Creation | Onboarding Key | No (fallback only) |
| PKP Minting | NEAR MPC Chain Signatures | No |

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

NFT ownership gates content access:

```
1. Creator uploads encrypted video
2. Buyer purchases NFT ticket
3. Contract verifies ownership
4. Lit decrypts content for owner
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
    ├── crust/              # Storage module
    ├── lit.ts              # Encryption
    ├── session-manager.ts  # Session keys
    ├── chain-signatures.ts # MPC
    ├── gift-service.ts     # Gift system
    └── access-conditions.ts # Lit ACCs
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
| Crust | `lib/crust/` | IPFS upload/retrieval |
| Lit | `lib/lit.ts` | Encrypt/decrypt |
| Session | `lib/session-manager.ts` | Signless transactions |
| MPC | `lib/chain-signatures.ts` | ETH address derivation |
| Gift | `lib/gift-service.ts` | Gift link system |

---

## Data Flow

### Upload Flow

```
Creator → UploadForm
    │
    ▼
[Lit Protocol] ── Encrypt video with ACC
    │
    ▼
[Crust/IPFS] ── Upload encrypted blob (W3Auth)
    │
    ▼
[NEAR Contract] ── create_event_prepaid(cid, price)
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
[Crust/IPFS] ── Fetch encrypted video (gateway race)
    │
    ▼
[Lit Protocol] ── Decrypt with session sigs
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
NFT minted to buyer
```

---

## Contract Addresses

| Contract | Network | Address |
|----------|---------|---------|
| NFT Ticket | Testnet | `v1.utick.testnet` |
| MPC Signer | Testnet | `v1.signer-prod.testnet` |

---

## Related Documentation

- [Smart Contract](./smart-contract.md) - Contract architecture
- [Crust Storage](./crust-storage.md) - Storage module
- [Lit Protocol](./lit-protocol.md) - Encryption system
- [Session Keys](./session-keys.md) - Signless UX
- [Chain Signatures](./chain-signatures.md) - MPC operations

---

*See also: [User Flows](../guides/user-flows.md)*
