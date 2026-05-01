---
layout: home

hero:
  name: YouTick
  text: Public-Alpha Digital Ticketed Publishing
  tagline: Hybrid NEAR video platform with digital tickets, client-side encryption and share-based playback
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/prerequisites
    - theme: alt
      text: Architecture
      link: /architecture/

features:
  - title: NFT-Gated Access
    details: Viewers buy on-chain NFT tickets for content access. Transfers and resale are outside the V1 public alpha scope.
  - title: Client-Side Encryption
    details: Paid videos are encrypted in the browser with AES-CTR before upload.
  - title: Share-Based Playback
    details: Playback keys are reconstructed from multiple active operator shares instead of a single full-key release.
  - title: Registry Enforcement
    details: Operators and relayers must be active in the registry before they can participate.
  - title: IPFS + Crust Storage
    details: Encrypted blobs are pinned to decentralized storage with multi-gateway playback failover.
---

## Quick Navigation

- [Prerequisites](getting-started/prerequisites.md) -- System requirements
- [Installation](getting-started/installation.md) -- Clone, install, configure
- [Quick Start](quick-start.md) -- Run the app locally
- [System Architecture](architecture/README.md) -- Live architecture overview
- [Storage & Delivery](architecture/storage.md) -- Encryption, IPFS uploads, share-based playback
- [Smart Contract](architecture/smart-contract.md) -- Contract surfaces and invariants
- [Contract Methods](api/contract-methods.md) -- Contract API reference
- [Security](security.md) -- Threat model and security notes
- [Mainnet & Open Source Readiness](mainnet-open-source-readiness-2026-04-26.md) -- Güncel durum raporu ve launch kararı
