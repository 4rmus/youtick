# YouTick Livepeer bridge Worker

Status: `PR-4 CODE-ONLY / DISABLED / NOT DEPLOYED`

This Worker is the persisted upload-intent control plane for paid-media
Livepeer v1. The implementation is complete enough for local and mocked tests,
but provider mutation and deployment remain disabled.

## Boundaries

- `LIVEPEER_BRIDGE_ENABLED` remains `false` in `wrangler.toml`.
- Upload requests carry a canonical Ed25519 device signature. The Worker checks
  that key on the creator account at the same final NEAR block as the job.
- A job generation creates at most one provider intent. `CREATE_AMBIGUOUS`
  never retries blindly.
- The browser uploads directly with fixed 8 MiB TUS chunks; the final chunk may
  be smaller.
- Media request bodies never pass through this Worker.
- One SQLite-backed Durable Object class is used with named job and operator
  instances.
- Final NEAR job reads happen before an atomic intent reservation.
- Job-side reservation outbox records contain only an idempotency key and
  payload hash. The operator outbox adds signed transaction bytes only after
  provider readiness is verified.
- `POST /v1/livepeer-webhooks` verifies the exact raw request body, timestamp
  and every `v1` HMAC candidate before parsing or Durable Object routing.
- A ready event is digest-deduplicated, then the bridge re-fetches the asset
  and playback objects and checks project, token name, JWT policy, playback
  binding, exact source size and unauthenticated HLS/MP4/download denial.
- The operator object persists nonce, recent block hash, signed transaction
  bytes and transaction hash before broadcast. Retries query the same hash and
  require the final `get_publication` view to match the submitted tuple.
- Structured logs redact secrets, bearer upload URLs and signed transactions.

## Local checks

```bash
cd workers/livepeer-bridge
npm test -- --run
npm run check
npx wrangler deploy --dry-run
```

`GET /__health` reports process health and the disabled capability state.
`POST /v1/upload-intents` remains unavailable while the runtime flag is false.
`LIVEPEER_API_KEY` is a Worker secret and must never be placed in `wrangler.toml`
or a browser environment variable. `LIVEPEER_WEBHOOK_SECRET` and
`NEAR_OPERATOR_PRIVATE_KEY` are also Worker secrets. The operator key must be a
finite-allowance FunctionCall key for the exact market and approved methods;
FullAccess is rejected.

## Provider canary

The provider canary is mutation-disabled unless the operator explicitly sets
`LIVEPEER_PROVIDER_CANARY_MUTATIONS=true`. It creates one JWT-gated upload
intent, uploads no media bytes, deletes the asset and records only hashed
provider identities and HTTP status evidence.

```bash
npm run test:provider-canary
LIVEPEER_PROVIDER_CANARY_MUTATIONS=true npm run canary:provider
LIVEPEER_PROVIDER_CANARY_MUTATIONS=true npm run canary:tus-resume -- /path/to/canary.mp4 30,70
LIVEPEER_PROVIDER_CANARY_MUTATIONS=true npm run canary:network-endpoint
```

Use a dedicated Sandbox project and backend-only API key in `.dev.vars`. Never
commit the key or enable CORS access for it. The TUS script proves provider
offset behavior from a developer machine; it does not prove browser CORS or the
Chrome/Edge restart matrix.

The network-endpoint canary uses one exact 20 MiB synthetic source with fixed
8 MiB chunks. It measures a five-minute idle endpoint window, rejects an unknown
opaque upload capability, interrupts one live HTTPS PATCH, resumes from HEAD
offset, completes only the missing bytes and deletes the asset. It does not
prove Microsoft Edge behavior or an endpoint lifetime beyond the measured
window.
