---
name: youtick-near-auth
description: "Use for YouTick Google/Auth0 login, MPC signing, redirect/session restoration and authenticated upload or ticket flow. Does not imply passkey/account-linking acceptance."
---

# YouTick NEAR Auth

Paths below are relative to the repository root. Read `docs/architecture/near-auth-integration-status.md` for context, but verify dated claims against current source and evidence. If a referenced local-only file is absent, report that gap; do not reconstruct its behavior from history.

1. Inspect `apps/web/package.json`, lockfile and installed types. Current source uses Auth0 SPA, jose and near-api-js v7; do not silently substitute the older NEAR Auth browser SDK or downgrade the SDK. Use [near-api-js](../near-api-js/SKILL.md) only for relevant protocol APIs.
2. Trace `apps/web/lib/near-auth-lab.ts`, `near-auth-lab-session.ts`, `near-auth-signing.ts`, `near-auth-signing-server.ts` and the relevant `apps/web/app/api/auth-lab/` route. For uploads follow `near-auth-upload-wallet.ts` and `near-auth-upload-server.ts`; for tickets follow `near-auth-ticket-purchase.ts`.
3. Distinguish identity/session, approved payload, exact signed bytes, sponsor/MPC result, finalized outer/inner receipts and final job/entitlement. Check token audience/issuer/expiry, account binding, integer precision, fresh nonce/block/quote and preserved bytes across encoding. Reconcile pending records before a retry; never infer payment success from an MPC signature.
4. Preserve redirect draft, current identity, device-key binding and rejection handling. Session restoration must not request a new signature. Do not clear pending records, replace keys or merge identities to bypass a failure. Never log JWTs, cookies, subject identifiers or private keys. Keep lab environment/network/host restrictions and disabled defaults.
5. Select the relevant Web tests and `npm run test:near-auth-types` from `docs/testing.md`; use provider-handoff/compact compatibility checks only when those payloads change. Browser mock checks remain LOCAL_TEST. Real Google/passkey/sponsor/payment acceptance requires its own authorized scope and user signatures.

Report the failing boundary, source/version evidence, smallest correction and remaining live acceptance gap. Check official `https://docs.auth.near.org/` documentation for provider behavior; the generic wallet skill is not an Auth specification.
