# ADR-006: Storage — Multi-Provider Pinning Abstraction

## Status
Deferred until Phase 2 (post-traction)

## Solo Dev Note
Crust is sufficient for MVP validation. Adding Lighthouse/Filecoin integration is a distraction before product-market fit. The abstraction interface can be designed now but secondary providers should only be implemented if Crust has an outage or pricing change.

## Context
Uploads are pinned exclusively to Crust Network (`crustipfs.xyz`). If Crust is down, censored, or changes pricing, uploads fail. Retrieval uses a hardcoded list of 5 HTTP gateways with no libp2p fallback.

## Decision
1. Create a `PinningProvider` interface abstracting upload and status check.
2. Implement at least three backends:
   - **Crust** (primary, W3Auth NEAR)
   - **Lighthouse / Filecoin** (fallback, NFT.storage-style)
   - **Self-hosted IPFS node** (community/enterprise option)
3. Upload flow attempts all providers in parallel; success on first confirmed pin.
4. Store `provider: string` in `VideoMetadata` so retrieval knows which gateway set to prioritize.
5. Retrieval gateway list is sourced from a registry/config file rather than hardcoded constants, enabling dynamic updates.

## Consequences
### Positive
- Eliminates single pinning SPoF.
- Price competition between providers.
- Community can run pinning nodes for niche content.

### Negative
- Slightly higher upload latency (parallel attempts).
- Must handle provider-specific auth (W3Auth, API keys, FIL deals).
- Content may be pinned on multiple networks; need deduplication logic.

## KPI
- **Pinning provider diversity:** 1 → 3+
- **Upload success rate during Crust outage:** 0% → >95%

## Validation
- Upload test: Crust API mocked to 503; upload succeeds via Lighthouse.
- Retrieval test: primary gateway blocked; fallback gateway serves content.

## Open Questions
- How do we persist provider-specific API keys securely (server-side env vs client-side)?
- Should we use IPFS cluster or libp2p pubsub for provider discovery?
