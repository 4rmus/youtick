# Frontend Implementation

> Next.js App Router frontend (`apps/web`) with HOT Connect wallet flows,
> signless access keys, share-based KMS playback and Lighthouse/IPFS storage.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 + React 19 |
| Language | TypeScript 5 |
| UI | Tailwind CSS 4 + Radix UI |
| State/Data | React Query + custom hooks |
| Wallet | `@hot-labs/near-connect@0.11.4` (HOT Connect) |
| Chain | `near-api-js` v7 |

`@near-wallet-selector/*` is no longer a direct dependency; HOT Connect
mediates the wallet picker.

---

## Directory Layout

```text
apps/web/
├── app/                        # Routes: discover, watch, upload, claim, trial, profile, ticket, mint
├── components/                 # UI components and feature modules
├── e2e/                        # Playwright smoke tests (guest-trial-smoke.spec.ts)
├── hooks/                      # Route-level hooks
├── lib/
│   ├── kms/                    # Multi-operator KMS client + AES-CTR encryption + share math
│   ├── ipfs/                   # IPFS read-path (gateway list, media-ref helpers) — was lib/crust/gateway.ts pre-R1
│   ├── crust/                  # Crust write/compat surface only
│   ├── storage/                # Lighthouse client (storage-api.ts) + provider boundary
│   ├── intents/                # 1Click cross-chain quotes
│   ├── evm/                    # MetaMask + Arbitrum/Base helpers
│   ├── access-grants.ts        # 10-min Play / 5-min Publish session grant lifecycle
│   ├── signless-access-key.ts  # ed25519 key scoped to issue_session_grant
│   ├── keystore-v7.ts          # BrowserKeyStore wrapper
│   ├── managed-near-account.ts # guest/trial managed account state
│   ├── trial-wallet.ts         # WalletInstance shim for managed accounts
│   ├── guest-account.ts        # implicit-account onboarding helpers
│   ├── gift-service.ts         # gift claim (existing-wallet or implicit-account)
│   ├── registry.ts             # Operator registry queries
│   ├── upload-session-manager.ts # Upload session key lifecycle
│   ├── batch-transactions.ts
│   ├── rpc-failover.ts
│   ├── video-delivery*.ts      # Player decryption pipeline
│   └── …
└── __tests__/                  # Unit + integration tests
```

---

## Core Flows

### Upload (`components/UploadForm.tsx`)

1. Validate metadata and file constraints.
2. Ensure upload session authority and budget.
3. Upload thumbnail/poster assets through Lighthouse via the Storage API
   Worker (NEP-413 challenge required).
4. Paid path: AES-CTR encrypt → upload ciphertext + manifest → split key
   into Shamir shares → distribute shares to active KMS operators.
5. Submit batched on-chain actions (`nft_mint_prepaid` + `create_event_prepaid`).

### Playback (`components/IpfsPlayer.tsx`)

1. Resolve event metadata from `encrypted_cid`.
2. Verify ticket ownership (or creator / claimed-gift entitlement).
3. Use the signless access key to issue a 10-min Play session grant on
   `access.youtick.near`.
4. Query operator registry for active operators + threshold (currently 3-of-5).
5. Request key shares in parallel from operators (with session grant; falls
   back to local-signed retrieve for managed guest/trial accounts).
6. Reconstruct AES key from threshold shares.
7. Stream-decrypt and play.

If session grant is rejected, the player surfaces
`SESSION_GRANT_REJECTED` / `SIGNLESS_PLAYBACK_UNAVAILABLE` and prompts
reconnect.

### Ticket Purchase (`components/TicketPurchaseCard.tsx`)

- Reads event details from the contract.
- Wallet-driven `buy_ticket` is the only paid path (the legacy
  implicit-account swap path was removed).
- Cross-chain checkout (USDC/USDT via 1Click+MetaMask) appears only when
  `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true` and a NEAR wallet is
  connected — guest/trial accounts cannot use it.

### Gift Claim (`app/claim/page.tsx`)

- Reads secret key from URL hash (preferred) or `?secret=`/`?key=`.
- Choose-claim-method step offers **guest implicit account** or **transfer
  to existing wallet**. Guest path uses `claimGiftWithImplicitAccount`
  with an invisible Turnstile challenge.

### Trial Onboarding (`app/trial/page.tsx`, `components/TrialOnboarding.tsx`)

- Server-issued onboarding key (gated by Turnstile in production) mints
  an implicit account funded with `TRIAL_ACCOUNT_STORAGE_COST = 0.002 NEAR`.
- Success card shows `TrialUpgradeDialog` (attach a real wallet) and a
  Connect-wallet fallback.

---

## Important Modules

- `lib/kms/client.ts` — Shamir share distribution / collection, signless +
  local-signed retrieve.
- `lib/kms/shares.ts` — Shamir Secret Sharing split/reconstruct over GF(256).
- `lib/kms/encryption.ts` — AES-CTR chunk encryption/decryption.
- `lib/video-delivery*.ts` — progressive decrypted playback (replaced the
  removed `lib/kms/streaming.ts` after R1).
- `lib/access-grants.ts` — session grant creation and verification.
- `lib/signless-access-key.ts` — limited-allowance ed25519 key scoped to
  `issue_session_grant`.
- `lib/registry.ts` — operator registry queries and caching.
- `lib/rpc-failover.ts` — browser-safe NEAR RPC URL selection (production
  uses same-origin `/api/near-rpc` via `workers/web4-proxy`).
- `lib/storage/storage-api.ts` — Lighthouse client (NEP-413 challenge +
  upload intent + file).
- `lib/storage/provider.ts` — picks Lighthouse-primary upload or explicit
  legacy fallback.
- `lib/ipfs/gateway.ts` + `lib/ipfs/config.ts` — multi-gateway read failover.
- `lib/upload-session-manager.ts` — upload session key lifecycle.
- `lib/metadata-parser.ts` — title/CID/thumbnail metadata parsing.

---

## Development Commands

```bash
cd apps/web
npm run dev               # local dev server
npm run lint
npm test -- --run         # vitest unit + integration
npm run test:smoke        # Playwright guest/trial smoke
npm run build
```
