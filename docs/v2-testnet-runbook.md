# V2 testnet runbook

Status: part 1 `PASS` on 2026-10-08 (run 37832347847); Workers `PREPARED / NOT_RUN`. This creates the separate V2 testnet environment (roadmap: E5
acceptance, decision D9). Nothing here touches the V1 public testnet pilot or mainnet.

The setup has three parts:

1. **NEAR accounts and contracts** (`.github/workflows/bootstrap-v2-testnet.yml`). Done: run
   37832347847, receipt `PASS`. The policy is single-use; do not run it again.
2. **Workers.** The relayer and payment service (`.github/workflows/deploy-v2-testnet.yml`, see
   [Workers](#workers)). A separate Bridge V2 environment (`MARKET_PROTOCOL=v2`) is a later
   milestone.
3. **Web configuration.** The ckd-gate is pinned in `CKD_TRUST_ROOTS` (#304). Setting the V2
   variables for a local run comes after the Workers.

## What the bootstrap creates

All accounts are direct children of the parent (`youtick-dev-v3.testnet`, the V1 testnet parent).

| Role | Keys | Contract |
|---|---|---|
| `market_v2` | owner full-access key | Market V2, `new` (purchases open, Bridge active) |
| `ckd_gate` | **none, ever** | ckd-gate, initialized for the shared NEAR Auth testnet client |
| `relayer` | full-access key (becomes `RELAYER_PRIVATE_KEY`) | — |
| `bridge_operator` | management full-access key, and a function-call key for Market V2 `finalize_livepeer_publication`, `suspend_livepeer_sales`, `mark_watched`, `release_expired` (becomes the Bridge V2 `NEAR_OPERATOR_PRIVATE_KEY`) | — |
| `payment_operator` | full-access key (card path, E8) | — |
| `tax` | full-access key | — |

A last transaction registers `market_v2`, `relayer` and `tax` with Circle's testnet USDC
(`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`). This is the only token Market
V2 accepts on testnet (`TESTNET_USDC` in `contracts/market-v2/src/lib.rs`). The `usdc.fakes.testnet`
name in the protocol golden vectors is signing context only.

Market V2 takes its admin and guardian from the V1 governance accounts. It also needs two signing
keys:

- **Quote key.** Used for upload quotes.
- **VAT key.** Used by the VAT attestation service in E7. Only its public key goes on chain.

## Owner steps

These steps need the owner. They involve keys, secrets and on-chain writes.

1. **Wait for the code.** #275 (ckd-gate) and this PR must be on `main`.
2. **Generate keys on your own machine,** in a new directory outside the repository:
   ```bash
   node workers/livepeer-bridge/scripts/v2-testnet-keygen.mjs ~/youtick-v2-testnet-keys
   ```
   - It prints only public keys. Each private key is written to its own file, with mode 0600.
   - Never commit, paste or upload the private key files.
3. **Fill in `workers/livepeer-bridge/scripts/v2-testnet-bootstrap-policy.json`:**
   - Replace every `REPLACE_…` value with a public key from step 2. `quote_public_key_base64` is
     the printed `quote_base64`.
   - Set `wasm_sha256.market_v2` and `wasm_sha256.ckd_gate` from the `SHA256SUMS` file in the
     `v2-contracts-<sha>` artifact of the latest successful `main` CI run.
   - Delete the `status` line. Validation refuses the file while it is still there.
4. **Merge the policy through a PR.** Changing this file runs the contract jobs, so the merge
   commit gets its own attested `v2-contracts-<sha>` artifact.
   - The bootstrap needs `wasm_sha256` to match those bytes. If the hashes differ, update the
     policy and merge again.
5. **Create the GitHub environment.**
   - Create `v2-testnet` with at least one required reviewer.
   - Add the secret `V2_TESTNET_BOOTSTRAP_PARENT_PRIVATE_KEY`: the parent's key matching
     `parent.public_key`.
6. **Fund the parent.** The planned transfers total about 15.7 NEAR plus fees. `max_parent_debit`
   is 20 NEAR.
7. **Run the workflow.** Start *V2 Testnet NEAR Bootstrap* on `main` with:
   - `sha`: the current main commit;
   - `ci_run_id`: the main CI run for that commit;
   - `policy_sha256`: `sha256sum` of the policy file;
   - `confirmation`: `CREATE_V2_TESTNET`.

   Then approve the environment.
8. **Check the result.** The workflow uploads `v2-testnet-bootstrap-receipt-<run>`, which must
   show `PASS`. Status `AMBIGUOUS` or `FAILED_RECONCILE_REQUIRED` means: do not rerun. Reconcile
   from the published plan's transaction hashes first.

## After a PASS

Each of these is its own gate, done by Claude Code unless marked.

- **Pin the gate.** Done in #304: `v2-ckd-gate-261007.youtick-dev-v3.testnet` with the
  `v1.signer-prod.testnet` domain 2 key.
- **Deploy the relayer and payment service.** See [Workers](#workers).
- **Deploy the Bridge on Market V2.** See [Bridge](#bridge).
- **Owner:** send a little NEAR and Circle testnet USDC (from Circle's testnet faucet) to the
  relayer account, for gas and invite credits.
- **Local acceptance.** The shared NEAR Auth testnet client only allows `http://localhost:3000`,
  so run `apps/web` there with the V2 variables (`apps/web/README.md`).
  - Purchases need E7 (checkout and the VAT service).

## Workers

`.github/workflows/deploy-v2-testnet.yml` deploys two Workers from the exact `main` commit. The
release logic is `scripts/v2-testnet-release.mjs`.

| Worker | Domain |
|---|---|
| `youtick-relayer-v2-testnet` | `relayer-v2-testnet.youtick.net` |
| `youtick-payment-service-v2-testnet` | `pay-v2-testnet.youtick.net` |

What the workflow does:
- **Prepare job** (no secrets):
  - builds both Workers with `wrangler deploy --dry-run`;
  - writes the deployed `wrangler.toml`: entry `index.js`, `workers_dev` and preview URLs off, and
    no `NEAR_RPC_URL` var;
  - dry-runs the exact deploy command;
  - attests the files.
- **Deploy job** (environment `v2-testnet`):
  - verifies the attestations and checksums;
  - checks on chain that the relayer key is a full-access key of `v2-relayer-261007` and that the
    VAT key equals Market V2 `get_vat_public_key({ key_version: 1 })`;
  - deploys each Worker with `--domain`;
  - runs a smoke test and writes `v2-testnet-workers-receipt-<run>`.
- **Modes:**
  - `closed`: every route answers 503.
  - `acceptance`: both Workers accept only `http://localhost:3000`.
- **Public vars** (fixed in the script): the V2 accounts, the pinned gate and the shared NEAR Auth
  testnet client.
- **Smoke test:** a CORS preflight from the allowed origin, a refused foreign origin, and for the
  payment service an unknown publication that must return 404 (this proves the RPC works and the
  VAT key is registered).
- **No rollback.** A failed smoke marks the receipt `FAILED` and leaves the new version live. Deploy
  `closed` to shut both Workers.

### Owner steps

1. **Add the environment secrets.** Add these to GitHub environment `v2-testnet`. Pipe each value
   so it is never printed:
   ```bash
   jq -r .private_key ~/youtick-v2-testnet-keys/relayer.json | gh secret set V2_RELAYER_PRIVATE_KEY --env v2-testnet --repo 4rmus/youtick
   jq -r .private_key ~/youtick-v2-testnet-keys/vat.json | gh secret set V2_VAT_SIGNER_PRIVATE_KEY --env v2-testnet --repo 4rmus/youtick
   openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n' | gh secret set V2_RELAYER_ADMIN_TOKEN --env v2-testnet --repo 4rmus/youtick
   ```
   Then add these three in the GitHub UI:
   - `V2_CLOUDFLARE_ACCOUNT_ID`;
   - `V2_CLOUDFLARE_API_TOKEN`: Workers Scripts edit, Workers Custom Domains (or Routes) and DNS
     edit on `youtick.net`, and since W3 **D1 edit** (the deploy job applies the read-model
     migrations; without it the job stops with Cloudflare error 7403 before any Worker is touched);
   - `V2_NEAR_RPC_URL`: a dedicated HTTPS testnet RPC, not `rpc.testnet.near.org`.

   Keep a copy of the admin token offline. It is needed for `POST /internal/invites`.
2. **Fund the relayer.** Send Circle testnet USDC from the faucet to
   `v2-relayer-261007.youtick-dev-v3.testnet`. It already has 5 NEAR for gas.
3. **Run the workflow.** Start *V2 Testnet Workers* on `main` with these inputs, then approve the
   environment:
   - `sha` and `ci_run_id`: the current main commit and its CI run;
   - `mode`: `acceptance`, or `closed` to shut both Workers;
   - `confirmation`: `DEPLOY_V2_TESTNET_<mode>`.

## Bridge

`.github/workflows/deploy-v2-testnet-bridge.yml` deploys the Livepeer Bridge on Market V2 from the
exact `main` commit, separately from the relayer and payment service. The release logic is
`scripts/v2-testnet-bridge-release.mjs`.

| Worker | Domain |
|---|---|
| `youtick-livepeer-bridge-v2-testnet` | `bridge-v2-testnet.youtick.net` |

What differs from the Workers release:
- **Deployed config.** The repository `wrangler.toml` without the V1 Queue, DLQ and read-model D1
  bindings, with its own rate-limit namespace (`6003`), and with the fixed V2 values written into
  `[vars]`:
  - `MARKET_PROTOCOL=v2`, `VIDEO_ENVIRONMENT=v2-testnet`, `MARKET_CONTRACT_ID=v2-market-261007…`,
    `NEAR_OPERATOR_ACCOUNT_ID=v2-bridge-261007…`;
  - Livepeer project `youtick-paid-media-canary`, API token name `youtick-v2-testnet-bridge`, and
    the public half of the V2 signing key;
  - creator allowlist `ticks.testnet`, `soteri.testnet`, `utick.testnet` (wallet test accounts) plus
    the NEAR Auth creators in `NEAR_AUTH_CREATOR_ALLOWLIST` (one so far; see "NEAR Auth creators"
    below), a 20 USD monthly budget and a 2 USD reservation per job.
- **Always off in W2:** webhook Queue, D1 archives, sponsored uploads, V1 stateless playback,
  multi-asset payments and `MARKET_V2_RELEASE_ENABLED` (the 30-day `release_expired` job needs the
  V2 read model, milestone W3).
- **Modes:**
  - `closed`: the Bridge reports `DISABLED`.
  - `acceptance`: uploads (USDC or NEAR with a signed quote) for the allowlisted creators, webhooks,
    operator finalization and `/v3/playback-tokens` for `http://localhost:3000`.
- **Checks before Wrangler runs:** the JWT private key matches the committed public key; the
  operator key is the Bridge account's function-call key on chain for Market V2 with exactly
  `finalize_livepeer_publication`, `suspend_livepeer_sales`, `mark_watched` and `release_expired`;
  the quote key derives to the Market V2 quote key and `get_quote_key_version` is 1.
- **Smoke test:** `/__health` must come from the new version and name Market V2. In `acceptance`
  it must report uploads, control plane, playback and operator mutations ready and everything
  above off; `/v3/playback-tokens` must accept only the allowed origin and answer an empty body
  with 4xx, not 503.

### Owner steps

Done on 2026-10-12:
- In Livepeer project `youtick-paid-media-canary`: API key and signing key
  `youtick-v2-testnet-bridge`, and a webhook to
  `https://bridge-v2-testnet.youtick.net/v1/livepeer-webhooks` for `asset.ready`, `asset.failed`,
  `asset.updated` and `asset.deleted`. The Preview and public-testnet webhooks are unchanged.
- Environment `v2-testnet` secrets: `V2_LIVEPEER_API_KEY`, `V2_LIVEPEER_JWT_PRIVATE_KEY`,
  `V2_LIVEPEER_WEBHOOK_SECRET`, `V2_LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN`,
  `V2_BRIDGE_NEAR_OPERATOR_PRIVATE_KEY` (`bridge_operator.json`) and
  `V2_CREATOR_FEE_QUOTE_PRIVATE_KEY`. The last one is converted from `quote.json` by
  `workers/livepeer-bridge/scripts/v2-testnet-quote-key.mjs`, which refuses a key that does not
  match the Market V2 quote key.

To deploy, start *V2 Testnet Bridge* on `main` with the current commit, its CI run, a mode and
`confirmation` `DEPLOY_V2_TESTNET_BRIDGE_<mode>`, then approve the environment. To change the
allowlist or the signing key, change the script and deploy again.

### Webhook secret and tokens (lessons of 2026-10-13)

- The V2 webhook's signing secret cannot be revealed in the Livepeer dashboard (the *Reveal*
  button is disabled for it), and the value set at creation did not match the Bridge: every
  delivery answered `403 invalid_webhook_signature`, so no upload could be published. Set the
  secret through the API with a temporary Livepeer API key, write the same value to GitHub, and
  never type it anywhere else:

  ```bash
  NEW=$(openssl rand -hex 32); curl -s -o /dev/null -w "%{http_code}\n" -X PATCH https://livepeer.studio/api/webhook/f7a3992a-4f19-4716-8f86-2af1df7a016e -H "Authorization: Bearer $LP_KEY" -H 'Content-Type: application/json' -d "{\"sharedSecret\":\"$NEW\"}" && printf %s "$NEW" | gh secret set V2_LIVEPEER_WEBHOOK_SECRET --env v2-testnet; unset NEW
  ```

  The release preflight now reads the webhook with the Bridge's API key and refuses to deploy
  when `sharedSecret` differs from `LIVEPEER_WEBHOOK_SECRET` (`webhook_secret_mismatch`).
- Livepeer's dashboard *Resend* sends the stored delivery **without** a `Livepeer-Signature`
  header, so the Bridge always answers 403 to it; it proves nothing about the secret. To make
  Livepeer sign a fresh event for an asset, update the asset without changing it
  (`PATCH /api/asset/<id>` with its current `name`): the Bridge treats an `asset.updated` in the
  `ready` phase as readiness.
- Keep `V2_LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN` and `V2_RELAYER_ADMIN_TOKEN` in a password
  manager when you create them. GitHub never shows a secret again, and without the operator token
  the Bridge's job records (`/v1/operations/admission-status`) cannot be read; the token used in
  W2 was lost and must be rotated with `gh secret set ... --env v2-testnet` and a deploy.
- The V2 Bridge does not poll Livepeer on its own (`reconcileUpload` runs only in the public
  modes). A job whose webhooks were all refused stays `Authorized` on chain with its fee spent;
  the first NEAR Auth upload (`lp-ae49e444-daea-4fdf-a8fe-9d3bc8770360`, asset
  `b02da4cf-25f5-434b-987d-77918109e308`) ended that way and is left as is.

### NEAR Auth creators (E5b, decision D11)

A creator who signed in with Google or a passkey uploads from their implicit account: the fee
goes through the relayer (`POST /v1/uploads`, a plain `create_paid_job` with no sponsor quote),
and the Bridge admits the upload only if that account is in `LIVEPEER_CREATOR_ALLOWLIST`. The
list is static in this phase:

1. The creator redeems the invite code on `/invite`; the web shows the account id (64 hex
   characters).
2. Confirm it with the relayer: `GET /internal/invited-accounts/<account id>` with the admin
   token must report the invite as paid.
3. Add the account id to `NEAR_AUTH_CREATOR_ALLOWLIST` in `scripts/v2-testnet-bridge-release.mjs`
   (the test refuses anything but a 64-character hex id), merge the PR and deploy `acceptance`
   again. One deploy per added creator; a signed attestation from the relayer replaces this list
   after the Gala.

Sponsored uploads stay off: the V2 upload path needs no Bridge quote and no sponsor relay.

## Milestone W3: read model and `release_expired`

The *V2 Testnet Workers* workflow deploys a third Worker, the read model of Market V2, and the
*V2 Testnet Bridge* workflow binds the Bridge to its database and schedules the 30-day release.

| Worker | Domain |
|---|---|
| `youtick-market-read-model-v2-testnet` | `read-v2-testnet.youtick.net` |

What differs from the V1 read model:
- **Own D1 database** `youtick-market-read-model-v2-testnet`. Its id is the repository variable
  `V2_READ_MODEL_D1_ID`; both release scripts refuse the V1 testnet id and a missing variable, so
  **every Bridge deploy after W3 needs the variable set**.
- **Bundle and config.** Built with the Bridge's wrangler (`--cwd read-model`), as on the public
  testnet; the repository `read-model/wrangler.toml` is sanitized to `index.js`, the V2 database
  and the fixed vars: `VIDEO_ENVIRONMENT=v2-testnet`, `READ_MODEL_CONTRACT_ID` and
  `MARKET_CONTRACT_ID` = Market V2, `READ_MODEL_START_BLOCK_HEIGHT=272905000` (Market V2's first
  job, publication and ticket events of 2026-10-13 come after it; the bootstrap-only governance
  events before it are not indexed), `READ_MODEL_WEB_ORIGIN=http://localhost:3000` (the V2
  instance is the only one that accepts a plain-HTTP origin), one-minute cron, backfill off.
  `READ_MODEL_NEAR_RPC_URL` is the `V2_NEAR_RPC_URL` secret.
- **Scanner (W3.5).** `v2-testnet` reads only the blocks with Market V2 events, found through
  FastNEAR's transaction index, and moves the watermark over the blocks between them (details in
  `read-model/README.md`). The W3.4 linked scan of every block could not keep up: free neardata
  answers 30 blocks a minute and the chain makes about 100 (2026-10-14: 40 blocks in 3 minutes
  against 320, every run ending `neardata_unavailable`). Each run logs `escrow.matched`, which
  compares Market V2's escrow at the watermark with the purchased crypto tickets in D1; a mismatch
  means the index missed an event and the affected release waits.
- **Migrations** `read-model/d1/0001` to `0010` travel in the attested packet and the deploy job
  applies them with `wrangler d1 migrations apply --remote` before the Workers go out; wrangler
  skips the ones the database already records.
- **Modes.** `closed`: `READ_MODEL_ENABLED` and `READ_MODEL_INGESTION_ENABLED` off, health says
  `DISABLED`. `acceptance`: both on; the smoke test expects `/__health` to report `ENABLED`,
  `testnet`, Market V2, the start block and `ingestionEnabled: true`.
- **Bridge.** The Bridge release adds `[[d1_databases]] MARKET_READ_MODEL` (same database) and
  `[triggers] crons = ["*/15 * * * *"]`; `MARKET_V2_RELEASE_ENABLED` is now a mode flag (`true` in
  acceptance). Every 15 minutes the Bridge reads up to 25 purchased crypto tickets older than 30
  days whose publication is not taken down from `market_v2_tickets` and sends `release_expired`
  through the operator outbox. Nothing is due until 2026-11-12 at the earliest.

### Owner steps (W3)

1. **Create the database** (provider write; wrangler is signed in locally):
   ```bash
   cd workers/livepeer-bridge && npx wrangler d1 create youtick-market-read-model-v2-testnet
   ```
   Copy the `database_id` from the output.
2. **Record the id** as a repository variable (not a secret; it is not sensitive):
   ```bash
   gh variable set V2_READ_MODEL_D1_ID --repo 4rmus/youtick --body "<database_id>"
   ```
3. **Deploy the Workers:** *V2 Testnet Workers* on `main` in `acceptance` (same inputs as W1;
   the packet now lists three Workers and the D1 migrations run in the deploy job).
4. **Deploy the Bridge:** *V2 Testnet Bridge* on `main` in `acceptance`, so the Bridge gets the
   binding and the cron.
5. **Check:**
   - `https://read-v2-testnet.youtick.net/__health` → `stage: ENABLED`, `contractId` Market V2,
     `startBlockHeight: 272905000`, `ingestionEnabled: true`;
   - `https://read-v2-testnet.youtick.net/v1/publications` with `Origin: http://localhost:3000`
     → the `lp-bcc8f530…` publication once the scanner has passed block 272924271 (about two
     hours after the first run at 150 blocks a minute); until the first run commits a watermark
     the endpoint answers 503 `read_model_unavailable`;
   - the ticket row, from the owner's machine (remote D1 read, approval):
     ```bash
     cd read-model && npx wrangler d1 execute youtick-market-read-model-v2-testnet --remote --command "SELECT ticket_id, status, purchased_at_ms, settled_at_ms FROM market_v2_tickets"
     ```
     expected: one `watched` ticket of 2026-10-13;
   - Bridge logs: `market_v2_release_failed` must not appear; `market_v2_release_scheduled`
     appears only once a ticket is 30 days old.

## Refund rule (2026-10-14)

Owner decision 2026-10-10: USDC tickets follow the card provider's refund rule (technical
failure, content not as described, takedown; no change-of-mind refunds). Contract, protocol,
Bridge, read model and web follow it on `main` (`contracts/market-v2/README.md`, "Settlement").

- **Not on testnet yet.** The deployed Market V2 (`v2-market-261007.youtick-dev-v3.testnet`) still
  runs the earlier rule: a watch pays the creator, and the buyer refunds an unwatched ticket
  alone with `refund_unwatched`. Moving it needs a code upgrade through the self-upgrade path,
  which is an on-chain action and needs owner approval.
- **Both codes are safe for the consumers.** The Bridge plays `watched_in_escrow` tickets and
  releases them after 30 days. The read model treats a `ticket_watched` event without `settled`
  (earlier code) as settled and one with `settled: false` as still in escrow.
- **Earlier tickets after the upgrade.** Crypto tickets the earlier code settled stay `watched`:
  they play, and they are never refunded or released. Unwatched tickets keep their escrow and
  fall under the new rule.
- **Upgrade order.** Deploy the read model, then the Bridge and the web, then upgrade the
  contract. An old Bridge refuses `watched_in_escrow` tickets, and an old read model marks every
  watch as settled, so the release job would skip those tickets (recoverable: `release_expired`
  is open to anyone and D1 can be rebuilt).
- **Upgrade moment.** Freeze the Bridge first and execute the upgrade only when no
  `mark_watched` or `refund_unwatched` receipt is pending. The new code no longer has
  `on_creator_payout`, so a creator push that fails across the upgrade would not be credited. A
  pending refund callback still restores its ticket (`restore_status` absent means `purchased`).
- **Refund requests.** The web page signs a `refund_ticket` request (recipient: the buyer's own
  account, valid 7 days) and posts it with the buyer's description to the payment service inbox
  (`POST /v1/refund-requests`); without the inbox it falls back to an e-mail to
  `contact@youtick.net`. youtick replies within 72 hours. The page offers the request until day 27,
  so a decision fits in the 30-day window; it does not yet offer one for a taken-down ticket older
  than 27 days (the contract allows that refund; the buyer writes to youtick).
- **Operator tool.** `workers/payment-service/scripts/refunds.mjs` (`list`, `approve`, `decline`,
  `record`) runs on the owner's machine with `REFUND_ADMIN_TOKEN` in the environment. `approve`
  signs `refund_ticket` with `~/youtick-v2-testnet-keys/payment_operator.json`; that key never goes
  to Cloudflare or GitHub. Details: `workers/payment-service/README.md`.

### Owner steps (refund inbox)

1. Create the D1 database `youtick-payments-v2-testnet` in the Cloudflare account and set its id
   as the repository variable `V2_PAYMENTS_D1_ID` (the release refuses the all-zero placeholder
   and the V1 read-model id, and requires an id different from `V2_READ_MODEL_D1_ID`).
2. Generate a token of 32–256 characters from `[A-Za-z0-9_-]` (for example
   `openssl rand -hex 32`), store it in your password manager and add it as the `v2-testnet`
   environment secret `V2_REFUND_ADMIN_TOKEN`. It must differ from `V2_RELAYER_ADMIN_TOKEN`.
3. Run *V2 Testnet Workers* on the merged `main` commit. It applies
   `workers/payment-service/migrations` to the new database before deploying.
4. Check: `REFUND_ADMIN_TOKEN=… node workers/payment-service/scripts/refunds.mjs list` prints
   `No pending refund requests.`

### Refund acceptance, 2026-10-14 (PROVIDER, testnet)

Before the inbox existed; the request went through the e-mail fallback and the command line.

| Step | Evidence |
|---|---|
| Purchase on the upgraded Market V2 | ticket `7041fe9f…b9fa` (publication `lp-bcc8f530…`, buyer `37729f76…23d9`); escrow 0 → 5000000 |
| First play | `ticket_watched` with `settled: false`; status `watched_in_escrow`; escrow stays 5000000; creator, tax and platform balances unchanged |
| Refund request | web "Request a refund": `refund_ticket` signature valid ~168 h |
| Operator refund | `refund_ticket` tx `9DnzFAJjxjX2xsi6K3ZbESRUjp2RKxvLu45ntYAUzngf` by `v2-payments-261007…`; `ft_transfer` 5000000 and `ticket_refunded`; ticket `refunded`, 0 devices; escrow 0; buyer USDC 3558333 → 8558333 |

Contract upgrade the same evening (self-upgrade path, owner-signed): code hash
`Y3N2FUdLQYosZp8LSR7fYdGHAo15wvo3UEavBaSPrXz` = CI WASM sha256 `07f3ad22…b489` of `f0a73bf`; the
E5b ticket of 2026-10-13 stays `watched`. Not yet shown: `release_expired` on a watched ticket
(earliest 2026-11-13).

### Refund inbox acceptance, 2026-10-15 (PROVIDER, testnet)

| Step | Evidence |
|---|---|
| Inbox ready | #329 (`89b5737`); D1 `youtick-payments-v2-testnet` `9a8f4b05-325f-4348-bca4-e2357c9da9f5`; Workers runs 38630374991 (migration `0001` applied) and 38633161197 (new `V2_REFUND_ADMIN_TOKEN`), both PASS |
| Operator tool | `refunds.mjs list` printed `No pending refund requests.` with the owner's admin token |
| Purchase and play | local web `89b5737`; ticket `823ad1ac…e555`, `watched_in_escrow`, escrow 5000000 |
| Request | "Request a refund" posted to the inbox; `list` showed it |
| Approve | `refunds.mjs approve` with the payment operator key file, confirmed with `REFUND`; tx `6rJYVE4DdAWj26fRA2Dw4RkDNzadRh2YqSvS7TQFKEDY` by `v2-payments-261007…`: `ft_transfer` 5000000 and `ticket_refunded`; ticket `refunded`, 0 devices, escrow 0, buyer USDC back to 8558333; the tool recorded the request as refunded |

The owner keeps the admin token and the payment operator key file backed up: without them no
refund can be listed or sent. `decline` was not run against the live inbox.


The bootstrap is covered by `workers/livepeer-bridge/scripts/v2-testnet-bootstrap.test.mjs`
against a simulated chain (LOCAL_TEST), and its workflow ran with `PASS` on testnet (PROVIDER).
The Workers release is covered by `scripts/v2-testnet-release.test.mjs` with a simulated chain,
Wrangler and Workers (LOCAL_TEST); its workflow ran with `PASS` on 2026-10-11 (PROVIDER). The
Bridge release is covered by `scripts/v2-testnet-bridge-release.test.mjs` in the same way
(LOCAL_TEST); its workflow ran with `PASS` on 2026-10-12 (PROVIDER). A workflow `PASS` counts
as PROVIDER (testnet) evidence only. It is never mainnet evidence.

### E5b acceptance, 2026-10-13 (PROVIDER, testnet)

Run from `http://localhost:3000` (docs/testing.md, "Local run against the V2 testnet") with
the relayer at `938e706`, the Bridge at `c463f04` and Market V2 `v2-market-261007…`:

| Step | Evidence |
|---|---|
| Google creator (`37729f76…c23d9`) pays the upload fee | relayer `/v1/uploads` 200 at 18:07:21 UTC; USDC 5.1 → 4.6; job `lp-bcc8f530-a21d-4413-9812-8a544306ab82` `Authorized` with `fee_quote_hash: null` |
| Livepeer processes the 17 MB AV1 source | asset `c8337aa2-2d13-4d12-91bc-7d0f905dcde5`, `asset.ready` at 18:11:30; every V2 webhook delivery 2xx |
| Bridge publishes | operator key nonce +1; `get_publication` `ACTIVE`, playback `c8336t5rvxsr5dl3`, `published_at_ms` 1791915092282 (18:11:32) |
| Passkey buyer (`9db6cbd9…d21a`) buys the ticket | relayer `/v1/purchases` 200 at 18:47:37; USDC 21.4 → 16.4 |
| First play settles the escrow | operator key nonce +1 (`mark_watched`); creator USDC 4.6 → 8.558333, exactly the protocol split of a 5 USDC gross ticket (VAT 0.833334, platform 0.208333, creator 3.958333) |

Not covered by this walk: the upload resume after a closed tab, a refund, the 30-day release,
and anything on Preview, Production or mainnet. The first upload of the day
(`lp-ae49e444…`) is the stranded job described under "Webhook secret and tokens".

### W3 deploy, 2026-10-13 (PROVIDER, testnet)

| Step | Evidence |
|---|---|
| D1 created and recorded | `youtick-market-read-model-v2-testnet` (`66b1c905…`), repository variable set 19:36 UTC |
| Two Workers runs fail before any deploy | runs 38461890976 and 38463105753: `wrangler d1 migrations apply` → `code: 7403`; the V2 API token had no D1 permission (D1 edit added to the token, no secret change) |
| Workers run 38474775574 `PASS` (22:03 UTC) | migrations 0001–0010 applied; relayer `085a8378`, payment service `b76b0918`, read model `d8dc8dc6` with the `MARKET_READ_MODEL` binding and `schedule: * * * * *` |
| Read-model health | `/__health` → `ENABLED`, `testnet`, Market V2, `startBlockHeight 272905000`, `ingestionEnabled true` |
| First scan | not observed: the cron never fired in the first 32 minutes (no Cron Events, 0 subrequests) during the Cloudflare incident "Cron Trigger Activation Issues" (`cbvocc87nsne`, open since 15:18 UTC; new or modified schedules do not run). `/v1/publications` stayed 503 `read_model_unavailable` |
| Bridge acceptance deploy | not run yet (its new `*/15` cron would meet the same incident) |

Open after this walk: the first watermark and the `lp-bcc8f530…` publication in `/v1/publications`,
the `watched` ticket row, the Bridge binding and cron, and the 30-day release (earliest
2026-11-12).
