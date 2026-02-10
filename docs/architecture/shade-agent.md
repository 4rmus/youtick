# Shade Agent Reference

Complete reference for YouTick's TEE-based key management system via Nova's Shade Agent.

## Overview

The Shade Agent is a Trusted Execution Environment (TEE) service running on Phala Network that:
- Generates and stores encryption keys securely
- Verifies user membership via NEAR smart contract
- Provides keys only to authorized ticket holders
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
│  │  │ AES-256-GCM │  │ YouTick     │  │ Client-side    │  │  │
│  │  │   Keys      │  │  Contract   │  │  Key Delivery   │  │  │
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
3. **Membership Verification**: Access verified against YouTick NEAR contract
4. **Forward Secrecy**: Key rotation ensures past access doesn't grant future access

### TEE Guarantees

| Property | Description |
|----------|-------------|
| **Confidentiality** | Code and data encrypted in memory |
| **Integrity** | Tamper-evident execution |
| **Attestation** | Cryptographic proof of correct execution |
| **Isolation** | Separated from host OS and other enclaves |

### Encryption Specifications

| Specification | Value |
|---------------|-------|
| **Algorithm** | AES-256-GCM |
| **Key Derivation** | HKDF with SHA-256 |
| **Nonce** | 12-byte random per encryption |
| **Auth Tag** | 16-byte GCM authentication tag |

## API Reference

### Base URLs

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

Request encryption key for a video group.

```bash
curl -X POST https://shade.phala.network/keys/request \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": "video-abc123",
    "account_id": "viewer.near",
    "signature": "ed25519:...",
    "timestamp": 1704067200000,
    "public_key": "ed25519:..."
  }'
```

**Request Parameters:**

| Field | Type | Description |
|-------|------|-------------|
| `group_id` | string | Video's Nova group ID |
| `account_id` | string | NEAR account requesting access |
| `signature` | string | Ed25519 signature of request |
| `timestamp` | number | Unix timestamp (ms) |
| `public_key` | string | Client's ephemeral public key |

**Success Response:**
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

**Error Response (Unauthorized):**
```json
{
  "error": "UNAUTHORIZED",
  "message": "Account does not own a ticket for this video"
}
```

#### GET /keys/status/:group_id

Get key status for a video group.

```bash
curl https://shade.phala.network/keys/status/video-abc123
```

**Response:**
```json
{
  "group_id": "video-abc123",
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
│ Client  │     │  Shade  │     │  YouTick    │     │   IPFS   │
│  (Web)  │     │  Agent  │     │  Contract   │     │          │
└────┬────┘     └────┬────┘     └──────┬──────┘     └────┬─────┘
     │               │                 │                  │
     │ 1. Generate   │                 │                  │
     │    ephemeral  │                 │                  │
     │    keypair    │                 │                  │
     │               │                 │                  │
     │ 2. Sign with  │                 │                  │
     │    Session Key│                 │                  │
     │               │                 │                  │
     │ 3. Request ──▶│                 │                  │
     │    key        │                 │                  │
     │               │ 4. Verify ─────▶│                  │
     │               │    ticket owner │                  │
     │               │                 │                  │
     │               │◀───── 5. ───────│                  │
     │               │    Confirmed    │                  │
     │               │                 │                  │
     │◀── 6. ────────│                 │                  │
     │    Encrypted  │                 │                  │
     │    key        │                 │                  │
     │               │                 │                  │
     │ 7. Decrypt    │                 │                  │
     │    with       │                 │                  │
     │    ephemeral  │                 │                  │
     │               │                 │                  │
     │ 8. Decrypt ───────────────────────────────────────▶│
     │    video      │                 │                  │
     │               │                 │                  │
```

### Code Implementation

```typescript
// In lib/nova/auth.ts

export async function requestDecryptionKey(
  groupId: string,
  accountId: string,
  sessionManager: SessionKeyManager
): Promise<Uint8Array> {
  // 1. Generate ephemeral keypair for secure key exchange
  const ephemeralKeypair = await crypto.subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveBits']
  );

  // 2. Create signed request using Session Key (signless)
  const timestamp = Date.now();
  const message = `${groupId}:${accountId}:${timestamp}`;
  const signature = await sessionManager.sign(message);

  // 3. Request key from Shade Agent
  const response = await fetch(`${SHADE_AGENT_URL}/keys/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      group_id: groupId,
      account_id: accountId,
      signature: signature,
      timestamp: timestamp,
      public_key: await exportPublicKey(ephemeralKeypair.publicKey)
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new NovaError(error.error, error.message);
  }

  const { encrypted_key, attestation } = await response.json();

  // 4. Verify attestation (optional but recommended)
  await verifyAttestation(attestation);

  // 5. Decrypt the key using ephemeral private key
  const decryptionKey = await crypto.subtle.deriveBits(
    { name: 'X25519', public: encrypted_key },
    ephemeralKeypair.privateKey,
    256
  );

  return new Uint8Array(decryptionKey);
}
```

## Key Rotation

### Automatic Triggers

Key rotation is triggered automatically when:

1. **Ticket Transfer**: Seller removed from group
2. **Ticket Revocation**: Admin removes access
3. **Security Event**: Suspicious activity detected

### Rotation Process

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐
│YouTick  │     │    Shade    │     │   Ticket    │
│Contract │     │    Agent    │     │   Holders   │
└────┬────┘     └──────┬──────┘     └──────┬──────┘
     │                 │                   │
     │ 1. Ticket ─────▶│                   │
     │    transferred  │                   │
     │                 │                   │
     │                 │ 2. Generate       │
     │                 │    new key        │
     │                 │                   │
     │                 │ 3. Increment      │
     │                 │    version        │
     │                 │                   │
     │◀── 4. ──────────│                   │
     │    New version  │                   │
     │                 │                   │
     │                 │                   │ 5. Next request
     │                 │                   │    gets new key
     │                 │                   │◀────────────────
     │                 │                   │
```

### Forward Secrecy Guarantees

After rotation:
- **Previous viewers**: Old key still works for their cached content
- **New uploads**: Encrypted with new key
- **Removed viewers**: Cannot get new key
- **Current holders**: Seamless access continues

## Error Handling

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `UNAUTHORIZED` | No ticket ownership | Purchase ticket first |
| `GROUP_NOT_FOUND` | Video group missing | Check group_id |
| `INVALID_SIGNATURE` | Signature failed | Re-sign with Session Key |
| `TIMESTAMP_EXPIRED` | Request too old | Use current timestamp |
| `KEY_ROTATION_IN_PROGRESS` | Rotation ongoing | Retry after 2 seconds |
| `TEE_UNAVAILABLE` | TEE service down | Retry with exponential backoff |

### Retry Strategy

```typescript
async function requestKeyWithRetry(
  groupId: string,
  accountId: string,
  maxRetries = 3
): Promise<Uint8Array> {
  const baseDelay = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestDecryptionKey(groupId, accountId);
    } catch (error) {
      if (error.code === 'KEY_ROTATION_IN_PROGRESS') {
        await sleep(baseDelay * Math.pow(2, i));
        continue;
      }
      if (error.code === 'TEE_UNAVAILABLE') {
        await sleep(baseDelay * Math.pow(2, i));
        continue;
      }
      throw error;
    }
  }

  throw new NovaError('MAX_RETRIES', 'Failed after maximum retries');
}
```

## Security Best Practices

### Client-Side

1. **Always verify attestation** before trusting keys
2. **Use ephemeral keypairs** for every key exchange
3. **Don't cache keys** longer than video playback session
4. **Clear sensitive data** from memory after use

### Integration

1. **HTTPS only** for all Shade Agent communication
2. **Validate all responses** before processing
3. **Implement proper error handling** with user feedback
4. **Log decentralization metrics** for monitoring

### Key Storage

1. **Never persist encryption keys** to disk or localStorage
2. **Use secure memory** where available (Web Crypto API)
3. **Zero memory** after key use
4. **Rely on Shade Agent** as the authoritative key source

## Monitoring

### Health Monitoring

```typescript
// In lib/nova/health.ts

export async function checkShadeAgentHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${SHADE_AGENT_URL}/health`, {
      timeout: 5000
    });
    const status = await response.json();

    if (status.status !== 'healthy') {
      console.warn('[NOVA] Shade Agent unhealthy:', status);
      return false;
    }

    if (!status.attestation_valid) {
      console.error('[NOVA] TEE attestation invalid');
      return false;
    }

    return true;
  } catch (error) {
    console.error('[NOVA] Shade Agent unreachable:', error);
    return false;
  }
}
```

### Decentralization Metrics

```typescript
// Log for monitoring
console.log('[DECENTRALIZATION_METRIC] shade_agent_request', {
  accountId,
  groupId,
  latency_ms: Date.now() - startTime,
  success: true
});
```

## Related Documentation

- [Nova Protocol](./nova-protocol.md) - System architecture
- [Session Keys](./session-keys.md) - Authentication flow
- [Security Guide](../security.md) - Security best practices
