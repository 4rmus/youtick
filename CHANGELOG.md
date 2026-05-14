# Changelog

All notable changes to the YouTick platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Public Alpha Prep — May 2026

#### R2 — `nft-ticket` module split (2026-05-12)
- Split monolithic `lib.rs` (5,664 lines) into 12 modules: `lib`, `nft`,
  `market`, `gift`, `onboarding`, `treasury`, `views`, `web4`, `moderation`,
  `timelock`, `events`, `migrate`, `tests`. Public ABI unchanged
  (pre/post `near abi` diff = empty).
- Mainnet `youtick.near` redeployed; code hash
  `BXbiiT86A8mjVNwvZhNLhUDqvmTVUe7anHotTpQPXg2F`. View smoke: `nft_metadata`,
  `get_owner`, `get_trial_pool_balance`, `get_events_count`,
  `get_onboarding_config`. PASS.
- Fresh testnet deploy: `r2-1778616242663.v1-0.utick.testnet`
  (same code hash). 48/48 lib + 31/31 sandbox tests PASS.

#### SB-1 — Storage API NEP-413 upload auth (2026-05-12)
- `workers/storage-api` now requires `/uploads/auth/challenge` +
  `/uploads/auth/verify` before `/uploads/intent` and `/uploads/file`.
  Auth-less `/uploads/intent` returns `Unauthorized`.
- Web client (`apps/web/lib/storage/storage-api.ts`) signs NEP-413
  challenges with the connected wallet and threads the resulting
  `Authorization: Bearer <token>` through upload flows.
- Live smoke: `youtick.near` signed `/uploads/file` wrote
  `bafkreifnpkmkjkff5xhpsz4ewcgjzpofeolss43ojketjurzsop63zjkqy` to
  Lighthouse and read it back through `youtick-media-delivery`.

#### SB-2 — Onboarding key hard cutover (2026-05-12)
- Rotated mainnet onboarding key. New active key
  `ed25519:9orHyMRrgbG7VcabT1KEMaKSgj7PqZh5QqPU1F1zuZDs` added
  (`add_onboarding_key` tx `4FyagU6ZKvvtLP7Hbkty6DKVCW8rsKAvUgBqWuSFSHYB`).
- Two prior onboarding keys removed from both the access-key list and
  contract allowlist; final `onboardingLimitedCount = 1`.
- Web4 proxy `ONBOARDING_KEYS` secret updated to the new private key.

#### SB-3 — Emergency registry proposals pre-staged (2026-05-12)
- Pre-staged registry timelock proposals 7-12 (one `Pause`, five
  `DeactivateDecryptionOperator` for `kms-{a..e}.youtick.near`) so an
  incident response does not need a 24h propose-and-wait window.
- Access-control timelock deferred for the current alpha by decision; the
  live `access.youtick.near` build does not export
  `propose_action`/`get_timelock`. Fix build hash
  `AC4NfQRakBFoCkcK6EqiKBwD93Pb61kPxVjWeHHa3QeC` is prepared but not
  shipped to the live alpha.

#### Web — Wallet + Signless rollout (2026-05-13)
- Replaced `near-wallet-selector` with `@hot-labs/near-connect@0.11.4`.
- Added `lib/signless-access-key.ts`: ed25519 keypair scoped to
  `issue_session_grant` with limited gas allowance, persisted via
  `BrowserKeyStore`.
- KMS retrieve path now tries session grants first (without auto-
  invalidating on 401) and falls back to local-signed requests for
  managed guest/trial accounts; raises `SESSION_GRANT_REJECTED` /
  `SIGNLESS_PLAYBACK_UNAVAILABLE` for non-managed accounts.
- Bumped Play session grant TTL from 5m to 10m.
- Reworked `/trial`, `/claim`, `/profile`, `/ticket` purchase flows around
  the managed-account state and a new `TrialUpgradeDialog`.
- Implicit-account gift claims supported through `claim_gift_with_implicit_account`
  + invisible Turnstile.
- Removed legacy implicit-account swap path from `TicketPurchaseCard`.

#### R1 — IPFS read path split (2026-05-12)
- `apps/web/lib/crust/gateway.ts` and `apps/web/lib/kms/streaming.ts`
  removed. IPFS read path now lives at `apps/web/lib/ipfs/`
  (`gateway.ts`, `config.ts`, `media-ref.ts`). `apps/web/lib/crust/` is
  write/compat surface only.

#### Documentation cleanup (2026-05-14)
- Locked single plan: `docs/launch-plan-2026-05.md`.
- Removed superseded `docs/mainnet-open-source-readiness-2026-04-26.md`,
  dated `docs/operations/dependency-triage-2026-05-11.md`, and stub
  `docs/architecture/chain-signatures.md` (content folded into
  `wallet-integration.md` and `release-runbook.md`).
- Audited and updated all surviving docs against current code (R2,
  HOT Connect, signless access keys, NEP-413 upload auth).
- Added `docs/public/alpha-user-guide.md` for end-user onboarding/claim/wallet.

---

### Documentation — Mainnet Clean Runbook

- Clarified public-alpha scope: source-fixed, deployed and mainnet-verified
  statuses are tracked separately.
- Clarified admin posture: `youtick.near` NFT admin is owner-only for V1, while
  `access.youtick.near` and `registry.youtick.near` use timelock admin.
- Clarified that real KMS operator config must stay outside git and web KMS
  discovery must fail closed if registry reads fail.
- Clarified that no clean mainnet reset should be documented as complete unless
  the reset transaction was explicitly executed and recorded.

### Mainnet Activation — 25-26 Nisan 2026

#### Registry & KMS Operators
- **Executed** all 6 pending registry timelock proposals (operators, relayer, threshold config).
- `registry.youtick.near` now returns 5 active decryption operators and 3-of-5 threshold.
- 5 KMS workers (`kms-a..e.youtick.near`) redeployed from current source; all return `ok: true`.

#### Web4 Frontend
- Built static export and uploaded to Crust/IPFS (`bafybeiepp3qv635pidmh7yvckwa22ogv6oc22f6nziaj55mu2n7rejpzee`).
- Proposed `SetWeb4StaticUrl` timelock proposal `0` on `youtick.near` (pending execution).

#### KMS Worker Fixes
- **Nonce-based replay protection** added to `/store` and `/retrieve` endpoints.
- **Error message normalization** across all endpoints (no contract IDs leaked).
- **Shamir threshold validation** server-side (`requiredShares >= 2`, integer checks, `totalShares <= 255`).
- **HKDF key derivation** for share-at-rest encryption (K-1 fix).

#### Live State
- `trial_pool` funded with 1 NEAR for initial user onboarding.
- `youtick.near` V11 migration executed (`creator_profiles`, `get_creator_stats`);
  this is not a clean state reset.
- `get_events_count` = 0, `nft_total_supply` = 0 (no content uploaded yet).

### Security — Faz 1 Hardening (2026-04-23)

### Mainnet Deploy — 24 Nisan 2026

#### Deployed
- **registry.youtick.near** — Operator registry with timelock + pause
- **access.youtick.near** — Session grant contract with timelock + pause  
- **youtick.near** — NFT ticket market with owner-only V1 admin; destructive
  reset paths require explicit reviewed execution

#### Operator Registry Setup (Pending — 24h timelock)
- Proposed 5 decryption operators (kms-a..e.youtick.near) via timelock
- Proposed 1 relayer (youtick.near) via timelock
- Execute script: `node scripts/execute-timelocks-mainnet.mjs`

#### Technical Notes
- Built with Rust 1.86 (wasm-opt compatibility)
- Deployed via near-api-js v7 + fastnear RPC (near-cli-rs rate limited)
- operator-registry & access-control accounts recreated due to state schema change


#### Fixed
- **CRITICAL:** `reset_v11` authorization bypass patched. Now reads previous owner
  from `env::state_read()` instead of trusting caller-supplied `owner_id`.
  (`contracts/nft-ticket/src/lib.rs`)
- **CRITICAL:** Removed 7 Ed25519 secret key files from `.near-credentials/testnet/`
  working directory. Added `README.md` with rotation instructions.
- **HIGH:** Onboarding key no longer embedded in client JS bundle.
  - Renamed `NEXT_PUBLIC_ONBOARDING_KEY` → `ONBOARDING_KEY` (server-only).
  - Created `/api/onboarding-key` server-side endpoint.
  - Updated `OnboardingKeyInit.tsx` to fetch key securely at runtime.
- **HIGH:** Sanitized `scripts/config/mainnet-kms-operators.json` — replaced real
  `*.workers.dev` endpoints with `*.example.workers.dev` placeholders.
- **MEDIUM:** Added `self.assert_not_paused()` to all state-mutating public
  functions, including `create_event_prepaid` and `nft_mint_prepaid`.

#### Added
- `docs/operations/known-issues.md` — living transparency report for mainnet
  anomalies and active mitigations.
- `scripts/config/README.md` — secure storage instructions for operator configs.
- `apps/web/app/api/onboarding-key/route.ts` — secure server-side onboarding key
  delivery with `Cache-Control: no-store`.

---

### Security — Faz 2 Completion (2026-04-23)

#### Fixed
- **Access cache hardening:** Reduced TTLs and added negative caching
  - `TICKET_ACCESS_CACHE_TTL_S`: 60s → 30s (positive), 15s (negative)
  - `KEY_BINDING_CACHE_TTL_S`: 300s → 120s
  - `REGISTRY_CACHE_TTL_S`: 300s → 120s
  - `EVENT_CREATOR_CACHE_TTL_S`: 3600s → 1800s
  - `verifyTicketAccess` now caches negative results to reduce RPC pressure
- **Agent Tracker Sync:** Updated `.claude/agents/agents.md` and agent definitions
  to reflect closed issues:
  - **S-3** (closed): Server-side threshold validation (`requiredShares >= 2`,
    integer checks, `totalShares <= 255`) active in KMS worker.
  - **CORS-1** (closed): localhost origins restricted to non-mainnet environments.
  - **AG-1** (mitigated): Session grant secret keys moved to in-memory cache;
    sessionStorage only stores public metadata.
  - **KV-1** (mitigated): Default environment uses placeholder KV namespace IDs;
    production operators use fully isolated namespaces.
- **RL-1** (rate limiter): Clarified that `RateLimiter` and `DailyGlobalLimiter`
  rollback methods are defensive (`count > 0` and `timestamps.length > 0` guards).
  Trial account creation endpoint is deprecated (returns 410 Gone).

#### Added
- `CHANGELOG.md` (this file).
- `workers/web4-proxy/src/index.test.ts` — basic worker routing and CORS tests.
- CSP headers already present in `next.config.ts`; verified and documented.

#### Documentation
- `docs/getting-started/installation.md` — added required environment variables
  (`NEXT_PUBLIC_ACCESS_CONTRACT_ID`, `NEXT_PUBLIC_REGISTRY_CONTRACT_ID`) to
  minimum local dev setup.
- `docs/kms-key-rotation.md` — added explicit note that
  `scripts/reencrypt-operator-shares.mjs` does not exist and must be created
  before active re-encrypt strategy (Strateji B) can be used.
- `docs/operations/known-issues.md` — moved Pause Bypass from "Monitoring" to
  "Resolved" section.

---

## [1.0.0] — Mainnet Launch (Earlier)

- Initial mainnet deployment: `youtick.near`, `access.youtick.near`,
  `registry.youtick.near`
- Browser-side AES-CTR encryption
- Shamir 3-of-5 threshold share distribution across Cloudflare Workers
- NFT ticket purchase, gift drops, trial onboarding
- Crust/IPFS encrypted media delivery
- Web4 fallback (`youtick.near.page`)
