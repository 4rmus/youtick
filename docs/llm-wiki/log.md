---
title: Wiki Log
status: live
area: maintenance
last_checked: 2026-05-19
confidence: high
sources:
  - docs/llm-wiki.md
  - docs/README.md
  - docs/overview.md
  - docs/architecture/README.md
  - docs/architecture/storage.md
  - docs/launch-plan-2026-05.md
  - docs/release-runbook.md
  - docs/operations/known-issues.md
---

# Wiki Log

## [2026-05-19] ingest | initial vault bootstrap

- type: doc + repo-source-map
- source: `docs/llm-wiki.md`
- touched: `index.md`, `schema.md`, `overview.md`, `source-map.md`, `claims.md`, `architecture/**`, `flows/**`, `operations/**`, `audits/**`, `decisions/index.md`
- result: Obsidian vault icin ilk bilgi mimarisi kuruldu.
- validation: repo dokumanlari okundu; live RPC, Worker health ve browser smoke calistirilmadi.
- dikkat: canli drift riski olan iddialar `claims.md` icinde riskli veya needs check olarak birakildi.

## [2026-05-19] live-check | mainnet health gates

- type: live-check
- touched: `claims.md`, `operations/launch-status.md`, `operations/live-health-gates.md`, `operations/known-risks.md`, `audits/open-items.md`, `architecture/contracts.md`
- result: registry threshold `3/5`, 5 active decryption operators, 5/5 KMS health ready, Storage API provider health ready, auth'suz upload intent `Unauthorized`, trial pool `0.826 NEAR`.
- drift: docs expect `youtick.near` code hash `BXbiiT86A8mjVNwvZhNLhUDqvmTVUe7anHotTpQPXg2F`; live RPC block `198986843` returned then-live `7WB9gut5Y9bLF234fVHeqGnewTRL32Pc3dXfkDZEAmPr`.
- local-build: `cargo +1.86.0 near build non-reproducible-wasm` returned `HA3i8Se8Mrsd14Ye2qYvwehRgP9Phrd76psgyy9Y1bCF`; tracked `contracts/nft-ticket/res/youtick_nft_opt.wasm` returned `9M6wocxGsQ1rK7eQrdPfwdYkuUFgV5xdE8f8aCGW7K5c`.
- not-run: full upload-buy-watch browser smoke.
- security: real KMS endpointler ve secret materyal wiki'ye yazilmadi.

## [2026-05-19] live-check | youtick.near code hash drift root cause

- type: live-check + local-build
- touched: `claims.md`, `operations/launch-status.md`, `operations/live-health-gates.md`, `operations/known-risks.md`, `audits/open-items.md`, `architecture/contracts.md`
- result: R2 hash `BXbiiT86A8mjVNwvZhNLhUDqvmTVUe7anHotTpQPXg2F` was live at block `198052723`; later deploy tx `6gg1BCt7xuFYh2DABibazAFouRR7CrSdFzgWRTGKxjpt` at block `198060926` changed `youtick.near` to then-live hash `7WB9gut5Y9bLF234fVHeqGnewTRL32Pc3dXfkDZEAmPr`.
- reproduction: temp worktree at commit `415a2e2` + `cargo +1.86.0 near build non-reproducible-wasm` produced `7WB9gut5Y9bLF234fVHeqGnewTRL32Pc3dXfkDZEAmPr`.
- remaining: repo docs should distinguish historical R2 hash from current mainnet hash; tracked wasm artefact also does not match current live.

## [2026-05-19] doc-sync | current mainnet code hash references

- type: doc-sync
- touched: repo docs (`README.md`, `CHANGELOG.md`, `docs/**`, `contracts/nft-ticket/README.md`) and vault `claims.md` / `audits/open-items.md`
- result: repo docs distinguished then-live `youtick.near` hash `7WB9gut5Y9bLF234fVHeqGnewTRL32Pc3dXfkDZEAmPr` from historical R2 hash `BXbiiT86A8mjVNwvZhNLhUDqvmTVUe7anHotTpQPXg2F`.
- remaining: tracked `contracts/nft-ticket/res/youtick_nft_opt.wasm` and current source build did not match then-live hash; decide separately whether that binary artefact should be refreshed or removed from source-of-truth language.

## [2026-05-19] re-check | current mainnet code hash refreshed again

- type: live-check + doc-sync
- touched: repo docs (`README.md`, `CHANGELOG.md`, `docs/**`, `contracts/nft-ticket/README.md`) and vault hash notes
- result: live RPC returned current `youtick.near` code hash `HA3i8Se8Mrsd14Ye2qYvwehRgP9Phrd76psgyy9Y1bCF`; latest deploy block `198989245`, tx `3iFMyZZszb1aHpvZfY1FM4V56SvhbpDxdy4s3aZ1EaMB`.
- history: R2 `BXbii...` and hotfix `7WB9...` are historical, not current.
- artefact: working-tree `contracts/nft-ticket/res/youtick_nft_opt.wasm` matches current live hash; binary diff still needs an explicit commit/revert decision.

## [2026-05-19] structure | repo-tracked agent memory

- type: doc-structure
- touched: `docs/llm-wiki/**`, `scripts/check-llm-wiki.mjs`
- result: Obsidian vault markdown content moved into repo-tracked `docs/llm-wiki/`; agent router and module cards added for token-efficient AI agent navigation.
- validation: `node scripts/check-llm-wiki.mjs` passed; remaining warning is existing `needs check` marker in `claims.md`.
- dikkat: `.claude/` and `AGENTS.md` are local-only by `.gitignore`; durable source-of-truth is `docs/llm-wiki/`.

## [2026-05-19] smoke | watch playback agent-route measurement

- type: doc-sync + code-read + test
- touched: `docs/README.md`, `docs/llm-wiki/agent-router.md`, `docs/llm-wiki/module-cards/wallet-playback.md`, `docs/llm-wiki/flows/purchase-and-watch.md`, `docs/llm-wiki/source-map.md`, `.gitignore`
- result: docs index now links to LLM Wiki; Obsidian local settings moved to `docs/llm-wiki/.obsidian/`; stale nested `docs/llm-wiki/youtick/` copy moved to `/private/tmp/youtick-llm-wiki-backups/youtick-nested-copy-2026-05-19`; watch/playback router now includes `apps/web/app/watch/page.tsx`.
- measurement: route used 5 wiki pages before source; source pass focused on 7 watch/playback files instead of broad repo scan.
- validation: `npm test -- --run __tests__/unit/kms-client.test.ts __tests__/unit/video-delivery-player.test.ts __tests__/unit/access-grants.test.ts` passed 29 tests; `node scripts/check-llm-wiki.mjs` passed with only the existing `claims.md` needs-check warning.

## [2026-05-19] doc-sync | temporary status warning cleanup

- type: doc-sync + agent-review
- touched: `docs/llm-wiki/claims.md`, `docs/llm-wiki/audits/open-items.md`
- result: `claims.md` no longer uses a temporary review status for full upload-buy-watch; the claim now states the verified reality: this remains an open GO/NO-GO gate and the full browser smoke is still NOT RUN.
- validation: source evidence reviewed in `docs/launch-plan-2026-05.md`, `docs/release-runbook.md`, `docs/llm-wiki/log.md`, and `docs/llm-wiki/operations/live-health-gates.md`.

## [2026-05-19] structure | memory system automation phase 1-3

- type: doc-structure + tooling
- touched: `scripts/check-llm-wiki.mjs`, `.githooks/pre-commit`, `scripts/setup-hooks.sh`, `.github/workflows/ci.yml`, `docs/llm-wiki/index.md`, `docs/llm-wiki/obsidian-setup.md`, `CONTRIBUTING.md`, `.claude/settings.json`
- result: wiki integrity is now enforced automatically. `check-llm-wiki.mjs` gained wikilink integrity, orphan detection, claims.md table-schema and frontmatter date/confidence checks. A tracked pre-commit hook (`.githooks/`, activated via `scripts/setup-hooks.sh`) and a CI `llm-wiki` job both run the checker. External Obsidian vault retired; `docs/llm-wiki/` is the single source-of-truth and the only vault.
- validation: `node scripts/check-llm-wiki.mjs` passed with 0 warnings; pre-commit hook tested with staged wiki files and passed; `ci.yml` job list confirmed (`llm-wiki` present, no tabs).
- dikkat: this is phase 1-3 of the memory-system plan; freshness automation, scheduled live-checks, the `/wiki` skill and the `.claude`-memory boundary (phases 4-8) are not yet implemented.

## [2026-05-19] structure | memory system automation phase 4,6,7,8

- type: tooling + doc-structure
- touched: `scripts/wiki-freshness.mjs`, `docs/llm-wiki/operations/freshness.md`, `docs/llm-wiki/index.md`, `docs/llm-wiki/schema.md`, `.claude/skills/wiki/SKILL.md`
- result: phase 4 — `wiki-freshness.mjs` computes staleness from git history (sources changed after `last_checked` = stale candidate; age thresholds per area) and `--write` regenerates `operations/freshness.md`. phase 6 — local `/wiki` skill enforces the ingest/query/lint procedures. phase 7 — `schema.md` now defines the boundary between llm-wiki (project truth) and `.claude` memory (local user/work context). phase 8 — index links the freshness report.
- validation: `node scripts/wiki-freshness.mjs --write` ran (37 pages, 0 stale, 0 aged — wiki created same day); `node scripts/check-llm-wiki.mjs` passed with 0 warnings.
- remaining: phase 5 (scheduled live-check routine) deferred — needs the user to confirm which live checks are safe/idempotent and to approve a billed scheduled remote agent.

## [2026-05-19] structure | memory system automation phase 5 (script-only)

- type: tooling
- touched: `scripts/wiki-live-check.mjs`, `docs/llm-wiki/schema.md`, `.claude/skills/wiki/SKILL.md`
- result: phase 5 delivered as a manual/cron script instead of a billed scheduled agent (user choice). `wiki-live-check.mjs` runs read-only mainnet RPC checks and compares them against `claims.md`; exits 1 on drift so cron can alert. KMS operator health and Storage API health are optional and gated behind `KMS_OPERATORS_PATH` / `STORAGE_API_URL` so real endpoints are never committed or printed.
- validation: live run against `rpc.mainnet.fastnear.com` — `youtick.near` code hash `HA3i8Se8Mrsd14Ye2qYvwehRgP9Phrd76psgyy9Y1bCF` matches claims.md; registry threshold 3-of-5 with 5 operators; trial pool 0.826 NEAR. No drift.
- note: memory-system plan phases 1-8 now complete; phase 5 is script-only by design, no scheduled agent.
