# NEAR Auth test hesabı hazırlama ekranı

Gate: `NEAR_AUTH_ACCOUNT_PROVISIONING` — **PASS / kapalı**.
Kullanıcının tamamladığı fonlama ve hesap/anahtar eşleşmesi zincirde doğrulandı. Yeni transfer gerekmez.

## Kapsam

Yalnız kapalı development/testnet/loopback lab. Google kimliğinden türetilen
hedef için tam 0,1 test NEAR Transfer hazırlanır. Bütçe hedefi giderler dahil
0,12 test NEAR'dır. Gerçek cüzdan onayını kullanıcı verir.

Bu gate'te değişen kaynak dosyalar:

- `apps/web/lib/near-auth-account-preflight.ts`
- `apps/web/app/api/auth-lab/account/route.ts`
- `apps/web/lib/near-auth-funding.ts`
- `apps/web/components/NearAuthLab.tsx`
- `apps/web/components/NearAuthFunding.tsx`
- `apps/web/__tests__/unit/near-auth-account.test.ts`
- `apps/web/__tests__/unit/near-auth-funding.test.ts`
- Bu rapor.

Ana WalletProvider, medya, ekonomik kontratlar, paketler ve ayarlar değişmedi.
Önceki kirli çalışma korundu; commit/push/deploy yapılmadı.

## Akış ve sınırlar

1. Kullanıcı Google ile giriş yapar ve **Test hesabı hazırlığını göster** der.
2. Gövdesiz, aynı origin ve şifreli oturum denetimli hesap API'si yeni kimlik
   türetmesi ve NEAR sorguları yapar. İstemciden hedef/anahtar alınmaz.
3. Herhangi bir eşleşen hesap veya var olan hedef adres bulunursa yeni fonlama
   açılmaz. Eski cüzdan Google hesabı olarak gösterilmez.
4. Aynı kesinleşmiş bloktaki protokol yapılandırması ve gas fiyatı okunur.
   Protokol 85 için create-account, full-access-key, transfer ve muhafazakâr
   on receipt maliyeti toplamı, gas satın alma fiyatıyla karşılaştırılır.
   0,02 test NEAR gider sınırı aşılırsa veya protokol değişmişse durulur.
5. Tam hedef adresi, açık anahtar ve bütçe ekranda gösterilir. Kullanıcı
   uygulamanın mevcut sabitlenmiş Meteor sürümüyle gönderen hesabı seçer.
   Connector tercihi yalnız bellekte tutulur; eski seçili cüzdan otomatik
   yüklenmez. Sign-in sırasında FunctionCall key/cihaz yetkisi istenmez.
6. Gönderen ayrı etiketlenir. Kullanıcı onay kutusunu işaretleyip **0,1 test
   NEAR için cüzdan onayını aç** düğmesine basar. O ana kadar transfer çağrısı yoktur.
7. Düğme hedefi, kimliği, hesap varlığını, bütçeyi ve seçili göndereni tekrar
   kontrol eder. Taze sonuçla yalnız tek Transfer eylemi cüzdana gider.
8. Web Lock ve hedefe bağlı yerel kayıt tekrar gönderimi önler. Kayıt cüzdan
   çağrısından önce yazılır; kayıt yazılamıyorsa transfer açılmaz. Sayfa yenileme
   veya ikinci sekme aynı tarayıcı profilinde bunu aşamaz.
9. Cüzdan yanıtı belirsiz/iptal ise de yeniden gönderim açılmaz; önceki deneme
   elle incelenir. Bu bilinçli lab sınırıdır. Başka tarayıcı profiline veya
   yerel kayıtların elle silinmesine karşı dağıtık tekilleştirme değildir.
10. **Hesabın durumunu doğrula** yalnız zinciri okur. Başarı için aynı hedefte
    türetilen anahtarın FullAccess kaydı gerekir. Google/MPC imza yeteneği
    bu sonuçla doğrulanmış sayılmaz.

Önemli bütçe sınırı: NEAR Transfer eyleminde imzalı bir `maxFee` alanı yoktur.
0,12 uygulamanın ön kontrolü ve kullanıcının cüzdan onayı için bütçedir;
protokol tarafından zorlanan bir üst limit değildir. Cüzdanda toplam daha
yüksekse kullanıcı reddetmelidir. UI bunu açıkça belirtir. Kaynak cüzdanın
bakiye/yetki yeterliliği ve nihai ücret cüzdanda ayrıca denetlenir.

Fonlama ön kontrolünün dış sorguları toplam 30 saniye ile sınırlı; normal
hesap kontrolü 20 saniyedir. Yerel kayıt yalnız hedefe bağlı anahtar altında
deneme durumu/zamanı ve varsa işlem hash'i tutar; token veya özel anahtar tutmaz.

## Doğrulama

- `LOCAL_TEST`: 38 dosyada 495 test geçti. Hesap/kimlik değişimi, eski sonuç, yanlış gönderen, yüksek
  ücret, değişmiş protokol, var olan hesap, çift deneme, ikinci sekme kilidi,
  depolama hatası ve belirsiz cüzdan yanıtı testleri. Cüzdan sahtedir;
  testlerin hiçbiri gerçek imza/transfer oluşturmaz.
- `LOCAL_TEST`: ekran tam adres ve tutarları gösterir; render sırasında
  cüzdan bağlantısı veya transfer otomatik başlamaz.
- `LOCAL_STATIC`: mevcut katı auth-server tipi kontrolü, uygulama lint/build.
  Yeni client kodu uygulama build'inin tip kontrolündedir. NearConnect'in
  mevcut deklarasyonları eksik `@near-js` type bağımlılıkları içerdiğinden
  bütün üçüncü taraf client deklarasyonları için `skipLibCheck:false`
  başarısı iddia edilmez. Mevcut tsconfig ve bağımlılıklar değiştirilmedi.
- `PROVIDER`: sentetik kimlikle gerçek testnet hazırlığı, blok 268840759;
  hedef yok ve ücret ön kontrolü uygun. Gerçek kullanıcı/transfer kanıtı değildir.
- `LOCAL_TEST`: yerel production modunda flag açıkken yeni hazırlık isteği
  404 döndü; çerez üretmedi. Canlı production testi değildir.
- `PROVIDER`: kullanıcının gönderimi, RPC `tx` sorgusunda FINAL + SuccessValue.
  İşlem tam olarak beklenen hedefe tek Transfer; tutar 0,1 test NEAR.
  İşlem ve receipt `tokens_burnt` toplamı 0,0071149895375 test NEAR;
  toplam çıkış 0,1071149895375 test NEAR, 0,12 bütçenin altında.
- `PROVIDER`: kesinleşmiş blok 268848668'de hedef bakiye tam 0,1 test NEAR,
  locked=0 ve ekranda gösterilen Google anahtarı FullAccess. İkinci transfer yapılmadı.
- Gerçek Brave ekranında tam yetki doğrulama sonucu ve tekrar gönderim kilidi
  görüldü. Fonlayan cüzdanın onay anı kullanıcı tarafından tamamlandı;
  agent tarafından gözlenmiş imza ekranı kanıtı iddia edilmez.
- İlk yenileme denemesi ERR_CONNECTION_REFUSED verdi; port 3000'de sunucu
  yoktu. Launcher yeniden açıldı; geçici session secret değiştiği için yeniden
  giriş gerekti. Kullanıcı yeniden girişi ve yenilemeyi tamamladığını bildirdi.
- Gerçek Brave kontrolünde tam sayfa navigasyonu/yeniden yüklemeden sonra
  oturum korundu, yeni salt okunur sorgu aynı fonlanmış implicit hesabı buldu.
  Ardından deneme oturumundan çıkış imzasız tamamlandı ve giriş ekranı döndü.
- `EXTERNAL_NOT_RUN`: Google/MPC imzası, cihaz kaydı, medya satın alma,
  izleme/yükleme, CI ve deploy. Bu doğrulama turunda uygulama kodu değişmedi;
  önceki 495 test sonucu yeniden çalıştırılmış gibi sunulmaz.

Kanıt klasörü: `tmp/near-auth-account-provisioning/evidence/`.

## Yerel ana uygulama / çıkış hatası — 16 Eylül düzeltmesi

Kullanıcının normal localhost ana sayfasında gördüğü `utick2.testnet`, fonlayan
eski cüzdan bağlantısıydı. Google implicit hesabı değildi. Lab launcher'ı
`access.testnet` / `market.testnet` placeholder ayarlarıyla normal uygulama
sayfalarını da açabiliyordu. Normal WalletProvider çıkışta
`revokeBrowserAuthority` → `revoke_subject_sessions` işlemini hazırlıyordu.
Blok 268850189'da `access.testnet` hesabının code_hash'i boş sözleşme değeridir;
CodeDoesNotExist hatası bu yerel ayar hatasıyla uyumludur.

Düzeltme: development + NEAR_AUTH_LAB_ENABLED=true + testnet birlikteyken
normal sayfalar /auth-lab'e yönlendirilir. Ön yükleme istekleri de bu kontrolden
geçer. Auth callback ve Next geliştirme varlıkları korunur. WalletProvider,
gerçek çıkışta yetki iptali ve cüzdanın saklanan hesap seçimi değiştirilmedi.
Bu, gerçek kontratlara bağlı ana uygulamanın cüzdan çıkış kabul testi değildir.

Bu düzeltme turunda değişen dosyalar: `apps/web/middleware.ts`,
`apps/web/__tests__/unit/csp-proxy.test.ts`, bu rapor. Yeni bağımlılık yok.
`LOCAL_TEST`: toplam 38 dosyada 505 test; lint ve build geçti. Yerel HTTP
ana sayfa/profile/upload ön yüklemeleri 307 → /auth-lab. Yerel production
modunda flag açık olsa da ana sayfa 200, lab 404; canlı deploy yapılmadı.
Gerçek Brave root navigasyonu lab'e ulaştı; eski Meteor iframe'i/normal
cüzdan menüsü görünmedi. Google oturumu korundu, hesap yeniden bulundu,
lab çıkışı cüzdan imzası açmadan tamamlandı. Yeni zincir işlemi gönderilmedi.
Kanıt: `tmp/near-auth-local-isolation/evidence/`.

## Tek sonraki gate

`NEAR_AUTH_GOOGLE_SIGNING_PREFLIGHT`: Google kimliğiyle bir gerçek testnet
işleminin imzalanması için akış ve kesin bütçe hazırlığı. Otomatik başlamadı.

Son fonlama kayıtları: `final-transfer-redacted.json`, `final-account-redacted.json`.
Ham JWT/subject/çerez veya gerçek anahtar/adres bu kayıtlara yazılmadı.
