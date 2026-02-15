# Smart Contract Architecture

> NFT Ticket Contract V8 on NEAR Protocol

**Location**: `contracts/nft-ticket/src/lib.rs` (2400+ lines)
**Contract ID**: `youtick.near`
**SDK**: NEAR SDK 5.5.0
**Standards**: NEP-171 (Core), NEP-177 (Metadata), NEP-178 (Approval), NEP-141 (FT Receiver)

---

## Overview

The YouTick NFT contract extends the NEP-171 standard with domain-specific subsystems for video content monetization:

| Subsystem | Purpose | Version Introduced |
|-----------|---------|:------------------:|
| **Events** | Video content metadata and pricing | V1 |
| **Prepaid Balance** | "Gas Tank" for signless transactions via Session Keys | V1 |
| **Gift Drops** | Access-key-based content sharing | V1 |
| **Trial Accounts** | Sponsored onboarding (relayer-less) | V4 |
| **Commission Pool** | Platform revenue tracking (50% of 2%) | V5 |
| **Purchase Audit** | On-chain purchase logs with typed entries | V6 |
| **Nova Group Index** | Event-level Nova group mapping for ticket copies | V7 |
| **Nova Auto-Funding** | Platform account for Nova service fees | V8 |
| **Content Moderation** | On-chain ban system with typed reasons | V8 |
| **USD Price Tracking** | Optional USD price storage per event | V8 |

---

## Storage Architecture (V8)

### Storage Keys

All collections use two-byte collision-safe prefixes. The version suffix (`8`) prevents key collisions during state migrations.

```rust
impl StorageKey {
    pub const NFT: Self              = Self(b"n8");   // NEP-171 token data
    pub const TOKEN_METADATA: Self   = Self(b"m8");   // NEP-177 token metadata
    pub const ENUMERATION: Self      = Self(b"e8");   // NEP-177 enumeration
    pub const APPROVAL: Self         = Self(b"a8");   // NEP-178 approval
    pub const CONTRACT_METADATA: Self = Self(b"c8");  // NFT contract metadata
    pub const VIDEO_METADATA: Self   = Self(b"v8");   // Video metadata per token
    pub const USER_DEPOSITS: Self    = Self(b"d8");   // Prepaid balances
    pub const EVENTS: Self           = Self(b"x8");   // CID -> Event mapping
    pub const GIFT_DROPS: Self       = Self(b"g8");   // Key hash -> GiftDrop
    pub const ONBOARDING_KEYS: Self  = Self(b"o8");   // Authorized trial keys
    pub const DAILY_TRIAL_COUNTS: Self = Self(b"t8"); // Day -> count
    pub const PURCHASE_LOGS: Self    = Self(b"p8");   // Purchase audit trail
    pub const EVENT_NOVA_GROUPS: Self = Self(b"ng8"); // CID -> Nova group ID
    pub const EVENT_PRICE_USD: Self  = Self(b"pu8");  // CID -> USD price (lazy)
    pub const BANNED_EVENTS: Self    = Self(b"be8");  // CID -> BanInfo (lazy)
}
```

### Lazy Storage Pattern

To avoid costly state migrations, some V8 collections use **lazy LookupMaps** that are instantiated on demand rather than stored in the `Contract` borsh struct:

```rust
// Lazy storage - not part of Contract borsh, instantiated on-demand
fn lazy_event_price_usd(&self) -> LookupMap<String, u128> {
    LookupMap::new(StorageKey::EVENT_PRICE_USD)
}

fn lazy_banned_events(&self) -> LookupMap<String, BanInfo> {
    LookupMap::new(StorageKey::BANNED_EVENTS)
}
```

This pattern allows adding new storage collections without a state migration, since the `LookupMap` is reconstructed from its storage prefix each time it is accessed.

---

## Data Structures

### Event

Represents a video content listing. Events are keyed by the encrypted CID (UUID).

```rust
pub struct Event {
    pub title: String,
    pub description: String,
    pub price: U128,            // Price in yoctoNEAR (0 = free)
    pub creator_id: AccountId,
    pub created_at: u64,        // Block timestamp (nanoseconds)
}
```

### EventResponse (V8)

JSON response struct enriched with USD price and ban status from lazy storage:

```rust
pub struct EventResponse {
    pub title: String,
    pub description: String,
    pub price: U128,
    pub creator_id: AccountId,
    pub created_at: u64,
    pub price_usd: Option<u128>,    // USD price (if set)
    pub banned: Option<bool>,       // Ban status
    pub ban_reason: Option<String>, // Ban reason (if banned)
}
```

### PaginatedEventsResponse (V8)

Cursor-based pagination for efficient event listing:

```rust
pub struct PaginatedEventsResponse {
    pub events: Vec<(String, EventResponse)>,
    pub next_cursor: Option<String>,
    pub total_count: u64,
}
```

### VideoMetadata

Attached to each NFT token. Includes Nova group reference for access control.

```rust
pub struct VideoMetadata {
    pub encrypted_cid: String,            // IPFS CID (Nova-encrypted)
    pub duration_seconds: u32,
    pub event_date: Option<u64>,
    pub content_type: ContentType,
    pub nova_group_id: Option<String>,    // Nova group for access control
    pub storage_type: StorageType,        // Encryption method
}

pub enum ContentType { Concert, Cinema, Exclusive, LiveEvent }
pub enum StorageType { Nova }  // TEE-based encryption
```

### GiftDrop

For access-key-based sharing:

```rust
pub struct GiftDrop {
    pub creator_id: AccountId,
    pub event_cid: String,
    pub remaining_claims: u32,
    pub deposit_per_claim: U128,  // ~0.15 NEAR per claim
    pub created_at: u64,
}
```

### PurchaseLog (V6+)

On-chain audit trail for every ticket purchase:

```rust
pub struct PurchaseLog {
    pub buyer_id: AccountId,
    pub creator_id: AccountId,
    pub event_cid: String,
    pub token_id: String,
    pub price: U128,
    pub creator_amount: U128,      // 98% of price
    pub commission_amount: U128,   // 2% of price
    pub purchase_type: PurchaseType,
    pub timestamp_ns: u64,
}

pub enum PurchaseType {
    Direct,   // buy_ticket (wallet signature)
    Prepaid,  // buy_ticket_prepaid (session key)
    Free,     // price == 0
}
```

### BanInfo (V8)

Content moderation data:

```rust
pub enum BanReason { SexualContent, CopyrightViolation, Other }

pub struct BanInfo {
    pub reason: BanReason,
    pub banned_at: u64,
    pub banned_by: AccountId,
}
```

### OnboardingConfig

Rate limiting for trial account creation:

```rust
pub struct OnboardingConfig {
    pub daily_limit: u32,  // Max trials per day (0 = unlimited, default: 100)
    pub enabled: bool,     // Master switch
}
```

---

## Contract State (V8)

```rust
pub struct Contract {
    // NEP-171 Standard
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,

    // YouTick Core
    video_metadata: UnorderedMap<TokenId, VideoMetadata>,
    events: UnorderedMap<String, Event>,              // CID -> Event
    next_token_id: u64,

    // Prepaid Balance System (Session Keys)
    user_deposits: LookupMap<AccountId, NearToken>,

    // Gift Drop System
    gift_drops: LookupMap<String, GiftDrop>,          // Key hash -> GiftDrop

    // Trial Account System (V4)
    trial_pool: NearToken,
    onboarding_keys: LookupSet<PublicKey>,
    daily_trial_counts: LookupMap<u64, u32>,
    onboarding_config: OnboardingConfig,

    // Commission Pool (V5)
    commission_pool: NearToken,

    // Purchase Audit Trail (V6)
    purchase_logs: UnorderedMap<u64, PurchaseLog>,
    next_purchase_id: u64,

    // Nova Group Index (V7)
    event_nova_groups: LookupMap<String, String>,     // CID -> Nova Group ID

    // Nova Auto-Funding (V8)
    nova_platform_account: Option<AccountId>,
    nova_service_fee: NearToken,

    // Lazy Storage (V8) - not in Contract borsh struct
    // event_price_usd: LookupMap<String, u128>       // StorageKey::EVENT_PRICE_USD
    // banned_events: LookupMap<String, BanInfo>       // StorageKey::BANNED_EVENTS
}
```

---

## Method Reference

### Event Methods

| Method | Type | Deposit | Description |
|--------|------|---------|-------------|
| `create_event` | Change | 0.1 NEAR | Create video listing |
| `create_event_prepaid` | Change | From balance | Create via Session Key |
| `get_event` | View | -- | Get event by CID (includes USD price, ban status) |
| `get_events` | View | -- | List events (paginated, excludes banned) |
| `get_events_paginated` | View | -- | Cursor-based pagination with total count |
| `get_events_count` | View | -- | Total non-banned event count |

### Ticket Methods

| Method | Type | Deposit | Description |
|--------|------|---------|-------------|
| `buy_ticket` | Change | Price + 0.01 | Purchase with wallet |
| `buy_ticket_prepaid` | Change | From balance | Purchase via Session Key |
| `gift_ticket` | Change | 0.01 NEAR | Creator gifts ticket (no commission) |
| `nft_mint` | Change | 1 yocto | Direct mint with metadata |
| `nft_mint_prepaid` | Change | From balance | Mint via Session Key |
| `claim_free_ticket_sponsored` | Change | -- | Free ticket, storage from trial_pool |

### Prepaid Balance Methods

| Method | Type | Deposit | Description |
|--------|------|---------|-------------|
| `deposit_funds` | Change | Any | Add to Gas Tank |
| `deposit_funds_for` | Change | Any | Third-party deposit |
| `withdraw_funds` | Change | 1 yocto | Withdraw all (wallet) |
| `withdraw_funds_prepaid` | Change | -- | Withdraw <=0.1 NEAR (Session Key) |
| `get_user_balance` | View | -- | Check balance |

### Gift System

| Method | Type | Deposit | Description |
|--------|------|---------|-------------|
| `create_gift_drop` | Change | 0.15N x keys | Create gift links (1-50 per call) |
| `claim_gift` | Change | Via Access Key | Claim to existing account |
| `claim_gift_and_create_account` | Change | Via Access Key | Claim + create account |
| `is_gift_valid` | View | -- | Check if key is valid |
| `get_gift_info` | View | -- | Get `(event_cid, creator_id)` |
| `get_gift_info_full` | View | -- | Get full GiftDrop details |

### Trial System

| Method | Type | Description |
|--------|------|-------------|
| `fund_trial_pool` | Change | Add funds for sponsored trials |
| `withdraw_trial_pool` | Change | Owner withdraws funds |
| `get_trial_pool_balance` | View | Check pool balance |
| `create_sponsored_trial` | Change | Create via relayer |
| `create_sponsored_trial_direct` | Change | Create via onboarding key (decentralized) |

### wNEAR Integration (NEP-141)

| Method | Type | Description |
|--------|------|-------------|
| `ft_on_transfer` | Change | Receive wNEAR and process ticket purchase |

The contract implements `ft_on_transfer` to accept wNEAR (wrapped NEAR) payments. When wNEAR is sent to the contract, it automatically processes a ticket purchase using the `msg` field to determine the event CID and receiver.

### Content Moderation (V8)

| Method | Type | Description |
|--------|------|-------------|
| `ban_event` | Change | Ban event with BanReason (owner only) |
| `unban_event` | Change | Remove ban (owner only) |
| `is_event_banned` | View | Check ban status |
| `get_banned_events` | View | List all banned events (owner only) |

Banned events are excluded from `get_events`, `get_events_paginated`, and cannot have tickets purchased.

### Nova Integration (V7-V8)

| Method | Type | Description |
|--------|------|-------------|
| `set_nova_group` | Change | Set Nova group for a token (creator or owner) |
| `backfill_nova_groups` | Change | Index all Nova groups from existing tokens (owner) |
| `set_nova_platform_account` | Change | Set Nova platform account (owner) |
| `set_nova_service_fee` | Change | Set Nova service fee per ticket (owner) |
| `get_nova_platform_account` | View | Get Nova platform account |
| `get_nova_service_fee` | View | Get Nova service fee |

### Purchase Audit (V6+)

| Method | Type | Description |
|--------|------|-------------|
| `get_purchase_log` | View | Get single purchase log by ID |
| `get_purchase_logs` | View | List purchase logs (paginated) |
| `get_purchase_count` | View | Total purchase count |

### Commission Management (V5+)

| Method | Type | Description |
|--------|------|-------------|
| `get_commission_pool` | View | Check commission pool balance |
| `withdraw_commission` | Change | Withdraw commission (owner only) |

### Admin Methods

| Method | Type | Description |
|--------|------|-------------|
| `add_onboarding_key` | Change | Add authorized trial key (owner) |
| `remove_onboarding_key` | Change | Remove trial key (owner) |
| `set_onboarding_config` | Change | Update rate limiting (owner) |
| `is_onboarding_key` | View | Check if key is authorized |
| `get_onboarding_config` | View | Get rate limit config |
| `get_daily_trial_count` | View | Today's trial count |
| `set_next_token_id` | Change | Set next token ID (owner, recovery) |

### NEP-171 Standard Methods

```rust
// Core (NEP-171)
nft_token(token_id) -> Option<Token>
nft_transfer(receiver_id, token_id, approval_id, memo)
nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)

// Enumeration (NEP-177)
nft_total_supply() -> U128
nft_tokens(from_index, limit) -> Vec<Token>
nft_supply_for_owner(account_id) -> U128
nft_tokens_for_owner(account_id, from_index, limit) -> Vec<Token>

// Approval (NEP-178)
nft_approve(token_id, account_id, msg) -> Option<Promise>
nft_revoke(token_id, account_id)
nft_revoke_all(token_id)
nft_is_approved(token_id, approved_account_id, approval_id) -> bool
```

### View Utilities

| Method | Type | Description |
|--------|------|-------------|
| `verify_ownership` | View | Check if account owns specific token |
| `get_video_metadata` | View | Get video metadata for token |
| `get_tokens_with_video` | View | Get user's tokens with video metadata |
| `nft_metadata` | View | Get contract metadata (YTICK) |
| `get_next_token_id` | View | Predict next token ID |

---

## Revenue Model

### Paid Tickets

```
Buyer pays: Price + 0.01 NEAR (storage deposit)

Distribution:
├── 98% --> Creator account (direct transfer)
├── 1%  --> Trial Pool (sponsors new user accounts)
├── 1%  --> Commission Pool (platform revenue)
└── 0.01 NEAR --> Storage (retained in contract)
```

### Free Tickets

```
Buyer pays: 0 NEAR
Contract pays: 0.01 NEAR storage (from trial_pool)
```

### Gift Links

```
Creator pays: 0.15 NEAR per link

Breakdown:
├── 0.10 NEAR --> Account creation (if new user)
├── 0.01 NEAR --> NFT storage deposit
└── 0.04 NEAR --> Buffer for gas and key storage
```

### wNEAR Payments

The contract accepts wrapped NEAR via `ft_on_transfer` (NEP-141). The revenue split is identical to direct NEAR purchases.

---

## Security Features

### Access Control

| Scope | Methods |
|-------|---------|
| **Owner-only** | `migrate_state`, `set_next_token_id`, `add_onboarding_key`, `remove_onboarding_key`, `set_onboarding_config`, `withdraw_trial_pool`, `withdraw_commission`, `set_nova_platform_account`, `set_nova_service_fee`, `ban_event`, `unban_event`, `get_banned_events`, `backfill_nova_groups` |
| **Creator-only** | `gift_ticket`, `create_gift_drop` (for their events) |
| **Token owner** | `set_nova_group` (for their tokens) |
| **Onboarding key** | `create_sponsored_trial_direct` (signer must be in `onboarding_keys`) |

### Rate Limiting

Daily trial creation is rate-limited on-chain:

```rust
fn check_and_increment_daily_limit(&mut self) -> bool {
    let today = Self::get_day_timestamp();
    let current = self.daily_trial_counts.get(&today).unwrap_or(0);

    if self.onboarding_config.daily_limit > 0
        && current >= self.onboarding_config.daily_limit {
        return false;
    }

    self.daily_trial_counts.insert(&today, &(current + 1));
    true
}
```

### Withdrawal Limits

Session Key withdrawals are capped at 0.1 NEAR:

```rust
let max_signless_withdraw = NearToken::from_millinear(100);
require!(
    current_bal <= max_signless_withdraw,
    "Amount exceeds signless limit"
);
```

### Content Moderation

Banned events are excluded from all listing endpoints and cannot have tickets purchased or gifts created. The ban check is enforced in `buy_ticket`, `buy_ticket_prepaid`, `create_gift_drop`, `claim_gift`, and `claim_free_ticket_sponsored`.

### Gift Key Cleanup

Access keys are deleted after a single claim, preventing replay attacks:

```rust
Promise::new(env::current_account_id())
    .delete_key(env::signer_account_pk());
```

---

## State Migration History

| Version | Migration | New Fields |
|---------|-----------|------------|
| V4 -> V5 | Add commission tracking | `commission_pool` |
| V5 -> V6 | Add purchase audit trail | `purchase_logs`, `next_purchase_id` |
| V6 -> V7 | Add Nova group index | `event_nova_groups` |
| V7 -> V8 | Add Nova auto-funding | `nova_platform_account`, `nova_service_fee` |
| V8 (lazy) | No migration needed | `event_price_usd`, `banned_events` (lazy storage) |

The current migration function reads V7 state (`OldContractV7`) and constructs V8 state with the new `nova_platform_account` and `nova_service_fee` fields. Migration is `#[private]` and `#[init(ignore_state)]`, callable only by the contract account itself.

---

## CLI Examples

### Create Event

```bash
near call youtick.near create_event \
  '{"encrypted_cid":"Qm...","title":"Concert","description":"Live show","price":"1000000000000000000000000"}' \
  --accountId creator.near --deposit 0.1
```

### Buy Ticket

```bash
near call youtick.near buy_ticket \
  '{"receiver_id":"buyer.near","encrypted_cid":"Qm..."}' \
  --accountId buyer.near --deposit 1.01
```

### Check Ownership

```bash
near view youtick.near verify_ownership \
  '{"account_id":"buyer.near","token_id":"42"}'
```

### Ban Event (Owner)

```bash
near call youtick.near ban_event \
  '{"encrypted_cid":"Qm...","reason":"CopyrightViolation"}' \
  --accountId youtick.near
```

### Get Purchase Logs

```bash
near view youtick.near get_purchase_logs \
  '{"from_index":0,"limit":10}'
```

### Fund Trial Pool

```bash
near call youtick.near fund_trial_pool '{}' \
  --accountId owner.near --deposit 10
```

---

## Related Documentation

- [Contract Methods API](../api/contract-methods.md) -- Full method reference with parameters
- [Architecture Overview](./README.md) -- System diagram and data flows
- [Session Keys](./session-keys.md) -- Signless UX implementation
- [Nova Protocol](./nova-protocol.md) -- TEE encryption integration
- [User Flows](../guides/user-flows.md) -- End-to-end flow diagrams
