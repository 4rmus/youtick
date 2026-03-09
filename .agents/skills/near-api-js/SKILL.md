---
name: near-api-js
description: >
  Develop and maintain near-api-js 7.x integrations for NEAR RPC access, accounts, signers,
  actions, session keys, NEP-413 signing, and transaction construction. Use when touching repo
  code under apps/web/lib/near.ts, key/session management, backend NEAR services, or wallet
  interop that passes near-api-js actions.
license: MIT
metadata:
  author: near
---

# near-api-js

Use this skill for low-level NEAR JavaScript and TypeScript work.

## 2026 Stable Guidance

- `near-api-js` is the low-level client for RPC, keys, actions, accounts, and message signing.
- If you are building browser wallet login, use a wallet connector layer:
  - current NEAR docs recommend `@hot-labs/near-connect` for new wallet-login flows,
  - this repo currently uses `@near-wallet-selector/*`, which is still a supported path.
- Use RPC for live chain reads and transaction submission. Use indexer-style APIs such as FastNEAR or NearBlocks for heavy history, asset inventory, or analytics queries.
- Keep on-chain values as `bigint` or stringified yocto amounts. Do not use JS number math for balances or gas.
- Function-call access keys are scoped and cannot replace a full-access signer for arbitrary transfers or payable flows.

## Repo Mapping

- `apps/web/lib/near.ts`: provider and failover query helpers.
- `apps/web/lib/keystore-v7.ts`: browser and in-memory key-store primitives.
- `apps/web/lib/session-manager.ts`: session-key lifecycle and transaction retries.
- `apps/web/lib/batch-transactions.ts`: multi-action helpers.
- `apps/web/components/providers/WalletProvider.tsx`: wallet-selector interop using `near-api-js` actions.

## Common Decisions

- Read-only contract or account query: use `JsonRpcProvider` or `FailoverRpcProvider`.
- User-signed transaction in the browser: let the wallet connector sign, but build actions with `near-api-js`.
- Trial wallet or managed session key: use `KeyPair`, `Signer`, and `Account`.
- Off-chain auth or wallet proof: use NEP-413 message signing.
- Gasless flow: create a signed delegate and submit through a relayer.

## Read Next

- `references/api_patterns.md` for provider, account, action, and transaction shapes.
- `references/wallet_integration.md` for browser wallet patterns and repo-specific interop.
- `references/key_management.md` for key storage, session keys, and signer handling.
- `references/meta_transactions.md` when a relayer or NEP-366 flow is in scope.
- `references/tokens_guide.md` for FT/NFT token operations and storage-deposit concerns.

## Guardrails

- Do not bind UI login flow directly to raw `Account` construction if a wallet connector already owns the user session.
- Standardize local key storage keys; this repo uses `near-api-js:keystore:${accountId}:${networkId}`.
- Prefer provider-level view calls over ad hoc JSON-RPC fetch code when the repo already wraps them.
- When migrating older snippets, assume `WalletConnection` examples are legacy until proven otherwise.
