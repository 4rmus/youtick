# Public Testnet Video V1 — kabul ve sonuç kayıtları

> **KONTROLLÜ TESTNET VIDEO V1 — COMPLETED_WITH_WARNINGS / KAPALI (§59).**
> Kullanıcı “onaylıyorum” dedi; §58'deki altı ek test grubu kabul edilerek ertelendi.
> Çalışan akışların kanıtı ve önceki uyarılar korunur; yapılmamış testler PASS sayılmaz.
> Kabul döngüsü durdu. Aktif/sonraki V1 gate'i yok; yeni test, deploy veya veri işlemi yok.
> Önceki NOT_COMPLETE ve onay-bekliyor kayıtları tarihsel sonuçlardır.

> **Son ön kontrol: `VIDEO_PUBLIC_TESTNET_RESILIENCE_PREFLIGHT` — PASS.**
> §48 kalan dayanıklılık kanıtını ve tek mevcut yayın üzerinde iki imzalı test
> bildirimi paketini içerir. Terminal alıcı testi §52 ile geçti; zorlanmış Queue hata testi çalıştırılmadı.

> **Güncel sonuç: `VIDEO_PUBLIC_TESTNET_TWO_BY_TWO_ACCEPTANCE` — PASS / KAPALI.**
> Orijinal aktarım kayıtları kurtarıldı: 160,934 saniye TUS işlem örtüşmesi.
> Soteri ve utick2 hesapları iki ayrı Brave profilinde en az 5 dakika birlikte izledi.
> 12 Eylül kullanıcı talebi: 2 eşzamanlı yükleme ve 2 eşzamanlı izleme testi.
> 1.000 izleyici testi kullanıcı isteğiyle kapsam dışı; önceki 3 yükleme önerisi
> 2 olarak değişti. Kanıt tamamlaması §47; ilk uyarılı koşu §46'da korunur.

> 12 Eylül 2026 belge uzlaştırması: son sonuç **§45**, kısa durum [current-state.md](./current-state.md). Bu güncelleme önceki canlı kanıtı özetler; yeni canlı test veya yayın değildir. Tarihsel “sonraki gate” önerileri yeni iş başlatmaz.

12 Eylül 2026 · `VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PUBLICATION_VERIFICATION_RELEASE` — COMPLETED_WITH_WARNINGS; 5 GB /120dk yükleme ve yayın PASS

**Önceki büyük dosya gate: VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PUBLICATION_VERIFICATION_RELEASE — COMPLETED_WITH_WARNINGS, KAPANDI.** Kullanıcının istediği **5 GB /120 dakika yükleme → provider ready → NEAR Published/ACTIVE → katalog** zinciri PASS. [PR #197](https://github.com/4rmus/youtick/pull/197) normal squash ile birleşti; **b53e00e962b595f0edf4f1283c146d73d1f76b57**, yeni main CI **34683092906** ve tek korumalı yayın **34683764285** başarılı. Aynı iş yeni Bridge devreye girdikten **120,852844sn** sonra otomatik yayımlandı; yeni ödeme/upload0. Plan §35/kabul §45 son kanıttır. Bir admission_denied uyarısı ve sağlayıcı maliyetinin kesin ayrıştırılamaması korunur; genel Video V1 NOT_COMPLETE. Kullanıcının daralttığı kapsam tamamlandı; başka gate başlatılmadı.

**Tarayıcı/yavaş ağ kabulü: COMPLETED_WITH_WARNINGS — KAPANDI, kullanıcı kabulü.** Kullanıcı mevcut testleri kontrollü ilk testnet sürümü için yeterli kabul edip uyarılarla kapanış önerisini uygulamamı istedi. §39 güncel karardır; yedi ilk görüntü, gerçek yenilemeler ve iki FINAL satın alma §37'de, teşhis §38'de korunur. Auto/eksik Edge örneği/ölçüm ve bütçe kanıtı eksikleri ertelendi, giderilmiş sayılmaz. Measurement-preflight ve remaining-acceptance önerileri bu aşama için artık zorunlu değildir. Büyük dosya aktarım kanıtı §41, güncel yayın kapanışı §45'te; kapasite/dayanıklılık ve genel Video V1 kabulü ayrı, genel plan **NOT_COMPLETE**.

**Çekim kabulü: PASS — KAPANDI.** Soteri kazancı **5,88 testUSDC**, tek FINAL işlemle aynı hesaba aktarıldı: cüzdan **32,10→37,98**, creator kazancı **5,88→0**, Market **18,20→12,32**. FT/callback true ve bir started/bir succeeded; gerçek ücret **0,000747676380855 testNEAR**. Ayrıntı §35; yeniden çekim yok. Kullanıcının gate döngüsü yetkisi ve yeni canlı işlem/Git/yayın onay sınırları sürer.

**Yeni sürüm maliyet/hız ölçümü: COMPLETED_WITH_WARNINGS — KAPANDI (cf81c2e2, kullanıcı kabulü).** 13 normal açılışın12’sinde uygulama/oynatma tamamlandı; cüzdan12/12 imzasız geri geldi,12 token isteği HTTP200 döndü. İlk token n12 ortanca638.75ms; ilk görüntü n11 ortanca3402ms/en yüksek10714ms. Kullanıcı bu kanıtı kontrollü ilk testnet sürümü için yeterli kabul etti; hız/bağlantı ve eksik p95/yenileme/maliyet bulguları ertelendi. Sayılar §32, kapanış kararı §33; yeniden açılmaz.

**Yayın: PASS.** PR196/main cf81c2e2, PR/main CI ve tek korumalı acceptance yayını34612719919 başarılı. İmzalı artifact→üç100% sürüm→serving20 JS/health eşleşti. M1/M2 ve bakiyeler korunuyor; public yüklemeler açık, yayın anahtarı false. Yayın ayrıntısı §31; bu sürümün canlı ölçümü §33 kullanıcı kararıyla COMPLETED_WITH_WARNINGS olarak kapandı.

**Kaynak gate’i: PASS / LOCAL_STATIC + LOCAL_TEST.** İzole adayda geç restore sonucu/iptal korumaları ve güvenli ölçümler düzeltildi; 316 Web testi, lint ve yerel derleme geçti. Kaynak yayını §31’de tamamlandı; yeni sürümün ölçümü §32’de kayıtlıdır ve §33’te kullanıcı kabulüyle kapandı. Kaynak ayrıntısı §29, ön kontrol §30’dadır.

**Son teşhis: COMPLETED_WITH_WARNINGS.** Mevcut oturum kaydı ve doğru cüzdan önbelleği korundu; tek normal reload soteri hesabını imzasız geri getirdi. Sessiz restore/5s yarışının geç sonucu kaybetme kusuru kaynakta doğrulandı; eski olayın kesin tetikleyicisi UNPROVEN. Ayrıntı §28; kaynak düzeltmesi §29’dadır.

**Önceki maliyet/hız ölçümü: FAILED (8fac sürümü).** Dört örnekten sonra beşinci reload cüzdanı geri getirmedi; bir renewal 10.65s sürdü. Ölçüm durduruldu, p95 kabulü verilmedi. Ayrıntı §27; teşhis ve kaynak sonuçları §28–29’dadır.

**M devam kabulü: COMPLETED_WITH_WARNINGS / işlevsel kabul PASS. Video V1: NOT_COMPLETE.** Onaylı M2 koşusunda aynı dosya/iş/TUS konumu, bağımsız yanlış hesap ve yanlış dosya kontrolleri, tek ödeme/asset/publication, değişmeyen 24 saatlik son tarih ve yeni yayının kısa oynatma kontrolü tamamlandı. İlk 503, provider fatura ölçümü ve aktif süre ölçümünün sınırları §25’te korunur. Eski M1 Published/ACTIVE kalır; public yüklemeler açıktır. Sonraki gate otomatik başlatılmaz.

**Okuma önceliği:** §45 büyük dosyanın kaynak/yayın/kabul kapanışı; §41 ilk aktarımın tarihsel sonucu; ardından §39 kullanıcı kabulüyle tarayıcı kapanışı, §38 teşhis, §37 sayısal tarayıcı koşusu ve önceki kayıtlar. Eski BLOCKED/NOT_COMPLETE ve sonraki measurement-preflight önerileri tarihsel olup bu aşamayı yeniden açmaz. Çekim §35 ve maliyet/hız §33 kapanışları korunur. Public ortam açık bırakılır; bu karar başka aşamaları kapatmaz ve yeni imza, ödeme, yükleme, harcama veya yayın onayı vermez.

## 1. Tarihsel kanıt ve eksikler — 8 Eylül 2026

| Konu | Doğrulanan durum | Canlı teste geçiş şartı |
|---|---|---|
| Çalışma alanı | Dirty checkout korunuyor. 61 dosyalık video paketi izole çalışma alanında bütünleştirildi; [PR #179](https://github.com/4rmus/youtick/pull/179) main'e alındı. Korunmuş adayın 61/61 dosyası receipt ile eşleşir. | Entegrasyon tekrarlanmaz. Yeni değişiklikler exact main'den ayrı hazırlanır; dirty checkout doğrudan yayın adayı değildir. |
| GitHub | B09 PR #185, main `91d113a6`, PR CI `34245494376`, main CI `34246978497`, drain `34248778919` SUCCESS; tree/imza/config ve üç gerçek sürüm doğrulandı. | Yeni medya kabulü için ayrı işlem/bütçe paketi ve gerekli onay eksik. |
| Yayın yolu | B09 üç sürüm ve Queue readiness doğrulandı; 16:46–16:48 UTC yeni kontrolde aktarım 267668188 noktasında duruyor (fark 2274 → 2450). Root origin korundu; deploy anahtarı false. | Üretilmemiş yükseklik işleme düzeltmesi ve güncel yetişme kanıtı; ardından gerçek webhook/medya kabulü. |
| Kalite | Live canary `LIVEPEER_PLAYBACK_CANARY_ADAPTIVE=true` ile adaptive hash ve `verifyAdaptive: true` seçeneğini uçtan uca iletiyor; iki tarayıcı için PASS zorunlu ve raporda korunuyor. | Gerçek medya testi yapılmadı. Bu teşhis CLI'si ayrıca 80 MiB geçerli MP4, provider asset ve signing-key oluşturma/silme izinleri ister; S dosyasıyla normal kullanıcı akışının yerine geçmez. |
| Provider | 8 Eylül API okumasında 13/13 mevcut asset ready ve yalnız 720p. B07 ile public-testnet webhook'u oluşturuldu ve doğrulandı; Preview webhook'u korundu. | Gerçek webhook teslimi, yeni 360p+720p işleme, süreler ve normal kullanıcı akışı hâlâ kanıtlanmadı. Hazır eski asset yeni kabul yerine geçmez. |
| Fatura | Growth, 1 Eylül–1 Ekim 2026; görünen gelecek fatura 100 USD, overage 0. Kullanım 0,40 transcoding / 0,00 delivery / 112,95 storage dakika. | İki çıktı ve saklama dönemi hesabı, küçük test kullanım bütçesi ve ölçümle kapanış koşulları ayrıca netleştirilmeli. 5 USD önerisi hâlâ onaysız; hard cap değildir. |

Önceki gate'lerin sonuçları yeni test koşusu olarak sunulmaz. Kaynak/test başarısı `LOCAL_STATIC / LOCAL_TEST`; main CI yalnız yukarıdaki SHA içindir. Yeni ortamın kapalı çalışması ve consumer bağlantısı kanıtlandı; gerçek video kullanıcı kabulü `UNPROVEN`. Eski Market manifestinin beta hedefi ve `CODE_UPDATE_ONLY` sınırı değiştirilmedi; yeni hesap kurulumu ayrı B03 politikası ve gerçek transaction kanıtıyla tamamlandı.

## 2. Yeni ortamın doldurulacak işlem kimliği

| Alan | Hazır kaynak hedefi / zorunlu kanıt |
|---|---|
| Ağ | Yalnız `testnet` |
| Web / Bridge | `youtick-web-public-testnet` / `youtick-livepeer-bridge-public-testnet`; `public-testnet.youtick.net` / `bridge-public-testnet.youtick.net` |
| Read model | `youtick-market-read-model-public-testnet`, sürüm `258b9910-0d65-41d1-959b-5b5a9fffcb5a`. B09 snapshot sonrası 81/94 blok ve iki başarılı cron tarihsel PASS; güncel watermark 267668188, fark 2274 → 2450, iki `invalid_neardata_block`. |
| Queue / DLQ | `youtick-livepeer-events-public-testnet` / `youtick-livepeer-events-dlq-public-testnet` |
| D1 | `youtick-market-read-model-public-testnet`, UUID `89871d60-3a26-4045-8694-5ff44af579db`; dört migration uygulandı ve doğrulandı. Eski `50b1e14f-2b06-444b-98cf-b828f11277ef` kullanılmaz. |
| Market / Access | B03 ile kuruldu: `video-market-v1-260907.youtick-dev-v3.testnet` / `video-access-v1-260907.youtick-dev-v3.testnet`. Zincirde code/key/state doğrulandı. |
| Başlangıç bloğu | **267602885**, gerçek Market executor receipt/init bloğu. Postcheck bloğu veya fixture sayısı değildir. |
| Roller | Admin/guardian ve hesap yönetim anahtarları, sonlu iki-yöntemli operator anahtarı, kendi ayrı hesabında FullAccess gerektiren sponsor relayer ve quote imza anahtarı birbirinden ayrılır. Public kimlik/izin/bütçe parity kanıtı gerekir; secret değerleri belgeye yazılmaz. |
| Profil / politika | `28ba12452dd2cc55e64baf73a3dbf665784eeb8fd87892163818513165bbd3b2`, mevcut legacy desteği; 5.000.000.000 bayt, 86.400.000 ms, imzalı teklif |
| Sürüm / dönüş | Onaylı commit, CI run/artifact hash'leri, Market WASM hash'i, üç Worker version ID'si, kapalı dönüş sürümleri; hepsi gerçek kayıttan doldurulur |

Bu alanlar doldurulmadan deploy, init, funding veya mutasyon komutu verilmez. Eski beta'nın Market/Access, D1, Queue, ayarları ve takvimi bu pakete taşınmaz. Kurulum `new_public_testnet` kullanır; `start_public_testnet_beta` kullanılmaz.

## 3. Video örnekleri

Yerelde ffmpeg ile üretilen desen + ton, H.264 Constrained Baseline 1280×720/30 fps, AAC ses. Kullanıcı içeriği yok; dışarı yüklenmedi. Orta örnek küçük örneğin tekrarlarından oluşur: aktarım, devam ve yenileme deneyi içindir; gerçek içerik karmaşıklığı/kalite benchmark'ı değildir.

| Örnek | Boyut / süre | Amaç / durum |
|---|---|---|
| S — `small-60s.mp4` | 26,955,102 bayt / 60.000000 sn | İlk tam kullanıcı akışı; LOCAL_STATIC |
| M — `medium-10m.mp4` | 269,467,407 bayt / 600.025521 sn | Aynı dosyayla resume ve gerçek token yenilemesi; LOCAL_STATIC |
| L — uzun | 120 dakika, ≤5.000.000.000 bayt; tam çözümleme ve hash gerekli | §41/§45: gerçek5GB aktarım, provider7200,008008sn/ready, NEAR Published/ACTIVE ve katalog PASS; uzun izleme EXTERNAL_NOT_RUN |
| B — gerçek sınır | Tam 5.000.000.000 baytlık geçerli, oynatılabilir kaynak | §41/§45: aynı L/B dosyası; tam5.000.000.000bayt TUS aktarımı ve yayın PASS; 5GB+1 EXTERNAL_NOT_RUN |

- [small-60s.mp4](/Users/arair/works/youtick-lp/tmp/video-controlled-acceptance-preflight-20260907/media/small-60s.mp4): SHA-256 `67d6477e9f81d478dad012e33f12f49abfe0ade9e401f3f44e4b635fd5a4e8fd`.
- [medium-10m.mp4](/Users/arair/works/youtick-lp/tmp/video-controlled-acceptance-preflight-20260907/media/medium-10m.mp4): SHA-256 `40fcd876e157e0e1663f5deace4cfcbf10988815f3cb4604d8acd053ac007382`.

Örneklerin manifesti ve üretim/çözümleme logları `tmp/video-controlled-acceptance-preflight-20260907/` içindedir. Uzun/sınır örnekleri ilk küçük akış geçmeden hazırlanıp gönderilmez. Ek MOV/WebM/MKV örnekleri seçildiğinde aynı metadata kaydı gerekir.

## 4. Bütçe ve durma sınırları

**Küçük medya kabulü için yetkili dış harcama: 0 USD; medya/USDC işlemi: 0.** Tamamlanan altyapı/anahtar işlemleri kendi B01–B05 onay kayıtlarındadır. Aşağıdakiler küçük video testi için teklif niteliğindedir; kullanıcı tarafından onaylanmış bütçe değildir.

- İlk küçük kullanıcı deneyi için önerilen ek kullanım bütçesi **en çok 5 USD**; tek operatör yüklemesi, tek asset, tek yayın ve bir buyer satın alımı. En çok 20 toplam izleyici-dakika, 30 dakikalık aktif gözlem. Bütçe teyit edilmeden başlamaz.
- S ve M ayrı ayrı minimum yükleme bedelindedir: **0,5 test USDC yükleme + 0,1 test USDC sponsor**. İlk S deneyinde yalnız 0,6 test USDC upload ve 2 test USDC bilet hedeflenir. NEAR bakiye/gas/storage gereksinimi güncel cüzdan/politika/tekliften okunur; bakiye tamamlama ayrı onaydır. Test USDC tutarı gerçek provider faturasıyla birleştirilmez.
- [Livepeer fiyat sayfası](https://livepeer.studio/pricing) Growth için 0,33 USD/60 dk işleme, 0,09 USD/60 dk saklama ve 0,03 USD/60 dk dağıtım ile **100 USD aylık minimum** listeliyor. 5 USD önerisi abonelik/minimum harcamayı kapsayan toplam fatura garantisi değildir. Plan satın alma/değiştirme yoktur. Çıktı sayısı ve saklama döneminin faturalaması hesapta teyit edilmelidir.
- Bridge'in `MONTHLY_OPERATION_BUDGET` / `JOB_OPERATION_RESERVATION` değerleri kabul rezervasyonudur; gerçek fatura kesicisi değildir. Kullanım sayaçları gecikebilir; 5 USD yalnız gözlem ve yeni işleri durdurma eşiğidir. Kesin maliyet üst sınırı istenirse sağlayıcıda uygulanabilir sınır kanıtlanmadan test açılmaz.
- Yeni ortam izin listesizdir. “Tek test yüklemesi” yalnız test ekibinin kapsamıdır; açık pencereye başka kullanıcıların gelmesini teknik olarak engellediğini iddia etmez. Beklenmeyen yeni job/asset görülürse yeni kabulü kapatma paketi uygulanır, kapsam genişletilmez. Public 10 aktif iş sınırı korunur; test için gizli allowlist eklenmez.
- M/L/B ve 10 yükleme/1.000 izleyici için bu belgede harcama yetkisi yoktur. Küçük koşunun ölçümü ve hesaba özel ücretler sonrası ayrı bütçe çıkarılır. Örneğin 1.000 kişi × 10 dakika = 10.000 izleyici-dakika; aynı 1.000 yetkilendirme isteği bunun yerine geçmez.

TUS tesliminden sonraki **5 dakikada** hâlâ waiting/processing varsa snapshot alınır ve yeni deneme başlatılmaz; **15 dakikada** hazır/yayın yoksa küçük koşu PASS değildir, inceleme için durur. Bunlar işletim durma noktalarıdır, hız SLO'su veya kalıcı provider arızası hükmü değildir. Eski işi yeniden yaratma/silme, ikinci ödeme veya asset restart yapılmaz. İşin 24 saatlik son tarihi uzatılmaz.

## 5. İlk gerçek kullanıcı kabulü

Önkoşul: kaynak/yayın yolu, provider engeli, kimlikler, bütçe ve kapatma paketi hazır; somut canlı işlemler onaylı. Creator A, Creator B, Buyer C ve Stranger D için ayrı tarayıcı profilleri kullanılır; gerçek hesap kimlikleri işlem paketine yazılır. İlk küçük koşuda B işlem yapmaz. Desteklenen desktop Chrome/Edge ve Meteor testnet sürümleri kaydedilir.

1. Aynı sürümün başlangıçta kapalı olduğunu kanıtla: Market pause, bayraklar, Worker version'ları, read-model bağlamı/başlangıç bloğu, Queue/D1 izolasyonu, önceki sayımlar. Market'i yeniden init etme.
2. Önceden tanımlanmamış Creator A normal Upload ekranından S dosyasını seçer; başlık `Video V1 kabul — S`, bilet 2 test USDC. Tek teklif/tek sponsorlu ödeme. İş, kaynak hash'i ve generation kaydedilir; belirsiz işlemde önce zincir sonucu okunur.
3. TUS offset=length, provider task ready, iki kalite, JWT/alt medya kontrolü, tek NEAR publication sırasıyla kanıtlanır. Teslim, işleme ve yayın zamanları ayrı tutulur.
4. Yeni yayını **normal Discover** listesinden bul; karttan Watch'a gir. Doğrudan Watch linki başarı yerine geçmez. Read-model watermark/publication/Market eşleşmesini göster. Fallback kullanıldıysa kullanıcı yolu geçebilir, fakat veri aktarma kabulü geçmez.
5. Creator izler. Buyer C normal satın alma akışında bir bilet alır ve izler; Stranger D alamaz/izleyemez. Chrome ve Edge'de ilk kare, 360p→720p ve otomatik moda dönüş kaydedilir. Yavaş ağda otomatik davranış ayrıca gözlenir; elle kalite geçişi tek başına otomatik uyarlama kanıtı değildir.
6. İş/asset/publication sayımını başlangıçla karşılaştır: hedef birer yeni kayıt; kurtarmada fazladan ödeme/asset/publication **0**. Yeni kabulü önceden onaylı paketle kapat ve kapalı durumu doğrula; kanıt/sayaçları sakla. Başarılı yayını otomatik silme.

Bu küçük koşu ilk kullanıcı yolunu kanıtlar; bütün planın kabulü değildir.

## 6. Sonraki kabul matrisi ve kanıt alanları

Bu başlangıç matrisi tarihsel kapsamdır; güncel kapanış/erteleme kararı §56'dadır. Eski10yükleme/1.000izleyici satırı yeni koşu yetkisi değildir; kullanıcı kararı2+2, 1.000izleyici kapsam dışıdır.

| Senaryo | Kabul |
|---|---|
| M dosyası, kesinti/sekme kapanması | Aynı dosya/iş/TUS; gerekirse tek anahtar onayı, aynı son tarih; ikinci ödeme/asset/publication 0 |
| Gerçek token yenileme | Aynı oynatıcıda token gerçekten değişir; ilerleme/tampon korunur. `short_repeat_new_player` sayılmaz. |
| Yanlış dosya/hesap, son tarih | Yanlış devam reddedilir; 24 saat uzamaz; zamanında yayınlanmış video 24 saatte sona ermez |
| Kayıp/sıra dışı webhook ve geç alarm | Tek yayın; ilgili canlı fault injection ayrıca onaylanır, yerel mock sonucu ayrı tutulur |
| İkinci creator ve kazanç çekimi | İzin listesine eklenmemiş B yükler; buyer/creator bakiyeleri ve withdrawal sonucu zincirde uzlaştırılır; ayrı ödeme/çekim onayı |
| L/B, uzun izleme, diğer container'lar | Kaynak hash/byte/süre doğrulanır; gerçek tam aktarım ve oynatma; 5 GB+1 ret ayrıca; büyük örnek küçük koşu yerine geçmez |
| 10 yükleme / 1.000 izleyici | Bağımsız gerçek kimlikler ve gerçek medya trafiği; sayımlar, hatalar ve provider kullanım faturası. Günlük/creator kotaları aşılmaz. |
| Kapatma/eski beta | Yeni kabul kapanır; mevcut iş ve yayının doğru davranışı; eski beta için sürüm/iş/veri regresyon kanıtı |

Her koşu: run ID, sınıf (LOCAL_TEST/PROVIDER/PREVIEW vb.), UTC zaman, exact SHA/Worker/WASM sürümleri, dosya SHA/boyut/süre, tarayıcı/cüzdan/ağ sürümü, job/generation, tx hash, redacted asset/task/publication ID, başlangıç/bitiş sayaçları, TUS/ready/yayın/ilk-kare/yenileme süreleri, hata ve kullanım farkı. JWT, secret, upload key ve TUS yetki URL'si kanıta yazılmaz. Farklı saatlerden süre çıkarılmaz.

Sıcak token p95 **<500 ms** korunur. Mevcut yerel farklı-kimlik koşuları yaklaşık 1,9–2,0 sn ve tam sıcak-cache testi değildir. Küçük canlı koşudan upload p95 çıkarılmaz. Diğer hız hedefleri ve büyük test bütçesi, planın kararı gereği gerçek başlangıç ölçümünden sonra sabitlenir; sonradan hedef gevşetilmez.

## 7. İzin gerektiren paketler ve tek sonraki adım

| Paket | Somutlaştırılacak sınır / sonuç |
|---|---|
| Kaynak entegrasyonu | Tamamlandı: PR #179, main `28a5728`, CI `34155062768`. Önceki onaylar uygulanmıştır. Bundan sonraki kaynak farkının Git yayını için yeni exact paket gerekir. |
| Ayrı kaynak/Market kurulumu | Tam hesap, D1 UUID, Queue, domain ve key public kimlikleri; max NEAR/storage, initializer argümanları ve WASM hash; kesinleşmiş kurulum bloğu. Belirsiz sonuçta yeniden init yok. |
| Kapalı yayın/açma/kapatma | Korumalı workflow adı ve exact artifact; tam bayrak matrisi, Queue consumer/read-model/domain adımları, Market pause/unpause ve doğrulanmış kapalı dönüş sürümü. Dashboard/CLI ile workflow atlanmaz. |
| Küçük ücretli deney | Yukarıdaki S dosyası hash'i, gerçek A/C/D hesapları, tek upload/bilet, onaylı ek bütçe ve kapatma sınırları. Aynı onay M/L/yük testi yetkisi olmaz. |
| Sonraki ekonomik/provider adımlar | Her çekim, fault injection, takedown/delete, büyük dosya veya yük testi için exact iş/asset kapsamı ve güncel tutar. Kör retry yok. |

## 8. Tamamlanan yayın kaynağının kullanım sınırı

`deploy-public-testnet.yml` yalnız elle çağrılır ve main geçmişindeki exact SHA için başarılı push CI ister. Önce tek public Web/Bridge/read-model artifact'i ve SBOM/provenance üretilir; ayar matrisi review özeti olarak gösterilir. `DEPLOY_PUBLIC_TESTNET_ENABLED` açık değilse deploy yapılmaz. Deploy işi `public-testnet` environment'ına bağlıdır ve gerçek required-reviewers kuralını ayrıca denetler; artifact doğrulaması olmadan Cloudflare sırları kullanılmaz. Closed koşusu `34210642070` ve son B09 drain `34248778919` uygulandı; acceptance henüz çalıştırılmadı.

| Mod | Yeni yükleme/teklif/relay | Provider/operator, izleme | Discover/ingestion | Webhook Queue |
|---|---|---|---|---|
| `closed` (varsayılan) | Kapalı | Kapalı | Kapalı | Kapalı |
| `acceptance` | Açık | Açık | Açık | Açık |
| `drain` | Kapalı | Açık: mevcut işleri sürdürür | Açık | Açık |

Shadow, NEAR creator fee, multi-asset ve arşiv bayrakları kapalı kalır. Creator/job allowlist eklenmez. `drain` sponsor/quote anahtarlarını devam eden işlemler için korur; önceden imzalanmış tekliflerin zincirdeki geçerliliğini iptal etmez. Market pause/unpause veya yeni init bu Cloudflare workflow'unda yapılmaz; ayrı onaylı zincir işlemidir.

Kapalı base config `PUBLIC_TESTNET_RELEASE_CONFIG` değişkeninde saklandı ve canonical çıktıyla eşleşti. Gerçek Market/Access, D1 UUID, başlangıç bloğu ve hesaplar hazır. Pozitif bütçe/iş rezervasyonu acceptance/drain için gereklidir; closed modda boş olabilir; B08 onayıyla mevcut base config içinde 5/5 USD operasyon değerleri vardır, medya harcama onayı değildir. Mode değişikliği yalnız mevcut `release-metadata.mjs config --environment public-testnet --input ... --mode ...` ile üretilir; Preview/Production config veya bundle gerekmez. `acceptance`/`drain` ilk kapalı kurulumun yerine geçemez.

Açılıştan önce ve sonra Queue/DLQ kimliği ve var olan consumer kontrol edilir: yeni Bridge worker, batch 10, concurrency 1 (batch içinde 10 mesaj paralel), retries 3, bekleme 5 saniye. Yayın aracı consumer oluşturmaz/değiştirmez. Sıra: kaynak/Market ve D1 migration → ilk kapalı Worker/domain yayını → ayrı onaylı consumer bağlama → onaylı kabul açılışı. Gerekli consumer/D1/Market kaynak işlemleri ve GitHub environment hazırlığı canlı işlem paketinde açık kalır.

Read-model sürüm/ağ/Market/başlangıç bloğu/ingestion durumu health üzerinden kontrol edilir. Bu, gerçek veri aktarımı veya Discover kullanıcı kabulü değildir. Yeni modlar Web'i farklı bayraklarla yeniden derler ama aynı source SHA kullanılabilir; sürüm ID'leri farklıdır ve receipt'e yazılır. Legacy Preview/Production hedefleri ve rollback kontrolleri korunur.

Kapatma eski backend'in sağlık kontrolüne bağımlı bırakılmaz; önce kapalı/drain sürümü uygulanır, sonra doğrulanır. Son kontrolde hata olursa önceki açık sürüme otomatik dönülmez ve başarılı receipt üretilmez; operatör durumu uzlaştırır. Kabul açılışında hata olursa mevcut geri dönüş mekanizması çalışır. Bu kurallar fiziksel servis/ağ kesintisinde “kesin kapandı” garantisi değildir.

## 9. Bootstrap işlem paketi

`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_PREFLIGHT` ve `VIDEO_PUBLIC_TESTNET_BOOTSTRAP_ARTIFACT_SOURCE`: **COMPLETED_WITH_WARNINGS**. İlk video paketinin entegrasyonu, PR, merge ve main CI tamamlandı; yeniden yapılmaz.

**Hazır Git paketi:** kaynak `28a572803ce79a81b9e893f65b1f1d5b166622f2`; izole aday `tmp/video-public-testnet-bootstrap-source-20260907/candidate`. Yalnız `.github/workflows/ci.yml`, `scripts/ci-security.test.mjs` ve bu iki mimari belge. Mevcut contract retention işi Access çıktısını da saklar; eski Market manifesti/işlem hedefi değişmez. `node --test scripts/ci-security.test.mjs`: **14/14 PASS**, yanlış SHA/run/attempt, değiştirilmiş WASM ve eksik ABI reddi dahil. Gerçek CI veya deploy çalıştırılmadı.

Önerilen yayın: `feat/public-testnet-bootstrap-artifact-20260907` branch'inde tek commit, normal push ve main hedefli PR. Yalnız aynı onaylı diff üzerinde zorunlu CI ve inceleme engelleri kapandığında normal squash merge; admin bypass, force push, manuel CI tekrar koşusu veya deploy yok. Main hareket ederse diff yeniden karşılaştırılır. Patch, dosya hash'leri ve onay kapsamı `tmp/video-public-testnet-bootstrap-source-20260907/` altında saklanır. Bu yeni Git paketi için önceki PR #179 onayları kullanılamaz.

**Fonlama tamamlandı:** kullanıcının faucet yönlendirmesiyle mevcut `youtick-dev-v3.testnet` hesabına resmî faucet'ten bir kez 5 test NEAR geldi. Kesinleşmiş blok `267545791` toplam `5096045917506722899999998` yoctoNEAR gösterir. Bu izin yalnız ücretsiz test NEAR edinimidir; yeni hesap/anahtar/deploy/USDC veya provider izni değildir. Kanıt: `tmp/video-public-testnet-resume-20260907/faucet-funding.json`.

| Sonraki kurulum parçası | Somut hedef / eksik alan |
|---|---|
| Market | Öneri `video-market-v1-260907.youtick-dev-v3.testnet`; `new_public_testnet(config)`; yalnız kod için 3,47252 NEAR alt sınırı. Kesin roller, quote public key, reserve, toplam funding/gas sınırı ve korumalı create+deploy+init yolu gerekli. |
| Access | Öneri `video-access-v1-260907.youtick-dev-v3.testnet`; mevcut `new(owner_id, market_contract_id)`. Exact imzalı Access byte'ları, owner ve funding sınırı gerekli. Mevcut initializer grant issuance açık başlar; Market/Bridge kapalı olması Access'in paused olduğu anlamına gelmez. |
| Operator / relayer | Öneri `video-operator-v1-260907.youtick-dev-v3.testnet` / `video-relayer-v1-260907.youtick-dev-v3.testnet`; yeni ayrı anahtarların public kimlikleri, sonlu izinleri ve bütçesi gerekli. Anahtar üretilmedi. |
| Yönetim | Admin/guardian/platform/takedown ve Access owner kimlikleri kesinleşmeli; yalnız envanterde görüldükleri için eski beta kimlikleri sessizce kopyalanmaz. |
| GitHub | `public-testnet` environment; önerilen reviewer mevcut repo sahibi `4rmus` (`157231908`), protected-branch politikası ve kapalı `DEPLOY_PUBLIC_TESTNET_ENABLED=false`. Environment/ayar oluşturulmadı, secret kopyalanmadı. |
| Cloudflare | Yeni D1 `youtick-market-read-model-public-testnet`, Queue/DLQ ve üç Worker/domain; Bölüm 2'deki exact adlar. D1 UUID kurulumdan alınacak, uydurulmayacak. DNS API yetkisi ayrıca doğrulanmalı. |

Sıra: hesap/anahtar/bütçe kararları → onaylı kaynak/Market/Access kurulum paketi ve D1 migration → korumalı ilk `closed` yayın → ayrı consumer bağlama → onaylı küçük kullanıcı kabulü. NEAR hesabı ilk kurulumunda create/fund/key ve sözleşme için deploy+init mümkünse tek atomik batch'te bağlanır; belirsiz gönderimde ikinci create/init yapılmaz. Yeni kurulum için eski `CODE_UPDATE_ONLY` manifesti değiştirilmez. Kesin hesap ve anahtarlar olmadan genel bir bootstrap çatısı veya canlı komut üretilmez.

## 10. Git paketinin uygulanan sonucu — 8 Eylül 2026

`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_ARTIFACT_INTEGRATION`: **PASS / CI**. Bölüm 9'daki Git paketi kullanıcı onayıyla uygulandı: head `a96f0a8cabd766ab483262a7752ab08431feff57`, [PR #180](https://github.com/4rmus/youtick/pull/180), [başarılı PR CI 34161053872](https://github.com/4rmus/youtick/actions/runs/34161053872), squash main `43fee5c4a04c8314579a9e089aa85c0fe06b03dd`. Onaylı dört dosya değişmedi; gerekli inceleme ve CI kapıları atlanmadı.

`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_MAIN_CI_REVIEW`: **COMPLETED_WITH_WARNINGS / CI**. Main CI `34161844285` 13/13 başarılı; Market `10033007691`, Access `10033009024` kalıcı artifact'ları indirildi. ZIP/dosya hash'leri, metadata ve 7/7 imza exact main SHA/run/attempt/GitHub hosted runner kimliğiyle doğrulandı. Access 210935 bayt, WASM SHA-256 `e0c69bd3d0f665f64d5253bfc065f3943f827789a583102aa7ae86b24fee7a2a`; 26 yöntemli ABI ve source Cargo.lock eşleşir. İki artifact 7 Ekim 2026'ya kadar saklanır. Preview deploy skipped, yeni ortam deploy edilmedi.

## 11. B01 — onaya hazır boş altyapı

`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_ACTION_PACKAGE`: **COMPLETED_WITH_WARNINGS / LOCAL_STATIC**. Tam işlem gövdeleri: `tmp/video-public-testnet-bootstrap-action-package-20260908/foundation-packet.json`, `github-environment.json`, `github-deploy-switch.json`; açıklama `report.md`.

- GitHub `4rmus/youtick`: `public-testnet` environment, reviewer `4rmus` (`157231908`), protected-branch politikası; repo deploy değişkeni `false`.
- Mevcut Cloudflare hesabı `06b7f27620c16d08f6fdff3748712a59`: yeni boş D1 `youtick-market-read-model-public-testnet`, Queue `youtick-livepeer-events-public-testnet` ve DLQ `youtick-livepeer-events-dlq-public-testnet`. Queue saklama 86400 saniye; bağlanmış üretici/tüketici olmayacak. Gerçek UUID/ID'ler yanıttan alınıp doğrulanacak.
- İşlemden önce aynı ad/hesap tekrar okunur; beklenmeyen kaynak üzerine yazılmaz. Belirsiz cevapta önce mevcut durum uzlaştırılır. B01 deploy/DNS/migration/consumer/NEAR/anahtar/secret/provider/abonelik işlemi içermez.

Cloudflare kullanımı mevcut Web/Bridge/D1/Queue altyapısı içindir. Medya Livepeer'da, ödeme/yayın/hak otoritesi NEAR'da kalır; Cloudflare Stream'e geçiş yoktur.

B02'deki rol ve en fazla 10 test NEAR bootstrap bütçesi yalnız öneridir. Operator sonlu FunctionCall; relayer kendi ayrı hesabında FullAccess ister. 558187 baytlık iki WASM'ın yalnız kod depolama alt sınırı 5,58187 NEAR'dır. İlk 5,096 NEAR bakiye yetersizdi; Bölüm 13'teki ek faucet kanıtı bu kaydı günceller. Yeni anahtar/rol/kurulum onayı gerekir. Native NEAR CLI atomik işlem yolu yardım üzerinden doğrulandı; yeni SDK veya genel bootstrap çatısı eklenmedi, işlem kurulmadı/imzalanmadı.

## 12. B01 uygulanan sonuç

**`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_FOUNDATION`: PASS.** Kullanıcı B01'i açıkça onayladı; GitHub environment/deploy değişkeni, boş D1 ve iki Queue oluşturuldu. D1 UUID `89871d60-3a26-4045-8694-5ff44af579db`; Queue `88fbf7cd91ad4140a74ea9393face0a6`, DLQ `8651053b477c45fbba1386e0ed50fe41`. Cloudflare API iki kuyrukta 86400 saniye saklama, 0 gecikme, 0 üretici ve 0 tüketici doğruladı. D1 0 tablo içeriyor. GitHub reviewer `4rmus / 157231908`, protected branches ve iki deploy değişkeni `false` doğrulandı. Varsayılan admin bypass imkanı teknik olarak kapatılmadı; bypass uygulanmadı.

Kanıt: `tmp/video-public-testnet-foundation-20260908/receipt.json`. Bu bir Worker/provider medya yayını veya kullanıcı kabulü değildir; migration, consumer, DNS, NEAR, anahtar ve secrets işlemleri yapılmadı.

## 13. B02 — onaya hazır yerel kimlik/anahtar hazırlığı

`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_IDENTITIES_PREFLIGHT`: **COMPLETED_WITH_WARNINGS**. Parent `youtick-dev-v3.testnet`, admin/Access owner `lp-arch-admin-260809.youtick-dev-v3.testnet`, guardian/takedown `lp-arch-guardian-260809.youtick-dev-v3.testnet` mevcut. Yerel private→public ve public→on-chain FullAccess eşleşmeleri doğrulandı; imza denenmedi. Yeni dört Market/Access/operator/relayer hesap adı `UNKNOWN_ACCOUNT`.

Önceki kullanıcı faucet yönlendirmesiyle aynı hesaba bir ek talep **+5 test NEAR** getirdi. Kesinleşmiş blok `267551183` parent toplamını **10,0960459175067229 test NEAR** doğruladı; iki başarılı talep toplam 10 test NEAR. Dışarı transfer veya yeni hesap yok; bu bakiye önerilen bootstrap harcamasının onayı değildir.

Onay paketi `tmp/video-public-testnet-identities-preflight-20260908/local-keys-packet.json`: yukarıdaki yönetim kimliği önerisiyle altı ayrı yerel Ed25519 key; üç yönetim, sonlu operator runtime, ayrı FullAccess relayer runtime, off-chain quote imzası. Private hedef yalnız `/Users/arair/.near-credentials/public-testnet-video-v1/`; klasör 0700, dosyalar 0600, exclusive create. Mevcut anahtarlar ezilmez. Altı farklı public key, private→public türetme ve izinler kontrol edilir; repoya yalnız public manifest kaydedilir.

**`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_LOCAL_KEYS`: PASS.** B02 onaylandı ve altı yerel anahtar oluşturuldu. 6/6 farklı public key, private→public eşleşmesi, klasör 0700/dosyalar 0600 doğrulandı; eski anahtarlar korundu. Public manifest `tmp/video-public-testnet-identities-preflight-20260908/public-manifest.json`; hash `00ef4770087338f666524dd8017b80087718f2b3320342a8ccb2f17a5d2f87d6`. Zincir veya secret aktarımı yapılmadı.

## 14. B03 — korumalı fresh-account kurulum kaynağı

`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_EXECUTION_SOURCE`: **COMPLETED_WITH_WARNINGS / LOCAL_STATIC / LOCAL_TEST**. İzole aday `tmp/video-public-testnet-bootstrap-execution-source-20260908/candidate`; kaynak farkı henüz GitHub'a yayımlanmadı. Yeni workflow, sabit public politika, SDK tabanlı yardımcı/testi ve mevcut CI güvenlik kontrolü hazır.

Önceki native CLI değerlendirmesi düzeltildi: 0.29.0'ın üç işlem bloğu sınırı, otomatik gönderim tekrarları ve büyük base64 argv sınırı tam bootstrap'a uygun değil. Mevcut `near-api-js 7.3.0` yeniden kullanıldı; yeni bağımlılık veya genel kurulum çatısı yok. Yardımcı SDK'nın unsigned transaction hash'ini saklar; dört hesabı sıralı ve hesap başına atomik create/fund/key/deploy+init batch'leriyle işler. Belirsizlikte yalnız aynı hash okunur; ikinci gönderim veya sonraki hesap işlemi yoktur.

Yerel doğrulama: bootstrap 9/9, mevcut `npm run test:provider-canary` 101/101, CI güvenlik 15/15; YAML ve dokuz shell bloğu sözdizimi geçti. Bağımsız kaynak incelemesi engelleyici hata bulmadı. Blok `267554184` salt-okunur ön kontrolü dört hesabın yokluğunu, signer/yönetim anahtarlarını ve mevcut ücret/bakiye uygunluğunu doğruladı. İmza/gönderim yok.

Politika: operator 0,2, relayer 1, Market 5, Access 3 test NEAR; toplam aktarım **9,2**. Güncel protokol 85 ön ücret toplamı **0,271258868207585**, toplam ön tahsis **9,471258868207585 test NEAR**. 0,8 ücret rezervi ve toplam 10 test NEAR sınırı operasyonel ön kontrol/durdurma eşiğidir; zincire gömülü kesin `maxFee` tavanı değildir. Her gönderim öncesi yeniden okunur, her kesinleşme sonrası gerçek bakiye farkı kaydedilir.

Onaya sunulacak B03: exact yedi dosyalık paketin commit/push/PR ve zorunlu kontroller sonrası squash merge'i; yeni main CI ve iki artifact'ın aynı hash'lerle doğrulanması; parent `youtick-dev-v3.testnet` imza anahtarının yalnız `4rmus/youtick` → korumalı `public-testnet` environment'ına `PUBLIC_TESTNET_BOOTSTRAP_PARENT_PRIVATE_KEY` adıyla geçici aktarımı; tek korumalı bootstrap koşusu; terminal sonuçtan sonra bu geçici secret'ın kaldırılması. Altı yeni private key GitHub'a veya Cloudflare'a taşınmaz.

Her hesap ve key seti, code hash, Market'in kapalı politika/başlangıç durumu, Access'in gerçek başlangıç durumu ve kurulum blokları kesinleştirilmeden gate geçmez. İlk işlemden önce public plan artifact'ı kalıcılaşır; aynı policy için önceki kayıt veya rerun görüldüğünde otomatik tekrar reddedilir. Main hareketi, CI/artifact farkı, beklenmeyen hesap veya belirsiz sonuç durumunda paket genişletilmeden durulur.

**Tek sonraki gate: `VIDEO_PUBLIC_TESTNET_BOOTSTRAP_RELEASE_AND_RUN` — B03 onayı.** Web/Bridge/D1 migration/consumer/provider/USDC ve gerçek medya kabulü bu onaya dahil değildir. Genel plan `BLOCKED / NOT_COMPLETE` durumundadır.

## 15. B03 onayı ve yürütme kaydı

Tam B03 paketi kullanıcı tarafından onaylandı: exact kaynak yayını, yalnız parent imza anahtarının GitHub `4rmus/youtick` → korumalı `public-testnet` ortamına geçici aktarımı, dört yeni testnet hesabı/sözleşmesinin kurulum batch'leri ve koşu terminal olduğunda geçici secret'ın kaldırılması. Payload/hedef/amaç/kapsam aynı kaldıkça bu aktarım için yeniden onay istenmez. Altı yeni private key yerelde kalır.

`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_RELEASE_AND_RUN`: **PASS**. Onaylı yedi dosyalık patch `16c9f2c` / [PR #181](https://github.com/4rmus/youtick/pull/181) ile yayımlandı; PR CI `34189840713` ve inceleme kapıları geçti. Main `33d7d12f780b26401b1385ad1db80db63e0adc03`; main CI `34190657882` 13/13, yedi artifact imzası ve iki WASM hash'i doğrulandı.

[Bootstrap 34191910269](https://github.com/4rmus/youtick/actions/runs/34191910269) tek dispatch/attempt 1 ve normal reviewer onayıyla SUCCESS. Dört gerçek hesap/batch FINAL; yönetim/runtime key izinleri ve iki sözleşmenin zincirden okunan WASM byte'ları doğrulandı. Market kapalı, publication 0; Access owner/Market bağlantısı ve beklenen açık grant-issuance başlangıcı doğrulandı. Market init bloğu **267602885**.

Parent toplam debit **9,2351909110796079 test NEAR** (9,2 transfer + 0,0351909110796079 ücret/oluşturma); kalan **0,860855006427115 test NEAR**. Parent secret yalnız onaylı GitHub environment'a geçici aktarıldı, terminal koşu sonrası kaldırıldı ve 404 ile yokluğu doğrulandı. Altı yeni private key yerelde kaldı. Detaylar `tmp/video-public-testnet-bootstrap-run-20260908/` altında; bu gerçek kurulum kanıtı, video kabulünün yerine geçmez.

**Sonraki hazırlık: `VIDEO_PUBLIC_TESTNET_CLOSED_RELEASE_PREFLIGHT`.** Kapalı yayın paketi Bölüm 16’da hazırlandı; consumer/medya kabulü ayrı kalır. Genel plan `NOT_COMPLETE` durumundadır.

## 16. B04 kapalı yayın hazırlığı ve kalan onay

`VIDEO_PUBLIC_TESTNET_CLOSED_RELEASE_PREFLIGHT`: **COMPLETED_WITH_WARNINGS**. Gerçek B03 hesapları/Market init bloğu ve B01 D1/Queue ile kapalı config taslağı, sabit dört migration ve mevcut main/CI üzerinden tek korumalı yayın paketi hazır. Eksik yeni Livepeer public JWT anahtarı nedeniyle canonical config doğrulaması henüz geçmedi; placeholder reddi beklenen sonuçtur.

Kullanıcı Cloudflare tokenını oluşturdu; başarı ekranı/ad doğrulandı, değer çıktılara yazılmadı. Token yeniden oluşturulmaz. Secret aktarımı, Livepeer signing-key oluşturma, migration ve kapalı deploy hâlâ **EXTERNAL_NOT_RUN**. `tmp/video-public-testnet-closed-release-preflight-20260908/report.md` kalan B04 kapsamını ve başarı koşullarını içerir.

**Aktif gate `VIDEO_PUBLIC_TESTNET_CLOSED_RELEASE`: B04 onaylandı, yürütülüyor.** Önceki B03 onay/hesap kurulum engelleri Bölüm 15 ile kapanmıştır. Üç servis/sürüm/domain, kapalı bayraklar ve health/readiness doğrulanmadan bu gate geçmez. Sonrasında gerçek medya/ödeme/oynatma, 5 GB/120 dakika, 10 eşzamanlı upload ve 1000 izleyici kabulü ayrıca kanıtlanmalıdır. Ana plan `NOT_COMPLETE`.

B04 ara kanıtı: kullanıcı onayı kaydedildi; dokuz secret'ın hedef ortam metadata'sı, yeni Livepeer imza anahtarı eşleşmesi, canonical kapalı config ve gerçek D1 dört migration/trigger doğrulandı. Önceki EXTERNAL_NOT_RUN kaydı bu işlemler için güncellendi. Korumalı yayın `34206345769` devam ediyor; gerçek Worker/sürüm/domain/health kabulü henüz açık. Kanıt `tmp/video-public-testnet-closed-release-run-20260908/`.

## 17. B04 terminal sonuç ve B04-R

**Kapalı yayın gate'i FAILED; genel plan BLOCKED / NOT_COMPLETE.** B04 koşusu `34206345769` prepare SUCCESS / deploy FAILURE ile sonlandı. Dokuz secret, yeni Livepeer key eşleşmesi, gerçek D1 dört migration ve altı imzalı release dosyası doğrulandı. Üç Worker onaylı `33d7d12f` sürümleriyle mevcut; Bridge workers.dev DISABLED ve Web root 200. Bunlar public domain kabulü değildir.

Smoke `fetch failed` ve cleanup hatası sonrasında API hedef custom domain sayısını 0 doğruladı; public adresler ENOTFOUND. Özgün ağ hatasının cause kodu yok; DNS yayılımı açıklaması kesin kanıt değil. Public health/readiness ve root-before/after karşılaştırması tamamlanmadı, release receipt artifact yok. Deploy anahtarı false'a döndü; yeni NEAR/media/ödeme/consumer işlemi yapılmadı. Kanıt `tmp/video-public-testnet-closed-release-run-20260908/`.

Aynı gate içinde B04-R düzeltmesi yalnız yeni eklenen domain'in ENOTFOUND durumunu mevcut sınırlı beklemeyle kontrol eder. Beş yeni regresyon: eski kodda ilgili iki hata; düzeltmeden sonra yayın/smoke toplam 100/100 LOCAL_TEST PASS. TLS ve ilgisiz/mevcut domain hataları tekrar edilmez; deneme tükenmesi başarı değildir. Bu kaynak kanıtı canlı sonucu değiştirmez.

Tek sonraki adım `tmp/video-public-testnet-closed-release-recovery-20260908/report.md` içindeki exact dört dosyalık Git yayını ve bir yeni korumalı closed deploy onayı. B04 kapsamındaki token/key/secret/migration işleri tamamlandı; tekrarlanmaz. Gerçek medya/ödeme/oynatma, büyük dosya ve kapasite kabulü hâlâ ayrıca açıktır.

### B04-R onayı ve yayın ilerlemesi — 8 Eylül 2026

Kullanıcı B04-R'nin exact dört dosyalık Git yayını, kontroller sonrası merge ve tek yeni korumalı closed deploy kapsamını açıkça onayladı. `2d866881` patch'i değişmeden `09e1356b019327fcd6dbb6b30aa051ec33b28a03` / [PR #182](https://github.com/4rmus/youtick/pull/182) ile yayımlandı. PR CI `34208344041` SUCCESS; inceleme/çakışma engeli ve açık PR CodeQL bulgusu yok. Squash main **`a1139aea1394c1c9f501d1c6c3e3f53c87f20da7`**, onaylı aynı tree ile doğrulandı. Bypass veya manuel CI tekrarı yapılmadı.

**Aktif gate hâlâ `VIDEO_PUBLIC_TESTNET_CLOSED_RELEASE`, B04-R IN_PROGRESS.** Otomatik main CI `34209568717` çalışıyor. Önceki B04-R onay bekleme kaydı kapanmıştır; yeni main CI geçmeden deploy anahtarı açılmaz. Mevcut dokuz secret, aynı kapalı config, üç Worker sürümü, kapalı Bridge ve consumer 0 durumu yeniden doğrulandı. Bu ara kayıt canlı yayın PASS değildir. Güncel kanıt `tmp/video-public-testnet-closed-release-recovery-20260908/execution/`.

### B04-R terminal sonuç — kapalı yayın PASS

**`VIDEO_PUBLIC_TESTNET_CLOSED_RELEASE`: PASS / CI + PROVIDER + PREVIEW (public-testnet kapalı runtime).** Main `a1139aea1394c1c9f501d1c6c3e3f53c87f20da7`; otomatik main CI `34209568717` SUCCESS (7 başarılı, değişmeyen alanlarda 5 beklenen skip). [Korumalı yayın 34210642070](https://github.com/4rmus/youtick/actions/runs/34210642070) tek dispatch/attempt 1 ve normal reviewer onayıyla SUCCESS. Altı release dosyasının imzası exact yeni koşu/source/manifest hash'iyle doğrulandı. Aynı kapalı config `090dd2345eb9bf33be95dacd68eca6ddd2ace26c496635b3a16faca06e5373e7` kullanıldı.

Üç gerçek sürüm, source etiketi ve %100 trafik Cloudflare API ile eşleşti: Web `de625440-b74d-4508-ad6a-6bf0deef1701`, Bridge `68434d08-4d60-4df1-ac8b-31c4d56bc632`, read-model `2ddec14f-cb8a-44cf-9a68-3104031285db`. Üç hedef custom domain doğru Worker/zone'a bağlı. Public Web root 200; Bridge ve read-model health 200/DISABLED. Read-model doğru Market ve başlangıç bloğu 267602885, ingestion/backfill false. Workflow ve bağımsız root-before/after karşılaştırması eşit. Yayın receipt'i indirildi/doğrulandı; deploy anahtarı tekrar false.

Token, anahtar ve D1 migration tekrar oluşturulmadı/uygulanmadı; üç mevcut Worker güncellendi (`bootstrap=false`). Önceki B04 başarısız denemesi tarihsel olarak korunur; kapalı yayın engeli bu yeni gerçek kanıtla kapanmıştır. Kanıt `tmp/video-public-testnet-closed-release-recovery-20260908/execution/receipt.json`.

**Aktif gate: `VIDEO_PUBLIC_TESTNET_QUEUE_CONSUMER_PREFLIGHT`.** Mevcut Queue producer 1, consumer 0; ayrı consumer bağlama paketi hazırlanır. Kapalı yayın gerçek medya/ödeme/Discover/kapasite kabulü değildir. Ana plan NOT_COMPLETE.

### B05 consumer hazırlığı

**`VIDEO_PUBLIC_TESTNET_QUEUE_CONSUMER_PREFLIGHT`: COMPLETED_WITH_WARNINGS / LOCAL_STATIC + PROVIDER.** Ana Queue ve DLQ ad/ID'leri doğrulandı; iki consumer listesi boş, anlık backlog ikisinde de 0 mesaj / 0 bayt. Mevcut release kontrolü ve Wrangler 4.90.0 payload'ı aynı ayarları kullanır: batch 10, concurrency 1, retries 3, batch timeout 5000 ms.

Kapalı Bridge consumer yolu mesajı retry eder; bu yüzden yalnız iki kuyruğun boşluğu işlem anında da doğrulanırsa bağlantı yapılacak. Consumer bağlamak için worker deploy, yeni anahtar veya uygulama kodu gerekmez. Mesaj gönderme/çekme/purge ve kabul açılışı pakette yoktur. Tam paket `tmp/video-public-testnet-queue-consumer-preflight-20260908/report.md` ve `action-package.json`.

**Aktif gate: `VIDEO_PUBLIC_TESTNET_QUEUE_CONSUMER_BINDING` — B05 onayı bekleniyor.** B04-R onayı consumer bağlamayı kapsamıyordu. Yeni consumer henüz oluşturulmadı; gerçek mesaj teslimi ve medya kabulü UNPROVEN. Genel plan NOT_COMPLETE.

### B05 consumer bağlantısı ve bulunan API uyumsuzluğu — 8 Eylül 2026

**`VIDEO_PUBLIC_TESTNET_QUEUE_CONSUMER_BINDING`: COMPLETED_WITH_WARNINGS / PROVIDER.** B05 açıkça onaylandı; tek consumer `43139219af604e29a9588e9c878f9d32`, yeni Bridge `youtick-livepeer-bridge-public-testnet` için oluşturuldu. Batch 10, concurrency 1, retries 3 ve max_wait_time_ms 5000 gerçek yanıtta eşleşti; sağlayıcının retry_delay değeri 0. İki kuyruk önce/sonra 0 mesaj / 0 bayt; DLQ consumer yok. Bridge aynı `68434d08-4d60-4df1-ac8b-31c4d56bc632` sürümünde DISABLED, iki deploy anahtarı false. Mesaj veya yeniden deploy işlemi yok. Kanıt `tmp/video-public-testnet-queue-consumer-run-20260908/receipt.json`.

Canlı consumer listesi Worker adını **`script`** alanında döndürüyor; mevcut release kontrolü yalnız `script_name` beklediğinden doğru bağlantıyı reddediyor. Bağlantı yeniden oluşturulmaz veya ayarları değiştirilmez. Aynı gate içinde dört satırlık yerel düzeltme, desteklenen iki alanın mevcut olanlarının tamamını doğru Worker'a eşit tutar; eksik/null/yanlış/çelişkili adları reddeder. Diğer kimlik/DLQ/ayar kontrolleri değişmedi.

**Yerel uyum kanıtı:** yedi regresyonda eski kodun iki hatası görüldü; düzeltme sonrası mevcut yayın/smoke testleri **107/107 PASS**. Üç gerçek salt-okunur GET yanıtının aynı kaydı mevcut main kontrolünde reddedildi, yerel düzeltilmiş kontrolünde kabul edildi. Bu, canlı callback/mesaj işleme veya yeni GitHub source kanıtı değildir.

**Tek kalan adım: B05-R exact dört dosyalık kaynak yayını onayı.** `tmp/video-public-testnet-queue-consumer-compat-20260908/report.md` ve `action-package.json` hazır. Commit/push/PR, zorunlu kontroller sonrası squash merge ve yeni otomatik main CI doğrulaması istenir; consumer/deploy/secret/NEAR/media işlemi içermez. B05 bağlantı onayı bu yeni Git yayınını kapsamıyordu. Ana görev BLOCKED / NOT_COMPLETE; mevcut kapalı yayın korunur.

### B05-R onayı ve kaynak yayını — 8 Eylül 2026

B05-R kullanıcı tarafından açıkça onaylandı. Exact `9a0d33e8` patch'i değişmeden `40d333ed6c6c1d8ce0f4c731d51d76c029484e28` / [PR #183](https://github.com/4rmus/youtick/pull/183) olarak yayımlandı. Otomatik PR CI `34216428876` çalışıyor; merge ve yeni main CI doğrulaması henüz tamamlanmadı. Önceki B05-R onay bekleme kaydı kapanmıştır. Aktif gate aynı consumer uyum işi, **IN_PROGRESS**; yeni deploy/consumer/secret/NEAR/media işlemi yoktur. Güncel kanıt `tmp/video-public-testnet-queue-consumer-compat-20260908/execution/`.

B05-R kaynak ilerlemesi: PR CI `34216428876` SUCCESS, inceleme/çakışma engeli ve açık PR CodeQL bulgusu yok. [PR #183](https://github.com/4rmus/youtick/pull/183) normal squash merge ile **`9fbe92471105ba58ad03217707eabf004d7cf73a`** main'ine alındı; onaylı head ile tree eşitliği doğrulandı. Otomatik main CI `34217424569` devam ediyor. B05-R henüz tamamlanmış sayılmıyor. Çalışan kapalı Worker'lar B04-R source `a1139aea` sürümleridir; bu kaynak yayını deploy yapmaz.

### B05-R terminal sonuç — consumer gate PASS

**`VIDEO_PUBLIC_TESTNET_QUEUE_CONSUMER_BINDING`: PASS / PROVIDER + LOCAL_TEST + CI.** Onaylı B05-R paketi [PR #183](https://github.com/4rmus/youtick/pull/183) ile normal kontrollerden geçerek main **`9fbe92471105ba58ad03217707eabf004d7cf73a`** oldu. PR CI `34216428876` ve otomatik main CI `34217424569` SUCCESS; exact tree eşleşmesi ve açık PR CodeQL bulgusu olmaması doğrulandı. `script`/`script_name` uyumsuzluğu artık yayımlanmış source'ta giderilmiştir.

Gerçek consumer `43139219af604e29a9588e9c878f9d32`, doğru Bridge/DLQ ve 10/1/3/5000 ayarlarıyla korunuyor; iki kuyruk boş ve DLQ consumer yok. Çalışan kapalı Bridge hâlâ B04-R source `a1139aea`, sürüm `68434d08-4d60-4df1-ac8b-31c4d56bc632`, DISABLED; iki deploy anahtarı false. Yeni deploy, consumer değişikliği veya mesaj işlemi yapılmadı. Kaynak uyumu için 107/107 yerel test ve aynı gerçek API kaydının eski/yeni kontrol karşılaştırması saklandı. Kanıt `tmp/video-public-testnet-queue-consumer-compat-20260908/execution/receipt.json`.

**Aktif gate: `VIDEO_PUBLIC_TESTNET_ACCEPTANCE_PREFLIGHT`.** Küçük S örneğiyle gerçek kullanıcı kabulünün açılış/kimlik/bütçe paketi hazırlanır. Consumer bağlantısı tek başına mesaj teslimi, video/ödeme/Discover veya kapasite kabulü değildir. Ana plan NOT_COMPLETE.


### B06 kabul hazırlığı ve kapalı önkoşul paketi — 8 Eylül 2026

**`VIDEO_PUBLIC_TESTNET_ACCEPTANCE_PREFLIGHT`: COMPLETED_WITH_WARNINGS / LOCAL_STATIC + PROVIDER.** S dosyasının mevcut hash/boyutu eşleşti; yeniden üretilmedi. Kesinleşmiş blok 267636695 Market'in frozen/paused ve publication 0 olduğunu, quote version 1 ve doğru relayer FullAccess anahtarını doğruladı. Mevcut dört aday hesap FT kayıtlı ve test USDC bakiyeli; Meteor profilleri/normal kullanıcı yolu henüz doğrulanmadı. Chrome 152.0.7977.77 ve Edge 151.0.4129.59 kurulu.

Önceki boş Livepeer fatura bilgisi güncellendi: Growth, 1 Eylül–1 Ekim 2026, görünen gelecek fatura 100 USD/overage 0; kullanım 0,40 transcoding, 0,00 delivery, 112,95 storage dakika. Mevcut 13 asset ready ve 720p; tek webhook Preview'a bağlı. Yeni public-testnet webhook, 360p+720p işleme ve küçük test bütçesi açık. İki çıktı/saklama dönemi fatura hesabı henüz teyitli değildir; 5 USD önerisi onay veya hard cap sayılmaz.

**Aktif gate: `VIDEO_PUBLIC_TESTNET_CLOSED_RUNTIME_PREREQUISITES` — B06 onayı bekleniyor.** Paket `tmp/video-public-testnet-acceptance-preflight-20260908/report.md`: mevcut quote ve relayer anahtarlarının yalnız korumalı GitHub public-testnet ortamına iki yeni secret olarak aktarımı; yeni Market'in kendi yönetim anahtarıyla yalnız test USDC `storage_deposit` kaydı. Quote PKCS8/base64 dönüşümü bellekte doğrulandı; yeni anahtar oluşturulmaz. GitHub'da iki hedef ad yok, önceki dokuz secret korunur.

Market USDC kayıtlı değil. Depozito **0,00125 test NEAR**, gas **30 Tgas**, son ön toplam **0,032169579889161 test NEAR**; debit durdurma eşiği **0,04 test NEAR** (zincirin maxFee alanı değildir). Mevcut rezerv marjı yaklaşık 1,41506 test NEAR; imza öncesi güncel ücret/nonce/kimlik/rezerv ve kayıt durumu kontrol edilir. Hash saklanıp tek send_tx yapılır; belirsizlikte yalnız aynı hash okunur. Hazırlık yalnız unsigned encode yaptı; imza/gönderim ve secret aktarımı yok.

B06 deploy, runtime bayrağı, Market açılışı, provider webhook/medya, USDC ödeme/çekim, actor fonlama veya wallet key import içermez. S testi ayrı webhook, cüzdan profilleri, bütçe, açma/kapatma ve ödeme onayından sonra yürütülür. Ana plan BLOCKED / NOT_COMPLETE. Kanıt `tmp/video-public-testnet-acceptance-preflight-20260908/receipt.json`.


### B06 uygulaması — kapalı runtime önkoşulları PASS

**`VIDEO_PUBLIC_TESTNET_CLOSED_RUNTIME_PREREQUISITES`: PASS.** B06 kullanıcı tarafından açıkça onaylandı. Mevcut quote anahtarı bellekte PKCS8/base64 biçimine çevrilerek `PUBLIC_TESTNET_CREATOR_FEE_QUOTE_PRIVATE_KEY`, mevcut ayrı relayer anahtarı `PUBLIC_TESTNET_NEAR_SPONSOR_RELAYER_PRIVATE_KEY` adıyla yalnız GitHub `4rmus/youtick` korumalı `public-testnet` ortamına aktarıldı. Toplam 11 secret; önceki dokuzunun metadata'sı değişmedi. Yeni anahtar veya Worker secret kurulumu yapılmadı.

Market'in kendi yerel yönetim anahtarıyla test USDC `storage_deposit` işlemi tek gönderimle **FINAL**: `G2HBDJkVaHJDQvfZ6H51qg5whe6HLSh2YchWfiRCP1hj`. Kayıt toplamı 0,00125 test NEAR; gerçek debit **0,0014854745015819 test NEAR**, ücret **0,0002354745015819 test NEAR**. 0,04 kontrol eşiği aşılmadı. Market bakiye **4,9985431629632798 test NEAR**; rezerv karşılanıyor. Kod, anahtar izinleri ve kapalı governance korundu.

Bridge aynı kapalı sürümde DISABLED, iki GitHub deploy anahtarı false. Deploy, açılış, medya/USDC ödeme veya Queue mesaj işlemi yapılmadı. Kanıt: `tmp/video-public-testnet-runtime-prerequisites-run-20260908/receipt.json`, `registration-final.json`, `registration-after.json`, `after-secrets.json`, `after-runtime.json`.

**Aktif gate: `VIDEO_PUBLIC_TESTNET_WEBHOOK_PREFLIGHT`.** Mevcut Preview webhook korunarak yalnız yeni public-testnet Bridge için bağlantı paketi hazırlanır. B06 onayı yeni provider webhook işlemini kapsamaz. Gerçek video kabulü hâlâ NOT_COMPLETE.


### B07 webhook hazırlığı

**`VIDEO_PUBLIC_TESTNET_WEBHOOK_PREFLIGHT`: COMPLETED_WITH_WARNINGS / LOCAL_STATIC + PROVIDER.** Mevcut Preview webhook `3fe1a9b8-0844-461a-9475-b75555ae7429` korunacak. Yeni `youtick-public-testnet-video-v1` adı ve `https://bridge-public-testnet.youtick.net/v1/livepeer-webhooks` hedefi henüz yok. Dört asset olayı ve mevcut B04 HMAC dosyasıyla tek kayıt paketi hazır.

Proje API anahtarından gelir: canlı API `projectId` query parametresini reddetti; birincil auth/controller kaynağı aynı davranışı doğruladı. Yeni kaydın gerçek proje/URL/olay/anahtar eşleşmesi ve eski Preview kaydının değişmediği kontrol edilecek. Mevcut dosya ve anahtar döndürülmez; private değer yalnız sağlayıcıya onaylı HTTPS isteğinde gider.

**B07: PASS.** Bu tarihsel hazırlığın beklemesi aşağıdaki uygulanmış B07 sonucuyla kapandı.


### B07 webhook kaydı PASS; çalışma tarayıcısı Brave

**`VIDEO_PUBLIC_TESTNET_WEBHOOK_REGISTRATION`: PASS / PROVIDER.** B07 onaylandı ve tek POST ile webhook `15815bf0-b750-49bc-bdd2-816c8c29136d` oluşturuldu: `youtick-public-testnet-video-v1`, proje `53baeeda-930d-45be-bda6-a41090e6d25e`, hedef `https://bridge-public-testnet.youtick.net/v1/livepeer-webhooks`, dört asset olayı. GET ile alanlar ve HMAC değeri bellekte karşılaştırılarak doğrulandı. Preview webhook `3fe1a9b8-0844-461a-9475-b75555ae7429` ve anahtarı değişmedi. Bridge aynı DISABLED sürümünde; iki deploy anahtarı false. Test/resend, Queue mesajı veya medya işlemi yapılmadı. Gerçek teslim kanıtı hâlâ UNPROVEN. Kanıt `tmp/video-public-testnet-webhook-run-20260908/receipt.json`.

8 Eylül kullanıcı yönlendirmesiyle mevcut hazırlık ve ilk kullanıcı yolu **Brave** üzerinden yürütülür. Chrome yalnız hazırlık için incelendi; anahtar/parola girilmedi, cüzdan oluşturulmadı veya işlem imzalanmadı. Chrome/Edge sonucu üretilmiş sayılmaz. Kullanıcı Brave'deki mevcut Meteor testnet cüzdanını açtı; creator `lp-arch-creator-260809.youtick-dev-v3.testnet`, `lp-p3-creator-a-250825.youtick-dev-v3.testnet` ve stranger `lp-p3-creator-b-250825.youtick-dev-v3.testnet` hesapları mevcut. Yeni import yapılmadı.

**Aktif gate: `VIDEO_PUBLIC_TESTNET_SMALL_ACCEPTANCE_PREFLIGHT`.** Brave'deki eski `lp-d6-buyer-5301d15` hesabında yalnız 1 micro test USDC olduğu görüldü. Fonlama/import yerine, mevcut ve 19,4 test USDC bakiyeli `lp-p3-creator-a-250825.youtick-dev-v3.testnet` buyer C adayıdır. Kullanılabilir NEAR 0,1073935190650654; 100 Tgas bilet işleminin muhafazakâr ön tahmini 0,100922059413308 test NEAR. Gerçek işlem anında yeniden kontrol edilir. Mevcut tek profil hazırlığı ayrı profil kabulünün yerine geçmez.

Kapalı/acceptance/drain config taslakları mevcut araçla doğrulandı. Öneri operasyon bütçesi 5 USD ve iş rezervasyonu 5 USD; gerçek sağlayıcı faturası için hard cap değildir. Repo config'i veya runtime değiştirilmedi. Açılış/kapatma, ücretli S deneyi ve kullanım bütçesi henüz onaylanmadı.

B08: Kullanıcı anlık görüntüyü seçti; kesinleşmiş 267651604 bloğunda uygulandı. Eski olay geçmişi aktarılmadı. Sürekli takip aşağıdaki ayrı B08-DRAIN paketini bekliyor.

### B08 anlık görüntü başlangıcı PASS; sürekli takip yayını bekliyor

**`VIDEO_PUBLIC_TESTNET_READ_MODEL_BOOTSTRAP`: PASS / PROVIDER.** Kullanıcı “Anlık görüntü — hızlı başlangıç” seçimini “hızlı başlangıç yap” talimatıyla uygulamaya açtı. Mevcut bootstrap aracı on uygulama tablosunun boşluğunu ve aynı kesinleşmiş blokta Market frozen/paused true, yayın sayısı 0 durumunu doğruladı. D1'e tek başlangıç kaydı yazıldı: blok **267651604**, hash **o8AaDptKU34JD3JnDzrYU8RMgjFpuvoWvkkRKukXB4H**. Geri okuma ve zincir hash'i eşleşti. Eski olay geçmişi aktarılmadı; gerçek Market başlangıcı 267602885 korunur. Kanıt `tmp/video-public-testnet-read-model-bootstrap-preflight-20260908/receipt.json`.

**Aktif gate: `VIDEO_PUBLIC_TESTNET_READ_MODEL_INGESTION` — B08-DRAIN onayı eksik.** Aynı dizindeki `report.md` ve `action-package.json` tek korumalı drain yayını, mevcut B06 anahtarlarının Worker'a aktarılması ve 5/5 USD operasyon ayarlarını somutlaştırır. Bu ayarlar harcama izni/fatura üst sınırı değildir. Yeni yükleme/quote/relay kapalı, Market frozen/paused kalır. Snapshot sonrası kesintisiz ilerleme ve güncel zincire yetişme henüz UNPROVEN. Git/config/deploy veya medya/ödeme yapılmadı. Genel video kabulü NOT_COMPLETE.

LOCAL_TEST: `resume-selection-check.json` verifies that the existing runner selects block 267651605 from the applied D1 snapshot; live ingestion remains UNPROVEN. Evidence directory: `tmp/video-public-testnet-read-model-bootstrap-preflight-20260908/`.

### B08-DRAIN onaylandı; korumalı yayın çalışıyor

Kullanıcı B08-DRAIN paketini açıkça onayladı (paket SHA256 `4e0cc7dd82a735cc9159cff13b86f868fd1abaa8d0f43feecb95a6b56f38b589`). Main `9fbe92471105ba58ad03217707eabf004d7cf73a`, CI `34217424569`, environment reviewer ve mevcut 11 secret metadata'sı doğrulandı. Market hâlâ frozen/paused, yayın sayısı 0. Onaylı 5/5 USD operasyon ayarları GitHub config'e kaydedildi; bu medya harcama onayı değildir.

Tek korumalı `drain` koşusu [34234575687](https://github.com/4rmus/youtick/actions/runs/34234575687) başlatıldı. D1 bootstrap tekrarlanmadı. Yayın, gerçek sürüm ve sürekli aktarım kanıtı henüz bekleniyor; PASS değil. Deploy anahtarı koşu sonunda false yapılacak. Kanıt `tmp/video-public-testnet-drain-run-20260908/`.

### B08-DRAIN FAILED; B08-R yerel hazırlığı tamamlandı

Tek onaylı drain koşusu `34234575687` başarısız bitti; deploy anahtarı false. Altı dosyanın exact kaynak/config/imza kontrolü PASS. GitHub `4rmus` ortam onayını zaten vermişti; ikinci onay gönderilmedi. Canlı hata: başarılı Bridge trafik geçişinden hemen sonraki Wrangler okuması eski 100/0 dağılımını döndürdü ve `traffic_invalid` oluştu. Sonraki API yeni sürümü %100 doğruladı.

**Gerçek durum:** Web `de625440-b74d-4508-ad6a-6bf0deef1701` eski kapalı source `a1139aea`; Bridge `cf062f4c-a6ad-4daa-8dc8-1dc0cb56dca7` ve read-model `5c2f0c79-a512-4509-8399-5a0a64743eec` source `9fbe9247`. B06 anahtarları Bridge'e aktarılmıştır. Upload/quote/relay kapalı; Market frozen/paused. Webhook Queue binding var fakat runtime policy eksikliği nedeniyle readiness false. Üç domain ve root origin korundu. D1 267651604 → 267652324 ilerledi; hash'ler eşleşti, son lag 1322. Güncel zincire yetişme ve üç Worker'ın aynı yayını çalıştırması UNPROVEN.

**Aktif gate `VIDEO_PUBLIC_TESTNET_READ_MODEL_INGESTION`: B08-R onayı eksik.** İzole adayda dört dosyalık düzeltme hazır: yalnız trafik geçişi sonrası en fazla beş durum okuması (deploy tekrarı yok), mevcut public-testnet kuyruk policy alanlarının yayın config'ine taşınması ve B01'in 86400 saniye retention değerinin runtime kontrolüyle eşleşmesi. 109 release/smoke testi, 68 finalize testi, TypeScript ve diff kontrolü PASS / LOCAL_TEST. Yeni Git/CI/deploy yapılmadı.

Paket `tmp/video-public-testnet-traffic-read-recovery-20260908/report.md`; patch SHA256 `52a4760cce6a251d3169d1d92031722b3fd59c3b61003f36c40c5bbed7433bba`, paket SHA256 `e723e2649e70daa7dcf23d8937968f92b03f20eb293f2dac2ce9cea53435ae60`. Tek sonraki adım: dört dosya için commit/push/PR, zorunlu otomatik CI/normal merge ve bir yeni korumalı drain yayını onayı. B08'in tek koşuluk onayı bu yeni Git yayını ve ikinci dispatch'i kapsamıyor. Video kabulü, gerçek webhook teslimi, yükleme ve ödeme hâlâ çalıştırılmadı; genel plan NOT_COMPLETE.

### B08-R onaylandı; PR #184 kontrollerde

Kullanıcı dört dosyalık B08-R paketini ve bir yeni korumalı drain yayınını onayladı. Paket hash'i ve dört dosya doğrulandı; commit `0bdc6911e1f549ad4f81029d02d17b78b6be3c2e`, tree `5a407c8414b2c43e6f6a085cdbda37912d1623ba` izole adaydan yayımlandı. [PR #184](https://github.com/4rmus/youtick/pull/184), CI `34236883235` çalışıyor; henüz merge/deploy PASS değildir. B08-R onay bekleme kaydı kapanmıştır.

Ek canlı read-model gözlemi iki `neardata_unavailable` hatası ve 180 bloğu yaklaşık 113 saniyede tamamlayan bir iş gösterdi. Watermark 267653179, lag 1840; yetişme kabulü hâlâ UNPROVEN. İki yerel salt-okunur neardata isteği 200 döndü; bunlar Worker kaynaklı kesintinin HTTP nedenini kanıtlamaz. Kanıt `execution/readmodel-tail-summary.json`, `execution/neardata-read-probe.json`. B08-R'nin trafik/Queue düzeltmesi bu ayrı aktarım performansı bulgusunu kapatmış sayılmaz.

### B08-R yayın/Queue doğrulandı; B09 aktarım düzeltmesi hazır

Onaylı dört dosya PR #184 ile main `3d61fcd24d689e93f28fda5a8d06c5b6be7805ca` kaynağına alındı; onaylı tree `5a407c8414b2c43e6f6a085cdbda37912d1623ba` eşitliği geçti. PR CI `34236883235`, main CI `34238274707` ve tek korumalı drain koşusu `34239717711` SUCCESS. Altı dosyanın imza/source/config kontrolü geçti; normal reviewer kullanıldı, deploy anahtarı false.

**Gerçek runtime:** Web `2a51c1a7-594a-43b1-b1c8-6f9fb2e7563c`, Bridge `e965868e-b605-4df5-9761-4328a4fae7b1`, read-model `a1b33ef1-99b0-42c5-9dc6-6b254fd105a7` source `3d61fcd2` ve %100 trafikle doğrulandı. Üç domain ve root origin korundu. Queue/playback ready; upload/quote/relay false. Yayın kanıtı `tmp/video-public-testnet-traffic-read-recovery-20260908/execution/drain/runtime-verification.json`.

**Aktarım gate'i hâlâ BLOCKED:** son watermark 267656379, lag 3922. Cloudflare dış istek ölçümünde neardata için 24 HTTP 429; canlı cron logunda `neardata_unavailable` görüldü. Başarılı 180 blok işi yaklaşık 113 saniye sürdü. Eski “HTTP nedeni ayrışmadı” kaydı bu ölçümle güncellendi. Kaynak IP başına dakikada 180 istek sınırını belgeliyor: https://github.com/fastnear/neardata-server#rate-limits . Bu platform ölçümü her isteğin eksiksiz sayımı veya yeni sürümün performans kabulü değildir.

**Onaysız canlı işlem yapmadan B09 hazırlandı:** izole üç dosya mevcut SQL üretimiyle en fazla sekiz ardışık bloğu atomik yazar; public-testnet istek başlangıçları arasında en az 350 ms, bir koşuda en fazla 150 blok ve 50 saniyeden sonra yeni istek başlatmama sınırı getirir. Mevcut istek/yazım bütçe sonrasında tamamlanabilir; global kilit veya paylaşılan IP kotası garantisi değildir. Blok sırası ve D1 trigger'ı korunur; reset/snapshot/atlama yok. 51 test, bundle dry-run ve diff kontrolü PASS / LOCAL_TEST + LOCAL_STATIC. Yerel karşılaştırma aynı 20 blok için D1 gidiş-dönüşünü 41 → 4 gösterdi; süreler simüle, canlı hız kabulü değil.

Paket `tmp/video-public-testnet-ingestion-recovery-20260908/report.md`; patch SHA256 `629531ec2b5a34f4f93e6399344ea3bec46cf715a011bd06812b559545a5312d`, paket SHA256 `5e8df6fc5fe4bf78578c13e5c9b8546601ee238c53680fcd70804f65dc7aa8af`. Tek sonraki adım B09'un üç dosyasının commit/push/PR, zorunlu otomatik CI/normal merge ve bir korumalı drain yayını için onaydır. B08-R onayı kendi dört dosyası ve tek koşusu için kullanıldı. Gerçek webhook teslimi, video/ödeme kabulü ve genel plan NOT_COMPLETE.

### B09 onaylandı; PR #185 kontrollerde

Kullanıcı B09 paketini açıkça onayladı. Paket hash'i `5e8df6fc5fe4bf78578c13e5c9b8546601ee238c53680fcd70804f65dc7aa8af` ve üç dosya doğrulandı; izole commit `2bb51610e2f19d48c3b046f659890e7a42fd23a1`, tree `0a628e788b9430274be66128435a36f506362fda` yayımlandı. [PR #185](https://github.com/4rmus/youtick/pull/185), CI `34245494376` çalışıyor. Yeni merge/deploy henüz yapılmadı; B09 onay bekleme kaydı kapanmıştır. Gerçek aktarım kabulü halen UNPROVEN.

### B09 yayını ve onaylı snapshot yenilemesi uygulandı

PR #185 ile main `91d113a644e298cb0519f1fe5aa59358d02ab615`, tree `0a628e788b9430274be66128435a36f506362fda` onaylı paketle eşleşti. PR CI `34245494376`, main CI `34246978497`, tek korumalı drain koşusu `34248778919` SUCCESS. GitHub deploy değişkeninin ilk okuması eski `false` değerini döndürdü; sonraki read-back `true` doğruladı. İkinci değişken yazımı veya ikinci dispatch yapılmadı. Koşu sonunda anahtar `false`.

Üç gerçek %100 trafik sürümü source `91d113a6`: Web `1ec2f5c0-4224-4a68-a20f-cd1c4d06b834`, Bridge `9dd4112f-391d-44ee-b555-9db1c50fd6cc`, read-model `258b9910-0d65-41d1-959b-5b5a9fffcb5a`. Domain/root origin korundu; Queue policy ve readiness doğru; upload/quote/relay kapalı. Kanıt `execution/drain/runtime-verification.json` ve yayın makbuzu.

Kullanıcı ayrıca `B09-SNAPSHOT_REFRESH` paketini (`e86320952a99b3d58cc8bef8a3a40a75192278594704e15f636797815909a571`) onayladı. B09 yayın doğrulamasından sonra Market frozen/paused, yayın sayısı 0 ve dokuz uygulama tablosu boş koşullarıyla tek watermark satırı atomik olarak yenilendi: **267660097 → 267666835**. Tek başarılı değiştirme, read-back ve zincir hash'i doğrulandı. Eski işlenmemiş geçmiş aktarılmadı; gerçek başlangıç 267602885 değişmedi. Trigger/migration, yeni kaynak veya ek deploy yok. Kanıt `tmp/video-public-testnet-snapshot-refresh-preflight-20260908/run/receipt.json`.

İlk normal takip örneği 267666847 ve lag 81; hash eşleşti. Henüz tek örnek olduğu için canlı aktarım gate'i kapanmadı; sonraki ilerleyen örnekler ve yeni cron sonuçları bekleniyor. Medya/ödeme kabulü NOT_COMPLETE.

### B09 veri aktarımı gate'i PASS

**`VIDEO_PUBLIC_TESTNET_READ_MODEL_INGESTION`: PASS / CI + PROVIDER.** B09 main `91d113a644e298cb0519f1fe5aa59358d02ab615`, PR/main CI ve tek korumalı drain koşusu `34248778919` doğrulandı. Üç Worker %100 aynı kaynakta; Queue ready, upload/quote/relay kapalı; deploy anahtarı false.

Ayrı kullanıcı onayıyla snapshot başlangıcı 267666835 olarak yenilendi; eski işlenmemiş geçmiş taşınmadı. Ardından normal D1 ilerlemesi 267666847 → 267666951, farklar 81 ve 94 blok, hash eşleşmeleri PASS. Snapshot sonrasında aynı yeni read-model sürümündeki iki cron 118 ve 112 blok işledi; ikisi de `applied`, `remaining_blocks=0`, hata/exception yok. Sonuç yalnız kaydı yenilemeye değil normal aktarım kanıtına dayanır. Kanıt `tmp/video-public-testnet-ingestion-recovery-20260908/execution/receipt.json`, `drain/catchup-verification.json`, `drain/cron-observations.jsonl`.

**Tek sonraki gate: `VIDEO_PUBLIC_TESTNET_SMALL_ACCEPTANCE_PREFLIGHT`.** İlk 60 saniyelik video için aktör/cüzdan-bakiye kontrolleri, gerçek medya bütçesi, kontrollü açılış ve kapanış işlemleri somutlaştırılıp eksik onay alınacak. Bu paket henüz uygulanmış veya onaylanmış değildir. Yeni canlı medya, bilet satın alımı veya NEAR açılış işlemi yapılmadı.

Kalan sıra: küçük S uçtan uca kabul → M devam/token yenileme ve hata senaryoları → ikinci creator/kazanç çekimi → 120 dakika/gerçek 5 GB/container sınırları → 10 gerçek eşzamanlı yükleme/1.000 gerçek izleyici ve hız/maliyet kabulü → kapatma/eski beta regresyonu → onaylı herkese açık testnet açılışı. Çalışma tarayıcısı Brave; plandaki ikinci tarayıcı kapsamı kanıtlanmış sayılmaz. Mainnet kapsam dışı; genel plan NOT_COMPLETE.

### 8 Eylül 16:46–16:50 UTC — S preflight BLOCKED; yeni aktarım engeli

**VIDEO_PUBLIC_TESTNET_SMALL_ACCEPTANCE_PREFLIGHT: BLOCKED / PROVIDER + LOCAL_STATIC + CI.** Referans görev ve B09 kaydı uzlaştırıldı. B09'un 81/94 blok ve iki başarılı cron sonucu tarihsel PASS olarak korunur; güncel önkoşul geçmiyor. Watermark 267668188 sabit, fark 2274 → 2450. Aynı sürümde iki cron `invalid_neardata_block` verdi. 267668189 Neardata'da null ve RPC'de UNKNOWN_BLOCK; 267668190 bloğunun prev_height/hash'i doğrudan 267668188 watermark'ına bağlı. Kaynak üretilmemiş yüksekliği gerçek blok beklediği için duruyor. Yeni snapshot/atlama yapılmadı.

S hash/boyut/süre, A/C/D bakiyeleri, Market kapalı durumu, üç B09 sürümü/domain ve deploy anahtarları doğrulandı. Mevcut exact kaynakla üç mod config ve tek S için işlem/kapanış taslağı hazır. Livepeer 13/13 ready; yeni medya yok. Meteor Brave cüzdanı kilitli; ayrı profiller ve Chrome/Edge eksik. Growth kullanım/fatura ekranı yenilendi; 5 USD yalnız onaysız kullanım eşiği, çıktı/saklama hesabı ve saklama süresi teyitsiz. Yeni ödeme, NEAR/D1/config/provider mutasyonu, Git/CI/deploy yapılmadı.

Kanıt/paket: `tmp/video-public-testnet-small-acceptance-preflight-20260908/refresh-1645/report.md`, `receipt.json`, `action-package.json`. Genel plan NOT_COMPLETE. **Tek sonraki gate: VIDEO_PUBLIC_TESTNET_SKIPPED_BLOCK_RECOVERY_SOURCE**; izole kaynak düzeltmesi ve hash zinciri/sıralama regresyonu hazırlığı. Küçük canlı kabul bu engel kapanmadan açılmaz.

### B10-INGESTION kaynak düzeltmesi PASS; canlı uygulama onayı eksik

**VIDEO_PUBLIC_TESTNET_SKIPPED_BLOCK_RECOVERY_SOURCE: PASS / LOCAL_STATIC + LOCAL_TEST.** Yeni kanıt nedeniyle gerekli toparlama hazırlığı yapıldı. Güncel main `91d113a644e298cb0519f1fe5aa59358d02ab615` üzerinden altı dosyalık izole aday; üretilmemiş yükseklikte null yalnız bellekte geçilir, gerçek blok önceki yükseklik/hash bağlantısıyla doğrulanır. D1 0005 iki nullable alan ve aynı atomik yazımda bağlantı kontrolü getirir; eski watermark/veri korunur, sahte blok/snapshot yok. Legacy beta yolu ve dört eski migration değişmedi.

55/55 test, Worker bundle ve diff kontrolü PASS. Gerçek blok verisiyle yalnız yerel tekrar 267668188 → 267668191 (iki gerçek blok); public D1'in özel yerel dışa aktarımı üzerinde migration deneyi satır/sayımları korudu ve kanıtsız atlamayı reddetti. Bunlar canlı toparlama veya video kabulü değildir. Tek koşu bütçesinden uzun eksik-yükseklik aralığı fail-closed kalır ve ayrıca teşhis gerektirir.

Paket `tmp/video-public-testnet-skipped-block-recovery-20260908/report.md`; patch SHA256 `031214297acbce72c1dce904024ccfff69eba5f94e43f7e93663368bcecc630f`, paket SHA256 `884b9a0b1d3ad2eeb1e8bd59337519193944718684ef2d8e692d3af2576e87d8`. **Tek sonraki gate: VIDEO_PUBLIC_TESTNET_SKIPPED_BLOCK_RECOVERY_RELEASE** — altı dosyanın Git yayını, yalnız public D1 için tek 0005 migration ve tek korumalı drain yayını onayı eksik. Yeni commit/push/PR/CI/deploy, canlı migration, NEAR veya medya işlemi yapılmadı. Genel plan NOT_COMPLETE; S açılış/bütçe/cüzdan/tarayıcı kabul şartları ayrıca açıktır.

### B10-INGESTION onaylandı; PR #186 kontrollerde

Kullanıcı Git + tek public D1 0005 migration + tek korumalı drain paketini (`884b9a0b1d3ad2eeb1e8bd59337519193944718684ef2d8e692d3af2576e87d8`) açıkça onayladı. Altı dosya hash'i ve reviewed tree `c01bb7fd51fda92cc7bb73b29485bcdfdd6b992e` doğrulandı. İzole commit `237d38fa63eed519322337717dafbb61edae3741`, PR #186 ve zorunlu CI `34255732932` çalışıyor. Onay bekleme kaydı bu kapsamda kapanmıştır; yeni merge/migration/deploy henüz yapılmadı. Medya/ödeme onayı verilmedi; genel plan NOT_COMPLETE.

### B10 PR #186 merge edildi; exact main CI bekleniyor

PR CI `34255732932` SUCCESS; PR #186 normal kurallarla merge edildi. Main `9ce5f0777e6f7d8e23249f3d6d68669fb11f159b`, tree `c01bb7fd51fda92cc7bb73b29485bcdfdd6b992e` onaylı adayla eşleşti. Main CI `34257171894` 17:39 UTC kontrolünde in_progress (son Rust güvenlik analizi); bu canlı ve belirli koşu bekleniyor, hata veya yeni onay engeli değildir.

B10 onayı Git/migration/tek drain kapsamında geçerli; yeniden istenmez. Canlı D1 migration ve deploy henüz başlatılmadı. Yeni medya/NEAR işlemi yok. Devam kaydı `tmp/video-public-testnet-skipped-block-recovery-20260908/execution/progress.json`; main CI başarılı olduktan sonra onaylı migration ve tek korumalı yayın yürütülecek. Gate henüz PASS değil; genel plan NOT_COMPLETE.

### B10 migration uzlaştırıldı; tek drain yayını çalışıyor

Main CI `34257171894` SUCCESS. Onaylı 0005 migration komutu Cloudflare `7429` storage timeout ile hata döndü; tekrar uygulanmadı. Canlı D1 geri okuması migration'ın **bir kez** kaydedildiğini, iki nullable alanın ve onaylı trigger'ın yerinde olduğunu, watermark 267668188 ile bütün uygulama sayımlarının korunduğunu doğruladı. Migration sonucu PASS / PROVIDER; CLI hata cevabı geçmişte korunur. Kanıt `execution/migration/receipt.json`.

Tek korumalı drain koşusu `34258870873`, exact main `9ce5f0777e6f7d8e23249f3d6d68669fb11f159b` için başlatıldı. Yeni medya/NEAR/snapshot yok. Yayın sürümü ve normal veri aktarımı henüz bekleniyor; gate PASS değildir. Deploy anahtarı bu koşu sonunda false'a geri alınacak.

### B10 yayını PASS; normal geçmiş aktarımı sürüyor

Main `9ce5f0777e6f7d8e23249f3d6d68669fb11f159b`, PR/main CI ve tek korumalı drain `34258870873` SUCCESS. Altı artifact'in exact run/source imzası, config ve üç %100 sürüm doğrulandı: Web `90d71492-734e-46a8-b687-156ba085cfaa`, Bridge `79ff43f4-4f06-495f-a7e9-333eaf92dbb6`, read-model `a52ebdd9-73c3-4ebd-87e2-6b2f5021e858`. Market frozen/paused, yeni upload/quote/relay kapalı; deploy anahtarı false.

0005 migration CLI storage timeout cevabına rağmen tek kez uygulandı; şema/trigger/migration geçmişi ve eski watermark/sayımlar ile uzlaştırıldı, komut tekrarlanmadı. Ana origin fingerprint eşleşti. Preview Worker yayınları B10'dan eski; ham HTML fingerprint istek bazlı CSP nonce farkı nedeniyle eşleşmedi, bundan eski beta tam kullanıcı regresyonu PASS çıkarılmadı.

Yeni sürüm takılan 267668189 yüksekliğini doğru zincir bağlantısıyla geçti. Üç yeni cron 132/133/132 gerçek bloğu hatasız işledi. İlk fark 8745, son fark 8616; watermark 267669103. **VIDEO_PUBLIC_TESTNET_SKIPPED_BLOCK_RECOVERY_RELEASE hâlâ açık:** iki ilerleyen <=180 blok örneği ve yetişmiş güncel cron kanıtı bekleniyor. Bu ilerleyen normal aktarım canlı bir beklemedir; yavaş olması blocker veya PASS sayılmaz. Yeni snapshot, ikinci dispatch, medya/ödeme yok.

Kanıt `tmp/video-public-testnet-skipped-block-recovery-20260908/execution/release-receipt.json`; canlı devam `execution/progress.json` (watch session 45413). Sonraki gate'e geçilmedi; genel plan NOT_COMPLETE.


## 18. Kalan kabulün uzlaştırılması — 10 Eylül 2026

**Gate kapsamı:** İki ana Video V1 belgesini düzeltmek ve M devam paketi hazırlamak. Değiştirilebilir yollar yalnız bu belge ve `public-testnet-video-v1-plan.md`; yerel kanıtlar `tmp/video-public-testnet-remaining-acceptance-preflight-20260910/` altında. Kod, test, workflow, config/secret, provider, NEAR/D1 yazımı ve Git yayını kapsam dışı. Kabul: eski sonuçları koru, geçen/kısmi/kanıtsız maddeleri ayır, aynı dosya/iş/TUS ve değişmeyen 24 saat için uygulanabilir paket oluştur; bu gate’te canlı senaryo çalıştırma.

| Kabul maddesi | Güncel durum ve kanıt sınırı |
| --- | --- |
| Ayrı ortam, B09/B10 kaynak/yayın, migration/bootstrap | Tamamlanmış işlemler yeniden yapılmaz. B10’un eski `WAITING_CATCHUP` dosyası güncel engel değildir; sonraki gerçek publication/Discover kanıtı vardır. Bu tur iki cron/lag serisi yeniden ölçülmedi; health tek başına sürekli aktarım SLO’su değildir. |
| Küçük gerçek yükleme → provider → NEAR yayın | **Tamamlandı / PROVIDER + PREVIEW (public-testnet).** `matrixx`, `lp-7518e5a3-fbd1-444a-909a-5dc8e037f70c`: 17.070.370 bayt, ready, Published/ACTIVE, asset hash/katalog eşleşmesi. Bu 60 sn S fixture’ı değildir; küçük kabulü sırf farklı fixture diye tekrarlama. `tmp/matrixx-upload-check-20260909/verification.json` ve `report.md`. |
| Satın alma, creator erişimi, 30 günlük cihaz | **Temel akış tamamlandı / PREVIEW.** `soteri.testnet` → `utick2.testnet`, iki 12 sn yükleme ve iki satın alma; toplam 5,20 test USDC. Cihaz tek slotta, son başarılı işlemden 30 gün; izleme/yenileme süreyi uzatmadı. Dört işlemin tamamında eksiksiz cüzdan pencere sayımı kanıtlanmadı. Cüzdan kabulü (yerel arşiv: `/Users/arair/works/youtick-lp/docs/architecture/playback-single-signature-wallet-acceptance-result.md`). |
| Reload | **Tamamlandı / PREVIEW.** A/B mevcut ödenmiş videolarda ilk reload, Try again=0 ve yeni imza=0; eski FAILED kaydının bu kusuru kapandı. Reload sonucu (yerel arşiv: `/Users/arair/works/youtick-lp/docs/architecture/playback-reload-fix-release.md`). |
| Normal Discover → Watch | **Tamamlandı / PREVIEW, ölçülen yayın için.** `lp-e6a312e5-4273-481d-a337-7c622a4cca53`, `utick.testnet`: gerçek kart bağlantısından oynatma, Published/ACTIVE ve önce/sonra aynı publication. `tmp/livepeer-publication-validation-main-integration-20260910/existing-job-acceptance/report.md`. Boş katalog UI deneyi bunun yerine kullanılmadı. |
| 360p/720p ve Auto | **Ölçülen videolarda tamamlandı; genel ağ uyarlaması kısmi.** Aynı dizindeki `quality-acceptance/report.md`: viewport değişimiyle gerçek 360p/720p Auto geçişi; yavaş ağ yok. `matrixxx` Auto/360p/720p ölçümleri de mevcut. Her yeni asset için sağlıklı çıktı ayrıca gerekir. |
| Sarma, gerçek token yenileme, ek imzasız geri dönüş | **KAPALI / COMPLETED_WITH_WARNINGS / PREVIEW + PROVIDER.** `matrixxx` (`lp-0ccc24cb-0b79-4eb7-a2ab-72e5fcbe43e6`): 20 sarma birleşik p95 1957 ms, max 2750 ms; aynı player’da 380187 ms ve üç gerçek yenileme, ek cüzdan yok. Playback kapanışı (yerel arşiv: `/Users/arair/works/youtick-lp/docs/architecture/playback-public-testnet-acceptance-preflight.md`), [plan §16](./playback-ux-plan.md). M üzerinde yeniden token kabulü zorunlu değil. |
| Yetkisiz erişim ve A/V | **Kısmi, kapanış uyarısı korunur.** JWT’siz segment 401 araç kanıtı; başka alıcıda satın alma/izleme ve satın almamış hesapta oynamama kullanıcı bildirimi. Kimlik/HTTP ayrıntıları bağımsız doğrulanmadı. Kayıt içi A/V eşleştirmesi fiziksel hoparlör/ekran ≤150 ms kalibrasyonu değildir; fiziksel eşik UNPROVEN. Kapanmış gate yeniden açılmaz. |
| Sabit USD rezervinin kaldırılması | **Tamamlandı / CI + PREVIEW.** Rezerv kaldırma yayını (yerel arşiv: `/Users/arair/works/youtick-lp/docs/architecture/public-testnet-operation-reservation-release.md`), PR #190 / `34399047561`. Eski 5 USD sayaç saklı; uygulanacak aylık/iş rezervi null. Bu gerçek fatura sınırı değildir. |
| M: kesinti/sekme kapanması, yanlış dosya/hesap, aynı TUS ve 24 saat | **Gerçek kabul UNPROVEN / EXTERNAL_NOT_RUN.** Yerel kaynak/test geçmişi mevcut; bu ilk eksik senaryo. §19. |
| Maliyet ve hız hedefleri | **Kısmi.** Tekil süre ölçümleri mevcut; gerçek birim maliyet/hesap faturası, genel upload p95 ve sıcak-cache token p95 <500 ms kanıtı yok. İlk-token/yenileme süreleri sıcak-cache p95 diye sunulmaz. Sayısal diğer hedefler başlangıç ölçümünden sonra, büyük koşudan önce belirlenir. |
| Kazanç çekimi | **UNPROVEN / EXTERNAL_NOT_RUN.** Satın alma, creator bakiyesi veya iki creator bulunması gerçek çekim kanıtı değildir. |
| Chrome/Edge, yavaş ağ, 120 dakika/5 GB, 5 GB+1, diğer kapsayıcılar | **UNPROVEN / EXTERNAL_NOT_RUN.** Brave sonucu Chrome/Edge veya gerçek yavaş ağ kabulü sayılmaz. L/B kaynakları hazır değil. |
| Kayıp/sıra dışı webhook, geç alarm, expiry/kapatma, dayanıklılık | **LOCAL_TEST mevcut; canlı UNPROVEN.** Ready/Published tek başına webhook teslimini ve fault senaryolarını kanıtlamaz. 24 saatin gerçekten dolması ve zamanında yayının sonrasında erişimi ayrıca sınanır. |
| 10 gerçek yükleme / 1.000 gerçek izleyici; eski beta nihai regresyonu | **UNPROVEN / EXTERNAL_NOT_RUN.** Yapılandırma/yerel yük testi kapasite kanıtı değildir. Eski beta sürüm izolasyonu tam kullanıcı regresyonu değildir. Video V1 nihai kabulü açık. |

**Sürüm uzlaştırması:** 10 Eylül 19:50–19:52 UTC salt-okunur kontrolünde GitHub main `9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`, main CI `34507547060` ve son public yayın `34509663409`, attempt 1 SUCCESS. Bu anlık sonuçtur, değişmez güncel sürüm veya yeni işlem yetkisi değildir. Son yayının kayıtlı Web sürümü `d6703271-5a81-47ff-acac-b14a4b57b12c`; canlı Bridge `04e6808a-99b6-4ee1-9b19-393fb17a44c9` ve read-model `1711c568-2a66-49c3-8ed0-602dc26abe75` health kimlikleri receipt ile eşleşti. Web chunk/%100 trafik doğrulaması önceki playback yayınının kanıtıdır; bu tur yeniden yapılmadı.

Market bridge_frozen=false / new_purchases_paused=false; Bridge newUploadReady=true, admission OPEN; read-model ingestion=true/backfill=false. Deploy anahtarının false olması upload kapalı demek değildir. Sabit config hash’i `9a9711d7a3c64cd1befdc71576ba1d02d266b45748f41ceecd296db8d4bd99ed` önceki yayın kaydıdır; config bu tur değiştirilmedi. Eski tabanlı dirty HEAD `d2d3b035ac1e3afa348f353b014339ab46290e16` korundu; yayın adayı değildir. İki mevcut upload dosyası exact main ile birebir eşleşti (`source-parity.json`); başka dosyalar için eşleşme varsayılmaz.

Kanıt sınıfları: belge/dosya/hash ve kaynak uzlaştırma `LOCAL_STATIC`; bu tur başarısız belge build denemesi `LOCAL_TEST`; okunan GitHub koşuları `CI`; salt-okunur servis/chain ölçümleri `PREVIEW (public-testnet)`; Livepeer envanteri `PROVIDER`. Önceki canlı kullanıcı kanıtları kendi tarih ve sınıfıyla kullanıldı. Yeni canlı testler ve Production/Mainnet `EXTERNAL_NOT_RUN`; kanıtı olmayan kabul `UNPROVEN`.

## 19. M dosyasıyla kesintiden devam — incelenebilir işlem paketi

**Önerilen tek sonraki gate:** `VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE`. Paket hazır; **NOT_AUTHORIZED / NOT_RUN**. Bu hazırlık gate’i onu başlatmaz. Eski küçük test, 6 test USDC cüzdan testi, B09/B10 veya playback onayları bu yeni işe genişletilmez.

### Dosya, hesap ve işlem kimliği

| Alan | Sabit paket / koşu öncesi şart |
| --- | --- |
| Kaynak M | `tmp/video-controlled-acceptance-preflight-20260907/media/medium-10m.mp4`; tam yol `/Users/arair/works/youtick-lp/tmp/video-controlled-acceptance-preflight-20260907/media/medium-10m.mp4` |
| SHA-256 / boyut / süre | `40fcd876e157e0e1663f5deace4cfcbf10988815f3cb4604d8acd053ac007382`; **269.467.407 bayt / 600.025521 sn**. H.264 1280×720, 30 fps + AAC. 10 Eylül yeniden hash/ffprobe eşleşti; önceki tam decode kaydı korundu, yeniden üretim yok. |
| Dosya eşleştirmesi | Ad, boyut, `File.lastModified=1788801580094` ve uygulamanın head/tail fingerprint’i ayrıca kaydedilir. Uygulama fingerprint’i tam dosya SHA-256 değildir. Dosya taşınmaz/kopyalanmaz/düzenlenmez; başta ve sonda tam hash karşılaştırılır. |
| Yanlış dosya | Mevcut `small-60s.mp4`, 26.955.102 bayt / 60 sn, SHA `67d6477e9f81d478dad012e33f12f49abfe0ade9e401f3f44e4b635fd5a4e8fd`, lastModified `1788801476143`. Yalnız yerel negatif seçim; yükleme/ödeme yok. |
| Creator A / yanlış hesap B | Öneri **soteri.testnet / utick2.testnet**. Mevcut gerçek hesaplar; yeni hesap, funding veya key import yok. A’nın mevcut taslağı/aktif işi varsa üzerine yazma; paket durur. Hesap değişimi testi yalnız test oturumunda, kullanıcının diğer sekmelerini/cihazlarını silmeden yapılır. |
| Tarayıcı/cüzdan | **Brave**, aynı test profili ve site verisi; Meteor testnet. Tam sürümler koşu başında kaydedilir. Yeni profil kullanılıyorsa normal cüzdan bağlantısı kullanıcı tarafından sağlanır; anahtar aktarılmaz. Chrome/Edge sonucu iddia edilmez. |
| Ağ / hedef | testnet; Web `https://public-testnet.youtick.net/upload`; Bridge `https://bridge-public-testnet.youtick.net`; Market `video-market-v1-260907.youtick-dev-v3.testnet`; Access `video-access-v1-260907.youtick-dev-v3.testnet`. Eski Preview/beta hedef değildir. |
| İş / başlık / bilet | Başlık `Video V1 kabul — M resume — 2026-09-10`; bilet **2 test USDC**, bu gate’te satın alma **0**. Normal UI’nin üreteceği gerçek job ID, ilk ödeme öncesi J olarak kayda bağlanır; ID enjekte edilmez. J değişirse ödeme yok. Yerelde kontrol edilen kullanılmamış aday `lp-e387ce88-d655-4113-93e8-38ad2d078c83` bir zincir işi veya UI taslağı değildir. |
| Profil / sürüm | `paid-media-livepeer-v1` / `28ba12452dd2cc55e64baf73a3dbf665784eeb8fd87892163818513165bbd3b2`, 360p+720p; §18’deki sürüm referansı. Başlamadan exact main → CI → yayın receipt → serving eşleşmesi yeniden okunur. Değişiklikte yeniden paket uzlaştırılır; otomatik deploy yok. |

### Bütçe ve başlangıç sayımları

**Bu gate’in yetkisi: dış harcama/ödeme/yükleme/işlem imzası 0.** Aşağıdaki rakamlar yalnız M koşusu için onaya sunulan üst işlem sınırlarıdır:

- Bir yeni sponsorlu upload: en fazla **0,60 test USDC** (0,50 yükleme + 0,10 sponsor). Güncel teklif daha yüksekse dur. Bilet satın alma, çekim, ikinci ödeme, yeniden upload ve ikinci asset **0**.
- Bir yükleme delegate onayı; sekme kapanması nedeniyle gerekiyorsa **en fazla bir `replace_upload_key`** işlemi: signer A, receiver Market, aynı J, yeni public key, `expires_at_ms=ilk deadline`, deposit=0. Varsayılan 24 saat ve generation korunur. Ayrı kimlik `signMessage` onayı açılmaz. Kaybolmuş yanıt yeniden ödeme/ikinci key işlemi gerekçesi değildir.
- A + sponsor relayer + operator için koşuya atfedilen toplam **0,10 test NEAR** operasyonel durma eşiği önerilir; önce ücret/storage gereksinimi okunur. B ödeme/imza yapmaz; funding/deploy/init yok. Bu zincire uygulanmış maxFee değildir; tüm rol bakiye farkları/işlem ücretleri kapanışta ayrı yazılır.
- Gerçek provider için öneri **5 USD ek kullanım gözlem eşiği**, tek 10 dakikalık kaynak, iki çıktı, en çok **20 izleyici-dakika**, **30 dakika aktif test**. M yaklaşık 10,00043 kaynak dakikasıdır; iki çıktının faturalama birimi hesapta teyit edilmeden kesin dolar maliyeti hesaplanmaz. Growth/minimum/8 Eylül faturası güncel tarife diye kullanılmaz.
- İlk **24 saat** için kullanım önce/sonra uzlaştırılır; başarılı asset korunur, otomatik silinmez. Sonraki saklama maliyeti devam edebilir ve bu 5 USD’nin kesin fatura tavanı olduğu söylenmez. Güncel hesap birim fiyatları, kullanım gecikmesi ve saklama kapsamı koşu öncesi kaydedilip kullanıcıya sunulur. Kesin fatura tavanı istenirse uygulanabilir provider sınırı kanıtlanmadan başlamaz. Sabit USD rezervini yeniden eklemek veya config bütçesi artırmak çözüm değildir.

10 Eylül **19:50:14 UTC**, final blok **267991378** salt-okunur anlık başlangıç; ödeme öncesinde yenilenmesi zorunlu (`read-only-baseline.json`, `provider-inventory.json`):

| Sayım / bakiye | Hazırlıkta okunan | Koşu başı ve sonu kabulü |
| --- | --- | --- |
| Public Market publication | **5**, tam `get_publications` listesi 5 kayıt | P0 yeniden sayılır; yalnız J’ye atfedilen +1. Başka kullanıcı farkları kimlik bazında ayrılır. |
| Kontrol edilen yerel aday job/publication | `null / null`; henüz UI işi yok | Gerçek J için ödemeden önce null/null, test ödemesi 0, J asset 0, publication 0. Başlangıç bilinmiyorsa imza yok; sıfır varsayılmaz. |
| Admission | OPEN; aktif rezerv **0**; 10 Eylül global deneme **2**, `utick.testnet` **2**, A **0** | A<2 günlük, A aktif=0, global aktif<10. Bir ilk kabul +1; aynı işin resume’sunda ek günlük deneme/rezerv artışı 0. UTC gün değişimini ayrı kaydet. |
| Provider | GET listesi **18 asset / 18 proje kaydı** | Bu yanıtın tam envanter kapsamı henüz UNPROVEN; ödeme öncesi sayfalama/ID seti eksiksiz doğrulanır. A0 + yalnız J için 1 asset; yeniden oluşturma 0. |
| Eski USD sayacı | 5.000.000 mikro-USD; uygulanacak aylık ve iş limiti **null/null** | Tarihsel sayaç, kalan harcama limiti değildir; resume’da yeni dolar rezervi eklenmez. |
| A bakiyesi | **33,30 test USDC; 5,272056240956736797999995 test NEAR** | A’nın test USDC farkı tam teklif, en fazla 0,60; cüzdan storage/gas uygunluğu ayrıca kontrol edilir. |
| B bakiyesi | **11 test USDC; 2,909172726241919099999937 test NEAR** | Bu koşuda test ödemesi 0; mevcut hak/cihazlara yeni işlem yok. |
| Operator / relayer NEAR | **0,1981435298430946 / 0,994851460095444999999995** | Başlangıç ve bitiş final blokları; J işlemleriyle toplam ücret ve bakiye farkı uzlaştırılır. Başka kullanıcı trafiği test maliyetine yazılmaz. |
| Provider fatura/kullanım ve global ödenmiş iş sayısı | **Bu tur ölçülmedi / UNPROVEN** | Önce güncel dönem/kullanım ve J/creator iş/ödeme kayıtları alınır; bilinmeyen global sayım 0 diye yazılmaz. Global job=publication varsayılmaz. |

### Onaydan sonraki tek koşu

1. **Ödemesiz önkontrol:** hesap/cüzdan, sürüm, hash/metadata, kota, bakiyeler, fatura/kullanım, tam provider ID seti, Market publication listesi ve gerçek UI J null/null kanıtını kaydet. Mevcut taslak/ödenmiş iş veya belirsiz ödeme varsa onu üzerine yazarak başlama. Kullanım/onay alanı eksikse dur.
2. **Tek normal ödeme:** A aynı M’yi seçer, tek imzalı sponsor teklifiyle öder. FINAL işlem, ücret, J, generation, `created_at_ms` ve **D0 = created_at_ms + 86.400.000** kaydedilir. UI’nin gösterdiği deadline D0 ile aynı olmalı. Yükleme başlamadan geçici yalnız test sekmesi ağ sınırı yaklaşık 2 MiB/s olarak ayarlanır; bu yavaş ağ kalite kabulü değildir.
3. **Gerçek kesinti ve sekme kapanması:** en az bir tamamlanmış 32 MiB TUS parçasında **0 < offset < 269.467.407** doğrula; asset ID/hash, kaynağın URL’sini açıklamayan SHA-256 kimliği ve offset O1’i kaydet. Ağ kesilir; test upload sekmesi kapatılır. Cancel job düğmesine basılmaz; site verisi/yerel taslak silinmez. Tam dosya kesintiden önce teslim olmuşsa resume PASS sayılmaz ve yeni iş açılmaz.
4. **Negatif seçimler:** aynı Brave profilinde ağı geri açıp önce B’ye geç; M ile A’nın J’sine devam yolu kullanılamamalı, A’nın aktarımı/işlemi tetiklenmemeli. Ödeme düğmesine basma; ayrı kimlik imzası üretme. A’ya dönüp yanlış S’yi seç: J’ye resume reddi veya resume seçeneğinin yokluğu, anahtar/ödeme/provider isteği 0 kaydedilir. Yalnız düğme yokluğu gözlendiyse bunu HTTP/backend ret kanıtı diye sunma. Eski J görünmüyorsa metadata elle kopyalanmaz; J ve taslağın korunması ayrıca kanıtlanır.
5. **Aynı kaynağa devam:** A orijinal M’yi seçer, `Resume / check existing upload`. Gerekiyorsa yalnız izinli tek key replacement, aynı J/D0; sonrasında `recovery: resume`, created=false, aynı asset ve aynı TUS kaynak hash’i. HEAD offset O2 ≥ O1 ve O2 < length; kaldığı offset’ten devam, offset=0 ile yeniden aktarım yok. Anahtar değişimi generation veya 24 saati yenileyemez. Son TUS offset=length kanıtını kaydet.
6. **Yayın ve yeni asset sağlığı:** ready ve 360p+720p, kaynak byte/asset hash eşleşmesi, J Published/ACTIVE ve normal Discover→Watch. Creator A ile gerçek süre/son ve ses-görüntü ilerlemesini gözle; gerekirse her çıktıda kısa kontrol, toplam 20 izleyici-dakikayı aşma. `ef819lp2r3anecgq` için özel timeline düzeltmesini M’ye taşımadan M’nin kendi çıktısını doğrula. Bozuk yeni asset varsa medya kabulü açık kalır; yeniden upload/repair yok. Kapanmış playback’in 20 sarma/token ölçüm serisini tekrarlama.
7. **Kapanış:** J’nin ilk/son created_at, D0, generation, TUS/asset kimliği ve ücret/işlem kayıtlarını karşılaştır. Hedef **1 ödenmiş iş, 1 asset, 1 publication; fazladan ödeme=0, asset=0, publication=0**, recovery için en çok 1 key replacement. Yanlış dosya/hesap adımlarından mutasyon 0; kaynak hash aynı. Diğer kullanıcıların kayıtları testten ayrılır. Geçici ağ sınırı kaldırılır, test videosu duraklatılır; public upload ve mevcut yayınlar **açık** kalır. Otomatik drain/freeze/delete yok; bitiş sayımları ve kalan saklama kullanımı raporlanır.

TUS yetki URL’si, JWT, upload private key, cüzdan secret’ı veya tam yetkili network kaydı rapora yazılmaz. Kaynak kimliği URL’yi dışarı çıkarmadan hesaplanan hash ile karşılaştırılır; offset/length, method, durum ve zaman yeterlidir. Başlangıç sayımları farklı sistemlerde atomik değildir; her snapshot’ın zamanı ve test J’sine atfı korunur.

### Durma koşulları ve kabul sınırı

- Belirsiz ödeme/anahtar yanıtı; yeni ödeme isteği, ikinci asset, J/TUS değişimi veya offset sıfırlanması; yanlış hesap/dosyanın J’yi değiştirmesi: **dur, aynı işlem/job/chain/bakiye uzlaştır**. Yeni quote/ödeme/key işlemi otomatik gönderilmez.
- D0 değişmesi, süresi dolmuş iş, profil/hash/boyut/sürüm farkı, yetersiz kota/bakiye, kullanım/onay eksikliği veya başka trafiğin maliyetini ayıramama: dur. Beklenmeyen üçüncü taraf işi silme veya public ortamı otomatik kapatma.
- TUS sonrası 5 dakikada hâlâ waiting/processing: tek durum kaydı, yeni deneme yok. 15 dakikada ready/publication yoksa veya 30 dakika aktif/20 izleyici-dakika/0,60 test USDC/0,10 test NEAR/5 USD gözlem sınırı dolarsa yeni test işlemi durur; mevcut iş/deadline korunur. Otomatik arka plan işi devam edebilir; durmak provider faturasını kesin kesmez. Hız SLO’su olarak sunulmaz.
- Bu koşu aynı işte değişmeyen 24 saati karşılaştırarak kanıtlar; gerçek 24 saat bekleyip expiry/24 saat sonrası izleme testini kapatmaz. Yanlış dosya senaryosu S ile temsilî rettir; ortası değiştirilmiş aynı boyut/isim/mtime dosyasının tam kriptografik reddi iddia edilmez.
- Tam envanter, fiyat/kullanım ve gerçek UI J başlangıç kaydı koşu öncesi zorunludur. Şimdiki anlık sayımlar ödeme yetkisi değildir. Gate’in uyarısı bunların ve M’ye özgü imza/ödeme/provider kullanım onayının henüz bulunmamasıdır; değişmeyen engel tekrar tekrar sorgulanmaz.

**Hazırlık sonucu: COMPLETED_WITH_WARNINGS.** İki belge güncellendi; kanıtlar korundu, dosya/sürüm/sayım uzlaştırıldı. `docs/testing.md` içindeki `cd docs && npm run build` çalıştırıldı: **FAILED**, değişmeyen iki playback belgesinde önceden var olan altı kırık bağlantı. Bu iki hedef belge için hata bildirilmedi. Explicit-path fark/boşluk kontrolü **PASS**; diğer 273 dosya, HEAD/index/status korundu. Derleme politikası gevşetilmedi, kapsam dışı belgeler değiştirilmedi. Yeni uygulama testleri, tarayıcı M senaryosu, CI rerun, Git yayını, deploy, cüzdan imzası, ödeme/upload/çekim, provider/config veya NEAR/D1 yazımı çalıştırılmadı. **Tek sonraki gate `VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE`; açık onay ve zorunlu başlangıç okumaları olmadan başlamaz.**


Derleme engeli kanıtı: `docs-build.log`. `playback-public-testnet-acceptance-preflight.md` içindeki `source.patch` / `pr-body` geçici yol bağlantıları ve `playback-ux-plan.md` içindeki AGENTS / sözleşme / LivepeerWatch / LivepeerPlayer bağlantıları olmak üzere 6 hata; her iki dosyanın SHA-256 değeri hazırlık öncesiyle aynı. Genel belge derlemesi PASS değildir. Bu uyarı M canlı senaryosunun çalıştırıldığı anlamına gelmez ve ayrı bir gate otomatik açmaz.


## 20. VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE — 10 Eylül 2026

**BLOCKED / M’ye özel işlem onayı bekleniyor; canlı senaryo NOT_RUN.** Kullanıcı gate’i seçti. §19 paketi yeniden okunup salt-okunur önkoşullar ilerletildi; yeni bir hazırlık gate’i açılmadı. Eski ödeme/yükleme onayları bu M işine genişletilmedi.

Amaç aynı M/iş/TUS ve sabit 24 saat, yanlış dosya/hesap reddi, fazladan ödeme/asset/publication=0 kabulüdür. Yalnız bu kabul belgesi ve `tmp/video-public-testnet-m-resume-acceptance-20260910/` yerel kanıtları değiştirilebilir; kod/config/workflow, diğer dirty dosyalar, Git/CI/deploy, migration/bootstrap ve önceki playback işleri kapsam dışıdır. Onay gelmeden imza/ödeme/upload başlatılmaz.

**Tamamlanan önkontrol:**

- 20:01:30 UTC / final blok **267992507**: publication **5**, admission OPEN, aktif rezerv **0**, global günlük deneme **2**, soteri/utick2 günlük denemeleri **0**. Public Market frozen/paused=false; upload açık. M hash/boyut/lastModified §19 ile aynı.
- Main `9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`, CI `34507547060`, yayın `34509663409` SUCCESS; Bridge/read-model health sürümleri önceki receipt ile aynı. Bu tur tam Web bundle/managed traffic tekrar doğrulanmadı; ödeme öncesi kontrol alanı olarak kalır.
- Creator `soteri.testnet`: **33,30 test USDC / 5,272056240956736797999995 test NEAR**. Yanlış hesap `utick2.testnet`: **11 test USDC / 2,909172726241919099999937 test NEAR**. Operator/relayer bakiyeleri §19 ile aynı. Bunlar onay veya otomatik funding yetkisi değildir.
- Livepeer doğru proje `53baeeda-930d-45be-bda6-a41090e6d25e`: UI **18 results**, Previous/Next disabled; API aynı projede **18 benzersiz asset**, hepsi ready. Böylece önceki liste kapsamı belirsizliği anlık envanter için kapandı; ID listesi `provider-inventory.json` içinde. Ödeme anında değişmiş olabileceği korunur.
- Gerçek hesap Billing/Usage ekranları: **Growth, 1 Eylül–1 Ekim**, aylık minimum ve görünen gelecek fatura **100 USD**, aşım **0 USD**. Dakika başına işleme **0,0055 USD**, dağıtım **0,0005 USD**, saklama **0,0015 USD**. Ayrıntılı kullanım **4,94 / 0,00 / 113,36 dakika**. Fatura tablosu dakika sayılarını aşağı yuvarlayarak gösteriyor; ayrı Usage değeri başlangıç kaydıdır. Fatura/ödeme kartı ayrıntıları kayda alınmadı, fatura indirilmedi.
- Usage’ın dağıtımda 0 göstermesi geçmiş gerçek oynatmayı yok saymaz; sayaç gecikmesi/ölçüm kapsamı bilinmiyor. İki çıktının ve saklama döneminin M’ye yansıyacağı kesin fatura tutarı bağımsız doğrulanmadı. Bu nedenle §19’daki **5 USD yalnız gözlem/durma eşiği**; mevcut 100 USD minimumu kapsayan kesin toplam fatura tavanı değil. Test asset’i korunursa sonraki saklama maliyeti sürebilir.
- Brave’de ayrı yeni upload sekmesi **627255337** açıldı; mevcut bağlı hesap **utick2.testnet**, dosya seçilmedi, teklif/iş oluşturulmadı. Diğer görevce kullanılan kullanıcı sekmesine müdahale edilmedi. Onaydan sonra soteri hesabına normal cüzdan seçimi, mevcut taslak/iş yokluğu ve gerçek UI J null/null kontrolü gereklidir. Oturum/veri silme veya key import yok.

**İstenen tek işlem onayı:** §19’daki aynı M dosyasını public-testnet normal arayüzünden `soteri.testnet` ile bir kez yüklemek; Livepeer’da tek asset/iki çıktı ve tek NEAR yayını; yükleme için en çok **0,60 test USDC**, koşuya atfedilen toplam **0,10 test NEAR**; tek upload delegate imzası ve yalnız gerekirse aynı işin ilk deadline’ına bağlı **bir `replace_upload_key`**; `utick2.testnet` ile ödemesiz yanlış-hesap ve S ile yanlış-dosya kontrolü; tek kesinti/sekme-kapama/devam, en çok **30 dakika aktif test / 20 izleyici-dakika**, **5 USD ek kullanım gözlem eşiği** ve korunacak asset’in devam eden saklama kapsamı. Public ortam açık kalır. Yeni satın alma/çekim, ikinci ödeme/asset, provider repair/delete, deploy veya ayar değişikliği dahil değildir.

Bu onay gelmeden ödeme adımına geçilmez. Onay sonrası yalnız ödeme anına bağlı sürüm/bakiye/J/kota kontrolleri tamamlanır; bitmiş playback testleri veya bu fatura hazırlığı gerekçesiz tekrarlanmaz. Aktif gate değişmez. Hesap farklıysa veya ek imza/işlem gerekirse kapsam büyütülmeden durulur.

Kanıt: `read-only-precheck.json`, `provider-inventory.json`, `billing-ui.json`, `receipt.json`. `LOCAL_STATIC` dosya ve koruma kontrolü; `CI` okunan koşular; `PROVIDER` gerçek hesap UI/API; `PREVIEW` public-testnet chain/runtime. M canlı kabulü, imza, ödeme/upload, Git yayını, CI rerun, deploy, NEAR/D1/provider yazımı ve Production **EXTERNAL_NOT_RUN**. Uygulama kodu değişmedi; önceki belge build’inin altı kapsam dışı kırık bağlantı engeli devam eder, aynı başarısız build tekrar koşturulmadı. Yeni belge eki için explicit-path diff/boşluk ve dosya-koruma kontrolü yapıldı.

**Tek devam gate’i: `VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE` — yukarıdaki somut işlem onayı.** Yeni gate veya otomatik monitor/24 saatlik zamanlanmış görev başlatılmadı.


### M onayı alındı; tarayıcı oturumu izolasyonu engeli

Kullanıcı **“onaylıyorum”** dedi: §20’deki M işlem/bütçe kapsamı artık açıkça onaylıdır. Önceki `NOT_AUTHORIZED` / işlem onayı bekleniyor kayıtları tarihsel kalır; **aynı onay yeniden istenmez**. Kapsam ve `authorization.json` korunur. Henüz upload/ödeme/anahtar işlemi denenmedi.

**Güncel sonuç: BLOCKED / BROWSER_SESSION_ISOLATION_REQUIRED.** Ödeme öncesi mevcut yayın kaynağı `9ee5bc18cc48e500c6ec53b2a66296ad891dfde8` yeniden okundu. Brave’de yalnız **İş** profili mevcut ve test sekmesi `utick2.testnet` ile bağlı. Ayrı sekme aynı profilin cihaz deposunu paylaşır; hazırlık paketinde ayrı sekmenin yeterli olduğu varsayımı yanlıştı.

Exact main kaynak kanıtı:

- `WalletProvider.tsx:108–113`: bağlı hesap değişirse önceki hesabın `clearAuth` yolu çalışır; `clearAuth` tüm cihaz oturum deposunu temizler.
- `WalletProvider.tsx:260–278`: Disconnect önce `clearDeviceSession`, ardından gerekirse `revokeBrowserAuthority` çağırır.
- `device-session.ts` içindeki `clearDeviceSession`, IndexedDB `sessions` deposunda `store.clear()` yapar. Yalnız boş yeni sekmenin verisini temizlemez.
- `signless-access-key.ts:66–94`: mevcut oturum yetkisi zaten iptal değilse `revoke_subject_sessions` ve gerektiğinde delete-key işlem paketi hazırlanır. Bu işlemlerin şu an gerekli olduğu canlıda denenmedi; Disconnect'e basılmadı.

Dolayısıyla mevcut İş profilinde soteri’ye geçmek, onaylı “mevcut oturumları koru / yalnız tek upload ve gerekirse tek upload-key yenilemesi” sınırını ihlal edebilir. Negatif hesap testinde A→B→A değişimi de yeni A cihazını temizleyip yayın sonrası creator oynatmasını ayrıca engelleyebilir. Bunu gidermek için yeni ödeme, oturum anahtarı kopyalama, depo yedeğinden secret geri yükleme veya auth kodu değişikliği yapılmaz.

**Gerekli sonraki kullanıcı adımı:** mevcut İş profilinden ayrı, `soteri.testnet` ile normal cüzdan bağlantısı hazır bir Brave test profili sağlanmalı. Creator M upload/resume/oynatması bu ayrı profilde kalır; ödemesiz yanlış-hesap kontrolü mevcut `utick2.testnet` profilinde aynı J durum bağlantısına erişim üzerinden yürütülür. İki profilin ayrı cihaz depoları korunur; başka profildeki negatif kontrol aynı-profilden hesap değişimi testi sayılmaz ve kapsamı raporda açıkça belirtilir. Kullanıcının bu işletim uyarlamasını netleştirmesi gerekir; eski onay tutarları artırılmaz.

Bu tur yalnız kabul kaydı, exact-main kaynak kopyaları, onay ve blocker kanıtı eklendi. Profil oluşturulmadı, hesap değiştirilmedi, çıkış yapılmadı; dosya/teklif seçilmedi, imza/ödeme/asset/upload/publication oluşmadı. Kamuya açık ortam ve kullanıcı oturumları korunur. Tamamlanmış fatura/asset/CI testleri gerekçesiz tekrarlanmadı; yalnız main kaynağı ve gerçek profil/hesap durumu incelendi. Kod değişmediği için uygulama testleri/derleme çalıştırılmadı; belge diff/boşluk ve kapsam dışı dosya koruması doğrulandı.

**Tek devam gate’i hâlâ `VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE`.** Onay geçerli; engel işlem onayı değil, mevcut oturumları koruyan test profili/negatif senaryo düzenidir. Hazırlanmadan canlı koşu başlatılmaz; başka gate veya otomasyon açılmaz.


### M gerçek koşu — aynı işte devam, yayın bekleniyor

Kullanıcı mevcut sekmede `soteri.testnet` hesabını kendisi bağladı ve çalışmaya devam edilmesini istedi. İlk sponsorlu ödeme ve daha sonra tek upload-key yenileme imzasını da kullanıcı tamamladığını bildirdi. Asistan hesap değiştirmedi/Disconnect kullanmadı; eski cihaz oturumlarını temizlemedi.

- İş **`lp-b378185e-eb55-4a31-833d-899acc073def`**, M dosyası 269.467.407 bayt, önceki tam SHA-256 aynı. Başlık `Video V1 kabul — M resume — 2026-09-10`, creator `soteri.testnet`, generation **1**.
- Ödeme öncesi J/null, publication/null, toplam publication **5**; creator **33,30 test USDC**. Canlı 18 Web script’i onaylı yayın artifact’iyle eşleşti (`serving-before-payment.json`).
- Tek ücret **0,60 test USDC**, creator bakiye **32,70**. `created_at_ms=1789071191343`; değişmeyen yayın deadline **1789157591343** (ilk zincir kabulü + 86.400.000 ms). Provider asset **`14d90fad-bf62-4559-ab98-fc0b51173052`**, playback **`14d9jq6gadklup2e`**; proje sayısı **18→19**.
- Brave DevTools ile geçici Fast 4G ayarlandı. UI ilerlemesi en son **%16** görüldükten sonra test sekmesi kapatılarak aktarım kesildi; iş iptal edilmedi. Yerel Brave AX/screenshot erişimi daha sonra boş sonuç verdi. Kullanıcı pencereyi öne getirdiği ve CUA oturumu tazelendiği halde düzelmedi; başka otomasyon/güvenlik yolu kullanılmadı. İlk TUS URL hash/offset kaydı dışarı alınamadı: **UNPROVEN**. UI yüzdesi TUS HEAD kanıtı diye sunulmaz. Orijinal sekme kapanınca o sayfadaki geçici ölçüm sarmalayıcıları sonlandı.
- Aynı J yeniden açıldı. Yanlış S dosyası seçiminde resume yok/ödeme düğmesi kapalı; orijinal M seçilince aynı J için resume açıldı. Yeni ödeme tuşuna basılmadı. Bir `replace_upload_key` tamamlandı; key değişti, son bitiş ilk deadline’a eşit, job/fee/created_at/generation değişmedi. Resume günlük sayacı ve asset sayısını artırmadı. İlk gözlenen devam yüzdesi **%25**, ardından %40/71/86/98.
- Gerçek `/v1/upload-preflight` API’sinde aynı iş/doğru creator+boyut **200 available=true**, `utick2.testnet` creator ile **409 admission_denied**, S boyutuyla **409 admission_denied**. Bunlar cüzdan hesabı değiştirilmeden yapılan gerçek API önkontrolleridir; authenticated yanlış-hesap resume veya aynı profil hesap-değişim kabulü değildir. Ödeme/provider-create isteği gönderilmedi; güvenlik rate-limit muhasebesiyle ekonomik iş sayımları karıştırılmaz.
- Devam aktarımı **20:23:47.721 UTC** tamamlandı; yerleşik `source_transfer completed` süresi **289903,3 ms**. Cüzdan anahtar işlemi **71561,2 ms**, finality beklemesi **1733,6 ms**. Bunlar bu koşunun ölçümleri, upload p95/SLO değildir.
- Arayüz önce `Publication verification blocked` gösterdi, manuel retry olmadan `Livepeer is processing the upload…` durumuna döndü. Provider **processing**, hata mesajı yok; geçici ret nedeninin kesin kodu yakalanmadı, **UNPROVEN**. Toplam ağ debit’i resume sonrası **0,001333051758965200000001 test NEAR**; 0,10 sınırının altında.
- Discover ilk yeni sekme bağlantısı `ERR_CONNECTION_CLOSED` verdi; bir normal reload ile açıldı ve 5 eski yayın göründü. Bu ağ olayı kaynak/ayar değişikliğiyle giderilmedi.

Koşu 20:13:05.611 UTC başladı. TUS sonrası 5 dakika kontrolü **20:28:47.721**, 15 dakika yayın yoksa durma **20:38:47.721**, 30 dakika aktif bütçe bitişi **20:43:05.611 UTC**. Yeni işlem/tekrar yükleme yok; mevcut provider/operator işi korunur. Bu ara kayıt yayın veya M tam kabul PASS değildir. Güncel dosyalar `before-payment.json`, `interrupted.json`, `resumed.json`, `after-transfer.json`, `provider-*.json`, `negative-preflight.json`, `checks-resumed.json`, `transfer-complete.json`.


### M koşusu kapanışı — FAILED / yayın doğrulamasında kaynak sınırı

**`VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE`: FAILED.** Onaylı koşu gerçek kesinti/devam ve provider teslimine ulaştı; beklenen tek NEAR yayını oluşmadığı için tam kabul geçmedi. Aynı engeli tekrar tekrar sorgulama, ikinci ödeme/upload, ikinci key yenilemesi, provider onarımı/silme veya otomatik sonraki gate yok.

| Kabul / bütçe | Sonuç |
| --- | --- |
| Aynı M dosyası, iş, creator, generation | **PASS / PREVIEW + LOCAL_STATIC**. J `lp-b378185e-eb55-4a31-833d-899acc073def`, soteri, generation 1; 269.467.407 bayt ve tam yerel SHA-256 değişmedi. |
| Gerçek kesinti ve devam | **Gerçek UI akışı tamamlandı / PREVIEW**. İlk aktarımda %16 gözlemi sonrası sekme kapandı; aynı M/J ile tek anahtar yenilemesi sonrası %25→98→tam teslim. Devam aktarımı 289903,3 ms. |
| Aynı TUS URL hash’i / başlangıç-bitiş HEAD offset | **UNPROVEN**. İlk native ölçüm dışarı alınamadı. Aynı asset ve mevcut resume kodunun davranışı doğrudan TUS kaynak/hash/offset kaydı yerine geçmez. |
| Sabit yayın son tarihi | **PASS / PREVIEW**. İlk `created_at_ms=1789071191343`, D0=`1789157591343`; **11 Eylül 2026 20:13:11.343 UTC / 23:13:11.343 Türkiye**. Anahtar yenilemesi işi/generation’ı veya D0’ı uzatmadı. İlk anahtar bitişinin D0’dan yaklaşık 16 sn erken olması, son tarih değişikliği değildir; yenilenen anahtar D0’a bağlı. |
| Yanlış dosya / hesap | **Kısmi**. S ile UI resume yok; API doğru hesap+boyut 200, yanlış hesap ve yanlış boyut 409 admission_denied. Başka cüzdan oturumuyla authenticated resume ve aynı profil hesap değiştirme çalıştırılmadı. |
| Ücret ve yinelenen işlemler | Tek **0,60 test USDC**, tek upload delegate ve tek `replace_upload_key` kullanıcı imzası. Ek ödeme **0**, bilet/çekim **0**. Zincir/FT bakiye farkları kanıt; iki işlemin transaction hash’i bu koşunun tarayıcı kaydından dışarı alınamadı. |
| Provider asset | **PASS / PROVIDER**: 18→19, eklenen yalnız **`14d90fad-bf62-4559-ab98-fc0b51173052`**; önceki 18 silinmedi. Aynı asset ready, kaynak boyutu 269.467.407, süre 600.025521 sn, JWT politikası. HLS ana playlist’te 640×360 ve 1280×720 görüldü; bu tam video oynatma kanıtı değil. |
| NEAR publication / Discover / oynatma | **FAILED / UNPROVEN**: son final blok **267996104**, 20:34:07 UTC: job Authorized, publication null, global yayın sayısı **5→5**. Hedef +1 yayın gerçekleşmedi; fazladan publication 0. M Discover→Watch ve creator tam oynatma çalıştırılamadı; başka videolar tekrar test edilmedi. |
| NEAR bütçesi | **PASS**. Creator key yenilemesi **0,0002842994664863**, sponsor relayer **0,001048752292478900000001**, operator **0**, toplam **0,001333051758965200000001 test NEAR**; 0,10 altında. B hesabının bakiyesi değişmedi. |
| Provider maliyeti | **UNPROVEN**. Son Usage ekranı yine 4,94 işleme / 0 dağıtım / 113,36 saklama dakikası gösterdi. Bu gecikmeli/toplu sayaçlar yeni 10 dakikalık işin sıfır maliyetli olduğunu kanıtlamaz; 5 USD kesin fatura tavanı denmez. Asset saklanıyor; 24 saat sonraki kullanım uzlaştırması çalıştırılmadı ve otomasyon kurulmadı. |

**Kanıtlanan kaynak engeli:** Exact main `9ee5bc18cc48e500c6ec53b2a66296ad891dfde8` içindeki `workers/livepeer-bridge/src/provider-verification.ts`, `MAX_THUMBNAIL_REFERENCE_PROBES=32` kullanıyor. `vttThumbnailUrls` 33. benzersiz referansta `provider_playback_mismatch` fırlatıyor. Aynı kaynaktaki dosya SHA-256 `535d5826ccba8a021e8a4b6c61e02205eecdbe5fe0a4a27e5b00a901b8244933`; dirty checkout kopyasıyla birebir aynı.

Bu M asset’inin gerçek, yetkili GET ile okunan VTT’si **60 cue / 60 benzersiz referans / fragment kaldırıldığında da 60 ayrı kaynak** içeriyor. Body SHA-256 `6f12b5477ab2680f4a7503c8044cab9d437e5382a81e7fccd2e266764c4a560e`. Dolayısıyla yalnız fragment temizlemek çözüm değildir. Bu dosya mevcut kuraldan geçemez; yayın için giderilmesi zorunlu somut bir engel kanıtlandı. Önceki bütün kontrollerin geçtiği veya canlıda ilk atılan exception’ın kesin bu satır olduğu iddia edilmez: 55 saniyelik redacted Bridge log izlemesi bağlandı ama ilgili olay yakalamadı, sonra kapandı. İlk transient UI hatasının kesin sebebi ayrıca UNPROVEN.

Manifest teşhisi mevcut provider anahtarıyla yalnız bu asset için kısa ömürlü JWT kullanarak HLS/VTT okudu. Yeni signing key, provider ayarı, upload, medya segmenti veya imzalı NEAR işlemi oluşturmadı; JWT/private key çıktı dosyalarına yazılmadı. Bu sağlayıcı teşhisidir, NEAR kullanıcı oynatma kabulünü aşmak için kullanılmadı.

**Dar sonraki kaynak paketi — henüz uygulanmadı:** `VIDEO_PUBLIC_TESTNET_M_PUBLICATION_VERIFICATION_SOURCE`. Mevcut doğrulayıcının 60 gerçek referansı kaynak sınırları içinde işleyebilmesini sağla; her gerçek küçük resim kaynağının anonim erişime kapalı olma kontrolünü koru. VTT’yi sessizce atlama, ret kontrolünü kapatma veya yalnız ilk/son küçük resmi doğrulayıp bütününü PASS sayma. Önce gerçek M şekliyle mevcut 32 sınırında başarısız olan test; ardından 60 kaynak ve açık/bozuk kaynak reddi; mevcut testlerde aynı güvenlik sınırları. 120 dakikalık video desteği için sonuç/bütçe ayrıca belirtilmeli; 60 kaynağın geçmesi tek başına 120 dakika kabulü değildir.

Önerilen kaynak yolları yalnız `workers/livepeer-bridge/src/provider-verification.ts`, `workers/livepeer-bridge/src/provider-verification.test.ts` ve bu kabul kaydıdır. `docs/testing.md` Bridge komutundan `npm test -- --run src/provider-verification.test.ts` ve `npm run check` seçilir; gerçek caller/finalize etkisine göre mevcut ilgili test eklenir. Yeni bağımlılık/servis/refactor gerekmez. Kaynak paketi bile bu gate’te uygulanmadı; Git/CI/deploy ve mevcut işin canlı yeniden doğrulanması ayrı açık kapsam ister. Mevcut M’nin ödemesi ve provider asset’i yeniden oluşturulmaz.

**Kapanış:** public Market ve upload açık kaldı, D0 uzatılmadı, hazır M asset’i ve ödenmiş iş silinmedi. Test kullanım/Discover sekmeleri kapandı; iş durumu sekmesi **627255345** devam için açık bırakıldı. Geçici native TUS ölçümünün kurulduğu ilk sekme kapandı; son native AX/screenshot erişimi çalışmadığından DevTools profil tercihinin No throttling’e dönmesi ayrıca doğrulanamadı. Yeni ölçüm sarmalayıcısı veya ağ engeli kurulmadı; backend’in mevcut alarm/iş takibi sürüyor, zorla iptal edilmedi.

Kanıt dizini `tmp/video-public-testnet-m-resume-acceptance-20260910/`: `final.json`, `provider-final.json`, `manifest-diagnosis.json`, `verification-blocker.json`, `checks-resumed.json`, `negative-preflight.json`, `billing-after.json`, `transfer-complete.json`, `receipt.json`. `LOCAL_STATIC` kaynak/yerel dosya; `PREVIEW` gerçek public-testnet UI/chain/API; `PROVIDER` gerçek asset/manifest/kullanım; mevcut `CI` kanıtı yeniden koşulmadı. Yeni uygulama testi/build, Git yayını, deploy, provider/config değişikliği, NEAR/D1 manuel onarım, silme ve dış destek talebi yok. Önceden bilinen altı belge build bağlantı hatası kapsam dışı kaldı; aynı başarısız build tekrarlanmadı. Yalnız bu belge ve yerel kanıt dosyaları değişti; explicit-path diff/boşluk ve dosya-koruma sonucu `receipt.json` içindedir.

**Tek sonraki gate: `VIDEO_PUBLIC_TESTNET_M_PUBLICATION_VERIFICATION_SOURCE`.** Otomatik başlatılmadı; maliyet/hız veya başka Video V1 gate’ine atlanmadı.


## 21. VIDEO_PUBLIC_TESTNET_M_PUBLICATION_VERIFICATION_SOURCE — 10 Eylül 2026

**COMPLETED_WITH_WARNINGS / LOCAL_STATIC + LOCAL_TEST / NOT_DEPLOYED.** Kullanıcı bu kaynak gate’ini seçti; yalnız mevcut doğrulayıcı, ilgili test ve bu kabul kaydı değişti. Amaç M’nin 60 farklı küçük resim kaynağını atlamadan doğrulayabilmektir. Kabul: 60/64 kaynak geçer; 65 kaynak reddedilir; son kaynak açık, yönlendirmeli, erişilemez veya izin verilmeyen hostta ise yayın doğrulanmaz. Kod, config/secret, NEAR/D1, provider veya canlı veri yayınına bu kaynak gate’i yetki vermez; kapsam dışı kod/refactor yapılmaz.

### En küçük kaynak düzeltmesi ve kanıt

- `provider-verification.ts`: `MAX_THUMBNAIL_REFERENCE_PROBES` **32→64**. Mevcut ortak `verifyLivepeerReadyAsset → vttThumbnailUrls → requireAnonymousPlaybackDenied` yolu korunur. Tüm VTT’lerde birleşik Set sınırı ve her kaynak için anonim `Range: bytes=0-0`, yönlendirmeyi takip etmeme ve yalnız 401/403 kabulü değişmedi. VTT/thumbnail atlama veya ilk/son örnekle bütününü PASS sayma yok.
- `provider-verification.test.ts`: gerçek M’nin kaydedilmiş **60 ayrı kaynak / 10 saniyelik cue** yapısını temsil eden yerel VTT fixture’ı; 60 ve 64 kaynağın **tam listesinin birer kez** sorgulandığı kontrol edildi. Son kaynakta 200/302 reddi, 503’ün retryable `provider_unavailable` kalması, izin verilmeyen host ve 65 kaynak aşımı ayrıca kapsandı. Anonim isteklerde JWT bulunmadığı, Range ve manual redirect seçeneği korunduğu doğrulandı. Gerçek provider çağrısı yok.
- Önce yalnız yeni regresyon çalıştırıldı: eski kodda **5 beklenen hata / 2 geçiş**, 60/64 kaynakta `vttThumbnailUrls` içindeki eski 32 sınırı hatası dahil. Düzeltmeden sonra mevcut doğrulayıcı, Bridge giriş ve finalize testleri birlikte **253/253 PASS**; `npm run check` **PASS**.
- Çağrı akışı incelendi: `LivepeerProvider.verifyReadyAsset` ortak doğrulayıcıyı, `index.ts` içindeki `verifyReadyProviderAsset` de bu provider yolunu kullanıyor. Ayrı kapak okuma yardımcısı `firstVttThumbnailUrl` değişmedi. Yeni servis, yardımcı soyutlama, bağımlılık veya paralel istek düzeni eklenmedi.

Komutlar `docs/testing.md` içindeki mevcut Bridge komutlarından seçildi:

```sh
cd workers/livepeer-bridge
npm test -- --run src/provider-verification.test.ts -t 'M-shaped'
npm test -- --run src/provider-verification.test.ts src/finalize.test.ts src/index.test.ts
npm run check
```

İlk komut düzeltme öncesindeki bilinçli kırmızı kanıttır; son iki komut düzeltme sonrasında geçti. Başarılı kontroller gerekçesiz tekrarlanmadı. Yalnız son kaynak yorumunun açıklığı düzeltildi; davranış değişmedi.

### Bütçe, 120 dakika ve canlı sınırı

Bu gate yalnız M kabul engelinin en küçük düzeltmesidir. En fazla **64 benzersiz thumbnail GET**, mevcut **sıralı** yürütme ve istek başına **5 saniye** zaman aşımı korunur. Yeni eşzamanlılık yok; VTT/thumbnail tavanı sınırsız yapılmadı. Bu, toplam runtime gecikmesi garantisi değildir: 64 yavaş ama zaman aşımına uğramayan istek teorik olarak yaklaşık 320 saniye bekleme yaratabilir; diğer doğrulama adımları buna dahil değildir. Gerçek M doğrulama süresi, Worker kaynak bütçesi ve istemci/alarm davranışı sonraki onaylı canlı kontrolde ölçülmelidir. Yerel 2,69 saniyelik test süresi canlı süre diye sunulmaz.

**120 dakika hâlâ UNPROVEN.** 10 saniyede bir ayrı küçük resim varsayımıyla 120 dakika yaklaşık 720 kaynak eder ve yeni 64 sınırını da aşar. Süreye göre gizli izin, sınırsız limit veya güvenlik kontrolü atlama eklenmedi. Daha büyük VTT’lerin kaynak bütçesi ölçülmeden bu sınır tekrar artırılmaz; gerekirse mevcut iş takibi içinde kademeli doğrulama ayrı kapsamda tasarlanır. Bu gate 120 dakika/5 GB kabulünü kapatmaz.

### Koruma, yayın adayı ve sonraki gate

10 Eylül’de salt-okunur okunan main **`9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`**. Değişiklik öncesi iki kaynak/test dosyası exact main ile birebir eşleşti; eski dirty root HEAD **`d2d3b035ac1e3afa348f353b014339ab46290e16`** olduğu için kök checkout yayın adayı sayılmaz. İki dosyalık küçük fark `source.patch`, üç değişen dosyanın hash’leri `receipt.json` içinde saklandı. Belge farkı ayrı `acceptance.patch`; eski kullanıcı değişiklikleri kaynağa karıştırılmadı.

Kaynak engeli yerelde giderildi; mevcut ödenmiş M işinin **son canlı kaydı Authorized / publication null**, asset ready olarak §20’de kalır. Bu tur canlı job/provider durumu yeniden okunmadı, retry/finalize gönderilmedi, ödeme/anahtar/asset işlemi yapılmadı. D0 **1789157591343** uzatılmaz; sonraki onaylı canlı adım başlamadan işin son tarihi ve o andaki state tekrar okunur. Süre dolmuşsa eski onayla yeniden ödeme/upload başlatılmaz. Public ortamı kapatma, B09/B10, migration/bootstrap ve playback gate’ini yeniden açma yok.

Sonuç dosyaları `tmp/video-public-testnet-m-publication-verification-source-20260910/`: `red.log`, `tests.log`, `typecheck.log`, `main-parity.json`, `source.patch`, `acceptance.patch`, `receipt.json`. Üç explicit-path değişiklik ve diğer **272 dosya** ile HEAD/index/status koruması kontrol edildi; diff/boşluk kontrolü geçti. Önceki altı kapsam dışı belge build bağlantı hatası bu gate’te değiştirilmedi veya tekrar koşturulmadı.

**Çalıştırılmayanlar: EXTERNAL_NOT_RUN / UNPROVEN.** Yeni CI/Git yayını/PR/merge/deploy, provider/NEAR/D1 mutasyonu, mevcut M için canlı doğrulama/yayın/Discover/oynatma, TUS offset tekrar ölçümü, gerçek maliyet/hız ve 120 dakika kabulü. Yerel mock testi bunların yerine geçmez.

**Tek sonraki gate: `VIDEO_PUBLIC_TESTNET_M_PUBLICATION_VERIFICATION_RELEASE_PREFLIGHT`.** Exact main üzerinden yalnız bu farkın yayın adayını ve mevcut M’yi yeniden ödeme yapmadan doğrulama paketini hazırla; Git ve deploy için somut kapsam onayı alınmadan çalıştırma. Kaynak gate’i burada biter; sonraki gate otomatik başlamadı.


## 22. VIDEO_PUBLIC_TESTNET_M_PUBLICATION_VERIFICATION_RELEASE_PREFLIGHT — 10 Eylül 2026

**COMPLETED_WITH_WARNINGS / LOCAL_STATIC + LOCAL_TEST; yayın NOT_AUTHORIZED / EXTERNAL_NOT_RUN.** Amaç güncel main ile iki dosyalık patch’i uzlaştırmak, izole yayın adayını doğrulamak ve mevcut M için onaylanabilir Git/yayın/kabul paketi hazırlamaktır. Kök checkout’ta yalnız bu kabul kaydı; `tmp/video-public-testnet-m-publication-verification-release-preflight-20260910/` içinde aday/kanıt dosyaları değiştirildi. Kök kaynak/test/config/workflow dosyaları ve kullanıcı değişiklikleri korunur. Git yayını/commit/PR/merge, CI rerun, deploy, provider/NEAR/D1 mutasyonu ve yeni ödeme/medya işlemi yapılmaz.

### Hazır aday ve kontroller

- GitHub’dan güncel main **`9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`** doğrulandı. Ayrı clone `candidate/` bu commit’te detached olarak hazırlandı; eski dirty root yayın adayı değildir. Korumalı source patch önce `git apply --check` ile doğrulandı, sonra yalnız izole adayda uygulandı.
- Adayda değişen yollar yalnız `workers/livepeer-bridge/src/provider-verification.ts` ve `workers/livepeer-bridge/src/provider-verification.test.ts`: **41 eklenen / 1 silinen satır** (yorum/testler dahil). Dosya hash’leri kaynak gate’iyle aynı: **8f6b7f2b7bc039edb5be1373534f29d3576eb594f3675bd9cd25c21fbc5cb607** ve **79b0559f14e1c187e234c5e8fce56dcc04af67024b6f669cbc9c3091e90b580e**. Patch SHA-256 **e5f99e78159da39cc718ff5e33df0ea1d687de01b309bb9c24b78555456161bd**.
- Adayın kendi kilitli Bridge bağımlılıkları `npm ci --no-audit --no-fund --prefer-offline` ile kuruldu. Node 24 hedefi korundu. Exact main bağlamındaki `npm test -- --run src/provider-verification.test.ts src/finalize.test.ts src/index.test.ts`: **261/261 PASS**; `npm run check`: **PASS**. Önceki 253 sayısı eski checkout bağlamına aittir; ayrı adayda test tekrarının nedeni değişen main bağlamıdır.
- `npx wrangler deploy --dry-run --outdir ...`: **PASS**, 826,78 KiB / gzip 170,83 KiB; paket içinde 64 sabiti doğrulandı. Bu yerel/default kapalı config derlemesidir; gerçek acceptance artifact/provenance veya canlı Worker kanıtı değildir. `docs/testing.md` komutları kullanıldı.
- GitHub’dan okunan base config, adayın mevcut `release-metadata.mjs config --environment public-testnet --mode acceptance` aracıyla normalleştirildi. Önceki yayın artifact’iyle byte/hash aynı: **9a9711d7a3c64cd1befdc71576ba1d02d266b45748f41ceecd296db8d4bd99ed**. Config/bütçe/feature flag değiştirilmedi.
- `public-testnet` environment: required reviewer **4rmus**, protected branches. Public deploy anahtarı **false**; bu upload kapalı demek değildir. Önceki main CI **34507547060** ve public yayın **34509663409** SUCCESS; yeni patch için CI/deploy kanıtı değildir.
- Cloudflare yönetilen durumunda üç servis %100 önceki sürümde: Web **d6703271-5a81-47ff-acac-b14a4b57b12c**, Bridge **04e6808a-99b6-4ee1-9b19-393fb17a44c9**, read-model **1711c568-2a66-49c3-8ed0-602dc26abe75**. Kayıtlar mevcut receipt ile eşleşti. Bu tur mevcut Web bundle tekrar indirilmedi; kaynak gate’i değil yayın sonrası kabulde yeniden karşılaştırılacak.

### Mevcut M için taze durum ve risk

20:49:57 UTC / final blok **267997792**: J **lp-b378185e-eb55-4a31-833d-899acc073def**, creator soteri.testnet, generation 1, fee 0,60 test USDC; **Authorized / publication null**, global publication **5**. Kaynak 269.467.407 bayt; deadline **1789157591343 = 11 Eylül 23:13:11.343 Türkiye** ve henüz dolmamış. Provider 20:53:58 UTC: aynı asset **14d90fad-bf62-4559-ab98-fc0b51173052**, playback **14d9jq6gadklup2e**, ready/JWT/600.025521 sn. Yeni job veya asset oluşturulmadı. Soteri bakiyesi 32,70 test USDC / 5,271771941490250497999995 test NEAR; önceki son kayda göre yeni debit yok.

Public governance frozen/paused=false, admission OPEN, aktif rezerv **0**. M’nin eski kısa admission rezervi sona ermiş; 24 saatlik ödenmiş iş süresi sona ermemiştir. Kaynak incelemesinde eksik rezerv, `markAdmission` içindeki READY_VERIFIED/FINALIZE_QUEUED işaretlemesinde **admission_denied** üretebilir. Job/alarm akışı önce kaydedilmiş publication üzerinden daha sonra ilerleyebilir; **bu durumda uçtan uca otomatik toparlanma canlıda kanıtlanmış değildir**. Rezervi elle açma, kota/bütçe değiştirme veya yeni ödeme pakete eklenmez. Bu hata doğrulanırsa mevcut iş korunup durulur; otomatik başarı vaat edilmez.

### Onaya sunulan tek sonraki gate

**`VIDEO_PUBLIC_TESTNET_M_PUBLICATION_VERIFICATION_RELEASE`** için tam paket `action-package.json`, kısa inceleme `report.md`, PR açıklaması `pr-body.md` içindedir:

1. `4rmus/youtick`, önerilen `fix/m-vtt-verification-64-20260910` branch’i: yalnız yukarıdaki iki dosyanın tek commit/push/PR’si. Normal zorunlu CI/review geçince normal squash merge. Yerel uzun kabul kaydı/diğer dirty dosyalar bu Git paketine dahil değildir. Force push/admin bypass/manual CI rerun yok. Main değişirse iki dosyalık fark ve yeni taban yeniden uzlaştırılır; onay kapsamı sessizce büyütülmez.
2. Merge sonrası **gerçek yeni SHA** ve **aynı SHA’nın başarılı normal main push CI run ID’si** kaydedilir. `deploy-public-testnet.yml`, ref=main, `mode=acceptance`, `confirmation=DEPLOY_PUBLIC_TESTNET_acceptance` ile **en fazla bir** korumalı dispatch. `sha`/`ci_run_id` bugünkü eski koşudan alınmaz; henüz oluşmadıkları için pakette çözülmesi gereken alanlardır, placeholder ile dispatch yasaktır. Normal environment reviewer onayı ve yalnız public deploy anahtarının false→true→false döngüsü kapsama dahildir.
3. Mevcut workflow **read-model → Bridge → Web** trafik geçişi yapar; yalnız Bridge dosyası değişse de üç servis kapsam içindedir. Config hash’i değişmez; yeni secret/anahtar/Market deploy/migration/consumer işlemi yok. Yeni artifact/provenance/source/CI/config, üç managed sürüm/%100 trafik, health ve Web bundle eşleşmesi doğrulanır. Kök site ve eski Preview korunur. Başarısız yayında mevcut korumalı workflow’un geri dönüş kuralları kullanılır; önceki üç sürüm `managed-versions.json` içindedir. Kör rerun/ikinci dispatch yok.
4. Aynı ödenmiş M’de mevcut worker alarmı/provider doğrulaması/operatorün **tek yayınına** ve normal read-model güncellemesine devam etmesi açık kapsamdır. Bunlar deploy sonrasında otomatik oluşabilecek canlı yan etkilerdir. Elle finalize/reconcile/webhook gönderimi veya admission değişikliği yok. Public ortam açık olduğundan yeni doğrulayıcı diğer uygun public işleri de etkileyebilir; test ölçümü M ile sınırlıdır, gizli allowlist eklenmez.
5. Yayın eşleşmesinden sonra en çok **15 dakika** M yayını gözlenir. Published/ACTIVE ve aynı asset/byte/generation/deadline → normal Discover→Watch → mevcut soteri cihazıyla gerçek M süre/son/ses-görüntü kontrolü; toplam en çok **30 dakika aktif kabul / 20 izleyici-dakika**. Yeni ödeme, upload, asset, bilet, cüzdan imzası veya upload-key yenilemesi **0**. Gerekirse durulur; önceki tek yenileme izni ikinci bir yenileme değildir.
6. Ek M operator işlemleri dahil toplam ağ debit’i, önceki **0,001333051758965200000001** dahil **0,10 test NEAR** operasyonel sınırında tutulur. Yeni **5 USD ek provider kullanım gözlem eşiği** onaya dahildir; bu kesin fatura tavanı/minimum abonelik dahil toplam fatura garantisi değildir. Güncel kullanım başlangıcı ve işlem bazlı ücretler canlı adımdan önce/sonra okunur. Asset korunur; devam eden saklama maliyeti ayrıca kalır. Public upload açık bırakılır; otomatik drain/freeze/delete yok.

Durma koşulları: kaynak/config/CI/artifact/sürüm farkı; zorunlu kontrol başarısızlığı; deadline dolması; beklenmeyen job/asset/fee/generation değişimi; yeni ödeme/key/imza ihtiyacı; 15 dakikada publication yokluğu; doğrulama/latency/subrequest/admission hatası; 30 dakika/20 izleyici-dakika/0,10 test NEAR/5 USD gözlem sınırı. Sonuç belirsizse önce aynı job/işlem/bakiye uzlaştırılır. Yeni ödeme veya kaynak sınırını körlemesine artırma yok. 64 sınırının canlı gecikmesi, eski TUS hash/offset boşluğu, authenticated yanlış-hesap resume ve 120 dakika kabulü bu preflight ile kapanmaz.

### Gate sonucu

Hazırlık **COMPLETED_WITH_WARNINGS**: aday ve paket hazır; eksik olan bu yeni Git/yayın/canlı kabul kapsamının açık onayıdır. Mevcut kısa rezervin bitişi canlı toparlanma uyarısıdır; terminal sonuç üretmez ve yeni ücret talebi değildir. Kaynak gate’indeki M ödeme/onayları Git veya deploy yetkisi sayılmadı.

Kök checkout’ta yalnız bu belge değişti; diğer **274 dosya**, HEAD/index/status ve kaynak gate’inin iki dosyası korundu. Aday yalnız iki dosyalık diff taşıyor; diff/boşluk ve paket hash kontrolleri geçti. Yeni commit/push/PR/merge, CI rerun/deploy, cüzdan/ödeme/upload, provider/config/NEAR/D1 yazımı **EXTERNAL_NOT_RUN**. Eski altı yerel belge build bağlantı hatası kapsam dışı; bütün belge build’i tekrar çalıştırılmadı.

Kanıt dizini: `tmp/video-public-testnet-m-publication-verification-release-preflight-20260910/`; `candidate.patch`, `action-package.json`, `tests.log`, `typecheck.log`, `dry-run.log`, `config-parity.json`, `environment.json`, `managed-versions.json`, `live-preflight.json`, `provider-preflight.json`, `receipt.json`. Yerel kontroller `LOCAL_STATIC/LOCAL_TEST`; okunan eski CI `CI`; gerçek runtime/chain `PREVIEW`; provider metadata `PROVIDER`. Yeni yayın ve gerçek M kabulü henüz kanıt değildir.

**Tek sonraki gate: `VIDEO_PUBLIC_TESTNET_M_PUBLICATION_VERIFICATION_RELEASE` — yukarıdaki somut paket onayı.** Otomatik başlatılmadı.


## 23. VIDEO_PUBLIC_TESTNET_M_PUBLICATION_VERIFICATION_RELEASE — 11 Eylül 2026

**BLOCKED / CODE_SCANNING_UNAVAILABLE; PR açık, merge/deploy yapılmadı.** Kullanıcı, ayrıntılı §22 onay sorusuna bu release gate’ini seçerek ve kesinti sonrasında “Devam et” diyerek kapsamı yürütmemizi istedi. Aynı iki dosyalık Git/normal merge, tek korumalı acceptance yayını ve mevcut M’nin yeni ödeme/upload olmadan kontrolü yetkisi kaydedildi. Bu yetki repo görünürlüğü, sahiplik/lisans, güvenlik ayarı veya CI rerun kapsamını içermez.

### Tamamlanan yetkili Git işlemleri

- Aday/main ve source hash’leri yeniden eşleştirildi; main hâlâ `9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`. Kesinti öncesinde commit/push/dispatch oluşmadığı okunarak doğrulandı; işlem tekrarı yok.
- Branch `fix/m-vtt-verification-64-20260910`; tek commit **`72f6205ccda814955b38044251558ddaa52b5201`**. Yalnız `provider-verification.ts` ve testi explicit-path stage edildi; 41 eklenen / 1 silinen satır.
- Normal push ve [PR #195](https://github.com/4rmus/youtick/pull/195) oluşturuldu. Kullanıcı dirty checkout’u, index’i ve kaynak gate’i dosyaları korunur; root commit/branch değiştirilmedi.
- Main’in klasik branch-protection endpoint’i 404 döndü; bu koruma yok demek değildi. Etkin ruleset **main-pr-ci / 20573948**, normal PR ve strict **CI Gate** şartını, silme/force-push korumalarını içeriyor. Gerekli approval sayısı 0; yönetici bypass kullanılmadı.

### Kesin CI sonucu ve somut engel

[PR CI 34569710921](https://github.com/4rmus/youtick/actions/runs/34569710921), exact head **72f6205**, attempt **1**, normal PR olayı: **FAILURE**.

| İş | Terminal sonuç |
| --- | --- |
| Livepeer Bridge | SUCCESS |
| Runtime Dependency Audit | SUCCESS |
| Production WASM Dependency Audit | SUCCESS |
| CodeQL JavaScript/TypeScript | FAILURE — Analyze, code scanning enabled değil |
| CodeQL Rust | FAILURE — Analyze, aynı özellik/erişim hatası |
| CI Gate | FAILURE — CodeQL gerekli sonucu başarısız |
| Değişmeyen Web/contract/protocol/docs | Normal path seçimiyle SKIPPED; yeni başarı kanıtı değil |

GitHub’ın asıl yanıtı: **“Code scanning is not enabled for this repository. Please enable code scanning in the repository settings.”** PR code-scanning alerts API’si de 403 ve aynı mesajı döndürdü. İşler `configuration error` olarak kapandı; bu iki dosyada bulunmuş bir güvenlik açığı raporu değildir. Bir ara durum güncellemesinde JS CodeQL geçmiş gibi görünmüştü; terminal sonuç okunduğunda iki dilin de başarısız olduğu açıkça düzeltildi. Kapanışta yalnız terminal sonuç geçerlidir.

Taze repo metadata: `4rmus/youtick`, **visibility=private, owner_type=User**, mevcut API oturumunda admin yetkisi var; `security_and_analysis=null` (tek başına bir false alanı gibi yorumlanmaz). Workflow ve çağıran reusable job’da **security-events: write** zaten var. Aynı repo branch’inden PR, fork değil. Repo görünürlüğünün kim tarafından/ne zaman değiştirildiği bu gate’te araştırılmadı veya varsayılmadı.

[GitHub Code Scanning destek koşulları](https://docs.github.com/en/code-security/concepts/code-scanning/code-scanning) public depoları ve GitHub Code Security etkin Team/Enterprise organizasyon depolarını kapsıyor. [Private repo etkinleştirme açıklaması](https://docs.github.com/en/code-security/reference/code-scanning/troubleshoot-analysis-errors/private-repository-enablement), Free/Pro için public kullanım ve private/internal için uygun Team/Enterprise + Code Security gereksinimini açıklıyor. Mevcut kişisel/private sahiplik bu destekli yapılandırma değil. Hesabın ücretli planı tahmin edilmedi, ürün satın alınmadı veya repo taşınmadı.

### Korunan yayın ve M durumu

- Main değişmedi; PR **OPEN / MERGEABLE ama mergeStateStatus BLOCKED**. Merge, yeni main CI, deployment dispatch veya environment onayı yapılmadı. Dispatch sayısı **0**, CI rerun **0**.
- Public deploy anahtarı açılmadı; son okuma **false**. Acceptance config hash’i yine **9a9711d7a3c64cd1befdc71576ba1d02d266b45748f41ceecd296db8d4bd99ed**. Public/Preview yönetilen sürümleri yayın öncesi kayıtla aynı; bu gate’te trafik değiştirilmedi.
- 06:11:08 UTC / final blok **268056790** salt-okunur M kaydı: aynı J **lp-b378185e-eb55-4a31-833d-899acc073def**, Authorized / publication null; global yayın 5, admission OPEN / rezerv 0. Fee 0,60, generation 1, 269.467.407 bayt ve deadline **1789157591343 = 11 Eylül 23:13:11.343 Türkiye** korunuyor. Bu son tarih sonraki adımdan önce yeniden kontrol edilir; süresi dolarsa eski yetkiyle yeniden ödeme yapılmaz.
- Soteri 32,70 test USDC, önceki son NEAR bakiyesi aynı; yeni ödeme/upload/key/provider işi yok. Yayın yapılmadığı için M canlı kabulünün 30 dakikalık penceresi başlamadı.
- Yayın öncesi Livepeer Usage UI’si **21,83 işleme / 0 dağıtım / 114,69 saklama dakikası** gösterdi; gecikmeli/toplu sayaçlar M’ye ait kesin fatura değil. Geçici Usage sekmesi kapatıldı; mevcut M iş sekmesi kullanıcıda kaldı. Yeni tarayıcı oynatma başlatılmadı.

### Eksik karar ve devam sınırı

Gerekli karar repo gizlilik/lisans yönüdür. **Private kalacaksa** desteklenen organizasyon/Code Security düzeni için somut sahiplik, plan ve maliyet paketi gerekir; bu bir otomatik repo transferi veya satın alma yetkisi değildir. **Public görünürlük** seçilecekse kaynak ve geçmişin herkese açılacağı açıkça değerlendirilip ayrı yetkilendirilmelidir; varsayılan çözüm olarak uygulanmaz. Workflow’daki CodeQL/CI Gate’i atlamak, kapatmak veya analiz upload hatasını başarı saymak bu paketin çözümü değildir.

Özellik erişimi düzelmeden aynı CI koşusunu tekrarlamak sonuç üretmez. Düzeldikten sonra en küçük işlem **34569710921 / aynı 72f6205 head için bir failed-jobs rerun** kapsamının açıkça onaylanmasıdır; mevcut paket rerun=0 olduğu için otomatik yapılmaz. Yeni commit/boş commit ile CI tetikleme veya bypass yok. Başarılı zorunlu CI sonrasında mevcut M release onayı değişmeyen kapsamında sürer; Git/deploy onayı yeniden istenmez.

**Tek sonraki gate: `VIDEO_PUBLIC_TESTNET_CODE_SCANNING_ACCESS_PREFLIGHT`** — repo gizlilik kararına göre desteklenen güvenlik erişimi ve tek rerun paketini somutlaştırmak. Otomatik başlamadı; mevcut release gate’i bu dış engelde durdu.

Kanıt `tmp/video-public-testnet-m-publication-verification-release-20260911/`: `approved-package.json`, `pr-terminal.json`, `pr-ci-final.json`, `pr-ci-failed.log`, `repo-security.json`, `main-rules.json`, `managed-before.json`, `before-release.json`, `deploy-switch-final.json`, `receipt.json`. `CI` gerçek PR koşusu; `PREVIEW` salt-okunur başlangıç runtime/chain; `PROVIDER` Usage UI; yerel kapsam/hash kontrolleri `LOCAL_STATIC`. Yeni main CI/deploy/M acceptance **EXTERNAL_NOT_RUN / UNPROVEN**. Kök checkout’ta yalnız bu belge değişti, diğer **274 dosya** ve HEAD/index/status korundu; aday commit’i kaynak paketinin iki dosyasıyla eşleşti. Belge diff/boşluk kontrolü geçti; daha önce geçen 261 yerel test veya altı eski kırık-link nedeniyle başarısız belge build’i gerekçesiz tekrarlanmadı.


### Public erişim geri geldi; aynı release gate’i devam ediyor — 11 Eylül

Kullanıcı repoyu public yaptığını belirterek devam istedi. Güncel API’de public görünürlük, `4rmus` required reviewer ve Code Scanning erişimi tekrar doğrulandı. Görünürlük/plan ayarı asistan tarafından değiştirilmedi. Bu yeni talep, değişmeyen **72f6205** head için tek failed-jobs rerun yetkisi olarak kaydedildi; **34569710921 attempt 2 SUCCESS**, iki CodeQL dili ve CI Gate geçti, açık PR scanning bulgusu yok.

[PR #195](https://github.com/4rmus/youtick/pull/195) normal squash merge ile **8facb7f4390d1cede6238244149a158b2de6322f** olarak main’e alındı; merge ağacı onaylı commit ile birebir aynı. Yeni main CI **34586691970** çalışıyor. Main CI başarısı olmadan deployment başlamaz; bu ara kayıt yayın PASS değildir.

Yeni source’un gerçek M üzerinde yalnız GET/HEAD ile çalışan yerel provider doğrulaması **PASS**: **84 istek / 9600 ms**, 66 anonim alt kaynak isteği 401; kaynak boyutu/asset hash/iki kalite ve VTT/thumbnail kontrolleri geçti. 12 anonim/geçersiz JWT HLS isteğinin HTTP 200 yanıtları oynatılamaz hata manifesti olarak doğrulandı; erişim açıldığı iddia edilmez. Bu `PROVIDER` kanıtıdır, yeni Worker runtime veya NEAR yayın sonucu değildir. İstek yazımı engellendi; yeni asset/key/ödeme veya manuel finalize/reconcile yok. Dosyalar `provider-candidate-check.json`, `provider-check-requests.json`.

Mevcut M 09:45 UTC’de Authorized / publication null; aynı hazır asset, kaynak boyutu, fee ve deadline korunuyor. Eski başarısız CI ve private-repo engeli tarihsel kayıt olarak kalır; yeni sonuçları iptal etmez. **Aktif gate hâlâ VIDEO_PUBLIC_TESTNET_M_PUBLICATION_VERIFICATION_RELEASE**; ayrı Code Scanning preflight başlatılmadı.


### Nihai release ve mevcut M kabul sonucu — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_M_PUBLICATION_VERIFICATION_RELEASE: COMPLETED_WITH_WARNINGS / KAPALI. Deployment PASS; mevcut M’nin yayın ve örneklenmiş oynatma kabulü PASS.** Önceki private/Code Scanning kaynaklı BLOCKED kaydı tarihsel olarak korunur. Kullanıcının repoyu public yapıp devam istemesiyle yalnız aynı PR’nin başarısız CI işleri bir kez yeniden çalıştırıldı; başka güvenlik/plan ayarı değiştirilmedi.

#### Git → CI → artifact → serving kanıtı

- Tek kaynak commit **72f6205ccda814955b38044251558ddaa52b5201**, [PR #195](https://github.com/4rmus/youtick/pull/195); normal squash merge **8facb7f4390d1cede6238244149a158b2de6322f**. Merge tree onaylı adayla aynı. Git paketi yalnız doğrulayıcı ve testi; yönetici bypass/force push yok.
- [PR CI 34569710921](https://github.com/4rmus/youtick/actions/runs/34569710921) **attempt 2 SUCCESS**; ilk başarısız attempt silinmedi. [Main CI 34586691970](https://github.com/4rmus/youtick/actions/runs/34586691970) **attempt 1 SUCCESS**; iki CodeQL dili ve CI Gate geçti. Main CI ayrıca çalıştırıldı; PR sonucu main CI diye kullanılmadı.
- [Public Testnet Video 34587885148](https://github.com/4rmus/youtick/actions/runs/34587885148) **tek dispatch / attempt 1 / SUCCESS**. Altı dosyanın provenance’ı exact yeni source/signer workflow ile, iki Web/Bridge SBOM imzası ayrıca doğrulandı. Manifest aynı main CI run/attempt’ini ve kilit dosyalarını gösteriyor. Normal `public-testnet` environment onayı artifact doğrulamasından sonra verildi; onay atlanmadı.
- Acceptance config byte/hash değişmedi: **9a9711d7a3c64cd1befdc71576ba1d02d266b45748f41ceecd296db8d4bd99ed**. Artifact Bridge kodunda 64 sınırı doğrulandı. Public deploy anahtarı false→true→false tamamlandı; bu yüklemelerin kapatıldığı anlamına gelmez.

| Bileşen | Gerçek %100 trafik sürümü |
| --- | --- |
| Web | **4cc38254-fc86-4874-a24c-94195ed8fe5d** |
| Bridge | **5ac21b54-c99c-4056-a454-42d4e42b2448** |
| Read-model | **b53269f1-3213-4363-9ee8-a0f51f74a460** |

Üç managed sürüm receipt ile eşleşti; Bridge/read-model health ve ortam kimlikleri doğru. Watch HTML’sindeki **20/20 gerçek JavaScript dosyası** release artifact’iyle hash olarak eşleşti. Preview managed sürümü **bc36aae2-f285-4f7d-872d-05bc11e12971**, deployment ve sabit başlıklar önce/sonra aynı; yalnız istek bazlı CSP nonce farkı normalize edildi. Kök site önce/sonra fingerprint kontrolü korumalı workflow’da SUCCESS. Bu root/Preview izolasyon kanıtıdır; eski beta tam kullanıcı regresyonu değildir.

#### M’nin gerçek sonucu

- Aynı iş **lp-b378185e-eb55-4a31-833d-899acc073def**, creator **soteri.testnet**, generation **1**. **Published / ACTIVE**; yayın zamanı **11 Eylül 10:17:41.205 UTC**, ilk deadline **11 Eylül 20:13:11.343 UTC / 23:13:11.343 Türkiye**. İlk created_at ve 24 saat değişmedi.
- Aynı asset **14d90fad-bf62-4559-ab98-fc0b51173052**, playback **14d9jq6gadklup2e**. Asset hash **4816f7cf4a44ceb512219c2e40928fdd74023619dd87eddd2d2af36bf8003a84** zincirle eşleşti; expected/verified source **269.467.407 bayt**. Provider fingerprint alanı null; tam kaynak SHA doğrulaması yerine bu alan uydurulmadı.
- Global publication **5→6**, provider asset **19→19**; eklenen/silinen asset **0**. Eski kısa admission rezervi olmamasına rağmen mevcut otomatik worker yolu yayını tamamladı. Elle finalize/reconcile/webhook/admission işlemi gönderilmedi. Daha önce belirtilen rezerv riski bu M sonucu için canlı engel olmadı; iç retry adımları ayrı izlenmedi.
- Brave, normal **Discover kartı → Watch**. Mevcut creator cihazıyla yeni ödeme/cüzdan imzası olmadan oynatıcı açıldı. 720p **1280×720**, duration **600.043 sn**, 0.094→73.859 sn ve yaklaşık 2:00’a ilerleme; gözlenen media error null.
- Oynatıcı duraklatıldı; geçici **240×700** viewport ile Auto düşük çıktıya yönlendirildi, gerçek seek çubuğundan **570.4 sn** seçildi. Gerçek **640×360** video 570.662 sn’den **600.033333 sn** sonuna normal ilerledi; **ended=true, paused=true, error=null**. Bu viewport kaynaklı Auto kalite kanıtıdır; yavaş ağ testi değildir. Baştan sona kesintisiz 10 dakika izlenmedi; başlangıç ve son bölümler örneklendi.
- Her kalitenin bir ilk medya segmenti yetkili GET ile yerelde okundu; ffprobe **H.264 video + AAC 48 kHz mono ses** doğruladı. 360p örnek 1.295.132 bayt, 720p örnek 4.149.912 bayt. Bunlar aynı yeni asset’in medya örnekleridir; fiziksel hoparlör/ekran A/V kalibrasyonu değildir.
- Yakalanan **100** ölçüm olayında ilk token **1680,9 ms**, iki başarılı otomatik yenileme **2020,2 / 1546,2 ms**, wallet_signature/wallet_transaction olayı **0**. Sınırlı kayıt bütün tarayıcı oturumunun eksiksiz sayımı veya p95 değildir. Kapanmış eski playback gate’i tekrar çalıştırılmadı; bu yeni M’nin normal oynatması sırasında oluşan olaylar kaydedildi.
- Geçici viewport reset edildi. Son bölüm için açılan sessizleştirme geri alındı; video son konumda **paused / muted=false**, orijinal ses seviyesi 1. M Watch sekmesi **627255360** kullanıcıya sonuç olarak açık bırakıldı; Usage sekmesi kapandı. İlk M denemesindeki native DevTools sorunu nedeniyle eksik kalan TUS trace bu gate’te sonradan üretilmiş sayılmadı.

#### Bütçe ve kanıt sınırı

Bu release sırasında yeni USDC ödemesi/upload/asset/key replacement/cüzdan imzası **0**. Yalnız mevcut operator yayını: **0,0003748888269619 test NEAR** ek debit. İlk M ödeme ve recovery harcamaları dahil toplam **0,001707940585927100000001 test NEAR**, 0,10 sınırının altında. Creator **32,70 test USDC** ve önceki NEAR bakiyesi aynı; B/relayer bakiyeleri değişmedi. İlk M ücreti toplam **0,60 test USDC** olarak kalıyor.

Serving doğrulaması **10:16:56 UTC**, M yayın zamanı **10:17:41 UTC**; 15 dakikalık gözlem sınırı içinde. Browser/media kontrolleri 30 dakikalık aktif kabul ve 20 izleyici-dakika sınırının altında, örneklenmiş oynatma olarak tamamlandı. Son Usage ekranı yine **21,83 / 0 / 114,69 dakika** gösterdi. Gecikmeli/toplu sayaçlar nedeniyle gerçek ek provider maliyeti **UNPROVEN**; 5 USD kesin fatura kesicisi değildir. Asset saklanıyor, devam eden saklama maliyeti ve 24 saatlik kullanım hesabı bu gate’le kapanmaz.

**Açık kanıtlar:** ilk M kesinti/devamının doğrudan TUS URL hash/HEAD offset kaydı; başka gerçek cüzdan oturumuyla authenticated yanlış-hesap resume; fiziksel A/V kalibrasyonu; kesintisiz tam 10 dakika taraması; Chrome/Edge/yavaş ağ, 120 dakika/5 GB, maliyet/hız/kapasite ve nihai Video V1 kabulü. Önceki API yanlış-hesap/yanlış-boyut retleri korunur ama cüzdan deneyi sayılmaz. Bu nedenle genel Video V1 ve M’nin tüm kabul matrisi uyarısız PASS değildir.

**Koruma:** root checkout’ta yalnız bu kabul kaydı değişti, diğer **274 dosya** ve HEAD/index/status korundu. İzole aday clean ve exact merge SHA’da; yayımlanmış iki kaynak dosyasının hash’leri onaylı paketle aynı. Doc diff/boşluk kontrolü geçti. Kaynak gate’indeki 261 yerel kontrol gereksiz tekrarlanmadı; gerçek PR/main CI ve yayın kontrolleri ayrı kanıtlandı. Korumalı workflow dışında deploy, yeni config/secret/key, Market/D1 migration veya manuel onarım, ödeme/çekim, provider repair/delete ve dış destek talebi yapılmadı. Public ortam açık kaldı.

Kanıt dizini `tmp/video-public-testnet-m-publication-verification-release-20260911/`: `merge-parity.json`, `pr-ci-attempt-2.json`, `main-ci.json`, `acceptance/artifact-verification.json`, `acceptance/receipt/public-testnet-deployment.json`, `acceptance/serving.json`, `published.json`, `publication-check.json`, `browser-acceptance.json`, `media-codecs.json`, `final-checks.json`, `usage-after.json`, `receipt.json`. Kısa redacted log izlemesi sonlandı, ilgili olay yakalamadı; bu loglardan iç otomatik retry ayrıntısı çıkarılmadı.

**Tek sonraki gate: VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE — kalan kanıtların kapanışı.** Bu gate’in başarısız yayın maddesi artık gerçek kanıtla kapanmıştır; eski TUS/ayrı-hesap boşlukları açıkça uzlaştırılmalı. Mevcut Published M’yi yeniden resume etmek veya yeniden ödeme yapmak otomatik sonraki adım değildir; gerekirse ayrı incelenebilir test/onay paketi gerekir. Yeni gate veya izleme otomasyonu başlatılmadı; bu release burada durur.


## 24. VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE — kalan kanıt uzlaştırması

**BLOCKED.** Bu tur amaç mevcut kanıttan kalan iki maddeyi kapatmak veya gereken en küçük yeni koşuyu incelemeye hazır hâle getirmektir. Değiştirilebilir alan yalnız bu belge ve `tmp/video-public-testnet-m-resume-closeout-20260911/` yerel kanıt/ölçüm paketidir. Uygulama, test, workflow/config/secret dosyaları; Git/CI/deploy ve canlı mutasyonlar kapsam dışı. Başarılı M yayını/oynatması ve önceki testler tekrarlanmaz.

### Eski kaydın kapattığı ve kapatamadığı maddeler

| Madde | Karar |
| --- | --- |
| Aynı M dosyası/iş/creator/generation | Önceki gerçek kayıtlarla doğrulandı; yeniden test gerekçesi değil. |
| Aynı asset, tek ödeme, sabit 24 saat | Doğrulandı; release sonunda M Published/ACTIVE. Fazladan ödeme/asset/publication yok. |
| Aynı TUS kaynağı ve offset’ten devam | **UNPROVEN**. `resume-precheck.json`, `checks-resumed.json`, `execution-progress.json` bunu açıkça kaydediyor. İlk sayfadaki ölçüm dizisi sekme kapanmadan dışarı alınmadı; mevcut yerel kanıt paketlerinde gerçek URL-hash/HEAD/PATCH offset kaydı bulunmadı. %16/%25 ilerleme ve aynı asset, bu doğrudan kaydın yerine yazılmaz. |
| Yanlış dosya | S seçildiğinde UI resume vermedi; yanlış boyut API önkontrolü 409. Bu kanıt korunur. |
| Gerçek yanlış-hesap oturumu | **UNPROVEN**. `negative-preflight.json` sadece anonim önkontrol gövdesinde utick2 creator kimliğiyle 409 alındığını gösterir; gerçek B cüzdan oturumu üzerinden A’nın eksik işine devam denemesi değildir. |

Kaynak incelemesi: `prepareLivepeerUploadResume` publication bulunduğunda **livepeer_already_published** ile durur. Bridge READY_VERIFIED’e geçerken TUS endpoint’ini kalıcı iş kaydından çıkarır. Bu güvenlik/yaşam döngüsü davranışı korunur; eski M’yi tekrar resume edebilmek için state/anahtar/asset değiştirilmez. Mevcut Published işte tüm hesapların terminal ret alması da yanlış-hesap yetkilendirme testi değildir. Eski ölçümün yokluğu, yeni kayıt üretilerek tarihsel kanıt gibi sunulamaz.

### Ölçüm kaybını önleyen yerel hazırlık

`console-probe.js`, yalnız test sayfasının mevcut fetch/XHR yolunu gözler. TUS host’u ürün doğrulayıcısındaki **origin.livepeer.com** ile sınırlıdır; upload-intent yanıtından yalnız job/generation/created ve endpoint hash’i alınır. Konsol kaydı **tam URL/JWT/private key içermez**; TUS kayıtları method/status/URL-SHA256/offset/length/body boyutudur. Ağ isteği üretmez, yanıtı değiştirmez, localStorage’a capability yazmaz; stop özgün metotları geri yükler.

`node tmp/video-public-testnet-m-resume-closeout-20260911/probe-check.mjs`: **PASS / LOCAL_TEST**. Sahte transport ile hash/offset/created eşleşmesi, capability/secret sızmaması, XHR başka host için yeniden kullanıldığında yanlış kayıt oluşmaması ve metotların geri yüklenmesi sınandı. Yeni framework/bağımlılık veya ürün/deploy değişikliği yok. Bu test gerçek tarayıcıya kurulum veya gerçek TUS kanıtı değildir; canlı kurulum bu tur yapılmadı.

Yeni koşuda kayıt yalnız sayfa belleğinde bırakılmayacak: `m_resume_probe` konsol olayları browser dev.logs üzerinden okunup **sekme kapanmadan önce** dosyaya alınacak. İlk pozitif offset, hash ve length kaydı kaydedilmeden kesinti yapılmayacak. Yeniden açılan sayfada probe yeniden kurulup ready olayı görülmeden resume/key yenilemesi başlatılmayacak. Native kontrol çalışmazsa ücretli adımda doğaçlama yapılmaz; gerekli kurulum kullanıcıyla tamamlanmadan test başlamaz.

### Onaysız M2 paketi — aynı gate, yeni iş

Tam paket `rerun-package.json` içindedir. Eski M **lp-b378185e-eb55-4a31-833d-899acc073def** ve asset **14d90fad-bf62-4559-ab98-fc0b51173052** korunur.

- Aynı yerel **medium-10m.mp4**, **269.467.407 bayt / 600.025521 sn**, SHA-256 **40fcd876e157e0e1663f5deace4cfcbf10988815f3cb4604d8acd053ac007382**, lastModified **1788801580094** yeniden eşleşti. Başlık **Video V1 kabul — M2 trace — 2026-09-11**, bilet 2 test USDC; satın alma 0. J2 normal UI’de oluşacak ve ödeme öncesi null job/publication/asset başlangıcına bağlanacak; eski J kullanılmaz.
- Creator **soteri.testnet**, yanlış hesap **utick2.testnet**. **Bağımsız iki Brave profili/oturumu**, ikisinde de normal bağlı hesap kimliği ödeme öncesi kanıtlanmalı. Aynı profilin iki sekmesi yeterli değil. A oturumu B’ye çevrilmez, A’nın taslağı/cihaz anahtarı B’ye kopyalanmaz. Agent key import/export yapmaz. İkinci oturum hazır değilse ödeme yok.
- A’da probe ready ve geçici ağ kontrolü hazır olmalı. Güncel main/source/CI/serving ve kota/bakiyeler doğrulanır; bu tur okunan main **8facb7f4390d1cede6238244149a158b2de6322f**. Önceki 6 publication / 19 asset yalnız referanstır; gerçek başlangıç ID setleri ödeme öncesi yenilenir.
- **Tek yeni upload/asset/publication**, en çok **0,60 test USDC**, toplam **0,10 test NEAR**, en çok bir upload-key yenilemesi. **5 USD ek provider kullanım gözlem eşiği**, 30 dakika aktif test / 20 izleyici-dakika. Kesin fatura tavanı değildir; başarılı asset korunacaksa sonraki saklama maliyeti sürebilir. Yeni satın alma/çekim, ikinci ödeme/asset/yenileme yok; public ortam açık kalır.
- Ödeme sonrası ilk intent created=true, HEAD offset=0/length; ardından tamamlanmış PATCH için **0<offset<length** ve URL hash’i dosyaya alınır. Ancak bundan sonra A sekmesi kapatılır. B, hâlâ eksik J2’nin durum bağlantısını kendi bağlı hesabıyla açıp aynı M’yi seçer; ret/no-resume ve B kimliği kaydedilir. Pay düğmesi veya işlem imzası kullanılmaz. Bu UI kanıtı backend imzalı-envelope testi diye adlandırılmaz.
- A yeniden açılır, probe ready doğrulanır, yanlış S reddi korunur; doğru M’de en çok tek key renewal. **created=false**, aynı TUS hash, HEAD offset≥kayıtlı offset ve <length, kalan PATCH’ler ve son offset=length ayrı kaydedilir. Aynı J2/generation/ilk created_at+24 saat; tek ödeme/asset/publication ve yeni asset sağlığı kapanışta uzlaştırılır. Yeni asset’in sağlığı eski M’nin sonucundan varsayılmaz.
- Probe/pozitif offset kaydı yoksa, aktarım kesilmeden bitmişse, ikinci hesap yolu ödeme/veri kopyalama gerektiriyorsa, kimlik/hash/sürüm/deadline değişiyorsa veya bütçe/kota yetersizse dur. TUS sonrası 5 dakikada durum kaydı; 15 dakikada yayın yoksa dur. Kör retry veya otomatik ikinci koşu yok.

**Bu tur yeni ödeme/yükleme/imza yetkisi 0.** Eski onay tek M yüklemesi ve tek key yenilemesi için kullanıldı; M2’ye genişletilemez. Yeni koşu onayı ve iki profil/ölçüm hazırlığı olmadan uygulanmaz. Yerel dosyalar dışında canlı işlem, Git/CI/deploy veya tamamlanmış playback tekrarı yapılmadı. 120 dakika, maliyet/hız ve sonraki Video V1 gate’lerine geçilmedi.

**Tek devam gate’i VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE** — yalnız yeni M2 paketi açıkça onaylanıp ödeme öncesi hazırlık geçerse canlı eksik kanıtları toplamak. Bu BLOCKED sonucu geçmiş yayını geri almaz; mevcut M Published/ACTIVE kalır. Kontrol ve koruma kanıtı `receipt.json` içinde; aynı eksik kayıtlar değişmeden tekrar tekrar taranmayacak.


### M2 onayı alındı — ödeme öncesi oturum/ölçüm hazırlığında bekleniyor

Kullanıcı M2 paketini **“onaylıyorum”** diyerek onayladı. Aynı gate, tek yeni M2 yüklemesi/asset’i, 0,60 test USDC / 0,10 test NEAR / 5 USD kullanım gözlem eşiği, en çok tek key replacement ve 30 dakika/20 izleyici-dakika sınırları geçerlidir. Bu onay tekrar istenmez; eski paket içindeki authorized=0 alanları tarihsel hazırlıktır. Uygulanacak onay kaydı `tmp/video-public-testnet-m2-resume-run-20260911/approved-package.json` içindedir.

**BLOCKED / BROWSER_READINESS.** Ücretli koşu başlamadı:

- Araçlara bağlı browser envanterinde yalnız **Brave / İş** profili görünür. Bu, bilgisayarda başka profil hiç olmadığı iddiası değildir; `utick2.testnet` ile bağlı bağımsız oturum henüz doğrulanmadı. Kullanıcıdan ikinci oturumu mevcut soteri oturumunu değiştirmeden hazırlaması istendi.
- Yeni **627255363** sekmesi `https://public-testnet.youtick.net/upload` üzerinde açıldı; **soteri.testnet** bağlı. Eski M Publication ready olarak göründü. Dosya seçilmedi, ödeme seçenekleri çağrılmadı, yeni J2 oluşturulmadı.
- Yerel Brave AX okuması çalıştı; ancak browser tabına yapılan içerik tıklaması yerel foreground sekmesini değiştirmedi. Geliştirici kısayolundan sonra farklı kullanıcı sekmesinde DevTools görüldü; **hiçbir ölçüm kodu oraya yapıştırılmadı**. Sonraki okumada o DevTools görünmedi.
- M2 grubuna yerel geçiş denemeleri, taze AX okumasıyla aynı çağrı içinde yapılan deneme dahil, aracın **kullanıcı pencereyi değiştirdi** uyarısıyla durdu. Bu bir ürün veya TUS arızası sayılmadı; farklı otomasyon teknolojisine, tarayıcıya veya güvenlik aşımına geçilmedi. Kullanıcıdan M2 sekmesini öne getirip Console’u açması istendi.
- `console-probe.js` hash’i onaylı paketle eşleşti ve yeni kanıt klasörüne kopyalandı. Canlı sayfaya kurulmadı; dolayısıyla `ready` konsol olayının browser dev.logs ile yakalandığı henüz kanıtlanmadı. Yerel self-check geçmişi korunur; bu eksik canlı hazırlık yerine sayılmaz.

**Gerekli kullanıcı hazırlığı:** (1) M2 devam testi grubundaki soteri sayfası önde ve Console açık; (2) utick2 ayrı Brave profilinde normal bağlı hesap olarak hazır. Araç bağı kurulmamış ikinci profil varsa bu oturum da araçlarda görünür olmalı. Şifre/anahtar sohbete istenmez; agent key import/export yapmaz. İki şart geçmeden ödeme yapılmaz. Sonra güncel sürüm/kota/bakiye ve gerçek J2 başlangıç sayımları ödeme anında okunur.

Yeni ödeme, upload, asset, key replacement, cüzdan imzası, CI/Git/deploy ve provider/NEAR/D1 yazımı **0 / EXTERNAL_NOT_RUN**. Mevcut yayımlanmış M ve kullanıcı cihaz oturumları değiştirilmedi. Kök checkout’ta yalnız bu kabul kaydı; yerelde onay/baseline/probe kopyası/receipt eklendi. Diğer **274 dosya**, HEAD/index/status ve diff/boşluk kontrolü korundu. M2 hazırlık sekmesi devam için açık bırakıldı.

**Tek devam gate’i VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE.** Yeni onay değil, iki oturum ve ölçüm erişimi bekleniyor. Aynı başarısız yerel kontrol döngüsü tekrarlanmayacak; kullanıcı hazırlığı değişince devam edilecek.


M2 bağlantı kontrolü: kullanıcı “bağladım” dedi. Taze envanterde **627255363 / soteri.testnet** ve yeni **627255369 / utick2.testnet** görüldü; ikisi de aynı **Brave ID 1 / İş** profilinde. B bağlantısı artık doğrulandı, fakat bağımsız oturum koşulu geçmedi. İki farklı sekmede iki hesap etiketi görülmesi bağımsız tarayıcı deposu kanıtı değildir. Soteri sekmesi reload/Disconnect yapılmadan korundu; ölçüm kurulmadı, yeni ödeme/upload/J2 oluşturulmadı. Onay geçerli; aynı gate yalnız gerçek ikinci profil ve Console hazırlığını bekliyor. Kanıt `tmp/video-public-testnet-m2-resume-run-20260911/account-connection-check.json`.


### M2 bağımsız profil ve gözlemci doğrulandı — denetim bağlantısında bekleniyor

Kullanıcının “önerdiğin gibi yaptım” mesajından sonra yerel Brave **Profiller** menüsünde **İş** ve **test** ayrı profilleri görüldü. **test / utick2.testnet** ve **İş / soteri.testnet** sayfa kimlikleri ayrı pencerelerde doğrulandı. İkinci profilin tarayıcı uzantısı envanterinde bulunmaması bu kanıtı engellemedi; B için yerel arayüz erişimi yeterlidir. Önceki bağımsız profil engeli kapanmıştır.

M2 A sekmesinin doğru Console hedefinde onaylı gözlemci kuruldu. Browser `dev.logs` ile **m_resume_probe / ready / 1789126162221** kaydı alındı; **Fast 4G** Network panelinde seçili doğrulandı. Dosya ve probe SHA-256 değerleri onaylı paketle aynı. Güncel GitHub main **8facb7f4390d1cede6238244149a158b2de6322f**, CI **34586691970** ve deploy **34587885148** success; Bridge/read-model sürümleri release ile aynı. **2026-09-11 11:28 UTC** final chain okumasında eski M Published/ACTIVE, publication sayısı 6, soteri 32,70 test USDC, admission OPEN; yeni ödeme/yükleme yok.

Yerel seçicide tam M yolu seçildiğinde aynı dosyanın eski tamamlanmış J1 taslağı geri yüklendi ve Publication ready gösterildi. Kaynakta yayın tamamlanma etkisi taslağı temizliyor; yeni forma geçmek için kontrollü yenileme gerekir. Yeni J2 üretilmedi, ödeme seçenekleri/Pay/resume çağrılmadı. Yenileme öncesinde yerel pencere odağı değişti; ardından sekme denetim bağlantısı **Debugger unattached** döndürdü. Yenilemenin gerçekleştiği doğrulanmadı. Bu durum ürün/TUS hatası veya yanlış-hesap kabul kanıtı sayılmaz.

**BLOCKED / BROWSER_CONTROL.** M2 onayı geçerlidir. A sekmesi **627255363** devam için korundu. Sonraki adım aynı gate içinde denetim erişimini sağlamak, formu yenileyip gözlemciyi tekrar doğrulamak ve henüz yapılmamış tam ID/envanter başlangıcı ile J2-null kontrolünden sonra onaylı koşuya devam etmektir. Yeni ödeme/upload/asset/imza/deploy 0; eski yayın korunur. Kanıtlar `tmp/video-public-testnet-m2-resume-run-20260911/independent-profile-readiness.json` ve `before-m2.json` içindedir.


### M2 gerçek kesinti kanıtı alındı — yanlış hesap ve devam adımları bekliyor

Kullanıcının “diğer ekranda önde” mesajından sonra sekme denetimi geri geldi. Tamamlanmış eski M taslağı normal sayfa yenilemesiyle temizlendi; yeni sayfada güvenli probe **ready=1789126601507** yakalandı. **Fast 4G** seçimi ve yerel M dosyasının **269467407 bayt / lastModified 1788801580094** bilgisi doğrulandı. Yeni forma M2 başlığı ve 2 USDC bilet bedeli girildi. Ödeme öncesi Web’in 18 JS dosyası release artifact ile eşleşti; Bridge/read-model aynı sürüm, CI/deploy başarılı. Tam provider asset listesi **19**, publication listesi **6**; provider/publication kimliklerinden türetilen 18 job kimliği mevcut kontratta okundu. Kontrat global media-job listeleme view’i sağlamaz; bu son sayı tüm geçmiş işler sayısı diye sunulmaz. Livepeer resmi salt-okunur usage API’si Eylül toplamında transcoding **21.829703133333332**, delivery **0**, storage **114.58966307408262** dakika döndürdü; kesin fatura tutarı değildir.

**Yeni ve tek J2: lp-491fb8eb-451f-4fc6-918e-b94d6876fc02.** Ödeme öncesi job/publication null ve asset yoktu. UI temel ücret **0,50** + gas sponsor **0,10** = **0,60 test USDC** gösterdi. Önceden verilmiş M2 onayı kapsamında tek cüzdan isteği açıldı; imza ekranı kapandı ve UI aktarıma geçti. Agent cüzdan imza düğmesine basmadı. Final chain okumasında J2 Authorized, generation 1, source bytes 269467407, fee **600000** doğrulandı. Soteri **32,70 → 32,10 test USDC**, creator NEAR değişmedi; relayer debit **1049629952583600000001 yoctoNEAR**. Tek yeni provider asset **b9bfb314-cd2f-47a2-8d16-a1689287e291**, playback **b9bfi30nn2sxq14c**, aynı proje; toplam asset **20**. J1 korunur.

Doğrudan browser konsol kayıtları:

- **1789126888948** intent HTTP 201, created=true, aynı J2/generation 1.
- **1789126889964** TUS HEAD HTTP 200, offset **0**, length **269467407**.
- **1789127091434** tamamlanmış TUS PATCH HTTP 204, body_bytes ve offset **33554432**.
- Her iki TUS yanıtında ve intent’te aynı URL SHA-256: **ae549bb4be3d36b2d7095c61ed8b805780591d7c88799eb1f4bf1fb8e75dacbc**. Tam TUS URL veya token kanıt dosyasına alınmadı.

Bu kayıtlar **tus-before-interruption.json** dosyasına yazılıp **0 < 33554432 < 269467407** doğrulandıktan sonra A’nın **627255363** sekmesi kapatıldı; tab listesi boş dönerek kapanış doğrulandı. Yüzdeye dayalı varsayım kullanılmadı. **627255386** yeni A sekmesi aynı J2 durum bağlantısıyla açıldı; burada henüz file/resume/key replacement çalıştırılmadı ve gözlemci yeniden kurulmadı.

Kesinti sonrası final chain snapshot’ında **created_at 1789126883510**, başlangıç key expiry **1789213265424**, status Authorized, fee/generation/bakiyeler aynı; publication null/sayı 6, admission OPEN. Başlangıç created_at+24h değeri **1789213283510** ayrıca kaydedildi; key expiry ile aynı sayı olduğu varsayılmadı.

**BLOCKED / BROWSER_CONTROL — kısmi canlı kanıt korunuyor.** Sekme kapatıldıktan sonra yerel Brave AX/screenshot yalnız “YouTick” pencere başlığı ve boş içerik döndürdü. B’nin ayrı **test / utick2.testnet** oturumu önceki turda doğrulanmış olsa da bu J2 için yanlış hesap reddi henüz çalışmadı. Kullanıcıdan test profili penceresini öne getirmesi istendi. Yeni A sekmesi devam için korundu; ikinci ödeme/upload/asset, key replacement, repo kaynak değişikliği, Git/CI/deploy veya sonraki gate yok.

**Tek devam gate’i VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE:** B UI reddi; ardından A’da yeni probe-ready, yanlış S kontrolü, aynı M ile en çok bir key yenilemesi ve aynı TUS hash / HEAD offset≥33554432 / son offset=269467407 kanıtı; son olarak yayın/bütçe uzlaştırması. Geçen süre ve onaylı 30 dakika aktif çalışma sınırı yeniden değerlendirilmeden kör devam edilmez. Kayıtlı konum ve ödenmiş J2 korunur; yeni ödeme başlatılmaz.


### M2 yanlış hesap / yanlış dosya kontrolleri geçti — Meteor kilidi bekleniyor

Kullanıcının “tıkladım” mesajından sonra **test** profilinde **utick2.testnet** sayfası kontrol edildi. Aynı J2 durum bağlantısı açıldı ve tam M dosyası yerel seçiciyle seçildi. UI **“This upload could not be verified for this account. No new payment or upload has been started.”** gösterdi; resume yok ve Check payment options disabled. B’de ödeme/işlem imzası çalıştırılmadı. **wrong-account-ui.json: PASS**, gerçek bağımsız profil UI kanıtıdır; imzalı backend-envelope testi iddiası değildir.

A’nın yeni **627255386** sekmesinde soteri bağlantısı korundu ve onaylı probe tekrar kuruldu; **ready 1789127600100** dev.logs ile alındı. Yanlış **small-60s.mp4** seçimi resume sunmadı / ödeme seçenekleri disabled kaldı. Doğru **medium-10m.mp4** seçimi aynı **lp-491fb8eb-451f-4fc6-918e-b94d6876fc02**, M2 başlığı ve **Resume / check existing upload** düğmesini geri getirdi. **resume-readiness.json** kaydedildi. Native Network panelinde geçici **Fast 4G → No throttling** değişimi doğrulandı.

A’da aynı iş için Resume / check existing upload bir kez tıklandı. **Meteor 627255387 / soteri.testnet** kilit ekranında; kullanıcıdan şifreyi sohbete yazmadan kilidi açması istendi. Onaylı tek key replacement henüz zincirde gerçekleşmedi; yeni ödeme yok. **11:55:57 UTC before-key-renewal.json** kaydında ilk upload public key / created_at / expiry / generation / fee değişmedi; bakiyeler aynı, publication null, public admission OPEN. Resume intent/HEAD/PATCH henüz oluşmadı.

**BLOCKED / USER_WALLET_UNLOCK.** A ve Meteor sekmeleri devam için korundu. Aynı M2 onayı geçerlidir; yeniden ödeme yapılmaz. Tek devam gate’i **VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE**: mevcut isteğin tamamlanması, aynı hash ve nonzero HEAD ile devam/son offset kaydı, ardından aynı asset/publication ve bütçe kapanışı. Kaynak/Git/CI/deploy değişikliği ve sonraki gate yok; aynı 30 dakika aktif çalışma bütçesi ve mevcut kayıtlı konum korunur.


## 25. M2 devam kabulü tamamlandı — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE: COMPLETED_WITH_WARNINGS. İşlevsel kabul PASS.** Kullanıcının onaylı tek M2 paketi uygulandı. A **Brave / İş / soteri.testnet**, B **Brave / test / utick2.testnet** bağımsız oturumlardır. Yeni cüzdan/profil anahtarı import/export yapılmadı. Dirty kaynak değişiklikleri korunur; yalnız bu kabul belgesi ve yerel kanıt dosyaları güncellendi.

### Aynı kaynak, kesinti ve dönüş

- Dosya **medium-10m.mp4**, **269467407 bayt**, **600.025521 sn**, SHA-256 **40fcd876e157e0e1663f5deace4cfcbf10988815f3cb4604d8acd053ac007382**; aynı lastModified **1788801580094**.
- İş/publication **lp-491fb8eb-451f-4fc6-918e-b94d6876fc02**, generation **1**. TUS URL SHA-256 **ae549bb4be3d36b2d7095c61ed8b805780591d7c88799eb1f4bf1fb8e75dacbc** hem ilk intent/HEAD/PATCH hem dönüş intent/HEAD/PATCH boyunca aynı.
- İlk intent **201 / created=true**, HEAD **200 / offset=0 / length=269467407**. İlk PATCH **204 / offset=33554432** kaydı **sekme kapatılmadan önce diske yazıldı**. Sonra A kapatılıp aynı iş bağlantısıyla yeni sekmede açıldı.
- B’de aynı M seçiliyken **This upload could not be verified for this account. No new payment or upload has been started.** görüldü; resume yok, ödeme seçenekleri disabled. B’de ödeme/imza 0. A’da yanlış S devam açmadı; doğru M aynı J2 ve M2 başlığını geri getirdi. Bu gerçek bağlı UI testidir; signed-envelope ret kanıtı diye sunulmaz.
- Yeni A sekmesinde observer ready doğrulandı ve Fast 4G geçici sınırı **No throttling** olarak kaldırıldı. Tek `replace_upload_key` zincirde doğrulandı. İlk resume intent **503** verdi; job/key/bakiye/provider sayımları uzlaştırıldı. Aynı açık sekmede bir sınırlı yeniden deneme **200 / created=false** verdi; ikinci imza/ödeme/anahtar yenilemesi olmadı.
- Dönüş HEAD **200 / offset=33554432 / length=269467407**. Sekiz tamamlanmış PATCH sırasıyla **67108864, 100663296, 134217728, 167772160, 201326592, 234881024, 268435456, 269467407** konumlarını verdi. Kalan **235912975 bayt** gönderildi; her body_bytes bir sonraki konumu tam olarak açıklar. Final offset dosya boyutuna eşit. Kaydedilmiş gerçek konsol yanıtları üzerinde doğrulama **PASS**; mock/simülasyon değildir.

### Yayın, harcama ve koruma

Asset **b9bfb314-cd2f-47a2-8d16-a1689287e291**, playback **b9bfi30nn2sxq14c**, proje **53baeeda-930d-45be-bda6-a41090e6d25e**. Provider **ready**, JWT policy, aynı source bytes ve süre doğrulandı. NEAR otomatik olarak **Published / ACTIVE** oldu; `asset_id_hash` **87d3e0fb0096ac92ce051b04d69fde378428fd24f3dec509c071c52835a3b6f0** gerçek asset ID hash’iyle eşleşti. Manuel finalize/reconcile/yeniden yükleme yapılmadı.

- created_at **1789126883510**; mutlak yayın son tarihi **1789213283510 = ilk created_at + 86400000 ms** değişmedi. İlk imza quote kaynaklı key expiry **1789213265424** iken tek replacement expiry’yi zaten var olan mutlak son tarihe bağladı; yeni 24 saat başlatmadı.
- İlk HEAD **11:41:29.965 UTC**, kesinti PATCH **11:44:51.435**, başarılı dönüş HEAD **12:00:04.559**, final PATCH **12:05:22.093**. Provider ready **12:08:30.559**, on-chain publication **12:08:43.185**. Bunlar tek koşunun süreleridir; genel hız/p95 kabulü değildir.
- Tam asset ID seti **19→20**, publication ID seti **6→7**; farklar yalnız J2/asset’idir. Tek ücret **0,60 test USDC**: soteri **32,70→32,10**. Toplam dört aktör NEAR debit **0.001708139347119000000001**, onaylı **0,10** sınırının altında. B bakiyesi değişmedi. Tek key replacement dışında ek imza/ödeme yok.
- Eski M1 publication nesnesi önce/sonra birebir aynı, Published/ACTIVE kaldı. Public admission **OPEN**, aktif reservation boş; public yüklemeler kapatılmadı. Kaynak SHA **8facb7f4390d1cede6238244149a158b2de6322f**, CI/deploy ve serving kanıtları ödeme öncesi uzlaştırıldı; bu gate’te yeni Git/CI/deploy işlemi yok.
- Yeni M2, soteri erişimiyle **1280×720**, süre **600.043 sn**, `readyState=4`, `error=null` ile **0→61.742202 sn** ilerledi. Oynatma sayfa yenilemesiyle durduruldu; son durumda `paused=true/currentTime=0/error=null`. Bu işlem geçici gözlemciyi de kaldırdı. **627255386** yayın sekmesi durmuş halde sonuç olarak korundu. Kontrol en çok dört izleyici-dakika ile sınırlı; tüm 10 dakika veya kalibre fiziksel A/V kabulü iddia edilmez.

### Korunan uyarılar ve duruş

1. İlk dönüş isteğinin 503 kök nedeni kesinleşmedi. Hata kaydı silinmedi. Bağımsız chain/provider/anahtar uzlaştırmasından sonra tek kontrollü tekrar başarılı oldu; başarılı tekrarın server trace’i ve browser yanıtları ayrı dosyalarda.
2. Livepeer Eylül kullanım API’si önce/sonra **21.829703133333332 transcoding / 0 delivery / 114.58966307408262 storage dakika** döndürdü. Güncellenmeyen sayaç **sıfır ek maliyet** sayılmaz. Gerçek ek fatura ve 5 USD gözlem eşiğinin kesin fatura karşılığı **UNPROVEN**; maliyet/hız gate’i kapanmış değildir. [Güncel resmi fiyatlar](https://livepeer.studio/pricing) yalnız sonraki maliyet hesabına referanstır; minimum harcama ve fatura koşullarıyla gerçek kullanım karıştırılmaz.
3. İlk intent’ten durmuş oynatıcı son kontrolüne konservatif duvar saati üst sınırı **30 dakika 17 saniye**; bunun içinde kullanıcı pencere/kilit beklemeleri vardır. Ayrı aktif çalışma kronometresi kaydedilmedi. Kesin **≤30 dakika duvar saati** iddiası yok; bu ölçüm sınırı uyarı olarak tutulur. Canlı işlem ve oynatma sonlandırıldı.

Kanıt paketi **tmp/video-public-testnet-m2-resume-run-20260911/**: **receipt.json**, **tus-before-interruption.json**, **tus-resume.json**, **tus-acceptance.json**, **wrong-account-ui.json**, **resume-readiness.json**, **resume-error-reconciliation.json**, **server-events.json**, **inventory-before.json / inventory-final.json**, **final-state.json**, **playback-health.json**, **usage-reconciliation.json**. TUS URL/JWT/private key kaydedilmedi. LOCAL_STATIC doğrulama; CI/release referansları; gerçek public-testnet browser/chain ve PROVIDER sonuçları ayrı tutulur.

Uygulama testleri veya mevcut altı ilgisiz kırık bağlantı nedeniyle bilinen docs build’i tekrar çalıştırılmadı; kaynak değişikliği yok. Explicit-path diff/boşluk ve 274 korunan dosya/HEAD/status kontrolleri geçti. **Tek önerilen sonraki gate: VIDEO_PUBLIC_TESTNET_COST_SPEED_PREFLIGHT**. Başlatılmadı; bu rapor yeni ödeme/yükleme/deploy veya sonraki gate onayı değildir. Genel Video V1 hâlâ **NOT_COMPLETE**.


## 26. Maliyet/hız ön kontrolü — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_COST_SPEED_PREFLIGHT: COMPLETED_WITH_WARNINGS.** Amaç mevcut kabul kanıtından ölçüm başlangıcını çıkarmak, 100 USD Growth planını doğrulamak ve sonraki küçük ölçüme sayısal hedef/kapsam hazırlamaktı. Yalnız bu belge, ana Video V1 planı ve `tmp/video-public-testnet-cost-speed-preflight-20260911/` raporları değişti. Yeni upload/ödeme/asset/imza/çekim, source/config/Git/CI/deploy/provider/NEAR/D1 yazımı yapılmadı. Mevcut durmuş M2 sayfasının logları ve Livepeer Usage/Billing/Plans ekranları salt-okunur incelendi.

### Kanıt ve saat sınırları

GitHub main yeniden **8facb7f4390d1cede6238244149a158b2de6322f** bulundu. M2’nin exact source→CI→deploy→serving paketi korunur; yeni yayın iddiası yok. Dirty kökteki iki ölçüm/playback dosyasının temiz yayın adayıyla farklı olduğu görüldü; kullanıcı değişiklikleri korunup okuma temiz exact-main adayından yapıldı. `observability/slo-policy.json` eşleşti. Bu farklar ürün hatası veya geri alınacak değişiklik sayılmadı.

| Ölçüm | Mevcut kanıt | Sınır |
| --- | --- | --- |
| İlk kesinti parçası | 32 MiB, 201.470s, yaklaşık 1.33 Mbps | Fast 4G uygulanmıştı; normal hız örneği değildir. |
| Normal hızda devam | 235912975 bayt, 317.534s, yaklaşık **5.94 Mbps** | n=1 iş; sekiz PATCH sekiz bağımsız upload değildir. Aynı tarayıcı duvar saati farkı; NTP/kalibrasyon veya genel p95 iddiası yok. |
| Başarılı yeniden kullanım kontrolü | Server kontrolü 573ms; uç HTTP kaydı 967ms | n=1; farklı süre kapsamlarıdır. İlk 503 de kayıtta kalır. |
| İlk token | 1131.7ms | M2 Watch’ın son reload’undan kalan n=1 `performance` ölçümü; cache sınıfı yok. |
| Token yenilemesi | 2083.2ms ve 1576.8ms | n=2, durmuş sayfanın mevcut otomatik yenilemeleri; p95 veya cache-HIT kanıtı değil. Bu ön kontrol yeni oynatma başlatmadı. |
| İlk görüntü | Bu snapshot’ta sayısal `play_to_first_frame_ms` yok | TTFF **UNPROVEN**; SDK olayının toplu geliş zamanı ilk görüntü zamanı sayılmaz. |
| Provider/yayın | TUS sonu 12:05:22 UTC; provider ready 12:08:30; chain Published 12:08:43 | Farklı saatlerdir; yalnız yaklaşık üç dakika/ardından saniyeler düzeyinde ilişki kurulabilir. Bunlardan ms hassasiyetinde gecikme SLO’su çıkarılmaz. |

Mevcut `video_measurement` v1; `performance.timeOrigin/now`, phase/outcome/duration, güvenli errorCode/httpStatus ve gerçek sayısal player ölçümleri yeniden kullanılır. Token süreleri normal retry akışını da kapsar; yalnız fetch süresi diye sunulmaz. İlk token, gerçek renewal, cache-HIT server yetkilendirme ve ilk görüntü ayrı değerlendirilir. Eski kapalı playback/sarma testleri yeniden açılmaz.

### Kullanıcının 100 USD planı ve maliyet hesabı

Kullanıcı Livepeer’e giriş yaptı ve aylık **100 USD** planını kullanmayı planladığını belirtti. Hesap **zaten Growth**: **1 Eylül–1 Ekim 2026**, gelecek fatura **100 USD**, aşım **0 USD**, son tarih **1 Ekim 2026**. Plan ekranı kullanım 100 USD altında kalırsa 100’e yuvarlandığını belirtir. Bu bir yükseltme/ödeme talimatı değildir; hiçbir plan veya ödeme yöntemi değişmedi. Kart bilgileri ve imzalı fatura bağlantıları rapora alınmadı.

[Resmi Growth fiyatları](https://livepeer.studio/pricing) ve hesaptaki Plans/Billing ekranı: işleme **0.0055 USD/dakika**, saklama **0.0015 USD/dakika**, dağıtım **0.0005 USD/dakika**. [Usage API alanları](https://raw.githubusercontent.com/livepeer/livepeer-js/main/docs/models/components/usagemetric.md) dakika cinsindedir. Kaynak uzunluğunu veya iki çıktıyı otomatik olarak faturalı dakika sayısına dönüştürmeyiz; saklamanın dönem/prorata hesabı ve tekrar izleme/ön yükleme ayrıca doğrulanmalıdır.

**Tarife hesabı:** `C = 0.0055×T + 0.0015×S + 0.0005×D USD`; T/S/D aynı dönem için provider’ın faturaladığı dakikalardır. Basit indirimsiz Growth modeli `max(100, C)` olup vergi, kredi, dönem düzeltmeleri ve Cloudflare maliyetini içermez. Bu bir invoice yerine geçmez.

| Yalnız hesap örneği | Tarife değeri |
| --- | --- |
| 10 faturalı işleme + 10 saklama + 10 dağıtım dakikası | 0.075 USD |
| 20 işleme + 20 saklama + 10 dağıtım dakikası | 0.145 USD |
| Ekrandaki 21.83 işleme / 114.69 saklama / 0 dağıtım dakikasının ağırlığı | Yaklaşık 0.2921 USD; görünen fatura yine minimum 100 USD |

Bunlar **M2’nin ölçülmüş maliyeti değildir**. 12:18:50 UTC API tekrarında 21.829703133333332 / 114.58966307408262 / 0 değerleri M2 öncesiyle aynıydı. UI 21.83 / 114.69 / 0 gösterdi; UI/API dönem/yuvarlama farkı zorla eşitlenmedi. Güncellenmeyen sayaçtan sıfır artış veya kesin kalan kota çıkarılmaz. M2’nin 0.60 **test USDC** ücreti ve 0.001708139347119000000001 **test NEAR** harcaması gerçek USD faturaya eklenmez. Cloudflare Workers/D1 gider payı ve provider’ın işe özgü ek maliyeti **UNPROVEN** kalır.

Planlanan 100 USD, minimum aylık işletim tabanı olarak bütçeye yazılır. Kullanım takibi için **80/90/100 USD** bilgilendirme/kontrol seviyeleri önerilir; uygulamaya yazılmadı, otomatik kesici değildir. Mevcut public upload açık kalır ve kaldırılan sabit USD rezervi geri gelmez.

### Mevcut ve önerilen sayısal hedefler

| Hedef | Kaynak / ölçüm | Bu ön kontrolde sonuç |
| --- | --- | --- |
| Cache-HIT token yetkilendirme **p95 <500ms** | Mevcut SLO; yalnız `stateless_playback_authorization_completed`, cacheResult=HIT, server latencyMs | **Korundu / UNPROVEN**; etiketli yeterli güncel örnek yok. Client token süreleriyle karıştırılmaz. |
| Provider çağrısız upload kontrolü **p95 <750ms** | Mevcut SLO; providerCalls=0 | 573ms tekil örnek; p95 değil. Yeni upload talep edilmez. |
| Queue ACK **p95 <500ms**, Discover read **p95 <300ms**, internal error ratio **<0.5%** | Mevcut kaynak SLO’ları | Korundu; bu küçük paket tüm SLO/kapasiteyi kanıtlamaz. Eski SOURCE_ONLY alarm/otomatik kapatma metinleri yeni yetki değildir. |
| İlk token client **p95 ≤3s / max≤5s**, n≥20 | **Öneri**; önceden sabitlenecek normal başlangıç ölçümü | Tek 1.13s gözlemi başlangıç referansı, garanti değil. |
| Tıklama→ilk görüntü **p95 ≤3s / max≤5s**, n≥20 | **Öneri**; gerçek sayısal SDK alanı, toplu olay geliş zamanı değil | Mevcut M2 TTFF sayısı yok; canlı sonuç **UNPROVEN**. |
| Gerçek token renewal **max≤3s**, n≥2 | **Öneri**; doğal yenilemeler | İki mevcut örnek 1.58–2.08s; örnekler p95 iddiası sağlamaz. |
| M kaynak aktarımı / işleme | Tek örnek ve bağlantı koşulu var | Yeni global upload/processing p95 sabitlenmedi. Daha sonraki onaylı normal yükleme ve aynı monotonic saat gözlemi gerekir. 5 GB/120 dakika bu örnekten çıkarılmaz. |

Yeni öneriler ölçüm paketi onaylanırsa koşudan önce sabitlenir; sonuçları geçirebilmek için sonradan gevşetilmez. Mevcut 500/750/300ms SLO’ları değiştirilmez. Nearest-rank p95 `ceil(0.95×n)`; n/median/p95/max ve başarısız/iptal örnekler birlikte raporlanır. Başarısız istekler saklanır; küçük tek kullanıcı örneği genel hata oranı veya kapasite garantisi değildir.

### İncelenebilir sonraki paket — henüz başlamadı

**VIDEO_PUBLIC_TESTNET_COST_SPEED_MEASUREMENT:** aynı **M2 lp-491fb8eb-451f-4fc6-918e-b94d6876fc02 / asset b9bfb314-cd2f-47a2-8d16-a1689287e291 / playback b9bfi30nn2sxq14c**, **soteri.testnet / Brave İş**, mevcut 30 günlük cihaz yetkisi. Başlamadan exact source/CI/receipt/serving ve Published/ACTIVE kimliği yeniden karşılaştırılır; snapshot’ın güncel olduğu varsayılmaz.

- Yeni upload, ödeme, asset, cüzdan imzası, NEAR/D1/config/plan değişikliği **0**. Yeni ödeme bütçesi **0 test USDC / 0 test NEAR**. Provider hesabının 100 USD tabanı artırılmaz.
- En çok **24 normal başlangıç**, hedef **20 geçerli başlangıç**; en fazla **60 token endpoint POST denemesi**. İmzalı isteği script ile tekrar etme, private key/URL/JWT kaydı, TTL/cache/feature flag değişikliği yok. Sadece mevcut normal UI ve güvenli loglar.
- **Bir eşzamanlı izleyici**, en çok **10 izleyici-dakika / 15 dakika duvar saati**. Ölçüm **12. dakikada**, oynatma **9. izleyici-dakikada** durur; kapanış ve kayıt için kalan pay korunur. Kullanıcı/araç beklemeleri bu kez duvar sayacına dahil edilir. En az iki doğal renewal yeterli; zorla yenileme/uzatma yok.
- Ek provider kullanım gözlem önerisi **1 USD**; kesin fatura tavanı değildir. İzlenmiş dakika ile indirilmiş/faturalı dakika eşit varsayılmaz. Beklenen 100 USD fatura artarsa veya gözlem eşiği aşılırsa yalnız bu ölçüm durur; public yüklemeler kapatılmaz.
- Token/TTFF/etiketli HIT logları başlangıçta alınamıyorsa eksik ölçüm **UNPROVEN** bırakılır; ölçüm kodu/servis eklemek veya bütçeyi uzatmak için bu paket genişletilmez. Ödeme/imza, farklı kimlik/sürüm, sınır aşımı veya 5xx/oynatma hatasında kanıt kaydedilip durulur; kör tekrar yapılmaz.
- Sonunda bir Usage/Billing okuması; sayılar gecikirse gerçek ek maliyet kapanmış sayılmaz. Sıcak cache örneği n≥20 değilse p95 kabulü verilmez. Yeni asset işleme, çekim, ikinci tarayıcı/yavaş ağ, 5 GB/120 dakika veya 1000 izleyici testi eklenmez.

Kanıtlar: `billing-current.json`, `usage-current.json`, `baseline-and-cost.json`, `existing-client-measurements.json`, `source-read-parity.json`, `next-run-package.json`. Bunlar preflight çıktısıdır; canlı ölçüm başlamadı. M2 ve kapalı playback kabulü korunur. Kalan engel gerçek işe özgü maliyet/Cloudflare payı ve yeterli etiketli süre örneğidir; ön kontrolün tamamlanmasına engel değildir. **Tek önerilen sonraki gate VIDEO_PUBLIC_TESTNET_COST_SPEED_MEASUREMENT**, çalıştırma onayı ayrıca bu somut pakete bağlanır. Genel Video V1 **NOT_COMPLETE**.


§26 doğrulaması: matematik/birim ve paket sınırı kontrolleri PASS; iki explicit-path belge için diff/boşluk kontrolü PASS. `docs/npm run build` bu gate’te bir kez çalıştırıldı ve değişmeyen `playback-public-testnet-acceptance-preflight.md` / `playback-ux-plan.md` içindeki aynı **6 eski kırık bağlantı** nedeniyle FAILED. Hedef iki belgede yeni link hatası bildirilmedi; kapsam dışı dosyalar veya link kontrol ayarı değiştirilmedi. Build başarısı iddia edilmez. Log: `tmp/video-public-testnet-cost-speed-preflight-20260911/docs-build.log`.

## 27. Onaylı maliyet/hız ölçümü — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_COST_SPEED_MEASUREMENT: FAILED (tarihsel 8fac koşusu; güncel kapanış §33).** Kullanıcı §26 paketinden sonra “önerdiğin gibi devam et” diyerek çalıştırmayı onayladı. Kapsam iki ana belge/yerel kanıtlar; uygulama/config/workflow/secret ve yeni ödeme/upload/imza kapsam dışıydı. Sınırlar 24 normal başlangıç, hedef20 geçerli örnek, 60 token POST, tek izleyici, 10 izleyici-dakika, 15 dakika duvar saati ve 12.dakikada ölçümü bırakmaydı.

Main **8facb7f4390d1cede6238244149a158b2de6322f**, CI **34586691970** ve deploy **34587885148** success yeniden okundu. Web20 JS hash’i artifact ile aynı; Bridge/read-model sürümleri aynı. M2 **lp-491fb8eb-451f-4fc6-918e-b94d6876fc02** Published/ACTIVE, asset **b9bfb314-cd2f-47a2-8d16-a1689287e291** ready/JWT/269467407 bayt/600.025521s. Başlangıçta soteri bağlı ve video durmuştu. Growth1Eylül–1Ekim, gelecek fatura100 USD/aşım0 kaydedildi.

Mevcut `video_measurement` ve pasif, redacted server tail kullanıldı. Yerel capture allowlist self-check PASS; token/authorization/body kaydedilmez. Yeni collector servisi/bağımlılık veya runtime ölçüm kodu eklenmedi. Gerçek SDK `play_to_first_frame_ms` alanı kullanıldı; toplu olayın geliş zamanı TTFF sayılmadı.

| Başlangıç | İlk token, ms | SDK ilk görüntü, ms | Sonuç |
| --- | ---: | ---: | --- |
| 1 | 1612.2 | 255 | Oynadı, durduruldu |
| 2 | 897.9 | 4864 | Oynadı, durduruldu; TTFF sonraki SDK paketinde geldi |
| 3 | 838.5 | 1510 | Oynadı, durduruldu |
| 4 | 591.5 | 2354 | Oynadı, durduruldu |
| 5 | Yok | Yok | Reload sonrası Connect/Ticket required; oynatma başlatılmadı |

İlk token n4 median **868.2ms**; ilk görüntü n4 median **1932ms**. **p95 UNPROVEN**, n≥20 sağlanmadı. İkinci örneğin4864ms değeri geç geldi diye hariç tutulmadı. İlk Play-wait yardımcısı UI tam yüklenmeden süre aşımına uğradı; aynı sayfa hazır olunca devam edildi, ek reload sayılmadı. İlk klavye durdurması etkisizdi; video yüzeyine tıklama ve paused=true ile durduruldu. Sonraki kısa örnekler de yüzey tıklamasıyla durduruldu.

Bir doğal renewal: `timeOriginMs=1789130419065.7`, `startedAtMs=152936.20000004768`, **durationMs=10646.899999976158**, completed. **Önerilen max3000ms hedefi FAILED**; ikinci renewal örneği tamamlanamadı. Süre istemci hazırlık/retry/ağ yolunu kapsar; tamamı Bridge/provider işlemesi değildir.

Server penceresinde beş `/v2/playback-tokens` POST’un hepsi200; yetkilendirme **547/546/361/198/46ms**. Beşi **MISS**, HIT=0. providerCalls0 olması HIT varsayımı yaratmaz. **Cache-HIT p95<500ms UNPROVEN.** Bunlar server pencere kayıtlarıdır; per-request publication kimliği saklanmadı. Farklı saatlerden her milisaniyenin katmanlara dağılımı çıkarılmaz. Video error/measurement failed olayı olmaması, hesabın geri gelmemesini yok saymaz.

Beşinci reload `timeOriginMs=1789130733447.9`; navigasyonda **Connect**, içerikte **Ticket required / Connect your wallet to buy a ticket with USDC.**, video elementi yok. Kimlik/restore durma koşulu uygulandı; yeni Connect/Buy/Play/imza denenmedi. Cihaz yetkisinin silindiği, iptal edildiği veya dolduğu kanıtlanmadı. Gözlenen durum hesabın UI’a geri gelmemesidir.

Temiz exact-main `apps/web/components/providers/WalletProvider.tsx` satır161–195, getConnectedWallet’ı **5000ms** zaman aşımıyla yarıştırır; restore reddini sessiz catch ile geçirip isReady=true yapar. Bu bir **teşhis hipotezi**, kesin kök neden değildir. Wallet signOut/account-change, cihaz revision/expiry ve dış sekme etkisi ayrılmalıdır. Kullanıcıya başka YouTick sekmesinde disconnect/hesap değişimi yapıp yapmadığı soruldu; cevap pending. 10.65s renewal ile sonraki bağlantı kaybının nedensel ilişkisi kanıtlanmadı.

Başlangıç **12:40:08.362 UTC**, duruş **12:46:40 UTC**, yaklaşık **391.638s**. Konservatif viewer üst sınırı5 dakika; test uzatılmadı. Yalnız kendi capture PID’sine SIGINT verildi, wrangler sonlandı. Watch **627255386** teşhis için mevcut bağlantı kaybı durumuyla korundu; aktif oynatma yok.

Job/publication ve dört aktörün NEAR/testUSDC bakiyesi önce/sonra aynı. Asset ID seti20, publication7; M2 ready/Published/ACTIVE. Yeni ödeme/asset/publication/imza/NEAR işlemi **0**. Public admission **OPEN**, rezerv boş. Son Growth faturası100 USD/aşım0; usage yine21.829703133333332 işleme /114.58966307408262 saklama /0 dağıtım. Gerçek ek maliyet **UNPROVEN**, sıfır maliyet sonucu çıkarılmaz.

Kanıt `tmp/video-public-testnet-cost-speed-measurement-20260911/`: **approved-package.json**, **window.json**, **before-live.json / after-live.json**, **provider-before.json / provider-after.json**, **billing-before.json / billing-after.json**, **serving-before.json**, **client-samples.json**, **server-events.json**, **capture.py**, **diagnosis-handoff.json**, **receipt.json**. LOCAL_STATIC/self-check, CI referansı, gerçek public-testnet browser/chain ve PROVIDER sonuçları ayrıdır. Uygulama testleri/CI/deploy ve aynı6 eski kırık bağlantı nedeniyle bilinen docs build’i tekrar çalıştırılmadı; explicit-path kontrolü kapanış dosyasındadır.

**Tek önerilen sonraki gate VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_DIAGNOSIS:** restore ve yenileme gecikmesi bulgusunu mevcut kanıt/çalışan kaynak üzerinden sınırlı salt-okunur teşhis etmek. Yeni ödeme/imza/medya/source/config yazımı veya 30 günlük politikayı gevşetme yetkisi yok. Önceki M2 ve playback kabulleri tarihsel kanıt olarak korunur; yeni bulgu çözülmeden maliyet/hız tamamlandı sayılmaz veya çekime geçilmez. Genel Video V1 **NOT_COMPLETE**.

## 28. Cüzdan geri yükleme teşhisi — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_DIAGNOSIS: COMPLETED_WITH_WARNINGS.** Kullanıcı önerilen sınırlı teşhisi onayladı. Kapsam mevcut başarısız sayfa/loglar, exact-runtime kaynak, güvenli oturum üst verisi ve tek normal reload; yeni Connect/Play/ödeme/cüzdan imzası veya kaynak/config/Git/CI/deploy değişikliği yok. İki ana belge ve yerel kanıt paketi güncellendi.

### Korunan oturum ve önbellek

Başarısız M2 sayfası hâlâ Connect/Ticket required gösteriyordu; error/warn konsolu boştu. Native DevTools Console ile yalnız mevcut IndexedDB veritabanları açıldı; yeni veritabanı oluşursa upgrade işlemi abort edilecek şekilde korundu. İşlemler readonly; yerel storage yazımı, challenge imzası, private-key export/import veya proof dump yapılmadı.

13:02:47 UTC üst veri kaydı: selected-wallet mevcut ve meteor-wallet; soteri cihaz oturumu mevcut; revision **32**; market certificate version **3**, account/proof soteri ile eşleşiyor; authorization duration **2592000000ms**. Anahtar mevcut, private/Ed25519/**extractable=false**. Bunlar yalnız güvenli üst verilerdir; tam anahtar, sertifika/proof veya delegate rapora alınmadı. Bu kontrolde kayıtların silinmiş olduğuna dair kanıt yok; geçmişteki tüm kullanıcı hareketlerinin dışlandığı iddia edilmez.

`hot-connector/wallets` içindeki meteor-wallet:1.1.0 kod önbelleği **1380875 bayt**; SHA-256 **30f015e149fff43c1134df1440cb0b676a19f00b87de27cca85194ea9a4eab4f**, sabitlenmiş executor hash’iyle aynı. Kod içeriği/storage payload’ı dışarı çıkarılmadı. SDK **0.11.4**, exact-main lock dosyasıyla eşleşti. Önceki cached-code bozulması varsayımı kanıtlanmadı.

Başarısız sayfanın `timeOriginMs=1789130733447.9` Resource Timing kaydı: connector manifest başlangıcı756.5ms/bitişi815.6ms; pinned Meteor executor fetch başlangıcı11722.6ms/bitişi19703.5ms (yaklaşık7.98s). İçe aktarma/hesap okuma/timer kurulma anları kaydedilmemişti. SDK loadCode cache mevcutsa cache’i döndürürken checkNewVersion fetch’ini arka planda yürütebilir; bu yüzden fetch süresi tek başına restore timeout nedeni diye sunulmaz. İnceleme anında iframe sayısı0.

### Tek normal yenileme ve kaynak sonucu

**Connect’e basmadan tek normal reload** yapıldı. Yeni sayfa `timeOriginMs=1789132108101`; soteri otomatik geri geldi, token başlangıç işlemi **1308.8ms completed** oldu. Oynatıcı **paused=true/currentTime=0/error=null**; Play tıklanmadı. Mevcut yetkinin hâlâ kullanılabildiği canlı olarak doğrulandı; yeni cüzdan kimlik imzası/ödeme gerekmemesi yeniden kayıt yapıldığı iddiasını dışlar. Bu örnek önceki başarısız p95 koşusuna sonradan eklenmedi.

Çalışan **8facb7f4390d1cede6238244149a158b2de6322f** WalletProvider kaynağı:

- Satır178–187: getConnectedWallet ile 5000ms timer Promise.race içinde bekleniyor; applyWallet yalnız başarılı await sonrasında.
- Satır192–195: restore reddi sessiz catch ile geçiliyor, isReady true oluyor.
- Timer önce reddederse gerçek getConnectedWallet isteği iptal edilmiyor; sonradan geçerli sonuç gelse de o await’in devamındaki applyWallet artık çalışmıyor. Bu **kaynak kontrol akışı doğrulaması**dır.
- SDK getConnectedWallet seçili wallet/hesap bulunamamasında da reddedebilir. Orijinal ret kodu ve restore başlangıç/bitiş logları olmadığından **eski olayın hangi ret dalı olduğu UNPROVEN**. Timeout, hesap yokluğu, storage/iframe veya dış sekme etkisi kesin ayrıştırılmadı. Kullanıcının başka sekmede disconnect/hesap değişimi sorusuna yanıt hâlâ yok.

10.65s renewal ayrı bulgu olarak kalır. V2 yolu POST öncesinde getDeviceSession içinden readonly cihaz kaydı/crypto kontrolü ve get_playback_device NEAR sorgusu yapar. V2 refresh, ilk token yolundaki retry döngüsünü kullanmaz; alt RPC/ağ davranışı ayrıca ölçülmelidir. Server pencere yanıtı yaklaşık546ms iken istemcinin10.65s olması tek başına süreyi kesin katmanlara dağıtmaz. Restore kaybıyla nedensellik veya provider arızası iddiası yok.

### Sonuç ve sonraki somut paket

Mevcut oturum ve doğru executor korunuyor; tek reload ile toparlanma PASS. Sessiz hata/timeout sonrası geçerli geç sonucu kaybetme kusuru LOCAL_STATIC olarak doğrulandı. Eski tetikleyici ve yenileme gecikmesinin alt aşaması UNPROVEN; teşhis bu uyarılarla tamamlandı. M2 yayını ve public ortam korunur; maliyet/hız kabulü FAILED kalır, yeni ölçüm/çekim başlatılmaz.

**Tek önerilen sonraki gate VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_SOURCE.** Fresh exact-main adayında küçük yerel düzeltme: geçerli geç sonuç kaybolmamalı; signOut/account-change/unmount veya daha yeni bağlantı eski sonucu bastırmalı; gerçek bağlantısızlık ve gecikme ayrılmalı; sınırlı recovery ve güvenli outcome/duration kaydı olmalı. Hiçbir anahtar/proof/raw SDK error kaydı, yeni bağımlılık, kör timeout artışı veya 30 günlük politikayı gevşetme yok. Kaynak adayları WalletProvider, mevcut video-measurements ve bunların birim testleri. Geç sonuç, gerçek ret ve generation iptali mevcut test altyapısıyla doğrulanacak. Git yayını/CI/deploy ve canlı tekrar bu paketle otomatik yetkilendirilmez.

Kanıt `tmp/video-public-testnet-wallet-restore-diagnosis-20260911/`: **scope.json**, **failed-page-metadata.json**, **single-reload-result.json**, **source-package.json**, **receipt.json**. Kaynaklar yalnız okundu; uygulama testleri ve bilinen6 eski link hatalı docs build’i tekrar çalıştırılmadı. İki explicit-path belge farkı ve 273 diğer dosya/HEAD/index/status kontrolü kapanış kaydındadır. Mevcut Watch sekmesi bağlı ve durmuş halde korunur; yeni gate başlamadı.

## 29. Cüzdan geri yükleme kaynak gate’i — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_SOURCE: PASS / LOCAL_STATIC + LOCAL_TEST.** Kullanıcı gate adını açıkça seçti. Amaç geçerli geç restore sonucunu kaybetmemek, eski sonucu yeni bağlantı/iptal karşısında reddetmek ve güvenli teşhis kaydı sağlamaktı. Yeni bağımlılık, provider/config/secret, cüzdan işlemi veya canlı ölçüm kapsam dışı kaldı.

GitHub main **8facb7f4390d1cede6238244149a158b2de6322f** yeniden okundu. Yerel object mevcut olmadığından main fetch edildi; aynı SHA’da yeni detached worktree oluşturuldu. Kök kullanıcı dosyaları reset/stash/restore edilmedi. Aday **tmp/video-public-testnet-wallet-restore-source-20260911/candidate**; yalnız dört dosya değişti:

- `apps/web/components/providers/WalletProvider.tsx`
- `apps/web/lib/video-measurements.ts`
- `apps/web/__tests__/unit/wallet-provider.test.ts`
- `apps/web/__tests__/unit/video-measurements.test.ts`

WalletProvider/useWallet ve ortak ölçüm fonksiyonlarının player, upload, payment-finality ve token caller’ları incelendi. Başlatma zaman aşımı artık SDK sonucunu reddeden Promise.race değildir.5 saniyelik UI zamanlayıcısı tüm restore hazırlığı için çalışır; uyarı verir/arayüzü serbest bırakır, gerçek sonuç beklenir. Aynı mounted/generation ve connecting koşulları hâlâ geçerliyse geç sonuç uygulanır, uyarı temizlenir. Otomatik deneme sayısı birdir; yeni retry döngüsü/bağlantı/imza açılmaz. SDK çağrısının kendisi abort API’si varmış gibi iptal edilmiş sayılmaz.

Kabul edilmiş dış signIn auth generation’ını değiştirir; böylece önceki accountId null olsa da geç restore yeni hesabı ezemez. SignOut, connect ve unmount korumaları sürer; eski işlem state/hata mesajı yazamaz. Manifest/register sonrasında da güncellik kontrol edilir. Cleanup zamanlayıcıyı temizler ve ölçümü cancelled ile sonlandırır.

No wallet selected / No accounts found güvenli disconnected sonucu olur, cihaz oturumu silinmez. Diğer SDK reddinde sabit hata mesajı gösterilir. Hata mesajı getter’ı bile okunamasa raw error/URL/proof/anahtar UI veya log’a verilmez. Mevcut video_measurement v1 içinde **wallet_restore** phase’i; started, delayed ve tek terminal completed/disconnected/failed/cancelled kaydı kullanılır. Delayed ara durumdur; ardından başarı veya iptal kaybolmaz. Monotonic süre ve mevcut logger yeniden kullanılır; ayrı collector yok.

### Doğrulama

| Kontrol | Sonuç |
| --- | --- |
| Eski kaynakta geç dönüş regresyonları | **2 FAILED**; geç accounts sonucu için creator setter0 çağrı. Log late-restore-before.log |
| Wallet/ölçüm/cihaz odaklı testler | **68 PASS / 3 dosya** |
| Tüm Web testleri | **316 PASS / 30 dosya** |
| Dört touched-path ESLint | **PASS** |
| Web compile/TypeScript/build | **PASS**, repo CI env ile15 statik sayfa |
| Candidate/root explicit-path koruması | Kapanış checks.json içinde |

Testler geciken manifest ve accounts sonucunu, UI readiness sınırını, tek SDK denemesini, yeni connect/signIn/signOut/unmount sonrası eski sonucun reddini, gerçek bağlantısızlığı, hassas/okunamayan SDK hata mesajını ve delayed sonrası tek terminal log’u kapsar. İlk focused koşuda signOut test mock’u Promise yerine undefined döndürüyordu; gerçek async API’ye uygun mock düzeltildi. Bu bir ürün değişikliği değildi.

İlk Web build compile ve TypeScript’i geçti; NEXT_PUBLIC_MARKET_CONTRACT_ID verilmediğinden page-data aşamasında durdu. Repo CI tanımındaki **testnet / market.testnet / access.testnet**, kapalı medya/read-model/sponsor flag’leri ve payments off yalnız komut ortamında kullanılarak build geçti. Runtime/config dosyası veya varsayılan flag değiştirilmedi. Loglar ayrı tutuldu: web-build.log ve web-build-ci-env.log. Yerel test/build GitHub CI, public-testnet veya Production kanıtı değildir. Bilinen6 eski kırık bağlantılı docs build’i tekrar çalıştırılmadı; iki kök belge için diff/boşluk kontrolü yapıldı.

Yama **tmp/video-public-testnet-wallet-restore-source-20260911/source.patch**, SHA256 **da5c82225c43771a398bf1acab104e979d2147e52e6364303ae887e25bf0747d**. Aynı klasörde **receipt.json**, **focused-tests.log**, **web-tests.log**, **lint.log**, **pr-title.txt**, **pr-body.md**, **release-preflight-package.json** bulunur. Root uygulama değişiklikleri korunur; dört kod/test değişikliği yalnız aday çalışma alanındadır. Henüz commit/push/PR/merge/CI rerun/deploy yok; yeni wallet/ödeme/upload/provider/NEAR/D1 işlemi yok.

Eski canlı restore başarısızlığının tam tetikleyicisi kaydedilmemişti; burada kaynakta gösterilen geç sonuç kusuru düzeltildi.10.65s renewal gecikmesi ve gerçek maliyet/hız kabulü yeniden ölçülmeden kapanmaz. M2/önceki kabuller ve public açık kalma kararı korunur.

**Tek önerilen sonraki gate VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_RELEASE_PREFLIGHT.** Güncel main ile bu dört dosyalık yamayı uzlaştırıp incelenebilir Git/CI/korumalı yayın paketi hazırlamak. Bu kaynak gate’i sonraki Git veya canlı işlem yetkisi değildir; sonraki gate başlamadı. Genel Video V1 **NOT_COMPLETE**.


§29 son inceleme: geciken manifest sırasında kullanıcının manuel connect başlatması için ek regresyon yazıldı. İlk adayda pin hazırlığının atlandığını yakaladı; pin hazırlığı mounted korumasıyla tamamlanıp yalnız eski hesap sonucu iptal edilecek şekilde düzeltildi. Son **316 test**, lint-final.log ve web-build-final.log PASS; otomatik restore guard’ı sabitlenmiş wallet hazırlığını devre dışı bırakamaz. Önceki315 test/ilk68 odaklı koşu ara doğrulamadır; final kaynak receipt hash’iyle belirlenir.


## 30. Cüzdan düzeltmesi yayın ön kontrolü — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_RELEASE_PREFLIGHT: PASS.** Kullanıcı bu gate’i seçti. Değişiklik kapsamı iki belge ve yerel paket; kaynak, config, branch/reviewer kuralları, Git yayını ve canlı yazımlar korunur. Salt-okunur repo/runtime/provider kontrolleri ve yeni yerel public build yapıldı.

Main/source base **8facb7f4390d1cede6238244149a158b2de6322f**; dört dosya hash’i source receipt ile aynı. Yama **da5c82225c43771a398bf1acab104e979d2147e52e6364303ae887e25bf0747d**, reverse apply-check PASS. Workflow/dependency dosyaları aynı. 316 test, lint ve CI-env build önceki aynı kaynak kanıtıdır; tekrar koşulmadı. Kanonik acceptance ayarlarıyla **yeni yerel OpenNext build PASS**, wallet_restore client bundle içinde bulundu. Bu yerel paket GitHub-attested artifact değildir.

Kanonik config **9a9711d7a3c64cd1befdc71576ba1d02d266b45748f41ceecd296db8d4bd99ed**, mevcut acceptance config ile birebir aynı. GitHub secret listesinde gereken11 isim mevcut; değerler okunmadı. Repo public; main PR ve strict **CI Gate** istiyor, squash izinli. public-testnet reviewer **4rmus**, prevent_self_review=false; repo API aktörü4rmus. Public ve Preview deploy switch’leri **false**. Son public deployment **34587885148 / attempt1 / success**; aktif public deploy yok.

| Mevcut sağlıklı referans | Sürüm / durum |
| --- | --- |
| Public Web | 4cc38254-fc86-4874-a24c-94195ed8fe5d, 100% |
| Public Bridge | 5ac21b54-c99c-4056-a454-42d4e42b2448, 100% |
| Public read-model | b53269f1-3213-4363-9ee8-a0f51f74a460, 100% |
| Korunan Preview | bc36aae2-f285-4f7d-872d-05bc11e12971, 100% |

Üç public sürüm son başarılı receipt’e uydu; Web20 JS hash’i aynı artifact ile eşleşti, Bridge/read-model health eşleşti. M1 **lp-b378185e-eb55-4a31-833d-899acc073def** ve M2 **lp-491fb8eb-451f-4fc6-918e-b94d6876fc02** Published/ACTIVE; iki provider asset ready/JWT/aynı boyut-süre. Başlangıç asset20/publication7; admission OPEN. Root ve Preview fingerprint’leri200 olarak kaydedildi. Preview karşılaştırmasında nonce’lu HTML baytları değil sürüm/sabit header kanıtı kullanılır.

**Onaylanacak işlem paketi VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_RELEASE:**

1. Dört dosya için bir commit, **fix/wallet-restore-late-result-20260911** dalı, bir PR; başlık **fix: preserve valid late wallet restoration**. Dal bu kontrolde mevcut değildi. Gerekli CI/review sonrasında normal squash; force-push/admin bypass/CI rerun0.
2. Yeni merge SHA’sı ve onun başarılı main push ci.yml run’ı çıkarılacak. Kaynak dosya hash’leri ve güncel main doğrulanacak. Yeni SHA/CI henüz yok; eski8fac/34586691970 veya yer tutucularla dispatch yasak.
3. **DEPLOY_PUBLIC_TESTNET_ENABLED false→true→false**, en fazla **bir** deploy-public-testnet.yml dispatch’i; ref main, mode **acceptance**, confirmation **DEPLOY_PUBLIC_TESTNET_acceptance**. Hazırlanan exact artifact/config/provenance/SBOM, ardından mevcut4rmus environment approval. Preview switch false kalır.
4. Kod yalnız Web’te değişse de mevcut workflow **üç public Worker’ı yeniden yayımlar**. Aynı runtime config ve secret binding’leri kullanılır; yeni secret/rotasyon, D1 migration/snapshot, Market/governance, medya/ödeme/imza/anahtar yenilemesi veya oynatma testi yok. Yeni izleyici-dakika0. Public upload açık kalır.
5. Yeni source→CI→imzalı receipt→managed100%→serving JS/health, M1/M2 ve root/Preview koruması okunur. Global sayaç farkı varsa normal public trafiğe ait olup olmadığı ayrılır; bu nedenle ortam otomatik kapatılmaz. Gerçek Brave restore ve maliyet/hız ölçümü ayrı gate olarak kalır.

Başarısız required check/review, source/config/main drift, provenance/hedef uyuşmazlığı veya korumalı workflow hatasında durulur. Switch false’a döner; resmî failure korunur. Mevcut acceptance kodu promotion başladıysa önceki public sürümleri geri yüklemeyi dener; bunun başarılı olduğu varsayılmaz, bağımsız okunur. Sonraki200 tek başına resmî failure’ı PASS yapmaz. Kör rerun, ikinci dispatch veya yerel manuel rollback yok; gerekiyorsa ayrı recovery paketi hazırlanır. Preview geri dönüş hedefi değildir.

Kanıt paketi **tmp/video-public-testnet-wallet-restore-release-preflight-20260911/**: **action-package.json**, **approval-report.md**, **source.patch**, **pr-title.txt/pr-body.md**, **source-parity.json**, **public-build-receipt.json/public-build.log**, **config-runtime-checks.json**, **managed-versions.json**, **serving-before.json**, **runtime-before.json**, **provider-before.json**, repo rules/switch/secret metadata ve **receipt.json**. Uygulama kaynak/test dosyası, CI rerun, commit/PR/merge/deploy değişmedi. Bilinen6 eski linkli docs build’i tekrar çalıştırılmadı; iki belge diff/koruma kontrolleri kapanış kaydındadır.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_RELEASE**, somut Git/deploy paketi için açık onay bekliyor. AGENTS.md Git yayını/CI rerun/merge/deploy için açık kullanıcı onayı ister; bu preflight onayı o işlemleri başlatmaz. Eski restore tetikleyicisi ve10.65s renewal gecikmesi canlı doğrulama olmadan kapanmaz. Genel Video V1 NOT_COMPLETE.


## 31. Cüzdan geri yükleme yayını tamamlandı — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_RELEASE: PASS.** Kullanıcı §30’daki bir commit/PR, kontroller sonrası normal merge ve tek korumalı yayın paketini “onaylıyorum” diyerek onayladı. Başlamadan dört dosya hash’i, main, repo public durumu, config ve korumalı ortam tekrar doğrulandı. Kök dirty uygulama dosyaları korunarak izole adaydan işlem yapıldı.

| Zincir | Kanıt |
| --- | --- |
| Kaynak commit | 0018dc3036f71348ea5d235f96c75a1283cb2054; dört onaylı dosya |
| PR | [#196](https://github.com/4rmus/youtick/pull/196), normal squash |
| PR CI | [34609743258](https://github.com/4rmus/youtick/actions/runs/34609743258), attempt1 success; CI Gate/iki CodeQL başarılı |
| Yeni main | cf81c2e292e703b8a5e2e83f502cd34c4607cbf6; dosya hash’leri onaylı içerikle aynı |
| Main push CI | [34611141472](https://github.com/4rmus/youtick/actions/runs/34611141472), attempt1 success |
| Korumalı yayın | [34612719919](https://github.com/4rmus/youtick/actions/runs/34612719919), attempt1, acceptance, success |

CI rerun0, force-push/admin bypass0, bir source commit/PR ve bir deployment dispatch. İki ayrı CI, PR ve merge sonrası main için normal otomatik koşulardır. Public deploy anahtarı yalnız bu koşuda açıldı, sonunda **false** okunarak doğrulandı; Preview anahtarı baştan sona false.

Prepare sonrasında altı dosya (**Web/Bridge/read-model tar, config, manifest, SHA256SUMS**) exact source digest ve korumalı workflow imzasıyla doğrulandı. Web/Bridge için iki SPDX SBOM attestasyonu ayrıca geçti. Config hash **9a9711d7a3c64cd1befdc71576ba1d02d266b45748f41ceecd296db8d4bd99ed** değişmedi. Bu kanıtlardan sonra mevcut4rmus environment approval verildi; reviewer/rule değişikliği yapılmadı. Prepare ve deploy işleri resmî olarak success.

| %100 trafikte yeni sürüm | Version ID |
| --- | --- |
| Web | 7edfa5a6-5925-4bc0-986c-3f79adf4c7ce |
| Bridge | 9de194b6-8951-4b8e-83dc-c19e249877e8 |
| Read-model | 098e8ad0-6e7c-4fda-93f2-eb69587c76f6 |

Deployment receipt önceki üç version’ı onaylı sağlıklı referanslarla eşleştirdi; bootstrap false, rollback testi yapılmadı. Gerçek managed sürümler100% ve Bridge/read-model health yeni receipt’e uydu. Sunulan **20 Web JS hash’i** imzalı artifact ile aynı; **wallet_restore** client kodu artifact’te mevcut. Bridge64 thumbnail sınırı korunuyor. Bu kanıt source→main CI→imzalı receipt→serving zinciridir; gerçek Brave davranış kabulü yerine sayılmaz.

Preview sürümü **bc36aae2-f285-4f7d-872d-05bc11e12971** ve sabit header’lar aynı; per-request CSP nonce normalleştirildi. Korumalı workflow’daki **Verify unrelated root origin** adımı success; ana alan adı korunmuş olarak doğrulandı.

M1 **lp-b378185e-eb55-4a31-833d-899acc073def** ve M2 **lp-491fb8eb-451f-4fc6-918e-b94d6876fc02** publication nesneleri aynı/ACTIVE; M2 job nesnesi aynı/Published. Provider iki asset ready/JWT ve içerik kimlikleri aynı. Asset seti **20→20**, publication **7→7**; dört aktörün NEAR/testUSDC bakiyeleri birebir aynı. Yeni ödeme/upload/asset/publication/cüzdan imzası/anahtar yenilemesi/manuel NEAR işlemi **0**. Public admission **OPEN**. Secret rotation, D1 migration/bootstrap/snapshot, Market/governance veya old-beta/Production/Mainnet yayını yapılmadı.

Kanıt **tmp/video-public-testnet-wallet-restore-release-20260911/**: authorized-package, source-commit/merge/PR-CI kayıtları, **main-ci-final.json**, **acceptance/dispatch.json**, artifact/SBOM doğrulama logları, **acceptance/receipt/public-testnet-deployment.json**, **acceptance/serving.json**, before/after chain/provider, **switches-final.json** ve **receipt.json**. Kök uygulama dosyaları ve kullanıcı index/HEAD korunur; iki plan/kabul belgesi yerelde güncellendi. Yeni docs build’i koşulmadı; bilinen6 eski link uyarısı bu yayına karıştırılmadı.

**EXTERNAL_NOT_RUN:** canlı wallet restore, ilk görüntü/yenileme performansı, yeni ödeme/yükleme ve diğer Video V1 aşamaları. Eski başarısız restore’un tam tetikleyicisi ve10.65s renewal gecikmesi bu release PASS sonucu ile kapanmış sayılmaz.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_COST_SPEED_MEASUREMENT.** Yeni cf81c2e2/sürüm kimlikleriyle taze örnek seti; eski8fac örnekleri kullanılmaz. Güncel **next-measurement-package.json** mevcut M2/Brave/soteri, yeni ödeme/upload/imza0, 24 başlangıç/20 geçerli örnek, 60 token POST, tek izleyici, 10 izleyici-dakika ve15 dakika duvar saati sınırlarını korur. wallet_restore ara delayed/terminal kayıtları izlenir; normal sayfa hazırlığı30s ve toplam ölçüm12dk/kapatma3dk sınırları aşılmaz. Kullanıcı sonraki gate’i seçmeden başlatılmaz. Genel Video V1 **NOT_COMPLETE**.


## 32. Yeni sürümde onaylı maliyet/hız ölçümü — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_COST_SPEED_MEASUREMENT: COMPLETED_WITH_WARNINGS — kullanıcı kabulüyle kapandı (§33).** Koşu sırasında durma koşulu uygulandı; ölçümler korundu. Kullanıcı gate adını açıkça seçti; §31 sonrası **next-measurement-package.json** bu koşunun kapsamıdır. Yalnız iki ana belge ve yeni yerel kanıt klasörü değişti. Kaynak/config/workflow/Git/CI/deploy, yeni ödeme/upload/imza/NEAR/D1 veya plan değişikliği yok. Yeni test8fac’in önceki dört örneğini kullanmadı.

### Başlangıç ve kanıt kimliği

GitHub main **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**; PR CI34609743258, main CI34611141472 ve protected deploy34612719919 attempt1 success yeniden okundu. Web **7edfa5a6-5925-4bc0-986c-3f79adf4c7ce**, Bridge **9de194b6-8951-4b8e-83dc-c19e249877e8**, read-model **098e8ad0-6e7c-4fda-93f2-eb69587c76f6**100%;20 Web JS hash’i artifact ile eşleşti. Preview sürümü/sabit başlık kontrolü de geçti. Bu CI/serving kanıtı, oynatma kabulünün yerine geçmez.

Hedef değişmedi: M2 **lp-491fb8eb-451f-4fc6-918e-b94d6876fc02**, asset **b9bfb314-cd2f-47a2-8d16-a1689287e291**, playback **b9bfi30nn2sxq14c**, soteri.testnet/Brave İş. Başlangıç ve kapanış Published/ACTIVE, provider ready/JWT,269467407bayt/600.025521s. Growth dönemi1Eylül–1Ekim, gelecek fatura100USD/aşım0.

### Gerçek istemci ölçümleri

Mevcut video_measurement logları kullanıldı; SDK’nin sayısal play_to_first_frame_ms değeri okundu. Toplu olayın geliş zamanı ilk görüntü süresi sayılmadı. Her sayfa ayrı performance.timeOriginMs ile eşlendi; yardımcı çıktısındaki eski örnek etiketi nihai sıralamaya alınmadı. Yeni collector servisi/bağımlılık veya runtime kodu eklenmedi.

| Açılış | Cüzdan restore, ms | İlk token, ms | SDK ilk görüntü, ms |
| --- | ---: | ---: | ---: |
| 1 | 770.1 | 1055.4 | 238 |
| 2 | 304.6 | 1264.0 | 3402 |
| 3 | 900.0 | 611.5 | 4898 |
| 4 | 357.8 | 605.8 | UNPROVEN |
| 5 | 310.2 | 501.0 | 3310 |
| 6 | 335.0 | 678.8 | 3339 |
| 7 | 293.7 | 697.7 | 10714 |
| 8 | 542.9 | 576.7 | 4503 |
| 9 | 310.0 | 648.1 | 4877 |
| 10 | 290.2 | 629.4 | 3766 |
| 11 | 466.0 | 509.4 | 253 |
| 12 | 415.5 | 1247.0 | 3386 |

Restore12/12 **started→completed**, gecikmiş/disconnected/failed sonucu yok; ortanca346.4ms/en yüksek900ms. Bu örnekler ek cüzdan imzası olmadan aynı hesabın geri geldiğini gösterir; nadir gecikme veya bütün koşullar için garanti değildir. İlk token n12 ortanca638.75ms/en yüksek1264ms. İlk görüntü n11 ortanca3402ms/en yüksek10714ms; **max≤5000ms hedefi aşıldı; ilk sürüm kapanışı için ertelendi**. nearest-rank gözlemsel p95 sırasıyla1264/10714ms olsa da n≥20 olmadığı için **p95 kabulü UNPROVEN**.

Dördüncü sayfa2.826409s konumunda durduruldu; sayısal SDK ilk görüntü olayı reload öncesinde yakalanmadı. Eksik örnek saklandı, sıfır veya başarı yazılmadı. On birinci sayfada ilk Play locator denemesinde denetim henüz yoktu; aynı sayfa sınır içinde hazır görününce bir kez Play tıklandı. Ek reload/ödeme/Connect yok. Bu ön yükleme farkları nedeniyle küçük tek istemci örneği genel SLO veya kapasite kanıtı değildir.

13. normal navigasyon uygulama başlamadan **ERR_CONNECTION_CLOSED / bağlantı beklenmedik şekilde kapatıldı** sayfasını gösterdi. Bu sayfada video ve yeni wallet_restore olayı yok. Yeni restore kusuru veya Cloudflare/provider kaynaklı kesinti olduğu kanıtlanmadı. Kanıt korunarak test durduruldu; Reload/Connect/Play ile tekrar denenmedi. Önceki12 sayfanın her biri navigasyondan önce paused=true doğrulandı.

### Sunucu, bütçe ve kapanış

Redacted pasif Bridge tail:12 token POST,12HTTP200,0 token hata. Yetkilendirme **3HIT:21/21/25ms**,9MISS; cache-HIT p95<500ms **UNPROVEN**, gereken20HIT yok. Per-request publication kimliği saklanmadığından bunlar ölçüm penceresi kayıtlarıdır. Cold-start işareti bir OPTIONS olayında görüldü; sonraki isteğin bütün gecikmesi buna atfedilmedi. Doğal renewal örneği0; uzun oturuma geçilmeden koşu durdu, önceki10.65s bulgusu kapanmadı.

Ölçüm başlangıcı **15:19:02.152UTC**, en geç doğrulanmış duruş **15:24:47.136UTC**;345s. Konservatif izleyici üst sınırı5.75dk (toplam duvar süresi), normal başlangıç13/24, token POST12/60, eşzamanlı izleyici1. Son fatura kontrolü15:26:12.355UTC; kapanış dahil15dk sınırı içinde. Yalnız bu koşunun capture süreci SIGINT ile kapandı; tail exit0. Aktif video yok. Kamu yüklemeleri kapatılmadı.

M1/M2 job/publication ve dört aktörün NEAR/testUSDC bakiyeleri aynı;20 asset kimliği ve7 publication korunuyor. Yeni ödeme/upload/asset/publication/imza/NEAR işlemi0; admission **OPEN**, rezerv boş. Growth gelecek fatura100USD/aşım0; iki ondalıklı UI toplamları21.83 işleme/0 dağıtım/114.69 saklama önce/sonra aynı. Yuvarlama ve provider sayaç gecikmesi nedeniyle **gerçek ek maliyet UNPROVEN**, sıfır maliyet sonucu yok.

Kanıt klasörü **tmp/video-public-testnet-cost-speed-cf81-measurement-20260911/**: approved-package, source-ci-before, serving-before, before-live/after-live, provider-before/provider-after, billing-before/billing-after, usage-before/usage-after, window, client-samples, server-events, receipt ve next-diagnosis-package. LOCAL_STATIC: capture allowlist self-check; CI: yeniden okunan mevcut başarılı koşular; gerçek public-testnet Brave/chain ve PROVIDER sonuçları ayrı. Kaynak değişmediği için uygulama testleri/CI yeniden çalıştırılmadı. Önceki altı kapsam dışı kırık bağlantıyla bilinen docs build tekrar edilmedi; yalnız explicit-path diff ve korunan dosya kontrolü çalıştırıldı.

Önce önerilen **VIDEO_PUBLIC_TESTNET_COST_SPEED_DIAGNOSIS**, §33 kullanıcı kararıyla ertelendi ve artık zorunlu sonraki gate değildir. Tek sonraki gate **VIDEO_PUBLIC_TESTNET_CREATOR_WITHDRAWAL_PREFLIGHT**; henüz başlamadı. Genel Video V1 **NOT_COMPLETE**; bu maliyet/hız aşaması kapalıdır.


## 33. Kullanıcı kararıyla ilk sürüm kabulü — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_COST_SPEED_MEASUREMENT: COMPLETED_WITH_WARNINGS — KAPANDI.** Kullanıcı mevcut test sayılarını ve rakamlarını plana ekleyip aşamayı başarısız değil kapanmış kabul etmeyi açıkça istedi. Kontrollü ilk testnet sürümü için §32’deki işlevsel kanıt yeterli kabul edildi. Eski ölçüm değerlendirmesi yerel kapanış arşivinde korunur; güncel gate sonucu bu kabul kararıdır. Kaynak kod veya canlı sistem değiştirilmedi, test tekrarlanmadı.

Kabulün sayısal temeli:13 normal başlangıç,12 çalışan sayfa/oynatma,12/12 imzasız cüzdan restore (ortanca346.4ms/max900ms),12/12HTTP200 token yanıtı (ortanca638.75ms/max1264ms),11 sayısal ilk görüntü (ortanca3402ms/max10714ms),1 eksik SDK değeri;3HIT (21/21/25ms),9MISS,0 doğal renewal örneği. Tek izleyiciyle yaklaşık345s; konservatif üst sınır5.75 izleyici-dakika. M1/M2,20asset/7publication ve dört aktör bakiyesi aynı; yeni ödeme/upload/imza/NEAR işlemi0. Growth gelecek fatura100USD/aşım0; toplam kullanım21.83/0/114.69 dakika. Ayrıntılı12 satırlık tablo §32’de, özet ana plan §23’te.

**Ertelenmiş bulgular:** ilk görüntü hız hedefi aşımı,13. navigasyondaki ERR_CONNECTION_CLOSED, yeterli p95/HIT örneği, yeni sürümde iki doğal renewal hız ölçümü ve gerçek ek maliyet. Bunlar kapalı aşamanın uyarılarıdır; çözülmüş veya ölçülmüş diye işaretlenmedi. Bilgisayar yükü/ağ kararsızlığı kullanıcı beyanıdır, doğrulanmış kök neden değildir. Bu kapanış genel hız garantisi,1000 izleyici kapasitesi veya bütün Video V1 aşamalarının kabulü değildir.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_CREATOR_WITHDRAWAL_PREFLIGHT.** Çekilebilir tutar, hesap, ücret ve işlem sınırlarını salt-okunur doğrulayıp somut paket hazırlamak. Bu kayıt çekim/imza/ödeme veya otomatik sonraki gate çalıştırma yetkisi vermez; ön kontrol henüz başlamadı. Kapanış engeli yok. Yerel kanıt: **tmp/video-public-testnet-cost-speed-cf81-measurement-20260911/receipt.json** ve **user-acceptance-closeout/**.

## 34. Üretici kazanç çekimi ön kontrolü — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_CREATOR_WITHDRAWAL_PREFLIGHT: PASS.** Kapsam iki ana belge ve yeni yerel kanıt paketidir. Amaç bakiye/hesap/ücretleri salt-okunur doğrulayıp tek çekimin kabul ve durma koşullarını hazırlamaktır. Kaynak/test/config/workflow/Git ve canlı yazımlar yasaktır. Kullanıcı bu görevde kapanan gate sonrasında yetkili sıraya yeniden genel onay beklemeden geçilmesini istedi; ekonomik/imza/yayın sınırlarını açıkça korudu. Bu güncel yetki eski bölümlerin “otomatik ilerleme yok” kayıtlarının bu görev için yerini alır; eski işlem onayları genişlemez.

### Taze zincir ve arayüz kanıtı

Kesinleşmiş blok **268116621**, hash **5HrNiimgEq7kU6n7o2kMqyvwFwPimGPTZeXaAzdrNLma**, okuma **11 Eylül 2026 15:49:47 UTC**. Ağ **testnet**, Market **video-market-v1-260907.youtick-dev-v3.testnet**, token **3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af**, **6** ondalık. Bütün bakiye uzlaştırması aynı kesinleşmiş bloktadır.

| Hesap / kalem | Başlangıç | Tek başarılı çekim sonrası beklenen |
| --- | ---: | ---: |
| soteri.testnet çekilebilir kazanç | 5,88 testUSDC | 0 |
| soteri.testnet FT cüzdanı | 32,10 testUSDC | 37,98 testUSDC |
| Market FT cüzdanı | 18,20 testUSDC | 12,32 testUSDC |
| Platform payı | 4,48 testUSDC | 4,48 testUSDC |
| utick.testnet kazancı | 3,92 testUSDC | Aynı |
| lp-arch-creator-260809.youtick-dev-v3.testnet kazancı | 3,92 testUSDC | Aynı |
| utick2.testnet FT cüzdanı / kazancı | 11 / 0 testUSDC | Aynı |
| Yayınlar | 7, tamamı ACTIVE | Aynı 7; M1/M2 korunur |

Üretici kazançları **13,72** + platform **4,48** = gerçek Market bakiyesi **18,20**; borç/bakiye uzlaştırması geçti. Soteri NEAR bakiyesi **5,271487864922676997999995**; Market rezerv karşılanıyor, marj **1,0873858501603064 testNEAR**. Alıcı ve Market testUSDC kayıtlı, storage total her biri **0,00125 testNEAR**; yeni kayıt/depozito gerekmez. Market frozen/paused=false, Bridge newUploadReady=true; public açık kalır.

Brave İş'te yeni **/profile** sekmesi normal oturumla soteri hesabını ve **AVAILABLE TO WITHDRAW 5.88 USDC** değerini gösterdi; Withdraw etkin. Bir sayfa navigasyonu, çekim tıklaması **0**, imza **0**, medya oynatma **0**. Mevcut tarayıcı sekmeleri/cüzdan korundu. Bu UI kontrolü gerçek çekim kanıtı değildir. İkinci üreticilerin mevcut yayınları yeniden yüklenmedi.

### Kaynak ve çalışan sürüm

GitHub main **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**; PR CI **34609743258**, main CI **34611141472**, protected deploy **34612719919** attempt1 success yeniden okundu; rerun yapılmadı. Web **7edfa5a6-5925-4bc0-986c-3f79adf4c7ce**, Bridge **9de194b6-8951-4b8e-83dc-c19e249877e8**, read-model **098e8ad0-6e7c-4fda-93f2-eb69587c76f6** %100; health ve **20 Web JS hash'i** kayıtlı artifact'e uydu. Preview **bc36aae2-f285-4f7d-872d-05bc11e12971** ve sabit header'lar aynı; nonce normalleştirildi. Önceki source/CI/attestation kanıtı tekrar üretilmedi; bu gate'in yeni kanıtı salt-okunur eşleşmedir.

Canlı Market code hash **HyMxZxV2bF7NZjuUUxFFKcJEDc6pJCvwCERR7gUFCesB** önceki başarılı code-update receipt'iyle eşleşir. O yayının **cd7e485aa9451102d2b7273fa5632fa5142e3e5c** sözleşme kaynağı yeni main ile aynı, SHA256 **703a98776c688327616ec83a91f8ee1ffdd2e3f35517c52e717c10035b0e2277**. Root'taki beş ilgili dosyanın dördü main ile aynı; Profile'ın activity polling farkı var, çekim yolu aynı. Root düzeltilmedi veya yayın adayı sayılmadı.

Kaynak akışı: Profile → `withdrawCreatorBalance` → cüzdanın tek `withdraw_creator_balance` çağrısı → creator bakiyesini sıfırlama → **20 Tgas** FT aktarımı → **10 Tgas** callback. Başarılı callback aynı withdrawal ID ile succeeded olayı üretir; başarısız FT aktarımında bakiye geri konur ve failed olayı çıkar. Yalnız ilk işlem success veya ekranda 0 görmek tam kabul değildir. Mevcut testler bu kaynak yollarını kapsıyor; bu hazırlıkta yeniden çalıştırılmadı.

### Tek canlı işlem paketi — açık onay bekliyor

**VIDEO_PUBLIC_TESTNET_CREATOR_WITHDRAWAL_ACCEPTANCE:** Brave İş / soteri / aynı Profile; receiver Market, `withdraw_creator_balance`, argüman **{}**, gas **100.000.000.000.000 (100 Tgas)**, dış depozito **0**. Aynı hesaba mevcut kazancın tamamı **5.880.000 mikro testUSDC**; bir Withdraw tıklaması, bir transaction, en çok bir işlem imzası. Cüzdan imzası gerekirse kullanıcı tamamlar; programlı imza, key import/export veya yeni cihaz anahtarı yok.

Yöntem tutar seçmez, **işlem anındaki tüm kazancı** çeker. Gönderim öncesi taze okuma/ekran **5,88** ile eşleşmeli; görülen drift'te durulur. Aradaki yeni bir public satın alma miktarı değiştirebilir; zincir içinde 5,88 tavanı yoktur. Yeni satın alma/yükleme gerekmiyor.

Gas fiyatı **100.000.000 yocto/gas**, nominal 100 Tgas ön tahsisi **0,01 testNEAR**; dış işlem ek ücretleri ayrıca. Önerilen cüzdan ön tahmini/son kontrol eşiği **0,02 testNEAR**; zincirde maxFee veya kesin tahsilat garantisi değildir. Gerçek ücret FINAL receipt'lerinden hesaplanır. Market'in FT çağrısındaki **1 yoctoNEAR** kendi bakiyesindendir; kullanıcının dış depozitosu sıfırdır. Ek storage kaydı, fonlama veya ücret eşiğini aşan tahmin görülürse işlem gönderilmez.

Onaydan sonra taze source/sürüm/Market kodu/ağ/token, hesap, kazanç ve FT kayıt/bakiye kontrolleri geçmelidir. Cüzdan yalnız bu çağrıyı göstermeli; beklenmeyen eylem/hesap veya ek yetki varsa durulur. İşlem hash'i bir kez kaydedilir; ret/hata/belirsizlikte ikinci tıklama/gönderim yok. En çok **5 dakika** aynı hash'in kesinleşmesi izlenir; kanıt yoksa UNPROVEN olarak uzlaştırmaya dönülür.

Kapanış için **FINAL**, başarılı gerçek FT transfer receipt'i, **callback true**, aynı withdrawal ID/tutar/hesap için **bir started + bir succeeded**, failed **0**, yukarıdaki bakiye farkları, Profile **0/pasif Withdraw** birlikte istenir. İkinci sıfır-bakiye işlemi yapılmaz. Gerçek gas ücretleri ve cüzdan debit'i iade/contract gas ödülü/iç depozitodan ayrılır; ilgisiz kamu hareketi varsa ayrıca açıklanır. Yedi yayın/M1/M2, diğer aktörler, platform payı ve açık public ortam korunur. Normal D1 aktarımı ek kanıt olabilir; NEAR'ın yerine geçmez, manuel D1 yazımı/onarıma izin yok.

### Doğrulama, kanıt ve devam sınırı

Kanıt dizini **tmp/video-public-testnet-creator-withdrawal-preflight-20260911/**: **action-package.json**, **approval-report.md**, **chain-before.json**, **ledger-before.json**, **browser-preflight.json**, **source-parity.json**, **contract-parity.json**, **source-ci-before.json**, **serving-before.json**, **checks.json**, **receipt.json**. `read-withdrawal.py` yalnız izinli view sorguları yapar. İlk liste sorgusunda U64 JSON biçim hatası alındı; `from_index="0"` ile düzeltildi, mutasyon yapılmadı; son tüm alanlar aynı kesinleşmiş bloktan alındı.

**LOCAL_STATIC / LOCAL_TEST:** paket/bakiye aritmetiği, tek çağrı sınırı, belge diff/boşluk ve korunmuş **273** diğer dosya/HEAD/index/status kontrolü PASS. **CI:** mevcut başarılı koşuların okunması; **PREVIEW (public-testnet):** taze zincir, gerçek Brave ve runtime kanıtı. Provider medya/fatura incelemesi bu çekim hazırlığı için yeniden yapılmadı. Uygulama testleri/CI rerun veya yeni docs build yok; önceki altı ilgisiz kırık bağlantı bulgusu korunur, genel docs build PASS denmez. **EXTERNAL_NOT_RUN:** çekim/imza/ödeme/yükleme, yeni medya/asset/publication, Git/yayın/config/NEAR/D1/provider yazımı; tüm yeni mutasyonlar **0**.

Hazırlık kapandı. **Tek sonraki gate VIDEO_PUBLIC_TESTNET_CREATOR_WITHDRAWAL_ACCEPTANCE**, yalnız somut çekim/imza onayı eksik; `AGENTS.md:19` ve kullanıcının bu görevde koruduğu onay sınırı uygulanır. Sonraki tarayıcı/yavaş ağ ön kontrolü çekim kapanınca mevcut döngü yetkisiyle başlayabilir; henüz başlatılmadı. Maliyet/hız §33 kapalı ve ertelenmiş bulgular aynen; genel Video V1 **NOT_COMPLETE**.

## 35. Tek gerçek üretici çekimi — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_CREATOR_WITHDRAWAL_ACCEPTANCE: PASS — KAPANDI.** Kullanıcı hazır §34 paketinden sonra bu gate adını açıkça seçti; **0673d97375c4abc71609b56954eb8fb97e09b415811192339add8702fbc50d5a** hash'li paket kapsamı yetkilendirildi. Eski paketin baytları değiştirilmedi; yeni `authorization.json` kullanıcı seçimini bağlar. Tek aktif gate; değiştirilebilir yollar iki ana belge ve **tmp/video-public-testnet-creator-withdrawal-acceptance-20260911/**. Kaynak/config/workflow/Git/yayın, yeni satın alma/yükleme ve programlı wallet imzası kapsam dışıdır. Hedef tek çekimin gerçek transaction/FT/callback/bakiyeler ve Profile ile doğrulanmasıydı.

### Başlangıç ve tek kullanıcı yolu

Kesinleşmiş **268117767** bloğunda signer/payout hesabı **soteri.testnet**, kazanç **5.880.000**, FT cüzdanı **32.100.000**, Market FT **18.200.000**, platform **4.480.000** mikro testUSDC; token/6 ondalık/kayıtlar/reserve ve **7 ACTIVE** yayın §34 paketine uydu. Main **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6** ve Market **HyMxZxV2bF7NZjuUUxFFKcJEDc6pJCvwCERR7gUFCesB** aynı. Web **7edfa5a6-5925-4bc0-986c-3f79adf4c7ce**, Bridge **9de194b6-8951-4b8e-83dc-c19e249877e8**, read-model **098e8ad0-6e7c-4fda-93f2-eb69587c76f6** %100; health/**20** Web JS hash'i artifact'e uydu. Preview sürümü/sabit başlıkları aynı. Yeni build/attestation/CI koşusu yok.

Mevcut Brave İş **/profile** sekmesi, soteri ve **5.88 USDC** ile doğrulandı. Normal Withdraw'a **bir kez** basıldı; disabled/bekliyor durumundan Meteor testnet/soteri kilit ekranına geçildi. Parola girişi/imza düğmesi agent tarafından kullanılmadı; programlı cüzdan imzası veya RPC broadcast yok. Kilit ekranı sonrasında popup kapandı ve gerçek signed transaction kesinleşti. Son cüzdan onay ekranı ve oradaki ücret tahmini araçla yakalanmadı; sonradan kesinleşmiş işlem alanları/gerçek ücret kontrol edildi. Yeniden Withdraw, ikinci ödeme/işlem veya yeni anahtar yok.

### Kanonik işlem kanıtı

| Alan | Gerçek değer |
| --- | --- |
| Transaction hash | **66ShE8cudKhWd1D5342NgG2xBGyxQS1ZggB8KGQJ1DNd** |
| Signer / kazanç alıcısı | **soteri.testnet** |
| Receiver | **video-market-v1-260907.youtick-dev-v3.testnet** |
| Dış işlem | Bir FunctionCall: **withdraw_creator_balance**, args **{}**, **100 Tgas**, deposit **0** |
| Nihai sonuç | RPC **FINAL**, SuccessValue **true** |
| Started receipt | **EUTZuXmkdBeTeuXWt37WLHfVsaAcGiJLec4DUW5emqYg** |
| Gerçek FT transfer receipt | **8P7FceFVzHzThMEFxJS2jAJ8Kg74ancPREYBWZfD5t41**, success, NEP-141 **5.880.000** mikro testUSDC |
| Callback receipt | **2SfMqBdXAy7fPZYj59i8MbLCrupfGtgHhbZRqAYAuMj9**, true, succeeded |
| Withdrawal ID | **creator-withdrawal:soteri.testnet:5880000:1789142583078** |
| Olay sayısı | Aynı ID için **1 started / 1 succeeded / 0 failed**; **1 FT transfer** |
| Started → succeeded | **268117979 → 268117981**, **16:03:03.078 → 16:03:04.411 UTC**, **1.333 ms** zincir olay aralığı |

İşlem hash'i UI'da dönmedi. Yeni imza/işlem başlatmadan, iki kesinleşmiş durum arasındaki creator bakiye geçişi salt-okunur sorgularla **268117978→268117979** sınırına daraltıldı. O bloğun Neardata receipt'i signer/receiver/method/amount ile eşleştirilip `tx_hash` alındı. Ardından **aynı hash** kanonik NEAR RPC `tx` ile FINAL okundu; Neardata veya D1 tek başına nihai sonuç sayılmadı. Altı receipt'in tümü success; üçü sıfır token kesintili gas iadesi. Bağlantı belirsizliğinde broadcast/Withdraw tekrarı yapılmadı.

### Bakiye ve ücret kapanışı

Kesinleşmiş kapanış bloğu **268118307**. Soteri cüzdanı **32,10→37,98 testUSDC**, creator kazancı **5,88→0**; Market **18,20→12,32**. Platform **4,48**, utick ve eski creator kazançları **3,92 + 3,92** aynı: **7,84 + 4,48 = 12,32**. Buyer utick2'nin NEAR/FT/kazanç bakiyeleri aynı. Yedi publication nesnesi başlangıçla **birebir aynı/ACTIVE**, M1/M2 dahil. Market kodu, policy/governance ve storage kullanımını çekim değiştirmedi; public açık kalır.

Soteri NEAR **5,271487864922676997999995→5,270740188541821997999995**; debit **0,000747676380855 testNEAR**. Transaction + altı receipt'in `tokens_burnt` toplamı **747.676.380.855.000.000.000 yoctoNEAR**, debit ile birebir eşit; **0,02 testNEAR** kontrol eşiği altında. İade receipt'lerinde `tokens_burnt=0`; ön gas tahsisi gerçek ücret sayılmadı. Market net NEAR **+0,000092230663124899999999** ayrıca kaydedildi; sözleşme gas ödülleri/iç **1 yoctoNEAR** FT depozitosu creator'ın 5,88 USDC ödemesi veya ek kullanıcı kesintisi sayılmadı.

Gerçek Profile ekranı **AVAILABLE TO WITHDRAW 0 USDC**, **Withdraw disabled**. Bir ara snapshot **Publication activity could not be loaded** gösterdi; normal otomatik yenileme M1/M2 ve A/B dört creator yayın bağlantısını geri getirdi. Ek reload/retry/çekim tıklaması yok. Bu geçici liste okuma hatasının kök nedeni kanıtlanmadı; kendiliğinden toparlanma kaydı korunur. Çekim/NEAR bakiyesi kabulünü veya kapalı maliyet/hız aşamasını yeniden açmaz.

### Kanıt, kapsam ve sonraki gate

Kanıt paketi **tmp/video-public-testnet-creator-withdrawal-acceptance-20260911/**: **authorization.json**, **authorized-package.json**, **before.json**, **pre-submit.json**, **ui-action.json**, **balance-transition.json**, **transition-block.json**, **transaction-identity.json**, **transaction-final.json**, **chain-before.json/chain-after.json**, **fee-reconciliation.json**, **browser-after.json**, **checks.json**, **receipt.json**. Ara `pending-chain.json` ilk **0 / 37,98 / 12,32** okumasıdır; `progress.json` kapanışla güncellendi. Yerel kontroller mevcut dosyaları ve onaylı paket hash'ini korur; işlem doğrulayıcısı gerçek action/FINAL/FT/olay/fee/bakiye bağlarını denetler.

**PREVIEW (public-testnet):** gerçek normal UI/NEAR/FT/callback/olay ve bakiye kanıtı; **LOCAL_STATIC / LOCAL_TEST:** sayısal receipt kontrolleri, explicit-path belge diff/boşluk ve diğer **273** dosya/HEAD/index/status koruması PASS. **CI:** eski başarılı aynı-source kayıtları, yeni koşu değil. **EXTERNAL_NOT_RUN:** yeni satın alma/upload/asset/publication/medya oynatma, Git/CI rerun/deploy/config/provider/D1 yazımı **0**; uygulama/docs build tekrar edilmedi. Önceki altı ilgisiz docs bağlantı bulgusu korunur. Yeni provider envanteri/fatura veya diğer Video V1 senaryoları bu gate'e katılmadı.

Çekim gate'i kapandı; işlem ve imza için yeniden onay gerekmiyor veya ikinci çekim önerilmiyor. **Tek sonraki gate VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_PREFLIGHT**, mevcut sıralı ilerleme yetkisiyle sırada; bu tur başlatılmadı. Maliyet/hız §33 **KAPALI**, ertelenmiş bulgular aynı. Genel Video V1 **NOT_COMPLETE**; tarayıcı/yavaş ağ, uzun/sınır, dayanıklılık, gerçek kapasite ve eski beta/nihai kabul kalan ayrı işlerdir.

## 36. Chrome/Edge ve yavaş ağ — incelenebilir kabul paketi

**VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_PREFLIGHT: COMPLETED_WITH_WARNINGS.** Amaç mevcut tarayıcı/hesap/cihaz, medya ve araçların sınırlarını belirleyip normal uygulama kabulüne somut paket hazırlamaktır. Yazılabilir kapsam iki ana belge ve **tmp/video-public-testnet-browser-slow-network-preflight-20260911/**; uygulama/test/config/workflow/Git, ödeme/imza/yükleme/provider/D1 mutasyonları kapsam dışı. Önceki çekim PASS ve maliyet/hız kullanıcı kabulü korunur. Kullanıcı **“soteri.testnet ve utick.testnet”** yanıtını verdi; verilen sırayla **Chrome/soteri**, **Edge/utick** eşlemesi açıklandı. Bu hesap seçimi ödeme veya cihaz çıkarma onayı değildir.

### Gerçek hazırlık ve kaynak kanıtı

| Alan | Sonuç |
| --- | --- |
| Chrome | **152.0.7977.84**, kurulu; gerçek `/profile` **Wallet not connected**; Connect tıklanmadı |
| Edge | **151.0.4129.59**, kurulu; **edge://mac-welcome / Haydi başlayalım**, ilk kurulum ilerletilmedi |
| Brave | **150.1.92.138**, mevcut oturum korundu; yeni oynatma/ödeme/imza yok |
| Kontrol aracı | Bağlı yüzeyler Brave ve in-app; Chrome/Edge eklentisi bağlı değil. Native CUA mevcut; yeni eklenti veya dependency kurulmadı |
| Main kaynak | **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**; altı ilgili dosyadan dört tanesi dirty kökle aynı |
| Farklı iki kök dosyası | `device-session.ts` eski revision başlangıcı; `livepeer-playback.ts` eski ölçüm/hata alanları. Güncel main okundu, kullanıcı dosyaları değiştirilmedi |
| Gerçek runtime | Bridge **9de194b6-8951-4b8e-83dc-c19e249877e8**, read-model **098e8ad0-6e7c-4fda-93f2-eb69587c76f6**, aynı/açık. Web artifact eşleşmesi önceki çekim başlangıcı kanıtı; burada yeniden indirilmedi |
| Provider / yayınlar | Taze GET: **20** asset; M2/M1/testt ready/JWT. Zincir **7 ACTIVE** publication |

Mevcut browser canary'de slow **150 ms**, **200.000 B/s download / 100.000 B/s upload**. Ancak `currentLevel` ile 360p→720p elle seçiliyor; Auto'ya dönüş yalnız bayrakla kontrol ediliyor ve kısa tekrar yeni HLS oyuncusu açıyor. Üst `live-playback-canary` ayrıca signing key/asset yaratıp temizliyor, ağ profilini bu çağrı yolunda aktarmıyor. Bu araçları koşmak gerçek uygulama/Auto/doğal yenileme kabulünün yerine geçmez. Çalıştırılmadılar; yeni harness/dependency veya runtime kodu eklenmedi.

Güncel public kaynak, ayrı “Verify session” imzasını kapatıyor. Yeni tarayıcıda yerel cihaz sertifikası başarılı normal satın alma/yüklemeyle **2.592.000.000 ms / 30 gün** yetkilendiriliyor. Sadece Connect veya mevcut bilet hakkı bunu yapmaz. Aynı bileti yeniden ödemek kontratta iade yoluna gider, yeni cihazı etkinleştirmez. Sözleşme **üç aktif cihaz** saklar; ilk baştaki “iki ayrı hesap zorunlu” varsayımı bu kodla düzeltildi. Hesap değişimi veya cihaz politikası kaynak değişikliği yapılmadı.

### Hesap, hak ve cihazlar

**268119486** bloğunda iki hesabın yedişer (**14**) yayın hakkı ve bakiyesi okundu; iki FT kaydı mevcut. Soteri **37,98 testUSDC / 5,270740188541821997999995 testNEAR**; utick **30,235460 testUSDC / 3,492099954557414479777161 testNEAR**. Soteri'nin **testt** hakkı false, utick'in **M2** hakkı false; fiyatlar **2 testUSDC**. Soteri M2'nin sahibi olduğundan Chrome'da başka bir yeni satın alma cihaz yetkisi sağlayacak; iki tarayıcının medya hedefi yine M2 olacak.

**268119570** bloğunda sözleşmenin hesapla sınırlı public cihaz kayıtları okunup her kayıt `get_playback_device` ile çapraz doğrulandı:

| Hesap | Başlangıç → önerilen | Yan etki |
| --- | --- | --- |
| soteri | **3→3** | Yeni Chrome için en eski kayıt çıkar |
| utick | **1→2** | Mevcut kayıt korunur |

Soteri'nin çıkarılacak kaydı **10 Eylül 2026 15:31:50.555 UTC** yetkilendirilmiş, **10 Ekim 15:31:50.555 UTC** son tarihli. Public-key SHA256 **a84b644789da0c9dc60714867c0a4fefcd08c91e6641b50d8c177fdebf0105d0**, certificate SHA256 **e69b0129bfdc359ea362850ffd41003ca6411ec6cd5d37fe220db074d96e9913**. Diğer iki kayıt key SHA256 **3e32fd4c…** ve **c9ad9bb6…** korunur; sonuncu M2 ödeme tarihli **11 Eylül 11:41:23.510 UTC** kaydıdır. **Mevcut Brave'in bu kayıtlardan hangisini kullandığı henüz canlı eşleştirilmedi.** Ödeme öncesi eşleştirme şarttır; çıkarılacak kayıt Brave'e aitse durulur. Eski kaydın çıktığı cihaz izleme yetkisini kaybedebilir; bu yan etki ayrıca onaylanacak pakette açıktır.

### İki ekonomik işlem ve sınırlar — henüz onaylanmadı

| Sıra | Normal uygulama işlemi |
| --- | --- |
| 1 | Chrome / soteri, **testt** `lp-e6a312e5-4273-481d-a337-7c622a4cca53`, creator utick; **2 testUSDC** |
| 2 | Edge / utick, **M2** `lp-491fb8eb-451f-4fc6-918e-b94d6876fc02`, creator soteri; **2 testUSDC** |

Her biri tek `ft_transfer_call`, receiver **3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af** testUSDC; iç receiver **video-market-v1-260907.youtick-dev-v3.testnet**, amount **2000000**, **100 Tgas**, **1 yoctoNEAR** depozito. `msg` ilgili publication ve normal uygulamanın o tarayıcıda oluşturduğu 30 günlük `playback_session` bilgisidir. Key/sertifika kopyalanmaz, uydurma sabit anahtar kullanılmaz. Mevcut tarayıcı zaten aynı geçerli cihaz yetkisine sahipse gereksiz etkinleştirme ödemesi yapılmaz; paket bakiyeleri bu duruma göre yeniden netleştirilir.

Toplam **4 testUSDC**, ücret ön/son kontrol eşiği işlem başına **0,05**, toplam **0,10 testNEAR**; iki normal cüzdan işlem imzası kullanıcıya ait. Eşikler zincir maxFee değildir. Her ödeme tek hash üzerinden FINAL/FT/entitlement/cihaz ve ücretle uzlaştırılır; ret/belirsizlikte ikinci ödeme veya yeni yayın seçilmez. Ek AddKey, fonlama, conversion, upload, withdrawal veya provider signing key mutasyonu yok.

İki ödeme sonrası beklenen: soteri FT **37,98→35,98**, utick FT **30,235460→28,235460**; soteri creator kazancı **0→1,96**, utick creator kazancı **3,92→5,88**, platform **4,48→4,56**, Market FT **12,32→16,32**. Kazançlar cüzdana kendiliğinden ödenmez; yeni çekim yok. İki yeni entitlement, soteri'de onaylı bir cihaz değişimi/utick'te bir cihaz ekleme; yeni asset/publication **0**.

### Tarayıcı/ağ kabul matrisi

Ortak M2 asset **b9bfb314-cd2f-47a2-8d16-a1689287e291**, playback **b9bfi30nn2sxq14c**, **269.467.407 bayt / 600,025521 sn**, iki kalite 360p/720p. Yeni dosya gerekmez. **2 tarayıcı × 2 koşul = 4 hücre**; her hücre ilk görüntü ve kısa tekrar için en çok iki sayısal örnek. Genel p95 veya kapanmış hız hedefleri yeniden istenmez.

Normal **No throttling**; yavaş **150 ms / 1,6 Mbps indirme / 0,8 Mbps yükleme**. Yalnız test sekmesi, fixed viewport ve Auto kalite. Gerçek master bit hızları önden okunmalıdır: kaynaktaki **800 kbps/3 Mbps** istekleri gerçek çıktı diye alınmaz. 1,6 Mbps gerçek iki çıktı için uygun değilse başlamadan paket gözden geçirilir; manuel kalite/viewport seçimi ağ uyarlaması sayılmaz. Native DevTools ayarları/ölçüm yüzeyleri hazır değilse ücretli adım başlamaz; eklenti kurulumuna sessiz geçilmez.

Tarayıcı başına **480 sn** plan: normal kısa başlangıç **10 sn**; normal kısa tekrar ile başlayan **aynı oyuncuda 450 sn** (**180 normal→210 yavaş→60 normal toparlanma**); ardından yavaş yeni başlangıç **10 sn** ve yavaş kısa tekrar **10 sn**. Her kısa koşu pause ile ayrılır. Uzun koşuda gerçek Auto **720→360→720**, zaman/tampon/durma gözlemleri, normal ve yavaşta en az birer doğal token yenilemesi gerekir. Backend TTL **180 sn**, istemci skew **30 sn** planlama girdisidir; ölçülmüş token değişimi/ilerleme yerine geçmez. Yenilemede aynı video öğesi, daha ileri geçerlilik ve eski süre ötesinde devam kanıtlanır.

En çok **8 başlangıç**, planlı **960 sn / 16 izleyici-dakika**, tek eşzamanlı izleyici. Toplam **18 dk** üst sınır, **17'de durma**; tarayıcı başına **9 dk**. En çok **40 token POST**, sayfa/ilk görüntü için **30 sn** operasyonel bekleme sınırı. Toplam **45 dk** duvar süresi, **40'ta yeni ölçüm sonu / 5 dk kapatma payı**. Kullanıcı/araç beklemesi aktif koşunun duvar süresine dahildir. Ek provider kullanım gözlem eşiği **1 USD**; 100 USD minimum abonelik ve gecikmiş fatura için sert tavan değildir. Yeni ücretli adımlardan önce sayısal capture ve süre sayaçları hazır olmalı; hazır değilse durulur.

Başarısız/token 5xx/authorization denial, oyuncu değişimi, hesap/sürüm/eviction farkı, sayı/bütçe kaybı veya süre sınırında yalnız test durur; public upload kapatılmaz. Eksik Auto/yenileme UNPROVEN kalır, kör tekrar veya bütçe uzatma yok. Sonunda medya pause, **No throttling + orijinal cache/viewport**, aktif oyuncu yokluğu doğrulanır. Önceki Brave ve korunacak cihazlar/yedi publication/readiness ayrıca kontrol edilir. Maliyet/hız §33 ve uyarıları yeniden açılmaz.

### Kanıt ve tek sonraki gate

**LOCAL_STATIC / LOCAL_TEST:** kaynak incelemesi, paket aritmetiği/hak/cihaz/limit eşleşmesi ve iki belge explicit diff/koruma kontrolleri PASS; diğer **273** dosya, HEAD/index/status korunur. **PREVIEW:** Chrome/Edge gerçek hazırlık ekranları, taze zincir/runtime; **PROVIDER:** yalnız asset GET. Gerçek browser/slow oynatma **UNPROVEN / EXTERNAL_NOT_RUN**. Yeni ödeme/imza/cihaz/yükleme/asset/publication, Git/CI rerun/deploy/config/provider/D1 yazımı **0**. Önceki testler/docs build tekrarlanmadı; bilinen altı eski docs bağlantı bulgusu korunur.

Yerel paket **tmp/video-public-testnet-browser-slow-network-preflight-20260911/**: **approval-report.md/action-package.json**, **account-choice.json**, **browser-inventory.json**, **account-preflight.json**, **soteri-devices.json/utick-devices.json**, **chain-before.json**, **provider-before.json**, **runtime-before.json**, **source-parity.json**, **checks.json/receipt.json**. Hazırlık uyarılarla tamamlandı; canlı kabul **hazır oturum veya geçmiş Brave testi varmış gibi** işaretlenmedi.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_ACCEPTANCE.** Kullanıcı Edge ilk kurulumunu ve iki mevcut Meteor oturumunu kendi tamamlar; ödeme öncesi Brave cihaz eşleşmesi, gerçek medya/ağ ve ölçüm yüzeyleri taze doğrulanır. İki ödeme, soteri'nin belirtilen eski cihaz kaydının değişmesi ve sınırlı medya testi için **açık paket onayı eksik** (`AGENTS.md:19` ve kullanıcının koruduğu ödeme/imza/canlı işlem sınırı). Bu onaydan sonra aynı kapsam için yeniden genel “devam et” sorulmaz. Genel Video V1 **NOT_COMPLETE**.

## 37. Chrome/Edge yürütmesi — kısmi kanıt, kabul açık

**VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_ACCEPTANCE: BLOCKED / NOT_COMPLETE.** Kullanıcı yeni eşlemeyi **Chrome/utick2.testnet, Edge/soteri.testnet** olarak açıkça verdi ve gate'i seçti. Eski paketin aynı iki yayın/tutar sınırı bu eşlemeye uyarlandı. Kullanıcı duvar süresini önce **60**, sonra **75 dakika** olarak açıkça onayladı; ödeme ve **18 izleyici-dakika** sınırı değişmedi. Bu kayıt hazırlık veya imza bekleme değildir: iki satın alma tamamlandı, tekrar edilmez. Yazılabilir kapsam iki ana belge ve **tmp/video-public-testnet-browser-slow-network-acceptance-20260911/**; source/config/Git/yayın değişmedi.

Chrome **152.0.7977.84**, Edge **152.0.4191.66**; gerçek Profile hesapları eşleşti. Edge kurulumu/yapıştırma güvenlik adımı ve iki cüzdan imzası kullanıcı tarafından tamamlandı; agent parola veya özel anahtar çıkarmadı, programlı wallet imzası yapmadı. Brave'de yalnız var olan cihazın public-key özeti **c9ad9bb6…** okunarak korunacak zincir kaydıyla eşleştirildi. Normal M2 manifest GET'i **360p 1.021.363 / 720p 3.265.656 bit/s** gösterdi; token kaydedilmedi. İki test sekmesinde **1,6/0,8 Mbps, 150 ms** profili gerçekten seçildi; cache başlangıç ayarı korunuyordu.

Main **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**, üç %100 Worker, **20 Web JS hash'i** ve kanonik Market kimliği başlangıçta eşleşti; final main aynı. Bu source/runtime kimlik kanıtı tarayıcı kabulünün yerine geçmez. Kapanmış maliyet/hız ve çekim testleri yeniden koşulmadı.

| Ekonomik adım | Gerçek FINAL kanıt |
| --- | --- |
| Chrome/utick2, M2 **lp-491fb8eb-451f-4fc6-918e-b94d6876fc02**, 2 testUSDC | **AmzLwCL1Se1UsBAmvHXLvoSQA7JE7HVxFDZeoBV3sggL**, block **268123490**; ücret **0,0008419061390878 testNEAR** |
| Edge/soteri, testt **lp-e6a312e5-4273-481d-a337-7c622a4cca53**, 2 testUSDC | **GZLH6nqnEBoAEu1A4onDVp4qUfv2THy2rL34uxriZmck**, block **268125268**; ücret **0,000841487838275 testNEAR** |

İki signed işlem de tek `ft_transfer_call`, doğru USDC/Market, **100 Tgas / 1 yoctoNEAR**. Toplam **4 testUSDC / 0,0016833939773628 testNEAR**. Utick2 FT **11→9**, soteri FT **37,98→35,98**, Market FT **12,32→16,32**, platform **4,48→4,56**. Utick2 cihaz **2→3**; soteri **3→3**, onaylı **a84b6447…** çıkarıldı, **c9ad9bb6…** Brave ve diğer korunacak kayıt kaldı. Bu haklar ve iki yeni cihaz kullanılabilir; eksik ölçüm için tekrar ödeme/upload gerekmez. Aynı hash'ler canonical RPC FINAL ve gerçek olay/argümanlarla doğrulandı; ikinci broadcast yok.

| SDK ilk görüntü | Normal ilk | Normal tekrar | Yavaş ilk | Yavaş tekrar |
| --- | ---: | ---: | ---: | --- |
| Chrome / utick2 | **805 ms, 720p** | **252 ms, 720p** | **254 ms, 360p** | **253 ms, 360p** |
| Edge / soteri | **243 ms, 720p** | **251 ms, 720p** | **10718 ms, 720p** | **EXTERNAL_NOT_RUN** |

Toplam sekiz sayfa hazırlığından **yedi Play ve sayısal ilk görüntü**; son Edge sayfasında **paused=true / currentTime=0 / ilk görüntü yok**, kalan duvar süresi nedeniyle Play başlatılmadı. SDK sayısal alanları kullanıldı; olayın console'a geliş anı ilk görüntü sayılmadı. n=1/2 hücrelerden p95 veya genel performans garantisi çıkarılmaz. Edge 10,718 sn sonucu ayrı tarayıcı/koşul örneğidir; kapalı maliyet/hız gate'ini yeniden açmaz.

Chrome viewport **1096×869**, Edge **1357×966** koşu içinde sabit kaldı. Chrome normal uzun koşu **203,921004 sn**, yavaş koşu **141,467973 sn** konumunda durakladı; kullanıcı **“Ben duraklattım”** dedi. Bu iki pause uygulama arızası değildir; orijinal kesintisiz 450 sn kabulü verilemez. Tamamlanmış normal örnekler tekrarlanmadı; iki kalan yavaş başlangıç kullanıldı. Aynı video öğesi korunarak normal ağa dönüşte **150+20 sn** ek gözlem sonunda **311,365963 sn / 360p** görüldü. **720p'ye otomatik toparlanma UNPROVEN**; elle kalite veya seek ile başarı üretilmedi.

Chrome gerçek normal yenilemeleri **1341,6 / 1105,1 ms**, aktif yavaş yenilemesi **634,4 ms**, toparlanma yenilemesi **1509,2 ms**; kayıtlı yanıtlar HTTP200, farklı token hash ve ileri expiry. Kullanıcı pause sırasında gelen diğer tokenlar aktif oynatma yenilemesi diye sunulmadı. Hash/expiry tutuldu, JWT tutulmadı.

Edge uzun koşu aynı video öğesinde **449,965271 sn** ilerledi. Normal/yavaş/toparlanma yenilemeleri **815 / 824,5 / 1509,5 ms**, HTTP200 ve token değişimiyle kaydedildi. Yavaş profilin gerçek uygulanma konumu yaklaşık **203,67 sn**; geri dönüş **404,94 sn**. **190,90 sn** gözleminde henüz normal ağdayken **360p +409,13 sn ileri tampon** vardı; kalan içerik bütünüyle tamponlanmıştı. Sonraki normal ağa dönüşte de 360p kaldı. Ağdan kaynaklanan **720→360→720** kabulü kanıtlanmadı; tampon ve cache etkisi ayrılmadan bu sonuç bir ABR yazılım kusuru diye adlandırılmaz.

Konservatif aktif izleme hesabı Chrome **538 sn**, Edge **482 sn**, toplam **1020 sn / 17 dk**; 18 dk hard sınırı altında. Kontrol edilen Play adımları aynı anda bir tarayıcıyla yapıldı. Son başarılı örnek **17:48:36 UTC**'de paused; onaylı 75 dk sonu yaklaşık **17:49:08 UTC**. **Duvar bütçesi temizlik dâhil geçmedi:** Edge network/probe temizliği **17:50:42 UTC**, başlangıçtan **76,56 dk**; tüm yerel UI temizliğinin doğrulama kaydı daha sonradır. Yeni Play son sınırdan sonra başlatılmadı fakat toplam duvar sınırı aşıldı; başarılı bütçe uyumu denmez. Geçici probe sıfırlamaları nedeniyle tüm koşuyu kapsayan tek kalıcı token-POST sayacı saklanmadı; **40 POST toplamı için tam kapanış kanıtı UNPROVEN**. Kayıtlı HTTP200 örnekleri tüm olası isteklerin sıfır hatalı olduğu iddiasına dönüştürülmez.

Kapanışta iki test tarayıcısı **No throttling**, cache eski ayarında; **YT V1 slow 20260911** profilleri kaldırıldı, geçici gözlemler kaldırıldı, DevTools kapatıldı ve doğru Profile hesapları/no player doğrulandı. Provider **20→20** aynı asset seti, M1/M2/testt ready/JWT, zincirde **7** aynı ACTIVE publication. Growth fatura ekranı taze **100 USD / overage0**; gecikmeli/yuvarlanan toplamlar gerçek ek maliyeti kanıtlamaz. Kamu yüklemeleri kapatılmadı. Yeni asset/publication/upload/withdrawal, Git/CI rerun/deploy/config veya manuel D1 yazımı **0**.

**Kanıt:** aynı yerel dizinde authorization/authorized-package, browser-versions, brave-device-before, iki payment-final/payment-verified/identity, chain/device/provider-before/after, actual-renditions-before, chrome-result, edge-result, edge-progress-measurements, user-pause-confirmation, cleanup, billing-after, checks/receipt. Geçici **probe.js** için stdlib doğrulaması gerçek yanıtın değişmediğini, iki kalite hızının ayrıştırıldığını, token/izin dışı stringlerin kanıta girmediğini ve cleanup'ın yöntemleri geri koyduğunu kontrol etti. Bu **LOCAL_TEST**, canlı test başarısı değildir. Gerçek UI/chain/oynatma **PREVIEW**, provider GET/fatura **PROVIDER**; tüm sayılar bu ayrımla tutuldu. Diğer **273** dosya, HEAD/index/status ve eski belge bölümleri korundu; uygulama/docs build tekrar edilmedi.

**Kapanmayan maddeler:** son Edge yavaş tekrar, temiz ve ağ etkisini ayıran Auto geçişi, eksiksiz istek sayacı ve duvar süresine uyum. Kullanıcı bunları kabul etmiş sayılmaz. **Tek sonraki gate VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_DIAGNOSIS:** var olan kayıtlardan tampon/cache/ölçüm yöntemini salt-okunur teşhis edip yalnız eksik kabul için somut paket hazırlamak. Yeniden ödeme yok; ek canlı izleme/harcama bütçesi bu kayıtla verilmez. Uzun/sınır gate'i başlamadı; genel Video V1 **NOT_COMPLETE**.

## 38. Salt-okunur tampon / sayaç teşhisi — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_DIAGNOSIS: PASS / LOCAL_STATIC + LOCAL_TEST.** Kapsam iki ana belge ve **tmp/video-public-testnet-browser-slow-network-diagnosis-20260911/**. Yeni tarayıcı açma/oynatma, token veya HLS çağrısı, ödeme/imza/upload, provider/NEAR/D1 yazımı, source/config/feature flag veya Git/yayın değişikliği yapılmadı. Amaç önceki koşunun nedensel kanıt sınırını ve ölçüm kusurlarını ayırmaktı; gerçek kabul §37 hâlâ **NOT_COMPLETE**.

Exact main **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6** yeniden okundu. Lock ile yerel sürümler **@livepeer/react4.3.6 / core3.3.1 / core-web5.2.6 / hls.js1.6.16** aynı. Player dosyası root ile aynı; playback ve lock'taki eski root farkları korunup main kopyası incelendi. Kayıtlı Web artifact'indeki **a4634e51-c8db239b570132c0.js** içinde otomatik yükleme ve üç tampon varsayılanı, watch bundle'ında player-size cap bulundu. Bu artifact'in serving eşleşmesi önceki koşunun kanıtıdır; yeni canlı test veya yayın iddiası yok.

| Teşhis | Kanıt ve doğru yorum |
| --- | --- |
| Auto sabit 360p'ye kilitlenmiş görünmüyor | App `videoQuality="auto"`; Livepeer `setQuality` Auto için `currentLevel=-1`. `capLevelToPlayerSize=true` ayrıca var; gerçek element/DPR/aktif seviye geçmişi kaydedilmedi. |
| `preload=metadata` yeterli bir yükleme sınırı değil | SDK HLS'e attach/load yapıyor; HLS varsayılan `autoStartLoad=true` ile `startLoad` çağırıyor. HTML preload etiketi bu yolu durdurmuyor. |
| 30 saniye ileri tampon tavanı değil | Varsayılanlar **30 sn /60.000.000 bayt /600 sn**. Kaynak `min(max(8×byte bütçesi/bitrate,30),600)` kullanıyor. M2'nin bildirilen bit hızlarıyla **146,984 sn (720p)** ve **469,960 sn (360p)** hedefi hesaplanıyor. Canlı seçilen bitrate ve segment boyutları ölçülmedi; bu hesap örneği mutlak buffer garantisi değildir. |
| Edge ağ karşılaştırması tamponla karışmış | **190,901625+409,131708=600,033333 sn**; bilinen player süresi **600,043 sn**. Yavaş ağdan önce içerik neredeyse sona kadar yüklenmişti. Daha sonra eski tamponun 360p oynatılması yeni ağın o kaliteyi seçtiğini kanıtlamaz. |
| Cache kök nedeni kesin değil | HTTP cache kapatılmamıştı; cache hit/gerçek wire byte ve istek timing'i saklanmadı. “Cache etkisi dışlanmadı” denebilir, “neden kesin cache” denemez. |
| Chrome pause olayları kullanıcıya ait | Kullanıcı beyanı korunur. Aynı oyuncuda sonraki170sn/360p gözlemi tek başına uygulama veya provider hatası değildir; yüklenen/oynatılan seviye ve byte zamanlaması eksik. |
| Eski sayaç hata ve limit durumlarında güvenilir değil | Yerel fake fetch: reddedilen **1 istek /0 kayıt**; **20** sınırında **21. istek gönderildikten sonra** pause; dispose/yeniden kurulumda **21→0**. Bu, gerçek toplam40'ın aşıldığına dair yeni canlı kanıt değildir. |
| Global bitiş kontrolü eksik | Yerel490sn alarmı ilk Play'den başlıyor; hazırlık/navigasyon/temizliğin tek deadline'ı yok. Pause token yenilemesini ve HLS ön yüklemesini tek başına bitirmiyor. Önceki75dk/76,56dk sınır aşımı tarihsel gerçek olarak kalır. |

**Karar:** Uygulama tamponunu, sağlayıcıyı veya ABR algoritmasını değiştirecek kanıt yok. Önce ölçüm aracı ve deney düzeni düzeltilir. Yedi gerçek SDK ilk görüntü değeri, HTTP200/yenileme örnekleri, iki FINAL satın alma, korunmuş hak/cihazlar ve kapalı çekim/maliyet-hız kabulü geçerli tarihsel kanıt olarak tutulur; tekrarlanmaz. Önceki17dk izleme hesabı yeni bir tam koşu sayacı değildir; 40POST kapanış kanıtı eksikliği giderilmiş sayılmaz.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_MEASUREMENT_PREFLIGHT** yerel hazırlıktır. Değişebilir kapsam yalnız geçici gözlem/controller/test dosyaları ve iki belge. Tek run ledger reset/navigasyonda korunmalı; istek gönderilmeden sınır ayrılmalı, hata/retry sayılmalı, N+1 dışarı gönderilmemeli. Mutlak deadline bir kez kurulmalı; kullanıcı/araç beklemesi ve hazırlık sayılmalı. Bitişte yalnız pause değil, player route'undan çıkış ile HLS/yenileme de durmalı; timer handle ve temizlik payı korunmalı. Sayısal/redacted export token/JWT/private key taşımamalı. Yerel limit, ağ hatası, reset, navigasyon, background/pause, cleanup ve redaksiyon kontrolleri PASS olmadan yeni canlı onay istenmez. Bu gate mevcut döngü yetkisiyle yürür; source/dependency/refactor veya canlı işlem yetkisi içermez.

Gelecek **VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_REMAINING_ACCEPTANCE** için yalnız öneri: aynı M2, Chrome/utick2 ve Edge/soteri, **0 yeni ödeme/upload/imza/cihaz/asset**. En çok **3 başlangıç**: iki kesintisiz, ağ etkisini ayıran Auto döngüsü ve eksik Edge yavaş tekrar. Test sekmelerinde HTTP cache geçici kapalı, cookies/IndexedDB aynen; cache/service-worker yanıtları wire kanıtı sayılmaz. Kontrollü yüksek indirme **8 Mbps**, düşük **1,6 Mbps**; ikisinde upload **0,8 Mbps**, latency **150 ms**. HLS yukarı geçiş payı **0,7** ve gerçek ölçüm belirsizliği için yüksek profile marj bırakıldı; bu sayılar actual transfer kanıtı değildir. Her geçiş öncesi gerçek ileri tampon **≤45 sn**, kalan medya henüz tamamen yüklenmemiş ve faza ait gerçek segment byte/süre/status/cache bilgisi mevcut olmalı; değilse durulur. Manual quality, seek, buffer flush veya runtime HLS ayarıyla başarılı sonuç zorlanmaz.

Önerilen yeni sınırlar: planlı yaklaşık **495 sn**, en çok **12 izleyici-dakika**, **30 dk toplam duvar /22'de ölçüm sonu +8 dk temizleme**, tarayıcı başına **20**, toplam **40** token denemesi; **1 USD** provider kullanım gözlem eşiği, sert fatura tavanı değil. Bunlar **onaylanmadı** ve yerel hazırlık geçmeden çalıştırılabilir paket sayılmaz. Yeni imza/ödeme açılmaz; mevcut session/hak hazır değilse ödeme yapmak yerine durulur.

Kanıt: **report.md**, **source-parity.json**, **artifact-buffer-config.json**, **replay-diagnosis.mjs/replay-result.json**, **next-gate-package.json**, **proposed-run-package.json**, **checks.json/receipt.json**. Replay'de gerçek fetch/browser kullanılmadı; yalnız **LOCAL_TEST**. Diğer **273** dosya, HEAD/index/status ve eski belge bölümleri korundu; iki belge diff/boşluk kontrolü geçti. Uygulama/docs build, CI rerun veya yeni canlı test yok; önceki docs bağlantı bulgusu korunur. Teşhis engeli yok; gerçek Auto/son Edge tekrarı ve genel Video V1 **NOT_COMPLETE**.

## 39. Kullanıcı kabulü — tarayıcı/yavaş ağ aşaması kapandı

**VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_ACCEPTANCE: COMPLETED_WITH_WARNINGS — KAPANDI.** Kullanıcı **“Bence bu testlerde yeterli dostum, ne dersin?”** diye değerlendirme istedi. Yalnız tarayıcı/yavaş ağ aşamasını kontrollü ilk testnet sürümü için uyarılarla kapatma, Auto/eksik Edge örneği/ölçüm aracı bulgularını erteleme önerisine **“önerdiğin gibi yap.”** talimatıyla açık kabul verdi. Bu karar gerçek ölçümleri değiştirmez veya genel Video V1'in kalan testlerini kapatmaz.

Kabul temeli: **7** SDK ilk görüntü örneği; Chrome normal **805/252 ms**, yavaş **254/253 ms**, Edge normal **243/251 ms**, yavaş **10718 ms**, son tekrar **EXTERNAL_NOT_RUN**. Edge aynı oyuncuda **449,965271 sn** ilerledi; gerçek normal/yavaş/token yenilemeleri kaydedildi. İki FINAL satın alma toplam **4 testUSDC /0,0016833939773628 testNEAR**, korunmuş hak/cihazlar, **20→20 asset /7 aynı ACTIVE publication**. Bunlar önceki koşunun ayrı PREVIEW/PROVIDER kanıtlarıdır; bu belge kapanışı yeni canlı doğrulama sayılmaz.

**Uyarı olarak ertelenenler:** ağdan kaynaklanan Auto geçişi/720p toparlanma ve tampon/cache ayrımı; son Edge yavaş tekrar; kullanıcı pause'ları nedeniyle eksik kesintisiz Chrome koşusu; başarısız çağrı, sınır ve reset sayaç kusurları (**1→0 /20→21 /21→0**) ile tam40POST sayımı; yaklaşık17dk izleme hesabının sınırı; temizlik dâhil75dk duvar aşımı (**76,56dk network/probe temizliği**); gerçek ek maliyetin gecikmiş/yuvarlanan provider toplamlarıyla kanıtlanamaması. Bunlar çözülmüş, ölçülmüş veya ürün/sağlayıcı arızası kanıtlanmış sayılmaz. Gelecekte başka bütçeli testte sayaç ve durdurma ön şartları yine uygulanır; bu kabul güvenlik/harcama sınırlarını kaldırmaz.

§38'de önerilen **VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_MEASUREMENT_PREFLIGHT** ve **VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_REMAINING_ACCEPTANCE** artık bu aşamanın zorunlu gate'leri değildir: **DEFERRED_BY_USER_ACCEPTANCE**. Onaysız12 izleyici-dakika/30dk/1USD taslağı başlatılmaz. Eski receipt/progress ve iki taslak paketin baytları **tmp/video-public-testnet-browser-slow-network-acceptance-20260911/user-acceptance-closeout/archive/** altında korundu. Güncel receipt **kullanıcı kabulüyle kapanmış** ve **teknik kanıt eksikleri devam ediyor** durumlarını ayrı alanlarda tutar.

Bu tur yalnız iki ana belge, yerel receipt/progress ve ertelenmiş paket durumları güncellendi. **LOCAL_STATIC:** sayısal kanıt alanları, eski belge bölümleri, diğer **273** repo dosyası ve HEAD/index/status korundu; explicit-path diff/boşluk kontrolü PASS. Yeni uygulama/docs testi, tarayıcı oynatma, Git/CI/deploy, ödeme/çekim/yükleme/imza veya provider/NEAR/D1 işlemi **0**. Önceki kaynak ve canlı kanıt sınıfları değişmez.

Bu aşamanın kapanış engeli yok. **Tek sonraki gate VIDEO_PUBLIC_TESTNET_LONG_BOUNDARY_PREFLIGHT**; uzun içerik/5GB/sınır paketinin yerel ve salt-okunur hazırlığı, bu tur başlamadı. Büyük dosya, kapasite, dayanıklılık, eski beta ve nihai kabul açık kalır. Çekim PASS ve maliyet/hız KAPALI korunur; genel Video V1 **NOT_COMPLETE**. Kullanıcının mevcut sıralı ilerleme yetkisi devam eder, yeni canlı işlemler mevcut onay sınırlarına bağlıdır.

## 40. Tek 5GB / 120 dakika yükleme paketi

**VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PREFLIGHT: COMPLETED_WITH_WARNINGS.** Kullanıcının yalnız büyük dosya isteği, önceki geniş LONG_BOUNDARY önerisini tek birleşik L/B koşusuna daralttı. Plan §30 ve **tmp/video-public-testnet-long-upload-preflight-20260911/action-package.json** yürütme paketidir. Yazılabilir kapsam iki ana belge ve bu yerel dizin; uygulama/config/Git/deploy yok. Eski kullanıcı kabulüyle kapanmış browser/maliyet ve tamamlanmış çekim yeniden açılmaz.

**Kaynak / LOCAL_TEST:** **video-v1-120min-5GB.mp4**, **5.000.000.000 bayt**, **7200,008008 sn video /7200 sn ses**, **H264 1280×720 + AAC**. 60sn sentetik klip tekrarı; **4.999.746.741 bayt MP4 +253.259 bayt geçerli free atom (%0,00506518)**. Son karenin8ms farkı ve dolgu açıkça kayıtlı. **215.886 kare**, tam çözümleme **exit0 /0 hata**; SHA256 **23cbfff37942c0f8a6cf885f2a2a72273739859c69af9f656ea778cdac2cca05**. Lokal5GB dosya üretmek veya çözümlemek gerçek5GB upload kanıtı değildir.

**Salt-okunur başlangıç:** exact main **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**, upload/form/contract/provider-verification dört dosya eşleşti. PREVIEW chain/runtime public OPEN ve aynı sürümler,7 ACTIVE publication; PROVIDER20asset. Brave/soteri,35,98testUSDC,1/2 günlük upload ve0 aktif rezervasyon. Provider Billing görünen Growth100USD/overage0; transcoding21/storage114/delivery0dakika. Fatura göstergesi gecikmiş olabilir; bu testin gerçek ek maliyeti henüz yok.

**Henüz onaysız canlı paket:** soteri/Brave, tek yeni job/asset, en çok1 yayın ve1 ödeme; bilet fiyatı2testUSDC, satın alma0. **1,60testUSDC (1,50+0,10 sponsor)**, beklenen35,98→34,38; kullanıcı tek sponsor delegate imzası, mevcut cihaz korunur. Yürütme başlangıcından **4saat /230dk ölçüm+10dk kapanış**; **0,10testNEAR /5USD ek kullanım gözlem eşiği**, sert fatura tavanı değil. Başarılı asset tutulur; işleme/depolama tarayıcı kapanınca bitmiş sayılmaz. Önceki hıza göre yaklaşık112dk aktarım tahmini; retriesiz150adet32MiB PATCH, son389.632bayt. Gerçek süre/baytlar ayrıca ölçülür.

Kabul üç ayrı sonucu saklar: **aktarım** (doğrudan son TUS offset5.000.000.000), **provider** (ready/size/duration ve varsa hash), **yayın** (aynı iş için NEAR Published/ACTIVE ve Discover). Tek ödeme/asset, değişmeyen24saat son tarih ve önce/sonra bakiyeler gerekir. **64 küçük resim** doğrulama sınırı nedeniyle120dakika yaklaşık720referans üretirse yayın engellenebilir; bu tahmin gerçek uzun asset çıktısı değildir. Provider ready ve UI100% tek başına tam kabul sayılmaz. Hata/limit/şüpheli ödeme halinde aynı iş korunur, ikinci ödeme veya upload başlatılmaz; güvenlik doğrulaması atlanmaz ve kaynak değiştirilmez.

**Doğrulama:** media-manifest, ffprobe/tam decode, kaynak paritesi, paket sayıları ve dosya koruma checks/receipt kayıtları. İki belge dışındaki273repo dosyası/HEAD/index/status korunur; eski testler/CI/docs build tekrarlanmadı. Yeni ödeme/yükleme/imza/canlı veri yazımı0. Canlı **EXTERNAL_NOT_RUN / UNPROVEN**. AGENTS.md gereği yeni ödeme/provider bütçesi onayı gereken tek engeldir; sonraki **VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_ACCEPTANCE** yalnız bu onayla başlar. 5GB+1/container/uzun izleme/kapasite/diğer gate'ler bu isteğe eklenmez; koşu sonunda durulur.

## 41. Tek gerçek 5GB / 120 dakika yükleme — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_ACCEPTANCE: YÜRÜTÜLÜYOR.** Kullanıcı önceki tek koşu paketini **“onaylıyorım”** yanıtıyla onayladı. Yetki: Brave/soteri, tek yeni job/asset,1,60testUSDC (1,50+0,10sponsor),0,10testNEAR ve5USD ek kullanım gözlem eşikleri;240dk duvar (230ölçüm+10kapanış),0 izleyici-dakika. Sert fatura tavanı yok; bilinen64küçük resim riski saklı değil. Başlangıç **19:23:39 UTC**, ölçüm sonu **23:13:39**, tüm duvar sonu **23:23:39 UTC**. Yazılabilir kapsam iki ana belge ve **tmp/video-public-testnet-long-upload-acceptance-20260911/**; kaynak/config/Git/deploy yok.

Salt-okunur başlangıç: main **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**, Bridge/read-model aynı; public OPEN, aktif rezervasyon0, soteri günlük1/2,35,98testUSDC;7yayın ve20provider asset. Tam5.000.000.000bayt/hash/tam çözümleme önceki hazırlık kanıtıdır; browser cover video **7200,008008sn /readyState4 /error null**, paused. Yeni normal UI işi **lp-7d7e1b4e-0674-4db9-9377-3e9d4918224c**; bilet2testUSDC, satın alma0. Önceki doğrulanmış redacted TUS gözlemi değiştirilmeden yeniden kullanıldı; hazır kaydı **19:28:09.887 UTC**. Native pencere odağında sorun için kullanıcı desteği alındı; doğru İş/soteri sekmesi sonrasında doğrulandı.

**Tek Pay tıklaması**, UI **1,50+0,10=1,60testUSDC** ve Meteor sponsor delegate ekranı açıldı. Cüzdan imzası kullanıcıya bırakıldı; agent imza yapmadı. Bu ara kayıt ödeme FINAL veya upload başarısı değildir. İmza sonrası aynı işin ödeme/gerçek TUS son offset/provider byte-süre/işleme/NEAR yayın ve katalog sonuçları ayrı uzlaştırılacak. İkinci ödeme/yükleme, key/cihaz değişimi, başka test veya otomatik sonraki gate yok. Kanıt authorization/before, chain/runtime/provider-before, job-identity, browser-prepared, console-probe ve execution-progress.

**İmza sonrası ilk canlı kanıt:** Kullanıcı cüzdan adımını tamamladıktan sonra normal akış ilerledi. FINAL blok **268139543**'te aynı iş Authorized, fee1.600.000microUSDC ve expected_source_bytes5.000.000.000; soteri35,98→34,38testUSDC, soteriNEAR aynı. Relayer bakiye düşüşü **0,001050492684599900000001testNEAR**; bu bakiye farkıdır, ayrı işlem hash/receipt henüz yakalanmadı. **19:28:46.694 UTC** intent201/createdtrue/generation1; TUS SHA256 **051a21adcd53f14c49673a3e05d93007ad70156a051f424e6cce67ef1b169237**. HEAD200 length5.000.000.000/offset0; ilk8PATCH204 toplam268.435.456bayt, capture/HTTP hata0. Provider **20→21**, yalnız yeni **f0bac775-7bc3-4956-b716-525e12194b1f**, aynı job/g1 adı, JWT veuploading; önceki20ID korunuyor. İşleme/yayın bekleniyor; ödeme yeniden denenmedi.

**Aktarım tamamlandı — 11 Eylül 21:25:16.639 UTC /12 Eylül 00:25:16.639 İstanbul:** TUS HEAD200 length5.000.000.000/offset0; **149×33.554.432+389.632=5.000.000.000 bayt**, **150 PATCH204**, kesintisiz artan offset ve tek aynı TUS hash. TUS/HTTP aktarım hatası, capture hatası ve gözlenen yeniden gönderim0. HEAD yanıtından son PATCH yanıtına **6.988.913ms /116,481883dk /5,723351Mbps**; hazırlık/cüzdan süresi bu ölçüme dahil değil. Yerel kaynak yükleme sonrası aynı SHA256 ve boyutta. **Aktarım PASS**; 120dk provider/yayın kabulü henüz kapanmadı.

İşleme geçişinde normal otomatik kontrol **7×409/provider_state_invalid**, UI Publication verification blocked; ardından aynı job/generation için **2×200/PROCESSING**. Manuel retry/ikinci Pay0; ilk intent201 dışında yeni asset yok. Provider **21:31:08 UTC** processing/progress0,18; size/duration henüz yok. Bu geçiş hatası64küçük resim sınırını kanıtlamaz; çıktı hazır değil. Profile'a tam navigation ile istemci kontrol döngüsü/geçici probe durduruldu; soteri oturumu geri geldi. Ücretli iş ve dosya korunur, provider/runtime yalnız salt-okunur izlenir. Kanıt transport-result/tus-records/source-after-upload/processing-transition/provider-processing kayıtlarıdır.

**Nihai sonuç — 12 Eylül 2026 İstanbul: BLOCKED (yayın kabulü). İstenen büyük dosya yükleme/işleme testi PASS.** İş **lp-7d7e1b4e-0674-4db9-9377-3e9d4918224c**, asset **f0bac775-7bc3-4956-b716-525e12194b1f**, generation1 korunur.

| Kanıt sınıfı / aşama | Sonuç |
| --- | --- |
| LOCAL_TEST / kaynak | Yükleme sonrası aynı **5.000.000.000 bayt /SHA256 23cbfff37942c0f8a6cf885f2a2a72273739859c69af9f656ea778cdac2cca05**. Önceki tam çözümleme tekrarlanmadı; 8ms son kare farkı ve 253.259 bayt free atom açıklaması geçerli. |
| PREVIEW / aktarım | **PASS:** HEAD200; **149×33.554.432+389.632=5.000.000.000**, **150 PATCH204**, tek TUS hash, artan offset; TUS/capture hata0, gözlenen retry0. HEAD→son PATCH **116,481883dk /5,723351Mbps**. Hazırlık/imza dahil değil; p95/genel hız kabulü değildir. |
| PROVIDER / işleme | **PASS:** **11 Eylül22:07:18.166 UTC** ready; ilk okuma22:07:28.512. API size **5.000.000.000**, MP4 duration **7200,008008sn**, bitrate5.546.427, JWT. Son TUS→ready **42,02545dk**. Provider hash alanı yok; bağımsız provider hash eşleşmesi **UNPROVEN**. |
| PREVIEW / ödeme | FINAL chain aynı iş fee **1.600.000microUSDC**, soteri **35,98→34,38**. Sonraki bakiyeler aynı; soteri/utick2/operator NEAR farkı0, relayer **0,001050492684599900000001testNEAR** düşüşü. Ayrı işlem hash/receipt yakalanmadı; bakiye farkı kesin işlem ücreti diye sunulmaz. |
| PREVIEW / yayın | **BLOCKED:** Son okumada Authorized/publication null; katalog **404/not_found**. Koşunun Bridge gözleminde **11 provider_playback_mismatch**. Bilinen64küçük resim tavanı aday nedendir; gerçek uzun VTT/referans sayısı okunmadı, kesin neden **UNPROVEN**. |

İlk geçişteki **7×409/provider_state_invalid →2×200/PROCESSING** ayrı geçici bulgu olarak korundu. Yeni yükleme normal akışta **işe özel24saatlik upload anahtarı** üretir; eski M2 iş anahtarı veya kalıcı tarayıcı cihaz anahtarı değildir. Ön hazırlıktaki “yeni key yok” ifadesi cihaz değiştirmeme sınırıdır; yeni işe ait yetki onaylı normal yüklemenin parçasıdır. Aynı işin key/created_at/expiry/generation değeri ödeme sonrası değişmedi, key replacement retry yok. Cihaz sicili karşılaştırması tekrarlanmadı; cihaz değiştirme/çıkarma işlemi yapılmadı.

Provider **20→21**, yalnız1 yeni asset; eski20ID ve üç korunan ready/JWT asset aynı. Zincirdeki **7 publication** birebir korundu. Public **OPEN**, aktif rezervasyon0; soteri aynı UTC günde2/2 upload. Son Billing **Growth100USD /overage0**, transcoding21/storage114/delivery0 sayaçları yeni120dk asset'e rağmen aynı: gerçek ek maliyet **UNPROVEN**. 5USD gözlem eşiği sert tavan değildir; hazır asset saklandı.

**Kapanış:** Profile/soteri; **22:09:38 UTC** probePresent=false, videoElements0. Console filtresi eski **MEDIA_RACE**, DevTools kapalı; kullanıcı önceki sekmesine döndü. Üç sunucu gözlemi kapandı. Son canlı okumalar yaklaşık **22:11 UTC**; başlangıç19:23:39 UTC, 230dk ölçüm/240dk toplam sınırları geçilmedi; kesin bitiş/duvar hesabı receipt'te. İkinci ödeme/yükleme, manuel retry, oynatma, source/config/Git/CI rerun/deploy veya D1 yazımı0. Eski testler yeniden çalıştırılmadı; iki belge dışındaki273dosya/HEAD/index/status koruması checks.json ile doğrulanır.

Kanıt **tmp/video-public-testnet-long-upload-acceptance-20260911/**: transport-result/tus-records, source-after-upload, provider-result/provider-final, payment-confirmed/final/publications-final/catalog-final, processing-transition/server-events, billing-final/cleanup, checks/receipt. **Tek engel yayın doğrulaması**; aynı ücretli iş ve dosya korunarak duruldu. Önerilen **VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PUBLICATION_DIAGNOSIS** otomatik başlatılmaz. 5GB+1, diğer container, uzun izleme, kapasite veya diğer kalan maddeler bu testle kapanmaz; kapalı maliyet/hız, tarayıcı ve çekim kabulü korunur.

## 42. Büyük dosyanın yayın doğrulaması teşhisi — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PUBLICATION_DIAGNOSIS: PASS.** Kullanıcı mevcut işin yayın doğrulamasını teşhis etme önerisine **“önerdiğin gibi yap.”** dedi. Kapsam iki ana belge ve **tmp/video-public-testnet-long-publication-diagnosis-20260912/**; aynı iş/asset, salt-okunur metadata ve metin listeleri, ardından yerel tekrar. Uygulama/config/Git/CI/deploy, ödeme, yeniden upload ve canlı yayına yazım yok.

**PREVIEW / kaynak bağı:** GitHub main **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**, Bridge **9de194b6-8951-4b8e-83dc-c19e249877e8**, read-model **098e8ad0-6e7c-4fda-93f2-eb69587c76f6** aynı. Doğrulayıcı/üç bağımlığı/profil kaydı kökle eşleşti. index.ts içindeki mevcut kök farkı korundu; çağrılar exact-main kopyasından okundu. Aynı iş **lp-7d7e1b4e-0674-4db9-9377-3e9d4918224c**, asset **f0bac775-7bc3-4956-b716-525e12194b1f**; önce/sonra job, bakiyeler ve7publication değişmedi. Provider21asset ve hedef ready/5.000.000.000bayt/7200,008008sn korunur.

| Kanıt | Sayısal sonuç |
| --- | --- |
| PROVIDER / metadata GET | **2** çağrı: proje, token adı, creator/job/generation bağı ve asset adı doğru; ready/JWT,5GB; playback vod/JWT, geçerli1HLS+1VTT adresi. |
| PROVIDER / yalnız metin GET | **4 HTTP200 /68.510 bayt**: master, iki media playlist ve VTT. Mevcut provider anahtarıyla yalnız bu playbackId için **1 adet180sn okuma JWT'si** bellekte üretildi; wallet imzası0, token/özel anahtar diske yazılmadı. Video segmenti/küçük resim görüntüsü GET0, oynatma0. Runtime/zincir durum okumaları ayrıca kayıtlıdır. |
| HLS | **640×360 ve1280×720**; her listede **720 segment**, ENDLIST ve toplam **7200,029sn**. Görüntüler oynatılmadı; bu yeni playback/kalite kabulü değildir. |
| VTT | **35.178 bayt /720 cue /720 benzersiz referans /fragment çıkarılınca da720 ayrı kaynak**; tüm adresler mevcut izinli biçimde. VTT SHA256 **ba1f3a5fd773859de0baa0cefdb5c72af1586949d3ff72051860e20a6d1a6889**. |
| LOCAL_TEST / gerçek veriyle tekrar | Aynı doğrulayıcı **vttThumbnailUrls** içinde **65. referansta provider_playback_mismatch**; resim denetimi başlamadan red (**0 thumbnail probe**). Ayrı sınır kontrolleri **64 PASS /65 red**. |
| LOCAL_TEST / neden ayırma | Yalnız yerel VTT girdisi64referansa azaltıldığında aynı tam doğrulayıcı geçiyor. Bu üretim çözümü değildir; kalan656kaynağı atlama izni vermez. Anonim erişim retleri bu tekrarda **simüle edildi**; bütün720görüntünün canlı koruma kabulü açık kalır. |

**Doğrulanmış engel:** `provider-verification.ts:7` üzerindeki64tavanı, aynı dosyanın **241–250** arasındaki toplama döngüsünde65'te reddediyor. Kaynak SHA256 **8f6b7f2b7bc039edb5be1373534f29d3576eb594f3675bd9cd25c21fbc5cb607**. Yerel adapter yalnız private yardımcıları export eder; asıl kaynak baytları değişmedi. Gerçek720liste bu sınırı zorunlu olarak aşar. Canlı gözlemdeki hata koduyla uyumludur; diğer olası güvenlik/medya kontrolleri geçti diye genellenmez. Önceki geçici **7×provider_state_invalid →2×PROCESSING** bulgusu ayrı tutuldu.

**Sonraki kaynak paketi — henüz uygulanmadı:** **VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PUBLICATION_VERIFICATION_SOURCE**. Tüm720referansın denetimini mevcut iş takibinde sınırlı gruplarla tamamla;64referans/adım seçilirse **12 adım (11×64+16)** gerekir, ek HLS/metadata istekleri de bütçeye dahildir. Bu tur720canlı probe'nun süre/istek bütçesi ölçülmedi; yalnız sabiti64→720 yapmak önerilmez. Kısmi ilerleme yayın izni vermemeli; job/generation/asset/ready sürümü/profil/VTT özeti değişirse eski kanıt kullanılamamalı. Geç gelen açık erişim, ağ hatası, restart/retry ve son tarih kontrolleri korunur. Aynı ortak doğrulayıcı **ilk ready webhook** ve **yayın sonrası reconcile** yolunda kullanılıyor (exact-main index.ts1824/3285/6691); ikisi de kapsanmalı. Yeni servis, sağlayıcı değişimi veya ikinci upload gerekçesi üretilmez.

Aday dosyalar ve yeni720örneği, geç erişim ihlali, kısmi devam, veri değişimi ve N/N+1 bütçe testleri **next-source-package.json** içinde. Kaynak uygulaması, Git/yayın ve mevcut işin canlı kurtarılması bu teşhisle yapılmadı; orijinal24saat süresi geçerse otomatik yeniden ödeme/yükleme yok.

Kanıt **source-parity, metadata-report/fixture, lists-report/documents-fixture, replay-result, runtime-before/after, provider-after, next-source-package, checks/receipt**. Yeni yerel tekrar ağ kullanmadı; mevcut uygulama testleri/CI/docs build tekrarlanmadı. Diğer273dosya/HEAD/index/status ve eski gate kayıtları koruma kontrolüyle saklanır. **Teşhis kapandı; yayın engeli sürüyor.** Kullanıcının bu dar isteği sonunda duruldu.

## 43. Büyük dosya doğrulamasının sınırlı adımlara bölünmesi — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PUBLICATION_VERIFICATION_SOURCE: PASS / LOCAL_STATIC + LOCAL_TEST / NOT_DEPLOYED.** Kullanıcı ortak doğrulayıcıyı düzeltme önerisine **“önerdiğin gibi yap.”** dedi. Base main yeniden doğrulandı: **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**. Dirty kökü değiştirmeden arşivden **tmp/video-public-testnet-long-verification-source-20260912/candidate/** hazırlandı; 278base dosyasından yalnız **6** dosya değişti. Kökte yalnız bu iki plan/kabul belgesi yazılır; Git, ayarlar, feature flag, provider, NEAR/D1 ve canlı yayın kapsam dışıdır.

**Uygulama:** provider-verification.ts, media-provider.ts, livepeer-provider.ts ve index.ts. Testler mevcut provider-verification.test.ts ve finalize.test.ts içinde; index.test.ts yardımcılarını çoğaltmak yerine mevcut yayın testi altyapısı kullanıldı. Yeni servis/dependency veya tablo yok. Ortak sonuç “tam doğrulandı” ya da yalnız hash/konum/başlangıç zamanından oluşan kısmi kayıt döndürür; bu kayıt mevcut job içinde saklanır ve mevcut alarm yolundan devam eder.

| Sınır / davranış | Kaynak ve yerel kanıt |
| --- | --- |
| Adım | En çok **64 küçük resim denetimi**, metadata dahil **256 mantıksal istek**, **30sn** bütçe; her dış okuma en çok5sn. Yeni resim isteğine başlamadan tam5sn pay ayrılır. Yetkili HLS/VTT metni başına **512KiB** sınırı; provider metadata yönlendirmeleri takip edilmez. |
| Toplam liste / kanıt ömrü | En çok **1024 benzersiz referans**, bir denetim turunun kanıtı en çok **10dk**. 720örneğini kapsayan bilinçli tavan; daha büyük liste için ayrı bütçe incelemesi gerekir. |
| Değişmezlik | Hash job/generation/asset/ready sürümü/profil/metadata/HLS/VTT içeriği ve tüm referanslara bağlı. Liste/sürüm değişimi veya eski/bozuk kısmi kayıt reddedilir; kısmi kayıt temizlenip mevcut gecikmeli yeniden denemeye dönülür. Sessiz hızlı başa sarma yok. Geçici ağ hatasında son güvenli tamamlanmış adım korunur. |
| Yayın ve sonraki kontrol | İlk ready olayı ve yayın sonrası reconcile aynı yolu kullanır. Kısmi kayıt **READY_VERIFIED/finalize/HEALTHY** sayılmaz. Tamamlanınca kısmi kayıt silinir. Mevcut job kimliği/durumu ve orijinal24saat süre, ağ okumaları sonrasında da kontrol edilir. |
| İptal | İptal aynı işlem sırasını kullanır; CANCELLED için geç ready olayı provider çağrısı yapmadan yok sayılır. İptal/son tarih son adımda değişirse yayın oluşmaz. |

**Test kanıtı:** Önce eski64sınırında **3 yeni regresyon FAILED** olarak kaydedildi. Son kaynakta **8 dosya /378 test PASS, 3 mevcut opt-in test SKIPPED**; **113 provider-canary testi PASS**. TypeScript **PASS**; Wrangler **deploy --dry-run PASS**, bundle **839,82KiB /gzip172,37KiB**. Bu yalnız yerel derlemedir; çalışan Worker değişmedi. Opt-in100k/1k yük senaryoları, Web/contract testleri ve eski browser/maliyet testleri tekrarlanmadı.

Gerçek5GB/120dk işten kaydedilen metadata +HLS +VTT fixture'ı aday kodla **12adım**, ilk11adım64'er ve son16 olmak üzere **720denetim** geçti; sonuç verifiedSourceBytes **5.000.000.000**. Tam adım **88**, son adım **40**, bütün adımlar toplam **1008 mantıksal mock istek**; tek dış istek/gerçek oynatma yapılmadı. Anonim retler simüle edildiği için bu yeni canlı koruma veya maliyet kanıtı değildir.

Regresyonlar: nesne yeniden oluşturulurken devam; ilk yayında yalnız son adımda tek finalize; yayın sonrası tamamlanmadan HEALTHY olmama; son resimde açık erişim/503; VTT ve ready sürümü değişimi;10dk kanıtın son adımda dolması;30sn dolmadan devamı bırakma/N+1denetimi göndermeme; büyük VTT gövdesi; orijinal job süresi ve iptal yarışı. Kök neden ve iki çağrı yolu aynı düzeltmeyle kapsandı.

**Sınırlar ve canlı kabul:** Kısmi yayın sonrası denetim sırasında reconcile durumu **PROVIDER_UNKNOWN** kalır; HEALTHY şartı arayan token yollarında geçici ret oluşabilir. Gerçek gecikme, çağrı/maliyet bütçesi ve canlı kurtarma sonucu **UNPROVEN**; bunlar yayın paketinde ölçülmelidir. Güvenlik denetimini atlayarak bu pencere gizlenmedi. Tüm720referansın gerçek erişim denetimi ve mevcut işin Published/ACTIVE olması henüz kanıtlanmadı. Önceki geçici provider_state_invalid ve kapalı maliyet/hız/browsers gate'lerindeki ertelemeler korunur.

**İnceleme paketi:** **source.patch** SHA256 **8ddb80042d460ee4aee748205ff1ac74fc50758494de3e5e4d21579c42a5bcc8**; altı explicit path. **release-preflight-package.json**, base-sha, candidate-before, red-tests, worker-tests, provider-canary-tests, typecheck/build, actual-fixture-result, checks/receipt aynı gate dizinindedir. Patch'in exact-main base'e uygulanabilirliği ve adaya ters uygulanabilirliği kontrol edilir; diğer272aday dosyası ve kökteki273dosya/HEAD/index/status korunur.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PUBLICATION_VERIFICATION_RELEASE_PREFLIGHT.** Bu tur başlamadı. Fresh main ile yalnız bu altı dosya uzlaştırılıp ayrı Git/korumalı yayın/canlı kurtarma paketi hazırlanmalı. Aynı ücretli iş **lp-7d7e1b4e-0674-4db9-9377-3e9d4918224c** ve asset **f0bac775-7bc3-4956-b716-525e12194b1f** korunacak; orijinal son tarih geçerse otomatik ödeme/yeniden upload yapılmayacak. Bu gate'te canlı imza/ödeme/yükleme, provider/NEAR/D1 yazımı, Git/CI rerun/deploy **0**. Kaynak gate'i kapandı; genel Video V1 **NOT_COMPLETE**, canlı yayın kabulü **BLOCKED / NOT_RETESTED**.

## 44. Korumalı yayın ve aynı işin kurtarılması için ön kontrol — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PUBLICATION_VERIFICATION_RELEASE_PREFLIGHT: PASS / hazır, onay bekliyor.** Kullanıcı korumalı yayına hazırlık önerisini onayladı. Bu gate yalnız iki ana belge ve **tmp/video-public-testnet-long-verification-release-preflight-20260912/** içinde hazırlık/salt-okunur kontroldür; commit/push/PR/merge, repo ayarı, deploy veya canlı işleme yapılmadı.

**Kaynak / LOCAL_STATIC:** GitHub main hâlâ **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**. Altı dosya exact-base kopyasında yama uygulanarak yeniden kuruldu; tam dosya hash'leri test edilmiş adayla eşleşti. Yama **8ddb80042d460ee4aee748205ff1ac74fc50758494de3e5e4d21579c42a5bcc8**. Önceki **378 Worker +113 canary**, typecheck/dry-run ve720fixture/12adım kanıtları aynı baytlarla korundu; tekrar koşulmadı. Altı workflow/release kaynağı exact main ile eşleşti; yeni release artifact'i veya yeni kaynak CI'ı henüz yok.

| Kontrol | Güncel kanıt |
| --- | --- |
| GitHub / CI | Base main-push CI **34611141472 success**; son korumalı deploy **34612719919 success**. Main PR +strict **CI Gate** istiyor; normal squash mevcut, force-push/admin bypass yok. Önerilen dal boşta; aktif public-testnet deploy görülmedi. |
| Ortam / secret metadata | public-testnet ortamı yalnız korumalı dallar ve **4rmus** reviewer; self-review engeli false. Gerekli **11 secret adı** mevcut; değerleri okunmadı. Özel dal listesi yok, protected-branches politikası kullanılıyor. |
| Config / anahtarlar | Her iki repo yayın anahtarı **false**. Üretilen acceptance config öncekiyle aynı: SHA256 **9a9711d7a3c64cd1befdc71576ba1d02d266b45748f41ceecd296db8d4bd99ed**. Config/secret/feature flag değişikliği yok. |
| PREVIEW / çalışan sürümler | Web **7edfa5a6-5925-4bc0-986c-3f79adf4c7ce**, Bridge **9de194b6-8951-4b8e-83dc-c19e249877e8**, read-model **098e8ad0-6e7c-4fda-93f2-eb69587c76f6**, her biri100%. Profile rotasının **16 JS** dosyası doğrulanmış mevcut artifact ile aynı. Bu oynatma kabulü değildir. |
| Korunan ortamlar | Preview yönetilen sürüm **bc36aae2-f285-4f7d-872d-05bc11e12971**; Preview/ana origin başlangıç fingerprint'leri kaydedildi. Mevcut base artifact hash/lock doğrulaması PASS; yeni artifact yerine kullanılamaz. |
| Aynı ücretli iş | Hedef Authorized/publication null; **5.000.000.000bayt /7200,008008sn /ready** asset korunuyor.21provider asset'in20geçerli job bağı current Market'te sorgulandı; süresi dolmamış Authorized olan yalnızhedef.1asset geçerli job bağı taşımıyor. Bu bağımsız/tam DO envanteri iddiası değildir. |
| Ekonomi / süre | Soteri **34,38testUSDC**, operator yaklaşık **0,197394testNEAR**. Hedefin orijinal son tarihi **12 Eylül19:28:40.699 UTC /22:28:40.699 İstanbul**. Yürütmeden hemen önce yeniden kontrol şart. |

**Önemli yayın etkisi:** Yeni Bridge'in alarmı aynı işin720referansını otomatik doğrulayıp operator ile **NEAR finalization** ve ardından türetilmiş katalog kaydını başlatabilir; workflow tamamlanmasını bile beklemeyebilir. Dolayısıyla “yalnız deploy, zincir işlemi yok” onayı bu sürüm için yeterli değildir. Yeni kaynak yayın onayı aynı hedefin bu otomatik kurtarılmasını da açıkça kapsamalıdır. Başka iş için elle kurtarma önerilmez.

**Somut sonraki paket:** `fix/long-video-thumbnail-verification-20260912` dalında1commit/1PR; gerekli yeni CI ve applicable review sonrası normal squash. Yeni merged SHA ve o SHA'nın başarılı **main push ci.yml** run'ı bulunmadan dispatch yok; eskiCI/boşyer tutucu kullanılamaz. `deploy-public-testnet.yml` en fazla1kez **acceptance**, `DEPLOY_PUBLIC_TESTNET_ENABLED false→true→false`; başarı/hata fark etmeksizin geri kapatılır, Preview false kalır. İmzalı artifact/config/SBOM doğrulaması ve mevcut ortam reviewer'ı korunur. Mevcut workflow üç public-testnet servisini birlikte yayımlar; public upload açık, eski beta/Production/Mainnet kapsam dışıdır.

Yeni testUSDC ödemesi/upload/asset/cüzdan imzası/cihaz değişimi **0**. Hedef **lp-7d7e1b4e-0674-4db9-9377-3e9d4918224c**, asset **f0bac775-7bc3-4956-b716-525e12194b1f**, en çok1yeni publication. Önerilen toplam wall **120dk**, ilk yeni Bridge cutover'ından sonra hedef gözlemi en çok **30dk**; **0,10testNEAR +5USD** ek kullanım gözlem eşikleri, izleme0dk. Bunlar sert fatura tavanı veya arka plan alarmını otomatik durduran sınırlar değildir. En çok1normal aynı-iş durum/reconcile tetiklemesi; yeni imza/ödeme gerekirse durulur.

**Kapanış/başarısızlık:** source→yeniCI→attested artifact→%100sürümler→serving/health, hedef Published/ACTIVE→katalog ve önceki7yayın korunması doğrulanır. Süre dolarken kendi workflow'u henüz sırada/ortam onayındaysa iptal edilip anahtar kapatılır; kısmen başlamış trafik değişimi körlemesine kesilmez. İkinci dispatch veya yerel manuel rollback yok. Kod rollback'i NEAR kayıtlarını geri almaz; eski64sınırlı Bridge yeni uzun yayını tekrar reddedebilir. Böyle bir durumda gerçek state/receipt korunup ayrı kurtarma paketi gerekir.

**Kanıt ve onay:** action-package.json, approval-report.md, pr-title/pr-body, source-parity/source-check, github-config-summary, managed-versions/serving-before, base/acceptance-config, secret-and-deadline-check, pending-inventory, checks/receipt. GitHub secret değerleri, yeni kaynak commit/CI/deployment kimlikleri bu gate'te üretilmedi. Dirty kök ve kaynak adayı korunur; belge/alan kontrolleri checks.json'dadır. **Tek eksik kullanıcı onayı**, AGENTS.md'nin Git/deploy/canlı NEAR sınırı gereği bu hazır pakete ait. Genel Video V1 NOT_COMPLETE; kapalı testler yeniden açılmaz.

## 45. Büyük dosya düzeltmesinin korumalı yayını — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PUBLICATION_VERIFICATION_RELEASE: YÜRÜTÜLÜYOR.** Kullanıcı Git +korumalı yayın +aynı işin otomatik kurtarma paketine **“onaylıyorum”** dedi. Tek gate; onay authorization.json'a kaydedildi. Başlangıç **2026-09-12T08:02:30.592Z**, toplam son **10:02:30.592 UTC**; ilk yeni Bridge cutover sonrası en çok30dk gözlem,0,10testNEAR/5USD gözlem eşikleri. Bunlar sert fatura/servis durdurma tavanı değildir. Yeni testUSDC ödemesi/upload/asset/wallet imzası/cihaz değişimi0.

Taze başlangıç main **cf81c2e2**, config aynı ve yayın anahtarları false/false. Hedef hâlâ Authorized/publication null; provider21asset, aynı5GB/7200,008008sn ready. Görünür geçerli20job bağında current Market'te tek süresi dolmamış Authorized iş hedef. Orijinal son tarih **12 Eylül19:28:40.699 UTC**; değiştirilmeyecek.

Kök dirty checkout korunarak **tmp/video-public-testnet-long-verification-release-20260912/checkout/** içinde ayrı clone hazırlandı. Yama SHA256 **8ddb80042d460ee4aee748205ff1ac74fc50758494de3e5e4d21579c42a5bcc8**, altı tam dosya hash'i onay paketiyle eşleşti. Yalnız bu dosyalar stage edildi; bir commit **62a33c7d59bf98d5dae4d20ebce5327ee4dfef29**, dal **fix/long-video-thumbnail-verification-20260912**, [PR #197](https://github.com/4rmus/youtick/pull/197). İlk CI gözleminde Bridge/bağımlılık/JS CodeQL başarılı; Rust CodeQL/CI Gate bekleniyor. Bu ara kayıt merge veya deploy başarısı değildir.

Sonraki adımlar aynı onaylı gate içinde: gerekli kontroller/review→normal squash→yeni merged SHA'nın başarılı main-push CI'ı→tek korumalı workflow→attestation/config/SBOM incelemesi→mevcut ortam onayı→sürüm/serving ve aynı işin Published/ACTIVE/katalog kabulü. Her aşamada source/config/koruma/son tarih yeniden kontrol edilir; köreltme, force-push, admin bypass veya CI rerun yok. Yeni kaynak varsayılanlarını/secretları değiştirme yetkisi verilmedi; yalnız onaylı deploy anahtarı geçici açılıp kapanacak.


**Kapanış — COMPLETED_WITH_WARNINGS; büyük dosya yükleme ve yayın kabulü PASS.** Yukarıdaki yürütme notları başlangıçtaki ara kayıttır. Aynı onayla gerekli PR kontrolleri tamamlandı, normal squash yapıldı ve yeni main'in başarılı CI sonucundan tek korumalı acceptance yayını yürütüldü. Son canlı okuma **12 Eylül09:17:33.875 UTC**; hedef Published/ACTIVE ve toplam8yayın. Yeni yükleme veya ödeme gerekmedi.

| Kanıt sınıfı / kontrol | Sonuç ve sayısal kanıt |
| --- | --- |
| LOCAL_STATIC / kaynak | Tek commit **62a33c7d59bf98d5dae4d20ebce5327ee4dfef29**, [PR #197](https://github.com/4rmus/youtick/pull/197), merged SHA **b53e00e962b595f0edf4f1283c146d73d1f76b57**. Onaylı6dosya hash'i aynı; mevcut dirty kök yeni main'e taşınmadı. Değişen kaynaklar workers/livepeer-bridge/src altında finalize.test.ts, provider-verification.test.ts, media-provider.ts, livepeer-provider.ts, provider-verification.ts ve index.ts. |
| LOCAL_TEST / korunan kanıt | Aynı baytların **378 Worker +113 canary PASS**,3mevcut opt-in SKIPPED, typecheck/dry-run PASS kanıtı tekrar koşulmadan korundu. Kaydedilmiş gerçek VTT fixture'ının **720denetim/12adım/1008 mantıksal mock isteği** canlı hedefin bağımsız istek sayısı değildir. |
| CI / korumalı yayın | Yeni main-push [CI34683092906](https://github.com/4rmus/youtick/actions/runs/34683092906) ve [deploy34683764285](https://github.com/4rmus/youtick/actions/runs/34683764285) **success**, ilk deneme. **6provenance +2SBOM** sıkı doğrulama PASS; config SHA256 **9a9711d7a3c64cd1befdc71576ba1d02d266b45748f41ceecd296db8d4bd99ed** değişmedi.1dispatch,1ortam onayı; CI/workflow rerun, direct deploy, rollback0. |
| PREVIEW / public-testnet çalışan sürümler | Web **eadec555-d4fa-4469-a810-f10191b787f4**, Bridge **0f45b81e-8f7d-485c-aad8-51e076910a3c**, read-model **91063507-21ec-46df-8d56-2542b8d6e37b**, her biri **%100**. Gerçekte servis edilen **16 Web JS** dosyası imzalı artifact hash'leriyle aynı; Bridge/read-model health ve kabul bayrakları PASS. |
| PREVIEW / aynı işin yayını | **lp-7d7e1b4e-0674-4db9-9377-3e9d4918224c**, soteri.testnet, generation1; expected/verified source **5.000.000.000bayt**. Bridge cutover **08:53:10.226 UTC**, yayın **08:55:11.079 UTC**, fark **120,852844sn**. **Published/ACTIVE**, katalog **HTTP200/ACTIVE**, doğru creator/price/playback ve kaynak blok **268223675**. Elle recovery tetiklemesi0. |
| PREVIEW / FINAL işlem ve bakiye | **2rKfebZWrSfWn3pXbiuPEQdWBGabSwGDoE2BgKSG14RY**, tek **finalize_livepeer_publication**, FINAL; argümanlar aynı yayınla eşleşti. İşlem bloğu **268223674**, ücret **0,0003753378789426 testNEAR**; operator bakiyesi **0,1973942081891708→0,1970188703102282** ile tam eşleşti. Soteri **34,38testUSDC** ve NEAR, utick2 ve relayer bakiyeleri değişmedi. |
| PROVIDER / aynı kaynak | Aynı asset **f0bac775-7bc3-4956-b716-525e12194b1f**, playback **f0baf9hsahk9ag8m**, **ready/JWT**, boyut **5.000.000.000bayt**, süre **7200,008008sn** (120dk +son kare8ms). Asset sayısı **21→21**, önceki20kimlik mevcut. Provider tam kaynak hash'i yok; yeniden elde edilmiş hash kanıtı sayılmaz. |
| Koruma / kapanış | Önceki **7yayının tam nesnesi değişmedi**, hepsi ACTIVE; toplam **7→8**. Job/ödeme/anahtar/generation ve **12 Eylül19:28:40.699 UTC** orijinal son tarih korundu. Preview sürümü **bc36aae2-f285-4f7d-872d-05bc11e12971** değişmedi; durum/son URL/sabit başlıklar aynı, değişken CSP nonce ve HTML bayt eşitliği iddiası yok. Workflow ana origin kontrolü PASS. İki deploy anahtarı **false**, public uploads mevcut kabul ayarında açık. |
| Süre / işlem sınırları | Canlı kayıt kapandı; cutover→kapanış **24,382941dk <30dk**. Son canlı okuma gate başlangıcından **75,054724dk <120dk**. Yeni testUSDC ödemesi, upload, asset, cüzdan imzası, cihaz değişimi, izleyici-dakika **0**. Arka plan alarmı/depolama bu gözlem sınırıyla durmaz. |

**Korunan uyarılar:** İlk yerel attestation okuması command_failed_gh ile kesildi; kesin ilk stderr yok. Deploy anahtarı kapatıldı, aynı bekleyen workflow için **8sıkı doğrulama** bağımsız tamamlandıktan sonra ilk ortam onayı verildi. Workflow başarısızlığı/ikinci dispatch/kontrol atlama yok. Toplu Bridge kaydında **1 admission_denied** var; süresi dolmuş rezervasyonun READY_VERIFIED geçişiyle uyumlu fakat log hedef job'a bağımsız bağlı değil. Hedef tek FINAL işlemle kendiliğinden yayımlandı; uyarı bu sürümde düzeltilmiş sayılmıyor. Cutover sonrası **2535toplu olay** tüm Bridge kapsamındadır; hedefin720resmi için tekil sayaç değildir.

**Maliyet ve kapsam:** Taze Billing önce/sonra Growth100USD, overage0USD, transcode151dk, storage121dk, delivery0dk gösterdi. Gecikmeli toplu sayaçlar nedeniyle gerçek ek provider maliyeti **UNPROVEN**; gerçek0USD denmez. Önceki gerçek aktarım **150 PATCH204**, hata/yeniden deneme0, **116,481883dk /5,72335Mbps**; provider ready ek **42,02545dk** ve bir kez ödenen **1,60testUSDC** önceki gate kanıtıdır, bu tur tekrar edilmedi. Uzun izleme/oynatma, bağımsız yeni720erişim izi, başka container/5GB+1, kapasite/dayanıklılık ve kapanmış browser/maliyet testleri **EXTERNAL_NOT_RUN**. Önceden açıklanan sentetik tekrar ve MP4 free alanı sınırlaması korunur.

**Dosyalar ve son karar:** Kök çalışma alanında yalnız bu iki ana belge güncellendi; diğer **273dosya**, HEAD/index/status koruma kontrolü checks.json'da. Sayısal kayıt **tmp/video-public-testnet-long-verification-release-20260912/receipt.json**, checks.json, final.json, finalize-transaction-summary.json, acceptance/serving.json ve resmi acceptance/receipt/public-testnet-deployment.json içindedir. Bu işin yayın blocker'ı kapandı. **Tek sonraki gate: yok; istenen5GB/120dk yükleme kapsamı tamamlandı ve burada duruldu.** Genel Video V1 NOT_COMPLETE; diğer aşamalar tamamlanmış sayılmaz, maliyet/hız ve browser kullanıcı kapanışları yeniden açılmaz.


## 46. İki eşzamanlı yükleme ve iki eşzamanlı izleme — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_TWO_BY_TWO_ACCEPTANCE — YÜRÜTÜLÜYOR.** Kullanıcı önce 1.000 izleyici testini istemediğini belirtti, ardından açıkça “2 eş zamanlı izleme ve 2 eş zamanlı yükleme testi yap” talimatını verdi. İlk sürüm kapasite kabulü 2+2 olarak daraldı; önceki 3/10 yükleme ve 1.000 izleyici testi bu koşunun hedefi değildir. Canlı global sınır ve feature flag değiştirilmez.

İzinli yerel yollar: current-state, Video V1 planı, bu kabul günlüğü ve `tmp/video-two-by-two-acceptance-20260912/`. Başlangıçtaki dört dirty belge korunur; uygulama kodu, config, credential, Git/CI/deploy kapsam dışıdır.

**Somut koşu:** Brave İş/soteri.testnet ve test/utick2.testnet; her biri mevcut `medium-10m.mp4`, 269.467.407 bayt /600,025521 saniye, SHA256 `40fcd876e157e0e1663f5deace4cfcbf10988815f3cb4604d8acd053ac007382`. İki yeni iş/yayın üst sınırı; kişi başı 0,60 testUSDC (0,50 upload +0,10 sponsor), toplam1,20. Cüzdan imzalarını kullanıcı tamamlar. Mevcut hakla iki izleyicide en az300sn örtüşen oynatma; yeni satın alma0, izleme üst sınırı15 izleyici-dakika. Provider ek kullanım gözlem eşiği1USD, sert fatura tavanı değildir. Hata halinde mevcut ücretli iş korunur, körlemesine ikinci ödeme/re-upload yapılmaz.

Başlangıç **LOCAL_STATIC / PREVIEW**: main `b53e00e962b595f0edf4f1283c146d73d1f76b57` ve korumalı yayın34683764285 success güncel GitHub'dan okundu. Bridge `0f45b81e-8f7d-485c-aad8-51e076910a3c` /ENABLED /health ok taze doğrulandı. FINAL blok268239906: soteri34,38, utick2 9,00testUSDC; toplam8publication, Market açık. İki dosya seçimi/başlık ve ödeme seçeneği hazırlandı.

İşler: A `lp-759ba786-52fb-4e75-a38f-58409ae6b999`; B `lp-6cc3b1ea-8d4b-412d-8707-695393229271`. Kullanıcının ilk onayı sonrası B aktarımı başladı. A cüzdanı kilitli kaldı; sonraki imza152.610,7ms sonra döndü, relay544,1ms'de failed oldu. **11:37:52 UTC** FINAL okumada A işi yok ve34,38testUSDC aynı; B Authorized, utick2 8,40testUSDC. Ödeme oluşmadığı uzlaştırıldıktan sonra yalnız aynı A işinin yeni onayı hazırlandı. Kesin relay hata kodu henüz yok; gecikme tek başına kök neden kanıtı değildir.

Başlangıç kabulü: iki aktarımın örtüşmesi ve iki job Published/ACTIVE+katalog; iki hesabın300sn eşzamanlı oynatması; en çokiki gerçek ödeme ve yalnıziki yeni yayın. Kanıt dizini bu yeni repo köküne göredir.

**Koşu sonucu — COMPLETED_WITH_WARNINGS.** İki upload işi ve iki gerçek HLS akışı çalıştırıldı. Tam aktarım örtüşmesi kaydı ve farklı hesapla iki izleyici senaryosu eksik; genel2+2kabulü PASS değildir. Otomatik sonraki gate yok; diğer kapalı kabul aşamaları yeniden açılmadı.

| Kanıt | Sonuç |
|---|---|
| PREVIEW — iki üretici | soteri A ve utick2 B; her biri269.467.407bayt verified_source_bytes, generation1, Published/ACTIVE. A11:38:41.192→11:49:38.290UTC (657,098sn), B11:34:48.079→11:45:03.819UTC (615,740sn). Bunlar ödeme kabulü→yayın süreleridir, saf aktarım süreleri değildir. |
| PREVIEW — eşzamanlı iş | FINAL blok268241098'de iki iş Authorized. Zincir zamanlarına göre382,627sn birlikte aktif/yayımlanmamış durumdalar. A aktarım başlangıcı11:38:47.415UTC ve %10/%34ilerleme, B%7aktarım görüldü. B'nin tam aktarım zamanları araç erişimi kaybı nedeniyle alınamadı; gerçek TUS örtüşmesi UNPROVEN. |
| PREVIEW — katalog/koruma | FINAL blok268242140, 11:51:55.494UTC: yayın8→10, önceki8yayın aynı. İki katalog kaydı HTTP200/ACTIVE. Admission OPEN, hedef rezervasyonlar boş, canlı global sınır10korundu. |
| PREVIEW — ödeme | Soteri34,38→33,78; utick2 9,00→8,40testUSDC. Toplam1,20testUSDC, iki gerçek ödeme. A'nın ilk başarısız relay denemesinde ücret alınmadığı önce doğrulandı; ödenmiş işi yeniden yaratma/re-upload yok. |
| PREVIEW — iki oynatıcı | Farklı profile erişim tamamlanamadığı kullanıcıya bildirildi; soteri hesabında iki yeni Brave sekmesiyle iki gerçek HLS akışı ölçüldü. Başlangıç11:52:13.897UTC, kapanış11:58:35.737UTC. Video ilerlemeleri382,204785/381,939959sn; yaklaşık12,736izleyici-dakika. Farklı hesaplı izleyici kabulü EXTERNAL_NOT_RUN. |
| PREVIEW — oynatma ölçümleri | Her oyuncuda1başarılı ilk token+2başarılı doğal yenileme; toplam4yenileme, başarısız token işlemi0. Beş çift DOM örneğinde paused=false/readyState4/mediaerror=null, zaman çizelgeleri ilerledi. Fiziksel A/V veya tüm ağ hatalarının yokluğu iddia edilmez. |
| LOCAL_TEST | Üç belge için mevcut docs/testing.md komutuyla docs build ve boşluk kontrolü yapıldı. Uygulama/CI testleri yeniden çalıştırılmadı; sonuç checks.json içindedir. |

**Araç ve kapanış:** Kullanıcı AppleScript ile devam edilmesini ve geçici Apple Events seçeneğini açtığını bildirdi; tüm test upload sekmelerinde JavaScript çalıştırma hata12ile reddedildi. System Events yardımcı erişimi de kapalıydı. Başarılı Apple Events JavaScript yürütmesi0; anahtar/secret değerleri loglanmadı. Mevcut operator tokenı yalnız admission-status GET için bellekte kullanıldı, değiştirilmedi. İki oynatma sekmesi ve kullanılmayan hazırlık Watch sekmesi kapandı; diğer kullanıcı sekmeleri/yayınları korundu. Gizlenen Pause kontrolü ilk durdurma tıklamasını engelledi; akışlar12,736izleyici-dakikada sekmeler kapatılarak sonlandırıldı,15dakika üst sınırı aşılmadı.

Kesin ek Livepeer fatura maliyeti UNPROVEN; yeni abonelik/ayar/deploy yok. Apple Events menüsünde açık kalan seçenek varsa başlangıçtaki kapalı durumuna dönmesi istenir. Kanıtlar: action-package.json, chain-before.json, payment-check.json, chain-during.json, chain-final.json, publication-checks.json, catalog-final.json, admission-after.json, playback-result.json, receipt.json ve checks.json.

## 47. Aynı 2+2 gate'inin kanıt tamamlaması — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_TWO_BY_TWO_ACCEPTANCE — PASS / KAPALI.** Kullanıcının “önerdiğin gibi devam et” talimatıyla §46'nın iki eksik kanıtı tamamlandı. Önceki iki ücretli iş korundu; yeni ödeme, yükleme, asset, bilet alımı veya cüzdan onayı başlatılmadı. İlk koşunun receipt ve hash kayıtları değiştirilmedi. Bu devamın kanıtları yeni repo kökünde `tmp/video-two-by-two-evidence-recovery-20260912/` içindedir.

**Kurtarılan aktarım kanıtı — PREVIEW, orijinal tarayıcı geçmişi:** İki orijinal yükleme sekmesinin `video_measurement / source_transfer / completed` kayıtları okunabildi. A'nın `MEDIA_RACE` filtresi gerçek klavye girişiyle geçici değiştirildi, sonra eski hâline döndürüldü. Tarihsel kayıt kurtarması yeni yükleme değildir.

| Hesap / mevcut iş | TUS işlem başlangıcı UTC | Bitiş UTC | Süre |
|---|---|---|---|
| soteri / `lp-759ba786-52fb-4e75-a38f-58409ae6b999` | 11:38:47.430 | 11:46:00.635 | 433,205 sn |
| utick2 / `lp-6cc3b1ea-8d4b-412d-8707-695393229271` | 11:34:54.921 | 11:41:28.364 | 393,444 sn |

Her kaynak **269.467.407 bayt**. Aynı bilgisayardaki sekmelerin `timeOriginMs + startedAtMs` ve `durationMs` alanlarıyla **160,934 saniye örtüşme** hesaplandı; bağımsız salt-okunur inceleme aritmetiği ve kaynak ölçüm sınırını doğruladı. Ölçüm `upload.start()` → TUS başarı sonucudur; başlangıç kontrolü ve varsa tekrar beklemelerini içerir. Kesintisiz eşzamanlı PATCH baytı gönderimi veya daha büyük kapasite iddiası değildir. Önceki 382,627 saniyelik yayın öncesi iş örtüşmesinden ayrıdır.

**İki farklı hesapla oynatma — yeni PREVIEW koşusu:** Brave İş profilinde `soteri.testnet`, test profilinde `utick2.testnet` normal uygulama menüsünde doğrulandı. Mevcut M2 yayını/biletleri kullanıldı. Soteri 13:39:50.590, utick2 13:40:14.397 UTC'de başladı; hesap değişimi ve yeniden imza olmadı. A'nın son DOM örneği 13:46:02.486'da 372,059 saniye; B'nin 13:45:28.142 örneği 313,684 saniye gösterdi. Her iki örnekte paused=false, readyState=4, media error=null. Bu aralıklarda en az **300 saniye ortak oynatma** doğrulandı.

Her hesapta **iki başarılı doğal token yenilemesi** kaydedildi; toplam dört. A/B'de pozitif oynatma içeren 74/63 SDK heartbeat örneği, 369.120/313.231 ms oynatma ölçtü; bu örneklerde bekleme, stall ve medya hatası sayaçları 0. Bu sayılar tüm ağ hatalarının yokluğu veya fiziksel A/V kalibrasyonu değildir. B'de provider analytics/reporting uçlarının bağlantı uyarıları vardı; oynatma akışı devam etti. Kesin provider maliyeti ve p95 hız kabulü bu gate kapsamında yeniden açılmadı.

**Kapanış ve koruma:** A sekmesi 13:46:02.516 UTC'de, B sekmesi en geç 13:46:13 UTC'de kapandı. Bu devam koşusunun toplam izleme duvarı üst sınırı yaklaşık 12,18 izleyici-dakika; 15 sınırının altında. Orijinal yükleme sekmeleri ve kullanıcı yayınları korundu, açılan konsollar kapatıldı. Apple Events ile JavaScript çalıştırma her iki hedef profilde yine hata12 verdi; başarılı Apple Events JavaScript yürütmesi yok ve son kontrol kapalı durumu doğruladı. DevTools yapıştırma koruması kapatılmadı; yalnız yazılarak girilen iki salt-okunur DOM örneği kullanıldı.

13:47:35.486 UTC / FINAL blok268254225: iki iş Published, yayın sayısı10; soteri33,78 ve utick2 8,40 testUSDC aynı. GitHub main `b53e00e962b595f0edf4f1283c146d73d1f76b57`, Bridge `0f45b81e-8f7d-485c-aad8-51e076910a3c` /ENABLED /health ok yeniden okundu. Yeni kaynak/CI/deploy yok. Üç belge, kanıt dosyaları, docs build ve koruma kontrollerinin sonucu `checks.json` içindedir.

Yükleme ve izleme eşzamanlılığı ayrı zamanlarda kanıtlandı. İlk sürümün **2 eşzamanlı yükleme + 2 ayrı hesapla izleme kabulü kapalıdır**; Video V1 bütünü NOT_COMPLETE kalır. 1.000 izleyici testi kapsam dışıdır. Tek sonraki öneri kalan canlı dayanıklılık senaryolarının ön kontrolüdür; bu tur başlatılmadı.

## 48. Kalan canlı dayanıklılık ön kontrolü — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_RESILIENCE_PREFLIGHT — PASS / HAZIRLIK KAPALI.** Kullanıcının “önerdiğin gibi devam et” talimatı yalnız önce önerilen ön kontrol kapsamında yürütüldü. Üç kanonik belge ve `tmp/video-public-testnet-resilience-preflight-20260912/` dışında kaynak değişikliği yok. Canlı dayanıklılık kabulü bu sonuçla kapanmaz.

| Senaryo | Mevcut kanıt ve karar |
|---|---|
| Kesinti, aynı dosya/iş, yanlış hesap/dosya | M2 resume §25 ve 2+2 §47 kapalı; yeniden çalıştırılmayacak. |
| Zamanında yayımlanmış videonun 24 saat sonrası erişimi | M2 11 Eylül 12:08:43.185 UTC'de yayımlandı; §47'de 12 Eylül 13:39–13:46 UTC'de iki hesap izledi. Yayın üzerinden 25 saatten fazla geçti; bu alt koşul mevcut canlı kanıtla karşılanır. |
| Kayıp webhook | §45'te uzun işin yeni sürüm sonrası 120,853 saniyede kendiliğinden toparlanması kısmi kanıt. Bildirimin özellikle kaybedildiği gösterilmedi; ayrı canlı senaryo UNPROVEN. |
| Tekrarlanan/eskimiş bildirim | Checkpoint121, 12 Ağustos eski Preview'da ready tekrarı + daha eski processing için iki202/ikiACK ve tek yayın kanıtladı. Güncel public-testnet kabulü değildir; sonraki dar paket budur. |
| Queue yeniden teslim/retry/DLQ | Checkpoint120 eski Preview transport koşusu ve mevcut yerel testler var. Güncel gerçek iş üzerinde zorlanmış redelivery UNPROVEN. |
| Erken/geç alarm | Yerel kaynak/test kanıtı var; kontrollü canlı alarm zamanlaması UNPROVEN. |
| Bitmemiş işin 24 saatlik süre sonu | Değişmeyen son tarih kanıtlı; gerçek expiry ve geç ready reddi henüz canlı doğrulanmadı. Yayımlanmış videonun erişimiyle karıştırılmaz. |
| Dolu ortamda close/drain | Önceki public-testnet closed/drain yayın ve bayrak kanıtları var. Devam eden gerçek işin korunması + yeni iş reddi aynı canlı koşuda UNPROVEN; public kapanışı otomatik önerilmez. |

**Taze salt-okunur bağlam:** main `b53e00e962b595f0edf4f1283c146d73d1f76b57`; Bridge `0f45b81e-8f7d-485c-aad8-51e076910a3c`, ENABLED/health ok/webhookQueueReady. Hedef M2 `lp-491fb8eb-451f-4fc6-918e-b94d6876fc02`, soteri/generation1, Published/ACTIVE. Livepeer asset `b9bfb314-cd2f-47a2-8d16-a1689287e291` ready/JWT; asset ve proje hash'leri zincirle eşleşti. Public webhook `15815bf0-b750-49bc-bdd2-816c8c29136d`, doğru URL/proje/dört olay. Yayın sayısı10, admission OPEN, aktif rezervasyon0. Operator kaydı10/10 CONFIRMED; `pendingRecords=10` arşiv bekleyen onaylı kayıtlardır, bekleyen finansal işlem değildir.

Queue `88fbf7cd91ad4140a74ea9393face0a6` / `youtick-livepeer-events-public-testnet` producer/consumer1/1; consumer `43139219af604e29a9588e9c878f9d32`, doğru Bridge ve DLQ, batch10/retry3/concurrency1/wait5000ms/retryDelay0. Queue/DLQ boşluğu bu listeyle kanıtlanmış sayılmaz; canlı gönderimden hemen önce ayrıca okunmalıdır. Dedicated public secret dosyası0600; provider GET secret'ı döndürmediği için deploy edilmiş değerle eşitliği bu ön kontrolde UNPROVEN, ilk yetkili isteğin imza kabulü gerekir. Anahtar değiştirilmez.

**LOCAL_TEST:** exact-main kaynak kopyası mevcut kurulu bağımlılıklarla izole doğrulandı. `docs/testing.md` içindeki test komutunun dar seçimiyle üç mevcut test geçti: ham webhook imzası, imzalı ingress→Queue ve terminal ready/older-update ACK. Diğer73 test seçilmedi. `check-payloads.mjs` iki örnek gövdeyi mevcut `provider-webhook.ts` parser/yönlendirmesiyle doğruladı; ağ ve canlı imzalama yok. Örnek zamanlar eskir, aynen canlıya gönderilmez.

**Tek sonraki paket — VIDEO_PUBLIC_TESTNET_TERMINAL_REPLAY_ACCEPTANCE:** bir mevcut terminal yayın üzerinde önce `asset.ready`, ACK sonrası `asset.updated/processing`; ikinci timestamp birinciden60s eski. Bunlar sentetik, geçerli imzalı alıcı testleridir; Livepeer'ın gerçek yeniden teslim davranışını kanıtlamaz. En çok2POST, mesaj başına1deneme; yeni ödeme/upload/asset/yayın/izleyici oturumu0. İmza raw body HMAC-SHA256; header/body timestamp eşit ve5dakika toleransına uygun olmalı. Provider doğrulama GET/probe çağrıları oluşabilir; beklenen yeni NEAR işlemi0, operator nonce/bakiyeleri ve outbox before/after korunmalıdır.

Ölçüm: hazır snapshot'lardan sonra başlayan tek15dakikalık saat;60s sessiz pencere, ilk ACK için en çok60s, ikinci gönderim ilkinden en geç90s sonra, ACK sonrası en çok10dakika gözlem ve2dakika kapanış payı. Ek provider kullanım gözlem eşiği1USD; sert fatura tavanı değildir. HTTP202 tek başına kabul değildir. Mevcut Queue logunda job/message kimliği olmadığı için yalnız bizim CF-Ray girişleri ve karşılık gelen tek ACK'nin bulunduğu, eksiksiz seri pencereler kullanılabilir. Başka trafik, eksik/örneklenmiş kayıt, belirsiz ACK, retry/DLQ veya veri/sürüm/bakiye değişiminde sonraki mesaj gönderilmez; PASS verilmez. Public yüklemeler, kuyruklar ve consumer korunur; purge/pause/manual pull/ack, deploy, secret/config değişimi veya yeni logging kodu otomatik yapılmaz.

Paket: `action-package.json`, salt-okunur `live-preflight.json`/`operations-preflight.json`, Queue listeleri, yerel test günlüğü, payload şekil kontrolü ve README. Gerçek canlı gönderim onayı yoktur; bu tur webhook POST, Queue mutasyonu, yeni medya, ödeme, cüzdan imzası, CI tekrarı ve deploy çalıştırılmadı. Hazırlık engeli yok; canlı başlangıcın tazelik, sessiz pencere, backlog ve imza şartları sağlanmadan gönderim yapılmaz. Video V1 NOT_COMPLETE; maliyet/tarayıcı/playback/2+2 kapanışları ve 1.000 izleyici testinin kapsam dışı kararı korunur.

## 49. Terminal replay başlangıç kontrolü — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_TERMINAL_REPLAY_ACCEPTANCE — BLOCKED / gönderim yapılmadı.** Kullanıcının “önerdiğin gibi devam et” talimatı, §48'deki bir mevcut M2 yayınına iki imzalı test bildirimi paketinin onayı olarak kaydedildi. Ön kontrol paketinin baytları değiştirilmedi; yeni kayıt `tmp/video-public-testnet-terminal-replay-20260912/authorization.json` ve `approved-package.json` içindedir.

**Engel / PROVIDER, salt-okunur:** ana Queue `88fbf7cd91ad4140a74ea9393face0a6` 0 mesaj/0 bayt; DLQ `8651053b477c45fbba1386e0ed50fe41` **6 mesaj/13.984 bayt**. İkinci DLQ GET'i 16:34:25.702 UTC'de aynı sonucu verdi. `oldest_message_timestamp_ms=0` olduğu için yaş/ilk olay zamanı çıkarılmadı. Sayılar onaylanmamış mesajların yaklaşık dağıtık metrikleridir; iki okuma da boşluk şartının sağlanmadığını gösterdi. Consumer ve Queue yapılandırması değiştirilmedi.

**Başlangıç / PREVIEW:** GitHub main aynı `b53e00e962b595f0edf4f1283c146d73d1f76b57`, Bridge aynı onaylı sürüm. FINAL blok268271511: hedef M2 Published/ACTIVE, Livepeer ready/JWT ve asset/project hash eşleşmesi; toplam10yayın,23asset,10/10CONFIRMED operator kaydı. Creator, Market, operator ve relayer bakiyeleri; operator public access-key nonce ve izinleri; bütün yayın/asset kimlikleri başlangıç kaydına alındı. Bunlar replay kabulü değildir.

Paket boş Queue/DLQ ve sessiz yakalama penceresi istediği için **ilk POST'tan önce duruldu**. Webhook POST0; yeni ödeme/yükleme/asset/izleme0; Queue pull/ack/purge/consumer değişikliği0; source/config/secret/deploy/CI tekrarı0. HMAC imzalama, geçici tail akışı, sessiz pencere ve15dakikalık test saati başlatılmadı. DLQ mesajları bu koşuda oluşturulmadı; içerikleri, hangi işe ait oldukları ve neden başarısız oldukları incelenmedi. M2'ye veya mevcut sürüme neden atfedilmez.

Kanıt: `queues-before.json`, `dlq-confirmation.json`, `snapshot-before.json`, `receipt.json`, `checks.json`. Snapshot okumaları mevcut özel tokenları yalnız bellekte kullandı; ham kimlik bilgileri loglanmadı. Üç belge ve bu kanıt dizini dışında uygulama dosyası değişikliği yok.

Tek sonraki gate **VIDEO_PUBLIC_TESTNET_DLQ_READONLY_DIAGNOSIS**: altı mesajın salt-okunur metaverisi ve mevcut hata kayıtlarıyla iş/olay eşleşmesini bulmak; mesajları silmek, pull/ack ile görünürlük değiştirmek veya yeniden teslim etmek bu teşhisin kapsamında değildir. Bu gate başlatılmadı. Terminal replay NOT_RUN/UNPROVEN, genel Video V1 NOT_COMPLETE; tamamlanan kabul aşamaları yeniden açılmadı.

## 50. Hata kuyruğunun salt-okunur teşhisi — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_DLQ_READONLY_DIAGNOSIS — COMPLETED_WITH_WARNINGS.** Kullanıcının devam talimatıyla yalnız §49'daki altı mesajın teşhisi yapıldı. Değişiklik kapsamı bu kabul günlüğü, Video V1 planı, current-state ve yeni yerel kanıt dizinidir; uygulama, sözleşme, ayar, secret ve playback planı korunur. Kabul: altı mesajı iş/asset/olay/zaman ile eşleştirmek, mevcut yayınları okumak ve hiçbir mesajı silmeden veya yeniden teslim etmeden sonucu kaydetmek.

**PROVIDER:** Cloudflare'ın [mesajı kiralamadan okuyan Peek API'si](https://developers.cloudflare.com/api/resources/queues/subresources/messages/methods/peek/) kullanıldı. Dört okuma isteğinin alt kümeleri birleştirilince altı benzersiz DLQ ve altı kaynak mesaj kimliği bulundu; gövde boyutlarının toplamı **13.984 bayt**, saklanan önce/sonra sayaçları **6 mesaj / 13.984 bayt**. İkinci yanıtta dinamik oldest-message metriğini eşit sanan yerel kontrol durdu; kontrol sayıya/bayta daraltıldı, sonraki okumalar tamamlandı. Kuyruk durumu değiştirilmedi. Ham gövdeler ve silme referansları kaydedilmedi; izinli metaveri ve SHA256 özetleri saklandı.

| İş / video | Eski bildirimler (UTC) | Aynı işte kayıtlı eski engel ve düzeltme | Güncel sonuç |
|---|---|---|---|
| `lp-e6a312e5-4273-481d-a337-7c622a4cca53` / testt | 10 Eylül 09:09:47; 2 mesaj | Sabit 16:9 boyut denetimi gerçek 468×360 / 934×720 çıktıyı reddediyordu; PR #192 | Published / ACTIVE; ready / JWT |
| `lp-b378185e-eb55-4a31-833d-899acc073def` / M resume | 10 Eylül 20:27:07–08; 2 mesaj | 60 küçük resim referansı eski 32 sınırını aşıyordu; PR #195 | Published / ACTIVE; ready / JWT |
| `lp-7d7e1b4e-0674-4db9-9377-3e9d4918224c` / 5 GB 120 dakika | 11 Eylül 22:07:18; 2 mesaj | 720 küçük resim referansı eski 64 sınırını aşıyordu; PR #197 | Published / ACTIVE; ready / JWT |

Her iş için bir `asset.ready` ve bir `asset.updated` vardır; **altı asset snapshot'ı da ready**. Hepsi doğru public-testnet kaynak kuyruğu, Market ve webhook kimliğine bağlıdır. Son 2+2 yüklemelerine veya terminal replay hedefi M2'ye ait değildir. Altı mesajın DLQ'ya giriş zamanı ilgili başarılı yayından öncedir.

**PREVIEW / PROVIDER:** 16:51:27 UTC okumasında FINAL blok **268273416**, toplam yayın **10**; üç iş Published, yayın ACTIVE, bağlı Livepeer asset ready/JWT ve asset kimlik özeti eşleşiyor. Bu yeni bir oynatma testi değildir. **UNPROVEN:** DLQ özgün son Worker hatasını taşımıyor; tabloda aynı iş/asset/zaman ve tarihsel olay/düzeltme kayıtlarına dayanan eşleşme verildi, altı mesajın tek tek kesin hata izi iddia edilmez. DLQ `attempts=0` değeri kaynak kuyruğundaki deneme sayısını kanıtlamaz.

Kanıt: `tmp/video-public-testnet-dlq-diagnosis-20260912/README.md`, `messages-manifest.json`, `jobs-current.json`, `receipt.json` ve `checks.json`. Yerel doğrulama: altı kimlik/13.984 bayt, üç iş/iki olay, yayın sonrası durum ve zaman sırası kontrolleri; belge derlemesi ve explicit-path diff kontrolü. Sonuçları checks.json kaydeder.

Mesaj silme/pull/ack/yeniden teslim **0**; webhook, ödeme, yükleme, provider mutasyonu, kaynak/ayar/deploy/CI tekrarı **0**. DLQ hâlâ 6; terminal replay **BLOCKED**, Video V1 **NOT_COMPLETE**; 2+2 PASS korunur.

**Tek sonraki gate: VIDEO_PUBLIC_TESTNET_DLQ_SELECTIVE_RETIREMENT — BAŞLATILMADI.** Somut paket `selective-retirement-plan.json`: yeniden kimlik/özet ve üç aktif yayın kontrolü; altı özgün gövdeyi özel 0700 dizinde 0600 dosyalara yedekleyip doğrulama; yalnız bu altı mesajı tek seçici silme isteğiyle kaldırma; sonra kuyruk/yayın/bakiye korunmasını doğrulama. En fazla 6 mesaj, 1 silme isteği, 10 dakika; yeni ücret/yükleme/yayın 0. Tüm kuyruğu boşaltma yok; farklı mesaj veya kısmi hata halinde otomatik tekrar yok. Mesaj silme bu salt-okunur gate'in yetkisi dışında olduğu için ayrı açık kullanıcı onayı gerekir. Terminal replay kendiliğinden başlamaz.

## 51. Altı eski DLQ mesajının yedekli seçici temizliği — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_DLQ_SELECTIVE_RETIREMENT — PASS / KAPALI.** Kullanıcının “önerdiğin gibi devam et” talimatı §50'de hazırlanmış altı kayıtlık paketin onayıdır. Kimlikler ve gövde SHA256 değerleri yeniden eşleştirildi; mevcut üç iş Published/ACTIVE, doğru asset ready/JWT olarak doğrulandı. Kaynak/ayar/deploy değişikliği yapılmadı; değiştirilebilir yerel kapsam üç durum/plan/kabul belgesi, yeni kanıt dizini ve özel yedekti. Önceki kullanıcı değişiklikleri korundu.

**PROVIDER:** Başlangıç DLQ **6 mesaj / 13.984 bayt**, ana kuyruk **0 / 0**. İlk API okumalarında OAuth süresi dolduğu için 401 alındı; standart `wrangler whoami` mevcut oturumu yeniledi, ardından başlangıç okumaları başarılı oldu. Uygulama secret/config değişikliği veya yeni giriş yetkisi oluşturulmadı.

Beş kiralamayan Peek isteğiyle altı onaylı kimlik tamamlandı. Her özgün gövde ve metaveri `/Users/arair/.codex/private-evidence/youtick-lp/dlq-retirement-20260912` içinde **0700 dizin / 0600 dosyalar** olarak yedeklendi; 6 gövde + 6 metaveri dosyası diskten tekrar okunup SHA256 ve izinleri doğrulandı. Ham gövdeler repo kanıtına, silme referansları diske/loga yazılmadı. Seçim tam olarak §50 manifest'indeki altı mesajdır.

[Cloudflare seçici silme API'sine](https://developers.cloudflare.com/api/resources/queues/subresources/messages/methods/purge/) yalnız altı taze referansla **1 POST** yapıldı; hata **0**, uyarı **0**. İlk son okumada sayaç henüz 6 iken Peek boştu; ardından iki ardışık okumada hem sayaç hem Peek **0 mesaj / 0 bayt** oldu. İşlem betiği **34,97 saniye** sürdü; başlangıç ve son sistem snapshot'ları 17:16:12–17:19:05 UTC, onaylı 10 dakika sınırı içinde. Tüm kuyruğu boşaltma, pull/ack, yeniden teslim veya ikinci silme isteği yapılmadı.

**PREVIEW / PROVIDER:** FINAL blok **268276006 → 268276303**. Üç iş/yayın/asset kaydı birebir korundu. Toplam **10 yayın**, **23 asset**, **10 CONFIRMED operator kaydı**; tüm yayınlar, creator/Market/operator/relayer bakiyeleri, operator anahtar nonce/izinleri, M2 yayını ve katalog kaydı aynı. Her iki kuyruk metadata/consumer ayarı aynı; ana kuyruk 0/0, DLQ consumer yok, public yükleme kabulü OPEN ve Bridge sürümü değişmedi.

**LOCAL_TEST:** `retire.py --check` yanlış kimlik/değişmiş gövdeyi reddeder; `check-result.py` yedek/izin/özet, before-after sistem eşitliği, kuyruk boşluğu ve 275 korunan dosya kontrolünü doğrular. Belge derlemesi ve explicit-path `git diff --check` sonucu `checks.json` içindedir. Kaynak HEAD ve index aynı. Kanıt `tmp/video-public-testnet-dlq-retirement-20260912/README.md`, `archive-verified.json`, `purge-attempt.json`, `purge-response.json`, `dlq-after.json`, before/after snapshot'ları ve `receipt.json`.

Yeni ödeme/yükleme/asset/yayın/izleyici/webhook **0**; CI, deploy, canlı playback veya 1.000 izleyici testi çalıştırılmadı. **2+2 kabulü PASS korunur; Video V1 bütünü NOT_COMPLETE.** Özgün eski mesajların tek tek hata iziyle ilgili §50 uyarısı korunur; bu temizliğin başarılı olması bildirim işleme kabulü değildir.

**Tek sonraki gate: VIDEO_PUBLIC_TESTNET_TERMINAL_REPLAY_ACCEPTANCE — BAŞLATILMADI.** §48'deki mevcut M2 yayını için en fazla iki imzalı sentetik bildirim, tek 15 dakika sınırı ve önce/sonra veri-bakiye kontrolü paketi korunur. §49'daki DLQ engeli bu snapshot'ta kalktı; gönderimden hemen önce boş kuyruklar, sürüm ve sessiz pencere yeniden doğrulanır. Bu temizlik gate'inde yeni test bildirimi gönderilmedi ve sonraki gate otomatik başlatılmadı.

## 52. Yayımlanmış videoda yinelenen ve eski bildirim kabulü — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_TERMINAL_REPLAY_ACCEPTANCE — PASS / KAPALI.** Kullanıcının devam talimatıyla §48'deki iki bildirimlik paket, §51 temizliği sonrasında uygulandı. Hedef aynı M2 işi `lp-491fb8eb-451f-4fc6-918e-b94d6876fc02`, asset `b9bfb314-cd2f-47a2-8d16-a1689287e291`. Exact GitHub main/local HEAD `b53e00e962b595f0edf4f1283c146d73d1f76b57`, Bridge `0f45b81e-8f7d-485c-aad8-51e076910a3c`; başlangıç Published/ACTIVE ve ready/JWT, hash bağlantıları doğru. İki kuyruk boş, consumer beklenen ayarlarda, public yükleme kabulü OPEN.

**PREVIEW — sentetik, geçerli imzalı alıcı testi:** mevcut özel public-testnet anahtarı bellekte kullanıldı; imza/anahtar diske veya loga yazılmadı. İlk HTTP202, çalışan alıcının bu imzayı kabul ettiğini doğruladı. Gönderilen gövdelerin SHA256 özeti ve CF-Ray eşleşmeleri ayrı kanıt dosyalarındadır.

| Bildirim | Zaman sırası | Canlı sonuç |
|---|---|---|
| `asset.ready` / ready | T | HTTP202; tek mesajlık Queue tesliminde ACK; gönderimden ACK gözlemine **10.372 sn** |
| `asset.updated` / processing | T−60 saniye; ilk ACK sonrası gönderildi | HTTP202; ayrı tek mesajlık teslimde ACK; **6.944 sn** |

İki gönderim arası **10.374 sn**; her bildirim yalnız bir kez gönderildi. İlk ACK gelmeden ikinci gönderilmedi. Queue logunda iş/mesaj kimliği olmadığı için eşleşme; CF-Ray'li iki giriş, aralarında ayrılmış iki tek-mesaj Queue olayı ve başka webhook/Queue trafiğinin bulunmadığı eksiksiz pencereyle yapıldı. HTTP202 tek başına kabul sayılmadı.

**Gözlem:** `2026-09-12T17:29:26.252000+00:00` anında tek saat başladı; **60 saniye sessiz pencere**, ardından iki gönderim/ACK ve son ACK sonrası **600.40 saniye** gözlem. Toplam yakalama **677.96 saniye**; son sistem snapshot'ı dahil **693.85 saniye**, 15 dakika sınırının içinde. Filtresiz Wrangler JSON tail'de **33 olay**, kesilmiş kayıt/diagnostic/exception/bağlantı uyarısı **0**, başka webhook/Queue teslimi veya RETRY **0**. Geçici tail kapatıldı. Hazırlıktaki ilk sağlık okuması HTTP hatası verdi; saat veya gönderim başlamadan mevcut curl okuma yöntemi kullanılarak giderildi. Test saati sıfırlanmadı.

**PREVIEW / PROVIDER:** FINAL blok **268277261 → 268278554**. Başlangıç, ara ve son karşılaştırmada hedef iş/yayın, bütün **10 yayın**, **23 asset kimliği**, creator/Market/operator/relayer bakiyeleri, operator anahtar nonce/izinleri ve **10 CONFIRMED outbox kaydı** aynı. M2 ready/JWT ve Published/ACTIVE, katalog kaydı aynı. Queue ve DLQ **0 mesaj / 0 bayt**; consumer/metadata, çalışan Bridge sürümü ve OPEN kabul durumu korundu. Kuyruklar kendiliğinden boşaldı; pull/ack/purge veya consumer değişikliği yapılmadı.

**LOCAL_TEST:** `run.py --check` hassas alanları ayıklama kontrolü ve `check-result.py` iki eşleşmiş ACK, tam gözlem süresi, gövde özetleri, önce/sonra sistem eşitliği ve 275 korunan tracked dosya kontrolü PASS. Belge derlemesi ve explicit-path diff kontrolü `checks.json` kaydındadır. Değişen tracked dosyalar yalnız current-state, Video V1 planı ve bu kabul günlüğüdür; playback planındaki mevcut kullanıcı değişikliği korundu. Commit/push/PR/CI/deploy yapılmadı.

**Sınırlar:** Bu, Livepeer'ın gerçek yeniden teslimi veya zorlanmış Queue retry kabulü değildir. Sağlayıcı okuma/probe çağrıları gerçekleşti; arka plan uzlaştırmaları aynı yakalamada olduğundan kesin ek fatura tutarı ve 1 USD gözlem eşiğiyle parasal karşılaştırma **UNPROVEN**. Önceden kabul edilmiş maliyet ertelemesi yeniden açılmadı. Yeni ödeme/yükleme/asset/yayın/izleyici oturumu **0**; 1.000 izleyici testi çalıştırılmadı. 2+2 PASS korunur; genel Video V1 **NOT_COMPLETE**.

Kanıt: `tmp/video-public-testnet-terminal-replay-run-20260912/README.md`, `approved-package.json`, `events.jsonl`, `send-1-response.json`, `send-2-response.json`, `measurements.json`, önce/sonra snapshot'ları, `capture-result.json`, `capture-closed.json` ve `receipt.json`. Ham tail yalnız bellekte ayıklandı; Wrangler ham log çıktısı /dev/null'a yönlendirildi.

**Tek sonraki gate: VIDEO_PUBLIC_TESTNET_MISSING_WEBHOOK_RECOVERY_PREFLIGHT — BAŞLATILMADI.** Bildirim hiç gelmediğinde mevcut kurtarma yolunu ve kanıt açığını incelemek; mümkün olan en küçük canlı senaryo, süre ve gerekiyorsa ücret paketini hazırlamak. Bu ön kontrol yeni ödeme/yükleme, bildirim engelleme veya ayar değişikliği yetkisi vermez. Yeni gate bu koşuda başlatılmadı.

## 53. Kayıp bildirimden kurtarma ön kontrolü — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_MISSING_WEBHOOK_RECOVERY_PREFLIGHT — COMPLETED_WITH_WARNINGS.** Kullanıcının devam talimatıyla mevcut kurtarma yolu, test kapsamı ve yeniden kullanılabilir canlı adaylar incelendi. Değişiklik kapsamı current-state, Video V1 planı, bu kabul günlüğü ve yeni yerel kanıttır. Uygulama/test kaynağı, playback planı, sözleşme, ayar ve secret değiştirilmedi. Kabul: var olan yolu doğrulamak, kaynak/yerel/canlı kanıtı ayırmak ve en küçük sonraki paketi hazırlamak; canlı hata oluşturmak bu gate'in kapsamı değildir.

**LOCAL_STATIC — mevcut yol:** `LivepeerControl.alarm → advanceAlarm → reconcileUpload → readAsset → handleLivepeerWebhook → verifyReadyProviderAsset → advanceFinalization`. Yayınlanmamış uygun işte sağlayıcı kimliği, proje, oluşturucu, API token adı ve JWT politikası eşleşmeden ilerlenmez. Normal waiting/processing kontrolü 60 saniye aralıkla yürür; geçici okuma hataları geri çekilme aralığını artırır. Sabit 24 saatlik son tarih korunur; süre dolduğunda yayın yapılmaz. Kısmi provider doğrulaması aynı alarm üzerinden devam eder.

**İlk alarm ayrımı:** `reserveUploadIntent`, imzalı isteğin `expires_at_ms` zamanından geç olmayacak alarmı kaydeder (`index.ts:1330`). Sonraki kontrolün 60 saniye olması, ilk kontrolün yükleme biter bitmez veya mutlaka 60 saniyede başlayacağını kanıtlamaz. İmzalı `recovery=reconcile` isteği aynı yolu ayrıca tetikleyebilir; yalnız alarm kurtarmasını sınarken bu istemci yolu kullanılmamalıdır.

**LOCAL_TEST — 4 PASS, 184 seçilmedi.** Main ile eşitliği doğrulanan mevcut izole kaynak kopyasında `npm test -- --run src/finalize.test.ts src/index.test.ts -t 'recovers a missing ready webhook|polls normal waiting|preserves verification errors through alarm|expires an unpublished job'` çalıştı:

| Mevcut test | Kanıt |
|---|---|
| Eksik ready olayını alarmdan kurtarma | Tek finalize, sonraki alarm/ready aynı yayını yeniden oluşturmaz; provider create/delete yok |
| Normal bekleme / geçici okuma hatası | 60 saniyelik normal aralık, yalnız hatalarda backoff |
| Alarm, restart ve doğrulama hatası | Hata korunur; bekleme ve toparlanma yolu çalışır |
| Yayımlanmamış işin son tarihi | Süre dolunca provider I/O olmadan sona erer |

**Kapsam açığı:** Bu dört test legacy public-beta ayarlarıyla çalışır. Eksik-ready testi işi doğrudan belleğe koyup `alarm()` çağırır; `VIDEO_ENVIRONMENT=public-testnet` politika kontrolünü ve ilk imzalı upload-intent'ten alarm kaydına geçişi birlikte sınamaz. Bu bir üretim hatası bulgusu değildir; açık test kapsamıdır. Yeni test veya uygulama düzeltmesi bu ön kontrolde yapılmadı.

**PREVIEW / PROVIDER — salt-okunur, 17:49:11 UTC / FINAL blok268279409:** 23 hesap asset'i okundu; hedef projede `lp-` iş bağlantılı22 kayıt, bunlardan public Market'te bulunan10 işin tamamı Published. Kalan12 için bu Market'te iş bulunmadı; başka Market'e ait oldukları varsayılmadı. İncelenen provider-bağlı envanterde yayımlanmamış ve süresi dolmamış uygun aday **0**; toplam yayın **10**. Provider asset'i henüz olmayan ödenmiş işleri bu tarama listelemez; bütün olası ödenmiş işlerin yokluğu iddia edilmez. Webhook aynı public hedef/proje ve dört asset olayıyla kayıtlı, streamId boş. Main `b53e00e9`, Bridge `0f45b81e-8f7d-485c-aad8-51e076910a3c`, health ok, queue/new-upload readiness true.

**Canlı paket henüz uygulanabilir değil:** Tek hedef asset'in bütün durum değiştiren bildirimlerini başka işleri etkilemeden engelleyen hazır yöntem doğrulanamadı. Provider güncelleme dokümanı yönlendirmesi de bu yöntemi doğrulamadı; desteklenmediği kesin olarak iddia edilmez. Ortak webhook'u kapatmak, anahtar/URL değiştirmek, consumer durdurmak veya kuyruğu temizlemek tek işlik kabulün etkisini büyütür ve önerilen otomatik alternatif değildir. Yayımlanmış bir işi geri almak da kullanılmaz. Canlı kabul **UNPROVEN** kalır.

`live-outline-not-authorized.json` en küçük canlı senaryonun ön koşullarını kaydeder: tek kısa dosya/iş/asset; önce ayrı onaylı hedefe özgü bildirim engeli; TUS bitince istemci reconcile olmadan alarm; sağlayıcı ready/JWT + bildirim gelmediği kanıtı + tek zincir yayını; süre sonunda engeli eski haline getirme. Hedef ve güvenli engelleme yöntemi belirlenmeden süre/çalıştırma taahhüdü verilmez. Yeni sponsorlu küçük yükleme gerekirse kaynak asgari0,50 + sponsor0,10 = **0,60 testUSDC** gösterir; bu canlı teklif değildir, taze fiyat ve cüzdan onayı gerekir. Sağlayıcı maliyeti ayrıdır.

**Tek sonraki gate: VIDEO_PUBLIC_TESTNET_MISSING_WEBHOOK_LOCAL_COVERAGE — BAŞLATILMADI.** `next-package.json`: mevcut testi public-testnet politika şekliyle genişlet; var olan public upload-intent testinde ilk alarm kaydını doğrula; aynı depolamayla nesneyi yeniden kurup fake saat üzerinden, dış webhook olmadan tam doğrulama ve yalnız tek finalize sonucunu sınayarak eski beta davranışını koru. En fazla mevcut iki test dosyası ve üç belge; yeni servis/dependency/uygulama davranışı yok. Yerel testler mock kullanır; canlı istek/ödeme/yükleme/deploy **0**. Üretim hatası çıkarsa ayrı küçük düzeltme gate'i hazırlanır, kapsam kendiliğinden büyütülmez.

Kanıt: `tmp/video-public-testnet-missing-webhook-preflight-20260912/README.md`, `tests.json`, `inventory.json`, `source.json`, `health.json`, `next-package.json`, `live-outline-not-authorized.json`, `receipt.json`, `checks.json`. Belge derlemesi ve explicit-path diff kontrolü kapanışta kaydedildi. 2+2 PASS ve terminal replay PASS korunur; genel Video V1 **NOT_COMPLETE**. Bu koşuda canlı webhook/fault, yeni ödeme/upload/provider mutasyonu, Queue işlemi, CI/deploy veya 1.000 izleyici testi yapılmadı.

## 54. Public-testnet kayıp bildirim yerel test kapsamı — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_MISSING_WEBHOOK_LOCAL_COVERAGE — PASS / LOCAL_TEST.** Kullanıcının devam talimatıyla §53'teki test paketi uygulandı. Yalnız `workers/livepeer-bridge/src/finalize.test.ts`, `workers/livepeer-bridge/src/index.test.ts` ve üç durum/plan/kabul belgesi değişti. Uygulama davranışı, sözleşme, ayar, secret, dependency ve playback planındaki mevcut kullanıcı değişikliği korundu.

Mevcut eksik-ready testi üç duruma genişletildi: eski public beta, doğru public-testnet politikası ve yanlış Market'e bağlı public-testnet politikası. İlk iki durumda provider processing iken yayın yapılmıyor; 60 saniyelik alarm kaydı doğrulanıyor, sahte saat bu zamana ilerletiliyor, aynı depolama üzerinde kontrol nesnesi yeniden kuruluyor ve provider ready durumuna alınıyor. Dış webhook gelmeden tam doğrulama yolu çalışıp ONCHAIN_PUBLISHED oluyor. İş/creator/generation/asset ve sabit son tarih korunuyor; verified bytes ve asset hash eşleşiyor. Sonraki alarm ve geç ready bildirimi ikinci finalize oluşturmuyor. Yanlış politika, sağlayıcı ve operator çağrısından önce reddediliyor; iş kaydı değişmiyor.

Mevcut public upload-intent testinde, legacy ve adaptive profil için imzalı isteğin son zamanı okunarak **son kaydedilen alarmın gelecekte ve imza son tarihinden geç olmadığı** ayrıca doğrulandı. Bu ilk alarm testi ile restart/kurtarma testi ayrı mevcut testlerdir; tek birleşik gerçek platform koşusu diye sunulmaz. Zamanlanmış Cloudflare alarmının gerçek teslimi ve canlıda webhook kaybı bu mock testlerle kanıtlanmaz.

**Doğrulama:** Kilit dosyası eşit mevcut bağımlılıklar, yeni izole exact-HEAD kaynak kopyası ve değişen iki test dosyası kullanıldı; eski gate'in kaynak/kanıtları değiştirilmedi. `npm test -- --run src/finalize.test.ts src/index.test.ts -t 'recovers a missing ready webhook|admits a public creator with stored profile|polls normal waiting|preserves verification errors through alarm|expires an unpublished job'`: **8 PASS, 182 seçilmedi**. Alarm beklentisi geçmişteki en erken kayıt yerine son kaydı denetleyecek şekilde netleştirildikten sonra etkilenen iki profil testi tekrar **2 PASS**; bu iki sonuç aynı testlerdir, toplam10benzersiz test denmez. `npm run check` TypeScript kontrolü PASS. Belge derlemesi ve explicit-path diff kontrolü `checks.json` içindedir.

Kanıt `tmp/video-public-testnet-missing-webhook-local-20260912/README.md`, `tests.json`, `alarm-tests.json`, `typecheck.log`, `checks.json`, `receipt.json`, `review.patch`. **Üretim hatası gösterilmedi; davranış düzeltmesi yapılmadı.** Yerel testler mock kullandı; gerçek wallet imzası, ödeme/upload/provider/Queue işlemi, CI/deploy veya 1.000 izleyici testi **0**. HEAD/index aynı; commit/push/PR yok. Önceki terminal replay PASS ve 2+2 PASS korunur; canlı kayıp bildirim kabulü UNPROVEN, genel Video V1 NOT_COMPLETE.

**Tek sonraki gate: VIDEO_PUBLIC_TESTNET_MISSING_WEBHOOK_TEST_INTEGRATION — BAŞLATILMADI.** Hazır `integration-package.json`, iki test dosyası ile üç canonical belgenin mevcut değişikliklerini temiz exact-main çalışma alanında tek PR'a almayı önerir: explicit-path commit/push, PR, zorunlu otomatik CI ve normal merge; deploy/CI manuel tekrar0. Mevcut playback planı ve diğer kullanıcı dosyaları kapsam dışıdır. Entegrasyon için ayrı devam onayı gerekir; bu gate'te Git yayını yapılmadı. Main değişmişse farklar yeniden uzlaştırılır; otomatik geniş staging veya üzerine yazma yok. Bu yalnız test/belge entegrasyonudur, yeni canlı kurtarma kanıtı sayılmaz.

## 55. PR #198 entegrasyonunun güncel kayda alınması — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_MISSING_WEBHOOK_TEST_INTEGRATION — PASS / CI.** [PR #198](https://github.com/4rmus/youtick/pull/198) 18:17:33 UTC'de normal squash ile main'e birleşti: **f28b3031cf860d5810c2cb9db0de8b255605f712**. İki test dosyası ve bu üç canonical belgenin biriken kayıtları taşındı; [PR CI34710109432](https://github.com/4rmus/youtick/actions/runs/34710109432) ve [main CI34710745980](https://github.com/4rmus/youtick/actions/runs/34710745980) success. Bridge380PASS/3SKIP; tip kontrolü, mock canary, dry-run, belgeler, güvenlik taramaları ve CI Gate geçti. PR ve squash commit'in dosya ağacı eşit.

[Preview34711356384](https://github.com/4rmus/youtick/actions/runs/34711356384) skipped; iki deploy anahtarı false. Yeni provider/NEAR/D1/Queue mutasyonu veya gerçek deploy0. Eski dirty çalışma alanının278dosyası/HEAD/index/status korundu. Yerel main checkout HEAD'i b53e00e, origin/main f28b303; bu bilinçli korumadır, entegrasyon eksikliği değildir. §54'teki henüz-commit/push/entegrasyon-yapılmadı cümleleri o yerel gate'in tarihsel durumudur; **entegrasyon tekrar başlatılmaz**. Kanıt `tmp/video-public-testnet-missing-webhook-integration-20260912/receipt.json`; bu belge incelemesinde GitHub main/PR/CI ayrıca yenilendi, yeni CI veya Git yazımı yapılmadı. Davranışı taşıyan son public-testnet deploy hâlâ kayıtlı b53e00e yayınıdır; runtime bu incelemede yeniden ölçülmedi.

## 56. İlk sürüm kalan kabul matrisi — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_V1_REMAINING_ACCEPTANCE_REVIEW — COMPLETED_WITH_WARNINGS.** Amaç kapananları tekrar açmadan ilk kontrollü public-testnet sürümünün açık kabulünü netleştirmekti. Yalnız current-state, Video V1 planı, bu günlük ve yeni yerel kanıt değişti; uygulama/test/config/playback planı, Git index/HEAD ve canlı ortam korundu. GitHub main f28b303 ve başarılı main CI taze okundu; servis, tarayıcı, provider ve zincir kabulü yeniden çalıştırılmadı.

**Tamamlanan / yeniden çalıştırılmayacak:** kayıtlı işlevsel yükleme→Discover→satın alma/izleme ve Playback kabulü; aynı dosya/iş/TUS resume ile yanlış hesap/dosya koruması (§25); üretici çekimi (§35); 5GB/120dk aktarım→yayın (§45); iki yükleme+iki ayrı hesapla izleme (§47); zamanında yayımlanan videoya24saat sonrası erişim (§47–48); sentetik yinelenen/eski bildirim (§52); kayıp bildirim yerel kapsamı ve kaynak entegrasyonu (§54–55). Her kaydın önceki uyarıları korunur; bunlar tek bir kusursuz uçtan uca koşu diye birleştirilmez.

**Kullanıcı kabulüyle kapalı:** maliyet/hızdaki ilk görüntü, örnek/p95/cache ve kesin ek fatura eksikleri (§33); tarayıcı/yavaş ağdaki Auto toparlanma, eksik örnekler ve ölçüm aracı sınırları (§39); önceki Playback ve resume kapanışlarının uyarıları. Bu kararlar yeni canlı dayanıklılık ertelemesi anlamına gelmez. **1.000 izleyici testi kullanıcı isteğiyle kapsam dışı**; ilk sürüm kapasite kabulü2+2PASS. Canlı global10iş limiti bu kullanıcı kararıyla değiştirilmedi.

| Açık kabul | Eldeki kanıt | Kapanış için gereken / karar durumu |
|---|---|---|
| Kayıp bildirim | LOCAL_TEST + CI; uzun işin otomatik toparlanması kısmi canlı kanıt | Bildirimin gerçekten gelmediği kontrollü canlı koşu UNPROVEN; uygun iş ve güvenli hedefe özgü engelleme yolu yok. Erteleme kabul edilmedi. |
| Queue zorlanmış yeniden teslim/retry | Yerel ve tarihsel eski Preview kanıtı | Güncel public-testnet'te hedefli tekrar teslim UNPROVEN; terminal2ACK veya DLQ temizliği bunun yerine geçmez. Erteleme kabul edilmedi. |
| Erken/geç alarm | Yerel zamanlama/restart/son tarih testleri | Gerçek platformdaki kontrollü erken/geç teslim UNPROVEN. Erteleme kabul edilmedi. |
| Bitmemiş işte24saat sonu + geç ready reddi | Sabit son tarih ve yerel ret kanıtlı | Gerçek süre dolumu UNPROVEN; yayımlanmış videonun25saat sonrası izlenmesi bu koşul değildir. Erteleme kabul edilmedi. |
| Devam eden iş varken close/drain | Önceki kapalı/drain ayar/yayın kayıtları | Yeni iş reddi + mevcut işin korunması aynı canlı koşuda UNPROVEN. Açık sistemi sırf test için kapatma bu incelemenin önerilen sonraki işlemi değildir. |
| Eski beta korunumu | Önceki izolasyon/koruma kayıtları | Güncel sürüm/iş/veri karşılaştırması ayrı kapatılmadı; sonraki salt-okunur paket budur. |
| Ek sınır/biçim kabulleri | Başlangıç matrisi§6; dar5GBaktarımı geçti | 5GB+1, diğer container'lar ve120dk kesintisiz oynatma geniş kapsamı tamamlanmış sayılmaz. İlk sürümde zorunlu mu/ertelenecek mi açık karar gerektirir; dar yükleme gate'i bunları kendiliğinden kaldırmadı. |
| Nihai Video V1 kabulü | Yukarıdaki kanıtlar ve kabul edilmiş uyarılar | Kalan kanıtlar veya maddeleri adıyla belirten açık kullanıcı kabulü gerekir. NOT_COMPLETE korunur; açılış/mainnet/deploy yetkisi verilmez. |

Bu tablo **8 açık kabul başlığıdır; 8 yeni geliştirme veya 8 mimari faz değildir**. Yönetilebilir kapanış sırası üç gruptur: **eski beta korunumu → beş canlı dayanıklılık ve ek sınır/biçim kararları → nihai V1 kabulü**. Yerel test eksikliği giderildi; sırf canlı hata üretmek için yeni servis, ortak webhook kapatma veya ikinci ücretli iş otomatik eklenmez. Mevcut kanıtla geçmeyen maddeler “PASS” ya da “kullanıcı erteledi” yapılmadı. Ana mimaride Faz3 aktif; sonrası3faz ve ayrı operasyon/arşivleme/Mainnet işleri bu incelemeyle kapanmaz.

**Önerilen tek sonraki gate: VIDEO_PUBLIC_TESTNET_OLD_BETA_READONLY_REGRESSION — BAŞLATILMADI.** Kaynaktaki eski Preview Web `https://preview.youtick.net` / `youtick-web-preview` ve Bridge `https://bridge-preview.youtick.net` / `youtick-livepeer-bridge-preview` hedefleri kullanılır. Önce son başarılı Preview yayını ve konfigürasyonundan eski Market/Access/proje/asset kimlikleri çözülür; yeni public-testnet kimlikleri yerine konmaz. Ardından sürüm/health, aynı FINAL bloktaki mevcut iş/yayın verisi ve en çok3bilinen asset metadata/policy bağlantısı karşılaştırılır. Beklenen expired/closed beta politikası varsa açılmaz; baseline eksikse varsayım üretilmez. Bu salt-okunur kabul yeni yükleme/satın alma/tam oynatma kanıtı değildir.

Paket sınırı **15 dakika, en fazla40dış okuma, en fazla3asset metadata okuması**; ödeme/yükleme/cüzdan imzası/izleyici oturumu/webhook/Queue/config/deploy **0**. Salt-okunur NEAR query/block çağrıları POST taşıması kullanabilir; zincir işlemi gönderilmez. Production/mainnet hariç. Paket `next-package.json`; genel risk ertelemesi onayı değildir. “Devam” yalnız bu sonraki gate'i başlatır; beş dayanıklılık veya ek sınır uyarısının kabulü yerine geçmez.

Kanıt `tmp/video-public-testnet-remaining-acceptance-review-20260912/acceptance-matrix.json`, `source-refresh.json`, `next-package.json`, `receipt.json`, `checks.json`. Belge derlemesi, explicit-path diff kontrolü ve275korunan dosya kontrolü yapıldı. Bu incelemede uygulama testleri/CI rerun, canlı test, yeni ödeme/upload, provider/Queue/NEAR/D1 yazımı veya Git yayını çalıştırılmadı. Genel Video V1 **NOT_COMPLETE**.

## 57. Eski beta kapsamının kaldırılması ve mevcut sürüm kontrolü — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_V1_SCOPE_SIMPLIFICATION — PASS.** Kullanıcı eski beta sürümünün önemli olmadığını, her iki sürümdeki videoların test/deneme verisi olduğunu belirtti. Bu tercih doğrultusunda **eski beta regresyonu V1 kabul şartından çıkarıldı (NOT_REQUIRED_BY_USER)**; §56'daki eski beta paketi başlatılmayacak. Bu karar eski servisleri kapatma, video/asset/yayın silme, hesap/anahtar temizleme veya eski verileri yeni ortama taşıma yetkisi değildir. Mevcut ve eski videolara dokunulmadı.

**Mevcut sürümün temel işlevleri çalışıyor:** önceki gerçek2yükleme+2ayrı hesapla izleme kabulü§47PASS; satın alma/izleme/çekim kayıtları korunur. Güncel salt-okunur kontrolde public Web ana sayfasıHTTP200, Bridge status=ok ve newUploadReady/playbackReady=true, read-model status=ok. FINAL blok268286657 içinde10yayının10'u ACTIVE; mevcut M2 katalog kaydı doğru publication kimliğiyle döndü. Okuma 2026-09-12T18:59:23.358117+00:00. Bridge `0f45b81e-8f7d-485c-aad8-51e076910a3c`, read-model `91063507-21ec-46df-8d56-2542b8d6e37b`. Web için ilk /__health isteği404 verdi; bu uç Web'de bulunmadığı için ana sayfa kontrolü kullanıldı, uygulama arızası diye raporlanmadı.

Bu kontrol yeni bir tarayıcı oynatma veya ücretli yükleme testi değildir; health/ACTIVE tek başına yeni uçtan uca kanıt sayılmaz. İşlevsel değerlendirme önceki gerçek testlerle bu güncel servis/veri okumasının birlikte değerlendirilmesidir. Kaynak main f28b303 ve PR/main CI PASS kaydı§55'te; yeni deploy yapılmadı.

**Kalan kapsam sadeleşti:** yedi açık başlık (beş canlı dayanıklılık, ek sınır/biçim kararı, nihai V1 kabulü), iki kapanış grubu. Bu beş hata senaryosunun canlı kanıtı ve ek biçim/sınır testleri hâlâ UNPROVEN; kullanıcının eski beta tercihi bunları da ertelemiş veya kabul etmiş sayılmaz. Yeni1.000izleyici testi yok;2+2kapalı ve önceki maliyet/hız/tarayıcı/Playback kabulleri korunur.

**Tek sonraki gate: VIDEO_PUBLIC_TESTNET_V1_ACCEPTANCE_DECISION — BAŞLATILMADI.** Yalnız mevcut sürüm için kalan dayanıklılık ve ek sınır/biçim maddelerini, normal kullanımda kanıtlanan akışlardan ayrı kısa bir kabul kararına dönüştürmek. Kullanıcı bu maddeleri açıkça kabul ederek ertelemeyi seçerse uyarılarla V1 kapanışı önerilebilir; bu tur nihai kabul veya yeni erteleme verilmedi. Eski beta kontrolü araya alınmaz. Genel Video V1 NOT_COMPLETE, Mainnet/Production açılışı kapsam dışı.

Yalnız üç canonical belge ve `tmp/video-public-testnet-v1-scope-simplification-20260912/` kanıtları değişti. Uygulama/test/config/Git/CI/deploy, ödeme/upload, provider/Queue/NEAR/D1 mutasyonu0;275diğer tracked dosya korundu. Kanıt live-check.json, acceptance-matrix.json, receipt.json ve checks.json. Belge derlemesi ve explicit-path diff kontrolü yapıldı.

## 58. Kontrollü testnet V1 kabul kararı — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_V1_ACCEPTANCE_DECISION — COMPLETED_WITH_WARNINGS / KARAR PAKETİ HAZIR.** Kullanıcının “önerdiğin gibi devam et” talimatıyla mevcut sürüm için somut kapanış önerisi hazırlandı. Öneri **V1-CONTROLLED-TESTNET-WARNINGS-20260912**; kullanıcı onayı henüz verilmedi. Bu gate'in hazırlık sonucu, genel V1 kabulü değildir; genel Video V1 **NOT_COMPLETE / USER_DECISION_PENDING** kalır.

**Öneri:** mevcut kontrollü public-testnet V1'i **COMPLETED_WITH_WARNINGS** olarak kapatmak ve aşağıdaki altı ek test grubunu kayıtlı uyarıyla ertelemek. Mevcut kullanıcı akışları için yükleme/Discover/satın alma/izleme/çekim, aynı işten devam,5GB/120dk kaynak aktarımı ve yayını,2+2eşzamanlılık ve terminal tekrar kanıtları korunur. PR #198/main f28b303 ve380PASS/3SKIP CI kaydı§55'tedir; son servis/veri kontrolü§57'nin18:59UTC kaydıdır, bu tur yenilenmedi.

| Sonraya bırakılması önerilen test | Kabul edilirse açık kalacak sınır |
|---|---|
| Hazır bildiriminin kaybolması | Bildirimsiz toparlanmanın canlı güvencesi yok; takılan iş inceleme gerektirebilir. |
| Zorlanmış kuyruk tekrar teslimi | Yerel korumalar ve terminal tekrar geçti; gerçek retry koşulu ayrıca sınanmadı. |
| Erken/geç platform alarmı | Yerel saat/restart testleri var; gerçek alarm gecikmesindeki toparlanma süresi kanıtlanmadı. |
| Bitmemiş işin gerçek24saat sonu + geç ready | Sabit son tarih/yerel ret var; gerçek süre sonu birleşimi canlıda sınanmadı. |
| Devam eden iş varken close/drain | Yeni iş reddi ve mevcut işin korunması birlikte canlı sınanmadı; ilk böyle kapatma öncesi ele alınmalı. |
|5GB+1, diğer dosya biçimleri ve120dk kesintisiz izleme | Başarılı5GBkaynak aktarımı bu ek güvenceleri kapsamıyor. |

Bu maddeler onayla **testten geçmiş sayılmayacak**; teknik kanıtları UNPROVEN kalırken ürün kabul durumları DEFERRED_BY_USER_ACCEPTANCE olacaktır. Erteleme, yeni bir olay çıktığında aynı ödenmiş işi koruyarak inceleme yapılmasını veya ilgili garanti verilmeden önce doğrulamayı engellemez. Ayrıntılı geri dönüş koşulları decision-package.json içinde kayıtlıdır.

Önceden kabul edilen maliyet/hız, tarayıcı/yavaş ağ, Playback ve resume uyarıları aynı kalır. Eski beta regresyonu ve1.000izleyici testi kullanıcı kararıyla kapsam dışıdır; tekrar eklenmez. Kontrollü testnet kabulü Mainnet/Production hazır olma, tüm mimari fazların tamamlanması, yeni deploy, veri silme, ödeme veya yükleme yetkisi değildir.

**Tek sonraki gate: VIDEO_PUBLIC_TESTNET_V1_ACCEPTANCE_CLOSEOUT — ONAY BEKLİYOR.** Bu somut pakete açık onay verilirse yalnız üç canonical belgede altı erteleme ve genel COMPLETED_WITH_WARNINGS kapanışı kaydedilir, kabul döngüsü durur. Kullanıcının paketi gördükten sonra “önerdiğin gibi devam et” demesi de bu belge kapanışına onaydır; aynı onay yeniden istenmez. Onay verilmezse NOT_COMPLETE korunur ve hangi test grubunun gerekli olduğu seçilir; ücretli/canlı test kendiliğinden başlamaz.

Bu tur yalnız current-state, Video V1 planı, bu kabul günlüğü ve `tmp/video-public-testnet-v1-acceptance-decision-20260912/` değişti. Kod/test/config/Git/CI/deploy ve canlı veri/medya işlemi0. Belge derlemesi, explicit-path diff kontrolü ve275korunan dosya kontrolü checks.json içinde. Paket decision-package.json; hazırlık receipt.json ile kaydedildi.

## 59. Kullanıcı onayıyla kontrollü testnet V1 kapanışı — 12 Eylül 2026

**VIDEO_PUBLIC_TESTNET_V1_ACCEPTANCE_CLOSEOUT — COMPLETED_WITH_WARNINGS / KAPALI.** Kullanıcı §58'deki **V1-CONTROLLED-TESTNET-WARNINGS-20260912** karar paketine **“onaylıyorum”** yanıtını verdi. Mevcut kontrollü public-testnet **Video V1 genel kabulü COMPLETED_WITH_WARNINGS olarak tamamlandı**. Kullanıcı onayı kaydedildi; kabul döngüsü durduruldu. **Aktif veya otomatik sonraki V1 gate'i yok.**

| Onaylanan erteleme | Ürün kabul durumu | Teknik kanıt |
|---|---|---|
| Hazır bildiriminin gerçekten kaybolması | DEFERRED_BY_USER_ACCEPTANCE | Kontrollü canlı koşu UNPROVEN; mevcut yerel/CI kanıtı korunur |
| Kuyruğun zorlanmış tekrar teslimi | DEFERRED_BY_USER_ACCEPTANCE | Güncel canlı retry koşulu UNPROVEN; terminal tekrar kabulü korunur |
| Erken/geç platform alarmı | DEFERRED_BY_USER_ACCEPTANCE | Gerçek kontrollü zamanlama UNPROVEN; yerel saat/restart kanıtı korunur |
| Bitmemiş işte gerçek24saat sonu + geç ready | DEFERRED_BY_USER_ACCEPTANCE | Gerçek süre sonu birleşimi UNPROVEN; sabit süre/yerel ret kanıtı korunur |
| Devam eden iş varken yeni kabulleri kapatma | DEFERRED_BY_USER_ACCEPTANCE | Birleşik canlı close/drain koşulu UNPROVEN |
|5GB+1, diğer biçimler ve120dk kesintisiz izleme | DEFERRED_BY_USER_ACCEPTANCE | Bu ek kabuller UNPROVEN;5GB/120dk kaynak aktarımı ve yayın PASS korunur |

Bu altı grup geçilmiş test olarak yeniden etiketlenmedi. §58'deki anlamları ve yeniden ele alma koşulları geçerlidir; örneğin aktif işler varken ilk planlı close/drain veya yeni biçim/sınır için garanti öncesi ilgili kanıt gerekir. Erteleme, yeni bir arıza görülürse aynı işi koruyarak inceleme yapılmasını engellemez. Eski beta regresyonu ve1.000izleyici testi kullanıcı kararıyla kapsam dışı kalır; tekrar kabul şartı yapılmaz.

**Korunan kabul:** yükleme→Discover→satın alma/izleme/üretici çekimi kayıtları; aynı dosya/iş/TUS resume ve kimlik/son tarih korumaları;5GB/120dk kaynak aktarımı ve yayın;2eşzamanlı yükleme+2ayrı hesapla izleme; zamanında yayımlanan videoya24saat sonrası erişim; sentetik terminal tekrarında2ACK ve10dakikalık sabit durum; public-testnet yerel kurtarma testleri ve PR #198 CI entegrasyonu. Önceden kabul edilmiş maliyet/hız, tarayıcı/yavaş ağ, Playback ve resume uyarıları aynen korunur.

**Kapanışın sınırı:** yalnız mevcut kontrollü testnet V1 kabulüdür. Mainnet/Production açılışı veya tüm mimari fazların kapanışı değildir. Yeni yükleme, ödeme, video/asset silme, servis kapatma, provider/Queue/NEAR/D1 işlemi, deploy veya Git/CI yayını yapılmadı. Önceki kaynak/CI/runtime kanıtı kullanıldı; bu belge kapanışı yeni canlı test veya sağlık ölçümü üretmedi.

Yerel değişiklikler yalnız current-state, Video V1 planı ve bu kabul günlüğündedir; onay/kapanış kanıtı `tmp/video-public-testnet-v1-acceptance-closeout-20260912/` içinde. `approved-decision.json` özgün teklifin SHA256 özetini ve kullanıcı onayını, `acceptance-matrix.json` açık V1 maddesi kalmadığını ve teknik UNPROVEN kayıtlarının korunduğunu kaydeder. Belge derlemesi, explicit-path diff ve275diğer tracked dosya koruma sonucu checks.json'dadır. HEAD/index/status korundu; kapanış belgeleri bu tur commit/push edilmedi.

**Sonuç: kontrollü testnet V1 uyarılarla kabul edildi. Blocker yok; sonraki gate yok.** Aşağıdaki/önceki tarihsel NOT_COMPLETE, USER_DECISION_PENDING ve sonraki-gate önerileri bu kapanışın güncel durumunu değiştirmez.
