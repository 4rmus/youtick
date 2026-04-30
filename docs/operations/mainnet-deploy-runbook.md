# YouTick Mainnet Deploy Runbook

> **Status:** Conditional. Use only after pre-flight checks pass.
> **Last updated:** 2026-04-26
> **Release posture:** public alpha candidate, not production-ready
> **Current readiness report:** [`../mainnet-open-source-readiness-2026-04-26.md`](../mainnet-open-source-readiness-2026-04-26.md)

---

## Admin Rule

V1 is a public alpha. The NFT market contract remains owner-only for V1 admin
actions. The registry and access contracts use timelock for admin changes. Do
not market this release as DAO-governed or fully production-ready.

`reset_v11`, `wipe_and_reinit`, `test_insert` and similar destructive/debug
paths must not be available in normal production builds. Build `nft-ticket`
with migration features only when the deploy explicitly requires a migration.

---

## Pre-Flight Checklist

- [ ] Root `LICENSE` exists before public open-source announcement.
- [ ] `docs/operations/known-issues.md` reflects the current deploy state.
- [ ] Real KMS operator config is stored outside git.
- [ ] `.env.local` and production env do not contain stale `NEXT_PUBLIC_KMS_URL`.
- [ ] Web KMS discovery is registry-only and fail-closed if registry reads fail.
- [ ] `ONBOARDING_KEY` or `ONBOARDING_KEYS` is server-only.
- [ ] Trial/free sponsor flow is funded or disabled if `trial_pool` is zero.
- [ ] A short test video is ready for upload / purchase / watch smoke test.
- [ ] Owner key is available through the intended secure signing path.

Run:

```bash
(cd apps/web && npm ci && npm run lint && npm test -- --run && npm run build)
(cd workers/youtick-kms && npm ci && npm test -- --run && npm run check)
(cd workers/web4-proxy && npm ci && npm run check && npm test -- --run)
(cd contracts/nft-ticket && cargo test --lib)
(cd contracts/nft-ticket && cargo test --test sandbox)
(cd contracts/access-control && cargo test)
(cd contracts/operator-registry && cargo test)
```

Do not deploy if these checks fail.

---

## Phase 1: Build Artifacts

```bash
(cd contracts/operator-registry && cargo build --target wasm32-unknown-unknown --release)
(cd contracts/access-control && cargo build --target wasm32-unknown-unknown --release)
(cd contracts/nft-ticket && cargo build --target wasm32-unknown-unknown --release)
(cd apps/web && npm run build)
```

Only build `nft-ticket` with `--features migration` when a reviewed migration
explicitly requires the migration-only `reset_v11` path. That path can wipe
state, has not been run as part of any "mainnet clean" documentation step, and
must not be part of normal production deploys.

---

## Phase 2: Read Live State

```bash
near view registry.youtick.near list_decryption_operators
near view registry.youtick.near get_threshold_config
near view youtick.near nft_total_supply
near view youtick.near get_events_count
near view youtick.near get_trial_pool_balance
```

Expected before encrypted paid creator launch:

- five active decryption operators,
- threshold `5 / 3`,
- KMS worker health green,
- trial/free flows either funded or disabled.

If `list_decryption_operators` is empty, KMS is not active even if workers are
reachable.

---

## Phase 3: Registry Activation

If operator timelock proposals already exist and have waited at least 24 hours,
review each proposal before execution:

```bash
near view registry.youtick.near get_timelock '{"id": 1}'
near call registry.youtick.near execute_action '{"id": 1}' --accountId youtick.near
```

Repeat only for reviewed proposal IDs.

If a new operator proposal is needed, propose it through timelock:

```bash
near call registry.youtick.near propose_action '{
  "action": {
    "UpsertDecryptionOperator": {
      "account_id": "kms-a.youtick.near",
      "endpoint": "https://youtick-kms-a.<subdomain>.workers.dev",
      "transport_public_key": "cf-worker:mainnet:youtick-kms-a"
    }
  }
}' --accountId youtick.near
```

After all five operators are active, confirm:

```bash
near view registry.youtick.near list_decryption_operators
near view registry.youtick.near get_threshold_config
```

If the threshold ever needs to change, propose it after the operator count is
correct. The registry validates that `total_operators` matches the registered
operator count.

---

## Phase 4: Access Contract Config

Access-control config changes are also timelocked. Do not call
`set_market_contract` or `set_registry_contract` directly.

```bash
near call access.youtick.near propose_action '{
  "action": {
    "SetMarketContract": {
      "market_contract_id": "youtick.near"
    }
  }
}' --accountId youtick.near
```

```bash
near call access.youtick.near propose_action '{
  "action": {
    "SetRegistryContract": {
      "registry_contract_id": "registry.youtick.near"
    }
  }
}' --accountId youtick.near
```

Wait at least 24 hours, then execute reviewed proposal IDs.

Note: if the deployed access contract does not expose config getter methods,
document how the config was verified. Do not keep runbook checks that call
missing getters.

---

## Phase 5: KMS Worker Deploy

Each operator must have isolated KV namespaces and its own
`OPERATOR_SHARE_SECRET`.

```bash
cd workers/youtick-kms
npx wrangler deploy --env operator_a
npx wrangler deploy --env operator_b
npx wrangler deploy --env operator_c
npx wrangler deploy --env operator_d
npx wrangler deploy --env operator_e
```

After each deploy:

```bash
curl -s https://<operator-endpoint>/health
```

Required:

- HTTP `200`,
- body has `ok: true`.

If an operator returns `503` or `ok: false`, stop and fix the registry, secret or
KV issue before continuing.

---

## Phase 6: Web App Deploy

Deploy web only after the lower layers are healthy.

```bash
cd apps/web
npm run build
```

For Web4/static deployment:

```bash
npm run build:web4
../../scripts/deploy-web4.sh --set-url
```

`web4_set_static_url` is an NFT owner-only V1 admin call. Use only the intended
owner signing path and record the exact CID and transaction hash.

---

## Phase 7: Smoke Test

Run one live path before announcing anything beyond public alpha:

- [ ] landing/discover loads,
- [ ] wallet connects,
- [ ] short encrypted video uploads,
- [ ] KMS stores enough shares,
- [ ] ticket purchase succeeds,
- [ ] playback reconstructs the key and plays,
- [ ] gift/trial behavior matches current funding state,
- [ ] no Sentry or worker 5xx spike appears.

---

## Phase 8: Update Documents

After deploy:

- update [`known-issues.md`](known-issues.md),
- update the current readiness report or add a new dated report,
- record commit SHA, deployed worker versions and smoke result.

---

## Rollback

Web and KMS workers can usually roll back through hosting or Wrangler deployment
history.

Contracts do not have a simple rollback path. If registry or access state is
affected, pause through the timelock path where possible. If NFT state is
affected, use the owner-only V1 admin path only after review. Publish an
incident note and fix forward with a reviewed migration.

Do not call `reset_v11` as a rollback tool. It is a destructive migration-only
operation.
