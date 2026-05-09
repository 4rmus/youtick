# YouTick Storage API Worker

Storage API Worker, IPFS persistence provider secrets and provider status checks
icin ayrilmis Worker yuzeyidir. Ilk fazda Lighthouse entegrasyonu baglanmaz;
Worker sadece siniri, CORS davranisini ve health endpointlerini sabitler.

## Sorumluluk

- Lighthouse API key tarayiciya verilmez.
- Buyuk video/upload body'leri bu Worker'dan proxy edilmez.
- KMS, ticket, ban, session grant ve key-share kararlari bu Worker'a tasinmaz.
- Media delivery ve Range/cache isi ayri bir Worker fazinda ele alinir.

## Env ve secret

- `ALLOWED_ORIGINS`: Browser tarafindan izin verilen origin listesi.
- `STORAGE_PROVIDER`: Simdilik `lighthouse`.
- `LIGHTHOUSE_API_BASE`: Lighthouse API base URL. Default: `https://api.lighthouse.storage`.
- `LIGHTHOUSE_API_KEY`: Wrangler secret olarak verilir.

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

`/provider-health`, secret degerini dondurmez. Sadece provider'in hazir olup
olmadigini soyler.

`POST /pins` sadece kucuk JSON body kabul eder:

```json
{
  "cid": "bafy...",
  "fileName": "optional-name"
}
```

Buyuk video veya manifest body'leri bu Worker'dan gecirilmez.
