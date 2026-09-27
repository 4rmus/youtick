# NEAR Auth V1 — tarihsel cihaz kanıtı kabul ön kontrolü

26 Eylül 2026 · `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_ACCEPTANCE_PREFLIGHT`

**PASS — yalıtılmış kabul için GO.** Gerçek cihaz işlemi ve onun
receipt bloğundaki hak/cihaz kanıtı iki sağlayıcıdan da okundu. Kaynak
hash'lerine bağlı kabul paketi hazır; uzlaştırma çekirdeği bu gate'te
çalıştırılmadı. Doğal geçmiş-blok kaybı veya canlı kurtarma kabulü değildir.

## Kapsam ve başarı ölçütü

Yalnız bu rapor ve ana plan değişir. Kaynak/test, paket/lock, kontrat,
runtime/config, tarayıcı, oturum ve canlı actor değişmez. Yeni imza,
cihaz ekleme, ödeme/yükleme, servis restart veya deploy yoktur.
`youtick-near-auth` ve `near-api-js` yönergeleri izlendi.

Başarı ölçütü: mevcut cihaz kaydının imza/payload bağını doğrulamak,
doğru işlem bloğundaki kanıtın erişilebilirliğini ölçmek ve canlı
storage'a erişmeyen, yalnız izinli okumaları yapan somut kabul paketi
hazırlamak. Web/Bridge near-api-js lock ve kurulu sürümleri **7.3.0**;
Web manifest aralığı `^7.0.3`, Bridge manifest pini `7.3.0` olarak korunur.

## Seçilen gerçek kayıt

| Alan | Değer |
|---|---|
| Hesap | Eski Google hesabı `29445f46…72324c` |
| Operation | `d1305aebe4ebb69254d59a7e3e25c4b304ecb5b914695ae90fd7d142e52fe5cd` |
| Mevcut durum | `DEVICE_SETTLED` |
| İşlem | `EEXUdVYF5uJAjP5TaE9GRu8DvrsnV1f3Fhx6kW5pK3uw` |
| Market receipt bloğu | `8wvDuNsBevuhRKpHuxr4YYTogAoBV2RP5QfsryGYJ8P7` |
| Action | `activate_playback_device`, 100 Tgas, 1 yoctoNEAR |

Bu gerçek cihaz işlemidir; eski ticket kontrol örneği kullanılmadı.
Actor'ın sabit kopyasından yalnız bu operation seçildi. Payload SHA-256,
işlem hash'i, decode/encode eşitliği ve hesabın public key'iyle Ed25519
imzası yerelde doğrulandı. Özel anahtar, JWT, cookie veya Keychain
gerekmedi. Canlı kayıt terminal olduğu için gerçek bir pending geçişi
taklit edilerek canlı storage'a yazılmayacak.

## Taze sağlayıcı kontrolü

Kontrol bitişi **2026-09-26T14:10:11.542Z**. Altı gerçek salt-okunur
istek; yapay hata eklenmedi ve otomatik tekrar yapılmadı.

| Okuma | Primary | Sabit testnet arşiv |
|---|---|---|
| Aynı hash/sender ile `tx / FINAL` | 200; exact işlem ve receipt doğru | 200; exact işlem ve receipt doğru |
| Receipt bloğunda `has_entitlement` | 200; blok eşleşiyor, true | 200; blok eşleşiyor, true |
| Receipt bloğunda `get_playback_device` | 200; key/certificate/authorizer doğru | 200; key/certificate/authorizer doğru |

İşlem nonce, tek action, args, gas, deposit, signer/receiver/public key,
başarı durumu, bütün receipt'ler ve mevcut ücret üst sınırı doğrulandı.
İki cihaz yanıtı aynı yetkilendirme ve bitiş tarihini taşıyor:
**26 Eylül 08:13:00.081 UTC → 26 Ekim 08:13:00.081 UTC**;
fark tam **2592000000 ms**. Yanıt blokları receipt bloğuyla aynı.

[NEAR contract RPC belgesi](https://docs.near.org/api/rpc/contracts)
`call_function` için `block_id` kullanımını destekler. Bu pakette güncel
`finality` sorgusuna veya başka bloğa geçiş yasaktır. Bugünkü cihazın
geçmiş bloğu primary'de hâlâ erişilebilir; bu nedenle bu ölçüm doğal
`UNKNOWN_BLOCK → archive` geçişi veya 30 gün gecikme kanıtı değildir.

## Hazır kabul paketi

Geçici özel dizin:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-history-acceptance-preflight-n1i6lxke/`.

- `record.json`: tek gerçek terminal operation kopyası. Canlı actor'a
  yazma bağlantısı yok.
- `core.cjs`: mevcut kaynak esbuild ile derlendi; yalnız
  `reconcileDevice` dışa açıldı. Repo dosyası düzenlenmedi. `mpcStatus`,
  Web oturumu veya private binding uçtan uca kabulü değildir.
- `manifest.json`: kaynak/bağımlılık girdileri (**43 dosya**), çekirdek,
  kayıt ve runner hash'leri sabit. Değişiklikte paket çalışmayı reddeder.
  `acceptanceReady:true`, bu dar test için hazırlık sonucudur; kendi
  başına sonraki gate'i başlatmaz.
- `acceptance.mjs`: yalnız iki sabit endpoint üzerinde üç exact isteğe
  izin verir. Her endpoint/istek çifti en fazla bir kez; çalışma başına
  en fazla **6 istek**, her gerçek istek **15 s / 262144 byte** sınırlı.
  View sonucu ayrıca **4096 byte** ve doğru blok/kanıt şartına bağlıdır.
- `check` modu: **11 yasak istek kontrolü PASS**, 6 izinli çift, ağ 0,
  uzlaştırma 0. Broadcast/send, başka host/hash/hesap/Market/args,
  finality, başka blok/yöntem ve access-key sorgusu reddedilir.
- `probe` modu: yukarıdaki altı kanıtın bağımsız okunmasıdır; uzlaştırma
  fonksiyonunu çağırmaz. Sonuç `probe-safe.json` içindedir.

Kabul modlarının hazırlık tamamlanmadan `preflight_not_ready` ile
reddedildiği de kontrol edildi. Hazırlık sonrasında yalnız `check`
tekrar çalıştırıldı. Kabul sonuç dosyaları oluşmadı.

## Tek sonraki gate'in somut kapsamı

**`NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_ACCEPTANCE` — başlatılmadı.**
İki ayrı, açıkça etiketli senaryo:

1. `acceptance-natural`: gerçek operation'ın yalnız bellek kopyası
   `DEVICE_SUBMITTED` başlatılır; önceden yazılmış settlement alanları
   kopyadan kaldırılır. Gerçek primary/arşiv yanıtlarıyla kaynak
   `DEVICE_SETTLED` üretmeli. Tek operation key'ine yalnız bir bellek
   yazımı ve orijinal receipt bloğu/gerçek ücretle tam eşleşme aranır.
2. `acceptance-forced-archive`: aynı bellek kopyasında yalnız primary'nin
   iki tarihsel view yanıtına açıkça benzetilmiş `UNKNOWN_BLOCK`
   verilir. Transaction ve arşiv view yanıtları gerçek ağdan gelir.
   İki arşiv view'ı ve tek doğru terminal yazımı zorunludur. Bu karma
   test, doğal sağlayıcı arızası diye raporlanmaz.

Her mod en fazla 6 okuma girişimi; birlikte en fazla 12. Zorlanmış
senaryonun iki primary view girişimi ağ isteği değildir ve ayrı sayılır.
Başarısız kanıtta yeni gönderim, farklı blok, yeni hesap veya yeniden
imza yoktur. Canlı nonce/sayaç/user pointer'a erişim verilmez. Canlı
11 kayıt ve config hash'leri kabul öncesi/sonrası tekrar karşılaştırılır.
Servis yenilemesi bu dar çekirdek kabulünün parçası değildir.

## Korunma, doğrulama ve sınırlar

Başlangıç/son actor kopyaları WAL yokken, kopyalama boyunca baytlar
sabitken alındı; immutable/read-only SQLite integrity **ok**. **11 MPC
kaydı aynı**, aktif kilit yok. Beş runtime/config dosyası ve index aynı;
repo farkı yalnız rapor/plan. Kaynak, test ve SDK dosyaları değişmedi.

Önceki runtime raporunda belirtilen bundle yolunun bugünkü source map'i
yeni tarihsel view kaynağıyla eşleşiyor ve `readHistory` içeriyor.
Bu dosya gözlemi, önceki rapordaki “yeni kaynak yüklenmedi” varsayımını
güncel runtime kanıtı olarak kullanmaya izin vermez. Dosyanın hangi
anda yeniden üretildiği bu gate'te belirlenmedi. Servisler yeniden
başlatılmadı; dosya eşleşmesi çalışan süreçte yolun çalıştığını veya
runtime kabulünü kanıtlamaz. Canlı yüklenmiş sürüm ayrıca doğrulanmalıdır.
Güncel oynatma `verifyMarketDeviceProof` expiry/key denetimleri ayrı
kalır; tarihsel settlement bugünkü oynatma hakkı yerine geçmez.

**LOCAL_STATIC / LOCAL_TEST:** payload/imza, tek-export derleme,
hash kilitleri, 11 ağ koruması, kapalı kabul modu, korunma kontrolleri
ve doküman build PASS. Mevcut doküman 500 kB bundle uyarısı sürer.
Kaynak değişmediğinden önceki 598 Bridge / 1038 Web testleri yeniden
çalıştırılmadı; bu tur yeni test sonucu olarak sunulmaz.

**PROVIDER:** 6 gerçek salt-okunur erişim ve exact kanıt doğrulaması.
**EXTERNAL_NOT_RUN:** kabul modları, tarayıcı, canlı state geçişi,
imza/ödeme/yükleme, runtime yenileme, CI/deploy.
**UNPROVEN:** doğal geçmiş-device blok kaybından kurtarma, 30 gün
gecikme, canlı pending actor ve hosted/runtime kabulü.

Tanımlı yalıtılmış kabul için blocker yok. Bu sınırlarla ön kontrol
tamamlandı; yalnız yukarıdaki tek kabul gate'i sıradadır.
