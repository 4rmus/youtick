# ADR-001: Governance — Multi-Sig / DAO as Contract Owner

## Status
Deferred until Phase 2 (post-traction)

## Solo Dev Note
This ADR is intentionally deferred. As a solo developer shipping an MVP, the operational overhead of a 3-of-5 multi-sig (key ceremony, signer coordination, gas costs) outweighs the security benefit. The 24h timelock (ADR-002) provides sufficient key-compromise protection for the MVP phase. Revisit this when traction justifies the overhead (see `docs/decentralization-audit-2026-solo-mvp.md`).

## Context
All three YouTick contracts (`nft-ticket`, `access-control`, `operator-registry`) currently use a single `owner_id` account. Compromise of this one private key grants total protocol control: fund withdrawal, content moderation, operator set manipulation, and contract pausing. The `nft-ticket` contract does not even have an ownership transfer mechanism.

## Decision
Replace single-owner control with a **3-of-5 NEAR MultiSig contract** (or SputnikDAO v3) as the `owner_id` on all contracts. All admin actions require 3 signatures. Ownership transfer follows the existing two-step `propose_owner` + `accept_ownership` flow where the MultiSig is the proposed owner.

## Consequences
### Positive
- Owner key compromise no longer equals protocol takeover.
- Operator onboarding/offboarding becomes a transparent, auditable proposal process.
- Treasury actions (withdrawals) require consensus.

### Negative
- Emergency response is slower (must gather 3 signers).
- Gas cost increases slightly for every admin transaction.
- Key ceremony and signer rotation require operational discipline.

## KPI
- **Governance score:** 2/10 → 7/10
- **Admin actions requiring multi-sig:** 0% → 100%

## Validation
- `near view <contract> get_owner` returns MultiSig account ID.
- Integration test: 2-of-5 proposal fails; 3-of-5 proposal succeeds.

## Open Questions
- Which 5 signers? Mix of core team, external security partner, community delegate?
- SputnikDAO vs NEAR MultiSig — DAO enables token voting later, MultiSig is simpler today.
