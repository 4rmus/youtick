# NEAR Auth V1 — gecikmiş uzlaştırma kabulü

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_ACCEPTANCE`.
26 Eylül 2026 — **PASS (yalıtılmış çekirdek + gerçek salt-okunur testnet kanıtı)**.

**İki eski ödeme, güncel cihaz sorgusu veya yeni ödeme gerektirmeden bellek
kopyalarında tamamlandı.** Bilet TICKET_SUBMITTED → TICKET_SETTLED, upload
MPC_VERIFIED → UPLOAD_SETTLED. Primary'nin zaman aşımından sonra aynı bilet
hash'i arşivden okunarak mevcut kaynak üzerinden doğrulandı. Canlı actor'a
hiç yazılmadı; canlı kayıtlar baştan beri settled idi.

## Kapsam

Yalnız bu rapor ve ana plan repo kapsamında değişebilir. Hazırlanmış paket
ayrı geçici dizine kopyalandı. Kaynak, index, runtime/config, tarayıcı ve
özel anahtarlar korunur. Yeni işlem/onay/imza, broadcast, relay, fonlama,
cihaz etkinleştirme, servis restart veya deploy yok.

Bu kabul gerçek bir ödemeyi tekrar göndermek veya canlı kaydı geri almak
değildir. Yalnız bellek içindeki kopyanın başlangıç durumu değiştirilerek
ilk uzlaştırmanın geciktiği durum benzetildi; gerçek zincir kanıtı okundu.

## Paket ve korumalar

Önceki kaynak gate'inin `acceptance-packet/` içeriği kullanıldı. Kaynak,
derlenmiş çekirdek ve kayıt hash'leri manifestle eşleşti. Çekirdek yalnız
`reconcileTicket` ve `reconcileUpload` dışa açıyor; özel anahtar veya
Web/HttpOnly oturumu gerekmiyor.

Çalıştırıcıda iki dar ölçüm düzeltmesi yapıldı: fetch katmanı artık
kaynağın 15 s sinyalini 20 s üst sınırla birleştirerek koruyor; güvenli
okuma kaydı endpoint ve sonuç kodunu da içeriyor. Kaynak mantığı değişmedi;
çalıştırıcı hash'i kopyanın manifestinde yenilendi. Eski paket korunuyor.

Çalıştırmadan önce syntax/hash/export kontrolü ve **10 yasak çağrı kontrolü
PASS**, ağ isteği **0**. Sadece dört tam okuma biçimi izinli: seçili ticket
hash/sender için primary/arşiv `tx / FINAL`, primary'de aynı hak ve upload
job. Başka hesap/hash/host, cihaz/access-key sorgusu ve bütün gönderimler
reddediliyor. Bellek deposu yalnız ilgili operation key'ine, aynı
account/payload hash ile beklenen terminal state'i yazabilir.

## Gerçek okuma sonucu

Hesap: `29445f46f23551e48c99869c2e34e3acb283902db8196da32cb3f6625872324c`.
Market: `video-market-v1-260907.youtick-dev-v3.testnet`.

| İşlem kopyası | Başlangıç / sonuç | Doğrulanan kanıt |
| --- | --- | --- |
| Bilet `7ceb0290…37c51` | TICKET_SUBMITTED → **TICKET_SETTLED** | `EPabFgmSjHaUF2PfriFUo31qwoSS2JrkFwyQ7nvCDYeS` hash'i; exact transaction alanları, FINAL/receipts, kullanılan USDC, Market olayı ve mevcut hak |
| Upload `fefa14af…a9cd4` | MPC_VERIFIED → **UPLOAD_SETTLED** | `lp-969b04b0-f205-492d-a6a8-156b18030561` ücretli işi; creator/request, USDC fee ve orijinal quote kimliği |

Her kopyaya **bir** bellek içi terminal yazımı yapıldı. Dört ağ okuması:

1. `https://test.rpc.fastnear.com/` — aynı ticket `tx`: **TimeoutError**.
2. `https://archival-rpc.testnet.near.org/` — aynı `tx`: **HTTP 200**.
3. Primary — `has_entitlement`: **HTTP 200**.
4. Primary — `get_media_job`: **HTTP 200**.

Ağ kayıtlarında `get_playback_device` veya `view_access_key` yok. Arşiv
kullanımı test tarafından zorlanmadı: gerçek primary timeout'unu kaynak
okuyucusu işledi. Aynı kaynak receipt/amount/event/hak doğrulamalarını
geçmeden kopyayı tamamlayamaz. Yanıtlar mock'la değiştirilmedi. Ham provider
JWT/cookie, imzalı gönderim veya video erişim tokenı dışarı alınmadı.

## Korunma ve kanıt sınıfları

Başlangıç ve sonuç actor kopyaları, WAL yokken ve kopyalama boyunca baytlar
sabitken alındı; read-only/immutable SQLite integrity **ok**. **11 MPC kaydı
aynı**, aktif kilit yok. Nonce/sayaç/pointer/canlı state değiştirilmedi.
Runtime/config metadata hash'leri ve Git index aynı.

- **LOCAL_TEST:** gecikmiş başlangıç ve iki terminal yazımı yalnız bellek
  içindedir. Syntax/hash/export/ağ izin sınırı kontrolleri geçti.
- **PROVIDER / public testnet read-only:** gerçek eski ticket, arşiv yedeği,
  mevcut hak ve ücretli upload kanıtları güncel kaynak tarafından okundu.
- **0 canlı storage yazımı, 0 yeni imza, 0 işlem gönderimi.**
- Kaynak değişmediğinden önceki 572 Bridge/1038 Web paketleri yeniden
  çalıştırılmadı; bu sonuç onların veya production'ın yerine geçmez.

**UNPROVEN / EXTERNAL_NOT_RUN:** gerçek süresi dolmuş cihaz, canlı pending
actor geçişi, Web/private-binding oturum yolu, passkey, hosted/production,
CI/deploy ve tarihsel device contract-state view'ları. Çalışan yerel Bridge
`watch:false` ile açıldığından yeni kaynağı bu gate'te yüklenmiş saymıyoruz.
Bütün yeni kaynak okumaları yalıtılmış paket içinde yürüdü.

## Sonuç ve sonraki gate

Bu dar kabulde blocker yok. Yalnız rapor/plan değişti; doküman build,
iki dosyalık kapsam/index ve canlı actor/config korunma kontrolleri
**PASS**. Mevcut doküman 500 kB bundle uyarısı sürer.

Kanıt dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-late-acceptance-3y30th24/`.
`acceptance-safe.json`, `preservation-safe.json`, manifest, dondurulmuş
çekirdek/kayıt kopyaları ve actor snapshot'ları bu dizindedir.

**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_RUNTIME_REFRESH`
— başlatılmadı.** Yerel servisleri yeni kaynakla, aynı oturum anahtarı,
sponsor/epoch/state ve bütün gönderimler kapalı olarak yenilemek; gerçek
Web durum bağlantısını doğrulamak. Canlı kayıt geri alma veya yeni ödeme
bu sonraki kurulumun da parçası değildir.
