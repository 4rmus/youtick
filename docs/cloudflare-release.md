# Cloudflare release runbook

Bu akış yalnız dark Preview/Production hedeflerini yönetir. NEAR kontratları ve eski
`youtick-livepeer-bridge-c3-4ea2011` Worker'ı kapsam dışıdır. Kök alan adı (`youtick.net`,
`www.youtick.net`) bu akışla bağlanmaz veya ayrılmaz; Production release'i kökte bulduğu bağı yalnız
doğrular (bkz. "Kök alan adı").

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
- Environment secret (opsiyonel): `FORMS_TURNSTILE_SECRET` ("Formlar" bölümü)

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
- `NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL=false` (Preview publication gate may be `true`)
- `NEXT_PUBLIC_MARKET_READ_MODEL_URL` (required as `https://read-preview.youtick.net` when that gate is `true`)
- `NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE=off`
- `NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO`
- `NEXT_PUBLIC_CREATOR_APPLICATION_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_CONTENT_REPORT_TURNSTILE_SITE_KEY`,
  `NEXT_PUBLIC_OPENING_NOTICE_TURNSTILE_SITE_KEY` (opsiyonel; boşken form e-posta yedeğinde kalır)
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
Derived read gate kapalıyken read-model URL boş tutulur. Yalnız Preview,
`https://read-preview.youtick.net` ile bu gate'i açabilir; Production zorunlu `false` kalır.
Placeholder, `localhost`, `workers.dev`, kök `youtick.net` hedefi ve diğer açık feature flag'ler
build öncesinde reddedilir. Tek istisna Production web Worker'ının `PUBLIC_ROOT_HOSTS` değişkenidir;
değeri `apps/web/wrangler.jsonc` içinde sabittir ve repository variable'dan gelmez.
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

Derived read-model web geçişi varsayılan olarak
`NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL=false` ile kapalıdır. Preview bunu yalnız
`NEXT_PUBLIC_MARKET_READ_MODEL_URL=https://read-preview.youtick.net` ile açabilir;
Production release sözleşmesi zorunlu `false` kalır. Ayrı Preview D1 Worker
yalnız publication GET rotalarını açar; cron, Queue ve yazma bayrakları kapalıdır.

Preview ortamı çoklu ödeme için yalnız `off` veya `preview` kabul eder;
Production bu kod diliminde yalnız `off` kabul eder. Web ve Bridge modları aynı
olmalıdır. `ONECLICK_API_KEY` veya pozitif ödeme gaz rezervi eksikse Cloudflare
mutasyonu başlamadan işlem durur. Bu değerler `off` modunda da önceden başlamış
dönüşümlerin status/refund ve final USDC kontrolleri için korunur.
Mainnet dry quote açılmadan önce web/Bridge network ve Circle USDC kimlikleri
canlı market sonucu ile eşleştirilmelidir.

## Akış

1. `Deploy Preview` elle başlatılır (2026-10-13'ten beri): Actions'ta güncel `main` SHA'sı, o
   commit'in başarılı push CI koşusunun kimliği ve `DEPLOY_PREVIEW` onayı girilir. Workflow,
   SHA'nın `main`'in ucu olduğunu ve CI koşusunun `CI Gate` ile başarıyla bittiğini doğrular;
   eski bir SHA veya başka bir dal reddedilir. Her `main` push'unda kendiliğinden koşu açılmaz.
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
öncesi/sonrası `youtick.net` parmak izi aynı olmalıdır; tek istisna, kökü Production web Worker'ının
sunduğu bir Production release'idir (bkz. "Kök alan adı").

Production akışı önceki version ID'yi kaydeder; yeni sürüm sonrası eski sürüme yüzde 100 dönüşü ve tekrar
yeni sürüme çıkışı dark alanlarda test eder. İlk bootstrap'ta aynı exact-SHA artifact'inden ikinci bir
candidate version oluşturulur; böylece trafik rollback mekanizması ilk manuel çalıştırmada da test edilir.
Bu yalnız version trafiğini sınar; Durable Object migration/state geri alma iddiası yoktur.

## Kök alan adı

Karar K10(a): `youtick.net` ve `www.youtick.net` yalnız Production web Worker'ı (`youtick-web`) tarafından,
kök-host kapısının arkasında sunulabilir. Kapı `apps/web/lib/public-routes.ts` içindedir ve Production
Worker'ındaki `PUBLIC_ROOT_HOSTS=youtick.net,www.youtick.net` değişkeniyle açılır: kök host'larda yalnız
landing, başvuru, açılış bildirimi, SSS ve hukuk sayfaları cevap verir, diğer her yol `noindex` ile 404
döner. `app.youtick.net` ve Preview bu kapıdan etkilenmez.

Kurallar (`scripts/cloudflare-release.mjs`):

- Kök host'un Custom Domain kaydı bu akışın yönettiği başka bir Worker'a (Preview web, Bridge, read
  model), eski Bridge'e veya başka zone'daki `youtick-web`'e bağlıysa release hiçbir mutasyon yapmadan
  `worker_domain_root_or_legacy_forbidden` ile durur.
- Kök host `youtick-web`'e bağlıyken aynı host'ta klasik Worker route'u varsa release
  `worker_classic_route_shadows_root` ile durur. Cloudflare'de route, aynı host'taki Custom Domain'den
  önce çalışır.
- Kök `youtick-web`'e bağlıysa Production release'i terfiden sonra kök duman testini çalıştırır
  (`release-smoke.mjs root`): açık sayfalar 200 ve doğru `lang`, landing'de eski derlemenin izleri yok
  (proxy başlıkları, "Lighthouse/IPFS", analytics etiketi), uygulama rotaları ve `/api/near-rpc` 404 +
  `noindex`, tarayıcıda konsol hatası yok. Test düşerse önceki sürümler geri yüklenir.
- Production rollback testi sürüm trafiğini kısa süre önceki sürüme çevirir. Kök `youtick-web`'e
  bağlıyken bu, kökte de kısa süre önceki sürümün sunulması demektir.
- Makbuzdaki `rootHosts.attached` hangi kök host'ların `youtick-web`'e bağlı bulunduğunu kaydeder. Liste
  `youtick.net` içermiyorsa workflow kök parmak izinin değişmediğini kanıtlar; içeriyorsa kanıt kök duman
  testidir.

Nonce'lu CSP taşıyan bir sayfanın gövdesi her istekte değişir. `release-smoke.mjs fingerprint` böyle bir
origin'i `robots.txt` gövdesi ve nonce'u maskelenmiş CSP ile parmak izler; kök `youtick-web`'e geçtikten
sonra Preview, public-testnet ve V2 testnet workflow'larındaki "kök değişmedi" kontrolü bu sayede
çalışmaya devam eder.

### Kökü taşıma (sahip, Cloudflare paneli)

Otomasyon bu adımı yapmaz; token yetkisi okuma düzeyinde kalır.

1. Ön koşul: aynı SHA için başarılı bir `Dark Production` koşusu ve çalışan `app.youtick.net`.
2. `youtick.net` ve `www.youtick.net` üzerindeki mevcut bağı kaldır: eski Worker'ın route'u veya Custom
   Domain'i ve varsa bu host'ların CNAME kaydı. Cloudflare, CNAME kaydı olan bir host'ta Custom Domain
   oluşturmaz.
3. İki host'u `youtick-web` Worker'ına Custom Domain olarak ekle. Eski Worker'ı ve Pages projesini silme.
4. Doğrula:

   ```bash
   node scripts/release-smoke.mjs root https://youtick.net https://www.youtick.net
   ```

   Ardından `fingerprint https://youtick.net` iki kez alınıp `compare` ile karşılaştırılır; eşit çıkması
   diğer workflow'ların kök kontrolünün geçeceğini gösterir.
5. Geri alma: 3. adımdaki Custom Domain'leri kaldır, 2. adımda kaldırılan bağı geri koy.

Kaynak: Cloudflare Workers dokümanı, "Custom Domains" ve "Routes" sayfaları (2026-11-26'da okundu).
Başka bir Worker'a bağlı host'a Custom Domain eklemenin davranışı orada yazmıyor; bu yüzden 2. adım
3. adımdan önce gelir.

## Formlar

Üç açık form vardır: sanatçı başvurusu (`/apply`), içerik bildirimi (`/report`) ve açılış bildirimi
(`/notify`). Her biri kendi API rotasından youtick gelen kutusuna tek bir e-posta gönderir; web servisi
kopya tutmaz. Rotalar kök host'larda da açıktır (`apps/web/lib/public-routes.ts`, `PUBLIC_ROOT_API`).

Bir rota beş şey bulunmadan çalışmaz, eksikse 503 döner: Email Sending bağı, gönderen adresi, alıcı adresi,
rate limiter ve Turnstile secret'ı. Sayfa ise formu yalnız build sırasında site key'i verilmişse gösterir;
yoksa "şu an kullanılamıyor" metni ve `mailto:` bağlantısı çıkar. Bu yüzden sıra şudur: önce bağlar ve
secret, en son site key.

Repoda sabit olanlar (`apps/web/wrangler.jsonc`, Preview ve Production; `scripts/cloudflare-release.mjs`
birebir karşılaştırır, başka bir şekil `web_wrangler_config_invalid` ile reddedilir):

| Form | Bağ | Alıcı | Rate limiter (Preview / Production namespace) |
| --- | --- | --- | --- |
| Sanatçı başvurusu | `CREATOR_APPLICATION_EMAIL` | `contact@youtick.net` | `CREATOR_APPLICATION_RATE_LIMITER` (1003 / 2003) |
| İçerik bildirimi | `CONTENT_REPORT_EMAIL` | `contact@youtick.net` | `CONTENT_REPORT_RATE_LIMITER` (1004 / 2004) |
| Açılış bildirimi | `OPENING_NOTICE_EMAIL` | `contact@youtick.net` | `OPENING_NOTICE_RATE_LIMITER` (1005 / 2005) |

- Üç form da aynı doğrulanmış adrese yazar; konu satırı formu ayırt eder. Sitenin içerik bildirimi için
  gösterdiği `abuse@youtick.net` bağ alıcısı olarak kullanılmaz: Cloudflare'in hedef adres doğrulama
  e-postası bu adrese ulaşmadı (2026-11-27, yeniden gönderimden sonra da). Adres normal postayı alır.
- Gönderen her üçünde `forms@youtick.net`. Her bağ `destination_address` ile tek alıcıya,
  `allowed_sender_addresses` ile tek gönderene kısıtlıdır; formu dolduranın adresi yalnız gövdeye yazılır.
- Rate limiter IP başına dakikada 5 istektir. Namespace'ler hesap genelinde sayaçtır; paylaşılmaz.
- `<FORM>_FROM` ve `<FORM>_TO` değişkenleri aynı dosyadadır. Adres değiştirmek bir PR'dır.
- public-testnet web Worker'ında bağ yoktur; orada site key `public_testnet_form_site_key_forbidden` ile
  reddedilir.

Ortamdan gelenler:

- `FORMS_TURNSTILE_SECRET` (environment secret, Preview ve Production ayrı ayrı). Release bunu geçici bir
  `0600` secrets file ile web Worker'ına `CREATOR_APPLICATION_TURNSTILE_SECRET`,
  `CONTENT_REPORT_TURNSTILE_SECRET` ve `OPENING_NOTICE_TURNSTILE_SECRET` adlarıyla yükler; üç form tek
  widget'ı kullanır. Artifact, config, manifest ve makbuza yazılmaz. Wrangler bir secrets file'ı önceki
  sürümün secret'larına ekler ve dosyada olmayanı silmez: GitHub'dan kaldırılan secret Worker'da kalır,
  silmek için `wrangler versions secret delete` gerekir. Boşluk içeren, `0x` ile başlamayan (Cloudflare'in
  test secret'ları `1x`, `2x`, `3x` ile başlar) veya bir site key'e eşit değer `forms_turnstile_secret_invalid`
  ile reddedilir.
- `PREVIEW_` / `PRODUCTION_NEXT_PUBLIC_*_TURNSTILE_SITE_KEY` (repository variable, form başına bir tane).
  Site key gizli değildir. Gerçek bir widget anahtarı olmalıdır; test anahtarları config adımında
  reddedilir. Herhangi biri doluyken `FORMS_TURNSTILE_SECRET` yoksa release hiçbir mutasyon yapmadan
  `forms_turnstile_secret_missing` ile durur.

Terfiden sonra release, site key'i dolu olan her formun rotasına `Origin` başlığı olmayan bir POST gönderir
(`release-smoke.mjs forms`). Hazır bir rota bunu 403 `invalid_request` ile reddeder; eksik bir rota 503
döner ve önceki sürümler geri yüklenir. Bu ret rate limiter'dan, Turnstile kontrolünden ve e-postadan önce
geldiği için iz bırakmaz. Kontrol secret'ın widget'a ait olduğunu veya e-postanın ulaştığını kanıtlamaz;
onun kanıtı aşağıdaki elle gönderimdir. Makbuzdaki `forms` alanı secret'ın yüklenip yüklenmediğini ve
hangi rotaların sınandığını kaydeder.

### Formları açma (sahip)

1. Cloudflare > Email Service > Email Sending > Onboard Domain: `youtick.net`. Cloudflare `cf-bounce`
   alt alanına MX ve SPF, `cf-bounce._domainkey` altına DKIM kaydı ekler; kökteki Google Workspace MX ve
   SPF kayıtlarına dokunmaz. `_dmarc` kaydını yalnız hiç yoksa (`p=reject` ile) oluşturur; 2026-11-27'de
   `youtick.net` için `p=none` kaydı ve Google Workspace DKIM kaydı (`google._domainkey`) vardı, yani
   mevcut kayıt kalır. İnceleme ekranı `_dmarc` için `p=reject` satırını kayıt varken de listeler;
   2026-11-27'deki onboard'da mevcut kayıt değişmedi (yetkili ad sunucusundan okundu). Yine de onboard
   sonrası `_dmarc` kaydını kontrol et.
2. Email Routing > Destination addresses sayfasında `contact@youtick.net` adresini ekle ve gelen
   bağlantıya tıkla (2026-11-27'de doğrulandı). Doğrulanmış adrese gönderim ücretsizdir ve günlük kotadan
   düşmez.
3. Turnstile widget'ının hostname listesinde `youtick.net` olsun; alt alan adları (`www`, `app`,
   `preview`) kendiliğinden kapsanır.
4. `FORMS_TURNSTILE_SECRET` secret'ını Preview ve Production environment'larına gir. Değer sohbet
   penceresine, issue'ya veya log'a yazılmaz.
5. Bu durumda bir Preview deploy'u ve promote yap: bağlar ve secret yerleşir, formlar hâlâ e-posta
   yedeğindedir.
6. Açmak istediğin formun site key variable'ını önce Preview için gir, Preview deploy'u yap ve
   `preview.youtick.net` üzerinden gerçek bir gönderim yap; e-postanın gelen kutusuna ulaştığını gör.
7. Aynı variable'ı Production için gir, Preview deploy'u (yeni artifact) ve promote yap. Kökte bir
   gönderimle doğrula.

Geri alma: site key variable'ını boşaltıp yeniden deploy etmek formu e-posta yedeğine döndürür.

Kaynak: Cloudflare Email Service dokümanı ("Send bindings", "Domains", "Pricing", "Limits"), Workers
"Secrets" ve "Rate limiting" sayfaları, Turnstile "Hostname management" ve "Testing" sayfaları
(2026-11-27'de okundu). Email Sending o tarihte açık betaydı. Doğrulanmamış olanlar: `send_email` bağı
taşıyan bir sürümü yüklemek için deploy token'ına ek yetki gerekip gerekmediği ve `destination_address`
kısıtının yükleme sırasında hedef adres doğrulaması isteyip istemediği. İkisini de ilk Preview deploy'u
ve 6. adımdaki gönderim gösterir.
