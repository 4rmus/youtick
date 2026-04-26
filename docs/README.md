# YouTick Documentation

> Current source architecture: browser encryption, NEAR entitlements,
> registry-enforced operators, and share-based playback

YouTick's source code supports client-side media encryption, a market/access/registry
contract split, and a multi-operator playback path. Live mainnet can lag behind
source code, so release decisions should use the current readiness report first.

**Mainnet target:** `youtick.near`, `access.youtick.near`, `registry.youtick.near`
**Target playback path:** Browser AES-CTR + registry-enforced operator share reconstruction
**Current release posture:** public alpha candidate, not production-ready

## Reading Labels

- `LIVE`: bugun kodda aktif olan veya operasyonu dogrudan etkileyen yuzey
- `TARGET`: hedef mimari veya gelecekte tamamlanacak tasarim
- `LEGACY`: uyumluluk icin duran eski yol

---

## Current Source of Truth

- [Mainnet and Open Source Readiness, 2026-04-26](mainnet-open-source-readiness-2026-04-26.md)
- [Known Issues & Operational Risks](operations/known-issues.md)
- [Mainnet Deploy Runbook](operations/mainnet-deploy-runbook.md)

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

> Eski `docs/guides/` sayfalari kaldirildi; operasyonel konular artık
> `docs/operations/` altında tutulur. Davranis icin `apps/web/lib/*` ve
> kontrat kaynaklari gecerlidir.

- [Storage & Delivery](architecture/storage.md) `LIVE`
- [Contract Methods](api/contract-methods.md) `TARGET`
- [Security](security.md)

## Reference

- [Contract Methods](api/contract-methods.md) `TARGET`
- [Frontend](frontend.md)
- [Security](security.md)
- [Testing](testing.md)
- [Contributing](contributing.md)
- [Mainnet and Open Source Readiness](mainnet-open-source-readiness-2026-04-26.md)
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

*Last Updated: April 26, 2026*
