# Crust Chain Type Definitions and Queries

## Installation

```bash
yarn add @polkadot/api @crustnetwork/type-definitions
```

## Connection

```typescript
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundleForPolkadot } from '@crustnetwork/type-definitions';

const api = new ApiPromise({
    provider: new WsProvider('wss://rpc.crust.network'),
    typesBundle: typesBundleForPolkadot,
});
await api.isReady;
```

## DSM (Decentralized Storage Market) Types

### FileInfoV2

```typescript
interface FileInfoV2 {
    file_size: u64;
    spower: u64;                    // Storage power contributed
    expired_at: BlockNumber;         // Block when order expires
    calculated_at: BlockNumber;      // Last calculation block
    amount: Balance;                 // Locked CRU for this file
    prepaid: Balance;                // Prepaid balance
    reported_replica_count: u32;     // Number of storing nodes
    remaining_paid_count: u32;       // Remaining paid settlement rounds
    replicas: BTreeMap<AccountId, Replica>;
}

interface Replica {
    who: AccountId;        // Node storing the file
    valid_at: BlockNumber; // When replica was validated
    anchor: SworkerAnchor; // sWorker anchor hash
    is_reported: bool;     // Whether reported in current round
    created_at: BlockNumber;
}
```

### Queries

```typescript
// Get file info
const fileInfo = await api.query.market.filesV2('QmCID...');

// Get file (legacy)
const legacyInfo = await api.query.market.files('QmCID...');

// Get storage base fee
const baseFee = await api.query.market.fileBaseFee();

// Get file keys count
const fileKeysCount = await api.query.market.fileKeysCount();
```

## sWork (MPoW) Types

### WorkReport

```typescript
interface WorkReport {
    report_slot: u64;
    spower: u64;
    free: u64;
    reported_files_size: u64;
    reported_srd_root: MerkleRoot;
    reported_files_root: MerkleRoot;
}

interface Identity {
    anchor: SworkerAnchor;
    punishment_deadline: BlockNumber;
    group: Option<AccountId>;
}
```

### Queries

```typescript
// Get node identity
const identity = await api.query.swork.identities(nodeAddress);

// Get work report
const workReport = await api.query.swork.workReports(sworkerAnchor);

// Get current report slot
const currentSlot = await api.query.swork.currentReportSlot();

// Get sWorker codes
const codes = await api.query.swork.codes();
```

## GPoS (Staking) Types

### Guarantee

```typescript
interface Guarantee {
    targets: Vec<IndividualExposure>;
    total: Compact<Balance>;
    submitted_in: EraIndex;
    suppressed: bool;
}

interface ValidatorPrefs {
    guarantee_fee: Perbill;  // Fee charged to guarantors
}
```

### Queries

```typescript
// Get validator preferences
const prefs = await api.query.staking.validators(validatorAddress);

// Get guarantor info
const guarantees = await api.query.staking.guarantors(guarantorAddress);

// Get era info
const currentEra = await api.query.staking.currentEra();
```

## Common Patterns

### Monitor File Replicas

```typescript
async function waitForReplicas(cid: string, targetReplicas: number, timeoutMs: number) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        const fileInfo = await api.query.market.filesV2(cid);

        if (fileInfo.isEmpty) {
            console.log('File not found on chain yet...');
        } else {
            const replicas = fileInfo.reported_replica_count.toNumber();
            console.log(`Replicas: ${replicas}/${targetReplicas}`);

            if (replicas >= targetReplicas) {
                return true;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30s
    }
    return false;
}
```

### Subscribe to Storage Events

```typescript
api.query.market.filesV2(cid, (fileInfo) => {
    if (!fileInfo.isEmpty) {
        console.log('Updated replicas:', fileInfo.reported_replica_count.toString());
        console.log('Expires at block:', fileInfo.expired_at.toString());
    }
});
```

## RPC Endpoints

| Network | Endpoint |
|---------|----------|
| Mainnet | `wss://rpc.crust.network` |
| Mainnet (alt) | `wss://rpc.crustnetwork.xyz` |
| Mainnet (alt) | `wss://rpc.crustnetwork.cc` |
| Mainnet (alt) | `wss://rpc.crustnetwork.app` |
| Mainnet (Decoo) | `wss://rpc-crust-mainnet.decoo.io` |
| Mainnet (OnFinality) | `wss://crust.api.onfinality.io/ws` |
| Shadow (parachain) | `wss://rpc-sha-subscan.crust.network` |
