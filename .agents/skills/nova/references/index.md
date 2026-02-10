# Nova Documentation Index

Welcome to the Nova skill documentation. This index provides navigation to all reference materials.

## Quick Navigation

| Document | Description | Best For |
|----------|-------------|----------|
| [sdk-javascript.md](sdk-javascript.md) | JavaScript/TypeScript SDK (`NovaSdk` class) | Frontend & Node.js developers |
| [sdk-rust.md](sdk-rust.md) | Rust SDK reference | Backend & CLI developers |
| [smart-contract.md](smart-contract.md) | NEAR contract API (`nova-sdk.near` / `nova-sdk-6.testnet`) | Contract interaction & token claims |
| [shade-agent.md](shade-agent.md) | TEE key management (Shade Agent v2.2) | Security & TEE architecture |
| [mcp-server.md](mcp-server.md) | AI assistant integration via MCP | Claude/AI developers |
| [architecture.md](architecture.md) | System design & security model | Understanding Nova |
| [tutorials.md](tutorials.md) | Step-by-step guides | Getting started |

## Documentation by Use Case

### I want to build a file sharing app
1. Start with [architecture.md](architecture.md) to understand the system
2. Follow [tutorials.md](tutorials.md) for implementation steps
3. Reference [sdk-javascript.md](sdk-javascript.md) for the `NovaSdk` API

### I want to understand TEE and the token claim flow
1. Read [shade-agent.md](shade-agent.md) for Shade Agent v2.2 TEE details
2. Study [smart-contract.md](smart-contract.md) for the `claim_token()` mechanism
3. See [architecture.md](architecture.md) for the complete NEAR <-> TEE bridge flow

### I want to understand encryption
1. Read [sdk-javascript.md](sdk-javascript.md) for `encryptData()` / `decryptData()` (AES-256-GCM)
2. See [shade-agent.md](shade-agent.md) for TEE key storage (AES-256-CBC)
3. Check [mcp-server.md](mcp-server.md) for MCP encryption (AES-256-CBC)
4. Review [architecture.md](architecture.md) for the full encryption specification table

### I want to integrate Nova with an AI assistant
1. Read [mcp-server.md](mcp-server.md) for the public MCP server at `nova-mcp.fastmcp.app/mcp`
2. Follow [tutorials.md](tutorials.md) MCP integration section
3. Review supported operations and security considerations

### I want to understand NEAR Protocol integration
1. Study [smart-contract.md](smart-contract.md) for contract functions and events
2. Read [architecture.md](architecture.md) for on-chain vs off-chain responsibilities
3. See [tutorials.md](tutorials.md) for NEAR integration points and costs

### I want to manage groups and members
1. Reference [sdk-javascript.md](sdk-javascript.md) for `registerGroup()`, `addGroupMember()`, `revokeGroupMember()`
2. See [tutorials.md](tutorials.md) for team management and offboarding guides
3. Check [smart-contract.md](smart-contract.md) for on-chain costs

## Version Information

- Shade Agent: v2.2 (Next.js on Phala Cloud)
- NEAR Contract: `nova-sdk.near` (mainnet) / `nova-sdk-6.testnet` (testnet)
- SDK Encryption: AES-256-GCM
- MCP Server: `https://nova-mcp.fastmcp.app/mcp`

## Support

- Official Docs: https://nova-25.gitbook.io/nova-docs/
- GitHub: https://github.com/jcarbonnell/nova
- Website: https://nova-sdk.com
- Twitter: https://x.com/nova_sdk
- Telegram: https://t.me/nova_sdk
