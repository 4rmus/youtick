# ADR-006: Storage Provider Abstraction and Lighthouse Pilot

## Status
Accepted for phased implementation

## Implementation Progress
- Phase 0 docs alignment: done.
- Phase 1 Crust storage provider adapter: done.
- Phase 2 Storage API Worker for Lighthouse secret management and pin/status checks: done.
- Phase 3 Lighthouse-only storage path for new uploads: in progress.
- Phase 4 Media Delivery Worker skeleton for encrypted IPFS routing, Range
  forwarding, edge cache headers and gateway fallback: done.
- Phase 5 frontend read-path flag for Media Delivery Worker: done.
- Phase 6 guarded Lighthouse primary upload path with per-file/chunk uploads:
  source deployed; authless live `/uploads/intent` returns `401 Unauthorized`.

Next step: run one signed small `/uploads/file` smoke test through the frontend
wallet auth path, then publish one segmented playback upload through the default
Lighthouse path.

## Context
New uploads use Lighthouse/IPFS for encrypted delivery assets. Read paths still
keep multiple IPFS gateways so older Crust-backed content remains playable.

The next storage work should reduce provider lock-in without changing the
access model. Lighthouse is a persistence pilot, not a replacement for YouTick
KMS. KMS operators remain the source of ticket, ban, session-grant and key-share
authorization.

## Decision
1. Add a small storage provider adapter around the current Crust upload,
   storage-order and verification behavior.
2. Make Lighthouse the active provider for new uploads. Crust upload fallback is
   opt-in only for emergency diagnostics.
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
- Keeps old Crust-backed media readable while new storage writes go to Lighthouse.
- Keeps secret management server-side.
- Separates persistence, delivery and playback authorization.

### Negative
- The first adapter phase does not improve outage tolerance by itself.
- There will be a temporary period where docs and code mention both Crust and
  the storage provider adapter.
- Operational takedown must eventually cover every active persistence provider
  and media cache, not only one provider's pins.

## Validation
- Existing Crust gateway and legacy diagnostic tests must keep passing.
- Adapter tests must show Lighthouse is the default active provider and does
  not call Crust fallback or Crust storage orders by default.
- Lighthouse worker tests must cover secret handling, pin calls and status
  normalization.
- Media delivery worker tests must cover gateway fallback, Range forwarding,
  cache hit/miss behavior and invalid CID rejection.
- Lighthouse primary-upload tests must cover file upload response parsing,
  directory upload response parsing, chunked playback manifests and the opt-in
  Crust diagnostic fallback.

## Open Questions
- Which metadata field should record the provider set for each uploaded bundle?
- Which Lighthouse status signals are reliable enough for upload completion?
- What cache purge contract should the media delivery Worker expose?
