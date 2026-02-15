# YouTick System Architecture

> Decentralized Video-on-Demand platform built on NEAR Protocol, Nova Protocol (TEE), and Crust Network (IPFS).

**Contract**: `youtick.near` (mainnet) | **Network**: NEAR Mainnet | **Architecture**: Client-Side (No Server Dependencies)

---

## Table of Contents

- [System Overview](#system-overview)
- [High-Level Architecture](#high-level-architecture)
- [Component Architecture](#component-architecture)
- [Data Flow Diagrams](#data-flow-diagrams)
  - [Video Upload Flow](#video-upload-flow)
  - [Video Purchase and Watch Flow](#video-purchase-and-watch-flow)
  - [Gift Link Flow](#gift-link-flow)
  - [Trial Account Flow](#trial-account-flow)
- [Technology Stack](#technology-stack)
- [Security Architecture](#security-architecture)
- [Design Principles](#design-principles)
- [Contract Addresses](#contract-addresses)
- [Related Documents](#related-documents)

---

## System Overview

YouTick is a decentralized Video-on-Demand (VoD) platform on NEAR Protocol. Creators upload encrypted videos, mint NFT tickets, and receive 98% of every sale. Viewers purchase tickets to unlock content. The entire flow -- from encryption to payment to playback -- executes client-side in the browser with no centralized server dependencies.

The platform integrates three decentralized protocols:

| Protocol | Role | Key Capability |
|----------|------|----------------|
| **NEAR Protocol** | Blockchain layer | NFT minting, payments, session keys, gift drops, trial accounts |
| **Nova Protocol** | Encryption layer | AES-256-GCM encryption via TEE (Phala Cloud), group-based access control |
| **Crust Network / IPFS** | Storage layer | Encrypted blob storage with multi-gateway failover retrieval |

> [!NOTE]
> YouTick follows a **Client-Side First** architecture. Every operation -- NFT minting, video encryption, payment processing, group membership management -- runs in the user's browser. No backend server, no API gateway, no centralized point of failure.

---

## High-Level Architecture

```mermaid
flowchart TB
    subgraph Users["Users"]
        Creator["Creator"]
        Viewer["Viewer"]
        GiftRecipient["Gift Recipient"]
        TrialUser["New User (Trial)"]
    end

    subgraph Frontend["Frontend — Next.js 16 App Router"]
        direction TB
        AppRouter["App Router (Pages)"]
        Components["React 19 Components"]
        CoreLib["Core Libraries (lib/)"]

        AppRouter --> Components
        Components --> CoreLib

        subgraph Pages["Pages"]
            Upload["/upload"]
            Watch["/watch"]
            Discover["/discover"]
            Claim["/claim"]
            Trial["/trial"]
            Profile["/profile"]
        end

        subgraph Libs["Library Modules"]
            NovaSDK["lib/nova/ (12 modules)"]
            CrustLib["lib/crust/ (7 modules)"]
            CryptoLib["lib/crypto/ (AES-GCM, AES-CTR)"]
            SessionMgr["session-manager.ts"]
            GiftSvc["gift-service.ts"]
            NearLib["near.ts + rpc-failover.ts"]
        end
    end

    subgraph NEAR["NEAR Protocol — youtick.near"]
        direction TB
        NFT["NEP-171 NFT Standard\n(Tickets as NFTs)"]
        Prepaid["Prepaid Balance\n(Session Keys)"]
        GiftDrops["Gift Drops\n(Access Key Based)"]
        TrialAccounts["Trial Accounts\n(Onboarding Key Based)"]
        Commission["Commission Pool\n(98% Creator / 2% Platform)"]
        PurchaseLogs["Purchase Logs\n(On-Chain Audit Trail)"]
    end

    subgraph Nova["Nova Protocol — TEE on Phala Cloud"]
        direction TB
        Encryption["AES-256-GCM Encryption\n(Client-Side via SDK)"]
        GroupAccess["Group-Based Access Control\n(Membership = Decryption Rights)"]
        TEEAttest["TEE Attestation Verification\n(Enclave Integrity Proof)"]
        KeyMgmt["Key Management\n(Keys Never Leave TEE)"]
    end

    subgraph Storage["Crust Network / IPFS"]
        direction TB
        CrustUpload["Crust IPFS Upload\n(crustipfs.xyz)"]
        GatewayFailover["Multi-Gateway Retrieval"]
        subgraph Gateways["Gateways (Priority Order)"]
            G1["ipfs.io"]
            G2["dweb.link"]
            G3["trustless-gateway.link"]
            G4["4everland.io"]
            G5["gateway.lighthouse.storage"]
            G6["w3s.link"]
        end
    end

    subgraph Browser["Browser localStorage"]
        SessionKeys["Session Keys\n(Function Call Access Keys)"]
        OnboardingKeys["Onboarding Keys\n(Trial Account Creation)"]
        NovaTokens["Nova Auth Tokens\n(30-min Cache)"]
    end

    Creator --> Upload
    Viewer --> Watch
    Viewer --> Discover
    GiftRecipient --> Claim
    TrialUser --> Trial

    CoreLib --> NEAR
    CoreLib --> Nova
    CoreLib --> Storage
    CoreLib --> Browser

    NFT --> Commission
    GiftDrops --> NFT
    TrialAccounts --> NFT
    Prepaid --> NFT

    Encryption --> GroupAccess
    GroupAccess --> TEEAttest
    TEEAttest --> KeyMgmt

    CrustUpload --> GatewayFailover
    GatewayFailover --> Gateways
```

> [!IMPORTANT]
> The NEAR smart contract at `youtick.near` handles all financial operations on-chain. The 98/2 commission split (1% to trial pool + 1% to platform commission) is enforced at the contract level and cannot be modified without a redeployment.

---

## Component Architecture

```mermaid
flowchart TB
    subgraph Providers["Provider Hierarchy (top-down wrapping)"]
        direction TB
        WP["WalletProvider\n(NEAR Wallet Selector)"]
        QP["QueryProvider\n(TanStack React Query v5)"]
        TP["ThemeProvider\n(next-themes: dark/light)"]
        LP["LanguageProvider\n(i18n: en/tr)"]
        EP["EvmProvider\n(Wagmi + Viem)"]

        WP --> QP --> TP --> LP --> EP
    end

    subgraph AppPages["App Router Pages"]
        direction LR
        PUpload["/upload\nVideo Upload"]
        PWatch["/watch\nVideo Playback"]
        PDiscover["/discover\nBrowse Videos"]
        PClaim["/claim\nGift Claim"]
        PTrial["/trial\nTrial Onboarding"]
        PProfile["/profile\nUser Dashboard"]
        PMint["/mint\nNFT Minting"]
        PTicket["/ticket/[cid]\nTicket Detail"]
    end

    subgraph CoreComponents["Core Components"]
        direction TB
        UploadForm["UploadForm.tsx\nMulti-step upload wizard"]
        IpfsPlayer["IpfsPlayer.tsx\nDecrypted video playback"]
        TicketCard["TicketPurchaseCard.tsx\nPurchase flow + cost breakdown"]
        GiftGen["GiftLinkGenerator.tsx\nBatch gift link creation"]
        NovaSync["NovaAccessSync.tsx\nAuto-sync group memberships"]
        NovaThumbnail["NovaThumbnail.tsx\nEncrypted thumbnail display"]
        VideoCard["VideoCard.tsx\nVideo listing card"]
        AcctSetup["AccountSetupDialog.tsx\nAccount setup wizard"]
        OnboardInit["OnboardingKeyInit.tsx\nOnboarding key bootstrap"]
        MintButton["MintButton.tsx\nNFT mint trigger"]
    end

    subgraph LibModules["Library Modules"]
        direction TB

        subgraph NovaLib["lib/nova/ — 12 modules"]
            NIndex["index.ts — SDK singleton + exports"]
            NClient["client.ts — Nova API client"]
            NAuth["auth.ts — Auth helpers"]
            NGroups["groups.ts — Group management"]
            NKeyStore["key-storage.ts — Key storage"]
            NAttest["attestation.ts — TEE attestation"]
            NCosts["costs.ts — Cost calculations"]
            NPostPurch["post-purchase.ts — Post-purchase membership"]
            NPending["pending-access-queue.ts — Retry queue"]
            NPubGroups["public-groups.ts — Public group utils"]
            NTypes["types.ts — Type definitions"]
            NConfig["config.ts — Configuration + SDK singleton"]
        end

        subgraph CrustLib["lib/crust/ — 7 modules"]
            CIndex["index.ts — Module entry"]
            CClient["client.ts — Upload client"]
            CGateway["gateway.ts — Multi-gateway retrieval"]
            CStorage["storage-order.ts — Storage orders"]
            CW3Auth["w3auth.ts — W3Auth authentication"]
            CTypes["types.ts — Type definitions"]
            CConfig["config.ts — Gateway configuration"]
        end

        subgraph CryptoLib["lib/crypto/"]
            AesGcm["aes-gcm.ts — AES-256-GCM"]
            AesCtr["aes-ctr-chunked.ts — AES-CTR streaming"]
        end

        SessionManager["session-manager.ts"]
        GiftService["gift-service.ts"]
        BatchTx["batch-transactions.ts"]
        NearUtils["near.ts"]
        RpcFailover["rpc-failover.ts"]
        Constants["constants.ts"]
        Translations["translations.ts (en/tr)"]
    end

    subgraph Hooks["Custom Hooks"]
        UseAllVideos["useAllVideos.ts"]
        UseOwnedTokens["useOwnedTokens.ts"]
        UseNovaSync["useNovaAccessSync.ts"]
        UseNearPrice["useNearPrice.ts"]
    end

    EP --> AppPages
    AppPages --> CoreComponents
    CoreComponents --> LibModules
    CoreComponents --> Hooks
    Hooks --> LibModules
```

> [!NOTE]
> The provider hierarchy follows a strict wrapping order. `WalletProvider` must be the outermost provider because downstream providers and components depend on wallet connection state for NEAR operations.

---

## Data Flow Diagrams

### Video Upload Flow

The upload flow encrypts video content client-side, stores it on decentralized storage, and mints an NFT ticket on NEAR -- all without server involvement.

```mermaid
sequenceDiagram
    actor Creator
    participant Browser as Browser (Next.js)
    participant SessionMgr as Session Manager
    participant Nova as Nova Protocol (TEE)
    participant Crust as Crust Network (IPFS)
    participant NEAR as NEAR Contract<br/>(youtick.near)

    Creator->>Browser: Select video file + set price

    Note over Browser: Step 1 — Session Key Setup
    Browser->>SessionMgr: Check for cached session key
    alt No cached key
        SessionMgr->>NEAR: addKey() — Function Call Access Key<br/>(allowance: 0.25 NEAR, methods: create_event_prepaid, buy_ticket_prepaid, ...)
        NEAR-->>SessionMgr: Key confirmed on-chain
        SessionMgr->>Browser: Store key in localStorage (24h TTL)
    end

    Note over Browser: Step 2 — Thumbnail Generation
    Browser->>Browser: Extract video frame → generate thumbnail
    Browser->>Crust: Upload thumbnail (unencrypted, public)
    Crust-->>Browser: Thumbnail CID

    Note over Browser: Step 3 — Nova Group Creation
    Browser->>Nova: registerGroup(groupName)<br/>On-chain deposit + TEE registration
    Nova-->>Browser: Group ID confirmed

    Note over Browser: Step 4 — Client-Side Encryption
    Browser->>Browser: Generate AES-256-GCM key (Web Crypto API)
    Browser->>Browser: Encrypt video with AES key

    Note over Browser: Step 5 — Upload Encrypted Blob
    Browser->>Crust: Upload encrypted blob via W3Auth<br/>(POST crustipfs.xyz/api/v0/add)
    Crust-->>Browser: Encrypted video CID

    Note over Browser: Step 6 — Store Key in TEE
    Browser->>Nova: Store AES key in group<br/>(only group members can retrieve)
    Nova-->>Browser: Key stored in TEE enclave

    Note over Browser: Step 7 — Mint NFT (Signless)
    Browser->>NEAR: create_event_prepaid(cid, nova_group_id, title, price)<br/>via session key — no wallet popup
    NEAR-->>Browser: Event created, NFT minted to creator

    Note over Browser: Step 8 — Event Listed
    Browser-->>Creator: Upload complete — video live on platform
```

> [!WARNING]
> Nova group registration requires an on-chain deposit (~0.67 NEAR for paid videos). If the registration fails mid-transaction due to RPC propagation delays, the system retries up to 3 times with escalating delays (3s, 5s, 8s). On balance errors during retry, it checks whether the previous attempt succeeded on-chain before failing.

---

### Video Purchase and Watch Flow

Purchase splits payment on-chain (98% creator, 2% platform), grants Nova group membership for decryption rights, and streams decrypted video directly in the browser.

```mermaid
sequenceDiagram
    actor Viewer
    participant Browser as Browser (Next.js)
    participant NEAR as NEAR Contract<br/>(youtick.near)
    participant Nova as Nova Protocol (TEE)
    participant IPFS as Crust / IPFS Gateways

    Viewer->>Browser: Navigate to video page

    Note over Browser: Step 1 — Ownership Check
    Browser->>NEAR: get_event(cid) + check NFT ownership
    NEAR-->>Browser: Event metadata + ownership status

    alt Viewer does NOT own ticket
        Note over Browser: Step 2 — Purchase Flow
        Browser-->>Viewer: Show TicketPurchaseCard<br/>(price + cost breakdown)
        Viewer->>Browser: Confirm purchase

        Browser->>NEAR: buy_ticket(receiver_id, encrypted_cid)<br/>Attached deposit: price + 0.01 NEAR storage
        Note over NEAR: Payment Split (on-chain):<br/>98% → Creator account<br/>1% → Trial Pool<br/>1% → Commission Pool

        NEAR-->>Browser: NFT minted to viewer<br/>PurchaseLog recorded on-chain

        Note over Browser: Step 3 — Grant Access
        Browser->>Nova: addMember(group_id, viewer_account_id)
        alt Add member fails
            Browser->>Browser: Queue in pending-access-queue<br/>(retry on next page load)
        end
        Nova-->>Browser: Membership confirmed
    end

    Note over Browser: Step 4 — Fetch Encrypted Video
    Browser->>IPFS: Fetch encrypted blob<br/>(try: Crust API → ipfs.io → dweb.link → ...)
    IPFS-->>Browser: Encrypted video data

    Note over Browser: Step 5 — Retrieve AES Key from TEE
    Browser->>Nova: Retrieve decryption key<br/>(TEE verifies group membership)
    Nova-->>Browser: AES-256-GCM key

    Note over Browser: Step 6 — Decrypt and Play
    Browser->>Browser: Decrypt video with AES key (Web Crypto API)
    Browser-->>Viewer: Stream decrypted video in IpfsPlayer
```

> [!IMPORTANT]
> If Nova group membership addition fails after purchase (due to network issues), the system queues the operation in `pending-access-queue.ts`. The queue retries on subsequent page loads via the `NovaAccessSync` component, ensuring eventual consistency between NFT ownership and decryption access.

---

### Gift Link Flow

Creators can generate shareable gift links that allow recipients to claim a free NFT ticket. Each link is backed by a NEAR Function Call Access Key scoped to the `claim_gift` and `claim_gift_and_create_account` methods.

```mermaid
sequenceDiagram
    actor Creator
    participant Browser as Browser (Next.js)
    participant NEAR as NEAR Contract<br/>(youtick.near)
    actor Recipient

    Note over Creator,NEAR: Phase 1 — Gift Creation
    Creator->>Browser: Select video + number of gift links

    Browser->>Browser: Generate keypairs (one per gift link)

    Browser->>NEAR: create_gift_drop(event_cid, public_keys[])<br/>Deposit: 0.15 NEAR per link<br/>(0.10 account creation + 0.01 NFT storage + 0.04 buffer)
    Note over NEAR: For each public key:<br/>1. Add Function Call Access Key<br/>   (methods: claim_gift, claim_gift_and_create_account)<br/>2. Register gift metadata on-chain

    NEAR-->>Browser: Gift drop created

    Browser->>Browser: Generate claim URLs<br/>(embed secret key in URL fragment)
    Browser-->>Creator: Shareable gift links

    Note over Recipient,NEAR: Phase 2 — Gift Claim
    Creator-->>Recipient: Share gift link (any channel)

    Recipient->>Browser: Open claim URL

    Browser->>NEAR: is_gift_valid(public_key)
    NEAR-->>Browser: Gift metadata (event, creator, status)

    alt Recipient has NEAR account
        Browser->>NEAR: claim_gift()<br/>Signed with gift access key
    else Recipient has no NEAR account
        Browser->>NEAR: claim_gift_and_create_account(username)<br/>Creates {username}.youtick.near<br/>(0.10 NEAR from gift deposit)
    end

    Note over NEAR: 1. Delete access key (single-use)<br/>2. Mint NFT to recipient<br/>3. Refund unused deposit to creator

    NEAR-->>Browser: NFT minted

    Browser->>Nova: addMember(group_id, recipient_account)
    Nova-->>Browser: Membership confirmed

    Browser-->>Recipient: Gift claimed — video unlocked
```

> [!NOTE]
> Gift links are single-use by design. The access key is deleted on-chain during the claim transaction, preventing double-claims. Unused deposit balance (beyond account creation and storage costs) is refunded to the creator.

---

### Trial Account Flow

New users without a NEAR account can onboard through the trial system. An **Onboarding Key** (a Function Call Access Key stored in the browser) creates sponsored subaccounts under `youtick.near` and optionally claims free content.

```mermaid
sequenceDiagram
    actor NewUser as New User
    participant Browser as Browser (Next.js)
    participant OnboardKey as Onboarding Key<br/>(localStorage)
    participant NEAR as NEAR Contract<br/>(youtick.near)
    participant Nova as Nova Protocol (TEE)

    NewUser->>Browser: Visit /trial page

    Note over Browser: Step 1 — Onboarding Key Check
    Browser->>OnboardKey: Check for cached onboarding key
    alt No cached key
        Browser->>Browser: Load from NEXT_PUBLIC_ONBOARDING_KEY<br/>(Function Call Access Key)
        Browser->>OnboardKey: Store in localStorage
    end

    Note over Browser: Step 2 — Account Creation
    NewUser->>Browser: Choose username

    Browser->>NEAR: create_sponsored_trial_direct(username, new_public_key)<br/>Signed with onboarding key<br/>(0.10 NEAR from trial pool)

    Note over NEAR: 1. Deduct 0.10 NEAR from trial pool<br/>2. Create {username}.youtick.near<br/>3. Add Full Access Key for new user<br/>4. Rate limit: 100 accounts/day (default)

    NEAR-->>Browser: Account created

    Note over Browser: Step 3 — Free Content (Optional)
    Browser->>NEAR: claim_free_ticket_direct(event_cid)<br/>Signed with onboarding key<br/>(for events with price = 0)
    NEAR-->>Browser: Free NFT minted

    Browser->>Nova: addMember(group_id, new_account)
    Nova-->>Browser: Membership confirmed

    Browser-->>NewUser: Account ready + free content unlocked
```

> [!WARNING]
> The trial pool is funded by the 1% platform commission from every ticket sale. When the pool is depleted, trial account creation fails. Monitor the pool balance with `near view youtick.near get_trial_pool_balance '{}'` and top up with `fund_trial_pool` when needed.

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | Next.js (App Router) | 16.x | Pages, routing, static export |
| **UI Framework** | React | 19.x | Component rendering |
| **Language** | TypeScript | 5.x | Type safety across the codebase |
| **State Management** | TanStack React Query | 5.x | Server state, caching, background refetch |
| **Styling** | Tailwind CSS + Radix UI | 4.x | Utility-first CSS + accessible primitives |
| **Blockchain** | NEAR Protocol (near-api-js) | 7.x | On-chain operations, wallet interaction |
| **Wallet** | NEAR Wallet Selector | 10.1.4 | Multi-wallet support (MyNearWallet, Meteor) |
| **Smart Contract** | Rust + NEAR SDK | 5.5.0 | NFT ticket contract (80+ methods) |
| **NFT Standards** | NEP-171 / NEP-177 / NEP-178 | -- | Core NFT, metadata, approval management |
| **FT Standard** | NEP-141 | -- | wNEAR payment receiver (ft_on_transfer) |
| **EVM Bridge** | Wagmi + Viem | 2.x | EVM wallet connectivity |
| **Encryption** | Nova Protocol SDK (nova-sdk-js) | 1.0.3 | TEE-based AES-256-GCM encryption |
| **Storage** | Crust Network / IPFS | -- | Decentralized encrypted blob storage |
| **Testing** | Vitest | 4.x | Unit and integration tests |

---

## Security Architecture

### Encryption and Key Management

```
Video File
    │
    ▼
┌─────────────────────────────┐
│  AES-256-GCM Encryption     │
│  (Web Crypto API, browser)   │
│                              │
│  Key: Random 256-bit         │
│  IV:  Random 96-bit          │
│  Auth Tag: 128-bit           │
└──────────────┬──────────────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
  Encrypted        AES Key
  Blob → IPFS      → Nova TEE
                    (Phala Cloud)
```

| Security Layer | Mechanism | Protection |
|----------------|-----------|------------|
| **Video encryption** | AES-256-GCM (client-side, Web Crypto API) | Content confidentiality at rest and in transit |
| **Key custody** | Nova TEE on Phala Cloud (keys never leave enclave) | Key material isolation from all parties |
| **TEE attestation** | Remote attestation verification (enclave hash) | Enclave integrity proof before trusting key operations |
| **Access control** | Nova group membership (verified on-chain + in TEE) | Only NFT holders can retrieve decryption keys |
| **NFT ownership** | NEAR NEP-171 on-chain verification | Tamper-proof proof of purchase |
| **Session key limits** | Function Call Access Key (0.25 NEAR allowance, 24h TTL) | Limits damage from key compromise |
| **Prepaid withdrawal cap** | 0.1 NEAR max per withdrawal | Prevents session key abuse for fund extraction |
| **Onboarding rate limiting** | 100 trial accounts/day (configurable on-chain) | Prevents Sybil attacks on trial pool |
| **Gift link scoping** | Access keys scoped to claim_gift methods only | Gift keys cannot call arbitrary contract methods |
| **RPC failover** | 3 endpoints (fastnear, near.org, pagoda.co) | Resilience against single RPC provider failure |
| **IPFS gateway failover** | 6+ gateways with health tracking | Resilience against gateway downtime |

> [!WARNING]
> The `NEXT_PUBLIC_NOVA_API_KEY` environment variable must contain only a flag value like `"enabled"` or `"proxy-injected"` -- never the actual API secret. The real Nova API key is injected server-side by the CORS proxy (Cloudflare Worker or Next.js API route). Leaking the real key in the client bundle would allow unauthorized Nova operations.

### Threat Model Summary

| Threat | Mitigation |
|--------|------------|
| Video piracy (direct IPFS access) | Content is AES-256-GCM encrypted; raw CID yields only ciphertext |
| Key extraction from TEE | Phala Cloud SGX enclave; keys bound to enclave identity |
| Session key theft | Limited allowance (0.25 NEAR), 24h expiry, scoped to specific methods |
| Trial pool drain (Sybil) | On-chain rate limit (100/day), minimum 0.10 NEAR per account |
| Gift link replay | Access key deleted on-chain during claim (single-use) |
| RPC manipulation | FailoverRpcProvider rotates across independent providers |

---

## Design Principles

### 1. Client-Side First

Every operation runs in the user's browser. There is no centralized backend, no API server, and no database. The platform depends solely on three decentralized protocols (NEAR, Nova, Crust) and the user's browser.

| Operation | Implementation | Server Required |
|-----------|---------------|:---:|
| Video encryption / decryption | Web Crypto API + Nova SDK | No |
| NFT minting and transfers | NEAR session keys | No |
| Payment processing | NEAR smart contract (on-chain split) | No |
| Video storage and retrieval | Crust IPFS + multi-gateway failover | No |
| Gift link creation and claiming | NEAR Access Keys (Function Call) | No |
| Trial account onboarding | NEAR Onboarding Keys (on-chain) | No |
| Group access management | Nova SDK (client-side) | No |
| Content discovery | NEAR contract view calls | No |

### 2. Signless UX

Session Keys eliminate wallet confirmation popups for common operations. After a one-time wallet connection, users interact with the platform as smoothly as a Web2 application.

```
Initial Setup (one-time):
  User connects wallet → Generate Function Call Access Key →
  Store in localStorage (24h TTL) → All subsequent transactions are signless

Operations covered by session key:
  - create_event_prepaid (upload)
  - buy_ticket_prepaid (purchase)
  - deposit_funds (top-up prepaid balance)
  - withdraw_funds (withdraw prepaid balance)
```

### 3. Zero-Knowledge Encryption

Video encryption keys are generated in the browser and stored exclusively inside the Nova TEE enclave on Phala Cloud. Neither YouTick, nor IPFS gateways, nor any third party can access the decryption key. Only verified Nova group members (NFT holders) can retrieve the key from the TEE.

### 4. Progressive Decentralization

The platform prioritizes direct on-chain methods over relayer-based alternatives:

| Operation | Preferred (Direct) | Fallback (Relayer) |
|-----------|--------------------|--------------------|
| Trial account creation | Onboarding Key (on-chain) | Relayer account (server) |
| Gift claiming | Gift access key (on-chain) | -- |
| Ticket purchase | Session key (client-side) | Wallet signature |

### 5. Transparent Metrics

All decentralization-relevant operations log structured events to the browser console with the `[DECENTRALIZATION_METRIC]` prefix. This allows auditing the degree of decentralization at runtime.

```
[DECENTRALIZATION_METRIC] session_key_used: true
[DECENTRALIZATION_METRIC] nova_group_created: client-side
[DECENTRALIZATION_METRIC] ipfs_upload: crust-direct
[DECENTRALIZATION_METRIC] rpc_endpoint: fastnear (primary)
```

---

## Contract Addresses

| Contract | Network | Address | Purpose |
|----------|---------|---------|---------|
| NFT Ticket | Mainnet | `youtick.near` | Production NFT contract |
| NFT Ticket | Testnet | `v1.utick.testnet` | Test environment |
| Nova SDK | Mainnet | `nova-sdk.near` | TEE group management |
| Nova SDK | Testnet | `nova-sdk-6.testnet` | Test TEE environment |

---

## Related Documents

| Document | Description |
|----------|-------------|
| [Smart Contract](./smart-contract.md) | Contract specification, data structures, 80+ methods |
| [Nova Protocol](./nova-protocol.md) | TEE encryption architecture, group management |
| [Shade Agent](./shade-agent.md) | Phala Network TEE key management internals |
| [Session Keys](./session-keys.md) | Signless UX implementation and session lifecycle |
| [Chain Signatures](./chain-signatures.md) | NEAR MPC for cross-chain operations |
| [Storage](./storage.md) | IPFS and Crust Network storage architecture |
| [User Flows](../guides/user-flows.md) | End-to-end interaction diagrams |
