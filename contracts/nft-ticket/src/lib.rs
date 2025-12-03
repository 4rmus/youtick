// contracts/nft-ticket/src/lib.rs
use near_contract_standards::non_fungible_token::{
    metadata::{NFTContractMetadata, TokenMetadata, NFT_METADATA_SPEC},
    NonFungibleToken, Token, TokenId,
};

use near_sdk::{
    borsh::{BorshDeserialize, BorshSerialize},
    collections::{LazyOption, UnorderedMap},
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
