# Nova Rust SDK Reference

Complete API reference for `nova-sdk-rs`.

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
nova-sdk-rs = "0.1"
tokio = { version = "1", features = ["full"] }
near-sdk = "5.0"
```

## Initialization

### NovaClient

```rust
use nova_sdk_rs::{NovaClient, NovaConfig, NetworkId};
use near_sdk::AccountId;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = NovaConfig {
        network_id: NetworkId::Testnet,
        contract_id: "nova.testnet".parse()?,
        shade_agent_url: "https://shade.phala.network".to_string(),
        ipfs_gateway: None, // Use default
    };

    let client = NovaClient::new(config, near_account).await?;

    Ok(())
}
```

### With Custom NEAR Account

```rust
use near_sdk::InMemorySigner;
use near_crypto::SecretKey;

let signer = InMemorySigner::from_secret_key(
    "your-account.testnet".parse()?,
    secret_key,
);

let client = NovaClient::with_signer(config, signer).await?;
```

## Group Management

### create_group

```rust
use nova_sdk_rs::{GroupConfig, CreateGroupResult};

let config = GroupConfig {
    name: "Engineering Team".to_string(),
    members: vec![
        "alice.near".parse()?,
        "bob.near".parse()?,
    ],
    metadata: Some(serde_json::json!({
        "description": "Internal docs"
    })),
};

let result: CreateGroupResult = client.create_group(config).await?;
println!("Group ID: {}", result.group_id);
```

### get_group

```rust
use nova_sdk_rs::Group;

let group: Group = client.get_group("group-abc123").await?;

println!("Name: {}", group.name);
println!("Owner: {}", group.owner);
println!("Members: {}", group.members.len());
```

### list_groups

```rust
use nova_sdk_rs::ListGroupsOptions;

let options = ListGroupsOptions {
    account_id: None, // Use connected account
    limit: Some(10),
    offset: Some(0),
};

let groups = client.list_groups(options).await?;

for group in groups {
    println!("{}: {} files", group.name, group.file_count);
}
```

### delete_group

```rust
client.delete_group("group-abc123").await?;
```

## Member Management

### add_member

```rust
use nova_sdk_rs::{AddMemberParams, MemberRole};

let params = AddMemberParams {
    group_id: "group-abc123".to_string(),
    member_id: "carol.near".parse()?,
    role: MemberRole::Member,
};

client.add_member(params).await?;
```

### remove_member

```rust
use nova_sdk_rs::RemoveMemberParams;

let params = RemoveMemberParams {
    group_id: "group-abc123".to_string(),
    member_id: "bob.near".parse()?,
};

client.remove_member(params).await?;
// Key is automatically rotated
```

### verify_membership

```rust
let is_member = client.verify_membership(
    "group-abc123",
    &"alice.near".parse()?
).await?;

if is_member {
    println!("User can access group files");
}
```

### get_group_members

```rust
let members = client.get_group_members("group-abc123").await?;

for member in members {
    println!("{} ({})", member.account_id, member.role);
}
```

## File Operations

### upload_file

```rust
use nova_sdk_rs::{UploadParams, FileMetadata};
use std::fs::File;
use std::io::Read;

// Read file
let mut file = File::open("document.pdf")?;
let mut contents = Vec::new();
file.read_to_end(&mut contents)?;

let params = UploadParams {
    group_id: "group-abc123".to_string(),
    data: contents,
    metadata: FileMetadata {
        file_name: Some("document.pdf".to_string()),
        mime_type: Some("application/pdf".to_string()),
        description: Some("Q4 Report".to_string()),
        custom: None,
    },
};

let result = client.upload_file(params).await?;
println!("CID: {}", result.cid);
```

### upload_file_with_progress

```rust
use nova_sdk_rs::ProgressCallback;

let callback: ProgressCallback = Box::new(|progress| {
    println!("Upload progress: {}%", progress);
});

let result = client.upload_file_with_progress(params, callback).await?;
```

### download_file

```rust
use nova_sdk_rs::DownloadParams;

let params = DownloadParams {
    group_id: "group-abc123".to_string(),
    cid: "QmXyz...".to_string(),
    account_id: None, // Use connected account
};

let decrypted_data: Vec<u8> = client.download_file(params).await?;

// Write to file
std::fs::write("downloaded.pdf", &decrypted_data)?;
```

### list_group_files

```rust
use nova_sdk_rs::ListFilesOptions;

let options = ListFilesOptions {
    group_id: "group-abc123".to_string(),
    limit: Some(20),
    offset: None,
    sort_by: Some("uploaded_at".to_string()),
    sort_order: Some("desc".to_string()),
};

let files = client.list_group_files(options).await?;

for file in files {
    println!("{} ({} bytes)", file.file_name, file.size);
}
```

### delete_file

```rust
client.delete_file("group-abc123", "QmXyz...").await?;
```

### get_file_info

```rust
let info = client.get_file_info("group-abc123", "QmXyz...").await?;

println!("Name: {}", info.file_name);
println!("Size: {} bytes", info.size);
println!("Uploaded by: {}", info.uploaded_by);
```

## Key Management

### rotate_group_key

```rust
client.rotate_group_key("group-abc123").await?;
```

### get_key_status

```rust
let status = client.get_key_status("group-abc123").await?;

println!("Version: {}", status.key_version);
println!("Last rotated: {}", status.last_rotated);
```

## Transaction History

### get_group_history

```rust
use nova_sdk_rs::{HistoryOptions, TransactionType};

let options = HistoryOptions {
    group_id: "group-abc123".to_string(),
    limit: Some(50),
    offset: None,
    types: Some(vec![
        TransactionType::FileUploaded,
        TransactionType::MemberAdded,
    ]),
    start_date: None,
    end_date: None,
};

let history = client.get_group_history(options).await?;

for tx in history.transactions {
    println!("{:?}: {} at {}", tx.tx_type, tx.actor, tx.timestamp);
}
```

## Error Handling

### Error Types

```rust
use nova_sdk_rs::{NovaError, ErrorKind};

match client.download_file(params).await {
    Ok(data) => {
        // Process data
    }
    Err(e) => match e.kind() {
        ErrorKind::Unauthorized => {
            eprintln!("Not authorized to access this file");
        }
        ErrorKind::GroupNotFound => {
            eprintln!("Group does not exist");
        }
        ErrorKind::FileNotFound => {
            eprintln!("File not found in group");
        }
        ErrorKind::ShadeAgentError => {
            eprintln!("Key management service error");
        }
        ErrorKind::IpfsError => {
            eprintln!("IPFS storage error");
        }
        ErrorKind::NearError => {
            eprintln!("NEAR blockchain error: {}", e);
        }
        ErrorKind::EncryptionError => {
            eprintln!("Encryption/decryption failed");
        }
        _ => {
            eprintln!("Unknown error: {}", e);
        }
    }
}
```

### Result Type

```rust
use nova_sdk_rs::NovaResult;

async fn process_file(client: &NovaClient) -> NovaResult<()> {
    let group = client.get_group("group-abc123").await?;
    let files = client.list_group_files(ListFilesOptions {
        group_id: group.id,
        ..Default::default()
    }).await?;

    Ok(())
}
```

## Async Streams

### Stream File Downloads

```rust
use futures::StreamExt;
use nova_sdk_rs::download_file_stream;

let mut stream = client.download_file_stream(params).await?;

while let Some(chunk) = stream.next().await {
    let chunk = chunk?;
    // Process chunk
}
```

### Stream File Uploads

```rust
use nova_sdk_rs::upload_file_stream;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

let file = File::open("large-file.zip").await?;
let stream = ReaderStream::new(file);

let result = client.upload_file_stream(
    "group-abc123",
    stream,
    metadata,
).await?;
```

## Data Structures

### Group

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub owner: AccountId,
    pub members: Vec<Member>,
    pub file_count: u64,
    pub created_at: u64,
    pub metadata: Option<serde_json::Value>,
}
```

### Member

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Member {
    pub account_id: AccountId,
    pub role: MemberRole,
    pub joined_at: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum MemberRole {
    Owner,
    Admin,
    Member,
}
```

### FileInfo

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub cid: String,
    pub file_name: String,
    pub mime_type: String,
    pub size: u64,
    pub uploaded_by: AccountId,
    pub uploaded_at: u64,
    pub metadata: Option<serde_json::Value>,
}
```

### Transaction

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub tx_type: TransactionType,
    pub actor: AccountId,
    pub target: Option<String>,
    pub timestamp: u64,
    pub transaction_hash: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
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

## WASM Support

The SDK can be compiled to WebAssembly:

```toml
[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"
```

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub async fn create_nova_group(name: String) -> Result<String, JsValue> {
    let client = get_client()?;
    let result = client.create_group(GroupConfig {
        name,
        members: vec![],
        metadata: None,
    }).await.map_err(|e| JsValue::from_str(&e.to_string()))?;

    Ok(result.group_id)
}
```

## Testing

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use nova_sdk_rs::testing::MockNovaClient;

    #[tokio::test]
    async fn test_create_group() {
        let mock = MockNovaClient::new();
        mock.expect_create_group()
            .returning(|_| Ok(CreateGroupResult {
                group_id: "test-group".to_string(),
                transaction_hash: "hash".to_string(),
                created_at: 0,
            }));

        let result = mock.create_group(GroupConfig {
            name: "Test".to_string(),
            members: vec![],
            metadata: None,
        }).await;

        assert!(result.is_ok());
    }
}
```

## Performance Tips

1. **Connection Pooling**: Reuse NovaClient instances
2. **Batch Operations**: Use parallel uploads with `tokio::join!`
3. **Streaming**: Use streams for large files
4. **Caching**: Cache group/file metadata locally
5. **Async All the Way**: Avoid blocking in async context
