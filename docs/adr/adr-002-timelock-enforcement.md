# ADR-002: Timelock — Enforce Exclusive Use for All Admin Actions

## Status
Superseded for V1 public alpha

V1 deliberately ships as an owner-controlled public alpha to reduce launch
complexity. Timelock governance remains a later hardening path, not a V1
requirement.

## Context
`nft-ticket` has a 24-hour timelock (`TIMELOCK_DELAY_NS`) and a `TimelockAction` enum, but **every** timelocked action also has a direct owner-only bypass function. This makes the timelock a logging mechanism, not a security control.

## Decision
For the V1 public alpha, keep direct owner-only admin paths and make the release
posture explicit. Destructive/debug paths must be disabled outside migration
builds, and user-facing docs must not claim full timelock governance.

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
