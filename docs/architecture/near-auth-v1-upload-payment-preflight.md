# NEAR Auth V1 — ürün yükleme ödeme ön kontrolü

Gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_PREFLIGHT`.
23 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Öneri:** mevcut ücretli yükleme formunu, dar delegate adaptörünü ve Bridge
upload relay'ini koru. Ürün oturumunu özel MPC göndericisine bağla; imzadan
sonra aynı ücretli job'ı doğrulayan kalıcı tamamlanma adımını ekle. Yeni
cüzdan, ödeme motoru veya ikinci medya yükleme yolu gerekli değil.

Bu ön kontrol yalnız bu rapor ve ana planı değiştirir. Kaynak, flag/env,
anahtar, tarayıcı, taslak ve geçmiş işlem kayıtları korunur. Yeni teklif,
fonlama, imza, ödeme, upload, provider değişikliği, CI veya deploy yapılmadı.
Kabul ölçütü: kaynak eksikleri, protokol sınırı, tekrar koruması ve sonraki
source gate'inin dosya/test kapsamının belirlenmesi. Bu ölçüt karşılandı;
ürün upload kabulü henüz yok.

## Mevcut akış ve eksikler — LOCAL_STATIC

| Sınır | Kaynaktaki durum | Gereken dar değişiklik |
| --- | --- | --- |
| Ana uygulama | `LivepeerPaidUploadForm.tsx:126` NEAR Auth kimliğinde formu kapatıyor. Lab `NearAuthUpload` aynı form içeriğini kullanıyor. | Ürün Google/passkey kimliğine dar adaptör ver; genel wallet yoluna düşme. Sponsor kullanıcıya seçtirilmez. |
| İmza adaptörü | `near-auth-upload-wallet.ts` lab account/signing API'sine ve pinned Meteor sponsoruna bağlı. Taslak, cihaz, tutar, iptal ve tek deneme kontrolleri var. | Bu korumaları ürün session/account ve private MPC prepare/submit/status akışında koru; key replacement kapalı kalsın. Lab davranışını bozma. |
| Sunucu incelemesi | `prepareGoogleUpload`, `readUpload`, `authorizeGoogleUpload` ürün alanını destekliyor; `completeGoogleUpload` yalnız lab ve süresi geçmemiş incelemeyi kullanıyor. | Ürün completion, kalıcı operation'ın exact payload/imza/job bağı üzerinden çalışmalı; eski incelemeyi yeni gönderim yetkisine dönüştürme. |
| Private MPC | `submitProductMpc(..., 'upload', ...)` mevcut; Bridge compact delegate bytes, hesap, hedef, miktar, imza ve nonce doğruluyor. Ürün upload HTTP yolu yok. | Bilet API'sinin origin/session/body allowlist ve private binding deseninde dar upload yolu. Lab secret/clientId fallback yok. |
| Ekonomik kilit | `MpcStatus` yalnız ticket için terminal durum içeriyor. `submitMpc` hesap kilidini yalnız `TICKET_SETTLED` sonrası bırakıyor. Upload `MPC_VERIFIED` seviyesinde kalır. | Aynı job'ın zincir kanıtıyla doğrulandığı upload terminal durumu. İmza, tarayıcı bildirimi veya relay HTTP 202 kilit açmaya yetmez. |
| İç ödeme ve medya | `authorizeLivepeerPaidJob` → `signAndRelaySponsoredUpload` → `/v1/sponsored-upload-relays` → zincirde job → mevcut TUS/processing/publication. Relay kendi kalıcı nonce/hash/alarm mekanizmasına sahip. | İkinci relay kurma. İmza ve job bilgisini mevcut yola bağla; MPC kaydını bu sonuçla salt-okunur uzlaştır. |

Kaynak dayanakları: `apps/web/lib/near-auth-mpc-sponsor.ts`,
`near-auth-upload-server.ts`, `near-auth-upload-wallet.ts`, `livepeer-upload.ts`,
`apps/web/app/api/auth/ticket/route.ts`,
`protocol/paid-media-livepeer-v1/mpc-sponsor.ts`,
`workers/livepeer-bridge/src/mpc-sponsor.ts` ve `index.ts`.

Manifest/lock/kurulu paket karşılaştırması: `near-api-js` manifest `^7.0.3`,
lock ve kurulu **7.3.0**; Auth0 SPA **2.26.0**, jose **6.2.12**. SDK yükseltmesi
önerilmiyor. Kurulu SDK'nın `buildDelegateAction` / `encodeDelegateAction` /
`encodeSignedDelegate` ve Bridge'in `actions.signedDelegate` yolu incelendi.

## Protokol 87 — taze PROVIDER okuması ve kaynak değerlendirmesi

23 Eylül 2026 **12:21:59 UTC**, `https://rpc.testnet.near.org` salt-okunur
final blok sorgusu:

- Blok: **269886740**; hash `AqX1R6Hb4sZ7izyjfZnEL9TJa5vqWazeUi6R8z8LxNh4`.
- Protokol **87**; gas price `100000000`, minimum gas purchase price
  `1000000000`, storage byte bedeli `10000000000000000000` yocto.
- Toplam receipt input sınırı `4194944` bayt; receipt storage proof sınırı
  `4000000` bayt. Bunlar gerçek işlem başarısı kanıtı değildir.

Web `checkSigningAccount` ve Bridge `signingHead` 87'yi yalnız **ticket**
için kabul ediyor. Upload bugün önce Web'de `budget_not_verified`, Bridge'e
doğrudan ulaştırılsa `mpc_provider_changed` ile durur. Mevcut red güvenli;
bu gate koşulları gevşetmedi.

[nearcore 2.14.0-rc.1 resmî notları](https://github.com/near/nearcore/releases/tag/2.14.0-rc.1)
`DelegateV2` kaldırılmasını bildiriyor; legacy `Delegate` gas-key signer'ı
zaten reddediyor. Mevcut yol Ed25519 FullAccess anahtarı ve tek
`ft_transfer_call` kullanıyor, gas key / DelegateV2 / WithdrawFromGasKey
kullanmıyor. Bu nedenle kaldırılan özellik doğrudan bu kod yolu değil.
Bu çıkarım canlı upload uyumluluğu kanıtı değildir. Aynı sürüm delegate imza
doğrulamasının compute hesabını receiver shard'a taşıyor; gas reward kaldırma,
receipt/proof ve contract-load hata sınırları da korunması gereken etkilerdir.

Sonraki source adımı 85/87'yi yalnız incelenmiş upload bağlamında kabul etmeli;
demo ve bilinmeyen sürümleri genişletmemeli. Outer MPC 300 Tgas, inner FT
100 Tgas/1 yocto, FullAccess/nonce, bütçe ve final receipt kontrolleri korunur.
Yeni hata türleri başarı sayılmaz. Yeni gerçek relay maliyeti veya bütçenin
yeterliliği bu okumadan hesaplanamaz; ayrıca gerçek kabul gerekir.

## İmza, ödeme ve toparlanma sözleşmesi

1. Dosya seçimi ve kullanıcı başlatması sonrası mevcut taslak/anahtar güvenliği
   kontrol edilir. Aynı account/job için eski belirsiz deneme varsa yeni key,
   quote veya MPC isteğinden **önce** mevcut kayıt okunur. Lab kayıtları
   silinmez ve ürün işlemi gibi otomatik yeniden gönderilmez.
2. Sunucu aktif ürün kimliği, cihaz, exact compact payload, job, dosya boyutu,
   başlık, bilet fiyatı, imzalı quote, hesap/storage/USDC ve sponsor bütçesini
   kontrol eder. Kullanıcı gerçek toplam ücreti kendi Google/passkey onayıyla
   kabul eder. Sponsor hiçbir zaman creator olmaz.
3. Gönderimden önce operation/job/payload bağı kalıcı olmalı. Cevap kaybı veya
   reload sonrası aynı hesabın private status'u aynı operation'ı bulmalı.
   JWT ve private key tarayıcı/durable kayda ya da loglara eklenmez.
4. `MPC_VERIFIED` yalnız exact delegate imzasıdır. Mevcut uploader bu imzayı
   saklayıp mevcut relay'e verir. Browser kapandıysa yeniden onay yerine
   saklanan imza ve job durumu okunur. İlk relay gönderimi hâlâ taze quote,
   nonce ve block-height ister; süre dolduğunda yeni quote/imza otomatik yok.
5. Relay 202, `accepted`, outer başarı veya boş job tek başına ödeme sonucu
   değildir. Mevcut relay `BROADCAST` kaydı aynı hash'i sorgular; bazı başarı
   yollarında kaydı silip `tx_hash: null` döndürür. Dolayısıyla completion'ın
   yalnız bu geçici kayda/hash'e bağlı tasarlanmaması gerekir. Kalıcı MPC
   payload'ından türetilen job/account/ücret/başlık/profil/anahtar bağları ve
   gerekli cihaz/ödeme kanıtları doğrulanmalı; tutarsız sonuç kilidi açmamalı.
6. Job kesinleşince MPC ekonomik kilidi upload terminal durumuyla kapanır;
   operation ve kanıt korunur. TUS, medya işleme ve yayın ayrıca takip edilir.
   Yayın başarısızlığı yeni upload ücreti veya MPC imzası başlatmaz.

Status/uzlaştırma, gönderim bayrakları kapalıyken çalışmalı; status yeni relay
veya imza gönderemez. Süresi dolmuş review ile **geçmiş** sonucu okumak ile
yeni ödeme yetkilendirmek ayrıdır. Gönderilmiş hash belirsizse rezerv ve kilit
otomatik bırakılmaz; güvenli durum/manuel uzlaştırma gösterilir.

## Ücret ve canlı kabul sınırı

Mevcut kaynak formülü mikro USDC olarak
`max(500000, ceil(sourceBytes × 3 / 10000)) + 100000`.
İlk kalem medya ücreti, ikinci kalem mevcut upload relay sponsor bedelidir.
Küçük dosyada toplam **0,60 test USDC**; boyuta bağlıdır. Bilet fiyatı ayrı
ve en az **2 test USDC**'dir; upload sırasında ayrıca bilet alınmaz.

MPC dış isteğinin **0,35 test NEAR** işlem tavanı bu USDC kalemiyle aynı şey
değildir. Bilet kabulünün harcama izni ve günlük rezervi upload'a taşınmaz.
Gerçek kabul öncesi Google/passkey hesapları, bakiye/storage, cihaz, dosya,
exact ücret, sponsor limiti ve relay/provider hazırlığı taze kontrol edilir.
Bu gate kişisel bakiyeleri, mevcut runtime bayraklarını veya provider sağlığını
yeniden doğrulamadı; kapalı bayrak bilgisi önceki kapanış raporunun kanıtıdır.

## Tek sonraki gate ve kabul testleri

**`NEAR_AUTH_V1_UPLOAD_PAYMENT_SOURCE` — başlatılmadı.**

Değişebilir kapsam: `LivepeerPaidUploadForm.tsx`; mevcut dar upload adaptörü
ve gerekirse ürün istemcisi; `near-auth-upload-server.ts`,
`near-auth-mpc-sponsor.ts`, `near-auth-signing-server.ts`; yeni dar
`apps/web/app/api/auth/upload/route.ts`; ortak `mpc-sponsor.ts` DTO;
Bridge `mpc-sponsor.ts`, `mpc-entrypoint.ts` ve yalnız gerekli `index.ts`
bağlama noktası; ilgili mevcut testler, gerekirse izole runtime runner ve
tip kontrolü dosya listesi. Genel wallet değişimi ve paralel uploader yok.

Kaynak gate'inde kontrat/ABI, bağımlılık, kalıcı env/wrangler/secret,
fonlama, gerçek gönderim, deploy ve CI/GitHub kapsam dışı. Ürün upload için
ayrı kapalı gönderim kontrolü gerekir; bilet bayrağı upload yetkisi sayılmaz.

- 87 legacy delegate doğru bytes/domain ile kabul; bilinmeyen protokol,
  gas key, yanlış nonce/action/1 yocto/gas ve bozuk payload reddi.
- Yanlış origin/session/hesap, lab review, fiyat/quote/job/cihaz değişimi,
  expired onay ve yetersiz bakiye/bütçe gönderimden önce durur.
- Paralel tıklama, submit cevabı kaybı ve restart tek outer işlem üretir;
  MPC imzası ödeme tamamlandı sayılmaz. Aynı job/payload korunur.
- MPC sonrası browser kapanması, relay 202/kayıp cevap, kesinleşmiş job,
  expired review/quote ve flag-off status ayrı doğrulanır. Yeni ödeme yok;
  terminal job ekonomik kilidi açar, belirsiz/yanlış job açmaz.
- Taslak/sentinel ve key koruması, iptal/logout/cihaz değişimi, eski lab
  belirsiz kaydı, wallet yolu ve ticket regresyonları geçer.
- Mevcut Web/Bridge testleri, auth tip kontrolü ve uygun native runtime
  kontrolü uygulanır. Sentetik sonuç gerçek zincir/provider kabulü değildir.

## Bu gate'in doğrulaması

`docs/testing.md` komutlarının odaklı kullanımı:

- **LOCAL_TEST:** Web upload-wallet, signing-server, compact-flow ve
  livepeer-upload: **241 PASS / 4 dosya**; Bridge mpc-sponsor: **35 PASS**.
  Bunlar mevcut korumaları sınar; eksik ürün upload entegrasyonunu kanıtlamaz.
- **LOCAL_TEST:** auth tip kontrolü PASS; doküman build PASS. Mevcut
  500 kB bundle uyarısı ve Web test aracının config-loader geçiş uyarısı var;
  test/build hatası yok. Tam Web/Bridge, Rust ve browser paketleri yeniden
  çalıştırılmadı; kod değişmedi.
- **PROVIDER:** yalnız yukarıdaki taze final blok/protokol/config okuması.
- **EXTERNAL_NOT_RUN:** imza/fonlama/ödeme/upload, gerçek Google/passkey
  upload, Livepeer yayın/oynatma, CI/Preview/Production/deploy.
- **UNPROVEN:** protokol 87 ücretli upload'ın gerçek kabulü, ürün recovery
  ve terminal kilit entegrasyonu, hosted binding ve yeni hesap onboarding'i.

Ön kontrolü durduran engel yok. Ürün upload'ını açmaya engel olan kaynak
eksikleri sonraki source gate'ine ayrıldı. Mevcut kullanıcı değişiklikleri
korundu; commit/push yapılmadı.
