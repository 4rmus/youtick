# Nova SDK Guide

Complete guide for using the Nova SDK in YouTick for encrypted video operations.

## Installation

```bash
npm install nova-sdk-js
# or
yarn add nova-sdk-js
# or
pnpm add nova-sdk-js
```

## Initialization

### Basic Setup

```typescript
import { NovaSDK } from 'nova-sdk-js';

const nova = new NovaSDK({
  networkId: 'testnet', // or 'mainnet'
  contractId: 'nova.testnet',
  shadeAgentUrl: 'https://shade-testnet.phala.network'
});
```

### With Custom NEAR Connection

```typescript
import { connect, keyStores } from 'near-api-js';
import { NovaSDK } from 'nova-sdk-js';

// Use existing NEAR connection from YouTick
const keyStore = new keyStores.BrowserLocalStorageKeyStore();
const nearConnection = await connect({
  networkId: 'testnet',
  keyStore,
  nodeUrl: 'https://rpc.testnet.near.org'
});

const nova = new NovaSDK({
  networkId: 'testnet',
  contractId: 'nova.testnet',
  shadeAgentUrl: 'https://shade-testnet.phala.network',
  nearConnection
});
```

## Group Management

### Create Video Group

When a creator uploads a video, create an access group:

```typescript
interface CreateGroupParams {
  name: string;
  members?: string[]; // NEAR account IDs
  metadata?: Record<string, any>;
}

const result = await nova.createGroup({
  name: `video-${videoUuid}`,
  members: [creatorAccountId], // Creator is first member
  metadata: {
    videoTitle: 'Concert Recording',
    createdAt: Date.now()
  }
});

console.log(`Group created: ${result.groupId}`);
// Store result.groupId with video metadata
```

### Get Group Info

```typescript
const group = await nova.getGroup(groupId);

console.log(`Name: ${group.name}`);
console.log(`Members: ${group.members.length}`);
console.log(`Files: ${group.fileCount}`);
```

### List User's Groups

```typescript
const groups = await nova.listGroups({
  accountId: viewerAccountId,
  limit: 50
});

for (const group of groups) {
  console.log(`${group.name}: ${group.fileCount} videos`);
}
```

## Member Management

### Add Member (Ticket Purchase)

When a user purchases a ticket:

```typescript
await nova.addMember({
  groupId: videoGroupId,
  memberId: buyerAccountId,
  role: 'member' // 'member' for viewers, 'admin' for moderators
});

// Buyer can now decrypt the video
```

### Remove Member (Ticket Transfer/Revocation)

When a ticket is transferred or revoked:

```typescript
await nova.removeMember({
  groupId: videoGroupId,
  memberId: previousOwnerAccountId
});

// Key is automatically rotated
// Previous owner can no longer decrypt
```

### Check Membership

Before attempting playback:

```typescript
const hasAccess = await nova.verifyMembership({
  groupId: videoGroupId,
  accountId: viewerAccountId
});

if (!hasAccess) {
  // Show purchase prompt
  showPurchaseButton();
}
```

### List Group Members

```typescript
const members = await nova.getGroupMembers(groupId);

for (const member of members) {
  console.log(`${member.accountId} (${member.role})`);
  // Output: "viewer.near (member)"
}
```

## File Operations

### Upload Encrypted Video

```typescript
interface UploadFileParams {
  groupId: string;
  file: File | Blob | Buffer;
  metadata?: {
    fileName?: string;
    mimeType?: string;
    description?: string;
  };
  onProgress?: (progress: number) => void;
}

// In UploadForm.tsx
const handleUpload = async (videoFile: File) => {
  const result = await nova.uploadFile({
    groupId: videoGroupId,
    file: videoFile,
    metadata: {
      fileName: videoFile.name,
      mimeType: videoFile.type,
      description: 'Live concert recording'
    },
    onProgress: (progress) => {
      setUploadProgress(progress);
      console.log(`Upload: ${progress}%`);
    }
  });

  console.log(`Video CID: ${result.cid}`);
  console.log(`Encrypted size: ${result.encryptedSize} bytes`);

  // Store CID in NEAR contract
  await contract.create_event({
    encrypted_cid: result.cid,
    nova_group_id: videoGroupId,
    // ...
  });
};
```

### Download and Decrypt Video

```typescript
// In IpfsPlayer.tsx
const playVideo = async () => {
  const decryptedVideo = await nova.downloadFile({
    groupId: videoGroupId,
    cid: videoCid,
    accountId: viewerAccountId
  });

  // decryptedVideo is a Blob
  const videoUrl = URL.createObjectURL(decryptedVideo);
  videoRef.current.src = videoUrl;

  // Clean up when done
  videoRef.current.onended = () => {
    URL.revokeObjectURL(videoUrl);
  };
};
```

### List Group Videos

```typescript
const videos = await nova.listGroupFiles({
  groupId: videoGroupId,
  limit: 20,
  sortBy: 'uploadedAt',
  sortOrder: 'desc'
});

for (const video of videos) {
  console.log(`${video.fileName} (${video.size} bytes)`);
  console.log(`CID: ${video.cid}`);
  console.log(`Uploaded: ${new Date(video.uploadedAt)}`);
}
```

### Get Video Info

```typescript
const videoInfo = await nova.getFileInfo({
  groupId: videoGroupId,
  cid: videoCid
});

console.log(`Name: ${videoInfo.fileName}`);
console.log(`Type: ${videoInfo.mimeType}`);
console.log(`Uploaded by: ${videoInfo.uploadedBy}`);
```

## Key Management

### Manual Key Rotation

For emergency security rotation:

```typescript
await nova.rotateGroupKey(videoGroupId);
// New key is generated
// All future content uses new key
// Existing members retain access
```

### Check Key Status

```typescript
const status = await nova.getKeyStatus(videoGroupId);

console.log(`Key version: ${status.keyVersion}`);
console.log(`Last rotated: ${new Date(status.lastRotated)}`);
```

## Transaction History

### Get Group Activity

```typescript
const history = await nova.getGroupHistory({
  groupId: videoGroupId,
  limit: 50,
  types: ['MEMBER_ADDED', 'MEMBER_REMOVED', 'FILE_UPLOADED']
});

for (const tx of history.transactions) {
  console.log(`${tx.type}: ${tx.actor} at ${new Date(tx.timestamp)}`);
  // Output: "MEMBER_ADDED: buyer.near at Wed Jan 15 2025"
}
```

## Error Handling

### Error Types

```typescript
import { NovaError, ErrorCode } from 'nova-sdk-js';

try {
  await nova.downloadFile({ groupId, cid, accountId });
} catch (error) {
  if (error instanceof NovaError) {
    switch (error.code) {
      case ErrorCode.UNAUTHORIZED:
        // User doesn't have a ticket
        toast.error('Please purchase a ticket to watch this video');
        showPurchasePrompt();
        break;

      case ErrorCode.GROUP_NOT_FOUND:
        // Video group doesn't exist
        toast.error('Video not found');
        break;

      case ErrorCode.FILE_NOT_FOUND:
        // CID not in group
        toast.error('Video file unavailable');
        break;

      case ErrorCode.SHADE_AGENT_ERROR:
        // TEE service unavailable
        toast.error('Encryption service temporarily unavailable. Retrying...');
        await retryWithBackoff(() => nova.downloadFile({ groupId, cid, accountId }));
        break;

      case ErrorCode.IPFS_ERROR:
        // Storage retrieval error
        toast.error('Unable to load video. Please try again.');
        break;

      case ErrorCode.NEAR_ERROR:
        // NEAR blockchain error
        toast.error('Network error. Please check your connection.');
        break;

      case ErrorCode.RATE_LIMIT:
        // Too many requests
        await sleep(5000);
        return nova.downloadFile({ groupId, cid, accountId });

      default:
        console.error('Nova error:', error.message);
        toast.error('An unexpected error occurred');
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

// Check if error is retryable
if (error.retryable) {
  // Implement retry logic
}
```

## Event Listeners

### Real-time Updates

```typescript
// Listen for membership changes
nova.on('memberAdded', (event) => {
  console.log(`${event.memberId} can now watch ${event.groupId}`);
  // Update UI to show new viewer count
});

nova.on('memberRemoved', (event) => {
  console.log(`${event.memberId} lost access to ${event.groupId}`);
});

nova.on('fileUploaded', (event) => {
  console.log(`New video: ${event.fileName} (${event.cid})`);
  // Notify subscribers
});

nova.on('keyRotated', (event) => {
  console.log(`Security update for ${event.groupId}`);
});

// Clean up on unmount
useEffect(() => {
  return () => {
    nova.removeAllListeners();
  };
}, []);
```

## Utilities

### Validate Account ID

```typescript
import { validateAccountId } from 'nova-sdk-js';

const isValid = validateAccountId('viewer.near'); // true
const isInvalid = validateAccountId('invalid account'); // false
```

### Format File Size

```typescript
import { formatFileSize } from 'nova-sdk-js';

formatFileSize(1024); // '1 KB'
formatFileSize(1048576); // '1 MB'
formatFileSize(1073741824); // '1 GB'
```

### Estimate Upload Cost

```typescript
const cost = await nova.estimateUploadCost({
  fileSize: 10485760, // 10 MB
  metadataSize: 256
});

console.log(`Estimated cost: ${cost.near} NEAR`);
// Use for prepaid balance check
```

## TypeScript Support

Full TypeScript definitions included:

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

## Best Practices

### 1. Error Handling
Always wrap Nova operations in try-catch with proper user feedback.

### 2. Progress Tracking
Use `onProgress` callback for large video uploads.

### 3. Connection Reuse
Create one NovaSDK instance per app, not per component.

### 4. Key Rotation Awareness
Handle `keyRotated` events gracefully in your UI.

### 5. Clean Up Resources
Revoke blob URLs after video playback ends.

### 6. Session Key Integration
Use YouTick's SessionKeyManager for signless operations.

## YouTick Integration Example

Complete integration in a React component:

```typescript
// hooks/useNovaVideo.ts
import { useState, useCallback } from 'react';
import { useNova } from './useNova';
import { useSessionKey } from './useSessionKey';

export function useNovaVideo(groupId: string, cid: string) {
  const nova = useNova();
  const { accountId } = useSessionKey();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const play = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Check membership first
      const hasAccess = await nova.verifyMembership({ groupId, accountId });
      if (!hasAccess) {
        setError('Please purchase a ticket');
        return;
      }

      // Download and decrypt
      const video = await nova.downloadFile({ groupId, cid, accountId });
      const url = URL.createObjectURL(video);
      setVideoUrl(url);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [nova, groupId, cid, accountId]);

  const cleanup = useCallback(() => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
  }, [videoUrl]);

  return { videoUrl, loading, error, play, cleanup };
}
```

## Related Documentation

- [Nova Protocol](../architecture/nova-protocol.md) - System architecture
- [Shade Agent](../architecture/shade-agent.md) - Key management
- [Session Keys](../architecture/session-keys.md) - Authentication
- [User Flows](./user-flows.md) - Complete flow diagrams
