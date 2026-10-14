# ckd-gate

Status: `TESTNET_KEYLESS_VERIFIED / NOT_AUDITED / NOT_DEPLOYED_ON_MAINNET` (roadmap E4, 2026-10-14)

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

## Deployments

| Network | Account | Source | Build | WASM sha256 / code hash | Verified |
|---|---|---|---|---|---|
| testnet | `v2-ckd-gate-261007.youtick-dev-v3.testnet` | `9592674` (contract source unchanged since) | CI run 37829015302, `non-reproducible-wasm` | `c79b61629976f069aedaf4b3106e02813c6ef35d18620829de9ba3d55fb7a9c2` / `ESBYxppi6NzkeFJfBTxPTPvbGfjx5A7doCZqZNBwapcq` | 2026-10-14: no access keys, code hash = that CI WASM, `config` as expected (`scripts/verify-ckd-gate.mjs`, PROVIDER testnet) |

The testnet gate was deployed by the V2 testnet bootstrap (run 37832347847) before the reproducible
build existed, so its NEP-330 `link` and `build_info` are empty. It stays: a new gate would give every
test user a new secret. The CI artifact holding its WASM expires on 2026-11-07; the hashes above are the
record. Builds from E4 on embed NEP-330 `link` (Cargo.toml `repository`), so no later build, even a
non-reproducible one, reproduces `ESBYxppi…`; the contract's behaviour is the same. The first gate built
reproducibly will be mainnet's.

## Mainnet deployment procedure (requires owner approval)

1. **Wait for NEAR Auth approval** (roadmap X2). The approval supplies the mainnet Auth0 issuer,
   the client ID and the guard account. Confirm the fast-auth account (`fast-auth.near`), the MPC
   contract (`v1.signer`) and the domain IDs on chain before init. Testnet used fast-auth domain
   1 and CKD domain 2.
2. **Build reproducibly** from a commit on `main`: CI's *ckd-gate reproducible build* job runs
   `cargo near build reproducible-wasm` in the digest-pinned `sourcescan/cargo-near:0.17.0-rust-1.86.0`
   image and keeps `ckd_gate.wasm`, `Cargo.lock` and `build.json` (commit, sha256, code hash) for 90
   days. Use the artifact of the push to `main` (pull-request runs build a temporary merge commit).
   Rebuild the same commit on a second machine and compare the sha256 before deploying; publish it
   with the commit. On macOS, Docker Desktop does not share `/var/folders`, so run the build with
   `TMPDIR` under the home directory, or the container finds an empty checkout.
3. **Deploy to a permanent account name, initialize once, then delete the account's full-access
   key in the same session.**
   - Whoever holds that key could redeploy and collect every user's secret.
   - Then run, from any machine, and keep the JSON output with the release record:
     `node scripts/verify-ckd-gate.mjs check --network mainnet --account <gate> --wasm ckd_gate.wasm`
     `--require-build-info` (with the mainnet `config` added to `EXPECTED_CONFIG` once X2 supplies
     it). It must report `PASS`: no access keys, the code hash of that WASM, the expected `config`,
     and NEP-330 `link` and `build_info`. Check that both name the release commit and the image. Query
     a second RPC provider with `--rpc` as well.
   - Publish the code hash next to the account and add the gate to `CKD_TRUST_ROOTS`
     (`apps/web/lib/ticket-keys/ckd.ts`).
4. **Fund the account with NEAR** for the 1 yoctoNEAR deposits and storage.

## Rotation

The secret depends on the gate account. Fixing a bug therefore means deploying a new gate
account, and every user then gets a new secret.

- Tickets stay bound to keys derived from the old secret, so the old gate must keep working. A
  keyless gate cannot be switched off, so it does.
- The client already accepts several gates per network (`CKD_TRUST_ROOTS` is a list) and checks each
  result against that gate's pinned MPC key.
- **Client (2026-10-15).** Each gate has a role in `CKD_TRUST_ROOTS`: one `current` gate per
  network (sign-in and new purchases) and any `retired` gates. Sign-in requests the current
  gate's secret. For each retired gate, My tickets offers one more NEAR Auth sign-in ("Find
  earlier tickets"), because the id_token nonce binds a single gate; the extra sign-in must
  resolve to the same account. The recovery scan then runs with every secret, and each ticket
  signs with the key of the gate it was bought under. New purchases always use the current gate.
- **Rotation steps (client).** Pin the new gate as `current` and change the old one to `retired`
  in the same release, set `NEXT_PUBLIC_CKD_GATE_ACCOUNT_ID` to the new gate (sign-in refuses a
  configured gate that is not current) and add the new gate to the relayer's
  `CKD_GATE_ACCOUNT_IDS`. Never remove a retired gate while tickets bought under it may be in use.
- Any rules needed later must be in the first mainnet version.

## Known limits (input for the audit)

- **The id_token is a call argument, so it is public on chain.**
  - Request minimal scopes. The identity reference (`sub`) cannot be removed. This is
    fast-auth's model too, and it is on the legal list (roadmap X4).
  - Checked on testnet (2026-10-14, claim names of a real `request_key` token only): `aud`, `exp`,
    `iat`, `iss`, `nonce`, `sid`, `sub`. No email or name. `sub` is the provider's raw identifier
    (`google-oauth2|<Google user id>`), and `sid` is the Auth0 session id; both are public and
    permanent. Raise both with NEAR Auth (X2) and in the legal review (X4).
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

See `docs/testing.md` (ckd-gate). There are 26 unit tests: the token rules (including `nbf`, a
foreign issuer, malformed and oversized tokens), rule selection, linking and the deposit maths, and
the callback failure paths. A sandbox test against a real MPC contract is not possible locally. The
end-to-end evidence is the V2 testnet: NEAR Auth sign-ins on 2026-10-12/13 ran `request_key` through
this gate and decrypted the result against the pinned MPC key (PROVIDER testnet).
