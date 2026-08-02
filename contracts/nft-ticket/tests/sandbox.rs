use near_workspaces::{Account, Contract};
use serde_json::json;
use tokio::sync::OnceCell;

const PROFILE_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ASSET_HASH: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PROJECT_HASH: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

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
    let contract = worker.dev_deploy(wasm).await?;
    let platform = worker.dev_create_account().await?;
    let bridge = worker.dev_create_account().await?;
    let governance = worker.dev_create_account().await?;
    let creator = worker.dev_create_account().await?;
    contract
        .call("new")
        .args_json(json!({
            "platform_account_id": platform.id(),
            "bridge_account_id": bridge.id(),
            "takedown_authority_id": governance.id(),
        }))
        .transact()
        .await?
        .into_result()?;
    Ok((contract, bridge, creator))
}

#[tokio::test]
async fn exact_livepeer_publication_publishes_once() -> anyhow::Result<()> {
    let (contract, bridge, creator) = init().await?;
    creator
        .call(contract.id(), "create_paid_job")
        .args_json(json!({
            "job_id": "job-1",
            "title": "Paid video",
            "price_usdc": "2000000",
            "expected_source_bytes": "1000000",
            "profile_id": "paid-media-livepeer-v1",
            "profile_config_sha256": PROFILE_HASH,
        }))
        .transact()
        .await?
        .into_result()?;

    let args = json!({
        "submission": {
            "job_id": "job-1",
            "generation": 1,
            "creator_id": creator.id(),
            "expected_source_bytes": "1000000",
            "profile_id": "paid-media-livepeer-v1",
            "profile_config_sha256": PROFILE_HASH,
            "asset_id_hash": ASSET_HASH,
            "playback_id": "playback_001",
            "project_id_hash": PROJECT_HASH,
            "verified_source_bytes": "1000000",
            "provider_source_fingerprint": null,
            "ready_at_ms": "1785589200000",
            "availability": "ACTIVE",
        },
    });
    let first: serde_json::Value = bridge
        .call(contract.id(), "finalize_livepeer_publication")
        .args_json(args.clone())
        .transact()
        .await?
        .json()?;
    let second: serde_json::Value = bridge
        .call(contract.id(), "finalize_livepeer_publication")
        .args_json(args)
        .transact()
        .await?
        .json()?;
    assert_eq!(first, second);
    assert_eq!(first["publication_id"], "job-1");
    Ok(())
}
