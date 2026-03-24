// contracts/nft-ticket/src/lib.rs
use near_contract_standards::non_fungible_token::{
    approval::NonFungibleTokenApproval,
    core::{NonFungibleTokenCore, NonFungibleTokenResolver},
    enumeration::NonFungibleTokenEnumeration,
    metadata::{NFTContractMetadata, TokenMetadata, NFT_METADATA_SPEC},
    NonFungibleToken, Token, TokenId,
};

use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    collections::{LazyOption, LookupMap, LookupSet, UnorderedMap},
    env,
    json_types::{Base64VecU8, U128},
    near, require, AccountId, NearToken, PanicOnDefault, Promise, PromiseOrValue, PublicKey,
};
use std::collections::HashMap;
use std::num::NonZeroU128;

mod migrate;

pub struct StorageKey(pub &'static [u8]);

impl near_sdk::IntoStorageKey for StorageKey {
    fn into_storage_key(self) -> Vec<u8> {
        self.0.to_vec()
    }
}

impl StorageKey {
    pub const NFT: Self = Self(b"n8");
    pub const TOKEN_METADATA: Self = Self(b"m8");
    pub const ENUMERATION: Self = Self(b"e8");
    pub const APPROVAL: Self = Self(b"a8");
    pub const CONTRACT_METADATA: Self = Self(b"c8");
    pub const VIDEO_METADATA: Self = Self(b"v8");
    pub const USER_DEPOSITS: Self = Self(b"d8");
    pub const EVENTS: Self = Self(b"x8");
    pub const GIFT_DROPS: Self = Self(b"g8");
    pub const ONBOARDING_KEYS: Self = Self(b"o8");
    pub const DAILY_TRIAL_COUNTS: Self = Self(b"t8");
    pub const TRIAL_RELAYERS: Self = Self(b"tr8");
    pub const PURCHASE_LOGS: Self = Self(b"p8");
    pub const EVENT_PRICE_USD: Self = Self(b"pu8");
    pub const EVENT_ACCESS_MODES: Self = Self(b"am8");
    pub const BANNED_EVENTS: Self = Self(b"be8");
    pub const UPLOAD_SESSIONS: Self = Self(b"us8");
    pub const TRIAL_INVITES: Self = Self(b"ti8");
}

/// Storage cost constants to avoid repeated allocations
const STORAGE_COST_NFT: NearToken = NearToken::from_millinear(10); // 0.01 NEAR
const STORAGE_COST_ACCOUNT: NearToken = NearToken::from_millinear(100); // 0.1 NEAR
const UPLOAD_SESSION_MAX_TTL_MS: u64 = 15 * 60 * 1000;
const UPLOAD_SESSION_TOTAL_CALLS: u8 = 2;

fn wrap_near_account_id() -> AccountId {
    let current = env::current_account_id();
    if current.as_str().ends_with(".testnet") {
        "wrap.testnet".parse().unwrap()
    } else {
        "wrap.near".parse().unwrap()
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Event {
    pub title: String,
    pub description: String,
    pub price: U128,
    pub creator_id: AccountId,
    pub created_at: u64,
}

/// JSON-only response struct for get_events/get_event.
/// Includes price_usd from separate LookupMap (not stored in Event borsh).
#[near(serializers = [json])]
#[derive(Clone)]
pub struct EventResponse {
    pub title: String,
    pub description: String,
    pub price: U128,
    pub creator_id: AccountId,
    pub created_at: u64,
    pub price_usd: Option<u128>,
    pub access_mode: String,
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
#[derive(Clone)]
pub enum ContentType {
    Concert,
    Cinema,
    Exclusive,
    LiveEvent,
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

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    video_metadata: UnorderedMap<TokenId, VideoMetadata>,
    user_deposits: LookupMap<AccountId, NearToken>,
    events: UnorderedMap<String, Event>, // Key: encrypted_cid (UUID)
    next_token_id: u64,
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
    // V5: Commission tracking pool (50% of 2% commission)
    commission_pool: NearToken,
    // V6: Purchase logs for audit trail and traceability
    purchase_logs: UnorderedMap<u64, PurchaseLog>,
    next_purchase_id: u64,
    // V10: Nova fields removed via state migration (see migrate.rs)
    pub web4_static_url: Option<String>,
}

// SECURITY: Use #[init] to prevent re-initialization attacks
#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        require!(!env::state_exists(), "Already initialized");

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
            tokens: NonFungibleToken::new(
                StorageKey::NFT,
                owner_id,
                Some(StorageKey::TOKEN_METADATA),
                Some(StorageKey::ENUMERATION),
                Some(StorageKey::APPROVAL),
            ),
            metadata: LazyOption::new(StorageKey::CONTRACT_METADATA, Some(&metadata)),
            video_metadata: UnorderedMap::new(StorageKey::VIDEO_METADATA),
            user_deposits: LookupMap::new(StorageKey::USER_DEPOSITS),
            events: UnorderedMap::new(StorageKey::EVENTS),
            next_token_id: 0,
            gift_drops: LookupMap::new(StorageKey::GIFT_DROPS),
            trial_pool: NearToken::from_yoctonear(0),
            onboarding_keys: LookupSet::new(StorageKey::ONBOARDING_KEYS),
            daily_trial_counts: LookupMap::new(StorageKey::DAILY_TRIAL_COUNTS),
            onboarding_config: OnboardingConfig::default(),
            commission_pool: NearToken::from_yoctonear(0),
            purchase_logs: UnorderedMap::new(StorageKey::PURCHASE_LOGS),
            next_purchase_id: 0,
            web4_static_url: None,
        }
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

    fn lazy_trial_relayers(&self) -> LookupSet<AccountId> {
        LookupSet::new(StorageKey::TRIAL_RELAYERS)
    }

    fn normalize_access_mode(&self, access_mode: Option<String>, price_yocto: u128) -> String {
        let raw = access_mode.unwrap_or_else(|| {
            if price_yocto == 0 {
                "public_free".to_string()
            } else {
                "paid".to_string()
            }
        });

        let normalized = raw.trim().to_ascii_lowercase();
        match normalized.as_str() {
            "paid" => {
                require!(price_yocto > 0, "Paid events must have a price greater than zero");
                normalized
            }
            "free_collectible" | "public_free" => {
                require!(price_yocto == 0, "Free access modes require zero price");
                normalized
            }
            _ => env::panic_str("Invalid access mode"),
        }
    }

    fn resolve_event_access_mode(&self, cid: &str, price_yocto: u128) -> String {
        self.lazy_event_access_modes().get(&cid.to_string()).unwrap_or_else(|| {
            if price_yocto == 0 {
                "public_free".to_string()
            } else {
                "paid".to_string()
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

        Promise::new(owner_id.clone()).transfer(amount).detach();
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
        let ban_info = self.lazy_banned_events().get(&cid_string);
        EventResponse {
            title: event.title.clone(),
            description: event.description.clone(),
            price: event.price,
            creator_id: event.creator_id.clone(),
            created_at: event.created_at,
            price_usd,
            access_mode: self.resolve_event_access_mode(&cid_string, event.price.0),
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
        assert_eq!(
            env::predecessor_account_id(),
            self.tokens.owner_id,
            "Only owner can set static URL"
        );
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
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can set next token ID"
        );
        self.next_token_id = new_id;
    }

    // ═══════════════════════════════════════════════════════════════
    // CONTENT MODERATION (BAN/UNBAN) ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Ban an event (owner only). Banned events are hidden from listings
    /// and blocked from purchases, but remain in storage for audit trails.
    pub fn ban_event(&mut self, encrypted_cid: String, reason: BanReason) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can ban events"
        );
        require!(self.events.get(&encrypted_cid).is_some(), "Event not found");

        let ban_info = BanInfo {
            reason: reason.clone(),
            banned_at: env::block_timestamp(),
            banned_by: env::predecessor_account_id(),
        };

        self.lazy_banned_events().insert(&encrypted_cid, &ban_info);
    }

    /// Unban an event (owner only). Restores event to normal listings.
    pub fn unban_event(&mut self, encrypted_cid: String) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can unban events"
        );

        let removed = self.lazy_banned_events().remove(&encrypted_cid);
        require!(removed.is_some(), "Event is not banned");
    }

    /// View: Check if an event is banned (public)
    pub fn is_event_banned(&self, encrypted_cid: String) -> bool {
        self.lazy_banned_events().get(&encrypted_cid).is_some()
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
    pub fn admin_remove_events(&mut self, encrypted_cids: Vec<String>) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can remove events"
        );

        for cid in &encrypted_cids {
            self.events.remove(cid);
            self.lazy_banned_events().remove(cid);
            self.lazy_event_price_usd().remove(cid);
            self.lazy_event_access_modes().remove(&cid.to_string());

            // Find and remove associated video_metadata entries
            // video_metadata is keyed by token_id, so we need to scan
            let token_ids_to_remove: Vec<TokenId> = self
                .video_metadata
                .iter()
                .filter(|(_, meta)| meta.encrypted_cid == *cid)
                .map(|(id, _)| id)
                .collect();

            for token_id in &token_ids_to_remove {
                self.video_metadata.remove(token_id);
            }

            env::log_str(&format!(
                "Removed event {} and {} video entries",
                cid,
                token_ids_to_remove.len()
            ));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // RELAYER-LESS ONBOARDING ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Add an onboarding key (owner only)
    /// This key will be added as a Function Call Access Key to the contract
    /// Authorized to call: create_sponsored_trial_direct
    pub fn add_onboarding_key(&mut self, public_key: PublicKey) -> Promise {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can add onboarding keys"
        );

        // Store in set
        self.onboarding_keys.insert(&public_key);

        // Add Function Call Access Key to contract
        // Allowance: 1 NEAR for gas (enough for many trial creations)
        // Restricted to: create_sponsored_trial_direct only
        Promise::new(env::current_account_id()).add_access_key_allowance(
            public_key,
            near_sdk::Allowance::Limited(
                NonZeroU128::new(NearToken::from_near(1).as_yoctonear()).unwrap(),
            ),
            env::current_account_id(),
            "create_sponsored_trial_direct,claim_free_ticket_direct".to_string(),
        )
    }

    /// Remove an onboarding key (owner only)
    pub fn remove_onboarding_key(&mut self, public_key: PublicKey) -> Promise {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can remove onboarding keys"
        );

        self.onboarding_keys.remove(&public_key);

        // Delete the access key
        Promise::new(env::current_account_id()).delete_key(public_key)
    }

    /// Update onboarding configuration (owner only)
    pub fn set_onboarding_config(&mut self, daily_limit: u32, enabled: bool) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can update onboarding config"
        );

        self.onboarding_config = OnboardingConfig {
            daily_limit,
            enabled,
        };
    }

    #[payable]
    pub fn create_trial_invite_drop(&mut self, public_keys: Vec<PublicKey>, ttl_ms: Option<u64>) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can create trial invites"
        );

        let num_keys = public_keys.len() as u32;
        require!(
            num_keys > 0 && num_keys <= 50,
            "Must create 1-50 trial invites"
        );

        let invite_storage_cost = NearToken::from_millinear(10); // 0.01 NEAR
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
                        NonZeroU128::new(NearToken::from_millinear(50).as_yoctonear()).unwrap(),
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
                .detach();
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
            .detach();
        env::log_str("Trial invite access key creation failed; refunded reserved deposit.");
        false
    }

    /// Add an authorized relayer account for the sponsored trial fallback path.
    pub fn add_trial_relayer(&mut self, account_id: AccountId) {
        require!(
            self.can_manage_trial_relayer(&env::predecessor_account_id()),
            "Only owner can manage trial relayers"
        );
        self.lazy_trial_relayers().insert(&account_id);
    }

    /// Remove an authorized relayer account from the sponsored trial allowlist.
    pub fn remove_trial_relayer(&mut self, account_id: AccountId) {
        require!(
            self.can_manage_trial_relayer(&env::predecessor_account_id()),
            "Only owner can manage trial relayers"
        );
        self.lazy_trial_relayers().remove(&account_id);
    }

    /// View: Check whether an account is authorized to call create_sponsored_trial.
    pub fn is_trial_relayer(&self, account_id: AccountId) -> bool {
        self.lazy_trial_relayers().contains(&account_id)
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

    fn can_manage_trial_relayer(&self, account_id: &AccountId) -> bool {
        self.tokens.owner_id == *account_id
    }

    fn can_create_sponsored_trial(&self, account_id: &AccountId) -> bool {
        self.tokens.owner_id == *account_id || self.lazy_trial_relayers().contains(account_id)
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
        access_mode: Option<String>,
    ) {
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

        let normalized_access_mode = self.normalize_access_mode(access_mode, price.0);

        let event = Event {
            title,
            description,
            price,
            creator_id: env::predecessor_account_id(),
            created_at: env::block_timestamp(),
        };

        self.events.insert(&encrypted_cid, &event);
        self.store_event_access_mode(&encrypted_cid, normalized_access_mode);

        // Store USD price in separate map (backward-compatible)
        if let Some(usd) = price_usd {
            self.lazy_event_price_usd().insert(&encrypted_cid, &usd);
        }
    }

    pub fn get_events(
        &self,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<(String, EventResponse)> {
        let banned = self.lazy_banned_events();
        self.events
            .iter()
            .skip(from_index.map(|v| v.0 as usize).unwrap_or(0))
            .filter(|(cid, _)| banned.get(cid).is_none())
            .take(limit.unwrap_or(50) as usize)
            .map(|(cid, event)| {
                let resp = self.build_event_response(&cid, &event);
                (cid, resp)
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
    ) -> PaginatedEventsResponse {
        let limit = limit.unwrap_or(50).min(100) as usize;
        let banned = self.lazy_banned_events();

        // Count non-banned events for total_count
        let total_count = self
            .events
            .iter()
            .filter(|(cid, _)| banned.get(cid).is_none())
            .count() as u64;

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
            .filter(|(cid, _)| banned.get(cid).is_none())
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

    /// Returns the total number of non-banned events.
    pub fn get_events_count(&self) -> u64 {
        let banned = self.lazy_banned_events();
        self.events
            .iter()
            .filter(|(cid, _)| banned.get(cid).is_none())
            .count() as u64
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
        access_mode: Option<String>,
    ) {
        // SECURITY: Prevent overwriting existing events
        require!(
            self.events.get(&encrypted_cid).is_none(),
            "Event with this CID already exists"
        );

        let normalized_access_mode = self.normalize_access_mode(access_mode, price.0);

        let account_id = env::predecessor_account_id();
        let session_public_key = self.use_upload_session(
            UploadSessionStatus::AwaitingEvent,
            UploadSessionStatus::Completed,
            STORAGE_COST_ACCOUNT,
        );

        // Execute creation
        let event = Event {
            title,
            description,
            price,
            creator_id: account_id,
            created_at: env::block_timestamp(),
        };

        self.events.insert(&encrypted_cid, &event);
        self.store_event_access_mode(&encrypted_cid, normalized_access_mode);

        // Store USD price in separate map (backward-compatible)
        if let Some(usd) = price_usd {
            self.lazy_event_price_usd().insert(&encrypted_cid, &usd);
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
        let event = self.events.get(&encrypted_cid).expect("Event not found");
        require!(
            self.lazy_banned_events().get(&encrypted_cid).is_none(),
            "This event has been banned and tickets cannot be purchased"
        );

        let deposit = env::attached_deposit();
        let required_price = NearToken::from_yoctonear(event.price.0);
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
                    event.price.0,
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
                    .detach();
            }

            // Refund excess deposit to buyer
            let total_used = required_price.saturating_add(storage_cost);
            if deposit > total_used {
                let refund = deposit.saturating_sub(total_used);
                Promise::new(env::predecessor_account_id())
                    .transfer(refund)
                    .detach();
            }
        } else {
            // Free ticket - just require minimal storage (or contract pays)
            require!(
                deposit >= storage_cost || env::account_balance() > storage_cost,
                "Insufficient deposit for storage"
            );
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
            encrypted_cid,
            token.token_id.clone(),
            required_price.as_yoctonear(),
            creator_amount,
            commission,
            purchase_type,
        );

        token
    }

    /// Internal buy ticket function - called via cross-contract call with deposit
    #[payable]
    #[private]
    pub fn buy_ticket_internal(&mut self, receiver_id: AccountId, encrypted_cid: String) -> Token {
        let event = self.events.get(&encrypted_cid).expect("Event not found");
        require!(
            self.lazy_banned_events().get(&encrypted_cid).is_none(),
            "This event has been banned and tickets cannot be purchased"
        );

        // Mint the NFT using helper (storage paid by attached deposit from contract)
        self.internal_mint_ticket(receiver_id, &event, encrypted_cid, false)
    }

    // ═══════════════════════════════════════════════════════════════
    // COMMISSION HELPER
    // ═══════════════════════════════════════════════════════════════

    /// Calculate commission split: 2% total (50% trial pool, 50% commission pool)
    /// Returns (creator_amount, commission_total)
    fn apply_commission(&mut self, price: NearToken) -> (u128, u128) {
        let commission_rate: u128 = 2;
        let price_yocto = price.as_yoctonear();
        let commission = price_yocto * commission_rate / 100;
        let creator_amount = price_yocto - commission;

        // Split commission: 50% to trial pool, 50% to commission pool
        let trial_share = commission / 2;
        let commission_share = commission - trial_share;
        self.trial_pool = self
            .trial_pool
            .saturating_add(NearToken::from_yoctonear(trial_share));
        self.commission_pool = self
            .commission_pool
            .saturating_add(NearToken::from_yoctonear(commission_share));

        (creator_amount, commission)
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
    /// SECURITY: Only contract owner can directly mint NFTs
    #[payable]
    pub fn nft_mint(
        &mut self,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    ) -> Token {
        // SECURITY: Only owner can directly mint
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only contract owner can directly mint NFTs"
        );

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
        let wrap_account = wrap_near_account_id();
        let predecessor = env::predecessor_account_id();
        require!(
            predecessor == wrap_account,
            "Only wNEAR is accepted"
        );

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

        let required_price = NearToken::from_yoctonear(event.price.0);
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
        // near_withdraw on wrap.near burns the wNEAR and sends native NEAR back to this
        // contract via a Promise::Transfer receipt (processed in the next block).
        // The callback then handles payment splitting and NFT minting.

        // Step 1: Call near_withdraw on wrap.near to unwrap wNEAR → native NEAR
        // Step 2: Callback processes the ticket purchase using the unwrapped NEAR
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

        let required_price = NearToken::from_yoctonear(event.price.0);
        let storage_cost = STORAGE_COST_NFT;
        let token =
            self.internal_mint_ticket(buyer_id.clone(), &event, encrypted_cid.clone(), false);

        // Calculate and apply commission (2% platform, 98% creator)
        let (creator_amount, commission) = self.apply_commission(required_price);

        // Transfer 98% to creator
        if creator_amount > 0 {
            Promise::new(event.creator_id.clone())
                .transfer(NearToken::from_yoctonear(creator_amount))
                .detach();
        }

        // Refund excess to buyer (unwrapped NEAR minus total cost)
        let total_used = required_price.saturating_add(storage_cost);
        let received = NearToken::from_yoctonear(wnear_amount.0);
        if received > total_used {
            let refund = received.saturating_sub(total_used);
            Promise::new(buyer_id.clone()).transfer(refund).detach();
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
        let deposit = env::attached_deposit();
        require!(deposit.as_yoctonear() > 0, "Must attach some NEAR");

        self.trial_pool = self.trial_pool.saturating_add(deposit);
    }

    /// Withdraw funds from trial pool (owner only)
    pub fn withdraw_trial_pool(&mut self, amount: U128) -> Promise {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can withdraw from trial pool"
        );

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

        let account_cost = STORAGE_COST_ACCOUNT;
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
                .detach();
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
    /// Cost: ~0.1 NEAR per account from trial pool
    pub fn create_sponsored_trial_direct(
        &mut self,
        username: String,
        new_public_key: PublicKey,
    ) -> Promise {
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
        let account_cost = STORAGE_COST_ACCOUNT;

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
        let day_timestamp = self.increment_daily_limit_if_allowed().unwrap_or_else(|| {
            env::panic_str("Daily limit reached. Please try again tomorrow.")
        });

        // Verify event exists, is not banned, and is free
        let event = self.events.get(&encrypted_cid).expect("Event not found");
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

        self.trial_pool = self.trial_pool.saturating_add(
            NearToken::from_yoctonear(storage_cost.0),
        );
        self.rollback_daily_limit(rollback_day_timestamp);

        env::log_str("Free ticket claim failed; refunded trial pool and rolled back daily limit.");
        false
    }

    /// Create a sponsored trial account as a subaccount of this contract
    /// Contract pays the cost from trial pool!
    /// Creates: {username}.{contract_id} (e.g. "alice.youtick.near")
    /// Cost: ~0.1 NEAR per account from trial pool
    ///
    /// NOTE: This is the original relayer-based method. For relayer-less onboarding,
    /// use create_sponsored_trial_direct with an onboarding key.
    pub fn create_sponsored_trial(
        &mut self,
        username: String,
        new_public_key: PublicKey,
    ) -> Promise {
        // SECURITY: Only contract owner or an explicitly authorized relayer can call this path.
        let caller = env::predecessor_account_id();
        require!(
            self.can_create_sponsored_trial(&caller),
            "Only owner or authorized relayer can create sponsored trials"
        );

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
        let account_cost = STORAGE_COST_ACCOUNT;

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

    pub fn sponsor_implicit_guest(&mut self, new_public_key: PublicKey) -> Promise {
        require!(
            self.onboarding_config.enabled,
            "Onboarding is currently disabled"
        );

        let caller = env::predecessor_account_id();
        require!(
            self.can_create_sponsored_trial(&caller),
            "Only owner or authorized relayer can sponsor guest accounts"
        );

        let day_timestamp = self.increment_daily_limit_if_allowed().unwrap_or_else(|| {
            env::panic_str("Daily trial limit reached. Please try again tomorrow.")
        });

        let account_cost = STORAGE_COST_ACCOUNT;
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
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can withdraw commission"
        );

        let withdraw_amount = NearToken::from_yoctonear(amount.0);
        require!(
            self.commission_pool >= withdraw_amount,
            "Insufficient commission pool balance"
        );

        self.commission_pool = self.commission_pool.saturating_sub(withdraw_amount);

        Promise::new(env::predecessor_account_id()).transfer(withdraw_amount)
    }

    /// Claim a FREE ticket - Contract pays storage from trial_pool!
    /// This allows trial accounts and any user to claim free content
    /// without needing any NEAR balance.
    ///
    /// SECURITY: Only contract owner (or relayer) can call this
    pub fn claim_free_ticket_sponsored(
        &mut self,
        receiver_id: AccountId,
        encrypted_cid: String,
    ) -> Promise {
        let caller = env::predecessor_account_id();
        require!(
            self.can_create_sponsored_trial(&caller),
            "Only owner or authorized relayer can call sponsored free ticket claims"
        );

        let event = self.events.get(&encrypted_cid).expect("Event not found");
        require!(
            self.lazy_banned_events().get(&encrypted_cid).is_none(),
            "This event has been banned and tickets cannot be claimed"
        );

        // Verify this is actually a free ticket
        require!(
            event.price.0 == 0,
            "This ticket is not free. Use buy_ticket for paid tickets."
        );
        require!(
            self.resolve_event_access_mode(&encrypted_cid, event.price.0) != "paid",
            "This event is not claimable as free content."
        );

        // Storage cost for minting
        let storage_cost = STORAGE_COST_NFT;

        require!(
            self.trial_pool >= storage_cost,
            "Trial pool empty. Cannot sponsor free ticket claim."
        );

        // Deduct from trial pool
        self.trial_pool = self.trial_pool.saturating_sub(storage_cost);

        // Call internal minting with rollback callback on failure
        Self::ext(env::current_account_id())
            .with_attached_deposit(storage_cost)
            .buy_ticket_internal(receiver_id, encrypted_cid)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(5))
                    .on_sponsored_free_ticket_complete(
                        U128::from(storage_cost.as_yoctonear()),
                    ),
            )
    }

    #[private]
    pub fn on_sponsored_free_ticket_complete(
        &mut self,
        storage_cost: U128,
    ) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if succeeded {
            return true;
        }

        self.trial_pool = self.trial_pool.saturating_add(
            NearToken::from_yoctonear(storage_cost.0),
        );

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
        match self.tokens.nft_token(token_id) {
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
            .nft_tokens_for_owner(account_id, from_index, limit);

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

    /// Get the next token ID (useful for predicting IDs for batch operations)
    pub fn get_next_token_id(&self) -> u64 {
        self.next_token_id
    }

    /// Gift a ticket to a receiver (commission-free minting for creators)
    /// Creator pays storage cost, no commission taken
    /// SECURITY: Requires deposit for storage (0.01 NEAR)
    #[payable]
    pub fn gift_ticket(&mut self, receiver_id: AccountId, encrypted_cid: String) -> Token {
        let event = self.events.get(&encrypted_cid).expect("Event not found");

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
        let num_keys = public_keys.len() as u32;
        require!(num_keys > 0 && num_keys <= 50, "Must create 1-50 keys");

        // Verify event exists
        let event = self.events.get(&event_cid).expect("Event not found");
        require!(
            self.lazy_banned_events().get(&event_cid).is_none(),
            "This event has been banned and gift drops cannot be created"
        );

        // Creator must own the event
        require!(
            env::predecessor_account_id() == event.creator_id,
            "Only event creator can create gift drops"
        );

        // Cost per claim: account creation + NFT storage + buffer
        let deposit_per_claim = NearToken::from_millinear(150); // 0.15 NEAR
        let total_required = deposit_per_claim.saturating_mul(num_keys as u128);

        require!(
            env::attached_deposit() >= total_required,
            &format!("Requires {} NEAR for {} keys", total_required, num_keys)
        );

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
                        NonZeroU128::new(NearToken::from_millinear(50).as_yoctonear()).unwrap(),
                    ),
                    env::current_account_id(),
                    "claim_gift,claim_gift_and_create_account".to_string(),
                )
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(near_sdk::Gas::from_tgas(20))
                        .on_gift_access_key_added(pk, gift_drop),
                )
                .detach();
        }
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
            .detach();
        env::log_str("Gift access key creation failed; refunded reserved deposit.");
        false
    }

    /// Claim a gift - creates trial account and mints NFT
    /// Called by the recipient using the Linkdrop Access Key
    #[payable]
    pub fn claim_gift(&mut self, receiver_id: AccountId) -> Token {
        // Identify the drop via the Signer's Public Key
        let signer_pk: String = String::from(&env::signer_account_pk());

        let mut gift_drop = self
            .gift_drops
            .get(&signer_pk)
            .expect("Invalid or already claimed gift key");

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
        let token = self.internal_mint_ticket(receiver_id, &event, gift_drop.event_cid, true);

        gift_drop.remaining_claims = 0;
        self.gift_drops.remove(&signer_pk);
        Promise::new(env::current_account_id())
            .delete_key(env::signer_account_pk())
            .detach();

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
        // Identify the drop via the Signer's Public Key
        let signer_public_key = env::signer_account_pk();
        let signer_pk: String = String::from(&signer_public_key);

        let mut gift_drop = self
            .gift_drops
            .get(&signer_pk)
            .expect("Invalid or already claimed gift key");

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

        // Account creation costs ~0.1 NEAR + access key storage ~0.0075 NEAR
        let account_creation_cost = NearToken::from_millinear(110); // 0.11 NEAR

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
            .detach();
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
        let tokens_map = match &self.tokens.tokens_per_owner {
            Some(map) => map,
            None => return vec![],
        };

        let tokens = match tokens_map.get(&account_id) {
            Some(set) => set,
            None => return vec![],
        };

        tokens
            .iter()
            .filter_map(|token_id| {
                self.video_metadata
                    .get(&token_id)
                    .map(|metadata| (token_id.clone(), metadata))
            })
            .collect()
    }

    /// Check if an account has a ticket for a specific video (identified by encrypted_cid)
    /// Used by KMS Worker for access authorization
    pub fn has_ticket(&self, account_id: AccountId, encrypted_cid: String) -> bool {
        let tokens_map = match &self.tokens.tokens_per_owner {
            Some(map) => map,
            None => return false,
        };

        let tokens = match tokens_map.get(&account_id) {
            Some(set) => set,
            None => return false,
        };

        let result = tokens.iter().any(|token_id| {
            self.video_metadata
                .get(&token_id)
                .map_or(false, |metadata| {
                    metadata.encrypted_cid == encrypted_cid
                        || metadata.encrypted_cid == "ACCESS_PASS"
                })
        });
        result
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
            deposit_per_claim: U128(NearToken::from_millinear(150).as_yoctonear()),
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
            deposit_per_claim: U128(NearToken::from_millinear(150).as_yoctonear()),
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
            U128(NearToken::from_millinear(10).as_yoctonear()),
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
            creator_id: owner_id.clone(),
            created_at: 1,
        };
        let paid_event = Event {
            title: "Paid".to_string(),
            description: "Premium".to_string(),
            price: U128(NearToken::from_near(1).as_yoctonear()),
            creator_id: owner_id,
            created_at: 1,
        };

        assert_eq!(
            contract.build_event_response("free-cid", &free_event).access_mode,
            "public_free"
        );
        assert_eq!(
            contract.build_event_response("paid-cid", &paid_event).access_mode,
            "paid"
        );
    }

    #[test]
    fn sponsor_implicit_guest_deducts_trial_pool() {
        let owner_id = account("owner.testnet");
        let relayer_id = account("relayer.testnet");
        let contract_id = account("contract.testnet");
        let mut contract = Contract::new(owner_id);
        contract.trial_pool = STORAGE_COST_ACCOUNT;
        contract.lazy_trial_relayers().insert(&relayer_id);

        testing_env!(context(relayer_id.as_str(), contract_id.as_str()).build());

        let _ = contract.sponsor_implicit_guest(sample_public_key(11));

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
            U128(STORAGE_COST_ACCOUNT.as_yoctonear()),
            Some(day_timestamp),
        ));
        assert_eq!(contract.trial_pool, STORAGE_COST_ACCOUNT);
        assert_eq!(contract.get_daily_trial_count(), 0);
    }
}

// ═══════════════════════════════════════════════════════════════════
// NEP-171 IMPLEMENTATION (Required)
// ═══════════════════════════════════════════════════════════════════

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.tokens
            .nft_transfer(receiver_id, token_id, approval_id, memo);
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.tokens
            .nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<std::collections::HashMap<AccountId, u64>>,
    ) -> bool {
        self.tokens.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id,
            approved_account_ids,
        )
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens
            .nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenApproval for Contract {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id);
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id);
    }

    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.tokens
            .nft_is_approved(token_id, approved_account_id, approval_id)
    }
}
