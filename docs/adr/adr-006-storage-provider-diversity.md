# ADR-006: Storage Provider Abstraction and Lighthouse Pilot

## Status
Accepted for phased implementation

## Implementation Progress
- Phase 0 docs alignment: done.
- Phase 1 storage provider adapter: done; the old Crust upload adapter has now
  been removed from the public write path.
- Phase 2 Storage API Worker for Lighthouse secret management and pin/status checks: done.
- Phase 3 Lighthouse-only storage path for new uploads: done.
- Phase 4 Media Delivery Worker for encrypted IPFS routing, Range
  forwarding, edge cache headers and gateway fallback: done.
- Phase 5 frontend read-path flag for Media Delivery Worker: done.
- Phase 6 guarded Lighthouse primary upload path with per-file/chunk uploads
  + NEP-413 upload challenge auth: done. Authless `/uploads/intent` returns
  `Unauthorized`.
- Phase 7 Crust runtime read fallback removal: done. Public IPFS gateway
  fallback remains.

Next step: keep NEAR as the primary smoke path and mark stablecoin/cross-chain
rails experimental unless a release verifies them end to end.

## Context
New uploads use Lighthouse/IPFS for encrypted delivery assets. Read paths still
keep multiple IPFS gateways; the Crust-specific runtime fallback has been
removed.

The next storage work should reduce provider lock-in without changing the
access model. Lighthouse is a persistence pilot, not a replacement for YouTick
KMS. KMS operators remain the source of ticket, ban, session-grant and key-share
authorization.

## Decision
1. Keep a small storage provider boundary around upload and persistence
   verification behavior.
2. Make Lighthouse the only active provider for new uploads. Do not keep a
   Crust-specific runtime read fallback.
3. Add a separate Storage API Worker before using Lighthouse API keys. Browser
   code must never receive Lighthouse secrets.
4. Keep media delivery separate from provider management. The media delivery
   Worker routes encrypted manifests and segments, forwards Range reads, caches
   hot non-Range assets and falls back across gateways.
5. Make Lighthouse the guarded primary upload path through per-file and
   per-chunk uploads. Do not send the full video or full delivery bundle as one
   Worker request.
6. Do not mix Lighthouse Kavach/token-gating with YouTick KMS in the first
   phase.

## Consequences
### Positive
- Creates a clean point for Lighthouse/Filecoin persistence without a big-bang
  upload rewrite.
- Keeps secret-bearing storage writes behind the Storage API Worker while reads
  stay gateway-based.
- Keeps secret management server-side.
- Separates persistence, delivery and playback authorization.

### Negative
- The first adapter phase does not improve outage tolerance by itself.
- Older content must be available through Lighthouse or public IPFS gateways;
  there is no Crust POST API recovery path.
- Operational takedown must eventually cover every active persistence provider
  and media cache, not only one provider's pins.

## Validation
- IPFS gateway tests must show no Crust POST read candidate is used.
- Adapter tests must show Lighthouse is the active write provider.
- Lighthouse worker tests must cover secret handling, pin calls and status
  normalization.
- Media delivery worker tests must cover gateway fallback, Range forwarding,
  cache hit/miss behavior and invalid CID rejection.
- Lighthouse primary-upload tests must cover file upload response parsing,
  directory upload response parsing and chunked playback manifests.

## Open Questions
- Which metadata field should record the provider set for each uploaded bundle?
- Which Lighthouse status signals are reliable enough for upload completion?
- What cache purge contract should the media delivery Worker expose?
