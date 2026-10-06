---
paths:
  - "workers/**"
  - "read-model/**"
---

# Livepeer Bridge worker and read model

- The Bridge is a control plane only: Livepeer upload, webhook, and short-lived playback tokens. NEAR stays authoritative for paid jobs, publications, purchases, entitlements, and Play grants; Livepeer readiness alone can never authorize a sale or playback.
- D1 (`read-model/`, rebuilt by the repo-root `scripts/apply-market-read-model-d1.mjs` and `scripts/bootstrap-market-read-model-d1.mjs`) is a derived read model rebuilt deterministically from final events. Do not make it a source of truth and do not write to a remote D1 from a local session; `wrangler d1 execute --remote` and both scripts need explicit approval.
- Payment settlement in `workers/livepeer-bridge/src/payments.ts` calls 1Click (`/v0/quote`, `/v0/status`) and follows the contract path; the multi-asset mode defaults to `off`. Treat repeated notifications, timeouts, and unknown broadcast outcomes separately from confirmed failure, and reconcile before any retry.
- Secrets live in `.dev.vars` (gitignored) and Cloudflare; never read, print, or copy them. `npm run canary:*` scripts call live providers with those credentials and need approval; `test:provider-canary` is the local variant.
- Deploys happen only through protected workflows (`deploy-preview.yml`, `deploy-public-testnet.yml`, `promote-production.yml`). Locally, at most `npx wrangler deploy --dry-run` with approval. `workers/livepeer-bridge/wrangler.toml` and `read-model/wrangler.toml` / `wrangler.preview.toml` are configuration, not deployment authority.
- Checks come from the Livepeer Bridge and Read model sections of `docs/testing.md` (`npm test -- --run`, `npm run check`, `node --test` scripts). Neardata or FASTNEAR experiments stay read-only against live indexes.
- Skills: `youtick-payment-flow` for settlement and reconciliation, `near-intents` for 1Click API details, `near-api-js` for any signing or RPC encoding the worker performs.
