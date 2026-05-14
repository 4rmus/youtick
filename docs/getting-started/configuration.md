# Configuration Reference

> The environment variables that are actually used and what they do.

---

## Web App

Core settings for `apps/web/.env.local`:

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
```

Without these the app cannot connect to the right contract set or network.

### Required

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_NEAR_NETWORK` | `mainnet` or `testnet` | `mainnet` |
| `NEXT_PUBLIC_MARKET_CONTRACT_ID` | Market and ownership contract | `youtick.near` |
| `NEXT_PUBLIC_ACCESS_CONTRACT_ID` | Session grant contract | `access.youtick.near` |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` | Operator and relayer registry | `registry.youtick.near` |
| `NEXT_PUBLIC_NFT_CONTRACT_ID` | Legacy compatibility alias | `youtick.near` |

### Optional

| Variable | Description | When you need it |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Base URL used in gift links | When using a different domain or a local tunnel |
| `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT` | Opens the 1Click + MetaMask path | Only when the value is exactly `true`; off by default |
| `NEXT_PUBLIC_ONE_CLICK_API_TOKEN` | 1Click quote / swap partner token | When you'll use Arbitrum/Base payments |
| `NEXT_PUBLIC_DEPLOY_TARGET` | Changes Web4 build behavior | When using `npm run build:web4` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Enables a Turnstile challenge on the trial/onboarding screen | When protecting the onboarding-key endpoint against bots |
| `NEXT_PUBLIC_SENTRY_ENABLED` | Master switch for Sentry (`true` / `false`) | When enabling Sentry in prod; the DSN alone is not enough |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error collection endpoint | Required together with `NEXT_PUBLIC_SENTRY_ENABLED=true` |
| `NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE` | Enables Lighthouse status/persistence checks | Set `true` only when the Storage API Worker is ready |
| `NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD` | Opens the Lighthouse primary upload path | On by default; set `false` only for local diagnosis |
| `NEXT_PUBLIC_ENABLE_CRUST_UPLOAD_FALLBACK` | Falls back to Crust if Lighthouse upload fails | Off by default; set `true` only for emergency diagnosis |
| `NEXT_PUBLIC_STORAGE_UPLOAD_PROVIDER` | Active upload provider selection | Default `lighthouse`; do not change for new uploads |
| `NEXT_PUBLIC_STORAGE_API_URL` | Storage API Worker URL | Required for Lighthouse pin/status piloting |
| `NEXT_PUBLIC_ENABLE_MEDIA_DELIVERY_WORKER` | Opens the Media Delivery Worker read path | Set `true` only after worker deploy + smoke test |
| `NEXT_PUBLIC_MEDIA_DELIVERY_URL` | Media Delivery Worker URL | Required for encrypted IPFS manifest/segment routing |

### Server-side onboarding

The onboarding key for trial and guest account creation is no longer
placed in the client bundle. It is held server-side and handed out
through `/api/onboarding-key` after rate-limit and Turnstile checks.
When `TURNSTILE_SECRET_KEY` is set, the challenge token is mandatory.

| Variable | Description |
|---|---|
| `ONBOARDING_KEY` | Single function-call access key |
| `ONBOARDING_KEYS` | Comma-separated key pool; takes precedence over `ONBOARDING_KEY` when set |
| `TURNSTILE_SECRET_KEY` | Turnstile verification secret |

`RELAYER_ACCOUNT_ID` and `RELAYER_PRIVATE_KEY` are no longer required.

---

## Example Configurations

### Minimum mainnet

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=false
```

### Local development

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For testnet work, do not copy the old shared dev accounts. Deploy your
own market, access and registry contract set, then point these env
fields at your own testnet accounts.

### Trial + cross-chain enabled

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ONE_CLICK_API_TOKEN=...
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true
```

Cross-chain checkout is experimental in public alpha and the EVM v1
scope is limited to Arbitrum + Base. Ethereum mainnet is not selectable
in the UI.

Trial and guest account creation uses `ONBOARDING_KEY` or
`ONBOARDING_KEYS`. These keys are registered by the contract owner via
`add_onboarding_key`; the `NEXT_PUBLIC_` prefix is not used. During
mainnet rotation, the new key is added first with
`scripts/add-onboarding-key.mjs`; once the web deploy is verified, the
old key is removed with `scripts/remove-onboarding-key.mjs`. The current
onboarding-key inventory can be read with `scripts/list-onboarding-keys.mjs`.

### Web4 proxy API behavior

`https://youtick.net` in proxy-backed Web4 mode supports
`/api/onboarding-key`, `/api/near-rpc` and `/api/crust/*`. A static
build served directly from `https://youtick.near.page` or a bare IPFS
gateway does not run these APIs; flows that depend on the onboarding key
or storage-order are not supported in that environment.

During `npm run build:web4`, a Next static-export warning that
`headers()` rules are not applied is expected. Web4 CSP and security
headers are applied by `workers/web4-proxy`.

---

## KMS Worker

`workers/youtick-kms` settings:

| Variable | Description |
|---|---|
| `ALLOWED_ORIGINS` | Allowed origin list |
| `NEAR_CONTRACT_ID` | Contract used for ownership checks |
| `NEAR_ACCESS_CONTRACT_ID` | Contract used for session-grant verification |
| `NEAR_REGISTRY_CONTRACT_ID` | Contract for active operator and relayer records |
| `REGISTRY_OPERATOR_ACCOUNT_ID` | This worker's operator account in the registry |
| `OPERATOR_SHARE_SECRET` | Worker secret for share encryption |
| `NEAR_NETWORK` | `mainnet` or `testnet` |

Required KV bindings:

- `VIDEO_KEYS`
- `RATE_LIMIT`
- `ACCESS_CACHE`

Use separate KV namespaces for mainnet and testnet. Do not share
namespace IDs between environments.

---

## Storage and Media Workers

`workers/storage-api` settings:

| Variable | Description |
|---|---|
| `ALLOWED_ORIGINS` | Allowed origin list |
| `STORAGE_PROVIDER` | Currently `lighthouse` |
| `LIGHTHOUSE_API_BASE` | Lighthouse API base URL |
| `LIGHTHOUSE_UPLOAD_BASE` | Lighthouse upload base URL |
| `LIGHTHOUSE_API_KEY` | Lighthouse API key (Wrangler secret) |
| `ENABLE_LIGHTHOUSE_UPLOADS` | When `true`, opens guarded Lighthouse write endpoints |
| `MAX_UPLOAD_BYTES` | Total upload size accepted through the Storage API Worker |
| `UPLOAD_INTENT_SECRET` | Wrangler secret for signing upload intent tokens |
| `UPLOAD_INTENT_TTL_SECONDS` | Lifetime of signed upload intent tokens |
| `UPLOAD_GUARD` | KV binding for upload-intent rate limit and idempotency cache |
| `UPLOAD_RATE_LIMIT_MAX` | Per-account/IP intent quota (default 1000; tightening is recommended in production) |
| `UPLOAD_RATE_LIMIT_WINDOW_SECONDS` | Rate-limit window |

A call to `/uploads/intent` requires `Authorization: Bearer <token>`.
The token is obtained through `/uploads/auth/challenge` +
`/uploads/auth/verify` over a NEP-413 signature. Unauthenticated calls
return `Unauthorized`.

`workers/media-delivery` settings:

| Variable | Description |
|---|---|
| `ALLOWED_ORIGINS` | Allowed origin list |
| `IPFS_GATEWAY_BASES` | Comma-separated list of IPFS gateway base URLs |
| `CACHE_TTL_SECONDS` | Non-Range GET edge cache lifetime |
| `CACHE_VERSION` | Optional cache bust key |
| `UPSTREAM_TIMEOUT_MS` | Per-gateway request timeout |

The Media Delivery Worker routes encrypted IPFS assets. AES keys,
decrypted video and KMS shares are never passed to this Worker.

---

## Notes

- All variables prefixed with `NEXT_PUBLIC_*` ship to the client.
- Real secrets must live only on the worker or API route side.
- KMS key protection relies on worker-side signature and ownership
  checks, not on the browser.

---

**Next:** [Architecture Overview](../architecture/README.md)
