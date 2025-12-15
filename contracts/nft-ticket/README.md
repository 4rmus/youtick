# YouTick NFT Ticket Contract

NEAR smart contract for video NFT minting and ticketed events.

## Overview

This contract implements:
- **NEP-171** compliant NFT tokens
- **Event system** for pay-per-view video access
- **GasTank** prepaid balance for session key operations

## Build

```bash
# Prerequisites
rustup target add wasm32-unknown-unknown

# Build
cargo build --target wasm32-unknown-unknown --release

# Optimize (optional but recommended)
wasm-opt -Oz -o target/.../youtick_nft_opt.wasm \
             target/.../youtick_nft.wasm
```

## Deploy

```bash
# Create account
near create-account YOUR_ACCOUNT.testnet --useFaucet

# Deploy with init
near deploy YOUR_ACCOUNT.testnet \
     target/wasm32-unknown-unknown/release/youtick_nft.wasm \
     --initFunction new \
     --initArgs '{"owner_id":"YOUR_ACCOUNT.testnet"}'
```

## Contract Functions

### Write Functions

| Function | Description | Args |
|----------|-------------|------|
| `new(owner_id)` | Initialize contract | Owner account ID |
| `nft_mint(...)` | Mint video NFT | Token metadata |
| `create_event(...)` | Create ticketed event | CID, title, price |
| `buy_ticket(cid)` | Purchase event ticket | Encrypted CID |
| `deposit_funds()` | Add to GasTank | Attached deposit |
| `withdraw_funds(amount)` | Withdraw from GasTank | Amount in yoctoNEAR |

### View Functions

| Function | Description |
|----------|-------------|
| `nft_metadata()` | Contract metadata |
| `nft_tokens(from_index, limit)` | List all tokens |
| `nft_tokens_for_owner(account_id, ...)` | User's tokens |
| `get_event(encrypted_cid)` | Event details |
| `get_user_balance(account_id)` | GasTank balance |

## Testing

```bash
# View metadata
near view CONTRACT.testnet nft_metadata '{}'

# List tokens
near view CONTRACT.testnet nft_tokens '{"from_index":"0","limit":10}'

# Get event
near view CONTRACT.testnet get_event '{"encrypted_cid":"..."}'
```

## Storage Keys

Contract uses versioned storage keys to prevent collisions:
- `StorageKeyV2::NonFungibleToken`
- `StorageKeyV2::TokenMetadata`
- `StorageKeyV2::Enumeration`
- `StorageKeyV2::Approval`
- `StorageKeyV2::VideoMetadata`
- `StorageKeyV2::Events`

## Dependencies

```toml
near-sdk = "5.1.0"
near-contract-standards = "5.1.0"
serde = "1.0"
serde_json = "1.0"
```
