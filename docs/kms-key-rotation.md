# KMS Key Rotation Overview

> Public overview of the KMS share-secret rotation model. Exact production
> commands, operator names, secret movement, endpoint checks and rotation logs
> belong in private operations notes.

## Model

Each KMS operator stores only its own encrypted Shamir share. Operators must use
isolated KV namespaces and unique `OPERATOR_SHARE_SECRET` values.

The worker supports a dual-key read window:

- new writes use `OPERATOR_SHARE_SECRET`,
- older records can still be read with `OPERATOR_SHARE_SECRET_PREVIOUS` when it
  is configured,
- the previous secret should stay available until old records are re-encrypted
  or expire under a documented retention policy.

## Public Rules

- Never commit operator secrets, previous secrets, `.dev.vars`, real endpoint
  inventories or private rotation logs.
- Rotate one operator at a time.
- Verify health and playback after each operator rotation.
- Do not remove `OPERATOR_SHARE_SECRET_PREVIOUS` until all older records are
  known to decrypt with the new secret.
- Keep detailed evidence in a private runbook.

## Implementation Touchpoints

- `workers/youtick-kms/src/index.ts` handles share decryption and worker
  readiness checks.
- `workers/youtick-kms/wrangler.toml` defines public placeholder environments.
- Wrangler/Cloudflare secret storage supplies real secret values at deploy time.

## Production Readiness Note

The passive dual-key window preserves availability, but it does not by itself
rewrite older records. A complete closeout requires either an explicit
re-encryption job or a retention/expiration policy that guarantees old records
no longer need the previous secret.
