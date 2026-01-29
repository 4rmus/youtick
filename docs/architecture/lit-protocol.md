# Lit Protocol Integration

> Encryption, Access Control, and PKP Management

**Location**: `apps/web/lib/lit.ts`
**Network**: Datil-Test (Chronicle Yellowstone)

---

## Overview

Lit Protocol provides:

- **Encryption/Decryption**: Client-side video encryption
- **Access Control Conditions**: NFT ownership verification
- **PKP Management**: Signless operations via Programmable Key Pairs
- **Session Signatures**: Authenticated sessions for Lit operations

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Lit Protocol                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────┐    ┌─────────────┐                 │
│  │  Encryption │    │    PKP      │                 │
│  │  Service    │    │  Management │                 │
│  └──────┬──────┘    └──────┬──────┘                 │
│         │                  │                         │
│         ▼                  ▼                         │
│  ┌──────────────────────────────────┐               │
│  │       Session Signatures          │               │
│  │  ┌────────────┐ ┌────────────┐   │               │
│  │  │   MPC      │ │    PKP     │   │               │
│  │  │  (NEAR)    │ │  (Signless)│   │               │
│  │  └────────────┘ └────────────┘   │               │
│  └──────────────────────────────────┘               │
│                                                      │
│  ┌──────────────────────────────────┐               │
│  │    Access Control Conditions      │               │
│  │    (NFT Ownership on NEAR)        │               │
│  └──────────────────────────────────┘               │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Configuration

```typescript
// Network configuration
const CURRENT_NETWORK = process.env.NEXT_PUBLIC_LIT_NETWORK || "datil-test";

// Session cache duration (security vs UX balance)
const SESSION_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Lit client initialization
const client = new LitNodeClient({
    litNetwork: CURRENT_NETWORK,
    debug: process.env.NODE_ENV !== 'production',
    rpcUrl: `${window.location.origin}/api/lit-rpc`
});
```

---

## Session Caching Strategy

### Dual Caching

| Operation | Cached | Rationale |
|-----------|--------|-----------|
| `upload` | Never | Security - involves payment/content |
| `view` | 24 hours | UX - frequent access |
| `purchase` | 24 hours | UX - repeated operations |

```typescript
export type SessionOperation = 'upload' | 'view' | 'purchase';

function getCachedSessionSigs(
    accountId: string,
    operation: SessionOperation = 'view'
): any | null {
    // Upload operations always require fresh signature
    if (operation === 'upload') {
        return null;
    }

    const cached = localStorage.getItem(`${SESSION_CACHE_KEY}_${accountId}`);
    if (!cached) return null;

    const { sigs, expiresAt } = JSON.parse(cached);
    if (Date.now() < expiresAt) {
        return sigs;
    }

    localStorage.removeItem(`${SESSION_CACHE_KEY}_${accountId}`);
    return null;
}
```

### Network Migration

Cache is cleared when network changes:

```typescript
function checkNetworkAndClearCache(accountId: string) {
    const storedNet = localStorage.getItem('lit_active_network');
    if (storedNet !== CURRENT_NETWORK) {
        localStorage.removeItem(`${SESSION_CACHE_KEY}_${accountId}`);
        localStorage.removeItem(`pkp_${accountId}`);
        localStorage.setItem('lit_active_network', CURRENT_NETWORK);
    }
}
```

---

## Session Signatures

### With MPC (NEAR Chain Signatures)

```typescript
async getSessionSigs(
    wallet: any,
    accountId: string,
    ethAddress: string,           // MPC-derived ETH address
    signWithMPC: Function,        // MPC signing function
    accessControlConditions?: any[],
    dataToEncryptHash?: string,
    derivationPath: string = "lit/pkp-minting"
)
```

**Flow**:
1. Check cache for existing session
2. Create SIWE message with derived ETH address
3. Sign SIWE with NEAR MPC
4. Generate Lit session signatures
5. Cache for future use

### With PKP (Signless)

```typescript
async getSessionSigsWithPKP(
    pkpPublicKey: string,
    pkpEthAddress: string,
    nearAccountId: string,
    nearSignature?: string,
    nearMessage?: string,
    nearPublicKey?: string,
    capacityDelegationAuthSig?: any
)
```

**Flow**:
1. Check cache for existing session
2. Create capacity delegation (if needed)
3. Execute Lit Action with PKP
4. Generate session signatures
5. Cache for future use

---

## Encryption/Decryption

### Encrypt File

```typescript
async encryptFile(
    file: File,
    accessControlConditions: any[],
    authSig: any,
    chain: string,
    sessionSigs?: any
): Promise<{ ciphertext: string; dataToEncryptHash: string }>
```

**Usage**:

```typescript
const { ciphertext, dataToEncryptHash } = await lit.encryptFile(
    videoFile,
    accessControlConditions,
    null,  // authSig (use sessionSigs instead)
    'ethereum',
    sessionSigs
);
```

### Decrypt File

```typescript
async decryptFile(
    ciphertext: string,
    dataToEncryptHash: string,
    accessControlConditions: any[],
    authSig: any,
    chain: string,
    sessionSigs?: any
): Promise<Uint8Array>
```

**Usage**:

```typescript
const decryptedBytes = await lit.decryptFile(
    ciphertext,
    dataToEncryptHash,
    accessControlConditions,
    null,
    'ethereum',
    sessionSigs
);

// Convert to playable blob
const blob = new Blob([decryptedBytes], { type: 'video/mp4' });
const url = URL.createObjectURL(blob);
```

---

## Access Control Conditions

### NFT Ownership (NEAR)

```typescript
// lib/access-conditions.ts

export function createNearNftAccessCondition(
    contractId: string,
    tokenId: string
): UnifiedAccessControlCondition[] {
    return [
        {
            conditionType: 'evmBasic',
            contractAddress: '', // Not used for NEAR
            standardContractType: '',
            chain: 'ethereum',
            method: '',
            parameters: [],
            returnValueTest: {
                comparator: '=',
                value: 'true'
            }
        }
    ];
}
```

**Note**: NEAR ownership verification is handled via Lit Action that queries the contract directly.

### Lit Action Verification

```typescript
const litActionCode = `
(async () => {
    const nearAccountId = jsParams.nearAccountId;
    const targetCid = jsParams.targetCid;
    const contractId = jsParams.contractId;

    // Query NEAR RPC
    const response = await fetch(rpcUrl, {
        method: "POST",
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "query",
            params: {
                request_type: "call_function",
                account_id: contractId,
                method_name: "get_tokens_with_video",
                args_base64: btoa(JSON.stringify({ account_id: nearAccountId }))
            }
        })
    });

    const tokens = parseResult(await response.json());
    const hasAccess = tokens.some(([token, metadata]) =>
        metadata?.encrypted_cid === targetCid
    );

    if (hasAccess) {
        LitActions.setResponse({ response: JSON.stringify({ verified: true }) });
    }
})();
`;
```

---

## PKP Operations

### Sign with PKP

Gas-free signing using PKP instead of MPC:

```typescript
async signWithPKP(
    pkpPublicKey: string,
    pkpEthAddress: string,
    message: string,
    nearAccountId: string
): Promise<{ signature: string; address: string }>
```

**Usage**:

```typescript
const { signature, address } = await lit.signWithPKP(
    pkpPublicKey,
    pkpEthAddress,
    "Sign this message",
    accountId
);
```

**Benefits**:
- No gas cost (unlike MPC which costs ~0.1 NEAR)
- Faster than MPC operations
- Perfect for frequent signing needs

---

## Error Handling

### Retry with Backoff

```typescript
async function withLitErrorHandling<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    fallback?: T
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;

            // Check for transient errors
            if (
                error.message?.includes('rate limit') ||
                error.message?.includes('timeout') ||
                error.message?.includes('handshake')
            ) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = 1000 * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            break; // Non-transient error
        }
    }

    if (fallback !== undefined) return fallback;
    throw lastError;
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Rate limit | Too many requests | Exponential backoff |
| Timeout | Network issues | Retry with backoff |
| Handshake | Connection issues | Retry |
| Address mismatch | Signature issue | Try v-flip recovery |

---

## Capacity Delegation

Required for datil-test network:

```typescript
// lib/capacity.ts

export async function createCapacityDelegationAuthSig(
    client: LitNodeClient,
    delegateeAddress: string,
    uses: number = 10,
    expiryMinutes: number = 60
): Promise<AuthSig> {
    // Create delegation using capacity credit token
    // ...
}

export function isCapacityDelegationAvailable(): boolean {
    return !!process.env.NEXT_PUBLIC_LIT_CAPACITY_TOKEN_ID;
}
```

---

## Class API

### Lit Class

```typescript
class Lit {
    // Get underlying client
    getLitNodeClient(): LitNodeClient

    // Connect to Lit network
    async connect(): Promise<void>

    // Session signatures (MPC)
    async getSessionSigs(
        wallet, accountId, ethAddress, signWithMPC,
        accessControlConditions?, dataToEncryptHash?, derivationPath?
    ): Promise<SessionSigs>

    // Session signatures (PKP)
    async getSessionSigsWithPKP(
        pkpPublicKey, pkpEthAddress, nearAccountId,
        nearSignature?, nearMessage?, nearPublicKey?,
        capacityDelegationAuthSig?
    ): Promise<SessionSigs>

    // Session signatures (NEAR verification)
    async getSessionSigsWithNEARVerification(
        nearAccountId, targetCid, contractId
    ): Promise<SessionSigs>

    // Encryption
    async encryptFile(file, accessControlConditions, authSig, chain, sessionSigs?): Promise<EncryptResult>

    // Decryption
    async decryptFile(ciphertext, dataToEncryptHash, accessControlConditions, authSig, chain, sessionSigs?): Promise<Uint8Array>

    // PKP signing
    async signWithPKP(pkpPublicKey, pkpEthAddress, message, nearAccountId): Promise<SignResult>

    // Utility
    async getLatestBlockhash(): Promise<string>
}

export const lit = new Lit();
```

---

## Environment Variables

```env
# Lit Protocol
NEXT_PUBLIC_LIT_NETWORK=datil-test
NEXT_PUBLIC_LIT_ACTION_IPFS_CID=Qm...

# Capacity Credits (required for datil-test)
NEXT_PUBLIC_LIT_CAPACITY_TOKEN_ID=123456
LIT_DELEGATION_WALLET_PRIVATE_KEY=0x...
```

---

## Utility Functions

### Clear Session Cache

```typescript
export function clearSessionCache(accountId: string): void {
    localStorage.removeItem(`${SESSION_CACHE_KEY}_${accountId}`);
    localStorage.removeItem(`pkp_${accountId}`);
}
```

---

## Related Documentation

- [Chain Signatures](./chain-signatures.md) - MPC operations
- [Session Keys](./session-keys.md) - NEAR session management
- [User Flows](../guides/user-flows.md) - Encryption in context
