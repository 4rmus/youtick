# Contributing

Use the smallest change that preserves the Livepeer-only boundary.

- web changes stay in `apps/web`
- market/access changes stay in `contracts`
- control-plane changes stay in `workers/livepeer-bridge`
- wire-format changes update `protocol/paid-media-livepeer-v1` and its vectors
- behavior changes update these docs

Run the relevant commands in [Testing](testing.md). Do not add compatibility
routes or deployment automation for removed architecture. Never commit keys,
tokens, `.dev.vars`, `.env.local` or `.near-credentials`.
