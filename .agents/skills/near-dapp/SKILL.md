---
name: near-dapp
description: "Use for the existing YouTick Next.js wallet connection, sign-in/sign-out and wallet-to-contract UI. Google/MPC session issues belong to youtick-near-auth."
---

# NEAR dApp — existing YouTick app

Read root and `apps/web/AGENTS.md`. Inspect `apps/web/components/providers/WalletProvider.tsx`, `apps/web/lib/near.ts`, `apps/web/lib/types.ts` and the package/lockfile before changing the wallet flow.

Start with [near-connect](references/near-connect.md), matching the installed API. Reuse the existing provider and types. Do not scaffold a second app, add another wallet context or install `near-connect-hooks` merely because the upstream tutorial uses it. The [hooks reference](references/near-connect-hooks.md) and [new-app reference](references/create-near-app.md) apply only when the user actually requests those choices.

Preserve configured network and account-change/logout behavior. Check user rejection, pending approval, reload and redirect return without discarding the upload draft or existing device keys. A connected wallet is not transaction finality or a playback entitlement.

Use [youtick-near-auth](../youtick-near-auth/SKILL.md) for Google/Auth0/MPC flows; this wallet reference does not establish passkey support. Select Web checks from `docs/testing.md`. Browser acceptance uses Brave and distinguishes local mock evidence from real wallet/provider evidence; the user performs real signatures.

[Original upstream guide](UPSTREAM.md) is retained for provenance and optional examples; use this scoped entrypoint for YouTick. Source and update policy: [sources](../SOURCES.md).
