#!/bin/bash

# YouTick Claude Code Development Setup
# This script sets up the development environment for Claude Code integration

set -e

echo "========================================"
echo " YouTick Claude Code Development Setup"
echo "========================================"
echo ""

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 1. Verify skill directories exist
echo "1. Verifying skill directories..."
SKILLS_DIR="$PROJECT_ROOT/.skills"
if [ -d "$SKILLS_DIR" ]; then
    SKILL_COUNT=$(find "$SKILLS_DIR" -name "SKILL.md" | wc -l)
    print_status "Found $SKILL_COUNT skill files in .skills/"
else
    print_error "Skills directory not found. Please run the main setup first."
    exit 1
fi

# 2. Verify MCP server directories
echo ""
echo "2. Verifying MCP server directories..."
MCP_DIR="$PROJECT_ROOT/mcp-servers"
if [ -d "$MCP_DIR/near-cli" ]; then
    print_status "MCP server directories found"
else
    print_error "MCP server directories not found."
    exit 1
fi

# 3. Install MCP dependencies
echo ""
echo "3. Installing MCP server dependencies..."

echo "   Installing near-cli-mcp..."
cd "$MCP_DIR/near-cli"
if npm install --silent 2>/dev/null; then
    print_status "near-cli-mcp dependencies installed"
else
    print_warning "near-cli-mcp npm install failed (may need manual intervention)"
fi

cd "$PROJECT_ROOT"

# 4. Build MCP servers
echo ""
echo "4. Building MCP servers..."

echo "   Building near-cli-mcp..."
cd "$MCP_DIR/near-cli"
if npm run build --silent 2>/dev/null; then
    print_status "near-cli-mcp built successfully"
else
    print_warning "near-cli-mcp build failed (TypeScript compilation)"
fi

cd "$PROJECT_ROOT"

# 5. Verify Claude config
echo ""
echo "5. Verifying Claude config..."
CLAUDE_DIR="$PROJECT_ROOT/.claude"
if [ -f "$CLAUDE_DIR/agents.md" ]; then
    print_status "agents.md found in .claude/"
else
    print_warning "agents.md not found"
fi

# 6. Check environment variables
echo ""
echo "6. Checking environment variables..."
ENV_FILE="$PROJECT_ROOT/apps/web/.env.local"
if [ -f "$ENV_FILE" ]; then
    print_status ".env.local found"

    # Check for required variables
    if grep -q "NEXT_PUBLIC_NFT_CONTRACT_ID" "$ENV_FILE"; then
        print_status "NEXT_PUBLIC_NFT_CONTRACT_ID is set"
    else
        print_warning "NEXT_PUBLIC_NFT_CONTRACT_ID not found in .env.local"
    fi
else
    print_warning ".env.local not found - copy from .env.example"
fi

# 7. Check NEAR credentials
echo ""
echo "7. Checking NEAR credentials..."
NEAR_CREDS="$HOME/.near-credentials/testnet"
if [ -d "$NEAR_CREDS" ]; then
    CRED_COUNT=$(ls -1 "$NEAR_CREDS"/*.json 2>/dev/null | wc -l)
    print_status "Found $CRED_COUNT NEAR credential files"
else
    print_warning "No NEAR credentials found. Run: near login"
fi

# 8. Summary
echo ""
echo "========================================"
echo " Setup Summary"
echo "========================================"
echo ""
echo "Skills:"
find "$SKILLS_DIR" -name "SKILL.md" -exec dirname {} \; | xargs -I {} basename {} | while read skill; do
    echo "  - $skill"
done

echo ""
echo "MCP Servers:"
echo "  - near-cli-mcp: $MCP_DIR/near-cli/dist/index.js"

echo ""
echo "Sub-Agents (in .claude/agents.md):"
echo "  - @contract (Rust/NEAR)"
echo "  - @frontend (React/Next.js)"
echo "  - @web3 (Protocol integration)"
echo "  - @security (Security audit)"
echo "  - @devops (Deployment)"

echo ""
echo "========================================"
echo " Next Steps"
echo "========================================"
echo ""
echo "1. Set NEXT_PUBLIC_KMS_URL in .env.local (if using custom KMS worker)"
echo "2. Run 'near login' to authenticate NEAR CLI"
echo "3. Configure MCP servers in Claude Code settings:"
echo ""
echo "   Add to your Claude Code settings.json:"
echo '   {'
echo '     "mcpServers": {'
echo '       "near-cli": {'
echo '         "command": "node",'
echo '         "args": ["'$MCP_DIR'/near-cli/dist/index.js"],'
echo '         "env": { "NEAR_ENV": "testnet" }'
echo '       }'
echo '     }'
echo '   }'
echo ""
echo "4. Restart Claude Code"
echo ""
print_status "Setup complete!"
