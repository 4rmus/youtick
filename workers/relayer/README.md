# youtick relayer

Status: `LOCAL_TEST only / NOT_DEPLOYED`. Roadmap gate E5c, decision D7.

A Cloudflare Worker with its own NEAR account and key, separate from the Livepeer Bridge. It pays
gas and small amounts for NEAR Auth users so that sign-in and the invite credit need no wallet:

| Endpoint | Input | What it does |
|---|---|---|
| `POST /v1/accounts` | `{ id_token }` | Verifies the token. If the identity's fast-auth implicit account does not exist yet, sends `ACCOUNT_FUNDING_YOCTO` to it (this creates the account), then registers it with USDC (`storage_deposit`, `registration_only`). Once per identity. |
| `POST /v1/ckd` | `{ gate_account_id, args: { jwt, app_public_key: { pk1, pk2 } } }` | Calls `request_key` on a configured `ckd-gate` (rule a only) and returns the `on_ckd` value. The token's `nonce` must equal the gate binding for `pk1`/`pk2`. The response is encrypted to the browser's ephemeral key; the relayer cannot read it. |
| `POST /v1/invites/redeem` | `{ id_token, code }` | Pays the code's USDC credit from the relayer account with `ft_transfer` and records the account as an invited creator. A code works once, and an identity can redeem one code. |
| `POST /v1/purchases` | `{ access_token, args: { receiver_id, amount, msg }, nonce, max_block_height }` | A V2 crypto purchase approved on the NEAR Auth screen (E7b). The relayer **rebuilds** the only delegate it sponsors: the user's account calling USDC `ft_transfer_call` to `MARKET_V2_CONTRACT_ID` with a `buy_ticket_v2` message, 300 TGas and 1 yocto. It requires those bytes to equal the token's `fatxn`. It then gets the MPC signature from `fast-auth.sign` and checks it against the user's key before relaying it as a signed delegate. The delegate's nonce makes the purchase run at most once. Returns `{ purchaseId, state, txHash }`: `200` with `state: "submitted"` once the relay landed, `202` while `signing` or `relaying`. The client reads the result from `get_ticket`. |
| `POST /v1/purchases/status` | `{ purchase_id }` | Finishes or reads a purchase by the `purchaseId` returned above, without a token: the signing token outlives neither MPC signing nor the relay, and the user's nonce has moved once the relay landed. Same response shape; `404 purchase_not_found` for an unknown id. |
| `POST /internal/invites` | `{ amount_usdc_micro }`, admin bearer token | Creates a code. The code is returned once; only its SHA-256 is stored. |
| `GET /internal/invited-accounts/<account>` | admin bearer token | `{ invited }`, for the Bridge upload allowlist (E6). |

`/v1/*` accepts only `ALLOWED_ORIGINS`. Everything is off unless `RELAYER_ENABLED=true`, and
nothing is signed unless `RELAYER_MUTATIONS_ENABLED=true`.

## Safety

- **Key (D7).** The relayer account holds a full-access key, because it sends transfers. Keep its
  balance low and top it up in small steps. It is a different account from the Bridge operator,
  which can move escrow.
- **Limits.**
  - Daily caps, all in configuration: new accounts, CKD requests overall and per identity, and
    invite USDC.
  - The storage deposit is capped (`MAX_STORAGE_DEPOSIT_YOCTO`).
  - Invite amounts come from a fixed list.
- **Identity.** Records use `sha256("youtick-relayer-identity|iss|sub")`, never the raw subject.
  - A CKD transaction contains the id_token, so it is kept only until it settles.
  - After that, only a replay marker for its nonce stays.
- **Outbox.** All transactions go through one Durable Object (`RelayerControl`).
  - Reserving the nonce, signing and broadcasting happen under one lock, and the signed
    transaction is saved before it is sent.
  - Afterwards a record changes only on evidence:
    - a final status from `tx`;
    - a resend rejected because the block hash expired;
    - or, per operation, `UNKNOWN_TRANSACTION` after the key's nonce has passed and the 3-minute
      landing window is over.
  - Any other RPC error or timeout is `unknown` and is never read as "did not happen".
  - **Recovery per operation:**
    - CKD requests are signed again; that costs only gas.
    - Account funding and USDC registration are signed again only if the chain shows the effect is
      missing.
    - An invite `ft_transfer` is never signed a second time. It becomes `STUCK`
      (`tx_needs_review`) until someone checks the chain.
  - A code goes back to `open` only after a final on-chain `Failure` of its own transaction.
- **CKD records.** A CKD transaction contains the id_token, so its record is replaced by a replay
  marker once it settles or fails. An alarm strips the signed transaction from records older than
  10 minutes.
- **Rate limit.** `RELAYER_RATE_LIMITER` limits `/v1/*` per IP. The daily caps alone could still
  be used up by throwaway identities.
- **Purchases.**
  - Before any gas is spent, the relayer checks the token's audience (the fast-auth guard), `azp`,
    the exact bytes, the delegate nonce (above the key's, below `block_height × 1e6`, within u64)
    and expiry (at most 1,200 blocks), and the user's USDC balance.
  - It also checks what Market V2 would refund, so failed purchases cannot drain the shared limit
    and gas: the publication is active and its price equals the amount, the ticket key is unused,
    both signatures expire between one minute and one hour from now, the device signature is by
    the ticket key and the VAT attestation is signed by `get_vat_public_key`.
  - Limits: a daily cap and a per-identity cap, charged once per purchase in the same storage
    transaction that records it.
  - A purchase is recorded under the SHA-256 of its delegate bytes. The approval token is kept only
    until fast-auth has signed, then replaced by the verified MPC signature. The alarm finishes a
    purchase the client stopped asking about, fails one still unsigned after 10 minutes (a new
    approval may start it again) and deletes finished records after a day. A guard that rejects
    the token ends the purchase as `approval_rejected` instead of repeating the same answer.
- **Verification.** id_tokens are checked with RS256 against the issuer's JWKS: issuer,
  audience/`azp`, expiry and `sub` limits. ckd-gate verifies the token again on chain.
- **RPC trust.** The browser must read the expected account from an RPC this relayer does not
  control (see `apps/web/lib/near-auth/ckd-sign-in.ts`).

## Not done here

- No deploy workflow, no account and no secrets.
- The Bridge does not read the invite allowlist yet (E6).
- Old daily counters and replay markers are not cleaned up. The storage they use is small, but it
  grows.
- A `STUCK` invite needs an admin endpoint or runbook to resolve (later gate).
- Real NEAR Auth tokens, a testnet `ckd-gate`, and real USDC and MPC are EXTERNAL_NOT_RUN.

## Checks

```bash
cd workers/relayer
npm ci
npm test -- --run
npm run check
```
