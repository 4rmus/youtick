use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseResult,
};

const FT_ON_TRANSFER_GAS: Gas = Gas::from_tgas(30);
const FT_RESOLVE_GAS: Gas = Gas::from_tgas(10);
const STORAGE_MIN_YOCTO: u128 = 1_250_000_000_000_000_000_000;

#[near(serializers = [json])]
pub struct StorageBalance {
    total: U128,
    available: U128,
}

#[near(serializers = [json])]
pub struct StorageBalanceBounds {
    min: U128,
    max: Option<U128>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockFt {
    balances: LookupMap<AccountId, u128>,
}

#[near]
impl MockFt {
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128) -> Self {
        let mut balances = LookupMap::new(b"b");
        balances.insert(&owner_id, &total_supply.0);
        Self { balances }
    }

    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        StorageBalanceBounds {
            min: U128(STORAGE_MIN_YOCTO),
            max: Some(U128(STORAGE_MIN_YOCTO)),
        }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.is_registered(&account_id).then_some(StorageBalance {
            total: U128(STORAGE_MIN_YOCTO),
            available: U128(0),
        })
    }

    #[payable]
    pub fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        let account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        let attached = env::attached_deposit().as_yoctonear();
        let required = if self.is_registered(&account_id) {
            0
        } else {
            STORAGE_MIN_YOCTO
        };
        require!(attached >= required, "Insufficient storage deposit");
        if required > 0 {
            self.balances.insert(&account_id, &0);
        }
        let refund = attached - required;
        if refund > 0 {
            Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(refund));
        }
        let _ = registration_only;
        self.storage_balance_of(account_id).unwrap()
    }

    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        assert_eq!(env::attached_deposit(), NearToken::from_yoctonear(1));
        let sender_id = env::predecessor_account_id();
        self.transfer(&sender_id, &receiver_id, amount.0);
        let _ = memo;

        Promise::new(receiver_id.clone())
            .function_call(
                "ft_on_transfer".to_string(),
                json!({
                    "sender_id": sender_id,
                    "amount": amount,
                    "msg": msg,
                })
                .to_string()
                .into_bytes(),
                NearToken::from_yoctonear(0),
                FT_ON_TRANSFER_GAS,
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "ft_resolve_transfer".to_string(),
                    json!({
                        "sender_id": sender_id,
                        "receiver_id": receiver_id,
                        "amount": amount,
                    })
                    .to_string()
                    .into_bytes(),
                    NearToken::from_yoctonear(0),
                    FT_RESOLVE_GAS,
                ),
            )
    }

    #[private]
    pub fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let unused = match env::promise_result(0) {
            PromiseResult::Successful(value) => near_sdk::serde_json::from_slice::<U128>(&value)
                .map(|value| value.0)
                .unwrap_or(amount.0),
            PromiseResult::Failed => amount.0,
        }
        .min(amount.0)
        .min(self.balance(&receiver_id));

        if unused > 0 {
            self.transfer(&receiver_id, &sender_id, unused);
        }
        U128(amount.0 - unused)
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balance(&account_id))
    }

    fn transfer(&mut self, sender_id: &AccountId, receiver_id: &AccountId, amount: u128) {
        assert!(amount > 0, "amount must be positive");
        require!(self.is_registered(sender_id), "Sender is not registered");
        require!(
            self.is_registered(receiver_id),
            "Receiver is not registered"
        );
        let sender_balance = self.balance(sender_id);
        assert!(sender_balance >= amount, "insufficient balance");
        self.balances.insert(sender_id, &(sender_balance - amount));
        let receiver_balance = self
            .balance(receiver_id)
            .checked_add(amount)
            .expect("balance overflow");
        self.balances.insert(receiver_id, &receiver_balance);
    }

    fn balance(&self, account_id: &AccountId) -> u128 {
        self.balances.get(account_id).unwrap_or(0)
    }

    fn is_registered(&self, account_id: &AccountId) -> bool {
        self.balances.contains_key(account_id)
    }
}
