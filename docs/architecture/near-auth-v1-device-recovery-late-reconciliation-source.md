# NEAR Auth V1 — gecikmiş ödeme uzlaştırması kaynak düzeltmesi

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_SOURCE`.
26 Eylül 2026 — **PASS (LOCAL_STATIC / LOCAL_TEST)**.

**Kesinleşmiş ödeme, cihazın sonradan değişmesi nedeniyle artık kaynak
mantığında beklemede kalmıyor.** Bilet tam ödeme ve mevcut hakla, yükleme
ise aynı quote'a bağlı ücretli Market işiyle tamamlanır. Güncel cihaz,
anahtar ve oynatma yetkisi ayrı kontroller olarak korunur.

## Dar değişiklik

- `workers/livepeer-bridge/src/mpc-sponsor.ts`: iki uzlaştırma yolu.
- `workers/livepeer-bridge/src/mpc-sponsor.test.ts`: ilgili regresyonlar.
- Bu rapor ve `near-auth-integration-status.md`.

Kontrat/ABI/DTO, Web kaynakları, paket/lockfile, canlı config ve kalıcı
kayıtlar değiştirilmedi. Yeni yardımcı katman, bağımlılık, state migration
veya otomatik yeniden gönderim eklenmedi. near-api-js Web/Bridge manifest,
lock ve kurulu sürümü **7.3.0** olarak korundu.

### Bilet

`reconcileTicket`, güncel access key'i sadece final blok elde etmek için
okumayı bıraktı. `has_entitlement` doğrudan `finality:'final'` ile Market'ten
okunur; blok hash'i, byte dizisi ve boolean **true** doğrulanır. Güncel
cihaz sorgusu ve expiry/certificate/authorizer karşılaştırması ödeme
sonucunu engellemez.

Exact işlem hash/signer/receiver/public key/nonce, tek action ve tam
method/gas/deposit/args, FINAL ve başarılı receipts, gerçekten kullanılan
USDC tutarı, Market satın alma olayı, fee sınırı ve mevcut hak kontrolleri
korundu. Eski imza anahtarı bugün kaldırılmış olsa da tarihsel işlemdeki
public key eşleşmesi zorunlu kalır. Eksik hak veya bozuk/ulaşılamayan final
view, kaydı pending bırakır; durum sorgusu yeni işlem göndermez.

### Yükleme

`reconcileUpload`, creator/job/title/price/source bytes/profile kimliğini
karşılaştıran açık alan listesi kullanır. Generation, Authorized/Published
status, USDC fee amount/usd micro ve ilk request'i bağlayan quote hash
kontrolleri aynı kalır. Sonradan izinli olarak değiştirilebilen upload key
ve expiry ile güncel izleme cihazı ödeme tamamlanma koşulundan çıkarıldı.

İş henüz yoksa sonuç hâlâ **MPC_VERIFIED**; bu bir ödeme kanıtı değildir.
Orijinal signed delegate, upload key/expiry ve playback authorization
pending yanıtında aynen korunur. Status relay göndermez. `UPLOAD_SETTLED`
aynı ücretli işin varlığını ifade eder; o relay denemesinin ayrıca yeni
bir ücret aldığı veya medyanın oynatılabildiği iddiası değildir.

## Korunan sınırlar

`TICKET_SETTLED` / `UPLOAD_SETTLED`, atomik kayıt güncellemesi ve hesap
pointer'ları yeniden kullanıldı. Kilit/sayaç/nonce silinmedi. İstemciler
aynı durumları tüketir; cihaz hazırlığı ayrı açık eylem gerektirir.

Playback kodu değiştirilmedi: güncel cihaz, sertifika, süre, gerekli
delegate imzası, hesap anahtarı, hak ve yayın/freeze kontrolleri sürer.
Ödeme tamamlandı diye eksik veya expired cihaz oynatamaz. Web session,
origin ve güncel hesap sahipliği kontrolleri gevşetilmedi; silinmiş hesap
anahtarı nedeniyle giriş yapılamaması ayrı hesap kurtarma konusudur.
Lab'ın kısa ömürlü review yolu ve cihaz aktivasyonunun kendi tarihsel
receipt uzlaştırması değiştirilmedi.

## Doğrulama

- Yeni **11 olumlu regresyon** düzeltmeden önce beklenen
  `ticket_not_settled`, `upload_not_settled` veya mevcut-key RPC hatasıyla
  başarısız oldu; düzeltmeden sonra geçti. Cihaz expiry/eviction/sertifika
  ve authorizer değişimleri, eski imza key'inin kaldırılması ve iki
  değişebilir upload key alanı kapsandı.
- RPC hatası, bozuk blok/byte yanıtı ve string `"true"` hak kanıtı
  reddedilir; kayıtlar aynı kalır. Refund, yanlış hesap/olay/args, başarısız
  receipt ve eksik hak testleri korunur.
- Eski cihazı ödeme koşulu yapan test beklentileri yeni sınırla güncellendi;
  yanlış creator/job/profile/ücret/quote testleri duruyor. Mevcut oynatma
  testleri eksik/expired cihazın reddini ayrıca doğrular.
- **31 gün sonra oluşmamış upload** terminal yapılmaz; orijinal relay
  request'i, cihaz authorization'ı ve ekonomik kilit aynı kalır.
- Status kontrolleri kapalı gönderimlerle/restart benzetimiyle çalışır;
  mock broadcast sayısı artmaz. Terminal durum sonraki okumada RPC olmadan
  korunur; user pointer silinmez.
- **Bridge tam paket:** **540 PASS / 3 SKIPPED**, 10 dosya. Üç mevcut
  isteğe bağlı yük/abuse testi açılmadı. MPC dosyası **86 PASS**.
- **Web tam paket:** **1038 PASS**, 52 dosya; auth strict tip kontrolü PASS.
  Bridge TypeScript kontrolü PASS. Kaynak whitespace kontrolü PASS.
  Son düzeltme test fixture'ının JSON yanıt tipiydi; ardından tip kontrolü
  ve MPC paketi tekrar geçti.
- Canlı actor'ın sabit kopyası read-only/immutable açıldı: integrity **ok**,
  önceki kabulden kalan **11 MPC kaydı aynı**, aktif kilit yok. Runtime/config
  metadata dosyalarının hash'leri aynı. Gerçek RPC veya tarayıcı çalıştırılmadı.

Bütün yeni davranış kanıtları **LOCAL_TEST**, kod/kapsam kanıtları
**LOCAL_STATIC**. İşlem onayı, gerçek geç ödeme, provider veya dağıtım
kabulü **UNPROVEN / EXTERNAL_NOT_RUN**. Çalışan yerel Bridge `watch:false`
ile açılmıştı; bu kaynak değişikliği ona yüklenmiş sayılmaz. Servis restart,
config açma, state'i pending'e geri çevirme, ödeme veya cihaz onayı yapılmadı.

## Sonuç

Kaynak kabulünde blocker yok. Yalnız iki kaynak/test dosyası ve iki belge
kapsamı; doküman build, kapsam/index ve canlı actor/config korunma
kontrolleri **PASS**. Mevcut doküman 500 kB bundle uyarısı sürer.
Kanıt:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-late-source-y2q8hoj_/`.
Başlangıç hash/index, dar farklar ve korunma kaydı bu dizindedir.

**Tek sonraki gate:
`NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_ACCEPTANCE_PREFLIGHT`
— başlatılmadı.** Eski kayıtları bozmadan, gerekiyorsa yalıtılmış kopya
üzerinden gerçek kanıta bağlı salt-okunur kabul yöntemini hazırlamak;
canlı settled kaydı geri almak veya yeni ödeme üretmek değil.
