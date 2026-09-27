# NEAR Auth V1 — kapalı cihaz kurtarma runtime kurulumu

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LOCAL_RUNTIME_SETUP`.
26 Eylül 2026 — **PASS (yerel kapalı runtime / Chrome oturum kabulü)**.

Web ve özel Bridge aynı origin, sponsor, epoch ve kalıcı kayıtlarla yeniden
çalışıyor. Cihaz dahil bütün gönderim izinleri kapalı. Özel bağlantı iki
hesabın önceki `UPLOAD_SETTLED` kaydını doğru döndürüyor. Chrome gerçek
uygulamayı açıyor; yeni yerel Web oturumu için kullanıcı girişi ve kapalı cihaz status kabulü doğrulandı.
Bu sonuç cihaz etkinleştirme veya oynatma kabulü değildir.

## Kapsam ve uygulama

Repo kapsamında yalnız bu rapor ve ana plan; yerel çalışma kapsamında
geçici başlatıcı, servis süreçleri/registry ve `runtime-public.json` adresi.
Uygulama/kontrat kaynağı, config dosyaları, paketler, index, sponsor/epoch,
cihaz/taslak ve ekonomik kayıtlar korunur. Yeni cihaz anahtarı, fonlama,
ödeme, upload, Market/MPC gönderimi veya deploy kapsam dışıdır.

- Ön kontrolde iki servis de yoktu. Eski Web session secret mevcut ortamda
  bulunmadı; kapanmış süreçten devamlılığı varsayılmadı. Kurulum için yeni
  rastgele yerel session secret yalnız bellekte oluşturuldu. Kullanıcıya
  yeniden giriş gereği açıklandı; NEAR kimliği veya cihaz anahtarı değişmedi.
- `start-closed.mjs` yalnız `check` veya `setup-approved` modunu kabul eder.
  Onaysız çalıştırma anahtar okumadan/süreç açmadan reddedildi. `check`
  config hash'leri, kapalı bayraklar, boş portlar, aynı actor baytları ve
  registry'deki eski portların kapalı oluşunu doğruladı. Sözdizimi PASS.
- Eski birleşik `start.mjs` çalıştırılmadı. Mevcut Bridge/Web config'leri
  yeniden yazılmadı. Sponsorun mevcut Keychain anahtarı bellekte okundu ve
  public key eşleşmesi doğrulandı; özel anahtar argv/dosya/loga yazılmadı.
- Bridge, kurulu Wrangler **4.90.0** ile `remote:false`, `envFiles:[]`,
  `watch:false`, aynı `state/` ve `registry/` ile güncel kaynaktan başladı.
  Eski registry dosyaları topluca silinmedi; Worker kendi kaydını yeniledi.
- Başlatıcı PID **29344**; Web CLI **29349**, listener **29350**;
  Web origin `http://localhost:3000`. Özel Bridge adresi
  `http://127.0.0.1:62969/`. Local-only bağlantı; hosted dağıtım yok.
- Bridge'e `NEAR_AUTH_{MPC,TICKET,UPLOAD,DEVICE}_ENABLED=false` açık
  binding override'ları verildi. Çalışan Web ortamında
  `NEAR_AUTH_V1_{MPC,TICKET,UPLOAD,DEVICE}_ENABLED=false` doğrulandı.
  Başlatıcı/session-key hash eşitliği güvenli biçimde kontrol edildi;
  anahtar değeri açığa çıkarılmadı.
- Sponsor **e582a5e0…1f975c**, epoch **local-v1**; limitler ve quote public
  key/version aynı. `runtime-public.json` yalnız Bridge adresinde değişti.

## Gerçek yerel kontrol

- Kullanıcının mevcut Chrome sekmesi yeniden yüklendi; localhost hata
  ekranı yerine YouTick yükleme sayfası açıldı. İlk restore tamamlandıktan
  sonra girişsiz ekran görüldü. Depo temizleme veya hesap değiştirme yok.
- `/api/auth/device` route'u gerçek Web'de çalışıyor. Girişsiz status ve
  eksik prepare isteği **401 / session_required** döndü; hazırlık veya
  anahtar üretimi gerçekleşmedi. Bu, girişli status kabulü değildir.
- Geçici salt-okunur servis-binding probe'u gerçek aynı özel Bridge'in
  `status(accountId)` metodunu çağırdı. Her iki hesapta da ön kontroldeki
  son işlem pointer'ı ve `UPLOAD_SETTLED` eşleşti. Probe dispose edildi;
  Web'in mevcut registry/service kaydı kullanılmaya devam ediyor.
- Google `29445f46…72324c` → `fefa14…9cd4` /
  `lp-969b04b0-f205-492d-a6a8-156b18030561`.
- Passkey `9db6cbd9…59d21a` → `0f9e0e…1444` /
  `lp-fddf7a11-0dca-4705-ac0f-dedbcff308a4`.

Kullanıcı girişini tamamladı. Chrome'da eski Google hesabıyla eşleşen
`29445f46…72324c` görünüyor; upload ekranı gönderimlerin kapalı olduğunu
belirtiyor. Gerçek Web session POST ve account/upload okumaları **200**.

Aynı Chrome oturumunda yalnız `{action:"status", operationId:""}` gövdesiyle
`/api/auth/device` sorgulandı. Güvenli özet: **HTTP 200, enabled:false,
state:UPLOAD_SETTLED, accountMatches:true, operationMatches:true,
purpose:upload**. Mevcut Google son-işlem pointer'ı `fefa14…9cd4` eşleşti.
İstek native Chrome konsolundan yapıldı; cookie/token çıkarılmadı, depo
okunmadı veya yazılmadı. DevTools kapatılıp kullanıcı mevcut upload
sayfasında bırakıldı. Kullanıcıdan cihaz onayı veya işlem imzası istenmedi.

## Korunma ve doğrulama

Başlangıç ve servis açılışı sonrası actor kopyaları, kaynakta WAL yokken ve
kopyalama boyunca baytlar aynıyken alındı. Salt-okunur/immutable SQLite
integrity **ok**. **10 MPC kaydının hash'i aynı:** dört settled operation,
iki user pointer, nonce, global ve iki hesap günlük sayacı. Aktif kilit yok.
Config/sponsor/başlatıcı dosyaları aynı; runtime metadata'da yalnız adres
farklı. Registry ve altyapı dosyalarının normal çalışma değişimleri ayrı.

**LOCAL_TEST:** 12 mevcut `near-auth-dev-runtime` testi PASS; yerel binding'in
development/testnet sınırları. Başlatıcı sözdizimi, onaysız ret ve kapalı
precheck PASS. **Yerel gerçek runtime:** Web/Bridge başlangıcı, Chrome
sayfası, girişsiz route ve iki özel binding status okuması doğrulandı.
Son salt-okunur probe sonrasında da 10 MPC kaydı aynı ve SQLite integrity
**ok**. Girişli cihaz status kontrolü sonrasında da aynı 10 kayıt, session-key hash
ve dört çalışan Web gönderim bayrağı tekrar doğrulandı. Tüm gönderimler
kapalı bırakıldı.
Doküman build ve iki dosyalık kapsam kontrolü PASS; index ve kaynak/config
korunuyor. Mevcut doküman 500 kB bundle uyarısı sürer.

**EXTERNAL_NOT_RUN / UNPROVEN:** gerçek cihaz yeni/yenileme onayı,
Auth0 transaction onayı, MPC/Market gönderimi, yeni satın alma/fonlama,
upload, yeniden oynatma, hosted runtime, CI/deploy. Önceki kaynak testleri
bu tur yeni provider/device kabulü sayılmaz.

Kanıt ve dar başlatıcı:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-device-local-setup-h5vosx4r/`.
`runtime-safe.json`, `private-status-safe.json`, `preservation-safe.json`,
config/MPC hash'leri ve actor kopyaları bu dizindedir. Uygulama logları
kimlik query'si/token/cookie içermeyen dar HTTP sonuçlarına filtrelendi.

Bu gate için blocker yok. Bu kabul, gerçek yeni cihaz etkinleştirme veya
süresi dolan cihazı yenileme kabulü değildir; pending ödeme/expired-device
sınırı kaynak raporundaki gibi açık kalır.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ACCEPTANCE` — başlatılmadı.**
Gerçek cihaz denemesinde aynı hesap/hak, boş slot ve bütçe yeniden okunmalı;
harcama izinleri ve kullanıcı işlem onayı bu kurulumdan çıkarılmamalı.
