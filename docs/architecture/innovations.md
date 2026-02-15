# Feature Audit and Innovation Analysis

> Technical innovations that differentiate YouTick from Web2 and Web3 video platforms

---

## Executive Summary

YouTick is a fully decentralized Video-on-Demand platform built on NEAR Protocol. Five architectural innovations work together to deliver a user experience that matches Web2 convenience while preserving Web3 ownership guarantees:

1. **Signless UX via Session Keys** -- Eliminates wallet popup fatigue with prepaid balance and scoped access keys
2. **Nova TEE Encryption** -- Zero-knowledge content protection through hardware-secured key management
3. **Access Key-Based Gift Drops** -- Self-contained onboarding links that work without a prior wallet
4. **Relayer-Less Trial Accounts** -- Client-side sponsored account creation with no server dependency
5. **Client-Side Decentralization** -- Every operation runs in the browser with zero backend infrastructure

Each innovation addresses a specific failure mode of existing platforms. Together, they form a cohesive system where a new user can receive a gift link, create an account, watch encrypted content, purchase additional tickets, and manage their library -- all without a server, a pre-existing wallet, or repeated wallet popups.

---

## Innovation #1: Signless UX via Session Keys

### Problem

Web3 dApps require a wallet signature popup for every on-chain transaction. A typical video purchase flow on a standard dApp involves three or more popups: approve token spending, confirm purchase, and confirm NFT minting. This friction drives users back to one-click Web2 alternatives.

### Solution

YouTick's session key system combines a prepaid balance ("Gas Tank") stored in the smart contract with NEAR Protocol's FunctionCall access keys. After a single wallet interaction to deposit funds and create a session key, all subsequent operations -- uploading, purchasing, minting, withdrawing -- execute without any wallet popup.

### Technical Details

```
Setup (one wallet interaction):
  1. Generate ed25519 key pair in browser
  2. Add FunctionCall access key to user's NEAR account (scoped to youtick.near)
  3. Deposit NEAR into contract's prepaid balance (deposit_funds)
  4. Store private key in browser localStorage

Subsequent operations (zero wallet interactions):
  5. Sign transactions locally with stored key
  6. Contract deducts costs from user's prepaid balance
  7. No attached deposit required -- FunctionCall key sufficient
```

**Key constraints enforced on-chain:**

| Constraint | Value | Purpose |
|------------|-------|---------|
| Key scope | `youtick.near` contract only | Prevents cross-contract abuse |
| Max signless withdrawal | 0.1 NEAR | Limits exposure if key is compromised |
| Key expiry | 24 hours | Reduces window of vulnerability |
| On-chain validation | Every call | Detects revoked or expired keys |
| Key type | ed25519 FunctionCall | Cannot transfer NEAR from main account |

**Prepaid methods available via session key:**

- `create_event_prepaid` -- List a video
- `buy_ticket_prepaid` -- Purchase a ticket
- `nft_mint_prepaid` -- Mint an NFT
- `withdraw_funds_prepaid` -- Withdraw up to 0.1 NEAR

### Comparison

| Feature | YouTube | Typical Web3 dApp | YouTick |
|---------|---------|-------------------|---------|
| Sign-in friction | OAuth (1 click) | Wallet popup per action | 1 wallet popup, then signless |
| Transaction UX | Invisible | Multiple popups per purchase | Single setup, then invisible |
| Gas management | N/A | User manages gas per transaction | Prepaid balance auto-deducts |
| Session duration | Indefinite (cookie) | Per-transaction | 24 hours (renewable) |
| Financial exposure | Credit card on file | Full wallet access per signature | Capped at prepaid balance |

### Source Files

- `apps/web/lib/session-manager.ts` -- SessionManager class, key lifecycle, balance management
- `apps/web/lib/batch-transactions.ts` -- Atomic setup (key + deposit in one transaction)
- `contracts/nft-ticket/src/lib.rs` -- Prepaid balance storage, `*_prepaid` methods, withdrawal caps

---

## Innovation #2: Nova TEE Encryption (Zero-Knowledge Content Protection)

### Problem

Traditional DRM systems (Widevine, FairPlay) are proprietary black boxes controlled by a single corporation. Users must trust Google, Apple, or Microsoft with decryption key management. On the other end, raw IPFS storage offers no content protection at all -- files are public by default. Neither approach gives creators verifiable, decentralized control over who can access their content.

### Solution

Nova Protocol provides Trusted Execution Environment (TEE) based encryption through Shade Agents running on Phala Cloud. Encryption keys are generated and stored inside hardware-secured enclaves. The keys never leave the TEE in plaintext. Access is controlled through on-chain group membership verified against the NEAR blockchain.

### Technical Details

```
Encryption (Upload):
  1. Client requests encryption key from Shade Agent (TEE)
  2. Shade Agent verifies caller is group creator via NEAR RPC
  3. AES-256-GCM key generated inside TEE, never exposed
  4. Client encrypts video locally with key material
  5. Encrypted blob uploaded to IPFS (Crust Network)
  6. Only the encrypted CID is stored on-chain

Decryption (Playback):
  1. Client requests decryption key from Shade Agent
  2. Shade Agent queries NEAR contract for group membership
  3. If caller owns a ticket NFT, key material is provided
  4. Client decrypts video locally
  5. Decrypted content streamed to video player
```

**Encrypted file format (Nova format):**

| Section | Size | Contents |
|---------|------|----------|
| Header | 32 bytes | Magic (`NOVA`), version, algorithm ID, key version, nonce, reserved |
| Payload | Variable | AES-256-GCM ciphertext (same size as original) |
| Auth Tag | 16 bytes | GCM authentication tag (integrity verification) |

**Zero-knowledge separation:**

| Component | Knows | Does Not Know |
|-----------|-------|---------------|
| NEAR Contract | Group membership, CIDs, metadata, prices | Video contents, encryption keys |
| Shade Agent (TEE) | Encryption keys, key versions | Group membership (queries NEAR), video contents, CIDs |
| IPFS / Crust | Encrypted blobs | Decryption keys, video contents, access permissions |
| Client Browser | Decrypted video (temporarily, in memory) | Raw encryption keys (key material handled by TEE) |

**Encryption specifications:**

| Component | Algorithm | Key Size | Purpose |
|-----------|-----------|----------|---------|
| Video Encryption | AES-256-GCM | 256 bits | Authenticated content encryption |
| Key Derivation | HKDF-SHA256 | Variable | Key expansion |
| Key Exchange | X25519 | 256 bits | Ephemeral key exchange |
| Request Signing | Ed25519 | 256 bits | NEAR-based request authentication |

### Comparison

| Feature | YouTube (Widevine DRM) | IPFS-Only (No Encryption) | YouTick (Nova TEE) |
|---------|----------------------|--------------------------|-------------------|
| Key management | Google servers (proprietary) | None (content is public) | TEE enclave (hardware-isolated) |
| Verifiability | Trust Google | N/A | TEE attestation (< 1 hour freshness) |
| Access control | Account-based (Google decides) | None | NFT ownership + group membership |
| Encryption standard | Widevine (closed-source) | None | AES-256-GCM (open standard) |
| Key rotation | Platform-controlled | N/A | Automatic on member removal |
| Content ownership | Platform revocable | Public domain | Creator-controlled, NFT-gated |

### Source Files

- `apps/web/lib/nova/` -- 12-module Nova SDK integration
- `apps/web/lib/nova/key-storage.ts` -- AES key storage and retrieval via TEE
- `apps/web/lib/nova/attestation.ts` -- TEE attestation verification
- `apps/web/lib/nova/groups.ts` -- Group creation and membership management
- `apps/web/lib/crypto/aes-gcm.ts` -- Client-side AES-256-GCM encryption/decryption

---

## Innovation #3: Access Key-Based Gift Drops (Onboarding Engine)

### Problem

Sharing Web3 content with someone who does not have a wallet is a dead end. Existing approaches require the recipient to first install a wallet extension, create an account, acquire tokens for gas, and then navigate to a claim page. Each step loses a significant percentage of potential users. Traditional Web2 gift cards solve sharing but require centralized account infrastructure.

### Solution

YouTick's gift drop system uses NEAR Protocol's access keys as self-contained authentication tokens. A creator generates gift links where each link embeds a private key that grants permission to call the contract's claim methods directly. The recipient does not need a wallet, tokens, or even a NEAR account -- the link itself is the credential.

### Technical Details

```
Creator generates gift links:
  1. Creator calls create_gift_drop(event_cid, public_keys[])
  2. Deposits 0.15 NEAR per link (covers account creation + storage + gas buffer)
  3. Contract adds each public key as a FunctionCall Access Key on itself
  4. Keys are scoped to: claim_gift, claim_gift_and_create_account
  5. Creator shares generated URLs containing the private key

Recipient claims gift:
  Path A -- Existing NEAR account:
    1. Recipient visits claim URL
    2. Frontend signs claim_gift() using embedded private key
    3. NFT ticket minted to recipient's account
    4. Nova group membership added
    5. Access key deleted from contract (single-use)

  Path B -- No NEAR account (full onboarding):
    1. Recipient visits claim URL, chooses a username
    2. Frontend signs claim_gift_and_create_account() using embedded private key
    3. Contract creates {username}.youtick.near account
    4. Full Access Key added to new account
    5. NFT ticket minted to new account
    6. Nova group membership added
    7. Access key deleted from contract (single-use)
```

**Cost breakdown per gift link:**

| Allocation | Amount | Purpose |
|------------|--------|---------|
| Account creation | 0.10 NEAR | Fund new subaccount (if needed) |
| NFT storage | 0.01 NEAR | On-chain storage deposit for NFT |
| Gas + key storage buffer | 0.04 NEAR | Cover transaction gas and access key storage |
| **Total per link** | **0.15 NEAR** | |

**Security properties:**

- Each access key is single-use (deleted on-chain after claim)
- Keys are scoped to claim methods only (cannot call other contract functions)
- Gift drops can be created in batches (1-50 links per transaction)
- Unclaimed links can be monitored via `is_gift_valid` and `get_gift_info`

### Comparison

| Feature | Web2 Gift Cards | Keypom / Linkdrop | YouTick Gift Drops |
|---------|----------------|-------------------|-------------------|
| Recipient needs wallet | No (but needs account) | Partial (some flows) | No |
| Account creation included | No | Partial | Yes ({user}.youtick.near) |
| Cost per gift | Variable | ~0.02+ NEAR | 0.15 NEAR (includes account) |
| Self-contained (link = auth) | No (requires login) | Partial | Yes (private key in URL) |
| Smart contract native | No (centralized) | External contract | Built into NFT contract |
| Single-use enforcement | Server-side | On-chain | On-chain (key deletion) |
| Content access included | No | No (token only) | Yes (Nova group membership) |

### Source Files

- `apps/web/lib/gift-service.ts` -- Gift link generation and claim orchestration
- `contracts/nft-ticket/src/lib.rs` -- `create_gift_drop`, `claim_gift`, `claim_gift_and_create_account`
- `apps/web/app/claim/` -- Claim page UI (detects embedded key, handles both claim paths)

---

## Innovation #4: Relayer-Less Trial Accounts (Onboarding Keys)

### Problem

Sponsored account creation in Web3 typically requires a trusted relayer server that holds a funded private key and proxies account creation requests. This relayer is a centralized single point of failure: if the server goes down, no new users can onboard. It also introduces operational costs (server hosting, monitoring, key security) that undermine the decentralization promise.

### Solution

YouTick uses onboarding keys -- FunctionCall access keys with limited allowance stored directly on the smart contract. These keys are distributed to the frontend application and cached in browser localStorage. When a new user wants to create a trial account, the browser signs the transaction using the onboarding key. No server is involved. The contract enforces rate limiting on-chain, and the trial pool is self-sustaining through a 1% commission on every ticket sale.

### Technical Details

```
Setup (owner, one-time):
  1. Owner calls add_onboarding_key(public_key)
  2. Key added as FunctionCall Access Key on youtick.near
  3. Scoped to: create_sponsored_trial_direct, claim_free_ticket_direct
  4. Allowance: 1 NEAR for gas

Trial creation (client-side, no server):
  1. Browser retrieves onboarding key from localStorage
  2. User chooses username
  3. Browser signs create_sponsored_trial_direct(username, new_public_key)
  4. Contract verifies:
     a. Signer's public key is in onboarding_keys set
     b. Daily trial limit not exceeded (default: 100/day)
     c. Trial pool has sufficient funds (>= 0.1 NEAR)
     d. Username is valid and available
  5. Contract creates {username}.youtick.near
  6. Deducts 0.1 NEAR from trial_pool for account funding
  7. Adds user's new_public_key as Full Access Key on new account

Self-sustaining economics:
  - 1% of every ticket purchase goes to trial_pool
  - Trial pool funds new account creation (0.1 NEAR each)
  - Manual top-up available via fund_trial_pool()
```

**Rate limiting (on-chain):**

| Control | Default | Configurable |
|---------|---------|:------------:|
| Daily trial limit | 100 accounts/day | Yes (`set_onboarding_config`) |
| Master switch | Enabled | Yes (`set_onboarding_config`) |
| Per-IP limit (client-side) | 3/day | Yes (frontend config) |

**Fallback path:**

If no onboarding key is available in the browser, the frontend falls back to a relayer API endpoint (`/api/trial/sponsored`). This ensures account creation still works during key rotation or if localStorage is cleared, while maintaining client-side operation as the primary path.

### Comparison

| Feature | Web2 Sign-up | Web3 Relayer Pattern | YouTick Onboarding Key |
|---------|-------------|---------------------|----------------------|
| Server dependency | Yes (auth server) | Yes (relayer server) | No (client-side) |
| Single point of failure | Auth server | Relayer server | None (keys in browser) |
| Cost to platform | Variable (hosting) | Gas + server hosting | 0.1 NEAR per account (from pool) |
| Rate limiting | Server-side logic | Server-side logic | On-chain (daily counters) |
| Self-sustaining | No (operational cost) | No (operational cost) | Yes (1% commission feeds pool) |
| Private key exposure | Server holds credentials | Relayer holds funded key | Browser holds scoped key (limited) |
| Offline resilience | None | None | Works if NEAR RPC is reachable |

### Source Files

- `contracts/nft-ticket/src/lib.rs` -- `add_onboarding_key`, `create_sponsored_trial_direct`, `check_and_increment_daily_limit`, trial pool management
- `apps/web/app/trial/` -- Trial onboarding page UI
- `apps/web/components/OnboardingKeyInit.tsx` -- Browser-side onboarding key initialization
- `apps/web/app/api/trial/` -- Fallback relayer API route

---

## Innovation #5: Client-Side Decentralization Architecture

### Problem

Most Web3 platforms advertise decentralization but rely on centralized backends for critical operations: user authentication, payment processing, content delivery, access control, and account creation. If the backend goes down, the entire application stops functioning. This architecture is "Web2.5" at best -- blockchain is used for settlement but not for operational independence.

### Solution

YouTick's entire operation runs client-side in the user's browser. Every component -- blockchain interaction, encryption, storage, authentication, account creation, and group management -- connects directly to decentralized services without routing through any proprietary server.

### Technical Details

**Fully decentralized components (zero server dependency):**

| # | Component | Technology | Connection Path |
|---|-----------|-----------|----------------|
| 1 | NFT ownership | NEAR smart contract | Browser --> NEAR RPC (with failover) |
| 2 | Payment processing | On-chain 98/1/1 split | Browser --> NEAR RPC |
| 3 | Video encryption | Nova Protocol TEE | Browser --> Shade Agent (Phala Cloud) |
| 4 | Video storage | IPFS via Crust Network | Browser --> Crust IPFS gateway |
| 5 | Session key management | NEAR FunctionCall keys | Browser --> localStorage + NEAR RPC |
| 6 | Gift claims | NEAR access key drops | Browser --> NEAR RPC (key in URL) |
| 7 | Trial account creation | On-chain onboarding keys | Browser --> NEAR RPC (key in localStorage) |
| 8 | Group access control | Nova SDK | Browser --> Nova contract + Shade Agent |
| 9 | RPC communication | Multi-endpoint failover | Browser --> fastnear / near.org / lava.build |

**RPC failover chain:**

```
Priority 1: rpc.fastnear.com       (fastest, primary)
Priority 2: rpc.mainnet.near.org   (NEAR Foundation, secondary)
Priority 3: near.lava.build        (Lava Network, tertiary)
```

If all endpoints fail, the operation is retried. No single RPC provider can take the application offline.

**IPFS gateway failover (7+ endpoints):**

```
Priority 1-2: Crust API endpoints (POST, fastest for pinned content)
Priority 3-8: Public IPFS gateways (GET, independent operators)
Auto-recovery: Unhealthy gateways retried after 5-minute cooldown
```

**Observability:**

All decentralization-relevant operations emit `[DECENTRALIZATION_METRIC]` console logs, making it transparent which path (client-side vs fallback) each operation took. This allows auditing that no server dependency has been introduced.

### Comparison

| Component | YouTube | Typical Web3 VOD | YouTick |
|-----------|---------|-------------------|---------|
| Video storage | Google servers | IPFS (but server uploads) | IPFS via Crust (client upload) |
| Payment processing | Google + bank | Smart contract (via server) | Smart contract (direct from browser) |
| Content encryption | Widevine (Google) | None or server-side | Nova TEE (client-side) |
| User authentication | Google OAuth | Server-side JWT | NEAR session keys (browser) |
| Account creation | Server-side | Relayer server | On-chain onboarding keys (browser) |
| Content delivery | Google CDN | Centralized gateway | 7+ IPFS gateways (failover) |
| Operational cost | $8,500+/mo (10K users) | $2,000+/mo (servers) | ~$200 one-time (IPFS storage) |
| Single point of failure | Google | Backend server | None |

### Source Files

- `apps/web/lib/nova/` -- Client-side Nova SDK integration (12 modules)
- `apps/web/lib/crust/` -- Client-side Crust storage (7 modules)
- `apps/web/lib/session-manager.ts` -- Client-side session key management
- `apps/web/lib/gift-service.ts` -- Client-side gift link generation
- `apps/web/components/OnboardingKeyInit.tsx` -- Client-side onboarding key init

---

## Combined Innovation Matrix

The five innovations form an integrated system. Each innovation enables or strengthens the others.

### User Journey Through All Five Innovations

```
New User Journey:
==================================================

Step 1: GIFT DROP (Innovation #3)
  Creator generates gift link --> sends to friend
  Friend has no wallet, no tokens, no account

Step 2: TRIAL ACCOUNT (Innovation #4)
  Friend clicks link --> chooses username
  Onboarding key creates {friend}.youtick.near
  No server involved, funded from trial pool

Step 3: NOVA TEE DECRYPTION (Innovation #2)
  Gift claim adds friend to Nova encryption group
  Friend's browser fetches encrypted video from IPFS
  Shade Agent verifies membership, provides key
  Video decrypted and played in browser

Step 4: SESSION KEY SETUP (Innovation #1)
  Friend deposits NEAR for future purchases
  Session key created (single wallet popup)
  All future purchases are signless

Step 5: CLIENT-SIDE OPERATION (Innovation #5)
  Every step above happened in the browser
  No server was contacted
  No centralized service was required
```

### Innovation Dependency Map

```
                    Innovation #5
              (Client-Side Architecture)
             /    |      |      |     \
            /     |      |      |      \
           v      v      v      v       v
       #1 Session  #2 Nova  #3 Gift  #4 Trial
       Keys       TEE     Drops    Accounts
           \       |      /       /
            \      |     /       /
             v     v    v       v
           Seamless User Experience
           (Web2 convenience + Web3 ownership)
```

### Cross-Innovation Interactions

| Innovation A | Enables | Innovation B | How |
|-------------|---------|-------------|-----|
| Session Keys (#1) | --> | Nova TEE (#2) | Session key signs Nova API requests without wallet popup |
| Session Keys (#1) | --> | Gift Drops (#3) | Creators generate gift links via `create_gift_drop` signlessly |
| Gift Drops (#3) | --> | Trial Accounts (#4) | `claim_gift_and_create_account` creates account + claims NFT |
| Trial Accounts (#4) | --> | Session Keys (#1) | New trial account can immediately set up session key |
| Nova TEE (#2) | --> | Gift Drops (#3) | Gift claim automatically adds recipient to Nova encryption group |
| Client-Side (#5) | --> | All | Every innovation operates without server dependency |

### Platform Comparison Summary

| Capability | YouTube | Vimeo OTT | Typical Web3 | YouTick |
|-----------|---------|-----------|--------------|---------|
| Signless transactions | Yes (cookie) | Yes (cookie) | No | Yes (session keys) |
| Verifiable encryption | No (trust Google) | No (trust Vimeo) | Rare | Yes (TEE attestation) |
| Gift without wallet | No (account needed) | No (account needed) | No (wallet needed) | Yes (access key links) |
| Serverless onboarding | No | No | No | Yes (onboarding keys) |
| Zero backend | No | No | No | Yes (client-side) |
| Creator revenue share | ~55% | ~90% | 90-100% | 98% |
| Content ownership | Platform (revocable) | Platform (revocable) | User (NFT) | User (NFT) |
| Open source | No | No | Sometimes | Yes |

---

## Related Documentation

- [Smart Contract Architecture](./smart-contract.md) -- V8 contract specification, data structures, 80+ methods
- [Nova Protocol Architecture](./nova-protocol.md) -- TEE encryption, group management, Shade Agent
- [Session Key Management](./session-keys.md) -- Signless UX implementation and session lifecycle
- [Decentralized Storage](./storage.md) -- IPFS and Crust Network storage architecture
- [Security Model](../security.md) -- Multi-layer security, threat model, incident response
- [Platform Overview](../overview.md) -- Value propositions and technology stack
