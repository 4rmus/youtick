# Wallet Integration

Use this reference when the task mixes browser wallet UX with `near-api-js` primitives.

## Decision Table

| Need | Best default |
|---|---|
| New wallet-login flow from scratch | `@hot-labs/near-connect` plus `near-api-js` for reads |
| Existing app already on Wallet Selector | Keep `@near-wallet-selector/*`, pass `near-api-js` actions through it |
| Backend signer, cron, worker, or test harness | Use `near-api-js` directly |
| Local session or trial key | `near-api-js` key store plus `Account` |

## Repo Pattern

This repo currently uses Wallet Selector v10 for browser wallets and `near-api-js` for action construction.

```typescript
import { actions } from 'near-api-js';

const wallet = await getWallet();
await wallet.signAndSendTransaction({
  receiverId: 'contract.near',
  actions: [
    actions.functionCall('method', { foo: 'bar' }, 30_000_000_000_000n, 0n),
  ],
});
```

That keeps wallet UX in the connector while preserving one source of truth for NEAR action objects.

## Access Keys

- Wallet Selector can create a function-call key with `createAccessKeyFor`.
- Use that only for non-payable contract calls you intentionally want the app to repeat without prompting every time.
- Do not use function-call keys for arbitrary receivers or flows that need attached deposits.

## Session Keys

The repo stores managed keys with the standard `near-api-js` browser format:

```text
near-api-js:keystore:<accountId>:<networkId>
```

If you add custom browser wallet or trial-wallet logic, keep that storage shape unchanged unless the migration is deliberate and fully coordinated.

## Read Calls

Wallet connectors are for signing and account access. Use provider helpers for read-only calls:

```typescript
import { JsonRpcProvider } from 'near-api-js';

const provider = new JsonRpcProvider({ url: 'https://rpc.mainnet.near.org' });
const balance = await provider.viewAccount({ accountId: 'alice.near' });
```

## Message Signing

For login proofs or off-chain verification, prefer NEP-413 support from the connector if available. If you only have a managed key, `near-api-js` can sign and verify the same flow directly.
