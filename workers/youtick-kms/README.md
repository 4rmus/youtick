# YouTick KMS Worker

KMS worker, tarayicida uretilen AES anahtar paylarini saklar ve sadece yetkili
izleyici/yayinci akislari icin geri verir. Public alpha'da operatorler
Cloudflare Workers uzerinde calisir ve paylar Cloudflare KV'de tutulur.

## Local dev

```bash
cd workers/youtick-kms
npm install
npm test -- --run
npm run check
npx wrangler dev --env testnet
```

`wrangler dev` icin testnet veya local registry kaydi gerekir; worker aktif
operator olarak registry'de yoksa production-readiness kontrolu gecmez.

## KV namespaces

Her operator kendi izole KV namespace'lerini kullanmalidir:

- `VIDEO_KEYS`
- `RATE_LIMIT`
- `ACCESS_CACHE`

Operatorler arasinda KV namespace paylasmak threshold modelini zayiflatir. Yeni
namespace olusturmak icin:

```bash
npx wrangler kv:namespace create VIDEO_KEYS --env operator_a
npx wrangler kv:namespace create RATE_LIMIT --env operator_a
npx wrangler kv:namespace create ACCESS_CACHE --env operator_a
```

Sonra cikan ID'leri `wrangler.toml` icindeki ilgili operator ortamına yaz.

## Secrets

Production sirlarini `wrangler.toml` icine koyma.

```bash
npx wrangler secret put OPERATOR_SHARE_SECRET --env operator_a
npx wrangler secret put REGISTRY_OPERATOR_ACCOUNT_ID --env operator_a
```

`OPERATOR_SHARE_SECRET` en az 32 karakter olmali ve her operator icin farkli
olmalidir. Rotation icin [KMS key rotation](../../docs/kms-key-rotation.md)
prosedurunu kullan.

## Deploy

Operatorler tek tek deploy edilir:

```bash
npx wrangler deploy --env operator_a
npx wrangler deploy --env operator_b
npx wrangler deploy --env operator_c
npx wrangler deploy --env operator_d
npx wrangler deploy --env operator_e
```

Her deploy sonrasi registry kaydini ve health sonucunu kontrol et.

## Health

```bash
curl https://youtick-kms-a.<subdomain>.workers.dev/health
```

Beklenen sonuc `200` ve `ok: true` durumudur. Mainnet'te secret, KV, RPC,
registry operator identity ve contract baglantilari eksikse health hazir sayilmaz.
