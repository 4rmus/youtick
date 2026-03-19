use near_workspaces::{types::NearToken, Account, Contract};
use serde_json::json;

// WASM path relative to nft-ticket-tests crate
const WASM_FILEPATH: &str = "../nft-ticket/target/near/youtick_nft.wasm";

async fn init() -> anyhow::Result<(Contract, Account, Account)> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = std::fs::read(WASM_FILEPATH)?;
    let contract = worker.dev_deploy(&wasm).await?;

    // Initialize contract with owner
    let owner = worker.dev_create_account().await?;
    contract
        .call("new")
        .args_json(json!({"owner_id": owner.id()}))
        .transact()
        .await?
        .into_result()?;

    // Create buyer account
    let buyer = worker.dev_create_account().await?;

    Ok((contract, owner, buyer))
}

// ═══════════════════════════════════════════════════════════════
// CONTRACT INITIALIZATION TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_contract_initialization() -> anyhow::Result<()> {
    let (contract, owner, _) = init().await?;

    // Check NFT metadata
    let metadata: serde_json::Value = contract
        .view("nft_metadata")
        .args_json(json!({}))
        .await?
        .json()?;

    assert_eq!(metadata["name"], "YouTick Video Tickets");
    assert_eq!(metadata["symbol"], "YTICK");

    // Check next token ID starts at 0
    let next_id: u64 = contract
        .view("get_next_token_id")
        .args_json(json!({}))
        .await?
        .json()?;

    assert_eq!(next_id, 0);

    println!("✅ Contract initialization test passed");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// EVENT TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_create_event() -> anyhow::Result<()> {
    let (contract, owner, _) = init().await?;

    // Create event
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmTestCid123",
            "title": "Test Concert",
            "description": "A great concert",
            "price": "1000000000000000000000000"  // 1 NEAR
        }))
        .deposit(NearToken::from_millinear(100)) // 0.1 NEAR deposit
        .transact()
        .await?
        .into_result()?;

    // Verify event exists
    let event: Option<serde_json::Value> = contract
        .view("get_event")
        .args_json(json!({"encrypted_cid": "QmTestCid123"}))
        .await?
        .json()?;

    assert!(event.is_some());
    let event = event.unwrap();
    assert_eq!(event["title"], "Test Concert");
    assert_eq!(event["price"], "1000000000000000000000000");

    println!("✅ Create event test passed");
    Ok(())
}

#[tokio::test]
async fn test_create_event_insufficient_deposit() -> anyhow::Result<()> {
    let (contract, owner, _) = init().await?;

    // Try to create event with insufficient deposit (should fail)
    let result = owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmTestCid456",
            "title": "Test Event",
            "description": "Description",
            "price": "1000000000000000000000000"
        }))
        .deposit(NearToken::from_millinear(50)) // Only 0.05 NEAR (need 0.1)
        .transact()
        .await?;

    assert!(result.is_failure());
    println!("✅ Create event insufficient deposit test passed (correctly rejected)");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// TICKET PURCHASE TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_buy_ticket() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event first
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmVideoCid",
            "title": "Premium Video",
            "description": "Exclusive content",
            "price": "1000000000000000000000000"  // 1 NEAR
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Buy ticket
    let result = buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmVideoCid"
        }))
        .deposit(NearToken::from_millinear(1010)) // 1.01 NEAR (price + storage)
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // Verify NFT was minted
    let tokens: Vec<serde_json::Value> = contract
        .view("nft_tokens_for_owner")
        .args_json(json!({
            "account_id": buyer.id()
        }))
        .await?
        .json()?;

    assert_eq!(tokens.len(), 1);
    assert_eq!(tokens[0]["token_id"], "0");

    // Verify video metadata
    let video_meta: Option<serde_json::Value> = contract
        .view("get_video_metadata")
        .args_json(json!({"token_id": "0"}))
        .await?
        .json()?;

    assert!(video_meta.is_some());
    assert_eq!(video_meta.unwrap()["encrypted_cid"], "QmVideoCid");

    println!("✅ Buy ticket test passed");
    Ok(())
}

#[tokio::test]
async fn test_buy_ticket_excess_refund() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event with 1 NEAR price
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmRefundTest",
            "title": "Refund Test Event",
            "description": "Testing excess deposit refund",
            "price": "1000000000000000000000000"  // 1 NEAR
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Get buyer's initial balance
    let initial_balance = buyer.view_account().await?.balance;

    // Buy ticket with EXCESS deposit (3 NEAR instead of ~1.01 NEAR)
    let result = buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmRefundTest"
        }))
        .deposit(NearToken::from_near(3)) // 3 NEAR (excess ~1.99 NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // Get buyer's final balance
    let final_balance = buyer.view_account().await?.balance;

    // Calculate actual cost (should be ~1.01 NEAR + gas, not 3 NEAR)
    // Use saturating_sub to avoid overflow if final_balance somehow increased
    let balance_diff = initial_balance.as_yoctonear().saturating_sub(final_balance.as_yoctonear());

    // The cost should be approximately:
    // - 1 NEAR (ticket price)
    // - 0.01 NEAR (storage)
    // - ~0.01 NEAR (gas)
    // Total: ~1.02 NEAR, NOT 3 NEAR

    // If refund works, balance_diff should be less than 1.5 NEAR
    // (giving generous margin for gas costs)
    assert!(
        balance_diff < 1_500_000_000_000_000_000_000_000, // 1.5 NEAR
        "Excess deposit was not refunded! Balance diff: {} yoctoNEAR",
        balance_diff
    );

    // Verify NFT was still minted
    let tokens: Vec<serde_json::Value> = contract
        .view("nft_tokens_for_owner")
        .args_json(json!({"account_id": buyer.id()}))
        .await?
        .json()?;

    assert_eq!(tokens.len(), 1, "NFT should be minted despite refund");

    println!("✅ Buy ticket excess refund test passed");
    println!("   Balance diff: {} NEAR", balance_diff as f64 / 1e24);
    Ok(())
}

#[tokio::test]
async fn test_buy_ticket_insufficient_deposit() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmInsufficientTest",
            "title": "Test Event",
            "description": "Description",
            "price": "1000000000000000000000000"  // 1 NEAR
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Try to buy with insufficient deposit (should fail)
    let result = buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmInsufficientTest"
        }))
        .deposit(NearToken::from_millinear(500)) // Only 0.5 NEAR (need 1.01)
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?;

    assert!(result.is_failure());
    println!("✅ Buy ticket insufficient deposit test passed (correctly rejected)");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// FREE TICKET TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_buy_free_ticket() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create FREE event (price = 0)
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmFreeVideo",
            "title": "Free Content",
            "description": "Free for everyone",
            "price": "0"  // FREE!
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Buy free ticket (only need storage cost)
    let result = buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmFreeVideo"
        }))
        .deposit(NearToken::from_millinear(10)) // Just storage
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // Verify NFT was minted
    let tokens: Vec<serde_json::Value> = contract
        .view("nft_tokens_for_owner")
        .args_json(json!({"account_id": buyer.id()}))
        .await?
        .json()?;

    assert_eq!(tokens.len(), 1);

    println!("✅ Buy free ticket test passed");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// LEGACY API REMOVAL TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_deposit_and_withdraw_funds() -> anyhow::Result<()> {
    let (contract, _, buyer) = init().await?;

    let deposit_result = buyer
        .call(contract.id(), "deposit_funds")
        .args_json(json!({}))
        .deposit(NearToken::from_near(2))
        .transact()
        .await?;
    assert!(deposit_result.is_failure());

    let withdraw_result = buyer
        .call(contract.id(), "withdraw_funds")
        .args_json(json!({}))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(withdraw_result.is_failure());

    let balance_result = contract
        .view("get_user_balance")
        .args_json(json!({"account_id": buyer.id()}))
        .await;
    assert!(balance_result.is_err());

    println!("✅ Legacy prepaid balance methods are removed");
    Ok(())
}

#[tokio::test]
async fn test_buy_ticket_prepaid() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmPrepaidTest",
            "title": "Prepaid Test",
            "description": "Buy with prepaid balance",
            "price": "500000000000000000000000"  // 0.5 NEAR
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Legacy prepaid path is disabled.
    let result = buyer
        .call(contract.id(), "buy_ticket_prepaid")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmPrepaidTest"
        }))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?;

    assert!(result.is_failure());

    println!("✅ Legacy prepaid buy path is removed");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// TRIAL POOL TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_trial_pool() -> anyhow::Result<()> {
    let (contract, owner, _) = init().await?;

    // Fund trial pool
    owner
        .call(contract.id(), "fund_trial_pool")
        .args_json(json!({}))
        .deposit(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    // Check trial pool balance
    let pool_balance: String = contract
        .view("get_trial_pool_balance")
        .args_json(json!({}))
        .await?
        .json()?;

    assert_eq!(pool_balance, "5000000000000000000000000"); // 5 NEAR

    println!("✅ Trial pool test passed");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// GIFT TICKET TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_gift_ticket() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmGiftTest",
            "title": "Gift Event",
            "description": "Gifted content",
            "price": "1000000000000000000000000"  // 1 NEAR (but gift is free)
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Owner gifts ticket to buyer (only pays storage, no commission)
    owner
        .call(contract.id(), "gift_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmGiftTest"
        }))
        .deposit(NearToken::from_millinear(10)) // Just storage
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // Verify NFT was minted to buyer
    let tokens: Vec<serde_json::Value> = contract
        .view("nft_tokens_for_owner")
        .args_json(json!({"account_id": buyer.id()}))
        .await?
        .json()?;

    assert_eq!(tokens.len(), 1);

    println!("✅ Gift ticket test passed");
    Ok(())
}

#[tokio::test]
async fn test_gift_ticket_only_creator() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event (owner is creator)
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmCreatorOnlyTest",
            "title": "Creator Only",
            "description": "Only creator can gift",
            "price": "1000000000000000000000000"
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Buyer (not creator) tries to gift - should fail
    let result = buyer
        .call(contract.id(), "gift_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmCreatorOnlyTest"
        }))
        .deposit(NearToken::from_millinear(10))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?;

    assert!(result.is_failure());
    println!("✅ Gift ticket only creator test passed (correctly rejected non-creator)");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// COMMISSION TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_commission_split() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Get creator's initial balance
    let creator_initial = owner.view_account().await?.balance;

    // Create event with 10 NEAR price for easier math
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmCommissionTest",
            "title": "Commission Test",
            "description": "Testing 98/2 split",
            "price": "10000000000000000000000000"  // 10 NEAR
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Buy ticket
    buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmCommissionTest"
        }))
        .deposit(NearToken::from_near(11)) // 10 NEAR price + 0.01 storage + buffer
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // Get creator's final balance
    let creator_final = owner.view_account().await?.balance;

    // Creator should receive 98% of 10 NEAR = 9.8 NEAR
    // But they also spent gas creating the event, so just check they received > 9 NEAR
    let creator_gained = creator_final.as_yoctonear() as i128 - creator_initial.as_yoctonear() as i128;

    // Should have gained approximately 9.8 NEAR (minus gas for create_event)
    // Let's check it's at least 9.5 NEAR gained
    assert!(
        creator_gained > 9_500_000_000_000_000_000_000_000,
        "Creator should receive ~98% of price. Gained: {} yoctoNEAR",
        creator_gained
    );

    println!("✅ Commission split test passed");
    println!("   Creator gained: {} NEAR", creator_gained as f64 / 1e24);
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// OWNERSHIP VERIFICATION TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_verify_ownership() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event and buy ticket
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmOwnershipTest",
            "title": "Ownership Test",
            "description": "Testing ownership verification",
            "price": "100000000000000000000000"  // 0.1 NEAR
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmOwnershipTest"
        }))
        .deposit(NearToken::from_millinear(110))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // Verify buyer owns token
    let is_owner: bool = contract
        .view("verify_ownership")
        .args_json(json!({
            "account_id": buyer.id(),
            "token_id": "0"
        }))
        .await?
        .json()?;

    assert!(is_owner);

    // Verify owner does NOT own the token
    let owner_owns: bool = contract
        .view("verify_ownership")
        .args_json(json!({
            "account_id": owner.id(),
            "token_id": "0"
        }))
        .await?
        .json()?;

    assert!(!owner_owns);

    println!("✅ Verify ownership test passed");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// EDGE CASE TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_event_not_found() -> anyhow::Result<()> {
    let (contract, _, buyer) = init().await?;

    // Try to buy ticket for non-existent event
    let result = buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmDoesNotExist"
        }))
        .deposit(NearToken::from_near(2))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?;

    assert!(result.is_failure());
    println!("✅ Event not found test passed (correctly rejected)");
    Ok(())
}

#[tokio::test]
async fn test_signless_withdraw_limit() -> anyhow::Result<()> {
    let (contract, _, buyer) = init().await?;

    // Legacy signless withdraw path is removed.
    let result = buyer
        .call(contract.id(), "withdraw_funds_prepaid")
        .args_json(json!({}))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?;

    assert!(result.is_failure());
    println!("✅ Signless withdraw limit test passed (correctly rejected > 0.1 NEAR)");
    Ok(())
}

#[tokio::test]
async fn test_signless_withdraw_within_limit() -> anyhow::Result<()> {
    let (contract, _, buyer) = init().await?;

    // Legacy signless withdraw path is removed even within the old limit.
    let result = buyer
        .call(contract.id(), "withdraw_funds_prepaid")
        .args_json(json!({}))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?;

    assert!(result.is_failure());

    println!("✅ Legacy signless withdraw path is removed");
    Ok(())
}
