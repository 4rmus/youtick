# Storage Orders

Use this reference for explicit Crust chain persistence, replica status queries, or backend-operated order placement.

## Packages

```bash
yarn add @polkadot/api @crustio/type-definitions @polkadot/keyring
```

## Connect To Crust Chain

```typescript
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundleForPolkadot } from '@crustio/type-definitions';

const api = await ApiPromise.create({
  provider: new WsProvider('wss://rpc.crust.network'),
  typesBundle: typesBundleForPolkadot,
});
```

## Core Extrinsics

### `market.placeStorageOrder`

```typescript
const tx = api.tx.market.placeStorageOrder(
  cid,
  fileSize,
  0,
  '',
);
```

### `market.addPrepaid`

```typescript
const tx = api.tx.market.addPrepaid(cid, prepaidAmount);
```

## Status Queries

### `market.filesV2`

```typescript
const fileInfo = await api.query.market.filesV2(cid);

if (fileInfo.isEmpty) {
  console.log('No active order found for CID');
} else {
  console.log(fileInfo.toHuman());
}
```

Important fields you usually care about:

- `file_size`
- `expired_at`
- `amount`
- `prepaid`
- `reported_replica_count`

## Signing Example

```typescript
import { Keyring } from '@polkadot/keyring';

const keyring = new Keyring({ type: 'sr25519' });
const signer = keyring.addFromUri(process.env.CRUST_SEED!);

await tx.signAndSend(signer, ({ events, status }) => {
  if (!status.isInBlock) return;
  for (const { event } of events) {
    if (api.events.system.ExtrinsicSuccess.is(event)) {
      console.log('Storage order placed');
    }
    if (api.events.system.ExtrinsicFailed.is(event)) {
      console.error('Storage order failed');
    }
  }
});
```

## Browser vs Backend

- Browser apps should upload content and track CID state.
- Storage-order signing should normally happen on a backend, worker, or manual ops process.
- If the product uses PSA instead of direct chain RPC, still treat it as an order-placement path that needs independent monitoring.

## Practical Debugging Order

1. Confirm the CID can be fetched from a gateway.
2. Confirm a storage order exists via `filesV2`.
3. Check replica count growth over time.
4. Only then classify the issue as gateway, auth, or persistence.
