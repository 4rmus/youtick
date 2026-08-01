# ADR-010: NEAR + Livepeer Paid Media v1

## Status

Accepted as the only paid-media target architecture. `CONDITIONAL_GO` and
`NOT_DEPLOYED`: provider, product and governance P0 gates remain open, so this
decision does not authorize testnet, staging or production activation.

## Context

The paid-media v4 target used private R2 ingest, an isolated processor,
Lighthouse persistence, an independent full-byte verifier and five KMS
operators. That design remained code-only and was not deployed.

The product decision now accepts Livepeer Studio as the plaintext media
processor, store and HLS delivery provider. Threshold KMS custody, immutable
CID publication and provider-independent byte verification are not requirements
for the new profile. NEAR remains authoritative for jobs, payments,
entitlements, grants and publication state.

Livepeer's current documentation supports direct browser TUS upload, JWT asset
policies, the `Livepeer-Jwt` HLS header and raw-body HMAC webhook verification.
It does not, by itself, prove YouTick's exact 20 GB, browser-resume, cost,
deletion or negative-playback gates.

## Decision

1. The only active paid-media target is
   [NEAR + Livepeer Paid Media v1](../architecture/near-livepeer-paid-media-implementation-plan.md).
   The R2/Lighthouse v4 plan is superseded but remains as code-only history
   until its consumers can be removed safely.
2. Use NEAR contracts, Livepeer Studio, one dedicated Cloudflare Worker and one
   SQLite-backed Durable Object class with named job and operator instances.
3. Media bytes flow directly from the browser to Livepeer. They must never pass
   through Next.js, a YouTick API or the Worker.
4. Livepeer sees plaintext and controls ingest, transcode, storage and HLS
   availability. Provider-issued size and hash values are provider evidence,
   not independent integrity proof.
5. Use fresh contract IDs and profile `paid-media-livepeer-v1`. Do not satisfy
   the old `finalize_paid_publish` gates with fabricated CID, KMS or deletion
   receipts.
6. The bridge may call only `finalize_livepeer_publication` and
   `suspend_livepeer_sales` through a finite-allowance, zero-deposit NEAR
   FunctionCall key restricted to the exact contract. FullAccess is forbidden.
7. Job-to-operator work uses a persisted, idempotent outbox. Ambiguous provider
   creates and NEAR broadcasts are reconciled before any retry.
8. Playback JWTs use ES256, bind the exact playback ID, remain short-lived and
   are sent in the `Livepeer-Jwt` header. Query-string tokens are outside this
   protocol.
9. Runtime work remains feature-disabled until the relevant P0 facts are
   recorded and canary-tested. Local checks and green CI are not deployment
   evidence.

The protocol identifiers, canonical request envelope and publication tuple are
locked in [`protocol/paid-media-livepeer-v1`](https://github.com/4rmus/youtick/blob/main/protocol/paid-media-livepeer-v1/README.md).

## P0 gates retained

The implementation plan is authoritative for the full list. In summary, the
following remain release blockers: exact upload-length and endpoint behavior;
ambiguous-create lookup; CORS and 30%/70% resume; guaranteed provider fields and
rendition lookup; JWT-negative playback; deletion, retention, region, DPA and
SLA; failed-upload billing and budget controls; refund/takedown/resume policy;
the supported device matrix; and the final allowance budget and rotation
authority.

Unknown provider behavior must remain an explicit unknown. It cannot be turned
into a production assumption by this ADR.

## Consequences

### Positive

- The media path is smaller: no separate R2 ingest, processor, Lighthouse
  persistence, verifier or KMS quorum is required for the new profile.
- NEAR remains the source of truth for payment and access.
- The Worker carries control traffic only and can stay serverless.

### Negative

- Livepeer and the Worker deploy authority are stronger trust boundaries.
- Provider mutation, deletion or outage can affect availability.
- Provider hashes do not prove integrity against a malicious provider.
- Short-lived playback JWTs remain bearer capabilities until expiry.

## Alternatives considered

- **Keep paid-media v4 as the target:** rejected for this product direction
  because the accepted Livepeer trust model makes its processor, CID and KMS
  path unnecessary.
- **Run a private Livepeer Gateway:** rejected because Studio's managed upload,
  storage and playback surface is the selected product dependency.
- **Add a VM, D1 or Queue now:** rejected until measured query, throughput or
  dead-letter requirements justify them.

## Validation

PR-0 validates only documentation truth, protocol schema/golden vectors and CI
routing. Contract, Worker, provider, testnet and deployment evidence belongs to
later reviewed PRs. Each PR must stop at its acceptance gate.

## References

- [Implementation plan](../architecture/near-livepeer-paid-media-implementation-plan.md)
- [Source evaluation](https://github.com/4rmus/youtick/blob/main/near-livepeer-serverless-paid-media-evaluation.md)
- [Livepeer direct upload](https://docs.livepeer.org/developers/guides/upload-video-asset)
- [Livepeer JWT access control](https://docs.livepeer.org/v1/developers/guides/access-control-jwt)
- [Livepeer webhook verification](https://docs.livepeer.org/v1/developers/guides/setup-and-listen-to-webhooks)
- [NEAR access keys](https://docs.near.org/protocol/accounts-contracts/access-keys)
