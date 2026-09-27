# Google hesabıyla manuel video yükleme denemesi

> Tarihsel kaynak gate'i kaydıdır. Buradaki localhost erişim engelinden sonra,
> 16 Eylül 2026 yerel runtime kontrolünde Bridge OPTIONS yanıtı 204 kaydedildi.
> Bu, bugünkü erişimi yeniden doğrulamaz. Güncel değerlendirme ve sonraki adım:
> [entegrasyon durumu](./near-auth-integration-status.md).

Gate: `NEAR_AUTH_GOOGLE_UPLOAD_SOURCE` — **COMPLETED_WITH_WARNINGS**.
16 Eylül 2026. Kod ve yerel testler tamamlandı. Gerçek manuel yükleme
**BLOCKED**: kapalı localhost lab'i canlı Bridge'in izinli adreslerinden değil.

## Kullanıcı kararı ve dosya

Kullanıcı yeni videoyu Google hesabıyla yüklemek istedi. Dosya seçimi,
yüklemeyi başlatma, Google ve cüzdan imzaları kullanıcı tarafından yapılacak.
Agent dosyayı tarayıcıya seçmedi, hiçbir imza/ödeme veya upload başlatmadı.

- Dosya: `/Users/arair/Desktop/youtick/Soterii - Distance.mp4`
- Boyut: **9.452.298 bayt**; süre: **236,495238 saniye**.
- Görüntü: **1920×1080, H.264**; ses: **AAC, 44.100 Hz, stereo**.
- SHA-256: `cbbb9ffacab55e8a9890d887330491941f9a9e099934fb9df52f0031d2e43a47`.
- `ffprobe` metadata okuması ve `ffmpeg -v error -xerror ... -f null -`
  tam çözümleme kontrolü PASS. Dosya değiştirilmedi/dönüştürülmedi.
  Bu Livepeer işleme veya gerçek oynatma kabulü değildir.

Mevcut kaynak tarifesinde bu dosyanın upload bedeli 0,5, Bridge sponsor
bedeli 0,1; toplam **0,6 test USDC** olur. Bu hesap güncel imzalı teklif
değildir. Google MPC imzasını karşılayan ayrı sponsor cüzdanının sınırı
**0,35 test NEAR**; son gerçek tutar cüzdanda ayrıca incelenmelidir.
Video başlığı/fiyatı ve hak beyanını kullanıcı formda belirler.

## Uygulanan bağlantı

- NEAR Auth'un `delegateAction` onayı kullanılır. Mevcut v7 korunur; yeni SDK,
  yeni paket veya kontrat değişikliği yok. Biletin doğrudan transfer yolu
  yüklemeye zorla uygulanmadı.
- Mevcut `LivepeerPaidUploadForm` hesap bağlantısını dışarıdan alabilecek
  küçük bir iç bileşene ayrıldı. Normal WalletProvider yolu aynen bu bileşeni
  kullanır. Kapalı lab'de Google hesabı ayrı bir bağlantı olarak verilir;
  eski cüzdanın hesap adresi video sahibi yapılmaz.
- Kullanıcı sponsor seçip formu açar; dosya seçimini ve `Pay and upload`
  düğmesini kendisi kullanır. Google onayından önce dosya boyutu, başlık,
  hesaplar, USDC bedeli, sponsor bütçesi, cihaz ve kimlik görünürlüğü gösterilir.
- Sunucu yalnız tek `create_paid_job` içeren `ft_transfer_call` isteğini
  kabul eder. Başka alıcı, method/gas/deposit, ek alan/eylem, değişmiş hesap,
  cihaz sertifikası veya ücret kabul edilmez. Nonce, son blok ve süre sınırları
  sunucuda üretilir; istemciden serbest imzalanacak byte dizisi alınmaz.
- Mevcut imzalı upload teklifinin yapı, ücret, hash ve süre kontrolleri
  paylaşılır. Quote'un kriptografik doğrulaması ve gerçek ödeme öncesi son
  kabulü mevcut Bridge/Market yolunda kalır; yerel quote parser'ı tek başına
  quote imzasını kriptografik doğrulamış gibi sunulmaz.
- Aynı final blokta işin henüz olmaması, satış/Bridge durumu, token adresi,
  token kayıtları/bakiye, quote sürümü ve ilk cihaz şartı kontrol edilir.
  Bu pilot mevcut raw cihaz kaydı varsa durur; cihaz silme/eviction yoktur.
- Google onayı, doğru subject/audience/client/scope ve NEP-461 öneki dahil
  tam delegate baytlarıyla eşleştirilir. MPC işlemi FINAL olmadan ve dönen
  Ed25519 imzası bu baytların SHA-256 özetiyle doğrulanmadan proof verilmez.
- Sponsor gönderiminden önce ve MPC cevabından sonra nonce, bakiye, iş,
  cihaz ve teklif geçerliliği tekrar kontrol edilir. Quote en fazla 120 saniye
  geçerlidir; gecikmede daha fazla ücret/deposit ile otomatik tekrar yoktur.
- Doğrulanan signed delegate mevcut uploader'a döner. Aynı uploader proof'u
  saklar, mevcut Bridge relay'i kullanır, zincirdeki aynı ücretli işi doğrular
  ve aynı job ile TUS/lease/yayın durumunu izler. Provider URL'si veya ham
  token yeni bir genel API üzerinden dışarı verilmez.
- Her upload job için ayrı tek-deneme MPC kilidi vardır. Belirsiz sponsor
  cevabı, timeout veya sayfa yenilemesinde ikinci MPC ücreti başlatılmaz.
  İmza tokenı ve özel anahtar bu kilit kaydına yazılmaz. Bu tarayıcı profiline
  ait lab korumasıdır; dağıtık tekilleştirme değildir.
- Eksik token kaydı için otomatik storage ödeme veya kayıp upload anahtarı
  için otomatik key replacement eklenmedi. Normal upload yollarındaki
  mevcut devam etme davranışı korunur; desteklenmeyen Google işlemi durur.

Resmî dayanaklar: [NEAR Auth delegate action rehberi](https://docs.auth.near.org/home/guides/sign-transactions),
[sabitlenmiş JavaScript Provider](https://github.com/Peersyst/fast-auth/blob/38dc894afbc94c198c207f52e6d01d695199eaa1/packages/providers/javascript/src/provider.ts).
Mevcut kurulu JS Provider 1.4.1 / Browser SDK 1.4.2 deneme paketleriyle ve
v5/v7 gerçek encoder'larıyla çevrimdışı byte eşitliği ayrıca sınandı.
Bu, gerçek Auth0/MPC delegate kabulü yerine geçmez.

## Değişen dosyalar

- `apps/web/lib/near-auth-lab.ts`
- `apps/web/lib/near-auth-signing-server.ts`
- `apps/web/lib/near-auth-upload-server.ts` (yeni)
- `apps/web/lib/near-auth-upload-wallet.ts` (yeni)
- `apps/web/lib/livepeer-upload.ts` (mevcut quote parser export'u)
- `apps/web/app/api/auth-lab/signing/route.ts`
- `apps/web/components/LivepeerPaidUploadForm.tsx`
- `apps/web/components/NearAuthUpload.tsx` (yeni)
- `apps/web/components/NearAuthLab.tsx`
- `apps/web/__tests__/unit/near-auth-signing-server.test.ts`
- `apps/web/__tests__/unit/near-auth-upload-wallet.test.ts` (yeni)
- `apps/web/__tests__/unit/near-auth-lab.test.ts`
- `docs/architecture/near-auth-ticket-purchase.md`
- Bu rapor ve `tmp/near-auth-google-upload/evidence/` yerel kayıtları.

Kontratlar, Bridge kodu, release kuralları, WalletProvider, paketler,
secret/config ve feature flag varsayılanları değiştirilmedi. Mevcut kirli
dosyalar, tarayıcı/cüzdan profili, cihaz ve ücretli iş kayıtları korundu.
Port 3000'deki mevcut sunucu/oturum yeniden başlatılmadı.

## Doğrulama

- `LOCAL_TEST`: **42 dosya / 628 test PASS**. Gerçek RSA/JWE/Ed25519 ve
  v7 delegate üretimi; dış servis/cüzdan cevapları sentetik. Mevcut bilet ve
  kendine transfer testleri ortak imza kodunun ayrılmasından sonra da geçti.
- `LOCAL_TEST`: kurulu Provider'ın gerçek request metodu `delegateAction`
  parametresi ve `transaction:sign` scope'u üretiyor. V5/v7 delegate ve signed
  delegate baytları, güvenli tamsayı sınırını aşan sentetik nonce dahil eşit.
  SDK'nın her beyan edilen type'ı runtime constructor değildir; signed delegate
  için gerçek encoder'ın kabul ettiği düz veri nesnesi kullanıldı.
- `LOCAL_STATIC`: sıkı auth tip kontrolü, lint ve Web build PASS. Mevcut
  middleware adlandırma uyarısı sürer. Build canlı Edge/deploy kabulü değildir.
- `LOCAL_TEST`: production modunda lab/upload flag'leri açık olsa bile yeni
  `prepare-upload`, `authorize-upload`, `complete-upload` istekleri **404**;
  çerez üretilmedi. Canlı production kanıtı değildir.
- `PROVIDER` (salt okunur): Bridge `/__health` 200, sürüm
  `d8772f95-cb15-46ab-b66f-076eea01cac8`; quote/relay/newUploadReady true.
  Mozilla User-Agent ile aynı quote endpoint'ine OPTIONS:
  `http://localhost:3000` → **403 / origin_denied**;
  `https://public-testnet.youtick.net` → **204**, aynı allow-origin.
  İlk Python varsayılan User-Agent ölçümü her iki origin'de 403 verdi;
  bu ilk ölçüm tek başına origin sebebine kanıt sayılmadı ve ayrı saklandı.
- `EXTERNAL_NOT_RUN`: gerçek Google delegate onayı, sponsor ücreti, Bridge
  quote POST/relay, yeni cihaz, provider asset/TUS upload, yayın/oynatma,
  CI, commit/push/PR ve deploy. Yeni ekranın gerçek tarayıcı kabulü yapılmadı.

Kanıt: `sdk-delegate.json`, `production-closed.json`, `origin-preflight.json`,
`source-file.json`, `result.json`; hepsi yukarıdaki yerel kanıt klasöründe.

## Engel ve tek sonraki gate

Canlı manuel yükleme henüz başlatılmamalı. İki hazırlık eksik:

1. Yerel lab doğru public-testnet kontratları/Bridge ve kapalı-varsayılan
   upload flag'leriyle henüz çalıştırılmadı; mevcut runtime korunuyor.
2. Canlı Bridge localhost'u reddediyor. Ayrıca
   `scripts/release-metadata.mjs` HTTPS origin normalizasyonu ve
   `validatePublicTestnetConfig` içindeki **ALLOWED_ORIGINS = public Web origin**
   şartı nedeniyle tek bir ortam değişkeni eklemek yeterli değildir.

Tek sonraki gate: **`NEAR_AUTH_LOCAL_TESTNET_ACCESS_SOURCE`**. Yalnız
public-testnet için, mevcut `https://public-testnet.youtick.net` korunarak
tam `http://localhost:3000` adresine isteğe bağlı dar lab erişimini kaynakta
ve release testlerinde hazırlamak. Wildcard, başka localhost portları,
127.0.0.1, Preview veya Production gevşetmesi olmamalı. Varsayılan origin
listesi değişmemeli. Origin sahteleme veya yerel proxy ile kontrol atlama yok.

Bu öneri bu gate'te uygulanmadı. Sonrasında exact değişiklik/test paketiyle
canlı config ve korumalı workflow deploy'u ayrıca onaya sunulmalı;
`AGENTS.md` bu işlemlerde açık kullanıcı onayı gerektiriyor. Yayın izni
tamamlanmadan kullanıcıdan ücretli denemeyi başlatması istenmez.
Brave çökmesi araştırması kullanıcının kararıyla ertelenmiş kalır.

Kullanıcının devam talimatıyla dar erişim kaynak gate'i tamamlandı:
[NEAR_AUTH_LOCAL_TESTNET_ACCESS_SOURCE](./near-auth-local-testnet-access.md).
Bu kayıt canlı izin verildiği veya upload başlatıldığı anlamına gelmez.
