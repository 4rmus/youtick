# Shade Agent Reference

Complete reference for Nova's TEE-based key management system (Shade Agent v2.2).

## Overview

The Shade Agent is Nova's Trusted Execution Environment (TEE) secured key management service. It runs as a Next.js application deployed as a Docker container on Phala Cloud, handling all encryption key lifecycle operations inside hardware-level secure enclaves.

**Key principle:** Plaintext data and encryption keys never travel together.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Phala Cloud TEE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Shade Agent v2.2 (Next.js)                   │   │
│  │                                                           │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │   │
│  │  │  Encrypted    │  │    Token      │  │    Key       │  │   │
│  │  │  SQLite DB    │  │  Verifier     │  │  Operations  │  │   │
│  │  │               │  │               │  │              │  │   │
│  │  │  AES-256-CBC  │  │  ed25519 sig  │  │  generate    │  │   │
│  │  │  with TEE-    │  │  SHA256       │  │  get         │  │   │
│  │  │  derived key  │  │  nonce check  │  │  rotate      │  │   │
│  │  └───────────────┘  └───────────────┘  └─────────────┘  │   │
│  │                                                           │   │
│  │  Docker Container on Phala Cloud                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Hardware Isolation: TEE Enclave                                 │
│  Storage: Encrypted SQLite (AES-256-CBC, TEE-derived secret)    │
│  Attestation: Remote attestation with approved code hashes       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Application | Next.js |
| Deployment | Docker container on Phala Cloud |
| Key Storage | Encrypted SQLite database |
| Storage Encryption | AES-256-CBC with TEE-derived AES-256-CBC secret |
| TEE Platform | Phala Cloud hardware enclaves |
| API Path | `/api/key-management` |

## API Endpoints

All key management operations are exposed under `/api/key-management`:

### generate_key

Generates a new encryption key for a group. Called when a new group is registered.

**Request:**
```json
{
  "group_id": "my-secure-files",
  "owner": "alice.nova-sdk.near"
}
```

**Response:**
```json
{
  "key": "<base64-encoded-32-byte-AES-key>",
  "checksum": "<checksum-for-on-chain-verification>"
}
```

**Behavior:**
- Generates a 32-byte random key (base64 encoded)
- Stores the key in the encrypted SQLite database
- Returns a checksum that gets recorded on the NEAR contract via `update_checksum()`

### get_key

Retrieves the encryption key for a group. Requires a valid token obtained via the NEAR contract's `claim_token()` function.

**Request:**
```json
{
  "group_id": "my-secure-files",
  "token": "<token-from-claim_token>"
}
```

**Response:**
```json
{
  "key": "<base64-encoded-AES-key>",
  "checksum": "<current-checksum>"
}
```

**Verification Process:**
1. Validates the token (ed25519 signature on SHA256 of payload)
2. Checks nonce has not been used (replay protection)
3. Verifies timestamp is within 5-minute window
4. Confirms group membership via NEAR contract
5. Returns the encryption key only if all checks pass

### rotate_key

Rotates the encryption key for a group. Automatically triggered when a member is revoked.

**Request:**
```json
{
  "group_id": "my-secure-files"
}
```

**Response:**
```json
{
  "success": true,
  "new_key_hash": "<hash-of-new-key>",
  "checksum": "<updated-checksum>"
}
```

**Behavior:**
- Generates a new encryption key
- Replaces the old key in the encrypted SQLite database
- Updates the on-chain checksum via `update_checksum()` on the NEAR contract
- After rotation, the revoked member cannot obtain the new key

## Token Verification

The Shade Agent verifies tokens using a multi-step process:

### Signature Verification
- Tokens contain an ed25519 signature over SHA256(payload)
- The payload includes: `{ group_id, user_id, nonce, timestamp }`
- Signature is verified against the user's NEAR public key

### Replay Protection
- Each token contains a unique nonce
- Used nonces are tracked on the NEAR contract
- The Shade Agent checks `get_nonce_validity()` before accepting a token

### Timestamp Freshness
- Tokens include a timestamp
- The Shade Agent rejects tokens older than 5 minutes
- Prevents capture-and-replay of old tokens

## Key Storage

### Encrypted SQLite Database

Keys are stored in an SQLite database that is encrypted with a TEE-derived secret:

```
SQLite DB (inside TEE)
├── Encryption: AES-256-CBC
├── Key derivation: TEE-derived AES-256-CBC secret
├── Contents:
│   ├── Group keys (32-byte AES keys, base64)
│   ├── Key metadata
│   └── Rotation history
└── Access: Only within TEE boundary
```

**Security Properties:**
- The database encryption key is derived from the TEE's hardware-sealed secret
- If the database file is extracted from the container, it cannot be decrypted without the TEE
- Keys are never stored in plaintext, even within the TEE's encrypted database

## TEE Security Properties

### Code Hash Verification
The NEAR contract stores approved code hashes via `approve_shade_code_hash()`. Only Shade Agent instances running approved, audited code can register as workers. This ensures:
- No modified or malicious code can access encryption keys
- Every deployed instance is verified against known-good builds
- Updates require explicit approval on-chain

### Remote Attestation
Each Shade Agent worker provides attestation proofs during registration via `register_shade_worker()`:
- Proves the code is running inside a genuine TEE enclave
- Verifiable by any party against the NEAR contract
- Attestation is cryptographically bound to the specific code hash

### Checksum Verification
Every response from the Shade Agent includes a checksum:
- Clients can verify responses against `get_group_checksum()` on the NEAR contract
- Prevents man-in-the-middle attacks between client and TEE
- Ensures the TEE state matches the on-chain recorded state

### Redundancy
Multiple TEE worker instances can run the same approved code hash:
- Provides high availability for key management operations
- All workers share the same encrypted database
- No single point of failure for key operations

## Data Flow Patterns

### Upload Flow (Encryption)

```
Client SDK          Shade Agent (TEE)         IPFS          NEAR Contract
    |                      |                    |                 |
    | 1. prepare_upload    |                    |                 |
    |--------------------->|                    |                 |
    |                      |                    |                 |
    | 2. Encryption key    |                    |                 |
    |<---------------------|                    |                 |
    |                      |                    |                 |
    | 3. Encrypt locally   |                    |                 |
    |    (AES-256-GCM)     |                    |                 |
    |                      |                    |                 |
    | 4. finalize_upload   |                    |                 |
    |--------------------->|                    |                 |
    |                      | 5. Store to IPFS   |                 |
    |                      |------------------->|                 |
    |                      |                    |                 |
    |                      | 6. Record on NEAR  |                 |
    |                      |------------------------------------>|
    |                      |                    |                 |
    | 7. {cid, trans_id,   |                    |                 |
    |     file_hash}       |                    |                 |
    |<---------------------|                    |                 |
```

### Retrieve Flow (Decryption)

```
Client SDK          Shade Agent (TEE)         IPFS          NEAR Contract
    |                      |                    |                 |
    | 1. prepare_retrieve  |                    |                 |
    |--------------------->|                    |                 |
    |                      | 2. Fetch from IPFS |                 |
    |                      |------------------->|                 |
    |                      |<-------------------|                 |
    |                      |                    |                 |
    | 3. Encryption key +  |                    |                 |
    |    encrypted data    |                    |                 |
    |<---------------------|                    |                 |
    |                      |                    |                 |
    | 4. Decrypt locally   |                    |                 |
    |    (AES-256-GCM)     |                    |                 |
    |                      |                    |                 |
    | 5. Plaintext data    |                    |                 |
```

### Key Rotation Flow (on Member Revocation)

```
SDK / Contract          Shade Agent (TEE)         NEAR Contract
    |                          |                        |
    | 1. revokeGroupMember()   |                        |
    |-------------------------------------------------->|
    |                          |                        |
    |                          | 2. Rotation triggered  |
    |                          |<-----------------------|
    |                          |                        |
    |                          | 3. Generate new key    |
    |                          |                        |
    |                          | 4. Store new key       |
    |                          |    in encrypted SQLite  |
    |                          |                        |
    |                          | 5. update_checksum()   |
    |                          |----------------------->|
    |                          |                        |
    | Revoked member can no    |                        |
    | longer claim tokens or   |                        |
    | obtain the new key       |                        |
```

## Security Best Practices

### For Application Developers

1. **Always verify checksums** - After receiving a key from the Shade Agent, verify the checksum against `getGroupChecksum()` on the NEAR contract
2. **Use fresh nonces** - Generate cryptographically random nonces for each token claim
3. **Handle 5-minute windows** - Ensure your clock is synchronized; tokens expire after 5 minutes
4. **Don't cache keys long-term** - Request fresh keys for each operation when practical
5. **Clear sensitive memory** - Zero encryption keys from memory after use

### Security Guarantees

| Property | Guarantee |
|----------|-----------|
| Key isolation | Keys exist only within TEE boundary |
| Storage encryption | SQLite encrypted with TEE-derived secret |
| Code verification | Only approved code hashes can run |
| Replay protection | Nonces tracked on-chain, single-use |
| Time-bound tokens | 5-minute validity window |
| Membership verification | Checked against NEAR contract state |
| Checksum verification | TEE responses verifiable on-chain |

### What the Shade Agent Cannot See

The Shade Agent operates on a need-to-know basis:
- **Has access to:** Encryption keys per group, key metadata
- **Does NOT see:** File contents (encrypted on IPFS), file CIDs, file metadata
- **Queries NEAR for:** Group membership, nonce validity, authorization
