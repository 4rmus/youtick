# Livepeer paid-media PR-6 karar kapıları

Durum: `APPROVED / LOCAL_DISABLED_COMPLETE / TESTNET_UPLOAD_FINALIZE_BUY_PARTIAL /
RUNTIME_DISABLED` as updated on 2026-08-03.

Bu kayıt, [uygulama planındaki](near-livepeer-paid-media-implementation-plan.md)
PR-6 ön koşullarını karar verilebilir hâle getirir. Bir canlı ortam izni, anahtar
yetkisi, para harcama limiti veya testnet çalışma talimatı değildir. Buradaki
"öneri" alanları 2026-08-02 tarihli kullanıcı onayıyla D1-D5 için kabul
edilmiştir. Bu onay D6 yetkisi değildir.

2026-08-03 eki: 20 GB aylık rezervasyon olarak değil, yalnız dosya başına sınır
olarak tutulur. D5'in aylık koruması ayrı bir dolar bazlı operasyon bütçesidir.
Üretim değeri D6'ya kadar boş kalır ve Worker bu durumda provider çağrısından
önce fail-closed davranır.

## Kod öncesi kaynakla doğrulanan başlangıç durumu

| Konu | Doğrulanan durum | Sonuç |
|---|---|---|
| Reconciler | Worker'da cron, `scheduled`, Durable Object alarmı, iş indeksi ve drift kaydı yok. Her iş yalnız adlandırılmış kendi Durable Object'inde duruyor. | Mevcut kodun periyodu veya tüm işleri keşfetme yetkisi yok. |
| Outbox | Şema `finalize_livepeer_publication` ve `suspend_livepeer_sales` kabul ediyor; çalışan işlem yürütücüsü yalnız finalize yapıyor. | Satış askıya alma henüz çalışır bir operasyon değildir. |
| Satış askıya alma | Sözleşme yeni alımları durduruyor; playback yolu mevcut entitlement için `SALES_SUSPENDED` durumunda JWT üretmeye devam ediyor. | Bu, ekonomik sınırlamadır; açık HLS/JWT erişimini durdurmaz. |
| Takedown | `TAKEDOWN` enumu var, fakat yayınlanmış paid-media kaydını bu duruma geçiren metod yok. İlk publication artık yalnız `ACTIVE` olarak finalize edilebilir. | Takedown yetkisi veya çağrısı tahmin edilmemeli; finalization ile başlangıçta `SALES_SUSPENDED`/`TAKEDOWN` seçilemez. |
| Rotasyon | API token, webhook secret, JWT anahtarı ve NEAR anahtarı tek aktif değer olarak tanımlı; bridge hesabı başlangıçta sabit. | Overlap, eski işlerin kapanışı ve yönetişim kararı eksik. |
| Kabul/bütçe | Creator allowlist, aktif iş/create sayacı ve yerel bütçe kapaması yok. | Aktivasyondan önce provider çağrısından önce çalışan fail-closed koruma gerekli. |

İlgili kaynaklar: `workers/livepeer-bridge/src/index.ts`,
`workers/livepeer-bridge/wrangler.toml` ve
`contracts/nft-ticket/src/lib.rs`. Depodaki
`contracts/nft-ticket/res/youtick_nft_opt.wasm` güncel Livepeer publication
metodlarını export etmediği için güncel deploy kanıtı veya takedown çözümü olarak
kullanılamaz.

## Karar kaydı

| Kimlik | Karar gerekli | Güvenli başlangıç önerisi | Kararda açık yazılması gerekenler | Durum |
|---|---|---|---|---|
| D1 | Reconciler sahipliği ve periyodu | İlk dilimde her bilinen iş kendi Durable Object alarmıyla tekrar kontrol edilir. Global indeks ikinci dilim olur. | Periyot, backoff, en uzun bekleme, alarm hatası davranışı, kayıt saklama süresi ve sorumlu kişi | `APPROVED / LOCAL_DISABLED_IMPLEMENTED` |
| D2 | Drift davranış matrisi | Alarm yalnız provider ve NEAR durumunu tekrar okur. Doğrulanmış asset kaybında otomatik öneri yalnız yeni satışları askıya almaktır; provider silme ve takedown yapmaz. | Asset kaybı, policy uyumsuzluğu, public HLS, metadata uyumsuzluğu, NEAR/Livepeer kesintisi için ayrı davranış ve kanıt eşiği | `APPROVED / LOCAL_DISABLED_IMPLEMENTED` |
| D3 | Takedown yetkisi ve sözleşme geçişi | Bridge anahtarına yeni takedown yetkisi eklenmez. Ayrı governance/multisig hesabı, tek yönlü `ACTIVE|SALES_SUSPENDED → TAKEDOWN` geçişi ve reason/incident/evidence kaydı kullanılır. | Yetkili hesaplar, normal/acil yol, timelock, geri dönüş politikası, denetim kaydı ve mevcut JWT'nin azami geçerliliği | `APPROVED / LOCAL_CONTRACT_IMPLEMENTED / MULTISIG_AND_TIMELOCK_UNPROVEN` |
| D4 | Anahtar rotasyonu | Her anahtar türü için eski+yeni overlap uygulanır; eski operator outbox'ı terminal duruma gelmeden eski anahtar silinmez. | API token, webhook, JWT ve NEAR için overlap/retention/rollback süreleri; sıra; silme kanıtı; yetkili kişi | `APPROVED / LOCAL_OVERLAP_AND_RUNBOOK_IMPLEMENTED / LIVE_REHEARSAL_PENDING` |
| D5 | Creator kabulü ve maliyet sınırı | Tek sabit adlı kabul Durable Object'i allowlist, reservation, global/creator-başına sayaç ve `AUTO_CLOSED` durumunu tutar. Boş/geçersiz allowlist fail-closed olur; `CREATE_AMBIGUOUS` slotu kanıtlı temizlik olmadan bırakılmaz. | İlk creator'lar, listeyi değiştiren yetkili, aktif sayılan durumlar, pencere, global ve creator kotası, ölçü birimi, eşik, yeniden açma yetkisi | `APPROVED / LOCAL_DISABLED_IMPLEMENTED / ACTIVATION_IDENTITIES_PENDING` |
| D6 | Testnet E2E | Kararlar ve disabled yerel testler tamamlanmadan testnet çalıştırılmaz. | Deploy SHA'sı, hesaplar, key/funding/USDC limiti, Livepeer/NEAR mutation kapsamı, tek gerçek akış ve temizleme sorumlusu | `SEPARATE_EXPLICIT_APPROVAL_REQUIRED` |

## Onaylanabilir varsayılan paket v1

Aşağıdaki D1-D5 değerleri 2026-08-02 tarihinde onaylanmıştır. Sorumlu rol
`paid-media operator` olarak adlandırılır; gerçek kişi, creator allowlist hesabı
ve governance hesap kimlikleri aktivasyon öncesinde ayrıca kaydedilir.

### D1 - Reconciler

- Her `ONCHAIN_PUBLISHED` iş kendi `LivepeerControl` Durable Object alarmını
  kullanır; global iş indeksi bu dilime girmez.
- Sağlıklı durumda periyot 15 dakikadır. Hata yakalanıp redakte sonuç
  saklandıktan sonra yeniden deneme 1, 2, 4, 8 ve en çok 15 dakika sonra
  planlanır; başarılı okumada sayaç sıfırlanır. Alarm hiçbir zaman hatadan
  dolayı kalıcı olarak bırakılmaz.
- Yalnız son sağlıklı gözlem, son drift, ardışık hata sayısı ve
  `nextReconcileAt` saklanır. Aktif yayın boyunca tutulur; terminal durumdan
  30 gün sonra operasyon özeti silinebilir, incident kanıtı 90 gün tutulur.
- Alarm at-least-once çalışmaya uygun ve idempotent olur; Cloudflare'ın sınırlı
  otomatik tekrarına güvenip gelecekteki alarmı kaybetmez.

### D2 - Drift davranışı

| Gözlem | Yerel erişim | Zincir işlemi | Yeniden deneme/kurtarma |
|---|---|---|---|
| Asset `404/deleted`, kimlik/proje/token/playback uyuşmazlığı, JWT policy kaybı veya oynatılabilir anonim çıktı | İlk güçlü kanıtta `DRIFT_BLOCKED`; yeni JWT yok | İki kanıt veya en az 60 saniye aralıklı iki aynı gözlemden sonra idempotent `suspend_livepeer_sales` | 1-2-4-8-15 dakika; otomatik provider silme/takedown yok |
| Provider timeout, `429` veya `5xx` | `PROVIDER_UNKNOWN`; yeni JWT yok | Kesinti tek başına satış askısı üretmez | D1 backoff; sağlıklı okumada sayaç sıfırlanır |
| NEAR final read/RPC hatası | `NEAR_UNKNOWN`; yeni JWT yok | Yeni transaction yok | D1 backoff; aynı final-block kuralları korunur |
| `asset.updated/failed/deleted` webhook'u | Yalnız reconcile tetikler | Tek başına mutation yok | Provider yeniden okunur |
| Drift sonrası sağlıklı durum | En az 60 saniye aralıklı iki tam sağlıklı gözlemden sonra yerel blok kalkabilir | Satış otomatik açılmaz; `SALES_SUSPENDED` zincirde kalır | Manuel satış-açma kararı ayrı dilimdir |

### D3 - Takedown

- Bridge FunctionCall anahtarına takedown metodu eklenmez. Yetki ayrı bir
  governance hesabında 2/3 multisig olur; normal yol 24 saat timelock kullanır.
  Acil yol yalnız doğrulanmış public medya, hukuki zorunluluk veya anahtar
  ihlalinde yine 2/3 onayla timelock'u atlayabilir.
- Sözleşme yalnız `ACTIVE|SALES_SUSPENDED -> TAKEDOWN` tek yönlü geçişini
  kabul eder. Girdi sabit `reason_code`, `incident_id`, `evidence_sha256` ve
  `effective_at_ms` taşır; ham provider kimliği veya sır taşımaz.
- Takedown entitlement ve satın alma geçmişini silmez, yeni JWT'yi durdurur ve
  otomatik refund üretmez. Daha önce verilen JWT için üst sınır mevcut 300
  saniye TTL + 60 saniye saat payı, yani 6 dakikadır.

### D4 - Rotasyon

| Anahtar/sır | Varsayılan overlap ve silme kapısı |
|---|---|
| Livepeer API token | Yeni token ile okuma doğrulanır; token adı her işe yazılmadan rotasyon başlamaz. Eski adla pre-publication iş kalmayıp 24 saat rollback penceresi dolmadan eski token silinmez. |
| Webhook secret | Worker eski+yeni secret'ı 24 saat kabul eder; provider webhook update doğrulanır ve eski imzalı son teslimden 24 saat geçmeden eski secret kaldırılmaz. |
| Paid-media operator token | Yeni token current, eski token previous olarak 24 saat birlikte kabul edilir; yeni token ile evidence-bound reopen testi geçmeden eski token kaldırılmaz. Gerçek operator kimliği ayrı deployment değişkenidir. |
| Livepeer JWT signing key | Yeni key provider envanterinde ve gerçek doğru-JWT probunda doğrulanır. Eski key en az 15 dakika tutulur; bu süre 5 dakikalık JWT üst sınırını kapsar. |
| NEAR operator key | Aynı receiver ve exact method allowlist'li yeni FunctionCall key eklenir. Eski key'in tüm outbox kayıtları `CONFIRMED` olmadan epoch değiştirilmez; 24 saat rollback sonrası zincirden silinir. |

Her adım redakte envanter, rollback ve silme kanıtı üretir. Livepeer en çok 10
signing key verdiği için rotasyon yeni key oluşturma ile başlar, eski key silme
ile değil.

### D5 - Creator kabulü ve bütçe

- Allowlist varsayılan olarak boştur ve fail-closed'dur. İlk kapalı testnet
  diliminde yalnız ayrıca yazılacak tek creator hesabı bulunur.
- Aynı anda global 1 ve creator başına 1 aktif iş kabul edilir. `CREATE_PENDING`,
  `CREATE_AMBIGUOUS`, `UPLOAD_READY`, `READY_VERIFIED` ve `FINALIZE_QUEUED`
  aktif sayılır; `CREATE_AMBIGUOUS` kanıtlı provider sonucu/temizlik olmadan slot
  bırakmaz.
- UTC gün başına global ve creator başına en çok 2 provider create denemesi
  uygulanır. UTC aylık dolar bütçesi ile iş başına ayrılan tahmini provider
  maliyeti provider çağrısından önce atomik rezerve edilir. Her iki değer D6'da
  yazılana kadar kabul kapalıdır. Bu yerel eşik provider hard-cap değildir.
- Bütçe aşımı, provider `402/429`, envanter uyuşmazlığı veya 15 dakikayı aşan
  `CREATE_AMBIGUOUS` kabul durumunu `AUTO_CLOSED` yapar. Yalnız paid-media
  operator redakte çözüm kanıtıyla yeniden açabilir.
- Yerel reopen yolu `LIVEPEER_PAID_MEDIA_OPERATOR_ID` ile sabitlenen rolü ve
  yalnız Worker secret olarak tutulan en az 32 karakterli operator token'ını
  birlikte ister. İstek exact network/contract, kapanış kodu/zamanı,
  idempotency key, `incident_id`, `evidence_sha256` ve sabit resolution code ile
  bağlanır. Ambiguous rezervasyon yalnız provider yokluğu veya tamamlanmış TUS
  termination kanıtı beyanıyla bırakılır; sayaçlar ve bütçe geçmişi sıfırlanmaz.

Bu onay yalnız disabled yerel PR-6a/6b kodunu kapsar; testnet, deploy, key
oluşturma/silme, funding, USDC, Livepeer/NEAR mutation veya runtime aktivasyon
yetkisi vermez.

Kaydedilen onay cümlesi:

> D1-D5 için PR-6 varsayılan paket v1'i onaylıyorum; kapsam yalnız disabled
> yerel kod ve testtir.

## Önemli sınır

`SALES_SUSPENDED`, mevcut alıcının oynatmasını bilinçli olarak açık bırakır.
Bu nedenle doğrulanmış public HLS/JWT erişimi "satış askıya alındı" diye
çözülmüş sayılmaz. O olayda yeni JWT üretimini durduran gerçek `TAKEDOWN`
geçişi ve daha önce verilmiş kısa ömürlü JWT'lerin ne kadar süre yaşayabileceği
ürün politikasında birlikte karara bağlanmalıdır.

## Kararlardan sonra en küçük uygulama sırası

1. D1 ve D2 onayından sonra, disabled PR-6a'da iş başına alarm ile
   `nextReconcileAt`, deneme, son provider/NEAR gözlemi ve redakte drift sonucu
   saklanır. Alarm yeni provider silme, yeni takedown veya kör yeniden imza
   üretmez.
2. D5 onayından sonra, provider `request-upload` çağrısından önce atomik
   allowlist/kota/bütçe reservation'ı eklenir. Limitte yeni intent reddedilir;
   mevcut upload ve playback etkilenmez.
3. D2 onayından sonra, yalnız sabit payload ve sıfır deposit ile satış askıya
   alma yürütücüsü eklenir; timeout sonrası aynı işlem hash'i sorgulanır ve son
   zincir durumu doğrulanır.
4. D3 onayından sonra, ayrı sözleşme/yönetişim dilimi ve takedown testleri
   eklenir. Bu dilim bridge FunctionCall allowlist'ini genişletmez.
5. D4 onayından sonra rotasyon/runbook tatbikatı, D6'da ayrıca yetki verilen
   testnet E2E yapılır.

## Zorunlu kabul kanıtı

- Allowlist dışı istek ile kota aşımı Livepeer'e hiç ulaşmaz.
- `CREATE_AMBIGUOUS` için sayacın serbest bırakılması provider sonucu veya
  kanıtlı temizlik olmadan gerçekleşmez.
- Alarm, kaybolan/uyumsuz varlığı redakte kanıtla kaydeder; kesintide yeni
  yetki fail-closed olur.
- Satış askıya alma aynı idempotency kaydıyla gönderilir, timeout'ta aynı işlem
  hash'i sorgulanır ve `SALES_SUSPENDED` zincirden tekrar okunur.
- Takedown eklendiğinde yetkisiz çağrı reddedilir; geçiş tek yönlüdür,
  entitlement geçmişi korunur ve yeni JWT verilmez.
- Her anahtar türünde overlap, rollback, eski outbox'ın terminal kapanışı ve
  eski anahtarın silindiğine dair redakte kanıt vardır.
- Testnette deploy edilen Worker, web ve sözleşme artefakt SHA'ları kayıtlı
  onaylı SHA ile eşleşir. Bu kanıt canlı aktivasyon kanıtı değildir.

## Yerel uygulama kanıtı

- `LivepeerControl` iş alarmı; provider/NEAR unknown, drift, iki gözlemli satış
  askısı ve iki sağlıklı gözlemli kurtarma kaydını uygular.
- Sabit adlı admission nesnesi boş allowlist, aktif iş, günlük create ve aylık
  operasyon bütçesi rezervasyonunu provider çağrısından önce uygular; 402/429 ve 15 dakikalık
  `CREATE_AMBIGUOUS` durumunda `AUTO_CLOSED` olur.
- Sözleşme migration'ı ayrı `takedown_authority_id` ekler;
  `takedown_livepeer_publication` bridge hesabına verilmez ve entitlement
  kayıtlarını silmez.
- Webhook ve paid-media operator secret overlap'i kodla test edilir; API token
  adı işte zorunludur. JWT ve NEAR overlap/silme kapıları README runbook'unda
  kayıtlıdır.
- `AUTO_CLOSED` reopen işlemi operator authentication, stale-closure reddi,
  redakte evidence hash, kontrollü ambiguous release ve idempotent replay ile
  yerel test edilir; runtime flag kapalıyken dışarıdan ulaşılamaz.

### Tamamlama denetimi

| Kapsam | Sonuç | Kanıt | Açık kalan |
|---|---|---|---|
| D1 alarm ve backoff | `DONE_LOCAL` | 15 dakika sağlıklı periyot; 1/2/4/8/15 dakika backoff; disabled flag altında dış çağrı yok | Deploy/alarm gözlemi yok |
| D2 drift ve satış askısı | `DONE_LOCAL` | Unknown/strong drift ayrımı, iki gözlem, idempotent outbox, iki sağlıklı gözlemli recovery testleri | Gerçek provider/NEAR kesinti tatbikatı yok |
| D3 takedown | `PARTIAL` | Ayrı authority alanı, migration, tek yönlü geçiş ve entitlement koruma testleri | Gerçek 2/3 multisig hesabı, 24 saat timelock ve acil yol kanıtı yok |
| D4 rotasyon | `PARTIAL` | API token adı işte; webhook ve operator token eski+yeni overlap desteği; exact NEAR allowlist ve runbook | API/webhook/operator/JWT/NEAR canlı overlap, rollback ve eski anahtar silme kanıtı yok |
| D5 admission | `DONE_LOCAL / RUNTIME_FAIL_CLOSED` | Provider öncesi allowlist/kota/dolar bütçesi; 402/429, envanter drift'i ve 15 dakika ambiguity auto-close; operator-authenticated, evidence-bound, idempotent reopen | Bounded test kimlikleri kaydedildi; runtime creator/operator kimlikleri ile aylık/iş başı bütçe değerleri hâlâ gerekli |
| PR-3/PR-5 provider kapıları | `PASS_BOUNDED / RUNTIME_DISABLED` | Gerçek 80 MiB 32+32+16 upload; Chrome/Edge doğru/refresh JWT ve beş negatif senaryo; provider envanteri temiz | 20 GB, provider kullanım faturası ve final recovery TUS URL postcondition kanıtı yok |
| D6 testnet E2E | `PARTIAL / UPLOAD_FINALIZE_BUY_PASS` | Test creator/buyer, exact fee, provider-ready finalize, 2.000001 USDC purchase, entitlement ve satış askısı | Exact-SHA deploy, runtime grant, withdrawal ve rotasyon/outage tatbikatı |
| PR-7 cutover | `MISSING_NOT_AUTHORIZED` | Yok | 72 saat kapalı canary ve ayrı aktivasyon onayı |

### Kalan D6 için ayrıca onaylanması gereken yürütme paketi

Kalan D6 deploy/runtime çalışması ancak aşağıdaki değerler tek bir sınırlı
onayda doldurulduktan sonra devam eder:

1. PR-6'nın temiz branch/commit SHA'sı ve CI sonucu.
2. Fresh testnet market/access contract ID'leri; bridge, creator, buyer,
   withdrawal receiver ve 2/3 governance hesapları.
3. NEAR key başına exact receiver/method listesi, allowance ve en fazla funding.
4. Livepeer Sandbox project/token/webhook/JWT key kapsamı; en fazla asset, source
   byte ve signing-key mutasyonu ile zorunlu cleanup sahibi.
5. Aylık operasyon bütçesi ile iş başı provider maliyet rezervasyonu; bu
   değerler boşken admission kapalı kalır.
6. USDC purchase ve withdrawal için en yüksek tutar; otomatik refund yapılmaması.
7. Chrome ve Edge'de doğru JWT, refresh, anonim/malformed denial ve completed
   TUS termination kanıtlarının aynı bounded akışta mı ayrı canary'de mi
   kapanacağı.
8. Deploy hedefi, rollback sahibi, evidence dizini ve çalışma sonunda asset,
   signing key, TUS capability, NEAR key ve bakiye envanteri.

Bu alanlardan biri boşsa D6 başlamaz. Özellikle mevcut dirty worktree veya
yerel PASS bir deploy SHA'sı değildir.

D6'nın kalan kısmı için ayrı, sınırlı testnet izni gerekir. `LIVEPEER_BRIDGE_ENABLED=false`
kalır; public playback, deploy, provider/NEAR mutasyonu veya anahtar işlemi
açılmaz.

Kaynaklar:

- [Cloudflare Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [Cloudflare Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Livepeer signing key sınırı](https://docs.livepeer.org/api-reference/signing-key/create)
- [Livepeer webhook secret update](https://docs.livepeer.org/v2/solutions/livepeer-studio/docs/api-reference/webhooks/update)
- [NEAR FunctionCall access keys](https://docs.near.org/protocol/accounts-contracts/access-keys)
