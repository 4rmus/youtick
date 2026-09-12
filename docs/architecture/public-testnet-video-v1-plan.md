# Herkese açık YouTick Testnet Video V1

> Son gate: `VIDEO_PUBLIC_TESTNET_MISSING_WEBHOOK_LOCAL_COVERAGE` — PASS / LOCAL_TEST.
> Public-testnet politika, ilk alarm, restart ve tek finalize kapsamı eklendi.
> 8 seçili test ve TypeScript kontrolü geçti (§54); uygulama davranışı değişmedi.
> Testler yerelde, henüz commit/push/PR yok. Tek sonraki gate
> `VIDEO_PUBLIC_TESTNET_MISSING_WEBHOOK_TEST_INTEGRATION`: iki test ve üç
> canonical belge için ayrı PR/normal merge; deploy0. Henüz başlamadı.
> Canlı kayıp bildirim UNPROVEN; terminal replay PASS, 2+2 PASS ve Video V1 NOT_COMPLETE korunur.

> Dayanıklılık ön kontrolü §48 ve önceki sonuçlar korunur; kapanmış resume,
> 24 saat sonrası yayın erişimi, 2+2 ve kabul edilmiş ertelemeler yeniden açılmaz.

> 12 Eylül 2026 yeni kullanıcı kararı: ilk sürüm kapasite kabulü **2 eşzamanlı
> yükleme + 2 eşzamanlı izleme**. Önceki 3 yükleme önerisi değişti; 1.000 izleyici
> testi kapsamdan çıkarıldı ve çalıştırılmayacak. Son koşu
> `VIDEO_PUBLIC_TESTNET_TWO_BY_TWO_ACCEPTANCE` — PASS / KAPALI; kabul §47.
> Orijinal TUS işlem kayıtlarında 160,934 saniye örtüşme ve iki ayrı hesapla
> en az 5 dakika eşzamanlı oynatma doğrulandı. İlk uyarılı koşu §46'da korunur.
> Aşağıdaki önceki gate
> kapanışları tarihsel sonuçlarını korur; daha büyük kapasite kanıtlanmış sayılmaz.

> 12 Eylül 2026 belge uzlaştırması: kaynak/CI/kayıtlı yayın ve ana faz özeti [current-state.md](./current-state.md) içindedir. M devam, üretici çekimi, maliyet/hız, tarayıcı/yavaş ağ ve son büyük dosya gate'i kapalıdır; uyarılar korunur. Aşağıdaki eski çalışma/yayın talimatları tarihsel kayıttır.

> 7 Eylül 2026 — VIDEO_PLAN_REVISION sonunda netleştirilen plan.
> Bu belge plan kaydıdır; uygulama veya canlı işlem yetkisi vermez.

**Önceki büyük dosya gate: VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PUBLICATION_VERIFICATION_RELEASE — COMPLETED_WITH_WARNINGS, KAPANDI.** Kullanıcının istediği **5 GB /120 dakika yükleme → provider ready → NEAR Published/ACTIVE → katalog** zinciri PASS. [PR #197](https://github.com/4rmus/youtick/pull/197) normal squash ile birleşti; **b53e00e962b595f0edf4f1283c146d73d1f76b57**, yeni main CI **34683092906** ve tek korumalı yayın **34683764285** başarılı. Aynı iş yeni Bridge devreye girdikten **120,852844sn** sonra otomatik yayımlandı; yeni ödeme/upload0. Plan §35/kabul §45 son kanıttır. Bir admission_denied uyarısı ve sağlayıcı maliyetinin kesin ayrıştırılamaması korunur; genel Video V1 NOT_COMPLETE. Kullanıcının daralttığı kapsam tamamlandı; başka gate başlatılmadı.

§6 ve sonrasındaki eski kayıtlar tarihsel kanıttır; oradaki NOT_DEPLOYED, BLOCKED, açık gate ve kapatma/rezerv önerileri güncel talimat değildir. Güncel kullanıcı kapanışı §29/kabul §39; teşhis §28/kabul §38, sayısal tarayıcı koşusu §27/kabul §37'de korunur. Önceki measurement-preflight/remaining-acceptance önerileri ertelendi; bu aşama yeniden açılmaz. Çekim ve maliyet/hız kapanışları aynı kalır.

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
| İlk sürüm kapasite kabulü | 2 eşzamanlı yükleme, 2 eşzamanlı izleyici; canlı global sınır değişikliği yok |
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

- Kullanıcının hızlı başlangıç seçimiyle ilk snapshot 267651604'te oluşturuldu; B09 yayını sonrasında ayrıca onaylanan tek yenilemeyle güncel snapshot başlangıcı 267666835 oldu. Bu noktaya kadarki işlenmemiş eski geçmiş taşınmadı. Mevcut veri aktarma işi güncel kayıttan sonraki blokları kesintisiz takip eder; dakika tetikleyicisi veri aktarımını ve finality kontrolünü bağımsız yürütür. Market'in gerçek başlangıç bloğu 267602885 korunur.
- Yeni yayının normal Discover listesinde görünmesi ve oradan izlenmesi kabul şartıdır. İlk veri isteğinin süre sınırı ve mevcut NEAR geri dönüşü korunur.
- Ekranlar yeni testnet politikasını gösterir; eski 14 gün/10 toplam iş metinleri yeni ortama taşınmaz. Test tokenı edinme ve yetersiz bakiye yönlendirmesi kullanıcı tarafından tamamlanabilir olmalıdır.

## 4. Kapasite, maliyet ve kabul

Herkese açıklık, herkes için aynı kapasite kurallarıyla uygulanır. Yeni ortamda global eşzamanlı iş sınırı 10; mevcut üretici başına bir aktif iş ve günlük iki yeni iş koruması korunur. Bunlar ödeme öncesinde görünür olur.

Mevcut teklif ön kontrolü, imzalı ödeme aktarımı öncesindeki kapasite rezervasyonu ve provider oluşturma öncesindeki kontrol yeniden kullanılır. Public-testnet sabit dolar rezervi kaldırılmıştır; günlük/aktif iş ve eşzamanlılık kontrolleri korunur. **Teklif almak tek başına kapasite rezervasyonu değildir.** Geçerli teklifle doğrudan zincire ödeme yapan bir iş kapasite bekleyebilir; plan bunun aksini vaat etmez.

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


## 15. Kalan Video V1 kabulü — 10 Eylül 2026

**`VIDEO_PUBLIC_TESTNET_REMAINING_ACCEPTANCE_PREFLIGHT`: COMPLETED_WITH_WARNINGS / LOCAL_STATIC.** Amaç iki ana belgenin güncel durumunu uzlaştırmak ve tek M devam koşusunu hazırlamaktır; kod, config, workflow, kullanıcı değişiklikleri ve canlı yazımlar kapsam dışıdır. Kabul matrisi, kanıt yolları ve uygulanabilir işlem paketi [kabul belgesi §18–19](./public-testnet-video-v1-acceptance.md) içindedir. Bu hazırlık herhangi bir yeni işlem/harcama yetkisi değildir.

| Durum | Kabul kapsamı |
| --- | --- |
| Tamamlanan | B09/B10 kaynak ve yayın/migration işlemleri; ayrı public-testnet ortamı; küçük gerçek yükleme→ready→Published/ACTIVE; normal Discover→Watch; gerçek satın alma ve creator oynatma; reload düzeltmesi; mevcut player’da gerçek token yenilemesi; sabit USD rezervinin kaldırılması. |
| Kısmi / sınırı korunan | Ölçülen videolarda 360p/720p/Auto ve sarma; 30 günlük cihazın işlemle yenilenmesi. Bazı imza pencere sayımları eksik; yetkisiz hesap sonucu kısmen kullanıcı bildirimi; fiziksel A/V ≤150 ms kalibrasyonu UNPROVEN. Tekil süreler genel p95/maliyet/kapasite kanıtı değildir. |
| Kanıt bekleyen | M kesinti/sekme/yanlış dosya-hesap ve aynı TUS/24 saat; gerçek maliyet ve hız hedefleri; kazanç çekimi; Chrome/Edge ve yavaş ağ; 120 dakika/5 GB/sınırlar; canlı dayanıklılık; 10 gerçek yükleme/1.000 izleyici; eski beta ve nihai Video V1 kabulü. |

Küçük kabul yalnız eski S fixture’ı değildir: `matrixx` (17.070.370 bayt) gerçek upload ve zincir/katalog kanıtı, sonraki A/B videoları gerçek satın alma/cihaz kanıtı, `lp-e6a312e5-4273-481d-a337-7c622a4cca53` Discover ve Auto kalite kanıtı sağlar. Aynı testleri yeniden ödeme/yüklemeyle tekrarlama. [Playback planı](./playback-ux-plan.md) ve son kabul kapanışı (yerel arşiv: `/Users/arair/works/youtick-lp/docs/architecture/playback-public-testnet-acceptance-preflight.md`) `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE` gate’ini **COMPLETED_WITH_WARNINGS / KAPALI** olarak kapatmıştır; kalan uyarılar bu kararı geri almaz.

10 Eylül 19:50–19:52 UTC yeniden okunan GitHub main **`9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`**, CI **`34507547060`** ve yayın **`34509663409`** SUCCESS. Canlı Bridge/read-model sürümleri son yayınla eşleşir; Web’in tam bundle/trafik kanıtı önceki yayın receipt’idir, bu tur tekrar ölçülmedi. Bunlar zaman damgalı referanslardır; M başlamadan source→CI→receipt→serving eşleşmesi yenilenir. Dirty checkout HEAD `d2d3b035ac1e3afa348f353b014339ab46290e16` güncel main değildir; gerekirse yayın adayı exact main ile dosya bazında uzlaştırılır.

Korunan kararlar:

- 30 günlük cihaz yetkisi başarılı yeni upload/satın alma ile yenilenir; izleme, token yenileme ve upload-key recovery süreyi uzatmaz. Ayrı kimlik imzası açılmaz.
- Public ortam açık kalır; güncel Market frozen/paused=false ve Bridge newUploadReady=true. Deploy bayrağı false, runtime upload kapalı anlamına gelmez. Otomatik drain/freeze yok.
- Sabit USD rezervi kaldırıldı (yerel arşiv: `/Users/arair/works/youtick-lp/docs/architecture/public-testnet-operation-reservation-release.md`); eski sayaç/5 USD önerisi gerçek provider fatura kesicisi değildir. Yeniden rezerv eklenmez.
- `matrixxx` timeline uyumluluğu yalnız playback `ef819lp2r3anecgq` ve ölçülen playlist hash’i içindir. M’nin yeni asset sağlığı sonraki onaylı koşuda ayrıca kanıtlanır; genel provider düzeltmesi varsayılmaz.
- Brave kullanılır; Chrome/Edge/yavaş ağ kabulü sayılmaz. Dış destek talebi ve iptal edilmiş deneyler açılmaz. B09/B10, bootstrap ve migration tekrarlanmaz.

**Tek sonraki gate `VIDEO_PUBLIC_TESTNET_M_RESUME_ACCEPTANCE`.** Önerilen kapsam: aynı 269.467.407 baytlık M ile tek upload, gerekirse tek `replace_upload_key`; creator `soteri.testnet`, yanlış hesap `utick2.testnet`; 0,60 test USDC ve toplam 0,10 test NEAR işlem eşiği, 5 USD kullanım gözlem önerisi, 20 izleyici-dakika/30 dakika aktif test. Bilet alımı/çekim yok. Aynı dosya/iş/TUS/generation ve değişmeyen 24 saat; fazladan ödeme/asset/publication sıfır. Hesaba özel fatura/kullanım ve tam provider envanteri başlangıçta tamamlanıp bu yeni işlemler açıkça onaylanmadan koşu başlamaz.

Sonraki seçim sırası yalnız bu gate kapandıktan sonra: M → maliyet/hız → çekim → tarayıcı/yavaş ağ → uzun/sınır → dayanıklılık → bütçeli gerçek kapasite → eski beta/nihai kabul. Mevcut kanıtla kapanmış madde atlanır; **COMPLETED_WITH_WARNINGS otomatik ilerleme yetkisi değildir**.

Doğrulama: dosya hash/metadata, exact main upload kaynak eşleşmesi, mevcut CI/yayın kayıtları ve salt-okunur runtime/chain/asset envanteri ayrı sınıflarda tutuldu. `docs/testing.md` belge build’i ve explicit-path koruma/fark kontrolü bu iki belge için seçildi. Yeni canlı M testi, uygulama testi/CI rerun, Git yayını, deploy, imza, ödeme/upload, çekim veya provider/NEAR/D1 yazımı **EXTERNAL_NOT_RUN**. Genel Video V1 sonucu **NOT_COMPLETE**; bu gate’in çıktısı incelenebilir hazırlıktır.


Kontrol sonucu: explicit-path diff/boşluk **PASS**; diğer **273** dosya ve HEAD/index/status değişmedi. Belge build’i **FAILED**: kapsam dışındaki değişmeyen `playback-public-testnet-acceptance-preflight.md` ve `playback-ux-plan.md` içinde toplam **6 eski kırık bağlantı**. Yeni hedef belgelerde build hatası bildirilmedi; genel build başarısı iddia edilmez. Log: `tmp/video-public-testnet-remaining-acceptance-preflight-20260910/docs-build.log`. Kapsam/onay ve fatura/başlangıç envanteri uyarılarıyla bu hazırlık kapatılır; M gate’i başlamaz.


## 16. M devam kapanışı ve maliyet/hız ön kontrolü — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_COST_SPEED_PREFLIGHT: COMPLETED_WITH_WARNINGS.** Kullanıcı “önerdiğin gibi devam et” diyerek yalnız bu ön kontrole geçti. Değiştirilebilir kapsam iki ana belge ve yerel kanıt raporları; kaynak/config/workflow/secret, provider/NEAR/D1 yazımı ve yeni medya/ödeme kapsam dışı kaldı. Tek sonraki gate otomatik başlatılmaz.

M2 **lp-491fb8eb-451f-4fc6-918e-b94d6876fc02** için aynı dosya/iş/TUS özeti, **33554432 bayttan devam → 269467407 son konum**, bağımsız yanlış hesap ve yanlış dosya kontrolleri, tek ödeme/anahtar yenilemesi/asset/publication, ilk created_at+24 saat ve yeni 720p kısa oynatma geçti. Eski M1 korunur. İlk 503’ün kontrollü tekrarla aşılması, maliyet sayaç gecikmesi ve aktif süre ölçüm sınırı [§25’te](./public-testnet-video-v1-acceptance.md) tutulur; M kabulü yeniden açılmaz.

Giriş yapılmış Livepeer hesabı **Growth**, dönem **1 Eylül–1 Ekim 2026**, gelecek fatura **100 USD**, mevcut aşım **0 USD**. Kullanıcı bu 100 USD planını kullanmayı planlıyor; hesap zaten bu planda, abonelik veya ödeme ayarı değiştirilmedi. 100 USD **minimum aylık harcamadır, sert tavan değildir**. Gerçek faturaya esas kullanım dakikaları, devam eden saklama ve dönem düzeltmeleri ayrı tutulur; sabit USD rezervi/otomatik public kapatma geri getirilmez.

Normal hızdaki kalan M2 aktarımı **235912975 bayt / 317.534 saniye ≈ 5.94 Mbps**; n=1 iş. Sıcak cache-HIT token **p95<500 ms** ve kaynakta tanımlı diğer SLO’lar korunur. Mevcut birkaç tarayıcı token süresi cache etiketsizdir; bunlardan genel p95 çıkarılmaz. İlk token/ilk görüntü için önerilen **p95≤3s / max≤5s**, gerçek yenileme için **max≤3s** hedefleri henüz yeni koşuda ölçülmedi. Upload/processing için yeni global p95 veya 120 dakika/5 GB başarısı iddia edilmez.

**Tek önerilen sonraki gate: VIDEO_PUBLIC_TESTNET_COST_SPEED_MEASUREMENT.** Mevcut M2, soteri ve Brave; yeni ödeme/yükleme/asset/imza/NEAR işlemi 0. En çok 24 normal başlangıçta 20 geçerli örnek, bir eşzamanlı izleyici, 10 izleyici-dakika, 15 dakika duvar saati; ölçüm 12. dakikada durur, üç dakika kapatma/kayıt payıdır. Ek kullanım gözlem eşiği önerisi 1 USD, kesin fatura tavanı değildir. Çalıştırma onayı yok; paket ve durma koşulları §26 ile `tmp/video-public-testnet-cost-speed-preflight-20260911/next-run-package.json` içindedir.

Maliyet/hızın gerçek kabulü; gecikmeli provider kullanımının iş/dönemle ilişkilendirilmesi, Cloudflare gider payı ve yeterli etiketli zaman örneğini hâlâ gerektirir. Sonraki sıra maliyet/hız → çekim → tarayıcı/yavaş ağ → uzun/sınır → dayanıklılık → gerçek kapasite → eski beta/nihai kabul olarak kalır. Bu ön kontrol kapanışı sonraki gate yetkisi değildir.


§16 doğrulaması: explicit-path diff ve 273 diğer dosya/HEAD/index/status koruması PASS. Belge build’i bir kez çalıştırıldı; iki değişmeyen playback belgesindeki 6 eski kırık bağlantı nedeniyle FAILED. Bu ön kontrolde kaynak testleri/CI/deploy ve yeni canlı medya ölçümü EXTERNAL_NOT_RUN. Ayrıntı ve log kabul belgesi §26’dadır.

## 17. Maliyet/hız ölçümü durduruldu — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_COST_SPEED_MEASUREMENT: FAILED (tarihsel 8fac koşusu; güncel kapanış §23).** Kullanıcı somut paketi “önerdiğin gibi devam et” diyerek onayladı. Aynı M2/soteri/Brave; yeni ödeme/yükleme/imza 0. Kapsam iki belge ve yerel kanıtlardı; kaynak/config/Git/CI/deploy değişmedi.

Dört başlangıçta ilk token 591.5–1612.2ms, gerçek SDK ilk görüntü 255–4864ms. n=4 olduğundan p95 kabulü verilmedi. Bir doğal renewal 10646.9ms ile max3000ms hedefini aştı. Server penceresinde beş token POST’u 200, beş yetkilendirme MISS, HIT=0. Beşinci normal reload Connect/Ticket required durumunda kaldı ve oynatıcı yoktu; kimlik durma koşulu uygulandı. Reconnect veya yeni imza denenmedi.

Ölçüm 12:40:08 UTC başladı, 12:46:40 UTC durdu: yaklaşık 6 dakika 32 saniye; viewer üst sınırı 5 dakika. Server tail sonlandırıldı. Yayın/asset ve dört aktör bakiyesi aynı, publication7/asset20, public admission OPEN. Fatura100 USD/aşım0; değişmeyen kullanım sayıları sıfır ek maliyet sayılmaz.

Çalışan WalletProvider kaynağında getConnectedWallet 5000ms zaman aşımıyla yarışır ve restore reddi sessiz yakalanır. Bu bir teşhis adayıdır; cihaz yetkisinin silindiği/sona erdiği veya yenileme gecikmesinin bağlantı kaybına neden olduğu kanıtlanmadı. Başka sekmede disconnect/hesap değişimi olup olmadığı kullanıcıya soruldu; yanıt henüz yok.

**Tek önerilen sonraki gate VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_DIAGNOSIS.** Restore timeout, wallet signOut/account değişimi ve cihaz revision/expiry yollarını sınırlı salt-okunur teşhisle ayırmak. Kök neden kanıtlanmadan süre veya 30 günlük politika değiştirilmez. Yeni ödeme/imza/medya/source/config yazımı yok; teşhis başlamadı. Önceki kabul kayıtları tarihsel kanıt olarak korunur; yeni bulgu çözülmeden maliyet/hız tamamlandı sayılmaz veya çekime geçilmez.

## 18. Oturum geri yükleme teşhisi — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_DIAGNOSIS: COMPLETED_WITH_WARNINGS.** Kullanıcı önerilen teşhisi onayladı. İki belge ve yerel teşhis dosyaları dışında yazım yok; uygulama/config/Git/CI/deploy, Connect/ödeme/cüzdan imzası ve yeni oynatma yapılmadı. Tek kontrollü normal sayfa yenilemesi mevcut oturumu geri yükledi; otomatik token edinimi 1308.8ms, oynatıcı paused=true/currentTime=0/error=null.

Başarısız sayfa incelendiğinde seçili Meteor, soteri v3 market sertifikası, 2592000000ms süre, revision32 ve non-extractable Ed25519 anahtarı mevcuttu. Özel anahtar/proof dışarı çıkarılmadı. Executor önbelleği beklenen 30f015e1… hash’iyle birebir eşleşti. Verilerin şu anda silinmiş veya bozuk olduğuna dair kanıt yok; yeniden bağlantı/imza gerektirmeden toparlanma doğrulandı.

WalletProvider, getConnectedWallet ile 5000ms timer’ı Promise.race içinde bekliyor. Timer reddederse sonradan gelen geçerli sonuç applyWallet’a ulaşmıyor; catch sessiz. Bu kaynak davranışı doğrulanmıştır. Eski olayın timeout/no-account/storage/iframe dallarından hangisi olduğu kaydedilmedi; tek kesin tarihsel kök neden iddiası yok. Executor fetch’inin geç olması tek başına neden değildir: SDK mevcut cache kodunu kullanırken güncellemeyi arka planda alabilir.

10.65s V2 renewal ayrıca değerlendirilir: POST öncesinde cihaz kaydı, kriptografik doğrulama ve get_playback_device NEAR sorgusu vardır. V2 yenilemesi ilk-token retry döngüsünü kullanmaz; eksik aşama ölçümü nedeniyle gecikme bütünüyle Bridge/provider’a yüklenemez ve restore kaybıyla nedensellik kurulamaz.

**Tek önerilen sonraki gate VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_SOURCE.** Geçerli geç sonucu güvenli generation/unmount/account-change korumalarıyla kaybetmeyen, gecikme ile gerçek bağlantısızlığı ayıran ve güvenli hata/süre kanıtı bırakan en küçük yerel düzeltme. 30 günlük yetki/erişim kontrolleri korunur; kör timeout artışı, yeni bağımlılık, servis veya canlı işlem yok. Kaynak adayları WalletProvider, mevcut video-measurements ve ilgili birim testleridir; somut paket `tmp/video-public-testnet-wallet-restore-diagnosis-20260911/source-package.json`. Kaynak düzeltmesi ve yeni ölçüm bu teşhis içinde başlamadı.

## 19. Cüzdan geri yükleme kaynak düzeltmesi — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_SOURCE: PASS.** Kullanıcı gate adını seçti. Güncel main8facb7f ayrı detached adayda açıldı; dirty kökün uygulama dosyaları korunuyor. Aday: `tmp/video-public-testnet-wallet-restore-source-20260911/candidate`. Değişiklik yalnız WalletProvider, video-measurements ve bunların iki mevcut test dosyasında; yeni bağımlılık/config yok.

UI beklemesi5 saniyede serbest kalır fakat gerçek SDK sonucu iptal edilip atılmaz. Geçerli geç cevap, aynı generation ve mounted/connecting korumaları altında uygulanır; yeni signIn eski restore’u geçersizleştirir. Gecikme ve güvenli hata mesajı görünür; wallet/account yokluğu olağan disconnected sonucudur, cihaz yetkisi silinmez. Mevcut yerel ölçüm altyapısına wallet_restore ve ara delayed/son disconnected durumları eklendi; bir terminal kayıt korunur, raw SDK hata/anahtar/proof kaydedilmez.

Eski kaynakta iki geç dönüş regresyonu FAILED; özellikle5 saniyeden sonra gelen geçerli hesap state’e uygulanmıyordu. Düzeltme sonrası odaklı68 test ve tüm Web316 test PASS; touched-path ESLint ve Web build PASS. İlk build zorunlu public contract env verilmediğinden page-data aşamasında durdu; aynı build repo CI’sının testnet market/access ve kapalı flag ayarlarıyla geçti. Bu yerel build’dir, canlı ortam veya CI koşusu değildir.

İncelenebilir yama `tmp/video-public-testnet-wallet-restore-source-20260911/source.patch`, SHA256 **da5c82225c43771a398bf1acab104e979d2147e52e6364303ae887e25bf0747d**; receipt ve PR metin taslağı aynı klasörde. Commit/push/PR/merge/CI/deploy, ödeme/imza/upload veya gerçek performans tekrarı yok. 30 günlük yetki, provider ve kapalı varsayılanlar değişmedi. Eski olayın tam tetikleyicisi ve10.65s renewal gecikmesi bu kaynak başarısıyla kapanmış sayılmaz.

**Tek önerilen sonraki gate VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_RELEASE_PREFLIGHT.** Dört dosyalık yama güncel main ile tekrar uzlaştırılıp somut Git/CI/korumalı yayın paketi hazırlanacak; bu gate otomatik başlamadı. Canlı düzeltme iddiası ancak ayrı yayın ve runtime kontrolüyle yapılır; maliyet/hızdan çekime henüz geçilmez.


## 20. Cüzdan düzeltmesi yayın ön kontrolü — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_RELEASE_PREFLIGHT: PASS.** Main/source base8facb7f ve dört dosyalık da5c8222… yaması aynı; dependency/workflow değişmedi, 316 test/lint/build kanıtı yeniden koşulmadan korundu. Kanonik acceptance config9a9711d7… ile ek yerel OpenNext build PASS, yeni wallet_restore client bundle’ında bulundu. Yerel artifact gelecekteki GitHub-attested artifact değildir.

Repo public; main PR ve strict CI Gate istiyor. public-testnet reviewer4rmus, gereken11 secret ismi mevcut; GitHub secret değerleri okunmadı. Public/Preview deploy switch’leri false; aktif public deploy yok. Mevcut Web/Bridge/read-model100% sürümleri ve Web20 JS hash’i son başarılı34587885148 receipt’iyle aynı. M1/M2 Published/ACTIVE, asset20/publication7, public admission OPEN. Root/Preview fingerprint ve Preview sürüm başlangıcı korundu.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_RELEASE:** bir commit/PR, gereken kontrollerden sonra normal squash ve yeni merged SHA’nın başarılı main-push CI’ıyla en fazla bir acceptance dispatch. Mevcut workflow üç public Worker’ı birlikte yeniden yayımlar. Config/secret rotation, D1 migration, kontrat işlemi, yeni medya/ödeme/imza veya performans tekrarı yok. Public switch false→true→false; Preview false kalır. Hata halinde resmî failure/rollback kanıtı korunur, kör rerun veya ikinci dispatch yok.

İncelenebilir paket `tmp/video-public-testnet-wallet-restore-release-preflight-20260911/action-package.json`; PR taslağı ve approval-report aynı klasörde. Yeni commit/SHA/CI henüz yok; eski8fac CI’ı yeni kodun yayın yetkisi sayılamaz. AGENTS gereği Git/deploy onayı beklenir; yayın ve sonraki gerçek restore/maliyet ölçümü bu ön kontrolde başlamadı.


## 21. Cüzdan geri yükleme yayını tamamlandı — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_WALLET_RESTORE_RELEASE: PASS.** Kullanıcı somut commit/PR/merge/tek yayın paketini “onaylıyorum” diyerek onayladı. Dört dosya commit’i **0018dc3036f71348ea5d235f96c75a1283cb2054**, PR196; PR CI **34609743258** ve yeni main **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6** push CI **34611141472** attempt1 success. Gereken kontroller/CodeQL tamamlandı; normal squash, bypass/force-push/CI rerun yok.

Tek korumalı acceptance koşusu **34612719919 / attempt1 / success**. Altı artifact ve iki SBOM, exact source/config ile doğrulanıp mevcut ortam onayı verildi. Web **7edfa5a6-5925-4bc0-986c-3f79adf4c7ce**, Bridge **9de194b6-8951-4b8e-83dc-c19e249877e8**, read-model **098e8ad0-6e7c-4fda-93f2-eb69587c76f6** yüzde100 trafikte. Web20 dosya hash’i artifact’e uydu; wallet_restore kodu mevcut. Config9a9711d7… aynı; bootstrap/rollback testi yok.

M1/M2 Published/ACTIVE ve job/publication nesneleri aynı; asset20→20, publication7→7, dört aktörün NEAR/testUSDC bakiyeleri aynı. Ödeme/upload/asset/imza/anahtar yenilemesi/manuel NEAR işlemi0. Public admission OPEN. Public deploy anahtarı false’a döndü, Preview false kaldı; Preview sürümü/sabit header ve workflow root fingerprint koruması geçti.

Kanıt **tmp/video-public-testnet-wallet-restore-release-20260911/receipt.json** ve acceptance altındaki imzalı artifact/deployment receipt/serving kayıtlarıdır. Kök uygulama dosyaları korunuyor; yayımlanan değişiklik izole adayın dört dosyasıdır. Bu yayın sağlık ve serving doğrulamasıdır, yeni Brave/performans kabulü değildir. Eski restore tetikleyicisi ve10.65s renewal gecikmesi canlı ölçülmeden kapanmaz.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_COST_SPEED_MEASUREMENT.** Yeni SHA/sürümlerle taze örnek seti; eski8fac’in dört örneği karıştırılmaz. Güncellenmiş **next-measurement-package.json** aynı release klasöründe. Yeni wallet_restore çıktısı izlenir, sayfa hazırlığı en çok30s ve mevcut toplam15dk/12dk ölçüm+3dk kapatma sınırı korunur. Yeni ödeme/yükleme/imza0; kullanıcı sonraki gate’i seçmeden başlatılmaz. Genel Video V1 NOT_COMPLETE.


## 22. Yeni sürüm maliyet/hız ölçümü — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_COST_SPEED_MEASUREMENT: COMPLETED_WITH_WARNINGS — kullanıcı kabulüyle kapandı (§23).** Kullanıcı gate adını seçerek release klasöründeki somut yeni-sürüm paketini çalıştırdı. Kaynak **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**, PR/main CI ve34612719919 yayını success; üç100% Worker ve20 serving JS hash’i yeniden doğrulandı. Bu koşu önceki8fac örnekleriyle birleştirilmedi.

Brave İş/soteri/M2’de12 sayfa oynadı ve her biri sonraki reload’dan önce durduruldu. Yeni wallet_restore12/12 started→completed,290–900ms; delayed/disconnected/failed yok, yeni imza yok. İlk token n12 ortanca638.75ms/en yüksek1264ms. Sayısal SDK ilk görüntü n11 ortanca3402ms/en yüksek10714ms;5000ms üst sınırı aşıldı; kullanıcı bu hız hedefini ilk sürüm kapanışı için erteledi. Dördüncü örneğin SDK değeri kısa durdurma/reload öncesi yakalanamadı, eksik tutuldu. 13. navigasyon `ERR_CONNECTION_CLOSED` ile uygulama başlamadan kesildi; bunu restore regresyonu sayacak kanıt yok. Tekrar veya Connect yapılmadı.

Pasif Bridge kayıtlarında12 POST’un tamamı200;3HIT (21/21/25ms),9MISS. n20 sağlanmadığından p95 kabulü UNPROVEN; doğal renewal0, gerçek ek maliyet UNPROVEN.15:19:02.152–15:24:47.136 UTC arasında yaklaşık345s içinde duruldu; tek izleyici için konservatif üst sınır5.75dk,15dk duvar sınırı içinde kapanış. Tail sonlandı, hata sayfasında video yok.

M1/M2 job/publication ve dört aktör bakiyesi aynı; asset20→20, publication7→7. Yeni ödeme/upload/asset/imza/NEAR işlemi0. Growth1Eylül–1Ekim gelecek fatura100USD/aşım0; UI kullanım21.83 işleme/0 dağıtım/114.69 saklama değişmedi. Geciken ve yuvarlanmış toplam sayaç sıfır ek maliyet kanıtı değildir. Public admission OPEN. Kaynak/config/Git/CI/deploy değişikliği yok.

Kanıt **tmp/video-public-testnet-cost-speed-cf81-measurement-20260911/receipt.json**; ayrıntı kabul §32–33. Önce önerilen maliyet/hız teşhisi kullanıcı kararıyla ertelendi. Bu aşama kapalıdır; tek sonraki gate **VIDEO_PUBLIC_TESTNET_CREATOR_WITHDRAWAL_PREFLIGHT**, henüz başlamadı.


## 23. İlk sürüm için kullanıcı kabulüyle kapanış — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_COST_SPEED_MEASUREMENT: COMPLETED_WITH_WARNINGS — KAPANDI.** Kullanıcı “güncel yaptığın test sayıları ve rakamları plana ekleyerek failed değil kapanmış kabul et” talimatıyla mevcut koşuyu kontrollü ilk testnet sürümü için yeterli kabul etti. Bu karar yeni bir ölçüm veya teknik hedeflerin tümünün sağlandığı iddiası değildir. Bilgisayar yükü/ağ kararsızlığı kullanıcı tarafından bildirilen bağlamdır; hatanın kesin nedeni olarak doğrulanmadı.

| Son cf81 koşusunun kanıtı | Gerçek sonuç |
| --- | --- |
| Normal açılış | 13 deneme; 12 uygulama açılışı/oynatma; 13. navigasyonda ERR_CONNECTION_CLOSED |
| Cüzdanın geri gelmesi | 12/12, ek imza0; ortanca346.4ms, en yüksek900ms |
| İlk token | 12 örnek, 12HTTP200, hata0; ortanca638.75ms, en yüksek1264ms |
| SDK ilk görüntü | 11 sayısal örnek, 1 eksik; ortanca3402ms, en yüksek10714ms |
| Sunucu önbelleği | 3HIT:21/21/25ms;9MISS |
| Doğal oturum yenileme | Bu koşuda0 örnek; önceki kanıtla birleştirilmedi |
| Süre ve sınırlar | Yaklaşık345s ölçüm;1 izleyici; konservatif üst sınır5.75 izleyici-dakika |
| Korunan medya/bakiyeler | M1/M2 aynı;20→20 asset,7→7 publication; dört aktör bakiyesi aynı |
| Yeni işlemler | Ödeme/yükleme/asset/publication/cüzdan imzası/NEAR işlemi0 |
| Son fatura gözlemi | Growth100USD; aşım0USD |
| Kullanım UI toplamları | 21.83 işleme,0 dağıtım,114.69 saklama dakikası; önce/sonra aynı |

**Ertelenmiş, kapanışı engellemeyen işler:** 5 saniyelik ilk görüntü üst sınırı ve3 saniyelik hız hedefi; yeterli p95/HIT örneği; iki doğal yenilemenin hız ölçümü; gerçek ek maliyetin faturayla ilişkilendirilmesi; tek bağlantı hatasının teşhisi. Ham ölçümler ve eksik kanıt etiketleri korunur. Fatura/sayaçların değişmemesi sıfır maliyet kanıtı değildir. Eski8fac koşusu tarihsel kayıttır; yeni cf81 kapanışını bloke etmez.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_CREATOR_WITHDRAWAL_PREFLIGHT:** çekilebilir tutar, hedef hesap, ücret ve kabul kontrolleri için incelenebilir paket hazırlığı. Bu kapanışta çekim veya başka canlı işlem başlatılmadı. Genel Video V1’in kalan aşamaları açık; bu maliyet/hız aşaması kapalıdır.

## 24. Üretici kazanç çekimi ön kontrolü — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_CREATOR_WITHDRAWAL_PREFLIGHT: PASS.** Amaç tek gerçek çekim için hesap/tutar/ücret ve sonuç paketini hazırlamaktı. Değiştirilebilir kapsam yalnız iki ana belge ve `tmp/video-public-testnet-creator-withdrawal-preflight-20260911/`; kaynak/test/config/workflow ve canlı yazımlar kapsam dışı kaldı. Kullanıcı bu görevde sıralı gate ilerleyişini yetkilendirdi; ekonomik işlem onayını korudu. Maliyet/hız kabulü yeniden açılmadı, önceki uygulama testleri tekrarlanmadı.

Kesinleşmiş **268116621** bloğu / **15:49:47 UTC**: `soteri.testnet` çekilebilir **5,88 testUSDC**, cüzdan **32,10 testUSDC / 5,271487864922676997999995 testNEAR**. Brave İş Profile aynı hesap ve **5,88** değerini gösterdi; Withdraw'a basılmadı. `utick2.testnet` cüzdanı **11 testUSDC**, çekilebilir kazancı **0**. Üç yayıncı kazancı **3,92 + 5,88 + 3,92 = 13,72**; platform **4,48**; Market FT bakiyesi **18,20** ile tam uzlaştı. Token **6 ondalık**, alıcı ve Market kayıtlı; yeni storage depozitosu gerekmiyor. **7** mevcut yayın ACTIVE; M1/M2 korunuyor, public upload hazır/açık.

Main **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**, mevcut main CI **34611141472** ve deploy **34612719919**, attempt1 success yeniden okundu. Üç public Worker **%100** önceki receipt'e ve **20 Web JS hash'i** artifact'e eşleşti. Preview sürümü/sabit başlıkları aynı. Market canlı code hash **HyMxZxV2bF7NZjuUUxFFKcJEDc6pJCvwCERR7gUFCesB**, önceki code-update receipt'iyle aynı; o yayının **cd7e485a** sözleşme kaynağı güncel main ile birebir. Dirty kökte Profile activity sorgusu main'den farklı; çekim yolu aynı, kullanıcı dosyasına dokunulmadı. Bu ayrım yerel checkout'ın çalışan kaynak sayılmasını önler.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_CREATOR_WITHDRAWAL_ACCEPTANCE — onaya hazır paket:** aynı Profile/Brave/soteri ile `withdraw_creator_balance({})`, **tek işlem, 100 Tgas, 0 NEAR depozito**; mevcut **5,88 testUSDC** kazancın tamamı aynı hesaba. Beklenen cüzdan **32,10→37,98**, Market **18,20→12,32**, creator kazancı **5,88→0**, platform **4,48→4,48**. Yöntem tutar parametresi almaz; okuma/imza arasında yeni satış olursa zincirde sabit 5,88 tavanı yoktur. İşlem öncesi görülen tutar değişirse durulur. Gas fiyatı **100.000.000 yocto/gas**, 100 Tgas nominal ön tahsis **0,01 testNEAR + dış işlem ek ücretleri**; önerilen ön/son kontrol eşiği **0,02 testNEAR**, zincir maxFee garantisi değildir. Gerçek ücret FINAL receipt'lerinden hesaplanacak. Gerekli cüzdan imzasını kullanıcı tamamlar; programlı imza/anahtar erişimi yok.

Kabul: tek hash için FINAL + başarılı FT aktarımı + callback true + aynı withdrawal ID için bir started/bir succeeded olayı ve bakiyelerin birlikte eşleşmesi. Profile sıfır/pasif Withdraw göstermeli; ikinci çekim yapılmaz. Belirsizlikte aynı hash okunur; yeniden gönderim yok. Yeni satın alma/upload/asset/publication/medya oynatma **0**; public açık kalır. Ayrıntı kabul §34 ve yerel **approval-report.md/action-package.json**.

**LOCAL_STATIC / LOCAL_TEST:** paket aritmetiği, onay/kapsam ve belge koruma kontrolleri; **CI:** yalnız mevcut koşuların taze okuması; **PREVIEW:** gerçek testnet zincir/Brave/serving; yönetilen sürüm okuması ayrıca kaydedildi. **EXTERNAL_NOT_RUN:** çekim/imza ve tüm diğer canlı yazımlar, Git/CI rerun/deploy, yeni uygulama/docs build'i. Önceden altı ilgisiz kırık bağlantıyla sonuçlanan docs build tekrar edilmedi; bu gate genel docs build PASS iddiası vermez. Diğer **273** dosya ve HEAD/index/status hash'leri korunarak yalnız iki hedef belgenin fark/boşluk kontrolü geçti; receipt/checks dosyalarında doğrulandı.

Hazırlık engeli yok; gerçek çekim **açık kullanıcı onayı bekliyor** (`AGENTS.md:19` ve bu görevin çekim/imza sınırı). Onay sonrası bu paket uygulanıp kapanış kaydedilir; sonra tarayıcı/yavaş ağ → uzun/sınır → dayanıklılık → gerçek kapasite → eski beta/nihai kabul sırası sürer. Yeni medya/imza/harcama gerektiren her adım kendi somut onay sınırında durur. Maliyet/hızın ertelenmiş bulguları aynen korunur; genel plan **NOT_COMPLETE**.

## 25. Üretici kazancı çekildi — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_CREATOR_WITHDRAWAL_ACCEPTANCE: PASS.** Kullanıcı sunulmuş tek çekim paketinin gate adını seçti; bu kapsam yürütme onayı olarak kaydedildi. Yalnız iki ana belge ve yeni yerel kanıt paketi değişebilir; kaynak/config/Git/yayın, yeni satın alma/yükleme ve programlı cüzdan imzası kapsam dışıdır. Kabul hedefi tek normal çekimi FINAL/FT/callback/bakiye ve gerçek Profile ekranıyla kanıtlamaktı.

Başlangıç kesinleşmiş blok **268117767**: soteri kazancı **5,88**, FT cüzdanı **32,10**, Market FT **18,20**, platform **4,48 testUSDC**. Main **cf81c2e2**, üç önceki Worker %100, **20** sunulan Web JS hash'i ve Market code hash pakete uydu. Brave İş Profile aynı **5,88** değerini gösterdi; Withdraw'a **bir kez** basıldı. Meteor testnet/soteri kilit ekranı açıldı, sonra kapandı. Agent parola girmedi, imza düğmesine basmadı veya programlı imza/gönderim yapmadı. Cüzdanın son onay ekranı/ücret tahmini yakalanamadı; imzalanan gerçek işlem alanları zincirden doğrulandı.

İşlem **66ShE8cudKhWd1D5342NgG2xBGyxQS1ZggB8KGQJ1DNd**, signer **soteri.testnet**, receiver doğru public Market; tek **withdraw_creator_balance({})**, **100 Tgas**, **0** dış NEAR depozito. Kanonik RPC **FINAL**, callback **true**. **Bir started**, **bir succeeded**, **bir gerçek NEP-141 FT transfer**, failed **0**; aynı **5.880.000** tutar ve withdrawal ID. Started blok **268117979 / 16:03:03.078 UTC**, succeeded **268117981 / 16:03:04.411 UTC**; zincir olay aralığı **1.333 ms**, genel hız kabulü değildir.

Kapanış blok **268118307**: soteri FT **32,10→37,98**, kazanç **5,88→0**, Market FT **18,20→12,32**; platform **4,48**, diğer iki creator kazancı **3,92 + 3,92** aynı. Yeni kalan toplam **7,84+4,48=12,32** uzlaştı. Buyer utick2'nin NEAR/FT/kazanç bakiyeleri aynı. **7/7 publication nesnesi birebir aynı/ACTIVE**, M1/M2 dahil; Market kodu/politika/governance korunuyor. Profile **0 USDC / Withdraw pasif**. Yayın listesi bir ara okuma hatasından normal otomatik yenilemeyle döndü; reload/retry/ikinci çekim yapılmadı.

**Gerçek ücret 0,000747676380855 testNEAR**: transaction + **6** receipt'in `tokens_burnt` toplamı, soteri NEAR debit'iyle birebir eşit ve **0,02** eşiğinin altında. Üç iade receipt'inin token kesintisi **0**. Market net NEAR değişimi ayrıca **+0,000092230663124899999999**; kendi iç **1 yoctoNEAR** FT depozitosu ve sözleşme gas ödülleri kullanıcı çekiminden ayrı tutulur. Nominal gas ön tahsisi gerçek ücret diye yazılmadı.

Kanıt **tmp/video-public-testnet-creator-withdrawal-acceptance-20260911/**: **authorization.json**, immutable **authorized-package.json**, **pre-submit.json**, **ui-action.json**, **transaction-identity.json**, **transaction-final.json**, **chain-before/after.json**, **fee-reconciliation.json**, **browser-after.json**, **checks.json**, **receipt.json**. Hash; aynı hesaptaki bakiye geçiş bloğu ve eşleşen Neardata receipt'inden bulundu, sonuç bağımsız kanonik RPC ile FINAL okundu. D1 ekranı ekonomik otorite sayılmadı.

**PREVIEW (public-testnet):** gerçek cüzdan akışı, zincir işlem/FT/olay/bakiyeler ve Profile; **LOCAL_STATIC / LOCAL_TEST:** paket/receipt aritmetiği, eski belge bölümlerinin ve diğer **273** dosya/HEAD/index/status koruması, explicit-path diff kontrolleri PASS. **CI:** aynı kaynağın önceden başarılı koşuları yeniden çalıştırılmadı. Yeni satın alma/upload/asset/publication/medya oynatma, Git/CI rerun/deploy/config/provider/D1 yazımı **0**. Uygulama/docs build tekrar edilmedi; önceki docs kırık bağlantı bulgusu korunur. Bu çekim dışındaki kabul testleri **EXTERNAL_NOT_RUN**.

Çekim engeli kapandı. **Tek sonraki gate VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_PREFLIGHT**; mevcut sıralı ilerleme yetkisi kapsamında, bu tur başlatılmadı. Chrome/Edge/yavaş ağ, uzun/sınır, dayanıklılık, gerçek kapasite ve eski beta/nihai kabul açık; maliyet/hız kapalı ve ertelenmiş bulgular korunur. Genel Video V1 **NOT_COMPLETE**.

## 26. Chrome/Edge ve yavaş ağ ön kontrolü — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_PREFLIGHT: COMPLETED_WITH_WARNINGS.** Amaç tarayıcı/hesap/cihaz, mevcut medya ve ölçüm sınırlarını doğrulayıp somut kabul paketi hazırlamaktı. Yalnız iki ana belge ve **tmp/video-public-testnet-browser-slow-network-preflight-20260911/** değişebilir; kaynak/test/config/Git/yayın ve canlı yazımlar kapsam dışı. Çekim ve maliyet/hız yeniden açılmadı. Kullanıcı **soteri.testnet ve utick.testnet** hesaplarını verdi; belirtilen sırayla Chrome/soteri, Edge/utick eşlendi.

Chrome **152.0.7977.84**, Edge **151.0.4129.59**, Brave **150.1.92.138** kurulu. Chrome gerçek Profile **Wallet not connected**; Connect/ödeme tıklanmadı. Edge **MacWelcome / Haydi başlayalım** ilk kurulum ekranında; kurulum/tercih/onay değiştirilmedi. Chrome/Edge otomasyon eklentisi bağlı değil, native CUA kullanılabilir. Kurulu uygulama, başarılı oturum veya canlı kabul değildir.

Kaynak main **cf81c2e2**: altı dosyadan dördü dirty kökle aynı; `device-session.ts` ve `livepeer-playback.ts` içindeki eski kök farkları korunup güncel main incelendi. Mevcut canary'nin **slow=150 ms / 200.000 B/s indirme / 100.000 B/s yükleme** profili var; kaliteyi elle seçiyor ve tekrar için yeni HLS oyuncusu açıyor. Bu, gerçek Auto veya aynı oyuncuda doğal yenileme kabulü değildir. Üst live canary ayrıca yeni provider key/asset işlemleri yapar; çalıştırılmadı, bu pakete alınmadı. Yeni harness/dependency veya source düzeltmesi eklenmedi.

Kesinleşmiş **268119486** bloğunda iki hesabın **14** publication hakkı okundu. Soteri FT **37,98**, utick FT **30,235460 testUSDC**; NEAR **5,270740188541821997999995 / 3,492099954557414479777161**, token kayıtları mevcut. Soteri **testt** (`lp-e6a312e5-4273-481d-a337-7c622a4cca53`) ve utick **M2** (`lp-491fb8eb-451f-4fc6-918e-b94d6876fc02`) için henüz hak sahibi değil; fiyatlar **2 + 2 testUSDC**. Yeni tarayıcı yetkisini bu iki normal satın alma sağlayabilir; yeni upload gerekmez. M2 iki tarayıcıda ortak oynatma hedefidir, Chrome'da soteri sahibidir.

**268119570** bloğu: soteri **3/3**, utick **1/3** aktif cihaz. Yeni Chrome yetkisi soteri'nin en eski **10 Eylül 15:31:50.555 UTC** kaydını çıkarır; public-key SHA256 **a84b644789da0c9dc60714867c0a4fefcd08c91e6641b50d8c177fdebf0105d0**. Diğer iki kayıt korunur; Edge utick **1→2**, çıkarma yok. Önceki “iki ayrı hesap zorunlu” varsayımı kaynak okumasıyla düzeltildi: gerçek politika üç cihazdır. **Mevcut Brave'in çıkarılacak kaydı kullanmadığı ödeme öncesi eşleştirilmeden yeni yetki verilmez**; hesap adı tek başına yeterli değildir. Cihaz çıkarma somut onay paketinde açıkça yer alır; politika değişmez.

Taze provider okuması **20 asset**, hedef M2/M1/testt **ready/JWT**. M2 **269.467.407 bayt / 600,025521 sn**; **7 ACTIVE publication**, Bridge/read-model aynı sürüm ve public hazır/açık. Bu tur HLS/token/oynatma başlatılmadı. Kaynaktaki **800 kbps / 3 Mbps** profil hedefleri gerçek manifest bit hızları sayılmaz; **1,6 Mbps** yavaş ağın uygunluğu canlı koşudan önce gerçek listeden doğrulanır.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_ACCEPTANCE — onaya hazır paket:** iki tekil `ft_transfer_call`, **100 Tgas + 1 yoctoNEAR** depozito; toplam **4 testUSDC**, işlem başına **0,05 / toplam 0,10 testNEAR** ücret kontrol eşiği. İki yeni cihaz yetkisi ve yukarıdaki tek eski soteri kaydının çıkarılması dahildir. İki ödeme sonunda soteri/utick FT **35,98 / 28,235460**, creator kazançları **1,96 / 5,88**, platform **4,56**, Market FT **16,32 testUSDC** beklenir. Creator kazancı cüzdana kendiliğinden eklenmez; yeni çekim yok. Edge ilk kurulumu ve mevcut Meteor oturumlarını kullanıcı tamamlar; agent parola/anahtar aktarmaz veya cüzdan imzası yapmaz.

Ölçüm: **2 tarayıcı × 2 ağ = 4 hücre**, toplam en çok **8 başlangıç**; tarayıcı başına planlı **480 sn**, toplam **960 sn / 16 izleyici-dakika**. Her tarayıcıda aynı uzun oyuncu **180 sn normal → 210 sn yavaş → 60 sn toparlanma**, ayrıca normal/yavaş kısa tekrarlar. Auto **720→360→720**, normal/yavaş doğal yenileme ve gerçek sayısal ilk görüntü kaydedilir. En çok **18 izleyici-dakika**, 17'de durma; tek izleyici, **40 token POST**, **45 dk duvar / 40'ta durma + 5 kapatma**, **1 USD ek kullanım gözlem eşiği**. Bunlar sert fatura/chain maxFee değildir. İki örnek/hücreden p95 veya genel hız kabulü çıkarılmaz; maliyet/hız ertelemeleri korunur. Sonunda pause ve No throttling/orijinal cache/viewport; public açık kalır.

**LOCAL_STATIC / LOCAL_TEST:** paket sayıları, hak/cihaz/ödeme bağı ve iki belge diff/koruma kontrolleri PASS; diğer **273** dosya, HEAD/index/status korundu. **PREVIEW:** gerçek Chrome/Edge hazırlık ekranları, taze zincir/runtime okumaları; **PROVIDER:** yalnız asset GET. Canlı Chrome/Edge/slow oynatma **UNPROVEN / EXTERNAL_NOT_RUN**. Ödeme/imza/upload/yeni cihaz/asset/publication/Git/CI rerun/deploy/config/D1 yazımı **0**; mevcut testler ve bilinen altı eski link hatalı docs build tekrar edilmedi.

Kanıt **action-package.json**, **approval-report.md**, **browser-inventory.json**, **account-choice.json**, **account-preflight.json**, **soteri-devices.json/utick-devices.json**, **source-parity.json**, **provider-before.json**, **runtime-before.json**, **checks.json/receipt.json**. Hazırlık tamamlandı; canlı kabul kullanıcı tarayıcı/cüzdan hazırlığı, mevcut Brave cihaz eşleşmesi ve **ayrı iki ödeme/cihaz değişikliği/medya koşusu onayı** olmadan başlamaz. Genel Video V1 **NOT_COMPLETE**.

## 27. Chrome/Edge koşusu — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_ACCEPTANCE: BLOCKED / NOT_COMPLETE.** Kullanıcı hesapları **Chrome/utick2.testnet**, **Edge/soteri.testnet** olarak düzelterek execution gate'ini seçti. Aynı iki yayın ve tutar sınırıyla paket güncellendi; ayrı kullanıcı yanıtları duvar sınırını **45→60→75 dk** yaptı. İzleyici üst sınırı **18 dk**, toplam **4 testUSDC / 0,10 testNEAR** ücret kontrol eşiği değişmedi. Yazılabilir kapsam iki ana belge ve yeni yerel kanıttır; uygulama/config/Git/yayın değişmedi.

Chrome **152.0.7977.84**, Edge kullanıcı kurulumu sonrası **152.0.4191.66**; gerçek oturumlar doğrulandı. Edge konsolunun yapıştırma güvenlik uyarısını kullanıcı kendi geçti; agent güvenlik uyarısını aşmadı, parola/özel anahtar okumadı veya wallet imzası yapmadı. Brave cihazının yalnız public-key özeti okundu: **c9ad9bb6…**, korunacak en yeni kayıtla eşleşti. Geçici yerel ölçüm, mevcut console olayları/token yanıtlarının yalnız süre/hash/expiry alanlarını ve video özelliklerini topladı; JWT veya özel anahtar kaydetmedi. Bu gözlem uygulama source yayını değildir.

| Onaylı satın alma | FINAL işlem / gerçek ücret |
| --- | --- |
| Chrome/utick2 → M2, 2 testUSDC | **AmzLwCL1Se1UsBAmvHXLvoSQA7JE7HVxFDZeoBV3sggL**, **0,0008419061390878 testNEAR** |
| Edge/soteri → testt, 2 testUSDC | **GZLH6nqnEBoAEu1A4onDVp4qUfv2THy2rL34uxriZmck**, **0,000841487838275 testNEAR** |

İkisi de tek `ft_transfer_call`, **100 Tgas / 1 yoctoNEAR**; toplam **4 testUSDC**, ücret **0,0016833939773628 testNEAR**. Utick2 FT **11→9**, soteri FT **37,98→35,98**, Market **12,32→16,32**, platform **4,48→4,56**. İki yeni hak oluştu. Utick2 cihazları **2→3**; soteri **3→3**, onaylı en eski **a84b6447…** çıktı, Brave **c9ad9bb6…** ve diğer korunacak kayıt kaldı. Yeni çekim/yükleme/asset/publication yok; **7** publication aynı/ACTIVE.

| Tarayıcı | Normal ilk / tekrar, ms | Yavaş ilk / tekrar, ms |
| --- | ---: | ---: |
| Chrome | **805 / 252** | **254 / 253** |
| Edge | **243 / 251** | **10718 / EXTERNAL_NOT_RUN** |

Yedi gerçek SDK sayısal değeri; bunlardan p95/genel hız kabulü çıkarılmaz. Chrome viewport **1096×869**, Edge **1357×966**, her koşu içinde sabit. Slow ayarı **1,6/0,8 Mbps +150 ms**; gerçek M2 master **360p 1.021.363 / 720p 3.265.656 bit/s**. Bu ayar uygulandı fakat önceden doldurulmuş tampon/önbellek etkisi dışlanmadı; gerçek ağ kısıtının Auto seçimine neden olduğu iddia edilmez.

Chrome normal/yavaşta gerçek token değişimi ve HTTP200 yenilemeleri görüldü. Kullanıcı iki uzun koşuyu duraklattığını **“Ben duraklattım”** diye doğruladı; bunlar uygulama hatası değildir. Aynı video öğesi korunarak normal ağda toplam yaklaşık **170 sn** ek oynatma sonunda hâlâ **360p** görüldü; 720p toparlanması **UNPROVEN**. Tamamlanmış normal örnekler veya satın alımlar tekrarlanmadı; kalan yavaş başlangıçlar kullanıldı.

Edge uzun koşu aynı video öğesinde **449,965271 sn** ilerledi. Normal/yavaş/toparlanma yenilemeleri **815 / 824,5 / 1509,5 ms**, HTTP200 ve farklı token hash/expiry ile doğrulandı. **190,90 sn'de**, daha yavaş ağ uygulanmadan **360p** ve **409,13 sn** ileri tampon vardı; sonrasında kalan içerik tamamen tamponlandı. Normal ağa dönüşte de 360p kaldı. Bu sonuç ağ kaynaklı **720→360→720** kabulünü kapatmaz; buffer/önbellek etkisini ayıran teşhis gerekir.

Sekiz sayfa başlangıcı, **yedi Play/ilk görüntü örneği**; son Edge sayfasında video **paused=true/currentTime=0**, duvar sınırında Play yapılmadı. Konservatif aktif izleme üst hesabı Chrome **538 sn**, Edge **482 sn**, toplam **1020 sn / 17 dk**; 18 dk sınırı altında, test ekibi aynı anda bir oynatma başlattı. Oynatmanın durmuş olduğu son başarılı örnek **17:48:36 UTC**, 75 dk son sınırı yaklaşık **17:49:08 UTC**. **Temizlik zamanında tamamlanamadı:** Edge ağ/probe kaldırma kanıtı **17:50:42 UTC**, başlangıçtan **76,56 dk**; daha sonraki profil/DevTools doğrulaması ayrıca kayıtlı. Duvar sınırına uyulduğu iddia edilmez.

Kapanış: iki test tarayıcısında **No throttling**, eski cache ayarı, geçici profil/gözlem kaldırma, DevTools kapatma ve doğru Profile hesapları/no player doğrulandı. Provider **20→20** asset ve yedi yayın korunur; public açık. Fatura ekranı yeniden okundu: Growth **100 USD / overage0**; gerçek ek maliyet gecikmeli/yuvarlanmış toplamdan çıkarılamaz. Maliyet/hızın kapalı kabulü yeniden açılmadı.

Kanıt **tmp/video-public-testnet-browser-slow-network-acceptance-20260911/**: authorization/authorized-package, iki payment-final/verified kaydı, before/after chain/device/provider, Chrome/Edge sonuçları, user-pause-confirmation, cleanup/billing-after ve checks/receipt. **PREVIEW:** gerçek UI/chain/oynatma; **PROVIDER:** metadata/fatura; **LOCAL_TEST:** yalnız gözlem redaksiyonu, receipt ve koruma kontrolleri. Diğer **273** dosya/HEAD/index/status ve eski belge bölümleri korundu; Git/CI rerun/deploy/source/config/D1 yazımı ve uygulama/docs test tekrarı yok.

**Eksik:** son Edge yavaş tekrar örneği, ağdan kaynaklanan Auto geçişi ve temiz bir kesintisiz koşu. Bunlar tamamlandı veya kullanıcı kabulüyle kapandı sayılmaz. **Tek sonraki gate VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_DIAGNOSIS:** mevcut kanıttan tampon/önbellek ve ölçüm yöntemini salt-okunur ayırıp yalnız eksik testler için paket hazırlamak. Yeni ödeme gerekmez; ek izleme veya harcama sınırı bu kayıtla açılmaz. Uzun/sınır aşamasına geçilmedi; genel Video V1 **NOT_COMPLETE**.

## 28. Tampon ve ölçüm yöntemi teşhisi — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_DIAGNOSIS: PASS.** Kullanıcı bu gate'i seçti. Amaç mevcut kanıt ve kayıtlı çalışan kaynakla tampon/cache/ölçüm etkisini ayırmak; yalnız iki ana belge ve **tmp/video-public-testnet-browser-slow-network-diagnosis-20260911/** değişebilir. Yeni tarayıcı oynatma, token/HLS isteği, ödeme/imza, uygulama/library/config/feature flag değişikliği veya Git/yayın yok. Bu sonuç gerçek tarayıcı kabulünü kapatmaz.

GitHub main yine **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**. Exact main lock ile yerel paketler eşleşti: **@livepeer/react4.3.6, core3.3.1, core-web5.2.6, hls.js1.6.16**. Player kaynağı kökle aynı; playback ve lock'taki eski kök farkları korunup exact main okundu. HLS varsayılanları kayıtlı ve önceki koşuda serving'i doğrulanmış Web artifact'inde de bulundu; bu tur yeni deploy/runtime kabulü yok.

Uygulama **videoQuality=auto**; SDK Auto için **currentLevel=-1** kullanıyor. `capLevelToPlayerSize=true` korunuyor; gerçek element/DPR/aktif level ölçülmediğinden viewport tek başına kalite sınırını kanıtlamaz. `preload=metadata`, SDK'nın **attachMedia→loadSource→autoStartLoad=true** akışını kapatmıyor. HTML preload etiketi HLS ileri tamponunun tavanı değildir.

HLS varsayılanları **maxBufferLength30 sn, maxBufferSize60.000.000 bayt, maxMaxBufferLength600 sn**. Formül **min(max(8×byte bütçesi / level bitrate,30),600)**; kayıtlı M2 bildirilen bit hızlarıyla **720p146,984 sn / 360p469,960 sn**. Bunlar hesaplanan hedeflerdir; canlı aktif-level/bitrate ölçümü veya mutlak MSE sınırı değildir, fragment sınırında aşılabilir. Edge'in **190,901625+409,131708=600,033333 sn** tampon sonu, 600,043 sn player süresinin neredeyse tamamıdır. Yeni ağ koşulunu önceden tamponlanmış görüntüye bağlamak doğru değildir. HTTP cache kullanılıp kullanılmadığı kayıtta yok; cache etkisi kesin kök neden diye yazılmadı.

Eski probe'nun ölçüm kusurları yalnız fake fetch ile yerelde doğrulandı: reddedilen **1 gönderim→0 sayaç**, **20 sınırında21 gönderimden sonra durma**, dispose/yeniden kurulumda **21→0**. Ayrıca global deadline yerine ilk Play'e bağlı yerel490sn alarmı var; pause tek başına HLS yükleme/yenilemeyi bitirmiyor. Bu bulgular önceki gerçek koşuda40 isteğin aşıldığını göstermez; tam sayımın neden UNPROVEN kaldığını açıklar. Kullanıcının iki pause beyanı ve gerçek duvar aşımı korunur; uygulama ABR kusuru kanıtlanmadı.

**Tek sonraki gate VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_MEASUREMENT_PREFLIGHT:** yalnız yerel geçici gözlem/controller, sayaç ve kapanış kontrolleri. Reset/navigasyonda korunmuş tek ledger, gönderimden önce limit kontrolü, hata/retry sayımı, N+1 isteğini göndermeme, bir kez başlatılan mutlak deadline, tekil timer temizliği ve bitişte player route'undan çıkış hazırlanıp yerelde doğrulanır. Yeni servis/dependency veya uygulama tampon ayarı gerekmez. Bu yerel gate mevcut döngü yetkisiyle yürür; kullanıcıdan yeniden genel “devam” beklenmez.

Yerel hazırlık sonrasında önerilen, **henüz onaysız** canlı paket: mevcut M2 ve aynı ödenmiş Chrome/utick2, Edge/soteri; **0 yeni ödeme/yükleme/imza/cihaz/asset**, en çok **3 başlangıç**. İki kesintisiz Auto döngüsü ve yalnız eksik Edge tekrarı. HTTP cache yalnız test sekmesinde kapalı; cookies/IndexedDB silinmez. Kontrollü yüksek **8 Mbps** ve düşük **1,6 Mbps**, her ikisinde upload **0,8 Mbps /150 ms**. Geçiş öncesi gerçek buffer **≤45 sn** ve ağdan gelen segment status/byte/süre/cache kanıtı şart; aksi durumda durulur. Manuel kalite/seek/buffer flush veya kaynak ayarıyla başarı üretilmez. HLS yukarı geçiş katsayısı **0,7** nedeniyle yüksek profile pay bırakıldı; gerçek wire ölçümü olmadan uygun sayılmaz.

Gelecek canlı bütçe **önerisi**: planlı yaklaşık **495 sn**, üst **12 izleyici-dakika /30 dk duvar**, **22'de ölçüm sonu +8 dk kapatma**, **20 token denemesi/tarayıcı /toplam40**, **1 USD kullanım gözlem eşiği**; sert fatura tavanı değildir. Sayaç/capture hazırlığı geçmeden çalıştırma onayı istenmez. Yedi eski örnek, ödemeler ve kapalı maliyet/hız/çekim tekrar edilmez.

Kanıt: **report.md**, **source-parity.json**, **artifact-buffer-config.json**, **replay-diagnosis.mjs/replay-result.json**, **next-gate-package.json**, **proposed-run-package.json**, **checks.json/receipt.json**. **LOCAL_TEST** sayaç/formül doğrulaması PASS, yeni canlı kanıt **EXTERNAL_NOT_RUN**. Diğer **273** dosya/HEAD/index/status ve eski belge bölümleri korunur; belge diff kontrolü geçti. Uygulama/docs build ve CI tekrar edilmedi. Teşhis engeli yok; gerçek Auto kabulü ve genel Video V1 **NOT_COMPLETE**.

## 29. Tarayıcı/yavaş ağ aşamasının kullanıcı kabulüyle kapanışı — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_ACCEPTANCE: COMPLETED_WITH_WARNINGS — KAPANDI.** Kullanıcı testleri yeterli buldu; yalnız bu aşamayı kontrollü ilk testnet sürümü için uyarılarla kapatma önerisine **“önerdiğin gibi yap.”** diyerek açık onay verdi. Kapanış yeni bir teknik test başarısı veya bütün Video V1'in kabulü değildir. Bu tur yalnız iki ana belge, yerel güncel receipt/progress ve ertelenen paket durumları değişti; önceki halleri yerel kapanış arşivinde korunur.

Kabulün sayısal temeli: Chrome normal **805/252 ms**, yavaş **254/253 ms**; Edge normal **243/251 ms**, yavaş **10718 ms**, son tekrar çalıştırılmadı. Toplam **7** SDK ilk görüntü örneği; Edge'de aynı oyuncuda **449,965271 sn** ilerleme; gerçek HTTP200/token yenilemeleri. İki FINAL satın alma **4 testUSDC /0,0016833939773628 testNEAR**; haklar ve cihazlar korunuyor. **20→20 asset /7 aynı ACTIVE publication** önceki koşunun kanıtıdır; bu kapanışta yeniden canlı okunmadı.

**Ertelenmiş bulgular:** ağ etkisini tampon/cache'den ayıran Auto geçişi ve 720p toparlanma; son Edge yavaş tekrar; Chrome'da kullanıcı pause'larından etkilenmiş kesintisiz koşu; ölçüm sayacının başarısız istek/limit/reset kusurları ve eksik40POST kanıtı; yaklaşık17dk izleme hesabının ölçüm sınırı; temizlik dâhil75dk duvar aşımı; gecikmeli/yuvarlanan provider toplamlarından gerçek ek maliyet çıkarılamaması. Uygulama veya provider kusuru kanıtlanmış sayılmaz. Bulgular giderilmedi; bu aşamanın kapanış engeli olmaktan kullanıcı kararıyla çıkarıldı. Gelecekte bütçeli bir test çalıştırılacaksa güvenilir sayaç ve durdurma kontrolleri yine o koşunun ön şartıdır.

**VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_MEASUREMENT_PREFLIGHT** ve **VIDEO_PUBLIC_TESTNET_BROWSER_SLOW_NETWORK_REMAINING_ACCEPTANCE** önerileri **DEFERRED_BY_USER_ACCEPTANCE / bu aşama için zorunlu değil**. Eski12 izleyici-dakika/30dk/1USD taslağı onaylanmadı ve başlatılmayacak. Yedi tamamlanmış örnek, ödemeler veya kapalı maliyet/hız testleri tekrar edilmez.

Kapanış doğrulaması **LOCAL_STATIC**: iki belge diff/boşluk kontrolü, mevcut sayısal alanların ve diğer **273** repo dosyası/HEAD/index/status koruması PASS. Test, tarayıcı, Git/CI/deploy, ödeme/çekim/yükleme/imza veya provider/NEAR/D1 işlemi **0**. Kanıt **tmp/video-public-testnet-browser-slow-network-acceptance-20260911/user-acceptance-closeout/**; güncel receipt kullanıcı kabulünü teknik kanıt eksiksizliğinden ayırır.

Kapanış engeli yok. **Tek sonraki gate VIDEO_PUBLIC_TESTNET_LONG_BOUNDARY_PREFLIGHT**, uzun içerik/5GB ve sınır senaryolarının yerel/salt-okunur hazırlığı; bu tur başlamadı. Kapasite, dayanıklılık, eski beta ve nihai kabul açık kalır. Genel Video V1 **NOT_COMPLETE**; mevcut sıralı ilerleme yetkisi ve her yeni canlı işlemin onay sınırı korunur.

## 30. Yalnız 5GB / 120 dakika yükleme hazırlığı — 11 Eylül 2026

**VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PREFLIGHT: COMPLETED_WITH_WARNINGS.** Kullanıcı **“sadece büyük dosya yani 5gb ve 120dk yüklemeyi test et”** dedi. Önceki LONG_BOUNDARY_PREFLIGHT taslağı bu dar kapsamla seçildi: tek birleşik L/B dosyası, yalnız aktarım/işleme/yayın sonucu; 5GB+1, farklı container, uzun izleme, kapasite ve yeni tarayıcı testleri yok. Amaç/kabul: geçerli dosyanın tam5GB aktarımını ve provider120dk tanımasını kanıtlamak, yayın sonucunu ayrıca kaydetmek. Değişebilir dosyalar yalnız iki ana belge ve **tmp/video-public-testnet-long-upload-preflight-20260911/**; kaynak/config/feature flag/Git/yayın ve mevcut kullanıcı dosyaları değişmez.

**LOCAL_TEST:** **video-v1-120min-5GB.mp4**, tam **5.000.000.000 bayt**, H264 **1280×720** + AAC; video **7200,008008 sn**, ses **7200 sn**. Son karenin8ms farkı açıktır. 60sn sentetik test klibi tekrarlanarak üretildi; **4.999.746.741 bayt** gerçek MP4 ve **253.259 bayt** geçerli free atom (**%0,00506518**), sparse/boş dosya değil. SHA256 **23cbfff37942c0f8a6cf885f2a2a72273739859c69af9f656ea778cdac2cca05**. Tam ffmpeg çözümlemesi **215.886 kare /exit0 /0 hata**. Bunlar canlı upload kabulü değildir. Hazırlık sonunda yaklaşık **19,05GB** disk boş.

**LOCAL_STATIC / PREVIEW / PROVIDER ayrı:** GitHub main **cf81c2e292e703b8a5e2e83f502cd34c4607cbf6**; ilgili dört kaynak dosyası eşleşti. Taze chain/runtime okumalarında public OPEN, aynı üç servis sürümü, **7 ACTIVE publication**; provider **20 asset**. Soteri **35,98 testUSDC**, gün içinde **1/2** upload, aktif rezervasyon0; Brave Profile soteri. Billing mevcut UI Growth **100USD /overage0**, transcoding21/storage114/delivery0 dakika; gecikmiş olabilir, ek maliyet ölçümü değildir.

**Onaya hazır tek koşu:** Brave/soteri; başlık **Video V1 kabul — 5GB 120dk — 2026-09-11**, bilet2testUSDC ancak satın alma0. Tek yeni job/asset, en çok1 publication ve1 ödeme. **1,50 upload +0,10 sponsor =1,60 testUSDC**, beklenen FT **35,98→34,38**. Tek sponsor delegate imzasını kullanıcı yapar; mevcut cihaz korunur, yeni key/eviction yok. Teklif ve admission imzadan önce tazelenir. Yürütme başlangıcından **240dk**, **230'da ölçüm sonu +10dk kapatma**; **0,10 testNEAR /5USD ek kullanım gözlem eşiği**, sert fatura/chain tavanı değil. İşleme tarayıcı kapanınca durmayabilir; başarılı asset saklanır ve depolama devam eder. Önceki hızla aktarım tahmini **112dk**; garanti değil. 32MiB ile retriesiz **150 PATCH /son389.632 bayt**.

**Bilinen risk:** provider doğrulayıcı **64** küçük resim referansıyla sınırlı. Önceki10sn aralığı sürerse120dk yaklaşık **720** kaynak üretebilir; gerçek uzun provider çıktısı **UNPROVEN**. Aktarım/provider ready başarılıyken yayın **provider_playback_mismatch** ile engellenebilir. Güvenlik kontrolü atlanmaz, limit büyütülmez, ikinci ödeme/yükleme yapılmaz. Tam TUS son offset **5.000.000.000**, provider byte/süre/hash, aynı job/asset/deadline, ödeme/bakiye ve NEAR Published/ACTIVE→Discover sonucu ayrı kaydedilir. Sadece UI100% veya provider ready tam uçtan uca kabul sayılmaz.

Kanıt **media-manifest.json**, **decode-progress.log/decode.log**, **action-package.json**, **approval-report.md**, **source-parity.json**, **chain/runtime/provider-before.json**, **billing-before.json**, **checks.json/receipt.json**. Diğer **273** repo dosyası ve HEAD/index/status koruma kontrolü; eski testler/CI/docs build tekrarlanmadı. Yeni ödeme/yükleme/imza/provider veya NEAR/D1 yazımı **0**. Canlı kabul **EXTERNAL_NOT_RUN**. **Tek engel yeni1,60testUSDC/provider/duvar bütçesi onayı**, AGENTS.md sınırı; önceki ödeme yetkileri bu dosyaya taşınmaz. Tek sonraki gate **VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_ACCEPTANCE**; bu testten sonra durulur, diğer aşamalar mevcut isteğin dışında kalır ve tamamlanmış sayılmaz.

## 31. Tek gerçek 5GB / 120 dakika yükleme — 11 Eylül 2026

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

## 32. Büyük dosyanın yayın doğrulaması teşhisi — 12 Eylül 2026

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

## 33. Büyük dosya doğrulamasının sınırlı adımlara bölünmesi — 12 Eylül 2026

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

## 34. Korumalı yayın ve aynı işin kurtarılması için ön kontrol — 12 Eylül 2026

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

## 35. Büyük dosya düzeltmesinin korumalı yayını — 12 Eylül 2026

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
