# YouTick — One-Pager (Pre-Seed)

> Public-alpha, live on NEAR mainnet. Current release posture is tracked in the
> public docs and private smoke evidence.
> This is an honest pre-seed brief: working system + thesis, early on traction.

## What it is

**Sell tickets to your film, recorded performance, or exclusive video as a
private online screening — the creator keeps 98% of every sale, and only
ticket-holders can watch.** The Web3 plumbing (NFT access, browser encryption, IPFS, threshold key
custody) is the *how*, not the pitch.

## The problem

Independent film/music/event creators have no simple way to run a paid,
access-controlled online screening without surrendering 30–50% to a platform or
exposing their master file. Existing "creator monetization" either takes a large
cut, gives creators no ownership of their audience relationship, or leaks the
raw video.

## How it works

Creators upload video that is **encrypted in the browser** before it ever
leaves the device. The AES key is split with **Shamir's Secret Sharing across a
3-of-5 KMS threshold**; ciphertext lives on **IPFS**. Access is an **NFT ticket
on NEAR** — at playback the app proves on-chain entitlement, the operators
return enough key shares to reconstruct the key locally, and the video plays.
No central server ever holds both the key and the content.

## Why now

NEAR makes sub-cent on-chain settlement and account abstraction (guest/trial
accounts, signless playback) viable for non-crypto users — a creator's audience
can buy and watch without knowing they're using a blockchain.

## Economics (verified on-chain)

- **98% creator / 2% platform** take rate (`COMMISSION_RATE_PERCENT=2`).
- **~0.002 NEAR** marginal cost per trial account; no per-stream server cost.
- Rails: NEAR (proven), USDC, USDT (experimental). Full numbers:
  [`economics.md`](./economics.md).

## Status & traction (honest)

- **Public alpha**: the source supports encrypted upload, NFT-gated purchase,
  KMS-backed playback and gift/trial flows.
- Automated tests cover the web app, workers and contracts.
- **Early on traction**: mint activity to date is dominated by founder testing;
  the public alpha has not yet broadly opened. We are not claiming user traction.
- **Not** production-ready, not independently audited, hybrid-decentralized (see
  [`transparency.md`](./transparency.md)).

## Differentiation

Most "decentralized video" projects either don't encrypt, or trust one company
with the keys. YouTick's threshold-KMS + browser-encryption + on-chain-access
design means **no single party holds both the content and the key**, while
staying usable by non-crypto audiences. The architecture and its limits are
documented at audit grade.

## The ask

**Pre-seed: $100–500K.** Use of funds:

1. **Demand validation** — onboard real creators, measure willingness-to-pay and
   retention (the one thing the working system can't prove yet).
2. **Operator independence + audit** — move the 5 KMS operators onto independent
   hosting, add multisig governance, fund an independent security review.
3. **Runway** for a solo technical founder to convert a working mainnet system
   into an early creator base.

## What we're selling at pre-seed

A **working, live, honestly-documented system** and a **clear thesis** — not a
traction chart. The round funds turning "it works on mainnet" into "creators are
using it."

---
*Contact / demo: [youtick.net](https://youtick.net) · Repo:
github.com/4rmus/youtick*
