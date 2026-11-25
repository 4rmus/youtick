# YouTick

YouTick is a paid video application. A creator pays an upload fee and publishes
a video; a viewer buys a ticket and watches it. Everything in this repository
runs on NEAR testnet. There is no mainnet deployment and no real-money launch:
test USDC and test NEAR have no value.

The repository holds two generations of the product:

- **V2** is the current line. Viewers and creators sign in with Google or a
  passkey through NEAR Auth, a ticket is bound to a key derived in the browser
  instead of to an account, and video is stored and delivered by Cloudflare
  Stream. It runs in its own testnet environment
  ([V2 testnet runbook](docs/v2-testnet-runbook.md)).
- **V1** is the earlier wallet-only testnet pilot on Livepeer Studio. The pilot
  was closed on 1 November 2026. Its contracts and code paths are frozen and
  stay in the tree until they are removed in a separate milestone. See
  [V1 scope and open responsibilities](docs/architecture/youtick-v1-product-scope.md).

## Boundaries

- NEAR contracts are authoritative for paid jobs, publications, tickets,
  escrow, refunds and playback devices.
- The media provider receives the video and owns processing, storage and
  delivery. Video bytes go from the browser straight to the provider; they do
  not pass through the web application or any Worker.
- The Bridge is a control plane: upload intents, provider webhooks,
  publication finalization and short-lived playback tokens.
- D1 is a derived read model for discovery and profile pages. It can be
  deleted and rebuilt from final chain events.

## Repository

Application and Workers:

- `apps/web` — Next.js application, deployed to Cloudflare Workers with OpenNext
- `workers/livepeer-bridge` — the Bridge. The directory keeps its V1 name; it
  holds both the Cloudflare Stream adapter (V2) and the Livepeer adapter (V1)
  behind one `MediaProvider` boundary
- `workers/relayer` — V2 relayer: sponsors account creation, the key
  derivation request, purchases, upload fees and device links for NEAR Auth
  users
- `workers/payment-service` — V2 VAT attestations, refund request inbox and the
  card path (disabled)
- `read-model` — D1 schema and the Worker that rebuilds it from final events

Contracts (Rust, `cargo +1.86.0`, `near-sdk =5.5.0`):

- `contracts/market-v2` — V2 Market: jobs, publications, tickets, escrow,
  refunds
- `contracts/ckd-gate` — V2 proxy for the NEAR MPC key derivation request; not
  audited
- `contracts/nft-ticket` — V1 Market (frozen)
- `contracts/access-control` — V1 Play grants (frozen)

Protocol definitions and golden vectors:

- `protocol/youtick-market-v2` — V2 message formats, ticket keys, VAT
  attestation
- `protocol/paid-media-v1` — provider-neutral media profile descriptor for
  Cloudflare Stream
- `protocol/paid-media-livepeer-v1` — V1 schemas and vectors

Everything else:

- `docs` — VitePress site: architecture, configuration, testing, runbooks
- `observability` — alert and observability policy
- `scripts` — repository checks and release tooling

## Local checks

```bash
cd apps/web
npm ci
npm test -- --run
npm run test:livepeer-canary
npm run lint
npm run build

cd ../../workers/livepeer-bridge
npm ci
npm test -- --run
npm run test:provider-canary
npm run check
npx wrangler deploy --dry-run

cd ../relayer
npm ci
npm test -- --run
npm run check

cd ../payment-service
npm ci
npm test -- --run
npm run check

cd ../../docs
npm ci
npm run build
```

[Testing](docs/testing.md) is the single source for the full command list,
including contracts, protocol vectors, the read model and running the web
application locally against the V2 testnet.

## Runtime status

Feature gates in source default to off, and a gate being present in source is
not evidence that it is active anywhere. Passing local checks or CI does not
prove a deployment, a provider activation or production readiness.

- The V2 testnet environment is deployed only through the protected GitHub
  workflows described in the [V2 testnet runbook](docs/v2-testnet-runbook.md)
  and [Cloudflare release](docs/cloudflare-release.md).
- The card path and device linking are in source and disabled by default.
- Nothing here has been deployed to mainnet. `ckd-gate` has not been audited.

Several pages under `docs/architecture` and some component README status lines
still describe earlier stages. Read a status line as a dated record, not as the
current runtime state.

See [Architecture](docs/architecture/README.md),
[Configuration](docs/getting-started/configuration.md),
[Security](SECURITY.md) and [Release](docs/release-runbook.md).
