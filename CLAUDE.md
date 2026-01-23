# YouTick - Claude Code Project Instructions

> **Proje**: YouTick - Decentralized Video-on-Demand Platform
> **Blockchain**: NEAR Protocol (Testnet → Mainnet)
> **Contract**: `v1.utick.testnet`

## Critical Rules

### Smart Contract Safety

**NEVER modify or deploy contracts without explicit user approval:**

```yaml
contract_operations:
  modify_lib_rs: REQUIRES_APPROVAL
  cargo_build: ALLOWED
  deploy_testnet: REQUIRES_APPROVAL
  deploy_mainnet: REQUIRES_APPROVAL
  migrate_state: REQUIRES_APPROVAL
```

**Before ANY contract change, you MUST:**
1. Explain the change and its impact
2. Show the diff of proposed changes
3. Wait for explicit "yes" or approval from user
4. Use NEAR dev accounts for testing (not v1.utick.testnet)

### Development Account Rules

```bash
# For contract testing, ALWAYS use dev accounts:
near create-account dev-{timestamp}.testnet --useFaucet

# NEVER deploy directly to:
# - v1.utick.testnet (production testnet)
# - Any mainnet account
```

**Workflow for contract changes:**
```
1. Create dev account → near create-account dev-xxx.testnet
2. Deploy to dev → near deploy dev-xxx.testnet
3. Test thoroughly
4. Show results to user
5. Get approval for production deploy
6. Deploy to v1.utick.testnet (with user watching)
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      YouTick Architecture                    │
├─────────────────────────────────────────────────────────────┤
│  Frontend (Next.js 16.0.10 + React 19.2.3 + TypeScript 5.x) │
│  ├── /app - Pages (App Router)                              │
│  ├── /components - React components                          │
│  ├── /lib - Core business logic                             │
│  └── /hooks - Custom React hooks                            │
├─────────────────────────────────────────────────────────────┤
│  Decentralized Services                                      │
│  ├── NEAR Protocol - Smart contract, payments               │
│  ├── Lit Protocol (7.3.1) - Encryption, access control      │
│  ├── NEAR Chain Signatures - MPC for cross-chain            │
│  └── Lighthouse/IPFS (0.4.3) - Decentralized storage        │
├─────────────────────────────────────────────────────────────┤
│  Smart Contract (Rust + NEAR SDK 5.1.0)                      │
│  └── /contracts/nft-ticket/src/lib.rs                       │
│      ├── NEP-171 NFT Standard                               │
│      ├── Prepaid balance (Session Keys)                     │
│      ├── Gift drops (Access Key based)                      │
│      └── Trial accounts (Sponsored)                         │
└─────────────────────────────────────────────────────────────┘
```

## Key Files Reference

| Domain | File | Purpose |
|--------|------|---------|
| Contract | `contracts/nft-ticket/src/lib.rs` | NFT ticket contract (Rust) |
| Lit Integration | `apps/web/lib/lit.ts` | Encryption/decryption |
| PKP Management | `apps/web/lib/pkp.ts` | PKP minting (relay + direct) |
| Chain Signatures | `apps/web/lib/chain-signatures.ts` | MPC address derivation |
| Session Keys | `apps/web/lib/session-manager.ts` | NEAR session management |
| Access Control | `apps/web/lib/access-conditions.ts` | Lit ACCs |
| Gift System | `apps/web/lib/gift-service.ts` | Gift link generation |
| Upload | `apps/web/components/UploadForm.tsx` | Video upload flow |
| Player | `apps/web/components/IpfsPlayer.tsx` | Decrypted playback |

## Decentralization Principles

### Current State (Testnet)
```yaml
decentralization_score: 75%

decentralized:
  - NFT ownership (NEAR contract)
  - Payment flow (98% to creator)
  - Video encryption (Lit Protocol)
  - Video storage (IPFS/Lighthouse)
  - Session Keys (signless UX)

centralized_dependencies:
  - Lighthouse API key (backend proxy)
  - Lit Relay (optional, for gas-free PKP)
  - Next.js API routes (CORS proxies)
  - Relayer account (sponsored transactions)
```

### Target State (Mainnet V2)
```yaml
decentralization_score: 95%

improvements_needed:
  - PKP: Use mintPKPDirect() as default (user pays gas)
  - Lighthouse: Smart contract payment via Chain Signatures
  - Proxies: Client-side direct calls where possible
  - Relayer: Remove or make optional
```

## Technology Constraints

### NEAR Protocol
- **Network**: Testnet (switch to mainnet for production)
- **Contract ID**: `v1.utick.testnet`
- **RPC Failover**: fastnear → near.org → lava.build

### Lit Protocol
- **Network**: Datil-Test (Chronicle Yellowstone)
- **PKP Minting**: Support both Relay and Direct
- **Session Cache**: 7 days (security reduced from 30)

### Lighthouse/IPFS
- **Gateway**: lighthouse.storage
- **Encryption**: Lit Protocol (not Lighthouse native)
- **Payment**: Currently API-based, target contract-based

## Testing Guidelines

### Contract Testing
```bash
# Build contract
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release

# Create dev account
near create-account dev-$(date +%s).testnet --useFaucet

# Deploy to dev account (NOT v1.utick.testnet)
near deploy dev-xxx.testnet target/wasm32-unknown-unknown/release/nft_ticket.wasm

# Run tests
cargo test
```

### Frontend Testing
```bash
cd apps/web
npm run dev      # Development server
npm run build    # Production build
npm run lint     # Linting
```

### E2E Testing (Recommended)
```bash
# Use Playwright for full flow testing:
# - Upload flow (encryption → IPFS → mint)
# - Watch flow (ownership check → decrypt → play)
# - Purchase flow (payment → NFT mint)
# - Gift flow (create → claim → trial account)
```

## Security Checklist

Before any deployment:
- [ ] No hardcoded private keys
- [ ] Environment variables properly set
- [ ] Contract storage keys are V3 (collision-safe)
- [ ] Prepaid withdrawal limit is 0.1 NEAR max
- [ ] Session cache expiry is 7 days max
- [ ] Gift drop access keys are properly scoped

## MCP Server Recommendations

| MCP | Use Case |
|-----|----------|
| **Sequential** | Complex debugging, multi-step Lit integration |
| **Context7** | NEAR SDK docs, Lit Protocol docs, Next.js patterns |
| **Serena** | Large codebase navigation, session persistence |
| **Playwright** | E2E testing upload/watch/claim flows |

## Common Commands

```bash
# Development
npm run dev                    # Start dev server

# Contract
cargo near build              # Build contract WASM
near view v1.utick.testnet get_event '{"cid":"xxx"}'

# Deployment (REQUIRES APPROVAL)
# near deploy v1.utick.testnet ...

# Lit Action
npm run deploy:lit-action     # Deploy Lit Action to IPFS
```

## Branch Strategy

- `main` - Production-ready code
- `feature/*` - Feature development
- `fix/*` - Bug fixes
- Current: `feature/lit-pkp-fix`

## Environment Variables

Required in `.env.local`:
```env
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=v1.utick.testnet
NEXT_PUBLIC_LIT_ACTION_IPFS_CID=<cid>
NEXT_PUBLIC_LIT_CAPACITY_TOKEN_ID=<token_id>
LIT_DELEGATION_WALLET_PRIVATE_KEY=0x...
LIGHTHOUSE_API_KEY=<api_key>
RELAYER_ACCOUNT_ID=relayer.v1.utick.testnet
RELAYER_PRIVATE_KEY=ed25519:...
```

## Approval Required Actions

The following actions REQUIRE explicit user approval:

1. **Contract Modifications**
   - Any change to `lib.rs`
   - State migrations
   - New contract functions

2. **Deployments**
   - Deploy to any NEAR account
   - Deploy Lit Actions to IPFS

3. **Sensitive Operations**
   - Modifying environment variables
   - Changing RPC endpoints
   - Updating access control conditions

4. **Financial Operations**
   - Modifying commission rates
   - Changing prepaid limits
   - Trial pool funding
