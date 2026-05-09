# Contributing to YouTick

Thanks for taking a look at YouTick.

The main contribution guide lives in [`docs/contributing.md`](docs/contributing.md).
Start there for setup, commands and code areas.

Before opening a PR:

- run `npm run lint`, `npm test -- --run` and `npm run build` in `apps/web`
- run `npm test -- --run` and `npm run check` in `workers/youtick-kms`
- run `npm test -- --run` and `npm run check` in `workers/web4-proxy`
- run `npm test -- --run` and `npm run check` in `workers/storage-api`
- run `cargo test` when contract code changes
- update docs when behavior changes
- never commit private keys, `.env.local`, `.near-credentials` or real operator configs

Security issues should follow [`SECURITY.md`](SECURITY.md), not public issues.
