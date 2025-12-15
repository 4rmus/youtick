# YouTick

> **Decentralized Video-on-Demand Platform on NEAR Protocol**

YouTick is a Web3-native VOD platform where creators upload encrypted videos to IPFS and monetize through NFT-gated access. Built with NEAR Protocol, Lit Protocol, and Lighthouse Storage.

![NEAR](https://img.shields.io/badge/Blockchain-NEAR%20Testnet-blue)
![IPFS](https://img.shields.io/badge/Storage-IPFS%20(Lighthouse)-yellow)
![Lit](https://img.shields.io/badge/Encryption-Lit%20Protocol-orange)
![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-black)

## ✨ Features

- **Decentralized Storage** – Videos encrypted client-side and stored on IPFS via Lighthouse
- **NFT-Gated Access** – Only ticket (NFT) holders can decrypt and watch content
- **One-Click Upload** – Session keys enable single-signature batch transactions
- **Pay-Per-View Events** – Create ticketed events with custom NEAR pricing
- **MPC Integration** – Secure NEAR↔Ethereum address derivation for Lit Protocol

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS, TypeScript |
| Blockchain | NEAR Protocol (Testnet) |
| Smart Contract | Rust (NEAR SDK) |
| Encryption | Lit Protocol (Datil Dev) |
| Storage | Lighthouse / IPFS |
| Wallet | NEAR Wallet Selector |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- NEAR Testnet Wallet ([mynearwallet.com](https://testnet.mynearwallet.com))
- Lighthouse API Key ([lighthouse.storage](https://lighthouse.storage))

### Installation

```bash
# Clone repository
git clone https://github.com/4rmus/youtick-mvp.git
cd youtick-mvp

# Install dependencies
cd apps/web
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

Create `apps/web/.env.local`:

```env
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=v1-0.utick.testnet
LIGHTHOUSE_API_KEY=your_lighthouse_api_key
```

## 📖 Usage

### Upload Video

1. Connect NEAR wallet
2. Go to `/upload`
3. Select video, enter title/description/price
4. Click "Upload Video" – progress UI shows each step
5. Video is encrypted, uploaded to IPFS, and NFT minted

### Watch Video

1. Browse `/discover`
2. Purchase ticket (0.5+ NEAR)
3. Open `/watch` – video auto-decrypts for ticket holders

### Profile

View balances and owned tickets at `/profile`

## 🏗 Project Structure

```
youtick-mvp/
├── apps/
│   └── web/                 # Next.js frontend
│       ├── app/             # App router pages
│       ├── components/      # React components
│       ├── hooks/           # Custom hooks
│       └── lib/             # Utilities & services
├── contracts/
│   └── nft-ticket/          # NEAR smart contract (Rust)
│       └── src/lib.rs       # Contract logic
└── README.md
```

## 🔧 Smart Contract

Deployed to: `v1-0.utick.testnet`

### Key Functions

| Function | Description |
|----------|-------------|
| `nft_mint()` | Mint video NFT |
| `create_event()` | Create ticketed event |
| `buy_ticket()` | Purchase event ticket |
| `get_event()` | Get event details |
| `nft_tokens()` | List all tokens |

### Deploy Your Own (Optional)

```bash
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release

# Optimize WASM
wasm-opt -Oz -o target/.../youtick_nft_opt.wasm \
             target/.../youtick_nft.wasm

# Deploy
near deploy YOUR_ACCOUNT.testnet target/.../youtick_nft_opt.wasm \
     --initFunction new --initArgs '{"owner_id":"YOUR_ACCOUNT.testnet"}'
```

## 🔐 Security

- **Client-side encryption**: Videos never leave browser unencrypted
- **NFT ownership verification**: On-chain proof required for decryption
- **MPC signatures**: Secure cross-chain address derivation
- **Lit Protocol ACCs**: Programmable access control conditions

## 🧪 Testing

```bash
# View contract metadata
near view v1-0.utick.testnet nft_metadata '{}'

# List tokens
near view v1-0.utick.testnet nft_tokens '{"from_index":"0","limit":10}'

# Get event details
near view v1-0.utick.testnet get_event '{"encrypted_cid":"VIDEO_CID"}'
```

## 📄 License

MIT License

## 🔗 Links

- [NEAR Protocol](https://near.org)
- [Lit Protocol](https://litprotocol.com)
- [Lighthouse Storage](https://lighthouse.storage)

---

**Contract**: `v1-0.utick.testnet` | **Version**: 1.0.0 MVP
