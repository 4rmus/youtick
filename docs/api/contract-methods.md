# Contract Methods Reference

> Live runtime contract surface for YouTick Zero Trust Architecture

**Status:** Live runtime  
**Contracts:** `youtick.near`, `access.youtick.near`, `registry.youtick.near`

---

## How to Read This Page

This page documents the actual deployed contract method surface. The authoritative source is in `contracts/nft-ticket/src/lib.rs`, `contracts/access-control/src/lib.rs`, and `contracts/operator-registry/src/lib.rs`.

---

## 1. Core Types

| Type | Purpose |
|------|---------|
| `SessionScope` | Scope class for `Play`, `Publish`, `ClaimGift`, `ClaimTrial` |
| `SessionGrant` | Short-lived application session |
| `ScopePolicy` | Scope-level TTL and binding policy |
| `Event` | Ticketed video event metadata |
| `EventResponse` | Public event view with pricing |
| `BanReason` | `CopyrightViolation`, `TermsOfService`, `IllegalContent`, `CommunityGuidelines`, `DMCA`, `Other` |
| `ThresholdConfig` | Total operators and required shares |
| `OperatorRecord` | Operator or relayer registration record |
| `PurchaseLog` | On-chain audit trail of purchases |
| `VideoMetadata` | Content metadata linked to a token |

---

## 2. `youtick.near`

This contract is the market, content, and entitlement source of truth.

### Init & State Management

| Method | Purpose |
|--------|---------|
| `new` | Initializes the contract with an owner |
| `migrate` | V10 state migration (removes deprecated Nova fields) |
| `reset_v11` | Complete state reset with new StorageKey prefixes |

### Change Methods

| Method | Purpose |
|--------|---------|
| `web4_set_static_url` | Sets the Web4 static asset URL |
| `set_next_token_id` | Admin override for token ID counter |
| `ban_event` | Bans an event by encrypted CID |
| `unban_event` | Unbans an event |
| `admin_remove_events` | Removes multiple events and their metadata |
| `add_onboarding_key` | Adds a trial onboarding public key |
| `remove_onboarding_key` | Removes an onboarding public key |
| `set_onboarding_config` | Sets daily trial limit and enabled flag |
| `create_trial_invite_drop` | Creates trial-invite access keys |
| `add_trial_relayer` | Whitelists a trial relayer account |
| `remove_trial_relayer` | Removes a trial relayer |
| `create_event` | Publishes a new ticketed video event |
| `create_event_prepaid` | Creates an event using a prepaid deposit |
| `create_upload_session` | Creates an upload session with access key |
| `revoke_upload_session` | Revokes an upload session |
| `buy_ticket` | Purchases a ticket (free or paid) |
| `buy_ticket_internal` | Internal purchase flow used by callbacks |
| `nft_mint` | Direct NFT mint with attached deposit |
| `ft_on_transfer` | Fungible-token callback for wNEAR purchases |
| `nft_mint_prepaid` | Mints using a prepaid creator deposit |
| `fund_trial_pool` | Adds NEAR to the trial sponsorship pool |
| `withdraw_trial_pool` | Withdraws from the trial pool (owner) |
| `claim_trial_invite_with_implicit_account` | Claims trial and creates implicit account |
| `create_sponsored_trial_direct` | Direct trial creation with account creation |
| `claim_free_ticket_direct` | Claims a free ticket with optional account creation |
| `grant_free_access_direct` | Grants free trial access to an existing account |
| `revoke_trial_access` | Revokes trial access for an account |
| `create_sponsored_trial` | Sponsored trial with gas sponsorship |
| `sponsor_implicit_guest` | Sponsors gas for implicit guest account |
| `sponsor_implicit_guest_direct` | Direct gas sponsorship without relayer callback |
| `withdraw_commission` | Withdraws commission pool balance (owner) |
| `claim_free_ticket_sponsored` | Sponsored free-ticket claim with account creation |
| `gift_ticket` | Creator gifts a ticket to a receiver |
| `create_gift_drop` | Creates access-key based gift drops |
| `claim_gift` | Claims a gift drop to an existing account |
| `claim_gift_and_create_account` | Claims a gift and creates a new account |
| `upgrade_trial_account` | Upgrades a trial account to a full NEAR account |

### View Methods

| Method | Purpose |
|--------|---------|
| `web4_get` | Web4 request handler |
| `web4_get_static_url` | Returns the configured Web4 static URL |
| `is_event_banned` | Checks if an event is banned |
| `get_banned_events` | Lists all banned events |
| `is_trial_relayer` | Checks if an account is a trial relayer |
| `is_onboarding_key` | Checks if a public key is an onboarding key |
| `get_onboarding_config` | Returns trial onboarding configuration |
| `is_trial_invite_valid` | Checks if a trial invite key is still valid |
| `get_trial_invite_info` | Returns trial invite metadata |
| `get_daily_trial_count` | Returns today's trial claim count |
| `get_events` | Lists active events (legacy, limited) |
| `get_events_paginated` | Paginated event listing with cursor |
| `get_events_count` | Returns the number of active events |
| `get_event` | Returns a single event by encrypted CID |
| `get_upload_session` | Returns upload session metadata |
| `get_video_metadata` | Returns video metadata for a token |
| `verify_ownership` | Verifies NFT ownership |
| `get_tokens_with_video` | Returns tokens with video metadata for an owner |
| `nft_metadata` | Returns contract-level NFT metadata |
| `get_purchase_log` | Returns a single purchase log |
| `get_purchase_logs` | Paginated purchase log query |
| `get_purchase_count` | Returns total number of purchases |
| `get_next_token_id` | Returns the next token ID to be minted |
| `is_gift_valid` | Checks if a gift access key is still valid |
| `get_gift_info` | Returns minimal gift info by public key |
| `get_gift_info_full` | Returns full gift drop details |
| `get_storage_type` | Returns the storage type for a token |
| `get_videos` | Returns all videos owned by an account |
| `has_ticket` | Checks if an account has a ticket for an event |
| `check_trial_access` | Checks if an account has trial access for an event |
| `get_trial_pool_balance` | Returns the trial pool balance |
| `get_commission_pool` | Returns the commission pool balance |

### NFT Standard Surface

The contract implements NEP-171 via `NonFungibleToken`:

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

---

## 3. `access.youtick.near`

This contract is the session-grant and scope-policy source of truth.

### Change Methods

| Method | Purpose |
|--------|---------|
| `new` | Initializes the contract |
| `issue_session_grant` | Creates a short-lived session grant |
| `revoke_session_grant` | Revokes one grant by session public key |
| `revoke_subject_sessions` | Revokes every grant for one subject |
| `set_scope_policy` | Updates scope policy (TTL, binding) |
| `set_market_contract` | Updates the market-contract reference |
| `set_registry_contract` | Updates the registry-contract reference |
| `pause_scope` | Pauses one scope |
| `unpause_scope` | Unpauses one scope |
| `propose_owner` | Two-step ownership transfer: propose |
| `accept_ownership` | Two-step ownership transfer: accept |
| `set_owner` | Direct owner override (use with caution) |

### View Methods

| Method | Purpose |
|--------|---------|
| `get_session_grant` | Returns one grant by session public key |
| `list_session_grants` | Lists grants for one account |
| `get_scope_policy` | Returns one scope policy |
| `verify_session_grant` | Validates a session for off-chain services |
| `can_execute` | Generic scope check |
| `can_play` | Playback scope helper |
| `can_publish` | Publish scope helper |
| `can_claim_gift` | Gift-claim scope helper |
| `can_claim_trial` | Trial-claim scope helper |

---

## 4. `registry.youtick.near`

This contract stores decryption operators and relayers.

### Change Methods

| Method | Purpose |
|--------|---------|
| `new` | Initializes the contract |
| `upsert_decryption_operator` | Creates or updates an operator |
| `deactivate_decryption_operator` | Deactivates an operator |
| `upsert_relayer` | Creates or updates a relayer |
| `deactivate_relayer` | Deactivates a relayer |
| `set_threshold_config` | Updates threshold config such as `3-of-5` |
| `propose_owner` | Two-step ownership transfer: propose |
| `accept_ownership` | Two-step ownership transfer: accept |
| `set_owner` | Direct owner override (use with caution) |

### View Methods

| Method | Purpose |
|--------|---------|
| `get_decryption_operator` | Returns one operator |
| `list_decryption_operators` | Lists all operators |
| `get_relayer` | Returns one relayer |
| `list_relayers` | Lists all relayers |
| `get_threshold_config` | Returns threshold config |
| `is_active_decryption_operator` | Checks operator activity |
| `is_active_relayer` | Checks relayer activity |

---

## 5. Deprecated / Legacy

The following methods are still present in the contract but are not recommended for new integrations:

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
| `reset_v11` | One-time mainnet state reset |

---

## 6. Default Policy Values

| Scope | Default TTL | Binding |
|------|-------------|---------|
| `Play` | 10 minutes | content + origin + device |
| `Publish` | 20 minutes | creator + origin + device |
| `ClaimGift` | 15 minutes | drop |
| `ClaimTrial` | 15 minutes | invite |

Relayer and operator rules:

- Relayers only sponsor gas and do not become the authority source
- Operators must not return shares without both `verify_session_grant` and `has_ticket`
