# ADR-005: Share Integrity - Digest Commitments and Future VSS

## Status
Lightweight digest commitments implemented; full VSS deferred until Phase 2

## Solo Dev Note
Full VSS still adds significant complexity (curve arithmetic, commitment storage, client verification). The public-alpha path now uses a smaller integrity layer: each stored KMS share carries SHA-256 commitments for the expected share set. This catches corrupted or stale shares during playback, while avoiding a large cryptographic redesign.

## Context
`apps/web/lib/kms/shares.ts` implements GF(256) Shamir Secret Sharing. New uploads generate per-share SHA-256 commitments, KMS stores them with the share metadata, and playback verifies returned shares before reconstruction. Legacy KMS records without commitments still work as a compatibility path.

## Decision
Use per-share digest commitments now, and keep full **Verifiable Secret Sharing (VSS)** as the stronger Phase 2 design.

### Implemented: Per-Share Digest Commitments
- During upload, the web app computes `shareCommitments` over `videoId`, scheme, threshold settings, `shareId`, and `shareB64`.
- The KMS worker rejects a `/store` request if the operator share does not match its provided commitment.
- During playback, the web app ignores returned shares that do not match a shared commitment set and keeps asking operators until it has enough valid shares.
- Old shares without commitments remain readable.

**Trust limit:** this is not full VSS. It catches bad operator responses and storage drift, but it does not create public slashing proof or protect against a malicious uploader creating a bad commitment set.

### Phase 2 Option A: Feldman VSS
- During split, generate polynomial commitment `C_j = g^{a_j}` (using an elliptic curve or discrete log group compatible with GF(256) arithmetic).
- Store commitments on-chain or in the video manifest.
- During reconstruction, each share is verified against commitments before use.
- Client fetches `requiredShares + 1`, verifies all, excludes bad ones, reconstructs with `requiredShares` good shares.

### Phase 2 Option B: Stronger Per-Share MAC
- Derive a MAC key from a separate HKDF output.
- Append `MAC(shareId || shareBytes)` to each share.
- Client verifies the MAC; mismatch = bad share.
- **Weakness:** Does not prevent a malicious uploader from generating bad MACs; assumes uploader is honest.

**Decision:** ship digest commitments as the simple public-alpha guardrail. Revisit VSS or a stronger MAC when operators become less trusted or slashing becomes real.

## Consequences
### Positive
- Playback can skip corrupted or stale shares instead of failing on the first bad threshold.
- The change is small and keeps legacy KMS records readable.

### Negative
- Digest commitments are not enough for decentralized slashing.
- The commitment set still depends on the uploader path being honest.

## KPI
- **Bad-share skip path:** absent -> covered by unit tests
- **Legacy share compatibility:** preserved

## Validation
- `apps/web/__tests__/unit/kms-shares.test.ts` verifies corrupted and duplicate shares are ignored.
- `apps/web/__tests__/unit/kms-client.test.ts` verifies playback keeps fetching until enough committed shares are valid.
- `workers/youtick-kms/tests/retrieve.test.ts` verifies KMS rejects mismatched commitments and returns commitments on retrieve.

## Open Questions
- If full VSS is added, which curve/group is browser-friendly enough? Ristretto255? BN256?
- Should Phase 2 commitments be stored on-chain, in the manifest, or only in KMS metadata?
