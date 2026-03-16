# YouTick Access Control Contract

Owner-managed session grant and scope policy contract for the zero-trust target architecture.

## Core responsibilities

- issue and revoke short-lived session grants
- store scope policy
- expose grant verification helpers for relayers and decryption operators
- keep market and registry contract references

## Main methods

- `issue_session_grant`
- `revoke_session_grant`
- `revoke_subject_sessions`
- `set_scope_policy`
- `set_market_contract`
- `set_registry_contract`
- `pause_scope`
- `unpause_scope`
- `set_owner`
