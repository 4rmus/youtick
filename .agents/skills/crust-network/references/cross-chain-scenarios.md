# Cross-Chain Storage Scenarios

## Scenario 1: NEAR dApp + Crust Storage + EVM Payments

A NEAR dApp that stores files on Crust, with payment flexibility across chains.

```
User (NEAR Wallet)
  │
  ├─ Auth: NEAR ed25519 key → W3Auth → IPFS Upload
  │
  ├─ Registry: NEAR Contract stores CID + metadata
  │
  └─ Payment Options:
     ├─ CRU: Direct storage order on Crust chain
     ├─ ETH: Via Ethereum StorageOrder contract
     ├─ MATIC: Via Polygon StorageOrder contract
     └─ ARB: Via Arbitrum StorageOrder contract
```

### Implementation

```typescript
import { KeyPair } from 'near-api-js';
import { ethers } from 'ethers';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundleForPolkadot } from '@crustnetwork/type-definitions';
import { create } from 'ipfs-http-client';

class CrossChainStorage {
    private nearKeyPair: KeyPair;
    private crustApi: ApiPromise;
    private ipfs: ReturnType<typeof create>;

    constructor(nearKeyPair: KeyPair) {
        this.nearKeyPair = nearKeyPair;
        this.ipfs = this.createAuthenticatedIpfs();
    }

    private createAuthenticatedIpfs() {
        const addressRaw = this.nearKeyPair.getPublicKey().toString();
        const address = addressRaw.substring(8);
        const { signature } = this.nearKeyPair.sign(Buffer.from(address));
        const sig = Buffer.from(signature).toString('hex');
        const authHeader = Buffer.from(`near-${address}:${sig}`).toString('base64');

        return create({
            url: 'https://crustipfs.xyz/api/v0',
            headers: { authorization: `Basic ${authHeader}` }
        });
    }

    async upload(content: string | Buffer): Promise<string> {
        const { cid } = await this.ipfs.add(content);
        return cid.toString();
    }

    // Pay with CRU (native Crust chain)
    async payWithCru(cid: string, size: number, seeds: string) {
        const api = new ApiPromise({
            provider: new WsProvider('wss://rpc.crust.network'),
            typesBundle: typesBundleForPolkadot,
        });
        await api.isReady;

        const { Keyring } = await import('@polkadot/keyring');
        const kr = new Keyring({ type: 'sr25519' });
        const account = kr.addFromUri(seeds);

        return api.tx.market.placeStorageOrder(cid, size, 0, '')
            .signAndSend(account);
    }

    // Pay with ETH/MATIC/etc via EVM contract
    async payWithEvm(
        cid: string,
        size: number,
        chain: 'ethereum' | 'polygon' | 'arbitrum' | 'optimism',
        signer: ethers.Signer
    ) {
        const contracts: Record<string, string> = {
            ethereum:  '0xE391613d2056e47F74ED5eF1d443d4CDb21AAAd9',
            arbitrum:  '0x9ae6c9d00fde0e0f774693ca6099d06dfe2001c6',
            optimism:  '0xf8e6F7bb144D3475fcf39Bd879510Fa93C775ee2',
            polygon:   '0xE1E8ff8e51DA7066CB1009a4c1dE68AE2d095655',
        };

        const ABI = [
            "function getPrice(uint size, bool isPermanent) public view returns (uint)",
            "function placeOrder(string memory cid, uint size, bool isPermanent) external payable"
        ];

        const contract = new ethers.Contract(contracts[chain], ABI, signer);
        const price = await contract.getPrice(size, true);
        return contract.placeOrder(cid, size, true, { value: price });
    }
}
```

## Scenario 2: Multi-Chain NFT Marketplace with Crust Storage

NFTs minted on any chain, media stored permanently on Crust.

```
Creator uploads artwork
  │
  ├─ Image → Crust IPFS (W3Auth with any wallet)
  ├─ Metadata JSON → Crust IPFS
  ├─ Storage Order → Crust chain (permanent)
  │
  └─ Mint NFT on:
     ├─ NEAR (NEP-171 standard)
     ├─ Ethereum (ERC-721)
     ├─ Polygon (ERC-721)
     └─ Solana (Metaplex)

     All reference same Crust IPFS CIDs for media
```

## Scenario 3: Decentralized Social Media Backend

```
User posts content
  │
  ├─ Auth: NEAR/ETH/SOL wallet signs into dApp
  │
  ├─ Content Storage:
  │   ├─ Text posts → NEAR contract (on-chain, small)
  │   ├─ Images → Crust IPFS + storage order
  │   ├─ Videos → Crust IPFS + storage order
  │   └─ Profile data → Crust IPFS
  │
  ├─ Social Graph:
  │   └─ NEAR contract manages follows, likes, comments
  │
  └─ Content Addressing:
      └─ CIDs stored on NEAR contract, files on Crust
```

## Scenario 4: DAO Document Management

```
DAO Governance Documents
  │
  ├─ Upload: Any DAO member (multi-chain wallet auth)
  │   └─ W3Auth supports NEAR, ETH, SOL, DOT wallets
  │
  ├─ Storage: Crust IPFS (permanent, censorship-resistant)
  │   └─ Storage orders funded by DAO treasury
  │
  ├─ Access Control: NEAR smart contract
  │   ├─ Role-based permissions (admin, member, viewer)
  │   ├─ Proposal-gated access (vote to reveal)
  │   └─ Time-locked documents (embargo periods)
  │
  └─ Verification: On-chain CID registry
      └─ Anyone can verify document integrity via CID
```

## Scenario 5: NEAR + Crust + Nova SDK (TEE-Encrypted Persistent Storage)

Nova SDK provides zero-knowledge encrypted file sharing via Shade Agents running in TEE (Phala Network). Combined with Crust, files are encrypted with hardware-secured keys and permanently persisted across the IPFS network.

```
Encrypted Persistent Data Flow:
  │
  ├─ Auth: NEAR wallet authenticates with Nova SDK
  │   └─ Group membership verified on NEAR smart contract
  │
  ├─ Key Management: Shade Agent (Phala TEE)
  │   ├─ AES-256-GCM keys generated inside TEE enclave
  │   ├─ Keys NEVER appear on-chain or leave TEE unencrypted
  │   ├─ Remote attestation proves genuine hardware execution
  │   └─ Key rotation on member removal (forward secrecy)
  │
  ├─ Encrypt: Client-side AES-256-GCM with TEE-provided key
  │   └─ Plaintext never reaches any server
  │
  ├─ Store: Encrypted blob → IPFS (via Nova or W3Auth gateway)
  │   └─ Even IPFS/Crust node operators cannot read the data
  │
  ├─ Persist: Crust storage order guarantees replication
  │   └─ sWorkers store encrypted blobs with MPoW verification
  │
  ├─ Register: CID + metadata → NEAR contract (access control)
  │
  └─ Decrypt:
      ├─ Shade Agent verifies NEAR group membership
      ├─ TEE delivers encrypted key via ephemeral X25519 key exchange
      ├─ Client fetches encrypted blob from Crust IPFS gateway
      └─ Client decrypts locally with AES-256-GCM key
```

### Nova + Crust Implementation

```typescript
import { NovaSDK } from 'nova-sdk-js';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundleForPolkadot } from '@crustnetwork/type-definitions';
import { Keyring } from '@polkadot/keyring';

// Nova handles: NEAR auth → TEE key management → encryption → IPFS upload
const nova = new NovaSDK({
    networkId: 'mainnet',
    contractId: 'nova.near',
    shadeAgentUrl: 'https://shade.phala.network'
});

// Create group with NEAR-based membership
const { groupId } = await nova.createGroup({
    name: 'Sensitive Data Vault',
    members: ['alice.near', 'bob.near']
});

// Upload encrypts via Shade Agent TEE and stores on IPFS
const { cid, encryptedSize } = await nova.uploadFile({
    groupId,
    file: sensitiveData,
    metadata: { fileName: 'classified.pdf' }
});

// Crust ensures permanent persistence of encrypted file
const crustApi = new ApiPromise({
    provider: new WsProvider('wss://rpc.crust.network'),
    typesBundle: typesBundleForPolkadot,
});
await crustApi.isReady;

const kr = new Keyring({ type: 'sr25519' });
await crustApi.tx.market.placeStorageOrder(cid, encryptedSize, 0, '')
    .signAndSend(kr.addFromUri('crust seeds'));

// Only group members can decrypt via Shade Agent verification
const decrypted = await nova.downloadFile({ groupId, cid });
```

## Supported Chain Summary

### Authentication (W3Auth - Upload)

| Chain | Auth Key | Status |
|-------|----------|--------|
| NEAR | `near` / `nea` | Fully supported |
| Ethereum | `eth` | Fully supported |
| Polygon | `pol` | Fully supported |
| Solana | `sol` | Fully supported |
| Substrate | `sub` | Fully supported |
| Avalanche | `ava` | Supported |
| Aptos | `apt` | Supported |
| Algorand | `algo` | Supported |
| TON | `ton` | Supported |
| Flow | `flo` | Supported |
| Elrond | `elr` | Supported |

### Storage Payments (On-Chain Orders)

| Chain | Contract | Token |
|-------|----------|-------|
| Crust Native | `market.placeStorageOrder` | CRU |
| Ethereum | `0xE391...AAAd9` | ETH |
| Arbitrum | `0x9ae6...2001c6` | ETH |
| Optimism | `0xf8e6...5ee2` | ETH |
| zkSync | `0xfa86...4135` | ETH |
| Polygon | `0xE1E8...5655` | MATIC |
| Algorand | Custom contract | ALGO |
| Aptos | Custom contract | APT |
| Elrond | Custom contract | EGLD |
| TON | CrustBags | TON |

## Architecture Decision Guide

| Requirement | Recommended Pattern |
|-------------|-------------------|
| NEAR dApp + file storage | Pattern 1 (NEAR auth + Crust upload + NEAR registry) |
| NFT media storage | Pattern 3 (Crust storage + any chain NFT mint) |
| Multi-chain user base | Pattern 1 with EVM payment fallback |
| Encrypted file sharing | Pattern 5 (Nova SDK TEE + Crust + NEAR) |
| Static website hosting | GitHub Actions deployment |
| DAO documents | Pattern 4 (multi-chain auth + NEAR access control) |
