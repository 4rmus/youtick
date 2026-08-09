# Testnet ve internal pilot runbook

Durum: `EVIDENCE_PACKET_READY / RUNTIME_CLOSED / PROVIDER_RESOURCES_NOT_CREATED`

Bu paket yalnız NEAR testnet ve sınırlı internal pilot içindir. Mainnet,
genel kullanıcı trafiği ve otomatik iade kapsam dışıdır. Teknik pilot açıkça
non-refundable'dır; başarısız provider işlemi yeni bir ücret veya otomatik
iade üretmez.

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
