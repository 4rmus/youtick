# YouTick System Architecture

> Current live runtime: browser encryption, NEAR entitlements, access grants, registry-enforced operators, and share-based playback

---

## Summary

Today, YouTick runs through five active layers:

| Layer | Responsibility |
|-------|----------------|
| Web app | Encrypts media, uploads manifests and segments, and manages purchase/watch UX |
| Market contract | Stores events, tickets, purchase logs, and creator ownership |
| Access contract | Stores short-lived session grants used by off-chain authorization |
| Registry contract | Stores active decryption operators and relayers |
| KMS operators | Store encrypted key shares and release them only after authorization checks |

Crust/IPFS stores encrypted media assets and manifests. The browser is still the place where the final playback key is reconstructed and media is decrypted.

This page describes the current live model. For the original target ADR, see:

- [Youtick Zero Trust Architecture v1](./youtick-zero-trust-architecture-v1.md)

For the implemented state and rollout report, see:

- [Final Implementation Report](./final-implementation-report.md)

---

## High-Level Flow

```mermaid
flowchart LR
    Browser["Browser App"] --> IPFS["Crust / IPFS"]
    Browser --> Market["Market Contract"]
    Browser --> Access["Access Contract"]
    Browser --> Registry["Registry Contract"]

    Browser --> OpA["KMS Operator A"]
    Browser --> OpB["KMS Operator B"]
    Browser --> OpC["KMS Operator C"]
    Browser --> OpD["KMS Operator D"]
    Browser --> OpE["KMS Operator E"]

    OpA --> Registry
    OpB --> Registry
    OpC --> Registry
    OpD --> Registry
    OpE --> Registry

    OpA --> Market
    OpB --> Market
    OpC --> Market
    OpD --> Market
    OpE --> Market
```

### Upload

1. The browser generates an AES key and encrypts media locally.
2. Encrypted segments and manifests are uploaded to IPFS.
3. The AES key is split into shares.
4. Shares are stored across active operators.
5. The market contract records the event and NFT metadata.

### Watch

1. The app reads active operators from the registry.
2. It ensures a short-lived `Play` grant in the access contract.
3. It requests shares from the active operators in parallel.
4. Operators check registry status, access grants, and on-chain entitlement.
5. The browser reconstructs the AES key after enough shares arrive and starts playback.

### Gift and Trial

1. Gift and trial flows continue to use the market contract as the entitlement source of truth.
2. Trial relayer usage is now constrained by the registry.

---

## Active Code Surfaces

### Web

- `apps/web/components/UploadForm.tsx`
- `apps/web/components/IpfsPlayer.tsx`
- `apps/web/lib/access-grants.ts`
- `apps/web/lib/registry.ts`
- `apps/web/lib/kms/*`
- `apps/web/lib/crust/*`
- `apps/web/lib/upload-session-manager.ts`

### Workers

- `workers/youtick-kms/src/index.ts`

### Contracts

- `contracts/nft-ticket/src/lib.rs`
- `contracts/access-control/src/lib.rs`
- `contracts/operator-registry/src/lib.rs`

---

## Important Design Choices

### 1. Media is still encrypted in the browser

Raw video is never uploaded in plaintext. The browser encrypts first, then uploads.

### 2. Upload keeps the low-friction session-key path

Upload uses the narrow upload session key path because it preserves the single-approval UX. We intentionally did not replace upload with session grants.

### 3. Playback moved to share-based decryption

The playback key is no longer treated as a single KMS secret. It is split into shares and reconstructed in the browser.

### 4. Registry is now an enforcement layer

The registry no longer acts as a passive address book. Operators and relayers must be active in the registry to participate.

### 5. Access grants standardize off-chain authorization

The access contract standardizes short-lived `Play`, `Publish`, `ClaimGift`, and `ClaimTrial` authorization checks without replacing the upload session model.

---

## Related Pages

- [Storage & Delivery](./storage.md)
- [Session Keys & Upload Sessions](./session-keys.md)
- [Smart Contract](./smart-contract.md)
- [Youtick Zero Trust Architecture v1](./youtick-zero-trust-architecture-v1.md)
- [Final Implementation Report](./final-implementation-report.md)
- [Security](../security.md)
