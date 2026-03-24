#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# Migrate KMS operator data from shared KV to isolated per-operator KV
#
# This script copies each operator's share records from the shared KV namespace
# to their dedicated namespace. Share keys are already operator-scoped:
#   share:${videoId}:${operatorAccountId}
#
# It also copies shared metadata (owner:*, sharemeta:*) to each operator.
#
# Prerequisites:
#   1. wrangler login (or set CLOUDFLARE_API_TOKEN)
#   2. New KV namespaces created (see create-operator-kv-namespaces.sh)
#   3. Run from workers/youtick-kms directory
#
# Usage:
#   export SHARED_KV_ID="7af9ebeeffaa4f4bace8e0347963d165"
#   export OP_A_KV_ID="<new-operator-a-video-keys-id>"
#   export OP_B_KV_ID="<new-operator-b-video-keys-id>"
#   export OP_C_KV_ID="<new-operator-c-video-keys-id>"
#   export OP_D_KV_ID="<new-operator-d-video-keys-id>"
#   export OP_E_KV_ID="<new-operator-e-video-keys-id>"
#   bash ../../scripts/migrate-operator-kv.sh
# ═══════════════════════════════════════════════════════════════════════════════

SHARED_KV_ID="${SHARED_KV_ID:?Set SHARED_KV_ID to the current shared VIDEO_KEYS namespace ID}"

declare -A OP_KV_MAP=(
    ["kms-a.youtick.near"]="${OP_A_KV_ID:?Set OP_A_KV_ID}"
    ["kms-b.youtick.near"]="${OP_B_KV_ID:?Set OP_B_KV_ID}"
    ["kms-c.youtick.near"]="${OP_C_KV_ID:?Set OP_C_KV_ID}"
    ["kms-d.youtick.near"]="${OP_D_KV_ID:?Set OP_D_KV_ID}"
    ["kms-e.youtick.near"]="${OP_E_KV_ID:?Set OP_E_KV_ID}"
)

echo "Listing all keys from shared KV namespace..."
ALL_KEYS=$(npx wrangler kv key list --namespace-id "$SHARED_KV_ID" 2>/dev/null)

echo "Found keys in shared namespace."

for OP_ACCOUNT in "${!OP_KV_MAP[@]}"; do
    TARGET_KV="${OP_KV_MAP[$OP_ACCOUNT]}"
    echo ""
    echo "=== Migrating data for ${OP_ACCOUNT} -> ${TARGET_KV} ==="

    # Copy operator-specific share records: share:*:${OP_ACCOUNT}
    echo "$ALL_KEYS" | python3 -c "
import sys, json
keys = json.load(sys.stdin)
op = '${OP_ACCOUNT}'
for entry in keys:
    name = entry['name']
    # Copy: share records for this operator, owner records, sharemeta records, legacy keys
    if name.endswith(':' + op) or name.startswith('owner:') or name.startswith('sharemeta:') or name.startswith('key:'):
        print(name)
" | while read -r key; do
        echo -n "  Copying: ${key}... "
        VALUE=$(npx wrangler kv key get --namespace-id "$SHARED_KV_ID" "$key" 2>/dev/null)
        echo "$VALUE" | npx wrangler kv key put --namespace-id "$TARGET_KV" "$key" - 2>/dev/null && echo "OK" || echo "FAIL"
    done
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Migration complete. Verify by checking operator health after deploy."
echo "═══════════════════════════════════════════════════════════════"
