---
layout: home

hero:
  name: YouTick
  text: Decentralized Video-on-Demand
  tagline: Token-gated video platform on NEAR with client-side encryption and Edge KMS
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
  - title: Edge KMS Key Custody
    details: Decryption keys are stored in Cloudflare Worker KV and released only after signature + ownership checks.
  - title: IPFS + Crust Storage
    details: Encrypted blobs are pinned to decentralized storage with multi-gateway playback failover.
---

## Quick Navigation

- [Prerequisites](getting-started/prerequisites.md) -- System requirements
- [Installation](getting-started/installation.md) -- Clone, install, configure
- [Contract Methods](api/contract-methods.md) -- Contract API reference
- [User Flows](guides/user-flows.md) -- Upload, purchase, claim, trial
- [Roadmap](roadmap.md) -- Planned milestones
