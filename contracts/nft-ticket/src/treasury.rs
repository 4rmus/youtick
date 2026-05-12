use super::*;

#[near]
impl Contract {
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

    pub(crate) fn withdraw_trial_pool_timelocked(&mut self, amount: U128) -> Promise {
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

    pub(crate) fn withdraw_commission_timelocked(&mut self, amount: U128) -> Promise {
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

    pub(crate) fn withdraw_commission_usdc_timelocked(&mut self, amount: U128) -> Promise {
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

    pub(crate) fn withdraw_trial_pool_usdc_timelocked(&mut self, amount: U128) -> Promise {
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
}
