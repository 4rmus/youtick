# Contract Methods Reference

> Live runtime contract surface for YouTick public alpha.

**Contracts:** `youtick.near`, `access.youtick.near`, `registry.youtick.near`
**Mainnet `youtick.near` code hash:** `BXbiiT86A8mjVNwvZhNLhUDqvmTVUe7anHotTpQPXg2F` (R2 module split).
**Admin posture:** owner-only on `youtick.near`; timelock on `registry.youtick.near`; access timelock deferred for the current alpha (live build does not export `propose_action`/`get_timelock`).

---

## How to Read This Page

Documents the source-level contract surface, not proof that each mainnet
account runs the same WASM — verify with `near contract download-wasm`.

After the R2 refactor, the `nft-ticket` source is split across:

```
contracts/nft-ticket/src/{lib, nft, market, gift, onboarding,
                          treasury, views, web4, moderation,
                          timelock, events, migrate, tests}.rs
```

The public ABI did not change. Method tables below cite the module file
where the implementation lives.

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
| `web4_set_static_url` (`web4.rs`) | Owner-only Web4 static asset URL update |
| `set_next_token_id` (`lib.rs`) | Owner-only admin override for token ID counter |
| `ban_event` (`moderation.rs`) | Owner-only moderation action |
| `unban_event` (`moderation.rs`) | Owner-only moderation action |
| `takedown_event` (`moderation.rs`) | Owner-only takedown — emits NEP-297 `event_takedown` |
| `admin_remove_events` (`lib.rs`) | Owner-only removal action |
| `pause` / `unpause` (`lib.rs`) | Owner-only emergency pause |
| `propose_action` / `execute_action` / `cancel_action` (`timelock.rs`) | Timelock surface retained for later governance; not the V1 NFT admin path |
| `propose_owner` / `accept_ownership` (`lib.rs`) | Two-step ownership transfer |
| `add_onboarding_key` / `remove_onboarding_key` / `set_onboarding_config` (`onboarding.rs`) | Owner-only onboarding key management |
| `create_trial_invite_drop` (`onboarding.rs`) | Creates trial-invite access keys |
| `create_event` (`market.rs`) | Publishes a new ticketed video event |
| `create_event_prepaid` (`market.rs`) | Creates an event through the upload-session publish path |
| `create_upload_session` / `revoke_upload_session` (`market.rs`) | Upload session lifecycle |
| `buy_ticket` (`market.rs`) | Purchases a ticket (free or paid) |
| `nft_mint` (`nft.rs`) | Direct NFT mint with attached deposit |
| `ft_on_transfer` (`market.rs`) | Fungible-token callback for wNEAR and NEAR-native USDC/USDT purchases |
| `nft_mint_prepaid` (`market.rs`) | Mints through the upload-session publish path |
| `fund_trial_pool` / `withdraw_trial_pool` (`treasury.rs`) | Trial sponsorship pool funding / owner withdrawal |
| `claim_trial_invite_with_implicit_account` (`treasury.rs`) | Claims trial and creates implicit account |
| `claim_free_ticket_direct` (`treasury.rs`) | Claims a free collectible ticket |
| `sponsor_implicit_guest_direct` (`treasury.rs`) | Sponsors an implicit guest account |
| `create_sponsored_trial_direct` (`treasury.rs`) | Legacy named-subaccount trial path (still callable; new flows use the implicit-account methods above) |
| `withdraw_commission` (`treasury.rs`) | Owner-only commission withdrawal (NEAR) |
| `withdraw_commission_usdc` / `withdraw_trial_pool_usdc` (`treasury.rs`) | Owner-only stablecoin withdrawals |
| `withdraw_creator_stablecoin` (`treasury.rs`) | Creator stablecoin payout |
| `gift_ticket` (`gift.rs`) | Creator gifts a ticket to a receiver |
| `create_gift_drop` (`gift.rs`) | Creates access-key based gift drops |
| `claim_gift` (`gift.rs`) | Claims a gift drop to an existing account |
| `claim_gift_and_create_account` (`gift.rs`) | Legacy named-subaccount gift path (still callable; new flows use `claim_gift_with_implicit_account`) |
| `claim_gift_with_implicit_account` (`gift.rs`) | Claims a gift and funds an implicit guest account |
| `finalize_gift_claim_after_account_created` (`gift.rs`) | Internal callback for the implicit-account gift path |
| `upgrade_trial_account` (`gift.rs`) | Upgrades a trial account to a full NEAR account |
| `set_creator_profile` (`views.rs`) | Update creator display profile |

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
| `get_trial_pool_balance` (`treasury.rs`) | Returns the trial pool balance |
| `get_commission_pool` (`treasury.rs`) | Returns the commission pool balance |
| `get_usdc_pools` (`treasury.rs`) | Returns USDC trial + commission pool balances |
| `get_creator_stablecoin_balance` (`treasury.rs`) | Per-creator stablecoin balance |
| `get_stablecoin_commission_balance` (`treasury.rs`) | Per-token commission balance |
| `is_stablecoin_payment_settled` (`treasury.rs`) | Checks settlement of a stablecoin payment |
| `get_creator_profile` / `get_creator_stats` (`views.rs`) | Creator profile + aggregate stats |
| `get_purchase_logs_by_creator` (`views.rs`) | Purchase logs filtered by creator |

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

### Still callable (do not use for new integrations)

These methods remain `pub fn` in source for compatibility but new flows
should call the implicit-account / direct equivalents instead.

| Method | Replacement |
|---|---|
| `create_sponsored_trial_direct` (`treasury.rs`) | `claim_trial_invite_with_implicit_account` / `sponsor_implicit_guest_direct` |
| `claim_gift_and_create_account` (`gift.rs`) | `claim_gift_with_implicit_account` |

### Removed (callers will fail)

Relayer-based trial/free-ticket flows were removed; these are no longer
exported from the contract.

| Method | Status |
|---|---|
| `create_sponsored_trial` | Removed relayer-based trial flow |
| `claim_free_ticket_sponsored` | Removed relayer-based free ticket flow |
| `sponsor_implicit_guest` | Removed relayer-based gas sponsorship |
| `add_trial_relayer` / `remove_trial_relayer` / `is_trial_relayer` | Removed relayer allowlist surface |

### Migration / debug (build-feature only)

`reset_v11`, `wipe_and_reinit`, `test_insert`, `repair_nft_state` and
`rebuild_cid_to_tokens` (`migrate.rs` / `timelock.rs`) are gated behind
`--features migration` and are not in normal production builds. Do not
call as a rollback tool.

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
- Web clients discover KMS operators from `registry.youtick.near`; if registry
  reads fail, upload/playback must fail closed instead of falling back to a
  tracked endpoint.
