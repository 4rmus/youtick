# Livepeer paid-media testnet execution receipt - 2026-08-03

Status: `PARTIAL / TUS_UPLOAD_PASS / CHROME_EDGE_PASS / PURCHASE_PASS /
SALES_SUSPENDED / PROVIDER_INVENTORY_CLEAN / RUNTIME_DISABLED`

## Boundary

- Network: NEAR testnet only.
- Market: `lp-market-260801.youtick-dev-v3.testnet`.
- Creator: `lp-creator-260803191501.youtick-dev-v3.testnet`.
- Buyer: `lp-buyer-260803191501.youtick-dev-v3.testnet`.
- Provider ceiling: bounded 83,886,080-byte MP4 attempts, one active asset at a
  time and one temporary signing key at a time.
- No Worker/web deployment, public activation, withdrawal, production account,
  mainnet token or 20 GB upload was used.

## Contract artifact equivalence

- Code snapshot: `ab20efd85ecf27c0003960cf888a7063b9dffa28`.
- CI-equivalent build inputs: Rust `1.86.0`, `cargo-near 0.17.0`,
  `cargo near build non-reproducible-wasm`.
- Built WASM SHA-256: hex
  `558200192365d8a8419871105f05f30d0c0fcd922476a0496b4abf89c31c1c53`,
  base58 `6kndPGK5bgN4UXuGZfbb4ihicMAXJqzZTyzu4DW82Coc`.
- The final testnet account view returned the same base58 code hash.
- Successful deploy+migrate transaction at `2026-08-03T19:22:07Z`:
  `GoQteQcpiE4kzpkTrqkB7v5ZPxdQypjM3gm5A2pzbn6T`.

The source snapshot was committed after the bounded execution. The matching
hash proves source-to-WASM-to-current-account equivalence, but not a deployment
pipeline triggered from an approved commit. Worker and web were not deployed.

## Root cause and correction

The first provider attempt stopped before TUS resource creation because
Livepeer's real `OPTIONS` response returned HTTP `204` without `Tus-Version`,
`Tus-Resumable` or `Tus-Extension`. The endpoint nevertheless implements the
real TUS operations used by Livepeer and its documented `tus-js-client` path.
The canary now records this exact response as `not-advertised` and proves
capability through the resource operations instead of treating absent
advertisement headers as protocol denial.

The first 32 MiB PATCH also exceeded the canary's fixed 30-second request
timeout. The bounded PATCH timeout is now five minutes; HTTP 409 remains
fail-closed and no second asset is created.

The browser harness then exposed two local defects. It reported every
`video.play()` rejection as autoplay and its CSP allowed `https:` media but not
the `blob:` MediaSource URL required by hls.js. The harness now preserves the
actual failure class, waits for `canplay` and permits `blob:` only in
`media-src`.

## Provider and browser proof

- Source: exact `83,886,080` bytes, 12 seconds, playable MP4, SHA-256
  `bf44c2ff6b6819237388fbb853b64b4716b31b2bfd5b1eb234664899c01d68a9`.
- TUS: sequential `32 + 32 + 16 MiB`, authoritative HEAD offsets and ready
  provider asset at the exact source length.
- Publication identity evidence is redacted as asset SHA-256
  `7a1eb7d33e8e63a208b927de9f6a4b211a39727421d39f004b6abe5b9bc97d74`
  and playback ID SHA-256
  `f72583473f9008d6e370963cae66cd84cadc6d98855d1abdf83db452c48d5a13`.
- Direct JWT probes returned playable top and variant manifests and a ranged
  segment response `206`; CORS allowed the `Livepeer-Jwt` header.
- Chrome and Edge both passed anonymous, malformed, wrong-key, wrong-subject
  and expired denial. Correct and refreshed JWT playback passed in both
  browsers with four JWT-bearing HLS requests in each playback round.
- Browser local/session storage remained empty.

One completed upload attempt proved the canary's normal TUS termination and
asset cleanup path. A later attempt received TUS `DELETE 204`, but its immediate
post-delete observation was interrupted by an origin connection timeout. That
asset was retained by fail-closed recovery, then manually deleted only after an
exact one-asset/correlation match. Final authenticated inventories were
`0 assets / 0 signing keys`. The final asset's TUS post-delete state is not
claimed independently because its bearer URL was not retained after process
exit.

## NEAR testnet proof

The existing test accounts each started with `20,000,000` micro-USDC. The
creator paid the exact 80 MiB upload fee `25,166` micro-USDC through
`ft_transfer_call`:

- create job transaction:
  `5Uitz2yKPxn1AR7CstBoWtGeDUUz4qh5JzvjPwc5jq1x`;
- job: `lp-e2e-260803-tus`, generation `1`, exact source bytes `83,886,080`;
- bridge finalize transaction:
  `7Q4JpQWAuQjQ3Qmf7GMzvgPVh7dgRCptPvyCfvWFHmgJ`;
- final publication: verified bytes `83,886,080`, availability initially
  `ACTIVE`.

The buyer then paid the exact ticket price `2,000,001` micro-USDC:

- purchase transaction:
  `AAEkLeMQeuSQXsj5CKTwip9VDwztnEP5jAAiudmFi3Z3`;
- buyer balance: `20,000,000 -> 17,999,999`;
- entitlement: `true`;
- creator ledger: `1,960,001`;
- platform ledger: upload fee `25,166` plus ticket share `40,000`, total
  `65,166`;
- market token balance: `2,025,167`.

After proof, transaction
`Az5du1ELgf1UdnNGnjecZX3jtsng7wf3YKwBKXqjp1wQ` changed availability to
`SALES_SUSPENDED`. The buyer entitlement and purchase history remain on-chain.
No withdrawal or refund was executed.

## Remaining boundary

This closes the reported TUS upload and testnet purchase blocker. It does not
close full D6: Worker/web exact-SHA deployment, real session/grant issuance
through the disabled runtime, withdrawal, rotation/outage drills, 20 GB upload,
production budget and public activation remain `NOT_RUN`.
