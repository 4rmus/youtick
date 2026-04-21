# Contract Methods Reference

> Target contract surface for Youtick Zero Trust Architecture v1

**Status:** Target v1 / not live runtime  
**Contracts:** `youtick.near`, `access.youtick.near`, `registry.youtick.near`

---

## How to Read This Page

This page documents the contract method surface. The authoritative runtime behavior is in `contracts/nft-ticket/src/lib.rs`, `contracts/access-control/src/lib.rs`, and `contracts/operator-registry/src/lib.rs`.

---

## 1. Core Types

| Type | Purpose |
|------|---------|
| `SessionScope` | Scope class for `Play`, `Publish`, `ClaimGift`, `ClaimTrial` |
| `SessionGrant` | Short-lived application session |
| `ScopePolicy` | Scope-level TTL and binding policy |
| `EventKind` | `TicketedVideo` or `AccessPass` |
| `ThresholdConfig` | Total operators and required shares |
| `OperatorRecord` | Operator or relayer registration record |

---

## 2. `youtick.near`

This contract is the market, content, and entitlement source of truth.

### Change methods

| Method | Purpose |
|--------|---------|
| `publish_event` | Opens a new event and the initial entitlement shape |
| `update_event_metadata` | Updates event metadata |
| `set_event_price` | Updates the event price |
| `buy_ticket` | Buys a ticket or access pass |
| `create_gift_drop` | Creates a gift-claim drop |
| `claim_gift` | Claims into an existing account |
| `claim_gift_and_create_account` | Creates an account and claims the gift |
| `create_trial_invite_drop` | Creates a trial-invite drop |
| `claim_trial_invite_and_create_account` | Creates a trial account from an invite |
| `fund_trial_pool` | Adds balance to the trial pool |
| `withdraw_trial_pool` | Withdraws from the trial pool |
| `grant_moderator` | Grants moderator permissions |
| `revoke_moderator` | Revokes moderator permissions |
| `ban_event` | Bans an event |
| `unban_event` | Removes an event ban |
| `set_owner` | Transfers owner authority |

### View methods

| Method | Purpose |
|--------|---------|
| `get_event` | Returns a single event |
| `get_events_paginated` | Returns paginated events |
| `get_creator_events` | Returns a creator's events |
| `get_gift_drop` | Returns gift-drop details |
| `get_trial_invite_drop` | Returns trial-invite details |
| `get_trial_pool_balance` | Returns the trial-pool balance |
| `get_purchase_logs` | Lists purchase logs |
| `get_purchase_count` | Returns purchase count |
| `get_video_metadata` | Returns video metadata |
| `has_ticket` | Checks ticket entitlement |
| `has_access_pass` | Checks access-pass entitlement |
| `has_entitlement` | Resolves the final entitlement answer |
| `get_entitlement_snapshot` | Returns an explainable entitlement view |
| `is_moderator` | Checks moderator status |

### NFT standard surface

The standard NFT methods stay available:

- `nft_token`
- `nft_transfer`
- `nft_transfer_call`
- `nft_total_supply`
- `nft_tokens`
- `nft_supply_for_owner`
- `nft_tokens_for_owner`
- `nft_approve`
- `nft_revoke`
- `nft_revoke_all`
- `nft_is_approved`
- `nft_metadata`

---

## 3. `access.youtick.near`

This contract is the session-grant and scope-policy source of truth.

### Change methods

| Method | Purpose |
|--------|---------|
| `issue_session_grant` | Creates a short-lived session grant |
| `revoke_session_grant` | Revokes one grant |
| `revoke_subject_sessions` | Revokes every grant for one subject |
| `set_scope_policy` | Updates scope policy |
| `set_market_contract` | Updates the market-contract reference |
| `set_registry_contract` | Updates the registry-contract reference |
| `pause_scope` | Pauses one scope |
| `unpause_scope` | Unpauses one scope |
| `set_owner` | Transfers owner authority |

### View methods

| Method | Purpose |
|--------|---------|
| `get_session_grant` | Returns one grant |
| `list_session_grants` | Lists grants for one account |
| `get_scope_policy` | Returns one scope policy |
| `verify_session_grant` | Validates a session for off-chain services |
| `can_execute` | Generic scope check |
| `can_play` | Playback helper |
| `can_publish` | Publish helper |
| `can_claim_gift` | Gift-claim helper |
| `can_claim_trial` | Trial-claim helper |

---

## 4. `registry.youtick.near`

This contract stores decryption operators and relayers.

### Change methods

| Method | Purpose |
|--------|---------|
| `upsert_decryption_operator` | Creates or updates an operator |
| `deactivate_decryption_operator` | Deactivates an operator |
| `upsert_relayer` | Creates or updates a relayer |
| `deactivate_relayer` | Deactivates a relayer |
| `set_threshold_config` | Updates threshold config such as `3-of-5` |
| `set_owner` | Transfers owner authority |

### View methods

| Method | Purpose |
|--------|---------|
| `get_decryption_operator` | Returns one operator |
| `list_decryption_operators` | Lists operators |
| `get_relayer` | Returns one relayer |
| `list_relayers` | Lists relayers |
| `get_threshold_config` | Returns threshold config |
| `is_active_decryption_operator` | Checks operator activity |
| `is_active_relayer` | Checks relayer activity |

---

## 5. Deprecated / Legacy

The following methods are not part of the active v1 target path:

| Method | Status |
|--------|--------|
| `create_upload_session` | Legacy publish helper |
| `revoke_upload_session` | Legacy publish helper |
| `get_upload_session` | Legacy publish helper |
| `nft_mint_prepaid` | Legacy publish helper |
| `create_event_prepaid` | Legacy publish helper |
| `add_onboarding_key` | Removed with browser onboarding secrets |
| `remove_onboarding_key` | Removed with browser onboarding secrets |
| `create_sponsored_trial_direct` | Replaced by invite-based trial flow |
| `claim_free_ticket_direct` | Replaced by gift or invite flow |
| `create_sponsored_trial` | Replaced by invite-based trial flow |
| `claim_free_ticket_sponsored` | Replaced by invite-based trial flow |

Additional note:

- the old magic `ACCESS_PASS` branch inside `has_ticket` is no longer a target-state pattern
- `has_access_pass` and `has_entitlement` replace that behavior with explicit reads

---

## 6. Default Policy Values

| Scope | Default TTL | Binding |
|------|-------------|---------|
| `Play` | 10 minutes | content + origin + device |
| `Publish` | 20 minutes | creator + origin + device |
| `ClaimGift` | 15 minutes | drop |
| `ClaimTrial` | 15 minutes | invite |

Relayer and operator rules:

- relayers only sponsor gas and do not become the authority source
- operators must not return shares without both `verify_session_grant` and `has_entitlement`
