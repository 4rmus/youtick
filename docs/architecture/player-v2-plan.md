# YouTick Player V2 — ortak oynatıcı

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


13 Eylül 2026 — Kullanıcının uygulama için verdiği nihai planın kaydı.

## Güncel durum — 15 Eylül 2026

**Son Chrome uzun oturum sonucu — COMPLETED_WITH_WARNINGS:** sarma sıçramaları hariç601,119s video ilerlemesi,20oynarken sarma grubu ve6oturum token yenilemesi kaydedildi. Olay sayacı620,054s, SDK sayacı769,168s bildirdi; uyuşmazlık nedeniyle SDK değeri gerçek oynatma bütçesi kanıtı sayılmadı. İki SDK hata olayı ve oturumdaki duraklama korunur; kesintisiz/hatasız kabulü yok. Sayılabilir sarma gruplarının en uzunu2,808s. Konum0, yenileme erişimi ve temiz sekme durumu doğrulandı; yeni imza/ödeme yok. Güncel tek sonraki gate **PLAYER_V2_SAFARI_LONG_SESSION_LIVE**: Safari/utick2 mevcut yetkisiyle aynı haklı M2 trace kaynağında10dakika/2yenileme/20sarma, en fazla12dakika oynatma ve30dakika duvar saati. Safari'nin HLS.js yolu native HLS kabulü sayılmaz. Bu belge turunda test başlamadı; aşağıdaki Chrome önerisi tarihsel kayıttır.

**Son uzun oturum sonucu:** Edge/soteri aynı sayfada620,1175s gerçek oynatma, oynarken3başarılı yenileme ve20sarma toparlanması tamamladı. Sonuç COMPLETED_WITH_WARNINGS: aradaki duraklama sayılmadı; kesintisiz10dakika iddiası yok, üç sarma3s hedefini aştı (en çok14,498s), SDK konsol toplamı kısmi. Süre önceden kurulan olay bazlı sayaçla doğrulandı; konum0 ve temiz sayfa geri yüklendi. Güncel tek sonraki gate **PLAYER_V2_CHROME_LONG_SESSION_LIVE**: Chrome/utick2 mevcut yetkisiyle, envanterde hakkı bulunan600,026s M2 trace yayını (`lp-491fb8eb-451f-4fc6-918e-b94d6876fc02`);10dakika gerçek oynatma/2yenileme/20sarma, en fazla12dakika oynatma ve30dakika duvar saati. Başlamadan güncel hak/cihaz kontrol edilir; yeni bilet veya cihaz işlemi yapılmaz. Bu belge turunda yeni test başlamadı; aşağıdaki eski Edge önerileri tekrarlanmaz.

**Son önizleme sonucu:** gerçek uygulamada tek sentetik VTT401sonrası zaman-only görünümü, doğal token yenilenince aynı DOM bileşeninde203×360 resmin geri gelmesi doğrulandı. Video oynatma/imza/ödeme0;6önizleme isteği. İşlevsel PASS, hazırlık dahil428,636s süre5dakika sınırını aştığından COMPLETED_WITH_WARNINGS. Geçici müdahale ve test sekmesi kaldırıldı. Gerçek provider kesintisi veya fiziksel dokunma testi sayılmaz. Güncel tek sonraki gate **PLAYER_V2_EDGE_LONG_SESSION_LIVE**: mevcut Edge/soteri yetkisiyle uzun oturum (10dakika oynatma, en az2yenileme/20sarma; toplam en fazla12dakika oynatma ve30dakika duvar saati). Bu belge turu yalnız sonuçları kaydeder, yeni koşu başlatmaz; aşağıdaki eski önizleme hazırlığı önerileri tekrarlanmaz.

**Son sarma sonucu:** oynarken üç tampon içi ve üç tampon dışı örnek aynı tarayıcı saatiyle ölçüldü; tamamı yeniden oynadı. Tampon içi16–25,8ms, tampon dışı1,130/2,637/4,442s. Bir örnek3s hedefini aştığından COMPLETED_WITH_WARNINGS olarak kaydedildi. Yeni imza/ödeme yok; eski konum ve temiz sayfa durumu korundu. Ölçüm artık eksik değil; aşım gizlenmedi veya ayrıca kullanıcı kabulüyle kapatılmış sayılmadı. Güncel tek sonraki gate **PLAYER_V2_PREVIEW_ERROR_RECOVERY_PREFLIGHT**: mevcut hata-toparlanma kanıtı ve güvenli kontrol kapsamını hazırlamak. Aşağıdaki önceki sarma önerileri tarihsel kayıttır.

**Son kabul güncellemesi:** Brave'de sertifika korunumu, fare/doğal yenileme önizlemesi ve düşük giriş uyumu; Safari, Chrome ve Edge'de kısa gerçek oynatma doğrulandı. Chrome/utick2 ve Edge/soteri cihaz işlemleri ayrı kullanıcı onayıyla kesinleşti; yerel sertifikalar zincirle eşleşti ve yenileme sonrası erişim korundu. Chrome30,251s oynatma/0bekleme; Edge30,209s oynatma/336ms bekleme, ikisinde hata0 ve son görüntü1080×1920. Bu kısa koşular uzun oturum veya native HLS kabulü değildir. Mevcut12yayında kare kaynak yok. Güncel kalan kapsam [kabul raporundadır](./player-v2-acceptance-closeout.md#açık-kalan-kabul-grupları). Tek sonraki gate **PLAYER_V2_PLAYING_SEEK_RECOVERY**: mevcut Brave yetkisiyle oynarken sarma-toparlanma süresini ölçmek; yeni cihaz/imza gerektiren hazırlık tekrarlanmaz. Bu belge güncellemesinde yeni test başlatılmadı.

**Son kullanıcı kararı:** 10Mbps profil kalibrasyonu ve kontrollü koşuda ölçülen başlangıç süreleri **kullanıcı kabulüyle kapatıldı**.10başlangıç örneğinin ilk-kare ortancası8,02s;20duraklatılmış sarma hedefi doğrulandı. Kullanıcı bu süreleri makul buldu; yeniden kalibrasyon veya başlangıç gecikmesi teşhisi yapılmayacak.2,48Mbps kalibrasyon ölçümü ve eski3s hedefinin karşılanmadığı teknik kayıt korunur. Ölçülmemiş seek→playing süresi, native HLS ve diğer platform maddeleri açık kalır; genel kabulün tamamı kapanmış sayılmaz. Bu aşamada yeni gate/test başlatılmıyor. Aşağıdaki önceki sonraki-adım ifadelerinin yerini bu karar alır.

Beş ana aşamanın ilk dördünün kaynak uygulaması main'e alınmış ve public-testnet'te yayımlanmıştır. Genel kabul aşaması kısmen doğrulanmıştır; planın tamamı kapanmış değildir. İki hesaplı Brave/bilet/yenileme kontrollerinin son sonucu **COMPLETED_WITH_WARNINGS**. Yeni yüklemelerin varsayılanı **adaptive/720p**; mevcut kontrollü 1080p yayınlar oynatılabilir.

Güncel kaynak `bef0d43468b8b4671e82b8a8bffa5617c3c25e63`; [main CI34847682414](https://github.com/4rmus/youtick/actions/runs/34847682414) ve [korumalı testnet yayını34849181974](https://github.com/4rmus/youtick/actions/runs/34849181974) başarılı. Yapılanlar, kalan kabul grupları, imza yenilemelerinin nedeni ve kanıt sınırları [Player V2 kabul kapanış raporunda](./player-v2-acceptance-closeout.md) toplanmıştır.

Aşağıdaki tarihli kapanışlar kendi günlerinin kayıtlarıdır. Eski `NOT_DEPLOYED` ve “sonraki gate” ifadeleri güncel durum yerine kullanılmamalıdır. Brave uzun koşusunda634,398s oynatma,5token yenilemesi ve20planlı sarma; gerçek Livepeer önizlemesinde640×360 resim; Safari'de mevcut biletle kısa oynatma/sarma/yenileme ve12.saniyeden devam doğrulandı. Safari sonucu HLS.js yoludur, native HLS kabulü değildir. [Genel kabul ön hazırlığındaki güncel matris](./player-v2-general-acceptance-preflight.md) kalanları gösterir. Tek sonraki aşama **PLAYER_V2_CONTROLLED_PERFORMANCE_PREFLIGHT**: mevcut Brave yetkisiyle10Mbps ölçüm yöntemini ve somut test sınırlarını hazırlamak; bu belge yeni test, işlem veya yayın yetkisi vermez.

## Kapsam ve kararlar

Mevcut Livepeer React player, HLS.js ve YouTick görünümü korunur. Telefon markasına göre ayrı arayüz kurulmaz; ekran boyutu ve tarayıcı yetenekleri kullanılır. Yeni player bağımlılığı eklenmez. NEAR ekonomik/izleme hakkı, Livepeer medya, Bridge kontrol otoritesidir.

- Tek ayar menüsü: hız, gerçek kaynaklardan kalite, Türkçe/İngilizce.
- Dokunma alanı en az44×44; çift dokunma ±10 saniye; mevcut klavye kısayolları, ses, tam ekran ve destekleniyorsa küçük pencere.
- Hızlar0,75/1/1,25/1,5/2×; yeni izleme1×. Kalite yeni oynatıcıda Otomatik; eksik seçenek uydurulmaz, kare/dikey kaynaklarda gerçek boyutlar gösterilir.
- Tarayıcı dilinden başlangıç, ayarlardan değişiklik ve dil tercihinin cihazda tutulması.
- Aynı cihaz/hesap/ağ/Market/video/sürümde Devam et/Baştan başlat. Yalnız konum, süre, kayıt zamanı; token, URL ve anahtar kaydı yok. Beş saniyelik aralık ve pause/pagehide kaydı; ilk10s veya sona15s kaldığında öneri yok. Çıkışta bütün kayıtlar temizlenir; gecikmiş sekme/yazıcı kaydı geri oluşturamaz. Depolama hatası oynatmayı durdurmaz.
- İlk satın alma cihaz yetkisini aynı ödeme içinde taşımaya devam eder. Mevcut bilet için tek açık cihaz aktivasyonu; otomatik JWT alımı/yenilemesi ikinci cüzdan işlemi değildir.
- Mevcut Livepeer sarma önizlemeleri; kaynak yoksa yalnız zaman. Yeni üretim/asset/yükleme/depo yok.
- Yalnız yeni videolarda360p/720p/1080p;1080p için5Mbps/30fps/H.264. Eski profiller/yayınlar/ücretli işler korunur.
- Altyazı, üretici bölüm düzenleme, R2, Cloudflare Stream, yeni depolama ve harici player ürünü bu sürümün dışındadır. Mevcut Web/Bridge/D1/Queue korunur. Eski kontrollü V1 kabulü yeniden açılmaz.

## Gate sırası

Her seferinde yalnız bir gate uygulanır, doğrulanır, kanıtı kaydedilir ve raporlanır. Sonraki gate otomatik başlamaz; COMPLETED_WITH_WARNINGS ilerleme yetkisi değildir.

| Gate | Amaç | Durum |
|---|---|---|
| PLAYER_V2_SHARED_PLAYER_SOURCE | Ortak arayüz, medya uyumluluğu, kontroller, dil, yerel devam | Kaynak ve testnet yayını tamamlandı; fiziksel cihaz kabulü eksik |
| PLAYER_V2_SINGLE_APPROVAL_ACCESS | Hak sorgusu loading/error ayrımı, tek cihaz işlemi | Kaynak/yayın tamamlandı; iki hesapta FINAL cihaz işlemleri ve yenileme sonrası erişim doğrulandı |
| PLAYER_V2_LIVEPEER_PREVIEWS | Yetkili mevcut VTT/resimlerini bağlama | Gerçek VTT/resim/CORS, klavye, fare/doğal yenileme ve tek sentetik401sonrası aynı bileşende toparlanma geçti; fiziksel dokunma/geniş matris açık |
| PLAYER_V2_FULL_HD | Eski/yeni profil uyumluluğu ve kontrollü etkinleştirme | Kontrollü yatay/dikey yayın ve 1080p çözme doğrulandı; yeni yükleme varsayılanı tekrar720p |
| PLAYER_V2_ACCEPTANCE | Gerçek cihaz/provider kabulü | Başlatıldı, kısmen doğrulandı; genel kabul tamamlanmadı |

### İlk gate sınırı

Yalnız Web player bileşenleri/yardımcıları, ilgili testler ve belgeler değişir. Bridge, sözleşme, profil, ayar, secret, provider, D1/NEAR ve canlı ortam değişmez. Commit/push/PR/CI/deploy bu gate'in parçası değildir. Tek writer ana ajandır; incelemeler salt okunurdur.

### Ortak oynatma uygulaması

Gerçek HLS seviyeleri varsayılan ABR sınıfına küçük bir olay bağlantısıyla okunur; algoritma değiştirilmez. Başlangıç ve liste değişiminde SDK olayları tamamlandıktan sonra Auto; yalnız açık kullanıcı seçimi gerçek level index'ini değiştirir. Manuel seçim `nextLevel` ile ilerideki tamponu kısmen yeniler; yalnız `loadLevel` kullanımı tamamen tamponlanmış videoda görünür kaliteyi değiştirmediği için seçilmedi. Auto `loadLevel=-1` kullanır. Menü tıklama/klavye olayları SDK'nın oynatma/sarma kısayollarından ayrılır.

HLS.js destekleniyorsa mevcut JWT header/timeline yolu kullanılır. Native-only yolda temiz HLS kaynağı SDK'nın video türüyle başlatılır; JWT URL'yi SDK oluşturur. Yeni JWT aynı store/DOM video üzerinde uygulanır; konum/hız/paused durumu korunur. Kaynaksız Root yaklaşımı kullanılmaz: SDK kontrolleri ve yerel ölçümleri korunur. Native signed URL'nin dış SDK telemetry'ye gönderilmesi engellenir; yeni izleme/raporlama servisi kurulmaz.

Konum, mevcut cihaz IndexedDB deposunda ayrı anahtarla tutulur; yeni DB sürümü/şema yok. Kayıt yalnız token hazırlığının gözlediği oturum revision'ı ve cihaz anahtarıyla yazılır. Mevcut logout transaction'ı hem cihazı hem konumları temizler. Bekleyen kayıt açılışı ve bellekteki retry konumu da logout'ta iptal edilir. pagehide yazısının bitmesi tarayıcı kapanışında garanti değildir; periyodik kayıt esas alınır.

### Sonraki gate'lerin arayüz kararları

`activate_playback_device(publication_id, playback_session)`: hesap signer'dan, doğrudan işlem ve tam1yoctoNEAR; mevcut bilet/üreticilik ve uygun yayın durumu zorunlu.30gün/3cihaz, dördüncüde en eski cihazı çıkarma korunur. Aynı geçerli cihaz+sertifika+authorizing signer key tekrarı süreyi uzatmaz; anahtar değişimi kurtarılabilir. Belirsiz yanıt aynı kayıtla uzlaştırılır, otomatik ikinci işlem yok. Kesinleşmiş kayıt ve ilk V2 token başarı koşuludur. ABI/protokol güncellenir; sözleşme veri düzeni değişmez. Hak sorgusu hatasında yeniden ödeme sunulmaz.

Önizleme kaynağı yetkili yanıtta isteğe bağlı olur; başlangıcı bekletmez. VTT/resim istekleri ayrı izinli fetch ve bellek Blob'u kullanır; dış kaynak/yönlendirme reddedilir. Önizleme hatası video hatasına dönüşmez.

1080p önce Web/Bridge/Market tarafından eski profillerle birlikte okunur; sonra bakım koşullu yönetici işlemi varsayılanı değiştirir.120s açık teklifler ve gönderilmiş ödemeler uzlaştırılır; ödenmiş işler kendi profiliyle devam eder. Geri dönüş yeni yüklemeleri720p yapar, mevcut1080p oynatmasını kaldırmaz. Ücret tarifesi değişmez; provider maliyeti etkinleştirme paketinde değerlendirilir.

## Doğrulama

[Mevcut test komutları](../testing.md) kullanılır. LOCAL_TEST, CI, PROVIDER ve gerçek cihaz kanıtları ayrılır. Kontrol menüsü, gerçek kalite eşleşmesi, token yenileme/retry, konum izolasyonu, bozuk/kapalı depolama, sekmeler arası çıkış ve geç başlangıç/yazı karşı örnekleri yerelde sınanır.

Birleşik kabulde güncel/önceki ana iOS/Safari, güncel Android/Chrome ve masaüstü Brave/Chrome/Edge/Safari hedeflenir. Her hedefte10dk izleme, en az2token yenilemesi,20sarma;10Mbps kontrollü bağlantıda10başlangıç örneği için ortanca≤3s ve sarma/toparlanma≤3s. Native yenilemede konum sapması≤1s, bekleme≤2s ölçülecek hedeflerdir, mevcut garanti değildir. Yerel MP4/native test düzeneği gerçek Safari HLS kabulü sayılmaz.

Canlı yayın/işlem gate'i exact kaynak/CI/çıktı, ücret/limit ve korumalı workflow paketiyle ayrı açık onay ister. Kullanıcı gerçek cüzdanı imzalar. Bu plan yeni canlı işlem yetkisi vermez.

## İlk gate kapanışı — 13 Eylül 2026

**PLAYER_V2_SHARED_PLAYER_SOURCE — COMPLETED_WITH_WARNINGS / LOCAL_STATIC / LOCAL_TEST / NOT_DEPLOYED.** Temiz `74ae2ebbef5ee1fab3fe147fa05f61f409eb7c8f` tabanı üzerinde yalnız izinli Web/test/belge dosyaları değişti. Commit, push, PR, CI veya deploy yapılmadı.

- İlgili beş Vitest dosyası: **86 PASS**. Mevcut HLS canary kontrol dosyası: **7 PASS**. TypeScript, ilgili dosyaların lint kontrolü, Web build ve belge build geçti.
- Gerçek Brave + gerçek Livepeer SDK + yerel sentetik medya: manuel360p/720p görüntü boyutu,1,5× hız, menü/klavye ayrımı, tam ekran,320px görünüm, Türkçe seçimi, çift dokunma ±10s, yeniden açılışta Devam et ve seçim yapmadan tekrar açılışta kaydın korunması geçti.
- Native kaynak bağlantısı yerel MP4 ile sınandı: aynı DOM video, ilk token + üç yenileme, oynarken/duraklatılmışken konum ve hız koruması; yerel SDK heartbeat mevcut, native dış telemetry isteği0. **Bu gerçek Safari/HLS kabulü değildir.** Bütün provider istekleri yerelde yanıtlandı/engellendi; gerçek hesap/ödeme/upload yok.
- Konum deposunun write→logout, logout→geç write, geciken başlangıç→yeni oturum, video/hesap ayrımı ve bozuk/kapalı depolama karşı örnekleri geçti. İzleme kaydı mevcut cihaz IDB store'unda ayrı anahtardır; auth veri düzeni ve anahtar davranışı değişmedi.
- Mevcut Next.js middleware uyarısı ve Vite/VitePress araç uyarıları korunur. Gerçek telefonlar, provider süreleri ve sayısal performans hedefleri **UNPROVEN**; eski Video V1 kabulü yeni player kanıtı sayılmadı.

Kanıt: `tmp/player-v2-shared-player-20260913/receipt.json`, tarayıcı ekran görüntüleri ve dosya hash'leri. Bu gate'in uygulama engeli yok. **Tek sonraki gate: PLAYER_V2_SINGLE_APPROVAL_ACCESS — BAŞLATILMADI.**

## Tek onaylı erişim kapanışı — 13 Eylül 2026

**PLAYER_V2_SINGLE_APPROVAL_ACCESS — COMPLETED_WITH_WARNINGS / LOCAL_STATIC / LOCAL_TEST / NOT_DEPLOYED.** Kullanıcının devam talimatıyla yalnız ikinci gate uygulandı. İlk gate'in kirli dosyaları başlangıçta kopyalandı; onun kontrolleri, medya bağlantısı ve konum kayıtları korundu.

- Market'e `activate_playback_device` eklendi: mevcut bilet/üreticilik, doğrudan signer, tam **1 yoctoNEAR**, Ed25519, yayın durumu ve bakım kontrolü. Aynı geçerli cihaz/sertifika/imzalayan anahtar tekrarında süre değişmez; farklı anahtar veya bitmiş süre açık işlemle yenilenir. Üç cihaz sınırı, depolama rezervi ve mevcut ödeme davranışı korunur. Contract Borsh düzeni değişmedi.
- Web, açık kullanıcı eyleminde tek Market işlemi gönderir. Önce hesap, yayın ve izleme hakkını kontrol eder; kayıp yanıtta aynı kalıcı cihazı en fazla beş okumayla uzlaştırır. Otomatik ikinci işlem veya tekrar bilet alımı yok. Belirsiz sonuçta ilk eylem **Tekrar kontrol et** olur; yeniden doğrulama ayrı açık kullanıcı eylemidir. Başarılı kayıt yalnız normal token alımını başlatır; token reddinde oynatıcı açılmış sayılmaz.
- Hak yanıtı kesin boolean olmalıdır. İlk sorgu, eski false yanıt yenilenirken veya sorgu hatasında satın alma/ödeme paneli gösterilmez. Mevcut doğrulanmış true yanıtla oynatma, geçici arka plan hatası nedeniyle ödeme ekranına düşmez; Bridge son yetki kontrolünü korur.
- **LOCAL_TEST:** Web'de 7 dosyada **133 PASS**; Market Rust 1.86.0 ile **49 PASS**; Bridge V2 **39 PASS / 3 isteğe bağlı SKIP**. Yerel Brave'de gerçek React bileşeni, işlem kodlayıcı ve aktivasyon yardımcısıyla **5 senaryo PASS**: başarı, kayıp yanıt, token reddi, iptal, belirsiz sonuç. Her senaryoda tek mock cüzdan işlemi; gerçek cüzdan/zincir çağrısı yok. 320px doğrulama ekranı incelendi.
- TypeScript, ilgili lint, Web build, Rust fmt/clippy ve protokol kontrolü geçti. Pinli **cargo-near 0.17.0 / Rust 1.86.0** ile yeni Market WASM/ABI üretildi; ABI kontrolü **Market 46 / Access 26** geçti. Access için değişmemiş önceki yerel ABI girdisi kullanıldı; yeni Access yayını veya CI kanıtı değildir.
- Bridge uygulama kodu değişmedi; eksik cihaz reddinden sonra yeni final kaydın aynı Worker'da token alabildiği ek regresyonla doğrulandı. Üç SKIP mevcut isteğe bağlı yük/abuse koşularıdır. Gerçek zincir transaction/telefon/provider kabulü ve NEAR sandbox koşusu bu gate'te çalıştırılmadı.

Kanıt: `tmp/player-v2-single-approval-20260913/receipt.json`, `baseline.json`, gate'e özel fark dosyası ve `activation-mobile.png`. Kaynak uygulama engeli yok. **Yeni Market metodu, Web aktivasyon düğmesinden önce korumalı yayınla devreye alınmalıdır.** Bu gate commit/push/PR/CI/deploy veya canlı ödeme yapmadı.

**Güncel tek sonraki gate: PLAYER_V2_LIVEPEER_PREVIEWS — BAŞLATILMADI.** Yukarıdaki ilk gate kapanışının sonraki-adım kaydı tarihsel sırayı anlatır.

## Sarma önizlemeleri kapanışı — 13 Eylül 2026

**PLAYER_V2_LIVEPEER_PREVIEWS — COMPLETED_WITH_WARNINGS / LOCAL_STATIC / LOCAL_TEST / NOT_DEPLOYED.** Kullanıcının devam talimatıyla yalnız üçüncü gate uygulandı; önceki iki gate'in kirli dosyaları başlangıç kopyasıyla korundu.

- Yetkili V2 token yanıtına isteğe bağlı `preview_vtt_url` eklendi. Kaynak aynı playback ID için zaten okunan Livepeer metadata'sından seçilir ve mevcut policy cache'inde tutulur. Ek provider sorgusu/VTT/resim okuması token yoluna eklenmedi. Eksik veya güvensiz isteğe bağlı kaynak tokenı bozmaz; V1 zaman göstergesiyle devam eder.
- Web, fareyle gezinme, klavye veya dokunarak sürüklemede mevcut VTT'yi ve gereken resmi güncel JWT header'ıyla okur. Kaynak/credential/query/fragment, yönlendirme, boyut/süre, raster imza ve piksel sınırları denetlenir. `xywh` kırpması yereldir; aynı sprite'ın farklı kareleri tek indirmeyle gösterilir. İlk oynatmada önizleme isteği yoktur.
- Yeni resim istekleri 120 ms bekler, eski istekler iptal edilir. Etkin önizlemede yalnız son resim tutulur; kapatıldığında Blob URL kaldırılır. Hata veya olmayan metadata yalnız zaman gösterir; hata oynatmayı/izleme hakkını değiştirmez. Token yenilemesi başarısız önizleme isteğini yeni tokenla tekrar deneyebilir.
- **LOCAL_TEST:** Web 4 dosyada **64 PASS**; Bridge 3 dosyada **174 PASS / 3 mevcut isteğe bağlı SKIP**. Tip/lint, Web build ve protokol kontrolü geçti. Yerel Brave'de gerçek SDK/medya ile fare, klavye, 320px dokunma, sprite yeniden kullanımı, Blob temizliği, 401 sonrası yenileme ve metadata yokluğu geçti. Önceki kalite/hız, tam ekran, devam ve native kaynak testleri aynı koşuda geçti.
- Tarayıcı koşusunda **9 yerel önizleme isteği** vardı; dış provider/chain/wallet çağrıları engellendi veya fixture ile yanıtlandı. Gerçek Livepeer CORS/asset ve fiziksel telefon kabulü **UNPROVEN**. Yerel sentetik medya bu kanıtın yerine geçmez.
- Sözleşme, profil, ücret, upload, provider ayarı, R2/Cloudflare Stream, D1 ve secret değişmedi. Commit/push/PR/CI/deploy veya gerçek ödeme yapılmadı. Yeni response alanı isteğe bağlıdır; Web/Bridge farklı kaynak sürümlerinde önizlemesiz oynatma korunur.

Kanıt: `tmp/player-v2-previews-20260913/receipt.json`, `baseline.json`, gate farkı ve masaüstü/mobil ekran görüntüleri. Kaynak uygulama engeli yok.

**Güncel tek sonraki gate: PLAYER_V2_FULL_HD — BAŞLATILMADI.** Önceki kapanışlardaki sonraki-adım satırları tarihsel sıradır.

## Full HD kaynak kapanışı — 13 Eylül 2026

**PLAYER_V2_FULL_HD_SOURCE — COMPLETED_WITH_WARNINGS / LOCAL_STATIC / LOCAL_TEST / NOT_DEPLOYED.** Dördüncü gate'in kaynak uygulaması tamamlandı; canlı profil etkinleştirmesi ve genel Player V2 kabulü tamamlanmadı. Önceki üç gate'in kirli dosyaları başlangıç kopyasıyla korundu.

- Registry'ye `fullHd` eklendi: değişmeyen 360p/720p üzerine **1920×1080, 5 Mbps, 30 fps, H.264 Baseline**. Hash `a6751ecd819f080430d3bea4cab0d7b906cd729993c925ae16c676433fe65752`; eski hash'ler ve profiller aynı.
- Web/Bridge `[legacy]`, `[adaptive, legacy]` ve `[fullHd, adaptive, legacy]` sıralarını tanır. Yeni iş yalnız etkin listenin ilk profilini kullanır; ücretli eski işler kayıtlı hash, aynı TUS/asset ve ilk son tarih ile sürer. Geri dönüşten sonra full-HD yayınların token alması korunur.
- `set_public_upload_full_hd(enabled)` yalnız admin, testnet ve iki bakım kontrolü altında çalışır. Başlangıç yine adaptive/720p; metot kendiliğinden çağrılmaz. Kapatma yeni işleri 720p'ye döndürür; mevcut full-HD işleri yeniden işlemez veya destek dışına çıkarmaz. Borsh veri düzeni, fiyatlar, kotalar, deadline, secret ve provider ayarları değişmedi.
- Yeni profilin doğrulaması kaynak boyutlarını zorunlu tutar ve büyütülmüş çıktıyı kabul etmez. Kaynak 720p/480p/240p ise kaynağa uygun daha düşük üst seviye kabul edilir; zorla 1080p aranmaz. Eksik kaynak bilgisi veya uyumsuz HLS/MP4 çıktısı yayıma geçirilmez. Bu kontrol eski profillerin kabul davranışını değiştirmez. Sağlayıcıda gerçek sonuç ayrıca sınanmalıdır; [Livepeer profil kaynağı](https://github.com/livepeer/catalyst-api/blob/56aff2d85fe064e610dc15d5793c23199267fb5b/video/profiles.go) istenen profillerle gerçek çıktıların ayrı ele alınması gerektiğini destekleyen referanstır, canlı sürüm kanıtı değildir.
- **LOCAL_TEST:** Web upload **47 PASS**; Market **51 PASS**; Bridge dört ilgili dosya **337 PASS / 3 mevcut isteğe bağlı SKIP**. Rust 1.86.0 fmt/clippy, Web lint/type/build, Bridge type ve profil/protokol kontrolü geçti. cargo-near 0.17.0 ile yeni WASM/ABI üretildi; **Market 47 / Access 26** ABI kontrolü geçti. Access girdisi önceki değişmemiş yerel ABI'dir.
- `node scripts/player-browser-check.mjs --full-hd`: 30 saniyelik yerel kaynakta gerçek **640×360 → 1280×720 → 1920×1080** çözme ve Auto'ya dönüş PASS. Normal komut önceki 720p regresyon düzeneğini korur. İlk 120 saniyelik geniş HD koşusu sonraki native bölümde tarayıcı kapanması nedeniyle tamamlanamadı; nedeni kanıtlanmadı. Odaklı HLS başarısı bu geniş/native veya gerçek telefon kabulünün yerine geçmez.

Kanıt: `tmp/player-v2-full-hd-20260913/receipt.json`, başlangıç hash'leri, gate farkı, `player-full-hd.png` ve **çalıştırılmamış** `activation-package.json`. Paket, repo kayıtlarından hedef/rol ve `enabled: true/false` çağrılarını tanımlar; canlı bilgiler, ücret/bütçe, exact CI çıktısı ve yayın onayı tamamlanmadan çalıştırılabilir değildir.

**Güncel tek sonraki gate: PLAYER_V2_FULL_HD_RELEASE_PREFLIGHT — BAŞLATILMADI.** Önceki kapalı kaynak gate'leri tekrar açılmaz. Yayın öncesi birlikte değerlendirilecek aday dört kaynak adımını içerir; mevcut 720p politikası altında uyumlu Market/Bridge/Web yayını, sonra ayrı kontrollü etkinleştirme gerekir. Bu çalışma commit/push/PR/CI/deploy, yeni ödeme/upload veya canlı NEAR/provider/D1 işlemi yapmadı.

## Yayın ön kontrolü kapanışı — 13 Eylül 2026

**PLAYER_V2_FULL_HD_RELEASE_PREFLIGHT — COMPLETED_WITH_WARNINGS / NOT_DEPLOYED.** Amaç dört yerel kaynak adımını yayın için uzlaştırmaktı. Değişiklik sınırı test düzeneği ve belgelerdi; ürün kodu, sözleşme, canlı ayarlar ve kullanıcı verisi değiştirilmedi. Başlangıçtaki 38 kirli dosya kopyalandı; staged dosya yok.

- **LOCAL_TEST:** Önceki 132 MiB native fixture ile tarayıcı kapanması yeniden üretildi. Yalnız yerel HTTP Range yanıtını en fazla 1 MiB yapmak aynı fixture üzerinde geniş testi geçirdi; ürün player'ına düzeltme eklenmedi. Bu, test aktarım yolunu ayıran karşılaştırmalı kanıttır; tarayıcının iç kapanma nedeni (örneğin bellek sınırı) ayrıca kanıtlanmış değildir. Kalıcı `--full-hd --extended` komutu yeni 120 saniyelik1080p kaynakla **360p→720p→1080p→Auto**, tüm ortak kontroller, devam/çıkış, önizleme ve native MP4 bağlantısını birlikte doğruladı: **315 yerel medya isteği, ilk token+3 yenileme, 9 önizleme isteği, PASS**. İlgili 8 Web dosyasında **179 PASS**. Normal720p geniş regresyon da düzeltme öncesi yeniden geçti.
- **CI / salt okunur:** GitHub main `74ae2ebbef5ee1fab3fe147fa05f61f409eb7c8f`, [CI34714711671](https://github.com/4rmus/youtick/actions/runs/34714711671) success. Player V2 henüz bu kaynakta yok. Son [public-testnet yayını34683764285](https://github.com/4rmus/youtick/actions/runs/34683764285) `b53e00e` kaynağına ait. `public-testnet` korumalı ortamında gerekli reviewer/branch kuralı var; Preview ve public-testnet deploy anahtarları false. Bu anahtarlar çalışan ürünün kapalı olduğunu göstermez.
- **PREVIEW / salt okunur, 08:02 UTC:** Web ana sayfa200; Bridge200, sürüm `0f45b81e-8f7d-485c-aad8-51e076910a3c`, yükleme ve V2 oynatma hazır; read-model200, sürüm `91063507-21ec-46df-8d56-2542b8d6e37b`, ingestion açık. Web'in çalışan artifact/sürüm eşleşmesi bu tur yeniden kanıtlanmadı. İlk Python HTTP denemeleri403 döndü; curl ile gözlenen200 ayrı kaydedildi,403 ürün arızası sayılmadı.
- **PREVIEW / zincir:** Aynı final blok268367860'da Market `video-market-v1-260907.youtick-dev-v3.testnet`; politika `[adaptive,legacy]`, bakım kontrolleri false/false, yayın sayısı10. Kod `HyMxZxV2bF7NZjuUUxFFKcJEDc6pJCvwCERR7gUFCesB`,366633bayt. Kaynakta kayıtlı code-update politikasının eski kod hash'i, bayt boyutu ve operator allowance'ı güncel değil. Sonraki gerçek yayın için bunlar ve final raw-state hash'i yeniden hazırlanmalı; eski paket doğrudan çalıştırılmamalı. Açık teklifler/ödemeler/işler bu sınırlı okumayla uzlaştırılmış sayılmaz.
- **Maliyet hazırlığı:** Yerel376354bayt WASM'a göre yalnız ek kod depolaması9721bayt/0,09721 testNEAR; mevcut rezervden bu fark düşülünce yaklaşık0,94051 testNEAR kalır. Bu hesap CI artifact'i, işlem ücreti veya onaylı harcama limiti değildir. [Livepeer'ın yayımladığı Growth tarifesi](https://livepeer.studio/pricing) dönüştürme0,33$/60dk, saklama0,09$/60dk, dağıtım0,03$/60dk ve aylık100$ asgari tutar gösteriyor. Projenin gerçek aboneliği/kotası,1080p'nin faturalandırılma şekli ve ek fatura tutarı doğrulanmadı; hesap bütçesi ve canlı deneme limiti olmadan etkinleştirme yapılmaz. Uygulama ücret tarifesi aynı kalır.

Kanıt paketi: `tmp/player-v2-release-preflight-20260913/receipt.json`, `activation-package.json`, `source-publication-package.json`, `candidate.patch`, tarayıcı logları, zincir ve GitHub/health okumaları. Önceki gate makbuzları tarihsel kanıt olarak korunur; bu paket güncel ön kontrol kaydıdır.

### Somut yayın sırası ve engeller

1. **Bir sonraki tek gate — PLAYER_V2_SOURCE_PUBLICATION:** Paketteki38 explicit dosyayı ayrı kaynak dalında commit/push edip PR açmak ve o adayın CI sonucunu kontrol etmek. Önerilen başlık: `feat: improve player controls and playback access`. Bu adımlar henüz onaylanmadı; PR merge de bu onayın dışında tutulur. Commit/push'ın tetiklediği olağan CI bu kaynak yayınının parçasıdır; manuel CI tekrar çalıştırma ayrıca açık onay ister.
2. Birleştirilmiş exact main/başarılı CI artifact'leriyle, yeni bir yayın gate'inde bakım ve açık iş/ödeme uzlaştırması hazırlanır. Eski code-update politika dosyası güncellenir; güncel allowance, kod ve raw-state özetleri, işlem hesabı ve tutar/limit kullanıcıya sunulur. İki bakım kontrolü ve Web/Bridge admission kapanması kendi onaylı sırasıyla uygulanır; kullanılmamış120s teklifler sona erer, ödenmiş işler ilk profil/asset/son tarihini korur. Market metodu, Web düğmesinden önce korunmuş workflow ile yayımlanır. Ardından uyumlu Bridge/Web yine720p politikasıyla yayımlanır. Çalışan sürümler ayrıca doğrulanır.
3. Ayrı onaylı1080p etkinleştirmesinde admin `set_public_upload_full_hd({enabled:true})`,0yocto ek tutar/100Tgas sınırı, iki bakım kontrolü ve final profil doğrulaması gerekir. Ağ ücretinin parasal üst sınırı ve provider bütçesi henüz onaylı değildir. Tekrar açma mevcut Authorized işlerini finalize edebilir; izin bunu kapsamalıdır. Başarısız canary'de aynı bakım şartlarıyla `enabled:false` yalnız yeni işleri720p'ye döndürür; mevcut1080p işler ve uyumlu kod korunur.
4. Gerçek Livepeer yatay/kare/dikey/düşük kaynak çıktıları, VTT/CORS, fiziksel telefon/Safari HLS,10dk/2yenileme/20sarma ve hız hedefleri **UNPROVEN**. Yerel geniş testin kapanması giderildi; bu dış kabulü kapatmaz. Gerçek hesap, dosya hash'i, ödeme sayısı/tutarı, bütçe ve durma koşulları ayrı canlı kabul paketinde tamamlanır.

Commit/push/PR/merge, yeni CI tetikleme, deploy, canlı yönetici işlemi, ödeme veya upload yapılmadı. **Bu gate kapalıdır; sonraki gate otomatik başlamaz.**

> Aşağıdaki bölüm main üzerinde bulunan tarihsel yayın hazırlığıdır; eski işlem önerileri yeni yetki veya güncel durum değildir. Üstteki 15 Eylül sonucu önceliklidir.

## Canlı yayın paketi — 13 Eylül 2026

**PLAYER_V2_RUNTIME_RELEASE_PACKAGE — yerel hazırlık / NOT_DEPLOYED.** Player V2 kaynakları [PR #200](https://github.com/4rmus/youtick/pull/200) ile main `9810c99684ff07bf58716bb9d1ff49ca9cbb89a2` içinde. [Main CI34747635987](https://github.com/4rmus/youtick/actions/runs/34747635987)13/13 başarılı; Market WASM/ABI/manifest GitHub imzaları exact main/CI workflow ile doğrulandı. Bu bölüm önceki kaynak yayını/birleştirme için “sonraki gate” kayıtlarının güncel devamıdır.

### Güncel salt-okunur durum

- **PREVIEW,13 Eylül08:44UTC:** final blok268372257, Market politika `[adaptive,legacy]`, bakım false/false,10yayın; aktif admission rezervasyonu0. Operatörün10kaydının tamamı CONFIRMED. `pendingRecords:10`, bu kayıtların arşiv durumudur; bekleyen zincir ödemesi değildir. Provider'daki23asset arasında bu Market'e bağlanan10işin tümü Published. Provider görünürlüğü olmayan ücretli işler veya henüz kesinleşmemiş cüzdan gönderimleri bu taramayla dışlanmaz.
- Cloudflare'ın güncel %100 sürümleri: Web `eadec555-d4fa-4469-a810-f10191b787f4`, Bridge `0f45b81e-8f7d-485c-aad8-51e076910a3c`, read-model `91063507-21ec-46df-8d56-2542b8d6e37b`; kayıtlı kaynak `b53e00e962b595f0edf4f1283c146d73d1f76b57`. Bridge/read-model health bunlarla eşleşir. Web deploy sürümü okundu; servis edilen Web JS dosyaları bu tur tekrar karşılaştırılmadı.
- İzole adayda yalnız code-update politikasının üç değeri güncellendi: mevcut kod `HyMxZxV2bF7NZjuUUxFFKcJEDc6pJCvwCERR7gUFCesB`,366633bayt, operatör allowance `96267314587431600000000`. İki bakım şartı true kalır; diğer roller/anahtarlar/metotlar ve0,10testNEAR rezerv kontrolü değişmez. Bu dosya henüz GitHub'a yayımlanmadı. Kaynaktaki kapalı feature flag varsayımları aynı.
- Main CI çıktısı:376382bayt, WASM SHA256 `a28c4e2c6bea2661fe1e81824b72347eb78898ac7e64c3a1c9535c94efb71c5b`, kod `BwX8m9esvWniSeE2VrWk5byRBSqAD313DYsVERZshVoY`. Politika/belge düzeltmesi yeni main'e girince onun exact CI/çıktısı yeniden doğrulanacak; mevcut kaynak numarası gelecekteki politika yayını yerine kullanılamaz.

### Önerilen ve henüz onaylanmamış işlem sınırları

| İşlem | Önerilen sınır |
|---|---|
| Yönetici cüzdanı | Guardian2 ve admin2 çağrı; her biri0yocto ek tutar,100Tgas; gerçek imza kullanıcıda |
| Sözleşme yayını |1 korumalı Market code-update workflow; initialize/migrate/anahtar değişimi yok |
| Web/Bridge/read-model |2 korumalı public-testnet yayın: eski kaynakla drain, yeni kaynakla acceptance |
| NEAR maliyet | Mevcut CI boyutuna göre ek kod depolaması **0,09749testNEAR**; bütün plan için önerilen işlem ücreti bütçesi **0,10testNEAR**; toplam **0,19749testNEAR**, yuvarlak üst plan0,20 |
| Medya/ödeme | Yeni test upload, asset üretimi, satın alma ve ücretli oynatma denemesi0;1080p etkinleştirmesi0 |
| Süre | Operasyon için60dk plan; kalan süre sonraki adımı güvenle tamamlamaya yetmiyorsa yeni adım başlatma |

Depolama tutarı harcanan ağ ücreti değil, hesaptaki ek kilitli bakiyedir. Market rezervi mevcut durumda bu artış ve0,10testNEAR fee payını karşılar; yaklaşık0,84023testNEAR pay kalır. Guardian yaklaşık0,09627, admin0,19530testNEAR bakiyeye sahiptir; yeni fonlama bu paketin parçası değildir. Bu zamanlı bakiyeler işlemden hemen önce yenilenir.

`max_deploy_cost_yocto` mevcut araçta rezerv yeterliliği kontrolüdür; protokolün uyguladığı toplam fatura tavanı değildir. Her yeni işlem öncesinde taze gas fiyatı, işlem tahmini ve kalan0,10testNEAR bütçe kontrol edilir; belirsiz veya sınırı aşan tutarda gönderim durur.100Tgas kullanıcı fonksiyon çağrılarının gaz sınırıdır; deploy-contract eyleminin ücreti güncel protokol boyut tarifesinden ayrıca hesaplanır. Ön kontroldeki gas fiyatı100000000yocto/gas; yalnız deploy eylemi tarifesi hesabı yaklaşık0,0027454testNEAR, gerçek makbuz değildir. İşlem sonuçlarıyla toplam ücret ayrıca uzlaştırılır.

Public-testnet aylık dolar bütçesi/job dolar rezervi uygulamaz; canlı admission yanıtı bu alanları null döndürür. Konfigürasyonda kalan5USD değeri sert provider harcama sınırı sayılamaz. Yeni medya işi başlatmamak mevcut izleyici/saklama veya dış kullanıcı trafiğinin faturasını sıfırlamaz.1080p provider bütçesi ve gerçek hesap faturası ayrı etkinleştirme gate'inde tamamlanır; bu paket bunun yerine geçmez.

### Uygulama sırası

1. **Önce kaynak entegrasyonu:** Bu gate'in dört explicit dosyalık politika/belge farkı ayrı onayla commit/push/PR ve başarılı CI sonrasında merge edilir. Yeni exact main, push CI, korunmuş Market artifact'i, checksum ve imzalar pakete yazılır. Politika dosyası hash'i bu kaynakla bağlanır. Bu yeni kaynak yayını mevcut gate'te yapılmadı.
2. **Ayrı canlı onaydan sonra yeni kabulleri durdur:** Guardian `pause_new_purchases({})` çağrısını imzalar. Mevcut ücretli işler korunur; duraklatma altında sonradan gelen yeni FT ödemeleri mevcut sözleşmenin iade akışına gider. Bu gönderimler ve iadeler ayrıca kesinleşmiş kayıtlarla uzlaştırılır; otomatik ikinci ödeme yapılmaz.
3. **Eski sürümde drain:** Deploy anahtarı yalnız bu korumalı koşu için açılır. Kaynak `b53e00e962b595f0edf4f1283c146d73d1f76b57`, başarılı push CI `34683092906`, `Public Testnet Video`, mode `drain`. Böylece yeni upload/quote/relay kapanır, mevcut işler ve oynatma yolu açık tutulur. Eski Web, yeni Market metodu kurulmadan değiştirilmez. Drain config SHA256 `b352751d2f54f0656b3b37ef7017c1eebe00727e1a636b571a1def488a6a5edc`; temel repo config hash'i değişirse yeniden incele. Koşudan sonra deploy anahtarı false.
4. **Uzlaştır ve dondur:** Kapanma doğrulandıktan sonra en az120s teklif ömrünü bekle. Aktif reservation0, outbox total=confirmed ve invalid0; bilinen işler Published/uygun terminal durumunda olmalı. İki final okuma arasında açıklanamayan değişim, yeni ücretli/Authorized iş, devam eden transfer veya iade belirsizliği varsa dondurma/yayın yok. İşler bitene kadar aynı ödeme/asset/ilk24saat son tarihiyle drain'de kal; eski veriyi silme. Guardian `freeze_bridge({})`; iki bakım kontrolünü final blokta true doğrula. Oynatma/cihaz yetkisi yenilemesi bakımda etkilenebilir; kesintisiz izleme garantisi verilmez.
5. **Market code update:** Tam bu anda yeni `snapshot` ile raw-state hash'ini al. Ön kontrolün `948ff316...` özeti kullanılmaz; bakım işlemleri bile bu hash'i değiştirir. Kod/allowance/politika/bakiyeler yeni yayımlanmış politika ile eşleşmelidir; allowance değişirse kontrol gevşetilmez, yayın durur ve yeni inceleme gerekir. `Public Testnet Market Code Update`: exact current main+başarılı CI, yeni CI WASM hash'i, final state hash'i ve politika SHA256; public deploy anahtarı false. Korunmuş reviewer sonrası1code update. Kayıp yanıtında hash/state sorgula; ikinci deploy yapma. Kod değişimi dışında raw-state, ekonomik bakiyeler, yayın sayısı aynı kalmalı. `get_playback_device` metodu, ABI47/26 ve politika `[adaptive,legacy]` doğrulanır; yeniden initialize yok.
6. **Bakımı kaldır ve yeni player'ı yayımla:** Market doğrulanınca admin `unfreeze_bridge({})`, ardından `unpause_new_purchases({})` imzalar. Eski drain Web/Bridge hâlâ yeni yükleme/quote/relay kabul etmez. İkinci ve son korumalı `Public Testnet Video` koşusu, yeni politika/main kaynağı ve onun CI'ı ile `acceptance`; config SHA256 `9a9711d7a3c64cd1befdc71576ba1d02d266b45748f41ceecd296db8d4bd99ed`. Bu, önceki normal açık hizmet durumunu720p profiliyle geri getirir. Existing Authorized işlerin yeniden açılışta ilerleme ihtimali canlı onay paketine dahil edilmeli. Yayın sonunda deploy anahtarı false, Preview anahtarı hiç değişmez.
7. **Kapanış:** Üç çalışan %100 sürümü, Web artifact/JS eşleşmesi, health, politika, yayınlar, job/quote/ödeme ve ücret makbuzlarını karşılaştır. Release workflow'un normal salt-okunur smoke kontrolleri çalışır; gerçek cüzdan/player/provider kabulü başarıyla karıştırılmaz. Otomatik workflow geri dönüşü kendi önceki Worker sürümlerini korur; ek manuel dispatch veya Market geri dönüşü bu sayılara dahil değildir ve ayrıca karar ister. Sorunda yeni adımlar durur; gerekli güvenli bakım durumu ve kullanıcı etkisi açıkça raporlanır.

Bu ilk runtime paketi `set_public_upload_full_hd` çağırmaz. Daha sonraki ayrı1080p etkinleştirmesi ve gerçek cihaz/provider kabulü; dosya/hesap, ücret/adet limiti, kaynak geometrisi, VTT/CORS ve10dk/2yenileme/20sarma şartlarıyla hazırlanır. Başarısız yeni profil kabulünde aynı bakım şartlarıyla yalnız yeni işler720p'ye döndürülür; mevcut1080p desteği kaldırılmaz.

**LOCAL_TEST:** Mevcut Market code-update testleri29PASS; release config/paket/smoke testleri170PASS. Drain/acceptance konfigürasyonları mevcut araçla üretildi. Kanıt `tmp/player-v2-runtime-release-package-20260913/`: `readonly-snapshot.json`, `provider-known-jobs.json`, Worker deployment okumaları, `policy-and-cost-check.json`, gate farkı ve yayın paketi. Bunlar canlı bakım/deploy kabulü değildir.

**Durum: COMPLETED_WITH_WARNINGS / yerel paket hazır; canlı çalıştırılamaz.** Yeni politika henüz GitHub'da değil; bakım sonrasında alınacak final-state/allowance, uçuşta ödemeler ve ayrıca canlı işlem onayı eksik. **Tek sonraki gate: PLAYER_V2_RELEASE_POLICY_INTEGRATION** — dört dosyanın Git yayını ve CI; otomatik başlamaz. Bu gate deploy, bakım işlemi, veri/ayar değişimi, ödeme, upload veya1080p açılışı yapmadı.
