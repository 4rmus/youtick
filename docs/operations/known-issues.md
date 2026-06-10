# Known Issues & Operational Risks

> Last updated: 2026-05-12 (V11 clean-launch and line-number drift alignment)
>
> This document is a **living transparency report**. It lists confirmed mainnet
> anomalies, active security mitigations, and risks that operators should be
> aware of.

---

## ✅ Resolved by V11 Clean-Launch State

### 1. Empty Mainnet Launch State

**Status:** Resolved by V11 clean-launch state; monitor as expected empty state
**Impact:** `nft_total_supply()` reporting `0` is no longer treated as a launch
anomaly when paired with an empty launch inventory.

**What changed:**
The pre-launch posture now treats a clean V11/V1 launch state as the expected
baseline: no migrated historical NFTs, no active launch events, and fresh event
creation after the launch cutover. The previous `nft_total_supply() = 0` wording
was written as an anomaly tracker for an older state and should not be used as a
current launch blocker.

**Current source behavior:**
- Normal builds disable migration reset methods.
- Migration builds require the contract account itself for `reset_v11` and
  `reset_for_v1_launch`.
- `reset_for_v1_launch` initializes fresh owner state and can set the Web4 static
  URL during an approved launch reset.

**Operator note:**
Do not call `reset_v11` as an operational fix. If a future clean reset is ever
needed, use the reviewed migration path, record the exact transaction hash, and
update this document only after the recorded reset evidence exists.

---

## 🟠 High — Resolved in Code, Pending Deployment

### 2. reset_v11 Authorization Bypass (Patched)

**Status:** Resolved in source; migration-only path
**Commit:** `contracts/nft-ticket/src/lib.rs` — `reset_v11`

The original implementation used `#[init(ignore_state)]` with a caller-supplied
`owner_id` argument. Any NEAR account could pass itself as `owner_id` and
completely wipe all events, NFTs, purchase logs, and pool balances.

**Current source behavior:**
```rust
require!(
    env::predecessor_account_id() == env::current_account_id(),
    "Only owner can reset"
);
```

Normal builds still disable `reset_v11`; migration builds require the contract
account itself to call the reset.

**Action required:** No normal launch action. Do not run a clean reset unless the
migration has separate approval and the transaction is recorded.

> **Deploy Runbook (Faz 0):**
> 1. Build verified: `contracts/nft-ticket/target/near/youtick_nft.wasm`
> 2. Run: `node scripts/deploy-nft-mainnet.mjs`
> 3. Verify deployed behavior against the exact WASM/build artifact before
>    marking it mainnet-verified.

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

### 4. Onboarding Key Leaked in Client Bundle (Resolved Live)

**Status:** Resolved live — rotated 2026-05-12; leaked key removed on-chain 2026-06-10
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
- Added new onboarding key
  `ed25519:9orHyMRrgbG7VcabT1KEMaKSgj7PqZh5QqPU1F1zuZDs`
  (`add_onboarding_key` tx:
  `4FyagU6ZKvvtLP7Hbkty6DKVCW8rsKAvUgBqWuSFSHYB`).
- Updated the Web4 proxy `ONBOARDING_KEYS` secret to the new private key.
- Removed the two old onboarding keys:
  `ed25519:d7DFgYQX6gPwj63PnE7cPSmtpsFFP7ykkUaHivCdZsX`
  (`7DtbGsxiqFcRL5VJ1QZbCCkj5MALwp7ZDmcUKucCJLJk`) and
  `ed25519:8oxP5fEc8mMvXf2kE85VZK1yN4WbQRwRDAgiab36wm2S`
  (`BsCin778CfHnDq4Div3nHNKVzekBPEm27ixSENLfyoYL`).

**Action required:**
- Keep `ONBOARDING_KEY` / `ONBOARDING_KEYS` server-only.
- Keep the new private key backed up outside the repo.
- Periodically run `node scripts/list-onboarding-keys.mjs`; expected current
  state is one limited onboarding key.

> **⚠️ Correction — verified on-chain 2026-06-10:** the **first** old key
> `ed25519:d7DFgYQX6gPwj63PnE7cPSmtpsFFP7ykkUaHivCdZsX` is **still live** on
> `youtick.near` (`is_onboarding_key` → `true`, and present in
> `view_access_key_list` with method names
> `create_sponsored_trial_direct / claim_free_ticket_direct /
> sponsor_implicit_guest_direct`). The removal claimed above did **not** take
> effect for this key — only `8oxP5fEc...` was actually removed. Because this
> key leaked in an old client bundle, anyone holding it could still drain the
> trial pool (currently ~0.728 NEAR) and exhaust the 100/day onboarding limit
> (no key disclosure or content access).

> **✅ Resolved — removed on-chain 2026-06-10:** `remove_onboarding_key`
> executed via the owner signing path, tx
> `6AMKGJSuT9j6yzDJ1bgo3YCeiUuQZsyHYyuExwNv88jf`. Verified after removal:
> `is_onboarding_key(d7DFgYQX...)` → `false`, and
> `scripts/list-onboarding-keys.mjs` shows exactly one limited onboarding key
> (`ed25519:9orHyMRrgbG7VcabT1KEMaKSgj7PqZh5QqPU1F1zuZDs`).

> **Deploy Runbook (Faz 0):**
> 1. List current onboarding keys and identify the old key:
>    ```bash
>    node scripts/list-onboarding-keys.mjs
>    ```
> 2. Generate a new Ed25519 keypair for onboarding.
> 3. Add the new key first; do not remove the old key yet:
>    ```bash
>    ONBOARDING_PUBLIC_KEY=ed25519:NEW_ONBOARDING_KEY \
>    CONFIRM_ADD_ONBOARDING_KEY=youtick.near \
>    node scripts/add-onboarding-key.mjs
>    ```
> 4. Update `ONBOARDING_KEYS` env var (Web4 proxy + web app).
> 5. Rebuild web app: `cd apps/web && npm run build:web4`
> 6. Upload to IPFS and execute Web4 URL proposal (see #9).
> 7. After the new key is live and verified, remove the old key:
>    ```bash
>    ONBOARDING_PUBLIC_KEY=ed25519:OLD_ONBOARDING_KEY \
>    CONFIRM_REMOVE_ONBOARDING_KEY=youtick.near \
>    node scripts/remove-onboarding-key.mjs
>    ```

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
stored in Cloudflare KV. Lighthouse is now the primary write provider behind
the Storage API Worker, while Crust remains for legacy compatibility and
diagnostics. NFT market admin and emergency takedown are still owner-controlled
for public alpha.

**Resolution:** Keep public wording as "public alpha" and "hybrid
decentralized" until independent operator hosting, redundant persistence and
DAO/multisig governance are implemented and verified. During the storage
provider rollout, keep Crust as an explicit compatibility/fallback path and
keep Lighthouse API keys behind the dedicated Storage API Worker.

### Content integrity is confidentiality-only (no authenticated encryption)

**Status:** Accepted public-alpha limitation — disclosed 2026-06-08
**Location:** `apps/web/lib/kms/encryption.ts`, `workers/media-delivery/src/index.ts`

Media is encrypted with **AES-256-CTR**, which provides confidentiality and
random-access seek but is **unauthenticated** (malleable). There is currently
**no HMAC / AES-GCM / AEAD tag** on content, and `media-delivery` returns the
first healthy gateway response without re-verifying the IPFS CID multihash.
Integrity today rests on IPFS content-addressing (honest-gateway assumption)
plus the KMS share VSS commitments that protect key reconstruction
(`apps/web/lib/kms/shares.ts`).

**Impact (bounded):** This is **not** a key-disclosure or purchase-bypass issue
— keys stay Shamir-protected and access is on-chain gated. A malicious or
compromised gateway could serve tampered ciphertext that decrypts to corrupted
playback **undetected**; it cannot recover the plaintext key or grant access.

**Action required:**
- Do **not** describe content as integrity-protected / tamper-proof / HMAC-backed
  anywhere. (Earlier internal notes that claimed "HMAC-SHA256 already
  implemented" were incorrect; no HMAC exists in the codebase.)
- Post-alpha roadmap: per-chunk AES-256-GCM **or** encrypt-then-HMAC (authenticated
  encryption is still the real fix; CID verification below does not authenticate
  the ciphertext against the *key*, only against the content address).

**Partial mitigation shipped (2026-06-10):** CID multihash verification for
single-block raw-codec CIDv1 ("bafkrei...") content. Encrypted segments are
stored as raw CIDs whose address *is* the sha2-256 of the ciphertext bytes, so a
gateway that substitutes different bytes is now detected and rejected:
- Client (default read path, even with the media-delivery worker disabled):
  `apps/web/lib/ipfs/integrity.ts`, enforced in
  `apps/web/lib/video-delivery-player.ts` before a segment is decrypted.
- Edge worker: `workers/media-delivery/src/index.ts` re-verifies single-segment
  raw-CID full GETs (escape hatch `VERIFY_CID_INTEGRITY=false`).
Scope/limits: only raw-sha256 CIDs on full (non-Range) requests; CIDv0, dag-pb
roots and directory sub-paths pass through unverified. This is content-address
integrity, **not** AEAD — it does not detect a gateway that returns valid bytes
for a *wrong* CID, nor does it replace authenticated encryption.

### 6. Pause Bypass in Prepaid Functions

**Status:** Resolved in source AND deployed on mainnet (current code hash
`HA3i8Se8Mrsd14Ye2qYvwehRgP9Phrd76psgyy9Y1bCF`; original R2 deploy hash
`BXbiiT86A8mjVNwvZhNLhUDqvmTVUe7anHotTpQPXg2F`)
**Location:** `contracts/nft-ticket/src/market.rs`

All state-mutating public functions call `self.assert_not_paused()`,
including `create_event_prepaid` (`market.rs:270`) and
`nft_mint_prepaid` (`market.rs:1033`). Line numbers reflect the
post-split module layout.

**Resolution:** Patch in source + deployed; verified by R2 mainnet view
smoke.

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

### 8. Admin Posture Split by Contract

**Status:** Resolved in source — 2026-04-24  
**Location:** All three contracts (`nft-ticket`, `access-control`, `operator-registry`)

Earlier hardening work treated every direct admin call as a timelock bypass.
For V1 public alpha, the posture is split by contract:

- `youtick.near` NFT market admin remains owner-only.
- `registry.youtick.near` admin changes use timelock (live, verified).
- `access.youtick.near` implements timelock **in source**, but the currently
  deployed build does **not** export `propose_action`/`get_timelock`
  (RPC-confirmed `MethodNotFound`, 2026-06-08). Access timelock is deferred for
  the current alpha and must not be described as live governance until a build
  with the export fix is deployed and verified on mainnet.

**Resolution:**
- `access-control` and `operator-registry` require `propose_action` →
  `execute_action` for admin changes.
- `nft-ticket` owner-only admin is documented as a public-alpha limitation, not
  a production governance claim.

**Action required:** Keep release notes and runbooks explicit about this split.
Do not mark governance as mainnet-verified beyond the contracts actually
deployed and checked.

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

**Action required:** KMS workers were redeployed on 2026-04-26 with the
nonce-based replay protection. The 2026-04-26 Web4 update proposal `0`
chain is superseded by the 2026-05-12 onboarding key rotation cutover and
the R2 mainnet redeploy; current Web4 deployment lives at the
`youtick-static` Cloudflare Pages target (see `workers/web4-proxy/wrangler.toml`).

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

**Action required:** A matching Web4 build is shipped through the
current Cloudflare Pages target (see `workers/web4-proxy/wrangler.toml`).
Proposal `0` is no longer the active path; it pre-dates the 2026-05
onboarding key rotation and R2 redeploy.

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
