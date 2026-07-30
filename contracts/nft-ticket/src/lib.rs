use near_sdk::collections::{LookupMap, UnorderedSet};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    PromiseResult,
};

const TESTNET_USDC: &str = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const MAINNET_USDC: &str = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const PROFILE: &str = "paid-media-v4";
const KMS_OPERATOR_COUNT: usize = 5;
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
    const KMS_OPERATORS: Self = Self(b"v4:kms");
    const MEDIA_JOBS: Self = Self(b"v4:jobs");
    const PUBLICATIONS: Self = Self(b"v4:publications");
    const ENTITLEMENTS: Self = Self(b"v4:entitlements");
    const CREATOR_BALANCES: Self = Self(b"v4:creator-balances");
    const RECEIPT_BINDINGS: Self = Self(b"v4:receipt-bindings");
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MediaJobStatus {
    Authorized,
    L3FullReadbackVerified,
    Kms5Of5,
    SourceDeleteConfirmed,
    Published,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ByteIntegrityReceipt {
    pub manifest_cid: String,
    pub manifest_sha256: String,
    pub pack_root_sha256: String,
    pub logical_bytes: U128,
    pub pack_count: u32,
    pub receipt_digest: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ByteIntegritySubmission {
    pub job_id: String,
    pub generation: u64,
    pub manifest_cid: String,
    pub manifest_sha256: String,
    pub pack_root_sha256: String,
    pub logical_bytes: U128,
    pub pack_count: u32,
    pub full_readback: bool,
    pub receipt_digest: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct KmsStoreReceipt {
    pub operator_id: AccountId,
    pub receipt_digest: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SourceDeleteReceipt {
    pub receipt_digest: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SourceDeleteSubmission {
    pub job_id: String,
    pub generation: u64,
    pub manifest_sha256: String,
    pub head_not_found: bool,
    pub get_not_found: bool,
    pub object_count: u32,
    pub multipart_count: u32,
    pub receipt_digest: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MediaJob {
    pub job_id: String,
    pub creator_id: AccountId,
    pub profile: String,
    pub title: String,
    pub price_usdc: U128,
    pub source_bytes: U128,
    pub ingest_public_key: String,
    pub generation: u64,
    pub status: MediaJobStatus,
    pub byte_integrity: Option<ByteIntegrityReceipt>,
    pub kms_receipts: Vec<KmsStoreReceipt>,
    pub source_delete: Option<SourceDeleteReceipt>,
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
    pub manifest_cid: String,
    pub manifest_sha256: String,
    pub published_at_ms: u64,
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
    verifier_account_id: AccountId,
    source_cleanup_account_id: AccountId,
    // ponytail: PR-1 uses immutable NEAR caller identities; add registry-governed
    // rotation with the PR-3 runtime before any deployment.
    kms_operator_ids: UnorderedSet<AccountId>,
    media_jobs: LookupMap<String, MediaJob>,
    publications: LookupMap<String, Publication>,
    entitlements: LookupMap<String, bool>,
    creator_balances: LookupMap<AccountId, u128>,
    receipt_bindings: LookupMap<String, String>,
    platform_balance: u128,
}

#[near]
impl Contract {
    #[init]
    pub fn new(
        platform_account_id: AccountId,
        verifier_account_id: AccountId,
        source_cleanup_account_id: AccountId,
        kms_operator_ids: Vec<AccountId>,
    ) -> Self {
        require!(
            kms_operator_ids.len() == KMS_OPERATOR_COUNT,
            "Exactly five KMS operators are required"
        );
        require!(
            verifier_account_id != source_cleanup_account_id,
            "Verifier and source cleanup accounts must be independent"
        );

        let mut kms_operators = UnorderedSet::new(StorageKey::KMS_OPERATORS);
        for operator_id in kms_operator_ids {
            require!(
                operator_id != verifier_account_id && operator_id != source_cleanup_account_id,
                "Verifier and source cleanup accounts cannot be KMS operators"
            );
            require!(
                kms_operators.insert(&operator_id),
                "KMS operators must be unique"
            );
        }

        Self {
            platform_account_id,
            verifier_account_id,
            source_cleanup_account_id,
            kms_operator_ids: kms_operators,
            media_jobs: LookupMap::new(StorageKey::MEDIA_JOBS),
            publications: LookupMap::new(StorageKey::PUBLICATIONS),
            entitlements: LookupMap::new(StorageKey::ENTITLEMENTS),
            creator_balances: LookupMap::new(StorageKey::CREATOR_BALANCES),
            receipt_bindings: LookupMap::new(StorageKey::RECEIPT_BINDINGS),
            platform_balance: 0,
        }
    }

    pub fn create_paid_job(
        &mut self,
        job_id: String,
        title: String,
        price_usdc: U128,
        source_bytes: U128,
        ingest_public_key: String,
    ) -> MediaJob {
        assert_identifier("job_id", &job_id);
        assert_title(&title);
        assert_source_bytes(source_bytes.0);
        assert_ingest_public_key(&ingest_public_key);
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
            profile: PROFILE.to_string(),
            title,
            price_usdc,
            source_bytes,
            ingest_public_key,
            generation: 1,
            status: MediaJobStatus::Authorized,
            byte_integrity: None,
            kms_receipts: Vec::new(),
            source_delete: None,
            created_at_ms: env::block_timestamp_ms(),
            published_at_ms: None,
        };
        self.media_jobs.insert(&job_id, &job);
        job
    }

    pub fn restart_paid_job(
        &mut self,
        job_id: String,
        source_bytes: U128,
        ingest_public_key: String,
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
        require!(
            job.source_delete.is_none(),
            "A media job cannot restart after source deletion"
        );
        assert_source_bytes(source_bytes.0);
        assert_ingest_public_key(&ingest_public_key);

        job.generation = job.generation.checked_add(1).expect("Generation overflow");
        job.source_bytes = source_bytes;
        job.ingest_public_key = ingest_public_key;
        job.status = MediaJobStatus::Authorized;
        job.byte_integrity = None;
        job.kms_receipts.clear();
        job.source_delete = None;
        self.media_jobs.insert(&job_id, &job);
        job
    }

    pub fn record_byte_integrity(
        &mut self,
        submission: ByteIntegritySubmission,
    ) -> ByteIntegrityReceipt {
        require!(
            env::predecessor_account_id() == self.verifier_account_id,
            "Only the independent verifier can record byte integrity"
        );
        require!(submission.full_readback, "Full byte readback is required");
        assert_cid(&submission.manifest_cid);
        assert_sha256("manifest_sha256", &submission.manifest_sha256);
        assert_sha256("pack_root_sha256", &submission.pack_root_sha256);
        assert_sha256("receipt_digest", &submission.receipt_digest);
        require!(
            submission.logical_bytes.0 > 0,
            "logical_bytes must be positive"
        );
        require!(submission.pack_count > 0, "pack_count must be positive");

        let mut job = self.job_for_generation(&submission.job_id, submission.generation);
        require!(
            job.status != MediaJobStatus::Published,
            "Published media jobs cannot accept evidence"
        );
        self.bind_receipt_digest(
            &submission.receipt_digest,
            &format!(
                "{PROFILE}:byte:{}:{}:{}:{}",
                job.creator_id,
                submission.job_id,
                submission.generation,
                submission.manifest_sha256
            ),
        );
        let receipt = ByteIntegrityReceipt {
            manifest_cid: submission.manifest_cid,
            manifest_sha256: submission.manifest_sha256,
            pack_root_sha256: submission.pack_root_sha256,
            logical_bytes: submission.logical_bytes,
            pack_count: submission.pack_count,
            receipt_digest: submission.receipt_digest,
        };

        if let Some(existing) = &job.byte_integrity {
            require!(existing == &receipt, "Conflicting byte-integrity receipt");
            return existing.clone();
        }

        job.byte_integrity = Some(receipt.clone());
        job.status = MediaJobStatus::L3FullReadbackVerified;
        self.media_jobs.insert(&submission.job_id, &job);
        receipt
    }

    pub fn record_kms_store(
        &mut self,
        job_id: String,
        generation: u64,
        manifest_sha256: String,
        stored_and_read_back: bool,
        receipt_digest: String,
    ) -> KmsStoreReceipt {
        let operator_id = env::predecessor_account_id();
        require!(
            self.kms_operator_ids.contains(&operator_id),
            "Caller is not a configured KMS operator"
        );
        require!(
            stored_and_read_back,
            "KMS durable store and readback are required"
        );
        assert_sha256("manifest_sha256", &manifest_sha256);
        assert_sha256("receipt_digest", &receipt_digest);

        let mut job = self.job_for_generation(&job_id, generation);
        require!(
            job.status != MediaJobStatus::Published,
            "Published media jobs cannot accept evidence"
        );
        let integrity = job
            .byte_integrity
            .as_ref()
            .expect("Byte-integrity receipt is required before KMS");
        require!(
            integrity.manifest_sha256 == manifest_sha256,
            "Manifest root mismatch"
        );
        self.bind_receipt_digest(
            &receipt_digest,
            &format!(
                "{PROFILE}:kms:{}:{job_id}:{generation}:{manifest_sha256}:{operator_id}",
                job.creator_id
            ),
        );

        let receipt = KmsStoreReceipt {
            operator_id: operator_id.clone(),
            receipt_digest,
        };
        if let Some(existing) = job
            .kms_receipts
            .iter()
            .find(|existing| existing.operator_id == operator_id)
        {
            require!(existing == &receipt, "Conflicting KMS receipt");
            return existing.clone();
        }

        job.kms_receipts.push(receipt.clone());
        if job.kms_receipts.len() == KMS_OPERATOR_COUNT {
            job.status = MediaJobStatus::Kms5Of5;
        }
        self.media_jobs.insert(&job_id, &job);
        receipt
    }

    pub fn record_source_delete(
        &mut self,
        submission: SourceDeleteSubmission,
    ) -> SourceDeleteReceipt {
        require!(
            env::predecessor_account_id() == self.source_cleanup_account_id,
            "Only the source cleanup account can record deletion"
        );
        require!(
            submission.head_not_found && submission.get_not_found,
            "Fresh HEAD and GET not-found checks are required"
        );
        require!(
            submission.object_count == 0 && submission.multipart_count == 0,
            "Raw object and multipart inventories must be empty"
        );
        assert_sha256("manifest_sha256", &submission.manifest_sha256);
        assert_sha256("receipt_digest", &submission.receipt_digest);

        let mut job = self.job_for_generation(&submission.job_id, submission.generation);
        require!(
            job.status != MediaJobStatus::Published,
            "Published media jobs cannot accept evidence"
        );
        let integrity = job
            .byte_integrity
            .as_ref()
            .expect("Byte-integrity receipt is required before source deletion");
        require!(
            integrity.manifest_sha256 == submission.manifest_sha256,
            "Manifest root mismatch"
        );
        require!(
            job.kms_receipts.len() == KMS_OPERATOR_COUNT,
            "Five KMS store/readback receipts are required before source deletion"
        );
        self.bind_receipt_digest(
            &submission.receipt_digest,
            &format!(
                "{PROFILE}:delete:{}:{}:{}:{}",
                job.creator_id,
                submission.job_id,
                submission.generation,
                submission.manifest_sha256
            ),
        );

        let receipt = SourceDeleteReceipt {
            receipt_digest: submission.receipt_digest,
        };
        if let Some(existing) = &job.source_delete {
            require!(existing == &receipt, "Conflicting source-delete receipt");
            return existing.clone();
        }

        job.source_delete = Some(receipt.clone());
        job.status = MediaJobStatus::SourceDeleteConfirmed;
        self.media_jobs.insert(&submission.job_id, &job);
        receipt
    }

    pub fn finalize_paid_publish(
        &mut self,
        job_id: String,
        generation: u64,
        manifest_sha256: String,
    ) -> Publication {
        assert_sha256("manifest_sha256", &manifest_sha256);
        let mut job = self.job_for_generation(&job_id, generation);
        let integrity = job
            .byte_integrity
            .as_ref()
            .expect("Byte-integrity receipt is required");
        require!(
            integrity.manifest_sha256 == manifest_sha256,
            "Manifest root mismatch"
        );

        if let Some(publication) = self.publications.get(&job_id) {
            require!(
                publication.generation == generation
                    && publication.manifest_sha256 == manifest_sha256,
                "Conflicting finalize request"
            );
            return publication;
        }

        require!(
            job.kms_receipts.len() == KMS_OPERATOR_COUNT,
            "Five KMS store/readback receipts are required"
        );
        require!(
            job.source_delete.is_some(),
            "Source delete receipt is required"
        );

        let published_at_ms = env::block_timestamp_ms();
        let publication = Publication {
            publication_id: job_id.clone(),
            creator_id: job.creator_id.clone(),
            title: job.title.clone(),
            price_usdc: job.price_usdc,
            generation,
            manifest_cid: integrity.manifest_cid.clone(),
            manifest_sha256,
            published_at_ms,
        };
        job.status = MediaJobStatus::Published;
        job.published_at_ms = Some(published_at_ms);
        self.media_jobs.insert(&job_id, &job);
        self.publications.insert(&job_id, &publication);
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

        if amount != publication.price_usdc || self.entitlements.get(&entitlement_key).is_some() {
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
        let args = FtTransferArgs {
            receiver_id,
            amount: U128(amount),
            memo: Some(memo.to_string()),
        };
        Promise::new(self.usdc_contract_id()).function_call(
            "ft_transfer".to_string(),
            near_sdk::serde_json::to_vec(&args).expect("Failed to serialize ft_transfer"),
            NearToken::from_yoctonear(1),
            FT_TRANSFER_GAS,
        )
    }

    fn bind_receipt_digest(&mut self, digest: &str, binding: &str) {
        if let Some(existing) = self.receipt_bindings.get(&digest.to_string()) {
            require!(existing == binding, "Receipt digest is already bound");
            return;
        }
        self.receipt_bindings
            .insert(&digest.to_string(), &binding.to_string());
    }
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
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.')),
        format!("{label} must be 1-128 ASCII identifier characters")
    );
}

fn assert_title(value: &str) {
    require!(
        !value.trim().is_empty() && value.len() <= 200,
        "title must be 1-200 bytes"
    );
}

fn assert_source_bytes(value: u128) {
    require!(
        (1..=PAID_SOURCE_MAX_BYTES).contains(&value),
        "source_bytes must be between 1 and 20,000,000,000"
    );
}

fn assert_ingest_public_key(value: &str) {
    let encoded = value.strip_prefix("ed25519:").unwrap_or("");
    require!(
        (43..=44).contains(&encoded.len()) && decoded_base58_len(encoded) == Some(32),
        "ingest_public_key must be a canonical ed25519 public key"
    );
}

fn decoded_base58_len(value: &str) -> Option<usize> {
    const ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mut bytes = vec![0u8];
    for character in value.bytes() {
        let mut carry = ALPHABET.iter().position(|byte| *byte == character)? as u32;
        for byte in bytes.iter_mut().rev() {
            let next = u32::from(*byte) * 58 + carry;
            *byte = (next & 0xff) as u8;
            carry = next >> 8;
        }
        while carry > 0 {
            bytes.insert(0, (carry & 0xff) as u8);
            carry >>= 8;
        }
    }
    let leading_zeroes = value.bytes().take_while(|byte| *byte == b'1').count();
    let significant = bytes
        .iter()
        .position(|byte| *byte != 0)
        .unwrap_or(bytes.len());
    Some(leading_zeroes + bytes.len() - significant)
}

fn assert_cid(value: &str) {
    require!(
        !value.is_empty()
            && value.len() <= 200
            && value.bytes().all(|byte| byte.is_ascii_graphic()),
        "manifest_cid must be 1-200 visible ASCII characters"
    );
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
            account("verifier.testnet"),
            account("cleaner.testnet"),
            (1..=5)
                .map(|index| account(&format!("kms-{index}.testnet")))
                .collect(),
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
        assert_eq!(contract.get_creator_balance(creator_id.clone()), U128(0));

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
}
