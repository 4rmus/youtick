use super::*;

#[near]
impl Contract {
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
                    "claim_gift,claim_gift_and_create_account,claim_gift_with_implicit_account"
                        .to_string(),
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
}
