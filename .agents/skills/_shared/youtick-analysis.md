# YouTick App Analysis

## Product in one paragraph

YouTick is a premium video product for creators.
The core promise in the live code is simple:

- creators upload video from the browser
- the video is encrypted before it leaves the device
- fans unlock access with an NFT ticket
- playback happens in the browser after access is verified
- the creator payout split is centered on the 98 / 1 / 1 contract model

This is not a generic Web3 sandbox.
The codebase is optimized around a few real jobs:

- upload and publish premium content
- discover and buy access
- claim gifts
- start quickly with trial onboarding
- watch without heavy wallet friction

## Current live architecture

Use live code as the main source of truth.

Main app pieces:

- `apps/web`: Next.js App Router frontend
- `contracts/nft-ticket`: NEAR contract
- `workers/youtick-kms`: Cloudflare Worker for key custody and access checks
- `workers/web4-proxy`: Web4 proxy worker

The active delivery path is:

- browser-side encryption
- KMS-backed key storage and retrieval
- Crust/IPFS upload and read
- NEAR ownership checks

Legacy names still exist in some places:

- `nova_group_id`
- `StorageType::Nova`
- `apps/web/lib/session-manager.ts`

Treat these as compatibility clues, not as proof that Nova is the main live path.

## Main user journeys

### 1. Upload and publish

Read first:

- `apps/web/app/upload/page.tsx`
- `apps/web/components/UploadForm.tsx`
- `apps/web/lib/upload-session-manager.ts`
- `apps/web/lib/session-manager.ts`
- `apps/web/lib/kms/client.ts`
- `apps/web/lib/video-delivery.ts`

What matters:

- paid and free uploads have different file-size limits
- upload sessions are the preferred publish path
- legacy session-key fallback is still present behind a feature flag
- segmented video delivery is part of the current publish flow
- cost clarity matters because storage, publish, and setup costs meet in one screen

### 2. Discover

Read first:

- `apps/web/app/page.tsx`
- `apps/web/app/discover/page.tsx`
- `apps/web/components/discover/DiscoverView.tsx`
- `apps/web/hooks/useAllVideos.ts`
- `apps/web/components/VideoCard.tsx`

What matters:

- the home page can switch from landing to discover in-place
- there is also a dedicated `/discover` route
- discover has to sell both content quality and trust quickly

### 3. Purchase and watch

Read first:

- `apps/web/app/watch/page.tsx`
- `apps/web/components/TicketPurchaseCard.tsx`
- `apps/web/components/IpfsPlayer.tsx`
- `apps/web/hooks/useOwnedTokens.ts`
- `apps/web/lib/access-grants.ts`

What matters:

- success is not "payment succeeded", it is "the video becomes playable"
- ownership is checked before KMS retrieval
- playback now uses segmented delivery when the manifest is good enough
- cross-chain checkout exists, but it is still feature-flagged and not the default path

### 4. Claim and gift

Read first:

- `apps/web/app/claim/page.tsx`
- `apps/web/components/GiftLinkGenerator.tsx`
- `apps/web/lib/gift-service.ts`

What matters:

- claim links can land in an existing account or create a new one
- secret material is pulled from hash/query and then removed from the URL
- gift flow is both access logic and a growth loop

### 5. Trial onboarding

Read first:

- `apps/web/app/trial/page.tsx`
- `apps/web/components/TrialOnboarding.tsx`
- `apps/web/components/OnboardingKeyInit.tsx`
- `apps/web/lib/gift-service.ts`
- `apps/web/lib/rate-limiter.ts`

What matters:

- onboarding key state lives in localStorage
- key validity is checked against the contract
- trial pool health and daily limits directly affect user success
- trial is not a side feature; it is part of activation

### 6. Profile and creator operations

Read first:

- `apps/web/app/profile/page.tsx`
- `apps/web/hooks/useOwnedTokens.ts`
- `apps/web/components/GiftLinkGenerator.tsx`
- `apps/web/components/TrialUpgradeDialog.tsx`

What matters:

- profile is both library and mini creator dashboard
- created events and owned tickets are intentionally separated
- gifting and trial upgrade actions live close to ownership state

## State and cache realities

These are easy to miss and often explain bugs:

- active account can be wallet, trial account, or EVM-linked implicit account
- trial account ID is stored in localStorage
- EVM-linked NEAR account is stored in localStorage
- onboarding key is stored in localStorage
- session grants are cached in sessionStorage
- KMS auth state is cached per account
- sign-out clears KMS, session-grant, and W3Auth caches

If a flow looks correct in code but still fails in real use, inspect these state layers.

## Operational dependencies

These are product dependencies too:

- KMS worker health and config match
- registry-backed operator setup on mainnet
- onboarding key validity
- trial pool balance
- daily trial usage
- RPC and IPFS failover quality

## Economics and flags

Useful truths to keep in mind:

- creator payout model is centered on 98 / 1 / 1
- upload and purchase still have extra user-facing costs
- `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT` gates the EVM path
- `NEXT_PUBLIC_ENABLE_LEGACY_UPLOAD_FALLBACK` gates the old upload path

## Practical drift warning

Docs are in a better state than before, but drift still exists in names and compatibility layers.

When there is tension between docs and code:

1. trust the route/component/service currently used by the UI
2. treat older compatibility code as real until proven safe to remove
3. verify whether the path is guarded by a feature flag before changing the story

## Load these extra references when needed

- `references/live-code-map.md`
- `references/logic-guardrails.md`
