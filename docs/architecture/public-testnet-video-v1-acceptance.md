# Public Testnet Video V1 — kontrollü kabul hazırlığı

7 Eylül 2026 · `VIDEO_CONTROLLED_ACCEPTANCE_PREFLIGHT`

**Hazırlık: COMPLETED_WITH_WARNINGS. Canlı kabul: BLOCKED / NO_GO.**
Bu belge işlem veya harcama onayı değildir. İlk gerçek test tanımlıdır; aşağıdaki kaynak ve canlı önkoşullar kapanmadan çalıştırılmaz. Yeni özellik, servis sağlayıcı değişimi veya kapasite refaktörü önerilmez.

## 1. Güncel kanıt ve eksikler

| Konu | Doğrulanan durum | Canlı teste geçiş şartı |
|---|---|---|
| Çalışma alanı | HEAD `d2d3b035ac1e3afa348f353b014339ab46290e16`, branch `agent/closed-preview-bootstrap-smoke`, kullanıcı/önceki gate değişiklikleri mevcut. Son kalite gate'inin 31 dosya hash'i aynı. | Yalnız bu video çalışmasının farkı güncel main üzerinde korunarak bütünleştirilmeli; exact commit/artifact/çalışan sürüm bağı kurulmalı. Bu dirty checkout doğrudan yayın adayı değil. |
| GitHub | Salt okunur kontrol: main `d1b75ab4e6ded6a58d72344df13e473ac7f880e7`; [CI 34115478261](https://github.com/4rmus/youtick/actions/runs/34115478261) ve [Deploy Preview 34116569878](https://github.com/4rmus/youtick/actions/runs/34116569878) success. | Bunlar bu yerel video farkının CI/runtime kanıtı değildir. Bu gate canlı endpoint/version okumadı. |
| Yayın yolu | `VIDEO_PUBLIC_TESTNET_RELEASE_SOURCE` ile ayrı public artifact, korumalı workflow ve closed/acceptance/drain matrisi kaynakta tamamlandı; yerel testler geçti. | Exact main/CI entegrasyonu ve gerçek GitHub environment/vars/secrets kurulumu bekliyor; workflow çalıştırılmadı. |
| Kalite | Live canary `LIVEPEER_PLAYBACK_CANARY_ADAPTIVE=true` ile adaptive hash ve `verifyAdaptive: true` seçeneğini uçtan uca iletiyor; iki tarayıcı için PASS zorunlu ve raporda korunuyor. | Gerçek medya testi yapılmadı. Bu teşhis CLI'si ayrıca 80 MiB geçerli MP4, provider asset ve signing-key oluşturma/silme izinleri ister; S dosyasıyla normal kullanıcı akışının yerine geçmez. |
| Provider | Runbook'ta `LIVEPEER_PROCESSING_UNBLOCK` açık. Önceki 5 Eylül kanıtı teslim sonrası waiting gösteriyor; güncel çözüm/proje durumu bu gate'te okunmadı. | Destek/çözüm kanıtı ve güncel proje/task okuması. Genel yeşil durum sayfası veya eski ready asset yeterli değil. Yeni ücretli deneme otomatik yapılmaz. |
| Fatura | Resmî fiyat sayfası okundu; hesaba özel güncel plan/kota/fatura görülmedi. | Hesap koşulları, kalan kota, çıktı sayısının ücret hesabı ve saklama süresi salt okunur doğrulanmalı. |

Önceki gate'lerin sonuçları yeni test koşusu olarak sunulmaz. Kaynak/test başarısı `LOCAL_STATIC / LOCAL_TEST`; güncel CI ve deploy kayıtları yalnız yukarıdaki ayrı SHA içindir. Provider ve yeni ortamın çalışması `UNPROVEN` durumundadır.

## 2. Yeni ortamın doldurulacak işlem kimliği

| Alan | Hazır kaynak hedefi / zorunlu kanıt |
|---|---|
| Ağ | Yalnız `testnet` |
| Web / Bridge | `youtick-web-public-testnet` / `youtick-livepeer-bridge-public-testnet`; `public-testnet.youtick.net` / `bridge-public-testnet.youtick.net` |
| Read model | `youtick-market-read-model-public-testnet`; kaynakta `read-public-testnet.youtick.net` bağlama ve Web URL'si hazır, canlı kurulum yapılmadı |
| Queue / DLQ | `youtick-livepeer-events-public-testnet` / `youtick-livepeer-events-dlq-public-testnet` |
| D1 | Yeni `youtick-market-read-model-public-testnet`; gerçek database UUID gerekli. Eski `50b1e14f-2b06-444b-98cf-b828f11277ef` kullanılamaz. |
| Market / Access | Yeni, birbirinden farklı gerçek testnet hesap kimlikleri gerekli. Testlerdeki `public-video-market.testnet` ve `public-video-access.testnet` kurulu kaynak sayılmaz. |
| Başlangıç bloğu | Yeni Market kurulumunun kesinleşmiş bloğu; testlerdeki sabit sayılar kullanılamaz |
| Roller | Admin, guardian, operator, relayer ve ayrı sonlu anahtarların public kimlikleri/yöntem izinleri; maskeli parity kanıtı. Secret değerleri bu belgeye yazılmaz. |
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

- `small-60s.mp4`: SHA-256 `67d6477e9f81d478dad012e33f12f49abfe0ade9e401f3f44e4b635fd5a4e8fd`.
- `medium-10m.mp4`: SHA-256 `40fcd876e157e0e1663f5deace4cfcbf10988815f3cb4604d8acd053ac007382`.

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
| Kaynak entegrasyonu | Exact dosya listesi ve korunmuş fark; güncel main, commit/PR/CI/merge eylemleri ayrı açık onayla. Bu preflight bunları yapmadı. |
| Ayrı kaynak/Market kurulumu | Tam hesap, D1 UUID, Queue, domain ve key public kimlikleri; max NEAR/storage, initializer argümanları ve WASM hash; kesinleşmiş kurulum bloğu. Belirsiz sonuçta yeniden init yok. |
| Kapalı yayın/açma/kapatma | Korumalı workflow adı ve exact artifact; tam bayrak matrisi, Queue consumer/read-model/domain adımları, Market pause/unpause ve doğrulanmış kapalı dönüş sürümü. Dashboard/CLI ile workflow atlanmaz. |
| Küçük ücretli deney | Yukarıdaki S dosyası hash'i, gerçek A/C/D hesapları, tek upload/bilet, onaylı ek bütçe ve kapatma sınırları. Aynı onay M/L/yük testi yetkisi olmaz. |
| Sonraki ekonomik/provider adımlar | Her çekim, fault injection, takedown/delete, büyük dosya veya yük testi için exact iş/asset kapsamı ve güncel tutar. Kör retry yok. |

## 8. Tamamlanan yayın kaynağının kullanım sınırı

`deploy-public-testnet.yml` yalnız elle çağrılır ve main geçmişindeki exact SHA için başarılı push CI ister. Önce tek public Web/Bridge/read-model artifact'i ve SBOM/provenance üretilir; ayar matrisi review özeti olarak gösterilir. `DEPLOY_PUBLIC_TESTNET_ENABLED` açık değilse deploy yapılmaz. Deploy işi `public-testnet` environment'ına bağlıdır ve gerçek required-reviewers kuralını ayrıca denetler; artifact doğrulaması olmadan Cloudflare sırları kullanılmaz. Bu dosya GitHub'a yayımlanmadı.

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

## 9. Entegrasyon kaydı

61 dosyalık video paketi `d1b75ab4e6ded6a58d72344df13e473ac7f880e7` main tabanında ayrı yerel çalışma alanına birleştirildi. #178 yükleme durumunu sekmeler arasında salt okunur izleme düzeltmesi korunur. Deploy işi paket kanıtlarını okumak için yalnız `attestations: read` alır; yazma/imzalama yetkisi build işinde kalır. Yerel test ve derleme kanıtı gerçek CI veya çalışan sürüm kanıtı sayılmaz.

**Tek sonraki gate: `VIDEO_PUBLIC_TESTNET_PR`.** Exact dosya listesi/patch ve test kanıtıyla ayrı branch'e tek commit, push ve taslak PR için onay. Merge/deploy ve bütün provider/ekonomik işlemler kapsam dışındadır. Canlı kabul hâlâ NO_GO; kaynak kurulumu, provider çözümü ve hesaba özel maliyet kanıtı bekleniyor.
