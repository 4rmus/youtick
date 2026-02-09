# Nova Architecture

Comprehensive system design and security model documentation.

## System Overview

Nova is a privacy-first, decentralized file-sharing system that combines:
- **NEAR Protocol**: Access control and group membership
- **Phala Network TEE**: Secure key management via Shade Agents
- **IPFS**: Distributed encrypted file storage

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Nova Architecture                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                        Client Layer                              │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │   │
│   │  │   Web    │  │  Node.js │  │   Rust   │  │    MCP       │    │   │
│   │  │   App    │  │   App    │  │   App    │  │   Server     │    │   │
│   │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘    │   │
│   │       │             │             │                │            │   │
│   │       └─────────────┴──────┬──────┴────────────────┘            │   │
│   │                            │                                    │   │
│   │                     ┌──────▼──────┐                             │   │
│   │                     │  Nova SDK   │                             │   │
│   │                     │  (JS/Rust)  │                             │   │
│   │                     └──────┬──────┘                             │   │
│   └────────────────────────────┼────────────────────────────────────┘   │
│                                │                                         │
│   ┌────────────────────────────┼────────────────────────────────────┐   │
│   │                   Infrastructure Layer                           │   │
│   │                            │                                     │   │
│   │    ┌───────────────────────┼───────────────────────────┐        │   │
│   │    │                       │                           │        │   │
│   │    ▼                       ▼                           ▼        │   │
│   │ ┌──────────┐        ┌──────────────┐           ┌──────────┐    │   │
│   │ │   NEAR   │◀──────▶│    Shade     │           │   IPFS   │    │   │
│   │ │ Protocol │        │    Agent     │           │ Network  │    │   │
│   │ │          │        │    (TEE)     │           │          │    │   │
│   │ │ Access   │        │              │           │ Encrypted│    │   │
│   │ │ Control  │        │ Key Mgmt     │           │ Storage  │    │   │
│   │ └──────────┘        └──────────────┘           └──────────┘    │   │
│   │                                                                  │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Deep Dive

### 1. Nova SDK

The SDK is the primary interface for applications.

**Responsibilities:**
- Connection management (NEAR, Shade Agent, IPFS)
- Request signing and authentication
- Encryption/decryption orchestration
- Error handling and retry logic
- Event emission for real-time updates

**Implementations:**
- `nova-sdk-js`: JavaScript/TypeScript for web and Node.js
- `nova-sdk-rs`: Rust for backend services and WASM

### 2. NEAR Smart Contract

Manages group membership and authorization.

**Data Model:**
```
┌─────────────────────────────────────────────────────────────┐
│                    NEAR Contract State                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  groups: LookupMap<GroupId, Group>                          │
│    └── Group                                                 │
│          ├── id: String                                      │
│          ├── name: String                                    │
│          ├── owner: AccountId                                │
│          ├── members: UnorderedSet<AccountId>               │
│          ├── member_roles: LookupMap<AccountId, Role>       │
│          ├── files: UnorderedSet<CID>                       │
│          ├── file_metadata: LookupMap<CID, FileInfo>        │
│          ├── key_version: u64                                │
│          └── metadata: Option<JSON>                          │
│                                                              │
│  user_groups: LookupMap<AccountId, UnorderedSet<GroupId>>   │
│                                                              │
│  transactions: Vector<Transaction>                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Functions:**
- Group CRUD operations
- Membership management
- File registry maintenance
- Authorization verification
- Event logging

### 3. Shade Agent (TEE)

Secure key management in Trusted Execution Environment.

**Key Storage:**
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
│  rotation_state: HashMap<GroupId, RotationState>            │
│                                                              │
│  contract_verifier: NearContractVerifier                    │
│    └── contract_id: AccountId                                │
│    └── rpc_url: String                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Security Properties:**
- Memory encryption (hardware-level)
- Tamper-evident execution
- Remote attestation
- Sealed storage

### 4. IPFS Storage

Distributed storage for encrypted files.

**Storage Model:**
```
┌─────────────────────────────────────────────────────────────┐
│                    IPFS Content                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Encrypted File Structure:                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Header (32 bytes)                                   │    │
│  │  ├── Magic: "NOVA" (4 bytes)                        │    │
│  │  ├── Version: u8 (1 byte)                           │    │
│  │  ├── Algorithm: u8 (1 byte, AES-256-GCM = 0x01)    │    │
│  │  ├── Key Version: u64 (8 bytes)                     │    │
│  │  ├── Nonce: bytes (12 bytes)                        │    │
│  │  └── Reserved: bytes (6 bytes)                      │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  Encrypted Payload                                   │    │
│  │  └── AES-256-GCM encrypted content                  │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  Auth Tag (16 bytes)                                │    │
│  │  └── GCM authentication tag                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### File Upload Flow

```
┌──────┐     ┌─────────┐     ┌────────┐     ┌───────┐     ┌──────┐
│Client│     │Nova SDK │     │Shade   │     │NEAR   │     │IPFS  │
└──┬───┘     └────┬────┘     │Agent   │     │       │     │      │
   │              │          └───┬────┘     └───┬───┘     └──┬───┘
   │              │              │              │             │
   │ 1. upload()  │              │              │             │
   │─────────────▶│              │              │             │
   │              │              │              │             │
   │              │ 2. Request   │              │             │
   │              │    key       │              │             │
   │              │─────────────▶│              │             │
   │              │              │              │             │
   │              │              │ 3. Verify    │             │
   │              │              │    member    │             │
   │              │              │─────────────▶│             │
   │              │              │              │             │
   │              │              │◀─────────────│             │
   │              │              │ 4. Confirmed │             │
   │              │              │              │             │
   │              │◀─────────────│              │             │
   │              │ 5. Encrypted │              │             │
   │              │    key       │              │             │
   │              │              │              │             │
   │              │ 6. Encrypt   │              │             │
   │              │    file      │              │             │
   │              │    locally   │              │             │
   │              │              │              │             │
   │              │ 7. Upload    │              │             │
   │              │    encrypted │              │             │
   │              │─────────────────────────────────────────▶│
   │              │              │              │             │
   │              │◀─────────────────────────────────────────│
   │              │ 8. CID       │              │             │
   │              │              │              │             │
   │              │ 9. Register  │              │             │
   │              │    file      │              │             │
   │              │─────────────────────────────▶│             │
   │              │              │              │             │
   │◀─────────────│              │              │             │
   │ 10. Result   │              │              │             │
   │     (CID)    │              │              │             │
```

### File Download Flow

```
┌──────┐     ┌─────────┐     ┌────────┐     ┌───────┐     ┌──────┐
│Client│     │Nova SDK │     │Shade   │     │NEAR   │     │IPFS  │
└──┬───┘     └────┬────┘     │Agent   │     │       │     │      │
   │              │          └───┬────┘     └───┬───┘     └──┬───┘
   │              │              │              │             │
   │ 1. download()│              │              │             │
   │─────────────▶│              │              │             │
   │              │              │              │             │
   │              │ 2. Fetch     │              │             │
   │              │    encrypted │              │             │
   │              │─────────────────────────────────────────▶│
   │              │              │              │             │
   │              │◀─────────────────────────────────────────│
   │              │ 3. Encrypted │              │             │
   │              │    content   │              │             │
   │              │              │              │             │
   │              │ 4. Parse     │              │             │
   │              │    header    │              │             │
   │              │    (get ver) │              │             │
   │              │              │              │             │
   │              │ 5. Request   │              │             │
   │              │    key (ver) │              │             │
   │              │─────────────▶│              │             │
   │              │              │              │             │
   │              │              │ 6. Verify    │             │
   │              │              │    member    │             │
   │              │              │─────────────▶│             │
   │              │              │              │             │
   │              │              │◀─────────────│             │
   │              │              │ 7. Confirmed │             │
   │              │              │              │             │
   │              │◀─────────────│              │             │
   │              │ 8. Encrypted │              │             │
   │              │    key       │              │             │
   │              │              │              │             │
   │              │ 9. Decrypt   │              │             │
   │              │    file      │              │             │
   │              │    locally   │              │             │
   │              │              │              │             │
   │◀─────────────│              │              │             │
   │ 10. Plain    │              │              │             │
   │     content  │              │              │             │
```

### Key Rotation Flow

```
┌──────┐     ┌─────────┐     ┌────────┐     ┌───────┐
│Admin │     │Nova SDK │     │Shade   │     │NEAR   │
└──┬───┘     └────┬────┘     │Agent   │     │       │
   │              │          └───┬────┘     └───┬───┘
   │              │              │              │
   │ 1. remove    │              │              │
   │    member()  │              │              │
   │─────────────▶│              │              │
   │              │              │              │
   │              │ 2. Remove    │              │
   │              │    member    │              │
   │              │─────────────────────────────▶
   │              │              │              │
   │              │              │◀─────────────│
   │              │              │ 3. Event:    │
   │              │              │ MemberRemoved│
   │              │              │              │
   │              │ 4. Request   │              │
   │              │    rotation  │              │
   │              │─────────────▶│              │
   │              │              │              │
   │              │              │ 5. Generate  │
   │              │              │    new key   │
   │              │              │              │
   │              │              │ 6. Update    │
   │              │              │    version   │
   │              │              │─────────────▶│
   │              │              │              │
   │              │◀─────────────│              │
   │              │ 7. New       │              │
   │              │    version   │              │
   │              │              │              │
   │◀─────────────│              │              │
   │ 8. Complete  │              │              │
```

## Security Model

### Zero-Knowledge Design

```
┌─────────────────────────────────────────────────────────────┐
│                Zero-Knowledge Properties                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  What NEAR Contract Knows:                                   │
│  ✓ Group membership list                                     │
│  ✓ File CIDs (content identifiers)                          │
│  ✓ File metadata (name, size, etc.)                         │
│  ✓ Transaction history                                       │
│  ✗ File contents (encrypted on IPFS)                        │
│  ✗ Encryption keys (only in TEE)                            │
│                                                              │
│  What Shade Agent Knows:                                     │
│  ✓ Encryption keys per group                                │
│  ✓ Key versions                                              │
│  ✗ Group membership (queries NEAR)                          │
│  ✗ File contents (never sees files)                         │
│  ✗ File CIDs (not stored)                                   │
│                                                              │
│  What IPFS Knows:                                            │
│  ✓ Encrypted file blobs                                     │
│  ✗ Decryption keys                                          │
│  ✗ File contents (encrypted)                                │
│  ✗ Access permissions                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Threat Model

**Protected Against:**
- Unauthorized file access
- Key exposure (keys never leave TEE unencrypted)
- IPFS content leakage (files are encrypted)
- Blockchain snooping (no sensitive data on-chain)
- Removed member access (key rotation)

**Trust Assumptions:**
- Phala Network TEE operates correctly
- NEAR Protocol consensus is honest
- Client device is not compromised
- User's NEAR keys are secure

### Access Control Matrix

| Actor | Can Create Group | Can Add Member | Can Remove Member | Can Upload | Can Download |
|-------|------------------|----------------|-------------------|------------|--------------|
| Owner | ✓ | ✓ | ✓ | ✓ | ✓ |
| Admin | ✗ | ✓ | ✓ (not owner) | ✓ | ✓ |
| Member | ✗ | ✗ | ✗ | ✓ | ✓ |
| Non-member | ✗ | ✗ | ✗ | ✗ | ✗ |

## Encryption Details

### Algorithm Selection

| Component | Algorithm | Key Size | Purpose |
|-----------|-----------|----------|---------|
| File Encryption | AES-256-GCM | 256 bits | Content encryption |
| Key Derivation | HKDF-SHA256 | Variable | Key expansion |
| Key Exchange | X25519 | 256 bits | Ephemeral key exchange |
| Signatures | Ed25519 | 256 bits | Request signing |

### Encryption Process

```typescript
// Pseudocode for file encryption
function encryptFile(plaintext: Uint8Array, key: AES256Key): EncryptedFile {
  // 1. Generate random nonce
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  // 2. Derive encryption key (optional: if using HKDF)
  const encKey = hkdf(key, nonce, "nova-file-encryption");

  // 3. Encrypt with AES-256-GCM
  const { ciphertext, authTag } = aesGcmEncrypt(plaintext, encKey, nonce);

  // 4. Build file structure
  return buildEncryptedFile({
    header: {
      magic: "NOVA",
      version: 1,
      algorithm: AES_256_GCM,
      keyVersion: currentKeyVersion,
      nonce: nonce
    },
    payload: ciphertext,
    authTag: authTag
  });
}
```

## Scalability Considerations

### Group Size Limits

| Metric | Limit | Reason |
|--------|-------|--------|
| Members per group | 1,000 | NEAR storage costs |
| Files per group | 10,000 | Query performance |
| File size | 100 MB | IPFS chunking |
| Groups per user | Unlimited | Indexed lookup |

### Performance Characteristics

| Operation | Typical Latency |
|-----------|-----------------|
| Create group | 2-5 seconds |
| Add member | 1-2 seconds |
| Upload (small file) | 3-8 seconds |
| Download (small file) | 2-5 seconds |
| Key rotation | 1-3 seconds |

## Future Considerations

### Planned Improvements

1. **Multi-signature Groups**: Require multiple approvals for sensitive operations
2. **Time-locked Access**: Grant temporary access that auto-expires
3. **Hierarchical Groups**: Nested group structures
4. **Cross-chain Support**: Extend to other blockchains
5. **Enhanced Privacy**: Zero-knowledge proofs for membership

### Migration Path

```
v1.0 (Current):
- Basic group management
- Single-key encryption
- Manual key rotation on member removal

v2.0 (Planned):
- Multi-key support
- Automatic re-encryption
- Advanced access policies

v3.0 (Future):
- ZK-proof membership
- Cross-chain groups
- Enterprise features
```
