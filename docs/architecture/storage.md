# Decentralized Storage Architecture

> IPFS + Crust Network for Encrypted Video Storage

---

## Overview

YouTick uses IPFS for decentralized video storage with Crust Network for persistent pinning and retrieval. All video content is encrypted client-side via Nova TEE (AES-256-GCM) before upload, ensuring that no storage provider, gateway operator, or third party can access the original content. The encrypted blobs are uploaded to Crust Network's IPFS infrastructure, and the resulting Content Identifier (CID) is stored on the NEAR blockchain as part of the NFT ticket metadata.

This architecture eliminates centralized storage dependencies and guarantees that video content remains tamper-evident, censorship-resistant, and accessible through multiple independent gateways.

---

## Architecture Diagram

```
                        UPLOAD FLOW
                        ===========

┌──────────┐     ┌───────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Client   │────>│   Nova SDK    │────>│  Crust Network  │────>│     NEAR     │
│ (Browser) │     │  (Encrypt)    │     │  (IPFS Pin)     │     │  Blockchain  │
└──────────┘     └───────────────┘     └─────────────────┘     └──────────────┘
     │                   │                       │                      │
     │  Raw video file   │  AES-256-GCM          │  Encrypted blob      │  CID stored
     │                   │  encrypted blob       │  pinned on IPFS      │  in NFT metadata
     │                   │                       │                      │


                       RETRIEVAL FLOW
                       ==============

┌──────────┐     ┌─────────────────────────────────────┐     ┌───────────────┐
│  Client   │────>│         Multi-Gateway Failover       │────>│   Nova SDK    │
│ (Browser) │     │                                      │     │  (Decrypt)    │
└──────────┘     │  1. crustipfs.xyz (Crust API, POST)  │     └───────────────┘
                 │  2. ipfs.io        (IPFS Foundation)  │            │
                 │  3. dweb.link      (IPFS Foundation)  │            │
                 │  4. trustless-gateway.link             │     Decrypted video
                 │  5. 4everland.io                      │     streamed to player
                 │  6. gateway.lighthouse.storage         │
                 │  7. w3s.link                          │
                 └─────────────────────────────────────┘
```

---

## Storage Flow

### Step 1: Client-Side Encryption

Video is encrypted in the browser using Nova SDK before leaving the client device.

```
Raw Video (MP4/WebM)
       │
       ▼
┌──────────────────────┐
│  Nova SDK (Browser)  │
│                      │
│  1. Request group    │
│     encryption key   │
│     from Shade Agent │
│     (TEE)            │
│                      │
│  2. Encrypt video    │
│     with AES-256-GCM │
│                      │
│  3. Prepend NOVA     │
│     file header      │
│     (32 bytes)       │
│                      │
│  4. Append GCM       │
│     auth tag         │
│     (16 bytes)       │
└──────────────────────┘
       │
       ▼
Encrypted Blob (NOVA format)
```

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key management**: Keys exist only inside the Shade Agent TEE
- **Zero knowledge**: The client never sees raw encryption keys

### Step 2: Upload to Crust Network (IPFS)

The encrypted blob is uploaded to Crust Network's IPFS endpoint using W3Auth authentication derived from the user's NEAR Session Key.

```
Encrypted Blob
       │
       ▼
┌──────────────────────────────┐
│  Crust IPFS Upload           │
│                              │
│  Endpoint: crustipfs.xyz     │
│            /api/v0/add       │
│                              │
│  Auth: W3Auth (NEAR sig)     │
│                              │
│  Response: { Hash, Size }    │
└──────────────────────────────┘
       │
       ▼
CID (e.g. QmX7b...3kF)
```

- **Authentication**: W3Auth token generated from NEAR Session Key (signless)
- **W3Auth format**: `Basic base64("near-{pubkey}:{signature_hex}")`
- **Result**: IPFS Content Identifier (CID) returned on success

### Step 3: CID Stored on NEAR Blockchain

The CID is stored on-chain as part of the event/ticket NFT metadata via the smart contract.

```typescript
// Contract stores encrypted CID reference
create_event({
  encrypted_cid: "QmX7b...3kF",    // IPFS CID
  nova_group_id: "group-abc123",     // Nova access group
  title: "My Video",
  description: "Description",
  price: "1000000000000000000000000"  // 1 NEAR
});
```

- **Immutable reference**: CID is content-addressed and tamper-evident
- **On-chain record**: Blockchain provides permanent, verifiable storage reference

### Step 4: Multi-Gateway Retrieval

Content is retrieved through a failover chain. Crust API is tried first (fastest for Crust-pinned content), followed by public IPFS gateways.

```
Retrieval Request (CID)
       │
       ▼
┌──────────────────────────────┐
│  Gateway Failover            │
│                              │
│  Priority 1: Crust API      │
│    POST crustipfs.xyz        │
│    /api/v0/cat?arg={CID}     │
│                              │
│  Priority 2: Crust Fallback  │
│    POST gw.crustfiles.app    │
│    /api/v0/cat?arg={CID}     │
│                              │
│  Priority 3-7: Public IPFS   │
│    GET ipfs.io/ipfs/{CID}    │
│    GET dweb.link/ipfs/{CID}  │
│    GET trustless-gateway...   │
│    GET 4everland.io/ipfs/... │
│    GET w3s.link/ipfs/{CID}   │
└──────────────────────────────┘
       │
       ▼
Encrypted Blob → Nova SDK → Decrypted Video
```

- **Crust API** (POST): Fastest, no propagation delay, CORS-compatible
- **Public gateways** (GET): Fallback with automatic health tracking
- **Unhealthy gateways**: Temporarily disabled for 5 minutes, then retried

---

## Crust Network Integration

### W3Auth Authentication

Crust Network supports multi-chain authentication through W3Auth. YouTick uses NEAR Session Keys to generate W3Auth tokens, enabling signless IPFS uploads without wallet popups.

```typescript
import { generateW3AuthToken } from '@/lib/crust/w3auth';

// Generate W3Auth token from NEAR Session Key
const authToken = await generateW3AuthToken(accountId);

// Token format: Basic base64("near-{pubkey}:{signature_hex}")
// - pubkey: ed25519 public key (no prefix)
// - signature: sign(pubkey) with Session Key

// Use token for Crust API calls
const response = await fetch('https://crustipfs.xyz/api/v0/add', {
  method: 'POST',
  headers: {
    'Authorization': authToken.header,
  },
  body: formData,
});

const result = await response.json();
// result.Hash → IPFS CID
// result.Size → file size in bytes
```

### Storage Orders for Persistent Pinning

After uploading to Crust IPFS, a storage order can be placed through the IPFS Pinning Service API (PSA) to ensure long-term persistence with economic incentives for Crust storage nodes.

```typescript
import { placeStorageOrder } from '@/lib/crust/storage-order';

// Place on-chain storage order (uses W3Auth)
const orderResult = await placeStorageOrder(cid, fileSize, accountId);

// orderResult.status: 'queued' | 'pinning' | 'pinned' | 'failed'
// orderResult.requestId: PSA request identifier
```

- **PSA endpoint**: `https://pin.crustcode.com/psa/pins`
- **Authentication**: Same W3Auth token (NEAR Session Key)
- **Non-blocking**: Storage order failures do not block the upload flow

### Cross-Chain Storage Guarantees

Crust Network provides storage guarantees through its Polkadot-based blockchain. Files uploaded via the IPFS gateway are pinned by Crust storage nodes, and on-chain storage orders create economic incentives for long-term persistence and replication across the network.

---

## IPFS Gateway Failover

### Upload Path

| Priority | Endpoint | Method | Purpose |
|----------|----------|--------|---------|
| Primary | `crustipfs.xyz/api/v0/add` | POST | Crust IPFS upload with W3Auth |

### Retrieval Path

| Priority | Gateway | Method | Notes |
|----------|---------|--------|-------|
| 1 | `crustipfs.xyz/api/v0/cat` | POST | Fastest for Crust-pinned content |
| 2 | `gw.crustfiles.app/api/v0/cat` | POST | Crust fallback endpoint |
| 3 | `ipfs.io/ipfs/{CID}` | GET | IPFS Foundation, reliable |
| 4 | `dweb.link/ipfs/{CID}` | GET | IPFS Foundation, CORS-friendly |
| 5 | `trustless-gateway.link/ipfs/{CID}` | GET | IPFS Foundation |
| 6 | `4everland.io/ipfs/{CID}` | GET | Third-party, CORS-friendly |
| 7 | `gateway.lighthouse.storage/ipfs/{CID}` | GET | Third-party |
| 8 | `w3s.link/ipfs/{CID}` | GET | Web3.Storage |

### Failover Code Example

```typescript
import { fetchFromGateways } from '@/lib/crust/gateway';

// Automatic failover: Crust API first, then public gateways
try {
  const response = await fetchFromGateways(cid, { timeout: 30000 });
  const encryptedBlob = await response.blob();

  // Pass encrypted blob to Nova SDK for decryption
  // (only group members with valid tickets can decrypt)
} catch (error) {
  // All gateways failed
  console.error('Content unavailable:', error.message);
}
```

### Gateway Health Management

- **Healthy by default**: All gateways start as healthy
- **Automatic marking**: Failed gateways are marked unhealthy for 5 minutes
- **Auto-recovery**: Unhealthy gateways are retried after the cooldown period
- **Full reset**: If all gateways are unhealthy, all are reset and retried

---

## Encrypted File Structure (Nova Format)

All video files stored on IPFS use the Nova encrypted file format:

```
┌─────────────────────────────────────────────────────┐
│  Header (32 bytes)                                   │
│  ├── Magic: "NOVA" (4 bytes)                        │
│  ├── Version: u8 (1 byte)                           │
│  ├── Algorithm: u8 (AES-256-GCM = 0x01)            │
│  ├── Key Version: u64 (8 bytes)                     │
│  ├── Nonce: bytes (12 bytes)                        │
│  └── Reserved: bytes (6 bytes)                      │
├─────────────────────────────────────────────────────┤
│  Encrypted Payload                                   │
│  └── AES-256-GCM encrypted video content            │
│      (variable length, same size as original)       │
├─────────────────────────────────────────────────────┤
│  Auth Tag (16 bytes)                                │
│  └── GCM authentication tag                         │
│      (integrity verification)                       │
└─────────────────────────────────────────────────────┘
```

**Field Details:**

| Field | Size | Description |
|-------|------|-------------|
| Magic | 4 bytes | File identifier: `"NOVA"` (0x4E4F5641) |
| Version | 1 byte | Format version (currently `0x01`) |
| Algorithm | 1 byte | Encryption algorithm (`0x01` = AES-256-GCM) |
| Key Version | 8 bytes | Encryption key version (for key rotation) |
| Nonce | 12 bytes | Unique nonce for AES-GCM (never reused) |
| Reserved | 6 bytes | Reserved for future use (zero-filled) |
| Encrypted Payload | Variable | AES-256-GCM ciphertext |
| Auth Tag | 16 bytes | GCM authentication tag for integrity |

**Key properties of this format:**

- The header allows the decryption client to identify the algorithm and key version without external metadata
- Key versioning supports automatic key rotation when group membership changes
- The GCM authentication tag ensures both confidentiality and integrity
- Reserved bytes allow future format extensions without breaking backward compatibility

---

## Storage Costs

| Item | Cost | Model |
|------|------|-------|
| IPFS upload via Crust | ~$4/GB | One-time upload fee |
| Ongoing storage | Included | No monthly recurring fees |
| Retrieval | Free | Public IPFS gateways |
| Storage order (PSA) | Minimal | Crust chain transaction fee |

**Comparison with centralized alternatives:**

| Provider | Storage | Egress | Model |
|----------|---------|--------|-------|
| Crust Network (YouTick) | ~$4/GB one-time | Free | Decentralized, permanent |
| AWS S3 | ~$23/TB/month | $0.09/GB | Centralized, recurring |
| Google Cloud Storage | ~$20/TB/month | $0.12/GB | Centralized, recurring |
| Cloudflare R2 | $15/TB/month | Free | Centralized, recurring |

For a platform hosting 1,000 videos averaging 50 MB each (50 GB total):

- **Crust Network**: ~$200 one-time (no recurring costs)
- **AWS S3**: ~$1.15/month storage + egress costs per viewer
- **Google Cloud**: ~$1.00/month storage + egress costs per viewer

The decentralized model eliminates ongoing storage fees and egress charges, making costs predictable and front-loaded.

---

## Security Properties

### Content Encryption

- **Always encrypted**: Video content is encrypted before leaving the client device. Gateway operators, IPFS node operators, and Crust storage providers never see unencrypted content.
- **AES-256-GCM**: Authenticated encryption provides both confidentiality (content is unreadable) and integrity (tampering is detectable).
- **TEE key management**: Encryption keys exist only inside the Nova Shade Agent's Trusted Execution Environment. Not even Nova's operators can extract the keys.

### Content Addressing

- **Tamper-evident**: IPFS Content Identifiers (CIDs) are cryptographic hashes of the content. Any modification to the stored file produces a different CID, making tampering immediately detectable.
- **Verifiable**: The CID stored on the NEAR blockchain can be compared against the retrieved content to verify integrity.

### Availability

- **Multi-gateway failover**: Content is accessible through 7+ independent IPFS gateways. No single gateway failure can prevent content access.
- **Crust pinning**: Storage orders create economic incentives for multiple Crust nodes to store and replicate the content.
- **No single point of failure**: Unlike centralized storage (AWS S3, Google Cloud), content availability does not depend on any single provider's uptime.

### Authentication

- **W3Auth (NEAR signature)**: Upload authentication uses cryptographic signatures from NEAR Session Keys. No API keys, passwords, or centralized credentials are involved.
- **Signless UX**: W3Auth tokens are generated from cached Session Keys, so uploads do not require wallet popups or user interaction.

---

## Related Documentation

- [Architecture Overview](../overview.md) - System architecture and technology stack
- [Nova Protocol](./nova-protocol.md) - Encryption system and TEE integration
- [Shade Agent](./shade-agent.md) - TEE key management details
- [Smart Contract](./smart-contract.md) - Contract architecture and NFT metadata
- [Environment Configuration](../guides/environment.md) - Storage and gateway configuration
