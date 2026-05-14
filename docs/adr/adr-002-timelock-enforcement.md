# ADR-002: Timelock Admin Posture for V1 Public Alpha

## Status
Accepted (alpha-only). NFT market admin is owner-only; registry timelock is
live; access timelock is **deferred** for the current alpha (live
`access.youtick.near` build does not export `propose_action` /
`get_timelock` — see launch plan §SB-3).

V1 deliberately ships as an owner-controlled public alpha to reduce launch
complexity. Full timelock-managed access governance is a later hardening
path, not a V1 requirement.

## Context
`nft-ticket` has a 24-hour timelock (`TIMELOCK_DELAY_NS`) and a
`TimelockAction` enum, but V1 public alpha keeps direct owner-only NFT admin
paths. `access-control` and `operator-registry` use timelock for admin changes.

## Decision
For the V1 public alpha, keep NFT market admin owner-only and make the release
posture explicit. Registry/access admin remains timelock-managed.
Destructive/debug paths must be disabled outside migration builds, and
user-facing docs must not claim full timelock governance.

## Consequences
### Positive
- Registry/access changes remain delayed and reviewable.
- The NFT admin limitation is explicit instead of hidden behind governance
  wording.

### Negative
- NFT owner key compromise remains a centralization risk during public alpha.
- This is acceptable only as a temporary V1 posture before multisig/DAO
  handover.

## KPI
- **Registry/access admin:** timelock-managed
- **NFT admin:** owner-only public-alpha posture, clearly documented

## Validation
- Unit tests cover registry/access direct admin rejection and timelock success.
- Unit tests cover NFT owner-only enforcement for V1 admin methods.

## Open Questions
- Should we add a "fast pause" path with a shorter delay (e.g., 1 hour) for active exploits?
- How do we notify users of pending timelock proposals (on-chain events + indexer)?
