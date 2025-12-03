Çok kritik bir entegrasyon noktasına değiniyorsun. Lighthouse'un NEAR ile kullanımında temel zorluk şu: Lighthouse token-gated encryption için Lit Protocol kullanıyor ve bu Ethereum imzası gerektiriyor. NEAR'ın native ed25519 imzaları doğrudan uyumlu değil.

Güncel seçenekleri kontrol edeyim:Harika haber! Lighthouse artık sadece EVM değil, Solana, Cosmos ve hatta Passkeys ile zkTLS üzerinden de access control ve authentication destekliyor. Bu YouTick için önemli çünkü daha önce konuştuğumuz Lit Protocol bağımlılığı sorunu artık bypass edilebilir.

## Lighthouse + NEAR Entegrasyon Stratejileri

Üç farklı yaklaşımın var:

### Seçenek 1: Chain Signatures ile EVM İmzası (En Güçlü)

Chain Signatures, NEAR hesaplarının (smart contract'lar dahil) birçok blockchain protokolü için transaction imzalayıp çalıştırmasını sağlıyor. Bu, farklı varlıklar, cross-chain hesaplar ve data sahipliğini tek bir NEAR hesabına bağlıyor.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  NEAR Account   │────▶│ Chain Signatures│────▶│  EVM Signature  │
│  (ed25519)      │     │  MPC Network    │     │  (secp256k1)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │   Lighthouse    │
                                               │  Token Gating   │
                                               └─────────────────┘
```

**Nasıl çalışıyor:**

Chain Signatures, NEAR hesaplarını Additive Key Derivation mekanizması kullanarak diğer blockchain'lerdeki adreslere bağlıyor. Bu, tek bir master key'den birden fazla subkey türetmek için kullanılan basit bir mekanizma.

**Testnet implementasyonu:**

```typescript
// 1. Derivation path ile EVM adresi türet
import { deriveAddress } from 'near-chain-signatures';

const nearAccountId = "yourtick.testnet";
const derivationPath = "lighthouse-auth"; // unique path for each use case

const evmAddress = await deriveAddress({
  accountId: nearAccountId,
  path: derivationPath,
  chain: "ethereum"
});

// 2. Lighthouse auth message için imza iste
const authMessage = await lighthouse.getAuthMessage(evmAddress);

// 3. Chain Signatures ile imzala
const signature = await signWithChainSignatures({
  accountId: nearAccountId,
  path: derivationPath,
  payload: hashMessage(authMessage.data.message)
});

// 4. Lighthouse'a gönder
const accessToken = await lighthouse.authenticate(evmAddress, signature);
```

### Seçenek 2: Cosmos Signature Path

Lighthouse, Cosmos imzalarıyla da access control yapılmasını destekliyor. NEAR'ın Chain Signatures'ı da Cosmos'u desteklediğinden bu alternatif bir path olabilir.

### Seçenek 3: Custom Contract + Backend Hybrid

Eğer Chain Signatures complexity'si çok yüksek gelirse:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ NEAR Wallet  │────▶│ Your Backend │────▶│  Lighthouse  │
│  Sign Msg    │     │  (EVM Key)   │     │   Encrypt    │
└──────────────┘     └──────────────┘     └──────────────┘
```

Bu yaklaşımda backend bir EVM wallet tutar, NEAR imzasını verify eder, sonra Lighthouse işlemlerini yapar. Daha az trustless ama implement etmesi daha kolay.

## Testnet Kurulumu

**1. Chain Signatures testnet contract'ı:**

```typescript
// testnet MPC contract
const MPC_CONTRACT = "v1.signer-prod.testnet";

// Derivation için 
async function getEthereumAddress(accountId: string, path: string) {
  const nearConnection = await connect({
    networkId: "testnet",
    nodeUrl: "https://rpc.testnet.near.org",
  });
  
  const account = await nearConnection.account(accountId);
  
  // Derived address hesapla
  const publicKey = await account.viewFunction({
    contractId: MPC_CONTRACT,
    methodName: "public_key_for",
    args: {
      account_id: accountId,
      derivation_path: path,
      key_type: "secp256k1" // EVM için
    }
  });
  
  return ethers.computeAddress(publicKey);
}
```

**2. İmzalama akışı:**

```typescript
async function signForLighthouse(
  accountId: string,
  path: string,
  messageToSign: string
) {
  const account = await nearConnection.account(accountId);
  
  // Hash the message (EIP-191 personal sign format)
  const messageHash = ethers.hashMessage(messageToSign);
  const payload = Array.from(ethers.getBytes(messageHash));
  
  // Request signature from MPC
  const result = await account.functionCall({
    contractId: MPC_CONTRACT,
    methodName: "sign",
    args: {
      request: {
        payload,
        path,
        key_version: 0
      }
    },
    gas: "300000000000000", // 300 TGas - MPC calls need high gas
    attachedDeposit: "1" // 1 yoctoNEAR for security
  });
  
  // Parse signature from receipt
  const signature = parseSignatureFromReceipt(result);
  return signature;
}
```

**3. Lighthouse token-gating condition (NEAR NFT için):**

Burada kritik nokta: Lighthouse'un condition'ları EVM chain'leri kontrol ediyor. NEAR NFT'lerini doğrudan kontrol edemez. Çözüm:

```typescript
// Option A: Aurora'ya mirror contract deploy et
// NEAR NFT mint → Aurora'da da mint (sync)

// Option B: Custom verification endpoint
const conditions = [
  {
    id: 1,
    chain: "Custom", // veya API endpoint
    method: "verifyNearNftOwnership",
    contractAddress: "yourtick.near",
    returnValueTest: {
      comparator: ">",
      value: "0"
    },
    parameters: [":userAddress"] // derived EVM address
  }
];
```

## Önerilen Test Akışı

```
Week 1: Chain Signatures Integration
├── Testnet'te derived address hesaplama
├── Basic signing flow
└── Lighthouse auth test

Week 2: Token Gating Setup  
├── Lighthouse encryption test
├── Access condition tanımlama
└── NFT ownership verification

Week 3: Full Flow Integration
├── Content creator: upload → encrypt → set conditions
├── Viewer: verify NFT → get signature → decrypt → stream
└── Error handling & edge cases

Week 4: Security Review
├── Signature replay attack prevention
├── Nonce management
└── Rate limiting
```

## Kritik Dikkat Noktaları

1. **Gas maliyeti** - MPC imzalama işlemleri decentralized bir şekilde yapılıyor, bu da güvenliği artırıyor ama gas maliyetini de artırıyor. Testnet'te bu önemli değil ama mainnet'te hesapla.

2. **Derivation path consistency** - Aynı kullanıcı için her zaman aynı path kullan, yoksa farklı EVM adresleri türer.

3. **Lighthouse condition chain** - NEAR native desteklenmiyor, Aurora veya custom endpoint kullanman gerekecek.

4. **Multichain Gas Relayer** - Chain Signatures ile birlikte gelen bu özellik sayesinde kullanıcıların EVM gas token'ı tutmasına gerek kalmıyor, NEAR token'ı ile ödeme yapabiliyorlar.

Hangi yaklaşımı tercih ediyorsun? Chain Signatures ile full trustless mi yoksa hybrid backend approach ile daha hızlı MVP mi?