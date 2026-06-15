# YouTick Media Delivery Worker

The Media Delivery Worker handles routing for encrypted IPFS manifest
and segment reads, Range forwarding, gateway fallback and edge cache
control.

## Responsibilities

- Large upload bodies do not flow through this Worker.
- Decrypted video, AES keys and KMS shares are never passed to this Worker.
- It only routes encrypted IPFS assets.
- Range requests are forwarded upstream and are not written to the edge
  cache in the first phase.

## Env

- `ALLOWED_ORIGINS`: list of origins the browser is allowed to use.
- `IPFS_GATEWAY_BASES`: comma-separated list of gateway base URLs. The Lighthouse gateway is kept first.
- `CACHE_TTL_SECONDS`: edge cache lifetime for non-Range GET responses.
- `CACHE_VERSION`: optional cache bust key.
- `UPSTREAM_TIMEOUT_MS`: per-gateway request timeout.

## Local dev and test

```bash
cd workers/media-delivery
npm test -- --run
npm run check
npx wrangler dev
```

## Endpoints

- `GET /__health`: Is the Worker alive?
- `GET /ipfs/:cid/:path*`: Reads the encrypted IPFS asset with gateway fallback.
- `HEAD /ipfs/:cid/:path*`: Reads upstream metadata.

Example:

```text
/ipfs/bafy.../manifest.json
/ipfs/bafy.../segments/segment-0001.bin
```
