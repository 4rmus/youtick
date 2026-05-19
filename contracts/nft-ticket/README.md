# YouTick NFT Ticket Contract

NEAR smart contract for events, NFT tickets, gifts, trials and upload-session
based publishing.

**Mainnet:** `youtick.near` (current code hash `HA3i8Se8Mrsd14Ye2qYvwehRgP9Phrd76psgyy9Y1bCF`, matching the current repository contract build artifact; R2 deploy hash was `BXbiiT86A8mjVNwvZhNLhUDqvmTVUe7anHotTpQPXg2F`).

---

## Module Layout

After R2, the previously single-file `lib.rs` was split into 12 modules
(public ABI unchanged):

```
src/
  lib.rs        # entry, struct, sabitler
  nft.rs        # NEP-171 NFT impl
  market.rs     # buy_ticket, ft_on_transfer, upload session
  gift.rs       # create_gift_drop, claim_gift*, upgrade_trial_account
  onboarding.rs # add/remove_onboarding_key, daily limit
  treasury.rs   # trial pool, free/trial claim, USDC/USDT pool
  views.rs      # metadata, purchase logs, creator profile
  web4.rs       # Web4 entrypoint
  moderation.rs # ban/takedown
  timelock.rs   # propose/execute_action
  events.rs     # NEP-297 event emitters
  migrate.rs    # migration-feature-only entrypoints
  tests.rs      # unit tests
```

---

## Build

```bash
rustup target add wasm32-unknown-unknown
cargo near build non-reproducible-wasm   # production build; verify hash before deploy
# or for plain dev:
cargo build --target wasm32-unknown-unknown --release
```

## Test

```bash
cargo test --lib            # unit tests in tests.rs
cargo test --test sandbox   # NEAR Workspaces sandbox suite
```

---

## Public method ailesi

### Event (`market.rs` + `views.rs`)
`create_event`, `create_event_prepaid` (upload-session path),
`get_event`, `get_events`, `get_events_paginated`, `get_events_count`.

### Upload (`market.rs`)
`create_upload_session`, `revoke_upload_session`, `get_upload_session`,
`nft_mint_prepaid` (upload-session path).

### Ticket (`market.rs`, `nft.rs`)
`buy_ticket`, `gift_ticket`, `nft_mint`, `get_videos`, `has_ticket`,
`ft_on_transfer` (wNEAR + USDC/USDT).

### Gift / Trial (`gift.rs`, `treasury.rs`, `onboarding.rs`)
`create_gift_drop`, `claim_gift`, `claim_gift_with_implicit_account`,
`claim_gift_and_create_account` (legacy named-subaccount, still callable),
`finalize_gift_claim_after_account_created`,
`claim_trial_invite_with_implicit_account`,
`sponsor_implicit_guest_direct`, `create_sponsored_trial_direct` (legacy),
`claim_free_ticket_direct`, `upgrade_trial_account`,
`add_onboarding_key`, `remove_onboarding_key`, `set_onboarding_config`.

### Stablecoin (`treasury.rs`)
`withdraw_commission_usdc`, `withdraw_trial_pool_usdc`,
`withdraw_creator_stablecoin`, `get_usdc_pools`,
`get_creator_stablecoin_balance`, `get_stablecoin_commission_balance`,
`is_stablecoin_payment_settled`.

### Moderation (`moderation.rs`)
`ban_event`, `unban_event`, `is_event_banned`, `get_banned_events`,
`takedown_event` (owner-only emergency, NEP-297 `event_takedown`).

### Owner & timelock (`timelock.rs`, `lib.rs`)
`propose_owner`, `accept_ownership`, `propose_action`, `execute_action`,
`get_timelock`, `cancel_action`, `pause`, `unpause`,
`web4_set_static_url` (owner-only).

### Migration / debug (`migrate.rs`, `timelock.rs`) — **build-feature only**
`reset_v11`, `reset_for_v1_launch`, `wipe_and_reinit`, `repair_nft_state`,
`rebuild_cid_to_tokens`, `test_insert`. Gated behind `--features migration`.

---

## Legacy / Borsh-only

The `StorageType::Nova` placeholder and Nova funding methods (`fund_nova_*`,
`set_nova_*`) panic or return `None` at runtime; they are kept only for
Borsh compatibility with old records. New uploads use `StorageType::Kms`.

The `*_prepaid` naming is **not legacy** — it is the active upload
session path.
