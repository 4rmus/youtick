---
name: near-smart-contracts
description: "Use for YouTick Rust NEAR contract implementation, state, storage, callbacks and tests. Security audit requests also use near-contract-audit; installation does not authorize deployment."
---

# NEAR smart contracts — YouTick

Read root `AGENTS.md`, the affected `contracts/*/Cargo.toml`, Cargo.lock and `docs/testing.md`. The installation baseline is near-sdk `=5.5.0` with `legacy`, Rust 1.86.0 and cargo-near 0.17.0; recheck these files for each task. Never upgrade toolchains, collections, macros or state layouts solely to match a tutorial.

Trace every caller and cross-contract callback before editing a shared method. Keep NEAR authoritative for payment, jobs, publication and entitlement. Preserve storage prefixes, serialized layouts, ABI and existing events unless their change is explicitly in scope. Do not add speculative migrations or delete old state as routine cleanup.

Load only relevant upstream references and verify their APIs against the pinned SDK:

- [Storage and deposits](rules/security-storage-checks.md), [collections](rules/state-collections.md)
- [Contract macros](rules/structure-near-bindgen.md)
- [Promises and callbacks](rules/xcc-promise-chaining.md)
- [Migration](rules/upgrade-migration.md) — only for an authorized state change
- [Integration testing](rules/testing-integration-tests.md) — retain the repository's existing test runner
- [Events and contract tools](rules/best-contract-tools.md) — no new crate merely for an example
- [Chain signatures](rules/chain-signatures.md), [yield/resume](rules/yield-resume.md) — only when the task uses them

Upstream setup/deploy commands are not this project's workflow. Use the existing Contracts checks in `docs/testing.md`, including ABI/protocol checks when interfaces change. Use [youtick-contract-review](../youtick-contract-review/SKILL.md) for repository-specific review and [near-contract-audit](../near-contract-audit/SKILL.md) for vulnerability analysis. A local WASM build is not deployment evidence.

[Original upstream guide](UPSTREAM.md) is retained for provenance and optional examples; use this scoped entrypoint for YouTick. Source and update policy: [sources](../SOURCES.md).
