# YouTick skill sources

Installed 2026-09-21 from [near/agent-skills](https://github.com/near/agent-skills/tree/378a55c6bff84d15750eff2cd9950a5736ee9589), revision `378a55c6bff84d15750eff2cd9950a5736ee9589`.
Selection follows the corrected recommendation in the [shared conversation](https://chatgpt.com/share/6ab14647-5d34-83eb-b4af-0299c3a3b4c2): near-api-js, near-dapp, near-smart-contracts, near-contract-audit.

The four SKILL.md entrypoints are local YouTick adaptations with narrow triggers and on-demand references. Original entrypoints are retained verbatim as UPSTREAM.md; all upstream references/rules remain verbatim. `upstream-lock.json` records original paths and SHA-256 checksums (SKILL.md maps to UPSTREAM.md locally). Upstream near-smart-contracts declares MIT in its original frontmatter; no repository-wide LICENSE was present at this revision. No broader license is inferred.

The three youtick-* skills are local workflows based on current source. They do not freeze historical runtime claims or duplicate the whole project contract. Local file references may include ongoing uncommitted work; recheck availability and versions in the checkout being used.

Do not bulk-update these files from a floating branch. Fetch a candidate revision outside the repository, compare entrypoints and referenced files, review changes against root AGENTS.md and installed dependency versions, then update this revision and checksums together. Preserve the scoped entrypoints and authorization boundaries.

Codex discovery location: [official skills documentation](https://learn.chatgpt.com/docs/build-skills). Repository skills live in `.agents/skills/`; user-wide installed skills are outside this change. The optional NEAR Docs MCP was not installed: this gate covers skill files and agent instructions, not a new tool connection.

## Installation validation — 2026-09-21

- LOCAL_STATIC: skill-creator `scripts/quick_validate.py` passed for all 7 entrypoints; all 49 relative Markdown links resolve. The 25 retained upstream files match the recorded SHA-256 values. All 34 added files are visible to Git.
- LOCAL_STATIC: the four upstream entrypoints total 1,041 lines; the scoped replacements total 87. Full references remain available on demand. This is a context-size reduction, not a measured model-quality improvement.
- LOCAL_STATIC: `npm run build --prefix docs` passed with the existing over-500-kB bundle warning. Existing file hashes confirmed only root AGENTS.md changed among 383 baseline files; the other 382, including `.codex/config.toml`, were preserved.
- Routing review covered JS signing, wallet UI, Google session restoration, Rust implementation, contract security, multi-asset settlement and unrelated media work. These were instruction checks, not independent agent executions.
- EXTERNAL_NOT_RUN / UNPROVEN: application suites, independent agent behavior evaluation, live wallet/payment/provider acceptance, MCP connection, CI and deployments. No commit, push, PR or merge. Next gate, if requested: one read-only representative task to validate skill selection and output behavior.
