# Security Policy

Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/4rmus/youtick/security/advisories/new)
or email **security@youtick.net**. Do not include secrets or private keys in a
public issue.

In scope:

- NEAR market and access contracts
- web wallet, purchase, upload and playback flows
- Livepeer Bridge authentication, webhooks, Durable Objects and playback tokens
- release configuration that could expose credentials or enable a runtime gate

Include the affected component, reproduction steps, impact and any known
mitigation. We aim to acknowledge a report within 72 hours and provide a status
update within 7 days.

The current threat model and operational controls are documented in
[docs/security.md](docs/security.md).
