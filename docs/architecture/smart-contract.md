# Smart Contract Architecture

> Summary of the active logic across the `contracts/nft-ticket/` modules.

**Mainnet:** `youtick.near`

---

## Module Layout (post-R2)

The R2 refactor split the previously single-file `lib.rs` (5,664 lines)
into 12 modules. The public ABI did not change (pre/post `near abi` diff
= empty); only the source organization moved.

```
contracts/nft-ticket/src/
  lib.rs        # entry, struct, constants
  nft.rs        # NFT standard impl
  market.rs     # buy_ticket, ft_on_transfer, upload session methods
  gift.rs       # create_gift_drop, claim_gift, claim_gift_with_implicit_account
  onboarding.rs # add/remove_onboarding_key, daily limit helpers
  treasury.rs   # trial pool, free/trial claim, USDC/USDT pools
  views.rs      # metadata, purchase logs, creator profile views
  web4.rs       # Web4 entrypoint
  moderation.rs # ban/takedown
  timelock.rs   # propose/execute_action (registry parallel)
  events.rs     # NEP-297 event emitters
  migrate.rs    # migration-feature-only entrypoints
  tests.rs      # unit tests
```

---

## Subsystems

| Area | Module | Responsibility |
|---|---|---|
| Events | `market.rs` + `views.rs` | Stores video metadata and price |
| Tickets | `market.rs`, `nft.rs` | Purchase and mint |
| Upload sessions | `market.rs` | Short-lived upload authorization |
| Gifts | `gift.rs` | Single-use gift claim |
| Trials | `treasury.rs`, `onboarding.rs` | Onboarding key + trial pool fund new accounts |
| Moderation | `moderation.rs` | `takedown_event`, ban/unban |
| Stablecoin | `treasury.rs` | USDC/USDT pool and withdraw |
| Logs | `views.rs` | Purchase records |

---

## Economy Model

The paid ticket price split:

- **98% creator**
- **2% commission** (split inside the contract between trial pool and
  commission pool)

Storage / mint / event creation costs are tracked separately from the
ticket split through the `STORAGE_COST_ACCOUNT`, `STORAGE_COST_NFT` and
`TRIAL_ACCOUNT_STORAGE_COST` constants.

Trial costs:

- `TRIAL_ACCOUNT_STORAGE_COST = 0.002 NEAR` — funds a new implicit account
- `STORAGE_COST_ACCOUNT = 0.1 NEAR` — upload/event session
- `STORAGE_COST_NFT = 0.01 NEAR` — NFT mint storage

---

## Core Data Structures

### Event

`encrypted_cid`, title, description, price, creator id, creation time.

### VideoMetadata

- `encrypted_cid`
- `duration_seconds`
- `content_type`
- `storage_type` — new records use `StorageType::Kms`
- `nova_group_id` — Borsh compatibility for older records only

### UploadSession

owner, remaining budget, remaining call count, end time, status.

### GiftDrop

creator, event cid, claim count, deposit reserved per claim.

### PurchaseLog

buyer, creator, event cid, token id, price, creator share, commission.

---

## Admin Model

V1 public alpha runs owner-controlled:

- `nft-ticket` admin actions are owner-only direct calls; timelock is not
  required for V1.
- `add_onboarding_key` / `remove_onboarding_key` are owner-only.
- `reset_v11`, `wipe_and_reinit`, `test_insert`, `repair_nft_state`,
  `rebuild_cid_to_tokens` live in `migrate.rs` + `--features migration`
  and are excluded from normal builds.
- `propose_action` / `execute_action` are present in `timelock.rs` but
  V1 does not claim timelock governance for `nft-ticket`.
- `takedown_event` (`moderation.rs`) is the emergency takedown — not
  timelocked, emits a NEP-297 log.
- `accept_ownership` is the second step of the two-step ownership
  transfer.

The registry and access contracts have a different admin model: the
registry is timelocked, while the access timelock is deferred for the
current alpha.

---

## Public Method Families

For full signatures and examples see [Contract Methods](../api/contract-methods.md).

### Event (`market.rs` + `views.rs`)
`create_event`, `create_event_prepaid`, `get_event`, `get_events`,
`get_events_paginated`, `get_events_count`.

### Upload (`market.rs`)
`create_upload_session`, `revoke_upload_session`, `get_upload_session`,
`nft_mint_prepaid`.

### Ticket and video (`market.rs`, `nft.rs`, `views.rs`)
`buy_ticket`, `gift_ticket`, `nft_mint`, `get_video_metadata`,
`get_videos`, `get_storage_type`, `has_ticket`.

### Gifts (`gift.rs`)
`create_gift_drop`, `claim_gift`, `claim_gift_and_create_account` (legacy
named-subaccount path; new flows use implicit accounts),
`claim_gift_with_implicit_account`,
`finalize_gift_claim_after_account_created`, `is_gift_valid`,
`get_gift_info`, `get_gift_info_full`.

### Trials (`treasury.rs`, `onboarding.rs`)
`add_onboarding_key`, `remove_onboarding_key`, `set_onboarding_config`,
`is_onboarding_key`, `get_onboarding_config`, `claim_free_ticket_direct`,
`claim_trial_invite_with_implicit_account`,
`create_sponsored_trial_direct`, `sponsor_implicit_guest_direct`,
`upgrade_trial_account`, `get_trial_pool_balance`,
`get_daily_trial_count`.

### Stablecoin (`treasury.rs`)
`withdraw_commission_usdc`, `withdraw_trial_pool_usdc`, `get_usdc_pools`,
`get_creator_stablecoin_balance`, `get_stablecoin_commission_balance`,
`is_stablecoin_payment_settled`, `withdraw_creator_stablecoin`,
`ft_on_transfer`.

### Moderation and reporting (`moderation.rs`, `views.rs`)
`ban_event`, `unban_event`, `is_event_banned`, `get_banned_events`,
`takedown_event`, `get_purchase_log`, `get_purchase_logs`,
`get_purchase_logs_by_creator`, `get_purchase_count`,
`get_creator_profile`, `set_creator_profile`, `get_creator_stats`,
`get_commission_pool`, `withdraw_commission`.

### Owner & timelock (`timelock.rs`, `lib.rs`)
`propose_owner`, `accept_ownership`, `propose_action`, `execute_action`,
`get_timelock`, `cancel_action`.

---

## Legacy Compatibility Notes

- The `StorageType::Nova` placeholder is kept for Borsh compatibility.
  `set_nova_group`, `get_nova_group`, `backfill_nova_groups`,
  `fund_nova_platform`, `set_nova_platform_account` and
  `set_nova_service_fee` were removed from the runtime surface (panic or
  return `None`).
- The `*_prepaid` naming is the **active upload-session path**; it is not
  deprecated.
- `claim_gift_and_create_account` and `create_sponsored_trial_direct`
  are legacy named-subaccount paths that remain `pub fn` but new flows
  use the implicit-account variants.

---

## Summary

In the new model the contract's active role is:

- access and ownership records
- purchase and gift distribution
- upload session coordination
- trial pool / stablecoin payment ledger

Media encryption and key storage now sit on the
browser + multi-operator KMS + access-control + operator-registry path,
not on the contract.
