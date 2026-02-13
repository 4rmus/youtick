# Security Model

> **Multi-Layer Security Architecture** -- Transport, Storage, Access Control, Key Management, and Content Moderation

---

## Security Overview

YouTick implements defense-in-depth across six layers. No single layer's failure compromises the entire system.

| Layer | Protection | Implementation |
|-------|------------|----------------|
| **Transport** | HTTPS | All communications encrypted in transit |
| **Storage** | AES-256-GCM | TEE-based encryption via Nova Protocol |
| **Access** | NFT Ownership | On-chain verification on NEAR Protocol |
| **Keys** | TEE Isolation | Shade Agent manages keys inside secure enclave |
| **Sessions** | 24h max | Scoped permissions, limited allowance, automatic cleanup |
| **Moderation** | On-chain bans | Content moderation with typed reasons (V8) |

---

## Client-Side Encryption

Videos are encrypted **in the browser** before upload. The server and IPFS network only ever see encrypted blobs.

```
User Browser                              IPFS (Crust Network)
    |                                          |
    |  1. Select video file                    |
    |  2. Generate AES-256-GCM key             |
    |  3. Encrypt file client-side             |
    |  4. Upload encrypted blob -------------->|
    |  5. Store AES key in Nova TEE            |
    |                                          |
    |  [Only encrypted data leaves browser]    |
```

### Encryption Flow

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
| Max expiry | 24 hours | Limits window of exposure |
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

## Content Moderation (V8)

### On-Chain Ban System

YouTick implements an on-chain content moderation system with typed ban reasons:

```rust
pub enum BanReason {
    SexualContent,
    CopyrightViolation,
    Other,
}

pub struct BanInfo {
    pub reason: BanReason,
    pub banned_at: u64,
    pub banned_by: AccountId,
}
```

### Ban Enforcement

Banned events are blocked across all contract operations:

| Operation | Ban Check | Effect |
|-----------|-----------|--------|
| `get_events` | Excluded | Banned events not returned |
| `get_events_paginated` | Excluded | Banned events not returned |
| `buy_ticket` | Blocked | "Event has been banned" error |
| `buy_ticket_prepaid` | Blocked | "Event has been banned" error |
| `create_gift_drop` | Blocked | Cannot create gifts for banned events |
| `claim_gift` | Blocked | Cannot claim gifts for banned events |
| `claim_free_ticket_sponsored` | Blocked | Cannot claim free tickets for banned events |

### Ban Management (Owner Only)

```bash
# Ban an event
near call youtick-prod-v1.near ban_event \
  '{"encrypted_cid":"Qm...","reason":"CopyrightViolation"}' \
  --accountId youtick-prod-v1.near

# Unban an event
near call youtick-prod-v1.near unban_event \
  '{"encrypted_cid":"Qm..."}' \
  --accountId youtick-prod-v1.near

# List all banned events
near view youtick-prod-v1.near get_banned_events '{}' \
  --accountId youtick-prod-v1.near
```

### Ban Security Properties

- Ban data stored in lazy `LookupMap` (no migration required to add)
- Only contract owner can ban/unban events
- Ban checks use `require!()` assertions -- cannot be bypassed
- `get_event` view includes ban status transparently in response
- Existing NFT holders retain their tokens but new purchases are blocked

---

## Purchase Audit Trail (V6+)

Every ticket purchase is logged on-chain with full traceability:

```rust
pub struct PurchaseLog {
    pub buyer_id: AccountId,
    pub creator_id: AccountId,
    pub event_cid: String,
    pub token_id: String,
    pub price: U128,
    pub creator_amount: U128,      // 98% of price
    pub commission_amount: U128,   // 2% of price
    pub purchase_type: PurchaseType,
    pub timestamp_ns: u64,
}

pub enum PurchaseType {
    Direct,   // buy_ticket (wallet signature)
    Prepaid,  // buy_ticket_prepaid (session key)
    Free,     // price == 0
}
```

### Audit Capabilities

- Query individual purchase records by ID
- Paginated listing of all purchase history
- Total purchase count for analytics
- Purchase type tracking for behavioral analysis
- Timestamp precision to nanoseconds for ordering guarantees

---

## Rate Limiting

YouTick implements rate limiting at multiple levels to prevent abuse.

### Client-Side Rate Limiter

A sliding window rate limiter protects trial account creation and other sensitive endpoints.

### On-Chain Rate Limiting

The smart contract enforces daily trial limits:

```rust
fn check_and_increment_daily_limit(&mut self) -> bool {
    let today = Self::get_day_timestamp();
    let current = self.daily_trial_counts.get(&today).unwrap_or(0);

    if self.onboarding_config.daily_limit > 0
        && current >= self.onboarding_config.daily_limit {
        return false;
    }

    self.daily_trial_counts.insert(&today, &(current + 1));
    true
}
```

### Configured Rate Limits

| Endpoint | Window | Limit | Enforcement |
|----------|--------|-------|-------------|
| Trial account creation (per IP) | 24 hours | 3 requests | Client-side |
| Trial accounts (global daily) | 24 hours | 100 total | On-chain contract |
| Uploads (per account) | 1 hour | 10 requests | Client-side |

---

## Security Checklist

### Before Deployment

- [ ] No hardcoded private keys in source code
- [ ] Environment variables properly set in `.env.local`
- [ ] Contract storage keys are V8 (collision-safe)
- [ ] Prepaid withdrawal limit is 0.1 NEAR max
- [ ] Session key allowance is 0.25 NEAR max
- [ ] Session cache expiry is 24 hours max
- [ ] Gift drop access keys are properly scoped
- [ ] CORS configured correctly for API routes
- [ ] Rate limiting enabled on trial account endpoints
- [ ] Nova API key is set and not exposed in client bundles
- [ ] Onboarding key is a Function Call access key with restricted scope
- [ ] RPC failover endpoints are configured (fastnear, near.org, lava.build)
- [ ] Content moderation ban system operational
- [ ] Nova auto-funding caps verified

### Ongoing Monitoring

- [ ] Monitor contract storage growth via `near state youtick-prod-v1.near`
- [ ] Check for unusual transaction patterns on NearBlocks
- [ ] Verify Nova group integrity (member counts match ticket sales)
- [ ] Audit session key creations (watch for mass key generation)
- [ ] Monitor trial pool balance via `get_trial_pool_balance`
- [ ] Monitor commission pool balance via `get_commission_pool`
- [ ] Review purchase logs for anomalous patterns
- [ ] Verify Crust storage replicas for uploaded content
- [ ] Review banned events list periodically

---

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| **Key extraction from TEE** | Low | Critical | Hardware-level TEE isolation (Shade Agent). No single point of key exposure. Attestation verification. |
| **Content theft (encrypted data)** | Low | High | Client-side AES-256-GCM encryption. IPFS stores only encrypted blobs. Key retrieval requires group membership. |
| **Session key hijacking** | Medium | Medium | 24h max expiry, scoped permissions (specific methods only), 0.25 NEAR max allowance, on-chain validation per use. |
| **Smart contract exploit** | Low | Critical | NEP-171 standard compliance, V8 collision-safe storage keys, state migration audit trail, owner-only admin methods. |
| **IPFS content deanonymization** | Medium | Low | Content is always encrypted before upload. CIDs alone reveal nothing about content. |
| **Front-running attacks** | Low | Medium | Commit-reveal pattern available if needed. Prepaid balance model reduces on-chain bid visibility. |
| **Trial account spam** | Medium | Medium | Per-IP rate limiting (3/day), global daily cap (100/day), contract-enforced counters, trial pool balance check. |
| **Nova group manipulation** | Low | High | Group creation restricted to platform account. Member additions require on-chain ticket ownership proof. |
| **Banned content re-upload** | Medium | Medium | CID-based banning. Re-upload produces different CID requiring new ban. Content hash tracking can be added. |
| **Commission pool theft** | Low | Critical | Owner-only withdrawal. Separate pool from trial pool. On-chain audit trail. |

---

## Incident Response

### Private Key Compromised

1. **Immediately revoke all session keys** via `deleteKey` on the affected NEAR account
2. **Pause contract** if the compromised key has owner-level access
3. **Notify affected users** through available channels
4. **Deploy new contract version** if contract-level access was compromised
5. **Audit transaction history** on NearBlocks for unauthorized operations
6. **Rotate all related access keys** on the account

### Nova Group Compromised

1. **Rotate group key immediately** -- Nova handles this when members are removed
2. **Remove all unauthorized members** from the group
3. **Verify all current member access** against on-chain ticket ownership
4. **Monitor for unusual decryption requests** in Nova logs
5. **Re-encrypt content** if key material may have been extracted (create new group, re-upload)

### Trial Pool Drained

1. **Check `get_trial_pool_balance`** to confirm depletion
2. **Review trial creation logs** for spam patterns
3. **Verify rate limiter state** on-chain via `get_daily_trial_count`
4. **Fund trial pool** with additional NEAR once abuse is mitigated
5. **Adjust rate limits** via `set_onboarding_config` if needed

### Content Moderation Incident

1. **Ban the event** immediately via `ban_event` with appropriate `BanReason`
2. **Verify ban enforcement** by checking `is_event_banned` and confirming exclusion from listings
3. **Review related events** from the same creator
4. **Audit purchase logs** for the banned event to assess impact
5. **Consider creator account restrictions** if pattern of violations

---

Back to [Documentation Index](./README.md)
