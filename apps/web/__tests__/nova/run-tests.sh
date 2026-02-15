#!/bin/bash

# NOVA Module Test Runner
# Runs all NOVA module tests in sequence

set -e  # Exit on error

echo "🧪 NOVA Module Test Suite"
echo "=" | head -c 60
echo ""
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test files
TESTS=(
  "config.test.ts"
  "auth.test.ts"
  "client.test.ts"
  "groups.test.ts"
  "integration.test.ts"
)

# Results tracking
TOTAL_PASSED=0
TOTAL_FAILED=0
FAILED_TESTS=()

# Run each test
for test in "${TESTS[@]}"; do
  echo "Running $test..."

  if npx tsx "__tests__/nova/$test"; then
    echo -e "${GREEN}✅ $test PASSED${NC}"
    echo ""
  else
    echo -e "${RED}❌ $test FAILED${NC}"
    FAILED_TESTS+=("$test")
    echo ""
  fi
done

# Summary
echo ""
echo "=" | head -c 60
echo ""
echo "📊 Test Suite Summary"
echo ""

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ ${#FAILED_TESTS[@]} test file(s) failed:${NC}"
  for failed_test in "${FAILED_TESTS[@]}"; do
    echo "   - $failed_test"
  done
  exit 1
fi
