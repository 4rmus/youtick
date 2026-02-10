# YouTick Web Application

Next.js frontend for the YouTick decentralized video platform.

> **Client-Side Decentralization** - No server dependencies for core operations.

> For comprehensive documentation, see the [docs/](../../docs/) folder.

## Documentation

| Topic | Document |
|-------|----------|
| Architecture Overview | [docs/architecture/overview.md](../../docs/architecture/overview.md) |
| Smart Contract | [docs/architecture/smart-contract.md](../../docs/architecture/smart-contract.md) |
| Nova Protocol | [docs/architecture/nova-protocol.md](../../docs/architecture/nova-protocol.md) |
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

# Required - Nova Protocol (TEE Encryption)
NEXT_PUBLIC_NOVA_NETWORK=testnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova.testnet
NEXT_PUBLIC_NOVA_SHADE_AGENT_URL=https://shade-testnet.phala.network

# Optional - Trial Accounts
RELAYER_ACCOUNT_ID=your-relayer.testnet
RELAYER_PRIVATE_KEY=ed25519:...
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
  ├── nova/       # Nova Protocol TEE encryption
  │   ├── index.ts        # Module entry point
  │   ├── types.ts        # Type definitions
  │   ├── auth.ts         # Session Key authentication
  │   ├── client.ts       # Upload/download client
  │   └── groups.ts       # Group-based access control
  ├── session-manager.ts  # NEAR Session Keys (signless)
  ├── chain-signatures.ts # NEAR MPC (ETH address derivation)
  ├── gift-service.ts     # Gift link system
  └── translations.ts     # i18n (TR/EN)
```

## Key Components

| Component | Description |
|-----------|-------------|
| `UploadForm` | Video upload with Nova TEE encryption |
| `IpfsPlayer` | Decrypted video playback with Nova |
| `TicketPurchaseCard` | Event ticket purchasing |
| `WalletSelector` | NEAR wallet connection |

## Technologies

- **Next.js 16** with App Router
- **React 19** with Server Components
- **Tailwind CSS 4** for styling
- **near-api-js v7** for NEAR blockchain
- **@near-wallet-selector** for wallet integration
- **Nova Protocol** for TEE-based encryption
- **IPFS** for decentralized video storage

## Decentralization

All core operations run client-side:

| Operation | Method |
|-----------|--------|
| Video Encryption | Nova Protocol TEE (client-side) |
| IPFS Upload | Nova SDK (encrypted storage) |
| IPFS Retrieval | Multi-gateway failover |
| NFT Minting | NEAR contract (prepaid balance) |
| Payments | On-chain (98% creator, 2% platform) |
| Access Control | Nova Group-based (instant revocation) |
