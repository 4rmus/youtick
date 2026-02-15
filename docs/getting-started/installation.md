# Installation Guide

> Complete setup instructions for YouTick development

---

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Node.js** | 18+ LTS | Frontend runtime |
| **npm** | 9+ | Package management |
| **Git** | Latest | Version control |
| **Rust** | 1.75+ | Smart contract development (optional) |
| **wasm32-unknown-unknown** | — | WASM compilation target (optional) |

> See [prerequisites.md](./prerequisites.md) for detailed setup of each tool.

---

## 1. Clone the Repository

```bash
git clone https://github.com/4rmus/youtick.git
cd youtick
```

## 2. Frontend Setup

```bash
# Navigate to the web app
cd apps/web

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
```

Edit `.env.local` with your configuration. See [configuration.md](./configuration.md) for all variables.

**Minimum required variables:**

```env
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_NOVA_NETWORK=mainnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk.near
```

## 3. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Smart Contract Setup (Optional)

For developers working on the Rust smart contract:

### Install Rust Toolchain

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WASM target
rustup target add wasm32-unknown-unknown
```

### Build Contract

```bash
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release
```

The compiled WASM binary is output to:
```
target/wasm32-unknown-unknown/release/nft_ticket.wasm
```

### Run Contract Tests

```bash
# Unit tests
cargo test

# With output
cargo test -- --nocapture
```

### Deploy to Testnet

```bash
# Create a dev account
near create-account dev-$(date +%s).testnet --useFaucet

# Deploy
near deploy dev-xxx.testnet \
  target/wasm32-unknown-unknown/release/nft_ticket.wasm \
  --initFunction new \
  --initArgs '{"owner_id":"dev-xxx.testnet"}'

# Verify deployment
near view dev-xxx.testnet nft_metadata '{}'
```

> Never deploy directly to `youtick.near` (production). Always use testnet dev accounts.

---

## Available Scripts

### Frontend (`apps/web/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (localhost:3000) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest test suite |
| `npm test -- --coverage` | Run tests with coverage report |

### Contract (`contracts/nft-ticket/`)

| Command | Description |
|---------|-------------|
| `cargo build --target wasm32-unknown-unknown --release` | Build WASM binary |
| `cargo test` | Run unit tests |
| `cargo fmt` | Format code |
| `cargo clippy` | Lint with Clippy |

---

## Verifying Your Setup

After starting the dev server:

1. Open [http://localhost:3000](http://localhost:3000)
2. You should see the YouTick landing page
3. Click "Connect Wallet" to test NEAR wallet integration
4. Navigate to `/discover` to verify contract data loading

### Troubleshooting

| Issue | Solution |
|-------|----------|
| `Module not found` | Run `npm install` in `apps/web/` |
| NEAR RPC errors | Check `NEXT_PUBLIC_NEAR_NETWORK` in `.env.local` |
| Nova API errors | Verify Nova API key and account ID |
| Build fails | Ensure Node.js 18+ and npm 9+ |
| Rust build fails | Run `rustup target add wasm32-unknown-unknown` |

---

**Next:** [Configuration Reference](./configuration.md)
