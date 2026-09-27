# NEAR Auth V1 — geçmiş bloktaki cihaz state'i ön kontrolü

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_PREFLIGHT`.
26 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**İşlem sonucunu arşivden okumak tek başına yeterli değil.** Cihaz
uzlaştırması ayrıca aynı işlem bloğundaki hak ve cihaz kayıtlarını ister.
Bugünkü örnek primary'den okunabiliyor; eski blok için primary
`UNKNOWN_BLOCK`, arşiv ise doğru kayıtları döndürüyor. Bu iki view için
kaynakta henüz arşiv yedeği yok.

Yalnız rapor ve ana plan değişir. Kaynak, runtime/config, index ve canlı
actor korunur. Yeni cihaz, imza/ödeme, kayıtları pending'e geri alma,
servis restart veya deploy yok. NEAR Auth ve near-api-js yönergeleri izlendi.

## Mevcut kaynak sınırı

`workers/livepeer-bridge/src/mpc-sponsor.ts:490` içindeki `reconcileDevice`:

1. İç işlemi `readFinalTransaction` ile FINAL okur; bu adımın arşiv yedeği var.
2. Hash/hesap/Market/public key/nonce/tek action/args/gas/deposit ve bütün
   receipt başarılarını doğrular.
3. Başarılı Market receipt'inin `block_hash` değerini seçer.
4. `has_entitlement` ve `get_playback_device` okumalarını tam bu bloğa
   sabitler; ancak `view` yardımcı fonksiyonu normal `rpc` kullanır.
   Normal `rpc` sadece primary'ye gider.
5. Cihaz/key/sertifika/authorizer/30 gün ve hak doğruysa DEVICE_SETTLED yazar.

Geçmiş state okunamazsa sorgu hata verir; DEVICE_SUBMITTED ve ekonomik
kilit korunur. Arşivli transaction okumasının başarılı olması bu eksiği
kapatmaz. Bugünkü cihazı okumak doğru çözüm değildir: cihaz sonradan
süresi dolmuş, değiştirilmiş veya listeden çıkarılmış olabilir.

## Taze public testnet okuma kanıtı

Okuma başlangıcı **2026-09-26T12:10:53.818Z**. Aynı eski Google hesabından
iki kayıt kullanıldı. İki işlem arşiv RPC'den FINAL olarak okunup
hash/signer/receiver/public key/tek action/args ve başarılı receipts
kontrol edildi. Sorgu blokları yerel saate göre seçilmedi; gerçek Market
receipt'lerinden alındı.

| Kontrol örneği | Receipt bloğu | Primary | Resmî arşiv |
| --- | --- | --- | --- |
| 23 Eylül bilet işlemi `EPabFgmS…DYeS` | `DoAEnz3eNdZHxKJRJgjmS1DZHLyzxSZJd3ozpqkNSMz9` | İki view için HTTP 200 + HANDLER_ERROR / **UNKNOWN_BLOCK** | Aynı blokta hak true, doğru cihaz/key/sertifika/authorizer/30 gün |
| 26 Eylül cihaz işlemi `EEXUdVYF…K3uw` | `8wvDuNsBevuhRKpHuxr4YYTogAoBV2RP5QfsryGYJ8P7` | İki view doğru | İki view doğru ve primary ile aynı kayıt |

Tüm başarılı yanıtlarda `result.block_hash` istenen receipt bloğuyla
eşleşti. Eski cihazın o bloktaki yetkilendirme zamanı
**23 Eylül 10:57:07.443 UTC**; yeni cihazınki **26 Eylül 08:13:00.081 UTC**.
Her iki tarihsel kayıtta expiry − authorized süresi tam **2592000000 ms**.
Bu okumalar bugünkü kayıtla karıştırılmadı.

Toplam **2 transaction + 8 tarihsel view** isteği; hepsi salt-okunur.
Primary `https://test.rpc.fastnear.com/`, arşiv
`https://archival-rpc.testnet.near.org/`. Başka provider denenmedi.

Eski bilet bloğu aynı Market'teki tarihsel view erişimini kanıtlayan
kontrol örneğidir; bir `activate_playback_device` işlemi veya canlı
DEVICE_SUBMITTED kaydı diye sunulmaz. Gerçek cihaz işlemi bugün hâlâ
primary'den okunuyor. Bu tur gerçek cihaz işleminin 30 gün gecikmesi
beklenmedi ve böyle bir canlı arıza olduğu iddia edilmedi.

[NEAR contract RPC belgesi](https://docs.near.org/api/rpc/contracts)
view çağrısında `block_id` seçimini, UnknownBlock/GarbageCollectedBlock
sınırlarını ve eski bloklar için arşiv kullanımını açıklar. Buradaki
somut primary yanıtı **UNKNOWN_BLOCK**; tek örnekten genel veri saklama
süresi veya kalıcı veri kaybı sonucu çıkarılmaz.

## İzole teşhis

Mevcut test altyapısının geçici kopyasında iki kontrol **PASS**:

- Transaction primary timeout → arşiv başarı, fakat geçmiş view'lar
  primary UNKNOWN_BLOCK: `mpc_rpc_unavailable`, DEVICE_SUBMITTED aynı.
- Transaction arşivden başarılı, view yanıtı yanlış blokta:
  `device_not_settled`, kayıt aynı; yanlış blok bugünkü veriyle onarılmaz.

Her iki kontrolde de view istekleri doğru `block_id` taşıdı, `finality`
kullanmadı ve arşiv query'si yapılmadı. Mock broadcast sayısı artmadı;
kayıtlar değişmedi. 118 başka test isim filtresiyle atlandı. Bu teşhisler
mevcut eksikliği gösterir; yeni arşiv-view çözümü veya canlı kabul değildir.

## En küçük kaynak işi

**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_SOURCE`
— başlatılmadı.** Kapsam: `mpc-sponsor.ts`, ilgili testleri, rapor/plan.
Kontrat, ABI/DTO, Web kimliği, provider credential veya yeni bağımlılık yok.

- Yalnız doğrulanmış cihaz receipt'i sonrasında kullanılan
  **`has_entitlement` / `get_playback_device`** geçmiş okumalarına arşiv
  yedeği ekle. Market/account/method/args ve **aynı block_id** korunmalı.
  Serbest method/endpoint veya genel query/signer servisi açılmamalı.
- Mevcut transaction okuyucusunun sınırlı okuma altyapısını gerektiği kadar
  paylaş; send/query yollarını topluca değiştirme. Primary erişim/timeout
  veya UNKNOWN_BLOCK gibi açık geçmiş erişim hatasında en fazla bir
  sabit arşiv okuması; mevcut 15 s ve gövde sınırları korunmalı.
- Geçerli fakat olumsuz hak/cihaz yanıtı, yanlış blok/key/certificate/
  authorizer veya bozuk kanıt başka provider'dan olumlu sonuç aranarak
  kabul edilmemeli. Yanıt bloğu receipt bloğuna eşit olmalı; bugünün
  final bloğuna veya başka bir eski bloğa geri dönüş olmamalı.
- İki sağlayıcı da okuyamazsa aynı pending kayıt ve sayaçlar korunmalı.
  Status yeni imza, cihaz yenileme veya broadcast üretmemeli.
- Transaction fallback'i, ödeme uzlaştırması ve güncel playback güvenliği
  regresyondan geçmeli. Tarihsel cihaz kanıtı, bugün süresi dolan cihazın
  oynatılmasına izin vermemeli.

Kaynak kabul senaryoları: primary başarıda yedek yok; erişilemeyen geçmiş
blokta aynı parametrelerle tek arşiv; yanlış blok ve olumsuz proof reddi;
iki taraf hata verirse değişmeyen pending; query yöntemi/receiver/args
kapsamı; byte/zaman sınırı ve sıfır gönderim. Sonraki gerçek kabul
scope'u ayrıca belirlenmeli; canlı terminal kayıtlar geri alınmaz.

## Korunma ve sonuç

Canlı actor dosyası WAL yokken sabit kopyalandı; read-only/immutable
SQLite integrity **ok**. **11 MPC kaydı aynı**, aktif kilit yok.
Runtime/config metadata hash'leri aynı. near-api-js Web/Bridge kurulu
ve lock sürümü **7.3.0**; kaynak ve paket değişmedi.

**PROVIDER / salt-okunur:** receipt ankrajları ve iki tarihsel view çifti.
**LOCAL_TEST:** iki mevcut-hata teşhisi. **LOCAL_STATIC:** kaynak/caller
incelemesi ve korunma. Tarayıcı, yeni oturum/anahtar, ödeme/cihaz,
runtime/CI/deploy **EXTERNAL_NOT_RUN**. Tam tarihsel-device kurtarma ve
30 gün sonrası gerçek kabul **UNPROVEN**.

Ön kontrol tamamlandı; uygulanacak dar kaynak bulgusu var. Yalnız bu
rapor ve ana plan değişti; doküman build, iki dosyalık kapsam/index ve
canlı actor/config korunma kontrolleri **PASS**. Mevcut doküman 500 kB
bundle uyarısı sürer.
Kanıt:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-historical-state-36zk_dtx/`.
`history-safe.json`, `proof-check-safe.json`, salt-okunur sorgu betiği,
geçici teşhis testi ve actor/hash kopyaları burada.
