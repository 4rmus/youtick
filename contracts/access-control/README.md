# YouTick Access Control Contract

Session grant + scope policy contract. Controls short-lived authorization
that decryption operators check before releasing key shares.

**Mainnet:** `access.youtick.near`
**Admin posture:** owner-only on the live build (timelock surface deferred
for the current alpha — see launch plan §SB-3).

---

## Core responsibilities

- issue and revoke short-lived session grants (5-min Play / 10-min Publish
  default windows; 5-min ClaimGift / ClaimTrial)
- verify `session_pok` so a grant can only be created by someone holding
  the session private key
- store and pause/unpause scope policy
- expose grant verification helpers for relayers and decryption operators
- keep market and registry contract references for cross-checks

---

## Main methods

### Change methods

- `issue_session_grant` — issue a short-lived grant after `session_pok`
  verification (live build accepts owner / market / registry / target owner
  / ticket owner / creator)
- `revoke_session_grant` — revoke one grant by session public key
- `revoke_subject_sessions` — revoke every grant for one subject
- `set_scope_policy`, `set_market_contract`, `set_registry_contract`,
  `pause_scope`, `unpause_scope`, `pause_contract`, `unpause_contract` —
  direct calls; the timelock variants are present in source but **not
  exported on the live mainnet build** (`#[near]` macro fix prepared as
  hash `AC4NfQRakBFoCkcK6EqiKBwD93Pb61kPxVjWeHHa3QeC`, deferred for alpha)
- `propose_owner` / `accept_ownership` — two-step ownership transfer
- `set_owner` — direct override (`#[deprecated]`); use the two-step path

### View methods

- `get_session_grant`, `list_session_grants`
- `get_scope_policy`
- `verify_session_grant`, `can_execute`, `can_play`, `can_publish`,
  `can_claim_gift`, `can_claim_trial`

---

## Build & test

```bash
rustup target add wasm32-unknown-unknown
cargo near build non-reproducible-wasm
cargo test
```
