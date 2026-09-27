# NEAR Auth V1 — gecikmiş ödeme uzlaştırması ön kontrolü

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_PREFLIGHT`.
26 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Ödeme kaybolmuyor; uygulama geçmiş ödeme sonucunu bugünkü cihaz durumuna
bağladığı için kilidi kaldıramıyor.** Bilet ve yüklemede bu sorun izole
teşhislerde yeniden üretildi. En küçük düzeltme, kalıcı ödeme/hak kanıtını
koruyup değişebilen cihaz ve yükleme anahtarını ödeme tamamlanma koşulundan
çıkarmak. İzleme yetkisi ve yeni işlem onayı ayrı kontroller olarak kalmalı.

Bu gate yalnız bu rapor ve ana planı değiştirir. Repo kaynakları, canlı
MPC kayıtları, tarayıcı/anahtarlar, runtime/config ve index korunur. Aday
kaynak sadece geçici kopyada sınandı; repo düzeltmesi veya canlı kabul yok.
Skill'ler: `youtick-near-auth`, `youtick-payment-flow`, `youtick-contract-review`.

## Kaynakta doğrulanan nedenler

| Bulgu | Yer | Somut sonuç |
| --- | --- | --- |
| Bilet bugünkü cihaza bağlı | `workers/livepeer-bridge/src/mpc-sponsor.ts:422–442` | Doğru FINAL işlem, tam kullanılan USDC, Market satın alma olayı ve hak olsa da süresi dolan/silinen/değişen cihaz `ticket_not_settled` üretir; `TICKET_SUBMITTED` kalır. |
| Yükleme bugünkü cihaza bağlı | Aynı dosya `325–335` | Doğru final ücretli iş ve quote hash olsa da eski cihaz yoksa veya yeniden yetkilendirmeyle `authorizing_public_key` değişmişse `upload_not_settled`; `MPC_VERIFIED` kalır. |
| Değişebilir upload key ödeme koşulu | Aynı dosya `300–324`; Market `lib.rs:814–850` | Creator'ın izinli `replace_upload_key` işlemi key/expiry alanlarını değiştirir. İşin ücret ve quote kimliği aynı olsa da eski request karşılaştırması uzlaştırmayı reddeder. |
| Bilet bugünkü hesap anahtarına da bağlı | `mpc-sponsor.ts:422–423` | İşlemin imzalandığı eski public key bugün silinmişse, tarihsel başarılı ödeme Bridge katmanında tamamlanamaz. Web'in güncel kimlik/yetki kontrolü bundan ayrı kalmalıdır. |

`mpcStatus` yalnız bekleyen durumlarda tekrar uzlaştırır (`244–246`). Zaten
`TICKET_SETTLED` / `UPLOAD_SETTLED` olan kayıt, cihaz daha sonra kaybolunca
geri alınmaz. Dolayısıyla sorun ödeme sonrası ilk başarılı uzlaştırmayı
kaçırmış kayıtlardadır; tüm eski ödemeler bozulmuş değildir.

Hesap başına kilit `mpc:user:*` ve `isMpcSettled` ile korunur (`191`). Web
`prepareProductDevice` önce aynı status'u okur (`near-auth-mpc-sponsor.ts:97`);
status hata verirse cihaz hazırlığı başlayamaz. Mevcut güvenli davranış
ikinci ödeme göndermemektir; kilit veya tarayıcı taslağı silmek çözüm değildir.

## Kalıcı kanıt ve değişebilir erişim

Market kaynak incelemesi:

- `ft_on_transfer` yalnız configured USDC predecessor'ını kabul eder
  (`lib.rs:1193`). Bilette tutar/yayın/önceki hak kontrolünden sonra hak
  kaydı yazılır, cihaz yetkilendirilir ve `entitlement_purchased` olayı
  çıkar (`1310–1366`). Tamamlanma için FT dönüşü ile Market olayı birlikte
  önemlidir; genel RPC başarısı tek başına tahsilat demek değildir.
- `has_entitlement` bilet geçmişini veya creator hakkını döndürür (`1696`);
  takedown bilet geçmişini silmez. Bugünkü oynatma ayrıca yayın/freeze ve
  cihaz kontrollerinden geçer.
- USDC ücretli iş yalnız token yolundan oluşturulur; creator/job/başlık,
  fiyat, kaynak boyutu, profil, fee asset/amount ve quote hash kalıcıdır
  (`706–744`, `1212–1302`). İncelenen sürümde status Authorized → Published
  olur; bu ekonomik geçmişi değiştirmez.
- `replace_upload_key` yalnız creator tarafından ve henüz Authorized işte
  yapılabilir; key ve expiry değişir, ikinci ücret alınmaz (`814–850`).
  Quote doğrulaması orijinal request hash'ini ve imzasını bağlar
  (`2076–2171`); saklanan `fee_quote_hash` bu ilk request'in kanıtıdır.
- Playback `verifyMarketDeviceProof` hâlâ güncel cihaz, sertifika, süre,
  delegate gerekliyse imza ve geçerli hesap anahtarı ister
  (`workers/livepeer-bridge/src/index.ts:6266–6301`). Ödeme tamamlandı diye
  bu kontroller atlanmamalı; takedown/freeze de korunmalı.

[NEAR işlem RPC belgesi](https://docs.near.org/api/rpc/transactions), `tx`
ile mevcut hash'in salt-okunur sorgulanmasını ve `FINAL` seviyesinde iade
receipts dahil kesinleşmeyi açıklar. [NEP-141](https://github.com/near/NEPs/blob/master/neps/nep-0141.md)
transfer-call sonundaki iade/kullanılmayan token ayrımını tanımlar. Bu nedenle
refund, yanlış tutar veya eksik Market olayı başarılı bilet sayılmamalı.

## Önerilen en küçük kaynak değişikliği

1. **Bilet:** mevcut exact hash, signer/receiver/public key, nonce, tek action,
   method/gas/deposit/args, FINAL/receipts, kullanılan tutar, Market olayı
   ve bütçe kontrollerini koru. Güncel `has_entitlement` true kontrolünü
   doğrudan final view ile yap; sadece blok seçmek için eski access key'in
   bugün hâlâ var olmasını şart koşma. Güncel cihaz sorgusu ödeme sonucunu
   engellemesin. Eksik hak ve RPC hatası hâlâ kilidi korusun.
2. **Yükleme:** doğrulanmış delegate/payload/account/purpose ve final Market
   job kanıtını koru. Karşılaştırılacak değişmeyen alanları açıkça seç:
   creator/job/title/price/source bytes/profile/generation/status,
   USDC fee amount/usd micro ve orijinal quote hash. Sonradan değişebilir
   `upload_public_key` / `upload_key_expires_at_ms` ile bugünkü cihaz kaydı
   ilk ücretin tamamlanma koşulu olmasın. İş yoksa imza yeterli değildir:
   aynı pending kayıt kalır, status relay göndermez.
3. **Durum/istemci:** mevcut `TICKET_SETTLED` / `UPLOAD_SETTLED` anlamını ve
   atomik kayıt güncellemesini kullan. Sayaç/nonce/user pointer silme veya
   yeni state machine yok. `continueUploadPayment` settled kayıtta zaten
   relay'e gitmeden döner; bilet continuation yalnız MPC_VERIFIED durumunda
   execute eder. Device hazırlığı ödeme settled olduktan sonra ayrı ve
   açık kullanıcı eylemiyle başlayabilir.

Yüklemede `UPLOAD_SETTLED`, mevcut tasarımda aynı quote'a bağlı ücretli
Market işinin varlığını kanıtlar; o belirli relay denemesinin yeni bir
USDC tahsilatı yaptığını tek başına iddia etmez. Replay iade davranışı
korunmalı; sadece mevcut job bulundu diye yanlış creator/quote/fee eşleşmesi
kabul edilmemeli. Yeni cihaz yetkisi veya medyanın kullanılabilirliği de
bu durumdan çıkarılmaz.

Geçmiş cihaz bloğunu sorgulama alternatifi bu dar ödeme düzeltmesi için
önerilmiyor. Kalıcı ekonomik kanıt zaten mevcut; tarihsel cihaz state'i
ayrıca arşiv erişimi gerektirebilir. [NEAR contract RPC belgesi](https://docs.near.org/api/rpc/contracts)
eski bloklarda `GarbageCollectedBlock` ve archival node ihtiyacını belirtir.
Biletin gerekli tarihsel transaction receipt'i bulunamıyorsa yine başarı
uydurulmaz, aynı kayıt korunur; yeni ödeme/yeniden imza yapılmaz.

Web ürün `identity`/session/origin ve mevcut FullAccess hesap sahipliği
kontrolleri gevşetilmez. Silinmiş hesap anahtarı nedeniyle artık giriş
yapılamaması ayrı hesap kurtarma konusudur. Eski lab
`verifyGoogleTransaction` ayrıca kısa ömürlü review gerektirir; bu gate'in
önerisi lab oturum/review süresini uzatmaz veya lab recovery açmaz.

## İzole kanıt

Repo modüllerini kullanan geçici test kopyası, sentetik key'ler, bellek içi
DO ve mock RPC ile çalıştırıldı. Gerçek RPC/send yapılmadı.

- **14 mevcut-davranış teşhisi PASS:** cihaz expiry/missing/sertifika ve
  authorizer değişimleri; eski ticket key'inin silinmesi; iki upload key
  alanı; settled fast path; refund/eksik olay/receipt failure/eksik hak;
  yanlış creator/fee/quote; henüz oluşmamış iş.
- **Aynı 14 kontrol geçici adayda PASS:** olumlu gecikme senaryoları artık
  terminal duruma geçiyor; olumsuz ekonomik kanıtlar hâlâ kilitli. Mock
  broadcast sayısı status sırasında artmıyor. Her koşuda 75 başka test
  isim filtresiyle atlandı. Bunlar adayın tam regresyon veya canlı kabulü
  değildir; aday repo dosyasına uygulanmadı.
- **Mevcut repo:** MPC + playback-v2 paketlerinde **122 PASS / 3 SKIPPED**.
  Mevcut isteğe bağlı yük/abuse testleri açılmadı; playback reddi korunuyor.
- **Kontrat:** izinli upload key replacement, takedown sırasında hak
  geçmişi ve cihaz yenileme/eviction için üç mevcut Rust testi **PASS**.
  Her koşuda diğer 40 test filtrelendi.
- Manifest/lock/kurulu sürümler: near-api-js Web/Bridge **7.3.0**, Auth0 SPA
  **2.26.0**, Bridge borsh **2.0.0**; değişmedi.
- Canlı actor dosyasının sabit kopyası read-only/immutable açıldı: integrity
  **ok**, önceki kabul sonrası **11 MPC kaydı aynı**, aktif kilit yok.
  Runtime/config metadata hash'leri aynı. Güncel chain, tarayıcı, provider
  oturumu veya gerçek geçmiş ödeme bu tur yeniden çalıştırılmadı.

Kanıt sınıfları: **LOCAL_STATIC / LOCAL_TEST**. Kaynak uygulaması, tam aday
regresyonu, CI, hosted/provider ve canlı gecikmiş kabul **UNPROVEN**.

## Sonraki gate

**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_SOURCE`
— başlatılmadı.** İzinli kapsam: `workers/livepeer-bridge/src/mpc-sponsor.ts`,
ilgili MPC testleri; gerekirse mevcut Web tüketici testleri ve plan/rapor.
Yeni ABI, DTO, kontrat, migration, provider veya bağımlılık gerekmiyor.

Kaynak kabulü: expiry/eviction/yeniden yetkilendirme ve upload key değişimi
eski ödemeyi bloke etmemeli; yanlış/refund/eksik kanıt kilidi korumalı;
status hiçbir gönderim üretmemeli; eksik/expired cihazla playback hâlâ
reddedilmeli ve cihaz eylemi ayrıca onay istemeli. Aynı ödeme kaydını
uzlaştırmak yeni bir para hareketi değildir. Canlı kayıtlar sentetik pending
durumuna geri çevrilmez; deneme için ödeme tekrarlanmaz.

Bu ön kontrol tamamlandı; giderilecek kaynak bulguları var.
Yalnız bu rapor ve ana plan değişti; doküman build, iki dosyalık kapsam,
index ve canlı actor/config korunma kontrolü **PASS**. Mevcut doküman
500 kB bundle uyarısı sürer.
Kanıt dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-late-reconciliation-ghkvzajh/`.
