# Livepeer Bridge Worker

This Worker is the control plane for direct browser-to-Livepeer upload and
authenticated playback. Source video and HLS bytes must never be sent through
its routes. The public publication-cover route is the only exception: after a
final NEAR check, it returns a cached, size-limited first-frame image without
exposing the upstream JWT or private thumbnail URL.

It also exposes a stateless NEAR Intents 1Click adapter. The adapter derives the
final Circle USDC amount from final NEAR state, verifies signed 1Click responses
and returns deposit instructions. It never receives funds, grants playback or
creates a payment ledger.

## Safety state

`LIVEPEER_BRIDGE_ENABLED=false` is the default. The native-NEAR creator-fee
gate is independently disabled. Installing, testing or dry-running this package
does not deploy or activate it.

`MULTI_ASSET_PAYMENTS_MODE=off` is also the default. `preview` permits only dry
quotes; `live` permits firm quotes. Status lookups stay available while quote
creation is off so an existing conversion can still be followed.

## Commands

```bash
npm ci
npm test -- --run
npm run test:provider-canary
npm run check
npx wrangler deploy --dry-run
```

The provider-canary test command is mocked and performs no external mutation.
Live canary commands require separate approval, bounded credentials and an
explicit cleanup plan.

## Configuration

Public bindings and placeholders are in `wrangler.toml`. Put API, webhook,
operator, JWT, NEAR operator and quote-signing private values in Worker secrets,
never in that file or `.dev.vars` committed to git.

Set the 1Click partner credential only as a secret:

```bash
npx wrangler secret put ONECLICK_API_KEY
```

Payment routes are `GET /v1/payments/assets`, `POST /v1/payments/quote` and
`GET /v1/payments/status`. Quote creation is mainnet-only, uses exact-output
Circle USDC and rejects `customRecipientMsg`, charged `appFees` or
`insured=true`. Empty app fees and `insured=false` are accepted as no-cost
provider defaults. Enabled source assets are the intersection of the built-in
definitions and `MULTI_ASSET_PAYMENT_ASSET_IDS`.

The Durable Object migration in `wrangler.toml` is required for the
`LivepeerControl` class. See
[configuration](../../docs/getting-started/configuration.md) and
[security](../../docs/security.md).
