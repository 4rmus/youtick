# Known Issues & Operational Risks

> Last updated: 2026-04-29 (public-alpha wording, Web4 proxy, payment-scope alignment)
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

> **Deploy Runbook (Faz 0):**
> 1. Build verified: `contracts/nft-ticket/target/near/youtick_nft.wasm`
> 2. Run: `node scripts/deploy-nft-mainnet.mjs`
> 3. Verify: `near view youtick.near reset_v11` should return method metadata confirming owner check.

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

> **Deploy Runbook (Faz 0):**
> 1. Generate a new Ed25519 keypair for onboarding.
> 2. Run rotation script:
>    ```bash
>    node scripts/rotate-onboarding-key.mjs \
>      ed25519:OLD_ONBOARDING_KEY \
>      ed25519:NEW_ONBOARDING_KEY
>    ```
> 3. Update `ONBOARDING_KEYS` env var (Web4 proxy + web app).
> 4. Rebuild web app: `cd apps/web && npm run build:web4`
> 5. Upload to IPFS and execute Web4 URL proposal (see #9).

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

## ✅ Resolved in Source / Pending Mainnet Verification

The items in this section have source-level fixes. They should only be called
fully resolved after the patched contracts, workers or web app are deployed and
verified on mainnet.

### Web4 proxy and direct gateway API gap

**Status:** Documented in source - 2026-04-29
**Impact:** `youtick.net` is the supported Web4 entrypoint for API-backed flows.
It proxies `/api/onboarding-key` and `/api/crust/*`. Direct
`youtick.near.page` or raw IPFS gateway URLs are static-only and cannot support
onboarding key or storage-order calls.

**Resolution:** The UI should show a clear unsupported-environment error for
API-backed flows when the proxy is not available. Web4 CSP/security headers are
applied by `workers/web4-proxy`; the static Next export warning about ignored
headers is expected.

### Hybrid decentralization risk remains

**Status:** Accepted public-alpha risk
**Impact:** KMS operators are Cloudflare Worker deployments and share state is
stored in Cloudflare KV. Crust is the primary pinning provider; the second
persistence route is not complete. Owner governance and emergency takedown are
still owner-controlled.

**Resolution:** Keep public wording as "public alpha" and "hybrid
decentralized" until independent operator hosting, redundant persistence and
DAO/multisig governance are implemented and verified.

### 6. Pause Bypass in Prepaid Functions

**Status:** Resolved in source — 2026-04-23  
**Location:** `contracts/nft-ticket/src/lib.rs`

All state-mutating public functions now call `self.assert_not_paused()`,
including `create_event_prepaid` (line 1553) and `nft_mint_prepaid` (line 2090).

**Resolution:** Patch applied to source. Pending mainnet redeploy alongside
other Faz 1/Faz 2 hardened changes.

### 7. Access Cache TTL and Revocation Responsiveness

**Status:** Mitigated in source; KMS workers redeployed on 2026-04-26
**Location:** `workers/youtick-kms/src/index.ts`

Previously, ticket access was cached for 60 seconds with no negative caching.
Revoked or transferred tickets could remain valid in cache for up to a minute.

**Resolution:**
- Reduced `TICKET_ACCESS_CACHE_TTL_S` from 60s → **30s**
- Added **negative caching** (`false`) with 15s TTL to reduce RPC load
- Reduced `KEY_BINDING_CACHE_TTL_S` from 300s → **120s**
- Reduced `REGISTRY_CACHE_TTL_S` from 300s → **120s**
- `EVENT_CREATOR_CACHE_TTL_S` reduced from 3600s → **1800s**

**Next step:** Run a live encrypted upload / purchase / watch smoke test, then
Faz 3 — contract-event driven cache invalidation for instant revoke/transfer
propagation.

### 8. Timelock Bypass on Admin Functions

**Status:** Resolved in source — 2026-04-24  
**Location:** All three contracts (`nft-ticket`, `access-control`, `operator-registry`)

Earlier hardening work treated direct admin calls as a timelock bypass. For V1,
the product posture is intentionally owner-controlled public alpha, so direct
owner-only admin calls are not treated as a launch blocker by themselves.

**Resolution:**
- Covered timelocked admin wrappers can still force `propose_action` →
  `execute_action` where governance hardening is enabled.
- `access-control` and `operator-registry` received full timelock + pause
  protection for all admin functions.
- 34 new unit tests verify both direct-call panic and timelock success paths.

**Action required:** Redeploy all three contracts to mainnet.

> **Deploy Runbook (Faz 0):**
> 1. Build verified:
>    - `contracts/access-control/target/near/youtick_access_control.wasm`
>    - `contracts/operator-registry/target/near/youtick_operator_registry.wasm`
> 2. Deploy access-control:
>    ```bash
>    near deploy --accountId access.youtick.near \
>      --wasmFile contracts/access-control/target/near/youtick_access_control.wasm
>    ```
> 3. Deploy operator-registry:
>    ```bash
>    near deploy --accountId registry.youtick.near \
>      --wasmFile contracts/operator-registry/target/near/youtick_operator_registry.wasm
>    ```
> 4. Verify: Direct admin calls should panic with `panic_timelock_required`.

### 9. KMS Legacy Signature Replay Attack

**Status:** Resolved in source — 2026-04-24  
**Location:** `workers/youtick-kms/src/index.ts`, `apps/web/lib/kms/client.ts`

The legacy Ed25519 signature path used a 5-minute timestamp window without
nonce-based replay protection. An attacker could replay a captured request
within the window.

**Resolution:**
- Added `nonce` field to legacy signed payload (`{ action, videoId, accountId,
  timestamp, nonce }`).
- Client generates a UUID nonce per request (`crypto.randomUUID` fallback).
- Worker stores used nonces in `ACCESS_CACHE` with 10-minute TTL (2× timestamp
  window).
- Duplicate nonces are rejected with `401 Unauthorized`.

**Action required:** KMS workers were redeployed on 2026-04-26. A matching Web4
build was uploaded to `ipfs://bafybeiepp3qv635pidmh7yvckwa22ogv6oc22f6nziaj55mu2n7rejpzee`
and URL update proposal `0` was created on `youtick.near`. Execute that proposal
after the 24-hour delay before relying on the new nonce path end to end.

> **Deploy Runbook (Faz 0):**
> ```bash
> near call youtick.near execute_action '{"id":0}' \
>   --accountId youtick.near --gas 30000000000000
> ```

### 10. Shamir SSS Zero Coefficient Weakness

**Status:** Resolved in source — 2026-04-24  
**Location:** `apps/web/lib/kms/shares.ts`

`randomByte()` could return `0` for a polynomial coefficient, effectively
reducing the scheme from `(t, n)` to `(t-1, n)` and weakening threshold
security (Cure53 PVY-01-002 class issue).

**Resolution:**
- Replaced `coefficients.push(randomByte())` with a rejection loop that
  discards `0` values.
- Polynomial degree is now guaranteed to be `requiredShares - 1`.

**Action required:** A matching Web4 build was uploaded on 2026-04-26 and URL
update proposal `0` is pending timelock execution.

### 11. KMS Error Message Information Leakage

**Status:** Resolved in source — 2026-04-24  
**Location:** `workers/youtick-kms/src/index.ts`

Distinguishable error messages (`Invalid signature`, `Timestamp expired`,
`Public key not registered`) allowed attackers to enumerate valid keys and
probe system state.

**Resolution:**
- All authentication and authorization errors in `/store` and `/retrieve`
  now return a single `"Unauthorized"` string.
- HTTP status codes are preserved (`401`, `403`, `404`) but bodies are
  normalized.

**Action required:** KMS workers were redeployed on 2026-04-26. Verify the
normalized errors during the live smoke test.

---

## How to Update This Document

1. After every Faz completion, append new entries or update `Status` fields.
2. Link to the relevant commit or PR in the `Commit` field.
3. When an issue is fully resolved (patched + deployed + verified), move it to
   the "Resolved" section at the bottom of this file.
