---
paths:
  - "contracts/**"
  - "protocol/**"
---

# Contracts and protocol

- Toolchain is pinned: `cargo +1.86.0`, cargo-near 0.17.0, `near-sdk = "=5.5.0"` with the `legacy` feature. Re-check `contracts/*/Cargo.toml` and `Cargo.lock` for each task; never upgrade crates, macros, collections, or state layouts to match a tutorial.
- Trace every caller and cross-contract callback before editing a shared method. Private callbacks must distinguish promise success from failure and restore liabilities correctly.
- Preserve storage prefixes, serialized layouts, ABI, and existing events unless their change is explicitly in scope. Do not add speculative migrations or delete old state as cleanup.
- `ft_on_transfer` must keep verifying the configured token predecessor, sender, exact units, requested purpose, and duplicate job/purchase behaviour. A UI or provider success is never entitlement authority.
- Checks come from the Contracts section of `docs/testing.md` (`cargo +1.86.0 test`, `fmt --check`, `clippy -D warnings`, `cargo +1.86.0 near build non-reproducible-wasm`) plus `node scripts/check-paid-media-livepeer-v1-abi.mjs` and `check-paid-media-livepeer-v1.mjs` when interfaces or payloads change. Keep the repository's existing test runner.
- Skills: `near-smart-contracts` for implementation, `youtick-contract-review` for consumer consistency, `near-contract-audit` for security findings. Use the `contract-reviewer` subagent for a read-only review before reporting.
- A local WASM build or passing test is LOCAL_TEST evidence only; it says nothing about deployed contract behaviour. Deployment happens only through protected workflows.
