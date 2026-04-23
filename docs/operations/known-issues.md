# Known Issues & Operational Risks

> Last updated: 2026-04-23 (Faz 1 Security Hardening + Faz 2 Completion)
>
> This document is a **living transparency report**. It lists confirmed mainnet
> anomalies, active security mitigations, and risks that operators should be
> aware of.

---

## 🔴 Critical — Under Active Mitigation

### 1. Mainnet Contract State Inconsistency

**Status:** Confirmed, monitoring  
**Impact:** `nft_total_supply()` reports `0` while 33 trie entries exist.

**What happened:**
The currently deployed WASM on `youtick.near` is older than the HEAD of this
repository (approximately commits `99f07bd` / `afd4231`). A prior migration
left orphaned storage entries. The contract is functional for new operations,
but historical enumeration queries may return inconsistent counts.

**Mitigation in progress:**
- `reset_v11` has been **hardened** in Faz 1 to prevent unauthorized invocation.
  It now reads the previous owner from `env::state_read()` instead of trusting
  a caller-supplied `owner_id` argument.
- A full state reset to a clean v11 is planned but **not yet executed**.
  Execution requires:
  1. Operator key rotation (all 5 KMS operators).
  2. Re-upload of all active event metadata to the new contract state.
  3. Community / user notification (minimum 7-day lead time).

**Do NOT call `reset_v11` without coordinating with the core team.**

---

## 🟠 High — Resolved in Code, Pending Deployment

### 2. reset_v11 Authorization Bypass (Patched)

**Status:** Patched in source, **not yet redeployed to mainnet**  
**Commit:** `contracts/nft-ticket/src/lib.rs` — `reset_v11`

The original implementation used `#[init(ignore_state)]` with a caller-supplied
`owner_id` argument. Any NEAR account could pass itself as `owner_id` and
completely wipe all events, NFTs, purchase logs, and pool balances.

**Patch:**
```rust
let old_owner: AccountId = env::state_read::<Contract>()
    .map(|c| c.tokens.owner_id.clone())
    .unwrap_or_else(|| env::panic_str("No existing state"));
require!(
    env::predecessor_account_id() == old_owner,
    "Only owner can reset"
);
```

**Action required:** Redeploy patched WASM to mainnet.

### 3. Secret Key Exposure in Working Directory (Cleaned)

**Status:** Cleaned — 2026-04-23  
**Location:** `.near-credentials/testnet/*.json`

Seven Ed25519 secret key files were present in the working tree. They were
**not** present in git history (verified with `git rev-list --all`), but
retaining them in the project directory is an unacceptable risk.

**Action taken:**
- All `.json` credential files removed from `.near-credentials/testnet/`.
- A `README.md` with rotation instructions placed in the directory.

**Action required:**
- Rotate all exposed keys immediately.
- Never store mainnet keys in the project directory; use a hardware wallet or
  secret manager (1Password, HashiCorp Vault, AWS KMS).

### 4. Onboarding Key Leaked in Client Bundle (Mitigated)

**Status:** Mitigated in source, **not yet redeployed to mainnet**  
**Location:** `apps/web/.env.example`, `OnboardingKeyInit.tsx`

`NEXT_PUBLIC_ONBOARDING_KEY` was embedded into the Next.js client JS bundle
and written to `localStorage`. An attacker could extract the key and drain the
trial pool or DoS the daily limit.

**Action taken:**
- `.env.example`: Renamed variable to `ONBOARDING_KEY` (server-only).
- Created `/api/onboarding-key` server-side endpoint that serves the key at
  runtime with `Cache-Control: no-store`.
- Updated `OnboardingKeyInit.tsx` to fetch from the secure endpoint instead of
  reading `process.env.NEXT_PUBLIC_ONBOARDING_KEY`.

**Action required:**
- Rotate the onboarding Function Call Access Key on `youtick.near`.
- Update production `.env.local` to use `ONBOARDING_KEY` (remove the
  `NEXT_PUBLIC_` prefix).
- Redeploy the web app.

### 5. Production KMS Operator Endpoints Exposed in Repo (Sanitized)

**Status:** Sanitized — 2026-04-23  
**Location:** `scripts/config/mainnet-kms-operators.json`

The JSON contained real `*.workers.dev` endpoints and account IDs. This
facilitates targeted operator attacks and reconnaissance.

**Action taken:**
- Replaced real endpoints with `*.example.workers.dev` placeholders.
- The file now mirrors `mainnet-kms-operators.example.json`.
- Added `scripts/config/README.md` with secure-storage instructions.

**Action required:**
- Store the real config in a secret manager.
- Inject it at deploy time via environment variables or temporary files that
  are explicitly excluded from git.

---

## ✅ Resolved

### 6. Pause Bypass in Prepaid Functions

**Status:** Resolved in source — 2026-04-23  
**Location:** `contracts/nft-ticket/src/lib.rs`

All state-mutating public functions now call `self.assert_not_paused()`,
including `create_event_prepaid` (line 1553) and `nft_mint_prepaid` (line 2090).

**Resolution:** Patch applied to source. Pending mainnet redeploy alongside
other Faz 1/Faz 2 hardened changes.

### 7. Access Cache TTL and Revocation Responsiveness

**Status:** Mitigated in source — 2026-04-23  
**Location:** `workers/youtick-kms/src/index.ts`

Previously, ticket access was cached for 60 seconds with no negative caching.
Revoked or transferred tickets could remain valid in cache for up to a minute.

**Resolution:**
- Reduced `TICKET_ACCESS_CACHE_TTL_S` from 60s → **30s**
- Added **negative caching** (`false`) with 15s TTL to reduce RPC load
- Reduced `KEY_BINDING_CACHE_TTL_S` from 300s → **120s**
- Reduced `REGISTRY_CACHE_TTL_S` from 300s → **120s**
- `EVENT_CREATOR_CACHE_TTL_S` reduced from 3600s → **1800s**

**Next step:** Faz 3 — contract-event driven cache invalidation for instant
revoke/transfer propagation.

---

## How to Update This Document

1. After every Faz completion, append new entries or update `Status` fields.
2. Link to the relevant commit or PR in the `Commit` field.
3. When an issue is fully resolved (patched + deployed + verified), move it to
   the "Resolved" section at the bottom of this file.
