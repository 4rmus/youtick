# Player V2 — genel kabul ön hazırlığı

## Nihai kullanıcı kabulü — 15 Eylül 2026

**Player V2 mevcut kapsamı: COMPLETED_WITH_WARNINGS / CLOSED.** Kullanıcı, ölçüm sınırlarını tekrar test şartı olmaktan çıkarmayı ve native HLS, fiziksel telefon/dokunma, kare video ve ek önizleme senaryolarını sonraki sürüme bırakmayı açıkça kabul etti. Bu maddeler mevcut kapsamın kapanmasını engellemez; teknik olarak doğrulanmamış sonuçlar **UNPROVEN** kalır.

Mevcut uygulama, public-testnet yayını ve kaydedilmiş masaüstü kabul kanıtları esas alınmıştır. Safari'nin bağımsız kesintisiz ilerleme/20 sarma ölçümü eksikliği, kısa duraksamalar, analiz bağlantısı uyarıları ve video bittikten sonraki 7841 ms yenileme kaydı korunur. Bunlar bu kapanışta yeni ölçüm veya optimizasyon zorunluluğu değildir; hata nedenlerinin tamamı çözülmüş veya bütün testler geçmiş sayılmaz. Önceki 10 Mbps ve 8,02 saniye başlangıç süresi kullanıcı kabulleri geçerlidir.

Telefon/dokunma, native HLS, kare kaynak ve ek önizleme kontrolleri **kullanıcı kararıyla ertelendi**; bu kayıt yeni sürüm çalışmasını otomatik başlatmaz. Provider'ın kesin ek fatura tutarı ve tarihsel anahtar kaybının nedeni hakkında yeni bir doğrulama iddiası yoktur. Production/mainnet hazırlığı veya tüm cihazlarda uyumluluk sonucu çıkarılmaz.

**Aktif uygulama gate'i kalmadı.** Bu karar yalnız mevcut Player V2 kapsamını kapatır; yeni test, imza, ödeme, cihaz işlemi, kod değişikliği veya dağıtım gerektirmez. Aşağıdaki “genel kabul açık” ve “sonraki gate” ifadeleri önceki tarihlere ait durumlardır; nihai durum bu bölümdür. Bu bölüm kullanıcının nihai kapsam ve kapanış kararını kaydeder.


## Güncel Safari sonucu ve yayın durumu — 15 Eylül 2026

**PLAYER_V2_RPC_SAFARI_ACCEPTANCE — COMPLETED_WITH_WARNINGS.** Safari/Mac, mevcut `utick2.testnet` cihazı ve M2 trace biletiyle video doğal olarak sona ulaştı. SDK play→ended aralığı **600,682 saniye**; oynarken dört doğal yenileme **530 / 625 / 1065 / 634 ms** içinde tamamlandı. Önceki `playback_authorization_unavailable` hatası bu koşuda gözlenmedi; tüm geçmiş kesintilerin çözüldüğü sonucu çıkarılmaz.

Konsol odağı kararsızdı; bazı ölçüm komutları video kısayollarına ulaştı. Son bağımsız ilerleme sayacı alınamadığı için **kesintisiz 600 saniye gerçek video ilerlemesi ve 20 planlı sarma doğrulanmış sayılmaz**. Kısa `stalled` kayıtları ve Livepeer analiz/raporlama bağlantı uyarıları korundu. Video bittikten sonraki beşinci yenileme **7841 ms** sürdü ve başarılı oldu; nedeni belirlenmedi. Belgeleme onayı bu gecikmeyi kabul edilmiş performans istisnasına dönüştürmez.

Kanıtlar ayrı tutulur: LOCAL_TEST — 23 test, TypeScript ve lint geçti. [PR #208](https://github.com/4rmus/youtick/pull/208), main `74887782617f8b69ab6b11a095212f2e7e7c8b3e` sürümüne birleşti. [Main CI](https://github.com/4rmus/youtick/actions/runs/34981949868) ve [korumalı public-testnet dağıtımı](https://github.com/4rmus/youtick/actions/runs/34983610788) başarılı. Mevcut `acceptance` yapılandırması korundu; dağıtım anahtarı tekrar kapatıldı. Public-testnet dağıtım/sağlık kanıtı Safari kabulünün yerine geçmez; production/mainnet sonucu çıkarılmaz. Bu belge turunda test veya dağıtım tekrarlanmadı.

Geçici gözlemci sayfa yenilemesiyle kaldırıldı; duraklatılmış video ve bağlı hesap doğrulandı, ana sayfaya dönüldü. Safari koşusunda yeni imza, ödeme, cihaz kaydı veya upload yapılmadı. Kanıtlar: `tmp/player-v2-rpc-safari-acceptance-20260915/{receipt.json,closeout.md}` ve `tmp/player-v2-rpc-deploy-20260915/closeout.md`.

Genel kabul **açık**: bağımsız Safari ilerleme/sarma ölçümü, native HLS, fiziksel telefon ve kare kaynak eksikleri kapanmadı. Kabul edilmiş 10 Mbps ve 8,02 saniye başlangıç süresi yeniden açılmaz. **Tek sonraki gate: PLAYER_V2_ACCEPTANCE_DOCS_PUBLICATION** — güncel main ile uzlaştırılan üç belgeli adayı commit/push ve PR ile yayımlamak. Bu kayıt commit/push veya yeni canlı işlem başlatmaz. Aşağıdaki önceki sonuçlar ve “güncel/sonraki gate” ifadeleri tarihsel kayıttır; bu bölüm önceliklidir.


14 Eylül 2026. Kullanıcı bu tur yalnız mevcut Mac'i kullanabileceğini bildirdi. Hazırlık gate'i `PLAYER_V2_GENERAL_ACCEPTANCE_PREFLIGHT`; yeni canlı oynatma veya cihaz işlemi yapılmadı. Telefon testleri ertelenmiş/kabul edilmiş sayılmaz; kullanılabilir cihaz bulunana kadar açık kalır.

## Son kontrollerle güncellenen durum — 15 Eylül 2026

**Son Chrome uzun koşusu:**601,119s video ilerlemesi/20oynarken sarma/6oturum yenilemesi tamamlandı. İki SDK hata olayı, duraklama ve olay/SDK sayaç farkı korunarak COMPLETED_WITH_WARNINGS. Güncel tek sonraki gate **PLAYER_V2_SAFARI_LONG_SESSION_LIVE**: mevcut Safari/utick2 ve haklı M2 trace kaynağı;10dakika/2yenileme/20sarma, üst sınır12dakika oynatma/30dakika duvar saati. Önce mevcut yetki ve ölçüm yolu doğrulanır. Bu HLS.js testidir; native kabulü değildir. Aşağıdaki eski Chrome hazırlığı tekrarlanmaz.

**Son Edge uzun koşusu:**620,1175s gerçek oynatma/3oynarken yenileme/20sarma tamamlandı. Duraklama sayılmadı, üç sarma süresi aşımı ve kısmi SDK kayıtları korunarak COMPLETED_WITH_WARNINGS. Güncel tek sonraki gate **PLAYER_V2_CHROME_LONG_SESSION_LIVE**: Chrome/utick2, mevcut haklı600,026s M2 trace videosu;10dakika/2yenileme/20sarma, en fazla12dakika oynatma/30dakika duvar saati. Yeni cihaz/ödeme yok; güncel erişim ve ölçüm başlamadan doğrulanır. Aşağıdaki eski Edge hazırlığı tekrarlanmaz.

**Son önizleme kontrolü:** tek sentetik401sonrasında aynı açık bileşen doğal token yenilemesiyle toparlandı; işlevsel PASS. Hazırlık dahil5dakika sınırı aşıldığı için sonuç COMPLETED_WITH_WARNINGS; toplam6önizleme isteği ve0oynatma/imza/ödeme. Güncel tek sonraki gate **PLAYER_V2_EDGE_LONG_SESSION_LIVE**: mevcut Edge/soteri ile10dakika/2yenileme/20sarma; üst sınır12dakika oynatma/30dakika duvar saati. Önce mevcut yetki ve ölçüm yolu kontrol edilir. Eski hata hazırlığı tekrarlanmaz; bu belge yeni test başlatmadı.

**Son ölçüm:** oynarken sarma altı örnekte tamamlandı; tampon içi16–25,8ms, tampon dışı1,130/2,637/4,442s. Bir3s aşımı nedeniyle sonuç COMPLETED_WITH_WARNINGS; tekrar test/optimizasyon başlatılmadı. Güncel tek sonraki gate **PLAYER_V2_PREVIEW_ERROR_RECOVERY_PREFLIGHT**; aşağıdaki eski sarma hazırlığı önerisinin yerini alır.

Kontrollü koşu tamamlandı;8,02s başlangıç ortancası kullanıcı tarafından kabul edildi. Brave sertifika/önizleme/düşük kaynak kontrollerine ek olarak Chrome/utick2 ve Edge/soteri cihaz yetkileri ve kısa oynatmaları geçti.12yayın envanterinde kare kaynak yok. Güncel tek sonraki gate **PLAYER_V2_PLAYING_SEEK_RECOVERY**: mevcut Brave yetkisiyle eksik seek→playing ölçümü. Aşağıdaki önceki hazırlık paketleri tekrarlanmayacak; kalanların güncel sınırları [kabul raporunda](./player-v2-acceptance-closeout.md#açık-kalan-kabul-grupları).

İlk hazırlığın aşağıdaki yürütme paketi tarihsel kayıttır; Brave uzun koşusu ve10Mbps kalibrasyon uygulaması tamamlandı. **10Mbps profil doğrulaması yapıldı; ölçülen aktarım2,48Mbps, sonuç kullanıcı tarafından kabul edildi.** Kalibrasyon kullanıcı kabulüyle kapatıldı; yeniden kalibrasyon/teşhis şartı yok. Sonraki tek gate **PLAYER_V2_CONTROLLED_PERFORMANCE_LIVE**: mevcut Brave/soteri cihazıyla aşağıda tanımlanan10başlangıç/20sarma, en fazla12dakika oynatma/30dakika duvar saati. Kesin10Mbps aktarım kanıtı yerine kabul edilmiş profil koşulu kullanılır; gerçek hız ve süreler ayrıca raporlanır. Aşağıdaki “henüz başlamadı/kalibrasyon geçmeden” ifadeleri ilk hazırlık paketinin tarihsel kaydıdır; güncel kullanıcı kararı bunların yerini alır.

## Cihaz ve tarayıcı matrisi

Bu bilgisayar: macOS 26.5.1 (25F80), arm64, model kimliği Mac16,13. Aşağıdakiler kurulu uygulama sürümleridir; en son kararlı sürüm oldukları ayrıca doğrulanmadı.

| Hedef | Kurulu sürüm / kullanılabilirlik | Mevcut kanıt | Sonraki ihtiyaç |
|---|---|---|---|
| Mac / Brave | 150.1.92.138; mevcut profil | Uzun oturum,20duraklatılmış ve6oynarken sarma, sertifika korunumu, fare/yenileme/tek sentetik401önizlemesi ve düşük giriş uyumu; başlangıç süreleri kullanıcı kabulüyle kapalı | Sarma ve hata testi hazırlık süresi uyarıları; fiziksel dokunma/geniş önizleme matrisi ve kare kaynak |
| Mac / Safari | 26.5, build21624.2.5.11.4 | utick2'nin Safari sertifikası final zincirle eşleşti; kısa HLS.js oynatma/sarma/yenileme ve12.saniyeden devam geçti | Video bitişi/dört oynarken yenileme gözlendi; bağımsız kesintisiz ilerleme, 20 sarma ve native HLS açık; Safari HLS.js desteğini öncelikli seçiyor |
| Mac / Chrome | 152.0.7977.84 | utick2 cihazı/yenileme erişimi, kısa1080p ve601,119s video ilerlemesi/20sarma/6yenileme | İki SDK hata olayı, duraklama ve sayaç farkı uyarısı; tam kontrol matrisi değil |
| Mac / Edge | 153.0.4234.32 | Kısa oynatma ve620,1175s toplam oynama/3yenileme/20sarma; cihaz/yenileme erişimi doğrulandı | Duraklama ve3s aşımı uyarıları; kesintisiz oturum/tam kontrol matrisi kanıtı değil |
| Fiziksel iPhone/iPad / Safari | Bu tur yok | UNPROVEN | Model, iOS/iPadOS ve Safari sürümü; güncel/önceki ana sürüm matrisi |
| Fiziksel Android / Chrome | Bu tur yok | UNPROVEN | Model, Android ve Chrome sürümü, gerçek dokunma/ağ koşulları |

Dar viewport veya yerel WebKit/MP4 düzeneği fiziksel telefon ya da gerçek Safari HLS kabulü yerine kullanılamaz. Yeni tarayıcı profili ayrı cihaz yetkisi gerektirebilir. Hesap başına üç aktif kayıt sınırı korunur; key import/export veya sessiz cihaz çıkarma yok. Diğer tarayıcılara geçmeden önce mevcut yetkiler okunur; bu hazırlık yeni cihaz aktivasyonu izni vermez.

## İlk hazırlık paketi — Brave koşusu sonradan tamamlandı

İlk hazırlıkta önerilen gate **PLAYER_V2_BRAVE_LONG_SESSION_LIVE** idi; sonraki onaylı koşu `tmp/player-v2-brave-long-session-live-20260914/receipt.json` ile kapandı. Aşağıdaki paket o koşunun sınırlarını korur, yeni tekrar izni vermez. Hesap **soteri.testnet**; mevcut Brave profili ve cihazı kullanıldı.

Mevcut uzun video:

- Yayın `lp-7d7e1b4e-0674-4db9-9377-3e9d4918224c`, “Video V1 kabul — 5GB 120dk — 2026-09-11”.
- Üretici soteri.testnet; aynı hesap için izleme hakkı güncel final blokta doğrulandı.
- Asset `f0bac775-7bc3-4956-b716-525e12194b1f`, playback `f0baf9hsahk9ag8m`; aynı proje/yayın eşleşmesi doğrulandı.
- Provider ready, süre **7200,008008 saniye**, mevcut profiller **360p/720p**. En az10dakikalık gerçek oturum için yeni upload veya30saniyelik videoyu döngüye alma gerekmiyor.
- Bu test uzun 720p/adaptive oturumunu sınar. Yatay/dikey kısa1080p kanıtı korunur; uzun1080p, kare ve düşük kaynak testleri bununla kapanmaz.

### Ölçülecekler

1. Gerçek oynama süresi en az **600 saniye**. Medya konumunu sararak artırmak veya sayfayı600saniye açık bırakmak tek başına yeterli değildir.
2. Oynatma oturumunda en az **iki başarılı token yenilemesi**, ek cüzdan işlemi olmadan. Kaynakta V2 token süresi180saniye, yenileme payı30saniye; ilk yenileme yaklaşık150saniye sonra beklenir. Gerçek `expires_at` ve tamamlanma olayları esas alınır; saati değiştirme veya yapay JWT süresi yoktur.
3. Zamanları ve hedefleri kaydedilen **20 sarma**; ileri/geri, tampon içi ve dışı durumlar ayrılır. Gerçek UI kontrolleri kullanılır. `currentTime` sıçraması tek başına toparlanma süresi değildir.
4. Mevcut VTT/resim sunuluyorsa sarma sırasında önizleme, kaynak yoksa yalnız zaman görünümü. Yeni sprite/asset üretilmez. Gerçek VTT/resim/CORS kabulü ancak ilgili erişim ve görsel sonuç kaydedilirse geçer.
5. Sonda duraklatma, aynı hesabın bir yenilemesi ve devam seçeneği/izleme hakkı. Yeni ödeme veya cihaz aktivasyonu sunulması durma nedenidir.

Mevcut `video_measurement` konsol kayıtları anahtarsız/URL'siz performans verisi sağlar. Bu hazırlıkta duraklatılmış mevcut sayfanın heartbeat kayıtları ve iki tamamlanan yenileme kaydı okunabildi; bunlar uzun oynatma kabulü değildir. SDK kaynağında heartbeat sürelerinin artış değerleri olduğu ve tamponda toplanabildiği doğrulandı. Kayıtlar tekrar sayılmamalı; aynı sayfa/zaman kaydı tek kez alınmalı, yenilemede `timeOriginMs` ayrı tutulmalıdır. Kayıt geliş zamanı ilk kare zamanı sayılmaz.

Oynatma sırasında düzenli kayıtlarda `time_playing_ms`, `time_waiting_ms`, hata/uyarı ve yenileme sonuçları tutulur. Geçici denetim koparsa oynatma güvenilir biçimde durdurulur; ölçüm alınamayan aralık başarılı kabul edilmez. HAR, JWT'li URL, imza veya özel anahtar dışarı aktarılmaz.

### Önerilen yürütme sınırları — henüz çalıştırılmadı

| Kalem | Sınır |
|---|---|
| Yeni bilet/USDC ödemesi | 0 |
| Cüzdan işlemi, yeni cihaz veya cihaz çıkarma | 0 |
| Yeni upload, asset, profil/config değişimi, deploy | 0 |
| Toplam yeni oynatma | En fazla **12 dakika**; ana10dakikalık oturum ve bütün kısa tekrarlar dahil |
| Duvar saati penceresi | İlk Play'den itibaren **30 dakika**; yeni tekrarlar20.dakikada durur, son10dakika kapanışa ayrılır |
| Başlangıç/yenileme tekrarları | İlk oturum + sonda bir soğuk yükleme; otomatik başarısızlık tekrar döngüsü yok |
| Önizleme denemesi | Yalnız mevcut video üzerinde,20sarma kapsamında |
| Provider artımlı kullanım uyarısı | **1 USD**; gecikmeli fatura nedeniyle katı teknik fatura tavanı değildir |

Bu, önceki kısa oynatma bütçelerinin devamı değildir; yeni ve açıkça onaylanacak uzun test kapsamıdır. Önceki sayaçlar ve ölçüm eksiklikleri tarihsel kayıtta kalır.

[Livepeer'ın yayımlanan Growth tarifesinde](https://livepeer.studio/pricing) dağıtım0,03USD/60dakika ve aylık100USD asgari tutar bulunuyor (14Eylül2026 tarihinde okundu). Yalnız12dakika dağıtımın basit tarife çarpımı0,006USD'dir; buffering/sarma trafiği, gerçek hesap paketi, dahil kullanım ve fatura gecikmesi nedeniyle bu tutar fatura garantisi veya üst sınır değildir. Yeni abonelik/servis talep edilmiyor. Testte yeni dönüştürme/saklama işi oluşturulmayacak.

### Başlama ve durma koşulları

Başlamadan source/runtime, aynı yayın, soteri izleme hakkı ve mevcut yerel yetki tekrar okunur; gerekli kontroller ve Pause erişilebilir olmalıdır. Ölçüm kayıtlarının okunması ve medya durdurma yolu hazır olmadan timer/Play başlatılmaz. Tarayıcı yeniden başlatılmaz, profil değiştirilmez, oturum deposu silinmez. Kod veya secret değişimi gerekirse bu koşu başlamadan durur.

Hesap/cihaz/yayın uyuşmazlığı, beklenmeyen imza veya ödeme, erişim kaybı, döngü/otomatik oynatma, süre/bütçe sınırı veya denetim/ölçüm kaybında test durur. Aynı medya ve mevcut haklar korunur. Sonuçta oynatma durdurulur; toplam süre, yenilemeler,20sarma, önizleme ve kalan belirsizlikler ayrı raporlanır.

## Kontrollü performans ve diğer açık gruplar

İlk hazırlıkta doğrudan tarayıcı API'sinde yalnız viewport denetimi bulunmuştu. Sonraki `PLAYER_V2_CONTROLLED_PERFORMANCE_PREFLIGHT` sırasında gerçek Brave DevTools Network → Throttling → Add… → Add profile ekranı native UI üzerinden açıldı. Download/Upload birimi kbit/s, Latency ms; Packet Loss, Queue Length ve Reordering alanları mevcut. Böylece kurulu araçla profil hazırlama yolu doğrulandı; gerçek10Mbps aktarım etkisi henüz ölçülmedi.

Profil oluşturulmadı veya uygulanmadı. Boş taslak Cancel ile kapatıldı; Network panelinde **No throttling**, Disable cache kapalı görüldü. Yalnız hazırlık için açılan boş sekme kapatıldı. YouTick'e gitme girişimi yeni sekmede sonuçlanmadığından bu tur hesap/cihaz erişimi yeniden doğrulanmış sayılmaz. Önceki sertifika kanıtı yeni canlı koşudan önce tekrar kontrol edilir.

### Somut sonraki paket: kalibrasyon, sonra kontrollü koşu

Tek sonraki gate **PLAYER_V2_10MBPS_CALIBRATION**; henüz başlamadı. Sistem genelinde kısıtlama veya kurulum gerekmez. Yalnız YouTick test sekmesinin DevTools profilinde indirme **10000kbit/s**, ek gecikme **0ms**, ek kayıp **0%**; upload sınırsız/default bırakılır. Bu doğal ağ gecikmesine ek bir gecikme koymayan indirme tavanıdır; fiziksel10Mbps hat veya mobil ağ taklidi değildir. CPU yavaşlatma uygulanmaz. Birimler kaydedildikten sonra seçili profil ve eski ayarlar ayrı kanıtlanır.

- Önce oynatmasız kalibrasyon: sayfada gerçekten gözlenen, herkese açık statik yanıtlarla en fazla **10MB** toplam ağ aktarımı; önce kısıtlamasız, sonra profilli ölçüm. Yeni provider varlığı, hız testi servisi veya secret/JWT içeren aktarım yok. Kaynak yeterli boyutta değilse ya da doğal hat zaten10Mbps'nin altındaysa sonuç belirsiz raporlanır; sayı uydurulmaz.
- DevTools açıkken Disable cache kullanılır; bu HTTP önbelleği kontrolüdür. Cihaz IndexedDB'si/cookie/oturum silinmez; “Clear site data” veya profil sıfırlama yapılmaz. Cache/service-worker yanıtı ağ örneği sayılmaz. Aktarılan bayt ve ağ indirme süresinden etkili hız hesaplanır; tek dropdown etiketi kalibrasyon başarısı sayılmaz.
- Kapanışta **No throttling** ve önceki cache ayarı geri yüklenir; kamuya açık isteklerin normal erişimi kontrol edilir. Kalibrasyon geçmeden medya performans kabulü başlatılmaz. Bu belge ayar uygulama veya oynatma yetkisi vermez; kullanıcı sonraki somut paketi onayladığında uygulanır.

Kalibrasyon sonrası hazırlanacak canlı koşu mevcut Brave/soteri cihazı ve mevcut120dakikalık yayını kullanır. Önerilen sınırlar: **10başlangıç +20sarma**, toplam en fazla **12dakika gerçek oynatma**, **30dakika duvar saati**,0yeni imza/ödeme/upload. Bu hazırlık10dakikalık uzun oturumu tekrar istemez. Her başlangıç ayrı sayfa yüklemesinde, HTTP cache kapalı ve video metadata hazırlığı/Play ayrı zamanlarla kaydedilir. Sayfa-yükleme→hazır, Play→ilk kare ayrı raporlanır; önceden tamponlanmış Play sonucu uçtan uca soğuk başlangıç sayılmaz. Sarma öncesi buffered aralıkları okunur; tampon içi/dışı hedef ve seek→oynamaya dönüş aynı tarayıcı saatiyle ölçülür. Kaydedilen mevcut devam konumu korunur/sonda geri yüklenir. Gerçek provider artımlı fatura bilinmediğinden süre sınırı maliyet garantisi değildir.

Tarayıcıya özel kısıtlama ve ölçüm erişimi birlikte doğrulanmadan **10başlangıç / ortanca≤3s** veya **sarma/toparlanma≤3s** hedefleri geçilmiş sayılmaz. DevTools kısıtlaması kapatılsa da diğer aktif trafik ve doğal bağlantı değişkenliği ölçümü etkileyebilir; kullanıcı sekmeleri otomatik kapatılmaz.

İlk Brave koşusu doğal bağlantıda işlevsel uzun oturum kabulüdür. Ölçülen süreler kaydedilir ama10Mbps kontrollü performans sonucu olarak sunulmaz. Sonraki hazırlık,10Mbps yöntemi ve10başlangıç örneğini ayrı bir somut paketle ele almalıdır.

Safari'de native yenileme için konum sapması≤1s ve bekleme≤2s hedefleri; Chrome/Edge, fiziksel telefonlar, kare/düşük kaynak geometrisi, doğrudan dolu-depo sertifika hash karşılaştırması ve kesin provider faturası açık kalır. Eski anahtar kaybının tarihi tetikleyicisi bu hazırlıkta çözülmüş sayılmaz. Genel kabulün tamamı henüz bitmedi.

## Hazırlık kanıtı ve sınırı

Yerel kanıt klasörü: `tmp/player-v2-general-acceptance-preflight-20260914/`. Kurulu sürümler işletim sistemi/plist okumalarından, uzun video ve yetki final NEAR/provider okumalarından, ölçüm desteği mevcut kaynak ve güvenli konsol kayıtlarından doğrulandı. Yeni medya oynatılmadı;0yeni imza/ödeme/cihaz/upload/deploy.

Bu belge ve [planın güncel bağlantısı](./player-v2-plan.md) yerel belge değişiklikleridir; GitHub'a yayımlanmadı. İlk Brave koşusunun onayı tüketildi ve koşu tamamlandı. Telefon bulunmaması ve10Mbps yönteminin hazır olmaması raporlanmış sınırlardır; bunlar testleri sessizce atlama yetkisi değildir. Son kanıtlar ve kalanlar [kabul raporunda](./player-v2-acceptance-closeout.md) birleştirilmiştir.
