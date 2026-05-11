# Storage and Delivery

> How encrypted media moves from the browser to IPFS and back into the player

---

## Current Live Model

Today, YouTick runs through this storage and playback path:

1. the browser generates an AES-256-CTR key
2. the video is encrypted in chunks or segments
3. encrypted output is uploaded to the active IPFS storage provider
4. the AES key is split into shares
5. shares are stored across active decryption operators
6. playback reconstructs the AES key in the browser after enough shares arrive

This gives three benefits:

- IPFS only sees encrypted media
- no single operator needs the full playback key
- AES-CTR still supports fast seek and segmented playback

---

## Upload Flow

### 1. Encryption

`apps/web/lib/kms/encryption.ts`:

- uses AES-256-CTR
- defaults to `1 MB` chunks
- supports random-access decryption for seek

For MP4-based uploads, the app can package segmented delivery manifests so playback can start earlier.

### 2. IPFS Upload

The upload can include:

- encrypted video payloads
- a segmented delivery manifest
- init segments and media segments
- thumbnail and poster assets

These delivery assets are uploaded to IPFS through the active storage provider.
Today the primary write path is Lighthouse behind `workers/storage-api`; Crust
is kept for legacy compatibility and explicit fallback diagnostics. The event
points at `rootCid/manifest.json` or a Lighthouse manifest CID, while the
manifest refers to relative asset paths such as `init.mp4` and
`segments/000000.m4s`. Playback reads through multiple gateway options.

### 3. Key Share Storage

The browser no longer treats the AES key as one value that belongs to one KMS worker.

Instead:

- it reads the active operator set from the registry
- it splits the AES key into shares
- it stores one share per operator

Each operator only stores its own encrypted share.

---

## Playback Flow

```mermaid
sequenceDiagram
    participant APP as Browser App
    participant REG as Registry
    participant A as Access
    participant OA as Operator A
    participant OB as Operator B
    participant OC as Operator C
    participant IPFS as IPFS Storage

    APP->>REG: List active operators
    APP->>A: Ensure Play grant
    APP->>OA: retrieve share
    APP->>OB: retrieve share
    APP->>OC: retrieve share
    OA-->>APP: share 1
    OB-->>APP: share 2
    OC-->>APP: share 3
    APP->>APP: Reconstruct AES key
    APP->>IPFS: Read encrypted media
    APP->>APP: Decrypt and play
```

The player:

1. resolves the manifest and metadata
2. checks ownership or creator entitlement
3. requests shares from active operators in parallel
4. reconstructs the key after enough shares arrive
5. reads encrypted media from IPFS and decrypts in the browser

The latest implementation also stops waiting once the threshold is reached.

---

## Gateway Strategy

Media delivery still does not depend on a single IPFS gateway:

- new writes use Lighthouse through the Storage API Worker
- Crust remains a legacy/read compatibility and opt-in fallback path
- public IPFS gateways remain available as fallback
- range requests are used when supported
- full-download fallback still exists for degraded cases

This keeps playback resilient even if one media endpoint is slow or unreliable.
Provider management and media delivery are separate concerns: the Storage API
Worker owns provider secrets and persistence status, while the Media Delivery
Worker handles encrypted manifest/segment routing, Range forwarding, edge cache
headers and gateway fallback. Neither Worker sees decrypted video or KMS key
shares.

`workers/storage-api` is the provider-management boundary. It exposes Worker
health, provider readiness, CID pinning, CID status endpoints and guarded
Lighthouse uploads. Large videos do not use one large directory body as the
primary path. The frontend uploads encrypted init/media payloads as independent
Lighthouse files, splitting oversized payloads into ordered chunk CIDs in the
delivery manifest. This keeps Lighthouse as the primary provider while keeping
each Worker request under `MAX_UPLOAD_BYTES`. The Worker also exposes a signed
upload-intent endpoint so clients can learn the current safe path, part limits
and whether scoped direct upload is available without exposing the Lighthouse
API key.

`workers/media-delivery` is the first hot-delivery boundary. It exposes
`/ipfs/:cid/:path*`, forwards Range requests, caches non-Range encrypted GET
responses at the edge, and falls back across public IPFS gateways.

---

## What the Chain Stores

The contract does not store raw video or the AES key.

It stores:

- `encrypted_cid`
- event title and description
- price and optional USD price
- video metadata
- entitlement ownership

Key material is handled off-chain by the operator layer, but entitlement remains on-chain.

---

## Why This Design

| Need | Current answer |
|------|----------------|
| Protect the raw video | Browser-side encryption |
| Avoid one full-key holder | Share-based operator storage |
| Keep playback fast | AES-CTR + segmented delivery |
| Avoid a single operator bottleneck | `3-of-5` reconstruction |
| Keep storage decentralized | Lighthouse primary storage + IPFS gateway fallback for legacy reads |

---

## Related Files

- `apps/web/lib/kms/encryption.ts`
- `apps/web/lib/kms/shares.ts`
- `apps/web/lib/kms/client.ts`
- `apps/web/lib/video-delivery.ts`
- `apps/web/lib/crust/*`
- `apps/web/lib/storage/provider.ts`
- `workers/storage-api/src/index.ts`
- `workers/media-delivery/src/index.ts`
- `workers/youtick-kms/src/index.ts`
