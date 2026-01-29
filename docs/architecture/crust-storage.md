# Crust Storage Module

> Decentralized IPFS Storage with NEAR Authentication

**Location**: `apps/web/lib/crust/`

---

## Overview

The Crust module provides 100% decentralized IPFS storage using:

- **W3Auth**: NEAR Session Key authentication (signless)
- **Multi-gateway**: Automatic failover for retrieval
- **Gateway Racing**: Parallel requests for fastest response

---

## Module Structure

```
lib/crust/
├── index.ts       # Module exports
├── types.ts       # Type definitions
├── w3auth.ts      # W3Auth token generation
├── client.ts      # Upload client
└── gateway.ts     # Multi-gateway failover
```

---

## Quick Start

```typescript
import { uploadFile, getContentUrl, fetchWithFailover } from '@/lib/crust';

// Upload a file (signless, no gas cost)
const result = await uploadFile(file, accountId);
console.log('CID:', result.cid);

// Get URL for content
const url = getContentUrl(result.cid);

// Fetch with automatic failover
const response = await fetchWithFailover(cid);
```

---

## W3Auth Authentication

### Token Format

```
Bearer base64("near-{address}:{hexSignature}")
```

Where:
- `address`: Public key WITHOUT `ed25519:` prefix
- `hexSignature`: Signature of address in hex format

### Token Generation

```typescript
// lib/crust/w3auth.ts

export async function generateW3AuthToken(accountId: string): Promise<W3AuthToken> {
    const keyStore = new BrowserKeyStore();
    const keyPair = await keyStore.getKey(networkId, accountId);

    // Extract address (remove ed25519: prefix)
    const publicKeyFull = keyPair.getPublicKey().toString();
    const address = publicKeyFull.startsWith('ed25519:')
        ? publicKeyFull.substring(8)
        : publicKeyFull;

    // Sign the address itself
    const messageToSign = Buffer.from(address);
    const signResult = keyPair.sign(messageToSign);

    // Convert to hex (not base64!)
    const signatureHex = toHex(signResult.signature);

    // Format: near-{address}:{hexSignature}
    const authString = `near-${address}:${signatureHex}`;
    const authHeader = `Bearer ${Buffer.from(authString).toString('base64')}`;

    return {
        authHeader,
        publicKey: publicKeyFull,
        accountId,
        generatedAt: Date.now()
    };
}
```

### Token Caching

Tokens are cached for 30 minutes to reduce signing overhead:

```typescript
const TOKEN_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const tokenCache = new Map<string, { token: W3AuthToken; expires: number }>();
```

---

## Gateway Configuration

### Upload Gateway

Only `crustipfs.xyz` supports W3Auth uploads:

```typescript
export const UPLOAD_GATEWAY = 'https://crustipfs.xyz';
```

### Retrieval Gateways

Prioritized by reliability and speed:

| Gateway | Priority | Supports Upload |
|---------|----------|-----------------|
| `ipfs.io` | 1 | No |
| `dweb.link` | 2 | No |
| `w3s.link` | 3 | No |
| `crustipfs.xyz` | 4 | Yes |
| `gw.crustfiles.app` | 5 | No |

```typescript
export const RETRIEVAL_GATEWAYS: GatewayConfig[] = [
    { url: 'https://ipfs.io', priority: 1, supportsUpload: false },
    { url: 'https://dweb.link', priority: 2, supportsUpload: false },
    { url: 'https://w3s.link', priority: 3, supportsUpload: false },
    { url: 'https://crustipfs.xyz', priority: 4, supportsUpload: true },
    { url: 'https://gw.crustfiles.app', priority: 5, supportsUpload: false }
];
```

---

## Retrieval Strategies

### Sequential Failover

Tries gateways one by one with exponential backoff:

```typescript
export async function fetchWithFailover(
    cid: string,
    maxRetries: number = 3
): Promise<Response> {
    let lastError: Error | null = null;
    const totalAttempts = maxRetries * CRUST_GATEWAYS.length;

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
        const url = getGatewayUrl(cid);

        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(30000)
            });

            if (response.ok) {
                markGatewaySuccess();
                return response;
            }
            throw new Error(`Gateway returned ${response.status}`);
        } catch (e) {
            switchToNextGateway();
            // Exponential backoff
            const delay = Math.min(500 * Math.pow(2, attempt), 5000);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    throw lastError || new Error('All gateways failed');
}
```

### Gateway Racing

Fires parallel requests, first success wins:

```typescript
export async function fetchWithRace(
    cid: string,
    options: { timeout?: number; maxGateways?: number } = {}
): Promise<Response> {
    const { timeout = 10000, maxGateways = 3 } = options;
    const gateways = RETRIEVAL_GATEWAYS.slice(0, maxGateways);

    const racePromises = gateways.map((gw) => {
        return fetch(`${gw.url}/ipfs/${cid}`, {
            signal: AbortSignal.timeout(timeout)
        }).then(r => {
            if (r.ok) return { response: r, gateway: gw.url };
            throw new Error(`HTTP ${r.status}`);
        });
    });

    try {
        const { response, gateway } = await Promise.race(racePromises);
        console.log(`Gateway Race Winner: ${gateway}`);
        return response;
    } catch {
        // Fallback to sequential
        return fetchWithFailover(cid);
    }
}
```

---

## Upload Client

### Single File Upload

```typescript
export async function uploadFile(
    file: File,
    accountId: string
): Promise<CrustUploadResult> {
    const token = await generateW3AuthToken(accountId);

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${UPLOAD_GATEWAY}/api/v0/add`, {
        method: 'POST',
        headers: {
            'Authorization': token.authHeader
        },
        body: formData
    });

    const result = await response.json();

    return {
        cid: result.Hash,
        name: result.Name,
        size: parseInt(result.Size)
    };
}
```

### JSON Upload

```typescript
export async function uploadJson(
    data: any,
    accountId: string
): Promise<CrustUploadResult> {
    const blob = new Blob([JSON.stringify(data)], {
        type: 'application/json'
    });
    const file = new File([blob], 'data.json', {
        type: 'application/json'
    });

    return uploadFile(file, accountId);
}
```

---

## Type Definitions

```typescript
// lib/crust/types.ts

export interface W3AuthToken {
    authHeader: string;
    publicKey: string;
    accountId: string;
    generatedAt: number;
}

export interface CrustUploadResult {
    cid: string;
    name: string;
    size: number;
}

export interface CrustUploadOptions {
    onProgress?: (progress: UploadProgress) => void;
    timeout?: number;
}

export interface UploadProgress {
    loaded: number;
    total: number;
    percentage: number;
}

export interface GatewayConfig {
    url: string;
    priority: number;
    supportsUpload: boolean;
}

export type CrustErrorCode =
    | 'NO_SESSION_KEY'
    | 'UPLOAD_FAILED'
    | 'GATEWAY_ERROR'
    | 'AUTH_ERROR';

export class CrustError extends Error {
    code: CrustErrorCode;
    constructor(code: CrustErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'CrustError';
    }
}
```

---

## Gateway Management

### State Functions

```typescript
// Get current active gateway
export function getCurrentGateway(): string

// Get upload gateway (always crustipfs.xyz)
export function getUploadGateway(): string

// Switch to next gateway after failure
export function switchToNextGateway(): boolean

// Reset to primary gateway
export function resetGateway(): void

// Mark current gateway as successful
export function markGatewaySuccess(): void
```

### URL Construction

```typescript
// Build full URL for a CID
export function getGatewayUrl(cid: string, gateway?: string): string {
    const baseUrl = gateway || getCurrentGateway();
    return `${baseUrl}/ipfs/${cid}`;
}
```

### Health Check

```typescript
export function getGatewayStatus(): {
    current: string;
    index: number;
    consecutiveFailures: number;
    healthy: boolean;
}
```

### Availability Check

```typescript
export async function checkAvailability(cid: string): Promise<boolean> {
    try {
        const response = await fetch(getGatewayUrl(cid), {
            method: 'HEAD',
            signal: AbortSignal.timeout(10000)
        });
        return response.ok;
    } catch {
        return false;
    }
}
```

---

## Module Exports

```typescript
// lib/crust/index.ts

// Types
export type {
    W3AuthToken,
    CrustUploadResult,
    CrustUploadOptions,
    UploadProgress,
    GatewayConfig,
    CrustErrorCode
} from './types';

export { CrustError } from './types';

// W3Auth
export {
    generateW3AuthToken,
    clearW3AuthCache,
    hasValidW3AuthToken
} from './w3auth';

// Upload Client
export {
    uploadFile,
    uploadFiles,
    uploadJson,
    getContentUrl
} from './client';

// Gateway Management
export {
    CRUST_GATEWAYS,
    getCurrentGateway,
    getUploadGateway,
    switchToNextGateway,
    resetGateway,
    markGatewaySuccess,
    fetchWithFailover,
    fetchWithRace,
    checkAvailability,
    getGatewayUrl,
    getGatewayStatus
} from './gateway';
```

---

## Error Handling

```typescript
try {
    const result = await uploadFile(file, accountId);
} catch (error) {
    if (error instanceof CrustError) {
        switch (error.code) {
            case 'NO_SESSION_KEY':
                // Redirect to setup
                break;
            case 'UPLOAD_FAILED':
                // Retry or show error
                break;
            case 'GATEWAY_ERROR':
                // Try different gateway
                break;
            case 'AUTH_ERROR':
                // Clear cache and retry
                clearW3AuthCache(accountId);
                break;
        }
    }
}
```

---

## Decentralization Metrics

The module logs decentralization events:

```typescript
console.log('[DECENTRALIZATION_METRIC] w3auth_token_generated', {
    accountId,
    method: 'session_key'
});
```

---

## Migration from Lighthouse

The Crust module replaces the deprecated Lighthouse integration:

| Old (Lighthouse) | New (Crust) |
|------------------|-------------|
| `lib/lighthouse.ts` | `lib/crust/` |
| `uploadFile()` | `uploadFile()` |
| API key auth | W3Auth (Session Key) |
| Single gateway | Multi-gateway failover |

**Note**: The old Lighthouse module redirects to Crust with a deprecation warning.

---

## Related Documentation

- [Session Keys](./session-keys.md) - Required for W3Auth
- [User Flows](../guides/user-flows.md) - Upload flow details
- [Decentralization](../guides/decentralization.md) - Client-side strategy
