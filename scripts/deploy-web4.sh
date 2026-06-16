#!/usr/bin/env bash
# =============================================================================
# deploy-web4.sh — Build, upload to IPFS, and update Web4 static URL
# =============================================================================
#
# Usage:
#   ./scripts/deploy-web4.sh                  # Build + show CID (manual update)
#   ./scripts/deploy-web4.sh --set-url        # Build + propose timelocked contract URL update
#   ./scripts/deploy-web4.sh --cid-only       # Build + print CID only
#
# Prerequisites:
#   - Node.js 18+
#   - near-cli-rs or near-cli installed
#   - IPFS upload tool (w3 CLI, Pinata, or web3.storage)
#
# The script:
#   1. Builds the Next.js static export (out/ directory)
#   2. Uploads the out/ directory to IPFS
#   3. Optionally proposes a timelocked web4_static_url update
# =============================================================================

set -euo pipefail

CONTRACT_ID="youtick.near"
WEB_DIR="$(cd "$(dirname "$0")/../apps/web" && pwd)"
OUT_DIR="$WEB_DIR/out"
SET_URL=false
CID_ONLY=false

# Parse flags
for arg in "$@"; do
  case $arg in
    --set-url) SET_URL=true ;;
    --cid-only) CID_ONLY=true ;;
    --help|-h)
      echo "Usage: $0 [--set-url] [--cid-only]"
      echo "  --set-url   Auto-update contract web4_static_url after upload"
      echo "  --cid-only  Only print the IPFS CID (skip contract update prompt)"
      exit 0
      ;;
  esac
done

echo "============================================"
echo "  YouTick Web4 Deployment"
echo "============================================"
echo ""

# Step 1: Build
echo "[1/3] Building static export..."
cd "$WEB_DIR"
npm run build:web4
echo ""

if [ ! -d "$OUT_DIR" ]; then
  echo "ERROR: Build failed — out/ directory not found"
  exit 1
fi

FILE_COUNT=$(find "$OUT_DIR" -type f | wc -l | tr -d ' ')
DIR_SIZE=$(du -sh "$OUT_DIR" | cut -f1)
echo "  Build complete: $FILE_COUNT files, $DIR_SIZE total"
echo ""

# Step 2: Upload to IPFS
echo "[2/3] Uploading to IPFS..."

CID=""

# Try w3 CLI (web3.storage / storacha)
if command -v w3 &>/dev/null; then
  echo "  Using w3 CLI (Storacha)..."
  CID=$(w3 up "$OUT_DIR" --no-wrap 2>/dev/null | tail -1)
elif command -v ipfs &>/dev/null; then
  echo "  Using local IPFS node..."
  CID=$(ipfs add -r -Q --cid-version=1 "$OUT_DIR")
else
  echo ""
  echo "  No IPFS upload tool found. Install one of:"
  echo "    npm install -g @web3-storage/w3cli   # Storacha (recommended)"
  echo "    brew install ipfs                     # Local IPFS node"
  echo ""
  echo "  Manual upload: Upload the out/ directory to any IPFS pinning service"
  echo "  Directory: $OUT_DIR"
  echo ""

  # Try to compute CID locally for reference
  if command -v npx &>/dev/null; then
    echo "  Computing local CID for reference (not uploading)..."
    echo "  You can upload $OUT_DIR to Pinata or web3.storage"
    echo "  Then propose a timelocked URL update:"
    echo "    near call $CONTRACT_ID propose_action '{\"action\":{\"SetWeb4StaticUrl\":{\"url\":\"ipfs://YOUR_CID\"}}}' --accountId OWNER --gas 30000000000000"
  fi
  exit 0
fi

if [ -z "$CID" ]; then
  echo "ERROR: IPFS upload failed — no CID returned"
  exit 1
fi

echo "  IPFS CID: $CID"
echo ""

if [ "$CID_ONLY" = true ]; then
  echo "$CID"
  exit 0
fi

# Step 3: Propose contract update
echo "[3/3] Contract web4_static_url timelock proposal..."
echo ""
echo "  Contract: $CONTRACT_ID"
echo "  New URL:  ipfs://$CID"
echo ""

# Check current URL
CURRENT_URL=$(near view "$CONTRACT_ID" web4_get_static_url '{}' 2>/dev/null || echo "unknown")
echo "  Current:  $CURRENT_URL"
echo ""

if [ "$SET_URL" = true ]; then
  echo "  Creating timelock proposal..."
  near call "$CONTRACT_ID" propose_action "{\"action\":{\"SetWeb4StaticUrl\":{\"url\":\"ipfs://$CID\"}}}" --accountId "$CONTRACT_ID" --gas 30000000000000
  echo ""
  echo "  Proposal created. After 24 hours, execute it with:"
  echo "    near call $CONTRACT_ID execute_action '{\"id\":PROPOSAL_ID}' --accountId $CONTRACT_ID --gas 30000000000000"
else
  echo "  To propose the contract URL update, run:"
  echo ""
  echo "    near call $CONTRACT_ID propose_action '{\"action\":{\"SetWeb4StaticUrl\":{\"url\":\"ipfs://$CID\"}}}' --accountId $CONTRACT_ID --gas 30000000000000"
  echo ""
  echo "  After 24 hours, execute the proposal:"
  echo ""
  echo "    near call $CONTRACT_ID execute_action '{\"id\":PROPOSAL_ID}' --accountId $CONTRACT_ID --gas 30000000000000"
  echo ""
  echo "  Or re-run this script with --set-url flag"
fi

echo ""
echo "============================================"
echo "  Upload complete"
echo "  Web4 URL changes after timelock execution"
echo "  Current live URL: https://${CONTRACT_ID}.page/"
echo "============================================"
