# Contributing to YouTick

Thank you for your interest in contributing to YouTick! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js** 18+ (recommend using nvm)
- **Rust** (for contract development)
- **NEAR CLI** (`npm install -g near-cli`)
- **NEAR Testnet Wallet** ([mynearwallet.com](https://testnet.mynearwallet.com))

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
# Edit .env.local with your API keys

# Start development server
npm run dev
```

### Contract Development

```bash
# Navigate to contract directory
cd contracts/nft-ticket

# Build the contract
cargo build --target wasm32-unknown-unknown --release

# Run tests
cargo test

# Deploy to a dev account (NOT production!)
near create-account dev-$(date +%s).testnet --useFaucet
near deploy dev-xxx.testnet target/wasm32-unknown-unknown/release/nft_ticket.wasm
```

## Code Style

### TypeScript/React

- Use TypeScript strict mode
- Follow existing patterns in the codebase
- Use functional components with hooks
- Prefer named exports over default exports

### Rust (Smart Contract)

- Follow Rust formatting guidelines (`cargo fmt`)
- Use `cargo clippy` for linting
- Document public functions with `///` comments

### Commit Messages

Use conventional commits format:

```
type(scope): description

Examples:
feat(upload): add progress indicator for encryption
fix(player): resolve decryption timeout on slow networks
docs(readme): update installation instructions
refactor(nova): simplify TEE encryption flow
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** with clear, focused commits
4. **Test your changes**:
   ```bash
   npm run lint
   npm run build
   ```
5. **Push** to your fork and open a PR

### PR Checklist

- [ ] Code follows existing style patterns
- [ ] Changes are tested locally
- [ ] Build passes (`npm run build`)
- [ ] Linting passes (`npm run lint`)
- [ ] Contract tests pass (if applicable)
- [ ] Documentation updated (if needed)

## Testing

### Frontend

```bash
cd apps/web
npm run lint    # ESLint checks
npm run build   # Type checking + build
```

### Smart Contract

```bash
cd contracts/nft-ticket
cargo test                    # Unit tests
cargo clippy                  # Linting
```

### Manual Testing Flows

Test these user flows locally:

1. **Upload Flow**: Connect wallet → Upload video → Verify NFT minted
2. **Watch Flow**: Purchase ticket → Verify decryption works
3. **Gift Flow**: Create gift link → Claim as new user
4. **Trial Account**: Claim gift without wallet → Verify sub-account created

## Important Guidelines

### Security

- **Never commit API keys or private keys**
- Use `.env.local` for sensitive values
- Review changes for potential vulnerabilities
- Be cautious with contract modifications

### Contract Changes

Contract modifications require extra care:

1. Test on dev accounts first, never on `v1.utick.testnet`
2. Consider state migration implications
3. Document any storage key changes
4. Get review from maintainers before merging

### Decentralization Principles

YouTick aims for maximum decentralization. When contributing:

- Prefer client-side operations over server-side
- Minimize reliance on centralized services
- Keep user data on-chain or in decentralized storage
- Respect user privacy and ownership

## Getting Help

- **Questions**: Open an issue with the `question` label
- **Bugs**: Open an issue with reproduction steps
- **Features**: Open an issue to discuss before implementing

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
