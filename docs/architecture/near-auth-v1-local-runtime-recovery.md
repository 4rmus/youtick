# NEAR Auth V1 — kapalı yerel Bridge kurtarma

Gate: `NEAR_AUTH_V1_LOCAL_RUNTIME_RECOVERY`.
26 Eylül 2026 — **PASS (yerel kapalı runtime)**.

**Özel Bridge geri geldi; mevcut Web ve Chrome oturumu korunarak durum
sorgusu düzeldi.** Chrome'da `Check upload payment status` seçildikten sonra
gerçek Web API **200** döndü. Önceki hata uyarısı yerine hesabın bağlı,
Google/Passkey yükleme ödemelerinin bu ortamda kapalı olduğu açıklaması
göründü. Gönderim bayrakları açılmadı; yeni ödeme veya upload yapılmadı.

## Yapılan dar işlem

- Eski birleşik `start.mjs` çalıştırılmadı. Bu gate için hazırlanmış ayrı
  `recover-bridge.mjs`, kurulu Wrangler 4.90.0 ile **yalnız Bridge'i** başlattı.
  Başlatıcı gerekli onay modu verilmezse anahtar okumadan/süreç açmadan durur;
  bu koruma ve sözdizimi kontrolü çalıştırıldı.
- Mevcut `bridge.json`, `web.json`, `sponsor.json` ve eski başlatıcı hash'leri
  doğrulandı; dosyalar yeniden yazılmadı. Aynı `state/` ve `registry/`,
  `local-v1`, sponsor hesabı ve public quote key/version 1 korundu.
- Mevcut Keychain sponsor anahtarı yalnız bellekte okundu; public key
  eşleşmeden Worker açılmadı. Yeni anahtar üretilmedi; özel anahtar argv,
  dosya veya loga yazılmadı.
- Yerel başlatıcı PID **95151**; Bridge adresi **`http://127.0.0.1:61474/`**.
  `remote:false`, `envFiles:[]`, `watch:false`; tüm gönderim bayrakları false.
- `runtime-public.json` içinde yalnız eski Bridge adresi yenisiyle değişti.
  Registry'ye `youtick-bridge-local-auth` kaydı Worker tarafından eklendi.
  Boş state/epoch, kayıt silme, sayaç sıfırlama veya geniş süreç temizliği yok.

## Gerçek yeniden bağlantı ve oturum

Web CLI **69538**, listener **69539** olarak kaldı. Çalışan Web ortamı ve
oturum anahtarı başlangıca göre eşit; secret karşılaştırması yalnız hash
eşitliğiyle yapıldı, değer açıklanmadı. Web yeniden başlatılmadı. Mevcut
registry izleyicisi yeni Bridge'i otomatik keşfetti.

Chrome'daki `2944…324c` hesabı değişmedi. Yalnız görünür durum-okuma düğmesine
basıldı; gerçek `/api/auth/upload` yanıtı **200**, bu gate'te 422 ve yeni
session POST **0**. UI:

> Your account is connected. Upload payments with Google / Passkey are not available here yet.

Bu, status yolunun çalıştığı ve gönderimin kapalı kaldığı kanıttır. Kimlik
çözümlemesinin normal public RPC/discovery okumaları dışında yeni ekonomik
işlem yoktur. Yanıtın ham gövdesi/kimlik tokenı dışarı alınmadı; mevcut ödeme
durumları aynı actor'ın aşağıdaki değişmeyen kayıtlarıyla ayrıca kontrol edildi.

## Kayıt bütünlüğü

Başlangıçta WAL yokken actor'ın kopyası alındı. Çalışırken kaynak SQLite'ı
doğrudan read-only açma girişimi `unable to open database file` verdi; kaynak
değiştirilmedi. WAL bulunmadığı ve kopyalama boyunca dosya baytlarının sabit
kaldığı doğrulanıp son kopya `mode=ro&immutable=1` ile okundu. Integrity **ok**.

**10 MPC kaydının ham değer hash'leri başlangıçla aynı:**

- Dört operation: iki `TICKET_SETTLED`, iki `UPLOAD_SETTLED`.
- İki son-işlem pointer'ı: Google `fefa14…9cd4`, passkey `0f9e0e…1444`.
- Nonce `269862673000004`; bekleyen `mpc:active` yok.
- Global 24 Eylül rezerv kaydı ve iki hesabın tarihli deneme sayaçları aynı.

Config limitleri, `local-v1` ve public quote key değişmedi. Bunlar yerel
kayıt koruma kanıtıdır; yeni zincir finality, bakiye veya medya kabulü değildir.
Tekrar çalıştırılabilen `verify-preserved.py`, kayıt/config hash'lerini,
Web PID/ortam/oturum anahtarını ve metadata'da yalnız adresin değiştiğini
assert eder: **PASS**.

## Değişenler ve sonuç

- Repo: yalnız bu rapor ve ana plan. Uygulama/kontrat kaynakları, bağımlılıklar
  ve Git index korundu; doküman build/kapsam PASS. Mevcut 500 kB bundle uyarısı sürer.
- Yerel çalışma verisi: Bridge registry kaydı ve `runtime-public.json` adresi;
  Worker'ın altyapı dosyaları değişebilir, ekonomik/iş kayıtları aynı.
- Geçici başlatıcı, doğrulayıcı ve güvenli kanıtlar:
  `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-runtime-recovery-rce7mg1e/`.
- **Yerel gerçek runtime:** Bridge start + hot reconnect + Web status 200 +
  kapalı UI ve korunmuş oturum. Ön kontroldeki 4 Web/56 Bridge sentetik test
  bu tur tekrar çalıştırılmadı.
- **EXTERNAL_NOT_RUN:** yeni login, onay/imza, fonlama, bilet satın alma,
  upload/Livepeer çağrısı, provider ayarı/iletişim, Web restart, CI/GitHub/deploy.

Blocker yok. Bridge ve Web kapalı gönderim modunda çalışır bırakıldı; Chrome
oturumu korundu. **Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_PREFLIGHT`
— başlatılmadı.** Google/passkey ile farklı tarayıcı veya süresi dolan cihazdan
mevcut izleme hakkına dönüşün eksikleri salt-okunur değerlendirilecek; yeni
bilet, cihaz yetkilendirme imzası veya ödeme otomatik başlamayacak.
