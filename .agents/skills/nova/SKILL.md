---
name: nova
description: Nova - Privacy-first decentralized file sharing on NEAR Protocol with TEE-secured encryption, IPFS storage, and on-chain access control
version: 1.0.0
author: Claude Code Skill Generator
source: https://github.com/jcarbonnell/nova
---

# Nova Skill

Nova is a privacy-first, decentralized file-sharing system built on NEAR Protocol. It combines Trusted Execution Environment (TEE) secured key management via Shade Agents on Phala Network, IPFS storage, and on-chain access control to provide zero-knowledge encrypted file sharing.

## When to Use This Skill

This skill should be triggered when:
- Working with Nova SDK (JavaScript/TypeScript or Rust)
- Building decentralized file sharing applications on NEAR
- Implementing encrypted group-based file access
- Integrating Nova MCP server with AI assistants
- Managing NEAR-based access control for files
- Working with Shade Agents for TEE-secured key management
- Implementing IPFS-based encrypted storage
- Debugging Nova smart contracts or SDK issues
- Learning about privacy-preserving file sharing architectures

## Quick Reference

### Initialize Nova SDK (JavaScript)

**Basic SDK Setup:**
```typescript
import { NovaSDK } from 'nova-sdk-js';

const nova = new NovaSDK({
  networkId: 'testnet', // or 'mainnet'
  contractId: 'nova.testnet',
  shadeAgentUrl: 'https://shade.phala.network'
});
```

### Create a New Group

**Group Creation with Members:**
```typescript
const groupId = await nova.createGroup({
  name: 'My Private Group',
  members: [
    'alice.near',
    'bob.near',
    'carol.near'
  ],
  metadata: {
    description: 'Secure document sharing group'
  }
});
console.log(`Group created: ${groupId}`);
```

### Upload Encrypted File

**File Upload Flow:**
```typescript
const file = new File(['Hello Nova!'], 'secret.txt', { type: 'text/plain' });

const uploadResult = await nova.uploadFile({
  groupId: 'group-123',
  file: file,
  metadata: {
    fileName: 'secret.txt',
    mimeType: 'text/plain'
  }
});

console.log(`File CID: ${uploadResult.cid}`);
console.log(`Encrypted with key from Shade Agent`);
```

### Download and Decrypt File

**File Retrieval:**
```typescript
const decryptedFile = await nova.downloadFile({
  groupId: 'group-123',
  cid: 'QmXyz...',
  accountId: 'alice.near'
});

// File is automatically decrypted if user is authorized
const content = await decryptedFile.text();
```

### Manage Group Members

**Add/Remove Members:**
```typescript
// Add a new member
await nova.addMember({
  groupId: 'group-123',
  memberId: 'david.near',
  role: 'member' // or 'admin'
});

// Remove a member (triggers automatic key rotation)
await nova.removeMember({
  groupId: 'group-123',
  memberId: 'bob.near'
});
```

### Check Authorization

**Verify Access Rights:**
```typescript
const isAuthorized = await nova.verifyMembership({
  groupId: 'group-123',
  accountId: 'alice.near'
});

if (isAuthorized) {
  // User can access group files
  const files = await nova.listGroupFiles('group-123');
}
```

### MCP Server Integration

**Claude Desktop Configuration:**
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

### Smart Contract Interaction (Rust)

**Direct Contract Calls:**
```rust
use nova_sdk_rs::{NovaClient, GroupConfig};

let client = NovaClient::new(
    "nova.testnet",
    near_account,
    "https://shade.phala.network"
)?;

// Create group via contract
let group_id = client.create_group(GroupConfig {
    name: "Rust Group".to_string(),
    members: vec!["alice.near".parse()?],
}).await?;
```

### Transaction History

**Query Group Transactions:**
```typescript
const history = await nova.getGroupHistory({
  groupId: 'group-123',
  limit: 50,
  offset: 0
});

for (const tx of history.transactions) {
  console.log(`${tx.type}: ${tx.actor} at ${tx.timestamp}`);
  // Output: "FILE_UPLOAD: alice.near at 2024-01-15T..."
}
```

### Error Handling Pattern

**Comprehensive Error Handling:**
```typescript
try {
  await nova.uploadFile({ groupId, file });
} catch (error) {
  if (error.code === 'UNAUTHORIZED') {
    console.error('Not a member of this group');
  } else if (error.code === 'SHADE_AGENT_ERROR') {
    console.error('Key management service unavailable');
  } else if (error.code === 'IPFS_ERROR') {
    console.error('Storage service error');
  } else {
    throw error;
  }
}
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nova System                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────┐     │
│  │  Client  │───▶│  Nova SDK    │───▶│  NEAR Contract    │     │
│  │  (App)   │    │  (JS/Rust)   │    │  (Access Control) │     │
│  └──────────┘    └──────────────┘    └───────────────────┘     │
│       │                │                       │                │
│       │                ▼                       │                │
│       │         ┌──────────────┐               │                │
│       │         │ Shade Agent  │◀──────────────┘                │
│       │         │   (TEE)      │  Verify membership             │
│       │         │ Key Manager  │                                │
│       │         └──────────────┘                                │
│       │                │                                        │
│       │                ▼ Encryption keys                        │
│       │         ┌──────────────┐                                │
│       └────────▶│    IPFS      │  Encrypted file storage        │
│                 │   Storage    │                                │
│                 └──────────────┘                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Zero-Knowledge Architecture
Nova implements a zero-knowledge design where encryption keys never appear on-chain. The NEAR smart contract only manages group membership and access control, while the Shade Agent (running in a TEE) handles all cryptographic operations.

### Shade Agent
A Trusted Execution Environment (TEE) based service running on Phala Network that:
- Generates and stores encryption keys securely
- Verifies user membership via NEAR contract
- Provides keys only to authorized users
- Performs automatic key rotation on member removal

### Group-Based Access
Files are encrypted per-group, not per-user. All members of a group share the same encryption key, managed by the Shade Agent. This enables efficient multi-party access without key proliferation.

### Forward Secrecy
When a member is removed from a group, the Shade Agent automatically rotates the encryption key. Previously uploaded files remain accessible to remaining members, but new files use the new key.

### IPFS Storage
Files are stored on IPFS after client-side encryption. The CID (Content Identifier) is stored on-chain as part of the group's file registry.

## MCP Server Tools

Nova provides 11+ MCP tools for AI assistant integration:

| Tool | Description |
|------|-------------|
| `nova_create_group` | Create a new sharing group |
| `nova_add_member` | Add member to group |
| `nova_remove_member` | Remove member from group |
| `nova_upload_file` | Upload and encrypt file |
| `nova_download_file` | Download and decrypt file |
| `nova_list_groups` | List user's groups |
| `nova_list_files` | List files in a group |
| `nova_get_group_info` | Get group details |
| `nova_verify_membership` | Check user authorization |
| `nova_get_history` | Get transaction history |
| `nova_rotate_key` | Manually rotate group key |

## Reference Files

This skill includes comprehensive documentation in `references/`:

- **index.md** - Overview and navigation guide
- **sdk-javascript.md** - Complete JavaScript/TypeScript SDK reference
- **sdk-rust.md** - Rust SDK documentation
- **smart-contract.md** - NEAR smart contract API
- **shade-agent.md** - TEE key management details
- **mcp-server.md** - MCP integration guide
- **architecture.md** - System design and security model
- **tutorials.md** - Step-by-step implementation guides

Use `view` to read specific reference files when detailed information is needed.

## Working with This Skill

### For Beginners
1. Start with `references/tutorials.md` for step-by-step guides
2. Read `references/architecture.md` to understand the system design
3. Set up a testnet environment before working with mainnet

### For SDK Integration
1. Use `references/sdk-javascript.md` for frontend/Node.js applications
2. Use `references/sdk-rust.md` for backend services or WASM
3. Check error handling patterns in the quick reference

### For AI Assistant Integration
1. Review `references/mcp-server.md` for tool configuration
2. Set up environment variables correctly
3. Test with simple operations before complex workflows

### For Smart Contract Development
1. Study `references/smart-contract.md` for contract interface
2. Understand the access control model
3. Follow NEAR development best practices

## Security Considerations

1. **Never expose private keys** - Use environment variables or secure key management
2. **Verify group membership** - Always check authorization before sensitive operations
3. **Handle key rotation** - Understand that removing members triggers re-encryption
4. **TEE Trust Model** - Security relies on Phala Network's TEE guarantees
5. **Client-side encryption** - Files are encrypted before leaving the client

## Common Patterns

### Secure File Sharing Workflow
```typescript
// 1. Create a group
const groupId = await nova.createGroup({ name: 'Project X', members: ['alice.near'] });

// 2. Add team members
await nova.addMember({ groupId, memberId: 'bob.near' });

// 3. Upload project files
await nova.uploadFile({ groupId, file: projectDoc });

// 4. Team members can access
const doc = await nova.downloadFile({ groupId, cid, accountId: 'bob.near' });
```

### Membership Management
```typescript
// Offboard a team member securely
await nova.removeMember({ groupId, memberId: 'contractor.near' });
// Key is automatically rotated - contractor loses access

// Verify the removal
const members = await nova.getGroupMembers(groupId);
assert(!members.includes('contractor.near'));
```

## Resources

### Official Links
- GitHub: https://github.com/jcarbonnell/nova
- NEAR Protocol: https://near.org
- Phala Network: https://phala.network

### Related Technologies
- NEAR SDK: https://docs.near.org
- IPFS: https://docs.ipfs.tech
- Phala TEE: https://wiki.phala.network

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
