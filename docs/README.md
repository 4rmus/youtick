# YouTick Documentation

> Decentralized Video-on-Demand Platform on NEAR Protocol

YouTick is an open-source token-gated video platform. Creators upload videos, encrypt paid content client-side (AES-CTR), store ciphertext on IPFS/Crust, and keep decryption keys in an Edge KMS worker. Access is enforced by NFT ownership on NEAR.

**Contract:** `youtick.near` | **Network:** NEAR Mainnet | **Encryption:** Client-side AES-CTR + Cloudflare KMS

---

## Quick Navigation

### Getting Started

- [Prerequisites](getting-started/prerequisites.md) -- System requirements
- [Installation](getting-started/installation.md) -- Clone, install, run
- [Configuration](getting-started/configuration.md) -- App/environment setup
- [Quick Start](quick-start.md) -- Minimal local setup flow

### Architecture

- [System Architecture](architecture/README.md) -- High-level design and data flow
- [Smart Contract](architecture/smart-contract.md) -- NEAR contract structure and methods
- [Session Keys](architecture/session-keys.md) -- Signless UX model
- [Storage](architecture/storage.md) -- IPFS + Crust retrieval model

### API Reference

- [Contract Methods](api/contract-methods.md) -- Public method catalog

### Guides

- [User Flows](guides/user-flows.md) -- Upload, purchase, claim, trial journeys
- [Developer Guide](guides/developer-guide.md) -- Development workflow and conventions
- [Environment](guides/environment.md) -- Environment variables

### Project

- [Overview](overview.md) -- Product and value proposition
- [Security](security.md) -- Threat model and controls
- [Testing](testing.md) -- Test strategy and commands
- [Contributing](contributing.md) -- Contribution workflow
- [Roadmap](roadmap.md) -- Planned work
- [Frontend](frontend.md) -- Frontend architecture and modules

---

## Reading Order

### New Contributors

1. [Quick Start](quick-start.md)
2. [System Architecture](architecture/README.md)
3. [Developer Guide](guides/developer-guide.md)
4. [Contributing](contributing.md)

### Frontend Contributors

1. [Frontend](frontend.md)
2. [Session Keys](architecture/session-keys.md)
3. [Storage](architecture/storage.md)
4. [Testing](testing.md)

### Contract Contributors

1. [Smart Contract](architecture/smart-contract.md)
2. [Contract Methods](api/contract-methods.md)
3. [Testing](testing.md)

---

*Last Updated: March 5, 2026*
