# Managed Storage + Publish Grant Roadmap

## Summary

These changes are recommended because the current browser-to-public-Crust publish path is not a good long-term security or reliability boundary.

- Public Crust PSA behavior is inconsistent enough that it should not be the source of truth for publish readiness.
- Browser-side `w3auth` is currently acting more like gateway compatibility than real user-bound authorization.
- The app already has the right long-term primitives in place: browser-side encryption, `Publish` session grants, registry-managed relayers/operators, and Cloudflare Workers.
- The app supports uploads up to 500 MB, so Cloudflare Workers should remain the control plane, not the binary upload proxy.

The target architecture is: browser encrypts locally, obtains a short-lived `Publish` grant, uploads encrypted assets to a YouTick-controlled private storage origin, stores KMS shares with the same publish authority, and publishes on-chain through a dedicated relayer only after upload and pin acceptance are confirmed.

## Roadmap

### Phase 1 — Storage Control Plane (Week 1)

- Add a new Cloudflare Worker: `workers/storage-control`.
- Use the existing `Publish` grant model as the only browser authorization source for upload orchestration.
- Create a Durable Object keyed by `uploadSessionId` to hold mutable publish session state.
- Add a Cloudflare Queue for pin-placement and pin-status reconciliation jobs.
- Define browser-facing endpoints:
  - `POST /publish/upload-sessions`
  - `GET /publish/upload-sessions/:id`
  - `POST /publish/upload-sessions/:id/complete`
  - `POST /publish/commit`
- `POST /publish/upload-sessions` must accept a Publish-grant-signed request containing `videoId`, `totalBytesEstimate`, `assetCountEstimate`, and `encrypted`.
- The response must return `uploadSessionId`, `uploadBaseUrl`, `uploadToken`, `expiresAt`, `maxBytes`, and `maxFiles`.
- `videoId` becomes the single resource id across upload orchestration, KMS share storage, access grants, and on-chain publish.

### Phase 2 — Private Crust Storage Origin (Weeks 2–3)

- Add a new self-hosted service: `services/storage-origin`.
- Deploy it on a VM/container origin behind a YouTick-controlled domain such as `upload.youtick.<domain>`.
- `storage-origin` handles large-body uploads and must not run inside Cloudflare Workers.
- `storage-origin` validates `uploadToken`, streams multipart uploads to a private local `ipfs-w3auth-gateway`, and reports `{ uploadSessionId, cid, size, assetType }` back to `storage-control`.
- Run `ipfs-w3auth-gateway` and `ipfs-w3auth-pinning-service` behind the origin on the same private network; do not expose them directly to the browser.
- Keep `w3auth` inside this private storage layer. The browser must no longer construct Crust auth headers.
- `storage-origin` must expose only:
  - `POST /session/:uploadSessionId/add`
- The upload token must be short-lived, scoped to one session, and bound to byte quota and asset count.

### Phase 3 — Browser Publish Path Migration (Week 4)

- Keep browser-side AES encryption and segmented packaging unchanged.
- Replace direct `uploadToCrust` calls in the publish flow with:
  1. `ensureSessionGrant(scope=Publish, resourceId=videoId)`
  2. `createUploadSession`
  3. direct asset upload to `uploadBaseUrl`
  4. `storeEncryptionKey` using the same Publish grant
  5. `completeUploadSession`
  6. poll `GET /publish/upload-sessions/:id`
  7. call `POST /publish/commit`
- Move browser-side storage ordering and PSA polling out of the React publish flow.
- Treat an upload session as `committable` when:
  - all declared assets were uploaded,
  - encrypted uploads have KMS share metadata stored,
  - pin jobs were accepted for every CID,
  - the manifest CID is registered.
- Do not wait for full `pinned` status before publish. Require accepted pin jobs, then let full replication continue asynchronously.
- Keep current `lib/crust/*` browser code only as a temporary legacy path behind a feature flag.

### Phase 4 — Publish Relayer + On-Chain Contract Surface (Weeks 5–6)

- Add a dedicated Cloudflare Worker: `workers/publish-relayer`.
- Do not extend `guest-relayer`; keep publish relaying as a separate trust boundary.
- Add a new contract method on `contracts/nft-ticket/src/lib.rs`:
  - `publish_event(session_pk, origin_hash, device_hash, receiver_id, token_metadata, video_metadata, event_metadata)`
- `publish_event` must replace the current browser-facing happy path of `create_upload_session + nft_mint_prepaid + create_event_prepaid`.
- `publish_event` must verify the Publish grant through the access-control contract using:
  - `session_pk`
  - `scope = Publish`
  - `resource_id = video_metadata.encrypted_cid`
  - `origin_hash`
  - `device_hash`
- The relayer must:
  - verify the upload session is `committable`,
  - verify it is an active relayer in the registry,
  - submit the on-chain publish transaction,
  - update session state to `publishing` then `published` or `failed`.
- Keep the legacy session-key publish flow available behind a server-side feature flag until the managed path is stable on testnet and then mainnet.

### Phase 5 — Cutover and Cleanup (Week 7)

- Roll out in this order:
  1. internal testnet creators
  2. all testnet creators
  3. a small mainnet cohort
  4. full mainnet cutover
- After stable cutover, remove browser publish dependencies on:
  - direct Crust upload auth,
  - browser PSA polling,
  - upload-session access keys for the publish happy path.
- Leave the legacy path disabled but recoverable for one release window, then remove it fully.

## Public API / Interface Changes

- New Worker API: `POST /publish/upload-sessions`
  - input: Publish-grant-signed envelope with `videoId`, `totalBytesEstimate`, `assetCountEstimate`, `encrypted`
  - output: `uploadSessionId`, `uploadBaseUrl`, `uploadToken`, `expiresAt`, `maxBytes`, `maxFiles`
- New Origin API: `POST /session/:uploadSessionId/add`
  - input: bearer `uploadToken` + multipart `file`
  - output: `cid`, `size`
- New Worker API: `POST /publish/upload-sessions/:id/complete`
  - input: final asset manifest from the browser
  - output: session state and pin job acceptance summary
- New Worker API: `POST /publish/commit`
  - input: Publish-grant-signed publish intent referencing `uploadSessionId` and `videoId`
  - output: relayed publish result and on-chain transaction id
- New contract method: `publish_event(...)`
- KMS `store/retrieve` wire format remains unchanged; Publish grants continue to authorize KMS storage.

## Test Plan

- Unit tests for upload session creation, token expiry, byte quota enforcement, duplicate asset registration, idempotent completion, and relayer commit gating.
- Integration tests for:
  - Publish grant accepted for upload orchestration
  - invalid origin/device binding rejected
  - encrypted segmented upload + KMS share storage + complete + commit
  - pin job accepted but not yet fully pinned
  - relayer rejects commit when session is not `committable`
  - relayer rejects inactive registry relayer
  - publish succeeds only when `videoId` matches grant resource id
- End-to-end testnet scenario:
  - 500 MB encrypted upload
  - segmented asset upload through `storage-origin`
  - KMS share storage
  - pin job enqueue
  - relayed `publish_event`
  - event visible on-chain
  - background pin status progresses independently
- Rollout monitoring:
  - `upload_session_create_success`
  - `origin_upload_success`
  - `pin_job_accepted`
  - `publish_commit_success`
  - `replication_ready_latency`
  - `relayer_reject_reason`

## Assumptions and Defaults

- Long-term upload architecture uses a private YouTick-controlled Crust origin on VM/container infrastructure.
- Browser-side encryption remains mandatory.
- Cloudflare Workers remain the control plane only; they do not proxy media bodies.
- `Publish` grant TTL stays at the existing 20-minute policy unless a later policy review changes it.
- `videoId` remains the browser-generated UUID and is the canonical `resource_id` for Publish grants and the canonical `encrypted_cid`/video identifier for publish state.
- Publish is allowed once pin jobs are accepted, not only when final replication is fully `pinned`.
- Mainnet and testnet continue to use separate worker environments, queues, and storage namespaces.
