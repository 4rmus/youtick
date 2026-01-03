// contracts/nft-ticket/src/lib.rs
use near_contract_standards::non_fungible_token::{
    metadata::{NFTContractMetadata, TokenMetadata, NFT_METADATA_SPEC},
    NonFungibleToken, Token, TokenId,
};

use near_sdk::{
    borsh::{BorshDeserialize, BorshSerialize},
    collections::{LazyOption, UnorderedMap, LookupMap},
    env, near, require,
    json_types::U128,
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};
use serde::{Deserialize, Serialize};


// SECURITY: Unique storage key prefixes prevent collision attacks
#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    V2(StorageKeyV2),
}

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKeyV2 {
    NonFungibleToken,
    TokenMetadata,
    Enumeration,
    Approval,
    ContractMetadata,
    VideoMetadata,
    UserDeposits,
    Events,
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
    pub encrypted_cid: String,       // Lighthouse encrypted video CID
    pub duration_seconds: u32,       // Video duration
    pub event_date: Option<u64>,     // Event timestamp (concerts, etc)
    pub content_type: ContentType,   // Concert, Cinema, Exclusive
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub enum ContentType {
    Concert,
    Cinema,
    Exclusive,
    LiveEvent,
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
                StorageKey::V2(StorageKeyV2::NonFungibleToken),
                owner_id,
                Some(StorageKey::V2(StorageKeyV2::TokenMetadata)),
                Some(StorageKey::V2(StorageKeyV2::Enumeration)),
                Some(StorageKey::V2(StorageKeyV2::Approval)),
            ),
            metadata: LazyOption::new(
                StorageKey::V2(StorageKeyV2::ContractMetadata),
                Some(&metadata),
            ),
            video_metadata: UnorderedMap::new(StorageKey::V2(StorageKeyV2::VideoMetadata)),
            user_deposits: LookupMap::new(StorageKey::V2(StorageKeyV2::UserDeposits)),
            events: UnorderedMap::new(StorageKey::V2(StorageKeyV2::Events)),
            next_token_id: 0,
        }
    }

    /// Migration function to reset state with completely new storage keys
    /// This creates a fresh start by using new storage prefixes
    #[init(ignore_state)]
    pub fn migrate_state() -> Self {
        let owner_id = env::predecessor_account_id();
        
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
                StorageKey::V2(StorageKeyV2::NonFungibleToken),
                owner_id,
                Some(StorageKey::V2(StorageKeyV2::TokenMetadata)),
                Some(StorageKey::V2(StorageKeyV2::Enumeration)),
                Some(StorageKey::V2(StorageKeyV2::Approval)),
            ),
            metadata: LazyOption::new(
                StorageKey::V2(StorageKeyV2::ContractMetadata),
                Some(&metadata),
            ),
            video_metadata: UnorderedMap::new(StorageKey::V2(StorageKeyV2::VideoMetadata)),
            user_deposits: LookupMap::new(StorageKey::V2(StorageKeyV2::UserDeposits)),
            events: UnorderedMap::new(StorageKey::V2(StorageKeyV2::Events)),
            next_token_id: 0,
        }
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
            let commission = price_yocto * commission_rate / 100;
            let creator_amount = price_yocto - commission;
            
            // Transfer 98% to creator
            // Note: The rest (commission + storage + any excess) stays in contract
            if creator_amount > 0 {
                Promise::new(event.creator_id.clone()).transfer(NearToken::from_yoctonear(creator_amount));
            }
            
            env::log_str(&format!("Ticket sold: {} to creator, {} commission, {} storage", 
                creator_amount, commission, storage_cost.as_yoctonear()));
        } else {
            // Free ticket - just require minimal storage (or contract pays)
            require!(
                deposit >= storage_cost || env::account_balance() > storage_cost,
                "Insufficient deposit for storage"
            );
            env::log_str("Free ticket minted");
        }

        // Mint the NFT
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        let video_metadata = VideoMetadata {
            encrypted_cid: encrypted_cid.clone(),
            duration_seconds: 0,
            event_date: Some(event.created_at),
            content_type: ContentType::Exclusive,
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

        self.tokens.internal_mint(
            token_id.clone(),
            receiver_id,
            Some(token_metadata),
        )
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
            let commission = price_yocto * commission_rate / 100;
            let creator_amount = price_yocto - commission;
            
            // Transfer 98% to creator
            if creator_amount > 0 {
                Promise::new(event.creator_id.clone()).transfer(NearToken::from_yoctonear(creator_amount));
            }
            
            env::log_str(&format!("Prepaid ticket: {} to creator, {} commission", creator_amount, commission));
        }

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

        // Mint the NFT (storage paid by attached deposit from contract)
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        let video_metadata = VideoMetadata {
            encrypted_cid: encrypted_cid.clone(),
            duration_seconds: 0,
            event_date: Some(event.created_at),
            content_type: ContentType::Exclusive,
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

        self.tokens.internal_mint(
            token_id.clone(),
            receiver_id,
            Some(token_metadata),
        )
    }


    // ═══════════════════════════════════════════════════════════════
    // MINTING FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

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
    pub fn withdraw_funds_prepaid(&mut self) -> Promise {
        let account_id = env::predecessor_account_id();
        let current_bal = self.user_deposits.get(&account_id).unwrap_or(NearToken::from_yoctonear(0));
        
        require!(current_bal.as_yoctonear() > 0, "No funds to withdraw");
        
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

    /// Request MPC signature via Proxy (Callable via Session Key)
    pub fn sign_with_mpc(&mut self, payload: [u8; 32], path: String, key_version: u32) -> Promise {
        let account_id = env::predecessor_account_id();
        // MPC cost is usually around 0.05 NEAR to 0.2 NEAR depending on network congestion
        // We charge a safe amount.
        let charge_amount = NearToken::from_millinear(250); // 0.25 NEAR
        
        let current_bal = self.user_deposits.get(&account_id).expect("Insufficient prepaid balance for MPC");
        require!(current_bal.as_yoctonear() >= charge_amount.as_yoctonear(), "Insufficient prepaid balance for MPC");
        
        // Deduct balance
        let new_bal = current_bal.saturating_sub(charge_amount);
        self.user_deposits.insert(&account_id, &new_bal);
        
        // MPC Contract ID
        let mpc_contract: AccountId = "v1.signer-prod.testnet".parse().unwrap();
        
        // Call MPC sign
        // Args: { payload: [u8; 32], path: String, key_version: u32 }
        // We need to serialize args.
        let args = serde_json::json!({
            "request": {
                "payload": payload,
                "path": format!("{}/{}", account_id, path),
                "key_version": key_version
            }
        }).to_string().into_bytes();

        Promise::new(mpc_contract)
            .function_call(
                "sign".to_string(),
                args,
                charge_amount, // Attach the deposit we charged
                near_sdk::Gas::from_tgas(100) // Attach gas
            )
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
}

// ═══════════════════════════════════════════════════════════════════
// NEP-171 IMPLEMENTATION (Required)
// ═══════════════════════════════════════════════════════════════════

near_contract_standards::impl_non_fungible_token_core!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_approval!(Contract, tokens);
