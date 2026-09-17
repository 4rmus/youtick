# Google upload approval denial — 2026-09-16

> Historical diagnostic record. A later report identifies the provider denial
> as exceeding the 24576-byte prompt limit and reproduces that failure locally.
> The deployed provider revision and fix remain unverified. See the
> [integration status](./near-auth-integration-status.md) for the current
> assessment and next gate.

Gate: `NEAR_AUTH_UPLOAD_ACCESS_DENIED`. Result: `BLOCKED` pending the provider's
specific denial description. No claim that the upload defect is fixed.

## Scope and evidence

The user reported `signing_approval_access_denied` after the previous popup-token
fix. Read-only Brave inspection confirmed this error on the same draft,
`lp-85827ca5-1d4a-4ce5-9dc4-814cac141d1d`. Browser console error/warning inspection
returned no usable provider detail. The adapter requests sponsor payment only
after successful Google authorization and server validation; this failure is
before that step. No fresh chain balance or payment reconciliation was performed
in this gate; the previous gate's balance snapshot is historical.

The request's audience, `delegateAction` parameter and prefixed delegate encoding
match the [pinned official provider](https://raw.githubusercontent.com/Peersyst/fast-auth/38dc894afbc94c198c207f52e6d01d695199eaa1/packages/providers/javascript/src/provider.ts)
and installed NEAR serializer. This source comparison does not prove the deployed
provider configuration. Per [Auth0 troubleshooting](https://support.auth0.com/center/s/article/troubleshooting-the-access-denied-error),
`access_denied` has multiple causes; `error_description` is needed to distinguish
them. The application previously discarded that field.

## Changes and verification

- `apps/web/lib/near-auth-lab.ts`: keep bounded `access_denied` description text
  in the local error, masking URLs, email addresses, provider subject patterns
  and long token-like strings. Do not persist or log the original error object.
- `apps/web/components/LivepeerPaidUploadForm.tsx`: retain the signing-error
  classification when the message includes the provider description. React
  renders it as text, not HTML.
- `apps/web/__tests__/unit/near-auth-lab.test.ts`: cover diagnosis text,
  redaction, control characters and the 400-character limit.
- This report. Other existing dirty files are outside this gate.

LOCAL_TEST: 46 files / 684 tests passed. LOCAL_STATIC: strict NEAR Auth types,
lint, build and diff whitespace check passed. Logs:
`tmp/near-auth-upload-access-denied/evidence/`. Existing Vite and middleware
deprecation warnings remain unrelated.

No agent-triggered login, signing, payment, upload, storage reset, deployment,
provider configuration change, commit, push or CI run. The user's manual signing
preference remains in force. Live approval success and the exact cause of this
denial remain UNPROVEN.

Next step within this gate: select the same original file/draft after the local
update, refresh payment options, and let the user repeat Google authorization
once to obtain the detailed reason. Stop before approving any sponsor wallet
payment during this diagnostic attempt. If a signing lock appears, reconcile
the existing transaction instead of clearing it or starting another attempt.
