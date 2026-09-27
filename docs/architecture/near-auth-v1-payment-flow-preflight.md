# NEAR Auth V1 — ana uygulama ödeme ön kontrolü

Gate: `NEAR_AUTH_V1_PAYMENT_FLOW_PREFLIGHT`.
22 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Öneri:** mevcut USDC bilet ve upload akışlarını koru; Meteor'da kullanıcıya
seçtirilen MPC imza sponsorunu mevcut Bridge içindeki sınırlı bir göndericiye
taşı. Web kimliği ve kullanıcı onayını doğrulasın; Bridge yalnız izin verilen
imza isteğini, sınırlı bütçeyle bir kez göndersin. İlk source adımı bu eksik
altyapıdır; aynı anda kart, yeni cüzdan SDK'sı ve genel ödeme motoru kurulmaz.

Bu gate yalnız bu raporu ve ana planı değiştirir. Kabul: kullanıcı akışı,
güven sınırı, tekrar koruması, bütçe/fonlama ayrımı, uygulanacak dosyalar ve
sonraki tek gate somuttur. Kaynak, ayarlar, gerçek hesaplar, ödeme, eski işlem
kayıtları, CI/GitHub ve deploy değişmez. Kaynak bulguları LOCAL_STATIC'tir.

## Kullanıcı akışı

1. Kullanıcı cüzdan, Google veya passkey kimliğiyle giriş yapar. Giriş kendi
   başına fonlama veya harcama oluşturmaz; hesaplar birbirine bağlanmaz.
2. Videoda **Satın al**, yüklemede **Yükle** seçer. Sunucu mevcut aktif kimlik,
   yayın/job, fiyat, bakiye ve cihaz durumunu doğrular. Zaten hakkı varsa İzle açılır.
3. Eksik bakiye/hesap kaydı varsa yalnız gereken hazırlık gösterilir. Bilet
   bedeli ve ağ gideri aynı şeymiş gibi sunulmaz; sponsor cüzdanı seçtirilmez.
4. Kullanıcı başlık, alıcı/creator hesabı ve tutarı görüp kendi Google/passkey
   ekranında o işlem için onay verir. Arka plan göndericisi kullanıcı imzasının
   yerini almaz; yalnız MPC isteğinin zincire gönderim giderini üstlenir.
5. Aynı işlem takip edilir. Bilette kesinleşmiş NEAR hakkı → oynatma;
   upload'da ücretli job → mevcut TUS/işleme/yayın. Timeout yeni ödeme değildir.

Ana uygulamadaki cüzdan yolu aynen çalışır. NEAR Auth için genel `getWallet()`
taklidi yerine mevcut dar ticket/upload adaptörleri bağlanır. İmza sponsoru
hiçbir zaman aktif kullanıcı, video sahibi veya bilet alıcısı yapılmaz.

## Kaynak bulguları

| Alan | Bugünkü durum | Gerekli değişiklik |
| --- | --- | --- |
| `near-auth-signing.ts` / `NearAuthSigning` | Sponsor Meteor seçilir; dış MPC isteği ondan, imzalı bilet işlemi tarayıcıdan gönderilir. | Sponsor kullanıcı girdisi olmaktan çıkar; product session ile hazırlanmış işleme ait sunucu statüsü izlenir. |
| `near-auth-signing-server.ts` | Tam transaction/claim/nonce/hesap/fiyat/receipt kontrolleri var; review anahtarı ve azp kontrolü lab ayarına bağlı. | Saf doğrulama yardımcılarını ürün oturumu/inceleme alanına açık parametrelerle ayır. Lab secret veya clientId ürün için örtülü fallback olmasın. |
| `near-auth-upload-wallet.ts` / `near-auth-upload-server.ts` | Yalnız upload delegate'ini destekleyen adaptör; MPC sonrası mevcut uploader ve Bridge relay kullanılır. | Bu adaptörü koru; sponsor cüzdanı yerine dar iç gönderici bağla. İkinci upload sistemi kurma. |
| Bridge `LivepeerControl`, sponsor relay | Kalıcı kayıt, atomik nonce ayırma, hash ve gönderim durumu deseni mevcut. `fast-auth.testnet/sign` için hazır gönderici yok. | Aynı Worker/DO altyapısında ayrı MPC kapsamı ve nonce alanı. Upload relay'inin kayıtları ve anahtar yetkisi gelişigüzel genişletilmez. |
| `LivepeerWatch`, `LivepeerPaidUploadForm` | Ana uygulama NEAR Auth ödemelerini bilinçli kapalı tutuyor. | Arka plan gönderici doğrulandıktan sonra ilgili dar yolu bağla. UI düğmesini açmak tek başına entegrasyon değildir. |
| `near-auth-funding`, `near-auth-usdc-server` | Lab için sabit 0,1 NEAR ve 0,60 USDC aktarımı; genel checkout değil. | Amaç/tutar bazlı eksik bakiye ön kontrolü. Ücretsiz USDC dağıtımı veya login başına otomatik hesap fonlama yok. |

Mevcut sponsor relay nesnesi network + public key + key epoch ile ayrılıyor;
nonce atomik olarak `max(chain nonce, stored nonce) + 1` seçiliyor. Yeni MPC
alanı aynı deseni kullanabilir, ancak mevcut upload relay kaydını okuyup
başka amaçla yeniden göndermez. Kalıcı D1 katalog/read-model işlem otoritesi
ve ödeme günlüğü olarak kullanılmaz.

## Web → Bridge sınırı

Tercih: mevcut Bridge Worker'ına yalnız MPC için **named WorkerEntrypoint**
eklemek; Web Worker bu girişe özel Service binding ile çağrı yapar. Genel
HTTP `/sign-anything` endpoint'i, yeni mikroservis veya özel HMAC protokolü
önerilmiyor. Cloudflare named entrypoint/RPC, bir Worker'ın başka Worker'ı
herkese açık URL açmadan çağırmasını destekliyor:
[resmî RPC/service binding belgesi](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/).
Bu platform kabiliyetidir; bu repoda binding ve runtime uyumu henüz kurulmuş
veya canlıda doğrulanmış değildir.

- Web, `/api/auth` oturumundan gerçek kimliği türetir ve mevcut Auth0 JWT
  doğrulamasını yapar. İstemci sponsor, signer, key epoch veya sınırsız action
  seçmez. Origin, oturum süresi, account binding ve kullanıcı onayı kontrol edilir.
- Private binding sadece dar MPC girişini hedefler; Web'e tüm LivepeerControl
  namespace'ine doğrudan erişim veya operator/admin metotları verilmez.
- Bridge de yalnız `ticket` veya `upload` türü, testnet, yapılandırılmış Market /
  USDC / FastAuth hedefi, exact bytes/hash, geçerlilik, gas ve 1 yocto deposit
  sınırını kabul eder. Wallet/SDK sınıfları değil açık DTO ve canonical bytes taşınır.
- MPC için tek platform hesabı/anahtarı: kullanıcı başına yeni sponsor hesabı
  değil. Market/operator veya upload relayer anahtarı sessizce yeniden kullanılmaz.
  Kaynak sürümü bu anahtarı oluşturmaz/fonlamaz; canlı key/binding ayrı onay ister.
- İlk uygulama testnet ve kapalı mutasyon bayrağıyla gelir. Eksik binding,
  anahtar, limit, ağ veya epoch durumunda gider başlatılmaz. Yerel testte
  mock binding kullanılır; public bir güvenliksiz proxy fallback'i yoktur.

Web'in doğruladığı komut Bridge için yetkili girdidir; Web sunucusunun güven
sınırı açıkça kabul edilir. Buna rağmen Bridge kendi hedef/tutar/nonce/bütçe
sınırlarını uygulayarak web hatasının sınırsız sponsor harcamasına dönüşmesini
engeller. Zincirdeki FastAuth/MPC doğrulaması da kullanıcı onayını doğrulamaya
 devam eder. CORS veya bir URL'nin `internal` adını taşıması yetkilendirme değildir.

## Tek gönderim ve durum takibi

İşlem kimliği network + Market + doğrulanmış hesap + amaç + publication/job +
server attempt ID ile bağlanır. Aynı hesapta aynı anda bir NEAR Auth ekonomik
hazırlığı ilerler. Aynı biletin veya ücretli job'ın tekrar ödenmesi mevcut
sunucu/kontrat kontrolleriyle de engellenir. Bağımsız 1-yocto demo kaydı bu
ürün yoluna taşınmaz; eski kayıtlar silinmez veya başarılı sayılmaz.

Mevcut DO transaction deseniyle önce işlem/bütçe kaydı ve sponsor nonce'u
ayrılır; sonra ağ çağrısı yapılır. Ağ çağrısı storage transaction'ın içine
alınmaz. Aynı sponsor anahtarı için nonce ve toplam günlük limit tek otoritede
seri tutulur; yalnız job başına ayrı nesne global bütçe/nonce koruması değildir.

İlk sürüm için otomatik MPC yeniden gönderimi yoktur. Dış işlem bellekte
imzalanır; **gönderimden önce hash, nonce, block hash ve onaylanmış iç payload
kimliği** kalıcı kayda yazılır. İç unsigned transaction/delegate bilgisi,
ücret ve hesap bağı saklanabilir; raw Auth0 JWT veya JWT taşıyan signed dış
transaction gövdesi günlüğe yazılmaz. Süreç gönderim sınırında kapanırsa hash
üzerinden yalnız sonuç aranır; “bulunamadı” tek başına yeni nonce/ödeme izni değildir.
İlk sürümün bu sınırlaması, belirsiz sonucun gerekirse manuel uzlaştırılmasıdır.

Durum sorgusu aynı kullanıcıya ait kalıcı işlemden çalışır. Tarayıcıdaki
5 dakikalık review veya kısa süreli onay tokenı sona erse de zaten gönderilmiş
hash'in sonucu görülebilmelidir. Bugünkü `complete` yardımcılarını aynen
kopyalamak yeterli değildir: yeni gönderim için taze onay zorunluluğu ile
geçmiş başarılı işlemin doğrulanması ayrı ele alınmalı. Tarihsel doğrulama,
kayıtlı onay/payload bağı ve zincir kanıtıyla test edilmelidir; süresi dolmuş
JWT hiçbir zaman yeni gönderimi yetkilendirmez.

Dış MPC işlemi başarılı → dönen imza exact payload için doğrulanır → biletin
imzalı iç işlemi veya mevcut upload relay yolu ilerler. İç adım da hash ile
izlenir. Başarı ekranı yalnız NEAR hakkı veya ücretli job kesinleşince gösterilir.
Tarayıcı kapanınca ilerlemenin kaybolmaması için iç gönderimin de durum
sorumluluğu kalıcı işlemde tutulur; yalnız localStorage başarı kaydı yetmez.

## Bütçe, fonlama ve fiyat kararı

| Kalem | Mevcut kaynak değeri | Ürün yorumu |
| --- | --- | --- |
| MPC dış istek | 300 Tgas, 1 yocto; lab üst sınırı **0,35 test NEAR** | İlk testnet uygulamasında aşılmayacak referans tavan; gerçek gider değildir. |
| Bilet alıcısı | Storage rezervi sonrası **0,12 test NEAR** ön bütçe | Hesapta bulunması gereken bütçe; tamamı harcanmış sayılmaz. |
| Upload sponsor ücreti | **0,10 USDC** mevcut teklif kalemi | Upload relay ücreti; ek MPC isteğinin maliyetini karşıladığı varsayılmaz. |
| Bilet/medya bedeli | Bilette Market fiyatı, upload'da doğrulanmış teklif | Bu gate tutar/komisyon/kontrat muhasebesini değiştirmez. |

Sponsor gideri platform hesabından çıkar; bu, giderin kullanıcıya ekonomik
olarak ücretsiz olduğu kararı değildir. Önceki “normal gider toplam fiyata
dahil” hedefi korunur. Gerçek gider ölçülmeden yeni komisyon/ek USDC tahsilatı
icat edilmez; mevcut Market fiyatına izinsiz ek ödeme eklenmez. İlk kapalı
testnet denemesi açıkça sınırlı platform test bütçesidir, Production fiyatlandırması değildir.

Mutasyon açılmadan zorunlu limitler: işlem başına NEAR, hesap başına deneme/gün,
global NEAR/gün, aynı anda tek hesap işlemi, minimum servis bakiyesi ve key
epoch. Eksik limit **0 izin** anlamına gelsin. Sayısal günlük Production
bütçeleri ve USD karşılıkları bu ön kontrolde tahmin edilmedi; canlı hazırlıkta
somut harcama onayı olmadan bayrak açılmaz. Rezerve tutar ile gerçekleşen gider
ayrı tutulur; sonucu belirsiz işlem rezervi otomatik serbest bırakılmaz.

**İlk kullanıcı:** hesap hazır değilse bunu ilk gerçek ödeme hazırlığında
belirle. Ücretsiz login başına NEAR/USDC aktarma yapma. Hesap açma, USDC storage,
eksik NEAR ve eksik USDC ayrı ihtiyaçlardır. Otomatik fonlama için uygunluk,
ödeme kaynağı, tek-sefer koruması ve limit ayrıca gerekir; bir signup e-postası
sınırsız fonlama yetkisi değildir. İlk teknik kabul, mevcut fonlanmış hesaplarla
yapılabilir; bu yeni kullanıcının uçtan uca fonlama ihtiyacını kapatmaz.

## İlk source ve sonraki ürün bağlama

**Tek sonraki gate: `NEAR_AUTH_V1_MPC_SPONSOR_SOURCE`.** Mevcut Bridge içinde
private, dar MPC gönderici; mevcut kalıcı kayıt/nonce deseninin ayrı amaçla
kullanımı; account/purpose/payload/bütçe kontrolleri ve sonuç sorgusu.
Değişebilir alanlar: Bridge modülü/env tipleri, ortak doğrulama yardımcıları,
ilgili Web sunucu istemcisi ve testler. Mutasyonlar varsayılan kapalı; yeni
secret/account oluşturma, gerçek binding/deploy ve UI ödeme açma yoktur.

Kabul testleri:

- Sahte kimlik/yanlış hesap, hedef, ağ, payload veya süre reddedilir; public
  HTTP yolu private metodu çağıramaz. Sponsor hesabı hak sahibi olmaz.
- İki eşzamanlı istekte tek nonce/tek gönderim; restart/timeout sonrası aynı
  hash takip edilir. Bellek kilidi tek güvence değildir.
- Sponsor global/per-account limitleri, eksik config ve yetersiz servis bakiyesi
  gönderimden önce durur. Yanlış key epoch/receipt/payload imzası reddedilir.
- Eski tokenla yeni iş başlatılmaz; geçmiş gönderimin durumu yeniden ücret
  istenmeden okunur. Saklanan veri/loglarda raw JWT ve private key bulunmaz.
- Wallet yolu, mevcut upload relayer ve lab sonuçları bozulmaz. İlgili Web,
  Bridge, tip ve artifact kontrolleri mevcut test altyapısıyla çalışır.

Bu kaynak doğrulandıktan sonra ayrı uygulama adımında ürün payment API'si,
LivepeerWatch ve upload adaptörü bağlanır. Önce fund-ready ticket, ardından
mevcut upload yolu; yeni cihaz/yenileme ve creator çekimi ayrı dar action olarak
kabul edilir. Desteklenmeyen çekim genel cüzdana düşmez. Her adımın gerçek
kabulü ayrı yapılır; bu sırayı tek deploy veya otomatik sonraki gate sayma.

## Kart, diğer kriptolar ve kapsam dışı işler

Kart **V1 hedefi olarak kalır**: doğrulanmış sipariş/tahsilattan sonra doğru
kullanıcıya on-chain hak, ayrı fiat muhasebesi ve iade/itiraz modeli gerekir.
Mevcut platform-USDC transferi müşteriye hak vermez; PSP ve scoped kart issuer
kontrat yolu hâlâ ayrı iş. Kartı yalnız kripto yükleme ekranıyla ikame etme.

Çoklu varlık yolu mevcut dönüşüm sonrası USDC hesabına oturur; kapalı varsayılan
korunur. Yeni swap motoru, token listesi açma, hibe/faucet bağımlılığı, hesap
bağlama, genel signer ve yeni ödeme veritabanı bu ön kontrolün önerisi değildir.

## Sonuç

Kaynak ön kontrolü **COMPLETED_WITH_WARNINGS**: uygulama sınırı net, fakat private
binding, sponsor hesabı/anahtarı, onaylı canlı limitler, yeni hesap fonlama ve
kart yolu hazır değil. Service binding platform dokümanı repo runtime kabulü
sayılmadı. Kod veya canlı ayar değişmedi; testler yeniden çalıştırılmadı.
Doküman build uygulanır. Mevcut yerel oturum sunucusu aynen korunur; GitHub'a
bu rapor için yeni gönderim yapılmaz.
