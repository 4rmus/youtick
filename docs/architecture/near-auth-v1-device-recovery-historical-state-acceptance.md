# NEAR Auth V1 — tarihsel cihaz kanıtı kabulü

26 Eylül 2026 · `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_ACCEPTANCE`

**PASS — yalıtılmış çekirdek + gerçek testnet okumaları.** Gerçek cihaz
operation'ının iki ayrı bellek kopyası `DEVICE_SUBMITTED` başlangıcından
doğru receipt bloğu ve ücretle `DEVICE_SETTLED` sonucuna ulaştı. Birinci
senaryo tamamen gerçek sağlayıcı yanıtlarıyla, ikincisi açıkça benzetilmiş
primary view hatası ve gerçek arşiv kanıtıyla geçti. Canlı kayıt yazımı yok.

## Kapsam ve başlangıç

[Kabul ön kontrolündeki](./near-auth-v1-device-recovery-historical-state-acceptance-preflight.md)
paket değiştirilmeden özel çalışma dizinine kopyalandı. Kaynak/bağımlılık
girdilerinin 43 hash'i, çekirdek, runner ve kayıt hash'leri doğrulandı.
Yalnız `reconcileDevice` dışa açık; `mpcStatus`, Web/private binding veya
çalışan yerel servisin uçtan uca kabulü değildir. Kurulu ve lock
near-api-js sürümleri Web/Bridge için 7.3.0 olarak doğrulandı.

Canlı actor'ın sabit, immutable/read-only kopyasındaki gerçek cihaz
kaydı, paket kaydıyla tam eşleşti. **11 MPC kaydı önceki kanıtla aynı**;
aktif kilit yok. Gerçek kayıt zaten `DEVICE_SETTLED` idi. Yalnız bellek
kopyalarında durum `DEVICE_SUBMITTED` yapıldı ve önceki settlement
alanları kaldırıldı. Canlı kayıt geri alınmadı.

Hesap eski Google `29445f46…72324c`; operation
`d1305aebe4ebb69254d59a7e3e25c4b304ecb5b914695ae90fd7d142e52fe5cd`.
Gerçek `activate_playback_device` işlemi
`EEXUdVYF5uJAjP5TaE9GRu8DvrsnV1f3Fhx6kW5pK3uw`, Market receipt bloğu
`8wvDuNsBevuhRKpHuxr4YYTogAoBV2RP5QfsryGYJ8P7`.
Eski ticket kontrol örneği kullanılmadı.

## İki ayrı sonuç

| Senaryo | Okuma kanıtı | Sonuç |
|---|---|---|
| `acceptance-natural` | Primary'den gerçek tx/FINAL ve aynı receipt bloğunda iki view; üç HTTP 200 | DEVICE_SETTLED; tek bellek yazımı; doğru blok ve orijinal ücret |
| `acceptance-forced-archive` | Gerçek primary tx/FINAL; iki primary view için benzetilmiş UNKNOWN_BLOCK; gerçek arşivden aynı blokta iki HTTP 200 view | DEVICE_SETTLED; tek bellek yazımı; doğru blok ve orijinal ücret |

Toplam **6 gerçek salt-okunur ağ isteği + 2 benzetilmiş hata**.
Benzetilmiş primary view hataları ağa gönderilmedi. Her senaryoda tx
primary'den başarılı geldi; transaction arşiv fallback'i bu tur
tetiklenmedi. Normal senaryoda view arşivine başvurulmadı; zorlanmış
senaryoda her view için tam bir arşiv isteği oluştu.

Güncel kaynak FINAL/exact işlem, signer/receiver/public key/nonce/action/
args/gas/deposit ve bütün receipt'leri kontrol etti. Tarihsel view'larda
aynı block hash, hak, cihaz key/certificate/authorizer ve 30 günlük süre
şartları geçti. Yeni terminal kayıt, orijinal kayıtla aynı `innerBurntYocto`
ve `settledBlockHash` taşıdı; diğer alanların değişmediği tam karşılaştırıldı.
Bu ücret geçmiş işlemin kanıtıdır; yeni bir ücretli işlem yapılmadı.

Kopya storage yalnız seçilen operation key'ini kabul eder. Her senaryoda
tek terminal bellek yazımı zorunludur; canlı actor, nonce, sayaç veya
user pointer'a erişim yolu yoktur. **Canlı yazım 0, yeni imza 0, yeni
broadcast 0.** Güncel oynatma/expiry yetkilendirmesi bu tarihsel
settlement testinden ayrı kalır.

## Doğrulama ve korunma

`check` modu ağ kullanmadan yeniden geçti: 11 yasak istek kontrolü,
iki sabit endpoint üzerinde üç exact izinli sorgu. Her endpoint/istek
çifti en fazla bir kez; her modda en fazla 6 girişim, gerçek okumada
15 s / 262144 byte ve view'da 4096 byte sınırı korundu. Kaynak kodu,
çekirdek veya runner değiştirilmedi.

Kabul sonrası kontrol zamanı **2026-09-26T14:16:15.766Z**.
Actor kopyaları WAL yokken ve kopyalama sırasında baytlar sabitken
alındı; SQLite integrity `ok`. **11 MPC kaydı, beş runtime/config
dosyası, 43 paket girdisi ve index aynı.** Repo kapsamında yalnız
bu rapor ve `near-auth-integration-status.md` değişti. Doküman build
ve kapsam/diff kontrolü PASS; mevcut 500 kB bundle uyarısı sürer.

Kaynak değişmediği için Web/Bridge test paketleri tekrar çalıştırılmadı;
önceki 598 Bridge / 1038 Web sonucu bu gate'in yeni kanıtı değildir.
Servis yeniden başlatılmadı; tarayıcı, config, private key ve oturum
verisine müdahale edilmedi.

**LOCAL_STATIC / LOCAL_TEST:** hash kilitleri, 11 ağ koruması, iki
benzetilmiş pending başlangıcı, iki tek-terminal bellek yazımı ve
korunma kontrolleri. **PROVIDER:** altı gerçek tx/view okuması ve
kaynak tarafından doğrulanan zincir kanıtı. Zorlanmış primary arızası
yerel benzetimdir; arşiv yanıtları gerçektir.

**EXTERNAL_NOT_RUN:** Chrome/Web/private binding kabulü, canlı pending
state geçişi, runtime restart, yeni ödeme/cihaz/yükleme, CI/deploy.
**UNPROVEN:** doğal sağlayıcı geçmiş-blok kaybından cihaz kurtarma,
gerçekte 30 gün gecikmiş cihaz, çalışan runtime ve hosted kabulü.
Dar kabul kapsamında blocker yok.

## Faz kapanışı

26 Eylül'de kullanıcı, gereksiz gate zincirini kaldırıp kısa bir uygulama
kontrolüyle fazı kapatmayı onayladı. Ayrı
`NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_RUNTIME_VERIFICATION`
gate'i kaldırıldı. Yeni rapor veya kaynak işi açılmadı.

Çalışan private Bridge'e mevcut salt-okunur status aracıyla tek kontrol:
aynı operation ve inner/outer hash'ler, `DEVICE_SETTLED`, purpose `device`,
amountUsdc `0`. Geçici bağlantı kapatıldı. Bu terminal kayıt okuması,
tarihsel fallback'in çalışan süreçte yeniden yürütülmesi değildir.
Canlı actor dosyasının hash'i ve index kontrol öncesi/sonrası aynı kaldı.

Mevcut Chrome upload sekmesinde eski Google hesabı bağlı, upload ödemeleri
kapalı görünüyor. Açık izleme sekmesinde “Video şu anda oynatılamıyor.
Tekrar dene.” uyarısı gözlendi. Sayfa yenilenmedi, yeniden oynatma veya
işlem onayı denenmedi; uyarının nedeni bu dar kapanışta araştırılmadı.
Ardından kullanıcı eski açık sekmenin önceki işlemden kaldığını,
Google hesabıyla yeniden giriş yapıp videoyu açınca oynatmanın
çalıştığını teyit etti. Uyarı artık açık oynatma hatası olarak izlenmiyor.
[Önceki cihaz kabulü](./near-auth-v1-device-recovery-acceptance.md)
1920×1080 tam oynatma ve iki reload'u `error:null` ile zaten kaydetmişti.
Güncel çalışır durum kullanıcı teyididir; bu tur yeni otomatik oynatma
testi yapılmadı. Oturum/yenilenmemiş sekme açıklaması makul kullanıcı
değerlendirmesidir; kesin kök neden olarak ölçülmüş değildir.

**Cihaz kurtarma geliştirmesi kapalı — PASS.** Yeni imza/ödeme/yükleme,
servis restart veya deploy yok. Doğal uzun süreli kullanım ve production
kabulü kendi gerçek kapsamlarında değerlendirilir; yeni gate başlatılmaz.
Kapanış kanıtı:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-closeout-uviztycw/`.

Kanıt dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-history-acceptance-wb_wk3fl/`.
`acceptance-natural-safe.json`, `acceptance-forced-archive-safe.json`,
`acceptance-summary-safe.json`, paket/hash dosyaları ve actor kopyaları
buradadır. Ön kontrol kanıtları ayrı dizinde korunur.
