# Architecture

> Current source, CI, Preview and Production snapshot:
> [`current-state.md`](current-state.md). The detailed checkpoint journal in
> [`transformation-progress.md`](transformation-progress.md) is append-only
> history, not the active next-gate source.

```text
Creator browser -- job/payment --> NEAR market
Creator browser -- signed intent --> Livepeer Bridge
Creator browser -- TUS video bytes --> Livepeer Studio
Livepeer Studio -- signed webhook --> Livepeer Bridge
Livepeer Bridge -- finalize/suspend --> NEAR market

Buyer browser -- purchase --> NEAR market
Buyer browser -- signed token request --> Livepeer Bridge
Livepeer Bridge -- final-block checks --> NEAR market + access
Livepeer Bridge -- short-lived JWT --> Buyer browser
Buyer browser -- authenticated HLS --> Livepeer Studio
Buyer browser -- public cover request --> Livepeer Bridge
Livepeer Bridge -- final publication check --> NEAR market
Livepeer Bridge -- protected VTT/first JPEG --> Livepeer Studio

Source-chain asset -- user transfer --> 1Click deposit
1Click -- exact-output conversion --> User NEAR Circle USDC balance
User NEAR account -- existing ft_transfer_call --> NEAR market
```

## Boundaries

- NEAR owns paid job, publication, settlement, entitlement and Play-grant truth.
- Livepeer receives plaintext video and owns ingest, processing, storage and
  HLS delivery.
- The Bridge handles control and authorization and must reject media request
  bodies. Its only deliberate media response is a public, 2 MiB-limited
  first-frame JPEG for an active publication; source video and HLS bytes never
  pass through it.
- Durable Objects persist idempotent job, admission and operator state.
- The Bridge's payment adapter is stateless. It derives the canonical amount,
  verifies signed quote/status responses and rate-limits requests; it never
  holds funds, grants entitlement or records payment state.
- 1Click conversion ends in the user's own NEAR account. Only the user's later
  Circle USDC `ft_transfer_call` can create a job or entitlement, preserving the
  market's authoritative `sender_id` identity.
- The operator key is a finite-allowance FunctionCall key restricted to the
  approved market methods. FullAccess keys are forbidden.
- Playback tokens are short-lived ES256 bearer tokens sent in the
  `Livepeer-Jwt` header and kept in browser memory.
- The testnet pilot uses fresh market and access IDs with empty state. Mainnet
  also uses a fresh ID, but requires an independently audited snapshot/import
  and invariant verification rather than an in-place overwrite.
- Accepted closed-gate policy is zero legacy/v2 authorization mismatch, at
  least 99% same-resource upload resume, zero second payment/provider asset and
  at most 256 persistent records per Durable Object.
- YouTick does not keep a platform source-media backup. Creators retain their
  source files; provider asset loss suspends sales/playback and requires creator
  re-upload or takedown. D1 remains the rebuildable derived read model.

## Activation

`NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1` and
`LIVEPEER_BRIDGE_ENABLED` are independent gates and default to false.
New upload intents and all playback-token issuance also require the independent
`LIVEPEER_NEW_UPLOADS_ENABLED` and `LIVEPEER_PLAYBACK_ISSUANCE_ENABLED` gates;
both default to false while existing upload recovery remains available.
Provider creates and NEAR operator broadcasts additionally require the separate
`LIVEPEER_PROVIDER_MUTATIONS_ENABLED` and
`LIVEPEER_OPERATOR_MUTATIONS_ENABLED` gates; both default to false.
Stateless playback additionally requires
`NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2` and
`LIVEPEER_PLAYBACK_V2_ENABLED`; both also default to false and are not yet
release-wired.
Legacy/v2 shadow measurement has its own
`NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2` and
`LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED` pair. Both default to false and are not
release-wired; shadow never changes the legacy response or issues a v2 token.
The native-NEAR creator-fee gates also remain false. Initial activation is
USDC-first until its separate price-source gate is approved.

`NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE` and `MULTI_ASSET_PAYMENTS_MODE` are a
separate matched pair. Direct USDC bypasses conversion and keeps the existing
single payment approval. Other assets require a source transfer followed by the
existing USDC payment; neither `customRecipientMsg` nor direct Intents-to-market
settlement is used.
