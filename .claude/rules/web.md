---
paths:
  - "apps/web/**"
---

# Web app (apps/web)

- Next.js writes its own `apps/web/AGENTS.md`: the installed version differs from training data, so read the relevant guide under `apps/web/node_modules/next/dist/docs/` before writing App Router, caching, or routing code.
- Verify `apps/web/package.json`, the lockfile, and installed types before using an example. V1 is wallet-only: `@hot-labs/near-connect` for wallet connection and `near-api-js` v7 for encoding and RPC. V2 NEAR Auth sign-in (Google/passkey through fast-auth, behind `NEXT_PUBLIC_ENABLE_NEAR_AUTH_V2`, default off) lives in `apps/web/lib/near-auth/`; it is a separate V2 flow, not a second wallet context for V1 (skill `youtick-near-auth`). The `docs/architecture/near-auth-*.md` files are historical lab records, not current instructions. `apps/web/lib/ticket-keys/` is the V2 ticket-key library (CKD decryption through `ckd-gate`, HKDF ticket keys, `protocol/youtick-market-v2` messages, recovery scan); no page uses it yet. Keep its seeds and CKD keys in memory only, add gates and MPC keys only to the pinned `CKD_TRUST_ROOTS` (never from RPC, URLs or runtime config), test it against the protocol golden vectors, and load `@noble/curves/bls12-381` only where CKD runs.
- Wallet and session code lives in `apps/web/components/providers/WalletProvider.tsx`, `apps/web/lib/near.ts`, `wallet-account.ts`, `device-session.ts`, `playback-device-activation.ts`, and `pinned-wallet-manifest.ts`. Reuse the existing provider and types; never scaffold a second app, add another wallet context, or install hook packages because a tutorial uses them.
- Keep login, NEP-413 message proof, transaction signature, and finalized receipts distinct. A connected wallet, a 1Click SUCCESS, or a redirect is not payment finality or a playback entitlement.
- Preserve the upload draft across redirects (`livepeer-upload-state.ts`), the current account, device-key binding, and rejection handling. Never log cookies, subject identifiers, or private keys.
- Multi-asset/1Click (`apps/web/lib/multi-asset-payments.ts`) defaults to `off`; read actual flags, do not infer live activation from source.
- Checks come from the Web section of `docs/testing.md`: `npm test -- --run`, `npm run test:livepeer-canary`, the browser checks under `apps/web/scripts/` (device session, player, player device activation), `npm run lint`, `npm run build`. Browser mock evidence is LOCAL_TEST; real wallet or payment acceptance needs its own authorized scope and the user's signatures.
- Skills: `near-dapp` (wallet connection and sign-in UI), `youtick-payment-flow` (fees, purchases, USDC, refunds), `near-intents` (1Click request and status details), `near-api-js` (RPC and transaction encoding).
