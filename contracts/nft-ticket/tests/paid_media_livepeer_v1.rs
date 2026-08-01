use near_sdk::json_types::{U128, U64};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, PromiseOrValue};
use youtick_nft::{Contract, LivepeerPublicationSubmission, PublicationAvailability};

const PROFILE: &str = "paid-media-livepeer-v1";
const PROFILE_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ASSET_HASH: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PROJECT_HASH: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const FINGERPRINT: &str = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const TESTNET_USDC: &str = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn context(predecessor: &str) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder.current_account_id(account("market.testnet"));
    builder.predecessor_account_id(account(predecessor));
    builder.block_timestamp(1_785_589_300_000_000_000);
    builder
}

fn contract() -> Contract {
    testing_env!(context("market.testnet").build());
    Contract::new(account("platform.testnet"), account("bridge.testnet"))
}

fn create_job(contract: &mut Contract, job_id: &str, creator: &str) {
    testing_env!(context(creator).build());
    contract.create_paid_job(
        job_id.to_string(),
        "Paid video".to_string(),
        U128(2_000_000),
        U128(1_000_000),
        PROFILE.to_string(),
        PROFILE_HASH.to_string(),
    );
}

#[test]
fn accepts_exact_source_limit_and_rejects_one_byte_more() {
    let mut contract = contract();
    testing_env!(context("creator.testnet").build());
    contract.create_paid_job(
        "job-max".to_string(),
        "Paid video".to_string(),
        U128(2_000_000),
        U128(20_000_000_000),
        PROFILE.to_string(),
        PROFILE_HASH.to_string(),
    );
    must_fail(|| {
        contract.create_paid_job(
            "job-too-large".to_string(),
            "Paid video".to_string(),
            U128(2_000_000),
            U128(20_000_000_001),
            PROFILE.to_string(),
            PROFILE_HASH.to_string(),
        );
    });
}

fn finalize(
    contract: &mut Contract,
    job_id: &str,
    generation: u64,
    creator: &str,
    asset_hash: &str,
    playback_id: &str,
) -> youtick_nft::Publication {
    testing_env!(context("bridge.testnet").build());
    contract.finalize_livepeer_publication(submission(
        job_id,
        generation,
        creator,
        asset_hash,
        playback_id,
    ))
}

fn submission(
    job_id: &str,
    generation: u64,
    creator: &str,
    asset_hash: &str,
    playback_id: &str,
) -> LivepeerPublicationSubmission {
    LivepeerPublicationSubmission {
        job_id: job_id.to_string(),
        generation,
        creator_id: account(creator),
        expected_source_bytes: U128(1_000_000),
        profile_id: PROFILE.to_string(),
        profile_config_sha256: PROFILE_HASH.to_string(),
        asset_id_hash: asset_hash.to_string(),
        playback_id: playback_id.to_string(),
        project_id_hash: PROJECT_HASH.to_string(),
        verified_source_bytes: U128(1_000_000),
        provider_source_fingerprint: Some(FINGERPRINT.to_string()),
        ready_at_ms: U64(1_785_589_200_000),
        availability: PublicationAvailability::Active,
    }
}

fn must_fail(action: impl FnOnce()) {
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(action)).is_err());
}

#[test]
fn only_bridge_can_finalize_exact_job_tuple() {
    let mut contract = contract();
    create_job(&mut contract, "job-1", "creator.testnet");

    testing_env!(context("attacker.testnet").build());
    must_fail(|| {
        contract.finalize_livepeer_publication(submission(
            "job-1",
            1,
            "creator.testnet",
            ASSET_HASH,
            "playback_001",
        ));
    });

    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        contract.finalize_livepeer_publication(submission(
            "job-1",
            1,
            "wrong-creator.testnet",
            ASSET_HASH,
            "playback_001",
        ));
    });
    must_fail(|| {
        let mut value = submission("job-1", 1, "creator.testnet", ASSET_HASH, "playback_001");
        value.expected_source_bytes = U128(1_000_001);
        contract.finalize_livepeer_publication(value);
    });
    must_fail(|| {
        let mut value = submission("job-1", 1, "creator.testnet", ASSET_HASH, "playback_001");
        value.verified_source_bytes = U128(1_000_001);
        contract.finalize_livepeer_publication(value);
    });
    must_fail(|| {
        let mut value = submission("job-1", 1, "creator.testnet", ASSET_HASH, "playback_001");
        value.profile_id = "paid-media-v4".to_string();
        contract.finalize_livepeer_publication(value);
    });
}

#[test]
fn old_generation_cannot_finalize() {
    let mut contract = contract();
    create_job(&mut contract, "job-1", "creator.testnet");
    testing_env!(context("creator.testnet").build());
    contract.restart_paid_job(
        "job-1".to_string(),
        U128(1_000_000),
        PROFILE.to_string(),
        PROFILE_HASH.to_string(),
    );
    must_fail(|| {
        finalize(
            &mut contract,
            "job-1",
            1,
            "creator.testnet",
            ASSET_HASH,
            "playback_001",
        );
    });
}

#[test]
fn exact_finalize_replay_is_idempotent_and_conflict_fails() {
    let mut contract = contract();
    create_job(&mut contract, "job-1", "creator.testnet");
    let first = finalize(
        &mut contract,
        "job-1",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_001",
    );
    let second = finalize(
        &mut contract,
        "job-1",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_001",
    );
    assert_eq!(first, second);

    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        contract.finalize_livepeer_publication(submission(
            "job-1",
            1,
            "creator.testnet",
            ASSET_HASH,
            "different_playback",
        ));
    });
}

#[test]
fn asset_and_playback_identities_are_global() {
    let mut contract = contract();
    create_job(&mut contract, "job-1", "creator.testnet");
    create_job(&mut contract, "job-2", "other.testnet");
    finalize(
        &mut contract,
        "job-1",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_001",
    );
    must_fail(|| {
        finalize(
            &mut contract,
            "job-2",
            1,
            "other.testnet",
            ASSET_HASH,
            "playback_002",
        );
    });
    let other_asset = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    must_fail(|| {
        finalize(
            &mut contract,
            "job-2",
            1,
            "other.testnet",
            other_asset,
            "playback_001",
        );
    });
}

#[test]
fn sales_suspension_refunds_new_purchase_and_keeps_entitlement() {
    let mut contract = contract();
    create_job(&mut contract, "job-1", "creator.testnet");
    finalize(
        &mut contract,
        "job-1",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_001",
    );

    testing_env!(context(TESTNET_USDC).build());
    let accepted = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(2_000_000),
        r#"{"publication_id":"job-1"}"#.to_string(),
    );
    assert!(matches!(accepted, PromiseOrValue::Value(U128(0))));

    testing_env!(context("bridge.testnet").build());
    contract.suspend_livepeer_sales("job-1".to_string());
    let replayed = finalize(
        &mut contract,
        "job-1",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_001",
    );
    assert_eq!(
        replayed.availability,
        PublicationAvailability::SalesSuspended
    );

    testing_env!(context(TESTNET_USDC).build());
    let refunded = contract.ft_on_transfer(
        account("second-buyer.testnet"),
        U128(2_000_000),
        r#"{"publication_id":"job-1"}"#.to_string(),
    );
    assert!(matches!(refunded, PromiseOrValue::Value(U128(2_000_000))));
    assert!(contract.has_entitlement(account("buyer.testnet"), "job-1".to_string()));
}
