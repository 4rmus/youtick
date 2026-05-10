# YouTick Media Delivery Worker

Media Delivery Worker, encrypted IPFS manifest and segment reads for routing,
Range forwarding, gateway fallback and edge cache control.

## Sorumluluk

- Buyuk upload body'leri bu Worker'dan gecmez.
- Decrypted video, AES key veya KMS share bu Worker'a verilmez.
- Sadece encrypted IPFS asset'leri route edilir.
- Range istekleri upstream'e iletilir, ama ilk fazda edge cache'e yazilmaz.

## Env

- `ALLOWED_ORIGINS`: Browser tarafindan izin verilen origin listesi.
- `IPFS_GATEWAY_BASES`: Virgulle ayrilmis gateway base URL listesi.
- `CACHE_TTL_SECONDS`: Non-Range GET cevaplari icin edge cache suresi.
- `CACHE_VERSION`: Opsiyonel cache bust anahtari.
- `UPSTREAM_TIMEOUT_MS`: Her gateway denemesi icin zaman asimi.

## Local dev ve test

```bash
cd workers/media-delivery
npm test -- --run
npm run check
npx wrangler dev
```

## Endpoints

- `GET /__health`: Worker ayakta mi?
- `GET /ipfs/:cid/:path*`: encrypted IPFS asset'i gateway fallback ile okur.
- `HEAD /ipfs/:cid/:path*`: upstream metadata okur.

Ornek:

```text
/ipfs/bafy.../manifest.json
/ipfs/bafy.../segments/segment-0001.bin
```
