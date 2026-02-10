# Nova Tutorials

Step-by-step guides for common Nova use cases.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Encrypted File Sharing Workflow](#encrypted-file-sharing-workflow)
3. [Token Claim and Encryption Deep Dive](#token-claim-and-encryption-deep-dive)
4. [Team Management with NEAR Protocol](#team-management-with-near-protocol)
5. [Secure Member Offboarding](#secure-member-offboarding)
6. [MCP Server Integration](#mcp-server-integration)

---

## Getting Started

### Prerequisites

- Node.js 18+
- NEAR testnet account
- Nova API key

### Step 1: Create a NEAR Testnet Account

```bash
# Install NEAR CLI
npm install -g near-cli

# Create a testnet account
near create-account your-name.nova-sdk-6.testnet --useFaucet
```

### Step 2: Install Nova SDK

```bash
npm install nova-sdk-js
```

### Step 3: Initialize the SDK

```typescript
import { NovaSdk } from 'nova-sdk-js';

const sdk = new NovaSdk('your-name.nova-sdk-6.testnet', {
  apiKey: process.env.NOVA_API_KEY,
  rpcUrl: 'https://rpc.testnet.near.org',
  contractId: 'nova-sdk-6.testnet',
});

console.log('Nova SDK initialized!');
```

### Step 4: Register Your First Group

```typescript
await sdk.registerGroup('my-first-group');
console.log('Group registered on NEAR contract');
// This also triggers key generation in the Shade Agent TEE
```

### Step 5: Upload a Test File

```typescript
import fs from 'fs';

const content = Buffer.from('Hello, Nova!');
const result = await sdk.upload('my-first-group', content, 'hello.txt');

console.log('IPFS CID:', result.cid);
console.log('Transaction ID:', result.trans_id);
console.log('File Hash:', result.file_hash);
```

### Step 6: Retrieve and Verify

```typescript
const { data } = await sdk.retrieve('my-first-group', result.cid);
console.log('Retrieved:', data.toString());
// Output: "Hello, Nova!"
```

---

## Encrypted File Sharing Workflow

### Scenario

Share encrypted files with a team, add/remove members, and verify access control.

### Step 1: Register a Group and Add Members

```typescript
import { NovaSdk } from 'nova-sdk-js';
import fs from 'fs';

const sdk = new NovaSdk('alice.nova-sdk-6.testnet', {
  apiKey: process.env.NOVA_API_KEY,
  rpcUrl: 'https://rpc.testnet.near.org',
  contractId: 'nova-sdk-6.testnet',
});

// Register a group (~0.05-0.1 NEAR)
await sdk.registerGroup('engineering-docs');

// Add team members (~0.001 NEAR each)
await sdk.addGroupMember('engineering-docs', 'bob.nova-sdk-6.testnet');
await sdk.addGroupMember('engineering-docs', 'carol.nova-sdk-6.testnet');
```

### Step 2: Upload Encrypted Files

```typescript
// Upload architecture document
const archDoc = fs.readFileSync('./architecture.pdf');
const archResult = await sdk.upload(
  'engineering-docs',
  archDoc,
  'architecture.pdf'
);
console.log('Architecture doc CID:', archResult.cid);

// Upload API specification
const apiSpec = fs.readFileSync('./api-spec.yaml');
const apiResult = await sdk.upload(
  'engineering-docs',
  apiSpec,
  'api-spec.yaml'
);
console.log('API spec CID:', apiResult.cid);
```

### Step 3: Verify Authorization

```typescript
// Check who can access the files
const aliceAuth = await sdk.isAuthorized(
  'engineering-docs',
  'alice.nova-sdk-6.testnet'
);
const bobAuth = await sdk.isAuthorized(
  'engineering-docs',
  'bob.nova-sdk-6.testnet'
);
const daveAuth = await sdk.isAuthorized(
  'engineering-docs',
  'dave.nova-sdk-6.testnet'
);

console.log('Alice authorized:', aliceAuth);  // true (owner)
console.log('Bob authorized:', bobAuth);      // true (member)
console.log('Dave authorized:', daveAuth);    // false (not a member)
```

### Step 4: Retrieve and Decrypt

```typescript
// Any authorized member can retrieve
const { data } = await sdk.retrieve('engineering-docs', archResult.cid);
fs.writeFileSync('./downloaded-architecture.pdf', data);
console.log('File decrypted and saved');
```

### Step 5: Check Group Info

```typescript
const owner = await sdk.getGroupOwner('engineering-docs');
const checksum = await sdk.getGroupChecksum('engineering-docs');
const transactions = await sdk.getTransactionsForGroup('engineering-docs');

console.log('Owner:', owner);
console.log('Current checksum:', checksum);
console.log('Total transactions:', transactions.length);
```

---

## Token Claim and Encryption Deep Dive

### Understanding the Token Claim Flow

The token claim flow is the central mechanism that securely bridges the NEAR blockchain and the Shade Agent TEE. Here's how it works end-to-end.

### How Encryption Keys are Obtained

When you call `sdk.upload()` or `sdk.retrieve()`, the SDK internally performs the token claim flow:

```
1. SDK generates a payload:
   { group_id: "engineering-docs",
     user_id: "alice.nova-sdk-6.testnet",
     nonce: "<random-unique-value>",
     timestamp: 1704067200000 }

2. SDK signs the payload:
   signature = ed25519_sign(SHA256(payload), private_key)

3. SDK calls claim_token() on the NEAR contract:
   The contract verifies:
   - ed25519 signature is valid
   - Nonce has never been used before
   - Timestamp is within 5-minute window
   - User is a member of the group

4. Contract returns a token

5. SDK presents the token to the Shade Agent TEE

6. TEE verifies the token and returns the encryption key

7. SDK uses the key for encryption (upload) or decryption (retrieve)
```

### Using Encryption Functions Directly

You can use the encryption functions independently:

```typescript
import { encryptData, decryptData, computeHash } from 'nova-sdk-js';

// Encrypt data with a known key
const plaintext = Buffer.from('Sensitive information');
const keyB64 = 'base64-encoded-32-byte-key'; // Obtain from Shade Agent

// Encrypt (AES-256-GCM)
const encrypted = await encryptData(plaintext, keyB64);
console.log('Encrypted (base64):', encrypted);

// Decrypt
const decrypted = await decryptData(encrypted, keyB64);
console.log('Decrypted:', decrypted.toString());
// Output: "Sensitive information"

// Compute hash for integrity verification
const hash = computeHash(plaintext);
console.log('SHA-256 hash:', hash);
```

### Upload Flow in Detail

When you call `sdk.upload()`, this is what happens internally:

```typescript
// What sdk.upload('engineering-docs', fileData, 'report.pdf') does:

// 1. prepare_upload -> Shade Agent TEE returns encryption key
// 2. encryptData(fileData, key) -> AES-256-GCM encryption locally
// 3. computeHash(fileData) -> SHA-256 hash of plaintext
// 4. finalize_upload(encryptedData) -> Shade Agent stores to IPFS
// 5. Transaction recorded on NEAR contract
// 6. Returns { cid, trans_id, file_hash }
```

### Retrieve Flow in Detail

When you call `sdk.retrieve()`:

```typescript
// What sdk.retrieve('engineering-docs', cid) does:

// 1. Validate CID format (Qm* or bafy*)
// 2. prepare_retrieve -> Shade Agent fetches from IPFS
// 3. TEE returns encryption key + encrypted data
// 4. decryptData(encryptedData, key) -> AES-256-GCM decryption locally
// 5. Returns { data, ipfs_hash, group_id }
```

### Security Guarantee

The critical security property is that **plaintext data and encryption keys never travel together**:
- During upload: the SDK gets the key first, encrypts locally, then sends only ciphertext
- During retrieve: the TEE sends the key and encrypted data, but decryption happens locally
- The Shade Agent never sees the plaintext content

---

## Team Management with NEAR Protocol

### Scenario

Set up and manage a team with secure document sharing on NEAR Protocol.

### Complete Team Setup

```typescript
import { NovaSdk } from 'nova-sdk-js';

const sdk = new NovaSdk('team-lead.nova-sdk-6.testnet', {
  apiKey: process.env.NOVA_API_KEY,
  rpcUrl: 'https://rpc.testnet.near.org',
  contractId: 'nova-sdk-6.testnet',
});

// Step 1: Register the team group
await sdk.registerGroup('project-alpha');

// Step 2: Add all team members
const members = [
  'developer-1.nova-sdk-6.testnet',
  'developer-2.nova-sdk-6.testnet',
  'designer.nova-sdk-6.testnet',
  'pm.nova-sdk-6.testnet',
];

for (const member of members) {
  await sdk.addGroupMember('project-alpha', member);
  console.log(`Added: ${member}`);
}

// Step 3: Verify everyone has access
for (const member of members) {
  const auth = await sdk.isAuthorized('project-alpha', member);
  console.log(`${member}: ${auth ? 'authorized' : 'NOT authorized'}`);
}

// Step 4: Upload project documents
const files = [
  { path: './prd.pdf', name: 'prd.pdf' },
  { path: './design-specs.pdf', name: 'design-specs.pdf' },
  { path: './api-docs.md', name: 'api-docs.md' },
];

const uploadResults = [];
for (const file of files) {
  const data = require('fs').readFileSync(file.path);
  const result = await sdk.upload('project-alpha', data, file.name);
  uploadResults.push({ ...file, cid: result.cid });
  console.log(`Uploaded ${file.name}: ${result.cid}`);
}

// Step 5: Check the audit trail
const transactions = await sdk.getTransactionsForGroup('project-alpha');
console.log(`Total transactions: ${transactions.length}`);
```

### NEAR Protocol Integration Points

Nova interacts with NEAR at these points:

| SDK Method | NEAR Contract Function | Cost |
|-----------|----------------------|------|
| `registerGroup()` | Creates group on-chain | ~0.05-0.1 NEAR |
| `addGroupMember()` | Adds member to group | ~0.001 NEAR |
| `revokeGroupMember()` | Revokes member + key rotation | ~0.001 NEAR |
| `isAuthorized()` | View: checks membership | Free |
| `getGroupOwner()` | View: returns owner | Free |
| `getGroupChecksum()` | View: returns TEE checksum | Free |
| `getTransactionsForGroup()` | View: returns audit trail | Free |
| `upload()` | Records transaction on-chain | ~0.01 NEAR |
| `retrieve()` | Token claim via `claim_token()` | Gas only |

### Events on NEAR

The contract emits events consumable by indexers:
- `NovaEvent::Registered` - New group or member
- `NovaEvent::Revoked` - Member revoked
- `NovaEvent::FeeCollected` - Fee collected

---

## Secure Member Offboarding

### Scenario

Remove a team member while ensuring they lose access to all shared files.

### Step 1: Identify the Member's Groups

```typescript
// In a real application, you'd query all groups to find
// which ones the departing member belongs to

const groupsToCheck = ['project-alpha', 'engineering-docs', 'design-team'];
const departingMember = 'contractor.nova-sdk-6.testnet';

const memberGroups = [];
for (const groupId of groupsToCheck) {
  const authorized = await sdk.isAuthorized(groupId, departingMember);
  if (authorized) {
    memberGroups.push(groupId);
  }
}

console.log(`${departingMember} is in ${memberGroups.length} groups`);
```

### Step 2: Revoke from All Groups

```typescript
for (const groupId of memberGroups) {
  try {
    await sdk.revokeGroupMember(groupId, departingMember);
    console.log(`Revoked from ${groupId} (key rotation triggered)`);
  } catch (error) {
    console.error(`Failed to revoke from ${groupId}:`, error);
  }
}
```

**What happens on revocation:**
1. Member is removed from the group on the NEAR contract
2. `NovaEvent::Revoked` is emitted
3. Shade Agent TEE automatically rotates the encryption key
4. New checksum is recorded on-chain via `update_checksum()`
5. Revoked member can no longer call `claim_token()` for this group
6. New uploads use the new key; existing encrypted files remain on IPFS

### Step 3: Verify Removal

```typescript
for (const groupId of memberGroups) {
  const stillAuthorized = await sdk.isAuthorized(groupId, departingMember);
  if (stillAuthorized) {
    console.error(`WARNING: ${departingMember} still has access to ${groupId}`);
  } else {
    console.log(`Verified: ${departingMember} removed from ${groupId}`);
  }
}
```

### Step 4: Audit the Changes

```typescript
for (const groupId of memberGroups) {
  const transactions = await sdk.getTransactionsForGroup(groupId);
  console.log(`\n${groupId} transactions:`);
  for (const tx of transactions) {
    console.log(`  ${JSON.stringify(tx)}`);
  }

  // Verify checksum was updated (indicates key rotation happened)
  const checksum = await sdk.getGroupChecksum(groupId);
  console.log(`  Current checksum: ${checksum}`);
}
```

---

## MCP Server Integration

### Overview

The Nova MCP Server at `https://nova-mcp.fastmcp.app/mcp` enables AI assistants to interact with Nova through natural language.

### How It Works

The MCP Server is an Auth + Signing Proxy that:
1. Authenticates via JWT session tokens
2. Routes operations to the NEAR contract and Shade Agent
3. Handles encryption server-side using AES-256-CBC
4. Returns results to the AI assistant

### Example Interactions

```
User: "Create a secure group for the legal team"
AI:   [Calls registerGroup('legal-team') via MCP]
      Group 'legal-team' created. You are the owner.

User: "Add alice and bob to the legal team"
AI:   [Calls addGroupMember('legal-team', 'alice.nova-sdk.near')]
      [Calls addGroupMember('legal-team', 'bob.nova-sdk.near')]
      Added alice and bob to the legal-team group.

User: "Upload the contract draft to the legal team group"
AI:   [Calls upload('legal-team', fileData, 'contract-draft.pdf')]
      Contract draft encrypted and uploaded. CID: Qm...

User: "Bob left the company, remove his access"
AI:   [Calls revokeGroupMember('legal-team', 'bob.nova-sdk.near')]
      Bob has been removed. Encryption key automatically rotated.
      Bob can no longer access any files in the legal-team group.
```

### MCP vs SDK Encryption

| Aspect | MCP Server | SDK (Direct) |
|--------|-----------|-------------|
| Algorithm | AES-256-CBC | AES-256-GCM |
| Where encryption happens | Server-side | Client-side |
| Best for | AI assistants | Applications |

For maximum security, use the SDK directly for client-side encryption. The MCP server is ideal for AI assistant integration where convenience is prioritized.

---

## Troubleshooting

### Common Issues

**Authorization errors:**
- Verify the NEAR account ID is correct (including the `.nova-sdk.near` or `.nova-sdk-6.testnet` suffix)
- Check that the member has been added to the group
- Ensure your API key is valid

**Upload/retrieve failures:**
- Verify you are authorized for the group with `isAuthorized()`
- Check that the CID format is valid (`Qm*` or `bafy*`)
- The Shade Agent TEE may be temporarily unavailable; retry after a brief delay

**Token claim failures:**
- Nonces are single-use; each operation requires a fresh nonce
- Tokens expire after 5 minutes; ensure clock synchronization
- Check nonce validity with `get_nonce_validity()` on the contract

**Key rotation delays:**
- Key rotation is triggered automatically on member revocation
- The Shade Agent generates a new key and updates the on-chain checksum
- Verify rotation completed by checking `getGroupChecksum()`

### Getting Help

- Official Documentation: https://nova-25.gitbook.io/nova-docs/
- GitHub Issues: https://github.com/jcarbonnell/nova/issues
- Twitter: https://x.com/nova_sdk
- Telegram: https://t.me/nova_sdk
