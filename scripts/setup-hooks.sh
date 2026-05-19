#!/bin/sh
# One-time setup: route git hooks to the tracked .githooks directory.
# Run from anywhere inside the repo: sh scripts/setup-hooks.sh
set -e

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

echo "git hooks path set to .githooks"
echo "pre-commit will now validate docs/llm-wiki on each commit that touches it."
