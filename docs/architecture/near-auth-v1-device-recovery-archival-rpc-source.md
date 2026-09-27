# NEAR Auth V1 — tarihsel işlem arşiv okuması kaynağı

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ARCHIVAL_RPC_SOURCE`.
26 Eylül 2026 — **PASS (LOCAL_STATIC / LOCAL_TEST)**.

Eski işlem sonucu primary RPC'den alınamadığında aynı hash/sender için
sınırlı arşiv okuması eklendi. Dış MPC, bilet iç işlemi ve cihaz iç işlemi
aynı okuyucuyu kullanır. İşlem gönderimi, nonce veya imza tekrarı eklenmedi.
Kaynak ve kabul paketi hazır; gerçek eski ödeme kabulü bu gate'te yapılmadı.

## Değişiklik ve sınır

- `workers/livepeer-bridge/src/mpc-sponsor.ts`: sabit arşiv adresi ve
  `readFinalTransaction(txHash, senderAccountId)`; mevcut üç `tx` okuyucusu
  bu yardımcıya yönlendirildi.
- `workers/livepeer-bridge/src/mpc-sponsor.test.ts`: arşiv/primary, hata,
  kanıt, zaman/boyut ve gönderimsizlik regresyonları.
- Bu rapor ve `near-auth-integration-status.md`.

Mevcut `rpc` fonksiyonu ve broadcast yolları değiştirilmedi. Kontrat/ABI,
DTO, Web kaynağı, bağımlılık/lockfile, provider credential ve runtime
config değişmedi. near-api-js Web/Bridge kurulu ve lock sürümü **7.3.0**.
Gönderim bayrakları açılmadı, servis restart/deploy veya canlı state yazımı yok.

## Okuyucunun davranışı

1. İlk adres `https://test.rpc.fastnear.com/`. İstek yalnız JSON-RPC `tx`;
   parametreler `tx_hash`, `sender_account_id`, `wait_until:'FINAL'`.
2. Transport/body-stream hatası, HTTP erişim hatası veya açık
   `UNKNOWN_TRANSACTION`, `TIMEOUT_ERROR`, `INTERNAL_ERROR` RPC hatasında
   en fazla bir `https://archival-rpc.testnet.near.org/` okuması.
   Aynı serialized body kullanılır; signed transaction/JWT taşınmaz.
3. Her sağlayıcı için **15 saniye**; en fazla iki ağ isteği, toplamda iki
   zaman penceresi. Gövde akış sırasında **262144 byte** ile sınırlıdır;
   fazla gövde iptal edilir. HTTP yönlendirmesi takip edilmez.
4. Bozuk JSON/sonuç, aşırı gövde veya geçersiz parametre yanıtı başka
   sağlayıcıyla onarılmaya çalışılmaz. Geçerli ama henüz FINAL olmayan
   sonuç aynı pending kaydı bırakır; sırf FINAL bulmak için yedeğe gidilmez.
5. Hash/sender/işlem alanları, receipt başarısı, signature, amount/event/hak
   ve quote doğrulaması hâlâ çağıran uzlaştırma katmanındadır. Başarısız
   işlem ya da yanlış/çelişkili kanıt, arşivde başka sonuç arama nedeni değildir.
6. Her iki sağlayıcı erişilemezse mevcut SUBMITTED / TICKET_SUBMITTED /
   DEVICE_SUBMITTED kaydı korunur. Kilit, nonce, sayaç veya approval silinmez.

Sabit arşiv endpoint'i önceki ön kontrolde aynı eski ticket hash'iyle
salt-okunur doğrulandı; [resmî RPC listesinde](https://docs.near.org/api/rpc/providers)
yer alır ve public kullanım hız sınırlıdır. Bu kaynak gate'inde endpoint'e
canlı test veya yük testi yapılmadı; hizmet sürekliliği garantisi çıkarılmaz.

## Yerel doğrulama

- Üç yol için timeout regresyonu düzeltmeden önce pending'de kalıp
  başarısız oldu; düzeltmeden sonra aynı sorgunun tek arşiv okumasıyla geçti.
- Primary başarılıysa yalnız primary; ağ/body-stream/HTTP429/503 ve tanımlı
  RPC erişim hatalarında tek yedek; iki sağlayıcı da başarısızsa kayıt aynı.
- Primary ve arşivden gelen yanlış hash/sender, receipt failure ve işlem
  failure reddediliyor; üçüncü istek veya yeniden gönderim yok.
- Bozuk JSON, null sonuç, invalid params ve fazla gövde kontrolleri PASS.
  Arşivde büyük stream iptali ve gerçek zamanlayıcı davranışını modelleyen
  **15 s + 15 s** sınırı ayrıca doğrulandı.
- Query veya broadcast başarısızlığı arşive gönderilmiyor. Arşive yalnız
  hash/sender/FINAL taşınıyor; nonce yenileme veya imza alınmıyor.
- **MPC dosyası: 118 PASS. Bridge tam paket: 572 PASS / 3 SKIPPED**, 10 dosya.
  Üç mevcut isteğe bağlı yük/abuse testi çalıştırılmadı.
- **Web tam paket: 1038 PASS**, 52 dosya; auth strict tip kontrolü PASS.
  Bridge TypeScript ve kaynak whitespace kontrolleri PASS.
- Tam pakette eski eşzamanlı submit fixture'ının ilk isteğin her zaman
  rezervasyonu kazandığı varsayımı ortaya çıktı. İki duplicate testinde
  mock sonuç, gerçekten hash döndüren yanıttan kurulacak şekilde düzeltildi;
  tek broadcast ve aynı operation koşulları korundu. Ardından tam paket geçti.

## Yalıtılmış kabul paketi yenilendi

Önceki ön kontroldeki iki gerçek Google kayıt kopyası yeniden kullanıldı;
payload/imza doğrulaması tekrar PASS. Güncel kaynaktan yalnız
`reconcileTicket` ve `reconcileUpload` export eden çekirdek tekrar derlendi.
Kaynak/core/kayıt/runner hash'leri yeni manifestte sabitlendi.

Fetch koruması artık **dört tam okuma biçimi** kabul eder: aynı ticket
hash/sender için primary veya arşiv `tx`, primary'de mevcut hak ve aynı
upload job. Arşivden query, başka hesap/hash/host, cihaz/access-key sorgusu
ve bütün gönderimler reddedilir. **10 ret kontrolü PASS**, ağ isteği **0**.

`acceptanceReady:true` yalnız kaynak engelinin giderildiğini ve paketin
hazır olduğunu ifade eder. `acceptance-approved` modu çalıştırılmadı,
bellek içi pending kopyadan uzlaştırma yapılmadı ve `acceptance-safe.json`
oluşmadı. Eski ön kontrol paketi değiştirilmedi; yeni paket bu gate'in
kanıt dizinindeki `acceptance-packet/` altındadır. Paket canlı actor'a,
sponsor özel anahtarına veya Web cookie'sine ihtiyaç duymaz.

## Korunma ve kalan sınırlar

Canlı actor sabit kopyadan read-only/immutable okundu: integrity **ok**;
önceki kabul sonrası **11 MPC kaydının hash'i aynı**. Runtime/config
metadata hash'leri ve Git index korundu. Çalışan Bridge `watch:false` ile
başlatılmıştı; kaynak değişikliği otomatik olarak o servise yüklenmedi.

Bu gate yalnız tarihsel **transaction** okumalarını kapsar. Cihaz
uzlaştırmasının geçmiş bloktan yaptığı `get_playback_device` ve
`has_entitlement` view okumaları mevcut primary yolunda kaldı. Dolayısıyla
bu sonuç bütün tarihsel contract-state erişimini veya gerçek süre dolumu
sonrası cihaz kabulünü kanıtlamaz. Gecikmiş ticket/upload çekirdeği bu
eski cihaz view'larına önceki kaynak düzeltmesiyle bağımlı olmaktan çıkarıldı.

Canlı provider, gerçek yalıtılmış eski kayıt uzlaştırması, Web/private
binding entegrasyonu, hosted ortam ve CI/deploy **UNPROVEN / EXTERNAL_NOT_RUN**.
Yeni ödeme, imza, cihaz kaydı veya canlı kayıt geri alma yapılmadı.

## Sonuç

Kaynak blocker'ı yok. Doküman build, dört dosyalık kapsam/index ve canlı
actor/config korunma kontrolleri **PASS**. Mevcut doküman 500 kB bundle
uyarısı sürer.
Kanıt:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-archival-source-pjyafhai/`.

**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_ACCEPTANCE`
— başlatılmadı.** Yeni paketle gerçek ödeme kanıtını yalnız okuyarak,
bellek içindeki benzetilmiş gecikmiş kayıtları doğrulamak; canlı settled
kayıtları değiştirmek veya yeni para hareketi başlatmak değil.
