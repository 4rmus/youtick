---
name: youtick-payment-flow
description: "Use for YouTick upload fees, ticket purchases, USDC settlement, multi-asset/1Click checkout, duplicate payments, refunds and entitlement reconciliation."
---

# YouTick payment flow

Read root `AGENTS.md`. Paths below are relative to the repository root. Identify which existing rail the task affects before proposing a change:

- Native USDC upload/ticket flow: `contracts/nft-ticket/src/lib.rs` (`ft_on_transfer`), `apps/web/lib/livepeer-upload.ts`, `apps/web/lib/near-auth-ticket-purchase.ts` and their callers.
- Multi-asset/1Click: `apps/web/lib/multi-asset-payments.ts`, `workers/livepeer-bridge/src/payments.ts`, their tests and the contract settlement path. The default mode is `off`; read actual flags and do not infer live activation from source availability.

Trace quote → user authorization → deposit/swap → destination funds → contract settlement → final entitlement/job. Use the actual state names and transitions in code, not a new generic checkout state machine. A 1Click SUCCESS, redirect or signed transaction alone does not prove a settled YouTick purchase.

Check token/network/account/purpose binding, quote deadlines, refund address, unit precision, minimum amounts and rounding against current contract code. Treat repeated notifications, timeout and unknown broadcast outcome separately from confirmed failure. Reconcile the same transaction/job/checkout before any new payment; never solve a provider failure by paying or uploading again.

Preserve NEAR economic authority, existing duplicate protection and D1's derived role. Real funding, swap/deposit, refund or purchase needs the authorized exact scope/amount and user signature; this skill does not supply that permission. Never expose keys or payment credentials.

Choose existing Web multi-asset, Bridge payment and Contracts checks from `docs/testing.md`; exercise invalid binding, duplicate processing, expiry, refund and ambiguous result paths relevant to the change. Use [near-intents](../near-intents/SKILL.md) for 1Click request/response, status and fee details, and current official `https://docs.near-intents.org/` documentation for anything it does not cover. Keep provider status and chain finality evidence separate from local mocks.
