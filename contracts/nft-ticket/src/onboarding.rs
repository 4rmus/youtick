use super::*;

#[near]
impl Contract {
    pub fn add_onboarding_key(&mut self, public_key: PublicKey) -> Promise {
        self.assert_owner();
        self.assert_not_paused();
        self.add_onboarding_key_timelocked(public_key)
    }

    pub(crate) fn add_onboarding_key_timelocked(&mut self, public_key: PublicKey) -> Promise {
        // Store in set
        self.onboarding_keys.insert(&public_key);

        // Add Function Call Access Key to contract
        // Allowance: 10 NEAR for gas (~5000 trial creations at 0.002 NEAR each before rotation needed)
        // Restricted to: direct onboarding functions only (no relayer dependency)
        Promise::new(env::current_account_id()).add_access_key_allowance(
            public_key,
            near_sdk::Allowance::Limited(
                NonZeroU128::new(NearToken::from_near(10).as_yoctonear()).unwrap(),
            ),
            env::current_account_id(),
            "create_sponsored_trial_direct,claim_free_ticket_direct,sponsor_implicit_guest_direct"
                .to_string(),
        )
    }

    /// Remove an onboarding key (owner only)
    pub fn remove_onboarding_key(&mut self, public_key: PublicKey) -> Promise {
        self.assert_owner();
        self.assert_not_paused();
        self.remove_onboarding_key_timelocked(public_key)
    }

    pub(crate) fn remove_onboarding_key_timelocked(&mut self, public_key: PublicKey) -> Promise {
        self.onboarding_keys.remove(&public_key);

        // Delete the access key
        Promise::new(env::current_account_id()).delete_key(public_key)
    }

    /// Update onboarding configuration (owner only)
    pub fn set_onboarding_config(&mut self, daily_limit: u32, enabled: bool) {
        self.assert_owner();
        self.set_onboarding_config_timelocked(daily_limit, enabled)
    }

    pub(crate) fn set_onboarding_config_timelocked(&mut self, daily_limit: u32, enabled: bool) {
        self.onboarding_config = OnboardingConfig {
            daily_limit,
            enabled,
        };
    }

    #[payable]
    pub fn create_trial_invite_drop(&mut self, public_keys: Vec<PublicKey>, ttl_ms: Option<u64>) {
        self.assert_owner();
        self.create_trial_invite_drop_timelocked(public_keys, ttl_ms)
    }

    pub(crate) fn create_trial_invite_drop_timelocked(
        &mut self,
        public_keys: Vec<PublicKey>,
        ttl_ms: Option<u64>,
    ) {
        let num_keys = public_keys.len() as u32;
        require!(
            num_keys > 0 && num_keys <= 10,
            "Must create 1-10 trial invites"
        );

        let invite_storage_cost = STORAGE_COST_INVITE;
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
                        NonZeroU128::new(GAS_FEE_ALLOWANCE.as_yoctonear()).unwrap(),
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
                .as_return();
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
            .as_return();
        env::log_str("Trial invite access key creation failed; refunded reserved deposit.");
        false
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
    pub(crate) fn get_day_timestamp() -> u64 {
        let now_ns = env::block_timestamp();
        let now_s = now_ns / 1_000_000_000; // nanoseconds to seconds
        now_s / 86400 * 86400 // Round to day start
    }

    /// Internal: Check limit and return the day bucket that was incremented.
    pub(crate) fn increment_daily_limit_if_allowed(&mut self) -> Option<u64> {
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
    pub(crate) fn rollback_daily_limit(&mut self, day_timestamp: u64) {
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
}
