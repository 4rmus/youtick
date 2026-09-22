# V1 bağımsız passkey akışı — kabul

Gate: `NEAR_AUTH_V1_PASSKEY_ACCEPTANCE`.
22 Eylül 2026 — **COMPLETED_WITH_WARNINGS / creator ve buyer akışları doğrulandı**.
Yeni kimlikle yükleme/yayın/creator izleme, ardından başka creator'ın Distance
biletini satın alma, 720p oynatma ve reload sonrası devam etme doğrulandı.
Kullanıcı bilet kimlik onayını passkey ile verdiğini açıkça teyit etti.
Tam işlem makbuzları ve Production/ikinci cihaz kabulü bu sonuçtan ayrıdır.

## Kapsam

Bağımsız passkey kayıt/giriş, aynı kimlikle imza, yükleme/yayın, satın alma,
izleme ve reload ayrı doğrulanır. Hesap bağlama V1 dışındadır. Yalnız bu rapor
ve ana durum planı güncellenir. Kaynak, bağımlılık, provider/config, cüzdan ve
cihaz kayıtları, diğer kullanıcı hesapları ve Git index korunur. Yeni finansal
adımların hesap/tutar incelemesi ve kullanıcı imzası ayrı yapılır.

## Kayıt ve giriş bulguları

- Kullanıcı mevcut passkey'i olmadığını, bağımsız yeni hesap oluşturacağını
  belirtti. Hosted login ekranında passkey giriş seçeneği görüldü. İlk popup
  zaman aşımına uğradı; başarılı kayıt sayılmadı.
- Kullanıcı Sign up ekranında passkey görünmediğini bildirdi.
  [Auth0 kayıt akışı](https://auth0.com/docs/authenticate/database-connections/passkeys)
  e-posta → Continue → Create a passkey adımlarını belgeliyor. Bu genel belge,
  NEAR Auth test ortamının her ayarını doğrulama yerine kullanılmadı.
- Kullanıcı sonrasında “oluşturdum” dedi. Yeni credential oluşturma onayı ve
  varsa e-posta/cihaz doğrulaması kullanıcı tarafından yapıldı; agent sır veya
  credential almadı. **PROVIDER / localhost:** YouTick “Deneme girişi başarılı”
  gösterdi. Ayrı bir logout + yalnız passkey ile tekrar giriş henüz yapılmadı;
  kayıt sonrası açık oturum, bu tekrar giriş testinin yerine sayılmadı.
- Yeni açık anahtar:
  `ed25519:Bceg83y9cSfXQvAf1suXqhL8qPb7YzW5TSh9yKS2Bxad`.
  Hesap adresi:
  `9db6cbd959c2ad427dc68b77b905edd0b8470431e3a3a9abebf0ee41a659d21a`.
  Önceki Google creator `29445f…2324c` ve buyer `38aa11…2902d` hesaplarından
  farklıdır. Kimlik bağlama yapılmadı.

## Zincir hesabı kontrolü

**PREVIEW / testnet salt-okunur:** 22 Eylül **15:17:48 UTC**, final
**269761339**, hash `F4F1dPavytCs4ZJkM4hQoT1sHKVwkkDTbxhdiDJXfwf9`.
Tam yeni adresin `view_account` sonucu **UNKNOWN_ACCOUNT**. Bu yüzden
“hesap arama servisi eksik olabilir” UI mesajından daha dar ve kesin bulgu:
bu implicit adres henüz zincirde oluşturulmamış. YouTick'in authenticated
hesap sorgusu da bağlı hesabı doğrulamadı. Anahtar/kimlik kaydı ile fonlanmış
NEAR hesabı farklı aşamalardır.

Yeni hesap için mevcut “Test hesabı hazırlığını göster” salt-okunur adımı
açıldı. Fonlama, MPC/cüzdan işlem imzası, USDC kaydı, upload, satın alma veya
izleme başlatılmadı. Ekrandaki bazı “Google” etiketleri ortak lab bileşenlerinin
eski metnidir; kullanıcının Google ile giriş yaptığına kanıt sayılmaz.

## Kanıt ve devam

Başlangıç dosya/index referansı ve `account-check.json`:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-passkey-acceptance-a6saog25/`.
Kod değişmedi; önceki yerel testler tekrar edilmedi. Doküman build doğrulaması
ayrıdır; canlı imza/ödeme/medya sonucu değildir. CI/deploy yapılmadı.

**Tek devam gate'i: `NEAR_AUTH_V1_PASSKEY_ACCEPTANCE`.** Önce yeni zincir
hesabını/bakiyeyi hazırlamak, ardından passkey ile gerçek işlem ve medya
adımlarını doğrulamak. Tam uçtan uca kabul henüz verilmedi.

## Kullanıcının tamamladığı yükleme ve yayın — taze kontrol

Kullanıcı hesabı fonladığını, video yüklemesini tamamladığını ve videonun
sorunsuz açıldığını bildirdi. Bu adım yalnız mevcut sonucu kontrol eder;
agent yeni fonlama, imza, upload veya yayın işlemi başlatmadı.

**PREVIEW / final zincir, 22 Eylül 15:29:04 UTC:** blok **269762487**,
hash `4raRdPDZu9fTesu2wwe67g6K9V4CDwcJ9kYsPnyZwG2Z`.

- Yayın: `lp-27897cc6-fd5c-4a7f-93ac-78f9c3dc4678`, **youtick-promo-test**.
- Creator, yeni kimlik adresiyle birebir eşleşiyor:
  `9db6cbd959c2ad427dc68b77b905edd0b8470431e3a3a9abebf0ee41a659d21a`.
- Media job **Published**, publication **ACTIVE**, generation **1**.
- Beklenen ve doğrulanan kaynak boyutu **9.518.772 bayt**, yükleme job ücreti
  **600.000 microUSDC / 0,60 test USDC**; bilet fiyatı **2 test USDC**.
- Creator `has_entitlement=true`; kalan USDC **0**, NEAR
  **0,0991650104625**. Önceki UNKNOWN_ACCOUNT durumu artık tarihsel.

**PROVIDER / mevcut gerçek tarayıcı:** UI “Publication ready” ve “İzleme hakkı
doğrulandı” gösterdi. Sayfada iki video bulundu: kaynak/kapak önizlemesi
**1920×1080**, asıl yayın oynatıcısı **1280×720**. İlk 1080p ölçümü yayın kalitesi
sayılmadı ve kullanıcıya bu ayrım açıklandı. Asıl oynatıcı süre **126,08 sn**,
readyState **4**, media error **null**; Play sonrası **88,242471 → 88,352312**,
paused=false, muted=false. Son örnek **104,779654 sn**, paused=true,
readyState=4 ve error=null; kullanıcı da oynatıcıyla etkileştiği için kesintisiz
izleme süresi iddiası yoktur. “Sorunsuz çalışıyor” kabulü kaydedildi.
Yeni izleme/cihaz anahtarı oluşturulmadı ve sayfa yenilenmedi.

UI'de ayrıca mevcut self-transfer tamamlanma hash'i
`F4FmuygAGpZfCZNfWVNovz6dVwDdshKXNLU6ZKGedwEi` ve USDC fonlama hash'i
`AkB46S3FkXoaNVxaLdsjnJPNHLnFqTMb4Q3Pkp2MxEtV` görüldü. Bu hash'lerin
makbuzları bu dar kontrolde açılmadı; geçmiş işlem yeniden gönderilmedi.
UI'nin “Google” etiketleri ortak lab metnidir. İşlem onayında kullanılan
passkey yönteminin provider ekranı agent tarafından gözlenmedi; oluşturulan
kimliğin yayın sahipliği ve gerçek creator oynatma sonucu doğrulandı.

**Kabul:** bu hesapta yükleme/yayın/creator izleme **PASS**. Tam V1 passkey
kapsamı **COMPLETED_WITH_WARNINGS**: bağımsız passkey tekrar girişi, başka bir
üreticinin videosunu satın alma, buyer izleme/reload ve tam ücret makbuzları
henüz doğrulanmadı. Production, mobil/Safari veya ikinci cihaz kabulü yoktur.

Yalnız bu rapor ve ana plan güncellendi. Doküman build PASS; mevcut bundle
boyutu uyarısı sürer. Kaynak değişmedi; unit/build/CI/deploy tekrarlanmadı.
Kanıt: `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/passkey-publication-check-nrx88f3k/`.
`chain.json` zincir sonucu, `playback.json` güvenli medya ölçümleridir.

**Tek devam gate'i: `NEAR_AUTH_V1_PASSKEY_ACCEPTANCE` — kalan satın alma/izleme
adımları.** Bu kontrol yeni bilet veya fonlama başlatma yetkisi değildir.

## Passkey ile ayrı bilet satın alma ve reload — 22 Eylül 2026

Kullanıcı sıradaki satın alma/izleme adımıyla devam edilmesini istedi.
Tek aktif gate `NEAR_AUTH_V1_PASSKEY_ACCEPTANCE`; kaynak/kontrat/provider
ayarları değiştirilmedi. Creator'ın kendi videosu yerine **Distance** seçildi:
`lp-b16e1bcb-e98e-4005-ade7-99c63bdb558b`, creator `29445f…2324c`.

### Bakiye ve tek işlem hazırlığı

- **15:33:34 UTC / final269762951:** fiyat **2 test USDC**, ACTIVE,
  satışlar açık, alıcı hakkı false; alıcı bakiyesi **0 test USDC /
  0,0991650104625 test NEAR**, USDC kaydı mevcut.
- Ek **0,03 test NEAR** ve **2 test USDC** aktarımı hazırlandı; cüzdanın son
  gönderimlerini kullanıcı yaptı. Meteor önce varlık yüklemede takıldı;
  boş form bir kez yenilendi, kullanıcı kilidi açtı, varlıklar yüklenince
  devam edildi. NEAR adımında utick, USDC adımında kullanıcı etkileşimi
  sonrasında soteri seçili görüldü; hash'ler yakalanmadığından bu UI gözlemleri
  kesin gönderen/ücret makbuzu diye sunulmaz.
- **15:38:58 UTC / final269763504:** alıcı **2 test USDC /
  0,1291650104625 test NEAR**. Tek bilet incelemesi gerçek UI'de alıcı
  `9db6cb…59d21a`, sponsor **soteri.testnet**, Distance ve **2 test USDC**
  olarak doğrulandı. Eski self-transfer kaydı incelenmedi/silinmedi.
- Kullanıcı biletin kimlik ve Meteor onaylarını yürüttü; ayrıca **“Evet,
  passkey ile onayladım”** diyerek kimlik onayında kullanılan yöntemi teyit etti.
  Ortak lab'deki eski “Google” düğme etiketleri bu kabulde giriş yöntemi sayılmadı.

### Satın alma ve gerçek medya sonucu

**PREVIEW / final zincir — 15:41:58 UTC**, blok **269763820**, hash
`G2dVLPj2izE1w3XJrHqtBym8fGwGPQEkErM1vKiPNNqD`:
Distance için alıcı `has_entitlement=true`, USDC **2 → 0**,
NEAR **0,128312990322741599999999**. Ayrı dış/iç işlem makbuzları, fonlama
hash'leri ve kesin sponsor maliyeti alınmadı. Final hak ve bakiye sonucu,
tam makbuz denetiminden ayrı kanıt olarak tutulur.

**PROVIDER / gerçek tarayıcı:** kullanıcı “Video başarıyla açıldı, oynuyor.
herhangi bir problem yok” dedi. Oynatıcı **1280×720**, süre **236,518449 sn**,
readyState **4**, muted=false ve error=null; konum **46,691835 sn**.
Bir sayfa yenilemesinden sonra aynı passkey kimliği/hak geri geldi ve
**Continue from 0:46** gösterildi. Devam düğmesiyle **46,713168 sn**,
paused=false, readyState=4 ve error=null görüldü. Son örnek **91,711929 sn**,
paused=true, readyState=4 ve error=null. Kullanıcı da oynatıcıyla etkileşti;
kesintisiz izleme süresi iddia edilmez. Yenileme yeni imza veya ödeme istemedi.

### Sonuç ve sınırlar

**COMPLETED_WITH_WARNINGS:** passkey için oluşturulan bağımsız kimlikte
creator yükleme/yayın/izleme ve ayrıca passkey onaylı buyer satın alma/izleme/
reload yolu çalıştı. Google ile hesap bağlama yapılmadı; yeni cihaz anahtarı
veya ikinci bilet ödemesi başlatılmadı. Kullanıcının passkey onayı teyidi,
WebAuthn/provider denetim kaydı yerine geçirilmez. Ayrı tam logout/login,
mobil/Safari, ikinci cihaz, uzun süreli oturum ve Production kabulü verilmedi.

Yalnız bu rapor ve ana plan güncellendi. Doküman build PASS; mevcut boyut
uyarısı sürer. Kod değişmedi; yerel kaynak testleri, CI ve deploy tekrar edilmedi.
Kanıt: `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/passkey-buyer-acceptance-byvy12p5/`.
Başlangıç, NEAR ekleme, fonlanmış bakiye, satın alma ve medya ölçümleri ayrı
JSON dosyalarında; ham token, credential veya özel anahtar yoktur.

**Tek sonraki önerilen gate: `NEAR_AUTH_V1_PRODUCT_FLOW_PREFLIGHT` — başlatılmadı.**
Doğrulanan cüzdan/Google/passkey yollarını ana uygulamanın giriş ve ödeme
arayüzüne taşımanın en küçük kapsamını belirlemek. Lab kabulü, ana uygulamada
özelliğin açıldığı veya Production'a çıkıldığı anlamına gelmez.
