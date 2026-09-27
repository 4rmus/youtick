# NEAR Auth V1 — kök callback kaynak uyarlaması

Gate: `NEAR_AUTH_V1_REDIRECT_ROOT_SOURCE`.
25 Eylül 2026 — **PASS (yerel kaynak kabulü)**.

Ürün yönlendirmeli girişi artık `window.location.origin` değerini kullanır;
mevcut localhost için OAuth dönüş adresi tam olarak `http://localhost:3000`.
Kökteki giriş yanıtı mevcut `/auth/callback` sayfasına aktarılır. Callback
orada SDK ve sunucu tarafından doğrulanır; kullanıcı güvenli appState
hedefine döner. Bu kaynak sonucu, ortak Auth0 client'ının kök adresine izin
verdiği veya önceki sağlayıcı hatasının canlıda çözüldüğü anlamına gelmez.

## Değişiklik

- `apps/web/lib/near-auth-lab.ts`: yalnız ürün redirect URI'si origin oldu.
  Popup, imza onayı ve lab'in `/auth-lab` dönüşü korunur.
- `apps/web/middleware.ts`: yalnız GET `/` ve OAuth yanıt alanları için,
  geçerli ürün ayarı ve aynı origin/Host koşuluyla sabit `/auth/callback`
  adresine 307 aktarım. Query korunur; `Cache-Control: no-store` ve
  `Referrer-Policy: no-referrer` yazılır. Oturum/cookie oluşturulmaz.
- Mevcut NextURL loopback adreslerini localhost'a normalleştirdiğinden
  özgün Host da kontrol edilir. 127.0.0.1, IPv6 loopback, farklı port/domain
  üzerinden localhost'a kod taşınmaz; Host yoksa aktarım açılmaz.
- Normal landing sayfası, mevcut callback rotası, lab izolasyonu ve kapalı
  ürün davranışı aynı kalır. WalletProvider, API, cihaz ve ödeme kodu değişmedi.

## Doğrulama

**LOCAL_TEST:** değişiklikten önce yeni beklentiler 8 hata verdi: iki ürün
redirect hedefi ve altı kök callback aktarımı. Düzeltme sonrasında ilk odaklı
paket 170 PASS; Host sınırları eklendikten sonra tam Web paketi **1009 PASS /
50 dosya**. Yeni kontroller:

- Başarı/hata/eksik yanıtların sabit callback'e aynı query ile aktarılması;
  query'deki dış returnTo'nun aktarım hedefini değiştirememesi.
- Normal sayfa ve callback döngüsü, kapalı/yanlış ürün ayarları, lab önceliği,
  POST gövdesinin aktarılmaması ve origin/Host sınırları.
- Kurulu Auth0 SPA 2.26.0 SDK'sının özgün kök redirect URI, verifier, nonce
  ve appState'i callback aktarımından sonra koruması; yanlış state ve tekrar
  işlenen callback'in reddi. Token değişimi mock, ağ çağrısı yasak.
- Mevcut giriş/callback testleri upload/watch hedefini korur; mevcut oturum,
  yanlış token, eksik/iptal callback, popup ve lab testleri tam pakette geçer.

**LOCAL_STATIC:** strict auth tip, tüm Web tip kontrolü, değişen beş kaynak/test
dosyasının lint'i, doküman build ve başlangıca göre kapsam/diff kontrolleri
PASS. Doküman build'in mevcut 500 kB bundle uyarısı sürer. Manifest/lock/kurulu
Auth0 SPA 2.26.0, near-api-js 7.3.0 ve jose 6.2.12 aynı kaldı.

Değişen testler: `near-auth-lab.test.ts`, `csp-proxy.test.ts`,
`near-auth-token-cache.test.ts`. Bu rapor ve ana planla toplam yedi dosya
değişti; diğer kaynak hash'leri ve Git index korundu.
Başlangıç/diff kanıtı: `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-root-source-yw0lisq5/`.

## Canlı kabul sınırı ve sonraki gate

**EXTERNAL_NOT_RUN:** gerçek Auth0 authorize/login/token, browser/StrictMode
E2E, provider/config/iletişim, ödeme/upload, runtime restart, Web build,
CI/GitHub/deploy. Yeni kayıt silme, yeniden imza veya ödeme yok.
Bu turdaki testler yerel/sentetiktir; SDK testinin mock token değişimi gerçek
sağlayıcı izni veya Google/passkey hesabı kabulü değildir.

Kaynak gate'inin blocker'ı yok. Ortak client'ın bu tek kök URI'ye izni ve
gerçek kullanıcı dönüşü **UNPROVEN**.
**Tek sonraki gate: `NEAR_AUTH_V1_REDIRECT_ROOT_ACCEPTANCE` — başlatılmadı.**
O gate önce çalışan origin/client ve altı kapalı gönderim bayrağını doğrular;
mevcut kayıtları koruyarak yalnız giriş dönüşünü kullanıcıyla kabul eder.
Denenecek tek adres bu kaynakta belirlenen origin'dir; ret halinde başka
adres/port/client denenmez. Provider ayarı değiştirme veya iletişim yoktur.
