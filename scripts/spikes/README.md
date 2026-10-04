# CKD spikes

Throwaway experiments for the V2 ticket-key design: the root secret for ticket keys comes
from NEAR MPC Confidential Key Derivation (CKD) instead of any server-side store. Nothing
here is production code, none of it is audited, and none of it is wired into the app.

| Directory | What it checks |
| --- | --- |
| `ckd/` | `v1.signer.request_app_private_key` end to end on mainnet with the official near/mpc `ckd-example-cli` |
| `ckd-near-auth/` | JS port of CKD decryption (`ckd.mjs`), plus a localhost harness for NEAR Auth flows |
| `ckd-gate/` | Proxy contract that lets a login token request a NEAR-account-bound CKD secret without an approval screen |

## Results (2026-10-04)

- **Direct CKD, mainnet.** `youtick.near`, path `ckd-spike`, `AppPublicKeyPV`, 50 TGas + 1 yoctoNEAR.
  Two requests with different ephemeral keys returned the same secret after the pairing check
  ([4Q4R1wfK…](https://nearblocks.io/txns/4Q4R1wfKUMURQhVE2UVZutMadEh2bejesqc6PC1af8Yi),
  [H9toWWvD…](https://nearblocks.io/txns/H9toWWvDYRwvLrGpGACVGnAUjHZzfJVnouS71uyAYsXP)).
- **JS port.** `ckd.mjs` matches the near/mpc Rust snapshots for `derive_app_id` and
  `hash_app_id_with_pk` byte for byte (`npm test`).
- **Option A, NEAR Auth testnet.** Google login, then a `request_app_private_key` delegate action
  approved on the NEAR Auth screen, signed through `fast-auth.testnet.sign` and relayed. The
  predecessor was the user's implicit account; two runs gave the same secret. About 19 s after approval.
- **Option C2, `ckd-gate` v2, testnet** (`ckd-gate-2.dev-youtick-1770146451.testnet`). Login only,
  no approval screen. One login runs eight on-chain steps; four runs passed 32/32:
  - rule (a) resolved the user's fast-auth account on chain and requested `v1/<account>`
    ([8wqDeoMv…](https://testnet.nearblocks.io/txns/8wqDeoMvtF4iFnRQZiKJ9Nnkc7x6tFmkf3ZiDQWrSoi6)), about 10 s and 45 TGas;
  - replaying the same token with another ephemeral key failed with `nonce does not bind app key`;
  - requests for an unlinked account, and for an account after `unlink_identity`, failed with
    `identity is not linked to the requested account`;
  - after linking, rule (b) and rule (c) returned the same secret for the same account;
  - link storage was charged and refunded correctly; a forged signature failed with `bad signature`.

## Running

- `ckd/run.sh` needs `CKD_CLI` pointing at a built `ckd-example-cli` and a full-access key for the
  account in the local legacy keychain. Without `--send` it only prints the transaction.
- `ckd-near-auth`: `npm ci && npm test`; `npm start` serves `http://localhost:3000` (`/` for option A,
  `/gate` for C, `/gate?v=2` for C2). The shared NEAR Auth testnet client only accepts
  `http://localhost:3000`. The sponsor/relayer key is read from `~/.near-credentials/testnet` at runtime.
- `ckd-gate`: Rust 1.86 (`rust-toolchain.toml`), `cargo test`, `cargo near build non-reproducible-wasm`.
  Keep the committed `Cargo.lock` (taken from fast-auth) as is: after a `cargo update`, the RS256
  verifier trapped with `unreachable` on invalid signatures in wasm instead of returning `false`.

The deployed `ckd-gate-2` was built from this logic before comments were translated and the
synthetic test vector was added, so its code hash differs from a fresh build.
