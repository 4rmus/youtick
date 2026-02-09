# Shade Agent Reference

Complete reference for Nova's TEE-based key management system.

## Overview

The Shade Agent is a Trusted Execution Environment (TEE) service running on Phala Network that:
- Generates and stores encryption keys securely
- Verifies user membership via NEAR smart contract
- Provides keys only to authorized users
- Performs automatic key rotation on membership changes

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Phala Network TEE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Shade Agent                            │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │    Key      │  │  NEAR       │  │   Encryption    │  │  │
│  │  │   Store     │  │  Verifier   │  │    Engine      │  │  │
│  │  │             │  │             │  │                 │  │  │
│  │  │ AES-256-GCM │  │ Contract    │  │ Client-side    │  │  │
│  │  │   Keys      │  │  Queries    │  │  Key Delivery   │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Hardware Isolation: Intel SGX / ARM TrustZone                  │
│  Memory Encryption: Sealed Storage                               │
│  Remote Attestation: Verifiable Execution                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Security Model

### Zero-Knowledge Design

1. **Keys Never On-Chain**: Encryption keys exist only within the TEE
2. **No Key Exposure**: Keys are never sent in plaintext over the network
3. **Membership Verification**: Access is verified against NEAR contract state
4. **Forward Secrecy**: Key rotation ensures past access doesn't grant future access

### TEE Guarantees

| Property | Description |
|----------|-------------|
| **Confidentiality** | Code and data are encrypted in memory |
| **Integrity** | Tamper-evident execution |
| **Attestation** | Cryptographic proof of correct execution |
| **Isolation** | Separated from host OS and other enclaves |

### Encryption Specifications

- **Algorithm**: AES-256-GCM
- **Key Derivation**: HKDF with SHA-256
- **Nonce**: 12-byte random per encryption
- **Auth Tag**: 16-byte GCM authentication tag

## API Reference

### Base URL

```
Production: https://shade.phala.network
Testnet: https://shade-testnet.phala.network
```

### Endpoints

#### GET /health

Health check endpoint.

```bash
curl https://shade.phala.network/health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "tee_status": "active",
  "attestation_valid": true
}
```

#### POST /keys/request

Request encryption key for a group.

```bash
curl -X POST https://shade.phala.network/keys/request \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": "group-abc123",
    "account_id": "alice.near",
    "signature": "ed25519:...",
    "timestamp": 1704067200000,
    "public_key": "ed25519:..."
  }'
```

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `group_id` | string | Nova group identifier |
| `account_id` | string | NEAR account requesting access |
| `signature` | string | Ed25519 signature of request |
| `timestamp` | number | Unix timestamp (ms) |
| `public_key` | string | Client's ephemeral public key |

**Response (Success):**
```json
{
  "encrypted_key": "base64...",
  "key_version": 3,
  "expires_at": 1704070800000,
  "attestation": {
    "quote": "base64...",
    "report": "base64..."
  }
}
```

**Response (Unauthorized):**
```json
{
  "error": "UNAUTHORIZED",
  "message": "Account is not a member of this group"
}
```

#### POST /keys/rotate

Trigger key rotation for a group.

```bash
curl -X POST https://shade.phala.network/keys/rotate \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": "group-abc123",
    "reason": "member_removed",
    "callback_url": "https://rpc.near.org",
    "contract_id": "nova.near",
    "signature": "ed25519:..."
  }'
```

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `group_id` | string | Group to rotate |
| `reason` | string | Rotation reason |
| `callback_url` | string | NEAR RPC for callback |
| `contract_id` | string | Nova contract ID |
| `signature` | string | Contract signature |

**Response:**
```json
{
  "new_version": 4,
  "rotation_id": "rot-xyz789",
  "status": "completed"
}
```

#### GET /keys/status/:group_id

Get key status for a group.

```bash
curl https://shade.phala.network/keys/status/group-abc123
```

**Response:**
```json
{
  "group_id": "group-abc123",
  "key_version": 3,
  "created_at": 1704067200000,
  "last_rotated": 1704153600000,
  "rotation_count": 2,
  "algorithm": "AES-256-GCM"
}
```

#### GET /attestation

Get TEE attestation report.

```bash
curl https://shade.phala.network/attestation
```

**Response:**
```json
{
  "platform": "phala-tee-v2",
  "enclave_hash": "sha256:...",
  "quote": "base64...",
  "report": "base64...",
  "timestamp": 1704067200000,
  "valid_until": 1704153600000
}
```

## Key Request Flow

### Step-by-Step Process

```
┌─────────┐     ┌─────────┐     ┌─────────────┐     ┌──────────┐
│ Client  │     │  Shade  │     │    NEAR     │     │   IPFS   │
│  (SDK)  │     │  Agent  │     │  Contract   │     │          │
└────┬────┘     └────┬────┘     └──────┬──────┘     └────┬─────┘
     │               │                 │                  │
     │ 1. Generate   │                 │                  │
     │    ephemeral  │                 │                  │
     │    keypair    │                 │                  │
     │               │                 │                  │
     │ 2. Sign       │                 │                  │
     │    request    │                 │                  │
     │               │                 │                  │
     │ 3. Request ──▶│                 │                  │
     │    key        │                 │                  │
     │               │ 4. Verify ─────▶│                  │
     │               │    membership   │                  │
     │               │                 │                  │
     │               │◀───── 5. ───────│                  │
     │               │    Confirm      │                  │
     │               │                 │                  │
     │◀── 6. ────────│                 │                  │
     │    Encrypted  │                 │                  │
     │    key        │                 │                  │
     │               │                 │                  │
     │ 7. Decrypt    │                 │                  │
     │    with       │                 │                  │
     │    ephemeral  │                 │                  │
     │               │                 │                  │
     │ 8. Use key ───────────────────────────────────────▶│
     │    to decrypt │                 │                  │
     │    file       │                 │                  │
     │               │                 │                  │
```

### Code Example

```typescript
// 1. Generate ephemeral keypair
const ephemeralKeypair = await crypto.generateKeyPair('x25519');

// 2. Create signed request
const timestamp = Date.now();
const message = `${groupId}:${accountId}:${timestamp}`;
const signature = await nearAccount.sign(message);

// 3. Request key from Shade Agent
const response = await fetch(`${shadeAgentUrl}/keys/request`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    group_id: groupId,
    account_id: accountId,
    signature: signature,
    timestamp: timestamp,
    public_key: ephemeralKeypair.publicKey
  })
});

const { encrypted_key, attestation } = await response.json();

// 4. Verify attestation (optional but recommended)
const isValid = await verifyAttestation(attestation);

// 5. Decrypt the key using ephemeral private key
const decryptionKey = await crypto.deriveKey(
  ephemeralKeypair.privateKey,
  encrypted_key
);

// 6. Use key to decrypt file content
const decryptedContent = await crypto.decrypt(
  encryptedFileData,
  decryptionKey
);
```

## Key Rotation

### Automatic Triggers

Key rotation is automatically triggered when:

1. **Member Removed**: Ensures removed member loses access
2. **Role Downgraded**: Admin → Member triggers rotation
3. **Security Event**: Suspicious activity detected
4. **Scheduled**: Optional periodic rotation

### Rotation Process

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│  NEAR   │     │    Shade    │     │   Existing  │     │   New    │
│Contract │     │    Agent    │     │   Members   │     │   Key    │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └────┬─────┘
     │                 │                   │                  │
     │ 1. Remove ─────▶│                   │                  │
     │    member       │                   │                  │
     │                 │                   │                  │
     │                 │ 2. Generate ──────────────────────────▶
     │                 │    new key        │                  │
     │                 │                   │                  │
     │                 │ 3. Increment ────▶│                  │
     │                 │    version        │                  │
     │                 │                   │                  │
     │◀── 4. ──────────│                   │                  │
     │    Callback     │                   │                  │
     │    new_version  │                   │                  │
     │                 │                   │                  │
     │                 │                   │ 5. Next request  │
     │                 │                   │    gets new key  │
     │                 │                   │◀─────────────────│
     │                 │                   │                  │
```

### Forward Secrecy Guarantees

After rotation:
- **Old files**: Still accessible with old key (stored in version map)
- **New files**: Encrypted with new key
- **Removed member**: Cannot get new key
- **Remaining members**: Seamless access to all files

## Attestation Verification

### Verifying TEE Attestation

```typescript
import { verifyPhalaTeeAttestation } from 'phala-attestation';

async function verifyShadeAgent(attestation: Attestation): Promise<boolean> {
  // 1. Verify the attestation quote
  const quoteValid = await verifyPhalaTeeAttestation({
    quote: attestation.quote,
    report: attestation.report,
    expectedMrEnclave: EXPECTED_SHADE_AGENT_HASH
  });

  if (!quoteValid) {
    throw new Error('Invalid TEE attestation');
  }

  // 2. Check attestation freshness
  const now = Date.now();
  if (attestation.timestamp < now - 3600000) { // 1 hour
    throw new Error('Stale attestation');
  }

  // 3. Verify enclave identity
  if (attestation.enclave_hash !== EXPECTED_SHADE_AGENT_HASH) {
    throw new Error('Unknown enclave');
  }

  return true;
}
```

### Expected Enclave Hashes

| Version | Environment | MrEnclave Hash |
|---------|-------------|----------------|
| v1.0.0 | Mainnet | `sha256:abc123...` |
| v1.0.0 | Testnet | `sha256:def456...` |

## Error Handling

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `UNAUTHORIZED` | Not a group member | Verify membership |
| `GROUP_NOT_FOUND` | Group doesn't exist | Check group_id |
| `INVALID_SIGNATURE` | Signature verification failed | Re-sign request |
| `TIMESTAMP_EXPIRED` | Request too old | Use current timestamp |
| `KEY_ROTATION_IN_PROGRESS` | Rotation ongoing | Retry after delay |
| `TEE_UNAVAILABLE` | TEE service down | Retry with backoff |
| `ATTESTATION_FAILED` | Attestation invalid | Contact support |

### Retry Strategy

```typescript
async function requestKeyWithRetry(params: KeyRequestParams): Promise<Key> {
  const maxRetries = 3;
  const baseDelay = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestKey(params);
    } catch (error) {
      if (error.code === 'KEY_ROTATION_IN_PROGRESS') {
        await sleep(baseDelay * Math.pow(2, i));
        continue;
      }
      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}
```

## Security Best Practices

### Client-Side

1. **Always verify attestation** before trusting keys
2. **Use ephemeral keypairs** for key exchange
3. **Don't cache keys** longer than necessary
4. **Clear sensitive data** from memory after use

### Integration

1. **HTTPS only** for all Shade Agent communication
2. **Pin TLS certificates** in production
3. **Validate all responses** before processing
4. **Implement proper error handling**

### Key Storage

1. **Never persist encryption keys** to disk
2. **Use secure memory** where available
3. **Zero memory** after key use
4. **Rely on Shade Agent** as the key source

## Monitoring

### Health Monitoring

```typescript
async function monitorShadeAgent() {
  const health = await fetch(`${shadeAgentUrl}/health`);
  const status = await health.json();

  if (status.status !== 'healthy') {
    alert('Shade Agent unhealthy');
  }

  if (!status.attestation_valid) {
    alert('TEE attestation invalid');
  }
}
```

### Metrics Available

- Key request latency
- Rotation frequency
- Error rates by type
- Attestation verification status
