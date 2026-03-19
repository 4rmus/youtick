# Progress

## Completed

- [x] Created and deployed the split-contract testnet architecture
- [x] Deployed the testnet market contract
- [x] Deployed the testnet access contract
- [x] Deployed the testnet registry contract
- [x] Switched local development to a clean testnet market contract
- [x] Preserved single-approval upload UX with upload session keys
- [x] Added access-grant support for playback and off-chain authorization
- [x] Added registry enforcement to the KMS operator workers
- [x] Added registry enforcement to the trial relayer route
- [x] Bootstrapped active registry relayer records on testnet
- [x] Bootstrapped active decryption operator records on testnet
- [x] Deployed five testnet KMS operators
- [x] Deployed operator A
- [x] Deployed operator B
- [x] Deployed operator C
- [x] Deployed operator D
- [x] Deployed operator E
- [x] Moved playback from single-key retrieval toward share-based retrieval
- [x] Implemented Shamir share split and reconstruction in the web app
- [x] Implemented operator-side encrypted share storage in the KMS workers
- [x] Enabled live `3-of-5` operator topology in the registry
- [x] Optimized playback so reconstruction starts after the first required shares arrive
- [x] Added share retrieval tracing logs in the browser console
- [x] Updated main architecture docs to reflect the live model
- [x] Added a final implementation report under `docs/architecture`

## Planned

- [ ] Add operator latency metrics and rank operators by observed response time
- [ ] Prefer the fastest healthy operators before issuing requests to the full set
- [ ] Add operator health aggregation to the web app for easier debugging
- [ ] Add end-to-end smoke tests that assert share reconstruction from multiple operators
- [ ] Add failure-injection tests with one or two operators intentionally degraded
- [ ] Move operator share secrets to a stricter secret-management path for production
- [ ] Replace registry-only operator identities with stronger operator identity guarantees where needed
- [ ] Evaluate using `transport_public_key` for stronger operator-channel validation
- [ ] Add a production rollout checklist for mainnet cutover
- [ ] Add a concise operator operations runbook for rotation, revocation, and recovery
