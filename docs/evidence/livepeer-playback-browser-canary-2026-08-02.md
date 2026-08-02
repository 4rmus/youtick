# Livepeer signed browser playback canary attempt - 2026-08-02

Status: `PRE_BROWSER_PROVIDER_GATES_REACHED / BROWSER_HARNESS_INVALID /
ASSET_AND_SIGNING_KEY_CLEAN / RUNTIME_DISABLED`

This was one separately approved Sandbox attempt after the canonical HLS canary
was hardened. It is not Chrome or Edge playback, staging, testnet or production
evidence.

## Approved scope

- one temporary H.264/AAC MP4, five seconds and 36,321 bytes;
- one temporary Sandbox signing key, held only in process memory;
- installed Chrome and Edge executable preflight;
- no deployment, runtime-flag activation, NEAR mutation, payment or public
  playback activation;
- no raw asset ID, playback ID, signing key, JWT, API key, TUS URL or HLS body
  retained.

## Result

| Check | Result | Evidence |
|---|---|---|
| Provider gates before the browser step | `REACHED / RUNNER CONTROL FLOW` | The loopback browser canary started only after the asset was ready, the canonical JWT-negative checks, correct/refresh HLS checks and their local redaction logic returned to the runner. The failed run has no success receipt, so individual provider status codes are not claimed. |
| Chrome playback | `INVALID / NOT MEASURED` | The runner treated a missing initial `document.body.dataset.state` as terminal and read the result before the page had attempted playback. |
| Edge playback | `NOT RUN` | The Chrome step exited at the harness error, so the sequential Edge step did not start. |
| Asset cleanup | `PASS / DIRECT INVENTORY` | Immediately after the failed run, the authenticated asset inventory count was `0`. |
| Signing-key cleanup | `PASS / DIRECT INVENTORY` | Immediately after the failed run, the authenticated signing-key inventory count was `0`. |
| Local synthetic media cleanup | `PASS` | The temporary media directory was moved to the local Trash. |

The recorded error was `browser_canary_playback_failed`. It does not identify a
provider, CORS, JWT, header or media-decoding failure. The bug was local to the
browser harness: its wait condition considered any state other than `running`
as terminal, while the page initially had no state at all.

## Local correction after the attempt

The harness now starts the page in `running` state and waits only for `pass` or
`fail`. It retains a compact allowlisted failure class only, such as HLS network
or media plus a broad HTTP class; it never retains a URL, JWT, manifest, response
header, console text or raw browser error. A local read-only browser request for
a nonexistent canonical playback ID now waits for the client result and returns
the redacted `hls_network_other` class. This validates the harness wait and
redaction behavior only; it is not a playback or provider-access result.

## Consequence

`LIVEPEER_BRIDGE_ENABLED` remains `false`. The asset/key cleanup is proven, but
the browser matrix is still open because no real playback was measured with the
corrected harness. A new, explicitly approved one-asset Sandbox canary is
required before Chrome, Edge, JWT refresh or runtime activation can be claimed.
