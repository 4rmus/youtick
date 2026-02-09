# Nova Smart Contract Reference

Complete reference for the Nova NEAR smart contract API.

## Contract Overview

The Nova smart contract manages:
- Group creation and configuration
- Member access control
- File registry (CID mappings)
- Transaction logging
- Authorization verification for Shade Agent

**Contract ID**:
- Testnet: `nova.testnet`
- Mainnet: `nova.near`

## Contract Interface

### View Methods

View methods are free to call and don't require a transaction.

#### get_group

Returns group information.

```rust
pub fn get_group(&self, group_id: String) -> Option<GroupView> {
    // Returns None if group doesn't exist
}
```

**Response:**
```json
{
  "id": "group-abc123",
  "name": "Engineering Team",
  "owner": "alice.near",
  "member_count": 5,
  "file_count": 12,
  "created_at": 1704067200000,
  "metadata": {
    "description": "Internal documentation"
  }
}
```

#### get_groups_for_account

Lists all groups an account belongs to.

```rust
pub fn get_groups_for_account(
    &self,
    account_id: AccountId,
    from_index: Option<u64>,
    limit: Option<u64>
) -> Vec<GroupView>
```

**Parameters:**
- `account_id`: NEAR account ID
- `from_index`: Pagination offset (default: 0)
- `limit`: Max results (default: 50, max: 100)

#### get_group_members

Returns all members of a group.

```rust
pub fn get_group_members(&self, group_id: String) -> Vec<MemberView>
```

**Response:**
```json
[
  {
    "account_id": "alice.near",
    "role": "owner",
    "joined_at": 1704067200000
  },
  {
    "account_id": "bob.near",
    "role": "member",
    "joined_at": 1704153600000
  }
]
```

#### is_member

Checks if an account is a member of a group.

```rust
pub fn is_member(&self, group_id: String, account_id: AccountId) -> bool
```

#### get_member_role

Returns the role of a member in a group.

```rust
pub fn get_member_role(
    &self,
    group_id: String,
    account_id: AccountId
) -> Option<MemberRole>
```

**Returns:** `"owner"`, `"admin"`, `"member"`, or `null`

#### get_group_files

Lists files in a group.

```rust
pub fn get_group_files(
    &self,
    group_id: String,
    from_index: Option<u64>,
    limit: Option<u64>
) -> Vec<FileView>
```

**Response:**
```json
[
  {
    "cid": "QmXyz...",
    "file_name": "report.pdf",
    "mime_type": "application/pdf",
    "size": 1048576,
    "uploaded_by": "alice.near",
    "uploaded_at": 1704240000000
  }
]
```

#### get_file

Returns information about a specific file.

```rust
pub fn get_file(&self, group_id: String, cid: String) -> Option<FileView>
```

#### get_group_history

Returns transaction history for a group.

```rust
pub fn get_group_history(
    &self,
    group_id: String,
    from_index: Option<u64>,
    limit: Option<u64>
) -> Vec<TransactionView>
```

#### get_key_version

Returns the current encryption key version for a group.

```rust
pub fn get_key_version(&self, group_id: String) -> Option<u64>
```

#### verify_authorization

Verifies if an account can access a group's encryption key.
Used by Shade Agent for authorization.

```rust
pub fn verify_authorization(
    &self,
    group_id: String,
    account_id: AccountId,
    signature: String,
    timestamp: u64
) -> bool
```

### Change Methods

Change methods require a transaction and may cost gas.

#### create_group

Creates a new sharing group.

```rust
#[payable]
pub fn create_group(
    &mut self,
    name: String,
    members: Option<Vec<AccountId>>,
    metadata: Option<String>
) -> String // Returns group_id
```

**Required Deposit:** 0.1 NEAR (for storage)

**Example Call:**
```bash
near call nova.testnet create_group \
  '{"name": "My Group", "members": ["bob.near"]}' \
  --accountId alice.near \
  --deposit 0.1
```

#### add_member

Adds a member to a group.

```rust
#[payable]
pub fn add_member(
    &mut self,
    group_id: String,
    member_id: AccountId,
    role: Option<String>
) -> bool
```

**Required Deposit:** 0.01 NEAR (for storage)

**Authorization:** Owner or Admin only

#### remove_member

Removes a member from a group.

```rust
pub fn remove_member(
    &mut self,
    group_id: String,
    member_id: AccountId
) -> bool
```

**Authorization:** Owner or Admin only (cannot remove owner)

**Side Effect:** Triggers key rotation notification

#### update_member_role

Updates a member's role.

```rust
pub fn update_member_role(
    &mut self,
    group_id: String,
    member_id: AccountId,
    new_role: String
) -> bool
```

**Authorization:** Owner only

**Valid Roles:** `"admin"`, `"member"`

#### register_file

Registers a file in the group's registry.

```rust
#[payable]
pub fn register_file(
    &mut self,
    group_id: String,
    cid: String,
    file_name: String,
    mime_type: String,
    size: u64,
    metadata: Option<String>
) -> bool
```

**Required Deposit:** Variable based on metadata size

**Authorization:** Any group member

#### unregister_file

Removes a file from the group's registry.

```rust
pub fn unregister_file(
    &mut self,
    group_id: String,
    cid: String
) -> bool
```

**Authorization:** File uploader, Admin, or Owner

#### increment_key_version

Increments the key version (for key rotation tracking).

```rust
pub fn increment_key_version(&mut self, group_id: String) -> u64
```

**Authorization:** Called by Shade Agent callback

#### delete_group

Deletes a group and all associated data.

```rust
pub fn delete_group(&mut self, group_id: String) -> bool
```

**Authorization:** Owner only

**Returns:** Storage deposit to owner

## Data Structures

### GroupView

```rust
pub struct GroupView {
    pub id: String,
    pub name: String,
    pub owner: AccountId,
    pub member_count: u64,
    pub file_count: u64,
    pub created_at: u64,
    pub metadata: Option<serde_json::Value>,
}
```

### MemberView

```rust
pub struct MemberView {
    pub account_id: AccountId,
    pub role: MemberRole,
    pub joined_at: u64,
}

pub enum MemberRole {
    Owner,
    Admin,
    Member,
}
```

### FileView

```rust
pub struct FileView {
    pub cid: String,
    pub file_name: String,
    pub mime_type: String,
    pub size: u64,
    pub uploaded_by: AccountId,
    pub uploaded_at: u64,
    pub metadata: Option<serde_json::Value>,
}
```

### TransactionView

```rust
pub struct TransactionView {
    pub id: String,
    pub tx_type: TransactionType,
    pub actor: AccountId,
    pub target: Option<String>,
    pub timestamp: u64,
    pub metadata: Option<serde_json::Value>,
}

pub enum TransactionType {
    GroupCreated,
    MemberAdded,
    MemberRemoved,
    FileUploaded,
    FileDeleted,
    KeyRotated,
    RoleChanged,
    GroupDeleted,
}
```

## Storage Model

### Storage Costs

| Operation | Approximate Cost |
|-----------|-----------------|
| Create Group | 0.1 NEAR |
| Add Member | 0.01 NEAR |
| Register File | 0.005-0.02 NEAR |
| Update Metadata | Variable |

### Storage Refunds

When removing members or deleting groups, storage deposits are refunded to the original depositor.

## Events

The contract emits NEP-297 standard events:

### GroupCreated

```json
{
  "standard": "nova",
  "version": "1.0.0",
  "event": "group_created",
  "data": {
    "group_id": "group-abc123",
    "owner": "alice.near",
    "name": "Engineering Team"
  }
}
```

### MemberAdded

```json
{
  "standard": "nova",
  "version": "1.0.0",
  "event": "member_added",
  "data": {
    "group_id": "group-abc123",
    "member_id": "bob.near",
    "role": "member",
    "added_by": "alice.near"
  }
}
```

### MemberRemoved

```json
{
  "standard": "nova",
  "version": "1.0.0",
  "event": "member_removed",
  "data": {
    "group_id": "group-abc123",
    "member_id": "bob.near",
    "removed_by": "alice.near"
  }
}
```

### FileRegistered

```json
{
  "standard": "nova",
  "version": "1.0.0",
  "event": "file_registered",
  "data": {
    "group_id": "group-abc123",
    "cid": "QmXyz...",
    "file_name": "report.pdf",
    "uploaded_by": "alice.near"
  }
}
```

### KeyRotationRequested

```json
{
  "standard": "nova",
  "version": "1.0.0",
  "event": "key_rotation_requested",
  "data": {
    "group_id": "group-abc123",
    "reason": "member_removed",
    "triggered_by": "alice.near"
  }
}
```

## Cross-Contract Calls

### Shade Agent Callback

The contract receives callbacks from the Shade Agent:

```rust
pub fn on_key_rotated(
    &mut self,
    group_id: String,
    new_version: u64
) -> bool
```

**Authorization:** Shade Agent account only

## Error Codes

| Code | Description |
|------|-------------|
| `E001` | Group not found |
| `E002` | Not authorized |
| `E003` | Already a member |
| `E004` | Not a member |
| `E005` | Cannot remove owner |
| `E006` | File not found |
| `E007` | Insufficient deposit |
| `E008` | Invalid metadata |
| `E009` | Group name too long |
| `E010` | Max members exceeded |

## CLI Examples

### Using NEAR CLI

```bash
# Create a group
near call nova.testnet create_group \
  '{"name": "Project Alpha", "members": ["bob.near", "carol.near"]}' \
  --accountId alice.near \
  --deposit 0.1

# Add a member
near call nova.testnet add_member \
  '{"group_id": "group-abc123", "member_id": "david.near", "role": "member"}' \
  --accountId alice.near \
  --deposit 0.01

# Check membership
near view nova.testnet is_member \
  '{"group_id": "group-abc123", "account_id": "bob.near"}'

# List group files
near view nova.testnet get_group_files \
  '{"group_id": "group-abc123", "limit": 10}'

# Register a file
near call nova.testnet register_file \
  '{"group_id": "group-abc123", "cid": "QmXyz...", "file_name": "doc.pdf", "mime_type": "application/pdf", "size": 1048576}' \
  --accountId alice.near \
  --deposit 0.01

# Remove a member (triggers key rotation)
near call nova.testnet remove_member \
  '{"group_id": "group-abc123", "member_id": "bob.near"}' \
  --accountId alice.near
```

### Using near-api-js

```javascript
import { connect, Contract, keyStores } from 'near-api-js';

const near = await connect({
  networkId: 'testnet',
  keyStore: new keyStores.BrowserLocalStorageKeyStore(),
  nodeUrl: 'https://rpc.testnet.near.org'
});

const account = await near.account('alice.near');
const contract = new Contract(account, 'nova.testnet', {
  viewMethods: [
    'get_group',
    'get_groups_for_account',
    'get_group_members',
    'is_member',
    'get_group_files'
  ],
  changeMethods: [
    'create_group',
    'add_member',
    'remove_member',
    'register_file',
    'unregister_file',
    'delete_group'
  ]
});

// Create group
const groupId = await contract.create_group(
  { name: 'My Group', members: ['bob.near'] },
  '300000000000000', // gas
  '100000000000000000000000' // 0.1 NEAR deposit
);

// Check membership
const isMember = await contract.is_member({
  group_id: groupId,
  account_id: 'bob.near'
});
```

## Security Considerations

1. **Authorization Checks**: All change methods verify caller authorization
2. **Signature Verification**: Authorization for Shade Agent uses cryptographic signatures
3. **Replay Protection**: Timestamp validation prevents replay attacks
4. **Storage Safety**: Deposits prevent spam and ensure data persistence
5. **Owner Immutability**: Group owner cannot be changed or removed
