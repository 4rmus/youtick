# Security model

Livepeer receives plaintext media. YouTick does not claim provider-independent
confidentiality or availability for the video layer.

The enforced controls are:

- signed, job-bound upload and playback requests
- exact origin, account, public-key, resource, body hash and expiry binding
- raw-body webhook authentication with timestamp and replay checks
- final-block NEAR reads for publication, entitlement and Play grant
- short-lived ES256 playback tokens with `Cache-Control: no-store`
- memory-only browser token handling through the `Livepeer-Jwt` header
- idempotent Durable Object state for ambiguous provider and NEAR operations
- a narrow finite-allowance operator key; no FullAccess key
- explicit allowlists, budgets and disabled-by-default activation gates

Secrets belong in the Worker secret store and must be redacted from logs.
Upload endpoints and playback tokens are bearer capabilities and must not be
persisted in URLs or browser storage.

Takedown and sale-suspension decisions are recorded by the market contract.
Provider removal is a separate operational action and may not be immediate.

Report vulnerabilities according to the repository root security policy.
