# NEAR Auth V1 — kapalı yerel runtime yenilemesi

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_RUNTIME_REFRESH`.
26 Eylül 2026 — **PASS (yerel kapalı runtime / Chrome)**.

Yerel Web ve özel Bridge güncel kaynakla yeniden açıldı. Aynı Web oturum
anahtarı, sponsor, epoch ve bütün MPC kayıtları korundu. MPC, ticket, upload
ve device gönderimleri kapalı. Özel bağlantı doğru DEVICE_SETTLED kaydını
döndürüyor; kullanıcı girişinden sonra Chrome Web durum kabulü de tamamlandı.

## Kapsam

Repo değişikliği yalnız bu rapor ve ana plan. İzinli yerel değişiklikler:
servis süreçleri, normal registry/bundle çıktıları ve runtime-public.json
Bridge adresi. Kaynak/kontrat/paket, canlı config, index, cihaz kaydı,
nonce/ödeme geçmişi korunur. Fonlama, imza, ödeme, upload, kayıt geri alma,
provider ayarı ve deploy yok.

## Yapılan yenileme

- Önceki başlatıcı **32554**, Web CLI **32559** ve dört false gönderim
  bayrağı doğrulandı. Çalışan Web'deki session secret'ın hash'i, önceki
  kurulum kaydıyla eşleşti; değer dosyaya veya loga yazılmadı.
- Önceki kabulün dar `switch-runtime.mjs reclose-approved` yolu kullanıldı.
  Bu yol yalnız doğrulanmış kurulum PID'lerini ve aynı session-key hash'ini
  taşıyan Web proxy'sini kapatır. Mevcut secret bellekte yeni sürece aktarılır;
  rastgele yeni Web anahtarı oluşturulmaz. Başlatıcıların syntax kontrolü PASS.
- Güncel kaynak `start-scoped.mjs` tarafından aynı state/registry ile,
  `remote:false`, `envFiles:[]`, `watch:false` olarak yüklendi. Sponsor
  Keychain anahtarı aynı public key ile yeniden kullanıldı; Keychain kaydı
  veya anahtar değeri değiştirilmedi.
- Yeni başlatıcı **41946**, Web CLI **41951**. Origin
  `http://localhost:3000`; özel Bridge `http://127.0.0.1:49881/`.
- Çalışan Web'de `NEAR_AUTH_V1_{MPC,TICKET,UPLOAD,DEVICE}_ENABLED=false`;
  Bridge aynı dört false binding override'ıyla başladı. Session-key hash'i
  önce/sonra aynı. Sponsor `e582a5e0…1f975c`, epoch **local-v1** aynı.

## Yeni kaynak kanıtı

Yeni bundle:
`tmp/near-auth-ticket-local-setup/.wrangler/tmp/dev-3Nhrs3/index.js`.
SHA-256: `58b89213ec5715a03d4757fe999854344c2ff135c0b5b8b28de564ca1f46adad`.

Arşiv endpoint'i, `readFinalTransaction` ve değişmeyen ücret alanları
`paidFields` yeni bundle'da var. Source map'in `mpc-sponsor.ts` içeriği
repo kaynağıyla hash olarak eşleşiyor. Başlangıçta alınan ilgili kaynak
hash'leri yenileme sonrasında aynı. Bu, yeni kaynaktan yerel derleme/başlatma
kanıtıdır; CI artifact veya hosted deploy değildir.

## Bağlantı ve oturum

Geçici salt-okunur service-binding probe'u yeni özel Bridge üzerinden
eski Google hesabının durumunu okudu:

- Hesap `29445f46…72324c`.
- Durum **DEVICE_SETTLED**, purpose **device**, USDC tutarı **0**.
- Operation `d1305aebe4ebb69254d59a7e3e25c4b304ecb5b914695ae90fd7d142e52fe5cd`.
- Önceki onaylı cihaz işleminin outer/inner hash'leri aynı.

Probe dispose edildi; submit veya execute çağrılmadı. Bu terminal kayıt
okuması arşiv yolunu yeniden çalıştırmaz. Gerçek arşiv/ödeme çekirdek kanıtı
önceki [yalıtılmış kabul](./near-auth-v1-device-recovery-late-reconciliation-acceptance.md)
raporundadır.

Mevcut Chrome upload sekmesi yeniden yüklendi. İlk restore sonrasında
girişsiz ekran görüldü; anahtar rotasyonu yapılmadı ve kesin neden bu gate'te
araştırılmadı. Kullanıcı eski Google hesabıyla yeniden giriş yaptı.
Diğer sekmedeki giriş değişikliği nedeniyle upload sekmesinde görülen
uyarı, sayfa yenilenince kalktı. Her iki sayfada doğru `2944…324c` hesabı
ve upload ekranında kapalı gönderim açıklaması doğrulandı.

Aynı Chrome oturumunda native konsoldan yalnız `/api/auth/device` status
isteği yapıldı: **HTTP 200, enabled:false, state:DEVICE_SETTLED,
accountMatches:true, operationMatches:true, purpose:device**. Operation
`d1305aeb…2fe5cd` aynı kaldı. Cookie/token çıkarılmadı, tarayıcı deposu
okunmadı/temizlenmedi; cihaz onayı veya işlem imzası istenmedi. DevTools
kapatılıp normal uygulama görünümüne dönüldü.

## Korunma ve doğrulama

Actor başlangıç/sonuç kopyaları WAL yokken ve kopyalama boyunca baytlar
sabitken alındı; salt-okunur/immutable SQLite integrity **ok**. **11 MPC
kaydının hash'i aynı**; yeni operation, nonce/sayaç/pointer değişikliği yok.
Bridge/Web/sponsor/başlatıcı config dosyaları aynı. `runtime-public.json`
yalnız Bridge adresinde değişti; diğer metadata alanları aynı.

**Yerel gerçek runtime:** aynı key ile restart, yeni bundle/source-map,
kapalı bayraklar, private status ve Chrome uygulama sayfası doğrulandı.
Önceki kaynak test paketleri değişmediğinden tekrar çalıştırılmadı.
Girişli durum kontrolünden sonra aynı session-key hash, dört false bayrak
ve 11 MPC kayıt hash'i yeniden doğrulandı. Doküman build, iki dosyalık
kapsam/index ve canlı kayıt/config korunma kontrolleri **PASS**.
Mevcut doküman 500 kB bundle uyarısı sürer.

**UNPROVEN / EXTERNAL_NOT_RUN:** gerçek pending actor geçişi, yeni arşiv okuması, cihaz onayı/yenilemesi,
ödeme/upload/fonlama, hosted runtime, CI/deploy. Tarayıcı deposu temizlenmedi,
cihaz anahtarı üretilmedi.

Kanıt:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-runtime-refresh-wh2d1gn8/`.
Kaynak/config/session hash karşılaştırmaları, bundle kanıtı, actor
kopyaları ve private status özeti burada.

Bu gate için blocker yok. Servisler tüm gönderimler kapalı bırakıldı.
Arşiv desteği transaction sonuçlarına eklendi; cihazın geçmiş bloktan view
okuma yolu ayrı, henüz doğrulanmamış bir sınırdır.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_PREFLIGHT`
— başlatılmadı.** Bu kalan bağımlılığı salt-okunur incelemek; yeni cihaz
onayı, işlem veya runtime değişikliği başlatmak değil.
