# Testing Guide

> Test infrastructure, patterns, and commands for YouTick

---

## Test Infrastructure

| Layer | Framework | Config |
|-------|-----------|--------|
| **Frontend Unit** | Vitest + React Testing Library | `apps/web/vitest.config.ts` |
| **Contract Unit** | `cargo test` (NEAR SDK) | `contracts/nft-ticket/Cargo.toml` |
| **Contract Integration** | near-workspaces 0.14 + tokio | `contracts/nft-ticket-tests/` |
| **E2E** | Playwright (planned) | — |

---

## Test Structure

```
apps/web/__tests__/
├── integration/
│   ├── upload-flow.test.ts          # Video upload workflow
│   └── gift-claim-flow.test.ts      # Gift claiming workflow
├── unit/
│   ├── gift-service.test.ts         # Gift link service
│   ├── session-manager.test.ts      # Session key lifecycle
│   ├── price.test.ts                # Price calculations
│   ├── hooks.test.ts                # Custom hooks
│   ├── metadata-parser.test.ts      # NFT metadata parsing
│   ├── nova-groups-errors.test.ts   # Nova error handling
│   └── rate-limiter.test.ts         # Rate limiter
├── nova/
│   ├── client.test.ts               # Nova API client
│   ├── config.test.ts               # Configuration
│   ├── auth.test.ts                 # Authentication
│   ├── groups.test.ts               # Group management
│   ├── attestation.test.ts          # TEE attestation
│   └── integration.test.ts          # End-to-end Nova tests
├── mocks/
│   ├── nova-sdk.ts                  # Nova SDK mock
│   └── near-api-js.ts              # NEAR API mock
└── setup.ts                         # Test configuration

contracts/nft-ticket/
├── tests/
│   └── sandbox.rs                   # Integration tests (near-workspaces)
└── src/lib.rs                       # Unit tests (#[cfg(test)] modules)
```

---

## Running Tests

### Frontend Tests

```bash
cd apps/web

# Run all tests
npm test

# Watch mode (re-run on file changes)
npm test -- --watch

# Coverage report
npm test -- --coverage

# Run specific test file
npm test -- __tests__/unit/gift-service.test.ts

# Run Nova test suite
npm test -- __tests__/nova/
```

### Contract Tests

```bash
cd contracts/nft-ticket

# Unit tests
cargo test

# With stdout output
cargo test -- --nocapture

# Run specific test
cargo test test_create_event

# Integration tests (near-workspaces)
cd ../nft-ticket-tests
cargo test
```

---

## Contract Testing on Testnet

### Create Dev Account

```bash
near create-account dev-$(date +%s).testnet --useFaucet
```

### Deploy and Initialize

```bash
near deploy dev-xxx.testnet \
  target/wasm32-unknown-unknown/release/nft_ticket.wasm \
  --initFunction new \
  --initArgs '{"owner_id":"dev-xxx.testnet"}'
```

### Test Contract Methods

```bash
# Verify deployment
near view dev-xxx.testnet nft_metadata '{}'

# Create event
near call dev-xxx.testnet create_event \
  '{"encrypted_cid":"test-cid-123","title":"Test Event","description":"A test video","price":"1000000000000000000000000"}' \
  --accountId dev-xxx.testnet --deposit 0.1

# View event
near view dev-xxx.testnet get_event '{"encrypted_cid":"test-cid-123"}'

# Buy ticket
near call dev-xxx.testnet buy_ticket \
  '{"receiver_id":"buyer.testnet","encrypted_cid":"test-cid-123"}' \
  --accountId buyer.testnet --deposit 1.02

# Check ownership
near view dev-xxx.testnet verify_ownership \
  '{"account_id":"buyer.testnet","token_id":"1"}'

# Fund trial pool
near call dev-xxx.testnet fund_trial_pool '{}' \
  --accountId dev-xxx.testnet --deposit 5
```

---

## Writing Tests

### Unit Test Pattern

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('GiftService', () => {
  it('should generate valid gift link', async () => {
    const link = await giftService.createLink({
      eventCid: 'test-cid',
      creatorId: 'creator.near',
    });

    expect(link).toContain('/claim#key=');
    expect(link).toMatch(/ed25519:/);
  });
});
```

### Mock Setup

```typescript
// __tests__/mocks/near-api-js.ts
import { vi } from 'vitest';

export const mockProvider = {
  query: vi.fn().mockResolvedValue({ result: [] }),
};

export const mockAccount = {
  functionCall: vi.fn().mockResolvedValue({ status: { SuccessValue: '' } }),
  viewFunction: vi.fn(),
};
```

### Nova Mock Setup

```typescript
// __tests__/mocks/nova-sdk.ts
import { vi } from 'vitest';

export const mockNovaSdk = {
  createGroup: vi.fn().mockResolvedValue({ groupId: 'test-group' }),
  addMember: vi.fn().mockResolvedValue(true),
  encrypt: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  decrypt: vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6])),
};
```

---

## Test Naming Conventions

| Pattern | Example |
|---------|---------|
| Unit tests | `[module].test.ts` |
| Integration tests | `[flow-name]-flow.test.ts` |
| Nova tests | `nova/[module].test.ts` |
| Mocks | `mocks/[library].ts` |

---

## Coverage Targets

| Domain | Target |
|--------|--------|
| Business logic (`lib/`) | 80%+ |
| Nova integration (`lib/nova/`) | 75%+ |
| Hooks | 70%+ |
| Components | 60%+ |
| Contract (Rust) | 80%+ |

---

**Related:** [Contributing Guidelines](./contributing.md) · [Developer Guide](./guides/developer-guide.md)
