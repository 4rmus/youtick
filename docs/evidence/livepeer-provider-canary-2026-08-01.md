# Livepeer provider canary evidence - 2026-08-01

Status: `PARTIAL / 8_MIB_BROWSER_RESUME_PASS / PROVIDER_FIX_OPEN / SANDBOX CLEAN`

This evidence belongs to PR-3. It is a bounded Sandbox and Chrome provider
receipt, not testnet, staging or production proof.

## Approved boundary

- dedicated Livepeer Sandbox project: `youtick-paid-media-canary`;
- backend-only API key with CORS disabled;
- no paid plan or payment-method change;
- an initial maximum of three synthetic assets, followed by explicit approval
  for two additional Chrome assets with exact 20 MiB sources; the second used
  the proposed 8 MiB product default;
- every asset deleted after evidence collection;
- provider feature and public Worker route remain disabled.

No API key, raw asset ID, playback ID or bearer TUS URL is recorded here.

## Results

| Check | Result | Evidence |
|---|---|---|
| API authentication | `PASS` | Read-only asset list returned HTTP 200 |
| JWT upload-intent creation | `PASS` | Create HTTP 200; response policy `jwt`; TUS endpoint returned |
| Empty-intent cleanup | `PASS` | Delete HTTP 204; immediate asset GET HTTP 404 |
| Provider identity redaction | `PASS` | Only SHA-256 identities appear in the receipt |
| Legacy 30% resume | `UNPROVEN / FAIL-CLOSED` | Native PATCH reported offset `8776`; eight HEAD reads reported `0`. Chrome accepted a sub-5 MiB incomplete part, then the next PATCH returned HTTP 409; three retry HEAD reads reported `0` |
| 8 MiB product-default resume | `PASS / WORKAROUND` | Chrome restarted at natural 8 MiB and 16 MiB boundaries; HEAD returned both offsets and only the missing bytes were uploaded |
| Orphan cleanup | `PASS` | Latest asset delete HTTP 204, immediate GET HTTP 404; final authenticated project asset inventory count `0` |
| Chrome CORS | `PASS / TRANSPORT ONLY` | Chrome completed cross-origin TUS creation and reached PATCH/HEAD provider responses; no browser CORS rejection occurred |
| Chrome restart | `PASS / 8_MIB_WORKAROUND` | Two page reloads resumed at 8 MiB (40%) and 16 MiB (80%), then completed the exact 20 MiB source |
| Account availability | `PASS` | Read-only account check returned HTTP 200 with `disabled=false` and `suspended=false`; the upload completed |
| Exact 20 GB / +1 byte | `OPEN` | Not attempted |
| Endpoint lifetime and billing | `OPEN` | Not measured |

The first successful no-media receipt used correlation ID
`1b8af518-e55a-48bf-92fe-7e812a41e9a0` and recorded:

- asset ID SHA-256
  `73c63881c0df35cdcce27077ee92d97493fc38f07d457ff773d7a48d823a2bfe`;
- playback ID SHA-256
  `46f3aa0353a224b90cef53eed0d52e02b112e4a5f47a8a81512a64a76a1e43e2`;
- project ID SHA-256
  `9bde55a3bad85b452ce029d96ee69ce18fda2bcaa27d19e433591dcff24e97e7`;
- TUS origin `https://origin.livepeer.com`;
- zero uploaded media bytes.

Two 29,256-byte synthetic MP4 attempts each stopped after the 30% checkpoint
and cleanup. The observed mismatch may be related to provider persistence,
minimum chunk behavior or the probe client. It is not converted into a provider
claim.

The first separately approved Chrome asset used
`tus-js-client@4.3.1`. The browser created an exact 20,971,520-byte synthetic
source (SHA-256
`857d1806038000b99adab2adea99fd074fa1f712634b2b80279cc169082b367e`) and
used 1 MiB chunks. The client configuration passed the returned
`tusEndpoint` as `endpoint`, matching Livepeer's
[official SDK example](https://github.com/livepeer/livepeer-js/blob/e604326098983cf25b9a6da023f2ed142c4be60b/src/sdk/asset.ts)
and tus-js-client's
[upload creation contract](https://github.com/tus/tus-js-client/blob/v4.3.1/docs/api.md).

The TUS creation request succeeded. The first 1 MiB chunk followed the
provider's incomplete-part path; the next PATCH returned HTTP 409
`Upload-Offset conflict`. Three automatic retry HEAD requests all returned
offset `0`, so no checkpoint was reached. The redacted receipt recorded:

- run ID `a5c519a0-7f63-43a8-8b0e-dc689d8571e8`;
- asset ID SHA-256
  `2fea1e1c76c54fed92e150c2424c726cf0c8c2930a2c8bee885dd65083d88aaa`;
- create HTTP 200, delete HTTP 204 and post-delete GET HTTP 404;
- final authenticated project inventory count `0`.

After explicit approval for one more asset, the same exact 20 MiB browser
source was retested with a fixed 8 MiB chunk default. The first page load
paused at 8,388,608 bytes (40%). After reload, HEAD returned 8,388,608 and the
second upload paused at 16,777,216 bytes (80%). After another reload, HEAD
returned 16,777,216 and the remaining 4,194,304 bytes completed successfully.
The redacted receipt recorded:

- run ID `5cd26033-2df3-4b67-bf63-b0f9d2206595`;
- chunk size `8,388,608`, checkpoint offsets `8,388,608` and `16,777,216`,
  and final offset `20,971,520`;
- asset ID SHA-256
  `89dff9ab22eb82ae70891d98b0cc0932fefc8488f4909cf648f22a1e5de86ca3`;
- create HTTP 200, delete HTTP 204 and post-delete GET HTTP 404;
- final authenticated project inventory count `0`.

The source is transport-only synthetic data and is not valid media or playback
proof. No raw asset ID, bearer TUS URL or API key is retained in this evidence.

## Root cause analysis

The public-source audit covered the current Livepeer documentation index,
upload guide and OpenAPI; Studio, SDK/UI and Catalyst repositories; their TUS
issue/PR history; and upstream tus releases and fixes. It found no duplicate
Livepeer report or alternate deployed TUS implementation for this route. The
current v2 narrative example calls the response field `tusUploadUrl`, while the
[OpenAPI](https://github.com/livepeer/docs/blob/de6026f63e2ec1bf11bb91f82facf1a86dbf2e39/api/studio.yaml)
and [SDK](https://github.com/livepeer/livepeer-js/blob/e604326098983cf25b9a6da023f2ed142c4be60b/src/sdk/asset.ts)
use the canary-proven `tusEndpoint`. That documentation mismatch does not cause
the offset failure, but it prevents the narrative page from defining a reliable
client chunk contract by itself.

Confidence: `CONFIRMED` for the deployed version and observed failure
signature; provider remediation remains open.

On 2026-08-01, Livepeer's public
[`/api/version`](https://livepeer.studio/api/version) endpoint reported commit
`72187ec428cdd41c81ff75556d77a609b2990695`. That exact Studio revision builds
with `yarn install --frozen-lockfile` and resolves
[`@tus/s3-store` to `1.0.0`](https://github.com/livepeer/studio/blob/72187ec428cdd41c81ff75556d77a609b2990695/yarn.lock#L7500-L7511).
Its production TUS path uses the S3 store with an
[8 MiB preferred part size](https://github.com/livepeer/studio/blob/72187ec428cdd41c81ff75556d77a609b2990695/packages/api/src/controllers/asset.ts#L1035-L1049),
while the repository resume test uses `TusFileStore`, so it does not exercise
the production incomplete-S3-part path.

In S3 store `1.0.0`, a PATCH below S3's 5 MiB multipart minimum is retained as
an incomplete `.part` object, but the subsequent HEAD offset lookup reads the
wrong key and reports zero. The upstream project fixed exactly this behavior in
[PR #493](https://github.com/tus/tus-node-server/pull/493), released as
`@tus/s3-store@1.0.1`. The same patch release also added a regression test for
sub-5 MiB client chunks in
[PR #494](https://github.com/tus/tus-node-server/pull/494), and `1.0.1` keeps
the same Node and `@tus/server ^1.0.0` compatibility declaration as `1.0.0`.
This explains both observed signatures:

- the 8,776-byte native PATCH reported 8,776, then HEAD returned zero;
- Chrome's 1 MiB chunk was retained as incomplete, HEAD returned zero, and the
  next PATCH carrying the client's 1 MiB offset conflicted with the server's
  zero offset.

The redacted provider report is
[Livepeer Studio issue #2352](https://github.com/livepeer/studio/issues/2352).
The current
[Livepeer upload documentation](https://docs.livepeer.org/v2/solutions/livepeer-studio/video-on-demand/upload-asset)
recommends TUS but does not declare a minimum PATCH size. A historical
[official client change](https://github.com/livepeer/ui-kit/pull/43) used 5 MiB
chunks for stream inputs because of S3, but left browser `File` uploads
unbounded. YouTick now selects 8 MiB as its product default: the bounded Chrome
canary proves it as a workaround for the observed deployed path, but it does
not repair the provider bug or establish a provider-supported chunk contract.

## Next gate

Do not enable the Worker route or create another asset. Keep the 8 MiB product
default behind the disabled feature flag and wait for Livepeer to confirm a
provider remediation or supported mitigation. The fixed-size product default
naturally proves two non-final restart points at 8 MiB (40%) and 16 MiB (80%)
for this 20 MiB source; the earlier exact 30%/70% fixture is no longer the
product-default acceptance fixture. Any rerun requires a new explicit
asset-budget approval. Edge, sleep/network loss, endpoint lifetime and exact
20 GB remain open.
