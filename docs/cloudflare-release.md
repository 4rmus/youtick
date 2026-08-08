# Cloudflare release runbook

Bu akış yalnız dark Preview/Production hedeflerini yönetir. `youtick.net`, NEAR kontratları ve eski
`youtick-livepeer-bridge-c3-4ea2011` Worker'ı kapsam dışıdır.

## Güvenlik sınırları

- Preview varsayılan olarak kapalıdır: `DEPLOY_PREVIEW_ENABLED=false`.
- Web ve Bridge için bütün Livepeer/creator-fee bayrakları `false` olmalıdır.
- Dark Worker'lara provider veya NEAR private key yüklenmez. Runtime aktivasyonu ayrı onay ister.
- Production yalnız manuel `sha` ve tam `DEPLOY_DARK_PRODUCTION` onayıyla çalışır.
- Production yeniden build etmez; başarılı Preview run'ındaki, 30 günden genç exact-SHA artifact'ini kullanır.
- Durable Object migration yalnız mevcut `v1` olabilir. Version rollback state migration'ını geri almaz.

## GitHub ayarları

`Preview` ve `Production` environment'larında şu değerler bulunmalıdır:

- Environment variable: `CLOUDFLARE_ACCOUNT_ID`
- Environment variable: `CLOUDFLARE_ZONE_ID`
- Environment secret: `CLOUDFLARE_API_TOKEN`
- Environment secret: `NEAR_RPC_URL`
- Environment secret: `ONECLICK_API_KEY`

İki environment yalnız korumalı branch'lerden deployment kabul etmelidir. Token'lar ortam bazlı;
Workers Scripts Read/Write ve `youtick.net` zone'u için Workers Routes Read yetkileriyle sınırlı
olmalıdır. Otomasyon domain bağlarını API üzerinden okumadan veya beklenmeyen bir classic route'u
reddetmeden version trafiğini değiştirmez.

Public build/runtime ayarları repository variables olarak `PREVIEW_` ve `PRODUCTION_` önekleriyle
tutulur. Bunlar secret değildir; otomatik artifact build job'ı `Production` environment'ına bağlanmaz,
böylece Production secret'ları yalnız manuel promotion job'ında erişilebilir kalır. İki ortam için gereken
değişkenler:

- `NEXT_PUBLIC_NEAR_NETWORK`, `NEXT_PUBLIC_MARKET_CONTRACT_ID`, `NEXT_PUBLIC_ACCESS_CONTRACT_ID`
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LIVEPEER_BRIDGE_URL`
- `NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1=false`
- `NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE=false`
- `NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE=off`
- `NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO`
- `ALLOWED_ORIGINS`, `NEAR_NETWORK`, `MARKET_CONTRACT_ID`, `ACCESS_CONTRACT_ID`
- `LIVEPEER_PROJECT_ID`, `LIVEPEER_API_TOKEN_NAME`, `LIVEPEER_PAID_MEDIA_OPERATOR_ID`
- `LIVEPEER_JWT_PUBLIC_KEY`, `LIVEPEER_JWT_ISSUER`
- `NEAR_OPERATOR_ACCOUNT_ID`, `NEAR_OPERATOR_KEY_EPOCH`
- `CREATOR_FEE_QUOTE_KEY_VERSION`
- `LIVEPEER_BRIDGE_ENABLED=false`
- `LIVEPEER_NEAR_CREATOR_FEE_ENABLED=false`
- `MULTI_ASSET_PAYMENTS_MODE=off`
- `MULTI_ASSET_PAYMENT_ASSET_IDS`

USDC, creator allowlist, ücret rezervi ve operasyon bütçesi değişkenleri opsiyoneldir. Placeholder,
`localhost`, `workers.dev`, kök `youtick.net` hedefi ve açık feature flag build öncesinde reddedilir.
`NEAR_RPC_URL` zorunlu environment secret'ıdır; artifact/config/manifest içine yazılmaz ve yalnız
Bridge version upload sırasında geçici `0600` secrets file üzerinden Wrangler'a aktarılır. Eksik,
placeholder/example, genel public NEAR RPC, HTTP, credentials veya whitespace içeren değer reddedilir.

Preview ortamı çoklu ödeme için yalnız `off` veya `preview` kabul eder;
Production bu kod diliminde yalnız `off` kabul eder. Web ve Bridge modları aynı
olmalıdır. `ONECLICK_API_KEY` veya pozitif ödeme gaz rezervi eksikse Cloudflare
mutasyonu başlamadan işlem durur. Bu değerler `off` modunda da önceden başlamış
dönüşümlerin status/refund ve final USDC kontrolleri için korunur.
Mainnet dry quote açılmadan önce web/Bridge network ve Circle USDC kimlikleri
canlı market sonucu ile eşleştirilmelidir.

## Akış

1. Her başarılı `main` CI, exact SHA ve başarılı `CI Gate` ile Preview akışını tetikler.
2. `Deploy Preview`, son başarılı Preview SHA'sından güncel `main` SHA'sına kümülatif diff alır. Yalnız
   deploy-relevant değişiklik varsa aynı SHA'dan Preview Web, Production Web ve tek Bridge bundle'ını
   paralel üretir; yalnız docs/contract değişikliği varsa temiz biçimde atlar.
3. `release-<sha>` artifact'i manifest ve checksum'larla 30 gün saklanır.
4. Preview candidate sürümleri smoke edilir, ardından yüzde 100 terfi ettirilir.
5. Production için Actions içinden `Dark Production` workflow'u tam SHA ve typed confirmation ile çalıştırılır.

İlk Worker sürümü `versions upload` ile yaratılamaz. Otomasyon yalnız Cloudflare structured output'taki
exact `10007` hatasında, custom domain bağlamadan `workers.dev` üzerinde bir defalık bootstrap deploy
yapar ve smoke eder. Domain ancak smoke sonrasında, sabit zone/hostname/Worker üçlüsü boş veya exact
eşleşiyorsa bağlanır. Bu run'ın yeni domain bağı sonraki adımda hata verirse geri kaldırılır; Worker ve
Durable Object kaynağı otomatik silinmez. Diğer bütün hatalar fail-closed kalır.

## Smoke ve rollback

Smoke; `/`, `/tr`, `/api/near-rpc`, browser hydration/console, Bridge `/__health`, bütün kapalı mutation
endpoint'leri, CORS, exact Worker version ID ve manifest SHA eşleşmesini kontrol eder. Release
öncesi/sonrası `youtick.net` parmak izi aynı olmalıdır.

Production akışı önceki version ID'yi kaydeder; yeni sürüm sonrası eski sürüme yüzde 100 dönüşü ve tekrar
yeni sürüme çıkışı dark alanlarda test eder. İlk bootstrap'ta aynı exact-SHA artifact'inden ikinci bir
candidate version oluşturulur; böylece trafik rollback mekanizması ilk manuel çalıştırmada da test edilir.
Bu yalnız version trafiğini sınar; Durable Object migration/state geri alma iddiası yoktur.
