# Nova MCP Server Reference

Guide for integrating Nova with AI assistants via the Model Context Protocol (MCP).

## Overview

The Nova MCP Server is an Auth + Signing Proxy that bridges AI assistants with Nova's decentralized file sharing infrastructure. It handles authentication, cryptographic operations, and orchestrates interactions with the NEAR contract and Shade Agent TEE.

**Public URL:** `https://nova-mcp.fastmcp.app/mcp`

## Architecture

```
AI Assistant (Claude, etc.)
        │
        │ MCP Protocol
        ▼
┌──────────────────────┐
│   Nova MCP Server    │
│                      │
│  Auth + Signing      │
│  Proxy               │
│                      │
│  ┌────────────────┐  │
│  │ JWT Session    │  │
│  │ Management     │  │
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ AES-256-CBC    │  │
│  │ Crypto Ops     │  │
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ NEAR Contract  │  │
│  │ Interaction    │  │
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ Shade Agent    │  │
│  │ Key Retrieval  │  │
│  └────────────────┘  │
└──────────────────────┘
        │          │
        ▼          ▼
  NEAR Contract  Shade Agent (TEE)
```

## Key Characteristics

| Property | Detail |
|----------|--------|
| URL | `https://nova-mcp.fastmcp.app/mcp` |
| Protocol | Model Context Protocol (MCP) |
| Authentication | JWT session tokens |
| Encryption | AES-256-CBC (server-side) |
| Role | Auth + Signing Proxy |

## How It Works

The MCP Server acts as an intermediary between AI assistants and Nova's infrastructure:

1. **Authentication**: AI assistant connects via MCP protocol. The server manages JWT session tokens for authentication.

2. **Operation Routing**: Natural language requests from the AI assistant are mapped to Nova operations (group management, file upload/retrieve, member management).

3. **Cryptographic Operations**: The MCP server handles crypto operations server-side using AES-256-CBC. This differs from the SDK which uses AES-256-GCM for client-side encryption.

4. **Key Retrieval**: The server retrieves encryption keys from the Shade Agent TEE on behalf of the authenticated user.

5. **NEAR Contract Interaction**: Group management operations (register, add member, revoke) are routed to the NEAR contract.

## Encryption Difference: MCP vs SDK

| Property | MCP Server | SDK (JS/Rust) |
|----------|-----------|---------------|
| Algorithm | AES-256-CBC | AES-256-GCM |
| Encryption location | Server-side | Client-side |
| Key retrieval | Server fetches from TEE | Client fetches from TEE |

The MCP Server uses AES-256-CBC because cryptographic operations happen server-side as part of the proxy function. The SDK uses AES-256-GCM for client-side encryption where the additional authentication tag provides integrity verification.

## Use Cases

### Natural Language File Operations

AI assistants can process natural language commands to interact with Nova:

```
User: "Create a group called 'research_team' and upload my dataset"
AI:   [Connects to Nova MCP Server]
      [Registers group 'research_team']
      [Uploads and encrypts the dataset]

User: "Who has access to the research_team group?"
AI:   [Queries group membership via MCP]
      [Reports authorized members]

User: "Remove bob from the research team"
AI:   [Revokes bob's membership via MCP]
      [Key rotation happens automatically]
```

### AI Agent Workflows

The MCP server enables autonomous AI agent workflows:
- Automated document management
- Scheduled encrypted backups
- Access control auditing
- Cross-group file organization

### Conversational Interfaces

Users can manage encrypted files through natural conversation:
- "Upload this report to the engineering group"
- "Download the latest budget spreadsheet"
- "Add the new team member to all project groups"
- "Show me the transaction history for the marketing group"

## Supported Operations

The MCP server supports the core Nova operations:

| Category | Operations |
|----------|-----------|
| **Group Management** | Register group, query group info, get checksum |
| **Member Management** | Add member, revoke member, check authorization |
| **File Operations** | Upload (encrypt + IPFS), retrieve (IPFS + decrypt) |
| **Queries** | Transaction history, group owner, authorization status |

## Security Considerations

1. **JWT Token Management**: Session tokens authenticate the connection between the AI assistant and the MCP server
2. **Server-Side Crypto**: The MCP server handles encryption server-side; for maximum security, use the SDK directly for client-side encryption
3. **Key Transit**: The MCP server retrieves keys from the Shade Agent TEE; keys pass through the server during operations
4. **NEAR Account**: Operations are executed using the configured NEAR account credentials
5. **Network Selection**: Use testnet for development and testing

## When to Use MCP vs SDK

| Scenario | Recommendation |
|----------|---------------|
| AI assistant integration | MCP Server |
| Web application | JavaScript SDK |
| Backend service | Rust or JavaScript SDK |
| Maximum security (client-side crypto) | JavaScript or Rust SDK |
| Conversational interface | MCP Server |
| Automated workflows | MCP Server or SDK |

## Additional Resources

- Official Documentation: https://nova-25.gitbook.io/nova-docs/
- GitHub: https://github.com/jcarbonnell/nova
- Website: https://nova-sdk.com
- MCP Protocol: https://modelcontextprotocol.io
