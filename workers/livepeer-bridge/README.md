# Livepeer Bridge Worker

This Worker is the control plane for direct browser-to-Livepeer upload and
authenticated playback. Source video and HLS bytes must never be sent through
its routes. The public publication-cover route is the only exception: after a
final NEAR check, it returns a cached, size-limited first-frame image without
exposing the upstream JWT or private thumbnail URL.

## Safety state

`LIVEPEER_BRIDGE_ENABLED=false` is the default. The native-NEAR creator-fee
gate is independently disabled. Installing, testing or dry-running this package
does not deploy or activate it.

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

The Durable Object migration in `wrangler.toml` is required for the
`LivepeerControl` class. See
[configuration](../../docs/getting-started/configuration.md) and
[security](../../docs/security.md).
