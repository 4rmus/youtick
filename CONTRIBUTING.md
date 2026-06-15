# Contributing to YouTick

Thanks for taking a look at YouTick.

The main contribution guide lives in [`docs/contributing.md`](docs/contributing.md).
Start there for setup, commands and code areas.

Before opening a PR:

- run `npm run lint`, `npm test -- --run` and `npm run build` in `apps/web`
- (optional, for wallet/trial changes) run `npm run test:smoke` in `apps/web` (Playwright guest+trial smoke)
- run `npm test -- --run` and `npm run check` in `workers/youtick-kms`
- run `npm test -- --run` and `npm run check` in `workers/storage-api`
- run `npm test -- --run` and `npm run check` in `workers/media-delivery`
- run `npm test -- --run` and `npm run check` in `workers/web4-proxy`
- run `cargo test --lib` and `cargo test --test sandbox` when contract code changes
- update docs when behavior changes
- never commit private keys, `.env.local`, `.near-credentials` or real operator configs

Security issues should follow [`SECURITY.md`](SECURITY.md), not public issues.
