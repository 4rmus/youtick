# Contract Methods API

> Complete reference for YouTick NFT contract methods (V8)

**Contract**: `youtick-prod-v1.near`
**Standards**: NEP-171 (Core), NEP-177 (Metadata), NEP-178 (Approval), NEP-141 (FT Receiver)
**SDK**: NEAR SDK 5.5.0

---

## Quick Reference

| Category | Methods |
|----------|---------|
| [Events](#event-methods) | create_event, create_event_prepaid, get_event, get_events, get_events_paginated, get_events_count |
| [Tickets](#ticket-methods) | buy_ticket, buy_ticket_prepaid, gift_ticket, nft_mint, nft_mint_prepaid, claim_free_ticket_sponsored |
| [Prepaid](#prepaid-methods) | deposit_funds, deposit_funds_for, withdraw_funds, withdraw_funds_prepaid, get_user_balance |
| [Gifts](#gift-methods) | create_gift_drop, claim_gift, claim_gift_and_create_account, is_gift_valid, get_gift_info, get_gift_info_full |
| [Trials](#trial-methods) | fund_trial_pool, withdraw_trial_pool, create_sponsored_trial, create_sponsored_trial_direct, get_trial_pool_balance |
| [wNEAR](#wnear-methods) | ft_on_transfer |
| [Moderation](#moderation-methods) | ban_event, unban_event, is_event_banned, get_banned_events |
| [Nova](#nova-methods) | set_nova_group, backfill_nova_groups, set_nova_platform_account, set_nova_service_fee, get_nova_platform_account, get_nova_service_fee |
| [Audit](#audit-methods) | get_purchase_log, get_purchase_logs, get_purchase_count |
| [Commission](#commission-methods) | get_commission_pool, withdraw_commission |
| [Admin](#admin-methods) | add_onboarding_key, remove_onboarding_key, set_onboarding_config, set_next_token_id |
| [View](#view-methods) | verify_ownership, get_video_metadata, get_tokens_with_video, nft_metadata, get_next_token_id |
| [NEP-171](#nep-171-standard) | nft_token, nft_transfer, nft_transfer_call, nft_total_supply, nft_tokens, nft_approve, ... |

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

**Deposit**: >= 0.1 NEAR
**Gas**: 30 TGas

```bash
near call youtick-prod-v1.near create_event \
  '{"encrypted_cid":"Qm...","title":"Concert","description":"Live show","price":"1000000000000000000000000"}' \
  --accountId creator.near --deposit 0.1
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

Get event details by CID. Returns `EventResponse` with USD price and ban status (V8).

```rust
pub fn get_event(&self, encrypted_cid: String) -> Option<EventResponse>
```

**Returns**:
```json
{
  "title": "Concert",
  "description": "Live show",
  "price": "1000000000000000000000000",
  "creator_id": "creator.near",
  "created_at": 1706000000000000000,
  "price_usd": 500,
  "banned": false,
  "ban_reason": null
}
```

```bash
near view youtick-prod-v1.near get_event '{"encrypted_cid":"Qm..."}'
```

---

### get_events

List events with pagination. Excludes banned events.

```rust
pub fn get_events(
    &self,
    from_index: Option<U128>,
    limit: Option<u64>
) -> Vec<(String, EventResponse)>
```

**Default limit**: 50, **Max limit**: 100

---

### get_events_paginated

Cursor-based pagination with total count (V8).

```rust
pub fn get_events_paginated(
    &self,
    cursor: Option<String>,
    limit: Option<u64>
) -> PaginatedEventsResponse
```

**Returns**:
```json
{
  "events": [["cid1", { ... }], ["cid2", { ... }]],
  "next_cursor": "cid_after_last",
  "total_count": 42
}
```

---

### get_events_count

Total count of non-banned events.

```rust
pub fn get_events_count(&self) -> u64
```

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
**Revenue**: 98% creator, 1% trial pool, 1% commission pool
**Blocked**: If event is banned

```bash
near call youtick-prod-v1.near buy_ticket \
  '{"receiver_id":"buyer.near","encrypted_cid":"Qm..."}' \
  --accountId buyer.near --deposit 1.01
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
**Free tickets**: Contract pays storage from trial pool.

---

### gift_ticket

Creator gifts ticket (no commission charged).

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

**Deposit**: >= 1 yoctoNEAR

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

## Prepaid Methods

### deposit_funds

Add funds to prepaid balance ("Gas Tank").

```rust
#[payable]
pub fn deposit_funds(&mut self)
```

```bash
near call youtick-prod-v1.near deposit_funds '{}' \
  --accountId user.near --deposit 1
```

---

### deposit_funds_for

Third-party deposit for another account.

```rust
#[payable]
pub fn deposit_funds_for(&mut self, account_id: AccountId)
```

---

### withdraw_funds

Withdraw all prepaid funds (wallet signature required).

```rust
#[payable]
pub fn withdraw_funds(&mut self) -> Promise
```

**Deposit**: 1 yoctoNEAR (security)

---

### withdraw_funds_prepaid

Withdraw without wallet (Session Key compatible).

```rust
pub fn withdraw_funds_prepaid(&mut self) -> Promise
```

**Limit**: <= 0.1 NEAR (security measure)

---

### get_user_balance

Check prepaid balance.

```rust
pub fn get_user_balance(&self, account_id: AccountId) -> U128
```

```bash
near view youtick-prod-v1.near get_user_balance '{"account_id":"user.near"}'
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
**Deposit**: 0.15 NEAR x number of keys
**Limit**: 1-50 keys per call
**Blocked**: If event is banned

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

**Creates**: `{username}.{contract}` account with Full Access Key + NFT

---

### is_gift_valid

Check if gift key is valid.

```rust
pub fn is_gift_valid(&self, public_key: String) -> bool
```

---

### get_gift_info

Get basic gift drop details.

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
  "creator_id": "creator.near",
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
near call youtick-prod-v1.near fund_trial_pool '{}' \
  --accountId owner.near --deposit 10
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

Create trial via onboarding key (decentralized, no relayer).

```rust
pub fn create_sponsored_trial_direct(
    &mut self,
    username: String,
    new_public_key: PublicKey
) -> Promise
```

**Requires**: Signer's key in `onboarding_keys`
**Rate limited**: By `daily_limit` in OnboardingConfig

---

## wNEAR Methods

### ft_on_transfer

Receive wNEAR and process ticket purchase (NEP-141 receiver).

```rust
pub fn ft_on_transfer(
    &mut self,
    sender_id: AccountId,
    amount: U128,
    msg: String
) -> PromiseOrValue<U128>
```

The `msg` field is a JSON string containing the event CID and receiver. The contract processes the purchase with the same 98/2 revenue split as direct NEAR payments.

---

## Moderation Methods

### ban_event

Ban event with typed reason (owner only).

```rust
pub fn ban_event(&mut self, encrypted_cid: String, reason: BanReason)
```

**BanReason values**: `SexualContent`, `CopyrightViolation`, `Other`

```bash
near call youtick-prod-v1.near ban_event \
  '{"encrypted_cid":"Qm...","reason":"CopyrightViolation"}' \
  --accountId youtick-prod-v1.near
```

---

### unban_event

Remove ban from event (owner only).

```rust
pub fn unban_event(&mut self, encrypted_cid: String)
```

---

### is_event_banned

Check if event is banned.

```rust
pub fn is_event_banned(&self, encrypted_cid: String) -> bool
```

---

### get_banned_events

List all banned events (owner only).

```rust
pub fn get_banned_events(&self) -> Vec<(String, BanInfo)>
```

---

## Nova Methods

### set_nova_group

Set Nova group ID for a token. Also stores in `event_nova_groups` mapping.

```rust
pub fn set_nova_group(&mut self, token_id: TokenId, nova_group_id: String)
```

**Restriction**: Only token owner or event creator

---

### backfill_nova_groups

Index all Nova groups from existing tokens into `event_nova_groups` mapping (owner only).

```rust
pub fn backfill_nova_groups(&mut self) -> u32
```

**Returns**: Number of backfilled entries

---

### set_nova_platform_account

Set Nova platform account for auto-funding (owner only).

```rust
pub fn set_nova_platform_account(&mut self, account_id: AccountId)
```

---

### set_nova_service_fee

Set Nova service fee per ticket (owner only).

```rust
pub fn set_nova_service_fee(&mut self, fee: U128)
```

---

### get_nova_platform_account

Get configured Nova platform account.

```rust
pub fn get_nova_platform_account(&self) -> Option<AccountId>
```

---

### get_nova_service_fee

Get configured Nova service fee.

```rust
pub fn get_nova_service_fee(&self) -> U128
```

---

## Audit Methods

### get_purchase_log

Get single purchase log by ID.

```rust
pub fn get_purchase_log(&self, purchase_id: u64) -> Option<PurchaseLog>
```

**Returns**:
```json
{
  "buyer_id": "buyer.near",
  "creator_id": "creator.near",
  "event_cid": "Qm...",
  "token_id": "42",
  "price": "1000000000000000000000000",
  "creator_amount": "980000000000000000000000",
  "commission_amount": "20000000000000000000000",
  "purchase_type": "Direct",
  "timestamp_ns": 1706000000000000000
}
```

---

### get_purchase_logs

List purchase logs with pagination.

```rust
pub fn get_purchase_logs(
    &self,
    from_index: Option<u64>,
    limit: Option<u64>
) -> Vec<(u64, PurchaseLog)>
```

**Default limit**: 50, **Max limit**: 100

```bash
near view youtick-prod-v1.near get_purchase_logs '{"from_index":0,"limit":10}'
```

---

### get_purchase_count

Total number of purchases.

```rust
pub fn get_purchase_count(&self) -> u64
```

---

## Commission Methods

### get_commission_pool

Check commission pool balance.

```rust
pub fn get_commission_pool(&self) -> U128
```

---

### withdraw_commission

Withdraw from commission pool (owner only).

```rust
pub fn withdraw_commission(&mut self, amount: U128) -> Promise
```

---

## Admin Methods

### add_onboarding_key

Add authorized onboarding key (owner only).

```rust
pub fn add_onboarding_key(&mut self, public_key: PublicKey) -> Promise
```

**Creates**: Function Call Access Key with 1 NEAR allowance, scoped to `create_sponsored_trial_direct`

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

Check if key is authorized for onboarding.

```rust
pub fn is_onboarding_key(&self, public_key: PublicKey) -> bool
```

---

### get_onboarding_config

Get current onboarding configuration.

```rust
pub fn get_onboarding_config(&self) -> OnboardingConfig
```

**Returns**:
```json
{ "daily_limit": 100, "enabled": true }
```

---

### get_daily_trial_count

Get today's trial creation count.

```rust
pub fn get_daily_trial_count(&self) -> u32
```

---

### set_next_token_id

Set next token ID (owner only, for recovery scenarios).

```rust
pub fn set_next_token_id(&mut self, new_id: u64)
```

---

## View Methods

### verify_ownership

Check if account owns a ticket for a specific video.

```rust
pub fn verify_ownership(&self, account_id: AccountId, token_id: TokenId) -> bool
```

```bash
near view youtick-prod-v1.near verify_ownership \
  '{"account_id":"buyer.near","token_id":"42"}'
```

---

### get_video_metadata

Get video metadata for a token.

```rust
pub fn get_video_metadata(&self, token_id: TokenId) -> Option<VideoMetadata>
```

**Returns**:
```json
{
  "encrypted_cid": "Qm...",
  "duration_seconds": 3600,
  "event_date": 1706000000000000000,
  "content_type": "Concert",
  "nova_group_id": "group-abc123",
  "storage_type": "Nova"
}
```

---

### get_tokens_with_video

Get user's tokens with video metadata.

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

**Returns**:
```json
{
  "spec": "nft-2.0.0",
  "name": "YouTick Video Tickets",
  "symbol": "YTICK"
}
```

---

### get_next_token_id

Get next token ID (for batch predictions).

```rust
pub fn get_next_token_id(&self) -> u64
```

---

## NEP-171 Standard

Implemented via NEAR contract standards macros:

### Core (NEP-171)

```rust
nft_token(token_id: TokenId) -> Option<Token>
nft_transfer(receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>)
nft_transfer_call(receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>, msg: String) -> PromiseOrValue<bool>
```

### Enumeration (NEP-177)

```rust
nft_total_supply() -> U128
nft_tokens(from_index: Option<U128>, limit: Option<u64>) -> Vec<Token>
nft_supply_for_owner(account_id: AccountId) -> U128
nft_tokens_for_owner(account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token>
```

### Approval (NEP-178)

```rust
nft_approve(token_id: TokenId, account_id: AccountId, msg: Option<String>) -> Option<Promise>
nft_revoke(token_id: TokenId, account_id: AccountId)
nft_revoke_all(token_id: TokenId)
nft_is_approved(token_id: TokenId, approved_account_id: AccountId, approval_id: Option<u64>) -> bool
```

---

## Type Definitions

### EventResponse (V8)

```rust
pub struct EventResponse {
    pub title: String,
    pub description: String,
    pub price: U128,
    pub creator_id: AccountId,
    pub created_at: u64,
    pub price_usd: Option<u128>,
    pub banned: Option<bool>,
    pub ban_reason: Option<String>,
}
```

### PaginatedEventsResponse (V8)

```rust
pub struct PaginatedEventsResponse {
    pub events: Vec<(String, EventResponse)>,
    pub next_cursor: Option<String>,
    pub total_count: u64,
}
```

### VideoMetadata

```rust
pub struct VideoMetadata {
    pub encrypted_cid: String,
    pub duration_seconds: u32,
    pub event_date: Option<u64>,
    pub content_type: ContentType,
    pub nova_group_id: Option<String>,
    pub storage_type: StorageType,
}

pub enum ContentType { Concert, Cinema, Exclusive, LiveEvent }
pub enum StorageType { Nova }
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

### PurchaseLog (V6+)

```rust
pub struct PurchaseLog {
    pub buyer_id: AccountId,
    pub creator_id: AccountId,
    pub event_cid: String,
    pub token_id: String,
    pub price: U128,
    pub creator_amount: U128,
    pub commission_amount: U128,
    pub purchase_type: PurchaseType,
    pub timestamp_ns: u64,
}

pub enum PurchaseType { Direct, Prepaid, Free }
```

### BanInfo (V8)

```rust
pub enum BanReason { SexualContent, CopyrightViolation, Other }

pub struct BanInfo {
    pub reason: BanReason,
    pub banned_at: u64,
    pub banned_by: AccountId,
}
```

### OnboardingConfig

```rust
pub struct OnboardingConfig {
    pub daily_limit: u32,
    pub enabled: bool,
}
```
