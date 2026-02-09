# Nova Protocol Integration

Nova is YouTick's privacy-first encryption system built on NEAR Protocol. It combines Trusted Execution Environment (TEE) secured key management via Shade Agents on Phala Network with IPFS storage for zero-knowledge encrypted video sharing.

## Overview

Nova replaces the previous Lit Protocol + Crust Network stack with a unified, more efficient solution:

| Feature | Nova |
|---------|------|
| **Encryption** | AES-256-GCM via TEE |
| **Key Management** | Shade Agent (Phala Network) |
| **Storage** | IPFS (Pinata backend) |
| **Access Control** | Group-based (NEAR contract) |
| **Authentication** | NEAR Session Keys |

## Quick Start

### Initialize Nova SDK

```typescript
import { NovaSDK } from 'nova-sdk-js';

const nova = new NovaSDK({
  networkId: 'testnet', // or 'mainnet'
  contractId: 'nova.testnet',
  shadeAgentUrl: 'https://shade.phala.network'
});
```

### Upload Encrypted Video

```typescript
const result = await nova.uploadFile({
  groupId: 'group-video-123',
  file: videoFile,
  metadata: {
    fileName: 'concert.mp4',
    mimeType: 'video/mp4',
    description: 'Live concert recording'
  },
  onProgress: (progress) => console.log(`Upload: ${progress}%`)
});

console.log(`Video CID: ${result.cid}`);
```

### Download and Decrypt

```typescript
const decryptedVideo = await nova.downloadFile({
  groupId: 'group-video-123',
  cid: result.cid,
  accountId: 'viewer.near'
});

// Create playable URL
const videoUrl = URL.createObjectURL(decryptedVideo);
```

## Core Concepts

### Zero-Knowledge Architecture

Nova implements a zero-knowledge design where encryption keys never appear on-chain:

```
What NEAR Contract Knows:
  + Group membership list
  + File CIDs (content identifiers)
  + File metadata (name, size)
  - File contents (encrypted on IPFS)
  - Encryption keys (only in TEE)

What Shade Agent (TEE) Knows:
  + Encryption keys per group
  + Key versions
  - Group membership (queries NEAR)
  - File contents (never sees files)

What IPFS Knows:
  + Encrypted file blobs
  - Decryption keys
  - Access permissions
```

### Shade Agent (TEE)

The Shade Agent is a Trusted Execution Environment service running on Phala Network that:
- Generates and stores encryption keys securely
- Verifies user membership via NEAR smart contract
- Provides keys only to authorized users
- Performs automatic key rotation on member removal

### Group-Based Access Control

Videos are encrypted per-group, not per-user. When a user purchases a ticket:
1. User is added to the video's Nova group
2. User can now request decryption keys from Shade Agent
3. If ticket is transferred or revoked, user is removed from group
4. Key rotation ensures removed users lose access instantly

### Forward Secrecy

When a member is removed from a group:
1. Shade Agent generates a new encryption key
2. Old files remain accessible (key version map)
3. New files use the new key
4. Removed member cannot decrypt new content

## YouTick Integration

### Video Upload Flow

```typescript
// In UploadForm.tsx
const uploadVideo = async (videoFile: File) => {
  // 1. Generate Nova token using Session Key (signless)
  const novaToken = await generateNovaToken(accountId);

  // 2. Create access group for this video
  const groupId = await nova.createGroup({
    name: `video-${videoUuid}`,
    members: [accountId], // Creator is first member
  });

  // 3. Encrypt and upload to IPFS
  const { cid } = await nova.uploadFile({
    groupId,
    file: videoFile,
    metadata: { fileName: videoFile.name }
  });

  // 4. Mint NFT with Nova metadata
  await contract.create_event({
    encrypted_cid: cid,
    nova_group_id: groupId,
    storage_type: 'nova',
    title,
    description,
    price
  });
};
```

### Video Playback Flow

```typescript
// In IpfsPlayer.tsx
const playVideo = async (cid: string, groupId: string) => {
  // 1. Verify NFT ownership (NEAR contract)
  const hasAccess = await verifyTicketOwnership(accountId, cid);
  if (!hasAccess) throw new Error('No ticket');

  // 2. Generate Nova token (signless via Session Key)
  const token = await generateNovaToken(accountId);

  // 3. Download and decrypt from IPFS
  const videoData = await nova.downloadFile({ groupId, cid, accountId });

  // 4. Create blob URL for video player
  const url = URL.createObjectURL(videoData);
  setVideoUrl(url);
};
```

### Ticket Purchase Flow

```typescript
// When user buys a ticket
const purchaseTicket = async (eventCid: string) => {
  // 1. Purchase via NEAR contract
  await contract.buy_ticket({
    receiver_id: buyerAccountId,
    encrypted_cid: eventCid
  });

  // 2. Add buyer to Nova group (contract callback)
  // Automatically handled by smart contract
};
```

## Error Handling

```typescript
import { NovaError, ErrorCode } from 'nova-sdk-js';

try {
  await nova.downloadFile({ groupId, cid, accountId });
} catch (error) {
  if (error instanceof NovaError) {
    switch (error.code) {
      case ErrorCode.UNAUTHORIZED:
        // User doesn't have a ticket
        showPurchasePrompt();
        break;
      case ErrorCode.SHADE_AGENT_ERROR:
        // TEE service unavailable - retry
        await retryWithBackoff(() => nova.downloadFile({ groupId, cid, accountId }));
        break;
      case ErrorCode.IPFS_ERROR:
        // Storage retrieval error - try alternate gateway
        break;
      default:
        console.error('Nova error:', error.message);
    }
  }
}
```

## Environment Configuration

```env
# Nova Protocol
NEXT_PUBLIC_NOVA_NETWORK=testnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova.testnet
NEXT_PUBLIC_NOVA_SHADE_AGENT_URL=https://shade-testnet.phala.network

# IPFS Gateway (fallback)
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
```

## Security Considerations

1. **TEE Trust Model**: Security relies on Phala Network's TEE guarantees
2. **Session Key Security**: 24-hour expiry, V7 keystore storage
3. **Never Cache Keys**: Encryption keys should never persist to disk
4. **Verify Attestation**: Always verify TEE attestation for critical operations
5. **Client-Side Encryption**: All encryption/decryption happens in browser

## Related Documentation

- [Nova Architecture](./architecture/nova-protocol.md) - Detailed system design
- [Shade Agent](./architecture/shade-agent.md) - TEE key management
- [Nova SDK Guide](./guides/nova-sdk.md) - Complete SDK reference
- [Session Keys](./architecture/session-keys.md) - Authentication flow
