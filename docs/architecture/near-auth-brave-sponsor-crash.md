# Brave sponsor-window crash — 2026-09-16

Gate: `NEAR_AUTH_BRAVE_SPONSOR_CRASH_REVIEW`. Result: `BLOCKED` for live
wallet acceptance; read-only diagnosis completed.

Scope: local OS crash records, current browser availability, existing sponsor
account state and existing upload job. No application code, wallet action,
browser profile, device key, lock, configuration or release change.

## Findings

- The user confirms Brave closed before approving the wallet transaction.
- LOCAL_STATIC: three macOS crash reports at approximately 16:03, 16:49 and
  21:00 show the Brave main process terminating with `EXC_BAD_ACCESS` /
  `SIGSEGV`, the same invalid address and identical first 17 frame offsets.
  This confirms an OS-level browser crash; it does not establish which wallet,
  extension, browser integration or native browser operation triggered it.
- Crash version and installed application are Brave 1.95.101
  (`153.1.95.101`), macOS 26.5.1. CUA inspection found Brave not running.
- PROVIDER / read only: between blocks 268880300 (before the crash) and
  268880785 (after), `utick2.testnet` had unchanged balance, locked amount,
  access keys and nonces. No sponsor spend is observed in that interval.
- PROVIDER / read only: at block 268880699, Market returned no paid job for
  `lp-85827ca5-1d4a-4ce5-9dc4-814cac141d1d`.
- The [official Brave release](https://github.com/brave/brave-browser/releases/tag/v1.95.102)
  published at 2026-09-16 05:13 UTC is 1.95.102 with Chromium 153.0.8010.48.
  Its notes do not establish a fix for this exact crash signature.

Evidence summaries are in `tmp/near-auth-brave-crash-2100/evidence/`:
`crash-summary.json` and `sponsor-reconciliation.json`. Raw OS reports remain
under the user's DiagnosticReports folder and were not uploaded or published.

## Boundary and next gate

Only this report and local evidence were written. No source fix, automated
crash reproduction, real wallet signature, payment, upload, browser restart,
profile reset, key import/export, extension change or browser update was run.
Code tests, CI and deployment were not run because code was not changed.

Next gate: update the existing Brave installation to the current stable
version while preserving its existing profile, then check wallet-window
stability without approving a payment. Do not bypass signing locks or switch
to a new browser/device as though that preserved the existing device binding.
Any later Google approval must be fresh; do not reuse an expired authorization.
