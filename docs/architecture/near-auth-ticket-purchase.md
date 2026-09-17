# Google imzasıyla test bileti ve ilk cihaz

Gate: `NEAR_AUTH_TICKET_PURCHASE_SOURCE` — **COMPLETED_WITH_WARNINGS / kapalı**.
16 Eylül 2026. Kapalı lab için kaynak uygulaması ve yerel doğrulama tamamlandı.
Gerçek Google onayı, sponsor işlemi, USDC ödemesi veya cihaz kaydı yapılmadı.

## Kapsam ve değişen dosyalar

Amaç: mevcut Google/MPC imza yoluyla tek `ft_transfer_call` içinde bir bilet
satın almak ve ilk V3 cihazını yetkilendirmek. Kabul: fiyat/hedef/hesap/cihaz
bağının korunması, tekrar gönderimin engellenmesi, ödeme iadesinin başarı
sayılmaması ve kesinleşmiş ödeme + hak + cihazın birlikte doğrulanması.

- `apps/web/lib/near-auth-ticket-purchase.ts`: yalnız bu satın alma türünün
  oluşturulması, doğrulanması ve salt okunur ön kontrolleri.
- `apps/web/lib/near-auth-signing-server.ts`: mevcut şifreli inceleme,
  Google tokenı, MPC imzası ve kesinleşme kontrollerine bilet türü eklendi.
- `apps/web/lib/near-auth-signing.ts`: mevcut cihaz hazırlığının kullanılması,
  cihaz değişiminde durma, ayrı satın alma deneme kilidi.
- `apps/web/app/api/auth-lab/signing/route.ts`: yalnız sabit
  `prepare-purchase` alanları; serbest işlem/hedef/tutar kabul edilmez.
- `apps/web/components/NearAuthSigning.tsx`: mevcut inceleme/onay ekranı
  bilet adı, fiyatı, sözleşmeleri ve cihaz açıklamasıyla kullanılır.
- `apps/web/components/NearAuthLab.tsx`: hak bulunmayan video için satın
  alma bölümü; ön kontrol sonucunun bir anlık durum olduğu açıklandı.
- `apps/web/__tests__/unit/near-auth-signing-server.test.ts`
- `apps/web/__tests__/unit/near-auth-signing-client.test.ts`
- `docs/architecture/near-auth-media-preflight.md`: sonraki gate bağlantısı.
- Bu rapor. Yerel kanıt: `tmp/near-auth-ticket-purchase/evidence/`.

Yasak/değişmeyen kapsam: kontratlar, Bridge, D1, WalletProvider, paketler,
provider/secret/config dosyaları ve feature flag varsayılanları. Önceki yerel
değişiklikler korunur. Ana uygulamanın cüzdan ve satın alma yolları değiştirilmedi.
Yeni bağımlılık, relayer servisi veya genel imzalama API'si eklenmedi.

## Kullanım ve güven sınırları

1. Mevcut `/auth-lab` oturumu ve medya ön kontrolü kullanılır. Hak bulunmayan
   video için kullanıcı sponsor seçip satın alma incelemesini açıkça başlatır.
2. Hesap yalnız doğrulanmış sunucu oturumundan gelir. Tarayıcıdaki mevcut
   `preparePlaybackDevice` aynı hesap/Market/origin için yerel anahtarı yeniden
   kullanır veya ilk kullanımda dışarı aktarılamayan anahtar oluşturur.
   Hazırlık bir zincir cihaz kaydı değildir; mevcut cihaz deposu silinmez.
3. Sunucu cihaz sertifikası özetini hesap, origin, testnet, Market, play kapsamı
   ve 30 günlük süreye göre yeniden hesaplar. İstemci hesabı, fiyatı veya
   serbest işlem eylemlerini sunucuya dikte edemez.
4. Fiyat, ACTIVE yayın, satın almaların açık olması, hak yokluğu, sabit test
   USDC sözleşmesi, altı ondalık, alıcı/Market token kaydı ve alıcı bakiyesi
   aynı kesinleşmiş bloktan okunur. Eksik kayıt/bakiye otomatik tamamlanmaz.
5. Bu pilot yalnız **ilk cihaz** içindir: Market'in mevcut
   `youtick:market:playback-devices:v1:<account>` kaydı salt okunur sorgulanır;
   herhangi bir kayıt veya çözülemeyen sonuçta durulur. Borsh cihaz listesi
   için yeni parser yazılmadı; eski/süresi dolmuş kayıt da otomatik silinmez.
   Canlı kabulde deployed sözleşmenin bu depolama düzeniyle uyumu doğrulanmalı.
6. Tam işlem; bilinen test USDC üzerinde, yapılandırılmış Market alıcısına,
   zincirden okunan tam tutarla `buy_ticket` ve aynı `playback_session` içeren
   tek `ft_transfer_call` olur: 100 TGas + 1 yoctoNEAR. Ek anahtar/transfer yok.
7. İnceleme beş dakika geçerlidir. Tam işlem baytları subject/origin'e bağlı
   şifreli belgede korunur. Google tokenı bu baytlarla eşleşmelidir. Kullanıcı
   fiyat, iki NEAR bütçesi, cihaz yetkisi ve zincirdeki kimlik görünürlüğünü
   görüp açık onay verir. Google onayı ve sponsor gönderimi ayrı düğmelerdir.
8. Sponsor çağrısından önce ve MPC imzasından sonra nonce, FullAccess,
   protokol/fiyat, yayın fiyatı, hak, bakiye ve ilk cihaz şartı yeniden okunur.
   Değişiklikte eski tokenla yeni işlem hazırlanmaz. Cihaz değişimi/çıkış
   bildirimi, bekleyen istemci akışını durdurur.
9. Mevcut self-transfer kilidi korunur. Belirsiz eski deneme varsa satın alma
   gönderilmez. Yeni kilit hesap + Market için **tek satın alma denemesi** ile
   sınırlıdır. Timeout/iptal/yenileme sonrası yeni ödeme başlatılmaz; hash'ler
   korunur. Bu tek tarayıcı profiliyle sınırlı lab'dir, dağıtık tekilleştirme
   değildir. Token ve özel anahtar bu deneme kaydına yazılmaz.
10. İç işlem FINAL olmalı; hedef, eylem, nonce, anahtar ve argümanlar eşleşmeli.
    Token çözümleme sonucu tam bilet tutarının kullanıldığını göstermeli.
    Doğru Market receipt'inde aynı hesap/video/tutar için
    `entitlement_purchased` olayı aranır. Tüm receipt'ler ve ücretler kontrol
    edilir. Son final blokta hak ve aynı sertifika/Google yetkilendirici
    anahtarla 30 günlük cihaz kaydı doğrulanmadan başarı gösterilmez.

Satın almanın geçmesi gerçek video oynatma, çıkış sonrası oynatma güvenliği,
başka cihaz/Safari kabulü veya ana uygulama entegrasyonu değildir. Mevcut
lab oturumundan çıkış cihaz yetkisini zincirde geri almaz; bu gate logout
politikasını değiştirmez. Gerçek playback kabulü sonraki iş olarak kalır.

## Bütçe ve kapalı varsayımlar

- Bilet bedeli: seçilen yayının güncel fiyatı, **test USDC**. Sabit bir video
  veya fiyat kullanıcı adına seçilmedi; kart/gerçek para entegrasyonu yok.
- Sponsor için en fazla **0,35 test NEAR**; 300 TGas ve 1 yocto dış çağrı.
- Google hesabından en fazla **0,12 test NEAR**; 100 TGas iç çağrının geçici
  gas ön ödemesi dahil. Kullanılabilir bakiye kontrolü ayrıca hesap depolama
  rezervini düşer. Bu rakam self-transferin 0,002 bütçesinden ayrıdır.
- Bunlar lab'in ret sınırlarıdır; imzalı protokol `maxFee` garantisi veya
  ölçülmüş gerçek satın alma maliyeti değildir. Canlı denemeden önce güncel
  protokol, bakiye ve cüzdandaki tutarlar yeniden incelenmelidir.
- Önceki Google hesabının bakiyesi bu gate'te yeniden okunmadı. Otomatik
  NEAR/USDC fonlama veya token storage registration yapılmaz.
- Mevcut development + lab flag + testnet + loopback + exact Origin + geçerli
  oturum korumaları sürer. Bilet yolu ayrıca public-testnet ve playback V2
  flag'leri açık değilse reddedilir. Hiçbir varsayılan flag açılmadı.

## Doğrulama

- `LOCAL_TEST`: **41 dosyada 605 test PASS**. İmza istemci/sunucu odaklı
  son koşu **71 test PASS**. Dış Auth0/RPC/cüzdan sonuçları sentetik;
  RSA/JWE, v7 işlem kodlama ve Ed25519 doğrulaması gerçektir.
- Senaryolar: doğru tek bilet+cihaz işlemi; yanlış hesap/origin/cihaz/target;
  farklı gas ve ek action; değişmiş fiyat/nonce; mevcut hak/cihaz; kapalı
  satış; yetersiz USDC/NEAR; eksik token kaydı; refund/eksik event/yanlış
  event kaynağı; eksik hak veya yanlış/eskimiş cihaz; kesinleşmemiş işlem;
  receipt hatası; tekrar gönderim ve ödeme sonrası cihaz değişiminde durma.
- `LOCAL_STATIC`: sıkı auth tip kontrolü, lint, Web build PASS. V7 action
  constructor ile decode edilen biçimin farkı gerçek testte yakalandı;
  hazırlık artık seri hale getirilen gerçek işlem biçimini doğrular.
- Derlemede mevcut middleware adlandırma uyarısı var. Canlı Edge/Cloudflare
  uyumluluğu bu yerel build ile kanıtlanmış sayılmaz.
- `LOCAL_TEST`: production modunda lab ve medya flag'leri açıkken bile
  `prepare-purchase` **404**, `Set-Cookie` yok. Canlı production testi değildir.
- `EXTERNAL_NOT_RUN`: yeni gerçek Google/sponsor onayı, test USDC ödemesi,
  cihaz kaydı, gerçek tarayıcı satın alma/izleme, CI ve deploy.
  Commit/push/PR/merge yapılmadı. Gerçek profil veya anahtar deposuna dokunulmadı.

## Tek sonraki gate

`NEAR_AUTH_TICKET_PURCHASE_LIVE_PREFLIGHT`: kullanıcının seçeceği video,
güncel fiyat, Google hesabının test USDC kaydı/bakiyesi, NEAR bakiyesi,
sponsor ve ilk cihaz koşulunu salt okunur kontrol etmek; gerçek işlem öncesi
somut inceleme ekranını hazırlamak. Gerekiyorsa fonlama/storage tutarlarını
ayrı ve kesin olarak sunmak; bu kod gate'i harcama onayı değildir.

Yerel kaynak gate'inde blocker yok. Canlı kabul için yapılandırma/bakiye,
gerçek UI incelemesi ve kullanıcı imzaları henüz kanıtlanmadı. Brave çökmesi
araştırması kullanıcının kararıyla ertelenmiş kalır. Sonraki gate açılmadı.

16 Eylül kullanıcı yeni bir dosya verdi ve önce **Google hesabıyla video
yüklemek**, yükleme/imza adımlarını kendisi yapmak istedi. Bu yönlendirmeyle
bilet canlı preflight'ı yerine [Google upload kaynak gate'i](./near-auth-google-upload.md)
açıldı. Bilet satın alma veya yeni ücretli işlem başlatılmadı.
