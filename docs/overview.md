# YouTick Overview

> Creator-first video platform with encrypted delivery and on-chain access.

---

## What is YouTick?

YouTick is a platform where creators upload their videos in encrypted
form and sell access through NFT tickets.

The core idea is simple:

1. The creator uploads the video.
2. The app encrypts it in the browser.
3. The encrypted media goes to Lighthouse/IPFS through the Storage API.
4. The AES key is split with Shamir Secret Sharing and distributed across
   multiple KMS operators.
5. A viewer either buys a ticket or earns access through gift / trial.
6. A Play grant is created on the access-control contract.
7. The player collects enough shares from operators, reconstructs the
   key, and starts the video.

---

## What's different?

| Area | YouTick approach |
|---|---|
| Revenue share | 98% of the paid ticket price goes to the creator; storage, mint and event-record costs are accounted separately |
| Media protection | Video is encrypted in the browser |
| Access | Determined by NFT ticket ownership |
| Storage | Encrypted media over Lighthouse/IPFS |
| Key protection | Shamir threshold shares + multi-operator KMS |
| Access authorization | Access-control contract + operator registry |
| Onboarding | Gift links and trial accounts |

---

## Main Flows

### Upload

- the video is selected
- a thumbnail/poster is generated
- the media is encrypted with AES-CTR
- the ciphertext goes to IPFS
- the key is split and distributed across KMS operators
- an NFT + event entry is created on the contract

### Purchase and watch

- the user lands on the event page
- if no ticket is owned, the purchase card appears
- after payment, ownership is recorded on-chain
- a Play grant is created on access-control
- shares are requested from operators in parallel
- the browser reconstructs + decrypts + plays

### Gift and trial

- the creator generates a shareable gift link
- the recipient claims into an existing account or a fresh one
- the main path for trial account creation is the onboarding key
  (function-call access key); the relayer path is deprecated

---

## Active Components

- `apps/web` — frontend
- `workers/youtick-kms` — multi-operator share storage
- `workers/storage-api` — Lighthouse provider secret, upload guard and
  CID status surface
- `workers/media-delivery` — encrypted IPFS manifest/segment routing
  and gateway fallback
- `contracts/nft-ticket` — ticket, gift, trial and payment logic
- `contracts/access-control` — playback grant management
- `contracts/operator-registry` — operator and threshold configuration

Older Nova fields remain in the contract for Borsh compatibility only
(not part of the new flow). The `*_prepaid` naming, on the other hand,
is the active upload session path; it is not deprecated.

---

## Mainnet Status

- Single mainnet contract `youtick.near` (R2 module split, code hash
  `BXbiiT86A8mjVNwvZhNLhUDqvmTVUe7anHotTpQPXg2F`).
- Access contract `access.youtick.near`, registry contract
  `registry.youtick.near`.
- Locked plan: [`launch-plan-2026-05.md`](launch-plan-2026-05.md).
