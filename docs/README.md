# YouTick Documentation

> Decentralized Video-on-Demand Platform on NEAR Protocol

YouTick is an open-source decentralized platform for token-gated video content. Creators upload encrypted videos to IPFS and monetize through NFT-gated access. Viewers purchase NFT tickets that grant permanent, transferable access to encrypted content.

**Contract:** `youtick.near` | **Network:** NEAR Mainnet | **Encryption:** Nova Protocol (AES-256-GCM via TEE)

---

## Quick Navigation

### Getting Started

- [Prerequisites](getting-started/prerequisites.md) -- System requirements (Node.js, Rust, NEAR wallet)
- [Installation](getting-started/installation.md) -- Clone, install, configure, and run
- [Configuration](getting-started/configuration.md) -- Environment variables and network setup
- [Quick Start](quick-start.md) -- Minimal steps to get running

### Architecture

- [System Architecture](architecture/README.md) -- High-level design, diagrams, tech stack
- [Smart Contract](architecture/smart-contract.md) -- NEAR NFT ticket contract (Rust)
- [Nova Protocol](architecture/nova-protocol.md) -- TEE encryption and group access control
- [Session Keys](architecture/session-keys.md) -- Signless UX implementation
- [Storage](architecture/storage.md) -- IPFS and Crust Network
- [Innovations](architecture/innovations.md) -- Key technical differentiators

### API Reference

- [Contract Methods](api/contract-methods.md) -- Complete 80+ method reference

### Guides

- [User Flows](guides/user-flows.md) -- Upload, purchase, gift, and trial flows
- [Developer Guide](guides/developer-guide.md) -- Setup, workflow, and patterns
- [Nova SDK](guides/nova-sdk.md) -- Nova integration guide
- [Environment](guides/environment.md) -- Environment variables reference

### Project

- [Roadmap](roadmap.md) -- Development milestones and priorities
- [Security](security.md) -- Security model and threat analysis
- [Contributing](contributing.md) -- Contribution workflow
- [Testing](testing.md) -- Test infrastructure and patterns

---

## Reading Order

### New Contributors

1. [Quick Start](quick-start.md) -- Get the project running
2. [System Architecture](architecture/README.md) -- Understand the overall design
3. [Developer Guide](guides/developer-guide.md) -- Code patterns and workflow
4. [Contributing](contributing.md) -- Contribution guidelines

### Frontend Developers

1. [Developer Guide](guides/developer-guide.md) -- Development setup and patterns
2. [Session Keys](architecture/session-keys.md) -- Signless UX implementation
3. [Nova SDK](guides/nova-sdk.md) -- Client-side encryption integration
4. [User Flows](guides/user-flows.md) -- End-to-end flow diagrams

### Contract Developers

1. [Smart Contract](architecture/smart-contract.md) -- Contract specification
2. [Contract Methods](api/contract-methods.md) -- Method reference with CLI examples
3. [Session Keys](architecture/session-keys.md) -- Prepaid balance and access keys
4. [Testing](testing.md) -- Contract testing patterns

### Integrators

1. [System Architecture](architecture/README.md) -- Architecture and data flows
2. [Contract Methods](api/contract-methods.md) -- On-chain API surface
3. [Nova Protocol](architecture/nova-protocol.md) -- TEE encryption model
4. [Innovations](architecture/innovations.md) -- Technical differentiators

---

*Last Updated: February 2026*
