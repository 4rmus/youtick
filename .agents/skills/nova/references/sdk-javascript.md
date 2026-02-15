# Nova JavaScript/TypeScript SDK Reference

Complete API reference for `nova-sdk-js`.

## Installation

```bash
npm install nova-sdk-js
```

## Initialization

### NovaSdk Constructor

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

**Parameters:**
- First argument: NEAR account ID (string)
- Second argument: Configuration object
  - `apiKey` (required): Nova API key
  - `rpcUrl` (optional): NEAR RPC URL (defaults to mainnet)
  - `contractId` (optional): Nova contract ID (defaults to `nova-sdk.near`)

## Group Management

### registerGroup

Registers a new sharing group on-chain. Sets the caller as owner and first member. Triggers key generation in the Shade Agent TEE.

```typescript
await sdk.registerGroup('confidential-docs');
```

**Parameters:**
- `groupId` (string): Unique group identifier

**Cost:** ~0.05-0.1 NEAR

**Side Effects:**
- Creates the group on the NEAR contract
- Shade Agent generates an encryption key for the group
- Emits `NovaEvent::Registered`

### addGroupMember

Adds a member to an existing group.

```typescript
await sdk.addGroupMember('confidential-docs', 'bob.nova-sdk.near');
```

**Parameters:**
- `groupId` (string): Target group ID
- `memberId` (string): NEAR account ID of the new member

**Cost:** ~0.001 NEAR

### revokeGroupMember

Revokes a member from a group. Automatically triggers key rotation in the Shade Agent TEE, ensuring the revoked member cannot access future uploads.

```typescript
await sdk.revokeGroupMember('confidential-docs', 'bob.nova-sdk.near');
```

**Parameters:**
- `groupId` (string): Target group ID
- `memberId` (string): NEAR account ID to revoke

**Cost:** ~0.001 NEAR

**Side Effects:**
- Removes member from group on-chain
- Triggers automatic key rotation in Shade Agent TEE
- Emits `NovaEvent::Revoked`

### isAuthorized

Checks if an account is authorized to access a group.

```typescript
const authorized = await sdk.isAuthorized('confidential-docs', 'bob.nova-sdk.near');
if (authorized) {
  console.log('User has access');
}
```

**Parameters:**
- `groupId` (string): Target group ID
- `userId` (string): NEAR account ID to check

**Returns:** Boolean indicating authorization status

**Cost:** Free (view function)

### getGroupOwner

Returns the owner account ID for a group.

```typescript
const owner = await sdk.getGroupOwner('confidential-docs');
console.log(`Group owner: ${owner}`);
```

**Parameters:**
- `groupId` (string): Target group ID

**Returns:** Owner's NEAR account ID

**Cost:** Free (view function)

### getGroupChecksum

Returns the current checksum for a group's encryption state. Used to verify Shade Agent TEE responses.

```typescript
const checksum = await sdk.getGroupChecksum('confidential-docs');
console.log(`Checksum: ${checksum}`);
```

**Parameters:**
- `groupId` (string): Target group ID

**Returns:** Checksum string (or null if group doesn't exist)

**Cost:** Free (view function)

### getTransactionsForGroup

Returns the transaction history for a group.

```typescript
const transactions = await sdk.getTransactionsForGroup('confidential-docs');
for (const tx of transactions) {
  console.log(tx);
}
```

**Parameters:**
- `groupId` (string): Target group ID

**Returns:** Array of transaction records

**Cost:** Free (view function)

## File Operations

### upload

Encrypts a file locally and uploads the encrypted data to IPFS. Records the transaction on the NEAR contract.

```typescript
import fs from 'fs';

const fileData = fs.readFileSync('./sensitive-doc.pdf');
const result = await sdk.upload('confidential-docs', fileData, 'sensitive-doc.pdf');

console.log('IPFS CID:', result.cid);
console.log('Transaction ID:', result.trans_id);
console.log('File Hash:', result.file_hash);
```

**Parameters:**
- `groupName` (string): Target group ID
- `data` (Buffer): File data to encrypt and upload
- `fileName` (string): Name of the file

**Returns:**
```typescript
{
  cid: string;       // IPFS Content Identifier
  trans_id: string;  // NEAR transaction ID
  file_hash: string; // SHA-256 hash of the plaintext
}
```

**Upload Flow:**
1. SDK calls `prepare_upload` on Shade Agent TEE
2. TEE returns the encryption key
3. SDK encrypts data locally with AES-256-GCM
4. SDK computes SHA-256 hash of plaintext
5. SDK calls `finalize_upload` with encrypted data
6. Shade Agent stores encrypted data to IPFS
7. Transaction recorded on NEAR contract
8. Returns `{ cid, trans_id, file_hash }`

**Cost:** ~0.01 NEAR

### retrieve

Retrieves and decrypts a file from the group.

```typescript
const { data } = await sdk.retrieve('confidential-docs', result.cid);

// Write to file
fs.writeFileSync('./decrypted-doc.pdf', data);

// Or use the buffer directly
console.log(`Retrieved ${data.length} bytes`);
```

**Parameters:**
- `groupName` (string): Source group ID
- `cid` (string): IPFS Content Identifier (supports `Qm*` and `bafy*` formats)

**Returns:**
```typescript
{
  data: Buffer;       // Decrypted file data
  ipfs_hash: string;  // IPFS hash
  group_id: string;   // Group the file belongs to
}
```

**Retrieve Flow:**
1. SDK validates CID format (`Qm*` or `bafy*`)
2. SDK calls `prepare_retrieve` on Shade Agent TEE
3. TEE returns the encryption key and encrypted data from IPFS
4. SDK decrypts data locally with AES-256-GCM
5. Returns `{ data, ipfs_hash, group_id }`

## Encryption Functions

### encryptData

Encrypts data using AES-256-GCM. Returns base64-encoded ciphertext with the IV prepended.

```typescript
import { encryptData } from 'nova-sdk-js';

const plaintext = Buffer.from('Hello, Nova!');
const keyB64 = '<base64-encoded-32-byte-key>';

const encryptedB64 = await encryptData(plaintext, keyB64);
console.log('Encrypted:', encryptedB64);
```

**Parameters:**
- `data` (Buffer): Plaintext data to encrypt
- `keyB64` (string): Base64-encoded AES-256 key (32 bytes)

**Returns:** Base64-encoded string containing IV + ciphertext + auth tag

### decryptData

Decrypts data that was encrypted with `encryptData`. Extracts the IV and auth tag from the ciphertext.

```typescript
import { decryptData } from 'nova-sdk-js';

const decrypted = await decryptData(encryptedB64, keyB64);
console.log('Decrypted:', decrypted.toString());
```

**Parameters:**
- `encryptedB64` (string): Base64-encoded ciphertext (from `encryptData`)
- `keyB64` (string): Base64-encoded AES-256 key

**Returns:** Buffer containing the decrypted plaintext

### computeHash

Computes a SHA-256 hash of the given data (synchronous).

```typescript
import { computeHash } from 'nova-sdk-js';

const hash = computeHash(Buffer.from('Hello, Nova!'));
console.log('SHA-256:', hash);
```

**Parameters:**
- `data` (Buffer): Data to hash

**Returns:** Hex-encoded SHA-256 hash string

### computeHashAsync

Async version of `computeHash`.

```typescript
import { computeHashAsync } from 'nova-sdk-js';

const hash = await computeHashAsync(Buffer.from('Hello, Nova!'));
```

## Complete Usage Example

```typescript
import { NovaSdk } from 'nova-sdk-js';
import fs from 'fs';

async function main() {
  // 1. Initialize SDK (testnet)
  const sdk = new NovaSdk('alice.nova-sdk-6.testnet', {
    apiKey: process.env.NOVA_API_KEY,
    rpcUrl: 'https://rpc.testnet.near.org',
    contractId: 'nova-sdk-6.testnet',
  });

  // 2. Register a group
  await sdk.registerGroup('project-alpha');

  // 3. Add team members
  await sdk.addGroupMember('project-alpha', 'bob.nova-sdk-6.testnet');
  await sdk.addGroupMember('project-alpha', 'carol.nova-sdk-6.testnet');

  // 4. Verify authorization
  const bobAuthorized = await sdk.isAuthorized(
    'project-alpha',
    'bob.nova-sdk-6.testnet'
  );
  console.log('Bob authorized:', bobAuthorized); // true

  // 5. Upload an encrypted file
  const fileData = fs.readFileSync('./secret-report.pdf');
  const uploadResult = await sdk.upload(
    'project-alpha',
    fileData,
    'secret-report.pdf'
  );
  console.log('Uploaded CID:', uploadResult.cid);
  console.log('File hash:', uploadResult.file_hash);

  // 6. Retrieve and decrypt
  const { data } = await sdk.retrieve('project-alpha', uploadResult.cid);
  fs.writeFileSync('./downloaded-report.pdf', data);

  // 7. Revoke a member (triggers key rotation)
  await sdk.revokeGroupMember('project-alpha', 'carol.nova-sdk-6.testnet');
  // carol can no longer access new uploads

  // 8. Check group info
  const owner = await sdk.getGroupOwner('project-alpha');
  const checksum = await sdk.getGroupChecksum('project-alpha');
  const transactions = await sdk.getTransactionsForGroup('project-alpha');

  console.log('Owner:', owner);
  console.log('Checksum:', checksum);
  console.log('Transactions:', transactions.length);
}

main().catch(console.error);
```

## Encryption Details

| Property | Value |
|----------|-------|
| Algorithm | AES-256-GCM |
| Key size | 256 bits (32 bytes, base64-encoded) |
| IV | Random, prepended to ciphertext |
| Auth tag | 16 bytes, appended to ciphertext |
| Hashing | SHA-256 |
| Signatures | ed25519 |

## Network Configuration

| Network | Account Format | Contract ID | RPC URL |
|---------|---------------|-------------|---------|
| Mainnet | `*.nova-sdk.near` | `nova-sdk.near` | `https://rpc.mainnet.near.org` |
| Testnet | `*.nova-sdk-6.testnet` | `nova-sdk-6.testnet` | `https://rpc.testnet.near.org` |

## Best Practices

1. **Use environment variables** for API keys - never hardcode them
2. **Start on testnet** - verify everything works before moving to mainnet
3. **Handle key rotation gracefully** - revoking a member triggers rotation; existing files remain accessible to authorized members
4. **Verify checksums** - use `getGroupChecksum()` to verify TEE responses
5. **Use fresh nonces** - the token claim system requires unique nonces
6. **Reuse SDK instances** - create one `NovaSdk` instance per application

## Additional Resources

- Official Documentation: https://nova-25.gitbook.io/nova-docs/
- GitHub: https://github.com/jcarbonnell/nova
- Website: https://nova-sdk.com
