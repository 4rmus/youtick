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
- Son kalite gate'inin 31 dosya hash'i başlangıçta eşleşti. GitHub main/CI/Preview kayıtları salt okunur kontrol edildi; bu yerel farkın sürüm kanıtı olmadıkları kaydedildi. Yeni public-testnet workflow/artifact bağlantısı ve kapalı ayardan kontrollü açma/kapatma desteği eksik. Mevcut live canary çağrısı kalite seçeneğini iletmiyor. Provider çözüm ve hesaba özel maliyet kanıtı ayrıca bekliyor.
- Uygulama/workflow/config değiştirilmedi; Git yayını, CI tekrar koşusu, deploy, ödeme, provider veya canlı NEAR/D1 işlemi yapılmadı. Bu hazırlık, canlı kabulün geçtiği veya herhangi bir bütçenin onaylandığı anlamına gelmez.

- **`VIDEO_PUBLIC_TESTNET_RELEASE_SOURCE`: COMPLETED_WITH_WARNINGS (`LOCAL_STATIC / LOCAL_TEST`) / NOT_DEPLOYED.** Ayrı public-testnet artifact/manifest yolu ve elle çağrılan korumalı workflow eklendi. Başarılı exact main CI, artifact/provenance/SBOM, kapalı varsayılan deploy anahtarı ve required-reviewers kontrolü kaynakta bağlıdır. Gerçek workflow/environment kurulmadı veya çalıştırılmadı.
- `closed`, `acceptance`, `drain` paketleri tek matriste doğrulanır. Drain yeni yükleme/teklifi kapatır; mevcut provider/operator işleri, izleme ve Discover sürer. Kapatma hatasında eski açık sürüme otomatik dönüş yoktur; hata başarı sayılmaz. Market işlemleri ayrı kalır.
- Public read-model domain'i, aynı sürümde health kimliği ve ingestion bayrakları bağlandı. Açılış var olan Queue/DLQ/consumer ayarını salt okunur doğrular; kaynak/consumer kurulumunu kendiliğinden yapmaz. Eski Preview/Production davranışları regresyon testleriyle korunur.
- Adaptive kalite seçeneği live canary CLI → provider profil seçimi → Chrome/Edge → rapor zincirine bağlandı. Yerel mock testleri geçti; gerçek provider/kalite koşusu yapılmadı. Yayın paketi ve Web/Bridge/read-model yerel derlemeleri doğrulandı. [Kabul kaydı](./public-testnet-video-v1-acceptance.md) güncellendi.

- **`VIDEO_PUBLIC_TESTNET_INTEGRATION`: yerel birleştirme kaydı.** Altı video gate'inin kayıtlı 61 dosyası `d1b75ab4e6ded6a58d72344df13e473ac7f880e7` main tabanına ayrı çalışma alanında taşındı. 51 mevcut dosyanın ilk gate öncesi kopyası bu main ile birebir eşleşti; 10 yeni dosya eklendi. Metin çakışması çıkmadı; #178 sekmeler arası salt-okunur yükleme durumu düzeltmesi korundu.
- Yeni public workflow'un deploy işine eksik `attestations: read` izni eklendi ve önce başarısız olan regresyon testiyle doğrulandı. İmza üretme/yazma izni deploy işine verilmedi. Belgedeki makineye özel video bağlantıları taşınabilir dosya adlarına çevrildi. Asıl çalışma alanı, branch ve index değiştirilmedi.
- Bu kayıt `main`e merge, Git yayını veya canlı test değildir. İncelenebilir paket ve kesin test sonuçları entegrasyon receipt'inde tutulur. Commit/push/PR/merge/deploy yapılmadan ayrı onay beklenir.

**Tek sonraki gate: `VIDEO_PUBLIC_TESTNET_PR`** — doğrulanmış 61 dosyalık paket için ayrı branch, tek commit, push ve main hedefli taslak PR. Bu Git işlemleri açık onaydan sonra yapılır; merge, deploy, provider ve canlı NEAR/D1 işlemleri bu pakete dahil değildir.
