# youtick Market v2 contract

Status: `E3D_LOCAL / NOT_DEPLOYED / RUNTIME_DISABLED`

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

## Settlement (gate E3b, refund rule 2026-10-14)

Refund rule (owner decision 2026-10-10, the same as Cleeng's standard policy for card sales):
refunds are for technical failure, content not as described, or takedown; not for a change of
mind. youtick decides, so the creator share stays in escrow until the refund window closes.

- **`mark_watched(ticket_id)`** — Bridge role only, unfrozen; the Bridge calls it before the
  first playback token. It records the watch and moves no money.
  - A purchased crypto ticket becomes `watched_in_escrow`; a card ticket becomes `watched`.
  - `ticket_watched` carries `settled: false`.
  - On a watched, watched-in-escrow or released ticket it does nothing. A refunded or voided
    ticket, or a taken-down publication, makes it fail.
- **`refund_ticket(ticket_id, refund_to, expires_at_ms, signature)`** — the ticket key signs
  where the whole gross amount goes; the payment operator submits once youtick approves.
  - Allowed for `purchased` and `watched_in_escrow` crypto tickets, for 30 days after purchase.
  - After a takedown anyone may submit the signature, with no time limit.
  - The signature may be up to 7 days ahead (other ticket signatures: 1 hour), so a request
    signed by the buyer survives the 72-hour decision.
  - A failed transfer restores the ticket's previous status and the escrow. A completed refund
    clears the devices and emits `ticket_refunded`.
  - The payment operator cannot change the recipient. Like card voids, the guardian's purchase
    pause stops operator refunds (a compromised operator could otherwise run old or declined
    requests during its rotation timelock); after a takedown the buyer's own refund stays open.
- **`release_expired(ticket_ids)`** — anyone, 1–25 tickets per call (NEAR caps a call's logs at
  16,384 bytes). A `purchased` or `watched_in_escrow` crypto ticket older than 30 days becomes
  `released`: VAT to the tax balance, the platform share to the platform balance and the creator
  share to the creator balance.
  - Ineligible IDs are skipped, including tickets of taken-down publications.
  - A released ticket stays playable, and a later `mark_watched` pays nothing.
- **`withdraw_tax_balance()`** — the tax or platform account sends the VAT to `tax_account_id`.
  A failed transfer restores the balance.
- **Testnet tickets from the earlier code.** That code settled a crypto ticket on
  `mark_watched` and pushed the creator share (`creator_payout_credited` on a failed push). Such
  tickets stay `watched`: they play, and they are never refunded or released.
  `watched_in_escrow` is appended last to `TicketStatus`, so the stored tickets still decode.

## Devices (gate E3c)

- **`add_device(ticket_id, session_public_key, certificate_sha256, device_epoch, expires_at_ms, signature)`**
  — the ticket key signs, and anyone submits (normally the relayer), so the viewer sends no
  transaction.
  - At most 3 devices are active, each valid for 30 days. Re-adding a key renews it, and a
    fourth device replaces the oldest.
  - It works for purchased, watched, watched-in-escrow and released tickets. It fails for refunded or voided
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

## Card tickets (gate E3d)

- **Payment operator.** `payment_operator_id` is set at init and must differ from the Bridge,
  platform, admin, guardian and takedown accounts and from the tax account. It rotates like the other roles
  (`GovernanceRole::PaymentOperator`, timelocked on mainnet).
- **`issue_card_ticket(ticket_public_key, publication_id, device, payment_reference_hmac, gross_minor, currency)`**
  — payment operator only, after a verified provider purchase event. No tokens move.
  - The ticket key's `card_purchase` signature binds the device, the payment reference, the
    amount and the currency. The operator cannot change what the buyer signed, and a crypto
    signature does not work here.
  - Each `payment_reference_hmac` and each `ticket_id` can be used only once.
  - It follows the purchase pause and needs an `ACTIVE` publication. If it fails, the payment
    service must refund the card payment.
  - No deposit (gate E8.0): the ticket's storage is paid from the contract's reserve headroom,
    the NEAR above the storage stake and `near_operational_reserve`
    (`get_storage_reserve_status`), so the operator signs with a function-call access key. A
    deposit is refused. When the headroom does not cover the ticket the call fails with
    "Card ticket storage exceeds the operational reserve headroom" and nothing is written; a
    compromised operator can therefore spend at most the headroom, never the reserve.
- **`void_card_ticket(ticket_id, reason)`** — payment operator only; the reason is `refund` or
  `chargeback`.
  - The ticket becomes `voided` and its devices are cleared.
  - The record and its reference stay.
  - Card tickets are never refunded or released on chain.
  - The guardian's purchase pause also stops voids, so a compromised operator cannot revoke
    paid tickets while its replacement waits out the rotation timelock.
- **Watching.** `mark_watched` on a card ticket records the watch and moves no money.

## Not yet implemented

| Gate | Adds |
|---|---|
| Later | Timelocked addition of VAT keys |

There will be no brake for new creators and no upload-fee waiver (owner decision, 2026-10-07).
Invited creators receive a single-use invite link with USDC credit for upload fees. That is
handled in onboarding, outside the contract.

## Checks

See `docs/testing.md` (Market v2 contract).

The integration suite includes a cross-implementation test. It feeds the protocol's golden
purchase vector to the contract and compares the emitted event field by field.

Local and sandbox results are LOCAL_TEST evidence only.
