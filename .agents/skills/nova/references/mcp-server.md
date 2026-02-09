# Nova MCP Server Reference

Complete guide for integrating Nova with AI assistants via Model Context Protocol.

## Overview

The Nova MCP Server provides 11+ tools for AI assistants to interact with Nova's decentralized file sharing system. This enables Claude and other MCP-compatible assistants to:
- Create and manage sharing groups
- Upload and download encrypted files
- Manage group membership
- Query transaction history

## Installation

### NPM

```bash
npm install -g nova-mcp-server
```

### From Source

```bash
git clone https://github.com/jcarbonnell/nova
cd nova/packages/mcp-server
npm install
npm run build
```

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "nova": {
      "command": "npx",
      "args": ["nova-mcp-server"],
      "env": {
        "NEAR_ACCOUNT_ID": "your-account.near",
        "NEAR_PRIVATE_KEY": "ed25519:...",
        "NEAR_NETWORK_ID": "testnet",
        "NOVA_CONTRACT_ID": "nova.testnet",
        "SHADE_AGENT_URL": "https://shade-testnet.phala.network"
      }
    }
  }
}
```

### Claude Code

Add to `.claude/settings.json` in your project:

```json
{
  "mcpServers": {
    "nova": {
      "command": "npx",
      "args": ["nova-mcp-server"],
      "env": {
        "NEAR_ACCOUNT_ID": "your-account.near",
        "NEAR_PRIVATE_KEY": "ed25519:...",
        "NEAR_NETWORK_ID": "testnet",
        "NOVA_CONTRACT_ID": "nova.testnet",
        "SHADE_AGENT_URL": "https://shade-testnet.phala.network"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEAR_ACCOUNT_ID` | Yes | Your NEAR account ID |
| `NEAR_PRIVATE_KEY` | Yes | Your NEAR private key |
| `NEAR_NETWORK_ID` | No | `testnet` or `mainnet` (default: testnet) |
| `NOVA_CONTRACT_ID` | No | Nova contract (default: nova.testnet) |
| `SHADE_AGENT_URL` | No | Shade Agent URL (default: testnet) |
| `IPFS_GATEWAY` | No | Custom IPFS gateway |

## Available Tools

### nova_create_group

Creates a new sharing group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Group name |
| `members` | string[] | No | Initial member account IDs |
| `description` | string | No | Group description |

**Example:**
```
Create a Nova group called "Engineering Docs" with alice.near and bob.near as members
```

**Response:**
```json
{
  "success": true,
  "group_id": "group-abc123",
  "message": "Group 'Engineering Docs' created with 2 members"
}
```

### nova_add_member

Adds a member to an existing group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group_id` | string | Yes | Target group ID |
| `member_id` | string | Yes | NEAR account to add |
| `role` | string | No | `admin` or `member` (default: member) |

**Example:**
```
Add carol.near to group group-abc123 as an admin
```

**Response:**
```json
{
  "success": true,
  "message": "Added carol.near to group as admin"
}
```

### nova_remove_member

Removes a member from a group. Triggers automatic key rotation.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group_id` | string | Yes | Target group ID |
| `member_id` | string | Yes | NEAR account to remove |

**Example:**
```
Remove bob.near from group group-abc123
```

**Response:**
```json
{
  "success": true,
  "message": "Removed bob.near from group. Key rotation triggered."
}
```

### nova_upload_file

Uploads and encrypts a file to a group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group_id` | string | Yes | Target group ID |
| `file_path` | string | Yes | Local file path |
| `file_name` | string | No | Display name (default: original) |
| `description` | string | No | File description |

**Example:**
```
Upload /path/to/report.pdf to group group-abc123 with description "Q4 Financial Report"
```

**Response:**
```json
{
  "success": true,
  "cid": "QmXyz...",
  "file_name": "report.pdf",
  "size": 1048576,
  "message": "File uploaded and encrypted successfully"
}
```

### nova_download_file

Downloads and decrypts a file from a group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group_id` | string | Yes | Source group ID |
| `cid` | string | Yes | File's IPFS CID |
| `output_path` | string | No | Local save path |

**Example:**
```
Download file QmXyz... from group group-abc123 to ~/Downloads/
```

**Response:**
```json
{
  "success": true,
  "file_path": "/Users/you/Downloads/report.pdf",
  "size": 1048576,
  "message": "File downloaded and decrypted"
}
```

### nova_list_groups

Lists all groups the user belongs to.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max results (default: 20) |
| `offset` | number | No | Pagination offset |

**Example:**
```
List my Nova groups
```

**Response:**
```json
{
  "groups": [
    {
      "id": "group-abc123",
      "name": "Engineering Docs",
      "member_count": 5,
      "file_count": 12,
      "role": "owner"
    },
    {
      "id": "group-def456",
      "name": "Marketing",
      "member_count": 3,
      "file_count": 8,
      "role": "member"
    }
  ],
  "total": 2
}
```

### nova_list_files

Lists files in a group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group_id` | string | Yes | Target group ID |
| `limit` | number | No | Max results (default: 20) |
| `sort_by` | string | No | `name`, `date`, `size` |

**Example:**
```
List files in group group-abc123 sorted by date
```

**Response:**
```json
{
  "files": [
    {
      "cid": "QmXyz...",
      "file_name": "report.pdf",
      "size": 1048576,
      "mime_type": "application/pdf",
      "uploaded_by": "alice.near",
      "uploaded_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 12
}
```

### nova_get_group_info

Gets detailed information about a group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group_id` | string | Yes | Target group ID |

**Example:**
```
Get info about group group-abc123
```

**Response:**
```json
{
  "id": "group-abc123",
  "name": "Engineering Docs",
  "owner": "alice.near",
  "members": [
    {"account_id": "alice.near", "role": "owner"},
    {"account_id": "bob.near", "role": "admin"},
    {"account_id": "carol.near", "role": "member"}
  ],
  "file_count": 12,
  "created_at": "2024-01-01T00:00:00Z",
  "key_version": 3
}
```

### nova_verify_membership

Checks if an account can access a group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group_id` | string | Yes | Target group ID |
| `account_id` | string | No | Account to check (default: self) |

**Example:**
```
Check if bob.near is a member of group group-abc123
```

**Response:**
```json
{
  "is_member": true,
  "role": "admin",
  "joined_at": "2024-01-05T12:00:00Z"
}
```

### nova_get_history

Gets transaction history for a group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group_id` | string | Yes | Target group ID |
| `limit` | number | No | Max results (default: 20) |
| `types` | string[] | No | Filter by transaction types |

**Example:**
```
Get the last 10 transactions for group group-abc123
```

**Response:**
```json
{
  "transactions": [
    {
      "type": "FILE_UPLOADED",
      "actor": "alice.near",
      "target": "QmXyz...",
      "timestamp": "2024-01-15T10:30:00Z"
    },
    {
      "type": "MEMBER_ADDED",
      "actor": "alice.near",
      "target": "bob.near",
      "timestamp": "2024-01-10T08:00:00Z"
    }
  ]
}
```

### nova_rotate_key

Manually triggers key rotation for a group.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group_id` | string | Yes | Target group ID |
| `reason` | string | No | Rotation reason |

**Example:**
```
Rotate the encryption key for group group-abc123
```

**Response:**
```json
{
  "success": true,
  "new_version": 4,
  "message": "Key rotated successfully"
}
```

## Usage Patterns

### Secure Document Workflow

```
User: Create a secure group for the legal team with alice.near, bob.near, and carol.near

Claude: [Uses nova_create_group to create "Legal Team" with members]

User: Upload the contract draft from ~/Documents/contract.pdf

Claude: [Uses nova_upload_file to encrypt and upload]

User: Carol has left the company, remove her access

Claude: [Uses nova_remove_member, which triggers key rotation]
        Carol can no longer access any files in this group.
```

### File Discovery

```
User: What files do I have access to?

Claude: [Uses nova_list_groups to find groups]
        [Uses nova_list_files for each group]

        You have access to:
        - Engineering Docs (12 files): report.pdf, specs.docx...
        - Marketing (8 files): campaign.pptx, assets.zip...
```

### Access Audit

```
User: Who can access the Engineering docs group?

Claude: [Uses nova_get_group_info]

        Members of "Engineering Docs":
        - alice.near (owner)
        - bob.near (admin)
        - carol.near (member)
        - david.near (member)
```

## Error Handling

The MCP server returns structured errors:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You are not a member of this group"
  }
}
```

### Common Errors

| Code | Description | Resolution |
|------|-------------|------------|
| `UNAUTHORIZED` | Not a group member | Request access |
| `GROUP_NOT_FOUND` | Invalid group ID | Verify group exists |
| `FILE_NOT_FOUND` | Invalid CID | Check file CID |
| `PERMISSION_DENIED` | Insufficient role | Need admin/owner |
| `RATE_LIMITED` | Too many requests | Wait and retry |
| `TEE_UNAVAILABLE` | Shade Agent down | Retry later |

## Security Notes

1. **Private Key Storage**: Store NEAR private key securely
2. **Environment Variables**: Use environment variables, not config files
3. **Network Selection**: Use testnet for development
4. **Key Rotation**: Automatic on member removal
5. **File Encryption**: All files encrypted client-side

## Debugging

### Enable Debug Logging

```json
{
  "mcpServers": {
    "nova": {
      "command": "npx",
      "args": ["nova-mcp-server", "--debug"],
      "env": {
        "DEBUG": "nova:*",
        ...
      }
    }
  }
}
```

### Test Connection

```bash
# Test NEAR connection
npx nova-mcp-server --test-connection

# Test Shade Agent
npx nova-mcp-server --test-shade-agent
```

## Best Practices

1. **Use Testnet First**: Always test on testnet before mainnet
2. **Verify Membership**: Check access before operations
3. **Handle Errors**: Implement proper error handling
4. **Monitor History**: Use transaction history for auditing
5. **Rotate Keys**: Rotate after removing sensitive access
