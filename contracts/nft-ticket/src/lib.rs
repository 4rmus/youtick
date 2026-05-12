// contracts/nft-ticket/src/lib.rs

use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    collections::{LazyOption, LookupMap, LookupSet, UnorderedMap},
    env,
    json_types::{Base64VecU8, U128},
    near, require, AccountId, NearToken, PanicOnDefault, Promise, PromiseOrValue, PublicKey,
};
use std::collections::HashMap;
use std::num::NonZeroU128;

mod events;
mod gift;
mod market;
mod migrate;
mod moderation;
mod nft;
mod onboarding;
mod timelock;
mod treasury;
mod views;
mod web4;

pub(crate) use nft::YtNft;

// ═══════════════════════════════════════════════════════════════
// NFT TOKEN TYPES (replaces near-contract-standards)
// ═══════════════════════════════════════════════════════════════

pub type TokenId = String;

pub const NFT_METADATA_SPEC: &str = "nft-1.0.0";

#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct NFTContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<Base64VecU8>,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<Base64VecU8>,
    pub copies: Option<u64>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<Base64VecU8>,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub metadata: Option<TokenMetadata>,
    pub approved_account_ids: Option<HashMap<AccountId, u64>>,
}

// ═══════════════════════════════════════════════════════════════
// TIMELOCK TYPES
// ═══════════════════════════════════════════════════════════════

pub const TIMELOCK_DELAY_NS: u64 = 86_400_000_000_000; // 24 hours
const PENDING_OWNER_STORAGE_KEY: &[u8] = b"v2:po";

#[near(serializers = [borsh, json])]
pub enum TimelockAction {
    WithdrawTrialPool {
        amount: U128,
    },
    WithdrawCommission {
        amount: U128,
    },
    WithdrawTrialPoolUsdc {
        amount: U128,
    },
    WithdrawCommissionUsdc {
        amount: U128,
    },
    AdminRemoveEvents {
        encrypted_cids: Vec<String>,
    },
    BanEvent {
        encrypted_cid: String,
        reason: BanReason,
    },
    UnbanEvent {
        encrypted_cid: String,
    },
    SetNextTokenId {
        new_id: u64,
    },
    AddOnboardingKey {
        public_key: String,
    },
    RemoveOnboardingKey {
        public_key: String,
    },
    SetOnboardingConfig {
        daily_limit: u32,
        enabled: bool,
    },
    SetWeb4StaticUrl {
        url: String,
    },
    ProposeOwner {
        proposed_owner_id: AccountId,
    },
    RebuildCidToTokens,
    CreateTrialInviteDrop {
        public_keys: Vec<String>,
        ttl_ms: Option<u64>,
    },
    NftMint {
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    },
    Pause,
    Unpause,
}

#[near(serializers = [borsh, json])]
pub struct TimelockProposal {
    pub action: TimelockAction,
    pub proposer: AccountId,
    pub proposed_at: u64,
}

pub struct StorageKey(pub &'static [u8]);

impl near_sdk::IntoStorageKey for StorageKey {
    fn into_storage_key(self) -> Vec<u8> {
        self.0.to_vec()
    }
}

impl StorageKey {
    pub const NFT: Self = Self(b"v2:n");
    pub const NFT_V2: Self = Self(b"v2:n2");
    pub const TOKEN_METADATA: Self = Self(b"v2:m");
    pub const TOKEN_METADATA_V2: Self = Self(b"v2:m2");
    pub const ENUMERATION: Self = Self(b"v2:e");
    pub const ENUMERATION_V2: Self = Self(b"v2:e2");
    pub const APPROVAL: Self = Self(b"v2:a");
    pub const APPROVAL_V2: Self = Self(b"v2:a2");
    pub const CONTRACT_METADATA: Self = Self(b"v2:c");
    pub const VIDEO_METADATA: Self = Self(b"v2:v");
    pub const USER_DEPOSITS: Self = Self(b"v2:d");
    pub const EVENTS: Self = Self(b"v2:x");
    pub const GIFT_DROPS: Self = Self(b"v2:g");
    pub const ONBOARDING_KEYS: Self = Self(b"v2:o");
    pub const DAILY_TRIAL_COUNTS: Self = Self(b"v2:t");
    pub const PURCHASE_LOGS: Self = Self(b"v2:p");
    pub const EVENT_PRICE_USD: Self = Self(b"v2:pu");
    pub const EVENT_ACCESS_MODES: Self = Self(b"v2:am");
    pub const BANNED_EVENTS: Self = Self(b"v2:be");
    pub const UPLOAD_SESSIONS: Self = Self(b"v2:us");
    pub const TRIAL_INVITES: Self = Self(b"v2:ti");
    pub const CID_TO_TOKENS: Self = Self(b"v2:ct");
    pub const PAUSED_STATE: Self = Self(b"v2:ps");
    pub const TIMELOCKS: Self = Self(b"v2:tl");
    pub const TIMELOCK_COUNTER: Self = Self(b"v2:tc");
    pub const CREATOR_PROFILES: Self = Self(b"v2:cp");
    pub const EVENT_PRICE_USDC: Self = Self(b"v2:pu6");
    pub const YtNftOwnerById: Self = Self(b"v2:y20");
    pub const YtNftMetadata: Self = Self(b"v2:y21");
    pub const YtNftTokensPerOwner: Self = Self(b"v2:y22");
    pub const YtNftApprovals: Self = Self(b"v2:y23");
    pub const STABLECOIN_CREATOR_BALANCES: Self = Self(b"v2:scb");
    pub const STABLECOIN_COMMISSION_BALANCES: Self = Self(b"v2:scm");
    pub const SETTLED_STABLECOIN_PAYMENTS: Self = Self(b"v2:ssp");
}

/// Storage cost constants to avoid repeated allocations
const STORAGE_COST_NFT: NearToken = NearToken::from_millinear(10); // 0.01 NEAR
const STORAGE_COST_ACCOUNT: NearToken = NearToken::from_millinear(100); // 0.1 NEAR
/// Storage cost for sponsored trial / guest account creation.
/// NEAR protocol minimum for an account + one access key is ~0.00182 NEAR;
/// this constant leaves a small buffer above that floor so funded accounts can
/// sign their own follow-up transactions before any upgrade path.
const TRIAL_ACCOUNT_STORAGE_COST: NearToken = NearToken::from_millinear(2); // 0.002 NEAR
const UPLOAD_SESSION_MAX_TTL_MS: u64 = 15 * 60 * 1000;
const UPLOAD_SESSION_TOTAL_CALLS: u8 = 2;

// ─── Commission constants ───────────────────────────────────────

/// Platform commission rate: 2% of each paid sale goes to the platform
const COMMISSION_RATE_PERCENT: u128 = 2;
const COMMISSION_DENOMINATOR: u128 = 100;

/// Basis-point representation of the commission rate (200 bps = 2%).
/// Useful when composing with other BPS-based logic.
#[allow(dead_code)]
const COMMISSION_RATE_BPS: u128 = 200;
#[allow(dead_code)]
const BPS_DENOMINATOR: u128 = 10_000;

/// Split ratio for commission proceeds: 50 % trial pool, 50 % commission pool.
const COMMISSION_SPLIT_DENOMINATOR: u128 = 2;

// ─── Storage / deposit constants ────────────────────────────────

/// Storage cost for an onboarding invite record (0.01 NEAR).
const STORAGE_COST_INVITE: NearToken = NearToken::from_millinear(10);

/// Deposit required per gift-claim link (0.15 NEAR).
/// Covers account creation + NFT storage + buffer.
const GIFT_DEPOSIT_PER_LINK: NearToken = NearToken::from_millinear(150);

/// Account creation + access-key storage cost (0.11 NEAR).
const ACCOUNT_CREATION_COST: NearToken = NearToken::from_millinear(110);

/// Gas fee allowance for a single claim/relay transaction (0.05 NEAR).
const GAS_FEE_ALLOWANCE: NearToken = NearToken::from_millinear(50);

fn wrap_near_account_id() -> AccountId {
    let current = env::current_account_id();
    if current.as_str().ends_with(".testnet") {
        "wrap.testnet".parse().unwrap()
    } else {
        "wrap.near".parse().unwrap()
    }
}

fn usdc_contract_id() -> AccountId {
    "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
        .parse()
        .unwrap()
}

fn usdt_contract_id() -> AccountId {
    let current = env::current_account_id();
    if current.as_str().ends_with(".testnet") {
        "usdt.tether-token.testnet".parse().unwrap()
    } else {
        "usdt.tether-token.near".parse().unwrap()
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Event {
    pub title: String,
    pub description: String,
    /// Legacy NEAR price (yoctoNEAR). Kept for backward compatibility.
    pub price: U128,
    /// USDC price (6 decimals). Primary price for new events.
    pub price_usdc: Option<U128>,
    /// NEAR price for explicit NEAR-denominated events.
    pub price_near: Option<U128>,
    pub creator_id: AccountId,
    pub created_at: u64,
    pub content_type: ContentType,
}

/// JSON-only response struct for get_events/get_event.
/// Includes price_usd from separate LookupMap (not stored in Event borsh).
#[near(serializers = [json])]
#[derive(Clone)]
pub struct EventResponse {
    pub title: String,
    pub description: String,
    /// Legacy NEAR price (yoctoNEAR)
    pub price: U128,
    /// Primary price in USDC (6 decimals). Fetched from separate map.
    pub price_usdc: Option<U128>,
    /// NEAR price for explicit NEAR-denominated events.
    pub price_near: Option<U128>,
    pub creator_id: AccountId,
    pub created_at: u64,
    /// USD cents display value (deprecated — use price_usdc)
    pub price_usd: Option<u128>,
    pub access_mode: String,
    pub content_type: String,
    pub banned: Option<bool>,
    pub ban_reason: Option<String>,
}

/// Paginated response for get_events_paginated view method.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct PaginatedEventsResponse {
    pub events: Vec<(String, EventResponse)>,
    pub next_cursor: Option<String>,
    pub total_count: u64,
}

// Custom video metadata for token-gated content
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct VideoMetadata {
    pub encrypted_cid: String,
    pub duration_seconds: u32,
    pub event_date: Option<u64>,
    pub content_type: ContentType,
    pub nova_group_id: Option<String>, // Borsh placeholder — always None for new tokens
    pub storage_type: StorageType,     // Borsh placeholder — always Kms for new tokens
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContentType {
    Concert,
    Cinema,
    Exclusive,
    LiveEvent,
    Documentary,
    ShortFilm,
    FestivalSelection,
}

impl std::fmt::Display for ContentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ContentType::Concert => write!(f, "concert"),
            ContentType::Cinema => write!(f, "cinema"),
            ContentType::Exclusive => write!(f, "exclusive"),
            ContentType::LiveEvent => write!(f, "live_event"),
            ContentType::Documentary => write!(f, "documentary"),
            ContentType::ShortFilm => write!(f, "short_film"),
            ContentType::FestivalSelection => write!(f, "festival_selection"),
        }
    }
}

fn parse_content_type(ct: &str) -> Option<ContentType> {
    match ct.to_lowercase().as_str() {
        "concert" => Some(ContentType::Concert),
        "cinema" => Some(ContentType::Cinema),
        "exclusive" => Some(ContentType::Exclusive),
        "live_event" => Some(ContentType::LiveEvent),
        "documentary" => Some(ContentType::Documentary),
        "short_film" => Some(ContentType::ShortFilm),
        "festival_selection" => Some(ContentType::FestivalSelection),
        _ => None,
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq)]
pub enum StorageType {
    Nova, // Borsh-compatible placeholder — new uploads always use Kms
    Kms,
}

// NEW: Gift drop for trial account creation
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct GiftDrop {
    pub creator_id: AccountId,
    pub event_cid: String,
    pub remaining_claims: u32,
    pub deposit_per_claim: U128, // Amount reserved for each claim
    pub created_at: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TrialInvite {
    pub sponsor_id: AccountId,
    pub remaining_claims: u32,
    pub created_at_ms: u64,
    pub expires_at_ms: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub enum BanReason {
    SexualContent,
    CopyrightViolation,
    Other,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct BanInfo {
    pub reason: BanReason,
    pub banned_at: u64,
    pub banned_by: AccountId,
}

// Onboarding configuration
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct OnboardingConfig {
    pub daily_limit: u32, // Max trials per day (0 = unlimited)
    pub enabled: bool,    // Master switch for relayer-less onboarding
}

impl Default for OnboardingConfig {
    fn default() -> Self {
        Self {
            daily_limit: 100, // Default: 100 trials per day
            enabled: true,
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub enum PurchaseType {
    Direct,
    Prepaid, // Borsh-compatible placeholder — never constructed in current code
    Free,
}

// Purchase log entry for traceability
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct PurchaseLog {
    pub buyer_id: AccountId,
    pub creator_id: AccountId,
    pub event_cid: String,
    pub token_id: String,
    pub price: U128,
    pub creator_amount: U128,
    pub commission_amount: U128,
    pub purchase_type: PurchaseType,
    pub timestamp_ns: u64,
}

// V11: Creator profile for studio page
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct CreatorProfile {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub website: Option<String>,
    pub twitter: Option<String>,
    pub instagram: Option<String>,
    pub avatar_url: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct CreatorStats {
    pub total_sales: u64,
    pub total_revenue_yocto: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Eq)]
pub enum UploadSessionStatus {
    AwaitingMint,
    AwaitingEvent,
    Completed,
    Revoked,
    Expired,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct UploadSession {
    pub owner_id: AccountId,
    pub remaining_budget: U128,
    pub remaining_calls: u8,
    pub expires_at_ms: u64,
    pub status: UploadSessionStatus,
}

// ═══════════════════════════════════════════════════════════════
// WEB4 TYPES
// ═══════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize, schemars::JsonSchema)]
#[serde(crate = "near_sdk::serde")]
pub struct Web4Request {
    pub path: String,
    #[serde(default)]
    pub query: HashMap<String, Vec<String>>,
}

#[derive(Serialize, schemars::JsonSchema)]
#[serde(crate = "near_sdk::serde")]
#[serde(untagged)]
pub enum Web4Response {
    Body {
        #[serde(rename = "contentType")]
        content_type: String,
        #[schemars(with = "String")]
        body: Base64VecU8,
    },
    BodyUrl {
        #[serde(rename = "contentType")]
        content_type: String,
        #[serde(rename = "bodyUrl")]
        body_url: String,
    },
}

/// Minimum ticket price to avoid commission rounding issues (0.001 NEAR).
const MIN_TICKET_PRICE_YOCTO: u128 = 1_000_000_000_000_000_000_000;
/// Minimum paid ticket price in USDC (6 decimals): $0.50 = 500_000
const MIN_TICKET_PRICE_USDC: u128 = 500_000;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    tokens: YtNft,
    metadata: LazyOption<NFTContractMetadata>,
    video_metadata: UnorderedMap<TokenId, VideoMetadata>,
    user_deposits: LookupMap<AccountId, NearToken>,
    events: UnorderedMap<String, Event>, // Key: encrypted_cid (UUID)
    next_token_id: u64,
    /// Cached count of non-banned events to avoid O(N) iteration in get_events_count.
    active_event_count: u64,
    // Gift drop system
    gift_drops: LookupMap<String, GiftDrop>, // Key: hash of secret key
    // Sponsored trial pool - contract pays for trial account creation
    trial_pool: NearToken,
    // V4: RELAYER-LESS ONBOARDING SYSTEM
    // Authorized Function Call Access Keys for trial creation
    onboarding_keys: LookupSet<PublicKey>,
    // Daily trial counts for rate limiting: day_timestamp -> count
    daily_trial_counts: LookupMap<u64, u32>,
    // Onboarding configuration
    onboarding_config: OnboardingConfig,
    // V5: Commission tracking pool (50% of 2% commission) in NEAR
    commission_pool: NearToken,
    // V12: USDC-native commission pools (6 decimals)
    trial_pool_usdc: u128,
    commission_pool_usdc: u128,
    // V6: Purchase logs for audit trail and traceability
    purchase_logs: UnorderedMap<u64, PurchaseLog>,
    next_purchase_id: u64,
    // V10: Nova fields removed via state migration (see migrate.rs)
    pub web4_static_url: Option<String>,
    // V11: Creator profiles for studio page
    creator_profiles: LookupMap<AccountId, CreatorProfile>,
    // V12: USDC price map for USDC-native payments (6 decimals)
    events_price_usdc: LookupMap<String, U128>,
    // Reentrancy lock for ft_on_transfer (USDC/USDT path)
    ft_transfer_lock: bool,
    // V12: Audit nonce for ft_on_transfer tracking
    next_swap_nonce: u64,
}

// SECURITY: Use #[init] to prevent re-initialization attacks
#[near]
impl Contract {
    fn fresh_v1_state(owner_id: AccountId, web4_static_url: Option<String>) -> Self {
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "YouTick Video Tickets".to_string(),
            symbol: "YTICK".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        };

        Self {
            tokens: YtNft::new(owner_id),
            metadata: LazyOption::new(StorageKey::CONTRACT_METADATA, Some(&metadata)),
            video_metadata: UnorderedMap::new(StorageKey::VIDEO_METADATA),
            user_deposits: LookupMap::new(StorageKey::USER_DEPOSITS),
            events: UnorderedMap::new(StorageKey::EVENTS),
            next_token_id: 0,
            active_event_count: 0,
            gift_drops: LookupMap::new(StorageKey::GIFT_DROPS),
            trial_pool: NearToken::from_yoctonear(0),
            onboarding_keys: LookupSet::new(StorageKey::ONBOARDING_KEYS),
            daily_trial_counts: LookupMap::new(StorageKey::DAILY_TRIAL_COUNTS),
            onboarding_config: OnboardingConfig::default(),
            commission_pool: NearToken::from_yoctonear(0),
            purchase_logs: UnorderedMap::new(StorageKey::PURCHASE_LOGS),
            next_purchase_id: 0,
            web4_static_url,
            creator_profiles: LookupMap::new(StorageKey::CREATOR_PROFILES),
            events_price_usdc: LookupMap::new(StorageKey::EVENT_PRICE_USDC),
            trial_pool_usdc: 0,
            commission_pool_usdc: 0,
            ft_transfer_lock: false,
            next_swap_nonce: 0,
        }
    }

    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        require!(!env::state_exists(), "Already initialized");
        Self::fresh_v1_state(owner_id, None)
    }

    /// Complete migration reset. Disabled in normal production builds.
    #[cfg(feature = "migration")]
    #[init(ignore_state)]
    pub fn reset_v11(owner_id: AccountId) -> Self {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Only owner can reset"
        );
        let _ = owner_id;
        Self::fresh_v1_state(env::current_account_id(), None)
    }

    #[cfg(feature = "migration")]
    #[init(ignore_state)]
    pub fn reset_for_v1_launch(web4_static_url: Option<String>) -> Self {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Only contract account can reset for v1 launch"
        );
        Self::fresh_v1_state(env::current_account_id(), web4_static_url)
    }

    /// Migration-only reset is intentionally unavailable in normal production builds.
    #[cfg(not(feature = "migration"))]
    #[init(ignore_state)]
    pub fn reset_v11(owner_id: AccountId) -> Self {
        let _ = owner_id;
        env::panic_str("reset_v11 is disabled outside migration builds")
    }

    #[cfg(not(feature = "migration"))]
    #[init(ignore_state)]
    pub fn reset_for_v1_launch(web4_static_url: Option<String>) -> Self {
        let _ = web4_static_url;
        env::panic_str("reset_for_v1_launch is disabled outside migration builds")
    }

    // ═══════════════════════════════════════════════════════════════
    // LAZY STORAGE HELPER (event_price_usd stored outside Contract borsh)
    // ═══════════════════════════════════════════════════════════════

    pub(crate) fn lazy_event_price_usd(&self) -> LookupMap<String, u128> {
        LookupMap::new(StorageKey::EVENT_PRICE_USD)
    }

    pub(crate) fn lazy_event_access_modes(&self) -> LookupMap<String, String> {
        LookupMap::new(StorageKey::EVENT_ACCESS_MODES)
    }

    // ═══════════════════════════════════════════════════════════════
    // LAZY STORAGE HELPER (banned_events stored outside Contract borsh)
    // ═══════════════════════════════════════════════════════════════

    pub(crate) fn lazy_banned_events(&self) -> LookupMap<String, BanInfo> {
        LookupMap::new(StorageKey::BANNED_EVENTS)
    }

    pub(crate) fn lazy_upload_sessions(&self) -> LookupMap<PublicKey, UploadSession> {
        LookupMap::new(StorageKey::UPLOAD_SESSIONS)
    }

    pub(crate) fn lazy_trial_invites(&self) -> LookupMap<String, TrialInvite> {
        LookupMap::new(StorageKey::TRIAL_INVITES)
    }

    pub(crate) fn lazy_cid_to_tokens(&self) -> LookupMap<String, Vec<TokenId>> {
        LookupMap::new(StorageKey::CID_TO_TOKENS)
    }

    pub(crate) fn lazy_stablecoin_creator_balances(&self) -> LookupMap<String, u128> {
        LookupMap::new(StorageKey::STABLECOIN_CREATOR_BALANCES)
    }

    pub(crate) fn lazy_stablecoin_commission_balances(&self) -> LookupMap<String, u128> {
        LookupMap::new(StorageKey::STABLECOIN_COMMISSION_BALANCES)
    }

    pub(crate) fn lazy_settled_stablecoin_payments(&self) -> LookupSet<String> {
        LookupSet::new(StorageKey::SETTLED_STABLECOIN_PAYMENTS)
    }

    pub(crate) fn lazy_paused_state(&self) -> LazyOption<bool> {
        LazyOption::new(StorageKey::PAUSED_STATE, Some(&false))
    }

    pub(crate) fn is_paused(&self) -> bool {
        self.lazy_paused_state().get().unwrap_or(false)
    }

    pub(crate) fn assert_not_paused(&self) {
        require!(!self.is_paused(), "Contract is paused");
    }

    pub(crate) fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only contract owner can call this method"
        );
    }

    pub(crate) fn assert_migration_build() {
        require!(
            cfg!(feature = "migration"),
            "Method disabled outside migration builds"
        );
    }

    pub(crate) fn event_usdc_price(&self, cid: &str, event: &Event) -> Option<U128> {
        event
            .price_usdc
            .or_else(|| self.events_price_usdc.get(&cid.to_string()))
    }

    pub(crate) fn event_near_price_option(event: &Event) -> Option<U128> {
        event.price_near.or_else(|| {
            if event.price.0 > 0 {
                Some(event.price)
            } else {
                None
            }
        })
    }

    pub(crate) fn event_near_price(event: &Event) -> U128 {
        Self::event_near_price_option(event).unwrap_or(U128(0))
    }

    pub(crate) fn event_has_paid_price(&self, cid: &str, event: &Event) -> bool {
        Self::event_near_price(event).0 > 0
            || self
                .event_usdc_price(cid, event)
                .map(|price| price.0 > 0)
                .unwrap_or(false)
    }

    pub(crate) fn assert_event_not_banned(&self, encrypted_cid: &str) {
        require!(
            self.lazy_banned_events()
                .get(&encrypted_cid.to_string())
                .is_none(),
            "This event has been banned and tickets cannot be purchased"
        );
    }

    pub(crate) fn assert_near_purchase_available(&self, cid: &str, event: &Event) {
        let near_price = Self::event_near_price(event).0;
        let usdc_price = self
            .event_usdc_price(cid, event)
            .map(|price| price.0)
            .unwrap_or(0);
        require!(
            near_price > 0 || usdc_price == 0,
            "NEAR price is not configured for this event"
        );
    }

    pub(crate) fn stablecoin_balance_key(
        token_contract: &AccountId,
        account_id: &AccountId,
    ) -> String {
        format!("{}:{}", token_contract, account_id)
    }

    pub(crate) fn add_stablecoin_creator_balance(
        &mut self,
        token_contract: &AccountId,
        creator_id: &AccountId,
        amount: u128,
    ) {
        if amount == 0 {
            return;
        }
        let key = Self::stablecoin_balance_key(token_contract, creator_id);
        let mut balances = self.lazy_stablecoin_creator_balances();
        let current = balances.get(&key).unwrap_or(0);
        balances.insert(&key, &current.saturating_add(amount));
    }

    pub(crate) fn add_stablecoin_commission_balance(
        &mut self,
        token_contract: &AccountId,
        amount: u128,
    ) {
        if amount == 0 {
            return;
        }
        let key = token_contract.to_string();
        let mut balances = self.lazy_stablecoin_commission_balances();
        let current = balances.get(&key).unwrap_or(0);
        balances.insert(&key, &current.saturating_add(amount));
    }

    pub(crate) fn pending_owner_id_internal() -> Option<AccountId> {
        env::storage_read(PENDING_OWNER_STORAGE_KEY).map(|bytes| {
            let value = String::from_utf8(bytes).expect("Invalid pending owner encoding");
            value.parse().expect("Invalid pending owner account")
        })
    }

    pub(crate) fn set_pending_owner_id(owner_id: Option<&AccountId>) {
        if let Some(owner_id) = owner_id {
            env::storage_write(PENDING_OWNER_STORAGE_KEY, owner_id.as_str().as_bytes());
        } else {
            env::storage_remove(PENDING_OWNER_STORAGE_KEY);
        }
    }

    pub(crate) fn lazy_timelocks(&self) -> LookupMap<u64, TimelockProposal> {
        LookupMap::new(StorageKey::TIMELOCKS)
    }

    pub(crate) fn lazy_timelock_counter(&self) -> LazyOption<u64> {
        LazyOption::new(StorageKey::TIMELOCK_COUNTER, Some(&0))
    }

    pub(crate) fn next_timelock_id(&mut self) -> u64 {
        let id = self.lazy_timelock_counter().get().unwrap_or(0);
        self.lazy_timelock_counter().set(&(id + 1));
        id
    }

    pub(crate) fn add_token_to_cid_index(&mut self, cid: &String, token_id: &TokenId) {
        let mut ids = self.lazy_cid_to_tokens().get(cid).unwrap_or_default();
        ids.push(token_id.clone());
        self.lazy_cid_to_tokens().insert(cid, &ids);
    }

    pub(crate) fn remove_cid_index(&mut self, cid: &String) {
        self.lazy_cid_to_tokens().remove(cid);
    }

    pub(crate) fn normalize_access_mode(
        &self,
        access_mode: Option<String>,
        has_paid_price: bool,
    ) -> String {
        let raw = access_mode.unwrap_or_else(|| {
            if has_paid_price {
                "paid".to_string()
            } else {
                "free_collectible".to_string()
            }
        });

        let normalized = raw.trim().to_ascii_lowercase();
        match normalized.as_str() {
            "paid" => {
                require!(
                    has_paid_price,
                    "Paid events must have a price greater than zero"
                );
                normalized
            }
            "free_collectible" => {
                require!(!has_paid_price, "Free access modes require zero price");
                normalized
            }
            _ => env::panic_str("Invalid access mode"),
        }
    }

    pub(crate) fn resolve_event_access_mode(&self, cid: &str, has_paid_price: bool) -> String {
        self.lazy_event_access_modes()
            .get(&cid.to_string())
            .unwrap_or_else(|| {
                if has_paid_price {
                    "paid".to_string()
                } else {
                    "free_collectible".to_string()
                }
            })
    }

    pub(crate) fn store_event_access_mode(&mut self, cid: &str, access_mode: String) {
        self.lazy_event_access_modes()
            .insert(&cid.to_string(), &access_mode);
    }

    pub(crate) fn minimum_upload_session_budget() -> NearToken {
        STORAGE_COST_ACCOUNT.saturating_add(STORAGE_COST_ACCOUNT)
    }

    pub(crate) fn is_upload_session_terminal(status: &UploadSessionStatus) -> bool {
        matches!(
            status,
            UploadSessionStatus::Completed
                | UploadSessionStatus::Revoked
                | UploadSessionStatus::Expired
        )
    }

    pub(crate) fn current_time_ms() -> u64 {
        env::block_timestamp_ms()
    }

    pub(crate) fn view_upload_session(&self, public_key: &PublicKey) -> Option<UploadSession> {
        self.lazy_upload_sessions()
            .get(public_key)
            .map(|mut session| {
                if !Self::is_upload_session_terminal(&session.status)
                    && Self::current_time_ms() > session.expires_at_ms
                {
                    session.status = UploadSessionStatus::Expired;
                }
                session
            })
    }

    pub(crate) fn use_upload_session(
        &mut self,
        expected_status: UploadSessionStatus,
        next_status: UploadSessionStatus,
        charge_amount: NearToken,
    ) -> PublicKey {
        let account_id = env::predecessor_account_id();
        let signer_pk = env::signer_account_pk();
        let mut sessions = self.lazy_upload_sessions();
        let mut session = sessions.get(&signer_pk).expect("Upload session not found");

        require!(
            session.owner_id == account_id,
            "Upload session owner mismatch"
        );

        if !Self::is_upload_session_terminal(&session.status)
            && Self::current_time_ms() > session.expires_at_ms
        {
            session.status = UploadSessionStatus::Expired;
            sessions.insert(&signer_pk, &session);
            env::panic_str("Upload session expired");
        }

        require!(
            session.status == expected_status,
            "Upload session out of sequence"
        );
        require!(session.remaining_calls > 0, "Upload session exhausted");
        require!(
            session.remaining_budget.0 >= charge_amount.as_yoctonear(),
            "Upload session budget exhausted"
        );

        session.remaining_calls = session.remaining_calls.saturating_sub(1);
        session.remaining_budget = U128(
            session
                .remaining_budget
                .0
                .saturating_sub(charge_amount.as_yoctonear()),
        );
        session.status = next_status;
        sessions.insert(&signer_pk, &session);

        signer_pk
    }

    pub(crate) fn refund_upload_session(
        &self,
        owner_id: &AccountId,
        amount: NearToken,
        reason: &str,
    ) {
        if amount.as_yoctonear() == 0 {
            return;
        }

        env::log_str(&format!(
            "Upload session refund: {} yoctoNEAR to {} ({})",
            amount.as_yoctonear(),
            owner_id,
            reason
        ));

        Promise::new(owner_id.clone()).transfer(amount).as_return();
    }

    pub(crate) fn close_upload_session(
        &mut self,
        public_key: &PublicKey,
        final_status: UploadSessionStatus,
    ) {
        let mut sessions = self.lazy_upload_sessions();
        if let Some(mut session) = sessions.remove(public_key) {
            let refund_amount = NearToken::from_yoctonear(session.remaining_budget.0);
            let owner_id = session.owner_id.clone();

            session.remaining_budget = U128(0);
            session.remaining_calls = 0;
            session.status = final_status;

            self.refund_upload_session(&owner_id, refund_amount, "session closed");
        }
    }

    pub(crate) fn restore_gift_drop_claim(&mut self, signer_public_key: &PublicKey) {
        let signer_pk = String::from(signer_public_key);
        if let Some(mut gift_drop) = self.gift_drops.get(&signer_pk) {
            gift_drop.remaining_claims = 1;
            self.gift_drops.insert(&signer_pk, &gift_drop);
        }
    }

    pub(crate) fn restore_trial_invite_claim(&mut self, signer_public_key: &PublicKey) {
        let signer_pk = String::from(signer_public_key);
        let mut trial_invites = self.lazy_trial_invites();
        if let Some(mut trial_invite) = trial_invites.get(&signer_pk) {
            trial_invite.remaining_claims = 1;
            trial_invites.insert(&signer_pk, &trial_invite);
        }
    }

    pub(crate) fn is_trial_invite_expired(invite: &TrialInvite) -> bool {
        invite
            .expires_at_ms
            .map(|expires_at_ms| Self::current_time_ms() > expires_at_ms)
            .unwrap_or(false)
    }

    pub(crate) fn implicit_account_id_from_public_key(public_key: &PublicKey) -> AccountId {
        let public_key_str = String::from(public_key);
        let encoded = public_key_str
            .strip_prefix("ed25519:")
            .unwrap_or_else(|| env::panic_str("Trial invites only support ed25519 keys"));
        let decoded = bs58::decode(encoded)
            .into_vec()
            .unwrap_or_else(|_| env::panic_str("Invalid public key encoding"));

        require!(
            decoded.len() == 32,
            "Trial invites only support ed25519 keys",
        );

        let implicit_id = decoded
            .iter()
            .map(|byte| format!("{:02x}", byte))
            .collect::<String>();

        implicit_id
            .parse()
            .unwrap_or_else(|_| env::panic_str("Invalid implicit account id"))
    }

    /// DRY helper: build EventResponse with ban status and price_usd
    pub(crate) fn build_event_response(&self, cid: &str, event: &Event) -> EventResponse {
        let cid_string = cid.to_string();
        let price_usd = self.lazy_event_price_usd().get(&cid_string);
        let price_usdc = self.event_usdc_price(cid, event);
        let price_near = Self::event_near_price_option(event);
        let ban_info = self.lazy_banned_events().get(&cid_string);
        EventResponse {
            title: event.title.clone(),
            description: event.description.clone(),
            price: event.price,
            price_usdc,
            price_near,
            creator_id: event.creator_id.clone(),
            created_at: event.created_at,
            price_usd,
            access_mode: self.resolve_event_access_mode(
                &cid_string,
                self.event_has_paid_price(&cid_string, event),
            ),
            content_type: event.content_type.to_string(),
            banned: if ban_info.is_some() { Some(true) } else { None },
            ban_reason: ban_info.map(|i| match i.reason {
                BanReason::SexualContent => "sexual_content".to_string(),
                BanReason::CopyrightViolation => "copyright_violation".to_string(),
                BanReason::Other => "other".to_string(),
            }),
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // WEB4 GATEWAY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Web4 gateway entry point — serves static content from IPFS.
    ///
    /// Path resolution rules (Next.js static export with trailingSlash):
    ///   "/"            → "/index.html"
    ///   "/discover/"   → "/discover/index.html"
    ///   "/discover"    → "/discover/index.html"  (no extension = route)
    ///   "/file.js"     → "/file.js"              (has extension = static file)
    pub fn get_storage_type(&self, token_id: TokenId) -> Option<StorageType> {
        self.video_metadata
            .get(&token_id)
            .map(|metadata| metadata.storage_type.clone())
    }

    /// Get all videos for an account (any storage type)
    /// Returns vector of (token_id, video_metadata) pairs
    pub fn get_videos(&self, account_id: AccountId) -> Vec<(TokenId, VideoMetadata)> {
        let token_ids = self
            .tokens
            .tokens_per_owner
            .get(&account_id)
            .unwrap_or_default();

        token_ids
            .iter()
            .filter_map(|token_id| {
                self.video_metadata
                    .get(token_id)
                    .map(|metadata| (token_id.clone(), metadata))
            })
            .collect()
    }

    /// Check if an account has a ticket for a specific video (identified by encrypted_cid)
    /// Used by KMS Worker for access authorization
    pub fn has_ticket(&self, account_id: AccountId, encrypted_cid: String) -> bool {
        let token_ids = self
            .tokens
            .tokens_per_owner
            .get(&account_id)
            .unwrap_or_default();

        token_ids.iter().any(|token_id| {
            self.video_metadata.get(token_id).map_or(false, |metadata| {
                metadata.encrypted_cid == encrypted_cid || metadata.encrypted_cid == "ACCESS_PASS"
            })
        })
    }
}

#[cfg(test)]
mod tests;
