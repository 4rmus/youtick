# YouTick Web Application

Next.js frontend for the YouTick decentralized video platform.

> **100% Client-Side Decentralization** - No server dependencies for core operations.

> For comprehensive documentation, see the [docs/](../../docs/) folder.

## Documentation

| Topic | Document |
|-------|----------|
| Architecture Overview | [docs/architecture/overview.md](../../docs/architecture/overview.md) |
| Smart Contract | [docs/architecture/smart-contract.md](../../docs/architecture/smart-contract.md) |
| Crust Storage | [docs/architecture/crust-storage.md](../../docs/architecture/crust-storage.md) |
| Lit Protocol | [docs/architecture/lit-protocol.md](../../docs/architecture/lit-protocol.md) |
| Session Keys | [docs/architecture/session-keys.md](../../docs/architecture/session-keys.md) |
| Chain Signatures | [docs/architecture/chain-signatures.md](../../docs/architecture/chain-signatures.md) |
| User Flows | [docs/guides/user-flows.md](../../docs/guides/user-flows.md) |
| Contract Methods | [docs/api/contract-methods.md](../../docs/api/contract-methods.md) |

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Environment Variables

Create `.env.local` (see [.env.example](.env.example) for template):

```env
# Required - NEAR Network
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=v1.utick.testnet

# Required - Lit Protocol
NEXT_PUBLIC_LIT_NETWORK=datil-test
NEXT_PUBLIC_LIT_ACTION_IPFS_CID=your_lit_action_cid
NEXT_PUBLIC_LIT_CAPACITY_TOKEN_ID=your_capacity_token_id
LIT_DELEGATION_WALLET_PRIVATE_KEY=0x...

# Optional - Trial Accounts
RELAYER_ACCOUNT_ID=your-relayer.testnet
RELAYER_PRIVATE_KEY=ed25519:...

# Note: Crust W3Auth uses NEAR Session Key signatures
# No API keys required for IPFS storage
```

## Project Structure

```
app/              # Next.js App Router pages
  ├── discover/   # Video discovery page
  ├── upload/     # Video upload page
  ├── watch/      # Video playback page
  ├── profile/    # User profile page
  └── ticket/     # Ticket purchase page

components/       # React components
  ├── landing/    # Landing page sections
  ├── ui/         # Reusable UI components
  └── providers/  # Context providers

hooks/            # Custom React hooks
  ├── useAllVideos.ts
  ├── useOwnedTokens.ts
  └── useNearWallet.ts

lib/              # Utilities & services
  ├── crust/      # Crust Network IPFS storage
  │   ├── index.ts        # Module entry point
  │   ├── types.ts        # Type definitions
  │   ├── w3auth.ts       # W3Auth token generation
  │   ├── client.ts       # Upload client
  │   └── gateway.ts      # Multi-gateway failover
  ├── lit.ts              # Lit Protocol encryption
  ├── session-manager.ts  # NEAR Session Keys (signless)
  ├── chain-signatures.ts # NEAR MPC (ETH address derivation)
  ├── gift-service.ts     # Gift link system
  └── translations.ts     # i18n (TR/EN)
```

## Key Components

| Component | Description |
|-----------|-------------|
| `UploadForm` | Video upload with Lit encryption & Crust IPFS |
| `IpfsPlayer` | Decrypted video playback with multi-gateway |
| `VideoPlayer` | Video player with Lit decryption |
| `TicketPurchaseCard` | Event ticket purchasing |
| `WalletSelector` | NEAR wallet connection |

## Technologies

- **Next.js 16** with App Router
- **React 19** with Server Components
- **Tailwind CSS 4** for styling
- **near-api-js v7** for NEAR blockchain
- **@near-wallet-selector** for wallet integration
- **Lit Protocol SDK 7.3.1** for encryption
- **Crust Network** for decentralized IPFS storage (W3Auth)

## Decentralization

All core operations run client-side:

| Operation | Method |
|-----------|--------|
| Video Encryption | Lit Protocol (client-side) |
| IPFS Upload | Crust W3Auth (Session Key signed) |
| IPFS Retrieval | Multi-gateway failover |
| NFT Minting | NEAR contract (prepaid balance) |
| PKP Minting | NEAR MPC Chain Signatures |
| Payments | On-chain (98% creator, 2% platform) |
