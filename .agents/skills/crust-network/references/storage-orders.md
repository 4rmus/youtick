# Storage Orders Reference

## Native Crust Chain Storage Orders

### placeStorageOrder

Places a storage order for an IPFS file on the Crust Network.

```typescript
api.tx.market.placeStorageOrder(
    cid: string,      // IPFS CID (v0 or v1)
    reported_file_size: u64,  // File size in bytes
    tips: u128,        // Additional tips in pCRU (1 CRU = 10^12 pCRU)
    memo: string       // Optional memo (max 50 bytes)
)
```

**Full Example:**
```typescript
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundleForPolkadot } from '@crustnetwork/type-definitions';
import { Keyring } from '@polkadot/keyring';

// Connect
const api = new ApiPromise({
    provider: new WsProvider('wss://rpc.crust.network'),
    typesBundle: typesBundleForPolkadot,
});
await api.isReady;

// Place order
const cid = 'QmVAjL5AkQJ6uwWnJ78YXCVK6FB1cgPtYPRyjnPvoVmb3K';
const fileSize = 5242880; // 5MB
const tips = 0;
const memo = '';

const tx = api.tx.market.placeStorageOrder(cid, fileSize, tips, memo);

const kr = new Keyring({ type: 'sr25519' });
const account = kr.addFromUri('your mnemonic seeds here');

await tx.signAndSend(account, ({ events, status }) => {
    if (status.isInBlock) {
        events.forEach(({ event }) => {
            if (api.events.system.ExtrinsicSuccess.is(event)) {
                console.log('Order placed in block:', status.asInBlock.toHex());
            }
            if (api.events.system.ExtrinsicFailed.is(event)) {
                console.error('Order failed');
            }
        });
    }
});
```

### addPrepaid

Add prepaid balance for a file to get settlement discounts.

```typescript
api.tx.market.addPrepaid(
    cid: string,    // IPFS CID
    amount: u128    // Amount in pCRU
)
```

### Query File Status

```typescript
// Current version (recommended)
const fileInfo = await api.query.market.filesV2(cid);

// FileInfoV2 structure:
// {
//   file_size: u64,
//   spower: u64,
//   expired_at: BlockNumber,
//   calculated_at: BlockNumber,
//   amount: Balance,
//   prepaid: Balance,
//   reported_replica_count: u32,
//   remaining_paid_count: u32,
//   replicas: BTreeMap<AccountId, Replica>
// }

// Legacy query
const legacyInfo = await api.query.market.files(cid);
```

### Using CrustPinner (Simple API)

```typescript
import CrustPinner from '@crustnetwork/crust-pin';

// Initialize with mnemonic
const crust = new CrustPinner('twelve word mnemonic seed phrase');

// Pin a CID (places storage order with 200MB default size)
const success = await crust.pin('QmVAjL5AkQJ6uwWnJ78YXCVK6FB1cgPtYPRyjnPvoVmb3K');

// Custom endpoint
const crustCustom = new CrustPinner('seeds', 'wss://custom-rpc.example.com');
```

## EVM Cross-Chain Storage Orders

### Contract Interface

```solidity
interface IStorageOrder {
    function getPrice(uint size, bool isPermanent) external view returns (uint);
    function placeOrder(string memory cid, uint size, bool isPermanent) external payable;
    function placeOrderWithNode(
        string memory cid,
        uint size,
        address nodeAddress,
        bool isPermanent
    ) external payable;

    event Order(address customer, address merchant, string cid, uint size, uint price, bool isPermanent);
}
```

### Deployed Contract Addresses

| Chain | Address | Payment Token |
|-------|---------|---------------|
| Ethereum | `0xE391613d2056e47F74ED5eF1d443d4CDb21AAAd9` | ETH |
| Arbitrum One | `0x9ae6c9d00fde0e0f774693ca6099d06dfe2001c6` | ETH |
| Optimism | `0xf8e6F7bb144D3475fcf39Bd879510Fa93C775ee2` | ETH |
| zkSync Era | `0xfa866AbF8F0b8f154654DEd956B2467dFB6A4135` | ETH |
| Polygon | `0xE1E8ff8e51DA7066CB1009a4c1dE68AE2d095655` | MATIC |

### EVM Order Example

```typescript
import { ethers } from 'ethers';

const ABI = [
    "function getPrice(uint size, bool isPermanent) public view returns (uint)",
    "function placeOrder(string memory cid, uint size, bool isPermanent) external payable"
];

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const contract = new ethers.Contract(
    '0xE391613d2056e47F74ED5eF1d443d4CDb21AAAd9', // Ethereum
    ABI,
    signer
);

const cid = 'QmXyz...';
const fileSize = 1048576; // 1MB

// Get price quote
const price = await contract.getPrice(fileSize, true);
console.log('Price:', ethers.formatEther(price), 'ETH');

// Place order
const tx = await contract.placeOrder(cid, fileSize, true, { value: price });
await tx.wait();
console.log('Order placed:', tx.hash);
```

### How Cross-Chain Orders Work

1. User calls `placeOrder()` on EVM contract, paying native token
2. Contract emits `Order` event with CID, size, payment details
3. `storage-contract-node` service monitors Order events on all chains
4. Service relays orders to Crust chain via `market.placeStorageOrder`
5. Crust sWorkers pick up and store the file

## Crust REST API

The `crust-api` service provides HTTP endpoints over the chain:

```bash
# Query file info
GET /api/v1/market/file?cid=QmdWMVDGejQLSUuGg5KQZuDib55RNtbEea44hRVqrTpTNS

# Response:
# {
#   "file_size": 5242880,
#   "expired_on": 1234567,
#   "claimed_at": 1234000,
#   "amount": "100000000000",
#   "expected_replica_count": 200,
#   "reported_replica_count": 45,
#   "replicas": [...]
# }

# Query block header
GET /api/v1/block/header

# Query sWorker identity
GET /api/v1/swork/identity?address=5HBPJZko...

# Query work report
GET /api/v1/swork/workreport?address=5FqazaU7...
```

## Storage Lifecycle

```
Upload to IPFS → Place Storage Order → sWorkers Discover File
                                              ↓
Query Replicas ← sWorkers Report MPoW ← sWorkers Download & Store
                                              ↓
                                    File Persisted (replicated)
                                              ↓
                              Order Expires → Renewal or Expiry
```

**Timing:**
- Order placement: ~6 seconds (1 block)
- First replica: 1-4 hours
- Target replicas: Usually 20+ nodes within 24 hours
- Default order duration: 6 months (renewable)
