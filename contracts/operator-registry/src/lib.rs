use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::{LazyOption, LookupMap, UnorderedSet};
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

pub const TIMELOCK_DELAY_NS: u64 = 86_400_000_000_000; // 24 hours

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub enum TimelockAction {
    UpsertDecryptionOperator {
        account_id: AccountId,
        endpoint: String,
        transport_public_key: String,
    },
    DeactivateDecryptionOperator {
        account_id: AccountId,
    },
    UpsertRelayer {
        account_id: AccountId,
        endpoint: String,
        transport_public_key: String,
    },
    DeactivateRelayer {
        account_id: AccountId,
    },
    SetThresholdConfig {
        total_operators: u8,
        required_shares: u8,
    },
    Pause,
    Unpause,
    ProposeOwner {
        proposed_owner_id: AccountId,
    },
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TimelockProposal {
    pub action: TimelockAction,
    pub proposer: AccountId,
    pub proposed_at: u64,
}

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    DecryptionOperators,
    DecryptionOperatorIds,
    Relayers,
    RelayerIds,
    Timelocks,
    TimelockCounter,
    ContractPaused,
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
    paused: LazyOption<bool>,
    timelocks: LookupMap<u64, TimelockProposal>,
    timelock_counter: LazyOption<u64>,
}

#[near]
impl OperatorRegistryContract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            pending_owner_id: None,
            threshold_config: ThresholdConfig {
                total_operators: 0,
                required_shares: 0,
            },
            decryption_operators: LookupMap::new(StorageKey::DecryptionOperators),
            decryption_operator_ids: UnorderedSet::new(StorageKey::DecryptionOperatorIds),
            relayers: LookupMap::new(StorageKey::Relayers),
            relayer_ids: UnorderedSet::new(StorageKey::RelayerIds),
            paused: LazyOption::new(StorageKey::ContractPaused, Some(&false)),
            timelocks: LookupMap::new(StorageKey::Timelocks),
            timelock_counter: LazyOption::new(StorageKey::TimelockCounter, Some(&0)),
        }
    }

    pub fn upsert_decryption_operator(
        &mut self,
        account_id: AccountId,
        endpoint: String,
        transport_public_key: String,
    ) {
        let _ = (account_id, endpoint, transport_public_key);
        Self::panic_timelock_required()
    }

    fn upsert_decryption_operator_timelocked(
        &mut self,
        account_id: AccountId,
        endpoint: String,
        transport_public_key: String,
    ) {
        let record = OperatorRecord {
            account_id: account_id.clone(),
            endpoint,
            transport_public_key,
            kind: OperatorKind::DecryptionOperator,
            active: true,
        };
        self.decryption_operators.insert(&account_id, &record);
        self.decryption_operator_ids.insert(&account_id);
        let active_count = self.active_decryption_operator_count();
        self.threshold_config.total_operators = active_count;
        if self.threshold_config.required_shares == 0 {
            self.threshold_config.required_shares = 1;
        }
    }

    pub fn deactivate_decryption_operator(&mut self, account_id: AccountId) {
        let _ = account_id;
        Self::panic_timelock_required()
    }

    fn deactivate_decryption_operator_timelocked(&mut self, account_id: AccountId) {
        let mut record = self
            .decryption_operators
            .get(&account_id)
            .expect("Decryption operator not found");
        require!(record.active, "Decryption operator is already inactive");
        let remaining_active = self.active_decryption_operator_count().saturating_sub(1);
        require!(
            remaining_active >= self.threshold_config.required_shares,
            "Cannot deactivate operator below required shares",
        );
        record.active = false;
        self.decryption_operators.insert(&account_id, &record);
        self.threshold_config.total_operators = remaining_active;
    }

    pub fn upsert_relayer(
        &mut self,
        account_id: AccountId,
        endpoint: String,
        transport_public_key: String,
    ) {
        let _ = (account_id, endpoint, transport_public_key);
        Self::panic_timelock_required()
    }

    fn upsert_relayer_timelocked(
        &mut self,
        account_id: AccountId,
        endpoint: String,
        transport_public_key: String,
    ) {
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
        let _ = account_id;
        Self::panic_timelock_required()
    }

    fn deactivate_relayer_timelocked(&mut self, account_id: AccountId) {
        let mut record = self.relayers.get(&account_id).expect("Relayer not found");
        record.active = false;
        self.relayers.insert(&account_id, &record);
    }

    pub fn set_threshold_config(&mut self, total_operators: u8, required_shares: u8) {
        let _ = (total_operators, required_shares);
        Self::panic_timelock_required()
    }

    fn set_threshold_config_timelocked(&mut self, total_operators: u8, required_shares: u8) {
        require!(
            total_operators > 0,
            "Total operators must be greater than zero"
        );
        require!(
            required_shares > 0,
            "Required shares must be greater than zero"
        );
        require!(
            required_shares <= total_operators,
            "Required shares cannot exceed total operators",
        );
        // OR-1 fix: Validate total_operators matches actual registered operator count
        let actual_operator_count = self.active_decryption_operator_count();
        require!(
            total_operators == actual_operator_count,
            "total_operators must match actual registered operator count",
        );

        self.threshold_config = ThresholdConfig {
            total_operators,
            required_shares,
        };
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
            TimelockAction::UpsertDecryptionOperator {
                account_id,
                endpoint,
                transport_public_key,
            } => {
                self.upsert_decryption_operator_timelocked(
                    account_id,
                    endpoint,
                    transport_public_key,
                );
            }
            TimelockAction::DeactivateDecryptionOperator { account_id } => {
                self.deactivate_decryption_operator_timelocked(account_id);
            }
            TimelockAction::UpsertRelayer {
                account_id,
                endpoint,
                transport_public_key,
            } => {
                self.upsert_relayer_timelocked(account_id, endpoint, transport_public_key);
            }
            TimelockAction::DeactivateRelayer { account_id } => {
                self.deactivate_relayer_timelocked(account_id);
            }
            TimelockAction::SetThresholdConfig {
                total_operators,
                required_shares,
            } => {
                self.set_threshold_config_timelocked(total_operators, required_shares);
            }
            TimelockAction::Pause => {
                self.pause_contract_timelocked();
            }
            TimelockAction::Unpause => {
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

    pub fn is_paused(&self) -> bool {
        self.paused.get().unwrap_or(false)
    }

    pub fn get_decryption_operator(&self, account_id: AccountId) -> Option<OperatorRecord> {
        if self.is_paused() {
            return None;
        }
        self.decryption_operators.get(&account_id)
    }

    pub fn list_decryption_operators(&self) -> Vec<OperatorRecord> {
        if self.is_paused() {
            return Vec::new();
        }

        self.decryption_operator_ids
            .iter()
            .filter_map(|account_id| self.decryption_operators.get(&account_id))
            .collect()
    }

    pub fn get_relayer(&self, account_id: AccountId) -> Option<OperatorRecord> {
        if self.is_paused() {
            return None;
        }
        self.relayers.get(&account_id)
    }

    pub fn list_relayers(&self) -> Vec<OperatorRecord> {
        if self.is_paused() {
            return Vec::new();
        }
        self.relayer_ids
            .iter()
            .filter_map(|account_id| self.relayers.get(&account_id))
            .collect()
    }

    pub fn get_threshold_config(&self) -> ThresholdConfig {
        self.threshold_config.clone()
    }

    pub fn is_active_decryption_operator(&self, account_id: AccountId) -> bool {
        if self.is_paused() {
            return false;
        }

        self.decryption_operators
            .get(&account_id)
            .map(|record| record.active)
            .unwrap_or(false)
    }

    pub fn is_active_relayer(&self, account_id: AccountId) -> bool {
        if self.is_paused() {
            return false;
        }

        self.relayers
            .get(&account_id)
            .map(|record| record.active)
            .unwrap_or(false)
    }

    fn active_decryption_operator_count(&self) -> u8 {
        self.decryption_operator_ids
            .iter()
            .filter(|account_id| {
                self.decryption_operators
                    .get(account_id)
                    .map(|record| record.active)
                    .unwrap_or(false)
            })
            .count() as u8
    }
}

impl OperatorRegistryContract {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the contract owner can call this method",
        );
    }

    fn panic_timelock_required() -> ! {
        env::panic_str("Use propose_action and execute_action for this admin action")
    }

    fn next_timelock_id(&mut self) -> u64 {
        let id = self.timelock_counter.get().unwrap_or(0);
        self.timelock_counter.set(&(id + 1));
        id
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

    fn context(predecessor: &str, timestamp_ns: u64) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(account(predecessor));
        builder.block_timestamp(timestamp_ns);
        builder
    }

    #[test]
    fn upserts_and_deactivates_operator_via_timelock() {
        let mut ts = 1_000u64;
        testing_env!(context("owner.testnet", ts).build());
        let mut contract = OperatorRegistryContract::new(account("owner.testnet"));

        let id = contract.propose_action(TimelockAction::UpsertDecryptionOperator {
            account_id: account("operator-1.testnet"),
            endpoint: "https://operator-1.example".to_string(),
            transport_public_key: "ed25519:operator-key".to_string(),
        });

        ts += TIMELOCK_DELAY_NS;
        testing_env!(context("owner.testnet", ts).build());
        contract.execute_action(id);
        assert!(contract.is_active_decryption_operator(account("operator-1.testnet")));

        let id = contract.propose_action(TimelockAction::UpsertDecryptionOperator {
            account_id: account("operator-2.testnet"),
            endpoint: "https://operator-2.example".to_string(),
            transport_public_key: "ed25519:operator-key-2".to_string(),
        });
        ts += TIMELOCK_DELAY_NS;
        testing_env!(context("owner.testnet", ts).build());
        contract.execute_action(id);

        let id = contract.propose_action(TimelockAction::DeactivateDecryptionOperator {
            account_id: account("operator-1.testnet"),
        });

        ts += TIMELOCK_DELAY_NS;
        testing_env!(context("owner.testnet", ts).build());
        contract.execute_action(id);
        assert!(!contract.is_active_decryption_operator(account("operator-1.testnet")));
        let config = contract.get_threshold_config();
        assert_eq!(config.total_operators, 1);
        assert_eq!(config.required_shares, 1);
    }

    #[test]
    fn upserts_and_deactivates_relayer_via_timelock() {
        let mut ts = 1_000u64;
        testing_env!(context("owner.testnet", ts).build());
        let mut contract = OperatorRegistryContract::new(account("owner.testnet"));

        let id = contract.propose_action(TimelockAction::UpsertRelayer {
            account_id: account("relayer-1.testnet"),
            endpoint: "https://relayer-1.example".to_string(),
            transport_public_key: "ed25519:relayer-key".to_string(),
        });

        ts += TIMELOCK_DELAY_NS;
        testing_env!(context("owner.testnet", ts).build());
        contract.execute_action(id);
        assert!(contract.is_active_relayer(account("relayer-1.testnet")));

        let id = contract.propose_action(TimelockAction::DeactivateRelayer {
            account_id: account("relayer-1.testnet"),
        });

        ts += TIMELOCK_DELAY_NS;
        testing_env!(context("owner.testnet", ts).build());
        contract.execute_action(id);
        assert!(!contract.is_active_relayer(account("relayer-1.testnet")));
    }

    #[test]
    fn validates_threshold_configuration_via_timelock() {
        let mut ts = 1_000u64;
        testing_env!(context("owner.testnet", ts).build());
        let mut contract = OperatorRegistryContract::new(account("owner.testnet"));

        // Register 3 operators first to match threshold config
        for i in 1..=3 {
            let id = contract.propose_action(TimelockAction::UpsertDecryptionOperator {
                account_id: account(&format!("operator-{}.testnet", i)),
                endpoint: format!("https://operator-{}.example", i),
                transport_public_key: format!("ed25519:key-{}", i),
            });
            ts += TIMELOCK_DELAY_NS;
            testing_env!(context("owner.testnet", ts).build());
            contract.execute_action(id);
        }

        let id = contract.propose_action(TimelockAction::SetThresholdConfig {
            total_operators: 3,
            required_shares: 2,
        });
        ts += TIMELOCK_DELAY_NS;
        testing_env!(context("owner.testnet", ts).build());
        contract.execute_action(id);

        let config = contract.get_threshold_config();
        assert_eq!(config.total_operators, 3);
        assert_eq!(config.required_shares, 2);
    }

    #[test]
    fn pause_hides_operator_and_relayer_authorization_views() {
        let mut ts = 1_000u64;
        testing_env!(context("owner.testnet", ts).build());
        let mut contract = OperatorRegistryContract::new(account("owner.testnet"));
        let operator_id = account("operator.testnet");
        let relayer_id = account("relayer.testnet");

        for action in [
            TimelockAction::UpsertDecryptionOperator {
                account_id: operator_id.clone(),
                endpoint: "https://operator.example".to_string(),
                transport_public_key: "ed25519:operator".to_string(),
            },
            TimelockAction::UpsertRelayer {
                account_id: relayer_id.clone(),
                endpoint: "https://relayer.example".to_string(),
                transport_public_key: "ed25519:relayer".to_string(),
            },
            TimelockAction::Pause,
        ] {
            let id = contract.propose_action(action);
            ts += TIMELOCK_DELAY_NS;
            testing_env!(context("owner.testnet", ts).build());
            contract.execute_action(id);
        }

        assert!(contract
            .get_decryption_operator(operator_id.clone())
            .is_none());
        assert!(contract.get_relayer(relayer_id.clone()).is_none());
        assert!(contract.list_decryption_operators().is_empty());
        assert!(contract.list_relayers().is_empty());
        assert!(!contract.is_active_decryption_operator(operator_id));
        assert!(!contract.is_active_relayer(relayer_id));
    }

    #[test]
    #[should_panic(expected = "Use propose_action and execute_action for this admin action")]
    fn direct_set_threshold_config_requires_timelock() {
        testing_env!(context("owner.testnet", 1_000).build());
        let mut contract = OperatorRegistryContract::new(account("owner.testnet"));

        contract.set_threshold_config(5, 3);
    }
}
