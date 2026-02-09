# YouTick Documentation

> **Decentralized Video-on-Demand Platform on NEAR Protocol**

YouTick is a 100% decentralized platform for token-gated video content. Creators upload encrypted videos, and viewers purchase NFT tickets to unlock access.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build contract
cd contracts/nft-ticket && cargo near build
```

---

## Documentation Structure

### Architecture (Detailed)

| Document | Description |
|----------|-------------|
| [Overview](./architecture/overview.md) | System architecture and technology stack |
| [Smart Contract](./architecture/smart-contract.md) | NFT ticket contract (Rust/NEAR) |
| [Nova Protocol](./architecture/nova-protocol.md) | TEE-based encryption system |
| [Shade Agent](./architecture/shade-agent.md) | TEE key management |
| [Session Keys](./architecture/session-keys.md) | Signless transaction management |
| [Chain Signatures](./architecture/chain-signatures.md) | NEAR MPC for cross-chain operations |

### Guides

| Document | Description |
|----------|-------------|
| [User Flows](./guides/user-flows.md) | Upload, watch, purchase, gift flows |
| [Nova SDK](./guides/nova-sdk.md) | Nova SDK integration guide |

### API Reference

| Document | Description |
|----------|-------------|
| [Contract Methods](./api/contract-methods.md) | Smart contract function reference |

### Main Docs (Numbered)

| Document | Description | Audience |
|----------|-------------|----------|
| [01 Overview](./01-overview.md) | Platform introduction and key features | Everyone |
| [02 Quick Start](./02-quick-start.md) | Getting started guide | Developers |
| [03 Architecture](./03-architecture.md) | System architecture and design | Architects |
| [04 NEAR Integration](./04-near-integration.md) | NEAR Protocol smart contracts | Blockchain Devs |
| [05 Nova Protocol](./05-nova-protocol.md) | TEE-based encryption and access control | Backend Devs |
| [07 Smart Contracts](./07-smart-contracts.md) | Contract specifications | Contract Devs |
| [08 Security](./08-security.md) | Security patterns and audit | Security Engineers |
| [09 Frontend](./09-frontend.md) | Next.js implementation | Frontend Devs |
| [10 Contributing](./10-contributing.md) | How to contribute | Contributors |

---

## Key Features

| Feature | Description | Decentralized |
|---------|-------------|---------------|
| Token-Gated Content | Videos encrypted with Nova TEE | Yes |
| Signless UX | Session Keys enable popup-free transactions | Yes |
| Gift Links | Share content via Access Key drops | Yes |
| Trial Accounts | Sponsored onboarding (no crypto required) | Yes |
| 98/2 Revenue | Creators receive 98%, platform 2% | Yes |

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Frontend | Next.js | 16.0.10 | App Router, RSC |
| Frontend | React | 19.2.3 | UI Components |
| Blockchain | NEAR Protocol | Testnet | Smart Contract, Payments |
| Blockchain | NEAR SDK (Rust) | 5.1.0 | Contract Development |
| Encryption | Nova Protocol | TEE | Shade Agent key management |
| Storage | IPFS | Pinata | Decentralized video storage |
| Signing | NEAR MPC | Chain Signatures | Cross-chain Operations |

---

## Directory Map

```
youtick-demo/
├── apps/web/                 # Frontend application
│   ├── app/                  # Next.js App Router pages
│   ├── components/           # React components
│   └── lib/                  # Core business logic
│       ├── nova/             # Nova encryption module
│       ├── session-manager.ts # Session keys
│       └── chain-signatures.ts # MPC
├── contracts/                # Smart contracts
│   └── nft-ticket/           # NFT ticket contract (Rust)
├── docs/                     # Documentation (you are here)
│   ├── architecture/         # Detailed architecture docs
│   ├── guides/               # How-to guides
│   └── api/                  # API reference
└── scripts/                  # Utility scripts
```

---

## Quick Links

- **Contract**: `v1.utick.testnet`
- **Network**: NEAR Testnet
- **MPC Contract**: `v1.signer-prod.testnet`

---

## Reading Order

1. **Newcomers**: [Overview](./architecture/overview.md) → [User Flows](./guides/user-flows.md)
2. **Frontend Devs**: [Session Keys](./architecture/session-keys.md) → [Nova Protocol](./architecture/nova-protocol.md)
3. **Contract Devs**: [Smart Contract](./architecture/smart-contract.md) → [Contract Methods](./api/contract-methods.md)
4. **Integrators**: [Nova SDK](./guides/nova-sdk.md) → [Shade Agent](./architecture/shade-agent.md)

---

## Decentralization

YouTick is 100% decentralized with no server dependencies:

| Component | Technology | Method |
|-----------|------------|--------|
| Storage | IPFS (Pinata) | Gateway failover |
| Encryption | Nova Protocol | TEE Shade Agent |
| Payments | NEAR Protocol | Smart contract |
| Cross-chain | NEAR MPC | Chain Signatures |

See [Nova Protocol](./architecture/nova-protocol.md) for implementation details.

---

*Last Updated: February 2025*
