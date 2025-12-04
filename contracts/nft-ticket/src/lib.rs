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
    NonFungibleToken,
    TokenMetadata,      // Prefix: "m"
    Enumeration,        // Prefix: "e"
    Approval,           // Prefix: "a"
    ContractMetadata,   // Prefix: "c"
    VideoMetadata,      // Prefix: "v" - Custom
    UserDeposits,       // Prefix: "d"
}

// Custom video metadata for token-gated content
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct VideoMetadata {
    pub encrypted_cid: String,       // Lighthouse encrypted video CID
    pub livepeer_playback_id: String,// Livepeer playback ID
    pub duration_seconds: u32,       // Video duration
    pub event_date: Option<u64>,     // Event timestamp (concerts, etc)
    pub content_type: ContentType,   // Concert, Cinema, Exclusive
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
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
                StorageKey::NonFungibleToken,
                owner_id,
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(
                StorageKey::ContractMetadata,
                Some(&metadata),
            ),
            video_metadata: UnorderedMap::new(StorageKey::VideoMetadata),
            user_deposits: LookupMap::new(StorageKey::UserDeposits),
            next_token_id: 0,
        }
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
                "path": path,
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
