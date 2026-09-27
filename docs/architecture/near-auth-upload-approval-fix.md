# NEAR Auth upload approval fix — 2026-09-16

Gate: `NEAR_AUTH_UPLOAD_APPROVAL_FIX`. Status: `COMPLETED_WITH_WARNINGS`.

Scope: shared Google signing-token retrieval, upload error messages and local
regressions. Preserve the original file, browser draft, device key and signing
locks. No wallet signature, payment, upload, provider/config mutation, commit,
push or deployment is part of this gate.

## Findings

- **PROVIDER / read only:** at block 268876462, the Google account held
  600000 micro test USDC and was registered with the token contract. Market had
  no paid job for `lp-85827ca5-1d4a-4ce5-9dc4-814cac141d1d`.
  Evidence: `tmp/near-auth-upload-approval-error/evidence/chain-read.json`.
- **LOCAL_TEST:** installed Auth0 SPA SDK 2.26.0 rejects a still-valid
  30-second token from its silent cache lookup because of its 60-second renewal
  margin; `getTokenWithPopup` returns that same token. The regression uses the
  actual installed SDK cache with synthetic tokens and forbids network calls.
- The [pinned NEAR Auth action](https://raw.githubusercontent.com/Peersyst/fast-auth/38dc894afbc94c198c207f52e6d01d695199eaa1/packages/auth0/src/actions/authorize-app.action.js)
  describes 60-second signing tokens and rejects signing authorization without
  a transaction or delegate-action payload. The old silent retrieval omitted
  that payload when renewal was needed.
- **UNPROVEN:** the original live provider exception was replaced by a generic
  error. This demonstrates a source bug, but cannot establish that it was the
  exact cause of the reported browser failure. No live retry was performed.

## Changed paths

- `apps/web/lib/near-auth-lab.ts`: obtain the signing token directly with the
  installed SDK popup method; expose only allowlisted provider error codes.
  Ordinary login, token verification and payment validation are unchanged.
- `apps/web/components/LivepeerPaidUploadForm.tsx`: distinguish Google approval
  failure before sponsor payment from later upload failures.
- `apps/web/__tests__/unit/near-auth-lab.test.ts`: popup-token flow, no redundant
  silent request, empty token and safe-error regressions.
- `apps/web/__tests__/unit/near-auth-token-cache.test.ts`: actual SDK cache
  regression with a short-lived synthetic token.
- `apps/web/__tests__/unit/near-auth-signing-server.test.ts`: use one timestamp
  for the existing device-duration fixture. A full-suite run exposed a
  millisecond-boundary failure from its previous two clock reads; production
  validation remains unchanged.
- This report. Earlier dirty changes remain outside this gate.

## Verification and next gate

Commands are from `docs/testing.md`: web unit suite, strict NEAR Auth types,
lint and web build. **LOCAL_TEST:** 46 files / 682 tests passed.
**LOCAL_STATIC:** strict types, lint, build and `git diff --check` passed.
The local `/auth-lab` route returned HTTP 200; this is availability evidence,
not Google signing acceptance. Logs are under
`tmp/near-auth-upload-approval-error/evidence/`. Existing middleware/Vite
deprecation warnings are unrelated to this fix.

No CI, Preview/Production release or real Google/sponsor approval acceptance
was run. The next gate is a **manual Google approval on the same draft and
original file**, with a fresh normal-flow review and authorization. Do not send
another USDC top-up or clear signing locks. If a signing lock or uncertain
transaction appears, reconcile it before another signature. The user performs
all real approvals and starts the upload manually.
