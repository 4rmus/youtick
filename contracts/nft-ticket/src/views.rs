use super::*;

#[near]
impl Contract {
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
        let end = start
            .saturating_add(limit.unwrap_or(50).min(100))
            .min(self.next_purchase_id);
        (start..end)
            .filter_map(|id| self.purchase_logs.get(&id).map(|log| (id, log)))
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
        require!(
            self.purchase_index_ready(),
            "Purchase index migration is not complete"
        );
        let start = from_index.unwrap_or(0);
        let max_results = limit.unwrap_or(50).min(100);
        let count = self
            .lazy_creator_purchase_counts()
            .get(&creator_id)
            .unwrap_or(0);
        let slots = self.lazy_creator_purchase_slots();
        (start..start.saturating_add(max_results).min(count))
            .filter_map(|index| slots.get(&Self::indexed_slot_key(creator_id.as_bytes(), index)))
            .filter_map(|id| self.purchase_logs.get(&id).map(|log| (id, log)))
            .collect()
    }

    /// View: Get creator stats (total sales, total revenue)
    pub fn get_creator_stats(&self, creator_id: AccountId) -> CreatorStats {
        require!(
            self.purchase_index_ready(),
            "Purchase index migration is not complete"
        );
        self.lazy_creator_stats()
            .get(&creator_id)
            .unwrap_or(CreatorStats {
                total_sales: 0,
                total_revenue_yocto: U128(0),
            })
    }

    /// Set creator profile (only callable by the profile owner)
    #[payable]
    pub fn set_creator_profile(
        &mut self,
        display_name: Option<String>,
        bio: Option<String>,
        website: Option<String>,
        twitter: Option<String>,
        instagram: Option<String>,
        avatar_url: Option<String>,
    ) {
        Self::assert_optional_len(
            "display_name",
            display_name.as_deref(),
            MAX_PROFILE_NAME_BYTES,
        );
        Self::assert_optional_len("bio", bio.as_deref(), MAX_PROFILE_BIO_BYTES);
        Self::assert_optional_len("website", website.as_deref(), MAX_URL_BYTES);
        Self::assert_optional_len("twitter", twitter.as_deref(), MAX_SOCIAL_HANDLE_BYTES);
        Self::assert_optional_len("instagram", instagram.as_deref(), MAX_SOCIAL_HANDLE_BYTES);
        Self::assert_optional_len("avatar_url", avatar_url.as_deref(), MAX_URL_BYTES);

        let caller = env::predecessor_account_id();
        let deposit = env::attached_deposit();
        let storage_before = env::storage_usage();
        let profile = CreatorProfile {
            display_name,
            bio,
            website,
            twitter,
            instagram,
            avatar_url,
        };
        self.creator_profiles.insert(&caller, &profile);
        let storage_cost = Self::storage_cost_since(storage_before);
        require!(
            deposit >= storage_cost,
            "Attached deposit does not cover profile storage"
        );
        if deposit > storage_cost {
            Promise::new(caller)
                .transfer(deposit.saturating_sub(storage_cost))
                .as_return();
        }
    }

    /// View: Get creator profile
    pub fn get_creator_profile(&self, creator_id: AccountId) -> Option<CreatorProfile> {
        self.creator_profiles.get(&creator_id)
    }

    /// Get the next token ID (useful for predicting IDs for batch operations)
    pub fn get_next_token_id(&self) -> u64 {
        self.next_token_id
    }
}
