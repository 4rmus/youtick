# Smart Contract Architecture

> NFT Ticket Contract on NEAR Protocol

**Location**: `contracts/nft-ticket/src/lib.rs`
**Contract ID**: `v1.utick.testnet`
**Standard**: NEP-171 (NFT)

---

## Overview

The YouTick NFT contract extends NEP-171 with:

- **Events**: Video content metadata and pricing
- **Prepaid Balance**: "Gas Tank" for signless transactions
- **Gift Drops**: Access Key-based content sharing
- **Trial Accounts**: Sponsored onboarding system
- **Video Metadata**: Encrypted CID storage per token

---

## Data Structures

### Event

Represents a video content listing:

```rust
pub struct Event {
    pub title: String,
    pub description: String,
    pub price: U128,           // Price in yoctoNEAR (0 = free)
    pub creator_id: AccountId,
    pub created_at: u64,       // Block timestamp
}
```

### VideoMetadata

Attached to each NFT token:

```rust
pub struct VideoMetadata {
    pub encrypted_cid: String,       // Lit-encrypted IPFS CID
    pub duration_seconds: u32,
    pub event_date: Option<u64>,
    pub content_type: ContentType,
}

pub enum ContentType {
    Concert,
    Cinema,
    Exclusive,
    LiveEvent,
}
```

### GiftDrop

For Access Key-based sharing:

```rust
pub struct GiftDrop {
    pub creator_id: AccountId,
    pub event_cid: String,
    pub remaining_claims: u32,
    pub deposit_per_claim: U128,  // ~0.15 NEAR
    pub created_at: u64,
}
```

### OnboardingConfig

Rate limiting for trial accounts:

```rust
pub struct OnboardingConfig {
    pub daily_limit: u32,    // Max trials per day (0 = unlimited)
    pub enabled: bool,       // Master switch
}
```

---

## Storage Keys (V7)

Collision-safe storage prefixes:

```rust
pub const NFT: Self = Self(b"n7");
pub const TOKEN_METADATA: Self = Self(b"m7");
pub const ENUMERATION: Self = Self(b"e7");
pub const APPROVAL: Self = Self(b"a7");
pub const CONTRACT_METADATA: Self = Self(b"c7");
pub const VIDEO_METADATA: Self = Self(b"v7");
pub const USER_DEPOSITS: Self = Self(b"d7");
pub const EVENTS: Self = Self(b"x7");
pub const GIFT_DROPS: Self = Self(b"g7");
pub const ONBOARDING_KEYS: Self = Self(b"o7");
pub const DAILY_TRIAL_COUNTS: Self = Self(b"t7");
```

---

## Contract State

```rust
pub struct Contract {
    tokens: NonFungibleToken,                        // NEP-171 standard
    metadata: LazyOption<NFTContractMetadata>,       // Contract metadata
    video_metadata: UnorderedMap<TokenId, VideoMetadata>,
    user_deposits: LookupMap<AccountId, NearToken>,  // Prepaid balances
    events: UnorderedMap<String, Event>,             // CID → Event
    next_token_id: u64,
    gift_drops: LookupMap<String, GiftDrop>,         // PublicKey → GiftDrop
    trial_pool: NearToken,                           // Sponsored trial funds
    onboarding_keys: LookupSet<PublicKey>,           // Authorized trial keys
    daily_trial_counts: LookupMap<u64, u32>,         // Day → Count
    onboarding_config: OnboardingConfig,
}
```

---

## Method Categories

### Event Methods

| Method | Type | Deposit | Description |
|--------|------|---------|-------------|
| `create_event` | Change | 0.1 NEAR | Create video listing |
| `create_event_prepaid` | Change | From balance | Create via Session Key |
| `get_event` | View | - | Get event by CID |
| `get_events` | View | - | List events (paginated) |

### Ticket Methods

| Method | Type | Deposit | Description |
|--------|------|---------|-------------|
| `buy_ticket` | Change | Price + 0.01 | Purchase with wallet |
| `buy_ticket_prepaid` | Change | From balance | Purchase via Session Key |
| `gift_ticket` | Change | 0.01 NEAR | Creator gifts ticket (no commission) |
| `nft_mint` | Change | 1 yocto | Direct mint (internal) |
| `nft_mint_prepaid` | Change | From balance | Mint via Session Key |

### Prepaid Methods (Session Key)

| Method | Type | Deposit | Description |
|--------|------|---------|-------------|
| `deposit_funds` | Change | Any | Add to Gas Tank |
| `deposit_funds_for` | Change | Any | Third-party deposit |
| `withdraw_funds` | Change | 1 yocto | Withdraw all (wallet) |
| `withdraw_funds_prepaid` | Change | - | Withdraw ≤0.1 NEAR (Session Key) |
| `get_user_balance` | View | - | Check balance |

### Gift System

| Method | Type | Deposit | Description |
|--------|------|---------|-------------|
| `create_gift_drop` | Change | 0.15N × keys | Create gift links |
| `claim_gift` | Change | Via Access Key | Claim to existing account |
| `claim_gift_and_create_account` | Change | Via Access Key | Claim + create account |
| `is_gift_valid` | View | - | Check if key is valid |
| `get_gift_info` | View | - | Get gift details |

### Trial System

| Method | Type | Description |
|--------|------|-------------|
| `fund_trial_pool` | Change | Add funds for trials |
| `withdraw_trial_pool` | Change | Owner withdraws funds |
| `get_trial_pool_balance` | View | Check pool balance |
| `create_sponsored_trial` | Change | Create via relayer |
| `create_sponsored_trial_direct` | Change | Create via onboarding key |
| `add_onboarding_key` | Change | Add authorized key (owner) |
| `remove_onboarding_key` | Change | Remove key (owner) |
| `get_onboarding_config` | View | Get rate limit config |
| `get_daily_trial_count` | View | Today's trial count |

### View Methods

| Method | Description |
|--------|-------------|
| `get_video_metadata` | Get video metadata by token |
| `verify_ownership` | Check if account owns token |
| `get_tokens_with_video` | Get user's tokens with metadata |
| `nft_metadata` | Get contract metadata |
| `get_next_token_id` | Predict next token ID |

---

## Revenue Model

### Paid Tickets

```
Buyer pays: Price + 0.01 NEAR (storage)

Distribution:
├── 98% → Creator
├── 2%  → Platform (retained in contract)
└── 0.01 → Storage (retained in contract)
```

### Free Tickets

```
Buyer pays: 0 NEAR
Contract pays: 0.01 NEAR (storage from trial_pool)
```

### Gift Links

```
Creator pays: 0.15 NEAR per link

Breakdown:
├── 0.10 NEAR → Account creation (if new user)
├── 0.01 NEAR → NFT storage
└── 0.04 NEAR → Buffer
```

---

## Security Features

### Access Control

- **Owner-only**: `migrate_state`, `set_next_token_id`, `add_onboarding_key`, `remove_onboarding_key`, `set_onboarding_config`, `withdraw_trial_pool`
- **Creator-only**: `gift_ticket`, `create_gift_drop` (for their events)
- **Signer verification**: `create_sponsored_trial_direct` checks `onboarding_keys`

### Rate Limiting

```rust
// Daily trial limit
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

```rust
// Session Key withdrawals limited to 0.1 NEAR
let max_signless_withdraw = NearToken::from_millinear(100);
require!(
    current_bal <= max_signless_withdraw,
    "Amount exceeds signless limit"
);
```

### Gift Key Cleanup

```rust
// Delete access key after claim
Promise::new(env::current_account_id())
    .delete_key(env::signer_account_pk());
```

---

## NEP-171 Implementation

Standard NFT interfaces implemented via macros:

```rust
near_contract_standards::impl_non_fungible_token_core!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_approval!(Contract, tokens);
```

---

## CLI Examples

### Create Event

```bash
near call v1.utick.testnet create_event \
  '{"encrypted_cid":"Qm...","title":"Concert","description":"Live show","price":"1000000000000000000000000"}' \
  --accountId creator.testnet --deposit 0.1
```

### Buy Ticket

```bash
near call v1.utick.testnet buy_ticket \
  '{"receiver_id":"buyer.testnet","encrypted_cid":"Qm..."}' \
  --accountId buyer.testnet --deposit 1.01
```

### Check Ownership

```bash
near view v1.utick.testnet verify_ownership \
  '{"account_id":"buyer.testnet","token_id":"42"}'
```

### Fund Trial Pool

```bash
near call v1.utick.testnet fund_trial_pool '{}' \
  --accountId owner.testnet --deposit 10
```

---

## Migration

State migration resets all storage with new prefixes:

```rust
#[init(ignore_state)]
pub fn migrate_state(owner_id: AccountId) -> Self {
    require!(
        env::predecessor_account_id() == env::current_account_id(),
        "Only contract account can reset state"
    );
    // ... creates fresh state with V7 storage keys
}
```

**Note**: Migration is destructive and only callable by the contract account itself.

---

## Related Documentation

- [Contract Methods API](../api/contract-methods.md)
- [Session Keys](./session-keys.md)
- [Gift System Guide](../guides/gift-system.md)
- [Trial Accounts Guide](../guides/trial-accounts.md)
