# Nova Architecture

System design and security model documentation for the Nova SDK.

## System Overview

Nova is a privacy-first, decentralized file-sharing system that combines three core components:

- **NEAR Protocol**: On-chain group registry, member authorization, token claims, TEE worker management
- **Shade Agent (TEE)**: Key generation, storage, rotation, and distribution inside Phala Cloud hardware enclaves
- **IPFS**: Distributed storage for encrypted file data (via Pinata)

```
┌───────────────────────────────────────────────────────────────────────┐
│                          Nova Architecture                             │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌───────────────────────────────────────────────────────────────┐   │
│   │                       Client Layer                              │   │
│   │   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │   │
│   │   │  Web App │   │ Node.js  │   │  Rust    │   │   MCP    │  │   │
│   │   │          │   │  App     │   │  App     │   │  Server  │  │   │
│   │   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘  │   │
│   │        └───────────────┴──────┬───────┴──────────────┘        │   │
│   │                               │                                │   │
│   │                        ┌──────▼──────┐                         │   │
│   │                        │  Nova SDK   │                         │   │
│   │                        │  (JS/Rust)  │                         │   │
│   │                        └──────┬──────┘                         │   │
│   └───────────────────────────────┼────────────────────────────────┘   │
│                                   │                                     │
│   ┌───────────────────────────────┼────────────────────────────────┐   │
│   │                  Infrastructure Layer                            │   │
│   │                               │                                  │   │
│   │     ┌─────────────────────────┼────────────────────────┐        │   │
│   │     │                         │                        │        │   │
│   │     ▼                         ▼                        ▼        │   │
│   │  ┌──────────────┐    ┌──────────────┐         ┌──────────┐     │   │
│   │  │    NEAR      │◄──►│ Shade Agent  │         │   IPFS   │     │   │
│   │  │  Protocol    │    │   (TEE)      │         │ (Pinata) │     │   │
│   │  │              │    │              │         │          │     │   │
│   │  │ nova-sdk.near│    │ Next.js on   │         │ Encrypted│     │   │
│   │  │ (mainnet)    │    │ Phala Cloud  │         │ Storage  │     │   │
│   │  │              │    │              │         │          │     │   │
│   │  │ Group Reg.   │    │ Key Mgmt     │         │ CID-based│     │   │
│   │  │ Auth Control │    │ SQLite (enc) │         │ Access   │     │   │
│   │  │ Token Claims │    │ AES-256-CBC  │         │          │     │   │
│   │  └──────────────┘    └──────────────┘         └──────────┘     │   │
│   │                                                                  │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Nova SDK (Client Layer)

The SDK is the primary interface for applications, available in JavaScript and Rust.

**Responsibilities:**
- NEAR account management and transaction signing
- Token claim generation (payload + ed25519 signature)
- Client-side encryption/decryption (AES-256-GCM)
- SHA-256 hashing for file integrity
- Orchestrating the upload/retrieve flows with Shade Agent and IPFS

**Implementations:**
- `nova-sdk-js`: JavaScript/TypeScript for web and Node.js
- `nova-sdk-rs`: Rust for backend services, CLI tools, smart contracts

### 2. NEAR Smart Contract

Contract IDs: `nova-sdk.near` (mainnet), `nova-sdk-6.testnet` (testnet)

**On-chain state:**

| State | Purpose |
|-------|---------|
| Groups | Group registry with ownership |
| Members | Per-group member authorization |
| Transactions | Immutable audit trail |
| TEE Workers | Registered Shade Agent instances |
| Used Nonces | Replay attack prevention |
| Fees | Operation fee tracking |
| Indexes | Ownership and membership lookups |

**Key functions:**
- `approve_shade_code_hash()` - Approve TEE worker code
- `register_shade_worker()` - Register TEE worker with attestation
- `claim_token()` - Central NEAR-TEE bridge for key access
- `get_group_checksum()` - Verify TEE state on-chain
- `get_nonce_validity()` - Check nonce status
- `update_checksum()` - Update group encryption checksum

### 3. Shade Agent (TEE)

A Next.js application deployed as a Docker container on Phala Cloud.

**Off-chain responsibilities:**
- Key generation (32-byte AES keys, base64-encoded)
- Key storage (encrypted SQLite with AES-256-CBC)
- Key rotation (automatic on member revocation)
- Key distribution (token-gated via NEAR contract)
- Checksum updates (on-chain via `update_checksum()`)

**API:** `/api/key-management` with endpoints: `generate_key`, `get_key`, `rotate_key`

### 4. IPFS Storage (Pinata)

Distributed storage for encrypted file data.

**Characteristics:**
- Files are encrypted before upload (client-side)
- Content-addressable via CID (supports `Qm*` and `bafy*` formats)
- Decryption requires the group's encryption key from the Shade Agent
- IPFS nodes see only encrypted ciphertext

## Core Data Flows

### Token Claim Flow (NEAR <-> TEE Bridge)

This is the central mechanism enabling secure key distribution:

```
Client                      NEAR Contract                  Shade Agent (TEE)
  │                              │                               │
  │ 1. Generate payload          │                               │
  │    {group_id, user_id,       │                               │
  │     nonce, timestamp}        │                               │
  │                              │                               │
  │ 2. Sign: ed25519 over        │                               │
  │    SHA256(payload)           │                               │
  │                              │                               │
  │ 3. claim_token(payload,  ───►│                               │
  │    signature)                │                               │
  │                              │ 4. Verify:                    │
  │                              │    - ed25519 signature        │
  │                              │    - nonce uniqueness         │
  │                              │    - timestamp (5-min window) │
  │                              │    - group membership         │
  │                              │                               │
  │ ◄── 5. Return token ────────│                               │
  │                              │                               │
  │ 6. Present token ──────────────────────────────────────────►│
  │                              │                               │ 7. Verify token
  │                              │                               │ 8. Lookup key in
  │                              │                               │    encrypted SQLite
  │ ◄────────────────────────────────── 9. Return encryption key│
  │                              │                               │
```

### Upload Flow (Encryption)

```
Client SDK           Shade Agent (TEE)          IPFS (Pinata)      NEAR Contract
    │                       │                        │                    │
    │ 1. prepare_upload ───►│                        │                    │
    │                       │                        │                    │
    │ ◄── 2. AES key ──────│                        │                    │
    │                       │                        │                    │
    │ 3. Encrypt locally    │                        │                    │
    │    (AES-256-GCM)      │                        │                    │
    │                       │                        │                    │
    │ 4. Compute SHA-256    │                        │                    │
    │    hash of plaintext  │                        │                    │
    │                       │                        │                    │
    │ 5. finalize_upload ──►│                        │                    │
    │                       │ 6. Upload to IPFS ────►│                    │
    │                       │                        │                    │
    │                       │ 7. Record on NEAR ─────────────────────────►│
    │                       │                        │                    │
    │ ◄── 8. Result ────────│                        │                    │
    │   {cid, trans_id,     │                        │                    │
    │    file_hash}         │                        │                    │
```

### Retrieve Flow (Decryption)

```
Client SDK           Shade Agent (TEE)          IPFS (Pinata)
    │                       │                        │
    │ 1. prepare_retrieve ─►│                        │
    │                       │ 2. Fetch encrypted ───►│
    │                       │    data from IPFS      │
    │                       │ ◄── 3. Ciphertext ─────│
    │                       │                        │
    │ ◄── 4. AES key +     │                        │
    │    encrypted data ────│                        │
    │                       │                        │
    │ 5. Decrypt locally    │                        │
    │    (AES-256-GCM)      │                        │
    │                       │                        │
    │ 6. Plaintext data     │                        │
```

### Key Rotation Flow (on Member Revocation)

```
SDK                    NEAR Contract             Shade Agent (TEE)
 │                          │                          │
 │ revokeGroupMember() ────►│                          │
 │                          │                          │
 │                          │ NovaEvent::Revoked ─────►│
 │                          │                          │
 │                          │                          │ Generate new key
 │                          │                          │ Store in SQLite
 │                          │                          │
 │                          │ ◄── update_checksum() ───│
 │                          │                          │
 │ Revoked member cannot    │                          │
 │ claim tokens or get      │                          │
 │ the new key              │                          │
```

## Security Model

### Zero-Knowledge Design

Each component has minimal knowledge:

```
NEAR Contract knows:                Shade Agent (TEE) knows:
  ✓ Group membership                  ✓ Encryption keys per group
  ✓ Transaction history               ✓ Key metadata and versions
  ✓ TEE worker registrations          ✗ File contents
  ✓ Used nonces                       ✗ File CIDs
  ✓ Checksums                         ✗ File metadata
  ✗ File contents                     Queries NEAR for: membership,
  ✗ Encryption keys                     nonce validity

IPFS knows:                         Client SDK knows:
  ✓ Encrypted ciphertext              ✓ Plaintext (temporarily)
  ✗ Decryption keys                   ✓ Encryption key (temporarily)
  ✗ File metadata                     ✓ File CIDs
  ✗ Access permissions                Keys cleared after use
```

### Encryption Specifications

| Context | Algorithm | Key Size | Purpose |
|---------|-----------|----------|---------|
| SDK file encryption | AES-256-GCM | 256 bits | Client-side encrypt/decrypt |
| Shade Agent key storage | AES-256-CBC | 256 bits | SQLite database encryption |
| MCP Server operations | AES-256-CBC | 256 bits | Server-side crypto ops |
| File integrity | SHA-256 | 256 bits | Plaintext hashing |
| Token signatures | ed25519 | 256 bits | Token claim signing |

**Critical invariant:** Plaintext data and encryption keys never travel together. The SDK encrypts locally, then sends only ciphertext. The Shade Agent provides keys but never sees file contents.

### Trust Model

**Assumptions:**
- Phala Cloud TEE operates correctly (hardware-level guarantee)
- NEAR Protocol consensus is honest (blockchain guarantee)
- Client device is not compromised
- User's NEAR keys are secure

**Protected against:**
- Unauthorized file access (membership required for token claims)
- Key exposure (keys never leave TEE unencrypted)
- IPFS content leakage (files are encrypted before upload)
- Blockchain snooping (no sensitive data on-chain)
- Revoked member access (automatic key rotation)
- Replay attacks (nonce tracking on-chain)
- Stale token usage (5-minute timestamp window)

## Transaction Costs

| Operation | Cost | Notes |
|-----------|------|-------|
| Register group | ~0.05-0.1 NEAR | Creates on-chain group + TEE key |
| Add member | ~0.001 NEAR | On-chain membership update |
| Revoke member | ~0.001 NEAR | On-chain + key rotation |
| Upload file | ~0.01 NEAR | IPFS storage + on-chain record |
| View functions | Free | Checksums, authorization checks |

## MCP Server

The Nova MCP Server at `https://nova-mcp.fastmcp.app/mcp` acts as an Auth + Signing Proxy:

- Bridges AI assistants with Nova infrastructure
- Manages JWT session tokens for authentication
- Handles cryptographic operations server-side (AES-256-CBC)
- Retrieves encryption keys from Shade Agent TEE

## Additional Resources

- Official Documentation: https://nova-25.gitbook.io/nova-docs/
- GitHub: https://github.com/jcarbonnell/nova
- Website: https://nova-sdk.com
- NEAR Protocol: https://near.org
- Phala Network: https://phala.network
