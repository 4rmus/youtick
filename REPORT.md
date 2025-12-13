# YouTick MVP - Technical Report

## Executive Summary

YouTick is a decentralized video ticketing platform built on NEAR Protocol that enables content creators to monetize exclusive video content through NFT-based ticket sales. The platform leverages cutting-edge Web3 technologies to provide a secure, user-friendly, and truly decentralized video streaming experience.

---

## Architecture Overview

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Blockchain** | NEAR Protocol | Smart contracts, NFT minting, ticket sales |
| **Storage** | Lighthouse (IPFS) | Decentralized video storage |
| **Encryption** | Lit Protocol | Access control, video encryption/decryption |
| **Signing** | NEAR Chain Signatures (MPC) | Ethereum-compatible signatures for Lit |
| **Frontend** | Next.js 16 + React | Modern web application |

### System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        UPLOAD FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│  Creator → Encrypt Video (Lit) → Upload to IPFS (Lighthouse)   │
│         → Mint NFT + Create Event (NEAR Contract)               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       PURCHASE FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│  Buyer → Buy Ticket (NEAR) → Lit Session Created (Cached)      │
│       → Access Granted → Watch Video (No Signatures!)           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. NFT-Based Ticketing
- Each video purchase mints an NFT ticket
- Permanent, transferable ownership
- Proof of access stored on-chain

### 2. Decentralized Video Storage
- Videos stored on IPFS via Lighthouse
- Content-addressed, censorship-resistant
- No central server dependencies

### 3. Cryptographic Access Control
- Videos encrypted with Lit Protocol
- Only ticket holders can decrypt
- Access verified via NEAR RPC (on-chain)

### 4. Seamless User Experience
- **Session caching**: One-time signature at purchase, then signature-free viewing
- **Batch transactions**: Single signature for complex operations
- **Session keys**: Reduced friction for frequent actions

---

## Recent Optimizations

### Session Creation at Ticket Purchase

**Before:**
```
Video Playback → 3 Signatures Required → Decrypt → Play
```

**After:**
```
Ticket Purchase → 1 Signature → Session Cached (23h)
Video Playback → 0 Signatures → Instant Play!
```

This dramatically improves user experience by front-loading the signature requirement to the purchase moment, when users are already engaged in a transaction.

### IPFS-Only Architecture

We removed Livepeer HLS streaming in favor of a simpler IPFS-only approach:

| Metric | Before (Livepeer + IPFS) | After (IPFS-only) |
|--------|--------------------------|-------------------|
| NPM Packages | 1,369 | 1,091 (-278) |
| Complexity | High (dual storage) | Low (single source) |
| Storage Cost | 2x (raw + encrypted) | 1x (encrypted only) |
| Maintenance | Complex | Simple |

---

## Smart Contract Features

**Contract ID:** `v0-2.utick.testnet`

### Core Functions

| Function | Description |
|----------|-------------|
| `create_event` | Create video listing with price |
| `buy_ticket` | Purchase ticket NFT for a video |
| `get_event` | Query event details |
| `get_tokens_with_video` | Get user's tickets with video metadata |

### NFT Metadata Schema

```rust
VideoMetadata {
    encrypted_cid: String,      // UUID for access control
    livepeer_playback_id: String,  // Reserved for future use
    duration_seconds: u32,
    content_type: ContentType,  // Exclusive, Preview, etc.
}
```

---

## Security Model

### Multi-Layer Protection

1. **Blockchain Verification**
   - Ticket ownership verified via NEAR RPC
   - Immutable on-chain records

2. **Cryptographic Encryption**
   - Videos encrypted before storage
   - Lit Protocol manages decryption keys

3. **Signature-Based Authentication**
   - MPC (Multi-Party Computation) signatures
   - Ethereum-compatible for Lit Protocol

### Lit Action Access Control

```javascript
// Executed on Lit Protocol nodes
const hasTicket = tokensWithVideo.some(([token, metadata]) => {
    return metadata && metadata.encrypted_cid === targetCid;
});
// Decryption only proceeds if hasTicket === true
```

---

## Advantages

### For Creators
- ✅ **True Ownership**: Content stored decentralized, not on corporate servers
- ✅ **Direct Monetization**: Receive payments directly, no middleman fees
- ✅ **Permanent Availability**: Content persists on IPFS indefinitely

### For Viewers
- ✅ **NFT Tickets**: Own your access, potential resale value
- ✅ **Privacy**: No tracking, no personal data collection
- ✅ **Seamless Experience**: Signature-free viewing after purchase

### Technical Advantages
- ✅ **Decentralized**: No single point of failure
- ✅ **Censorship Resistant**: Content cannot be removed by platforms
- ✅ **Interoperable**: Standard NFT format, compatible with marketplaces
- ✅ **Scalable**: Leverages NEAR's sharded architecture

---

## Environment Configuration

```env
# NEAR Protocol
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=v0-2.utick.testnet

# IPFS Storage
NEXT_PUBLIC_LIGHTHOUSE_API_KEY=your_key

# Lit Action (Pinata IPFS)
PINATA_JWT=your_jwt
```

---

## Future Roadmap

1. **Keypom Integration**: Gift links for onboarding non-crypto users
2. **Trial Accounts**: Watch previews without wallet
3. **Secondary Market**: Ticket resale with royalties
4. **Multi-chain Support**: Expand beyond NEAR

---

## December 2025 Ecosystem & Grant Analysis

### Grant Landscape Overview
As of December 2025, the Web3 grant landscape has shifted significantly towards **AI x Crypto** and **Chain Abstraction**. NEAR Protocol is aggressively positioning itself as the "AI Blockchain," with substantial funding allocated to projects at this intersection.

### Active Grant Opportunities (Dec 2025)

| Program | Focus Area | Status | Relevancy for YouTick |
|---------|------------|--------|-----------------------|
| **NEAR AI Agent Fund** | AI Agents, Consumer Apps | **Active ($20M)** | ⭐⭐⭐ High - If we position the recommended videos or search as "AI-driven". |
| **NEAR DevHub** | Developer Tooling, Infra | **Active** | ⭐⭐⭐ High - For the "Session Key" or "IPFS" infrastructure components. |
| **Proximity Labs** | DeFi & Consumer | **Active** | ⭐⭐ Medium - If we emphasize the "Ticket Resale" (DeFi) aspect. |
| **Mintbase / Bitte** | AI Wallets, NFT infra | **Changed** | See below. |
| **Ethereum ESP** | Public Goods, Privacy | **Rolling** | ⭐⭐ Medium - For Lit Protocol (MPC) research. |
| **Scroll Community** | Community Growth | **Ends Dec 19**| ⭐ Low - Unless deploying multichain. |

### Mintbase -> Bitte AI Transition

**Status Confirmation:**
✅ **Rebrand Confirmed:** Mintbase has effectively rebranded its core infrastructure and wallet efforts to **Bitte AI (Bitte Protocol)**.
✅ **Pivot to AI:** The focus has shifted from a pure NFT utility platform to an ecosystem for **AI Agents** and **Chain Abstraction**.
✅ **Grant Status:**
*   **Old Program:** The specific "Mintbase NFT Grants" program appears to be deprecated or subsumed contributing to the broader NEAR AI vision.
*   **New Reality:** Bitte AI is now primarily a **recipient** of ecosystem grants (e.g., from Avalanche/NEAR for AI infra) rather than a distributor of small NFT project grants.
*   **Action Item:** For NFT-specific funding, we should now look directly to **NEAR DevHub** or **NEAR Foundation Ecosystem Grants**, rather than Bitte directly, unless building specific AI Agent plugins for the Bitte Wallet.

### Strategic Recommendations

1.  **Reframe for AI Grants**:
    *   Instead of just "NFT Ticketing," pitch YouTick as an **"AI-Enhanced Media Protocol"**.
    *   *Idea:* Use AI to summarize events or recommend tickets. This makes us eligible for the $20M NEAR AI Fund.

2.  **Target NEAR DevHub**:
    *   Since Mintbase grants are less certain/changed, DevHub is the most reliable path for a technical MVP like YouTick.
    *   Highlight the **"IPFS-only architecture"** and **"MPC Session Keys"** as reusable open-source contributions.

3.  **Application Timing**:
    *   **Immediate:** Submit to NEAR DevHub (rolling).
    *   **By Dec 19:** Check if any "End of Year" community rounds (like Scroll's) are applicable for cross-chain pilots.

---

## Conclusion

YouTick represents a new paradigm in digital content monetization. By combining NEAR Protocol's efficient blockchain, Lit Protocol's decentralized encryption, and IPFS's permanent storage, we've created a platform that respects both creator rights and viewer privacy while maintaining a seamless user experience.

The recent optimizations—particularly session caching at ticket purchase—demonstrate our commitment to balancing security with usability, proving that Web3 applications can match or exceed the UX of traditional platforms.

---

*Report generated: December 2025*
*Version: v0.2.0 (session-at-purchase)*
