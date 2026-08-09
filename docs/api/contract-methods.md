# Contract methods

The exact public method set is enforced by
`scripts/check-paid-media-livepeer-v1-abi.mjs`.

## Market

Creator flow:

- `create_paid_job`, `create_paid_job_near`
- `replace_upload_key`, `restart_paid_job`
- `get_media_job`
- `get_creator_balance`, `withdraw_creator_balance`

Publication and purchase flow:

- `finalize_livepeer_publication`
- `get_publication`, `get_publications`, `get_publications_count`
- `ft_on_transfer`, `has_entitlement`
- `suspend_livepeer_sales`, `takedown_livepeer_publication`,
  `get_takedown`

Global purchase control:

- guardian-only `pause_new_purchases`
- admin-only `unpause_new_purchases`
- `get_governance_state.new_purchases_paused`

The pause refunds every new ticket transfer without changing balances or
entitlements. Existing entitlements and creator upload/job creation remain
available.

Operator and platform methods are restricted by the contract and must not be
exposed as browser shortcuts.

`get_storage_reserve_status` exposes storage bytes/stake, the configured NEAR
operational reserve, current balance, reserve headroom/runway and the exact
`reserve_covered` guard used by platform NEAR withdrawal. It is read-only and
does not make the source-only alert a deployed alarm.

### Market events

Market v2 emits NEP-297 `EVENT_JSON` records using
`youtick_market@1.0.0`. Every record carries `contract_id`,
`predecessor_account_id`, decimal `block_height`/`block_timestamp_ms` and a
business-key `idempotency_key`. The indexer supplies the final receipt ID and
event index.

The local source catalog includes:

- `media_job_authorized`, `media_job_upload_key_replaced`
- `publication_finalized`, `publication_sales_suspended`,
  `publication_takedown`
- `entitlement_purchased`
- `creator_balance_withdrawal_started`,
  `creator_balance_withdrawal_succeeded`,
  `creator_balance_withdrawal_failed`
- `platform_withdrawal_started`
- `bridge_frozen`, `bridge_rotation_proposed`, `bridge_rotated`,
  `bridge_unfrozen`
- `new_purchases_paused`, `new_purchases_unpaused`
- `quote_key_rotated`

`publication_finalized` also carries the public `title`, `playback_id` and
`published_at_ms` fields required to rebuild Discover/profile rows without a
second contract lookup.

Exact successful replays do not emit a second economic event. Upload public
keys are represented only by SHA-256 in replacement audit events; private keys,
provider credentials and TUS capabilities are never logged. `contract_migrated`
is intentionally absent because fresh Market v2 has no migration entrypoint.

## Access

The fresh-v2 access contract creates and revokes resource-bound Play grants,
verifies grants with global/scope pause enforcement, bounds each owner to 16
active grants and exposes paginated listing plus cleanup. New issuance can be
disabled independently. It also manages the market issuer, pause state,
ownership and timelocked administrative actions. Its constructor is:

```text
new(owner_id, market_contract_id)
```

`issue_session_grant` accepts one `request` object. `list_session_grants`
accepts `owner_id`, optional `from_index` and optional `limit`; list/cleanup
limits cannot exceed 16.

Use generated ABI output as the authoritative argument and return schema.
