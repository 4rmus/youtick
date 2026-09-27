# Yeni hesapla upload ön kontrolü

Gate: `NEAR_AUTH_FRESH_ACCOUNT_UPLOAD_PREFLIGHT` — 21 Eylül 2026.
Sonuç: **BLOCKED**. Ortam kontrolleri geçti; yeni Google hesabı zincirde henüz
oluşturulmadığı için upload onay paketi hazır değil. Fonlama, Google işlem
onayı, sponsor imzası, yeni quote, relay veya upload başlatılmadı.

## Kapsam ve seçimler

Kullanıcı farklı hesaplarla yeni test istedi ve bu ön kontrol gate'ini açtı.
Eski denemenin uzlaştırması BLOCKED olarak ayrı tutulur; yeni hesap eski işi
tekrar gönderme, kayıt silme veya eski ödemeyi sonuçlandırma yöntemi değildir.
Yalnız bu rapor ve `near-auth-integration-status.md` değişir. Uygulama,
kontrat, Bridge, bağımlılıklar, config, kullanıcı logları ve index korunur.
Ana ajan tek başına çalıştı; alt ajan açılmadı.

- Kullanıcının seçtiği sponsor: **soteri.testnet**.
- Kullanıcının belirttiği video adı: **distance**. Dosya henüz formda seçilmedi;
  gerçek bayt sayısı ve dosya özeti doğrulanmadı. Önceki videonun boyutu yeni
  dosyaya varsayılmadı.
- Kullanıcı yeni Google girişi yaptı. E-posta bu rapora veya kanıtlara alınmadı.
- Görünür hesap kontrolündeki açık anahtar:
  `ed25519:3n6Bh1cWRLQguzquwe7v78YPSZXHiTsJySwebf5N1bF9`.
- Türetilen yeni testnet hesabı:
  `29445f46f23551e48c99869c2e34e3acb283902db8196da32cb3f6625872324c`.
  Önceki `37729f…23d9` hesabından farklıdır.

## PROVIDER — ortam hazırlığı

21 Eylül **20:11–20:12 UTC** kontrolleri:

- Yerel `http://localhost:3000/auth-lab` HTTP **200**. Dinleyen süreç
  `127.0.0.1:3000` üzerinde; çalışma dizini mevcut `apps/web`.
  Sunucu yeniden başlatılmadı; secret/config değiştirilmedi.
- Bridge health **200 / ok**; sürüm
  `df4609b5-82cc-49b7-8993-62f3e15db700`.
- Compact version **1**, testnet ve
  `video-market-v1-260907.youtick-dev-v3.testnet` eşleşiyor.
- Yeni upload, sponsor quote/relay ve V2 playback readiness **true**.
  Bunlar gerçek ödeme, upload veya HLS kabulü değildir.
- `OPTIONS /v1/sponsored-upload-quotes` **204**, izin tam
  `http://localhost:3000`; yeni quote alınmadı.
- Final blok **269641087**, hash
  `7rNoEEfCD7uThMttVsvrjJx5V6GCXF8YEd9mn2tYLyEn`:
  Market compact **1**, `bridge_frozen=false`,
  `new_purchases_paused=false`, quote key version **1**.
- Circle testnet USDC kimliği beklenenle eşleşiyor. Public upload policy
  imzalı quote istiyor; kaynak üst sınırı **5.000.000.000 bayt**;
  adaptive ve legacy profilleri mevcut.
- FastAuth `paused=false`, MPC `v1.signer-prod.testnet`, domain **1**.
  Protokol **85**, min gas purchase price **1000000000** ve gas price
  **100000000**; mevcut lab'in protokol/fiyat sınırlarıyla uyumlu.

## PROVIDER — yeni Google hesabı

21 Eylül **20:14:11 UTC**, final blok **269641298**,
hash `31KKZofcRtyzbnUgNPWh8DcgFExSHn5BGypb3ucN2F3c`:

| Kontrol | Sonuç |
| --- | --- |
| NEAR hesabı `view_account` | Hesap yok |
| FullAccess anahtarı | Doğrulanamadı; hesap henüz yok |
| Test USDC bakiyesi | **0** |
| USDC storage kaydı | Yok |
| Market'te bu hesap için cihaz kaydı | **0 kayıt** |

Market cihaz kontrolü yalnız bu hesabın tam prefix'i için yapıldı; tarayıcı
storage'ı veya cihaz özel anahtarı okunmadı. Yerel cihazın ve taslağın
hazır/yazılabilir olduğu henüz doğrulanmadı. Görünür UI de bu açık anahtara
bağlı bir hesap doğrulanamadığını gösteriyor.

Salt-okunur **Test hesabı hazırlığını göster** adımı, aynı adres için
**0,1 test NEAR transfer / giderler dahil en fazla 0,12 test NEAR** paketini
gösterdi. Meteor seçimi ve fonlama onayı yapılmadı.

## PROVIDER — seçilen sponsor

21 Eylül **20:16:01 UTC**, final blok **269641481**,
hash `6R5yjXh6q3Nrdvy5PsHMhnsgSgZeRrFRR4TJbKL2xKkU`:

| Kontrol | Sonuç |
| --- | --- |
| soteri.testnet NEAR toplamı | **5,268127370684158497999990 test NEAR** |
| Storage payı sonrası hesaplanan kullanılabilir tutar | **5,059557370684158497999990 test NEAR** |
| Test USDC | **30,58** |
| Sponsorun USDC kaydı | Mevcut |
| 0,35 NEAR MPC bütçesi / 0,12 NEAR hesap hazırlama bütçesi | Bakiye yeterli |
| Cüzdanda soteri.testnet kontrolü ve seçimi | Henüz doğrulanmadı |

USDC storage minimumu bu blokta **0,00125 test NEAR**. Bu public bakiye
kontrolü cüzdan kontrolü veya harcama onayı değildir. Ücretler güncel işlem
hazırlığında yeniden okunur.

## LOCAL_STATIC — kaynak ve bütçe sınırları

- Manifest/lock/kurulu paketler: near-api-js **7.3.0**, Auth0 SPA **2.26.0**,
  jose **6.2.12** uyumlu.
- Önceki findings gate'inde test edilen yedi ilgili Web/protokol dosyası
  mevcut kaynakla birebir aynı. Önceki 845 test bu gate'te yeniden koşulmadı.
  Bu karşılaştırma sunulan tarayıcı bundle'ının veya hosted Bridge'in yeni
  source gate ile birebir aynı olduğu iddiası değildir.
- Hosted Bridge yukarıdaki mevcut sürümde; önceki kaynak düzeltmeleri için
  bu gate'te yeni yayın veya hosted-source eşitliği doğrulanmadı.
- Hesap hazırlama: **0,1 test NEAR**, toplam üst sınır **0,12 test NEAR**.
- Mevcut USDC hazırlama ekranı **0,60 test USDC** aktarır; kaynak kodundaki
  NEAR bütçe tavanı **0,08 test NEAR**. Gerçek hazırlık, hedef hesap ve
  FullAccess doğrulandıktan sonra ayrıca yapılmalıdır.
- MPC imza isteğinin kaynak bütçe tavanı **0,35 test NEAR**; bu sabit ücret
  veya bu gate'te gerçekleşen harcama değildir.
- Upload toplamı dosya boyutuna bağlıdır: kaynak kodunda en az **0,50 USDC**
  video bedeli + **0,10 USDC** relay bedeli. Büyük dosyada artar. Dosya
  boyutu/özeti ve güncel teklif yokken kesin upload tutarı kabul verilmez.

## Sonuç ve tek sonraki gate

Engel: yeni Google hesabının oluşturulması ve sonra FullAccess/USDC
hazırlığının doğrulanması gerekiyor. Dosya boyutu/özeti, yerel cihaz/taslak,
cüzdandaki sponsor seçimi ve kesin upload bütçesi de açık kalıyor.
Eski hassas çıktı olayının kapanışı veya eski işlemin son denemeye bağlanması
bu yeni testle çözülmüş sayılmadı; eski kayıtlar okunmadı/silinmedi.

**Tek sonraki gate: `NEAR_AUTH_FRESH_ACCOUNT_PROVISIONING`.** Mevcut paketle
aynı yeni adrese **0,1 test NEAR**, giderler dahil **0,12 test NEAR** sınırında
hesap hazırlama; gönderen hesap cüzdanda doğrulanmalı, gerçek imzayı kullanıcı
vermelidir. Bu sonraki gate henüz açılmadı. USDC aktarımı ve video yükleme
bu hesap hazırlama gate'ine otomatik dahil değildir. Hazırlama sonrası yeni
hesap, anahtar ve bakiye salt-okunur doğrulanır; belirsizlikte tekrar transfer yok.

## Değişen dosyalar ve doğrulama

- `docs/architecture/near-auth-fresh-account-upload-preflight.md`.
- `docs/architecture/near-auth-integration-status.md`.

Kanıt:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-fresh-account-preflight-iesnZi/`.
Public runtime/zincir/sponsor sonuçları ve kaynak hash eşleşmeleri kaydedildi;
e-posta, subject, token, cookie, özel anahtar veya browser storage dökümü yok.
Doküman build/bağlantılar **PASS**; mevcut doküman bundle boyutu uyarısı sürüyor.
Kapsam dışındaki kaynaklar ve Git index başlangıç hash’leriyle aynı.
Uygulama değişmediği için test/build tekrar çalıştırılmadı. Funding, yeni
quote, gerçek imza/ödeme, upload/HLS, provider/config, CI/deploy ve Git
yayın işlemleri **EXTERNAL_NOT_RUN**.
