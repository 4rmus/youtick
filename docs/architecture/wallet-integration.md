# Wallet Integration

YouTick's standard NEAR wallet entry runs through `@hot-labs/near-connect`.
The package version is intentionally pinned exact: `@hot-labs/near-connect@0.11.4`.

## Active Decision

- The standard NEAR wallet connector layer is `@hot-labs/near-connect`.
- `@near-wallet-selector/*` is no longer a direct dependency of the app.
- When connecting, the app installs a narrowly-scoped function-call access key
  for `access.youtick.near`. This local key gives KMS proof of account
  ownership; no further wallet signature is requested during ticketed
  playback.
- Guest and trial accounts are supported as managed local accounts. They run
  on the device's local key and are distinguished inside `WalletProvider`
  by `managedAccountKind`.
- EVM-linked managed account compatibility is preserved, but the primary
  path for ticket checkout is a real NEAR wallet connection.

## Preserved Contract

`apps/web/components/providers/WalletProvider.tsx` preserves the
`WalletInstance` interface the app expects:

- `signAndSendTransaction`
- `signAndSendTransactions`
- `signMessage`
- `getAccounts`

A multi-transaction result returns an array on some wallets and may return
empty on browser-style flows. Callers tolerate `object[] | void` accordingly.

## Operational Gates

This integration is not considered complete just because it compiles and
builds. Before going live, at least one testnet wallet must manually
verify these flows:

- modal opening
- sign in / sign out
- limited-scope function-call access key installed at connect time
- upload session multi-transaction
- single-transaction ticket purchase
- no wallet signature or transaction popup during paid playback

If the manifest fails to load, the user is shown a wallet connection error
and a `near_connect_error` log/Sentry entry is recorded.

## Guest / Trial Surface

Guest and trial flows run through the same context without breaking the
normal wallet entry. Current boundary:

- If a `managedNearAccount` record and a local keystore key exist,
  `WalletProvider` can open that account as the active account.
- `TrialWallet` preserves the `signAndSendTransaction`,
  `signAndSendTransactions`, `signMessage` and `getAccounts` contract for
  guest and trial accounts.
- Free-ticket claim and free-ticket playback work with guest/trial
  accounts.
- Paid checkout does not start with a guest/trial account; the user is
  routed to connect a real NEAR wallet.
- The playback gate is unchanged: KMS retrieve does not open without a
  creator role, ticket ownership or a confirmed claim.
- KMS retrieve uses a session grant on a normal wallet. On a guest/trial
  account, only when a managed local account is known does the local
  account key sign the retrieve.

This split keeps the guest/trial experience usable for free access while
paid purchase, creator/upload and persistent account expectations move to
the real wallet connection.

## Cross-Chain Checkout (Optional)

The cross-chain payment path is experimental and runs as
`1Click + MetaMask + implicit NEAR account`. It opens only when
`NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true` and works with a
**connected NEAR wallet**, not a guest/trial account.

Flow summary:

1. User selects a token on Arbitrum or Base.
2. A 1Click quote is fetched.
3. MetaMask approves the transfer if needed.
4. The resulting NEAR lands on the connected account.
5. Purchase completes on the NEAR side via `buy_ticket`.

Main code surfaces:

- `apps/web/components/PaymentMethodSelector.tsx`
- `apps/web/lib/intents/*`
- `apps/web/lib/evm/*`

## Smoke Test

Playwright smoke test for the guest/trial surface:

```bash
cd apps/web
npm run test:smoke
```

The test uses controlled mocks to preserve two behaviors:

- A guest account on a free-ticket watch flow lands on the
  ticket-verified player surface.
- A guest account on a paid ticket does not start checkout/Rhea; it
  shows a "connect wallet" CTA.
