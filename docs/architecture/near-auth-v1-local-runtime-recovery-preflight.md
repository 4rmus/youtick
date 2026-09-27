# NEAR Auth V1 — yerel runtime kurtarma ön kontrolü

Gate: `NEAR_AUTH_V1_LOCAL_RUNTIME_RECOVERY_PREFLIGHT`.
26 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Web çalışıyor; özel yerel Bridge servisi eksik.** Mevcut kayıtları koruyarak
yalnız Bridge'i kapalı gönderimlerle geri getirmek en küçük kurtarma adayıdır.
Web'i veya Auth0 oturumunu yeniden kurmak gerekmeyebilir. Bu gate hiçbir
servisi başlatmadı/durdurmadı; yalnız rapor ve ana planı değiştirir.

## Taze durum ve 422 sınırı

- Web CLI PID **69538**, listener **69539**, `localhost:3000`; origin/client
  aynı. Çalışan ortamda üç Web MPC/ticket/upload gönderim bayrağı **false**.
- Web `NEAR_AUTH_LOCAL_BINDINGS_CONFIG` ile mevcut `web.json` dosyasını
  kullanıyor. `NEAR_AUTH_MPC` bağlantısı `youtick-bridge-local-auth` servisinin
  `NearAuthMpcSponsor` named entrypoint'ine bağlı.
- Aynı `tmp/near-auth-ticket-local-setup/registry/` dizininde yalnız Web
  kaydı var. Bridge kaydı yok; `runtime-public.json` içindeki eski
  `127.0.0.1:52559` portunda dinleyen süreç yok. Bridge config'indeki üç
  gönderim bayrağı **false**; çalışan Bridge env'i varmış gibi sunulmaz.
- `apps/web/app/api/auth/upload/route.ts:44` gönderim kapalıyken de mevcut
  ödeme kaydını okumaya çalışır. Bağlantı nesnesi mevcut ama çağrı başarısızsa
  genel hata `upload_check_failed` / **422** olur. Ticket yolu aynı sınıfta
  `ticket_check_failed` verir. Bu durum ödeme başarısızlığı kanıtı değildir.
- Canlı API alttaki hatayı gizlediğinden eski 422'nin ham istisnası doğrudan
  yakalanmadı. Ancak Bridge'in eksikliği taze runtime kanıtıyla kesin ve aynı
  başarısız bağlantı koşulu yerel testte 422'yi üretiyor. Kurtarma sonrası
  gerçek status 200 görülmeden tüm 422'lerin giderildiği söylenmeyecek.

Kapalı status yolunu atlamak veya `payment:null` uydurmak çözüm değildir:
gerçek geçmiş/bekleyen kayıtların okunamaması ayrıca görünür kalmalıdır.

## Kayıtlar sağlam — yerel snapshot, yeni zincir kabulü değil

Bridge actor dosyasında WAL/SHM yoktu. Kaynak dosya değiştirilmeden alınan
kopya `mode=ro&immutable=1` ile açıldı; SQLite integrity **ok**. Yalnız
`mpc:` kayıtlarının güvenli alanları çözüldü. Actor adı beklenen sponsor
public key'i ve **local-v1** epoch'u ile eşleşiyor.

| Alan | Snapshot sonucu |
| --- | --- |
| Sponsor | `e582a5…1f975c`; metadata, Web ve Bridge aynı hesabı kullanıyor |
| Nonce | `269862673000004` |
| Bekleyen `mpc:active` | Yok |
| İşlem sayısı | **4**: iki `TICKET_SETTLED`, iki `UPLOAD_SETTLED` |
| Google son işlem | `fefa14…9cd4`, upload, `lp-969b04b0-f205-492d-a6a8-156b18030561` |
| Passkey son işlem | `0f9e0e…1444`, upload, `lp-fddf7a11-0dca-4705-ac0f-dedbcff308a4` |
| Global kayıtlı rezerv | 24 Eylül / `350000000000000000000000` yocto test NEAR |
| Hesap sayaçları | Google: 23 Eylül / 2; passkey: 24 Eylül / 1 |

Mevcut config limitleri: işlem 0,35 / günlük 0,70 test NEAR rezerv tavanı,
hesap başına 1 deneme, minimum 0,05 test NEAR. Bunlar bu gate'in yeni harcama
onayı değildir. Eski tarihli sayaçlar silinmez/sıfırlanmaz. Dört tamamlanmış
yerel kayıt, bu tur taze chain receipt veya bakiye sorgusu yapılmış demek değildir.

Mevcut Keychain girdisinin **yalnız metadata varlığı** doğrulandı. Özel
anahtar okunmadı; sonraki başlangıçta mevcut anahtarın public key eşleşmesi
yine doğrulanmalı. Quote doğrulama public key'i ve version **1** config'de
mevcut; quote özel anahtarı gerekmiyor.

## Eski başlatıcı neden doğrudan kullanılmamalı

`tmp/near-auth-ticket-local-setup/start.mjs` Bridge ile birlikte Web'i de
başlatır, config dosyalarını yeniden yazar ve `randomBytes(32)` ile yeni
Web oturum anahtarı üretir. Çalışan 3000 süreciyle çakışma ve mevcut girişleri
geçersiz kılma riski vardır. Acceptance modları harcama bayraklarını açabilir;
kurtarma için bu modlar kullanılmaz. Yeni key/epoch veya boş storage dizini
oluşturmak da mevcut işlem geçmişini ayırır.

Kurulu Web/Bridge Wrangler **4.90.0**, OpenNext **1.18.0**, near-api-js
**7.3.0** manifest/lock ile uyumlu. OpenNext mevcut `getPlatformProxy` yolunu
kullanıyor. [Wrangler API belgesi](https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy)
config'deki service bindings desteğini açıklar. Kurulu Miniflare'ın
`DevRegistry.watch/refresh` kodu aynı registry'deki servis eklenmesini izler;
bu nedenle **önce Web restart olmadan** Bridge'in yeniden keşfedilmesi
denenecek. Bu çalışan süreçte hot reconnect henüz **UNPROVEN**.

## Somut kurtarma paketi — çalıştırılmadı

**Tek sonraki gate: `NEAR_AUTH_V1_LOCAL_RUNTIME_RECOVERY` — başlatılmadı.**

1. Çalışan Web, aynı sponsor/public key/epoch, config hash'leri ve aşağıdaki
   storage snapshot'ı tekrar karşılaştırılır. Altı gönderim bayrağı false kalır.
2. Dar bir **Bridge-only** yerel başlatıcı, kurulu `unstable_startWorker`
   API'siyle mevcut `bridge.json` dosyasını **yeniden yazmadan** kullanır:
   `remote:false`, `envFiles:[]`, `watch:false`, aynı `state/` ve `registry/`,
   loopback adresi ve boş port. Web/config/bütçe/epoch/nonce değiştirilmez.
3. `sponsor.json` ile tanımlanan mevcut Keychain anahtarı yalnız bellekte
   okunur; public key eşleşmeden süreç açılmaz. Anahtar argv, dosya veya
   loga yazılmaz. Yeni key/secret/quote üretilmez. Mevcut public quote key korunur.
4. Yeni Bridge registry kaydı ve port doğrulanır; yalnız güvenli runtime
   metadata'sındaki eski adres güncellenebilir. Web PID ve oturum anahtarı
   korunur. Servis keşfedilmezse otomatik Web restart/registry temizliği yok;
   kalan sınır raporlanır.
5. Chrome'daki mevcut hesabın yalnız status okuması yapılır. Beklenti:
   HTTP 200, `enabled:false`, doğru hesabın mevcut `UPLOAD_SETTLED` kaydı;
   UI kapalı ödeme açıklamasını göstermeli, yeni işlem açmamalı. Bu API'nin
   kimlik çözümlemesi mevcut public RPC/discovery okumalarını kullanabilir;
   işlem gönderimi veya sağlayıcı medya çağrısı değildir.
6. Önce/sonra dört operation, user pointer'ları, nonce, aktif kilit ve günlük
   kayıtlar karşılaştırılır. Worker yeniden açılınca SQLite altyapı dosyaları
   değişebilir; finansal/iş kayıtlarının semantik ve ham değerleri korunmalı.
   Oturum, cihaz/taslak ve mevcut dosyalar silinmez. Ödeme/upload denenmez.

Kabul: Bridge aynı actor verisiyle çalışır, mevcut Web oturumu korunur,
closed status 200 olur ve hiçbir gönderim/kayıt kaybı oluşmaz. Bu plan
tek başına runtime başlatma/anahtar okuma yetkisi oluşturmaz.

## Yerel doğrulamalar ve sonuç

- **LOCAL_TEST:** mevcut Web API test altyapısının geçici kopyasında dört
  odaklı kontrol PASS: kapalı ticket/upload + bozuk binding → 422; kapalı
  ticket/upload + çalışan status → 200 / `enabled:false`, gönderim yok.
  122 başka test isim filtresiyle çalıştırılmadı; yeni repo testi eklenmedi.
- Bridge mevcut `mpc-sponsor.test.ts`: **56 PASS**. Tüm provider/RPC gönderim
  tarafları sentetik; gerçek ödeme veya Worker başlangıcı değildir.
- **LOCAL_STATIC:** SQLite integrity, runtime/config/key metadata, sürüm,
  kaynak/registry yolu ve doküman/kapsam kontrolleri PASS. Doküman build'in
  mevcut 500 kB uyarısı sürer. Kaynak, config, kayıtlar ve Git index korundu.
- **EXTERNAL_NOT_RUN:** özel anahtar okuma, Worker/Next start/stop, yeni
  login/imza/ödeme/upload, provider/config değişikliği, gerçek chain sorgusu,
  CI/deploy. Kurtarma sonrası status ve hot reconnect **UNPROVEN**.

Kanıt: `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-runtime-recovery-preflight-aomq13gl/`.
Ön kontrol blocker'ı yok; kapalı kurtarma işlemi henüz yürütülmedi.
