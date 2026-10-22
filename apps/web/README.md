# YouTick web

V1 is a controlled NEAR testnet wallet pilot, not a real-money launch. Test USDC / test NEAR have no real value. Social sign-in, card payments and bank payouts are future plans. See [V1 scope and open responsibilities](../../docs/architecture/youtick-v1-product-scope.md).

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

The wallet-redirect upload draft is versioned. Public-testnet drafts persist
in `localStorage`; legacy drafts use `sessionStorage`. Upload job keys stay
in `sessionStorage`; device keys/certificates and watch progress use IndexedDB.
Recovery requires the same file name, byte length,
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
V2 NEAR Auth sign-in (`lib/near-auth/`) stays off unless `NEXT_PUBLIC_ENABLE_NEAR_AUTH_V2=true`
and `NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID` is set; only testnet has a pinned provider. The only
trusted `ckd-gate` is the V2 testnet gate `v2-ckd-gate-261007.youtick-dev-v3.testnet`, pinned in
`CKD_TRUST_ROOTS` in `lib/ticket-keys/ckd.ts`; mainnet has none.
The V2 pages `/tickets` and `/invite` also need `NEXT_PUBLIC_MARKET_V2_CONTRACT_ID`,
`NEXT_PUBLIC_CKD_GATE_ACCOUNT_ID`, `NEXT_PUBLIC_RELAYER_URL` (HTTPS origin) and
`NEXT_PUBLIC_LIVEPEER_BRIDGE_URL`; otherwise they return 404.
`/tickets/buy?publication=<id>` (crypto checkout through one NEAR Auth approval) also needs
`NEXT_PUBLIC_PAYMENT_SERVICE_URL` (HTTPS origin of the VAT attestation service); without it the
page says sales are not open. The relayer turns the approval into an MPC signature and relays
it; the ticket is confirmed only by `get_ticket`. When the balance is too low and
`NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE` is not `off`, the page offers a 1Click top-up: the
Bridge's `ticket` quote with the user's own account as recipient (a V2 Bridge points
`MARKET_CONTRACT_ID` at Market V2). Only the account's USDC balance counts as funded, never a
1Click `SUCCESS`. The crypto rail is off for browser languages in
`NEXT_PUBLIC_V2_CRYPTO_RAIL_DISABLED_LANGUAGES` (comma-separated, default `tr`), and for every
buyer when `NEXT_PUBLIC_V2_CRYPTO_RAIL=off` (the card-only public launch; unset keeps the rail). The checkout
sends funnel counts (`lib/v2/funnel.ts`) to the payment service's `/v1/funnel`: a fixed step
name, the rail and a failure code only, nothing that identifies the user or the screening; with
Do Not Track or Global Privacy Control set, nothing is sent. The card rail (roadmap E8.2) is off
unless `NEXT_PUBLIC_V2_CARD_RAIL=sandbox`: then the page also offers "Pay $X by card" (also for
languages where the crypto rail is off) when the price is a whole number of cents. The ticket key
is derived in the browser as for crypto; the payment service opens the card order, the ticket key
signs `card_purchase` over the provider reference and the price, and the buyer pays in Cleeng's
hosted checkout widget (`lib/v2/card-checkout.ts`, `components/v2/CardCheckout.tsx`). The page
counts the ticket only when `get_ticket` shows it on chain and signs again when a payment lands
after the signature expired. With the flag, the CSP (`lib/csp.ts`) allows Cleeng's sandbox widget
script and `*.sandbox.cleeng.com` frames; that frame host list is unverified until the sandbox
opens. Nothing of this has run against Cleeng (EXTERNAL_NOT_RUN). The V2 ticket player shows a
moving watermark with the ticket code (the first 8 hex characters of the public ticket id, which
carries no buyer account). It is a visible deterrent only; full screen applies to the player
frame so the watermark stays, and picture-in-picture is off. iOS Safari's own full-screen video
cannot be overlaid.
Every V2 device record lasts 30 days from its link or renewal (Market V2). With
`NEXT_PUBLIC_V2_DEVICE_LINK_ENABLED=true` (default off) `/tickets` offers "Watch on this device"
for a ticket this browser is not linked to, and Watch first renews a device in its last seven
days (`lib/v2/devices.ts`, `components/v2/DeviceLink.tsx`). The ticket key signs `add_device` in
the browser with the device epoch read from final state; the relayer's `POST /v1/devices` submits
it from its own account, so there is no approval window and no fee. A fourth device asks first,
because the contract then unlinks the device linked or renewed longest ago; if a fresh read before
signing would unlink a different device, nothing is signed and the page asks again. The link counts only
once `get_ticket` lists the device. The flag needs a relayer with `DAILY_DEVICE_LIMIT` and
`TICKET_DAILY_DEVICE_LIMIT` set; without the flag the page shows a neutral notice and renews
nothing, so a device stops playing 30 days after its last link.
`NEXT_PUBLIC_V2_MEDIA_PROFILE` selects the media profile of new `/studio` uploads (Studio to
Stream migration, M3): `legacy` (the default) keeps today's profile hash and the
`origin.livepeer.com` tus origin, byte for byte; `stream` pays the job under the Stream
descriptor hash (`protocol/paid-media-v1/stream-profile.json`) with the same `paid-media-v1`
profile id, reads the Bridge's `/__health` before the fee and stops unless `streamConfigured` is
`true`, and accepts only an `upload.cloudflarestream.com` tus endpoint. A resumed upload keeps the
hash its chain job was paid under. `stream` requires `NEXT_PUBLIC_STREAM_CUSTOMER_CODE`, the
public delivery code of the media account (lowercase letters and digits, 8 to 64; testnet
`7v4my51gigdqb5jn`). Both are build-time values; the V1 `/upload` page never reads them.
Playback follows the Bridge's answer, not the selector: a `/v3/playback-tokens` answer with
`provider: 'cloudflare-stream'` is accepted only when its `hls_url` is exactly
`https://customer-<NEXT_PUBLIC_STREAM_CUSTOMER_CODE>.cloudflarestream.com/<token>/manifest/video.m3u8`
for the answered token. The player (`lib/v2/stream-playback.ts`) then sends no token header,
lets hls.js request only that host (playlists without a query, `.mp4` init and media segments
with exactly the `p` and `s` query keys), renews by loading the new URL and seeking back, renews
once at once on a 401/403 and then backs off, and gives iOS Safari the URL as it is. Studio
answers play as before.
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
