# NEAR Auth oturumunu geri yükleme

Gate: `NEAR_AUTH_SESSION_RESTORE_SOURCE` — **PASS / kapalı**.

## Uygulanan sınır

NEAR Auth testnet girişi aynı domain ve aynı resmi testnet client ile devam eder.
Giriş için NEAR Auth'un kullandığı resmi `@auth0/auth0-spa-js` 2.26.0 doğrudan
kullanılır. Bu kütüphane ve `jose` 6.2.12 zaten bağımlılık ağacında bulunuyordu;
sürümleri değiştirilmeden doğrudan bağımlılık olarak sabitlendi.

JavaScript Provider yalnız bu giriş çağrılarını sarıyor, oturum geri yükleme ve
sunucuya kimlik cevabı teslimi için gereken public arayüzü sunmuyordu. Artık
girişte kullanılmayan wrapper ve önceki tip yaması kaldırıldı. `near-api-js`
7.3.0 korundu; imzalama SDK'sı veya yeni bir servis eklenmedi.

## Akış

1. Auth0 SPA SDK, Google popup/izinli redirect akışını PKCE/state/nonce
   kontrolleriyle tamamlar. Token önbelleği yalnız bellektedir.
2. SDK'nın ID token'ı aynı origin'deki `POST /api/auth-lab/session` adresine
   bir kez gönderilir. Token loga veya kalıcı depolamaya yazılmaz.
3. Sunucu sabit NEAR Auth testnet JWKS adresindeki public anahtarlarla RS256
   imzasını; issuer, audience, subject, issuance ve expiration alanlarını doğrular.
   Süresi dolmuş, yanlış uygulamaya ait veya doğrulanamayan cevap oturum açmaz.
4. Yalnız doğrulanmış issuer/subject ve client bilgisi kısa süreli şifreli bir
   oturum çerezine konur. Orijinal token, e-posta, isim ve NEAR hesap iddiası
   çereze alınmaz. Çerez `HttpOnly`, `SameSite=Lax`, `/api/auth-lab` kapsamındadır.
5. Yenilemede `GET /api/auth-lab/session` çerezi sunucuda doğrular. Auth0
   iframe'i veya tarayıcıda saklanmış bir giriş bayrağı yetki sayılmaz.
6. `DELETE` aynı-origin kontrolünden sonra çerezi siler; ardından sağlayıcı
   çıkışı başlatılır. Sağlayıcı çıkışı aksasa bile yerel oturumun kapanmış olduğu
   kullanıcıya doğru gösterilir.

Süre en fazla bir saattir ve kaynak ID token'ın sona erme zamanını aşamaz.
GET süreyi uzatmaz. Bozulmuş, süresi dolmuş veya farklı origin/client'a ait
çerez reddedilir. POST/DELETE başka origin'den kabul edilmez; JSON gövdesi
16 KiB ile sınırlıdır. Bütün yanıtlar `no-store` kullanır.

Bu API yalnız development + açık lab flag'i + testnet + loopback hostname'de
çalışır; production ortamında bütün metotlar 404 döner. HTTP yalnız yerel
loopback denemesidir; HTTPS kullanılırsa çerez `Secure` işaretini de alır.
Bu çalışma genel production oturum/anahtar yönetimi veya tüm cihazlardan
oturum iptali değildir; çıkış mevcut tarayıcının çerezini temizler.

## Yerel ayar

Mevcut lab ayarlarına ek olarak `NEAR_AUTH_LAB_SESSION_SECRET`, 32 rastgele
byte'ın 64 karakterli küçük harf hex gösterimi olmalıdır. Bu sunucuya özel
değerdir; `NEXT_PUBLIC_` alanı değildir. Eksik/geçersizse giriş düğmesi açılmaz
ve API 503 verir. Kaynak koda veya `.env` dosyasına bir anahtar yazılmadı.

Bu denemenin yerel başlatıcısı `tmp/near-auth-session-restore/serve.mjs`, anahtarı
yalnız çalışan alt sürecin belleğinde üretir. Dev sunucusu yeniden başlatılırsa
önceki deneme çerezi geçersiz olur; aynı süreçte sayfa yenilemesi korunur.
Başlatıcı gerçek medya/ödeme bayraklarını kapalı tutar ve callback/token
içerebilecek konsol satırlarını göstermeden atlar.

## Kabul sınırları

Oturumun kimliği artık sunucunun doğruladığı issuer/subject'tir. Ancak bu,
NEAR hesabının varlığı veya o hesabın kontrolü değildir. İstemcinin gönderdiği
hesap adı, e-posta eşleşmesi ve önceden bağlı cüzdan hesap bağı sayılmaz.
Bu gate'te NEAR hesap oluşturma, fonlama, MPC imzası, cihaz yetkilendirme,
satın alma, yükleme veya oynatma yapılmaz.

Doğrulama ve canlı gözlemler bu dosyanın devamında ve
`tmp/near-auth-session-restore/evidence/` altında kaydedilir.

## Doğrulama — 16 Eylül 2026

| Kontrol | Sonuç | Kanıt sınıfı |
| --- | --- | --- |
| Bütün Web testleri | 36 dosya, 458 test geçti | LOCAL_TEST |
| Oturum/istemci odaklı testler | 42 test geçti; son güvenlik testleri ayrıca 19/19 | LOCAL_TEST |
| Katı tip kontrolü, lint, Web build | Geçti | LOCAL_STATIC / LOCAL_TEST |
| Production build'de lab sayfası ve GET/POST/DELETE API | Flag açıkken bile 404; çerez verilmedi | LOCAL_TEST |
| Auth0 testnet JWKS erişimi | HTTP 200; RS256 public anahtarları | PROVIDER |
| Gerçek Google girişi | Kullanıcı tamamladı; sunucu POST 200 ve giriş başarılı | PROVIDER + yerel runtime |
| Tam sayfa yenilemesi | GET 200; giriş başarılı durumu korundu, yeni Google penceresi açılmadı | PROVIDER + yerel runtime |
| Deneme oturumundan çıkış | Yerel oturum silindi, sağlayıcı ana adrese döndü | PROVIDER + yerel runtime |
| Çıkıştan sonra lab'a dönüş ve yenileme | Giriş gerekli olarak kaldı | Yerel runtime |

İmza, issuer/audience, authorized-party, süre, CSRF/origin, gövde boyutu,
çerez bütünlüğü, yanlış origin/client ve kapalı gate senaryoları gerçek
kriptografik test anahtarlarıyla sınandı. Üretime ait hiçbir anahtar kullanılmadı.
Sunucu gizli anahtarının istemci derleme dosyalarına girmediği ayrıca kontrol edildi.

SDK JavaScript yaması gerekmedi. Artık kullanılmayan sağlayıcı/tip yaması ve
onun getirdiği 227 paket kurulumdan çıktı; kalan paketlerin mevcut sürüm ve
bütünlük değerleri korunuyor. `near-api-js` hâlâ 7.3.0.

Gerçek kullanıcıya ait token, çerez içeriği, e-posta veya subject kanıt dosyasına
kaydedilmedi. Bu yerel testnet kanıtıdır; Preview/Production deploy veya CI
kanıtı değildir. Commit/push/PR/deploy yapılmadı.

## Tek sonraki gate

`NEAR_AUTH_ACCOUNT_BINDING_PREFLIGHT`: doğrulanmış Google kimliğinin hangi
NEAR anahtarını ve hesabını kontrol ettiğini belirlemek. Bu gate otomatik
açılmadı. NEAR hesap eşlemesi, hesap oluşturma/fonlama, cihaz kaydı, satın alma,
yükleme, oynatma ve Apple/Safari kabulü bu çalışmada **EXTERNAL_NOT_RUN / UNPROVEN**.
