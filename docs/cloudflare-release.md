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
- `NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2=false`
- `NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2=false`
- `NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL=false`
- `NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE=off`
- `NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO`
- `ALLOWED_ORIGINS`, `NEAR_NETWORK`, `MARKET_CONTRACT_ID`, `ACCESS_CONTRACT_ID`
- `LIVEPEER_PROJECT_ID`, `LIVEPEER_API_TOKEN_NAME`, `LIVEPEER_PAID_MEDIA_OPERATOR_ID`
- `LIVEPEER_JWT_PUBLIC_KEY`, `LIVEPEER_JWT_ISSUER`
- `NEAR_OPERATOR_ACCOUNT_ID`, `NEAR_OPERATOR_KEY_EPOCH`
- `CREATOR_FEE_QUOTE_KEY_VERSION`
- `LIVEPEER_BRIDGE_ENABLED=false`
- `LIVEPEER_NEW_UPLOADS_ENABLED=false`
- `LIVEPEER_PLAYBACK_ISSUANCE_ENABLED=false`
- `LIVEPEER_PLAYBACK_V2_ENABLED=false`
- `LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED=false`
- `LIVEPEER_WEBHOOK_QUEUE_ENABLED=false`
- `LIVEPEER_PROVIDER_MUTATIONS_ENABLED=false`
- `LIVEPEER_OPERATOR_MUTATIONS_ENABLED=false`
- `UPLOAD_JOB_ARCHIVE_ENABLED=false`
- `OPERATOR_OUTBOX_ARCHIVE_ENABLED=false`
- `LIVEPEER_NEAR_CREATOR_FEE_ENABLED=false`
- `MULTI_ASSET_PAYMENTS_MODE=off`
- `MULTI_ASSET_PAYMENT_ASSET_IDS`

USDC, read-model URL, creator allowlist, ücret rezervi ve operasyon bütçesi değişkenleri opsiyoneldir.
Derived read gate kapalıyken read-model URL boş tutulur. Placeholder,
`localhost`, `workers.dev`, kök `youtick.net` hedefi ve açık feature flag build öncesinde reddedilir.
`NEAR_RPC_URL` zorunlu environment secret'ıdır; artifact/config/manifest içine yazılmaz ve yalnız
Bridge version upload sırasında geçici `0600` secrets file üzerinden Wrangler'a aktarılır. Eksik,
placeholder/example, genel public NEAR RPC, HTTP, credentials veya whitespace içeren değer reddedilir.

Web RPC proxy için `NEAR_RPC_PRIMARY_URL` ile server-only
`NEAR_RPC_PRIMARY_AUTHORIZATION` birlikte verildiğinde dedicated primary
kullanılır; biri eksikse bu kaynakta kontrollü public fallback çalışır. Bu iki
değer henüz release metadata/deploy wiring parçası değildir ve deploy kanıtı
yoktur. Authorization hiçbir `NEXT_PUBLIC_` değişkenine konulmaz.

Guarded Preview/Production release sözleşmesi yeni upload ve bütün playback
issuance domain bayraklarını zorunlu `false` tutar. Stateless playback v2 kaynakta bağımsız
`NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2=false` ve
`LIVEPEER_PLAYBACK_V2_ENABLED=false` varsayılanlarıyla bulunur ve guarded release
metadata/config paketinde açıkça kapalı taşınır. Release smoke kapalı
`/v2/playback-tokens` rotasının 503 döndüğünü kanıtlar.
Shadow ölçümü de kaynakta
`NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2=false` ve
`LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED=false` olarak kapalıdır ve bu release
sözleşmesinde zorunlu `false` tutulur. Kaynak/test varlığı aktivasyon kanıtı değildir.

Webhook Queue yolu kaynakta `LIVEPEER_WEBHOOK_QUEUE_ENABLED=false` ile kapalıdır.
Kabul edilen pilot sözleşmesi batch 10, 5 saniye timeout, 3 retry, concurrency
1, 4 gün retention ve `youtick-livepeer-events-dlq-testnet` değerleridir; Worker
değer kaymasında fail-closed davranır. Bu runbook henüz `LIVEPEER_EVENTS`
binding veya dead-letter Queue oluşturmaz. Provider-side binding ve read-only
konfigürasyon kanıtı olmadan bu flag açılamaz.

Derived read-model web geçişi kaynakta
`NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL=false` ile kapalıdır. Release metadata ve
deploy doğrulaması bu değeri Preview/Production için zorunlu olarak `false`
tutar; D1 Worker, `READ_MODEL_WEB_ORIGIN`, URL ve gerçek read smoke kanıtı bu
runbook tarafından oluşturulmaz.

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
3. Web ve Bridge runtime SPDX SBOM'ları üretilir. `release-<sha>` artifact'i
   manifest ve checksum'larla 30 gün saklanır; checksum kümesi build
   provenance, Web/Bridge bundle'ları da ilgili SBOM ile GitHub tarafından
   attest edilir.
4. Preview candidate sürümleri smoke edilir, ardından yüzde 100 terfi ettirilir.
5. Production için Actions içinden `Dark Production` workflow'u tam SHA ve typed confirmation ile çalıştırılır.

Attestation yalnız başarılı ve yetkili release build'inde oluşur. Kaynakta
workflow bulunması, imzalı kanıtın üretildiği anlamına gelmez. İndirilen bundle
için build ve SPDX SBOM kanıtları ayrı doğrulanır:

Kontratların normal WASM grafiği için üretilen SPDX belgeleri ayrı
`contract-sbom-<sha>` CI artifact'inde 30 gün tutulur. Bunlar Cloudflare release
artifact'ine eklenmez ve bu akışta attest edilmez; GitHub'da başarılı artifact
run'ı görülmeden üretilmiş sayılmaz.

```bash
gh attestation verify web-preview.tar.gz --repo 4rmus/youtick
gh attestation verify web-preview.tar.gz \
  --repo 4rmus/youtick \
  --predicate-type https://spdx.dev/Document/v2.3
```

İlk aktif Worker deployment'ı yalnız `versions upload` ile kurulamaz. Otomasyon, deployment bulunmadığını
exact `10007` veya sabit Worker adına bağlı `no deployments` sonucu ile doğruladıktan sonra bir defalık
bootstrap deploy yapar. Bridge'in doğrulanmış ilk `v1` Durable Object migration'ı `versions upload`
yapılmadan bu deploy ile uygulanır. Custom domain bootstrap smoke sonrasında bağlanır; yeni domain bağı sonraki adımda
hata verirse geri kaldırılır. Worker ve Durable Object kaynağı otomatik silinmez; diğer hatalar fail-closed kalır.

## Smoke ve rollback

Smoke; `/`, `/tr`, `/api/near-rpc`, browser hydration/console, Bridge `/__health`, bütün kapalı mutation
endpoint'leri, CORS, exact Worker version ID ve manifest SHA eşleşmesini kontrol eder. Release
öncesi/sonrası `youtick.net` parmak izi aynı olmalıdır.

Production akışı önceki version ID'yi kaydeder; yeni sürüm sonrası eski sürüme yüzde 100 dönüşü ve tekrar
yeni sürüme çıkışı dark alanlarda test eder. İlk bootstrap'ta aynı exact-SHA artifact'inden ikinci bir
candidate version oluşturulur; böylece trafik rollback mekanizması ilk manuel çalıştırmada da test edilir.
Bu yalnız version trafiğini sınar; Durable Object migration/state geri alma iddiası yoktur.
