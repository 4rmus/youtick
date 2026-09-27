---
name: youtick-contract-review
description: "Use to review YouTick Market/access-control contract changes and their Web/Bridge/protocol consumers, especially ABI, entitlement, payment and callback invariants."
---

# YouTick contract review

Repository-relative entrypoints: `contracts/nft-ticket/src/lib.rs`, `contracts/access-control/src/lib.rs`, their manifests/tests, and `protocol/paid-media-livepeer-v1/`. Inspect the actual diff and every consumer of the changed method; do not copy a historical deployment state from a document.

For a security review use [near-contract-audit](../near-contract-audit/SKILL.md) as the general checklist. Check these project boundaries:

- `ft_on_transfer` verifies the configured token predecessor, sender, exact units, requested purpose and duplicate job/purchase behavior. A UI/provider success is not entitlement authority.
- Private callbacks distinguish promise success/failure and restore liabilities correctly; trace withdrawals, refunds and final events without inventing a platform-withdrawal success event.
- Publication/entitlement/device checks remain consistent with Web and Bridge. D1 is a derived read model. Livepeer readiness alone cannot authorize a sale or playback.
- Preserve storage layout/prefixes, maintenance guards, expiry and bounded work. Compare compact/readable payloads and ABI fixtures if transaction formats change.

Choose Contracts checks from `docs/testing.md`, plus ABI/protocol and affected Web/Bridge tests when interfaces change. A review-only task reports findings; it does not apply a migration, build a new agent platform or change contract code. Give location, concrete failure condition, financial/access effect and test evidence for each finding. Local checks cannot establish deployed contract behavior.
