---
name: youtick-near-auth
description: "Use for the V2 NEAR Auth sign-in (Google/passkey through fast-auth), the ckd-gate CKD request, ticket-key derivation and recovery in apps/web/lib/near-auth and apps/web/lib/ticket-keys. Not for the V1 wallet flow (near-dapp)."
---

# YouTick NEAR Auth (V2)

Read root `AGENTS.md`. Paths are relative to the repository root.

1. Sources: `apps/web/lib/near-auth/` (`config.ts` flag and pinned providers, `oidc.ts` PKCE popup login with our own nonce, `id-token.ts` pre-submission checks, `account.ts` fast-auth implicit account, `ckd-sign-in.ts` the C2 flow), `apps/web/lib/ticket-keys/` (CKD decryption with `CKD_TRUST_ROOTS`, HKDF ticket keys, protocol messages, recovery scan), the V2 pages (`apps/web/app/(v2)/`, `components/v2/`, `lib/v2/`: relayer client, device key, tickets, playback v3), `workers/relayer`, `contracts/ckd-gate` and `protocol/youtick-market-v2`.
2. The id_token nonce must equal `b64url(sha256("ckd-gate|<gate>|<pk1>|<pk2>"))` for a fresh ephemeral key per request. Never reuse an ephemeral key, never accept a token whose nonce, issuer, audience or expiry does not match, and never treat the id_token as a session elsewhere.
3. Trust roots are code, not data: providers in `NEAR_AUTH_PROVIDERS` and gates/MPC keys in `CKD_TRUST_ROOTS` change only in a reviewed PR after the on-chain values are read. An empty entry means the feature is unavailable on that network.
4. Keep the id_token, ephemeral scalar, CKD key and ticket seeds in memory; never store or log them, nor JWTs, cookies or subject identifiers. `NEXT_PUBLIC_ENABLE_NEAR_AUTH_V2` is off by default.
5. Tests: `apps/web/__tests__/unit/near-auth-v2.test.ts` and `ticket-keys.test.ts` against the protocol golden vectors (`docs/testing.md`, Web). Mock and simulated MPC results are LOCAL_TEST; a real Google/passkey login, relayer submission or MPC response is PROVIDER evidence on testnet only, and needs its own authorized run.

Check `https://docs.auth.near.org/` and the fast-auth source for provider behaviour; `docs/architecture/near-auth-*.md` are V1 lab records, not current instructions.
