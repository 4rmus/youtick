# NEAR Auth kapalı giriş denemesi

Güncel oturum uygulaması: [NEAR Auth oturumunu geri yükleme](./near-auth-session-restore.md).
Aşağıdaki SDK/tip yaması ve yenileme başarısızlığı kayıtları önceki gate'lerin
tarihli kanıtıdır; yeni oturum çalışması bunları günceller.

Gate: `NEAR_AUTH_BROWSER_INTEGRATION_SOURCE`  
Sonuç: **COMPLETED_WITH_WARNINGS / LOCAL_STATIC + LOCAL_TEST**.

## Eklenen davranış

`/auth-lab` yalnız `NODE_ENV=development`, `NEAR_AUTH_LAB_ENABLED=true` ve
`NEXT_PUBLIC_NEAR_NETWORK=testnet` birlikte sağlandığında açılır. Varsayılanı
kapalıdır; production derlemesi, deneme ayarı açık olsa bile 404 döner. Menüye
bağlantı eklenmedi. Sayfa noindex ve no-referrer kullanır.

Giriş ekranı NEAR Auth JavaScript Provider 1.4.1'i yalnız ihtiyaç olduğunda yükler.
Popup girişi, açık yönlendirme seçeneği, callback kontrolü ve deneme oturumundan
çıkış vardır. Callback aynı sayfada tek kez işlenir; kod/state/hata parametreleri
adres çubuğundan temizlenir. Hata ayrıntıları, token ve sosyal kullanıcı kimliği
ekrana, loga veya uygulamanın depolamasına yazılmaz.

Bu sayfa sadece NEAR Auth giriş denemesidir: mevcut WalletProvider'a hesap
bağlamaz, sunucuda doğrulanmış YouTick oturumu kurmaz, NEAR hesabı oluşturmaz,
anahtar/imza istemez, cihaz kaydetmez ve satın alma/izleme hakkı vermez.
Mevcut giriş, cihaz, ödeme, Bridge ve sözleşme davranışları değiştirilmedi.
`AuthLabBoundary`, yalnız `/auth-lab` üzerinde normal cüzdan/menü bölümünü
çalıştırmaz. Böylece önceden bağlı bir cüzdan sosyal giriş sonucu gibi görünmez
ve bu sayfadan yanlışlıkla eski cüzdan çıkış/imza akışı başlatılamaz. Kayıtlı
cüzdan hesabı silinmez; diğer sayfalar normal uygulama bölümünü kullanır.

## Paket sınırı

Uygulamanın `near-api-js` sürümü 7.3.0 olarak kaldı. Giriş sağlayıcısının ihtiyaç
duyduğu v5 kendi bağımlılığıdır; bu gate için Browser SDK veya React SDK eklenmedi.
İşlem/imza katmanı henüz gerekli olmadığından önceki geçici denemeden kopyalanmadı.

Yayımlanmış Provider 1.4.1'deki eksik `dist/provider.d.ts`, kurulum sırasında
`scripts/fix-near-auth-types.mjs` ile tamamlanır. Kaynak Peersyst/fast-auth
`38dc894afbc94c198c207f52e6d01d695199eaa1` commit'indeki
`packages/shared/core/src/provider.ts`; dosyanın SHA-256 değeri scriptte sabittir.
Yalnız tip dosyası eklenir; SDK JavaScript kodu değişmez. Sürüm/hash uyuşmazlığında
kurulum durur. Upstream paket düzeltilince bu geçici dosya ve script kaldırılmalıdır.

`npm run test:near-auth-types`, `skipLibCheck=false` ile bu sınırı doğrular;
`npm run build` öncesinde otomatik çalışır. Genel TypeScript ayarları gevşetilmedi.

## Yerel kullanım

Normal Web geliştirme ortamının gerekli Market/Access ayarlarıyla:

```sh
cd apps/web
NEAR_AUTH_LAB_ENABLED=true npm run dev -- --hostname 127.0.0.1 --port 3000
```

`NEXT_PUBLIC_NEAR_NETWORK=testnet` gerekir. `NEAR_AUTH_LAB_CLIENT_ID` yoksa
sayfa ayarın eksik olduğunu gösterir; SDK ve giriş düğmeleri açılmaz.
Ortak testnet client ID resmi ağ rehberinde yayımlanır:
<https://docs.auth.near.org/resources/networks>.
Bu client ile sayfa **`http://localhost:3000/auth-lab`** adresinden açılmalıdır.
Brave'de popup ile Google girişi bu origin üzerinde doğrulandı. `127.0.0.1:3037`
origin'i reddedildi; localhost ile 127.0.0.1 aynı Auth0 ayarı sayılmaz.
Çıkış aynı origin'in ana sayfasına döner; ortak client'ın `/auth-lab` çıkış dönüşünü
reddettiği, ana origin'i kabul ettiği canlı denemede görüldü.

Yönlendirmeli giriş ayrıca tam callback `http://localhost:3000/auth-lab` izni ister;
popup başarısı bu ayrı iznin kanıtı değildir. Kendi onaylı test uygulamasında
callback, logout ve web origin kayıtları kullanılan adreslerle eşleşmelidir.
Client ID herkese açık uygulama kimliğidir; client secret kullanılmaz. Ayarlar
bu gate'lerde hiçbir `.env`, GitHub veya provider yapılandırmasına yazılmadı.

SDK oturum yenilemeyi kendiliğinden garanti etmiyor. Sayfayı yenileyince yeniden
giriş gerekebileceği ekranın üzerinde açıkça belirtilir. Kalıcı hesap eşlemesi,
hesap kurtarma ve gerçek Google/Apple seçenekleri sonraki kabulün konusudur.

## Doğrulama

- 13 yeni odaklı test: kapalı/production/mainnet 404, eksik ayar, tek callback,
  hatalı/iptal edilmiş callback, sabit dönüş adresi, popup/redirect/çıkış çağrıları.
- Web testlerinin tamamı: **35 dosya / 429 test geçti**.
- Katı SDK tip kontrolü, lint ve production Web build geçti.
- Yerel production sunucusu, gate=true ve sentetik client ID varken `/auth-lab`
  için **404** döndürdü. Bu Production ortamına yayın kanıtı değildir.
- Brave'de gerçek Next geliştirme ekranı ve gerçek SDK'nın girişe hazır durumu
  görüldü; gerçek giriş düğmesine basılmadı.
- Gerçek React bileşeni + sahte sağlayıcı + dış ağa kapalı yerel harness ile
  giriş, çıkış, iptal, callback temizliği, eksik ayar, yönlendirme ve çıkış hatası
  gözlendi. React StrictMode altında callback bir kez işlendi. Bu sonuçlar
  **LOCAL_TEST** olup gerçek Google/Apple kabulü değildir.

Komut kayıtları ve kaynak karşılaştırmaları:
`tmp/near-auth-browser-integration/evidence/` (yerel, Git dışında).

## Kaynak gate'inde çalıştırılmayanlar ve sonraki gate

Gerçek Google/Apple girişi, testnet hesabı eşlemesi, oturum kurtarma, FullAccess,
imza, cihaz kaydı, ödeme, Livepeer oynatma, mobil/Safari, CI ve deploy
**EXTERNAL_NOT_RUN / UNPROVEN**. Commit/push/PR yapılmadı.

Tek sonraki gate: **NEAR_AUTH_TESTNET_LOGIN_ACCEPTANCE** — onaylı testnet client
ID ve callback/logout adresleriyle gerçek giriş/çıkış ve reload davranışını ölçmek.
İşlem imzalama ve zincir mutasyonu bu giriş kabulünden ayrıdır. Gate otomatik açılmadı.

## Kullanıcı talimatıyla testnet giriş kontrolü — 16 Eylül 2026

`NEAR_AUTH_TESTNET_LOGIN_ACCEPTANCE` kullanıcı talimatıyla açıldı. Sonuç
**COMPLETED_WITH_WARNINGS**: Google ile bir gerçek giriş doğrulandı; tüm canlı
giriş/yenileme kabulü tamamlanmadı.

- Resmi ortak testnet client ile `localhost:3000` üzerinde popup girişi başarılı
  oldu; kullanıcı Google kullandığını doğruladı. Bu **PROVIDER** kanıtıdır.
- `127.0.0.1:3037/auth-lab` yönlendirmesi callback uyuşmazlığıyla reddedildi.
- Çıkışta `/auth-lab` dönüşü reddedildi. Aynı sağlayıcı çıkış adresinin ana
  origin'e dönüşü kabul edildi; kaynak ve test bu dönüşe göre düzeltildi.
- Üstte görünen eski cüzdan sosyal girişe ait değildi. Kullanıcının cüzdan
  çıkışına bastığı akışta Meteor imza penceresi görüldü ve onay verilmeden
  kapatıldı. Ardından yalnız auth-lab için eski cüzdan bölümü ayrıldı;
  Brave'de cüzdan çubuğunun artık görünmediği doğrulandı.
- Yerel eski cüzdan/RPC akışında workerd `SQLITE_READONLY` ve HTTP 503 gözlendi.
  Bu, Google girişinin yarım kalmasının kanıtlanmış nedeni olarak sınıflanmadı;
  canlı D1/NEAR/provider ayarı değiştirilmedi.
- Yüklü Auth0 SPA SDK'nın popup bekleme süresi 60 saniye. Süre aşımında SDK
  mesaj dinleyicisini kaldırıp pencereyi açık bırakıyor. Artık bu timeout
  yakalanınca yalnız ilgili popup kapatılıyor ve anlaşılır bir yeniden deneme
  mesajı gösteriliyor. SDK JavaScript'i veya süre/güvenlik ayarı değiştirilmedi.
- Cüzdan ayrımı sonrasında **434 Web testi**, lint, katı tip kontrolü ve Web
  build geçti. Son eklenen timeout düzeltmesinin **19 odaklı testi**, katı tip
  kontrolü ve lint ayrıca geçti; bu son küçük düzeltmeden sonra tam build
  tekrarlanmadı.

Son kullanıcı Google girişi, cüzdandan ayrılmış ekranda tekrar doğrulandı:
Brave önce `Deneme girişi başarılı.` gösterdi. Ardından yapılan tam sayfa
yenilemesi sonrasında `Devam etmek için giriş yapın.` ve giriş düğmesi geri geldi.
Dolayısıyla popup giriş **PASS**, yenileme sonrası uygulama oturumunun korunması
**FAIL**. Bu, Google hesabından veya sağlayıcının tüm SSO oturumlarından çıkıldığı
anlamına gelmez; ölçülen sonuç bu uygulamanın giriş durumudur.

Kullanıcı, Auth0 development keys uyarısını bildirdi. Auth0'nun resmi rehberi
bu anahtarların yalnız test için olduğunu ve üretimde kullanılmaması gerektiğini
belirtiyor: <https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/devkeys>.
Ortak NEAR Auth testnet client ile bu uyarı beklenebilir; üretim NEAR Auth ayarları
ve üretime uygun sosyal bağlantı ayrıca doğrulanmalı. Uyarı, gözlenen reload
sonucunun kanıtlanmış tek nedeni olarak kabul edilmedi.

Yeni popup kullanıcı hazır olduğunda kendisi tarafından başlatılmalı;
koordinasyon sırasında süre aşmış pencere üzerinden girişe devam edilmemeli.
Gözlenen ortak testnet ekranında Google, passkey ve e-posta seçenekleri vardı;
Apple düğmesi görünmedi. Apple, YouTick/NEAR hesap eşlemesi, imza, ödeme ve oynatma
**UNPROVEN** kalır. Tek sonraki gate: `NEAR_AUTH_SESSION_RESTORE_SOURCE` — kullanıcı
kimliğini güvenilir biçimde geri yükleme; e-posta/cüzdan eşleşmesi varsaymadan ve
token'ları sırf yenileme çalışsın diye localStorage'a taşımadan ele alınmalıdır.
Bu sonraki gate açılmadı.
Kişisel kimlik bilgileri ve oturum token'ları kanıt dosyalarına kaydedilmedi.
Kanıt: `tmp/near-auth-testnet-login/evidence/login-observations.json`.
