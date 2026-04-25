# Security Policy

YouTick handles wallet flows, encrypted media keys and production operator
configuration. Please do not open public issues for security reports.

## Reporting

Until a dedicated security mailbox is published, use GitHub Security Advisories
for private reports. Include:

- affected component
- steps to reproduce
- possible impact
- suggested fix, if known

## Scope

In scope:

- smart contracts in `contracts/`
- web app auth, upload, playback and gift/trial flows in `apps/web/`
- KMS workers in `workers/youtick-kms/`
- deployment scripts that can expose secrets or unsafe defaults

Out of scope:

- social engineering
- denial-of-service without a concrete code weakness
- issues in third-party wallets, RPCs or gateways unless YouTick usage makes
  the impact worse

## Public Status

Known operational issues are tracked in
[`docs/operations/known-issues.md`](docs/operations/known-issues.md).
