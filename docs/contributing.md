# Contributing to YouTick

Thank you for your interest in contributing to YouTick. This guide covers everything you need to get started, from setting up your development environment to submitting a pull request.

---

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 18+ | Frontend development (recommend using `nvm`) |
| **Rust** | Latest stable | Smart contract development |
| **NEAR CLI** | Latest | Blockchain interaction (`npm install -g near-cli`) |
| **NEAR Testnet Wallet** | -- | Testing transactions ([testnet.mynearwallet.com](https://testnet.mynearwallet.com)) |

### Local Development

```bash
# Clone the repository
git clone https://github.com/4rmus/youtick-mvp.git
cd youtick-mvp

# Install frontend dependencies
cd apps/web
npm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local with your API keys and configuration

# Start development server
npm run dev
```

The development server starts at `http://localhost:3000` with hot reload enabled.

### Environment Variables

Required variables in `.env.local`:

```env
# NEAR Protocol
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick-prod-v1.near

# Nova Protocol
NEXT_PUBLIC_NOVA_NETWORK=mainnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk.near
NEXT_PUBLIC_NOVA_API_KEY=your-api-key
NEXT_PUBLIC_NOVA_ACCOUNT_ID=your-nova-account

# Onboarding (optional, for trial account testing)
NEXT_PUBLIC_ONBOARDING_KEY=ed25519:...
```

---

## Contract Development

### Build and Test

```bash
# Navigate to contract directory
cd contracts/nft-ticket

# Build the contract
cargo build --target wasm32-unknown-unknown --release

# Run unit tests
cargo test

# Lint with clippy
cargo clippy -- -D warnings
```

### Deploy to a Dev Account

**IMPORTANT:** Never deploy directly to `youtick-prod-v1.near` or any mainnet account during development. Always use disposable testnet dev accounts.

```bash
# Create a temporary dev account
near create-account dev-$(date +%s).testnet --useFaucet

# Deploy to the dev account
near deploy dev-xxx.testnet \
  target/wasm32-unknown-unknown/release/nft_ticket.wasm

# Test contract methods against your dev account
near view dev-xxx.testnet get_events '{}'
near call dev-xxx.testnet create_event \
  '{"encrypted_cid":"test-cid","nova_group_id":"test-group","title":"Test","description":"Test event","price":"1000000000000000000000000"}' \
  --accountId your-testnet-account.testnet --deposit 0.1
```

### Contract Change Workflow

1. Create a testnet dev account
2. Deploy your changes to the dev account
3. Test thoroughly against the dev account
4. Open a PR with your changes and test results
5. Maintainers review and approve
6. Production deployment is handled by maintainers

---

## Code Style

### TypeScript / React

- **Strict mode** enabled (`"strict": true` in `tsconfig.json`)
- **Functional components** with hooks (no class components)
- **Named exports** preferred over default exports
- Follow existing patterns in the codebase for consistency
- Use the standardized `AppError` class from `@/lib/errors` for error handling
- Use constants from `@/lib/constants` rather than inline magic values

### Rust (Smart Contract)

- Run `cargo fmt` before committing to ensure consistent formatting
- Run `cargo clippy -- -D warnings` to catch common issues
- Document all public functions with `///` doc comments
- Follow NEP standards (NEP-171 for NFT, NEP-141 for FT) where applicable

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

**Scopes (optional):** `upload`, `player`, `nova`, `contract`, `session`, `gift`, `trial`, `ui`, `deps`

---

## Pull Request Process

### Steps

1. **Fork** the repository on GitHub
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** with clear, focused commits
4. **Test your changes** locally (see Testing section below)
5. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
6. **Open a Pull Request** against `main` with a clear description

### Branch Naming

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feature/` | New features | `feature/batch-gift-links` |
| `fix/` | Bug fixes | `fix/session-key-expiry` |
| `docs/` | Documentation only | `docs/nova-sdk-guide` |
| `refactor/` | Code restructuring | `refactor/error-handling` |
| `test/` | Test additions | `test/upload-flow-e2e` |

### PR Checklist

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

## Testing

### Frontend

```bash
cd apps/web

# ESLint checks
npm run lint

# TypeScript type checking
npx tsc --noEmit

# Production build (catches build-time errors)
npm run build
```

### Smart Contract

```bash
cd contracts/nft-ticket

# Unit tests
cargo test

# Linting
cargo clippy -- -D warnings

# Formatting check
cargo fmt --check
```

### Manual Testing Flows

When making changes to user-facing features, test these critical flows locally:

| Flow | Steps | What to Verify |
|------|-------|----------------|
| **Upload** | Connect wallet, upload video, complete wizard | Session key created, Nova group created, video encrypted, NFT minted |
| **Watch** | Navigate to owned video, play | Ownership verified, decryption succeeds, video plays |
| **Purchase** | Navigate to ticket page, buy ticket | Payment processed, Nova group membership added, NFT received |
| **Gift** | Create gift links, claim as new user | Links generated, gift claimed, trial account created (if applicable) |
| **Trial** | Open claim page without wallet, complete onboarding | Sub-account created, onboarding key used, ticket accessible |

---

## Important Guidelines

### Security

- **Never commit API keys or private keys** to the repository
- Use `.env.local` for all sensitive values (this file is `.gitignore`d)
- Review your changes for potential security vulnerabilities before submitting
- Be cautious with any code that handles key material, session tokens, or financial operations
- See [Security Model](./security.md) for the full security architecture

### Contract Changes

Smart contract modifications require extra care due to their on-chain and financial nature:

1. **Always test on dev accounts first** -- never on `youtick-prod-v1.near`
2. **Consider state migration implications** -- storage layout changes can break existing data
3. **Document any storage key changes** -- storage key collisions can cause data loss
4. **Get review from maintainers** before merging any contract changes
5. **Include test results** in your PR description showing the change works on testnet

### Decentralization Principles

YouTick aims for decentralization with no server dependencies. When contributing:

- **Prefer client-side operations** over server-side API routes
- **Minimize reliance on centralized services** -- use NEAR RPC failover, Crust multi-gateway, etc.
- **Keep user data on-chain** or in decentralized storage (IPFS/Crust)
- **Respect user privacy and ownership** -- users control their keys and content
- **Log decentralization metrics** using `[DECENTRALIZATION_METRIC]` console events for transparency

---

## Getting Help

- **Questions:** Open an issue on GitHub with the `question` label
- **Bug Reports:** Open an issue with reproduction steps, browser info, and console output
- **Feature Proposals:** Open an issue to discuss before implementing (avoids wasted effort)
- **Architecture Questions:** Review the [Architecture Overview](./architecture/README.md) and [Nova Protocol](./architecture/nova-protocol.md) docs first

---

## License

By contributing to YouTick, you agree that your contributions will be licensed under the **MIT License**.
