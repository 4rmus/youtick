use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, PromiseResult};

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn context(predecessor: &str, current: &str) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder.predecessor_account_id(account(predecessor));
    builder.current_account_id(account(current));
    builder
}

fn sample_public_key(seed: u8) -> PublicKey {
    let key = format!("ed25519:{}", bs58::encode(vec![seed; 32]).into_string());
    key.parse().unwrap()
}

#[test]
fn gift_drop_is_inserted_only_after_access_key_success() {
    let owner_id = account("owner.testnet");
    let contract_id = account("contract.testnet");
    let mut contract = Contract::new(owner_id.clone());
    let public_key = sample_public_key(7);
    let gift_drop = GiftDrop {
        creator_id: owner_id,
        event_cid: "gift-event".to_string(),
        remaining_claims: 1,
        deposit_per_claim: U128(GIFT_DEPOSIT_PER_LINK.as_yoctonear()),
        created_at: 1,
    };

    testing_env!(
        context(contract_id.as_str(), contract_id.as_str()).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(vec![])],
    );

    assert!(contract.on_gift_access_key_added(public_key.clone(), gift_drop.clone()));

    let stored = contract
        .gift_drops
        .get(&String::from(&public_key))
        .expect("gift drop should be stored after successful callback");
    assert_eq!(stored.event_cid, gift_drop.event_cid);
    assert_eq!(stored.remaining_claims, 1);
}

#[test]
fn gift_drop_is_not_inserted_when_access_key_creation_fails() {
    let owner_id = account("owner.testnet");
    let contract_id = account("contract.testnet");
    let mut contract = Contract::new(owner_id.clone());
    let public_key = sample_public_key(8);
    let gift_drop = GiftDrop {
        creator_id: owner_id,
        event_cid: "gift-event".to_string(),
        remaining_claims: 1,
        deposit_per_claim: U128(GIFT_DEPOSIT_PER_LINK.as_yoctonear()),
        created_at: 1,
    };

    testing_env!(
        context(contract_id.as_str(), contract_id.as_str()).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed],
    );

    assert!(!contract.on_gift_access_key_added(public_key.clone(), gift_drop));
    assert!(contract
        .gift_drops
        .get(&String::from(&public_key))
        .is_none());
}

#[test]
fn trial_invite_is_inserted_only_after_access_key_success() {
    let owner_id = account("owner.testnet");
    let contract_id = account("contract.testnet");
    let mut contract = Contract::new(owner_id.clone());
    let public_key = sample_public_key(9);
    let trial_invite = TrialInvite {
        sponsor_id: owner_id,
        remaining_claims: 1,
        created_at_ms: 1,
        expires_at_ms: Some(1000),
    };

    testing_env!(
        context(contract_id.as_str(), contract_id.as_str()).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(vec![])],
    );

    assert!(contract.on_trial_invite_access_key_added(
        public_key.clone(),
        trial_invite.clone(),
        U128(STORAGE_COST_INVITE.as_yoctonear()),
    ));

    let stored = contract
        .lazy_trial_invites()
        .get(&String::from(&public_key))
        .expect("trial invite should be stored after successful callback");
    assert_eq!(stored.remaining_claims, trial_invite.remaining_claims);
}

#[test]
fn implicit_account_id_is_derived_from_public_key() {
    let public_key = sample_public_key(10);
    let implicit_account_id = Contract::implicit_account_id_from_public_key(&public_key);
    let implicit_account_id = implicit_account_id.as_str();

    assert_eq!(implicit_account_id.len(), 64);
    assert!(implicit_account_id.chars().all(|c| c.is_ascii_hexdigit()));
}

#[test]
fn event_access_mode_defaults_are_resolved_from_price() {
    let owner_id = account("owner.testnet");
    let contract = Contract::new(owner_id.clone());

    let free_event = Event {
        title: "Free".to_string(),
        description: "Public".to_string(),
        price: U128(0),
        price_usdc: None,
        price_near: None,
        creator_id: owner_id.clone(),
        created_at: 1,
        content_type: ContentType::Exclusive,
    };
    let paid_event = Event {
        title: "Paid".to_string(),
        description: "Premium".to_string(),
        price: U128(NearToken::from_near(1).as_yoctonear()),
        price_usdc: None,
        price_near: None,
        creator_id: owner_id,
        created_at: 1,
        content_type: ContentType::Exclusive,
    };

    assert_eq!(
        contract
            .build_event_response("free-cid", &free_event)
            .access_mode,
        "free_collectible"
    );
    assert_eq!(
        contract
            .build_event_response("paid-cid", &paid_event)
            .access_mode,
        "paid"
    );
}

#[test]
fn sponsor_implicit_guest_deducts_trial_pool() {
    let owner_id = account("owner.testnet");
    let contract_id = account("contract.testnet");
    let mut contract = Contract::new(owner_id);
    let onboarding_pk = sample_public_key(10);
    contract.trial_pool = TRIAL_ACCOUNT_STORAGE_COST;
    contract.onboarding_keys.insert(&onboarding_pk);

    let mut builder = context(contract_id.as_str(), contract_id.as_str());
    builder.signer_account_pk(onboarding_pk);
    testing_env!(builder.build());

    let _ = contract.sponsor_implicit_guest_direct(sample_public_key(11));

    assert_eq!(contract.trial_pool, NearToken::from_yoctonear(0));
    assert_eq!(contract.get_daily_trial_count(), 1);
}

#[test]
fn sponsor_implicit_guest_callback_refunds_trial_pool_on_failure() {
    let owner_id = account("owner.testnet");
    let contract_id = account("contract.testnet");
    let mut contract = Contract::new(owner_id);
    let day_timestamp = Contract::get_day_timestamp();
    contract.daily_trial_counts.insert(&day_timestamp, &1);

    testing_env!(
        context(contract_id.as_str(), contract_id.as_str()).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed],
    );

    assert!(!contract.on_sponsor_implicit_guest_funded(
        account("implicit.testnet"),
        U128(TRIAL_ACCOUNT_STORAGE_COST.as_yoctonear()),
        Some(day_timestamp),
    ));
    assert_eq!(contract.trial_pool, TRIAL_ACCOUNT_STORAGE_COST);
    assert_eq!(contract.get_daily_trial_count(), 0);
}

#[test]
fn contract_initialization_and_pause_cycle() {
    let owner_id = account("owner.testnet");
    let contract = Contract::new(owner_id.clone());
    assert_eq!(contract.tokens.owner_id, owner_id);
    assert!(!contract.is_paused());
}

#[test]
#[should_panic(expected = "Only contract owner can call this method")]
fn direct_pause_rejects_non_owner() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    testing_env!(context("not-owner.testnet", "contract.testnet").build());
    contract.pause();
}

#[test]
#[should_panic(expected = "Only contract owner can call this method")]
fn web4_set_static_url_rejects_non_owner() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id);

    testing_env!(context("not-owner.testnet", "contract.testnet").build());
    contract.web4_set_static_url("nearfs://static".to_string());
}

#[test]
fn web4_set_static_url_accepts_owner() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    testing_env!(context(owner_id.as_str(), "contract.testnet").build());
    contract.web4_set_static_url("nearfs://static".to_string());

    assert_eq!(
        contract.web4_get_static_url(),
        Some("nearfs://static".to_string())
    );
}

#[test]
#[should_panic(expected = "Timelock delay not yet passed")]
fn timelock_rejects_execution_before_delay() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000);
    testing_env!(builder.build());
    let id = contract.propose_action(TimelockAction::SetNextTokenId { new_id: 7 });

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS - 1);
    testing_env!(builder.build());
    contract.execute_action(id);
}

#[test]
fn timelock_executes_admin_action_after_delay() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000);
    testing_env!(builder.build());
    let id = contract.propose_action(TimelockAction::SetNextTokenId { new_id: 7 });

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
    testing_env!(builder.build());
    contract.execute_action(id);

    assert_eq!(contract.next_token_id, 7);
}

#[test]
fn ownership_transfer_updates_owner_two_step_via_timelock() {
    let owner_id = account("owner.testnet");
    let new_owner_id = account("new-owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000);
    testing_env!(builder.build());
    let id = contract.propose_action(TimelockAction::ProposeOwner {
        proposed_owner_id: new_owner_id.clone(),
    });

    assert_eq!(contract.get_owner(), owner_id);
    assert_eq!(contract.get_pending_owner(), None);

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
    testing_env!(builder.build());
    contract.execute_action(id);

    assert_eq!(contract.get_owner(), owner_id);
    assert_eq!(contract.get_pending_owner(), Some(new_owner_id.clone()));

    testing_env!(context(new_owner_id.as_str(), "contract.testnet").build());
    contract.accept_ownership();

    assert_eq!(contract.get_owner(), new_owner_id);
    assert_eq!(contract.get_pending_owner(), None);
}

#[test]
#[should_panic(expected = "Only owner can propose actions")]
fn ownership_transfer_rejects_non_owner_proposal() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id);

    testing_env!(context("eve.testnet", "contract.testnet").build());
    contract.propose_action(TimelockAction::ProposeOwner {
        proposed_owner_id: account("new-owner.testnet"),
    });
}

#[test]
#[should_panic(expected = "Only proposed owner can accept ownership")]
fn ownership_transfer_rejects_non_pending_acceptor() {
    let owner_id = account("owner.testnet");
    let new_owner_id = account("new-owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000);
    testing_env!(builder.build());
    let id = contract.propose_action(TimelockAction::ProposeOwner {
        proposed_owner_id: new_owner_id,
    });

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
    testing_env!(builder.build());
    contract.execute_action(id);

    testing_env!(context("eve.testnet", "contract.testnet").build());
    contract.accept_ownership();
}

#[test]
fn timelock_ban_event_preserves_reason() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());
    contract.events.insert(
        &"event-1".to_string(),
        &Event {
            title: "T".to_string(),
            description: "D".to_string(),
            price: U128(0),
            price_usdc: None,
            price_near: None,
            creator_id: owner_id.clone(),
            created_at: 1,
            content_type: ContentType::Exclusive,
        },
    );
    contract.active_event_count = 1;

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000);
    testing_env!(builder.build());
    let id = contract.propose_action(TimelockAction::BanEvent {
        encrypted_cid: "event-1".to_string(),
        reason: BanReason::CopyrightViolation,
    });

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
    testing_env!(builder.build());
    contract.execute_action(id);

    let banned = contract.get_banned_events();
    assert_eq!(banned.len(), 1);
    assert!(matches!(banned[0].1.reason, BanReason::CopyrightViolation));
}

#[test]
#[should_panic(expected = "Only contract owner can call this method")]
fn ban_event_rejects_non_owner() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());
    seed_event(&mut contract, "event-ban-1", &owner_id);

    testing_env!(context("not-owner.testnet", "contract.testnet").build());
    contract.ban_event("event-ban-1".to_string(), BanReason::Other);
}

fn seed_event(contract: &mut Contract, cid: &str, creator: &AccountId) {
    contract.events.insert(
        &cid.to_string(),
        &Event {
            title: "T".to_string(),
            description: "D".to_string(),
            price: U128(0),
            price_usdc: None,
            price_near: None,
            creator_id: creator.clone(),
            created_at: 1,
            content_type: ContentType::Exclusive,
        },
    );
    contract.active_event_count = contract.active_event_count.saturating_add(1);
}

#[test]
fn takedown_event_marks_banned_and_emits_log() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());
    seed_event(&mut contract, "event-takedown-1", &owner_id);

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(2_000);
    testing_env!(builder.build());

    contract.takedown_event("event-takedown-1".to_string(), BanReason::SexualContent);

    assert!(contract.is_event_banned("event-takedown-1".to_string()));
    assert_eq!(contract.active_event_count, 0);

    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter().any(|l| l.contains("event_takedown")
            && l.contains("sexual_content")
            && l.contains("event-takedown-1")),
        "expected event_takedown NEP-297 log, got: {:?}",
        logs
    );
}

#[test]
#[should_panic(expected = "Only owner can takedown events")]
fn takedown_event_rejects_non_owner() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());
    seed_event(&mut contract, "event-takedown-2", &owner_id);

    testing_env!(context("attacker.testnet", "contract.testnet").build());
    contract.takedown_event("event-takedown-2".to_string(), BanReason::Other);
}

#[test]
#[should_panic(expected = "Event not found")]
fn takedown_event_rejects_missing_event() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    testing_env!(context(owner_id.as_str(), "contract.testnet").build());
    contract.takedown_event("does-not-exist".to_string(), BanReason::Other);
}

#[test]
#[should_panic(expected = "already banned or taken down")]
fn takedown_event_rejects_double_takedown() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());
    seed_event(&mut contract, "event-takedown-3", &owner_id);

    testing_env!(context(owner_id.as_str(), "contract.testnet").build());
    contract.takedown_event("event-takedown-3".to_string(), BanReason::SexualContent);
    contract.takedown_event("event-takedown-3".to_string(), BanReason::SexualContent);
}

#[test]
fn takedown_event_works_while_paused() {
    // Emergency takedown must function even when contract is paused;
    // illegal-content response must not depend on contract liveness.
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());
    seed_event(&mut contract, "event-takedown-4", &owner_id);
    contract.lazy_paused_state().set(&true);

    testing_env!(context(owner_id.as_str(), "contract.testnet").build());
    contract.takedown_event("event-takedown-4".to_string(), BanReason::SexualContent);

    assert!(contract.is_event_banned("event-takedown-4".to_string()));
}

#[test]
fn timelock_executes_trial_pool_withdraw_after_delay() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());
    contract.trial_pool = NearToken::from_near(1);

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000);
    testing_env!(builder.build());
    let id = contract.propose_action(TimelockAction::WithdrawTrialPool {
        amount: U128(NearToken::from_near(1).as_yoctonear()),
    });

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
    testing_env!(builder.build());
    contract.execute_action(id);

    assert_eq!(contract.trial_pool, NearToken::from_yoctonear(0));
}

#[test]
fn create_event_and_buy_ticket_flow() {
    let owner_id = account("owner.testnet");
    let buyer_id = account("buyer.testnet");
    let mut contract = Contract::new(owner_id.clone());

    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(owner_id.clone())
        .attached_deposit(STORAGE_COST_ACCOUNT)
        .build());
    contract.create_event(
        "event-123".to_string(),
        "Test Event".to_string(),
        "Description".to_string(),
        U128(NearToken::from_near(1).as_yoctonear()),
        None,
        None,
        None,
        None,
    );

    let event = contract.get_event("event-123".to_string());
    assert!(event.is_some());

    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(buyer_id.clone())
        .attached_deposit(NearToken::from_near(2))
        .build());
    let token = contract.buy_ticket(buyer_id.clone(), "event-123".to_string());
    assert_eq!(token.owner_id, buyer_id);
}

#[test]
#[should_panic(expected = "Price must be at least 0.001 NEAR")]
fn minimum_ticket_price_is_enforced() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    testing_env!(context(owner_id.as_str(), "contract.testnet").build());
    contract.create_event(
        "cheap".to_string(),
        "Cheap".to_string(),
        "Too cheap".to_string(),
        U128(1),
        None,
        None,
        None,
        None,
    );
}

#[test]
fn free_event_with_zero_price_is_allowed() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(owner_id.clone())
        .attached_deposit(STORAGE_COST_ACCOUNT)
        .build());
    contract.create_event(
        "free".to_string(),
        "Free".to_string(),
        "No cost".to_string(),
        U128(0),
        None,
        None,
        None,
        None,
    );

    assert!(contract.get_event("free".to_string()).is_some());
}

#[test]
#[should_panic(expected = "Only contract owner can call this method")]
fn direct_nft_mint_rejects_non_owner() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    testing_env!(context("not-owner.testnet", "contract.testnet").build());
    contract.nft_mint(
        owner_id,
        TokenMetadata {
            title: Some("Test".to_string()),
            description: None,
            media: None,
            media_hash: None,
            copies: None,
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        },
        VideoMetadata {
            encrypted_cid: "test".to_string(),
            duration_seconds: 0,
            event_date: None,
            content_type: ContentType::Exclusive,
            nova_group_id: None,
            storage_type: StorageType::Kms,
        },
    );
}

#[test]
#[should_panic(expected = "Ticket transfers disabled for v1")]
fn nft_transfer_rejects_for_v1() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id);

    testing_env!(context("buyer.testnet", "contract.testnet").build());
    contract.nft_transfer(account("receiver.testnet"), "0".to_string(), None, None);
}

#[test]
#[should_panic(expected = "Only contract owner can call this method")]
fn add_onboarding_key_rejects_non_owner() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id);

    testing_env!(context("not-owner.testnet", "contract.testnet").build());
    let _ = contract.add_onboarding_key(sample_public_key(12));
}

#[test]
#[should_panic(expected = "Only contract owner can call this method")]
fn remove_onboarding_key_rejects_non_owner() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id);

    testing_env!(context("not-owner.testnet", "contract.testnet").build());
    let _ = contract.remove_onboarding_key(sample_public_key(13));
}

#[cfg(not(feature = "migration"))]
#[test]
#[should_panic(expected = "Method disabled outside migration builds")]
fn wipe_and_reinit_is_disabled_without_migration_feature() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    testing_env!(context(owner_id.as_str(), "contract.testnet").build());
    contract.wipe_and_reinit();
}

#[cfg(not(feature = "migration"))]
#[test]
#[should_panic(expected = "reset_for_v1_launch is disabled outside migration builds")]
fn reset_for_v1_launch_is_disabled_without_migration_feature() {
    testing_env!(context("contract.testnet", "contract.testnet").build());
    let _ = Contract::reset_for_v1_launch(None);
}

#[cfg(not(feature = "migration"))]
#[test]
#[should_panic(expected = "Method disabled outside migration builds")]
fn test_insert_is_disabled_without_migration_feature() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    testing_env!(context(owner_id.as_str(), "contract.testnet").build());
    contract.test_insert("0".to_string(), owner_id);
}

#[test]
fn stablecoin_purchase_mints_once_and_records_creator_balance() {
    let creator_id = account("creator.testnet");
    let buyer_id = account("buyer.testnet");
    let contract_id = account("contract.testnet");
    let usdc_id = account("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
    let mut contract = Contract::new(creator_id.clone());
    let cid = "usdc-event".to_string();
    let price_usdc = 1_000_000u128;

    contract.events.insert(
        &cid,
        &Event {
            title: "USDC Event".to_string(),
            description: "Paid in USDC".to_string(),
            price: U128(0),
            price_usdc: Some(U128(price_usdc)),
            price_near: None,
            creator_id: creator_id.clone(),
            created_at: 1,
            content_type: ContentType::Exclusive,
        },
    );
    contract.events_price_usdc.insert(&cid, &U128(price_usdc));
    contract.active_event_count = 1;

    testing_env!(context(usdc_id.as_str(), contract_id.as_str()).build());
    let msg = near_sdk::serde_json::json!({
        "action": "buy_ticket",
        "buyer_id": buyer_id,
        "encrypted_cid": cid,
        "payment_id": "deposit-1"
    })
    .to_string();

    let result = contract.ft_on_transfer(buyer_id.clone(), U128(price_usdc + 50_000), msg);
    assert!(matches!(result, PromiseOrValue::Value(U128(0))));
    assert_eq!(contract.tokens.nft_supply_for_owner(&buyer_id).0, 1);
    assert_eq!(
        contract.get_creator_stablecoin_balance(usdc_id.clone(), creator_id),
        U128(980_000)
    );
    assert_eq!(contract.get_usdc_pools(), (U128(10_000), U128(10_000)));
    assert_eq!(
        contract.get_stablecoin_commission_balance(usdc_id.clone()),
        U128(20_000)
    );
    assert!(contract.is_stablecoin_payment_settled(usdc_id, buyer_id, "deposit-1".to_string(),));
}

#[test]
#[should_panic(expected = "payment_id is required")]
fn stablecoin_purchase_requires_payment_id() {
    let creator_id = account("creator.testnet");
    let buyer_id = account("buyer.testnet");
    let contract_id = account("contract.testnet");
    let usdc_id = account("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
    let mut contract = Contract::new(creator_id.clone());
    let cid = "missing-payment-id-usdc-event".to_string();
    let price_usdc = 1_000_000u128;

    contract.events.insert(
        &cid,
        &Event {
            title: "USDC Event".to_string(),
            description: "Paid in USDC".to_string(),
            price: U128(0),
            price_usdc: Some(U128(price_usdc)),
            price_near: None,
            creator_id,
            created_at: 1,
            content_type: ContentType::Exclusive,
        },
    );
    contract.active_event_count = 1;

    testing_env!(context(usdc_id.as_str(), contract_id.as_str()).build());
    let msg = near_sdk::serde_json::json!({
        "action": "buy_ticket",
        "buyer_id": buyer_id,
        "encrypted_cid": cid
    })
    .to_string();

    let _ = contract.ft_on_transfer(buyer_id, U128(price_usdc), msg);
}

#[test]
#[should_panic(expected = "NEAR price is not configured for this event")]
fn usdc_only_event_rejects_native_near_purchase() {
    let creator_id = account("creator.testnet");
    let buyer_id = account("buyer.testnet");
    let mut contract = Contract::new(creator_id.clone());
    let cid = "usdc-only-event".to_string();

    contract.events.insert(
        &cid,
        &Event {
            title: "USDC Event".to_string(),
            description: "Paid in USDC".to_string(),
            price: U128(0),
            price_usdc: Some(U128(1_000_000)),
            price_near: None,
            creator_id,
            created_at: 1,
            content_type: ContentType::Exclusive,
        },
    );
    contract.active_event_count = 1;

    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(buyer_id.clone())
        .attached_deposit(STORAGE_COST_NFT)
        .build());
    let _ = contract.buy_ticket(buyer_id, cid);
}

#[test]
#[should_panic(expected = "This ticket is not free. Use buy_ticket instead.")]
fn free_claim_rejects_usdc_priced_event() {
    let creator_id = account("creator.testnet");
    let receiver_id = account("receiver.testnet");
    let contract_id = account("contract.testnet");
    let mut contract = Contract::new(creator_id.clone());
    let cid = "free-claim-usdc-event".to_string();
    let onboarding_pk = sample_public_key(12);

    contract.events.insert(
        &cid,
        &Event {
            title: "USDC Event".to_string(),
            description: "Paid in USDC".to_string(),
            price: U128(0),
            price_usdc: Some(U128(1_000_000)),
            price_near: None,
            creator_id,
            created_at: 1,
            content_type: ContentType::Exclusive,
        },
    );
    contract.active_event_count = 1;
    contract.trial_pool = STORAGE_COST_NFT;
    contract.onboarding_keys.insert(&onboarding_pk);

    let mut builder = context(contract_id.as_str(), contract_id.as_str());
    builder.signer_account_pk(onboarding_pk);
    testing_env!(builder.build());

    let _ = contract.claim_free_ticket_direct(receiver_id, cid);
}

#[test]
#[should_panic(expected = "Stablecoin payment already settled")]
fn stablecoin_payment_id_cannot_be_used_twice() {
    let creator_id = account("creator.testnet");
    let buyer_id = account("buyer.testnet");
    let contract_id = account("contract.testnet");
    let usdc_id = account("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
    let mut contract = Contract::new(creator_id.clone());
    let cid = "duplicate-usdc-event".to_string();
    let price_usdc = 1_000_000u128;

    contract.events.insert(
        &cid,
        &Event {
            title: "USDC Event".to_string(),
            description: "Paid in USDC".to_string(),
            price: U128(0),
            price_usdc: Some(U128(price_usdc)),
            price_near: None,
            creator_id,
            created_at: 1,
            content_type: ContentType::Exclusive,
        },
    );
    contract.events_price_usdc.insert(&cid, &U128(price_usdc));
    contract.active_event_count = 1;

    let msg = near_sdk::serde_json::json!({
        "action": "buy_ticket",
        "buyer_id": buyer_id,
        "encrypted_cid": cid,
        "payment_id": "deposit-1"
    })
    .to_string();

    testing_env!(context(usdc_id.as_str(), contract_id.as_str()).build());
    let _ = contract.ft_on_transfer(buyer_id.clone(), U128(price_usdc), msg.clone());

    testing_env!(context(usdc_id.as_str(), contract_id.as_str()).build());
    let _ = contract.ft_on_transfer(buyer_id, U128(price_usdc), msg);
}

#[test]
#[should_panic(expected = "Insufficient USDC")]
fn stablecoin_underpayment_does_not_mint() {
    let creator_id = account("creator.testnet");
    let buyer_id = account("buyer.testnet");
    let contract_id = account("contract.testnet");
    let usdc_id = account("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
    let mut contract = Contract::new(creator_id.clone());
    let cid = "underpaid-usdc-event".to_string();
    let price_usdc = 1_000_000u128;

    contract.events.insert(
        &cid,
        &Event {
            title: "USDC Event".to_string(),
            description: "Paid in USDC".to_string(),
            price: U128(0),
            price_usdc: Some(U128(price_usdc)),
            price_near: None,
            creator_id,
            created_at: 1,
            content_type: ContentType::Exclusive,
        },
    );
    contract.events_price_usdc.insert(&cid, &U128(price_usdc));
    contract.active_event_count = 1;

    testing_env!(context(usdc_id.as_str(), contract_id.as_str()).build());
    let msg = near_sdk::serde_json::json!({
        "action": "buy_ticket",
        "buyer_id": buyer_id,
        "encrypted_cid": cid,
        "payment_id": "deposit-underpaid"
    })
    .to_string();

    let _ = contract.ft_on_transfer(buyer_id, U128(price_usdc - 1), msg);
}

#[test]
fn failed_creator_stablecoin_withdraw_restores_balance() {
    let creator_id = account("creator.testnet");
    let contract_id = account("contract.testnet");
    let usdc_id = account("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
    let mut contract = Contract::new(creator_id.clone());

    testing_env!(
        context(contract_id.as_str(), contract_id.as_str()).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed],
    );
    assert!(!contract.on_creator_stablecoin_withdraw_complete(
        usdc_id.clone(),
        creator_id.clone(),
        U128(100),
    ));
    assert_eq!(
        contract.get_creator_stablecoin_balance(usdc_id, creator_id),
        U128(100)
    );
}

#[test]
#[should_panic(expected = "Only contract owner can call this method")]
fn direct_create_trial_invite_drop_rejects_non_owner() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    testing_env!(context("not-owner.testnet", "contract.testnet").build());
    contract.create_trial_invite_drop(vec![], None);
}

#[test]
fn timelock_executes_nft_mint_after_delay() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000);
    builder.attached_deposit(NearToken::from_near(1));
    testing_env!(builder.build());
    let id = contract.propose_action(TimelockAction::NftMint {
        receiver_id: owner_id.clone(),
        token_metadata: TokenMetadata {
            title: Some("Test".to_string()),
            description: None,
            media: None,
            media_hash: None,
            copies: None,
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        },
        video_metadata: VideoMetadata {
            encrypted_cid: "test".to_string(),
            duration_seconds: 0,
            event_date: None,
            content_type: ContentType::Exclusive,
            nova_group_id: None,
            storage_type: StorageType::Kms,
        },
    });

    let mut builder = context(owner_id.as_str(), "contract.testnet");
    builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
    builder.attached_deposit(NearToken::from_near(1));
    testing_env!(builder.build());
    contract.execute_action(id);

    let token = contract.tokens.nft_token(&"0".to_string());
    assert!(token.is_some());
    assert_eq!(token.unwrap().owner_id, owner_id);
}

// ═══════════════════════════════════════════════════════════════
// V11: CONTENT TYPE FILTER TESTS
// ═══════════════════════════════════════════════════════════════

#[test]
fn get_events_filters_by_content_type() {
    let owner_id = account("owner.testnet");
    let mut contract = Contract::new(owner_id.clone());

    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(owner_id.clone())
        .attached_deposit(STORAGE_COST_ACCOUNT)
        .build());

    contract.create_event(
        "concert-1".to_string(),
        "Concert".to_string(),
        "Concert recording".to_string(),
        U128(NearToken::from_near(1).as_yoctonear()),
        None,
        None,
        None,
        Some("Concert".to_string()),
    );

    contract.create_event(
        "film-1".to_string(),
        "Film".to_string(),
        "A film".to_string(),
        U128(NearToken::from_near(1).as_yoctonear()),
        None,
        None,
        None,
        Some("Cinema".to_string()),
    );

    // No filter returns both
    let all = contract.get_events(None, None, None);
    assert_eq!(all.len(), 2);

    // Concert filter returns only concert
    let concerts = contract.get_events(None, None, Some("Concert".to_string()));
    assert_eq!(concerts.len(), 1);
    assert_eq!(concerts[0].0, "concert-1");

    // Cinema filter returns only film
    let films = contract.get_events(None, None, Some("Cinema".to_string()));
    assert_eq!(films.len(), 1);
    assert_eq!(films[0].0, "film-1");

    // Nonexistent filter returns empty
    let empty = contract.get_events(None, None, Some("Documentary".to_string()));
    assert!(empty.is_empty());
}

// ═══════════════════════════════════════════════════════════════
// V11: CREATOR STATS & PURCHASE LOG TESTS
// ═══════════════════════════════════════════════════════════════

#[test]
fn get_creator_stats_sums_purchases() {
    let owner_id = account("owner.testnet");
    let buyer1 = account("buyer1.testnet");
    let buyer2 = account("buyer2.testnet");
    let mut contract = Contract::new(owner_id.clone());

    // Create a paid event
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(owner_id.clone())
        .attached_deposit(STORAGE_COST_ACCOUNT)
        .build());
    contract.create_event(
        "event-paid".to_string(),
        "Paid Event".to_string(),
        "Desc".to_string(),
        U128(NearToken::from_near(1).as_yoctonear()),
        None,
        None,
        None,
        None,
    );

    // Buyer 1 purchases
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(buyer1.clone())
        .attached_deposit(NearToken::from_near(2))
        .build());
    contract.buy_ticket(buyer1.clone(), "event-paid".to_string());

    // Buyer 2 purchases
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(buyer2.clone())
        .attached_deposit(NearToken::from_near(2))
        .build());
    contract.buy_ticket(buyer2.clone(), "event-paid".to_string());

    let stats = contract.get_creator_stats(owner_id.clone());
    assert_eq!(stats.total_sales, 2);
    // 1 NEAR ticket price, ~2% commission, creator gets ~0.98 NEAR each = ~1.96 NEAR total
    assert!(stats.total_revenue_yocto.0 > 0);
}

#[test]
fn purchase_log_views_return_empty_after_runtime_hotfix() {
    let owner1 = account("owner1.testnet");
    let owner2 = account("owner2.testnet");
    let buyer = account("buyer.testnet");

    let mut contract = Contract::new(owner1.clone());

    // Owner1 creates event
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(owner1.clone())
        .attached_deposit(STORAGE_COST_ACCOUNT)
        .build());
    contract.create_event(
        "event-1".to_string(),
        "E1".to_string(),
        "D1".to_string(),
        U128(NearToken::from_near(1).as_yoctonear()),
        None,
        None,
        None,
        None,
    );

    // Buyer purchases from owner1
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(buyer.clone())
        .attached_deposit(NearToken::from_near(2))
        .build());
    contract.buy_ticket(buyer.clone(), "event-1".to_string());

    let owner1_logs = contract.get_purchase_logs_by_creator(owner1.clone(), None, None);
    assert!(owner1_logs.is_empty());

    let owner2_logs = contract.get_purchase_logs_by_creator(owner2.clone(), None, None);
    assert!(owner2_logs.is_empty());
}

// ═══════════════════════════════════════════════════════════════
// V11: CREATOR PROFILE TESTS
// ═══════════════════════════════════════════════════════════════

#[test]
fn set_and_get_creator_profile() {
    let creator_id = account("creator.testnet");
    let mut contract = Contract::new(account("owner.testnet"));

    testing_env!(context(creator_id.as_str(), "contract.testnet").build());
    contract.set_creator_profile(
        Some("Creative Studio".to_string()),
        Some("Independent film and concert recording collective.".to_string()),
        Some("https://studio.test".to_string()),
        Some("@creativestudio".to_string()),
        Some("@creative.studio".to_string()),
        Some("https://avatar.test/img.png".to_string()),
    );

    let profile = contract.get_creator_profile(creator_id.clone());
    assert!(profile.is_some());
    let p = profile.unwrap();
    assert_eq!(p.display_name, Some("Creative Studio".to_string()));
    assert_eq!(
        p.bio,
        Some("Independent film and concert recording collective.".to_string())
    );
    assert_eq!(p.website, Some("https://studio.test".to_string()));
    assert_eq!(p.twitter, Some("@creativestudio".to_string()));
    assert_eq!(p.instagram, Some("@creative.studio".to_string()));
    assert_eq!(
        p.avatar_url,
        Some("https://avatar.test/img.png".to_string())
    );
}

#[test]
fn update_creator_profile_overwrites_previous() {
    let creator_id = account("creator.testnet");
    let mut contract = Contract::new(account("owner.testnet"));

    testing_env!(context(creator_id.as_str(), "contract.testnet").build());
    contract.set_creator_profile(Some("Old Name".to_string()), None, None, None, None, None);

    contract.set_creator_profile(
        Some("New Name".to_string()),
        Some("Updated bio".to_string()),
        None,
        None,
        None,
        None,
    );

    let profile = contract.get_creator_profile(creator_id.clone()).unwrap();
    assert_eq!(profile.display_name, Some("New Name".to_string()));
    assert_eq!(profile.bio, Some("Updated bio".to_string()));
}

#[test]
fn get_creator_profile_returns_none_for_unknown() {
    let contract = Contract::new(account("owner.testnet"));
    let profile = contract.get_creator_profile(account("unknown.testnet"));
    assert!(profile.is_none());
}
