# Mainnet Deploy Checklist

This checklist covers deploying the security hardening changes from the architecture review.

## Pre-flight

- [ ] All changes committed and pushed
- [ ] `cargo check` passes for `contracts/nft-ticket`
- [ ] `npx tsc --noEmit` passes for `workers/youtick-kms`
- [ ] `npm test -- --run` passes for `apps/web` (160 tests)
- [ ] Cloudflare API token configured (`wrangler login` or `CLOUDFLARE_API_TOKEN`)
- [ ] NEAR mainnet owner key available (`MASTER_SECRET_KEY` or `ZERO_TRUST_OWNER_KEY`)

## Step 1: Create Isolated KV Namespaces

Each operator needs 3 dedicated KV namespaces (VIDEO_KEYS, RATE_LIMIT, ACCESS_CACHE).

```bash
cd workers/youtick-kms
bash ../../scripts/create-operator-kv-namespaces.sh
```

Copy the output IDs into `wrangler.toml` for each operator environment.

## Step 2: Migrate Existing Share Data

Copy operator-specific share records from the shared KV to each new namespace.

```bash
cd workers/youtick-kms
export SHARED_KV_ID="7af9ebeeffaa4f4bace8e0347963d165"
export OP_A_KV_ID="<from step 1>"
export OP_B_KV_ID="<from step 1>"
export OP_C_KV_ID="<from step 1>"
export OP_D_KV_ID="<from step 1>"
export OP_E_KV_ID="<from step 1>"
bash ../../scripts/migrate-operator-kv.sh
```

## Step 3: Deploy KMS Operators (rolling)

Deploy one operator at a time and verify health between each:

```bash
cd workers/youtick-kms

# Deploy operator A first (canary)
wrangler deploy --env operator_a
curl -s https://youtick-kms-a.araafatsum.workers.dev/health | python3 -m json.tool

# Verify: ready=true, registryOperatorActive=true, shareMode=operator-encrypted-share
# Test: upload a test video, verify share storage works
# Test: retrieve shares for an existing video, verify playback works

# If canary is healthy, deploy remaining operators
for env in operator_b operator_c operator_d operator_e; do
  wrangler deploy --env $env
  sleep 2
done

# Final health check
for op in a b c d e; do
  echo "--- Operator $op ---"
  curl -s "https://youtick-kms-${op}.araafatsum.workers.dev/health" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print(f\"  ready={d['ready']} active={d['registryOperatorActive']} share={d['shareMode']}\")
"
done
```

## Step 4: Deploy NFT Contract

The contract changes (wrap.near fix, rollback callbacks) require a contract upgrade.

**Important**: The new methods (`on_free_ticket_claim_complete`, `on_sponsored_free_ticket_complete`)
are `#[private]` callbacks, so no new public API surface is exposed.
State schema is unchanged (no migration needed).

```bash
cd contracts/nft-ticket
cargo near build --no-docker
# or: cargo build --target wasm32-unknown-unknown --release

# Deploy with near-cli or your deploy script
near contract deploy youtick.near use-file ./target/near/youtick_nft.wasm without-init-call network-config mainnet sign-with-keychain send
```

Verify:
```bash
# Check wrap account resolution
near contract call-function as-read-only youtick.near get_trial_pool json-args '{}' network-config mainnet now

# Test free ticket claim on a test event (if one exists)
```

## Step 5: Deploy Web App

```bash
cd apps/web
npm run build
# Deploy via your hosting platform (Vercel / NEARFS / custom)
```

Changes in this deploy:
- Trial invite links now use `#key=` (hash-based)
- Gift links from GiftLinkGenerator now use `#key=`
- Legacy KMS store path removed from client
- PSA storage order fires after successful publish
- Wallet init failure no longer marks app as ready
- KMS auth cache cleanup fixed for sign-out
- Shamir share deduplication before reconstruction
- Better error messages for batch publish failures

## Post-deploy Verification

- [ ] Upload a new paid video → verify encrypted delivery + share storage across operators
- [ ] Watch the video from a different account with a ticket → verify share retrieval + reconstruction
- [ ] Create a gift link → verify hash-based URL format
- [ ] Claim the gift link → verify hash-based key reading
- [ ] Create a trial invite → verify hash-based URL format
- [ ] Test trial onboarding flow end-to-end
- [ ] Sign out and sign in → verify KMS auth cache is properly cleared
- [ ] Check operator health: all 5 report `ready: true`

## Rollback Plan

### KMS Workers
```bash
# Revert to previous worker version
wrangler rollback --env operator_a
```

### NFT Contract
Contract state is forward-compatible. If needed, redeploy the previous WASM.

### Web App
Revert to previous deployment via hosting platform.
