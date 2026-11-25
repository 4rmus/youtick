# Architecture

The repository holds two lines. **V2** is current: NEAR Auth sign-in, tickets
bound to a ticket key, Cloudflare Stream for media, on its own NEAR testnet
environment. **V1** is the earlier wallet-only testnet pilot on Livepeer
Studio; its code is frozen and described under [V1 pilot](#v1-pilot) below.
Neither line is deployed to mainnet.

> `current-state.md` and `transformation-progress.md` are the V1 pilot's dated
> snapshot and append-only checkpoint journal. They are history, not the active
> next-gate source. V2 operational records are in the
> [V2 testnet runbook](../v2-testnet-runbook.md).

## V2

```text
Browser -- Google or passkey sign-in --> NEAR Auth
Browser -- id token --> Relayer
Relayer -- account funding, USDC registration --> NEAR
Relayer -- request_key --> ckd-gate --> NEAR MPC key derivation
Browser -- derives ticket keys from the returned secret (never stored)

Creator browser -- approved upload fee --> Relayer -- ft_transfer_call --> Market V2
Creator browser -- signed intent --> Bridge
Creator browser -- TUS video bytes --> Cloudflare Stream
Cloudflare Stream -- signed webhook --> Bridge
Bridge -- finalize_publication / suspend_sales --> Market V2

Viewer browser -- ticket and publication --> Payment service -- VAT attestation
Viewer browser -- approved purchase --> Relayer -- ft_transfer_call --> Market V2
Market V2 -- gross amount stays in escrow, ticket keyed by sha256(ticket public key)

Viewer browser -- playback request signed by the device session key --> Bridge
Bridge -- final get_ticket + get_publication --> Market V2
Bridge -- mark_watched before the first token --> Market V2
Bridge -- short-lived signed token --> Viewer browser
Viewer browser -- token in the URL path --> Cloudflare Stream

Viewer browser -- add_device signed by the ticket key --> Relayer --> Market V2
Viewer browser -- refund request signed by the ticket key --> Payment service
Payment operator -- refund_ticket after youtick approves --> Market V2
Bridge (scheduled) -- release_expired for tickets older than 30 days --> Market V2

Market V2 final events --> Read model Worker --> D1 (discover, profile)
```

### V2 boundaries

- Market V2 owns jobs, publications, tickets, escrow, refunds, releases and the
  device list. `get_ticket` in final state is the authority for playback;
  events are not.
- A ticket is bound to a per-purchase key derived in the browser from the
  secret that `ckd-gate` returns. The ticket never records the buyer account.
  Keys are not stored; each device derives them again.
- The relayer pays gas for NEAR Auth users and sponsors only the transactions
  it rebuilds itself: account creation, the key derivation request, the
  purchase, the upload fee, an upload-key replacement and `add_device`. The
  key derivation response is encrypted to the browser; the relayer cannot read
  it.
- The payment service issues VAT attestations and keeps refund requests. It
  never moves money. The price is read from the publication in final state,
  never from the request.
- The whole gross amount stays in escrow at purchase. Watching moves no money.
  A ticket still in escrow 30 days after purchase is released: VAT to the tax
  balance, 5% of net to the platform, the rest to the creator.
- Refunds are decided by youtick, for technical failure, content not as
  described or takedown. The ticket key signs where the refund goes; the
  payment operator cannot change the recipient.
- A ticket holds at most three devices, each valid for 30 days. A fourth
  replaces the oldest.
- Cloudflare Stream receives plaintext video and owns processing, storage and
  delivery. Every upload requires signed URLs. The Bridge reaches it only
  through the `MediaProvider` boundary; source video and HLS bytes never pass
  through the Bridge.
- Playback tokens live at most 180 seconds and never longer than the device's
  remaining validity.
- The Bridge operator key is a function-call key limited to
  `finalize_publication`, `suspend_sales`, `mark_watched` and
  `release_expired`.
- The card path issues tickets through `issue_card_ticket`, signed by a
  separate payment operator function-call key after a verified provider
  purchase event. No tokens move on chain for a card ticket. The path is
  disabled by default.
- `ckd-gate` holds no access key. It has not been audited.
- D1 remains a derived read model that can be rebuilt from final events.

### V2 activation

Every V2 gate defaults to off in source:

- Relayer: `RELAYER_ENABLED`, and `RELAYER_MUTATIONS_ENABLED` before anything
  is signed. Device linking additionally needs `DAILY_DEVICE_LIMIT` and
  `TICKET_DAILY_DEVICE_LIMIT`.
- Payment service: `PAYMENT_SERVICE_ENABLED`; the card path needs
  `CARD_PATH_ENABLED`.
- Bridge: `MARKET_PROTOCOL=v2` with `LIVEPEER_PLAYBACK_V3_ENABLED` for ticket
  playback, `MEDIA_PROVIDER_STREAM_ENABLED` for Cloudflare Stream and
  `MARKET_V2_RELEASE_ENABLED` for the scheduled escrow release, on top of the
  Bridge gates listed under V1. Bridge variable names keep the `LIVEPEER_`
  prefix from V1.

Details: [Configuration](../getting-started/configuration.md),
`contracts/market-v2/README.md`, `protocol/youtick-market-v2/README.md`,
`workers/relayer/README.md`, `workers/payment-service/README.md` and
`workers/livepeer-bridge/README.md`.

## V1 pilot

The sections below describe the frozen V1 line: wallet sign-in, account
entitlements and Livepeer Studio.

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

### V1 boundaries

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

### V1 activation

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
