# Security Policy

YouTick handles wallet flows, encrypted media keys and production operator
configuration. Please do not open public issues for security reports.

## Reporting

Report privately through
[GitHub Security Advisories](https://github.com/4rmus/youtick/security/advisories/new).
If you cannot use GitHub, email **security@youtick.net**.

Include:

- affected component
- steps to reproduce
- possible impact
- suggested fix, if known

We aim to acknowledge reports within **72 hours** and to provide a remediation
plan or status update within **7 days**. Please give us a reasonable
opportunity to address an issue before any public disclosure.

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
