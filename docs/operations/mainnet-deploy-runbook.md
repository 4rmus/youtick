# YouTick Mainnet Deploy Runbook

> **Status:** Ready for execution  
> **Last updated:** 2026-04-24  
> **Contracts:** `operator-registry`, `access-control`, `nft-ticket`  
> **Workers:** 5× `youtick-kms` operators, `web4-proxy`  

---

## ⚠️ Pre-Flight Checklist

- [ ] All 5 KMS operator keys rotated (new `ed25519:` secrets generated)
- [ ] `.env.local` updated: `ONBOARDING_KEY` (server-only, no `NEXT_PUBLIC_` prefix)
- [ ] `scripts/config/mainnet-kms-operators.json` stored in 1Password/Vault (not in repo)
- [ ] Test upload flow on testnet with new WASM
- [ ] Community notification sent (Discord/Twitter) — minimum 7-day lead time recommended
- [ ] `nft-ticket` owner account (`youtick.near`) has full-access key ready for signing

---

## Phase 0 — Build All Artifacts

### 0.1 Operator Registry

```bash
cd contracts/operator-registry
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/youtick_operator_registry.wasm \
   target/near/youtick_operator_registry.wasm
```

**Expected:** `target/near/youtick_operator_registry.wasm` ~260KB

### 0.2 Access Control

```bash
cd contracts/access-control
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/youtick_access_control.wasm \
   target/near/youtick_access_control.wasm
```

**Expected:** `target/near/youtick_access_control.wasm` ~277KB

### 0.3 NFT Ticket (with `reset_v11`)

`reset_v11` is gated behind the `migration` feature. We need it for the state reset.

```bash
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release --features migration
cp target/wasm32-unknown-unknown/release/youtick_nft.wasm \
   target/near/youtick_nft.wasm
```

**Expected:** `target/near/youtick_nft.wasm` ~590KB

**Verify `reset_v11` is in the WASM:**
```bash
wasm2wat target/near/youtick_nft.wasm | grep -c reset_v11
# Should return > 0
```

### 0.4 Web App Build

```bash
cd apps/web
npm ci
npm run build:web4
```

**Expected:** `apps/web/dist/` folder with static export.

---

## Phase 1 — Deploy Registry & Access Control

### 1.1 Operator Registry

```bash
export NEAR_NETWORK=mainnet
export NEAR_CONTRACT_ID=registry.youtick.near  # confirm actual ID
# Deploy via near-cli or cargo-near
near deploy registry.youtick.near \
  --wasmFile contracts/operator-registry/target/near/youtick_operator_registry.wasm
```

**Post-deploy initialization:**
```bash
near call registry.youtick.near new '{"owner_id": "youtick.near"}' \
  --accountId registry.youtick.near
```

### 1.2 Access Control

```bash
near deploy access.youtick.near \
  --wasmFile contracts/access-control/target/near/youtick_access_control.wasm
```

**Post-deploy initialization:**
```bash
near call access.youtick.near new '{"owner_id": "youtick.near"}' \
  --accountId access.youtick.near
```

### 1.3 Configure Cross-Contract References

**On operator-registry:**
```bash
# Set threshold (3-of-5)
near call registry.youtick.near set_threshold_config \
  '{"total_operators": 5, "required_shares": 3}' \
  --accountId youtick.near

# Add each operator (timelock required — use propose_action + execute_action)
near call registry.youtick.near propose_action \
  '{"action": {"UpsertDecryptionOperator": {"account_id": "op1.youtick.near", ...}}}' \
  --accountId youtick.near
# ... wait 24h ...
near call registry.youtick.near execute_action '{"id": 1}' --accountId youtick.near
```

**On access-control:**
```bash
# Set market contract
near call access.youtick.near set_market_contract \
  '{"market_contract_id": "youtick.near"}' \
  --accountId youtick.near

# Set registry contract
near call access.youtick.near set_registry_contract \
  '{"registry_contract_id": "registry.youtick.near"}' \
  --accountId youtick.near
```

---

## Phase 2 — NFT Ticket (State Reset)

### 2.1 Deploy Migration-Enabled WASM

```bash
export NFT_CONTRACT_ID=youtick.near
export NFT_WASM_PATH=contracts/nft-ticket/target/near/youtick_nft.wasm

node scripts/deploy-nft-mainnet.mjs
```

### 2.2 Execute `reset_v11`

This **permanently deletes** all existing events, NFTs, purchase logs, and pool balances.

```bash
near call youtick.near reset_v11 '{"owner_id": "youtick.near"}' \
  --accountId youtick.near \
  --gas 300000000000000
```

**Expected result:**
- `nft_total_supply()` returns `0`
- No orphaned trie entries
- Contract re-initialized with `owner_id: youtick.near`

### 2.3 Re-Deploy Normal WASM (Optional but Recommended)

After reset, re-deploy the normal (non-migration) build so `reset_v11` is no longer callable:

```bash
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/youtick_nft.wasm \
   target/near/youtick_nft.wasm

node scripts/deploy-nft-mainnet.mjs
```

### 2.4 Configure nft-ticket Cross-Contract References

```bash
# Set access-control contract
near call youtick.near set_access_contract \
  '{"access_contract_id": "access.youtick.near"}' \
  --accountId youtick.near

# Set registry contract
near call youtick.near set_registry_contract \
  '{"registry_contract_id": "registry.youtick.near"}' \
  --accountId youtick.near
```

---

## Phase 3 — KMS Worker Deploy

### 3.1 Update Operator Endpoints (if changed)

If operator keys/URLs changed, update the registry via `propose_action` / `execute_action`.

### 3.2 Deploy All 5 Operators

```bash
cd workers/youtick-kms

# For each operator:
wrangler deploy --name youtick-kms-op1 --config wrangler-op1.toml
wrangler deploy --name youtick-kms-op2 --config wrangler-op2.toml
# ... etc
```

**Verify health:**
```bash
curl https://op1.youtick.workers.dev/health
curl https://op2.youtick.workers.dev/health
# ... etc
```

---

## Phase 4 — Web App Deploy

### 4.1 Web4 (youtick.near.page)

```bash
bash scripts/deploy-web4.sh
```

**Verify:**
- `https://youtick.near.page/` loads
- `https://youtick.near.page/__health` returns 200

### 4.2 DNS/Custom Domain (Optional)

If `youtick.net` is used, ensure `web4-proxy` is deployed and DNS points correctly.

---

## Phase 5 — Post-Deploy Validation

### 5.1 Contract State Checks

```bash
# Registry
near view registry.youtick.near get_threshold_config
near view registry.youtick.near list_active_decryption_operators

# Access Control
near view access.youtick.near get_market_contract
near view access.youtick.near get_registry_contract

# NFT Ticket
near view youtick.near nft_total_supply
near view youtick.near get_trial_pool_balance
```

### 5.2 End-to-End Smoke Tests

| Test | Steps | Expected |
|------|-------|----------|
| Trial creation | Visit `/trial`, claim free ticket | Success, no errors |
| Upload flow | Connect wallet, upload 10MB MP4 | All 8 steps complete |
| Ticket purchase | Buy ticket with 0.1 NEAR | NFT minted, purchase log written |
| Playback | Watch purchased video | Decryption succeeds, video plays |

### 5.3 KMS Operator Verification

```bash
# Each operator should return healthy
curl -s https://<op>.youtick.workers.dev/health | jq '.ok'
# Should be: true
```

---

## Rollback Plan

If critical failure occurs during deploy:

1. **Do NOT call `reset_v11` again** — it wipes all state.
2. Keep the old WASM hashes recorded in this runbook.
3. If needed, re-deploy the previous known-good WASM from git history.
4. For KMS: previous worker versions can be rolled back via Wrangler dashboard.

---

## Known Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `reset_v11` caller is not owner | Low | `env::state_read()` enforces old owner |
| Orphaned state after reset | Low | Verify `nft_total_supply == 0` |
| KMS nonce mismatch (old client) | Medium | Deploy web app + workers simultaneously |
| Operator key not rotated | Medium | Checklist enforced, 5 keys verified |
| Registry/Access references wrong | Medium | Phase 1.3 cross-check script |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Deploy Lead | | | |
| Contract Review | | | |
| KMS Operator Review | | | |
