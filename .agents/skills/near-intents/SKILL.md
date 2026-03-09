---
name: near-intents
description: >
  Integrate NEAR Intents 1Click Swap for cross-chain token swaps, status tracking, fees, and
  historical explorer queries. Use when working on repo code under apps/web/lib/intents, swap
  widgets, bridge-like UX, partner API authentication, or multi-chain token routing.
license: MIT
metadata:
  author: near
---

# NEAR Intents

Use this skill for distribution-channel style integrations built on NEAR Intents.

## 2026 Stable Guidance

- `1Click API` is the recommended integration path for user-facing swap flows.
- Always source token identifiers from `GET /v0/tokens`; never hand-build `assetId` values.
- Use `dry: true` for previews and `dry: false` only when the user confirms, so you do not create unnecessary deposit addresses.
- Authenticated requests with a partner JWT avoid the extra anonymous 1Click platform fee and give better production-grade access.
- Non-dry quote requests go through stricter compliance screening; treat blocked quotes as expected product behavior, not generic API failure.
- Use the Explorer API for swap history, dashboards, and support tooling instead of overloading the live swap endpoints.

## Repo Mapping

- `apps/web/lib/intents/one-click-client.ts`: current SDK wrapper.
- `apps/web/lib/intents/config.ts`: base URL, referral, fee settings.
- `apps/web/lib/intents/types.ts`: UI-facing quote and status types.

## Default Flow

1. Fetch tokens and cache them.
2. Request a dry quote for preview.
3. Request a committed quote only at confirmation time.
4. Submit the deposit transaction.
5. Optionally call deposit-submit to accelerate processing.
6. Poll status until a terminal state is reached.

## Read Next

- `rules/api-tokens.md` for token discovery and caching.
- `rules/api-quote.md` for quote construction and advanced request fields.
- `rules/api-deposit-submit.md` for post-deposit acceleration.
- `rules/api-status.md` for status polling and terminal states.
- `rules/intents-balance.md` only if the product explicitly uses `INTENTS` balances instead of chain-to-chain transfers.
- `references/concepts.md` for lifecycle and vocabulary.

## Guardrails

- There is no testnet; use small-value mainnet tests.
- Do not use `amountOutUsd` or similar display fields for settlement logic.
- Keep `refundTo`, `recipient`, and their `Type` fields aligned with the origin and destination chains.
- Treat `customRecipientMsg` as advanced and risky unless the recipient contract is fully controlled.
