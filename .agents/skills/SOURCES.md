# YouTick skill sources

Installed 2026-09-21 from [near/agent-skills](https://github.com/near/agent-skills/tree/378a55c6bff84d15750eff2cd9950a5736ee9589), revision `378a55c6bff84d15750eff2cd9950a5736ee9589`; updated 2026-10-06 to revision `cb32b6a` (see the update record at the end; `upstream-lock.json` holds the full SHA and current checksums).
Selection follows the corrected recommendation in the [shared conversation](https://chatgpt.com/share/6ab14647-5d34-83eb-b4af-0299c3a3b4c2): near-api-js, near-dapp, near-smart-contracts, near-contract-audit.

The five upstream-derived SKILL.md entrypoints (near-api-js, near-dapp, near-smart-contracts, near-contract-audit, near-intents) are local YouTick adaptations with narrow triggers and on-demand references. Original entrypoints are retained verbatim as UPSTREAM.md; all upstream references/rules remain verbatim. `upstream-lock.json` records original paths and SHA-256 checksums (SKILL.md maps to UPSTREAM.md locally). Upstream near-smart-contracts declares MIT in its original frontmatter; no repository-wide LICENSE was present at this revision. No broader license is inferred.

The youtick-* skills (youtick-contract-review, youtick-payment-flow, youtick-near-auth) are local workflows based on current source. They do not freeze historical runtime claims or duplicate the whole project contract. Local file references may include ongoing uncommitted work; recheck availability and versions in the checkout being used.

Do not bulk-update these files from a floating branch. Fetch a candidate revision outside the repository, compare entrypoints and referenced files, review changes against root AGENTS.md and installed dependency versions, then update this revision and checksums together. Preserve the scoped entrypoints and authorization boundaries.

Codex discovery location: [official skills documentation](https://learn.chatgpt.com/docs/build-skills). Repository skills live in `.agents/skills/`; user-wide installed skills are outside this change. The optional NEAR Docs MCP was not installed: this gate covers skill files and agent instructions, not a new tool connection.

## Installation validation — 2026-09-21

- LOCAL_STATIC: skill-creator `scripts/quick_validate.py` passed for all 7 entrypoints; all 49 relative Markdown links resolve. The 25 retained upstream files match the recorded SHA-256 values. All 34 added files are visible to Git.
- LOCAL_STATIC: the four upstream entrypoints total 1,041 lines; the scoped replacements total 87. Full references remain available on demand. This is a context-size reduction, not a measured model-quality improvement.
- LOCAL_STATIC: `npm run build --prefix docs` passed with the existing over-500-kB bundle warning. Existing file hashes confirmed only root AGENTS.md changed among 383 baseline files; the other 382, including `.codex/config.toml`, were preserved.
- Routing review covered JS signing, wallet UI, Google session restoration, Rust implementation, contract security, multi-asset settlement and unrelated media work. These were instruction checks, not independent agent executions.
- EXTERNAL_NOT_RUN / UNPROVEN: application suites, independent agent behavior evaluation, live wallet/payment/provider acceptance, MCP connection, CI and deployments. No commit, push, PR or merge. Next gate, if requested: one read-only representative task to validate skill selection and output behavior.

## Update record — 2026-10-06 (378a55c → cb32b6a, upstream dated 2026-09-28)

- Fetched the revision tarball outside the repository and compared every locked file. Changed upstream: `near-api-js/SKILL.md`, `near-dapp/SKILL.md`, `near-smart-contracts/SKILL.md` (new "Upstream Documentation" / "Additional Rules" link tables, SDK note "5.29.x", security link moved to `/security/checklist`) and four `near-smart-contracts/rules/*` files (docs.near.org URL corrections only). `near-contract-audit` unchanged. All copied verbatim into `UPSTREAM.md` / `rules/`; the scoped `SKILL.md` entrypoints were kept, with one pointer line added to `near-smart-contracts/SKILL.md`. The upstream SDK note does not change the project's `near-sdk =5.5.0` pin.
- Added `near-intents`: new scoped entrypoint plus all 21 upstream rules and `references/concepts.md` verbatim (keeping every upstream file preserves the internal links of `UPSTREAM.md` and `rules/api-quote.md`). The entrypoint references only the server-side 1Click path used by the Bridge and Web (`api-quote`, `api-tokens`, `api-status`, `api-deposit-submit`, `api-user-auth`, `deposit-near`, `sdk`, `server-example`); React widget/hooks, other-chain deposits, orders, confidential swaps, Hyperliquid, passive deposit, ANY_INPUT withdrawals and intents balance stay on disk but unreferenced. `youtick-payment-flow` now points at `near-intents` for 1Click details.
- Validation: LOCAL_STATIC — every locked file matches its upstream SHA-256 (script in this gate's transcript), relative Markdown links checked, frontmatter names match directories. EXTERNAL_NOT_RUN — application suites, provider calls, CI. No commit.

## Retirement — 2026-10-06

- `youtick-near-auth` removed: it described a Google/Auth0/MPC login lab (`apps/web/lib/near-auth-lab*.ts`, `near-auth-signing*.ts`, `app/api/auth-lab/`) that commit `ad84ba2` (wallet-only V1 testnet candidate) deleted; `apps/web` has no Auth0/jose dependency and no `test:near-auth-types` script. Wallet sign-in now lives in `near-dapp`; the historical `docs/architecture/near-auth-*.md` files remain as documents, not current instructions. The skill text is recoverable from Git history.

## V2 return — 2026-10-07

- `youtick-near-auth` added back as a new local workflow for the V2 sign-in (roadmap E5): `apps/web/lib/near-auth/` and `apps/web/lib/ticket-keys/`. It does not restore the retired V1 lab text; that lab code stays deleted. `AGENTS.md`, `near-dapp` and `.claude/rules/web.md` point V2 sign-in work here.
