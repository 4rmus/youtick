use near_workspaces::{Account, Contract};
use serde_json::json;
use tokio::sync::OnceCell;

const MANIFEST_ROOT: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PACK_ROOT: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BYTE_RECEIPT: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const DELETE_RECEIPT: &str = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

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

async fn init() -> anyhow::Result<(Contract, Account, Account, Account, Account, Vec<Account>)> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = load_contract_wasm().await?;
    let contract = worker.dev_deploy(wasm).await?;
    let platform = worker.dev_create_account().await?;
    let verifier = worker.dev_create_account().await?;
    let cleaner = worker.dev_create_account().await?;
    let creator = worker.dev_create_account().await?;
    let mut kms = Vec::with_capacity(5);
    for _ in 0..5 {
        kms.push(worker.dev_create_account().await?);
    }

    contract
        .call("new")
        .args_json(json!({
            "platform_account_id": platform.id(),
            "verifier_account_id": verifier.id(),
            "source_cleanup_account_id": cleaner.id(),
            "kms_operator_ids": kms.iter().map(Account::id).collect::<Vec<_>>(),
        }))
        .transact()
        .await?
        .into_result()?;

    Ok((contract, platform, verifier, cleaner, creator, kms))
}

#[tokio::test]
async fn exact_evidence_publishes_once() -> anyhow::Result<()> {
    let (contract, _platform, verifier, cleaner, creator, kms) = init().await?;

    creator
        .call(contract.id(), "create_paid_job")
        .args_json(json!({
            "job_id": "job-1",
            "title": "Paid video",
            "price_usdc": "2000000",
        }))
        .transact()
        .await?
        .into_result()?;

    let missing_evidence = creator
        .call(contract.id(), "finalize_paid_publish")
        .args_json(json!({
            "job_id": "job-1",
            "generation": 1,
            "manifest_sha256": MANIFEST_ROOT,
        }))
        .transact()
        .await?;
    assert!(missing_evidence.is_failure());

    verifier
        .call(contract.id(), "record_byte_integrity")
        .args_json(json!({
            "submission": {
                "job_id": "job-1",
                "generation": 1,
                "manifest_cid": "bafy-manifest",
                "manifest_sha256": MANIFEST_ROOT,
                "pack_root_sha256": PACK_ROOT,
                "logical_bytes": "1000000",
                "pack_count": 4,
                "full_readback": true,
                "receipt_digest": BYTE_RECEIPT,
            },
        }))
        .transact()
        .await?
        .into_result()?;

    for (index, operator) in kms.iter().enumerate() {
        operator
            .call(contract.id(), "record_kms_store")
            .args_json(json!({
                "job_id": "job-1",
                "generation": 1,
                "manifest_sha256": MANIFEST_ROOT,
                "stored_and_read_back": true,
                "receipt_digest": format!("{:064x}", index + 1),
            }))
            .transact()
            .await?
            .into_result()?;
    }

    cleaner
        .call(contract.id(), "record_source_delete")
        .args_json(json!({
            "submission": {
                "job_id": "job-1",
                "generation": 1,
                "manifest_sha256": MANIFEST_ROOT,
                "head_not_found": true,
                "get_not_found": true,
                "object_count": 0,
                "multipart_count": 0,
                "receipt_digest": DELETE_RECEIPT,
            },
        }))
        .transact()
        .await?
        .into_result()?;

    let first: serde_json::Value = creator
        .call(contract.id(), "finalize_paid_publish")
        .args_json(json!({
            "job_id": "job-1",
            "generation": 1,
            "manifest_sha256": MANIFEST_ROOT,
        }))
        .transact()
        .await?
        .json()?;
    let second: serde_json::Value = creator
        .call(contract.id(), "finalize_paid_publish")
        .args_json(json!({
            "job_id": "job-1",
            "generation": 1,
            "manifest_sha256": MANIFEST_ROOT,
        }))
        .transact()
        .await?
        .json()?;

    assert_eq!(first, second);
    assert_eq!(first["publication_id"], "job-1");
    Ok(())
}
