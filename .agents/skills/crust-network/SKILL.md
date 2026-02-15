---
name: crust-network
description: >
  Building decentralized storage applications with Crust Network, IPFS pinning, W3Auth multi-chain authentication,
  and cross-chain storage orders. Use when implementing IPFS-based storage, placing on-chain storage orders,
  integrating W3Auth gateway authentication, working with W3Bucket NFT storage, building NEAR Protocol + Crust
  cross-chain storage solutions, or combining Nova SDK TEE-encrypted file sharing with Crust persistent storage.
version: 1.0.0
license: MIT
platforms:
  - claude
  - gemini
  - openai
  - markdown
tags:
  - crust
  - ipfs
  - decentralized-storage
  - w3auth
  - w3bucket
  - near-protocol
  - cross-chain
  - web3
  - substrate
  - pinning
  - nova-sdk
  - shade-agent
  - tee-encryption
metadata:
  author: crust-network
  version: "1.0.0"
---

# Crust Network Decentralized Storage

Crust Network is a decentralized cloud storage protocol on Substrate. It provides IPFS-based file storage with on-chain storage ordering, multi-chain authentication (W3Auth), and cross-chain payment support across 12+ blockchains including NEAR Protocol, Ethereum, Solana, and Polkadot.

## When to Use This Skill

Use this skill when:
- Uploading files to IPFS with Crust Network guaranteed persistence
- Placing storage orders on Crust chain (native or cross-chain via EVM contracts)
- Authenticating with W3Auth using NEAR, Ethereum, Solana, or other chain wallets
- Building dApps that need decentralized file storage with on-chain guarantees
- Integrating NEAR Protocol applications with Crust for permanent file storage
- Working with W3Bucket NFT-based storage capacity
- Hosting static websites/dApps on IPFS via Crust pinning
- Implementing cross-chain storage solutions spanning NEAR + Crust + EVM
- Using Crust GitHub Actions for CI/CD IPFS deployment
- Querying file replica status and storage order information on-chain

## Quick Reference

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Storage Order** | On-chain transaction requesting file persistence on Crust Network |
| **W3Auth** | Multi-chain authentication layer for IPFS gateway access |
| **W3Bucket** | ERC-721 NFT representing storage capacity tiers |
| **MPoW** | Meaningful Proof of Work - TEE-based storage verification |
| **GPoS** | Guaranteed Proof of Stake - storage-weighted staking consensus |
| **DSM** | Decentralized Storage Market - on-chain file ordering module |
| **sWorker** | Storage worker running in TEE enclave, proves storage |
| **CRU** | Native token for storage payments and staking |
| **Nova SDK** | Privacy-first encrypted file sharing with TEE key management on NEAR |
| **Shade Agent** | TEE-based key manager on Phala Network for zero-knowledge encryption |

### Chain Endpoints

```
Mainnet:  wss://rpc.crust.network
Shadow:   wss://rpc-sha-subscan.crust.network
IPFS GW:  https://gw.crustgw.work (US), https://gw.crustgw.org (CN)
Upload:   https://crustipfs.xyz
```

### Install SDK

```bash
# Core type definitions for chain interaction
yarn add @polkadot/api @crustnetwork/type-definitions

# Simple pinning client
yarn add @crustnetwork/crust-pin

# For NEAR integration
yarn add near-api-js ipfs-http-client

# For Nova SDK encrypted file sharing (TEE + Crust storage)
npm install nova-sdk-js
```

### Connect to Crust Chain

```typescript
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundleForPolkadot } from '@crustnetwork/type-definitions';

const api = new ApiPromise({
    provider: new WsProvider('wss://rpc.crust.network'),
    typesBundle: typesBundleForPolkadot,
});
await api.isReady;
```

### Place a Storage Order (Native)

```typescript
import { Keyring } from '@polkadot/keyring';

// Upload file to IPFS first, then place order
const fileCid = 'QmVAjL5AkQJ6uwWnJ78YXCVK6FB1cgPtYPRyjnPvoVmb3K';
const fileSize = 5242880; // bytes
const tips = 0;           // extra pCRU tips (1 pCRU = 10^-12 CRU)
const memo = '';

const tx = api.tx.market.placeStorageOrder(fileCid, fileSize, tips, memo);

const kr = new Keyring({ type: 'sr25519' });
const account = kr.addFromUri('your mnemonic seed phrase here');

await tx.signAndSend(account, ({ events, status }) => {
    if (status.isInBlock) {
        events.forEach(({ event }) => {
            if (api.events.system.ExtrinsicSuccess.is(event)) {
                console.log('Storage order placed successfully');
            }
        });
    }
});
```

### Quick Pin with CrustPinner

```typescript
import CrustPinner from '@crustnetwork/crust-pin';

const crust = new CrustPinner('your twelve word mnemonic seeds');
const success = await crust.pin('QmVAjL5AkQJ6uwWnJ78YXCVK6FB1cgPtYPRyjnPvoVmb3K');
```

### Query Storage Status

```typescript
const fileInfo = await api.query.market.filesV2(fileCid);
console.log('Replicas:', fileInfo.reported_replica_count.toString());
console.log('File size:', fileInfo.file_size.toString());
console.log('Expires:', fileInfo.expired_at.toString());
```

### W3Auth Header (Any Chain)

```
Authorization: Basic <base64(ChainType-PubKey:SignedMessage)>
```

Supported chain types: `sub`, `eth`, `pol`, `sol`, `nea`/`near`, `ava`, `apt`, `algo`, `ton`, `flo`, `elr`, `xx`

## NEAR Protocol + Crust Integration

### NEAR Authentication for IPFS Upload

```typescript
import { KeyPair } from 'near-api-js';
import { create } from 'ipfs-http-client';
import { u8aToHex } from '@polkadot/util';

// 1. Create NEAR key pair
const keyPair = KeyPair.fromRandom('ed25519');
const addressRaw = keyPair.getPublicKey().toString();
const address = addressRaw.substring(8); // strip "ed25519:" prefix

// 2. Sign for W3Auth
const { signature } = keyPair.sign(Buffer.from(address));
const sig = u8aToHex(signature).substring(2); // hex without 0x

// 3. Build auth header
const authHeaderRaw = `near-${address}:${sig}`;
const authHeader = Buffer.from(authHeaderRaw).toString('base64');

// 4. Create authenticated IPFS client
const ipfs = create({
    url: 'https://crustipfs.xyz/api/v0',
    headers: { authorization: `Basic ${authHeader}` }
});

// 5. Upload file
const { cid } = await ipfs.add(fileContent);
console.log('Uploaded CID:', cid.toString());
```

### NEAR + Crust Complete Workflow

```typescript
// Step 1: Authenticate with NEAR wallet and upload to IPFS
const cid = await uploadWithNearAuth(fileData);

// Step 2: Place storage order on Crust chain (requires CRU)
const tx = api.tx.market.placeStorageOrder(cid.toString(), fileSize, 0, '');
await tx.signAndSend(crustAccount, callback);

// Step 3: Optionally add prepaid for settlement discounts
await api.tx.market.addPrepaid(cid.toString(), prepaidAmount)
    .signAndSend(crustAccount, callback);

// Step 4: Verify replicas
const status = await api.query.market.filesV2(cid.toString());
console.log(`Replicas: ${status.reported_replica_count}`);
```

### NEAR dApp Storage Pattern

```typescript
// In a NEAR dApp: store metadata CIDs on NEAR, files on Crust
import { connect, keyStores } from 'near-api-js';

// NEAR contract stores file registry
const nearConfig = {
    networkId: 'mainnet',
    keyStore: new keyStores.BrowserLocalStorageKeyStore(),
    nodeUrl: 'https://rpc.mainnet.near.org',
};
const near = await connect(nearConfig);
const account = await near.account('your-app.near');

// Upload file via Crust (NEAR auth)
const cid = await uploadToCrust(file, nearKeyPair);

// Store CID reference on NEAR contract
await account.functionCall({
    contractId: 'your-storage-registry.near',
    methodName: 'register_file',
    args: { cid: cid.toString(), filename: file.name, size: file.size },
    gas: '30000000000000',
});
```

## Nova SDK + Crust: TEE-Encrypted Storage

Nova SDK provides zero-knowledge encrypted file sharing on NEAR via Shade Agents (TEE on Phala Network). Combined with Crust, files are both encrypted and permanently persisted.

### Nova + Crust Encrypted Persistent Storage

```typescript
import { NovaSDK } from 'nova-sdk-js';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundleForPolkadot } from '@crustnetwork/type-definitions';
import { Keyring } from '@polkadot/keyring';

// 1. Initialize Nova SDK (handles encryption via Shade Agent TEE)
const nova = new NovaSDK({
    networkId: 'mainnet',
    contractId: 'nova.near',
    shadeAgentUrl: 'https://shade.phala.network'
});

// 2. Create a group with NEAR-based access control
const { groupId } = await nova.createGroup({
    name: 'Confidential Project',
    members: ['alice.near', 'bob.near'],
});

// 3. Upload file - Nova encrypts via TEE (AES-256-GCM), stores on IPFS
const { cid, encryptedSize } = await nova.uploadFile({
    groupId,
    file: sensitiveDocument,
    metadata: { fileName: 'strategy.pdf', mimeType: 'application/pdf' }
});

// 4. Place Crust storage order for permanent persistence of encrypted file
const crustApi = new ApiPromise({
    provider: new WsProvider('wss://rpc.crust.network'),
    typesBundle: typesBundleForPolkadot,
});
await crustApi.isReady;

const kr = new Keyring({ type: 'sr25519' });
const crustAccount = kr.addFromUri('crust mnemonic seeds');

await crustApi.tx.market.placeStorageOrder(cid, encryptedSize, 0, '')
    .signAndSend(crustAccount);

// Result: File is AES-256-GCM encrypted (keys in TEE only),
// stored on IPFS, and permanently persisted by Crust Network.
// Only NEAR group members can decrypt via Shade Agent verification.
```

### How It Works

```
Nova + Crust Encrypted Persistent Storage Flow:

User (NEAR Wallet)
  │
  ├─ Nova SDK: Authenticate with NEAR account
  │     ├─ Shade Agent (Phala TEE) generates AES-256-GCM key
  │     ├─ Keys NEVER appear on-chain or leave TEE unencrypted
  │     └─ TEE attestation proves unmodified execution
  │
  ├─ Encrypt: Client-side AES-256-GCM (key from Shade Agent)
  │     └─ File header: NOVA magic + key version + nonce + encrypted payload
  │
  ├─ Store: Encrypted blob → IPFS (via W3Auth or Nova MCP)
  │
  ├─ Persist: Crust storage order → sWorkers replicate encrypted file
  │     └─ Even Crust nodes cannot read the data (encrypted at rest)
  │
  ├─ Register: CID + metadata → NEAR contract (access control)
  │
  └─ Decrypt: Only group members verified by Shade Agent via NEAR contract
        ├─ Shade Agent checks NEAR membership → delivers key
        ├─ Client decrypts locally
        └─ Removed members → automatic key rotation (forward secrecy)
```

### Access Revocation with Crust Persistence

```typescript
// Remove a team member - key automatically rotates in TEE
await nova.removeMember({
    groupId: 'group-123',
    memberId: 'ex-contractor.near'
});
// Shade Agent generates new key version
// ex-contractor.near can never decrypt new files
// Old encrypted files on Crust remain safe (new key for new files)
// Crust continues persisting all versions of encrypted files

// Verify: ex-contractor cannot access
const canAccess = await nova.verifyMembership({
    groupId: 'group-123',
    accountId: 'ex-contractor.near'
}); // false

// Remaining members seamlessly access all files
const decrypted = await nova.downloadFile({
    groupId: 'group-123',
    cid: 'QmEncrypted...',
    accountId: 'alice.near'
});
```

## EVM Cross-Chain Storage Orders

```typescript
import { ethers } from 'ethers';

const StorageOrderABI = [
    "function getPrice(uint size, bool isPermanent) public view returns (uint)",
    "function placeOrder(string memory cid, uint size, bool isPermanent) external payable",
    "function placeOrderWithNode(string memory cid, uint size, address nodeAddress, bool isPermanent) public payable"
];

// Contract addresses per chain
const contracts = {
    ethereum:  '0xE391613d2056e47F74ED5eF1d443d4CDb21AAAd9',
    arbitrum:  '0x9ae6c9d00fde0e0f774693ca6099d06dfe2001c6',
    optimism:  '0xf8e6F7bb144D3475fcf39Bd879510Fa93C775ee2',
    zkSync:    '0xfa866AbF8F0b8f154654DEd956B2467dFB6A4135',
    polygon:   '0xE1E8ff8e51DA7066CB1009a4c1dE68AE2d095655',
};

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const contract = new ethers.Contract(contracts.ethereum, StorageOrderABI, signer);

// Get price and place order
const price = await contract.getPrice(fileSize, true); // isPermanent
await contract.placeOrder(fileCid, fileSize, true, { value: price });
```

## W3Auth Ethereum Authentication

```typescript
import { ethers } from 'ethers';
import { create } from 'ipfs-http-client';

const wallet = ethers.Wallet.createRandom();
const sig = await wallet.signMessage(wallet.address);
const authHeaderRaw = `eth-${wallet.address}:${sig}`;
const authHeader = Buffer.from(authHeaderRaw).toString('base64');

const ipfs = create({
    url: 'https://crustipfs.xyz/api/v0',
    headers: { authorization: `Basic ${authHeader}` }
});

const { cid } = await ipfs.add('Hello from Ethereum!');
```

## GitHub Actions Deployment

```yaml
name: Deploy to Crust IPFS
on: push

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run build

      - uses: crustio/ipfs-upload-action@v1
        with:
          path: ./dist
          seeds: ${{ secrets.CRUST_SEEDS }}

      # Or pin existing CID
      - uses: crustio/ipfs-crust-action@v2.0.6
        with:
          cid: QmevJf2rdNibZCGrgeyVJEM82y5DsXgMDHXM6zBtQ6G4Vj
          seeds: ${{ secrets.CRUST_SEEDS }}
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Crust Network Architecture                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────┐    ┌─────────────┐    ┌──────────────────────┐       │
│  │  Client    │───▶│  W3Auth GW  │───▶│  IPFS Network        │       │
│  │  (dApp)    │    │  (Auth)     │    │  (File Storage)      │       │
│  └───────────┘    └─────────────┘    └──────────────────────┘       │
│       │                                        ▲                     │
│       │ Storage Order                          │ MPoW Proofs         │
│       ▼                                        │                     │
│  ┌───────────────────────────┐    ┌────────────────────────┐        │
│  │  Crust Chain (Substrate)  │    │  sWorker (TEE)         │        │
│  │  ┌─────────────────────┐  │    │  - Storage verification│        │
│  │  │ DSM (Storage Market)│  │    │  - MPoW generation     │        │
│  │  │ - placeStorageOrder │  │◀───│  - Replica reporting   │        │
│  │  │ - addPrepaid        │  │    └────────────────────────┘        │
│  │  │ - filesV2 query     │  │                                      │
│  │  └─────────────────────┘  │    ┌────────────────────────┐        │
│  │  ┌─────────────────────┐  │    │ EVM Storage Contracts  │        │
│  │  │ GPoS (Consensus)    │  │◀───│ ETH/ARB/OP/zkSync/POL │        │
│  │  │ - Storage-weighted  │  │    │ placeOrder() → relay   │        │
│  │  │ - Validator staking │  │    └────────────────────────┘        │
│  │  └─────────────────────┘  │                                      │
│  └───────────────────────────┘                                      │
│                                                                      │
│  Cross-Chain Auth: NEAR | ETH | SOL | DOT | APT | ALGO | TON       │
└──────────────────────────────────────────────────────────────────────┘
```

## Common Issues

**Issue: "Unable to place storage order - insufficient balance"**
Storage orders require CRU tokens. For testing, use the free storage faucet or claim testnet tokens from Crust Discord.

**Issue: "W3Auth returns 401 Unauthorized"**
Verify auth header format: `Basic base64(chainType-pubKey:signedMsg)`. The signature must sign the public key/address itself. For NEAR, strip the `ed25519:` prefix from the public key.

**Issue: "File shows 0 replicas after order"**
Replica reporting takes time (typically 1-4 hours). sWorkers must discover, download, and report the file. Check back with `api.query.market.filesV2(cid)`.

**Issue: "NEAR auth not working"**
NEAR uses ed25519 keys (same as Solana). Ensure you strip the `ed25519:` prefix, hex-encode the signature without `0x`, and use `near` or `nea` as chain type.

**Issue: "EVM storage order not relayed to Crust"**
The `storage-contract-node` monitors Order events and relays to Crust. There may be a delay. Verify the contract address matches the chain you're using.

## Reference Files

This skill includes detailed documentation in `references/`:

- **index.md** - Navigation guide and overview
- **storage-orders.md** - Complete storage ordering API (native + EVM)
- **w3auth.md** - Multi-chain authentication reference for all 12 chains
- **near-integration.md** - NEAR Protocol + Crust integration patterns
- **w3bucket.md** - W3Bucket NFT storage contracts and API
- **chain-types.md** - Crust chain type definitions and on-chain queries
- **github-actions.md** - CI/CD deployment with Crust IPFS pinning
- **cross-chain-scenarios.md** - Advanced multi-chain storage architectures
- **nova-crust-encryption.md** - Nova SDK TEE encryption + Crust persistence patterns

## Resources

- Wiki: https://wiki.crust.network
- Website: https://crust.network
- GitHub: https://github.com/crustio
- SDK: https://github.com/crustio/crust.js
- NEAR Demo: https://github.com/crustio/crust-demo/tree/main/near
- Free Storage: https://github.com/crustio/free-storage
- IPFS Scanner: https://ipfsscan.io
- Nova SDK: https://nova-sdk.com
- Nova Docs: https://nova-25.gitbook.io/nova-docs/
- Nova GitHub: https://github.com/jcarbonnell/nova
- Nova MCP: https://nova-mcp.fastmcp.app/mcp
