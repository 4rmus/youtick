# youtick Market v2 contract

Status: `E3A_LOCAL / NOT_DEPLOYED / RUNTIME_DISABLED`

This crate is the V2 Market. It is forked from `contracts/nft-ticket` at the merged self-upgrade
gate (#257) and goes to mainnet under a new contract ID with empty state. Nothing is migrated
from V1. The V1 crate stays frozen for the current testnet pilot.

The byte formats it accepts are defined in `protocol/youtick-market-v2`.

## What changed from V1 (gate E3a)

- **Tickets instead of account entitlements.** A ticket is keyed by
  `ticket_id = sha256(ticket public key)` and never records the buyer account.
  - `has_entitlement` and the `livepeer-v1:entitlements` collection are gone.
  - `get_ticket(ticket_id)` reads a ticket.
- **Purchase.** USDC `ft_transfer_call` with `msg.action = "buy_ticket_v2"` (strict JSON,
  unknown fields rejected). The contract verifies:
  - canonical keys, hex values and integers, and signature expiries at most one hour ahead;
  - the ticket key's `purchase_device` signature;
  - youtick's VAT attestation for an allowlisted `key_version`;
  - that the amount equals the publication price.
  A reused `ticket_id`, a paused market, an inactive publication or a wrong amount returns the
  full amount.
- **Escrow.** The whole gross amount stays in escrow (`get_escrow_balance`).
  - VAT, the platform share (floor of 5% of net) and the creator share are recorded on the
    ticket.
  - Nothing is credited to creator or platform balances at purchase.
  - VAT above a 27% inclusive rate is rejected.
- **Minimum price** is 5 USDC, VAT included.
- **VAT keys.** One key is set at init. The admin or guardian can revoke a key at once
  (`revoke_vat_key`). Adding a key widens authority and will need a timelock.
- **Tax account.** `tax_account_id` is set at init and must differ from the platform and bridge
  accounts.
- **Devices.**
  - The purchase stores one ticket device: session key, certificate hash, 30-day expiry and
    `device_epoch = 0`.
  - Account devices (`activate_playback_device`) remain only for the creator's preview of their
    own publication.
- **Events.** `ticket_purchased` uses the protocol envelope `youtick_market` / `2.0.0` with no
  buyer account. Upload, publication and governance events are unchanged from V1.

Upload, publication, takedown, roles, timelocks, guardian controls, withdrawals and the hash-first
self-upgrade path are unchanged from V1.

## Not yet implemented

Later E3 gates add the following. Until then, escrowed funds cannot leave the contract.

| Gate | Adds |
|---|---|
| E3b | `mark_watched` with push payout, `refund_unwatched`, `release_expired`, V2 takedown rules |
| E3c | `add_device`, holder and platform `revoke_device` |
| E3d | Card tickets: the payment operator role, `issue_card_ticket`, `void_card_ticket` |
| E3e | Brake for new creators; invite-phase upload fee waiver |
| Later | Timelocked addition of VAT keys |

## Checks

See `docs/testing.md` (Market v2 contract).

The integration suite includes a cross-implementation test. It feeds the protocol's golden
purchase vector to the contract and compares the emitted event field by field.

Local and sandbox results are LOCAL_TEST evidence only.
