use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, PromiseOrValue};
use youtick_nft::{ByteIntegritySubmission, Contract, MediaJobStatus, SourceDeleteSubmission};

const TESTNET_USDC: &str = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const MANIFEST_ROOT: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PACK_ROOT: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BYTE_RECEIPT: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const DELETE_RECEIPT: &str = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn context(predecessor: &str) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder.current_account_id(account("market.testnet"));
    builder.predecessor_account_id(account(predecessor));
    builder
}

fn kms_accounts() -> Vec<AccountId> {
    (1..=5)
        .map(|index| account(&format!("kms-{index}.testnet")))
        .collect()
}

fn contract() -> Contract {
    testing_env!(context("market.testnet").build());
    Contract::new(
        account("platform.testnet"),
        account("verifier.testnet"),
        account("cleaner.testnet"),
        kms_accounts(),
    )
}

fn create_job(contract: &mut Contract) {
    testing_env!(context("creator.testnet").build());
    contract.create_paid_job(
        "job-1".to_string(),
        "Paid video".to_string(),
        U128(2_000_000),
    );
}

#[test]
fn rejects_price_that_cannot_split_exactly() {
    let mut contract = contract();
    testing_env!(context("creator.testnet").build());
    let invalid_price = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.create_paid_job(
            "job-invalid-price".to_string(),
            "Paid video".to_string(),
            U128(1_999_999),
        );
    }));
    assert!(invalid_price.is_err());
}

fn record_integrity(contract: &mut Contract) {
    testing_env!(context("verifier.testnet").build());
    contract.record_byte_integrity(ByteIntegritySubmission {
        job_id: "job-1".to_string(),
        generation: 1,
        manifest_cid: "bafy-manifest".to_string(),
        manifest_sha256: MANIFEST_ROOT.to_string(),
        pack_root_sha256: PACK_ROOT.to_string(),
        logical_bytes: U128(1_000_000),
        pack_count: 4,
        full_readback: true,
        receipt_digest: BYTE_RECEIPT.to_string(),
    });
}

fn record_all_kms(contract: &mut Contract) {
    for index in 1..=5 {
        testing_env!(context(&format!("kms-{index}.testnet")).build());
        contract.record_kms_store(
            "job-1".to_string(),
            1,
            MANIFEST_ROOT.to_string(),
            true,
            format!("{index:064x}"),
        );
    }
}

#[test]
fn publish_requires_all_three_exact_facts_and_is_idempotent() {
    let mut contract = contract();
    create_job(&mut contract);
    record_integrity(&mut contract);

    for index in 1..=4 {
        testing_env!(context(&format!("kms-{index}.testnet")).build());
        contract.record_kms_store(
            "job-1".to_string(),
            1,
            MANIFEST_ROOT.to_string(),
            true,
            format!("{index:064x}"),
        );
    }

    testing_env!(context("cleaner.testnet").build());
    let missing_kms = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.record_source_delete(SourceDeleteSubmission {
            job_id: "job-1".to_string(),
            generation: 1,
            manifest_sha256: MANIFEST_ROOT.to_string(),
            head_not_found: true,
            get_not_found: true,
            object_count: 0,
            multipart_count: 0,
            receipt_digest: DELETE_RECEIPT.to_string(),
        });
    }));
    assert!(missing_kms.is_err());

    testing_env!(context("kms-5.testnet").build());
    contract.record_kms_store(
        "job-1".to_string(),
        1,
        MANIFEST_ROOT.to_string(),
        true,
        format!("{:064x}", 5),
    );

    testing_env!(context("cleaner.testnet").build());
    contract.record_source_delete(SourceDeleteSubmission {
        job_id: "job-1".to_string(),
        generation: 1,
        manifest_sha256: MANIFEST_ROOT.to_string(),
        head_not_found: true,
        get_not_found: true,
        object_count: 0,
        multipart_count: 0,
        receipt_digest: DELETE_RECEIPT.to_string(),
    });

    testing_env!(context("anyone.testnet").build());
    let first = contract.finalize_paid_publish("job-1".to_string(), 1, MANIFEST_ROOT.to_string());
    let second = contract.finalize_paid_publish("job-1".to_string(), 1, MANIFEST_ROOT.to_string());

    assert_eq!(first, second);
    assert_eq!(
        contract.get_media_job("job-1".to_string()).unwrap().status,
        MediaJobStatus::Published
    );
}

#[test]
fn mismatched_or_old_generation_evidence_cannot_publish() {
    let mut contract = contract();
    create_job(&mut contract);
    record_integrity(&mut contract);

    testing_env!(context("kms-1.testnet").build());
    let wrong_root = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.record_kms_store(
            "job-1".to_string(),
            1,
            PACK_ROOT.to_string(),
            true,
            BYTE_RECEIPT.to_string(),
        );
    }));
    assert!(wrong_root.is_err());

    testing_env!(context("creator.testnet").build());
    let restarted = contract.restart_paid_job("job-1".to_string());
    assert_eq!(restarted.generation, 2);

    testing_env!(context("verifier.testnet").build());
    let old_generation = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.record_byte_integrity(ByteIntegritySubmission {
            job_id: "job-1".to_string(),
            generation: 1,
            manifest_cid: "bafy-old".to_string(),
            manifest_sha256: MANIFEST_ROOT.to_string(),
            pack_root_sha256: PACK_ROOT.to_string(),
            logical_bytes: U128(1_000_000),
            pack_count: 4,
            full_readback: true,
            receipt_digest: BYTE_RECEIPT.to_string(),
        });
    }));
    assert!(old_generation.is_err());
}

#[test]
fn usdc_purchase_splits_98_2_and_duplicate_is_refunded() {
    let mut contract = contract();
    create_job(&mut contract);
    record_integrity(&mut contract);
    record_all_kms(&mut contract);

    testing_env!(context("cleaner.testnet").build());
    contract.record_source_delete(SourceDeleteSubmission {
        job_id: "job-1".to_string(),
        generation: 1,
        manifest_sha256: MANIFEST_ROOT.to_string(),
        head_not_found: true,
        get_not_found: true,
        object_count: 0,
        multipart_count: 0,
        receipt_digest: DELETE_RECEIPT.to_string(),
    });

    testing_env!(context("anyone.testnet").build());
    contract.finalize_paid_publish("job-1".to_string(), 1, MANIFEST_ROOT.to_string());

    testing_env!(context(TESTNET_USDC).build());
    let accepted = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(2_000_000),
        r#"{"publication_id":"job-1"}"#.to_string(),
    );
    assert!(matches!(accepted, PromiseOrValue::Value(U128(0))));
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")).0,
        1_960_000
    );
    assert_eq!(contract.get_platform_balance().0, 40_000);
    assert!(contract.has_entitlement(account("buyer.testnet"), "job-1".to_string()));

    let duplicate = contract.ft_on_transfer(
        account("buyer.testnet"),
        U128(2_000_000),
        r#"{"publication_id":"job-1"}"#.to_string(),
    );
    assert!(matches!(duplicate, PromiseOrValue::Value(U128(2_000_000))));
    assert_eq!(
        contract.get_creator_balance(account("creator.testnet")).0,
        1_960_000
    );
}
