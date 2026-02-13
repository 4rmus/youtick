# YouTick Documentation

> **Decentralized Video-on-Demand Platform on NEAR Protocol**

YouTick is an open-source decentralized platform for token-gated video content. Creators upload encrypted videos to IPFS and monetize through NFT-gated access. Viewers purchase NFT tickets that grant permanent, transferable access to encrypted content.

**Contract:** `youtick-prod-v1.near` · **Network:** NEAR Mainnet · **SDK:** NEAR SDK 5.5.0

---

## Quick Start

```bash
git clone https://github.com/4rmus/youtick.git
cd youtick/apps/web
npm install
cp .env.example .env.local
npm run dev
```

See [Getting Started](./getting-started/installation.md) for the full setup guide.

---

## Documentation Map

### Getting Started

| Document | Description |
|----------|-------------|
| [Prerequisites](./getting-started/prerequisites.md) | System requirements (Node.js, Rust, NEAR wallet) |
| [Installation](./getting-started/installation.md) | Clone, install, configure, and run |
| [Configuration](./getting-started/configuration.md) | Environment variables and network setup |

### Architecture

| Document | Description |
|----------|-------------|
| [System Overview](./architecture/README.md) | Architecture diagram, components, data flows |
| [Smart Contract](./architecture/smart-contract.md) | V8 contract specification (Rust, NEAR SDK 5.5.0) |
| [Nova Protocol](./architecture/nova-protocol.md) | TEE-based encryption and group access control |
| [Shade Agent](./architecture/shade-agent.md) | TEE key management (Phala Network) |
| [Session Keys](./architecture/session-keys.md) | Signless UX implementation |
| [Chain Signatures](./architecture/chain-signatures.md) | NEAR MPC for cross-chain operations |
| [Storage](./architecture/storage.md) | IPFS + Crust Network storage architecture |

### Guides

| Document | Description |
|----------|-------------|
| [User Flows](./guides/user-flows.md) | Upload, watch, purchase, gift, and trial flows with diagrams |
| [Developer Guide](./guides/developer-guide.md) | Development workflow, patterns, and common tasks |
| [Nova SDK Guide](./guides/nova-sdk.md) | Nova SDK integration with code examples |
| [Environment](./guides/environment.md) | Environment variables reference |

### API Reference

| Document | Description |
|----------|-------------|
| [Contract Methods](./api/contract-methods.md) | Smart contract API reference (80+ methods) |

### Platform

| Document | Description |
|----------|-------------|
| [Overview](./overview.md) | Platform introduction and value propositions |
| [Frontend](./frontend.md) | Next.js 16 architecture, components, and hooks |
| [Security](./security.md) | Security model, threat analysis, and audit checklist |
| [Testing](./testing.md) | Test infrastructure, patterns, and commands |
| [Contributing](./contributing.md) | Contribution guidelines and code standards |
| [Roadmap](./roadmap.md) | Development milestones and future plans |

---

## Reading Order

### New Contributors

1. [Overview](./overview.md) — What YouTick is and why it exists
2. [Installation](./getting-started/installation.md) — Get the project running locally
3. [Developer Guide](./guides/developer-guide.md) — Code patterns and workflow
4. [Contributing](./contributing.md) — Contribution guidelines

### Frontend Developers

1. [Frontend Architecture](./frontend.md) — Next.js 16 structure and patterns
2. [Session Keys](./architecture/session-keys.md) — Signless UX implementation
3. [Nova Protocol](./architecture/nova-protocol.md) — Client-side encryption
4. [Nova SDK Guide](./guides/nova-sdk.md) — Practical SDK usage
5. [User Flows](./guides/user-flows.md) — End-to-end flow diagrams

### Contract Developers

1. [Smart Contract](./architecture/smart-contract.md) — V8 specification
2. [Contract Methods](./api/contract-methods.md) — Method reference with CLI examples
3. [Security](./security.md) — Security model and audit checklist
4. [Testing](./testing.md) — Contract testing patterns

### Integrators

1. [System Overview](./architecture/README.md) — Architecture and data flows
2. [Nova SDK Guide](./guides/nova-sdk.md) — SDK setup and authentication
3. [Contract Methods](./api/contract-methods.md) — On-chain API surface
4. [Configuration](./getting-started/configuration.md) — Environment setup

---

## Key Features

| Feature | Description | Status |
|---------|-------------|:------:|
| NFT-Gated Content | AES-256-GCM encryption via Nova TEE, access by NFT ownership | Active |
| Signless UX | Session Keys eliminate wallet pop-ups (24h expiry) | Active |
| Revenue Split | 98% creator, 1% trial pool, 1% commission — on-chain enforced | Active |
| Gift Links | Access-key-based drops, no recipient wallet needed | Active |
| Trial Accounts | Sponsored onboarding via Onboarding Keys (no relayer) | Active |
| wNEAR Payments | Purchase with wrapped NEAR via NEP-141 | Active |
| Content Moderation | On-chain ban system with typed reasons | Active |
| Purchase Audit | Full on-chain purchase logs with PurchaseType enum | Active |
| Multi-Gateway IPFS | 7+ IPFS gateways with automatic failover | Active |

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | Next.js (App Router) | 16.0.10 |
| UI | React | 19.2.3 |
| Styling | Tailwind CSS | 4.x |
| Language | TypeScript | 5.x |
| Blockchain | NEAR Protocol | Mainnet |
| Smart Contract | Rust (NEAR SDK) | 5.5.0 |
| NFT Standards | NEP-171/177/178 | — |
| Encryption | Nova Protocol (TEE) | AES-256-GCM |
| Storage | IPFS (Crust Network) | Multi-gateway |
| Wallet | NEAR Wallet Selector | 10.1.4 |
| Data Fetching | TanStack React Query | 5.x |

---

## Decentralization

All operations run client-side with zero server dependencies:

| Component | Technology | Server Required |
|-----------|------------|:---------------:|
| NFT Ownership | NEAR smart contract | No |
| Payments | On-chain 98/2 split | No |
| Video Encryption | Nova Protocol TEE | No |
| Video Storage | IPFS via Crust Network | No |
| Session Management | NEAR Function-Call Keys | No |
| Gift Claims | Access-Key drops | No |
| Trial Onboarding | Onboarding Key pattern | No |
| Group Access | Nova SDK (client-side) | No |
| RPC | Multi-endpoint failover | No |

---

## Quick Links

| Resource | Value |
|----------|-------|
| Contract (Mainnet) | `youtick-prod-v1.near` |
| Contract (Testnet) | `v1.utick.testnet` |
| Nova Contract | `nova-sdk.near` |
| Frontend Framework | Next.js 16.0.10 |
| Contract Language | Rust (NEAR SDK 5.5.0) |
| Storage Version | V8 (collision-safe) |

---

*Last Updated: February 2026*
