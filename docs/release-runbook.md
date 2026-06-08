# YouTick Release Runbook

> Short release checklist.
> For mainnet contract/KMS activation, use
> [`docs/operations/mainnet-deploy-runbook.md`](operations/mainnet-deploy-runbook.md).
> Current release posture is tracked internally in
> `docs/launch-plan-2026-05.md` (single locked plan; founder/agent doc, not
> published to the public site).

---

## Status

YouTick may be released as **public alpha** after the open-source checklist is
complete. It should not be described as production-ready until live KMS
operator health and encrypted playback are verified on mainnet.

V1 public alpha separates admin posture by contract:

- `youtick.near` NFT market admin remains owner-only for V1.
- `registry.youtick.near` admin changes use timelock.
- `access.youtick.near` timelock is deferred during active development; do not deploy an access timelock build unless this decision is reopened.

Keep destructive/debug methods out of normal production builds.

---

## Pre-Flight

Run from the repository root:

```bash
(cd apps/web && npm ci && npm run lint && npm test -- --run && npm run build)
(cd workers/youtick-kms && npm ci && npm test -- --run && npm run check)
(cd workers/web4-proxy && npm ci && npm run check && npm test -- --run)
(cd workers/storage-api && npm ci && npm run check && npm test -- --run)
(cd contracts/nft-ticket && cargo test --lib)
(cd contracts/nft-ticket && cargo test --test sandbox)
(cd contracts/access-control && cargo test)
(cd contracts/operator-registry && cargo test)
```

Expected:

- web lint has no errors,
- all web tests pass,
- web build succeeds,
- KMS worker tests and type check pass,
- contract tests pass.

Also check:

```bash
git status --short
rg -n "PRIVATE_KEY|SECRET_KEY|MASTER_SECRET|ed25519:|sk-|AKIA|BEGIN .*PRIVATE" .
```

The secret scan has false positives in tests and docs. It must not reveal real
reusable deploy keys, production `.env` values or real operator configs.

---

## Mainnet Health Gate

Before real paid encrypted creator content:

```bash
near view registry.youtick.near list_decryption_operators
near view registry.youtick.near get_threshold_config
near view youtick.near get_trial_pool_balance
```

Required result:

- five active decryption operators,
- threshold `5 / 3`,
- trial/free flows either funded or clearly disabled in the UI.

Then verify each KMS operator:

```bash
curl -s https://<operator-endpoint>/health
```

Required result:

- HTTP `200`,
- body has `ok: true`.

If any KMS operator returns `503` or `ok: false`, the KMS layer is not ready.
Web KMS discovery must be registry-only and fail-closed if registry reads fail;
do not ship real operator endpoints or fallback KMS URLs in tracked files.

---

## Deploy Order

1. Contracts, only if source changed and migration risk is understood.
2. Registry timelock proposals/executions, only if operator config changes.
3. KMS workers, one operator at a time.
4. Web app / Web4 assets.
5. Smoke tests.
6. Update known issues and release notes.

Do not deploy web or workers against a registry state that cannot satisfy the
configured threshold.

---

## Contract Admin Rule

For `registry.youtick.near`, do not call direct admin methods such as:

- `set_threshold_config`,
- `upsert_decryption_operator`,
- `deactivate_decryption_operator`,
- `set_market_contract`,
- `set_registry_contract`,
- `pause`,
- `unpause`,
- `withdraw_commission`,
- `withdraw_trial_pool`.

The registry contract intentionally rejects those direct paths. Use:

```bash
near call <contract> propose_action '<ACTION_JSON>' --accountId <owner>
# wait at least 24 hours
near call <contract> execute_action '{"id": <id>}' --accountId <owner>
```

For `access.youtick.near`, confirm the live method surface before any admin
operation; access timelock is not part of the current alpha gate.

For `youtick.near`, V1 admin remains owner-only. Do not use destructive
migration/reset paths unless a reviewed migration explicitly requires them.

---

## KMS Worker Deploy

Each operator must use isolated KV namespaces and its own secret.

```bash
cd workers/youtick-kms
npx wrangler deploy --env operator_a
npx wrangler deploy --env operator_b
npx wrangler deploy --env operator_c
npx wrangler deploy --env operator_d
npx wrangler deploy --env operator_e
```

After each deploy, verify `/health`. Stop if a worker is not healthy.

---

## Smoke Tests

Run at least one full path after deploy:

- landing/discover loads,
- wallet connects,
- short test video uploads,
- KMS stores enough shares,
- ticket purchase succeeds,
- playback reconstructs key and starts video,
- gift/trial behavior matches current funding state,
- Sentry or equivalent monitoring sees no release spike.

---

## Rollback

Web and worker rollback can use the hosting provider or Wrangler deployment
history.

Contract rollback is not a normal path. If a contract deploy breaks state,
pause registry through timelock when possible. If NFT state is affected,
use the owner-only V1 admin path only after review. Publish an incident note
and fix forward with a reviewed migration.

---

## Release Note

Every release should record:

- date,
- commit SHA,
- contracts changed,
- workers changed,
- web build changed,
- smoke test result,
- known issue updates.

---

## Dependency Updates

Dependency upgrades on `apps/web` touch the wallet/RPC stack and need extra
care. Treat the NEAR/wallet stack (`near-api-js`, `@hot-labs/near-connect`,
`bn.js`, `elliptic`, `secp256k1`) as compatibility-sensitive and run wallet
connect, upload session, ticket purchase and watch end-to-end after any
upgrade.

Workflow:

1. Run `npm audit fix` (no `--force`) on a dedicated branch.
2. Diff `package-lock.json` for major or wallet-stack changes before keeping
   it.
3. Run `npm test -- --run`, `npm run lint` and `npm run build` in `apps/web`.
4. Local smoke: wallet connect, upload intent, ticket purchase render, watch
   page render.
5. Only consider `npm audit fix --force` after a separate compatibility
   review — npm currently reports a breaking NEAR wallet downgrade path.

Workers (`workers/youtick-kms`, `workers/storage-api`, `workers/media-delivery`,
`workers/web4-proxy`) currently report no advisories; rerun `npm audit
--omit=dev --audit-level=moderate` per package on each release.
