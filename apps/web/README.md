# YouTick Web Application

Next.js frontend for the YouTick decentralized video platform.

> **Client-First Architecture** - Core media/ticket flows run in-browser, with minimal backend services for KMS and sponsored onboarding.

> For comprehensive documentation, see the [docs/](../../docs/) folder.

## Documentation

| Topic | Document |
|-------|----------|
| Smart Contract | [docs/architecture/smart-contract.md](../../docs/architecture/smart-contract.md) |
| Encryption & KMS | [docs/architecture/storage.md](../../docs/architecture/storage.md) |
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
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near

# Optional - KMS worker URL override
NEXT_PUBLIC_KMS_URL=https://youtick-kms.example.workers.dev
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
  ├── kms/        # Cloudflare Edge KMS integration
  │   ├── client.ts       # Store/retrieve encryption keys
  │   ├── crypto.ts       # AES encryption helpers
  │   └── signatures.ts   # Request signing helpers
  ├── session-manager.ts  # NEAR Session Keys (signless)
  ├── chain-signatures.ts # NEAR MPC (ETH address derivation)
  ├── gift-service.ts     # Gift link system
  └── translations.ts     # i18n (TR/EN)
```

## Key Components

| Component | Description |
|-----------|-------------|
| `UploadForm` | Video upload with client-side encryption + KMS key storage |
| `IpfsPlayer` | Decrypted video playback via KMS authorized key retrieval |
| `TicketPurchaseCard` | Event ticket purchasing |
| `WalletSelector` | NEAR wallet connection |

## Technologies

- **Next.js 16** with App Router
- **React 19** with Server Components
- **Tailwind CSS 4** for styling
- **near-api-js v7** for NEAR blockchain
- **@near-wallet-selector** for wallet integration
- **Cloudflare Worker + KV** for key custody and access checks
- **IPFS** for decentralized video storage

## Decentralization

All core operations run client-side:

| Operation | Method |
|-----------|--------|
| Video Encryption | Browser AES (client-side) |
| Key Custody | KMS Worker (signed requests + on-chain access checks) |
| IPFS Upload | Crust gateway (encrypted blobs) |
| IPFS Retrieval | Multi-gateway failover |
| NFT Minting | NEAR contract (prepaid balance) |
| Payments | On-chain (98% creator, 2% platform) |
| Access Control | NFT ownership + contract `has_ticket` checks |
