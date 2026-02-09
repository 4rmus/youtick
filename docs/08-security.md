# Security Patterns

> **Security Architecture and Access Control**

## Security Overview

YouTick implements a multi-layer security model:

| Layer | Protection | Implementation |
|-------|------------|----------------|
| **Transport** | HTTPS | All communications encrypted |
| **Storage** | AES-256-GCM | TEE-based encryption via Nova |
| **Access** | NFT Ownership | On-chain verification |
| **Keys** | TEE Isolation | Shade Agent key management |
| **Sessions** | Time-limited | 7-day max, scoped permissions |

## Client-Side Encryption

Videos are encrypted **in the browser** before upload via Nova SDK. The server never sees unencrypted content.

```
User Browser                    Server/IPFS
    │                               │
    │ 1. Select Video               │
    │ 2. Create Nova Group          │
    │ 3. Encrypt (AES-256-GCM)      │
    │ 4. Upload Encrypted ─────────▶│
    │                               │
    │ [Encrypted blob stored]       │
```

**Key Points:**
- Encryption keys are managed by Nova's Shade Agent (TEE)
- Only group members can request decryption
- IPFS stores only encrypted blobs
- Keys never leave the TEE environment

## NFT Ownership Verification

### On-Chain Verification

```rust
// Smart contract method
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

### Nova Group Verification

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

## Session Key Security

### Permission Scoping

```typescript
// Session keys are limited to specific methods
const sessionKeyPermissions = {
  receiverId: CONTRACT_ID,
  methodNames: ["buy_ticket_prepaid", "nft_mint"],
  allowance: parseNearAmount("0.1") // Max 0.1 NEAR
};
```

### Automatic Cleanup

```typescript
// Session keys are validated on each use
async function validateSession(): Promise<boolean> {
  const session = getStoredSession();
  if (!session) return false;

  // Check if key still exists on-chain
  const accessKeys = await near.viewAccessKeyList(accountId);
  const keyExists = accessKeys.some(
    key => key.public_key === session.publicKey
  );

  if (!keyExists) {
    clearStoredSession();
    return false;
  }

  return true;
}
```

## Nova TEE Security

### Shade Agent Guarantees

| Property | Description |
|----------|-------------|
| **Confidentiality** | Code and data encrypted in memory |
| **Integrity** | Tamper-evident execution |
| **Attestation** | Cryptographic proof of correct execution |
| **Isolation** | Separated from host OS and other enclaves |

### Key Rotation

Nova automatically rotates keys when members are removed:

```typescript
// When ticket is transferred
await nova.removeMember({
  groupId: videoGroupId,
  memberId: previousOwnerAccountId
});

// Key is automatically rotated
// Previous owner can no longer decrypt
```

## API Security

### Rate Limiting

```typescript
// app/api/video/access/route.ts
import { Ratelimit } from "@upstash/ratelimit";

const ratelimit = new Ratelimit({
  limiter: Ratelimit.slidingWindow(100, "1 m") // 100 req/min
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for");
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return Response.json({ error: "Rate limited" }, { status: 429 });
  }

  // Process request...
}
```

## Security Checklist

### Before Deployment

- [ ] No hardcoded private keys
- [ ] Environment variables properly set
- [ ] Contract storage keys are V3 (collision-safe)
- [ ] Prepaid withdrawal limit is 0.1 NEAR max
- [ ] Session cache expiry is 7 days max
- [ ] Gift drop access keys are properly scoped
- [ ] CORS configured correctly
- [ ] Rate limiting enabled

### Ongoing Monitoring

- [ ] Monitor contract storage growth
- [ ] Check for unusual transaction patterns
- [ ] Verify Nova group integrity
- [ ] Audit session key creations

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Key extraction | Low | Critical | TEE isolation (no single point) |
| Content theft | Low | High | Client-side encryption |
| Session hijacking | Medium | Medium | Short expiry, scoped permissions |
| Contract exploit | Low | Critical | Audit, upgrade mechanism |
| IPFS deanonymization | Medium | Low | Content always encrypted |
| Front-running | Low | Medium | Commit-reveal (if needed) |

## Incident Response

### If Private Key Compromised

1. Immediately revoke all session keys
2. Pause contract (if owner)
3. Notify affected users
4. Deploy new contract version

### If Nova Group Compromised

1. Rotate group key immediately
2. Remove unauthorized members
3. Verify all current member access
4. Monitor for unusual decryption requests

---

**Previous**: [← Smart Contracts](./07-smart-contracts.md) | **Next**: [Frontend →](./09-frontend.md)
