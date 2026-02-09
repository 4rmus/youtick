# YouTick Overview

> **Decentralized Video-on-Demand Platform on NEAR Protocol**

## What is YouTick?

YouTick is a Web3-native VOD platform where creators upload encrypted videos to IPFS and monetize through NFT-gated access. Built with NEAR Protocol and Nova Protocol for TEE-based encryption.

## Core Value Propositions

### True Digital Ownership
Traditional platforms give you a "viewing right" that can be revoked anytime. YouTick gives you an **NFT ticket** that sits in your wallet forever. You can transfer it, sell it on secondary markets, or keep it as a collectible.

### Frictionless Web3 UX
Most dApps suffer from "Signature Fatigue" - endless wallet pop-ups. YouTick uses **Session Keys** to create a seamless experience:
- **First upload** → One signature to create Session Key
- **Subsequent uploads** → Fully signless
- **Video playback** → Signless decryption for ticket holders

### Creator-First Economics
| Platform | Creator Revenue | Middlemen |
|----------|-----------------|-----------|
| YouTube | ~55% | Google, advertisers |
| Patreon | ~88% | Payment processors |
| **YouTick** | **98%** | **Smart contract only** |

### Censorship-Resistant Infrastructure
- Content stored on **IPFS** (distributed, persistent)
- Encryption via **Nova TEE** (decentralized key management)
- Access rights on **NEAR blockchain** (immutable)
- Even if the frontend goes down, your content and access rights persist

## Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                        PRESENTATION                          │
│  Next.js 16.0.10 - React 19.2.3 - Tailwind CSS 4.x          │
├─────────────────────────────────────────────────────────────┤
│                        BLOCKCHAIN                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ NEAR Protocol│  │Nova Protocol │  │    IPFS      │       │
│  │  (Mainnet)   │  │  (TEE)       │  │  (Pinata)    │       │
│  │              │  │              │  │              │       │
│  │ - NFT Mint   │  │ - Encryption │  │ - Video      │       │
│  │ - Payments   │  │ - Key Mgmt   │  │   Storage    │       │
│  │ - Session    │  │ - Groups     │  │ - CID        │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
├─────────────────────────────────────────────────────────────┤
│                      SMART CONTRACT                          │
│  Rust - NEAR SDK 5.1.0 - NEP-171 NFT Standard               │
│  Contract ID: youtick-prod-v1.near                            │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

| Feature | Description | Status |
|---------|-------------|--------|
| NFT Tickets | ERC-721 style tickets for video access | Live |
| Session Keys | Signless transactions after initial setup | Live |
| Client Encryption | Videos encrypted in browser via Nova TEE | Live |
| IPFS Storage | Permanent, censorship-resistant storage | Live |
| Gift Links | Share tickets via shareable links | Live |
| Trial Accounts | New users get sponsored NEAR accounts | Live |

## Decentralization Score

```
Current:  ████████████████████  100%

Decentralized:
  + NFT ownership (NEAR contract)
  + Payment flow (98% to creator)
  + Video encryption (Nova TEE)
  + Video storage (IPFS)
  + Session Keys (signless UX)
  + Trial accounts (on-chain)
```

## Cost Comparison

| Component | Traditional VOD | YouTick |
|-----------|-----------------|---------|
| Monthly Servers | $5,000/mo | $0/mo |
| CDN Costs | $2,000/mo | IPFS (included) |
| Storage | $1,000/mo | ~$4/GB one-time |
| **Total (10K users)** | **$8,000/mo** | **~$200 one-time** |

---

**Next**: [Quick Start Guide →](./02-quick-start.md)
