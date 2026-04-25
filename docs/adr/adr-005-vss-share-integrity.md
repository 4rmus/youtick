# ADR-005: Share Integrity — Verifiable Secret Sharing or Per-Share HMAC

## Status
Deferred until Phase 2 (post-traction)

## Solo Dev Note
VSS adds significant complexity (curve arithmetic, commitment storage, client verification). In the MVP you will run or deeply trust 2–3 operators, so Byzantine tolerance is not required. If an operator returns a bad share, you can debug and fix it operationally. Revisit when you need permissionless operators.

## Context
`apps/web/lib/kms/shares.ts` implements GF(256) Shamir Secret Sharing but has **no integrity check**. `reconstructSecretFromShares` deduplicates by `shareId` but does not detect corrupted shares. A single malicious operator can return garbage data, causing reconstruction to fail with no way to identify the culprit.

## Decision
Add **Verifiable Secret Sharing (VSS)** commitments using Feldman’s scheme over GF(256), or a lightweight **HMAC over each share** if VSS proves too complex for the browser.

### Option A: Feldman VSS (Preferred)
- During split, generate polynomial commitment `C_j = g^{a_j}` (using an elliptic curve or discrete log group compatible with GF(256) arithmetic).
- Store commitments on-chain or in the video manifest.
- During reconstruction, each share is verified against commitments before use.
- Client fetches `requiredShares + 1`, verifies all, excludes bad ones, reconstructs with `requiredShares` good shares.

### Option B: Per-Share HMAC (Fallback)
- Derive an HMAC key from the same secret used for AES encryption (or a separate HKDF output).
- Append `HMAC(shareId || shareBytes)` to each share.
- Client verifies HMAC; mismatch = bad share.
- **Weakness:** Does not prevent a malicious uploader from generating bad HMACs; assumes uploader is honest.

**Decision:** Pursue Option A (VSS) for robustness. If NEAR gas or browser performance blocks it, fall back to Option B with documented trust assumptions.

## Consequences
### Positive
- Tolerates 1 Byzantine operator without playback failure.
- Creates cryptographic accountability: bad shares are provably attributable.

### Negative
- VSS adds complexity and potentially non-trivial browser compute.
- Commitments must be stored somewhere (manifest or on-chain) and kept available.

## KPI
- **Byzantine operator tolerance:** 0 → 1
- **Playback success rate with 1 malicious operator:** 0% → 100%

## Validation
- Unit test: `byzantine_playback_succeeds.ts` passes with 1 corrupted share out of 5.
- Performance benchmark: VSS verification overhead < 50ms per share on mid-tier mobile.

## Open Questions
- Which curve/group for Feldman commitments in a browser-friendly way? Ristretto255? BN256?
- Should commitments be stored on-chain (gas cost) or in the IPFS manifest (availability risk)?
