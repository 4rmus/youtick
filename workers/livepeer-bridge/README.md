# YouTick Livepeer bridge Worker

Status: `PR-2 FOUNDATION / DISABLED / NOT DEPLOYED`

This Worker is the persisted control-plane foundation for paid-media Livepeer
v1. It has no Livepeer client, provider credentials, upload URL handling,
transaction signing or deployment route.

## Boundaries

- `LIVEPEER_BRIDGE_ENABLED` is `false` and public control requests also remain
  hard-disabled until PR-3 implements signed device requests.
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

`GET /__health` reports process health and the disabled capability state. No
other public route is active in PR-2.

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
