# Prerequisites

> System requirements for YouTick development

---

## Required

### Node.js (24 LTS)

```bash
# Check version
node --version   # Should be 24.x

# Install via nvm (recommended)
nvm install 24
nvm use 24
```

### npm (10+)

```bash
npm --version   # Should be 10.x or higher
```

### Git

```bash
git --version
```

### NEAR Wallet

You need a NEAR wallet to interact with the platform:

- **MyNearWallet**: [app.mynearwallet.com](https://app.mynearwallet.com)
- **HOT Wallet**: [hot.tg](https://hot.tg)
- **Meteor Wallet**: [wallet.meteorwallet.app](https://wallet.meteorwallet.app)

For testnet development, use the NEAR testnet faucet:
- [near.org/faucet](https://near.org/faucet)

---

## Optional (Contract Development)

### Rust (1.75+)

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Verify
rustc --version   # Should be 1.75+
cargo --version
```

### WASM Target

```bash
rustup target add wasm32-unknown-unknown
```

### NEAR CLI

```bash
npm install -g near-cli

# Or use npx without installing
npx near-cli view youtick.near nft_metadata '{}'
```

---

## Recommended Tools

| Tool | Purpose |
|------|---------|
| **VS Code** | IDE with TypeScript + Rust support |
| **Rust Analyzer** (VS Code extension) | Rust language server |
| **ESLint** (VS Code extension) | JavaScript/TypeScript linting |
| **NEAR Explorer** | [nearblocks.io](https://nearblocks.io) — Block explorer |
| **IPFS Companion** | Browser extension for IPFS gateway resolution |

---

## Network Reference

| Network | Contract ID | RPC Endpoint |
|---------|-------------|-------------|
| **Mainnet** | `youtick.near` | Browser: `/api/near-rpc`; ops scripts: set `NEAR_RPC_URL` when needed |
| **Testnet** | `dev-1773607954211-252231.v2-0.utick.testnet` | Browser: `/api/near-rpc`; ops scripts: set `NEAR_RPC_URL` when needed |

The live browser app uses the same-origin Web4 proxy for RPC so wallet and
read-only contract calls do not depend on public RPC CORS behavior.

---

**Next:** [Installation Guide](./installation.md)
