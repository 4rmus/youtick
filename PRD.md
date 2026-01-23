# YouTick - Product Requirements Document

> **Version**: 1.0
> **Last Updated**: 2025-01-22
> **Status**: Active Development (Testnet)

## Executive Summary

YouTick is a **fully decentralized video-on-demand platform** where creators upload encrypted videos to IPFS and monetize them through NFT-gated access. The platform emphasizes:

- **98% creator revenue** (2% protocol fee)
- **True digital ownership** via transferable NFT tickets
- **Signless transactions** using NEAR Session Keys
- **Censorship-resistant** infrastructure (IPFS + Lit Protocol)

## Vision

> "Own your content. Own your audience. Own your revenue."

YouTick aims to be the **first truly decentralized streaming platform** where:
1. No single entity can censor content
2. Creators receive near-100% of their earnings
3. Users truly own their purchased content (NFTs)
4. The platform operates without centralized servers

---

## Current State Analysis

### What Works (Testnet)

| Feature | Status | Decentralization |
|---------|--------|------------------|
| NFT Ticket Minting | ✅ Working | 100% on-chain |
| Video Encryption | ✅ Working | Lit Protocol (decentralized) |
| IPFS Storage | ✅ Working | Lighthouse (semi-decentralized) |
| Payment Flow | ✅ Working | 98% to creator (on-chain) |
| Session Keys | ✅ Working | NEAR native |
| Gift Links | ✅ Working | Access Key based |
| Trial Accounts | ✅ Working | Contract-sponsored |

### Current Centralized Dependencies

| Component | Current State | Risk Level | Decentralization Path |
|-----------|---------------|------------|----------------------|
| **Lighthouse API** | Backend proxy with API key | 🟡 Medium | Smart contract payment |
| **Lit Relay** | Optional (mintPKPDirect exists) | 🟢 Low | Already has alternative |
| **CORS Proxies** | Next.js API routes | 🟢 Low | Direct client calls |
| **Relayer Account** | Sponsored tx for trials | 🟡 Medium | User-funded or remove |

### Decentralization Score

```
Current:  ████████████████░░░░  75%
Target:   ███████████████████░  95%
```

---

## Product Roadmap

### Phase 1: Testnet Stabilization (Current)

**Goal**: Stable, bug-free testnet with core features

**Deliverables**:
- [ ] Fix any Lit PKP integration issues
- [ ] Complete E2E testing for all flows
- [ ] Optimize session caching
- [ ] Document all API endpoints

**Success Metrics**:
- Zero critical bugs
- <3s video start time
- 99% upload success rate

---

### Phase 2: Mainnet V1 (Hybrid)

**Goal**: Production launch with acceptable centralization trade-offs

**Timeline**: After Phase 1 completion

#### 2.1 Contract Deployment
```yaml
actions:
  - Audit contract code (external or self-review)
  - Deploy to NEAR Mainnet
  - Set up monitoring and alerts
  - Configure mainnet RPC endpoints

approval_required: true
```

#### 2.2 Lit Protocol Mainnet
```yaml
actions:
  - Switch from Datil-Test to Datil (mainnet)
  - Update LIT_NETWORK configuration
  - Migrate PKP minting to mainnet contracts
  - Test encryption/decryption on mainnet

considerations:
  - Capacity credits needed for mainnet
  - PKP minting cost increases
```

#### 2.3 Lighthouse Production
```yaml
current: API key in backend
target: Keep API for V1, plan contract payment for V2

actions:
  - Set up production Lighthouse account
  - Configure dedicated IPFS gateway
  - Implement upload rate limiting
  - Add content moderation hooks (optional)
```

#### 2.4 Feature Additions
- [ ] Creator dashboard with analytics
- [ ] Multi-language support (TR, EN complete)
- [ ] Mobile-responsive improvements
- [ ] Social sharing features

**V1 Decentralization Score Target**: 80%

---

### Phase 3: Mainnet V2 (Decentralized)

**Goal**: Remove centralized dependencies

#### 3.1 Decentralized Storage Payment

**Current Flow**:
```
User → Backend → Lighthouse API → IPFS
        (API Key)
```

**Target Flow**:
```
User → NEAR Contract → Chain Signatures → Lighthouse Contract (EVM) → IPFS
```

**Implementation**:
```typescript
// Using NEAR Chain Signatures for cross-chain payment
async function payForStorage(nearWallet, fileSizeBytes) {
  const costInUSD = calculateLighthouseCost(fileSizeBytes);
  const costInNEAR = await convertUSDtoNEAR(costInUSD);

  // Option A: Direct payment via Chain Signatures
  const ethAddress = await deriveEthAddress(nearWallet, "lighthouse/payment");
  const signature = await signWithMPC(nearWallet, lighthousePaymentTx);
  await submitToLighthouseContract(signature);

  // Option B: Oracle-based (simpler)
  await nearContract.pay_for_storage({ file_size: fileSizeBytes });
  // Oracle watches NEAR events and triggers Lighthouse storage
}
```

#### 3.2 PKP Default to Direct

**Current**: `mintPKPWithNear()` (Relay) is default
**Target**: `mintPKPDirect()` as default

```typescript
// pkp.ts changes
async mintPKP(nearAccountId: string, signer: any) {
  // V2: Default to direct minting
  if (userHasTestLPX(signer)) {
    return this.mintPKPDirect(signer);
  }

  // Fallback to relay only if user opts in
  console.warn("Using Lit Relay - consider funding tstLPX for decentralized minting");
  return this.mintPKPWithNear(nearAccountId, ...);
}
```

#### 3.3 Remove Backend Proxies

| Proxy | Current | Target |
|-------|---------|--------|
| `/api/near-rpc` | CORS bypass | Direct RPC (configure CORS on nodes) |
| `/api/lit-rpc` | CORS bypass | Lit SDK handles internally |
| `/api/lighthouse/upload` | API key hiding | Client-side with user's Lighthouse account |

#### 3.4 Decentralized Relayer

**Options**:
1. **Remove entirely**: Users pay their own gas (purist approach)
2. **Meta-transactions**: Use NEAR's built-in meta-tx support
3. **Community relayers**: Multiple relayers with reputation system

**V2 Decentralization Score Target**: 95%

---

### Phase 4: Full Decentralization (Future)

**Goal**: Platform operates without any centralized component

#### 4.1 Frontend Decentralization
- Deploy to IPFS/Arweave
- ENS/NEAR naming for discovery
- No central domain dependency

#### 4.2 Governance
- DAO for protocol upgrades
- Community-controlled treasury (2% fees)
- Proposal system for feature changes

#### 4.3 Content Discovery
- Decentralized indexing (The Graph or custom)
- P2P content recommendations
- Reputation system for creators

---

## Technical Requirements

### Smart Contract Requirements

```rust
// Core NFT functionality (NEP-171)
nft_mint()
nft_transfer()
nft_approve()

// YouTick-specific
create_event(title, description, price, encrypted_cid)
buy_ticket(event_cid)
get_tokens_with_video(account_id)

// Session Key support
deposit_funds()
buy_ticket_prepaid()

// Gift system
create_gift_drop()
claim_gift()

// Trial accounts
create_sponsored_trial()
claim_free_ticket_sponsored()
```

### Frontend Requirements

```yaml
framework: Next.js 16.0.10 (App Router)
styling: Tailwind CSS 4.x
state: React 19.2.3 + Context + hooks
wallet: NEAR Wallet Selector 10.1.2
encryption: Lit Protocol SDK 7.3.1
storage: Lighthouse SDK 0.4.3

pages:
  - / (landing)
  - /upload (creator flow)
  - /discover (browse events)
  - /watch (video playback)
  - /profile (user dashboard)
  - /claim (gift claiming)
  - /ticket/[cid] (purchase page)
```

### Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| Encryption at rest | Lit Protocol AES-256 |
| Access control | NFT ownership verification |
| Session security | 7-day max cache, per-operation refresh for uploads |
| Payment security | On-chain escrow, 98/2 split enforced by contract |
| Key management | MPC (never expose private keys) |

### Performance Requirements

| Metric | Target | Current |
|--------|--------|---------|
| Video start time | <3s | ~5s |
| Upload speed | 10MB/s | ~5MB/s |
| Page load | <2s | ~3s |
| Decryption time | <1s | ~2s |

---

## User Flows

### Creator Flow (Upload)

```
1. Connect wallet (NEAR)
2. Set up Session Key (one-time, signless future tx)
3. Fill event details (title, price, description)
4. Select video file
5. [Automatic] Derive MPC address
6. [Automatic] Encrypt video with Lit
7. [Automatic] Upload to Lighthouse/IPFS
8. [Automatic] Mint NFT with encrypted CID
9. Share event link
```

### Viewer Flow (Purchase & Watch)

```
1. Browse /discover or receive event link
2. View event details
3. Click "Buy Ticket"
4. Confirm NEAR payment
5. [Automatic] NFT minted to account
6. Navigate to /watch
7. [Automatic] Verify ownership
8. [Automatic] Get decryption key from Lit
9. Stream decrypted video
```

### Gift Flow

```
Creator:
1. Go to /profile
2. Click "Create Gift Link"
3. Set number of tickets
4. [Automatic] Generate access keys
5. Share link(s)

Recipient:
1. Click gift link
2. If no account: Create trial account
3. [Automatic] Claim NFT
4. Watch video
```

---

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Lit Protocol downtime | Low | High | Cache sessions, graceful degradation |
| NEAR network congestion | Low | Medium | RPC failover, retry logic |
| Lighthouse service issues | Medium | High | Multiple IPFS pinning services |
| Smart contract bug | Low | Critical | Audit, upgrade mechanism, insurance |
| Key compromise | Low | Critical | MPC (no single point), session limits |

---

## Success Metrics

### Platform Metrics
- Monthly Active Creators
- Monthly Active Viewers
- Total Videos Uploaded
- Total Tickets Sold
- Creator Revenue (NEAR)

### Technical Metrics
- Uptime (target: 99.9%)
- Average Video Start Time
- Upload Success Rate
- Decryption Success Rate

### Decentralization Metrics
- % of operations on-chain
- # of centralized dependencies
- IPFS pinning redundancy
- Geographic distribution of nodes

---

## Appendix

### A. Contract ABI Summary

```
// View functions
get_event(cid) → Event
get_events(from_index, limit) → Vec<Event>
get_user_balance(account_id) → U128
verify_ownership(account_id, cid) → bool
get_tokens_with_video(account_id, limit) → Vec<(TokenId, VideoMetadata)>

// Change functions
create_event(title, description, price, encrypted_cid, ...)
buy_ticket(event_cid)
deposit_funds()
withdraw_funds(amount)
create_gift_drop(event_cid, public_keys, deposit_per_claim)
claim_gift(event_cid)
```

### B. Environment Configuration

```env
# Network
NEXT_PUBLIC_NEAR_NETWORK=testnet|mainnet

# Contracts
NEXT_PUBLIC_NFT_CONTRACT_ID=v1.utick.testnet

# Lit Protocol
NEXT_PUBLIC_LIT_ACTION_IPFS_CID=Qm...
NEXT_PUBLIC_LIT_CAPACITY_TOKEN_ID=...
LIT_DELEGATION_WALLET_PRIVATE_KEY=0x...

# Storage
LIGHTHOUSE_API_KEY=...

# Relayer (optional)
RELAYER_ACCOUNT_ID=relayer.v1.utick.testnet
RELAYER_PRIVATE_KEY=ed25519:...
```

### C. Glossary

| Term | Definition |
|------|------------|
| **PKP** | Programmable Key Pair - Lit Protocol's MPC wallet |
| **Session Key** | NEAR function-call access key for signless tx |
| **Chain Signatures** | NEAR's MPC for cross-chain signing |
| **Access Conditions** | Lit Protocol rules for decryption access |
| **Gift Drop** | Pre-funded tickets claimable via access key |
| **Trial Account** | Sponsored NEAR subaccount for new users |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-22 | Claude + User | Initial PRD creation |
