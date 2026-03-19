# Configuration Reference

> Gercekten kullanilan ortam degiskenleri ve ne ise yaradiklari

---

## Web App

`apps/web/.env.local` dosyasi icin temel ayarlar:

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
```

Bu alanlar olmadan uygulama dogru contract setine ve ağa baglanamaz.

### Gerekli

| Degisken | Aciklama | Ornek |
|----------|----------|-------|
| `NEXT_PUBLIC_NEAR_NETWORK` | `mainnet` veya `testnet` | `mainnet` |
| `NEXT_PUBLIC_MARKET_CONTRACT_ID` | Pazar ve sahiplik contract'i | `youtick.near` |
| `NEXT_PUBLIC_ACCESS_CONTRACT_ID` | Session grant contract'i | `access.youtick.near` |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` | Operator ve relayer registry contract'i | `registry.youtick.near` |
| `NEXT_PUBLIC_NFT_CONTRACT_ID` | Eski uyumluluk alias'i | `youtick.near` |

### Opsiyonel

| Degisken | Aciklama | Ne zaman gerekir |
|----------|----------|------------------|
| `NEXT_PUBLIC_KMS_URL` | Varsayilan KMS worker adresini ezer | Kendi KMS worker'in varsa |
| `NEXT_PUBLIC_APP_URL` | Hediye linklerinde kullanilan ana URL | Farkli domain veya local tunnel kullaniyorsan |
| `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT` | 1Click + MetaMask yolunu acar | Ayrica readiness review gectiyse |
| `NEXT_PUBLIC_ENABLE_LEGACY_UPLOAD_FALLBACK` | Eski upload fallback yolunu acar | Sadece bilincli gecis surecinde |
| `NEXT_PUBLIC_ONBOARDING_KEY` | Trial olusturma icin kisitli onboarding key | Client-side trial akisini acik tutmak istiyorsan |
| `NEXT_PUBLIC_ONE_CLICK_API_TOKEN` | 1Click quote ve swap istekleri icin partner tokeni | Arbitrum/Base odemelerini kullanacaksan |
| `NEXT_PUBLIC_DEPLOY_TARGET` | Web4 build davranisini degistirir | `npm run build:web4` kullaniyorsan |

### Sunucu tarafinda kalanlar

Bu degiskenler browser bundle'ina gitmemeli:

| Degisken | Aciklama |
|----------|----------|
| `RELAYER_ACCOUNT_ID` | Opsiyonel trial relayer hesabi |
| `RELAYER_PRIVATE_KEY` | Relayer private key |

Relayer fallback kullaniliyorsa bu hesap registry'de aktif olmali ve mevcut contract yuzeyinde trial olusturma yetkisine sahip olmali.

---

## Ornek Konfigurasyonlar

### Minimum mainnet

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_KMS_URL=https://youtick-kms.example.workers.dev
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=false
NEXT_PUBLIC_ENABLE_LEGACY_UPLOAD_FALLBACK=false
```

### Local gelistirme

```txt
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=dev-1773607954211-252231.v2-0.utick.testnet
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access-1773606802388.v2-0.utick.testnet
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry-1773606802388.v2-0.utick.testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=dev-1773607954211-252231.v2-0.utick.testnet
NEXT_PUBLIC_KMS_URL=http://localhost:8787
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Trial + cross-chain acik

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_KMS_URL=https://youtick-kms.example.workers.dev
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ONBOARDING_KEY=ed25519:...
NEXT_PUBLIC_ONE_CLICK_API_TOKEN=...
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true
```

---

## KMS Worker

`workers/youtick-kms` tarafinda gereken ayarlar:

| Degisken | Aciklama |
|----------|----------|
| `ALLOWED_ORIGINS` | Izin verilen origin listesi |
| `NEAR_CONTRACT_ID` | Sahiplik kontrolu icin kullanilan contract |
| `NEAR_ACCESS_CONTRACT_ID` | Session grant dogrulamasi icin kullanilan contract |
| `NEAR_REGISTRY_CONTRACT_ID` | Active operator ve relayer kaydi icin kullanilan contract |
| `REGISTRY_OPERATOR_ACCOUNT_ID` | Bu worker'in registry kaydindaki operator hesabi |
| `OPERATOR_SHARE_SECRET` | Share sifreleme icin worker sirri |
| `NEAR_NETWORK` | `mainnet` veya `testnet` |

Gerekli KV binding'leri:

- `VIDEO_KEYS`
- `RATE_LIMIT`
- `ACCESS_CACHE`

Mainnet ve testnet icin ayri KV namespace kullan. Ayni namespace ID'lerini iki ortamda da kullanma.

---

## Notlar

- `NEXT_PUBLIC_*` ile baslayan tum degiskenler istemciye gider.
- Gercek sirlar sadece worker veya API route tarafinda tutulmali.
- KMS anahtar korumasi icin browser degil, worker tarafindaki imza ve sahiplik kontrolleri esas alinir.

---

**Next:** [Architecture Overview](../architecture/README.md)
