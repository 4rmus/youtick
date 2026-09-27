# NEAR Auth V1 — redirect callback ön kontrolü

Gate: `NEAR_AUTH_V1_REDIRECT_CALLBACK_PREFLIGHT`.
24 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Gözlenen hata sağlayıcının callback izin sınırında.** Ürün kodu
`http://localhost:3000/auth/callback` adresine dönmek istiyor; Auth0 bu adresi
`Callback URL mismatch` ile reddetti. En küçük kalıcı düzeltme, mevcut client'ın
yetkili yöneticisinin bu **tek tam adresi** Allowed Callback URLs listesine
eklemesi ve yönlendirmeli girişin ardından ayrıca kabul edilmesidir.
Kaynakta yeni callback rotası veya yeni kimlik/SDK katmanı gereksinimi bulunmadı.

Bu gate yalnız bu rapor ve ana planı değiştirir. Uygulama/provider ayarları,
client ID, issuer/audience, browser oturumu, cihaz/ödeme kayıtları ve gönderim
bayrakları değişmedi. Yeni login/authorize isteği, token, imza, ödeme, upload,
restart, provider yönetim çağrısı, ileti gönderimi, CI veya deploy yapılmadı.
Kabul: hatalı sınır, exact ayar paketi, korunacak kontroller ve tek sonraki gate
belirlenmiştir. Provider yönetim erişimi ve tam redirect kabulü açık kalır.

## Kaynakta izlenen gerçek akış

Kurulu/lock/manifest Auth0 SPA sürümü **2.26.0**; paket değişmedi.

| Adım | Güncel kaynak davranışı |
| --- | --- |
| Normal Google/passkey giriş | `near-auth-lab.ts`: `loginWithPopup({ prompt: 'login' })`; açık redirect URI geçmiyor. Kurulu SDK `response_mode=web_message` ve `window.location.origin` fallback'i kullanıyor. |
| Continue in this tab | `WalletProvider.connectNearAuth(true)` → `loginWithRedirect`; ürün için `window.location.origin + '/auth/callback'` açıkça gönderiliyor. |
| Dönülecek ürün sayfası | `appState.returnTo`; `authReturnPath` yalnız `/profile`, `/upload`, geçerli job içeren `/watch?job=…` kabul ediyor. Harici/uygunsuz adres `/profile` olur. |
| Callback sayfası | `apps/web/app/auth/callback/page.tsx` mevcut; ürün ayarı yoksa 404, noindex/no-referrer metadata. |
| Callback işleme | Root `WalletProvider` yolu tanır; SDK `handleRedirectCallback` PKCE/state/nonce akışını işler. `restore()` promise'i StrictMode tekrarlarında paylaşılır. |
| Ürün oturumu | ID token `/api/auth/session` POST ile sunucuda issuer/audience/azp/RS256/süre kontrollerinden geçer. HttpOnly ürün cookie'si bundan sonra yazılır. |
| Son dönüş | Başarılı callback sonrası yalnız doğrulanmış yerel `returnPath`; callback query'si temizlenir. Giriş, imza/fonlama/upload başlatmaz. |

`productSessionSettings` origin/client/secret ve testnet/public-testnet
sınırını doğrular; lab açıkken ürün kapalıdır. `localhost` ile `127.0.0.1`
ayrı origin'lerdir. Sunucunun 127.0.0.1'e bind etmesi, tarayıcı dönüş adresini
127.0.0.1 yapmayı gerektirmez. Mevcut ürün origin'i **localhost:3000**'dir.

## Canlı hatanın kapsamı

Önceki upload kabulünde 24 Eylül'de sağlayıcı ekranı `/auth/callback` dönüşünü
izin listesinde olmadığı gerekçesiyle reddetti. Ret, uygulamanın callback
sayfasına dönüşten önce oldu. Mevcut kaynak da aynı URI'yi üretmektedir.
Bu, callback route'unun 404 verdiği veya NEAR/USDC işleminin başarısız olduğu
anlamına gelmez. İki upload ve popup temelli kullanıcı girişleri ayrıca geçti.

[Auth0 redirect belgesi](https://auth0.com/docs/authenticate/login/redirect-users-after-login)
callback URI'sinin uygulama izin listesinde olmasını şart koşar; uygulama içi
son hedefin `state`/oturum üzerinden taşınmasını ayrı ele alır.
[Auth0 Web Origins açıklaması](https://support.auth0.com/center/s/article/What-is-the-difference-between-Allowed-Origins-CORS-and-Allowed-Web-Origins)
`web_message` için Web Origins alanını ayırır. Bu yüzden popup başarısı tam
`/auth/callback` URL'sinin izinli olduğunun kanıtı değildir.

Bu tur hata yeniden üretilmedi; kullanıcı oturumu ve giriş denemeleri korunur.
Provider Dashboard/Management API allowlist'i doğrudan okunmadı. Dolayısıyla
mevcut bütün izinli adresler, sonradan bir yönetici değişiklik yapıp yapmadığı
ve yönetim yetkisi **UNPROVEN**. Yeni ayar öncesi exact client ve mevcut liste
salt-okunur görülmeli; doğrulanmadan liste üzerine yazılmamalı.

## Ortak testnet client ve gereken tek ayar

[NEAR Auth resmî testnet kaydı](https://docs.auth.near.org/resources/testnet)
şu client'ı geliştirme için **ortak** client olarak yayımlıyor. Yerel launcher
aynı değerleri kullanıyor:

| Alan | Bu yerel kabul için değer |
| --- | --- |
| Domain | `login.testnet.fast-auth.com` |
| Client ID | `np8paqIpMWmNbzT4xAvOOapZBjsOpptl` |
| Eklenecek Allowed Callback URL | `http://localhost:3000/auth/callback` |
| İlgili Allowed Web Origin | `http://localhost:3000` — mevcut değeri kontrol et, değiştirme gereğini varsayma |
| Mevcut logout dönüşü | `http://localhost:3000` — callback alanıyla karıştırma |
| Ürün origin | `NEAR_AUTH_V1_ORIGIN=http://localhost:3000` |

Önerilen değişiklik yalnız **eksik exact callback URL'sini mevcut listeye
eklemek**. Diğer uygulamaların adresleri korunacak. Wildcard, tüm portları
veya 127.0.0.1'i kapsayan geniş izin önerilmiyor. `/auth-lab` adresine kaçış,
redirect URI tahmini, issuer/state kontrollerini kapatma veya public
Authorization endpoint'ine ardışık adres denemeleri yok.

Ortak client'ın yöneticisi/NEAR Auth sahibiyle işlem yapma yetkisi bu gate'te
kanıtlanmadı; kullanıcının kendi Auth0 Dashboard'u bu client'ı yönetiyor diye
varsayılmayacak. Client ID gizli değildir; client secret veya Management API
tokenı sohbete istenmeyecek. Yönetim erişimi yoksa sonraki kurulum bu sınırda
durur; kullanıcı adına otomatik mesaj gönderilmez.

Yeni bir client/tenant'a geçiş ayrı issuer, audience/azp, signing Action ve
hesap/passkey sürekliliği incelemesi gerektirir. Bu küçük callback hatasını
çözmek için mevcut Google/passkey hesapları sessizce yeni client'a taşınmaz.
Hosted public-testnet veya Production callback URL'leri de bu yerel pakete
otomatik eklenmez; o origin'in deployment/session kanıtı ayrıdır.

## Sonraki kurulumun kabul koşulları

**Tek sonraki gate: `NEAR_AUTH_V1_REDIRECT_PROVIDER_SETUP` — başlatılmadı.**

1. Yetkili yönetim yüzeyinde doğru domain/client ve mevcut callback listesi
   salt-okunur doğrulanır. Kullanıcıya exact ekleme somut gösterilir; sağlayıcı
   ayarı değiştirme için ayrı açık onay alınır. Sonra yalnız yukarıdaki URL
   eklenir; öncesi/sonrası güvenli özet kaydedilir.
2. Altı MPC/ticket/upload gönderim bayrağı kapalı kalır. Aynı localhost ürün
   ortamında kullanıcı yalnız giriş yapar; sponsor, NEAR imzası veya yeni
   upload/bilet ödeme isteği oluşmaz.
3. Yönlendirmeli giriş ürün callback'ine gerçekten döner; doğrulanmış oturum
   ve beklenen Google/passkey account ID görülür. `/profile`, `/upload` ve
   mevcut `/watch?job=…` hedefleri korunur; ikinci ödeme oluşturulmaz.
4. Callback hata/iptal ve yanlış/eksik state için oturum yaratılmaması,
   query temizliği ve StrictMode'da tek callback/session write yerel testlerle
   korunur. Gerçek sağlayıcı başarısı mock testten ayrı kaydedilir.
5. Kayıt/taslak/cihazlar silinmez, hesap bağlama/recovery başlatılmaz. Popup
   ve mevcut başarılı oturum akışı gerilemez. Provider ekranına erişim yoksa
   sonuç BLOCKED olur; kodda izin sınırını aşan bir alternatif uygulanmaz.

Bu ön kontrol kurulumu veya mesaj gönderimini yetkilendirmez. Kurulum
sırasında gerçek callback kabulünde yeni kaynak hatası çıkarsa kapsam ayrıca
somutlaştırılır; bu gate şimdiden yeni refactor veya paket yükseltmesi önermez.

## Doğrulama ve sonuç

- **LOCAL_STATIC:** kaynak zinciri, kurulu SDK popup/redirect uygulaması,
  ürün origin/session guard'ları, callback metadata ve return-path allowlist'i.
- **LOCAL_TEST:** güncel `near-auth-lab`, `near-auth-session`, `wallet-provider`
  paketleri **126 PASS / 3 dosya**; strict auth tip kontrolü **PASS**.
  Testlerin SDK/provider kısmı mock; gerçek callback izin listesi kanıtı değil.
- **PROVIDER (önceki gate):** callback mismatch ekranı ve ayrıca başarılı
  popup girişleri. Bu tur yeni provider giriş/ayar çağrısı yapılmadı.
- **UNPROVEN:** yönetici erişimi, mevcut Dashboard listesi, başarılı gerçek
  redirect callback, hosted origin ve ilk passkey popup hatasının nedeni.
- **EXTERNAL_NOT_RUN:** provider değişikliği, yeni login/token/imza, ödeme,
  upload, CI/GitHub/deploy. Yerel runtime gönderimleri kapalı tutuldu.
- **LOCAL_STATIC:** doküman build ve diff kontrolü PASS; mevcut 500 kB bundle
  uyarısı sürer. Başlangıç hash'leriyle yalnız bu rapor ve ana planın değiştiği
  doğrulandı; dosya silinmedi.

Ön kontrolü durduran blocker yok; sonraki provider setup için yönetim erişimi
ve exact değişiklik onayı gerekiyor. Yalnız bu rapor ve ana plan değişti.
Kanıt dizini: `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-redirect-preflight-u6z8s545/`.
