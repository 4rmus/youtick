---
name: near-contract-audit
description: "Use for a requested or necessary security review of Rust NEAR contracts: authorization, callback failure, storage, arithmetic and economic abuse. Produces evidence-based findings; does not deploy or certify security."
---

# NEAR contract audit — bounded review

Read root `AGENTS.md` and [youtick-contract-review](../youtick-contract-review/SKILL.md). Agree on the review surface from the task; an ordinary Rust edit does not imply a whole-repository audit. Review is read-only unless fixes were requested.

Trace entrypoint → caller authority → state change → external promise → callback success/failure. Inspect existing tests and use applicable checks from `docs/testing.md`. Do not install a scanner merely because this skill mentions automated analysis.

Load relevant vulnerability examples:

- [Access control, callback and storage patterns](references/high-severity.md)
- [Gas, randomness and promise patterns](references/medium-severity.md)
- [Storage costs and arithmetic](references/low-severity.md)

The upstream category names are not the final severity. Financial rounding, overflow or missing storage coverage can be severe in this application. Confirm reachability, existing guards and actual loss/denial impact; a regex match or missing macro alone is not proof.

For each actionable finding report file/line, trigger, impact, existing protection, a minimal reproduction or missing test, and the smallest fix. Separate confirmed defects from hypotheses. Record what was not examined. This is a code review, not an independent external audit or a security certificate.

[Original upstream guide](UPSTREAM.md) is retained for provenance and optional examples; use this scoped entrypoint for YouTick. Source and update policy: [sources](../SOURCES.md).
