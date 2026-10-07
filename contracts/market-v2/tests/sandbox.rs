use std::task::Poll;
use std::time::{Duration, Instant};

use near_sdk::{Gas, NearToken};
use near_workspaces::network::Sandbox;
use near_workspaces::operations::CallTransaction;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Finality, KeyType, SecretKey};
use near_workspaces::{AccessKey, Account, AccountDetailsPatch, Contract, CryptoHash, Worker};
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

async fn init() -> anyhow::Result<(Contract, Account, Account, Account, Contract)> {
    let (contract, bridge, guardian, creator, usdc, _admin) = init_with_admin().await?;
    Ok((contract, bridge, guardian, creator, usdc))
}

async fn init_with_admin(
) -> anyhow::Result<(Contract, Account, Account, Account, Contract, Account)> {
    let (_worker, contract, bridge, guardian, creator, usdc, admin) = init_with_worker().await?;
    Ok((contract, bridge, guardian, creator, usdc, admin))
}

async fn init_with_worker() -> anyhow::Result<(
    Worker<Sandbox>,
    Contract,
    Account,
    Account,
    Account,
    Contract,
    Account,
)> {
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
    let admin = worker.dev_create_account().await?;
    let guardian = worker.dev_create_account().await?;
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
            "config": {
                "platform_account_id": platform.id(),
                "bridge_account_id": bridge.id(),
                "takedown_authority_id": governance.id(),
                "admin_account_id": admin.id(),
                "guardian_account_id": guardian.id(),
                "quote_public_key": "6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=",
                "quote_key_version": 1,
                "near_operational_reserve": "1000000000000000000000000",
                "tax_account_id": governance.id(),
                "vat_public_key": near_key(&test_key("vat-signer")),
                "vat_key_version": 1,
                "payment_operator_id": "payments.testnet",
            },
        }))
        .transact()
        .await?
        .into_result()?;
    Ok((worker, contract, bridge, guardian, creator, usdc, admin))
}

/// Sends `call` and returns its outcome once every block that executed it is final and
/// canonical. `transact()` waits only for optimistic execution: a loaded sandbox can
/// abandon that block and re-execute the receipt in the next one, so the optimistic
/// return value may disagree with state (e.g. a different `block_timestamp_ms`).
async fn transact_final(
    worker: &Worker<Sandbox>,
    call: CallTransaction,
) -> anyhow::Result<ExecutionFinalResult> {
    let pending = call.transact_async().await?;
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        match pending.status().await {
            Ok(Poll::Ready(outcome)) => {
                if executed_in_final_blocks(worker, &outcome).await? {
                    return Ok(outcome);
                }
            }
            Ok(Poll::Pending) => {}
            // The node may briefly fail to resolve an outcome whose block was abandoned.
            Err(error) => anyhow::ensure!(Instant::now() < deadline, error),
        }
        anyhow::ensure!(
            Instant::now() < deadline,
            "transaction {} did not reach a final canonical outcome",
            pending.hash()
        );
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn executed_in_final_blocks(
    worker: &Worker<Sandbox>,
    outcome: &ExecutionFinalResult,
) -> anyhow::Result<bool> {
    let head = worker.view_block().await?;
    let final_height = worker
        .view_block()
        .block_hash(*head.header().last_final_block())
        .await?
        .height();
    for executed in outcome.outcomes() {
        if !is_final_canonical(worker, executed.block_hash, final_height).await {
            return Ok(false);
        }
    }
    Ok(true)
}

async fn is_final_canonical(worker: &Worker<Sandbox>, hash: CryptoHash, final_height: u64) -> bool {
    let Ok(block) = worker.view_block().block_hash(hash).await else {
        return false;
    };
    if block.height() > final_height {
        return false;
    }
    // An abandoned block is still served by hash, but not at its height.
    matches!(
        worker.view_block().block_height(block.height()).await,
        Ok(canonical) if *canonical.hash() == hash
    )
}

#[tokio::test]
async fn exact_livepeer_publication_publishes_once() -> anyhow::Result<()> {
    let (worker, contract, bridge, guardian, creator, usdc, _admin) = init_with_worker().await?;
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
        "price_usdc": "5000000",
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
                "price_usdc": "5000000",
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

    guardian
        .call(contract.id(), "pause_new_purchases")
        .transact()
        .await?
        .into_result()?;
    creator
        .call(usdc.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": contract.id(),
            "amount": "500000",
            "memo": "paid-media-livepeer-v1 paused",
            "msg": json!({
                "action": "create_paid_job",
                "job_id": "job-paused",
                "title": "Paused video",
                "price_usdc": "5000000",
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
    let paused_job: Option<serde_json::Value> = contract
        .view("get_media_job")
        .args_json(json!({ "job_id": "job-paused" }))
        .await?
        .json()?;
    assert!(paused_job.is_none());
    let creator_after_pause: String = usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": creator.id() }))
        .await?
        .json()?;
    let market_after_pause: String = usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": contract.id() }))
        .await?
        .json()?;
    assert_eq!(creator_after_pause, creator_after_replay);
    assert_eq!(market_after_pause, market_after_replay);

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
    let first_outcome = transact_final(
        &worker,
        bridge
            .call(contract.id(), "finalize_livepeer_publication")
            .args_json(args.clone()),
    )
    .await?;
    let publish_receipt = first_outcome
        .receipt_outcomes()
        .iter()
        .find(|outcome| &outcome.executor_id == contract.id())
        .expect("finalize must execute on the market");
    let publish_block = worker
        .view_block()
        .block_hash(publish_receipt.block_hash)
        .await?;
    let first: serde_json::Value = first_outcome.json()?;
    let stored_after_first: serde_json::Value = contract
        .view("get_publication")
        .args_json(json!({ "publication_id": "job-1" }))
        .finality(Finality::Final)
        .await?
        .json()?;
    let second: serde_json::Value = transact_final(
        &worker,
        bridge
            .call(contract.id(), "finalize_livepeer_publication")
            .args_json(args),
    )
    .await?
    .json()?;
    let stored_after_replay: serde_json::Value = contract
        .view("get_publication")
        .args_json(json!({ "publication_id": "job-1" }))
        .finality(Finality::Final)
        .await?
        .json()?;
    let publication_count: u64 = contract
        .view("get_publications_count")
        .finality(Finality::Final)
        .await?
        .json()?;
    assert_eq!(publication_count, 1);
    assert_eq!(
        first["published_at_ms"],
        publish_block.timestamp() / 1_000_000,
        "publication must carry the timestamp of the canonical block that executed it"
    );
    assert_eq!(first, stored_after_first);
    assert_eq!(first, second);
    assert_eq!(first, stored_after_replay);
    assert_eq!(first["publication_id"], "job-1");
    Ok(())
}

async fn ft_balance(
    usdc: &Contract,
    account_id: &near_workspaces::AccountId,
) -> anyhow::Result<String> {
    Ok(usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": account_id }))
        .await?
        .json()?)
}

#[tokio::test]
async fn ticket_purchase_escrows_usdc_on_chain_and_credits_no_balance() -> anyhow::Result<()> {
    let (contract, bridge, guardian, creator, usdc) = init().await?;
    let buyer = creator
        .create_subaccount("buyer")
        .initial_balance(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;
    let storage_bounds: serde_json::Value = usdc.view("storage_balance_bounds").await?.json()?;
    let storage_min: u128 = storage_bounds["min"]
        .as_str()
        .expect("storage min must be a decimal string")
        .parse()?;
    for account_id in [contract.id(), buyer.id()] {
        creator
            .call(usdc.id(), "storage_deposit")
            .args_json(json!({ "account_id": account_id, "registration_only": true }))
            .deposit(NearToken::from_yoctonear(storage_min))
            .transact()
            .await?
            .into_result()?;
    }
    creator
        .call(usdc.id(), "ft_transfer")
        .args_json(json!({ "receiver_id": buyer.id(), "amount": "5000000" }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    creator
        .call(usdc.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": contract.id(),
            "amount": "500000",
            "msg": json!({
                "action": "create_paid_job",
                "job_id": "job-exit",
                "title": "Exit video",
                "price_usdc": "5000000",
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
    bridge
        .call(contract.id(), "finalize_livepeer_publication")
        .args_json(json!({
            "submission": {
                "job_id": "job-exit",
                "generation": 1,
                "creator_id": creator.id(),
                "expected_source_bytes": "1000000",
                "profile_id": "paid-media-livepeer-v1",
                "profile_config_sha256": PROFILE_HASH,
                "asset_id_hash": ASSET_HASH,
                "playback_id": "playback_exit",
                "project_id_hash": PROJECT_HASH,
                "verified_source_bytes": "1000000",
                "provider_source_fingerprint": null,
                "ready_at_ms": "1785589200000",
                "availability": "ACTIVE",
            },
        }))
        .transact()
        .await?
        .into_result()?;
    let market_before: u128 = ft_balance(&usdc, contract.id()).await?.parse()?;
    let (msg, ticket_id) = purchase_message(contract.id().as_str(), "job-exit", 5_000_000);
    buyer
        .call(usdc.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": contract.id(),
            "amount": "5000000",
            "msg": msg,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;
    let market_after: u128 = ft_balance(&usdc, contract.id()).await?.parse()?;
    assert_eq!(market_after - market_before, 5_000_000);
    assert_eq!(ft_balance(&usdc, buyer.id()).await?, "0");
    let ticket: serde_json::Value = contract
        .view("get_ticket")
        .args_json(json!({ "ticket_id": ticket_id }))
        .await?
        .json()?;
    assert_eq!(ticket["status"], "purchased");
    assert_eq!(ticket["gross_usdc_micro"], "5000000");
    assert!(!ticket.to_string().contains(buyer.id().as_str()));
    let escrow: String = contract.view("get_escrow_balance").await?.json()?;
    assert_eq!(escrow, "5000000");
    let creator_balance: String = contract
        .view("get_creator_balance")
        .args_json(json!({ "creator_id": creator.id() }))
        .await?
        .json()?;
    assert_eq!(creator_balance, "0");

    for method in ["pause_new_purchases", "freeze_bridge"] {
        guardian
            .call(contract.id(), method)
            .transact()
            .await?
            .into_result()?;
    }
    // Escrowed funds are not withdrawable as a creator balance.
    let withdrawal = creator
        .call(contract.id(), "withdraw_creator_balance")
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(withdrawal.is_failure());
    assert_eq!(
        ft_balance(&usdc, contract.id()).await?.parse::<u128>()?,
        market_after
    );
    Ok(())
}

fn test_key(label: &str) -> ed25519_dalek::SigningKey {
    use sha2::Digest;
    ed25519_dalek::SigningKey::from_bytes(
        &sha2::Sha256::digest(format!("youtick.market-v2.test.{label}")).into(),
    )
}

fn near_key(key: &ed25519_dalek::SigningKey) -> String {
    format!(
        "ed25519:{}",
        near_sdk::bs58::encode(key.verifying_key().to_bytes()).into_string()
    )
}

fn sign_lines(key: &ed25519_dalek::SigningKey, lines: &[&str]) -> String {
    use ed25519_dalek::Signer;
    use near_sdk::base64::Engine;
    near_sdk::base64::engine::general_purpose::STANDARD
        .encode(key.sign(lines.join("\n").as_bytes()).to_bytes())
}

/// A `buy_ticket_v2` message signed for the sandbox clock (signatures expire within an hour).
fn purchase_message(market: &str, publication_id: &str, gross: u128) -> (String, String) {
    purchase_message_for(market, publication_id, gross, "sandbox-ticket")
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn purchase_message_for(
    market: &str,
    publication_id: &str,
    gross: u128,
    label: &str,
) -> (String, String) {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let expires = (now_ms + 1_800_000).to_string();
    let ticket = test_key(label);
    let session = near_key(&test_key("sandbox-session"));
    let ticket_id = sha256_hex(&ticket.verifying_key().to_bytes());
    let certificate = "e".repeat(64);
    let gross_text = gross.to_string();
    let vat = (gross / 6).to_string();
    let device_signature = sign_lines(
        &ticket,
        &[
            "youtick.market-v2.ticket-sig.v1",
            "testnet",
            market,
            "purchase_device",
            &ticket_id,
            &expires,
            publication_id,
            &session,
            &certificate,
        ],
    );
    let vat_signature = sign_lines(
        &test_key("vat-signer"),
        &[
            "youtick.market-v2.vat.v1",
            "testnet",
            market,
            &ticket_id,
            publication_id,
            &gross_text,
            &vat,
            &expires,
            "1",
        ],
    );
    let msg = json!({
        "action": "buy_ticket_v2",
        "publication_id": publication_id,
        "ticket_public_key": near_key(&ticket),
        "device": {
            "session_public_key": session,
            "certificate_sha256": certificate,
            "expires_at_ms": expires,
            "signature": device_signature,
        },
        "vat": { "vat_usdc_micro": vat, "expires_at_ms": expires, "key_version": "1", "signature": vat_signature },
    })
    .to_string();
    (msg, ticket_id)
}

fn sha256_hex(bytes: &[u8]) -> String {
    near_sdk::env::sha256(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

// Appends a WASM custom section so the module stays valid but hashes differently.
fn with_custom_section(wasm: &[u8], payload: &[u8]) -> Vec<u8> {
    fn leb128(mut value: usize, out: &mut Vec<u8>) {
        loop {
            let byte = (value & 0x7f) as u8;
            value >>= 7;
            if value == 0 {
                out.push(byte);
                return;
            }
            out.push(byte | 0x80);
        }
    }
    let name = b"youtick-upgrade-fixture";
    let mut body = Vec::new();
    leb128(name.len(), &mut body);
    body.extend_from_slice(name);
    body.extend_from_slice(payload);
    let mut out = wasm.to_vec();
    out.push(0);
    leb128(body.len(), &mut out);
    out.extend_from_slice(&body);
    out
}

#[tokio::test]
async fn self_upgrade_reverts_a_failed_migrate_then_deploys_the_proposed_code() -> anyhow::Result<()>
{
    let (contract, _bridge, guardian, creator, _usdc, admin) = init_with_admin().await?;
    guardian
        .call(contract.id(), "pause_new_purchases")
        .transact()
        .await?
        .into_result()?;
    let governance_before: serde_json::Value =
        contract.view("get_governance_state").await?.json()?;
    let v1 = contract.view_code().await?;
    assert_eq!(&v1, load_contract_wasm().await?);

    // Code without `migrate`: the deploy+migrate batch must revert as a whole.
    let no_migrate = load_mock_ft_wasm().await?.clone();
    admin
        .call(contract.id(), "propose_code_upgrade")
        .args_json(json!({ "code_sha256": sha256_hex(&no_migrate) }))
        .transact()
        .await?
        .into_result()?;
    let reverted = creator
        .call(contract.id(), "execute_code_upgrade")
        .args(no_migrate)
        .gas(Gas::from_tgas(300))
        .transact()
        .await?;
    assert!(reverted.is_failure());
    assert_eq!(contract.view_code().await?, v1);
    let pending: Option<serde_json::Value> =
        contract.view("get_pending_code_upgrade").await?.json()?;
    assert!(pending.is_some());
    guardian
        .call(contract.id(), "cancel_code_upgrade")
        .transact()
        .await?
        .into_result()?;

    let v2 = with_custom_section(&v1, b"v2");
    assert_ne!(sha256_hex(&v1), sha256_hex(&v2));
    admin
        .call(contract.id(), "propose_code_upgrade")
        .args_json(json!({ "code_sha256": sha256_hex(&v2) }))
        .transact()
        .await?
        .into_result()?;
    let wrong = creator
        .call(contract.id(), "execute_code_upgrade")
        .args(with_custom_section(&v1, b"other"))
        .gas(Gas::from_tgas(300))
        .transact()
        .await?;
    assert!(wrong.is_failure());
    assert_eq!(contract.view_code().await?, v1);

    let upgraded = creator
        .call(contract.id(), "execute_code_upgrade")
        .args(v2.clone())
        .gas(Gas::from_tgas(300))
        .transact()
        .await?;
    assert!(upgraded.is_success(), "{:?}", upgraded.failures());
    assert!(upgraded.logs().iter().any(|log| {
        log.contains("\"event\":\"code_upgraded\"") && log.contains(&sha256_hex(&v2))
    }));
    assert_eq!(contract.view_code().await?, v2);
    let pending: Option<serde_json::Value> =
        contract.view("get_pending_code_upgrade").await?.json()?;
    assert!(pending.is_none());
    let governance_after: serde_json::Value =
        contract.view("get_governance_state").await?.json()?;
    assert_eq!(governance_after, governance_before);
    assert_eq!(governance_after["new_purchases_paused"], true);
    Ok(())
}

#[tokio::test]
async fn watched_ticket_pays_the_creator_and_refund_returns_gross_on_chain() -> anyhow::Result<()> {
    let (contract, bridge, _guardian, creator, usdc) = init().await?;
    let buyer = creator
        .create_subaccount("buyer")
        .initial_balance(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;
    let storage_bounds: serde_json::Value = usdc.view("storage_balance_bounds").await?.json()?;
    let storage_min: u128 = storage_bounds["min"].as_str().expect("decimal").parse()?;
    for account_id in [contract.id(), buyer.id()] {
        creator
            .call(usdc.id(), "storage_deposit")
            .args_json(json!({ "account_id": account_id, "registration_only": true }))
            .deposit(NearToken::from_yoctonear(storage_min))
            .transact()
            .await?
            .into_result()?;
    }
    creator
        .call(usdc.id(), "ft_transfer")
        .args_json(json!({ "receiver_id": buyer.id(), "amount": "10000000" }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;
    creator
        .call(usdc.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": contract.id(),
            "amount": "500000",
            "msg": json!({
                "action": "create_paid_job",
                "job_id": "job-settle",
                "title": "Settle video",
                "price_usdc": "5000000",
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
    bridge
        .call(contract.id(), "finalize_livepeer_publication")
        .args_json(json!({
            "submission": {
                "job_id": "job-settle",
                "generation": 1,
                "creator_id": creator.id(),
                "expected_source_bytes": "1000000",
                "profile_id": "paid-media-livepeer-v1",
                "profile_config_sha256": PROFILE_HASH,
                "asset_id_hash": ASSET_HASH,
                "playback_id": "playback_settle",
                "project_id_hash": PROJECT_HASH,
                "verified_source_bytes": "1000000",
                "provider_source_fingerprint": null,
                "ready_at_ms": "1785589200000",
                "availability": "ACTIVE",
            },
        }))
        .transact()
        .await?
        .into_result()?;
    let mut tickets = Vec::new();
    for label in ["sandbox-watch", "sandbox-refund"] {
        let (msg, ticket_id) =
            purchase_message_for(contract.id().as_str(), "job-settle", 5_000_000, label);
        buyer
            .call(usdc.id(), "ft_transfer_call")
            .args_json(json!({ "receiver_id": contract.id(), "amount": "5000000", "msg": msg }))
            .deposit(NearToken::from_yoctonear(1))
            .gas(Gas::from_tgas(100))
            .transact()
            .await?
            .into_result()?;
        tickets.push(ticket_id);
    }

    // Any account (here the creator, standing in for the relayer) submits a ticket-key-signed
    // add_device; the viewer sends no transaction.
    let expires = (now_ms() + 1_800_000).to_string();
    let session = near_key(&test_key("sandbox-second-device"));
    let certificate = "e".repeat(64);
    let signature = sign_lines(
        &test_key("sandbox-watch"),
        &[
            "youtick.market-v2.ticket-sig.v1",
            "testnet",
            contract.id().as_str(),
            "add_device",
            &tickets[0],
            &expires,
            &session,
            &certificate,
            "0",
        ],
    );
    creator
        .call(contract.id(), "add_device")
        .args_json(json!({
            "ticket_id": tickets[0],
            "session_public_key": session,
            "certificate_sha256": certificate,
            "device_epoch": "0",
            "expires_at_ms": expires,
            "signature": signature,
        }))
        .transact()
        .await?
        .into_result()?;
    let with_device: serde_json::Value = contract
        .view("get_ticket")
        .args_json(json!({ "ticket_id": tickets[0] }))
        .await?
        .json()?;
    assert_eq!(with_device["devices"].as_array().unwrap().len(), 2);

    // Watch: the creator receives 3,958,334 (5 USDC, 833,333 VAT, 5% of net to the platform).
    let creator_before: u128 = ft_balance(&usdc, creator.id()).await?.parse()?;
    bridge
        .call(contract.id(), "mark_watched")
        .args_json(json!({ "ticket_id": tickets[0] }))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;
    let creator_after: u128 = ft_balance(&usdc, creator.id()).await?.parse()?;
    assert_eq!(creator_after - creator_before, 3_958_334);
    let tax: String = contract.view("get_tax_balance").await?.json()?;
    assert_eq!(tax, "833333");
    let escrow: String = contract.view("get_escrow_balance").await?.json()?;
    assert_eq!(escrow, "5000000");

    // A refund to an account without USDC storage fails in the token and is restored.
    let unregistered = creator
        .create_subaccount("unregistered")
        .initial_balance(NearToken::from_near(1))
        .transact()
        .await?
        .into_result()?;
    let expires = (now_ms() + 1_800_000).to_string();
    let failed_signature = sign_lines(
        &test_key("sandbox-refund"),
        &[
            "youtick.market-v2.ticket-sig.v1",
            "testnet",
            contract.id().as_str(),
            "refund_unwatched",
            &tickets[1],
            &expires,
            unregistered.id().as_str(),
        ],
    );
    let failed = creator
        .call(contract.id(), "refund_unwatched")
        .args_json(json!({
            "ticket_id": tickets[1],
            "refund_to": unregistered.id(),
            "expires_at_ms": expires,
            "signature": failed_signature,
        }))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;
    for outcome in failed.outcomes() {
        assert!(outcome.gas_burnt.as_gas() < 300_000_000_000_000);
    }
    let restored: serde_json::Value = contract
        .view("get_ticket")
        .args_json(json!({ "ticket_id": tickets[1] }))
        .await?
        .json()?;
    assert_eq!(restored["status"], "purchased");
    let escrow: String = contract.view("get_escrow_balance").await?.json()?;
    assert_eq!(escrow, "5000000");

    // Refund: the ticket key sends the whole gross amount back to the buyer.
    let buyer_before: u128 = ft_balance(&usdc, buyer.id()).await?.parse()?;
    let signature = sign_lines(
        &test_key("sandbox-refund"),
        &[
            "youtick.market-v2.ticket-sig.v1",
            "testnet",
            contract.id().as_str(),
            "refund_unwatched",
            &tickets[1],
            &expires,
            buyer.id().as_str(),
        ],
    );
    creator
        .call(contract.id(), "refund_unwatched")
        .args_json(json!({
            "ticket_id": tickets[1],
            "refund_to": buyer.id(),
            "expires_at_ms": expires,
            "signature": signature,
        }))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;
    let buyer_after: u128 = ft_balance(&usdc, buyer.id()).await?.parse()?;
    assert_eq!(buyer_after - buyer_before, 5_000_000);
    let refunded: serde_json::Value = contract
        .view("get_ticket")
        .args_json(json!({ "ticket_id": tickets[1] }))
        .await?
        .json()?;
    assert_eq!(refunded["status"], "refunded");
    assert_eq!(refunded["devices"], json!([]));
    let escrow: String = contract.view("get_escrow_balance").await?.json()?;
    assert_eq!(escrow, "0");
    Ok(())
}
