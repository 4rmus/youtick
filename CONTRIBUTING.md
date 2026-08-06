# Contributing

Keep changes inside the Livepeer-only product boundary and avoid compatibility
layers for removed flows.

Before opening a pull request, run the checks for each changed area:

- web: `npm ci && npm test -- --run && npm run lint && npm run build`
- Livepeer Bridge: `npm ci && npm test -- --run && npm run test:provider-canary && npm run check && npx wrangler deploy --dry-run`
- contracts and protocol: see [docs/testing.md](docs/testing.md)
- docs: `npm ci && npm run build` in `docs`

Never commit wallet keys, Worker secrets, `.env.local`, `.dev.vars` or
`.near-credentials`. Security reports follow [SECURITY.md](SECURITY.md).
