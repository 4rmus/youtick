# Open Source Release Checklist

> Checklist for preparing a public source release. Run destructive history
> cleanup only from a clean clone, never from a dirty working tree.

## Working Tree

- [ ] `git status --short` is clean except for the intentional release commit.
- [ ] Internal planning docs, LLM-wiki notes and local assistant files are absent.
- [ ] `.env*`, `.dev.vars`, `.near-credentials`, local build output and `tmp/`
  are untracked and ignored.
- [ ] Public docs contain only product, architecture, setup, testing and
  high-level security material.
- [ ] Detailed deploy evidence, endpoint inventories, transaction logs and
  incident notes are in private operations storage.

## History Cleanup

Use a clean clone and keep the original private repo untouched until the result
is verified:

```bash
git clone --no-local /path/to/private/youtick /tmp/youtick-public-clean
cd /tmp/youtick-public-clean

git filter-repo \
  --path-glob 'contracts/*/target/**' \
  --path docs/llm-wiki \
  --path docs/llm-wiki.md \
  --path docs/launch-plan-2026-05.md \
  --path docs/operations/monitoring-setup.md \
  --path scripts/check-llm-wiki.mjs \
  --path scripts/wiki-freshness.mjs \
  --path scripts/wiki-live-check.mjs \
  --path scripts/setup-claude-dev.sh \
  --path scripts/setup-hooks.sh \
  --invert-paths

git gc --prune=now --aggressive
```

If a private checklist identifies historical scripts containing real testnet or
mainnet secrets, include those exact paths in the same `filter-repo` pass. Do
not document the secret values in public files.

## Verification

```bash
git rev-list --all --objects | rg 'contracts/.*/target|docs/llm-wiki|launch-plan-2026-05|monitoring-setup'
git grep -n -I -E 'PRIVATE_KEY|SECRET_KEY|MASTER_SECRET|BEGIN .*PRIVATE|AKIA|sk-' $(git rev-list --all)
git status --short
```

Expected:

- removed internal paths do not appear in history,
- secret scan has no real reusable deploy key or provider token,
- remaining matches are tests, docs, env variable names or placeholders,
- only the intended public branch is pushed.

## Public Branch

- [ ] Push only the sanitized public branch.
- [ ] Do not push stale feature, worktree, security or local-update branches.
- [ ] Rotate or abandon any credential that ever appeared in git history, even
  after history cleanup.
