# YouTick App Analysis

## Product summary

YouTick is a creator-first premium video platform built around one core promise:
creators upload encrypted video, fans unlock access with an NFT ticket, and the
creator keeps almost all of the sale.

The product is not a generic Web3 sandbox. Its clearest use cases are:

- musicians selling concert recordings or exclusive drops
- filmmakers selling direct-to-fan screenings
- niche premium creators selling gated video without a large platform taking the margin

The strongest commercial hook in the current app is the 98% creator payout.
The strongest product hook is "premium access without a heavy platform in the
middle." The strongest onboarding hook is "gift links and trial accounts remove
most of the crypto friction for new viewers."

## Current repo reality

The live codebase is built around these pieces:

- `apps/web`: Next.js 16, React 19, Tailwind 4 frontend
- `contracts/nft-ticket`: NEAR smart contract in Rust
- `workers/youtick-kms`: Cloudflare Worker for AES key custody and access checks
- `workers/web4-proxy`: Cloudflare Worker for custom-domain Web4 proxying

Important reality check:

- Some docs still describe a Nova / TEE-centered architecture.
- The current app code uses `lib/kms/*` and the Cloudflare KMS worker as the
  active key custody path.
- Treat the code as the source of truth when docs and code disagree.

## Core user journeys

### 1. Creator upload

Main surface:

- `apps/web/components/UploadForm.tsx`

What happens:

- creator connects wallet
- session/upload authorization is prepared
- video thumbnail and poster thumbnail are generated
- video is encrypted client-side
- encrypted asset is uploaded to IPFS through Crust
- encryption key is stored in KMS
- NFT + event are created on NEAR

Key product truths:

- paid uploads allow much larger files than free uploads
- upload flow tries to preserve a signless feeling through session/prepaid logic
- upload cost visibility matters because the flow mixes storage, mint, and setup costs

### 2. Discovery

Main surfaces:

- `apps/web/app/discover/page.tsx`
- `apps/web/components/discover/DiscoverView.tsx`
- `apps/web/components/VideoCard.tsx`

What happens:

- app reads events/tokens from chain
- videos are shown as premium media cards
- pricing is shown in USD and NEAR contexts

Key product truths:

- discover is both a marketplace and a fallback empty state for the whole app
- the page needs to sell content quality and trust at the same time

### 3. Purchase and watch

Main surfaces:

- `apps/web/app/watch/page.tsx`
- `apps/web/components/TicketPurchaseCard.tsx`
- `apps/web/components/IpfsPlayer.tsx`

What happens:

- user lands on a video or opens the library
- app checks ticket ownership
- if user lacks access, purchase card is shown
- payment can happen through NEAR wallet, trial/free flow, or experimental EVM path
- after access is valid, the app fetches encrypted media, retrieves AES key from KMS,
  decrypts client-side, and plays through the IPFS-based player

Key product truths:

- the real "aha" moment is not purchase alone, it is purchase followed by playback
- trust is built when access feels instant and reliable
- wallet friction and unclear pricing directly hurt conversion

### 4. Gift flow

Main surfaces:

- `apps/web/components/GiftLinkGenerator.tsx`
- `apps/web/app/claim/page.tsx`
- `apps/web/components/TrialOnboarding.tsx`

What happens:

- creator creates gift links for an event
- recipient opens a claim link
- recipient can claim into an existing account or create a new account

Key product truths:

- gifting is one of the best growth loops in the repo
- it turns an owned asset into a referral channel

### 5. Trial onboarding

Main surfaces:

- `apps/web/app/trial/page.tsx`
- `apps/web/components/TrialOnboarding.tsx`
- `apps/web/components/OnboardingKeyInit.tsx`

What happens:

- user can create a sponsored trial account
- free tickets can be claimed without normal wallet friction
- the app monitors onboarding key validity, trial pool balance, and daily usage

Key product truths:

- trial is the main answer to "Web3 is too hard"
- trial health is an operational product dependency, not just a backend detail

### 6. Profile and creator operations

Main surface:

- `apps/web/app/profile/page.tsx`

What happens:

- user sees owned tickets, created events, balance, and upgrade prompts
- creators can generate gift links from their event inventory

Key product truths:

- profile acts as both account center and lightweight creator dashboard
- it is one of the few places where ownership becomes tangible

## Architecture summary

### Frontend

- Next.js App Router app
- global providers for wallet, query, language, theme, and EVM
- bilingual content through `lib/translations.ts`
- dark, cinematic visual system with NEAR accent colors

### Blockchain layer

- NEAR mainnet contract defaults to `youtick.near`
- Rust contract handles events, NFT tickets, prepaid/session flows, gifts, trials,
  bans, commission pools, and free ticket sponsorship

### Storage and security

- video files are encrypted in the browser
- encrypted payloads are uploaded to IPFS through Crust
- AES keys are stored/retrieved through the Cloudflare KMS worker
- KMS verifies access through signed requests and on-chain ownership checks

### Reliability patterns

- RPC failover in frontend and worker
- multi-gateway IPFS retrieval
- chunk/segment-based delivery logic for playback
- fallback logic for older session-key behavior in upload flow

## Operational dependencies

These are not just backend details. They directly affect product success:

- onboarding key availability in localStorage and on-chain authorization
- trial pool balance on the contract
- daily trial count / daily trial limit
- KMS auth cache and wallet state staying in sync
- gateway and RPC failover actually masking network instability

There is also a best-effort anti-abuse layer in `apps/web/lib/rate-limiter.ts`.
It persists to `/tmp/youtick-rate-limits` and syncs global trial count from the
contract. That is useful, but it is not the same thing as a durable, centralized
abuse-control system.

## Economic model

The main contract-level promise is:

- 98% to creator
- 1% to trial pool
- 1% to commission pool

Extra costs still matter in UX:

- NFT storage deposits
- upload/session setup
- optional or configurable service fees

This means marketing can lead with "98% creator payout," but product and design
must still explain total user cost clearly at the moment of action.

## Messaging pillars already present in the app

The current landing and metadata push these ideas hardest:

- creator-first economics
- direct-to-fan ownership
- encrypted premium content
- censorship resistance / no middlemen
- instant or near-instant settlement
- simpler onboarding through gift and trial flows

The hero and landing pages are much more creator-focused than viewer-focused.
That is good for creator acquisition, but it means viewer value often appears
lower in the page hierarchy.

## Measurement and claims caution

Two things can both be true:

- the product story is strong
- not every visible claim is equally "hard"

Examples:

- `98% creator payout` is strongly grounded in contract behavior
- `gift links`, `trial accounts`, and `encrypted access` are grounded in shipped flows
- some landing comparison numbers and ROI comparisons are modeled marketing frames
  and should be re-checked before external campaigns or PR

In practical terms:

- treat product mechanics as stronger proof than marketing comparison widgets
- confirm comparative market claims before treating them as audited facts

## Visual language

The current product uses:

- dark backgrounds
- concert/cinema imagery
- NEAR green, purple, and blue accents
- glow orbs, gradients, glass-card treatment, bold CTAs
- strong contrast and "premium digital stage" energy

There are two visual modes in practice:

- landing mode: emotional, cinematic, aspirational
- app mode: operational, dark, product-focused

Known visual inconsistency:

- trial/onboarding surfaces still lean into older purple-gradient card styling
  that does not fully match the sharper landing/app language

## Strengths

- clear value prop for creators
- strong on-chain product truth behind the headline economics
- differentiated growth loop through gift links
- practical onboarding answer through trial accounts
- good technical story for access control, reliability, and ownership
- bilingual support already exists

## Gaps and risks

### 1. Docs drift

- Architecture docs still mention Nova-heavy flows.
- Current code uses KMS-heavy flows.
- Any strategy, PRD, or implementation plan should verify against live code first.

### 2. Analytics depth looks thin

- Google Analytics exists in app layout.
- There are console metrics and test assertions around operational flows.
- There is no strong evidence of a complete product analytics layer for funnel work.

### 3. Wallet and cost friction still matter

- Session keys reduce friction after setup, but first-time setup still exists.
- Users still encounter storage/top-up concepts that need careful explanation.

### 4. Product complexity can outgrow the message

- The product includes upload sessions, KMS, gifts, trials, prepaid balance,
  stablecoin swaps, and experimental EVM bridges.
- Messaging should not dump all of that at once.
- Each screen should show only the complexity needed for the next decision.

### 5. Experimental payment paths need clear labeling

- EVM / stablecoin flows exist in code.
- They should not be positioned with the same confidence as the core NEAR path
  unless actively verified in the current release.

## Suggested north-star interpretation

If a single product success metric is needed, the cleanest interpretation is:

- successful content unlocks that reach playable video

That is stronger than just counting wallet connects or ticket mints because it
captures the full promise: browse -> pay/claim -> watch.

## Useful files by role

### Engineering

- `apps/web/components/UploadForm.tsx`
- `apps/web/components/TicketPurchaseCard.tsx`
- `apps/web/components/IpfsPlayer.tsx`
- `apps/web/lib/near.ts`
- `apps/web/lib/kms/client.ts`
- `apps/web/lib/crust/client.ts`
- `workers/youtick-kms/src/index.ts`
- `contracts/nft-ticket/src/lib.rs`

### Marketing

- `apps/web/app/layout.tsx`
- `apps/web/app/page.tsx`
- `apps/web/components/landing/*`
- `apps/web/lib/translations.ts`
- `README.md`

### Design

- `apps/web/app/globals.css`
- `apps/web/lib/constants.ts`
- `apps/web/components/landing/*`
- `apps/web/components/ui/*`
- `apps/web/app/watch/page.tsx`
- `apps/web/app/profile/page.tsx`
- `apps/web/components/TrialOnboarding.tsx`

### Product management

- `docs/guides/user-flows.md`
- `README.md`
- `apps/web/app/*`
- `apps/web/components/*`
- `contracts/nft-ticket/src/lib.rs`
- `apps/web/components/OnboardingKeyInit.tsx`
