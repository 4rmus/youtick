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

### Server-side onboarding

Trial ve guest hesap olusturma icin onboarding key artik client bundle'a konmaz.
Anahtar server tarafinda tutulur ve `/api/onboarding-key` endpoint'i uzerinden,
rate limit ve opsiyonel Turnstile kontrolunden sonra verilir.

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
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=dev-fresh-kurulum-3.testnet
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access-1773606802388.v2-0.utick.testnet
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry-1773606802388.v2-0.utick.testnet
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

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

## Notlar

- `NEXT_PUBLIC_*` ile baslayan tum degiskenler istemciye gider.
- Gercek sirlar sadece worker veya API route tarafinda tutulmali.
- KMS anahtar korumasi icin browser degil, worker tarafindaki imza ve sahiplik kontrolleri esas alinir.

---

**Next:** [Architecture Overview](../architecture/README.md)
