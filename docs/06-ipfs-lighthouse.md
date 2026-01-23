# IPFS & Lighthouse Storage

> **Storage Layer: Decentralized, Permanent Content Storage**

## Overview

YouTick uses Lighthouse (IPFS pinning service) for:
- Encrypted video storage
- Permanent, content-addressed storage
- Cost-effective (~$4/GB one-time)
- Decentralized retrieval via IPFS gateways

## Configuration

```typescript
// lib/lighthouse.ts
export const lighthouseConfig = {
  apiKey: process.env.LIGHTHOUSE_API_KEY,
  gateway: "https://gateway.lighthouse.storage",
  
  // Fallback gateways for retrieval
  gateways: [
    "https://gateway.lighthouse.storage/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://w3s.link/ipfs/"
  ]
};
```

## SDK Setup

```javascript
import lighthouse from "@lighthouse-web3/sdk";

// API Key is stored server-side for security
const apiKey = process.env.LIGHTHOUSE_API_KEY;
```

## Upload Flow

### Server-Side API Route

```typescript
// app/api/lighthouse/upload/route.ts
import lighthouse from "@lighthouse-web3/sdk";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File;
  
  const buffer = Buffer.from(await file.arrayBuffer());
  
  const uploadResponse = await lighthouse.uploadBuffer(
    buffer,
    process.env.LIGHTHOUSE_API_KEY!,
    file.name
  );
  
  return Response.json({
    cid: uploadResponse.data.Hash,
    name: uploadResponse.data.Name,
    size: uploadResponse.data.Size
  });
}
```

### Client-Side Upload

```typescript
async function uploadToIPFS(encryptedBlob: Blob, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", encryptedBlob, filename);
  
  const response = await fetch("/api/lighthouse/upload", {
    method: "POST",
    body: formData
  });
  
  if (!response.ok) {
    throw new Error("Upload failed");
  }
  
  const { cid } = await response.json();
  return cid; // e.g., "QmXyz..."
}
```

## Retrieval Flow

```typescript
async function fetchFromIPFS(cid: string): Promise<Blob> {
  const gateways = lighthouseConfig.gateways;
  
  for (const gateway of gateways) {
    try {
      const response = await fetch(`${gateway}${cid}`, {
        signal: AbortSignal.timeout(30000) // 30s timeout
      });
      
      if (response.ok) {
        return response.blob();
      }
    } catch (error) {
      console.warn(`Gateway ${gateway} failed, trying next...`);
    }
  }
  
  throw new Error("All gateways failed");
}
```

## IPFS Warming Script

Pre-fetch content across multiple gateways for faster access:

```javascript
// scripts/warmup_ipfs.mjs
import fetch from "node-fetch";

const GATEWAYS = [
  "https://gateway.lighthouse.storage/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/"
];

async function warmupCID(cid) {
  const results = await Promise.allSettled(
    GATEWAYS.map(gateway => 
      fetch(`${gateway}${cid}`, { method: "HEAD" })
    )
  );
  
  console.log(`Warmed up ${cid}: ${results.filter(r => r.status === "fulfilled").length}/${GATEWAYS.length} gateways`);
}

// Usage: node scripts/warmup_ipfs.mjs QmXyz...
const cid = process.argv[2];
if (cid) warmupCID(cid);
```

## Metadata Format

YouTick stores metadata in a specific format:

```typescript
interface IPFSMetadata {
  // Primary CID of encrypted content
  encryptedCid: string;
  
  // Optional thumbnail CID
  thumbnailCid?: string;
  
  // Title stored on-chain for discovery
  title: string;
  
  // Event title format (used in contract)
  // Format: "RealCID:::Title" or "FileHash:::ThumbnailCID:::Title"
}

// Example: Parsing event title
function parseEventTitle(eventTitle: string): { cid: string; title: string } {
  const parts = eventTitle.split(":::");
  if (parts.length >= 2) {
    return {
      cid: parts[0],
      title: parts[parts.length - 1]
    };
  }
  return { cid: "", title: eventTitle };
}
```

## Cost Structure

| File Size | Storage Cost | Notes |
|-----------|--------------|-------|
| 100 MB | ~$0.40 | One-time payment |
| 500 MB | ~$2.00 | One-time payment |
| 1 GB | ~$4.00 | One-time payment |
| 10 GB | ~$40.00 | One-time payment |

**No monthly fees** - content is stored permanently.

## Comparison with Alternatives

| Feature | Lighthouse | Pinata | Web3.Storage |
|---------|------------|--------|--------------|
| Pricing | ~$4/GB one-time | $0.15/GB/mo | Free tier + paid |
| Encryption | External (Lit) | None | None |
| Smart Contract Payment | Planned | No | No |
| Perpetual Storage | ✅ | ✅ (while paid) | ✅ |

## Error Handling

```typescript
try {
  const cid = await uploadToIPFS(encryptedBlob, filename);
} catch (error) {
  if (error.message.includes("rate limit")) {
    // Wait and retry
    await delay(5000);
    return uploadToIPFS(encryptedBlob, filename);
  } else if (error.message.includes("file too large")) {
    // Recommend compression or chunking
    throw new Error("File exceeds 100MB limit. Please compress.");
  }
}
```

## Future: Decentralized Payment

Currently, Lighthouse requires an API key (centralized). Future goal:

```typescript
// Target Flow (V2)
async function payForStorageDecentralized(nearWallet, fileSizeBytes) {
  const costInNEAR = calculateCost(fileSizeBytes);
  
  // Pay via NEAR Chain Signatures to Lighthouse EVM contract
  const signature = await signWithMPC(nearWallet, lighthousePaymentTx);
  await submitToLighthouseContract(signature);
  
  // Get upload token without API key
  const uploadToken = await getUploadToken(signature);
  return uploadToken;
}
```

---

**Previous**: [← Lit Protocol](./05-lit-protocol.md) | **Next**: [Smart Contracts →](./07-smart-contracts.md)
