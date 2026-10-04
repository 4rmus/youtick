#!/usr/bin/env bash
# CKD end-to-end spike: v1.signer.request_app_private_key -> decrypt -> pairing check -> HKDF key.
# Uses the official near/mpc ckd-example-cli; the ephemeral BLS key lives only in the CLI process memory.
#
# Usage:
#   CKD_CLI=/path/ckd-example-cli ./run.sh <account> <path> [--send]
# Without --send only the request and the near command are printed (nothing is sent).
# With --send a mainnet transaction (1 yoctoNEAR deposit, 50 TGas) is signed with the local legacy keychain key.
set -euo pipefail

ACCOUNT="${1:?account required}"
DERIVATION_PATH="${2:?path required}"
SEND="${3:-}"
CKD_CLI="${CKD_CLI:?set CKD_CLI to the ckd-example-cli binary}"
MPC_CONTRACT="v1.signer"
DOMAIN_ID=2
# v1.signer state, keyset.domains[2] (mainnet, 2026-10-04)
MPC_CKD_PK="bls12381g2:24mhN4RnB2CbiUkAfukyh4s1CT6dUNd9Pc8kRnL4LvAP3tcxhUupbphmfbmwHSi66aFCiZkMgiH2KqXWJLD7JUeAFhoLS3WQbzWcpUzhERLqxyocwT9Xrd4WNvEuKavxmXdR"

WORK="$(mktemp -d)"
trap 'exec 3>&- 2>/dev/null || true; rm -rf "$WORK"' EXIT
mkfifo "$WORK/in"

"$CKD_CLI" --domain-id "$DOMAIN_ID" --signer-account-id "$ACCOUNT" \
  --derivation-path "$DERIVATION_PATH" --mpc-ckd-public-key "$MPC_CKD_PK" \
  --publicly-verifiable <"$WORK/in" >"$WORK/out" 2>&1 &
CLI_PID=$!
exec 3>"$WORK/in"

for _ in $(seq 1 50); do grep -q '^{"request"' "$WORK/out" && break; sleep 0.1; done
REQUEST_JSON="$(grep '^{"request"' "$WORK/out")"
echo "Request: $REQUEST_JSON"

NEAR_CMD=(near contract call-function as-transaction "$MPC_CONTRACT" request_app_private_key
  json-args "$REQUEST_JSON" prepaid-gas '50.0 Tgas' attached-deposit '1 yoctoNEAR'
  sign-as "$ACCOUNT" network-config "${NEAR_NETWORK:-mainnet-fastnear}" sign-with-legacy-keychain send)

if [[ "$SEND" != "--send" ]]; then
  echo "Dry run. Command to send:"; printf '%q ' "${NEAR_CMD[@]}"; echo
  kill "$CLI_PID" 2>/dev/null || true
  exit 0
fi

START=$(date +%s)
"${NEAR_CMD[@]}" 2>&1 | tee "$WORK/tx.log"
echo "Elapsed: $(( $(date +%s) - START )) s"

RESPONSE_JSON="$(python3 - "$WORK/tx.log" <<'PY'
import json, re, sys
text = open(sys.argv[1]).read()
m = re.search(r'\{[^{}]*"big_[cy]"[^{}]*\}', text, re.S)
if not m:
    sys.exit("CKD response not found in transaction output")
r = json.loads(m.group(0))
print(json.dumps({"big_c": r["big_c"], "big_y": r["big_y"]}))
PY
)"
echo "Response: $RESPONSE_JSON"
echo "$RESPONSE_JSON" >&3
exec 3>&-
wait "$CLI_PID" || { cat "$WORK/out"; exit 1; }
# Print a fingerprint for comparison, never the key itself.
KEY_HEX="$(sed -n 's/.*The key is: \([0-9a-f]*\).*/\1/p' "$WORK/out")"
[[ -n "$KEY_HEX" ]] || { cat "$WORK/out"; exit 1; }
echo "Verification: pairing check passed"
echo "Key fingerprint (sha256): $(printf '%s' "$KEY_HEX" | shasum -a 256 | cut -c1-16)"
