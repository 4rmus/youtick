use crate::*;

/// Snapshot of the on-chain Contract layout **before** the V11 migration.
/// Must match the borsh encoding of the currently deployed WASM byte-for-byte.
#[near(serializers = [borsh])]
pub struct OldContract {
    tokens: YtNft,
    metadata: LazyOption<NFTContractMetadata>,
    video_metadata: UnorderedMap<TokenId, VideoMetadata>,
    user_deposits: LookupMap<AccountId, NearToken>,
    events: UnorderedMap<String, Event>,
    next_token_id: u64,
    active_event_count: u64,
    gift_drops: LookupMap<String, GiftDrop>,
    trial_pool: NearToken,
    onboarding_keys: LookupSet<PublicKey>,
    daily_trial_counts: LookupMap<u64, u32>,
    onboarding_config: OnboardingConfig,
    commission_pool: NearToken,
    purchase_logs: UnorderedMap<u64, PurchaseLog>,
    next_purchase_id: u64,
    web4_static_url: Option<String>,
}

#[near]
impl Contract {
    /// V11 state migration: adds creator_profiles for studio page.
    ///
    /// Call exactly once immediately after deploying the new WASM:
    ///
    /// ```bash
    /// near contract call-function as-transaction youtick.near migrate \
    ///   json-args '{}' prepaid-gas '300 Tgas' attached-deposit '0 NEAR' \
    ///   sign-as youtick.near network-config mainnet sign-with-keychain send
    /// ```
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: OldContract = env::state_read().expect("Cannot deserialize old state");

        env::log_str("V11 migration: added creator_profiles");

        Self {
            tokens: old.tokens,
            metadata: old.metadata,
            video_metadata: old.video_metadata,
            user_deposits: old.user_deposits,
            events: old.events,
            next_token_id: old.next_token_id,
            active_event_count: old.active_event_count,
            gift_drops: old.gift_drops,
            trial_pool: old.trial_pool,
            onboarding_keys: old.onboarding_keys,
            daily_trial_counts: old.daily_trial_counts,
            onboarding_config: old.onboarding_config,
            commission_pool: old.commission_pool,
            purchase_logs: old.purchase_logs,
            next_purchase_id: old.next_purchase_id,
            web4_static_url: old.web4_static_url,
            creator_profiles: LookupMap::new(StorageKey::CREATOR_PROFILES),
        }
    }
}
