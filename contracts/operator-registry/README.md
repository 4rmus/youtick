# YouTick Operator Registry Contract

Timelock-managed registry contract for decryption operators and relayers in the zero-trust target architecture.

## Core responsibilities

- register and deactivate decryption operators
- register and deactivate relayers
- store threshold configuration
- expose active operator and relayer lists
- route admin changes through `propose_action` and `execute_action`

## Main methods

- `upsert_decryption_operator`
- `deactivate_decryption_operator`
- `upsert_relayer`
- `deactivate_relayer`
- `set_threshold_config`
- `propose_action`
- `execute_action`
- `set_owner`
