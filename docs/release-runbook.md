# YouTick Release Runbook

> Short release checklist.
> For mainnet contract/KMS activation, use
> [`docs/operations/mainnet-deploy-runbook.md`](operations/mainnet-deploy-runbook.md).
> Current release posture is tracked in
> [`docs/mainnet-open-source-readiness-2026-04-26.md`](mainnet-open-source-readiness-2026-04-26.md).

---

## Status

YouTick may be released as **public alpha** after the open-source checklist is
complete. It should not be described as production-ready until live KMS
operator health and encrypted playback are verified on mainnet.

V1 public alpha is owner-controlled. Use owner-only direct admin calls only for
the documented launch tasks, and keep destructive/debug methods out of normal
production builds. Timelock governance is a later hardening step, not a V1 gate.

---

## Pre-Flight

Run from the repository root:

```bash
(cd apps/web && npm ci && npm run lint && npm test -- --run && npm run build)
(cd workers/youtick-kms && npm ci && npm test -- --run && npm run check)
(cd workers/web4-proxy && npm ci && npm run check && npm test -- --run)
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

Do not call direct admin methods such as:

- `set_threshold_config`,
- `upsert_decryption_operator`,
- `deactivate_decryption_operator`,
- `set_market_contract`,
- `set_registry_contract`,
- `pause`,
- `unpause`,
- `withdraw_commission`,
- `withdraw_trial_pool`.

Current contracts intentionally reject those direct paths. Use:

```bash
near call <contract> propose_action '<ACTION_JSON>' --accountId <owner>
# wait at least 24 hours
near call <contract> execute_action '{"id": <id>}' --accountId <owner>
```

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
pause through timelock when possible, publish an incident note and fix forward
with a reviewed migration.

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
