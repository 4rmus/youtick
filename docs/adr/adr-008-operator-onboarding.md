# ADR-008: Operator Onboarding — Staking, Liveness Challenges, and Slashing

## Status
Deferred until Phase 2 (post-traction)

## Solo Dev Note
Operator staking and slashing require a governance layer to arbitrate disputes. In MVP, operator onboarding is manual via registry owner. This is acceptable when you control or personally trust all operators. Revisit when you want permissionless operator participation.

## Context
The operator registry is a passive directory. The contract owner can add or remove operators arbitrarily. There is no economic incentive for operators to stay online, no penalty for downtime, and no decentralized dispute resolution.

## Decision
1. **Staking requirement:** Every operator must post a bond (e.g., 50 NEAR) to be listed as `active`.
2. **DAO-gated onboarding:** Operator proposals are submitted to the DAO (ADR-001). A 7-day challenge period allows the community to raise objections.
3. **Automated liveness challenges:** The contract (or an off-chain keeper) calls a health endpoint on each operator every N blocks. Missing 3 consecutive challenges marks the operator as `inactive` and slashes 10% of the bond.
4. **Slashing conditions:**
   - Downtime: 10% slash + deactivation.
   - Bad shares (provable once full VSS or an equivalent challenge proof exists): 50% slash + deactivation.
   - Censorship (refusing to serve shares to valid ticket holders, provable via challenge): 25% slash.
5. **Reward pool:** A portion of platform commission (e.g., 0.5% of sales) is distributed to active operators proportional to uptime and stake.

## Consequences
### Positive
- Operators have skin in the game.
- Bad operators are automatically removed without owner intervention.
- Creates a sustainable operator economy.

### Negative
- Capital barrier for new operators (50 NEAR).
- Keeper infrastructure needed for liveness challenges (centralization risk unless decentralized).
- Complex slashing arbitration if operators dispute challenges.

## KPI
- **Governance score:** 2/10 → 7/10
- **Operator economic security:** 0 NEAR at stake → 50 NEAR per operator
- **Automated deactivation time:** Manual / never → 3 challenge periods

## Validation
- Integration test: operator misses 3 challenges; bond reduced by 5 NEAR; `active` set to false.
- DAO simulation: operator proposal passes; 7-day challenge period; no objections; operator activated.

## Open Questions
- Who runs the keeper? DAO treasury bounty for keepers?
- Should slashed NEAR go to a treasury, burn, or redistribute to users?
- Is 50 NEAR too high or too low for mainnet operator bonds?
