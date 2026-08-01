# Livepeer provider canary evidence - 2026-08-01

Status: `PARTIAL / CHROME_TUS_P0_BLOCKED / SANDBOX CLEAN`

This evidence belongs to PR-3. It is a bounded Sandbox and Chrome provider
receipt, not testnet, staging or production proof.

## Approved boundary

- dedicated Livepeer Sandbox project: `youtick-paid-media-canary`;
- backend-only API key with CORS disabled;
- no paid plan or payment-method change;
- an initial maximum of three synthetic assets, followed by explicit approval
  for one additional Chrome asset with an exact 20 MiB source;
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
| 30% resume | `UNPROVEN / FAIL-CLOSED` | Native PATCH reported offset `8776`; eight HEAD reads reported `0`. Chrome's initial PATCH returned HTTP 409; three retry HEAD reads reported `0` |
| 70% resume | `NOT_RUN` | 30% checkpoint failed first |
| Orphan cleanup | `PASS` | Fourth asset delete HTTP 204, immediate GET HTTP 404; final project asset inventory count `0` |
| Chrome CORS | `PASS / TRANSPORT ONLY` | Chrome completed cross-origin TUS creation and reached PATCH/HEAD provider responses; no browser CORS rejection occurred |
| Chrome restart | `BLOCKED` | Provider rejected the initial chunk before the 30% restart checkpoint |
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

The separately approved fourth and final asset used Chrome and
`tus-js-client@4.3.1`. The browser created an exact 20,971,520-byte synthetic
source (SHA-256
`857d1806038000b99adab2adea99fd074fa1f712634b2b80279cc169082b367e`) and
used 1 MiB chunks. The client configuration passed the returned
`tusEndpoint` as `endpoint`, matching Livepeer's
[official SDK example](https://github.com/livepeer/livepeer-js/blob/e604326098983cf25b9a6da023f2ed142c4be60b/src/sdk/asset.ts)
and tus-js-client's
[upload creation contract](https://github.com/tus/tus-js-client/blob/v4.3.1/docs/api.md).

The TUS creation request succeeded, but the first PATCH returned HTTP 409
`Upload-Offset conflict`. Three automatic retry HEAD requests all returned
offset `0`, so no checkpoint was reached and no accepted media byte is claimed.
The redacted receipt recorded:

- run ID `a5c519a0-7f63-43a8-8b0e-dc689d8571e8`;
- asset ID SHA-256
  `2fea1e1c76c54fed92e150c2424c726cf0c8c2930a2c8bee885dd65083d88aaa`;
- create HTTP 200, delete HTTP 204 and post-delete GET HTTP 404;
- final authenticated project inventory count `0`.

The source is transport-only synthetic data and is not valid media or playback
proof. No raw asset ID, bearer TUS URL or API key is retained in this evidence.

## Next gate

Do not enable the Worker route or create another asset. First resolve or obtain
provider guidance for the reproducible POST/PATCH/HEAD offset inconsistency.
Any rerun requires a new explicit asset-budget approval. Chrome 30%/70% restart,
Edge, sleep/network loss, endpoint lifetime and exact 20 GB remain open.
