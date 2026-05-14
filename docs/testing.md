# Testing Guide

> Test layers, commands and scope for YouTick.

---

## Test Layers

| Layer | Tooling | Location |
|---|---|---|
| Web unit + integration | Vitest | `apps/web/__tests__/` |
| Web end-to-end smoke | Playwright | `apps/web/e2e/` |
| Worker unit | Vitest | `workers/{youtick-kms,storage-api,media-delivery,web4-proxy}/` |
| Contract unit | `cargo test --lib` | `contracts/{nft-ticket,access-control,operator-registry}/` |
| Contract sandbox / NEAR Workspaces | `cargo test --test sandbox` | `contracts/nft-ticket/tests/sandbox.rs` |

---

## Web Test Inventory (current)

```text
apps/web/__tests__/
├── integration/                # cross-module flows
└── unit/                       # ~30 unit tests, including:
    ├── access-grants.test.ts
    ├── constants.test.ts
    ├── content-types.test.ts
    ├── crust-client.test.ts, crust-gateway.test.ts
    ├── evm-config.test.ts
    ├── event-query.test.ts
    ├── gift-service.test.ts
    ├── hooks.test.ts
    ├── ipfs-media.test.ts
    ├── kms-client.test.ts, kms-shares.test.ts
    ├── metadata-parser.test.ts
    ├── near-rpc-route.test.ts
    ├── one-click-client.test.ts
    ├── price.test.ts
    ├── rate-limiter.test.ts
    ├── registry.test.ts
    ├── rhea-client.test.ts
    ├── rpc-failover.test.ts
    ├── storage-api.test.ts, storage-order.test.ts, storage-provider.test.ts
    ├── upload-session-manager.test.ts, use-upload.test.ts
    ├── video-delivery*.test.ts (x4)
    └── video-utils.test.ts

apps/web/e2e/
└── guest-trial-smoke.spec.ts   # Playwright guest + trial smoke
```

`kms-streaming.test.ts` was removed alongside `lib/kms/streaming.ts` in
the R1 refactor — playback streaming logic now lives in
`apps/web/lib/video-delivery*.ts` and is covered by the matching tests.

---

## Commands

### Web

```bash
cd apps/web
npm test -- --run             # vitest single-shot
npm test -- --watch
npm test -- --coverage        # or: npm run test:coverage
npm run test:smoke            # Playwright (guest/trial smoke)
```

### Workers

```bash
cd workers/youtick-kms && npm test -- --run && npm run check
cd workers/storage-api && npm test -- --run && npm run check
cd workers/media-delivery && npm test -- --run && npm run check
cd workers/web4-proxy && npm test -- --run && npm run check
```

### Contracts

```bash
cd contracts/nft-ticket
cargo test --lib                    # unit tests in tests.rs (~48)
cargo test --test sandbox           # NEAR Workspaces sandbox suite (~31)

cd ../access-control && cargo test
cd ../operator-registry && cargo test
```

---

## Test Writing Notes

- Mock RPC and browser APIs in `__tests__/setup.ts`.
- Keep logic-heavy code in `lib/` for easy unit coverage.
- Prefer deterministic inputs (fixed CIDs, fixed account IDs, fixed balances).
- For async chain flows, assert outcome shape and error branches (including
  `SESSION_GRANT_REJECTED` / `SIGNLESS_PLAYBACK_UNAVAILABLE`).
- Playwright smoke uses controlled mocks; do not reach real RPC or KMS.

---

## Suggested Coverage Targets

| Area | Target |
|------|--------|
| `apps/web/lib/*` | 80%+ |
| hooks/services | 70%+ |
| UI components | 60%+ |
| contract core logic | 80%+ |
