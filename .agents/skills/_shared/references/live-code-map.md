# YouTick Live Code Map

## Route map

### Landing and discover entry

- `apps/web/app/page.tsx`
- `apps/web/app/discover/page.tsx`
- `apps/web/components/discover/DiscoverView.tsx`
- `apps/web/components/landing/*`

Notes:

- the home page can switch between landing and discover
- discover also exists as its own route

### Upload

- `apps/web/app/upload/page.tsx`
- `apps/web/components/UploadForm.tsx`
- `apps/web/components/CostReceipt.tsx`
- `apps/web/lib/upload-session-manager.ts`
- `apps/web/lib/session-manager.ts`
- `apps/web/lib/video-delivery.ts`
- `apps/web/lib/kms/client.ts`

### Watch and purchase

- `apps/web/app/watch/page.tsx`
- `apps/web/components/VideoPlayer.tsx`
- `apps/web/components/IpfsPlayer.tsx`
- `apps/web/components/TicketPurchaseCard.tsx`
- `apps/web/hooks/useOwnedTokens.ts`
- `apps/web/hooks/useEventDescription.ts`
- `apps/web/lib/access-grants.ts`

### Claim and gift

- `apps/web/app/claim/page.tsx`
- `apps/web/components/GiftLinkGenerator.tsx`
- `apps/web/lib/gift-service.ts`

### Trial onboarding

- `apps/web/app/trial/page.tsx`
- `apps/web/components/TrialOnboarding.tsx`
- `apps/web/components/OnboardingKeyInit.tsx`
- `apps/web/lib/gift-service.ts`
- `apps/web/lib/rate-limiter.ts`

### Profile

- `apps/web/app/profile/page.tsx`
- `apps/web/components/TrialUpgradeDialog.tsx`
- `apps/web/hooks/useOwnedTokens.ts`

## Core shared services

### Wallet and account state

- `apps/web/components/providers/WalletProvider.tsx`
- `apps/web/lib/trial-wallet.ts`
- `apps/web/lib/keystore-v7.ts`
- `apps/web/lib/near.ts`

### KMS and access

- `apps/web/lib/kms/client.ts`
- `apps/web/lib/kms/encryption.ts`
- `apps/web/lib/kms/streaming.ts`
- `apps/web/lib/access-grants.ts`
- `workers/youtick-kms/src/index.ts`

### IPFS and delivery

- `apps/web/lib/crust/*`
- `apps/web/lib/ipfs-media.ts`
- `apps/web/lib/video-delivery.ts`
- `apps/web/lib/video-delivery-player.ts`

### Payments and checkout

- `apps/web/hooks/useNearPrice.ts`
- `apps/web/lib/price.ts`
- `apps/web/lib/intents/*`
- `apps/web/lib/evm/*`
- `apps/web/components/PaymentMethodSelector.tsx`

### Contract

- `contracts/nft-ticket/src/lib.rs`
- `contracts/nft-ticket/tests/sandbox.rs`

## First-read combos by task

### Upload bug

- `apps/web/components/UploadForm.tsx`
- `apps/web/lib/upload-session-manager.ts`
- `apps/web/lib/session-manager.ts`

### Playback bug

- `apps/web/components/IpfsPlayer.tsx`
- `apps/web/lib/access-grants.ts`
- `apps/web/lib/kms/client.ts`
- `apps/web/lib/video-delivery-player.ts`

### Claim or trial bug

- `apps/web/app/claim/page.tsx`
- `apps/web/components/TrialOnboarding.tsx`
- `apps/web/lib/gift-service.ts`
- `apps/web/components/OnboardingKeyInit.tsx`

### Wallet-state bug

- `apps/web/components/providers/WalletProvider.tsx`
- `apps/web/lib/trial-wallet.ts`
- `apps/web/lib/keystore-v7.ts`

### Pricing or payout question

- `apps/web/components/CostReceipt.tsx`
- `apps/web/lib/constants.ts`
- `contracts/nft-ticket/src/lib.rs`

### Positioning or copy work

- `apps/web/app/page.tsx`
- `apps/web/components/landing/*`
- `apps/web/lib/translations.ts`
