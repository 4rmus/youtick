# YouTick - Kurulum Rehberi

YouTick, NEAR Protocol üzerinde çalışan merkezi olmayan bir video paylaşım platformudur. Bu rehber, projeyi yerel ortamınızda kurmanız için gereken adımları detaylı olarak açıklar.

## 📋 Gereksinimler

### Sistem Gereksinimleri
- **Node.js**: v18 veya üzeri
- **npm** veya **yarn**: Paket yöneticisi
- **Rust**: v1.70+ (smart contract geliştirme için)
- **NEAR CLI**: v0.22+
- **Git**: Versiyon kontrolü için

### Hesaplar ve API Anahtarları
- **NEAR Testnet Wallet**: [https://testnet.mynearwallet.com](https://testnet.mynearwallet.com)
- **Lighthouse API Key**: [https://lighthouse.storage](https://lighthouse.storage) - IPFS dosya depolama için

## 🚀 Kurulum Adımları

### 1. Depoyu Klonlayın

```bash
git clone https://github.com/YOUR_USERNAME/youtick-mvp.git
cd youtick-mvp
```

### 2. Frontend Bağımlılıklarını Yükleyin

```bash
cd apps/web
npm install
```

### 3. Ortam Değişkenlerini Ayarlayın

`apps/web` dizininde `.env.local` dosyası oluşturun:

```bash
# NEAR Protocol Ayarları
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=utick6.testnet

# Lighthouse (IPFS) Ayarları
NEXT_PUBLIC_LIGHTHOUSE_API_KEY=YOUR_LIGHTHOUSE_API_KEY
```

**Önemli Notlar:**
- `NEXT_PUBLIC_NFT_CONTRACT_ID`: Mevcut contract adresi `utick6.testnet`
- Lighthouse API key'inizi [lighthouse.storage](https://lighthouse.storage) adresinden alabilirsiniz

### 4. Geliştirme Sunucusunu Başlatın

```bash
npm run dev
```

Uygulama [http://localhost:3000](http://localhost:3000) adresinde çalışmaya başlayacaktır.

## 🔧 Smart Contract Deployment (Opsiyonel)

Eğer kendi contract'ınızı deploy etmek isterseniz:

### 1. Rust ve NEAR CLI Kurulumu

```bash
# Rust kurulumu
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# NEAR CLI kurulumu
npm install -g near-cli-rs
```

### 2. Contract'ı Build Edin

```bash
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release
```

### 3. Contract'ı Optimize Edin

```bash
# wasm-opt kurulumu (eğer yoksa)
# macOS:
brew install binaryen

# Linux:
sudo apt-get install binaryen

# Optimize etme
wasm-opt -Oz -o target/wasm32-unknown-unknown/release/youtick_nft_opt.wasm \
         target/wasm32-unknown-unknown/release/youtick_nft.wasm
```

### 4. NEAR Hesabı Oluşturun

```bash
# Testnet hesabı oluşturun (örn: your-contract.testnet)
near create-account your-contract.testnet --useFaucet
```

### 5. Contract'ı Deploy Edin

```bash
near deploy your-contract.testnet \
     target/wasm32-unknown-unknown/release/youtick_nft_opt.wasm \
     --initFunction new \
     --initArgs '{"owner_id":"your-contract.testnet"}'
```

### 6. Environment Variable'ı Güncelleyin

`.env.local` dosyasında:

```bash
NEXT_PUBLIC_NFT_CONTRACT_ID=your-contract.testnet
```

## 💰 GasTank Kullanımı

YouTick, session key özelliği için GasTank (prepaid balance) sistemi kullanır:

### 1. Hesabınıza NEAR Yatırın

```bash
near call utick6.testnet deposit_funds --accountId your-account.testnet --deposit 1
```

Bu komut 1 NEAR'i GasTank'e yatırır ve session key ile işlem yapmanıza olanak sağlar.

### 2. Bakiyenizi Kontrol Edin

Profile sayfasından (`/profile`) GasTank bakiyenizi görebilirsiniz.

## 🧪 Test Etme

### 1. NEAR Wallet Bağlantısı

- Uygulamayı açın
- "Connect Wallet" butonuna tıklayın
- NEAR testnet wallet'ınızla giriş yapın

### 2. Video Yükleme

1. `/upload` sayfasına gidin
2. Video dosyası seçin
3. Başlık ve açıklama girin
4. Ticket fiyatı belirleyin (NEAR cinsinden)
5. "Upload Video" butonuna tıklayın

### 3. Video İzleme

1. `/discover` sayfasından video seçin
2. Ticket satın alın
3. `/watch` sayfasında videoyu izleyin

### 4. Profile Sayfası

`/profile` sayfasından:
- Hesap bilgilerinizi
- Wallet ve GasTank bakiyelerinizi
- Sahip olduğunuz ticket'ları görüntüleyebilirsiniz

## 🐛 Sorun Giderme

### Port 3000 Zaten Kullanımda

```bash
# Port 3000'i kullanan process'i bulun ve sonlandırın
lsof -ti:3000 | xargs kill -9

# Veya farklı bir port kullanın
npm run dev -- -p 3001
```

### Contract Method Not Found

Contract'ın doğru deploy edildiğinden emin olun:

```bash
near view utick6.testnet nft_metadata
```

### NEAR Rate Limiting

Çok fazla istek yapıyorsanız, birkaç dakika bekleyin veya farklı bir RPC endpoint kullanın:

```bash
# Alternatif RPC
export NEAR_CLI_TESTNET_RPC_SERVER_URL=https://rpc.testnet.near.org
```

## 📚 Ek Kaynaklar

- **NEAR Dokümantasyonu**: [https://docs.near.org](https://docs.near.org)
- **Next.js Dokümantasyonu**: [https://nextjs.org/docs](https://nextjs.org/docs)
- **Lit Protocol**: [https://developer.litprotocol.com](https://developer.litprotocol.com)
- **Lighthouse Storage**: [https://docs.lighthouse.storage](https://docs.lighthouse.storage)

## 🆘 Destek

Sorunlarla karşılaşırsanız:
- GitHub Issues açabilirsiniz
- NEAR Discord kanalında sorabilirsiniz: [https://discord.gg/near](https://discord.gg/near)
