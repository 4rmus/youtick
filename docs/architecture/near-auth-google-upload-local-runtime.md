# Google upload yerel runtime ön kontrolü

> Tarihsel hazırlık kaydıdır. Buradaki 0 USDC gözleminden sonra, 16 Eylül 2026
> blok 268880300 kontrolünde aynı Google hesabında 600000 mikro test USDC ve
> aynı taslak için ücretli iş bulunmadığı kaydedildi. Bu eski bakiye yeni ödeme
> öncesi kontrol yerine geçmez. Güncel değerlendirme:
> [entegrasyon durumu](./near-auth-integration-status.md).

Gate: `NEAR_AUTH_GOOGLE_UPLOAD_LOCAL_RUNTIME_PREFLIGHT` — **BLOCKED**.
16 Eylül 2026. Teknik hazırlık PASS; yeni Google girişi/sponsor seçimi ve
Google hesabının test USDC hazırlığı bekleniyor. Ödeme veya upload yapılmadı.

## Kapsam ve kullanıcı kontrolü

Kullanıcı yerel ekranın hazırlanmasına devam edilmesini istedi. Dosya seçimi,
yüklemeyi başlatma ve bütün Google/cüzdan imzaları kullanıcıya bırakıldı.
Brave'de mevcut diğer sekmeler korunarak `http://localhost:3000/auth-lab`
yeni sekmede açıldı. Giriş ekranı görüldü; giriş/onay düğmelerine basılmadı.

Başlangıçta port 3000'de sunucu yoktu. Önceki launcher oturum secret'ını
bellekte ürettiğinden eski sunucunun oturumu geri alınamadı. Yeni secret
yalnız yeni server sürecinin belleğinde üretildi; token/çerez/private key
dosyaya veya rapora yazılmadı. Kullanıcı yeniden Google girişi yapmalı.

## Yapılanlar ve değişen dosyalar

- `tmp/near-auth-google-upload-runtime/serve.mjs`: önceki korumalı yayının
  doğrulanmış public-testnet artifact config'inden yerel başlatıcı.
  Yalnız `127.0.0.1:3000` dinler; kullanıcı origin'i `http://localhost:3000`.
  Market/Access/Bridge gerçek public-testnet adresleri; üç gerekli upload/V2
  flag'i yerel süreçte açık. Derived read model, NEAR ücret yolu, playback
  shadow ve çok varlıklı ödeme yerel süreçte kapalı kalır.
- `apps/web/next.config.ts`: yalnız development + açık lab + testnet için
  mevcut OpenNext yerel Cloudflare bağlamı başlatılır.
- `apps/web/__tests__/unit/near-auth-dev-runtime.test.ts`: beş izin/ret koşulu.
- Bu rapor; `tmp/near-auth-google-upload-runtime/evidence/` içindeki kayıtlar.

İlk hedef yalnız launcher/rapordu. Gerçek HTTP kontrolde bulunan 503 kök
nedeni nedeniyle iki dar kaynak yolu kapsama eklendi ve kullanıcıya bildirildi.
Kapsam dışı uygulama dosyaları, cüzdan/cihaz depoları ve önceki değişiklikler
korundu. Canlı config, Cloudflare Worker, kontrat, D1 veya provider ayarı
değiştirilmedi. Commit/push/PR/deploy yapılmadı.

### Yerel RPC 503 nedeni

`/api/near-rpc`, `NEAR RPC rate limit unavailable` ile 503 döndü. Normal
Next dev başlangıcı Cloudflare rate-limit binding'lerini başlatmıyordu.
Proxy'nin fail-closed kontrolü doğru çalıştı; bu kontrol gevşetilmedi.

Mevcut `initOpenNextCloudflareForDev` ile Wrangler'daki `preview` adlı
binding şeması **yerelde** kullanıldı. `remoteBindings:false`, `persist:false`:
Preview servisi dağıtılmadı veya onun verileri kullanılmadı. Bu seçim yalnız
yerel istek sınırı bileşenlerini sağlar. Ağ testnet seçimi launcher'daki gerçek
public-testnet değerlerinden gelir. Production, mainnet veya kapalı lab'de
başlatma yapılmadığı test edildi.

## Kanıt

- `LOCAL_TEST`: **43 dosya / 633 test PASS**. Yeni config/RPC odaklı 24 test
  PASS. `npm run test:near-auth-types`, lint ve Web build PASS.
  Production build lab flag açıkken de yerel emülatörü başlatmadı.
  Mevcut middleware adlandırma uyarısı sürer; canlı Edge kabulü değildir.
- `LOCAL_TEST` (yerel runtime): yerel giriş sayfası 200; Brave giriş UI'sı
  görüldü. Anonim upload-signing isteği **401**, başka origin **403**.
  Düzeltmeden sonra aynı-origin RPC üzerinden gerçek Market yönetim sorgusu
  **200**; `bridge_frozen=false`, `new_purchases_paused=false`.
- `PROVIDER`: Bridge quote endpoint'ine localhost Origin ile salt okunur
  OPTIONS **204**, allow-origin tam `http://localhost:3000`.
- `PROVIDER`: önceki başarılı Google işlemi
  `CfXjRkCa5XBaTNC8RWpbDVm3aBQ8iQuVFZzhvXPFGkkM` göndereni üzerinden
  final blok **268867803**'te hesap kontrolü. Bu yeni tarayıcı oturumunun
  seçili kimliği veya sponsor hesabı yerine geçmez.

| Önceki doğrulanmış Google hesabı | Sonuç |
|---|---|
| Hesabın anahtarı | FullAccess |
| NEAR bakiyesi | 0,0991650104625 test NEAR |
| Test USDC bakiyesi | 0 |
| Test USDC storage kaydı | Yok |
| Sözleşmenin storage minimumu | 0,00125 test NEAR; ağ gideri hariç |
| İlk cihaz raw kaydı | Yok; ilk cihaz pilotu koşuluyla uyumlu |
| Market token adresi | Beklenen test USDC ile eşleşiyor |
| Bridge / yeni satın alma | Dondurulmamış / açık |
| Kaynak sınırı / süre | 5.000.000.000 bayt / 24 saat |

Dosya halen kullanıcı tarafından seçilecek `Soterii - Distance.mp4`.
Önceki dosya kontrolü 9.452.298 bayt, 236,495238 saniye ve 1080p idi.
Mevcut kaynak ücret hesabı toplam 0,6 test USDC gösterir; bu gate'te imzalı
quote alınmadı. MPC sponsor bütçesi 0,35 test NEAR'dır. Sponsor hesabı
seçilmediği için onun bakiyesi veya ücret yeterliliği iddia edilmez.

- `UNPROVEN`: yeni gerçek Google oturumu, seçilmiş sponsor ve onun bakiyesi,
  gerçek upload formunun giriş sonrası kabulü, ücretli yükleme ve oynatma.
- `EXTERNAL_NOT_RUN`: storage registration, NEAR/USDC fonlama, quote POST,
  sponsor/MPC imzası, relay, cihaz kaydı, upload, CI/deploy.
- Kullanıcıya yalnız giriş/sponsor seçimi istendi; dosya seçmemesi ve
  `Pay and upload` adımına henüz geçmemesi belirtildi.

## Kalan tek adım

Aynı gate'te kullanıcı yeni Google girişini ve sponsor seçimini tamamlar;
seçtiği sponsor hesabını bildirir. Hesap eşleşmesi ve sponsor bakiyesi
salt okunur doğrulanır. Sonrasında gerekli USDC kayıt/fonlama işlemleri için
tam hedef, tutarlar ve ağ gideri sınırı kullanıcıya sunulmalı.

0,00125 NEAR yalnız storage minimumudur; toplam işlem bütçesi değildir.
USDC kaydı ve en az upload bedelini karşılayan bakiye olmadan kullanıcı
yüklemeye yönlendirilmez. Otomatik storage deposit, transfer, tekrar ödeme
veya upload yapılmaz. Bütün gerçek imzalar ve dosya yükleme kullanıcıda kalır.

## Kullanıcının “hazır” bildirimi sonrası kontrol

Brave'de başarılı giriş durumu ve Google hesabına bağlı yükleme formu görüldü.
Kullanıcı `Soterii - Distance.mp4` dosyasını, `Near Auth Test` başlığını ve
2,00 USDC bilet fiyatını seçmişti. Eski self-transfer panelinde
`utick2.testnet` sponsor olarak yazıyor; upload formu kendi sponsorunu
göstermediğinden bunun yeni upload seçimi olduğu varsayılmadı ve kullanıcıya
soruldu. Eski imza kilidi kaldırılmadı veya tekrar denenmedi.

Port 3000'de sunucu/launcher kalmadığı görüldü. Ekrandaki başarı durumu tek
başına canlı oturum kabulü sayılmadı. Aynı yerel launcher bu kez ayrı bir
arka plan süreci olarak başlatıldı; sonraki bağımsız kontrollerde parent PID 1
ve HTTP 200 doğrulandı. Yeni bir işletim sistemi başlangıç servisi kurulmadı.
Secret yine yalnız süreç belleğinde; önceki kapanmış sunucunun secret'ı
geri getirilemediği için yeniden giriş gerekiyor. Browser sonrasında bağlantı
hatası gösterdi; çalışan sunucu doğrulandıktan sonra yalnız bu hata sayfası
yenilendi ve giriş ekranı görüldü. Cüzdan/cihaz depoları silinmedi.

Salt okunur yeni kontrol:

- Final blok 268870408: Google hesabı 0,0991650104625 test NEAR, **0 USDC**,
  USDC storage kaydı yok. Storage minimumu yine 0,00125 test NEAR.
- Final blok 268870616: eski imza panelinde görülen aday sponsor hesabı
  yaklaşık **2,795140889 test NEAR ve 3,8 test USDC** içeriyor. Yeni upload
  sponsoru olduğu henüz doğrulanmış sayılmaz.
- Satış/Bridge durumu açık. Quote, transfer, storage deposit, imza ve upload
  başlatılmadı. Kaynak kodu değiştirilmedi ve önceki 633 test yeniden
  çalıştırılmış gibi sunulmadı.

Kanıtlar: `ready-browser-observation.json`, `ready-account-read.json`,
`visible-sponsor-read.json`, `server-process.json`. Gate halen BLOCKED:
sponsor seçiminin teyidi ve Google hesabının kayıt/test USDC hazırlığı bekleniyor.

## “Check payment options” bakiye hatası

Kullanıcının bildirdiği mesaj `creator_fee_balance_or_gas_insufficient`
dalından geliyor. `prepareCreatorFeePaymentOptions` yükleme sahibinin
bakiyesini okuyor; sponsor cüzdanının USDC bakiyesini kullanmıyor.
Bu dosyada minimum 0,50 USDC upload + 0,10 USDC relay bedeliyle toplam
0,60 test USDC aranıyor. Sponsorlu USDC seçiminde Google hesabının normal
NEAR gas rezervi şartı atlanıyor; mevcut hatanın nedeni onun 0 USDC bakiyesi.
Mesajın “USDC and NEAR” ifadesi bu ayrımı kullanıcıya yeterince açıklamıyor.

Final blok **268871860**: UI'daki Google sahibi için 0 USDC, USDC storage
kaydı yok, NEAR bakiyesi 0,0991650104625. UI'daki taslak
`lp-85827ca5-1d4a-4ce5-9dc4-814cac141d1d` için `get_media_job=null`;
bu taslak henüz zincirde ücretli işe dönüşmemiş. Başlık artık kullanıcının
seçtiği `social login test video`, bilet fiyatı 2,00 USDC. Dosya aynı.

Tek sonraki hazırlık: doğrulanmış Google hesabının USDC storage kaydı ve
en az 0,60 test USDC bakiyesi. Storage minimumu önceki okumada 0,00125 test
NEAR idi; gerçek imzadan önce yeniden okunmalı, ağ giderleri ayrıca hesaba
katılmalı. Seçilen gönderen ve kesin bütçe belirlenmeden transfer yapılmaz.
Bu tanıda kaynak kodu değişmedi; test/CI/deploy, ödeme veya upload çalışmadı.
Kanıt: `evidence/payment-options-diagnosis.json`. Aynı taslak korunur.
