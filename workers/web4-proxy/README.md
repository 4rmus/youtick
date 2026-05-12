# YouTick Web4 Proxy

Web4 proxy, `youtick.net` alan adini Web4/static origin uzerine tasir ve static
export'un tek basina veremedigi runtime davranislarini ekler.

## Origin ve fallback

- `WEB4_ORIGIN`: Birincil static origin. Genelde Cloudflare Pages build'i.
- `WEB4_FALLBACK_ORIGIN`: Birincil origin hata verirse kullanilan Web4/IPFS yolu.
- `ALLOWED_DOMAINS`: Proxy'nin servis edecegi host listesi.

## API proxy sorumlulugu

`youtick.net` proxy destekli modda su API yuzeylerini destekler:

- `/api/onboarding-key`
- `/api/near-rpc`
- `/api/crust/*`

`youtick.near.page` veya ciplak IPFS gateway static-only calisir. Bu ortamlarda
onboarding key veya storage-order gerektiren akislar desteklenmez.

`/api/near-rpc`, browser RPC cagri yuzeyidir. Tarayici dogrudan public RPC
origin'lerine gitmez; proxy FastNear, NEAR official RPC ve dRPC upstream'leri
arasinda failover yapar. Sadece allowlist'teki read-only view cagri cevaplari
kisa sureli edge cache'e alinir; transaction/broadcast cagri cevaplari cache'lenmez.

## Header ve CSP

Next static export, `next.config.ts` icindeki `headers()` kurallarini Web4
build'ine uygulamaz. Bu nedenle CSP ve temel guvenlik header'lari proxy
tarafindan eklenir. `npm run build:web4` sirasinda gorulen "headers not
applied" uyarisi beklenen bir durumdur.

## Secrets

Trial onboarding icin:

```bash
npx wrangler secret put ONBOARDING_KEYS
npx wrangler secret put TURNSTILE_SECRET_KEY
```

`ONBOARDING_KEYS` virgulle ayrilmis `ed25519:` prefiksli key havuzu olabilir.
`TURNSTILE_SECRET_KEY` set edildiginde `/api/onboarding-key` challenge token olmadan key vermez.
Onboarding key rotation icin once root `scripts/add-onboarding-key.mjs`, yeni
deploy dogrulandiktan sonra `scripts/remove-onboarding-key.mjs` kullanilir.
Mevcut key envanteri root `scripts/list-onboarding-keys.mjs` ile okunur.

## Local dev ve test

```bash
cd workers/web4-proxy
npm install
npm test -- --run
npm run check
npx wrangler dev
```

## Deploy

```bash
npx wrangler deploy
```

Custom domain route'lari `wrangler.toml` icindedir. Deploy sonrasi:

```bash
curl https://youtick.net/__health
curl -I https://youtick.net/
```

`/__health` JSON donmeli; HTML cevaplarda `Content-Security-Policy` ve
`X-Proxy: youtick-web4` header'lari gorulmelidir.
