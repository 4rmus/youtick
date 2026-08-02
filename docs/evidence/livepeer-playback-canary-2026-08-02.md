# Livepeer JWT playback canary - 2026-08-02

Status: `INCONCLUSIVE / ASSET_AND_SIGNING_KEY_CLEAN / TUS_VISIBILITY_UNPROVEN /
CANONICAL_HLS_NOT_PROBED / BROWSER_MATRIX_NOT_RUN / RUNTIME_DISABLED`

This is one bounded Livepeer Sandbox attempt. It is neither a Chrome/Edge
success, testnet evidence, staging evidence nor production evidence.

## Approved scope

- one synthetic H.264/AAC MP4, five seconds and 17,767 bytes;
- one temporary signing key, held only in process memory and deleted at the end;
- no deployment, runtime-flag activation, NEAR mutation, payment or public
  playback activation;
- no raw asset ID, playback ID, signing key, JWT, API key or TUS URL retained.

## Result

| Check | Result | Evidence |
|---|---|---|
| Signing-key response format | `PASS / LOCAL PREFLIGHT` | Livepeer returned base64-encoded PEM material; the canary decodes it only to sign and verify in process memory. |
| JWT asset creation and readiness | `PASS / BOUNDED` | The run reached the returned HLS output and access-probe stage. |
| JWT-free selected-output HLS denial | `FAIL / INCONCLUSIVE` | The first headerless HLS request returned HTTP `200`; the canary required `401` or `403`. |
| JWT-free canonical product HLS denial | `NOT RUN` | The completed run selected an HLS URL from provider `meta.source`; later audit found that the product uses a different canonical route. The raw URL was intentionally not retained. |
| Malformed/wrong-key/wrong-subject/expired probes | `NOT RUN` | The fail-closed first negative probe stopped the remaining access checks. |
| Correct-token and refreshed-token HLS | `NOT RUN` | The negative gate failed first. |
| Chrome and Edge HLS.js matrix | `NOT RUN` | The local browser server starts only after the provider negative and positive HLS gates pass. |
| Asset cleanup | `PASS` | Authenticated asset inventory returned HTTP `200` with count `0`. |
| Signing-key cleanup | `PASS` | Authenticated signing-key inventory returned HTTP `200` with count `0`. |
| TUS cleanup visibility | `UNPROVEN` | TUS `DELETE` returned HTTP `204`, but the immediate follow-up `HEAD` returned HTTP `200`, not `404` or `410`. |

Livepeer's current JWT access-control guide shows `Livepeer-Jwt` on the
canonical `playback.livepeer.studio/asset/hls/{playbackId}/index.m3u8` HLS
route. The original canary selected a provider `meta.source` HLS URL instead;
that could be an alternative CDN output. Therefore the observed JWT-free `200`
is a failed canary gate but not proof that the product HLS route exposes media.
The revised canary validates `meta.source` as output evidence, then checks both
that HLS output and the canonical product route for anonymous access. It uses
the canonical product route for HLS JWT claim probes and browser playback.

## Consequence

`LIVEPEER_BRIDGE_ENABLED` remains `false`. The request did not reach browser
playback, so no Chrome/Edge evidence exists. The canary now retries TUS
post-delete visibility before accepting cleanup and leaves the asset intact if
TUS termination cannot be proven; neither change can prove this already-finished
resource. Do not create another media asset without a new asset-budget approval.
If a canonical HLS rerun repeats the JWT-free result, open a provider escalation
with this evidence.

References:

- [Livepeer JWT access-control guide](https://docs.livepeer.org/v1/developers/guides/access-control-jwt)
- [Livepeer signing-key API](https://docs.livepeer.org/api-reference/signing-key/create)
