# Smart Contract Specification

> **NFT Ticket Contract on NEAR Protocol**

## Contract Overview

| Property | Value |
|----------|-------|
| **Contract ID** | `v1.utick.testnet` |
| **Language** | Rust |
| **SDK Version** | NEAR SDK 5.1.0 |
| **NFT Standard** | NEP-171 + NEP-177 (Metadata) |
| **Source** | `contracts/nft-ticket/src/lib.rs` |

## Data Structures

### Event

```rust
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
pub struct Event {
    pub title: String,
    pub description: String,
    pub encrypted_cid: String,         // IPFS CID of encrypted video
    pub price: U128,                    // Price in yoctoNEAR
    pub creator: AccountId,             // Video creator
    pub tickets_sold: u64,              // Total tickets sold
    pub created_at: u64,                // Unix timestamp
    pub is_active: bool,                // Can still sell tickets
}
```

### VideoMetadata (NFT Extension)

```rust
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub encrypted_cid: String,          // Links to Event
    pub thumbnail_cid: Option<String>,  // Optional thumbnail
    pub duration_seconds: Option<u64>,  // Video duration
    pub livepeer_playback_id: Option<String>, // For streaming
}
```

### UserDeposit (Prepaid Balance)

```rust
#[derive(BorshDeserialize, BorshSerialize)]
pub struct UserDeposit {
    pub balance: Balance,               // Available balance
    pub last_deposit: u64,              // Timestamp
}
```

## View Methods

### `nft_metadata()`
Returns contract metadata.

```bash
near view v1.utick.testnet nft_metadata '{}'
```

**Response:**
```json
{
  "spec": "nft-1.0.0",
  "name": "YouTick Tickets",
  "symbol": "YTCK",
  "icon": null,
  "base_uri": null,
  "reference": null
}
```

### `get_event(encrypted_cid)`
Returns event details by CID.

```bash
near view v1.utick.testnet get_event '{"encrypted_cid":"QmXyz..."}'
```

### `get_events(from_index, limit)`
Returns paginated list of events.

```bash
near view v1.utick.testnet get_events '{"from_index":"0","limit":10}'
```

### `verify_ownership(account_id, cid)`
Checks if account owns ticket for specific event.

```bash
near view v1.utick.testnet verify_ownership '{"account_id":"user.testnet","cid":"QmXyz..."}'
```

**Response:** `true` or `false`

### `get_user_balance(account_id)`
Returns prepaid balance.

```bash
near view v1.utick.testnet get_user_balance '{"account_id":"user.testnet"}'
```

### `get_tokens_with_video(account_id, limit)`
Returns user's tickets with video metadata.

```bash
near view v1.utick.testnet get_tokens_with_video '{"account_id":"user.testnet","limit":10}'
```

## Change Methods

### `create_event(title, description, price, encrypted_cid)`
Creates a new ticketed event.

```bash
near call v1.utick.testnet create_event '{
  "title": "My Video",
  "description": "Description here",
  "price": "500000000000000000000000",
  "encrypted_cid": "QmXyz..."
}' --accountId creator.testnet --deposit 0.1
```

**Gas:** ~5 TGas  
**Deposit:** 0.1 NEAR (storage)

### `buy_ticket(event_cid)`
Purchases a ticket for an event.

```bash
near call v1.utick.testnet buy_ticket '{
  "event_cid": "QmXyz..."
}' --accountId buyer.testnet --deposit 0.5
```

**Gas:** ~15 TGas  
**Deposit:** Event price

**Payment Split:**
- 98% → Creator
- 2% → Platform

### `deposit_funds()`
Adds to prepaid balance for signless transactions.

```bash
near call v1.utick.testnet deposit_funds '{}' --accountId user.testnet --deposit 1
```

### `withdraw_funds(amount)`
Withdraws from prepaid balance.

```bash
near call v1.utick.testnet withdraw_funds '{
  "amount": "100000000000000000000000"
}' --accountId user.testnet
```

### `buy_ticket_prepaid(event_cid)`
Purchases ticket using prepaid balance (no wallet popup).

```bash
# Must be called with session key
near call v1.utick.testnet buy_ticket_prepaid '{
  "event_cid": "QmXyz..."
}' --accountId user.testnet
```

### `create_gift_drop(event_cid, public_keys, deposit_per_claim)`
Creates claimable gift links.

```bash
near call v1.utick.testnet create_gift_drop '{
  "event_cid": "QmXyz...",
  "public_keys": ["ed25519:ABC...", "ed25519:DEF..."],
  "deposit_per_claim": "100000000000000000000000"
}' --accountId creator.testnet --deposit 1
```

### `claim_gift(event_cid)`
Claims a gifted ticket.

```bash
# Must be called with gift access key
near call v1.utick.testnet claim_gift '{
  "event_cid": "QmXyz..."
}' --accountId guest.testnet
```

## Storage Management

| Key Type | Pattern | Size |
|----------|---------|------|
| Event | `e:{cid}` | ~500 bytes |
| Token | `t:{token_id}` | ~200 bytes |
| User Balance | `b:{account_id}` | ~64 bytes |
| Gift Drop | `g:{cid}:{public_key}` | ~128 bytes |

**Storage Cost:** ~0.00001 NEAR per byte

## Security Patterns

### Access Control

```rust
fn assert_owner(&self) {
    assert_eq!(
        env::predecessor_account_id(),
        self.owner_id,
        "Only owner can call this method"
    );
}

fn assert_creator(&self, event: &Event) {
    assert_eq!(
        env::predecessor_account_id(),
        event.creator,
        "Only event creator can call this method"
    );
}
```

### Reentrancy Protection

NEAR SDK handles reentrancy protection by default through its promise-based execution model.

### Integer Overflow

Rust's checked arithmetic prevents overflow:

```rust
let new_balance = self.balance.checked_add(amount)
    .expect("Balance overflow");
```

## Local Development

### Build Contract

```bash
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release
```

### Deploy to Dev Account

```bash
# Create dev account
near create-account dev-$(date +%s).testnet --useFaucet

# Deploy
near deploy dev-xxx.testnet \
  target/wasm32-unknown-unknown/release/youtick_nft.wasm \
  --initFunction new \
  --initArgs '{"owner_id":"dev-xxx.testnet"}'
```

### Run Tests

```bash
cargo test
```

---

**Previous**: [← NEAR Integration](./04-near-integration.md) | **Next**: [Security →](./08-security.md)
