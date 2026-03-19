---
name: near-smart-contracts
description: >
  Review and implement NEAR smart contracts in Rust using near-sdk 5.x, cargo-near, storage-safe
  state patterns, integration tests, and secure cross-contract calls. Use when editing contracts/*
  or reviewing Rust NEAR contract behavior, macros, storage accounting, callbacks, or deployment.
license: MIT
metadata:
  author: near
---

# NEAR Smart Contracts

Use this skill when the task touches Rust contracts on NEAR.

## 2026 Stable Guidance

- Target `near-sdk 5.x` and build with `cargo near build`.
- For new contracts, prefer `#[near(contract_state)]` on state and `#[near]` on `impl` blocks.
- Keep `#[near_bindgen]` only when maintaining an older codebase that already uses it consistently.
- Use `near-contract-standards` for FT, NFT, and related standards instead of reimplementing them from scratch.
- Use integration tests with Workspaces and unit tests for pure business logic.
- Treat attached deposit, storage growth, callback privacy, and panic or error messages as first-order review concerns.

## Repo Mapping

- `contracts/nft-ticket`: primary contract.
- `contracts/nft-ticket-tests`: integration-style test workspace.

## Read The Relevant Rules

- `rules/structure-near-bindgen.md` for contract macro and initialization patterns.
- `rules/state-collections.md` for collection choice and pagination.
- `rules/xcc-promise-chaining.md` for cross-contract execution.
- `rules/security-storage-checks.md` for storage safety and attached-deposit handling.
- `rules/testing-integration-tests.md` for sandbox and integration testing.

## Review Priorities

1. Can the method accidentally trap or lose funds?
2. Is storage growth paid for or intentionally subsidized?
3. Are callbacks private and failure-aware?
4. Does state shape allow migration or pagination?
5. Are tests covering real deployment paths, not only pure Rust logic?

## Guardrails

- Do not cargo-cult legacy `near_bindgen` snippets into new contracts.
- Avoid `unwrap()` in callback paths where promise failure is expected behavior.
- Expose paginated views for unbounded collections.
- Keep serialization choices explicit and backward-compatible.
