# NEAR Auth V1 — ana uygulama giriş ve oturum kaynağı

Gate: `NEAR_AUTH_V1_SESSION_UI_SOURCE`.
22 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

Ana uygulamaya kapalı varsayılanlı Google/passkey oturumu eklendi. Mevcut
WalletProvider tek aktif kimliği koordine eder; ikinci bir cüzdan context'i
veya yeni paket yoktur. Bu kaynak kabulü, gerçek ortamda özelliğin açıldığı
veya ana uygulamada ödeme entegrasyonunun tamamlandığı anlamına gelmez.

## Davranış

- Navbar ve giriş gereken profil ekranı `Google / Passkey` ile mevcut cüzdan
  girişini sunar. Google/passkey seçimi mevcut hosted NEAR Auth ekranındadır.
  Hesap açıkken native menüyle yöntem/hesap seçilebilir; otomatik hesap bağlama yok.
- Ürün oturumu `/api/auth/session` ve `/api/auth/account` üzerinden geri gelir.
  Hesabın kimliği sunucuda doğrulanır; istemciden accountId/subject alınmaz.
  Fonlanmamış implicit hesap, giriş yapılmış ama zincir hesabı hazır değil
  olarak gösterilir. Giriş ve profil okuma fonlama veya imza başlatmaz.
- Yalnız seçilen giriş türü aktiftir. Son seçim yerelde sadece
  `wallet / near-auth / none` olarak tutulur; token saklanmaz. NEAR Auth
  aktifken sponsor cüzdanının sign-in/sign-out/storage olayları hesabı değiştirmez.
  Geç wallet restore yanıtı yeni NEAR Auth girişinin üstüne yazamaz.
- Oturum süresi sona erince veya odağa dönüşte doğrulama başarısızsa aktif
  hesap bırakılır. Hesap/yöntem değişimleri gecikmiş yanıtları engeller.
  Sekmeler arası yöntem değişiminde eski görünüm temizlenir ve reload istenir.
- NEAR Auth çıkışı oturumu kapatır, diğer hesapların cihaz anahtarlarını silmez.
  Ürün modundaki wallet çıkışı mevcut yetki iptalini korur; cihaz temizliği
  yalnız o hesaba uygulanır. Varsayılan eski `clearDeviceSession()` davranışı
  değişmedi; hesap parametresi yalnız hedefli temizliğe imkan verir.
- Popup başarısızlığında `Continue in this tab` seçeneği aynı giriş işlemini
  yönlendirmeyle tamamlar. `/auth/callback`, SDK'nin state kontrolünden sonra
  yalnız izin verilen `/profile`, `/upload`, `/watch?job=...` yoluna döner.
  Ham OAuth query temizlenir. StrictMode callback'i çift işleme çevirmez.
  Bekleyen login cevabı çıkıştan sonra kimliği geri getiremez; devam eden
  oturum yazımı varsa DELETE ondan sonra yapılır.

## Salt-okunur sınır

Google/passkey aktifken ana uygulamadaki upload, bilet satın alma, para çekme
ve çoklu varlık paneli ödeme başlatmaz. `getWallet()` başka bir cüzdana düşmek
yerine reddeder; mevcut wallet adaptörleri hesap/generation kontrolünü korur.
Profil bakiyesi ve mevcut yayın/hak okunabilir. Geçerli V2 cihazı olan kullanıcı
mevcut ortak oynatıcıdan yararlanabilir; yeni cihaz/ödeme adaptörü bu gate'te
uygulanmadı. Lab'in test edilmiş upload/ticket yolları bağımsız olarak korunur.

## Kapalı ayarlar ve güvenlik sınırı

Aşağıdaki yeni ürün ayarlarının **hiçbiri bu gate'te canlıya uygulanmadı**:

| Ayar | Koşul |
| --- | --- |
| `NEAR_AUTH_V1_ENABLED` | Yalnız tam `true`; eksik/false durumunda özellik kapalı. |
| `NEAR_AUTH_V1_CLIENT_ID` | Doğrulanmış sağlayıcı uygulama kimliği; yalnız bu açık değer client prop olur. |
| `NEAR_AUTH_V1_SESSION_SECRET` | Sunucuda 64 hex karakter; tarayıcıya gönderilmez. |
| `NEAR_AUTH_V1_ORIGIN` | Tek tam origin; kullanıcı bilgisi, path veya trailing slash kabul edilmez. HTTPS; yalnız development localhost/127.0.0.1 için HTTP. |

Ayrıca network `testnet`, video environment `public-testnet` olmalı ve
`NEAR_AUTH_LAB_ENABLED=true` olmamalıdır. Lab ve ürün modunu aynı anda açmak
ürün API'sini kapalı tutar. Mevcut localhost lab guard'ları ve middleware
izolasyonu gevşetilmedi. Yanlış origin, kapalı mod veya eksik ürün ayarında
ürün uçları 404/403 ile durur. Ürün için signing/funding endpoint'i eklenmedi.

Ürün cookie'si `youtick_auth_v1`, path `/api/auth`, ayrı issuer ve secret
alanıyla sınırlandırıldı. HttpOnly/SameSite=Lax/HTTPS Secure, RS256 issuer /
audience / azp / exp doğrulaması ve boyut sınırları ortak yardımcıda korunur.
Lab cookie'si ürün oturumu sayılmaz. JWT, cookie, passkey, e-posta veya özel
anahtar loglama eklenmedi. Mevcut kullanıcı depolarında migration yoktur.

## Değişen alanlar

- `WalletProvider`, `Navbar`, `AccountEntryButtons`, layout: tek aktif kimlik
  ve giriş/hesap gösterimi.
- Ürün auth session/account route'ları ve callback sayfası; ortak
  `near-auth-session-server`, `near-auth-session-settings`, `near-auth-product`.
- Mevcut `near-auth-lab` ve session okuyucusu: kimlik taşımasını iki güvenlik
  alanında yeniden kullanma; lab varsayılan davranışını koruma.
- Profile, LivepeerWatch, LivepeerPaidUploadForm ve LivepeerPlayer: yöntem
  bazlı salt-okunur sınır, yanlış cüzdan çağrısının önlenmesi.
- Device session: yalnız seçilen hesabın cihazını temizleme seçeneği.
- İlgili mevcut unit testleri, routes beklentisi, UX script'i ve auth tip
  kontrolünün ürün API kapsamı; bu rapor, ana plan ve test yönergesi.

Paket/lockfile, kontratlar, Bridge, provider/config, mevcut bayrak değerleri,
kullanıcı kayıtları, Git index ve önceki dirty dosyalar korunur.

## Doğrulama

| Kanıt | Sonuç |
| --- | --- |
| LOCAL_TEST | Web **48 dosya / 909 test PASS** |
| LOCAL_TEST | Ayrı headless Brave **25 UX senaryosu PASS**; ürün callback/StrictMode, popup fallback, mobil menü, reload, fonlanmamış hesap ve ödeme engelleri dahil |
| LOCAL_TEST | Mevcut lab playback harness **16 PASS** |
| LOCAL_STATIC | Auth API strict typecheck, bütün Web proje typecheck ve lint PASS |
| LOCAL_STATIC | Ortam dosyaları kopyalanmadan ayrı dizinde ürün bayrağı kapalı/açık Web build PASS |
| LOCAL_STATIC | Doküman build PASS; mevcut bundle boyutu uyarısı sürer |

Testte doğrulananlar ayrıca: yanlış origin/token, cookie alanlarının ayrımı,
account/funding girdilerinin reddi, stale login/logout sırası, hesap değişimi,
sponsor olaylarının yok sayılması, scoped device cleanup ve geç yanıtların
etkisiz kalması. Asıl browser/cihaz depoları kullanılmadı.

İlk koşularda eski kaynak-string beklentileri ve eksik test window/async mock'u
uyarlandı. Ürün fixture'ına eksik kapak yanıtı eklendi. Popup fallback testinin
bulduğu Navbar'ın hata düğmesini örtmesi banner katmanıyla düzeltildi. Callback
StrictMode cleanup'ı ortak doğrulanmış callback promise'ini iptal etmeyecek
şekilde tutuldu; açık kullanıcı hesap değişimi iptali korunur.

Strict auth tipi sunucu/oturum grafiğinde korunur; tüm UI kodu projenin mevcut
`skipLibCheck` ayarıyla ayrıca typecheck/build edilir. Near-connect'in mevcut
eski peer declaration eksiklerini gidermek için paket eklenmedi. Build'deki
mevcut middleware/webpack/Auth0-Next Edge uyarıları sürer; Cloudflare runtime
kabulü olarak yorumlanmaz.

Başlangıç kaynak/index referansı ve izole build:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-session-ui-_epuy5vz/`.
Son UX koşusu: `tmp/near-auth-ux-run-8tCkrs/`.

## Kapanış

**COMPLETED_WITH_WARNINGS:** kaynak ve yerel kabul tamamlandı. Gerçek provider
client/origin/callback izinleri, ürün ayarlarının uygulanması ve hosted ortam
kabulü **EXTERNAL_NOT_RUN**. Yeni finansal işlem, CI, GitHub gönderimi veya
deploy yoktur. Sponsor hizmeti, kart checkout'u ve NEAR Auth para çekme bu
çalışmanın kapsamı değildir; önceki V1 hedefleri korunur.

**Tek sonraki gate: `NEAR_AUTH_V1_SESSION_UI_ACCEPTANCE`.** Önce kullanılacak
origin/client ve `/auth/callback` izinleri somutlaştırılır; gerekli yerel ve
provider ayarları ayrıca onaylanır. Ardından ana uygulamada gerçek Google /
passkey / wallet girişleri, profil/reload ve hesap değişimi doğrulanır.
Bu gate'in canlı adımlarına burada otomatik geçilmedi.
