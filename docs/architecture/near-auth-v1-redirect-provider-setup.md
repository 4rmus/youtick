# NEAR Auth V1 — redirect provider kurulumu

Gate: `NEAR_AUTH_V1_REDIRECT_PROVIDER_SETUP`.
25 Eylül 2026 — **BLOCKED: hedef client yönetim erişimi yok**.

Amaç: doğru Auth0 client'ın mevcut callback listesini görmek, eksikse yalnız
`http://localhost:3000/auth/callback` adresini mevcut listeye eklemek ve
yönlendirmeli ürün girişini kabul etmek. Kullanıcı Auth0 Dashboard'a giriş
yaptı; erişilebilir tenant'taki uygulamalar hedef client ile eşleşmedi.
Hedef client ayarlarına erişilemedi. Sağlayıcı değişikliği yapılmadı.

## Taze gözlemler

- **LOCAL_STATIC:** mevcut `tmp/near-auth-ticket-local-setup/start.mjs`
  başlatıcısının public client ID'si `np8paqIpMWmNbzT4xAvOOapZBjsOpptl`,
  ürün origin'i `http://localhost:3000`. Bunlar kayıtlı başlatıcı değerleridir;
  çalışan sürecin tüm ortam ayarlarının kanıtı değildir.
- **PROVIDER / resmî belge:** [NEAR Auth testnet kaydı](https://docs.auth.near.org/resources/testnet)
  aynı client ID ve `login.testnet.fast-auth.com` domain'ini geliştirme için
  ortak istemci olarak yayımlıyor. Bu bilgi yönetim yetkisi sağlamaz.
- **PROVIDER / tarayıcı, salt-okunur:** mevcut Brave profilinde
  `https://manage.auth0.com/` açıldı ve kullanıcı girişini tamamladı.
  Applications listesinde üç uygulama görüldü: `Auth0 Account Management API
  Management Client`, `Default App`, `demo-spa`. Üçünün public client ID'si
  hedef `np8paqIpMWmNbzT4xAvOOapZBjsOpptl` değerinden farklı. Tenant
  seçicisinde yalnız mevcut development tenant'ı göründü; başka tenant'a
  geçiş devre dışıydı. Hedef client'ın Allowed Callback URLs listesi görülmedi.
  Panel açık ve kullanıcı oturumu korunmuş bırakıldı. Bu gözlem kullanıcının
  başka bir Auth0 hesabında erişimi olmadığını kanıtlamaz.
- **LOCAL_STATIC:** 3000 portunda dinleyen yerel sunucu var. Kayıtlı Bridge
  yapılandırmasında MPC/ticket/upload bayrakları `false`; altı bayrağın tamamı
  çalışan ortamda bu tur doğrulanmadı. Runtime yeniden başlatılmadı.

## Engel ve aynı gate'e dönüş

**Engel: giriş yapılan Auth0 hesabındaki erişilebilir tenant hedef ortak
testnet client'ını içermiyor.** Kullanıcının kendi uygulamalarına callback
eklemek, YouTick'in mevcut client'ının dönüş iznini değiştirmez.
Hedef callback izin listesi ve güncel eksiklik
**UNPROVEN**; 24 Eylül'deki hata bu tur yeniden üretilmedi.

Yönetim erişimi sağlanınca aynı gate devam eder: önce doğru domain/client ve
mevcut liste okunur; gerekirse yalnız yukarıdaki exact URL için somut ekleme
hazırlanır. Mevcut adresler korunur. Auth0'nun
[uygulama ayarları](https://auth0.com/docs/get-started/applications/application-settings)
callback, Web Origins ve logout alanlarını ayrı tanımlar; birbirlerinin
yerine kullanılmazlar. Yönetim erişimi yoksa client'ın yetkili yöneticisinin
katılımı gerekir; bu tur kimseye mesaj gönderilmedi.

Gerçek giriş kabulünden önce altı gönderim bayrağı çalışan ortamda kapalı
doğrulanmalı. Kullanıcı girişi sonrasında doğru hesap ve `/profile`, `/upload`,
`/upload?job=…`, `/watch?job=…` dönüşleri kontrol edilmeli. Önceki
`NEAR_AUTH_V1_REDIRECT_RETURN_PATH_SOURCE` gate'inin 137 yerel testi sağlayıcı
izni veya gerçek redirect kabulü değildir; bu tur kaynak testleri tekrarlanmadı.

## Değişiklik ve kanıt sınırı

Yalnız bu kayıt ve ana plan değişti. Uygulama kaynağı, ayarlar, cihaz/ödeme
kayıtları ve Git index korunur. Kullanıcı Dashboard girişini yaptı; bu ürün
giriş kabulü değildir. Provider ayarı/Management API, uygulama login/token,
imza, ödeme, upload, yeni client/tenant, runtime restart, CI ve deploy
**EXTERNAL_NOT_RUN**. Başka client/issuer'a geçiş yapılmadı ve kimseye mesaj
gönderilmedi.

Doküman build ve kapsam/diff doğrulaması PASS; mevcut 500 kB bundle uyarısı sürer.
**Tek sonraki gate: erişim sağlanınca aynı `NEAR_AUTH_V1_REDIRECT_PROVIDER_SETUP`
gate'ini sürdürmek.** Başka gate açılmadı.
