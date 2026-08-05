# Loop Prompt: NEAR + USDC Single-Approval Creator Upload

Use the following prompt in a new Codex task from repository root.

```text
Repository: /Users/arair/works/youtick-lp

Primary source of truth:
docs/architecture/near-usdc-single-approval-creator-upload-plan.md

Execute the saved plan as a bounded implementation loop. Read the entire plan,
the applicable AGENTS.md instructions and the current repository state before
editing anything. The saved plan defines scope, architecture, acceptance tests,
evidence classes and approval gates. Do not silently reinterpret it.

Authority granted by this prompt:
- local code and documentation changes required by Slices A and B;
- local tests, builds, ABI/schema checks and read-only repository inspection.

Authority NOT granted:
- commit, push, PR, merge or branch deletion;
- deployment or feature-flag activation;
- account/key creation or rotation against a live network;
- funding, USDC/NEAR transfer or withdrawal;
- Livepeer/provider mutation;
- testnet, staging or production mutation.

Before the loop:
1. Run git status, branch, HEAD and diff-name checks.
2. The repository may contain user-owned dirty changes. Preserve them.
3. If the plan's overlapping files are dirty and the exact implementation
   baseline is not explicit, stop with BASELINE_BLOCKED. Report the conflicting
   paths and the safest scoped snapshot or clean-worktree options. Do not stage,
   stash, reset, overwrite or commit them on your own.
4. Verify the P0 rate-source decision. Pyth Core on NEAR is not an acceptable
   production dependency. If no approved server-side NEAR/USD source and
   failure policy are recorded, complete work that does not depend on that
   choice, then stop at RATE_SOURCE_BLOCKED instead of inventing a provider.

Implementation loop:
1. Re-open the plan and read the Execution ledger.
2. Select the first incomplete item whose prerequisites and authority are met.
3. State the exact assumption, touched files and runnable success check.
4. Write the smallest failing test that proves the next behavior.
5. Implement the minimum surgical change that makes it pass.
6. Run the focused check, then the broader checks required by that slice.
7. Inspect git diff and verify every changed line belongs to the selected item.
8. Update only the plan's Execution ledger with concrete file/test evidence.
9. Repeat from step 1 without waiting while another local, authorized item is
   safely available.

Mandatory invariants:
- Creator upload fee only; buyer/ticket settlement remains USDC-only.
- One normal-path user wallet approval for USDC and one for native NEAR.
- No AddKey, DeleteKey or signAndSendTransactions in the normal upload path.
- Browser control signing may remain local and popup-free.
- No split payment, automatic swap, relayer, paymaster or automatic refund.
- USDC requires sufficient NEAR gas reserve.
- If both assets are usable, default to USDC and allow explicit NEAR override.
- All money and quote math uses checked integers; never floating point.
- USDC and NEAR ledgers remain separate.
- NEAR withdrawal preserves storage staking and the measured reserve.
- A same-job retry cannot charge twice or create a second provider asset.
- Wrong/stale quote, wrong/replaced key and conflicting replay fail closed.
- Provider mutation cannot occur before final on-chain job/key verification.
- Do not migrate old MediaJob Borsh values; target a fresh contract ID.
- Runtime and web feature flags stay disabled.

Evidence rules:
- Keep LOCAL, CI, PROVIDER, TESTNET, DEPLOYMENT and PRODUCTION evidence separate.
- Never describe local or mocked PASS as live capability.
- Redact keys, signatures, TUS URLs, wallet details and provider secrets.
- Do not mark a ledger item complete without exact commands and results.

Stop conditions:
- All authorized Slice A and B acceptance criteria and checks pass: report
  LOCAL_IMPLEMENTATION_COMPLETE and list remaining external gates.
- A required choice or dirty-file conflict prevents safe work: report the exact
  BLOCKED code and one concrete user decision needed.
- The next step requires any unauthorized external mutation: stop before it and
  report SEPARATE_EXPLICIT_APPROVAL_REQUIRED with exact action, target, amount,
  expected evidence and rollback/cleanup owner.
- The same blocker repeats three loop iterations: stop instead of retrying.

Do not stop after producing another plan or status report if an authorized,
unblocked local implementation item remains. Do not broaden scope to adjacent
wallet, legacy Lighthouse/KMS, buyer-payment or UI refactoring work.
```
