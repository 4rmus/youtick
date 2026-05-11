# ADR-004: KMS Client — Remove Hardcoded Fallback and Enforce Registry Trust

## Status
Accepted and implemented for MVP

## Context
Earlier client code defined `DEFAULT_KMS_BASE_URL` from `NEXT_PUBLIC_KMS_URL`.
That hardcoded endpoint could be prepended to the operator list and treated as
equally trustworthy. If compromised, it could receive Shamir shares and auth
tokens before registry operators were attempted. The current client no longer
uses that env fallback.

## Decision
1. **Remove `DEFAULT_KMS_BASE_URL` entirely.** The client MUST discover operators exclusively from `operator-registry`.
2. Before transmitting shares to any endpoint, the client verifies:
   a. The endpoint is present in `list_decryption_operators` with `active == true`.
   b. The endpoint's TLS certificate chain is valid (browser-enforced).
   c. (Future) The endpoint's Ed25519 `transport_public_key` is used to verify a signed handshake or pinned in the client.
3. If registry RPC fails, the client aborts the operation rather than falling back to stale cache or hardcoded URLs.

## Consequences
### Positive
- Eliminates a single endpoint as a trust anchor.
- Forces operator set to be transparent and on-chain.

### Negative
- If the registry contract is unreachable, uploads and playback fail hard (availability vs security trade-off).
- Operator endpoint changes require a registry update, which is slower than redeploying an env var.

## KPI
- **Trusted off-chain KMS fallback endpoints:** 1 → 0
- **Registry-enforced endpoint coverage:** 100%

## Validation
- Unit test: client rejects endpoint not returned by `list_decryption_operators`.
- Chaos test: registry RPC blackholed; client fails gracefully with user-facing error.

## Open Questions
- Should we cache the registry response in `localStorage` with a short TTL (e.g., 5 min) for offline resilience?
- Transport-key pinning: implement as HTTP Signed-Headers or TLS certificate transparency?
