# YouTick MVP - Decentralized Video-on-Demand Platform

**YouTick** is a Web3-native Video-on-Demand (VOD) platform built on the **NEAR Protocol**. It enables content creators to securely upload encrypted videos to IPFS and monetize them via NFT-gated access control.

![Status](https://img.shields.io/badge/Status-MVP-green)
![NEAR](https://img.shields.io/badge/Blockchain-NEAR%20Testnet-blue)
![IPFS](https://img.shields.io/badge/Storage-IPFS%20(Lighthouse)-yellow)
![Lit](https://img.shields.io/badge/Encryption-Lit%20Protocol-orange)

## 🌟 Key Features

- ✅ **Decentralized Storage**: Videos stored on IPFS using Lighthouse Storage
- ✅ **Client-Side Encryption**: Content encrypted in browser using Lit Protocol
- ✅ **NFT-Gated Access**: Only NFT holders can decrypt and watch videos
- ✅ **Event System**: Create ticketed events for videos with custom pricing
- ✅ **Session Keys**: Seamless UX with GasTank prepaid balance system
- ✅ **Profile Dashboard**: View balances and owned tickets
- ✅ **MPC Integration**: NEAR-to-Ethereum address derivation for Lit Protocol

## 🛠️ Technology Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS, TypeScript
- **Blockchain**: NEAR Protocol (Testnet)
- **Smart Contract**: Rust (NEAR SDK 5.5)
- **Encryption**: Lit Protocol (Datil Dev Network)
- **Storage**: Lighthouse/IPFS
- **Wallet**: NEAR Wallet Selector

## 📚 Documentation

- **[SETUP.md](./SETUP.md)** - Detaylı kurulum ve deployment rehberi
- **[MVP.md](./MVP.md)** - Teknik dokümantasyon ve mimari açıklama

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- NEAR Testnet Wallet
- Lighthouse API Key

### Installation

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/youtick-mvp.git
cd youtick-mvp

# Install dependencies
cd apps/web
npm install

# Create .env.local
cat > .env.local << EOF
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=utick6.testnet
NEXT_PUBLIC_LIGHTHOUSE_API_KEY=YOUR_API_KEY
EOF

# Start dev server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 📖 Usage

### 1. Connect Wallet
Click "Connect Wallet" and sign in with your NEAR testnet account.

### 2. Deposit to GasTank (Optional)
For seamless transactions with session keys:
```bash
near call utick6.testnet deposit_funds --accountId your-account.testnet --deposit 1
```

### 3. Upload Video
1. Go to `/upload`
2. Select video file
3. Enter title, description, and price
4. Click "Upload Video"

### 4. Discover & Watch
1. Browse videos on `/discover`
2. Purchase ticket (NFT minted to your wallet)
3. Watch on `/watch` page (automatic decryption)

### 5. Profile
View your account info, balances, and tickets on `/profile`

## 🏗️ Architecture

```
Frontend (Next.js)
    ↓
NEAR Smart Contract (utick6.testnet)
    ↓
├─ NFT Management
├─ Event System
└─ GasTank (Prepaid)
    ↓
IPFS/Lighthouse ←→ Lit Protocol
(Video Storage)    (Encryption/Access Control)
```

### Smart Contract Functions

**Core:**
- `nft_mint()` - Mint video NFT
- `create_event()` - Create ticketed event
- `buy_ticket()` - Purchase event ticket
- `deposit_funds()` - Add to GasTank

**View:**
- `get_event()` - Get event details
- `get_tokens_with_video()` - User's tokens + metadata
- `get_user_balance()` - GasTank balance

## 🎯 MVP Features

### Implemented
- [x] Video upload with encryption
- [x] Event creation and management
- [x] NFT-gated video playback
- [x] Session key support (GasTank)
- [x] Profile page
- [x] Event description display
- [x] Horizontal ticket slider
- [x] Newest-first sorting

### Planned
- [ ] Livestreaming support
- [ ] Royalty system
- [ ] Social features (comments, likes)
- [ ] Creator analytics
- [ ] Mobile app

## 🔐 Security

- **Client-side encryption**: Videos never leave browser unencrypted
- **NFT ownership verification**: On-chain proof required
- **MPC signatures**: Secure NEAR-to-Ethereum bridging
- **Access control**: Lit Protocol ACCs

## 🧪 Testing

```bash
# View contract metadata
near view utick6.testnet nft_metadata

# Check user balance
near view utick6.testnet get_user_balance '{"account_id":"test.testnet"}'

# Get event
near view utick6.testnet get_event '{"encrypted_cid":"VIDEO_UUID"}'
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

- **Documentation**: See [SETUP.md](./SETUP.md) and [MVP.md](./MVP.md)
- **NEAR Discord**: [https://discord.gg/near](https://discord.gg/near)
- **Issues**: Use GitHub Issues for bug reports

---

**Contract Address**: `utick6.testnet`  
**Version**: 1.0.0 (MVP)  
**Last Updated**: 2025-12-12
