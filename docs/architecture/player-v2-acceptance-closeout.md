# Player V2 — kabul kapanış raporu

## Güncel Safari sonucu ve yayın durumu — 15 Eylül 2026

**PLAYER_V2_RPC_SAFARI_ACCEPTANCE — COMPLETED_WITH_WARNINGS.** Safari/Mac, mevcut `utick2.testnet` cihazı ve M2 trace biletiyle video doğal olarak sona ulaştı. SDK play→ended aralığı **600,682 saniye**; oynarken dört doğal yenileme **530 / 625 / 1065 / 634 ms** içinde tamamlandı. Önceki `playback_authorization_unavailable` hatası bu koşuda gözlenmedi; tüm geçmiş kesintilerin çözüldüğü sonucu çıkarılmaz.

Konsol odağı kararsızdı; bazı ölçüm komutları video kısayollarına ulaştı. Son bağımsız ilerleme sayacı alınamadığı için **kesintisiz 600 saniye gerçek video ilerlemesi ve 20 planlı sarma doğrulanmış sayılmaz**. Kısa `stalled` kayıtları ve Livepeer analiz/raporlama bağlantı uyarıları korundu. Video bittikten sonraki beşinci yenileme **7841 ms** sürdü ve başarılı oldu; nedeni belirlenmedi. Belgeleme onayı bu gecikmeyi kabul edilmiş performans istisnasına dönüştürmez.

Kanıtlar ayrı tutulur: LOCAL_TEST — 23 test, TypeScript ve lint geçti. [PR #208](https://github.com/4rmus/youtick/pull/208), main `74887782617f8b69ab6b11a095212f2e7e7c8b3e` sürümüne birleşti. [Main CI](https://github.com/4rmus/youtick/actions/runs/34981949868) ve [korumalı public-testnet dağıtımı](https://github.com/4rmus/youtick/actions/runs/34983610788) başarılı. Mevcut `acceptance` yapılandırması korundu; dağıtım anahtarı tekrar kapatıldı. Public-testnet dağıtım/sağlık kanıtı Safari kabulünün yerine geçmez; production/mainnet sonucu çıkarılmaz. Bu belge turunda test veya dağıtım tekrarlanmadı.

Geçici gözlemci sayfa yenilemesiyle kaldırıldı; duraklatılmış video ve bağlı hesap doğrulandı, ana sayfaya dönüldü. Safari koşusunda yeni imza, ödeme, cihaz kaydı veya upload yapılmadı. Kanıtlar: `tmp/player-v2-rpc-safari-acceptance-20260915/{receipt.json,closeout.md}` ve `tmp/player-v2-rpc-deploy-20260915/closeout.md`.

Genel kabul **açık**: bağımsız Safari ilerleme/sarma ölçümü, native HLS, fiziksel telefon ve kare kaynak eksikleri kapanmadı. Kabul edilmiş 10 Mbps ve 8,02 saniye başlangıç süresi yeniden açılmaz. **Tek sonraki gate: PLAYER_V2_ACCEPTANCE_DOCS_PUBLICATION** — güncel main ile uzlaştırılan üç belgeli adayı commit/push ve PR ile yayımlamak. Bu kayıt commit/push veya yeni canlı işlem başlatmaz. Aşağıdaki önceki sonuçlar ve “güncel/sonraki gate” ifadeleri tarihsel kayıttır; bu bölüm önceliklidir.


14 Eylül 2026. Bu rapor mevcut kayıtları birleştirir; yeni canlı test yapılmadı. Belge gate'i `PLAYER_V2_ACCEPTANCE_CLOSEOUT`; kontrollü Brave/public-testnet kabulünün sonucu **COMPLETED_WITH_WARNINGS**. Player V2'nin genel kabulü **tamamlanmadı**. Eski kontrollü Video V1 kapanışı yeniden açılmadı; production/mainnet hazırlığı sonucu çıkarılmadı.

## Son kanıtların uzlaştırılması — 14 Eylül 2026

### 15 Eylül güncellemesi

**Chrome uzun oturum kapanışı — COMPLETED_WITH_WARNINGS:** Chrome/utick2 ve mevcut M2 trace kaynağında sarma sıçramaları çıkarılmış601,119015s video ilerlemesi,20oynarken sarma grubu (8tampon içi/12dışı),6oturum yenilemesi kaydedildi. Aynı girdiden doğan iç sarma düzeltmeleri birleştirildi;3grup sayılmadı. En uzun sayılabilir toparlanma2807,7ms. Önceki Brave/Edge süre aşımları bu sonuçla silinmez.

Olay sayacı620053,9ms'de durdu;223benzersiz SDK kaydı769168ms oynatma bildirdi. SDK sayacı duraklatılmış gözlemlerle tutarlı değildi; gerçek süre için kullanılmadı. Video ilerlemesi601119ms, olay sayacı620054ms çapraz kontrolü kullanıldı; farkın kesin kök nedeni belirlenmedi. SDK'da2hata olayı, son video.error=null; bu oturum kesintisiz/hatasız sayılmaz. Konum0ve temiz yenileme erişimi doğrulandı; geçici kod/console.info sarmalayıcısı ve test sekmesi kaldırıldı. Yeni imza/ödeme yok. Kanıt: `tmp/player-v2-chrome-long-session-20260915/{measurements,receipt}.json`. Belgeleme onayı bu uyarıları kaldırmaz. Güncel tek sonraki gate **PLAYER_V2_SAFARI_LONG_SESSION_LIVE**.

**Edge uzun oturum kapanışı — COMPLETED_WITH_WARNINGS:** temel hedefler geçti:620,1175s gerçek oynatma, oynarken3başarılı token yenilemesi ve20tamamlanmış sarma (10tampon içi/10dışı). Bir hızlı ardışık giriş ayrı toparlanma kaydı olmadığı için sayılmadı. Üç sarma3s'yi aştı:3,551/3,062/14,498s.55s oynatma sonrasındaki duraklama nedeni belirlenmedi; aynı oturumdan devam edildi, duraklama süresi oynatmaya katılmadı. Bu kesintisiz10dakika değildir. Kaynak: `tmp/player-v2-edge-long-session-20260915/{measurements,receipt}.json`.

Olay bazlı aynı-sayfa sayaç otomatik620s'de durdurdu. Tutulan138SDK kaydı kısmi olduğundan474751ms oynatma/31450ms bekleme tam toplam sayılmadı;600s kanıtı olay sayacıdır. Son video1280×720/error=null; tutulan SDK kayıtlarında hata0. İlk üç yenileme oynarken, dördüncü duraklama sonrası kaydedildi. Geçici ölçüm kaldırıldı;0konumu ve yenileme sonrası erişim doğrulandı, test sekmesi kapatıldı. Yeni imza/ödeme/cihaz/upload/deploy yok. Güncel tek sonraki gate **PLAYER_V2_CHROME_LONG_SESSION_LIVE**; eski Edge önerilerinin yerini alır.

**Önizleme hata-toparlanma kapanışı:** mevcut Brave/soteri portrait sayfasındaki kesin VTT URL'sine yalnız bir sentetik401uygulandı. Hata provider'a gönderilmedi; fetch hemen geri yüklendi.0:06önizlemesinde yalnız zaman vardı, video paused kaldı. Doğal token yenilemesi1698,4ms'de tamamlanınca aynı DOM düğümünde203×360 resim geri geldi; kapat/aç ile toparlanma atlanmadı.5gerçek +1sentetik=6önizleme isteği; oynatma/imza/ödeme0. Kaynak: `tmp/player-v2-preview-single-failure-20260915/receipt.json`. İşlevsel PASS; hazırlık dahil428,636s süre5dakikayı aştığından COMPLETED_WITH_WARNINGS. Hata sonrası gözlem176,993s; konum0'a döndü, müdahale/test sekmesi kaldırıldı. Bu gerçek provider401olayı değil, gerçek uygulamada kontrollü hata testidir. Güncel tek sonraki gate **PLAYER_V2_EDGE_LONG_SESSION_LIVE**; eski önizleme hazırlığı önerileri artık tarihsel kayıttır.

**Oynarken sarma ölçümü tamamlandı — COMPLETED_WITH_WARNINGS:** aynı sayfa performance saatiyle üç tampon içi ve üç tampon dışı örnek alındı. Oynamaya dönüş tampon içinde16/18,4/25,8ms; tampon dışında1129,9/2636,9/4442,3ms. Altı örnekte de sonraki kare görüldü; bir örnek3s hedefini aştı. Sonraki kare süreleri113–124ms ve1229,9/2725,7/4530,828ms. Toplam52,917s oynatma,9,056s bekleme; hata/uyarı/stalled0. Önceki1:00:59 konumu geri yüklendi, gözlemci yenilemeyle kaldırıldı. Kanıt: `tmp/player-v2-playing-seek-20260915/{measurements,receipt}.json`. Bu belgeleme onayı, aşımı teknik PASS'e veya kullanıcı tarafından ayrıca kabul edilmiş performans istisnasına dönüştürmez. Güncel tek sonraki gate **PLAYER_V2_PREVIEW_ERROR_RECOVERY_PREFLIGHT**; bu tur yeni test/optimizasyon yok.

**Masaüstü kapanış güncellemesi:** Chrome ve Edge kısa oynatma kabulü tamamlandı. Aşağıdaki önceki envanter/cihaz hazırlığı önerileri artık tarihsel kayıttır; güncel tek sonraki gate PLAYER_V2_PLAYING_SEEK_RECOVERY. Kaynak/CI/deploy bu belge turunda yeniden sorgulanmadı; sonuçlar tamamlanan canlı kanıtlara dayanır.

| Tarayıcı / hesap | Cihaz yetkisi | Kısa oynatma sonucu |
|---|---|---|
| Chrome / utick2 | Final268667511; AH3n…BNtz yerel hash eşleşti. Atwc…P2Bn çıktı, Brave/Safari kayıtları korundu |30,251s,254ms ilk kare,1080×1920,0hata/0bekleme; ended/paused |
| Edge / soteri | İlk final kontrolde değişiklik yoktu; tekrar kontrolde268671958'de Ec7C…dzSx eşleşti.7kjj…fNhNH çıktı, diğer iki kayıt korundu |30,209s,529ms ilk kare,336ms bekleme/0hata;720×1280→1080×1920; ended/paused |

Her iki cihaz30gün yetkili; normal yenilemeden sonra ek aktivasyon olmadan erişim doğrulandı. İşlem hash'i/gerçek ağ ücreti ayrıca alınmadı. Yeni bilet ödemesi yok; oynatma koşularında yeni imza yok. Kanıt: `tmp/player-v2-chrome-device-live-20260915/closeout.md`, `tmp/player-v2-edge-device-live-20260915/closeout.md`, `tmp/player-v2-chrome-playback-20260915/receipt.json`, `tmp/player-v2-edge-playback-20260915/receipt.json`.

Sertifika uç-nokta karşılaştırması PASS: kullanıcının soteri→utick2→soteri geçişi öncesinde, sonrasında ve normal yenileme sonrasında her iki açık anahtar/SHA256 aynı kaldı. Ara utick2 anında ayrı örnek veya sürekli depo izlemesi alınmadı; eski anahtar kaybının kesin nedeni hâlâ bilinmiyor. Kanıt: `tmp/player-v2-device-preservation-20260915/{before,after}.json`.

Fare/doğal yenileme kontrolü PASS: soteri'nin mevcut portrait videosunda0:03önizlemesi203×360 yüklendi; bileşen kapatıldı, token961,6ms'de yenilendi,0:22önizlemesi yeniden yüklendi. Video played.length=0, konum sonunda0; yeni imza/ödeme yok. Kanıt: `tmp/player-v2-preview-renewal-20260915/receipt.json`. Bu, fiziksel dokunma veya zorlanmış401sonrası toparlanma testi değildir.

10Mbps kalibrasyonu ve8,02s başlangıç ortancası kullanıcı kabulüyle kapalıdır; yeniden teşhis edilmeyecek.20duraklatılmış sarma hedefi doğrulandı (10tampon içi/10dışı); oynarken seek→playing süresi ölçülmedi. Güncel tek sonraki gate **PLAYER_V2_EXISTING_SOURCE_INVENTORY**; aşağıdaki eski sonraki-gate ifadeleri tarihsel kayıttır.

**Ek kullanıcı kabulü:** 10Mbps profil kontrolü gerçekleştirildi;54,69/2,48/34,69Mbps karşılaştırması korunarak kalibrasyon kullanıcı kabulüyle kapatıldı. Yeniden kalibrasyon veya zamanlama teşhisi şartı kaldırıldı. Kesin10Mbps hız ölçümü ve diğer sekmelerin etkisi teknik olarak kanıtlanmış sayılmaz. Güncel tek sonraki gate PLAYER_V2_CONTROLLED_PERFORMANCE_LIVE;10başlangıç/20sarma hedeflerinin gerçek sonuçları ayrıca ölçülecek. Bu karar aşağıdaki önceki sonraki-gate önerisini günceller.

`PLAYER_V2_GENERAL_ACCEPTANCE_STATUS_RECONCILIATION` yalnız bu raporu, ana planı ve genel kabul ön hazırlığını günceller. Uygulama kodu, diğer mevcut kirli dosyalar, HEAD/index ve canlı ortam değişmez. Kabul: eski açık/sonraki ifadeleri kayıtlı sonuçlarla düzeltmek, doğrulanmamış matrisi açık tutmak ve belge derlemesini geçirmek. Bu tur yeni runtime/CI/provider sorgusu yapılmadı; aşağıdaki sonuçlar tamamlanan koşuların makbuzlarına dayanır.

| Tamamlanan kontrol | Kanıt ve sınırı |
|---|---|
| Brave uzun oturum |634,398s gerçek oynatma,5başarılı yenileme,20planlı sarma;32,396s bekleme,0hata. Çekirdek PASS; tampon sınıflandırması ve kontrollü hız hedefleri açık |
| Gerçek sarma önizlemesi | Yetkili VTT200,720cue; anonim401, PNG200 ve gerçek640×360 Blob resim. İlk klavye önizlemesi geçti; dokunma/yenileme matrisi tamamlanmadı |
| Safari cihazı | utick2 için kullanıcı bir cihaz işlemi imzaladı. Final blok268582006'daki `3oWL…YWSs` kaydı Safari sertifika hash'iyle eşleşti; en eski `9NYj…6YUYg` çıktı, diğer iki kayıt korundu. Gerçek işlem ücreti/hash'i ayrıca alınmadı |
| Safari kısa oynatma |720×1280 çözme, baştan sona oynama, iki yönde sarma, iki sayfa yenilemesi ve12.saniyeden devam. İlave tekrar dahil77,449s ölçülen oynatma; yeni imza/ödeme0. Sonunda duraklatıldı. HLS.js yolu; native/uzun oturum kabulü değil |

Safari'de iki hesapla Meteor girişi kullanıcı tarafından bildirildi; bu, iki Safari cihaz sertifikası anlamına gelmez. Salt-okunur ilk kontrolde ikisinin de yerel cihaz kaydı yoktu; yalnız utick2 için yetki oluşturuldu. Safari sertifikası-zincir eşleşmesi, Brave'deki iki hesap arasında dolu-depo korunumu testini kapatmaz.

Yerel kanıtlar: `tmp/player-v2-brave-long-session-live-20260914/receipt.json`, `tmp/player-v2-live-preview-preflight-20260914/receipt.json`, `tmp/player-v2-mac-safari-preflight-20260914/receipt.json`, `tmp/player-v2-safari-utick2-authorization-20260914/progress.json`, `tmp/player-v2-safari-playback-20260914/closeout.json`.

## Planın beş ana aşaması

| Aşama | Tamamlanan iş | Kabul sınırı |
|---|---|---|
| 1. Ortak oynatıcı | Livepeer React player/HLS.js, ortak kontroller, kalite/hız/dil, dokunma, tam ekran ve yerel devam; kaynak ve testnet yayını | Brave ve kısa Safari HLS.js kanıtı var; fiziksel telefon/native matrisi açık |
| 2. Tek onaylı erişim | Mevcut bilete tek `activate_playback_device`; satın almada birleşik cihaz yetkisi; belirsiz hak yanıtında tekrar ödeme sunulmaması | İki hesapta FINAL işlemler ve temiz yükleme/yenileme sonrası erişim var; son dolu-depo sertifika hash karşılaştırması eksik |
| 3. Sarma önizlemeleri | Yetkili mevcut VTT/sprite kaynağı, iptal/Blob temizliği ve kaynak yoksa yalnız zaman gösterimi | Gerçek ilk klavye önizlemesi ve VTT/resim/CORS geçti; dokunma/yenileme matrisi açık |
| 4. Full HD | Eski/yeni profil uyumu, kontrollü yatay ve dikey yayın, gerçek1920×1080 ve1080×1920 çözme | Varsayılan yeni yükleme profili adaptive/720p; kare/düşük kaynak çıktıları ve kalıcı1080p varsayılanı için kabul yok |
| 5. Genel kabul | Brave iki hesap, uzun oturum ve kısa Safari kontrolleri yapıldı | Diğer hedefler/native HLS ve kontrollü performans hedefleri açık |

Özet: **4 ana uygulama aşaması yayımlandı; kalan1ana aşama genel kabul.** Bu, ilk dört aşamadaki bütün dış ortam testlerinin geçtiği anlamına gelmez. Eksik testler kullanıcı tarafından ertelenmiş veya kabul edilmiş sayılmadı.

## Önceki kaynak, CI ve yayın kapanışının kanıtı

İlk dört kaynak adımı [PR #200](https://github.com/4rmus/youtick/pull/200) ile main'e alındı. Sonraki düzeltmeler metadata erişimini ([PR #202](https://github.com/4rmus/youtick/pull/202)), dikey çıktı doğrulamasını ([PR #204](https://github.com/4rmus/youtick/pull/204)), cihazları koruyan hesap geçişini ([PR #205](https://github.com/4rmus/youtick/pull/205)), Meteor seçili hesap eşleşmesini ([PR #206](https://github.com/4rmus/youtick/pull/206)) ve yinelenen hesap satırlarını ([PR #207](https://github.com/4rmus/youtick/pull/207)) kapsadı.

- **CI:** Güncel main `bef0d43468b8b4671e82b8a8bffa5617c3c25e63`; [main CI34847682414](https://github.com/4rmus/youtick/actions/runs/34847682414) başarılı. Son dar hesap düzeltmesinin yerel Web doğrulaması412test, lint ve derleme geçti. Bu sayı bütün platform kabulünün yerine geçmez.
- **PREVIEW / yayın:** [Korumalı testnet yayını34849181974](https://github.com/4rmus/youtick/actions/runs/34849181974) başarılı. Yayın kapanışında üç bileşenin yüzde100 sürümleri ve sunulan22JavaScript dosyası incelenen artifact ile eşleştirildi.
- Web sürümü `efcf4611-94cb-4122-92b2-e90f82d52364`; Bridge `9fb966cf-ba07-4161-8a22-63acd998310b`; read-model `d3db8cb3-8819-4a7e-bba1-18c3e14cf4cf`.
- Market kod hash'i `BwX8m9esvWniSeE2VrWk5byRBSqAD313DYsVERZshVoY`; cihaz aktivasyon metodu Web kullanımından önce yayımlandı.
- Bu belge aşamasında main/CI/yayın sonucu ve Bridge/read-model sağlık sürümleri yeniden okundu.22dosya/yüzde100Web eşleşmesi yeniden çalıştırılmadı; önceki yayın kapanışına dayanır. Son canlı ekonomik/cihaz uzlaştırması14Eylül15:38UTC kapanışındadır.
- Son canlı kayıtta12yayın korunuyor, admission açık, bakım kapalı ve iki deploy anahtarı false. Yeni yüklemeler720p; mevcut1080p yayınlar destekleniyor.

## İki hesaplı kontrollü sonuç

Yatay video `lp-f263096b-8992-4fd8-afc4-7b4c758cfc82`, üretici `utick2.testnet`, oynatma kimliği `5c69z8t8mhoyuaa8`. Gerçek1920×1080 çözme ve soteri'nin bilet/yenileme sonrası erişimi önceki kontrollü koşuda doğrulandı.

Dikey video `lp-56328e94-c088-453d-8e5d-6cfecf148715`, üretici `soteri.testnet`, aynı ücretli asset `d283d5c4-e620-48d8-8dd7-527390c473bc`, oynatma kimliği `d2839lh4vsq0k9ew`. HLS etiketleri ile gerçek dikey HLS/MP4 çıktıları arasındaki uyumsuzluk düzeltildikten sonra aynı iş `Published/ACTIVE` oldu; yeniden yüklenmedi veya tekrar ödenmedi.

Utick2'nin dikey video bileti `DhvBnuib5jaftH7SrwuJLovTovEN4joMmPNfgWxjTzRm` işlemiyle FINAL başarıyla alındı.2testUSDC'nin1,96'sı üretici,0,04'ü platform kaydına yazıldı. Bu iki video senaryosunda kayıtlı toplam USDC5,20: iki yükleme için1,20, iki karşılıklı bilet için4,00. Bu hesap gerçek para faturası veya tüm hesabın geçmiş harcaması değildir.

Safari adımından önceki Brave yeniden bağlama işlemlerini kullanıcı tamamladı; otomasyon sonradan FINAL kayıtlarını doğruladı:

| Hesap | Son cihaz işlemi | Son işlevsel kontrol |
|---|---|---|
| utick2.testnet | `Asckc3PMN7NaDTudNBTvA8vibwSAig3zeKpXzr4KYhu` | Hesap değişimi ve yeniden yükleme sonrası ek ödeme/aktivasyon olmadan1080×1920 oynatıcı; `Devam et: 0:10` korunuyor |
| soteri.testnet | `6UfLwiSaiEdsSmcgshiAEgYcEQrttCuTVY56zhoVxPxQ` | Temiz sayfa yüklemesinde ek ödeme/aktivasyon olmadan1080×1920 oynatıcı |

Son iki cihaz işleminde0USDC, yaklaşık0,0005314568565544testNEAR ağ ücreti, toplam2yoctoNEAR ekli tutar ve56bayt ek sözleşme depolaması kaydedildi. Onaylanan iki en eski kayıt değişti; diğer cihaz kayıtları ve biletler korundu. Yeni cihazlar30gün yetkili; bunlar silinen eski özel anahtarların geri getirilmesi değildir.

## Neden tekrar tekrar10imza istendi?

1080p profil etkinleştirme paketlerinde normal akış için5yönetici işlemi, güvenli geri dönüş için5yedek işlem hazırlanıyordu: satın almaları duraklat, Bridge'i dondur, profili değiştir, Bridge'i aç, satın almaları aç. Geri dönüşte profil tekrar720p yapılır. Bu **10yönetim imzası**,10bilet veya10oynatma imzası değildir. Bir başarısız denemede10imza hazırlanmasına rağmen yalnız2işlem gönderildi; sonraki normal/geri dönüş koşularında10işlem kesinleşti. Eski paketler, kullanılmış nonce/süre ve değişmiş durum nedeniyle yeni çalışmaya körlemesine taşınmadı.

Akışı uzatan somut sorunlar; yayın sağlık kontrolündeki sürüm geçişi, metadata eksikliği, dikey boyut etiketleri, Meteor'da seçili hesap yerine ilk bağlı hesabın kullanılması ve yinelenen hesap satırlarının reddedilmesiydi. Tarayıcı/cüzdan pencerelerine erişim kesintileri de beklemeyi artırdı. Her dar belge/kod adımında yeni onay istenmesi teknik bir oynatıcı gereksinimi değildir; kaynak/CI/yayın işleri uygun olduğunda tek somut paket içinde yürütülebilir.

Oynatıcının normal akışında JWT alımı veya yenilemesi yeni cüzdan işlemi değildir. Mevcut bilet için geçerli yerel cihaz anahtarı varsa yeniden aktivasyon gerekmez. Meteor'un parola kilidini açmak ve hesap seçmek de zincir işleminden ayrıdır. İlk satın alma cihaz yetkisini aynı ödeme içinde taşıyabilir; mevcut biletin yeni cihazı ise tek açık aktivasyon kullanır.

## Yerel cihaz kaybı hakkında kesin ve belirsiz bulgular

Bir hesap geçişinden sonra iki yerel sertifika kayboldu; biletler ve zincirdeki yetkiler kalmıştı. Üç farklı sürümün aynı Brave profilinde açık olduğu belirlendi. İzole testte eski `b548feb0` sürümünün `wallet:signIn → applyWallet → clearAuth → clearDeviceSession` yoluyla iki hesabın deposunu silebildiği kanıtlandı. Eski sekmenin yalnız açık kalması tek başına silinmeyi üretmedi. Canlı kaybın hangi sekme/eylemden geldiği kesinleşmedi.

Eski sekmeler güncellendi. Dört güncel sekmede boş depo ile `utick2 → soteri → utick2` izlemesi0clear/0delete gösterdi. Bu test gerçek sertifikaların korunduğu anlamına gelmez. Son yeniden bağlamada iki hesabın temiz yükleme/yenileme erişimi geçti; doğrudan yerel sertifika hash karşılaştırması ve dolu-depo silme izi, konsol erişimi kesildiği için UNPROVEN kaldı. İzleme kurulan eski sekmeler kullanıcı tarafından yenilendi/kapatıldı; bu temizliğin kanıt sınırı ilgili makbuzda açıklandı.

Hesap değiştirmek için `Switch account` kullanılmalı. `Disconnect` bilinçli çıkıştır ve yerel cihaz/ilerleme kayıtlarını temizler; bilet sahipliğini silmez. Yayından sonra eski kodu çalıştıran sekmeler güncellenmelidir. Silinmiş yerel özel anahtar, zincirdeki açık anahtar veya eski işlem imzasıyla yeniden üretilemez.

## Açık kalan kabul grupları

**Son kapsam değerlendirmesi — 15 Eylül:** düşük çözünürlüklü kaynak kontrolü de tamamlandı.12yayının provider kaynak metadata'sı zincirdeki playbackId/asset hash'leriyle eşleşti; ikisi640×360, hiçbiri kare değil. Mevcut A klibiyle12,013s Auto oynatma,257ms ilk kare,0hata/uyarı/bekleme/stalled ölçüldü. Auto1280×720 çıktı kullandı; manuel kalite geçişi ayrı sınanmadı. Kanıtlar: `tmp/player-v2-source-inventory-20260915/receipt.json`, `tmp/player-v2-low-source-20260915/receipt.json`. Envanter/aynı klip oynatma tekrar önerilmez.

1. **Fiziksel cihaz ve native HLS:** güncel/önceki ana iOS/Safari, Android/Chrome ve gerçek native HLS yolu. Safari/Chrome/Edge kısa masaüstü oynatması geçti; bu bütün kontrol/uzun oturum matrisi veya native kabul değildir.
2. **Kalan süre/toparlanma ölçümleri:** Brave uzun oturumu geçti;10başlangıcın8,02s ortancası ve10Mbps kalibrasyonu kullanıcı kabulüyle kapandı. Oynarken seek→playing altı örnekte ölçüldü; tek4,442s aşımı uyarı olarak korunur. Diğer hedeflerin uzun oturumu ve native yenileme ölçümleri açık. Kabul edilmiş başlangıç süresi tekrar incelemeye alınmaz.
3. **Kalan önizleme matrisi:** gerçek VTT/resim/CORS, klavye, portrait fare/doğal yenileme ve tek sentetik401sonrası aynı bileşende toparlanma geçti. Fiziksel dokunma, geniş kaynak/sprite ve diğer hata türleri kapsamı açık; aynı tek-hata testi tekrar önerilmez.
4. **Kaynak geometrisi kapsamı:** düşük çözünürlüklü giriş uyumu geçti. Kare kaynak12mevcut yayında yok; kare kabulü UNPROVEN. Bu eksik için yeni upload/asset ayrı somut kapsam gerektirir, bu raporla onaylanmaz.
5. **Tarihsel belirsizlik:** dolu depodaki iki sertifikanın geçiş öncesi/sonrası ve yenileme sonrası karşılaştırması geçti; aynı kontrol tekrar istenmez. Eski canlı silinmenin kesin tetikleyicisi ve ara olayların sürekli izi kanıtlanmadı. Yeni kayıp belirtisi olmadan bunu yeni bir teşhis işi olarak açmak gerekmiyor.
6. **Ölçüm ve maliyet sınırları:** yeni Brave ve Safari koşularının süreleri ölçüldü; daha eski kullanıcı oynatmalarının süreleri ve provider artımlı fatura kesinleşmedi. Önceki koşul/pencere aşımları ve37ms'lik yaratıcı klip aşımı tarihsel makbuzlarda korunur; bütün geçmişin toplam oynatma süresi çıkarılmaz.

Genel kabul **açık**; tamamlanan ölçümler tekrar yapılmaz, uyarılar gizlenmez. Güncel sonraki gate belge yayını ön hazırlığıdır; Safari koşusunun kapsamı ve kalan ölçüm sınırları üstteki güncellemede belirtilmiştir.

| Kalan iş | Somut gereksinim / ilerleme yolu |
|---|---|
| Kare kaynak | Envanter tamamlandı: mevcut12yayında yok. Düşük giriş kontrolü geçti; kare için yeni kaynak veya açık kapsam kararı gerekir |
| Native HLS | Gerçek native yolunu kullanan destekli tarayıcı/cihaz; mevcut Mac Safari HLS.js'i öncelikli seçer. Prod tercihlerini değiştirerek test geçti denmez |
| Fiziksel telefon | Kullanıcı bu tur yalnız Mac bildirdi; gerçek iPhone/iPad veya Android bulunana kadar UNPROVEN |
| Uzun Safari ve tam kontrol matrisi | Edge ve Chrome uzun koşularının temel ölçümleri uyarılarla tamamlandı; kesintisiz/hatasız10dakika iddiası yok. Safari video bitişi ve dört oynarken yenileme gözlendi; bağımsız kesintisiz ilerleme/20 sarma ve tam kontrol matrisi açık kalır |
| Önizleme kapsam sınırı | Tek sentetik401toparlanması geçti; gerçek provider kesintisi ve fiziksel dokunma/geniş matris kanıtı değildir. Tek sarma süresi aşımı ayrıca korunur |
| Maliyet ve yayın kapanışı | Provider gerçek fatura etkisi ayrı; yerel dokümanların GitHub'a aktarımı/yayını ayrıca yetkilendirilir |

## Kanıt dizini ve bu belge değişikliği

Yerel makbuzlar repo kökündeki `tmp/` altında tutulur; yayımlanmış dokümantasyon bağlantıları değildir:

| Kanıt | Yerel kayıt |
|---|---|
| İlk dört kaynak adımı / ilk main CI | `player-v2-shared-player-20260913`, `player-v2-single-approval-20260913`, `player-v2-previews-20260913`, `player-v2-full-hd-20260913`, `player-v2-source-merge-20260913` |
| Kontrollü Full HD ve aynı ücretli dikey iş | `player-v2-two-account-retry-packet-20260913`, `player-v2-remaining-reciprocal-live-20260913`, `player-v2-portrait-release-20260914` |
| Son kaynak ve yayın eşleşmesi | `player-v2-duplicate-account-hotfix-20260914`, `player-v2-duplicate-account-release-20260914` |
| Anahtar kaybı, sürüm farkı, izole tekrar üretim | `player-v2-device-key-loss-diagnosis-20260914` |
| Güncel sürüm boş-depo geçiş izlemesi | `player-v2-single-version-trace-20260914/trace-results.json` |
| Son iki cihaz işlemi ve iki hesap erişimi | `player-v2-device-rebind-live-20260914/receipt.json`, `ui-verification.json`, iki `activation-final.json`, `canary-2-final.json`, `readiness.json` |
| Bu belge gate'i | `player-v2-acceptance-closeout-20260914` |

Bu gate yalnız [planın güncel özetini](./player-v2-plan.md), bu raporu ve yerel kanıtlarını değiştirir. Uygulama kodu, diğer37kirli dosya, HEAD ve staging korunur. Commit/push/PR/merge/CI tetikleme veya deploy yapılmadı. Belge değişiklikleri henüz GitHub'a yayımlanmış sayılmaz.
