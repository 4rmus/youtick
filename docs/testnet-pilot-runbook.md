# Testnet ve internal pilot runbook

Durum: `PUBLIC_BETA_PLAN_READY / RUNTIME_CLOSED / NO_MUTATION_AUTHORIZED`

Bu satır belgedeki tarihsel internal-pilot paketini ve belgenin sonundaki ayrı
public-beta hedef planını birlikte sınıflandırır. Çalışan runtime hâlâ kapalıdır;
bu belge commit, deploy, config, provider, cüzdan, ödeme veya testnet mutasyonu
yetkisi vermez.

Aşağıdaki mevcut paket yalnız NEAR testnet ve sınırlı internal pilot içindir.
Bu pakette Mainnet, genel kullanıcı trafiği ve otomatik iade kapsam dışıdır.
Teknik pilot açıkça non-refundable'dır; başarısız provider işlemi yeni bir ücret
veya otomatik iade üretmez. Bu tarihsel kapsam sınırı, aşağıda ayrıca tanımlanan
ve henüz uygulanmamış herkese açık testnet beta planını geçersiz kılmaz.

## Sabit hedefler

| Alan | Pilot değeri |
|---|---|
| Market | `lp-arch-market-v2-260809.youtick-dev-v3.testnet` |
| Access | `lp-arch-access-v2-260809.youtick-dev-v3.testnet` |
| Admin | `lp-arch-admin-260809.youtick-dev-v3.testnet` |
| Guardian | `lp-arch-guardian-260809.youtick-dev-v3.testnet` |
| İlk creator | `lp-arch-creator-260809.youtick-dev-v3.testnet` |
| Playback | 8 saat device certificate, 180 saniye JWT, yalnız oturumluk tarayıcı anahtarı |
| Upload | global concurrency 2, creator başına günde 2 deneme, 15 dakika ambiguity |
| Bütçe | ayda 20,000,000 micro-USD, iş başına 2,000,000 micro-USD rezervasyon |
| Lease | 30 dakika TTL, 5 dakika heartbeat |
| Queue | batch 10, timeout 5 saniye, 3 retry, concurrency 1, retention 4 gün, DLQ |
| Read model | D1, testnet Neardata, başlangıç 263118001, 1 dakikalık cron, çalıştırma başına en çok 180 blok |
| Veri hedefi | chain-backed RPO 0, ölçülmüş RTO 4 saat, pilot sonu + 90 gün retention |
| Kaynak saklama | YouTick platform yedeği tutmaz; creator kaynak dosyayı saklar; provider kaybında satış/playback durur ve yeniden yükleme veya takedown gerekir |
| Kabul eşikleri | shadow mismatch 0; upload resume en az %99; ikinci ödeme 0; ikinci provider asset 0 |
| DO sınırı | object başına en çok 256 persistent kayıt; archive kanıtı olmadan silme yok |

Queue producer/consumer binding'i `LIVEPEER_EVENTS`, DLQ adı
`youtick-livepeer-events-dlq-testnet` olmalıdır. Birincil Queue, D1 ve Worker
provider kimlikleri deployment paketinde tekil olarak kaydedilir; rastgele veya
mainnet ile ortak kaynak kullanılmaz.

## Başlamadan önce durma koşulları

Aşağıdakilerden biri eksikse aktivasyon yapılmaz:

- temiz ve incelenmiş tek commit SHA'sı, exact-SHA CI ve o SHA'dan üretilmiş
  Market/Access/Web/Worker artifact hash'leri;
- current Market artifact'inin `publication_finalized` olayında `title`,
  `playback_id` ve `published_at_ms` alanlarını içerdiğinin testi;
- Workers Paid plan kanıtı;
- isim verilmiş Platform/SRE on-call sahibi ve teslim edildiği kanıtlanan alarm;
- ayrı D1, Queue ve DLQ kimlikleri ile read-only provider config çıktısı;
- tüm Web/Worker runtime bayraklarının kapalı olduğunu gösteren config snapshot;
- admin ve guardian kimliklerinin farklı, `new_purchases_paused=true` olduğunu
  gösteren final testnet read ve guardian pause event receipt'i.

Hiçbir private key, API token, TUS URL'si veya authorization değeri kanıt
paketine yazılmaz.

## Incident ilk müdahale

Bu tablo rol sahipliğini ve ilk güvenli adımı tanımlar; isim verilmiş gerçek
nöbetçi, bildirim teslimatı veya tamamlanmış tatbikat kanıtı değildir. İlk adım
kendiliğinden dış sistem mutasyonu yetkisi vermez. Config, contract veya
provider değişikliği gerekiyorsa ayrı işlem onayı alınır; otomatik iade açılmaz.

| Alarm | Birincil rol | İlk güvenli adım |
|---|---|---|
| Bridge config uyuşmazlığı | Platform/SRE | `hold_activation_and_compare_exact_sha`: aktivasyonu durdur; exact SHA, contract ID, code hash ve kapalı bayrakları karşılaştır. |
| Provider public playback exposure | Security | `close_playback_issuance_and_suspend_affected_sales`: `LIVEPEER_PLAYBACK_ISSUANCE_ENABLED=false` yap; onaylı operator yoluyla yalnız etkilenen yayınların satışını askıya al ve takedown kanıtını hazırla. Provider silme yapma. |
| Takedown sonrası token denemesi | Security | `keep_playback_closed_and_verify_takedown`: issuance'ı kapalı tut; final zincir durumunu, cache invalidation'ı ve bounded alarm kaydını doğrula. |
| Queue backlog | Platform/SRE | `close_new_uploads_and_inspect_dlq`: `LIVEPEER_NEW_UPLOADS_ENABLED=false` yap; `webhook_queue_delivery_completed.queueLagMs`, gerçek Queue depth, retry ve DLQ durumunu salt okunur incele. Kayıtlı intent, heartbeat ve TUS recovery yolunu açık tut. |
| Operator nonce stuck | Platform/SRE | `stop_replay_and_reconcile_chain`: broadcast'ı tekrar etme; transaction, finality ve nonce durumunu zincirden uzlaştır. |
| Admission budget eşiği | Platform/SRE | `verify_admission_auto_closed`: admission'ın `AUTO_CLOSED` olduğunu ve yeni rezervasyon kabul etmediğini doğrula; mevcut recovery'yi bozma. |
| Contract storage reserve eşiği | Contract operations | `hold_release_and_read_storage_reserve`: release/aktivasyonu durdur; `get_storage_reserve_status` sonucunu ve withdrawal invariantını salt okunur doğrula. |
| RPC finality lag | Platform/SRE | `hold_chain_mutations_and_verify_finality`: zincir mutasyonlarını kapalı tut; fallback'i yalnız read için kullan ve finality'yi bağımsız kaynaktan doğrula. |
| Elevated playback error | Platform/SRE | `close_playback_issuance_and_preserve_upload_recovery`: `LIVEPEER_PLAYBACK_ISSUANCE_ENABLED=false` yap; exact version ve hata oranını doğrula, upload recovery ve canonical entitlement okumalarını değiştirme. |

İki domain kontrolü kaynakta ve guarded release paketinde varsayılan kapalıdır.
`LIVEPEER_NEW_UPLOADS_ENABLED=false` yeni Job kaydı/intent'i reddeder; mevcut
Job kaydı, heartbeat ve TUS recovery yolunu kapatmaz.
`LIVEPEER_PLAYBACK_ISSUANCE_ENABLED=false` hem legacy v1 hem device-certificate
v2 token route'unu kapatır; v2 ayrıca kendi version gate'ini gerektirir. Bu
yerel kaynak kanıtıdır. İsim verilmiş on-call, çalışan bildirim rotası, deployed
config ve tatbikat kayıtları gelmeden incident süreci runtime-ready sayılmaz.

## Domain kill-switch matrisi

Bu matris kaynak durumudur; deployed config veya çalıştırılmış rollback kanıtı
değildir.

| Domain | Kontrol | Kaynak durumu |
|---|---|---|
| Playback issuance | `LIVEPEER_PLAYBACK_ISSUANCE_ENABLED=false` | v1 ve v2 token route'ları kapalı; entitlement read değişmez. |
| New purchases | guardian `pause_new_purchases`; admin `unpause_new_purchases` | Global yeni ticket alımı iade edilerek durur; mevcut entitlement/playback ve creator upload açık kalır. İki geçiş governance event'i üretir. |
| New uploads | `LIVEPEER_NEW_UPLOADS_ENABLED=false` | Yeni Job/intent kapalı; kayıtlı intent, heartbeat ve TUS recovery açık. |
| Provider mutation | `LIVEPEER_PROVIDER_MUTATIONS_ENABLED=false` | Yeni provider create kapalı; kayıtlı TUS recovery ve provider read/reconcile açık. |
| Multi-asset quote | `MULTI_ASSET_PAYMENTS_MODE=off` | Yeni quote kapalı; mevcut status recovery açık. |
| Contract operator | `LIVEPEER_OPERATOR_MUTATIONS_ENABLED=false` | Yeni Worker sign/broadcast kapalı; final read/reconcile açık. Guardian `freeze_bridge` ayrıca on-chain finalize/suspend yetkisini durdurur. |

Provider exposure olayında önce playback issuance kapatılır; geniş etkide
guardian `pause_new_purchases` uygular. Gerekli onaylı sales suspension/takedown
tamamlandıktan sonra operator mutation kapatılır veya guardian freeze uygulanır.
Yeniden satış açma yalnız admin `unpause_new_purchases` işlemi ve on-chain event
kanıtıyla yapılır.

## Aktivasyon sırası

1. Exact SHA, artifact hash'leri, mevcut testnet code hash'leri, contract
   durumu, Worker version'ları ve kapalı bayraklar salt okunur olarak kaydedilir.
2. Yalnız reviewed Market artifact'i mevcut testnet Market code hash'inden
   farklıysa testnet code update yapılır. State migration çağrılmaz. Sonrasında
   ayrı ve açıkça onaylanmış contract işlemiyle guardian
   `pause_new_purchases` çağırır; receipt ve `new_purchases_paused=true` view
   kanıtı alınmadan sonraki adıma geçilmez. Version, admin, guardian, bridge,
   freeze ve boş publication durumu tekrar okunur. Uyuşmazlıkta contract
   guardian tarafından dondurulur.
3. Ayrı testnet D1 oluşturulur; `0001_initial.sql`,
   `0002_contiguous_watermark.sql`, `0003_upload_job_archives.sql` ve
   `0004_operator_outbox_archives.sql` sırasıyla uygulanır. Worker önce API,
   ingestion, UploadJob archive ve operator outbox archive kapalı, cron bağlı
   değilken deploy edilir.
4. Queue ve DLQ ayrı kaynaklar olarak oluşturulur; binding ve exact tüketici
   ayarları salt okunur çıktı ile doğrulanır. Webhook Queue bayrağı kapalı kalır.
5. Read-model logları için bir alarm rotası bağlanır. Kontrollü bir config
   hatası `youtick.read-model-ingestion.v1` / `failed` kaydı üretmeli, çağrıyı
   başarısız saymalı ve on-call sahibine ulaşmalıdır.
6. Bir dakikalık cron ve `READ_MODEL_INGESTION_ENABLED=true` yalnız testnet
   Worker'da açılır. API ve Web derived-read bayrakları kapalı kalır. Cursor
   263118001'den kesintisiz ilerlemeli; gap, hash conflict veya blok başına
   16'dan fazla Market event'inde durmalı ve cursor'u ilerletmemelidir.
7. Sıfırdan tip'e rebuild süresi ölçülür. Dört saati aşarsa veya backlog artarsa
   ingestion kapatılır; pilot trafik başlamaz.
8. D1 API yalnız exact HTTPS Web origin ile açılır. Canonical NEAR ile
   publication listesi ve creator toplamları karşılaştırılır; ödeme, bakiye,
   entitlement ve playback yetkisi D1'den okunmaz.
9. `NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL=true` yalnız internal Web hedefinde
   açılır. İlk D1 hata durumunda Discover canonical NEAR'a dönmeli; sayfalama
   sırasında iki cursor kaynağı karışmamalıdır.
10. Queue consumer ve DLQ redelivery testi gerçek Queue üzerinde geçmeden
    `LIVEPEER_WEBHOOK_QUEUE_ENABLED` açılmaz. Ücretli upload yalnız ilk creator
    allowlist'i, bütçe ve concurrency değerleri exact config ile doğrulandıktan
    sonra sınırlı canary olarak açılır.

Her adım ayrı kanıt sınıfı ile kaydedilir: `LOCAL_TEST`, `CI`, `TESTNET`,
`PROVIDER`, `DEPLOY` ve `RUNTIME`. Bir sınıf diğerinin yerine geçmez.

## Legacy Access issuance kapatma sırası

Bu sıra ancak deployed v2 shadow mismatch oranı 0, rollback paketi hazır ve
exact Access contract/code hash doğrulanmışsa ayrı contract-mutation onayıyla
uygulanır:

1. Owner, `SetGrantIssuance { enabled: false }` timelock teklifini oluşturur.
2. 24 saat dolmadan teklif execute edilmez; bu sırada verilmiş legacy grant'ler
   en çok 10 dakika geçerlidir.
3. Owner teklifi execute eder ve final view'da
   `grant_issuance_enabled=false` kanıtlanır.
4. Yeni grant denemesi reddedilir; mevcut grant doğrulaması expiry/revoke'a
   kadar değişmez. En geç 10 dakika sonra yeni aktif legacy grant kalamaz.
5. Bilinen subject kayıtları 16'lık bounded sayfalarla revoke/cleanup edilir;
   rollback gerekirse issuance'ı yeniden açmak ayrı 24 saatlik teklif ve onay
   gerektirir.

Bu bölüm kaynak/test sırasıdır; mevcut testnet Access state'ini değiştirme veya
legacy route'u silme yetkisi değildir.

## Ayrı işlem onayı sınırları

Kabul edilen mimari değerler dış sistem mutasyonu izni değildir. Aşağıdaki her
satır exact ortam, kaynak adı ve işlem listesiyle ayrı onay gerektirir:

| Paket | Mutasyon | Başlangıçta kapalı kalan kapılar |
|---|---|---|
| D1 temel | Testnet D1 oluşturma, `0001`–`0004` migration uygulama, Worker binding ekleme | ingestion, API, Web derived read, iki archive gate |
| Queue temel | Testnet Queue ve DLQ oluşturma, consumer/binding/policy ekleme | webhook Queue |
| Dark deploy | Exact-SHA read-model ve Bridge version yükleme; trafik vermeme | bütün ürün/mutation kapıları |
| Read canary | Cron + ingestion, sonra API ve internal Web'i sırayla açma | upload, playback issuance, provider mutation |
| Queue canary | Gerçek redelivery/retry/DLQ testi, sonra webhook Queue açma | ücretli upload/provider canary |
| Upload canary | Tek allowlist creator, tek küçük dosya ve tek ücretli provider asset | genel kullanıcı ve mainnet |

Bir paketin onayı diğer satırı kapsamaz. Belirsiz veya receipt'i kayıp D1,
Queue, deploy, provider-create ya da ödeme işlemi otomatik tekrarlanmaz.

## Kanıt paketi biçimi

Her çalıştırma tek klasörde aşağıdaki secret içermeyen kayıtları üretmelidir:

| Kayıt | Zorunlu içerik |
|---|---|
| `scope.json` | evidence sınıfı, testnet ortamı, onay referansı, actor, UTC zaman, exact commit SHA |
| `artifacts.json` | Market/Access/Web/Bridge/read-model SHA-256 ve oluşturma komutu |
| `before.json` | contract kimlikleri/rolleri/code hash, Worker version, D1/Queue/DLQ kimlikleri, bütün gate değerleri |
| `receipts.json` | yalnız gerçekleşen işlem kimlikleri; atlanmış işlem `UNPROVEN`, başarısız işlem hata koduyla |
| `verification.json` | D1 watermark/sample projection, Queue retry/DLQ/drain, health ve browser smoke sonuçları |
| `rollback.json` | geri alınan exact version/flag, guardian freeze gerekiyorsa tx/event ve son kapalı-gate smoke |

Dosya hash'leri paket kökünde `SHA256SUMS` ile bağlanır. Private key, secret,
authorization header, provider token, TUS URL, signed transaction veya ham
medya içeren paket reddedilir. Eksik sınıf başka sınıfın sonucu ile doldurulmaz.

## Pilot kabul kanıtı

- exact commit/artifact/Worker version ve testnet transaction kimlikleri;
- Market admin/guardian ayrılığı ile freeze/unfreeze/yetki event'leri;
- kesintisiz D1 watermark, zincir ile eşleşen örnek projection ve ölçülmüş
  sıfırdan rebuild süresi;
- alarm teslimi, Queue retry sayısı, DLQ mesajı ve başarılı drain kaydı;
- Web hydration/console smoke, D1 ilk-istek fallback'i ve canonical ödeme,
  entitlement ve playback kontrolleri;
- bir küçük upload için tek ücret, tek provider asset, tek publication ve
  entitlement/playback sonucu;
- bütün ölçülmüş legacy/v2 shadow kararlarında `decisionMatch=true`; tek
  mismatch pilot kapısını başarısız yapar;
- aynı TUS kaynağıyla upload resume başarı oranı en az %99; kanıt paketindeki
  ikinci ödeme ve ikinci provider asset sayaçları tam olarak 0;
- her Durable Object sınıfında kalıcı kayıt sayısı en çok 256; sınıra ulaşma
  veri silmek yerine ilgili yeni mutasyonu fail-closed kapatır;
- rollback sonrası yeni upload, purchase, playback issuance ve provider
  mutation kabul edilmediğinin smoke kanıtı.

## Geri alma ve temizleme

Sorunda önce ilgili domain bayrağı kapatılır: derived read, ingestion, webhook
Queue, `LIVEPEER_NEW_UPLOADS_ENABLED` ve `LIVEPEER_PLAYBACK_ISSUANCE_ENABLED`
birbirinden bağımsızdır. Mevcut upload recovery açık tutulur; ikinci ödeme veya
otomatik iade açılmaz. Web ve Worker
exact version'a dönebilir. Contract state geri sarılmaz; guardian freeze,
reviewed forward-fix ve admin unfreeze kullanılır ve bütün değişiklikler event
üretir.

D1 ve DLQ olay incelemesi bitmeden silinmez. Terminal UploadJob ancak D1 archive
commit'i kanıtlandıktan, 14 günlük süre dolduktan ve v1 playback o kaydı artık
okumadıktan sonra silinebilir. Webhook dedup 30 gün, operator audit 90 gün
tutulur. Confirmed operator outbox ancak D1 archive commit'i, 90 günlük sürenin
dolduğu ve aktif audit hold olmadığı ayrı ayrı kanıtlandıktan sonra silinebilir.
Pilot sonundan 90 gün sonra aktif audit hold yoksa D1 için ayrı, reviewed cleanup
işlemi uygulanır.

Multisig ve timelock bu testnet/internal pilotta yoktur. Mainnet için 2-of-3
multisig ve unfreeze/yetki genişletme/rotation üzerinde 24 saat timelock
zorunludur; guardian pause/freeze anlık ve yalnız yetki azaltıcı kalır. Mainnet
fresh contract ID ile, bağımsız denetimli snapshot/import ve invariant
doğrulamasından sonra açılabilir. Bunların implementation, custody, denetim,
tatbikat ve governance onayı tamamlanmadan genel açılış yapılamaz.

---

## Herkese Açık Testnet Beta Planı

Durum: `PLAN_READY / IMPLEMENTATION_NOT_STARTED / RUNTIME_CLOSED`

Bu bölüm, yukarıdaki internal-pilot geçmişini değiştirmez. Hedef;
`preview.youtick.net` üzerinde Mainnet ve Production'a dokunmadan, herkese açık
fakat arama motorlarına kapalı, tek seferlik ve 14 günlük bir testnet beta
çalıştırmaktır.

### Sabit kararlar

| Alan | Public beta kararı |
|---|---|
| Erişim | Desteklenen Meteor `.testnet` hesabı olan herkes upload, satın alma ve playback yapabilir. |
| Adres | Yalnız `preview.youtick.net`; yeni domain veya ikinci deploy hattı yok. |
| Süre | Tek seferlik 14 gün; ilk 13 gün yeni upload, son 24 saat drain/cleanup. Uzatma ve restart yok. |
| Upload | Dosya başına en çok `1,000,000,000` decimal byte; creator başına UTC günde 1 yeni job. |
| Toplam sınır | Beta boyunca en çok 10 yeni job. Bu bir Sybil koruması değil, maliyet ve storage hasarı tavanıdır. |
| Job süresi | Upload başlangıcından publication sonucuna kadar mutlak 24 saat; heartbeat bu süreyi uzatamaz. |
| Ödeme | Mevcut sponsor quote + `SignedDelegate`; kullanıcı tek onayla upload ücreti + `0.10` test USDC öder, relayer testnet gas'ini karşılar. |
| Token edinimi | Kullanıcı exact Circle testnet USDC ve test NEAR'ı kendisi getirir; YouTick faucet kurmaz. |
| Yayın | Provider doğrulaması geçince otomatik publication. |
| Takedown | Şikâyetle kapatılan veya 24 saatte yayınlanmayan exact Livepeer asset doğrulanıp silinir. |
| Storage | Açılışta Market runway en az 100,000 byte; state büyüten işlem sonrasında en az 25,000 byte acil alan korunur. |
| Sahiplik | Operasyon, abuse bildirimi ve acil kapatma sahibi `@4rmus`; `abuse@youtick.net` teslimatı açılıştan önce kanıtlanır. |

### Mimari sınırlar

- NEAR job, ödeme, publication, entitlement ve settlement otoritesidir.
- Livepeer medya ingest, işleme, depolama ve HLS katmanıdır.
- Bridge admission, provider kontrolü, sponsor relay ve playback authorization
  katmanıdır; video byte'ları Bridge üzerinden geçmez.
- D1 yardımcı read modeldir. Public beta Discover akışı kanonik NEAR fallback'ini
  kullanır; continuous ingestion ve full rebuild açılmaz.
- Queue bu en çok 10 job'lık beta için eklenmez. Mevcut imzalı doğrudan webhook
  ve bounded reconcile yolu kullanılır; bu istisna Faz 3'ü tamamlanmış saymaz.

### Market tarafından zorlanan public-beta sınırı

Web veya Bridge tek başına güvenlik sınırı değildir. Kullanıcı Market'e doğrudan
işlem gönderebildiği için 14 günlük pencere, kota ve storage koruması Market
tarafından da uygulanmalıdır.

Mevcut `Contract`, `MediaJob` ve `Publication` Borsh layout'ları değişmez;
migration yapılmaz. Mevcut raw purchase-pause örneği kullanılarak sürümlü raw
kayıtlar eklenir:

- beta başlangıcı, upload kapanışı, bitiş, erken kapanış ve toplam job sayısı;
- creator + UTC gün için tek job marker'ı;
- job için creator, request hash, sponsor quote ID, admission zamanı ve mutlak
  deadline marker'ı.

Yeni contract API'si:

- `start_public_testnet_beta()`: yalnız admin, yalnız testnet, Market pause
  durumundayken, beta daha önce başlamamışken ve runway en az 100,000 byte iken
  sabit 13+1 günlük pencereyi açar;
- `close_public_testnet_beta()`: yalnız guardian; beta state'ini kapatır ve yeni
  alımları atomik pause eder;
- `get_public_testnet_beta_state()`;
- `get_public_testnet_beta_job(job_id)`;
- `has_public_testnet_beta_job_today(creator_id)`.

Yeni USDC upload job yalnız şu koşullarda kabul edilir:

- beta ve upload admission penceresi aktif;
- mevcut `SponsoredUploadQuote`, imzası ve tam request hash'i geçerli;
- creator, job, title, price, profile, source byte ve upload key quote ile aynı;
- source en çok 1 GB, creator'ın o UTC gününde job'ı yok ve toplam job sayısı
  10'dan küçük;
- upload key deadline en çok 24 saat ve beta bitişini aşmıyor;
- atomik yazımdan sonra Market runway en az 25,000 byte.

Quote'suz, sahte, stale, yanlış creator/job'a ait veya sınırı aşan transfer tam
iade edilir. Exact mevcut-job replay'i ikinci sayaç veya ücret üretmez. Public
beta sırasında native NEAR upload kapalıdır. Bilet satın alma hem beta aktifliği
hem `new_purchases_paused=false` ister; beta bittikten sonra yeni transfer tam
iade edilir.

Job, ilk entitlement ve publication yazımlarından sonra 25,000 byte acil alan
korunur. Takedown ve guardian close bu alandan yararlanabilir. Beta başlangıcı
ve kapanışı sırasıyla `public_testnet_beta_started` ve
`public_testnet_beta_closed` NEP-297 olaylarını üretir; mevcut event
allowlist/reducer kaynakları bu olayları tanır fakat D1 ingestion açılmaz.

### Tek imzalı upload ve operator akışı

1. Web mevcut sponsor quote endpoint'inden tam isteğe bağlı quote alır.
2. Meteor kullanıcıdan tek `SignedDelegate` onayı ister.
3. Mevcut relayer admission slotunu ayırır ve işlemi yayınlar.
4. Market quote, beta, günlük/global kota, 1 GB ve storage kurallarını atomik
   doğrular; mevcut `MediaJob.fee_quote_hash` sponsor quote ID'yi taşır.
5. Bridge finality'den public-beta job marker'ını ve quote ID'yi doğrulamadan
   provider asset oluşturmaz.
6. İmzalı webhook ve reconcile provider doğrulaması sonrası publication'ı
   otomatik finalize eder.

Public operator yalnız zincirde geçerli public-beta marker'ı bulunan generation-1
job'ları finalize veya suspend edebilir. Eski/işaretsiz `Authorized` job genel
operator yetkisi kazanmaz. Mevcut exact-job sponsor recovery modu ayrı kalır ve
public-beta modu ile aynı anda açılamaz.

Admission lease 30 dakikalık dilimlerle yenilenebilir, fakat hiçbir heartbeat
job'ın mutlak 24 saatlik deadline'ını aşamaz. Deadline sonrası yeni intent,
heartbeat, provider create veya finalize reddedilir ve slot bırakılır.

### Provider silme sınırı

Mevcut Livepeer adapter'ına yalnız exact asset delete eklenir. Silme yalnız:

- zincirde publication `TAKEDOWN` olduğunda; veya
- job 24 saatte yayınlanmadan sona erdiğinde ve zincirde publication olmadığında

çalışır. Job ID, generation, project, asset adı, creator binding ve zincirdeki
asset hash'i eşleşmeden silme yapılmaz. Tek `DELETE` sonrasında `204` veya
bağımsız `404` başarıdır. Belirsiz sonuç otomatik tekrarlanmaz; yeni admission
kapanır ve salt-okunur uzlaştırma gerekir. Normal beta kapanışında başarılı
publication asset'leri silinmez ve JWT korumalı kalır.

### Release paketi

Yeni üst seviye beta flag'i eklenmez. Public beta, mevcut üç Preview değişkeninin
birlikte açık olduğu exact pakettir:

- `PREVIEW_MULTI_CREATOR_UPLOAD_CANARY_ENABLED=true`;
- `PREVIEW_PLAYBACK_V2_CANARY_ENABLED=true`;
- `PREVIEW_SPONSORED_UPLOAD_CANARY_ENABLED=true`.

Canary'de creator allowlist exact iki hesaptır. Public açılışta allowlist exact
`*` sentinel'idir; boş değer kapalı kalır. `*` yalnız testnet combined packet'te
kabul edilir. Public pakette upload, provider create, sponsor relay, bounded
operator ve playback-v2 açıktır. Queue, archive, derived read, multi-asset,
native NEAR fee ve shadow kapalıdır. `LIVEPEER_OPERATOR_JOB_ID` boş kalır.
Production bütün bu kombinasyonu ve `*` sentinel'ini reddeder.

Release metadata, Cloudflare validator ve smoke aynı policy matrisini birlikte
uygular. Deploy sonrasında `DEPLOY_PREVIEW_ENABLED=false` geri yüklenir; başarılı
workflow tek başına runtime veya ürün UAT kanıtı sayılmaz.

### Public kullanıcı yüzeyi

- Site genelinde Testnet Beta, test tokenlarının gerçek değeri olmadığı, kalan
  süre, 1 GB, günlük 1 job, toplam 10 job, `0.10` test USDC sponsor ücreti ve
  24 saatlik deadline ödeme öncesi gösterilir.
- Meteor `SignedDelegate` sunmuyorsa normal USDC fallback'e geçilmez; cüzdan
  açılmadan anlaşılır hata verilir.
- Mevcut `readPaymentPreflight` ve `registerUsdcAccount` işlevleri exact Circle
  USDC registration için yeniden kullanılır; faucet yazılmaz.
- Terms; otomatik yayın, non-refundable test tokenı, içerik hakkı, expiry,
  takedown ve provider delete politikasını açıklar.
- Preview sayfaları `noindex` olur; URL'yi bilen herkes erişebilir.

### Edge rate limit

Yeni paket veya özel limiter yazılmaz; Cloudflare native Rate Limiting binding
kullanılır:

- Web read RPC: IP ve varsa account başına 60/dakika;
- Web broadcast RPC: IP başına 10/dakika;
- Bridge sponsor quote/relay, upload intent ve playback: route + IP/account
  başına 30/dakika.

Public pakette binding eksikliği fail-closed `503`, limit aşımı dış NEAR/Livepeer
çağrısından önce `429` döndürür. Bu sayaçlar yaklaşık abuse korumasıdır; beta
kotasının veya gerçek provider faturasının otoritesi değildir. Mevcut
`20,000,000 / 2,000,000 micro-USD` admission değerleri pratikte en çok 10
admitted job sınırıdır; 20 USD kesin fatura garantisi değildir.

### Gate sırası

Her gate tek başına çalışır, tamamlanınca raporlanır ve durulur. Bir gate diğer
gate'in Git, deploy, provider veya testnet yetkisini vermez.

1. `PUBLIC_TESTNET_BETA_SOURCE`
   - Yalnız Market contract/testleri, paid-media protokol/vectorleri, ilgili Web
     upload/payment UX ve testleri, Bridge admission/operator/provider ve testleri,
     Preview workflow/release araçları, ilgili event scriptleri ve bu runbook
     değişebilir.
   - Access contract, Production promotion, mainnet config, yeni D1/Queue kaynağı,
     lockfile, yeni paket ve servis yasaktır.
   - Contract raw state, sponsor-quote zorunluluğu, kota/storage, absolute TTL,
     exact provider delete ve combined release packet yerel olarak uygulanıp
     doğrulanır. Commit/deploy/dış işlem yapılmaz.
2. `PUBLIC_TESTNET_BETA_INTEGRATION`
   - Yalnız source gate diff'i temiz current-main snapshot'ında explicit-path
     commit/PR'a alınır; exact-head CI, squash merge ve exact-main CI ayrı onay
     ister. Runtime kapalı kalır.
3. `PUBLIC_TESTNET_BETA_PREFLIGHT`
   - Exact Market artifact/state hash, işaretsiz `Authorized` job yokluğu,
     admin/guardian/takedown/operator/relayer yetkileri ve bakiyeleri, provider
     token/webhook/JWT/delete desteği, rate-limit binding, fresh-wallet Circle
     USDC edinimi ve `abuse@youtick.net` teslimatı salt-okunur doğrulanır.
4. `PUBLIC_TESTNET_MARKET_CAPACITY`
   - Ayrı testnet-transfer onayıyla yalnız gereken NEAR aktarılır ve runway en az
     100,000 byte yapılır. Başka mutasyon yapılmaz.
5. `PUBLIC_TESTNET_MARKET_CODE_UPDATE`
   - Mevcut korumalı workflow exact-main artifact ile tek `DeployContract` yapar.
     Init, migration, key, funding, Access veya Cloudflare değişikliği yoktur;
     code hash eşleşir ve serialized state/pause değişmez. Belirsiz sonuç retry
     edilmez.
6. `PUBLIC_TESTNET_CLOSED_PREVIEW`
   - Aynı exact SHA bütün ürün kapıları kapalıyken Preview'a deploy edilir;
     version, kapalı endpoint'ler, beta-not-started ve rollback sürümü kanıtlanır.
7. `PUBLIC_TESTNET_BETA_CANARY`
   - Admin beta penceresini Market pause durumunda başlatır. Combined paket exact
     iki creator ile deploy edilir. Ayrı onayla unpause sonrası iki creator
     eşzamanlı tek-imzalı küçük upload yapar; tam iki payment/job/asset/publication
     beklenir. Aynı creator'ın ikinci günlük job'ı ve 1 GB + 1 byte reddedilir.
     Buyer purchase/playback ve stranger denial geçer. İkinci canary publication
     takedown edilir, yeni token durur, exact Livepeer asset silinip `404`
     kanıtlanır. Guardian yeniden pause eder.
8. `PUBLIC_TESTNET_PUBLIC_OPEN`
   - Market pause durumundayken aynı SHA `*` sentinel'iyle protected deploy edilir.
     Config/health/beta state eşleşince ayrı onayla unpause edilir. Allowlist'te
     hiç bulunmamış fresh creator tam upload→publication, fresh buyer ise kendi
     test tokenlarıyla purchase→playback akışını geçirir. Kanıt geçerse beta açık
     bırakılır.
9. `PUBLIC_TESTNET_14_DAY_CLOSE`
   - Beta'nın 13. gününde yeni upload admission otomatik kapanır. Son 24 saat
     drain içindir. Beta'nın 14. gününde contract yeni job/bileti iade eder ve
     Bridge yeni playback tokenı vermez. En geç 210 saniye sonra mevcut
     token/cache erişimi sona erer. Guardian close, kapalı Preview redeploy ve
     tüm public/canary flag'lerinin false olduğu health kanıtı alınır.

### Public beta kabul kriterleri

Sonuç yalnız aşağıdakilerin tamamında `PASS_PUBLIC_TESTNET_BETA` olur:

- exact-main CI, release artifact ve çalışan Web/Bridge version eşleşmesi;
- quote'suz, sahte, stale ve yanlış creator/job doğrudan contract çağrılarının
  tam iadesi;
- 1 GB, günlük 1, toplam 10, 13+1 gün, 24 saat ve 25,000-byte negatif testleri;
- eski/işaretsiz job'ın genel operator tarafından finalize edilememesi;
- heartbeat'in mutlak deadline'ı uzatamaması;
- provider delete'in yalnız exact takedown/expired asset üzerinde çalışması ve
  belirsiz sonucu tekrar etmemesi;
- default-off ve Production-reject release testleri;
- iki-creator canary, public fresh creator, tek buyer purchase/playback, stranger
  denial ve takedown→provider `404` kanıtı;
- Testnet Beta uyarısı, Terms, `noindex`, çalışan abuse bildirimi ve isim verilmiş
  `@4rmus` sahibi;
- Beta'nın 13. günündeki upload kapanışı ve 14. günündeki tam runtime reclose
  kanıtı.

Yerel test, CI, testnet, provider, Preview ve Production sonuçları ayrı evidence
sınıflarıyla raporlanır. Local/mock sonuç canlı provider veya deployment kanıtı
sayılmaz.

### Kapsam dışı

- Mainnet ve Production;
- yeni wallet entegrasyonu;
- native NEAR creator fee ve multi-asset/1Click;
- sponsor dışı yeni admission protokolü;
- continuous D1 ingestion, full rebuild/RTO ve Queue aktivasyonu;
- 20 GB provider testi, ABR, tam load/soak/chaos programı;
- otomatik refund, yeni kimlik/KYC/CAPTCHA sistemi ve beta uzatma.
