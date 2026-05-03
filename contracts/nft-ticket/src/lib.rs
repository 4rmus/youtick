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
mod migrate;

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

/// Minimal NFT storage — replaces near-contract-standards::NonFungibleToken.
/// Uses only LookupMap (no TreeMap/Vector) to avoid near-sdk collections::Vector len desync bugs.
#[near(serializers = [borsh])]
pub struct YtNft {
    pub owner_id: AccountId,
    owner_by_id: LookupMap<TokenId, AccountId>,
    total_supply: u64,
    token_metadata_by_id: LookupMap<TokenId, TokenMetadata>,
    tokens_per_owner: LookupMap<AccountId, Vec<TokenId>>,
    approvals_by_id: LookupMap<TokenId, HashMap<AccountId, u64>>,
}

impl YtNft {
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            owner_by_id: LookupMap::new(StorageKey::YtNftOwnerById),
            total_supply: 0,
            token_metadata_by_id: LookupMap::new(StorageKey::YtNftMetadata),
            tokens_per_owner: LookupMap::new(StorageKey::YtNftTokensPerOwner),
            approvals_by_id: LookupMap::new(StorageKey::YtNftApprovals),
        }
    }

    pub fn internal_mint(
        &mut self,
        token_id: TokenId,
        owner_id: AccountId,
        metadata: Option<TokenMetadata>,
    ) -> Token {
        assert!(
            self.owner_by_id.get(&token_id).is_none(),
            "token_id must be unique"
        );

        self.owner_by_id.insert(&token_id, &owner_id);
        self.total_supply += 1;

        // Store metadata
        if let Some(ref meta) = metadata {
            self.token_metadata_by_id.insert(&token_id, meta);
        }

        // Update per-owner index
        let mut owner_tokens = self.tokens_per_owner.get(&owner_id).unwrap_or_default();
        owner_tokens.push(token_id.clone());
        self.tokens_per_owner.insert(&owner_id, &owner_tokens);

        // Initialize empty approvals
        self.approvals_by_id.insert(&token_id, &HashMap::new());

        Token {
            token_id,
            owner_id,
            metadata,
            approved_account_ids: Some(HashMap::new()),
        }
    }

    pub fn nft_token(&self, token_id: &TokenId) -> Option<Token> {
        let owner_id = self.owner_by_id.get(token_id)?;
        let metadata = self.token_metadata_by_id.get(token_id);
        let approved_account_ids = self.approvals_by_id.get(token_id);
        Some(Token {
            token_id: token_id.clone(),
            owner_id,
            metadata,
            approved_account_ids,
        })
    }

    pub fn nft_total_supply(&self) -> U128 {
        U128(self.total_supply as u128)
    }

    pub fn nft_supply_for_owner(&self, account_id: &AccountId) -> U128 {
        let count = self
            .tokens_per_owner
            .get(account_id)
            .map(|v| v.len() as u128)
            .unwrap_or(0);
        U128(count)
    }

    pub fn nft_tokens_for_owner(
        &self,
        account_id: &AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        let token_ids = self.tokens_per_owner.get(account_id).unwrap_or_default();
        let start: u128 = from_index.map(|x| x.0).unwrap_or(0);
        let limit = limit.unwrap_or(token_ids.len() as u64) as usize;
        let start = start as usize;

        token_ids
            .iter()
            .skip(start)
            .take(limit)
            .filter_map(|tid| self.nft_token(tid))
            .collect()
    }

    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        let start: u128 = from_index.map(|x| x.0).unwrap_or(0);
        let limit = limit.unwrap_or(self.total_supply) as usize;

        (start..self.total_supply as u128)
            .take(limit)
            .filter_map(|id| self.nft_token(&id.to_string()))
            .collect()
    }

    pub fn internal_transfer(
        &mut self,
        token_id: &TokenId,
        receiver_id: &AccountId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> Token {
        let owner_id = self.owner_by_id.get(token_id).expect("Token not found");

        // Remove from old owner's list
        if let Some(mut owner_tokens) = self.tokens_per_owner.get(&owner_id) {
            owner_tokens.retain(|t| t != token_id);
            if owner_tokens.is_empty() {
                // Don't store empty vec — remove the entry
                self.tokens_per_owner.insert(&owner_id, &Vec::new());
            } else {
                self.tokens_per_owner.insert(&owner_id, &owner_tokens);
            }
        }

        // Update owner
        self.owner_by_id.insert(token_id, receiver_id);

        // Add to new owner's list
        let mut receiver_tokens = self.tokens_per_owner.get(receiver_id).unwrap_or_default();
        receiver_tokens.push(token_id.clone());
        self.tokens_per_owner.insert(receiver_id, &receiver_tokens);

        // Reset approvals
        if let Some(ids) = approved_account_ids {
            self.approvals_by_id.insert(token_id, &ids);
        } else {
            self.approvals_by_id.insert(token_id, &HashMap::new());
        }

        let metadata = self.token_metadata_by_id.get(token_id);
        Token {
            token_id: token_id.clone(),
            owner_id: receiver_id.clone(),
            metadata,
            approved_account_ids: self.approvals_by_id.get(token_id),
        }
    }

    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        _approval_id: Option<u64>,
        _memo: Option<String>,
    ) -> Token {
        let _ = (receiver_id, token_id);
        env::panic_str("Ticket transfers disabled for v1")
    }

    pub fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        // Check if receiver has the token (transfer was successful)
        match self.owner_by_id.get(&token_id) {
            Some(owner) if owner == receiver_id => {
                // Update approvals if provided
                if let Some(ref ids) = approved_account_ids {
                    self.approvals_by_id.insert(&token_id, ids);
                }
                env::log_str(&format!(
                    "Transfer of {} from {} to {} succeeded",
                    token_id, previous_owner_id, receiver_id
                ));
                true
            }
            _ => {
                // Token was returned to previous owner — revert
                if let Some(mut receiver_tokens) = self.tokens_per_owner.get(&receiver_id) {
                    receiver_tokens.retain(|t| t != &token_id);
                    self.tokens_per_owner.insert(&receiver_id, &receiver_tokens);
                }
                self.owner_by_id.insert(&token_id, &previous_owner_id);
                let mut prev_tokens = self
                    .tokens_per_owner
                    .get(&previous_owner_id)
                    .unwrap_or_default();
                if !prev_tokens.contains(&token_id) {
                    prev_tokens.push(token_id.clone());
                }
                self.tokens_per_owner
                    .insert(&previous_owner_id, &prev_tokens);
                env::log_str(&format!(
                    "Transfer of {} from {} to {} failed — returned to {}",
                    token_id, previous_owner_id, receiver_id, previous_owner_id
                ));
                true
            }
        }
    }

    pub fn nft_approve(
        &mut self,
        token_id: &TokenId,
        account_id: &AccountId,
        _msg: Option<String>,
    ) {
        let owner_id = self.owner_by_id.get(token_id).expect("Token not found");
        let predecessor = env::predecessor_account_id();
        require!(predecessor == owner_id, "Only owner can approve");
        let mut approvals = self.approvals_by_id.get(token_id).unwrap_or_default();
        approvals.insert(account_id.clone(), env::block_timestamp());
        self.approvals_by_id.insert(token_id, &approvals);
    }

    pub fn nft_revoke(&mut self, token_id: &TokenId, account_id: &AccountId) {
        let owner_id = self.owner_by_id.get(token_id).expect("Token not found");
        require!(
            env::predecessor_account_id() == owner_id,
            "Only owner can revoke"
        );
        let mut approvals = self.approvals_by_id.get(token_id).unwrap_or_default();
        approvals.remove(account_id);
        self.approvals_by_id.insert(token_id, &approvals);
    }

    pub fn nft_revoke_all(&mut self, token_id: &TokenId) {
        let owner_id = self.owner_by_id.get(token_id).expect("Token not found");
        require!(
            env::predecessor_account_id() == owner_id,
            "Only owner can revoke all"
        );
        self.approvals_by_id.insert(token_id, &HashMap::new());
    }
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

    fn lazy_event_price_usd(&self) -> LookupMap<String, u128> {
        LookupMap::new(StorageKey::EVENT_PRICE_USD)
    }

    fn lazy_event_access_modes(&self) -> LookupMap<String, String> {
        LookupMap::new(StorageKey::EVENT_ACCESS_MODES)
    }

    // ═══════════════════════════════════════════════════════════════
    // LAZY STORAGE HELPER (banned_events stored outside Contract borsh)
    // ═══════════════════════════════════════════════════════════════

    fn lazy_banned_events(&self) -> LookupMap<String, BanInfo> {
        LookupMap::new(StorageKey::BANNED_EVENTS)
    }

    fn lazy_upload_sessions(&self) -> LookupMap<PublicKey, UploadSession> {
        LookupMap::new(StorageKey::UPLOAD_SESSIONS)
    }

    fn lazy_trial_invites(&self) -> LookupMap<String, TrialInvite> {
        LookupMap::new(StorageKey::TRIAL_INVITES)
    }

    fn lazy_cid_to_tokens(&self) -> LookupMap<String, Vec<TokenId>> {
        LookupMap::new(StorageKey::CID_TO_TOKENS)
    }

    fn lazy_stablecoin_creator_balances(&self) -> LookupMap<String, u128> {
        LookupMap::new(StorageKey::STABLECOIN_CREATOR_BALANCES)
    }

    fn lazy_stablecoin_commission_balances(&self) -> LookupMap<String, u128> {
        LookupMap::new(StorageKey::STABLECOIN_COMMISSION_BALANCES)
    }

    fn lazy_settled_stablecoin_payments(&self) -> LookupSet<String> {
        LookupSet::new(StorageKey::SETTLED_STABLECOIN_PAYMENTS)
    }

    fn lazy_paused_state(&self) -> LazyOption<bool> {
        LazyOption::new(StorageKey::PAUSED_STATE, Some(&false))
    }

    fn is_paused(&self) -> bool {
        self.lazy_paused_state().get().unwrap_or(false)
    }

    fn assert_not_paused(&self) {
        require!(!self.is_paused(), "Contract is paused");
    }

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only contract owner can call this method"
        );
    }

    fn assert_migration_build() {
        require!(
            cfg!(feature = "migration"),
            "Method disabled outside migration builds"
        );
    }

    fn event_usdc_price(&self, cid: &str, event: &Event) -> Option<U128> {
        event
            .price_usdc
            .or_else(|| self.events_price_usdc.get(&cid.to_string()))
    }

    fn event_near_price_option(event: &Event) -> Option<U128> {
        event
            .price_near
            .or_else(|| if event.price.0 > 0 { Some(event.price) } else { None })
    }

    fn event_near_price(event: &Event) -> U128 {
        Self::event_near_price_option(event).unwrap_or(U128(0))
    }

    fn event_has_paid_price(&self, cid: &str, event: &Event) -> bool {
        Self::event_near_price(event).0 > 0
            || self
                .event_usdc_price(cid, event)
                .map(|price| price.0 > 0)
                .unwrap_or(false)
    }

    fn assert_event_not_banned(&self, encrypted_cid: &str) {
        require!(
            self.lazy_banned_events()
                .get(&encrypted_cid.to_string())
                .is_none(),
            "This event has been banned and tickets cannot be purchased"
        );
    }

    fn assert_near_purchase_available(&self, cid: &str, event: &Event) {
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

    fn stablecoin_balance_key(token_contract: &AccountId, account_id: &AccountId) -> String {
        format!("{}:{}", token_contract, account_id)
    }

    fn add_stablecoin_creator_balance(
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

    fn add_stablecoin_commission_balance(&mut self, token_contract: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        let key = token_contract.to_string();
        let mut balances = self.lazy_stablecoin_commission_balances();
        let current = balances.get(&key).unwrap_or(0);
        balances.insert(&key, &current.saturating_add(amount));
    }

    fn pending_owner_id_internal() -> Option<AccountId> {
        env::storage_read(PENDING_OWNER_STORAGE_KEY).map(|bytes| {
            let value = String::from_utf8(bytes).expect("Invalid pending owner encoding");
            value.parse().expect("Invalid pending owner account")
        })
    }

    fn set_pending_owner_id(owner_id: Option<&AccountId>) {
        if let Some(owner_id) = owner_id {
            env::storage_write(PENDING_OWNER_STORAGE_KEY, owner_id.as_str().as_bytes());
        } else {
            env::storage_remove(PENDING_OWNER_STORAGE_KEY);
        }
    }

    fn lazy_timelocks(&self) -> LookupMap<u64, TimelockProposal> {
        LookupMap::new(StorageKey::TIMELOCKS)
    }

    fn lazy_timelock_counter(&self) -> LazyOption<u64> {
        LazyOption::new(StorageKey::TIMELOCK_COUNTER, Some(&0))
    }

    fn next_timelock_id(&mut self) -> u64 {
        let id = self.lazy_timelock_counter().get().unwrap_or(0);
        self.lazy_timelock_counter().set(&(id + 1));
        id
    }

    fn add_token_to_cid_index(&mut self, cid: &String, token_id: &TokenId) {
        let mut ids = self.lazy_cid_to_tokens().get(cid).unwrap_or_default();
        ids.push(token_id.clone());
        self.lazy_cid_to_tokens().insert(cid, &ids);
    }

    fn remove_cid_index(&mut self, cid: &String) {
        self.lazy_cid_to_tokens().remove(cid);
    }

    fn normalize_access_mode(&self, access_mode: Option<String>, has_paid_price: bool) -> String {
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

    fn resolve_event_access_mode(&self, cid: &str, has_paid_price: bool) -> String {
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

    fn store_event_access_mode(&mut self, cid: &str, access_mode: String) {
        self.lazy_event_access_modes()
            .insert(&cid.to_string(), &access_mode);
    }

    fn minimum_upload_session_budget() -> NearToken {
        STORAGE_COST_ACCOUNT.saturating_add(STORAGE_COST_ACCOUNT)
    }

    fn is_upload_session_terminal(status: &UploadSessionStatus) -> bool {
        matches!(
            status,
            UploadSessionStatus::Completed
                | UploadSessionStatus::Revoked
                | UploadSessionStatus::Expired
        )
    }

    fn current_time_ms() -> u64 {
        env::block_timestamp_ms()
    }

    fn view_upload_session(&self, public_key: &PublicKey) -> Option<UploadSession> {
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

    fn use_upload_session(
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

    fn refund_upload_session(&self, owner_id: &AccountId, amount: NearToken, reason: &str) {
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

    fn close_upload_session(&mut self, public_key: &PublicKey, final_status: UploadSessionStatus) {
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

    fn restore_gift_drop_claim(&mut self, signer_public_key: &PublicKey) {
        let signer_pk = String::from(signer_public_key);
        if let Some(mut gift_drop) = self.gift_drops.get(&signer_pk) {
            gift_drop.remaining_claims = 1;
            self.gift_drops.insert(&signer_pk, &gift_drop);
        }
    }

    fn restore_trial_invite_claim(&mut self, signer_public_key: &PublicKey) {
        let signer_pk = String::from(signer_public_key);
        let mut trial_invites = self.lazy_trial_invites();
        if let Some(mut trial_invite) = trial_invites.get(&signer_pk) {
            trial_invite.remaining_claims = 1;
            trial_invites.insert(&signer_pk, &trial_invite);
        }
    }

    fn is_trial_invite_expired(invite: &TrialInvite) -> bool {
        invite
            .expires_at_ms
            .map(|expires_at_ms| Self::current_time_ms() > expires_at_ms)
            .unwrap_or(false)
    }

    fn implicit_account_id_from_public_key(public_key: &PublicKey) -> AccountId {
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
    fn build_event_response(&self, cid: &str, event: &Event) -> EventResponse {
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
    pub fn web4_get(&self, request: Web4Request) -> Web4Response {
        match &self.web4_static_url {
            Some(base_url) => {
                // Strip query string from path — near.page gateway may include it
                // (e.g. MetaMask requests "/favicon.ico?favicon.0b3bf435.ico")
                let clean_path = match request.path.find('?') {
                    Some(idx) => &request.path[..idx],
                    None => &request.path,
                };

                let path = if clean_path == "/" {
                    "/index.html".to_string()
                } else if clean_path.ends_with('/') {
                    // Trailing slash → directory → serve index.html
                    format!("{}index.html", clean_path)
                } else if !Self::path_has_extension(clean_path) {
                    // No file extension → route path → serve index.html
                    format!("{}/index.html", clean_path)
                } else {
                    clean_path.to_string()
                };
                let content_type = Self::detect_content_type(&path).to_string();
                let body_url = format!("{}{}", base_url, path);
                Web4Response::BodyUrl {
                    content_type,
                    body_url,
                }
            }
            None => {
                let html = b"<!DOCTYPE html><html><head><title>YouTick</title></head><body><h1>YouTick</h1><p>Web4 static URL not configured. Owner must call web4_set_static_url.</p></body></html>";
                Web4Response::Body {
                    content_type: "text/html; charset=utf-8".to_string(),
                    body: Base64VecU8::from(html.to_vec()),
                }
            }
        }
    }

    /// Check if the last segment of a path contains a file extension (has a dot).
    fn path_has_extension(path: &str) -> bool {
        match path.rsplit('/').next() {
            Some(segment) => segment.contains('.'),
            None => false,
        }
    }

    /// Owner-only: Set the NEARFS static URL (e.g., "/ipfs/CID")
    pub fn web4_set_static_url(&mut self, url: String) {
        self.assert_owner();
        self.assert_not_paused();
        self.web4_set_static_url_timelocked(url);
    }

    fn web4_set_static_url_timelocked(&mut self, url: String) {
        self.web4_static_url = Some(url);
    }

    /// View: Get the current web4 static URL
    pub fn web4_get_static_url(&self) -> Option<String> {
        self.web4_static_url.clone()
    }

    /// Internal helper: detect content type from file extension
    fn detect_content_type(path: &str) -> &'static str {
        let path_lower = path.to_lowercase();
        if path_lower.ends_with(".html") || path_lower.ends_with(".htm") {
            "text/html; charset=utf-8"
        } else if path_lower.ends_with(".js") || path_lower.ends_with(".mjs") {
            "application/javascript"
        } else if path_lower.ends_with(".css") {
            "text/css"
        } else if path_lower.ends_with(".json") {
            "application/json"
        } else if path_lower.ends_with(".png") {
            "image/png"
        } else if path_lower.ends_with(".jpg") || path_lower.ends_with(".jpeg") {
            "image/jpeg"
        } else if path_lower.ends_with(".gif") {
            "image/gif"
        } else if path_lower.ends_with(".svg") {
            "image/svg+xml"
        } else if path_lower.ends_with(".ico") {
            "image/x-icon"
        } else if path_lower.ends_with(".woff") {
            "font/woff"
        } else if path_lower.ends_with(".woff2") {
            "font/woff2"
        } else if path_lower.ends_with(".ttf") {
            "font/ttf"
        } else if path_lower.ends_with(".xml") {
            "application/xml"
        } else if path_lower.ends_with(".txt") {
            // Next.js RSC data files use .txt extension but need text/x-component
            if path_lower.contains("__next.") || path_lower.contains("index.txt") {
                "text/x-component"
            } else {
                "text/plain"
            }
        } else if path_lower.ends_with(".wasm") {
            "application/wasm"
        } else if path_lower.ends_with(".webp") {
            "image/webp"
        } else if path_lower.ends_with(".map") {
            "application/json"
        } else {
            "application/octet-stream"
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // OWNER ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Set the next token ID (owner only) - for recovery after state issues
    pub fn set_next_token_id(&mut self, new_id: u64) {
        self.assert_owner();
        self.set_next_token_id_timelocked(new_id);
    }

    fn set_next_token_id_timelocked(&mut self, new_id: u64) {
        require!(
            new_id >= self.next_token_id,
            "New token ID must be greater than or equal to current next token ID"
        );
        self.next_token_id = new_id;
    }

    // ═══════════════════════════════════════════════════════════════
    // CONTENT MODERATION (BAN/UNBAN) ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Ban an event (owner only). Banned events are hidden from listings
    /// and blocked from purchases, but remain in storage for audit trails.
    pub fn ban_event(&mut self, encrypted_cid: String, reason: BanReason) {
        self.assert_owner();
        self.ban_event_timelocked(encrypted_cid, reason)
    }

    fn ban_event_timelocked(&mut self, encrypted_cid: String, reason: BanReason) {
        self.assert_not_paused();
        require!(self.events.get(&encrypted_cid).is_some(), "Event not found");

        let ban_info = BanInfo {
            reason: reason.clone(),
            banned_at: env::block_timestamp(),
            banned_by: env::predecessor_account_id(),
        };

        require!(
            self.lazy_banned_events().get(&encrypted_cid).is_none(),
            "Event is already banned"
        );
        self.lazy_banned_events().insert(&encrypted_cid, &ban_info);
        // Event banned — decrement active counter for O(1) get_events_count
        self.active_event_count = self.active_event_count.saturating_sub(1);
    }

    /// Unban an event (owner only). Restores event to normal listings.
    pub fn unban_event(&mut self, encrypted_cid: String) {
        self.assert_owner();
        self.unban_event_timelocked(encrypted_cid)
    }

    fn unban_event_timelocked(&mut self, encrypted_cid: String) {
        self.assert_not_paused();

        let removed = self.lazy_banned_events().remove(&encrypted_cid);
        require!(removed.is_some(), "Event is not banned");
        // Event unbanned — increment active counter for O(1) get_events_count
        self.active_event_count = self.active_event_count.saturating_add(1);
    }

    /// View: Check if an event is banned (public)
    pub fn is_event_banned(&self, encrypted_cid: String) -> bool {
        self.lazy_banned_events().get(&encrypted_cid).is_some()
    }

    /// Emergency takedown (owner only, NO timelock).
    ///
    /// Intended for illegal content (CSAM, non-consensual sexual content,
    /// imminent-harm material) where the 24h timelock used by `ban_event`
    /// is unacceptable. Writes to the same banned-events storage as
    /// `ban_event`; the difference is the audit trail: every takedown
    /// emits a NEP-297 `event_takedown` log so abuse is detectable on-chain.
    ///
    /// Works while the contract is paused — emergency response must not
    /// depend on contract liveness.
    ///
    /// Per ADR-009, this owner authority is transitional and is scheduled
    /// to be transferred to a multisig/DAO by end of Q4 2026.
    pub fn takedown_event(&mut self, encrypted_cid: String, reason: BanReason) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can takedown events"
        );
        require!(self.events.get(&encrypted_cid).is_some(), "Event not found");
        require!(
            self.lazy_banned_events().get(&encrypted_cid).is_none(),
            "Event is already banned or taken down"
        );

        let now = env::block_timestamp();
        let by = env::predecessor_account_id();
        let ban_info = BanInfo {
            reason: reason.clone(),
            banned_at: now,
            banned_by: by.clone(),
        };
        self.lazy_banned_events().insert(&encrypted_cid, &ban_info);
        self.active_event_count = self.active_event_count.saturating_sub(1);

        let reason_str = match reason {
            BanReason::SexualContent => "sexual_content",
            BanReason::CopyrightViolation => "copyright_violation",
            BanReason::Other => "other",
        };
        crate::events::emit_event_takedown(encrypted_cid, reason_str.to_string(), by, now);
    }

    /// View: Get all banned events (owner only, iterates events checking ban map)
    pub fn get_banned_events(&self) -> Vec<(String, BanInfo)> {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can list banned events"
        );

        self.events
            .iter()
            .filter_map(|(cid, _)| self.lazy_banned_events().get(&cid).map(|info| (cid, info)))
            .collect()
    }

    /// Admin: Remove events and all associated data by encrypted_cid list.
    /// Pause all state-changing operations (owner only). Emergency stop.
    pub fn pause(&mut self) {
        self.assert_owner();
        self.pause_timelocked()
    }

    fn pause_timelocked(&mut self) {
        self.lazy_paused_state().set(&true);
        env::log_str("Contract paused");
    }

    /// Unpause the contract (owner only).
    pub fn unpause(&mut self) {
        self.assert_owner();
        self.unpause_timelocked()
    }

    fn unpause_timelocked(&mut self) {
        self.lazy_paused_state().set(&false);
        env::log_str("Contract unpaused");
    }

    /// Start two-step ownership transfer. The proposed owner must accept it.
    pub fn propose_owner(&mut self, proposed_owner_id: AccountId) {
        self.assert_owner();
        self.propose_owner_timelocked(proposed_owner_id)
    }

    fn propose_owner_timelocked(&mut self, proposed_owner_id: AccountId) {
        require!(
            proposed_owner_id != self.tokens.owner_id,
            "Proposed owner must be different"
        );
        Self::set_pending_owner_id(Some(&proposed_owner_id));
        env::log_str(&format!(
            "Ownership transfer proposed to {}",
            proposed_owner_id.as_str()
        ));
    }

    /// Accept a pending ownership transfer.
    pub fn accept_ownership(&mut self) {
        let pending_owner =
            Self::pending_owner_id_internal().expect("No pending ownership transfer");
        require!(
            env::predecessor_account_id() == pending_owner,
            "Only proposed owner can accept ownership"
        );
        self.tokens.owner_id = pending_owner.clone();
        Self::set_pending_owner_id(None);
        env::log_str(&format!(
            "Ownership transferred to {}",
            pending_owner.as_str()
        ));
    }

    pub fn get_owner(&self) -> AccountId {
        self.tokens.owner_id.clone()
    }

    pub fn get_pending_owner(&self) -> Option<AccountId> {
        Self::pending_owner_id_internal()
    }

    /// Propose a timelocked action (owner only).
    /// Returns the proposal ID.
    pub fn propose_action(&mut self, action: TimelockAction) -> u64 {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can propose actions"
        );
        let id = self.next_timelock_id();
        let proposal = TimelockProposal {
            action,
            proposer: env::predecessor_account_id(),
            proposed_at: env::block_timestamp(),
        };
        self.lazy_timelocks().insert(&id, &proposal);
        env::log_str(&format!("Timelock proposal {} created", id));
        id
    }

    /// Execute a timelocked action after delay has passed (owner only).
    pub fn execute_action(&mut self, id: u64) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can execute actions"
        );
        let proposal = self.lazy_timelocks().get(&id).expect("Proposal not found");
        let elapsed = env::block_timestamp().saturating_sub(proposal.proposed_at);
        require!(
            elapsed >= TIMELOCK_DELAY_NS,
            "Timelock delay not yet passed"
        );
        self.lazy_timelocks().remove(&id);
        match proposal.action {
            TimelockAction::WithdrawTrialPool { amount } => {
                let _ = self.withdraw_trial_pool_timelocked(amount);
            }
            TimelockAction::WithdrawCommission { amount } => {
                let _ = self.withdraw_commission_timelocked(amount);
            }
            TimelockAction::WithdrawTrialPoolUsdc { amount } => {
                let _ = self.withdraw_trial_pool_usdc_timelocked(amount);
            }
            TimelockAction::WithdrawCommissionUsdc { amount } => {
                let _ = self.withdraw_commission_usdc_timelocked(amount);
            }
            TimelockAction::AdminRemoveEvents { encrypted_cids } => {
                self.admin_remove_events_timelocked(encrypted_cids);
            }
            TimelockAction::BanEvent {
                encrypted_cid,
                reason,
            } => {
                self.ban_event_timelocked(encrypted_cid, reason);
            }
            TimelockAction::UnbanEvent { encrypted_cid } => {
                self.unban_event_timelocked(encrypted_cid);
            }
            TimelockAction::SetNextTokenId { new_id } => {
                self.set_next_token_id_timelocked(new_id);
            }
            TimelockAction::AddOnboardingKey { public_key } => {
                let pk: PublicKey = public_key.parse().expect("Invalid public key");
                let _ = self.add_onboarding_key_timelocked(pk);
            }
            TimelockAction::RemoveOnboardingKey { public_key } => {
                let pk: PublicKey = public_key.parse().expect("Invalid public key");
                let _ = self.remove_onboarding_key_timelocked(pk);
            }
            TimelockAction::SetOnboardingConfig {
                daily_limit,
                enabled,
            } => {
                self.set_onboarding_config_timelocked(daily_limit, enabled);
            }
            TimelockAction::SetWeb4StaticUrl { url } => {
                self.web4_set_static_url_timelocked(url);
            }
            TimelockAction::Pause => {
                self.pause_timelocked();
            }
            TimelockAction::Unpause => {
                self.unpause_timelocked();
            }
            TimelockAction::ProposeOwner { proposed_owner_id } => {
                self.propose_owner_timelocked(proposed_owner_id);
            }
            TimelockAction::RebuildCidToTokens => {
                self.rebuild_cid_to_tokens_timelocked();
            }
            TimelockAction::CreateTrialInviteDrop {
                public_keys,
                ttl_ms,
            } => {
                let pks: Vec<PublicKey> = public_keys
                    .into_iter()
                    .map(|pk| pk.parse().expect("Invalid public key"))
                    .collect();
                self.create_trial_invite_drop_timelocked(pks, ttl_ms);
            }
            TimelockAction::NftMint {
                receiver_id,
                token_metadata,
                video_metadata,
            } => {
                self.nft_mint_timelocked(receiver_id, token_metadata, video_metadata);
            }
        }
        env::log_str(&format!("Timelock proposal {} executed", id));
    }

    /// Cancel a pending timelock proposal (owner or original proposer).
    pub fn cancel_action(&mut self, id: u64) {
        let proposal = self.lazy_timelocks().get(&id).expect("Proposal not found");
        let caller = env::predecessor_account_id();
        require!(
            caller == self.tokens.owner_id || caller == proposal.proposer,
            "Only owner or proposer can cancel"
        );
        self.lazy_timelocks().remove(&id);
        env::log_str(&format!("Timelock proposal {} cancelled", id));
    }

    /// View a timelock proposal.
    pub fn get_timelock(&self, id: u64) -> Option<TimelockProposal> {
        self.lazy_timelocks().get(&id)
    }

    /// Repair corrupted NFT owner_by_id TreeMap state.
    /// Rebuilds the internal AVL tree from existing val LookupMap entries.
    /// Call this after deploying a fix for near-sdk Vector len desync issues.
    pub fn repair_nft_state(&mut self, max_scan: Option<u64>) {
        self.assert_owner();
        Self::assert_migration_build();

        let next_id = max_scan
            .unwrap_or(self.next_token_id)
            .max(self.next_token_id);
        let actual_max = std::cmp::max(next_id, 1000);
        let mut recovered = 0u64;

        for id in 0..actual_max {
            let token_id = id.to_string();
            if let Some(owner) = self.tokens.owner_by_id.get(&token_id) {
                let owner_clone = owner.clone();
                // Re-insert rebuilds the tree structure while preserving val entries
                self.tokens.owner_by_id.insert(&token_id, &owner_clone);
                recovered += 1;

                // Update next_token_id to be at least id+1
                if id + 1 > self.next_token_id {
                    self.next_token_id = id + 1;
                }
            }
        }

        let supply_after = self.tokens.total_supply;

        env::log_str(&format!(
            "NFT repair complete: recovered {} tokens, total_supply now {}, next_token_id now {}",
            recovered, supply_after, self.next_token_id,
        ));
    }

    /// Wipe ALL contract state and reinitialize with a clean owner.
    /// DESTRUCTIVE: removes all tokens, events, deposits, upload sessions, etc.
    /// Kept only to block older runbooks from accidentally using this path.
    pub fn wipe_and_reinit(&mut self) {
        self.assert_owner();
        Self::assert_migration_build();
        env::panic_str("Use reset_for_v1_launch from a migration build")
    }

    /// Test: insert a single token entry directly into owner_by_id.
    pub fn test_insert(&mut self, token_id: String, owner_id: AccountId) {
        self.assert_owner();
        Self::assert_migration_build();
        self.tokens.owner_by_id.insert(&token_id, &owner_id);
        env::log_str(&format!(
            "Inserted {} → {}, supply now {}",
            token_id, owner_id, self.tokens.total_supply
        ));
    }

    pub fn admin_remove_events(&mut self, encrypted_cids: Vec<String>) {
        self.assert_owner();
        self.admin_remove_events_timelocked(encrypted_cids)
    }

    fn admin_remove_events_timelocked(&mut self, encrypted_cids: Vec<String>) {
        self.assert_not_paused();

        for cid in &encrypted_cids {
            // AE-1 fix: Decrement active_event_count if the event is not already banned
            let is_banned = self.lazy_banned_events().get(cid).is_some();
            self.events.remove(cid);
            self.lazy_banned_events().remove(cid);
            self.lazy_event_price_usd().remove(cid);
            self.lazy_event_access_modes().remove(&cid.to_string());

            // Find and remove associated video_metadata entries via reverse index
            let token_ids_to_remove: Vec<TokenId> =
                self.lazy_cid_to_tokens().get(cid).unwrap_or_default();

            for token_id in &token_ids_to_remove {
                self.video_metadata.remove(token_id);
            }
            self.remove_cid_index(cid);

            // AE-1 fix: Only decrement if the event was active (not banned)
            if !is_banned {
                self.active_event_count = self.active_event_count.saturating_sub(1);
            }

            env::log_str(&format!(
                "Removed event {} and {} video entries",
                cid,
                token_ids_to_remove.len()
            ));
        }
    }

    /// Admin: Rebuild the CID → token_ids reverse index from video_metadata.
    /// Call once after deploying the reverse-index change to backfill existing tokens.
    pub fn rebuild_cid_to_tokens(&mut self) {
        self.assert_owner();
        self.rebuild_cid_to_tokens_timelocked()
    }

    fn rebuild_cid_to_tokens_timelocked(&mut self) {
        let mut count = 0u64;
        for (token_id, meta) in self.video_metadata.iter() {
            let mut ids = self
                .lazy_cid_to_tokens()
                .get(&meta.encrypted_cid)
                .unwrap_or_default();
            if !ids.contains(&token_id) {
                ids.push(token_id.clone());
                count += 1;
            }
            self.lazy_cid_to_tokens().insert(&meta.encrypted_cid, &ids);
        }
        env::log_str(&format!(
            "Rebuilt cid_to_tokens index for {} token entries",
            count
        ));
    }

    // ═══════════════════════════════════════════════════════════════
    // RELAYER-LESS ONBOARDING ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Add an onboarding key (owner only)
    /// This key will be added as a Function Call Access Key to the contract
    /// Authorized to call: create_sponsored_trial_direct
    pub fn add_onboarding_key(&mut self, public_key: PublicKey) -> Promise {
        self.assert_owner();
        self.assert_not_paused();
        self.add_onboarding_key_timelocked(public_key)
    }

    fn add_onboarding_key_timelocked(&mut self, public_key: PublicKey) -> Promise {
        // Store in set
        self.onboarding_keys.insert(&public_key);

        // Add Function Call Access Key to contract
        // Allowance: 10 NEAR for gas (~5000 trial creations at 0.002 NEAR each before rotation needed)
        // Restricted to: direct onboarding functions only (no relayer dependency)
        Promise::new(env::current_account_id()).add_access_key_allowance(
            public_key,
            near_sdk::Allowance::Limited(
                NonZeroU128::new(NearToken::from_near(10).as_yoctonear()).unwrap(),
            ),
            env::current_account_id(),
            "create_sponsored_trial_direct,claim_free_ticket_direct,sponsor_implicit_guest_direct"
                .to_string(),
        )
    }

    /// Remove an onboarding key (owner only)
    pub fn remove_onboarding_key(&mut self, public_key: PublicKey) -> Promise {
        self.assert_owner();
        self.assert_not_paused();
        self.remove_onboarding_key_timelocked(public_key)
    }

    fn remove_onboarding_key_timelocked(&mut self, public_key: PublicKey) -> Promise {
        self.onboarding_keys.remove(&public_key);

        // Delete the access key
        Promise::new(env::current_account_id()).delete_key(public_key)
    }

    /// Update onboarding configuration (owner only)
    pub fn set_onboarding_config(&mut self, daily_limit: u32, enabled: bool) {
        self.assert_owner();
        self.set_onboarding_config_timelocked(daily_limit, enabled)
    }

    fn set_onboarding_config_timelocked(&mut self, daily_limit: u32, enabled: bool) {
        self.onboarding_config = OnboardingConfig {
            daily_limit,
            enabled,
        };
    }

    #[payable]
    pub fn create_trial_invite_drop(&mut self, public_keys: Vec<PublicKey>, ttl_ms: Option<u64>) {
        self.assert_owner();
        self.create_trial_invite_drop_timelocked(public_keys, ttl_ms)
    }

    fn create_trial_invite_drop_timelocked(
        &mut self,
        public_keys: Vec<PublicKey>,
        ttl_ms: Option<u64>,
    ) {
        let num_keys = public_keys.len() as u32;
        require!(
            num_keys > 0 && num_keys <= 50,
            "Must create 1-50 trial invites"
        );

        let invite_storage_cost = STORAGE_COST_INVITE;
        let total_required = invite_storage_cost.saturating_mul(num_keys as u128);
        require!(
            env::attached_deposit() >= total_required,
            &format!(
                "Requires {} NEAR for {} trial invites",
                total_required, num_keys
            )
        );

        if let Some(ttl_ms) = ttl_ms {
            require!(ttl_ms > 0, "Trial invite TTL must be greater than zero");
            require!(
                ttl_ms <= 7 * 24 * 60 * 60 * 1000,
                "Trial invite TTL cannot exceed 7 days"
            );
        }

        let created_at_ms = Self::current_time_ms();
        let expires_at_ms = ttl_ms.map(|ttl_ms| created_at_ms.saturating_add(ttl_ms));

        for public_key in public_keys {
            let trial_invite = TrialInvite {
                sponsor_id: env::predecessor_account_id(),
                remaining_claims: 1,
                created_at_ms,
                expires_at_ms,
            };

            Promise::new(env::current_account_id())
                .add_access_key_allowance(
                    public_key.clone(),
                    near_sdk::Allowance::Limited(
                        NonZeroU128::new(GAS_FEE_ALLOWANCE.as_yoctonear()).unwrap(),
                    ),
                    env::current_account_id(),
                    "claim_trial_invite_with_implicit_account".to_string(),
                )
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(near_sdk::Gas::from_tgas(20))
                        .on_trial_invite_access_key_added(
                            public_key,
                            trial_invite,
                            U128(invite_storage_cost.as_yoctonear()),
                        ),
                )
                .as_return();
        }
    }

    #[private]
    pub fn on_trial_invite_access_key_added(
        &mut self,
        public_key: PublicKey,
        trial_invite: TrialInvite,
        refund_amount: U128,
    ) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if succeeded {
            let pk_str = String::from(&public_key);
            self.lazy_trial_invites().insert(&pk_str, &trial_invite);
            return true;
        }

        Promise::new(trial_invite.sponsor_id.clone())
            .transfer(NearToken::from_yoctonear(refund_amount.0))
            .as_return();
        env::log_str("Trial invite access key creation failed; refunded reserved deposit.");
        false
    }

    /// View: Check if a key is authorized for onboarding
    pub fn is_onboarding_key(&self, public_key: PublicKey) -> bool {
        self.onboarding_keys.contains(&public_key)
    }

    /// View: Get onboarding configuration
    pub fn get_onboarding_config(&self) -> OnboardingConfig {
        self.onboarding_config.clone()
    }

    pub fn is_trial_invite_valid(&self, public_key: String) -> bool {
        match self.lazy_trial_invites().get(&public_key) {
            Some(invite) => invite.remaining_claims > 0 && !Self::is_trial_invite_expired(&invite),
            None => false,
        }
    }

    pub fn get_trial_invite_info(&self, public_key: String) -> Option<TrialInvite> {
        self.lazy_trial_invites().get(&public_key)
    }

    /// View: Get today's trial count
    pub fn get_daily_trial_count(&self) -> u32 {
        let today = Self::get_day_timestamp();
        self.daily_trial_counts.get(&today).unwrap_or(0)
    }

    /// Internal: Get day timestamp (seconds since epoch, rounded to day)
    fn get_day_timestamp() -> u64 {
        let now_ns = env::block_timestamp();
        let now_s = now_ns / 1_000_000_000; // nanoseconds to seconds
        now_s / 86400 * 86400 // Round to day start
    }

    /// Internal: Check limit and return the day bucket that was incremented.
    fn increment_daily_limit_if_allowed(&mut self) -> Option<u64> {
        let today = Self::get_day_timestamp();
        let current_count = self.daily_trial_counts.get(&today).unwrap_or(0);

        // Check limit (0 = unlimited)
        if self.onboarding_config.daily_limit > 0
            && current_count >= self.onboarding_config.daily_limit
        {
            return None;
        }

        // Increment count
        self.daily_trial_counts.insert(&today, &(current_count + 1));
        Some(today)
    }

    /// Internal: Roll back a previously incremented daily limit bucket.
    fn rollback_daily_limit(&mut self, day_timestamp: u64) {
        let current_count = self.daily_trial_counts.get(&day_timestamp).unwrap_or(0);
        if current_count == 0 {
            return;
        }

        if current_count == 1 {
            self.daily_trial_counts.remove(&day_timestamp);
            return;
        }

        self.daily_trial_counts
            .insert(&day_timestamp, &(current_count - 1));
    }

    // ═══════════════════════════════════════════════════════════════
    // PURCHASE LOG HELPERS
    // ═══════════════════════════════════════════════════════════════

    /// Internal: Record a purchase in the audit log
    fn log_purchase(
        &mut self,
        buyer_id: AccountId,
        creator_id: AccountId,
        event_cid: String,
        token_id: String,
        price: u128,
        creator_amount: u128,
        commission_amount: u128,
        purchase_type: PurchaseType,
    ) {
        let log = PurchaseLog {
            buyer_id,
            creator_id,
            event_cid,
            token_id: token_id.clone(),
            price: U128(price),
            creator_amount: U128(creator_amount),
            commission_amount: U128(commission_amount),
            purchase_type,
            timestamp_ns: env::block_timestamp(),
        };

        let purchase_id = self.next_purchase_id;
        self.purchase_logs.insert(&purchase_id, &log);
        self.next_purchase_id += 1;

        env::log_str(&format!(
            "PurchaseLog #{}: token={}, price={}, creator_share={}, commission={}",
            purchase_id, token_id, price, creator_amount, commission_amount
        ));
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENT FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    #[payable]
    pub fn create_event(
        &mut self,
        encrypted_cid: String,
        title: String,
        description: String,
        price: U128,
        price_usd: Option<u128>,
        price_usdc: Option<U128>,
        access_mode: Option<String>,
        content_type: Option<String>,
    ) {
        self.assert_not_paused();
        let price_usdc = price_usdc.filter(|value| value.0 > 0);

        // Minimum price check (free events allowed, but paid events must be >= 0.001 NEAR)
        if price.0 > 0 {
            require!(
                price.0 >= MIN_TICKET_PRICE_YOCTO,
                "Price must be at least 0.001 NEAR"
            );
        }

        // Minimum USDC price check
        if let Some(usdc) = price_usdc {
            if usdc.0 > 0 {
                require!(
                    usdc.0 >= MIN_TICKET_PRICE_USDC,
                    "USDC price must be at least $0.50"
                );
            }
        }

        let deposit = env::attached_deposit();
        require!(
            deposit >= STORAGE_COST_ACCOUNT,
            "Requires at least 0.1 NEAR deposit to create an event"
        );

        // SECURITY: Prevent overwriting existing events
        require!(
            self.events.get(&encrypted_cid).is_none(),
            "Event with this CID already exists"
        );

        // SECURITY: Only owner can create ACCESS_PASS events (universal access)
        require!(
            encrypted_cid != "ACCESS_PASS" || env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can create ACCESS_PASS events"
        );

        let price_near = if price.0 > 0 { Some(price) } else { None };
        let has_paid_price = price_near.is_some() || price_usdc.is_some();
        let normalized_access_mode = self.normalize_access_mode(access_mode, has_paid_price);

        let parsed_content_type = match content_type.as_deref() {
            Some("Concert") => ContentType::Concert,
            Some("Cinema") => ContentType::Cinema,
            Some("Exclusive") => ContentType::Exclusive,
            Some("LiveEvent") => ContentType::LiveEvent,
            Some("Documentary") => ContentType::Documentary,
            Some("ShortFilm") => ContentType::ShortFilm,
            Some("FestivalSelection") => ContentType::FestivalSelection,
            _ => ContentType::Exclusive,
        };

        let event = Event {
            title,
            description,
            price,
            price_usdc,
            price_near,
            creator_id: env::predecessor_account_id(),
            created_at: env::block_timestamp(),
            content_type: parsed_content_type,
        };

        self.events.insert(&encrypted_cid, &event);
        self.store_event_access_mode(&encrypted_cid, normalized_access_mode);

        // Increment active event counter for O(1) get_events_count
        self.active_event_count = self.active_event_count.saturating_add(1);

        // Store USD price in separate map (backward-compatible)
        if let Some(usd) = price_usd {
            self.lazy_event_price_usd().insert(&encrypted_cid, &usd);
        }

        // Store USDC price in separate map (V12)
        if let Some(usdc) = price_usdc {
            self.events_price_usdc.insert(&encrypted_cid, &usdc);
        }

        events::emit_event_created(
            encrypted_cid.clone(),
            event.title.clone(),
            event.creator_id.clone(),
            event.price.0.to_string(),
            price_usdc.map(|p| p.0.to_string()),
            price_near.map(|p| p.0.to_string()),
            None, // max_tickets: not yet implemented in Event struct
        );
    }

    pub fn get_events(
        &self,
        from_index: Option<U128>,
        limit: Option<u64>,
        content_type: Option<String>,
    ) -> Vec<(String, EventResponse)> {
        let banned = self.lazy_banned_events();
        let type_filter = content_type.as_ref().and_then(|ct| parse_content_type(ct));
        self.events
            .iter()
            .filter(|(cid, event)| {
                if banned.get(cid).is_some() {
                    return false;
                }
                if let Some(filter) = type_filter {
                    if event.content_type != filter {
                        return false;
                    }
                }
                true
            })
            .skip(from_index.map(|v| v.0 as usize).unwrap_or(0))
            .take(limit.unwrap_or(50) as usize)
            .map(|(cid, event)| {
                let resp = self.build_event_response(&cid, &event);
                (cid.clone(), resp)
            })
            .collect()
    }

    /// Cursor-based paginated event listing.
    /// - `cursor`: CID to start after (None = start from beginning)
    /// - `limit`: max items to return (default 50, capped at 100)
    pub fn get_events_paginated(
        &self,
        cursor: Option<String>,
        limit: Option<u64>,
        content_type: Option<String>,
    ) -> PaginatedEventsResponse {
        let limit = limit.unwrap_or(50).min(100) as usize;
        let banned = self.lazy_banned_events();
        let type_filter = content_type.as_ref().and_then(|ct| parse_content_type(ct));
        let total_count = match type_filter {
            Some(filter) => self
                .events
                .iter()
                .filter(|(cid, event)| banned.get(cid).is_none() && event.content_type == filter)
                .count() as u64,
            None => self.active_event_count,
        };

        // Build an iterator that skips past the cursor if provided
        let mut iter = self.events.iter();
        if let Some(ref cursor_cid) = cursor {
            // Advance iterator until we find the cursor CID, then skip it
            let mut found = false;
            for (cid, _) in iter.by_ref() {
                if cid == *cursor_cid {
                    found = true;
                    break;
                }
            }
            if !found {
                // Cursor not found — return empty result
                return PaginatedEventsResponse {
                    events: Vec::new(),
                    next_cursor: None,
                    total_count,
                };
            }
        }

        // Collect limit + 1 non-banned items so we can determine if there's a next page
        let items: Vec<(String, Event)> = iter
            .filter(|(cid, event)| {
                if banned.get(cid).is_some() {
                    return false;
                }
                match type_filter {
                    Some(filter) => event.content_type == filter,
                    None => true,
                }
            })
            .take(limit + 1)
            .collect();
        let has_more = items.len() > limit;
        let page_items = if has_more {
            &items[..limit]
        } else {
            &items[..]
        };

        let events: Vec<(String, EventResponse)> = page_items
            .iter()
            .map(|(cid, event)| {
                let resp = self.build_event_response(cid, event);
                (cid.clone(), resp)
            })
            .collect();

        let next_cursor = if has_more {
            events.last().map(|(cid, _)| cid.clone())
        } else {
            None
        };

        PaginatedEventsResponse {
            events,
            next_cursor,
            total_count,
        }
    }

    /// Returns the total number of non-banned events in O(1).
    pub fn get_events_count(&self) -> u64 {
        self.active_event_count
    }

    pub fn get_event(&self, encrypted_cid: String) -> Option<EventResponse> {
        self.events
            .get(&encrypted_cid)
            .map(|event| self.build_event_response(&encrypted_cid, &event))
    }

    /// Create an event using prepaid funds (Callable via Session Key)
    pub fn create_event_prepaid(
        &mut self,
        encrypted_cid: String,
        title: String,
        description: String,
        price: U128,
        price_usd: Option<u128>,
        price_usdc: Option<U128>,
        access_mode: Option<String>,
        content_type: Option<String>,
    ) {
        self.assert_not_paused();
        let price_usdc = price_usdc.filter(|value| value.0 > 0);

        // Minimum price check (free events allowed, but paid events must be >= 0.001 NEAR)
        if price.0 > 0 {
            require!(
                price.0 >= MIN_TICKET_PRICE_YOCTO,
                "Price must be at least 0.001 NEAR"
            );
        }

        // Minimum USDC price check
        if let Some(usdc) = price_usdc {
            if usdc.0 > 0 {
                require!(
                    usdc.0 >= MIN_TICKET_PRICE_USDC,
                    "USDC price must be at least $0.50"
                );
            }
        }

        // SECURITY: Prevent overwriting existing events
        require!(
            self.events.get(&encrypted_cid).is_none(),
            "Event with this CID already exists"
        );

        // SECURITY: Only owner can create ACCESS_PASS events (universal access)
        require!(
            encrypted_cid != "ACCESS_PASS" || env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can create ACCESS_PASS events"
        );

        let price_near = if price.0 > 0 { Some(price) } else { None };
        let has_paid_price = price_near.is_some() || price_usdc.is_some();
        let normalized_access_mode = self.normalize_access_mode(access_mode, has_paid_price);

        let account_id = env::predecessor_account_id();
        let session_public_key = self.use_upload_session(
            UploadSessionStatus::AwaitingEvent,
            UploadSessionStatus::Completed,
            STORAGE_COST_ACCOUNT,
        );

        let parsed_content_type = match content_type.as_deref() {
            Some("Concert") => ContentType::Concert,
            Some("Cinema") => ContentType::Cinema,
            Some("Exclusive") => ContentType::Exclusive,
            Some("LiveEvent") => ContentType::LiveEvent,
            Some("Documentary") => ContentType::Documentary,
            Some("ShortFilm") => ContentType::ShortFilm,
            Some("FestivalSelection") => ContentType::FestivalSelection,
            _ => ContentType::Exclusive,
        };

        // Execute creation
        let event = Event {
            title,
            description,
            price,
            price_usdc,
            price_near,
            creator_id: account_id,
            created_at: env::block_timestamp(),
            content_type: parsed_content_type,
        };

        self.events.insert(&encrypted_cid, &event);
        self.store_event_access_mode(&encrypted_cid, normalized_access_mode);

        // Increment active event counter for O(1) get_events_count
        self.active_event_count = self.active_event_count.saturating_add(1);

        // Store USD price in separate map (backward-compatible)
        if let Some(usd) = price_usd {
            self.lazy_event_price_usd().insert(&encrypted_cid, &usd);
        }

        // Store USDC price in separate map (V12)
        if let Some(usdc) = price_usdc {
            self.events_price_usdc.insert(&encrypted_cid, &usdc);
        }

        self.close_upload_session(&session_public_key, UploadSessionStatus::Completed);
    }

    #[payable]
    pub fn create_upload_session(
        &mut self,
        public_key: PublicKey,
        budget_yocto: U128,
        ttl_ms: u64,
    ) {
        self.assert_not_paused();
        let attached_deposit = env::attached_deposit();
        let minimum_budget = Self::minimum_upload_session_budget();

        require!(
            attached_deposit.as_yoctonear() == budget_yocto.0,
            "Attached deposit must exactly match session budget"
        );
        require!(
            attached_deposit >= minimum_budget,
            "Upload session budget must cover mint and event creation"
        );
        require!(ttl_ms > 0, "Upload session TTL must be greater than zero");
        require!(
            ttl_ms <= UPLOAD_SESSION_MAX_TTL_MS,
            "Upload session TTL exceeds the maximum allowed window"
        );
        require!(
            self.lazy_upload_sessions().get(&public_key).is_none(),
            "Upload session already exists for this public key"
        );

        let session = UploadSession {
            owner_id: env::predecessor_account_id(),
            remaining_budget: budget_yocto,
            remaining_calls: UPLOAD_SESSION_TOTAL_CALLS,
            expires_at_ms: Self::current_time_ms().saturating_add(ttl_ms),
            status: UploadSessionStatus::AwaitingMint,
        };

        self.lazy_upload_sessions().insert(&public_key, &session);
    }

    pub fn revoke_upload_session(&mut self, public_key: PublicKey) {
        self.assert_not_paused();
        let session = self
            .lazy_upload_sessions()
            .get(&public_key)
            .expect("Upload session not found");

        require!(
            session.owner_id == env::predecessor_account_id(),
            "Only the upload session owner can revoke it"
        );

        self.close_upload_session(&public_key, UploadSessionStatus::Revoked);
    }

    pub fn get_upload_session(&self, public_key: PublicKey) -> Option<UploadSession> {
        self.view_upload_session(&public_key)
    }

    /// Purchase a ticket (mint NFT) for an event
    /// - Free tickets (price=0): Contract pays storage, user pays nothing
    /// - Paid tickets: 2% commission to contract, 98% to creator
    ///
    /// IMPORTANT: This function keeps deposits in contract balance and only
    /// explicitly transfers to creator. No automatic refund to buyer.
    #[payable]
    pub fn buy_ticket(&mut self, receiver_id: AccountId, encrypted_cid: String) -> Token {
        self.assert_not_paused();
        let maybe_event = self.events.get(&encrypted_cid);
        require!(maybe_event.is_some(), "Event not found");
        let event = maybe_event.unwrap();
        self.assert_event_not_banned(&encrypted_cid);
        self.assert_near_purchase_available(&encrypted_cid, &event);

        let deposit = env::attached_deposit();
        let required_price = NearToken::from_yoctonear(Self::event_near_price(&event).0);
        let is_free = required_price.as_yoctonear() == 0;

        // Storage cost for NFT (safe upper bound)
        let storage_cost = STORAGE_COST_NFT;

        // Track amounts for purchase log
        let mut creator_amount: u128 = 0;
        let mut commission: u128 = 0;

        if !is_free {
            let min_deposit = required_price.saturating_add(storage_cost);
            require!(
                deposit >= min_deposit,
                &format!(
                    "Insufficient deposit. Required: {} yoctoNEAR (price) + {} (storage)",
                    required_price.as_yoctonear(),
                    storage_cost.as_yoctonear()
                )
            );

            // Calculate and apply commission (2% platform, 98% creator)
            let (ca, cm) = self.apply_commission(required_price);
            creator_amount = ca;
            commission = cm;

            // Transfer 98% to creator
            // Note: The rest (storage + any excess) stays in contract
            if creator_amount > 0 {
                Promise::new(event.creator_id.clone())
                    .transfer(NearToken::from_yoctonear(creator_amount))
                    .as_return();
            }

            // Refund excess deposit to buyer
            let total_used = required_price.saturating_add(storage_cost);
            if deposit > total_used {
                let refund = deposit.saturating_sub(total_used);
                Promise::new(env::predecessor_account_id())
                    .transfer(refund)
                    .as_return();
            }
        } else {
            // Free ticket - just require minimal storage (or contract pays)
            require!(deposit >= storage_cost, "Insufficient deposit for storage");
        }

        // Mint the NFT using helper
        let token =
            self.internal_mint_ticket(receiver_id.clone(), &event, encrypted_cid.clone(), false);

        // Log purchase for audit trail
        let purchase_type = if is_free {
            PurchaseType::Free
        } else {
            PurchaseType::Direct
        };
        self.log_purchase(
            env::predecessor_account_id(),
            event.creator_id.clone(),
            encrypted_cid.clone(),
            token.token_id.clone(),
            required_price.as_yoctonear(),
            creator_amount,
            commission,
            purchase_type,
        );

        events::emit_nft_purchased(
            token.token_id.clone(),
            receiver_id.clone(),
            Some(encrypted_cid.clone()),
            if is_free {
                None
            } else {
                Some(required_price.as_yoctonear().to_string())
            },
            self.event_usdc_price(&encrypted_cid, &event)
                .map(|p| p.0.to_string()),
        );

        token
    }

    /// Internal buy ticket function - called via cross-contract call with deposit
    #[payable]
    #[private]
    pub fn buy_ticket_internal(&mut self, receiver_id: AccountId, encrypted_cid: String) -> Token {
        let maybe_event = self.events.get(&encrypted_cid);
        require!(maybe_event.is_some(), "Event not found");
        let event = maybe_event.unwrap();
        self.assert_event_not_banned(&encrypted_cid);
        self.assert_near_purchase_available(&encrypted_cid, &event);

        let price_yoctonear = Self::event_near_price(&event).0;

        // Mint the NFT using helper (storage paid by attached deposit from contract)
        let token =
            self.internal_mint_ticket(receiver_id.clone(), &event, encrypted_cid.clone(), false);

        events::emit_nft_purchased(
            token.token_id.clone(),
            receiver_id.clone(),
            Some(encrypted_cid.clone()),
            Some(price_yoctonear.to_string()),
            self.event_usdc_price(&encrypted_cid, &event)
                .map(|p| p.0.to_string()),
        );

        token
    }

    // ═══════════════════════════════════════════════════════════════
    // COMMISSION HELPER
    // ═══════════════════════════════════════════════════════════════

    /// Calculate commission split: 2% total (50% trial pool, 50% commission pool)
    /// Returns (creator_amount, commission_total)
    fn apply_commission(&mut self, price: NearToken) -> (u128, u128) {
        let price_yocto = price.as_yoctonear();
        let commission = price_yocto * COMMISSION_RATE_PERCENT / COMMISSION_DENOMINATOR;
        let creator_amount = price_yocto - commission;

        // Split commission: 50% to trial pool, 50% to commission pool
        let trial_share = commission / COMMISSION_SPLIT_DENOMINATOR;
        let commission_share = commission - trial_share;
        self.trial_pool = self
            .trial_pool
            .saturating_add(NearToken::from_yoctonear(trial_share));
        self.commission_pool = self
            .commission_pool
            .saturating_add(NearToken::from_yoctonear(commission_share));

        (creator_amount, commission)
    }

    /// Calculate commission split for USDC (6 decimals): 2% total (50% trial pool, 50% commission pool)
    /// Returns (creator_amount, commission_total)
    fn apply_commission_usdc(&mut self, price_usdc: u128) -> (u128, u128) {
        let commission = price_usdc * COMMISSION_RATE_PERCENT / COMMISSION_DENOMINATOR;
        let creator_amount = price_usdc - commission;
        (creator_amount, commission)
    }

    /// Distribute USDC commission into pools
    fn distribute_commission_usdc(&mut self, commission: u128) {
        let trial_share = commission / COMMISSION_SPLIT_DENOMINATOR;
        let commission_share = commission - trial_share;
        self.trial_pool_usdc = self.trial_pool_usdc.saturating_add(trial_share);
        self.commission_pool_usdc = self.commission_pool_usdc.saturating_add(commission_share);
    }

    // ═══════════════════════════════════════════════════════════════
    // MINTING FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Internal helper to mint a ticket NFT
    /// Consolidates duplicated minting logic across buy_ticket, claim_gift, etc.
    fn internal_mint_ticket(
        &mut self,
        receiver_id: AccountId,
        event: &Event,
        event_cid: String,
        is_gift: bool,
    ) -> Token {
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        let video_metadata = VideoMetadata {
            encrypted_cid: event_cid.clone(),
            duration_seconds: 0,
            event_date: Some(event.created_at),
            content_type: ContentType::Exclusive,
            nova_group_id: None,
            storage_type: StorageType::Kms,
        };
        self.video_metadata.insert(&token_id, &video_metadata);
        self.add_token_to_cid_index(&event_cid, &token_id);

        let description = if is_gift {
            format!("Gift ticket: {}", event.description)
        } else {
            event.description.clone()
        };

        let token_metadata = TokenMetadata {
            title: Some(event.title.clone()),
            description: Some(description),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        };

        self.tokens
            .internal_mint(token_id.clone(), receiver_id, Some(token_metadata))
    }

    /// Mint a new video NFT ticket
    /// SECURITY: Only contract owner can directly mint NFTs via timelock
    #[payable]
    pub fn nft_mint(
        &mut self,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    ) -> Token {
        self.assert_owner();
        self.nft_mint_timelocked(receiver_id, token_metadata, video_metadata)
    }

    fn nft_mint_timelocked(
        &mut self,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    ) -> Token {
        self.assert_not_paused();

        // SECURITY: Require minimum deposit
        require!(
            env::attached_deposit() >= NearToken::from_yoctonear(1),
            "Requires attached deposit of at least 1 yoctoNEAR"
        );

        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        self.video_metadata.insert(&token_id, &video_metadata);

        self.tokens
            .internal_mint(token_id.clone(), receiver_id, Some(token_metadata))
    }

    // ═══════════════════════════════════════════════════════════════
    // wNEAR DIRECT PURCHASE (Single-popup stablecoin flow)
    // ═══════════════════════════════════════════════════════════════

    /// NEP-141 ft_on_transfer — called by wrap.near when someone sends wNEAR
    /// via ft_transfer_call to this contract.
    ///
    /// This enables a single-wallet-popup purchase flow for stablecoin payments:
    /// User swaps USDC→wNEAR via 1Click, then sends wNEAR to this contract.
    /// The contract unwraps wNEAR to native NEAR and processes the ticket purchase.
    ///
    /// msg format: {"action":"buy_ticket","buyer_id":"alice.near","encrypted_cid":"Qm..."}
    ///
    /// Returns "0" (all tokens used) on success, or the full amount (refund) on failure.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.assert_not_paused();

        // Reentrancy guard
        require!(!self.ft_transfer_lock, "Reentrant call detected");
        self.ft_transfer_lock = true;

        let nonce = self.next_swap_nonce;
        self.next_swap_nonce = self.next_swap_nonce.wrapping_add(1);

        let predecessor = env::predecessor_account_id();
        let wrap_account = wrap_near_account_id();

        env::log_str(&format!(
            "ft_on_transfer nonce={} sender={} token={} amount={} msg={}",
            nonce, sender_id, predecessor, amount.0, msg
        ));

        // Route to appropriate handler based on token contract
        let result = if predecessor == wrap_account {
            self.process_wnear_transfer(sender_id, amount, msg, nonce)
        } else if predecessor == usdt_contract_id() || predecessor == usdc_contract_id() {
            self.process_stablecoin_transfer(sender_id, amount, msg, &predecessor, nonce)
        } else {
            env::panic_str("Unsupported token. Only wNEAR, USDC, and USDT are accepted.");
        };

        self.ft_transfer_lock = false;
        result
    }

    /// Handle wNEAR transfers (legacy path)
    fn process_wnear_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
        _nonce: u64,
    ) -> PromiseOrValue<U128> {
        // Parse the message
        let parsed: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| {
            env::panic_str("Invalid JSON message. Expected: {\"action\":\"buy_ticket\",\"buyer_id\":\"...\",\"encrypted_cid\":\"...\"}");
        });

        let action = parsed.get("action").and_then(|v| v.as_str()).unwrap_or("");
        require!(
            action == "buy_ticket",
            "Unknown action. Only 'buy_ticket' is supported."
        );

        let buyer_id: AccountId = parsed
            .get("buyer_id")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| env::panic_str("Missing buyer_id"))
            .parse()
            .unwrap_or_else(|_| env::panic_str("Invalid buyer_id"));

        let encrypted_cid = parsed
            .get("encrypted_cid")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| env::panic_str("Missing encrypted_cid"))
            .to_string();

        // SECURITY: sender_id must match buyer_id (prevent buying for others without consent)
        require!(sender_id == buyer_id, "sender_id must match buyer_id");

        // Verify event exists and get pricing
        let event = self
            .events
            .get(&encrypted_cid)
            .unwrap_or_else(|| env::panic_str("Event not found"));
        self.assert_event_not_banned(&encrypted_cid);
        self.assert_near_purchase_available(&encrypted_cid, &event);

        let required_price = NearToken::from_yoctonear(Self::event_near_price(&event).0);
        let storage_cost = STORAGE_COST_NFT;
        let is_free = required_price.as_yoctonear() == 0;

        if is_free {
            // Free tickets don't need wNEAR — refund everything
            return PromiseOrValue::Value(amount); // Refund all
        }

        // Check wNEAR amount covers price + storage
        let total_cost = required_price.saturating_add(storage_cost);

        let received = NearToken::from_yoctonear(amount.0);
        require!(
            received >= total_cost,
            &format!(
                "Insufficient wNEAR. Need {} yocto (price {} + storage {}), got {}",
                total_cost.as_yoctonear(),
                required_price.as_yoctonear(),
                storage_cost.as_yoctonear(),
                received.as_yoctonear()
            )
        );

        // Unwrap ALL received wNEAR to native NEAR, then process purchase in callback.
        PromiseOrValue::Promise(
            Promise::new(wrap_near_account_id())
                .function_call(
                    "near_withdraw".to_string(),
                    near_sdk::serde_json::json!({ "amount": amount.0.to_string() })
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(1),
                    near_sdk::Gas::from_tgas(10),
                )
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(near_sdk::Gas::from_tgas(100))
                        .on_wnear_unwrap_for_purchase(buyer_id, encrypted_cid, amount),
                ),
        )
    }

    /// Handle USDC/USDT transfers (new USDC-native path)
    fn process_stablecoin_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
        token_contract: &AccountId,
        nonce: u64,
    ) -> PromiseOrValue<U128> {
        let parsed: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| {
            env::panic_str("Invalid JSON message. Expected: {\"action\":\"buy_ticket\",\"buyer_id\":\"...\",\"encrypted_cid\":\"...\"}");
        });

        let action = parsed.get("action").and_then(|v| v.as_str()).unwrap_or("");
        require!(
            action == "buy_ticket",
            "Unknown action. Only 'buy_ticket' is supported."
        );

        let buyer_id: AccountId = parsed
            .get("buyer_id")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| env::panic_str("Missing buyer_id"))
            .parse()
            .unwrap_or_else(|_| env::panic_str("Invalid buyer_id"));

        let encrypted_cid = parsed
            .get("encrypted_cid")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| env::panic_str("Missing encrypted_cid"))
            .to_string();
        let payment_id = parsed
            .get("payment_id")
            .and_then(|v| v.as_str())
            .map(|value| value.to_string());

        // SECURITY: sender_id must match buyer_id
        require!(sender_id == buyer_id, "sender_id must match buyer_id");

        let event = self
            .events
            .get(&encrypted_cid)
            .unwrap_or_else(|| env::panic_str("Event not found"));
        self.assert_event_not_banned(&encrypted_cid);

        let price_usdc = self.event_usdc_price(&encrypted_cid, &event).unwrap_or(U128(0));
        let required_price = price_usdc.0;
        let is_free = required_price == 0;

        if is_free {
            return PromiseOrValue::Value(amount); // Refund all
        }

        require!(
            amount.0 >= required_price,
            &format!(
                "Insufficient {}. Need {} (price {}), got {}",
                if token_contract == &usdc_contract_id() {
                    "USDC"
                } else {
                    "USDT"
                },
                required_price,
                required_price,
                amount.0
            )
        );
        let payment_id = payment_id.unwrap_or_else(|| env::panic_str("payment_id is required"));
        let payment_key = format!("{}:{}:{}", token_contract, sender_id, payment_id);
        let mut settled_payments = self.lazy_settled_stablecoin_payments();
        require!(
            !settled_payments.contains(&payment_key),
            "Stablecoin payment already settled"
        );
        settled_payments.insert(&payment_key);

        // Apply commission on the required price (not the full amount — excess is refunded)
        let (creator_amount, commission) = self.apply_commission_usdc(required_price);

        // V1 keeps creator payouts as withdrawable balances. This avoids minting
        // an NFT based on an async creator transfer that may later fail.
        self.add_stablecoin_creator_balance(token_contract, &event.creator_id, creator_amount);
        if token_contract == &usdc_contract_id() {
            self.distribute_commission_usdc(commission);
        } else {
            self.add_stablecoin_commission_balance(token_contract, commission);
        }

        // Mint NFT
        let token =
            self.internal_mint_ticket(buyer_id.clone(), &event, encrypted_cid.clone(), false);

        events::emit_nft_purchased(
            token.token_id.clone(),
            buyer_id.clone(),
            Some(encrypted_cid.clone()),
            None, // price_yoctonear — stablecoin purchase, no NEAR price
            Some(price_usdc.0.to_string()),
        );

        // Log purchase for audit trail (parity with wNEAR path)
        self.log_purchase(
            buyer_id.clone(),
            event.creator_id.clone(),
            encrypted_cid.clone(),
            token.token_id,
            required_price,
            creator_amount,
            commission,
            PurchaseType::Direct,
        );

        // Refund excess if any
        let refund = amount.0.saturating_sub(required_price);
        if refund > 0 {
            Promise::new(token_contract.clone()).function_call(
                "ft_transfer".to_string(),
                near_sdk::serde_json::json!({
                    "receiver_id": sender_id,
                    "amount": refund.to_string()
                })
                .to_string()
                .into_bytes(),
                NearToken::from_yoctonear(1),
                near_sdk::Gas::from_tgas(10),
            );
        }

        env::log_str(&format!(
            "stablecoin_purchase_complete nonce={} buyer={} event={} token={} amount={} refund={}",
            nonce, sender_id, encrypted_cid, token_contract, amount.0, refund
        ));

        PromiseOrValue::Value(U128(0))
    }

    /// Callback after wNEAR unwrap completes.
    /// Native NEAR has arrived in the contract's balance.
    /// Now process the ticket purchase: split payments, mint NFT.
    #[private]
    pub fn on_wnear_unwrap_for_purchase(
        &mut self,
        buyer_id: AccountId,
        encrypted_cid: String,
        wnear_amount: U128,
    ) -> U128 {
        // Verify unwrap succeeded
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if !succeeded {
            // Unwrap failed — the wNEAR was NOT burned, so wrap.near will handle
            // the refund via ft_resolve_transfer (returns the full amount).
            env::panic_str("wNEAR unwrap failed — tokens will be refunded by wrap.near");
        }

        // Native NEAR is now in the contract's balance.
        // Mint first so funds do not leave the contract before entitlement exists.
        let event = self
            .events
            .get(&encrypted_cid)
            .unwrap_or_else(|| env::panic_str("Event not found"));
        self.assert_event_not_banned(&encrypted_cid);
        self.assert_near_purchase_available(&encrypted_cid, &event);

        let required_price = NearToken::from_yoctonear(Self::event_near_price(&event).0);
        let storage_cost = STORAGE_COST_NFT;
        let token =
            self.internal_mint_ticket(buyer_id.clone(), &event, encrypted_cid.clone(), false);

        // Calculate and apply commission (2% platform, 98% creator)
        let (creator_amount, commission) = self.apply_commission(required_price);

        // Transfer 98% to creator
        if creator_amount > 0 {
            Promise::new(event.creator_id.clone())
                .transfer(NearToken::from_yoctonear(creator_amount))
                .as_return();
        }

        // Refund excess to buyer (unwrapped NEAR minus total cost)
        let total_used = required_price.saturating_add(storage_cost);
        let received = NearToken::from_yoctonear(wnear_amount.0);
        if received > total_used {
            let refund = received.saturating_sub(total_used);
            Promise::new(buyer_id.clone()).transfer(refund).as_return();
        }

        // Log purchase for audit trail
        let price_yocto = required_price.as_yoctonear();
        self.log_purchase(
            buyer_id.clone(),
            event.creator_id.clone(),
            encrypted_cid.clone(),
            token.token_id,
            price_yocto,
            creator_amount,
            commission,
            PurchaseType::Direct,
        );

        // Return "0" to ft_resolve_transfer → all wNEAR was used (no refund needed)
        U128(0)
    }

    /// Mint NFT using pre-paid funds (Callable via Session Key)
    ///
    /// Deducts storage cost from user's prepaid balance, then mints via
    /// a #[private] internal function (not nft_mint which has an owner guard).
    /// Includes a callback to refund the user if the mint fails.
    pub fn nft_mint_prepaid(
        &mut self,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    ) -> Promise {
        self.assert_not_paused();
        let account_id = env::predecessor_account_id();
        let session_public_key = self.use_upload_session(
            UploadSessionStatus::AwaitingMint,
            UploadSessionStatus::AwaitingEvent,
            STORAGE_COST_ACCOUNT,
        );

        // Call #[private] internal mint (NOT nft_mint which has owner guard)
        // Then callback to verify success and refund on failure
        Self::ext(env::current_account_id())
            .with_attached_deposit(STORAGE_COST_ACCOUNT)
            .with_static_gas(near_sdk::Gas::from_tgas(60))
            .nft_mint_internal(receiver_id, token_metadata, video_metadata)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(10))
                    .on_nft_mint_prepaid_callback(
                        account_id,
                        session_public_key,
                        U128(STORAGE_COST_ACCOUNT.as_yoctonear()),
                    ),
            )
    }

    /// Internal NFT mint - called via cross-contract call from nft_mint_prepaid
    /// Uses #[private] instead of owner guard so the contract can call itself
    #[payable]
    #[private]
    pub fn nft_mint_internal(
        &mut self,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    ) -> Token {
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        self.video_metadata.insert(&token_id, &video_metadata);
        self.add_token_to_cid_index(&video_metadata.encrypted_cid, &token_id);

        self.tokens
            .internal_mint(token_id, receiver_id, Some(token_metadata))
    }

    /// Callback after nft_mint_prepaid XCC completes.
    /// Returns true on success, false on failure (session restored to AwaitingMint).
    /// The client MUST check this return value before calling create_event_prepaid.
    #[private]
    pub fn on_nft_mint_prepaid_callback(
        &mut self,
        account_id: AccountId,
        session_public_key: PublicKey,
        charge_amount: U128,
    ) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if !succeeded {
            let mut sessions = self.lazy_upload_sessions();
            if let Some(mut session) = sessions.get(&session_public_key) {
                if session.owner_id == account_id
                    && session.status == UploadSessionStatus::AwaitingEvent
                {
                    session.remaining_budget =
                        U128(session.remaining_budget.0.saturating_add(charge_amount.0));
                    session.remaining_calls = session.remaining_calls.saturating_add(1);
                    session.status = UploadSessionStatus::AwaitingMint;
                    sessions.insert(&session_public_key, &session);
                }
            }
            env::log_str(&format!(
                "Upload session mint FAILED - restored {} to {}",
                charge_amount.0, account_id
            ));
        }

        succeeded
    }

    // ═══════════════════════════════════════════════════════════════
    // SPONSORED TRIAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Fund the trial pool - anyone can contribute (typically owner)
    /// These funds are used to sponsor trial account creation
    #[payable]
    pub fn fund_trial_pool(&mut self) {
        self.assert_not_paused();
        let deposit = env::attached_deposit();
        require!(deposit.as_yoctonear() > 0, "Must attach some NEAR");

        self.trial_pool = self.trial_pool.saturating_add(deposit);
    }

    /// Withdraw funds from trial pool (owner only)
    pub fn withdraw_trial_pool(&mut self, amount: U128) -> Promise {
        self.assert_owner();
        self.withdraw_trial_pool_timelocked(amount)
    }

    fn withdraw_trial_pool_timelocked(&mut self, amount: U128) -> Promise {
        self.assert_not_paused();

        let withdraw_amount = NearToken::from_yoctonear(amount.0);
        require!(
            self.trial_pool >= withdraw_amount,
            "Insufficient trial pool balance"
        );

        self.trial_pool = self.trial_pool.saturating_sub(withdraw_amount);

        Promise::new(env::predecessor_account_id()).transfer(withdraw_amount)
    }

    pub fn claim_trial_invite_with_implicit_account(
        &mut self,
        new_public_key: PublicKey,
    ) -> Promise {
        self.assert_not_paused();
        require!(
            self.onboarding_config.enabled,
            "Onboarding is currently disabled"
        );

        let signer_public_key = env::signer_account_pk();
        let signer_pk = String::from(&signer_public_key);
        let mut trial_invites = self.lazy_trial_invites();

        let mut trial_invite = trial_invites
            .get(&signer_pk)
            .expect("Invalid or already claimed trial invite key");

        require!(
            trial_invite.remaining_claims > 0,
            "Trial invite already claimed"
        );
        require!(
            !Self::is_trial_invite_expired(&trial_invite),
            "Trial invite expired"
        );

        let day_timestamp = self.increment_daily_limit_if_allowed().unwrap_or_else(|| {
            env::panic_str("Daily trial limit reached. Please try again tomorrow.")
        });

        let account_cost = TRIAL_ACCOUNT_STORAGE_COST;
        require!(
            self.trial_pool >= account_cost,
            "Trial pool empty. Please contact the platform owner."
        );

        let implicit_account_id = Self::implicit_account_id_from_public_key(&new_public_key);

        self.trial_pool = self.trial_pool.saturating_sub(account_cost);
        trial_invite.remaining_claims = 0;
        trial_invites.insert(&signer_pk, &trial_invite);

        Promise::new(implicit_account_id.clone())
            .transfer(account_cost)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(20))
                    .on_trial_invite_funded(
                        implicit_account_id,
                        signer_public_key,
                        U128(account_cost.as_yoctonear()),
                        Some(day_timestamp),
                    ),
            )
    }

    #[private]
    pub fn on_trial_invite_funded(
        &mut self,
        implicit_account_id: AccountId,
        signer_public_key: PublicKey,
        account_cost: U128,
        rollback_day_timestamp: Option<u64>,
    ) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if succeeded {
            let signer_pk = String::from(&signer_public_key);
            self.lazy_trial_invites().remove(&signer_pk);
            Promise::new(env::current_account_id())
                .delete_key(signer_public_key)
                .as_return();
            env::log_str(&format!(
                "Trial invite funded implicit account {} successfully.",
                implicit_account_id
            ));
            return true;
        }

        self.trial_pool = self
            .trial_pool
            .saturating_add(NearToken::from_yoctonear(account_cost.0));
        if let Some(day_timestamp) = rollback_day_timestamp {
            self.rollback_daily_limit(day_timestamp);
        }
        self.restore_trial_invite_claim(&signer_public_key);
        env::log_str("Trial invite funding failed; restored invite and refunded trial pool.");
        false
    }

    /// RELAYER-LESS: Create a sponsored trial account directly from client
    ///
    /// This function can ONLY be called via an onboarding Function Call Access Key.
    /// Anti-abuse measures:
    /// 1. Signer's public key must be in `onboarding_keys`
    /// 2. Daily rate limit enforced
    /// 3. Onboarding must be enabled
    ///
    /// Creates: {username}.{contract_id} (e.g. "alice.youtick.near")
    /// Cost: 0.002 NEAR per account from trial pool (NEP-448 zero-balance buffer)
    pub fn create_sponsored_trial_direct(
        &mut self,
        username: String,
        new_public_key: PublicKey,
    ) -> Promise {
        self.assert_not_paused();
        // Anti-abuse check 1: Verify onboarding is enabled
        require!(
            self.onboarding_config.enabled,
            "Onboarding is currently disabled"
        );

        // Anti-abuse check 2: Verify signer's public key is an authorized onboarding key
        let signer_pk = env::signer_account_pk();
        require!(
            self.onboarding_keys.contains(&signer_pk),
            "Unauthorized: Signer's key is not an onboarding key"
        );

        // Anti-abuse check 3: Daily rate limiting (DoS prevention)
        let day_timestamp = self.increment_daily_limit_if_allowed().unwrap_or_else(|| {
            env::panic_str("Daily trial limit reached. Please try again tomorrow.")
        });

        // Validate username
        require!(
            username.len() >= 2 && username.len() <= 32,
            "Username must be 2-32 characters"
        );
        require!(
            username
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-'),
            "Username can only contain lowercase letters, numbers, - and _"
        );

        // Cost for account creation + initial balance
        let account_cost = TRIAL_ACCOUNT_STORAGE_COST;

        require!(
            self.trial_pool >= account_cost,
            "Trial pool empty. Please contact the platform owner."
        );

        // Deduct from pool
        self.trial_pool = self.trial_pool.saturating_sub(account_cost);

        // Create subaccount ID: {username}.{this_contract}
        let contract_id = env::current_account_id();
        let new_account_id: AccountId = format!("{}.{}", username, contract_id)
            .parse()
            .expect("Invalid account ID format");

        // Create the subaccount with Full Access Key
        Promise::new(new_account_id)
            .create_account()
            .add_full_access_key(new_public_key)
            .transfer(account_cost)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(10))
                    .on_sponsored_trial_account_created(
                        U128(account_cost.as_yoctonear()),
                        Some(day_timestamp),
                    ),
            )
    }

    /// Claim a FREE ticket directly via onboarding key (signless, no deposit needed)
    ///
    /// Anti-abuse:
    /// 1. Signer's public key must be in `onboarding_keys`
    /// 2. Only works for events where price == 0
    /// 3. Daily rate limit applies
    /// 4. Storage paid from trial_pool (0.01 NEAR)
    pub fn claim_free_ticket_direct(
        &mut self,
        receiver_id: AccountId,
        encrypted_cid: String,
    ) -> Promise {
        self.assert_not_paused();
        // Verify onboarding enabled
        require!(
            self.onboarding_config.enabled,
            "Onboarding is currently disabled"
        );

        // Verify signer is authorized onboarding key
        let signer_pk = env::signer_account_pk();
        require!(
            self.onboarding_keys.contains(&signer_pk),
            "Unauthorized: Signer's key is not an onboarding key"
        );

        // Daily rate limiting (capture day_timestamp for rollback)
        let day_timestamp = self
            .increment_daily_limit_if_allowed()
            .unwrap_or_else(|| env::panic_str("Daily limit reached. Please try again tomorrow."));

        // Verify event exists, is not banned, and is free
        let maybe_event = self.events.get(&encrypted_cid);
        require!(maybe_event.is_some(), "Event not found");
        let event = maybe_event.unwrap();
        require!(
            self.lazy_banned_events().get(&encrypted_cid).is_none(),
            "This event has been banned and tickets cannot be claimed"
        );
        require!(
            event.price.0 == 0,
            "This ticket is not free. Use buy_ticket instead."
        );

        // Storage cost
        let storage_cost = STORAGE_COST_NFT;
        require!(self.trial_pool >= storage_cost, "Trial pool empty.");

        // Deduct from trial pool
        self.trial_pool = self.trial_pool.saturating_sub(storage_cost);

        // Mint via internal call with callback for rollback on failure
        Self::ext(env::current_account_id())
            .with_attached_deposit(storage_cost)
            .buy_ticket_internal(receiver_id, encrypted_cid)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(5))
                    .on_free_ticket_claim_complete(
                        U128::from(storage_cost.as_yoctonear()),
                        day_timestamp,
                    ),
            )
    }

    #[private]
    pub fn on_free_ticket_claim_complete(
        &mut self,
        storage_cost: U128,
        rollback_day_timestamp: u64,
    ) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if succeeded {
            return true;
        }

        self.trial_pool = self
            .trial_pool
            .saturating_add(NearToken::from_yoctonear(storage_cost.0));
        self.rollback_daily_limit(rollback_day_timestamp);

        env::log_str("Free ticket claim failed; refunded trial pool and rolled back daily limit.");
        false
    }

    /// Callback for sponsored trial account creation.
    /// Refunds the trial pool and rolls back the daily limit if account creation fails.
    #[private]
    pub fn on_sponsored_trial_account_created(
        &mut self,
        account_cost: U128,
        rollback_day_timestamp: Option<u64>,
    ) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if succeeded {
            return true;
        }

        let refund_amount = NearToken::from_yoctonear(account_cost.0);
        self.trial_pool = self.trial_pool.saturating_add(refund_amount);

        if let Some(day_timestamp) = rollback_day_timestamp {
            self.rollback_daily_limit(day_timestamp);
        }

        env::log_str("Sponsored trial account creation failed; refunded trial pool.");
        false
    }

    #[private]
    pub fn on_sponsor_implicit_guest_funded(
        &mut self,
        implicit_account_id: AccountId,
        account_cost: U128,
        rollback_day_timestamp: Option<u64>,
    ) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if succeeded {
            env::log_str(&format!(
                "Sponsored implicit guest {} successfully.",
                implicit_account_id
            ));
            return true;
        }

        self.trial_pool = self
            .trial_pool
            .saturating_add(NearToken::from_yoctonear(account_cost.0));

        if let Some(day_timestamp) = rollback_day_timestamp {
            self.rollback_daily_limit(day_timestamp);
        }

        env::log_str("Sponsored implicit guest funding failed; refunded trial pool.");
        false
    }

    /// Called via Function Call Access Key (onboarding key).
    /// Funds an implicit account derived from the caller's public key.
    pub fn sponsor_implicit_guest_direct(&mut self, new_public_key: PublicKey) -> Promise {
        self.assert_not_paused();
        require!(
            self.onboarding_config.enabled,
            "Onboarding is currently disabled"
        );

        let signer_pk = env::signer_account_pk();
        require!(
            self.onboarding_keys.contains(&signer_pk),
            "Unauthorized: Signer's key is not an onboarding key"
        );

        let day_timestamp = self.increment_daily_limit_if_allowed().unwrap_or_else(|| {
            env::panic_str("Daily trial limit reached. Please try again tomorrow.")
        });

        let account_cost = TRIAL_ACCOUNT_STORAGE_COST;
        require!(
            self.trial_pool >= account_cost,
            "Trial pool empty. Please contact the platform owner."
        );

        let implicit_account_id = Self::implicit_account_id_from_public_key(&new_public_key);
        self.trial_pool = self.trial_pool.saturating_sub(account_cost);

        Promise::new(implicit_account_id.clone())
            .transfer(account_cost)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(20))
                    .on_sponsor_implicit_guest_funded(
                        implicit_account_id,
                        U128(account_cost.as_yoctonear()),
                        Some(day_timestamp),
                    ),
            )
    }

    /// View: Get trial pool balance
    pub fn get_trial_pool_balance(&self) -> U128 {
        U128(self.trial_pool.as_yoctonear())
    }

    /// View: Get commission pool balance
    pub fn get_commission_pool(&self) -> U128 {
        U128(self.commission_pool.as_yoctonear())
    }

    /// Withdraw from commission pool (owner only)
    pub fn withdraw_commission(&mut self, amount: U128) -> Promise {
        self.assert_owner();
        self.withdraw_commission_timelocked(amount)
    }

    fn withdraw_commission_timelocked(&mut self, amount: U128) -> Promise {
        self.assert_not_paused();

        let withdraw_amount = NearToken::from_yoctonear(amount.0);
        require!(
            self.commission_pool >= withdraw_amount,
            "Insufficient commission pool balance"
        );

        self.commission_pool = self.commission_pool.saturating_sub(withdraw_amount);

        Promise::new(env::predecessor_account_id()).transfer(withdraw_amount)
    }

    // ═══════════════════════════════════════════════════════════════
    // V12: USDC POOL WITHDRAWALS
    // ═══════════════════════════════════════════════════════════════

    /// Withdraw commission_pool_usdc (owner only, requires 24h timelock).
    /// Proposes a timelock action; returns the proposal ID.
    pub fn withdraw_commission_usdc(&mut self, amount: U128) -> u64 {
        self.assert_owner();
        self.propose_action(TimelockAction::WithdrawCommissionUsdc { amount })
    }

    fn withdraw_commission_usdc_timelocked(&mut self, amount: U128) -> Promise {
        self.assert_not_paused();
        require!(
            self.commission_pool_usdc >= amount.0,
            "Insufficient USDC commission pool balance"
        );
        self.commission_pool_usdc = self.commission_pool_usdc.saturating_sub(amount.0);

        Promise::new(usdc_contract_id()).function_call(
            "ft_transfer".to_string(),
            near_sdk::serde_json::json!({
                "receiver_id": env::predecessor_account_id(),
                "amount": amount.0.to_string(),
                "memo": "Youtick commission withdrawal"
            })
            .to_string()
            .into_bytes(),
            NearToken::from_yoctonear(1),
            near_sdk::Gas::from_tgas(10),
        )
    }

    /// Withdraw trial_pool_usdc (owner only, requires 24h timelock).
    /// Proposes a timelock action; returns the proposal ID.
    pub fn withdraw_trial_pool_usdc(&mut self, amount: U128) -> u64 {
        self.assert_owner();
        self.propose_action(TimelockAction::WithdrawTrialPoolUsdc { amount })
    }

    fn withdraw_trial_pool_usdc_timelocked(&mut self, amount: U128) -> Promise {
        self.assert_not_paused();
        require!(
            self.trial_pool_usdc >= amount.0,
            "Insufficient USDC trial pool balance"
        );
        self.trial_pool_usdc = self.trial_pool_usdc.saturating_sub(amount.0);

        Promise::new(usdc_contract_id()).function_call(
            "ft_transfer".to_string(),
            near_sdk::serde_json::json!({
                "receiver_id": env::predecessor_account_id(),
                "amount": amount.0.to_string(),
                "memo": "Youtick trial pool withdrawal"
            })
            .to_string()
            .into_bytes(),
            NearToken::from_yoctonear(1),
            near_sdk::Gas::from_tgas(10),
        )
    }

    /// View method: get USDC pool balances
    pub fn get_usdc_pools(&self) -> (U128, U128) {
        (U128(self.trial_pool_usdc), U128(self.commission_pool_usdc))
    }

    pub fn get_creator_stablecoin_balance(
        &self,
        token_contract: AccountId,
        creator_id: AccountId,
    ) -> U128 {
        require!(
            token_contract == usdc_contract_id() || token_contract == usdt_contract_id(),
            "Unsupported stablecoin"
        );
        let key = Self::stablecoin_balance_key(&token_contract, &creator_id);
        U128(
            self.lazy_stablecoin_creator_balances()
                .get(&key)
                .unwrap_or(0),
        )
    }

    pub fn get_stablecoin_commission_balance(&self, token_contract: AccountId) -> U128 {
        require!(
            token_contract == usdc_contract_id() || token_contract == usdt_contract_id(),
            "Unsupported stablecoin"
        );
        if token_contract == usdc_contract_id() {
            return U128(
                self.trial_pool_usdc
                    .saturating_add(self.commission_pool_usdc),
            );
        }
        U128(
            self.lazy_stablecoin_commission_balances()
                .get(&token_contract.to_string())
                .unwrap_or(0),
        )
    }

    pub fn is_stablecoin_payment_settled(
        &self,
        token_contract: AccountId,
        sender_id: AccountId,
        payment_id: String,
    ) -> bool {
        require!(
            token_contract == usdc_contract_id() || token_contract == usdt_contract_id(),
            "Unsupported stablecoin"
        );
        self.lazy_settled_stablecoin_payments()
            .contains(&format!("{}:{}:{}", token_contract, sender_id, payment_id))
    }

    pub fn withdraw_creator_stablecoin(
        &mut self,
        token_contract: AccountId,
        amount: Option<U128>,
    ) -> Promise {
        self.assert_not_paused();
        require!(
            token_contract == usdc_contract_id() || token_contract == usdt_contract_id(),
            "Unsupported stablecoin"
        );
        let creator_id = env::predecessor_account_id();
        let key = Self::stablecoin_balance_key(&token_contract, &creator_id);
        let mut balances = self.lazy_stablecoin_creator_balances();
        let available = balances.get(&key).unwrap_or(0);
        let withdraw_amount = amount.map(|value| value.0).unwrap_or(available);
        require!(withdraw_amount > 0, "No stablecoin balance to withdraw");
        require!(
            available >= withdraw_amount,
            "Insufficient stablecoin balance"
        );
        let remaining = available - withdraw_amount;
        if remaining == 0 {
            balances.remove(&key);
        } else {
            balances.insert(&key, &remaining);
        }

        Promise::new(token_contract.clone())
            .function_call(
                "ft_transfer".to_string(),
                near_sdk::serde_json::json!({
                    "receiver_id": creator_id,
                    "amount": withdraw_amount.to_string(),
                    "memo": "Youtick creator payout"
                })
                .to_string()
                .into_bytes(),
                NearToken::from_yoctonear(1),
                near_sdk::Gas::from_tgas(10),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(5))
                    .on_creator_stablecoin_withdraw_complete(
                        token_contract,
                        creator_id,
                        U128(withdraw_amount),
                    ),
            )
    }

    #[private]
    pub fn on_creator_stablecoin_withdraw_complete(
        &mut self,
        token_contract: AccountId,
        creator_id: AccountId,
        amount: U128,
    ) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );
        if succeeded {
            return true;
        }

        self.add_stablecoin_creator_balance(&token_contract, &creator_id, amount.0);
        false
    }

    #[private]
    pub fn on_sponsored_free_ticket_complete(&mut self, storage_cost: U128) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if succeeded {
            return true;
        }

        self.trial_pool = self
            .trial_pool
            .saturating_add(NearToken::from_yoctonear(storage_cost.0));

        env::log_str("Sponsored free ticket claim failed; refunded trial pool.");
        false
    }

    // ═══════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    pub fn get_video_metadata(&self, token_id: TokenId) -> Option<VideoMetadata> {
        self.video_metadata.get(&token_id)
    }

    /// Verify if an account owns a specific token
    /// Used by backend for access control
    pub fn verify_ownership(&self, account_id: AccountId, token_id: TokenId) -> bool {
        match self.tokens.nft_token(&token_id) {
            Some(token) => token.owner_id == account_id,
            None => false,
        }
    }

    /// Get all tokens owned by an account with video metadata
    pub fn get_tokens_with_video(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<(Token, Option<VideoMetadata>)> {
        let tokens = self
            .tokens
            .nft_tokens_for_owner(&account_id, from_index, limit);

        tokens
            .into_iter()
            .map(|token| {
                let video = self.video_metadata.get(&token.token_id);
                (token, video)
            })
            .collect()
    }

    pub fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }

    // ═══════════════════════════════════════════════════════════════
    // PURCHASE LOG VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// View: Get a single purchase log entry by ID
    pub fn get_purchase_log(&self, purchase_id: u64) -> Option<PurchaseLog> {
        self.purchase_logs.get(&purchase_id)
    }

    /// View: Get purchase logs with pagination
    pub fn get_purchase_logs(
        &self,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<(u64, PurchaseLog)> {
        let start = from_index.unwrap_or(0);
        let lim = limit.unwrap_or(50).min(100) as usize;

        self.purchase_logs
            .iter()
            .filter(|(id, _)| *id >= start)
            .take(lim)
            .collect()
    }

    /// View: Get total number of purchase log entries
    pub fn get_purchase_count(&self) -> u64 {
        self.next_purchase_id
    }

    /// View: Get purchase logs filtered by creator
    pub fn get_purchase_logs_by_creator(
        &self,
        creator_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<(u64, PurchaseLog)> {
        let start = from_index.unwrap_or(0);
        let lim = limit.unwrap_or(50).min(100) as usize;

        self.purchase_logs
            .iter()
            .filter(|(id, log)| *id >= start && log.creator_id == creator_id)
            .take(lim)
            .collect()
    }

    /// View: Get creator stats (total sales, total revenue)
    pub fn get_creator_stats(&self, creator_id: AccountId) -> CreatorStats {
        let mut total_sales = 0u64;
        let mut total_revenue_yocto = 0u128;

        for (_, log) in self.purchase_logs.iter() {
            if log.creator_id == creator_id {
                total_sales += 1;
                total_revenue_yocto += log.creator_amount.0;
            }
        }

        CreatorStats {
            total_sales,
            total_revenue_yocto: U128(total_revenue_yocto),
        }
    }

    /// Set creator profile (only callable by the profile owner)
    pub fn set_creator_profile(
        &mut self,
        display_name: Option<String>,
        bio: Option<String>,
        website: Option<String>,
        twitter: Option<String>,
        instagram: Option<String>,
        avatar_url: Option<String>,
    ) {
        let caller = env::predecessor_account_id();
        let profile = CreatorProfile {
            display_name,
            bio,
            website,
            twitter,
            instagram,
            avatar_url,
        };
        self.creator_profiles.insert(&caller, &profile);
    }

    /// View: Get creator profile
    pub fn get_creator_profile(&self, creator_id: AccountId) -> Option<CreatorProfile> {
        self.creator_profiles.get(&creator_id)
    }

    /// Get the next token ID (useful for predicting IDs for batch operations)
    pub fn get_next_token_id(&self) -> u64 {
        self.next_token_id
    }

    /// Gift a ticket to a receiver (commission-free minting for creators)
    /// Creator pays storage cost, no commission taken
    /// SECURITY: Requires deposit for storage (0.01 NEAR)
    #[payable]
    pub fn gift_ticket(&mut self, receiver_id: AccountId, encrypted_cid: String) -> Token {
        self.assert_not_paused();
        let maybe_event = self.events.get(&encrypted_cid);
        require!(maybe_event.is_some(), "Event not found");

        require!(
            self.lazy_banned_events().get(&encrypted_cid).is_none(),
            "Event is banned"
        );

        let event = maybe_event.unwrap();

        // Verify caller is the event creator
        require!(
            env::predecessor_account_id() == event.creator_id,
            "Only event creator can gift tickets"
        );

        // Require storage deposit
        let storage_cost = STORAGE_COST_NFT;
        require!(
            env::attached_deposit() >= storage_cost,
            "Requires at least 0.01 NEAR for storage"
        );

        // Mint the NFT (no commission)
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        let video_metadata = VideoMetadata {
            encrypted_cid: encrypted_cid.clone(),
            duration_seconds: 0,
            event_date: Some(event.created_at),
            content_type: ContentType::Exclusive,
            nova_group_id: None,
            storage_type: StorageType::Kms,
        };

        self.video_metadata.insert(&token_id, &video_metadata);
        self.add_token_to_cid_index(&encrypted_cid, &token_id);

        let token_metadata = TokenMetadata {
            title: Some(event.title.clone()),
            description: Some(event.description.clone()),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        };

        self.tokens
            .internal_mint(token_id.clone(), receiver_id, Some(token_metadata))
    }

    // ═══════════════════════════════════════════════════════════════
    // GIFT DROP FUNCTIONS (Access Key Based)
    // ═══════════════════════════════════════════════════════════════

    /// Create a gift drop - adds Access Keys for claiming
    /// Returns nothing (keys are generated client-side)
    /// DEPOSIT: 0.15 NEAR per key (account creation + NFT storage)
    #[payable]
    pub fn create_gift_drop(&mut self, event_cid: String, public_keys: Vec<near_sdk::PublicKey>) {
        self.assert_not_paused();
        let num_keys = public_keys.len() as u32;
        require!(num_keys > 0 && num_keys <= 50, "Must create 1-50 keys");

        // Verify event exists
        let maybe_event = self.events.get(&event_cid);
        require!(maybe_event.is_some(), "Event not found");
        let event = maybe_event.unwrap();
        require!(
            self.lazy_banned_events().get(&event_cid).is_none(),
            "This event has been banned and gift drops cannot be created"
        );

        // Creator must own the event
        require!(
            env::predecessor_account_id() == event.creator_id,
            "Only event creator can create gift drops"
        );

        let deposit_per_claim = GIFT_DEPOSIT_PER_LINK;
        let total_required = deposit_per_claim.saturating_mul(num_keys as u128);

        require!(
            env::attached_deposit() >= total_required,
            &format!("Requires {} NEAR for {} keys", total_required, num_keys)
        );

        // GD-1 fix: Refund excess deposit to the caller
        let excess = env::attached_deposit().saturating_sub(total_required);
        if excess.as_yoctonear() > 0 {
            Promise::new(env::predecessor_account_id())
                .transfer(excess)
                .as_return();
        }

        let created_at = env::block_timestamp();

        for pk in public_keys {
            let gift_drop = GiftDrop {
                creator_id: event.creator_id.clone(),
                event_cid: event_cid.clone(),
                remaining_claims: 1,
                deposit_per_claim: U128(deposit_per_claim.as_yoctonear()),
                created_at,
            };

            // Add Function Call Access Key to THIS contract
            // This allows the holder of the Private Key to call claim functions
            // Allowance: 0.05 NEAR for gas fees (enough for claim tx)
            Promise::new(env::current_account_id())
                .add_access_key_allowance(
                    pk.clone(),
                    near_sdk::Allowance::Limited(
                        NonZeroU128::new(GAS_FEE_ALLOWANCE.as_yoctonear()).unwrap(),
                    ),
                    env::current_account_id(),
            "claim_gift,claim_gift_and_create_account,claim_gift_with_implicit_account".to_string(),
        )
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(near_sdk::Gas::from_tgas(20))
                        .on_gift_access_key_added(pk, gift_drop),
                )
                .as_return();
        }

        events::emit_gift_drop_created(
            event_cid,
            env::predecessor_account_id().to_string(),
            num_keys as u64,
        );
    }

    #[private]
    pub fn on_gift_access_key_added(&mut self, public_key: PublicKey, gift_drop: GiftDrop) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if succeeded {
            let pk_str = String::from(&public_key);
            self.gift_drops.insert(&pk_str, &gift_drop);
            return true;
        }

        Promise::new(gift_drop.creator_id.clone())
            .transfer(NearToken::from_yoctonear(gift_drop.deposit_per_claim.0))
            .as_return();
        env::log_str("Gift access key creation failed; refunded reserved deposit.");
        false
    }

    /// Claim a gift - creates trial account and mints NFT
    /// Called by the recipient using the Linkdrop Access Key
    #[payable]
    pub fn claim_gift(&mut self, receiver_id: AccountId) -> Token {
        self.assert_not_paused();
        // Identify the drop via the Signer's Public Key
        let signer_pk: String = String::from(&env::signer_account_pk());

        let maybe_gift = self.gift_drops.get(&signer_pk);
        require!(maybe_gift.is_some(), "Invalid or already claimed gift key");
        let mut gift_drop = maybe_gift.unwrap();

        require!(gift_drop.remaining_claims > 0, "Gift already claimed");

        // Get event details for NFT metadata
        let event = self
            .events
            .get(&gift_drop.event_cid)
            .expect("Event not found");
        require!(
            self.lazy_banned_events()
                .get(&gift_drop.event_cid)
                .is_none(),
            "This event has been banned and gift tickets cannot be claimed"
        );

        // Mint NFT using helper (is_gift = true for "Gift ticket:" prefix)
        let token =
            self.internal_mint_ticket(receiver_id.clone(), &event, gift_drop.event_cid, true);

        gift_drop.remaining_claims = 0;
        self.gift_drops.remove(&signer_pk);
        Promise::new(env::current_account_id())
            .delete_key(env::signer_account_pk())
            .as_return();

        events::emit_gift_claimed(token.token_id.clone(), receiver_id, signer_pk);

        token
    }

    /// View function: Check if a gift key is valid
    pub fn is_gift_valid(&self, public_key: String) -> bool {
        match self.gift_drops.get(&public_key) {
            Some(drop) => drop.remaining_claims > 0,
            None => false,
        }
    }

    /// View function: Get gift drop info
    pub fn get_gift_info(&self, public_key: String) -> Option<(String, AccountId)> {
        self.gift_drops
            .get(&public_key)
            .map(|drop| (drop.event_cid, drop.creator_id))
    }

    /// View function: Get full gift drop details
    /// Returns complete GiftDrop struct for UI display
    pub fn get_gift_info_full(&self, public_key: String) -> Option<GiftDrop> {
        self.gift_drops.get(&public_key)
    }

    // ═══════════════════════════════════════════════════════════════
    // RELAYER-LESS GIFT CLAIM (Account creation from contract)
    // ═══════════════════════════════════════════════════════════════

    /// Claim a gift AND create a new account in one transaction
    /// Called using the Linkdrop Access Key
    pub fn claim_gift_and_create_account(
        &mut self,
        new_account_id: AccountId,
        new_public_key: near_sdk::PublicKey,
    ) -> Promise {
        self.assert_not_paused();
        // Identify the drop via the Signer's Public Key
        let signer_public_key = env::signer_account_pk();
        let signer_pk: String = String::from(&signer_public_key);

        let maybe_gift = self.gift_drops.get(&signer_pk);
        require!(maybe_gift.is_some(), "Invalid or already claimed gift key");
        let mut gift_drop = maybe_gift.unwrap();

        require!(gift_drop.remaining_claims > 0, "Gift already claimed");

        // Check event is not banned
        require!(
            self.lazy_banned_events()
                .get(&gift_drop.event_cid)
                .is_none(),
            "This event has been banned and gift tickets cannot be claimed"
        );

        let event_cid = gift_drop.event_cid.clone();
        gift_drop.remaining_claims = 0;
        self.gift_drops.insert(&signer_pk, &gift_drop);

        let account_creation_cost = ACCOUNT_CREATION_COST;
        // Create new account and add full access key
        // Then callback to mint the NFT
        // Leave 0.01 NEAR for NFT storage in callback
        let nft_storage_cost = STORAGE_COST_NFT;

        Promise::new(new_account_id.clone())
            .create_account()
            .transfer(account_creation_cost)
            .add_full_access_key(new_public_key)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(50))
                    .on_gift_account_created(
                        new_account_id,
                        event_cid,
                        signer_public_key,
                        U128(nft_storage_cost.as_yoctonear()),
                    ),
            )
    }

    /// Claim a gift and fund an implicit account derived from the new public key.
    /// This is the preferred guest/trial path for walletless gift tickets.
    pub fn claim_gift_with_implicit_account(&mut self, new_public_key: PublicKey) -> Promise {
        self.assert_not_paused();
        let signer_public_key = env::signer_account_pk();
        let signer_pk: String = String::from(&signer_public_key);

        let maybe_gift = self.gift_drops.get(&signer_pk);
        require!(maybe_gift.is_some(), "Invalid or already claimed gift key");
        let mut gift_drop = maybe_gift.unwrap();

        require!(gift_drop.remaining_claims > 0, "Gift already claimed");
        require!(
            self.lazy_banned_events()
                .get(&gift_drop.event_cid)
                .is_none(),
            "This event has been banned and gift tickets cannot be claimed"
        );

        let event_cid = gift_drop.event_cid.clone();
        gift_drop.remaining_claims = 0;
        self.gift_drops.insert(&signer_pk, &gift_drop);

        let implicit_account_id = Self::implicit_account_id_from_public_key(&new_public_key);
        let account_cost = TRIAL_ACCOUNT_STORAGE_COST;
        let nft_storage_cost = STORAGE_COST_NFT;

        Promise::new(implicit_account_id.clone())
            .transfer(account_cost)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(50))
                    .on_gift_account_created(
                        implicit_account_id,
                        event_cid,
                        signer_public_key,
                        U128(nft_storage_cost.as_yoctonear()),
                    ),
            )
    }

    /// Callback after account creation - continues the gift claim safely.
    #[private]
    pub fn on_gift_account_created(
        &mut self,
        receiver_id: AccountId,
        event_cid: String,
        signer_public_key: PublicKey,
        nft_storage_cost: U128,
    ) -> PromiseOrValue<bool> {
        #[allow(deprecated)]
        match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(_) => PromiseOrValue::Promise(
                Self::ext(env::current_account_id())
                    .with_attached_deposit(NearToken::from_yoctonear(nft_storage_cost.0))
                    .with_static_gas(near_sdk::Gas::from_tgas(30))
                    .finalize_gift_claim_after_account_created(receiver_id, event_cid)
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(near_sdk::Gas::from_tgas(10))
                            .on_finalize_gift_claim_after_account_created(signer_public_key),
                    ),
            ),
            _ => {
                self.restore_gift_drop_claim(&signer_public_key);
                env::log_str("Gift account creation failed; restored claim state.");
                PromiseOrValue::Value(false)
            }
        }
    }

    #[payable]
    #[private]
    pub fn finalize_gift_claim_after_account_created(
        &mut self,
        receiver_id: AccountId,
        event_cid: String,
    ) -> Token {
        let event = self.events.get(&event_cid).expect("Event not found");
        require!(
            self.lazy_banned_events().get(&event_cid).is_none(),
            "This event has been banned and gift tickets cannot be claimed"
        );

        self.internal_mint_ticket(receiver_id, &event, event_cid, true)
    }

    #[private]
    pub fn on_finalize_gift_claim_after_account_created(
        &mut self,
        signer_public_key: PublicKey,
    ) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if !succeeded {
            self.restore_gift_drop_claim(&signer_public_key);
            env::log_str("Gift mint after account creation failed; restored claim state.");
            return false;
        }

        let signer_pk = String::from(&signer_public_key);
        self.gift_drops.remove(&signer_pk);
        Promise::new(env::current_account_id())
            .delete_key(signer_public_key)
            .as_return();
        true
    }

    // ═══════════════════════════════════════════════════════════════
    // TRIAL ACCOUNT UPGRADE (Contract-sponsored)
    // ═══════════════════════════════════════════════════════════════

    /// Upgrade a trial account by adding a Full Access Key
    /// Gas is paid by the contract, not the trial user
    /// Can only be called by the trial account itself
    pub fn upgrade_trial_account(&mut self, new_public_key: near_sdk::PublicKey) -> Promise {
        let caller = env::predecessor_account_id();

        // Verify caller is a sub-account of this contract (trial account pattern)
        let contract_id = env::current_account_id().to_string();
        require!(
            caller.to_string().ends_with(&format!(".{}", contract_id)),
            "Only trial sub-accounts can upgrade via this method"
        );

        // Add Full Access Key to the caller's account
        // This is a cross-contract call where the contract sponsors the gas
        Promise::new(caller).add_full_access_key(new_public_key)
    }

    // ═══════════════════════════════════════════════════════════════
    // NOVA SECURE FILE-SHARING INTEGRATION
    // ═══════════════════════════════════════════════════════════════

    /// Get storage type for a video
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

    // ═══════════════════════════════════════════════════════════════
    // NEP-171 NFT METHODS
    // ═══════════════════════════════════════════════════════════════

    #[payable]
    pub fn nft_transfer(
        &mut self,
        _receiver_id: AccountId,
        _token_id: TokenId,
        _approval_id: Option<u64>,
        _memo: Option<String>,
    ) {
        env::panic_str("Ticket transfers disabled for v1");
    }

    pub fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(&token_id)
    }

    #[private]
    pub fn nft_resolve_transfer(
        &mut self,
        _previous_owner_id: AccountId,
        _receiver_id: AccountId,
        _token_id: TokenId,
        _approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        true
    }

    pub fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(&account_id)
    }

    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens
            .nft_tokens_for_owner(&account_id, from_index, limit)
    }

    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    #[payable]
    pub fn nft_approve(&mut self, token_id: TokenId, account_id: AccountId, msg: Option<String>) {
        self.tokens.nft_approve(&token_id, &account_id, msg)
    }

    pub fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(&token_id, &account_id);
    }

    pub fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(&token_id);
    }

    pub fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        _approval_id: Option<u64>,
    ) -> bool {
        self.tokens
            .approvals_by_id
            .get(&token_id)
            .map(|approvals| approvals.contains_key(&approved_account_id))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, PromiseResult};

    fn account(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn context(predecessor: &str, current: &str) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(account(predecessor));
        builder.current_account_id(account(current));
        builder
    }

    fn sample_public_key(seed: u8) -> PublicKey {
        let key = format!("ed25519:{}", bs58::encode(vec![seed; 32]).into_string());
        key.parse().unwrap()
    }

    #[test]
    fn gift_drop_is_inserted_only_after_access_key_success() {
        let owner_id = account("owner.testnet");
        let contract_id = account("contract.testnet");
        let mut contract = Contract::new(owner_id.clone());
        let public_key = sample_public_key(7);
        let gift_drop = GiftDrop {
            creator_id: owner_id,
            event_cid: "gift-event".to_string(),
            remaining_claims: 1,
            deposit_per_claim: U128(GIFT_DEPOSIT_PER_LINK.as_yoctonear()),
            created_at: 1,
        };

        testing_env!(
            context(contract_id.as_str(), contract_id.as_str()).build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Successful(vec![])],
        );

        assert!(contract.on_gift_access_key_added(public_key.clone(), gift_drop.clone()));

        let stored = contract
            .gift_drops
            .get(&String::from(&public_key))
            .expect("gift drop should be stored after successful callback");
        assert_eq!(stored.event_cid, gift_drop.event_cid);
        assert_eq!(stored.remaining_claims, 1);
    }

    #[test]
    fn gift_drop_is_not_inserted_when_access_key_creation_fails() {
        let owner_id = account("owner.testnet");
        let contract_id = account("contract.testnet");
        let mut contract = Contract::new(owner_id.clone());
        let public_key = sample_public_key(8);
        let gift_drop = GiftDrop {
            creator_id: owner_id,
            event_cid: "gift-event".to_string(),
            remaining_claims: 1,
            deposit_per_claim: U128(GIFT_DEPOSIT_PER_LINK.as_yoctonear()),
            created_at: 1,
        };

        testing_env!(
            context(contract_id.as_str(), contract_id.as_str()).build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Failed],
        );

        assert!(!contract.on_gift_access_key_added(public_key.clone(), gift_drop));
        assert!(contract
            .gift_drops
            .get(&String::from(&public_key))
            .is_none());
    }

    #[test]
    fn trial_invite_is_inserted_only_after_access_key_success() {
        let owner_id = account("owner.testnet");
        let contract_id = account("contract.testnet");
        let mut contract = Contract::new(owner_id.clone());
        let public_key = sample_public_key(9);
        let trial_invite = TrialInvite {
            sponsor_id: owner_id,
            remaining_claims: 1,
            created_at_ms: 1,
            expires_at_ms: Some(1000),
        };

        testing_env!(
            context(contract_id.as_str(), contract_id.as_str()).build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Successful(vec![])],
        );

        assert!(contract.on_trial_invite_access_key_added(
            public_key.clone(),
            trial_invite.clone(),
            U128(STORAGE_COST_INVITE.as_yoctonear()),
        ));

        let stored = contract
            .lazy_trial_invites()
            .get(&String::from(&public_key))
            .expect("trial invite should be stored after successful callback");
        assert_eq!(stored.remaining_claims, trial_invite.remaining_claims);
    }

    #[test]
    fn implicit_account_id_is_derived_from_public_key() {
        let public_key = sample_public_key(10);
        let implicit_account_id = Contract::implicit_account_id_from_public_key(&public_key);
        let implicit_account_id = implicit_account_id.as_str();

        assert_eq!(implicit_account_id.len(), 64);
        assert!(implicit_account_id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn event_access_mode_defaults_are_resolved_from_price() {
        let owner_id = account("owner.testnet");
        let contract = Contract::new(owner_id.clone());

        let free_event = Event {
            title: "Free".to_string(),
            description: "Public".to_string(),
            price: U128(0),
            price_usdc: None,
            price_near: None,
            creator_id: owner_id.clone(),
            created_at: 1,
            content_type: ContentType::Exclusive,
        };
        let paid_event = Event {
            title: "Paid".to_string(),
            description: "Premium".to_string(),
            price: U128(NearToken::from_near(1).as_yoctonear()),
            price_usdc: None,
            price_near: None,
            creator_id: owner_id,
            created_at: 1,
            content_type: ContentType::Exclusive,
        };

        assert_eq!(
            contract
                .build_event_response("free-cid", &free_event)
                .access_mode,
            "free_collectible"
        );
        assert_eq!(
            contract
                .build_event_response("paid-cid", &paid_event)
                .access_mode,
            "paid"
        );
    }

    #[test]
    fn sponsor_implicit_guest_deducts_trial_pool() {
        let owner_id = account("owner.testnet");
        let contract_id = account("contract.testnet");
        let mut contract = Contract::new(owner_id);
        let onboarding_pk = sample_public_key(10);
        contract.trial_pool = TRIAL_ACCOUNT_STORAGE_COST;
        contract.onboarding_keys.insert(&onboarding_pk);

        let mut builder = context(contract_id.as_str(), contract_id.as_str());
        builder.signer_account_pk(onboarding_pk);
        testing_env!(builder.build());

        let _ = contract.sponsor_implicit_guest_direct(sample_public_key(11));

        assert_eq!(contract.trial_pool, NearToken::from_yoctonear(0));
        assert_eq!(contract.get_daily_trial_count(), 1);
    }

    #[test]
    fn sponsor_implicit_guest_callback_refunds_trial_pool_on_failure() {
        let owner_id = account("owner.testnet");
        let contract_id = account("contract.testnet");
        let mut contract = Contract::new(owner_id);
        let day_timestamp = Contract::get_day_timestamp();
        contract.daily_trial_counts.insert(&day_timestamp, &1);

        testing_env!(
            context(contract_id.as_str(), contract_id.as_str()).build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Failed],
        );

        assert!(!contract.on_sponsor_implicit_guest_funded(
            account("implicit.testnet"),
            U128(TRIAL_ACCOUNT_STORAGE_COST.as_yoctonear()),
            Some(day_timestamp),
        ));
        assert_eq!(contract.trial_pool, TRIAL_ACCOUNT_STORAGE_COST);
        assert_eq!(contract.get_daily_trial_count(), 0);
    }

    #[test]
    fn contract_initialization_and_pause_cycle() {
        let owner_id = account("owner.testnet");
        let contract = Contract::new(owner_id.clone());
        assert_eq!(contract.tokens.owner_id, owner_id);
        assert!(!contract.is_paused());
    }

    #[test]
    #[should_panic(expected = "Only contract owner can call this method")]
    fn direct_pause_rejects_non_owner() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        testing_env!(context("not-owner.testnet", "contract.testnet").build());
        contract.pause();
    }

    #[test]
    #[should_panic(expected = "Only contract owner can call this method")]
    fn web4_set_static_url_rejects_non_owner() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id);

        testing_env!(context("not-owner.testnet", "contract.testnet").build());
        contract.web4_set_static_url("nearfs://static".to_string());
    }

    #[test]
    fn web4_set_static_url_accepts_owner() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        testing_env!(context(owner_id.as_str(), "contract.testnet").build());
        contract.web4_set_static_url("nearfs://static".to_string());

        assert_eq!(
            contract.web4_get_static_url(),
            Some("nearfs://static".to_string())
        );
    }

    #[test]
    #[should_panic(expected = "Timelock delay not yet passed")]
    fn timelock_rejects_execution_before_delay() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000);
        testing_env!(builder.build());
        let id = contract.propose_action(TimelockAction::SetNextTokenId { new_id: 7 });

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS - 1);
        testing_env!(builder.build());
        contract.execute_action(id);
    }

    #[test]
    fn timelock_executes_admin_action_after_delay() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000);
        testing_env!(builder.build());
        let id = contract.propose_action(TimelockAction::SetNextTokenId { new_id: 7 });

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
        testing_env!(builder.build());
        contract.execute_action(id);

        assert_eq!(contract.next_token_id, 7);
    }

    #[test]
    fn ownership_transfer_updates_owner_two_step_via_timelock() {
        let owner_id = account("owner.testnet");
        let new_owner_id = account("new-owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000);
        testing_env!(builder.build());
        let id = contract.propose_action(TimelockAction::ProposeOwner {
            proposed_owner_id: new_owner_id.clone(),
        });

        assert_eq!(contract.get_owner(), owner_id);
        assert_eq!(contract.get_pending_owner(), None);

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
        testing_env!(builder.build());
        contract.execute_action(id);

        assert_eq!(contract.get_owner(), owner_id);
        assert_eq!(contract.get_pending_owner(), Some(new_owner_id.clone()));

        testing_env!(context(new_owner_id.as_str(), "contract.testnet").build());
        contract.accept_ownership();

        assert_eq!(contract.get_owner(), new_owner_id);
        assert_eq!(contract.get_pending_owner(), None);
    }

    #[test]
    #[should_panic(expected = "Only owner can propose actions")]
    fn ownership_transfer_rejects_non_owner_proposal() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id);

        testing_env!(context("eve.testnet", "contract.testnet").build());
        contract.propose_action(TimelockAction::ProposeOwner {
            proposed_owner_id: account("new-owner.testnet"),
        });
    }

    #[test]
    #[should_panic(expected = "Only proposed owner can accept ownership")]
    fn ownership_transfer_rejects_non_pending_acceptor() {
        let owner_id = account("owner.testnet");
        let new_owner_id = account("new-owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000);
        testing_env!(builder.build());
        let id = contract.propose_action(TimelockAction::ProposeOwner {
            proposed_owner_id: new_owner_id,
        });

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
        testing_env!(builder.build());
        contract.execute_action(id);

        testing_env!(context("eve.testnet", "contract.testnet").build());
        contract.accept_ownership();
    }

    #[test]
    fn timelock_ban_event_preserves_reason() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());
        contract.events.insert(
            &"event-1".to_string(),
            &Event {
                title: "T".to_string(),
                description: "D".to_string(),
                price: U128(0),
                price_usdc: None,
                price_near: None,
                creator_id: owner_id.clone(),
                created_at: 1,
                content_type: ContentType::Exclusive,
            },
        );
        contract.active_event_count = 1;

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000);
        testing_env!(builder.build());
        let id = contract.propose_action(TimelockAction::BanEvent {
            encrypted_cid: "event-1".to_string(),
            reason: BanReason::CopyrightViolation,
        });

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
        testing_env!(builder.build());
        contract.execute_action(id);

        let banned = contract.get_banned_events();
        assert_eq!(banned.len(), 1);
        assert!(matches!(banned[0].1.reason, BanReason::CopyrightViolation));
    }

    #[test]
    #[should_panic(expected = "Only contract owner can call this method")]
    fn ban_event_rejects_non_owner() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());
        seed_event(&mut contract, "event-ban-1", &owner_id);

        testing_env!(context("not-owner.testnet", "contract.testnet").build());
        contract.ban_event("event-ban-1".to_string(), BanReason::Other);
    }

    fn seed_event(contract: &mut Contract, cid: &str, creator: &AccountId) {
        contract.events.insert(
            &cid.to_string(),
            &Event {
                title: "T".to_string(),
                description: "D".to_string(),
                price: U128(0),
                price_usdc: None,
                price_near: None,
                creator_id: creator.clone(),
                created_at: 1,
                content_type: ContentType::Exclusive,
            },
        );
        contract.active_event_count = contract.active_event_count.saturating_add(1);
    }

    #[test]
    fn takedown_event_marks_banned_and_emits_log() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());
        seed_event(&mut contract, "event-takedown-1", &owner_id);

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(2_000);
        testing_env!(builder.build());

        contract.takedown_event("event-takedown-1".to_string(), BanReason::SexualContent);

        assert!(contract.is_event_banned("event-takedown-1".to_string()));
        assert_eq!(contract.active_event_count, 0);

        let logs = near_sdk::test_utils::get_logs();
        assert!(
            logs.iter().any(|l| l.contains("event_takedown")
                && l.contains("sexual_content")
                && l.contains("event-takedown-1")),
            "expected event_takedown NEP-297 log, got: {:?}",
            logs
        );
    }

    #[test]
    #[should_panic(expected = "Only owner can takedown events")]
    fn takedown_event_rejects_non_owner() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());
        seed_event(&mut contract, "event-takedown-2", &owner_id);

        testing_env!(context("attacker.testnet", "contract.testnet").build());
        contract.takedown_event("event-takedown-2".to_string(), BanReason::Other);
    }

    #[test]
    #[should_panic(expected = "Event not found")]
    fn takedown_event_rejects_missing_event() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        testing_env!(context(owner_id.as_str(), "contract.testnet").build());
        contract.takedown_event("does-not-exist".to_string(), BanReason::Other);
    }

    #[test]
    #[should_panic(expected = "already banned or taken down")]
    fn takedown_event_rejects_double_takedown() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());
        seed_event(&mut contract, "event-takedown-3", &owner_id);

        testing_env!(context(owner_id.as_str(), "contract.testnet").build());
        contract.takedown_event("event-takedown-3".to_string(), BanReason::SexualContent);
        contract.takedown_event("event-takedown-3".to_string(), BanReason::SexualContent);
    }

    #[test]
    fn takedown_event_works_while_paused() {
        // Emergency takedown must function even when contract is paused;
        // illegal-content response must not depend on contract liveness.
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());
        seed_event(&mut contract, "event-takedown-4", &owner_id);
        contract.lazy_paused_state().set(&true);

        testing_env!(context(owner_id.as_str(), "contract.testnet").build());
        contract.takedown_event("event-takedown-4".to_string(), BanReason::SexualContent);

        assert!(contract.is_event_banned("event-takedown-4".to_string()));
    }

    #[test]
    fn timelock_executes_trial_pool_withdraw_after_delay() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());
        contract.trial_pool = NearToken::from_near(1);

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000);
        testing_env!(builder.build());
        let id = contract.propose_action(TimelockAction::WithdrawTrialPool {
            amount: U128(NearToken::from_near(1).as_yoctonear()),
        });

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
        testing_env!(builder.build());
        contract.execute_action(id);

        assert_eq!(contract.trial_pool, NearToken::from_yoctonear(0));
    }

    #[test]
    fn create_event_and_buy_ticket_flow() {
        let owner_id = account("owner.testnet");
        let buyer_id = account("buyer.testnet");
        let mut contract = Contract::new(owner_id.clone());

        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(owner_id.clone())
            .attached_deposit(STORAGE_COST_ACCOUNT)
            .build());
        contract.create_event(
            "event-123".to_string(),
            "Test Event".to_string(),
            "Description".to_string(),
            U128(NearToken::from_near(1).as_yoctonear()),
            None,
            None,
            None,
            None,
        );

        let event = contract.get_event("event-123".to_string());
        assert!(event.is_some());

        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(buyer_id.clone())
            .attached_deposit(NearToken::from_near(2))
            .build());
        let token = contract.buy_ticket(buyer_id.clone(), "event-123".to_string());
        assert_eq!(token.owner_id, buyer_id);
    }

    #[test]
    #[should_panic(expected = "Price must be at least 0.001 NEAR")]
    fn minimum_ticket_price_is_enforced() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        testing_env!(context(owner_id.as_str(), "contract.testnet").build());
        contract.create_event(
            "cheap".to_string(),
            "Cheap".to_string(),
            "Too cheap".to_string(),
            U128(1),
            None,
            None,
            None,
            None,
        );
    }

    #[test]
    fn free_event_with_zero_price_is_allowed() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(owner_id.clone())
            .attached_deposit(STORAGE_COST_ACCOUNT)
            .build());
        contract.create_event(
            "free".to_string(),
            "Free".to_string(),
            "No cost".to_string(),
            U128(0),
            None,
            None,
            None,
            None,
        );

        assert!(contract.get_event("free".to_string()).is_some());
    }

    #[test]
    #[should_panic(expected = "Only contract owner can call this method")]
    fn direct_nft_mint_rejects_non_owner() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        testing_env!(context("not-owner.testnet", "contract.testnet").build());
        contract.nft_mint(
            owner_id,
            TokenMetadata {
                title: Some("Test".to_string()),
                description: None,
                media: None,
                media_hash: None,
                copies: None,
                issued_at: None,
                expires_at: None,
                starts_at: None,
                updated_at: None,
                extra: None,
                reference: None,
                reference_hash: None,
            },
            VideoMetadata {
                encrypted_cid: "test".to_string(),
                duration_seconds: 0,
                event_date: None,
                content_type: ContentType::Exclusive,
                nova_group_id: None,
                storage_type: StorageType::Kms,
            },
        );
    }

    #[test]
    #[should_panic(expected = "Ticket transfers disabled for v1")]
    fn nft_transfer_rejects_for_v1() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id);

        testing_env!(context("buyer.testnet", "contract.testnet").build());
        contract.nft_transfer(account("receiver.testnet"), "0".to_string(), None, None);
    }

    #[test]
    #[should_panic(expected = "Only contract owner can call this method")]
    fn add_onboarding_key_rejects_non_owner() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id);

        testing_env!(context("not-owner.testnet", "contract.testnet").build());
        let _ = contract.add_onboarding_key(sample_public_key(12));
    }

    #[test]
    #[should_panic(expected = "Only contract owner can call this method")]
    fn remove_onboarding_key_rejects_non_owner() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id);

        testing_env!(context("not-owner.testnet", "contract.testnet").build());
        let _ = contract.remove_onboarding_key(sample_public_key(13));
    }

    #[cfg(not(feature = "migration"))]
    #[test]
    #[should_panic(expected = "Method disabled outside migration builds")]
    fn wipe_and_reinit_is_disabled_without_migration_feature() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        testing_env!(context(owner_id.as_str(), "contract.testnet").build());
        contract.wipe_and_reinit();
    }

    #[cfg(not(feature = "migration"))]
    #[test]
    #[should_panic(expected = "reset_for_v1_launch is disabled outside migration builds")]
    fn reset_for_v1_launch_is_disabled_without_migration_feature() {
        testing_env!(context("contract.testnet", "contract.testnet").build());
        let _ = Contract::reset_for_v1_launch(None);
    }

    #[cfg(not(feature = "migration"))]
    #[test]
    #[should_panic(expected = "Method disabled outside migration builds")]
    fn test_insert_is_disabled_without_migration_feature() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        testing_env!(context(owner_id.as_str(), "contract.testnet").build());
        contract.test_insert("0".to_string(), owner_id);
    }

    #[test]
    fn stablecoin_purchase_mints_once_and_records_creator_balance() {
        let creator_id = account("creator.testnet");
        let buyer_id = account("buyer.testnet");
        let contract_id = account("contract.testnet");
        let usdc_id = account("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
        let mut contract = Contract::new(creator_id.clone());
        let cid = "usdc-event".to_string();
        let price_usdc = 1_000_000u128;

        contract.events.insert(
            &cid,
            &Event {
                title: "USDC Event".to_string(),
                description: "Paid in USDC".to_string(),
                price: U128(0),
                price_usdc: Some(U128(price_usdc)),
                price_near: None,
                creator_id: creator_id.clone(),
                created_at: 1,
                content_type: ContentType::Exclusive,
            },
        );
        contract.events_price_usdc.insert(&cid, &U128(price_usdc));
        contract.active_event_count = 1;

        testing_env!(context(usdc_id.as_str(), contract_id.as_str()).build());
        let msg = near_sdk::serde_json::json!({
            "action": "buy_ticket",
            "buyer_id": buyer_id,
            "encrypted_cid": cid,
            "payment_id": "deposit-1"
        })
        .to_string();

        let result = contract.ft_on_transfer(buyer_id.clone(), U128(price_usdc + 50_000), msg);
        assert!(matches!(result, PromiseOrValue::Value(U128(0))));
        assert_eq!(contract.tokens.nft_supply_for_owner(&buyer_id).0, 1);
        assert_eq!(
            contract.get_creator_stablecoin_balance(usdc_id.clone(), creator_id),
            U128(980_000)
        );
        assert_eq!(contract.get_usdc_pools(), (U128(10_000), U128(10_000)));
        assert_eq!(
            contract.get_stablecoin_commission_balance(usdc_id.clone()),
            U128(20_000)
        );
        assert!(contract.is_stablecoin_payment_settled(
            usdc_id,
            buyer_id,
            "deposit-1".to_string(),
        ));
    }

    #[test]
    #[should_panic(expected = "payment_id is required")]
    fn stablecoin_purchase_requires_payment_id() {
        let creator_id = account("creator.testnet");
        let buyer_id = account("buyer.testnet");
        let contract_id = account("contract.testnet");
        let usdc_id = account("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
        let mut contract = Contract::new(creator_id.clone());
        let cid = "missing-payment-id-usdc-event".to_string();
        let price_usdc = 1_000_000u128;

        contract.events.insert(
            &cid,
            &Event {
                title: "USDC Event".to_string(),
                description: "Paid in USDC".to_string(),
                price: U128(0),
                price_usdc: Some(U128(price_usdc)),
                price_near: None,
                creator_id,
                created_at: 1,
                content_type: ContentType::Exclusive,
            },
        );
        contract.active_event_count = 1;

        testing_env!(context(usdc_id.as_str(), contract_id.as_str()).build());
        let msg = near_sdk::serde_json::json!({
            "action": "buy_ticket",
            "buyer_id": buyer_id,
            "encrypted_cid": cid
        })
        .to_string();

        let _ = contract.ft_on_transfer(buyer_id, U128(price_usdc), msg);
    }

    #[test]
    #[should_panic(expected = "NEAR price is not configured for this event")]
    fn usdc_only_event_rejects_native_near_purchase() {
        let creator_id = account("creator.testnet");
        let buyer_id = account("buyer.testnet");
        let mut contract = Contract::new(creator_id.clone());
        let cid = "usdc-only-event".to_string();

        contract.events.insert(
            &cid,
            &Event {
                title: "USDC Event".to_string(),
                description: "Paid in USDC".to_string(),
                price: U128(0),
                price_usdc: Some(U128(1_000_000)),
                price_near: None,
                creator_id,
                created_at: 1,
                content_type: ContentType::Exclusive,
            },
        );
        contract.active_event_count = 1;

        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(buyer_id.clone())
            .attached_deposit(STORAGE_COST_NFT)
            .build());
        let _ = contract.buy_ticket(buyer_id, cid);
    }

    #[test]
    #[should_panic(expected = "Stablecoin payment already settled")]
    fn stablecoin_payment_id_cannot_be_used_twice() {
        let creator_id = account("creator.testnet");
        let buyer_id = account("buyer.testnet");
        let contract_id = account("contract.testnet");
        let usdc_id = account("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
        let mut contract = Contract::new(creator_id.clone());
        let cid = "duplicate-usdc-event".to_string();
        let price_usdc = 1_000_000u128;

        contract.events.insert(
            &cid,
            &Event {
                title: "USDC Event".to_string(),
                description: "Paid in USDC".to_string(),
                price: U128(0),
                price_usdc: Some(U128(price_usdc)),
                price_near: None,
                creator_id,
                created_at: 1,
                content_type: ContentType::Exclusive,
            },
        );
        contract.events_price_usdc.insert(&cid, &U128(price_usdc));
        contract.active_event_count = 1;

        let msg = near_sdk::serde_json::json!({
            "action": "buy_ticket",
            "buyer_id": buyer_id,
            "encrypted_cid": cid,
            "payment_id": "deposit-1"
        })
        .to_string();

        testing_env!(context(usdc_id.as_str(), contract_id.as_str()).build());
        let _ = contract.ft_on_transfer(buyer_id.clone(), U128(price_usdc), msg.clone());

        testing_env!(context(usdc_id.as_str(), contract_id.as_str()).build());
        let _ = contract.ft_on_transfer(buyer_id, U128(price_usdc), msg);
    }

    #[test]
    #[should_panic(expected = "Insufficient USDC")]
    fn stablecoin_underpayment_does_not_mint() {
        let creator_id = account("creator.testnet");
        let buyer_id = account("buyer.testnet");
        let contract_id = account("contract.testnet");
        let usdc_id = account("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
        let mut contract = Contract::new(creator_id.clone());
        let cid = "underpaid-usdc-event".to_string();
        let price_usdc = 1_000_000u128;

        contract.events.insert(
            &cid,
            &Event {
                title: "USDC Event".to_string(),
                description: "Paid in USDC".to_string(),
                price: U128(0),
                price_usdc: Some(U128(price_usdc)),
                price_near: None,
                creator_id,
                created_at: 1,
                content_type: ContentType::Exclusive,
            },
        );
        contract.events_price_usdc.insert(&cid, &U128(price_usdc));
        contract.active_event_count = 1;

        testing_env!(context(usdc_id.as_str(), contract_id.as_str()).build());
        let msg = near_sdk::serde_json::json!({
            "action": "buy_ticket",
            "buyer_id": buyer_id,
            "encrypted_cid": cid,
            "payment_id": "deposit-underpaid"
        })
        .to_string();

        let _ = contract.ft_on_transfer(buyer_id, U128(price_usdc - 1), msg);
    }

    #[test]
    fn failed_creator_stablecoin_withdraw_restores_balance() {
        let creator_id = account("creator.testnet");
        let contract_id = account("contract.testnet");
        let usdc_id = account("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
        let mut contract = Contract::new(creator_id.clone());

        testing_env!(
            context(contract_id.as_str(), contract_id.as_str()).build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Failed],
        );
        assert!(!contract.on_creator_stablecoin_withdraw_complete(
            usdc_id.clone(),
            creator_id.clone(),
            U128(100),
        ));
        assert_eq!(
            contract.get_creator_stablecoin_balance(usdc_id, creator_id),
            U128(100)
        );
    }

    #[test]
    #[should_panic(expected = "Only contract owner can call this method")]
    fn direct_create_trial_invite_drop_rejects_non_owner() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        testing_env!(context("not-owner.testnet", "contract.testnet").build());
        contract.create_trial_invite_drop(vec![], None);
    }

    #[test]
    fn timelock_executes_nft_mint_after_delay() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000);
        builder.attached_deposit(NearToken::from_near(1));
        testing_env!(builder.build());
        let id = contract.propose_action(TimelockAction::NftMint {
            receiver_id: owner_id.clone(),
            token_metadata: TokenMetadata {
                title: Some("Test".to_string()),
                description: None,
                media: None,
                media_hash: None,
                copies: None,
                issued_at: None,
                expires_at: None,
                starts_at: None,
                updated_at: None,
                extra: None,
                reference: None,
                reference_hash: None,
            },
            video_metadata: VideoMetadata {
                encrypted_cid: "test".to_string(),
                duration_seconds: 0,
                event_date: None,
                content_type: ContentType::Exclusive,
                nova_group_id: None,
                storage_type: StorageType::Kms,
            },
        });

        let mut builder = context(owner_id.as_str(), "contract.testnet");
        builder.block_timestamp(1_000 + TIMELOCK_DELAY_NS);
        builder.attached_deposit(NearToken::from_near(1));
        testing_env!(builder.build());
        contract.execute_action(id);

        let token = contract.tokens.nft_token(&"0".to_string());
        assert!(token.is_some());
        assert_eq!(token.unwrap().owner_id, owner_id);
    }

    // ═══════════════════════════════════════════════════════════════
    // V11: CONTENT TYPE FILTER TESTS
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn get_events_filters_by_content_type() {
        let owner_id = account("owner.testnet");
        let mut contract = Contract::new(owner_id.clone());

        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(owner_id.clone())
            .attached_deposit(STORAGE_COST_ACCOUNT)
            .build());

        contract.create_event(
            "concert-1".to_string(),
            "Concert".to_string(),
            "Live concert".to_string(),
            U128(NearToken::from_near(1).as_yoctonear()),
            None,
            None,
            None,
            Some("Concert".to_string()),
        );

        contract.create_event(
            "film-1".to_string(),
            "Film".to_string(),
            "A film".to_string(),
            U128(NearToken::from_near(1).as_yoctonear()),
            None,
            None,
            None,
            Some("Cinema".to_string()),
        );

        // No filter returns both
        let all = contract.get_events(None, None, None);
        assert_eq!(all.len(), 2);

        // Concert filter returns only concert
        let concerts = contract.get_events(None, None, Some("Concert".to_string()));
        assert_eq!(concerts.len(), 1);
        assert_eq!(concerts[0].0, "concert-1");

        // Cinema filter returns only film
        let films = contract.get_events(None, None, Some("Cinema".to_string()));
        assert_eq!(films.len(), 1);
        assert_eq!(films[0].0, "film-1");

        // Nonexistent filter returns empty
        let empty = contract.get_events(None, None, Some("Documentary".to_string()));
        assert!(empty.is_empty());
    }

    // ═══════════════════════════════════════════════════════════════
    // V11: CREATOR STATS & PURCHASE LOG TESTS
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn get_creator_stats_sums_purchases() {
        let owner_id = account("owner.testnet");
        let buyer1 = account("buyer1.testnet");
        let buyer2 = account("buyer2.testnet");
        let mut contract = Contract::new(owner_id.clone());

        // Create a paid event
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(owner_id.clone())
            .attached_deposit(STORAGE_COST_ACCOUNT)
            .build());
        contract.create_event(
            "event-paid".to_string(),
            "Paid Event".to_string(),
            "Desc".to_string(),
            U128(NearToken::from_near(1).as_yoctonear()),
            None,
            None,
            None,
            None,
        );

        // Buyer 1 purchases
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(buyer1.clone())
            .attached_deposit(NearToken::from_near(2))
            .build());
        contract.buy_ticket(buyer1.clone(), "event-paid".to_string());

        // Buyer 2 purchases
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(buyer2.clone())
            .attached_deposit(NearToken::from_near(2))
            .build());
        contract.buy_ticket(buyer2.clone(), "event-paid".to_string());

        let stats = contract.get_creator_stats(owner_id.clone());
        assert_eq!(stats.total_sales, 2);
        // 1 NEAR ticket price, ~2% commission, creator gets ~0.98 NEAR each = ~1.96 NEAR total
        assert!(stats.total_revenue_yocto.0 > 0);
    }

    #[test]
    fn get_purchase_logs_by_creator_filters_correctly() {
        let owner1 = account("owner1.testnet");
        let owner2 = account("owner2.testnet");
        let buyer = account("buyer.testnet");

        let mut contract = Contract::new(owner1.clone());

        // Owner1 creates event
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(owner1.clone())
            .attached_deposit(STORAGE_COST_ACCOUNT)
            .build());
        contract.create_event(
            "event-1".to_string(),
            "E1".to_string(),
            "D1".to_string(),
            U128(NearToken::from_near(1).as_yoctonear()),
            None,
            None,
            None,
            None,
        );

        // Buyer purchases from owner1
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(buyer.clone())
            .attached_deposit(NearToken::from_near(2))
            .build());
        contract.buy_ticket(buyer.clone(), "event-1".to_string());

        let owner1_logs = contract.get_purchase_logs_by_creator(owner1.clone(), None, None);
        assert_eq!(owner1_logs.len(), 1);

        let owner2_logs = contract.get_purchase_logs_by_creator(owner2.clone(), None, None);
        assert!(owner2_logs.is_empty());
    }

    // ═══════════════════════════════════════════════════════════════
    // V11: CREATOR PROFILE TESTS
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn set_and_get_creator_profile() {
        let creator_id = account("creator.testnet");
        let mut contract = Contract::new(account("owner.testnet"));

        testing_env!(context(creator_id.as_str(), "contract.testnet").build());
        contract.set_creator_profile(
            Some("Creative Studio".to_string()),
            Some("Independent film and concert recording collective.".to_string()),
            Some("https://studio.test".to_string()),
            Some("@creativestudio".to_string()),
            Some("@creative.studio".to_string()),
            Some("https://avatar.test/img.png".to_string()),
        );

        let profile = contract.get_creator_profile(creator_id.clone());
        assert!(profile.is_some());
        let p = profile.unwrap();
        assert_eq!(p.display_name, Some("Creative Studio".to_string()));
        assert_eq!(
            p.bio,
            Some("Independent film and concert recording collective.".to_string())
        );
        assert_eq!(p.website, Some("https://studio.test".to_string()));
        assert_eq!(p.twitter, Some("@creativestudio".to_string()));
        assert_eq!(p.instagram, Some("@creative.studio".to_string()));
        assert_eq!(
            p.avatar_url,
            Some("https://avatar.test/img.png".to_string())
        );
    }

    #[test]
    fn update_creator_profile_overwrites_previous() {
        let creator_id = account("creator.testnet");
        let mut contract = Contract::new(account("owner.testnet"));

        testing_env!(context(creator_id.as_str(), "contract.testnet").build());
        contract.set_creator_profile(Some("Old Name".to_string()), None, None, None, None, None);

        contract.set_creator_profile(
            Some("New Name".to_string()),
            Some("Updated bio".to_string()),
            None,
            None,
            None,
            None,
        );

        let profile = contract.get_creator_profile(creator_id.clone()).unwrap();
        assert_eq!(profile.display_name, Some("New Name".to_string()));
        assert_eq!(profile.bio, Some("Updated bio".to_string()));
    }

    #[test]
    fn get_creator_profile_returns_none_for_unknown() {
        let contract = Contract::new(account("owner.testnet"));
        let profile = contract.get_creator_profile(account("unknown.testnet"));
        assert!(profile.is_none());
    }
}
