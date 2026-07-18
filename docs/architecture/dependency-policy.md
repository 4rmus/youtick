# Dependency and lockfile policy

Deployable JavaScript packages keep separate lockfiles because they are independently deployed Cloudflare/Next artifacts. This boundary is intentional, not an unmanaged monorepo split.

- Node is fixed to major 24 in every deployable package.
- Every deployable package must commit `package-lock.json` and use `npm ci` in CI.
- Security audit is evaluated per deployed artifact; a waiver must name the advisory, transitive owner, exposure and expiry date.
- Shared Worker code remains source-level under `workers/shared`; it must not introduce a second resolved dependency graph.
- `node scripts/check-dependency-policy.mjs` is the machine-checkable guard against drift.
