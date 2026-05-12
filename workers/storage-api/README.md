# YouTick Storage API Worker

Storage API Worker, IPFS persistence provider secrets, provider status checks
ve flag kontrollu Lighthouse upload pilotu icin ayrilmis Worker yuzeyidir.
Buyuk production upload ve media delivery bu Worker'in ana sorumlulugu degildir.

## Sorumluluk

- Lighthouse API key tarayiciya verilmez.
- Lighthouse upload sadece `ENABLE_LIGHTHOUSE_UPLOADS=true` ile acilir.
- Upload body'leri `MAX_UPLOAD_BYTES` ile sinirlanir.
- `/uploads/intent` self-declared `accountId` kabul etmez; once NEP-413
  challenge/verify akisiyle kisa omurlu upload auth token gerekir.
- Buyuk video upload yolu tek directory body yerine parca parca `/uploads/file`
  uzerinden akar.
- KMS, ticket, ban, session grant ve key-share kararlari bu Worker'a tasinmaz.
- Media delivery ve Range/cache isi ayri bir Worker fazinda ele alinir.

## Env ve secret

- `ALLOWED_ORIGINS`: Browser tarafindan izin verilen origin listesi.
- `STORAGE_PROVIDER`: Simdilik `lighthouse`.
- `LIGHTHOUSE_API_BASE`: Lighthouse API base URL. Default: `https://api.lighthouse.storage`.
- `LIGHTHOUSE_UPLOAD_BASE`: Lighthouse upload base URL. Default: `https://upload.lighthouse.storage`.
- `LIGHTHOUSE_API_KEY`: Wrangler secret olarak verilir.
- `ENABLE_LIGHTHOUSE_UPLOADS`: `true` ise `/uploads/directory` acilir. Default kapali.
- `MAX_UPLOAD_BYTES`: Worker uzerinden kabul edilen toplam upload boyutu. Default 100 MiB.
- `UPLOAD_INTENT_SECRET`: Upload intent token'larini imzalamak icin Wrangler secret.
- `UPLOAD_GUARD`: Upload intent rate-limit ve idempotency cache icin KV binding.
- `UPLOAD_RATE_LIMIT_MAX`: Account/IP basina intent limiti. Default 1000.
- `UPLOAD_RATE_LIMIT_WINDOW_SECONDS`: Rate-limit penceresi. Default 3600 saniye.
- `NEAR_NETWORK`: Full-access key kontrolu icin RPC pool secimi. Default
  `mainnet`.

```bash
cd workers/storage-api
npm install
npx wrangler secret put LIGHTHOUSE_API_KEY
npx wrangler secret put UPLOAD_INTENT_SECRET
npx wrangler kv namespace create UPLOAD_GUARD
```

## Local dev ve test

```bash
cd workers/storage-api
npm test -- --run
npm run check
npx wrangler dev
```

## Endpoints

- `GET /__health`: Worker ayakta mi?
- `GET /provider-health`: provider ayari hazir mi?
- `POST /pins`: mevcut IPFS CID'ini Lighthouse pin API'ye gonderir.
- `GET /pins/:cid/status`: Lighthouse file-info API uzerinden CID durumunu okur.
- `POST /uploads/auth/challenge`: upload auth icin NEP-413 challenge dondurur.
- `POST /uploads/auth/verify`: imzali challenge'i dogrular ve upload auth token dondurur.
- `POST /uploads/intent`: buyuk upload icin guvenli yol ve parca limitlerini dondurur.
- `POST /uploads/file`: tek dosyayi veya segment parcasini Lighthouse'a yukler.
- `POST /uploads/directory`: multipart `file` alanlarini Lighthouse'a directory olarak yukler.

`/provider-health`, secret degerini dondurmez. Sadece provider'in hazir olup
olmadigini soyler.

`POST /pins` sadece kucuk JSON body kabul eder:

```json
{
  "cid": "bafy...",
  "fileName": "optional-name"
}
```

Upload intent iki tokenli akar:

1. Frontend `/uploads/auth/challenge` cagirir, cüzdana NEP-413 mesaj
   imzalatir, sonra `/uploads/auth/verify` ile upload auth token alir.
2. Frontend upload auth token'i `Authorization: Bearer <uploadAuthToken>`
   olarak `/uploads/intent` istegine ekler.
3. `/uploads/intent`, API key dondurmez; sadece `/uploads/file`,
   `/uploads/directory`, veya `/pins` icin sureli intent token dondurur.

`POST /uploads/auth/challenge` body:

```json
{
  "accountId": "creator.near"
}
```

`POST /uploads/intent` body. `accountId` auth token'dan gelir:

```json
{
  "uploadKind": "file",
  "fileName": "concert.mov",
  "sizeBytes": 21474836480,
  "contentType": "video/quicktime"
}
```

`ENABLE_LIGHTHOUSE_UPLOADS=true` olsa bile `UPLOAD_INTENT_SECRET` ve
`UPLOAD_GUARD` hazir degilse write endpoint'leri fail-closed kalir. Token
`Authorization: Bearer <intentToken>` ile `/uploads/file`,
`/uploads/directory`, veya `/pins` endpoint'ine gonderilmelidir.

`POST /uploads/file`, buyuk videolarda ana yoldur. Frontend encrypted media
segmentlerini gerekirse daha kucuk byte parcalarina ayirir; manifest bu parca
CID'lerini sirali olarak tasir. Boylece Worker hicbir zaman tum video veya tum
delivery bundle body metabolize etmek zorunda kalmaz.

`POST /uploads/directory`, kucuk bundle smoke testleri ve geriye uyumlu pilot
icin kalir.
