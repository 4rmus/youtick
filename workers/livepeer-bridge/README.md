# YouTick Livepeer bridge Worker

Status: `PR-3 CODE-ONLY / DISABLED / NOT DEPLOYED`

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
- Outbox records contain an idempotency key and payload hash, not signed
  transaction bytes.
- Structured logs redact secrets, bearer upload URLs and signed transactions.

## Local checks

```bash
cd workers/livepeer-bridge
npm test -- --run
npm run check
```

`GET /__health` reports process health and the disabled capability state.
`POST /v1/upload-intents` remains unavailable while the runtime flag is false.
`LIVEPEER_API_KEY` is a Worker secret and must never be placed in `wrangler.toml`
or a browser environment variable.

## Provider canary

The provider canary is mutation-disabled unless the operator explicitly sets
`LIVEPEER_PROVIDER_CANARY_MUTATIONS=true`. It creates one JWT-gated upload
intent, uploads no media bytes, deletes the asset and records only hashed
provider identities and HTTP status evidence.

```bash
npm run test:provider-canary
LIVEPEER_PROVIDER_CANARY_MUTATIONS=true npm run canary:provider
LIVEPEER_PROVIDER_CANARY_MUTATIONS=true npm run canary:tus-resume -- /path/to/canary.mp4 30,70
```

Use a dedicated Sandbox project and backend-only API key in `.dev.vars`. Never
commit the key or enable CORS access for it. The TUS script proves provider
offset behavior from a developer machine; it does not prove browser CORS or the
Chrome/Edge restart matrix.
