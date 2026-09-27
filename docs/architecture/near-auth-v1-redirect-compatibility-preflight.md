# NEAR Auth V1 — site köküne dönüş uyumluluğu

Gate: `NEAR_AUTH_V1_REDIRECT_COMPATIBILITY_PREFLIGHT`.
25 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Site köküne dönüş teknik olarak uyarlanabilir; ortak Auth0 client'ının bu
adrese izin verdiği henüz kanıtlanmadı.** Yalnız `redirect_uri` değiştirmek
mevcut ürün akışını tamamlamaz. En küçük kaynak adayı, kökteki OAuth yanıtını
mevcut `/auth/callback` rotasına aynı origin içinde aktarmaktır. Yeni kimlik
sistemi, SDK değişimi, sunucu taşıma veya sağlayıcıyla iletişim gerektiren
bir kaynak ihtiyacı bulunmadı. Bu sonuç gerçek redirect kabulü değildir.

Bu gate yalnız bu rapor ve ana planı değiştirir. Kaynak, bağımlılıklar,
provider/config, kullanıcı oturumu, cihaz/ödeme kayıtları, runtime restart,
Git/CI/deploy kapsam dışıdır. Kabul: tek aday adres, mevcut kaynak eksiği,
korunacak kontroller, yerel kanıt ve sonraki kaynak kapsamı somutlaştırılır.

## Resmî örnek ve kanıt sınırı

[NEAR Auth JavaScript provider](https://docs.auth.near.org/sdks/javascript-provider)
giriş örneği `redirectUri: window.location.origin` kullanır. İncelenen
[sabit upstream belge kaynağı](https://github.com/Peersyst/fast-auth/blob/38dc894afbc94c198c207f52e6d01d695199eaa1/apps/docs/sdks/javascript-provider.mdx)
aynı örneği içerir. Bu ortam için tek aday **`http://localhost:3000`** değeridir;
`/auth/callback`, farklı port, 127.0.0.1 veya başka adresler denenmedi. Bu değer
OAuth parametresidir; tarayıcıda kök sayfanın pathname'i `/` olur. Sondaki slash
varyantları eşdeğer izinli sayılmaz; ileride istek/transaction aynı değeri tutmalı.

[Auth0 SPA başlangıç belgesi](https://auth0.com/docs/quickstart/spa/vanillajs)
localhost kullanımını örnekler; adresin Allowed Callback URLs ile eşleşmesi
gerektiğini söyler. [Auth0 yönlendirme belgesi](https://auth0.com/docs/authenticate/login/redirect-users-after-login)
callback adresiyle uygulama içindeki son hedefi ayrı ele alır. Örnek adres,
mevcut ortak client'ın canlı izin listesi değildir. Önceki popup başarısı da
aynı adresin redirect akışında izinli olduğunu kanıtlamaz.

Kurulu/lock Auth0 SPA **2.26.0**, near-api-js **7.3.0**, jose **6.2.12**;
manifestlerle uyumlu. Genel doküman örnekleri mevcut sürüm/API'leri değiştirme
gerekçesi olarak kullanılmadı.

## Mevcut kaynakta eksik olan

| Katman | Kaynak davranışı ve etkisi |
| --- | --- |
| `near-auth-product.ts` / `near-auth-lab.ts` | Giden ürün adresi sabit `/auth/callback`. `appState.returnTo` profil/upload/watch hedefine ayrı, güvenli kontrolle bağlanır. |
| `WalletProvider.tsx:205–221` | Callback kararı yalnız `/auth/callback` pathname'ine göre verilir. Kökte başarılı SDK dönüşünden sonra `returnPath()` ile son hedefe gidilmez. Kayıtlı tercih wallet/none ise kökte auth restore hiç çalışmaz. |
| `near-auth-lab.ts:88–105` | Kökte çağrılsa da callback query'sini sabit `/auth/callback` ile temizler. Bu history güncellemesi Provider'ın önceden aldığı callback kararını veya sayfa içeriğini yeniden kurmaz. |
| `app/page.tsx` / `middleware.ts` | Kök sayfa normal landing sayfasıdır; kök OAuth yanıtını callback'e aktaran sunucu yolu yoktur. Callback sayfasındaki no-referrer/noindex ve sade içerik davranışını korumak gerekir. |
| Kurulu SDK `Auth0Client.ts` | Kod değişiminde adresi mevcut pathname'den değil, saklanan OAuth transaction'ın `redirect_uri` alanından alır. Aynı origin içindeki callback aktarımı bu özgün değeri koruyabilir. |

## İzole yerel kontroller

Uygulama dosyaları değiştirilmeden mevcut Vitest kurulumunun geçici kopyasında
**6 kontrol PASS**:

1. Kök callback'te auth yardımcısı hedefi okur ama URL'yi `/auth/callback` yapar.
2. Kök + near-auth tercihi: Provider oturumu okur, hedefe `replace` yapmaz.
3. Mevcut `/auth/callback` + near-auth tercihi: Provider hedefe `replace` yapar.
4. Kök + wallet tercihi: auth callback restore atlanır.
5. Kök + none tercihi: auth callback restore atlanır.
6. Gerçek kurulu Auth0 SDK, kök `redirect_uri` ile saklanmış sentetik transaction'ı
   `/auth/callback` üzerinde işleyince özgün adresi, PKCE verifier'ı, nonce'ı ve
   appState'i korur; aynı callback'in ikinci işlenmesini reddeder.

İlk beş kontrol mevcut uyumsuzluğu gösterir, düzeltme kabulü değildir. Altıncı
kontrolde token değişim metodu mock'tur ve ağ çağrısı engellenmiştir; gerçek
provider/JWT kabulü değildir. Kopya testlerde isim filtresi dışında kalan 108
test çalıştırılmadı. Ayrıca mevcut 137 odaklı Web testi ve strict auth tip
kontrolü PASS. Tarayıcı, gerçek kimlik, cookie, token veya ödeme kullanılmadı.
Geçici kanıt dizini: `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-redirect-compat-waudwxgf/`.

## En küçük kaynak adayı

**Tek sonraki gate: `NEAR_AUTH_V1_REDIRECT_ROOT_SOURCE` — başlatılmadı.**

- Ürün redirect isteği resmî örnekteki origin değerini kullanır; popup ve lab
  akışları aynı kalır. `/auth/callback` tamamlayıcı rota olarak korunur.
- Mevcut middleware yalnız ürün açık, lab kapalı ve origin eşleşiyorken `/`
  üzerindeki OAuth yanıtını sabit aynı-origin `/auth/callback` adresine aktarır.
  Yeni genel returnTo/redirect endpoint'i eklenmez. Normal ana sayfa korunur.
- Callback query'si aktarımda korunur; ham kod/state loglanmaz. Yanıt cache'e
  girmez, referrer göndermez; landing içeriği callback işlenmeden render edilmez.
- SDK'nın sakladığı `redirect_uri`/state/PKCE/nonce kaydı değiştirilmez. Sahte,
  eksik, hatalı veya tekrar callback oturum açamaz. Mevcut server token kontrolü,
  StrictMode tek işleme, hedef allowlist'i ve hesap/cihaz sınırları korunur.
- Kaynak kapsamı: `near-auth-lab.ts`, `middleware.ts`, mevcut ilgili auth ve
  middleware testleri, gerekirse mevcut izole UX harness'i ve ana plan.
  WalletProvider/landing veya yeni bağımlılık ancak somut zorunluluk çıkarsa
  ayrıca değerlendirilir; doğrudan bir yeniden yazım planlanmaz.

Bu kaynak gate'i yalnız yerel uyarlamayı hazırlar. Paylaşılan client iznini
kanıtlamaz veya sağlayıcı sınırını aşmaz. Daha sonraki ayrı gerçek kabulde,
gönderim bayrakları kapalı ve kayıtlar korunmuşken yalnız bu tek belgeli aday
denenir; ret olursa otomatik başka adres/tenant/port denemesi yapılmaz.
Kaynak tamamlanmadan mevcut gerçek oturumla köke redirect denenmedi.

## Sonuç ve dış sınır

**LOCAL_STATIC / LOCAL_TEST:** kaynak/SDK ve belgeli aday karşılaştırması,
6 izole kontrol, 137 mevcut test, auth tip ve doküman/kapsam kontrolleri PASS.
Doküman build'in mevcut 500 kB bundle uyarısı sürer.
**UNPROVEN:** ortak client'ın kök callback izni, gerçek redirect/token değişimi
ve Google/passkey ürün dönüşü. **EXTERNAL_NOT_RUN:** yeni authorize/login,
provider yönetim/config, kullanıcıya imza/ödeme/upload, runtime restart,
CI/deploy veya sağlayıcıyla iletişim.

Ön kontrolü durduran blocker yok; canlı kabul için provider uyumluluğu açık.
Önceki provider setup yönetim erişimi engeli ayrı tarihsel kayıt olarak kalır;
kullanıcının iletişimsiz ilerleme tercihiyle bu gate'te tekrar denenmedi.
