# NEAR Auth V1 — tarihsel cihaz kanıtı kaynağı

26 Eylül 2026 · `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_SOURCE`

**PASS — LOCAL_STATIC / LOCAL_TEST.** Doğrulanmış cihaz işleminin
receipt bloğundaki iki durum okuması artık ana sağlayıcı erişemediğinde
aynı sorguyla sabit arşiv sağlayıcısına geçer. Yeni kaynak çalışan
yerel Bridge'e yüklenmedi; canlı kabul bu gate'in sonucu değildir.

## Amaç ve kapsam

[Ön kontrol](./near-auth-v1-device-recovery-historical-state-preflight.md),
eski bir receipt bloğunda ana sağlayıcının `UNKNOWN_BLOCK` verdiğini,
arşivin aynı bloktaki hak ve cihazı okuyabildiğini göstermişti. O eski
örnek bir ticket işlemiydi; gerçek gecikmiş `DEVICE_SUBMITTED` kabulü
olarak değerlendirilmez. Bu gate yalnız o kaynak bağımlılığını düzeltir.

İzin verilen ve değişen dört dosya:

- `workers/livepeer-bridge/src/mpc-sponsor.ts`
- `workers/livepeer-bridge/src/mpc-sponsor.test.ts`
- Bu rapor.
- `docs/architecture/near-auth-integration-status.md`

Kontrat/ABI, Web, paketler, lockfile, provider ayarı, secret/config,
canlı actor ve çalışma servisleri değişiklik kapsamı dışındadır.
Kabul ölçütleri: aynı blok ve sorgu kapsamı, sınırlı tek arşiv denemesi,
yanlış/olumsuz kanıt reddi, başarısız okumada değişmeyen pending kayıt,
sıfır yeni gönderim ve ödeme/oynatma regresyonlarının geçmesi.

## Değişiklik ve mimari sınır

Mevcut transaction arşiv okuyucusunun taşıma döngüsü özel `readHistory`
yardımcısına taşındı. `readFinalTransaction` aynı `tx` isteğini üretir;
transaction hata sınıfları değişmedi. Tek yeni çağıran, `reconcileDevice`
içindeki `has_entitlement` / `get_playback_device` okuyucusudur.
Bu iki yöntem TypeScript birleşim tipiyle sınırlıdır; dışarıya yeni
RPC/signer API'si, serbest endpoint veya bağımlılık eklenmedi.

FINAL transaction, exact signer/receiver/nonce/action/args ve başarılı
Market receipt doğrulaması önce gelir. Sonra her view, receipt'in
`block_hash` değerini `block_id` olarak kullanır. Aynı serileştirilmiş
istek, Market, hesap ve argümanlarla en fazla iki sağlayıcıya gider:
primary ve sabit testnet archive. `finality` veya başka blokla yeniden
deneme yoktur. Yanıtın blok hash'i de receipt bloğuna eşit olmalıdır.

Bağlantı/akış/HTTP erişim hatası ve açık RPC erişim hataları
(`UNKNOWN_BLOCK`, `GARBAGE_COLLECTED_BLOCK`, `TIMEOUT_ERROR`,
`INTERNAL_ERROR`) tek arşiv denemesine izin verir. Her sağlayıcı için
15 saniye, akışta 262144 byte üst sınırı ve manual redirect korunur;
view sonucu ayrıca en fazla 4096 byte olabilir. İki view paraleldir;
her biri bağımsız olarak en fazla bir arşiv isteği yapar.

Geçersiz JSON, büyük/bozuk yanıt, yanlış blok veya olumsuz hak/cihaz
kanıtı başka sağlayıcıdan olumlu cevap aranarak düzeltilmez. Key,
certificate, authorizer ve 30 günlük tarihsel süre kontrolleri mevcut
yerinde kalır. Okuma başarısızsa status hata verebilir; aynı pending
kayıt ve sayaçlar korunur, yeni imza veya broadcast oluşmaz.

Genel `rpc`, mevcut finality sorguları ve gönderim yolları değişmedi.
NEAR hak otoritesi, Bridge doğrulama/kontrol katmanı olarak kaldı.
Tarihsel uzlaştırma bugünkü oynatma izni değildir: `index.ts` içindeki
güncel cihaz/expiry/delegate denetimleri değişmedi. Web/Bridge
near-api-js 7.3.0 ve diğer bağımlılıklar korundu.

## Doğrulama

Tüm yeni testlerde anahtarlar, zincir yanıtları ve storage sentetiktir.
Fixture hazırlığındaki gönderimlerden sonra status okumasının ek
gönderim yapmadığı ayrıca kontrol edilir.

| Kontrol | Sonuç |
|---|---|
| Değişiklik öncesi yeni 26 test | 17 başarısız / 9 başarılı; eksik fallback görünür |
| Değişiklik sonrası MPC odaklı paket | 144 PASS; 26 yeni tarihsel durum testi dahil |
| Primary başarılı; UNKNOWN_BLOCK / GARBAGE_COLLECTED_BLOCK / TIMEOUT_ERROR / HTTP503 / timeout | Aynı receipt bloğu, Market/method/args; en fazla tek fallback |
| Primary ve archive yanlış blok / hak yok / cihaz yok / yanlış key, certificate, authorizer / büyük view / bozuk JSON | Red; başka kanıt aranmaz, kayıt ve gönderim sayısı aynı |
| İki sağlayıcı okuyamıyor; büyük arşiv gövdesi | Pending/sayaçlar aynı; akış iptal edilir; üçüncü istek yok |
| Geçersiz receipt bloğu | İki tarihsel view de başlamaz |
| İki view için gerçek abort sinyaliyle sahte saat | Her sağlayıcı 15 s; toplam dört view isteği sınırı |
| Tüm Bridge testleri | 598 PASS / 3 mevcut SKIP |
| Bridge `npm run check` | PASS |
| Tüm Web testleri | 1038 PASS |
| Web `npm run test:near-auth-types` | PASS |
| Doküman build ve kapsam/diff kontrolü | PASS |

Doküman build'in mevcut 500 kB bundle uyarısı ve Web test aracının
gelecek sürüme ilişkin config uyarısı sürer; bu gate'in bulgusu değildir.
CI, provider çağrısı, tarayıcı, yeni imza/ödeme/yükleme, servis yeniden
başlatma ve deploy **EXTERNAL_NOT_RUN**. Gerçek tarihsel cihaz
kurtarması ve çalışan runtime'da bu kaynağın kabulü **UNPROVEN**.

## Korunma ve sonraki sınır

Gate başlangıç hash'leriyle yalnız yukarıdaki dört dosya farklıdır;
index aynıdır. Beş yerel runtime/config dosyasının hash'leri korunur.
WAL yokken alınan sabit actor kopyaları read-only/immutable SQLite
ile okunur: integrity `ok`, **11 MPC kaydı** önceki kabul kanıtıyla ve
gate içi karşılaştırmayla aynıdır. Canlı veriye yazılmadı.

Kaynak gate'inde blocker yok.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_HISTORICAL_STATE_ACCEPTANCE_PREFLIGHT`
— başlatılmadı.** Gerçek cihaz receipt'iyle yalıtılmış kabulün kapsamı
ve eski blok erişimi belirlenmeli. Canlı terminal kayıt geri alınmamalı;
eski ticket kontrolü gerçek device işlemi diye sunulmamalı. Servis
yenilemesi ve gerçek kabul ayrıca kendi kapsamıyla yürütülmeli.

Yerel kanıt dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-historical-state-source-hx8hrrxe/`.
Başlangıç dosya/index/config hash'leri, red/green test çıktıları,
actor kopyaları ve son korunma özeti burada tutulur.
