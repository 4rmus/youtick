# YouTick Web Application

Next.js frontend for the YouTick video platform.

> Active flow: browser-side encryption, KMS key retrieval, Lighthouse/IPFS delivery, NEAR ticket ownership.

## Documentation

| Topic | Document |
|-------|----------|
| System Architecture | [docs/architecture/README.md](../../docs/architecture/README.md) |
| Storage & Delivery | [docs/architecture/storage.md](../../docs/architecture/storage.md) |
| Session Keys & Signless | [docs/architecture/session-keys.md](../../docs/architecture/session-keys.md) |
| Smart Contract | [docs/architecture/smart-contract.md](../../docs/architecture/smart-contract.md) |
| Quick start | [docs/quick-start.md](../../docs/quick-start.md) |
| Contract Methods | [docs/api/contract-methods.md](../../docs/api/contract-methods.md) |

## Development

```bash
npm install
npm run dev
npm run build
```

## Environment

Minimum:

```env
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=false
```

KMS endpoints are not configured through env. The web app reads active KMS
operators from the operator registry contract pointed to by
`NEXT_PUBLIC_REGISTRY_CONTRACT_ID`.

Common optionals:

```env
NEXT_PUBLIC_ONE_CLICK_API_TOKEN=...
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true
ONBOARDING_KEY=...
ONBOARDING_KEYS=...
```

The primary path for trial creation is the browser-side onboarding key
flow. The server-side relayer flow has been removed (returns 410 Gone).
Onboarding actions are submitted to the `/api/onboarding-key` server-side transaction relay;
the private function-call key is never returned to or stored by the browser.
and held briefly in `sessionStorage`. This key is not the user's
private key; it is a narrowly-scoped onboarding authority. In
production, keep the rate limit and `TURNSTILE_SECRET_KEY` challenge on,
and rotate keys regularly.

## Project Shape

```text
app/                    # App Router pages
components/             # Upload, player, ticket, gift, trial, provider components
e2e/                    # Playwright smoke tests
hooks/                  # UI hooks
lib/
  kms/                  # Multi-operator KMS client + AES-GCM/legacy CTR + share math
  ipfs/                 # IPFS read path (gateway list + media-ref helpers)
  storage/              # Lighthouse client (storage-api.ts) + provider boundary
  intents/              # 1Click quote/swap helpers
  evm/                  # MetaMask and EVM helpers
  signless-access-key.ts   # ed25519 key scoped to issue_session_grant
  keystore-v7.ts           # BrowserKeyStore wrapper
  managed-near-account.ts  # guest/trial managed account state
  trial-wallet.ts          # WalletInstance shim for managed accounts
  guest-account.ts         # implicit-account onboarding helpers
  access-grants.ts         # session grant lifecycle
  upload-session-manager.ts
  gift-service.ts
```

## Wallet

`@hot-labs/near-connect@0.11.4` (HOT Connect) is the single wallet entry
point. `near-wallet-selector` is no longer a direct dependency.

## Core Components

| Component | Role |
|-----------|------|
| `UploadForm` | Encryption, upload and publish flow |
| `IpfsPlayer` | KMS + IPFS playback (signless access key + 10-min Play grant) |
| `TicketPurchaseCard` | NEAR `buy_ticket` + optional cross-chain checkout (with a connected wallet) |
| `GiftLinkGenerator` | Gift link generation |
| `TrialOnboarding` | Implicit account creation + Turnstile challenge |
| `TrialUpgradeDialog` | Attach a real wallet to a managed account |

## Runtime Model

| Operation | Active path |
|-----------|-------------|
| Video encryption | Per-segment browser AES-256-GCM; legacy AES-CTR playback only |
| Key custody | Shamir 3-of-5 shares across KMS operator workers |
| Playback auth | Signless access key → 10-min Play session grant + operator registry check |
| IPFS read | `lib/ipfs/` multi-gateway failover |
| IPFS upload | Lighthouse via Storage API (NEP-413 challenge required) |
| Publish auth | Upload session (`create_upload_session` + scoped function-call key) |
| Ticket purchase | On-chain `buy_ticket` (wallet-driven only; legacy implicit-swap removed) |
| Cross-chain checkout | `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true` + connected NEAR wallet; 1Click + MetaMask |
