# youtick Market v2 protocol

Status: `SPEC_LOCAL / NO_RUNTIME`. This directory locks the byte formats shared by the V2
Market contract, the Bridge, the payment service and the web client before any of them is
written. Nothing here is deployed or enabled. V1 (`protocol/paid-media-livepeer-v1`) is
unchanged and remains the protocol of the current testnet pilot.

- `schema.json`: JSON Schema for the purchase message, contract call arguments and events.
- `golden-vectors.json`: deterministic vectors built from fixed public test inputs.
- `scripts/check-youtick-market-v2.mjs`: reference implementation (Node, `node:crypto` only).
  - `node scripts/check-youtick-market-v2.mjs` rebuilds every vector and fails on drift.
  - `--write` regenerates the file.
  - Test keys are derived from public labels and hold no value.

Consumers (Rust contract, Bridge, payment service, web) must reproduce these vectors in their
own tests.

## Encodings

- Public keys: NEAR form `ed25519:<base58 of exactly 32 bytes>`, canonical base58.
- Signatures: Ed25519 over the UTF-8 canonical message bytes, standard padded base64
  (88 characters). The contract verifies with `env::ed25519_verify`, available in the pinned
  near-sdk 5.5.0.
- Integers: canonical unsigned decimal strings without leading zeros, range-checked per type:
  - u32: `device_epoch`, `key_version`
  - u64: times in Unix ms, `gross_minor`
  - u128: USDC micro amounts
- `ticket_id`: lowercase hex SHA-256 of the raw 32-byte ticket public key.
- Canonical messages: fields joined by `\n`, with no trailing newline.
  - Every field is a non-empty string without `\r` or `\n`.
  - Each action has a fixed field count.
  - A message with an empty field or a line break is rejected.

## Ticket keys

A ticket is bound to a per-purchase key, not to an account. Keys are never stored; every
device re-derives them.

1. `ckd_key`: the 32-byte key the client obtains from NEAR MPC Confidential Key Derivation
   through `ckd-gate`. This step is outside this protocol (V2 roadmap gates E4–E5).
2. `root = HKDF-SHA256(ikm = ckd_key, salt = "youtick.market-v2.root.v1", info = "youtick.market-v2.ticket-root", 32)`.
3. `seed_n = HKDF-SHA256(ikm = root, salt = empty, info = "youtick.market-v2.ticket.v1" ‖ u32_be(n), 32)`.
   This is the Ed25519 private-key seed. `n` starts at 0 and increases by one per purchase.
4. Recovery: derive `n = 0, 1, 2, …` and read `get_ticket(ticket_id)`; stop after 20
   consecutive missing tickets.
   - This depends on the contract never deleting a ticket (see the contract rules).
   - A purchase that collides on `n` is refunded by the contract and retried with `n + 1`.

## Ticket-key signatures

Signed by the ticket key. Domain `youtick.market-v2.ticket-sig.v1`:

```
youtick.market-v2.ticket-sig.v1
<network>
<contract_id>
<action>
<ticket_id>
<expires_at_ms>
<action fields…>
```

| Action | Fields after `expires_at_ms` | Used by |
|---|---|---|
| `purchase_device` | `publication_id`, `session_public_key`, `certificate_sha256` | crypto purchase `msg.device` |
| `card_purchase` | `publication_id`, `session_public_key`, `certificate_sha256`, `payment_reference_hmac`, `gross_minor`, `currency` | `issue_card_ticket.device` |
| `add_device` | `session_public_key`, `certificate_sha256`, `device_epoch` | `add_device` (any caller; the relayer submits) |
| `revoke_device` | `session_public_key`, `device_epoch` | holder-signed `revoke_device` |
| `refund_ticket` | `refund_to` | `refund_ticket` (the payment operator submits; anyone after a takedown) |

`network` and `contract_id` stop reuse across networks and contracts, including on implicit
accounts that exist on both networks. The action line stops reuse across calls.

A card checkout signature cannot become a crypto purchase, and the reverse is also impossible.
The card signature also binds the payment reference and the amount.

## VAT attestation

The ticket price is VAT-inclusive. youtick's VAT signer attests the VAT amount for one ticket.
Domain `youtick.market-v2.vat.v1`:

```
youtick.market-v2.vat.v1
<network>
<contract_id>
<ticket_id>
<publication_id>
<gross_usdc_micro>
<vat_usdc_micro>
<expires_at_ms>
<key_version>
```

- The buyer's country is not written on-chain.
- How the signer decides the VAT amount (buyer location evidence) is open with the tax adviser
  (roadmap X3).
- A VAT-inclusive rate above 27% (`MAX_VAT_RATE_BPS = 2700`, the highest EU standard rate) is
  rejected: `vat × (10000 + 2700) ≤ gross × 2700`. A buggy or leaked signer therefore cannot
  divert a whole sale to the tax account.

## Escrow and split

Amounts are in micro-USDC.

- `gross ≥ 5_000_000`.
- `net = gross − vat`, `platform = floor(net / 20)`, `creator = net − platform`.
  `vat + platform + creator = gross`.
- The whole gross amount stays in the ticket's escrow until the ticket settles, watched or not.
- `mark_watched` only records the watch: a crypto ticket becomes `watched_in_escrow`.
- `release_expired`, 30 days after purchase, settles `purchased` and `watched_in_escrow` crypto
  tickets: VAT to the tax balance, the platform share to the platform balance and the creator
  share to the creator balance.
- `refund_ticket` returns the whole gross amount of a `purchased` or `watched_in_escrow` ticket.
  Nothing has left escrow before it settles, so a refund never uses another ticket's money.
- Refund rule (owner decision 2026-10-10, same as the card provider's): refunds are for technical
  failure, content not as described, or takedown; not for a change of mind. youtick decides, so
  the payment operator submits the buyer-signed refund. After a takedown the buyer may submit
  without youtick. The guardian's purchase pause stops operator refunds, not takedown refunds.

For example, 5 USDC with 833,334 VAT gives net 4,166,666, platform 208,333 and creator 3,958,333.

## Crypto purchase

`ft_transfer_call` on the USDC contract with `receiver_id = <market>`, `amount = gross` and
`msg` = JSON `purchase_msg`:

```json
{
  "action": "buy_ticket_v2",
  "publication_id": "…",
  "ticket_public_key": "ed25519:…",
  "device": { "session_public_key": "ed25519:…", "certificate_sha256": "…", "expires_at_ms": "…", "signature": "<purchase_device>" },
  "vat": { "vat_usdc_micro": "…", "expires_at_ms": "…", "key_version": "…", "signature": "<VAT attestation>" }
}
```

The buyer account is not part of the ticket.

## Upload through NEAR Auth

A creator who signed in with Google or a passkey holds an implicit account whose only signing
path is a NEAR Auth approval (`fatxn`) that the relayer turns into an MPC signature. Two upload
steps need that signature; every other upload step is signed by the per-job upload key.

**Paying the upload fee.** `ft_transfer_call` on the USDC contract with
`receiver_id = <market>`, `amount = fee` and `msg` = JSON `upload_msg`, keys in this order:

```json
{
  "action": "create_paid_job",
  "job_id": "…",
  "title": "…",
  "price_usdc": "…",
  "expected_source_bytes": "…",
  "profile_id": "paid-media-v1",
  "profile_config_sha256": "…",
  "upload_public_key": "ed25519:…",
  "upload_key_expires_at_ms": "…"
}
```

- `fee = max(ceil(expected_source_bytes × 3 / 10,000), 500,000)` micro-USDC, the contract's
  formula. `price_usdc` is at least 5,000,000; `expected_source_bytes` is 1 to 20,000,000,000;
  `title` is 1-200 UTF-8 bytes, not blank, without control characters.
- The arguments are `{ receiver_id, amount, msg }` with no `memo`. There is no sponsor quote and
  no `playback_session`: the relayer sponsors gas, and Market V2 has no public beta or public
  upload policy, so the contract charges the plain fee. The creator is `sender_id`.
- `profile_id` is the provider-neutral `paid-media-v1` (owner decision 2026-10-22; V1 uses
  `paid-media-livepeer-v1`, which Market V2 rejects). `profile_config_sha256` is any 64-hex
  value; the Bridge, not the contract, decides which profile hashes it serves.
- Gas 100 Tgas, deposit 1 yoctoNEAR.

**Replacing a lost upload key.** `replace_upload_key { job_id, new_public_key, expires_at_ms }`
on the Market, gas 100 Tgas, deposit 0.

**Delegate bytes.** Each step is one delegate action with one FunctionCall, encoded as
near-api-js `encodeDelegateAction` does: the NEP-461 prefix (`2^30 + 366`, little-endian u32)
followed by the Borsh `DelegateAction` (`sender_id`, `receiver_id`, the action, `nonce`,
`max_block_height`, `public_key`). The web client builds these bytes, the NEAR Auth screen
approves them, and the relayer rebuilds them from the submitted fields and refuses anything
that is not byte-equal. `upload_id = sha256(delegate bytes)` identifies the submission. The
`upload` vector holds both delegates with fixed nonce, block height and keys; the relayer and
web tests must reproduce `bytes_base64` exactly.

## Card tickets

The payment operator writes card tickets without moving tokens:
- `issue_card_ticket { ticket_public_key, publication_id, device, payment_reference_hmac, gross_minor, currency }`.
  `device.signature` is the `card_purchase` signature. Gas 100 Tgas, deposit 0: the ticket's
  storage comes from the contract's reserve headroom (`get_storage_reserve_status`), so the
  operator signs with a function-call access key. A deposit is refused, and so is a ticket the
  headroom does not cover; the payment service then keeps the order waiting.
- `void_card_ticket { ticket_id, reason }`, where the reason is `refund` or `chargeback`.
  Gas 100 Tgas, deposit 0.

The payment reference is stored only as `payment_reference_hmac`: an HMAC-SHA256 of the
provider order ID, keyed by a payment-service secret. A plain hash of a guessable order ID
could be reversed.

## Other calls

| Call | Arguments |
|---|---|
| `add_device` | `{ ticket_id, session_public_key, certificate_sha256, device_epoch, expires_at_ms, signature }` |
| `revoke_device` (holder) | `{ ticket_id, session_public_key, device_epoch, expires_at_ms, signature }` |
| `platform_revoke_device` (platform role) | `{ ticket_id, session_public_key }` |
| `refund_ticket` (payment operator; anyone after a takedown) | `{ ticket_id, refund_to, expires_at_ms, signature }` |
| `mark_watched` (Bridge role) | `{ ticket_id }` |
| `release_expired` (anyone) | `{ ticket_ids: [1..25] }`; NEAR caps one call's logs at 16,384 bytes |
| `replace_upload_key` (job creator) | `{ job_id, new_public_key, expires_at_ms }`; see "Upload through NEAR Auth" |

The relayer submits `add_device` from its own account (`workers/relayer`, `POST /v1/devices`), so
linking or renewing a device needs no transaction by the holder. The `device_link` vectors apply
in order after `calls.revoke_device_args`, at device epoch 1:
- `link_at_epoch_1` links the revoked second session again;
- `renewal` renews the purchase session: same key and epoch, nothing is evicted and the epoch
  stays.

Each holds the ticket signature, the `add_device` arguments and the `device_added` event at block
time `issued_at_ms` (a link or renewal lasts 30 days from the block).

## Contract rules this protocol relies on

1. **Messages from raw arguments.** Build every signed message from the raw argument strings,
   after checking that each key, hex value and number round-trips to its canonical form. Never
   re-serialize parsed values.
2. **Signature expiry.** Reject a signature that has expired, or whose `expires_at_ms` is more
   than `3_600_000` ms ahead of the block time. A `refund_ticket` signature may be up to
   `604_800_000` ms (7 days) ahead, because the request waits for youtick's decision.
3. **No deduplication by signature bytes.** Base64 trailing bits and verifier strictness can
   allow more than one accepted encoding of the same signature.
4. **Price check.** The transferred amount must equal the attested gross and the publication's
   current price.
5. **VAT keys.** Accept only `key_version` values on an on-chain allowlist, which the
   timelocked roles can extend and revoke.
6. **One device epoch per ticket.** The epoch starts at 0.
   - `add_device` must carry the current epoch.
   - Every revocation (holder or platform) increments it, and so does the eviction of the oldest
     device when a fourth is added. An unexpired `add_device` signature therefore cannot re-add a
     revoked or evicted device.
7. **Card tickets.** Each `payment_reference_hmac` may be used only once.
   - A `ticket_id` that already exists is rejected.
   - A crypto purchase on an existing `ticket_id` returns the full amount.
8. **Tickets are never deleted.** Refunded, voided and released tickets stay as tombstones, so
   the recovery scan and `ticket_id` uniqueness keep working.
9. **Watched before playback.** The Bridge finalizes `mark_watched` before it issues the first
   playback token for a ticket.
   - `mark_watched` succeeds for `purchased` tickets (records the watch) and for `watched`,
     `watched_in_escrow` or `released` tickets (no-op). Those tickets may play. No call moves
     money on a watch.
   - It fails for `refunded` or `voided` tickets and for taken-down publications. Those get no
     token.
   - This closes the race between playing and refunding.
10. **Refund window.** `refund_ticket` is allowed while a crypto ticket is `purchased` or
    `watched_in_escrow` and younger than 30 days. After a takedown it stays open with no time
    limit; there is no other exit for that escrow.
11. **Ticket statuses.** `purchased`, `watched_in_escrow` (crypto, watched, money in escrow),
    `watched` (card; on testnet also crypto tickets the earlier code settled on watch, which are
    never refunded or released), `released`, `refunded`, `voided`.

## Playback request

Signed by the device session key. Domain `youtick.market-v2.playback.v1`:

```
youtick.market-v2.playback.v1
<network>
<contract_id>
<ticket_id>
<session_public_key>
<origin>
<device_nonce>
<expires_at_ms>
```

## Events

The envelope is `{ "standard": "youtick_market", "version": "2.0.0", "event", "data": [ … ] }`.

| Event | Notable fields |
|---|---|
| `ticket_purchased` | gross, VAT, net, platform and creator amounts; `vat_key_version` |
| `card_ticket_issued` | `gross_minor`, `currency`, `payment_reference_hmac` |
| `device_added`, `device_revoked` | `device_epoch` |
| `ticket_watched` | the ticket's VAT, platform and creator amounts; `settled: false` (nothing moves on a watch) |
| `ticket_released` | the settled VAT, platform and creator amounts |
| `ticket_refunded` | `refunded_usdc_micro` |
| `card_ticket_voided` | `reason` |
| `creator_payout_credited` | earlier testnet code only: the creator share credited after a failed push on `mark_watched` |

No event carries a buyer account. Field lists are in `schema.json`. The contract gate (E3) may
add payout-outcome events. It must not remove fields listed here without a protocol version
change.

## Size budget for NEAR Auth signing

A crypto purchase, an upload fee payment and an upload-key replacement are each one NEAR Auth
(MPC) signature over a delegate action. Two limits apply:

- **Approval token:** the token carries the delegate bytes as a JSON array of decimals
  (`fatxn`), and the guard rejects tokens above 7,168 bytes.
- **Auth0 prompt:** the prompt renders the delegate verbosely and has a 24,576-byte form limit.
  The measured ratio is 27,101 prompt bytes for a 2,235-byte delegate
  (`docs/architecture/near-auth-prompt-size.md`).

The checker builds these delegates:
- purchase, worst case with a 128-character publication ID, and typical with `lp-` + UUID
  (39 characters);
- upload fee, worst case with a 128-character job ID, a 200-byte title and the maximum source
  size, and typical with `lp-` + UUID and a 40-byte title;
- `replace_upload_key`, worst case with a 128-character job ID.

It requires every worst case to fit both limits, and each typical case to stay under 85% of each.

| Case | Delegate | Token (estimate) | Prompt (estimate) |
|---|---:|---:|---:|
| Purchase, typical | 1,027 B | ~5,525 / 7,168 B | ~12,454 / 24,576 B |
| Purchase, worst | 1,116 B | ~6,050 / 7,168 B | ~13,533 / 24,576 B |
| Upload, typical | 794 B | ~4,570 / 7,168 B | ~9,628 / 24,576 B |
| Upload, worst | 1,043 B | ~5,948 / 7,168 B | ~12,648 / 24,576 B |
| `replace_upload_key`, worst | 447 B | ~3,053 / 7,168 B | ~5,421 / 24,576 B |

- The token estimate uses illustrative values for every claim other than `fatxn`.
- It is UNPROVEN until it is compared with a live NEAR Auth token, which needs the mainnet
  tenant.
- Headroom is limited, so any field added to `purchase_msg` or `upload_msg` must keep this check
  passing. The V1 upload message with its sponsor quote measured 9,815 bytes, which is why the
  V2 upload carries no quote.

## Evidence

LOCAL_TEST: the checker reproduces every vector, verifies every signature and checks that:
- each signature binds its network, contract and action;
- the card signature binds the payment reference;
- the VAT attestation binds the VAT amount and the network;
- the split adds up to the gross amount;
- the upload and `replace_upload_key` delegates rebuild byte-for-byte from their fields and
  bind the nonce and the sender, and the upload amount equals the fee formula;
- the `device_link` messages rebuild from their arguments, bind the device epoch and carry the
  epoch after the revoke vector.

It rejects:
- a gross amount below the minimum
- VAT above the 27% inclusive rate
- non-canonical or out-of-range integers
- line breaks in a field
- unknown actions
- an upper-case `ticket_id`
- a public key shorter than 32 bytes

No contract, Worker or browser consumes this protocol yet.
