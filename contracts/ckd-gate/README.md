# ckd-gate

Status: `IMPORTED_FROM_SPIKE / NOT_AUDITED / NOT_DEPLOYED_ON_MAINNET`

`ckd-gate` is a small proxy contract. It lets a signed-in youtick user obtain their NEAR MPC
Confidential Key Derivation (CKD) root secret with no approval prompt. The client derives ticket
keys from that secret (`protocol/youtick-market-v2`, "Ticket keys"). The source comes from the
private `4rmus/youtick-v2-spikes` repository (commit `1b3e66c`), where it was tested end to end on
testnet with the shared NEAR Auth client.

## How it works

The MPC network binds the secret to `(this contract, "v1/<account>")`. The contract requests it
for an account only under one of three rules:

| Rule | When |
|---|---|
| (a) | The fast-auth account derived from the login token (`jwt#<iss>#<sub>`) equals the requested account. |
| (b) | The token's identity has been linked to the account. The account links it once with `link_identity` and pays the storage. |
| (c) | The caller is the account itself (`request_key_as_account`). |

Token checks:
- RS256, with keys read from the fast-auth guard;
- `iss`, `aud` (must contain the client ID), `exp` and `nbf`;
- `nonce == b64url(sha256("ckd-gate|<gate>|<pk1>|<pk2>"))`, so a captured token cannot be used
  with another ephemeral key or another gate.

The contract pays the 1 yoctoNEAR MPC deposit. There is no owner, upgrade or migration method.

## Dependencies (owner-approved exception)

- This crate uses `near-sdk =5.18.1` and fast-auth's `base-jwt-guard` from git
  (`Peersyst/fast-auth@8f84383`). That pulls in the pre-release `crypto-bigint 0.7.0-pre.4`.
- The other contracts stay on `near-sdk =5.5.0`. This crate has its own `Cargo.lock` and
  `rust-toolchain.toml` and is never linked with them. The owner approved this on 2026-10-07.
- Do not run `cargo update`. After an update in the spike, bad RS256 signatures trapped with
  `unreachable` instead of failing cleanly.
- Build and test with `--locked`.

## Mainnet deployment procedure (requires owner approval)

1. **Wait for NEAR Auth approval** (roadmap X2). The approval supplies the mainnet Auth0 issuer,
   the client ID and the guard account. Confirm the fast-auth account (`fast-auth.near`), the MPC
   contract (`v1.signer`) and the domain IDs on chain before init. Testnet used fast-auth domain
   1 and CKD domain 2.
2. **Build reproducibly** (`cargo near build reproducible-wasm`, which needs Docker) and publish
   the WASM SHA-256. The testnet spike deployment does not match a fresh build of its source, so
   deploy only from a reproducible build.
3. **Deploy to a permanent account name, initialize once, then delete the account's full-access
   key in the same session.**
   - Whoever holds that key could redeploy and collect every user's secret.
   - Verify `view_access_key_list` is empty.
   - Publish the code hash next to the account.
4. **Fund the account with NEAR** for the 1 yoctoNEAR deposits and storage.

## Rotation

The secret depends on the gate account. Fixing a bug therefore means deploying a new gate
account, and every user then gets a new secret.

- Tickets stay bound to keys derived from the old secret, so the old gate must keep working.
- The client must know every gate version and scan tickets for each one (roadmap E5).
- Any rules needed later must be in the first mainnet version.

## Known limits (input for the audit)

- **The id_token is a call argument, so it is public on chain.**
  - Request minimal scopes. The identity reference (`sub`) cannot be removed. This is
    fast-auth's model too, and it is on the legal list (roadmap X4).
  - Never accept these tokens as sessions anywhere else.
- **No `jti` single-use check.** A token can be replayed until `exp`, but only with the same
  ephemeral key. The MPC response is encrypted to that key, so a replay reveals nothing.
- **Rule (c).** Any function-call key scoped to this contract on a user's account can fetch that
  account's secret. youtick never adds such keys and never holds full-access keys on user
  accounts.
- **Trust boundary.** The RS256 verifier and the fast-auth guard's key set are inside it, and so
  are Auth0 and Google: whoever can sign in as the user gets the secret.
- **Audit scope.** The pre-release `crypto-bigint` dependency must be covered by the audit
  (roadmap X5).

## Checks

See `docs/testing.md` (ckd-gate). There are 26 unit tests: the token rules, rule selection,
linking and the deposit maths, and the callback failure paths. A sandbox test against a real MPC
contract is not possible locally; the end-to-end evidence is the spike's testnet run
(UNPROVEN in this repository).
