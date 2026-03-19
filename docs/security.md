# Security Model

> How media, key shares, and authorization are protected in the hardened mainnet path

---

## Layers

| Layer | What it protects | Current mechanism |
|-------|------------------|-------------------|
| Transport | Network traffic | HTTPS |
| Media | Raw video | Browser-side AES-CTR encryption |
| Key custody | Playback key material | Operator-encrypted secret shares |
| Playback authorization | Who can decrypt and watch | Market + access + registry checks |
| Trial flows | Abuse and relayer control | Registry-enforced relayer + rate limits |
| Moderation | Harmful content | On-chain ban / unban |

---

## Media Security

Raw media is not uploaded in plaintext. During upload the browser:

1. generates an AES key
2. encrypts the media locally
3. uploads only encrypted output to IPFS

This means storage providers do not see the original video.

---

## Share-Based Key Security

The live playback model no longer treats the AES key as one secret held by one worker.

Instead:

1. the browser splits the AES key into multiple shares
2. each active operator stores only its own share
3. each operator encrypts its share again with its own worker secret
4. playback reconstructs the key in the browser after enough shares arrive

This reduces dependence on a single key-release point.

---

## Authorization Security

A decryption operator must pass all of these checks before returning a share:

- the worker must be active in the registry
- the playback request must have a valid short-lived access grant or equivalent allowed path
- the viewer must have on-chain entitlement for the content

The final decision is not made by the UI. It is enforced through contracts and the operator worker.

---

## Registry Security

The registry is now an enforcement layer, not just a lookup table.

It decides:

- which operators are active
- which relayers are active
- what threshold the playback system expects

In the current mainnet-target rollout:

- active operator count: `5`
- playback threshold: `3-of-5`

---

## Upload Security

Upload keeps its dedicated narrow session-key path.

That path is still preferred because it preserves the low-friction single-approval UX while keeping permissions narrow:

- limited method set
- limited budget
- short TTL

This means upload and playback do not have to use the same auth primitive.

---

## Trial and Relayer Security

Legacy trial flows still exist in the product surface, but the relayer route is now constrained by the registry:

- inactive relayers are rejected
- the relayer account must match the registry entry
- rate limits remain active

---

## Operational Checklist

- Is `NEXT_PUBLIC_KMS_URL` correct for the current environment?
- Does the KMS worker point to the right market, access, and registry contracts?
- Does the worker fail health if `REGISTRY_OPERATOR_ACCOUNT_ID` or `OPERATOR_SHARE_SECRET` is missing?
- Are the required operators active in the registry?
- Are the required relayers active in the registry?
- Are mainnet and testnet using separate KV namespaces?
- Are IPFS gateway fallbacks still healthy?
- Are banned events blocked from new purchases?
- Are playback traces showing reconstruction from shares rather than legacy fallback?

---

## Compatibility Note

The repo still contains legacy fields and compatibility helpers, but the live protection path is now:

> browser encryption + market entitlement + access grants + registry enforcement + operator share reconstruction
