---
name: crust-network
description: >
  Build and maintain Crust Network integrations for authenticated IPFS uploads, W3Auth gateway
  and PSA pinning flows, storage-order placement/status checks, and NEAR + Crust architectures.
  Use when working on repo code under apps/web/lib/crust, Crust auth headers, CID upload/retrieval,
  or Substrate-side storage guarantees.
license: MIT
metadata:
  author: crust-network
---

# Crust Network

Use this skill when the task touches authenticated upload or pinning, gateway failover, or on-chain persistence on Crust.

## 2026 Stable Guidance

- Crust has two distinct auth surfaces:
  - Gateway `/api/v0/*` traffic uses `Authorization: Basic <base64(ChainType-PubKey:SignedMsg)>`.
  - PSA remote pinning uses `Authorization: Bearer <base64(ChainType-PubKey:SignedMsg)>` in the current docs.
- Some older Crust examples and hosted deployments still show or accept legacy header behavior on PSA. Verify the target endpoint before changing working production code.
- For chain RPC typing, use `@crustio/type-definitions` with `@polkadot/api`.
- In browser NEAR apps, the safest default is:
  1. sign W3Auth with the user or session key,
  2. upload to Crust/IPFS,
  3. store CID and business metadata on NEAR,
  4. place storage orders from a controlled backend or ops signer only when durable replication guarantees are required.
- Never ship CRU mnemonics or Substrate signing keys in browser code.

## Repo Mapping

- `apps/web/lib/crust/w3auth.ts`: builds the current NEAR-based auth header.
- `apps/web/lib/crust/client.ts`: upload and pin flow.
- `apps/web/lib/crust/gateway.ts`: read failover across Crust and public gateways.
- `apps/web/lib/crust/storage-order.ts`: PSA-style order helper used by the app.
- `apps/web/test-crust*.mjs` and `apps/web/test-psa-*.mjs`: manual integration checks.

## Choose The Right Reference

- Read `references/w3auth.md` for header format, NEAR signing shape, and gateway vs PSA differences.
- Read `references/near-integration.md` for the repo-aligned `near-api-js v7 + wallet-selector + Crust` pattern.
- Read `references/storage-orders.md` for Substrate-side storage orders and `filesV2` queries.
- Read `references/chain-types.md` for typed RPC queries and subscriptions.
- Read `references/cross-chain-scenarios.md` only if EVM or multi-chain payment flow is actually in scope.

## Default Workflow

1. Start from the existing helper in `apps/web/lib/crust` instead of rewriting auth logic.
2. Decide whether the task is upload-only, upload plus pin, or upload plus explicit storage-order tracking.
3. Keep user metadata and ownership records on NEAR or app storage; use Crust as the blob layer.
4. When changing auth or gateway selection, add or update a manual verification path with the existing test scripts.

## Guardrails

- A successful upload does not prove an on-chain storage order exists.
- Public gateway reads and authenticated write APIs should be treated as separate concerns.
- When debugging missing files, check upload, retrieval, and storage-order status independently.
- Keep NEAR ed25519 formatting consistent with the repo helper: strip the `ed25519:` prefix before signing if the target Crust auth flow expects raw public-key bytes.
