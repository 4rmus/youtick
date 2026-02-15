# Contributing to YouTick

Thank you for your interest in contributing to YouTick. This guide covers everything you need to get started, from setting up your development environment to submitting a pull request.

---

## Quick Start

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/youtick.git
cd youtick

# 2. Install and configure
cd apps/web
npm install
cp .env.example .env.local
# Edit .env.local with your configuration

# 3. Start development
npm run dev
```

See [Installation Guide](./getting-started/installation.md) for detailed setup instructions.

---

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 18+ | Frontend development (recommend `nvm`) |
| **npm** | 9+ | Package management |
| **Git** | Latest | Version control |
| **NEAR Testnet Wallet** | -- | Testing transactions |
| **Rust** | Latest stable | Smart contract development (optional) |
| **NEAR CLI** | Latest | Blockchain interaction (optional) |

### Environment Variables

Required in `apps/web/.env.local`:

```env
# NEAR Protocol
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=v1.utick.testnet

# Nova Protocol
NEXT_PUBLIC_NOVA_NETWORK=testnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk-6.testnet
NEXT_PUBLIC_NOVA_API_KEY=your-api-key
NEXT_PUBLIC_NOVA_ACCOUNT_ID=your-nova-account
```

See [Configuration Reference](./getting-started/configuration.md) for all variables.

---

## Project Structure

```
youtick/
├── apps/web/              # Frontend (Next.js 16 App Router)
│   ├── app/               # Pages and API routes
│   ├── components/        # React components (54+)
│   ├── hooks/             # Custom React hooks
│   └── lib/               # Business logic
│       ├── nova/          # Nova Protocol SDK (12 modules)
│       ├── crust/         # Crust Network storage (7 modules)
│       └── crypto/        # Encryption utilities
├── contracts/nft-ticket/  # NEAR smart contract (Rust, V8)
└── docs/                  # Documentation (you are here)
```

---

## Contribution Workflow

### 1. Find an Issue

- Browse [open issues](https://github.com/4rmus/youtick/issues) for tasks
- Issues tagged `good-first-issue` are ideal for new contributors
- Comment on an issue before starting work to avoid duplicated effort

### 2. Fork and Branch

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/<your-username>/youtick.git
cd youtick
git remote add upstream https://github.com/4rmus/youtick.git
git checkout -b feature/your-feature-name
```

### 3. Make Changes

- **Components**: Edit files in `apps/web/components/`
- **Business logic**: Edit files in `apps/web/lib/`
- **Pages/routes**: Edit files in `apps/web/app/`
- **Hooks**: Edit or create files in `apps/web/hooks/`
- **Contract**: Edit `contracts/nft-ticket/src/lib.rs`

### 4. Test Your Changes

```bash
# Frontend
cd apps/web
npm run lint                  # ESLint
npx tsc --noEmit              # TypeScript check
npm run build                 # Production build
npm test                      # Unit tests (Vitest)

# Contract (if modified)
cd contracts/nft-ticket
cargo test                    # Unit tests
cargo clippy -- -D warnings   # Linting
cargo fmt --check             # Formatting
```

### 5. Submit a Pull Request

```bash
git push origin feature/your-feature-name
```

Open a Pull Request against `main` with a clear description of your changes.

---

## Branch Naming

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feature/` | New features | `feature/batch-gift-links` |
| `fix/` | Bug fixes | `fix/session-key-expiry` |
| `docs/` | Documentation | `docs/nova-sdk-guide` |
| `refactor/` | Code restructuring | `refactor/error-handling` |
| `test/` | Test additions | `test/upload-flow-e2e` |

---

## Code Style

### TypeScript / React

- **Strict mode** enabled (`"strict": true` in `tsconfig.json`)
- **Functional components** with hooks (no class components)
- **Named exports** preferred over default exports
- Follow existing patterns in the codebase for consistency
- Use TanStack React Query for all blockchain data fetching
- Use `useWallet()` hook for wallet state access

### Rust (Smart Contract)

- Run `cargo fmt` before committing
- Run `cargo clippy -- -D warnings` to catch common issues
- Document all public functions with `///` doc comments
- Follow NEP standards (NEP-171 for NFT, NEP-141 for FT) where applicable
- Use V8 storage key prefixes for any new collections

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description

Examples:
feat(upload): add progress indicator for encryption step
fix(player): resolve decryption timeout on slow networks
docs(readme): update installation instructions
style(ui): align ticket card spacing
refactor(nova): simplify TEE encryption flow
test(session): add unit tests for key validation
chore(deps): update near-api-js to v7.1
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Scopes:** `upload`, `player`, `nova`, `crust`, `contract`, `session`, `gift`, `trial`, `ui`, `deps`

---

## Pull Request Checklist

Before requesting review, confirm the following:

- [ ] Code follows existing style patterns in the codebase
- [ ] Changes are tested locally (both build and runtime)
- [ ] Build passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Contract tests pass (if applicable): `cargo test`
- [ ] Contract linting passes (if applicable): `cargo clippy`
- [ ] Documentation updated where relevant
- [ ] No hardcoded API keys, private keys, or secrets
- [ ] No changes to production contract ID or mainnet configuration
- [ ] Commit messages follow conventional commits format

---

## Contract Development

### Safety Rules

Smart contract modifications require extra care due to their on-chain and financial nature:

1. **Always test on dev accounts** -- never on `youtick.near`
2. **Consider state migration implications** -- storage layout changes can break existing data
3. **Document any storage key changes** -- V8 collision-safe prefixes must be maintained
4. **Use the lazy storage pattern** for new collections to avoid migrations
5. **Get review from maintainers** before merging any contract changes
6. **Include test results** in your PR description showing the change works on testnet

### Testing on Testnet

```bash
# Create a temporary dev account
near create-account dev-$(date +%s).testnet --useFaucet

# Build and deploy
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release
near deploy dev-xxx.testnet \
  target/wasm32-unknown-unknown/release/nft_ticket.wasm \
  --initFunction new --initArgs '{"owner_id":"dev-xxx.testnet"}'

# Test contract methods
near view dev-xxx.testnet nft_metadata '{}'
```

---

## Manual Testing Flows

When making changes to user-facing features, test these critical flows locally:

| Flow | Steps | What to Verify |
|------|-------|----------------|
| **Upload** | Connect wallet, upload video, complete wizard | Session key created, Nova group created, video encrypted, NFT minted |
| **Watch** | Navigate to owned video, play | Ownership verified, decryption succeeds, video plays |
| **Purchase** | Navigate to ticket page, buy ticket | Payment processed, Nova group membership added, NFT received |
| **Gift** | Create gift links, claim as new user | Links generated, gift claimed, trial account created |
| **Trial** | Open claim page without wallet, complete onboarding | Sub-account created, onboarding key used, ticket accessible |

---

## Decentralization Principles

YouTick aims for client-side decentralization with no server dependencies. When contributing:

- **Prefer client-side operations** over server-side API routes
- **Use multi-endpoint failover** for NEAR RPC and IPFS gateways
- **Keep user data on-chain** or in decentralized storage (IPFS/Crust)
- **Respect user privacy** -- users control their keys and content
- **Non-blocking patterns** -- queue failed operations for retry rather than blocking UX

---

## Contribution Areas

### Good First Issues

- UI improvements and responsive design fixes
- Translation additions (i18n in `lib/translations.ts`)
- Test coverage expansion (see [Testing Guide](./testing.md))
- Documentation improvements

### Intermediate

- New React hooks for contract data
- IPFS gateway reliability improvements
- Error handling enhancements
- Performance optimizations

### Advanced

- Smart contract method additions
- Nova Protocol integration improvements
- Cross-chain payment flows (EVM integration)
- E2E testing with Playwright

---

## Getting Help

- **Questions:** Open an issue on GitHub with the `question` label
- **Bug Reports:** Open an issue with reproduction steps, browser info, and console output
- **Feature Proposals:** Open an issue to discuss before implementing
- **Architecture Questions:** Review [Architecture Overview](./architecture/README.md) first

---

## License

By contributing to YouTick, you agree that your contributions will be licensed under the **MIT License**.
