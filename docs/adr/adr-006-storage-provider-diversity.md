# ADR-006: Storage Provider Abstraction and Lighthouse Pilot

## Status
Accepted for phased implementation

## Implementation Progress
- Phase 0 docs alignment: done.
- Phase 1 Crust storage provider adapter: done.
- Phase 2 Storage API Worker for Lighthouse secret management and pin/status checks: done.
- Phase 3 Lighthouse pilot as secondary persistence with Crust fallback: in progress.

Next step: make Lighthouse pin status observable and reliable enough for
operations before promoting it beyond a non-blocking pilot.

## Context
Uploads currently use Crust/IPFS for encrypted delivery bundles and Crust PSA
orders for long-term persistence. Read paths already use multiple IPFS
gateways, including Lighthouse as a public read fallback.

The next storage work should reduce provider lock-in without changing the
access model. Lighthouse is a persistence pilot, not a replacement for YouTick
KMS. KMS operators remain the source of ticket, ban, session-grant and key-share
authorization.

## Decision
1. Add a small storage provider adapter around the current Crust upload,
   storage-order and verification behavior.
2. Keep Crust as the active provider and fallback during the Lighthouse rollout.
3. Add a separate Storage API Worker before using Lighthouse API keys. Browser
   code must never receive Lighthouse secrets.
4. Keep media delivery separate from provider management. A future media
   delivery Worker may route encrypted manifests and segments, support Range
   reads, cache hot assets and fall back across gateways.
5. Do not proxy large upload bodies through the Storage API Worker in the first
   Lighthouse phase.
6. Do not mix Lighthouse Kavach/token-gating with YouTick KMS in the first
   phase.

## Consequences
### Positive
- Creates a clean point for Lighthouse/Filecoin persistence without a big-bang
  upload rewrite.
- Keeps the current Crust behavior testable during migration.
- Keeps secret management server-side.
- Separates persistence, delivery and playback authorization.

### Negative
- The first adapter phase does not improve outage tolerance by itself.
- There will be a temporary period where docs and code mention both Crust and
  the storage provider adapter.
- Operational takedown must eventually cover every active persistence provider
  and media cache, not only Crust pins.

## Validation
- Existing Crust upload, gateway and storage-order tests must keep passing.
- New adapter tests must show the active provider delegates to Crust without
  changing root CID, entries or storage-order results.
- Lighthouse worker tests are out of scope until the Storage API Worker phase.

## Open Questions
- Which metadata field should record the provider set for each uploaded bundle?
- Which Lighthouse status signals are reliable enough for upload completion?
- What cache purge contract should the future media delivery Worker expose?
