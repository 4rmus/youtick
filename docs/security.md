# Security Model

> **Multi-Layer Security Architecture** -- Transport, Storage, Access Control, Key Management, and Session Isolation

---

## Security Overview

YouTick implements defense-in-depth across five layers. No single layer's failure compromises the entire system.

| Layer | Protection | Implementation |
|-------|------------|----------------|
| **Transport** | HTTPS | All communications encrypted in transit |
| **Storage** | AES-256-GCM | TEE-based encryption via Nova Protocol |
| **Access** | NFT Ownership | On-chain verification on NEAR Protocol |
| **Keys** | TEE Isolation | Shade Agent manages keys inside secure enclave |
| **Sessions** | 7-day max | Scoped permissions, limited allowance, automatic cleanup |

---

## Client-Side Encryption

Videos are encrypted **in the browser** before upload. The server and IPFS network only ever see encrypted blobs.

```
User Browser                              IPFS (Crust Network)
    |                                          |
    |  1. Select video file                    |
    |  2. Generate AES-256-GCM key             |
    |  3. Encrypt file client-side             |
    |  4. Upload encrypted blob ──────────────>|
    |  5. Store AES key in Nova TEE            |
    |                                          |
    |  [Only encrypted data leaves browser]    |
```

### Encryption Flow (TypeScript)

The hybrid upload encrypts client-side, stores the binary on Crust, and keeps only the tiny AES key (~44 bytes) in Nova's TEE for access control.

```typescript
import { generateEncryptionKey, encryptFile } from '../crypto/aes-gcm';
import { uploadToCrust } from '../crust';
import { storeEncryptionKey } from './key-storage';

// 1. Client-side AES-256-GCM encryption
const aesKey = await generateEncryptionKey();
const plainBytes = new Uint8Array(await file.arrayBuffer());
const encrypted = await encryptFile(plainBytes, aesKey);

// 2. Upload encrypted binary to Crust (no base64 inflation)
const encryptedBlob = new Blob(
  [encrypted.buffer as ArrayBuffer],
  { type: 'application/octet-stream' }
);
const crustResult = await uploadToCrust(encryptedBlob, accountId);

// 3. Store tiny AES key in Nova TEE (access-controlled)
const keyCid = await storeEncryptionKey(groupId, aesKey, accountId);
```

### Decryption Flow

Decryption reverses the process: retrieve the AES key from Nova (requires group membership), fetch encrypted data from Crust, and decrypt client-side.

```typescript
import { retrieveEncryptionKey } from './key-storage';
import { fetchFromGateways } from '../crust';
import { decryptFile } from '../crypto/aes-gcm';

// 1. Retrieve AES key from Nova (TEE-protected, membership required)
const aesKey = await retrieveEncryptionKey(groupId, keyCid, requester);

// 2. Fetch encrypted binary from Crust gateways
const response = await fetchFromGateways(cid);
const encrypted = new Uint8Array(await response.arrayBuffer());

// 3. Decrypt client-side
const decrypted = await decryptFile(encrypted, aesKey);
```

**Key guarantees:**
- Encryption keys are managed by Nova's Shade Agent (TEE)
- Only group members can request decryption keys
- IPFS/Crust stores only encrypted blobs
- Keys never leave the TEE environment in plaintext

---

## NFT Ownership Verification

### On-Chain Verification

The smart contract provides a view method to verify whether an account owns a ticket for a given video.

```rust
// Smart contract method (Rust)
pub fn verify_ownership(&self, account_id: AccountId, cid: String) -> bool {
    let tokens = self.nft_tokens_for_owner(account_id.clone(), None, None);

    tokens.iter().any(|token| {
        if let Some(video_meta) = &token.video_metadata {
            video_meta.encrypted_cid == cid
        } else {
            false
        }
    })
}
```

### Nova Group Membership Check

After ownership is confirmed on-chain, the frontend verifies Nova group membership before requesting decryption.

```typescript
// Verify membership before decryption
const hasAccess = await nova.verifyMembership({
  groupId: videoGroupId,
  accountId: viewerAccountId
});

if (!hasAccess) {
  throw new Error('Not authorized to view this content');
}
```

This double verification (on-chain ownership + Nova group membership) ensures that access control cannot be bypassed by manipulating only one layer.

---

## Session Key Security

Session Keys provide signless UX by creating a restricted access key on the user's NEAR account. These keys are scoped to prevent misuse.

### Permission Scoping

```typescript
// Session keys are limited to specific contract methods
const sessionKeyPermissions = {
  receiverId: CONTRACT_ID,       // Only this contract
  methodNames: [                 // Only these methods
    "buy_ticket_prepaid",
    "nft_mint",
    "create_event",
    "deposit_funds"
  ],
  allowance: parseNearAmount("0.25")  // Max 0.25 NEAR total spend
};
```

### Automatic Cleanup and On-Chain Validation

Session keys are validated against the blockchain on every use. Stale or revoked keys are automatically removed from local storage.

```typescript
async function hasSessionKey(): Promise<boolean> {
  const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
  if (!keyPair) return false;

  // Verify key still exists on-chain
  const account = new Account(this.accountId, rpcUrl);
  const accessKeyList = await account.getAccessKeyList();
  const publicKey = keyPair.getPublicKey().toString();
  const accessKeyInfo = accessKeyList.keys.find(
    (k: { public_key: string }) => k.public_key === publicKey
  );

  if (!accessKeyInfo) {
    // Key was revoked or expired on-chain -- remove local copy
    await this.keyStore.removeKey(NETWORK_ID, this.accountId);
    return false;
  }

  // Verify the key targets the correct contract
  const permission = accessKeyInfo.access_key.permission;
  if (typeof permission === 'object' && 'FunctionCall' in permission) {
    if (permission.FunctionCall.receiver_id !== CONTRACT_ID) {
      await this.keyStore.removeKey(NETWORK_ID, this.accountId);
      return false;
    }
  }

  return true;
}
```

### Session Key Constraints

| Property | Value | Rationale |
|----------|-------|-----------|
| Max allowance | 0.25 NEAR | Limits financial exposure per session |
| Scoped methods | `buy_ticket_prepaid`, `nft_mint`, `create_event`, `deposit_funds` | Prevents unauthorized operations |
| Storage | Browser `localStorage` | Keys never leave the user's device |
| On-chain validation | Every use | Prevents use of revoked keys |
| Key type | ed25519 `FunctionCall` access key | Cannot transfer NEAR or call other contracts |

---

## Nova TEE Security

### Shade Agent Guarantees

The Nova Shade Agent runs inside a Trusted Execution Environment (TEE), providing hardware-level security for encryption key management.

| Property | Description |
|----------|-------------|
| **Confidentiality** | Code and data encrypted in memory; inaccessible to host OS |
| **Integrity** | Tamper-evident execution; any modification is detected |
| **Attestation** | Cryptographic proof of correct execution environment |
| **Isolation** | Separated from host OS and other enclaves |

### TEE Attestation Verification

YouTick supports opt-in attestation verification before sensitive operations.

```typescript
export interface TEEAttestation {
  platform: string;        // e.g. "phala", "sgx"
  enclave_hash: string;    // Enclave measurement hash
  quote: string;           // Raw attestation quote
  report: string;          // Attestation report body
  timestamp: number;       // When attestation was generated
  valid_until: number;     // Attestation validity deadline
}
```

### Key Rotation on Member Removal

Nova automatically rotates encryption keys when members are removed from a group. This guarantees that previous ticket holders who transferred or sold their NFT can no longer decrypt the content.

```typescript
// When an NFT ticket is transferred to a new owner
await nova.removeMember({
  groupId: videoGroupId,
  memberId: previousOwnerAccountId
});
// Key is automatically rotated inside TEE
// Previous owner can no longer decrypt content
```

---

## Rate Limiting

YouTick implements rate limiting at multiple levels to prevent abuse.

### Client-Side Rate Limiter

A sliding window rate limiter with file-based persistence protects trial account creation and other sensitive endpoints.

```typescript
class RateLimiter {
  private cache: Map<string, RateLimitEntry> = new Map();
  private config: RateLimiterConfig;

  checkLimit(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let entry = this.cache.get(identifier);
    if (!entry) {
      entry = { timestamps: [] };
      this.cache.set(identifier, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

    if (entry.timestamps.length >= this.config.maxRequests) {
      return false; // Rate limited
    }

    entry.timestamps.push(now);
    return true;
  }
}
```

### Configured Rate Limits

| Endpoint | Window | Limit | Persistence |
|----------|--------|-------|-------------|
| Trial account creation (per IP) | 24 hours | 3 requests | File-based + contract sync |
| Trial accounts (global daily) | 24 hours | 100 total | File-based + NEAR contract sync |
| Uploads (per account) | 1 hour | 10 requests | In-memory |

### Daily Global Limiter

The `DailyGlobalLimiter` syncs its count from the NEAR contract's `get_daily_trial_count()` view method on cold start, preventing bypass through server restarts.

---

## Security Checklist

### Before Deployment

- [ ] No hardcoded private keys in source code
- [ ] Environment variables properly set in `.env.local`
- [ ] Contract storage keys are V7 (collision-safe)
- [ ] Prepaid withdrawal limit is 0.1 NEAR max
- [ ] Session key allowance is 0.25 NEAR max
- [ ] Session cache expiry is 7 days max
- [ ] Gift drop access keys are properly scoped (`create_sponsored_trial_direct`, `claim_free_ticket_direct`)
- [ ] CORS configured correctly for API routes
- [ ] Rate limiting enabled on trial account endpoints
- [ ] Nova API key is set and not exposed in client bundles (use `NEXT_PUBLIC_` prefix only for public values)
- [ ] Onboarding key is a Function Call access key with restricted method scope
- [ ] RPC failover endpoints are configured (fastnear, near.org, lava.build)

### Ongoing Monitoring

- [ ] Monitor contract storage growth via `near state youtick-prod-v1.near`
- [ ] Check for unusual transaction patterns on NearBlocks
- [ ] Verify Nova group integrity (member counts match ticket sales)
- [ ] Audit session key creations (watch for mass key generation)
- [ ] Monitor trial pool balance via `get_trial_pool_balance`
- [ ] Review rate limiter logs for abuse patterns
- [ ] Verify Crust storage replicas for uploaded content

---

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| **Key extraction from TEE** | Low | Critical | Hardware-level TEE isolation (Shade Agent). No single point of key exposure. Attestation verification. |
| **Content theft (encrypted data)** | Low | High | Client-side AES-256-GCM encryption. IPFS stores only encrypted blobs. Key retrieval requires group membership. |
| **Session key hijacking** | Medium | Medium | 7-day max expiry, scoped permissions (specific methods only), 0.25 NEAR max allowance, on-chain validation per use. |
| **Smart contract exploit** | Low | Critical | NEP-171 standard compliance, storage key V7 collision safety, upgrade mechanism for patches. |
| **IPFS content deanonymization** | Medium | Low | Content is always encrypted before upload. CIDs alone reveal nothing about content. |
| **Front-running attacks** | Low | Medium | Commit-reveal pattern available if needed. Prepaid balance model reduces on-chain bid visibility. |
| **Trial account spam** | Medium | Medium | Per-IP rate limiting (3/day), global daily cap (100/day), contract-synced counters, trial pool balance check. |
| **Nova group manipulation** | Low | High | Group creation restricted to platform account. Member additions require on-chain ticket ownership proof. |

---

## Incident Response

### Private Key Compromised

If a NEAR account private key or session key is compromised:

1. **Immediately revoke all session keys** via `deleteKey` on the affected NEAR account
2. **Pause contract** if the compromised key has owner-level access
3. **Notify affected users** through available channels
4. **Deploy new contract version** if contract-level access was compromised
5. **Audit transaction history** on NearBlocks for unauthorized operations
6. **Rotate all related access keys** on the account

### Nova Group Compromised

If unauthorized access to a Nova group is detected:

1. **Rotate group key immediately** -- Nova handles this when members are removed
2. **Remove all unauthorized members** from the group
3. **Verify all current member access** against on-chain ticket ownership
4. **Monitor for unusual decryption requests** in Nova logs
5. **Re-encrypt content** if key material may have been extracted (create new group, re-upload)

### Trial Pool Drained

If the trial pool balance reaches zero unexpectedly:

1. **Check `get_trial_pool_balance`** to confirm depletion
2. **Review trial creation logs** for spam patterns
3. **Verify rate limiter state** (check `/tmp/youtick-rate-limits/`)
4. **Fund trial pool** with additional NEAR once abuse is mitigated
5. **Adjust rate limits** if the current configuration was insufficient

---

Back to [Documentation Index](./README.md)
