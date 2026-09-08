# Herkese açık YouTick Testnet Video V1

> 7 Eylül 2026 — VIDEO_PLAN_REVISION sonunda netleştirilen plan.
> Bu belge plan kaydıdır; uygulama veya canlı işlem yetkisi vermez.

## 1. Ürün hedefi ve sabit kararlar

**Desteklenen cüzdanını bağlayan herkes video yükleyebilecek, fiyat belirleyebilecek, satın alabilecek ve izleyebilecek.** Kullanıcı veya iş kimliği için önceden izin listesine eklenmek gerekmeyecek. Açılış öncesi testler, ürünün herkese açık olma hedefini değiştirmeyecek.

| Konu | Karar |
|---|---|
| Ortam | Yeni Market kimliğiyle ayrı testnet ortamı |
| Dosya sınırı | 5.000.000.000 bayt |
| Uzun içerik | 120 dakika destek ve test hedefi; süreye bağlı yeni ret kuralı yok |
| İş süresi | Ödemenin zincirde kabulünden itibaren değişmeyen 24 saat |
| Devam etme | Aynı tarayıcıda aynı dosyayı seçerek; gerektiğinde bir cüzdan onayı ve NEAR ağ ücreti |
| Kalite | 360p + 720p, bağlantıya göre otomatik seçim |
| Kapasite hedefi | 10 eşzamanlı yükleme, 1.000 eşzamanlı izleyici |
| İlk tarayıcı/cüzdan kapsamı | Mevcut desktop Chrome/Edge ve sponsorlu işlemi destekleyen Meteor testnet |
| Hız ve maliyet | Önce başlangıç ölçümü, ardından sayısal kabul hedefleri ve bütçe |

24 saat, **yüklemenin yayımlanması için verilen süredir**. Zamanında yayımlanan videonun izleme hakkını sona erdirmez. Anahtar yenileme, bağlantı kontrolü veya tekrar deneme bu süreyi uzatmaz.

Mevcut beta kendi sözleşmesi, takvimi ve verileriyle korunur. Yeni ortam, eski beta’nın toplam 10 iş ve 14 günlük kampanya sınırlarını devralmaz.

## 2. Ortam, sözleşme ve yetki

- Mevcut korumalı dağıtım araçlarına `public-testnet` hedefi eklenir. Yeni Web/Bridge, Market, Queue ve D1 kaynakları mevcut beta’dan ayrılır. Eski Preview/Production doğrulamaları korunur.
- Market’e `new_public_testnet` başlangıç metodu ve `get_public_upload_policy` okuması eklenir. Başlangıç mevcut kurulum kodunu kullanır; sabit 5 GB, 24 saat, imzalı teklif zorunluluğu ve desteklenen profilleri kaydeder. İlk kurulum kapalıdır.
- Bridge, ortam kimliğini ağ + Market + zincirdeki politika üzerinden doğrular. Yeni yükleme, provider işlemleri ve izleme bayrakları yalnız ilgili işlemi yönetir; politika kimliğini değiştirmez. Politika uyuşmazlığı işlemi durdurur.
- Herkese açık yüklemede mevcut sponsorlu USDC yolu kullanılır. Sözleşme geçerli imzalı teklifi, yaratıcıyı, iş kimliğini, tutarı, dosya boyutunu ve profili doğrular. Teklifsiz doğrudan ödeme yeni iş oluşturamaz.
- Son tarih mevcut `created_at_ms + 24 saat` üzerinden hesaplanır; yeni bir iş zamanlayıcı kaydı gerekmez. `replace_upload_key` aynı işi korur ve son tarihi aşamaz. Yeni ortamda `restart_paid_job` süreyi veya işi yeniden başlatma yolu olmaz.
- Operator, **yeni Market’te doğrulanmış tüm uygun işleri** yayımlayabilir. Yetki; doğru sahip, generation, profil, kaynak doğrulaması ve son tarihle sınırlanır. Mevcut sonlu NEAR anahtarı, iki izinli yöntem, kalıcı işlem kaydı ve işlem sıralaması korunur.

NEAR kesinleşmiş ödeme ve yayın otoritesi olarak kalır. Hızlandırma için bu kontroller gevşetilmez. [NEAR işlem yaşam döngüsü](https://docs.near.org/protocol/transactions/transaction-execution)

## 3. Video akışındaki değişiklikler

**Ölçüm**

- Kurulu oynatıcının `onPlaybackEvents` olayları kullanılır; yeni ölçüm kütüphanesi eklenmez.
- Ödeme hazırlığı, cüzdan beklemesi, aktarım başlangıcı/bitişi, provider durumunun görülmesi, yayın ve ilk görüntü ayrı ölçülür.
- Tarayıcı süreleri aynı oturumun saatinden, sunucu süreleri kendi gözleminden hesaplanır. Provider ve NEAR zamanları ilişkilendirme bilgisi olarak saklanır.
- Kuyrukta bekleme ile işleme süresi; ilk yetkilendirme, önbellekten yanıt ve token yenileme ayrı raporlanır. Ek politika/beta okumaları gerçek NEAR çağrı sayısına dahil edilir.

**Yükleme ve devam**

- Doğrudan Livepeer TUS aktarımı, aynı kaynak ve sıralı 32 MiB parçalar korunur.
- Aktarım tamamlandıktan sonra heartbeat’in yeniden başlaması engellenir; hesap değişimi ve sayfadan ayrılma mevcut iptal desteğine bağlanır.
- Sekme sonrası devam için yalnız secretsız iş ve dosya eşleştirme bilgisi saklanır. Anahtar ve TUS adresi kalıcı tarayıcı kaydına yazılmaz.
- `/v1/upload-intents` arayüzüne `recovery: "resume"` eklenir. Bu yol yalnız mevcut uygun işi ve TUS kaynağını döndürür; kayıp kaynakta yeni asset oluşturmaz.
- Yeni anahtarın cüzdan işlemi belirsiz kalırsa zincirdeki sonuç okunur. Otomatik ikinci ödeme veya yeni anahtar işlemi başlatılmaz.

**İşleme ve yayınlama**

- Kayıp hazır bildirimini sunucu alarmı tamamlar. Başarılı `waiting/processing` yanıtları hata sayacını artırmaz; başlangıç kontrol aralığı 60 saniyedir. Artan bekleme yalnız geçici hatalara uygulanır.
- Yeni yüklemeler kapalıyken, izinleri açık mevcut işler son tarihleri içinde tamamlanabilir.
- Aynı işin durum değişiklikleri mevcut sıralama mekanizmasından geçirilir. Farklı işler sınırlı paralel işlenir; Queue ayarları yeni ortamda ayrıca doğrulanır. [Cloudflare Queue paralelliği](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/)
- NEAR sonucu beklenirken kalıcı işlem hash’i üzerinden sınırlı durum okumaları yapılır. Bu kontrol yeniden işlem gönderme yolunu çağırmaz.
- Kullanıcı dosyanın teslimini, provider işlemesini, yayın doğrulamasını, hatayı ve süre dolumunu ayrı görür.

**İzleme ve kalite**

- Geçici token yenileme hatasında mevcut oynatıcı, ilerleme ve tampon korunur. Yeniden denemeler kalan token ömrüyle sınırlanır; kesin erişim reddinde veya süre bitiminde oynatma durur.
- Bağımsız Watch sorguları birlikte başlatılır.
- Yeni profil mevcut 720p çıktıya 360p ekler. Yeni işler yeni profil hash’ini, mevcut işler kayıtlı profillerini taşır. Provider oluşturma ve doğrulama girdileri beklenen profili açıkça alır.
- İki kalitenin gerçekten üretildiği, kalite geçişinin çalıştığı ve alt playlist/video parçalarının yetkisiz erişime kapalı olduğu doğrulanır.

**Discover ve normal kullanıcı akışı**

- Mevcut veri aktarma işi yeni Market’in başlangıç bloğundan çalıştırılır; dakika tetikleyicisi hem veri aktarımını hem mevcut finality kontrolünü bağımsız yürütür.
- Yeni yayının normal Discover listesinde görünmesi ve oradan izlenmesi kabul şartıdır. İlk veri isteğinin süre sınırı ve mevcut NEAR geri dönüşü korunur.
- Ekranlar yeni testnet politikasını gösterir; eski 14 gün/10 toplam iş metinleri yeni ortama taşınmaz. Test tokenı edinme ve yetersiz bakiye yönlendirmesi kullanıcı tarafından tamamlanabilir olmalıdır.

## 4. Kapasite, maliyet ve kabul

Herkese açıklık, herkes için aynı kapasite kurallarıyla uygulanır. Yeni ortamda global eşzamanlı iş sınırı 10; mevcut üretici başına bir aktif iş ve günlük iki yeni iş koruması korunur. Bunlar ödeme öncesinde görünür olur.

Mevcut teklif ön kontrolü, imzalı ödeme aktarımı öncesindeki rezervasyon ve provider oluşturma öncesindeki kontrol yeniden kullanılır. **Teklif almak tek başına kapasite rezervasyonu değildir.** Geçerli teklifle doğrudan zincire ödeme yapan bir iş kapasite bekleyebilir; plan bunun aksini vaat etmez.

Ölçüm ve kabul:

- Başlangıçta küçük, orta ve 5 GB/120 dakika kaynaklar ölçülür. Küçük örneklerden yükleme p95 veya kapasite başarısı çıkarılmaz.
- Chrome/Edge üzerinde normal ve yavaş bağlantıda ilk görüntü, kısa aralıklı tekrar, gerçek token yenileme ve uzun izleme ölçülür.
- Yerel yetkilendirme yükü farklı hesap/anahtar/sertifikalarla sınanır; aynı imzalı isteğin tekrarı 1.000 izleyici sayılmaz.
- Gerçek medya dağıtım kapasitesi ayrıca bütçelenmiş provider/CDN koşusuyla kanıtlanır. Yerel sonuç gerçek 1.000 izleyici başarısı olarak sunulmaz.
- Kesinti, sekme kapatma, yanlış dosya/hesap, kayıp bildirim, sıra dışı bildirim, gecikmiş alarm, süre dolumu ve kapatma bayrakları sınanır.
- Kurtarmada ikinci ödeme, ikinci asset ve ikinci publication sayısı **sıfır** olmalıdır.
- Önceden tanımlanmamış yeni kullanıcıların yükleme → Discover → satın alma → izleme ve üretici kazancını çekme akışları geçmelidir.
- Eski beta ve mevcut yayınların davranışı regresyon testleriyle korunur.

Mevcut **sıcak token yetkilendirmesi p95 <500 ms** hedefi korunur. Diğer hız hedefleri ve bütçe, seçtiğin üzere başlangıç ölçümünden sonra belirlenir. İş başına ayrılan operasyon bütçesi, gerçek işleme/depolama/izleme maliyetiyle aynı sayı kabul edilmez.

## 5. Uygulama sırası ve gate sonucu

Sıra: **ölçüm altyapısı → herkese açık sözleşme ve ortam desteği → yükleme/izleme düzeltmeleri → kalite ve Discover → kontrollü kabul → herkese açık testnet açılışı**.

Canlı açılış için provider işleme sorununun güncel çözüm kanıtı, gerçek birim maliyet bütçesi ve çalışan sürümün doğrulaması gerekir. Kurulum, ödeme, provider ve dağıtım işlemleri ayrı somut işlem paketleriyle yürütülür.

**VIDEO_PLAN_REVISION: COMPLETED_WITH_WARNINGS.** Mimari ve ürün kapsamı netleştirildi. Dosya değiştirilmedi; `git diff --check` geçti. Testler ve canlı işlemler bu gate’te çalıştırılmadı. Gerçek hız, maliyet ve kapasite sonuçları henüz kanıtlanmış değil.

## 6. Güncel yerel ilerleme — 7 Eylül 2026

- **`VIDEO_PERFORMANCE_BASELINE`: COMPLETED_WITH_WARNINGS (`LOCAL_STATIC / LOCAL_TEST`).** Ölçüm kodu ve karşılaştırılabilir yerel senaryolar tamamlandı. Gerçek video hızları, provider maliyeti ve canlı kapasite kanıtlanmadı.
- **`VIDEO_PUBLIC_TESTNET_SOURCE`: COMPLETED_WITH_WARNINGS (`LOCAL_STATIC / LOCAL_TEST`) / NOT_DEPLOYED.** Yeni Market başlangıcı kapalıdır; 5 GB, imzalı sponsorlu USDC, sabit 24 saat, üretici başına bir aktif iş/günlük iki iş sözleşmede korunur. Eski beta'nın 10 toplam iş/14 gün sınırı yeni ortama taşınmaz. Anahtar yenileme süreyi uzatmaz; zamanında yayımlanan içerik bu süre sonunda sona ermez.
- Web/Bridge yeni ortamı `public-testnet` kimliğiyle ayırır. Bridge zincirdeki politika ve işin aidiyetini doğrular; yeni yükleme kapansa da mevcut işin kimliği değişmez. Yeni ortamda 10 eşzamanlı kabul sınırı vardır; bu gerçek yükleme kapasitesi kanıtı değildir.
- Mevcut yayın araçları ayrı Web/Bridge hedefi, D1/Queue adları, kapalı yapılandırma ve isteğe bağlı `public-testnet` artifact doğrulamasını destekler. Preview/Production doğrulamaları korunur. Gerçek hesap/kaynaklar ve korumalı public-testnet workflow/ayarları kurulmadı; Git/CI/deploy veya provider işlemi yapılmadı.
- Bu kaynak gate'inde kayıtlı mevcut 720p profil korunur. 360p eklenmesi, devam etme/oynatıcı düzeltmeleri ve Discover işi tamamlanmış sayılmaz. Eski kullanıcı değişiklikleri korunmuştur.

- **`VIDEO_UPLOAD_PLAYBACK_SOURCE`: COMPLETED_WITH_WARNINGS (`LOCAL_STATIC / LOCAL_TEST`) / NOT_DEPLOYED.** Aynı tarayıcıda aynı dosya/iş eşleştirmesiyle `resume` yolu eklendi. Gereken anahtar yenilemesi tek cüzdan işlemiyle ve ilk son tarihle sınırlıdır; belirsiz sonuç otomatik yeni ödeme veya anahtar işlemi başlatmaz. Yerel kayıt yalnız dosya/iş bilgisi, deneme işaretleri ve gerektiğinde public-key özeti taşır; anahtar/TUS adresi kalıcı kayda yazılmaz.
- Aynı TUS kaynağı yeniden kullanılır; kayıp kaynakta yeni asset oluşturulmaz. Süresi dolmuş aktarım izni aynı iş için günlük sayacı/bütçeyi tekrar artırmadan alınır. Hesap değişimi ve sayfadan ayrılma aktarımı iptal eder; biten aktarımın heartbeat'i yeniden başlamaz.
- Normal bekleme/işleme kontrolleri 60 saniyede kalır; yalnız geçici hatalar artan bekleme kullanır. Yeni ortamın Queue teslimi en çok 10 mesajla paraleldir, iş içi sıralama korunur. Kayıtlı operator işlemi yeniden gönderilmeden sınırlı durum okumalarıyla izlenir.
- Geçici token hatasında oynatıcı korunur; kesin ret veya token süresinin dolması erişimi durdurur. Yayın ve izleme hakkı sorguları birlikte başlar. Yerel testler bu davranışları doğrular; gerçek uzun video, cüzdan, provider veya tarayıcı kullanıcı kabulü çalıştırılmadı.

- **`VIDEO_QUALITY_DISCOVER_SOURCE`: COMPLETED_WITH_WARNINGS (`LOCAL_STATIC / LOCAL_TEST`) / NOT_DEPLOYED.** Yeni işler 360p + değişmeyen 720p profilini seçer; eski işler kayıtlı hash ile devam eder. Profil tanımı tek JSON kaydındadır; yeni hash protokol kontrolünde yeniden hesaplanır. Yeni Market politikası güncel profili ilk sırada tutar; önceki tek profil politikası da okunabilir.
- Provider oluşturma ve hazır doğrulaması beklenen iş profilini açıkça alır. İki çözünürlük, JWT korumalı alt playlistler ve ilk/son segment ile key/map örneklerinin anonim erişime kapalı olması yayın öncesinde kontrol edilir. Eksik/yanlış profil veya açık medya yayını durdurur. Bu sınırlı kontroller tam videonun oynatıldığı anlamına gelmez.
- Oynatıcı otomatik kaliteyle başlar. Mevcut Chrome/Edge canary aracında `verifyAdaptive: true` seçeneği 360p → 720p sırasında ilerleyen görüntüyü ve otomatik seçime dönüşü ister; bu gate'te yalnız yerel harness testleri koşuldu, gerçek tarayıcı/provider kalite geçişi koşulmadı.
- Discover ilk isteği 2,5 saniyeyle sınırlıdır; hata, süre aşımı veya başka Market yanıtında mevcut NEAR geri dönüşü çalışır. Yerel test normal Discover kartının Watch bağlantısını doğrular. Dakika tetikleyicisi finality ve veri aktarımını ayrı yürütür; birinin hatası diğerini atlamaz. Yeni Market ve başlangıç bloğu birbirine bağlanır.
- Yayın aracı yeni `youtick-market-read-model-public-testnet` servisini, yeni D1/Market/başlangıç bloğuyla ve kapalı API/ingestion/backfill ayarlarıyla hazırlayabilir. Mevcut beta kaynaklarına dokunulmaz. Gerçek kaynaklar, domain ve korumalı workflow kurulumu henüz yapılmadı.
- Yeni testnet ekranları 5 GB, günlük iki iş, bir aktif iş ve sabit yayın son tarihini gösterir; eski 14 gün/10 toplam iş metni yeni ortamda görünmez. NEAR/Circle test tokenı bağlantıları ve yetersiz bakiye yönlendirmesi eklendi. Token edinme işlemi yapılmadı.
- Yerel Web/Bridge, sözleşme, read-model ve yayın aracı testleri; tip/lint, Web/WASM/protokol kontrolleri geçti. Web derlemesinde mevcut Next middleware/Edge uyarıları sürüyor. Gerçek medya üretimi, tam video oynatma, ağ koşullarına göre otomatik geçiş, 5 GB/120 dakika, hız/maliyet/kapasite ve canlı Discover → satın alma → izleme hâlâ kanıt bekliyor.

- **`VIDEO_CONTROLLED_ACCEPTANCE_PREFLIGHT`: COMPLETED_WITH_WARNINGS (`LOCAL_STATIC`) / canlı kabul BLOCKED.** [Kabul hazırlığı](./public-testnet-video-v1-acceptance.md) tamamlandı. Küçük ve orta sentetik kaynaklar yerelde üretildi, boyut/süre/hash kayıtları alındı; uzun ve gerçek 5 GB kaynak henüz hazırlanmadı. İlk tek-yükleme/tek-satın-alma akışı, durma noktaları, kanıt matrisi ve onaylanmamış bütçe önerisi ayrıldı.
- Son kalite gate'inin 31 dosya hash'i başlangıçta eşleşti. Bu hazırlık sırasında eksik olan public-testnet workflow/artifact, kontrollü açma/kapatma ve live canary kalite aktarımı sonraki `VIDEO_PUBLIC_TESTNET_RELEASE_SOURCE` gate'inde tamamlandı. Provider ve hesaba özel maliyet kabulü ayrı kalır; güncel envanter aşağıdadır.
- Uygulama/workflow/config değiştirilmedi; Git yayını, CI tekrar koşusu, deploy, ödeme, provider veya canlı NEAR/D1 işlemi yapılmadı. Bu hazırlık, canlı kabulün geçtiği veya herhangi bir bütçenin onaylandığı anlamına gelmez.

- **`VIDEO_PUBLIC_TESTNET_RELEASE_SOURCE`: COMPLETED_WITH_WARNINGS (`LOCAL_STATIC / LOCAL_TEST`) / NOT_DEPLOYED.** Ayrı public-testnet artifact/manifest yolu ve elle çağrılan korumalı workflow eklendi. Başarılı exact main CI, artifact/provenance/SBOM, kapalı varsayılan deploy anahtarı ve required-reviewers kontrolü kaynakta bağlıdır. Gerçek workflow/environment kurulmadı veya çalıştırılmadı.
- `closed`, `acceptance`, `drain` paketleri tek matriste doğrulanır. Drain yeni yükleme/teklifi kapatır; mevcut provider/operator işleri, izleme ve Discover sürer. Kapatma hatasında eski açık sürüme otomatik dönüş yoktur; hata başarı sayılmaz. Market işlemleri ayrı kalır.
- Public read-model domain'i, aynı sürümde health kimliği ve ingestion bayrakları bağlandı. Açılış var olan Queue/DLQ/consumer ayarını salt okunur doğrular; kaynak/consumer kurulumunu kendiliğinden yapmaz. Eski Preview/Production davranışları regresyon testleriyle korunur.
- Adaptive kalite seçeneği live canary CLI → provider profil seçimi → Chrome/Edge → rapor zincirine bağlandı. Yerel mock testleri geçti; gerçek provider/kalite koşusu yapılmadı. Yayın paketi ve Web/Bridge/read-model yerel derlemeleri doğrulandı. [Kabul kaydı](./public-testnet-video-v1-acceptance.md) güncellendi.

## 7. Referans sohbetle uzlaştırılan durum — 7 Eylül 2026

Referans: “Planla uygulama tamamlamayı”, `01a07bea-ff6c-7361-9a4f-8d306bb57df2`. Bölüm 6 tarihsel kaynak gate'lerini kaydeder; güncel kalan iş listesi bu bölümdür.

| Gate | Sonuç ve mevcut kanıt |
|---|---|
| `VIDEO_PUBLIC_TESTNET_INTEGRATION` | `COMPLETED_WITH_WARNINGS / LOCAL_STATIC / LOCAL_TEST`. 61 dosya izole çalışma alanında bütünleştirildi; kayıtlı kontroller tekrar çalıştırılmadı. |
| `VIDEO_PUBLIC_TESTNET_PR` | `PASS`. Onaylı `86c577d058e2b8748e76d7978e27829cd6932fd2` yayımlandı; [PR #179](https://github.com/4rmus/youtick/pull/179). |
| `VIDEO_PUBLIC_TESTNET_CI_REVIEW` | `COMPLETED_WITH_WARNINGS / CI`. PR içeriği incelendi; sonraki main CI kaydı ayrı doğrulandı. |
| `VIDEO_PUBLIC_TESTNET_MERGE` | `PASS`. Onaylı squash merge: `28a572803ce79a81b9e893f65b1f1d5b166622f2`. |
| `VIDEO_PUBLIC_TESTNET_MAIN_CI_REVIEW` | `COMPLETED_WITH_WARNINGS / CI`. [34155062768](https://github.com/4rmus/youtick/actions/runs/34155062768), 13/13 başarılı; Market WASM/ABI/manifest hash ve imza doğrulamaları saklandı. |
| `VIDEO_PUBLIC_TESTNET_BOOTSTRAP_PREFLIGHT` | `COMPLETED_WITH_WARNINGS / LOCAL_STATIC`. Envanter, önceki yetkiler ve kaynak boşlukları uzlaştırıldı. Kullanıcının ek yönlendirmesiyle faucet fonlaması zincirde doğrulandı. Kurulum ve gerçek kabul açık. |
| `VIDEO_PUBLIC_TESTNET_BOOTSTRAP_ARTIFACT_SOURCE` | `COMPLETED_WITH_WARNINGS / LOCAL_STATIC / LOCAL_TEST`. Access WASM/ABI/lockfile aynı SHA/CI run/attempt ile paketlenir, doğrulanır, imzalanır ve 30 gün saklanır. Mevcut güvenlik testi 14/14 geçti. Değişiklik izole çalışma alanındadır; GitHub'a yayımlanmadı. |

- Mevcut main aynı SHA'dır. Önceki iki Git onayı uygulanmıştır; yeni Git yayını, CI tekrar koşusu veya deploy yetkisi değildir. Mevcut dirty checkout yayın kaynağı olarak kullanılmaz; korunmuş entegrasyon içeriğinin 61/61 hash'i kayıtla eşleşir.
- Saklanan Market WASM: `2fd3a0727e7f70dd9715a7f01e2cfab8afc3124ff155858a385a3dde536cfdc0`, 347252 bayt. İmzalı manifest eski beta Market'i ve `CODE_UPDATE_ONLY` işlemini hedefler. Yeni hesap kurulumuna çevrilmez. Access çıktısının saklanması yerelde eklendi; gerçek yeni CI artifact'i ve yeni Market/Access kurulumu için korumalı yürütme yolu henüz yoktur.
- 19:52–19:58 UTC envanterinde yeni Web/Bridge/read-model, D1, Queue/DLQ ve önerilen dört NEAR hesabı yoktur. GitHub `public-testnet` environment'ı ve release config'i yoktur; `DEPLOY_PREVIEW_ENABLED=false`. DNS okuması 403, public çözümleme ENOTFOUND: yetkili DNS kaydının yokluğu kesinleştirilmemiştir.
- 19:56 UTC provider kaydı 13/13 asset'i `ready`, JWT korumalı ve yalnız 720p gösterir. Eski “hâlâ waiting” durumu güncel sonuç değildir. Yeni iki kalite, işleme süresi ve kullanıcı akışı hâlâ `UNPROVEN` durumundadır.
- Livepeer hesap ekranı Growth planını gösterir; fatura dönemi/tutarı ve kullanılabilir kota doğrulanamamıştır. Boş dönemle gelen sıfır sayaçlar maliyet veya kota kanıtı sayılmaz.
- Kullanıcının faucet/NEAR CLI yönlendirmesi üzerine resmî faucet'ten tek talep ile `youtick-dev-v3.testnet` hesabına **5 test NEAR** geldi. NEAR CLI ve kesinleşmiş RPC bloğu `267545791`, toplam **5,0960459175067229 test NEAR** bakiyeyi doğruladı; eski envantere göre fark tam 5'tir. İşlem hash'i faucet ekranında verilmedi. Yeni hesap, dışarı transfer, deploy, anahtar veya provider işlemi yapılmadı. Market'in yalnız kod depolama alt sınırı 3,47252 NEAR'dır; bu bakiye tüm kurulumun bütçesinin yeterli olduğunu kanıtlamaz.

Kanıtlar: `tmp/video-public-testnet-{integration,pr,ci-review,merge,main-ci-review,bootstrap-preflight}-20260907/`. Güncel kontrol ve kullanıcı değişikliklerini koruma kaydı: `tmp/video-public-testnet-resume-20260907/`.

## 8. Bootstrap kaynak yayını — 8 Eylül 2026

**`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_ARTIFACT_INTEGRATION`: PASS / CI.** Kullanıcı onayıyla dört dosyalık `da6f61cc` patch'i değişmeden `a96f0a8cabd766ab483262a7752ab08431feff57` commit'i ve [PR #180](https://github.com/4rmus/youtick/pull/180) olarak yayımlandı. [PR CI 34161053872](https://github.com/4rmus/youtick/actions/runs/34161053872) zorunlu CI Gate dahil 12 işi başarıyla tamamladı; yalnız main'de çalışan çıktı saklama işi beklenen şekilde atlandı. Review/çakışma engeli yoktu; squash merge `43fee5c4a04c8314579a9e089aa85c0fe06b03dd` aynı onaylı tree ile doğrulandı. Bypass, manuel CI tekrar koşusu ve deploy yapılmadı.

**`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_MAIN_CI_REVIEW`: COMPLETED_WITH_WARNINGS / CI.** [Yeni main CI 34161844285](https://github.com/4rmus/youtick/actions/runs/34161844285) **13/13 başarılı**. Market artifact `10033007691` ve Access artifact `10033009024` indirildi; ZIP hash, tam dosya seti, checksum, lockfile, ABI ve **7/7 imza** exact source/main/CI run/attempt/GitHub runner kimliğiyle doğrulandı. Access WASM `e0c69bd3d0f665f64d5253bfc065f3943f827789a583102aa7ae86b24fee7a2a`, 210935 bayt; Market WASM hash'i değişmedi. İki çıktı 7 Ekim 2026'ya kadar GitHub'da saklanıyor. Preview deploy skipped; gerçek yayın yapılmadı. Kayıt: `tmp/video-public-testnet-bootstrap-main-ci-review-20260908/receipt.json`.

**`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_ACTION_PACKAGE`: COMPLETED_WITH_WARNINGS / LOCAL_STATIC.** İlk uygulanabilir B01 paketi hazır: GitHub `public-testnet` korumalı environment + kapalı deploy değişkeni, mevcut Cloudflare hesabında yalnız yeni boş D1 ve iki Queue. Worker/DNS/consumer/migration/NEAR/key/provider işlemi içermez. Ayrı B02 rol/funding önerisi ve mevcut NEAR CLI ile atomik create/fund/key/deploy/init yolu kaydedildi; yeni kurulum kütüphanesi gerekmez.

Cloudflare yalnız mevcut uygulama altyapısıdır (Web/Bridge/D1/Queue); video sağlayıcısı Livepeer ve ekonomik otorite NEAR olarak kalır. Cloudflare Stream yönü açılmadı. Operator runtime anahtarı sonlu iki-yöntemli FunctionCall; sponsor relayer mevcut kod gereği kendi ayrı hesabında FullAccess kullanır. İkisi aynı izin modeliyle kurulmaz.

## 9. B01 boş altyapı kurulumu — 8 Eylül 2026

**`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_FOUNDATION`: PASS / PROVIDER (yalnız GitHub/Cloudflare altyapısı).** Kullanıcının açık B01 onayı uygulandı. GitHub `public-testnet` environment'ı `4rmus` reviewer ve protected-branch kuralıyla oluşturuldu; public-testnet ve Preview deploy değişkenleri `false` olarak doğrulandı. Yönetici bypass kullanılmadı; API'deki varsayılan `can_admins_bypass=true` alanı değiştirilmedi.

- Boş D1 `youtick-market-read-model-public-testnet`: **`89871d60-3a26-4045-8694-5ff44af579db`**, EEUR, 0 tablo.
- Queue `youtick-livepeer-events-public-testnet`: **`88fbf7cd91ad4140a74ea9393face0a6`**.
- DLQ `youtick-livepeer-events-dlq-public-testnet`: **`8651053b477c45fbba1386e0ed50fe41`**.
- İki kuyrukta saklama 86400 saniye, gecikme 0, üretici/tüketici sayısı 0 API'den doğrulandı. Worker/contract deploy, DNS, consumer, migration, NEAR/anahtar, secrets veya medya işlemi yapılmadı. Kanıt: `tmp/video-public-testnet-foundation-20260908/receipt.json`.

## 10. NEAR kimlik hazırlığı — 8 Eylül 2026

**`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_IDENTITIES_PREFLIGHT`: COMPLETED_WITH_WARNINGS.** Parent/platform, mevcut admin/Access-owner ve guardian/takedown hesapları kesinleşmiş blokta okundu; üç yerel private key kendi public key'ini türetiyor ve bu public key zincirdeki FullAccess key ile eşleşiyor. İmza denenmedi. Dört yeni hesap adı hâlâ `UNKNOWN_ACCOUNT`.

Önceki faucet yönlendirmesi kapsamında aynı parent hesabına bir ek ücretsiz talep başarılı oldu: **+5 test NEAR**, toplam **10,0960459175067229 test NEAR**, kesinleşmiş blok **267551183**. İki talebin toplamı 10 test NEAR'dır. Dışarı transfer yok; önerilen bootstrap harcama bütçesi hâlâ onaysızdır.

**`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_LOCAL_KEYS`: PASS.** Kullanıcının B02 onayıyla altı ayrı Ed25519 anahtar yalnız yerelde, repo dışında 0700 klasör/0600 dosyalarda oluşturuldu. Altı private→public eşleşmesi ve farklılık kontrolleri geçti; önceki anahtarlar korundu. Public manifest hash'i `00ef4770087338f666524dd8017b80087718f2b3320342a8ccb2f17a5d2f87d6`. Zincirde hesap/transfer/deploy veya secret yükleme yapılmadı. Kanıt: `tmp/video-public-testnet-identities-preflight-20260908/local-keys-receipt.json`.

## 11. Korumalı NEAR kurulum kaynağı — 8 Eylül 2026

**`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_EXECUTION_SOURCE`: COMPLETED_WITH_WARNINGS / LOCAL_STATIC / LOCAL_TEST.** Yeni `bootstrap-public-testnet.yml`, mevcut `near-api-js` ile küçük bir yardımcı ve yalnız public kimliklerden oluşan sabit politika hazır. Sözleşme/uygulama kodu veya yeni bağımlılık eklenmedi.

Önceki kısmi CLI yardımına dayanan “native CLI tek başına yeterli” sonucu düzeltildi: kurulu 0.29.0 yalnız üç işlem bloğu kuruyor, gönderimi otomatik tekrarlıyor ve büyük transaction imzalama argümanı Linux sınırını aşıyor. Yardımcı mevcut SDK'nın doğru unsigned transaction hash'ini kullanır; dört hesabı ayrı atomik batch'lerde hazırlar, public işlem kimliklerini GitHub artifact'ına gönderimden önce kaydeder, her batch'i bir kez gönderir ve yalnız aynı hash üzerinden sınırlı finality okumaları yapar. Dört hesabın tamamı tek atomik işlem değildir.

Workflow yalnız exact current main ve başarılı aynı-SHA CI'ın iki sözleşme artifact'ını kabul eder; yedi imza, ZIP/dosya hash'i, lockfile, policy ve source kimliği secret erişiminden önce doğrulanır. `public-testnet` environment onayı, mevcut kapalı deploy değişkenleri, kalıcı işlem-planı kaydı ve tekrar çalıştırmayı durduran kontroller vardır. Eski `CODE_UPDATE_ONLY` manifesti değiştirilmez; yeni politika `FRESH_ACCOUNT_CREATE_DEPLOY_INIT` işlemini ayrıca tanımlar.

- Yerel bootstrap kontrolleri 9/9; mevcut provider-canary test komutu toplam 101/101; CI güvenlik testleri 15/15; YAML ve dokuz shell bloğu sözdizimi geçti. Bağımsız salt-okunur inceleme engelleyici hata bulmadı.
- Canlı salt-okunur ön kontrol, protokol 85 ve dört hesabın yokluğunu doğruladı. Exact 9,2 test NEAR aktarım için ön ücret toplamı yaklaşık 0,2712588682, toplam ön tahsis 9,4712588682 test NEAR; harcanabilir bakiye yaklaşık 10,0942. Gerçek imza veya gönderim yapılmadı.
- 10 test NEAR, işlem öncesi ücret/bakiye kontrolü ve durdurma eşiğidir; NEAR transaction'ında zincirin uyguladığı `maxFee` alanı değildir. Yeni bütçe, parent secret aktarımı ve kurulum onayı henüz yoktur.

**Tek sonraki gate: `VIDEO_PUBLIC_TESTNET_BOOTSTRAP_RELEASE_AND_RUN` — B03 somut paketinin onayı.** Önce yerel kaynak paketi yayımlanıp yeni main CI doğrulanmalı. Ardından yalnız onaylı dört yeni hesap için parent anahtarı geçici olarak korumalı GitHub environment'a aktarılıp bu workflow yürütülebilir. Altı yeni private anahtar yerelde kalır. Web/Bridge yayını, provider ve gerçek medya kabulü bu gate'in kapsamına girmez. Ana görev `BLOCKED / NOT_COMPLETE` durumundadır.

## 12. B03 uygulaması — 8 Eylül 2026

**`VIDEO_PUBLIC_TESTNET_BOOTSTRAP_RELEASE_AND_RUN`: PASS.** Kullanıcı yeniden sunulan tam B03 paketini açıkça onayladı. Bu onay exact Git yayını, mevcut parent imza anahtarının yalnız korumalı GitHub `public-testnet` environment'ına geçici aktarımı/kaldırılması ve dört testnet kurulum batch'ini kapsar; aynı kapsam için tekrar onay gerekmez.

Onaylı `7dea189c` patch'i değişmeden commit `16c9f2c8e45799aedb5d85f5a9cc9a2871ca9623` ve [PR #181](https://github.com/4rmus/youtick/pull/181) olarak yayımlandı. PR CI `34189840713` geçti; inceleme engeli ve açık PR CodeQL alert'i yok. Squash main **`33d7d12f780b26401b1385ad1db80db63e0adc03`**, incelenmiş aynı tree ile doğrulandı. [Main CI 34190657882](https://github.com/4rmus/youtick/actions/runs/34190657882) 13/13 başarılı; yedi imza ve iki gerçek WASM hash'i eşleşti.

**B03 sonuç: PASS / gerçek NEAR testnet kanıtı.** [Korumalı bootstrap 34191910269](https://github.com/4rmus/youtick/actions/runs/34191910269) attempt 1, normal environment reviewer onayıyla geçti. Dört yeni hesap, exact key setleri, iki sözleşmenin zincirden okunan kod byte'ları ve dört FINAL transaction ayrı salt-okunur sorgularla doğrulandı. Market kapalı ve publication sayısı 0; Access gerçek initializer durumu (`paused=false`, `grant_issuance_enabled=true`) ile doğrulandı. Market'in gerçek init bloğu **267602885**.

Toplam parent debit **9,2351909110796079 test NEAR**; bunun 9,2'si transfer, 0,0351909110796079'u ücret/oluşturma maliyeti. Parent bakiye **0,860855006427115 test NEAR**. Geçici GitHub parent secret'ı terminal koşu sonrası kaldırıldı ve API'den yokluğu doğrulandı; altı yeni private key yerelde kaldı. Güncel işlem/transaction kimlikleri: `tmp/video-public-testnet-bootstrap-run-20260908/receipt.json` ve `independent-chain-verification.json`.

**Sonraki hazırlık: `VIDEO_PUBLIC_TESTNET_CLOSED_RELEASE_PREFLIGHT`.** Gerçek Market/Access, D1/Queue ve başlangıç bloğuyla kapalı yayın paketi Bölüm 13’te hazırlandı. Bu servisler, DNS/migration/consumer ve medya kabulü hâlâ kurulmuş veya geçmiş sayılmaz; ana görev `NOT_COMPLETE` durumundadır.

## 13. B04 kapalı yayın hazırlığı — 8 Eylül 2026

**`VIDEO_PUBLIC_TESTNET_CLOSED_RELEASE_PREFLIGHT`: COMPLETED_WITH_WARNINGS / LOCAL_STATIC / PROVIDER.** Mevcut main `33d7d12f` ve CI `34190657882` için yeni kaynak değişikliği gerekmiyor. Gerçek hesaplar, D1/Queue ve Market init bloğu 267602885 config taslağına işlendi; dört mevcut migration hash'i kaydedildi. Tek eksik alan yeni Livepeer public JWT anahtarıdır; mevcut config doğrulayıcısı placeholder'ı doğru şekilde reddetti. Tam config veya canlı yayın PASS değildir.

Kullanıcı `youtick-public-testnet-deploy-v1` Cloudflare tokenını oluşturdu; adı ve oluşturulma başarı ekranı doğrulandı. Yeniden token oluşturulmaz. Henüz GitHub'a secret aktarımı, yeni Livepeer anahtarı, D1 migration veya Worker yayını yapılmadı. Eski JWT private anahtarları güncel Preview public key ile eşleşmediğinden B04 tek yeni Livepeer imzalama anahtarı içerir.

**Aktif gate: `VIDEO_PUBLIC_TESTNET_CLOSED_RELEASE` — B04 onaylandı, yürütülüyor.** Paket mevcut token ve gerekli runtime secret'larının korumalı GitHub ortamına aktarımı, tek yeni Livepeer imzalama anahtarı, dört migration ve mevcut korumalı workflow üzerinden üç servisin kapalı yayınıdır. Queue producer/D1 bağlantıları dahildir; consumer ve medya işlemleri dahil değildir. B03 yeniden yürütülmez; önceki bölümlerdeki B03 onay/kurulum bekleme kayıtları tarihsel olup Bölüm 12 ile kapanmıştır.

Somut paket/kanıt: `tmp/video-public-testnet-closed-release-preflight-20260908/report.md`, `b04-action-package.json`, `receipt.json`. B04 kullanıcı tarafından açıkça onaylandı; paket kapsamındaki işlemler aynı onayla yürür. Genel plan `NOT_COMPLETE`; kapalı yayın dahi gerçek video kabulünün yerine geçmez.

B04 yürütme: yeni Livepeer key `e92e1518-9575-49e6-be7b-f6b6eef37945` kayıt/private→public kontrolü geçti; eski iki key korundu. Dokuz GitHub environment secret metadata'sı doğrulandı. Kapalı canonical config SHA256 `090dd2345eb9bf33be95dacd68eca6ddd2ace26c496635b3a16faca06e5373e7`. Yeni D1 üzerinde dört migration ve contiguous-watermark trigger doğrulandı. [Kapalı yayın 34206345769](https://github.com/4rmus/youtick/actions/runs/34206345769) tek dispatch/attempt 1 ile başlatıldı; henüz deploy/health PASS değildir. Kanıt: `tmp/video-public-testnet-closed-release-run-20260908/`.

## 14. B04 başarısız yayın ve B04-R hazırlığı — 8 Eylül 2026

**`VIDEO_PUBLIC_TESTNET_CLOSED_RELEASE`: FAILED / canlı kabul eksik.** B04 açık kullanıcı onayıyla uygulandı; [34206345769](https://github.com/4rmus/youtick/actions/runs/34206345769) tek dispatch/attempt 1, prepare SUCCESS, deploy FAILURE. Canonical kapalı config, dokuz GitHub secret metadata'sı, yeni Livepeer imza anahtarı, dört gerçek D1 migration ve altı exact-SHA imzalı release dosyası doğrulandı. Bu alt işler tamamlandı ve yeniden yapılmayacak.

Üç Worker'ın exact source `33d7d12f` aday sürümleri %100 trafikte: Web `7f100827-c89f-490e-9d26-0c794dbe0e7e`, Bridge `f4934d1b-a9d2-4e06-b099-6812f1faed62`, read-model `90cb3424-31be-42a2-b623-64816a982f7f`. Bridge workers.dev health 200/DISABLED, işlem bayrakları false; Web workers.dev root 200. Queue producer 1, consumer 0.

Yayın sonrası smoke `fetch failed`, ardından cleanup `cloudflare_release_domain_cleanup_failed` verdi. API uzlaştırması hedef üç custom domain'in artık olmadığını doğruladı; üç public adres ENOTFOUND. Özgün runner cause kodu loglanmadığından ilk DNS yayılımı yalnız olası nedendir. Read-model public health, son public smoke, release receipt ve root-before/after karşılaştırması tamamlanmadı. Deploy anahtarı terminal koşu sonrasında tekrar **false**. Kanıt: `tmp/video-public-testnet-closed-release-run-20260908/receipt.json`.

**Aynı gate içinde B04-R yerel hazırlığı: COMPLETED_WITH_WARNINGS / LOCAL_TEST.** İzole checkout'ta yayın koduna yalnız o koşuda eklenen domain'in ENOTFOUND hatasını mevcut en fazla 7 deneme/60 saniye toplam bekleme ile tekrar kontrol etme eklendi. Yeni deploy veya provider isteği tekrarlanmaz. İlgisiz domain, önceden bağlı domain ve TLS hatası tekrar edilmez; kalıcı hata sonrası başarı yazılmaz ve kapalı mod yeniden açılmaz. Beş regresyonda iki ilgili senaryo eski kodda başarısızdı; düzeltme sonrası mevcut yayın/smoke testleri **100/100 PASS**. Orijinal uygulama değişiklikleri korunur.

**Tek sonraki adım: B04-R exact dört dosyalık Git yayın paketi ve yeni main CI doğrulaması sonrası bir yeni korumalı closed deploy için onay.** Mevcut token/anahtarlar/config/D1 ve üç Worker yeniden oluşturulmaz. Paket: `tmp/video-public-testnet-closed-release-recovery-20260908/report.md`. Genel plan BLOCKED / NOT_COMPLETE; önceki B04 IN_PROGRESS kayıtlarının güncel sonucu bu bölümdür.
