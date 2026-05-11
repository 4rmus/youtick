# Dependency Triage - 2026-05-11

This note turns the audit finding into a tracked plan. It is based on local
`npm audit --omit=dev --audit-level=moderate` runs on 2026-05-11.

## Current Result

| Package area | Result |
|--------------|--------|
| `apps/web` | 30 vulnerabilities: 10 high, 6 moderate, 14 low |
| `workers/youtick-kms` | 0 vulnerabilities |
| `workers/storage-api` | 0 vulnerabilities |
| `workers/media-delivery` | 0 vulnerabilities |
| `workers/web4-proxy` | 0 vulnerabilities |

## Web App Risk Groups

| Group | Main packages | Initial action |
|-------|---------------|----------------|
| Framework/runtime | `next`, `postcss`, `rollup` | Try non-breaking `npm audit fix`, then run web tests and build. |
| HTTP/client utilities | `axios`, `follow-redirects`, `fast-uri` | Check which direct dependency pulls them in before upgrading. |
| NEAR/wallet stack | `near-api-js`, `@near-wallet-selector/*`, `@ref-finance/ref-sdk`, `bn.js`, `elliptic`, `secp256k1` | Treat as compatibility-sensitive; test wallet connect, upload session, purchase and watch after any upgrade. |
| Server utility transitive deps | `h3`, `hono`, `defu`, `lodash`, `picomatch`, `socket.io-parser` | Identify source dependency first; do not force downgrade/breaking fixes blindly. |

## Plan

1. Run `npm audit fix` in `apps/web` on a dedicated branch.
2. Review `package-lock.json` for major or wallet-stack changes before keeping it.
3. Run `npm test -- --run`, `npm run lint`, and `npm run build`.
4. Run a local smoke for wallet connect, upload intent, ticket purchase render, and watch page render.
5. Only consider `npm audit fix --force` after a separate compatibility review, because npm currently reports a breaking NEAR wallet downgrade path.

## Release Gate

Do not mark dependency risk resolved until the audit count is reduced or each
remaining advisory has an explicit accept/mitigate decision with owner and
target date.
