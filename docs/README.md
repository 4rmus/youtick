# YouTick Documentation

> Current runtime: browser encryption, NEAR entitlements, registry-enforced operators, and share-based playback

YouTick currently runs with client-side media encryption, a market/access/registry contract split, and a multi-operator playback path. When docs and code disagree, the codebase is the source of truth.

**Mainnet target:** `youtick.near`, `access.youtick.near`, `registry.youtick.near`  
**Current playback path:** Browser AES-CTR + registry-enforced operator share reconstruction

## Reading Labels

- `LIVE`: bugun kodda aktif olan veya operasyonu dogrudan etkileyen yuzey
- `TARGET`: hedef mimari veya gelecekte tamamlanacak tasarim
- `LEGACY`: uyumluluk icin duran eski yol

---

## Get Started

- [Prerequisites](getting-started/prerequisites.md)
- [Installation](getting-started/installation.md)
- [Configuration](getting-started/configuration.md)
- [Quick Start](quick-start.md)

## Architecture

- [System Architecture](architecture/README.md) `LIVE`
- [Youtick Zero Trust Architecture v1](architecture/youtick-zero-trust-architecture-v1.md) `TARGET`
- [Final Implementation Report](architecture/final-implementation-report.md) `LIVE`
- [Storage & Delivery](architecture/storage.md) `LIVE`
- [Session Keys & Upload Sessions](architecture/session-keys.md) `LIVE + LEGACY`
- [Smart Contract](architecture/smart-contract.md) `LIVE`
- [Product Differentiators](architecture/innovations.md)

## Guides

- [User Flows](guides/user-flows.md)
- [Developer Guide](guides/developer-guide.md)
- [Environment](guides/environment.md)
- [Mainnet Runbook](operations/mainnet-runbook.md)
- [Mainnet Task Owners](operations/mainnet-task-owners.md)

## Reference

- [Contract Methods](api/contract-methods.md) `TARGET`
- [Frontend](frontend.md)
- [Security](security.md)
- [Testing](testing.md)
- [Contributing](contributing.md)
- [Roadmap](roadmap.md)
- [Overview](overview.md)

---

## Suggested Reading Order

For a new engineer, the shortest path is:

1. [Quick Start](quick-start.md)
2. [System Architecture](architecture/README.md)
3. [Final Implementation Report](architecture/final-implementation-report.md)
4. [Youtick Zero Trust Architecture v1](architecture/youtick-zero-trust-architecture-v1.md)
5. [User Flows](guides/user-flows.md)
6. [Contract Methods](api/contract-methods.md)

---

*Last Updated: March 16, 2026*
