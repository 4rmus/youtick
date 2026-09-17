# NEAR Auth upload RPC fix — 2026-09-16

Gate: `NEAR_AUTH_UPLOAD_RPC_FIX`. Result: `COMPLETED_WITH_WARNINGS`.

## Findings and scope

The user reported slow Wallet Approval preparation and a signing API 422.
The local log recorded account preparation at 13.5 seconds and a failed
signing check at 23.2 seconds. The old route discarded the failed action and
reason; the exact reason for that past 422 cannot be recovered from this log.

**PROVIDER / read only:** the hardcoded `rpc.testnet.near.org` returned HTTP
429 and explicitly instructed clients to stop using the deprecated endpoint.
The same account query succeeded on `test.rpc.fastnear.com` in 330 ms.
FastNear is already the application's first public testnet upstream and is
listed in the [official NEAR provider documentation](https://docs.near.org/api/rpc/providers).
This is a confirmed connectivity defect, not proof of every earlier failure.

The fix replaces the deprecated endpoint throughout the existing NEAR Auth
pilot with one shared testnet constant. It also preserves allowlisted check
reasons and upload phases through the server and client, so future 422s do not
collapse into the generic upload error. Local failure logs contain only the
action, safe reason and duration; no token, ticket, identity or request body.
There is no retry, cache, longer expiry, additional provider fallback or relaxed
payment/identity/device validation.

## Changed paths

- `apps/web/lib/near-auth-lab.ts`: shared testnet endpoint and safe check codes.
- `apps/web/lib/near-auth-account-preflight.ts`
- `apps/web/lib/near-auth-signing-server.ts`
- `apps/web/lib/near-auth-signing.ts`
- `apps/web/lib/near-auth-funding.ts`
- `apps/web/lib/near-auth-media-preflight.ts`
- `apps/web/lib/near-auth-ticket-purchase.ts`
- `apps/web/app/api/auth-lab/signing/route.ts`
- `apps/web/components/LivepeerPaidUploadForm.tsx`
- Existing unit tests: `near-auth-account.test.ts`,
  `near-auth-usdc-server.test.ts`, `near-auth-signing-server.test.ts`,
  `near-auth-media.test.ts`, `near-auth-signing-client.test.ts`,
  `near-auth-upload-wallet.test.ts` under `apps/web/__tests__/unit/`.
- This report. Earlier unrelated dirty paths remain untouched.

The funding connector and single-attempt transaction submission use the same
endpoint as the reads; no real funding or broadcast was executed to test them.

## Verification

- **LOCAL_TEST:** 46 files / 689 tests passed, including server-reason redaction
  and no sponsor payment after a failed post-Google server check.
- **LOCAL_STATIC:** strict NEAR Auth types, lint, build and diff whitespace check
  passed. Existing Vite/middleware deprecation warnings remain.
- **LOCAL runtime + PROVIDER:** user-session Brave account check succeeded in
  2.1 seconds (1.813 seconds application time), compared with the previous
  13.5-second observation. This is one observation, not a latency percentile.
- **PROVIDER / read only:** at block 268880300, protocol 85, the same Google
  account retained 600000 micro test USDC and
  `lp-85827ca5-1d4a-4ce5-9dc4-814cac141d1d` had no paid Market job.

Evidence: `tmp/near-auth-upload-rpc-fix/evidence/` contains the test/build logs
and `provider-read.json`. Runtime timing comes from
`tmp/near-auth-google-upload-runtime/server.log`.

No CI, deploy, provider configuration change, commit, push, wallet signature,
payment, source upload, browser storage reset or signing-lock clearing was run.
Google approval and end-to-end upload remain **UNPROVEN**.

Next gate: manual Google/sponsor approval on the same original file and draft,
with fresh payment options. Existing limits remain 0.60 test USDC total upload
fee and at most 0.35 test NEAR for the sponsor signature. No additional USDC
top-up is needed according to the recorded fresh balance. If another check
fails, use the new phase/reason and log before another attempt; do not clear
locks or create a replacement paid job.
