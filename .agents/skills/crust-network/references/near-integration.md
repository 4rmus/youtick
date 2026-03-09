# NEAR + Crust Integration

This reference describes the repo-aligned pattern for NEAR apps that store blobs on Crust.

## Recommended Architecture

Use NEAR for identity, contract state, pricing, permissions, and receipts. Use Crust/IPFS for large media blobs and metadata assets that do not belong on-chain.

In this repo today:

- `near-api-js v7` handles providers, keys, trial/session accounts, and action construction.
- `@near-wallet-selector/*` handles browser wallet connection.
- `apps/web/lib/crust/w3auth.ts` turns a NEAR session key into a Crust auth header.
- The app stores and consumes returned CIDs from the frontend.

## Recommended Flow

1. User connects a NEAR wallet or receives a trial/session key.
2. App generates a Crust auth header from that NEAR key.
3. File uploads to Crust's authenticated gateway.
4. App stores CID references in NEAR contract state or app metadata.
5. If stronger persistence guarantees are required, a backend process places or monitors the storage order.

## Upload Example

```typescript
import { uploadToCrust } from '@/lib/crust';

const result = await uploadToCrust(file, accountId);
console.log(result.cid);
```

## Read / Write Split On NEAR

For reads, use the provider helper instead of a wallet object:

```typescript
import { getProvider, viewContract } from '@/lib/near';

const provider = getProvider();
const fileRecord = await viewContract(provider, 'your-contract.near', 'get_file', {
  cid,
});
```

For writes initiated by the user, keep signing inside the wallet layer and pass `near-api-js` actions through it:

```typescript
import { actions, nearToYocto } from 'near-api-js';

const wallet = await getWallet();
await wallet.signAndSendTransaction({
  receiverId: 'your-contract.near',
  actions: [
    actions.functionCall(
      'register_file',
      {
        cid,
        filename: file.name,
        size: file.size,
      },
      30_000_000_000_000n,
      nearToYocto('0')
    ),
  ],
});
```

## When To Add A Storage Order

Add explicit storage-order handling when one of these is true:

- the content must survive gateway cache eviction,
- the product promises durable replication,
- you need a visible persistence lifecycle independent of the upload response.

Do not place storage orders from browser code with embedded CRU secrets.
