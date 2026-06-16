# ADR-009: Emergency Content Takedown and Q4 2026 DAO Handover

## Status

Accepted (alpha-only). Owner authority for emergency takedown is
**transitional**. Multisig/DAO handover is a stated direction; DAO design
is deferred to **Q3 2026** with scope discussion through Q3-Q4. The end-of-Q4-2026
date previously written here is treated as a target, not a hard contract
commitment, until the governance topology is selected.

## Context

The platform is built around browser-side encryption, on-chain entitlement and
share-based playback. Once a creator publishes an event, the encrypted media is
on Lighthouse/IPFS and the entitlement is on-chain. Without an explicit takedown
path, the platform cannot respond to:

- non-consensual sexual content,
- child sexual abuse material (CSAM),
- imminent-harm material,
- material whose continued distribution creates personal liability.

Two pre-existing controls were not sufficient on their own:

1. **`ban_event`** is owner-only and intended for non-emergency moderation.
   It is too broad for illegal-content emergency response by itself.
2. **Provider pin/cache removal** is off-chain and per-provider; it does not
   produce a verifiable on-chain audit trail.

A separate problem is governance: in alpha, all takedown authority is held by a
single owner key. This is a centralization risk and a single-point-of-failure.

## Decision

### 1. Emergency takedown path (`takedown_event`)

A new contract method `takedown_event(encrypted_cid, reason)` is added with the
following properties:

- **Owner-only.** `predecessor_account_id() == owner_id` is required.
- **No timelock.** The 24-hour delay used by `ban_event` is bypassed.
- **Works while paused.** Emergency response must not depend on contract
  liveness; `assert_not_paused()` is intentionally not called.
- **Same storage as `ban_event`.** Both write to `lazy_banned_events()`. Frontend
  filtering uses one uniform check (`is_event_banned`).
- **Distinct audit trail.** Every takedown emits a NEP-297
  `event_takedown` log with `{encrypted_cid, reason, by, at}`. Abuse of the
  authority is detectable on-chain.
- **Idempotent.** A second takedown of an already-banned event panics.
- **Accepts the existing `BanReason` enum** so the moderation taxonomy stays
  unified.

### 2. Two-track moderation

| Track | Method | Latency | Use case |
|---|---|---|---|
| Planned | `ban_event` | Reviewed owner action | Copyright disputes, ToS violations resolvable on a normal review schedule. |
| Emergency | `takedown_event` (no timelock) | Immediate | Illegal content, imminent harm. |

The two paths share state but produce different NEP-297 events, so external
indexers can treat them differently for transparency reporting.

### 3. Off-chain operational obligations

Contract takedown removes the entitlement and hides the event. The encrypted
bytes can persist on IPFS until pins drop. Operationally, when an emergency
takedown is issued the owner MUST:

1. Remove pins from every active persistence provider for the encrypted CID.
2. Where applicable, instruct the five KMS operators to delete the corresponding
   shares from KV storage. (This is a legal/operational requirement for
   illegal content where existence of the key fragments is itself harmful.)
3. Purge or denylist any hot media delivery cache that may still serve the
   encrypted bytes.
4. Publish the takedown in the monthly transparency report (see §5).

### 4. DAO handover (target, not hard deadline)

The owner-key authority is acceptable only as a temporary alpha measure.
DAO design is targeted for **Q3 2026**, with topology selection
(multisig vs. DAO; signer set; quorum) ahead of any
`propose_owner` to a new governance address. End-of-Q4-2026 is the
indicative target window; the actual handover date is conditional on
topology selection and traction.

Concretely:

- **Q3 2026:** select governance topology.
- **Q3-Q4 2026:** scope discussion + transparency page (`docs/public/transparency.md`).
- **Post-decision:** `propose_owner` to the new governance address; accept
  ownership from the new address; update runbooks and ADRs.
- **Post-handover:** `takedown_event` remains technically owner-only, but
  "owner" then means the multisig/DAO.

### 5. Transparency reporting

Until handover, the owner publishes a **monthly transparency report**
listing every takedown:

- `encrypted_cid`
- `reason` (sexual_content, copyright_violation, other)
- `at` (block timestamp)
- A short rationale (free text, no PII).

Source-of-truth is the on-chain `event_takedown` NEP-297 stream. The monthly
report is a human-readable view of that stream.

## Consequences

### Positive

- Platform can respond to illegal content in seconds rather than 24 hours.
- Public NEP-297 audit trail discourages silent or arbitrary removals.
- Governance commitment (Q4 2026) is recorded, not implicit.
- ToS / acceptable-use policy now has a concrete enforcement mechanism.

### Negative

- The owner key is a single point of failure until Q4 2026; key compromise
  during this window allows arbitrary takedowns. Mitigation: hardware wallet
  for owner key; on-chain monitoring of `event_takedown` stream by an external
  watcher (Telegram alert).
- Off-chain pin / share deletion is not enforced by the contract; the contract
  only removes entitlement. Operational discipline is required.
- The handover deadline is a self-imposed commitment; missing it without
  explanation is a credibility cost.

## KPI

- **Decentralization score (governance):** 1/10 → 6/10 after handover.
- **Time-to-takedown for illegal content:** 24h → < 5 min.
- **Public auditability of moderation actions:** opaque (off-chain) →
  on-chain NEP-297 stream + monthly report.

## Validation

- Unit tests cover: owner-only enforcement, missing-event panic, double-takedown
  rejection, "works while paused" property, NEP-297 log emission. (See
  `contracts/nft-ticket/src/lib.rs::tests::takedown_event_*`.)
- Frontend filters out `banned: true` events on listing and refuses playback
  with a "Removed by platform" surface.
- Telegram monitoring alerts on every `event_takedown` log.

## Open Questions

- After Q4 2026 handover, should `takedown_event` keep immediate execution
  under quorum or move to a short-window delay with emergency override?
- Should an external escrow or transparency watcher be required to co-sign
  takedowns even before the DAO handover?
- Legal: in which jurisdictions is contract-side takedown sufficient vs. where
  is gateway-side blocking also required?
