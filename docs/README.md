# YouTick Documentation

> **Decentralized Video-on-Demand Platform on NEAR Protocol**

YouTick is a decentralized platform for token-gated video content. Creators upload encrypted videos to IPFS and monetize through NFT-gated access. Viewers purchase NFT tickets that grant permanent, transferable access to content.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build smart contract
cd contracts/nft-ticket && cargo near build
```

See [Quick Start Guide](./quick-start.md) for full setup instructions including environment configuration.

---

## Documentation Structure

### Architecture

| Document | Description |
|----------|-------------|
| [Overview](./architecture/README.md) | System architecture, component diagram, data flows |
| [Smart Contract](./architecture/smart-contract.md) | NFT ticket contract specification (Rust/NEAR SDK 5.1.0) |
| [Nova Protocol](./architecture/nova-protocol.md) | TEE-based encryption and group access control |
| [Shade Agent](./architecture/shade-agent.md) | TEE key management and secure computation |
| [Session Keys](./architecture/session-keys.md) | Signless transaction management and session lifecycle |
| [Chain Signatures](./architecture/chain-signatures.md) | NEAR MPC for cross-chain operations |
| [Storage](./architecture/storage.md) | IPFS and Crust Network storage architecture |

### Guides

| Document | Description |
|----------|-------------|
| [User Flows](./guides/user-flows.md) | Upload, watch, purchase, and gift flows |
| [Nova SDK](./guides/nova-sdk.md) | Nova SDK integration guide with code examples |
| [Environment](./guides/environment.md) | Environment variables and configuration reference |

### API Reference

| Document | Description |
|----------|-------------|
| [Contract Methods](./api/contract-methods.md) | Smart contract function reference (events, tickets, prepaid, gifts, trials) |

### Platform Documentation

| Document | Description |
|----------|-------------|
| [Security](./security.md) | Security model, threat analysis, and audit checklist |
| [Frontend](./frontend.md) | Next.js 16 implementation, components, and hooks |
| [Contributing](./contributing.md) | Contribution guidelines, branch strategy, and code standards |

### Expert Analysis Reports

| Document | Expert | Focus |
|----------|--------|-------|
| [Architecture Analysis](./analysis/01-architecture-analysis.md) | Senior Web3 Project Architect | Protocol architecture, decentralization, security |
| [Software Review](./analysis/02-software-architecture-review.md) | Senior Software Architect | Code quality, modularity, performance |
| [Marketing Strategy](./analysis/03-marketing-strategy.md) | Senior Marketing Expert | Market analysis, GTM, growth plan |
| [Analysis Overview](./analysis/README.md) | Cross-Expert Synthesis | Priority action items, combined findings |

---

## Key Features

| Feature | Description | Decentralized |
|---------|-------------|:-------------:|
| Token-Gated Content | Videos encrypted with Nova TEE, access controlled by NFT ownership | Yes |
| Signless UX | Session Keys eliminate wallet pop-ups after initial setup | Yes |
| Gift Links | Share access via Access Key drops, no recipient wallet needed | Yes |
| Trial Accounts | Sponsored onboarding for new users (no crypto required) | Yes |
| 98/2 Revenue Split | Creators receive 98% of revenue, 2% platform fee | Yes |

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Frontend | Next.js | 16.0.10 | App Router, React Server Components |
| Frontend | React | 19.2.3 | UI components, hooks |
| Frontend | Tailwind CSS | 4.x | Utility-first styling |
| Frontend | TypeScript | 5.x | Type-safe development |
| Blockchain | NEAR Protocol | Mainnet | Smart contract, payments, session keys |
| Blockchain | NEAR SDK (Rust) | 5.1.0 | Contract development framework |
| Encryption | Nova Protocol | TEE | AES-256-GCM encryption, group-based access |
| Storage | IPFS | Crust Network | Decentralized encrypted video storage |

---

## Directory Map

```
youtick-demo/
├── apps/
│   └── web/                      # Frontend application (Next.js 16)
│       ├── app/                   # App Router pages and API routes
│       │   ├── api/               # API routes (nova-proxy, trial)
│       │   ├── claim/             # Gift claim page
│       │   ├── ticket/            # Ticket view pages
│       │   └── trial/             # Trial onboarding page
│       ├── components/            # React components
│       │   ├── UploadForm.tsx     # Video upload with encryption
│       │   ├── IpfsPlayer.tsx     # Decrypted video playback
│       │   ├── MintButton.tsx     # NFT minting interface
│       │   └── GiftLinkGenerator.tsx  # Gift link creation
│       ├── hooks/                 # Custom React hooks
│       │   ├── useAllVideos.ts    # Video listing
│       │   ├── useOwnedTokens.ts  # NFT ownership queries
│       │   └── useEventDescription.ts  # Event metadata
│       └── lib/                   # Core business logic
│           ├── nova/              # Nova Protocol integration
│           │   ├── index.ts       # SDK singleton and exports
│           │   ├── client.ts      # Nova API client
│           │   ├── auth.ts        # Authentication helpers
│           │   ├── groups.ts      # Group management
│           │   ├── types.ts       # Type definitions
│           │   └── config.ts      # Configuration
│           ├── crust/             # Crust Network storage
│           ├── crypto/            # Cryptographic utilities
│           ├── session-manager.ts # NEAR session key management
│           ├── gift-service.ts    # Gift link generation
│           ├── batch-transactions.ts  # Transaction batching
│           └── constants.ts       # App-wide constants
├── contracts/                     # Smart contracts
│   └── nft-ticket/                # NFT ticket contract
│       └── src/lib.rs             # Main contract (Rust)
├── docs/                          # Documentation (you are here)
│   ├── architecture/              # System design documentation
│   ├── guides/                    # How-to guides
│   ├── api/                       # API reference
│   └── analysis/                  # Expert analysis reports
└── scripts/                       # Utility and setup scripts
```

---

## Reading Order

Different audiences should read the documentation in different orders depending on their goals.

### Newcomers

Start here to understand what YouTick is and how it works.

1. [Overview](./overview.md) -- Platform introduction and value propositions
2. [Architecture](./architecture/README.md) -- System design and component relationships
3. [User Flows](./guides/user-flows.md) -- End-to-end upload, watch, purchase, and gift flows

### Frontend Developers

Focus on the Next.js application, components, and client-side integrations.

1. [Frontend](./frontend.md) -- Next.js 16 application structure and patterns
2. [Session Keys](./architecture/session-keys.md) -- Signless UX implementation
3. [Nova Protocol](./architecture/nova-protocol.md) -- Client-side encryption integration
4. [Nova SDK Guide](./guides/nova-sdk.md) -- Practical SDK usage with code examples

### Contract Developers

Focus on the Rust smart contract and NEAR Protocol integration.

1. [Smart Contract](./architecture/smart-contract.md) -- Contract architecture and storage design
2. [Contract Methods](./api/contract-methods.md) -- Complete function reference with CLI examples
3. [Security](./security.md) -- Security model and audit checklist

### Integrators

Third-party developers building on top of YouTick or integrating with its services.

1. [Nova SDK Guide](./guides/nova-sdk.md) -- SDK setup, authentication, and group management
2. [Shade Agent](./architecture/shade-agent.md) -- TEE key management internals
3. [Contract Methods](./api/contract-methods.md) -- API surface for on-chain interactions
4. [Chain Signatures](./architecture/chain-signatures.md) -- Cross-chain operation patterns

### Stakeholders

Non-technical overview of the platform, market position, and strategic analysis.

1. [Overview](./overview.md) -- Platform vision and value propositions
2. [Analysis Overview](./analysis/README.md) -- Cross-expert synthesis and priority actions
3. [Architecture Analysis](./analysis/01-architecture-analysis.md) -- Web3 architecture assessment
4. [Marketing Strategy](./analysis/03-marketing-strategy.md) -- Market analysis and growth plan

---

## Decentralization Summary

YouTick achieves decentralization with no server-side dependencies. Every operation runs client-side.

| Component | Technology | Method | Status |
|-----------|------------|--------|:------:|
| NFT Ownership | NEAR Protocol | On-chain smart contract | Active |
| Payments | NEAR Protocol | 98/2 split via contract logic | Active |
| Video Encryption | Nova Protocol | TEE Shade Agent (AES-256-GCM) | Active |
| Video Storage | IPFS | Crust Network with multi-gateway failover | Active |
| Session Management | NEAR Protocol | Function-call access keys (signless UX) | Active |
| Gift Distribution | NEAR Protocol | Access Key based drops (client-side) | Active |
| Trial Onboarding | NEAR Protocol | Onboarding Key based (no relayer) | Active |
| Group Access Control | Nova SDK | Client-side membership verification | Active |
| RPC Communication | NEAR RPC | Multi-endpoint failover (fastnear, near.org, lava.build) | Active |

---

## Quick Links

| Resource | Value |
|----------|-------|
| Production Contract | `youtick-prod-v1.near` |
| Network | NEAR Mainnet |
| Nova Contract | `nova-sdk.near` |
| Nova Encryption | AES-256-GCM via TEE |
| IPFS Storage | Crust Network |
| Frontend Framework | Next.js 16.0.10 |
| Contract Language | Rust (NEAR SDK 5.1.0) |

---

*Last Updated: February 2026*
