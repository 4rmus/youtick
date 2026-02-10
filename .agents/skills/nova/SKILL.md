---
name: nova
description: >
  Privacy-first decentralized file sharing on NEAR Protocol with TEE-secured encryption via
  Shade Agent v2.2 on Phala Cloud, IPFS storage, and on-chain access control. Use when working
  with Nova SDK (nova-sdk-js or nova-sdk-rs), NovaSdk class, encryptData/decryptData/computeHash,
  nova-sdk.near or nova-sdk-6.testnet contracts, token claims, nonce verification, TEE attestation,
  group-based encrypted file access, or Nova MCP server integration at nova-mcp.fastmcp.app.
version: 2.0.0
license: MIT
platforms:
  - claude
  - gemini
  - openai
  - markdown
tags:
  - nova
  - near-protocol
  - ipfs
  - tee-encryption
  - shade-agent
  - phala-cloud
  - privacy
  - file-sharing
  - aes-256-gcm
  - decentralized
  - mcp-server
source: https://github.com/jcarbonnell/nova
metadata:
  author: nova-sdk
  version: "2.0.0"
---

# Nova Skill

Nova is a privacy-first, decentralized file-sharing system built on NEAR Protocol. It combines Trusted Execution Environment (TEE) secured key management via Shade Agent v2.2 on Phala Cloud, IPFS storage (via Pinata), and on-chain access control to provide encrypted file sharing where plaintext and encryption keys never travel together.

## When to Use This Skill

This skill should be triggered when:
- Working with Nova SDK (`nova-sdk-js` or `nova-sdk-rs`)
- Building decentralized file sharing applications on NEAR
- Implementing encrypted group-based file access
- Integrating Nova MCP server with AI assistants
- Working with Shade Agents for TEE-secured key management
- Implementing IPFS-based encrypted storage
- Using `NovaSdk` class, `encryptData`, `decryptData`, `computeHash`
- Interacting with `nova-sdk.near` or `nova-sdk-6.testnet` contracts
- Working with token claims, nonce verification, or TEE attestation

## Quick Reference

### Initialize Nova SDK (JavaScript)

```typescript
import { NovaSdk } from 'nova-sdk-js';

// Mainnet
const sdk = new NovaSdk('alice.nova-sdk.near', {
  apiKey: process.env.NOVA_API_KEY,
});

// Testnet
const sdk = new NovaSdk('alice.nova-sdk-6.testnet', {
  apiKey: process.env.NOVA_API_KEY,
  rpcUrl: 'https://rpc.testnet.near.org',
  contractId: 'nova-sdk-6.testnet',
});
```

### Register a Group

```typescript
// Creates group on NEAR, triggers key generation in Shade Agent TEE
// Cost: ~0.05-0.1 NEAR
await sdk.registerGroup('confidential-docs');
```

### Upload Encrypted File

```typescript
import fs from 'fs';

const fileData = fs.readFileSync('./secret-report.pdf');
const result = await sdk.upload('confidential-docs', fileData, 'secret-report.pdf');

console.log('IPFS CID:', result.cid);
console.log('Transaction ID:', result.trans_id);
console.log('File Hash:', result.file_hash);
```

### Retrieve and Decrypt File

```typescript
const { data } = await sdk.retrieve('confidential-docs', result.cid);
fs.writeFileSync('./decrypted-report.pdf', data);
```

### Manage Group Members

```typescript
// Add a member (~0.001 NEAR)
await sdk.addGroupMember('confidential-docs', 'bob.nova-sdk.near');

// Revoke a member (triggers automatic key rotation) (~0.001 NEAR)
await sdk.revokeGroupMember('confidential-docs', 'bob.nova-sdk.near');
```

### Check Authorization

```typescript
const authorized = await sdk.isAuthorized('confidential-docs', 'bob.nova-sdk.near');
if (authorized) {
  // User can access group files
}
```

### Query Group Info

```typescript
const owner = await sdk.getGroupOwner('confidential-docs');
const checksum = await sdk.getGroupChecksum('confidential-docs');
const transactions = await sdk.getTransactionsForGroup('confidential-docs');
```

### Encryption Functions

```typescript
import { encryptData, decryptData, computeHash } from 'nova-sdk-js';

// AES-256-GCM encryption
const encrypted = await encryptData(plaintext, keyB64);
const decrypted = await decryptData(encrypted, keyB64);

// SHA-256 hashing
const hash = computeHash(data);
```

### Rust SDK

```rust
sdk.register_group("my-secure-files").await?;
sdk.add_group_member("my-secure-files", "bob.nova-sdk.near").await?;
sdk.revoke_group_member("my-secure-files", "bob.nova-sdk.near").await?;
let status = sdk.auth_status("my-secure-files").await?;
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nova System                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────┐     │
│  │  Client  │───▶│  Nova SDK    │───▶│  NEAR Contract    │     │
│  │  (App)   │    │  (JS/Rust)   │    │  nova-sdk.near    │     │
│  └──────────┘    └──────────────┘    └───────────────────┘     │
│       │                │                       │                │
│       │                ▼                       │                │
│       │         ┌──────────────┐               │                │
│       │         │ Shade Agent  │◀──────────────┘                │
│       │         │  v2.2 (TEE)  │  Token verification            │
│       │         │ Phala Cloud  │  + key management               │
│       │         └──────────────┘                                │
│       │                │                                        │
│       │                ▼ Encryption keys                        │
│       │         ┌──────────────┐                                │
│       └────────▶│    IPFS      │  Encrypted file storage        │
│                 │  (Pinata)    │                                │
│                 └──────────────┘                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Token Claim Flow (NEAR <-> TEE Bridge)

The central mechanism for secure key distribution:
1. Client generates payload: `{ group_id, user_id, nonce, timestamp }`
2. Client signs with ed25519 over SHA256(payload)
3. Client calls `claim_token()` on NEAR contract
4. Contract verifies: signature, nonce uniqueness, timestamp (5-min window), membership
5. Returns token -> client presents to Shade Agent -> TEE returns encryption key

### Shade Agent (TEE)

Shade Agent v2.2 is a Next.js app deployed as Docker on Phala Cloud:
- Encrypted SQLite database inside TEE (AES-256-CBC with TEE-derived secret)
- API at `/api/key-management`: `generate_key`, `get_key`, `rotate_key`
- Token verification: ed25519 on SHA256(payload), nonce replay protection, 5-min timestamps
- Automatic key rotation when members are revoked

### Encryption

| Context | Algorithm |
|---------|-----------|
| SDK file encryption | AES-256-GCM (`encryptData` / `decryptData`) |
| Shade Agent key storage | AES-256-CBC (encrypted SQLite) |
| MCP Server operations | AES-256-CBC (server-side) |
| File integrity | SHA-256 (`computeHash`) |
| Token signatures | ed25519 |

**Critical invariant:** Plaintext and encryption keys never travel together.

### Upload/Retrieve Flows

- **Upload:** `prepare_upload` -> TEE key -> encrypt locally (AES-256-GCM) -> `finalize_upload` -> IPFS + NEAR -> `{ cid, trans_id, file_hash }`
- **Retrieve:** validate CID -> `prepare_retrieve` -> TEE key + encrypted data -> decrypt locally (AES-256-GCM) -> `{ data, ipfs_hash, group_id }`

### NEAR Protocol Integration

- Contracts: `nova-sdk.near` (mainnet), `nova-sdk-6.testnet` (testnet)
- On-chain: group registry, member auth, token claims, TEE worker management, nonce tracking
- Off-chain (TEE): key generation, storage, rotation, distribution
- Events: `NovaEvent::Registered`, `NovaEvent::Revoked`, `NovaEvent::FeeCollected`

## MCP Server

Nova provides a public MCP server for AI assistant integration:

- **URL:** `https://nova-mcp.fastmcp.app/mcp`
- **Role:** Auth + Signing Proxy with JWT session tokens
- **Encryption:** AES-256-CBC (server-side, differs from SDK's AES-256-GCM)
- **Supports:** Group management, member management, file upload/retrieve, queries

## Transaction Costs

| Operation | Cost |
|-----------|------|
| Register group | ~0.05-0.1 NEAR |
| Add member | ~0.001 NEAR |
| Revoke member | ~0.001 NEAR |
| Upload file | ~0.01 NEAR |
| View functions | Free |

## Reference Files

This skill includes comprehensive documentation in `references/`:

- **index.md** - Overview and navigation guide
- **sdk-javascript.md** - Complete `NovaSdk` JavaScript/TypeScript SDK reference
- **sdk-rust.md** - Rust SDK documentation
- **smart-contract.md** - NEAR smart contract API (`claim_token`, `approve_shade_code_hash`, etc.)
- **shade-agent.md** - TEE key management details (Shade Agent v2.2)
- **mcp-server.md** - MCP integration guide
- **architecture.md** - System design, data flows, and security model
- **tutorials.md** - Step-by-step implementation guides

## Working with This Skill

### For Beginners
1. Start with `references/tutorials.md` for step-by-step guides
2. Read `references/architecture.md` to understand the system design
3. Set up a testnet environment before working with mainnet

### For SDK Integration
1. Use `references/sdk-javascript.md` for frontend/Node.js applications
2. Use `references/sdk-rust.md` for backend services
3. Key methods: `registerGroup()`, `upload()`, `retrieve()`, `addGroupMember()`, `revokeGroupMember()`

### For TEE and Encryption Understanding
1. Study `references/shade-agent.md` for Shade Agent v2.2 TEE details
2. Read `references/smart-contract.md` for the `claim_token()` mechanism
3. Check `references/architecture.md` for encryption specifications

### For AI Assistant Integration
1. Review `references/mcp-server.md` for the public MCP server
2. Follow `references/tutorials.md` MCP integration section

## Security Considerations

1. **Plaintext/key separation** - Plaintext and encryption keys never travel together
2. **ed25519 signatures** - All token claims are cryptographically signed
3. **Nonce replay protection** - Each token claim requires a unique, single-use nonce
4. **5-minute timestamp windows** - Tokens expire after 5 minutes
5. **TEE code verification** - Only approved code hashes can run in Shade Agent
6. **Checksum verification** - TEE responses verifiable against on-chain state
7. **Automatic key rotation** - Revoking a member triggers immediate key rotation
8. **Use environment variables** for API keys - never hardcode them

## Resources

### Official Links
- Documentation: https://nova-25.gitbook.io/nova-docs/
- GitHub: https://github.com/jcarbonnell/nova
- Website: https://nova-sdk.com
- MCP Server: https://nova-mcp.fastmcp.app/mcp
- Twitter: https://x.com/nova_sdk
- Telegram: https://t.me/nova_sdk

### Related Technologies
- NEAR Protocol: https://near.org
- Phala Network: https://phala.network
- IPFS: https://docs.ipfs.tech
