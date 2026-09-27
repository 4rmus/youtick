# NEAR Auth — mimari değerlendirme ve güncel entegrasyon planı

26 Eylül 2026. Bu belge social login pilotunun güncel durum ve plan kaydıdır.
Aşağıdaki tarihli incelemeler geçmiş kanıttır; eski sonraki-adım ifadeleri yeni
imza, ödeme veya yayın yetkisi oluşturmaz.

## Güncel durum

**Kart sağlayıcısı ve vergi rolü ön kontrolü — BLOCKED (dış teyit bekleniyor).**
26 Eylül kullanıcı seçimi: `YOUTICK_CARD_PROVIDER_AND_TAX_ROLE_PREFLIGHT`.
[Karar ve sorumluluk kaydı](./youtick-card-provider-tax-role-preflight.md) ile
[sağlayıcı soru paketi](./youtick-card-provider-enquiry.md) hazırlandı.
Reach/Zotlo MoR, Mangopay/Nuvei pazaryeri adaylarıdır; seçilmiş sağlayıcı yok.
YOUTICK LTD / 17290900 resmî kaydı doğrulandı. Kullanıcı beyanı: Türkiye'den
solo yönetim, personel yok; ilk üreticiler TR ve bazı Avrupa ülkelerinde;
minimum bilet 2 USD ve ilk aylarda düşük satış beklentisi. Kayıtlı Londra
adresi fiziksel ofis kanıtı değildir. Vergi yerleşimi, YouTick'e özel yazılı
kabul/teklif ve vergi rolü kesinleşmedi. Dış iletişim, başvuru, ödeme ve
entegrasyon yapılmadı.
**Tek sonraki gate: aynı kart preflight'ının eksik bilgi ve yazılı cevaplarla
kapanışı.** Yeni kaynak veya canlı ödeme gate'i başlatılmaz.

**Cihaz kurtarma fazı kapatıldı — PASS (geliştirme ve yalıtılmış kabul).**
Kullanıcının 26 Eylül tarihli sadeleştirme kararıyla ayrı runtime gate'i
kaldırıldı; olağan kapanış kontrolü mevcut rapora eklendi. Çalışan private
Bridge aynı cihaz operation'ı için DEVICE_SETTLED, purpose:device ve
amountUsdc:0 döndürdü. Yeni işlem veya servis restart yapılmadı.
Chrome'da eski Google hesabı bağlı ve upload ödemeleri kapalı görünüyor.
Eski açık izleme sekmesindeki uyarı açık hata olarak izlenmiyor:
kullanıcı Google hesabıyla yeniden giriş yapıp videoyu açtığını ve
oynatmanın çalıştığını teyit etti. Önceki
[cihaz kabulünde](./near-auth-v1-device-recovery-acceptance.md) 1920×1080
tam oynatma ve iki reload, `error:null` ile doğrulanmıştı. Eski uyarının
oturum/yenilenmemiş sekmeyle ilişkisi kullanıcı açıklamasıdır; kesin
kök neden ayrıca ölçülmedi. Yeni hata veya test gate'i açılmadı.

**Cihaz kurtarma fazında yeni gate yok.** Doğal 30 günlük gecikme ve production kabulü, bu kaynak
fazını açık tutan işler olarak izlenmeyecek; ilgili gerçek kullanım/yayın
kapsamında değerlendirilecek. Tarihli gate kayıtları aşağıda korunur.

Son tamamlanan gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_ACCEPTANCE` — **PASS (yalıtılmış çekirdek + gerçek testnet okumaları)**.
[Tarihsel cihaz kabulü](./near-auth-v1-device-recovery-historical-state-acceptance.md):
gerçek device operation'ının iki bellek kopyası DEVICE_SUBMITTED →
DEVICE_SETTLED oldu. Normal senaryo üç gerçek primary okumayla;
zorlanmış senaryo iki benzetilmiş UNKNOWN_BLOCK sonrası gerçek arşiv
view'larıyla geçti. Her kopyaya tek terminal yazımı, aynı receipt
bloğu/ücret; toplam 6 gerçek okuma + 2 benzetilmiş hata. Canlı yazım,
yeni imza/broadcast yok. 11 MPC kaydı, source/config/index korundu.
Yalnız rapor/plan değişti. Doğal geçmiş-device blok kaybı, gerçek 30 gün
gecikme ve çalışan Web/private binding kabulü bu sonuçtan çıkarılmaz.
Ek runtime gate'i kullanıcı kararıyla kaldırıldı; mevcut faz kapanışına alındı.

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_ACCEPTANCE_PREFLIGHT` — **PASS (yalıtılmış kabul için GO)**.
[Tarihsel cihaz kabul ön kontrolü](./near-auth-v1-device-recovery-historical-state-acceptance-preflight.md):
gerçek device işlemi ve receipt bloğundaki iki view primary/arşivden
6 salt-okunur istekle doğrulandı. Tek operation kopyası, tek-export
çekirdek, 43 girdiye bağlı hash kilidi ve 11 yasak istek kontrolüyle
kabul paketi hazır. Uzlaştırma henüz çalıştırılmadı. Primary bugün
aynı bloğu okuyabiliyor; doğal geçiş ve açıkça benzetilmiş primary
hatası + gerçek arşiv senaryoları ayrı raporlanacak. Canlı 11 MPC kaydı,
source/config/index korundu; servis restart yapılmadı. Mevcut bundle
source map'i güncel kaynakla eşleşiyor; önceki “yüklenmedi” ifadesi
güncel runtime kanıtı değildir. Canlı süreçte yolun kabulü doğrulanmadı.
Yalnız rapor/plan değişti.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_ACCEPTANCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_SOURCE` — **PASS (LOCAL_STATIC / LOCAL_TEST)**.
[Tarihsel cihaz kanıtı kaynağı](./near-auth-v1-device-recovery-historical-state-source.md):
doğrulanmış cihaz receipt bloğundaki iki view, ana sağlayıcı erişemediğinde
aynı blok/Market/args ile en fazla bir sabit arşiv okuması yapar.
Yanlış veya olumsuz kanıtta fallback yok; pending ve sayaçlar korunur,
yeni gönderim oluşmaz. Mevcut transaction okuyucusu paylaşıldı;
genel RPC, ödeme ve güncel playback denetimleri değişmedi.
MPC 144, Bridge 598 (+3 mevcut skip), Web 1038 test ve iki tip kontrolü
PASS. Dört dosyalık kaynak/test/rapor/plan kapsamı; 11 canlı MPC kaydı,
config ve index aynı. Çalışan watch:false Bridge yenilenmedi;
bu kaynağın gerçek tarihsel-device/runtime kabulü henüz yok.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_ACCEPTANCE_PREFLIGHT` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Geçmiş state ön kontrolü](./near-auth-v1-device-recovery-historical-state-preflight.md):
gerçek receipt bloklarına sabitlenen iki örnek okundu. Bugünkü device
bloğunda primary/arşiv doğru; 23 Eylül ticket kontrol bloğunda primary iki
view için UNKNOWN_BLOCK, arşivde aynı blok/hak/key/sertifika/30 gün doğru.
Transaction fallback'i mevcut, reconcileDevice içindeki tarihsel view
fallback'i yok. İki izole teşhis bu durumda pending'in korunduğunu ve
yanlış blok reddini doğruladı. 2 tx + 8 view salt-okunur; 11 MPC kaydı ve
config/source/index aynı. Bugünkü cihazda gerçek gecikme arızası iddiası yok;
daha eski tarihsel state bağımlılığı için kaynak kapsamı belirlendi.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_RUNTIME_REFRESH` — **PASS (yerel kapalı runtime / Chrome)**.
[Kapalı runtime yenilemesi](./near-auth-v1-device-recovery-runtime-refresh.md):
Web ve özel Bridge yeni kaynakla aynı session key/sponsor/epoch/state ile
başladı. Bundle/source-map arşiv okuyucusu ve late settlement kaynağıyla
eşleşiyor. Kullanıcı yeniden giriş yaptı; doğru Google hesabı ve gerçek
Web cihaz status **200 / enabled:false / DEVICE_SETTLED**, aynı operation
pointer'ı doğrulandı. Dört gönderim bayrağı false; 11 MPC kaydı ve config/index
korunuyor, yalnız runtime adresi değişti. Yeni imza/ödeme/cihaz/deploy yok.
Bu gate'te blocker yok; eski bloktaki device view erişimi ayrı açık sınır.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_PREFLIGHT` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_ACCEPTANCE` — **PASS (yalıtılmış çekirdek + gerçek testnet okumaları)**.
[Gecikmiş uzlaştırma kabulü](./near-auth-v1-device-recovery-late-reconciliation-acceptance.md):
iki eski Google ödeme kaydının bellek kopyası yeni kaynakla TICKET_SETTLED /
UPLOAD_SETTLED oldu. Primary eski tx timeout → aynı hash arşiv 200;
mevcut hak ve ücretli job okumaları da 200. Toplam 4 gerçek salt-okunur
istek; cihaz/access-key sorgusu yok. Her kopyaya tek terminal yazımı,
canlı storage yazımı/imza/gönderim 0. 11 gerçek MPC kaydı/config/index aynı.
Bu, benzetilmiş gecikmiş başlangıç ve gerçek ekonomik kanıt kabulüdür;
canlı pending actor/Web/hosted kabulü değildir. Runtime yenilenmedi,
çalışan watch:false Bridge yeni kaynağı henüz yüklemedi. Dar kabulde blocker yok.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_RUNTIME_REFRESH` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ARCHIVAL_RPC_SOURCE` — **PASS (LOCAL_STATIC / LOCAL_TEST)**.
[Arşiv okuması kaynağı](./near-auth-v1-device-recovery-archival-rpc-source.md):
dış MPC, ticket ve device transaction sonuçları aynı hash/sender/FINAL ile
primary → en fazla bir sabit arşiv okuması kullanır. Her istek 15 s / 256 KiB;
bozuk veya çelişkili kanıt başka sağlayıcıyla onarılmaz, iki erişim hatasında
pending kayıt korunur. Query/broadcast yolları aynı; yeni gönderim yok.
572 Bridge + 1038 Web ve tip kontrolleri PASS; 3 isteğe bağlı test atlandı.
Yeni hash'lerle yalıtılmış paket hazır: 4 izinli okuma, 10 ret kontrolü PASS,
ağ isteği 0. Gerçek kabul çalıştırılmadı. 11 canlı MPC kaydı/config/index
korundu, runtime yenilenmedi. Kaynak blocker'ı yok; tarihsel device view ve
canlı/hosted kabul bu sonuçtan çıkarılmaz.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_ACCEPTANCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_ACCEPTANCE_PREFLIGHT` — **COMPLETED_WITH_WARNINGS / kabul NO-GO**.
[Gecikmiş kabul ön kontrolü](./near-auth-v1-device-recovery-late-reconciliation-acceptance-preflight.md):
iki eski Google ödeme kaydının payload/imzası doğrulandı; sadece iki
uzlaştırma fonksiyonunu ve üç salt-okunur isteği açan yalıtılmış paket
hazır. Canlı kayıt değiştirilmedi; bellek içi uzlaştırma başlatılmadı. Primary eski
bilet sonucunu süre sınırında getiremedi; aynı hash resmî arşiv RPC'den
FINAL/başarılı geldi. Güncel hak true ve doğru Published ücretli upload
okunuyor. Kaynakta tarihsel tx yedeği yok; kabulden önce bu sınır giderilmeli.
7 ağ ret kontrolü ve NO-GO koruması PASS; 11 MPC kaydı, source/config/index
aynı. Provider ayarı, yeni imza/ödeme/cihaz veya runtime/deploy yok.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ARCHIVAL_RPC_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_SOURCE` — **PASS (LOCAL_STATIC / LOCAL_TEST)**.
[Gecikmiş uzlaştırma kaynak düzeltmesi](./near-auth-v1-device-recovery-late-reconciliation-source.md):
bilette tam ödeme/olay ve doğrudan final hak kontrolü korundu; bugünkü
cihaz/key ödeme geçmişini engellemiyor. Yüklemede değişmeyen ücretli iş
alanları ve quote hash korunuyor; değişebilir upload key/expiry ve bugünkü
cihaz ayrıldı. İş yoksa pending, status gönderimsiz; playback yetki
kontrolleri aynı. 11 yeni olumlu regresyon önce başarısız, sonra PASS.
540 Bridge + 1038 Web testi ve tip kontrolleri PASS; 3 isteğe bağlı Bridge
testi çalıştırılmadı. 11 canlı MPC kaydı/config/index korundu. Yeni kaynak
çalışan watch:false Bridge'e yüklenmedi; gerçek gecikmiş kabul UNPROVEN.
Kaynak blocker'ı yok; restart, imza/ödeme/cihaz onayı veya deploy yok.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_ACCEPTANCE_PREFLIGHT` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Gecikmiş uzlaştırma ön kontrolü](./near-auth-v1-device-recovery-late-reconciliation-preflight.md):
bilet/yükleme tamamlanması bugünkü cihaza, bilet ayrıca bugünkü hesap
anahtarına; upload karşılaştırması değişebilir upload key'e bağlı.
Kesinleşmiş ödeme bu değişimlerden sonra pending kalabiliyor. 14 izole
teşhis ve aynı 14 geçici aday kontrolü PASS; ödeme/hak/fee/quote kanıtını
koruyup değişebilir cihaz/key koşullarını ayıran dar kapsam belirlendi.
Aday repo kaynağına uygulanmadı. Mevcut 122 Bridge testi + 3 kontrat testi
PASS; 3 isteğe bağlı Bridge testi çalıştırılmadı. 11 canlı MPC kaydı ve
config metadata aynı; browser/chain/send/runtime/deploy işlemi yok.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ACCEPTANCE` — **PASS (Chrome / Google / yeni cihaz / localhost + public testnet)**.
[Gerçek cihaz kabulü](./near-auth-v1-device-recovery-acceptance.md): kullanıcı
tek cihaz bütçesini ve sağlayıcıdaki işlemi onayladı. Mevcut biletle tek
`activate_playback_device` çağrısı **DEVICE_SETTLED**; dış/iç FINAL ve başarılı
receipts, doğru key/sertifika/hak/30 gün doğrulandı. USDC aktarımı yok.
Aktif cihaz 1 → 2; eski Google ve passkey cihazları korundu. Gönderimler
tekrar kapalıyken 30 saniyelik video **1920×1080** hatasız tamamlandı;
sayfa yenilemesi yeni onay istemedi. Aynı Web oturum anahtarı, eski dört
operation ve config/index korundu; tek yeni cihaz kaydı, günlük tek deneme.
Kaynak/deploy değişmedi. Bu dar kabulde blocker yok; passkey, gerçek süre
yenileme ve pending ödeme/expired-device uzlaştırması bu kanıttan çıkarılmaz.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_PREFLIGHT` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LOCAL_RUNTIME_SETUP` — **PASS (yerel kapalı runtime / Chrome)**.
[Kapalı yerel kurulum](./near-auth-v1-device-recovery-local-runtime-setup.md):
Web localhost:3000 ve özel Bridge aynı sponsor/epoch/state ile açıldı.
Web/Bridge MPC, ticket, upload ve device izinleri false. Yeni Web session
secret yalnız bellekte; kullanıcı girişini tamamladı ve Chrome'da eski
Google `2944…324c` hesabı doğrulandı. Gerçek cihaz status **200 / enabled:false**,
aynı **UPLOAD_SETTLED** pointer ve doğru hesap eşleşti. 10 MPC kaydı,
config/index ve başlatılan Web session key korundu. Runtime metadata'da
yalnız Bridge adresi değişti. 12 dev-runtime testi, başlatıcı korumaları,
doküman/kapsam PASS. Yeni cihaz/key/onay/imza/ödeme/upload veya CI/deploy yok.
Bu gate'te blocker yok; gerçek cihaz/yenileme kabulü hâlâ UNPROVEN.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ACCEPTANCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ACCEPTANCE_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Cihaz kabul ön kontrolü](./near-auth-v1-device-recovery-acceptance-preflight.md):
26 Eylül 07:33 UTC final blok 270297245'te dağıtılmış Market code hash ve
aktivasyon export'u doğrulandı. Google/passkey adaylarının hakları geçerli,
her birinde 1 aktif cihaz / 2 boş yuva; kullanıcı ve sponsor NEAR kontrol
rezervleri yeterli. Aynı 10 yerel MPC kaydı korunmuş; dört işlem settled,
aktif kilit yok. Ancak Web/Bridge süreçleri ve portları kapalı, Chrome
ERR_CONNECTION_REFUSED gösteriyor. Güncel oturum/key eşleşmesi doğrulanamadı.
Config/özel anahtar/tarayıcı deposu değişmedi; imza/ödeme/login veya servis
başlatma yapılmadı. Yeni cihaz ve gerçek süre yenileme kabulü UNPROVEN;
servisler ve oturum doğrulanmadan canlı kabul NO-GO.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LOCAL_RUNTIME_SETUP` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_SOURCE` — **COMPLETED_WITH_WARNINGS (LOCAL_STATIC / LOCAL_TEST)**.
[Cihaz kurtarma kaynağı](./near-auth-v1-device-recovery-source.md): sosyal
oynatıcıda açık hazırlık/onay, ayrı `/api/auth/device`, dar private MPC
`device` amacı ve `DEVICE_SUBMITTED` / `DEVICE_SETTLED` bağlantısı tamamlandı.
Mevcut hakla tek doğrudan Market çağrısı; USDC yok, 1 yoctoNEAR + kullanıcı
NEAR gideri ve mevcut sponsor bütçesi. Web/Bridge cihaz izinleri ayrı ve
varsayılan kapalı. Üç slot final blok saatiyle kontrol edilir; doluysa yeni
cihaz durur. Zaten geçerli cihaz imza istemez; onay/devam eksik key üretmez.
Status/reload yalnız uzlaştırır; cihaz final kanıtı işlem bloğuna bağlıdır.
1038 Web, 529 Bridge ve 4 kontrat testi PASS; 3 isteğe bağlı Bridge testi
çalıştırılmadı. Tip/lint/ABI PASS. Pending ödeme + expired-device kilidi
korunur, tam kurtarılması ayrı açık sınırdır; ilk canlı kabul settled hesap
ve boş slotla hazırlanmalı. Gerçek tarayıcı/key/onay/ödeme, config/runtime,
provider veya CI/deploy işlemi yok. Kaynak tamamlandı, canlı kabul UNPROVEN.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ACCEPTANCE_PREFLIGHT` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_STORAGE_GUARD_SOURCE` — **PASS (LOCAL_STATIC / LOCAL_TEST)**.
`readValidDeviceSession` bozuk kaydı artık istenen `accountId` ile temizler;
mevcut hesap kapsamlı yardımcı kullanıldı. Bozuk proof başka hesabı gösterse
bile yalnız okunan hesap kaydı silinir. Yeni regresyon düzeltme öncesinde
diğer hesabın silinmesiyle başarısız oldu; düzeltme sonrasında aynı cihaz
anahtarı ve kayıtlı izleme konumu korundu. Eski ilerleme yazıcısının durması,
revision/bildirim ve mevcut expiry/yenileme kontrolleri korunuyor.
34 cihaz deposu testi ve toplam 1010 Web testi (50 dosya), auth/genel tip
kontrolleri ve iki dosyalık lint PASS. Yalnız cihaz deposu yardımcısı,
regresyon testi ve bu plan değişti. Canlı tarayıcı deposuna erişim, yeni
cihaz onayı/imza/ödeme, runtime/config değişikliği veya CI/deploy yapılmadı;
canlı kurtarma kabulü UNPROVEN. Bu kaynak gate'inde blocker yok; sosyal
UI/MPC recovery yolu ve pending ödeme/expiry uzlaştırması sonraki kapsamdır.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Cihaz kurtarma ön kontrolü](./near-auth-v1-device-recovery-preflight.md):
Market'te mevcut hakla 1 yoctoNEAR + gas karşılığı doğrudan aktivasyon var;
yeni USDC bilet gerekmez. Sosyal oynatıcı/özel MPC bağlantısı eksik; ticket
ön kontrolü recovery için kullanılamaz. Mevcut key/30 gün/üç cihaz ve tek
gönderim sınırlarıyla dar device purpose kapsamı belirlendi.
Öncelikli bulgu: bozuk tek cihaz kaydı okunurken global temizlik başka
hesabın key'ini de siliyor; izole testte üretildi. Önce bu temizleme hesapla
sınırlanacak. 55 Web + 4 kontrat ve 3 izole teşhis kontrolü PASS; yalnız
rapor/plan değişti, doküman/kapsam PASS. Canlı key/depo, imza/ödeme/cihaz
işlemi, runtime veya CI/deploy yok. Pending ödeme + süresi dolmuş cihaz
uzlaştırması ayrıca açık sınırdır.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_STORAGE_GUARD_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_LOCAL_RUNTIME_RECOVERY` — **PASS (yerel kapalı runtime)**.
[Bridge kurtarma kabulü](./near-auth-v1-local-runtime-recovery.md): yalnız
Bridge aynı config/key/epoch/storage ile kapalı modda başlatıldı. Web
69538/69539 ve oturum anahtarı aynı; registry üzerinden restart olmadan
yeniden bağlandı. Chrome'daki `2944…324c` hesabının status isteği 200 döndü;
hata uyarısı yerine kapalı ödeme açıklaması görüldü. Yeni session write yok.
10 MPC kaydı aynı: dört settled operation, iki pointer, nonce ve günlük
kayıtlar. Runtime metadata'sında yalnız Bridge adresi değişti; config ve
uygulama kaynağı korunuyor. Doküman/kapsam ve tekrar çalıştırılabilir koruma
kontrolü PASS. Yeni login/imza/ödeme/upload, Web restart, CI/deploy yok.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_PREFLIGHT` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_LOCAL_RUNTIME_RECOVERY_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Yerel runtime kurtarma ön kontrolü](./near-auth-v1-local-runtime-recovery-preflight.md):
Web çalışıyor; aynı registry'de Bridge kaydı ve eski port listener'ı yok.
Kapalı status isteğinin bozuk binding üzerinden 422'ye dönüşmesi dört izole
Web kontrolünde doğrulandı; 56 Bridge testi PASS. SQLite kopyası sağlam:
iki TICKET_SETTLED, iki UPLOAD_SETTLED, aktif kilit yok; nonce ve sayaçlar
korundu. Keychain metadata'sı mevcut, özel anahtar okunmadı.
Öneri mevcut config/storage/epoch ile yalnız Bridge'i kapalı başlatmak;
eski birleşik başlatıcı Web'i de açıp oturum anahtarını değiştirdiğinden
doğrudan kullanılmayacak. Kurulu registry watcher Web restart olmadan
yeniden keşfi destekler; gerçek hot reconnect/status kabulü henüz UNPROVEN.
Yalnız rapor/plan değişti; doküman/kapsam PASS. Servis start/stop, ayar/anahtar,
yeni giriş, imza/ödeme/upload ve CI/deploy yok.
**Tek sonraki gate: `NEAR_AUTH_V1_LOCAL_RUNTIME_RECOVERY` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_REDIRECT_TARGET_ACCEPTANCE` — **PASS (Chrome / Google / upload hedefi)**.
[Kontrollü hedef dönüşü](./near-auth-v1-redirect-target-acceptance.md): mevcut
`/upload?job=lp-fddf7a11-0dca-4705-ac0f-dedbcff308a4` sayfasından görünür
`Continue in this tab` ile aynı Chrome sekmesi Auth0'ya geçti. Kullanıcı eski
Google hesabıyla giriş yaptı; aynı sekmede tam başlangıç URL'si, doğru
`2944…324c` hesabı ve temiz callback query'si doğrulandı. Tek session POST 200;
reload aynı hesap/hedefi korudu ve yeni session write oluşturmadı.
Gönderimler kapalı, Bridge kapalı; sekiz config/kalıcı kayıt hash'i aynı.
Yalnız iki belge değişti; doküman/kapsam PASS. Ödeme-durumu 422 uyarısı ayrı
açık runtime konusudur. Provider ayarı/iletişim, imza/ödeme/upload, restart ve
CI/deploy yok. Passkey/watch/mobil/hosted çeşitleri bu sonuçtan çıkarılmaz.
**Tek sonraki gate: `NEAR_AUTH_V1_LOCAL_RUNTIME_RECOVERY_PREFLIGHT` — başlatılmadı.**

Önceki kesintili bölüm: `NEAR_AUTH_V1_REDIRECT_TARGET_ACCEPTANCE` — **COMPLETED_WITH_WARNINGS**.
[Chrome hesap/hedef kontrolü](./near-auth-v1-redirect-target-acceptance.md):
kullanıcının isteğiyle Chrome'a geçildi. İlk farklı hesap sonrasında kullanıcı
eski Google hesabıyla giriş yaptı; `2944…324c` ve tam `/upload?job=…` hedefi
reload öncesi/sonrası doğrulandı. Kontrol sırasında yeni login yok; session
POST sayısı üç olarak kaldı. Mevcut hedef passkey yüklemesinin URL'sidir;
Google hesabına iş sahipliği/ödeme kabulü değildir. Kesintiler ve kullanıcı
tarafından tamamlanan giriş nedeniyle provider → callback → hedef zinciri
ve tek callback write UNPROVEN kalır. Kaynak/kayıtlar korundu; yalnız rapor/
plan ve doküman kontrolü. **Tek sonraki gate: aynı
`NEAR_AUTH_V1_REDIRECT_TARGET_ACCEPTANCE` gate'inin kalan kontrollü kabulü.**

Önceki gate: `NEAR_AUTH_V1_PASSKEY_REDIRECT_ACCEPTANCE` — **COMPLETED_WITH_WARNINGS**.
[Passkey oturumu ve dönüş kontrolü](./near-auth-v1-passkey-redirect-acceptance.md):
kullanıcı passkey ile aynı sekmede gidip döndüğünü teyit etti. Mevcut
`9db6…d21a` hesabı ana sayfa, profil ve reload'da doğrulandı; kontrol sırasında
yeni login başlatılmadı. Tarayıcı bağlantı kesintileri nedeniyle provider →
callback → orijinal upload hedefi kesintisiz gözlenmedi. Başlangıç hedefi ve
tek callback write kabulü UNPROVEN; yalnız doğru oturum/reload doğrulandı.
Gönderimler kapalı; sekiz config/kalıcı Bridge kaydı aynı. Yalnız rapor/plan
değişti; doküman/kapsam PASS. Provider/config/iletişim, ödeme/upload, restart
ve CI/deploy yok. **Tek sonraki gate:
`NEAR_AUTH_V1_REDIRECT_TARGET_ACCEPTANCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_REDIRECT_ROOT_ACCEPTANCE` — **COMPLETED_WITH_WARNINGS**.
[Gerçek kök dönüş kabulü](./near-auth-v1-redirect-root-acceptance.md): kullanıcı
Google ile giriş yaptı; aynı ortak testnet client kök dönüşünü tamamladı ve
`/profile` üzerinde önceki `2944…324c` hesabı görüldü. Callback query'si temiz,
reload aynı hesabı korudu; sunucuda tek session POST 200, iki account POST 200.
Provider ayarı/iletişim gerekmedi. Başlangıçta takılmış Web sunucusu yalnız
kullanıcı onayıyla, aynı ortam ve oturum anahtarı korunarak yeniden başlatıldı.
Üç Web gönderim bayrağı false; üç Bridge bayrağı kayıtlı config'de false ve
Bridge süreci kapalı. Bridge başlatılmadı; sekiz config/kalıcı kayıt hash'i aynı.
Yalnız rapor/plan değişti; doküman/kapsam PASS. İmza/ödeme/upload, CI/deploy yok.
Passkey, diğer başlangıç hedefleri ve hosted kabulü bu sonuçtan çıkarılmaz.
**Tek sonraki gate: `NEAR_AUTH_V1_PASSKEY_REDIRECT_ACCEPTANCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_REDIRECT_ROOT_SOURCE` — **PASS (yerel kaynak kabulü)**.
[Kök callback kaynağı](./near-auth-v1-redirect-root-source.md): ürün redirect
URI'si origin oldu; kök OAuth yanıtı geçerli ürün/origin/Host koşuluyla mevcut
`/auth/callback` sayfasına aynı query ile aktarılır. Aktarım cache'e girmez,
referrer göndermez ve oturum yaratmaz. Mevcut SDK state/PKCE/nonce, sunucu
token doğrulaması, popup/lab ve güvenli son hedef davranışı korunur.
NextURL loopback normalizasyonu özgün Host kontrolüyle sınırlandı.
1009 Web testi, strict auth/tüm Web tip, scoped lint ve doküman/kapsam
kontrolleri PASS. İki kaynak, üç test ve iki belge değişti; provider/config,
gerçek login/ödeme/upload, browser E2E, runtime restart, CI/deploy yok.
Ortak client'ın kök callback izni ve gerçek Google/passkey dönüşü UNPROVEN.
**Tek sonraki gate: `NEAR_AUTH_V1_REDIRECT_ROOT_ACCEPTANCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_REDIRECT_COMPATIBILITY_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Site kökü uyumluluk ön kontrolü](./near-auth-v1-redirect-compatibility-preflight.md):
resmî örnekteki tek aday `http://localhost:3000`; ortak client izni henüz
kanıtlanmadı. Yalnız URI değiştirmek yetmiyor: kökte Provider son hedefe
gitmiyor, wallet/none tercihinde callback atlanıyor. Altı izole kontrol bu
sınırları ve kurulu SDK'nın aynı-origin aktarımda özgün redirect URI/PKCE
kaydını koruyabilmesini doğruladı. Öneri kök OAuth yanıtını mevcut
`/auth/callback` rotasına dar middleware aktarımıyla bağlamak; kaynak değişmedi.
137 mevcut test, auth tip ve doküman/kapsam kontrolleri PASS. Yalnız rapor/plan
değişti; gerçek login/authorize, provider/config/iletişim, ödeme/upload,
runtime restart ve CI/deploy yok. **Tek sonraki gate:
`NEAR_AUTH_V1_REDIRECT_ROOT_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_REDIRECT_PROVIDER_SETUP` — **BLOCKED: hedef client yönetim erişimi yok**.
[Provider kurulum kaydı](./near-auth-v1-redirect-provider-setup.md): mevcut
başlatıcıdaki client ID resmî ortak testnet istemcisiyle eşleşiyor. Kullanıcı
Brave'de Auth0 Dashboard'a giriş yaptı. Erişilebilir tek development tenant'ın
üç uygulaması hedef client ile eşleşmiyor; doğru client'ın callback listesi
okunamadı. Kendi uygulamasına callback eklemek mevcut ortak client'ı düzeltmez.
Yalnız kurulum kaydı ve bu plan değişti; doküman build/kapsam kontrolü PASS.
Provider/config, uygulama login/token, imza, ödeme/upload,
runtime restart, CI/deploy yok. Önceki kaynak düzeltmesi PASS kalır; gerçek
redirect kabulü ve çalışan ortamın altı kapalı gönderim bayrağı bu tur
doğrulanmadı. **Tek sonraki gate: yönetim erişimi sağlanınca aynı
`NEAR_AUTH_V1_REDIRECT_PROVIDER_SETUP` gate'ini sürdürmek.**

Önceki gate: `NEAR_AUTH_V1_REDIRECT_RETURN_PATH_SOURCE` — **PASS**.
Ürünün ürettiği `/upload?job=…` durum bağlantısı, yönlendirmeli girişte
`/profile` hedefine düşüyordu. Ortak `authReturnPath` kontrolü artık geçerli
`/upload?job=…` hedefini hem giriş başlangıcında hem callback dönüşünde korur.
Mevcut `/watch?job=…`, `/upload` ve `/profile` davranışı; iş kimliği sınırı,
kodlama ve dış/bozuk adresleri reddetme kuralları korunur. Auth0 callback
URI'si ve kimlik/oturum doğrulaması değişmedi.

**LOCAL_TEST:** önce yalnız upload dönüş senaryosu başarısız oldu; düzeltmeden
sonra 137 odaklı Web testi PASS. Test, girişte taşınan aynı `appState` ile
callback dönüşünü ve sabit `/auth/callback` adresini doğrular; Auth0 mock'tur.
**LOCAL_STATIC:** strict auth tip, değişen kaynakların lint, doküman build
ve diff kontrolleri PASS. Değişen dosyalar yalnız `near-auth-product.ts`,
`near-auth-lab.test.ts` ve bu plan; gate sıra özeti güncellendi.
**EXTERNAL_NOT_RUN:** gerçek login/redirect, provider/config, ödeme/upload,
runtime restart, CI/GitHub/deploy. Mevcut kullanıcı kayıtları değiştirilmedi.
Bu kaynak gate'inin blocker'ı yok; sağlayıcıdaki `Callback URL mismatch`
ayrı açık konudur. Güncel izin listesi, yönetim erişimi ve gerçek redirect
kabulü **UNPROVEN**; bu düzeltme sağlayıcı izninin yerine geçmez.
**Tek sonraki gate: `NEAR_AUTH_V1_REDIRECT_PROVIDER_SETUP` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_REDIRECT_CALLBACK_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Redirect callback ön kontrolü](./near-auth-v1-redirect-callback-preflight.md):
ürün redirect URI'si `http://localhost:3000/auth/callback`; kaynak rotası ve
PKCE/state/oturum guard'ları mevcut. Popup, kurulu SDK'da web_message/site
origin yolunu kullanıyor; başarısı tam callback URL izni sayılmaz. Kullanılan
client resmî ortak testnet client'ı. En küçük kalıcı düzeltme, yetkili yönetici
ile mevcut listeye yalnız exact callback URL'sini eklemek. Yönetim erişimi ve
canlı allowlist okunmadı; yeni client/tenant veya kod değişikliği önerilmedi.
126 odaklı Web testi ve strict auth tip PASS; yalnız rapor/plan değişti.
Provider ayarı, login, ödeme/upload, runtime veya deploy işlemi yok.
**Tek sonraki gate: `NEAR_AUTH_V1_REDIRECT_PROVIDER_SETUP` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_ACCEPTANCE` — **COMPLETED_WITH_WARNINGS**.
[Ürün upload kabulü](./near-auth-v1-upload-payment-acceptance.md): Google ve
passkey ile birer 0,60 test USDC upload; iki job Published/ACTIVE ve iki
operation UPLOAD_SETTLED. İki creator 720p oynatma/kullanıcı teyidi; Google
yeniden giriş, passkey reload ve 2:27'den devam geçti. Final 270080471'de
iki hesapta 1,40'ar USDC; iki outer gider toplamı 0,0092915044043981 test NEAR.
Delegated device null authorizing key uyumsuzluğu dar Bridge düzeltmesiyle
giderildi: 508 Bridge (3 skip), native upload 14 ve tip kontrolü PASS.
23/24 Eylül bütçe onayları ayrı alındı; iki yeni ödeme dışında tekrar yok.
Kapanışta altı gönderim bayrağı false, nonce/kayıtlar/local-v1 korundu;
kapalı gerçek Next → Bridge status kontrolü PASS. Hosted/CI/deploy yok.
Provider redirect fallback Callback URL mismatch hâlâ açık; ilk passkey
popup sorununun nedeni kanıtlanmadı. Kapanış restart'ı yeniden giriş gerektirebilir.
**Tek sonraki gate: `NEAR_AUTH_V1_REDIRECT_CALLBACK_PREFLIGHT` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_UPLOAD_LOCAL_ACCEPTANCE_SETUP` — **COMPLETED_WITH_WARNINGS**.
[Yerel upload kurulumu](./near-auth-v1-upload-local-acceptance-setup.md): açık
quote key/version 1 ile mevcut localhost Web + private Bridge kapalı modda
başlatıldı. Aynı sponsor/local-v1/storage; iki TICKET_SETTLED operation,
hash'ler, nonce ve günlük sayaçlar önce/sonra aynı. Gerçek Next → yerel Bridge
okuması PASS; altı gönderim bayrağı false. Quote gizli anahtarı gerekmedi.
Kullanıcı restart sonrası yeniden giriş yapmalı. Önceki doğrulanmış bakiyeler
2'şer test USDC; seçili Distance 9.452.298 bayt, ücret 0,60 test USDC/işlem.
Bugünün günlük 0,70 rezervi ve hesap başı 1 denemesi dolu; limit artırılmadı.
Ödeme/upload/Livepeer, hosted veya deploy yapılmadı.
**Tek sonraki gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_ACCEPTANCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_UPLOAD_QUOTE_VERIFICATION_SOURCE` — **PASS**.
[Açık anahtarla teklif doğrulama](./near-auth-v1-upload-quote-verification-source.md):
ortak Bridge doğrulayıcısına public-key yolu eklendi; yanlış/bozuk public key'de
private key'e fallback yok, quote üretimi açılmıyor. Final 269894259'da mevcut
Market state'i ve bağımsız version/governance view'larıyla bootstrap public
key / version 1 bağı doğrulandı. Yerel MPC için quote gizli anahtarı gerekmiyor.
145 odaklı / 505 tam Bridge (3 skip), Bridge tip, native upload 14 / ticket 12
kontrol ve doküman build PASS. Runtime config/restart, fonlama,
quote/imza/ödeme/upload ve deploy yok.
**Tek sonraki gate: `NEAR_AUTH_V1_UPLOAD_LOCAL_ACCEPTANCE_SETUP` — bu turda sürdürülmedi.**

Önceki gate: `NEAR_AUTH_V1_UPLOAD_LOCAL_ACCEPTANCE_SETUP` — **BLOCKED**.
[Yerel upload kurulum kaydı](./near-auth-v1-upload-local-acceptance-setup.md):
kullanıcının manuel fonlaması sonrası final 269892479'da Google ve passkey
hesapları **2'şer test USDC**; fon açığı kapandı. Seçilen Distance MP4
9.452.298 bayt / 236,495238 saniye; kaynak formülünde upload 0,60 test USDC.
Kapalı kurulum paketi hazır, etkinleştirilmedi. Mevcut kod quote doğrulamak
için özel anahtar istiyor; kullanıcı yerel konumunu bilmiyor. Bootstrap
politikasında açık anahtar adayı bulundu; güncel zincir bağı henüz doğrulanmadı.
Kod/config/anahtar, sunucu, sayaçlar ve işlem kayıtları değiştirilmedi;
quote, imza, ödeme/upload ve deploy yok. Önce yalnız açık anahtarla doğrulama
kaynağı tamamlanacak, ardından aynı setup gate'ine dönülecek.
**Tek sonraki gate: `NEAR_AUTH_V1_UPLOAD_QUOTE_VERIFICATION_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_ACCEPTANCE_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Ürün yükleme kabul ön kontrolü](./near-auth-v1-upload-payment-acceptance-preflight.md):
final 269890707, protokol 87; mevcut Google/passkey adaylarında USDC 0,
storage ve FullAccess hazır. İki kısa upload için toplam 1,20 test USDC açığı
var. Sponsor kullanılabilir 0,7888978083669574 test NEAR; Bridge health ready,
fakat gerçek upload kanıtı değil. Yerel ticket başlatıcısında upload bayrakları
ve quote anahtarı bağlantısı eksik; güvenli matching anahtar kaynağı belirsiz.
Önceki iki biletin 0,70 günlük rezervi yeni upload yetkisi değil; sayaçlar
silinmeden yeni UTC günü veya ayrı onaylı limit kararı gerekir. Dosya seçilmedi.
Yalnız rapor/plan değişti; restart, secret/config, fonlama, quote/imza/ödeme/
upload ve deploy yok. Güncel runtime sayaç/oturumu ayrıca doğrulanacak.
**Tek sonraki gate: `NEAR_AUTH_V1_UPLOAD_LOCAL_ACCEPTANCE_SETUP` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_SOURCE` — **COMPLETED_WITH_WARNINGS**.
[Ürün yükleme ödeme kaynağı](./near-auth-v1-upload-payment-source.md): mevcut
form/relay, ürün Google/passkey onayı ve özel MPC göndericisine bağlandı.
Upload gönderimi ayrı varsayılan-kapalı izinlerle korunur; teklif imzası MPC
harcamasından önce doğrulanır. 85/87 legacy delegate, kalıcı imza recovery ve
final job/cihaz kanıtıyla `UPLOAD_SETTLED` eklendi. Eski/belirsiz kayıt yeni
ödeme veya yeni provider upload'ıyla aşılmaz; ilk medya isteği ayrıca izlenir.
972 Web (son odaklı uploader 113), 489 Bridge (3 skip), native upload 13 /
ticket 12, izole Brave 29 kontrol; tip/lint, izole Web flag off/on derleme
ve doküman build PASS. Bunlar yerel/sentetik kanıttır; gerçek imza, ödeme,
yükleme, config/secret, CI/deploy veya GitHub gönderimi yapılmadı.
**Tek sonraki gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_ACCEPTANCE_PREFLIGHT` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Ürün yükleme ödeme ön kontrolü](./near-auth-v1-upload-payment-preflight.md):
mevcut form/delegate/relay yolu korunacak; ürün session/private MPC bağlama,
kalıcı imzadan toparlanma ve zincirde job doğrulayan terminal kilit adımı eksik.
Taze final blok 269886740 protokol 87; kaynak upload'ı Web ve Bridge'de hâlâ
85'e sınırlıyor. Kullanılan legacy Delegate, kaldırılan DelegateV2 değil;
bu kaynak ayrımı gerçek protokol 87 upload kabulü sayılmaz.
241 odaklı Web ve 35 Bridge testi, auth tip ve doküman build PASS
(mevcut bundle uyarısı). Yalnız rapor/plan değişti;
yeni quote, imza, ödeme, upload, config, CI veya deploy yok.
**Tek sonraki gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_TICKET_PAYMENT_ACCEPTANCE` — **COMPLETED_WITH_WARNINGS**.
[Ürün bilet kabulü](./near-auth-v1-ticket-payment-acceptance.md): passkey
`9db6…d21a` ve Google `2944…324c` ana uygulamada Player V2 1080 landscape için
ayrı ayrı 2 test USDC bilet aldı. İki işlem TICKET_SETTLED/FINAL; doğru alıcı
hakkı, cihaz, 1080p ses/görüntü kullanıcı onayı ve reload sonrası erişim geçti.
MPC sponsoru otomatikti; sponsor cüzdanı seçilmedi. Kapanışta dört gönderim
bayrağı false; iki kalıcı kayıt/hak ve key/epoch korundu.
Testnet gate sırasında 85'ten 87'ye geçti. Config/release incelemesiyle yalnız
ticket yoluna 87 desteği eklendi; limitler aynı, upload/demo hâlâ 85'e bağlı.
936 Web, 471 Bridge (3 skip), 12 native runtime, tip/lint PASS. İki dış işlemde
ölçülen sponsor bakiye farkı toplam 0,0092821916330426 test NEAR; 0,70 rezerv
tavanı gerçek gider değildir. Eski Google hesabı bulunamadığından seçilen
2944 hesabına kullanıcı onayıyla ek 0,03 test NEAR + 2 test USDC fonlandı.
Hosted/CI/deploy/GitHub yayını yok; kapatma restart'ı yeniden giriş gerektirir.
**Tek sonraki gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_PREFLIGHT` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_TICKET_LOCAL_ACCEPTANCE_SETUP` — **COMPLETED_WITH_WARNINGS**.
[Yerel kabul kurulumu](./near-auth-v1-ticket-local-acceptance-setup.md): kullanıcı
onayıyla Anahtar Zinciri'nde ayrı sponsor key ve özel yerel Bridge bağlantısı
hazırlandı; 3000 ürün sunucusu yeniden başlatıldı. Meteor alt hesap AddKey
paketini engelledi; ikinci açık onayla aynı key'in standart implicit adresine
tek Transfer kullanıldı. Eski engellenen işlem kaydı korunur.
Üç kullanıcı imzalı fonlama FINAL: sponsor **0,80 test NEAR**, Google ve passkey
alıcıları **2'şer test USDC**. Sponsor key/bakiye ve uygun başka-creator yayınlar
zincirde kontrol edildi. Gerçek Next → yerel Bridge çağrısı PASS. Dört ödeme
bayrağı false; hiçbir bilet alınmadı. Google/passkey için yeniden giriş gerekir.
34 odaklı / 470 tam Bridge testi (3 skip), 12 dev-runtime, 12 native runtime,
Bridge tip ve Web lint PASS. Hosted/CI/deploy veya GitHub yayını yapılmadı.
**Tek sonraki gate: `NEAR_AUTH_V1_TICKET_PAYMENT_ACCEPTANCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_TICKET_RUNTIME_SOURCE` — **COMPLETED_WITH_WARNINGS**.
[Yerel runtime kaynağı](./near-auth-v1-ticket-runtime-source.md): gerçek ürün
ticket API'si + kurulu OpenNext başlatıcısı + native Worker named RPC + mevcut
SQLite DO yolu için izole runner eklendi. **12 kontrol PASS; 1 dış / 1 iç gönderim**.
Kayıp cevaplar ve runtime restart'larında aynı hash/kayıt korundu; kapalı status,
entitlement/cihaz doğrulaması ve public HTTP reddi geçti. Dış provider/chain
sentetik; tam Next HTTP sunucusu veya gerçek satın alma kabulü değildir.
OpenNext'in mevcut env aktarımı mevcut compatibility tarihiyle çalıştı;
uygulama kodu, bağımlılıklar, kalıcı ayarlar ve 3000 sunucusu değişmedi.
**Tek sonraki gate: `NEAR_AUTH_V1_TICKET_LOCAL_ACCEPTANCE_SETUP` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_TICKET_PAYMENT_ACCEPTANCE_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Bilet kabul ön kontrolü](./near-auth-v1-ticket-payment-acceptance-preflight.md):
ilk gerçek kabul için mevcut localhost ürün akışı + aynı Bridge'in yerel
Worker örneği önerildi. Önce gerçek Worker RPC/DO bağlantısı ve restart
kalıcılığı sentetik olarak kanıtlanacak; mevcut 3000 oturumu değiştirilmedi.
İki bağımsız kimlik için öneri: birer 2 test USDC bilet, toplam 0,70 test NEAR
MPC rezervi, hesap başına bir deneme/gün; rakamlar harcama onayı veya maliyet değil.
Uygun alıcı/yayın çiftleri taze hak/bakiye kontrolüyle seçilmeli; Distance'a
zaten hakkı olan kullanıcı tekrar satın almayacak. Hosted release şeması,
service binding, Web secret aktarımı ve process.env uyumu ayrı açık eksikler;
yerel testin önkoşulu olarak tüm yayın hattı genişletilmiyor.
Yalnız rapor/plan değişti; canlı ayar, anahtar, fonlama, ödeme ve deploy yok.
**Tek sonraki gate: `NEAR_AUTH_V1_TICKET_RUNTIME_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_TICKET_PAYMENT_SOURCE` — **COMPLETED_WITH_WARNINGS**.
[Ürün bilet kaynağı](./near-auth-v1-ticket-payment-source.md): mevcut ürün
Google/passkey onayı → private MPC → kalıcı iç bilet hash/gönderim → kesinleşmiş
ödeme, hak ve cihaz doğrulaması → Watch hak yenilemesi bağlandı. Kullanıcıya
Meteor sponsoru seçtirilmez. Timeout/restart veya yalnız MPC imzası yeni ödeme
ya da başarı sayılmaz. Sayfa açılışı/status salt-okunur; terminal bilet durumu
kullanıcı kilidini çözer. UI yolu eklendi, gönderim varsayılanları kapalı.
Web **929 PASS**, Bridge tam paket **465 PASS / 3 skip**, son odaklı **33 PASS**,
izole sentetik Brave **27 PASS**, tip/lint, flag off/on ayrı Web build ve
Bridge dry-run PASS. Gerçek binding, fonlama, ödeme ve deploy yapılmadı.
İlk hesap fonlama, upload ürünü ve kart V1 hedefi ayrı açık işlerdir.
**Tek sonraki gate: `NEAR_AUTH_V1_TICKET_PAYMENT_ACCEPTANCE_PREFLIGHT` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_MPC_SPONSOR_SOURCE` — **COMPLETED_WITH_WARNINGS**.
[Sınırlı MPC gönderici kaynağı](./near-auth-v1-mpc-sponsor-source.md): mevcut
Bridge'e private named entrypoint ve ayrı DO nonce/bütçe/tek-gönderim kaydı
eklendi. Web ürün oturumu, mevcut fiyat/teklif incelemesi ve exact Auth0 onayıyla
çağırır; lab review/client ürün alanına düşmez. Timeout/restart sonrası yeni
ödeme yerine aynı hash okunur; raw JWT/private key kalıcı kayda yazılmaz.
Geçmiş MPC sonucu onay süresi dolsa da doğrulanabilir; kullanıcı ekonomik kilidi
iç bilet/job kesinleşmesine kadar tutulur. UI ve gönderim varsayılanları kapalı.
Web **919 PASS**, Bridge tam paket **457 PASS / 3 skip**, son focused **22 PASS**;
tip/lint ve Worker dry-run PASS. Canlı binding/anahtar/fonlama/deploy yapılmadı.
256 kayıt/DO kapasitesi, epoch taşıması ve iç ödeme entegrasyonu açık sınırlardır.
**Tek sonraki gate: `NEAR_AUTH_V1_TICKET_PAYMENT_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_PAYMENT_FLOW_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Ödeme ön kontrolü](./near-auth-v1-payment-flow-preflight.md): mevcut USDC
bilet/upload yolları korunacak; kullanıcıya seçtirilen MPC sponsoru, mevcut
Bridge içinde private named service girişine taşınacak. Mevcut DO nonce/kayıt
deseni kullanılır; genel public signer veya yeni mikroservis önerilmez.
Web kimlik/onay doğrulaması ile Bridge hedef/bütçe/tek gönderim sınırları ayrı.
0,35 NEAR dış istek ve 0,12 NEAR alıcı değerleri bütçe tavanıdır; 0,10 USDC
upload relay kalemi MPC gideri sayılmaz. Yeni hesap fonlaması ve kart V1
hedefi ayrıca açık; Production fiyatı/harcama limiti onaysız belirlenmedi.
Kod, canlı ayarlar, ödeme ve deploy değişmedi.
**Tek sonraki gate: `NEAR_AUTH_V1_MPC_SPONSOR_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_SESSION_UI_ACCEPTANCE` — **COMPLETED_WITH_WARNINGS**.
[Ana uygulama oturum kabulü](./near-auth-v1-session-ui-acceptance.md): kullanıcı
onayıyla aynı localhost:3000 ürün modunda açıldı. Gerçek Google ve passkey
profilleri/menüleri, reload ve soteri wallet'a dönüş doğrulandı. Mevcut Distance
hakkı aynı cihazla ana uygulamada 720p oynadı. NEAR Auth için yeni upload,
bilet ve çekim düğmeleri kapalı kaldı; ödeme başlatılmadı.
Canlıda bulunan Next boş-POST stream reddi, mevcut lab kontrolüyle düzeltildi;
**915 Web testi, auth tip kontrolü, lint ve doküman kontrolü PASS**.
Geçici yerel ürün modu açık; kalıcı env, provider, CI/deploy ve GitHub değişmedi.
Tam redirect callback/provider allowlist, hosted ortam ve ekonomik işlem
kabulü açık sınırlar olarak korunur.
**Tek sonraki öneri: `NEAR_AUTH_V1_PAYMENT_FLOW_PREFLIGHT` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_SESSION_UI_SOURCE` — **COMPLETED_WITH_WARNINGS**.
[Ana uygulama oturum kaynağı](./near-auth-v1-session-ui-source.md): mevcut
WalletProvider içinde tek aktif kimlik, Google/passkey veya wallet seçimi,
ayrı ürün session/account/callback API'leri ve profil/reload bağlandı.
Varsayılan kapalı; ürün modu yalnız public-testnet ve lab kapalıyken uygundur.
Sponsor wallet olayları NEAR Auth kimliğini değiştirmez; yeni yöntemle ödeme /
çekim yanlış cüzdana düşmez. Diğer hesapların cihazları ve taslaklar korunur.
**909 Web testi, 25 UX, 16 playback, tip/lint ve kapalı/açık izole build PASS**.
Gerçek provider/config, kullanıcı işlemi, CI/deploy ve GitHub yayını yapılmadı.
**Tek sonraki gate: `NEAR_AUTH_V1_SESSION_UI_ACCEPTANCE` — başlatılmadı.**
Önce origin/client/callback ayarlarının onaylı hazırlığı, sonra ana UI gerçek
kabulü gerekir. Bu kaynak sonucu üretim veya ödeme entegrasyonu kabulü değildir.

Önceki gate: `NEAR_AUTH_V1_PRODUCT_FLOW_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Ana uygulama akışı ön kontrolü](./near-auth-v1-product-flow-preflight.md): mevcut
Navbar/WalletProvider ve upload/watch/profile bileşenleri yeniden kullanılacak;
tek aktif kimlik, bağımsız cüzdan veya NEAR Auth seçimi olacak. İlk kaynak
adımı yalnız giriş/oturum/hesap okuma entegrasyonu; ekonomik işlem taşıması
ayrı kalacak. Mevcut upload adaptörü genel cüzdan değildir, sponsor hesabı
kullanıcı kimliği yerine geçemez. Lab/localhost koşulları gevşetilmez.
Kullanıcıya sponsor seçtirmeyen dış MPC göndericisi ve doğrudan kart sipariş
hakkı henüz yok; kart V1 hedefi korunur. Bayrak, kaynak, provider/config,
CI/deploy ve GitHub yayını bu ön kontrolde değişmedi.
**Tek sonraki gate: `NEAR_AUTH_V1_SESSION_UI_SOURCE` — başlatılmadı.**

Önceki gate: `NEAR_AUTH_V1_PASSKEY_ACCEPTANCE` — **COMPLETED_WITH_WARNINGS / creator ve buyer doğrulandı**.
[Passkey kabul kaydı](./near-auth-v1-passkey-acceptance.md): bağımsız
`9db6cb…59d21a` kimliğiyle yükleme/yayın/creator izleme sonrasında Distance
bileti **2 test USDC** ile alındı. Final **269763820**: hak true, USDC 0.
Kullanıcı kimlik onayını **passkey ile verdiğini** ve videonun sorunsuz
oynadığını teyit etti. Gerçek **720p**, reload sonrası hak/oturum ve
**0:46'dan devam etme** doğrulandı. Kod veya eski deneme kaydı değişmedi.
Tam işlem/sponsor makbuzları, ayrı logout/login, ikinci cihaz ve Production
kabulü bu sonuçtan ayrıdır. Ana uygulamadaki giriş yöntemi henüz bu lab
kabulüyle otomatik değişmiş değildir.
Tek sonraki öneri: `NEAR_AUTH_V1_PRODUCT_FLOW_PREFLIGHT` — başlatılmadı;
üç giriş yolunu ana uygulamaya taşımanın en küçük kapsamını belirlemek.

Önceki gate: `NEAR_AUTH_V1_FLOW_ACCEPTANCE` — **COMPLETED_WITH_WARNINGS**.
[Gerçek Google alıcı kabulü](./near-auth-v1-flow-acceptance.md): ayrı
`38aa11…2902d` hesabında Distance hakkı **false → true**, USDC **2 → 0**
(final **269742997**); gerçek **720p** oynatma ve reload sonrası hak/oynatma
korundu; kullanıcı görüntü ve sesin düzgün olduğunu teyit etti. İlk sekmede hata görüldü; aynı profil/cihazdaki yeni sekme
başarılı oldu. İlk hatanın kök nedeni ve tam işlem/sponsor makbuzları açık.
Kullanıcının açık talimatıyla bağımsız 1-yocto self-transfer demo kaydı bilet
kontrolünden ayrıldı; eski kayıt okunmadı/silinmedi. Bilet tekrar ödeme ve
sunucu nonce/hak kontrolleri korunuyor. **882 test, 20 yerel UX, tip/lint PASS**.
Bu değişiklik üç kaynak/test dosyasıyla sınırlı; yeni servis veya hesap bağlama yok.
Bağımsız passkey akışı, Production ve ikinci cihaz için kabul verilmedi.
Tek sonraki gate: `NEAR_AUTH_V1_PASSKEY_ACCEPTANCE` — başlatılmadı.

Önceki kaynak gate'i: `NEAR_AUTH_V1_FLOW_SOURCE` — **COMPLETED_WITH_WARNINGS**.
[V1 akış raporundaki kaynak kapanışı](./near-auth-v1-flow-acceptance.md)
aynı geçerli cihazla tekrar işlemi, bilet başına güvenli deneme kaydını ve hak
sahibi buyer playback'i yerelde doğruladı. **868 Web testi, 16 playback ve
18 UX senaryosu**, tip/lint ve izole Web build geçti. Build uyarıları ve eksik
gerçek Google/passkey satın alma/izleme kabulü açık; canlı PASS iddiası yoktur.
Yeni ödeme, upload, provider işlemi veya Git yayını yapılmadı.

Önceki plan gate'i: `NEAR_AUTH_V1_SCOPE_SIMPLIFICATION` — **PASS / kapsam güncellendi**.
Kullanıcı kararıyla hesap/kimlik bağlama V1'den çıkarıldı ve V2'ye ertelendi.
V1'de cüzdan, Google ve passkey bağımsız giriş seçenekleridir; her biriyle
imza, yükleme, satın alma ve yetkili izleme hedefi korunur. Bağlama eksikliği
V1 engeli değildir. Bu belge değişikliği yeni canlı kabul kanıtı üretmez.

Önceki gate: `NEAR_AUTH_CARD_IDENTITY_COST_PREFLIGHT` — **COMPLETED_WITH_WARNINGS**.
[Kart, kimlik ve maliyet ön kontrolü](./near-auth-card-identity-cost-preflight.md)
tamamlandı. Nuvei/Reach/Zotlo'nun belgelenmiş kapsamı ve açık ücretler incelendi;
YouTick'e özel kabul, üretici payout kapsamı ve NEAR Auth üretim teyidi yok.
Mainnet/testnet ücret parametreleri okundu; yeni kart/cihaz kodu ölçülmedi.
Önceki ürün planı kaydı korunur. Bu kapanış uygulama veya canlı ödeme kabulü değildir.

Son canlı kabul: `NEAR_AUTH_CREATOR_PLAYBACK_RELOAD_ACCEPTANCE` — **PASS**.
[Gerçek creator playback ve reload kabulü](./near-auth-creator-playback-reload-acceptance.md).
Mevcut Distance yayını aynı Google hesabı/Brave İş profilinde gerçek HLS ile
**720p** oynadı; **360p/720p** seçenekleri görüldü. Bir sayfa yenilemesi
sonrası Google oturumu, yayın hakkı ve **3:13'ten devam** seçeneği geri geldi;
sonrasında first-frame/oynatma ölçümleri başarılı. Kullanıcı videonun her
şeyiyle iyi çalıştığını bildirdi. Final blok **269646064**: creator eşleşmesi,
ACTIVE generation 1 ve entitlement doğrulandı. Yeni ödeme, cüzdan/MPC işlem
imzası, upload veya cihaz kaydı yapılmadı.

Bu kabul localhost Google lab + gerçek testnet servisleri içindir; Production,
buyer, ikinci cihaz, mobil/Safari veya uzun süreli token yenileme kabulü değildir.
Önceki [publication sorgusu kaynak düzeltmesi](./near-auth-publication-polling-race-source.md)
856 yerel testle tamamlandı; eski 409 alt nedeni hâlâ kesinleşmedi.

Önceki [hesap hazırlama](./near-auth-fresh-account-provisioning.md) kontrolünde
0,1 test NEAR ve FullAccess doğrulanmıştı. Planlanan ayrı USDC ön kontrolü
bu konuşmada yürütülmeden kullanıcı fonlama/upload yaptı; bu eski plan satırı
otomatik PASS sayılmaz. Tek tek fonlama/MPC/relay makbuzları doğrulanmadı.

Eski `NEAR_AUTH_UPLOAD_ATTEMPT_RECONCILIATION` BLOCKED olarak ayrı korunur.
[Eski deneme raporundaki](./near-auth-upload-attempt-reconciliation.md)
halka açık adayın MPC imzası doğrulanmış, job/yayın kaydı null bulunmuştu;
son hata alınan denemeyle kullanıcı/yerel kayıt eşleşmesi tamamlanmadı.
Yeni hesap denemesi eski kaydı silme, eski delegate'i gönderme veya eski
ödemenin sonucunu varsayma yetkisi değildir.

Önceki `NEAR_AUTH_REVIEW_FINDINGS_SOURCE` **COMPLETED_WITH_WARNINGS** ile
kapandı. Beş öncelikli bulgu kaynak/plan düzeyinde giderildi; canlı kabul verilmedi.
Önceki kaynak gate’inde kullanıcı, sonraki gate'ten önce mimari incelemenin öncelikli bulgularının
kapatılmasını istedi. O gate yalnız kaynak, ilgili testler ve bu planı kapsadı.
Ana ajan tek yazardır; üç salt-okunur alt ajan kayıt korumasını, protokol
uyumunu ve plan tutarlılığını inceledi. Provider/config, canlı veri, tarayıcı/cüzdan kayıtları,
bağımlılıklar, yayın ayarları ve Git index kapsam dışıdır.

**Karar:** mevcut Auth0 SPA + jose + NEAR v7 ile kontrollü pilota devam et.
İmza, ödeme ve medya otoriteleri ayrı kalır. Compact mesaj kaynakta uygulanmış,
süre/blok kontrolleri tamamlanmıştır. Önceki araştırma bölümlerindeki
"uygulanmadı", "son süre kontrolü eksik" ve 32.768 karakter token sınırı
ifadeleri tarihsel durumu anlatır. Ortak imza doğrulayıcısı bugün tokena
**7.168 bayt** sınırı uygular; API toplam gövde sınırı ayrı bir kontroldür.

Eski Google upload denemesinin kaydı: Google ve Meteor onayları sonrasında imza
tamamlandı; kurtarma kaydı kontrolünde hata oluştu. Taslağın neden okunamadığı
hâlâ kanıtlanmadı. Bulunan adayın sponsor imzası doğrulandı; son denemeye
bağı için kullanıcı teyidi ve yerel kayıt eşleşmesi henüz yok.
[Önceki taslak kontrolleri](./near-auth-upload-draft-guards.md) yerel kaynak
kabulüdür; bu hata için kök neden veya canlı ödeme sonucu kanıtı değildir.

Önceki kaynak gate’inin kabul ölçütleri (yerelde tamamlandı):

- Güncel karar ve sıra tablosu aynı gate'i göstermeli; kapanmış süre/blok ve
  compact kaynak bulguları açık hata olarak sunulmamalı.
- Bekleyen Google denemesi yeni anahtar yazımı ve quote öncesinde durmalı;
  bozuk/süresi geçmiş kayıt korunmalı. Mevcut ücretli job uzlaştırması ve normal
  cüzdanın açık anahtar yenileme yolu çalışmalı.
- Web/Bridge ve Market aynı ham başlık kabul kuralını kullanmalı; imzalı
  başlık/proof baytları değişmemeli. Yeni kullanıcı girdisinin mevcut trim
  adımı korunur; U+FEFF bu adımda temizlenebilir, ham decoder'da içerik sayılır.
- Son gönderim süre testleri hem tek başına hem ilgili dosyayla geçmeli.
  Web/Bridge/Market testleri, tip/lint ve doküman kontrolü ayrı kaydedilmeli.

**Tek sonraki gate:** `NEAR_AUTH_V1_FLOW_ACCEPTANCE`.
Kaynak engelleri giderildi; üç bağımsız giriş yolunun eksik gerçek kabul
adımları mevcut kanıtlar korunarak hazırlanacak. Hesap bağlama eklenmez;
belirsiz ödeme kayıtları ve mevcut güvenlik kontrolleri korunur. Üretim ve
kart işleri ayrı kalır; bu kapanış canlı işlem başlatmaz.
Eski başarısız denemenin uzlaştırması ayrı açık kalır.

## V1 kapsamı — bağımsız giriş seçenekleri

Bu gate yalnız bu planı ve `near-auth-card-identity-cost-preflight.md` belgesini
değiştirir. Kabul: hesap bağlama hiçbir V1 koşulu, maliyeti veya sonraki adımı
olmamalı; üç giriş yolunun kullanım hedefi korunmalı; doküman derlemesi geçmeli.
Uygulama kodu, provider ayarları, hesaplar ve tarayıcı/cüzdan kayıtları değişmez.

| Seçilen giriş | V1 kullanım hedefi |
| --- | --- |
| Mevcut NEAR cüzdanını bağla | Kendi cüzdan hesabıyla imzala, video yükle, bilet satın al ve izle. |
| Google ile giriş | Google kimliğinin NEAR hesabıyla imzala, video yükle, bilet satın al ve izle. |
| Passkey ile giriş | Passkey kimliğinin NEAR hesabıyla imzala, video yükle, bilet satın al ve izle; Google ile önceden giriş şart değildir. |

Kullanıcı her yöntemi bağımsız kullanabilir. Aynı yönteme tekrar giriş kendi
hesabına dönmelidir; farklı giriş kimlikleri arasındaki hesap, bakiye ve haklar
otomatik birleştirilmez veya taşınmaz. Arayüz seçilen hesabı açıkça gösterir.
Cüzdan bağlama ile giriş korunur; Google/passkey/cüzdan kimliklerini birbirine
bağlama, zorunlu ikinci giriş yöntemi ve yöntemler arası kurtarma V2 konusudur.
V1'de sağlayıcının mevcut giriş/kurtarma imkanları kullanılır; yeni birleştirme
veya kurtarma altyapısı kurulmaz. İşlem onayı, mevcut cihaz yetkisi ve ödeme
uzlaştırması kontrolleri korunur.

`NEAR_AUTH_PASSKEY_TEST_PLAN` ve bağlama amaçlı
`NEAR_AUTH_PASSKEY_TEST_PREFLIGHT` aktif V1 sırasından çıkarıldı. Son ön kontrolde
gerçek hosted ekranda Google/passkey giriş seçenekleri görüldü; kullanıcı ayrı
Google test hesabıyla girdi ve başlangıç anahtarı kontrol edildi. Hesap bağlama,
passkey kaydı, imza veya ödeme yapılmadı. Kullanıcı Google/passkey giriş ve
imzaların çalıştığını bildirdi; bu belge değişikliği ayrı bir upload/purchase
kabulü olarak sayılmaz. Mevcut kanıtlar korunur, eksik akış kabulü V1 hedefidir.

## Ürün kimliği, doğrudan kart ve finansman kararları — 22 Eylül 2026

Gate: `NEAR_AUTH_PRODUCT_IDENTITY_FUNDING_PLAN`.
Amaç: konuşmada netleştirilen ürün yönünü maliyet tablosunu beklemeden plana
kaydetmek. Değişiklik kapsamı yalnız bu belge; uygulama, kontratlar, testler,
bağımlılıklar, canlı ayarlar, hesaplar, bakiyeler ve Git index kapsam dışıdır.
Ana ajan tek yazardır. Kabul: aşağıdaki kararlar ve açık noktalar ayrı olmalı,
güncel durum ile sıra tablosu aynı sonraki gate'i göstermeli; doküman derlemesi
geçmelidir. Karar kaydı özelliklerin uygulanmış olduğu anlamına gelmez.

### Ürün yönü

| Konu | Plana alınan yön |
| --- | --- |
| Giriş | Google, passkey ve desteklenen mevcut NEAR cüzdanları birlikte sunulur; Google zorunlu değildir. |
| Hesap kapsamı | Her giriş kimliği kendi hesabını kullanır. Aynı kimlikle tekrar girişte hesap korunur; farklı kimlikler ve hakları V1'de birleştirilmez. |
| Doğrudan kart | Kullanıcı bilet siparişini kartla öder; öncesinde kripto veya USDC satın alması zorunlu değildir. |
| Kripto ödeme | USDC hesaplaşma varlığı kalır. Desteklenen NEAR, USDT ve diğer varlıklardan doğrulanmış dönüşüm, ardından mevcut kullanıcı hesabından Market ödemesi hedeflenir. |
| Kazanç | Kart satış geliri ve üretici ödemesi para birimiyle izlenir; kripto satış kazancı USDC olarak kalır. Kart tahsilatı USDC creator bakiyesine yazılmaz. |
| Erişim | Seçilen NEAR hesabının kart ve kripto hakları aynı kütüphanede gösterilir; farklı giriş hesapları birleştirilmez. Medya Livepeer'da kalır. |
| Ağ gideri | Sınırlı bütçeli arka plan göndericisi NEAR giderini öder; kullanıcı ayrı sponsor cüzdanı seçmez. |
| Giderin karşılanması | Normal giderler alım öncesinde açıklanan toplam satış fiyatına dahil edilir; kesin komisyon, fiyat ve limitler maliyet doğrulamasından sonra belirlenir. |
| Dış sponsorluk | Hibe/kredi ek destek olarak değerlendirilir; ürünün çalışması ücretsiz fon bulunmasına bağlı kurulmaz. |

USDC'yi tüm satışların tek para hesabı yapma önerisi doğrudan kart kararıyla
daraltılmıştır: USDC kripto satışların hesaplaşma varlığıdır. Kart parası için
ayrı para muhasebesi gerekir. Sağlayıcı, MoR modeli veya yeni cüzdan hizmeti
seçilmiş değildir; mevcut Auth0 SPA + jose + NEAR v7 pilotu korunur.

### Kart siparişi ve doğru kullanıcıya zincirde hak

1. Doğrulanmış oturumdan kullanıcı hesabı belirlenir. Sunucuda sipariş,
   hesap, video, fiyat ve para birimi bağlanır; ödeme sürerken hesap değişimi
   siparişin alıcısını değiştirmez. E-posta veya istemcinin gönderdiği adres
   tek başına sahiplik otoritesi değildir.
2. Kullanıcı kart sağlayıcısında öder. Sunucu doğrulanmış sağlayıcı bildirimi
   ve tahsilat durumunu kalıcı sipariş kaydıyla uzlaştırır; başarı sayfası
   veya yalnız kart provizyonu hak oluşturmaz.
3. Sınırlı yetkili kart kayıt servisi, önerilecek kontrat yolundan siparişe
   bağlı hakkı doğru NEAR hesabına bir kez kaydeder. Sipariş özeti ağ,
   kontrat, kullanıcı ve video ile bağlıdır; aynı sipariş başka kullanıcıya
   veya başka ağa yeniden uygulanamaz. Kart ve kişisel veri zincire yazılmaz.
4. Kesinleşmiş zincir hakkı ve geçerli cihaz yetkisi doğrulanınca video açılır.
   Zincir işlemi gecikirse aynı sipariş sürdürülür; yeni kart çekimi yapılmaz.
5. İade/itiraz aynı sipariş kaynağını etkiler; bağımsız kripto veya başka kart
   siparişinden doğan hak silinmez. Geç ve tekrarlanan sağlayıcı bildirimleri
   iptal edilmiş siparişi kendiliğinden yeniden etkinleştirmez. Kesin iade,
   itiraz ve üreticiye ödeme politikası sağlayıcı koşullarıyla netleştirilir.

Bu yol kaynakta henüz yoktur. Mevcut `ft_on_transfer` hakkı USDC gönderenine
yazar; platform hesabından mevcut satın alma çağrısına para göndermek
müşteriye hak vermez. Kartı doğrulayan servis yeni bir güven sınırıdır:
NEAR banka tahsilatını bağımsız doğrulayamaz; doğrulanmış kart bildiriminin
doğruluğu bu servise bağlı, nihai erişim kaydı NEAR'dadır. Servisin yetkisi
kart siparişi kaydı/durumuyla sınırlanmalı; kullanıcı parası veya anahtarları
üzerinde genel yetki verilmemelidir. Katalog/read-model D1 rolü değişmez;
kalıcı kart siparişi kaydı yeniden üretilebilir katalog kaydıyla karıştırılmaz.

### Google, passkey, cihaz ve gönderici

- Sadece giriş yapan her kullanıcıya hemen zincir hesabı fonlanmaz; yeni
  hesabın ücretli hazırlığı ilk gerçek satın alma ihtiyacına ertelenir.
  Mevcut cüzdan hesabı yeniden oluşturulmaz.
- Google ve passkey bağımsız giriş/imzalama seçenekleridir. Seçilen kimliğin
  oturumu, anahtarı ve NEAR hesabı doğrulanır; diğer giriş yöntemiyle aynı hesabı
  paylaşması V1 şartı değildir. Mevcut cüzdan kullanıcıları kendi hesaplarını kullanır.
- İlk cihaz için mevcut sahiplik onayı korunur; kart kayıt servisinin
  imzası kullanıcı imzası sayılmaz. Geçerli cihazla sonraki kart alışverişinde
  kullanıcı bakiyesinden kripto çıkmadığı için her siparişte yeni MPC ödeme
  imzası gerektirmeyen yol hedeflenir; bu henüz uygulanmış optimizasyon değildir.
- Yeni cihaz ve cihaz yetkisi yenileme mevcut sahiplik kontrolünü korur.
  Kart hakkı vermek cihazı otomatik yetkilendirmez. V1 kullanımında ikinci bir
  giriş yöntemi bağlamak şart değildir; yöntemler arası hesap kurtarma eklenmez.
- Kullanıcı parası harcayan kripto işlemleri açık kullanıcı onayını korur.
  Hesaba NEAR koymak veya USDC yerine NEAR seçmek mevcut ilk MPC çağrısının
  gönderici ihtiyacını kaldırmaz.
- Kartı doğrulama yetkisi ve ağ giderini ödeme yetkisi ayrılır. Önce mevcut
  Bridge ve sağlayıcı imkanları değerlendirilir; yeni servis varsayılmaz.
  Kullanıcı/sipariş/gün başına harcama, tekrar koruması, başarısız işlem gideri
  ve düşük bakiye davranışı sayısal olarak sonraki gate'te belirlenecektir.

### Maliyet notları — kesin tablo veya harcama onayı değildir

Sonraki [maliyet ön kontrolü](./near-auth-card-identity-cost-preflight.md)
harcama, gas ön alımı, kontrat depolama rezervi ve kullanıcıya aktarılan
bakiyeyi ayırır. Aşağıdaki yaklaşık 0,10 USD örneği kullanıcı hesabında kalan
NEAR'ı içermez. Doğrudan cihaz işlemi için U=0,12 NEAR fonlama varsayımı
eklendiğinde yeni rapordaki ilk nakit ihtiyacı yaklaşık 0,57 USD olur;
bu da kesin maliyet veya fonlama onayı değildir. Yeni kart/cihaz tüketimi,
sağlayıcı fiyatı ve canlı harcama tavanları hâlâ doğrulanmamıştır.

Aşağıdakiler 22 Eylül konuşmasındaki araştırma/model notlarıdır. Yeni kart
yolu henüz ölçülmedi. Dolar örnekleri **1 NEAR = 4 USD varsayımı** kullanır;
güncel kur veya fiyat taahhüdü değildir.

| Kalem | Dayanak ve açık sınır |
| --- | --- |
| Yalnız giriş | Zincir işlemi yapılmazsa zincir gideri sıfırdır; kimlik sağlayıcısı ücreti ayrıdır. |
| Yeni hesap | Resmî belgede temel oluşturma bedeli 0,007 NEAR; işlem gas'ı ve hesapta bırakılacak bakiye ayrıca hesaplanır. |
| MPC | Önceki testnet imza ölçümü 0,003480349366895 test NEAR'dır; yeni kart akışının veya mainnet'in ölçülmüş ücreti değildir. |
| Hak/cihaz çağrısı | 20 TGas tüketim ve TGas başına 0,0001 NEAR varsayımıyla çağrı başına 0,002 NEAR. Tüketim uygulamadan sonra ölçülmeli, fiyat yeniden okunmalıdır. |
| Depolama | 1.000 ek bayt varsayımıyla 0,01 NEAR rezerv. Bu yakılan ücret değil, kontratta kilitli işletme bakiyesidir; gerçek boyut ölçülmelidir. |
| Örnek toplam | Bir hesap temel bedeli + bir önceki MPC gözlemi + iki varsayımsal çağrı + 1.000 bayt rezerv yaklaşık 0,10 USD eder. Bu, kullanıcı başına toplam maliyet değildir. |
| Hariç tutulanlar | Hesap oluşturma ek gas'ı, hesapta bırakılan bakiye, Auth0/NEAR Auth hizmeti, kart ücreti, iade/itiraz, altyapı ve video izleme/saklama. |

Pilottaki 0,1 NEAR fonlama ve 0,35 NEAR imza bütçesi gerçekleşen ücret
değildir. Mevcut kripto komisyonu kart satışına otomatik taşınmaz. Konuşmadaki
%3 + 0,30 USD kart tarifesi yalnız hesap örneğidir; sağlayıcı teklifi değildir.

Araştırma tarihinde Auth0 fiyat sayfası 25.000 aktif kullanıcıya kadar ücretsiz
paketi ve passkey desteğini gösteriyordu. Hesap bağlama V1'den çıkarıldığı için
bu özellik nedeniyle ücretli paket zorunluluğu V1 maliyetine eklenmez. NEAR Auth'ın
yönettiği ortamın üretim erişimi, kapasitesi ve hizmet tarifesi ayrıca doğrulanır;
Auth0'nun açık free tarifesi YouTick'in bütün kimlik hizmetinin ücretsiz olduğunu kanıtlamaz.
Faucet yalnız testnet gideri içindir. NEAR hibe/teşvikleri ve Auth0 girişim
kredileri aday destektir; YouTick için tahsis veya uygunluk doğrulanmadı.

Dayanaklar: [önceki testnet ölçümü](./near-auth-google-signing-lab.md),
[NEAR ücretleri](https://docs.near.org/protocol/transactions/gas),
[depolama](https://docs.near.org/protocol/storage/storage-staking),
[Auth0 fiyatları](https://auth0.com/pricing),
[NEAR Auth üretim erişimi](https://docs.auth.near.org/resources/networks),
[testnet faucet](https://docs.near.org/getting-started/faucet),
[NEAR fonlama](https://www.near.org/funding) ve
[Auth0 girişim programı](https://auth0.com/startups).

### Açık işler ve kabul sınırı

Bu bölümün tanımladığı maliyet ön kontrolü [ayrı raporla](./near-auth-card-identity-cost-preflight.md)
**COMPLETED_WITH_WARNINGS** olarak tamamlandı. Kamuya açık yetenek/fiyat ve ağ
parametreleri doğrulandı; aşağıdaki ticari kabul ve ölçüm boşlukları kapanmadı.
Bu tarihsel kaynak düzeltmesinden sonraki gate `NEAR_AUTH_V1_FLOW_ACCEPTANCE` idi; güncel sıra üstteki durum bölümündedir;
sağlayıcı ticari/üretim teyitleri ayrıca açık kalır.

`NEAR_AUTH_CARD_IDENTITY_COST_PREFLIGHT`: Stripe hariç kart sağlayıcısında
çok üreticili video pazaryeri, para birimleri, üretici ödemeleri, iade/itiraz
ve toplam fiyat uygunluğunu; NEAR Auth üretim/giriş/imzalama kapsamını;
harcama ile fonlama/depolama rezervini ayıran maliyet tablosunu doğrular.
Sağlayıcı teklifleri yoksa tutarlar varsayım olarak kalır. Yeni kart/cihaz
kodunun ölçümü yapılmadan tahmin ölçülmüş ücret sayılmaz; gerekli yerel
ölçüm ayrı kaynak kapsamı olarak belirlenir. Bu gate başvuru, abonelik,
provider ayarı, anahtar ekleme, gerçek kart/kripto işlemi veya deploy yetkisi
vermez. Eski imza/ödeme uzlaştırması açık kalır.

Plan sonucu **COMPLETED_WITH_WARNINGS**: ürün yönü kaydedildi; sağlayıcı,
kesin ücret ve ayrı giriş yollarının uçtan uca kabulü açık. Kod, provider veya canlı
ödeme kabulü **UNPROVEN**; uygulama testleri, CI ve canlı işlemler bu doküman
gate'inde **EXTERNAL_NOT_RUN**. Planı kaydetmek için blocker yoktur.

## 21 Eylül kaynak kapanışı ve kanıt

1. **Plan tutarlılığı:** güncel karar ve sıra tablosu aynı sonraki gate'i
   gösteriyor. Eski araştırma, hata ve test sayıları tarihsel olarak ayrıldı;
   kapanmış süre/blok bulguları ilgili kaynak raporuna bağlandı.
2. **Kayıt koruması:** ortak session okuyucusu geçersiz kaydı artık silmiyor.
   Google yolunda bozuk/boş/süresi geçmiş kayıt yeni anahtarla değiştirilmiyor.
   Zincirde mevcut iş önce uzlaştırılıyor; yeni işte eski Google attempt
   varsa anahtar yazımı, teklif ve sponsor çağrısından önce duruluyor. Normal
   cüzdanın açık anahtar yenilemesi ve mevcut ücretli işe dönüş korunuyor.
3. **Başlık uyumu:** ortak TS kontrolü Market'in mevcut Unicode White_Space
   kuralını kullanıyor. U+0085 boş başlığı reddediliyor; ham U+FEFF ve U+200B
   kabulü Rust ile aynı. Geçerli imzalı başlık baytları aynen korunuyor.
   Rust üretim kodu, kontrat arayüzü ve kalıcı state düzeni değişmedi.
4. **Bağımsız süre testleri:** Bridge anahtar/mock hazırlığı dosya kapsamına
   taşındı. Son gönderim süre testleri tek başına da çalışıyor.

Yeni regresyonlar düzeltmeden önce **19 Web testi** ve bağımsız seçilen
**2 Bridge süre testi** ile başarısız oldu. Düzeltme sonrası:

| Kanıt sınıfı | Doğrulama | Sonuç |
| --- | --- | --- |
| LOCAL_TEST | Web tüm unit/integration suite | 48 dosya / **845 PASS** |
| LOCAL_TEST | Bridge index + playback-v2 | **176 PASS**, mevcut 3 koşullu test SKIPPED |
| LOCAL_TEST | Bridge son gönderim süre testleri tek başına | **2 PASS**; üstteki kümeyle örtüşür |
| LOCAL_TEST | Market lib + paid-media entegrasyon | **12 + 41 PASS**, offline |
| LOCAL_TEST | Compact boyut/imza matrisi | **360 PASS**, altı imzalı fixture değişmedi |
| LOCAL_STATIC | Web auth tip kontrolü / lint / izole build | **PASS** |
| LOCAL_STATIC | Bridge tip kontrolü | **PASS** |
| LOCAL_STATIC | Rust fmt / clippy tüm hedefler | **PASS** |
| LOCAL_STATIC | Protokol kaynak kontrolü | **PASS** |
| LOCAL_STATIC | Doküman build / bağlantılar | **PASS** |

Boş string regression'ı test deposunun `getItem` taklidindeki farkı da
ortaya çıkardı: gerçek Storage gibi boş string korunacak, yalnız olmayan
anahtar null dönecek şekilde düzeltildi. Tam Web suite bu değişiklikle geçti.
Kayıt incelemesinde kalan boş-string durumu giderildi; protokol incelemesinde
ek hata bulunmadı. Plan incelemesindeki tarihsel başlık netleştirmeleri de
uygulandı. Mevcut Vite/Next ve doküman bundle boyutu uyarıları sürüyor.

**Doğrulama sınırı:** ek ABI karşılaştırması, yerel
`contracts/access-control/target/near/youtick_access_control_abi.json`
çıktısı bulunmadığı için çalışamadı. Bu bir ABI uyumsuzluğu sonucu değildir;
Rust değişikliği yalnız test modülünde, üretim kodu önceki kopyayla aynıdır.
WASM/sandbox, gerçek Auth0/Meteor, tarayıcı/storage, ödeme, upload/HLS,
provider/config, CI/deploy ve commit/push/PR/merge **EXTERNAL_NOT_RUN**.
Üç Bridge skip, mevcut koşullu abuse/load testleridir.

Değişen dosyalar (bu gate'in mevcut kirli çalışma kopyasına ek farkı):

- Plan: `docs/architecture/near-auth-integration-status.md`.
- Ortak protokol: `protocol/paid-media-livepeer-v1/title.ts`,
  `upload-title-vectors.json`, `compact-upload.ts`.
- Web: `apps/web/lib/livepeer-upload.ts`, `near-auth-upload-attempt.ts`,
  `near-auth-upload-wallet.ts`, `near-auth-upload-server.ts` ve
  `apps/web/components/LivepeerPaidUploadForm.tsx`.
- Web testleri: `apps/web/__tests__/setup.ts`,
  `unit/livepeer-upload.test.ts`, `unit/compact-upload.test.ts`.
- Bridge: `workers/livepeer-bridge/src/index.ts`, `index.test.ts`.
- Market: `contracts/nft-ticket/src/lib.rs` yalnız mevcut test modülü.

Kanıt/başlangıç kopyası:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-findings-source-87dieen7/`.
Başlangıçtaki 417 dosyadan 12’si bu gate kapsamında değişti; 405 dosyanın
hash’i ve Git index aynı kaldı. Üç yeni dosya yukarıdaki açık kapsamda eklendi.
Web build ve boyut matrisi bu dizindeki ayrı kopyada çalıştı; mevcut `.next`
ve önceki boyut ölçüm dosyası korunuyor. Kaynak bulgularının kapanması son
canlı hatanın kök nedenini veya mevcut denemenin ödeme sonucunu kanıtlamaz.
Kaynak gate'inin blocker'ı yok; canlı kabul için mevcut deneme uzlaştırması,
önceki hassas çıktı durumunun kapanışı ve ayrı uçtan uca kabul hâlâ gereklidir.

## Tarihsel mimari araştırmaları — 17 Eylül 2026

İlk `NEAR_AUTH_ARCHITECTURE_PLAN_REVIEW` sonucu **COMPLETED_WITH_WARNINGS** idi.
O gün bildirilen `access_denied` ve 24 KB teşhisi
[16 Eylül kaydına](./near-auth-prompt-size.md) dayanıyordu. Aşağıdaki araştırma
sonuçları o günkü adaylara aittir; bugün açık bulgu veya yeni çalışma talimatı değildir.

### 17 Eylül karşı doğrulama: kısa mesaj adayına koşullu sonuç

Gate: `NEAR_AUTH_RESEARCH_RECHECK` — **COMPLETED_WITH_WARNINGS**.
Üç salt-okunur alt ajan önceki araştırmayı bağımsız denetledi; ana ajan yeni
boyut/kriptografi denemesi ve salt-okunur guard kontrolü yaptı. Bu gate yalnız
bu plan belgesini değiştirir. Uygulama, kontrat, test kaynakları, bağımlılıklar,
flag, provider ayarları, canlı veriler ve mevcut çalışma dosyaları korunur.
Kabul: önceki ölçümleri yeniden değerlendirmek, karşı örnek aramak ve kanıtın
sınırlarını düzeltmek. Bu gate yeni mesaj biçiminin uygulama kabulü değildir.

**Düzeltilen sonuç:** mesajın küçülmesi gösterildi; bütün desteklenen girdilerin
sığması ve üç katmanın güvenlik eşdeğerliği gösterilmedi. Önceki 4,7–6,4 KB
değerleri seçilmiş kısa sentetik kimlik alanları içindir. Kısa mesaj hâlâ
sağlayıcı değişikliği gerektirmeyebilecek bir adaydır; mevcut prototip için
genel boyut kabulü **başarısız**, entegrasyon/canlı kabul **UNPROVEN**.

Önceki `/tmp/youtick-compact-upload-wv3pn2p9/check.cjs`:

- Sıfır baytlı public key ile farklı bir hesap adresini, yer tutucu quote
  imzasını ve cihaz özetini kullanıyordu. Bunlar boyut örneğidir; gerçek hesap,
  teklif veya cihaz kabulü sayılmaz.
- Geri dönüş eşitliği ve Action'ın `fatxn` bayt aktarımını kontrol ediyordu;
  boyutları yalnız yazdırıyor, sınırlar için geçer/kaldı denetimi yapmıyordu.
- Kendi 2.048 bayt ek token bütçesi hesabı bazı örneklerde **7.739 bayta**
  ulaşıyordu. Bu gerçek JWT veya kanıtlı üst sınır değildir; yeterli pay
  bulunduğu iddiasını desteklemeyen bir uyarıdır.

Yeni ağsız denemede 5 başlık × 2 job uzunluğu × 4 gerçek biçimli test anahtar
grubu × 3 kimlik zarfı = **120 ölçüm** alındı. Hesap/anahtar eşleşmesi,
origin'e bağlı cihaz özeti, tam sayı ücret hesabı, yerelde geçerli Ed25519
quote/delegate imzaları ve RSA JWT imzası kullanıldı. Quote yeniden kurulduktan
sonra yerel imzası doğrulandı; değiştirilmiş tutar imzası reddedildi.
Saat yalnız test içinde sabittir; uygulamada geçmiş saatle token kabulü yoktur.

| Sentetik token zarfı | Ölçüm | 7.168 baytı aşan | En büyük JWT |
| --- | ---: | ---: | ---: |
| Kısa Google biçimi; API + userinfo audience dizisi | 40 | 0 | 6.889 |
| 255 karakterlik Google subject sınırını modelleyen zarf | 40 | 4 | 7.201 |
| Uygulamanın izin verdiği 512 karakter subject / 128 karakter client sınırları | 40 | 16 | 7.653 |

Son iki satır hipotetik sınır modelleridir; bu kullanıcıdan alınmış Auth0
tokenları değildir. Google'ın subject üst sınırının Auth0'nun nihai subject
biçimini birebir belirlediği veya mevcut client'ın 128 karakter olduğu iddia
edilmez. Ek `jti/gty` veya farklı header alanları da bu modele eklenmemiştir.
İlk satırın bile en büyük örnekte yalnız **279 bayt** payı vardır; bütün
sağlayıcı token profillerine yeterlilik çıkarılamaz.

Bu modellerde en büyük Auth0 `fields` boyutu **15.146 bayt**; delegate ve
MPC dış çağrı boyutları da uygulanan yerel sınır kontrollerini geçti. JWT
karşı örneklerinin bulunması başarılı bir **inceleme** sonucudur, aday için
PASS değildir. Gerçek Web parser'ları, Rust/Bridge compact decoder'ı, mevcut
quote anahtarı ve canlı hesap kullanılmadı; tam güvenlik eşdeğerliği yoktur.

**Ölçüm ve UX düzeltmeleri:**

- [Auth0'nun belgelenmiş 24 KB sınırı](https://auth0.com/docs/customize/forms/render)
  `fields` içindir. Eski deney bütün `{fields: ...}` seçeneklerini ölçüyordu;
  bu fixture'da fark 11 bayttır: 27.052 toplam → 27.041 `fields`. Önceki taşma
  teşhisi değişmez. Yeni deneme `fields` değerini ayrıca denetler.
- Compact örnek gerçek güven sınırı parser'ı değildir; bilinmeyen sürüm,
  fazla/eksik alan, UTF-8/Base64, sayısal sınır ve hesap/cihaz değiştirme
  retleri gerçek tüketicilerde sınanmalıdır. Tam 120 saniyeyi varsayan aday,
  daha kısa geçerli quote'i sessizce uzatamaz: ya dar kapsamı açıkça reddeder
  ya da gerçek bitişi taşır.
- Auth0'nun [form gösterim kodu](https://github.com/Peersyst/fast-auth/blob/38dc894afbc94c198c207f52e6d01d695199eaa1/packages/auth0/src/forms/shared/helpers/index.js#L188)
  function-call argümanlarını JSON olarak sunar; bizim kısa alanları genişletmez
  ve Base64 başlığı çözmez. "Başlık aynı görünür" yalnız YouTick'in kendi
  inceleme ekranı için hedef olabilir; sağlayıcı onay ekranı okunabilirliği
  ayrıca kabul edilmelidir.

**Yeni PROVIDER / salt-okunur kanıt:** 17 Eylül **07:10 UTC**, final blok
**268962571**, hash `6sydpHpPsK6EBF2UwdJtaLcAMzpQwMur7DVCfMuDfnNr`:
aynı doğrudan testnet guard `verify` sorgusunda 7.169 bayt sentetik JWT boyut
hatasıyla, 7.168 bayt sentetik JWT ise boyut aşımı olmadan geçersiz imzayla
reddedildi. Upstream Action SHA-256 değeri yine
`9476e322b93d1c0059bd27453295256b16476d7ce51ce362570b81cb476b631b`.
Hosted Action/form sürümü eşitliği ve gerçek Google tokenı **UNPROVEN**.

Kanıt: `/tmp/youtick-near-auth-recheck-5lst047p/` altında `stress.cjs`,
`stress-results.json`, `provider-read.json`. Betik sıfır çıkış koduyla boyut
karşı örneklerinin bulunduğunu doğrular; bütün JWT'lerin geçtiğini söylemez.
Mevcut provider handoff'un **10 testi PASS**; bunlar form yamasının testleridir,
compact uygulama kabulü değildir. Doküman derlemesi ve dosya koruma kontrolü
bu gate'in kapanış doğrulamasıdır.

**O tarihteki sonraki gate:** `NEAR_AUTH_PAYLOAD_COMPATIBILITY_PLAN` (sonradan tamamlandı).
Kabulü sıkılaştırıldı: kısa mesaj için açık desteklenen veri/token bütçesi,
ölçülebilir pay, gerçek boyut assertion'ları, üç katmanda aynı canonical
veri/teklif imzası, bozuk girdi retleri ve okunabilir kullanıcı onayı gerekir.
Doğrulanmış JWT **7.168 baytı**, API toplam gövdesi/outer args kendi sınırlarını
aşıyorsa sponsor çağrısı sıfır olmalıdır. O tarihteki 32.768 karakterlik uygulama
token limiti guard'ın 7.168 bayt sınırının yerine geçmez.

Değişecek gerçek tüketiciler: Web upload mesaj üretimi, Google upload parser'ı,
Bridge relay ve playback-proof parser'ları, Market `ft_on_transfer`.
Mevcut imzalı proof/pending job byte'ları dönüştürülmez; eski kayıtların
uzlaştırma/oynatması ve yeni mesajın reload davranışı ayrı doğrulanır.
**EXTERNAL_NOT_RUN:** gerçek Google/passkey onayı, ücretli imza/ödeme,
upload/HLS, provider veya kontrat yayını, CI/deploy, commit/push/PR.
Uygulama değişmediği için Web/Bridge/kontrat suite'leri yeniden çalıştırılmadı.

### 17 Eylül ek inceleme: sponsor alternatifleri ve ikinci boyut engeli

Gate: `NEAR_AUTH_ALTERNATIVE_PATH_REVIEW` — **COMPLETED_WITH_WARNINGS**.
Kullanıcının sponsorun boyutu büyütüp büyütmediği sorusu üzerine iki alt ajan
salt-okunur karşılaştırma yaptı. Bu bölüm önceki "provider form yaması ardından
canlı kabul" varsayımını düzeltir. Yalnız bu plan belgesi güncellendi; kaynak,
kontrat, bağımlılık, flag veya canlı ayar değiştirilmedi.

İki sponsor adımı ayrıdır: Google/MPC imzasını ürettiren dış sponsor işlemi
Auth0 formuna iç içe eklenmez. Ancak upload relay için kullanılan
`sponsor_quote` ve `sponsor_quote_signature` **imzalanan mesajın içindedir** ve
boyutu önemli ölçüde artırır. Aynı veriyle delegate yerine normal transaction
kullanmak bu yükü kaldırmaz.

Mevcut fixture ve RSA2048 ile **LOCAL_TEST / sentetik** karşılaştırma:

| Temsilî işlem | Eski Auth0 form seçenekleri, bayt | Tam sentetik JWT, bayt |
| --- | ---: | ---: |
| Mevcut quote + cihaz, delegate | 27.052 | 10.586 |
| Aynı içerik, normal transaction | 27.023 | 10.629 |
| Quote çıkarılmış, cihaz korunmuş, normal transaction | 12.138 | 5.662 |
| Quote ve cihaz çıkarılmış, normal transaction | 9.051 | 4.586 |

Son iki satır yalnız boyut deneyidir; public pilotun kabul ettiği işlem değildir.
Sabit sentetik claim/header boyutları gerçek Auth0 tokenı boyutu sayılmaz.
En ağır 200 bayt kaçışlı başlıkta quotesiz normal işlemin JWT'si cihazla 8.556,
cihaz ayrıyken 7.480 bayttır; temsilî örneğin küçülmesi tüm desteklenen girdilere
yeterlilik kanıtı değildir. Yalnız cihazı ayırmak da mevcut quote'li temsili
delegate JWT'sini 9.510 bayta indirir; sorun devam eder.

**Yeni PROVIDER / salt-okunur kanıt:** 17 Eylül 2026 06:20 UTC, final blok
**268957871**, hash `CFoSGx7jmW89Q6QinQjdUqbahR2PTeg5voAmen8KwKR2`:
`auth0.jwt.fast-auth.testnet` üzerindeki saf `verify` metodu RPC
`query / call_function` ile çağrıldı. Aynı blokta 7.168 baytlık sentetik JWT
`[false, ""]`, 7.169 baytlık sentetik JWT
`[false, "JWT token exceeds maximum size limit"]` döndürdü. İlk sonuç sahte
imzanın reddidir, başarılı kimlik doğrulama değildir. Gerçek JWT, login,
transaction broadcast, imza, ödeme veya state yazımı kullanılmadı.

[Guard kaynağındaki 7.168 bayt sınırı](https://raw.githubusercontent.com/Peersyst/fast-auth/main/contracts/jwt-guards/base-jwt-guard/src/core.rs)
böylece çalışan testnet davranışıyla da doğrulandı; tüm deployed kodun kaynakla
eşit olduğu iddia edilmez. Mevcut temsilî delegate'in **yalnız `fatxn` alanının
base64url bölümü 9.815 bayttır**; diğer claim/header/imza eklenmeden bile sınırı
aşar. Form girintisi yaması `fatxn` içeriğini değiştirmediği için bu ikinci
engeli çözmez. Mainnet guard davranışı bu kontrolde ölçülmedi.

| Alternatif | Değerlendirme |
| --- | --- |
| Sponsorluğu koruyup yükleme mesajını küçültmek | Tercih edilen yerel araştırma. Tekrarlanan quote alanlarını daha kısa bir temsilden yeniden kurup aynı hesap, job, ücret, süre ve imza bağlarını doğrulamak mümkün olabilir. Mevcut Web/Bridge/Market mesaj biçimi değişir; önce ağsız prototip ve en büyük girdi ölçümü gerekir. Henüz uygulanmış/kanıtlanmış çözüm değildir. |
| Quotesiz normal upload; gas'ı Google hesabı ödesin | Boyutu azaltır, fakat Web `livepeer-upload.ts:401` bu yolu public V1'de kapatır; Market `lib.rs:1246` public policy altında quotesiz ödemeyi iade eder. Kontrat/politika ve ücret davranışı değişmeden açılamaz. Google/MPC dış imzası için ödeyici ihtiyacı ayrıca sürer. |
| Provider düzeltmesi | Mevcut form yamasına ek olarak gerçek JWT boyutu ve guard sınırı birlikte çözülmelidir. Daha verimli token temsili Action/guard/istemci uyumu ister; sınırı ölçmeden artırmak önerilmez. |
| Cihazı ayrı işlemle kaydetmek | Veri azalır ama tek başına iki sınırı çözmez; ek imza ve kurtarma adımı getirir. |
| Yerel oturum anahtarı veya yalnız hash imzası | Küçük kestirme değildir. FunctionCall anahtarı ödeme için gereken 1 yoctoNEAR'ı ekleyemez; FullAccess anahtarı güven modelini değiştirir. Mevcut guard tam `fatxn == sign_payload` bekler; hash/sıkıştırma karşı taraf desteği olmadan kullanılamaz. |

O tarihte önerilen sonraki adım yalnız yerel boyut/uyumluluk planıydı: mevcut sponsorlu
mesajı temel al, aynı güvenlik bağlarını koruyan kısa temsil adayını ölç;
200 bayt başlıkların tamamını, en uzun desteklenen kimlik/claim alanlarını,
form/JWT/API sınırlarını ve normal cihaz davranışını kapsa. Mevcut
`scripts/near-auth-provider-handoff/` düzeni yeniden kullanılabilir; canlı
kontrat değiştirilmez. Çıkışta somut mesaj biçimi, güvenlik eşdeğerliği,
ölçülmüş boyut payı ve gerekli explicit-path uygulama kapsamı verilir.
Başarısızsa provider protokol düzeltmesi veya ayrı sponsorsuz tasarım kararı
gerekir; otomatik alternatif ödeme/yükleme başlatılmaz.

## 17 Eylül incelemesinin tarihsel kapsamı ve sorumluluğu

- Kaynak: `f71178263c5d264bef647feaae8a2b54618b1333` tabanı ve üzerindeki mevcut
  yerel değişiklikler. Bu inceleme yalnız commit edilmiş main'i temsil etmez.
- Ana ajan entegrasyon, kaynak doğrulaması ve bu belgenin tek yazarıdır.
  Üç salt-okunur alt ajan kimlik/imza, upload/oynatma ve provider/SDK sınırlarını
  ayrı inceledi; bulgular ortak çağıranlar ve kontrat koşullarıyla uzlaştırıldı.
- Yazılabilir repo dosyası yalnız bu belgedir. Uygulama, testler, bağımlılıklar,
  kontratlar, Bridge, release, ortam ayarları ve mevcut kullanıcı dosyaları
  değiştirilemez. Sentetik inceleme denemeleri repo dışındaki geçici dizindedir.
- Kabul: bildirilen hatayı diğer risklerden ayırmak; kaynak/resmî belge kanıtı,
  uygulanabilir tek sonraki gate ve ayrı canlı/ürün kabul ölçütleri yazmak.
  Doğrulama: mevcut Web testleri, auth tip kontrolü, provider handoff testleri,
  doküman derlemesi ve kapsam dışı dosyaların hash karşılaştırması.

## Korunacak mimari ve kullanıcının gerçekte yaptığı işlem

```text
Google / sağlayıcının desteklediği passkey
  -> Auth0 kimliği -> doğrulanmış YouTick oturumu
  -> issuer + subject üzerinden MPC anahtarı -> NEAR hesabının zincir kontrolü

Upload taslağı + mevcut cihaz -> Bridge'in imzalı ücret teklifi
  -> tam delegate baytları için ayrı Google onayı
  -> seçilen sponsor cüzdanından NEAR Auth / MPC imza isteği
  -> doğrulanmış MPC imzası -> mevcut Bridge relay -> NEAR ücretli iş
  -> aynı job ile Livepeer upload/yayın -> mevcut V2 oynatıcı

Oynatma -> mevcut V3 cihaz yetkisi + NEAR sahiplik/entitlement kontrolü
  -> Bridge kısa süreli playback tokenı -> Livepeer HLS
```

Giriş oturumu işlem imzası veya video hakkı değildir. NEAR ekonomik/erişim
otoritesi, Bridge kontrol katmanı, Livepeer medya katmanı olarak kalır; D1
kimlikten hak üretemez. Google hesabı video sahibi, ayrı sponsor yalnız MPC
isteğinin ödeyenidir. MPC sponsoru ile upload delegate'ini zincire ileten
Bridge sponsoru farklı adımlardır. Mevcut ortak upload/oynatıcı yeniden kullanılır.

Kaynak sınırları: `apps/web/app/api/auth-lab/session/route.ts:72`,
`apps/web/lib/near-auth-account-preflight.ts:48`,
`apps/web/lib/near-auth-signing-server.ts:92`,
`apps/web/lib/near-auth-upload-wallet.ts:61` ve
`apps/web/components/NearAuthLab.tsx:98`. Satırlar bu inceleme anına aittir.

## 17 Eylül öncelikli bulguları — tarihsel

### 1. Bildirilen hata: provider onay formunun boyutu

Auth0 [form alanlarını 24 KB ile sınırlar](https://auth0.com/docs/customize/forms/render).
Repodaki hata kaydı `24576` bayt sınırını bildiriyor. Video dosyası Auth0'ya
gönderilmiyor; onay ekranına konan işlem argümanları girintili JSON nedeniyle
büyüyor. 17 Eylül handoff testi temsilî delegate için **27.052 → 7.055**,
en ağır başlık örneği için **36.289 → 9.222** bayt ölçtü. Yama yalnız gösterim
girintisini kaldırıyor; işlem baytlarını, değerleri ve ret hakkını koruyor.

17 Eylül 06:01 UTC salt-okunur [upstream kaynak kontrolünde](https://raw.githubusercontent.com/Peersyst/fast-auth/main/packages/auth0/src/actions/authorize-app.action.js)
eski biçimlendirme sürüyor; SHA-256
`9476e322b93d1c0059bd27453295256b16476d7ce51ce362570b81cb476b631b`.
Bu, barındırılan Auth0 Action sürümünün kanıtı değildir. Gerçek yayın/kabul
**UNPROVEN**. `access_denied` tek başına her zaman boyut hatası demek değildir;
yeni farklı açıklama gelirse aynı teşhis otomatik uygulanmaz.

Bu form hatasının düzeltmesi mevcut sağlayıcı yamasıdır; dosyayı küçültmek, bakiye artırmak, imza
baytlarını kırpmak veya issuer değiştirmek değildir. Sağlayıcıdan tenant/Action
kimliği, kaynak revizyonu, yayın zamanı ve gerçek form kabulü gerekir.
Bu yama yukarıdaki ayrı JWT sınırını çözmez; tam akış için yeterli sayılmaz.

### 2. Tarihsel P2 — son süre kontrolü kaynakta giderildi

Kapanış: [signing freshness kaynak gate’i](./near-auth-signing-freshness-source.md).
Aşağıdaki açıklama düzeltme öncesindeki davranıştır.

`near-auth-signing-server.ts:131` tokenı doğruluyor, ardından zincir kontrolleri
yapıp geçerliliği yeniden denetlemeden sponsor çağrısı döndürüyor.
`near-auth-signing.ts:64-77` de inceleme süresini yalnız başta kontrol ediyor;
sponsor hesabı/cihaz beklemelerinin sonunda tekrar denetlemiyor. Upload'daki
`near-auth-upload-server.ts:123` ve `near-auth-upload-wallet.ts:63` bu korumayı
zaten içeriyor. Eksik olan kardeş self-transfer/bilet yollarıdır.

**LOCAL_TEST:** mevcut test düzeninin repo dışındaki kopyasında iki ek sentetik
deneme, token başlangıçta geçerliyken zincir kontrolünde saat 61 saniye ileri
alındığında normal imza ve bilet için sponsor çağrısının hâlâ üretildiğini gösterdi.
Gerçek token/sponsor/ağ kullanılmadı. Bu hata `access_denied` nedeni değildir;
geçersiz onay için gereksiz sponsor gideri riski yaratır.

### 3. Tarihsel P2 — quote blok penceresi kaynakta giderildi

Kapanış: [signing freshness kaynak gate’i](./near-auth-signing-freshness-source.md).
Aşağıdaki yeniden üretim düzeltme öncesine aittir.

`near-auth-upload-server.ts:54` ve Bridge
`workers/livepeer-bridge/src/index.ts:4252` mevcut bloğu delegate'in son bloğuyla
karşılaştırıyor. Market ise ayrıca **yürütme bloğu ≤ quote'in son bloğu** ister:
`contracts/nft-ticket/src/lib.rs:2103`. Quote'in saat süresinin dolmamış olması
bu ayrı zincir koşulunu karşılamaz.

**LOCAL_TEST:** quote son bloğu 1200, hazırlık bloğu 1199 ve delegate son bloğu
1399 iken güncel blok 1201'e ilerletildi. Quote/JWT saat süresi geçerli kaldı;
gerçek `authorizeGoogleUpload` sponsor çağrısı döndürdü. Market koşulu bu blokta
sağlanamaz. Google ön kontrolü ve ortak Bridge relay sınırında, yeni ücretli
gönderimden önce quote'in kendi blok penceresi de denetlenmeli. Mevcut işlemin
sonucunu uzlaştıran yol bu kontrolle engellenmemeli.

Bu, delegate için verilen **+200 blok toleransının hatalı olduğu** iddiası
değildir: Bridge aynı toleransı tanıyor (`index.ts:4034-4035`, `4260-4261`).
İlk bu yöndeki şüphe incelemede elendi. Kontrat sınırı gevşetilmeyecek. Ön
kontrol ile zincirde yürütme arasındaki ilerleme riski de tamamen yok olmaz.

### 4. Bilinçli pilot sınırları, ürün kabulünün yerine geçmiyor

- **Cüzdan gereksinimi sürüyor:** hesap hazırlama, test USDC fonlama ve MPC
  sponsor seçimi kullanıcıdan harici cüzdan istiyor. Google ile giriş geniş
  kitleye uygun finansman deneyimini tek başına sağlamıyor.
- **İlk cihaz ve ilk işlem:** upload/bilet kontrolü mevcut cihaz kaydında duruyor
  (`near-auth-upload-server.ts:75`, `near-auth-ticket-purchase.ts:101`). Aynı
  hesaptan ikinci upload ayrı kabul ister. Lab oynatıcı yalnız creator'a açık
  (`NearAuthLab.tsx:105`); buyer playback henüz ürün kabulü değil.
- **Güvenli durma, tamamlanmış kurtarma değil:** `outer_pending`,
  `outer_submitted`, `mpc_verified` kayıtları ikinci sponsor ücretini engelliyor;
  sonuncusu upload ödemesi başarısı anlamına gelmiyor. Süresi dolmuş tamamlamada
  otomatik kilit silmek yerine aynı işlemin salt-okunur uzlaştırılması gerekir.
- **Passkey hesabı:** anahtar issuer + subject'ten türetiliyor. Auth0 farklı
  kimlikleri [varsayılan olarak ayrı hesap sayar](https://auth0.com/docs/manage-users/user-accounts/user-account-linking).
  V1'de Google ile aynı hesabı üretme şartı yoktur. Passkey kendi kimliği ve
  hesabıyla kullanılır; aynı e-postadan otomatik birleştirme yapılmaz.
- **Üretim kapalı:** mevcut lab yalnız development/testnet, API'ler ayrıca
  localhost ile sınırlı. Production için yalnız bayrak açmak yeterli değildir.
  [Onaylı uygulama ve production kimlik bilgileri](https://docs.auth.near.org/resources/networks)
  gerekir; ortak testnet client taşınmaz.

## Gate özetleri ve bundan sonraki sıra — otomatik ilerleme yok

| Sıra | Gate / sorumlu | Çıkış ölçütü |
| --- | --- | --- |
| 0 | `NEAR_AUTH_PAYLOAD_COMPATIBILITY_PLAN` / tamamlandı | İzole prototip, boyut matrisi ve ortak imzalı örnekler yerelde geçti; canlı kabul değildir. |
| 0.1 | `NEAR_AUTH_COMPACT_UPLOAD_SOURCE` / tamamlandı | Ortak codec/decoder ve Google imza hazırlığı ana kaynakta bağlandı; yerel kontroller geçti, canlı yayın yapılmadı. |
| 1 | `NEAR_AUTH_SIGNING_FRESHNESS_SOURCE` / tamamlandı | Son süre/blok kontrolleri ile yeni gönderim durdurma ve eski işlem uzlaştırması yerelde doğrulandı. |
| 1.1 | `NEAR_AUTH_LOCAL_UX_ACCEPTANCE` / tamamlandı | 18 UX + 15 playback senaryosu yerelde geçti; gerçek imza/ödeme yoktur. |
| 2 | `NEAR_AUTH_COMPACT_RELEASE_PREFLIGHT` / tamamlandı | Kaynak adayı, iki source engeli, bakım ve compact sonrası geri dönüş sınırı kaydedildi. Engeller aşağıdaki source gate ile giderildi. |
| 2.1 | `NEAR_AUTH_COMPACT_RELEASE_GUARDS_SOURCE` / tamamlandı | CI tüketici seçimi ve policy güncellendi; 224 yerel test geçti, canlı bakım/gönderim yok. |
| 2.2 | `NEAR_AUTH_COMPACT_SOURCE_INTEGRATION` / tamamlandı | Ayrı main adayı, temiz paket kurulumu, son diff ve yerel doğrulamalar tamamlandı; GitHub değişmedi. |
| 2.3 | `NEAR_AUTH_COMPACT_GIT_PUBLISH` / tamamlandı | PR #214 açıldı; PR CI başarılı, ayrı GitHub AI review model hatası nedeniyle yapılamadı. |
| 2.4 | `NEAR_AUTH_COMPACT_MERGE` / tamamlandı | Main 6739ec7, 13/13 CI, exact Market artifact ve kaynak doğrulaması; Preview atlandı. |
| 2.5 | `NEAR_AUTH_COMPACT_DEPLOY_PREFLIGHT` / tamamlandı | Canlı iş/kuyruk/rezerv ve bakım paketi; nihai state hash bakım sonrasında alınacak. |
| 2.6 | `NEAR_AUTH_COMPACT_MAINTENANCE` / tamamlandı | Guardian pause/freeze, closed run 35313295412 ve yeni policy-checked state hash doğrulandı. |
| 2.7 | `NEAR_AUTH_COMPACT_MARKET_DEPLOY` / tamamlandı | Tek DeployContract FINAL; compact version 1, state/bakiye/13 yayın korundu, bakım sürüyor. |
| 2.8 | `NEAR_AUTH_COMPACT_REOPEN` / tamamlandı | Admin bayrakları false, acceptance 35360921254 PASS, compact runtime hazır; yeni ödeme/upload yok. |
| 2.9 | `NEAR_AUTH_COMPACT_LIVE_ACCEPTANCE_PREFLIGHT` / tarihsel BLOCKED | Kullanıcı yeni denemeye geçti; önceki hassas çıktı ve eksik uzlaştırma kaydı korunur. |
| 2.10 | `NEAR_AUTH_UPLOAD_AUTHORIZATION_DIAGNOSTICS_SOURCE` / tamamlandı | Yeni authorize-upload reddi için yalnız güvenli hata sınıflandırması; 784 yerel test PASS. |
| 2.11 | `NEAR_AUTH_UPLOAD_AUTHORIZATION_RECHECK` / tarihsel | Son kullanıcı denemesi imza aşamasını geçti; güncel belirsizlik taslak ve ödeme sonucudur. |
| 2.12 | `NEAR_AUTH_UPLOAD_DRAFT_GUARDS_SOURCE` / tamamlandı | İmza öncesi taslak kontrolleri yerelde geçti; canlı kök neden ve ödeme sonucu kanıtlanmadı. |
| 2.13 | `NEAR_AUTH_REVIEW_FINDINGS_SOURCE` / tamamlandı | Beş bulgu kaynak/plan düzeyinde kapandı; yerel kabul aşağıda, canlı kabul yok. |
| 2.14 | `NEAR_AUTH_UPLOAD_ATTEMPT_RECONCILIATION` / BLOCKED, ayrı eski kayıt | Adayın MPC imzası doğrulandı; son denemeyle eşleşme teyidi yok. Yeni hesap testi bu kaydı kapatmaz. |
| 2.15 | `NEAR_AUTH_FRESH_ACCOUNT_UPLOAD_PREFLIGHT` / BLOCKED | Ortam/sponsor hazır; yeni Google NEAR hesabı henüz yok, USDC hazırlığı ve dosya/cihaz kontrolü eksik. |
| 2.16 | `NEAR_AUTH_FRESH_ACCOUNT_PROVISIONING` / tamamlandı, uyarılı | Final blokta hesap, 0,1 test NEAR ve FullAccess doğrulandı; işlem makbuzu/gideri doğrulanmadı. |
| 2.17 | `NEAR_AUTH_FRESH_ACCOUNT_USDC_PREFLIGHT` / çalıştırılmadı | Kullanıcı fonlama ve upload yaptı; bu planlanan ön kontrol PASS sayılmadı. |
| 2.18 | `NEAR_AUTH_PUBLICATION_TRANSIENT_ERROR_REVIEW` / tamamlandı, uyarılı | Yeni ücretli iş/yayın doğrulandı; geçici HTTP 409 alt nedeni kanıtsız, kaynak yarış senaryosu yerelde gösterildi. |
| 2.19 | `NEAR_AUTH_PUBLICATION_POLLING_RACE_SOURCE` / tamamlandı, uyarılı | Tek ek zincir kontrolüyle aynı ACTIVE yayın doğrulanıyor; 856 Web testi PASS, yeni canlı kabul yok. |
| 3 | `NEAR_AUTH_CREATOR_PLAYBACK_RELOAD_ACCEPTANCE` / PASS | Aynı Google hesabı/cihaz, gerçek 720p HLS ve reload/3:13 devam kabulü; kullanıcı teyidi, yeni ödeme/upload yok. |
| 4 | `NEAR_AUTH_PRODUCT_IDENTITY_FUNDING_PLAN` / COMPLETED_WITH_WARNINGS | Doğrudan kart, ayrı fiat/USDC muhasebesi, arka plan göndericisi ve maliyet varsayımları kaydedildi; giriş kapsamı son V1 kararıyla sadeleştirildi. Uygulama veya sağlayıcı kabulü değildir. |
| 4.1 | `NEAR_AUTH_CARD_IDENTITY_COST_PREFLIGHT` / COMPLETED_WITH_WARNINGS | Resmî kart/kimlik belgeleri, final blok ücret parametreleri ve ayrı harcama/rezerv/fonlama modeli kaydedildi. Ticari kabul, yeni kart kodu ölçümü ve canlı harcama tavanları açık. |
| 4.2 | `NEAR_AUTH_V1_SCOPE_SIMPLIFICATION` / PASS | Hesap bağlama ve bağlama amaçlı test sırası V1'den çıkarıldı; cüzdan/Google/passkey bağımsız kullanım hedefi korundu. |
| 5 | `NEAR_AUTH_V1_FLOW_ACCEPTANCE` / COMPLETED_WITH_WARNINGS | Ayrı Google buyer: 2 test USDC satın alma, 720p ve reload doğrulandı; ilk sekme hatası ve makbuz kapsamı açık. |
| 5.1 | `NEAR_AUTH_V1_FLOW_SOURCE` / COMPLETED_WITH_WARNINGS | Aynı geçerli cihaz, bilet başına kayıt ve buyer playback düzeltildi; 868 Web + 16 playback + 18 UX, tip/lint/izole build geçti. Gerçek provider/ödeme/izleme kabulü yok. |
| 5.2 | `NEAR_AUTH_V1_PASSKEY_ACCEPTANCE` / COMPLETED_WITH_WARNINGS | Bağımsız kimlikte creator ve passkey onaylı buyer, 720p ve reload geçti; ayrıntılar güncel kabul raporunda. |
| 6 | `NEAR_AUTH_V1_PRODUCT_FLOW_PREFLIGHT` / COMPLETED_WITH_WARNINGS | Ana uygulama bağlantıları, tek aktif kimlik, dar işlem adaptörleri ve sponsor/kart eksikleri netleştirildi; kaynak değişmedi. |
| 6.1 | `NEAR_AUTH_V1_SESSION_UI_SOURCE` / COMPLETED_WITH_WARNINGS | Kapalı ürün modu, tek aktif kimlik, oturum/callback/profil ve ödeme sınırları; 909 Web + 25 UX + 16 playback geçti. |
| 6.2 | `NEAR_AUTH_V1_SESSION_UI_ACCEPTANCE` / COMPLETED_WITH_WARNINGS | Onaylı yerel ürün modu; Google/passkey/wallet profil ve reload, mevcut hakla 720p. Boş POST stream düzeltmesi; 915 test. Redirect/hosted sınırları açık. |
| 6.3 | `NEAR_AUTH_V1_PAYMENT_FLOW_PREFLIGHT` / COMPLETED_WITH_WARNINGS | Private Bridge MPC girişi, kalıcı tek gönderim/nonce ve bütçe; fonlama/kart sınırları net. Kod/ayar değişmedi. |
| 6.4 | `NEAR_AUTH_V1_MPC_SPONSOR_SOURCE` / COMPLETED_WITH_WARNINGS | Private Bridge MPC girişi, kalıcı nonce/bütçe ve tek gönderim kaynağı tamamlandı; bu kaynak gate'inde canlı ödeme/deploy yok. |
| 6.5 | `NEAR_AUTH_V1_TICKET_PAYMENT_ACCEPTANCE` / COMPLETED_WITH_WARNINGS | Ürün bilet kaynağı ve yerel runtime sonrasında Google/passkey için TICKET_SETTLED, 1080p ve reload kabulü; tarihli localhost + gerçek testnet kanıtı, hosted yayın değil. |
| 6.6 | `NEAR_AUTH_V1_UPLOAD_PAYMENT_ACCEPTANCE` / COMPLETED_WITH_WARNINGS | Ürün upload kaynağı, quote doğrulama ve yerel kurulum sonrasında iki UPLOAD_SETTLED, Published/ACTIVE ve 720p kabulü; hosted yayın değil. |
| 6.7 | `NEAR_AUTH_V1_REDIRECT_CALLBACK_PREFLIGHT` / COMPLETED_WITH_WARNINGS | Sabit callback rotası ve sağlayıcı izin sınırı incelendi; güncel allowlist/yönetim erişimi ve gerçek redirect kabulü açık. |
| 6.8 | `NEAR_AUTH_V1_REDIRECT_RETURN_PATH_SOURCE` / PASS | Upload durum bağlantısı giriş/callback boyunca korunur; 137 odaklı test, auth tip, scoped lint ve doküman kontrolleri yerelde geçti. Provider ayarı değişmedi. |
| 6.9 | `NEAR_AUTH_V1_REDIRECT_PROVIDER_SETUP` / BLOCKED | Kullanıcı Dashboard'a giriş yaptı; erişilebilir tenant ve üç uygulaması hedef ortak testnet client'ını içermiyor. Provider ayarı ve gerçek redirect kabulü yapılmadı; hedef client yönetim erişimiyle aynı gate sürer. |
| 6.10 | `NEAR_AUTH_V1_REDIRECT_COMPATIBILITY_PREFLIGHT` / COMPLETED_WITH_WARNINGS | İletişimsiz kök dönüş adayı; mevcut kaynak eksiği ve SDK aktarım uyumu 6 izole kontrolle doğrulandı. 137 mevcut test/auth tip PASS; gerçek provider izni açık. |
| 6.11 | `NEAR_AUTH_V1_REDIRECT_ROOT_SOURCE` / PASS | Ürün origin dönüşü ve kök OAuth yanıtını mevcut callback'e dar aktarım; özgün Host, SDK state/tekrar ve hedef kontrolleri. 1009 Web testi, tip/lint PASS; gerçek provider izni açık. |
| 6.12 | `NEAR_AUTH_V1_REDIRECT_ROOT_ACCEPTANCE` / COMPLETED_WITH_WARNINGS | Gerçek Google kök dönüşü → doğru profil/hesap → reload; tek session write. Onaylı Web restart aynı oturum anahtarıyla; Bridge kapalı, kayıtlar aynı. Provider ayarı/iletişim, ödeme/upload yok. |
| 6.13 | `NEAR_AUTH_V1_PASSKEY_REDIRECT_ACCEPTANCE` / COMPLETED_WITH_WARNINGS | Kullanıcı aynı-sekme passkey dönüşünü teyit etti; doğru hesap/profil/reload doğrulandı. Kesintili gözlem nedeniyle başlangıç hedefi ve tek callback write açık; yeni login/ödeme yok. |
| 6.14 | `NEAR_AUTH_V1_REDIRECT_TARGET_ACCEPTANCE` / PASS | Kontrollü Chrome Google redirect: aynı sekmede Auth0 → tam upload hedefi, doğru hesap, temiz query, tek session write ve reload. Provider ayarı/iletişim, ödeme/upload yok. |
| 6.15 | `NEAR_AUTH_V1_LOCAL_RUNTIME_RECOVERY_PREFLIGHT` / COMPLETED_WITH_WARNINGS | Eksik Bridge registry/listener; dört sağlam terminal kayıt. Bridge-only kapalı kurtarma paketi, 4 Web + 56 Bridge testi PASS. Start/stop veya özel anahtar okuma yok. |
| 6.16 | `NEAR_AUTH_V1_LOCAL_RUNTIME_RECOVERY` / PASS | Yalnız Bridge kapalı modda açıldı; Web restart olmadan hot reconnect, Chrome status 200 ve kapalı UI. Aynı Web PID/oturum anahtarı/config ve 10 MPC kaydı; ödeme/upload yok. |
| 6.17 | `NEAR_AUTH_V1_DEVICE_RECOVERY_PREFLIGHT` / COMPLETED_WITH_WARNINGS | Mevcut Market aktivasyonu yeniden kullanılabilir; sosyal UI/MPC device yolu eksik. Global bozuk-kayıt temizliği yeniden üretildi. 55 Web + 4 kontrat + 3 teşhis PASS; canlı işlem yok. |
| 6.18 | `NEAR_AUTH_V1_DEVICE_STORAGE_GUARD_SOURCE` / PASS | Bozuk kayıt yalnız istenen hesapta temizlenir; diğer hesap key/ilerleme korunur. Regresyon önce başarısız, sonra PASS; 1010 Web testi, tip ve scoped lint PASS. Canlı depo/cihaz/MPC işlemi yok. |
| 6.19 | `NEAR_AUTH_V1_DEVICE_RECOVERY_SOURCE` / COMPLETED_WITH_WARNINGS | Sosyal cihaz UI/API/private MPC yolu, ayrı kapalı izin, üç slot ve tek gönderim; 1038 Web + 529 Bridge + 4 kontrat testi PASS. Pending ödeme/expiry tam kurtarması ve canlı kabul açık. |
| 6.20 | `NEAR_AUTH_V1_DEVICE_RECOVERY_ACCEPTANCE_PREFLIGHT` / COMPLETED_WITH_WARNINGS | Taze final blokta dağıtılmış metot, iki hesabın hakkı/2 boş slotu ve yeterli rezerv; 10 MPC kaydı aynı, dört settled. Web/Bridge kapalı, Chrome oturumu doğrulanamadı; canlı kabul NO-GO. |
| 6.21 | `NEAR_AUTH_V1_DEVICE_RECOVERY_LOCAL_RUNTIME_SETUP` / PASS | Web + özel Bridge kapalı; Chrome doğru Google hesabı, cihaz status 200 / enabled:false ve aynı UPLOAD_SETTLED pointer. 10 MPC kaydı, config ve session key korunuyor; 12 test PASS. |
| 6.22 | `NEAR_AUTH_V1_DEVICE_RECOVERY_ACCEPTANCE` / PASS | Chrome/Google yeni cihaz: tek DEVICE_SETTLED, dış/iç FINAL; eski cihaz/hak korundu, USDC yok. İzinler tekrar kapalıyken 1080p tam örnek oynatma + reload. Süre yenileme/passkey ayrı açık. |
| 6.23 | `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_PREFLIGHT` / COMPLETED_WITH_WARNINGS | Güncel cihaz/key bağımlılıkları ve değişebilir upload key sorunu doğrulandı; 14 teşhis + 14 geçici aday, 122 Bridge + 3 kontrat testi PASS. Kaynak/canlı kayıt değişmedi. |
| 6.24 | `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_SOURCE` / PASS | Ödeme/hak/quote kanıtı korunarak güncel cihaz ve değişebilir key koşulları ayrıldı. 540 Bridge + 1038 Web ve tip PASS; canlı 11 kayıt aynı. Runtime/deploy veya canlı gecikmiş kabul yok. |
| 6.25 | `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_ACCEPTANCE_PREFLIGHT` / COMPLETED_WITH_WARNINGS | Yalıtılmış iki-core paket hazır; primary eski tx timeout, resmî arşiv aynı hash FINAL. Hak/job okunuyor. 7 ret + NO-GO kontrolü PASS; kabul çalıştırılmadı. |
| 6.26 | `NEAR_AUTH_V1_DEVICE_RECOVERY_ARCHIVAL_RPC_SOURCE` / PASS | Üç tx okuyucusunda aynı hash/sender ile tek arşiv fallback; 15 s / 256 KiB, kanıt ve no-send korumaları. 572 Bridge + 1038 Web/tip PASS. Yalıtılmış paket güncel, kabul çalışmadı. |
| 6.27 | `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_ACCEPTANCE` / PASS | İki bellek kopyası gerçek kanıtla settled; primary timeout + archive fallback ve hak/job dahil 4 read. Canlı yazım/gönderim 0; 11 MPC kaydı aynı. |
| 6.28 | `NEAR_AUTH_V1_DEVICE_RECOVERY_RUNTIME_REFRESH` / PASS | Yeni bundle/source-map ve aynı key/epoch/state; Chrome doğru Google hesabı, cihaz status 200 / enabled:false / DEVICE_SETTLED. Dört bayrak kapalı, 11 kayıt aynı. |
| 6.29 | `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_PREFLIGHT` / COMPLETED_WITH_WARNINGS | Eski blokta primary UNKNOWN_BLOCK; arşiv aynı hak/cihaz kanıtını veriyor. Bugünkü device iki provider ile doğru. 2 teşhis PASS; canlı kayıt/source/runtime değişmedi. |
| 6.30 | `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_SOURCE` / PASS | Aynı receipt bloğuna sabit iki device view için tek arşiv fallback; yanlış/olumsuz proof reddi, 15 s/byte sınırı ve sıfır yeni gönderim. MPC 144 / Bridge 598 / Web 1038 PASS. Canlı runtime yenilenmedi. |
| 6.31 | `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_ACCEPTANCE_PREFLIGHT` / PASS | Gerçek device tx + iki receipt-block view her iki provider'da doğru; 6 read. Tek kayıt kopyası/çekirdek/hash kilidi ve 11 yasak istek kontrolü hazır; uzlaştırma çalışmadı. Primary blok erişimi mevcut; zorlanmış archive senaryosu ayrıca etiketlenecek. |
| 6.32 | `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_ACCEPTANCE` / PASS | İki bellek kopyası doğru blok/ücretle DEVICE_SETTLED; normal primary ve benzetilmiş hata + gerçek archive senaryoları ayrı geçti. 6 gerçek read + 2 benzetim; sıfır canlı yazım/imza/gönderim. 11 MPC kaydı aynı. |
| 6.33 | Ayrı runtime gate'i kaldırıldı / olağan kapanış | Kullanıcının sadeleştirme kararı. Çalışan private status aynı DEVICE_SETTLED kaydı döndürdü; Chrome hesap bağlı/upload kapalı. Eski sekme uyarısı sonrası kullanıcı Google ile yeniden girişte oynatmanın çalıştığını teyit etti; önceki 1080p/reload kabulü korunuyor. Açık oynatma hatası veya yeni gate yok. |
| Ayrı kart/üretim kapsamı | `NEAR_AUTH_PROVIDER_WRITTEN_CONFIRMATION` / açık dış teyit | Kart iş modeli, ülke/payout, üretim erişimi ve kalemli fiyat teyitleri; hesap bağlama soruları V1 kapsamından çıkarıldı. İleti veya başvuru kendiliğinden yapılmaz. |
| 7 | Production hazırlığı ve korumalı yayın | Onaylı provider ayarları, gerçek dağıtım ortamı, operasyon bütçesi ve mahremiyet kararı doğrulanır; exact SHA → CI → deploy → runtime kabulü izlenir. |

Compact boyut/uyumluluk çalışması kaynakta tamamlandı; yerel başarı canlı
kabul değildir. Publication sorgu düzeltmesi ve önceki creator playback/reload kabulü korunur. V1'in üç kaynak engeli yerelde kapandı; Google ve passkey gerçek kabul sonuçları üstteki güncel durumda ve ilgili raporlardadır. Eski denemenin uzlaştırması ayrı açıktır.
Kimliği değiştiren alternatif bir tenant/guard’a sessizce geçilmez.

## Tarihsel süre düzeltmesi kapsamı — kaynak gate’i tamamlandı

Amaç: geçerliliğini yitirmiş onay veya quote için yeni ücretli işleme
başlamamak. Aynı var olan kontrolleri tamamla; yeni servis/dependency veya genel
auth refactor'ı ekleme.

İzinli uygulama dosyaları: `apps/web/lib/near-auth-signing-server.ts`,
`apps/web/lib/near-auth-signing.ts`, `apps/web/lib/near-auth-upload-server.ts`,
`workers/livepeer-bridge/src/index.ts`; yalnız ilgili mevcut
`near-auth-signing-server.test.ts`, `near-auth-signing-client.test.ts`, gerekirse
`near-auth-upload-wallet.test.ts` ve Bridge `src/index.test.ts` testleri, bu belge.
Kontrat/ABI, WalletProvider, cihaz deposu, paketler, provider/config, release
ve canlı veriler kapsam dışıdır.

1. Ortak imza sunucusunda son zincir sorgusundan sonra doğrulanmış token ve
   inceleme son zamanını denetle; istemciye geçerlilik bilgisini aktar.
   Sponsor hesabı/cihaz beklemesinden sonra yeniden denetle; bu metadata'yı
   cüzdana işlem alanı olarak gönderme. İmza baytları aynen kalır.
2. Google upload ön kontrolüne ve ortak Bridge relay'in **yeni gönderim**
   kontrolüne quote'in geçerli blok aralığını ekle. Mevcut job/transaction
   uzlaştırmasını, toleransı ve kontratın son otoritesini koru.
3. Mevcut testlerde zaman/blok ilerlet: token ve inceleme sorgu/hesap beklemesinde
   sona ererse sponsor çağrısı **sıfır**; quote son bloğu aşılmışsa yeni sponsor
   veya relay gönderimi **sıfır**; geçerli sınır ve mevcut sonuç uzlaştırması
   çalışır. Normal cüzdan upload yolu da ortak Bridge testiyle korunur.
4. `docs/testing.md` komutlarıyla Web unit, auth tip kontrolü, lint; Bridge unit
   ve check çalıştır. Web build'i çalışan yerel sunucunun çıktısını bozmayan
   izole kopyada doğrula. Herhangi bir canlı imza/ödeme/deploy yapılmaz.

Bu düzeltme sponsor penceresinde kullanıcının ne kadar bekleyeceğini garanti
etmez. Sonraki canlı kabulde 60 saniyelik signing tokenı, en çok 120 saniyelik
quote, ayrı blok penceresi ve sponsor/MPC beklemeleri birlikte ölçülür. Geçmiş
saatle JWT doğrulamak veya süreyi gelişigüzel uzatmak çözüm kabul edilmez.

## Tarihsel canlı ve ürün kabulü koşulları — eski pilot bağlamı

Canlı Gate 4'te aynı hesap/sponsor/dosya/taslak ve mevcut Brave cihazı korunur.
Önce kesinleşmiş job ve bilinen sponsor işlem hash'leri uzlaştırılır; güncel
hesap, bakiye, cihaz, nonce, blok ve quote yeniden okunur. Eski bütçe/izin yeni
işleme taşınmaz; güncel kesin tutar ve sınır kullanıcıya sunulur. İmzaları
kullanıcı verir. Belirsizlikte tekrar ödeme, yeni job veya provider asset yoktur.

Her adım için kimlik verisi içermeyen aşama, süre, kalan onay/quote zamanı,
blok sınırı ve işlem/job sonucu kaydedilir. JWT, subject, cookie veya özel
anahtar tanılama kaydına konmaz. Tek kullanıcı pilotu başarı oranı/SLA kanıtı
sayılmaz. Auth0 formu, sponsor, relay, upload, yayın ve HLS hataları ayrılır.

Ürün gate'lerinde izleyici hedefi **giriş → bilet → izle**; creator hedefi
**giriş → dosya ve ücret incelemesi → yükle → izle** olur. Laboratuvarın hesap
ve sponsor panelleri son kullanıcıya aynen taşınmaz. Gas/hesap hazırlığını
platform karşılayacaksa önce sağlayıcının mevcut relayer hizmeti ve mevcut
Bridge sınırları değerlendirilir; aktör, izinli işlemler, kullanıcı/job başına
bütçe, tekrar koruması ve kötüye kullanım limiti belirlenmeden yeni servis yazılmaz.
Bu tarihsel pilot kapsamı kart ödemesi eklemiyordu. 22 Eylül ürün kararları
doğrudan kartı plana alır; kart uygulaması ve canlı kabul hâlâ ayrı gate'lerdir.

Bu tarihsel bölümdeki yöntemler arası hesap bağlama kabulü V1'den çıkarılmıştır.
Güncel passkey kabulü kendi kimliğiyle giriş → imza → yükleme/satın alma →
yetkili izlemedir. Mevcut cüzdan kullanıcıları kendi hesaplarıyla devam eder;
hesap birleştirme veya migration V1 şartı değildir. Cihaz yetkisi kontrolleri korunur.

Doğrudan Auth0 + v7 yaklaşımında issuer/audience, `fatxn`, türetim yolu ve MPC
cevabı uyumluluğunun sahibi YouTick'tir. Provider protokolü/paket değişiminde
mevcut token-cache, byte eşitliği, süre, ret ve boyut testleri yeniden koşulur.
Handoff fixture'ları tüm olası ID/JWT uzunluklarını kapsamaz; en uzun desteklenen
başlık/ID/claim birleşimi form, API ve MPC cevap sınırlarında birlikte ölçülür.
Mahremiyet kararı, işlem onay tokenındaki kimlik referansının zincirde kalıcı
görünmesini de kapsar; yeni tenant bu konuda kendiliğinden çözüm değildir.

## 17 Eylül mimari incelemesinin tarihsel kanıtı

- **LOCAL_TEST:** mevcut Web suite **46 dosya / 722 test PASS**;
  provider handoff **10 test PASS**. Yeni üç ağsız inceleme denemesi yukarıdaki
  iki kaynak boşluğunu yeniden üretti; düzeltme testi PASS anlamına gelmez.
  Denemeler repo dışında `/tmp/youtick-auth-review-gwp29w0n/` içindedir;
  gerçek RSA/JWT ve uygulama fonksiyonları, sahte zincir/sponsor kullanır.
- **LOCAL_STATIC:** `npm run test:near-auth-types`, doküman derlemesi/bağlantı
  kontrolü ve diff boşluk kontrolü PASS. VitePress'in 500 kB bundle uyarısı
  sürüyor. Başlangıçta hash'i alınan 360 dosyadan yalnız bu belge değişti;
  diğer 359 dosya aynı, yeni repo dosyası yok. İki alt ajanın son plan
  çapraz incelemesinde önemli çelişki bulunmadı.
- **PROVIDER / salt-okunur:** güncel resmî belgeler ve upstream kaynak okundu.
  Hosted Action yayını, bugünkü zincir/bakiye ve Brave durumu doğrulanmadı.
- **EXTERNAL_NOT_RUN:** gerçek Google/passkey/sponsor onayı, ödeme, upload,
  HLS, CI, Preview/Production, provider/config değişimi, dış mesaj, commit,
  push, PR, merge veya deploy. Kod değişmediği için yeni Web/Bridge build'i,
  Bridge/kontrat testleri ve tarayıcı kabulü çalıştırılmadı.

Bu, 17 Eylül incelemesinin engel kaydıydı. Compact kaynak ve süre düzeltmeleri
sonradan tamamlandı. Bugünkü açık noktalar belgenin güncel durum bölümündedir;
aşağıdaki eski form yaması güncel compact yol için zorunlu ön koşul değildir.

## 16 Eylül gate kayıtları

Aşağıdaki sonuçlar tarihsel kanıttır. Yeni değerlendirme ve tek sonraki gate
yukarıdadır; geçmiş PASS sayıları bugünkü canlı kabul gibi okunmaz.

## Gate 1: sağlayıcı düzeltme paketi

Gate: `NEAR_AUTH_PROVIDER_PROMPT_HANDOFF`.
Yerel sonuç: **COMPLETED_WITH_WARNINGS**. Paket ve testler tamamlandı;
sağlayıcıda uygulanmış düzeltme ve canlı Google upload kabulü **UNPROVEN**.
Sağlayıcı yöneticisi/erişimi belirlenmiş değil. Paket dışarı gönderilmedi.

- Teslim paketi ve temiz kurulum: `scripts/near-auth-provider-handoff/README.md`
- Tek satırlık sağlayıcı yaması: `docs/architecture/near-auth-prompt-size.patch`
- [İlk hata analizi ve sentetik ölçüm](./near-auth-prompt-size.md)
- [Yerel test komutları](../testing.md#near-auth-provider-handoff-isolated-synthetic)

Sabit kaynak: Peersyst/fast-auth
`38dc894afbc94c198c207f52e6d01d695199eaa1` içindeki
`packages/auth0/src/actions/authorize-app.action.js`.
Kaynak SHA-256:
`9476e322b93d1c0059bd27453295256b16476d7ce51ce362570b81cb476b631b`.

Sağlayıcının onay formu, işlem argümanlarını girintili JSON ile büyütüyor.
Yama yalnız bu girintiyi kaldırıyor; imzalanan baytları, alanları veya yetki
kurallarını değiştirmiyor. [Auth0 alan sınırı 24 KB](https://auth0.com/docs/customize/forms/render).
Bu rapor çalışan sağlayıcının hangi kaynak sürümünü kullandığını doğrulamaz.

**LOCAL_TEST:** 10 test geçti. Gerçek yama `git apply --check` ve `git apply`
ile geçici kaynak kopyasına uygulandı; orijinal/yama/sonuç hash'leri doğrulandı.
Gösterilen bütün değerler, `fatxn` baytları, büyük sayı hassasiyeti, kullanıcı
reddi ve yanlış signing-audience reddi korundu. Testlerde ağ çağrısı yok.

Teslim arşivi yalnız altı açıkça seçilmiş dosyayı içerir. Çalışma alanı dışındaki
temiz bir dizine açılıp kendi lockfile'ıyla kurulduğunda aynı 10 test geçti;
uygulama veya eski `tmp/near-auth-spike` kurulumu kullanılmadı. Paket ve kanıt:
`tmp/near-auth-provider-handoff-gate1/near-auth-provider-handoff.tar.gz`,
`tmp/near-auth-provider-handoff-gate1/evidence/result.json`.

**LOCAL_STATIC:** doküman derlemesi, bağlantılar ve diff boşluk kontrolü geçti.
VitePress'in 500 kB üstü bundle uyarısı sürüyor; bir link/build hatası değil.
Başlangıçtaki kapsam dışı 60 dosyanın SHA-256 değerleri değişmedi.

| Sentetik başlık | Delegate: önce → sonra | Normal işlem: önce → sonra |
| --- | ---: | ---: |
| Temsilî | 27.052 → 7.055 | 27.023 → 7.026 |
| 200 bayt ASCII | 29.358 → 7.571 | 29.329 → 7.542 |
| 200 bayt Türkçe | 29.564 → 7.777 | 29.535 → 7.748 |
| 200 bayt kaçış karakterli | 36.289 → 9.222 | 36.260 → 9.193 |

Ölçümler UTF-8 ile bütün prompt seçenekleri içindir; Auth0 sınırı yerelde
taklit edilir. Gerçek kullanıcı payload'ı veya sağlayıcı kabulü değildir.
Önceki 27.101 → 7.104 ölçümü yer tutucu quote ID kullanıyordu; yeni fixture
her başlık için canonical quote ID'yi hesaplar. Ölçüm farkının nedeni budur.
Fixture quote imzası yine sentetiktir; geçerli canlı teklif sayılmaz.

## Gelinen aşama ve tarihsel kanıtlar

| Konu | Son kayıt / anlamı |
| --- | --- |
| Google giriş ve reload oturumu | [Oturum raporunda](./near-auth-session-restore.md) önceki gerçek kabul kayıtlı. Bu gate yeni giriş yapmadı. |
| Hesap ve basit Google/MPC imzası | [İmza raporunda](./near-auth-google-signing-lab.md) önceki başarılı zincir işlemi var; upload kabulü değildir. |
| Localhost CORS | [Runtime raporunda](./near-auth-google-upload-local-runtime.md) 16 Eylül OPTIONS 204 kayıtlı; ilk kaynak raporundaki engel tarihsel. Bugünkü CORS yeniden sorgulanmadı. |
| Google hesabının USDC hazırlığı | [RPC raporunda](./near-auth-upload-rpc-fix.md) blok 268880300: 600000 mikro test USDC, aynı taslak için ücretli iş yok. Güncel bakiye veya tekrar fonlama talimatı değildir. |
| 16 Eylül Google upload hatası — tarihsel | `access_denied`, 24576 bayt prompt sınırı. Sonraki compact kaynak ve taslak gate’leri bu kaydın üstüne ilerledi. |
| Brave | [Çökme raporu](./near-auth-brave-sponsor-crash.md) ayrı bir kararlılık sorunu; prompt yamasının bunu çözdüğü iddia edilmez. |
| Upload / creator playback / reload | Bu Google pilotunda canlı kabul henüz yok. |

Güncel uygulama doğrudan Auth0 SPA SDK, jose ve `near-api-js` v7 kullanıyor.
Eski Browser/React SDK ve v5 uyarlama önerisi güncel uygulama planı değildir.
NEAR ekonomik/erişim otoritesi, Bridge kontrol katmanı, Livepeer medya katmanı
olarak kalır. Pilot aynı Google hesabı, sponsor, dosya/taslak ve mevcut Brave
profilini kullanır; ilk cihaz sınırı korunur.

## Gate 2: yerel yükleme güvenliği

Gate: `NEAR_AUTH_UPLOAD_SAFETY` — **COMPLETED_WITH_WARNINGS**.
[Değişiklikler, kanıtlar ve salt-okunur işlem uzlaştırması](./near-auth-upload-safety.md).
Doğrulanmış token süresi sponsor çağrısından önce yeniden denetleniyor;
belirsiz işlem kayıtları korunuyor. Google pilotunda ücretli işin kayıp/geçersiz
upload anahtarı değiştirilmeden duruluyor; mevcut cihaz yetkisi aranıyor.
Sponsor görünürlüğü ve fonlama panelinin ortak meşguliyet kilidi tamamlandı.

**LOCAL_TEST:** 46 dosya / 710 test PASS. **LOCAL_STATIC:** sıkı auth tip
kontrolü, lint ve ayrı kaynak kopyasında Web build PASS. Derleme uyarıları ve
canlı kabul sınırları gate raporunda kayıtlı. Sağlayıcı yayını **UNPROVEN**;
bu sonuç yeni canlı imza/ödeme veya Gate 3'e otomatik geçiş değildir.

## Gate 3: Google hesabıyla mevcut V2 oynatıcı

Gate: `NEAR_AUTH_CREATOR_PLAYBACK_SOURCE` — **COMPLETED_WITH_WARNINGS**.
[Kaynak, oturum sınırları ve yerel tarayıcı kanıtı](./near-auth-creator-playback.md).
Ortak oynatıcı Google lab'e bağlandı. Job bağlantıları ve redirect dönüşü
lab içinde kalır. Creator sahipliği ve mevcut V3 cihaz doğrulanır;
logout/401/hesap değişiminde sekmelerdeki oynatma durur, cihaz anahtarı korunur.

**LOCAL_TEST:** 722 unit test; ayrı Brave bağlamında 15 Google-lab senaryosu
ve normal cüzdan yolunun 5 mevcut senaryosu PASS. **LOCAL_STATIC:** auth
tip kontrolü, lint ve izole Web build PASS. Tarayıcı testlerinde kimlik,
zincir, token yanıtı ve medya surface'i sahtedir; gerçek HLS kabulü değildir.

## Gate 4: canlı kabul ön kontrolü — BLOCKED

Gate: `NEAR_AUTH_LIVE_ACCEPTANCE_PREFLIGHT`.
[Güncel salt-okunur kontroller ve devam koşulu](./near-auth-live-acceptance-preflight.md).
Sağlayıcı düzeltmesinin yayın kanıtı hâlâ **UNPROVEN**. Upstream dosya
16 Eylül 19:53 UTC kontrolünde eski biçimlendirmeyi içeriyor; bu gözlem
barındırılan Action sürümünü tek başına belirlemez. Keşif servisi HTTP 200.
Mevcut lab sekmesi giriş istiyor; aynı taslak final blok 268892356'da
henüz ücretli işe dönüşmemiş. Kurulu Brave 1.95.101; profilin gerçek
sponsor-pencere kararlılığı doğrulanmadı. Canlı imza/ödeme başlatılmadı.

Bu tarihsel ön kontrol mevcut büyük mesajın sağlayıcı yamasını bekliyordu.
Kısa mesaj yolu seçildiğinde bu yama zorunlu ön koşul değildir; uyumlu
Web/Bridge/Market yayını ve gerçek Google/MPC kabulü gerekir. Yerel süre
ve UX gate'leri tamamlandı. Güncel sıra bu belgenin üstündedir.

## Gate 1 sınırları ve tarihsel değişiklik kaydı

Gate 1 yalnız `scripts/near-auth-provider-handoff/` test paketini, bu durum
belgesini, prompt raporundaki kalıcı test bağlantısını, dört eski rapordaki
tarihsel notları ve `docs/testing.md` test komutunu kapsar. Mevcut sağlayıcı
yaması korunmuştur. Uygulama bağımlılıkları/kodu, cüzdan/cihaz depoları ve
çalışan yerel Web build'i değiştirilmedi.

**EXTERNAL_NOT_RUN:** yeni Google/sponsor onayı, ödeme, upload, playback,
provider değişikliği, dış iletişim, CI veya deploy. Commit/push/PR yapılmadı.
Uygulama kodu değişmediği için Web/Bridge/kontrat testleri ve build tekrar
çalıştırılmadı; önceki sonuçlar bu gate'in yeni testi gibi sunulmaz.
