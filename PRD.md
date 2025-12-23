# YouTick - Product Requirement Document (PRD)

> **Version:** 1.0  
> **Date:** December 2025  
> **Target:** Investors & NEAR DevHub Public Goods Grant (Q4 2025)

---

## 1. Executive Summary

**YouTick** is a decentralized Video-On-Demand (VOD) platform built on NEAR Protocol that eliminates server and streaming costs through a novel "Zero Infrastructure" architecture.

### Key Value Propositions
| Metric | Value |
|--------|-------|
| **Server Cost** | $0/month (vs $500-5000/month traditional) |
| **Revenue Share** | 98% to creators (vs 45-55% Web2) |
| **User Experience** | One-signature uploads (vs 5+ popups) |

---

## 2. Problem Statement

### Industry Pain Points

**For Content Creators:**
- YouTube/Vimeo take 45-55% of revenue
- Platform censorship risk (content can be deleted)
- No real ownership of content or audience

**For Web3 Platforms:**
- Complex UX (multiple wallet signatures)
- High infrastructure costs (transcoding nodes)
- Poor mainstream adoption due to crypto friction

**For NEAR Ecosystem:**
- Limited real-world Chain Signatures implementations
- No reference apps for "Session Keys" pattern
- Developer barrier to serverless architecture

---

## 3. Solution: YouTick Architecture

### Core Innovation: Zero Server Economy

```
┌─────────────────────────────────────────────────────────────┐
│                    YouTick Architecture                      │
├─────────────────────────────────────────────────────────────┤
│  Client Browser                                              │
│  ├── React/Next.js Frontend                                 │
│  ├── MPC Signer (Chain Signatures)                          │
│  └── Lit Protocol Encryption                                │
├─────────────────────────────────────────────────────────────┤
│  NEAR Protocol                                               │
│  ├── NFT Contract (NEP-171 + Prepaid Proxy)                 │
│  ├── Session Keys (Limited Access)                          │
│  └── MPC Network (v1.signer-prod.testnet)                   │
├─────────────────────────────────────────────────────────────┤
│  Storage Layer                                               │
│  └── Lighthouse/IPFS (Decentralized, Permanent)             │
└─────────────────────────────────────────────────────────────┘
```

### Technical Differentiators

| Feature | Implementation | Benefit |
|---------|---------------|---------|
| **Chain Signatures** | MPC-derived ETH addresses from NEAR accounts | Cross-chain identity without separate wallet |
| **Session Keys** | Prepaid Proxy contract pattern | One-click uploads, no popup fatigue |
| **Lit Protocol** | Threshold encryption with NFT-based access | Only ticket holders can decrypt content |
| **Zero Backend** | All logic client-side + smart contract | Infinite scaling, zero monthly costs |

---

## 4. Product Features

### MVP (Current - Testnet)

- [x] **NFT Ticket Sales** - Creators set prices, 98% revenue share
- [x] **Encrypted Video Upload** - Lit Protocol + Lighthouse Storage
- [x] **Session Key Experience** - One signature for entire upload flow
- [x] **Token-Gated Playback** - Only NFT holders can watch
- [x] **Multi-language Support** - English/Turkish

### Phase 2 (Q1 2026)

- [ ] **Fast Auth** - Email/social login with auto-wallet creation
- [ ] **Keypom Integration** - Gift links and trial accounts
- [ ] **Creator Dashboard** - Analytics and revenue tracking

### Phase 3 (Q2-Q3 2026)

- [ ] **Live Streaming** - Real-time token-gated broadcasts
- [ ] **DAO Governance** - Community-driven platform decisions
- [ ] **Mobile Apps** - iOS/Android native experience

---

## 5. Market Analysis

### Target Market Size

| Segment | TAM | SAM | SOM (Year 1) |
|---------|-----|-----|--------------|
| Independent Creators | $50B | $5B | $10M |
| Concert/Event Recording | $8B | $800M | $5M |
| Educational Content | $30B | $3B | $3M |

### Competitive Landscape

| Platform | Monthly Cost | Revenue Share | Censorship Risk | Web3 Native |
|----------|-------------|---------------|-----------------|-------------|
| YouTube | Free | 45% | High | ❌ |
| Vimeo OTT | $500+ | 90% | Medium | ❌ |
| Livepeer | $200+ | 85% | Low | ⚠️ |
| **YouTick** | **$0** | **98%** | **None** | **✅** |

---

## 6. Business Model

### Revenue Streams

1. **Platform Fee:** 2% of ticket sales (creator keeps 98%)
2. **Premium Features:** Future paid tiers for analytics/priority support
3. **SDK Licensing:** Enterprise licensing for white-label deployments

### Unit Economics (Per Creator)

| Metric | Traditional | YouTick | Savings |
|--------|-------------|---------|---------|
| Monthly Hosting | $100 | $0 | 100% |
| Transaction Fee | 30% | 2% | 93% |
| Storage Cost | $0.05/GB/mo | $4/GB (one-time) | 87% (Year 1) |

---

## 7. Roadmap & Milestones

### Q4 2025 - Foundation
- [x] Complete testnet deployment
- [x] Implement Chain Signatures + MPC
- [x] Session Keys architecture
- [ ] Security audit (pending grant)

### Q1 2026 - Mainnet Launch
- [ ] Contract deployment to NEAR Mainnet
- [ ] SDK extraction (`near-serverless-sdk`)
- [ ] Onboard 100 creators (pilot)

### Q2 2026 - Growth
- [ ] Fast Auth integration
- [ ] 1,000 active creators
- [ ] 10,000 ticket sales

### Q3-Q4 2026 - Scale
- [ ] Live streaming feature
- [ ] DAO governance launch
- [ ] 50,000 users

---

## 8. Grant Application (NEAR DevHub)

### Alignment with Public Goods

YouTick serves as **reference infrastructure** for:
1. **Chain Signatures** - First production VOD using MPC
2. **Session Keys** - Reusable "Prepaid Proxy" pattern
3. **Zero Server Architecture** - Blueprint for serverless dApps

### Requested Funding: $25,000 USD

| Category | Amount | Deliverables |
|----------|--------|--------------|
| Engineering | $15,000 | Contract audit, SDK extraction, Mainnet prep |
| Infrastructure | $5,000 | MPC gas subsidies, IPFS pinning |
| Community | $5,000 | Tutorials, workshops, creator onboarding |

### Success Metrics

| Metric | Target (6 months) |
|--------|-------------------|
| GitHub Stars/Forks | 100+ |
| Mainnet MPC Signatures | 10,000+ |
| Active Creators | 100+ |
| SDK Downloads | 500+ |

---

## 9. Team

| Role | Experience |
|------|------------|
| Lead Developer | 5+ years Full-Stack, 2+ years NEAR/Web3 |
| Smart Contract | Rust, NEP-171, Chain Signatures |
| Frontend | React, Next.js, ethers.js |

---

## 10. Contact

- **Repository:** [github.com/4rmus/youtick-mvp](https://github.com/4rmus/youtick-mvp)
- **Demo:** [Testnet Deployment]
- **Email:** [Contact Email]

---

*This PRD serves as both an investor pitch and grant application for NEAR DevHub Public Goods Q4 2025.*
