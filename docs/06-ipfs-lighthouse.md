# IPFS Storage (Crust Network)

> **Status**: This document has been updated. Lighthouse is deprecated in favor of Crust Network.

---

## Migration Notice

YouTick has migrated from Lighthouse to **Crust Network** for decentralized IPFS storage.

### Why the Change?

| Aspect | Lighthouse (Old) | Crust (New) |
|--------|------------------|-------------|
| Authentication | API Key (centralized) | W3Auth + Session Keys (decentralized) |
| User Experience | Server-side proxy needed | 100% client-side |
| Cost | Pay per GB | Free (NEAR gas only) |
| Dependencies | API key management | None |

---

## New Documentation

For the current storage implementation, see:

- **[Crust Storage Module](./architecture/crust-storage.md)** - Complete API reference
- **[Decentralization Guide](./guides/decentralization.md)** - Client-side strategy
- **[User Flows](./guides/user-flows.md)** - Upload flow details

---

## Quick Migration Guide

### Old Code (Lighthouse)
```typescript
// DEPRECATED - Do not use
import lighthouse from "@lighthouse-web3/sdk";

const response = await fetch("/api/lighthouse/upload", {
  method: "POST",
  body: formData
});
```

### New Code (Crust)
```typescript
// Recommended - 100% client-side
import { uploadFile } from '@/lib/crust';

const result = await uploadFile(file, accountId);
console.log('CID:', result.cid);
```

---

## File Changes

| Old Location | New Location | Status |
|--------------|--------------|--------|
| `lib/lighthouse.ts` | `lib/crust/` | Deprecated (redirects with warning) |
| `/api/lighthouse/upload` | Client-side `uploadFile()` | Removed (returns 410 Gone) |
| `mcp-servers/lighthouse/` | N/A | Removed |

---

## Environment Variables

```bash
# OLD (No longer needed)
# LIGHTHOUSE_API_KEY=...

# NEW (No API key required!)
# Crust uses W3Auth with NEAR Session Keys
# Authentication happens client-side automatically
```

---

**Previous**: [← Lit Protocol](./05-lit-protocol.md) | **Next**: [Smart Contracts →](./07-smart-contracts.md)
