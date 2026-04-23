use crate::*;

/// Snapshot of the on-chain OperatorRegistryContract layout **before** any migration.
/// Must match the borsh encoding of the currently deployed WASM byte-for-byte.
#[near(serializers = [borsh])]
pub struct OldOperatorRegistryContract {
    owner_id: AccountId,
    pending_owner_id: Option<AccountId>,
    threshold_config: ThresholdConfig,
    decryption_operators: LookupMap<AccountId, OperatorRecord>,
    decryption_operator_ids: UnorderedSet<AccountId>,
    relayers: LookupMap<AccountId, OperatorRecord>,
    relayer_ids: UnorderedSet<AccountId>,
}

#[near]
impl OperatorRegistryContract {
    /// Generic state migration.
    ///
    /// Call exactly once immediately after deploying the new WASM:
    ///
    /// ```bash
    /// near contract call-function as-transaction registry.youtick.near migrate \
    ///   json-args '{}' prepaid-gas '300 Tgas' attached-deposit '0 NEAR' \
    ///   sign-as registry.youtick.near network-config mainnet sign-with-keychain send
    /// ```
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: OldOperatorRegistryContract = env::state_read().expect("Cannot deserialize old state");
        require!(
            env::predecessor_account_id() == old.owner_id,
            "Only owner can migrate"
        );
        env::log_str("OperatorRegistryContract migration completed");
        Self {
            owner_id: old.owner_id,
            pending_owner_id: old.pending_owner_id,
            threshold_config: old.threshold_config,
            decryption_operators: old.decryption_operators,
            decryption_operator_ids: old.decryption_operator_ids,
            relayers: old.relayers,
            relayer_ids: old.relayer_ids,
        }
    }
}
