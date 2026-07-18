use super::*;

#[near]
impl Contract {
    pub fn pause(&mut self) {
        self.assert_owner();
        self.pause_timelocked()
    }

    pub(crate) fn pause_timelocked(&mut self) {
        self.lazy_paused_state().set(&true);
        env::log_str("Contract paused");
    }

    /// Unpause the contract (owner only).
    pub fn unpause(&mut self) {
        self.assert_owner();
        self.unpause_timelocked()
    }

    pub(crate) fn unpause_timelocked(&mut self) {
        self.lazy_paused_state().set(&false);
        env::log_str("Contract unpaused");
    }

    /// Start two-step ownership transfer. The proposed owner must accept it.
    pub fn propose_owner(&mut self, proposed_owner_id: AccountId) {
        self.assert_owner();
        self.propose_owner_timelocked(proposed_owner_id)
    }

    pub(crate) fn propose_owner_timelocked(&mut self, proposed_owner_id: AccountId) {
        require!(
            proposed_owner_id != self.tokens.owner_id,
            "Proposed owner must be different"
        );
        Self::set_pending_owner_id(Some(&proposed_owner_id));
        env::log_str(&format!(
            "Ownership transfer proposed to {}",
            proposed_owner_id.as_str()
        ));
    }

    /// Accept a pending ownership transfer.
    pub fn accept_ownership(&mut self) {
        let pending_owner =
            Self::pending_owner_id_internal().expect("No pending ownership transfer");
        require!(
            env::predecessor_account_id() == pending_owner,
            "Only proposed owner can accept ownership"
        );
        self.tokens.owner_id = pending_owner.clone();
        Self::set_pending_owner_id(None);
        env::log_str(&format!(
            "Ownership transferred to {}",
            pending_owner.as_str()
        ));
    }

    pub fn get_owner(&self) -> AccountId {
        self.tokens.owner_id.clone()
    }

    pub fn get_pending_owner(&self) -> Option<AccountId> {
        Self::pending_owner_id_internal()
    }

    /// Propose a timelocked action (owner only).
    /// Returns the proposal ID.
    pub fn propose_action(&mut self, action: TimelockAction) -> u64 {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can propose actions"
        );
        let id = self.next_timelock_id();
        let proposal = TimelockProposal {
            action,
            proposer: env::predecessor_account_id(),
            proposed_at: env::block_timestamp(),
        };
        self.lazy_timelocks().insert(&id, &proposal);
        env::log_str(&format!("Timelock proposal {} created", id));
        id
    }

    /// Execute a timelocked action after delay has passed (owner only).
    pub fn execute_action(&mut self, id: u64) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can execute actions"
        );
        let proposal = self.lazy_timelocks().get(&id).expect("Proposal not found");
        let elapsed = env::block_timestamp().saturating_sub(proposal.proposed_at);
        require!(
            elapsed >= TIMELOCK_DELAY_NS,
            "Timelock delay not yet passed"
        );
        self.lazy_timelocks().remove(&id);
        match proposal.action {
            TimelockAction::WithdrawTrialPool { amount } => {
                let _ = self.withdraw_trial_pool_timelocked(amount);
            }
            TimelockAction::WithdrawCommission { amount } => {
                let _ = self.withdraw_commission_timelocked(amount);
            }
            TimelockAction::WithdrawTrialPoolUsdc { amount } => {
                let _ = self.withdraw_trial_pool_usdc_timelocked(amount);
            }
            TimelockAction::WithdrawCommissionUsdc { amount } => {
                let _ = self.withdraw_commission_usdc_timelocked(amount);
            }
            TimelockAction::AdminRemoveEvents { encrypted_cids } => {
                self.admin_remove_events_timelocked(encrypted_cids);
            }
            TimelockAction::BanEvent {
                encrypted_cid,
                reason,
            } => {
                self.ban_event_timelocked(encrypted_cid, reason);
            }
            TimelockAction::UnbanEvent { encrypted_cid } => {
                self.unban_event_timelocked(encrypted_cid);
            }
            TimelockAction::SetNextTokenId { new_id } => {
                self.set_next_token_id_timelocked(new_id);
            }
            TimelockAction::AddOnboardingKey { public_key } => {
                let pk: PublicKey = public_key.parse().expect("Invalid public key");
                let _ = self.add_onboarding_key_timelocked(pk);
            }
            TimelockAction::RemoveOnboardingKey { public_key } => {
                let pk: PublicKey = public_key.parse().expect("Invalid public key");
                let _ = self.remove_onboarding_key_timelocked(pk);
            }
            TimelockAction::SetOnboardingConfig {
                daily_limit,
                enabled,
            } => {
                self.set_onboarding_config_timelocked(daily_limit, enabled);
            }
            TimelockAction::SetWeb4StaticUrl { url } => {
                self.web4_set_static_url_timelocked(url);
            }
            TimelockAction::Pause => {
                self.pause_timelocked();
            }
            TimelockAction::Unpause => {
                self.unpause_timelocked();
            }
            TimelockAction::ProposeOwner { proposed_owner_id } => {
                self.propose_owner_timelocked(proposed_owner_id);
            }
            TimelockAction::RebuildCidToTokens => {
                self.rebuild_cid_to_tokens_timelocked();
            }
            TimelockAction::CreateTrialInviteDrop {
                public_keys,
                ttl_ms,
            } => {
                let pks: Vec<PublicKey> = public_keys
                    .into_iter()
                    .map(|pk| pk.parse().expect("Invalid public key"))
                    .collect();
                self.create_trial_invite_drop_timelocked(pks, ttl_ms);
            }
            TimelockAction::NftMint {
                receiver_id,
                token_metadata,
                video_metadata,
            } => {
                self.nft_mint_timelocked(receiver_id, token_metadata, video_metadata);
            }
            TimelockAction::WithdrawTokenCommission {
                token_contract,
                amount,
            } => {
                let _ = self.withdraw_token_commission_timelocked(token_contract, amount);
            }
        }
        env::log_str(&format!("Timelock proposal {} executed", id));
    }

    /// Cancel a pending timelock proposal (owner or original proposer).
    pub fn cancel_action(&mut self, id: u64) {
        let proposal = self.lazy_timelocks().get(&id).expect("Proposal not found");
        let caller = env::predecessor_account_id();
        require!(
            caller == self.tokens.owner_id || caller == proposal.proposer,
            "Only owner or proposer can cancel"
        );
        self.lazy_timelocks().remove(&id);
        env::log_str(&format!("Timelock proposal {} cancelled", id));
    }

    /// View a timelock proposal.
    pub fn get_timelock(&self, id: u64) -> Option<TimelockProposal> {
        self.lazy_timelocks().get(&id)
    }

    /// Repair corrupted NFT owner_by_id TreeMap state.
    /// Rebuilds the internal AVL tree from existing val LookupMap entries.
    /// Call this after deploying a fix for near-sdk Vector len desync issues.
    pub fn repair_nft_state(&mut self, max_scan: Option<u64>) {
        self.assert_owner();
        Self::assert_migration_build();

        let next_id = max_scan
            .unwrap_or(self.next_token_id)
            .max(self.next_token_id);
        let actual_max = std::cmp::max(next_id, 1000);
        let mut recovered = 0u64;

        for id in 0..actual_max {
            let token_id = id.to_string();
            if let Some(owner) = self.tokens.owner_by_id.get(&token_id) {
                let owner_clone = owner.clone();
                // Re-insert rebuilds the tree structure while preserving val entries
                self.tokens.owner_by_id.insert(&token_id, &owner_clone);
                recovered += 1;

                // Update next_token_id to be at least id+1
                if id + 1 > self.next_token_id {
                    self.next_token_id = id + 1;
                }
            }
        }

        let supply_after = self.tokens.total_supply;

        env::log_str(&format!(
            "NFT repair complete: recovered {} tokens, total_supply now {}, next_token_id now {}",
            recovered, supply_after, self.next_token_id,
        ));
    }

    /// Wipe ALL contract state and reinitialize with a clean owner.
    /// DESTRUCTIVE: removes all tokens, events, deposits, upload sessions, etc.
    /// Kept only to block older runbooks from accidentally using this path.
    pub fn wipe_and_reinit(&mut self) {
        self.assert_owner();
        Self::assert_migration_build();
        env::panic_str("Use reset_for_v1_launch from a migration build")
    }

    /// Test: insert a single token entry directly into owner_by_id.
    pub fn test_insert(&mut self, token_id: String, owner_id: AccountId) {
        self.assert_owner();
        Self::assert_migration_build();
        self.tokens.owner_by_id.insert(&token_id, &owner_id);
        env::log_str(&format!(
            "Inserted {} → {}, supply now {}",
            token_id, owner_id, self.tokens.total_supply
        ));
    }

    pub fn admin_remove_events(&mut self, encrypted_cids: Vec<String>) {
        self.assert_owner();
        self.admin_remove_events_timelocked(encrypted_cids)
    }

    pub(crate) fn admin_remove_events_timelocked(&mut self, encrypted_cids: Vec<String>) {
        self.assert_not_paused();

        for cid in &encrypted_cids {
            // AE-1 fix: Decrement active_event_count if the event is not already banned
            let is_banned = self.lazy_banned_events().get(cid).is_some();
            self.events.remove(cid);
            self.lazy_banned_events().remove(cid);
            self.lazy_event_price_usd().remove(cid);
            self.events_price_usdc.remove(cid);
            self.lazy_event_access_modes().remove(&cid.to_string());

            // Find and remove associated video_metadata entries via reverse index
            let token_ids_to_remove = self.ticket_ids_for_cid(cid);

            for token_id in &token_ids_to_remove {
                self.remove_ticket_entitlement(token_id, cid);
                self.video_metadata.remove(token_id);
            }
            self.remove_cid_index(cid);

            // AE-1 fix: Only decrement if the event was active (not banned)
            if !is_banned {
                self.active_event_count = self.active_event_count.saturating_sub(1);
            }

            env::log_str(&format!(
                "Removed event {} and {} video entries",
                cid,
                token_ids_to_remove.len()
            ));
        }
    }

    /// Compatibility wrapper for empty/small launch states. Large states must
    /// use `backfill_ticket_indexes` in bounded chunks.
    pub fn rebuild_cid_to_tokens(&mut self) {
        self.assert_owner();
        require!(
            self.next_token_id <= 200,
            "Use bounded ticket index backfill for more than 200 token IDs"
        );
        self.set_ticket_index_ready(false);
        let mut cursor = LazyOption::new(StorageKey::TICKET_BACKFILL_CURSOR, None);
        cursor.set(&0u64);
        self.backfill_ticket_indexes_internal(0, self.next_token_id.max(1));
        self.finish_ticket_index_backfill_internal();
    }

    pub(crate) fn rebuild_cid_to_tokens_timelocked(&mut self) {
        self.rebuild_cid_to_tokens()
    }

    /// Backfill owner, entitlement and CID indexes without an unbounded state
    /// scan. Chunks must be contiguous so finalization can prove coverage.
    pub fn backfill_ticket_indexes(&mut self, from_token_id: u64, limit: u64) -> u64 {
        self.assert_owner();
        self.backfill_ticket_indexes_internal(from_token_id, limit)
    }

    fn backfill_ticket_indexes_internal(&mut self, from_token_id: u64, limit: u64) -> u64 {
        require!(limit > 0 && limit <= 200, "Backfill limit must be 1-200");
        let mut cursor = LazyOption::new(StorageKey::TICKET_BACKFILL_CURSOR, None);
        let expected = cursor.get().unwrap_or(0u64);
        require!(
            from_token_id == expected,
            "Ticket backfill chunk is not contiguous"
        );
        self.set_ticket_index_ready(false);

        let end = from_token_id.saturating_add(limit).min(self.next_token_id);
        for numeric_id in from_token_id..end {
            let token_id = numeric_id.to_string();
            let Some(owner_id) = self.tokens.owner_by_id.get(&token_id) else {
                continue;
            };
            if let Some(metadata) = self.video_metadata.get(&token_id) {
                self.index_ticket(&token_id, &owner_id, &metadata.encrypted_cid);
            } else {
                self.index_ticket_without_metadata(&token_id, &owner_id);
            }
        }
        cursor.set(&end);
        end
    }

    pub fn finish_ticket_index_backfill(&mut self) {
        self.assert_owner();
        self.finish_ticket_index_backfill_internal();
    }

    fn finish_ticket_index_backfill_internal(&mut self) {
        let cursor = LazyOption::new(StorageKey::TICKET_BACKFILL_CURSOR, None)
            .get()
            .unwrap_or(0u64);
        let indexed = LazyOption::new(StorageKey::TICKET_INDEXED_COUNT, None)
            .get()
            .unwrap_or(0u64);
        require!(
            cursor == self.next_token_id,
            "Ticket backfill has remaining IDs"
        );
        require!(
            indexed == self.tokens.total_supply,
            "Ticket backfill count does not match total supply"
        );
        self.set_ticket_index_ready(true);
    }

    pub fn backfill_purchase_indexes(&mut self, from_purchase_id: u64, limit: u64) -> u64 {
        self.assert_owner();
        require!(limit > 0 && limit <= 200, "Backfill limit must be 1-200");
        let mut cursor = LazyOption::new(StorageKey::PURCHASE_BACKFILL_CURSOR, None);
        let expected = cursor.get().unwrap_or(0u64);
        require!(
            from_purchase_id == expected,
            "Purchase backfill chunk is not contiguous"
        );
        self.set_purchase_index_ready(false);

        let end = from_purchase_id
            .saturating_add(limit)
            .min(self.next_purchase_id);
        for purchase_id in from_purchase_id..end {
            if let Some(log) = self.purchase_logs.get(&purchase_id) {
                self.add_purchase_to_indexes(purchase_id, &log);
            }
        }
        cursor.set(&end);
        end
    }

    pub fn finish_purchase_index_backfill(&mut self) {
        self.assert_owner();
        let cursor = LazyOption::new(StorageKey::PURCHASE_BACKFILL_CURSOR, None)
            .get()
            .unwrap_or(0u64);
        require!(
            cursor == self.next_purchase_id,
            "Purchase backfill has remaining IDs"
        );
        self.set_purchase_index_ready(true);
    }
}
