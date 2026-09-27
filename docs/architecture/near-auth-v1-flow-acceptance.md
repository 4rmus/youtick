# V1 bağımsız giriş yolları — akış kabulü

Gate: `NEAR_AUTH_V1_FLOW_ACCEPTANCE`.
Tarih: 22 Eylül 2026. İlk kabul sonucu: **BLOCKED / tarihsel**.

**Güncel kabul:** `NEAR_AUTH_V1_FLOW_ACCEPTANCE` — **COMPLETED_WITH_WARNINGS**.
Ayrı Google alıcısında 2 test USDC kullanımı, Distance hakkı, gerçek 720p
oynatma ve reload sonrası erişim doğrulandı. Kullanıcının açık talimatıyla
bağımsız self-transfer denemesinin bilet yolunu kilitlemesi kaldırıldı;
eski kayıt okunmadı/silinmedi, bilet tekrar ödeme koruması korundu.
İlk sekmede kullanıcı hatası, tam işlem makbuzu ve bağımsız passkey kabulü
sınırları aşağıdaki son kayıtta ayrıdır.

**Önceki kaynak kapanışı (cihaz/bilet ayrımı):** `NEAR_AUTH_V1_FLOW_SOURCE` — **COMPLETED_WITH_WARNINGS**.
Üç kaynak engeli giderildi; 868 Web testi, 16 playback ve 18 UX senaryosu geçti.
Eksik gerçek Google/passkey satın alma/izleme kabulü henüz yapılmadı.
Tek sonraki gate yeniden `NEAR_AUTH_V1_FLOW_ACCEPTANCE`.

Mevcut cüzdan ve Google creator kanıtları korundu. İlk kabulde incelenen üç pilot
sınırı, Google/passkey ortak yolunun tekrarlı kullanım ve buyer playback
kabulünü engelliyordu; kaynak kapanışında düzeltildi. Hesap bağlama veya yöntemler
arası hak taşıma kapsam dışıdır. Eski sınırları tekrar üretmek için ödeme yapılmaz.

## İlk kabulün kapsamı ve ölçütleri

- Amaç: cüzdan, Google ve passkey yollarını ayrı değerlendirmek; giriş/imza,
  yükleme/yayın, satın alma/hak ve yetkili izleme kanıtlarını ayırmak.
- Her yolun kendi hesabıyla yükleme ve satın alma yapabilmesi, aynı geçerli
  cihazla sonraki işlemi yapabilmesi ve satın aldığı videoyu izleyebilmesi gerekir.
  Yöntemlerin aynı hesabı üretmesi veya bağlanması istenmez.
- Değiştirilebilir kaynaklar: bu rapor, `near-auth-integration-status.md` ve
  maliyet raporunun güncel sonraki gate referansı. Ana ajan tek yazardır.
- Uygulama/kontrat kodu, bağımlılıklar, bayraklar, provider/config, kullanıcı
  kayıtları, cüzdan/cihaz depoları ve Git index korunur. Canlı giriş, passkey
  kaydı, fonlama, imza, ödeme, upload, cihaz kaydı, CI veya deploy başlatılmadı.
- Yerel doğrulama `docs/testing.md` komutlarıyla mevcut testlerden seçildi.
  Tarayıcı kontrolü kullanıcı profilinden ayrı headless Brave bağlamındadır;
  Google, zincir, Bridge ve medya yanıtları sentetiktir.

## İlk kabulün kanıt matrisi — kaynak düzeltmesinden önce

| Yol | Giriş ve imza | Yükleme / yayın | Satın alma | İzleme / reload |
| --- | --- | --- | --- | --- |
| Mevcut NEAR cüzdanı | Önceki public-testnet cüzdan kabulü; güncel yerel wallet testleri geçti. | Gerçek yayın ve 2+2 kabulü önceki raporda; yeni upload yok. | Önceki iki hesapla gerçek satın alma kaydı; güncel normal USDC/payment recovery testleri geçti. | Önceki buyer/creator/reload kabulü korundu; bu gate yeni canlı medya çalıştırmadı. |
| Google | Önceki Google/MPC işlem kanıtı ve bu konuşmadaki ayrı Google giriş/anahtar kontrolü var. | Distance ücretli işi, Published/ACTIVE ve creator erişimi önceki raporlarda doğrulandı. | Kaynak/sentetik test var; gerçek buyer purchase kabul kaydı yok. İlk-cihaz ve tek-deneme sınırları mevcut. | Creator 720p/reload gerçek kabulü var. Buyer lab oynatıcısı mevcut kaynakta engelleniyor. |
| Passkey | Kullanıcı giriş ve imzaların çalıştığını bildirdi; hosted ekranda passkey seçeneği gözlendi. Ayrı imzalı işlem/hesap korelasyon kanıtı bu gate'te yok. | Uçtan uca provider/chain kabulü **UNPROVEN**; ortak NEAR Auth yolundaki pilot sınırları geçerli. | **UNPROVEN**; ortak ilk-cihaz/tek-deneme sınırları mevcut. | **UNPROVEN**; ortak lab buyer engeli mevcut. |

Tarihsel kanıt yeni canlı koşu sayılmadı. Cüzdan kanıtı
[public-testnet kabul kaydı §18 ve kapanışından](./public-testnet-video-v1-acceptance.md),
Google iş/yayın kanıtı [publication incelemesinden](./near-auth-publication-transient-error-review.md),
Google creator medya kabulü [playback/reload raporundan](./near-auth-creator-playback-reload-acceptance.md)
alındı. [Bilet kaynak raporu](./near-auth-ticket-purchase.md) gerçek satın almanın
çalıştırılmadığını açıkça kaydeder. Eski bakiyeler güncel bakiye sayılmadı.
Kullanıcı bildirimi korunur; bağımsız provider/chain kabulü yerine geçirilmez.

## Düzeltme öncesinde kabulü durduran üç pilot sınırı

### 1. Mevcut cihaz kaydı ikinci işlemi durduruyor

`apps/web/lib/near-auth-ticket-purchase.ts:102` herhangi bir mevcut cihaz
kaydında `ticket_first_device_only` döndürüyor.
`apps/web/lib/near-auth-upload-server.ts:105` aynı durumda
`upload_first_device_only` döndürüyor. Aynı geçerli cihazın kullanılması da
bu kontrollerin sonucunu değiştirmiyor.

Dolayısıyla birinci işlemde cihaz kaydı oluşturan kullanıcı, ardından başka
bilet veya yeni upload hazırlayamıyor. Bu eski ilk-cihaz pilot sınırıdır;
bağlama özelliğiyle ilişkili değildir. Mevcut sunucu testlerindeki
`rejects upload preparation: existing-device` ve
`rejects purchase preparation: existing-device` bu retleri doğruluyor.

### 2. Başarılı bilet kaydı sonraki bilet denemesini de kilitliyor

`apps/web/lib/near-auth-signing.ts:13` bilet deneme anahtarını hesap + Market
olarak oluşturuyor; yayın kimliği anahtarda yok. `runGoogleSigning` mevcut
kaydı koşulsuz engelliyor; başarı sonunda da aynı yerde `state: verified`
tutuluyor. `NearAuthSigning.tsx:31` kayıt varsa hazırlık düğmesini kapatıyor.

Mevcut istemci testi bir ayrı bilet denemesinin geçtiğini ve aynı kilit altında
yeniden çağrının reddedildiğini doğruluyor. Anahtar yayın kimliğini içermediği
için kaynak incelemesi başka bir biletin de aynı kilidi paylaşacağını gösteriyor.
Bu, zaten satın alınmış bileti yeniden ödeme korumasından daha geniştir.
Çözüm eski veya belirsiz kayıtları silmek değildir.

### 3. Hakkı olan buyer, creator olmadığı için oynatıcıya ulaşamıyor

`apps/web/components/NearAuthLab.tsx:105` medya ön kontrolü `entitled=true`
döndürse bile `publication.creator_id !== accountId` ise
`creator_playback_unavailable` hatası veriyor. Dolayısıyla yeni biletin
kontratta kabul edilmesi bu lab'de buyer playback'i açmaya yetmez.

Mevcut `near-auth-playback-browser-check.mjs` fixture'ında medya ön kontrolü
hak var yanıtı verir; `wrong-owner` senaryosunda yalnız yayın sahibi farklıdır.
15 senaryolu yerel koşu bu durumda oynatıcı açılmamasını doğruladı. Eski test
creator pilotunu koruduğu için PASS verir; bu sonuç buyer ürün kabulü değildir.

## İlk kabulde çalıştırılan doğrulamalar

| Kanıt | Kontrol | Sonuç |
| --- | --- | --- |
| LOCAL_TEST | `near-auth-signing-server`, `near-auth-signing-client`, `near-auth-upload-wallet`, `near-auth-media`, `near-auth-lab`, `near-auth-session`, `wallet-provider` | **7 dosya / 274 PASS** |
| LOCAL_TEST | `livepeer-publication`, `livepeer-watch`, `livepeer-playback-v2`, `near-auth-compact-flow` | **4 dosya / 54 PASS** |
| LOCAL_STATIC | `npm run test:near-auth-types` | **PASS** |
| LOCAL_TEST | `node scripts/near-auth-playback-browser-check.mjs` | **15 senaryo PASS**, sentetik medya/provider; gerçek cüzdan/imza/ödeme yok |

Toplam **328 unit/integration testi**, ayrıca **15 tarayıcı senaryosu**.
Tarayıcı koşusunda aynı dışarı aktarılamayan cihaz anahtarı, reload,
oturum bitmesi, yanlış cihaz ve yetkisiz durumlarda durma da kontrol edildi.
Mevcut Vite config uyarısı sürer. Testlerin geçmesi yukarıdaki bilinçli pilot
sınırlarını kaldırmaz. Yeni ekonomik işlem ve provider/HLS kabulü **EXTERNAL_NOT_RUN**.

Başlangıçtaki 427 dosyanın hash'leri ve index referansı geçici yerel kanıtta
tutuldu: `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-v1-acceptance-eo1s0txr/`.
Ham token, çerez, özel anahtar veya gerçek deneme kaydı okunmadı/temizlenmedi.

## Kaynak düzeltmesi ve kapanışı — 22 Eylül 2026

Gate: `NEAR_AUTH_V1_FLOW_SOURCE` — **COMPLETED_WITH_WARNINGS**.
Ana ajan tek yazardır. Kontrat, Bridge, paket, provider/config, bayrak, cüzdan
ve gerçek kullanıcı kaydı değişmedi. Yeni servis veya hesap bağlama eklenmedi.

1. **Aynı geçerli cihaz:** yükleme ve satın alma ortak kontrol kullanır.
   İlk cihaz yolu korunur. Mevcut kayıt varsa aynı final blokta
   `get_playback_device(account, requested_key)` okunur; anahtar, sertifika
   özeti, 30 günlük süre ve geçerlilik eşleşmeden devam edilmez. Farklı/eksik,
   süresi dolmuş, gelecekte başlayan veya bozuk cihaz reddedilir; kayıt silinmez.
   Kontrol mevcut prepare/authorize/complete çağrılarında yeniden çalışır.
2. **Bilet başına kayıt:** yeni anahtar hesap + Market + yayın içerir. Eski
   hesap-geneli kayıtlar aynen korunur; yalnız geçerli hash'leri olan `verified`
   kayıtlar başka bilet hazırlığını engellemez. Aynı bilet kaydı, diğer biletin
   pending/belirsiz kaydı, bozuk/boş kayıt, eksik verified alanı veya okunamayan
   storage yeni işlemi durdurur. Bu denetim cihaz hazırlığından önce ve sponsor
   isteğinden hemen önce yapılır; mevcut Web Lock ve sunucu hak/nonce kontrolleri
   korunur. Eski kayıtlar taşınmaz veya temizlenmez.
3. **Buyer playback:** lab'de creator olma koşulu kaldırıldı. Oturum, NEAR hakkı,
   yayın kimliği/generation/durum ve mevcut cihaz kontrolleri korunur. Hak sahibi
   buyer ortak oynatıcıyı açabilir; stranger açamaz. Satın alma başarı mesajı
   mevcut video hakkı kontrolü düğmesine yönlendirir; yeni ödeme istemez.

Değişen kaynaklar:

- `apps/web/lib/near-auth-ticket-purchase.ts`, `near-auth-upload-server.ts`,
  `near-auth-signing.ts`, `near-auth-upload-wallet.ts`.
- `apps/web/components/NearAuthLab.tsx`, `NearAuthSigning.tsx`.
- `apps/web/__tests__/unit/near-auth-signing-server.test.ts`,
  `near-auth-signing-client.test.ts`.
- `apps/web/scripts/near-auth-playback-browser-check.mjs`,
  `near-auth-ux-browser-check.mjs`.
- Bu rapor, ana entegrasyon planı ve maliyet raporunun sonraki gate referansı.

### Kaynak doğrulaması

Yeni regresyonlar düzeltmeden önce **7 başarısız test** verdi. Sonraki koşuda
iki test beklentisi güncellendi: yeniden kullanılabilir cihazın UI metni ve
gövdesiz health sorgusunun fixture kaydından ayrılması. UX kontrolündeki eski
"ilk cihaz" başarı metni de yeni cihaz tekrar kullanımına uyarlandı.

| Kanıt | Kontrol | Sonuç |
| --- | --- | --- |
| LOCAL_TEST | Web tüm unit/integration suite | **48 dosya / 868 PASS** |
| LOCAL_TEST | Gerçek React/V3 kodu, sentetik provider ile ayrı Brave playback | **16 PASS**; buyer + reload ve stranger reddi dahil |
| LOCAL_TEST | Gerçek UI/upload istemcisi, sentetik ödeme/medya ile ayrı Brave UX | **18 PASS**; iptal, süre, pending/reload, bilet ve upload dahil |
| LOCAL_STATIC | Auth tip kontrolü ve Web lint | **PASS** |
| LOCAL_STATIC | Ayrı kopyada Web production build | **PASS**, aşağıdaki uyarılarla |

Build, kullanıcı ortam dosyaları kopyalanmadan ve çalışan `.next` çıktısına
dokunmadan ayrı dizinde çalıştı. İlk deneme zorunlu public kontrat ayarları
verilmediğinden sayfa toplamada durdu; repodaki Web CI'nin kapalı bayrakları ve
`market.testnet` / `access.testnet` değerleriyle tekrar build geçti.
Mevcut middleware/webpack ve Auth0/Next Edge API uyarıları sürer; bu yerel build
Cloudflare veya Production runtime kabulü değildir.

Başlangıç 428 kaynak/index referansı ve izole build:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-v1-flow-source-vbqmqxt4/`.
Son UX kanıtı: `tmp/near-auth-ux-run-AXwleP/`.

**Sınırlar:** süresi dolmuş/farklı cihazın otomatik değiştirilmesi eklenmedi;
bilinmeyen ödemeler otomatik yeniden denenmez. Yerel deneme kilidi tarayıcı
profili kapsamındadır; farklı profiller için yeni bir dağıtık kilit kurulmadı.
Sunucu ve kontratın ekonomik/hak otoritesi değişmedi. Gerçek Google/passkey,
ödeme, fonlama, upload, cihaz aktivasyonu, HLS, CI/deploy ve Git yayını
**EXTERNAL_NOT_RUN**. Kaynak blocker'ı yok; eksik canlı kabul **UNPROVEN**.

**Tek sonraki gate: `NEAR_AUTH_V1_FLOW_ACCEPTANCE`.** Mevcut başarılı canlı
kanıtlar kullanılacak; yalnız eksik gerçek adımlar için hesap, dosya/yayın,
tutar ve limitler hazırlanacak. Bu kaynak kapanışı yeni ekonomik işlem
başlatmaz. Eski belirsiz denemenin uzlaştırması ayrı korunur.

## Yeniden canlı kabul hazırlığı — 22 Eylül 2026

Gate: `NEAR_AUTH_V1_FLOW_ACCEPTANCE` — **BLOCKED / imza kaydı ve bakiye hazırlığı**.
Yalnız bu rapor ve ana plan güncellenir; kaynak, kontrat, provider/config,
cihaz anahtarları, deneme kayıtları ve Git index korunur.

### Kullanıcı kararı ve güncel hedef

Kullanıcı ilk kez satın alan ayrı Google hesabıyla **Distance** biletini test
etmeyi seçti. Önceki öneri olan Distance creator hesabıyla başka yayın satın
alma ve onun için hesaplanan fonlama artık aktif işlem planı değildir.
Hesap bağlama yoktur. Google giriş → hesap/bakiye hazırlığı → tek bilet →
izleme/reload hedeflenir. Bağımsız passkey kabulü henüz çalıştırılmadı.

### Doğrulananlar

- İlk popup girişleri zaman aşımına uğradı. Ardından ayrı Google hesabı,
  daha sonra Distance creator hesabı doğrulandı. Creator hesabında mevcut
  cihaz kontrolü geçip Distance oynatıcısı açıldı; bu yeni buyer kabulü değildir.
- Son kullanıcı girişinde **PROVIDER / localhost:** “Deneme girişi başarılı”
  görüldü. Taze “NEAR hesabını kontrol et” çağrısı
  `38aa1132e0400378a721898abba6229f3735c0ae1c5f68ac8bc2022736a2902d`
  hesabının anahtarını doğruladı. Bu hesap Distance sahibinden farklıdır.
- **PREVIEW / testnet zincir okuması:** 22 Eylül 2026 **11:37:39 UTC**,
  FINAL **269738476**, hash `A7zJtoc9HmqnB54BZcFwdpwgJfLvrf8pvgy2dpRep9aw`.
  Alıcı hesabı mevcut, **0,1 test NEAR / 0 test USDC**; USDC storage kaydı
  `null`. Önceki 11:22 kontrolünde hesap yoktu; kullanıcı etkileşimleri
  sonrasında artık mevcut. Fonlama işleminin hash'i ve göndereni doğrulanmadı.
- Hedef `lp-b16e1bcb-e98e-4005-ade7-99c63bdb558b` / **Distance**:
  ACTIVE, generation 1, **2 test USDC**. Creator
  `29445f46f23551e48c99869c2e34e3acb283902db8196da32cb3f6625872324c`;
  yeni alıcının `has_entitlement=false` sonucu aynı final blokta doğrulandı.

### Bekleyenler ve sınırlar

Arayüzün ayrı “Google ile imza denemesi” bölümünde **utick.testnet** sponsoruyla
başlatılmış bir deneme kaydı ve tekrar gönderim kilidi görüldü. Kaydın sonucu
henüz uzlaştırılmadı; bu uyarı tek başına pending veya başarısız işlem kanıtı
sayılmaz. Kayıt silinmedi, yeni imza/ödeme başlatılmadı. Önceki soteri tercihi
bu yeni görünen işlemin göndereni veya sponsoru olarak varsayılmadı.

Ayrıca kullanıcı tarafından açılmış `utick-distance` yükleme taslağı ve
`lp-7f8f98e8-d62c-4a5e-b55d-32110eda9467` bağlantısı görüldü. Aynı final blokta
`get_media_job` sonucu `null`; bu sonuç ayrı imza denemesinin durumunu açıklamaz.
İlk salt-okunur sorguda yanlış yöntem adı MethodNotFound döndürdü; kaynakta
bulunan `get_media_job` ile doğru okuma yapıldı. Taslak korunur, tekrarlanmaz.

Satın alma öncesinde imza kaydı uzlaştırılmalı, USDC kaydı açılmalı ve bilet
bakiyesi hazırlanmalıdır. Alıcının mevcut 0,1 NEAR bakiyesi, satın alma
kontrolünün storage rezervi sonrası istediği **0,12 test NEAR** eşiğinin
altındadır. Yeni hesap için kesin fonlama paketi henüz hazırlanmadı; eski
creator hesabı için hesaplanan tutarlar buna otomatik uygulanmaz.

**EXTERNAL_NOT_RUN:** bu kabulde agent tarafından yeni fonlama, imza, satın
alma veya upload başlatılmadı. Gerçek buyer HLS/reload, ayrı passkey işlemi,
CI/deploy ve Git yayını yok. Kullanıcının aradaki işlemleri tümüyle
uzlaştırılmış değildir. Önceki 868/16/18 kaynak testleri tekrar edilmedi.

Yerel kanıt dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-v1-live-acceptance-ua9zh5nt/`.
Son zincir okuması `new-buyer-check.json` içindedir. Token, çerez, subject veya
özel anahtar okunmadı. Doküman build kontrolü geçti; mevcut boyut uyarısı sürer.

**Tek devam gate'i: `NEAR_AUTH_V1_FLOW_ACCEPTANCE`.** Hesap kontrolü PASS;
tüm akışın kabulü, mevcut imza kaydı ve bakiye hazırlığı nedeniyle henüz açık.

## Kullanıcı yetkisiyle bakiye hazırlığı — 22 Eylül 2026

Kullanıcı mevcut ayrı hesapla bakiye hazırlama, Distance bileti satın alma
ve izlemeyi deneme talimatı verdi; ayrı imza denemesinin araştırılmasını
istemedi. Bu araştırma ilerletilmedi. Deneme kaydı silinmedi ve uygulamanın
tekrar ödeme koruması değiştirilmedi; satın alma hazırlığındaki gerçek sonuç
ayrı değerlendirilecek.

- **PROVIDER:** Circle faucet, Near Testnet ve
  `38aa1132e0400378a721898abba6229f3735c0ae1c5f68ac8bc2022736a2902d`
  için tek **20 test USDC** talebini “Tokens sent” mesajıyla kabul etti.
  Bu bir bakiye/işlem kesinleşmesi kanıtı değildir; ikinci talep gönderilmedi.
  Token adresi [Circle kaynağıyla](https://docs-w3s-node-sdk.circle.com/variables/chains.NEAR_TESTNET.html)
  eşleşiyor.
- **PREVIEW / zincir:** **11:46:55 UTC**, final **269739469**:
  USDC **0**, storage `null`. Önceki **269739293** okumasında NEAR **0,1**.
  USDC gelişi henüz doğrulanmadı. `faucet-after.json` ve
  `faucet-followup.json` önceki kanıt dizinindedir.
- NEAR musluğunda **0,03 test NEAR** formu hesap/tutar doğrulamasını geçmedi;
  bu formdan gönderim yapılmadı. Soteri cüzdanıyla mevcut hesaba ek NEAR
  aktarımı hazırlamak için Meteor açıldı. Cüzdan **utick.testnet** seçili ve
  kilitliydi; kullanıcıdan kilidi kendisinin açması, soteri hesabına geçmesi
  veya utick kullanacağını belirtmesi istendi. Şifre alınmadı.
- Distance bilet sayfası ayrı sekmede açıldı; aynı Google oturumu geri geldi
  ve izleme hakkı olmadığı gösterildi. Mevcut upload taslağı korunuyor.
  Sponsor seçimi/bilet hazırlama/onay/gönderim henüz yapılmadı.

**Güncel sonuç: BLOCKED / cüzdan kilidi ve kesinleşmiş bakiye bekleniyor.**
Tek devam gate'i `NEAR_AUTH_V1_FLOW_ACCEPTANCE`. Satın alma ve alıcı izleme
henüz **EXTERNAL_NOT_RUN**; eski imza kaydı otomatik olarak başarısız veya
başarılı sayılmadı. Yalnız bu rapor ve ana durum belgesi değişti; kaynak,
provider/config, Git index ve kullanıcı deneme kayıtları korunur.

## Bakiye kesinleşmesi ve bilet hazırlığı

- Kullanıcı Meteor kilidini açtı. Soteri hesabı seçilip yalnız **0,03 test NEAR**
  aktarımı hazırlandı; kullanıcı gönderimi tamamladığını bildirdi.
  `DeDpkKYRiymrxpJRDnmyoQqiSkGhKSCEvcuv1AH44udM` RPC sonucu **FINAL / SuccessValue**;
  signer `soteri.testnet`, receiver `38aa11…2902d`, tek Transfer
  **30000000000000000000000 yoctoNEAR**. Final **269740179**: alıcı NEAR **0,13**.
- Circle talebinin USDC bakiyesi hâlâ sıfırken, kullanıcı talimatı kapsamında
  Meteor'da **2 test USDC** gönderimi hazırlandı. Gönderen soteri, doğru USDC
  kontratı ve alıcı inceleme ekranında kontrol edildi. Sonraki cüzdan ekranında
  soteri USDC **29,98 → 27,98**; ayrı işlem hash'i yakalanmadı.
- **PREVIEW / zincir, 11:55:45 UTC:** final **269740442**, hash
  `HeBjA7zx3kXUCYzVw1u3owRCYyTEwV5h4oX3qmXUx9oH`:
  alıcı **2 test USDC / 0,13 test NEAR**; USDC storage total
  **1250000000000000000000 yoctoNEAR**, available **0**. Bakiye ve kayıt hazır.
  Bu 2 USDC, Circle'ın 20 USDC talebinin tamamlandığı anlamına gelmez.
- Distance bilet bölümünde “Sponsor cüzdanını seç ve işlemi hazırla” başlatıldı.
  Meteor Web App bağlantısı açıldı; yeni pencere ayrıca kilit istedi.
  Soteri bağlantısını tamamlaması kullanıcıya bırakıldı. Henüz bilet imzası,
  Google işlem onayı veya satın alma gönderimi yok; eski kayıt silinmedi.

Kanıt: aynı geçici dizindeki `near-topup-final.json` ve `buyer-funded.json`.
**Güncel durum: DEVAM EDİYOR.** Bakiye hazır; sponsor bağlantısı ve gerçek bilet
hazırlığı sonucu bekleniyor. Buyer izleme/reload henüz çalıştırılmadı.

## Fonlama sonrası satın alma hazırlığı sonucu

Kullanıcı yeni Meteor penceresinde soteri bağlantısının tamamlandığını bildirdi.
Distance bilet bölümü, Google onayı/işlem incelemesi oluşmadan
“Hazırlık veya Google onayı tamamlanamadı. Hesap, bakiye, satış durumu, ilk cihaz
koşulu veya onay süresi kontrollerinden biri geçmedi.” mesajını gösterdi.
**Sonuç: BLOCKED / satın alma hazırlığı reddedildi.** Bakiye/kayıt önceki final
okumada yeterli; bu denemede Google işlem onayı veya bilet gönderimi başlamadı.

Kesin ret kodu bu arayüzden görülmüyor. Kaynakta eski hesap-geneli imza kaydı
satın alma hazırlığını durdurabilen kontrollerden biridir; bunun bu hatanın
kesin nedeni olduğu iddia edilmez. Yalnız sabit kayıt için güvenli boolean
okuma denenirken tarayıcı tanı ortamında `localStorage` bulunmadığı anlaşıldı;
`record_unreadable` tanı aracının sonucu olup kullanıcı kaydının bozuk olduğuna
kanıt değildir. Ham kayıt alınmadı; eski imza sonucu araştırılmadı ve kayıt
silinmedi. Cihaz anahtarı değiştirme, koruma atlama veya tekrar ödeme yapılmadı.

**Sonraki tek önerilen gate: `NEAR_AUTH_V1_FLOW_SOURCE`.** Hazırlık reddinin
sabit ve güvenli hata kodunu görünür kılıp doğrulanan nedeni düzeltmek;
fonlama tekrarlanmadan aynı mevcut bakiye ile sonraki kabul sürdürülebilir.
Bu kaynak gate'i başlatılmadı. Satın alma/hak ve alıcı izleme kabulü açık.

## Hazırlık tanısı kaynak düzeltmesi — 22 Eylül 2026

Gate: `NEAR_AUTH_V1_FLOW_SOURCE` — **COMPLETED_WITH_WARNINGS**.
Ana ajan tek yazardır. Amaç, hazırlık reddinin güvenli nedenini göstermek ve
kanıtlanan iletişim hatasını düzeltmektir. Aynı gate içinde yeni ücretli kabul,
fonlama, provider/config, kontrat, bağımlılık, bayrak veya Git yayını yoktur.

### Bulgu ve en küçük düzeltme

Sunucunun güvenli hata listesi bilet hazırlık nedenlerini kapsamıyordu;
isteme gelen bilinen nedenler yalnız upload aşamalarında korunuyordu.
Arayüz ise istemcinin `signing_already_started` kontrolünü de genel
“hesap/bakiye/ilk cihaz” mesajıyla örtüyordu. Ayrıca bilinen kayıt engeli
kullanıcı cüzdan bağladıktan sonra gösteriliyordu.

- Mevcut kayıt kontrolü aynı kararları koruyarak sabit bir ret kodu da döndürür.
  Kayıt engeli `signing_already_started`, storage erişim hatası
  `signing_storage_unavailable` olarak ayrılır. Bozuk JSON hâlâ engeldir;
  tarayıcı arızası veya tamamlanmış ödeme diye yorumlanmaz.
- Hak sorgusunun doğruladığı alıcı hesabı bilet bileşenine aktarılır. Yerel
  kayıt engeli render sırasında, cüzdan açılmadan gösterilir. Sunucu/son imza
  kontrolleri ve kilit korunur; kayıt yazımı veya temizliği eklenmez.
- Hazırlık hataları Türkçe açıklama ve yalnız izin verilen sabit kodlarla
  gösterilir. Bilet bakiyesi/kayıt, NEAR bütçesi, cihaz ve satış koşulları
  birbirinden ayrılır. Bilinmeyen hata metni, JWT, kimlik veya provider içeriği
  kullanıcıya/loga aktarılmaz. Yeni hata sınıfı, servis veya kurtarma sistemi yok.

### Gerçek sayfadan salt-okunur teşhis

Açık Distance bilet sekmesi kaynak güncellemesini aldığında düğme devre dışı
kaldı ve **Kontrol kodu: signing_already_started** gösterildi. Storage erişim
hatasını ayrılaştıran son kaynakta da aynı kod kaldı. Bu, mevcut hesap/bilet
kayıt kontrolünün şu anda hazırlığı durdurduğunun kanıtıdır; eski ekonomik
sonucu, hangi kayıt anahtarının engel olduğunu veya pending/verified durumunu
tek başına kanıtlamaz. Ham storage, cookie, token veya özel anahtar okunmadı.
Yeni cüzdan bağlantısı veya hazırlık/ödeme denemesi yapılmadı.

Önceki hata mesajını gizleyen kod sorunu giderildi. **Canlı satın alma engeli
kaldırılmadı:** uygulamanın mevcut güvenlik koşulu hâlâ sağlanmıyor. Kullanıcının
eski imza araştırmasını ilerletmeme isteği korundu; kayıt silinerek veya
koruma gevşetilerek satın alma açılmadı. Bu sonuç satın alma PASS değildir.

### Doğrulama ve değişen dosyalar

- Yeni regresyonlar önce **9 FAIL** verdi; düzeltmeden sonra tüm Web suite
  **48 dosya / 880 PASS**. Route testleri sabit bilet kodlarının korunmasını ve
  özel metinlerin elenmesini; istemci testleri erken engeli, kayıt korumasını
  ve storage hatasının ayrı açıklamasını kapsar.
- **LOCAL_TEST:** ayrı headless Brave'de **20 UX senaryosu PASS**. Yeni senaryolar
  eski kayıtla cüzdan/imza açılmamasını ve USDC ret mesajını kontrol eder.
  İlk koşudaki tek hata eski “Tekrar gönderim kapalı” metin beklentisiydi;
  mevcut koruma ve sayaç doğrulamaları tutulup yeni sabit kodla güncellendi.
- **LOCAL_STATIC:** auth tip kontrolü ve Web lint PASS. Doküman build PASS;
  mevcut bundle boyutu uyarısı sürer. Web production build, playback-only
  harness, CI/deploy ve yeni zincir/medya kabulü çalıştırılmadı.
- Kaynaklar: `near-auth-lab.ts`, `near-auth-signing.ts`, `NearAuthSigning.tsx`,
  `NearAuthLab.tsx`; signing istemci/sunucu testleri ve UX tarayıcı script'i.
  Bu rapor ve ana entegrasyon planı güncellendi. Diğer kaynaklar ve index korundu.
- Manifest/lockfile/kurulu paketler eşleşiyor: near-api-js **7.3.0**, Auth0 SPA
  **2.26.0**, jose **6.2.12**, Next **16.3.3**. Sürüm yükseltilmedi.

Başlangıç dosya/index referansı ve kaynak kopyaları:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-v1-prepare-source-i_6sjfm4/`.
Son UX kanıtı: `tmp/near-auth-ux-run-Hsp4Pr/`.

**Tek sonraki gate: `NEAR_AUTH_V1_FLOW_ACCEPTANCE`.** Canlı kaydın engeli açık
olarak taşınır; tekrar fonlama gerekmez. Bu kapanış kaydı yeni ödeme veya
eski kayıt üzerinde değişiklik yetkisi oluşturmaz.

## Kullanıcı kararı sonrası ayrı bilet yolu ve gerçek alıcı izleme

Gate: `NEAR_AUTH_V1_FLOW_ACCEPTANCE` — **COMPLETED_WITH_WARNINGS**.
Kullanıcı “mevcut kaydı kontrol etme, sonucu boşver devam et” talimatını
tekrarladı. Önceki kaynak değişikliği yalnız tanı eklediği için aynı engelle
kabul döngüsüne dönmek yeterli değildi. Bu talimat kapsamında en küçük kaynak
ayrımı aynı aktif gate içinde yapıldı; yeni bir servis/kurtarma akışı eklenmedi.

### Amaç bazında kilit ayrımı

`near-auth-signing.ts` içindeki bilet kontrolü artık bağımsız **1 yoctoNEAR
self-transfer demo** anahtarının değerini okumaz. Demo kaydı ve demo yolunun
kendi kilidi aynen durur. Aynı bilet kaydı, eski Market bilet kaydı, başka
biletin belirsiz kaydı, okunamayan storage, son anda yeni bilet kaydı ve
sunucunun taze nonce/hak/bakiye kontrolleri korunur. Eski demo sonra gönderilirse
aynı nonce için yarış oluşabilir; sunucu/zincir nonce kontrolleri bunu başarısız
işlem olarak ele alır. Otomatik yeniden gönderim eklenmedi.

İstemci testleri demo kaydını okumadan bilet hazırlama/tek satın alma,
eski kaydın değişmemesi, aynı biletin ikinci kez gönderilmemesi ve demo
tekrarının hâlâ engellenmesini doğrular. Eski bilet/pending fixture'ları
bilet anahtarına taşındı; koruma testleri silinmedi. UX senaryosu da eski
demo kaydı varken ayrı bilet akışını, eski bilet kaydı varken engeli kapsar.
**LOCAL_TEST: 48 dosya / 882 PASS; 20 UX senaryosu PASS. Tip/lint PASS.**
UX kanıtı `tmp/near-auth-ux-run-VvK2uA/`.

### Gerçek satın alma ve izleme kanıtı

- Gerçek bilet düğmesinin açıldığı görüldü; tek bilet hazırlığı ve Meteor Web
  App bağlantısı başlatıldı. Kullanıcı Google/Meteor onay akışında da işlem
  yaptı. Bu sırada eski sekmeye araç erişimi koptu; ham onay payload'ı alınmadı.
- **PREVIEW / zincir:** 22 Eylül **12:20:00 UTC**, final **269742997**,
  hash `BpdCPRYpk8dJPfnoo2ex2vqVbPgnJvq6L6RoHMF2SsDE`:
  `38aa11…2902d` alıcısının Distance hakkı **false → true**, USDC **2 → 0**,
  NEAR **0,13 → 0,129154069481146399999999**. Bunlar mevcut satın alma
  sonucunun final durum kanıtıdır. Ayrı işlem hash'i, outer/inner receipt ve
  sponsor maliyeti yakalanmadı; bakiye farkı kesin makbuz ücreti diye sunulmaz.
- Kullanıcı ilk sekmede hata gördüğünü ve oynatıcının açılmadığını bildirdi.
  Kesin hata metni yakalanmadı. Aynı profil/oturum/cihazla ayrı bir sekmede
  aynı Distance bağlantısı açıldı; yeni ödeme veya cihaz kaydı yapılmadı.
- **PROVIDER / gerçek medya:** yeni sekmede hak ve cihaz kontrolü geçti.
  Video hazır: **236,467 saniye**, **1280×720**, readyState **4**,
  error **null**. Play sonrası **0,110236 → 21,851327 saniye**, paused=false.
- **Reload:** bir yenileme sonrası Google oturumu/hak geri geldi ve
  **Continue from 0:20** gösterildi. Kullanıcı da oynatıcıyla etkileşti;
  80 saniyede readyState=1 örneğinden sonra 45,507601 saniyede **readyState=4,
  paused=false, 1280×720, muted=false, volume=1, error=null** ölçüldü.
  Seek nedeniyle bu örnekler kesintisiz izleme süresi olarak sayılmaz.
- Sonuç: ayrı Google alıcısının satın aldığı Distance videosunu aynı mevcut
  cihazla açması/oynatması ve reload sonrası erişimi doğrulandı. İlk sekmedeki
  geçici hatanın kök nedeni çözülmüş sayılmaz. Kullanıcı son sekmede
  “Evet, görüntü ve ses düzgün” diyerek gerçek izlemeyi ayrıca kabul etti.

### Kapanış sınırları

Eski demo işlemi araştırılmadı, kaydı değiştirilmedi; yeniden fonlama veya
ikinci bilet ödemesi yapılmadı. Production, mobil/Safari, ikinci cihaz,
bağımsız passkey yükleme/satın alma ve uzun süreli oturum kabulü verilmedi.
Hesap bağlama V1 dışındadır. Bu sonuç bütün V1 yollarının eksiksiz kabulü değildir.

Değişenler: `apps/web/lib/near-auth-signing.ts`, signing istemci testi, UX
script'i, bu rapor ve ana entegrasyon planı. Kontrat/provider/config, bayrak,
bağımlılık, diğer kaynaklar ve Git index korunur. Doküman build PASS;
mevcut bundle boyutu uyarısı sürer. CI/deploy veya Git yayını yoktur.

Kanıt dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-v1-acceptance-recheck-87r9mziw/`.
`check.json` başlangıç, `purchase-observed.json` final hak/bakiye,
`playback-observed.json` güvenli medya ölçümleridir.

**Tek sonraki gate: `NEAR_AUTH_V1_PASSKEY_ACCEPTANCE` — başlatılmadı.**
Bağımsız passkey hesabında kalan gerçek V1 akışı; bu kapanış yeni fonlama,
yükleme veya satın alma yetkisi değildir.
