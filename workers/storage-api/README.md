# YouTick Storage API Worker

Storage API Worker, IPFS persistence provider secrets, provider status checks
ve flag kontrollu Lighthouse upload pilotu icin ayrilmis Worker yuzeyidir.
Buyuk production upload ve media delivery bu Worker'in ana sorumlulugu degildir.

## Sorumluluk

- Lighthouse API key tarayiciya verilmez.
- Lighthouse upload sadece `ENABLE_LIGHTHOUSE_UPLOADS=true` ile acilir.
- Upload body'leri `MAX_UPLOAD_BYTES` ile sinirlanir.
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

```bash
cd workers/storage-api
npm install
npx wrangler secret put LIGHTHOUSE_API_KEY
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

`POST /uploads/intent`, video body tasimaz ve API key dondurmez. Frontend veya
ops icin guvenli upload yolunu soyler:

```json
{
  "fileName": "concert.mov",
  "sizeBytes": 21474836480,
  "contentType": "video/quicktime"
}
```

Lighthouse icin scoped direct upload token henuz yoksa `directUpload.available`
`false` doner. Bu durumda buyuk videolar, gecici pilot olarak parcalara bolunup
`/uploads/file` uzerinden gonderilir; production hedefi Worker'i video body
proxy'si olmaktan cikarip sadece intent/status/audit yuzeyinde tutmaktir.

`POST /uploads/file`, buyuk videolarda ana yoldur. Frontend encrypted media
segmentlerini gerekirse daha kucuk byte parcalarina ayirir; manifest bu parca
CID'lerini sirali olarak tasir. Boylece Worker hicbir zaman tum video veya tum
delivery bundle body metabolize etmek zorunda kalmaz.

`POST /uploads/directory`, kucuk bundle smoke testleri ve geriye uyumlu pilot
icin kalir.
