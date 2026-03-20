# YouTick Logic Guardrails

## State layers that often explain bugs

- wallet account from wallet selector
- trial account from localStorage
- EVM-linked implicit account from localStorage
- onboarding key from localStorage
- session grants from sessionStorage
- KMS auth cache
- W3Auth cache

If a bug is hard to explain, inspect these before assuming the core logic is wrong.

## Security-sensitive boundaries

Treat these as high-risk:

- ticket ownership checks before playback
- KMS challenge and retrieval flow
- upload authorization
- onboarding key usage
- gift claim logic
- payout logic in the contract

Do not simplify these casually.

## Mainnet realities

Defaults point to mainnet-style behavior.
Be careful with:

- contract IDs
- storage deposits
- irreversible contract methods
- public gift and claim URLs
- worker config that must match app config

## Operational dependencies

These are part of product quality:

- KMS health and correct network or contract config
- registry operator readiness on mainnet
- onboarding key validity
- trial pool balance
- daily trial count
- RPC failover quality
- IPFS gateway failover quality

## Economics and rollout boundaries

Keep these stable unless the task explicitly changes them:

- 98 / 1 / 1 payout framing
- creator-first economics
- NEAR as the benchmark purchase path
- cross-chain checkout behind feature flag
- legacy upload fallback behind feature flag

## Current implementation truths

- upload prefers upload sessions over legacy session keys
- playback prefers segmented delivery when the manifest qualifies
- purchase success should lead to watch success quickly
- sign-out clears multiple auth layers, not just wallet state
- claim flow removes secret data from the URL after reading it

## Common failure patterns

### Payment worked but playback did not

Check:

- ownership refetch timing
- stale access state
- KMS auth or session grant issue
- player re-init after purchase

### Trial or gift feels flaky

Check:

- onboarding key validity
- daily limit reached
- trial pool low
- localStorage holding old account state

### Upload reaches chain but media path is broken

Check:

- segmented-delivery packaging
- poster or thumbnail refs
- KMS store step
- IPFS upload result handling

## Testing surfaces worth keeping in mind

- `apps/web/__tests__/integration/upload-flow.test.ts`
- `apps/web/__tests__/integration/gift-claim-flow.test.ts`
- `apps/web/__tests__/unit/access-grants.test.ts`
- `apps/web/__tests__/unit/video-delivery.test.ts`
- `apps/web/__tests__/unit/video-delivery-player.test.ts`
- `contracts/nft-ticket/tests/sandbox.rs`

## Messaging and copy caution

- translate technical reality into simple user language
- do not headline experimental paths as if they are the main product
- comparative charts and ROI messaging should be treated carefully
- keep EN and TR consistency if user-facing copy changes
