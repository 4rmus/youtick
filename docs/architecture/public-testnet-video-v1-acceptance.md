# Public Testnet Video V1 — kontrollü kabul hazırlığı

7 Eylül 2026 · `VIDEO_PUBLIC_TESTNET_BOOTSTRAP_PREFLIGHT` sırasında güncellendi

**Hazırlık: COMPLETED_WITH_WARNINGS. Canlı kabul: BLOCKED / NO_GO.**
Bu belge işlem veya harcama onayı değildir. İlk gerçek test tanımlıdır; aşağıdaki kaynak ve canlı önkoşullar kapanmadan çalıştırılmaz. Yeni özellik, servis sağlayıcı değişimi veya kapasite refaktörü önerilmez.

## 1. Güncel kanıt ve eksikler

| Konu | Doğrulanan durum | Canlı teste geçiş şartı |
|---|---|---|
| Çalışma alanı | Dirty checkout korunuyor. 61 dosyalık video paketi izole çalışma alanında bütünleştirildi; [PR #179](https://github.com/4rmus/youtick/pull/179) main'e alındı. Korunmuş adayın 61/61 dosyası receipt ile eşleşir. | Entegrasyon tekrarlanmaz. Yeni değişiklikler exact main'den ayrı hazırlanır; dirty checkout doğrudan yayın adayı değildir. |
| GitHub | Main `43fee5c4a04c8314579a9e089aa85c0fe06b03dd`; [CI 34161844285](https://github.com/4rmus/youtick/actions/runs/34161844285) 13/13 success; Market ve Access artifact/imzaları doğrulanmış. Preview deploy skipped, `DEPLOY_PREVIEW_ENABLED=false`. | Bu, kaynak ve sözleşme çıktılarının CI kanıtıdır; yeni public-testnet runtime ve canlı kullanıcı kabulü değildir. |
| Yayın yolu | Ayrı public artifact/korumalı workflow/mod matrisi PR #179, Access çıktı saklama/imzalama PR #180 ile main'e alındı. B01 ile korumalı environment, kapalı deploy değişkeni, boş D1 ve iki Queue oluşturuldu. | Market/Access, Worker/domain, consumer, migration, secrets ve canonical release config kurulmadı; deploy workflow'u çalıştırılmadı. |
| Kalite | Live canary `LIVEPEER_PLAYBACK_CANARY_ADAPTIVE=true` ile adaptive hash ve `verifyAdaptive: true` seçeneğini uçtan uca iletiyor; iki tarayıcı için PASS zorunlu ve raporda korunuyor. | Gerçek medya testi yapılmadı. Bu teşhis CLI'si ayrıca 80 MiB geçerli MP4, provider asset ve signing-key oluşturma/silme izinleri ister; S dosyasıyla normal kullanıcı akışının yerine geçmez. |
| Provider | 7 Eylül 19:56 UTC snapshot'ında 13/13 asset ready; tümü JWT ve yalnız 720p. Eski waiting kaydı güncel durum sayılmaz. | Yeni 360p+720p işleme, süreler ve normal kullanıcı akışı hâlâ kanıtlanmadı. Hazır eski asset yeni kabul yerine geçmez. |
| Fatura | Bağlı Livepeer hesap ekranı Growth planını gösterir. Fatura dönemi/tutarı ve kalan kota doğrulanamadı; boş dönemle gelen sıfır sayaçlar kullanılmaz. | İki çıktının ücret hesabı, saklama süresi, kota ve onaylı gerçek kullanım bütçesi gerekli. |

Önceki gate'lerin sonuçları yeni test koşusu olarak sunulmaz. Kaynak/test başarısı `LOCAL_STATIC / LOCAL_TEST`; main CI yalnız yukarıdaki SHA içindir. Yeni ortamın çalışması ve gerçek kabul `UNPROVEN` durumundadır. İmzalı Market manifestinin eski beta hedefi ve `CODE_UPDATE_ONLY` sınırı korunur; binary provenance'ı yeni hesap kurma yetkisi değildir.

## 2. Yeni ortamın doldurulacak işlem kimliği

| Alan | Hazır kaynak hedefi / zorunlu kanıt |
|---|---|
| Ağ | Yalnız `testnet` |
| Web / Bridge | `youtick-web-public-testnet` / `youtick-livepeer-bridge-public-testnet`; `public-testnet.youtick.net` / `bridge-public-testnet.youtick.net` |
| Read model | `youtick-market-read-model-public-testnet`; kaynakta `read-public-testnet.youtick.net` bağlama ve Web URL'si hazır, canlı kurulum yapılmadı |
| Queue / DLQ | `youtick-livepeer-events-public-testnet` / `youtick-livepeer-events-dlq-public-testnet` |
| D1 | B01 ile oluşturuldu: `youtick-market-read-model-public-testnet`, UUID `89871d60-3a26-4045-8694-5ff44af579db`, 0 tablo. Eski `50b1e14f-2b06-444b-98cf-b828f11277ef` kullanılmaz. |
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
| L — uzun | 120 dakika, ≤5.000.000.000 bayt; tam çözümleme ve hash gerekli | Henüz üretilmedi/seçilmedi; EXTERNAL_NOT_RUN |
| B — gerçek sınır | Tam 5.000.000.000 baytlık geçerli, oynatılabilir kaynak | Henüz hazırlanmadı; L bu boyuttaysa tek dosya yeterli. Yerel sayı/boş dosya testi gerçek 5 GB aktarım kanıtı değildir. |

- [small-60s.mp4](/Users/arair/works/youtick-lp/tmp/video-controlled-acceptance-preflight-20260907/media/small-60s.mp4): SHA-256 `67d6477e9f81d478dad012e33f12f49abfe0ade9e401f3f44e4b635fd5a4e8fd`.
- [medium-10m.mp4](/Users/arair/works/youtick-lp/tmp/video-controlled-acceptance-preflight-20260907/media/medium-10m.mp4): SHA-256 `40fcd876e157e0e1663f5deace4cfcbf10988815f3cb4604d8acd053ac007382`.

Örneklerin manifesti ve üretim/çözümleme logları `tmp/video-controlled-acceptance-preflight-20260907/` içindedir. Uzun/sınır örnekleri ilk küçük akış geçmeden hazırlanıp gönderilmez. Ek MOV/WebM/MKV örnekleri seçildiğinde aynı metadata kaydı gerekir.

## 4. Bütçe ve durma sınırları

**Bu gate'te yetkili dış harcama: 0 USD; ödeme/provider işlemi: 0.** Aşağıdakiler teklif niteliğindedir; kullanıcı tarafından onaylanmış bütçe değildir.

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

`deploy-public-testnet.yml` yalnız elle çağrılır ve main geçmişindeki exact SHA için başarılı push CI ister. Önce tek public Web/Bridge/read-model artifact'i ve SBOM/provenance üretilir; ayar matrisi review özeti olarak gösterilir. `DEPLOY_PUBLIC_TESTNET_ENABLED` açık değilse deploy yapılmaz. Deploy işi `public-testnet` environment'ına bağlıdır ve gerçek required-reviewers kuralını ayrıca denetler; artifact doğrulaması olmadan Cloudflare sırları kullanılmaz. Dosya PR #179 ile GitHub'a yayımlandı; public-testnet workflow'u çalıştırılmadı.

| Mod | Yeni yükleme/teklif/relay | Provider/operator, izleme | Discover/ingestion | Webhook Queue |
|---|---|---|---|---|
| `closed` (varsayılan) | Kapalı | Kapalı | Kapalı | Kapalı |
| `acceptance` | Açık | Açık | Açık | Açık |
| `drain` | Kapalı | Açık: mevcut işleri sürdürür | Açık | Açık |

Shadow, NEAR creator fee, multi-asset ve arşiv bayrakları kapalı kalır. Creator/job allowlist eklenmez. `drain` sponsor/quote anahtarlarını devam eden işlemler için korur; önceden imzalanmış tekliflerin zincirdeki geçerliliğini iptal etmez. Market pause/unpause veya yeni init bu Cloudflare workflow'unda yapılmaz; ayrı onaylı zincir işlemidir.

Kapalı base config, `PUBLIC_TESTNET_RELEASE_CONFIG` repo değişkeninde tam canonical JSON olarak saklanmalıdır. Gerçek Market/Access, D1 UUID, başlangıç bloğu, hesaplar ve pozitif bütçe/iş rezervasyonu gereklidir; canlı değerler burada uydurulmaz. Mode değişikliği yalnız mevcut `release-metadata.mjs config --environment public-testnet --input ... --mode ...` ile üretilir; Preview/Production config veya bundle gerekmez. `acceptance`/`drain` ilk kapalı kurulumun yerine geçemez.

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
