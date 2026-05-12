use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::{LazyOption, LookupMap, UnorderedSet};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault, PublicKey};

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SessionScope {
    Play,
    Publish,
    ClaimGift,
    ClaimTrial,
}

impl SessionScope {
    fn as_key(&self) -> &'static str {
        match self {
            Self::Play => "play",
            Self::Publish => "publish",
            Self::ClaimGift => "claim_gift",
            Self::ClaimTrial => "claim_trial",
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct ScopePolicy {
    pub max_ttl_ms: u64,
    pub require_origin: bool,
    pub require_device: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct SessionGrant {
    pub owner_id: AccountId,
    pub session_pk: String,
    pub scope: SessionScope,
    pub resource_id: Option<String>,
    pub expires_at_ms: u64,
    pub origin_hash: Option<String>,
    pub device_hash: Option<String>,
    pub revoked: bool,
}

#[near(serializers = [json])]
pub struct SessionGrantVerification {
    pub valid: bool,
    pub owner_id: Option<AccountId>,
    pub reason: Option<String>,
}

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    Grants,
    GrantsByOwner,
    ScopePolicies,
    PausedScopes,
    Timelocks,
    TimelockCounter,
    ContractPaused,
}

pub const TIMELOCK_DELAY_NS: u64 = 86_400_000_000_000; // 24 hours

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub enum TimelockAction {
    SetScopePolicy { scope: SessionScope, policy: ScopePolicy },
    SetMarketContract { market_contract_id: AccountId },
    SetRegistryContract { registry_contract_id: AccountId },
    PauseScope { scope: SessionScope },
    UnpauseScope { scope: SessionScope },
    PauseContract,
    UnpauseContract,
    ProposeOwner { proposed_owner_id: AccountId },
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TimelockProposal {
    pub action: TimelockAction,
    pub proposer: AccountId,
    pub proposed_at: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AccessControlContract {
    owner_id: AccountId,
    pending_owner_id: Option<AccountId>,
    market_contract_id: AccountId,
    registry_contract_id: AccountId,
    grants: LookupMap<String, SessionGrant>,
    grants_by_owner: LookupMap<AccountId, Vec<String>>,
    scope_policies: LookupMap<String, ScopePolicy>,
    paused_scopes: UnorderedSet<String>,
    paused: LazyOption<bool>,
    timelocks: LookupMap<u64, TimelockProposal>,
    timelock_counter: LazyOption<u64>,
}

#[near]
impl AccessControlContract {
    #[init]
    pub fn new(
        owner_id: AccountId,
        market_contract_id: AccountId,
        registry_contract_id: AccountId,
    ) -> Self {
        let mut contract = Self {
            owner_id,
            pending_owner_id: None,
            market_contract_id,
            registry_contract_id,
            grants: LookupMap::new(StorageKey::Grants),
            grants_by_owner: LookupMap::new(StorageKey::GrantsByOwner),
            scope_policies: LookupMap::new(StorageKey::ScopePolicies),
            paused_scopes: UnorderedSet::new(StorageKey::PausedScopes),
            paused: LazyOption::new(StorageKey::ContractPaused, Some(&false)),
            timelocks: LookupMap::new(StorageKey::Timelocks),
            timelock_counter: LazyOption::new(StorageKey::TimelockCounter, Some(&0)),
        };

        contract.set_scope_policy_internal(
            SessionScope::Play,
            ScopePolicy {
                max_ttl_ms: 10 * 60 * 1000,
                require_origin: true,
                require_device: true,
            },
        );
        contract.set_scope_policy_internal(
            SessionScope::Publish,
            ScopePolicy {
                max_ttl_ms: 20 * 60 * 1000,
                require_origin: true,
                require_device: true,
            },
        );
        contract.set_scope_policy_internal(
            SessionScope::ClaimGift,
            ScopePolicy {
                max_ttl_ms: 15 * 60 * 1000,
                require_origin: false,
                require_device: false,
            },
        );
        contract.set_scope_policy_internal(
            SessionScope::ClaimTrial,
            ScopePolicy {
                max_ttl_ms: 15 * 60 * 1000,
                require_origin: false,
                require_device: false,
            },
        );

        contract
    }

    fn assert_not_paused(&self) {
        require!(!self.is_paused(), "Contract is paused");
    }

    fn is_paused(&self) -> bool {
        self.paused.get().unwrap_or(false)
    }

    fn panic_timelock_required() -> ! {
        env::panic_str("Use propose_action and execute_action for this admin action")
    }

    fn next_timelock_id(&mut self) -> u64 {
        let id = self.timelock_counter.get().unwrap_or(0);
        self.timelock_counter.set(&(id + 1));
        id
    }

    pub fn issue_session_grant(
        &mut self,
        target_owner_id: AccountId,
        session_pk: String,
        scope: SessionScope,
        resource_id: Option<String>,
        ttl_ms: u64,
        origin_hash: Option<String>,
        device_hash: Option<String>,
        session_pok: String,
    ) -> SessionGrant {
        self.assert_not_paused();

        // Users can issue their own grants. Admin contracts can issue on behalf of
        // a user, but every path must prove control of the ephemeral session key.
        let caller = env::predecessor_account_id();
        require!(
            caller == target_owner_id
                || caller == self.owner_id
                || caller == self.market_contract_id
                || caller == self.registry_contract_id,
            "Unauthorized: caller cannot issue session grants",
        );

        let scope_key = scope.as_key().to_string();
        require!(!self.paused_scopes.contains(&scope_key), "Scope is paused");

        let policy = self
            .scope_policies
            .get(&scope_key)
            .expect("Scope policy not found");

        require!(ttl_ms > 0, "TTL must be greater than zero");
        require!(ttl_ms <= policy.max_ttl_ms, "TTL exceeds scope policy");
        if policy.require_origin {
            require!(origin_hash.is_some(), "Origin binding is required");
        }
        if policy.require_device {
            require!(device_hash.is_some(), "Device binding is required");
        }

        self.assert_session_key_proof(
            &caller,
            &target_owner_id,
            &session_pk,
            &scope,
            resource_id.as_ref(),
            ttl_ms,
            origin_hash.as_ref(),
            device_hash.as_ref(),
            &session_pok,
        );

        let owner_id = target_owner_id;
        if let Some(existing) = self.grants.get(&session_pk) {
            require!(
                existing.owner_id == owner_id || caller == self.owner_id,
                "Session key already belongs to another owner",
            );
        }

        let grant = SessionGrant {
            owner_id: owner_id.clone(),
            session_pk: session_pk.clone(),
            scope,
            resource_id,
            expires_at_ms: current_time_ms().saturating_add(ttl_ms),
            origin_hash,
            device_hash,
            revoked: false,
        };

        self.grants.insert(&session_pk, &grant);

        let mut owner_grants = self.grants_by_owner.get(&owner_id).unwrap_or_default();
        if !owner_grants.contains(&session_pk) {
            owner_grants.push(session_pk);
            self.grants_by_owner.insert(&owner_id, &owner_grants);
        }

        grant
    }

    pub fn revoke_session_grant(&mut self, session_pk: String) {
        let mut grant = self
            .grants
            .get(&session_pk)
            .expect("Session grant not found");
        let caller = env::predecessor_account_id();
        require!(
            caller == grant.owner_id || caller == self.owner_id,
            "Only the grant owner or contract owner can revoke",
        );

        grant.revoked = true;
        self.grants.insert(&session_pk, &grant);
    }

    pub fn revoke_subject_sessions(&mut self, owner_id: AccountId) {
        let caller = env::predecessor_account_id();
        require!(
            caller == owner_id || caller == self.owner_id,
            "Only the subject or contract owner can revoke all sessions",
        );

        let session_keys = self.grants_by_owner.get(&owner_id).unwrap_or_default();
        for session_pk in session_keys {
            if let Some(mut grant) = self.grants.get(&session_pk) {
                grant.revoked = true;
                self.grants.insert(&session_pk, &grant);
            }
        }
    }

    pub fn set_scope_policy(&mut self, scope: SessionScope, policy: ScopePolicy) {
        let _ = (scope, policy);
        Self::panic_timelock_required()
    }

    fn set_scope_policy_timelocked(&mut self, scope: SessionScope, policy: ScopePolicy) {
        self.set_scope_policy_internal(scope, policy);
    }

    pub fn set_market_contract(&mut self, market_contract_id: AccountId) {
        let _ = market_contract_id;
        Self::panic_timelock_required()
    }

    fn set_market_contract_timelocked(&mut self, market_contract_id: AccountId) {
        self.market_contract_id = market_contract_id;
    }

    pub fn set_registry_contract(&mut self, registry_contract_id: AccountId) {
        let _ = registry_contract_id;
        Self::panic_timelock_required()
    }

    fn set_registry_contract_timelocked(&mut self, registry_contract_id: AccountId) {
        self.registry_contract_id = registry_contract_id;
    }

    pub fn pause_scope(&mut self, scope: SessionScope) {
        let _ = scope;
        Self::panic_timelock_required()
    }

    fn pause_scope_timelocked(&mut self, scope: SessionScope) {
        self.paused_scopes.insert(&scope.as_key().to_string());
    }

    pub fn unpause_scope(&mut self, scope: SessionScope) {
        let _ = scope;
        Self::panic_timelock_required()
    }

    fn unpause_scope_timelocked(&mut self, scope: SessionScope) {
        self.paused_scopes.remove(&scope.as_key().to_string());
    }

    pub fn pause_contract(&mut self) {
        Self::panic_timelock_required()
    }

    fn pause_contract_timelocked(&mut self) {
        self.paused.set(&true);
    }

    pub fn unpause_contract(&mut self) {
        Self::panic_timelock_required()
    }

    fn unpause_contract_timelocked(&mut self) {
        self.paused.set(&false);
    }

    // OW-1 fix: Two-step ownership transfer (propose + accept)
    pub fn propose_owner(&mut self, proposed_owner_id: AccountId) {
        let _ = proposed_owner_id;
        Self::panic_timelock_required()
    }

    fn propose_owner_timelocked(&mut self, proposed_owner_id: AccountId) {
        self.pending_owner_id = Some(proposed_owner_id);
    }

    pub fn accept_ownership(&mut self) {
        let pending = self.pending_owner_id.take();
        require!(pending.is_some(), "No pending ownership transfer");
        let new_owner = pending.unwrap();
        require!(
            env::predecessor_account_id() == new_owner,
            "Only the proposed owner can accept ownership",
        );
        self.owner_id = new_owner;
    }

    /// Legacy: kept for backward compatibility, delegates to two-step flow
    #[deprecated(note = "Use propose_owner + accept_ownership for safe transfers")]
    pub fn set_owner(&mut self, owner_id: AccountId) {
        self.assert_owner();
        self.pending_owner_id = Some(owner_id);
        env::log_str("WARNING: set_owner is deprecated. Use propose_owner + accept_ownership.");
    }

    pub fn get_session_grant(&self, session_pk: String) -> Option<SessionGrant> {
        self.grants.get(&session_pk)
    }

    pub fn list_session_grants(&self, owner_id: AccountId) -> Vec<SessionGrant> {
        self.grants_by_owner
            .get(&owner_id)
            .unwrap_or_default()
            .into_iter()
            .filter_map(|session_pk| self.grants.get(&session_pk))
            .collect()
    }

    pub fn get_scope_policy(&self, scope: SessionScope) -> Option<ScopePolicy> {
        self.scope_policies.get(&scope.as_key().to_string())
    }

    pub fn verify_session_grant(
        &self,
        session_pk: String,
        scope: SessionScope,
        resource_id: Option<String>,
        origin_hash: Option<String>,
        device_hash: Option<String>,
    ) -> SessionGrantVerification {
        let Some(grant) = self.grants.get(&session_pk) else {
            return SessionGrantVerification {
                valid: false,
                owner_id: None,
                reason: Some("Session grant not found".to_string()),
            };
        };

        if grant.revoked {
            return SessionGrantVerification {
                valid: false,
                owner_id: Some(grant.owner_id),
                reason: Some("Session grant is revoked".to_string()),
            };
        }

        if current_time_ms() > grant.expires_at_ms {
            return SessionGrantVerification {
                valid: false,
                owner_id: Some(grant.owner_id),
                reason: Some("Session grant has expired".to_string()),
            };
        }

        if grant.scope != scope {
            return SessionGrantVerification {
                valid: false,
                owner_id: Some(grant.owner_id),
                reason: Some("Session scope mismatch".to_string()),
            };
        }

        if grant.resource_id.is_some() && grant.resource_id != resource_id {
            return SessionGrantVerification {
                valid: false,
                owner_id: Some(grant.owner_id),
                reason: Some("Resource binding mismatch".to_string()),
            };
        }

        if grant.origin_hash.is_some() && grant.origin_hash != origin_hash {
            return SessionGrantVerification {
                valid: false,
                owner_id: Some(grant.owner_id),
                reason: Some("Origin binding mismatch".to_string()),
            };
        }

        if grant.device_hash.is_some() && grant.device_hash != device_hash {
            return SessionGrantVerification {
                valid: false,
                owner_id: Some(grant.owner_id),
                reason: Some("Device binding mismatch".to_string()),
            };
        }

        SessionGrantVerification {
            valid: true,
            owner_id: Some(grant.owner_id),
            reason: None,
        }
    }

    pub fn can_execute(
        &self,
        owner_id: AccountId,
        scope: SessionScope,
        resource_id: Option<String>,
    ) -> bool {
        self.list_session_grants(owner_id).into_iter().any(|grant| {
            !grant.revoked
                && current_time_ms() <= grant.expires_at_ms
                && grant.scope == scope
                && (grant.resource_id.is_none() || grant.resource_id == resource_id)
        })
    }

    pub fn can_play(&self, owner_id: AccountId, resource_id: Option<String>) -> bool {
        self.can_execute(owner_id, SessionScope::Play, resource_id)
    }

    pub fn can_publish(&self, owner_id: AccountId, resource_id: Option<String>) -> bool {
        self.can_execute(owner_id, SessionScope::Publish, resource_id)
    }

    pub fn can_claim_gift(&self, owner_id: AccountId, resource_id: Option<String>) -> bool {
        self.can_execute(owner_id, SessionScope::ClaimGift, resource_id)
    }

    pub fn can_claim_trial(&self, owner_id: AccountId, resource_id: Option<String>) -> bool {
        self.can_execute(owner_id, SessionScope::ClaimTrial, resource_id)
    }
}

#[near]
impl AccessControlContract {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the contract owner can call this method",
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // TIMELOCK
    // ═══════════════════════════════════════════════════════════════

    pub fn propose_action(&mut self, action: TimelockAction) -> u64 {
        self.assert_owner();
        let id = self.next_timelock_id();
        let proposal = TimelockProposal {
            action,
            proposer: env::predecessor_account_id(),
            proposed_at: env::block_timestamp(),
        };
        self.timelocks.insert(&id, &proposal);
        env::log_str(&format!("Timelock proposal {} created", id));
        id
    }

    pub fn execute_action(&mut self, id: u64) {
        self.assert_owner();
        let proposal = self.timelocks.get(&id).expect("Proposal not found");
        let elapsed = env::block_timestamp().saturating_sub(proposal.proposed_at);
        require!(
            elapsed >= TIMELOCK_DELAY_NS,
            "Timelock delay not yet passed"
        );
        self.timelocks.remove(&id);
        match proposal.action {
            TimelockAction::SetScopePolicy { scope, policy } => {
                self.set_scope_policy_timelocked(scope, policy);
            }
            TimelockAction::SetMarketContract { market_contract_id } => {
                self.set_market_contract_timelocked(market_contract_id);
            }
            TimelockAction::SetRegistryContract { registry_contract_id } => {
                self.set_registry_contract_timelocked(registry_contract_id);
            }
            TimelockAction::PauseScope { scope } => {
                self.pause_scope_timelocked(scope);
            }
            TimelockAction::UnpauseScope { scope } => {
                self.unpause_scope_timelocked(scope);
            }
            TimelockAction::PauseContract => {
                self.pause_contract_timelocked();
            }
            TimelockAction::UnpauseContract => {
                self.unpause_contract_timelocked();
            }
            TimelockAction::ProposeOwner { proposed_owner_id } => {
                self.propose_owner_timelocked(proposed_owner_id);
            }
        }
        env::log_str(&format!("Timelock proposal {} executed", id));
    }

    pub fn cancel_action(&mut self, id: u64) {
        let proposal = self.timelocks.get(&id).expect("Proposal not found");
        let caller = env::predecessor_account_id();
        require!(
            caller == self.owner_id || caller == proposal.proposer,
            "Only owner or proposer can cancel"
        );
        self.timelocks.remove(&id);
        env::log_str(&format!("Timelock proposal {} cancelled", id));
    }

    pub fn get_timelock(&self, id: u64) -> Option<TimelockProposal> {
        self.timelocks.get(&id)
    }

    fn set_scope_policy_internal(&mut self, scope: SessionScope, policy: ScopePolicy) {
        self.scope_policies
            .insert(&scope.as_key().to_string(), &policy);
    }

    fn assert_session_key_proof(
        &self,
        caller: &AccountId,
        target_owner_id: &AccountId,
        session_pk: &str,
        scope: &SessionScope,
        resource_id: Option<&String>,
        ttl_ms: u64,
        origin_hash: Option<&String>,
        device_hash: Option<&String>,
        session_pok: &str,
    ) {
        let public_key = Self::parse_ed25519_public_key(session_pk)
            .unwrap_or_else(|| env::panic_str("Invalid session public key"));
        let signature = Self::parse_hex_signature(session_pok)
            .unwrap_or_else(|| env::panic_str("Invalid session proof"));
        let message = Self::session_pok_message(
            caller,
            target_owner_id,
            session_pk,
            scope,
            resource_id,
            ttl_ms,
            origin_hash,
            device_hash,
        );

        require!(
            env::ed25519_verify(&signature, message.as_bytes(), &public_key),
            "Invalid session proof",
        );
    }

    fn session_pok_message(
        caller: &AccountId,
        target_owner_id: &AccountId,
        session_pk: &str,
        scope: &SessionScope,
        resource_id: Option<&String>,
        ttl_ms: u64,
        origin_hash: Option<&String>,
        device_hash: Option<&String>,
    ) -> String {
        [
            "youtick-session-grant-v1".to_string(),
            format!(
                "contract={}",
                Self::hex_field(env::current_account_id().as_str())
            ),
            format!("caller={}", Self::hex_field(caller.as_str())),
            format!("target_owner={}", Self::hex_field(target_owner_id.as_str())),
            format!("session_pk={}", Self::hex_field(session_pk)),
            format!("scope={}", scope.as_key()),
            format!(
                "resource_id={}",
                Self::hex_optional(resource_id.map(|value| value.as_str()))
            ),
            format!("ttl_ms={}", ttl_ms),
            format!(
                "origin_hash={}",
                Self::hex_optional(origin_hash.map(|value| value.as_str()))
            ),
            format!(
                "device_hash={}",
                Self::hex_optional(device_hash.map(|value| value.as_str()))
            ),
        ]
        .join("\n")
    }

    fn parse_ed25519_public_key(session_pk: &str) -> Option<[u8; 32]> {
        let public_key: PublicKey = session_pk.parse().ok()?;
        let bytes = public_key.as_bytes();
        if bytes.len() != 33 || bytes.first().copied()? != 0 {
            return None;
        }

        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes[1..]);
        Some(key)
    }

    fn parse_hex_signature(value: &str) -> Option<[u8; 64]> {
        if value.len() != 128 {
            return None;
        }

        let mut signature = [0u8; 64];
        for index in 0..64 {
            let start = index * 2;
            signature[index] = u8::from_str_radix(&value[start..start + 2], 16).ok()?;
        }
        Some(signature)
    }

    fn hex_optional(value: Option<&str>) -> String {
        value
            .map(Self::hex_field)
            .unwrap_or_else(|| "-".to_string())
    }

    fn hex_field(value: &str) -> String {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut output = String::with_capacity(value.len() * 2);
        for byte in value.as_bytes() {
            output.push(HEX[(byte >> 4) as usize] as char);
            output.push(HEX[(byte & 0x0f) as usize] as char);
        }
        output
    }
}

fn current_time_ms() -> u64 {
    env::block_timestamp_ms()
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_crypto::{KeyType, SecretKey, Signature};
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, AccountId};

    fn account(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn context(predecessor: &str, timestamp_ms: u64) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(account(predecessor));
        builder.current_account_id(account("access.testnet"));
        builder.block_timestamp(timestamp_ms.saturating_mul(1_000_000));
        builder
    }

    fn bytes_to_hex(bytes: &[u8]) -> String {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut output = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            output.push(HEX[(byte >> 4) as usize] as char);
            output.push(HEX[(byte & 0x0f) as usize] as char);
        }
        output
    }

    fn session_key_and_proof(
        seed: &str,
        caller: &str,
        target_owner_id: &str,
        scope: SessionScope,
        resource_id: Option<&String>,
        ttl_ms: u64,
        origin_hash: Option<&String>,
        device_hash: Option<&String>,
    ) -> (String, String) {
        let secret_key = SecretKey::from_seed(KeyType::ED25519, seed);
        let session_pk = secret_key.public_key().to_string();
        let message = AccessControlContract::session_pok_message(
            &account(caller),
            &account(target_owner_id),
            &session_pk,
            &scope,
            resource_id,
            ttl_ms,
            origin_hash,
            device_hash,
        );
        let signature = secret_key.sign(message.as_bytes());
        let signature_bytes = match signature {
            Signature::ED25519(signature) => signature.to_bytes(),
            Signature::SECP256K1(_) => unreachable!(),
        };

        (session_pk, bytes_to_hex(&signature_bytes))
    }

    #[test]
    fn issues_play_grant_with_policy_defaults() {
        let owner = account("owner.testnet");
        testing_env!(context("market.testnet", 1_000).build());
        let mut contract = AccessControlContract::new(
            owner,
            account("market.testnet"),
            account("registry.testnet"),
        );

        let resource_id = Some("cid-1".to_string());
        let origin_hash = Some("origin".to_string());
        let device_hash = Some("device".to_string());
        let ttl_ms = 60_000;
        let (session_pk, session_pok) = session_key_and_proof(
            "play-grant",
            "market.testnet",
            "market.testnet",
            SessionScope::Play,
            resource_id.as_ref(),
            ttl_ms,
            origin_hash.as_ref(),
            device_hash.as_ref(),
        );

        let grant = contract.issue_session_grant(
            account("market.testnet"),
            session_pk,
            SessionScope::Play,
            resource_id,
            ttl_ms,
            origin_hash,
            device_hash,
            session_pok,
        );

        assert_eq!(grant.owner_id, account("market.testnet"));
        assert!(contract.can_play(account("market.testnet"), Some("cid-1".to_string())));
    }

    #[test]
    #[should_panic(expected = "TTL exceeds scope policy")]
    fn rejects_grant_ttl_above_scope_limit() {
        let owner = account("owner.testnet");
        testing_env!(context("market.testnet", 1_000).build());
        let mut contract = AccessControlContract::new(
            owner,
            account("market.testnet"),
            account("registry.testnet"),
        );

        let origin_hash = Some("origin".to_string());
        let device_hash = Some("device".to_string());
        let ttl_ms = 11 * 60 * 1000;
        let (session_pk, session_pok) = session_key_and_proof(
            "long-grant",
            "market.testnet",
            "market.testnet",
            SessionScope::Play,
            None,
            ttl_ms,
            origin_hash.as_ref(),
            device_hash.as_ref(),
        );

        contract.issue_session_grant(
            account("market.testnet"),
            session_pk,
            SessionScope::Play,
            None,
            ttl_ms,
            origin_hash,
            device_hash,
            session_pok,
        );
    }

    #[test]
    fn revoke_and_pause_work_as_expected() {
        let owner = account("owner.testnet");
        testing_env!(context("market.testnet", 1_000).build());
        let mut contract = AccessControlContract::new(
            owner.clone(),
            account("market.testnet"),
            account("registry.testnet"),
        );

        let resource_id = Some("cid-1".to_string());
        let origin_hash = Some("origin".to_string());
        let device_hash = Some("device".to_string());
        let ttl_ms = 60_000;
        let (session_pk, session_pok) = session_key_and_proof(
            "revoke-grant",
            "market.testnet",
            "market.testnet",
            SessionScope::Play,
            resource_id.as_ref(),
            ttl_ms,
            origin_hash.as_ref(),
            device_hash.as_ref(),
        );

        contract.issue_session_grant(
            account("market.testnet"),
            session_pk.clone(),
            SessionScope::Play,
            resource_id,
            ttl_ms,
            origin_hash,
            device_hash,
            session_pok,
        );
        contract.revoke_session_grant(session_pk);
        assert!(!contract.can_play(account("market.testnet"), Some("cid-1".to_string())));

        testing_env!(context("owner.testnet", 2_000).build());
        let id = contract.propose_action(TimelockAction::PauseScope {
            scope: SessionScope::Publish,
        });

        let mut builder = context("owner.testnet", 2_000 + TIMELOCK_DELAY_NS / 1_000_000);
        testing_env!(builder.build());
        contract.execute_action(id);

        assert!(contract.get_scope_policy(SessionScope::Publish).is_some());
    }

    #[test]
    #[should_panic(expected = "Unauthorized: caller cannot issue session grants")]
    fn rejects_delegated_grant_from_unauthorized_caller() {
        let owner = account("owner.testnet");
        testing_env!(context("eve.testnet", 1_000).build());
        let mut contract = AccessControlContract::new(
            owner,
            account("market.testnet"),
            account("registry.testnet"),
        );

        let resource_id = Some("cid-1".to_string());
        let origin_hash = Some("origin".to_string());
        let device_hash = Some("device".to_string());
        let ttl_ms = 60_000;
        let (session_pk, session_pok) = session_key_and_proof(
            "evil-grant",
            "eve.testnet",
            "alice.testnet",
            SessionScope::Play,
            resource_id.as_ref(),
            ttl_ms,
            origin_hash.as_ref(),
            device_hash.as_ref(),
        );

        contract.issue_session_grant(
            account("alice.testnet"),
            session_pk,
            SessionScope::Play,
            resource_id,
            ttl_ms,
            origin_hash,
            device_hash,
            session_pok,
        );
    }

    #[test]
    fn user_can_issue_own_grant_with_session_key_proof() {
        let owner = account("owner.testnet");
        testing_env!(context("alice.testnet", 1_000).build());
        let mut contract = AccessControlContract::new(
            owner,
            account("market.testnet"),
            account("registry.testnet"),
        );

        let resource_id = Some("cid-1".to_string());
        let origin_hash = Some("origin".to_string());
        let device_hash = Some("device".to_string());
        let ttl_ms = 60_000;
        let (session_pk, session_pok) = session_key_and_proof(
            "alice-grant",
            "alice.testnet",
            "alice.testnet",
            SessionScope::Play,
            resource_id.as_ref(),
            ttl_ms,
            origin_hash.as_ref(),
            device_hash.as_ref(),
        );

        let grant = contract.issue_session_grant(
            account("alice.testnet"),
            session_pk,
            SessionScope::Play,
            resource_id,
            ttl_ms,
            origin_hash,
            device_hash,
            session_pok,
        );

        assert_eq!(grant.owner_id, account("alice.testnet"));
        assert!(contract.can_play(account("alice.testnet"), Some("cid-1".to_string())));
    }

    #[test]
    #[should_panic(expected = "Invalid session proof")]
    fn rejects_grant_with_wrong_session_key_proof() {
        let owner = account("owner.testnet");
        testing_env!(context("alice.testnet", 1_000).build());
        let mut contract = AccessControlContract::new(
            owner,
            account("market.testnet"),
            account("registry.testnet"),
        );

        let resource_id = Some("cid-1".to_string());
        let origin_hash = Some("origin".to_string());
        let device_hash = Some("device".to_string());
        let ttl_ms = 60_000;
        let (session_pk, _) = session_key_and_proof(
            "alice-grant",
            "alice.testnet",
            "alice.testnet",
            SessionScope::Play,
            resource_id.as_ref(),
            ttl_ms,
            origin_hash.as_ref(),
            device_hash.as_ref(),
        );
        let (_, wrong_pok) = session_key_and_proof(
            "other-grant",
            "alice.testnet",
            "alice.testnet",
            SessionScope::Play,
            resource_id.as_ref(),
            ttl_ms,
            origin_hash.as_ref(),
            device_hash.as_ref(),
        );

        contract.issue_session_grant(
            account("alice.testnet"),
            session_pk,
            SessionScope::Play,
            resource_id,
            ttl_ms,
            origin_hash,
            device_hash,
            wrong_pok,
        );
    }

    #[test]
    #[should_panic(expected = "Use propose_action and execute_action for this admin action")]
    fn direct_set_scope_policy_requires_timelock() {
        let owner = account("owner.testnet");
        testing_env!(context("owner.testnet", 1_000).build());
        let mut contract = AccessControlContract::new(
            owner.clone(),
            account("market.testnet"),
            account("registry.testnet"),
        );

        contract.set_scope_policy(
            SessionScope::Play,
            ScopePolicy {
                max_ttl_ms: 5 * 60 * 1000,
                require_origin: true,
                require_device: true,
            },
        );
    }

    #[test]
    fn contract_pause_blocks_session_grant() {
        let owner = account("owner.testnet");
        testing_env!(context("owner.testnet", 1_000).build());
        let mut contract = AccessControlContract::new(
            owner.clone(),
            account("market.testnet"),
            account("registry.testnet"),
        );

        let id = contract.propose_action(TimelockAction::PauseContract);

        let mut builder = context("owner.testnet", 1_000 + TIMELOCK_DELAY_NS / 1_000_000);
        testing_env!(builder.build());
        contract.execute_action(id);

        assert!(contract.is_paused());

        testing_env!(context("alice.testnet", 2_000).build());
        let (session_pk, session_pok) = session_key_and_proof(
            "paused-grant",
            "alice.testnet",
            "alice.testnet",
            SessionScope::Play,
            None,
            60_000,
            None,
            None,
        );

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            contract.issue_session_grant(
                account("alice.testnet"),
                session_pk,
                SessionScope::Play,
                None,
                60_000,
                None,
                None,
                session_pok,
            );
        }));
        assert!(result.is_err());
    }
}
