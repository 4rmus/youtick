# YouTick web

The web app supports one paid-media path:

- browser to Livepeer Studio over TUS for source upload;
- NEAR market contract for jobs, publications, entitlement and creator balances;
- NEAR access contract for resource-bound `Play` grants;
- Livepeer Bridge for upload intents and short-lived playback tokens;
- USDC for creator upload fees, ticket purchases and creator withdrawals.
- optional 1Click conversion into the user's own NEAR Circle USDC balance,
  followed by the unchanged USDC payment.

Source video and playback bytes never pass through Next.js or the Bridge Worker.
The Bridge serves only the public, size-limited first-frame JPEG derived for
publication covers after checking the current on-chain publication state.

The wallet-redirect upload draft is versioned and kept only in
`sessionStorage`. Recovery requires the same file name, byte length,
`lastModified` value and a SHA-256 fingerprint of bounded first/last source
blocks. Upload-intent control v3 signs that fingerprint; the job object binds
its first value and rejects a different fingerprint during recovery. The draft
never stores the TUS endpoint or a persistent browser key.

The same v2 draft records only monotonic recovery progress:
`payment_pending → authorized → upload_ready → uploading → provider_processing`.
Retries cannot move this stored stage backwards; the record is cleared after a
publication is observed.

Publication completion polling uses the existing TanStack Query provider with
bounded 5/10/20/30-second backoff, does not retry immediately, pauses interval
work while the tab is hidden and refreshes when the window regains focus.

The separate default-off playback-shadow flag embeds an independently signed
v2 certificate request inside a legacy token request. Failure to create that
optional proof never blocks the legacy request; the Worker returns only the
legacy token.

The canonical in-memory UI stage follows the actual call order:
`draft → preflight → payment_required → payment_pending → authorized →`
`intent_pending → upload_ready → uploading → provider_processing → published`.
The initial preflight runs before payment options; a second fresh preflight
still runs immediately before wallet authorization.

One pure predecessor table enforces those UI transitions. It additionally
allows only idempotent repeats, explicit retry edges back to `payment_pending`,
new-file/account reset to `draft`, and an authoritative on-chain jump to
terminal `published`.

After the user reselects a fingerprint-matching file, the stored stage restores
the safest UI projection: payment resumes from payment options, an interrupted
upload returns to `upload_ready`, and `provider_processing` immediately resumes
publication polling without reopening payment.

A fingerprint-verified restored `authorized` draft exposes an explicit
`Cancel job (no refund)` action. It signs the cancellation with the same
session-only job key, clears that key and draft only after the bridge confirms
terminal cancellation, and then resets the UI for a new job. Provider-pending
and later work cannot be cancelled through this action.

## Local checks

```bash
npm ci
npm test -- --run
npm run test:livepeer-canary
npm run test:wallet-provenance
npm run lint
NEXT_PUBLIC_NEAR_NETWORK=testnet \
NEXT_PUBLIC_MARKET_CONTRACT_ID=market.testnet \
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.testnet \
NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1=false \
NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS=false \
NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2=false \
NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE=off \
npm run build
```

Copy `.env.example` to `.env.local` for development. Market and access IDs are required and have no fallback. The Livepeer, sponsored-upload and native-NEAR fee flags remain closed until their release gates are approved.
Multi-asset payments also default to `off`. `preview` is dry-quote only; `live`
requires the Bridge to use the same mode and a positive
`NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO`.

Sponsored upload accepts only a wallet profile proven to produce a delegate
window of at most 200 blocks. The current compatibility profile replaces only
the sponsored Meteor entry with a local executor pinned to Git commit
`8c4ca0849244907551dbf7edbd65bd2db0189ccd` and SHA-256
`30f015e149fff43c1134df1440cb0b676a19f00b87de27cca85194ea9a4eab4f`;
the connector's other wallets remain available for the existing user-gas USDC
fallback before any delegate prompt. Ledger's current 900-block delegate and
other unqualified wallets use that fallback. Future sponsored wallets must
provide immutable executor provenance and pass the same 200-block Bridge
conformance checks.
