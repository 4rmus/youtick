# YouTick

YouTick is a paid video application built around NEAR, USDC and Livepeer
Studio. Creators upload video bytes directly to Livepeer with TUS. NEAR
contracts remain authoritative for paid jobs, publications, purchases,
entitlements and Play grants. A Cloudflare Worker handles only the Livepeer
control plane and short-lived playback tokens.

## Repository

- `apps/web` — Next.js application
- `contracts/nft-ticket` — paid job, publication and settlement contract
- `contracts/access-control` — Play grant contract
- `workers/livepeer-bridge` — upload, webhook and playback-token control plane
- `read-model` — source-only D1 schema and deterministic final-event rebuild
- `protocol/paid-media-livepeer-v1` — schemas and golden vectors
- `docs` — current architecture, configuration, testing and release guidance

Video request bodies do not pass through the web application or the Worker.

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

cd ../../docs
npm ci
npm run build
```

Contract and protocol commands are listed in [Testing](docs/testing.md).

## Runtime status

The Livepeer web and Worker gates remain disabled by default. This repository
cleanup is not a deployment, provider activation or production-readiness claim.
A release requires fresh market/access contract IDs, exact-commit staging
evidence, closed canaries and separate approval before either runtime gate is
enabled.

See [Architecture](docs/architecture/README.md),
[Configuration](docs/getting-started/configuration.md),
[Security](SECURITY.md) and [Release](docs/release-runbook.md).
