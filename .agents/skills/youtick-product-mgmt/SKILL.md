---
name: youtick-product-mgmt
description: >
  Product management playbook for YouTick. Use when writing PRDs, roadmaps,
  prioritization notes, experiment plans, KPI frameworks, release plans,
  requirement breakdowns, user-story maps, or strategy work grounded in the
  actual YouTick product and repo.
version: 1.1.0
license: MIT
platforms:
  - claude
  - gemini
  - openai
  - markdown
tags:
  - youtick
  - product-management
  - roadmap
  - metrics
  - experimentation
  - strategy
metadata:
  author: youtick
  version: "1.1.0"
---

# youtick-product-mgmt

Product guide for making good decisions in YouTick without losing the plot in
technical complexity.

## First read

Open `../_shared/youtick-analysis.md` first.

Then inspect:

- `README.md`
- `docs/guides/user-flows.md`
- `apps/web/app/*`
- `apps/web/components/*`
- `contracts/nft-ticket/src/lib.rs`

## Product thesis

YouTick wins when it helps creators sell premium video directly to fans with:

- much better economics than legacy platforms
- believable access protection
- low enough onboarding friction that fans actually convert

If a proposal improves decentralization rhetoric but hurts creator revenue,
conversion, or playback success, it is probably the wrong priority.

## Primary user segments

### Creators

Jobs to be done:

- upload premium content
- set a price
- sell direct to fans
- keep revenue
- gift access for growth

### Viewers / fans

Jobs to be done:

- discover something worth watching
- understand access quickly
- pay or claim with low friction
- watch without technical headaches

### Trial users

Jobs to be done:

- get in without deep wallet setup
- sample value quickly
- upgrade later if the experience feels worth it

## Operational dependencies

These are product dependencies, not just engineering details:

- onboarding key validity
- trial pool balance
- daily trial limits
- KMS availability
- RPC and gateway failover quality

There is also a best-effort rate limiter in `apps/web/lib/rate-limiter.ts`.
If trial abuse or rollout control matters, treat instrumentation and ops review
as part of the product work.

## Core product loops

### Revenue loop

- creator uploads
- fan buys access
- creator gets paid
- fan watches
- creator sees proof the system works

### Growth loop

- creator gifts access
- new viewer claims
- new viewer watches
- new viewer becomes buyer or repeat viewer

### Activation loop

- viewer lands on content
- trial/gift removes setup friction
- viewer reaches playback
- viewer learns the product through use, not explanation

## Best candidate north-star metric

Use:

- successful content unlocks that reach playable video

Reason:

- it captures browse, access, and playback together
- it is stronger than wallet connects or raw ticket mints

## Supporting KPI suggestions

### Creator metrics

- upload start to publish completion rate
- number of active creators
- creator revenue per active creator
- gift links created per creator

### Viewer metrics

- discover to ticket-detail click-through
- ticket-detail to purchase/claim conversion
- purchase/claim to successful playback rate
- repeat viewing or repeat purchase rate

### Growth metrics

- gift link claim rate
- trial account creation rate
- trial to paid conversion
- referral-originated watch sessions

### Operational metrics

- playback failure rate
- KMS retrieval success rate
- IPFS gateway fallback rate
- trial pool balance health
- daily trial limit utilization

## Experiment rule

If the funnel is poorly instrumented, the first task is often instrumentation.

Do not write an "experiment" that depends on metrics the product does not
reliably capture yet.

## Comparative claim ownership

Some landing comparisons are modeled, not audited.

If product work touches:

- ROI messaging
- commission comparisons
- market positioning claims

assign an owner to re-check the assumptions before launch.

## Priority framework for this repo

When choosing work, sort it into one of these buckets:

### 1. Activation

Work that helps users reach first successful playback faster.

Examples:

- trial simplification
- clearer claim screens
- clearer purchase costs

### 2. Monetization

Work that helps creators earn more or improves purchase conversion.

Examples:

- cleaner purchase UI
- better creator/event presentation
- better pricing communication

### 3. Retention

Work that brings users back.

Examples:

- better profile/library UX
- better gifting loops
- creator re-upload or series workflows

### 4. Trust and reliability

Work that makes the promise believable.

Examples:

- playback reliability
- upload resilience
- clearer failure recovery
- contract and worker hardening

### 5. Strategic expansion

Work that grows the product surface, but only after the core loop is healthy.

Examples:

- richer creator tooling
- stronger community features
- expanded payment paths

## Known product risks

### 1. Docs drift can mislead planning

Some docs describe older Nova-centered architecture.
Always verify plans against current code.

### 2. Analytics layer appears thin

Google Analytics exists, but deeper funnel instrumentation is not clearly mature.
If you want strong experiment design, include an instrumentation task.

### 3. The first-use flow is still doing real work

Wallets, storage deposits, session setup, and claim choices can still create drop-off.

### 4. Trial is an operating dependency

Trial value depends on:

- onboarding key validity
- daily limit headroom
- trial pool funding

### 5. Experimental payments can distract the roadmap

Cross-chain/EVM flow is strategically interesting, but core NEAR purchase + playback
should remain the benchmark path.

## Good PRD structure for YouTick

When writing a PRD or spec, include:

1. User segment
2. Current journey
3. Pain point in plain language
4. Proposed change
5. Why it matters to creator revenue, viewer conversion, or playback success
6. Metrics to watch
7. Rollout or risk notes
8. Contract/worker dependencies if any

## Release planning checklist

Before recommending launch, confirm:

1. Which user journey changes?
2. Is any contract behavior affected?
3. Is KMS or worker behavior affected?
4. Do we need new analytics events?
5. Are TR and EN copy both updated?
6. What is the rollback path if something fails?

## Repo-specific do and don't

Do:

- frame decisions around creator revenue and playable unlocks
- treat trial, gift, and playback as first-class product systems
- ask for instrumentation when funnel visibility is weak
- separate core path from experimental path in planning
- treat operational limits as part of the product experience

Don't:

- prioritize novelty over conversion and reliability
- write roadmap items that ignore on-chain constraints
- assume "wallet connected" means "activated"
- count technical completion as product success
- ship comparison-heavy messaging without validating the assumptions

## Useful references

- `../_shared/youtick-analysis.md`
- `README.md`
- `docs/guides/user-flows.md`
- `docs/architecture/storage.md`
- `docs/architecture/session-keys.md`
- `docs/architecture/smart-contract.md`
- `apps/web/app/page.tsx`
- `apps/web/components/UploadForm.tsx`
- `apps/web/components/TicketPurchaseCard.tsx`
- `apps/web/components/TrialOnboarding.tsx`
- `apps/web/components/OnboardingKeyInit.tsx`
- `apps/web/lib/rate-limiter.ts`
- `contracts/nft-ticket/src/lib.rs`
