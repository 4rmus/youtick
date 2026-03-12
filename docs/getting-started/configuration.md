# Configuration Reference

> Gercekten kullanilan ortam degiskenleri ve ne ise yaradiklari

---

## Web App

`apps/web/.env.local` dosyasi icin temel ayarlar:

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
```

Bu iki degisken olmadan uygulama dogru contract ve ağa baglanamaz.

### Gerekli

| Degisken | Aciklama | Ornek |
|----------|----------|-------|
| `NEXT_PUBLIC_NEAR_NETWORK` | `mainnet` veya `testnet` | `mainnet` |
| `NEXT_PUBLIC_NFT_CONTRACT_ID` | YouTick contract hesabi | `youtick.near` |

### Opsiyonel

| Degisken | Aciklama | Ne zaman gerekir |
|----------|----------|------------------|
| `NEXT_PUBLIC_KMS_URL` | Varsayilan KMS worker adresini ezer | Kendi KMS worker'in varsa |
| `NEXT_PUBLIC_APP_URL` | Hediye linklerinde kullanilan ana URL | Farkli domain veya local tunnel kullaniyorsan |
| `NEXT_PUBLIC_ONBOARDING_KEY` | Trial olusturma icin kisitli onboarding key | Client-side trial akisini acik tutmak istiyorsan |
| `NEXT_PUBLIC_ONE_CLICK_API_TOKEN` | 1Click quote ve swap istekleri icin partner tokeni | Arbitrum/Base odemelerini kullanacaksan |
| `NEXT_PUBLIC_DEPLOY_TARGET` | Web4 build davranisini degistirir | `npm run build:web4` kullaniyorsan |

### Sunucu tarafinda kalanlar

Bu degiskenler browser bundle'ina gitmemeli:

| Degisken | Aciklama |
|----------|----------|
| `RELAYER_ACCOUNT_ID` | Opsiyonel trial relayer hesabi |
| `RELAYER_PRIVATE_KEY` | Relayer private key |

---

## Ornek Konfigurasyonlar

### Minimum mainnet

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
```

### Local gelistirme

```txt
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=v1.utick.testnet
NEXT_PUBLIC_KMS_URL=http://localhost:8787
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Trial + cross-chain acik

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_KMS_URL=https://youtick-kms.example.workers.dev
NEXT_PUBLIC_APP_URL=https://app.youtick.com
NEXT_PUBLIC_ONBOARDING_KEY=ed25519:...
NEXT_PUBLIC_ONE_CLICK_API_TOKEN=...
```

---

## KMS Worker

`workers/youtick-kms` tarafinda gereken ayarlar:

| Degisken | Aciklama |
|----------|----------|
| `ALLOWED_ORIGINS` | Izin verilen origin listesi |
| `NEAR_CONTRACT_ID` | Sahiplik kontrolu icin kullanilan contract |
| `NEAR_NETWORK` | `mainnet` veya `testnet` |

Gerekli KV binding'leri:

- `VIDEO_KEYS`
- `RATE_LIMIT`
- `ACCESS_CACHE`

---

## Notlar

- `NEXT_PUBLIC_*` ile baslayan tum degiskenler istemciye gider.
- Gercek sirlar sadece worker veya API route tarafinda tutulmali.
- KMS anahtar korumasi icin browser degil, worker tarafindaki imza ve sahiplik kontrolleri esas alinir.

---

**Next:** [Architecture Overview](../architecture/README.md)
