# Changelog

This file records source changes merged to `main`, grouped by area, with the
pull request that carried them. It does not claim deployment, provider
activation or production readiness; runtime evidence lives in the runbooks.

## Unreleased

### V2: sign-in, tickets and keys

- Added the Market v2 message formats and golden vectors (#267) and the Market
  V2 crate: ticket purchases in escrow (#268), settlement, refund and release
  (#272), ticket devices (#273), card tickets and the payment operator role
  (#274), and provider-neutral on-chain names, `paid-media-v1` (#352).
- Imported `ckd-gate` (#275) and added its reproducible build, gate verifier
  and deployment record (#326); the web application pins the V2 testnet gate
  (#304) and finds tickets under every trusted gate (#330).
- Added the relayer for NEAR Auth accounts, key derivation and invite credit
  (#283) and relayed ticket purchases (#289).
- Added the web ticket-key library (#280) and the NEAR Auth web flow: sign-in,
  tickets, checkout, top-up, funnel and watermark (#295).
- Bridge: V2 ticket playback with `mark_watched` before the first token (#276)
  and a scheduled `release_expired` for tickets older than 30 days (#278).
- Added upload through NEAR Auth for invited creators (#317, #319, #321).
- Added the relayer `add_device` route and web device link and renewal, off
  until its limits are configured (#347, #348).

### V2: payments and refunds

- Added the VAT attestation service (#286) and checkout funnel counts without
  personal data (#292).
- Refunds go through youtick and watched tickets stay in escrow (#328); added
  the refund request inbox and operator tool (#329) and refunds for taken-down
  videos (#331).
- Prepared the card path, disabled by default: payment service preparation
  (#332), card ticket storage from the Market reserve with a function-call key
  for the payment operator (#333), the provider adapter (#334), web checkout
  behind the card rail flag (#335) and the testnet release switch (#336).

### Media: Cloudflare Stream

- Introduced a provider-neutral `MediaProvider` boundary in the Bridge (#355).
- Added the Cloudflare Stream adapter, Stream-only V2 release tooling and
  neutral names (#354, #358, #359).
- Web: Stream upload selector, path-token playback and relayer allowlist
  (#360).
- Acceptance-round fixes: Stream audio segments and fatal player errors (#369),
  sampled readiness probes (#368), playback renewal, upload recovery and
  sign-out (#378).

### Read model

- Indexed V2 Market ticket events (#277); added the V2 read model and the
  scheduled `release_expired` on the V2 testnet (#323).
- The V2 scanner crosses skipped heights (#324), reads only Market event blocks
  (#325) and takes the coverage block from neardata (#370).

### V2 testnet environment and release tooling

- Added the V2 testnet bootstrap workflow, policy template and runbook (#285,
  #303).
- Added deploy paths for the relayer and payment service (#305) and for the V2
  Bridge on Market V2 (#316).
- Opening Bridge uploads to any account with a wildcard (#365) was reverted:
  a wildcard turns operator mutations off, so creators are named (#367).

### Web: public pages

- Launch-stage copy layers, root-host public-route gate and creator
  application form (#337, #338, #339).
- Terms, refund policy, consent, content reports and overlay copy (#340).
- Public copy for the February 2027 opening, opening notices and the V2
  privacy notice (#345); short landing copy and FAQ page (#350); two-audience
  landing copy (#351).
- The V1 wallet connector loads only on V1 pages or on Connect (#346).

### Dependencies and CI

- Next 16.4.2 with OpenNext 1.20.12 and wrangler 4.151.2 (#349); Next 16.4.6
  and in-range security patches (#379).
- Security and routine dependency updates (#302, #312, #313, #314, #361, #362,
  #363, #371, #376).
- Dependabot security updates are grouped per directory (#301); the runtime
  dependency audit bounds its fetches (#357); RUSTSEC-2026-0387 accepted for
  `ckd-gate` after review (#366).

### Earlier: repository reduction

- Reduced the repository to the Next.js app, NEAR market/access contracts,
  Livepeer Bridge Worker and Livepeer paid-media protocol.
- Made Livepeer TUS upload and JWT playback the only media path for V1.
- Kept web, Worker and native-NEAR creator-fee activation gates disabled by
  default.
- Removed retired product flows, service workers, deployment scripts,
  compatibility models and generated contract artifacts from the previous
  architecture.
