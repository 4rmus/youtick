# Nova Rust SDK Reference

API reference for `nova-sdk-rs`.

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
nova-sdk-rs = "0.1"
tokio = { version = "1", features = ["full"] }
```

## Overview

The Rust SDK provides the same core functionality as the JavaScript SDK: group management, file upload/retrieval with TEE-secured encryption, and NEAR contract interaction. It is best suited for:

- High-performance backend services
- Smart contract integration on NEAR
- CLI tools and system-level applications
- Resource-constrained environments

## Group Management

### register_group

Registers a new group on the NEAR contract. Sets the caller as owner and triggers key generation in the Shade Agent TEE.

```rust
sdk.register_group("my-secure-files").await?;
```

**Cost:** ~0.05-0.1 NEAR

### add_group_member

Adds a member to an existing group.

```rust
sdk.add_group_member("my-secure-files", "bob.nova-sdk.near").await?;
```

**Cost:** ~0.001 NEAR

### revoke_group_member

Revokes a member from a group. Triggers automatic key rotation in the Shade Agent TEE.

```rust
sdk.revoke_group_member("my-secure-files", "bob.nova-sdk.near").await?;
// bob can no longer access new uploads
```

**Cost:** ~0.001 NEAR

### auth_status

Checks the authorization status for a group.

```rust
let status = sdk.auth_status("my-secure-files").await?;
```

## Complete Usage Example

```rust
use nova_sdk_rs::NovaSdk;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize (refer to crate docs for configuration details)
    let sdk = NovaSdk::new(/* config */)?;

    // Register a group
    sdk.register_group("project-alpha").await?;

    // Add team members
    sdk.add_group_member("project-alpha", "bob.nova-sdk.near").await?;
    sdk.add_group_member("project-alpha", "carol.nova-sdk.near").await?;

    // Check authorization
    let status = sdk.auth_status("project-alpha").await?;

    // Revoke a member (triggers key rotation)
    sdk.revoke_group_member("project-alpha", "carol.nova-sdk.near").await?;

    Ok(())
}
```

## Encryption

The Rust SDK uses AES-256-GCM for file encryption, matching the JavaScript SDK. Upload and retrieve operations handle encryption/decryption transparently, following the same flow:

- **Upload:** prepare_upload -> TEE key -> encrypt locally -> finalize_upload -> IPFS + NEAR
- **Retrieve:** prepare_retrieve -> TEE key + encrypted data -> decrypt locally

## When to Choose Rust vs JavaScript

| Use Case | Recommended SDK |
|----------|----------------|
| Smart contracts on NEAR | Rust |
| High-performance services | Rust |
| CLI tools | Rust |
| Native applications | Rust |
| Web applications (browser) | JavaScript |
| API servers (Node.js) | JavaScript |
| Rapid prototyping | JavaScript |

## Network Configuration

| Network | Contract ID |
|---------|-------------|
| Mainnet | `nova-sdk.near` |
| Testnet | `nova-sdk-6.testnet` |

## Additional Resources

For detailed configuration, advanced features, and complete API surface, refer to:

- Crate documentation: `cargo doc --open`
- Official Documentation: https://nova-25.gitbook.io/nova-docs/
- GitHub: https://github.com/jcarbonnell/nova
