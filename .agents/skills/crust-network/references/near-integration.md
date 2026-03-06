# NEAR Protocol + Crust Network Integration

## Overview

NEAR Protocol and Crust Network complement each other: NEAR provides smart contract logic, account management, and dApp infrastructure while Crust provides decentralized file storage with IPFS persistence guarantees. Together they enable fully decentralized applications with both compute and storage layers.

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEAR + Crust dApp Architecture               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌────────────────┐    ┌──────────────────┐   │
│  │  User     │───▶│  NEAR Wallet   │    │  Crust W3Auth    │   │
│  │  (dApp)   │    │  (ed25519 key) │───▶│  (IPFS Gateway)  │   │
│  └──────────┘    └────────────────┘    └──────────────────┘   │
│       │                                        │               │
│       ▼                                        ▼               │
│  ┌────────────────┐              ┌──────────────────────┐     │
│  │ NEAR Contract   │              │  IPFS Network         │     │
│  │ - File registry │              │  (Encrypted files)    │     │
│  │ - Access control│              └──────────────────────┘     │
│  │ - Metadata      │                        ▲                  │
│  └────────────────┘                        │                  │
│       │                          ┌──────────────────────┐     │
│       │ CID references           │  Crust Chain          │     │
│       └─────────────────────────▶│  (Storage orders)     │     │
│                                  │  (Persistence proof)  │     │
│                                  └──────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Pattern 1: NEAR Auth + Crust Upload

Use a NEAR wallet to authenticate with Crust IPFS gateway and upload files.

```typescript
import { KeyPair, connect, keyStores } from 'near-api-js';
import { u8aToHex } from '@polkadot/util';
import { create } from 'ipfs-http-client';

// -- NEAR Authentication for Crust --

function buildCrustAuthFromNearKey(nearKeyPair: KeyPair): string {
    const addressRaw = nearKeyPair.getPublicKey().toString();
    const address = addressRaw.substring(8); // Strip "ed25519:" prefix

    const { signature } = nearKeyPair.sign(Buffer.from(address));
    const sig = u8aToHex(signature).substring(2);

    const authHeaderRaw = `near-${address}:${sig}`;
    return Buffer.from(authHeaderRaw).toString('base64');
}

// -- Upload with NEAR Auth --

async function uploadToCrust(
    fileContent: string | Buffer | Blob,
    nearKeyPair: KeyPair
): Promise<string> {
    const authHeader = buildCrustAuthFromNearKey(nearKeyPair);

    const ipfs = create({
        url: 'https://crustipfs.xyz/api/v0',
        headers: { authorization: `Basic ${authHeader}` }
    });

    const { cid } = await ipfs.add(fileContent);
    return cid.toString();
}
```

## Pattern 2: NEAR Contract as File Registry

Store file metadata (CIDs, permissions) on a NEAR smart contract while actual files live on Crust/IPFS.

### NEAR Smart Contract (Rust)

```rust
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedSet};
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault};

#[derive(BorshDeserialize, BorshSerialize)]
pub struct FileMetadata {
    pub cid: String,
    pub filename: String,
    pub size: u64,
    pub mime_type: String,
    pub owner: AccountId,
    pub created_at: u64,
    pub is_public: bool,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct FileRegistry {
    files: LookupMap<String, FileMetadata>,       // cid -> metadata
    user_files: LookupMap<AccountId, UnorderedSet<String>>, // user -> cids
    allowed_viewers: LookupMap<String, UnorderedSet<AccountId>>, // cid -> viewers
}

#[near_bindgen]
impl FileRegistry {
    #[init]
    pub fn new() -> Self {
        Self {
            files: LookupMap::new(b"f"),
            user_files: LookupMap::new(b"u"),
            allowed_viewers: LookupMap::new(b"v"),
        }
    }

    pub fn register_file(
        &mut self,
        cid: String,
        filename: String,
        size: u64,
        mime_type: String,
        is_public: bool,
    ) {
        let owner = env::predecessor_account_id();

        let metadata = FileMetadata {
            cid: cid.clone(),
            filename,
            size,
            mime_type,
            owner: owner.clone(),
            created_at: env::block_timestamp(),
            is_public,
        };

        self.files.insert(&cid, &metadata);

        let mut user_set = self.user_files
            .get(&owner)
            .unwrap_or_else(|| UnorderedSet::new(owner.as_bytes()));
        user_set.insert(&cid);
        self.user_files.insert(&owner, &user_set);
    }

    pub fn grant_access(&mut self, cid: String, viewer: AccountId) {
        let file = self.files.get(&cid).expect("File not found");
        assert_eq!(file.owner, env::predecessor_account_id(), "Not owner");

        let mut viewers = self.allowed_viewers
            .get(&cid)
            .unwrap_or_else(|| UnorderedSet::new(cid.as_bytes()));
        viewers.insert(&viewer);
        self.allowed_viewers.insert(&cid, &viewers);
    }

    pub fn can_access(&self, cid: String, account: AccountId) -> bool {
        let file = self.files.get(&cid).expect("File not found");
        if file.is_public || file.owner == account {
            return true;
        }
        self.allowed_viewers
            .get(&cid)
            .map(|viewers| viewers.contains(&account))
            .unwrap_or(false)
    }

    pub fn get_file(&self, cid: String) -> Option<FileMetadata> {
        self.files.get(&cid)
    }

    pub fn list_my_files(&self) -> Vec<FileMetadata> {
        let caller = env::predecessor_account_id();
        self.user_files
            .get(&caller)
            .map(|cids| {
                cids.iter()
                    .filter_map(|cid| self.files.get(&cid))
                    .collect()
            })
            .unwrap_or_default()
    }
}
```

### Frontend Integration (TypeScript)

```typescript
import { connect, keyStores, WalletConnection } from 'near-api-js';

const nearConfig = {
    networkId: 'testnet',
    keyStore: new keyStores.BrowserLocalStorageKeyStore(),
    nodeUrl: 'https://rpc.testnet.near.org',
    walletUrl: 'https://testnet.mynearwallet.com',
};

const near = await connect(nearConfig);
const wallet = new WalletConnection(near, 'crust-storage-app');

// Upload file to Crust
const cid = await uploadToCrust(fileData, wallet.account().connection.signer);

// Register on NEAR contract
await wallet.account().functionCall({
    contractId: 'file-registry.testnet',
    methodName: 'register_file',
    args: {
        cid: cid,
        filename: 'document.pdf',
        size: fileData.length,
        mime_type: 'application/pdf',
        is_public: false,
    },
    gas: '30000000000000',
});

// Grant access to another user
await wallet.account().functionCall({
    contractId: 'file-registry.testnet',
    methodName: 'grant_access',
    args: { cid: cid, viewer: 'bob.testnet' },
    gas: '30000000000000',
});

// Check access
const canAccess = await wallet.account().viewFunction({
    contractId: 'file-registry.testnet',
    methodName: 'can_access',
    args: { cid: cid, account: 'bob.testnet' },
});
```

## Pattern 3: NFT Metadata Storage

Store NFT media and metadata on Crust, reference from NEAR NFT contract.

```typescript
// 1. Upload NFT image to Crust
const imageCid = await uploadToCrust(imageBuffer, nearKeyPair);

// 2. Create metadata JSON
const metadata = {
    title: 'My NFT #1',
    description: 'A unique digital artwork',
    media: `https://gw.crustgw.work/ipfs/${imageCid}`,
    copies: 1,
};

// 3. Upload metadata to Crust
const metadataCid = await uploadToCrust(
    JSON.stringify(metadata),
    nearKeyPair
);

// 4. Place Crust storage order for persistence
await placeCrustOrder(imageCid, imageBuffer.length);
await placeCrustOrder(metadataCid, JSON.stringify(metadata).length);

// 5. Mint NFT on NEAR with Crust-hosted metadata
await wallet.account().functionCall({
    contractId: 'nft-contract.testnet',
    methodName: 'nft_mint',
    args: {
        token_id: 'nft-001',
        metadata: {
            title: 'My NFT #1',
            media: `https://gw.crustgw.work/ipfs/${imageCid}`,
            reference: `https://gw.crustgw.work/ipfs/${metadataCid}`,
        },
        receiver_id: wallet.getAccountId(),
    },
    gas: '300000000000000',
    attachedDeposit: '10000000000000000000000', // storage deposit
});
```

## Pattern 4: Decentralized Website Hosting

Host a NEAR dApp frontend on Crust/IPFS.

```bash
# Build NEAR dApp
cd my-near-dapp
npm run build

# Upload dist folder to IPFS via Crust
# Option A: Using GitHub Actions
# .github/workflows/deploy.yml:
```

```yaml
name: Deploy NEAR dApp to Crust
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - run: npm install && npm run build

      - uses: crustio/ipfs-upload-action@v1
        with:
          path: ./dist
          seeds: ${{ secrets.CRUST_SEEDS }}
```

## Dependencies

```json
{
    "@crustnetwork/type-definitions": "^1.3.0",
    "@polkadot/api": "^10.0.0",
    "@polkadot/util": "^12.0.0",
    "near-api-js": "^2.0.0",
    "ipfs-http-client": "^60.0.0"
}
```

## Common Pitfalls

1. **NEAR key format**: Always strip `ed25519:` prefix when building W3Auth header
2. **Signature encoding**: NEAR signatures must be hex-encoded without `0x` prefix
3. **CRU tokens needed**: Storage orders require CRU. NEAR auth only covers IPFS upload, not persistence ordering
4. **File size mismatch**: Ensure `placeStorageOrder` file size matches actual IPFS file size (use `ipfs.files.stat`)
5. **Testnet vs mainnet**: Use `near-api-js` testnet config for development, but Crust mainnet for storage orders
