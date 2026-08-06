# Testing

## Web

```bash
cd apps/web
npm ci
npm test -- --run
npm run lint
npm run build
```

The suite must cover upload processing, purchase, entitlement, creator
playback, stranger denial, sale suspension, takedown and disabled gates.

## Livepeer Bridge

```bash
cd workers/livepeer-bridge
npm ci
npm test -- --run
npm run test:provider-canary
npm run check
npx wrangler deploy --dry-run
```

Provider canary tests use mocks unless explicitly run with approved external
credentials. A dry run does not deploy.

## Contracts

Use Rust 1.86.0 and cargo-near 0.17.0:

```bash
cd contracts/nft-ticket
cargo +1.86.0 test --lib
cargo +1.86.0 test --test paid_media_livepeer_v1
cargo +1.86.0 test --test sandbox
cargo +1.86.0 fmt --all --check
cargo +1.86.0 clippy --all-targets -- -D warnings
cargo +1.86.0 near build non-reproducible-wasm

cd ../access-control
cargo +1.86.0 test
cargo +1.86.0 fmt --all --check
cargo +1.86.0 clippy --all-targets
cargo +1.86.0 near build non-reproducible-wasm

cd ../..
node scripts/check-paid-media-livepeer-v1-abi.mjs
node scripts/check-paid-media-livepeer-v1.mjs
```

## Docs

```bash
cd docs
npm ci
npm run build
```

Local, mocked and CI results must be reported separately from provider,
testnet, staging, deployment and production evidence.
