use near_sdk::{Gas, NearToken};
use near_workspaces::types::{KeyType, SecretKey};
use near_workspaces::{AccessKey, Account, AccountDetailsPatch, Contract};
use serde_json::json;
use tokio::sync::OnceCell;

const PROFILE_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ASSET_HASH: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PROJECT_HASH: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const TESTNET_USDC: &str = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";

static CONTRACT_WASM: OnceCell<Vec<u8>> = OnceCell::const_new();
static MOCK_FT_WASM: OnceCell<Vec<u8>> = OnceCell::const_new();

async fn load_contract_wasm() -> anyhow::Result<&'static Vec<u8>> {
    CONTRACT_WASM
        .get_or_try_init(|| async {
            near_workspaces::compile_project(".")
                .await
                .map_err(anyhow::Error::from)
        })
        .await
}

async fn load_mock_ft_wasm() -> anyhow::Result<&'static Vec<u8>> {
    MOCK_FT_WASM
        .get_or_try_init(|| async {
            near_workspaces::compile_project("tests/mock-ft")
                .await
                .map_err(anyhow::Error::from)
        })
        .await
}

async fn init() -> anyhow::Result<(Contract, Account, Account, Contract)> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = load_contract_wasm().await?;
    let mock_ft_wasm = load_mock_ft_wasm().await?;
    let market_id = "paid-media-livepeer-v1.testnet".parse()?;
    let market_key = SecretKey::from_seed(KeyType::ED25519, "paid-media-livepeer-v1.testnet");
    worker
        .patch(&market_id)
        .account(AccountDetailsPatch::default().balance(NearToken::from_near(100)))
        .access_key(market_key.public_key(), AccessKey::full_access())
        .code(wasm)
        .transact()
        .await?;
    let contract = Contract::from_secret_key(market_id, market_key, &worker);
    let platform = worker.dev_create_account().await?;
    let bridge = worker.dev_create_account().await?;
    let governance = worker.dev_create_account().await?;
    let creator = worker.dev_create_account().await?;
    let usdc_id = TESTNET_USDC.parse()?;
    let usdc_key = SecretKey::from_seed(KeyType::ED25519, TESTNET_USDC);
    worker
        .patch(&usdc_id)
        .account(AccountDetailsPatch::default().balance(NearToken::from_near(100)))
        .access_key(usdc_key.public_key(), AccessKey::full_access())
        .code(mock_ft_wasm)
        .transact()
        .await?;
    let usdc = Contract::from_secret_key(usdc_id, usdc_key, &worker);
    usdc.call("new")
        .args_json(json!({
            "owner_id": creator.id(),
            "total_supply": "20000000",
        }))
        .transact()
        .await?
        .into_result()?;
    contract
        .call("new")
        .args_json(json!({
            "platform_account_id": platform.id(),
            "bridge_account_id": bridge.id(),
            "takedown_authority_id": governance.id(),
            "quote_public_key": "6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=",
            "quote_key_version": 1,
            "near_operational_reserve": "1000000000000000000000000",
        }))
        .transact()
        .await?
        .into_result()?;
    Ok((contract, bridge, creator, usdc))
}

#[tokio::test]
async fn exact_livepeer_publication_publishes_once() -> anyhow::Result<()> {
    let (contract, bridge, creator, usdc) = init().await?;
    let storage_before: Option<serde_json::Value> = usdc
        .view("storage_balance_of")
        .args_json(json!({ "account_id": contract.id() }))
        .await?
        .json()?;
    assert!(storage_before.is_none());
    let storage_bounds: serde_json::Value = usdc.view("storage_balance_bounds").await?.json()?;
    let storage_min = storage_bounds["min"]
        .as_str()
        .expect("storage min must be a decimal string")
        .parse()?;
    creator
        .call(usdc.id(), "storage_deposit")
        .args_json(json!({
            "account_id": contract.id(),
            "registration_only": true,
        }))
        .deposit(NearToken::from_yoctonear(storage_min))
        .transact()
        .await?
        .into_result()?;
    let storage_after: serde_json::Value = usdc
        .view("storage_balance_of")
        .args_json(json!({ "account_id": contract.id() }))
        .await?
        .json()?;
    assert_eq!(storage_after["total"], storage_bounds["min"]);
    assert_eq!(storage_after["available"], "0");

    let create_message = json!({
        "action": "create_paid_job",
        "job_id": "job-1",
        "title": "Paid video",
        "price_usdc": "2000000",
        "expected_source_bytes": "1000000",
        "profile_id": "paid-media-livepeer-v1",
        "profile_config_sha256": PROFILE_HASH,
        "upload_public_key": "ed25519:4nSjNY5gSbA4AExMyWg2ErPAwn2X4Vdo4nBNmxyZ9kzF",
        "upload_key_expires_at_ms": "9999999999999",
    })
    .to_string();
    creator
        .call(usdc.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": contract.id(),
            "amount": "500000",
            "memo": "paid-media-livepeer-v1 sandbox",
            "msg": create_message,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;
    let job: serde_json::Value = contract
        .view("get_media_job")
        .args_json(json!({ "job_id": "job-1" }))
        .await?
        .json()?;
    assert_eq!(job["creator_id"], creator.id().as_str());
    assert_eq!(job["expected_source_bytes"], "1000000");

    let creator_after_create: String = usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": creator.id() }))
        .await?
        .json()?;
    let market_after_create: String = usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": contract.id() }))
        .await?
        .json()?;
    assert_eq!(creator_after_create, "19500000");
    assert_eq!(market_after_create, "500000");

    creator
        .call(usdc.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": contract.id(),
            "amount": "500000",
            "memo": "paid-media-livepeer-v1 replay",
            "msg": json!({
                "action": "create_paid_job",
                "job_id": "job-1",
                "title": "Paid video",
                "price_usdc": "2000000",
                "expected_source_bytes": "1000000",
                "profile_id": "paid-media-livepeer-v1",
                "profile_config_sha256": PROFILE_HASH,
                "upload_public_key": "ed25519:4nSjNY5gSbA4AExMyWg2ErPAwn2X4Vdo4nBNmxyZ9kzF",
                "upload_key_expires_at_ms": "9999999999999",
            })
            .to_string(),
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;
    let creator_after_replay: String = usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": creator.id() }))
        .await?
        .json()?;
    let market_after_replay: String = usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": contract.id() }))
        .await?
        .json()?;
    assert_eq!(creator_after_replay, creator_after_create);
    assert_eq!(market_after_replay, market_after_create);

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
    let publication_count: u64 = contract.view("get_publications_count").await?.json()?;
    assert_eq!(publication_count, 1);
    assert_eq!(first, second);
    assert_eq!(first["publication_id"], "job-1");
    Ok(())
}
