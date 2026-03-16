# YouTick Operator Registry Contract

Owner-managed registry contract for decryption operators and relayers in the zero-trust target architecture.

## Core responsibilities

- register and deactivate decryption operators
- register and deactivate relayers
- store threshold configuration
- expose active operator and relayer lists

## Main methods

- `upsert_decryption_operator`
- `deactivate_decryption_operator`
- `upsert_relayer`
- `deactivate_relayer`
- `set_threshold_config`
- `set_owner`
