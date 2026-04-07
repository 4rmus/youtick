#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# Create isolated KV namespaces for each KMS operator
#
# Prerequisites:
#   1. wrangler login (or set CLOUDFLARE_API_TOKEN)
#   2. Run from the workers/youtick-kms directory
#
# Usage:
#   cd workers/youtick-kms
#   bash ../../scripts/create-operator-kv-namespaces.sh
#
# This script creates 3 KV namespaces per operator (VIDEO_KEYS, RATE_LIMIT,
# ACCESS_CACHE) and outputs the IDs to paste into wrangler.toml.
# ═══════════════════════════════════════════════════════════════════════════════

OPERATORS=("operator_a" "operator_b" "operator_c" "operator_d" "operator_e")
BINDINGS=("VIDEO_KEYS" "RATE_LIMIT" "ACCESS_CACHE")

echo "Creating KV namespaces for ${#OPERATORS[@]} operators..."
echo ""

for op in "${OPERATORS[@]}"; do
    echo "=== ${op} ==="
    for binding in "${BINDINGS[@]}"; do
        title="youtick-kms-${op}-${binding}"
        echo -n "  Creating ${title}... "

        output=$(npx wrangler kv namespace create "${title}" 2>&1)
        # Parse 'id = "xxx"' format (portable — no grep -P needed)
        id=$(echo "$output" | sed -n 's/.*id = "\([^"]*\)".*/\1/p' | head -1)

        if [ -z "$id" ]; then
            # Try JSON format: "id": "xxx"
            id=$(echo "$output" | sed -n 's/.*"id":[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
        fi

        if [ -z "$id" ]; then
            echo "FAILED — parse output manually:"
            echo "$output"
            continue
        fi

        echo "${id}"
        echo "  # ${op} ${binding}: ${id}"
    done
    echo ""
done

echo "═══════════════════════════════════════════════════════════════"
echo "Done! Copy the IDs above into wrangler.toml for each operator."
echo "═══════════════════════════════════════════════════════════════"
