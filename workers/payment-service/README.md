# youtick payment service

Status: `LOCAL_TEST only / NOT_DEPLOYED`. Roadmap gate E7a; E8 adds the card path.

For now this Worker only issues **VAT attestations** for V2 crypto purchases
(`protocol/youtick-market-v2`, "VAT attestation"). It never moves money and stores nothing.

| Endpoint | Input | Output |
|---|---|---|
| `POST /v1/vat-attestations` | `{ ticket_id, publication_id }` | `{ gross_usdc_micro, vat_usdc_micro, expires_at_ms, key_version, signature }` |

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

## Checks

```bash
cd workers/payment-service
npm ci
npm test -- --run
npm run check
```

The tests reproduce the protocol golden VAT vector byte for byte with the reference test key
(LOCAL_TEST). No RPC or chain call was made.
