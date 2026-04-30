# YouTick Access Control Contract

Timelock-managed session grant and scope policy contract for the zero-trust target architecture.

## Core responsibilities

- issue and revoke short-lived session grants
- verify `session_pok` so a grant can only be created by someone holding the session private key
- store scope policy
- expose grant verification helpers for relayers and decryption operators
- keep market and registry contract references
- route admin changes through `propose_action` and `execute_action`

## Main methods

- `issue_session_grant`
- `revoke_session_grant`
- `revoke_subject_sessions`
- `set_scope_policy`
- `set_market_contract`
- `set_registry_contract`
- `pause_scope`
- `unpause_scope`
- `propose_action`
- `execute_action`
- `set_owner`
