# Livepeer endpoint lifetime and revoke canary - 2026-08-02

Status: `15M_IDLE_PASS / ASSET_DELETE_DOES_NOT_REVOKE / TUS_DELETE_REVOKES / ASSET_INVENTORY_CLEAN`

This is bounded Livepeer Sandbox evidence. It is not full 20 GB, Edge, sleep,
testnet, staging or production proof.

## Approved boundary

The product assumes Livepeer provides no project hard spend cap and accepts the
residual provider-cost risk. No provider support request is required for this
decision. The canary used two temporary one-byte TUS resources:

- one resource waited idle for 15 minutes and accepted no media before asset
  deletion;
- one resource tested explicit TUS termination and accepted no media;
- no plan, payment method, API key or runtime setting changed;
- no raw asset ID, playback ID, API key or bearer TUS URL is retained.

The first negative revoke probe accepted one byte only after its asset had
already been deleted. Its bearer URL was intentionally not retained, so that
one-byte TUS resource could not be explicitly terminated after the process
ended. It is excluded from clean revoke proof and recorded as bounded residual
orphan exposure. The authenticated Livepeer asset inventory is nevertheless
empty.

## Results

| Check | Result | Evidence |
|---|---|---|
| Initial TUS state | `PASS` | HEAD HTTP 200; length `1`; offset `0`; no `Upload-Expires` or `Tus-Max-Size` |
| Idle lifetime | `PASS / BOUNDED 15 MINUTES` | After 900,000 ms without touching the endpoint, HEAD remained HTTP 200 with length `1`, offset `0` |
| Asset deletion | `PASS / ASSET ONLY` | Asset DELETE HTTP 204; asset GET HTTP 404 |
| Asset delete revokes TUS | `FAIL` | TUS HEAD remained HTTP 200; PATCH after asset deletion returned HTTP 204 and advanced offset to `1`; HEAD still returned HTTP 200 after 60 seconds |
| Explicit TUS termination | `PASS` | TUS DELETE returned HTTP 204; following HEAD returned HTTP 404 |
| Upload after TUS termination | `PASS / REJECTED` | PATCH returned HTTP 409, not success; no byte was accepted by this termination canary |
| Final asset inventory | `PASS` | Authenticated asset list returned HTTP 200 with count `0` |

The 15-minute wait receipt recorded:

- asset ID SHA-256
  `73e90f98cf21dc25eebcab724077ae134b0f3389a020ec5dc5f6512cb6046737`;
- upload URL SHA-256
  `b11d089b69822204532fa0449336e30dfc37b121ecb2ee566c8374196295d07d`;
- elapsed time `969,180 ms` including delete and propagation probes.

The explicit termination receipt recorded:

- asset ID SHA-256
  `23830736ad9a78ebfc83c6f385aa2fd279767a9902b7a8e278d88ee8b9f3e613`;
- upload URL SHA-256
  `ff222c1023b770f9f3eb65c48516e7d39e27770182f413b6ea5dcc4000b5db9f`.

## Locked consequence

YouTick must not treat Livepeer asset deletion as upload-capability revocation.
Cancel, expiry and orphan cleanup must use this order:

1. send TUS `DELETE` to the exact persisted upload resource URL;
2. require HTTP 204 and then HEAD HTTP 404/410;
3. delete the Livepeer asset;
4. require asset GET HTTP 404/410;
5. retain only hashes and status evidence.

No automatic endpoint expiry is assumed because the live resource returned no
`Upload-Expires`. No provider refresh API or project hard spend cap is assumed.
If the endpoint disappears before completion, the same generation must not
create a replacement asset; the creator must restart with a new generation.

Remaining gates are ambiguous-create reconciliation, local creator/quota/budget
guardrails, Edge and sleep behavior, and full 20 GB transfer/transcode.
