# Structure: Contract Macros

For `near-sdk 5.x`, prefer the newer macro style for new contracts.

## Recommended Default

Use:

- `#[near(contract_state)]` on the main state struct
- `#[near]` on the implementation block
- `#[init]` on initialization methods

Keep `#[near_bindgen]` only when maintaining a contract that already uses it consistently and where a macro migration would add unnecessary risk.

## ❌ Incorrect

```rust
pub struct Contract {
    pub owner: AccountId,
}

impl Contract {
    pub fn new(owner: AccountId) -> Self {
        Self { owner }
    }
}
```

Problems:

- The runtime macros are missing.
- Initialization rules are not enforced.
- The state layout is not clearly marked for the contract framework.

## ✅ Correct For New Code

```rust
use near_sdk::{env, near, AccountId, PanicOnDefault};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        assert!(!env::state_exists(), "Contract already initialized");
        Self { owner }
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }
}
```

## Legacy-Compatible Pattern

If the contract already uses `#[near_bindgen]`, keep it consistent inside that codebase instead of mixing macro styles piecemeal.

## Additional Considerations

- Derive only what the state actually needs.
- Keep initialization explicit and single-use.
- Mark view methods with `&self` and state-changing methods with `&mut self`.
- Use stable collection prefixes and think about migration before shipping state changes.
