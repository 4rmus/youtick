# Contributing to YouTick

The key rule when contributing to this repo: refer to the active code,
not the documentation.

---

## Quick start

```bash
git clone https://github.com/<your-username>/youtick.git
cd youtick
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

---

## Contribution areas

- `apps/web/components/` — UI layer of the product flows
- `apps/web/lib/` — business logic
- `workers/youtick-kms/` — key custody and access control
- `workers/storage-api/` — storage provider secret and health surface
- `workers/media-delivery/` — encrypted IPFS media routing and cache
- `contracts/nft-ticket/` — on-chain logic
- `docs/` — documents describing active behavior

---

## Env setup

Minimum:

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
```

Common optionals:

```txt
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ONE_CLICK_API_TOKEN=...
```

KMS endpoints are not configured through `.env.local`; the app reads
active operators from the registry contract.

Full variable list and descriptions: [Configuration Reference](getting-started/configuration.md).

---

## Pre-PR checks

- `npm run lint`
- `npm test -- --run`
- `npm run build`
- `npm run test:smoke` (guest/trial Playwright smoke) — optional, but
  recommended when wallet/trial behavior changes
- If the KMS worker changed: `cd workers/youtick-kms && npm test -- --run && npm run check`
- If the Storage API Worker changed: `cd workers/storage-api && npm test -- --run && npm run check`
- If the Media Delivery Worker changed: `cd workers/media-delivery && npm test -- --run && npm run check`
- If the Web4 Proxy changed: `cd workers/web4-proxy && npm test -- --run && npm run check`
- If contracts changed: `cargo test --lib` and `cargo test --test sandbox`
- If docs changed: links and terminology should match the active code

---

## Commit scope suggestions

- `upload`
- `player`
- `kms`
- `storage`
- `contract`
- `gift`
- `trial`
- `ui`
- `evm`
- `intents`
- `docs`

Examples:

```text
fix(player): improve kms fallback handling
docs(contract): remove legacy compatibility references
feat(upload): tighten upload session cleanup
```

---

## Documentation contribution rule

If a page centers on something that is no longer active — for example:

- TEE attestation
- removed Nova funding methods (`fund_nova_platform`, `set_nova_*`)
- removed relayer methods (`*_sponsored`, `add_trial_relayer`, …)

check the code first and either simplify the page or remove it.
**Caveat:** the `*_prepaid` naming (`create_event_prepaid`,
`nft_mint_prepaid`) is the **active upload session path**; it is not
deprecated.
