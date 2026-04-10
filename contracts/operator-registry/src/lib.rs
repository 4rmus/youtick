use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::{LookupMap, UnorderedSet};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault};

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum OperatorKind {
    DecryptionOperator,
    Relayer,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct OperatorRecord {
    pub account_id: AccountId,
    pub endpoint: String,
    pub transport_public_key: String,
    pub kind: OperatorKind,
    pub active: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct ThresholdConfig {
    pub total_operators: u8,
    pub required_shares: u8,
}

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    DecryptionOperators,
    DecryptionOperatorIds,
    Relayers,
    RelayerIds,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OperatorRegistryContract {
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
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            pending_owner_id: None,
            threshold_config: ThresholdConfig {
                total_operators: 5,
                required_shares: 3,
            },
            decryption_operators: LookupMap::new(StorageKey::DecryptionOperators),
            decryption_operator_ids: UnorderedSet::new(StorageKey::DecryptionOperatorIds),
            relayers: LookupMap::new(StorageKey::Relayers),
            relayer_ids: UnorderedSet::new(StorageKey::RelayerIds),
        }
    }

    pub fn upsert_decryption_operator(
        &mut self,
        account_id: AccountId,
        endpoint: String,
        transport_public_key: String,
    ) {
        self.assert_owner();
        let record = OperatorRecord {
            account_id: account_id.clone(),
            endpoint,
            transport_public_key,
            kind: OperatorKind::DecryptionOperator,
            active: true,
        };
        self.decryption_operators.insert(&account_id, &record);
        self.decryption_operator_ids.insert(&account_id);
    }

    pub fn deactivate_decryption_operator(&mut self, account_id: AccountId) {
        self.assert_owner();
        let mut record = self
            .decryption_operators
            .get(&account_id)
            .expect("Decryption operator not found");
        record.active = false;
        self.decryption_operators.insert(&account_id, &record);
    }

    pub fn upsert_relayer(
        &mut self,
        account_id: AccountId,
        endpoint: String,
        transport_public_key: String,
    ) {
        self.assert_owner();
        let record = OperatorRecord {
            account_id: account_id.clone(),
            endpoint,
            transport_public_key,
            kind: OperatorKind::Relayer,
            active: true,
        };
        self.relayers.insert(&account_id, &record);
        self.relayer_ids.insert(&account_id);
    }

    pub fn deactivate_relayer(&mut self, account_id: AccountId) {
        self.assert_owner();
        let mut record = self.relayers.get(&account_id).expect("Relayer not found");
        record.active = false;
        self.relayers.insert(&account_id, &record);
    }

    pub fn set_threshold_config(&mut self, total_operators: u8, required_shares: u8) {
        self.assert_owner();
        require!(total_operators > 0, "Total operators must be greater than zero");
        require!(required_shares > 0, "Required shares must be greater than zero");
        require!(
            required_shares <= total_operators,
            "Required shares cannot exceed total operators",
        );
        // OR-1 fix: Validate total_operators matches actual registered operator count
        let actual_operator_count = self.decryption_operator_ids.len() as u8;
        require!(
            total_operators == actual_operator_count,
            "total_operators must match actual registered operator count",
        );

        self.threshold_config = ThresholdConfig {
            total_operators,
            required_shares,
        };
    }

    // OW-1 fix: Two-step ownership transfer (propose + accept)
    pub fn propose_owner(&mut self, proposed_owner_id: AccountId) {
        self.assert_owner();
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

    pub fn get_decryption_operator(&self, account_id: AccountId) -> Option<OperatorRecord> {
        self.decryption_operators.get(&account_id)
    }

    pub fn list_decryption_operators(&self) -> Vec<OperatorRecord> {
        self.decryption_operator_ids
            .iter()
            .filter_map(|account_id| self.decryption_operators.get(&account_id))
            .collect()
    }

    pub fn get_relayer(&self, account_id: AccountId) -> Option<OperatorRecord> {
        self.relayers.get(&account_id)
    }

    pub fn list_relayers(&self) -> Vec<OperatorRecord> {
        self.relayer_ids
            .iter()
            .filter_map(|account_id| self.relayers.get(&account_id))
            .collect()
    }

    pub fn get_threshold_config(&self) -> ThresholdConfig {
        self.threshold_config.clone()
    }

    pub fn is_active_decryption_operator(&self, account_id: AccountId) -> bool {
        self.decryption_operators
            .get(&account_id)
            .map(|record| record.active)
            .unwrap_or(false)
    }

    pub fn is_active_relayer(&self, account_id: AccountId) -> bool {
        self.relayers
            .get(&account_id)
            .map(|record| record.active)
            .unwrap_or(false)
    }
}

impl OperatorRegistryContract {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the contract owner can call this method",
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, AccountId};

    fn account(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn context(predecessor: &str) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(account(predecessor));
        builder
    }

    #[test]
    fn upserts_and_deactivates_operator() {
        testing_env!(context("owner.testnet").build());
        let mut contract = OperatorRegistryContract::new(account("owner.testnet"));

        contract.upsert_decryption_operator(
            account("operator-1.testnet"),
            "https://operator-1.example".to_string(),
            "ed25519:operator-key".to_string(),
        );
        assert!(contract.is_active_decryption_operator(account("operator-1.testnet")));

        contract.deactivate_decryption_operator(account("operator-1.testnet"));
        assert!(!contract.is_active_decryption_operator(account("operator-1.testnet")));
    }

    #[test]
    fn upserts_and_deactivates_relayer() {
        testing_env!(context("owner.testnet").build());
        let mut contract = OperatorRegistryContract::new(account("owner.testnet"));

        contract.upsert_relayer(
            account("relayer-1.testnet"),
            "https://relayer-1.example".to_string(),
            "ed25519:relayer-key".to_string(),
        );
        assert!(contract.is_active_relayer(account("relayer-1.testnet")));

        contract.deactivate_relayer(account("relayer-1.testnet"));
        assert!(!contract.is_active_relayer(account("relayer-1.testnet")));
    }

    #[test]
    fn validates_threshold_configuration() {
        testing_env!(context("owner.testnet").build());
        let mut contract = OperatorRegistryContract::new(account("owner.testnet"));

        // Register 3 operators first to match threshold config
        for i in 1..=3 {
            contract.upsert_decryption_operator(
                account(&format!("operator-{}.testnet", i)),
                format!("https://operator-{}.example", i),
                format!("ed25519:key-{}", i),
            );
        }

        contract.set_threshold_config(3, 2);
        let config = contract.get_threshold_config();

        assert_eq!(config.total_operators, 3);
        assert_eq!(config.required_shares, 2);
    }

    #[test]
    #[should_panic(expected = "total_operators must match actual registered operator count")]
    fn rejects_threshold_mismatch_with_actual_operators() {
        testing_env!(context("owner.testnet").build());
        let mut contract = OperatorRegistryContract::new(account("owner.testnet"));

        // No operators registered, but trying to set total_operators = 5
        contract.set_threshold_config(5, 3);
    }
}
