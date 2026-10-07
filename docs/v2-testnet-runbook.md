# V2 testnet runbook

Status: `PREPARED / NOT_RUN`. This creates the separate V2 testnet environment (roadmap: E5
acceptance, decision D9). Nothing here touches the V1 public testnet pilot or mainnet.

The setup has three parts:

1. **NEAR accounts and contracts** (`.github/workflows/bootstrap-v2-testnet.yml`). This part is
   ready.
2. **Workers.** The relayer Worker and a separate Bridge V2 environment (`MARKET_PROTOCOL=v2`).
   This comes in the next gate.
3. **Web configuration.** Pinning the new ckd-gate in `CKD_TRUST_ROOTS` and setting the V2
   variables for a local run. This comes after part 1 succeeds.

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

- **Pin the gate.** Read the CKD domain 2 public key from `v1.signer-prod.testnet`, then pin
  `{ gateAccountId, mpcPublicKey }` in `apps/web/lib/ticket-keys/ckd.ts` (`CKD_TRUST_ROOTS.testnet`)
  through a PR.
- **Deploy the Workers** (next gate):
  - Relayer: `CKD_GATE_ACCOUNT_IDS` set to the gate, secrets `RELAYER_PRIVATE_KEY` and
    `RELAYER_ADMIN_TOKEN`.
  - Bridge V2: `MARKET_PROTOCOL=v2`, `MARKET_CONTRACT_ID` set to `market_v2`, and the operator
    function-call key.
- **Owner:** send a little NEAR and Circle testnet USDC (from Circle's testnet faucet) to the
  relayer account, for gas and invite credits.
- **Local acceptance.** The shared NEAR Auth testnet client only allows `http://localhost:3000`,
  so run `apps/web` there with the V2 variables (`apps/web/README.md`).
  - Purchases need E7 (checkout and the VAT service).

## Evidence

The scripts and workflow are covered by `workers/livepeer-bridge/scripts/v2-testnet-bootstrap.test.mjs`
against a simulated chain (LOCAL_TEST). Nothing has run against testnet yet. A workflow `PASS`
counts as PROVIDER (testnet) evidence only. It is never mainnet evidence.
