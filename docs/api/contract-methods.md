# YouTick NFT Ticket Contract -- API Reference

> Definitive reference for all public methods on the YouTick NFT ticket smart contract.

**Contract Account**: `youtick.near`
**Network**: NEAR Mainnet
**Standards**: NEP-171 (Core), NEP-177 (Metadata), NEP-178 (Approval), NEP-141 (FT Receiver)
**SDK**: NEAR SDK 5.1.0+
**Storage Version**: V8+ (collision-safe keys)

---

## Table of Contents

- [Quick Reference](#quick-reference)
- [1. Event Management](#1-event-management)
- [2. Ticket Purchase](#2-ticket-purchase)
- [3. Prepaid Balance (Gas Tank / Session Keys)](#3-prepaid-balance-gas-tank--session-keys)
- [4. wNEAR Integration](#4-wnear-integration)
- [5. NFT Minting](#5-nft-minting)
- [6. Gift Drops (Access Key Based)](#6-gift-drops-access-key-based)
- [7. Trial Accounts (Sponsored)](#7-trial-accounts-sponsored)
- [8. Onboarding Configuration (Admin)](#8-onboarding-configuration-admin)
- [9. Nova Protocol Integration](#9-nova-protocol-integration)
- [10. NEP-171 NFT Standard](#10-nep-171-nft-standard)
- [11. Admin and Moderation](#11-admin-and-moderation)
- [12. Commission Management](#12-commission-management)
- [13. Purchase Logs and Analytics](#13-purchase-logs-and-analytics)
- [14. Token and Video Metadata](#14-token-and-video-metadata)
- [15. Web4 Gateway](#15-web4-gateway)
- [Data Models](#data-models)
- [Storage Keys Reference](#storage-keys-reference)
- [Constants Reference](#constants-reference)

---

## Quick Reference

| Category | Methods | Count |
|----------|---------|-------|
| [Event Management](#1-event-management) | `create_event`, `create_event_prepaid`, `get_event`, `get_events`, `get_events_paginated`, `get_events_count` | 6 |
| [Ticket Purchase](#2-ticket-purchase) | `buy_ticket`, `buy_ticket_prepaid`, `buy_ticket_internal` | 3 |
| [Prepaid Balance](#3-prepaid-balance-gas-tank--session-keys) | `deposit_funds`, `deposit_funds_for`, `get_user_balance`, `withdraw_funds`, `withdraw_funds_prepaid` | 5 |
| [wNEAR Integration](#4-wnear-integration) | `ft_on_transfer`, `on_wnear_unwrap_for_purchase` | 2 |
| [NFT Minting](#5-nft-minting) | `nft_mint`, `nft_mint_prepaid`, `nft_mint_internal`, `on_nft_mint_prepaid_callback`, `gift_ticket` | 5 |
| [Gift Drops](#6-gift-drops-access-key-based) | `create_gift_drop`, `claim_gift`, `claim_gift_and_create_account`, `on_account_created`, `is_gift_valid`, `get_gift_info`, `get_gift_info_full` | 7 |
| [Trial Accounts](#7-trial-accounts-sponsored) | `fund_trial_pool`, `withdraw_trial_pool`, `get_trial_pool_balance`, `create_sponsored_trial_direct`, `create_sponsored_trial`, `claim_free_ticket_direct`, `claim_free_ticket_sponsored`, `upgrade_trial_account`, `get_daily_trial_count` | 9 |
| [Onboarding Config](#8-onboarding-configuration-admin) | `add_onboarding_key`, `remove_onboarding_key`, `set_onboarding_config`, `is_onboarding_key`, `get_onboarding_config` | 5 |
| [Nova Protocol](#9-nova-protocol-integration) | `set_nova_group`, `get_nova_group`, `get_storage_type`, `get_nova_videos`, `backfill_nova_groups`, `fund_nova_platform`, `on_nova_fund_callback`, `set_nova_platform_account`, `set_nova_service_fee`, `get_nova_platform_account`, `get_nova_service_fee` | 11 |
| [NEP-171 Standard](#10-nep-171-nft-standard) | `nft_token`, `nft_transfer`, `nft_transfer_call`, `nft_total_supply`, `nft_tokens`, `nft_supply_for_owner`, `nft_tokens_for_owner`, `nft_approve`, `nft_revoke`, `nft_revoke_all`, `nft_is_approved`, `nft_metadata` | 12 |
| [Admin / Moderation](#11-admin-and-moderation) | `ban_event`, `unban_event`, `is_event_banned`, `get_banned_events`, `set_next_token_id` | 5 |
| [Commission](#12-commission-management) | `get_commission_pool`, `withdraw_commission` | 2 |
| [Purchase Logs](#13-purchase-logs-and-analytics) | `get_purchase_log`, `get_purchase_logs`, `get_purchase_count` | 3 |
| [Token / Video Metadata](#14-token-and-video-metadata) | `verify_ownership`, `get_video_metadata`, `get_tokens_with_video`, `get_next_token_id` | 4 |
| [Web4 Gateway](#15-web4-gateway) | `web4_get`, `web4_set_static_url`, `web4_get_static_url` | 3 |
| **Initialization** | `new` | 1 |
| | | **83 total** |

---

## Access Control Legend

| Access Level | Description |
|--------------|-------------|
| **Public** | Any NEAR account can call this method |
| **Owner** | Only the contract owner (`youtick.near`) can call |
| **Creator** | Only the event creator (original uploader) can call |
| **Session Key** | Callable via a Function Call Access Key scoped to the contract (signless UX) |
| **Onboarding Key** | Callable via an authorized onboarding Function Call Access Key |
| **Gift Key** | Callable via a gift drop Function Call Access Key |
| **Private** | Only callable by the contract itself (cross-contract callback) |
| **Trial Subaccount** | Only callable by `*.youtick.near` subaccounts |

---

## 1. Event Management

### create_event

Create a new video event listing on the platform.

**Type:** Change
**Access:** Public
**Payable:** Yes (minimum 0.1 NEAR)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `encrypted_cid` | `String` | Yes | Nova-encrypted IPFS CID (unique identifier for the event) |
| `title` | `String` | Yes | Event title displayed in the marketplace |
| `description` | `String` | Yes | Event description |
| `price` | `U128` | Yes | Ticket price in yoctoNEAR (`0` for free events) |
| `price_usd` | `Option<u128>` | No | Price in USD cents for display purposes (stored separately) |

**Returns:** None

**Example:**

```bash
near call youtick.near create_event \
  '{"encrypted_cid":"abc-123-uuid","title":"Live Concert","description":"Exclusive live performance","price":"1000000000000000000000000","price_usd":500}' \
  --accountId creator.near --deposit 0.1
```

**Notes:**
- The `encrypted_cid` must be unique. Creating an event with a duplicate CID will fail.
- The 0.1 NEAR deposit covers on-chain storage costs.
- The `price_usd` field is stored in a separate `LookupMap` to maintain backward compatibility with older event structs.
- The caller's account ID is recorded as `creator_id` and cannot be changed after creation.

---

### create_event_prepaid

Create an event using the caller's prepaid balance instead of an attached deposit. Designed for signless UX via Session Keys.

**Type:** Change
**Access:** Session Key / Public
**Payable:** No (deducts 0.1 NEAR from prepaid balance)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `encrypted_cid` | `String` | Yes | Nova-encrypted IPFS CID |
| `title` | `String` | Yes | Event title |
| `description` | `String` | Yes | Event description |
| `price` | `U128` | Yes | Ticket price in yoctoNEAR |
| `price_usd` | `Option<u128>` | No | Price in USD cents for display |

**Returns:** None

**Example:**

```bash
near call youtick.near create_event_prepaid \
  '{"encrypted_cid":"abc-456-uuid","title":"Cinema Night","description":"Exclusive screening","price":"500000000000000000000000"}' \
  --accountId creator.near
```

**Notes:**
- Requires the caller to have at least 0.1 NEAR in their prepaid balance (deposited via `deposit_funds`).
- Deducts 0.1 NEAR from the prepaid balance atomically.
- Same duplicate-CID protection as `create_event`.
- Ideal for Session Key workflows where the user cannot attach deposits.

---

### get_event

Retrieve details for a single event by its encrypted CID.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `encrypted_cid` | `String` | Yes | The event's encrypted IPFS CID |

**Returns:** `Option<EventResponse>` -- Returns `null` if the event does not exist.

**Example:**

```bash
near view youtick.near get_event '{"encrypted_cid":"abc-123-uuid"}'
```

**Response:**

```json
{
  "title": "Live Concert",
  "description": "Exclusive live performance",
  "price": "1000000000000000000000000",
  "creator_id": "creator.near",
  "created_at": 1706000000000000000,
  "price_usd": 500,
  "banned": null,
  "ban_reason": null
}
```

**Notes:**
- Returns ban status information. A banned event will have `"banned": true` and a `ban_reason` string.
- The `price_usd` is fetched from a separate storage map and may be `null` for older events.
- The `created_at` timestamp is in nanoseconds since the Unix epoch.

---

### get_events

List events with offset-based pagination. Excludes banned events from results.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `from_index` | `Option<U128>` | No | Offset index to start from (default: `0`) |
| `limit` | `Option<u64>` | No | Maximum number of events to return (default: `50`) |

**Returns:** `Vec<(String, EventResponse)>` -- Array of `[cid, event_response]` tuples.

**Example:**

```bash
near view youtick.near get_events '{"from_index":"0","limit":10}'
```

**Notes:**
- Banned events are filtered from the result set.
- The `from_index` is applied before the ban filter, so fewer results than `limit` may be returned.
- No maximum cap on `limit` is enforced in this method. Use `get_events_paginated` for capped pagination.

---

### get_events_paginated

Cursor-based pagination for event listings. Returns a page of events along with a cursor for the next page and a total count.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `cursor` | `Option<String>` | No | CID of the last event from the previous page. `null` to start from the beginning. |
| `limit` | `Option<u64>` | No | Maximum events per page (default: `50`, max: `100`) |

**Returns:** `PaginatedEventsResponse`

**Example:**

```bash
# First page
near view youtick.near get_events_paginated '{"limit":10}'

# Subsequent page
near view youtick.near get_events_paginated '{"cursor":"last-cid-from-previous","limit":10}'
```

**Response:**

```json
{
  "events": [
    ["cid-1", { "title": "...", "price": "..." }],
    ["cid-2", { "title": "...", "price": "..." }]
  ],
  "next_cursor": "cid-2",
  "total_count": 42
}
```

**Notes:**
- If `cursor` references a CID that does not exist, an empty result set is returned.
- `next_cursor` is `null` when there are no more pages.
- `total_count` reflects the total number of non-banned events across all pages.
- The `limit` is capped at `100` regardless of the value provided.

---

### get_events_count

Returns the total number of non-banned events on the platform.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `u64`

**Example:**

```bash
near view youtick.near get_events_count '{}'
```

**Notes:**
- Iterates all events and filters banned ones. May be gas-intensive on very large datasets.

---

## 2. Ticket Purchase

### buy_ticket

Purchase a ticket for an event by attaching NEAR. Mints an NFT to the receiver and distributes payment to the creator and platform pools.

**Type:** Change
**Access:** Public
**Payable:** Yes (price + 0.01 NEAR storage + nova service fee)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Account to receive the minted NFT ticket |
| `encrypted_cid` | `String` | Yes | CID of the event to purchase a ticket for |

**Returns:** `Token` (NEP-171 token object)

**Example:**

```bash
# For a 1 NEAR ticket:
near call youtick.near buy_ticket \
  '{"receiver_id":"buyer.near","encrypted_cid":"abc-123-uuid"}' \
  --accountId buyer.near --deposit 1.01
```

**Notes:**
- **Revenue split**: 98% to the event creator, 2% to the platform (split evenly between trial pool and commission pool).
- **Free tickets** (price = 0): No attached deposit is required. The contract pays storage from its own balance.
- **Banned events**: Purchases are blocked for banned events.
- **Nova auto-funding**: If a Nova service fee is configured, it is deducted from the deposit and transferred to the Nova platform account.
- **Excess refund**: Any deposit beyond price + storage + nova fee is refunded to the buyer.
- A `PurchaseLog` entry is created for every successful purchase.

---

### buy_ticket_prepaid

Purchase a ticket using the caller's prepaid balance. Designed for signless UX via Session Keys.

**Type:** Change
**Access:** Session Key / Public
**Payable:** No (deducts from prepaid balance)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Account to receive the minted NFT ticket |
| `encrypted_cid` | `String` | Yes | CID of the event to purchase |

**Returns:** `Promise` (resolves to `Token` via `buy_ticket_internal` callback)

**Example:**

```bash
near call youtick.near buy_ticket_prepaid \
  '{"receiver_id":"buyer.near","encrypted_cid":"abc-123-uuid"}' \
  --accountId buyer.near
```

**Notes:**
- Deducts `price + 0.01 NEAR (storage) + nova_service_fee` from the caller's prepaid balance.
- For free tickets (price = 0), no prepaid balance is needed. The contract pays storage internally.
- Same revenue split and ban protections as `buy_ticket`.
- Internally calls `buy_ticket_internal` via a cross-contract call with the storage deposit attached.

---

### buy_ticket_internal

Internal callback for prepaid and wNEAR ticket purchases. Mints the NFT with the attached storage deposit.

**Type:** Change
**Access:** Private (contract self-call only)
**Payable:** Yes (receives storage deposit from the calling method)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Account to receive the NFT |
| `encrypted_cid` | `String` | Yes | Event CID |

**Returns:** `Token`

**Notes:**
- Marked `#[private]` -- can only be called by the contract itself.
- Verifies the event exists and is not banned before minting.
- Should never be called directly by external accounts.

---

## 3. Prepaid Balance (Gas Tank / Session Keys)

### deposit_funds

Deposit NEAR into the caller's prepaid balance for use with Session Key operations.

**Type:** Change
**Access:** Public
**Payable:** Yes (any amount)

**Parameters:** None

**Returns:** None

**Example:**

```bash
near call youtick.near deposit_funds '{}' \
  --accountId user.near --deposit 2
```

**Notes:**
- The full attached deposit is added to the caller's balance.
- Balances accumulate across multiple deposits.
- Use `get_user_balance` to check the current balance.

---

### deposit_funds_for

Deposit NEAR into another account's prepaid balance. Used by third parties (such as Keypom) to fund new users.

**Type:** Change
**Access:** Public
**Payable:** Yes (any amount)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `account_id` | `AccountId` | Yes | The account to credit the deposit to |

**Returns:** None

**Example:**

```bash
near call youtick.near deposit_funds_for \
  '{"account_id":"newuser.near"}' \
  --accountId sponsor.near --deposit 1
```

**Notes:**
- Useful for onboarding flows where a sponsor pre-funds a new user's gas tank.
- The target account does not need to exist on-chain yet; the balance will be available when they interact with the contract.

---

### get_user_balance

Check a user's prepaid balance.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `account_id` | `AccountId` | Yes | The account to check |

**Returns:** `U128` -- Balance in yoctoNEAR. Returns `"0"` if the account has no deposits.

**Example:**

```bash
near view youtick.near get_user_balance '{"account_id":"user.near"}'
```

---

### withdraw_funds

Withdraw the caller's entire prepaid balance. Requires a wallet signature (1 yoctoNEAR deposit for security).

**Type:** Change
**Access:** Public
**Payable:** Yes (1 yoctoNEAR minimum)

**Parameters:** None

**Returns:** `Promise` (NEAR transfer to the caller)

**Example:**

```bash
near call youtick.near withdraw_funds '{}' \
  --accountId user.near --depositYocto 1
```

**Notes:**
- Requires attaching at least 1 yoctoNEAR as a security measure to confirm wallet ownership.
- Withdraws the entire prepaid balance in a single transfer.
- Fails if the balance is zero.
- The balance is removed from storage before the transfer (CEI pattern: Checks-Effects-Interactions).

---

### withdraw_funds_prepaid

Withdraw prepaid funds without a wallet signature. Designed for Session Key access with a security cap.

**Type:** Change
**Access:** Session Key / Public
**Payable:** No

**Parameters:** None

**Returns:** `Promise` (NEAR transfer to the caller)

**Example:**

```bash
near call youtick.near withdraw_funds_prepaid '{}' \
  --accountId user.near
```

**Notes:**
- **Security limit**: The balance must be 0.1 NEAR or less. If the balance exceeds this threshold, the user must use `withdraw_funds` with a wallet signature instead.
- This prevents Session Key abuse where a compromised key could drain large balances.
- Withdraws the entire balance (up to 0.1 NEAR).

---

## 4. wNEAR Integration

### ft_on_transfer

NEP-141 callback invoked by `wrap.near` when a user sends wNEAR to this contract via `ft_transfer_call`. Enables a single-popup purchase flow for stablecoin payments (USDC to wNEAR to ticket).

**Type:** Change
**Access:** Called by `wrap.near` only (NEP-141 protocol)
**Payable:** No (wNEAR amount is in the `amount` parameter)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sender_id` | `AccountId` | Yes | The account that sent the wNEAR (set by `wrap.near`) |
| `amount` | `U128` | Yes | Amount of wNEAR received in yoctoNEAR |
| `msg` | `String` | Yes | JSON string with purchase instructions |

**`msg` format:**

```json
{
  "action": "buy_ticket",
  "buyer_id": "alice.near",
  "encrypted_cid": "abc-123-uuid"
}
```

**Returns:** `PromiseOrValue<U128>` -- Returns `"0"` if all tokens were used, or the full amount for a refund.

**Example:**

```bash
# Called indirectly via wrap.near ft_transfer_call:
near call wrap.near ft_transfer_call \
  '{"receiver_id":"youtick.near","amount":"1010000000000000000000000","msg":"{\"action\":\"buy_ticket\",\"buyer_id\":\"alice.near\",\"encrypted_cid\":\"abc-123-uuid\"}"}' \
  --accountId alice.near --depositYocto 1 --gas 100000000000000
```

**Notes:**
- Only accepts transfers from `wrap.near`. Any other FT contract will be rejected.
- `sender_id` must match the `buyer_id` in the message (prevents unauthorized purchases).
- Free tickets are rejected with a full refund (no wNEAR needed).
- The contract unwraps wNEAR to native NEAR via `wrap.near::near_withdraw`, then processes the purchase in a callback.
- Same revenue split (98/2) and Nova auto-funding as `buy_ticket`.

---

### on_wnear_unwrap_for_purchase

Private callback executed after wNEAR has been unwrapped to native NEAR. Processes the actual ticket purchase, payment splits, and NFT minting.

**Type:** Change
**Access:** Private (contract self-call only)
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `buyer_id` | `AccountId` | Yes | Account to receive the NFT |
| `encrypted_cid` | `String` | Yes | Event CID |
| `wnear_amount` | `U128` | Yes | Total wNEAR amount that was unwrapped |

**Returns:** `U128` -- Always returns `"0"` (signals to `ft_resolve_transfer` that all tokens were consumed).

**Notes:**
- If the unwrap failed, this method panics and `wrap.near` handles the wNEAR refund via `ft_resolve_transfer`.
- Excess NEAR (beyond price + storage + nova fee) is refunded to the buyer as native NEAR.
- Creates a `PurchaseLog` entry with `PurchaseType::Prepaid`.

---

## 5. NFT Minting

### nft_mint

Directly mint an NFT with custom metadata. Restricted to the contract owner.

**Type:** Change
**Access:** Owner
**Payable:** Yes (minimum 1 yoctoNEAR)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Account to receive the minted NFT |
| `token_metadata` | `TokenMetadata` | Yes | NEP-177 token metadata (title, description, media, etc.) |
| `video_metadata` | `VideoMetadata` | Yes | Custom video metadata (CID, duration, content type, nova group) |

**Returns:** `Token`

**Example:**

```bash
near call youtick.near nft_mint \
  '{"receiver_id":"user.near","token_metadata":{"title":"Concert Ticket","description":"VIP access","copies":1},"video_metadata":{"encrypted_cid":"Qm...","duration_seconds":3600,"content_type":"Concert","storage_type":"Nova"}}' \
  --accountId youtick.near --depositYocto 1
```

**Notes:**
- Only the contract owner can call this method. Use `nft_mint_prepaid` for user-initiated minting.
- If `video_metadata.nova_group_id` is provided, it is stored in the `event_nova_groups` mapping for future ticket copies.
- The token ID is auto-incremented from `next_token_id`.

---

### nft_mint_prepaid

Mint an NFT using the caller's prepaid balance. Designed for Session Key workflows where creators upload videos.

**Type:** Change
**Access:** Session Key / Public
**Payable:** No (deducts 0.1 NEAR from prepaid balance)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Account to receive the NFT |
| `token_metadata` | `TokenMetadata` | Yes | NEP-177 token metadata |
| `video_metadata` | `VideoMetadata` | Yes | Custom video metadata |

**Returns:** `Promise` (resolves to `Token` via `nft_mint_internal`)

**Notes:**
- Deducts 0.1 NEAR from the caller's prepaid balance.
- Internally calls `nft_mint_internal` (not `nft_mint`) to bypass the owner guard.
- Includes a callback (`on_nft_mint_prepaid_callback`) that automatically refunds the prepaid balance if the mint fails.

---

### nft_mint_internal

Internal NFT minting function called via cross-contract call from `nft_mint_prepaid`.

**Type:** Change
**Access:** Private (contract self-call only)
**Payable:** Yes (receives storage deposit from calling method)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Account to receive the NFT |
| `token_metadata` | `TokenMetadata` | Yes | NEP-177 token metadata |
| `video_metadata` | `VideoMetadata` | Yes | Custom video metadata |

**Returns:** `Token`

**Notes:**
- Marked `#[private]` -- bypasses the owner guard that `nft_mint` enforces.
- Stores `nova_group_id` in the event-level mapping if provided.

---

### on_nft_mint_prepaid_callback

Callback that verifies whether a prepaid mint succeeded. Refunds the user's prepaid balance on failure.

**Type:** Change
**Access:** Private (contract self-call only)
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `account_id` | `AccountId` | Yes | The account whose prepaid balance to refund |
| `charge_amount` | `U128` | Yes | The amount to refund on failure (0.1 NEAR) |

**Returns:** None

**Notes:**
- If the preceding `nft_mint_internal` call failed, the 0.1 NEAR charge is restored to the user's prepaid balance.
- Logs a message: `"Prepaid mint FAILED - refunded {amount} to {account}"`.

---

### gift_ticket

Creator gifts a ticket to a receiver. No commission is charged. The creator pays only the storage cost.

**Type:** Change
**Access:** Creator (must be the event creator)
**Payable:** Yes (0.01 NEAR for storage)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Account to receive the gifted NFT |
| `encrypted_cid` | `String` | Yes | CID of the event |

**Returns:** `Token`

**Example:**

```bash
near call youtick.near gift_ticket \
  '{"receiver_id":"fan.near","encrypted_cid":"abc-123-uuid"}' \
  --accountId creator.near --deposit 0.01
```

**Notes:**
- Only the event creator can gift tickets for their own events.
- No commission is deducted -- 100% free for the creator beyond storage.
- The Nova group ID is automatically copied from the event-level mapping.
- No `PurchaseLog` is created for gift tickets.

---

## 6. Gift Drops (Access Key Based)

### create_gift_drop

Create shareable gift links by generating Function Call Access Keys on the contract. Each key allows one claim.

**Type:** Change
**Access:** Creator (must be the event creator)
**Payable:** Yes (0.15 NEAR per key)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `event_cid` | `String` | Yes | CID of the event to create gift links for |
| `public_keys` | `Vec<PublicKey>` | Yes | Array of public keys (1-50 keys per call) |

**Returns:** None

**Example:**

```bash
near call youtick.near create_gift_drop \
  '{"event_cid":"abc-123-uuid","public_keys":["ed25519:ABC...","ed25519:DEF..."]}' \
  --accountId creator.near --deposit 0.3
```

**Notes:**
- Requires exactly 0.15 NEAR per key as deposit (e.g., 2 keys = 0.3 NEAR).
- Each public key is added as a Function Call Access Key on the contract, scoped to `claim_gift` and `claim_gift_and_create_account`.
- The key allowance is 0.05 NEAR for gas fees.
- Banned events cannot have gift drops created.
- The corresponding private keys are generated client-side and embedded in shareable URLs.
- Maximum of 50 keys per transaction.

---

### claim_gift

Claim a gift drop to an existing NEAR account. Mints the NFT and deletes the access key.

**Type:** Change
**Access:** Gift Key (signed with the gift link's private key)
**Payable:** Yes (no specific deposit required; gas paid by key allowance)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Existing NEAR account to receive the NFT |

**Returns:** `Token`

**Example:**

```bash
# Called using the gift link's private key as the signing key:
near call youtick.near claim_gift \
  '{"receiver_id":"recipient.near"}' \
  --signWithKey ed25519:PRIVATE_KEY_FROM_GIFT_LINK
```

**Notes:**
- The gift is identified by the signer's public key (the key from the gift link).
- The access key is deleted after a successful claim to prevent reuse.
- The gift drop record is removed from storage.
- Banned events cannot have their gift tickets claimed.
- The NFT description is prefixed with "Gift ticket: ".

---

### claim_gift_and_create_account

Claim a gift drop and simultaneously create a new NEAR account. Creates a subaccount, adds a Full Access Key, and mints the NFT.

**Type:** Change
**Access:** Gift Key
**Payable:** No (funded from the gift drop deposit)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `new_account_id` | `AccountId` | Yes | The new account ID to create (e.g., `alice.near`) |
| `new_public_key` | `PublicKey` | Yes | Full Access Key for the new account |

**Returns:** `Promise` (account creation followed by NFT minting in `on_account_created` callback)

**Notes:**
- The gift drop deposit (0.15 NEAR per claim) funds account creation (0.11 NEAR) and NFT storage (0.01 NEAR).
- The new account receives a Full Access Key.
- If account creation fails (e.g., the account already exists), the entire transaction reverts.
- The gift access key is deleted after the claim, regardless of success.

---

### on_account_created

Private callback invoked after account creation in `claim_gift_and_create_account`. Mints the NFT to the newly created account.

**Type:** Change
**Access:** Private (contract self-call only)
**Payable:** Yes (receives 0.01 NEAR storage deposit)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | The newly created account |
| `event_cid` | `String` | Yes | Event CID for the gift |

**Returns:** `Token`

**Notes:**
- Panics if the preceding account creation promise failed.
- Mints the NFT with "Gift ticket: " prefix in the description.

---

### is_gift_valid

Check whether a gift key is still valid (has remaining claims).

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `public_key` | `String` | Yes | The public key string (e.g., `"ed25519:ABC..."`) |

**Returns:** `bool` -- `true` if the key exists and has `remaining_claims > 0`.

**Example:**

```bash
near view youtick.near is_gift_valid '{"public_key":"ed25519:ABC..."}'
```

---

### get_gift_info

Get basic information about a gift drop.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `public_key` | `String` | Yes | The public key string |

**Returns:** `Option<(String, AccountId)>` -- Tuple of `(event_cid, creator_id)`, or `null` if not found.

**Example:**

```bash
near view youtick.near get_gift_info '{"public_key":"ed25519:ABC..."}'
```

---

### get_gift_info_full

Get the complete gift drop record including deposit amounts and timestamps.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `public_key` | `String` | Yes | The public key string |

**Returns:** `Option<GiftDrop>`

**Example:**

```bash
near view youtick.near get_gift_info_full '{"public_key":"ed25519:ABC..."}'
```

**Response:**

```json
{
  "creator_id": "creator.near",
  "event_cid": "abc-123-uuid",
  "remaining_claims": 1,
  "deposit_per_claim": "150000000000000000000000",
  "created_at": 1706000000000000000
}
```

---

## 7. Trial Accounts (Sponsored)

### fund_trial_pool

Add NEAR to the trial pool, which funds sponsored account creation and free ticket storage. Anyone can contribute.

**Type:** Change
**Access:** Public
**Payable:** Yes (any amount greater than 0)

**Parameters:** None

**Returns:** None

**Example:**

```bash
near call youtick.near fund_trial_pool '{}' \
  --accountId sponsor.near --deposit 10
```

**Notes:**
- The trial pool also receives 1% of every paid ticket purchase (half of the 2% commission).
- Pool funds are used for `create_sponsored_trial_direct`, `create_sponsored_trial`, `claim_free_ticket_direct`, and `claim_free_ticket_sponsored`.

---

### withdraw_trial_pool

Withdraw NEAR from the trial pool. Owner only.

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `amount` | `U128` | Yes | Amount to withdraw in yoctoNEAR |

**Returns:** `Promise` (transfer to the owner)

**Example:**

```bash
near call youtick.near withdraw_trial_pool \
  '{"amount":"5000000000000000000000000"}' \
  --accountId youtick.near
```

---

### get_trial_pool_balance

Check the current trial pool balance.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `U128` -- Balance in yoctoNEAR.

**Example:**

```bash
near view youtick.near get_trial_pool_balance '{}'
```

---

### create_sponsored_trial_direct

Create a sponsored trial account using an authorized onboarding key. No relayer needed -- fully decentralized.

**Type:** Change
**Access:** Onboarding Key
**Payable:** No (0.1 NEAR deducted from trial pool)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `username` | `String` | Yes | Username for the new account (2-32 chars, `[a-z0-9_-]` only) |
| `new_public_key` | `PublicKey` | Yes | Full Access Key for the new account |

**Returns:** `Promise` (account creation)

**Example:**

```bash
near call youtick.near create_sponsored_trial_direct \
  '{"username":"alice","new_public_key":"ed25519:ABC..."}' \
  --signWithKey ed25519:ONBOARDING_PRIVATE_KEY
```

**Notes:**
- Creates `{username}.youtick.near` as a subaccount with a Full Access Key.
- **Anti-abuse protections**:
  1. Onboarding must be enabled (`onboarding_config.enabled == true`).
  2. The signer's public key must be registered in `onboarding_keys`.
  3. Daily rate limit is enforced (`onboarding_config.daily_limit`).
- Costs 0.1 NEAR from the trial pool per account.
- Username validation: 2-32 characters, lowercase letters, digits, hyphens, and underscores only.

---

### create_sponsored_trial

Create a sponsored trial account via the legacy relayer method. Owner only.

**Type:** Change
**Access:** Owner
**Payable:** No (0.1 NEAR deducted from trial pool)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `username` | `String` | Yes | Username (2-32 chars, `[a-z0-9_-]` only) |
| `new_public_key` | `PublicKey` | Yes | Full Access Key for the new account |

**Returns:** `Promise` (account creation)

**Notes:**
- This is the original relayer-based method. For decentralized onboarding, use `create_sponsored_trial_direct`.
- Same username validation and trial pool deduction as `create_sponsored_trial_direct`.
- Does not check onboarding keys or daily limits.

---

### claim_free_ticket_direct

Claim a free ticket via an onboarding key. Storage is paid from the trial pool. Fully decentralized -- no relayer needed.

**Type:** Change
**Access:** Onboarding Key
**Payable:** No (0.01 NEAR deducted from trial pool)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Account to receive the free ticket NFT |
| `encrypted_cid` | `String` | Yes | CID of the free event |

**Returns:** `Promise` (resolves to `Token` via `buy_ticket_internal`)

**Notes:**
- Only works for events where `price == 0`. Paid events are rejected.
- **Anti-abuse protections** (same as `create_sponsored_trial_direct`):
  1. Onboarding must be enabled.
  2. Signer's key must be in `onboarding_keys`.
  3. Daily rate limit is enforced.
- Deducts 0.01 NEAR from the trial pool for NFT storage.
- Banned events are blocked.

---

### claim_free_ticket_sponsored

Claim a free ticket with contract-paid storage. Owner only (legacy relayer method).

**Type:** Change
**Access:** Owner
**Payable:** No (0.01 NEAR deducted from trial pool)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Account to receive the free ticket NFT |
| `encrypted_cid` | `String` | Yes | CID of the free event |

**Returns:** `Promise` (resolves to `Token` via `buy_ticket_internal`)

**Notes:**
- Only works for free events (price = 0).
- Storage cost (0.01 NEAR) is deducted from the trial pool.
- Banned events are blocked.
- For decentralized onboarding, use `claim_free_ticket_direct` instead.

---

### upgrade_trial_account

Add a Full Access Key to a trial subaccount. Allows the trial user to "upgrade" their account to full capability.

**Type:** Change
**Access:** Trial Subaccount (must be a `*.youtick.near` account)
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `new_public_key` | `PublicKey` | Yes | The new Full Access Key to add |

**Returns:** `Promise` (adds the key to the caller's account)

**Example:**

```bash
near call youtick.near upgrade_trial_account \
  '{"new_public_key":"ed25519:NEW_KEY..."}' \
  --accountId alice.youtick.near
```

**Notes:**
- Only accounts matching the pattern `*.youtick.near` can call this method.
- The contract sponsors the gas for adding the key.
- Does not remove the existing keys on the trial account.

---

### get_daily_trial_count

Get the number of trial accounts created today.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `u32`

**Example:**

```bash
near view youtick.near get_daily_trial_count '{}'
```

**Notes:**
- The day boundary is calculated as UTC midnight (seconds since epoch, rounded to 86400).
- Resets to 0 at the start of each new UTC day.

---

## 8. Onboarding Configuration (Admin)

### add_onboarding_key

Register a public key as an authorized onboarding key. Creates a Function Call Access Key on the contract scoped to trial-creation and free-ticket methods.

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `public_key` | `PublicKey` | Yes | The public key to authorize |

**Returns:** `Promise` (adds the access key on-chain)

**Example:**

```bash
near call youtick.near add_onboarding_key \
  '{"public_key":"ed25519:ABC..."}' \
  --accountId youtick.near
```

**Notes:**
- The key is added as a Function Call Access Key with 1 NEAR allowance.
- Scoped to methods: `create_sponsored_trial_direct`, `claim_free_ticket_direct`.
- The key is also stored in the `onboarding_keys` LookupSet for authorization checks.

---

### remove_onboarding_key

Remove an authorized onboarding key. Deletes the access key from the contract and removes it from the authorization set.

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `public_key` | `PublicKey` | Yes | The public key to remove |

**Returns:** `Promise` (deletes the access key on-chain)

---

### set_onboarding_config

Update the onboarding configuration, including the daily rate limit and the master enable/disable switch.

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `daily_limit` | `u32` | Yes | Maximum trial accounts per day (`0` = unlimited) |
| `enabled` | `bool` | Yes | Master switch for onboarding functionality |

**Returns:** None

**Example:**

```bash
near call youtick.near set_onboarding_config \
  '{"daily_limit":200,"enabled":true}' \
  --accountId youtick.near
```

---

### is_onboarding_key

Check if a public key is authorized for onboarding operations.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `public_key` | `PublicKey` | Yes | The public key to check |

**Returns:** `bool`

**Example:**

```bash
near view youtick.near is_onboarding_key '{"public_key":"ed25519:ABC..."}'
```

---

### get_onboarding_config

Retrieve the current onboarding configuration.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `OnboardingConfig`

**Example:**

```bash
near view youtick.near get_onboarding_config '{}'
```

**Response:**

```json
{
  "daily_limit": 100,
  "enabled": true
}
```

---

## 9. Nova Protocol Integration

### set_nova_group

Set or update the Nova group ID for a token. Also stores the mapping at the event level so future ticket copies inherit the group.

**Type:** Change
**Access:** Creator (must be both the token owner and the event creator)
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token_id` | `TokenId` | Yes | The NFT token ID |
| `nova_group_id` | `String` | Yes | The Nova Protocol group identifier |

**Returns:** None

**Example:**

```bash
near call youtick.near set_nova_group \
  '{"token_id":"0","nova_group_id":"group-abc123"}' \
  --accountId creator.near
```

**Notes:**
- The caller must be both the token owner AND the original event creator.
- Updates the `event_nova_groups` mapping so all future ticket copies for the same event automatically inherit this group ID.
- Also sets `storage_type` to `Nova` on the token's video metadata.

---

### get_nova_group

Retrieve the Nova group ID for a specific token.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token_id` | `TokenId` | Yes | The NFT token ID |

**Returns:** `Option<String>` -- The Nova group ID, or `null` if not set.

**Example:**

```bash
near view youtick.near get_nova_group '{"token_id":"0"}'
```

---

### get_storage_type

Get the storage/encryption type for a token's video.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token_id` | `TokenId` | Yes | The NFT token ID |

**Returns:** `Option<StorageType>` -- Currently always `"Nova"` if the token has video metadata.

**Example:**

```bash
near view youtick.near get_storage_type '{"token_id":"0"}'
```

---

### get_nova_videos

Get all Nova-encrypted videos owned by an account.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `account_id` | `AccountId` | Yes | The account to query |

**Returns:** `Vec<(TokenId, VideoMetadata)>` -- Array of `(token_id, video_metadata)` pairs filtered to `StorageType::Nova`.

**Example:**

```bash
near view youtick.near get_nova_videos '{"account_id":"user.near"}'
```

---

### backfill_nova_groups

Migration utility that indexes all existing tokens' Nova group IDs into the event-level mapping and backfills missing group IDs on ticket copies.

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:** None

**Returns:** `u32` -- Number of tokens that were backfilled.

**Example:**

```bash
near call youtick.near backfill_nova_groups '{}' \
  --accountId youtick.near --gas 300000000000000
```

**Notes:**
- Phase 1: Scans all video metadata to populate `event_nova_groups` from master tokens.
- Phase 2: Updates all tokens missing `nova_group_id` where the event-level mapping exists.
- Should only be needed during migrations. May consume significant gas for large token counts.

---

### fund_nova_platform

Transfer NEAR from the caller's prepaid balance to the configured Nova platform account. Used by creators before uploading paid videos to cover group registration costs.

**Type:** Change
**Access:** Session Key / Public
**Payable:** No (deducts from prepaid balance)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `amount` | `U128` | Yes | Amount to transfer in yoctoNEAR (max 1 NEAR per call) |

**Returns:** `Promise` (transfer with callback verification)

**Example:**

```bash
near call youtick.near fund_nova_platform \
  '{"amount":"100000000000000000000000"}' \
  --accountId creator.near
```

**Notes:**
- Maximum of 1 NEAR per call as a security limit.
- Requires a Nova platform account to be configured (`set_nova_platform_account`).
- If the transfer fails (e.g., the Nova account was deleted), the prepaid balance is automatically refunded via `on_nova_fund_callback`.

---

### on_nova_fund_callback

Private callback that verifies the Nova platform funding transfer succeeded. Refunds the user's prepaid balance on failure.

**Type:** Change
**Access:** Private (contract self-call only)
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `account_id` | `AccountId` | Yes | The account to refund on failure |
| `amount` | `U128` | Yes | The amount to refund |

**Returns:** None

**Notes:**
- Logs `"Nova funding FAILED - refunded {amount} to {account}"` on failure.

---

### set_nova_platform_account

Configure the Nova platform account that receives service fees and funding transfers.

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `account_id` | `AccountId` | Yes | The Nova platform account ID |

**Returns:** None

**Example:**

```bash
near call youtick.near set_nova_platform_account \
  '{"account_id":"nova-platform.near"}' \
  --accountId youtick.near
```

---

### set_nova_service_fee

Set the Nova service fee charged per paid ticket purchase. Deducted from the buyer's payment and transferred to the Nova platform account.

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `fee` | `U128` | Yes | Fee per ticket in yoctoNEAR (max 0.1 NEAR) |

**Returns:** None

**Example:**

```bash
# Set fee to 0.005 NEAR per ticket:
near call youtick.near set_nova_service_fee \
  '{"fee":"5000000000000000000000"}' \
  --accountId youtick.near
```

**Notes:**
- Maximum fee is 0.1 NEAR (100000000000000000000000 yoctoNEAR). Higher values are rejected.
- Set to `"0"` to disable the Nova service fee.

---

### get_nova_platform_account

Get the currently configured Nova platform account.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `Option<AccountId>` -- The account ID, or `null` if not configured.

**Example:**

```bash
near view youtick.near get_nova_platform_account '{}'
```

---

### get_nova_service_fee

Get the current Nova service fee per ticket.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `U128` -- Fee in yoctoNEAR. Returns `"0"` if no fee is configured.

**Example:**

```bash
near view youtick.near get_nova_service_fee '{}'
```

---

## 10. NEP-171 NFT Standard

These methods are implemented via the NEAR contract standards macros (`impl_non_fungible_token_core!`, `impl_non_fungible_token_enumeration!`, `impl_non_fungible_token_approval!`). They follow the official NEP-171, NEP-177, and NEP-178 specifications.

### nft_token

Get a single token by ID.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token_id` | `TokenId` | Yes | The token ID |

**Returns:** `Option<Token>` -- The token object with metadata, or `null`.

**Example:**

```bash
near view youtick.near nft_token '{"token_id":"42"}'
```

---

### nft_transfer

Transfer an NFT to another account.

**Type:** Change
**Access:** Token Owner / Approved Account
**Payable:** Yes (1 yoctoNEAR required)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Account to receive the token |
| `token_id` | `TokenId` | Yes | Token ID to transfer |
| `approval_id` | `Option<u64>` | No | Expected approval ID (for approved transfers) |
| `memo` | `Option<String>` | No | Optional memo string |

**Returns:** None

**Example:**

```bash
near call youtick.near nft_transfer \
  '{"receiver_id":"friend.near","token_id":"42"}' \
  --accountId owner.near --depositYocto 1
```

---

### nft_transfer_call

Transfer an NFT and call `nft_on_transfer` on the receiver contract.

**Type:** Change
**Access:** Token Owner / Approved Account
**Payable:** Yes (1 yoctoNEAR required)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `receiver_id` | `AccountId` | Yes | Contract to receive and process the token |
| `token_id` | `TokenId` | Yes | Token ID to transfer |
| `approval_id` | `Option<u64>` | No | Expected approval ID |
| `memo` | `Option<String>` | No | Optional memo |
| `msg` | `String` | Yes | Message passed to the receiver's `nft_on_transfer` |

**Returns:** `PromiseOrValue<bool>` -- `true` if the token should be returned to the sender.

---

### nft_total_supply

Get the total number of minted NFTs.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `U128`

**Example:**

```bash
near view youtick.near nft_total_supply '{}'
```

---

### nft_tokens

List all tokens with pagination.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `from_index` | `Option<U128>` | No | Starting index (default: `0`) |
| `limit` | `Option<u64>` | No | Maximum tokens to return |

**Returns:** `Vec<Token>`

**Example:**

```bash
near view youtick.near nft_tokens '{"from_index":"0","limit":10}'
```

---

### nft_supply_for_owner

Get the number of tokens owned by an account.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `account_id` | `AccountId` | Yes | The account to query |

**Returns:** `U128`

**Example:**

```bash
near view youtick.near nft_supply_for_owner '{"account_id":"user.near"}'
```

---

### nft_tokens_for_owner

List tokens owned by an account with pagination.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `account_id` | `AccountId` | Yes | The account to query |
| `from_index` | `Option<U128>` | No | Starting index |
| `limit` | `Option<u64>` | No | Maximum tokens to return |

**Returns:** `Vec<Token>`

**Example:**

```bash
near view youtick.near nft_tokens_for_owner \
  '{"account_id":"user.near","from_index":"0","limit":10}'
```

---

### nft_approve

Approve an account to transfer a specific token on behalf of the owner.

**Type:** Change
**Access:** Token Owner
**Payable:** Yes (storage deposit for approval)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token_id` | `TokenId` | Yes | The token to approve |
| `account_id` | `AccountId` | Yes | The account to approve |
| `msg` | `Option<String>` | No | Optional message for `nft_on_approve` callback |

**Returns:** `Option<Promise>`

---

### nft_revoke

Revoke a specific account's approval for a token.

**Type:** Change
**Access:** Token Owner
**Payable:** Yes (1 yoctoNEAR required)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token_id` | `TokenId` | Yes | The token |
| `account_id` | `AccountId` | Yes | The account to revoke |

**Returns:** None

---

### nft_revoke_all

Revoke all approvals for a token.

**Type:** Change
**Access:** Token Owner
**Payable:** Yes (1 yoctoNEAR required)

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token_id` | `TokenId` | Yes | The token |

**Returns:** None

---

### nft_is_approved

Check if an account is approved for a specific token.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token_id` | `TokenId` | Yes | The token |
| `approved_account_id` | `AccountId` | Yes | The account to check |
| `approval_id` | `Option<u64>` | No | Specific approval ID to validate |

**Returns:** `bool`

---

### nft_metadata

Get the contract-level NFT metadata (name, symbol, spec version).

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `NFTContractMetadata`

**Example:**

```bash
near view youtick.near nft_metadata '{}'
```

**Response:**

```json
{
  "spec": "nft-2.0.0",
  "name": "YouTick Video Tickets",
  "symbol": "YTICK",
  "icon": null,
  "base_uri": null,
  "reference": null,
  "reference_hash": null
}
```

---

## 11. Admin and Moderation

### ban_event

Ban an event from the platform. Banned events are hidden from listings and blocked from purchases, but remain in storage for audit purposes.

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `encrypted_cid` | `String` | Yes | The event CID to ban |
| `reason` | `BanReason` | Yes | One of: `"SexualContent"`, `"CopyrightViolation"`, `"Other"` |

**Returns:** None

**Example:**

```bash
near call youtick.near ban_event \
  '{"encrypted_cid":"abc-123-uuid","reason":"CopyrightViolation"}' \
  --accountId youtick.near
```

**Notes:**
- The event must exist. Banning a nonexistent CID will fail.
- Banned events are excluded from `get_events`, `get_events_paginated`, and `get_events_count`.
- Banned events are blocked from `buy_ticket`, `buy_ticket_prepaid`, `create_gift_drop`, `claim_gift`, and `claim_free_ticket_*`.
- The ban info (reason, timestamp, admin account) is recorded for audit.

---

### unban_event

Remove a ban from an event, restoring it to normal visibility and purchasability.

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `encrypted_cid` | `String` | Yes | The event CID to unban |

**Returns:** None

**Notes:**
- Fails if the event is not currently banned.

---

### is_event_banned

Check whether an event is currently banned.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `encrypted_cid` | `String` | Yes | The event CID to check |

**Returns:** `bool`

**Example:**

```bash
near view youtick.near is_event_banned '{"encrypted_cid":"abc-123-uuid"}'
```

---

### get_banned_events

List all currently banned events with their ban information.

**Type:** View
**Access:** Owner
**Payable:** No

**Parameters:** None

**Returns:** `Vec<(String, BanInfo)>` -- Array of `(cid, ban_info)` tuples.

**Example:**

```bash
near view youtick.near get_banned_events '{}' --accountId youtick.near
```

**Response:**

```json
[
  [
    "abc-123-uuid",
    {
      "reason": "CopyrightViolation",
      "banned_at": 1706000000000000000,
      "banned_by": "youtick.near"
    }
  ]
]
```

**Notes:**
- Requires the caller to be the contract owner (enforced at the view level).
- Iterates all events and checks the ban map, so it may be gas-intensive for large event counts.

---

### set_next_token_id

Manually set the next token ID counter. Recovery function for state repair after issues.

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `new_id` | `u64` | Yes | The new token ID counter value |

**Returns:** None

**Example:**

```bash
near call youtick.near set_next_token_id '{"new_id":100}' \
  --accountId youtick.near
```

> **Warning**: Setting this to a value that overlaps with existing token IDs will cause minting failures. Only use this for recovery scenarios.

---

## 12. Commission Management

### get_commission_pool

Check the current commission pool balance. This pool accumulates 1% of every paid ticket purchase.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `U128` -- Balance in yoctoNEAR.

**Example:**

```bash
near view youtick.near get_commission_pool '{}'
```

---

### withdraw_commission

Withdraw NEAR from the commission pool. Owner only.

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `amount` | `U128` | Yes | Amount to withdraw in yoctoNEAR |

**Returns:** `Promise` (transfer to the owner)

**Example:**

```bash
near call youtick.near withdraw_commission \
  '{"amount":"1000000000000000000000000"}' \
  --accountId youtick.near
```

---

## 13. Purchase Logs and Analytics

### get_purchase_log

Retrieve a single purchase log entry by its sequential ID.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `purchase_id` | `u64` | Yes | The purchase log ID (zero-indexed) |

**Returns:** `Option<PurchaseLog>`

**Example:**

```bash
near view youtick.near get_purchase_log '{"purchase_id":0}'
```

**Response:**

```json
{
  "buyer_id": "buyer.near",
  "creator_id": "creator.near",
  "event_cid": "abc-123-uuid",
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

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `from_index` | `Option<u64>` | No | Starting purchase ID (default: `0`) |
| `limit` | `Option<u64>` | No | Maximum entries to return (default: `50`, max: `100`) |

**Returns:** `Vec<(u64, PurchaseLog)>` -- Array of `(purchase_id, log)` tuples.

**Example:**

```bash
near view youtick.near get_purchase_logs '{"from_index":0,"limit":10}'
```

---

### get_purchase_count

Get the total number of purchase log entries.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `u64`

**Example:**

```bash
near view youtick.near get_purchase_count '{}'
```

---

## 14. Token and Video Metadata

### verify_ownership

Check if a specific account owns a specific token.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `account_id` | `AccountId` | Yes | The account to verify |
| `token_id` | `TokenId` | Yes | The token ID to check |

**Returns:** `bool`

**Example:**

```bash
near view youtick.near verify_ownership \
  '{"account_id":"buyer.near","token_id":"42"}'
```

---

### get_video_metadata

Get the video metadata for a specific token.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token_id` | `TokenId` | Yes | The token ID |

**Returns:** `Option<VideoMetadata>`

**Example:**

```bash
near view youtick.near get_video_metadata '{"token_id":"42"}'
```

**Response:**

```json
{
  "encrypted_cid": "abc-123-uuid",
  "duration_seconds": 3600,
  "event_date": 1706000000000000000,
  "content_type": "Concert",
  "nova_group_id": "group-abc123",
  "storage_type": "Nova"
}
```

---

### get_tokens_with_video

Get all tokens owned by an account, paired with their video metadata. Useful for building a user's video library.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `account_id` | `AccountId` | Yes | The account to query |
| `from_index` | `Option<U128>` | No | Starting index |
| `limit` | `Option<u64>` | No | Maximum tokens to return |

**Returns:** `Vec<(Token, Option<VideoMetadata>)>` -- Each token paired with its video metadata (if any).

**Example:**

```bash
near view youtick.near get_tokens_with_video \
  '{"account_id":"user.near","from_index":"0","limit":20}'
```

---

### get_next_token_id

Get the next token ID that will be assigned. Useful for predicting token IDs in batch operations.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `u64`

**Example:**

```bash
near view youtick.near get_next_token_id '{}'
```

---

## 15. Web4 Gateway

### web4_get

Web4 protocol handler. Serves static content from IPFS/NEARFS based on the configured static URL.

**Type:** View
**Access:** Public (called by the Web4 gateway)
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `request` | `Web4Request` | Yes | Contains `path` and optional `query` parameters |

**Returns:** `Web4Response` -- Either `BodyUrl` (redirect to NEARFS) or `Body` (inline HTML).

**Path Resolution Rules:**

| Input Path | Resolved Path | Rationale |
|------------|---------------|-----------|
| `/` | `/index.html` | Root route |
| `/discover/` | `/discover/index.html` | Trailing slash = directory |
| `/discover` | `/discover/index.html` | No extension = route |
| `/file.js` | `/file.js` | Has extension = static file |

**Notes:**
- If `web4_static_url` is not configured, returns a fallback HTML page instructing the owner to configure it.
- Supports content type detection for: HTML, JS, CSS, JSON, PNG, JPG, GIF, SVG, ICO, WOFF, WOFF2, TTF, XML, TXT, WASM, WebP, and source maps.
- Query strings in the path are stripped before resolution.

---

### web4_set_static_url

Set the NEARFS base URL for the Web4 gateway (e.g., `/ipfs/CID`).

**Type:** Change
**Access:** Owner
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | `String` | Yes | The NEARFS base URL (e.g., `/ipfs/bafybeig...`) |

**Returns:** None

**Example:**

```bash
near call youtick.near web4_set_static_url \
  '{"url":"/ipfs/bafybeigexamplecid"}' \
  --accountId youtick.near
```

---

### web4_get_static_url

Get the currently configured Web4 static URL.

**Type:** View
**Access:** Public
**Payable:** No

**Parameters:** None

**Returns:** `Option<String>` -- The URL, or `null` if not configured.

**Example:**

```bash
near view youtick.near web4_get_static_url '{}'
```

---

## Initialization

### new

Initialize the contract. Can only be called once.

**Type:** Change (init)
**Access:** Deployer
**Payable:** No

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `owner_id` | `AccountId` | Yes | The contract owner account |

**Returns:** `Contract` (the initialized state)

**Example:**

```bash
near call youtick.near new '{"owner_id":"youtick.near"}' \
  --accountId youtick.near
```

**Notes:**
- Protected by `#[init]` and `require!(!env::state_exists())` to prevent re-initialization.
- Sets contract metadata: spec `nft-2.0.0`, name `YouTick Video Tickets`, symbol `YTICK`.
- Initializes all storage collections with V8 collision-safe keys.
- Sets default onboarding config: `daily_limit: 100`, `enabled: true`.

---

## Data Models

### Event

Internal storage struct (borsh-serialized). Not returned directly to callers.

```rust
pub struct Event {
    pub title: String,
    pub description: String,
    pub price: U128,          // Price in yoctoNEAR (0 = free)
    pub creator_id: AccountId,
    pub created_at: u64,      // Nanoseconds since Unix epoch
}
```

---

### EventResponse

JSON response struct returned by `get_event`, `get_events`, and `get_events_paginated`.

```rust
pub struct EventResponse {
    pub title: String,
    pub description: String,
    pub price: U128,
    pub creator_id: AccountId,
    pub created_at: u64,
    pub price_usd: Option<u128>,    // USD cents, from separate storage
    pub banned: Option<bool>,        // true if banned, null otherwise
    pub ban_reason: Option<String>,  // "sexual_content", "copyright_violation", or "other"
}
```

---

### PaginatedEventsResponse

Response struct for cursor-based event pagination.

```rust
pub struct PaginatedEventsResponse {
    pub events: Vec<(String, EventResponse)>,  // Array of (cid, event) tuples
    pub next_cursor: Option<String>,           // CID to use as cursor for next page
    pub total_count: u64,                      // Total non-banned events
}
```

---

### VideoMetadata

Custom metadata attached to each NFT token representing video content.

```rust
pub struct VideoMetadata {
    pub encrypted_cid: String,          // IPFS CID (Nova-encrypted)
    pub duration_seconds: u32,          // Video duration in seconds
    pub event_date: Option<u64>,        // Event timestamp (nanoseconds)
    pub content_type: ContentType,      // Content classification
    pub nova_group_id: Option<String>,  // Nova Protocol group ID
    pub storage_type: StorageType,      // Encryption/storage method
}
```

---

### ContentType

Classification of video content.

```rust
pub enum ContentType {
    Concert,     // Live music performance
    Cinema,      // Film / movie content
    Exclusive,   // Exclusive/premium content
    LiveEvent,   // Live-streamed event
}
```

---

### StorageType

Encryption and storage method for video content.

```rust
pub enum StorageType {
    Nova,  // Nova Secure File-Sharing (TEE-encrypted, IPFS-stored)
}
```

---

### GiftDrop

Record of a gift drop, keyed by the public key string.

```rust
pub struct GiftDrop {
    pub creator_id: AccountId,      // Event creator who funded the gift
    pub event_cid: String,          // Event CID the gift is for
    pub remaining_claims: u32,      // Number of claims remaining (1 per key)
    pub deposit_per_claim: U128,    // NEAR reserved per claim (0.15 NEAR)
    pub created_at: u64,            // Creation timestamp (nanoseconds)
}
```

---

### BanReason

Typed reason for banning an event.

```rust
pub enum BanReason {
    SexualContent,        // Adult/sexual content violation
    CopyrightViolation,   // Copyright/IP infringement
    Other,                // Other policy violation
}
```

---

### BanInfo

Record of a ban action, stored per event CID.

```rust
pub struct BanInfo {
    pub reason: BanReason,      // Reason for the ban
    pub banned_at: u64,         // Timestamp (nanoseconds)
    pub banned_by: AccountId,   // Admin who issued the ban
}
```

---

### OnboardingConfig

Configuration for the relayer-less onboarding system.

```rust
pub struct OnboardingConfig {
    pub daily_limit: u32,   // Max trials per day (0 = unlimited, default: 100)
    pub enabled: bool,      // Master switch (default: true)
}
```

---

### PurchaseLog

Audit trail entry for ticket purchases.

```rust
pub struct PurchaseLog {
    pub buyer_id: AccountId,        // Account that purchased the ticket
    pub creator_id: AccountId,      // Event creator who received payment
    pub event_cid: String,          // Event CID
    pub token_id: String,           // Minted NFT token ID
    pub price: U128,                // Ticket price in yoctoNEAR
    pub creator_amount: U128,       // Amount sent to creator (98%)
    pub commission_amount: U128,    // Amount kept by platform (2%)
    pub purchase_type: PurchaseType, // How the purchase was made
    pub timestamp_ns: u64,          // Timestamp (nanoseconds)
}
```

---

### PurchaseType

Classification of how a ticket was purchased.

```rust
pub enum PurchaseType {
    Direct,   // buy_ticket (attached NEAR deposit)
    Prepaid,  // buy_ticket_prepaid (session key / wNEAR)
    Free,     // price == 0 (no payment)
}
```

---

### Web4Request

Incoming request from the Web4 gateway.

```rust
pub struct Web4Request {
    pub path: String,                           // URL path
    pub query: HashMap<String, Vec<String>>,    // Query parameters
}
```

---

### Web4Response

Response to the Web4 gateway.

```rust
pub enum Web4Response {
    Body {
        content_type: String,    // MIME type
        body: Base64VecU8,       // Inline content (base64-encoded)
    },
    BodyUrl {
        content_type: String,    // MIME type
        body_url: String,        // URL to fetch content from (NEARFS)
    },
}
```

---

## Storage Keys Reference

All storage keys use short byte prefixes to prevent key collisions and minimize storage costs. The V8 suffix convention ensures no overlap between different contract versions.

| Key | Bytes | Collection Type | Purpose |
|-----|-------|-----------------|---------|
| `NFT` | `b"n8"` | `NonFungibleToken` | Core NFT storage (token ownership, etc.) |
| `TOKEN_METADATA` | `b"m8"` | NEP-177 metadata | Per-token metadata (title, description, media) |
| `ENUMERATION` | `b"e8"` | NEP-177 enumeration | Token-per-owner and total supply tracking |
| `APPROVAL` | `b"a8"` | NEP-178 approval | Token approval records |
| `CONTRACT_METADATA` | `b"c8"` | `LazyOption` | Contract-level NFT metadata (name, symbol) |
| `VIDEO_METADATA` | `b"v8"` | `UnorderedMap<TokenId, VideoMetadata>` | Custom video metadata per token |
| `USER_DEPOSITS` | `b"d8"` | `LookupMap<AccountId, NearToken>` | Prepaid balance (gas tank) per user |
| `EVENTS` | `b"x8"` | `UnorderedMap<String, Event>` | Event listings keyed by encrypted CID |
| `GIFT_DROPS` | `b"g8"` | `LookupMap<String, GiftDrop>` | Gift drops keyed by public key string |
| `ONBOARDING_KEYS` | `b"o8"` | `LookupSet<PublicKey>` | Authorized onboarding key set |
| `DAILY_TRIAL_COUNTS` | `b"t8"` | `LookupMap<u64, u32>` | Daily trial count keyed by day timestamp |
| `PURCHASE_LOGS` | `b"p8"` | `UnorderedMap<u64, PurchaseLog>` | Purchase audit trail |
| `EVENT_NOVA_GROUPS` | `b"ng8"` | `LookupMap<String, String>` | Event CID to Nova group ID mapping |
| `EVENT_PRICE_USD` | `b"pu8"` | `LookupMap<String, u128>` | Event CID to USD price (lazy, separate storage) |
| `BANNED_EVENTS` | `b"be8"` | `LookupMap<String, BanInfo>` | Banned event CID to ban info (lazy, separate storage) |

---

## Constants Reference

### Storage Costs

| Constant | Value | Description |
|----------|-------|-------------|
| `STORAGE_COST_NFT` | 0.01 NEAR (10000000000000000000000 yocto) | Storage deposit for minting a single NFT |
| `STORAGE_COST_ACCOUNT` | 0.1 NEAR (100000000000000000000000 yocto) | Storage deposit for creating a NEAR account |

### Commission Structure

| Parameter | Value | Description |
|-----------|-------|-------------|
| Commission rate | 2% of ticket price | Total platform fee on paid tickets |
| Trial pool share | 1% (50% of commission) | Automatically funds trial account creation |
| Commission pool share | 1% (50% of commission) | Withdrawable by the contract owner |
| Creator share | 98% of ticket price | Transferred directly to the event creator |

### Gift Drop Constants

| Parameter | Value | Description |
|-----------|-------|-------------|
| Deposit per key | 0.15 NEAR | Required deposit for each gift drop key |
| Key allowance | 0.05 NEAR | Gas allowance per gift access key |
| Keys per call | 1-50 | Min/max keys in a single `create_gift_drop` call |
| Account creation cost | 0.11 NEAR | Cost for `claim_gift_and_create_account` |

### Onboarding Constants

| Parameter | Value | Description |
|-----------|-------|-------------|
| Key allowance | 1 NEAR | Gas allowance per onboarding access key |
| Default daily limit | 100 | Default max trial accounts per day |
| Account cost | 0.1 NEAR | Cost per trial account from the trial pool |
| Allowed methods | `create_sponsored_trial_direct`, `claim_free_ticket_direct` | Methods accessible via onboarding keys |

### Nova Protocol Constants

| Parameter | Value | Description |
|-----------|-------|-------------|
| Funding limit | 1 NEAR per call | Max amount transferable via `fund_nova_platform` |
| Service fee max | 0.1 NEAR | Maximum configurable Nova service fee per ticket |

### Username Validation

| Parameter | Value | Description |
|-----------|-------|-------------|
| Min length | 2 characters | Minimum username length for trial accounts |
| Max length | 32 characters | Maximum username length |
| Allowed characters | `[a-z0-9_-]` | Lowercase letters, digits, hyphens, underscores |

### Prepaid Withdrawal Limit

| Parameter | Value | Description |
|-----------|-------|-------------|
| Signless max | 0.1 NEAR | Maximum balance for `withdraw_funds_prepaid` (Session Key security) |

---

## Revenue Flow Diagram

```
Buyer pays: ticket_price + 0.01 NEAR (storage) + nova_service_fee
            |
            +-- 98% of ticket_price --> Creator (direct transfer)
            |
            +-- 1% of ticket_price  --> Trial Pool (contract state)
            |
            +-- 1% of ticket_price  --> Commission Pool (contract state)
            |
            +-- 0.01 NEAR           --> Contract (NFT storage)
            |
            +-- nova_service_fee    --> Nova Platform Account (if configured)
```

---

## Error Reference

Common error messages and their causes.

| Error Message | Cause | Resolution |
|---------------|-------|------------|
| `"Event not found"` | The `encrypted_cid` does not match any event | Verify the CID is correct |
| `"Event with this CID already exists"` | Duplicate CID on `create_event` | Use a unique CID |
| `"Insufficient deposit"` | Attached NEAR is less than required | Attach the correct amount |
| `"Insufficient prepaid balance"` | Prepaid balance too low for the operation | Call `deposit_funds` first |
| `"This event has been banned..."` | Event is banned by an admin | Contact the platform owner |
| `"Only event creator can..."` | Caller is not the event creator | Use the creator's account |
| `"Only contract owner can..."` | Caller is not `youtick.near` | Use the owner account |
| `"Only owner can set..."` | Admin function called by non-owner | Use the owner account |
| `"Unauthorized: Signer's key is not an onboarding key"` | The signing key is not registered | Register via `add_onboarding_key` |
| `"Daily trial limit reached"` | Too many trials created today | Wait until the next UTC day |
| `"Trial pool empty"` | Not enough NEAR in the trial pool | Fund via `fund_trial_pool` |
| `"Amount exceeds signless limit (0.1 NEAR)"` | Prepaid balance > 0.1 NEAR for signless withdraw | Use `withdraw_funds` with wallet |
| `"Only wNEAR (wrap.near) is accepted"` | Non-wNEAR token sent via `ft_transfer_call` | Only send from `wrap.near` |
| `"sender_id must match buyer_id"` | wNEAR sender does not match the buyer in the message | Ensure sender matches |
| `"Username must be 2-32 characters"` | Invalid username length | Use a valid username |
| `"Already initialized"` | Contract `new()` called on existing state | Contract is already deployed |
