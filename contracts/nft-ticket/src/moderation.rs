use super::*;

#[near]
impl Contract {
    pub fn set_next_token_id(&mut self, new_id: u64) {
        self.assert_owner();
        self.set_next_token_id_timelocked(new_id);
    }

    pub(crate) fn set_next_token_id_timelocked(&mut self, new_id: u64) {
        require!(
            new_id >= self.next_token_id,
            "New token ID must be greater than or equal to current next token ID"
        );
        self.next_token_id = new_id;
    }

    // ═══════════════════════════════════════════════════════════════
    // CONTENT MODERATION (BAN/UNBAN) ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Ban an event (owner only). Banned events are hidden from listings
    /// and blocked from purchases, but remain in storage for audit trails.
    pub fn ban_event(&mut self, encrypted_cid: String, reason: BanReason) {
        self.assert_owner();
        self.ban_event_timelocked(encrypted_cid, reason)
    }

    pub(crate) fn ban_event_timelocked(&mut self, encrypted_cid: String, reason: BanReason) {
        self.assert_not_paused();
        require!(self.events.get(&encrypted_cid).is_some(), "Event not found");

        let ban_info = BanInfo {
            reason: reason.clone(),
            banned_at: env::block_timestamp(),
            banned_by: env::predecessor_account_id(),
        };

        require!(
            self.lazy_banned_events().get(&encrypted_cid).is_none(),
            "Event is already banned"
        );
        self.lazy_banned_events().insert(&encrypted_cid, &ban_info);
        // Event banned — decrement active counter for O(1) get_events_count
        self.active_event_count = self.active_event_count.saturating_sub(1);
    }

    /// Unban an event (owner only). Restores event to normal listings.
    pub fn unban_event(&mut self, encrypted_cid: String) {
        self.assert_owner();
        self.unban_event_timelocked(encrypted_cid)
    }

    pub(crate) fn unban_event_timelocked(&mut self, encrypted_cid: String) {
        self.assert_not_paused();

        let removed = self.lazy_banned_events().remove(&encrypted_cid);
        require!(removed.is_some(), "Event is not banned");
        // Event unbanned — increment active counter for O(1) get_events_count
        self.active_event_count = self.active_event_count.saturating_add(1);
    }

    /// View: Check if an event is banned (public)
    pub fn is_event_banned(&self, encrypted_cid: String) -> bool {
        self.lazy_banned_events().get(&encrypted_cid).is_some()
    }

    /// Emergency takedown (owner only, NO timelock).
    ///
    /// Intended for illegal content (CSAM, non-consensual sexual content,
    /// imminent-harm material) where the 24h timelock used by `ban_event`
    /// is unacceptable. Writes to the same banned-events storage as
    /// `ban_event`; the difference is the audit trail: every takedown
    /// emits a NEP-297 `event_takedown` log so abuse is detectable on-chain.
    ///
    /// Works while the contract is paused — emergency response must not
    /// depend on contract liveness.
    ///
    /// Per ADR-009, this owner authority is transitional and is scheduled
    /// to be transferred to a multisig/DAO by end of Q4 2026.
    pub fn takedown_event(&mut self, encrypted_cid: String, reason: BanReason) {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can takedown events"
        );
        require!(self.events.get(&encrypted_cid).is_some(), "Event not found");
        require!(
            self.lazy_banned_events().get(&encrypted_cid).is_none(),
            "Event is already banned or taken down"
        );

        let now = env::block_timestamp();
        let by = env::predecessor_account_id();
        let ban_info = BanInfo {
            reason: reason.clone(),
            banned_at: now,
            banned_by: by.clone(),
        };
        self.lazy_banned_events().insert(&encrypted_cid, &ban_info);
        self.active_event_count = self.active_event_count.saturating_sub(1);

        let reason_str = match reason {
            BanReason::SexualContent => "sexual_content",
            BanReason::CopyrightViolation => "copyright_violation",
            BanReason::Other => "other",
        };
        crate::events::emit_event_takedown(encrypted_cid, reason_str.to_string(), by, now);
    }

    /// View: Get all banned events (owner only, iterates events checking ban map)
    pub fn get_banned_events(&self) -> Vec<(String, BanInfo)> {
        require!(
            env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can list banned events"
        );

        self.events
            .iter()
            .filter_map(|(cid, _)| self.lazy_banned_events().get(&cid).map(|info| (cid, info)))
            .collect()
    }
}
