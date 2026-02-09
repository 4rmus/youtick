# Nova Protocol Architecture

Comprehensive system design and security model for YouTick's Nova integration.

## System Overview

Nova is YouTick's privacy-first, decentralized video encryption system combining:
- **NEAR Protocol**: Access control and group membership
- **Phala Network TEE**: Secure key management via Shade Agents
- **IPFS**: Distributed encrypted video storage

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        YouTick Nova Architecture                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                        Client Layer                              │   │
│   │  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐  │   │
│   │  │  Next.js │  │   Nova SDK   │  │    Session Key Manager    │  │   │
│   │  │  Web App │──│  (JS Client) │──│  (Signless Authentication)│  │   │
│   │  └──────────┘  └──────────────┘  └───────────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                  │                                       │
│   ┌──────────────────────────────┼──────────────────────────────────┐   │
│   │                   Infrastructure Layer                           │   │
│   │                              │                                   │   │
│   │    ┌─────────────────────────┼─────────────────────────┐        │   │
│   │    │                         │                         │        │   │
│   │    ▼                         ▼                         ▼        │   │
│   │ ┌──────────┐          ┌──────────────┐           ┌──────────┐  │   │
│   │ │   NEAR   │◀────────▶│    Shade     │           │   IPFS   │  │   │
│   │ │ Protocol │          │    Agent     │           │ (Pinata) │  │   │
│   │ │          │          │    (TEE)     │           │          │  │   │
│   │ │ - NFT    │          │              │           │ Encrypted│  │   │
│   │ │ - Groups │          │ Key Manager  │           │  Videos  │  │   │
│   │ │ - Tickets│          │              │           │          │  │   │
│   │ └──────────┘          └──────────────┘           └──────────┘  │   │
│   │                                                                  │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Nova SDK Integration

The Nova SDK is YouTick's primary interface for encryption operations.

**Module Structure (`/apps/web/lib/nova/`):**
```
lib/nova/
├── index.ts      # Module exports
├── types.ts      # TypeScript definitions
├── auth.ts       # Session Key → Nova token
├── client.ts     # Upload/download operations
├── groups.ts     # Access group management
└── config.ts     # Environment configuration
```

**Key Responsibilities:**
- Connection management (NEAR, Shade Agent, IPFS)
- Request signing with Session Keys
- Encryption/decryption orchestration
- Error handling and retry logic

### NEAR Smart Contract

YouTick's NFT ticket contract manages group membership and authorization.

**Data Model:**
```rust
pub struct Event {
    pub encrypted_cid: String,         // IPFS CID of encrypted video
    pub nova_group_id: Option<String>, // Nova access group
    pub storage_type: StorageType,     // Nova or Legacy
    pub title: String,
    pub description: String,
    pub price: U128,
    pub creator_id: AccountId,
}

pub enum StorageType {
    Nova,      // Current: Nova TEE encryption
    Legacy,    // Backward compat: Old videos
}

pub struct VideoMetadata {
    pub encrypted_cid: String,
    pub nova_group_id: Option<String>,
    pub storage_type: StorageType,
    pub duration_seconds: u32,
    pub content_type: ContentType,
}
```

**Contract Methods:**
- `create_event()`: Create video with Nova group
- `buy_ticket()`: Purchase adds user to Nova group
- `get_nova_group()`: Retrieve group ID for video
- `set_nova_group()`: Associate group with video

### Shade Agent (TEE)

Trusted Execution Environment for secure key management.

**Key Storage Model:**
```
┌─────────────────────────────────────────────────────────────┐
│                    Shade Agent State                         │
│                    (Inside TEE Only)                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  key_store: HashMap<GroupId, VersionedKeys>                 │
│    └── VersionedKeys                                         │
│          ├── current_version: u64                            │
│          └── keys: HashMap<Version, AES256Key>              │
│                                                              │
│  contract_verifier: NearContractVerifier                    │
│    └── contract_id: "v1.utick.testnet"                      │
│    └── rpc_url: "https://rpc.testnet.near.org"              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Security Properties:**
- Memory encryption (hardware-level)
- Tamper-evident execution
- Remote attestation
- Sealed storage

### IPFS Storage

Distributed storage for encrypted video content.

**Encrypted File Structure:**
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
├─────────────────────────────────────────────────────┤
│  Auth Tag (16 bytes)                                │
│  └── GCM authentication tag                         │
└─────────────────────────────────────────────────────┘
```

## Data Flow

### Video Upload Flow

```
┌──────┐     ┌─────────┐     ┌────────┐     ┌───────┐     ┌──────┐
│Client│     │Nova SDK │     │Shade   │     │NEAR   │     │IPFS  │
└──┬───┘     └────┬────┘     │Agent   │     │       │     │      │
   │              │          └───┬────┘     └───┬───┘     └──┬───┘
   │              │              │              │             │
   │ 1. upload()  │              │              │             │
   │─────────────▶│              │              │             │
   │              │              │              │             │
   │              │ 2. Create    │              │             │
   │              │    group     │              │             │
   │              │─────────────────────────────▶             │
   │              │              │              │             │
   │              │ 3. Request   │              │             │
   │              │    key       │              │             │
   │              │─────────────▶│              │             │
   │              │              │              │             │
   │              │              │ 4. Verify    │             │
   │              │              │    creator   │             │
   │              │              │─────────────▶│             │
   │              │              │              │             │
   │              │◀─────────────│              │             │
   │              │ 5. Encrypted │              │             │
   │              │    key       │              │             │
   │              │              │              │             │
   │              │ 6. Encrypt   │              │             │
   │              │    video     │              │             │
   │              │    locally   │              │             │
   │              │              │              │             │
   │              │ 7. Upload    │              │             │
   │              │    encrypted │              │             │
   │              │─────────────────────────────────────────▶│
   │              │              │              │             │
   │              │◀─────────────────────────────────────────│
   │              │ 8. CID       │              │             │
   │              │              │              │             │
   │              │ 9. Mint NFT  │              │             │
   │              │    with CID  │              │             │
   │              │─────────────────────────────▶             │
   │              │              │              │             │
   │◀─────────────│              │              │             │
   │ 10. Result   │              │              │             │
```

### Video Playback Flow

```
┌──────┐     ┌─────────┐     ┌────────┐     ┌───────┐     ┌──────┐
│Viewer│     │Nova SDK │     │Shade   │     │NEAR   │     │IPFS  │
└──┬───┘     └────┬────┘     │Agent   │     │       │     │      │
   │              │          └───┬────┘     └───┬───┘     └──┬───┘
   │              │              │              │             │
   │ 1. play()    │              │              │             │
   │─────────────▶│              │              │             │
   │              │              │              │             │
   │              │ 2. Verify    │              │             │
   │              │    ticket    │              │             │
   │              │─────────────────────────────▶             │
   │              │              │              │             │
   │              │ 3. Fetch     │              │             │
   │              │    encrypted │              │             │
   │              │─────────────────────────────────────────▶│
   │              │              │              │             │
   │              │◀─────────────────────────────────────────│
   │              │ 4. Encrypted │              │             │
   │              │    video     │              │             │
   │              │              │              │             │
   │              │ 5. Request   │              │             │
   │              │    key (ver) │              │             │
   │              │─────────────▶│              │             │
   │              │              │              │             │
   │              │              │ 6. Verify    │             │
   │              │              │    member    │             │
   │              │              │─────────────▶│             │
   │              │              │              │             │
   │              │◀─────────────│              │             │
   │              │ 7. Key       │              │             │
   │              │              │              │             │
   │              │ 8. Decrypt   │              │             │
   │              │    video     │              │             │
   │              │              │              │             │
   │◀─────────────│              │              │             │
   │ 9. Playable  │              │              │             │
   │    video     │              │              │             │
```

### Ticket Purchase Flow

```
┌──────┐     ┌───────┐     ┌────────┐     ┌─────────┐
│Buyer │     │NEAR   │     │Shade   │     │Nova SDK │
└──┬───┘     │       │     │Agent   │     │         │
   │         └───┬───┘     └───┬────┘     └────┬────┘
   │             │              │               │
   │ 1. buy()    │              │               │
   │────────────▶│              │               │
   │             │              │               │
   │             │ 2. Transfer  │               │
   │             │    payment   │               │
   │             │    (98%→Creator, 2%→Platform)│
   │             │              │               │
   │             │ 3. Add to    │               │
   │             │    group     │               │
   │             │─────────────▶│               │
   │             │              │               │
   │             │              │ 4. Register   │
   │             │              │    member     │
   │             │              │               │
   │◀────────────│              │               │
   │ 5. Ticket   │              │               │
   │    NFT      │              │               │
   │             │              │               │
   │             │              │               │ 6. Buyer can
   │             │              │               │    now decrypt
```

## Security Model

### Zero-Knowledge Design

```
┌─────────────────────────────────────────────────────────────┐
│                Zero-Knowledge Properties                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  What NEAR Contract Knows:                                   │
│  + Group membership list                                     │
│  + Video CIDs (content identifiers)                         │
│  + Video metadata (title, price)                            │
│  - Video contents (encrypted on IPFS)                       │
│  - Encryption keys (only in TEE)                            │
│                                                              │
│  What Shade Agent Knows:                                     │
│  + Encryption keys per group                                │
│  + Key versions                                              │
│  - Group membership (queries NEAR)                          │
│  - Video contents (never sees files)                        │
│  - Video CIDs (not stored)                                  │
│                                                              │
│  What IPFS Knows:                                            │
│  + Encrypted video blobs                                    │
│  - Decryption keys                                          │
│  - Video contents (encrypted)                               │
│  - Access permissions                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Access Control Matrix

| Actor | Create Video | Buy Ticket | Watch Video | Transfer Ticket |
|-------|--------------|------------|-------------|-----------------|
| Creator | + | - | + (own) | - |
| Ticket Holder | - | - | + | + |
| Non-holder | - | + | - | - |
| Platform | - | - | - | - |

### Encryption Specifications

| Component | Algorithm | Key Size | Purpose |
|-----------|-----------|----------|---------|
| Video Encryption | AES-256-GCM | 256 bits | Content encryption |
| Key Derivation | HKDF-SHA256 | Variable | Key expansion |
| Key Exchange | X25519 | 256 bits | Ephemeral key exchange |
| Signatures | Ed25519 | 256 bits | Request signing |

## Performance Characteristics

| Operation | Typical Latency |
|-----------|-----------------|
| Create group | 2-5 seconds |
| Upload video (10MB) | 10-15 seconds |
| Decrypt & play | 2-4 seconds |
| Ticket purchase | 3-5 seconds |
| Key rotation | 1-3 seconds |

## Scalability Considerations

| Metric | Limit | Reason |
|--------|-------|--------|
| Members per group | 1,000 | NEAR storage costs |
| Videos per creator | 10,000 | Query performance |
| Video size | 100 MB | IPFS chunking |
| Groups per user | Unlimited | Indexed lookup |

## Related Documentation

- [Shade Agent Details](./shade-agent.md) - TEE key management
- [Session Keys](./session-keys.md) - Authentication flow
- [Smart Contract](./smart-contract.md) - Contract architecture
- [Security Guide](../08-security.md) - Security best practices
