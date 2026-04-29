# Contract Methods Reference

> Live runtime contract surface for YouTick Zero Trust Architecture

**Status:** Source reference. V1 public alpha is owner-controlled; timelock
governance is present in the codebase but is not required for V1 launch.
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
| `migrate` | V11 state migration (adds `creator_profiles`); must be called after WASM deploy when struct layout changes |
| `reset_v11` | Migration-only state reset; excluded from normal production builds |

### Change Methods

| Method | Purpose |
|--------|---------|
| `web4_set_static_url` | Owner-only Web4 static asset URL update |
| `set_next_token_id` | Owner-only admin override for token ID counter |
| `ban_event` | Owner-only moderation action |
| `unban_event` | Owner-only moderation action |
| `admin_remove_events` | Owner-only removal action |
| `pause` | Owner-only emergency pause |
| `unpause` | Owner-only unpause |
| `propose_action` | Timelock proposal surface retained for later governance |
| `execute_action` | Timelock execution surface retained for later governance |
| `cancel_action` | Timelock: cancels a proposed action |
| `propose_owner` | Starts two-step ownership transfer |
| `accept_ownership` | Proposed owner accepts ownership transfer |
| `add_onboarding_key` | Owner-only onboarding key add |
| `remove_onboarding_key` | Owner-only onboarding key removal |
| `set_onboarding_config` | Owner-only onboarding configuration |
| `create_trial_invite_drop` | Creates trial-invite access keys |
| `create_event` | Publishes a new ticketed video event |
| `create_event_prepaid` | Creates an event through the upload-session publish path |
| `create_upload_session` | Creates an upload session with access key |
| `revoke_upload_session` | Revokes an upload session |
| `buy_ticket` | Purchases a ticket (free or paid) |
| `buy_ticket_internal` | Internal purchase flow used by callbacks |
| `nft_mint` | Direct NFT mint with attached deposit |
| `ft_on_transfer` | Fungible-token callback for wNEAR and NEAR-native USDC/USDT purchases |
| `nft_mint_prepaid` | Mints through the upload-session publish path |
| `fund_trial_pool` | Adds NEAR to the trial sponsorship pool |
| `withdraw_trial_pool` | Owner-only trial pool withdrawal |
| `claim_trial_invite_with_implicit_account` | Claims trial and creates implicit account |
| `create_sponsored_trial_direct` | Direct trial creation with account creation |
| `claim_free_ticket_direct` | Claims a free ticket with optional account creation |
| `sponsor_implicit_guest_direct` | Direct gas sponsorship without relayer callback |
| `withdraw_commission` | Owner-only commission withdrawal |
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
| `get_timelock` | Returns the timelock status for a proposed action |
| `get_owner` | Returns the current contract owner |
| `get_pending_owner` | Returns the pending owner, if any |
| `is_gift_valid` | Checks if a gift access key is still valid |
| `get_gift_info` | Returns minimal gift info by public key |
| `get_gift_info_full` | Returns full gift drop details |
| `get_storage_type` | Returns the storage type for a token |
| `get_videos` | Returns all videos owned by an account |
| `has_ticket` | Checks if an account has a ticket for an event |
| `get_trial_pool_balance` | Returns the trial pool balance |
| `get_commission_pool` | Returns the commission pool balance |

### NFT Standard Surface

The contract implements NEP-171 via `NonFungibleToken`:

V1 intentionally disables ticket transfer at runtime. `nft_transfer` returns
`Ticket transfers disabled for v1`; resale and marketplace flows are not part
of V1 public alpha.

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
| `set_scope_policy` | Direct calls rejected; use `propose_action` + `execute_action` |
| `set_market_contract` | Direct calls rejected; use `propose_action` + `execute_action` |
| `set_registry_contract` | Direct calls rejected; use `propose_action` + `execute_action` |
| `pause_scope` | Direct calls rejected; use `propose_action` + `execute_action` |
| `unpause_scope` | Direct calls rejected; use `propose_action` + `execute_action` |
| `pause_contract` | Direct calls rejected; use `propose_action` + `execute_action` |
| `unpause_contract` | Direct calls rejected; use `propose_action` + `execute_action` |
| `propose_action` | Timelock: proposes a sensitive action |
| `execute_action` | Timelock: executes a proposed action after delay |
| `cancel_action` | Timelock: cancels a proposed action |
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
| `upsert_decryption_operator` | Direct calls rejected; use `propose_action` + `execute_action` |
| `deactivate_decryption_operator` | Direct calls rejected; use `propose_action` + `execute_action` |
| `upsert_relayer` | Direct calls rejected; use `propose_action` + `execute_action` |
| `deactivate_relayer` | Direct calls rejected; use `propose_action` + `execute_action` |
| `set_threshold_config` | Direct calls rejected; use `propose_action` + `execute_action` |
| `pause_contract` | Direct calls rejected; use `propose_action` + `execute_action` |
| `unpause_contract` | Direct calls rejected; use `propose_action` + `execute_action` |
| `propose_action` | Timelock: proposes a sensitive action |
| `execute_action` | Timelock: executes a proposed action after delay |
| `cancel_action` | Timelock: cancels a proposed action |
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

The following methods are deprecated or removed and should not be used for new integrations:

| Method | Status |
|--------|--------|
| `create_sponsored_trial` | Removed relayer-based trial flow |
| `claim_free_ticket_sponsored` | Removed relayer-based free ticket flow |
| `sponsor_implicit_guest` | Removed relayer-based gas sponsorship |
| `add_trial_relayer` | Removed relayer allowlist mutation |
| `remove_trial_relayer` | Removed relayer allowlist mutation |
| `is_trial_relayer` | Removed relayer allowlist view |

---

## 6. Default Policy Values

| Scope | Default TTL | Binding |
|------|-------------|---------|
| `Play` | 5 minutes | content + origin + device |
| `Publish` | 10 minutes | creator + origin + device |
| `ClaimGift` | 5 minutes | drop |
| `ClaimTrial` | 5 minutes | invite |

Operator rules:

- Operators must not return shares without both `verify_session_grant` and `has_ticket`
