# Public Alpha Limitations

> Public summary of known product and architecture limits. Detailed incident
> evidence, operator runbooks, live endpoint inventories, transaction hashes and
> key-rotation records belong in private operations notes, not in the public repo.

YouTick is public-alpha software. The source is useful for review,
experimentation and contribution, but it should not be described as
production-ready, independently audited or fully decentralized.

## Current Limits

### Hybrid Decentralization

YouTick uses on-chain ownership and access rules, but several operational layers
are still centrally operated during public alpha:

- KMS operators run as Cloudflare Workers.
- KMS shares are stored in Cloudflare KV.
- Lighthouse is the primary write provider behind the Storage API Worker.
- NFT market admin and emergency moderation remain owner-controlled for V1.

The correct public wording is **hybrid decentralized public alpha** until KMS
operators are independently hosted, storage writes are redundant, and governance
moves to multisig or DAO control.

### Content Integrity

Media is encrypted in the browser with AES-CTR for confidentiality and seekable
playback. AES-CTR is not authenticated encryption. The app and Media Delivery
Worker include CID-based integrity checks for supported raw CID payloads, but
this is not a replacement for per-chunk AEAD or encrypt-then-MAC.

Do not claim that encrypted media is tamper-proof or HMAC/GCM protected until an
authenticated content format is implemented and verified.

### Operator Availability

The registry can require a threshold of KMS operators for playback. That
threshold is cryptographically meaningful, but public-alpha operator hosting is
not yet independent enough to call it a full availability decentralization
guarantee.

### Experimental Payment Rails

NEAR-native purchase and playback are the primary public-alpha path. Stablecoin
and cross-chain checkout surfaces are experimental and should stay clearly
flagged in UI and docs unless a release validates them end to end.

### Guest And Trial Flows

Guest/trial onboarding uses server-side onboarding keys with optional Turnstile
protection. These keys must remain server-only and must not be exposed through
`NEXT_PUBLIC_` variables or committed config.

## Public Release Rules

- Keep real operator configs, secret values, private endpoint inventories and
  incident evidence outside git.
- Keep KMS discovery registry-driven and fail-closed.
- Do not reintroduce a Crust runtime read fallback without a reviewed storage
  migration.
- Treat all deploy/reset/migration paths as operator actions requiring private
  review and recorded evidence.

## Roadmap To Production Claims

Before using production-ready language, complete and verify:

- independent KMS operator hosting,
- multisig or DAO governance for admin actions,
- redundant persistence strategy,
- authenticated media integrity,
- external security review,
- repeatable upload -> purchase -> watch smoke tests for each supported payment
  rail.
