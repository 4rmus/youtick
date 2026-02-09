#!/bin/bash

# NOVA Module Basic Test Runner
# Runs tests that don't require near-api-js (config tests only for now)
# Full test suite requires Jest/Vitest setup to properly mock modules

set -e  # Exit on error

echo "🧪 NOVA Module Basic Test Suite"
echo "=" | head -c 60
echo ""
echo ""
echo "⚠️  Note: Full test suite requires Jest/Vitest for module mocking"
echo "   Currently running tests that don't depend on near-api-js"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Tests that work without near-api-js
WORKING_TESTS=(
  "config.test.ts"
)

# Tests that need Jest/Vitest (near-api-js module mocking required)
PENDING_TESTS=(
  "auth.test.ts"
  "client.test.ts"
  "groups.test.ts"
  "integration.test.ts"
)

# Run working tests
echo "Running working tests:"
echo ""

for test in "${WORKING_TESTS[@]}"; do
  echo "Running $test..."

  if npx tsx "__tests__/nova/$test"; then
    echo -e "${GREEN}✅ $test PASSED${NC}"
    echo ""
  else
    echo -e "${RED}❌ $test FAILED${NC}"
    echo ""
    exit 1
  fi
done

# List pending tests
echo ""
echo -e "${YELLOW}📋 Tests pending Jest/Vitest setup:${NC}"
for test in "${PENDING_TESTS[@]}"; do
  echo "   ⏳ $test"
done

echo ""
echo "=" | head -c 60
echo ""
echo -e "${GREEN}✅ Basic tests passed!${NC}"
echo ""
echo "💡 Next steps:"
echo "   1. Set up Jest or Vitest in package.json"
echo "   2. Configure module mocking for near-api-js"
echo "   3. Run full test suite: npm test"
echo ""
