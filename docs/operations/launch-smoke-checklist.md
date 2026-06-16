# Public Alpha Smoke Checklist

> High-level release gate for public documentation. Do not record real wallet
> names, transaction hashes, private endpoints, session public keys or watch URLs
> in this public file. Store detailed evidence in private operations notes.

## Scope

The minimum public-alpha release gate is one successful primary path:

1. creator connects wallet,
2. creator uploads a short encrypted video,
3. KMS stores enough key shares,
4. buyer purchases access,
5. buyer starts playback and reconstructs the key through the KMS threshold.

NEAR-native purchase is the primary path. Stablecoin and cross-chain purchase
paths remain experimental until separately verified for the release.

## Pre-Flight

- [ ] Web lint, tests and production build pass.
- [ ] Worker type checks and tests pass.
- [ ] Contract tests pass for any changed contract.
- [ ] Registry lists enough active KMS operators for the configured threshold.
- [ ] Storage API Worker is configured with server-side provider secrets.
- [ ] Onboarding keys are server-only and not exposed in the client bundle.
- [ ] Real operator configs and endpoint inventories are outside git.

## Primary Smoke

| Step | Expected |
|---|---|
| Load app | Landing/discover page renders without console-breaking errors |
| Connect wallet | Creator wallet connects |
| Upload | Short encrypted video uploads through the Storage API Worker |
| Store shares | KMS stores enough shares for the configured threshold |
| Buy ticket | Buyer purchase succeeds and `has_ticket` becomes true |
| Watch | Playback reconstructs the key and starts video |
| Observe | Worker errors and app telemetry show no release spike |

## Experimental Rails

Run these only when the release claims support for them:

- [ ] NEAR-native USDC purchase.
- [ ] NEAR-native USDT purchase.
- [ ] Cross-chain checkout through 1Click.

Record detailed evidence privately and summarize only the pass/fail outcome in
public release notes.

## Result

- [ ] Primary path passed.
- [ ] Experimental rails, if claimed, passed.
- [ ] Known public-alpha limitations were updated.
- [ ] Release notes avoid private endpoint, key, transaction and account details.
