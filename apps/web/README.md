# YouTick Web Application

Next.js frontend for the YouTick decentralized video platform.

> For comprehensive documentation, see the [docs/](../../docs/) folder.

## Documentation

| Topic | Document |
|-------|----------|
| Quick Start | [02-quick-start.md](../../docs/02-quick-start.md) |
| Frontend Implementation | [09-frontend.md](../../docs/09-frontend.md) |
| Lit Protocol Integration | [05-lit-protocol.md](../../docs/05-lit-protocol.md) |
| IPFS & Lighthouse | [06-ipfs-lighthouse.md](../../docs/06-ipfs-lighthouse.md) |
| Contributing | [10-contributing.md](../../docs/10-contributing.md) |

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
# Required
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=v1.utick.testnet
LIGHTHOUSE_API_KEY=your_lighthouse_api_key

# Lit Protocol
NEXT_PUBLIC_LIT_ACTION_IPFS_CID=your_lit_action_cid
NEXT_PUBLIC_LIT_CAPACITY_TOKEN_ID=your_capacity_token_id
LIT_DELEGATION_WALLET_PRIVATE_KEY=0x...

# Relayer (for sponsored transactions)
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
  ├── near/       # NEAR blockchain integration
  ├── lit/        # Lit Protocol encryption
  ├── lighthouse/ # IPFS storage
  └── translations.ts
```

## Key Components

| Component | Description |
|-----------|-------------|
| `UploadForm` | Video upload with encryption & progress UI |
| `VideoPlayer` | Encrypted video playback with Lit decryption |
| `TicketPurchaseCard` | Event ticket purchasing |
| `WalletSelector` | NEAR wallet connection |

## Technologies

- **Next.js 16** with App Router
- **React 19** with Server Components
- **Tailwind CSS** for styling
- **@near-wallet-selector** for wallet integration
- **Lit Protocol SDK** for encryption
- **Lighthouse SDK** for IPFS uploads
