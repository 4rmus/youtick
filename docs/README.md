# YouTick Documentation

> Current source architecture: browser encryption, NEAR entitlements,
> registry-enforced operators, share-based playback, and hybrid decentralized
> operations

YouTick's source code supports client-side media encryption, a market/access/registry
contract split, and a multi-operator playback path. It is public alpha software,
not production-ready and not fully decentralized today. Live mainnet can lag
behind source code, so release decisions should use the locked launch plan
([`launch-plan-2026-05.md`](launch-plan-2026-05.md)) first.

**Mainnet:** `youtick.near`, `access.youtick.near`, `registry.youtick.near`
**Playback path:** Browser AES-CTR + registry-enforced operator share reconstruction (3-of-5)
**Release posture:** public alpha, not production-ready

## Reading Labels

- `LIVE`: surface currently active in code or directly affecting operations
- `TARGET`: target architecture or design to be completed in the future
- `LEGACY`: older path kept for compatibility
- `EXPERIMENTAL`: surface gated by an env flag or operator decision; public-alpha trial
## Current Source of Truth

- [Launch Plan 2026-05](launch-plan-2026-05.md) — locked single plan (alpha, pre-seed)
- [Known Issues & Operational Risks](operations/known-issues.md)
- [Mainnet Deploy Runbook](operations/mainnet-deploy-runbook.md)
- [Release Runbook](release-runbook.md)
- [Public Alpha User Guide](public/alpha-user-guide.md)

---

## Get Started

- [Prerequisites](getting-started/prerequisites.md)
- [Installation](getting-started/installation.md)
- [Configuration](getting-started/configuration.md)
- [Quick Start](quick-start.md)

## Architecture

- [System Architecture](architecture/README.md) `LIVE`
- [Storage & Delivery](architecture/storage.md) `LIVE`
- [Session Keys & Upload Sessions](architecture/session-keys.md) `LIVE + LEGACY`
- [Smart Contract](architecture/smart-contract.md) `LIVE`
- [Product Differentiators](architecture/innovations.md)

## Practical topics

> The old `docs/guides/` pages have been removed; operational topics now
> live under `docs/operations/`. For behavior, refer to `apps/web/lib/*`
> and the contract sources.

- [Storage & Delivery](architecture/storage.md) `LIVE`
- [Contract Methods](api/contract-methods.md) `LIVE`
- [Security](security.md)

## Reference

- [Contract Methods](api/contract-methods.md) `LIVE`
- [Frontend](frontend.md)
- [Security](security.md)
- [Testing](testing.md)
- [Contributing](contributing.md)
- [Launch Plan 2026-05](launch-plan-2026-05.md) — locked plan
- [Overview](overview.md)

---

## Suggested Reading Order

For a new engineer, the shortest path is:

1. [Quick Start](quick-start.md)
2. [System Architecture](architecture/README.md)
3. [Storage & Delivery](architecture/storage.md)
4. [Smart Contract](architecture/smart-contract.md)
5. [Contract Methods](api/contract-methods.md)

---

*Last Updated: May 14, 2026*
