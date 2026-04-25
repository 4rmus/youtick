# Changelog

All notable changes to the YouTick platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Security — Faz 1 Hardening (2026-04-23)

### Mainnet Deploy — 24 Nisan 2026

#### Deployed
- **registry.youtick.near** — Operator registry with timelock + pause
- **access.youtick.near** — Session grant contract with timelock + pause  
- **youtick.near** — NFT ticket market with timelock + state reset (`reset_v11`)

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
