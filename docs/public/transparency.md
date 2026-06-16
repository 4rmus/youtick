# YouTick Transparency

> What is centralized and what is on-chain during public alpha. We publish this
> because "hybrid decentralized" only means something if the centralized parts
> are named.

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
authenticated encryption — there is no HMAC/GCM tag. Supported raw CID payloads
are checked against their content address in the client and Media Delivery
Worker, but this is not a replacement for authenticated encryption. Tampered
ciphertext from an unsupported or unchecked path could corrupt playback, but it
cannot disclose keys or bypass access. Authenticated content integrity
(per-chunk GCM or encrypt-then-MAC) is on the production hardening roadmap.

## Owner-account hygiene (in progress)

Public-alpha owner-account hardening is still in progress. Detailed access-key
inventories and rotation records are kept in private operations notes. Public
claims should stay at "owner-controlled public alpha" until multisig or DAO
governance is live and verified.

## Governance plan

| Phase | Posture |
|---|---|
| V1 public alpha (now) | Owner-only on `youtick.near`; registry timelock live; access timelock deferred |
| Hardening (next) | Reduce/rotate owner keys → multisig; deploy access timelock build |
| Q3–Q4 2026 | Multisig / DAO handover scope (under discussion) |

We keep public wording at "public alpha" and "hybrid decentralized" until
independent operator hosting, redundant persistence, and multisig/DAO governance
are implemented and verified.
