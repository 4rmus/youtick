---
layout: home

hero:
  name: YouTick
  text: Decentralized Video-on-Demand
  tagline: Token-gated video platform on NEAR with client-side encryption and share-based playback
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/prerequisites
    - theme: alt
      text: Architecture
      link: /architecture/

features:
  - title: NFT-Gated Access
    details: Viewers buy NFT tickets for permanent, transferable access to content.
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
- [Final Implementation Report](architecture/final-implementation-report.md) -- Live implementation summary
- [Youtick Zero Trust Architecture v1](architecture/youtick-zero-trust-architecture-v1.md) -- Target-state ADR
- [Contract Methods](api/contract-methods.md) -- Contract API reference
- [User Flows](guides/user-flows.md) -- Upload, purchase, claim, trial
- [Mainnet Runbook](operations/mainnet-runbook.md) -- Launch, rollback, smoke checklist
- [Mainnet Task Owners](operations/mainnet-task-owners.md) -- Role sahipligi ve handoff sirasi
- [Roadmap](roadmap.md) -- Planned milestones
