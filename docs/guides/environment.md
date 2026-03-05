# Environment Configuration

> Environment variables for the web app and KMS worker

---

## Web App (`apps/web/.env.local`)

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_NEAR_NETWORK` | Target network (`mainnet` or `testnet`) | `mainnet` |
| `NEXT_PUBLIC_NFT_CONTRACT_ID` | YouTick contract account | `youtick.near` |

### Optional

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_KMS_URL` | Override KMS worker endpoint | `http://localhost:8787` |
| `NEXT_PUBLIC_ONBOARDING_KEY` | Restricted onboarding function-call key | `ed25519:...` |

### Example

```env
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_KMS_URL=https://youtick-kms.<account>.workers.dev
NEXT_PUBLIC_ONBOARDING_KEY=ed25519:...
```

---

## KMS Worker (`workers/youtick-kms`)

Set with Wrangler secrets/vars:

| Variable | Description |
|----------|-------------|
| `ALLOWED_ORIGINS` | Comma-separated allowed web origins |
| `NEAR_CONTRACT_ID` | Contract used for ownership checks |
| `NEAR_NETWORK` | `mainnet` or `testnet` |

Required KV bindings:

- `VIDEO_KEYS`
- `RATE_LIMIT`
- `ACCESS_CACHE`

---

## Runtime Notes

- `NEXT_PUBLIC_*` vars are bundled into client code.
- Keep private keys out of frontend variables.
- KMS enforces signature + ownership checks before returning decryption keys.

