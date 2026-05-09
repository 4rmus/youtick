# Contributing to YouTick

Bu repo icin katkida bulunurken en onemli kural su: dokumani degil, aktif kodu referans al.

---

## Hızlı baslangic

```bash
git clone https://github.com/<your-username>/youtick.git
cd youtick
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

---

## Katki alanlari

- `apps/web/components/` : urun akislarinin UI katmani
- `apps/web/lib/` : is mantigi
- `workers/youtick-kms/` : key custody ve erisim kontrolu
- `workers/storage-api/` : depolama provider secret ve health yuzeyi
- `contracts/nft-ticket/` : zincir uzerindeki mantik
- `docs/` : aktif davranisi anlatan dokumanlar

---

## Env ayari

Minimum:

```txt
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=dev-fresh-kurulum-3.testnet
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access-1773606802388.v2-0.utick.testnet
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=registry-1773606802388.v2-0.utick.testnet
```

Sik kullanilan opsiyoneller:

```txt
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ONE_CLICK_API_TOKEN=...
```

KMS endpointleri `.env.local` ile verilmez; web app aktif operatorleri registry kontratindan okur.

Tam degisken listesi ve aciklamalar: [Configuration Reference](getting-started/configuration.md).

---

## PR oncesi kontrol

- `npm run lint`
- `npm test -- --run`
- `npm run build`
- Storage API Worker degistiyse `cd workers/storage-api && npm test -- --run && npm run check`
- Contract degistiyse `cargo test`
- Dokuman degistiyse linkler ve terimler aktif akisa uyuyor mu

---

## Commit scope onerileri

- `upload`
- `player`
- `kms`
- `crust`
- `contract`
- `gift`
- `trial`
- `ui`
- `evm`
- `intents`
- `docs`

Ornek:

```text
fix(player): improve kms fallback handling
docs(contract): remove legacy compatibility references
feat(upload): tighten upload session cleanup
```

---

## Dokuman katkisi icin kural

Eger bir sayfa:

- TEE attestation
- kaldirilmis funding methodlari
- kaldirilmis prepaid methodlar

gibi artik aktif olmayan bir seyi merkezde anlatiyorsa, once kodu kontrol et ve gerekiyorsa sayfayi sadeleştir ya da kaldir.
