# Nova Smart Contract Reference

Complete reference for the Nova NEAR smart contract.

## Contract Overview

The Nova smart contract is the on-chain backbone of the Nova system, managing group registry, member authorization, TEE worker registration, token claims, and transaction logging.

**Contract IDs:**
- Mainnet: `nova-sdk.near`
- Testnet: `nova-sdk-6.testnet`

**Language:** Rust with `near-sdk`

## Contract State

The contract tracks the following state:

| State | Description |
|-------|-------------|
| **Groups** | Group registry with ownership and membership |
| **Members** | Member mappings per group |
| **Transactions** | Immutable transaction audit trails |
| **TEE Workers** | Approved Shade Agent worker registrations |
| **Used Nonces** | Nonce tracking for replay attack prevention |
| **Fees** | Fee collection and management |
| **Ownership Indexes** | Fast lookup of groups by owner |
| **Member Indexes** | Fast lookup of groups by member |

## Contract Functions

### TEE Management

#### approve_shade_code_hash

Approves a Shade Agent code hash. Only TEE workers running approved code can register with the contract.

```rust
pub fn approve_shade_code_hash(&mut self, code_hash: String)
```

**Purpose:** Ensures that only verified, audited TEE code can participate in key management. The contract maintains a list of approved code hashes that represent trusted Shade Agent builds.

#### register_shade_worker

Registers a TEE worker with the contract after attestation verification.

```rust
pub fn register_shade_worker(
    &mut self,
    worker_id: AccountId,
    attestation: Vec<u8>
)
```

**Purpose:** Allows a Shade Agent instance to register itself as a valid key management worker. The attestation proves the worker is running approved code inside a genuine TEE enclave. Multiple workers can run the same code hash for redundancy.

### Checksum Management

#### update_checksum

Updates the checksum for a group's encryption state.

```rust
pub fn update_checksum(&mut self, group_id: String, checksum: String)
```

**Purpose:** Called by the Shade Agent to update the on-chain checksum after key operations (generation, rotation). This allows clients to verify TEE responses against the on-chain state.

#### get_group_checksum

Returns the current checksum for a group (view function, free to call).

```rust
pub fn get_group_checksum(&self, group_id: String) -> Option<String>
```

**Purpose:** Enables clients to verify that TEE responses match the on-chain recorded state. Every response from the Shade Agent includes a checksum that can be verified against this value.

### Token Claim (Core NEAR-TEE Bridge)

#### claim_token

The central mechanism bridging NEAR Protocol and the Shade Agent TEE. This is how authorized users obtain access tokens to retrieve encryption keys.

```rust
pub fn claim_token(
    &mut self,
    group_id: String,
    payload_b64: String,
    signature_hex: String
) -> String
```

**Flow:**
1. Client generates payload: `{ group_id, user_id, nonce, timestamp }`
2. Client signs payload with ed25519 key over SHA256(payload)
3. Client calls `claim_token()` on the NEAR contract
4. Contract verifies:
   - **Signature validity** (ed25519 verification)
   - **Nonce uniqueness** (prevents replay attacks)
   - **Timestamp freshness** (5-minute window)
   - **Group membership** (caller is authorized)
5. Contract marks nonce as used
6. Returns a token string
7. Client presents token to Shade Agent TEE
8. TEE verifies token and returns the encryption key

```
Client                    NEAR Contract              Shade Agent (TEE)
  |                            |                           |
  | 1. Generate payload        |                           |
  |    {group_id, user_id,     |                           |
  |     nonce, timestamp}      |                           |
  |                            |                           |
  | 2. Sign with ed25519       |                           |
  |                            |                           |
  | 3. claim_token() -------->|                           |
  |                            | 4. Verify:                |
  |                            |    - signature            |
  |                            |    - nonce (unique)       |
  |                            |    - timestamp (5min)     |
  |                            |    - membership           |
  |                            |                           |
  | <---- 5. Return token -----|                           |
  |                            |                           |
  | 6. Present token ---------------------------------->  |
  |                            |                           | 7. Verify token
  | <------------------------------ 8. Encryption key -----|
  |                            |                           |
```

#### get_nonce_validity

Checks whether a nonce has been used for a given group and user (view function, free to call).

```rust
pub fn get_nonce_validity(
    &self,
    group_id: String,
    user_id: String,
    nonce: String
) -> bool
```

**Purpose:** Allows clients to check nonce validity before submitting a token claim, avoiding wasted gas on already-used nonces.

## Events

The contract emits events that can be consumed by indexers and off-chain services:

| Event | Trigger | Data |
|-------|---------|------|
| `NovaEvent::Registered` | New group registered or member added | Group ID, account details |
| `NovaEvent::Revoked` | Member revoked from group | Group ID, revoked account |
| `NovaEvent::FeeCollected` | Fee collected for an operation | Amount, operation type |

## Transaction Costs

| Operation | Approximate Cost |
|-----------|-----------------|
| Register Group | ~0.05-0.1 NEAR |
| Add Group Member | ~0.001 NEAR |
| Revoke Group Member | ~0.001 NEAR |
| Claim Token | Gas only |
| View functions | Free |

## Security Model

### Replay Protection
- Every `claim_token()` call requires a unique nonce
- Used nonces are permanently stored on-chain
- Clients should generate cryptographically random nonces

### Timestamp Freshness
- Token claims are valid within a 5-minute window
- Prevents capturing and replaying old signed requests

### TEE Verification
- Only workers with approved code hashes can register
- Attestation data is verified during worker registration
- On-chain checksums allow clients to verify TEE responses

### Access Control
- Group owners control membership
- Member revocation triggers key rotation in the Shade Agent
- The contract is the single source of truth for authorization

## Interacting via SDK

### JavaScript SDK

```typescript
import { NovaSdk } from 'nova-sdk-js';

// Mainnet
const sdk = new NovaSdk('alice.nova-sdk.near', {
  apiKey: process.env.NOVA_API_KEY,
});

// Testnet
const sdk = new NovaSdk('alice.nova-sdk-6.testnet', {
  apiKey: process.env.NOVA_API_KEY,
  rpcUrl: 'https://rpc.testnet.near.org',
  contractId: 'nova-sdk-6.testnet',
});

// Group operations (these interact with the contract)
await sdk.registerGroup('my-secure-files');
await sdk.addGroupMember(groupId, 'bob.nova-sdk.near');
await sdk.revokeGroupMember(groupId, 'bob.nova-sdk.near');
const authorized = await sdk.isAuthorized(groupId, 'bob.nova-sdk.near');
const owner = await sdk.getGroupOwner(groupId);
const checksum = await sdk.getGroupChecksum(groupId);
const txns = await sdk.getTransactionsForGroup(groupId);
```

### Rust SDK

```rust
sdk.register_group("my-secure-files").await?;
sdk.add_group_member(group_id, user_id).await?;
sdk.revoke_group_member(group_id, user_id).await?;
let status = sdk.auth_status(group_id).await?;
```

### NEAR CLI

```bash
# Register a group
near call nova-sdk-6.testnet register_group \
  '{"group_id": "my-project"}' \
  --accountId alice.nova-sdk-6.testnet \
  --deposit 0.1

# Check group checksum
near view nova-sdk-6.testnet get_group_checksum \
  '{"group_id": "my-project"}'

# Check nonce validity
near view nova-sdk-6.testnet get_nonce_validity \
  '{"group_id": "my-project", "user_id": "alice.nova-sdk-6.testnet", "nonce": "abc123"}'
```

## Contract Architecture

```
nova-sdk.near / nova-sdk-6.testnet
├── Group Registry
│   ├── Group ownership
│   ├── Member lists
│   └── Member authorization checks
├── TEE Worker Registry
│   ├── Approved code hashes
│   ├── Worker registrations
│   └── Attestation verification
├── Token Claim System
│   ├── Signature verification (ed25519)
│   ├── Nonce tracking (replay prevention)
│   ├── Timestamp validation (5-min window)
│   └── Token generation
├── Checksum Management
│   ├── Per-group checksums
│   └── TEE state verification
├── Transaction Log
│   └── Immutable audit trail
└── Fee Management
    └── Operation fee collection
```
