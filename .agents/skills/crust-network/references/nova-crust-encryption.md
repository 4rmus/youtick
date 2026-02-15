# Nova SDK + Crust: TEE-Encrypted Persistent Storage

## Overview

Nova SDK (nova-sdk.com) is a privacy-first, decentralized file-sharing primitive built on NEAR Protocol. It uses Shade Agents running in Trusted Execution Environments (TEE) on Phala Network for zero-knowledge key management and AES-256-GCM encryption. When combined with Crust Network, encrypted files gain permanent IPFS persistence with on-chain storage guarantees.

**Key principle**: Keys are managed off-chain in verifiable TEEs. They never appear on-chain, ensuring privacy even against blockchain analysis.

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│              Nova SDK + Crust Integrated Architecture                  │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────────────────┐    │
│  │  Client   │───▶│  Nova SDK    │───▶│  NEAR Smart Contract    │    │
│  │  (dApp)   │    │  (JS/Rust)   │    │  - Group membership     │    │
│  └──────────┘    └──────────────┘    │  - File CID registry    │    │
│       │                │              │  - Access control        │    │
│       │                │              └─────────────────────────┘    │
│       │                │                        ▲                    │
│       │                ▼                        │ Verify membership  │
│       │         ┌──────────────────┐            │                    │
│       │         │  Shade Agent     │────────────┘                    │
│       │         │  (Phala TEE)     │                                 │
│       │         │                  │                                 │
│       │         │  ┌────────────┐  │                                 │
│       │         │  │ Key Store  │  │  AES-256-GCM keys              │
│       │         │  │ (sealed)   │  │  never leave TEE               │
│       │         │  └────────────┘  │                                 │
│       │         │  ┌────────────┐  │                                 │
│       │         │  │ Attestation│  │  Proves genuine execution      │
│       │         │  └────────────┘  │                                 │
│       │         └──────────────────┘                                 │
│       │                │                                             │
│       │                │ Encrypted key via X25519 exchange           │
│       │                ▼                                             │
│       │    Client-side AES-256-GCM encryption                       │
│       │                │                                             │
│       ▼                ▼                                             │
│  ┌──────────────────────────────┐    ┌─────────────────────────┐    │
│  │  IPFS Network                │    │  Crust Chain             │    │
│  │  (Encrypted file storage)    │◀───│  - Storage orders        │    │
│  │                              │    │  - sWorker replication   │    │
│  │  Files encrypted at rest:    │    │  - MPoW verification     │    │
│  │  NOVA header + AES ciphertext│    │  - Persistence guarantee │    │
│  └──────────────────────────────┘    └─────────────────────────┘    │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Nova SDK Core Concepts

### Shade Agent (TEE Key Manager)

The Shade Agent runs inside a Trusted Execution Environment on Phala Network:

- **Hardware Isolation**: Intel SGX / ARM TrustZone
- **Memory Encryption**: Sealed storage - even the host OS cannot read keys
- **Remote Attestation**: Cryptographic proof of genuine, unmodified code execution
- **Key Algorithm**: AES-256-GCM with HKDF-SHA256 key derivation
- **Key Exchange**: X25519 ephemeral keys for secure key delivery to clients

### Zero-Knowledge Properties

| Component | Knows | Does NOT Know |
|-----------|-------|---------------|
| NEAR Contract | Membership, CIDs, metadata | Keys, file contents |
| Shade Agent (TEE) | Encryption keys, key versions | File contents, CIDs |
| IPFS / Crust | Encrypted blobs | Keys, plaintext |
| Client | Temporarily holds key during operation | Keys not persisted to disk |

### Encrypted File Format (IPFS)

```
┌─────────────────────────────────────────┐
│  NOVA Header (32 bytes)                 │
│  ├── Magic: "NOVA" (4 bytes)            │
│  ├── Version: u8 (1 byte)              │
│  ├── Algorithm: 0x01 = AES-256-GCM     │
│  ├── Key Version: u64 (8 bytes)        │
│  ├── Nonce: 12 bytes (random)          │
│  └── Reserved: 6 bytes                 │
├─────────────────────────────────────────┤
│  AES-256-GCM Encrypted Payload          │
├─────────────────────────────────────────┤
│  GCM Auth Tag (16 bytes)                │
└─────────────────────────────────────────┘
```

## Complete Integration Patterns

### Pattern A: Nova Encrypt + Crust Persist

Basic pattern: encrypt with Nova, persist with Crust.

```typescript
import { NovaSDK } from 'nova-sdk-js';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { typesBundleForPolkadot } from '@crustnetwork/type-definitions';
import { Keyring } from '@polkadot/keyring';

// Initialize both systems
const nova = new NovaSDK({
    networkId: 'mainnet',
    contractId: 'nova.near',
    shadeAgentUrl: 'https://shade.phala.network'
});

const crustApi = new ApiPromise({
    provider: new WsProvider('wss://rpc.crust.network'),
    typesBundle: typesBundleForPolkadot,
});
await crustApi.isReady;

// Upload and encrypt via Nova
const { groupId } = await nova.createGroup({
    name: 'Secure Vault',
    members: ['alice.near', 'bob.near']
});

const { cid, encryptedSize } = await nova.uploadFile({
    groupId,
    file: secretDocument,
    metadata: { fileName: 'contract.pdf' }
});

// Persist on Crust
const kr = new Keyring({ type: 'sr25519' });
const crustAccount = kr.addFromUri('crust mnemonic seeds');

await crustApi.tx.market.placeStorageOrder(cid, encryptedSize, 0, '')
    .signAndSend(crustAccount);

// Verify persistence
const fileStatus = await crustApi.query.market.filesV2(cid);
console.log(`Replicas: ${fileStatus.reported_replica_count}`);
```

### Pattern B: Nova MCP Server + Crust Storage Order

Use Nova's MCP server for AI-assistant encrypted file operations, with Crust persistence.

```json
{
    "mcpServers": {
        "nova": {
            "command": "npx",
            "args": ["nova-mcp-server"],
            "env": {
                "NEAR_ACCOUNT_ID": "your-account.near",
                "NEAR_PRIVATE_KEY": "ed25519:...",
                "NOVA_CONTRACT_ID": "nova.near",
                "SHADE_AGENT_URL": "https://shade.phala.network"
            }
        }
    }
}
```

MCP Public Endpoint: `https://nova-mcp.fastmcp.app/mcp`

### Pattern C: Encrypted NFT Vault with Crust

Store encrypted NFT-gated content with permanent Crust persistence.

```typescript
// 1. Create Nova group matching NFT holder list
const { groupId } = await nova.createGroup({
    name: 'NFT Holder Vault',
    members: nftHolderAccounts, // e.g., from NEAR NFT contract query
});

// 2. Encrypt premium content via Nova (Shade Agent TEE)
const { cid, encryptedSize } = await nova.uploadFile({
    groupId,
    file: premiumContent,
    metadata: { fileName: 'exclusive-content.mp4', type: 'premium' }
});

// 3. Crust storage order for permanent media persistence
await crustApi.tx.market.placeStorageOrder(cid, encryptedSize, 0, '')
    .signAndSend(crustAccount);

// 4. Register on NEAR NFT contract
await nearAccount.functionCall({
    contractId: 'nft-contract.near',
    methodName: 'set_encrypted_content',
    args: { token_id: 'nft-001', encrypted_cid: cid, group_id: groupId },
    gas: '30000000000000',
});

// 5. When NFT is transferred → update Nova group membership
// New holder added, previous holder removed → key rotation in TEE
```

### Pattern D: DAO Confidential Documents

```typescript
// DAO members share confidential governance documents

// 1. Nova group = DAO membership (synced from NEAR DAO contract)
const { groupId } = await nova.createGroup({
    name: 'DAO Governance Vault',
    members: daoMemberAccounts,
});

// 2. Upload encrypted proposal draft
const { cid, encryptedSize } = await nova.uploadFile({
    groupId,
    file: proposalDraft,
    metadata: { fileName: 'proposal-42.md', status: 'draft' }
});

// 3. Crust persistence (funded by DAO treasury)
await crustApi.tx.market.placeStorageOrder(cid, encryptedSize, 0, '')
    .signAndSend(daoTreasuryAccount);

// 4. When voting passes → make document public
// Upload unencrypted version to Crust for public access
```

## Key Management Details

### Key Request Flow

```
1. Client generates ephemeral X25519 keypair
2. Client signs request with NEAR account key (ed25519)
3. POST /keys/request → Shade Agent
4. Shade Agent queries NEAR contract for group membership
5. If verified: Shade Agent encrypts AES key with client's ephemeral public key
6. Client decrypts AES key using ephemeral private key
7. Client uses AES-256-GCM key for file encrypt/decrypt
8. Ephemeral keys discarded after use
```

### Key Rotation (Forward Secrecy)

Automatic triggers:
- Member removed from group
- Admin role downgraded
- Security event detected
- Scheduled periodic rotation (optional)

After rotation:
- New AES-256-GCM key generated inside TEE
- Old keys retained (versioned) for existing encrypted files
- New files use new key version
- Removed members cannot obtain any key version going forward

### Shade Agent API Endpoints

```
Production: https://shade.phala.network
Testnet:    https://shade-testnet.phala.network

POST /keys/request    - Request encryption key for a group
POST /keys/rotate     - Trigger key rotation
GET  /keys/status/:id - Get key status for a group
GET  /attestation     - Get TEE attestation report
GET  /health          - Health check
```

## Transaction Costs

| Operation | Cost | Network |
|-----------|------|---------|
| Nova group creation | ~0.1 NEAR | NEAR |
| Nova member add/remove | ~0.0005 NEAR | NEAR |
| Nova file upload (registry) | ~0.01 NEAR | NEAR |
| Nova file retrieval | ~0.001 NEAR | NEAR |
| Crust storage order (1MB, 6mo) | Variable CRU | Crust |
| Crust storage via EVM | Variable ETH/MATIC | EVM chain |
| Shade Agent key request | Free (TEE operation) | Phala |

## Dependencies

```json
{
    "nova-sdk-js": "latest",
    "@crustnetwork/type-definitions": "^1.3.0",
    "@polkadot/api": "^10.0.0",
    "@polkadot/keyring": "^12.0.0",
    "near-api-js": "^2.0.0"
}
```

## Common Issues

**Issue: "SHADE_AGENT_ERROR - Key management service unavailable"**
Shade Agent may be temporarily down. Implement retry with exponential backoff. Check `https://shade.phala.network/health`.

**Issue: "Nova encryption works but Crust shows 0 replicas"**
Nova upload and Crust storage order are separate steps. Ensure you place the Crust order using the CID from Nova's upload result. Replica reporting takes 1-4 hours.

**Issue: "Key rotation not triggering after member removal"**
Verify the Nova contract transaction completed on NEAR. The Shade Agent listens for `MemberRemoved` events from the NEAR contract to trigger rotation.

**Issue: "Cannot decrypt old files after key rotation"**
The Shade Agent maintains versioned keys. Ensure the `key_version` in the NOVA file header matches a version available in the TEE. Old versions are retained for backward compatibility.

## Resources

- Nova SDK: https://nova-sdk.com
- Nova Documentation: https://nova-25.gitbook.io/nova-docs/
- Nova GitHub: https://github.com/jcarbonnell/nova
- Nova MCP Server: https://nova-mcp.fastmcp.app/mcp
- Phala Network (TEE): https://phala.network
- Crust Network: https://crust.network
- Crust Wiki: https://wiki.crust.network
