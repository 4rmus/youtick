# youtick payment service

Status: `LOCAL_TEST only / NOT_DEPLOYED`; V2 testnet deploy path: `.github/workflows/deploy-v2-testnet.yml` (`docs/v2-testnet-runbook.md`, Workers). Roadmap gate E7a; E8 adds the card path (disabled, see "Card path").

This Worker issues **VAT attestations** for V2 crypto purchases
(`protocol/youtick-market-v2`, "VAT attestation"), counts **checkout funnel steps** (E7e) and keeps
**USDC refund requests** until youtick decides. It never moves money. The only personal data it
stores is the text a buyer writes in a refund request.

| Endpoint | Input | Output |
|---|---|---|
| `POST /v1/vat-attestations` | `{ ticket_id, publication_id }` | `{ gross_usdc_micro, vat_usdc_micro, expires_at_ms, key_version, signature }` |
| `POST /v1/funnel` | `{ step, rail, code? }` | `204` |
| `POST /v1/refund-requests` | `{ ticket_id, refund_to, expires_at_ms, signature, reason }` | `201 { request_id, status, answer_by_ms, refund_window_closes_at_ms }` |
| `GET /internal/refund-requests?status=pending` | bearer `REFUND_ADMIN_TOKEN` | `{ requests }` (at most 100) |
| `POST /internal/refund-requests/<id>/decision` | bearer; `{ decision: "refunded", tx_hash }` or `{ decision: "declined", note }` | `{ request }` |

## Rules

- **Gross amount.** It is read from the Market V2 publication (`price_usdc`) in final state, never
  taken from the request.
  - The publication must be `ACTIVE`.
  - The price must be at least 5 USDC.
  - The `ticket_id` must not exist yet; the contract would refund a duplicate.
- **VAT.**
  - The price is VAT-inclusive. VAT is `gross × rate / (10000 + rate)`, rounded up.
  - It falls back to rounding down only when rounding up would cross the contract's 27% cap.
- **Policy.**
  - Only `VAT_POLICY=fixed-testnet` exists: one rate for every buyer, testnet only.
  - The request accepts no buyer country, identity or account.
  - Mainnet is refused until the tax adviser's evidence policy (roadmap X3) is implemented.
- **Signing key.**
  - Before signing, the Worker checks that Market V2 `get_vat_public_key(VAT_KEY_VERSION)` equals
    the signer's public key. The result is cached for 60 s.
  - A revoked or rotated key therefore stops attestations instead of producing purchases the
    contract would reject.
- **Expiry.** An attestation expires 10 minutes after it is issued. The contract allows at most
  one hour.
- **Access.** `ALLOWED_ORIGINS`, plus a per-IP rate limiter.
- **Funnel.**
  - `step` and `rail` come from fixed lists in `src/funnel.ts`. `code` is allowed only with
    `purchase_failed`; a value outside the fixed failure list is counted as `other`.
  - Each event is one Workers Analytics Engine data point (`FUNNEL` binding, dataset
    `youtick_checkout_funnel`) holding the step, the rail and the code. No IP, account, session
    id, user agent or publication is written, so steps cannot be joined into one person's path.
  - The IP is used only as the rate-limiter key. Without the binding, events are accepted and
    dropped.

## Refund requests

Refund rule (owner decision 2026-10-10): technical failure, content not as described or takedown;
no change of mind. youtick answers within 72 hours.

- **Request.** The web page has the ticket key sign `refund_ticket` (recipient: the buyer's own
  account, valid up to 7 days) and posts it with the buyer's description (10–1000 characters).
- **Checks before storing** (the same the contract makes on submit): the ticket exists, is crypto
  and `purchased` or `watched_in_escrow`; it is less than 30 days old unless its publication is
  taken down; the signature verifies against the ticket's own public key; it expires in the future
  and at most 7 days ahead. One pending request per ticket (D1 partial unique index). The reason
  is counted in characters (code points), as SQLite counts them.
- **Answer time.** 72 hours, capped at the moment the contract's 30-day window closes
  (`refund_window_closes_at_ms`; `null` after a takedown, which has no limit). After that moment
  anyone may call `release_expired`, so a late answer could no longer refund.
- **Decision.** The operator tool (`scripts/refunds.mjs`) lists pending requests, submits approved
  refunds with the payment operator key from the operator's own machine, then records
  `refunded` with the transaction hash. The service accepts `refunded` only when Market V2
  `get_ticket` reads `refunded`. A decline needs a note; nothing goes to the chain.
- **Storage.** `REFUNDS` D1 (`migrations/`): ticket id, publication, recipient account (a
  pseudonymous NEAR account tied to the ticket), signed arguments, the buyer's text, status and
  decision. No e-mail, IP or sign-in identity. A retention rule waits for the privacy review
  (roadmap X4).
- **Known limits.** The list returns at most 100 requests per status, oldest first. `record`
  trusts the hash it is given once the chain shows the ticket refunded.
- **Access.** The public endpoint follows `ALLOWED_ORIGINS` and the rate limiter. The internal
  endpoints need `REFUND_ADMIN_TOKEN` (secret, at least 32 characters) and accept no browser origin.

## Operator tool

```bash
cd workers/payment-service
export REFUND_ADMIN_TOKEN=…   # from the owner's password manager; never a file in the repository
node scripts/refunds.mjs list
node scripts/refunds.mjs approve <request_id> --key-file ~/youtick-v2-testnet-keys/payment_operator.json
node scripts/refunds.mjs decline <request_id> --note "The video plays normally."
node scripts/refunds.mjs approve-takedowns --key-file ~/youtick-v2-testnet-keys/payment_operator.json
```

`PAYMENT_SERVICE_URL` (default `https://pay-v2-testnet.youtick.net`), `NEAR_RPC_URL` (default
`https://rpc.testnet.near.org`), `MARKET_V2_CONTRACT_ID` and `PAYMENT_OPERATOR_ID` (V2 testnet
defaults) can be overridden. `list` sorts by the moment each refund window closes and flags those
closing within 72 hours. `approve` re-reads the ticket, refuses a closed window, checks that the key
file's public key is an access key of the payment operator, asks for confirmation, prints the
transaction hash before sending (for `record` if the run stops), sends `refund_ticket` and waits
for the final outcome. `approve-takedowns` does the same, after one confirmation, for every
pending request whose video is taken down: a takedown needs no review, has no time limit and is
not stopped by the purchase pause. One failed refund does not stop the others; it stays pending.
The private key is read only by the approving commands and never printed.

## Card path

Status: `LOCAL_TEST only / DISABLED`. Roadmap E8, preparation gate. The card provider (Cleeng,
merchant of record) is not connected: its sandbox (roadmap X1) is not open, so no provider adapter
exists and every card endpoint answers `503 card_path_disabled`. `CARD_PATH_ENABLED` is `false`.

| Endpoint | Input | Output |
|---|---|---|
| `POST /v1/card-orders` | `{ publication_id, ticket_public_key }` | `201 { order_id, status, ticket_id, payment_reference_hmac, gross_minor, currency, needs_signature }` |
| `POST /v1/card-orders/<id>/device` | `{ session_public_key, certificate_sha256, expires_at_ms, signature }` (`card_purchase`) | the order |
| `GET /v1/card-orders/<id>` | — | the order |
| `POST /webhooks/card` | the provider's delivery, authenticated by the adapter | `{ received }` |
| `GET /internal/card-orders?status=&after=` | operator tool token | `{ orders }` (at most 100; no keys or signatures) |
| `GET /internal/card-ledger` | operator tool token | `{ entries }` |
| `POST /internal/card-events` | operator tool token; `{ provider_event_id: "report:…", kind, provider_order_id, amount_minor, currency, occurred_at_ms }` | `{ outcome }` |

- **Order.** The price comes from Market V2 (`ACTIVE`, at least 5 USDC) in USD cents; a USDC price
  that is not whole cents is refused. The adapter makes the provider order;
  `payment_reference_hmac` is HMAC-SHA256 of the provider order id under `CARD_REFERENCE_SECRET`
  (32 bytes, hex), as the protocol golden vector computes it. One order per ticket key.
- **Signature.** The ticket key signs `card_purchase` over the reference and the amount. The
  service checks it as the contract will and accepts an expiry at most one hour ahead. A payment
  that lands after the signature expired waits as `paid` with `device_signature_expired`; the
  buyer's page signs again (`needs_signature`).
- **Events.** Only an adapter-authenticated webhook or an operator-imported report event changes
  an order; a browser redirect never does. Each event is stored once under the provider's id (for
  Cleeng the delivery id). A purchase for another amount or currency than the order is refused
  (`amount_mismatch`). A refund or lost chargeback cancels an order before any send and turns an
  issued (or in-flight) one into `void_pending`. Opened and won chargebacks are recorded only.
- **Operator.** One Durable Object (`CardOperator`) sends `issue_card_ticket` and
  `void_card_ticket`, both without a deposit: the ticket's storage comes from the Market's reserve
  headroom (gate E8.0), so `PAYMENT_OPERATOR_PRIVATE_KEY` is a function-call key limited to these
  two methods, never a full-access key. Each transaction hash is stored before sending; an unknown
  outcome is settled by reading the ticket, not by resending. An order stops after 5 sends and
  waits for the operator. After an unknown outcome nothing is resent and no order is cancelled
  until the transaction status reads failed; the cron re-checks such orders. When the Market
  refuses because its headroom cannot pay for the storage, the order keeps `reserve_exhausted`
  without using up an attempt and the cron retries it (each retry costs the operator gas);
  `card-orders.mjs reconcile` reports it as `stuck_paid_reserve_exhausted` after 15 minutes, and
  the fix is NEAR on the Market account, not on the operator.
- **Ledger.** `card_ledger` keeps the provider's money facts per event (sale, refund, chargeback).
  No creator share is computed: the card split is an open owner decision (roadmap D4).
- **Stored per order.** Publication, creator, ticket and device public keys, the device
  signature, amounts and transaction hashes. No e-mail, name, IP or card data.

What waits for the sandbox (EXTERNAL_NOT_RUN): the Cleeng adapter (offer per video, SSO customer,
order creation, mapping `transactionCreated` and `paymentRefunded` to the order), the web checkout,
and turning the path on (Durable Object binding and migration, cron, `PAYMENT_OPERATOR_ID`,
secrets). Only the documented Cleeng signature check exists (`verifyCleengSignature`), tested
against a self-computed value, not a real delivery. Open provider questions: how a
`transactionCreated` event maps to the order (it carries no order id), `paymentRefunded` to
`paymentId` mapping, and chargebacks, which have no webhook and come from the provider's refunds
report through `POST /internal/card-events`.

```bash
node scripts/card-orders.mjs reconcile               # every order against its ticket on chain
node scripts/card-orders.mjs ledger --month 2026-11  # per creator and currency, no split
```

## Checks

```bash
cd workers/payment-service
npm ci
npm test -- --run
node --test scripts/refunds.test.mjs scripts/card-orders.test.mjs
npm run check
```

The tests reproduce the protocol golden VAT vector byte for byte with the reference test key
(LOCAL_TEST). No RPC or chain call was made.
