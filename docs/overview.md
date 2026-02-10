# YouTick Overview

> **Decentralized Video-on-Demand Platform on NEAR Protocol**

---

## What is YouTick?

YouTick is a Web3-native video-on-demand platform that gives creators full control over their content and revenue. Videos are encrypted client-side using Nova Protocol's Trusted Execution Environment (TEE), stored permanently on IPFS, and access-controlled through NFT tickets on the NEAR blockchain.

The platform eliminates intermediaries between creators and viewers. When a viewer purchases an NFT ticket, 98% of the payment goes directly to the creator through the smart contract. The NFT ticket grants permanent, transferable access to the encrypted content -- it sits in the viewer's wallet and cannot be revoked.

### How It Works

```
Creator uploads video
    │
    ▼
┌──────────────────────────────────┐
│  1. Create Nova Group            │  Client-side: browser creates
│  2. Encrypt video (AES-256-GCM)  │  an encrypted group for this video
│  3. Upload to IPFS (Crust)       │  and uploads the encrypted blob
│  4. Mint NFT on NEAR             │  to decentralized storage
└──────────────────────────────────┘
    │
    ▼
Viewer purchases NFT ticket
    │
    ▼
┌──────────────────────────────────┐
│  1. buy_ticket() on NEAR         │  Smart contract handles payment
│  2. 98% to creator, 2% platform  │  and mints the NFT ticket
│  3. Add viewer to Nova Group     │  Nova grants decryption access
│  4. Decrypt and play video       │  All client-side, no servers
└──────────────────────────────────┘
```

---

## Core Value Propositions

### 1. True Digital Ownership

Traditional platforms give you a "viewing right" that can be revoked at any time. Your purchased content can disappear when licenses expire, platforms shut down, or terms of service change. YouTick fundamentally changes this model.

When you purchase a video on YouTick, you receive an **NFT ticket** that lives in your NEAR wallet. This ticket:

- Remains in your wallet permanently -- no platform can revoke it
- Can be transferred to another person
- Can be resold on secondary NFT markets
- Serves as a verifiable proof of ownership on-chain
- Grants cryptographic access to the encrypted content via Nova TEE

### 2. Frictionless Web3 UX

Most decentralized applications suffer from "Signature Fatigue" -- every on-chain action requires a wallet pop-up confirmation. YouTick solves this with NEAR Protocol's **Session Keys**.

| Action | First Time | After Session Key |
|--------|-----------|-------------------|
| Upload a video | 1 wallet signature (creates Session Key) | Fully signless |
| Upload another video | -- | Fully signless |
| Purchase a ticket | 1 wallet signature | Signless with prepaid balance |
| Watch a video | -- | Signless decryption |

Session Keys are function-call access keys scoped to the YouTick contract. They allow the application to sign transactions on your behalf for a limited duration (24 hours) without ever having access to your full account keys.

### 3. Creator-First Economics

YouTick delivers the highest creator revenue share in the video content industry. The smart contract enforces a fixed 98/2 split with no hidden fees, no advertiser dependencies, and no payment processor margins.

| Platform | Creator Revenue | Middlemen | Payment Model |
|----------|:--------------:|-----------|---------------|
| YouTube | ~55% | Google, advertisers, payment processors | Ad-based, monthly payouts |
| Patreon | ~88% | Patreon, payment processors | Subscription, monthly payouts |
| Vimeo OTT | ~90% | Vimeo, payment processors | Subscription/one-time, monthly payouts |
| **YouTick** | **98%** | **Smart contract only** | **Instant per-sale, on-chain** |

Key differences:

- **No advertiser dependency**: Revenue comes directly from viewers, not ads
- **Instant settlement**: Creators receive payment in the same transaction as the purchase
- **On-chain enforcement**: The 98/2 split is coded into the smart contract and cannot be changed unilaterally
- **No minimum payouts**: Every sale settles immediately, no $100 threshold

### 4. Censorship-Resistant Infrastructure

YouTick's architecture ensures that content cannot be censored or removed by any single party, including the platform itself.

| Layer | Technology | Censorship Resistance |
|-------|------------|----------------------|
| Content Storage | IPFS (Crust Network) | Files are distributed across a decentralized network with multiple gateway failovers |
| Encryption | Nova Protocol TEE | Encryption keys are managed in a Trusted Execution Environment, not by any company |
| Access Rights | NEAR Blockchain | NFT ownership is recorded on an immutable, permissionless blockchain |
| Application | Open Source Frontend | Anyone can host the frontend; access does not depend on a single domain |

Even if the YouTick frontend goes offline, your content and access rights persist. Any compatible client can read the on-chain data, verify NFT ownership, and decrypt content through Nova Protocol.

---

## Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER                       │
│                                                                   │
│  Next.js 16.0.10  |  React 19.2.3  |  Tailwind CSS 4.x           │
│  TypeScript 5.x   |  App Router    |  React Server Components     │
├─────────────────────────────────────────────────────────────────┤
│                      DECENTRALIZED SERVICES                       │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │  NEAR Protocol  │  │  Nova Protocol  │  │      IPFS       │   │
│  │   (Mainnet)     │  │     (TEE)       │  │  (Crust Network)│   │
│  │                 │  │                 │  │                 │   │
│  │ - NFT Minting   │  │ - AES-256-GCM   │  │ - Encrypted     │   │
│  │ - Payments      │  │ - Key Mgmt      │  │   Video Blobs   │   │
│  │ - Session Keys  │  │ - Group Access   │  │ - CID Pinning   │   │
│  │ - Gift Drops    │  │ - Shade Agent    │  │ - Multi-Gateway │   │
│  │ - Trial Accts   │  │ - Key Rotation   │  │   Failover      │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                        SMART CONTRACT LAYER                       │
│                                                                   │
│  Language: Rust          | NEAR SDK: 5.1.0                        │
│  Standard: NEP-171 NFT   | Contract: youtick-prod-v1.near         │
│  Features: Events, Tickets, Prepaid Balance, Gift Drops, Trials   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Details

| Layer | Technology | Version | Role in YouTick |
|-------|------------|---------|-----------------|
| Frontend | Next.js | 16.0.10 | App Router with React Server Components for page rendering |
| Frontend | React | 19.2.3 | Interactive UI components (upload form, player, mint button) |
| Frontend | Tailwind CSS | 4.x | Utility-first CSS framework for responsive design |
| Frontend | TypeScript | 5.x | Type-safe development across the entire frontend |
| Blockchain | NEAR Protocol | Mainnet | NFT minting, payment processing, session key management |
| Blockchain | NEAR SDK (Rust) | 5.1.0 | Smart contract development framework |
| Encryption | Nova Protocol | TEE | AES-256-GCM encryption with Shade Agent key management |
| Storage | IPFS | Crust Network | Permanent decentralized storage for encrypted video blobs |

---

## Key Features

| Feature | Description | How It Works | Status |
|---------|-------------|-------------|:------:|
| NFT Tickets | NEP-171 compliant tickets granting video access | `buy_ticket()` mints NFT and adds buyer to Nova group | Live |
| Session Keys | Signless transactions after one-time setup | Function-call access keys scoped to contract, 24-hour expiry | Live |
| Client Encryption | Videos encrypted entirely in the browser | Nova TEE AES-256-GCM via Shade Agent, no server involvement | Live |
| IPFS Storage | Permanent, censorship-resistant video storage | Encrypted blobs uploaded to Crust Network with multi-gateway failover | Live |
| Gift Links | Share video access via shareable URLs | `create_gift_drop()` creates access-key-based claim links | Live |
| Trial Accounts | New users get sponsored NEAR accounts | Onboarding Key creates subaccounts, no relayer dependency | Live |

---

## Decentralization Score

YouTick achieves decentralization across all components. Every component operates client-side with no server dependencies.

```
Decentralization:  ████████████████████  Client-Side
```

| Component | Decentralized Via | Server Required |
|-----------|------------------|:---------------:|
| NFT Ownership | NEAR smart contract | No |
| Payment Processing | On-chain 98/2 split | No |
| Video Encryption | Nova Protocol TEE (client-side) | No |
| Video Storage | IPFS via Crust Network | No |
| Session Management | NEAR function-call access keys | No |
| Gift Claims | NEAR access-key-based drops | No |
| Trial Onboarding | On-chain Onboarding Key pattern | No |
| Group Access Control | Nova SDK (client-side) | No |
| RPC Communication | Multi-endpoint failover (3-4 nodes) | No |

All operations -- from video upload to purchase to playback -- execute entirely in the user's browser. The platform has zero server-side dependencies for its core functionality.

---

## Cost Comparison

YouTick eliminates recurring infrastructure costs by leveraging decentralized protocols instead of centralized cloud services.

| Cost Category | Traditional VOD Platform | YouTick | Savings |
|---------------|:------------------------:|:-------:|:-------:|
| Servers | $5,000/mo | $0/mo | 100% |
| CDN / Bandwidth | $2,000/mo | IPFS (included) | 100% |
| Storage | $1,000/mo | ~$4/GB one-time | ~96% annually |
| Payment Processing | 2.9% + $0.30/tx | Gas fees (~$0.01/tx) | ~97% |
| DRM / Encryption | $500/mo | Nova TEE (included) | 100% |
| **Total (10K users)** | **~$8,500/mo recurring** | **~$200 one-time setup** | **~97%** |

The one-time cost for YouTick covers IPFS storage pinning fees. Ongoing costs are limited to NEAR gas fees (fractions of a cent per transaction) and optional IPFS re-pinning.

---

## Next Steps

Continue reading to set up your development environment and start building.

**Next**: [Quick Start Guide](./quick-start.md)
