# ADR-002: Timelock — Enforce Exclusive Use for All Admin Actions

## Status
Accepted for MVP

## Context
`nft-ticket` has a 24-hour timelock (`TIMELOCK_DELAY_NS`) and a `TimelockAction` enum, but **every** timelocked action also has a direct owner-only bypass function. This makes the timelock a logging mechanism, not a security control.

## Decision
**Remove all direct owner-only admin paths.** Every sensitive action (pause, ban, withdrawal, onboarding key changes, operator registry changes, event removal) MUST route through `propose_action` → 24h delay → `execute_action`. The only exception is `cancel_action`, which remains owner-only (or multi-sig gated) for emergency reversal.

## Consequences
### Positive
- Attacker who compromises a single signer cannot instantly drain funds or censor content.
- Users have 24h to review on-chain proposals and exit if malicious.

### Negative
- Genuine emergencies (e.g., active exploit) cannot be stopped instantly.
- Mitigation: keep `pause_scope` in `access-control` as a fast emergency brake, but require multi-sig.

## KPI
- **Direct owner bypass functions remaining:** 0
- **Timelock coverage:** 100% of fund-moving and censorship actions

## Validation
- `grep -n "owner_id" contracts/nft-ticket/src/lib.rs` shows only timelock checks and view methods.
- Unit test: direct `withdraw_trial_pool` call panics; timelock path succeeds after delay.

## Open Questions
- Should we add a "fast pause" path with a shorter delay (e.g., 1 hour) for active exploits?
- How do we notify users of pending timelock proposals (on-chain events + indexer)?
