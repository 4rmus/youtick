# Environment Configuration

> Web uygulamasi ve KMS worker icin pratik ortam ayarlari

---

## Web App

`apps/web/.env.local` icin en sik kullanilan alanlar:

| Degisken | Zorunlu | Aciklama |
|----------|:-------:|----------|
| `NEXT_PUBLIC_NEAR_NETWORK` | Evet | `mainnet` veya `testnet` |
| `NEXT_PUBLIC_NFT_CONTRACT_ID` | Evet | Kullanilan YouTick contract hesabi |
| `NEXT_PUBLIC_KMS_URL` | Hayir | Varsayilan KMS worker adresini ezer |
| `NEXT_PUBLIC_APP_URL` | Hayir | Hediye linklerinin taban adresi |
| `NEXT_PUBLIC_ONBOARDING_KEY` | Hayir | Client-side trial olusturma anahtari |
| `NEXT_PUBLIC_ONE_CLICK_API_TOKEN` | Hayir | 1Click quote ve swap tokeni |
| `NEXT_PUBLIC_DEPLOY_TARGET` | Hayir | Web4 build secimi |

### Ornek

```txt
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_KMS_URL=https://youtick-kms.example.workers.dev
NEXT_PUBLIC_APP_URL=https://app.youtick.com
NEXT_PUBLIC_ONBOARDING_KEY=ed25519:...
NEXT_PUBLIC_ONE_CLICK_API_TOKEN=...
```

---

## Server-only alanlar

Sadece sunucu/API tarafinda tutulmasi gerekenler:

| Degisken | Aciklama |
|----------|----------|
| `RELAYER_ACCOUNT_ID` | Opsiyonel sponsored trial relayer hesabi |
| `RELAYER_PRIVATE_KEY` | Relayer private key |

---

## KMS Worker

`workers/youtick-kms` icin gerekenler:

| Degisken | Aciklama |
|----------|----------|
| `ALLOWED_ORIGINS` | Izin verilen origin listesi |
| `NEAR_CONTRACT_ID` | `has_ticket` kontrolu icin contract ID |
| `NEAR_NETWORK` | `mainnet` veya `testnet` |

KV binding'leri:

- `VIDEO_KEYS`
- `RATE_LIMIT`
- `ACCESS_CACHE`

---

## Kisa notlar

- `NEXT_PUBLIC_*` alanlari browser'a gider.
- Gizli anahtarlar web uygulamasina degil worker veya API route'a konur.
- KMS yetkisi URL ile degil, imza + on-chain sahiplik kontrolu ile verilir.
