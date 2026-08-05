# NEAR + USDC Single-Approval Creator Upload Plan

Status: `LOCAL_IMPLEMENTATION_COMPLETE / RUNTIME_DISABLED`

Last reviewed: 2026-08-05

This plan changes only the creator's one-time, byte-based Livepeer upload fee.
Ticket pricing, buyer settlement and the existing 98/2 split remain USDC-only.
It is not deployment, funding, provider-mutation or runtime-activation authority.

## Review verdict

The dual-rail design is viable and both normal payment paths can use exactly one
user-visible wallet approval. The review found and resolved these design gaps:

1. The current Pyth-on-NEAR path cannot be a new production dependency because
   Pyth documents the end of NEAR Core support on 2026-08-18. NEAR payment uses
   a short-lived server-signed quote from an approved server-side rate source.
2. Adding payment and upload-key fields changes the Borsh layout of `MediaJob`.
   Existing testnet jobs must not be decoded through an in-place migration. Use
   a fresh paid-media contract ID and preserve old canary evidence as history.
3. Native NEAR withdrawal must preserve both the contract's recorded liability
   and the liquid balance left after storage staking.
4. "Single approval" means one wallet confirmation in the normal create flow.
   The browser still signs a control request locally without a wallet popup. A
   lost-key recovery is an exceptional additional wallet transaction.
5. A wallet error after broadcast is ambiguous. The web client must reconcile
   the final on-chain job before generating a new key or retrying payment.

## Current repository boundary

At review time the checkout was:

- branch: `agent/livepeer-testnet-canary-hardening`;
- HEAD: `4ea2011`;
- dirty, including overlapping contract, Worker, ABI and test changes;
- public runtime still disabled.

Do not implement this plan on top of the dirty checkout. First preserve the
current work in its own scoped snapshot/PR, or use a clean worktree from the
explicitly selected finalized SHA. Do not stage, rewrite or discard unrelated
user changes.

## Locked scope

- Creator upload fee only: decimal `$0.30/GB`, charged once for a new job.
- Payment assets: Circle USDC on NEAR or native NEAR.
- The web defaults to USDC-only. Native NEAR requires the separate
  `NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE=true` web gate and
  `LIVEPEER_NEAR_CREATOR_FEE_ENABLED=true` Worker gate; while either is off the
  browser prepares no NEAR transaction and the Worker issues no NEAR quote.
- Ticket minimum remains `2_000_000` micro-USDC.
- Buyer payment and creator/platform ticket settlement remain USDC-only.
- No split payment, automatic swap, cross-chain payment or automatic refund.
- No relayer, paymaster or gas sponsorship in this slice.
- If both balances are sufficient, default to USDC and allow an explicit NEAR
  override before opening the wallet.
- If USDC is sufficient but the account cannot pay NEAR gas, USDC is not
  considered usable.
- Feature flags remain off through code merge and local verification.

## Release sequencing

The first releasable milestone is USDC-only. The NEAR path remains implemented
and locally tested, but it stays unavailable while `RATE_SOURCE_BLOCKED` is
open and both NEAR creator-fee feature flags remain disabled. This NEAR gate
does not block review or CI for the disabled code, or a later separately
approved USDC-only deployment. Any deployment, feature-flag activation or live
mutation still requires separate explicit approval.

## Success criteria

Local code keeps and tests both payment paths. The initial release applies the
following criteria to USDC; NEAR must also satisfy them, plus its rate-source
and activation gates, before later exposure:

1. The UI displays the selected asset and exact amount before wallet approval.
2. The web client calls `signAndSendTransaction` exactly once.
3. No `AddKey`, `DeleteKey` or `signAndSendTransactions` call is made.
4. Payment and job-bound upload public key are recorded atomically.
5. The Worker verifies that key from the final on-chain job before provider
   mutation.
6. An exact retry cannot charge twice or create a second provider asset.
7. Wrong key, stale quote, wrong amount, conflicting replay and nonce replay
   fail closed.
8. A lost response is reconciled against chain state before any retry.

## Target flow

| Wallet state | Selection | User transaction |
| --- | --- | --- |
| Sufficient USDC and NEAR gas reserve | USDC | one `ft_transfer_call` |
| USDC unusable, sufficient NEAR including gas reserve | NEAR | one payable `create_paid_job_near` |
| Both usable | USDC default; explicit override allowed | one transaction for the selected asset |
| Neither usable | blocked before wallet | none |

The browser generates an Ed25519 key pair before payment and stores the secret
under the exact account and job in `sessionStorage`. Only its public key enters
the payment transaction. After the Worker returns an accepted upload intent,
the browser deletes the local secret. This key is an application capability,
not a NEAR account access key.

## Protocol changes

Keep media profile `paid-media-livepeer-v1`; the encoding and Livepeer profile
do not change. Bump only the control-authorization contract to v2 because the
proof changes from a NEAR account access key to a job-bound application key.

Add these immutable job fields:

- `fee_asset`: `USDC` or `NEAR`;
- `fee_amount`: smallest unit of the selected asset;
- `fee_usd_micro`: canonical one-time USD fee;
- `upload_public_key`: Ed25519 public key bound to the job;
- `upload_key_expires_at_ms`;
- `fee_quote_hash`: present only for NEAR.

The canonical USD fee remains integer-only:

```text
fee_usd_micro = ceil(source_bytes * 300_000 / 1_000_000_000)
```

Add canonical quote schema `youtick.creator-fee-quote.v1` with:

- domain and schema version;
- network and market contract ID;
- creator account and job ID;
- expected source bytes;
- `fee_usd_micro`;
- `near_usd_micro`;
- exact `fee_near_yocto`;
- rate source identifier and rate timestamp;
- quote expiry;
- quote-key version.

The quote ID is the SHA-256 of the canonical message. It needs no independent
nonce because creator, job ID, contract and expiry are already signed and job ID
is unique. A same-job retry must reuse the exact key and fields.

NEAR conversion is integer-only:

```text
fee_near_yocto = ceil(fee_usd_micro * 10^24 / near_usd_micro)
```

Update protocol schema, README, checker and golden vectors. Retain the previous
access-key vector as explicitly historical evidence; runtime accepts only the
new control version after cutover.

## Contract changes

### USDC path

Extend the current `ft_transfer_call` message with `upload_public_key` and
`upload_key_expires_at_ms`.

- Accept only the configured Circle USDC contract.
- Require the exact calculated micro-USDC fee.
- Create the job and bind its application key atomically in `ft_on_transfer`.
- On exact existing-job replay, return the full FT amount for NEP-141 refund.
- On conflicting replay, fail closed and refund through FT resolution.

### Native NEAR path

Add payable `create_paid_job_near(request, quote, quote_signature)`.

- Verify the canonical quote with the configured Ed25519 quote public key.
- Require quote creator, job, bytes, network and contract to match the request.
- Require a fresh rate and an unexpired quote.
- Recompute the USD fee and yoctoNEAR conversion with checked integer math.
- Require the attached deposit to equal the exact quoted fee.
- Record the job and increase a separate `platform_near_balance` ledger.
- An exact replay must return or atomically refund the full attached deposit.
- A conflicting replay must fail without retaining the attached deposit.

Add `get_platform_near_balance` and a governance-restricted NEAR withdrawal.
Withdrawal is allowed only up to both:

- the recorded `platform_near_balance`; and
- the account's liquid balance after `storage_usage * storage_byte_cost` and a
  measured operational reserve.

Never combine raw micro-USDC and yoctoNEAR values in one ledger.

### Quote-key lifecycle

Store a versioned quote public key in contract state. Rotation must be
governance-restricted, emit an audit record and allow a bounded overlap only if
the rotation runbook proves it is needed. The Worker secret contains only the
private quote key; browsers never receive it.

### Lost-key recovery

Add creator-only `replace_upload_key(job_id, new_public_key, expires_at_ms)`.
It is allowed only while the job remains unpublished. It never charges another
upload fee. The Worker always reads the latest final job key, so the old key is
rejected immediately after finality. This recovery transaction is outside the
normal single-approval claim.

### Fresh deployment boundary

Do not attempt to migrate old `MediaJob` values to this layout. Build and deploy
to a fresh paid-media contract ID. Deployment scripts and documentation must
fail closed if an operator tries to use the old canary contract as the target.

## Worker changes

### NEAR quote endpoint

Add a narrow endpoint such as `POST /v1/creator-fee-quotes/near`.

- Validate account, job and source-byte bounds before rate lookup.
- Read one explicitly approved server-side NEAR/USD source.
- Reject stale, invalid or unavailable prices; do not silently fall back to a
  browser, cache or CEX chain.
- Sign the canonical quote with a dedicated Worker secret.
- Return only the quote, signature and public key version.
- Rate-limit without persisting wallet or quote secrets.

The approved local source is the Outlayer `wrap.near` cached view, read from
`price-oracle.near` or `price-oracle.testnet` through the Worker's configured
NEAR RPC. No separate price API key or settlement fallback is used. Pyth Core
on NEAR remains ineligible due to its announced support end. Empty, stale,
invalid or unavailable oracle data closes NEAR payment while USDC remains
available. A non-null cached price is usable only when the oracle-reported
`recency_duration_sec` is at most 60.

Locked local bounds; provider liveness and the gas reserve remain activation
gates:

- maximum source-price age: 60 seconds;
- maximum quote lifetime: 2 minutes;
- no client-side price fallback for settlement.

### Upload authorization

Remove creator-side `view_access_key` validation. After verifying the local
Ed25519 control signature, read the final on-chain media job and require:

- exact creator, job, generation, bytes and profile;
- exact `upload_public_key` match;
- unexpired upload-key capability;
- accepted control version and origin;
- fresh, atomically consumed device nonce.

Only after those checks may the job Durable Object reserve provider admission.
An existing matching Durable Object job returns the same upload resource; it
must never create a second asset.

## Web changes

Use final RPC reads for:

- Circle USDC `ft_balance_of`;
- native NEAR available balance;
- the exact media job during ambiguous-result reconciliation.

Selection order:

1. Calculate exact micro-USDC fee locally with integer math.
2. If USDC and measured NEAR gas reserve are sufficient, select USDC.
3. Otherwise request a signed NEAR quote.
4. Select NEAR only when quoted fee plus measured gas reserve is available.
5. If both are usable, show both and default to USDC.
6. If neither is usable, explain the missing fee or gas before wallet access.

Generate and persist the job key before opening the wallet. Send exactly one
transaction:

- USDC receiver: configured USDC contract, method `ft_transfer_call`;
- NEAR receiver: market contract, method `create_paid_job_near` with exact
  attached deposit.

On wallet error or timeout, query `get_media_job` at finality:

- exact job and public key found: continue to request the intent;
- job absent: retry with the same job ID and key;
- conflicting job: fail closed and require explicit recovery.

After an accepted intent, clear the local secret without sending `DeleteKey`.

## Test plan

Write negative tests before implementation.

### Contract

- USDC and native NEAR successful job creation.
- Fee vectors: 1 byte, 80 MiB, 1 GB and 20 GB.
- Exact 20 GB accepted; 20 GB + 1 rejected before mutation.
- Wrong signer, key version, creator, job, bytes, amount and contract.
- Stale source price and expired quote.
- Exact USDC and NEAR replay without double charge.
- Conflicting replay with full refund semantics.
- Separate USDC and NEAR platform ledgers.
- Withdrawal cannot consume storage staking or operational reserve.
- Lost-key replacement and old-key rejection.
- Old contract state is rejected as a deployment target, not migrated.

### Worker

- Canonical quote and signature golden vector.
- Rate-source success, staleness, invalid value and outage.
- Job-bound key accepted; account access-key proof is no longer queried.
- Wrong, expired and replaced key rejected.
- Nonce replay and origin mismatch rejected.
- Same job cannot create a second provider asset.
- No provider call occurs before final job/key verification.

### Web

- Sufficient USDC, sufficient NEAR, both and neither.
- USDC balance sufficient but NEAR gas insufficient.
- Both normal paths call `signAndSendTransaction` exactly once.
- No `AddKey`, `DeleteKey` or `signAndSendTransactions`.
- Exact receiver, method, amount and deposit for each asset.
- User rejection, RPC timeout and ambiguous broadcast reconciliation.
- Lost local key invokes explicit recovery rather than another fee.

## Expected file scope

- `protocol/paid-media-livepeer-v1/README.md`
- `protocol/paid-media-livepeer-v1/schema.json`
- `protocol/paid-media-livepeer-v1/golden-vectors.json`
- `scripts/check-paid-media-livepeer-v1.mjs`
- `contracts/nft-ticket/src/lib.rs`
- `contracts/nft-ticket/tests/paid_media_livepeer_v1.rs`
- `contracts/nft-ticket/tests/sandbox.rs`
- `contracts/nft-ticket/README.md`
- `scripts/check-paid-media-livepeer-v1-abi.mjs`
- `workers/livepeer-bridge/src/index.ts`
- focused Worker tests
- `apps/web/lib/livepeer-upload.ts`
- `apps/web/components/LivepeerPaidUploadForm.tsx`
- `apps/web/__tests__/unit/livepeer-upload.test.ts`
- focused balance/selection UI tests
- `docs/adr/adr-010-livepeer-paid-media.md`
- `docs/architecture/near-livepeer-paid-media-implementation-plan.md`
- D6 decision/evidence documents when separately authorized

Do not edit legacy Lighthouse/KMS history merely because it references an older
architecture. Do not refactor unrelated wallet or purchase flows.

## Implementation slices

### Slice A: protocol and contract, code-only

- Lock control v2 and quote v1 schemas/vectors.
- Implement dual-rail contract state and methods.
- Add contract, sandbox and ABI tests.
- Keep all runtime flags disabled.

Verification: contract test/build/ABI and protocol checker pass.

### Slice B: Worker and web, code-only

- Implement quote endpoint and job-bound key verification.
- Implement balance selection, one-transaction payment and reconciliation.
- Remove normal-path AddKey/DeleteKey behavior.
- Keep all runtime flags disabled.

Verification: focused and full Worker/web suites, lint, type check and builds
pass. No network mutation is performed.

### Slice C: bounded testnet evidence, separate approval

- Use a fresh testnet contract ID and exact deployed SHA.
- Configure and rehearse quote-key rotation.
- Prove one wallet approval for USDC and NEAR separately.
- Prove both jobs obtain an authenticated upload intent.
- Run one bounded media upload; the second rail may stop after intent creation
  and provider cleanup because media transport is payment-rail independent.
- Record transaction hashes, balance deltas, quote, final job state and provider
  cleanup without secrets.

This slice requires explicit approval for deploy, funding, USDC/NEAR transfer
and Livepeer/NEAR mutation. It is not authorized by this document.

### Slice D: production gate, separate approval

- Approved production NEAR/USD source and failure policy.
- Quote-key custody, rotation and revocation rehearsal.
- Measured network-specific gas reserves.
- Withdrawal/storage-reserve proof.
- Exact-SHA deploy and rollback plan.
- Runtime allowlist, budget and activation approval.

## Verification commands

```bash
(cd contracts/nft-ticket && cargo +1.86.0 fmt --all --check)
(cd contracts/nft-ticket && cargo +1.86.0 clippy --all-targets -- -D warnings)
(cd contracts/nft-ticket && cargo +1.86.0 test --lib)
(cd contracts/nft-ticket && cargo +1.86.0 test --test paid_media_livepeer_v1)
(cd contracts/nft-ticket && cargo +1.86.0 test --test sandbox)
(cd contracts/nft-ticket && cargo +1.86.0 near build non-reproducible-wasm)

node scripts/check-paid-media-livepeer-v1.mjs
node scripts/check-paid-media-livepeer-v1-abi.mjs

npm --prefix workers/livepeer-bridge test -- --run
npm --prefix workers/livepeer-bridge run check

npm --prefix apps/web test -- --run
npm --prefix apps/web run lint
npm --prefix apps/web run build

npm --prefix docs run build
git diff --check
```

Local PASS, CI PASS, provider evidence, testnet deployment and production
activation must be reported as separate evidence classes.

## Execution ledger

Update this table only with concrete commit/test/evidence references. A plan or
local PASS must not be recorded as deployed capability.

| Slice | Status | Evidence | Remaining gate |
| --- | --- | --- | --- |
| Baseline preservation | `COMPLETE` | Draft PR #73; snapshot `a4378c84ee66869ed2134be834af2bea7f12b3b0`; clean branch/worktree check: `git status --short --branch`, `git rev-parse HEAD`; snapshot CI Gate, Contracts, Docs, Web and Livepeer Bridge Worker PASS | PR remains draft; merge not authorized |
| A: protocol + contract | `LOCAL_COMPLETE` | `node scripts/check-paid-media-livepeer-v1.mjs` PASS; `cargo +1.86.0 fmt --all --check` PASS; `cargo +1.86.0 clippy --all-targets -- -D warnings` PASS; lib `4/4`, focused `16/16`, sandbox `1/1`; WASM `d6ba032f92e5450af16f91ecb60e13e71ed32d56d5c71eec034decd044b06a96`; ABI `market=28, access=24` | CI, fresh contract deployment and external evidence not run |
| B: Worker + web | `LOCAL_COMPLETE` | USDC is the default web rail; native NEAR additionally requires the default-off web and Worker flags, and neither quote lookup nor NEAR transaction runs while either gate is closed. Source decision: Outlayer `get_price_data` for `wrap.near` through the existing NEAR RPC, 60-second maximum oracle recency, 120-second source-to-expiry window, no fallback, outage closes NEAR only. Worker focused `npm test -- --run src/index.test.ts` `32/32`, full `npm test -- --run` `81/81`, `npm run check` PASS and `npx wrangler deploy --dry-run` PASS with both runtime flags `false`; web focused upload `19/19`, constants `13/13`, full `npm test -- --run` `272/272`, lint and build PASS; docs build, protocol/ABI checkers and `git diff --check` PASS. `PROVIDER` read-only RPC evidence on 2026-08-05 returned HTTP 200 with `price:null` and recency windows of 300 seconds on `price-oracle.testnet` and 600 seconds on `price-oracle.near`; this is not live NEAR capability. | CI; `RATE_SOURCE_BLOCKED` until the target network returns 20 consecutive non-null samples at 30-second intervals with `recency_duration_sec <= 60`; both NEAR flags, quote-key provisioning, measured gas reserve, fresh contract deployment and external evidence require separate approval |
| C: bounded testnet | `BLOCKED_BY_APPROVAL` | none | deploy/funding/provider mutation |
| D: production | `RATE_SOURCE_BLOCKED` | Outlayer source and fail-closed policy locked locally; read-only provider probe returned `price:null` and recency windows wider than 60 seconds; runtime remains disabled | fresh-source qualification, quote-key custody and rotation, measured gas reserve, deployment and activation |

## Sources

- Outlayer price-oracle interface and cache behavior:
  <https://price-oracle.outlayer.ai/docs/>
- NEAR oracle overview:
  <https://docs.near.org/primitives/oracles>
- Pyth NEAR support notice:
  <https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/near>
- NEAR fungible-token standard:
  <https://docs.near.org/primitives/ft/standard>
- Existing target plan:
  [`near-livepeer-paid-media-implementation-plan.md`](./near-livepeer-paid-media-implementation-plan.md)
