# Security Patterns

> **Security Architecture and Access Control**

## Security Overview

YouTick implements a multi-layer security model:

| Layer | Protection | Implementation |
|-------|------------|----------------|
| **Transport** | HTTPS | All communications encrypted |
| **Storage** | AES-256-GCM | Client-side encryption via Lit |
| **Access** | NFT Ownership | On-chain verification |
| **Keys** | MPC | NEAR Chain Signatures |
| **Sessions** | Time-limited | 7-day max, scoped permissions |

## Client-Side Encryption

Videos are encrypted **in the browser** before upload. The server never sees unencrypted content.

```
User Browser                    Server/IPFS
    │                               │
    │ 1. Select Video               │
    │ 2. Generate Key (Lit)         │
    │ 3. Encrypt (AES-256-GCM)      │
    │ 4. Upload Encrypted ─────────▶│
    │                               │
    │ [Encrypted blob stored]       │
```

**Key Points:**
- Encryption key is derived from Lit Protocol PKP
- Only wallet owner can request decryption
- IPFS stores only encrypted blobs

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

### Lit Action Verification

```javascript
// Executed on Lit nodes
const verifyOwnership = async (nearContract, accountId, cid) => {
  const response = await Lit.Actions.call({
    url: "https://test.rpc.fastnear.com",
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "query",
      params: {
        request_type: "call_function",
        account_id: nearContract,
        method_name: "verify_ownership",
        args_base64: btoa(JSON.stringify({ account_id: accountId, cid }))
      }
    })
  });
  
  return JSON.parse(response.body).result.result;
};
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

### JWT Token Validation

```typescript
// For premium features
import { verify } from "jsonwebtoken";

function validateAccessToken(token: string): AccessClaims {
  try {
    return verify(token, process.env.JWT_SECRET) as AccessClaims;
  } catch {
    throw new Error("Invalid or expired token");
  }
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
- [ ] Verify Lit Action CID hasn't changed
- [ ] Audit session key creations

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Key extraction | Low | Critical | MPC (no single point) |
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

### If Lit Action Compromised

1. Unpint compromised CID from IPFS
2. Deploy new Lit Action
3. Update frontend to use new CID
4. Regenerate session signatures

---

**Previous**: [← Smart Contracts](./07-smart-contracts.md) | **Next**: [Frontend →](./09-frontend.md)
