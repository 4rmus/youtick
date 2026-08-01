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
