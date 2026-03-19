# Environment Configuration

> Practical environment settings for the web app and KMS worker

---

## Web App

Most-used fields in `apps/web/.env.local`:

| Variable | Required | Purpose |
|----------|:--------:|---------|
| `NEXT_PUBLIC_NEAR_NETWORK` | Yes | `mainnet` or `testnet` |
| `NEXT_PUBLIC_NFT_CONTRACT_ID` | Yes | Backward-compatible alias for the market contract |
| `NEXT_PUBLIC_MARKET_CONTRACT_ID` | Recommended | Market and entitlement contract |
| `NEXT_PUBLIC_ACCESS_CONTRACT_ID` | Recommended | Session grant contract |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` | Recommended | Operator and relayer registry |
| `NEXT_PUBLIC_KMS_URL` | No | Overrides the default KMS worker URL |
| `NEXT_PUBLIC_APP_URL` | No | Base URL used in generated links |
| `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT` | No | Enables 1Click + MetaMask checkout |
| `NEXT_PUBLIC_ENABLE_LEGACY_UPLOAD_FALLBACK` | No | Re-enables legacy publish fallback |
| `NEXT_PUBLIC_ONBOARDING_KEY` | No | Legacy browser onboarding key |
| `NEXT_PUBLIC_ONE_CLICK_API_TOKEN` | No | 1Click quote and swap token |
| `NEXT_PUBLIC_DEPLOY_TARGET` | No | Web4 build selector |

### Mainnet example

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_KMS_URL=https://youtick-kms.<account>.workers.dev
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=false
NEXT_PUBLIC_ENABLE_LEGACY_UPLOAD_FALLBACK=false
```

### Local dev example (testnet)

```txt
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=<dev-xxx.utick.testnet>
NEXT_PUBLIC_MARKET_CONTRACT_ID=<dev-xxx.utick.testnet>
NEXT_PUBLIC_ACCESS_CONTRACT_ID=<access-xxx.utick.testnet>
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=<registry-xxx.utick.testnet>
NEXT_PUBLIC_KMS_URL=http://localhost:8787
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Server-only fields

These must remain server-side only:

| Variable | Purpose |
|----------|---------|
| `RELAYER_ACCOUNT_ID` | Optional relayer account for sponsored trial flows |
| `RELAYER_PRIVATE_KEY` | Relayer private key |

If you keep relayer fallback enabled, the relayer must also be active in the registry and able to execute the current owner-gated sponsored trial path.

---

## KMS Worker

Required values in `workers/youtick-kms`:

| Variable | Purpose |
|----------|---------|
| `ALLOWED_ORIGINS` | Allowed origin list |
| `NEAR_CONTRACT_ID` | Market contract used for entitlement checks |
| `NEAR_ACCESS_CONTRACT_ID` | Access contract used for session grant verification |
| `NEAR_REGISTRY_CONTRACT_ID` | Registry contract used for operator and relayer verification |
| `REGISTRY_OPERATOR_ACCOUNT_ID` | Operator account expected for this worker |
| `OPERATOR_SHARE_SECRET` | Share-encryption secret for this worker |
| `NEAR_NETWORK` | `mainnet` or `testnet` |

KV bindings:

- `VIDEO_KEYS`
- `RATE_LIMIT`
- `ACCESS_CACHE`

Use separate KV namespaces for mainnet and testnet.

---

## Notes

- Every `NEXT_PUBLIC_*` value is shipped to the browser bundle.
- Secret keys belong in workers, API routes, or local deployment scripts.
- KMS authorization is based on signed requests and on-chain reads, not on URL secrecy.
