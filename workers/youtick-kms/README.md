# YouTick KMS Worker

The KMS Worker stores AES key shares generated in the browser and
returns them only for authorized viewer/publisher flows. In public alpha,
operators run on Cloudflare Workers and shares are held in Cloudflare KV.

## Local dev

```bash
cd workers/youtick-kms
npm install
npm test -- --run
npm run check
npx wrangler dev --env testnet
```

`wrangler dev` requires a testnet or local registry record. If the
Worker is not registered as an active operator in the registry, the
production-readiness check will not pass.

## KV namespaces

Each operator must use isolated KV namespaces:

- `VIDEO_KEYS`
- `RATE_LIMIT`
- `ACCESS_CACHE`

Sharing namespaces across operators weakens the threshold model.

```bash
npx wrangler kv:namespace create VIDEO_KEYS --env operator_a
npx wrangler kv:namespace create RATE_LIMIT --env operator_a
npx wrangler kv:namespace create ACCESS_CACHE --env operator_a
```

Write the resulting IDs into the corresponding operator environment in
`wrangler.toml`.

## Secrets

Never place production secrets in `wrangler.toml`.

```bash
npx wrangler secret put OPERATOR_SHARE_SECRET --env operator_a
npx wrangler secret put REGISTRY_OPERATOR_ACCOUNT_ID --env operator_a
# Optional, used during share re-encryption rollout:
npx wrangler secret put OPERATOR_SHARE_SECRET_PREVIOUS --env operator_a
```

`OPERATOR_SHARE_SECRET` must be at least 32 characters and unique per
operator. During rotation, the Worker can continue to read records
written with the old secret via `OPERATOR_SHARE_SECRET_PREVIOUS`; new
writes use the new secret. Full procedure:
[KMS key rotation](../../docs/kms-key-rotation.md).

## Deploy

Operators are deployed one at a time:

```bash
npx wrangler deploy --env operator_a
npx wrangler deploy --env operator_b
npx wrangler deploy --env operator_c
npx wrangler deploy --env operator_d
npx wrangler deploy --env operator_e
```

After each deploy, check the registry record and the health result.

## Health

```bash
curl https://youtick-kms-a.<subdomain>.workers.dev/health
```

Expected: HTTP `200` and `ok: true`. On mainnet, if any of the secret,
KV, RPC, registry operator identity or contract bindings are missing,
the Worker is not considered ready.
