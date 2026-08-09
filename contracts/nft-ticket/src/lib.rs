use near_sdk::collections::LookupMap;
use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    PromiseResult,
};

const TESTNET_USDC: &str = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const MAINNET_USDC: &str = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const PROFILE: &str = "paid-media-livepeer-v1";
const PAID_SOURCE_MAX_BYTES: u128 = 20_000_000_000;
const MIN_TICKET_PRICE_USDC: u128 = 2_000_000;
const MIN_UPLOAD_FEE_USDC: u128 = 500_000;
const UPLOAD_FEE_NUMERATOR: u128 = 3;
const UPLOAD_FEE_DENOMINATOR: u128 = 10_000;
const FT_TRANSFER_GAS: Gas = Gas::from_tgas(20);
const WITHDRAW_CALLBACK_GAS: Gas = Gas::from_tgas(10);
const QUOTE_MAX_SOURCE_AGE_MS: u64 = 60_000;
const QUOTE_MAX_LIFETIME_MS: u64 = 120_000;
const MARKET_STATE_VERSION: u32 = 2;
// Kept outside Contract so an emergency purchase control does not change the
// deployed Market v2 Borsh layout or require a state migration.
const NEW_PURCHASES_PAUSED_KEY: &[u8] = b"youtick:market:control:new-purchases-paused:v1";

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FeeAsset {
    Usdc,
    Near,
}

#[derive(Clone, Copy)]
pub struct StorageKey(pub &'static [u8]);

impl near_sdk::IntoStorageKey for StorageKey {
    fn into_storage_key(self) -> Vec<u8> {
        self.0.to_vec()
    }
}

impl StorageKey {
    const MEDIA_JOBS: Self = Self(b"livepeer-v1:jobs");
    const PUBLICATIONS: Self = Self(b"livepeer-v1:publications");
    const ASSET_BINDINGS: Self = Self(b"livepeer-v1:asset-bindings");
    const PLAYBACK_BINDINGS: Self = Self(b"livepeer-v1:playback-bindings");
    const ENTITLEMENTS: Self = Self(b"livepeer-v1:entitlements");
    const CREATOR_BALANCES: Self = Self(b"livepeer-v1:creator-balances");
    const TAKEDOWNS: Self = Self(b"livepeer-v1:takedowns");
    const PUBLICATION_IDS: Self = Self(b"livepeer-v1:publication-ids");
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MediaJobStatus {
    Authorized,
    Published,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PublicationAvailability {
    Active,
    SalesSuspended,
    Takedown,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MediaJob {
    pub job_id: String,
    pub creator_id: AccountId,
    pub profile_id: String,
    pub profile_config_sha256: String,
    pub title: String,
    pub price_usdc: U128,
    pub expected_source_bytes: U128,
    pub generation: u64,
    pub status: MediaJobStatus,
    pub created_at_ms: u64,
    pub published_at_ms: Option<u64>,
    pub fee_asset: FeeAsset,
    pub fee_amount: U128,
    pub fee_usd_micro: U128,
    pub upload_public_key: String,
    pub upload_key_expires_at_ms: U64,
    pub fee_quote_hash: Option<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Publication {
    pub publication_id: String,
    pub creator_id: AccountId,
    pub title: String,
    pub price_usdc: U128,
    pub generation: u64,
    pub expected_source_bytes: U128,
    pub profile_id: String,
    pub profile_config_sha256: String,
    pub asset_id_hash: String,
    pub playback_id: String,
    pub project_id_hash: String,
    pub verified_source_bytes: U128,
    pub provider_source_fingerprint: Option<String>,
    pub ready_at_ms: U64,
    pub published_availability: PublicationAvailability,
    pub availability: PublicationAvailability,
    pub published_at_ms: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LivepeerPublicationSubmission {
    pub job_id: String,
    pub generation: u64,
    pub creator_id: AccountId,
    pub expected_source_bytes: U128,
    pub profile_id: String,
    pub profile_config_sha256: String,
    pub asset_id_hash: String,
    pub playback_id: String,
    pub project_id_hash: String,
    pub verified_source_bytes: U128,
    pub provider_source_fingerprint: Option<String>,
    pub ready_at_ms: U64,
    pub availability: PublicationAvailability,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TakedownRecord {
    pub publication_id: String,
    pub reason_code: String,
    pub incident_id: String,
    pub evidence_sha256: String,
    pub effective_at_ms: U64,
    pub recorded_at_ms: U64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GovernanceState {
    pub state_version: u32,
    pub admin_account_id: AccountId,
    pub guardian_account_id: AccountId,
    pub active_bridge_account_id: AccountId,
    pub pending_bridge_account_id: Option<AccountId>,
    pub bridge_frozen: bool,
    pub new_purchases_paused: bool,
    pub bridge_rotation_proposed_at_ms: Option<U64>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StorageReserveStatus {
    pub storage_usage_bytes: U64,
    pub storage_byte_cost_yocto: U128,
    pub storage_stake_yocto: U128,
    pub operational_reserve_yocto: U128,
    pub account_balance_yocto: U128,
    pub reserve_headroom_yocto: U128,
    pub reserve_runway_bytes: U128,
    pub reserve_covered: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MarketInitConfig {
    pub platform_account_id: AccountId,
    pub bridge_account_id: AccountId,
    pub takedown_authority_id: AccountId,
    pub admin_account_id: AccountId,
    pub guardian_account_id: AccountId,
    pub quote_public_key: Base64VecU8,
    pub quote_key_version: u32,
    pub near_operational_reserve: U128,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct TransferMessage {
    action: Option<String>,
    publication_id: Option<String>,
    job_id: Option<String>,
    title: Option<String>,
    price_usdc: Option<U128>,
    expected_source_bytes: Option<U128>,
    profile_id: Option<String>,
    profile_config_sha256: Option<String>,
    upload_public_key: Option<String>,
    upload_key_expires_at_ms: Option<U64>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PaidJobRequest {
    pub creator_id: AccountId,
    pub job_id: String,
    pub title: String,
    pub price_usdc: U128,
    pub expected_source_bytes: U128,
    pub profile_id: String,
    pub profile_config_sha256: String,
    pub upload_public_key: String,
    pub upload_key_expires_at_ms: U64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CreatorFeeQuote {
    pub domain: String,
    pub version: String,
    pub network: String,
    pub contract_id: AccountId,
    pub creator_id: AccountId,
    pub job_id: String,
    pub expected_source_bytes: U128,
    pub fee_usd_micro: U128,
    pub near_usd_micro: U128,
    pub fee_near_yocto: U128,
    pub rate_source: String,
    pub rate_timestamp_ms: U64,
    pub expires_at_ms: U64,
    pub quote_key_version: u32,
    pub quote_id: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct FtTransferArgs {
    receiver_id: AccountId,
    amount: U128,
    memo: Option<String>,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct CreatorWithdrawCallbackArgs {
    creator_id: AccountId,
    amount: U128,
    withdrawal_id: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct PlatformWithdrawCallbackArgs {
    amount: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct NearWithdrawCallbackArgs {
    amount: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    state_version: u32,
    platform_account_id: AccountId,
    admin_account_id: AccountId,
    guardian_account_id: AccountId,
    active_bridge_account_id: AccountId,
    pending_bridge_account_id: Option<AccountId>,
    bridge_frozen: bool,
    bridge_rotation_proposed_at_ms: Option<u64>,
    takedown_authority_id: AccountId,
    media_jobs: LookupMap<String, MediaJob>,
    publications: LookupMap<String, Publication>,
    asset_bindings: LookupMap<String, String>,
    playback_bindings: LookupMap<String, String>,
    entitlements: LookupMap<String, bool>,
    creator_balances: LookupMap<AccountId, u128>,
    takedowns: LookupMap<String, TakedownRecord>,
    platform_balance: u128,
    publication_ids: LookupMap<u64, String>,
    publication_count: u64,
    platform_near_balance: u128,
    quote_public_key: Vec<u8>,
    quote_key_version: u32,
    near_operational_reserve: u128,
}

#[near]
impl Contract {
    #[init]
    pub fn new(config: MarketInitConfig) -> Self {
        let MarketInitConfig {
            platform_account_id,
            bridge_account_id,
            takedown_authority_id,
            admin_account_id,
            guardian_account_id,
            quote_public_key,
            quote_key_version,
            near_operational_reserve,
        } = config;
        require!(
            platform_account_id != bridge_account_id,
            "Platform and bridge accounts must differ"
        );
        require!(
            quote_public_key.0.len() == 32,
            "Quote public key must be Ed25519"
        );
        require!(quote_key_version > 0, "Quote key version must be positive");
        require!(
            admin_account_id != guardian_account_id,
            "Admin and guardian accounts must differ"
        );
        require!(
            admin_account_id != bridge_account_id && guardian_account_id != bridge_account_id,
            "Admin, guardian and bridge accounts must differ"
        );
        require!(
            takedown_authority_id != bridge_account_id
                && takedown_authority_id != platform_account_id,
            "Takedown authority must be separate"
        );
        Self {
            state_version: MARKET_STATE_VERSION,
            platform_account_id,
            admin_account_id,
            guardian_account_id,
            active_bridge_account_id: bridge_account_id,
            pending_bridge_account_id: None,
            bridge_frozen: false,
            bridge_rotation_proposed_at_ms: None,
            takedown_authority_id,
            media_jobs: LookupMap::new(StorageKey::MEDIA_JOBS),
            publications: LookupMap::new(StorageKey::PUBLICATIONS),
            asset_bindings: LookupMap::new(StorageKey::ASSET_BINDINGS),
            playback_bindings: LookupMap::new(StorageKey::PLAYBACK_BINDINGS),
            entitlements: LookupMap::new(StorageKey::ENTITLEMENTS),
            creator_balances: LookupMap::new(StorageKey::CREATOR_BALANCES),
            takedowns: LookupMap::new(StorageKey::TAKEDOWNS),
            platform_balance: 0,
            publication_ids: LookupMap::new(StorageKey::PUBLICATION_IDS),
            publication_count: 0,
            platform_near_balance: 0,
            quote_public_key: quote_public_key.0,
            quote_key_version,
            near_operational_reserve: near_operational_reserve.0,
        }
    }

    pub fn freeze_bridge(&mut self) {
        self.assert_guardian();
        if self.bridge_frozen {
            return;
        }
        self.bridge_frozen = true;
        emit_governance_event(
            "bridge_frozen",
            near_sdk::serde_json::json!({
                "actor_id": env::predecessor_account_id(),
                "active_bridge_account_id": self.active_bridge_account_id,
            }),
        );
    }

    pub fn unfreeze_bridge(&mut self) {
        self.assert_admin();
        if !self.bridge_frozen {
            return;
        }
        self.bridge_frozen = false;
        emit_governance_event(
            "bridge_unfrozen",
            near_sdk::serde_json::json!({
                "actor_id": env::predecessor_account_id(),
                "active_bridge_account_id": self.active_bridge_account_id,
            }),
        );
    }

    pub fn pause_new_purchases(&mut self) {
        self.assert_guardian();
        if self.new_purchases_paused() {
            return;
        }
        env::storage_write(NEW_PURCHASES_PAUSED_KEY, &[1]);
        emit_governance_event(
            "new_purchases_paused",
            near_sdk::serde_json::json!({
                "actor_id": env::predecessor_account_id(),
            }),
        );
    }

    pub fn unpause_new_purchases(&mut self) {
        self.assert_admin();
        if !self.new_purchases_paused() {
            return;
        }
        env::storage_remove(NEW_PURCHASES_PAUSED_KEY);
        emit_governance_event(
            "new_purchases_unpaused",
            near_sdk::serde_json::json!({
                "actor_id": env::predecessor_account_id(),
            }),
        );
    }

    pub fn propose_bridge(&mut self, next_bridge_account_id: AccountId) {
        self.assert_admin();
        self.assert_valid_bridge_account(&next_bridge_account_id);
        if self.pending_bridge_account_id.as_ref() == Some(&next_bridge_account_id) {
            return;
        }
        require!(
            self.pending_bridge_account_id.is_none(),
            "Bridge rotation already pending"
        );
        let proposed_at_ms = env::block_timestamp_ms();
        self.pending_bridge_account_id = Some(next_bridge_account_id.clone());
        self.bridge_rotation_proposed_at_ms = Some(proposed_at_ms);
        emit_governance_event(
            "bridge_rotation_proposed",
            near_sdk::serde_json::json!({
                "actor_id": env::predecessor_account_id(),
                "active_bridge_account_id": self.active_bridge_account_id,
                "pending_bridge_account_id": next_bridge_account_id,
                "proposed_at_ms": proposed_at_ms.to_string(),
            }),
        );
    }

    pub fn cancel_bridge_rotation(&mut self) {
        self.assert_admin_or_guardian();
        let Some(pending_bridge_account_id) = self.pending_bridge_account_id.take() else {
            return;
        };
        self.bridge_rotation_proposed_at_ms = None;
        emit_governance_event(
            "bridge_rotation_cancelled",
            near_sdk::serde_json::json!({
                "actor_id": env::predecessor_account_id(),
                "active_bridge_account_id": self.active_bridge_account_id,
                "pending_bridge_account_id": pending_bridge_account_id,
            }),
        );
    }

    pub fn execute_bridge_rotation(&mut self) {
        self.assert_admin();
        let next_bridge_account_id = self
            .pending_bridge_account_id
            .take()
            .expect("Bridge rotation is not pending");
        let previous_bridge_account_id =
            std::mem::replace(&mut self.active_bridge_account_id, next_bridge_account_id);
        self.bridge_rotation_proposed_at_ms = None;
        emit_governance_event(
            "bridge_rotated",
            near_sdk::serde_json::json!({
                "actor_id": env::predecessor_account_id(),
                "previous_bridge_account_id": previous_bridge_account_id,
                "active_bridge_account_id": self.active_bridge_account_id,
            }),
        );
    }

    pub fn create_paid_job(&mut self, request: PaidJobRequest) -> MediaJob {
        let PaidJobRequest {
            creator_id,
            job_id,
            title,
            price_usdc,
            expected_source_bytes,
            profile_id,
            profile_config_sha256,
            upload_public_key,
            upload_key_expires_at_ms,
        } = request;
        require!(
            env::predecessor_account_id() == self.usdc_contract_id(),
            "Paid jobs must be created through USDC ft_transfer_call"
        );
        assert_identifier("job_id", &job_id);
        assert_title(&title);
        assert_source_bytes(expected_source_bytes.0);
        assert_profile(&profile_id, &profile_config_sha256);
        assert_upload_key(&upload_public_key, upload_key_expires_at_ms.0);
        require!(
            price_usdc.0 >= MIN_TICKET_PRICE_USDC,
            "USDC ticket price must be at least 2.000000"
        );
        require!(
            self.media_jobs.get(&job_id).is_none(),
            "Media job already exists"
        );

        let fee_usd_micro = upload_fee_usdc(expected_source_bytes.0);
        let job = MediaJob {
            job_id: job_id.clone(),
            creator_id,
            profile_id,
            profile_config_sha256,
            title,
            price_usdc,
            expected_source_bytes,
            generation: 1,
            status: MediaJobStatus::Authorized,
            created_at_ms: env::block_timestamp_ms(),
            published_at_ms: None,
            fee_asset: FeeAsset::Usdc,
            fee_amount: U128(fee_usd_micro),
            fee_usd_micro: U128(fee_usd_micro),
            upload_public_key,
            upload_key_expires_at_ms,
            fee_quote_hash: None,
        };
        self.media_jobs.insert(&job_id, &job);
        emit_media_job_authorized(&job);
        job
    }

    #[payable]
    pub fn create_paid_job_near(
        &mut self,
        request: PaidJobRequest,
        quote: CreatorFeeQuote,
        quote_signature: Base64VecU8,
    ) -> PromiseOrValue<MediaJob> {
        require!(
            env::predecessor_account_id() == request.creator_id,
            "Creator mismatch"
        );
        self.verify_creator_fee_quote(&request, &quote, &quote_signature.0);
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            deposit == quote.fee_near_yocto.0,
            "Incorrect creator upload fee"
        );

        if let Some(existing) = self.media_jobs.get(&request.job_id) {
            require!(
                job_matches_request(&existing, &request, &quote),
                "Conflicting paid job replay"
            );
            return PromiseOrValue::Promise(
                Promise::new(request.creator_id).transfer(NearToken::from_yoctonear(deposit)),
            );
        }

        assert_paid_job_request(&request);
        let job = MediaJob {
            job_id: request.job_id.clone(),
            creator_id: request.creator_id,
            profile_id: request.profile_id,
            profile_config_sha256: request.profile_config_sha256,
            title: request.title,
            price_usdc: request.price_usdc,
            expected_source_bytes: request.expected_source_bytes,
            generation: 1,
            status: MediaJobStatus::Authorized,
            created_at_ms: env::block_timestamp_ms(),
            published_at_ms: None,
            fee_asset: FeeAsset::Near,
            fee_amount: quote.fee_near_yocto,
            fee_usd_micro: quote.fee_usd_micro,
            upload_public_key: request.upload_public_key,
            upload_key_expires_at_ms: request.upload_key_expires_at_ms,
            fee_quote_hash: Some(quote.quote_id),
        };
        self.media_jobs.insert(&job.job_id, &job);
        self.platform_near_balance = self
            .platform_near_balance
            .checked_add(deposit)
            .expect("Platform NEAR balance overflow");
        emit_media_job_authorized(&job);
        PromiseOrValue::Value(job)
    }

    pub fn replace_upload_key(
        &mut self,
        job_id: String,
        new_public_key: String,
        expires_at_ms: U64,
    ) -> MediaJob {
        let mut job = self.media_jobs.get(&job_id).expect("Media job not found");
        require!(
            env::predecessor_account_id() == job.creator_id,
            "Only the creator can replace the upload key"
        );
        require!(
            job.status == MediaJobStatus::Authorized,
            "Published media jobs cannot replace upload keys"
        );
        assert_upload_key(&new_public_key, expires_at_ms.0);
        job.upload_public_key = new_public_key;
        job.upload_key_expires_at_ms = expires_at_ms;
        self.media_jobs.insert(&job_id, &job);
        let upload_public_key_sha256 = hex_sha256(job.upload_public_key.as_bytes());
        emit_market_event(
            "media_job_upload_key_replaced",
            &format!(
                "job:{}:{}:upload-key:{}",
                job.job_id, job.generation, upload_public_key_sha256
            ),
            near_sdk::serde_json::json!({
                "account_id": job.creator_id,
                "job_id": job.job_id,
                "generation": job.generation,
                "upload_public_key_sha256": upload_public_key_sha256,
                "upload_key_expires_at_ms": job.upload_key_expires_at_ms,
            }),
        );
        job
    }

    pub fn rotate_quote_public_key(&mut self, version: u32, public_key: Base64VecU8) {
        require!(
            env::predecessor_account_id() == self.platform_account_id,
            "Only the platform account can rotate quote keys"
        );
        require!(
            version
                == self
                    .quote_key_version
                    .checked_add(1)
                    .expect("Quote key version overflow"),
            "Quote key version must increase by one"
        );
        require!(public_key.0.len() == 32, "Quote public key must be Ed25519");
        self.quote_key_version = version;
        self.quote_public_key = public_key.0;
        emit_market_event(
            "quote_key_rotated",
            &format!("quote-key:{version}"),
            near_sdk::serde_json::json!({
                "account_id": env::predecessor_account_id(),
                "quote_key_version": version,
                "quote_public_key_sha256": hex_sha256(&self.quote_public_key),
            }),
        );
    }

    pub fn restart_paid_job(
        &mut self,
        job_id: String,
        expected_source_bytes: U128,
        profile_id: String,
        profile_config_sha256: String,
    ) -> MediaJob {
        let mut job = self.media_jobs.get(&job_id).expect("Media job not found");
        require!(
            env::predecessor_account_id() == job.creator_id,
            "Only the creator can restart a media job"
        );
        require!(
            job.status != MediaJobStatus::Published,
            "Published media jobs cannot restart"
        );
        assert_source_bytes(expected_source_bytes.0);
        assert_profile(&profile_id, &profile_config_sha256);
        require!(
            job.expected_source_bytes == expected_source_bytes,
            "A retry must keep the original source byte count"
        );

        job.generation = job.generation.checked_add(1).expect("Generation overflow");
        job.profile_id = profile_id;
        job.profile_config_sha256 = profile_config_sha256;
        self.media_jobs.insert(&job_id, &job);
        job
    }

    pub fn finalize_livepeer_publication(
        &mut self,
        submission: LivepeerPublicationSubmission,
    ) -> Publication {
        self.assert_bridge();
        require!(
            submission.availability == PublicationAvailability::Active,
            "Initial publication availability must be active"
        );
        assert_profile(&submission.profile_id, &submission.profile_config_sha256);
        assert_sha256("asset_id_hash", &submission.asset_id_hash);
        assert_playback_id(&submission.playback_id);
        assert_sha256("project_id_hash", &submission.project_id_hash);
        if let Some(fingerprint) = &submission.provider_source_fingerprint {
            assert_sha256("provider_source_fingerprint", fingerprint);
        }
        require!(submission.ready_at_ms.0 > 0, "ready_at_ms must be positive");

        let mut job = self.job_for_generation(&submission.job_id, submission.generation);
        require!(
            job.creator_id == submission.creator_id,
            "Media job creator mismatch"
        );
        require!(
            job.expected_source_bytes == submission.expected_source_bytes,
            "Expected source byte mismatch"
        );
        require!(
            submission.verified_source_bytes == submission.expected_source_bytes,
            "Verified source byte mismatch"
        );
        require!(
            job.profile_id == submission.profile_id,
            "Media job profile mismatch"
        );
        require!(
            job.profile_config_sha256 == submission.profile_config_sha256,
            "Media job profile configuration mismatch"
        );

        if let Some(existing) = self.publications.get(&submission.job_id) {
            require!(
                publication_matches(&existing, &submission),
                "Conflicting finalize request"
            );
            return existing;
        }

        self.bind_identity(
            &self.asset_bindings,
            &submission.asset_id_hash,
            &submission.job_id,
            "asset_id_hash",
        );
        self.bind_identity(
            &self.playback_bindings,
            &submission.playback_id,
            &submission.job_id,
            "playback_id",
        );

        let published_at_ms = env::block_timestamp_ms();
        let publication = Publication {
            publication_id: submission.job_id.clone(),
            creator_id: submission.creator_id,
            title: job.title.clone(),
            price_usdc: job.price_usdc,
            generation: submission.generation,
            expected_source_bytes: submission.expected_source_bytes,
            profile_id: submission.profile_id,
            profile_config_sha256: submission.profile_config_sha256,
            asset_id_hash: submission.asset_id_hash.clone(),
            playback_id: submission.playback_id.clone(),
            project_id_hash: submission.project_id_hash,
            verified_source_bytes: submission.verified_source_bytes,
            provider_source_fingerprint: submission.provider_source_fingerprint,
            ready_at_ms: submission.ready_at_ms,
            published_availability: submission.availability.clone(),
            availability: submission.availability,
            published_at_ms,
        };
        job.status = MediaJobStatus::Published;
        job.published_at_ms = Some(published_at_ms);
        self.media_jobs.insert(&submission.job_id, &job);
        self.publications.insert(&submission.job_id, &publication);
        let next_count = self
            .publication_count
            .checked_add(1)
            .expect("Publication count overflow");
        self.publication_ids
            .insert(&self.publication_count, &submission.job_id);
        self.publication_count = next_count;
        self.asset_bindings
            .insert(&submission.asset_id_hash, &submission.job_id);
        self.playback_bindings
            .insert(&submission.playback_id, &submission.job_id);
        emit_market_event(
            "publication_finalized",
            &format!(
                "publication:{}:{}:finalized",
                publication.publication_id, publication.generation
            ),
            near_sdk::serde_json::json!({
                "account_id": publication.creator_id,
                "publication_id": publication.publication_id,
                "job_id": submission.job_id,
                "generation": publication.generation,
                "title": publication.title,
                "playback_id": publication.playback_id,
                "published_at_ms": publication.published_at_ms,
                "asset": "USDC",
                "amount": publication.price_usdc,
                "availability": publication.availability,
            }),
        );
        publication
    }

    pub fn suspend_livepeer_sales(&mut self, publication_id: String) -> Publication {
        self.assert_bridge();
        let mut publication = self
            .publications
            .get(&publication_id)
            .expect("Publication not found");
        require!(
            publication.availability != PublicationAvailability::Takedown,
            "Takedown publication cannot change through sales suspension"
        );
        if publication.availability == PublicationAvailability::SalesSuspended {
            return publication;
        }
        publication.availability = PublicationAvailability::SalesSuspended;
        self.publications.insert(&publication_id, &publication);
        emit_market_event(
            "publication_sales_suspended",
            &format!("publication:{publication_id}:sales-suspended"),
            near_sdk::serde_json::json!({
                "account_id": publication.creator_id,
                "publication_id": publication_id,
                "generation": publication.generation,
                "availability": publication.availability,
            }),
        );
        publication
    }

    pub fn takedown_livepeer_publication(
        &mut self,
        publication_id: String,
        reason_code: String,
        incident_id: String,
        evidence_sha256: String,
        effective_at_ms: U64,
    ) -> Publication {
        self.assert_takedown_authority();
        require!(
            matches!(
                reason_code.as_str(),
                "PUBLIC_MEDIA_EXPOSURE"
                    | "LEGAL_REQUIREMENT"
                    | "KEY_COMPROMISE"
                    | "GOVERNANCE_DECISION"
            ),
            "Unsupported takedown reason"
        );
        assert_identifier("incident_id", &incident_id);
        assert_sha256("evidence_sha256", &evidence_sha256);
        require!(
            effective_at_ms.0 > 0 && effective_at_ms.0 <= env::block_timestamp_ms(),
            "Takedown effective time must have arrived"
        );
        let mut publication = self
            .publications
            .get(&publication_id)
            .expect("Publication not found");
        if publication.availability == PublicationAvailability::Takedown {
            let existing = self
                .takedowns
                .get(&publication_id)
                .expect("Takedown record missing");
            require!(
                existing.reason_code == reason_code
                    && existing.incident_id == incident_id
                    && existing.evidence_sha256 == evidence_sha256
                    && existing.effective_at_ms == effective_at_ms,
                "Conflicting takedown request"
            );
            return publication;
        }
        require!(
            matches!(
                publication.availability,
                PublicationAvailability::Active | PublicationAvailability::SalesSuspended
            ),
            "Publication cannot transition to takedown"
        );
        let record = TakedownRecord {
            publication_id: publication_id.clone(),
            reason_code,
            incident_id,
            evidence_sha256,
            effective_at_ms,
            recorded_at_ms: U64(env::block_timestamp_ms()),
        };
        publication.availability = PublicationAvailability::Takedown;
        self.publications.insert(&publication_id, &publication);
        self.takedowns.insert(&publication_id, &record);
        emit_market_event(
            "publication_takedown",
            &format!(
                "publication:{publication_id}:takedown:{}",
                record.incident_id
            ),
            near_sdk::serde_json::json!({
                "account_id": publication.creator_id,
                "publication_id": publication_id,
                "generation": publication.generation,
                "reason_code": record.reason_code,
                "incident_id": record.incident_id,
                "evidence_sha256": record.evidence_sha256,
                "effective_at_ms": record.effective_at_ms,
                "availability": publication.availability,
            }),
        );
        publication
    }

    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.usdc_contract_id(),
            "Only Circle USDC is accepted"
        );
        let message: TransferMessage =
            near_sdk::serde_json::from_str(&msg).expect("Invalid purchase message");

        if message.action.as_deref() == Some("create_paid_job") {
            require!(message.publication_id.is_none(), "Invalid paid job message");
            let expected_source_bytes = message
                .expected_source_bytes
                .expect("expected_source_bytes is required");
            let expected_fee = upload_fee_usdc(expected_source_bytes.0);
            require!(amount.0 == expected_fee, "Incorrect creator upload fee");
            let job_id = message.job_id.expect("job_id is required");
            let title = message.title.expect("title is required");
            let price_usdc = message.price_usdc.expect("price_usdc is required");
            let profile_id = message.profile_id.expect("profile_id is required");
            let profile_config_sha256 = message
                .profile_config_sha256
                .expect("profile_config_sha256 is required");
            let upload_public_key = message
                .upload_public_key
                .expect("upload_public_key is required");
            let upload_key_expires_at_ms = message
                .upload_key_expires_at_ms
                .expect("upload_key_expires_at_ms is required");

            if let Some(existing) = self.media_jobs.get(&job_id) {
                require!(
                    existing.creator_id == sender_id
                        && existing.title == title
                        && existing.price_usdc == price_usdc
                        && existing.expected_source_bytes == expected_source_bytes
                        && existing.profile_id == profile_id
                        && existing.profile_config_sha256 == profile_config_sha256
                        && existing.upload_public_key == upload_public_key
                        && existing.upload_key_expires_at_ms == upload_key_expires_at_ms
                        && existing.fee_asset == FeeAsset::Usdc,
                    "Conflicting paid job replay"
                );
                return PromiseOrValue::Value(amount);
            }

            self.create_paid_job(PaidJobRequest {
                creator_id: sender_id,
                job_id,
                title,
                price_usdc,
                expected_source_bytes,
                profile_id,
                profile_config_sha256,
                upload_public_key,
                upload_key_expires_at_ms,
            });
            self.platform_balance = self
                .platform_balance
                .checked_add(amount.0)
                .expect("Platform balance overflow");
            return PromiseOrValue::Value(U128(0));
        }

        require!(
            message.action.as_deref().is_none() || message.action.as_deref() == Some("buy_ticket"),
            "Unsupported transfer action"
        );
        if self.new_purchases_paused() {
            return PromiseOrValue::Value(amount);
        }
        let publication_id = message.publication_id.expect("publication_id is required");
        let publication = self
            .publications
            .get(&publication_id)
            .expect("Publication not found");
        let entitlement_key = entitlement_key(&sender_id, &publication_id);

        if publication.availability != PublicationAvailability::Active
            || amount != publication.price_usdc
            || self.entitlements.get(&entitlement_key).is_some()
        {
            return PromiseOrValue::Value(amount);
        }

        let platform_amount = amount.0 / 50;
        let creator_amount = amount.0 - platform_amount;
        let creator_balance = self
            .creator_balances
            .get(&publication.creator_id)
            .unwrap_or(0)
            .checked_add(creator_amount)
            .expect("Creator balance overflow");
        self.creator_balances
            .insert(&publication.creator_id, &creator_balance);
        self.platform_balance = self
            .platform_balance
            .checked_add(platform_amount)
            .expect("Platform balance overflow");
        self.entitlements.insert(&entitlement_key, &true);
        emit_market_event(
            "entitlement_purchased",
            &format!("entitlement:{sender_id}:{publication_id}"),
            near_sdk::serde_json::json!({
                "account_id": sender_id,
                "creator_id": publication.creator_id,
                "publication_id": publication_id,
                "asset": "USDC",
                "amount": amount,
                "creator_amount": creator_amount.to_string(),
                "platform_amount": platform_amount.to_string(),
            }),
        );

        PromiseOrValue::Value(U128(0))
    }

    pub fn withdraw_creator_balance(&mut self) -> Promise {
        let creator_id = env::predecessor_account_id();
        let amount = self.creator_balances.get(&creator_id).unwrap_or(0);
        require!(amount > 0, "No creator balance");
        self.creator_balances.insert(&creator_id, &0);
        let withdrawal_id = format!(
            "creator-withdrawal:{creator_id}:{amount}:{}",
            env::block_timestamp_ms()
        );
        emit_market_event(
            "creator_balance_withdrawal_started",
            &withdrawal_id,
            near_sdk::serde_json::json!({
                "account_id": creator_id,
                "asset": "USDC",
                "amount": amount.to_string(),
                "withdrawal_id": withdrawal_id,
            }),
        );

        self.ft_transfer(creator_id.clone(), amount, "creator payout")
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_creator_withdraw".to_string(),
                    near_sdk::serde_json::to_vec(&CreatorWithdrawCallbackArgs {
                        creator_id,
                        amount: U128(amount),
                        withdrawal_id,
                    })
                    .expect("Failed to serialize callback"),
                    NearToken::from_yoctonear(0),
                    WITHDRAW_CALLBACK_GAS,
                ),
            )
    }

    pub fn withdraw_platform_balance(&mut self) -> Promise {
        require!(
            env::predecessor_account_id() == self.platform_account_id,
            "Only the platform account can withdraw"
        );
        let amount = self.platform_balance;
        require!(amount > 0, "No platform balance");
        self.platform_balance = 0;
        let withdrawal_id = format!(
            "platform-withdrawal:USDC:{amount}:{}",
            env::block_timestamp_ms()
        );
        emit_market_event(
            "platform_withdrawal_started",
            &withdrawal_id,
            near_sdk::serde_json::json!({
                "account_id": self.platform_account_id,
                "asset": "USDC",
                "amount": amount.to_string(),
                "withdrawal_id": withdrawal_id,
            }),
        );

        self.ft_transfer(
            self.platform_account_id.clone(),
            amount,
            "platform commission",
        )
        .then(
            Promise::new(env::current_account_id()).function_call(
                "on_platform_withdraw".to_string(),
                near_sdk::serde_json::to_vec(&PlatformWithdrawCallbackArgs {
                    amount: U128(amount),
                })
                .expect("Failed to serialize callback"),
                NearToken::from_yoctonear(0),
                WITHDRAW_CALLBACK_GAS,
            ),
        )
    }

    pub fn withdraw_platform_near(&mut self, amount: U128) -> Promise {
        require!(
            env::predecessor_account_id() == self.platform_account_id,
            "Only the platform account can withdraw"
        );
        require!(
            amount.0 > 0 && amount.0 <= self.platform_near_balance,
            "Insufficient platform NEAR balance"
        );
        let liquid = self.storage_reserve_status().reserve_headroom_yocto.0;
        require!(
            amount.0 <= liquid,
            "Withdrawal would consume storage stake or reserve"
        );
        self.platform_near_balance -= amount.0;
        let withdrawal_id = format!(
            "platform-withdrawal:NEAR:{}:{}",
            amount.0,
            env::block_timestamp_ms()
        );
        emit_market_event(
            "platform_withdrawal_started",
            &withdrawal_id,
            near_sdk::serde_json::json!({
                "account_id": self.platform_account_id,
                "asset": "NEAR",
                "amount": amount,
                "withdrawal_id": withdrawal_id,
            }),
        );
        Promise::new(self.platform_account_id.clone())
            .transfer(NearToken::from_yoctonear(amount.0))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_platform_near_withdraw".to_string(),
                    near_sdk::serde_json::to_vec(&NearWithdrawCallbackArgs { amount })
                        .expect("Failed to serialize callback"),
                    NearToken::from_yoctonear(0),
                    WITHDRAW_CALLBACK_GAS,
                ),
            )
    }

    #[private]
    pub fn on_creator_withdraw(
        &mut self,
        creator_id: AccountId,
        amount: U128,
        withdrawal_id: String,
    ) -> bool {
        require!(
            env::promise_results_count() == 1,
            "Expected one withdrawal result"
        );
        if matches!(env::promise_result(0), PromiseResult::Successful(_)) {
            emit_market_event(
                "creator_balance_withdrawal_succeeded",
                &withdrawal_id,
                near_sdk::serde_json::json!({
                    "account_id": creator_id,
                    "asset": "USDC",
                    "amount": amount,
                    "withdrawal_id": withdrawal_id,
                }),
            );
            return true;
        }
        let restored = self
            .creator_balances
            .get(&creator_id)
            .unwrap_or(0)
            .checked_add(amount.0)
            .expect("Creator balance overflow");
        self.creator_balances.insert(&creator_id, &restored);
        emit_market_event(
            "creator_balance_withdrawal_failed",
            &withdrawal_id,
            near_sdk::serde_json::json!({
                "account_id": creator_id,
                "asset": "USDC",
                "amount": amount,
                "withdrawal_id": withdrawal_id,
                "reason_code": "PROMISE_FAILED",
            }),
        );
        false
    }

    #[private]
    pub fn on_platform_withdraw(&mut self, amount: U128) -> bool {
        require!(
            env::promise_results_count() == 1,
            "Expected one withdrawal result"
        );
        if matches!(env::promise_result(0), PromiseResult::Successful(_)) {
            return true;
        }
        self.platform_balance = self
            .platform_balance
            .checked_add(amount.0)
            .expect("Platform balance overflow");
        false
    }

    #[private]
    pub fn on_platform_near_withdraw(&mut self, amount: U128) -> bool {
        require!(
            env::promise_results_count() == 1,
            "Expected one withdrawal result"
        );
        if matches!(env::promise_result(0), PromiseResult::Successful(_)) {
            return true;
        }
        self.platform_near_balance = self
            .platform_near_balance
            .checked_add(amount.0)
            .expect("Platform NEAR balance overflow");
        false
    }

    pub fn get_media_job(&self, job_id: String) -> Option<MediaJob> {
        self.media_jobs.get(&job_id)
    }

    pub fn get_publication(&self, publication_id: String) -> Option<Publication> {
        self.publications.get(&publication_id)
    }

    pub fn get_publications_count(&self) -> u64 {
        self.publication_count
    }

    pub fn get_publications(
        &self,
        from_index: Option<U64>,
        limit: Option<u64>,
    ) -> Vec<Publication> {
        let start = from_index.unwrap_or(U64(0)).0.min(self.publication_count);
        let end = start
            .saturating_add(limit.unwrap_or(50).min(100))
            .min(self.publication_count);
        (start..end)
            .map(|position| {
                let publication_id = self
                    .publication_ids
                    .get(&position)
                    .expect("Publication index is inconsistent");
                self.publications
                    .get(&publication_id)
                    .expect("Indexed publication is missing")
            })
            .collect()
    }

    pub fn get_takedown(&self, publication_id: String) -> Option<TakedownRecord> {
        self.takedowns.get(&publication_id)
    }

    pub fn has_entitlement(&self, account_id: AccountId, publication_id: String) -> bool {
        if self
            .entitlements
            .get(&entitlement_key(&account_id, &publication_id))
            .unwrap_or(false)
        {
            return true;
        }
        self.publications
            .get(&publication_id)
            .is_some_and(|publication| publication.creator_id == account_id)
    }

    pub fn get_creator_balance(&self, creator_id: AccountId) -> U128 {
        U128(self.creator_balances.get(&creator_id).unwrap_or(0))
    }

    pub fn get_platform_balance(&self) -> U128 {
        U128(self.platform_balance)
    }

    pub fn get_platform_near_balance(&self) -> U128 {
        U128(self.platform_near_balance)
    }

    pub fn get_quote_key_version(&self) -> u32 {
        self.quote_key_version
    }

    pub fn get_storage_reserve_status(&self) -> StorageReserveStatus {
        self.storage_reserve_status()
    }

    pub fn get_governance_state(&self) -> GovernanceState {
        GovernanceState {
            state_version: self.state_version,
            admin_account_id: self.admin_account_id.clone(),
            guardian_account_id: self.guardian_account_id.clone(),
            active_bridge_account_id: self.active_bridge_account_id.clone(),
            pending_bridge_account_id: self.pending_bridge_account_id.clone(),
            bridge_frozen: self.bridge_frozen,
            new_purchases_paused: self.new_purchases_paused(),
            bridge_rotation_proposed_at_ms: self.bridge_rotation_proposed_at_ms.map(U64),
        }
    }

    pub fn get_usdc_contract_id(&self) -> AccountId {
        self.usdc_contract_id()
    }
}

impl Contract {
    fn new_purchases_paused(&self) -> bool {
        env::storage_read(NEW_PURCHASES_PAUSED_KEY).as_deref() == Some(&[1])
    }

    fn storage_reserve_status(&self) -> StorageReserveStatus {
        let storage_usage = env::storage_usage();
        let storage_byte_cost = env::storage_byte_cost().as_yoctonear();
        let storage_stake = u128::from(storage_usage)
            .checked_mul(storage_byte_cost)
            .expect("Storage stake overflow");
        let protected = storage_stake
            .checked_add(self.near_operational_reserve)
            .expect("Protected NEAR balance overflow");
        let account_balance = env::account_balance().as_yoctonear();
        let reserve_headroom = account_balance.saturating_sub(protected);
        StorageReserveStatus {
            storage_usage_bytes: U64(storage_usage),
            storage_byte_cost_yocto: U128(storage_byte_cost),
            storage_stake_yocto: U128(storage_stake),
            operational_reserve_yocto: U128(self.near_operational_reserve),
            account_balance_yocto: U128(account_balance),
            reserve_headroom_yocto: U128(reserve_headroom),
            reserve_runway_bytes: U128(reserve_headroom / storage_byte_cost),
            reserve_covered: account_balance >= protected,
        }
    }

    fn verify_creator_fee_quote(
        &self,
        request: &PaidJobRequest,
        quote: &CreatorFeeQuote,
        signature: &[u8],
    ) {
        let now = env::block_timestamp_ms();
        require!(
            quote.domain == "youtick.creator-fee-quote",
            "Invalid quote domain"
        );
        require!(quote.version == "1", "Invalid quote version");
        require!(quote.network == self.network_id(), "Quote network mismatch");
        require!(
            quote.contract_id == env::current_account_id(),
            "Quote contract mismatch"
        );
        require!(
            quote.creator_id == request.creator_id && quote.job_id == request.job_id,
            "Quote job mismatch"
        );
        require!(
            quote.expected_source_bytes == request.expected_source_bytes,
            "Quote byte count mismatch"
        );
        require!(
            quote.quote_key_version == self.quote_key_version,
            "Quote key version mismatch"
        );
        require!(
            quote.rate_timestamp_ms.0 <= now
                && now - quote.rate_timestamp_ms.0 <= QUOTE_MAX_SOURCE_AGE_MS,
            "Stale quote rate"
        );
        require!(
            quote.expires_at_ms.0 > now
                && quote.expires_at_ms.0 - quote.rate_timestamp_ms.0 <= QUOTE_MAX_LIFETIME_MS,
            "Expired quote"
        );
        require!(
            !quote.rate_source.is_empty()
                && !quote.rate_source.contains('\r')
                && !quote.rate_source.contains('\n'),
            "Invalid rate source"
        );
        let fee_usd_micro = upload_fee_usdc(request.expected_source_bytes.0);
        require!(
            quote.fee_usd_micro.0 == fee_usd_micro,
            "Quote USD fee mismatch"
        );
        require!(quote.near_usd_micro.0 > 0, "Invalid NEAR/USD rate");
        let fee_near_yocto = div_ceil(
            fee_usd_micro
                .checked_mul(10u128.pow(24))
                .expect("NEAR fee overflow"),
            quote.near_usd_micro.0,
        );
        require!(
            quote.fee_near_yocto.0 == fee_near_yocto,
            "Quote NEAR fee mismatch"
        );
        let message = canonical_quote_message(quote);
        require!(
            quote.quote_id == hex_sha256(message.as_bytes()),
            "Quote ID mismatch"
        );
        let signature: [u8; 64] = signature
            .try_into()
            .unwrap_or_else(|_| env::panic_str("Invalid quote signature"));
        let public_key: [u8; 32] = self
            .quote_public_key
            .as_slice()
            .try_into()
            .expect("Invalid quote public key");
        require!(
            env::ed25519_verify(&signature, message.as_bytes(), &public_key),
            "Invalid quote signature"
        );
    }

    fn network_id(&self) -> String {
        if env::current_account_id().as_str().ends_with(".testnet") {
            "testnet".to_string()
        } else if env::current_account_id().as_str().ends_with(".near") {
            "mainnet".to_string()
        } else {
            env::panic_str("Unsupported NEAR network")
        }
    }
    fn assert_bridge(&self) {
        require!(
            env::predecessor_account_id() == self.active_bridge_account_id,
            "Only the configured Livepeer bridge can call this method"
        );
        require!(!self.bridge_frozen, "Livepeer bridge is frozen");
    }

    fn assert_admin(&self) {
        require!(
            env::predecessor_account_id() == self.admin_account_id,
            "Only the admin account can call this method"
        );
    }

    fn assert_guardian(&self) {
        require!(
            env::predecessor_account_id() == self.guardian_account_id,
            "Only the guardian account can call this method"
        );
    }

    fn assert_admin_or_guardian(&self) {
        let predecessor = env::predecessor_account_id();
        require!(
            predecessor == self.admin_account_id || predecessor == self.guardian_account_id,
            "Only the admin or guardian account can call this method"
        );
    }

    fn assert_valid_bridge_account(&self, account_id: &AccountId) {
        require!(
            account_id != &self.active_bridge_account_id
                && account_id != &self.platform_account_id
                && account_id != &self.takedown_authority_id
                && account_id != &self.admin_account_id
                && account_id != &self.guardian_account_id,
            "Bridge account must be a separate authority"
        );
    }

    fn assert_takedown_authority(&self) {
        require!(
            env::predecessor_account_id() == self.takedown_authority_id,
            "Only the configured takedown authority can call this method"
        );
    }

    fn job_for_generation(&self, job_id: &str, generation: u64) -> MediaJob {
        let job = self
            .media_jobs
            .get(&job_id.to_string())
            .expect("Media job not found");
        require!(
            job.generation == generation,
            "Media job generation mismatch"
        );
        job
    }

    fn bind_identity(
        &self,
        bindings: &LookupMap<String, String>,
        identity: &str,
        job_id: &str,
        label: &str,
    ) {
        if let Some(existing) = bindings.get(&identity.to_string()) {
            require!(existing == job_id, format!("{label} is already bound"));
        }
    }

    fn usdc_contract_id(&self) -> AccountId {
        let current = env::current_account_id();
        let value = if current.as_str().ends_with(".testnet") {
            TESTNET_USDC
        } else if current.as_str().ends_with(".near") {
            MAINNET_USDC
        } else {
            env::panic_str("Unsupported NEAR network");
        };
        value.parse().expect("Invalid embedded USDC account")
    }

    fn ft_transfer(&self, receiver_id: AccountId, amount: u128, memo: &str) -> Promise {
        Promise::new(self.usdc_contract_id()).function_call(
            "ft_transfer".to_string(),
            near_sdk::serde_json::to_vec(&FtTransferArgs {
                receiver_id,
                amount: U128(amount),
                memo: Some(memo.to_string()),
            })
            .expect("Failed to serialize ft_transfer"),
            NearToken::from_yoctonear(1),
            FT_TRANSFER_GAS,
        )
    }
}

fn publication_matches(
    publication: &Publication,
    submission: &LivepeerPublicationSubmission,
) -> bool {
    publication.generation == submission.generation
        && publication.creator_id == submission.creator_id
        && publication.expected_source_bytes == submission.expected_source_bytes
        && publication.profile_id == submission.profile_id
        && publication.profile_config_sha256 == submission.profile_config_sha256
        && publication.asset_id_hash == submission.asset_id_hash
        && publication.playback_id == submission.playback_id
        && publication.project_id_hash == submission.project_id_hash
        && publication.verified_source_bytes == submission.verified_source_bytes
        && publication.provider_source_fingerprint == submission.provider_source_fingerprint
        && publication.ready_at_ms == submission.ready_at_ms
        && publication.published_availability == submission.availability
}

fn entitlement_key(account_id: &AccountId, publication_id: &str) -> String {
    format!("{account_id}:{publication_id}")
}

fn assert_identifier(label: &str, value: &str) {
    require!(
        !value.is_empty()
            && value.len() <= 128
            && value
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric()
                    || matches!(byte, b'-' | b'_' | b'.' | b':')),
        format!("{label} must be 1-128 ASCII identifier characters")
    );
}

fn assert_title(value: &str) {
    require!(
        !value.trim().is_empty() && value.len() <= 200,
        "title must be 1-200 bytes"
    );
}

fn assert_playback_id(value: &str) {
    require!(
        (6..=128).contains(&value.len())
            && value
                .bytes()
                .all(|byte| { byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_') }),
        "playback_id must be 6-128 URL-safe ASCII characters"
    );
}

fn assert_source_bytes(value: u128) {
    require!(
        (1..=PAID_SOURCE_MAX_BYTES).contains(&value),
        "expected_source_bytes must be between 1 and 20,000,000,000"
    );
}

fn upload_fee_usdc(source_bytes: u128) -> u128 {
    assert_source_bytes(source_bytes);
    div_ceil(
        source_bytes
            .checked_mul(UPLOAD_FEE_NUMERATOR)
            .expect("Upload fee overflow"),
        UPLOAD_FEE_DENOMINATOR,
    )
    .max(MIN_UPLOAD_FEE_USDC)
}

fn div_ceil(numerator: u128, denominator: u128) -> u128 {
    numerator / denominator + u128::from(numerator % denominator != 0)
}

fn assert_paid_job_request(request: &PaidJobRequest) {
    assert_identifier("job_id", &request.job_id);
    assert_title(&request.title);
    assert_source_bytes(request.expected_source_bytes.0);
    assert_profile(&request.profile_id, &request.profile_config_sha256);
    assert_upload_key(
        &request.upload_public_key,
        request.upload_key_expires_at_ms.0,
    );
    require!(
        request.price_usdc.0 >= MIN_TICKET_PRICE_USDC,
        "USDC ticket price must be at least 2.000000"
    );
}

fn assert_upload_key(public_key: &str, expires_at_ms: u64) {
    require!(
        public_key.starts_with("ed25519:")
            && (40..=80).contains(&public_key.len())
            && public_key[8..].bytes().all(|byte| matches!(byte,
                b'1'..=b'9' | b'A'..=b'H' | b'J'..=b'N' | b'P'..=b'Z' | b'a'..=b'k' | b'm'..=b'z')),
        "Invalid upload public key"
    );
    require!(
        expires_at_ms > env::block_timestamp_ms(),
        "Upload key must not be expired"
    );
}

fn canonical_quote_message(quote: &CreatorFeeQuote) -> String {
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

fn hex_sha256(value: &[u8]) -> String {
    env::sha256(value)
        .into_iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn job_matches_request(job: &MediaJob, request: &PaidJobRequest, quote: &CreatorFeeQuote) -> bool {
    job.creator_id == request.creator_id
        && job.title == request.title
        && job.price_usdc == request.price_usdc
        && job.expected_source_bytes == request.expected_source_bytes
        && job.profile_id == request.profile_id
        && job.profile_config_sha256 == request.profile_config_sha256
        && job.upload_public_key == request.upload_public_key
        && job.upload_key_expires_at_ms == request.upload_key_expires_at_ms
        && job.fee_asset == FeeAsset::Near
        && job.fee_amount == quote.fee_near_yocto
        && job.fee_usd_micro == quote.fee_usd_micro
        && job.fee_quote_hash.as_deref() == Some(quote.quote_id.as_str())
}

fn emit_media_job_authorized(job: &MediaJob) {
    emit_market_event(
        "media_job_authorized",
        &format!("job:{}:{}:authorized", job.job_id, job.generation),
        near_sdk::serde_json::json!({
            "account_id": job.creator_id,
            "job_id": job.job_id,
            "generation": job.generation,
            "asset": fee_asset_name(&job.fee_asset),
            "amount": job.fee_amount,
            "fee_usd_micro": job.fee_usd_micro,
            "expected_source_bytes": job.expected_source_bytes,
            "price_usdc": job.price_usdc,
            "upload_key_expires_at_ms": job.upload_key_expires_at_ms,
            "fee_quote_hash": job.fee_quote_hash,
        }),
    );
}

fn fee_asset_name(asset: &FeeAsset) -> &'static str {
    match asset {
        FeeAsset::Usdc => "USDC",
        FeeAsset::Near => "NEAR",
    }
}

fn emit_market_event(event: &str, idempotency_key: &str, mut data: near_sdk::serde_json::Value) {
    let fields = data.as_object_mut().expect("Event data must be an object");
    fields.insert(
        "contract_id".to_string(),
        near_sdk::serde_json::json!(env::current_account_id()),
    );
    fields.insert(
        "predecessor_account_id".to_string(),
        near_sdk::serde_json::json!(env::predecessor_account_id()),
    );
    fields.insert(
        "block_height".to_string(),
        near_sdk::serde_json::json!(env::block_height().to_string()),
    );
    fields.insert(
        "block_timestamp_ms".to_string(),
        near_sdk::serde_json::json!(env::block_timestamp_ms().to_string()),
    );
    fields.insert(
        "idempotency_key".to_string(),
        near_sdk::serde_json::json!(idempotency_key),
    );
    env::log_str(&format!(
        "EVENT_JSON:{}",
        near_sdk::serde_json::json!({
            "standard": "youtick_market",
            "version": "1.0.0",
            "event": event,
            "data": [data],
        })
    ));
}

fn emit_governance_event(event: &str, data: near_sdk::serde_json::Value) {
    emit_market_event(
        event,
        &format!(
            "governance:{event}:{}:{}",
            env::predecessor_account_id(),
            env::block_timestamp_ms()
        ),
        data,
    );
}

fn assert_profile(profile_id: &str, profile_config_sha256: &str) {
    require!(profile_id == PROFILE, "Unsupported paid-media profile");
    assert_sha256("profile_config_sha256", profile_config_sha256);
}

fn assert_sha256(label: &str, value: &str) {
    require!(
        value.len() == 64
            && value
                .bytes()
                .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f')),
        format!("{label} must be lowercase SHA-256 hex")
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::{testing_env, PromiseResult};

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
        Contract::new(MarketInitConfig {
            platform_account_id: account("platform.testnet"),
            bridge_account_id: account("bridge.testnet"),
            takedown_authority_id: account("governance.testnet"),
            admin_account_id: account("admin.testnet"),
            guardian_account_id: account("guardian.testnet"),
            quote_public_key: Base64VecU8(vec![1; 32]),
            quote_key_version: 1,
            near_operational_reserve: U128(1_000_000_000_000_000_000_000_000),
        })
    }

    #[test]
    fn selects_circle_usdc_from_network() {
        let contract = contract();
        assert_eq!(contract.get_usdc_contract_id(), account(TESTNET_USDC));
        let mut builder = context("market.near");
        builder.current_account_id(account("market.near"));
        testing_env!(builder.build());
        assert_eq!(contract.get_usdc_contract_id(), account(MAINNET_USDC));
    }

    #[test]
    fn failed_creator_withdraw_restores_liability() {
        let mut contract = contract();
        let creator_id = account("creator.testnet");
        contract.creator_balances.insert(&creator_id, &1_960_000);
        testing_env!(context("creator.testnet").build());
        contract.withdraw_creator_balance();
        assert!(get_logs()
            .last()
            .unwrap()
            .contains("creator_balance_withdrawal_started"));
        testing_env!(
            context("market.testnet").build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Failed],
        );
        assert!(!contract.on_creator_withdraw(
            creator_id.clone(),
            U128(1_960_000),
            "creator-withdrawal:creator.testnet:1960000:1785589300000".to_string(),
        ));
        assert_eq!(contract.get_creator_balance(creator_id), U128(1_960_000));
        assert!(get_logs()
            .last()
            .unwrap()
            .contains("creator_balance_withdrawal_failed"));
    }

    #[test]
    fn successful_creator_withdraw_emits_completion_with_the_started_id() {
        let mut contract = contract();
        let creator_id = account("creator.testnet");
        let withdrawal_id = "creator-withdrawal:creator.testnet:1960000:1785589300000".to_string();
        contract.creator_balances.insert(&creator_id, &1_960_000);
        testing_env!(context("creator.testnet").build());
        contract.withdraw_creator_balance();
        assert!(get_logs().last().unwrap().contains(&withdrawal_id));
        testing_env!(
            context("market.testnet").build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Successful(Vec::new())],
        );

        assert!(contract.on_creator_withdraw(
            creator_id.clone(),
            U128(1_960_000),
            withdrawal_id.clone(),
        ));
        assert_eq!(contract.get_creator_balance(creator_id), U128(0));
        let completed = get_logs().last().unwrap().to_owned();
        assert!(completed.contains("creator_balance_withdrawal_succeeded"));
        assert!(completed.contains(&withdrawal_id));
    }

    #[test]
    fn platform_usdc_withdraw_emits_started_event() {
        let mut contract = contract();
        contract.platform_balance = 40_000;
        testing_env!(context("platform.testnet").build());

        contract.withdraw_platform_balance();

        assert_eq!(contract.get_platform_balance(), U128(0));
        let started = get_logs().last().unwrap().to_owned();
        assert!(started.contains("platform_withdrawal_started"));
        assert!(started.contains(r#""asset":"USDC""#));
    }

    #[test]
    fn quote_key_rotation_is_platform_only_and_monotonic() {
        let mut contract = contract();
        testing_env!(context("attacker.testnet").build());
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.rotate_quote_public_key(2, Base64VecU8(vec![2; 32]));
        }))
        .is_err());
        testing_env!(context("platform.testnet").build());
        contract.rotate_quote_public_key(2, Base64VecU8(vec![2; 32]));
        assert_eq!(contract.get_quote_key_version(), 2);
        assert!(get_logs().last().unwrap().contains("quote_key_rotated"));
    }

    #[test]
    fn near_withdrawal_preserves_operational_reserve() {
        let mut contract = contract();
        contract.platform_near_balance = 100;
        let mut blocked = context("platform.testnet");
        blocked.storage_usage(0);
        blocked.account_balance(NearToken::from_yoctonear(
            contract.near_operational_reserve + 99,
        ));
        testing_env!(blocked.build());
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.withdraw_platform_near(U128(100));
        }))
        .is_err());
        assert_eq!(contract.get_platform_near_balance(), U128(100));

        let mut allowed = context("platform.testnet");
        allowed.storage_usage(0);
        allowed.account_balance(NearToken::from_yoctonear(
            contract.near_operational_reserve + 100,
        ));
        testing_env!(allowed.build());
        contract.withdraw_platform_near(U128(100));
        assert_eq!(contract.get_platform_near_balance(), U128(0));
        assert!(get_logs()
            .last()
            .unwrap()
            .contains("platform_withdrawal_started"));
    }

    #[test]
    fn storage_reserve_status_matches_the_withdrawal_guard() {
        let contract = contract();
        let storage_usage = 10;
        let runway_bytes = 25u128;
        let storage_byte_cost = env::storage_byte_cost().as_yoctonear();
        let mut covered = context("market.testnet");
        covered.storage_usage(storage_usage);
        covered.account_balance(NearToken::from_yoctonear(
            contract.near_operational_reserve
                + (u128::from(storage_usage) + runway_bytes) * storage_byte_cost,
        ));
        testing_env!(covered.build());

        let status = contract.get_storage_reserve_status();
        assert_eq!(status.storage_usage_bytes, U64(storage_usage));
        assert_eq!(
            status.storage_stake_yocto,
            U128(u128::from(storage_usage) * storage_byte_cost)
        );
        assert_eq!(
            status.operational_reserve_yocto,
            U128(contract.near_operational_reserve)
        );
        assert_eq!(
            status.reserve_headroom_yocto,
            U128(runway_bytes * storage_byte_cost)
        );
        assert_eq!(status.reserve_runway_bytes, U128(runway_bytes));
        assert!(status.reserve_covered);

        let mut uncovered = context("market.testnet");
        uncovered.storage_usage(storage_usage);
        uncovered.account_balance(NearToken::from_yoctonear(
            contract.near_operational_reserve + u128::from(storage_usage) * storage_byte_cost - 1,
        ));
        testing_env!(uncovered.build());
        let status = contract.get_storage_reserve_status();
        assert!(!status.reserve_covered);
        assert_eq!(status.reserve_headroom_yocto, U128(0));
        assert_eq!(status.reserve_runway_bytes, U128(0));
    }
}
