# Installation Guide

> Steps required to run YouTick locally.

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | 24 LTS |
| npm | 10+ |
| Git | Current |
| Rust (stable) + `cargo near` | Optional, for contract development |
| `near-cli-rs` | Optional, for RPC ops |

---

## 1. Clone the repo

```bash
git clone https://github.com/4rmus/youtick.git
cd youtick
```

## 2. Prepare the web app

```bash
cd apps/web
npm install
cp .env.example .env.local
```

The minimum variables required in `.env.local`:

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
```

`MARKET_CONTRACT_ID` is required. If it is not set, `lib/constants.ts`
falls back to `NFT_CONTRACT_ID`, but this is a compatibility path that
will change in the future.

KMS endpoints are not configured through env. The web app reads the
active KMS operators from the registry contract pointed to by
`NEXT_PUBLIC_REGISTRY_CONTRACT_ID`.

## 3. Start the app

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Optional: Contract Development

```bash
rustup target add wasm32-unknown-unknown
cd contracts/nft-ticket
cargo near build non-reproducible-wasm   # production build; verify hash before deploy
cargo test --lib
cargo test --test sandbox
```

---

## Optional: Local KMS Worker

If you want to run a KMS worker locally as well:

```bash
cd workers/youtick-kms
npm install
npx wrangler dev
```

Then register the local worker endpoint as an operator on your test
registry contract. The registry rejects direct admin calls; operator
registration goes through `propose_action` + 24h timelock + `execute_action`.

## Optional: Storage API (for real uploads)

To try real uploads locally, run or deploy `workers/storage-api`,
configure its Lighthouse secret, then set
`NEXT_PUBLIC_STORAGE_API_URL` in `apps/web/.env.local`. After SB-1, the
worker requires a NEP-413 upload challenge; calling `/uploads/intent`
without auth returns `Unauthorized`.

---

## First Smoke Check

When the app opens, check:

1. The landing page loads.
2. `/discover` can fetch events.
3. The wallet connect modal opens.
4. If you're using a local KMS, `/watch` does not error on key retrieval.

---

## Common Issues

| Issue | What to check |
|---|---|
| App can't reach the contract | `NEXT_PUBLIC_NEAR_NETWORK`, `NEXT_PUBLIC_MARKET_CONTRACT_ID`, `NEXT_PUBLIC_NFT_CONTRACT_ID` |
| Video won't open | Registry operator records and worker logs; if you see `SIGNLESS_PLAYBACK_UNAVAILABLE`, reconnect the wallet |
| Gift link goes to the wrong domain | `NEXT_PUBLIC_APP_URL` |
| Cross-chain payment options don't appear | `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true` **and** a connected NEAR wallet (the token alone is not enough) plus `NEXT_PUBLIC_ONE_CLICK_API_TOKEN` |
| Local upload returns 401 on `/uploads/intent` | `workers/storage-api` isn't running, or the NEP-413 challenge hasn't been completed |

---

**Next:** [Configuration Reference](./configuration.md)
