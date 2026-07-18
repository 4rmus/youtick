# Deployment Overview

> Public deployment overview for contributors and reviewers. Detailed mainnet
> operator procedures, transaction evidence, endpoint inventories, owner-key
> handling and incident actions belong in private operations notes.

## Release Posture

YouTick is public-alpha software. Mainnet contracts may be live, but a release
must not be described as production-ready until the smoke gates, operator
health, governance posture and security review status support that claim.

The public-alpha admin posture is:

- NFT market admin remains owner-controlled for V1.
- Registry changes should use timelock governance where deployed.
- Access-control governance must be verified against the live contract before
  any admin claim is made.
- Destructive or migration-only contract methods must not be present in normal
  production builds.

## Pre-Flight

Run the relevant checks before any deploy:

```bash
(cd apps/web && npm ci && npm run lint && npm test -- --run && npm run build)
(cd workers/youtick-kms && npm ci && npm test -- --run && npm run check)
(cd workers/web4-proxy && npm ci && npm run check && npm test -- --run)
(cd workers/storage-api && npm ci && npm run check && npm test -- --run)
(cd workers/media-delivery && npm ci && npm run check && npm test -- --run)
(cd contracts/nft-ticket && cargo test --lib && cargo test --test sandbox)
(cd contracts/access-control && cargo test)
(cd contracts/operator-registry && cargo test)
```

Do not deploy from a failing check set.

## Public Deployment Order

1. Build and test the changed package.
2. Deploy contracts only when the migration and ABI risk is understood.
3. Update registry/operator state through the reviewed governance path.
4. Deploy workers with secrets supplied through the hosting provider, not git.
5. Deploy the web app or Web4 static build.
6. Run the public-alpha smoke checklist.
7. Update public release notes with only high-level outcomes.

## Configuration Rules

- Real KMS operator configs stay outside git.
- Real Cloudflare secrets stay in Wrangler/Cloudflare secret storage.
- Public `wrangler.toml` files use placeholders for KV namespace IDs.
- Production CORS origins should include public app origins only; localhost
  belongs in dev/test environments.
- KMS discovery stays registry-driven and fail-closed.

Do not rebuild the NFT WASM on the deploy machine. Download the immutable
`nft-ticket-<commit SHA>` artifact produced by the green CI run. It contains
`youtick_nft.wasm`, `youtick_nft_abi.json` and `manifest.json`; the deploy script
rejects a missing or mismatched WASM/ABI SHA-256 manifest.

## Contract Build Notes

Use the local contract README files and Cargo configs for exact build commands.
Only enable migration features when a reviewed migration explicitly requires
them. Normal deploy builds must not expose reset or wipe paths.

Record the current RPC code hash immediately before deployment. Deploy requires
that exact old hash and verifies the deployed bytecode against the manifest:

```bash
export NFT_NETWORK_ID=mainnet
export NFT_CONTRACT_ID=youtick.near
export NFT_ARTIFACT_MANIFEST=/absolute/path/to/nft-ticket-<commit>/manifest.json
export NFT_EXPECTED_OLD_HASH=<current-rpc-code-hash>
export NFT_DEPLOY_CONFIRM="DEPLOY:youtick.near:mainnet:<manifest-wasmSha256>"
node scripts/deploy-nft-mainnet.mjs
```

Set `RUN_MIGRATION=1` only for a separately reviewed migration build. Any
migration error is fatal; it must never be reported as a successful deploy.

## Smoke Gate

Before announcing a release beyond public alpha, run the high-level smoke in
[`launch-smoke-checklist.md`](launch-smoke-checklist.md):

- app loads,
- wallet connects,
- short encrypted upload succeeds,
- KMS stores and retrieves enough shares,
- purchase succeeds,
- playback starts,
- worker/app telemetry shows no release spike.

Detailed accounts, transaction hashes, endpoints and recordings should be kept
in private operations evidence.

## Rollback

Web and worker rollback should use hosting-provider deployment history.
Contract rollback is not a normal path; pause or fix-forward actions require a
reviewed operator process and private incident record.
