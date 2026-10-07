# youtick Market v2 contract

Status: `E3C_LOCAL / NOT_DEPLOYED / RUNTIME_DISABLED`

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

## Settlement (gate E3b)

- **`mark_watched(ticket_id)`** — Bridge role only, unfrozen; the Bridge calls it before the
  first playback token.
  - A purchased crypto ticket becomes `watched`. VAT moves to the tax balance and the platform
    share to the platform balance.
  - The creator share is pushed to the creator. If that transfer fails, the
    `on_creator_payout` callback credits the creator balance and emits `creator_payout_credited`.
  - On a watched or released ticket it does nothing. A refunded or voided ticket, or a
    taken-down publication, makes it fail.
- **`refund_unwatched(ticket_id, refund_to, expires_at_ms, signature)`** — anyone may submit it
  with a ticket-key signature.
  - The whole gross amount goes to `refund_to`.
  - It is allowed for 30 days after purchase, and with no time limit after a takedown.
  - A failed transfer restores the ticket and the escrow. A completed refund clears the devices
    and emits `ticket_refunded`.
- **`release_expired(ticket_ids)`** — anyone, 1–25 tickets per call (NEAR caps a call's logs at 16,384 bytes). A purchased crypto ticket
  older than 30 days becomes `released` and its creator share is credited to the creator balance.
  - Ineligible IDs are skipped, including tickets of taken-down publications.
  - A released ticket stays playable, and a later `mark_watched` pays nothing again.
- **`withdraw_tax_balance()`** — the tax or platform account sends the VAT to `tax_account_id`.
  A failed transfer restores the balance.

## Devices (gate E3c)

- **`add_device(ticket_id, session_public_key, certificate_sha256, device_epoch, expires_at_ms, signature)`**
  — the ticket key signs, and anyone submits (normally the relayer), so the viewer sends no
  transaction.
  - At most 3 devices are active, each valid for 30 days. Re-adding a key renews it, and a
    fourth device replaces the oldest.
  - It works for purchased, watched and released tickets. It fails for refunded or voided
    tickets and for taken-down publications.
- **`revoke_device(...)`** — signed by the holder.
- **`platform_revoke_device(ticket_id, session_public_key)`** — platform account only, for
  example when a leak is traced through the watermark.
- **Device epoch.** Every revocation increments `device_epoch`, and so does every eviction of
  the oldest device. Any `add_device` signature made for an older epoch is rejected, so a revoked
  or evicted device cannot be restored with an old signature.
- **Authoritative source.** `get_ticket` is the authoritative device list; events are not.
  - Revocations and evictions emit `device_revoked`.
  - Expiry is implicit in `expires_at_ms`.
  - A completed refund clears all devices together with `ticket_refunded`.
  - Devices stay on taken-down publications.
- **What the Bridge must check before each token:** the ticket is playable, the publication is
  not taken down, the session key is listed and unexpired, and the certificate hash matches.
- **Limit.** A platform revocation stops one device. The ticket-key holder can sign a new device.
  Blocking a leaking ticket entirely is a Bridge policy, not a contract rule.

## Not yet implemented

| Gate | Adds |
|---|---|
| E3d | Card tickets: the payment operator role, `issue_card_ticket`, `void_card_ticket` |
| E3e | Brake for new creators; invite-phase upload fee waiver |
| Later | Timelocked addition of VAT keys |

## Checks

See `docs/testing.md` (Market v2 contract).

The integration suite includes a cross-implementation test. It feeds the protocol's golden
purchase vector to the contract and compares the emitted event field by field.

Local and sandbox results are LOCAL_TEST evidence only.
