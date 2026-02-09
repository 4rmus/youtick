# Contract Methods API

> Complete reference for YouTick NFT contract methods

**Contract**: `v1.utick.testnet`
**Standard**: NEP-171 (NFT)

---

## Quick Reference

| Category | Methods |
|----------|---------|
| [Events](#event-methods) | create_event, create_event_prepaid, get_event, get_events |
| [Tickets](#ticket-methods) | buy_ticket, buy_ticket_prepaid, gift_ticket, nft_mint, nft_mint_prepaid |
| [Prepaid](#prepaid-methods) | deposit_funds, deposit_funds_for, withdraw_funds, withdraw_funds_prepaid, get_user_balance |
| [Gifts](#gift-methods) | create_gift_drop, claim_gift, claim_gift_and_create_account, is_gift_valid, get_gift_info |
| [Trials](#trial-methods) | fund_trial_pool, create_sponsored_trial, create_sponsored_trial_direct, get_trial_pool_balance |
| [Admin](#admin-methods) | add_onboarding_key, remove_onboarding_key, set_onboarding_config, set_next_token_id |
| [View](#view-methods) | verify_ownership, get_video_metadata, get_tokens_with_video, nft_metadata |

---

## Event Methods

### create_event

Create a new video event listing.

```rust
#[payable]
pub fn create_event(
    &mut self,
    encrypted_cid: String,
    title: String,
    description: String,
    price: U128
)
```

| Param | Type | Description |
|-------|------|-------------|
| `encrypted_cid` | String | Nova-encrypted IPFS CID |
| `title` | String | Event title |
| `description` | String | Event description |
| `price` | U128 | Price in yoctoNEAR (0 = free) |

**Deposit**: ≥ 0.1 NEAR
**Gas**: 30 TGas

```bash
near call v1.utick.testnet create_event \
  '{"encrypted_cid":"Qm...","title":"Concert","description":"Live show","price":"1000000000000000000000000"}' \
  --accountId creator.testnet --deposit 0.1
```

---

### create_event_prepaid

Create event using prepaid balance (Session Key compatible).

```rust
pub fn create_event_prepaid(
    &mut self,
    encrypted_cid: String,
    title: String,
    description: String,
    price: U128
)
```

**Cost**: 0.1 NEAR from prepaid balance
**Gas**: 30 TGas

---

### get_event

Get event details by CID.

```rust
pub fn get_event(&self, encrypted_cid: String) -> Option<Event>
```

**Returns**:
```json
{
  "title": "Concert",
  "description": "Live show",
  "price": "1000000000000000000000000",
  "creator_id": "creator.testnet",
  "created_at": 1706000000000000000
}
```

```bash
near view v1.utick.testnet get_event '{"encrypted_cid":"Qm..."}'
```

---

### get_events

List events with pagination.

```rust
pub fn get_events(
    &self,
    from_index: Option<U128>,
    limit: Option<u64>
) -> Vec<(String, Event)>
```

**Default limit**: 50

---

## Ticket Methods

### buy_ticket

Purchase ticket with wallet signature.

```rust
#[payable]
pub fn buy_ticket(
    &mut self,
    receiver_id: AccountId,
    encrypted_cid: String
) -> Token
```

**Deposit**: Price + 0.01 NEAR (storage)
**Revenue Split**: 98% creator, 2% platform

```bash
near call v1.utick.testnet buy_ticket \
  '{"receiver_id":"buyer.testnet","encrypted_cid":"Qm..."}' \
  --accountId buyer.testnet --deposit 1.01
```

---

### buy_ticket_prepaid

Purchase using prepaid balance (Session Key compatible).

```rust
pub fn buy_ticket_prepaid(
    &mut self,
    receiver_id: AccountId,
    encrypted_cid: String
) -> Promise
```

**Cost**: Price + 0.01 NEAR from prepaid balance

**Free tickets**: Contract pays storage, user balance unchanged.

---

### gift_ticket

Creator gifts ticket (no commission).

```rust
#[payable]
pub fn gift_ticket(
    &mut self,
    receiver_id: AccountId,
    encrypted_cid: String
) -> Token
```

**Restriction**: Only event creator can call
**Deposit**: 0.01 NEAR (storage)

---

### nft_mint

Direct NFT mint with custom metadata.

```rust
#[payable]
pub fn nft_mint(
    &mut self,
    receiver_id: AccountId,
    token_metadata: TokenMetadata,
    video_metadata: VideoMetadata
) -> Token
```

**Deposit**: ≥ 1 yoctoNEAR

---

### nft_mint_prepaid

Mint using prepaid balance.

```rust
pub fn nft_mint_prepaid(
    &mut self,
    receiver_id: AccountId,
    token_metadata: TokenMetadata,
    video_metadata: VideoMetadata
) -> Promise
```

**Cost**: 0.1 NEAR from prepaid balance

---

## Prepaid Methods

### deposit_funds

Add funds to prepaid balance.

```rust
#[payable]
pub fn deposit_funds(&mut self)
```

```bash
near call v1.utick.testnet deposit_funds '{}' \
  --accountId user.testnet --deposit 1
```

---

### deposit_funds_for

Third-party deposit for another account.

```rust
#[payable]
pub fn deposit_funds_for(&mut self, account_id: AccountId)
```

```bash
near call v1.utick.testnet deposit_funds_for \
  '{"account_id":"recipient.testnet"}' \
  --accountId donor.testnet --deposit 1
```

---

### withdraw_funds

Withdraw all prepaid funds (wallet signature).

```rust
#[payable]
pub fn withdraw_funds(&mut self) -> Promise
```

**Deposit**: 1 yoctoNEAR (security)

---

### withdraw_funds_prepaid

Withdraw without wallet (Session Key).

```rust
pub fn withdraw_funds_prepaid(&mut self) -> Promise
```

**Limit**: ≤ 0.1 NEAR (security measure)

---

### get_user_balance

Check prepaid balance.

```rust
pub fn get_user_balance(&self, account_id: AccountId) -> U128
```

```bash
near view v1.utick.testnet get_user_balance '{"account_id":"user.testnet"}'
```

---

## Gift Methods

### create_gift_drop

Create gift links with Access Keys.

```rust
#[payable]
pub fn create_gift_drop(
    &mut self,
    event_cid: String,
    public_keys: Vec<PublicKey>
)
```

**Restriction**: Only event creator
**Deposit**: 0.15 NEAR × number of keys
**Limit**: 1-50 keys per call

---

### claim_gift

Claim gift to existing account.

```rust
#[payable]
pub fn claim_gift(&mut self, receiver_id: AccountId) -> Token
```

**Called via**: Access Key from gift link
**Note**: Access key deleted after claim

---

### claim_gift_and_create_account

Claim gift and create new NEAR account.

```rust
pub fn claim_gift_and_create_account(
    &mut self,
    new_account_id: AccountId,
    new_public_key: PublicKey
) -> Promise
```

**Creates**: `{username}.{contract}` account
**Includes**: Full Access Key + NFT

---

### is_gift_valid

Check if gift key is valid.

```rust
pub fn is_gift_valid(&self, public_key: String) -> bool
```

---

### get_gift_info

Get gift drop details.

```rust
pub fn get_gift_info(&self, public_key: String) -> Option<(String, AccountId)>
```

**Returns**: `(event_cid, creator_id)`

---

### get_gift_info_full

Get complete gift drop details.

```rust
pub fn get_gift_info_full(&self, public_key: String) -> Option<GiftDrop>
```

**Returns**:
```json
{
  "creator_id": "creator.testnet",
  "event_cid": "Qm...",
  "remaining_claims": 1,
  "deposit_per_claim": "150000000000000000000000",
  "created_at": 1706000000000000000
}
```

---

## Trial Methods

### fund_trial_pool

Add funds to sponsor trial accounts.

```rust
#[payable]
pub fn fund_trial_pool(&mut self)
```

```bash
near call v1.utick.testnet fund_trial_pool '{}' \
  --accountId owner.testnet --deposit 10
```

---

### withdraw_trial_pool

Withdraw from trial pool (owner only).

```rust
pub fn withdraw_trial_pool(&mut self, amount: U128) -> Promise
```

---

### get_trial_pool_balance

Check trial pool balance.

```rust
pub fn get_trial_pool_balance(&self) -> U128
```

---

### create_sponsored_trial

Create trial account via relayer.

```rust
pub fn create_sponsored_trial(
    &mut self,
    username: String,
    new_public_key: PublicKey
) -> Promise
```

**Cost**: 0.1 NEAR from trial_pool
**Creates**: `{username}.{contract}` with Full Access Key

---

### create_sponsored_trial_direct

Create trial via onboarding key (decentralized).

```rust
pub fn create_sponsored_trial_direct(
    &mut self,
    username: String,
    new_public_key: PublicKey
) -> Promise
```

**Requires**: Signer's key in `onboarding_keys`
**Rate limited**: By daily_limit in config

---

### claim_free_ticket_sponsored

Claim free ticket with contract-paid storage.

```rust
pub fn claim_free_ticket_sponsored(
    &mut self,
    receiver_id: AccountId,
    encrypted_cid: String
) -> Promise
```

**Restriction**: Only for free tickets (price = 0)
**Cost**: 0.01 NEAR from trial_pool

---

## Admin Methods

### add_onboarding_key

Add authorized onboarding key (owner only).

```rust
pub fn add_onboarding_key(&mut self, public_key: PublicKey) -> Promise
```

**Creates**: Function Call Access Key with 1 NEAR allowance
**Scope**: `create_sponsored_trial_direct` only

---

### remove_onboarding_key

Remove onboarding key (owner only).

```rust
pub fn remove_onboarding_key(&mut self, public_key: PublicKey) -> Promise
```

---

### set_onboarding_config

Update rate limiting config (owner only).

```rust
pub fn set_onboarding_config(&mut self, daily_limit: u32, enabled: bool)
```

---

### is_onboarding_key

Check if key is authorized.

```rust
pub fn is_onboarding_key(&self, public_key: PublicKey) -> bool
```

---

### get_onboarding_config

Get current config.

```rust
pub fn get_onboarding_config(&self) -> OnboardingConfig
```

**Returns**:
```json
{
  "daily_limit": 100,
  "enabled": true
}
```

---

### get_daily_trial_count

Get today's trial creation count.

```rust
pub fn get_daily_trial_count(&self) -> u32
```

---

### set_next_token_id

Set next token ID (owner only, for recovery).

```rust
pub fn set_next_token_id(&mut self, new_id: u64)
```

---

## View Methods

### verify_ownership

Check if account owns specific token.

```rust
pub fn verify_ownership(&self, account_id: AccountId, token_id: TokenId) -> bool
```

---

### get_video_metadata

Get video metadata for token.

```rust
pub fn get_video_metadata(&self, token_id: TokenId) -> Option<VideoMetadata>
```

**Returns**:
```json
{
  "encrypted_cid": "Qm...",
  "duration_seconds": 3600,
  "event_date": 1706000000000000000,
  "content_type": "Concert"
}
```

---

### get_tokens_with_video

Get user's tokens with metadata.

```rust
pub fn get_tokens_with_video(
    &self,
    account_id: AccountId,
    from_index: Option<U128>,
    limit: Option<u64>
) -> Vec<(Token, Option<VideoMetadata>)>
```

---

### nft_metadata

Get contract metadata.

```rust
pub fn nft_metadata(&self) -> NFTContractMetadata
```

---

### get_next_token_id

Get next token ID (for batch predictions).

```rust
pub fn get_next_token_id(&self) -> u64
```

---

## NEP-171 Standard Methods

Implemented via macros:

```rust
// Core
nft_token(token_id) -> Option<Token>
nft_transfer(receiver_id, token_id, approval_id, memo)
nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)

// Enumeration
nft_total_supply() -> U128
nft_tokens(from_index, limit) -> Vec<Token>
nft_supply_for_owner(account_id) -> U128
nft_tokens_for_owner(account_id, from_index, limit) -> Vec<Token>

// Approval
nft_approve(token_id, account_id, msg) -> Option<Promise>
nft_revoke(token_id, account_id)
nft_revoke_all(token_id)
nft_is_approved(token_id, approved_account_id, approval_id) -> bool
```

---

## Type Definitions

### Event

```rust
pub struct Event {
    pub title: String,
    pub description: String,
    pub price: U128,
    pub creator_id: AccountId,
    pub created_at: u64,
}
```

### VideoMetadata

```rust
pub struct VideoMetadata {
    pub encrypted_cid: String,
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

```rust
pub struct GiftDrop {
    pub creator_id: AccountId,
    pub event_cid: String,
    pub remaining_claims: u32,
    pub deposit_per_claim: U128,
    pub created_at: u64,
}
```

### OnboardingConfig

```rust
pub struct OnboardingConfig {
    pub daily_limit: u32,
    pub enabled: bool,
}
```
