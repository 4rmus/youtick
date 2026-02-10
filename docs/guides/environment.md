# Environment Configuration

> Complete guide to YouTick environment variables

---

## Overview

YouTick is a decentralized application. No API keys are required for core user-facing operations (uploading, watching, purchasing, gifting). The environment configuration controls which NEAR network to target, which contracts to interact with, and how Nova Protocol encryption is routed.

All `NEXT_PUBLIC_` prefixed variables are exposed to the browser. Variables without this prefix are server-only and are never sent to the client.

---

## Environment Variables Reference

### NEAR Protocol

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_NEAR_NETWORK` | Yes | `mainnet` | NEAR network to connect to. Accepted values: `mainnet`, `testnet`. |
| `NEXT_PUBLIC_NFT_CONTRACT_ID` | Yes | `youtick-prod-v1.near` | Account ID of the YouTick NFT ticket smart contract. |

### Nova Protocol (TEE Encryption)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_NOVA_NETWORK` | Yes | `mainnet` | Nova Protocol network. Accepted values: `mainnet`, `testnet`. |
| `NEXT_PUBLIC_NOVA_CONTRACT_ID` | Yes | `nova-sdk.near` | Nova SDK smart contract account ID on NEAR. |
| `NOVA_API_KEY` | Yes (server) | - | Nova API key. Server-only variable injected via the `/api/nova-proxy` route. Never exposed to the browser. |
| `NEXT_PUBLIC_NOVA_API_KEY` | Recommended | - | Set to `"enabled"` when `NOVA_API_KEY` is configured. The client checks this flag to determine if Nova features are available. This is not the actual API key. |
| `NEXT_PUBLIC_NOVA_ACCOUNT_ID` | Yes | - | Nova-registered account ID (e.g., `yourapp.nova-sdk.near`). Used for SDK session token authentication. This is not the user's NEAR wallet account. |
| `NEXT_PUBLIC_NOVA_ENCLAVE_HASH` | Optional | - | Expected TEE enclave hash for attestation verification. When set, the client verifies that the Shade Agent's enclave measurement matches this value. When not set, only structure and freshness checks are performed. |

### Trial Account Creation

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_ONBOARDING_KEY` | Optional | - | Function Call Access Key (ed25519 private key) for client-side trial account creation. This key has restricted scope: it can only call `create_sponsored_trial_direct` and `claim_free_ticket_direct` on the NFT contract. |

---

## Network Configurations

### Mainnet

```
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick-prod-v1.near
NEXT_PUBLIC_NOVA_NETWORK=mainnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk.near
```

**NEAR RPC endpoints** (automatic failover via near-api-js):

| Priority | Endpoint | Provider |
|----------|----------|----------|
| 1 | `https://free.rpc.fastnear.com` | FastNEAR |
| 2 | `https://rpc.mainnet.near.org` | NEAR Foundation |
| 3 | `https://near.lava.build` | Lava Network |

### Testnet

```
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=v3.utick.testnet
NEXT_PUBLIC_NOVA_NETWORK=testnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk.testnet
```

**NEAR RPC endpoints** (testnet):

| Priority | Endpoint | Provider |
|----------|----------|----------|
| 1 | `https://rpc.testnet.near.org` | NEAR Foundation |

---

## Nova Protocol Configuration

The Nova SDK (`nova-sdk-js`) handles endpoint routing internally. It communicates with:

- **MCP server**: `https://nova-mcp.fastmcp.app` -- tool execution and group management
- **Auth endpoint**: `https://nova-sdk.com` -- session token authentication

No separate Shade Agent or gateway URLs need to be configured. The SDK resolves these automatically based on the network setting.

### API Key Routing

The Nova API key is a sensitive credential that must not be exposed to the browser. YouTick routes all Nova SDK requests through a Next.js API proxy:

```
Browser (Nova SDK)
    │
    │  Requests to /api/nova-proxy/[...path]
    ▼
Next.js API Route (/api/nova-proxy)
    │
    │  Injects NOVA_API_KEY header
    ▼
Nova Backend (nova-sdk.com / nova-mcp.fastmcp.app)
```

- The browser-side SDK is configured with `apiKey: 'proxy-injected'` as a placeholder
- The actual `NOVA_API_KEY` is injected server-side by the proxy route
- `NEXT_PUBLIC_NOVA_API_KEY` is set to `"enabled"` to signal to client code that Nova is configured

### SDK Singleton

The Nova SDK is instantiated as a singleton to avoid redundant auth handshakes and console noise. The singleton is invalidated automatically when configuration changes via `setNovaConfig()`.

---

## IPFS Storage Configuration

Nova handles IPFS uploads with built-in TEE encryption. For direct Crust Network uploads (thumbnails, public metadata), the Crust module (`lib/crust/`) uses W3Auth authentication derived from NEAR Session Keys.

No IPFS-specific environment variables are required. Gateway URLs are hardcoded in the application:

### Upload Endpoint

| Endpoint | Purpose |
|----------|---------|
| `crustipfs.xyz/api/v0/add` | Crust IPFS upload (W3Auth) |

### Retrieval Gateways

| Priority | Gateway | Protocol |
|----------|---------|----------|
| 1 | `crustipfs.xyz/api/v0/cat` | POST (Crust API) |
| 2 | `gw.crustfiles.app/api/v0/cat` | POST (Crust fallback) |
| 3 | `ipfs.io/ipfs/{CID}` | GET |
| 4 | `dweb.link/ipfs/{CID}` | GET |
| 5 | `trustless-gateway.link/ipfs/{CID}` | GET |
| 6 | `4everland.io/ipfs/{CID}` | GET |
| 7 | `gateway.lighthouse.storage/ipfs/{CID}` | GET |
| 8 | `w3s.link/ipfs/{CID}` | GET |

These gateways are configured in `apps/web/lib/crust/config.ts` and can be modified there if needed.

---

## Trial Account Configuration

Trial accounts allow new users to experience YouTick without owning a NEAR wallet. The onboarding key is a Function Call Access Key with restricted scope.

### Onboarding Key Properties

| Property | Value |
|----------|-------|
| Key type | Function Call Access Key (ed25519) |
| Allowed methods | `create_sponsored_trial_direct`, `claim_free_ticket_direct` |
| Receiver | NFT contract (`youtick-prod-v1.near`) |
| Visibility | Public (embedded in client-side code) |
| Security model | Restricted scope prevents misuse |

The key is intentionally public. Its limited scope means it can only create trial accounts and claim free tickets. It cannot transfer funds, modify contract state, or perform any other operations.

---

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| NEAR network | `testnet` | `mainnet` |
| NFT contract | `v3.utick.testnet` | `youtick-prod-v1.near` |
| Nova network | `testnet` | `mainnet` |
| Nova contract | `nova-sdk.testnet` | `nova-sdk.near` |
| Nova API key | Test key (or empty) | Production key (required) |
| Onboarding key | Test key | Production restricted key |
| RPC failover | Single testnet RPC | 3 mainnet RPC endpoints |

### Development Setup

1. Copy the example environment file:
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

2. Set the network to testnet:
   ```
   NEXT_PUBLIC_NEAR_NETWORK=testnet
   NEXT_PUBLIC_NFT_CONTRACT_ID=v3.utick.testnet
   NEXT_PUBLIC_NOVA_NETWORK=testnet
   NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk.testnet
   ```

3. Configure Nova (optional for development):
   ```
   NOVA_API_KEY=your-test-api-key
   NEXT_PUBLIC_NOVA_API_KEY=enabled
   NEXT_PUBLIC_NOVA_ACCOUNT_ID=yourapp.nova-sdk.testnet
   ```

4. Start the development server:
   ```bash
   cd apps/web
   npm run dev
   ```

### Production Deployment

All `NEXT_PUBLIC_` variables must be set at build time (they are inlined during the Next.js build). Server-only variables (`NOVA_API_KEY`) must be set in the runtime environment.

---

## Complete .env.example

```env
# ==============================================================================
# YouTick Web App - Environment Variables
# ==============================================================================
# Decentralized - No API keys required for core operations
# ==============================================================================

# ==============================================================================
# NEAR Configuration (Required)
# ==============================================================================
NEXT_PUBLIC_NEAR_NETWORK=mainnet                            # testnet or mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick-prod-v1.near            # NFT contract account ID

# ==============================================================================
# Nova Protocol Configuration (TEE Encryption)
# Note: nova-sdk-js handles endpoint routing internally via its built-in
# MCP server (https://nova-mcp.fastmcp.app) and auth (https://nova-sdk.com).
# No separate shade agent or gateway URLs are needed.
# ==============================================================================
NEXT_PUBLIC_NOVA_NETWORK=mainnet                            # testnet or mainnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk.near                  # Nova contract account ID
NOVA_API_KEY=                                               # Nova API key (server-only, injected via proxy)
NEXT_PUBLIC_NOVA_API_KEY=                                   # Set to "enabled" when Nova is configured (not the real key)
NEXT_PUBLIC_NOVA_ACCOUNT_ID=                                # Nova account ID (e.g. "yourapp.nova-sdk.near")
NEXT_PUBLIC_NOVA_ENCLAVE_HASH=                              # Expected TEE enclave hash (optional, for attestation verification)

# ==============================================================================
# IPFS Storage (Client-side, no API key needed)
# ==============================================================================
# Note: Nova handles IPFS uploads with TEE encryption
# Retrieval Gateways: crustipfs.xyz, ipfs.io, dweb.link, w3s.link

# ==============================================================================
# Onboarding Key (Decentralized Trial Creation)
# ==============================================================================
# Function Call Access Key for client-side trial account creation
# This key is restricted to create_sponsored_trial_direct and claim_free_ticket_direct
NEXT_PUBLIC_ONBOARDING_KEY=ed25519:...                      # Onboarding key (public, restricted scope)
```

---

## Related Documentation

- [Architecture Overview](../architecture/README.md) - System architecture and technology stack
- [Decentralized Storage](../architecture/storage.md) - IPFS and Crust Network storage architecture
- [Nova Protocol](../architecture/nova-protocol.md) - Encryption system and TEE integration
- [Session Keys](../architecture/session-keys.md) - Signless UX authentication
- [Nova SDK Guide](./nova-sdk.md) - Nova SDK integration guide
