# YouTick Web Application

Next.js frontend for the YouTick video platform.

> Aktif akis: browser tarafinda sifreleme, KMS key retrieval, Crust/IPFS delivery, NEAR ticket sahipligi.

## Documentation

| Konu | Dokuman |
|------|---------|
| System Architecture | [docs/architecture/README.md](../../docs/architecture/README.md) |
| Storage & Delivery | [docs/architecture/storage.md](../../docs/architecture/storage.md) |
| Upload Sessions | [docs/architecture/session-keys.md](../../docs/architecture/session-keys.md) |
| Smart Contract | [docs/architecture/smart-contract.md](../../docs/architecture/smart-contract.md) |
| User Flows | [docs/guides/user-flows.md](../../docs/guides/user-flows.md) |
| Contract Methods | [docs/api/contract-methods.md](../../docs/api/contract-methods.md) |

## Development

```bash
npm install
npm run dev
npm run build
```

## Environment

Minimum:

```env
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_KMS_URL=https://youtick-kms.example.workers.dev
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=false
```

Sik kullanilan opsiyoneller:

```env
NEXT_PUBLIC_ONE_CLICK_API_TOKEN=...
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true
NEXT_PUBLIC_ENABLE_LEGACY_UPLOAD_FALLBACK=true
```

Trial olusturma icin birinci yol artik server-side relayer akisi. Browser onboarding key sadece kontrollu local fallback olarak dusunulmeli.

## Project Shape

```text
app/                    # App Router pages
components/             # Upload, player, ticket, gift, provider components
hooks/                  # UI hooks
lib/
  kms/                  # Key storage, auth and decryption helpers
  crust/                # Upload and gateway logic
  intents/              # 1Click quote/swap helpers
  evm/                  # MetaMask and EVM helpers
  upload-session-manager.ts  # Upload session key management
  gift-service.ts
```

## Core Components

| Bilesen | Gorev |
|---------|-------|
| `UploadForm` | Sifreleme, upload ve publish akisi |
| `IpfsPlayer` | KMS + IPFS tabanli playback |
| `TicketPurchaseCard` | NEAR satin alma, launch sonrasi acilabilir cross-chain yolu |
| `GiftLinkGenerator` | Hediye link uretimi |
| `OnboardingKeyInit` | Trial pool health ve local fallback onboarding key kontrolu |

## Runtime Model

| Islem | Aktif yol |
|------|-----------|
| Video encryption | Browser AES-CTR |
| Key custody | Shamir shares across multi-operator KMS workers |
| Playback auth | Access-control grant + operator registry |
| IPFS upload | Crust |
| Playback | Share reconstruction + gateway failover + browser decrypt |
| Publish auth | Upload session |
| Ticket purchase | On-chain NEAR call |
| Experimental checkout | Feature flag aciksa 1Click + MetaMask + implicit NEAR account |
