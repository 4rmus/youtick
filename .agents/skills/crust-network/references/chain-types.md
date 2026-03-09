# Crust Chain Types And Queries

Use this file when you need typed access to Crust chain storage or subscriptions.

## Install

```bash
yarn add @polkadot/api @crustio/type-definitions
```

## API Setup

```typescript
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundleForPolkadot } from '@crustio/type-definitions';

const api = await ApiPromise.create({
  provider: new WsProvider('wss://rpc.crust.network'),
  typesBundle: typesBundleForPolkadot,
});
```

## Common Queries

```typescript
const fileInfo = await api.query.market.filesV2(cid);
const baseFee = await api.query.market.fileBaseFee();
const identity = await api.query.swork.identities(workerAddress);
const workReport = await api.query.swork.workReports(anchor);
```

## Watching A File

```typescript
const unsubscribe = await api.query.market.filesV2(cid, (fileInfo) => {
  if (fileInfo.isEmpty) {
    console.log('CID not found on chain');
    return;
  }

  const human = fileInfo.toHuman();
  console.log('Updated file info', human);
});

// later
unsubscribe();
```

## Fields That Matter Most

- `reported_replica_count`: current replica count.
- `expired_at`: order expiry block.
- `amount`: locked CRU.
- `prepaid`: prepaid balance for the file.
- `spower`: effective storage power reported for the file.

## Guidance

- Prefer `.toHuman()` while debugging and typed accessors in application code.
- Query `filesV2` before assuming a CID is economically persisted.
- Avoid hard-coding alternative RPC endpoints unless operations specifically require them.
