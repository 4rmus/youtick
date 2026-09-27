# Ana uygulama oturum kabulü

Gate: `NEAR_AUTH_V1_SESSION_UI_ACCEPTANCE`.
22 Eylül 2026 — **COMPLETED_WITH_WARNINGS / yerel ana uygulama kabulü**.

## Hazırlanan somut kapsam

- Aynı `http://localhost:3000` origin'inde ürün session UI testi; mevcut
  public-testnet Market/Access/Bridge ve test NEAR Auth client'ı kullanılır.
- Çalışan lab sunucusu kontrollü yeniden başlatılacak; lab modu kapalı,
  `NEAR_AUTH_V1_ENABLED=true` olacak. Yeni ürün oturum secret'ı yalnız bellekte
  üretilecek. Kalıcı env dosyası veya provider ayarı değiştirilmeyecek.
- Aynı origin'deki cihazlar, taslaklar ve ödeme kayıtları korunacak. Eski lab
  oturum secret'ı mevcut başlatıcıda yalnız bellekte üretildiğinden yeniden
  başlatma sonrasında yeniden giriş gerekebilir; bu cihaz kaybı değildir.
- `next.config.ts` yerel OpenNext bağlantılarını şu an sadece lab modu için
  başlatıyor. Ürün modunda ana uygulamanın RPC/profil okumaları için aynı
  development + testnet + remoteBindings=false sınırında küçük genişletme
  hazırlanmıştır; gerçek kaynak dosyasına henüz uygulanmadı.

Hazır yerel dosyalar:
`tmp/near-auth-session-ui-acceptance/serve.mjs` ve `next-config.patch`.
Başlatıcı syntax kontrolü PASS; kullanılan public artifact'in ağ, kontratlar,
Bridge ve tam localhost origin değerleri doğrulandı. Çalışan sunucu değişmedi.

Ürün ortamı ayarları henüz tanımlı değil; mevcut sunucu lab modunda çalışıyor.
Provider `/auth/callback` allowlist'i henüz doğrulanmadı veya değiştirilmedi;
önce mevcut popup yolu, gerektiğinde onaylı callback kapsamı değerlendirilecek.

## Kabul ölçütleri

Gerçek Google/passkey/wallet girişi, doğru aktif hesap, profile/reload,
hesap değişiminde eski yanıtların etkisiz kalması; yeni yöntemle ödeme/çekim
başlamaması. Yeni fonlama, imza, upload, satın alma, Git yayını veya deploy yok.
Sadece giriş ve salt-okunur hesap/medya kontrolleri yapılacak; wallet çıkışında
zincir imzası istenirse kullanıcı onayı olmadan ilerlenmeyecek.

Repo AGENTS.md secret/config değişikliği için açık onay istediğinden somut
kapsam kullanıcıya sunuldu. Onay gelmeden sunucu durdurulmadı, ayar uygulanmadı.
Önceki source gate'in 909 test / 25 UX / 16 playback sonuçları tarihsel yerel
kanıttır; bu gate'te yeni canlı kabul verilmedi.

Başlangıç dosya/index referansı:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/session-ui-acceptance-ji24l18w/`.

Tek devam gate'i aynı kabul gate'idir. Bu kayıt sonraki ödeme veya deploy
adımını başlatmaz.

## Onaylı yerel hazırlık

Kullanıcı somut yerel kapsamı onayladı. `next.config.ts` yalnız development,
testnet ve açık public-testnet ürün modu için aynı yerel OpenNext bağlantısını
başlatacak şekilde genişletildi. `remoteBindings=false`, `persist=false` ve
üretim/mainnet retleri korundu; **10 yerel test PASS**. İlk patch uygulamasında
path-strip hatası nedeniyle dosya değişmedi; test beklenen yeni durumu reddetti.
Doğru path ile uygulama sonrası test geçti.

Eski lab başlatıcısı doğrulanıp kontrollü kapatıldı; hazırlanmış ürün başlatıcısı
`127.0.0.1:3000` üzerinde çalışıyor. `NEAR_AUTH_V1_ENABLED=true`, lab=false;
secret yalnız süreç belleğinde. Kalıcı env veya provider ayarı değişmedi.
HTTP `/profile` **200**, ürün giriş düğmesi mevcut ve lab'e yönlenmiyor;
`/api/auth/session` **200 / authenticated=false**, `/api/auth-lab/session` **404**.

Brave ana profilinde önceki wallet **soteri.testnet** kendiliğinden geri geldi;
profil creator bakiyesi **5,82 USDC** gösterdi. Çekim/ödeme yapılmadı. Google
ile hesap değişimi kullanıcıya bırakıldı; gerçek yöntem/reload kabulü devam ediyor.

## Gerçek ana uygulama kabulü ve kapanış

**COMPLETED_WITH_WARNINGS.** Yerel ürün modu kullanıcı onayıyla açık bırakıldı;
kalıcı env, sağlayıcı ayarları veya dış dağıtım değişmedi.

### Bulunan ve düzeltilen hesap sorgusu hatası

Google girişinde `/api/auth/session` **200** dönerken `/api/auth/account`
**400** verdi. Next.js boş POST'u null yerine kapanmış ReadableStream olarak
sunabiliyor; ürün route'u `request.body` varlığını doğrudan reddediyordu.
Mevcut lab route'undaki bounded ilk-okuma kontrolü kullanıldı: gerçekten boş
stream kabul edilir; veri taşıyan gövde ve query hâlâ reddedilir. İstemciden
kimlik kabul edilmez. Regresyon düzeltmeden önce **400 != 200** ile başarısız
oldu; düzeltmeden sonra boş stream 200, veri taşıyan stream 400 geçti.

Kullanıcıdan yeni Google girişi istenmeden sayfa yenilendi; mevcut doğrulanmış
oturumdan profil açıldı. Bu bir sağlayıcı arızası veya cookie/anahtar kaybı değildi.
Yeni kod/test kapsamı: `app/api/auth/account/route.ts`, ilgili session testi,
önceki onaylı `next.config.ts` yerel ürün bağlantısı ve dev-runtime testi.

### Doğrulanan gerçek davranışlar

| Adım | Gözlenen sonuç |
| --- | --- |
| İlk wallet restore | soteri.testnet, creator bakiyesi **5,82 USDC**; ödeme/çekim yapılmadı. |
| Google girişi | Kullanıcının Google adımından dönen `37729f76f581ce6e2cc9cc08e48b9f098158cf4bd044d62fe2a9f4bfd06c23d9` hesabı profilde ve mobil menüde eşleşti. |
| Google reload | Hesap sorgusu düzeltmesinden sonra yeniden giriş olmadan aynı kimlik geri geldi; Withdraw devre dışı. |
| Passkey geçişi | Kullanıcı passkey ile giriş yaptığını teyit etti; profil ve menü `9db6cbd959c2ad427dc68b77b905edd0b8470431e3a3a9abebf0ee41a659d21a` hesabına geçti. |
| Passkey reload | Aynı hesap ve NEAR Auth oturumu korundu; Withdraw devre dışı. |
| Upload sınırı | `/upload` yalnız Google/passkey upload ödemesinin henüz açık olmadığını gösterdi; dosya/ödeme başlatılmadı. |
| Yeni bilet sınırı | `lp-f263096b-8992-4fd8-afc4-7b4c758cfc82` için Ticket required; **Pay 2 USDC** devre dışı. |
| Mevcut hak/cihaz | Önceden satın alınmış Distance, ana `/watch` sayfasında **1:31'den devam** ile açıldı; **1280×720**, readyState4, paused=false, error=null; konum91,733262sn. Yeni cihaz veya bilet yok. |
| Son wallet dönüşü | Kullanıcı Meteor/soteri bağlantısını tamamladı. Profil/menü soteri.testnet; reload sonrası aynı hesap ve **5,82 USDC** korundu. |

Aradaki uzun bekleme sonrası NEAR Auth odak/oturum kontrolü başarısız olduğunda
eski kimlik UI'den bırakıldı; kullanıcı wallet'a bundan sonra döndü. Bu gözlem,
iki oturum da henüz geçerliyken ters yönde eşzamanlı seçim yarışının canlı
kabulü olarak sunulmaz; o koruma önceki yerel testlerde doğrulanmıştır.
Wallet Disconnect veya Withdraw'a basılmadı; zincirde yetki iptali istenmedi.

### Doğrulama ve sınırlar

- **LOCAL_TEST:** Web **48 dosya / 915 PASS**, auth tip kontrolü ve lint PASS.
  10 dev-runtime koşulu ve boş POST stream regresyonu dahil.
- **PROVIDER / localhost + testnet:** gerçek Google/passkey/wallet kullanıcı
  girişleri, profil/menü, reload, kimlik değişimi ve mevcut hakla oynatma.
- Yeni ürün API/callback için tam yönlendirmeli sağlayıcı allowlist kabulü
  **EXTERNAL_NOT_RUN**; popup yolu kullanıldı, sağlayıcı ayarı değiştirilmedi.
- Hosted Preview/Production, tam süre/çoklu cihaz matrisi ve ekonomik işlem
  entegrasyonu kabulü verilmedi. Kaynak gate'in kapalı/açık build ve sentetik
  UX sonuçları bu canlı kontrollerden ayrıdır.
- Yeni fonlama, satın alma, upload, çekim, eski imza araştırması, CI/deploy
  veya GitHub gönderimi yapılmadı. Mevcut cihazlar/taslaklar temizlenmedi.
- Doküman build PASS; mevcut boyut uyarısı sürer. Kaynak/index koruma kontrolü
  hedefli dört kod/test dosyası ve iki rapor değişikliğini ayırır.

Kanıt: aynı başlangıç dizinindeki `live-acceptance.json`. Yeni başlatıcı
`tmp/near-auth-session-ui-acceptance/serve.mjs` altında; secret yalnız süreçte.
Sunucu yeniden başlatılırsa bu ürün oturumuna yeniden giriş gerekebilir.

**Tek sonraki önerilen gate: `NEAR_AUTH_V1_PAYMENT_FLOW_PREFLIGHT` — başlatılmadı.**
Ana uygulama için dar ödeme adaptörleri, arka plan MPC göndericisi ve hesap/
bakiye hazırlığının somut kapsamı. Bu kapanış yeni ekonomik işlem veya provider
ayarı yetkisi oluşturmaz.
