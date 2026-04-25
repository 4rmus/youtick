# ADR-003: Session Grant — Self-Issuance + On-Chain Proof-of-Key-Ownership

## Status
Accepted for MVP — Critical Bug Fix

## Context
`access-control/src/lib.rs:140-146` restricts `issue_session_grant` to `owner_id`, `market_contract_id`, or `registry_contract_id`. The frontend (`apps/web/lib/access-grants.ts:206-230`) has end users call this method directly via their wallet. This is architecturally incompatible: normal users cannot issue their own session grants.

## Decision
1. Change authorization to: `caller == target_owner_id || caller == self.owner_id || caller == self.market_contract_id || caller == self.registry_contract_id`.
2. Add a `session_pok: String` parameter: an Ed25519 signature proving the caller knows the private key corresponding to `session_pk`.
3. The contract verifies `session_pok` before storing the grant.
4. Frontend `ensureSessionGrant` signs a challenge with the ephemeral session private key and includes it in the transaction.

## Consequences
### Positive
- Session grants become a true user-controlled capability, not an admin-issued token.
- Replay resistance improves because the grant is bound to a proven keypair.
- Removes the hidden assumption that the market contract will proxy all user grants.

### Negative
- Slightly larger transaction payload (signature bytes).
- Wallet popup still required per grant issuance (unless we move to FCAK device keys).

## KPI
- **On-chain verified critical auth decisions:** ~40% → 80%
- **Session grant issuance success rate for non-owner wallets:** 0% → 100%

## Validation
- `cargo test` in `access-control` passes with self-issued grants.
- Playwright e2e: non-owner wallet connects, plays video, no admin key used.

## Open Questions
- Should we allow `target_owner_id != caller` for delegated issuance (e.g., gift bots)?
- Gas cost of Ed25519 verify in NEAR WASM — acceptable?
