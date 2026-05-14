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

The web app uses **HOT Connect** (`@hot-labs/near-connect`) which mediates the
wallet picker. Any HOT-supported wallet works:

- **MyNearWallet**: [app.mynearwallet.com](https://app.mynearwallet.com)
- **HOT Wallet**: [hot.tg](https://hot.tg)
- **Meteor Wallet**: [wallet.meteorwallet.app](https://wallet.meteorwallet.app)

For testnet, use the NEAR testnet faucet: [near.org/faucet](https://near.org/faucet).

---

## Optional (Contract Development)

### Rust (current stable)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustc --version
cargo --version
```

The contracts use `near-sdk = "=5.5.0"` and build through `cargo near build`,
which requires a current stable Rust toolchain.

### WASM Target

```bash
rustup target add wasm32-unknown-unknown
```

### `cargo near`

```bash
cargo install --locked cargo-near
```

### NEAR CLI

Use `near-cli-rs` (the modern CLI). The legacy JS `near-cli` is deprecated
and not used by any of the operational scripts in `scripts/` (those drive
RPC directly via `near-api-js`).

```bash
cargo install near-cli-rs
near contract call-function as-read-only youtick.near nft_metadata json-args '{}' network-config mainnet now
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
| **Mainnet** | `youtick.near` (R2 hash `BXbiiT86A8mjVNwvZhNLhUDqvmTVUe7anHotTpQPXg2F`) | Browser: `/api/near-rpc`; ops scripts: set `NEAR_RPC_URL` when needed |
| **Testnet** | Deploy your own market/access/registry set; the previous shared dev account is no longer canonical (most recent R2 fresh deploy: `r2-1778616242663.v1-0.utick.testnet`) | Browser: `/api/near-rpc`; ops scripts: set `NEAR_RPC_URL` when needed |

The live browser app uses the same-origin Web4 proxy for RPC so wallet and
read-only contract calls do not depend on public RPC CORS behavior.

---

**Next:** [Installation Guide](./installation.md)
