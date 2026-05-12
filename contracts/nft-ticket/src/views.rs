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
}
