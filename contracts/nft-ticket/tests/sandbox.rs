use near_workspaces::{types::NearToken, Account, Contract};
use serde_json::json;
use tokio::sync::OnceCell;

static CONTRACT_WASM: OnceCell<Vec<u8>> = OnceCell::const_new();

async fn load_contract_wasm() -> anyhow::Result<&'static Vec<u8>> {
    CONTRACT_WASM
        .get_or_try_init(|| async {
            near_workspaces::compile_project(".")
                .await
                .map_err(anyhow::Error::from)
        })
        .await
}

async fn init() -> anyhow::Result<(Contract, Account, Account)> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = load_contract_wasm().await?;
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
    assert_eq!(event["access_mode"], "paid");

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
    let balance_diff = initial_balance
        .as_yoctonear()
        .saturating_sub(final_balance.as_yoctonear());

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
async fn test_legacy_prepaid_balance_methods_removed() -> anyhow::Result<()> {
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
    Ok(())
}

#[tokio::test]
async fn test_buy_ticket_prepaid_removed() -> anyhow::Result<()> {
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
    let creator_gained =
        creator_final.as_yoctonear() as i128 - creator_initial.as_yoctonear() as i128;

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

#[tokio::test]
async fn test_has_ticket_with_access_pass() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Mint an ACCESS_PASS-style ticket by creating an ACCESS_PASS event
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "ACCESS_PASS",
            "title": "Global Access Pass",
            "description": "Grants global access",
            "price": "100000000000000000000000" // 0.1 NEAR
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "ACCESS_PASS"
        }))
        .deposit(NearToken::from_millinear(110))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // ACCESS_PASS should authorize access to any encrypted_cid
    let has_global_access: bool = contract
        .view("has_ticket")
        .args_json(json!({
            "account_id": buyer.id(),
            "encrypted_cid": "QmSomeOtherVideo"
        }))
        .await?
        .json()?;
    let has_access_pass_cid: bool = contract
        .view("has_ticket")
        .args_json(json!({
            "account_id": buyer.id(),
            "encrypted_cid": "ACCESS_PASS"
        }))
        .await?
        .json()?;
    assert!(has_global_access);
    assert!(has_access_pass_cid);

    let owner_has_global_access: bool = contract
        .view("has_ticket")
        .args_json(json!({
            "account_id": owner.id(),
            "encrypted_cid": "QmSomeOtherVideo"
        }))
        .await?
        .json()?;
    assert!(!owner_has_global_access);

    println!("✅ ACCESS_PASS has_ticket test passed");
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
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// COMMISSION POOL TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_commission_pool_tracking() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Verify commission pool starts at 0
    let pool: String = contract
        .view("get_commission_pool")
        .args_json(json!({}))
        .await?
        .json()?;
    assert_eq!(pool, "0");

    // Check initial trial pool
    let trial_pool_before: String = contract
        .view("get_trial_pool_balance")
        .args_json(json!({}))
        .await?
        .json()?;
    let trial_pool_before_val: u128 = trial_pool_before.parse()?;

    // Create event with 10 NEAR price
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmCommPoolTest",
            "title": "Commission Pool Test",
            "description": "Testing commission pool tracking",
            "price": "10000000000000000000000000"  // 10 NEAR
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Buy ticket (2% commission = 0.2 NEAR, split 50/50)
    buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmCommPoolTest"
        }))
        .deposit(NearToken::from_near(11))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // Commission pool should have 0.1 NEAR (50% of 0.2 NEAR commission)
    let commission_pool: String = contract
        .view("get_commission_pool")
        .args_json(json!({}))
        .await?
        .json()?;
    let commission_val: u128 = commission_pool.parse()?;
    assert_eq!(commission_val, 100_000_000_000_000_000_000_000); // 0.1 NEAR

    // Trial pool should have gained 0.1 NEAR
    let trial_pool_after: String = contract
        .view("get_trial_pool_balance")
        .args_json(json!({}))
        .await?
        .json()?;
    let trial_pool_after_val: u128 = trial_pool_after.parse()?;
    let trial_pool_gained = trial_pool_after_val - trial_pool_before_val;
    assert_eq!(trial_pool_gained, 100_000_000_000_000_000_000_000); // 0.1 NEAR

    println!("✅ Commission pool tracking test passed");
    println!("   Commission pool: {} yocto", commission_val);
    println!("   Trial pool gained: {} yocto", trial_pool_gained);
    Ok(())
}

#[tokio::test]
async fn test_commission_pool_prepaid_removed() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event with 10 NEAR price
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmCommPrepaidTest",
            "title": "Prepaid Commission Test",
            "description": "Testing commission pool with prepaid",
            "price": "10000000000000000000000000"  // 10 NEAR
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
            "encrypted_cid": "QmCommPrepaidTest"
        }))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?;

    assert!(result.is_failure());

    // Commission pool should remain unchanged.
    let commission_pool: String = contract
        .view("get_commission_pool")
        .args_json(json!({}))
        .await?
        .json()?;
    let commission_val: u128 = commission_pool.parse()?;
    assert_eq!(commission_val, 0);
    Ok(())
}

#[tokio::test]
async fn test_withdraw_commission() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event and buy to generate commission
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmWithdrawCommTest",
            "title": "Withdraw Commission Test",
            "description": "Testing commission withdrawal",
            "price": "10000000000000000000000000"
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmWithdrawCommTest"
        }))
        .deposit(NearToken::from_near(11))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // V1 public alpha keeps owner-only direct admin actions.
    let direct_withdraw = owner
        .call(contract.id(), "withdraw_commission")
        .args_json(json!({
            "amount": "100000000000000000000000"  // 0.1 NEAR
        }))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        direct_withdraw.is_success(),
        "Owner withdrawal should be direct in V1 public alpha"
    );

    // Verify commission pool was debited.
    let pool: String = contract
        .view("get_commission_pool")
        .args_json(json!({}))
        .await?
        .json()?;
    assert_eq!(pool, "0");

    println!("✅ Direct owner withdraw commission test passed");
    Ok(())
}

#[tokio::test]
async fn test_withdraw_commission_not_owner() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event and buy to generate commission
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmNotOwnerTest",
            "title": "Not Owner Test",
            "description": "Testing unauthorized withdrawal",
            "price": "10000000000000000000000000"
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmNotOwnerTest"
        }))
        .deposit(NearToken::from_near(11))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // Non-owner tries to withdraw - should fail
    let result = buyer
        .call(contract.id(), "withdraw_commission")
        .args_json(json!({
            "amount": "100000000000000000000000"
        }))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?;

    assert!(result.is_failure());
    println!("✅ Withdraw commission not owner test passed (correctly rejected)");
    Ok(())
}

#[tokio::test]
async fn test_signless_withdraw_removed() -> anyhow::Result<()> {
    let (contract, _, buyer) = init().await?;

    // Legacy signless withdraw path is disabled.
    let result = buyer
        .call(contract.id(), "withdraw_funds_prepaid")
        .args_json(json!({}))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// PURCHASE LOG TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_purchase_log_on_buy_ticket() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event with 1 NEAR price
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmLogTest",
            "title": "Log Test",
            "description": "Testing purchase log",
            "price": "1000000000000000000000000"
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
            "encrypted_cid": "QmLogTest"
        }))
        .deposit(NearToken::from_millinear(1010))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // Verify purchase log was created
    let log: Option<serde_json::Value> = contract
        .view("get_purchase_log")
        .args_json(json!({"purchase_id": 0}))
        .await?
        .json()?;

    assert!(log.is_some(), "Purchase log should exist");
    let log = log.unwrap();
    assert_eq!(log["buyer_id"], buyer.id().to_string());
    assert_eq!(log["creator_id"], owner.id().to_string());
    assert_eq!(log["event_cid"], "QmLogTest");
    assert_eq!(log["token_id"], "0");
    assert_eq!(log["price"], "1000000000000000000000000");
    assert_eq!(log["purchase_type"], "Direct");

    // Verify creator_amount is 98% and commission is 2%
    let creator_amount: u128 = log["creator_amount"].as_str().unwrap().parse()?;
    let commission: u128 = log["commission_amount"].as_str().unwrap().parse()?;
    assert_eq!(creator_amount, 980_000_000_000_000_000_000_000); // 0.98 NEAR
    assert_eq!(commission, 20_000_000_000_000_000_000_000); // 0.02 NEAR

    println!("✅ Purchase log on buy_ticket test passed");
    Ok(())
}

#[tokio::test]
async fn test_purchase_log_on_removed_prepaid_path() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmPrepaidLogTest",
            "title": "Prepaid Log Test",
            "description": "Testing prepaid purchase log",
            "price": "500000000000000000000000"
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
            "encrypted_cid": "QmPrepaidLogTest"
        }))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?;

    assert!(result.is_failure());

    // Rejected deprecated calls should not create a purchase log.
    let log: Option<serde_json::Value> = contract
        .view("get_purchase_log")
        .args_json(json!({"purchase_id": 0}))
        .await?
        .json()?;

    assert!(log.is_none());
    Ok(())
}

#[tokio::test]
async fn test_purchase_log_free_ticket() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create free event
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmFreeLogTest",
            "title": "Free Log Test",
            "description": "Testing free ticket log",
            "price": "0"
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Buy free ticket
    buyer
        .call(contract.id(), "buy_ticket")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "encrypted_cid": "QmFreeLogTest"
        }))
        .deposit(NearToken::from_millinear(10))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    // Verify purchase log with zeroed amounts
    let log: Option<serde_json::Value> = contract
        .view("get_purchase_log")
        .args_json(json!({"purchase_id": 0}))
        .await?
        .json()?;

    assert!(log.is_some());
    let log = log.unwrap();
    assert_eq!(log["purchase_type"], "Free");
    assert_eq!(log["price"], "0");
    assert_eq!(log["creator_amount"], "0");
    assert_eq!(log["commission_amount"], "0");

    println!("✅ Purchase log free ticket test passed");
    Ok(())
}

#[tokio::test]
async fn test_purchase_log_pagination() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Create event
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmPaginationTest",
            "title": "Pagination Test",
            "description": "Testing log pagination",
            "price": "100000000000000000000000"
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Buy 3 tickets
    for _ in 0..3 {
        buyer
            .call(contract.id(), "buy_ticket")
            .args_json(json!({
                "receiver_id": buyer.id(),
                "encrypted_cid": "QmPaginationTest"
            }))
            .deposit(NearToken::from_millinear(110))
            .gas(near_workspaces::types::Gas::from_tgas(300))
            .transact()
            .await?
            .into_result()?;
    }

    // Get all logs
    let all_logs: Vec<serde_json::Value> = contract
        .view("get_purchase_logs")
        .args_json(json!({}))
        .await?
        .json()?;

    assert_eq!(all_logs.len(), 3, "Should have 3 purchase logs");

    // Get with limit=2
    let limited_logs: Vec<serde_json::Value> = contract
        .view("get_purchase_logs")
        .args_json(json!({"limit": 2}))
        .await?
        .json()?;

    assert_eq!(
        limited_logs.len(),
        2,
        "Should return only 2 logs with limit"
    );

    // Get with from_index=2
    let offset_logs: Vec<serde_json::Value> = contract
        .view("get_purchase_logs")
        .args_json(json!({"from_index": 2}))
        .await?
        .json()?;

    assert_eq!(offset_logs.len(), 1, "Should return 1 log from index 2");

    println!("✅ Purchase log pagination test passed");
    Ok(())
}

#[tokio::test]
async fn test_purchase_count() -> anyhow::Result<()> {
    let (contract, owner, buyer) = init().await?;

    // Verify starts at 0
    let count: u64 = contract
        .view("get_purchase_count")
        .args_json(json!({}))
        .await?
        .json()?;

    assert_eq!(count, 0);

    // Create event
    owner
        .call(contract.id(), "create_event")
        .args_json(json!({
            "encrypted_cid": "QmCountTest",
            "title": "Count Test",
            "description": "Testing purchase count",
            "price": "100000000000000000000000"
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Buy 4 tickets
    for _ in 0..4 {
        buyer
            .call(contract.id(), "buy_ticket")
            .args_json(json!({
                "receiver_id": buyer.id(),
                "encrypted_cid": "QmCountTest"
            }))
            .deposit(NearToken::from_millinear(110))
            .gas(near_workspaces::types::Gas::from_tgas(300))
            .transact()
            .await?
            .into_result()?;
    }

    // Verify count is 4
    let count: u64 = contract
        .view("get_purchase_count")
        .args_json(json!({}))
        .await?
        .json()?;

    assert_eq!(count, 4);

    println!("✅ Purchase count test passed");
    Ok(())
}

#[tokio::test]
async fn test_fund_nova_platform_disabled() -> anyhow::Result<()> {
    let (contract, _, buyer) = init().await?;

    let result = buyer
        .call(contract.id(), "fund_nova_platform")
        .args_json(json!({ "amount": "100000000000000000000000" }))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

#[tokio::test]
async fn test_upload_session_flow() -> anyhow::Result<()> {
    let (contract, _, creator) = init().await?;
    let public_key = creator.secret_key().public_key().to_string();

    creator
        .call(contract.id(), "create_upload_session")
        .args_json(json!({
            "public_key": public_key,
            "budget_yocto": "200000000000000000000000",
            "ttl_ms": 300000u64
        }))
        .deposit(NearToken::from_millinear(200))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    let session: Option<serde_json::Value> = contract
        .view("get_upload_session")
        .args_json(json!({ "public_key": public_key }))
        .await?
        .json()?;

    assert!(
        session.is_some(),
        "Upload session should exist after creation"
    );
    assert_eq!(session.unwrap()["status"], "AwaitingMint");

    creator
        .call(contract.id(), "nft_mint_prepaid")
        .args_json(json!({
            "receiver_id": creator.id(),
            "token_metadata": {
                "title": "Upload Session Video",
                "description": "Scoped upload test",
                "media": null,
                "media_hash": null,
                "copies": 1,
                "issued_at": null,
                "expires_at": null,
                "starts_at": null,
                "updated_at": null,
                "extra": null,
                "reference": null,
                "reference_hash": null
            },
            "video_metadata": {
                "encrypted_cid": "upload-session-cid",
                "duration_seconds": 0,
                "event_date": null,
                "content_type": "Exclusive",
                "nova_group_id": null,
                "storage_type": "Kms"
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    let session_after_mint: Option<serde_json::Value> = contract
        .view("get_upload_session")
        .args_json(json!({ "public_key": public_key }))
        .await?
        .json()?;

    assert!(
        session_after_mint.is_some(),
        "Upload session should survive first upload step"
    );
    assert_eq!(session_after_mint.unwrap()["status"], "AwaitingEvent");

    creator
        .call(contract.id(), "create_event_prepaid")
        .args_json(json!({
            "encrypted_cid": "upload-session-cid",
            "title": "Scoped Upload Event",
            "description": "Upload session event",
            "price": "0",
            "price_usd": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    let closed_session: Option<serde_json::Value> = contract
        .view("get_upload_session")
        .args_json(json!({ "public_key": public_key }))
        .await?
        .json()?;

    assert!(
        closed_session.is_none(),
        "Upload session should auto-close after event creation"
    );

    let event: Option<serde_json::Value> = contract
        .view("get_event")
        .args_json(json!({ "encrypted_cid": "upload-session-cid" }))
        .await?
        .json()?;

    assert!(event.is_some(), "Event should be created by upload session");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// IMPLICIT GUEST DIRECT TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_sponsor_implicit_guest_direct_rejects_unauthorized() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = load_contract_wasm().await?;
    let contract = worker.dev_deploy(wasm).await?;

    let owner = worker.dev_create_account().await?;
    contract
        .call("new")
        .args_json(json!({"owner_id": owner.id()}))
        .transact()
        .await?
        .into_result()?;

    let caller = worker.dev_create_account().await?;
    let caller_public_key = caller.secret_key().public_key().to_string();

    // Fund trial pool so the only failure reason is unauthorized access
    owner
        .call(contract.id(), "fund_trial_pool")
        .args_json(json!({}))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?
        .into_result()?;

    // An account without an onboarding key should be rejected
    let result = caller
        .call(contract.id(), "sponsor_implicit_guest_direct")
        .args_json(json!({ "new_public_key": caller_public_key }))
        .gas(near_workspaces::types::Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(result.is_failure(), "Should reject unauthorized caller");
    println!("✅ sponsor_implicit_guest_direct unauthorized rejection test passed");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// RESET V11 TESTS
// ═══════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_reset_v11_not_available_in_default_build() -> anyhow::Result<()> {
    let (contract, owner, _) = init().await?;

    let result = owner
        .call(contract.id(), "reset_v11")
        .args_json(json!({ "owner_id": owner.id() }))
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "reset_v11 should not be callable in the default production build"
    );
    println!("✅ reset_v11 default-build rejection test passed");
    Ok(())
}
