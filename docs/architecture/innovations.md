# Product Differentiators

> Active features that set YouTick apart from a plain video site.

---

## 1. Browser-first encrypted delivery

Video is encrypted in the browser before going to storage. Raw media
never travels through a central server in the clear.

## 2. Threshold share-based playback access

IPFS alone is not enough. The AES key is split into shares with Shamir
Secret Sharing and distributed across multiple KMS operators. Playback
requires enough operators (currently a 3-of-5 threshold) to return their
shares; no single operator can reconstruct the key alone.

## 3. Short-lived upload authorization

Instead of relying on a long-lived full authorization, the upload flow
uses a short-lived, narrowly-scoped upload session.

## 4. Gift links that can create access

A creator generates a link; the recipient can claim into an existing
account or a new managed account. Sharing becomes part of the product
itself.

## 5. Trial onboarding without heavy wallet friction

The onboarding-key model lets a new user start watching first and
upgrade their account later when they want to.

## 6. Cross-chain checkout path

As an experimental payment path, **a connected NEAR wallet** can pay
with Arbitrum/Base assets: a 1Click quote is taken, MetaMask approves
the transfer, the resulting NEAR lands on the connected account, and
`buy_ticket` is called on NEAR. This path is gated by
`NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true` and is not used with
guest/trial accounts.

---

## Why does it matter?

These pieces together produce:

- a high revenue share for creators
- easier reach for viewers
- less centralized dependency in the product
- safer key flow during playback (no single point of failure)
