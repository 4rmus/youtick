use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::{LookupMap, UnorderedSet};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault};

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
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AccessControlContract {
    owner_id: AccountId,
    market_contract_id: AccountId,
    registry_contract_id: AccountId,
    grants: LookupMap<String, SessionGrant>,
    grants_by_owner: LookupMap<AccountId, Vec<String>>,
    scope_policies: LookupMap<String, ScopePolicy>,
    paused_scopes: UnorderedSet<String>,
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
            market_contract_id,
            registry_contract_id,
            grants: LookupMap::new(StorageKey::Grants),
            grants_by_owner: LookupMap::new(StorageKey::GrantsByOwner),
            scope_policies: LookupMap::new(StorageKey::ScopePolicies),
            paused_scopes: UnorderedSet::new(StorageKey::PausedScopes),
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

    pub fn issue_session_grant(
        &mut self,
        session_pk: String,
        scope: SessionScope,
        resource_id: Option<String>,
        ttl_ms: u64,
        origin_hash: Option<String>,
        device_hash: Option<String>,
    ) -> SessionGrant {
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

        let owner_id = env::predecessor_account_id();
        if let Some(existing) = self.grants.get(&session_pk) {
            require!(
                existing.owner_id == owner_id || self.owner_id == owner_id,
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
        let mut grant = self.grants.get(&session_pk).expect("Session grant not found");
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
        self.assert_owner();
        self.set_scope_policy_internal(scope, policy);
    }

    pub fn set_market_contract(&mut self, market_contract_id: AccountId) {
        self.assert_owner();
        self.market_contract_id = market_contract_id;
    }

    pub fn set_registry_contract(&mut self, registry_contract_id: AccountId) {
        self.assert_owner();
        self.registry_contract_id = registry_contract_id;
    }

    pub fn pause_scope(&mut self, scope: SessionScope) {
        self.assert_owner();
        self.paused_scopes.insert(&scope.as_key().to_string());
    }

    pub fn unpause_scope(&mut self, scope: SessionScope) {
        self.assert_owner();
        self.paused_scopes.remove(&scope.as_key().to_string());
    }

    pub fn set_owner(&mut self, owner_id: AccountId) {
        self.assert_owner();
        self.owner_id = owner_id;
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

impl AccessControlContract {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the contract owner can call this method",
        );
    }

    fn set_scope_policy_internal(&mut self, scope: SessionScope, policy: ScopePolicy) {
        self.scope_policies.insert(&scope.as_key().to_string(), &policy);
    }
}

fn current_time_ms() -> u64 {
    env::block_timestamp_ms()
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, AccountId};

    fn account(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn context(predecessor: &str, timestamp_ms: u64) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(account(predecessor));
        builder.block_timestamp(timestamp_ms.saturating_mul(1_000_000));
        builder
    }

    #[test]
    fn issues_play_grant_with_policy_defaults() {
        let owner = account("owner.testnet");
        testing_env!(context("alice.testnet", 1_000).build());
        let mut contract = AccessControlContract::new(
            owner,
            account("market.testnet"),
            account("registry.testnet"),
        );

        let grant = contract.issue_session_grant(
            "session-1".to_string(),
            SessionScope::Play,
            Some("cid-1".to_string()),
            60_000,
            Some("origin".to_string()),
            Some("device".to_string()),
        );

        assert_eq!(grant.owner_id, account("alice.testnet"));
        assert!(contract.can_play(account("alice.testnet"), Some("cid-1".to_string())));
    }

    #[test]
    #[should_panic(expected = "TTL exceeds scope policy")]
    fn rejects_grant_ttl_above_scope_limit() {
        let owner = account("owner.testnet");
        testing_env!(context("alice.testnet", 1_000).build());
        let mut contract = AccessControlContract::new(
            owner,
            account("market.testnet"),
            account("registry.testnet"),
        );

        contract.issue_session_grant(
            "session-1".to_string(),
            SessionScope::Play,
            None,
            11 * 60 * 1000,
            Some("origin".to_string()),
            Some("device".to_string()),
        );
    }

    #[test]
    fn revoke_and_pause_work_as_expected() {
        let owner = account("owner.testnet");
        testing_env!(context("alice.testnet", 1_000).build());
        let mut contract = AccessControlContract::new(
            owner.clone(),
            account("market.testnet"),
            account("registry.testnet"),
        );

        contract.issue_session_grant(
            "session-1".to_string(),
            SessionScope::Play,
            Some("cid-1".to_string()),
            60_000,
            Some("origin".to_string()),
            Some("device".to_string()),
        );
        contract.revoke_session_grant("session-1".to_string());
        assert!(!contract.can_play(account("alice.testnet"), Some("cid-1".to_string())));

        testing_env!(context("owner.testnet", 2_000).build());
        contract.pause_scope(SessionScope::Publish);
        assert!(contract.get_scope_policy(SessionScope::Publish).is_some());
    }
}
