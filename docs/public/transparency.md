# YouTick Transparency

> What is centralized and what is on-chain during public alpha. We publish this
> because "hybrid decentralized" only means something if the centralized parts
> are named. Verified against live mainnet state on 2026-06-08.

## Centralized vs On-Chain (today)

| Component | Today | Honest decentralization property |
|---|---|---|
| NFT ticket ownership / transfer | **On-chain** (`youtick.near`) | Real — user-owned, censorship-resistant |
| Payment settlement | **On-chain** | Real — trustless |
| Access rules (`has_ticket`) | **On-chain** | Real — enforced by contract |
| Content addressing (IPFS CID) | **Decentralized** | Real — gateway-independent reads (5 gateways) |
| Key-share threshold (math) | **3-of-5 Shamir + VSS commitments** | Real *integrity*: <3 shares reveal nothing; a single bad operator can't forge a share |
| KMS operator custody | **Centralized** — 5 Cloudflare Workers under one account | Not decentralized for availability (one account = one failure domain) |
| KV share storage | **Centralized** — one Cloudflare account | Not decentralized |
| Storage write (Lighthouse) | **Centralized** — single write provider | Reads are decentralized; writes are not |
| Contract / market admin | **Centralized** — owner key on `youtick.near` | Not decentralized |
| Emergency takedown | **Centralized** — owner `takedown_event` | Not decentralized |
| Access-control timelock | **Deferred** — implemented in source, **not exported on the deployed build** (RPC-confirmed) | Not live; do not treat as governance yet |

## The threshold caveat (read this)

The 3-of-5 KMS threshold is **cryptographically real for integrity and
confidentiality** (information-theoretically secure below threshold, with
per-share VSS commitments). It is **not** a real availability/decentralization
property today, because all 5 operators run under a **single Cloudflare
account**. A single account compromise or suspension affects all five at once.
We will not describe operators as "independent" until they run on separate
accounts/providers.

## Content integrity

Media is encrypted with AES-256-CTR (confidentiality + seek). It is **not**
authenticated encryption — there is no HMAC/GCM tag, and the delivery worker
does not re-verify the IPFS CID. Tampered ciphertext from a malicious gateway
would corrupt playback but cannot disclose keys or bypass access. Authenticated
content integrity (per-chunk GCM/HMAC + CID verification) is on the post-alpha
roadmap. See `docs/operations/known-issues.md`.

## Owner-account hygiene (in progress)

The protocol-owner account `youtick.near` currently carries a large number of
access keys, including multiple FullAccess keys and several broad function-call
keys. Reducing FullAccess keys to a single hardware-wallet key (and moving to
multisig) is a pre-/early-launch hardening item tracked in the launch plan.
Audit with `scripts/audit-access-keys.mjs`.

## Governance plan

| Phase | Posture |
|---|---|
| V1 public alpha (now) | Owner-only on `youtick.near`; registry timelock live; access timelock deferred |
| Hardening (next) | Reduce/rotate owner keys → multisig; deploy access timelock build |
| Q3–Q4 2026 | Multisig / DAO handover scope (under discussion) |

We keep public wording at "public alpha" and "hybrid decentralized" until
independent operator hosting, redundant persistence, and multisig/DAO governance
are implemented and verified.
