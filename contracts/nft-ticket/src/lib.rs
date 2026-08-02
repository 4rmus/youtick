use near_sdk::collections::LookupMap;
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    PromiseResult,
};

const TESTNET_USDC: &str = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const MAINNET_USDC: &str = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const PROFILE: &str = "paid-media-livepeer-v1";
const PAID_SOURCE_MAX_BYTES: u128 = 20_000_000_000;
const FT_TRANSFER_GAS: Gas = Gas::from_tgas(20);
const WITHDRAW_CALLBACK_GAS: Gas = Gas::from_tgas(10);

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

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct PurchaseMessage {
    publication_id: String,
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
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct PlatformWithdrawCallbackArgs {
    amount: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    platform_account_id: AccountId,
    // ponytail: immutable for code-only PR-1; add timelocked rotation only after
    // the P0 rotation authority is decided and before any deployment.
    bridge_account_id: AccountId,
    takedown_authority_id: AccountId,
    media_jobs: LookupMap<String, MediaJob>,
    publications: LookupMap<String, Publication>,
    asset_bindings: LookupMap<String, String>,
    playback_bindings: LookupMap<String, String>,
    entitlements: LookupMap<String, bool>,
    creator_balances: LookupMap<AccountId, u128>,
    takedowns: LookupMap<String, TakedownRecord>,
    platform_balance: u128,
}

#[near(serializers = [borsh])]
struct ContractBeforeTakedown {
    platform_account_id: AccountId,
    bridge_account_id: AccountId,
    media_jobs: LookupMap<String, MediaJob>,
    publications: LookupMap<String, Publication>,
    asset_bindings: LookupMap<String, String>,
    playback_bindings: LookupMap<String, String>,
    entitlements: LookupMap<String, bool>,
    creator_balances: LookupMap<AccountId, u128>,
    platform_balance: u128,
}

#[near]
impl Contract {
    #[init]
    pub fn new(
        platform_account_id: AccountId,
        bridge_account_id: AccountId,
        takedown_authority_id: AccountId,
    ) -> Self {
        require!(
            platform_account_id != bridge_account_id,
            "Platform and bridge accounts must differ"
        );
        require!(
            takedown_authority_id != bridge_account_id
                && takedown_authority_id != platform_account_id,
            "Takedown authority must be separate"
        );
        Self {
            platform_account_id,
            bridge_account_id,
            takedown_authority_id,
            media_jobs: LookupMap::new(StorageKey::MEDIA_JOBS),
            publications: LookupMap::new(StorageKey::PUBLICATIONS),
            asset_bindings: LookupMap::new(StorageKey::ASSET_BINDINGS),
            playback_bindings: LookupMap::new(StorageKey::PLAYBACK_BINDINGS),
            entitlements: LookupMap::new(StorageKey::ENTITLEMENTS),
            creator_balances: LookupMap::new(StorageKey::CREATOR_BALANCES),
            takedowns: LookupMap::new(StorageKey::TAKEDOWNS),
            platform_balance: 0,
        }
    }

    #[init(ignore_state)]
    pub fn migrate(takedown_authority_id: AccountId) -> Self {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Only the contract account can migrate"
        );
        let old: ContractBeforeTakedown = env::state_read().expect("Old state is missing");
        require!(
            takedown_authority_id != old.bridge_account_id
                && takedown_authority_id != old.platform_account_id,
            "Takedown authority must be separate"
        );
        Self {
            platform_account_id: old.platform_account_id,
            bridge_account_id: old.bridge_account_id,
            takedown_authority_id,
            media_jobs: old.media_jobs,
            publications: old.publications,
            asset_bindings: old.asset_bindings,
            playback_bindings: old.playback_bindings,
            entitlements: old.entitlements,
            creator_balances: old.creator_balances,
            takedowns: LookupMap::new(StorageKey::TAKEDOWNS),
            platform_balance: old.platform_balance,
        }
    }

    pub fn create_paid_job(
        &mut self,
        job_id: String,
        title: String,
        price_usdc: U128,
        expected_source_bytes: U128,
        profile_id: String,
        profile_config_sha256: String,
    ) -> MediaJob {
        assert_identifier("job_id", &job_id);
        assert_title(&title);
        assert_source_bytes(expected_source_bytes.0);
        assert_profile(&profile_id, &profile_config_sha256);
        require!(
            price_usdc.0 >= 50 && price_usdc.0 % 50 == 0,
            "USDC price must split exactly into 98/2 shares"
        );
        require!(
            self.media_jobs.get(&job_id).is_none(),
            "Media job already exists"
        );

        let job = MediaJob {
            job_id: job_id.clone(),
            creator_id: env::predecessor_account_id(),
            profile_id,
            profile_config_sha256,
            title,
            price_usdc,
            expected_source_bytes,
            generation: 1,
            status: MediaJobStatus::Authorized,
            created_at_ms: env::block_timestamp_ms(),
            published_at_ms: None,
        };
        self.media_jobs.insert(&job_id, &job);
        job
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

        job.generation = job.generation.checked_add(1).expect("Generation overflow");
        job.expected_source_bytes = expected_source_bytes;
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
        self.asset_bindings
            .insert(&submission.asset_id_hash, &submission.job_id);
        self.playback_bindings
            .insert(&submission.playback_id, &submission.job_id);
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
        publication.availability = PublicationAvailability::SalesSuspended;
        self.publications.insert(&publication_id, &publication);
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
        let message: PurchaseMessage =
            near_sdk::serde_json::from_str(&msg).expect("Invalid purchase message");
        let publication = self
            .publications
            .get(&message.publication_id)
            .expect("Publication not found");
        let entitlement_key = entitlement_key(&sender_id, &message.publication_id);

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

        PromiseOrValue::Value(U128(0))
    }

    pub fn withdraw_creator_balance(&mut self) -> Promise {
        let creator_id = env::predecessor_account_id();
        let amount = self.creator_balances.get(&creator_id).unwrap_or(0);
        require!(amount > 0, "No creator balance");
        self.creator_balances.insert(&creator_id, &0);

        self.ft_transfer(creator_id.clone(), amount, "creator payout")
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_creator_withdraw".to_string(),
                    near_sdk::serde_json::to_vec(&CreatorWithdrawCallbackArgs {
                        creator_id,
                        amount: U128(amount),
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

    #[private]
    pub fn on_creator_withdraw(&mut self, creator_id: AccountId, amount: U128) -> bool {
        require!(
            env::promise_results_count() == 1,
            "Expected one withdrawal result"
        );
        if matches!(env::promise_result(0), PromiseResult::Successful(_)) {
            return true;
        }
        let restored = self
            .creator_balances
            .get(&creator_id)
            .unwrap_or(0)
            .checked_add(amount.0)
            .expect("Creator balance overflow");
        self.creator_balances.insert(&creator_id, &restored);
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

    pub fn get_media_job(&self, job_id: String) -> Option<MediaJob> {
        self.media_jobs.get(&job_id)
    }

    pub fn get_publication(&self, publication_id: String) -> Option<Publication> {
        self.publications.get(&publication_id)
    }

    pub fn get_takedown(&self, publication_id: String) -> Option<TakedownRecord> {
        self.takedowns.get(&publication_id)
    }

    pub fn has_entitlement(&self, account_id: AccountId, publication_id: String) -> bool {
        self.entitlements
            .get(&entitlement_key(&account_id, &publication_id))
            .unwrap_or(false)
    }

    pub fn get_creator_balance(&self, creator_id: AccountId) -> U128 {
        U128(self.creator_balances.get(&creator_id).unwrap_or(0))
    }

    pub fn get_platform_balance(&self) -> U128 {
        U128(self.platform_balance)
    }

    pub fn get_usdc_contract_id(&self) -> AccountId {
        self.usdc_contract_id()
    }
}

impl Contract {
    fn assert_bridge(&self) {
        require!(
            env::predecessor_account_id() == self.bridge_account_id,
            "Only the configured Livepeer bridge can call this method"
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
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, PromiseResult};

    fn account(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn context(predecessor: &str) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.current_account_id(account("market.testnet"));
        builder.predecessor_account_id(account(predecessor));
        builder
    }

    fn contract() -> Contract {
        testing_env!(context("market.testnet").build());
        Contract::new(
            account("platform.testnet"),
            account("bridge.testnet"),
            account("governance.testnet"),
        )
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
        testing_env!(
            context("market.testnet").build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Failed],
        );
        assert!(!contract.on_creator_withdraw(creator_id.clone(), U128(1_960_000)));
        assert_eq!(contract.get_creator_balance(creator_id), U128(1_960_000));
    }

    #[test]
    fn migrates_existing_state_to_a_separate_takedown_authority() {
        testing_env!(context("market.testnet").build());
        let old = ContractBeforeTakedown {
            platform_account_id: account("platform.testnet"),
            bridge_account_id: account("bridge.testnet"),
            media_jobs: LookupMap::new(StorageKey::MEDIA_JOBS),
            publications: LookupMap::new(StorageKey::PUBLICATIONS),
            asset_bindings: LookupMap::new(StorageKey::ASSET_BINDINGS),
            playback_bindings: LookupMap::new(StorageKey::PLAYBACK_BINDINGS),
            entitlements: LookupMap::new(StorageKey::ENTITLEMENTS),
            creator_balances: LookupMap::new(StorageKey::CREATOR_BALANCES),
            platform_balance: 50,
        };
        env::state_write(&old);

        let migrated = Contract::migrate(account("governance.testnet"));

        assert_eq!(migrated.platform_account_id, account("platform.testnet"));
        assert_eq!(migrated.bridge_account_id, account("bridge.testnet"));
        assert_eq!(
            migrated.takedown_authority_id,
            account("governance.testnet")
        );
        assert_eq!(migrated.platform_balance, 50);
    }
}
