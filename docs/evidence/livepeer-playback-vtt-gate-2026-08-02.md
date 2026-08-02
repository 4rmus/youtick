# Livepeer VTT output and TUS cleanup gate - 2026-08-02

Status: `BLOCKED / LEGACY_TUS_DISCOVERY_FIX_LOCAL_ONLY /
TUS_TERMINATION_UNPROVEN / JWT_PROBES_NOT_RUN / BROWSER_MATRIX_NOT_RUN /
RUNTIME_DISABLED`

This records two separately approved, bounded Livepeer Sandbox attempts. It is
not JWT success, Chrome/Edge playback, testnet, staging or production evidence.

## Observed result

| Check | Result | Evidence |
|---|---|---|
| Asset and playback policy | `PASS / PROVIDER READ` | The ready asset and playback records reported `playbackPolicy.type = jwt`. |
| Returned source schema | `OBSERVED` | The provider returned HLS, three 1280x720 MP4 outputs and one `text/vtt` thumbnail source. |
| VTT paid-access check | `NOT RUN / OLD HARNESS GATE` | The then-current harness did not model `text/vtt` and stopped with `playback_canary_outputs_missing`. |
| Anonymous, malformed, correct and refreshed JWT checks | `NOT RUN` | The source-schema gate stopped before any access probe. |
| Chrome and Edge | `NOT RUN` | The provider gates must complete before the loopback browser matrix starts. |
| TUS termination | `UNPROVEN` | TUS `DELETE` returned `204`, then five follow-up `HEAD` requests returned `200`, not `404` or `410`. |
| Automatic asset cleanup | `FAIL-CLOSED` | The canary skipped asset deletion because the TUS capability might still exist. |
| Controlled asset/key recovery | `PASS / ASSET AND KEY ONLY` | With pre-approved deletion authority, asset `DELETE` returned `204`, follow-up asset `GET` returned `404`, and authenticated inventories then showed `0` assets and `0` signing keys. |

No raw asset ID, playback ID, signing key, JWT, API key, TUS URL or VTT body was
retained. Asset/key recovery does not prove that the completed TUS upload
capability was terminated.

## Corrected rerun

At `2026-08-02 16:49 +03`, the corrected live canary passed its local media and
Chrome/Edge executable preflight, created one temporary signing key and one
unuploaded asset, then stopped at the TUS endpoint `OPTIONS` check with
`tus_version_unsupported`. The check runs before TUS resource creation, media
bytes, JWT probes or browser playback.

The failure means the successful `OPTIONS` response did not advertise supported
TUS version `1.0.0` in `Tus-Version`. Because the version gate runs before the
extension gate, this run does not establish whether `termination` was
advertised. The TUS 1.0 specification requires a successful `OPTIONS` response
to include `Tus-Version`, so the canary remains fail-closed rather than guessing
capability support.

Cleanup completed: authenticated post-run inventories returned HTTP `200` with
`0` assets and `0` signing keys. No TUS upload resource was created and no media
bytes were sent. The one-asset and temporary-key authorization for this rerun is
consumed.

## Local correction

Livepeer Studio's public lockfile resolves `@tus/server` and `@tus/s3-store`
`1.0.0`.
That server release omits `Tus-Version` from `OPTIONS`; the upstream fix shipped
later in `@tus/server` `1.10.0`. Its S3 store nevertheless advertises
`termination` and the server writes `Tus-Resumable: 1.0.0` on the response. This
matches the observed missing-version failure and gives a narrow compatibility
signature; it is not a general waiver for malformed TUS discovery.

The local Worker and canary now model paid `text/vtt` output. They require every
VTT and every trusted thumbnail image it references to deny anonymous access;
the VTT itself is read only with a short-lived correct JWT. More than 32
thumbnail references, an untrusted reference or another source type stops the
flow fail-closed. This is local code and test evidence, not a new provider run.

Before a later playback canary creates a TUS resource or sends media bytes, it
will make a trusted endpoint `OPTIONS` request that sends neither
`Tus-Resumable` nor an additional authorization header. It requires the
`termination` extension plus standard `Tus-Version: 1.0.0`, or only for the
known Livepeer legacy response, exact status `204` and
`Tus-Resumable: 1.0.0`. This advertises a required feature; it does not prove
that a completed resource will become inaccessible after `DELETE`. The cleanup gate
remains `DELETE` `204` followed by `HEAD` `404` or `410`.

The former TUS-resume, network-endpoint and browser-upload CLI runners are
retired. They could create a TUS resource while proving only asset deletion; use
the canonical playback canary for any later media-upload mutation.

An earlier one-byte, unfinished-resource canary did observe `DELETE` `204` then
`HEAD` `404`. That bounded result does not settle the behavior seen here after a
completed playback upload; the discrepancy remains open. See the
[endpoint revoke evidence](livepeer-endpoint-revoke-canary-2026-08-02.md) and
the [TUS termination specification](https://tus.io/protocols/resumable-upload).

Provider confirmation is still required for three points: the deployed TUS
server/version, the intended `DELETE` behavior for completed resources, and the
expiry or revocation contract for both completed and unfinished upload URLs.
The required provider acceptance evidence remains `DELETE 204` followed by
bounded `HEAD 404/410`; a documented immutable-but-retained completed endpoint
would be a new product/security decision, not an automatic test relaxation.

## Next gate

No new Livepeer asset is authorized by this record. A later real rerun needs a
fresh explicit one-asset and signing-key approval. It must first pass the TUS
feature preflight, then complete all VTT, JWT, refresh, Chrome and Edge gates,
and still prove the completed TUS resource is gone before the asset is deleted.

References:

- [Livepeer playback sources](https://docs.livepeer.org/v1/developers/guides/playback-an-asset)
- [Livepeer VOD thumbnails](https://docs.livepeer.org/v1/developers/guides/thumbnails-vod)
- [Livepeer Studio TUS dependencies](https://github.com/livepeer/studio/blob/72187ec428cdd41c81ff75556d77a609b2990695/packages/api/package.json#L54-L56)
- [Livepeer Studio exact TUS lockfile versions](https://github.com/livepeer/studio/blob/72187ec428cdd41c81ff75556d77a609b2990695/yarn.lock#L7500-L7513)
- [Livepeer Studio TUS server construction](https://github.com/livepeer/studio/blob/72187ec428cdd41c81ff75556d77a609b2990695/packages/api/src/controllers/asset.ts#L1029-L1049)
- [Upstream Tus-Version fix](https://github.com/tus/tus-node-server/commit/f465a0f2a973a65743717e04f0b430e633f936f6)
