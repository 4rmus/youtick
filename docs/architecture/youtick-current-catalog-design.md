# YouTick güncel katalog tasarımı

**Gate:** `YOUTICK_CURRENT_CATALOG_DESIGN` — **PASS (tasarım)**;
uygulama ve canlı geçiş yapılmadı.
**Tarih:** 29 Eylül 2026. **Hedef:** mevcut cüzdanlı public-testnet V1.

## Karar ve kapsam

Keşfet ve Profil, NEAR'ın kesinleşmiş **güncel yayın durumundan** üretilen küçük
bir D1 kataloğu kullanacak. Yeni yayın görünürlüğü, geçmiş olay taramasının
yetişmesine bağlı olmayacak. Ödeme, bakiye ve izleme hakkının otoritesi NEAR
olarak kalacak; Livepeer ve Bridge'in görevleri değişmeyecek.

Bu gate yalnız bu belgeyi ekler. Kod, migration, mevcut belgeler, özellik
bayrakları, sağlayıcı ayarları ve canlı kayıtlar değişmez. Commit/push/PR,
CI çalıştırma, deploy, ödeme ve yükleme yapılmaz. Ana ajan tek yazıcıdır;
bağımsız inceleme salt okunurdur.

İncelenen kaynak tabanı `cef34ce9ace85c06d53d29987d8b3da87d73ea82`;
`catalog-integration` çalışma alanının ağacı bununla eşleşir. Ana çalışma
alanındaki korunmuş sosyal giriş ve diğer yerel değişiklikler uygulama tabanı
olarak taşınmaz. İleride uygulama başlarken güncel main ayrıca doğrulanır.

## Mevcut durumdan ayrım

- `read-model/api.mjs` yalnız yayın listesi, yayın detayı ve üretici yayınlarını
  sunuyor. Profil bakiyesi ve bilet hakkı doğrudan NEAR'dan okunuyor.
- Mevcut tarayıcı bütün blok gövdelerini saklamıyor; blokları okuyup YouTick
  olaylarını ayıklıyor. Saklanan geçmişi azaltmak tek başına tarama yükünü çözmez.
- `get_publications_count` ve `get_publications` bütün yayınların güncel durumunu
  veriyor. Satışı durdurma ve kaldırma yayın kimliğini listeden silmiyor.
- `scripts/bootstrap-market-read-model-d1.mjs` aynı kesinleşmiş bloktan okuma
  yaklaşımını zaten içeriyor. Yazma işlevi yalnız boş D1 içindir; mevcut D1'de
  çalıştırılmayacak ve boşluk koruması kaldırılmayacak.

29 Eylül 14:02:57 UTC'deki önceki salt-okunur gözlemde kontrat toplam 18 yayın,
eski katalog 17 ACTIVE kayıt döndürdü. Bu zamanlı gözlemdir; toplam sayı ile
ACTIVE sayısı tek başına eşitlik ölçütü değildir. Canlı kabulde aynı kimliklerin
ve durumların karşılaştırılması gerekir.

## Tutulacak veri

Aynı D1 içinde iki yeni tablo önerilir. Yeni veritabanı, Queue veya sürekli
çalışan ayrı servis gerekmiyor. Eski tarayıcı bu tablolara yazmayacak.

| Tablo | Alanlar ve anlamı |
| --- | --- |
| `current_publications` | Anahtar: `network`, `contract_id`, `publication_id`. İçerik: `creator_id`, `title`, `generation`, `price_usdc`, `playback_id`, `availability`, `published_at_ms`. Her yayın için yalnız güncel kayıt. Tutar mikro-USDC metni olarak korunur; kayan noktalı sayıya çevrilmez. |
| `current_catalog_state` | Ağ/kontrat başına tek satır: `verified_block_height`, `verified_block_hash`, `source_block_timestamp_ms`, `checked_at_ms`, `publication_count`, `content_revision`. Kesinleşmiş kaynak bloğu, son başarılı kontrol ve içerik sürümü birbirinden ayrılır. |

`availability` üç durumu da tutar: `ACTIVE`, `SALES_SUSPENDED`, `TAKEDOWN`.
Keşfet yalnız ACTIVE kayıtları, Profil üreticinin bütün durumlarını listeler.
Başarısız veya eksik okuma bir yayını silme gerekçesi değildir. Mevcut kontratta
kimlikler kalıcı olduğundan tam aday listede önceki bir kimliğin kaybolması
veya toplam sayının azalması kabul edilmez; kontrat değişmişse uyumluluk yeniden
incelenir. Genel bir silme/TTL sistemi eklenmez.

`content_revision`, normalize edilmiş yayınların kimliğe göre sıralanmış
içeriğinin deterministik SHA-256 özetidir. Yalnız içerik değişirse değişir;
blok yüksekliğinin ilerlemesi liste sırasını veya içerik sürümünü değiştirmez.
Kriptografik zincir kanıtı değil, yerel tutarlılık/sayfalama kimliğidir.

Eski `publications`, `finality_watermarks`, `chain_events`, satış, erişim,
çekim ve yönetim tabloları korunur. `upload_job_archives` ve
`operator_outbox_archives` yükleme/işlem kurtarma kanıtıdır; kaldırılmaz.
Yeni katalog kaydı ekonomik işlem geçmişi yerine geçmez.

## Yenileme ve atomik kabul

1. Mevcut bir dakikalık cron, bayrak açıksa katalog yenilemesini başlatır.
   İstek başına veya ziyaretçi başına yeni bir NEAR tam taraması yapılmaz.
2. `block(finality=final)` ile yükseklik, hash ve kaynak zamanını alır. Yayın
   sayısı ve liste çağrıları aynı `block_id=hash` ile yapılır. Yanıtların hem
   hash hem yükseklik eşleşmesi denetlenir; farklı bloklardan cevaplar birleşmez.
3. Katalog tavanı **95 yayındır** (ilk pilot 48 idi; bkz. "Sayfalama ve
   kapasite"). Liste aynı bloktan 48'lik sayfalarla okunur. Tavan aşılırsa
   sessiz kırpma veya rastgele ilk sayfa yoktur: aday reddedilir, son sağlam
   katalog korunur ve `catalog_capacity_exceeded` kaydedilir; %80'de (76)
   `catalog_capacity_warning` verilir. Boş katalog yalnız ilk doğrulanmış
   sayının sıfır olmasıyla mümkündür.
4. Tamlık, tekil kimlikler, alan biçimleri ve bütün durumlar doğrulanır.
   Sayı ile liste uzunluğu eşleşmeli; eksik veya yinelenen kayıt kabul edilmez.
   Aynı kimliğin üretici/yayın zamanı gibi değişmez alanlarında uyuşmazlık
   veya generation gerilemesi varsa tüm aday reddedilir. Bu kontrat sürümünde
   durum geriye açılmaz: ACTIVE → SALES_SUSPENDED/TAKEDOWN ve
   SALES_SUSPENDED → TAKEDOWN kabul edilir; TAKEDOWN → ACTIVE reddedilir.
5. Geçerli adayın değişen/yeni satırları ve katalog durum satırı tek D1
   `batch()` işlemiyle kaydedilir. İçerik aynıysa yayın satırları yeniden
   yazılmaz; yalnız doğrulama bilgisi ilerler. Yeni liste hazır olmadan eskisi
   boşaltılmaz. Herhangi bir SQL hatasında bütün işlem geri alınır.
6. Eşzamanlı iki cron için veritabanında atomik sürüm kontrolü gerekir:
   eski yükseklik yeni sonucu ezemez; aynı yükseklik/farklı hash veya içerik
   hatadır. Aynı yükseklik/hash/içerik tekrarı zararsızdır. Aday yazılmadan
   önce uygulama tarafında kontrol etmek tek başına yeterli değildir.
   Yarış kaybedildiğinde bütün batch iptal olmalı; son durum yazısının sessizce
   sıfır satır etkilemesi önceki satır değişikliklerini kalıcı bırakamaz.

NEAR zaman damgası nanosaniyeden `BigInt` ile milisaniyeye çevrilir ve güvenli
tamsayı aralığı denetlenir. Bu veri mevcut bootstrap sonucunda yoktur; yeni
katalog okuma sonucuna eklenir. `Date.now()` kaynak bloğunun zamanı yerine
kullanılmaz. Okuma yardımcıları dar kapsamda paylaşılabilir; eski bootstrap
yazıcısının davranışı ve 48 sınırı değiştirilmez.

### Aynı Worker'ın çalışma bütçesi

Gölge doğrulamada eski tarayıcı da çalışacağı için yeni iş mevcut 995 sorguluk
bütçeye sınırsız eklenemez. **Önerilen üst sınır:** katalog işi için en fazla
100 D1 sorgusu, eski blok yazıları için en fazla 895 sorgu, mevcut tarama
kontrolleri için 5 sorgu; toplam invocation en fazla 1.000 sorgu. Gerçek SQL
sayısı yerel testte sayılır. Bu yapı mevcut ücretli Worker varsayımını korur.

Cron işleri ortak 50 saniyelik iş penceresini paylaşır: katalog okuma/yazmasına
en fazla 15 saniye ayrılır, geçmiş taraması kalan süreyi kullanır. Her iş kendi
yeni 50 saniyesini başlatamaz. Katalog okuma çağrılarına ortak iptal süresi
aktarılır; yarım aday kaydedilmez. Başlamış bir D1 işleminin timeout sonrası
sonucu belirsizse otomatik ikinci yazma yapılmadan durum satırı okunarak sonuç
uzlaştırılır. Katalog hatası, kalan süre varsa geçmiş işini atlatmaz;
finality probe ve hata raporları birbirini maskelemez.

Bu sınırlar gölge dönemde eski taramayı bir miktar yavaşlatabilir. Yeni katalog
doğrulanmadan eski tarayıcı durdurulmaz. Geçiş sonrasında onu durdurmak,
geçmiş veriyi saklamak ve bundan sonra hangi işlem kanıtlarını toplamak
ayrı bir işletim kararıdır; otomatik yan etki değildir.

## Güncellik, API ve arayüz

Yeni veri eski `watermark` veya `source_block_height` adıyla sunulmaz. Bunlar
kesintisiz olay geçmişi anlamı taşıyor; güncel durum okuması bu iddiayı vermez.
Eski `/v1` yanıtları ve tüketicileri değişmeden kalır. Önerilen yeni yollar:

- `/v2/publications`
- `/v2/publications/:id`
- `/v2/creators/:account/publications`

Yanıt; ayrı güncel-katalog şemasını, ağ/kontrat kimliğini, kesinleşmiş blok
kimliğini ve zamanını, `checked_at_ms`, `content_revision`, `items`/`publication`
ve `next_cursor` alanlarını içerir. Şema adı bu verinin `current-state`
kataloğu olduğunu açıkça belirtir. Tarihsel işlemler için eksiksizlik iddiası yoktur.

API durum satırı ve yayınları aynı tutarlı D1 okumasında alır; farklı
snapshot'lardan head ve satırları birleştirmez. Sıra
`published_at_ms DESC, publication_id DESC`; son doğrulama zamanı sıralamada
kullanılmaz. Mevcut API'nin 1–50 limit doğrulaması, Keşfet sayfa büyüklüğü ve
Profilin 5 kayıt sınırı korunur. Cursor; API/kaynak sürümü, ağ/kontrat,
içerik sürümü, sorgu kapsamı/üretici ve son yayın anahtarını taşır. Başka
kapsamın cursor'ı reddedilir. İçerik
sürümü değişmişse `409 catalog_changed` ile bütün sayfalar ilk sayfadan
yenilenir; eski/yeni veya NEAR/D1 sayfaları birleştirilmez. Eski snapshot
sürümlerini sırf sayfalama için saklayan bir arşiv eklenmez.

**Pilot güncellik politikası:** kaynak blok yaşına göre 0–90 saniye `fresh`,
90–180 saniye `stale`, 180 saniyenin üzeri `unavailable`. Bu eşikler ürün
hedefidir; ölçülmüş SLA değildir. Aynı eski final bloğun tekrar okunması
`checked_at_ms` değerini güncelleyebilir fakat katalog yaşını sıfırlayamaz.
Sunucu saatinden 5 saniyeden fazla ilerideki veya geçersiz kaynak zamanı
yeni snapshot'ı reddettirir; bu tolerans içindeki negatif yaş sıfır sayılır.

Fresh yanıt normal gösterilir. Stale yanıt son doğrulanmış listeyi açık bir
güncellik uyarısıyla gösterir. İlk snapshot yoksa veya yaş 180 saniyeyi aşmışsa
API `503 catalog_unavailable` döner; eski liste başarılı/güncel gibi gösterilmez.
Mevcut watch bağlantılarının NEAR üzerinden erişim kontrolü çalışmaya devam eder.
Yeni v2 yolda hata, sessizce eski bayat v1 kataloğa yönlendirmez.

İlk pilotta v2 yanıtları `Cache-Control: no-store` kullanır: yeni bir HTTP
önbelleği/güncellik çatışması eklenmez. Arayüzün mevcut, yüklü sayfa sayısına
bağlı `15 saniye × sayfa sayısı` yenilemesi korunur; 409'da bütün sayfalar
yenilenir. Başarısız yenilemede son liste yalnız 180 saniyelik süre
dolmamışsa uyarıyla korunur; zaman geçişi yeni başarılı cevap beklemeden
işlenir. Kapalı sekmede durur, odağa dönüşte kontrol eder. Bu, küçük pilotun
okuma maliyeti tercihidir. Yayın hacmi veya trafik arttığında v2 önbelleği
ayrıca ölçülür.

## Kapalı varsayılan ve geçiş

İki bağımsız, varsayılanı kapalı anahtar önerilir: Worker'da
`READ_MODEL_CURRENT_CATALOG_ENABLED=false`, Web'de
`NEXT_PUBLIC_ENABLE_CURRENT_CATALOG=false`. Mevcut ana ürün/okuma kapıları da
geçerli kalır; public-testnet `closed` modu yeni yazmayı ve v2 sunumunu kapatır.
Bu gate bu anahtarları eklemez veya açmaz.

1. **Yerel uygulama:** güncel main üzerinde yalnız katalog değişikliği;
   eklemeli şema, okuyucu, atomik kabul, v2 tüketicisi ve aşağıdaki testler.
   Migration numarası o günkü sıraya göre seçilir.
2. **Gölge doğrulama:** canlı işlem onayıyla önce yedek/Time Travel işareti ve
   eklemeli şema, ardından korumalı yayın. Worker yeni kataloğu üretirken Web
   eski kaynağı kullanır. Aynı bloktaki bağımsız NEAR okuması ile yeni tablo
   karşılaştırılır; eski v1'in eksik listesi doğruluk ölçütü değildir.
3. **Okuma geçişi:** kabul geçince yeni Web kaynağı korumalı yayınla seçilir.
   Keşfet, üretici listesi, exact detay ve mevcut watch erişimi kontrol edilir.
   Eski ekonomik konum ileri taşınmaz; satış/erişim kaydı üretilmez veya silinmez.
4. **Geri dönüş:** Web seçimi önceki kaynağa döndürülebilir; yeni tablolar
   korunur. Eski kaynak bayatsa geri dönüş de bayatlık taşır; bu, tam hizmet
   iyileşmesi sayılmaz ve durum kullanıcıya açıkça gösterilir. Gerekirse
   katalog kullanılamıyor durumu seçilir. Geçmişi veya veritabanını restore
   etmek normal geri dönüş yolu değildir.

Mevcut pilot saklama politikası bu tasarımla değişmez. Satış raporu,
satın-alma geçmişi ve ödeme uzlaştırması için gerekli YouTick işlem günlüğünün
kapsamı ayrıca belirlenmeden eski toplayıcı emekliye ayrılmaz. Mevcut yükleme
ve operator outbox kurtarma/arşiv akışları her durumda korunur.

## Kabul ve kanıt

| Doğrulama | Beklenen sonuç |
| --- | --- |
| Aynı final blok, 0/18/48 yayın | Tam liste ve doğru kimlikler; 0 yalnız geçerli başlangıçta. |
| 49 yayın, eksik sayfa, yinelenen kimlik, farklı blok yanıtı | Yeni aday yok; önceki sağlam katalog ve tarihi kayıtlar değişmez. |
| Eski final blok, aynı yükseklikte farklı hash/içerik, eksilen kimlik | Güncel kayıt ezilmez; anlaşılır hata ve gözlem kaydı oluşur. |
| İki eşzamanlı yenileme, batch ortasında hata, belirsiz timeout | Tek tutarlı snapshot; kaybeden yazı bütünüyle iptal; yeniden okuma ile uzlaştırma. |
| ACTIVE → SALES_SUSPENDED / TAKEDOWN ve eski ACTIVE cevabının geç gelmesi | Keşfet'ten çıkar, Profilde doğru durum; eski cevap yeniden açamaz. |
| İçerik aynı, blok yeni | Yayın satırları/sıra/revision aynı; doğrulama bilgisi ilerler. |
| Değişen katalogla ileri sayfa, yabancı üretici cursor'ı | 409 ve temiz yeniden yükleme veya geçersiz istek; tekrar/karışık sayfa yok. |
| Kaynak zamanı 90/180 saniye sınırlarını geçiyor, fetch zamanı yeni | Bayat/kullanılamaz durumu doğru; güncellik yanlış yenilenmez. |
| Katalog ve eski tarayıcı birlikte; yoğun olay örneği | Toplam D1 sorgu sayısı ≤1.000; ortak süre/pencere ve eski bütünlük korumaları geçer. |
| Her iki yeni bayrak kapalı / public-testnet closed | Mevcut davranış korunur; yeni D1 yazısı veya v2 veri sunumu yok. |
| Canlı gölge karşılaştırma | En az 10 ardışık cron sonucu aynı final bloktaki bağımsız okuma ile eşleşir; geçmiş taraması durmuş olsa da yeni katalog çalışır. |
| Canlı ürün kabulü | `lp-877b7f80-f832-4da5-ac2b-cc80bfb9a433` exact detay ve soteri.testnet listesinde doğru durum; ACTIVE ise Keşfet'te görünür. Sadece health 200 yeterli değildir. |

Önerilen canlı görünürlük hedefi, kesinleşmeden sonraki 90 saniye içinde yeni
yayın/durumun gösterilmesidir. Yeni işlem başlatmadan mevcut kayıtlarla eşitlik
ölçülebilir; yeni yayının veya kaldırmanın gecikmesini ölçmek ayrıca yetkili
gerçek bir değişiklik gerektirir. Mock sonucu canlı gecikme kanıtı sayılmaz.
Hata günlüğü sır/anahtar içermez; durum, kaynak yaşı, kayıt sayısı, süre,
RPC/D1 sorgu sayısı ve son başarılı blok yeterlidir.

Bu gate'te bağımsız salt-okunur tasarım incelemesi ve belge kontrolü **PASS**
(`LOCAL_STATIC`). `docs/testing.md` içindeki `npm run build --prefix docs`
başarılıdır (`LOCAL_TEST`); mevcut 500 kB paket boyutu uyarısı devam eder.
Başlangıçtaki sekiz değişmiş/yeni kullanıcı dosyasının içerik hash'leri aynıdır.
Yalnız bu belge eklenmiştir.

Uygulama ve hız testleri çalıştırılmadı; önerilen davranış/sınırlar **UNPROVEN**.
CI, uzak D1, sağlayıcı hız testi, yayın ve canlı ürün kabulü **EXTERNAL_NOT_RUN**.
Yukarıdaki kabul tablosu gelecekteki uygulamanın ölçütüdür; geçilmiş test listesi değildir.

## Kaynaklar ve tek sonraki gate

- Kaynak tabanı: [PR #218](https://github.com/4rmus/youtick/pull/218).
  İlgili dosyalar: `read-model/api.mjs`, `read-model/worker.mjs`,
  `scripts/bootstrap-market-read-model-d1.mjs`, `apps/web/lib/market-read-model.ts`,
  `apps/web/hooks/useAllVideos.ts`, `apps/web/app/profile/page.tsx`,
  `contracts/nft-ticket/src/lib.rs`, `scripts/cloudflare-release.mjs`.
- [NEAR sözleşme okumaları](https://docs.near.org/api/rpc/contracts#call-a-contract-function)
  belirli bloktan salt-okunur durum sorgusunu destekler.
- [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
  bir gruptaki SQL işlemlerinin atomik uygulanmasını sağlar;
  [D1 sınırları](https://developers.cloudflare.com/d1/platform/limits/)
  çağrı bütçesini ayrıca sınırlar.

**Tek sonraki gate:** `YOUTICK_CURRENT_CATALOG_IMPLEMENTATION` — bu tasarımın
kapalı varsayılanla yerel uygulaması ve kabul tablosunun yerel testleri.
Canlı şema/yayın/okuma geçişi bu tasarımın tamamlanmasıyla yetkilendirilmiş sayılmaz.

## Yerel uygulama kaydı — 29 Eylül 2026

**Gate:** `YOUTICK_CURRENT_CATALOG_IMPLEMENTATION` — **COMPLETED_WITH_WARNINGS**;
özellik kapalı, canlıya alınmadı. Çalışma alanı:
`/Users/arair/.codex/worktrees/current-catalog/youtick-lp-main`.
Başlangıç exact main `cef34ce9ace85c06d53d29987d8b3da87d73ea82`;
ana çalışma alanındaki kullanıcı değişiklikleri taşınmadı veya değiştirilmedi.

Uygulanan parçalar:

- `0008_current_catalog.sql`, `read-model/current-catalog.mjs` ve paylaşılan
  final-blok okuyucusu: iki ayrı tablo, 48 sınırı, kayıp/gerilemiş veri reddi,
  bütün batch'i durduran veritabanı karşılaştırması ve belirsiz yazma yanıtında
  tek salt-okunur uzlaştırma. Snapshot başına en çok 53 D1 ifadesi (en büyük
  değişmiş liste ve belirsiz yanıtın yeniden okunması dahil); 100 ayrımı korunur.
- `read-model/api.mjs` ve `worker.mjs`: v2 uçları, 90/180 saniye güncellik,
  scope/revision bağlı cursor, no-store, ortak cron zamanı ve 100/895/5 sorgu
  ayrımı. Ekonomik/operasyon tabloları ve v1 API değiştirilmez.
- Web güncel-katalog istemcisi ve hook'u, Keşfet ve Profil bağlantısı:
  bayatlık uyarısı, yanıt gelmese de süre sonunu işleyen zamanlayıcı, 409'da
  temiz yeniden yükleme; yeni kaynak başarısızken sessiz eski-katalog fallback'i yok.
- Yayın paketinin `catalog_mode=off|shadow|current` seçimi ve iki flag'in
  doğrulaması; varsayılan off, closed ortamda shadow/current reddi. CI dosyası
  yeni yerel testi listeye alır; bu değişiklik CI çalıştırıldığı anlamına gelmez.

### Bu gate'in doğrulama sınırı

| Yerel kontrol | Sonuç |
| --- | --- |
| Node kaynak/API/şema/CI-kural testleri | 169/169 PASS |
| Sahte sağlayıcıyla yayın aracı testleri | 92/92 PASS; gerçek yayın yok |
| Web hedefli testleri | 24/24 PASS |
| TypeScript ve değişen Web dosyalarının lint kontrolü | PASS |
| Yeni kaynak seçiliyken Web build | PASS; middleware kullanımı ve Next.js Edge uyarıları var |
| Worker dry-run paketleme | PASS; upload/deploy yapılmadı |
| Doküman build ve fark kontrolü | PASS; 500 kB paket uyarısı var |
| Ana çalışma alanının başlangıçtaki sekiz değişmiş/yeni dosyası | İçerik hash'leri aynı |


Node testleri gerçek transaction kullanan bellek içi SQLite ve sentetik RPC
ile çalışır. Web testleri istemci, React Query ve sunucu tarafı React render
kontrolleridir; gerçek tarayıcı/provider kabulü değildir. Web derlemesi yeni
flag açıkken, `.invalid` okuma adresi ve sentetik kontrat adlarıyla tamamlandı;
canlı sağlayıcıya yönlendirme yapılmadı. Worker yalnız `--dry-run` paketlendi.

Ek yerel Cloudflare/D1 denemesi **doğrulanamadı**: kilitli
`workerd 1.20260507.1`, `2026-08-10` yayın uyumluluk tarihini desteklemiyor.
Yalnız deneme için desteklediği `2026-05-14` ile tekrar bakıldığında D1 proxy
bağlantısı tamamlanmadı; bu görevin deneme süreçleri sonlandırıldı. Paket veya
canlı uyumluluk tarihi değiştirilmedi. SQLite testleri bu çalışma zamanı
kontrolünün yerine geçtiği iddiasını taşımaz.

Mevcut 48 yayın tavanı ve HTTP önbelleksiz v2 tercihi pilot sınırlarıdır.
Başlamış D1 işlemi iptal edilemediğinden 15/50 saniye bütçeleri yeni RPC/iş
başlatmayı sınırlar; bekleyen D1 işleminin zorla sonlandırılacağı veya canlıda
mutlak 50 saniyelik tamamlanma süresi garanti edilmez. Uygulama bu farkı
kaydı yeniden göndererek gizlemez.

**Çalıştırılmayanlar:** uzak şema, commit/push/PR, GitHub CI, gerçek yayın,
ödeme/yükleme, sağlayıcı hız testi ve canlı katalog kabulü. Geçmiş tarayıcıyı
kapatma veya eski verileri silme işlemi yapılmadı.

**Tek sonraki gate:** `YOUTICK_CURRENT_CATALOG_REVIEW_AND_PR` — bu yerel farkı
kaynak/sürüm uyumluluğu ve yayın hazırlığı açısından inceleyip commit ve PR
olarak hazırlamak. Yerel platform denemesinin sınırı PR'de açık tutulur;
canlı şema ve gölge yayın ayrı gerçek işlem sınırıdır.

## Kaynak incelemesi ve PR hazırlığı — 29 Eylül 2026

`YOUTICK_CURRENT_CATALOG_REVIEW_AND_PR` kapsamında kaynak tabanı yeniden
kontrol edildi: GitHub main hâlâ `cef34ce9ace85c06d53d29987d8b3da87d73ea82`.
İnceleme; aynı kesinleşmiş bloktan okuma, atomik karşılaştırma, kayıp yazma
cevabının uzlaştırılması, durum gerilemesi, 48 sınırı, 90/180 saniye güncellik,
cursor kapsamı ve kapalı yayın varsayılanlarını kapsadı. Yeni kaynak engeli
bulunmadı. Bu ana ajanın incelemesidir; bağımsız güvenlik sertifikası değildir.

Profilin yeni kaynakta eski "history" açıklamasını göstermesi düzeltildi;
varsayılan yayın seçimi YAML'da açık metin olarak yazıldı. İlgili Web ve
kaynak/yayın-kural testleri tekrar doğrulandı. Önceki gate'in çalışma zamanı
sınırı devam ediyor; PR taslak olarak hazırlanır. Preview ve public-testnet
otomatik yayın anahtarları salt-okunur kontrolde false, hiçbir ayar değiştirilmedi.

Commit ve PR yalnız bu izole çalışma alanındaki 23 katalog/arayüz/şema/test/
yayın-aracı/belge dosyasını kapsar. Ana çalışma alanı, mevcut ekonomik veriler
ve operasyon arşivleri korunur. Merge, migration ve deploy bu gate'in dışında.
**Tek sonraki gate:** `YOUTICK_CURRENT_CATALOG_PR_CHECKS` — PR'ın tam commit'i
üzerindeki CI sonuçlarını ve inceleme bulgularını doğrulamak.

## Sayfalama ve kapasite — 29 Eylül 2026

`YOUTICK_CURRENT_CATALOG_PAGINATION` kapsamında 48 tavanı yalnız current
katalog için kaldırıldı; v1 bootstrap yazıcısı ve 48 sınırı aynen kalır (tek
sayfa, `from_index: "0"`).

- `get_publications` aynı `block_id=hash` ile 48'lik sayfalarla okunur
  (kontrat sayfa başına en fazla 100 döndürür). Her yanıtta hash ve yükseklik
  blok başlığıyla eşleşmelidir; kısa, yinelenen veya başka bloktan gelen sayfa
  bütün adayı reddeder. RPC istek sınırı 2 + ⌈95/48⌉ = 4'tür.
- Tavan, 995 sorguluk bütçenin katalog payı olan 100 sorgudan türetilir: ilk
  snapshot her satırı yazar ve 5 sorgu sabittir (iki okuma, korumalı durum
  satırı, belirsiz commit sonrası iki okumalık uzlaştırma). 100 − 5 = 95.
  Önceki kontrol uzlaştırma okumalarını saymıyordu; artık sayılır.
- Bütçe bölüşümü (100 katalog / 895 geçmiş / 5 kontrol) değiştirilmedi.
  95'in üstü için bölüşümün değişmesi veya satır yazılarının birden çok
  invocation'a yayılması gerekir; bu ayrı bir karardır.
- Şemadaki `publication_count BETWEEN 0 AND 48` kısıtı `0009` ile 95'e
  çıkarılır (tablo yeniden kurulur, satır değişmeden kopyalanır). Kod
  migration'dan önce yayınlanırsa 49+ aday CHECK hatasıyla atomik olarak geri
  alınır; son katalog korunur.
- Web tarafında v2 503 için geri dönüş yoktur (`apps/web/lib/current-catalog.ts`);
  bu gate'in kapsamı dışında bırakıldı.

**Kanıt:** yalnız LOCAL_TEST (bellek içi SQLite, sahte RPC). `0009` uzak D1'e
uygulanmadı; canlı katalog durumu bu çalışmada doğrulanmadı (UNPROVEN).

## Canlı gölge ve geçiş doğrulaması — 30 Eylül 2026

**Gate:** `YOUTICK_CURRENT_CATALOG_SHADOW_PUBLIC_TESTNET` — **COMPLETED_WITH_WARNINGS**.
Bu gate'te deploy, migration, D1 yazması, bayrak değişikliği, ödeme veya yükleme
yapılmadı. Yalnız salt-okunur Cloudflare/D1/NEAR/HTTP okumaları ve bu kayıt.

### Kayda geçmemiş canlı işlemler (sonradan tespit)

Planlanan gölge ve okuma geçişi bu gate açılmadan önce korumalı workflow ile
yapılmıştı; kayıt bu bölümle tamamlanır:

| Zaman (UTC) | İşlem | Kanıt |
| --- | --- | --- |
| 29 Eyl 13:35 | D1 `0007_publications_discover_index.sql` | `d1_migrations` id 6 |
| 29 Eyl 16:59 | `deploy-public-testnet` 54797a0, `mode=acceptance`, `catalog_mode=shadow` | run 36601772823 |
| 29 Eyl 17:04 | D1 `0008_current_catalog.sql` | `d1_migrations` id 7 |
| 29 Eyl 17:28 | `deploy-public-testnet` 54797a0, `mode=acceptance`, `catalog_mode=current` | run 36605120542; Worker sürümleri a9e7b26e (read-model), 93b2bdce (Bridge), 50c4710b (Web) |

Gölge dönemi yaklaşık 30 dakika sürdü; o döneme ait bağımsız karşılaştırma
kaydı bulunmadı. Kabul aşağıdaki `current` dönemi ölçümüne dayanır.
Public-testnet `acceptance` modunda açıktır; bu, pilot politika belgelerindeki
NO-GO kaydından sonra alınmış bir owner kararıdır ve burada yeniden değerlendirilmedi.

### Kabul ölçümü

Bağımsız okuyucu: D1 `current_catalog_state.verified_block_height` alınıp aynı
blokta `get_publications_count` ve `get_publications` NEAR RPC
(`test.rpc.fastnear.com`) çağrıları yapıldı; `publication_id`, `creator_id`,
`title`, `generation`, `price_usdc`, `playback_id`, `availability` alan alan
karşılaştırıldı. Worker'ın kendi okuma kodu kullanılmadı.

| Ölçüt | Sonuç |
| --- | --- |
| 10 ardışık cron, 10 farklı final blok (270927923 → 270928885) | 18/18 eşleşme, **0 fark** |
| Güncellik (kontrol yaşı / kaynak blok gecikmesi) | 27–56 s / 2–4 s; 90 s eşiğinin altında |
| `lp-877b7f80-f832-4da5-ac2b-cc80bfb9a433` | ACTIVE, `soteri.testnet`; üreticinin 9 yayını listede |
| v1 ve v2 uçları | İkisi de 18 kayıt; `/__health` 200, Web kök 200 |
| Eski geçmiş tarayıcısı | Çalışıyor (son güncelleme saniyeler önce), final bloğun ~199 bin blok gerisinde |

Kanıt sınıfı: **PRODUCTION** (public-testnet canlı okuma) + **CI** (workflow
girdileri). Tarayıcı üzerinden Keşfet/Profil görsel kabulü, 90 saniyelik yeni
yayın görünürlük gecikmesi ve SALES_SUSPENDED/TAKEDOWN geçişi ölçülmedi
(**EXTERNAL_NOT_RUN**); yeni işlem başlatmadan ölçülemezler.

### Uyarılar

1. **D1 migration kaydı tutarsız:** `0006_scan_cursor.sql` şeması canlıda mevcut
   (`scan_height`, `scan_revision`, `finality_watermarks_scan_reset`) ama
   `d1_migrations` tablosunda yok. `wrangler d1 migrations apply` çalıştırılırsa
   `0006` tekrar denenir ve `ALTER TABLE ... ADD COLUMN` hatasıyla durur; `0009`
   ve sonrası da bu yüzden uygulanamaz. Düzeltme, şemaya dokunmadan yalnız
   `d1_migrations` kaydının eklenmesidir; ayrı D1 yazma onayı gerekir.
2. Eski tarayıcının gecikmesi yeni kataloğu etkilemez ama satış/geçmiş
   raporlarını etkiler; emekliye ayırma ayrı işletim kararıdır.
3. Kilitli `workerd` sürümünün yerel D1 denemesi hâlâ yapılmadı.

**Tek sonraki gate:** `YOUTICK_READ_MODEL_D1_MIGRATION_LEDGER_REPAIR` —
`0006` için yalnız `d1_migrations` kaydını ekleyip `migrations list` çıktısının
boş olduğunu doğrulamak; açık D1 yazma onayı gerekir.

Owner teyidi (30 Eylül): public-testnet'in `acceptance` modunda herkese açık
olması **bilinçli karardır**; 100 USD toplam bütçe pilot ön koşulu olmaktan
owner kararıyla çıkarıldı. Kodda uygulanmış dolar tavanı yoktur.

## D1 migration kaydı onarımı — 30 Eylül 2026

**Gate:** `YOUTICK_READ_MODEL_D1_MIGRATION_LEDGER_REPAIR` — **PASS**.
Açık owner onayıyla `youtick-market-read-model-public-testnet` üzerinde tek
yazma yapıldı; şema, veri, Worker ve bayraklar değişmedi.

| Adım | Sonuç |
| --- | --- |
| Önceki Time Travel bookmark | `000000d9-000000ae-000050f6-786ab67f5b4e35cafe41a547199dfd04` |
| Ön koşul | `scan_height`/`scan_revision` kolonları ve `finality_watermarks_scan_reset` mevcut; `0006` kaydı yok |
| Yazma (13:36:20 UTC) | Koşullu `INSERT INTO d1_migrations (name) SELECT '0006_scan_cursor.sql' WHERE <şema mevcut> AND NOT EXISTS <kayıt>`; `changes=1` |
| Sonrası | `wrangler d1 migrations list --remote`: **No migrations to apply**; kayıt id 8 |
| Servis | Katalog 31 s önce yenilendi (18 yayın), geçmiş tarayıcı ilerliyor, `/__health` 200 |

`id` sırası uygulama sırasını değil kayıt sırasını gösterir; wrangler adla
karşılaştırır. Kanıt: **PRODUCTION**.
