# YouTick Storage API Worker

The Storage API Worker is a dedicated Worker surface for IPFS persistence
provider secrets, provider status checks, and the flag-gated Lighthouse
upload pilot. Large production uploads and media delivery are not this
Worker's responsibility.

## Responsibilities

- The Lighthouse API key is never exposed to the browser.
- Lighthouse upload is enabled only when `ENABLE_LIGHTHOUSE_UPLOADS=true`.
- Upload bodies are bounded by `MAX_UPLOAD_BYTES`.
- `/uploads/intent` does not accept self-declared `accountId`; a
  short-lived upload auth token issued through the NEP-413
  challenge/verify flow is required first.
- The large-video upload path streams chunk-by-chunk through
  `/uploads/file` instead of a single directory body.
- KMS, ticket, ban, session-grant and key-share decisions are not made
  in this Worker.
- Media delivery and Range/cache duties live in a separate Worker.

## Env and Secrets

- `ALLOWED_ORIGINS`: list of origins the browser is allowed to use.
- `STORAGE_PROVIDER`: currently `lighthouse`.
- `LIGHTHOUSE_API_BASE`: Lighthouse API base URL. Default: `https://api.lighthouse.storage`.
- `LIGHTHOUSE_UPLOAD_BASE`: Lighthouse upload base URL. Default: `https://upload.lighthouse.storage`.
- `LIGHTHOUSE_API_KEY`: provided as a Wrangler secret.
- `ENABLE_LIGHTHOUSE_UPLOADS`: when `true`, opens `/uploads/file` and `/uploads/directory`. Off by default.
- `MAX_UPLOAD_BYTES`: total upload size accepted through the Worker. Default 8 MiB; larger files must use bounded parts or direct provider upload.
- `UPLOAD_INTENT_SECRET`: Wrangler secret used to sign upload intent tokens.
- `UPLOAD_GUARD`: KV binding for upload-intent rate limit and idempotency cache.
- `UPLOAD_RATE_LIMIT_MAX`: per-account/IP intent quota. Default 1000.
- `UPLOAD_RATE_LIMIT_WINDOW_SECONDS`: rate-limit window. Default 3600 seconds.
- `NEAR_NETWORK`: RPC pool selection for full-access key checks. Default `mainnet`.

```bash
cd workers/storage-api
npm install
npx wrangler secret put LIGHTHOUSE_API_KEY
npx wrangler secret put UPLOAD_INTENT_SECRET
npx wrangler kv namespace create UPLOAD_GUARD
```

## Local dev and test

```bash
cd workers/storage-api
npm test -- --run
npm run check
npx wrangler dev
```

## Endpoints

- `GET /__health`: Is the Worker alive?
- `GET /provider-health`: Is provider configuration ready?
- `POST /pins`: Sends an existing IPFS CID to the Lighthouse pin API.
- `GET /pins/:cid/status`: Reads CID status from the Lighthouse file-info API.
- `POST /uploads/auth/challenge`: Returns a NEP-413 challenge for upload auth.
- `POST /uploads/auth/verify`: Verifies the signed challenge and returns an upload auth token.
- `POST /uploads/intent`: Returns the safe path and chunk limits for a large upload.
- `POST /uploads/file`: Uploads a single file or segment chunk to Lighthouse.
- `POST /uploads/directory`: Uploads multipart `file` fields to Lighthouse as a directory.

`/provider-health` does not return secret values. It only reports whether
the provider is ready.

`POST /pins` accepts only a small JSON body:

```json
{
  "cid": "bafy...",
  "fileName": "optional-name"
}
```

Upload intent is a two-token flow:

1. Frontend calls `/uploads/auth/challenge`, signs a NEP-413 message
   with the wallet, then exchanges it at `/uploads/auth/verify` for an
   upload auth token.
2. Frontend attaches the upload auth token as
   `Authorization: Bearer <uploadAuthToken>` on the `/uploads/intent` request.
3. `/uploads/intent` does not return the API key; it returns a timed
   intent token for `/uploads/file`, `/uploads/directory`, or `/pins`.

`POST /uploads/auth/challenge` body:

```json
{
  "accountId": "creator.near"
}
```

`POST /uploads/intent` body. `accountId` is taken from the auth token:

```json
{
  "uploadKind": "file",
  "fileName": "concert.mov",
  "sizeBytes": 21474836480,
  "contentType": "video/quicktime"
}
```

Even when `ENABLE_LIGHTHOUSE_UPLOADS=true`, write endpoints remain
fail-closed if `UPLOAD_INTENT_SECRET` or `UPLOAD_GUARD` are not ready.
The intent token must be sent as `Authorization: Bearer <intentToken>`
to `/uploads/file`, `/uploads/directory`, or `/pins`.

`POST /uploads/file` is the primary path for large videos. The frontend
splits encrypted media segments into smaller byte chunks when needed; the
manifest carries the chunk CIDs in order, so the Worker never has to
metabolize the entire video or delivery bundle body.

`POST /uploads/directory` remains for small bundle smoke tests and
backwards-compatible piloting.
