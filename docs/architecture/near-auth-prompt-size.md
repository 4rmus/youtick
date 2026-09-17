# NEAR Auth prompt size limit — 2026-09-16

> Historical diagnosis and initial fixture measurements. Gate 1 now has a
> portable, locked provider handoff at `scripts/near-auth-provider-handoff/README.md`.
> The [integration status](./near-auth-integration-status.md) is the current
> gate/dependency record. A local PASS still does not prove a deployed fix.

Gate: `NEAR_AUTH_PROMPT_SIZE`. Result: `BLOCKED` on provider deployment;
local reproduction and proposed provider patch pass.

## Confirmed cause

The user reports `access_denied` with: the total prompt options exceed 24576
bytes. This rejection is before sponsor payment. Auth0 documents a
[24 KB form fields limit](https://auth0.com/docs/customize/forms/render).

The [NEAR Auth action](https://github.com/Peersyst/fast-auth/blob/38dc894afbc94c198c207f52e6d01d695199eaa1/packages/auth0/src/actions/authorize-app.action.js)
passes serialized actions into `api.prompt.render`. Its shared `stringifyActions`
pretty-prints every byte in function-call arguments. A representative synthetic
YouTick upload reproduces this size failure using the actual upstream action
and its delegate decoder, with the locally installed NEAR encoders.

| Measurement | Bytes |
| --- | ---: |
| Encoded delegate | 2,235 |
| Original prompt options | 27,101 |
| Limit reported by Auth0 | 24,576 |
| Compact prompt options | 7,104 |

These are synthetic fixture measurements, not a captured live user payload.
The deployed provider source revision has not been independently verified.
The source video is not sent to Auth0; reducing its resolution or topping up
the wallet does not address this form-formatting failure.

## Proposed correction

`near-auth-prompt-size.patch` removes only the indentation argument from
`JSON.stringify` in the provider's shared `stringifyActions` function. It
preserves all displayed values, large-integer formatting and the exact `fatxn`
signing bytes. It does not truncate, omit, hash-substitute or compress the
signed transaction; no contract or token-verification rules are changed.

**LOCAL_TEST:** original action fails a simulated 24576-byte prompt boundary;
patched action fits. Parsed display content and signing payload are identical.
Ordinary transaction rendering also fits (7075 bytes); the explicit user-denial
path is preserved. The test performs no network calls or signatures.

Reproduce the permanent handoff from a clean checkout or extracted package
(Node.js 24 and Git; run at the package/repository root):

```sh
npm ci --prefix scripts/near-auth-provider-handoff --ignore-scripts --no-audit --no-fund
npm test --prefix scripts/near-auth-provider-handoff
```

The original reproduction and measurements above remain historical evidence in
`tmp/near-auth-prompt-size/evidence/result.json`. The permanent package needs
neither that temporary folder nor application dependencies. It tests the actual
patch, maximum-byte ASCII/Turkish/escaped titles, exact display/signing payloads,
large integers and denial behavior. Its canonical quote-ID fixture gives
27,052 → 7,055 bytes for the representative delegate; the original fixture
used a placeholder quote ID. See the handoff for all expected measurements.

## Changes and boundary

Only this report, the proposed provider patch and temporary local reproduction
artifacts were written. YouTick application code and existing dirty files were
not changed. No new dependency, provider setting, signature, payment, upload,
browser change, commit, push, external message, CI or deployment was performed.
The full application suite was not rerun because application code did not change.

Provider deployment remains an external dependency: the administrator of
`login.testnet.fast-auth.com` must review the deployed source and proposed patch.
A local patch does not change that hosted service. Auth0 administration
access/ownership is not established here. The local safety/playback gates in
the integration status may be started separately while deployment is pending;
live retesting requires those prerequisites and user-controlled fresh approval.
Do not keep retrying the unchanged live flow or clear its signing locks.
