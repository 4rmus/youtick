# Nova JavaScript/TypeScript SDK Reference

Complete API reference for `nova-sdk-js`.

## Installation

```bash
npm install nova-sdk-js
# or
yarn add nova-sdk-js
# or
pnpm add nova-sdk-js
```

## Initialization

### NovaSDK Constructor

```typescript
import { NovaSDK } from 'nova-sdk-js';

interface NovaConfig {
  networkId: 'testnet' | 'mainnet';
  contractId: string;
  shadeAgentUrl: string;
  nearConnection?: NearConnection; // Optional: custom NEAR connection
  ipfsGateway?: string; // Optional: custom IPFS gateway
}

const nova = new NovaSDK({
  networkId: 'testnet',
  contractId: 'nova.testnet',
  shadeAgentUrl: 'https://shade.phala.network'
});
```

### With Custom NEAR Connection

```typescript
import { connect, keyStores } from 'near-api-js';

const keyStore = new keyStores.BrowserLocalStorageKeyStore();
const nearConnection = await connect({
  networkId: 'testnet',
  keyStore,
  nodeUrl: 'https://rpc.testnet.near.org',
  walletUrl: 'https://testnet.mynearwallet.com/'
});

const nova = new NovaSDK({
  networkId: 'testnet',
  contractId: 'nova.testnet',
  shadeAgentUrl: 'https://shade.phala.network',
  nearConnection
});
```

## Group Management

### createGroup

Creates a new sharing group.

```typescript
interface CreateGroupParams {
  name: string;
  members?: string[]; // NEAR account IDs
  metadata?: Record<string, any>;
}

interface CreateGroupResult {
  groupId: string;
  transactionHash: string;
  createdAt: number;
}

const result = await nova.createGroup({
  name: 'Engineering Team',
  members: ['alice.near', 'bob.near'],
  metadata: {
    description: 'Internal documentation sharing',
    department: 'Engineering'
  }
});

console.log(result.groupId); // 'group-abc123'
```

### getGroup

Retrieves group information.

```typescript
interface Group {
  id: string;
  name: string;
  owner: string;
  members: Member[];
  fileCount: number;
  createdAt: number;
  metadata: Record<string, any>;
}

interface Member {
  accountId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: number;
}

const group = await nova.getGroup('group-abc123');
console.log(group.name); // 'Engineering Team'
console.log(group.members.length); // 2
```

### listGroups

Lists all groups for a user.

```typescript
interface ListGroupsParams {
  accountId?: string; // Defaults to connected account
  limit?: number; // Default: 50
  offset?: number; // Default: 0
}

const groups = await nova.listGroups({
  limit: 10,
  offset: 0
});

for (const group of groups) {
  console.log(`${group.name}: ${group.fileCount} files`);
}
```

### deleteGroup

Deletes a group (owner only).

```typescript
await nova.deleteGroup('group-abc123');
// All files become inaccessible
// Members lose access
```

## Member Management

### addMember

Adds a member to a group.

```typescript
interface AddMemberParams {
  groupId: string;
  memberId: string; // NEAR account ID
  role?: 'admin' | 'member'; // Default: 'member'
}

await nova.addMember({
  groupId: 'group-abc123',
  memberId: 'carol.near',
  role: 'member'
});
```

### removeMember

Removes a member from a group. Triggers automatic key rotation.

```typescript
interface RemoveMemberParams {
  groupId: string;
  memberId: string;
}

await nova.removeMember({
  groupId: 'group-abc123',
  memberId: 'bob.near'
});
// Key is automatically rotated
// bob.near can no longer decrypt files
```

### updateMemberRole

Updates a member's role.

```typescript
await nova.updateMemberRole({
  groupId: 'group-abc123',
  memberId: 'carol.near',
  newRole: 'admin'
});
```

### verifyMembership

Checks if an account is a member of a group.

```typescript
interface VerifyMembershipParams {
  groupId: string;
  accountId: string;
}

const isMember = await nova.verifyMembership({
  groupId: 'group-abc123',
  accountId: 'alice.near'
});

if (isMember) {
  // User can access group files
}
```

### getGroupMembers

Lists all members of a group.

```typescript
const members = await nova.getGroupMembers('group-abc123');

for (const member of members) {
  console.log(`${member.accountId} (${member.role})`);
}
```

## File Operations

### uploadFile

Uploads and encrypts a file to a group.

```typescript
interface UploadFileParams {
  groupId: string;
  file: File | Blob | Buffer;
  metadata?: {
    fileName?: string;
    mimeType?: string;
    description?: string;
    [key: string]: any;
  };
  onProgress?: (progress: number) => void;
}

interface UploadResult {
  cid: string; // IPFS Content Identifier
  encryptedSize: number;
  transactionHash: string;
  uploadedAt: number;
}

// Browser environment
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

const result = await nova.uploadFile({
  groupId: 'group-abc123',
  file,
  metadata: {
    fileName: file.name,
    mimeType: file.type,
    description: 'Q4 Financial Report'
  },
  onProgress: (progress) => {
    console.log(`Upload: ${progress}%`);
  }
});

console.log(`File uploaded: ${result.cid}`);
```

### downloadFile

Downloads and decrypts a file.

```typescript
interface DownloadFileParams {
  groupId: string;
  cid: string;
  accountId?: string; // Defaults to connected account
}

const decryptedFile = await nova.downloadFile({
  groupId: 'group-abc123',
  cid: 'QmXyz...'
});

// decryptedFile is a Blob
const text = await decryptedFile.text();
// or
const arrayBuffer = await decryptedFile.arrayBuffer();
// or
const url = URL.createObjectURL(decryptedFile);
```

### listGroupFiles

Lists all files in a group.

```typescript
interface FileInfo {
  cid: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: number;
  metadata: Record<string, any>;
}

interface ListFilesParams {
  groupId: string;
  limit?: number;
  offset?: number;
  sortBy?: 'uploadedAt' | 'fileName' | 'size';
  sortOrder?: 'asc' | 'desc';
}

const files = await nova.listGroupFiles({
  groupId: 'group-abc123',
  limit: 20,
  sortBy: 'uploadedAt',
  sortOrder: 'desc'
});

for (const file of files) {
  console.log(`${file.fileName} (${file.size} bytes) - ${file.cid}`);
}
```

### deleteFile

Removes a file from the group registry.

```typescript
await nova.deleteFile({
  groupId: 'group-abc123',
  cid: 'QmXyz...'
});
// File is removed from registry
// IPFS content may still exist but is inaccessible without key
```

### getFileInfo

Gets metadata for a specific file.

```typescript
const fileInfo = await nova.getFileInfo({
  groupId: 'group-abc123',
  cid: 'QmXyz...'
});

console.log(fileInfo.fileName);
console.log(fileInfo.uploadedBy);
console.log(fileInfo.uploadedAt);
```

## Key Management

### rotateGroupKey

Manually triggers key rotation for a group.

```typescript
await nova.rotateGroupKey('group-abc123');
// New key is generated
// All members receive new key
// Previously encrypted files are re-encrypted
```

### getKeyStatus

Checks the current key status for a group.

```typescript
interface KeyStatus {
  keyVersion: number;
  lastRotated: number;
  rotationReason?: string;
}

const status = await nova.getKeyStatus('group-abc123');
console.log(`Key version: ${status.keyVersion}`);
console.log(`Last rotated: ${new Date(status.lastRotated)}`);
```

## Transaction History

### getGroupHistory

Retrieves transaction history for a group.

```typescript
interface Transaction {
  id: string;
  type: 'GROUP_CREATED' | 'MEMBER_ADDED' | 'MEMBER_REMOVED' |
        'FILE_UPLOADED' | 'FILE_DELETED' | 'KEY_ROTATED' |
        'ROLE_CHANGED' | 'GROUP_DELETED';
  actor: string; // NEAR account ID
  target?: string; // Affected account or file CID
  timestamp: number;
  transactionHash: string;
  metadata?: Record<string, any>;
}

interface HistoryParams {
  groupId: string;
  limit?: number;
  offset?: number;
  types?: Transaction['type'][];
  startDate?: number;
  endDate?: number;
}

const history = await nova.getGroupHistory({
  groupId: 'group-abc123',
  limit: 50,
  types: ['FILE_UPLOADED', 'MEMBER_ADDED']
});

for (const tx of history.transactions) {
  console.log(`${tx.type}: ${tx.actor} at ${new Date(tx.timestamp)}`);
}
```

## Error Handling

### Error Types

```typescript
import { NovaError, ErrorCode } from 'nova-sdk-js';

try {
  await nova.downloadFile({ groupId, cid });
} catch (error) {
  if (error instanceof NovaError) {
    switch (error.code) {
      case ErrorCode.UNAUTHORIZED:
        // User is not a member of the group
        break;
      case ErrorCode.GROUP_NOT_FOUND:
        // Group does not exist
        break;
      case ErrorCode.FILE_NOT_FOUND:
        // File CID not found in group
        break;
      case ErrorCode.SHADE_AGENT_ERROR:
        // Key management service unavailable
        break;
      case ErrorCode.IPFS_ERROR:
        // IPFS storage/retrieval error
        break;
      case ErrorCode.NEAR_ERROR:
        // NEAR blockchain interaction error
        break;
      case ErrorCode.ENCRYPTION_ERROR:
        // Encryption/decryption failed
        break;
      case ErrorCode.RATE_LIMIT:
        // Too many requests
        break;
      default:
        // Unknown error
    }
  }
  throw error;
}
```

### Error Properties

```typescript
interface NovaError extends Error {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
  retryable: boolean;
  originalError?: Error;
}
```

## Events

### Event Listeners

```typescript
// Listen for real-time events
nova.on('memberAdded', (event) => {
  console.log(`${event.memberId} joined ${event.groupId}`);
});

nova.on('memberRemoved', (event) => {
  console.log(`${event.memberId} left ${event.groupId}`);
});

nova.on('fileUploaded', (event) => {
  console.log(`New file: ${event.fileName} (${event.cid})`);
});

nova.on('keyRotated', (event) => {
  console.log(`Key rotated for ${event.groupId}`);
});

// Remove listener
nova.off('memberAdded', handler);

// Remove all listeners
nova.removeAllListeners();
```

## Utilities

### validateAccountId

Validates a NEAR account ID format.

```typescript
import { validateAccountId } from 'nova-sdk-js';

const isValid = validateAccountId('alice.near'); // true
const isInvalid = validateAccountId('invalid account'); // false
```

### formatFileSize

Formats file size for display.

```typescript
import { formatFileSize } from 'nova-sdk-js';

formatFileSize(1024); // '1 KB'
formatFileSize(1048576); // '1 MB'
formatFileSize(1073741824); // '1 GB'
```

### estimateUploadCost

Estimates NEAR storage cost for an upload.

```typescript
const cost = await nova.estimateUploadCost({
  fileSize: 1048576, // 1 MB
  metadataSize: 256
});

console.log(`Estimated cost: ${cost.near} NEAR`);
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type {
  NovaSDK,
  NovaConfig,
  Group,
  Member,
  FileInfo,
  Transaction,
  CreateGroupParams,
  CreateGroupResult,
  UploadFileParams,
  UploadResult,
  NovaError,
  ErrorCode
} from 'nova-sdk-js';
```

## Browser vs Node.js

### Browser

```typescript
// Use File API
const file = new File(['content'], 'file.txt', { type: 'text/plain' });
await nova.uploadFile({ groupId, file });
```

### Node.js

```typescript
import { readFileSync } from 'fs';

// Use Buffer
const buffer = readFileSync('./file.txt');
await nova.uploadFile({
  groupId,
  file: buffer,
  metadata: { fileName: 'file.txt', mimeType: 'text/plain' }
});
```

## Best Practices

1. **Error Handling**: Always wrap operations in try-catch
2. **Progress Tracking**: Use onProgress for large files
3. **Batch Operations**: Use Promise.all for multiple uploads
4. **Connection Reuse**: Create one NovaSDK instance per app
5. **Key Rotation**: Handle key rotation events gracefully
6. **Offline Support**: Cache group/file metadata locally
