# Livepeer provider canary evidence - 2026-08-01

Status: `PARTIAL / RESUME_P0_OPEN / SANDBOX CLEAN`

This evidence belongs to PR-3. It is a bounded provider receipt, not browser,
testnet, staging or production proof.

## Approved boundary

- dedicated Livepeer Sandbox project: `youtick-paid-media-canary`;
- backend-only API key with CORS disabled;
- no paid plan or payment-method change;
- maximum three synthetic assets and one active upload;
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
| 30% resume | `UNPROVEN / FAIL-CLOSED` | PATCH reported offset `8776`; eight HEAD reads reported `0` |
| 70% resume | `NOT_RUN` | 30% checkpoint failed first |
| Orphan cleanup | `PASS` | Final project asset inventory count `0` |
| Browser CORS/restart | `OPEN` | Developer-machine TUS probe is not browser evidence |
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

## Next gate

Do not enable the Worker route. The next approved provider mutation requires a
browser `tus-js-client` canary with a realistic chunk size, one asset covering
both 30% and 70% restart checkpoints, and explicit expansion of the three-asset
budget. Chrome and Edge must be recorded separately.
