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

Operator and platform methods are restricted by the contract and must not be
exposed as browser shortcuts.

## Access

The access contract creates and revokes Play grants, verifies grants, manages
the market issuer, pause state, ownership and timelocked administrative
actions. Its constructor is:

```text
new(owner_id, market_contract_id)
```

Use generated ABI output as the authoritative argument and return schema.
