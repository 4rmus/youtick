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
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
```

Sik kullanilan opsiyoneller:

```env
NEXT_PUBLIC_KMS_URL=https://youtick-kms.example.workers.dev
NEXT_PUBLIC_APP_URL=https://app.youtick.com
NEXT_PUBLIC_ONBOARDING_KEY=ed25519:...
NEXT_PUBLIC_ONE_CLICK_API_TOKEN=...
```

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
  session-manager.ts    # Legacy session-key helper
  upload-session-manager.ts
  gift-service.ts
```

## Core Components

| Bilesen | Gorev |
|---------|-------|
| `UploadForm` | Sifreleme, upload ve publish akisi |
| `IpfsPlayer` | KMS + IPFS tabanli playback |
| `TicketPurchaseCard` | NEAR ve deneysel cross-chain satin alma |
| `GiftLinkGenerator` | Hediye link uretimi |
| `OnboardingKeyInit` | Trial onboarding key bootstrap |

## Runtime Model

| Islem | Aktif yol |
|------|-----------|
| Video encryption | Browser AES-CTR |
| Key custody | KMS worker |
| IPFS upload | Crust |
| Playback | Gateway failover + browser decrypt |
| Publish auth | Upload session |
| Ticket purchase | On-chain NEAR call |
| Experimental checkout | 1Click + MetaMask + implicit NEAR account |
