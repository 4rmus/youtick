use crate::*;

/// Snapshot of the on-chain AccessControlContract layout **before** any migration.
/// Must match the borsh encoding of the currently deployed WASM byte-for-byte.
#[near(serializers = [borsh])]
pub struct OldAccessControlContract {
    owner_id: AccountId,
    pending_owner_id: Option<AccountId>,
    market_contract_id: AccountId,
    registry_contract_id: AccountId,
    grants: LookupMap<String, SessionGrant>,
    grants_by_owner: LookupMap<AccountId, Vec<String>>,
    scope_policies: LookupMap<String, ScopePolicy>,
    paused_scopes: UnorderedSet<String>,
}

#[near]
impl AccessControlContract {
    /// Generic state migration.
    ///
    /// Call exactly once immediately after deploying the new WASM:
    ///
    /// ```bash
    /// near contract call-function as-transaction access.youtick.near migrate \
    ///   json-args '{}' prepaid-gas '300 Tgas' attached-deposit '0 NEAR' \
    ///   sign-as access.youtick.near network-config mainnet sign-with-keychain send
    /// ```
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: OldAccessControlContract = env::state_read().expect("Cannot deserialize old state");
        require!(
            env::predecessor_account_id() == old.owner_id,
            "Only owner can migrate"
        );
        env::log_str("AccessControlContract migration completed");
        Self {
            owner_id: old.owner_id,
            pending_owner_id: old.pending_owner_id,
            market_contract_id: old.market_contract_id,
            registry_contract_id: old.registry_contract_id,
            grants: old.grants,
            grants_by_owner: old.grants_by_owner,
            scope_policies: old.scope_policies,
            paused_scopes: old.paused_scopes,
        }
    }
}
