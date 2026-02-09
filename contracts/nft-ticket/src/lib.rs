// contracts/nft-ticket/src/lib.rs
use near_contract_standards::non_fungible_token::{
    metadata::{NFTContractMetadata, TokenMetadata, NFT_METADATA_SPEC},
    NonFungibleToken, Token, TokenId,
};

use near_sdk::{
    collections::{LazyOption, UnorderedMap, LookupMap, LookupSet},
    env, near, require,
    json_types::U128,
    AccountId, NearToken, PanicOnDefault, Promise, PromiseOrValue, PublicKey,
};
use std::num::NonZeroU128;


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
    pub const PURCHASE_LOGS: Self = Self(b"p8");
    pub const EVENT_NOVA_GROUPS: Self = Self(b"ng8");
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

// Custom video metadata for token-gated content
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct VideoMetadata {
    pub encrypted_cid: String,       // IPFS CID (NOVA encrypted)
    pub duration_seconds: u32,       // Video duration
    pub event_date: Option<u64>,     // Event timestamp (concerts, etc)
    pub content_type: ContentType,   // Concert, Cinema, Exclusive
    // NOVA integration fields
    pub nova_group_id: Option<String>,  // NOVA group ID for access control
    pub storage_type: StorageType,      // Storage/encryption method
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub enum ContentType {
    Concert,
    Cinema,
    Exclusive,
    LiveEvent,
}

// Storage/encryption type
#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq)]
pub enum StorageType {
    Nova,         // NOVA Secure File-Sharing (encrypted_cid is CID, nova_group_id present)
}

// NEW: Gift drop for trial account creation
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct GiftDrop {
    pub creator_id: AccountId,
    pub event_cid: String,
    pub remaining_claims: u32,
    pub deposit_per_claim: U128,  // Amount reserved for each claim
    pub created_at: u64,
}

// Onboarding configuration
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct OnboardingConfig {
    pub daily_limit: u32,           // Max trials per day (0 = unlimited)
    pub enabled: bool,              // Master switch for relayer-less onboarding
}

impl Default for OnboardingConfig {
    fn default() -> Self {
        Self {
            daily_limit: 100,  // Default: 100 trials per day
            enabled: true,
        }
    }
}

// Purchase type for audit trail
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub enum PurchaseType {
    Direct,   // buy_ticket (attached deposit)
    Prepaid,  // buy_ticket_prepaid (session key)
    Free,     // price == 0
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

/// Old contract state V4 (before commission_pool was added)
/// Used for state migration from V4 → V5
#[near(serializers=[borsh])]
#[derive(PanicOnDefault)]
pub struct OldContractV4 {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    video_metadata: UnorderedMap<TokenId, VideoMetadata>,
    user_deposits: LookupMap<AccountId, NearToken>,
    events: UnorderedMap<String, Event>,
    next_token_id: u64,
    gift_drops: LookupMap<String, GiftDrop>,
    trial_pool: NearToken,
    onboarding_keys: LookupSet<PublicKey>,
    daily_trial_counts: LookupMap<u64, u32>,
    onboarding_config: OnboardingConfig,
}

/// Old contract state V5 (before purchase_logs was added)
/// Used for state migration from V5 → V6
#[near(serializers=[borsh])]
#[derive(PanicOnDefault)]
pub struct OldContractV5 {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    video_metadata: UnorderedMap<TokenId, VideoMetadata>,
    user_deposits: LookupMap<AccountId, NearToken>,
    events: UnorderedMap<String, Event>,
    next_token_id: u64,
    gift_drops: LookupMap<String, GiftDrop>,
    trial_pool: NearToken,
    onboarding_keys: LookupSet<PublicKey>,
    daily_trial_counts: LookupMap<u64, u32>,
    onboarding_config: OnboardingConfig,
    commission_pool: NearToken,
}

/// Old contract state V6 (before event_nova_groups was added)
/// Used for state migration from V6 → V7
#[near(serializers=[borsh])]
#[derive(PanicOnDefault)]
pub struct OldContractV6 {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    video_metadata: UnorderedMap<TokenId, VideoMetadata>,
    user_deposits: LookupMap<AccountId, NearToken>,
    events: UnorderedMap<String, Event>,
    next_token_id: u64,
    gift_drops: LookupMap<String, GiftDrop>,
    trial_pool: NearToken,
    onboarding_keys: LookupSet<PublicKey>,
    daily_trial_counts: LookupMap<u64, u32>,
    onboarding_config: OnboardingConfig,
    commission_pool: NearToken,
    purchase_logs: UnorderedMap<u64, PurchaseLog>,
    next_purchase_id: u64,
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
    // V7: Event CID → Nova Group ID mapping for ticket copies
    event_nova_groups: LookupMap<String, String>,
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
            metadata: LazyOption::new(
                StorageKey::CONTRACT_METADATA,
                Some(&metadata),
            ),
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
            event_nova_groups: LookupMap::new(StorageKey::EVENT_NOVA_GROUPS),
        }
    }

    /// Migrate state V6 → V7: Add event_nova_groups LookupMap
    /// Preserves all existing data and adds the new mapping
    #[private]
    #[init(ignore_state)]
    pub fn migrate_state() -> Self {
        let old_state: OldContractV6 = env::state_read().expect("Failed to read old state");
        env::log_str("State migration V6 -> V7: Adding event_nova_groups");

        Self {
            tokens: old_state.tokens,
            metadata: old_state.metadata,
            video_metadata: old_state.video_metadata,
            user_deposits: old_state.user_deposits,
            events: old_state.events,
            next_token_id: old_state.next_token_id,
            gift_drops: old_state.gift_drops,
            trial_pool: old_state.trial_pool,
            onboarding_keys: old_state.onboarding_keys,
            daily_trial_counts: old_state.daily_trial_counts,
            onboarding_config: old_state.onboarding_config,
            commission_pool: old_state.commission_pool,
            purchase_logs: old_state.purchase_logs,
            next_purchase_id: old_state.next_purchase_id,
            event_nova_groups: LookupMap::new(StorageKey::EVENT_NOVA_GROUPS),
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
        let old_id = self.next_token_id;
        self.next_token_id = new_id;
        env::log_str(&format!("next_token_id updated: {} -> {}", old_id, new_id));
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

        env::log_str(&format!("Onboarding key added: {:?}", public_key));

        // Add Function Call Access Key to contract
        // Allowance: 1 NEAR for gas (enough for many trial creations)
        // Restricted to: create_sponsored_trial_direct only
        Promise::new(env::current_account_id()).add_access_key_allowance(
            public_key,
            near_sdk::Allowance::Limited(NonZeroU128::new(NearToken::from_near(1).as_yoctonear()).unwrap()),
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

        env::log_str(&format!("Onboarding key removed: {:?}", public_key));

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

        env::log_str(&format!(
            "Onboarding config updated: daily_limit={}, enabled={}",
            daily_limit, enabled
        ));
    }

    /// View: Check if a key is authorized for onboarding
    pub fn is_onboarding_key(&self, public_key: PublicKey) -> bool {
        self.onboarding_keys.contains(&public_key)
    }

    /// View: Get onboarding configuration
    pub fn get_onboarding_config(&self) -> OnboardingConfig {
        self.onboarding_config.clone()
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

    /// Internal: Check and increment daily trial count
    fn check_and_increment_daily_limit(&mut self) -> bool {
        let today = Self::get_day_timestamp();
        let current_count = self.daily_trial_counts.get(&today).unwrap_or(0);

        // Check limit (0 = unlimited)
        if self.onboarding_config.daily_limit > 0
            && current_count >= self.onboarding_config.daily_limit {
            return false;
        }

        // Increment count
        self.daily_trial_counts.insert(&today, &(current_count + 1));
        true
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
    pub fn create_event(&mut self, encrypted_cid: String, title: String, description: String, price: U128) {
        let deposit = env::attached_deposit();
        require!(
            deposit >= NearToken::from_millinear(100), // 0.1 NEAR
            "Requires at least 0.1 NEAR deposit to create an event"
        );

        let event = Event {
            title,
            description,
            price,
            creator_id: env::predecessor_account_id(),
            created_at: env::block_timestamp(),
        };

        self.events.insert(&encrypted_cid, &event);
    }

    pub fn get_events(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<(String, Event)> {
        self.events.iter().skip(from_index.map(|v| v.0 as usize).unwrap_or(0)).take(limit.unwrap_or(50) as usize).collect()
    }

    pub fn get_event(&self, encrypted_cid: String) -> Option<Event> {
        self.events.get(&encrypted_cid)
    }

    /// Create an event using prepaid funds (Callable via Session Key)
    pub fn create_event_prepaid(&mut self, encrypted_cid: String, title: String, description: String, price: U128) {
        let account_id = env::predecessor_account_id();
        let charge_amount = NearToken::from_millinear(100); // 0.1 NEAR for storage

        let current_bal = self.user_deposits.get(&account_id).expect("Insufficient prepaid balance for event creation");
        require!(current_bal.as_yoctonear() >= charge_amount.as_yoctonear(), "Insufficient prepaid balance for event creation");

        // Deduct balance
        let new_bal = current_bal.saturating_sub(charge_amount);
        self.user_deposits.insert(&account_id, &new_bal);

        // Execute creation
        let event = Event {
            title,
            description,
            price,
            creator_id: account_id,
            created_at: env::block_timestamp(),
        };

        self.events.insert(&encrypted_cid, &event);
    }

    /// Purchase a ticket (mint NFT) for an event
    /// - Free tickets (price=0): Contract pays storage, user pays nothing
    /// - Paid tickets: 2% commission to contract, 98% to creator
    ///
    /// IMPORTANT: This function keeps deposits in contract balance and only
    /// explicitly transfers to creator. No automatic refund to buyer.
    #[payable]
    pub fn buy_ticket(&mut self, receiver_id: AccountId, encrypted_cid: String) -> Token {
        let event = self.events.get(&encrypted_cid)
            .expect("Event not found");

        let deposit = env::attached_deposit();
        let required_price = NearToken::from_yoctonear(event.price.0);
        let is_free = required_price.as_yoctonear() == 0;

        // Storage cost for NFT (safe upper bound)
        let storage_cost = NearToken::from_millinear(10); // 0.01 NEAR

        // Track amounts for purchase log
        let mut creator_amount: u128 = 0;
        let mut commission: u128 = 0;

        if !is_free {
            // Paid ticket - require full payment plus minimal storage
            let min_deposit = required_price.saturating_add(storage_cost);
            require!(
                deposit >= min_deposit,
                &format!("Insufficient deposit. Required: {} yoctoNEAR (price) + {} (storage)",
                    event.price.0, storage_cost.as_yoctonear())
            );

            // Calculate commission (2% to contract, 98% to creator)
            let commission_rate: u128 = 2;
            let price_yocto = required_price.as_yoctonear();
            commission = price_yocto * commission_rate / 100;
            creator_amount = price_yocto - commission;

            // Split commission: 50% to trial pool, 50% to commission pool
            let trial_share = commission / 2;
            let commission_share = commission - trial_share;
            self.trial_pool = self.trial_pool.saturating_add(NearToken::from_yoctonear(trial_share));
            self.commission_pool = self.commission_pool.saturating_add(NearToken::from_yoctonear(commission_share));

            // Transfer 98% to creator
            // Note: The rest (storage + any excess) stays in contract
            if creator_amount > 0 {
                Promise::new(event.creator_id.clone())
                    .transfer(NearToken::from_yoctonear(creator_amount))
                    .detach();
            }

            env::log_str(&format!("Ticket sold: {} to creator, {} trial_pool, {} commission_pool, {} storage",
                creator_amount, trial_share, commission_share, storage_cost.as_yoctonear()));

            // Refund excess deposit to buyer
            let total_used = required_price.saturating_add(storage_cost);
            if deposit > total_used {
                let refund = deposit.saturating_sub(total_used);
                Promise::new(env::predecessor_account_id())
                    .transfer(refund)
                    .detach();
                env::log_str(&format!("Refunded {} excess to buyer", refund.as_yoctonear()));
            }
        } else {
            // Free ticket - just require minimal storage (or contract pays)
            require!(
                deposit >= storage_cost || env::account_balance() > storage_cost,
                "Insufficient deposit for storage"
            );
            env::log_str("Free ticket minted");
        }

        // Mint the NFT using helper
        let token = self.internal_mint_ticket(receiver_id.clone(), &event, encrypted_cid.clone(), false);

        // Log purchase for audit trail
        let purchase_type = if is_free { PurchaseType::Free } else { PurchaseType::Direct };
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

    /// Purchase a ticket using prepaid balance (Callable via Session Key)
    /// For paid tickets: deducts price + storage from user's prepaid balance
    /// For free tickets (price=0): contract pays storage, user pays nothing
    /// Returns a Promise that resolves to the minted Token
    pub fn buy_ticket_prepaid(&mut self, receiver_id: AccountId, encrypted_cid: String) -> Promise {
        let account_id = env::predecessor_account_id();
        let event = self.events.get(&encrypted_cid)
            .expect("Event not found");

        let required_price = NearToken::from_yoctonear(event.price.0);
        let storage_cost = NearToken::from_millinear(10); // 0.01 NEAR
        let is_free = required_price.as_yoctonear() == 0;

        // Track amounts for purchase log
        let mut creator_amount: u128 = 0;
        let mut commission: u128 = 0;

        if is_free {
            // FREE TICKET: Contract pays storage, user pays nothing
            env::log_str("Free ticket - contract sponsors storage");
        } else {
            // PAID TICKET: Deduct from user's prepaid balance
            let total_cost = required_price.saturating_add(storage_cost);

            let current_bal = self.user_deposits.get(&account_id)
                .expect("No prepaid balance. Call deposit_funds first.");
            require!(
                current_bal >= total_cost,
                &format!("Insufficient prepaid balance. Required: {} yoctoNEAR, Have: {} yoctoNEAR",
                    total_cost.as_yoctonear(), current_bal.as_yoctonear())
            );

            // Deduct total cost from user's balance
            let new_bal = current_bal.saturating_sub(total_cost);
            self.user_deposits.insert(&account_id, &new_bal);

            // Calculate commission (2% to contract, 98% to creator)
            let commission_rate: u128 = 2;
            let price_yocto = required_price.as_yoctonear();
            commission = price_yocto * commission_rate / 100;
            creator_amount = price_yocto - commission;

            // Split commission: 50% to trial pool, 50% to commission pool
            let trial_share = commission / 2;
            let commission_share = commission - trial_share;
            self.trial_pool = self.trial_pool.saturating_add(NearToken::from_yoctonear(trial_share));
            self.commission_pool = self.commission_pool.saturating_add(NearToken::from_yoctonear(commission_share));

            // Transfer 98% to creator
            if creator_amount > 0 {
                Promise::new(event.creator_id.clone())
                    .transfer(NearToken::from_yoctonear(creator_amount))
                    .detach();
            }

            env::log_str(&format!("Prepaid ticket: {} to creator, {} trial_pool, {} commission_pool",
                creator_amount, trial_share, commission_share));
        }

        // Log purchase for audit trail (use next_token_id as expected token_id)
        let purchase_type = if is_free { PurchaseType::Free } else { PurchaseType::Prepaid };
        self.log_purchase(
            account_id,
            event.creator_id.clone(),
            encrypted_cid.clone(),
            self.next_token_id.to_string(),
            required_price.as_yoctonear(),
            creator_amount,
            commission,
            purchase_type,
        );

        // Call buy_ticket internally with storage deposit from contract balance
        // This ensures the NFT minting has proper storage deposit attached
        Self::ext(env::current_account_id())
            .with_attached_deposit(storage_cost)
            .buy_ticket_internal(receiver_id, encrypted_cid)
    }

    /// Internal buy ticket function - called via cross-contract call with deposit
    #[payable]
    #[private]
    pub fn buy_ticket_internal(&mut self, receiver_id: AccountId, encrypted_cid: String) -> Token {
        let event = self.events.get(&encrypted_cid)
            .expect("Event not found");

        // Mint the NFT using helper (storage paid by attached deposit from contract)
        self.internal_mint_ticket(receiver_id, &event, encrypted_cid, false)
    }


    // ═══════════════════════════════════════════════════════════════
    // MINTING FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Internal helper to mint a ticket NFT
    /// Consolidates duplicated minting logic across buy_ticket, claim_gift, etc.
    /// Automatically copies nova_group_id from event-level mapping
    fn internal_mint_ticket(
        &mut self,
        receiver_id: AccountId,
        event: &Event,
        event_cid: String,
        is_gift: bool,
    ) -> Token {
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        // Look up nova_group_id from event-level mapping (set during creator's nft_mint)
        let nova_group_id = self.event_nova_groups.get(&event_cid);

        let video_metadata = VideoMetadata {
            encrypted_cid: event_cid.clone(),
            duration_seconds: 0,
            event_date: Some(event.created_at),
            content_type: ContentType::Exclusive,
            nova_group_id,
            storage_type: StorageType::Nova,
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

        self.tokens.internal_mint(token_id.clone(), receiver_id, Some(token_metadata))
    }

    /// Backfill nova_group_id for existing tokens (migration helper)
    /// Reads nova_group_id from the master token and stores in event_nova_groups mapping
    /// Also updates all ticket copies for the same event_cid
    /// Only callable by contract owner
    pub fn backfill_nova_groups(&mut self) -> u32 {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can backfill nova groups"
        );

        let mut backfilled: u32 = 0;

        // Phase 1: Index all nova_group_id from existing master tokens into event_nova_groups
        let keys: Vec<TokenId> = self.video_metadata.keys().collect();
        for token_id in &keys {
            if let Some(metadata) = self.video_metadata.get(token_id) {
                if let Some(ref group_id) = metadata.nova_group_id {
                    // Store in event-level mapping if not already present
                    if self.event_nova_groups.get(&metadata.encrypted_cid).is_none() {
                        self.event_nova_groups.insert(&metadata.encrypted_cid, group_id);
                        env::log_str(&format!(
                            "Indexed: event {} -> group {} (from token {})",
                            metadata.encrypted_cid, group_id, token_id
                        ));
                    }
                }
            }
        }

        // Phase 2: Fix all tokens that have nova_group_id = None but have a mapping
        for token_id in &keys {
            if let Some(mut metadata) = self.video_metadata.get(token_id) {
                if metadata.nova_group_id.is_none() {
                    if let Some(group_id) = self.event_nova_groups.get(&metadata.encrypted_cid) {
                        metadata.nova_group_id = Some(group_id.clone());
                        self.video_metadata.insert(token_id, &metadata);
                        backfilled += 1;
                        env::log_str(&format!(
                            "Backfilled token {} with group {} (event {})",
                            token_id, group_id, metadata.encrypted_cid
                        ));
                    }
                }
            }
        }

        env::log_str(&format!("Backfill complete: {} tokens updated", backfilled));
        backfilled
    }

    /// Mint a new video NFT ticket
    /// SECURITY: Requires 1 yoctoNEAR deposit to prevent accidental calls
    #[payable]
    pub fn nft_mint(
        &mut self,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    ) -> Token {
        // SECURITY: Require minimum deposit
        require!(
            env::attached_deposit() >= NearToken::from_yoctonear(1),
            "Requires attached deposit of at least 1 yoctoNEAR"
        );

        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        // Store nova_group_id in event-level mapping for ticket copies
        if let Some(ref group_id) = video_metadata.nova_group_id {
            self.event_nova_groups.insert(&video_metadata.encrypted_cid, group_id);
            env::log_str(&format!(
                "Nova group {} indexed for event {}",
                group_id, video_metadata.encrypted_cid
            ));
        }

        // Store video metadata
        self.video_metadata.insert(&token_id, &video_metadata);

        // Mint NFT using standard
        self.tokens.internal_mint(
            token_id.clone(),
            receiver_id,
            Some(token_metadata),
        )
    }

    // ═══════════════════════════════════════════════════════════════
    // PREPAID PROXY FUNCTIONS (Session Key Support)
    // ═══════════════════════════════════════════════════════════════

    /// Deposit funds into the "Gas Tank" for Session Key usage
    #[payable]
    pub fn deposit_funds(&mut self) {
        let amount = env::attached_deposit();
        let account_id = env::predecessor_account_id();

        let current_bal = self.user_deposits.get(&account_id).unwrap_or(NearToken::from_yoctonear(0));
        // NearToken addition
        let new_bal = current_bal.saturating_add(amount);

        self.user_deposits.insert(&account_id, &new_bal);

        env::log_str(&format!("Deposited {} for {}", amount, account_id));
    }

    /// Deposit funds for a SPECIFIC account (used by Keypom for trial accounts)
    /// This allows third parties to fund prepaid gas for new users
    #[payable]
    pub fn deposit_funds_for(&mut self, account_id: AccountId) {
        let amount = env::attached_deposit();

        let current_bal = self.user_deposits.get(&account_id).unwrap_or(NearToken::from_yoctonear(0));
        let new_bal = current_bal.saturating_add(amount);

        self.user_deposits.insert(&account_id, &new_bal);

        env::log_str(&format!("Deposited {} for {} (by {})", amount, account_id, env::predecessor_account_id()));
    }


    /// Withdraw all prepaid funds for the caller
    #[payable]
    pub fn withdraw_funds(&mut self) -> Promise {
        // 1 yocto deposit for security
        require!(env::attached_deposit() >= NearToken::from_yoctonear(1), "Requires 1 yoctoNEAR deposit");

        let account_id = env::predecessor_account_id();
        let current_bal = self.user_deposits.get(&account_id).unwrap_or(NearToken::from_yoctonear(0));

        require!(current_bal.as_yoctonear() > 0, "No funds to withdraw");

        // Remove balance (Effects first)
        self.user_deposits.remove(&account_id);

        env::log_str(&format!("Withdrawing {} for {}", current_bal, account_id));

        // Transfer funds (Interactions last)
        Promise::new(account_id).transfer(current_bal)
    }

    /// Withdraw prepaid funds - Callable via Session Key (no deposit required)
    /// This enables signless refund functionality for users
    /// P0 Security Fix: Limited to 0.1 NEAR max to prevent session key abuse
    pub fn withdraw_funds_prepaid(&mut self) -> Promise {
        let account_id = env::predecessor_account_id();
        let current_bal = self.user_deposits.get(&account_id).unwrap_or(NearToken::from_yoctonear(0));

        require!(current_bal.as_yoctonear() > 0, "No funds to withdraw");

        // P0 Security: Limit signless withdrawals to prevent session key abuse
        let max_signless_withdraw = NearToken::from_millinear(100); // 0.1 NEAR
        require!(
            current_bal <= max_signless_withdraw,
            "Amount exceeds signless limit (0.1 NEAR). Use withdraw_funds with wallet signature for larger amounts."
        );

        // Remove balance (Effects first)
        self.user_deposits.remove(&account_id);

        env::log_str(&format!("Signless withdraw: {} for {}", current_bal, account_id));

        // Transfer funds (Interactions last)
        Promise::new(account_id).transfer(current_bal)
    }

    /// Check user's internal balance
    pub fn get_user_balance(&self, account_id: AccountId) -> U128 {
        let val = self.user_deposits.get(&account_id).unwrap_or(NearToken::from_yoctonear(0));
        U128(val.as_yoctonear())
    }

    /// Mint NFT using pre-paid funds (Callable via Session Key)
    pub fn nft_mint_prepaid(
        &mut self,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    ) -> Promise {
        let account_id = env::predecessor_account_id();

        // Estimated storage cost for an NFT (approx 0.1 NEAR is safe upper bound, usually less)
        // We can be more precise, but for now let's use a safe fixed amount.
        // Standard NFT storage is ~0.01 NEAR.
        // Let's charge 0.1 NEAR to be safe and refund the rest?
        // Or just charge a fixed fee.
        // `nft_mint` will refund excess to the *predecessor* (which is the Contract).
        // So the user loses the excess if we don't handle it.

        // BETTER: Charge the user exactly what we attach.
        // If `nft_mint` refunds the Contract, we should ideally credit it back to the user's internal balance.
        // But that requires a callback.

        // SIMPLIFICATION: Charge a flat fee of 0.1 NEAR.
        let charge_amount = NearToken::from_millinear(100); // 0.1 NEAR

        let current_bal = self.user_deposits.get(&account_id).expect("Insufficient prepaid balance");
        require!(current_bal.as_yoctonear() >= charge_amount.as_yoctonear(), "Insufficient prepaid balance");

        // Deduct balance
        let new_bal = current_bal.saturating_sub(charge_amount);
        self.user_deposits.insert(&account_id, &new_bal);

        // Call nft_mint with attached deposit
        Self::ext(env::current_account_id())
            .with_attached_deposit(charge_amount)
            .nft_mint(receiver_id, token_metadata, video_metadata)
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

        env::log_str(&format!(
            "Trial pool funded: {} added, total: {}",
            deposit, self.trial_pool
        ));
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

        env::log_str(&format!(
            "Trial pool withdraw: {} removed, remaining: {}",
            withdraw_amount, self.trial_pool
        ));

        Promise::new(env::predecessor_account_id()).transfer(withdraw_amount)
    }

    /// RELAYER-LESS: Create a sponsored trial account directly from client
    ///
    /// This function can ONLY be called via an onboarding Function Call Access Key.
    /// Anti-abuse measures:
    /// 1. Signer's public key must be in `onboarding_keys`
    /// 2. Daily rate limit enforced
    /// 3. Onboarding must be enabled
    ///
    /// Creates: {username}.{contract_id} (e.g. "alice.youtick-prod-v1.near")
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
        require!(
            self.check_and_increment_daily_limit(),
            "Daily trial limit reached. Please try again tomorrow."
        );

        // Validate username
        require!(
            username.len() >= 2 && username.len() <= 32,
            "Username must be 2-32 characters"
        );
        require!(
            username.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-'),
            "Username can only contain lowercase letters, numbers, - and _"
        );

        // Cost for account creation + initial balance
        let account_cost = NearToken::from_millinear(100); // 0.1 NEAR

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

        env::log_str(&format!(
            "Relayer-less trial created: {} (pool remaining: {}, daily count: {})",
            new_account_id,
            self.trial_pool,
            self.daily_trial_counts.get(&Self::get_day_timestamp()).unwrap_or(0)
        ));

        // Create the subaccount with Full Access Key
        Promise::new(new_account_id)
            .create_account()
            .add_full_access_key(new_public_key)
            .transfer(account_cost)
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
        require!(self.onboarding_config.enabled, "Onboarding is currently disabled");

        // Verify signer is authorized onboarding key
        let signer_pk = env::signer_account_pk();
        require!(
            self.onboarding_keys.contains(&signer_pk),
            "Unauthorized: Signer's key is not an onboarding key"
        );

        // Daily rate limiting
        require!(
            self.check_and_increment_daily_limit(),
            "Daily limit reached. Please try again tomorrow."
        );

        // Verify event exists and is free
        let event = self.events.get(&encrypted_cid).expect("Event not found");
        require!(event.price.0 == 0, "This ticket is not free. Use buy_ticket instead.");

        // Storage cost
        let storage_cost = NearToken::from_millinear(10); // 0.01 NEAR
        require!(self.trial_pool >= storage_cost, "Trial pool empty.");

        // Deduct from trial pool
        self.trial_pool = self.trial_pool.saturating_sub(storage_cost);

        env::log_str(&format!(
            "Direct free ticket: {} for {} (pool: {})",
            receiver_id, encrypted_cid, self.trial_pool
        ));

        // Mint via internal call with storage deposit
        Self::ext(env::current_account_id())
            .with_attached_deposit(storage_cost)
            .buy_ticket_internal(receiver_id, encrypted_cid)
    }

    /// Create a sponsored trial account as a subaccount of this contract
    /// Contract pays the cost from trial pool!
    /// Creates: {username}.{contract_id} (e.g. "alice.youtick-prod-v1.near")
    /// Cost: ~0.1 NEAR per account from trial pool
    ///
    /// NOTE: This is the original relayer-based method. For relayer-less onboarding,
    /// use create_sponsored_trial_direct with an onboarding key.
    pub fn create_sponsored_trial(
        &mut self,
        username: String,
        new_public_key: PublicKey,
    ) -> Promise {
        // Validate username
        require!(
            username.len() >= 2 && username.len() <= 32,
            "Username must be 2-32 characters"
        );
        require!(
            username.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-'),
            "Username can only contain lowercase letters, numbers, - and _"
        );

        // Cost for account creation + initial balance
        let account_cost = NearToken::from_millinear(100); // 0.1 NEAR

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

        env::log_str(&format!(
            "Sponsored trial: {} (pool remaining: {})",
            new_account_id, self.trial_pool
        ));

        // Create the subaccount with Full Access Key
        Promise::new(new_account_id)
            .create_account()
            .add_full_access_key(new_public_key)
            .transfer(account_cost)
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

        env::log_str(&format!(
            "Commission withdrawn: {} removed, remaining: {}",
            withdraw_amount, self.commission_pool
        ));

        Promise::new(env::predecessor_account_id()).transfer(withdraw_amount)
    }

    /// Claim a FREE ticket - Contract pays storage from trial_pool!
    /// This allows trial accounts and any user to claim free content
    /// without needing any NEAR balance.
    ///
    /// Can be called by anyone (usually via relayer API)
    pub fn claim_free_ticket_sponsored(
        &mut self,
        receiver_id: AccountId,
        encrypted_cid: String,
    ) -> Promise {
        let event = self.events.get(&encrypted_cid)
            .expect("Event not found");

        // Verify this is actually a free ticket
        require!(
            event.price.0 == 0,
            "This ticket is not free. Use buy_ticket for paid tickets."
        );

        // Storage cost for minting
        let storage_cost = NearToken::from_millinear(10); // 0.01 NEAR

        require!(
            self.trial_pool >= storage_cost,
            "Trial pool empty. Cannot sponsor free ticket claim."
        );

        // Deduct from trial pool
        self.trial_pool = self.trial_pool.saturating_sub(storage_cost);

        env::log_str(&format!(
            "Sponsored free ticket claim for {} (pool remaining: {})",
            receiver_id, self.trial_pool
        ));

        // Call internal minting with storage from contract
        Self::ext(env::current_account_id())
            .with_attached_deposit(storage_cost)
            .buy_ticket_internal(receiver_id, encrypted_cid)
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
        let tokens = self.tokens.nft_tokens_for_owner(
            account_id,
            from_index,
            limit,
        );

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
    pub fn get_purchase_logs(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<(u64, PurchaseLog)> {
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
    pub fn gift_ticket(
        &mut self,
        receiver_id: AccountId,
        encrypted_cid: String,
    ) -> Token {
        let event = self.events.get(&encrypted_cid)
            .expect("Event not found");

        // Verify caller is the event creator
        require!(
            env::predecessor_account_id() == event.creator_id,
            "Only event creator can gift tickets"
        );

        // Require storage deposit
        let storage_cost = NearToken::from_millinear(10); // 0.01 NEAR
        require!(
            env::attached_deposit() >= storage_cost,
            "Requires at least 0.01 NEAR for storage"
        );

        // Mint the NFT (no commission)
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        // Look up nova_group_id from event-level mapping
        let nova_group_id = self.event_nova_groups.get(&encrypted_cid);

        let video_metadata = VideoMetadata {
            encrypted_cid: encrypted_cid.clone(),
            duration_seconds: 0,
            event_date: Some(event.created_at),
            content_type: ContentType::Exclusive,
            nova_group_id,
            storage_type: StorageType::Nova,
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

        env::log_str(&format!("Gift ticket minted: {} -> {}", token_id, receiver_id));

        self.tokens.internal_mint(
            token_id.clone(),
            receiver_id,
            Some(token_metadata),
        )
    }

    // ═══════════════════════════════════════════════════════════════
    // GIFT DROP FUNCTIONS (Replaces Keypom)
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // GIFT DROP FUNCTIONS (Access Key Based)
    // ═══════════════════════════════════════════════════════════════

    /// Create a gift drop - adds Access Keys for claiming
    /// Returns nothing (keys are generated client-side)
    /// DEPOSIT: 0.15 NEAR per key (account creation + NFT storage)
    #[payable]
    pub fn create_gift_drop(
        &mut self,
        event_cid: String,
        public_keys: Vec<near_sdk::PublicKey>,
    ) {
        let num_keys = public_keys.len() as u32;
        require!(num_keys > 0 && num_keys <= 50, "Must create 1-50 keys");

        // Verify event exists
        let event = self.events.get(&event_cid)
            .expect("Event not found");

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

        for pk in public_keys {
            // Store gift drop info mapped to the Public Key
            let pk_str: String = String::from(&pk);

            let gift_drop = GiftDrop {
                creator_id: event.creator_id.clone(),
                event_cid: event_cid.clone(),
                remaining_claims: 1,
                deposit_per_claim: U128(deposit_per_claim.as_yoctonear()),
                created_at: env::block_timestamp(),
            };

            self.gift_drops.insert(&pk_str, &gift_drop);

            // Add Function Call Access Key to THIS contract
            // This allows the holder of the Private Key to call claim functions
            // Allowance: 0.05 NEAR for gas fees (enough for claim tx)
            Promise::new(env::current_account_id())
                .add_access_key_allowance(
                    pk,
                    near_sdk::Allowance::Limited(NonZeroU128::new(NearToken::from_millinear(50).as_yoctonear()).unwrap()),
                    env::current_account_id(),
                    "claim_gift,claim_gift_and_create_account".to_string(),
                )
                .detach();
        }

        env::log_str(&format!(
            "Gift drop created: {} keys for event {} by {}",
            num_keys, event_cid, event.creator_id
        ));
    }

    /// Claim a gift - creates trial account and mints NFT
    /// Called by the recipient using the Linkdrop Access Key
    #[payable]
    pub fn claim_gift(
        &mut self,
        receiver_id: AccountId,
    ) -> Token {
        // Identify the drop via the Signer's Public Key
        let signer_pk: String = String::from(&env::signer_account_pk());

        let mut gift_drop = self.gift_drops.get(&signer_pk)
            .expect("Invalid or already claimed gift key");

        require!(gift_drop.remaining_claims > 0, "Gift already claimed");

        // Mark as claimed and cleanup
        gift_drop.remaining_claims = 0;
        self.gift_drops.remove(&signer_pk); // Remove from map

        // DELETE the Access Key to prevent reuse
        Promise::new(env::current_account_id())
            .delete_key(env::signer_account_pk())
            .detach();

        // Get event details for NFT metadata
        let event = self.events.get(&gift_drop.event_cid)
            .expect("Event not found");

        env::log_str(&format!(
            "Gift claimed: -> {} (event: {})",
            receiver_id, gift_drop.event_cid
        ));

        // Mint NFT using helper (is_gift = true for "Gift ticket:" prefix)
        self.internal_mint_ticket(receiver_id, &event, gift_drop.event_cid, true)
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
        self.gift_drops.get(&public_key).map(|drop| {
            (drop.event_cid, drop.creator_id)
        })
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
        let signer_pk: String = String::from(&env::signer_account_pk());

        let mut gift_drop = self.gift_drops.get(&signer_pk)
            .expect("Invalid or already claimed gift key");

        require!(gift_drop.remaining_claims > 0, "Gift already claimed");

        // Mark as claimed and cleanup
        gift_drop.remaining_claims = 0;
        self.gift_drops.remove(&signer_pk); // Remove from map

        // DELETE the Access Key to prevent reuse
        Promise::new(env::current_account_id())
            .delete_key(env::signer_account_pk())
            .detach();

        // Account creation costs ~0.1 NEAR + access key storage ~0.0075 NEAR
        let account_creation_cost = NearToken::from_millinear(110); // 0.11 NEAR

        env::log_str(&format!(
            "Creating account {} for gift claim (event: {})",
            new_account_id, gift_drop.event_cid
        ));

        // Create new account and add full access key
        // Then callback to mint the NFT
        // Leave 0.01 NEAR for NFT storage in callback
        let nft_storage_cost = NearToken::from_millinear(10); // 0.01 NEAR for NFT storage

        Promise::new(new_account_id.clone())
            .create_account()
            .transfer(account_creation_cost)
            .add_full_access_key(new_public_key)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(50))
                    .with_attached_deposit(nft_storage_cost)
                    .on_account_created(
                        new_account_id,
                        gift_drop.event_cid,
                    )
            )
    }

    /// Callback after account creation - mints the NFT
    #[payable]
    #[private]
    pub fn on_account_created(
        &mut self,
        receiver_id: AccountId,
        event_cid: String,
    ) -> Token {
        // Check if account creation succeeded
        #[allow(deprecated)]
        match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(_) => {
                // Account created successfully, now mint NFT
                let event = self.events.get(&event_cid)
                    .expect("Event not found");

                env::log_str(&format!(
                    "Gift NFT minted: -> {} (event: {})",
                    receiver_id, event_cid
                ));

                // Mint NFT using helper (is_gift = true for "Gift ticket:" prefix)
                self.internal_mint_ticket(receiver_id, &event, event_cid, true)
            }
            _ => {
                env::panic_str("Account creation failed. The account may already exist.");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // TRIAL ACCOUNT UPGRADE (Contract-sponsored)
    // ═══════════════════════════════════════════════════════════════

    /// Upgrade a trial account by adding a Full Access Key
    /// Gas is paid by the contract, not the trial user
    /// Can only be called by the trial account itself
    pub fn upgrade_trial_account(
        &mut self,
        new_public_key: near_sdk::PublicKey,
    ) -> Promise {
        let caller = env::predecessor_account_id();

        // Verify caller is a sub-account of this contract (trial account pattern)
        let contract_id = env::current_account_id().to_string();
        require!(
            caller.to_string().ends_with(&format!(".{}", contract_id)),
            "Only trial sub-accounts can upgrade via this method"
        );

        env::log_str(&format!(
            "Upgrading trial account {} with new FAK",
            caller
        ));

        // Add Full Access Key to the caller's account
        // This is a cross-contract call where the contract sponsors the gas
        Promise::new(caller)
            .add_full_access_key(new_public_key)
    }

    // ═══════════════════════════════════════════════════════════════
    // NOVA SECURE FILE-SHARING INTEGRATION
    // ═══════════════════════════════════════════════════════════════

    /// Set NOVA group ID for existing video (migration helper)
    /// Only callable by video owner
    /// Also stores in event_nova_groups mapping for future ticket copies
    pub fn set_nova_group(&mut self, token_id: TokenId, nova_group_id: String) {
        let owner = self.tokens.owner_by_id.get(&token_id)
            .expect("Token not found");

        require!(
            env::predecessor_account_id() == owner,
            "Only token owner can set NOVA group"
        );

        let mut metadata = self.video_metadata.get(&token_id)
            .expect("Video metadata not found");

        // Store in event-level mapping for ticket copies
        self.event_nova_groups.insert(&metadata.encrypted_cid, &nova_group_id);

        metadata.nova_group_id = Some(nova_group_id.clone());
        metadata.storage_type = StorageType::Nova;
        self.video_metadata.insert(&token_id, &metadata);

        env::log_str(&format!(
            "NOVA group {} set for token {} (event {})",
            nova_group_id, token_id, metadata.encrypted_cid
        ));
    }

    /// Get NOVA group ID for a video
    pub fn get_nova_group(&self, token_id: TokenId) -> Option<String> {
        self.video_metadata.get(&token_id)
            .and_then(|metadata| metadata.nova_group_id.clone())
    }

    /// Get storage type for a video
    pub fn get_storage_type(&self, token_id: TokenId) -> Option<StorageType> {
        self.video_metadata.get(&token_id)
            .map(|metadata| metadata.storage_type.clone())
    }

    /// Get all NOVA videos for an account
    /// Returns vector of (token_id, video_metadata) pairs
    pub fn get_nova_videos(&self, account_id: AccountId) -> Vec<(TokenId, VideoMetadata)> {
        // Get tokens_per_owner if it exists
        let tokens_map = match &self.tokens.tokens_per_owner {
            Some(map) => map,
            None => return vec![], // No tokens at all
        };

        let tokens = match tokens_map.get(&account_id) {
            Some(set) => set,
            None => return vec![], // Account has no tokens
        };

        tokens.iter()
            .filter_map(|token_id| {
                self.video_metadata.get(&token_id)
                    .filter(|metadata| metadata.storage_type == StorageType::Nova)
                    .map(|metadata| (token_id.clone(), metadata))
            })
            .collect()
    }

}

// ═══════════════════════════════════════════════════════════════════
// NEP-171 IMPLEMENTATION (Required)
// ═══════════════════════════════════════════════════════════════════

near_contract_standards::impl_non_fungible_token_core!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_approval!(Contract, tokens);
