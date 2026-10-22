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
| `bridge_operator` | management full-access key, and a function-call key for Market V2 `finalize_livepeer_publication`, `suspend_livepeer_sales`, `mark_watched`, `release_expired` (becomes the Bridge V2 `NEAR_OPERATOR_PRIVATE_KEY`; the first two become `finalize_publication`, `suspend_sales` at the [MC cutover](#mc-cutover-provider-neutral-market-v2-names)) | — |
| `payment_operator` | full-access key (bootstrap; signs `refund_ticket` from the owner's machine), and a function-call key for Market V2 `issue_card_ticket`, `void_card_ticket` (`ed25519:CcjcZpiL…`, added 2026-10-15 after gate E8.0; becomes the payment service `PAYMENT_OPERATOR_PRIVATE_KEY`) | — |
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
- **Public vars** (fixed in the script):
  - the V2 accounts, the pinned gate and the shared NEAR Auth testnet client;
  - the device-link limits (decision O12): `DAILY_DEVICE_LIMIT=1000` and
    `TICKET_DAILY_DEVICE_LIMIT=6`. Without them the relayer's `/v1/devices` routes answer
    `devices_disabled`.
- **Smoke test:**
  - a CORS preflight from the allowed origin, and a refused foreign origin;
  - for the relayer, an unknown device-link id must return 404 `device_request_not_found`
    (this proves the device routes are on; nothing is signed);
  - for the payment service, an unknown publication must return 404 (this proves the RPC works
    and the VAT key is registered).
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

    > Superseded (2026-10-22, OD19): the V2 release writes these Studio values empty and the Stream
    constants instead; see "Stream cutover inputs (M2)".
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
- **Checks before Wrangler runs:** the JWT private key matches the committed public key
  (Superseded (2026-10-22, OD19): no Studio JWT key on V2; with `stream_enabled=true` the Stream
  RS256 key must derive `STREAM_SIGNING_PUBLIC_KEY` instead); the operator key is the Bridge account's function-call key on chain for Market V2 with exactly
  `finalize_publication`, `suspend_sales`, `mark_watched` and `release_expired` (since gate MC;
  before the [MC cutover](#mc-cutover-provider-neutral-market-v2-names) the key on chain still
  lists `finalize_livepeer_publication` and `suspend_livepeer_sales`, so a Bridge release from a
  post-MC commit stops with `operator_key_not_on_chain` until step 5 below);
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

> Superseded (2026-10-22, OD19): the V2 Bridge workflow no longer maps `V2_LIVEPEER_API_KEY`,
`V2_LIVEPEER_JWT_PRIVATE_KEY` or `V2_LIVEPEER_WEBHOOK_SECRET`; it maps `V2_STREAM_*` instead.
`V2_LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN` stays (it is the Bridge operator token).

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

  > Superseded (2026-10-22, OD19): the V2 release no longer reads the Studio webhook or needs
  `V2_LIVEPEER_WEBHOOK_SECRET`/`V2_LIVEPEER_API_KEY`; it checks the Stream webhook
  (`stream_webhook_*`, "Stream cutover inputs (M2)"). The two bullets above stay as history and
  for V1.
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

- **On testnet since 2026-10-14.** The deployed Market V2 (`v2-market-261007.youtick-dev-v3.testnet`)
  was moved to this rule through the self-upgrade path (owner-signed, see "Refund acceptance").
  Before that it ran the earlier rule: a watch paid the creator, and the buyer refunded an
  unwatched ticket alone with `refund_unwatched`.
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
  so a decision fits in the 30-day window. For a taken-down video the ticket shows "This video was
  removed" and "Get your money back" with no deadline and no description to write; the owner
  refunds those with `refunds.mjs approve-takedowns` (no review).
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

### Takedown refund acceptance, 2026-10-15 (PROVIDER, testnet)

| Step | Evidence |
|---|---|
| Upload | local web `19fba6d` (#331); creator `37729f76…` uploads `lp-eb0d11d0-8d41-48c5-9816-b3a5015f658d`, `ACTIVE` 11:35 UTC, fee 0.5 USDC (platform 1208333 → 1708333) |
| Purchase and play | ticket `20024216…2751`, `watched_in_escrow`, escrow 5000000 |
| Takedown | guardian `GOVERNANCE_DECISION` `acceptance-takedown-20261015` at 11:54; publication `TAKEDOWN`, ticket stays in escrow; the other publication `lp-bcc8f530…` stays `ACTIVE` |
| Request | web "Get your money back" (no deadline, no description) posted to the inbox |
| Approve | `refunds.mjs approve-takedowns`, one `REFUND` confirmation; tx `AK3bR79SPYy1BDEBgbc9khGqkaM8y8ZeCUqu4ZJwCbm4` by `v2-payments-261007…`: `ft_transfer` 5000000 and `ticket_refunded`; ticket `refunded`, 0 devices, escrow 0; buyer USDC 3058333 → 8058333; creator and tax balances unchanged |

### E8.0 upgrade and card operator key, 2026-10-15 (PROVIDER, testnet)

Owner-signed; command sheet kept outside the repository. The card path stays off.

| Step | Evidence |
|---|---|
| Artifact | main CI run 38746374767 (`647f2bb`, #333); `SHA256SUMS` and `gh attestation verify` (`ci.yml@refs/heads/main`); `youtick_market_v2.wasm` sha256 `f64a5d37f86a71c4cab6e6fd394b8127a387c23bddea91c7f185d9d010161c3d`, 502746 bytes |
| Freeze | guardian `freeze_bridge` 15:37 UTC → `bridge_frozen: true` (block 273203714); escrow 0 |
| Propose | admin `propose_code_upgrade` → pending `f64a5d37…1c3d`, timelock 0 (block 273204527) |
| Execute | `execute_code_upgrade` signed by `youtick-dev-v3.testnet` (the admin's 0.19 NEAR does not cover the call); code sha256 `f64a5d37…1c3d`, hash `HaR4aT4zVJwvjcY1SfnrsRzUwgp2oW3oBUDRhZLmdvM2`; no pending upgrade; governance state unchanged; storage 509007 → 509408 bytes; reserve headroom 0.80592 NEAR, `reserve_covered: true` |
| Unfreeze | admin `request_bridge_unfreeze` + `unfreeze_bridge` → `bridge_frozen: false` (block 273205472) |
| Card operator key | `add-key` on `v2-payments-261007…` signed with its full-access key: `ed25519:CcjcZpiL1eHCdZYLJbCJWFeSpyDpXWZmM8XpdKAZZmmy`, `FunctionCall` to `v2-market-261007…`, methods `issue_card_ticket`, `void_card_ticket`, allowance 1 NEAR (block 273208028). The owner keeps the key file as `~/youtick-v2-testnet-keys/payment_operator_card_fc.json`; it becomes `PAYMENT_OPERATOR_PRIVATE_KEY` only when the card path is enabled (E8.3) |

Not yet shown: an `issue_card_ticket` or `void_card_ticket` call on the new code, and the payment
service reading a real `reserve_exhausted` RPC failure.

## MC cutover: provider-neutral Market V2 names

Status: `PREPARED / NOT_RUN` (2026-10-22). Owner decision OD6 renames the Market V2 surface (gate
MC): profile id `paid-media-livepeer-v1` → `paid-media-v1`; `finalize_livepeer_publication` →
`finalize_publication`; `suspend_livepeer_sales` → `suspend_sales`; `takedown_livepeer_publication`
→ `takedown_publication`; `LivepeerPublicationSubmission` → `PublicationSubmission`. Storage
prefixes, the Borsh layout and `MARKET_STATE_VERSION` (3) are unchanged, so this is a same-layout
upgrade: `migrate` only clears the pending record (sandbox test
`self_upgrade_reverts_a_failed_migrate_then_deploys_the_proposed_code`, LOCAL_TEST).

**Precondition (satisfied by gate M2-G0 once it is merged):** the Bridge renames its outbox
methods and profile checks. A Bridge built before M2-G0 calls `finalize_livepeer_publication` and
`suspend_livepeer_sales` and checks `paid-media-livepeer-v1`; against the upgraded Market every
finalize and suspension would fail. The commit deployed in step 7 must therefore contain M2-G0.
The Bridge instance is the media-account one (owner decision 2026-10-22, after milestone M1.5,
gate M1.5-G3, with fresh Durable Object state); it moves to that account before the cutover from a post-MC `main` commit that predates M2-G0 (the Bridge code still signs the legacy method names; the release preflight accepts the legacy operator-key set during the transition, `OPERATOR_KEY_SET=any`, see "Media account (2026-10-22)"), and only step 7 deploys the M2-G0 commit to it. An M2-G0 Bridge started before
step 5 fails its preflight with `operator_key_not_on_chain` and, at runtime, with
`runtime_not_configured`. The pre-MC publications keep playing because the M2-G0 Bridge accepts
both profile ids on stored publications (the contract never rewrites a stored `profile_id`).

Bridge lockstep as implemented in M2-G0 (`workers/livepeer-bridge/src/index.ts`, keyed on
`isMarketV2(env)`; V1 keeps every V1 name; LOCAL_TEST only, no provider or testnet run):
- Profile id: new upload intents and `/internal/finalize` submissions accept only
  `marketProfileId(env)` (`paid-media-v1` on V2). `/v2/playback-tokens` accepts both ids on V2;
  `/v3/playback-tokens` never checked the profile id. The public-testnet policy reads, the V1
  sponsored request parser, the control-envelope domain `youtick.paid-media-livepeer-v1.control`
  and the JSON-RPC ids keep the V1 strings.
- Method names: `finalizeMethod(env)` / `suspendMethod(env)` sign `finalize_publication` /
  `suspend_sales` on V2; the operator key check requires exactly `finalize_publication`,
  `suspend_sales`, `mark_watched`, `release_expired`. Stored records of either generation stay
  valid for `operator-outbox-status` and the archive (`operator-outbox-archive.ts`, D1 `0011`).
- Sponsored and compact quotes: the V2 Bridge fails closed (`runtime_not_configured`); it never
  quotes or relays a compact upload, so no compact vector with the new id ships in this gate.
- Durable Object state under the old id (defensive; the media-account Bridge starts empty): an
  unpublished job (`AUTHORIZED`, `LEASED`, `PROVIDER_CREATE_PENDING`, `UPLOAD_READY`,
  `UPLOADING`, `PROCESSING`) becomes `UPLOAD_EXPIRED` on its next alarm or provider event; an
  `AUTHORIZED` job has no provider asset, so it is expired only when an alarm fires. A job
  holding a publication (`READY_VERIFIED`, `FINALIZE_QUEUED`, `FINALIZE_RETRY`) is never
  forwarded for finalization and never re-verified with the provider: it becomes
  `ONCHAIN_PUBLISHED` if that publication is final on chain, otherwise `UPLOAD_EXPIRED`.
  `CREATE_PENDING` and `CREATE_AMBIGUOUS` jobs are left untouched (`JOB_STATE_TRANSITIONS` has no
  `UPLOAD_EXPIRED` edge from them): no retry loop and no finalize; their admission reservation
  expires on its own. `ONCHAIN_PUBLISHED` jobs stay and keep reconciling. A confirmed
  `suspend_livepeer_sales` / `finalize_livepeer_publication` operator record is reported as done;
  an unconfirmed suspension is re-signed as `suspend_sales`; an unconfirmed legacy finalization
  returns `outbox_conflict`.

**Do not deploy post-MC `main` to V2 testnet before the cutover.** A *V2 Testnet Workers* run
would ship a relayer that sends `paid-media-v1` to the old contract (every upload refused and
refunded), and a *V2 Testnet Bridge* run stops at `operator_key_not_on_chain`. Until the cutover
a hotfix waits, or is deployed from a pre-MC commit with the fix cherry-picked onto it.

Exception for the move (M1.5-G3): the Bridge and the read model may be deployed from a post-MC `main` commit that predates M2-G0, because the Bridge release preflight accepts the legacy operator-key set during the transition. The *V2 Testnet Workers* run of that move also redeploys the relayer with `paid-media-v1`, so V2 uploads are refused (fee returned by the relayer) from that run until the cutover completes: schedule the move and the cutover back to back.

The bootstrap is single-use and is never re-run.
`workers/livepeer-bridge/scripts/v2-testnet-bootstrap-policy.json` is now a template for a fresh
environment with the new method names, not the executed policy: the 2026-10-08 run used the file
as merged in #303 (`9592674`, sha256
`1607887c0af91217abc09ac8c0aa809d11da4fdca9504ddb6f44537646db4a96`).

Migration `0011` lives in the shared `read-model/d1` directory, so the Preview and V1 read-model
databases also apply it on their next release. That is harmless: it keeps every row and still
accepts the V1 method names their Bridges write.

Order, each step with its approval class (project rules: NEAR transactions, deploys and
live-data writes need the owner):

| # | Step | Approval |
|---|---|---|
| 1 | Pick the merged `main` commit that holds MC and M2-G0. From its CI run take the V2 runtime artifact, check `SHA256SUMS` and `gh attestation verify` (`ci.yml@refs/heads/main`), and note the `youtick_market_v2.wasm` sha256. Also confirm that the rollback WASM is still retrievable: the E8.0 artifact of CI run 38746374767 (`647f2bb`), `youtick_market_v2.wasm` sha256 `f64a5d37f86a71c4cab6e6fd394b8127a387c23bddea91c7f185d9d010161c3d`, downloaded and hash-checked. Do not start if it has expired | none (read-only) |
| 2 | First require an empty operator outbox on the Bridge instance currently serving V2 testnet (after milestone M1.5 that is the media-account host; today `https://bridge-v2-testnet.youtick.net`): `GET /v1/operations/operator-outbox-status` with the Bridge operator bearer token (the `operator-outbox-status.yml` workflow targets Preview only) must show `confirmedRecords == totalRecords` (this implies `invalidRecords: 0`), so no record is `PENDING`, `RESERVED`, `SIGNED` or `BROADCAST`. An in-flight `mark_watched` also blocks and is merely conservative: a non-confirmed `mark_watched` / `release_expired` record counts as invalid there, and confirmed ones are deleted. The endpoint covers only the operator Durable Object, not the per-job Durable Objects holding `FINALIZE_QUEUED` / `FINALIZE_RETRY` jobs or their `outbox:<job>:suspend-sales` records, so also confirm that no upload is in flight (`/v1/operations/admission-status`). Then guardian `freeze_bridge`; check `bridge_frozen: true`. Every Bridge method (`finalize_*`, `suspend_*`, `mark_watched`, `release_expired`) now fails, so no first play settles during the window | NEAR transaction (owner-signed) |
| 3 | Admin `propose_code_upgrade { code_sha256 }` with the step 1 hash; testnet timelock 0 | NEAR transaction (owner-signed) |
| 4 | `execute_code_upgrade` with the raw WASM as input (as in E8.0, signed by `youtick-dev-v3.testnet` if the admin lacks NEAR). Check: code hash equals step 1, `get_pending_code_upgrade` is `null`, `get_governance_state` unchanged apart from the freeze, `get_publications_count` unchanged, `get_publication` of `lp-bcc8f530…` still `ACTIVE` | NEAR transaction (owner-signed) |
| 5 | On `v2-bridge-261007…`, signed with its management full-access key, one transaction with `DeleteKey ed25519:BDyHUFs1wbkaQJQ2Tq4AcyJWHanaC8j4spLQRwAKiYed` then `AddKey` of the same public key as `FunctionCall` to `v2-market-261007…` with `finalize_publication`, `suspend_sales`, `mark_watched`, `release_expired` and allowance 0.5 NEAR. Re-adding the same public key keeps `V2_BRIDGE_NEAR_OPERATOR_PRIVATE_KEY` unchanged (no secret write); the key's nonce restarts, and the Bridge reads it from chain | NEAR transaction (owner-signed) |
| 6 | *V2 Testnet Workers* on the step 1 commit (same `mode` and `card_path` as before). It applies D1 migration `0011_operator_outbox_neutral_methods.sql` to `youtick-market-read-model-v2-testnet` and deploys the relayer that sends and checks `paid-media-v1`. `0011` rebuilds `operator_outbox_archives` with every row kept and accepts both the old and the new method names; the V2 Bridge does not write that table (`OPERATOR_OUTBOX_ARCHIVE_ENABLED=false`) | deploy + D1 write (environment approval) |
| 7 | *V2 Testnet Bridge* on the step 1 commit in `acceptance`. The preflight now requires the step 5 key | deploy (environment approval) |
| 8 | Admin `request_bridge_unfreeze` + `unfreeze_bridge`; check `bridge_frozen: false` | NEAR transactions (owner-signed) |
| 9 | Acceptance: a new upload from the local web at the step 1 commit (job `profile_id` `paid-media-v1`), Bridge `finalize_publication`, purchase, first play (`mark_watched`); and playback of `lp-bcc8f530…` (stored V1 id) | testnet NEAR transactions and Livepeer writes (owner) |

Effects to expect:
- A job still `Authorized` under `paid-media-livepeer-v1` cannot be finalized. The contract
  would let its creator `restart_paid_job` it under `paid-media-v1`, but neither the web nor the
  relayer implements that call, and a NEAR Auth creator has no wallet to sign it. Such jobs are
  therefore abandoned (owner accepted for testnet content); their upload fee is not returned.
- Between steps 4 and 6 the deployed relayer still sends `paid-media-livepeer-v1`; the Market
  rejects it and the USDC transfer is returned. Keep the window short or run step 6 right after
  step 4.
- Rollback: the same steps 2-4 with the previous WASM (E8.0, sha256 `f64a5d37…1c3d`) and step 5
  with the old method names, then the previous Workers and Bridge commits. `0011` stays; it
  accepts both names.
- **Rollback is a one-way door after the first `paid-media-v1` finalize.** The rolled-back
  contract accepts only `paid-media-livepeer-v1`: a `paid-media-v1` job can no longer be
  finalized or restarted, and the pre-MC Bridge refuses to play publications stored under
  `paid-media-v1`. Roll back only before step 9's first finalize, or accept that those
  publications become unplayable.

Evidence today: LOCAL_TEST only (contract unit, integration and sandbox tests; protocol vectors;
relayer, web, read-model and release-script tests). No step above has run.

## Card path on testnet (E8.3)

The payment service's card path runs only in an `acceptance` release with `card_path: sandbox`
(*V2 Testnet Workers*). `off` (the default) keeps every card route at `503 card_path_disabled`.

- **What `sandbox` sets:** `CARD_PATH_ENABLED=true`, `PAYMENT_OPERATOR_ID=v2-payments-261007…`,
  `CLEENG_ENVIRONMENT=sandbox` and `CLEENG_PUBLISHER_ID=154746265` (the owner's Cleeng sandbox
  account, created 2026-10-15), plus four secrets.
- **Every release** ships the `CardOperator` Durable Object (migration `v1`) and a `*/5` cron; both
  do nothing while the card path is off. The payments D1 migrations (`0002_card_orders.sql`) are
  applied by the same idempotent step as the refund inbox.
- **Preflight:** the card key must be a function-call key of `v2-payments-261007…` for Market V2
  with exactly `issue_card_ticket` and `void_card_ticket`. A full-access key is refused.
- **Smoke:** an unsigned `POST /webhooks/card` must answer `401 invalid_webhook` with the card path
  on and `503 card_path_disabled` with it off.

### Owner steps (E8.3)

Each value goes from a file to GitHub; none is printed. All files live in `~/youtick-v2-testnet-keys`.

1. **Reference secret** (32 random bytes, never rotated while card orders are open):
   ```bash
   (umask 077 && openssl rand -hex 32 > ~/youtick-v2-testnet-keys/card_reference_secret)
   ```
2. **Register the webhook** (a Cleeng sandbox write; it returns the signing secret once):
   ```bash
   node workers/payment-service/scripts/cleeng-webhook.mjs register --token-file ~/youtick-v2-testnet-keys/cleeng_sandbox_publisher_token --secret-out ~/youtick-v2-testnet-keys/cleeng_sandbox_webhook_secret
   ```
   It subscribes `https://pay-v2-testnet.youtick.net/webhooks/card` to `transactionCreated` and
   `paymentRefunded`. Deliveries fail until the card path is deployed; nothing is sold before that.
3. **Environment secrets** (`v2-testnet`):
   ```bash
   jq -j .private_key ~/youtick-v2-testnet-keys/payment_operator_card_fc.json | gh secret set V2_PAYMENT_OPERATOR_CARD_PRIVATE_KEY --env v2-testnet --repo 4rmus/youtick
   tr -d '\n' < ~/youtick-v2-testnet-keys/card_reference_secret | gh secret set V2_CARD_REFERENCE_SECRET --env v2-testnet --repo 4rmus/youtick
   tr -d '\n' < ~/youtick-v2-testnet-keys/cleeng_sandbox_publisher_token | gh secret set V2_CLEENG_PUBLISHER_TOKEN --env v2-testnet --repo 4rmus/youtick
   tr -d '\n' < ~/youtick-v2-testnet-keys/cleeng_sandbox_webhook_secret | gh secret set V2_CLEENG_WEBHOOK_SECRET --env v2-testnet --repo 4rmus/youtick
   ```
4. **Deploy** *V2 Testnet Workers* on the merged `main` commit with `mode: acceptance`,
   `card_path: sandbox` and confirmation `DEPLOY_V2_TESTNET_acceptance`, then approve the
   environment. To turn the card path off again, deploy the same commit with `card_path: off`.
5. **Acceptance walk:** the local web (docs/testing.md) with `NEXT_PUBLIC_V2_CARD_RAIL=sandbox`; pay
   with Cleeng's sandbox test card; the ticket counts only when `get_ticket` shows it with rail
   `card`.


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

## Media account (2026-10-22)

Step M1.5 of the Cloudflare Stream migration moves the Bridge and the read model into a separate
Cloudflare account, the "media" account. Both then serve from that account's `workers.dev`
subdomain. The owner decided this on 2026-10-22 (OD2, OD14, OD16, OD17, OD18). The relayer, the
payment service and the payments D1 stay where they are, with the same specs and configs. For
the relayer and the payment service, the `write-config` output before and after this change is
byte-identical.

| Worker | Cloudflare account | Host |
|---|---|---|
| `youtick-relayer-v2-testnet` | default (`V2_CLOUDFLARE_*`) | `relayer-v2-testnet.youtick.net` (unchanged) |
| `youtick-payment-service-v2-testnet` | default (`V2_CLOUDFLARE_*`) | `pay-v2-testnet.youtick.net` (unchanged) |
| `youtick-market-read-model-v2-testnet` | media `6caaaf27c430b5da0ce18f68f35c1dcb` (`V2_MEDIA_CLOUDFLARE_*`) | `youtick-market-read-model-v2-testnet.<subdomain>.workers.dev` |
| `youtick-livepeer-bridge-v2-testnet` | media (`V2_MEDIA_CLOUDFLARE_*`) | `youtick-livepeer-bridge-v2-testnet.<subdomain>.workers.dev` |

D1 `youtick-market-read-model-v2-testnet` moves to the media account. D1
`youtick-payments-v2-testnet` stays in the default account. The web keeps its origin.
`ALLOWED_ORIGINS`, `READ_MODEL_WEB_ORIGIN` and `LIVEPEER_JWT_ISSUER` do not change.

What the release tooling does now:
- **Media account constant.** `MEDIA_ACCOUNT` in `scripts/v2-testnet-release.mjs` holds the account
  id and the workers.dev subdomain. The subdomain is `kocoinci` (registered on the media account, read from the dashboard on 2026-10-22; until then it was the sentinel `<register-on-the-media-account>`)
  until the owner registers one. Every path that needs a media host stops with
  `media_account_unconfigured`. In both workflows that is the `check` command in the prepare
  job's build step, with the summary step as a second guard. So before M1.5-G2, neither workflow
  reaches environment approval.
- **Read model.** The deployed config sets `workers_dev = true` and `preview_urls = false`, and there
  is no `--domain`. The read model deploys with `MEDIA_CLOUDFLARE_*`. Every release deploys all
  three Workers, so the release checks the media account and this pair before its chain preflight
  and before any Worker deploys. A missing pair stops it with `media_credentials_missing`; a pair
  for another account stops it with `cloudflare_account_not_media`. The default pair must not be
  the media account (`cloudflare_default_account_is_media`). The read-model D1 migrations run with
  `V2_MEDIA_CLOUDFLARE_*`. The payments D1 migrations still run with `V2_CLOUDFLARE_*`.
- **Bridge.** The deployed config sets `workers_dev = true`, and there is no `--domain`.
  `CLOUDFLARE_ACCOUNT_ID` must be the media account. The smoke test calls the workers.dev host.
  The Livepeer webhook URL must be exactly `https://<bridge host>/v1/livepeer-webhooks`, or the
  release stops with `webhook_binding_mismatch`. (Superseded (2026-10-22, OD19): the V2 release checks
  the Stream webhook `https://<bridge host>/v1/stream-webhooks` instead, failing
  `stream_webhook_binding_mismatch`.) The Bridge workflow no longer fingerprints
  `https://youtick.net`: the Bridge is no longer in the `youtick.net` zone, so it cannot affect
  the root origin. *V2 Testnet Workers* still fingerprints it.
- **Environment URL.** The prepare job derives the Bridge's environment URL with `bridgeHost()`
  and passes it to the deploy job as the output `health_url`. The workflow holds no literal host.
- **Workers releases are all-or-nothing.** *V2 Testnet Workers* always deploys all three Workers.
  Until M1.5-G2 is done, the relayer and the payment service cannot be released on their own.

### Owner steps (M1.5-G2)

1. **Register the workers.dev subdomain** on the media account (dashboard, Workers & Pages).
   If no subdomain exists, wrangler asks for one interactively. The CI jobs are non-interactive,
   so a deploy without a subdomain fails. Then put the subdomain in
   `MEDIA_ACCOUNT.workersSubdomain` (`scripts/v2-testnet-release.mjs`) with a one-line commit on
   the open M1.5 branch.
2. **Create the read-model D1 in the media account.** Wrangler must be signed in to that account:
   ```bash
   cd workers/livepeer-bridge && CLOUDFLARE_ACCOUNT_ID=6caaaf27c430b5da0ce18f68f35c1dcb npx wrangler d1 create youtick-market-read-model-v2-testnet
   ```
   Before recording the id, confirm that this id belongs to the media account, for example with
   `wrangler d1 info youtick-market-read-model-v2-testnet` and the media credentials. The release
   checks only the id's format and refuses the V1 id (`read_model_d1_is_v1`). It cannot tell
   which account an id belongs to. Then record the id:
   ```bash
   gh variable set V2_READ_MODEL_D1_ID --repo 4rmus/youtick --body "<database_id>"
   ```
   Both workflows read this variable, so afterwards the old account's read model and Bridge can no
   longer deploy from them.
3. **Create the API token** in the media account, with the same scopes as the current
   `V2_CLOUDFLARE_API_TOKEN` (OD18), D1 edit included.
4. **Add the environment secrets** to `v2-testnet`. The account id is not sensitive, but the
   workflows read it as a secret:
   ```bash
   printf %s 6caaaf27c430b5da0ce18f68f35c1dcb | gh secret set V2_MEDIA_CLOUDFLARE_ACCOUNT_ID --env v2-testnet --repo 4rmus/youtick
   ```
   Add `V2_MEDIA_CLOUDFLARE_API_TOKEN` in the GitHub UI.
5. **Check the media account's Workers plan** at deploy time. The two Workers need Durable
   Objects (SQLite), D1 and two cron triggers: the read model every minute and the Bridge every 15
   minutes.

### Cutover order (M1.5-G3)

> Superseded (2026-10-22, OD19): the Studio steps below (the webhook repoint in step 3 and the Studio-era Bridge
deploys in step 4) no longer apply to the V2 Bridge; the first media-account Bridge deploy is the M2
build together with the MC cutover ("Stream cutover inputs (M2)"). Steps 1, 2, 4.1 and 5 stand.

Order matters. The old Bridge's release compares the Studio webhook URL with
`bridge-v2-testnet.youtick.net`. Once the webhook is repointed, an old-Bridge deploy fails with
`webhook_binding_mismatch`. So shut the old Bridge and drain its outbox first. Then repoint the
webhook, and only then deploy into the media account.

1. **Shut the old Bridge.** The old Bridge in the default account and the new one sign with the
   same NEAR operator key. Both would run the `*/15` `release_expired` scan, and their operator
   outboxes would race for nonces. Deploy the old Bridge `closed` before this change reaches
   `main`: after the merge, the workflows only target the media account. Otherwise, remove the
   old Bridge's cron trigger in the dashboard. Also stop the old read model's cron. Delete
   nothing until M4 reaches `PASS`.
2. **Drain and check the operator outbox.** Step 2 of the MC cutover shows the check. Leave no
   upload in flight. The Bridge's Durable Object state does not move between accounts: upload jobs
   and the operator outbox start empty in the media account.
3. **Point the Studio V2 webhook** (`f7a3992a-…`, OD17) at
   `https://youtick-livepeer-bridge-v2-testnet.<subdomain>.workers.dev/v1/livepeer-webhooks`.
   Use the dashboard or the API. Keep the events and the signing secret. Then read the webhook
   back and check two things: `url` is the new one, and `sharedSecret` still equals
   `V2_LIVEPEER_WEBHOOK_SECRET`. From now on the old Bridge receives no deliveries.
   > Superseded (2026-10-22, OD19): the repoint was done on 2026-10-22, but the V2 release no longer
   compares the Studio webhook or its `sharedSecret`; the Studio V2 webhook is retired with the
   Stream-only Bridge.
4. **Deploy into the media account:**
   1. Run *V2 Testnet Workers*. The read-model D1 migrations `0001`–`0011` apply to the new, empty
      database, and the read model rescans Market V2 from block `272905000`
      (`READ_MODEL_START_BLOCK_HEIGHT`).
   2. Run *V2 Testnet Bridge* `closed`. (Superseded (2026-10-22, OD19): cancelled: the first
      media-account Bridge deploy is the M2 build.)
   3. (Superseded (2026-10-22, OD19): cancelled: the first media-account Bridge deploy is the M2 build;
      the read-model catch-up condition still applies to its `acceptance` run.) Run *V2 Testnet
      Bridge* `acceptance` only after the read model has caught up. Its
      `/__health` must show ingestion current. `acceptance` turns on `MARKET_V2_RELEASE_ENABLED`,
      and the 30-day `release_expired` scan reads the read model's `market_v2_tickets`. The first
      release is possible on 2026-11-12. What the scan does against an incomplete read model is
      UNPROVEN.
   4. Set `NEXT_PUBLIC_LIVEPEER_BRIDGE_URL` and `NEXT_PUBLIC_MARKET_READ_MODEL_URL` to the two
      workers.dev URLs for the local run against the V2 testnet.
5. **Leave the old Workers disabled** in the default account until M4 reaches `PASS`.

### Operator key set during the MC transition

The owner moves the Bridge to the media account before the on-chain
[MC cutover](#mc-cutover-provider-neutral-market-v2-names). Until that cutover, the testnet
function-call key still lists the legacy method names. So the Bridge release preflight accepts
either of two exact method sets on the key of `v2-bridge-261007…` for Market V2:

| Set | Methods |
|---|---|
| `neutral` | `finalize_publication`, `suspend_sales`, `mark_watched`, `release_expired` |
| `legacy` | `finalize_livepeer_publication`, `suspend_livepeer_sales`, `mark_watched`, `release_expired` |

- **The `operator_key_set` input** of *V2 Testnet Bridge* (env `OPERATOR_KEY_SET`) chooses which
  set a run accepts: `any` (the transition default), `neutral` or `legacy`. The input is checked
  in the prepare job, shown in the approval summary, bound into the attested manifest, and
  re-checked in the deploy job.
- **Mismatches.** A known set that the input does not allow stops the run with
  `operator_key_set_mismatch_<set>`. Any other list stops it with `operator_key_not_on_chain`:
  a mixed or partial list, extra methods, or another receiver.
- **Receipt.** The receipt and the deploy summary record `operatorKeySet` (the set that matched)
  and `operatorKeySetPolicy` (the input).
- **The cutover run pins `neutral`.** If the key swap did not happen, the run fails before
  wrangler is called.
- **After the cutover, switch the default back to `neutral`.** Make it a follow-up commit that
  changes `DEFAULT_OPERATOR_KEY_SET` in `scripts/v2-testnet-bridge-release.mjs` and the
  `operator_key_set` default in `.github/workflows/deploy-v2-testnet-bridge.yml`.
  `scripts/ci-security.test.mjs` keeps these two values equal.
- **Older text.** This supersedes the note in the Bridge section above, which says a post-MC
  Bridge release stops with `operator_key_not_on_chain` until the cutover.
- **The Bridge itself is unchanged.** It still validates its own method set at runtime; its
  `/__health` checks are the same.

Known gaps:
- The Bridge caches publication covers with `caches.default`. How that cache behaves on a
  workers.dev host is UNPROVEN; M1.5-G3 checks it.
- `SMOKE_DELAYS_MS` was sized for a new custom domain. Whether it fits a new workers.dev host is
  UNPROVEN.

Older sections and `docs/testing.md` still name `bridge-v2-testnet.youtick.net` and
`read-v2-testnet.youtick.net`. After the move those hosts are historical. The text gets fixed
once M1.5-G3 is done.

## Stream cutover inputs (M2)

Status: `PREPARED / NOT_RUN` (2026-10-22). Owner decision OD19 makes the V2 Bridge Stream-only: the
first Bridge deploy into the media account is the M2 build (Stream adapter and M2-G0 names) together
with the on-chain MC cutover. Cloudflare Stream lives in the same media account (`6caaaf27…1dcb`) as
the Worker, so `STREAM_ACCOUNT_ID` is that account id. The release no longer reads the Studio
webhook and deploys no `LIVEPEER_API_KEY`, `LIVEPEER_WEBHOOK_SECRET` or `LIVEPEER_JWT_PRIVATE_KEY`;
`V2_LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN` stays (it is the Bridge operator token, not a Studio
secret). This supersedes the Studio steps of "Webhook secret and tokens" and of "Cutover order
(M1.5-G3)" step 3 for the V2 Bridge; V1 keeps them.

Every step below is an owner action (provider write, GitHub secret write, commit or deploy). Run
the M0 proof round before step 3: its webhook proof (`stream-probe webhooks`) takes the account's
only webhook slot and deletes it at cleanup, which would remove the Bridge's webhook.

### Owner steps

1. **Stream API token.** Cloudflare dashboard, media account, Manage account → API tokens →
   Create token → Custom: permission *Account · Stream · Edit*, account resources *only the media
   account*. Store it at once: `gh secret set V2_STREAM_API_TOKEN --env v2-testnet` (paste at the
   prompt). In the shell for steps 2–4: `export STREAM_ACCOUNT_ID=6caaaf27c430b5da0ce18f68f35c1dcb`
   and `read -rs STREAM_API_TOKEN; export STREAM_API_TOKEN`.
2. **Signing key.** One `POST /stream/keys`; the response is shown once and holds the private
   half, so it goes to a 0600 file outside the repository and never to the terminal:

   ```bash
   umask 077; KEYS=$(mktemp)
   curl --fail -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$STREAM_ACCOUNT_ID/stream/keys" \
     -H "Authorization: Bearer $STREAM_API_TOKEN" -o "$KEYS"
   jq -r .result.id "$KEYS"                                     # STREAM_SIGNING_KEY_ID (step 6)
   jq -r .result.pem "$KEYS" | base64 -d | head -1              # format line only
   jq -r .result.pem "$KEYS" | base64 -d | openssl pkey -pubout | base64 | tr -d '\n'; echo   # STREAM_SIGNING_PUBLIC_KEY (step 6)
   ```

   If the format line is `-----BEGIN PRIVATE KEY-----` (PKCS8):
   `jq -j .result.pem "$KEYS" | gh secret set V2_STREAM_SIGNING_KEY_PEM --env v2-testnet` (`-j`: no trailing newline).
   If it is `-----BEGIN RSA PRIVATE KEY-----` (PKCS1, which Web Crypto in the Bridge cannot import
   and the release refuses with `stream_signing_key_pkcs1`), convert it first:
   `jq -r .result.pem "$KEYS" | base64 -d | openssl pkcs8 -topk8 -nocrypt | base64 | tr -d '\n' | gh secret set V2_STREAM_SIGNING_KEY_PEM --env v2-testnet`.
   Stream returned the PKCS1 form on 2026-10-22 (key `a9f988cd…`; M0-P8/U24 closed, PROVIDER), so the
   conversion is the normal path. Then `rm -P "$KEYS"`.
3. **Webhook.** One `PUT /stream/webhook` to the Bridge's workers.dev URL. Stream issues the
   signing secret in the response, so it goes straight to GitHub:

   ```bash
   SECRET=$(curl --fail -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/$STREAM_ACCOUNT_ID/stream/webhook" \
     -H "Authorization: Bearer $STREAM_API_TOKEN" -H 'Content-Type: application/json' \
     -d '{"notificationUrl":"https://youtick-livepeer-bridge-v2-testnet.kocoinci.workers.dev/v1/stream-webhooks"}' \
     | jq -er .result.secret) && [ ${#SECRET} -ge 16 ] && printf %s "$SECRET" | gh secret set V2_STREAM_WEBHOOK_SECRET --env v2-testnet; unset SECRET
   ```

   Deliveries before the Bridge deploy fail; nothing uploads to Stream before it. Every later PUT
   issues a new secret: rotation is PUT, `gh secret set`, then a Bridge deploy, with a gap in
   between (a two-secret overlap does not help on Stream unless M0-P4 shows the old secret
   surviving). `V2_STREAM_WEBHOOK_SECRET_PREVIOUS` is optional and normally unset.
4. **Customer code.** Already recorded: `7v4my51gigdqb5jn` (host
   `customer-7v4my51gigdqb5jn.cloudflarestream.com`, dashboard read of 2026-10-22,
   `claudedocs/stream-m0-pano-kanitlari-2026-10-22.md`); committed in `STREAM.customerCode` on
   2026-10-22 (nothing left to do in step 6 for it). To read it again from any video of the media account:
   `curl --fail -sS "https://api.cloudflare.com/client/v4/accounts/$STREAM_ACCOUNT_ID/stream?limit=1" -H "Authorization: Bearer $STREAM_API_TOKEN" | jq -r '.result[0].playback.hls' | sed -E 's#^https://customer-([a-z0-9]+)\.cloudflarestream\.com/.*#\1#'`.
   It is a public value (the web build carries it too).
5. **Canary signing key and video ids** (for the M4-G2 canaries `playback` and `ladder`). Mint a
   separate canary key, never the Bridge's, and keep `{id, pem}` in a 0600 file outside the
   repository (the canaries refuse a key file inside it):

   ```bash
   umask 077; CANARY_KEY=~/.youtick-stream-canary/key.json; mkdir -p "$(dirname "$CANARY_KEY")"
   curl --fail -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$STREAM_ACCOUNT_ID/stream/keys" \
     -H "Authorization: Bearer $STREAM_API_TOKEN" | jq '{id: .result.id, pem: .result.pem}' > "$CANARY_KEY"
   jq -r .id "$CANARY_KEY"   # the canary key id, to delete it later
   ```

   `--uid` is a ready video of the media account (for example the first acceptance upload, or a
   sample uploaded for M0 with `--keep`); `--other-uid` is a second ready one (optional, a random
   uid is used otherwise). List ready videos with
   `curl --fail -sS "https://api.cloudflare.com/client/v4/accounts/$STREAM_ACCOUNT_ID/stream?limit=20" -H "Authorization: Bearer $STREAM_API_TOKEN" | jq -r '.result[] | select(.readyToStream) | .uid'`.
   After the canaries, delete the key (`DELETE /stream/keys/<id>`) and the file. Then
   `unset STREAM_API_TOKEN`.
6. **One-line commits** on the milestone branch (or the next PR), each a public value:
   - `scripts/v2-testnet-bridge-release.mjs`, `STREAM.customerCode`: done on 2026-10-22 (`7v4my51gigdqb5jn`);
     the `<record-after-first-upload>` sentinel is only for a different media account.
   - same file, `STREAM.signingKeyId` and `STREAM.signingPublicKey` together: done on 2026-10-22 (key
     `a9f988cd…`); for another media account replace `<create-with-post-stream-keys>` in both (one without
     the other fails `stream_signing_key_incomplete`).
   - `scripts/v2-testnet-release.mjs`, relayer `UPLOAD_PROFILE_HASH_ALLOWLIST`: done on 2026-10-22
     (M3) with the `hash` of `protocol/paid-media-v1/stream-profile.json`
     (`1128da32…ea5f4c64`; `node scripts/check-paid-media-v1.mjs` prints it). It takes effect with
     the cutover's *V2 Testnet Workers* run (MC cutover step 6): from that run on, only a web build
     with `NEXT_PUBLIC_V2_MEDIA_PROFILE=stream` (and `NEXT_PUBLIC_STREAM_CUSTOMER_CODE`,
     docs/testing.md) can start a V2 upload; a build that sends another hash is refused by the
     relayer with `profile_not_allowed` before any fee is paid.
7. **Check the constants** offline: start *V2 Testnet Bridge* with `stream_enabled=true`; its
   prepare job fails on any remaining sentinel (`stream_*_unconfigured`). Reject the environment
   approval to stop there. The secret, key and webhook checks run only in the deploy job, and a
   deploy job that passes them **deploys a Worker version** (in `closed` mode a `DISABLED` one):
   it is not a dry check. Run it as MC cutover step 7 below, after steps 2–5 (outbox drained,
   Bridge frozen, contract upgraded, operator key swapped to the `neutral` set): before step 5 a
   run pinned to `operator_key_set=neutral` stops with `operator_key_set_mismatch_legacy`. When
   Stream's `GET /stream/webhook` does not return the secret (M0-P4), the receipt says
   `secret: not_returned` and the webhook canary below is the only proof. If it returns a value that
   differs (`stream_webhook_secret_mismatch_or_masked`; a masked readback is possible, M0-P4),
   either rotate (step 3) or start that run with the workflow input
   `stream_webhook_secret_preflight=skip` (attested in the manifest next to `stream_enabled`): the
   URL check stays, the receipt records `secret-not-compared` (an `acceptance` run also carries a
   `stream_webhook_secret_not_compared` warning), and the webhook canary must pass before uploads
   open.

### Deploy order on the cutover

The MC cutover table above stays, with these changes:

- Step 6 (*V2 Testnet Workers*) runs on the commit that carries the relayer allowlist (step 6 of
  "Owner steps" in this section), so the relayer accepts only the Stream descriptor hash from then
  on.
- Step 7 becomes two *V2 Testnet Bridge* runs on the same commit, both with
  `operator_key_set=neutral` and `stream_enabled=true`: first `closed` (all Stream checks; it
  deploys a `DISABLED` version whose smoke requires `streamConfigured: true`), then `acceptance` (smoke requires `streamConfigured: true` and the `stream`
  block in `/__health`). `acceptance` with `stream_enabled=false` is refused
  (`acceptance_requires_stream`).
- After step 8 (unfreeze), the M4-G2 Stream canaries with `STREAM_CANARY_MUTATIONS=true`
  (`docs/testing.md`, Livepeer Bridge): `canary:stream:webhook` with
  `--bridge-health-url https://youtick-livepeer-bridge-v2-testnet.kocoinci.workers.dev/__health`
  first, then provider, reservation, playback, ladder and keys. The webhook canary's video
  carries no `meta.jobId`, so it passes only if the Bridge advances `stream.lastWebhookAtMs` for
  every validly signed delivery, routable or not; a reachable `/__health` without that field
  fails the canary.

Effects to expect: with the OD3 defaults (`STREAM_MAX_DURATION_SECONDS` and
`STREAM_RESERVATION_SECONDS_BUDGET` both `7200`) only one Stream upload can be open at a time, so
a second creator who starts an upload while another is open is refused with `reservation_budget`.
That is the routine denial until the owner raises the budget (a commit to
`STREAM.reservationSecondsBudget`, at most what the 1,000-minute storage allows) and redeploys.
`STREAM_MAX_DURATION_SECONDS` accepts 1..7200 only, the descriptor cap the Bridge enforces.
Publications made through Studio before the cutover no longer play through
the new Bridge (it has no Studio configuration); the old Bridge keeps serving them until it is
switched off (OD13). With `stream_enabled=false` the Bridge writes the Stream constants as empty
and deploys no Stream secret.

Merge note: CI's Protocol job runs `node scripts/check-paid-media-v1.mjs`, which fails with
`stream descriptor missing: protocol/paid-media-v1/stream-profile.json` until the Bridge gate's
descriptor commit is on the same branch; both M2 branches land in one push.

The Studio-era canaries (`network-endpoint-canary`, `browser-canary-server`/`-client`,
`provider-canary`, `playback-canary`, `tus-resume-canary`) stay for V1 and are not deleted.

Evidence today: LOCAL_TEST only (release-script, workflow-shape and canary tests with mocks). No
step above has run.
