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
| `NEXT_PUBLIC_APP_URL` | Hediye linklerinde kullanilan ana URL | Farkli domain veya local tunnel kullaniyorsan |
| `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT` | 1Click + MetaMask yolunu acar | Sadece degeri tam olarak `true` ise; varsayilan kapali |
| `NEXT_PUBLIC_ONE_CLICK_API_TOKEN` | 1Click quote ve swap istekleri icin partner tokeni | Arbitrum/Base odemelerini kullanacaksan |
| `NEXT_PUBLIC_DEPLOY_TARGET` | Web4 build davranisini degistirir | `npm run build:web4` kullaniyorsan |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Trial/onboarding ekraninda Turnstile challenge acar | Onboarding key endpoint'ini botlara karsi korumak istiyorsan |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry hata toplama adresi | Uretimde hata izleme acacaksan |
| `NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE` | Lighthouse status/persistence kontrolunu acar | Sadece Storage API Worker hazirsa `true` yap |
| `NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD` | Lighthouse ana upload yolunu acar | Varsayilan acik; yalniz lokal tani icin `false` yap |
| `NEXT_PUBLIC_ENABLE_CRUST_UPLOAD_FALLBACK` | Lighthouse upload hata verirse Crust'a duser | Varsayilan kapali; yalniz acil tani icin `true` yap |
| `NEXT_PUBLIC_STORAGE_UPLOAD_PROVIDER` | Aktif upload provider secimi | Varsayilan `lighthouse`; yeni upload'larda bunu degistirme |
| `NEXT_PUBLIC_STORAGE_API_URL` | Storage API Worker URL'i | Lighthouse pin/status pilotu icin gerekir |
| `NEXT_PUBLIC_ENABLE_MEDIA_DELIVERY_WORKER` | Media Delivery Worker okuma yolunu acar | Sadece worker deploy ve smoke test sonrasi `true` yap |
| `NEXT_PUBLIC_MEDIA_DELIVERY_URL` | Media Delivery Worker URL'i | Encrypted IPFS manifest/segment routing icin gerekir |

### Server-side onboarding

Trial ve guest hesap olusturma icin onboarding key artik client bundle'a konmaz.
Anahtar server tarafinda tutulur ve `/api/onboarding-key` endpoint'i uzerinden,
rate limit ve Turnstile kontrolunden sonra verilir. `TURNSTILE_SECRET_KEY`
set edildiginde challenge token zorunludur.

| Degisken | Aciklama |
|----------|----------|
| `ONBOARDING_KEY` | Tek Function Call Access Key |
| `ONBOARDING_KEYS` | Virgul ile ayrilmis key havuzu; varsa `ONBOARDING_KEY` yerine kullanilir |
| `TURNSTILE_SECRET_KEY` | Turnstile dogrulama sirri |

`RELAYER_ACCOUNT_ID` ve `RELAYER_PRIVATE_KEY` artik gerekli degil.

---

## Ornek Konfigurasyonlar

### Minimum mainnet

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=false
```

### Local gelistirme

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Testnet calismasi icin eski dev hesaplarini kopyalama. Kendi market,
access ve registry contract setini deploy et, sonra bu env alanlarini kendi
testnet hesaplarinla doldur.

### Trial + cross-chain acik

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=youtick.near
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.youtick.near
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry.youtick.near
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_APP_URL=https://youtick.net
NEXT_PUBLIC_ONE_CLICK_API_TOKEN=...
NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true
```

Cross-chain checkout public alpha icin deneyseldir ve EVM v1 kapsami
Arbitrum + Base ile sinirlidir. Ethereum mainnet UI'da secilebilir degildir.

Trial ve guest hesap olusturma icin `ONBOARDING_KEY` veya `ONBOARDING_KEYS`
kullanilir. Bu anahtarlar contract owner tarafindan `add_onboarding_key` ile
kaydedilir; `NEXT_PUBLIC_` prefix'i kullanilmaz.

### Web4 proxy API davranisi

`https://youtick.net` proxy destekli Web4 modunda `/api/onboarding-key` ve
`/api/crust/*` isteklerini destekler. `https://youtick.near.page` veya ciplak
IPFS gateway uzerinden acilan static build bu API'leri calistirmaz; onboarding
key ve storage-order gerektiren akislar bu ortamda desteklenmez.

`npm run build:web4` sirasinda Next static export icin `headers()` kurallarinin
uygulanmadigini belirten uyari beklenir. Web4 CSP ve guvenlik header'lari
`workers/web4-proxy` tarafindan uygulanir.

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

## Storage ve Media Workers

`workers/storage-api` tarafinda gereken ayarlar:

| Degisken | Aciklama |
|----------|----------|
| `ALLOWED_ORIGINS` | Izin verilen origin listesi |
| `STORAGE_PROVIDER` | Simdilik `lighthouse` |
| `LIGHTHOUSE_API_BASE` | Lighthouse API base URL'i |
| `LIGHTHOUSE_UPLOAD_BASE` | Lighthouse upload base URL'i |
| `LIGHTHOUSE_API_KEY` | Wrangler secret olarak saklanan Lighthouse API key |
| `ENABLE_LIGHTHOUSE_UPLOADS` | `true` ise guarded Lighthouse write endpoint'lerini acar |
| `MAX_UPLOAD_BYTES` | Storage API Worker uzerinden kabul edilen toplam upload boyutu |
| `UPLOAD_INTENT_SECRET` | Upload intent token'larini imzalamak icin Wrangler secret |
| `UPLOAD_GUARD` | Upload intent rate-limit ve idempotency cache icin KV binding |
| `UPLOAD_RATE_LIMIT_MAX` | Account/IP basina intent limiti |
| `UPLOAD_RATE_LIMIT_WINDOW_SECONDS` | Rate-limit penceresi |

`workers/media-delivery` tarafinda gereken ayarlar:

| Degisken | Aciklama |
|----------|----------|
| `ALLOWED_ORIGINS` | Izin verilen origin listesi |
| `IPFS_GATEWAY_BASES` | Virgulle ayrilmis IPFS gateway base URL listesi |
| `CACHE_TTL_SECONDS` | Non-Range GET edge cache suresi |
| `CACHE_VERSION` | Opsiyonel cache bust anahtari |
| `UPSTREAM_TIMEOUT_MS` | Her gateway denemesi icin zaman asimi |

Media Delivery Worker encrypted IPFS asset route eder. AES key, decrypted video
ve KMS share bu Worker'a verilmez.

---

## Notlar

- `NEXT_PUBLIC_*` ile baslayan tum degiskenler istemciye gider.
- Gercek sirlar sadece worker veya API route tarafinda tutulmali.
- KMS anahtar korumasi icin browser degil, worker tarafindaki imza ve sahiplik kontrolleri esas alinir.

---

**Next:** [Architecture Overview](../architecture/README.md)
