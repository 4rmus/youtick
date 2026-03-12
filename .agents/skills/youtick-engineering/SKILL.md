---
name: youtick-engineering
description: >
  Engineering playbook for the YouTick repo. Use when implementing, refactoring,
  debugging, testing, or reviewing code in this workspace: Next.js frontend,
  NEAR smart contract, Cloudflare workers, upload/playback flows, wallet/session
  logic, IPFS/Crust, KMS, gifts, trials, or architecture decisions specific to
  YouTick.
version: 1.1.0
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
  version: "1.1.0"
---

# youtick-engineering

Engineering guide for shipping safely inside the YouTick codebase.

## First read

Open `../_shared/youtick-analysis.md` first.

Use the shared analysis for:

- product context
- user journey context
- repo map
- known docs drift

Then inspect live code before trusting older docs.

Useful supporting docs:

- `docs/architecture/storage.md`
- `docs/architecture/session-keys.md`
- `docs/architecture/smart-contract.md`

## Core engineering principles

### 1. Code beats docs

Some architecture docs still describe Nova-heavy flows. The current app uses:

- `apps/web/lib/kms/*`
- `workers/youtick-kms/src/index.ts`
- `apps/web/lib/crust/*`

Treat the current code as source of truth.

### 2. Preserve the client-first feel

The product promise depends on keeping core actions close to the browser:

- upload should feel direct
- purchase should minimize wallet interruptions
- playback should unlock fast once access is valid

Do not add backend dependency or extra round-trips unless they clearly improve
security, reliability, or conversion.

### 3. Wallet friction is a product bug

When changing upload, purchase, gift, or trial flows:

- minimize wallet popups
- preserve session/prepaid flows where possible
- keep retry and fallback behavior intact
- avoid breaking trial and implicit-account paths

### 4. Security boundaries matter

Treat these as security-critical:

- ticket ownership checks
- KMS signed request flow
- onboarding keys
- trial pool usage
- gift claim logic
- contract payout logic

Any shortcut here is a product risk, not just a code smell.

### 5. Mainnet assumptions are real

Defaults point to mainnet and `youtick.near`.

Be careful with:

- contract IDs
- storage deposits
- gas constants
- irreversible contract behavior
- public claim/gift URLs

### 6. Operational dependencies are product dependencies

If you touch trial, gift, or onboarding flows, account for:

- onboarding key authorization
- trial pool balance
- daily trial limits
- KMS auth cache behavior
- rate-limiter behavior in `apps/web/lib/rate-limiter.ts`

If these are ignored, the UI may look correct while real users still fail.

## High-value code surfaces

### Upload and publish

Read first:

- `apps/web/components/UploadForm.tsx`
- `apps/web/lib/session-manager.ts`
- `apps/web/lib/upload-session-manager.ts`
- `apps/web/lib/batch-transactions.ts`
- `apps/web/lib/kms/encryption.ts`
- `apps/web/lib/crust/client.ts`

Guardrails:

- keep file-size logic aligned with pricing logic
- keep status/progress steps understandable
- preserve fallback from upload sessions to legacy session keys
- avoid regressions in thumbnail/poster generation

### Purchase and watch

Read first:

- `apps/web/components/TicketPurchaseCard.tsx`
- `apps/web/components/IpfsPlayer.tsx`
- `apps/web/app/watch/page.tsx`
- `apps/web/hooks/useOwnedTokens.ts`
- `apps/web/hooks/useEventDescription.ts`

Guardrails:

- success is "can play" not only "tx succeeded"
- keep free ticket, trial, NEAR wallet, and EVM paths separate in your mind
- label experimental flows clearly in code and UI
- preserve ownership checks before KMS retrieval

### Gifts and onboarding

Read first:

- `apps/web/components/GiftLinkGenerator.tsx`
- `apps/web/app/claim/page.tsx`
- `apps/web/components/TrialOnboarding.tsx`
- `apps/web/lib/gift-service.ts`
- `apps/web/components/OnboardingKeyInit.tsx`

Guardrails:

- gift claim can create a new account or target an existing account
- onboarding key validity and trial pool health affect user success
- do not weaken claim-link secrecy or URL cleanup behavior

### Wallet and account state

Read first:

- `apps/web/components/providers/WalletProvider.tsx`
- `apps/web/lib/trial-wallet.ts`
- `apps/web/lib/keystore-v7.ts`

Guardrails:

- active account may be normal wallet, trial account, or EVM-linked implicit account
- sign-out must clear cached auth state
- wallet changes can affect KMS and Crust auth caches

### Contract work

Read first:

- `contracts/nft-ticket/src/lib.rs`
- `contracts/nft-ticket/tests/sandbox.rs`
- `contracts/nft-ticket/README.md`

Guardrails:

- preserve 98 / 1 / 1 economics
- preserve gift, trial, and free-ticket invariants
- preserve upload session and prepaid flows
- preserve KMS-first behavior while keeping legacy Nova compatibility markers untouched unless you fully migrate them
- be careful with storage, callbacks, and owner-only methods

### Worker work

Read first:

- `workers/youtick-kms/src/index.ts`
- `workers/web4-proxy/src/index.ts`

Guardrails:

- KMS changes touch auth, replay safety, CORS, rate limiting, and access checks
- proxy changes touch caching, headers, and custom-domain behavior

## Engineering workflow

### For a bug fix

1. Find the exact user journey.
2. Reproduce from the page or component entry point.
3. Check contract/worker dependencies before patching the UI.
4. Prefer the smallest fix that preserves existing flow structure.
5. Add or update tests near the affected layer.

### For a new feature

1. Decide which journey changes: upload, discover, purchase, watch, gift, trial, profile.
2. Map the affected layers: frontend only, frontend + worker, or frontend + contract.
3. Identify state and storage implications: React Query, localStorage, sessionStorage, access keys, auth tokens.
4. Preserve bilingual text coverage if UI copy changes.
5. Verify the happy path and at least one failure path.

### For refactors

Refactor only after identifying which behavior is fragile:

- wallet/session interactions
- async purchase state
- video delivery/decryption
- claim/create-account flows

If the flow is user-money or user-access sensitive, prefer clarity over cleverness.

## Testing expectations

Frontend tests already exist under `apps/web/__tests__`.

Useful targets:

- `apps/web/__tests__/integration/upload-flow.test.ts`
- `apps/web/__tests__/integration/gift-claim-flow.test.ts`
- `apps/web/__tests__/unit/session-manager.test.ts`
- `apps/web/__tests__/unit/kms-streaming.test.ts`
- `apps/web/__tests__/unit/video-delivery.test.ts`
- `apps/web/__tests__/unit/video-delivery-segmentation.test.ts`

Contract tests:

- `contracts/nft-ticket/tests/sandbox.rs`

When you change behavior, validate:

- wallet-connected path
- trial/no-wallet path if relevant
- success state
- failure state
- loading/retry state

## Common failure patterns

### Docs mismatch

If a doc mentions `lib/nova/*`, confirm whether the live code still uses that path.
In this repo, KMS-based code is the stronger signal.

### Hidden user state

A bug may be caused by:

- cached KMS auth tokens
- cached W3Auth token state
- trial account ID in localStorage
- EVM-linked implicit account in localStorage
- stale onboarding key

### "Transaction succeeded but user still blocked"

Check:

- ownership refresh timing
- ticket query cache
- KMS access verification
- delayed playback re-init
- post-purchase access sync assumptions

### Performance regressions

Watch for:

- repeated RPC calls instead of using existing helpers
- large blob copies in upload/playback
- gateway retries that block UI too long
- excessive rerenders in purchase/player components

### Anti-abuse and trial edge cases

Check:

- onboarding key validity
- contract-side daily limits
- local best-effort rate limiting
- fallback behavior when trial creation is unavailable

## Repo-specific do and don't

Do:

- keep text changes aligned with `apps/web/lib/translations.ts`
- preserve creator-first economics in copy and UI
- preserve empty/error/loading states on major routes
- respect dirty git state and avoid unrelated files
- keep security-related logs and rate limits understandable

Don't:

- assume a server can be added casually
- remove fallback logic without proving the live contract no longer needs it
- present experimental payment paths as the default path
- break trial onboarding while improving wallet-connected UX
- trust old docs over current code

## Useful references

- `../_shared/youtick-analysis.md`
- `README.md`
- `docs/guides/user-flows.md`
- `docs/architecture/README.md`
- `docs/architecture/storage.md`
- `docs/architecture/session-keys.md`
- `docs/architecture/smart-contract.md`
