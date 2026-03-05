# Testing Guide

> Test structure, commands, and scope for YouTick

---

## Test Layers

| Layer | Tooling | Location |
|------|---------|----------|
| Frontend unit/integration | Vitest | `apps/web/__tests__/` |
| Contract unit/integration | cargo test | `contracts/nft-ticket/` |
| Contract workspace tests | near-workspaces | `contracts/nft-ticket-tests/` |

---

## Frontend Test Structure

```text
apps/web/__tests__/
├── integration/
│   ├── upload-flow.test.ts
│   └── gift-claim-flow.test.ts
├── unit/
│   ├── gift-service.test.ts
│   ├── hooks.test.ts
│   ├── metadata-parser.test.ts
│   ├── price.test.ts
│   ├── rate-limiter.test.ts
│   └── session-manager.test.ts
├── mocks/
│   └── near-api-js.ts
└── setup.ts
```

---

## Commands

### Frontend

```bash
cd apps/web
npm test -- --run
npm test -- --watch
npm test -- --coverage
```

### Contract

```bash
cd contracts/nft-ticket
cargo test

cd ../nft-ticket-tests
cargo test
```

---

## Test Writing Notes

- Mock RPC and browser APIs in `__tests__/setup.ts`.
- Keep logic-heavy code in `lib/` for easy unit coverage.
- Prefer deterministic inputs (fixed CIDs, fixed account IDs, fixed balances).
- For async chain flows, assert outcome shape and error branches.

---

## Suggested Coverage Targets

| Area | Target |
|------|--------|
| `apps/web/lib/*` | 80%+ |
| hooks/services | 70%+ |
| UI components | 60%+ |
| contract core logic | 80%+ |

