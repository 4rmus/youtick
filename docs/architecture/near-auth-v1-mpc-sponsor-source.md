# NEAR Auth V1 — sınırlı MPC gönderici kaynağı

Gate: `NEAR_AUTH_V1_MPC_SPONSOR_SOURCE`.
22 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

Amaç: kullanıcıya Meteor sponsor cüzdanı seçtirmeden ilerleyebilmek için,
mevcut Bridge'e özel servis girişi ve tek-gönderim kaydı eklemek. Bu kaynak
adımı MPC imzasının doğrulanmasında biter; ödeme düğmelerini açmaz.

## Kapsam ve değişen dosyalar

- `workers/livepeer-bridge/src/mpc-sponsor.ts`: dar ticket/compact-upload
  doğrulaması, bütçe, atomik nonce/kayıt ve geçmiş MPC sonucu.
- `workers/livepeer-bridge/src/mpc-entrypoint.ts`: `NearAuthMpcSponsor` named
  WorkerEntrypoint; yalnız `submit` ve `status`. Yardımcı metot gerçek `#private`.
- `workers/livepeer-bridge/src/index.ts`: mevcut `LivepeerControl` içine iki
  iç çağrı; mevcut public HTTP yönlendiricide MPC yolu yok. Env tipi genişletildi.
- `protocol/paid-media-livepeer-v1/mpc-sponsor.ts`: özel servis çağrısının ortak
  veri tipi; bir genel HTTP ödeme gövdesi değildir.
- `apps/web/lib/near-auth-mpc-sponsor.ts`: ürün oturumu/origin/hesap kontrolü,
  mevcut şifreli review ve Auth0 onayıyla özel binding'e sunucu çağrısı.
- `apps/web/lib/near-auth-signing-server.ts`, `near-auth-upload-server.ts`:
  mevcut hazırlık/doğrulama yardımcılarına açık `lab | product` alanı.
  Lab varsayılanı korunur; ürün için ayrı secret, client ve review issuer gerekir.
- `apps/web/__tests__/unit/near-auth-signing-server.test.ts`: mevcut gerçek
  sentetik JWT/işlem fixture'larıyla ürün adaptörü için dört regresyon testi.
- `apps/web/tsconfig.near-auth.json`: yeni sunucu adaptörü strict tip kapsamına alındı.
- `workers/livepeer-bridge/src/mpc-sponsor.test.ts`: 22 yerel regresyon testi.
- `workers/livepeer-bridge/src/worker-entrypoint-test-stub.ts`,
  `workers/livepeer-bridge/vitest.config.ts`: Node testinde Cloudflare sınıfı
  için sınırlı stand-in. Gerçek Worker paketi ayrıca Wrangler ile kontrol edilir.
- Bu rapor ve `near-auth-integration-status.md`.

Kontrat, UI, dependency/lockfile, wrangler ayarları, ortam/secret dosyaları,
cihaz/ödeme kayıtları, çalışan localhost oturumu ve Git index değişmedi.
Commit/push/PR/deploy veya gerçek zincir/provider işlemi yapılmadı.

## Güven ve işlem sınırı

Web, HttpOnly ürün oturumunu ve exact origin'i doğrular; hesabı mevcut kimlik
ön kontrolünden türetir. İmzalanan review başka hesaba/sponsora ait olamaz.
Mevcut ticket fiyat/bakiye/cihaz ve upload teklif/job kontrolleri yeniden
kullanılır. Auth0 RS256, issuer/audience/azp/subject/scope/süre ve exact `fatxn`
kontrolleri atlanmaz. Lab client veya lab review ürün için fallback değildir.
İşlem attempt ID'si doğrulanmış şifreli review'un sunucuda hesaplanan özetidir.

Bridge Web servis sınırına güvenir; Auth0 JWKS doğrulamasını ikinci kez
kurmaz. Buna rağmen bağımsız olarak testnet, Market, sabit test USDC,
implicit hesap/public key bağı, canonical Borsh bytes/hash, ticket veya compact
upload amacı, publication/job, tutar, tek `ft_transfer_call`, 100 Tgas ve
1 yocto iç deposit sınırlarını doğrular. Başka hedef/action gönderilemez.
Dış işlem yalnız `fast-auth.testnet/sign`, 300 Tgas ve 1 yocto ile oluşturulur.
Kullanıcı onayını zincirde FastAuth/MPC doğrular; sponsor hak sahibi değildir.

[Cloudflare named entrypoint/service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)
platform yolu kullanıldı. Yeni public signer URL'si ve yeni Worker servisi yok.
Gerçek Web Service binding'i veya canlı Worker kurulmadı; bunlar kaynak
başarısından ayrı kanıt gerektirir. Named entrypoint'in Node test stand-in'i
Cloudflare RPC/DO runtime kabulü sayılmaz.

## Kalıcı kayıt ve tekrar koruması

Mevcut DO namespace'inde `mpc:testnet:<publicKey>:<epoch>` nesnesi tüm
kullanıcıların sponsor nonce/bütçe otoritesidir. Kayıt anahtarı network + Market
+ kullanıcı + amaç + kaynak + server attempt ID üzerinden türetilir.
Atomik storage transaction içinde günlük rezerv, hesap deneme sayısı,
aktif işlem, nonce ve amaç kaydı birlikte ayrılır. Nonce
`max(chainNonce, storedNonce) + 1` olur. Ağ kontrolü sürerken başka bir
rezerv oluşursa eski bakiye/nonce gözlemiyle ilerlenmez.

İlk sürüm aynı sponsorda tek dış isteği ilerletir. Aynı kullanıcının ekonomik
kilidi ayrıca tutulur. Eşzamanlı aynı istek ikinci gönderimi başlatamaz;
farklı payload aynı attempt'in üstüne yazılamaz. Bellek kilidi tek güvence değildir.

Dış işlem bellekte imzalanır. Hash, nonce, block hash, onay tokenının SHA-256
özeti ve unsigned iç bytes gönderimden **önce** kalıcıdır. Raw JWT, kullanıcı
subject'i, private key veya JWT taşıyan signed dış gövde kaydedilmez/loglanmaz.
`SUBMITTED` gönderim sınırına girildiğini belirtir; zincir başarısı değildir.
Timeout, bilinmeyen RPC sonucu, imzalama/gönderim sınırında kapanma veya
`not found` otomatik yeniden gönderim yetkisi vermez. Rezerv korunur.

`status` taze ödeme onayı istemez; geçerli ürün oturumuyla aynı kullanıcının
kaydını okur. İşlem ID'si kaybolmuşsa hesabın aktif kaydı bulunur. Gönderim
bayrağı kapalıyken de status çalışır. Geçmiş dış işlemde tam sponsor/key/nonce,
hedef/action, exact token özeti ve payload, final receipt'ler, gider sınırı ve
Ed25519 imzası doğrulanır. Böylece eski JWT'yi yeniden yetkilendirmeden geçmiş
imza doğrulanır. `MPC_VERIFIED` bileti satın aldı veya upload yayımlandı demek değildir.
Durum yanıtında sonraki iç işlem için unsigned bytes ve doğrulanmış imza bulunur.

## Kapalı varsayılanlar ve limitler

Kaynakta hiçbir ortam değeri etkinleştirilmedi. Yeni gönderim için hem Web
`NEAR_AUTH_V1_MPC_ENABLED=true`, hem Bridge `NEAR_AUTH_MPC_ENABLED=true` gerekir.
Web sponsor hesabı `NEAR_AUTH_V1_MPC_ACCOUNT_ID`; Bridge ayrı sponsor hesap,
private key ve key epoch ister. Operator/upload-relayer hesap veya anahtarı
tekrar kullanılırsa reddedilir; bu gate gerçek bir anahtar üretmez.

Bridge zorunlu limitleri:

- `NEAR_AUTH_MPC_OPERATION_YOCTO`: mevcut incelemedeki sabit **0,35 test NEAR**
  rezerv; daha düşük tutar güvenli varsayılmaz, daha yüksek tutar kabul edilmez.
- `NEAR_AUTH_MPC_DAILY_YOCTO`: sponsor anahtarı için toplam günlük rezerv tavanı.
- `NEAR_AUTH_MPC_ACCOUNT_DAILY_ATTEMPTS`: hesap başına günlük deneme tavanı.
- `NEAR_AUTH_MPC_MIN_BALANCE_YOCTO`: storage/locked tutarları sonrası kalması
  gereken minimum bakiye; yeni işlem rezervi ayrıca mevcut olmalıdır.

Eksik/yanlış limit ve yetersiz bakiye gider başlatmaz. Protokol 85, gas fiyat
sınırı ve FastAuth hedef/domain/pause görünümü mevcut testnet sınırında doğrulanır.
Günlük sayaç **rezerve toplamı** sayar; ölçülen `burntYocto` ayrı tutulur.
Belirsiz rezerv iade edilmez. Gerçek kullanıcı başı maliyet ölçülmüş değildir.

## Bilinen sınırlar ve sonraki gate

- Bu gate dış MPC göndericisini tamamlar. Kullanıcının ekonomik kilidi
  `MPC_VERIFIED` sonrasında korunur. İç bilet işlemini/ücretli job'ı zincirde
  kesinleştirmeden kilit kaldırılmaz; bunu yapacak API/UI henüz bağlanmadı.
- Sonraki kaynak adımı kalıcı iç hash/gönderim/receipt/entitlement doğrulamasını
  ve başarı sonrası kilit çözülmesini eklemelidir. Mevcut lab `complete`
  fonksiyonu geçmiş review süresi dolduğunda doğrudan kullanılamaz.
- Kayıtlar mevcut **256 kalıcı kayıt/DO** sınırında korunur. Kapasite dolunca
  yeni harcama reddedilir. Otomatik arşivleme veya başarısız işlemi yeniden
  ödeme motoru kurulmadı; daha geniş kullanım öncesi ayrıca çözülmelidir.
- Key epoch değişimi eski nesneye status erişimini taşımaz. Açık kayıt varken
  key/epoch değiştirilmez; taşıma/uzlaştırma canlı hazırlığın ayrı sınırıdır.
- Kart V1 hedefi, yeni hesabın fonlaması, stablecoin/diğer kriptolar ve hesap
  bağlama için önceki kapsam kararları değişmedi. Hesap bağlama V1 dışında.

**Tek sonraki gate: `NEAR_AUTH_V1_TICKET_PAYMENT_SOURCE`.** Önce fund-ready
kullanıcı için doğrulanmış MPC sonucunu kalıcı iç bilet gönderimi ve NEAR
hakkına bağlamak; ardından ayrı upload entegrasyonu. Yeni gerçek binding,
secret/fonlama, bayrak açma, canlı kabul ve deploy bu sonraki kaynak gate'inin
örtülü parçası değildir.

## Doğrulama

- **LOCAL_TEST:** Web 919 test / 48 dosya PASS. Mevcut lab, wallet ve upload
  testleri dahil. Ürün ticket/upload kabulü, yanlış client/lab review/hesap/origin,
  eksik binding, eski onay ve yalnız oturumla status kontrolü geçti.
- **LOCAL_TEST:** Bridge tam paketi 457 PASS / 3 skip; ardından ayrı anahtar
  guard testi eklendi, son focused paket **22 PASS**. Eşzamanlı tekrar, restart,
  RPC cevabı kaybı, kalıcı hash, boş limit/bakiye/günlük tavan, canonical yanlış
  action/hedef, compact delegate domain, yanlış receipt/imza/epoch, public
  HTTP erişimsizliği ve saklanan veride secret/token yokluğu doğrulandı.
- **LOCAL_TEST:** Bridge provider-canary paketi **118 PASS**; mock kontrollerdir.
- **LOCAL_STATIC:** Bridge tip, Web strict auth tip, tam Web tip ve lint PASS.
- **LOCAL_STATIC:** Doküman build PASS; mevcut 500 kB chunk uyarısı sürüyor.
- **LOCAL_STATIC:** Wrangler `deploy --dry-run` PASS; deploy yapılmadı.
- Tam Web UI/browser, gerçek Cloudflare RPC/DO, provider/MPC imzası, fonlama,
  ücret, bilet/izleme, upload, hosted/Production ve CI: **EXTERNAL_NOT_RUN**.
- Kontrat değişmedi; Rust testleri bu gate'te tekrarlanmadı.

Sonuç: kaynak sınırı tamamlandı; canlıya açma engelleri binding/anahtar ve
onaylı limit hazırlığı, iç ödeme entegrasyonu ve gerçek kabul kanıtıdır.
Yerel mock testleri bunların yerine geçmez.
