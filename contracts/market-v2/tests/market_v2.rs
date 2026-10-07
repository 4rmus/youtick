use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, AccountId, PromiseOrValue};
use youtick_market_v2::{
    Contract, CreatorFeeQuote, FeeAsset, GovernanceRole, LivepeerPublicationSubmission,
    MarketInitConfig, PaidJobRequest, PublicationAvailability, SponsoredUploadQuote,
};

const PROFILE: &str = "paid-media-livepeer-v1";
const PROFILE_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ASSET_HASH: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PROJECT_HASH: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const FINGERPRINT: &str = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const TESTNET_USDC: &str = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const UPLOAD_KEY: &str = "ed25519:4nSjNY5gSbA4AExMyWg2ErPAwn2X4Vdo4nBNmxyZ9kzF";
// Upload quotes are signed in-test with a key derived from a public label (no deployed key).
fn quote_public_key() -> Vec<u8> {
    v2::key("quote").verifying_key().to_bytes().to_vec()
}

fn sign_quote(message: &str) -> Vec<u8> {
    use ed25519_dalek::Signer;
    v2::key("quote")
        .sign(message.as_bytes())
        .to_bytes()
        .to_vec()
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::Digest;
    sha2::Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn near_quote_message(quote: &CreatorFeeQuote) -> String {
    [
        quote.domain.clone(),
        quote.version.clone(),
        quote.network.clone(),
        quote.contract_id.to_string(),
        quote.creator_id.to_string(),
        quote.job_id.clone(),
        quote.expected_source_bytes.0.to_string(),
        quote.fee_usd_micro.0.to_string(),
        quote.near_usd_micro.0.to_string(),
        quote.fee_near_yocto.0.to_string(),
        quote.rate_source.clone(),
        quote.rate_timestamp_ms.0.to_string(),
        quote.expires_at_ms.0.to_string(),
        quote.quote_key_version.to_string(),
    ]
    .join("\n")
}

fn sponsored_quote_message(quote: &SponsoredUploadQuote) -> String {
    [
        quote.domain.clone(),
        quote.version.clone(),
        quote.network.clone(),
        quote.contract_id.to_string(),
        quote.creator_id.to_string(),
        quote.job_id.clone(),
        quote.request_sha256.clone(),
        quote.expected_source_bytes.0.to_string(),
        quote.upload_fee_usdc.0.to_string(),
        quote.sponsor_fee_usdc.0.to_string(),
        quote.total_fee_usdc.0.to_string(),
        quote.delegate_receiver_id.to_string(),
        quote.delegate_method.clone(),
        quote.delegate_gas.0.to_string(),
        quote.delegate_deposit_yocto.0.to_string(),
        quote.issued_at_ms.0.to_string(),
        quote.quote_block_height.0.to_string(),
        quote.max_delegate_block_height.0.to_string(),
        quote.expires_at_ms.0.to_string(),
        quote.quote_key_version.to_string(),
    ]
    .join("\n")
}

/// Binds a sponsored quote to its request and recomputes the quote ID the contract expects.
fn bind_sponsored_quote(
    request: &PaidJobRequest,
    mut quote: SponsoredUploadQuote,
) -> SponsoredUploadQuote {
    quote.request_sha256 = sha256_hex(&near_sdk::serde_json::to_vec(request).unwrap());
    quote.quote_id = sha256_hex(sponsored_quote_message(&quote).as_bytes());
    quote
}

fn near_quote_signature() -> Vec<u8> {
    sign_quote(&near_quote_message(&near_quote()))
}

fn sponsor_quote_signature() -> Vec<u8> {
    sign_quote(&sponsored_quote_message(&sponsored_quote()))
}

/// V2 ticket purchase fixtures. Keys are derived from public test labels and hold no value.
mod v2 {
    use ed25519_dalek::{Signer, SigningKey};
    use near_sdk::base64::Engine;
    use sha2::{Digest, Sha256};

    pub const CERTIFICATE: &str =
        "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    pub fn key(label: &str) -> SigningKey {
        SigningKey::from_bytes(&Sha256::digest(format!("youtick.market-v2.test.{label}")).into())
    }

    pub fn near_key(key: &SigningKey) -> String {
        format!(
            "ed25519:{}",
            near_sdk::bs58::encode(key.verifying_key().to_bytes()).into_string()
        )
    }

    pub fn ticket_id(key: &SigningKey) -> String {
        Sha256::digest(key.verifying_key().to_bytes())
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    pub fn sign(key: &SigningKey, lines: &[&str]) -> String {
        near_sdk::base64::engine::general_purpose::STANDARD
            .encode(key.sign(lines.join("\n").as_bytes()).to_bytes())
    }

    pub fn vat_public_key() -> String {
        near_key(&key("vat-signer"))
    }

    pub struct Purchase {
        pub msg: serde_json::Value,
        pub ticket_id: String,
    }

    /// A valid `buy_ticket_v2` message for `market.testnet` with 20% VAT included.
    pub fn purchase(
        publication_id: &str,
        ticket_label: &str,
        gross: u128,
        now_ms: u64,
    ) -> Purchase {
        let ticket = key(ticket_label);
        let session = near_key(&key(&format!("session-{ticket_label}")));
        let ticket_id = ticket_id(&ticket);
        let expires = (now_ms + 600_000).to_string();
        let vat = (gross / 6).to_string();
        let gross = gross.to_string();
        let device_signature = sign(
            &ticket,
            &[
                "youtick.market-v2.ticket-sig.v1",
                "testnet",
                "market.testnet",
                "purchase_device",
                &ticket_id,
                &expires,
                publication_id,
                &session,
                CERTIFICATE,
            ],
        );
        let vat_signature = sign(
            &key("vat-signer"),
            &[
                "youtick.market-v2.vat.v1",
                "testnet",
                "market.testnet",
                &ticket_id,
                publication_id,
                &gross,
                &vat,
                &expires,
                "1",
            ],
        );
        Purchase {
            msg: serde_json::json!({
                "action": "buy_ticket_v2",
                "publication_id": publication_id,
                "ticket_public_key": near_key(&ticket),
                "device": {
                    "session_public_key": session,
                    "certificate_sha256": CERTIFICATE,
                    "expires_at_ms": expires,
                    "signature": device_signature,
                },
                "vat": { "vat_usdc_micro": vat, "expires_at_ms": expires, "key_version": "1", "signature": vat_signature },
            }),
            ticket_id,
        }
    }
}

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}

const NOW_MS: u64 = 1_785_589_300_000;

thread_local! {
    // The protocol vectors are signed for their own contract ID; one test switches to it.
    static MARKET_ID: std::cell::RefCell<String> = std::cell::RefCell::new("market.testnet".to_string());
}

fn context(predecessor: &str) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder.current_account_id(account(&MARKET_ID.with(|id| id.borrow().clone())));
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
        quote_public_key: Base64VecU8(quote_public_key()),
        quote_key_version: 1,
        near_operational_reserve: U128(1_000_000_000_000_000_000_000_000),
        tax_account_id: account("tax.testnet"),
        vat_public_key: v2::vat_public_key(),
        vat_key_version: 1,
    })
}

fn start_public_beta(contract: &mut Contract) {
    testing_env!(context("guardian.testnet").build());
    contract.pause_new_purchases();
    testing_env!(context("admin.testnet").build());
    contract.start_public_testnet_beta();
    contract.request_new_purchases_unpause();
    contract.unpause_new_purchases();
}

fn public_upload_contract() -> (Contract, PaidJobRequest, SponsoredUploadQuote, Vec<u8>) {
    // The fixture's request and quote are re-priced to the V2 minimum and re-signed in-test.
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("public-upload-quote.json")).unwrap();
    let mut request: PaidJobRequest = serde_json::from_value(fixture["request"].clone()).unwrap();
    request.price_usdc = U128(5_000_000);
    let quote = bind_sponsored_quote(
        &request,
        serde_json::from_value(fixture["quote"].clone()).unwrap(),
    );
    let signature = sign_quote(&sponsored_quote_message(&quote));
    testing_env!(context("market.testnet").build());
    let contract = Contract::new_public_testnet(MarketInitConfig {
        platform_account_id: account("platform.testnet"),
        bridge_account_id: account("bridge.testnet"),
        takedown_authority_id: account("governance.testnet"),
        admin_account_id: account("admin.testnet"),
        guardian_account_id: account("guardian.testnet"),
        quote_public_key: Base64VecU8(quote_public_key()),
        quote_key_version: 1,
        near_operational_reserve: U128(1_000_000_000_000_000_000_000_000),
        tax_account_id: account("tax.testnet"),
        vat_public_key: v2::vat_public_key(),
        vat_key_version: 1,
    });
    (contract, request, quote, signature)
}

#[test]
fn public_upload_starts_closed_and_accepts_only_an_exact_signed_five_gb_job() {
    let (mut contract, request, quote, signature) = public_upload_contract();
    assert_eq!(contract.get_compact_upload_version(), 1);
    let policy = contract.get_public_upload_policy().unwrap();
    assert_eq!(policy.market_contract_id, account("market.testnet"));
    assert_eq!(policy.max_source_bytes, U128(5_000_000_000));
    assert_eq!(policy.job_ttl_ms, U64(86_400_000));
    assert!(policy.signed_quote_required);
    assert!(contract.get_governance_state().new_purchases_paused);
    assert!(contract.get_governance_state().bridge_frozen);
    assert!(contract.get_public_testnet_beta_state().is_none());
    testing_env!(context("admin.testnet").build());
    must_fail(|| {
        contract.start_public_testnet_beta();
    });
    testing_env!(context(TESTNET_USDC).build());
    assert!(matches!(
        contract.ft_on_transfer(
            request.creator_id.clone(),
            quote.total_fee_usdc,
            sponsored_message_with_signature(&request, quote.clone(), &signature)
        ),
        PromiseOrValue::Value(U128(1_600_000))
    ));
    assert!(contract.get_media_job(request.job_id.clone()).is_none());
    testing_env!(context("admin.testnet").build());
    contract.request_new_purchases_unpause();
    contract.unpause_new_purchases();
    testing_env!(context(TESTNET_USDC).build());
    let mut unsigned: serde_json::Value = serde_json::from_str(&sponsored_message_with_signature(
        &request,
        quote.clone(),
        &signature,
    ))
    .unwrap();
    unsigned.as_object_mut().unwrap().remove("sponsor_quote");
    unsigned
        .as_object_mut()
        .unwrap()
        .remove("sponsor_quote_signature");
    assert!(matches!(
        contract.ft_on_transfer(
            request.creator_id.clone(),
            U128(1_500_000),
            unsigned.to_string()
        ),
        PromiseOrValue::Value(U128(1_500_000))
    ));
    must_fail(|| {
        contract.create_paid_job(request.clone());
    });
    let mut forged = request.clone();
    forged.expected_source_bytes = U128(5_000_000_001);
    must_fail(|| {
        contract.ft_on_transfer(
            forged.creator_id.clone(),
            quote.total_fee_usdc,
            sponsored_message_with_signature(&forged, quote.clone(), &signature),
        );
    });
    assert!(contract.get_media_job(request.job_id.clone()).is_none());
    let message = sponsored_message_with_signature(&request, quote.clone(), &signature);
    assert!(matches!(
        contract.ft_on_transfer(
            request.creator_id.clone(),
            quote.total_fee_usdc,
            message.clone()
        ),
        PromiseOrValue::Value(U128(0))
    ));
    assert!(matches!(
        contract.ft_on_transfer(request.creator_id.clone(), quote.total_fee_usdc, message),
        PromiseOrValue::Value(U128(1_600_000))
    ));
    assert_eq!(contract.get_platform_balance(), U128(1_600_000));
    assert!(contract
        .get_public_testnet_beta_job(request.job_id.clone())
        .is_none());
    testing_env!(context("admin.testnet").build());
    contract.request_bridge_unfreeze();
    contract.unfreeze_bridge();
    testing_env!(context("bridge.testnet").build());
    let mut publication = submission(
        &request.job_id,
        1,
        "creator.testnet",
        ASSET_HASH,
        "public_playback",
    );
    publication.expected_source_bytes = request.expected_source_bytes;
    publication.verified_source_bytes = request.expected_source_bytes;
    publication.profile_config_sha256 = request.profile_config_sha256;
    contract.finalize_livepeer_publication(publication);
    let mut later = context("creator.testnet");
    later.block_timestamp((1_785_589_300_000 + 15 * 86_400_000) * 1_000_000);
    testing_env!(later.build());
    assert_eq!(
        contract.get_publication(request.job_id).unwrap().creator_id,
        request.creator_id
    );
}

#[test]
fn public_upload_key_and_finalize_cannot_extend_the_original_deadline() {
    let (mut contract, request, quote, signature) = public_upload_contract();
    testing_env!(context("admin.testnet").build());
    contract.request_new_purchases_unpause();
    contract.unpause_new_purchases();
    contract.request_bridge_unfreeze();
    contract.unfreeze_bridge();
    testing_env!(context(TESTNET_USDC).build());
    contract.ft_on_transfer(
        request.creator_id.clone(),
        quote.total_fee_usdc,
        sponsored_message_with_signature(&request, quote, &signature),
    );
    let job = contract.get_media_job(request.job_id.clone()).unwrap();
    let deadline = job.created_at_ms + 86_400_000;
    testing_env!(context("creator.testnet").build());
    must_fail(|| {
        contract.replace_upload_key(
            request.job_id.clone(),
            UPLOAD_KEY.to_string(),
            U64(deadline + 1),
        );
    });
    contract.replace_upload_key(
        request.job_id.clone(),
        UPLOAD_KEY.to_string(),
        U64(deadline),
    );
    must_fail(|| {
        contract.restart_paid_job(
            request.job_id.clone(),
            request.expected_source_bytes,
            request.profile_id.clone(),
            request.profile_config_sha256.clone(),
        );
    });
    let mut expired = context("bridge.testnet");
    expired.block_timestamp(deadline * 1_000_000);
    testing_env!(expired.build());
    let mut publication = submission(
        &request.job_id,
        1,
        "creator.testnet",
        ASSET_HASH,
        "public_playback",
    );
    publication.expected_source_bytes = request.expected_source_bytes;
    publication.verified_source_bytes = request.expected_source_bytes;
    publication.profile_config_sha256 = request.profile_config_sha256;
    must_fail(|| {
        contract.finalize_livepeer_publication(publication);
    });
    assert_eq!(
        contract
            .get_media_job(request.job_id)
            .unwrap()
            .created_at_ms,
        job.created_at_ms
    );
}

fn near_request() -> PaidJobRequest {
    PaidJobRequest {
        creator_id: account("creator.testnet"),
        job_id: "job-near".to_string(),
        title: "Paid video".to_string(),
        price_usdc: U128(5_000_000),
        expected_source_bytes: U128(1_000_000_000),
        profile_id: PROFILE.to_string(),
        profile_config_sha256: PROFILE_HASH.to_string(),
        upload_public_key: UPLOAD_KEY.to_string(),
        upload_key_expires_at_ms: U64(1_785_589_900_000),
    }
}

fn near_quote() -> CreatorFeeQuote {
    let mut quote = CreatorFeeQuote {
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
        quote_id: String::new(),
    };
    quote.quote_id = sha256_hex(near_quote_message(&quote).as_bytes());
    quote
}

fn sponsored_request() -> PaidJobRequest {
    PaidJobRequest {
        creator_id: account("creator.testnet"),
        job_id: "job-sponsored".to_string(),
        title: "Paid video".to_string(),
        price_usdc: U128(5_000_000),
        expected_source_bytes: U128(1_000_000_000),
        profile_id: PROFILE.to_string(),
        profile_config_sha256: PROFILE_HASH.to_string(),
        upload_public_key: UPLOAD_KEY.to_string(),
        upload_key_expires_at_ms: U64(1_785_589_900_000),
    }
}

fn sponsored_quote() -> SponsoredUploadQuote {
    let quote = SponsoredUploadQuote {
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
        quote_id: String::new(),
    };
    bind_sponsored_quote(&sponsored_request(), quote)
}

fn sponsored_message(request: &PaidJobRequest, quote: SponsoredUploadQuote) -> String {
    sponsored_message_with_signature(request, quote, &sponsor_quote_signature())
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
        Base64VecU8(near_quote_signature()),
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
    testing_env!(context("guardian.testnet").build());
    contract.pause_new_purchases();
    let mut replay_context = context("creator.testnet");
    replay_context.attached_deposit(near_sdk::NearToken::from_yoctonear(
        100_000_000_000_000_000_000_000,
    ));
    testing_env!(replay_context.build());
    assert!(matches!(
        contract.create_paid_job_near(
            near_request(),
            near_quote(),
            Base64VecU8(near_quote_signature()),
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
        contract.create_paid_job_near(near_request(), quote, Base64VecU8(near_quote_signature()));
    });
    assert_eq!(contract.get_platform_near_balance(), U128(0));
}

#[test]
fn sponsored_usdc_quote_charges_one_total_and_refunds_exact_replay() {
    let mut contract = contract();
    let request = sponsored_request();
    let message = sponsored_message(&request, sponsored_quote());
    let mut valid_context = context(TESTNET_USDC);
    valid_context.block_height(1_200);
    testing_env!(valid_context.build());

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
        Some(sponsored_quote().quote_id.as_str())
    );

    let replay =
        contract.ft_on_transfer(account("creator.testnet"), U128(600_000), message.clone());
    assert!(matches!(replay, PromiseOrValue::Value(U128(600_000))));
    assert_eq!(contract.get_platform_balance(), U128(600_000));
    assert_eq!(
        contract.get_media_job("job-sponsored".to_string()).unwrap(),
        job
    );

    let mut pause_context = context("guardian.testnet");
    pause_context.block_height(1_200);
    testing_env!(pause_context.build());
    contract.pause_new_purchases();
    let mut replay_context = context(TESTNET_USDC);
    replay_context.block_height(1_200);
    testing_env!(replay_context.build());
    let paused_replay = contract.ft_on_transfer(account("creator.testnet"), U128(600_000), message);
    assert!(matches!(
        paused_replay,
        PromiseOrValue::Value(U128(600_000))
    ));
    assert_eq!(contract.get_platform_balance(), U128(600_000));
    assert_eq!(
        contract.get_media_job("job-sponsored".to_string()).unwrap(),
        job
    );
}

#[test]
fn public_beta_uses_raw_state_and_requires_exact_sponsored_job() {
    let mut contract = contract();
    let serialized_before = near_sdk::borsh::to_vec(&contract).unwrap();
    testing_env!(context("attacker.testnet").build());
    must_fail(|| {
        contract.start_public_testnet_beta();
    });
    testing_env!(context("guardian.testnet").build());
    contract.pause_new_purchases();
    testing_env!(context("admin.testnet").build());
    let state = contract.start_public_testnet_beta();
    assert_eq!(state.started_at_ms, U64(1_785_589_300_000));
    assert_eq!(state.upload_closes_at_ms, U64(1_786_712_500_000));
    assert_eq!(state.ends_at_ms, U64(1_786_798_900_000));
    assert_eq!(
        near_sdk::borsh::to_vec(&contract).unwrap(),
        serialized_before
    );
    contract.request_new_purchases_unpause();
    contract.unpause_new_purchases();

    testing_env!(context(TESTNET_USDC).build());
    let request = sponsored_request();
    let quote_less = near_sdk::serde_json::json!({
        "action": "create_paid_job",
        "job_id": request.job_id,
        "title": request.title,
        "price_usdc": request.price_usdc,
        "expected_source_bytes": request.expected_source_bytes,
        "profile_id": request.profile_id,
        "profile_config_sha256": request.profile_config_sha256,
        "upload_public_key": request.upload_public_key,
        "upload_key_expires_at_ms": request.upload_key_expires_at_ms,
    })
    .to_string();
    assert!(matches!(
        contract.ft_on_transfer(account("creator.testnet"), U128(500_000), quote_less),
        PromiseOrValue::Value(U128(500_000))
    ));

    let mut valid_context = context(TESTNET_USDC);
    valid_context.block_height(1_200);
    testing_env!(valid_context.build());
    assert!(matches!(
        contract.ft_on_transfer(
            account("creator.testnet"),
            U128(600_000),
            sponsored_message(&request, sponsored_quote()),
        ),
        PromiseOrValue::Value(U128(0))
    ));
    let marker = contract
        .get_public_testnet_beta_job("job-sponsored".to_string())
        .unwrap();
    assert_eq!(marker.creator_id, account("creator.testnet"));
    assert_eq!(marker.generation, 1);
    assert_eq!(marker.deadline_at_ms, U64(1_785_675_700_000));
    assert!(contract.has_public_testnet_beta_job_today(account("creator.testnet")));
    assert_eq!(
        contract
            .get_public_testnet_beta_state()
            .unwrap()
            .total_job_count,
        1
    );

    testing_env!(context("creator.testnet").build());
    must_fail(|| {
        contract.restart_paid_job(
            "job-sponsored".to_string(),
            U128(1_000_000_000),
            PROFILE.to_string(),
            PROFILE_HASH.to_string(),
        );
    });
    testing_env!(context("guardian.testnet").build());
    let closed = contract.close_public_testnet_beta();
    assert_eq!(closed.closed_at_ms, Some(U64(1_785_589_300_000)));
    assert!(contract.get_governance_state().new_purchases_paused);
    assert!(get_logs()
        .last()
        .map(String::as_str)
        .unwrap()
        .contains("public_testnet_beta_closed"));
}

#[test]
fn public_beta_rejects_native_upload_and_expired_finalize() {
    let mut contract = contract();
    start_public_beta(&mut contract);

    let mut near_context = context("creator.testnet");
    near_context.attached_deposit(near_sdk::NearToken::from_yoctonear(
        100_000_000_000_000_000_000_000,
    ));
    testing_env!(near_context.build());
    must_fail(|| {
        contract.create_paid_job_near(
            near_request(),
            near_quote(),
            Base64VecU8(near_quote_signature()),
        );
    });

    let request = sponsored_request();
    let mut valid_context = context(TESTNET_USDC);
    valid_context.block_height(1_200);
    testing_env!(valid_context.build());
    contract.ft_on_transfer(
        account("creator.testnet"),
        U128(600_000),
        sponsored_message(&request, sponsored_quote()),
    );
    let mut expired = context("bridge.testnet");
    expired.block_timestamp(1_785_675_700_001_000_000);
    testing_env!(expired.build());
    must_fail(|| {
        contract.finalize_livepeer_publication(submission(
            "job-sponsored",
            1,
            "creator.testnet",
            ASSET_HASH,
            "playback_expired",
        ));
    });
    let mut ended = context(TESTNET_USDC);
    ended.block_timestamp(1_786_798_900_000_000_000);
    testing_env!(ended.build());
    assert!(matches!(
        contract.ft_on_transfer(
            account("buyer.testnet"),
            U128(5_000_000),
            v2::purchase("missing", "ended-beta", 5_000_000, 1_786_798_900_000)
                .msg
                .to_string(),
        ),
        PromiseOrValue::Value(U128(5_000_000))
    ));
}

#[test]
fn public_beta_operator_rejects_an_unmarked_legacy_job() {
    let mut contract = contract();
    create_job(&mut contract, "legacy-job", "creator.testnet");
    start_public_beta(&mut contract);
    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        contract.finalize_livepeer_publication(submission(
            "legacy-job",
            1,
            "creator.testnet",
            ASSET_HASH,
            "playback_legacy",
        ));
    });
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
    create_job_with(contract, job_id, creator, 5_000_000, 1_000_000);
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
            5_000_000,
            20_000_000_000,
        ),
        PromiseOrValue::Value(U128(0))
    ));
    must_fail(|| {
        create_job_with(
            &mut contract,
            "job-too-large",
            "creator.testnet",
            5_000_000,
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
            5_000_000,
            source_bytes,
        );
        assert!(matches!(first, PromiseOrValue::Value(U128(0))));
        assert_eq!(contract.get_platform_balance(), U128(expected_fee));
        let job_before_replay = contract.get_media_job(job_id.clone()).unwrap();

        let replay = create_job_with(
            &mut contract,
            &job_id,
            "creator.testnet",
            5_000_000,
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
            5_000_000,
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
            "price_usdc": "5000000",
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
    let mut message = v2::purchase("job-sender", "sender", 5_000_000, NOW_MS).msg;
    must_fail(|| {
        let mut extra = message.clone();
        extra["buyer_id"] = serde_json::json!("claimed-buyer.testnet");
        contract.ft_on_transfer(
            account("actual-buyer.testnet"),
            U128(5_000_000),
            extra.to_string(),
        );
    });
    let ticket_id = v2::ticket_id(&v2::key("sender"));
    let purchased = contract.ft_on_transfer(
        account("actual-buyer.testnet"),
        U128(5_000_000),
        std::mem::take(&mut message).to_string(),
    );
    assert!(matches!(purchased, PromiseOrValue::Value(U128(0))));
    let ticket = contract.get_ticket(ticket_id).unwrap();
    assert_eq!(ticket.creator_id, account("actual-creator.testnet"));
    // The buyer account is never part of the ticket.
    let stored = serde_json::to_string(&ticket).unwrap();
    assert!(!stored.contains("actual-buyer") && !stored.contains("claimed"));
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
fn ticket_minimum_is_five_usdc_and_the_whole_gross_stays_in_escrow() {
    let mut contract = contract();
    must_fail(|| {
        create_job_with(
            &mut contract,
            "job-too-cheap",
            "creator.testnet",
            4_999_999,
            1_000_000,
        );
    });
    create_job_with(
        &mut contract,
        "job-price",
        "creator.testnet",
        6_000_001,
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
    let platform_before = contract.get_platform_balance();

    testing_env!(context(TESTNET_USDC).build());
    let purchase = v2::purchase("job-price", "price", 6_000_001, NOW_MS);
    let result = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(6_000_001),
        purchase.msg.to_string(),
    );
    assert!(matches!(result, PromiseOrValue::Value(U128(0))));
    // gross 6,000,001; VAT 1,000,000; net 5,000,001; platform floor(net / 20) = 250,000.
    let ticket = contract.get_ticket(purchase.ticket_id).unwrap();
    assert_eq!(ticket.gross_usdc_micro, U128(6_000_001));
    assert_eq!(ticket.vat_usdc_micro, U128(1_000_000));
    assert_eq!(ticket.platform_usdc_micro, U128(250_000));
    assert_eq!(ticket.creator_usdc_micro, U128(4_750_001));
    assert_eq!(contract.get_escrow_balance(), U128(6_000_001));
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")),
        U128(0)
    );
    assert_eq!(contract.get_platform_balance(), platform_before);
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
) -> youtick_market_v2::Publication {
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
    let sale = v2::purchase("job-sale-event", "sale-event", 5_000_000, NOW_MS);
    assert!(matches!(
        contract.ft_on_transfer(
            account("buyer.testnet"),
            U128(5_000_000),
            sale.msg.to_string()
        ),
        PromiseOrValue::Value(U128(0))
    ));
    let purchased = governance_event();
    assert_eq!(purchased["standard"], "youtick_market");
    assert_eq!(purchased["version"], "2.0.0");
    assert_eq!(purchased["event"], "ticket_purchased");
    let data = &purchased["data"][0];
    assert_eq!(data["ticket_id"], sale.ticket_id);
    assert_eq!(data["publication_id"], "job-sale-event");
    assert_eq!(data["creator_id"], "creator.testnet");
    assert_eq!(data["rail"], "crypto");
    assert_eq!(data["asset"], TESTNET_USDC);
    assert_eq!(data["gross_usdc_micro"], "5000000");
    assert_eq!(data["vat_usdc_micro"], "833333");
    assert_eq!(data["net_usdc_micro"], "4166667");
    assert_eq!(data["platform_usdc_micro"], "208333");
    assert_eq!(data["creator_usdc_micro"], "3958334");
    assert_eq!(data["vat_key_version"], "1");
    assert_eq!(data["status"], "purchased");
    assert!(!purchased.to_string().contains("buyer.testnet"));

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
    contract.request_bridge_unfreeze();
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
    let existing = v2::purchase("job-purchase-pause", "existing", 5_000_000, NOW_MS);
    assert!(matches!(
        contract.ft_on_transfer(
            account("existing-buyer.testnet"),
            U128(5_000_000),
            existing.msg.to_string(),
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
    assert!(contract.get_ticket(existing.ticket_id.clone()).is_some());
    testing_env!(context("guardian.testnet").build());
    contract.pause_new_purchases();
    assert!(get_logs().is_empty());

    testing_env!(context(TESTNET_USDC).build());
    let platform_before = contract.get_platform_balance();
    let creator_before = contract.get_creator_balance(account("creator.testnet"));
    let paused_purchase = v2::purchase("job-purchase-pause", "paused", 5_000_000, NOW_MS);
    let refunded = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(5_000_000),
        paused_purchase.msg.to_string(),
    );
    assert!(matches!(refunded, PromiseOrValue::Value(U128(5_000_000))));
    assert_eq!(contract.get_platform_balance(), platform_before);
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")),
        creator_before
    );
    assert_eq!(contract.get_escrow_balance(), U128(5_000_000));
    assert!(contract
        .get_ticket(paused_purchase.ticket_id.clone())
        .is_none());

    testing_env!(context("guardian.testnet").build());
    must_fail(|| contract.unpause_new_purchases());
    let serialized_state_before_unpause = near_sdk::borsh::to_vec(&contract).unwrap();
    testing_env!(context("admin.testnet").build());
    contract.request_new_purchases_unpause();
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
        U128(5_000_000),
        paused_purchase.msg.to_string(),
    );
    assert!(matches!(accepted, PromiseOrValue::Value(U128(0))));
    assert!(contract.get_ticket(paused_purchase.ticket_id).is_some());
}

#[test]
fn purchase_pause_blocks_new_paid_jobs_and_preserves_exact_replays() {
    let mut contract = contract();
    assert!(matches!(
        create_job_with(
            &mut contract,
            "job-existing-usdc",
            "creator.testnet",
            5_000_000,
            1_000_000,
        ),
        PromiseOrValue::Value(U128(0))
    ));

    testing_env!(context("guardian.testnet").build());
    contract.pause_new_purchases();
    let platform_usdc_before = contract.get_platform_balance();

    assert!(matches!(
        create_job_with(
            &mut contract,
            "job-existing-usdc",
            "creator.testnet",
            5_000_000,
            1_000_000,
        ),
        PromiseOrValue::Value(U128(500_000))
    ));
    assert_eq!(contract.get_platform_balance(), platform_usdc_before);
    must_fail(|| {
        create_job_with(
            &mut contract,
            "job-existing-usdc",
            "creator.testnet",
            2_000_001,
            1_000_000,
        );
    });

    assert!(matches!(
        create_job_with(
            &mut contract,
            "job-paused-usdc",
            "creator.testnet",
            5_000_000,
            1_000_000,
        ),
        PromiseOrValue::Value(U128(500_000))
    ));
    assert!(contract
        .get_media_job("job-paused-usdc".to_string())
        .is_none());

    let sponsored_request = sponsored_request();
    testing_env!(context(TESTNET_USDC).build());
    assert!(matches!(
        contract.ft_on_transfer(
            account("creator.testnet"),
            U128(600_000),
            sponsored_message(&sponsored_request, sponsored_quote()),
        ),
        PromiseOrValue::Value(U128(600_000))
    ));
    assert!(contract
        .get_media_job("job-sponsored".to_string())
        .is_none());
    assert_eq!(contract.get_platform_balance(), platform_usdc_before);
    testing_env!(context(TESTNET_USDC).build());
    must_fail(|| {
        contract.ft_on_transfer(
            account("creator.testnet"),
            U128(599_999),
            sponsored_message(&sponsored_request, sponsored_quote()),
        );
    });
    assert_eq!(contract.get_platform_balance(), platform_usdc_before);

    testing_env!(context(TESTNET_USDC).build());
    must_fail(|| {
        contract.create_paid_job(near_request());
    });

    testing_env!(context("admin.testnet").build());
    contract.request_new_purchases_unpause();
    contract.unpause_new_purchases();
    assert!(matches!(
        create_job_with(
            &mut contract,
            "job-after-unpause",
            "creator.testnet",
            5_000_000,
            1_000_000,
        ),
        PromiseOrValue::Value(U128(0))
    ));
    assert!(contract
        .get_media_job("job-after-unpause".to_string())
        .is_some());
}

#[test]
fn purchase_pause_blocks_a_new_native_paid_job() {
    let mut contract = contract();
    testing_env!(context("guardian.testnet").build());
    contract.pause_new_purchases();

    let mut near_context = context("creator.testnet");
    near_context.attached_deposit(near_sdk::NearToken::from_yoctonear(
        100_000_000_000_000_000_000_000,
    ));
    testing_env!(near_context.build());
    must_fail(|| {
        contract.create_paid_job_near(
            near_request(),
            near_quote(),
            Base64VecU8(near_quote_signature()),
        );
    });
    assert!(contract.get_media_job("job-near".to_string()).is_none());
    assert_eq!(contract.get_platform_near_balance(), U128(0));
}

#[test]
fn admin_rotates_bridge_through_auditable_pending_state() {
    let mut contract = contract();
    create_job(&mut contract, "job-rotation", "creator.testnet");
    let initial = contract.get_governance_state();
    assert_eq!(initial.state_version, 3);
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
            quote_public_key: Base64VecU8(quote_public_key()),
            quote_key_version: 1,
            near_operational_reserve: U128(1_000_000_000_000_000_000_000_000),
            tax_account_id: account("tax.testnet"),
            vat_public_key: v2::vat_public_key(),
            vat_key_version: 1,
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
    assert_eq!(first.creator_id, account("creator.testnet"));

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
    // The amount must equal the publication price; the attestation for another amount is
    // rejected before any signature check.
    let wrong = v2::purchase("job-1", "wrong-amount", 5_000_001, NOW_MS);
    let wrong_amount = contract.ft_on_transfer(
        account("wrong-amount.testnet"),
        U128(5_000_001),
        wrong.msg.to_string(),
    );
    assert!(matches!(
        wrong_amount,
        PromiseOrValue::Value(U128(5_000_001))
    ));
    assert_eq!(contract.get_platform_balance(), upload_balance);
    assert_eq!(contract.get_escrow_balance(), U128(0));
    assert!(contract.get_ticket(wrong.ticket_id).is_none());

    let first = v2::purchase("job-1", "first", 5_000_000, NOW_MS);
    let accepted = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(5_000_000),
        first.msg.to_string(),
    );
    assert!(matches!(accepted, PromiseOrValue::Value(U128(0))));
    let stored = contract.get_ticket(first.ticket_id.clone()).unwrap();

    // A reused ticket key returns the full amount and leaves the ticket and escrow unchanged.
    let duplicate = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(5_000_000),
        first.msg.to_string(),
    );
    assert!(matches!(duplicate, PromiseOrValue::Value(U128(5_000_000))));
    assert_eq!(
        contract.get_ticket(first.ticket_id.clone()).unwrap(),
        stored
    );
    assert_eq!(contract.get_escrow_balance(), U128(5_000_000));
    assert_eq!(contract.get_platform_balance(), upload_balance);

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
    let second = v2::purchase("job-1", "second", 5_000_000, NOW_MS);
    let refunded = contract.ft_on_transfer(
        account("second-buyer.testnet"),
        U128(5_000_000),
        second.msg.to_string(),
    );
    assert!(matches!(refunded, PromiseOrValue::Value(U128(5_000_000))));
    assert_eq!(contract.get_escrow_balance(), U128(5_000_000));
    assert!(contract.get_ticket(first.ticket_id).is_some());
    assert!(contract.get_ticket(second.ticket_id).is_none());
}

#[test]
fn governance_takedown_is_one_way_and_preserves_ticket_history() {
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
    let bought = v2::purchase("job-takedown", "takedown", 5_000_000, NOW_MS);
    let accepted = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(5_000_000),
        bought.msg.to_string(),
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
    let late = v2::purchase("job-takedown", "late", 5_000_000, NOW_MS);
    let refunded = contract.ft_on_transfer(
        account("second-buyer.testnet"),
        U128(5_000_000),
        late.msg.to_string(),
    );
    assert!(matches!(refunded, PromiseOrValue::Value(U128(5_000_000))));
    // Takedown keeps the ticket record (and its escrow) for the later refund rules (E3b).
    assert!(contract.get_ticket(bought.ticket_id).is_some());
    assert!(contract.get_ticket(late.ticket_id).is_none());
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

const DEVICE_DAY_MS: u64 = 86_400_000;
const DEVICE_START_MS: u64 = 1_785_589_300_000;

fn device_key(index: u8) -> String {
    String::from(
        &near_sdk::PublicKey::from_parts(near_sdk::CurveType::ED25519, vec![index; 32]).unwrap(),
    )
}

fn device_authorization(index: u8) -> serde_json::Value {
    serde_json::json!({
        "session_public_key": device_key(index),
        "certificate_sha256": format!("{index:064x}"),
        "authorization_duration_ms": "2592000000"
    })
}

fn device_context(day: u64, delegated: bool) {
    let mut ctx = context(TESTNET_USDC);
    ctx.block_timestamp((DEVICE_START_MS + day * DEVICE_DAY_MS) * 1_000_000)
        .signer_account_id(account(if delegated {
            "relayer.testnet"
        } else {
            "buyer.testnet"
        }))
        .signer_account_pk(UPLOAD_KEY.parse().unwrap());
    testing_env!(ctx.build());
}

fn device_sale_contract() -> Contract {
    let mut market = contract();
    for index in 0..7 {
        let job = format!("device-job-{index}");
        create_job(&mut market, &job, "creator.testnet");
        finalize(
            &mut market,
            &job,
            1,
            "creator.testnet",
            &format!("{:064x}", index + 1),
            &format!("device_video_{index}"),
        );
    }
    market
}

fn activate_device(market: &mut Contract, user: &str, device: u8, day: u64, signer_key: &str) {
    let mut ctx = context(user);
    ctx.signer_account_id(account(user))
        .signer_account_pk(signer_key.parse().unwrap())
        .attached_deposit(near_sdk::NearToken::from_yoctonear(1))
        .block_timestamp((DEVICE_START_MS + day * DEVICE_DAY_MS) * 1_000_000);
    testing_env!(ctx.build());
    market.activate_playback_device(
        "device-job-0".to_string(),
        serde_json::from_value(device_authorization(device)).unwrap(),
    );
}

#[test]
fn creator_device_activation_is_idempotent_but_recovers_changed_keys() {
    let mut market = device_sale_contract();
    let balances = (
        market.get_platform_balance(),
        market.get_creator_balance(account("creator.testnet")),
        market.get_publications_count(),
    );
    activate_device(&mut market, "creator.testnet", 2, 1, UPLOAD_KEY);
    let first = market
        .get_playback_device(account("creator.testnet"), device_key(2))
        .unwrap();
    activate_device(&mut market, "creator.testnet", 2, 20, UPLOAD_KEY);
    assert_eq!(
        market.get_playback_device(account("creator.testnet"), device_key(2)),
        Some(first)
    );
    activate_device(&mut market, "creator.testnet", 2, 21, &device_key(9));
    let recovered = market
        .get_playback_device(account("creator.testnet"), device_key(2))
        .unwrap();
    assert_eq!(recovered.authorizing_public_key, Some(device_key(9)));
    assert_eq!(
        recovered.expires_at_ms.0,
        DEVICE_START_MS + 51 * DEVICE_DAY_MS
    );
    activate_device(&mut market, "creator.testnet", 2, 52, &device_key(9));
    assert_eq!(
        market
            .get_playback_device(account("creator.testnet"), device_key(2))
            .unwrap()
            .expires_at_ms
            .0,
        DEVICE_START_MS + 82 * DEVICE_DAY_MS
    );
    assert_eq!(
        balances,
        (
            market.get_platform_balance(),
            market.get_creator_balance(account("creator.testnet")),
            market.get_publications_count()
        )
    );
    // A viewer without the creator role cannot use account devices in V2.
    must_fail(|| activate_device(&mut market, "buyer.testnet", 3, 53, UPLOAD_KEY));
}

#[test]
fn creator_device_activation_keeps_three_devices_during_suspended_sales() {
    let mut market = device_sale_contract();
    activate_device(&mut market, "creator.testnet", 1, 0, UPLOAD_KEY);
    testing_env!(context("bridge.testnet").build());
    market.suspend_livepeer_sales("device-job-0".to_string());
    testing_env!(context("guardian.testnet").build());
    market.pause_new_purchases();
    for device in 2..=4 {
        activate_device(
            &mut market,
            "creator.testnet",
            device,
            u64::from(device),
            UPLOAD_KEY,
        );
    }
    assert!(market
        .get_playback_device(account("creator.testnet"), device_key(1))
        .is_none());
    for device in 2..=4 {
        assert!(market
            .get_playback_device(account("creator.testnet"), device_key(device))
            .is_some());
    }
}

#[test]
fn creator_device_activation_rejects_wrong_authority_deposit_or_certificate() {
    let mut market = device_sale_contract();
    for problem in [
        "stranger",
        "relay",
        "zero deposit",
        "extra deposit",
        "duration",
        "key",
        "hash",
    ] {
        let user = if problem == "stranger" {
            "stranger.testnet"
        } else {
            "creator.testnet"
        };
        let mut ctx = context(if problem == "relay" {
            "relayer.testnet"
        } else {
            user
        });
        ctx.signer_account_id(account(user))
            .signer_account_pk(UPLOAD_KEY.parse().unwrap())
            .attached_deposit(near_sdk::NearToken::from_yoctonear(match problem {
                "zero deposit" => 0,
                "extra deposit" => 2,
                _ => 1,
            }));
        testing_env!(ctx.build());
        let mut auth = device_authorization(2);
        if problem == "duration" {
            auth["authorization_duration_ms"] = "1".into();
        }
        if problem == "key" {
            auth["session_public_key"] = "invalid".into();
        }
        if problem == "hash" {
            auth["certificate_sha256"] = "invalid".into();
        }
        must_fail(|| {
            market.activate_playback_device(
                "device-job-0".to_string(),
                serde_json::from_value(auth).unwrap(),
            )
        });
        assert!(market
            .get_playback_device(account(user), device_key(2))
            .is_none());
    }
    testing_env!(context("guardian.testnet").build());
    market.freeze_bridge();
    must_fail(|| activate_device(&mut market, "creator.testnet", 2, 1, UPLOAD_KEY));
    assert!(market
        .get_playback_device(account("creator.testnet"), device_key(2))
        .is_none());
    testing_env!(context("admin.testnet").build());
    market.request_bridge_unfreeze();
    market.unfreeze_bridge();
    testing_env!(context("governance.testnet").build());
    market.takedown_livepeer_publication(
        "device-job-0".to_string(),
        "GOVERNANCE_DECISION".to_string(),
        "incident-device".to_string(),
        FINGERPRINT.to_string(),
        U64(DEVICE_START_MS),
    );
    must_fail(|| activate_device(&mut market, "creator.testnet", 2, 1, UPLOAD_KEY));
}

#[test]
fn creator_device_activation_preserves_the_storage_runway_guard() {
    let mut market = device_sale_contract();
    let mut ctx = context("creator.testnet");
    ctx.signer_account_id(account("creator.testnet"))
        .signer_account_pk(UPLOAD_KEY.parse().unwrap())
        .attached_deposit(near_sdk::NearToken::from_yoctonear(1))
        .account_balance(near_sdk::NearToken::from_yoctonear(1));
    testing_env!(ctx.build());
    must_fail(|| {
        market.activate_playback_device(
            "device-job-0".to_string(),
            serde_json::from_value(device_authorization(2)).unwrap(),
        )
    });
    // The mock host does not roll back writes on panic; on-chain atomic rollback is not claimed here.
}

#[test]
fn full_hd_switch_preserves_defaults_and_roundtrips_only_profiles() {
    let (mut market, _, _, _) = public_upload_contract();
    let before = market.get_public_upload_policy().unwrap();
    assert_eq!(before.profiles.len(), 2);
    testing_env!(context("admin.testnet").build());
    assert_eq!(market.set_public_upload_full_hd(false), before);
    let enabled = market.set_public_upload_full_hd(true);
    assert_eq!(enabled.profiles.len(), 3);
    assert_eq!(&enabled.profiles[1..], before.profiles.as_slice());
    let registry: serde_json::Value = serde_json::from_str(include_str!(
        "../../../protocol/paid-media-livepeer-v1/profiles.json"
    ))
    .unwrap();
    assert_eq!(
        enabled.profiles[0].profile_config_sha256,
        registry["fullHd"]["hash"].as_str().unwrap()
    );
    assert_eq!(market.set_public_upload_full_hd(true), enabled);
    let mut expected = before.clone();
    expected.profiles = enabled.profiles;
    assert_eq!(market.get_public_upload_policy().unwrap(), expected);
    assert_eq!(market.set_public_upload_full_hd(false), before);
}

#[test]
fn full_hd_switch_requires_admin_and_both_maintenance_controls() {
    let (mut market, _, _, _) = public_upload_contract();
    let before = market.get_public_upload_policy();
    let mut mainnet = context("admin.testnet");
    mainnet.current_account_id(account("market.near"));
    testing_env!(mainnet.build());
    must_fail(|| {
        market.set_public_upload_full_hd(true);
    });
    assert_eq!(market.get_public_upload_policy(), before);
    for actor in ["creator.testnet", "guardian.testnet", "bridge.testnet"] {
        testing_env!(context(actor).build());
        must_fail(|| {
            market.set_public_upload_full_hd(true);
        });
        assert_eq!(market.get_public_upload_policy(), before);
    }
    testing_env!(context("admin.testnet").build());
    market.request_bridge_unfreeze();
    market.unfreeze_bridge();
    must_fail(|| {
        market.set_public_upload_full_hd(true);
    });
    testing_env!(context("guardian.testnet").build());
    market.freeze_bridge();
    testing_env!(context("admin.testnet").build());
    market.request_new_purchases_unpause();
    market.unpause_new_purchases();
    must_fail(|| {
        market.set_public_upload_full_hd(true);
    });
    assert_eq!(market.get_public_upload_policy(), before);
}

#[test]
fn ticket_purchase_binds_the_signed_device_to_the_ticket_not_the_account() {
    let mut market = device_sale_contract();
    let mut ctx = context(TESTNET_USDC);
    ctx.signer_account_id(account("buyer.testnet"))
        .signer_account_pk(UPLOAD_KEY.parse().unwrap());
    testing_env!(ctx.build());
    let purchase = v2::purchase("device-job-0", "device", 5_000_000, NOW_MS);
    assert!(matches!(
        market.ft_on_transfer(
            account("buyer.testnet"),
            U128(5_000_000),
            purchase.msg.to_string()
        ),
        PromiseOrValue::Value(U128(0))
    ));
    let ticket = market.get_ticket(purchase.ticket_id).unwrap();
    assert_eq!(ticket.devices.len(), 1);
    assert_eq!(
        ticket.devices[0].session_public_key,
        purchase.msg["device"]["session_public_key"]
            .as_str()
            .unwrap()
    );
    assert_eq!(ticket.devices[0].certificate_sha256, v2::CERTIFICATE);
    assert_eq!(
        ticket.devices[0].expires_at_ms.0,
        NOW_MS + 30 * DEVICE_DAY_MS
    );
    assert_eq!(ticket.device_epoch, 0);
    // No account device is created for the buyer.
    assert!(market
        .get_playback_device(
            account("buyer.testnet"),
            purchase.msg["device"]["session_public_key"]
                .as_str()
                .unwrap()
                .to_string()
        )
        .is_none());
}

#[test]
fn malformed_or_unsigned_ticket_purchases_fail_without_escrow_or_ticket() {
    let mut market = device_sale_contract();
    testing_env!(context(TESTNET_USDC).build());
    let base = v2::purchase("device-job-0", "malformed", 5_000_000, NOW_MS);
    let other_signature = v2::purchase("device-job-0", "other", 5_000_000, NOW_MS).msg;
    type Mutation = Box<dyn Fn(&mut serde_json::Value)>;
    let mutations: Vec<(&str, Mutation)> = vec![
        (
            "unknown field",
            Box::new(|m| m["buyer_id"] = "buyer.testnet".into()),
        ),
        (
            "non-canonical key",
            Box::new(|m| {
                let key = m["ticket_public_key"]
                    .as_str()
                    .unwrap()
                    .replace("ed25519:", "ed25519:1");
                m["ticket_public_key"] = key.into();
            }),
        ),
        (
            "bad certificate",
            Box::new(|m| m["device"]["certificate_sha256"] = "EE".repeat(32).into()),
        ),
        (
            "expired",
            Box::new(|m| m["device"]["expires_at_ms"] = NOW_MS.to_string().into()),
        ),
        (
            "too far ahead",
            Box::new(|m| m["vat"]["expires_at_ms"] = (NOW_MS + 3_600_001).to_string().into()),
        ),
        (
            "leading zero",
            Box::new(|m| {
                let vat = format!("0{}", m["vat"]["vat_usdc_micro"].as_str().unwrap());
                m["vat"]["vat_usdc_micro"] = vat.into();
            }),
        ),
        ("foreign device signature", {
            let signature = other_signature["device"]["signature"].clone();
            Box::new(move |m| m["device"]["signature"] = signature.clone())
        }),
        ("foreign VAT signature", {
            let signature = other_signature["vat"]["signature"].clone();
            Box::new(move |m| m["vat"]["signature"] = signature.clone())
        }),
        (
            "changed VAT amount",
            Box::new(|m| m["vat"]["vat_usdc_micro"] = "0".into()),
        ),
        (
            "unknown VAT key",
            Box::new(|m| m["vat"]["key_version"] = "2".into()),
        ),
        (
            "changed session key",
            Box::new(|m| {
                m["device"]["session_public_key"] = v2::near_key(&v2::key("intruder")).into();
            }),
        ),
    ];
    for (problem, mutate) in mutations {
        let mut message = base.msg.clone();
        mutate(&mut message);
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            market.ft_on_transfer(
                account("buyer.testnet"),
                U128(5_000_000),
                message.to_string(),
            )
        }));
        assert!(outcome.is_err(), "{problem} must fail");
        assert_eq!(market.get_escrow_balance(), U128(0), "{problem}");
        assert!(
            market.get_ticket(base.ticket_id.clone()).is_none(),
            "{problem}"
        );
    }
    // The untouched message still succeeds.
    assert!(matches!(
        market.ft_on_transfer(
            account("buyer.testnet"),
            U128(5_000_000),
            base.msg.to_string()
        ),
        PromiseOrValue::Value(U128(0))
    ));
}

#[test]
fn vat_above_the_inclusive_cap_and_revoked_keys_are_rejected() {
    let mut market = device_sale_contract();
    testing_env!(context(TESTNET_USDC).build());
    // 27% inclusive of 5 USDC is floor(5_000_000 * 2700 / 12700) = 1_062_992.
    for (vat, allowed) in [("1062992", true), ("1062993", false)] {
        let mut purchase = v2::purchase("device-job-1", &format!("vat-{vat}"), 5_000_000, NOW_MS);
        let expires = purchase.msg["vat"]["expires_at_ms"]
            .as_str()
            .unwrap()
            .to_string();
        let lines = [
            "youtick.market-v2.vat.v1",
            "testnet",
            "market.testnet",
            &purchase.ticket_id,
            "device-job-1",
            "5000000",
            vat,
            &expires,
            "1",
        ];
        purchase.msg["vat"]["vat_usdc_micro"] = vat.into();
        purchase.msg["vat"]["signature"] = v2::sign(&v2::key("vat-signer"), &lines).into();
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            market.ft_on_transfer(
                account("buyer.testnet"),
                U128(5_000_000),
                purchase.msg.to_string(),
            )
        }));
        assert_eq!(outcome.is_ok(), allowed, "VAT {vat}");
    }

    testing_env!(context("attacker.testnet").build());
    must_fail(|| market.revoke_vat_key(1));
    testing_env!(context("guardian.testnet").build());
    market.revoke_vat_key(1);
    assert!(market.get_vat_public_key(1).is_none());
    testing_env!(context(TESTNET_USDC).build());
    let after = v2::purchase("device-job-2", "after-revoke", 5_000_000, NOW_MS);
    must_fail(|| {
        market.ft_on_transfer(
            account("buyer.testnet"),
            U128(5_000_000),
            after.msg.to_string(),
        );
    });
}

#[test]
fn sponsored_upload_authorizes_creator_device_without_using_relayer_key() {
    let (mut market, request, quote, signature) = public_upload_contract();
    testing_env!(context("admin.testnet").build());
    market.request_new_purchases_unpause();
    market.unpause_new_purchases();
    let mut message: serde_json::Value = serde_json::from_str(&sponsored_message_with_signature(
        &request,
        quote.clone(),
        &signature,
    ))
    .unwrap();
    message["playback_session"] = device_authorization(1);
    device_context(0, true);
    assert!(matches!(
        market.ft_on_transfer(
            request.creator_id.clone(),
            quote.total_fee_usdc,
            message.to_string()
        ),
        PromiseOrValue::Value(U128(0))
    ));
    let first = market
        .get_playback_device(request.creator_id.clone(), device_key(1))
        .unwrap();
    assert_eq!(first.authorizing_public_key, None);
    assert_eq!(first.expires_at_ms.0, DEVICE_START_MS + 30 * DEVICE_DAY_MS);
    // Exact relay reconciliation refunds and cannot start a fresh 30-day period.
    assert!(matches!(
        market.ft_on_transfer(
            request.creator_id.clone(),
            quote.total_fee_usdc,
            message.to_string()
        ),
        PromiseOrValue::Value(U128(1_600_000))
    ));
    assert_eq!(
        market.get_playback_device(request.creator_id, device_key(1)),
        Some(first)
    );
}

#[test]
fn compact_upload_cross_language_vectors_preserve_payment_and_device() {
    let vectors: serde_json::Value = serde_json::from_str(include_str!(
        "../../../protocol/paid-media-livepeer-v1/compact-upload-vectors.json"
    ))
    .unwrap();
    for vector in vectors.as_array().unwrap() {
        near_sdk::mock::with_mocked_blockchain(|blockchain| {
            blockchain.take_storage();
        });
        testing_env!(context("market.testnet").build());
        let mut market = Contract::new_public_testnet(MarketInitConfig {
            platform_account_id: account("platform.testnet"),
            bridge_account_id: account("bridge.testnet"),
            takedown_authority_id: account("governance.testnet"),
            admin_account_id: account("admin.testnet"),
            guardian_account_id: account("guardian.testnet"),
            quote_public_key: serde_json::from_value(vector["public_key"].clone()).unwrap(),
            quote_key_version: 1,
            near_operational_reserve: U128(1_000_000_000_000_000_000_000_000),
            tax_account_id: account("tax.testnet"),
            vat_public_key: v2::vat_public_key(),
            vat_key_version: 1,
        });
        testing_env!(context("admin.testnet").build());
        market.request_new_purchases_unpause();
        market.unpause_new_purchases();
        let request: PaidJobRequest = serde_json::from_value(vector["request"].clone()).unwrap();
        let quote: SponsoredUploadQuote = serde_json::from_value(vector["quote"].clone()).unwrap();
        let message = vector["compact_message"].as_str().unwrap().to_string();
        let device = vector["normal_message"]["playback_session"]["session_public_key"]
            .as_str()
            .unwrap()
            .to_string();
        let mut ctx = context(TESTNET_USDC);
        ctx.signer_account_id(account("relayer.testnet"));
        testing_env!(ctx.build());
        for bad in [
            format!("{}!", message),
            message.replace("yt:u1:", "yt:u2:"),
            message[..message.len() - 4].to_string(),
        ] {
            must_fail(|| {
                market.ft_on_transfer(request.creator_id.clone(), quote.total_fee_usdc, bad);
            });
        }
        must_fail(|| {
            market.ft_on_transfer(
                account("wrong.testnet"),
                quote.total_fee_usdc,
                message.clone(),
            );
        });
        must_fail(|| {
            market.ft_on_transfer(request.creator_id.clone(), U128(1), message.clone());
        });
        assert_eq!(market.get_platform_balance(), U128(0));
        assert!(matches!(
            market.ft_on_transfer(
                request.creator_id.clone(),
                quote.total_fee_usdc,
                message.clone()
            ),
            PromiseOrValue::Value(U128(0))
        ));
        let job = market.get_media_job(request.job_id.clone()).unwrap();
        assert_eq!(job.title, request.title);
        assert_eq!(job.price_usdc, request.price_usdc);
        assert_eq!(job.fee_quote_hash, Some(quote.quote_id));
        let authorized = market
            .get_playback_device(request.creator_id.clone(), device.clone())
            .unwrap();
        assert_eq!(
            authorized.certificate_sha256,
            vector["normal_message"]["playback_session"]["certificate_sha256"]
                .as_str()
                .unwrap()
        );
        assert_eq!(authorized.authorizing_public_key, None);
        assert!(
            matches!(market.ft_on_transfer(request.creator_id.clone(), quote.total_fee_usdc, message), PromiseOrValue::Value(value) if value == quote.total_fee_usdc)
        );
        assert_eq!(market.get_platform_balance(), quote.total_fee_usdc);
        assert_eq!(
            market.get_playback_device(request.creator_id, device),
            Some(authorized)
        );
    }
}

fn withdraw_callback_env(result: near_sdk::PromiseResult) {
    testing_env!(
        context("market.testnet").build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result],
    );
}

#[test]
fn creator_withdrawal_runs_and_restores_while_purchases_paused_and_bridge_frozen() {
    let mut contract = contract();
    create_job(&mut contract, "job-exit", "creator.testnet");
    finalize(
        &mut contract,
        "job-exit",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_exit",
    );
    testing_env!(context(TESTNET_USDC).build());
    let exit = v2::purchase("job-exit", "exit", 5_000_000, NOW_MS);
    assert!(matches!(
        contract.ft_on_transfer(
            account("buyer.testnet"),
            U128(5_000_000),
            exit.msg.to_string()
        ),
        PromiseOrValue::Value(U128(0))
    ));
    // V2 keeps the purchase in escrow; nothing reaches the creator balance before settlement.
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")),
        U128(0)
    );
    assert_eq!(contract.get_escrow_balance(), U128(5_000_000));

    testing_env!(context("guardian.testnet").build());
    contract.pause_new_purchases();
    contract.freeze_bridge();
    let governance = contract.get_governance_state();
    assert!(governance.new_purchases_paused);
    assert!(governance.bridge_frozen);
    let platform_before = contract.get_platform_balance();

    testing_env!(context("creator.testnet").build());
    must_fail(|| {
        let _ = contract.withdraw_creator_balance();
    });
    // A failed transfer callback restores the withdrawn liability (the push-payout fallback
    // in E3b relies on the same path).
    let withdrawal_id = "creator-withdrawal:creator.testnet:1900000:1".to_string();

    withdraw_callback_env(near_sdk::PromiseResult::Failed);
    assert!(!contract.on_creator_withdraw(
        account("creator.testnet"),
        U128(1_900_000),
        withdrawal_id.clone(),
    ));
    let failed = governance_event();
    assert_eq!(failed["event"], "creator_balance_withdrawal_failed");
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")),
        U128(1_900_000)
    );

    testing_env!(context("creator.testnet").build());
    let _ = contract.withdraw_creator_balance();
    let started = governance_event();
    assert_eq!(started["event"], "creator_balance_withdrawal_started");
    assert_eq!(started["data"][0]["account_id"], "creator.testnet");
    assert_eq!(started["data"][0]["amount"], "1900000");
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")),
        U128(0)
    );
    let withdrawal_id = started["data"][0]["withdrawal_id"]
        .as_str()
        .expect("withdrawal id must be a string")
        .to_string();
    withdraw_callback_env(near_sdk::PromiseResult::Successful(Vec::new()));
    assert!(contract.on_creator_withdraw(
        account("creator.testnet"),
        U128(1_900_000),
        withdrawal_id,
    ));
    assert_eq!(
        governance_event()["event"],
        "creator_balance_withdrawal_succeeded"
    );
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")),
        U128(0)
    );
    assert_eq!(contract.get_platform_balance(), platform_before);
    assert_eq!(contract.get_escrow_balance(), U128(5_000_000));
    let governance = contract.get_governance_state();
    assert!(governance.new_purchases_paused);
    assert!(governance.bridge_frozen);
}

const ROLE_DELAY_MS: u64 = 48 * 60 * 60 * 1_000;
const REOPEN_DELAY_MS: u64 = 24 * 60 * 60 * 1_000;
const START_MS: u64 = 1_785_589_300_000;

fn mainnet_context(predecessor: &str, timestamp_ms: u64) -> VMContextBuilder {
    let mut builder = context(predecessor);
    builder.current_account_id(account("market.near"));
    builder.block_timestamp(timestamp_ms * 1_000_000);
    builder
}

fn mainnet_contract() -> Contract {
    testing_env!(mainnet_context("market.near", START_MS).build());
    Contract::new(MarketInitConfig {
        platform_account_id: account("platform.near"),
        bridge_account_id: account("bridge.near"),
        takedown_authority_id: account("governance.near"),
        admin_account_id: account("admin.near"),
        guardian_account_id: account("guardian.near"),
        quote_public_key: Base64VecU8(quote_public_key()),
        quote_key_version: 1,
        near_operational_reserve: U128(1_000_000_000_000_000_000_000_000),
        tax_account_id: account("tax.testnet"),
        vat_public_key: v2::vat_public_key(),
        vat_key_version: 1,
    })
}

#[test]
fn testnet_role_rotation_executes_without_delay_and_moves_authority() {
    let mut contract = contract();
    testing_env!(context("admin.testnet").build());
    let pending =
        contract.propose_role_rotation(GovernanceRole::Platform, account("treasury.testnet"));
    assert_eq!(pending.current_account_id, account("platform.testnet"));
    assert_eq!(pending.proposed_at_ms, pending.executable_at_ms);
    let proposed = governance_event();
    assert_eq!(proposed["event"], "role_rotation_proposed");
    assert_eq!(proposed["data"][0]["role"], "PLATFORM");
    assert_eq!(proposed["data"][0]["next_account_id"], "treasury.testnet");
    assert_eq!(
        contract.get_pending_role_rotation(GovernanceRole::Platform),
        Some(pending)
    );

    contract.execute_role_rotation(GovernanceRole::Platform);
    let rotated = governance_event();
    assert_eq!(rotated["event"], "role_rotated");
    assert_eq!(
        rotated["data"][0]["previous_account_id"],
        "platform.testnet"
    );
    assert_eq!(rotated["data"][0]["active_account_id"], "treasury.testnet");
    assert!(contract
        .get_pending_role_rotation(GovernanceRole::Platform)
        .is_none());
    must_fail(|| contract.execute_role_rotation(GovernanceRole::Platform));

    create_job(&mut contract, "job-rotation", "creator.testnet");
    testing_env!(context("platform.testnet").build());
    must_fail(|| {
        let _ = contract.withdraw_platform_balance();
    });
    testing_env!(context("treasury.testnet").build());
    let _ = contract.withdraw_platform_balance();
    assert_eq!(contract.get_platform_balance(), U128(0));
}

#[test]
fn mainnet_role_rotation_waits_forty_eight_hours() {
    let mut contract = mainnet_contract();
    testing_env!(mainnet_context("admin.near", START_MS).build());
    let pending = contract.propose_role_rotation(GovernanceRole::Admin, account("admin-2.near"));
    assert_eq!(pending.executable_at_ms, U64(START_MS + ROLE_DELAY_MS));

    testing_env!(mainnet_context("admin.near", START_MS + ROLE_DELAY_MS - 1).build());
    must_fail(|| contract.execute_role_rotation(GovernanceRole::Admin));
    assert_eq!(
        contract.get_governance_state().admin_account_id,
        account("admin.near")
    );

    testing_env!(mainnet_context("admin.near", START_MS + ROLE_DELAY_MS).build());
    contract.execute_role_rotation(GovernanceRole::Admin);
    assert_eq!(
        contract.get_governance_state().admin_account_id,
        account("admin-2.near")
    );

    testing_env!(mainnet_context("guardian.near", START_MS + ROLE_DELAY_MS).build());
    contract.pause_new_purchases();
    testing_env!(mainnet_context("admin.near", START_MS + ROLE_DELAY_MS).build());
    must_fail(|| {
        contract.request_new_purchases_unpause();
    });
    testing_env!(mainnet_context("admin-2.near", START_MS + ROLE_DELAY_MS).build());
    contract.request_new_purchases_unpause();
    testing_env!(
        mainnet_context("admin-2.near", START_MS + ROLE_DELAY_MS + REOPEN_DELAY_MS).build()
    );
    contract.unpause_new_purchases();
    assert!(!contract.get_governance_state().new_purchases_paused);
}

#[test]
fn role_rotation_is_admin_proposed_and_admin_or_guardian_cancelled() {
    let mut contract = mainnet_contract();
    for caller in ["guardian.near", "platform.near", "attacker.near"] {
        testing_env!(mainnet_context(caller, START_MS).build());
        must_fail(|| {
            contract.propose_role_rotation(GovernanceRole::Guardian, account("guardian-2.near"));
        });
    }
    testing_env!(mainnet_context("admin.near", START_MS).build());
    must_fail(|| contract.execute_role_rotation(GovernanceRole::Guardian));
    let pending =
        contract.propose_role_rotation(GovernanceRole::Guardian, account("guardian-2.near"));
    assert_eq!(
        contract.propose_role_rotation(GovernanceRole::Guardian, account("guardian-2.near")),
        pending
    );
    must_fail(|| {
        contract.propose_role_rotation(GovernanceRole::Guardian, account("guardian-3.near"));
    });

    testing_env!(mainnet_context("attacker.near", START_MS + ROLE_DELAY_MS).build());
    must_fail(|| contract.cancel_role_rotation(GovernanceRole::Guardian));
    must_fail(|| contract.execute_role_rotation(GovernanceRole::Guardian));

    testing_env!(mainnet_context("guardian.near", START_MS + ROLE_DELAY_MS).build());
    contract.cancel_role_rotation(GovernanceRole::Guardian);
    let cancelled = governance_event();
    assert_eq!(cancelled["event"], "role_rotation_cancelled");
    assert_eq!(cancelled["data"][0]["role"], "GUARDIAN");
    assert!(contract
        .get_pending_role_rotation(GovernanceRole::Guardian)
        .is_none());
    testing_env!(mainnet_context("guardian.near", START_MS + ROLE_DELAY_MS).build());
    contract.cancel_role_rotation(GovernanceRole::Guardian);
    assert!(get_logs().is_empty());

    testing_env!(mainnet_context("admin.near", START_MS + ROLE_DELAY_MS).build());
    must_fail(|| contract.execute_role_rotation(GovernanceRole::Guardian));
    assert_eq!(
        contract.get_governance_state().guardian_account_id,
        account("guardian.near")
    );
}

#[test]
fn role_rotation_preserves_authority_separation() {
    let mut contract = contract();
    testing_env!(context("admin.testnet").build());
    for (role, next) in [
        (GovernanceRole::Admin, "admin.testnet"),
        (GovernanceRole::Admin, "guardian.testnet"),
        (GovernanceRole::Guardian, "admin.testnet"),
        (GovernanceRole::Admin, "bridge.testnet"),
        (GovernanceRole::Guardian, "bridge.testnet"),
        (GovernanceRole::Platform, "bridge.testnet"),
        (GovernanceRole::TakedownAuthority, "bridge.testnet"),
        (GovernanceRole::TakedownAuthority, "platform.testnet"),
        (GovernanceRole::Platform, "governance.testnet"),
    ] {
        must_fail(|| {
            contract.propose_role_rotation(role, account(next));
        });
    }
    contract.propose_bridge(account("bridge-2.testnet"));
    must_fail(|| {
        contract.propose_role_rotation(GovernanceRole::Admin, account("bridge-2.testnet"));
    });
    contract.cancel_bridge_rotation();

    contract.propose_role_rotation(GovernanceRole::Guardian, account("shared.testnet"));
    contract.propose_role_rotation(GovernanceRole::Admin, account("shared.testnet"));
    contract.execute_role_rotation(GovernanceRole::Admin);
    testing_env!(context("shared.testnet").build());
    must_fail(|| contract.execute_role_rotation(GovernanceRole::Guardian));
    let governance = contract.get_governance_state();
    assert_eq!(governance.admin_account_id, account("shared.testnet"));
    assert_eq!(governance.guardian_account_id, account("guardian.testnet"));
}

#[test]
fn role_rotation_rejects_a_proposal_made_stale_by_another_rotation() {
    let mut contract = mainnet_contract();
    testing_env!(mainnet_context("admin.near", START_MS).build());
    contract.propose_role_rotation(GovernanceRole::Admin, account("admin-2.near"));
    contract.propose_role_rotation(GovernanceRole::Guardian, account("guardian-2.near"));
    testing_env!(mainnet_context("admin.near", START_MS + ROLE_DELAY_MS).build());
    contract.execute_role_rotation(GovernanceRole::Admin);

    testing_env!(mainnet_context("admin.near", START_MS + ROLE_DELAY_MS).build());
    must_fail(|| contract.execute_role_rotation(GovernanceRole::Guardian));
    testing_env!(mainnet_context("admin-2.near", START_MS + ROLE_DELAY_MS).build());
    contract.execute_role_rotation(GovernanceRole::Guardian);
    assert_eq!(
        contract.get_governance_state().guardian_account_id,
        account("guardian-2.near")
    );
}

#[test]
fn mainnet_bridge_rotation_waits_forty_eight_hours() {
    let mut contract = mainnet_contract();
    testing_env!(mainnet_context("admin.near", START_MS).build());
    must_fail(|| contract.execute_bridge_rotation());
    contract.propose_bridge(account("bridge-2.near"));
    let proposed = governance_event();
    assert_eq!(proposed["event"], "bridge_rotation_proposed");
    assert_eq!(
        proposed["data"][0]["executable_at_ms"],
        (START_MS + ROLE_DELAY_MS).to_string()
    );
    assert_eq!(
        contract
            .get_governance_timelocks()
            .bridge_rotation_executable_at_ms,
        Some(U64(START_MS + ROLE_DELAY_MS))
    );

    testing_env!(mainnet_context("admin.near", START_MS + ROLE_DELAY_MS - 1).build());
    must_fail(|| contract.execute_bridge_rotation());
    assert_eq!(
        contract.get_governance_state().active_bridge_account_id,
        account("bridge.near")
    );

    testing_env!(mainnet_context("admin.near", START_MS + ROLE_DELAY_MS).build());
    contract.execute_bridge_rotation();
    let state = contract.get_governance_state();
    assert_eq!(state.active_bridge_account_id, account("bridge-2.near"));
    assert!(state.pending_bridge_account_id.is_none());
    assert!(contract
        .get_governance_timelocks()
        .bridge_rotation_executable_at_ms
        .is_none());
}

#[test]
fn mainnet_bridge_unfreeze_requires_a_twenty_four_hour_request() {
    let mut contract = mainnet_contract();
    testing_env!(mainnet_context("admin.near", START_MS).build());
    must_fail(|| {
        contract.request_bridge_unfreeze();
    });
    testing_env!(mainnet_context("guardian.near", START_MS).build());
    contract.freeze_bridge();
    must_fail(|| {
        contract.request_bridge_unfreeze();
    });

    testing_env!(mainnet_context("admin.near", START_MS).build());
    must_fail(|| contract.unfreeze_bridge());
    assert_eq!(contract.request_bridge_unfreeze(), U64(START_MS));
    let requested = governance_event();
    assert_eq!(requested["event"], "bridge_unfreeze_requested");
    assert_eq!(
        requested["data"][0]["executable_at_ms"],
        (START_MS + REOPEN_DELAY_MS).to_string()
    );
    testing_env!(mainnet_context("admin.near", START_MS + 1).build());
    assert_eq!(contract.request_bridge_unfreeze(), U64(START_MS));
    assert!(get_logs().is_empty());

    testing_env!(mainnet_context("admin.near", START_MS + REOPEN_DELAY_MS - 1).build());
    must_fail(|| contract.unfreeze_bridge());
    assert!(contract.get_governance_state().bridge_frozen);

    testing_env!(mainnet_context("attacker.near", START_MS + REOPEN_DELAY_MS).build());
    must_fail(|| contract.cancel_bridge_unfreeze());
    testing_env!(mainnet_context("guardian.near", START_MS + REOPEN_DELAY_MS).build());
    contract.cancel_bridge_unfreeze();
    assert_eq!(governance_event()["event"], "bridge_unfreeze_cancelled");
    testing_env!(mainnet_context("admin.near", START_MS + REOPEN_DELAY_MS).build());
    must_fail(|| contract.unfreeze_bridge());

    let second_request_ms = START_MS + REOPEN_DELAY_MS;
    contract.request_bridge_unfreeze();
    let timelocks = contract.get_governance_timelocks();
    assert_eq!(
        timelocks.bridge_unfreeze_requested_at_ms,
        Some(U64(second_request_ms))
    );
    assert_eq!(
        timelocks.bridge_unfreeze_executable_at_ms,
        Some(U64(second_request_ms + REOPEN_DELAY_MS))
    );
    testing_env!(mainnet_context("admin.near", second_request_ms + REOPEN_DELAY_MS).build());
    contract.unfreeze_bridge();
    assert_eq!(governance_event()["event"], "bridge_unfrozen");
    assert!(!contract.get_governance_state().bridge_frozen);
    assert!(contract
        .get_governance_timelocks()
        .bridge_unfreeze_requested_at_ms
        .is_none());
}

#[test]
fn mainnet_purchase_unpause_requires_a_twenty_four_hour_request() {
    let mut contract = mainnet_contract();
    testing_env!(mainnet_context("guardian.near", START_MS).build());
    contract.pause_new_purchases();
    must_fail(|| {
        contract.request_new_purchases_unpause();
    });

    testing_env!(mainnet_context("admin.near", START_MS).build());
    must_fail(|| contract.unpause_new_purchases());
    contract.request_new_purchases_unpause();
    let requested = governance_event();
    assert_eq!(requested["event"], "new_purchases_unpause_requested");
    assert_eq!(
        requested["data"][0]["executable_at_ms"],
        (START_MS + REOPEN_DELAY_MS).to_string()
    );

    testing_env!(mainnet_context("admin.near", START_MS + REOPEN_DELAY_MS - 1).build());
    must_fail(|| contract.unpause_new_purchases());
    assert!(contract.get_governance_state().new_purchases_paused);

    testing_env!(mainnet_context("guardian.near", START_MS + REOPEN_DELAY_MS).build());
    contract.cancel_new_purchases_unpause();
    assert_eq!(
        governance_event()["event"],
        "new_purchases_unpause_cancelled"
    );
    testing_env!(mainnet_context("guardian.near", START_MS + REOPEN_DELAY_MS).build());
    contract.cancel_new_purchases_unpause();
    assert!(get_logs().is_empty());
    testing_env!(mainnet_context("admin.near", START_MS + REOPEN_DELAY_MS).build());
    must_fail(|| contract.unpause_new_purchases());

    contract.request_new_purchases_unpause();
    testing_env!(mainnet_context("admin.near", START_MS + 2 * REOPEN_DELAY_MS).build());
    contract.unpause_new_purchases();
    assert_eq!(governance_event()["event"], "new_purchases_unpaused");
    assert!(!contract.get_governance_state().new_purchases_paused);
    let timelocks = contract.get_governance_timelocks();
    assert!(timelocks.new_purchases_unpause_requested_at_ms.is_none());
    assert_eq!(timelocks.reopen_delay_ms, U64(REOPEN_DELAY_MS));
    assert_eq!(timelocks.bridge_rotation_delay_ms, U64(ROLE_DELAY_MS));
    assert_eq!(timelocks.role_rotation_delay_ms, U64(ROLE_DELAY_MS));
}

#[test]
fn testnet_governance_timelocks_are_zero() {
    let contract = contract();
    let timelocks = contract.get_governance_timelocks();
    assert_eq!(timelocks.role_rotation_delay_ms, U64(0));
    assert_eq!(timelocks.bridge_rotation_delay_ms, U64(0));
    assert_eq!(timelocks.reopen_delay_ms, U64(0));
}

const UPGRADE_CODE: &[u8] = b"\0asm upgrade fixture";

fn upgrade_sha256() -> String {
    near_sdk::env::sha256(UPGRADE_CODE)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn with_input(builder: VMContextBuilder, input: &[u8]) -> near_sdk::VMContext {
    let mut context = builder.build();
    context.input = input.to_vec();
    context
}

#[test]
fn mainnet_code_upgrade_is_hash_locked_and_waits_forty_eight_hours() {
    let mut contract = mainnet_contract();
    for caller in ["guardian.near", "attacker.near"] {
        testing_env!(mainnet_context(caller, START_MS).build());
        must_fail(|| {
            contract.propose_code_upgrade(upgrade_sha256());
        });
    }
    testing_env!(mainnet_context("admin.near", START_MS).build());
    must_fail(|| {
        contract.propose_code_upgrade("ABC".to_string());
    });
    let pending = contract.propose_code_upgrade(upgrade_sha256());
    assert_eq!(pending.executable_at_ms, U64(START_MS + ROLE_DELAY_MS));
    let proposed = governance_event();
    assert_eq!(proposed["event"], "code_upgrade_proposed");
    assert_eq!(proposed["data"][0]["code_sha256"], upgrade_sha256());
    assert_eq!(contract.propose_code_upgrade(upgrade_sha256()), pending);
    must_fail(|| {
        contract.propose_code_upgrade("0".repeat(64));
    });
    assert_eq!(contract.get_pending_code_upgrade(), Some(pending));
    assert_eq!(
        contract.get_governance_timelocks().code_upgrade_delay_ms,
        U64(ROLE_DELAY_MS)
    );

    testing_env!(with_input(
        mainnet_context("anyone.near", START_MS + ROLE_DELAY_MS - 1),
        UPGRADE_CODE
    ));
    must_fail(|| {
        let _ = contract.execute_code_upgrade();
    });
    testing_env!(with_input(
        mainnet_context("anyone.near", START_MS + ROLE_DELAY_MS),
        b"\0asm different code"
    ));
    must_fail(|| {
        let _ = contract.execute_code_upgrade();
    });
    testing_env!(with_input(
        mainnet_context("anyone.near", START_MS + ROLE_DELAY_MS),
        UPGRADE_CODE
    ));
    let _ = contract.execute_code_upgrade();
    assert!(
        contract.get_pending_code_upgrade().is_some(),
        "the pending record is cleared by migrate in the new code"
    );
}

#[test]
fn code_upgrade_can_be_cancelled_by_admin_or_guardian_only() {
    let mut contract = mainnet_contract();
    testing_env!(mainnet_context("admin.near", START_MS).build());
    contract.propose_code_upgrade(upgrade_sha256());

    testing_env!(mainnet_context("attacker.near", START_MS).build());
    must_fail(|| contract.cancel_code_upgrade());
    testing_env!(mainnet_context("guardian.near", START_MS).build());
    contract.cancel_code_upgrade();
    let cancelled = governance_event();
    assert_eq!(cancelled["event"], "code_upgrade_cancelled");
    assert_eq!(cancelled["data"][0]["code_sha256"], upgrade_sha256());
    assert!(contract.get_pending_code_upgrade().is_none());
    testing_env!(mainnet_context("guardian.near", START_MS).build());
    contract.cancel_code_upgrade();
    assert!(get_logs().is_empty());

    testing_env!(with_input(
        mainnet_context("anyone.near", START_MS + ROLE_DELAY_MS),
        UPGRADE_CODE
    ));
    must_fail(|| {
        let _ = contract.execute_code_upgrade();
    });
}

#[test]
fn testnet_code_upgrade_has_no_delay() {
    let mut contract = contract();
    testing_env!(context("admin.testnet").build());
    let pending = contract.propose_code_upgrade(upgrade_sha256());
    assert_eq!(pending.proposed_at_ms, pending.executable_at_ms);
    testing_env!(with_input(context("anyone.testnet"), UPGRADE_CODE));
    let _ = contract.execute_code_upgrade();
}

#[test]
fn protocol_golden_vectors_are_accepted_byte_for_byte() {
    let vectors: serde_json::Value = serde_json::from_str(include_str!(
        "../../../protocol/youtick-market-v2/golden-vectors.json"
    ))
    .unwrap();
    let fixture = &vectors["fixture"];
    let contract_id = fixture["contract_id"].as_str().unwrap();
    MARKET_ID.with(|id| *id.borrow_mut() = contract_id.to_string());

    // ticket_id = sha256(raw public key), for every derived ticket.
    for ticket in vectors["key_derivation"]["tickets"].as_array().unwrap() {
        let key = ticket["public_key"]
            .as_str()
            .unwrap()
            .strip_prefix("ed25519:")
            .unwrap();
        let raw = near_sdk::bs58::decode(key).into_vec().unwrap();
        assert_eq!(sha256_hex(&raw), ticket["ticket_id"].as_str().unwrap());
    }

    testing_env!(context(contract_id).build());
    let mut market = Contract::new(MarketInitConfig {
        platform_account_id: account("platform.testnet"),
        bridge_account_id: account("bridge.testnet"),
        takedown_authority_id: account("governance.testnet"),
        admin_account_id: account("admin.testnet"),
        guardian_account_id: account("guardian.testnet"),
        quote_public_key: Base64VecU8(quote_public_key()),
        quote_key_version: 1,
        near_operational_reserve: U128(1_000_000_000_000_000_000_000_000),
        tax_account_id: account("tax.testnet"),
        vat_public_key: vectors["vat_attestation"]["signer_public_key"]
            .as_str()
            .unwrap()
            .to_string(),
        vat_key_version: fixture["vat_key_version"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap(),
    });
    let publication_id = fixture["publication_id"].as_str().unwrap();
    let gross: u128 = fixture["gross_usdc_micro"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    create_job_with(
        &mut market,
        publication_id,
        fixture["creator_id"].as_str().unwrap(),
        gross,
        1_000_000,
    );
    finalize(
        &mut market,
        publication_id,
        1,
        fixture["creator_id"].as_str().unwrap(),
        ASSET_HASH,
        "playback_vectors",
    );

    let issued_at: u64 = fixture["issued_at_ms"].as_str().unwrap().parse().unwrap();
    let mut usdc = context(TESTNET_USDC);
    usdc.block_timestamp(issued_at * 1_000_000);
    testing_env!(usdc.build());
    let args = &vectors["purchase"]["ft_transfer_call_args"];
    assert_eq!(args["receiver_id"], contract_id);
    assert!(matches!(
        market.ft_on_transfer(
            account(fixture["buyer_id"].as_str().unwrap()),
            U128(args["amount"].as_str().unwrap().parse().unwrap()),
            args["msg"].as_str().unwrap().to_string(),
        ),
        PromiseOrValue::Value(U128(0))
    ));

    let mut expected = vectors["events"]["ticket_purchased"].clone();
    let mut emitted = governance_event();
    // The vectors name a placeholder token; the contract reports the embedded testnet USDC.
    assert_eq!(emitted["data"][0]["asset"], TESTNET_USDC);
    emitted["data"][0]["asset"] = serde_json::Value::Null;
    expected["data"][0]["asset"] = serde_json::Value::Null;
    assert_eq!(emitted, expected);

    let ticket_id = vectors["ticket_signatures"]["purchase_device"]["ticket_id"]
        .as_str()
        .unwrap();
    let ticket = market.get_ticket(ticket_id.to_string()).unwrap();
    let split = &vectors["vat_attestation"]["split"];
    assert_eq!(
        ticket.platform_usdc_micro.0.to_string(),
        split["platform_usdc_micro"].as_str().unwrap()
    );
    assert_eq!(
        ticket.creator_usdc_micro.0.to_string(),
        split["creator_usdc_micro"].as_str().unwrap()
    );
    assert_eq!(
        ticket.devices[0].session_public_key,
        vectors["purchase"]["msg"]["device"]["session_public_key"]
    );
    assert_eq!(market.get_escrow_balance(), U128(gross));

    // Device calls and events match the protocol vectors.
    let calls = &vectors["calls"];
    let mut relayer = context("relayer.testnet");
    relayer.block_timestamp(issued_at * 1_000_000);
    testing_env!(relayer.build());
    let add = &calls["add_device_args"];
    market.add_device(
        add["ticket_id"].as_str().unwrap().to_string(),
        add["session_public_key"].as_str().unwrap().to_string(),
        add["certificate_sha256"].as_str().unwrap().to_string(),
        add["device_epoch"].as_str().unwrap().to_string(),
        add["expires_at_ms"].as_str().unwrap().to_string(),
        add["signature"].as_str().unwrap().to_string(),
    );
    assert_eq!(governance_event(), vectors["events"]["device_added"]);
    let revoke = &calls["revoke_device_args"];
    market.revoke_device(
        revoke["ticket_id"].as_str().unwrap().to_string(),
        revoke["session_public_key"].as_str().unwrap().to_string(),
        revoke["device_epoch"].as_str().unwrap().to_string(),
        revoke["expires_at_ms"].as_str().unwrap().to_string(),
        revoke["signature"].as_str().unwrap().to_string(),
    );
    assert_eq!(governance_event(), vectors["events"]["device_revoked"]);

    // Settlement events match the protocol vectors too.
    let mut bridge = context("bridge.testnet");
    bridge.block_timestamp(issued_at * 1_000_000);
    testing_env!(bridge.build());
    let _ = market.mark_watched(ticket_id.to_string());
    assert_eq!(governance_event(), vectors["events"]["ticket_watched"]);
    withdraw_callback_env(near_sdk::PromiseResult::Failed);
    market.on_creator_payout(
        ticket_id.to_string(),
        account(fixture["creator_id"].as_str().unwrap()),
        U128(
            split["creator_usdc_micro"]
                .as_str()
                .unwrap()
                .parse()
                .unwrap(),
        ),
    );
    assert_eq!(
        governance_event(),
        vectors["events"]["creator_payout_credited"]
    );
}

#[test]
fn ticket_purchase_keeps_the_storage_runway_outside_the_public_beta() {
    let mut market = contract();
    create_job(&mut market, "job-runway", "creator.testnet");
    finalize(
        &mut market,
        "job-runway",
        1,
        "creator.testnet",
        ASSET_HASH,
        "playback_runway",
    );
    let mut low = context(TESTNET_USDC);
    low.account_balance(near_sdk::NearToken::from_yoctonear(1));
    testing_env!(low.build());
    let purchase = v2::purchase("job-runway", "runway", 5_000_000, NOW_MS);
    must_fail(|| {
        market.ft_on_transfer(
            account("buyer.testnet"),
            U128(5_000_000),
            purchase.msg.to_string(),
        );
    });
    // The mock host does not roll back writes on panic; on-chain the receipt reverts and NEP-141
    // refunds the buyer.
    testing_env!(context(TESTNET_USDC).build());
    let next = v2::purchase("job-runway", "runway-ok", 5_000_000, NOW_MS);
    assert!(matches!(
        market.ft_on_transfer(
            account("buyer.testnet"),
            U128(5_000_000),
            next.msg.to_string()
        ),
        PromiseOrValue::Value(U128(0))
    ));
    assert_eq!(market.get_ticket(next.ticket_id).unwrap().card, None);
}

// --- E3b: settlement, refund and release -----------------------------------------------------

fn bought(publication_id: &str, label: &str) -> (Contract, v2::Purchase) {
    let mut market = contract();
    create_job(&mut market, publication_id, "creator.testnet");
    finalize(
        &mut market,
        publication_id,
        1,
        "creator.testnet",
        ASSET_HASH,
        &format!("playback_{label}"),
    );
    testing_env!(context(TESTNET_USDC).build());
    let purchase = v2::purchase(publication_id, label, 5_000_000, NOW_MS);
    assert!(matches!(
        market.ft_on_transfer(
            account("buyer.testnet"),
            U128(5_000_000),
            purchase.msg.to_string()
        ),
        PromiseOrValue::Value(U128(0))
    ));
    (market, purchase)
}

fn at(predecessor: &str, ms: u64) {
    let mut ctx = context(predecessor);
    ctx.block_timestamp(ms * 1_000_000);
    testing_env!(ctx.build());
}

fn refund_signature(label: &str, ticket_id: &str, refund_to: &str, expires: &str) -> String {
    v2::sign(
        &v2::key(label),
        &[
            "youtick.market-v2.ticket-sig.v1",
            "testnet",
            "market.testnet",
            "refund_unwatched",
            ticket_id,
            expires,
            refund_to,
        ],
    )
}

fn last_event() -> serde_json::Value {
    governance_event()
}

const GROSS: u128 = 5_000_000;
const VAT: u128 = 833_333;
const PLATFORM: u128 = 208_333;
const CREATOR: u128 = 3_958_334;

#[test]
fn watched_ticket_settles_vat_and_platform_and_pushes_the_creator_share() {
    let (mut market, purchase) = bought("job-watch", "watch");
    let platform_before = market.get_platform_balance().0;
    testing_env!(context("bridge.testnet").build());
    assert!(matches!(
        market.mark_watched(purchase.ticket_id.clone()),
        PromiseOrValue::Promise(_)
    ));
    let watched = last_event();
    assert_eq!(watched["version"], "2.0.0");
    assert_eq!(watched["event"], "ticket_watched");
    assert_eq!(watched["data"][0]["rail"], "crypto");
    assert_eq!(
        watched["data"][0]["creator_usdc_micro"],
        CREATOR.to_string()
    );
    let ticket = market.get_ticket(purchase.ticket_id.clone()).unwrap();
    assert_eq!(ticket.status, youtick_market_v2::TicketStatus::Watched);
    assert_eq!(market.get_escrow_balance(), U128(0));
    assert_eq!(market.get_tax_balance(), U128(VAT));
    assert_eq!(
        market.get_platform_balance(),
        U128(platform_before + PLATFORM)
    );
    // The creator share is in flight, not credited.
    assert_eq!(
        market.get_creator_balance(account("creator.testnet")),
        U128(0)
    );
    assert_eq!(VAT + PLATFORM + CREATOR, GROSS);

    withdraw_callback_env(near_sdk::PromiseResult::Successful(Vec::new()));
    assert!(market.on_creator_payout(
        purchase.ticket_id.clone(),
        account("creator.testnet"),
        U128(CREATOR)
    ));
    assert_eq!(
        market.get_creator_balance(account("creator.testnet")),
        U128(0)
    );

    withdraw_callback_env(near_sdk::PromiseResult::Failed);
    assert!(!market.on_creator_payout(
        purchase.ticket_id.clone(),
        account("creator.testnet"),
        U128(CREATOR)
    ));
    assert_eq!(
        market.get_creator_balance(account("creator.testnet")),
        U128(CREATOR)
    );
    let credited = last_event();
    assert_eq!(credited["event"], "creator_payout_credited");
    assert_eq!(credited["data"][0]["ticket_id"], purchase.ticket_id);

    // A second mark_watched is a no-op and never settles twice.
    testing_env!(context("bridge.testnet").build());
    assert!(matches!(
        market.mark_watched(purchase.ticket_id),
        PromiseOrValue::Value(false)
    ));
    assert_eq!(market.get_tax_balance(), U128(VAT));
    assert_eq!(
        market.get_platform_balance(),
        U128(platform_before + PLATFORM)
    );
}

#[test]
fn only_an_unfrozen_bridge_marks_watched_and_never_after_takedown() {
    let (mut market, purchase) = bought("job-watch-rules", "watch-rules");
    for actor in [
        "buyer.testnet",
        "creator.testnet",
        "platform.testnet",
        "admin.testnet",
    ] {
        testing_env!(context(actor).build());
        must_fail(|| {
            market.mark_watched(purchase.ticket_id.clone());
        });
    }
    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        market.mark_watched("0".repeat(64));
    });
    testing_env!(context("guardian.testnet").build());
    market.freeze_bridge();
    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        market.mark_watched(purchase.ticket_id.clone());
    });
    testing_env!(context("admin.testnet").build());
    market.request_bridge_unfreeze();
    market.unfreeze_bridge();
    testing_env!(context("governance.testnet").build());
    market.takedown_livepeer_publication(
        "job-watch-rules".to_string(),
        "GOVERNANCE_DECISION".to_string(),
        "incident-watch".to_string(),
        FINGERPRINT.to_string(),
        U64(NOW_MS),
    );
    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        market.mark_watched(purchase.ticket_id.clone());
    });
    assert_eq!(market.get_escrow_balance(), U128(GROSS));
    assert_eq!(
        market.get_ticket(purchase.ticket_id).unwrap().status,
        youtick_market_v2::TicketStatus::Purchased
    );
}

#[test]
fn refund_requires_the_ticket_key_and_restores_on_a_failed_transfer() {
    let (mut market, purchase) = bought("job-refund", "refund");
    let ticket_id = purchase.ticket_id.clone();
    let expires = (NOW_MS + 600_000).to_string();
    let good = refund_signature("refund", &ticket_id, "buyer.testnet", &expires);
    testing_env!(context("relayer.testnet").build());
    // Wrong key, other recipient, expired, too far ahead.
    for (refund_to, expires_at, signature) in [
        (
            "buyer.testnet",
            expires.clone(),
            refund_signature("intruder", &ticket_id, "buyer.testnet", &expires),
        ),
        ("attacker.testnet", expires.clone(), good.clone()),
        (
            "buyer.testnet",
            NOW_MS.to_string(),
            refund_signature("refund", &ticket_id, "buyer.testnet", &NOW_MS.to_string()),
        ),
        (
            "buyer.testnet",
            (NOW_MS + 3_600_001).to_string(),
            refund_signature(
                "refund",
                &ticket_id,
                "buyer.testnet",
                &(NOW_MS + 3_600_001).to_string(),
            ),
        ),
    ] {
        must_fail(|| {
            let _ = market.refund_unwatched(
                ticket_id.clone(),
                account(refund_to),
                expires_at.clone(),
                signature.clone(),
            );
        });
    }
    assert_eq!(market.get_escrow_balance(), U128(GROSS));

    let _ = market.refund_unwatched(
        ticket_id.clone(),
        account("buyer.testnet"),
        expires.clone(),
        good.clone(),
    );
    assert_eq!(
        market.get_ticket(ticket_id.clone()).unwrap().status,
        youtick_market_v2::TicketStatus::Refunded
    );
    assert_eq!(market.get_escrow_balance(), U128(0));
    // A pending or completed refund cannot be repeated, and the Bridge cannot settle it.
    must_fail(|| {
        let _ = market.refund_unwatched(
            ticket_id.clone(),
            account("buyer.testnet"),
            expires.clone(),
            good.clone(),
        );
    });
    testing_env!(context("bridge.testnet").build());
    must_fail(|| {
        market.mark_watched(ticket_id.clone());
    });

    withdraw_callback_env(near_sdk::PromiseResult::Failed);
    assert!(!market.on_ticket_refund(ticket_id.clone(), account("buyer.testnet"), U128(GROSS)));
    let restored = market.get_ticket(ticket_id.clone()).unwrap();
    assert_eq!(restored.status, youtick_market_v2::TicketStatus::Purchased);
    assert_eq!(restored.devices.len(), 1);
    assert_eq!(market.get_escrow_balance(), U128(GROSS));

    testing_env!(context("relayer.testnet").build());
    let _ = market.refund_unwatched(ticket_id.clone(), account("buyer.testnet"), expires, good);
    withdraw_callback_env(near_sdk::PromiseResult::Successful(Vec::new()));
    assert!(market.on_ticket_refund(ticket_id.clone(), account("buyer.testnet"), U128(GROSS)));
    let refunded = market.get_ticket(ticket_id.clone()).unwrap();
    assert_eq!(refunded.status, youtick_market_v2::TicketStatus::Refunded);
    assert!(refunded.devices.is_empty());
    let event = last_event();
    assert_eq!(event["event"], "ticket_refunded");
    assert_eq!(event["data"][0]["refunded_usdc_micro"], GROSS.to_string());
    assert!(!event.to_string().contains("buyer.testnet"));
    assert_eq!(
        market.get_creator_balance(account("creator.testnet")),
        U128(0)
    );
    assert_eq!(market.get_tax_balance(), U128(0));
}

#[test]
fn watched_tickets_cannot_be_refunded_but_takedown_keeps_the_refund_open() {
    let (mut market, watched) = bought("job-refund-rules", "refund-watched");
    testing_env!(context(TESTNET_USDC).build());
    let unwatched = v2::purchase("job-refund-rules", "refund-unwatched", GROSS, NOW_MS);
    market.ft_on_transfer(
        account("buyer.testnet"),
        U128(GROSS),
        unwatched.msg.to_string(),
    );
    testing_env!(context("bridge.testnet").build());
    let _ = market.mark_watched(watched.ticket_id.clone());
    let expires = (NOW_MS + 600_000).to_string();
    testing_env!(context("relayer.testnet").build());
    must_fail(|| {
        let _ = market.refund_unwatched(
            watched.ticket_id.clone(),
            account("buyer.testnet"),
            expires.clone(),
            refund_signature(
                "refund-watched",
                &watched.ticket_id,
                "buyer.testnet",
                &expires,
            ),
        );
    });
    testing_env!(context("governance.testnet").build());
    market.takedown_livepeer_publication(
        "job-refund-rules".to_string(),
        "LEGAL_REQUIREMENT".to_string(),
        "incident-refund".to_string(),
        FINGERPRINT.to_string(),
        U64(NOW_MS),
    );
    // Long after the takedown and past the 30-day release point, the refund is still open.
    let later = NOW_MS + 90 * 86_400_000;
    let late_expiry = (later + 600_000).to_string();
    at("relayer.testnet", later);
    assert_eq!(market.release_expired(vec![unwatched.ticket_id.clone()]), 0);
    let _ = market.refund_unwatched(
        unwatched.ticket_id.clone(),
        account("buyer.testnet"),
        late_expiry.clone(),
        refund_signature(
            "refund-unwatched",
            &unwatched.ticket_id,
            "buyer.testnet",
            &late_expiry,
        ),
    );
    assert_eq!(
        market.get_ticket(unwatched.ticket_id).unwrap().status,
        youtick_market_v2::TicketStatus::Refunded
    );
}

#[test]
fn unwatched_tickets_release_to_the_creator_balance_after_thirty_days() {
    let (mut market, purchase) = bought("job-release", "release");
    let platform_before = market.get_platform_balance().0;
    at("anyone.testnet", NOW_MS + 30 * 86_400_000 - 1);
    assert_eq!(market.release_expired(vec![purchase.ticket_id.clone()]), 0);
    assert_eq!(market.get_escrow_balance(), U128(GROSS));

    at("anyone.testnet", NOW_MS + 30 * 86_400_000);
    must_fail(|| {
        market.release_expired(vec![]);
    });
    must_fail(|| {
        market.release_expired(vec![purchase.ticket_id.clone(); 26]);
    });
    assert_eq!(
        market.release_expired(vec![
            purchase.ticket_id.clone(),
            "0".repeat(64),
            purchase.ticket_id.clone()
        ]),
        1
    );
    let released = last_event();
    assert_eq!(released["event"], "ticket_released");
    assert_eq!(
        released["data"][0]["creator_usdc_micro"],
        CREATOR.to_string()
    );
    assert_eq!(market.get_escrow_balance(), U128(0));
    assert_eq!(
        market.get_creator_balance(account("creator.testnet")),
        U128(CREATOR)
    );
    assert_eq!(market.get_tax_balance(), U128(VAT));
    assert_eq!(
        market.get_platform_balance(),
        U128(platform_before + PLATFORM)
    );
    // A released ticket stays playable; a later mark_watched pays nothing again.
    let mut bridge = context("bridge.testnet");
    bridge.block_timestamp((NOW_MS + 31 * 86_400_000) * 1_000_000);
    testing_env!(bridge.build());
    assert!(matches!(
        market.mark_watched(purchase.ticket_id.clone()),
        PromiseOrValue::Value(false)
    ));
    assert_eq!(
        market.get_ticket(purchase.ticket_id).unwrap().status,
        youtick_market_v2::TicketStatus::Released
    );
    assert_eq!(
        market.get_creator_balance(account("creator.testnet")),
        U128(CREATOR)
    );
    assert_eq!(market.get_tax_balance(), U128(VAT));
}

#[test]
fn only_the_tax_or_platform_account_withdraws_vat_and_failures_restore_it() {
    let (mut market, purchase) = bought("job-tax", "tax");
    testing_env!(context("bridge.testnet").build());
    let _ = market.mark_watched(purchase.ticket_id);
    for actor in ["creator.testnet", "bridge.testnet", "admin.testnet"] {
        testing_env!(context(actor).build());
        must_fail(|| {
            let _ = market.withdraw_tax_balance();
        });
    }
    testing_env!(context("tax.testnet").build());
    let _ = market.withdraw_tax_balance();
    assert_eq!(market.get_tax_balance(), U128(0));
    must_fail(|| {
        let _ = market.withdraw_tax_balance();
    });
    withdraw_callback_env(near_sdk::PromiseResult::Failed);
    assert!(!market.on_tax_withdraw(U128(VAT)));
    assert_eq!(market.get_tax_balance(), U128(VAT));
    testing_env!(context("platform.testnet").build());
    let _ = market.withdraw_tax_balance();
    withdraw_callback_env(near_sdk::PromiseResult::Successful(Vec::new()));
    assert!(market.on_tax_withdraw(U128(VAT)));
    assert_eq!(market.get_tax_balance(), U128(0));
}

#[test]
fn refund_window_closes_at_thirty_days_unless_taken_down() {
    let (mut market, purchase) = bought("job-window", "window");
    let closing = NOW_MS + 30 * 86_400_000;
    let expires = (closing + 600_000).to_string();
    at("relayer.testnet", closing);
    must_fail(|| {
        let _ = market.refund_unwatched(
            purchase.ticket_id.clone(),
            account("buyer.testnet"),
            expires.clone(),
            refund_signature("window", &purchase.ticket_id, "buyer.testnet", &expires),
        );
    });
    let early = (closing - 1 + 600_000).to_string();
    at("relayer.testnet", closing - 1);
    let _ = market.refund_unwatched(
        purchase.ticket_id.clone(),
        account("buyer.testnet"),
        early.clone(),
        refund_signature("window", &purchase.ticket_id, "buyer.testnet", &early),
    );
    assert_eq!(
        market.get_ticket(purchase.ticket_id).unwrap().status,
        youtick_market_v2::TicketStatus::Refunded
    );
}

// --- E3c: ticket devices ---------------------------------------------------------------------

fn device_signature(
    label: &str,
    action: &str,
    ticket_id: &str,
    expires: &str,
    fields: &[&str],
) -> String {
    let mut lines = vec![
        "youtick.market-v2.ticket-sig.v1",
        "testnet",
        "market.testnet",
        action,
        ticket_id,
        expires,
    ];
    lines.extend_from_slice(fields);
    v2::sign(&v2::key(label), &lines)
}

fn add(
    market: &mut Contract,
    label: &str,
    ticket_id: &str,
    session: &str,
    epoch: &str,
) -> youtick_market_v2::TicketDevice {
    let expires = (NOW_MS + 600_000).to_string();
    let signature = device_signature(
        label,
        "add_device",
        ticket_id,
        &expires,
        &[session, v2::CERTIFICATE, epoch],
    );
    market.add_device(
        ticket_id.to_string(),
        session.to_string(),
        v2::CERTIFICATE.to_string(),
        epoch.to_string(),
        expires,
        signature,
    )
}

#[test]
fn relayed_add_device_keeps_three_devices_and_renews_existing_keys() {
    let (mut market, purchase) = bought("job-devices", "devices");
    let id = purchase.ticket_id.clone();
    let sessions: Vec<String> = (1..=3)
        .map(|n| v2::near_key(&v2::key(&format!("device-{n}"))))
        .collect();
    testing_env!(context("relayer.testnet").build());
    let added = add(&mut market, "devices", &id, &sessions[0], "0");
    assert_eq!(added.expires_at_ms.0, NOW_MS + 30 * 86_400_000);
    let event = governance_event();
    assert_eq!(event["event"], "device_added");
    assert_eq!(event["data"][0]["device_epoch"], "0");
    add(&mut market, "devices", &id, &sessions[1], "0");
    assert_eq!(market.get_ticket(id.clone()).unwrap().devices.len(), 3);
    // A fourth device replaces the oldest (the purchase device) and advances the epoch.
    let purchase_session = purchase.msg["device"]["session_public_key"]
        .as_str()
        .unwrap()
        .to_string();
    add(&mut market, "devices", &id, &sessions[2], "0");
    let logs = get_logs();
    let evicted: serde_json::Value =
        serde_json::from_str(logs[logs.len() - 2].strip_prefix("EVENT_JSON:").unwrap()).unwrap();
    assert_eq!(evicted["event"], "device_revoked");
    assert_eq!(evicted["data"][0]["session_public_key"], purchase_session);
    assert_eq!(evicted["data"][0]["device_epoch"], "1");
    let ticket = market.get_ticket(id.clone()).unwrap();
    assert_eq!(ticket.device_epoch, 1);
    let devices: Vec<String> = ticket
        .devices
        .into_iter()
        .map(|d| d.session_public_key)
        .collect();
    assert_eq!(devices, sessions);
    assert!(!devices.contains(&purchase_session));
    // An epoch-0 signature (e.g. one seen on chain earlier) cannot rotate a device back in.
    must_fail(|| {
        add(&mut market, "devices", &id, &purchase_session, "0");
    });
    // Re-adding an existing key renews it and moves it to the newest position.
    at("relayer.testnet", NOW_MS + 86_400_000);
    let expires = (NOW_MS + 86_400_000 + 600_000).to_string();
    let renewed = market.add_device(
        id.clone(),
        sessions[0].clone(),
        v2::CERTIFICATE.to_string(),
        "1".to_string(),
        expires.clone(),
        device_signature(
            "devices",
            "add_device",
            &id,
            &expires,
            &[&sessions[0], v2::CERTIFICATE, "1"],
        ),
    );
    assert_eq!(renewed.expires_at_ms.0, NOW_MS + 31 * 86_400_000);
    let order: Vec<String> = market
        .get_ticket(id)
        .unwrap()
        .devices
        .into_iter()
        .map(|d| d.session_public_key)
        .collect();
    assert_eq!(
        order,
        vec![
            sessions[1].clone(),
            sessions[2].clone(),
            sessions[0].clone()
        ]
    );
}

#[test]
fn add_device_rejects_foreign_keys_wrong_fields_and_unplayable_tickets() {
    let (mut market, purchase) = bought("job-device-rules", "device-rules");
    let id = purchase.ticket_id.clone();
    let session = v2::near_key(&v2::key("rule-device"));
    let expires = (NOW_MS + 600_000).to_string();
    testing_env!(context("relayer.testnet").build());
    let cases: Vec<(&str, String, String, String, String)> = vec![
        (
            "foreign key",
            "0".into(),
            expires.clone(),
            v2::CERTIFICATE.into(),
            device_signature(
                "intruder",
                "add_device",
                &id,
                &expires,
                &[&session, v2::CERTIFICATE, "0"],
            ),
        ),
        (
            "revoke signature",
            "0".into(),
            expires.clone(),
            v2::CERTIFICATE.into(),
            device_signature(
                "device-rules",
                "revoke_device",
                &id,
                &expires,
                &[&session, "0"],
            ),
        ),
        (
            "stale epoch",
            "1".into(),
            expires.clone(),
            v2::CERTIFICATE.into(),
            device_signature(
                "device-rules",
                "add_device",
                &id,
                &expires,
                &[&session, v2::CERTIFICATE, "1"],
            ),
        ),
        (
            "expired",
            "0".into(),
            NOW_MS.to_string(),
            v2::CERTIFICATE.into(),
            device_signature(
                "device-rules",
                "add_device",
                &id,
                &NOW_MS.to_string(),
                &[&session, v2::CERTIFICATE, "0"],
            ),
        ),
        (
            "bad certificate",
            "0".into(),
            expires.clone(),
            "AB".repeat(32),
            device_signature(
                "device-rules",
                "add_device",
                &id,
                &expires,
                &[&session, &"AB".repeat(32), "0"],
            ),
        ),
    ];
    for (problem, epoch, expires_at, certificate, signature) in cases {
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            market.add_device(
                id.clone(),
                session.clone(),
                certificate.clone(),
                epoch.clone(),
                expires_at.clone(),
                signature.clone(),
            )
        }));
        assert!(outcome.is_err(), "{problem} must fail");
    }
    assert_eq!(market.get_ticket(id.clone()).unwrap().devices.len(), 1);

    // Refunded tickets cannot hold devices.
    let refund_expires = (NOW_MS + 600_000).to_string();
    let _ = market.refund_unwatched(
        id.clone(),
        account("buyer.testnet"),
        refund_expires.clone(),
        refund_signature("device-rules", &id, "buyer.testnet", &refund_expires),
    );
    must_fail(|| {
        add(&mut market, "device-rules", &id, &session, "0");
    });
}

#[test]
fn released_tickets_accept_devices_but_taken_down_publications_do_not() {
    let (mut market, purchase) = bought("job-device-release", "device-release");
    let id = purchase.ticket_id.clone();
    let session = v2::near_key(&v2::key("release-device"));
    at("anyone.testnet", NOW_MS + 30 * 86_400_000);
    assert_eq!(market.release_expired(vec![id.clone()]), 1);
    let expires = (NOW_MS + 30 * 86_400_000 + 600_000).to_string();
    let signature = device_signature(
        "device-release",
        "add_device",
        &id,
        &expires,
        &[&session, v2::CERTIFICATE, "0"],
    );
    market.add_device(
        id.clone(),
        session.clone(),
        v2::CERTIFICATE.to_string(),
        "0".into(),
        expires.clone(),
        signature.clone(),
    );
    testing_env!(context("governance.testnet").build());
    market.takedown_livepeer_publication(
        "job-device-release".to_string(),
        "GOVERNANCE_DECISION".to_string(),
        "incident-device-release".to_string(),
        FINGERPRINT.to_string(),
        U64(NOW_MS),
    );
    at("relayer.testnet", NOW_MS + 30 * 86_400_000);
    must_fail(|| {
        market.add_device(
            id.clone(),
            session.clone(),
            v2::CERTIFICATE.to_string(),
            "0".into(),
            expires.clone(),
            signature.clone(),
        );
    });
}

#[test]
fn revocation_advances_the_epoch_so_old_signatures_cannot_restore_a_device() {
    let (mut market, purchase) = bought("job-revoke", "revoke");
    let id = purchase.ticket_id.clone();
    let session = v2::near_key(&v2::key("revoked-device"));
    let expires = (NOW_MS + 600_000).to_string();
    let old_add = device_signature(
        "revoke",
        "add_device",
        &id,
        &expires,
        &[&session, v2::CERTIFICATE, "0"],
    );
    testing_env!(context("relayer.testnet").build());
    market.add_device(
        id.clone(),
        session.clone(),
        v2::CERTIFICATE.into(),
        "0".into(),
        expires.clone(),
        old_add.clone(),
    );

    // Holder revocation needs the ticket key and the current epoch.
    must_fail(|| {
        market.revoke_device(
            id.clone(),
            session.clone(),
            "0".into(),
            expires.clone(),
            device_signature("intruder", "revoke_device", &id, &expires, &[&session, "0"]),
        );
    });
    market.revoke_device(
        id.clone(),
        session.clone(),
        "0".into(),
        expires.clone(),
        device_signature("revoke", "revoke_device", &id, &expires, &[&session, "0"]),
    );
    let event = governance_event();
    assert_eq!(event["event"], "device_revoked");
    assert_eq!(event["data"][0]["device_epoch"], "1");
    let ticket = market.get_ticket(id.clone()).unwrap();
    assert_eq!(ticket.device_epoch, 1);
    assert!(ticket
        .devices
        .iter()
        .all(|device| device.session_public_key != session));

    // The unexpired epoch-0 signature can no longer re-add the device; a fresh one can.
    must_fail(|| {
        market.add_device(
            id.clone(),
            session.clone(),
            v2::CERTIFICATE.into(),
            "0".into(),
            expires.clone(),
            old_add.clone(),
        );
    });
    add(&mut market, "revoke", &id, &session, "1");

    // Platform revocation: platform account only, and it also advances the epoch.
    for actor in ["relayer.testnet", "bridge.testnet", "admin.testnet"] {
        testing_env!(context(actor).build());
        must_fail(|| market.platform_revoke_device(id.clone(), session.clone()));
    }
    testing_env!(context("platform.testnet").build());
    market.platform_revoke_device(id.clone(), session.clone());
    let ticket = market.get_ticket(id.clone()).unwrap();
    assert_eq!(ticket.device_epoch, 2);
    assert!(ticket
        .devices
        .iter()
        .all(|device| device.session_public_key != session));
    testing_env!(context("relayer.testnet").build());
    must_fail(|| {
        add(&mut market, "revoke", &id, &session, "1");
    });
}
