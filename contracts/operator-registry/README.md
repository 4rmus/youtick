# YouTick Operator Registry Contract

Timelock-managed registry of decryption operators, relayers and threshold
configuration. Web app and KMS workers read this contract to discover
authorized operators.

**Mainnet:** `registry.youtick.near`
**Admin posture:** timelock — direct admin calls are rejected; use
`propose_action` + 24h delay + `execute_action`.

---

## Core responsibilities

- register and deactivate decryption operators
- register and deactivate relayers
- store threshold configuration (`{ total_operators, required_shares }`)
- expose active operator and relayer lists
- route admin changes through timelock

---

## Main methods

### Change methods (timelocked)

- `upsert_decryption_operator`, `deactivate_decryption_operator`
- `upsert_relayer`, `deactivate_relayer`
- `set_threshold_config`
- `pause_contract`, `unpause_contract`
- `propose_action`, `execute_action`, `cancel_action`
- `propose_owner`, `accept_ownership`
- `set_owner` — `#[deprecated]`; use the two-step path

Pre-staged emergency proposals (launch plan §SB-3, IDs 7-12):
`Pause` + `DeactivateDecryptionOperator` for `kms-{a..e}.youtick.near`.

### View methods

- `get_decryption_operator`, `list_decryption_operators`
- `get_relayer`, `list_relayers`
- `get_threshold_config`
- `is_active_decryption_operator`, `is_active_relayer`
- `get_timelock`

---

## Build & test

```bash
rustup target add wasm32-unknown-unknown
cargo near build non-reproducible-wasm
cargo test
```
