---
name: youtick-engineering
description: >
  Engineering playbook for the YouTick repo. Use when implementing, debugging,
  testing, reviewing, profiling, triaging incidents, or hardening releases
  across the Next.js app, NEAR contracts, workers, wallet/session logic,
  upload/playback flows, IPFS/Crust, KMS, gifts, or trials.
version: 1.3.0
license: MIT
platforms:
  - claude
  - gemini
  - openai
  - markdown
tags:
  - youtick
  - engineering
  - nextjs
  - near
  - cloudflare-workers
  - ipfs
metadata:
  author: youtick
  version: "1.3.0"
---

# youtick-engineering

Engineering guide for making safe changes in the live YouTick product.

## Do not use this skill when

- the task is mainly UI layout or interaction design
- the task is mainly positioning, landing copy, or campaign messaging
- the task is mainly roadmap, KPI, or launch-planning work

## First read

Open these first:

- `../_shared/youtick-analysis.md`
- `../_shared/references/live-code-map.md`
- `../_shared/references/logic-guardrails.md`

Then inspect the live route, component, or service you are changing.

## What this skill optimizes for

- preserve the main user journey
- keep wallet friction low
- protect access and payout logic
- avoid "transaction succeeded but user is still blocked"
- prefer live-code truth over old architecture stories

## Choose the journey before you patch

Classify the work first:

- upload and publish
- discover
- purchase and watch
- gift and claim
- trial onboarding
- profile and creator operations
- contract-only or worker-only change

Do not start from a utility file unless you already know which journey broke.

## Live surfaces to inspect first

### Upload and publish

- `apps/web/components/UploadForm.tsx`
- `apps/web/lib/upload-session-manager.ts`
- `apps/web/lib/session-manager.ts`
- `apps/web/lib/kms/client.ts`
- `apps/web/lib/video-delivery.ts`

Watch for:

- upload-session path vs legacy fallback
- segmented-delivery packaging
- storage-fee math and user copy staying aligned
- publish success meaning both chain write and usable media path

### Purchase and watch

- `apps/web/components/TicketPurchaseCard.tsx`
- `apps/web/components/IpfsPlayer.tsx`
- `apps/web/app/watch/page.tsx`
- `apps/web/lib/access-grants.ts`

Watch for:

- ownership refresh timing
- KMS grant and auth flow
- playback manifest quality gates
- feature-flagged EVM checkout staying clearly secondary

### Gift and trial

- `apps/web/app/claim/page.tsx`
- `apps/web/components/TrialOnboarding.tsx`
- `apps/web/components/OnboardingKeyInit.tsx`
- `apps/web/lib/gift-service.ts`
- `apps/web/lib/rate-limiter.ts`

Watch for:

- claim link secrecy and URL cleanup
- onboarding-key validity
- trial pool and daily-limit dependency
- localStorage/sessionStorage state carrying old auth

### Wallet and account state

- `apps/web/components/providers/WalletProvider.tsx`
- `apps/web/lib/trial-wallet.ts`
- `apps/web/lib/keystore-v7.ts`

Watch for:

- account priority: wallet, then trial, then EVM-linked account
- sign-out clearing all relevant caches
- wallet state changes affecting KMS, access grants, and Crust auth

### Contract and worker

- `contracts/nft-ticket/src/lib.rs`
- `workers/youtick-kms/src/index.ts`
- `workers/web4-proxy/src/index.ts`

Watch for:

- payout invariants
- access control and replay protection
- operator and registry assumptions on mainnet
- legacy compatibility fields that still affect live reads

## Working method

### For a bug

1. Start from the user-visible page.
2. Reproduce the exact path in code.
3. Check cache and account-state layers.
4. Check contract or worker dependency before changing UI behavior.
5. Fix the smallest thing that keeps the main path stable.

### For a new feature

1. Name the journey that changes.
2. List affected layers: UI, lib, worker, contract.
3. Note which local or remote state is touched.
4. Keep bilingual text coverage if copy changes.
5. Verify happy path plus at least one failure path.

### For a refactor

Refactor only after naming the fragile behavior:

- upload authorization
- payment completion
- playback unlock
- claim/create-account flow
- wallet handoff

If money or access is involved, prefer clarity over cleverness.

## High-value guardrails

- Do not remove fallback logic just because it looks old.
- Do not treat experimental payment code as the benchmark path.
- Do not assume a successful chain call means the user can proceed.
- Do not forget session grants, KMS auth cache, and local account state.
- Do not change creator economics casually.

## Testing expectations

Read and extend nearby tests when behavior changes.

Good starting points:

- `apps/web/__tests__/integration/upload-flow.test.ts`
- `apps/web/__tests__/integration/gift-claim-flow.test.ts`
- `apps/web/__tests__/unit/access-grants.test.ts`
- `apps/web/__tests__/unit/kms-streaming.test.ts`
- `apps/web/__tests__/unit/video-delivery-player.test.ts`
- `contracts/nft-ticket/tests/sandbox.rs`

Always think through:

- connected-wallet path
- trial or no-wallet path when relevant
- success state
- loading and retry state
- failure and recovery state

## When to pair this skill with another

- Use `near-api-js` for NEAR RPC, keys, and action wiring.
- Use `near-smart-contracts` for Rust contract edits or reviews.
- Use `crust-network` for upload or IPFS gateway work.
- Use `near-intents` for cross-chain checkout logic.

## Repo-specific do and don't

Do:

- follow the journey from route to lib to contract or worker
- preserve creator-first economics and low-friction access
- keep loading, empty, and error states intact
- respect existing feature flags and rollout boundaries

Don't:

- trust old names more than live behavior
- weaken access checks for convenience
- break trial onboarding while polishing wallet-first UX
- count a successful transaction as the whole user outcome

## Useful references

- `../_shared/youtick-analysis.md`
- `../_shared/references/live-code-map.md`
- `../_shared/references/logic-guardrails.md`
