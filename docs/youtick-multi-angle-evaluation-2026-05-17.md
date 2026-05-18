# YouTick Multi-Angle Evaluation - 2026-05-17

> Scope: architecture, investor lens, and target-audience/product-market-fit lens.
> This report is based on the local checkout at `/Users/arair/works/youtick`,
> subagent analysis, repo evidence, local tests, and selected current market sources.

## Assumptions and Limits

- The local checkout is the evaluation source. `git status -sb` reported
  `main...origin/main [behind 1]`, so one remote commit is not included.
- No production Cloudflare or NEAR live endpoint was re-verified in this pass.
  Live claims in docs are treated as dated claims unless backed by a current
  local test.
- This is not legal, tax, or investment advice. Payment, stablecoin, app-store,
  and content-moderation questions need specialist review before launch scale.
- The product should be described as public alpha, not production-ready. The repo
  states this directly in `README.md:111-115` and `docs/README.md:7-15`.

## Agent Orchestration

| Lane | Scope | Output used |
|---|---|---|
| Architecture explorer | System map, trust boundaries, upload/playback/payment path, CI/docs readiness | Architecture strengths, risks, bottlenecks, top recommendations |
| Investor explorer | Category, wedge, defensibility, monetization, GTM, funding questions | Pre-seed thesis, business risks, investor diligence questions |
| Target-audience explorer | ICP, creator value, viewer value, copy clarity, onboarding friction | Best initial audience and UX positioning |
| Evidence-map explorer | Factual capability table from repo/docs/code | Maturity caveats and drift candidates |

## Scope Definitions

### 1. Architecture

The architecture review covers:

- App layer: `apps/web`, routes, wallet, upload, watch, discover, profile.
- Contract layer: `contracts/nft-ticket`, `access-control`, `operator-registry`.
- Worker layer: `workers/youtick-kms`, `storage-api`, `media-delivery`,
  `web4-proxy`.
- Core flows: upload, KMS share storage/retrieve, ticket purchase, playback,
  gift/trial, Web4/static hosting.
- Operational readiness: runbooks, launch gates, tests, and drift-prone claims.

Success criteria:

- Identify real source-of-truth boundaries.
- Separate local test health from live E2E readiness.
- Produce staged recommendations without broad refactor bias.

### 2. Investor Lens

The investor review covers:

- Category and wedge.
- Why now and market pull.
- Monetization and take-rate quality.
- Defensibility.
- Go-to-market and traction readiness.
- Business, regulatory, platform, and operational risks.
- Questions an investor would ask before funding.

Success criteria:

- Do not sell technical depth as traction.
- State what is fundable now and what is still missing.
- Compare against current creator/video monetization expectations.

### 3. Target Audience / PMF

The target-audience review covers:

- Creator value.
- Viewer value.
- Best initial ICP.
- Onboarding and wallet/payment friction.
- Copy and trust clarity.
- Discovery versus creator-led distribution.

Success criteria:

- Identify the narrowest strong first market.
- Separate creator-side and viewer-side friction.
- Recommend practical positioning and UX simplification.

## Executive Verdict

YouTick's strongest current identity is not "Web3 video platform". The strongest
identity is:

**A ticketed digital screening tool for independent film, music, festival, and
special-event creators.**

The Web3 stack is a credibility and control layer, not the first sentence. The
repo already supports this direction: landing copy says creators can sell a film
or concert recording with a ticket, set the price, and sell directly to their
audience (`apps/web/lib/translations.ts:410-430`). The use cases are film,
concert recordings, festival windows, album/video drops, and guest/press tickets
(`apps/web/lib/translations.ts:476-489`).

From an architecture lens, YouTick is unusually deep for a public-alpha solo
founder project. The system has a real split between browser encryption, NEAR
ownership, access grants, KMS threshold shares, Lighthouse/IPFS persistence,
media delivery, and Web4 hosting (`README.md:31-52`,
`docs/public/architecture-overview.md:29-58`).

From an investor lens, the project is currently a **pre-seed technical thesis**,
not a traction story. The technical proof is strong; commercial proof is still
thin. The launch plan itself frames the near-term pitch as pre-seed and says
small user signal may be enough for the first raise (`docs/launch-plan-2026-05.md:18-24`,
`docs/launch-plan-2026-05.md:47-56`).

From a target-audience lens, the best initial user is not a generic creator and
not a cold marketplace viewer. The best initial user is a film/music/festival
creator who already has a warm audience and wants to sell one specific release,
screening, concert recording, or private viewing.

## Evidence Snapshot

| Area | Repo evidence | Reading |
|---|---|---|
| Product status | `README.md:3-5`, `README.md:111-115`, `docs/README.md:7-15` | Public alpha, hybrid decentralized, not production-ready |
| Core product | `docs/overview.md:14-22`, `docs/overview.md:28-36` | Upload encrypted video, sell/claim ticket, KMS reconstructs playback key |
| Component split | `README.md:41-52`, `docs/overview.md:69-83` | Web app, KMS, storage API, media delivery, Web4 proxy, contracts |
| Upload flow | `apps/web/hooks/useUpload.ts:31-40`, `apps/web/hooks/useUpload.ts:522-638` | Session, thumbnail, encrypt, IPFS upload, KMS, mint, storage verify |
| Storage API | `workers/storage-api/src/index.ts:73-84`, `workers/storage-api/src/index.ts:272-345` | Lighthouse default, upload auth, intent token, upload guard |
| Media delivery | `workers/media-delivery/src/index.ts:12-24`, `workers/media-delivery/src/index.ts:58-98` | Gateway fallback, cache, Range handling, no key custody |
| KMS | `workers/youtick-kms/src/index.ts:1-20`, `workers/youtick-kms/src/index.ts:660-702` | Request signing, session grant/ticket checks, fail-closed behavior |
| Payment | `apps/web/components/TicketPurchaseCard.tsx:292-330`, `apps/web/components/TicketPurchaseCard.tsx:377-654` | NEAR, USDC/USDT, Rhea, 1Click paths, but guest paid path blocked |
| Viewer gate | `apps/web/app/watch/page.tsx:57-66`, `apps/web/app/watch/page.tsx:240-280` | Watch opens for creator/ticket/recent purchase; otherwise purchase card |
| Launch gate | `docs/launch-plan-2026-05.md:421-432` | Full 3-currency upload-buy-watch smoke still unchecked |

## Architecture Evaluation

### What Is Strong

The system boundaries are mostly well chosen.

- NEAR owns entitlement and market state.
- The browser encrypts media before upload.
- Storage API hides Lighthouse secrets and guards upload budget.
- KMS workers hold threshold shares, not full keys.
- Media Delivery moves encrypted bytes only.
- Web4 proxy gives a same-origin path for static deployment constraints.

This is a good architecture for the stated trust model. It does not pretend to
be fully decentralized; the public architecture doc states that hosting,
operator runtime, persistence redundancy, and emergency governance still include
centralized controls (`docs/public/architecture-overview.md:53-58`).

The upload path also has important safety brakes. It packages and uploads
encrypted delivery assets, stores the AES key in KMS, retrieves it back for
verification, and only then publishes the NFT/event path
(`apps/web/hooks/useUpload.ts:556-638`).

### What Is Risky

The biggest architecture risk is not a single broken module. It is operational
surface area.

Playback requires several things to work together: registry, access grants,
KMS operators, RPC, IPFS gateways, media-delivery, wallet/session state, and the
contract event. That is a strong trust story, but it creates many failure
points.

Storage persistence is another important risk. In the current upload path,
storage-order/pin verification failures can leave the video published while
long-term persistence is not guaranteed (`apps/web/hooks/useUpload.ts:647-710`).
For free/internal tests that is acceptable; for paid public content it should
become a harder gate or a clear draft state.

Payment breadth is high for alpha. NEAR, native USDC/USDT, Rhea, 1Click, and
EVM MetaMask paths all converge on the same ticket entitlement, but each rail
adds a separate failure mode (`apps/web/components/TicketPurchaseCard.tsx:377-654`).

### Architecture Recommendations

1. **Create one release evidence record per deploy.**
   Record registry threshold, five KMS health checks, Storage API
   `/provider-health`, Media Delivery read, and one short upload-buy-watch
   result. The runbook already points in this direction
   (`docs/release-runbook.md:62-90`, `docs/release-runbook.md:156-167`).

2. **Make paid storage persistence stricter.**
   First step: UI/runbook rule that paid content is not marketed as live until
   pin/status is visible. Later: contract or app-level draft/published state.

3. **Keep alpha payment paths narrow.**
   Use NEAR wallet plus native/direct stablecoin as the main public path. Keep
   Rhea and cross-chain 1Click behind explicit flags and separate smoke gates.

4. **Fix docs/code drift before investor sharing.**
   The evidence-map agent found drift candidates around KMS cache wording,
   access-control README TTL, Crust fallback language, and dated live claims.
   These are not core product blockers, but they weaken trust during diligence.

5. **Measure before refactoring.**
   Add metrics for upload stage time, KMS share retrieve p95, gateway fallback
   rate, and token count impact on `has_ticket`. Do not do a broad rewrite until
   one metric proves the bottleneck.

## Investor Evaluation

### Category

YouTick sits between:

- creator monetization,
- ticketed video screenings,
- protected direct-to-fan content,
- NFT/on-chain entitlement,
- Web3 payment rails.

The best category name for non-crypto investors is:

**Direct-to-fan ticketed video screenings.**

The crypto layer should be explained as access infrastructure, not as the
product category.

### Market Context

Goldman Sachs Research estimated the creator economy could grow from about
`$250B` to `$480B` by 2027, and highlighted monetization tools, data/analytics,
e-commerce, and platform scale as important enablers.

Patreon reported more than `$10B` in creator payments and more than `25M` paid
memberships in 2025. Patreon also lists a standard `10%` platform fee for new
creators after August 4, 2025, excluding processing and other fees.

Video-specific platforms already support direct monetization. Vimeo OTT offers
web-only starter monetization with subscriptions, transactions, and free trials,
plus built-in checkout with many currencies. Uscreen markets subscriptions,
rentals, and one-time sales as a core creator video monetization flow.

This means the market is real, but not empty. YouTick must win by narrowing the
use case: protected, one-off, direct ticketed film/music screenings with very
high creator share.

### Monetization

The 98/2 split is powerful for acquisition. The repo repeats this in user copy
and contract logic (`apps/web/lib/translations.ts:455-474`,
`contracts/nft-ticket/src/lib.rs:202-213`, `contracts/nft-ticket/src/market.rs:558-591`).

The investor concern is simple: **2% take-rate may be too thin as the only
business model.**

For example, `100,000 USD` GMV creates only `2,000 USD` platform revenue before
support, moderation, storage, KMS operations, compliance, and payment overhead.

Likely expansion revenue should be planned early:

- card/fiat checkout service fee,
- festival/venue packages,
- premium hot delivery/cache,
- creator analytics,
- white-label screening pages,
- compliance/moderation support tier,
- managed launch packages for creator drops.

### Defensibility

The technical defensibility is credible: browser encryption, threshold KMS,
operator registry, on-chain ownership, and encrypted IPFS delivery create a
real system.

The business defensibility is not proven yet. Open source plus Web3 is not a
moat by itself. The real moat needs to become:

- trusted creator relationships,
- repeated ticketed screening events,
- content/legal operations,
- viewer trust in the checkout/playback experience,
- useful sales and retention analytics.

### Investor Readiness Score

| Dimension | Current read | Why |
|---|---|---|
| Technical proof | Strong | Mainnet-oriented contracts, workers, KMS, tests, runbooks |
| Product clarity | Medium-high | Film/music ticketed screening story is clear, but Web3 terms can still dominate |
| Traction | Weak/unknown | No current GMV, cohort, retention, or creator activation proof in repo |
| Business model | Medium | 98/2 split is attractive, but low take-rate needs expansion revenue |
| Operational readiness | Medium | Good runbooks/tests; full live smoke and monitoring still gate items |
| Fundability today | Pre-seed thesis | Good for technical thesis + wedge, not yet a revenue/traction raise |

### Investor Questions to Prepare

1. Who are the first 10 creators, and what will they release?
2. How many real upload-buy-watch flows have passed on mainnet?
3. What are GMV, conversion, repeat purchase, creator activation, and support
   burden after 30 days?
4. Why should a creator use YouTick instead of Vimeo/Patreon/Stripe/private video?
5. How does the company make money if the take-rate stays 2%?
6. When will card/fiat payment become the default for non-crypto viewers?
7. Who operates KMS nodes, and when do they become independent?
8. What is the takedown, refund, moderation, and abuse process?
9. What is the mobile strategy if native app-store payment rules limit NFT or
   external payment unlocks?
10. What is the independent security audit plan?

## Target Audience / PMF Evaluation

### Best Initial ICP

The strongest initial ICP is:

**Independent film teams, musicians, concert/festival teams, venues, and cultural
creators with a warm audience who want to sell a specific online screening.**

Why this ICP:

- The landing copy already speaks to film, concert recordings, festival windows,
  and special screenings (`apps/web/lib/translations.ts:410-489`).
- The watch page works best when a user arrives with intent to watch one piece,
  not as a cold marketplace browser (`apps/web/app/watch/page.tsx:240-280`).
- Guest and gift flows fit press, juries, partners, supporters, and private
  screenings (`apps/web/lib/translations.ts:488-489`,
  `apps/web/app/trial/page.tsx:31-79`).

### Creator Value

The creator value is clear:

- publish a film/concert/special work,
- set ticket price and access type,
- show the creator share,
- share a focused watch page,
- keep a high paid-ticket share.

The main friction is mental load. Upload/publish currently exposes many
concepts: wallet, session, encryption, IPFS/Lighthouse, KMS, NFT mint, storage
verification, and blockchain cost. The value is real, but the UI should frame it
as:

`Add work -> set ticket -> see cost -> open screening -> share link`

The technical steps can stay visible as progress details, not the main product
story.

### Viewer Value

The viewer value should be:

`Get the ticket -> watch this work -> support the creator`

Today, the viewer path is strongest for free/gift and warm-audience use cases.
Paid non-crypto viewers still face wallet friction. The app blocks paid purchase
for guest/trial accounts and asks for a real wallet
(`apps/web/components/TicketPurchaseCard.tsx:624-627`).

This means the first launch should not depend on cold viewers casually exploring
and converting. It should depend on creator-led traffic where the viewer already
wants that specific release.

### Positioning Recommendation

Use this public positioning:

**YouTick lets film and music creators sell ticketed digital screenings directly
to their audience.**

Avoid this as the main line:

- Web3 video platform
- NFT video marketplace
- Decentralized Netflix
- IPFS/KMS creator economy infrastructure

Those can be explanation layers, not the front door.

## Top Priorities

### P0 - Before Public Alpha Claims

1. Run and record the full upload-buy-watch smoke on mainnet.
2. Close or clearly defer the unchecked launch-gate items:
   trial baseline counter, 3-currency smoke, and monitoring alert test
   (`docs/launch-plan-2026-05.md:421-432`).
3. Produce a single release evidence note with worker versions, contract hashes,
   KMS health, storage health, and the smoke result.

### P1 - Before Investor Outreach

1. Prepare a short public-alpha transparency/economics page.
2. Fix obvious docs drift found by the evidence-map agent.
3. Add a one-page investor metric plan: creator activation, GMV, conversion,
   playback success, refund/support issues.
4. Narrow the pitch to film/music ticketed screenings.

### P2 - Before Broader Creator Acquisition

1. Simplify upload copy and progress into creator-language.
2. Add purchase-card trust copy: ticket opens this work, transaction finality,
   no content ownership transfer.
3. Decide the first non-crypto checkout path, most likely card/fiat via a worker
   and webhook-backed fulfillment.
4. Add operational metrics for KMS latency, gateway fallback, upload stage time,
   and payment completion.

## Verification Performed

| Command | Result |
|---|---|
| `cd apps/web && npm test -- --run` | 32 files, 256 tests passed |
| `cd workers/storage-api && npm run check` | passed |
| `cd workers/storage-api && npm test -- --run` | 29 tests passed |
| `cd workers/media-delivery && npm run check` | passed |
| `cd workers/media-delivery && npm test -- --run` | 11 tests passed |
| `cd workers/youtick-kms && npm run check` | passed |
| `cd workers/youtick-kms && npm test -- --run` | 48 tests passed |
| `cd workers/web4-proxy && npm run check` | passed |
| `cd workers/web4-proxy && npm test -- --run` | 17 tests passed |
| `cd contracts/nft-ticket && cargo test` | 49 unit + 31 sandbox tests passed |
| `cd contracts/access-control && cargo test` | 8 tests passed; 2 existing `unused_mut` warnings |
| `cd contracts/operator-registry && cargo test` | 4 tests passed |

These checks prove local module health. They do not prove current live
mainnet/Cloudflare E2E readiness.

## External Sources Used

- Goldman Sachs, creator economy TAM and growth:
  <https://www.goldmansachs.com/insights/articles/the-creator-economy-could-approach-half-a-trillion-dollars-by-2027>
- Patreon creator fees:
  <https://support.patreon.com/hc/en-us/articles/11111747095181-Creator-fees-overview>
- Axios on Patreon creator payouts and paid memberships:
  <https://www.axios.com/2025/08/05/patreon-10-billion-creator-economy-ai>
- Vimeo OTT pricing and monetization:
  <https://vimeo.com/ott/pricing>
- Uscreen video monetization positioning:
  <https://www.uscreen.tv/video-monetization/>
- NEAR Intents overview:
  <https://docs.near.org/chain-abstraction/intents/overview>

## Final Synthesis

YouTick has a credible technical base for public-alpha ticketed screenings. The
main architectural story is coherent: browser encryption, NEAR entitlement,
KMS threshold custody, and encrypted IPFS delivery. The main business story is
not yet traction; it is a sharp pre-seed wedge.

The next best move is not a broad refactor. The next best move is to make one
real release evidence packet and one focused market packet:

1. prove one clean live upload-buy-watch path,
2. show the exact first creator ICP,
3. explain the 98/2 economics honestly,
4. keep Web3 in the trust layer,
5. sell "ticketed digital screenings for film and music" as the product.
