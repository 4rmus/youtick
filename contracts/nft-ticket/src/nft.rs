use super::*;

/// Minimal NFT storage — replaces near-contract-standards::NonFungibleToken.
/// Uses only LookupMap (no TreeMap/Vector) to avoid near-sdk collections::Vector len desync bugs.
#[near(serializers = [borsh])]
pub struct YtNft {
    pub owner_id: AccountId,
    pub(crate) owner_by_id: LookupMap<TokenId, AccountId>,
    pub(crate) total_supply: u64,
    pub(crate) token_metadata_by_id: LookupMap<TokenId, TokenMetadata>,
    pub(crate) tokens_per_owner: LookupMap<AccountId, Vec<TokenId>>,
    pub(crate) approvals_by_id: LookupMap<TokenId, HashMap<AccountId, u64>>,
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

    #[allow(dead_code)]
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

    #[allow(dead_code)]
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

    #[allow(dead_code)]
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

#[near]
impl Contract {
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
