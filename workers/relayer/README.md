# youtick relayer

Status: `LOCAL_TEST only / NOT_DEPLOYED`; V2 testnet deploy path: `.github/workflows/deploy-v2-testnet.yml` (`docs/v2-testnet-runbook.md`, Workers). Roadmap gate E5c, decision D7.

A Cloudflare Worker with its own NEAR account and key, separate from the Livepeer Bridge. It pays
gas and small amounts for NEAR Auth users so that sign-in and the invite credit need no wallet:

| Endpoint | Input | What it does |
|---|---|---|
| `POST /v1/accounts` | `{ id_token }` | Verifies the token. If the identity's fast-auth implicit account does not exist yet, sends `ACCOUNT_FUNDING_YOCTO` to it (this creates the account), then registers it with USDC (`storage_deposit`, `registration_only`). Once per identity. |
| `POST /v1/ckd` | `{ gate_account_id, args: { jwt, app_public_key: { pk1, pk2 } } }` | Calls `request_key` on a configured `ckd-gate` (rule a only) and returns the `on_ckd` value. The token's `nonce` must equal the gate binding for `pk1`/`pk2`. The response is encrypted to the browser's ephemeral key; the relayer cannot read it. |
| `POST /v1/invites/redeem` | `{ id_token, code }` | Pays the code's USDC credit from the relayer account with `ft_transfer` and records the account as an invited creator. A code works once, and an identity can redeem one code. |
| `POST /v1/purchases` | `{ access_token, args: { receiver_id, amount, msg }, nonce, max_block_height }` | A V2 crypto purchase approved on the NEAR Auth screen (E7b). The relayer **rebuilds** the only delegate it sponsors: the user's account calling USDC `ft_transfer_call` to `MARKET_V2_CONTRACT_ID` with a `buy_ticket_v2` message, 300 TGas and 1 yocto. It requires those bytes to equal the token's `fatxn`. It then gets the MPC signature from `fast-auth.sign` and checks it against the user's key before relaying it as a signed delegate. The delegate's nonce makes the purchase run at most once. Returns `{ purchaseId, state, txHash }`: `200` with `state: "submitted"` once the relay landed, `202` while `signing` or `relaying`. The client reads the result from `get_ticket`. |
| `POST /v1/purchases/status` | `{ purchase_id }` | Finishes or reads a purchase by the `purchaseId` returned above, without a token: the signing token outlives neither MPC signing nor the relay, and the user's nonce has moved once the relay landed. Same response shape; `404 purchase_not_found` for an unknown id. |
| `POST /v1/uploads` | `{ access_token, args: { receiver_id, amount, msg }, nonce, max_block_height }` | An upload fee payment approved on the NEAR Auth screen (E5b). Same pattern as purchases: the relayer rebuilds the user's account calling USDC `ft_transfer_call` to `MARKET_V2_CONTRACT_ID` with a plain `create_paid_job` message (protocol `upload_msg`: no sponsor quote, no playback session), 100 TGas and 1 yocto, and requires those bytes to equal the token's `fatxn`. Before signing it checks what the Market would refund or reject: the exact fee, purchases not paused, no public beta or public upload policy (`quote_required`), and no job under this id (`job_exists` when this creator's identical job is already authorized, `job_conflict` otherwise). Returns `{ uploadId, state, txHash }` like purchases. The client reads the result from `get_media_job`. |
| `POST /v1/upload-keys` | `{ access_token, args: { job_id, new_public_key, expires_at_ms }, nonce, max_block_height }` | `replace_upload_key` on Market V2 for a job this creator owns, when the per-job upload key was lost (E5b). Gas only: 100 TGas, no deposit. Refused unless the job exists, belongs to the creator and is still authorized (`job_not_found`, `job_conflict`, `job_published`). Same response shape and counters as uploads. |
| `POST /v1/uploads/status` | `{ upload_id }` | Finishes or reads an upload or upload-key relay by its `uploadId`, without a token. `404 upload_not_found` for an unknown id or a purchase id. |
| `POST /v1/devices` | `add_device_args`: `{ ticket_id, session_public_key, certificate_sha256, device_epoch, expires_at_ms, signature }` | Links or renews a playback device on a V2 ticket (decision O12). No token: the ticket key's `add_device` signature is the proof, and the relayer learns the ticket id, never the holder's account. The relayer sends Market V2 `add_device` from **its own account** (30 TGas, no deposit), the only Market method it calls directly. Answers `200 { deviceRequestId, state: "submitted", txHash, evicts_session_public_key? }` once the transaction succeeded (`evicts_session_public_key` when a fourth device replaces the oldest), `200 { state: "listed" }` with no transaction when the device is already linked for more than seven days, and `202 { state: "pending" }` while it settles. Off (`503 devices_disabled`) unless `DAILY_DEVICE_LIMIT` and `TICKET_DAILY_DEVICE_LIMIT` are set. |
| `POST /v1/devices/status` | `{ device_request_id }` | Finishes or reads a device link by its `deviceRequestId`; `404 device_request_not_found` for an unknown or expired id. |
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
    and gas: purchases are not paused and no public testnet beta has ended, the publication is
    active and its price (at least 5 USDC) equals the amount, the ticket key is unused, both
    signatures expire between one minute and one hour from now, the device signature is by the
    ticket key and the VAT attestation is signed by `get_vat_public_key`. `msg` must be compact
    JSON exactly as `JSON.stringify` writes it, and signatures canonical base64: the Market
    refunds duplicate keys and non-zero trailing bits that a lenient parser would accept.
  - Uploads and upload-key replacements (E5b) use the same relay path with their own daily and
    per-identity caps (`DAILY_UPLOAD_LIMIT`, `IDENTITY_DAILY_UPLOAD_LIMIT`, one counter for both),
    and their own pre-checks against `get_media_job`, `get_public_upload_policy` and the fee
    formula. An upload relay is refunded by the Market once its upload key has expired, so a
    relay first sent that late is failed as `upload_key_expired` instead.
  - Limits: a daily cap and a per-identity cap, charged once per purchase in the same storage
    transaction that records it.
  - A purchase is recorded under the SHA-256 of its delegate bytes. The approval token is kept only
    until fast-auth has signed, then replaced by the verified MPC signature. The alarm finishes a
    purchase the client stopped asking about, fails one still unsigned after 10 minutes and
    deletes finished records after a day. An expired purchase keeps its sign transaction hash and
    is not started again with the same bytes, because an unseen signature may already be on
    chain; a new approval has new bytes and the same nonce, so only one of them can execute. A
    relay is not sent when the message signatures expire within 30 seconds. A guard that rejects
    the token ends the purchase as `approval_rejected` instead of repeating the same answer.
- **Device links.**
  - Checked before any gas, the way `add_device` checks them: canonical fields, a 43-44 character
    session key (the Bridge plays no other), a signature expiring between one minute and one hour
    from now, a ticket that is `purchased`, `watched`, `watched_in_escrow` or `released`, a
    publication that is not taken down, the ticket key's `add_device` signature for this network
    and Market, the current `device_epoch`, and a storage runway of at least 26,000 bytes (the
    Market asserts 25,000 after every call, renewals included). Errors: `device_invalid`,
    `ticket_not_found`, `ticket_not_playable`, `publication_unavailable`, `device_epoch_stale`,
    `signature_expired`, `storage_unavailable`.
  - A device already linked for more than seven days is answered `listed` without a transaction,
    also when its epoch has moved since (a retry after a link that evicted another device).
  - Limits: `TICKET_DAILY_DEVICE_LIMIT` per ticket and day for every link, and `DAILY_DEVICE_LIMIT`
    in total for links of a device not yet listed. Each is charged once per link, in the storage
    transaction that records it (`ticket_limit_reached`, `daily_limit_reached`).
    - Renewals are not charged against the daily total. Otherwise new links on many tickets could
      use it up and let devices expire. A renewed device is answered `listed` for the next 23 days,
      so renewals limit themselves to three per ticket in that time.
    - A `listed` answer is not charged.
    - The device variables are optional on purpose: without them only the device routes are off.
      Links already recorded still settle from the alarm.
  - A link is recorded under `sha256("device|ticket_id|session_public_key|certificate_sha256|device_epoch|expires_at_ms")`,
    without the signature (protocol rule 3), so repeated or concurrent requests send one
    transaction. Recovery is `check`: a transaction the chain does not know is signed again only
    while the ticket does not list the device as authorized since the request, and never after the
    signature has expired. A failed transaction is never sent again. The pre-check then runs once
    more to name the reason, or answers `listed` when another request linked the device; otherwise
    `502 device_add_failed`. The alarm finishes links the client stopped asking about and deletes
    records after a day.
  - The relayer account must hold no Market role (Bridge, platform, payment operator, admin); the
    call is pinned to `add_device` on `MARKET_V2_CONTRACT_ID`.
- **Verification.** id_tokens are checked with RS256 against the issuer's JWKS: issuer,
  audience/`azp`, expiry and `sub` limits. ckd-gate verifies the token again on chain.
- **RPC trust.** The browser must read the expected account from an RPC this relayer does not
  control (see `apps/web/lib/near-auth/ckd-sign-in.ts`).

## Not done here

- Deployed only to V2 testnet, through `deploy-v2-testnet.yml`; not run yet.
- The Bridge does not read the invite allowlist yet (E6).
- Old daily counters and replay markers are not cleaned up. The storage they use is small, but it
  grows.
- A `STUCK` invite needs an admin endpoint or runbook to resolve (later gate).
- Real NEAR Auth tokens, a testnet `ckd-gate`, and real USDC and MPC are EXTERNAL_NOT_RUN.
- Device links have not run against the testnet Market (EXTERNAL_NOT_RUN): the gas of the
  eviction case is unmeasured (30 TGas is an estimate), the release config does not set the two
  device limits yet, and whether the deployed Market carries `add_device` is unverified.

## Checks

```bash
cd workers/relayer
npm ci
npm test -- --run
npm run check
```
