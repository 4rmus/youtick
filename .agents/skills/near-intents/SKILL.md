---
name: near-intents
description: "Use for the YouTick 1Click (NEAR Intents) server-side swap path: quote, deposit submit, status polling, token ids, fees and authentication as used by the Bridge and multi-asset checkout. Not a generic swap-widget or other-chain wallet trigger; payment reconciliation belongs to youtick-payment-flow."
---

# NEAR Intents 1Click — YouTick

Read root `AGENTS.md` and [youtick-payment-flow](../youtick-payment-flow/SKILL.md) first. The project calls 1Click from `workers/livepeer-bridge/src/payments.ts` (`/v0/quote`, `/v0/status` at `1click.chaindefuser.com`) and `apps/web/lib/multi-asset-payments.ts`; the multi-asset mode defaults to `off`. Read the actual flags, state names and tests before changing anything; do not add a React swap widget, a second client, or another chain's wallet because the upstream guide shows one.

Read only the reference relevant to the change:

- [Lifecycle, statuses, authentication, fees](references/concepts.md)
- [Quote request and response](rules/api-quote.md) — `dry: true` previews, `dry: false` returns a deposit address valid for a short window
- [Token ids](rules/api-tokens.md) — always use `assetId` from `/v0/tokens`
- [Deposit submit](rules/api-deposit-submit.md) and [status polling](rules/api-status.md) — terminal states `SUCCESS`, `FAILED`, `REFUNDED`, `INCOMPLETE_DEPOSIT`
- [NEAR-side deposit](rules/deposit-near.md) — NEP-141 transfer to the quoted deposit address
- [API key and user auth](rules/api-user-auth.md) — unauthenticated quotes carry an extra fee; keys are secrets, never log or commit them
- [Official SDKs](rules/sdk.md), [server example](rules/server-example.md) — illustrations only; the installed worker code is the baseline

Rules the upstream guide does not state for this project: a 1Click `SUCCESS` is a provider status, not a settled YouTick purchase or entitlement; the contract settlement and final event decide. Bind quote, refund address, token, network, amount and purpose to the pending record before any deposit; reconcile `PENDING_DEPOSIT`, `KNOWN_DEPOSIT_TX`, `PROCESSING`, timeouts and unknown broadcast outcomes before creating a new quote or paying again. Fee tiers and status lists change; verify against current `https://docs.near-intents.org/` when amounts or statuses matter.

Choose Bridge payment and Web multi-asset checks from `docs/testing.md`; mock 1Click responses are LOCAL_TEST. Real quotes, deposits and refunds need the authorized exact scope, provider credentials and user signatures; this skill supplies none of them.

[Original upstream guide](UPSTREAM.md) is retained for provenance together with its remaining rules (React widget and hooks, EVM/Solana/TON/Tron/Stellar deposits, orders, confidential swaps, Hyperliquid, passive deposit, ANY_INPUT withdrawals, intents balance); open those only when the user actually requests such a feature. Source and update policy: [sources](../SOURCES.md).
