# Livepeer canonical JWT playback canary - 2026-08-02

Status: `INCONCLUSIVE / HLS_STATUS_ONLY_GATE_INVALID /
ASSET_AND_SIGNING_KEY_CLEAN / BROWSER_MATRIX_NOT_RUN / RUNTIME_DISABLED`

This is the separately approved, one-asset canonical rerun following the
inconclusive earlier attempt. It is not Chrome/Edge playback, testnet, staging
or production evidence.

## Approved scope

- one synthetic H.264/AAC MP4, five seconds and 318,134 bytes;
- one temporary Sandbox signing key, held only in process memory and deleted at
  the end;
- installed Chrome `151.0.7922.72` and Edge `151.0.4129.59` opened a
  loopback-only preflight page before provider mutation;
- no deployment, runtime-flag activation, NEAR mutation, payment or public
  playback activation;
- no raw asset ID, playback ID, signing key, JWT, API key or TUS URL retained.

## Result

| Check | Result | Evidence |
|---|---|---|
| Asset and playback JWT policy | `PASS / PROVIDER READ` | The ready asset and playback records both reported `playbackPolicy.type = jwt`; otherwise the canary would have stopped before access probing. |
| JWT-free canonical product HLS denial | `INCONCLUSIVE / STATUS ONLY` | A headerless request to `playback.livepeer.studio/asset/hls/{playbackId}/index.m3u8` returned HTTP `200`, but the completed canary retained no HLS body classification. |
| Read-only HLS error baseline | `PASS / HTTP SEMANTICS` | The same route with a synthetic nonexistent playback ID returned HTTP `200` with only `#EXTM3U`, `#EXT-X-ERROR` and `#EXT-X-ENDLIST`; it had no variant or media URI. HTTP status alone is therefore not an access decision. |
| JWT-free MP4 and download denial | `NOT RUN` | The canary stops at the first required negative gate. |
| Malformed/wrong-key/wrong-subject/expired probes | `NOT RUN` | The anonymous canonical HLS gate failed first. |
| Correct-token and refreshed-token HLS | `NOT RUN` | The negative gate failed first. |
| Chrome and Edge HLS.js matrix | `NOT RUN` | The local browser server starts only after all provider HLS gates pass. The loopback launch preflight is not playback evidence. |
| Asset cleanup | `PASS / DIRECT INVENTORY` | Immediately after the run, the authenticated asset inventory count was `0`. |
| Signing-key cleanup | `PASS / DIRECT INVENTORY` | Immediately after the run, the authenticated signing-key inventory count was `0`. |
| Local synthetic media cleanup | `PASS` | The sole temporary media directory was moved to the local Trash; no second asset was created. |

The error was `playback_canary_expected_denial_anonymous_hls_200`. It is the
ordinary canary failure path, not a cleanup failure; the runner completed its
internal cleanup path before emitting the error. Individual TUS response codes
were intentionally not retained by this failed receipt, so they are not claimed
as separate provider evidence here. The probe retained only HTTP status, not the
HLS body. The later read-only baseline proves that Livepeer can encode a denied
or unavailable HLS request as HTTP `200` plus an HLS error manifest. The old
asset body cannot be recovered after its approved cleanup, so it cannot be
retrospectively classified.

## Consequence

`LIVEPEER_BRIDGE_ENABLED` remains `false`. The status-only canary predicate was
invalid; it was not proof that JWT access control is exposed. For an HTTP `200`
HLS response, the revised local canary treats only a non-playable HLS error
manifest as denied; HTTP `401`/`403` already count as denial. It requires a
playable HLS manifest for a correct JWT. If the top-level manifest is playable,
it probes every recognized first-level variant or media-segment reference (at
most 32) without a JWT using manual redirect handling; an unrecognized URI
attribute fails closed. It applies that predicate to the canonical product HLS
route and every provider-reported top-level HLS output. Its
receipt retains only redacted top/child status, manifest class, reference count
and reference kind; it retains no URL, body or token. The hard-disabled Worker
independently checks the same HLS set, but does not treat that local check as
runtime evidence. Neither token validation nor browser playback may be inferred
from the completed run. Do not create another media asset without a new
asset-budget approval.

Livepeer documents that a playback response can include multiple MP4 and HLS
outputs. At the time of this historical canary, thumbnail VTT had not yet been
modeled and therefore stopped fail closed. The later local harness accepts up to
16 provider source records, requires at least one HLS and one canonical 1280x720
MP4 rendition, probes every distinct HLS/MP4 URL, and protects each modeled VTT
plus its trusted thumbnail images from anonymous access. This is local code
hardening only, not a new provider result. The separate
[VTT/TUS gate evidence](livepeer-playback-vtt-gate-2026-08-02.md) records the
later actual output schema and its still-open provider gates. A future browser
receipt must show at least one JWT-header request in both the initial and
refreshed rounds. This has not yet been measured against a real asset, and
browser XHR redirect behavior remains an open Chrome/Edge gate. See Livepeer's
[multiple-source playback response](https://docs.livepeer.org/v1/developers/guides/playback-an-asset)
and [thumbnail VTT response](https://docs.livepeer.org/v1/developers/guides/thumbnails-vod).

The next provider canary, after a new asset-budget approval, must run this
updated all-first-level-reference check against a new asset. The local tests
cover a denied variant, a denied direct segment, an HLS error returned by a
variant, a later public variant, a public provider-reported HLS output, and
untrusted or credentialed references. They are not provider, browser or runtime
evidence. A public or unknown top/child response fails closed; no activation or
deployment may be considered from it.

A later full browser attempt reached the post-provider browser step but was
invalidated by a local wait-condition bug before playback was measured; its
asset and signing-key cleanup were directly verified. It does not replace this
status-only result. See [the invalid browser attempt evidence](livepeer-playback-browser-canary-2026-08-02.md).

References:

- [Livepeer JWT access-control guide](https://docs.livepeer.org/v1/developers/guides/access-control-jwt)
- [Livepeer signing-key API](https://docs.livepeer.org/api-reference/signing-key/create)
