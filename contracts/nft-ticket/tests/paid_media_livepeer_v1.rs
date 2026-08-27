use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, AccountId, PromiseOrValue};
use youtick_nft::{
    Contract, CreatorFeeQuote, FeeAsset, LivepeerPublicationSubmission, MarketInitConfig,
    PaidJobRequest, PublicationAvailability, SponsoredUploadQuote,
};

const PROFILE: &str = "paid-media-livepeer-v1";
const PROFILE_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ASSET_HASH: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PROJECT_HASH: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const FINGERPRINT: &str = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const TESTNET_USDC: &str = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const UPLOAD_KEY: &str = "ed25519:4nSjNY5gSbA4AExMyWg2ErPAwn2X4Vdo4nBNmxyZ9kzF";
const QUOTE_PUBLIC_KEY: [u8; 32] = [
    131, 153, 135, 167, 32, 33, 42, 35, 105, 154, 11, 233, 173, 110, 122, 105, 21, 78, 215, 22, 6,
    51, 169, 198, 133, 42, 43, 121, 232, 229, 231, 190,
];
const QUOTE_SIGNATURE: [u8; 64] = [
    222, 32, 143, 92, 255, 124, 221, 225, 225, 188, 211, 209, 118, 93, 124, 247, 136, 45, 144, 248,
    252, 88, 196, 208, 30, 90, 56, 68, 143, 252, 195, 129, 208, 218, 173, 240, 174, 0, 178, 130,
    52, 49, 117, 100, 27, 26, 86, 201, 218, 132, 203, 154, 223, 0, 144, 34, 203, 78, 176, 228, 226,
    219, 173, 2,
];
const SPONSOR_QUOTE_SIGNATURE: [u8; 64] = [
    108, 80, 90, 146, 212, 98, 155, 107, 143, 224, 194, 98, 132, 33, 125, 125, 84, 221, 200, 9,
    143, 80, 45, 86, 161, 59, 121, 7, 115, 186, 24, 170, 23, 32, 23, 233, 251, 216, 180, 93, 210,
    191, 46, 217, 180, 9, 119, 121, 87, 249, 128, 223, 70, 53, 108, 209, 45, 134, 150, 125, 154,
    33, 190, 2,
];

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn context(predecessor: &str) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder.current_account_id(account("market.testnet"));
    builder.predecessor_account_id(account(predecessor));
    builder.block_timestamp(1_785_589_300_000_000_000);
    builder.block_height(1_000);
    builder
}

fn contract() -> Contract {
    testing_env!(context("market.testnet").build());
    Contract::new(MarketInitConfig {
        platform_account_id: account("platform.testnet"),
        bridge_account_id: account("bridge.testnet"),
        takedown_authority_id: account("governance.testnet"),
        admin_account_id: account("admin.testnet"),
        guardian_account_id: account("guardian.testnet"),
        quote_public_key: Base64VecU8(QUOTE_PUBLIC_KEY.to_vec()),
        quote_key_version: 1,
        near_operational_reserve: U128(1_000_000_000_000_000_000_000_000),
    })
}

fn near_request() -> PaidJobRequest {
    PaidJobRequest {
        creator_id: account("creator.testnet"),
        job_id: "job-near".to_string(),
        title: "Paid video".to_string(),
        price_usdc: U128(2_000_000),
        expected_source_bytes: U128(1_000_000_000),
        profile_id: PROFILE.to_string(),
        profile_config_sha256: PROFILE_HASH.to_string(),
        upload_public_key: UPLOAD_KEY.to_string(),
        upload_key_expires_at_ms: U64(1_785_589_900_000),
    }
}

fn near_quote() -> CreatorFeeQuote {
    CreatorFeeQuote {
        domain: "youtick.creator-fee-quote".to_string(),
        version: "1".to_string(),
        network: "testnet".to_string(),
        contract_id: account("market.testnet"),
        creator_id: account("creator.testnet"),
        job_id: "job-near".to_string(),
        expected_source_bytes: U128(1_000_000_000),
        fee_usd_micro: U128(500_000),
        near_usd_micro: U128(5_000_000),
        fee_near_yocto: U128(100_000_000_000_000_000_000_000),
        rate_source: "approved-source-v1".to_string(),
        rate_timestamp_ms: U64(1_785_589_300_000),
        expires_at_ms: U64(1_785_589_420_000),
        quote_key_version: 1,
        quote_id: "f2486e711ff88fe95aee073dce768a658212ad447d1e0c8aa5098c80099e4423".to_string(),
    }
}

fn sponsored_request() -> PaidJobRequest {
    PaidJobRequest {
        creator_id: account("creator.testnet"),
        job_id: "job-sponsored".to_string(),
        title: "Paid video".to_string(),
        price_usdc: U128(2_000_000),
        expected_source_bytes: U128(1_000_000_000),
        profile_id: PROFILE.to_string(),
        profile_config_sha256: PROFILE_HASH.to_string(),
        upload_public_key: UPLOAD_KEY.to_string(),
        upload_key_expires_at_ms: U64(1_785_589_900_000),
    }
}

fn sponsored_quote() -> SponsoredUploadQuote {
    SponsoredUploadQuote {
        domain: "youtick.sponsored-upload-quote".to_string(),
        version: "1".to_string(),
        network: "testnet".to_string(),
        contract_id: account("market.testnet"),
        creator_id: account("creator.testnet"),
        job_id: "job-sponsored".to_string(),
        request_sha256: "dabd59b56d4a2696d0c10af16bf430d74e2895c59de5db03894312b7a88b48d6"
            .to_string(),
        expected_source_bytes: U128(1_000_000_000),
        upload_fee_usdc: U128(500_000),
        sponsor_fee_usdc: U128(100_000),
        total_fee_usdc: U128(600_000),
        delegate_receiver_id: account(TESTNET_USDC),
        delegate_method: "ft_transfer_call".to_string(),
        delegate_gas: U64(100_000_000_000_000),
        delegate_deposit_yocto: U128(1),
        issued_at_ms: U64(1_785_589_300_000),
        quote_block_height: U64(1_000),
        max_delegate_block_height: U64(1_200),
        expires_at_ms: U64(1_785_589_420_000),
        quote_key_version: 1,
        quote_id: "8681a029ccc506fc7cae9f9e3f6f9644d248f733d1f28a79be0b86f7a21e0f0c".to_string(),
    }
}

fn sponsored_message(request: &PaidJobRequest, quote: SponsoredUploadQuote) -> String {
    sponsored_message_with_signature(request, quote, &SPONSOR_QUOTE_SIGNATURE)
}

fn sponsored_message_with_signature(
    request: &PaidJobRequest,
    quote: SponsoredUploadQuote,
    signature: &[u8],
) -> String {
    near_sdk::serde_json::json!({
        "action": "create_paid_job",
        "job_id": request.job_id,
        "title": request.title,
        "price_usdc": request.price_usdc,
        "expected_source_bytes": request.expected_source_bytes,
        "profile_id": request.profile_id,
        "profile_config_sha256": request.profile_config_sha256,
        "upload_public_key": request.upload_public_key,
        "upload_key_expires_at_ms": request.upload_key_expires_at_ms,
        "sponsor_quote": quote,
        "sponsor_quote_signature": Base64VecU8(signature.to_vec()),
    })
    .to_string()
}

#[test]
fn native_near_quote_creates_once_and_binds_upload_key() {
    let mut contract = contract();
    let mut builder = context("creator.testnet");
    builder.attached_deposit(near_sdk::NearToken::from_yoctonear(
        100_000_000_000_000_000_000_000,
    ));
    testing_env!(builder.build());
    let created = contract.create_paid_job_near(
        near_request(),
        near_quote(),
        Base64VecU8(QUOTE_SIGNATURE.to_vec()),
    );
    let PromiseOrValue::Value(job) = created else {
        panic!("first payment must create")
    };
    assert_eq!(job.fee_asset, FeeAsset::Near);
    assert_eq!(job.upload_public_key, UPLOAD_KEY);
    assert_eq!(
        contract.get_platform_near_balance(),
        U128(100_000_000_000_000_000_000_000)
    );
    assert!(matches!(
        contract.create_paid_job_near(
            near_request(),
            near_quote(),
            Base64VecU8(QUOTE_SIGNATURE.to_vec()),
        ),
        PromiseOrValue::Promise(_)
    ));
    assert_eq!(
        contract.get_platform_near_balance(),
        U128(100_000_000_000_000_000_000_000)
    );
}

#[test]
fn wrong_or_stale_near_quote_fails_closed() {
    let mut contract = contract();
    let mut builder = context("creator.testnet");
    builder.attached_deposit(near_sdk::NearToken::from_yoctonear(
        100_000_000_000_000_000_000_000,
    ));
    testing_env!(builder.build());
    must_fail(|| {
        let mut quote = near_quote();
        quote.rate_timestamp_ms = U64(1_785_589_239_999);
        contract.create_paid_job_near(near_request(), quote, Base64VecU8(QUOTE_SIGNATURE.to_vec()));
    });
    assert_eq!(contract.get_platform_near_balance(), U128(0));
}

#[test]
fn sponsored_usdc_quote_charges_one_total_and_refunds_exact_replay() {
    let mut contract = contract();
    let request = sponsored_request();
    let message = sponsored_message(&request, sponsored_quote());
    testing_env!(context(TESTNET_USDC).build());

    let created =
        contract.ft_on_transfer(account("creator.testnet"), U128(600_000), message.clone());
    assert!(matches!(created, PromiseOrValue::Value(U128(0))));
    assert_eq!(contract.get_platform_balance(), U128(600_000));
    let job = contract.get_media_job("job-sponsored".to_string()).unwrap();
    assert_eq!(job.fee_asset, FeeAsset::Usdc);
    assert_eq!(job.fee_amount, U128(600_000));
    assert_eq!(job.fee_usd_micro, U128(600_000));
    assert_eq!(
        job.fee_quote_hash.as_deref(),
        Some("8681a029ccc506fc7cae9f9e3f6f9644d248f733d1f28a79be0b86f7a21e0f0c")
    );

    let replay = contract.ft_on_transfer(account("creator.testnet"), U128(600_000), message);
    assert!(matches!(replay, PromiseOrValue::Value(U128(600_000))));
    assert_eq!(contract.get_platform_balance(), U128(600_000));
    assert_eq!(
        contract.get_media_job("job-sponsored".to_string()).unwrap(),
        job
    );
}

#[test]
fn sponsored_usdc_quote_rejects_amount_request_and_expiry_drift() {
    let request = sponsored_request();

    let mut wrong_amount = contract();
    testing_env!(context(TESTNET_USDC).build());
    must_fail(|| {
        wrong_amount.ft_on_transfer(
            account("creator.testnet"),
            U128(599_999),
            sponsored_message(&request, sponsored_quote()),
        );
    });
    assert_eq!(wrong_amount.get_platform_balance(), U128(0));

    let mut wrong_request = contract();
    let mut changed_request = request.clone();
    changed_request.title = "Changed video".to_string();
    testing_env!(context(TESTNET_USDC).build());
    must_fail(|| {
        wrong_request.ft_on_transfer(
            account("creator.testnet"),
            U128(600_000),
            sponsored_message(&changed_request, sponsored_quote()),
        );
    });
    assert_eq!(wrong_request.get_platform_balance(), U128(0));

    let mut wrong_signature = contract();
    testing_env!(context(TESTNET_USDC).build());
    must_fail(|| {
        wrong_signature.ft_on_transfer(
            account("creator.testnet"),
            U128(600_000),
            sponsored_message_with_signature(&request, sponsored_quote(), &[0; 64]),
        );
    });
    assert_eq!(wrong_signature.get_platform_balance(), U128(0));

    let mut expired = contract();
    let mut expired_context = context(TESTNET_USDC);
    expired_context.block_timestamp(1_785_589_430_000_000_000);
    testing_env!(expired_context.build());
    must_fail(|| {
        expired.ft_on_transfer(
            account("creator.testnet"),
            U128(600_000),
            sponsored_message(&request, sponsored_quote()),
        );
    });
    assert_eq!(expired.get_platform_balance(), U128(0));

    let mut future_issue = contract();
    let mut future_issue_context = context(TESTNET_USDC);
    future_issue_context.block_timestamp(1_785_589_299_999_000_000);
    testing_env!(future_issue_context.build());
    must_fail(|| {
        future_issue.ft_on_transfer(
            account("creator.testnet"),
            U128(600_000),
            sponsored_message(&request, sponsored_quote()),
        );
    });
    assert_eq!(future_issue.get_platform_balance(), U128(0));

    let mut expired_block = contract();
    let mut expired_block_context = context(TESTNET_USDC);
    expired_block_context.block_height(1_201);
    testing_env!(expired_block_context.build());
    must_fail(|| {
        expired_block.ft_on_transfer(
            account("creator.testnet"),
            U128(600_000),
            sponsored_message(&request, sponsored_quote()),
        );
    });
    assert_eq!(expired_block.get_platform_balance(), U128(0));

    for sponsor_fee in [99_999, 100_001] {
        let mut invalid_fee = contract();
        let mut quote = sponsored_quote();
        quote.sponsor_fee_usdc = U128(sponsor_fee);
        quote.total_fee_usdc = U128(500_000 + sponsor_fee);
        testing_env!(context(TESTNET_USDC).build());
        must_fail(|| {
            invalid_fee.ft_on_transfer(
                account("creator.testnet"),
                U128(500_000 + sponsor_fee),
                sponsored_message(&request, quote),
            );
        });
        assert_eq!(invalid_fee.get_platform_balance(), U128(0));
    }

    let mut invalid_total = contract();
    let mut quote = sponsored_quote();
    quote.total_fee_usdc = U128(599_999);
    testing_env!(context(TESTNET_USDC).build());
    must_fail(|| {
        invalid_total.ft_on_transfer(
            account("creator.testnet"),
            U128(599_999),
            sponsored_message(&request, quote),
        );
    });
    assert_eq!(invalid_total.get_platform_balance(), U128(0));
}

fn create_job(contract: &mut Contract, job_id: &str, creator: &str) {
    create_job_with(contract, job_id, creator, 2_000_000, 1_000_000);
}

fn upload_fee(source_bytes: u128) -> u128 {
    (source_bytes * 3 / 10_000 + u128::from(source_bytes * 3 % 10_000 != 0)).max(500_000)
}

fn create_job_with(
    contract: &mut Contract,
    job_id: &str,
    creator: &str,
    price_usdc: u128,
    source_bytes: u128,
) -> PromiseOrValue<U128> {
    testing_env!(context(TESTNET_USDC).build());
    contract.ft_on_transfer(
        account(creator),
        U128(upload_fee(source_bytes)),
        near_sdk::serde_json::json!({
            "action": "create_paid_job",
            "job_id": job_id,
            "title": "Paid video",
            "price_usdc": price_usdc.to_string(),
            "expected_source_bytes": source_bytes.to_string(),
            "profile_id": PROFILE,
            "profile_config_sha256": PROFILE_HASH,
            "upload_public_key": UPLOAD_KEY,
            "upload_key_expires_at_ms": "1785589900000",
        })
        .to_string(),
    )
}

#[test]
fn accepts_exact_source_limit_and_rejects_one_byte_more() {
    let mut contract = contract();
    assert!(matches!(
        create_job_with(
            &mut contract,
            "job-max",
            "creator.testnet",
            2_000_000,
            20_000_000_000,
        ),
        PromiseOrValue::Value(U128(0))
    ));
    must_fail(|| {
        create_job_with(
            &mut contract,
            "job-too-large",
            "creator.testnet",
            2_000_000,
            20_000_000_001,
        );
    });
}

#[test]
fn creator_upload_fee_uses_exact_bytes_and_replay_is_refunded() {
    let cases = [
        (1, 500_000),
        (83_886_080, 500_000),
        (1_000_000_000, 500_000),
        (5_000_000_000, 1_500_000),
        (10_000_000_000, 3_000_000),
        (20_000_000_000, 6_000_000),
    ];
    for (index, (source_bytes, expected_fee)) in cases.into_iter().enumerate() {
        let mut contract = contract();
        let job_id = format!("job-fee-{index}");
        assert_eq!(upload_fee(source_bytes), expected_fee);
        let first = create_job_with(
            &mut contract,
            &job_id,
            "creator.testnet",
            2_000_000,
            source_bytes,
        );
        assert!(matches!(first, PromiseOrValue::Value(U128(0))));
        assert_eq!(contract.get_platform_balance(), U128(expected_fee));
        let job_before_replay = contract.get_media_job(job_id.clone()).unwrap();

        let replay = create_job_with(
            &mut contract,
            &job_id,
            "creator.testnet",
            2_000_000,
            source_bytes,
        );
        assert!(matches!(replay, PromiseOrValue::Value(U128(value)) if value == expected_fee));
        assert_eq!(contract.get_platform_balance(), U128(expected_fee));
        assert_eq!(
            contract.get_media_job(job_id.clone()).unwrap(),
            job_before_replay
        );

        let new_job = create_job_with(
            &mut contract,
            &format!("job-fee-new-{index}"),
            "creator.testnet",
            2_000_000,
            source_bytes,
        );
        assert!(matches!(new_job, PromiseOrValue::Value(U128(0))));
        assert_eq!(contract.get_platform_balance(), U128(expected_fee * 2));
    }
}

#[test]
fn ft_sender_is_authoritative_for_creator_and_buyer_rights() {
    let mut contract = contract();
    testing_env!(context(TESTNET_USDC).build());
    let created = contract.ft_on_transfer(
        account("actual-creator.testnet"),
        U128(500_000),
        near_sdk::serde_json::json!({
            "action": "create_paid_job",
            "creator_id": "claimed-creator.testnet",
            "job_id": "job-sender",
            "title": "Paid video",
            "price_usdc": "2000000",
            "expected_source_bytes": "1000000",
            "profile_id": PROFILE,
            "profile_config_sha256": PROFILE_HASH,
            "upload_public_key": UPLOAD_KEY,
            "upload_key_expires_at_ms": "1785589900000",
        })
        .to_string(),
    );
    assert!(matches!(created, PromiseOrValue::Value(U128(0))));
    assert_eq!(
        contract
            .get_media_job("job-sender".to_string())
            .unwrap()
            .creator_id,
        account("actual-creator.testnet")
    );

    finalize(
        &mut contract,
        "job-sender",
        1,
        "actual-creator.testnet",
        ASSET_HASH,
        "playback_sender",
    );
    testing_env!(context(TESTNET_USDC).build());
    let purchased = contract.ft_on_transfer(
        account("actual-buyer.testnet"),
        U128(2_000_000),
        r#"{"action":"buy_ticket","publication_id":"job-sender","buyer_id":"claimed-buyer.testnet"}"#
            .to_string(),
    );
    assert!(matches!(purchased, PromiseOrValue::Value(U128(0))));
    assert!(contract.has_entitlement(account("actual-buyer.testnet"), "job-sender".to_string()));
    assert!(!contract.has_entitlement(account("claimed-buyer.testnet"), "job-sender".to_string()));
    assert!(!contract.has_entitlement(account("claimed-creator.testnet"), "job-sender".to_string()));
}

#[test]
fn creator_can_replace_an_unpublished_upload_key_without_a_second_charge() {
    let mut contract = contract();
    create_job(&mut contract, "job-key", "creator.testnet");
    let charged = contract.get_platform_balance();
    testing_env!(context("creator.testnet").build());
    let replacement = "ed25519:9nSjNY5gSbA4AExMyWg2ErPAwn2X4Vdo4nBNmxyZ9kzF";
    let job = contract.replace_upload_key(
        "job-key".to_string(),
        replacement.to_string(),
        U64(1_785_590_000_000),
    );
    assert_eq!(job.upload_public_key, replacement);
    assert_eq!(contract.get_platform_balance(), charged);
    finalize(
        &mut contract,
        "job-key",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_key",
    );
    testing_env!(context("creator.testnet").build());
    must_fail(|| {
        contract.replace_upload_key(
            "job-key".to_string(),
            UPLOAD_KEY.to_string(),
            U64(1_785_590_000_000),
        );
    });
}

#[test]
fn ticket_minimum_is_two_usdc_and_existing_two_percent_split_is_unchanged() {
    let mut contract = contract();
    must_fail(|| {
        create_job_with(
            &mut contract,
            "job-too-cheap",
            "creator.testnet",
            1_999_999,
            1_000_000,
        );
    });
    create_job_with(
        &mut contract,
        "job-price",
        "creator.testnet",
        2_000_001,
        1_000_000,
    );
    finalize(
        &mut contract,
        "job-price",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_price",
    );

    testing_env!(context(TESTNET_USDC).build());
    let purchase = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(2_000_001),
        r#"{"publication_id":"job-price"}"#.to_string(),
    );
    assert!(matches!(purchase, PromiseOrValue::Value(U128(0))));
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")),
        U128(1_960_001),
    );
    assert_eq!(contract.get_platform_balance(), U128(540_000));
}

#[test]
fn retry_keeps_exact_source_bytes_without_a_second_charge() {
    let mut contract = contract();
    create_job(&mut contract, "job-retry", "creator.testnet");
    let charged = contract.get_platform_balance();

    testing_env!(context("creator.testnet").build());
    let restarted = contract.restart_paid_job(
        "job-retry".to_string(),
        U128(1_000_000),
        PROFILE.to_string(),
        PROFILE_HASH.to_string(),
    );
    assert_eq!(restarted.generation, 2);
    assert_eq!(contract.get_platform_balance(), charged);
    must_fail(|| {
        contract.restart_paid_job(
            "job-retry".to_string(),
            U128(1_000_001),
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

fn governance_event() -> near_sdk::serde_json::Value {
    let logs = get_logs();
    let value = logs.last().expect("governance event must be logged");
    near_sdk::serde_json::from_str(
        value
            .strip_prefix("EVENT_JSON:")
            .expect("governance event must use NEP-297 prefix"),
    )
    .unwrap()
}

#[test]
fn economic_lifecycle_emits_rebuildable_events_without_upload_capabilities() {
    let mut contract = contract();
    create_job(&mut contract, "job-events", "creator.testnet");
    let authorized = governance_event();
    assert_eq!(authorized["event"], "media_job_authorized");
    assert_eq!(authorized["data"][0]["contract_id"], "market.testnet");
    assert_eq!(authorized["data"][0]["job_id"], "job-events");
    assert_eq!(authorized["data"][0]["asset"], "USDC");
    assert_eq!(authorized["data"][0]["amount"], "500000");
    assert!(authorized["data"][0]["idempotency_key"]
        .as_str()
        .is_some_and(|value| !value.is_empty()));
    assert!(!authorized.to_string().contains(UPLOAD_KEY));

    testing_env!(context("creator.testnet").build());
    contract.replace_upload_key(
        "job-events".to_string(),
        "ed25519:9nSjNY5gSbA4AExMyWg2ErPAwn2X4Vdo4nBNmxyZ9kzF".to_string(),
        U64(1_785_590_000_000),
    );
    let replaced = governance_event();
    assert_eq!(replaced["event"], "media_job_upload_key_replaced");
    assert_eq!(replaced["data"][0]["job_id"], "job-events");
    assert!(replaced["data"][0]["upload_public_key_sha256"].is_string());

    finalize(
        &mut contract,
        "job-events",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_events",
    );
    let finalized = governance_event();
    assert_eq!(finalized["event"], "publication_finalized");
    assert_eq!(finalized["data"][0]["publication_id"], "job-events");
    assert_eq!(finalized["data"][0]["title"], "Paid video");
    assert_eq!(finalized["data"][0]["playback_id"], "playback_events");
    assert_eq!(
        finalized["data"][0]["published_at_ms"],
        1_785_589_300_000u64
    );
    testing_env!(context("bridge.testnet").build());
    contract.finalize_livepeer_publication(submission(
        "job-events",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_events",
    ));
    assert!(get_logs().is_empty());

    testing_env!(context("bridge.testnet").build());
    contract.suspend_livepeer_sales("job-events".to_string());
    let suspended = governance_event();
    assert_eq!(suspended["event"], "publication_sales_suspended");
    testing_env!(context("bridge.testnet").build());
    contract.suspend_livepeer_sales("job-events".to_string());
    assert!(get_logs().is_empty());

    testing_env!(context("governance.testnet").build());
    contract.takedown_livepeer_publication(
        "job-events".to_string(),
        "GOVERNANCE_DECISION".to_string(),
        "incident-events".to_string(),
        "e".repeat(64),
        U64(1_785_589_300_000),
    );
    let takedown = governance_event();
    assert_eq!(takedown["event"], "publication_takedown");
    assert_eq!(takedown["data"][0]["reason_code"], "GOVERNANCE_DECISION");
    testing_env!(context("governance.testnet").build());
    contract.takedown_livepeer_publication(
        "job-events".to_string(),
        "GOVERNANCE_DECISION".to_string(),
        "incident-events".to_string(),
        "e".repeat(64),
        U64(1_785_589_300_000),
    );
    assert!(get_logs().is_empty());

    create_job(&mut contract, "job-sale-event", "creator.testnet");
    finalize(
        &mut contract,
        "job-sale-event",
        1,
        "creator.testnet",
        "f".repeat(64).as_str(),
        "playback_sale_event",
    );
    testing_env!(context(TESTNET_USDC).build());
    assert!(matches!(
        contract.ft_on_transfer(
            account("buyer.testnet"),
            U128(2_000_000),
            r#"{"publication_id":"job-sale-event"}"#.to_string(),
        ),
        PromiseOrValue::Value(U128(0))
    ));
    let purchased = governance_event();
    assert_eq!(purchased["event"], "entitlement_purchased");
    assert_eq!(purchased["data"][0]["account_id"], "buyer.testnet");
    assert_eq!(purchased["data"][0]["amount"], "2000000");

    testing_env!(context("platform.testnet").build());
    contract.rotate_quote_public_key(2, Base64VecU8(vec![2; 32]));
    let rotated = governance_event();
    assert_eq!(rotated["event"], "quote_key_rotated");
    assert_eq!(rotated["data"][0]["quote_key_version"], 2);
}

#[test]
fn guardian_freeze_blocks_bridge_and_admin_alone_unfreezes() {
    let mut contract = contract();
    create_job(&mut contract, "job-freeze", "creator.testnet");

    testing_env!(context("attacker.testnet").build());
    must_fail(|| contract.freeze_bridge());
    testing_env!(context("admin.testnet").build());
    must_fail(|| contract.freeze_bridge());

    testing_env!(context("guardian.testnet").build());
    contract.freeze_bridge();
    assert!(contract.get_governance_state().bridge_frozen);
    let frozen = governance_event();
    assert_eq!(frozen["standard"], "youtick_market");
    assert_eq!(frozen["version"], "1.0.0");
    assert_eq!(frozen["event"], "bridge_frozen");
    assert_eq!(frozen["data"][0]["actor_id"], "guardian.testnet");

    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        contract.finalize_livepeer_publication(submission(
            "job-freeze",
            1,
            "creator.testnet",
            ASSET_HASH,
            "playback_freeze",
        ));
    });
    testing_env!(context("guardian.testnet").build());
    must_fail(|| contract.unfreeze_bridge());

    testing_env!(context("admin.testnet").build());
    contract.unfreeze_bridge();
    assert!(!contract.get_governance_state().bridge_frozen);
    let unfrozen = governance_event();
    assert_eq!(unfrozen["event"], "bridge_unfrozen");
    assert_eq!(unfrozen["data"][0]["actor_id"], "admin.testnet");

    finalize(
        &mut contract,
        "job-freeze",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_freeze",
    );
    testing_env!(context("guardian.testnet").build());
    contract.freeze_bridge();
    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        contract.suspend_livepeer_sales("job-freeze".to_string());
    });
}

#[test]
fn guardian_pauses_new_purchases_and_admin_alone_unpauses() {
    let mut contract = contract();
    create_job(&mut contract, "job-purchase-pause", "creator.testnet");
    finalize(
        &mut contract,
        "job-purchase-pause",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_purchase_pause",
    );
    testing_env!(context(TESTNET_USDC).build());
    assert!(matches!(
        contract.ft_on_transfer(
            account("existing-buyer.testnet"),
            U128(2_000_000),
            r#"{"publication_id":"job-purchase-pause"}"#.to_string(),
        ),
        PromiseOrValue::Value(U128(0))
    ));
    let serialized_state_before_pause = near_sdk::borsh::to_vec(&contract).unwrap();

    testing_env!(context("attacker.testnet").build());
    must_fail(|| contract.pause_new_purchases());
    testing_env!(context("admin.testnet").build());
    must_fail(|| contract.pause_new_purchases());

    testing_env!(context("guardian.testnet").build());
    contract.pause_new_purchases();
    assert!(contract.get_governance_state().new_purchases_paused);
    let paused = governance_event();
    assert_eq!(paused["event"], "new_purchases_paused");
    assert_eq!(paused["data"][0]["actor_id"], "guardian.testnet");
    assert_eq!(
        near_sdk::borsh::to_vec(&contract).unwrap(),
        serialized_state_before_pause
    );
    assert!(contract.has_entitlement(
        account("existing-buyer.testnet"),
        "job-purchase-pause".to_string()
    ));
    testing_env!(context("guardian.testnet").build());
    contract.pause_new_purchases();
    assert!(get_logs().is_empty());

    testing_env!(context(TESTNET_USDC).build());
    let platform_before = contract.get_platform_balance();
    let creator_before = contract.get_creator_balance(account("creator.testnet"));
    let refunded = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(2_000_000),
        r#"{"publication_id":"job-purchase-pause"}"#.to_string(),
    );
    assert!(matches!(refunded, PromiseOrValue::Value(U128(2_000_000))));
    assert_eq!(contract.get_platform_balance(), platform_before);
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")),
        creator_before
    );
    assert!(!contract.has_entitlement(account("buyer.testnet"), "job-purchase-pause".to_string()));

    let upload = create_job_with(
        &mut contract,
        "job-upload-while-purchases-paused",
        "creator.testnet",
        2_000_000,
        1_000_000,
    );
    assert!(matches!(upload, PromiseOrValue::Value(U128(0))));

    testing_env!(context("guardian.testnet").build());
    must_fail(|| contract.unpause_new_purchases());
    let serialized_state_before_unpause = near_sdk::borsh::to_vec(&contract).unwrap();
    testing_env!(context("admin.testnet").build());
    contract.unpause_new_purchases();
    assert!(!contract.get_governance_state().new_purchases_paused);
    let unpaused = governance_event();
    assert_eq!(unpaused["event"], "new_purchases_unpaused");
    assert_eq!(unpaused["data"][0]["actor_id"], "admin.testnet");
    assert_eq!(
        near_sdk::borsh::to_vec(&contract).unwrap(),
        serialized_state_before_unpause
    );
    testing_env!(context("admin.testnet").build());
    contract.unpause_new_purchases();
    assert!(get_logs().is_empty());

    testing_env!(context(TESTNET_USDC).build());
    let accepted = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(2_000_000),
        r#"{"publication_id":"job-purchase-pause"}"#.to_string(),
    );
    assert!(matches!(accepted, PromiseOrValue::Value(U128(0))));
    assert!(contract.has_entitlement(account("buyer.testnet"), "job-purchase-pause".to_string()));
}

#[test]
fn admin_rotates_bridge_through_auditable_pending_state() {
    let mut contract = contract();
    create_job(&mut contract, "job-rotation", "creator.testnet");
    let initial = contract.get_governance_state();
    assert_eq!(initial.state_version, 2);
    assert_eq!(initial.admin_account_id, account("admin.testnet"));
    assert_eq!(initial.guardian_account_id, account("guardian.testnet"));
    assert_eq!(initial.active_bridge_account_id, account("bridge.testnet"));
    assert!(initial.pending_bridge_account_id.is_none());

    testing_env!(context("attacker.testnet").build());
    must_fail(|| contract.propose_bridge(account("next-bridge.testnet")));
    testing_env!(context("admin.testnet").build());
    must_fail(|| contract.propose_bridge(account("guardian.testnet")));
    contract.propose_bridge(account("next-bridge.testnet"));
    let proposed = contract.get_governance_state();
    assert_eq!(
        proposed.pending_bridge_account_id,
        Some(account("next-bridge.testnet"))
    );
    assert_eq!(
        proposed.bridge_rotation_proposed_at_ms,
        Some(U64(1_785_589_300_000))
    );
    assert_eq!(governance_event()["event"], "bridge_rotation_proposed");

    testing_env!(context("guardian.testnet").build());
    contract.cancel_bridge_rotation();
    assert!(contract
        .get_governance_state()
        .pending_bridge_account_id
        .is_none());
    assert_eq!(governance_event()["event"], "bridge_rotation_cancelled");

    testing_env!(context("admin.testnet").build());
    contract.propose_bridge(account("next-bridge.testnet"));
    testing_env!(context("guardian.testnet").build());
    must_fail(|| contract.execute_bridge_rotation());
    testing_env!(context("admin.testnet").build());
    contract.execute_bridge_rotation();
    let rotated = contract.get_governance_state();
    assert_eq!(
        rotated.active_bridge_account_id,
        account("next-bridge.testnet")
    );
    assert!(rotated.pending_bridge_account_id.is_none());
    let event = governance_event();
    assert_eq!(event["event"], "bridge_rotated");
    assert_eq!(
        event["data"][0]["previous_bridge_account_id"],
        "bridge.testnet"
    );
    assert_eq!(
        event["data"][0]["active_bridge_account_id"],
        "next-bridge.testnet"
    );

    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        contract.finalize_livepeer_publication(submission(
            "job-rotation",
            1,
            "creator.testnet",
            ASSET_HASH,
            "playback_rotation",
        ));
    });
    testing_env!(context("next-bridge.testnet").build());
    contract.finalize_livepeer_publication(submission(
        "job-rotation",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_rotation",
    ));
}

#[test]
fn constructor_rejects_shared_admin_and_guardian() {
    testing_env!(context("market.testnet").build());
    must_fail(|| {
        Contract::new(MarketInitConfig {
            platform_account_id: account("platform.testnet"),
            bridge_account_id: account("bridge.testnet"),
            takedown_authority_id: account("governance.testnet"),
            admin_account_id: account("shared.testnet"),
            guardian_account_id: account("shared.testnet"),
            quote_public_key: Base64VecU8(QUOTE_PUBLIC_KEY.to_vec()),
            quote_key_version: 1,
            near_operational_reserve: U128(1_000_000_000_000_000_000_000_000),
        });
    });
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
        value.profile_id = "unsupported-profile".to_string();
        contract.finalize_livepeer_publication(value);
    });
}

#[test]
fn initial_finalize_requires_active_availability() {
    for (index, availability) in [
        PublicationAvailability::SalesSuspended,
        PublicationAvailability::Takedown,
    ]
    .into_iter()
    .enumerate()
    {
        let mut contract = contract();
        let job_id = format!("job-availability-{index}");
        create_job(&mut contract, &job_id, "creator.testnet");
        testing_env!(context("bridge.testnet").build());
        must_fail(|| {
            let mut value = submission(&job_id, 1, "creator.testnet", ASSET_HASH, "playback_001");
            value.availability = availability;
            contract.finalize_livepeer_publication(value);
        });
    }
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
    assert_eq!(contract.get_publications_count(), 1);
    assert_eq!(contract.get_publications(None, None), vec![first.clone()]);
    assert!(contract.has_entitlement(account("creator.testnet"), "job-1".to_string()));
    assert!(!contract.has_entitlement(account("stranger.testnet"), "job-1".to_string()));

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
fn publication_index_is_paginated_in_publish_order() {
    let mut contract = contract();
    for index in 1..=3 {
        let job_id = format!("job-{index}");
        create_job(&mut contract, &job_id, "creator.testnet");
        finalize(
            &mut contract,
            &job_id,
            1,
            "creator.testnet",
            &format!("{index:064x}"),
            &format!("playback_{index:03}"),
        );
    }

    assert_eq!(contract.get_publications_count(), 3);
    let page = contract.get_publications(Some(U64(1)), Some(2));
    assert_eq!(
        page.into_iter()
            .map(|publication| publication.publication_id)
            .collect::<Vec<_>>(),
        vec!["job-2", "job-3"]
    );
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
fn rejected_ticket_payments_refund_without_mutating_ledger() {
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
    let upload_balance = contract.get_platform_balance();
    let wrong_amount = contract.ft_on_transfer(
        account("wrong-amount.testnet"),
        U128(1_999_999),
        r#"{"publication_id":"job-1"}"#.to_string(),
    );
    assert!(matches!(
        wrong_amount,
        PromiseOrValue::Value(U128(1_999_999))
    ));
    assert_eq!(contract.get_platform_balance(), upload_balance);
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")),
        U128(0)
    );
    assert!(!contract.has_entitlement(account("wrong-amount.testnet"), "job-1".to_string()));

    let accepted = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(2_000_000),
        r#"{"publication_id":"job-1"}"#.to_string(),
    );
    assert!(matches!(accepted, PromiseOrValue::Value(U128(0))));
    let platform_after_purchase = contract.get_platform_balance();
    let creator_after_purchase = contract.get_creator_balance(account("creator.testnet"));

    let duplicate = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(2_000_000),
        r#"{"publication_id":"job-1"}"#.to_string(),
    );
    assert!(matches!(duplicate, PromiseOrValue::Value(U128(2_000_000))));
    assert_eq!(contract.get_platform_balance(), platform_after_purchase);
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")),
        creator_after_purchase
    );

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
    assert_eq!(contract.get_platform_balance(), platform_after_purchase);
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")),
        creator_after_purchase
    );
    assert!(contract.has_entitlement(account("buyer.testnet"), "job-1".to_string()));
    assert!(!contract.has_entitlement(account("second-buyer.testnet"), "job-1".to_string()));
}

#[test]
fn governance_takedown_is_one_way_and_preserves_entitlement_history() {
    let mut contract = contract();
    create_job(&mut contract, "job-takedown", "creator.testnet");
    finalize(
        &mut contract,
        "job-takedown",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_takedown",
    );
    testing_env!(context(TESTNET_USDC).build());
    let accepted = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(2_000_000),
        r#"{"publication_id":"job-takedown"}"#.to_string(),
    );
    assert!(matches!(accepted, PromiseOrValue::Value(U128(0))));

    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        contract.takedown_livepeer_publication(
            "job-takedown".to_string(),
            "PUBLIC_MEDIA_EXPOSURE".to_string(),
            "incident-001".to_string(),
            FINGERPRINT.to_string(),
            U64(1_785_589_300_000),
        );
    });

    testing_env!(context("governance.testnet").build());
    let takedown = contract.takedown_livepeer_publication(
        "job-takedown".to_string(),
        "PUBLIC_MEDIA_EXPOSURE".to_string(),
        "incident-001".to_string(),
        FINGERPRINT.to_string(),
        U64(1_785_589_300_000),
    );
    assert_eq!(takedown.availability, PublicationAvailability::Takedown);
    assert_eq!(
        contract
            .get_takedown("job-takedown".to_string())
            .unwrap()
            .incident_id,
        "incident-001"
    );
    let replay = contract.takedown_livepeer_publication(
        "job-takedown".to_string(),
        "PUBLIC_MEDIA_EXPOSURE".to_string(),
        "incident-001".to_string(),
        FINGERPRINT.to_string(),
        U64(1_785_589_300_000),
    );
    assert_eq!(replay, takedown);
    must_fail(|| {
        contract.takedown_livepeer_publication(
            "job-takedown".to_string(),
            "LEGAL_REQUIREMENT".to_string(),
            "incident-002".to_string(),
            FINGERPRINT.to_string(),
            U64(1_785_589_300_000),
        );
    });

    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        contract.suspend_livepeer_sales("job-takedown".to_string());
    });
    testing_env!(context(TESTNET_USDC).build());
    let refunded = contract.ft_on_transfer(
        account("second-buyer.testnet"),
        U128(2_000_000),
        r#"{"publication_id":"job-takedown"}"#.to_string(),
    );
    assert!(matches!(refunded, PromiseOrValue::Value(U128(2_000_000))));
    assert!(contract.has_entitlement(account("buyer.testnet"), "job-takedown".to_string()));
}

#[test]
fn governance_can_move_sales_suspended_publication_to_takedown() {
    let mut contract = contract();
    create_job(&mut contract, "job-suspended", "creator.testnet");
    finalize(
        &mut contract,
        "job-suspended",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_suspended",
    );
    testing_env!(context("bridge.testnet").build());
    contract.suspend_livepeer_sales("job-suspended".to_string());

    testing_env!(context("governance.testnet").build());
    let publication = contract.takedown_livepeer_publication(
        "job-suspended".to_string(),
        "GOVERNANCE_DECISION".to_string(),
        "incident-suspended".to_string(),
        FINGERPRINT.to_string(),
        U64(1_785_589_300_000),
    );

    assert_eq!(publication.availability, PublicationAvailability::Takedown);
}
