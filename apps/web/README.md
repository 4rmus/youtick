# YouTick Web Application

Next.js frontend for the YouTick decentralized video platform.

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

Create `.env.local`:

```env
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=dev-cr-1767470095.utick.testnet
LIGHTHOUSE_API_KEY=your_api_key
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
