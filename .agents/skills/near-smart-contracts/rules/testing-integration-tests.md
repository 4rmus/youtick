# Testing: Integration Tests

Use Workspaces-based sandbox tests for deployment paths, callbacks, and contract-to-contract behavior.

## Why It Matters

Unit tests catch pure Rust logic issues. Integration tests catch:

- initialization failures,
- serialization mismatches,
- cross-contract call behavior,
- gas and deposit handling,
- sandbox-only edge cases that never appear in plain unit tests.

## ❌ Insufficient

```rust
#[test]
fn test_transfer_logic_only() {
    let mut contract = Contract::new("owner.near".parse().unwrap());
    contract.transfer("user.near".parse().unwrap(), U128(100));
}
```

This proves local logic only. It does not prove deployment, ABI shape, or runtime behavior.

## ✅ Better

```rust
use near_workspaces::Worker;
use near_workspaces::network::Sandbox;
use serde_json::json;

async fn setup() -> anyhow::Result<(Worker<Sandbox>, near_workspaces::Contract)> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = near_workspaces::compile_project("./").await?;
    let contract = worker.dev_deploy(&wasm).await?;
    Ok((worker, contract))
}

#[tokio::test]
async fn registers_ticket() -> anyhow::Result<()> {
    let (worker, contract) = setup().await?;
    let owner = worker.dev_create_account().await?;

    contract
        .call("new")
        .args_json(json!({ "owner_id": owner.id() }))
        .transact()
        .await?
        .into_result()?;

    let result = owner
        .call(contract.id(), "register_ticket")
        .args_json(json!({ "token_id": "ticket-1" }))
        .gas(100_000_000_000_000)
        .transact()
        .await?;

    assert!(result.is_success());
    Ok(())
}
```

## Practical Guidance

- Keep `near-workspaces` aligned with the repo. This workspace currently uses `0.14`.
- Use `near_workspaces::compile_project("./")` or committed WASM artifacts consistently inside the project.
- Cover both success and failure cases, especially storage, deposit, and callback paths.
- Assert returned state and receipt outcomes, not only `is_success()`.
- If the contract upgrade path matters, add a dedicated integration test for state migration.
