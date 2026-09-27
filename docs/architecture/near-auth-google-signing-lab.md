# Kapalı Google imza denemesi

Gate: `NEAR_AUTH_GOOGLE_SIGNING_LAB` — **COMPLETED_WITH_WARNINGS**.
Yerel testler ve gerçek MPC imzalı kendine transfer geçti. Brave iki kez
ana süreç çökmesi yaşadı; tarayıcı kararlılığı kabulü geçmedi. Yeni işlem yapılmaz.

## Kapsam ve dosyalar

- `apps/web/lib/near-auth-lab.ts`: mevcut Auth0 istemcisinde açık signing popup;
  memory cache; aynı audience/scope ile access token alma. Boş token reddedilir.
- `apps/web/lib/near-auth-signing-server.ts`: işlem hazırlama, şifreli 5 dakikalık
  inceleme belgesi, JWT/işlem/ücret/Ed25519 ve zincir sonucu doğrulaması.
- `apps/web/app/api/auth-lab/signing/route.ts`: kapalı, oturum kontrollü API.
- `apps/web/lib/near-auth-signing.ts`: tek cüzdan isteği ve tek signed broadcast.
- `apps/web/components/NearAuthSigning.tsx`: bütçe/veri paylaşımı incelemesi,
  sponsor seçimi, Google onayı ve açık gönderim düğmesi.
- `apps/web/components/NearAuthLab.tsx`: yeni bölüm; işlem sürerken diğer
  oturum/hesap kontrollerinin kilitlenmesi.
- `apps/web/tsconfig.near-auth.json`: yeni sunucu yolu katı kontrol kapsamında.
- `apps/web/__tests__/unit/near-auth-signing-server.test.ts`
- `apps/web/__tests__/unit/near-auth-signing-client.test.ts`
- `apps/web/__tests__/unit/near-auth-lab.test.ts`
- Bu rapor ve `tmp/near-auth-signing-lab/evidence/` yerel kayıtları.

Uygulama v7'de kaldı; yeni paket yok. WalletProvider, ödeme/medya kontratları,
Bridge, D1, provider/secret ayarları değişmedi. Commit, push ve deploy yapılmadı.

## Akış

1. Kullanıcı Google ile lab'e giriş yapar. Ekranın açılması imza isteği başlatmaz.
2. **Sponsor cüzdanını seç ve işlemi hazırla** ile mevcut sabitlenmiş Meteor
   testnet hesabı seçilir. Bu adım cüzdana transfer veya anahtar ekleme isteği vermez.
3. Sunucu mevcut Google oturumundan türeyen implicit hesabı/FullAccess anahtarı
   doğrular. Aynı hesabın kendisine tek 1 yocto Transfer işlemi hazırlanır.
   Nonce güvenli tam sayı olarak denetlenir, büyük tamsayıyla artırılır.
4. Sponsor, tam hedef hesap, iki bütçe ve kimlik referansının/onay tokenının
   testnette herkese açık kalacağı gösterilir. Ayrı checkbox gereklidir.
5. **Google ile bu işleme onay ver** yalnız Auth0 onayı alır. Sunucu bu tokenı
   ve tam işlem baytlarını doğrular. Bu adım zincire yayın yapmaz.
6. **Sponsor onayını aç ve imzalı testi gönder** ikinci açık kullanıcı adımıdır.
   Kimlik, süre, nonce, FullAccess, fiyat/protokol, hesap bakiyeleri ve sponsor
   seçimi tekrar kontrol edilir. Ardından kullanıcı sponsor cüzdanında onaylar.
7. Sunucu dış işlemi RPC'den FINAL olarak okur; doğru sponsor/kontrat/metot/
   gas/deposit/işlem baytlarını, JWT'yi ve receipt hatalarını denetler. Dönen
   64-byte Ed25519 imzası türetilen anahtar ve SHA-256 işlem özetiyle doğrulanır.
8. Ancak bu doğrulamadan sonra aynı iç işlem imzalı biçimde bir kere yayınlanır.
   İç işlem de FINAL + beklenen tek Transfer + doğru hesap/anahtar ve ücretle
   kontrol edilmeden başarı gösterilmez.

## Güven ve bütçe sınırları

- API yalnız development + lab flag + testnet + localhost/127.0.0.1 üzerinde açık.
  Exact Origin, HttpOnly oturum ve en fazla 32 KiB JSON gövdesi gerekir.
  İzin verilen işlem adımları ve alanlar sabittir; genel relayer API'si değildir.
- Hazırlanan işlem/sponsor, mevcut subject ve origin'e bağlı JWE içinde 5 dakika
  korunur. İstemci bu belgeyi değiştirip başka hedef/tutar/anahtar seçemez.
- Signing access JWT için sabit issuer/JWKS, RS256, signing audience, client azp,
  mevcut subject, iat/exp, `transaction:sign` scope ve tam `fatxn` eşleşmesi gerekir.
  İzin listesi dışındaki token alanları (email/profile dahil) zincire gönderimi
  durdurur. Gerçek provider token biçimi henüz denenmedi; ret olursa alanlar
  isim düzeyinde incelenmeli, güven kontrolü gelişigüzel gevşetilmemeli.
- Sponsor çağrısı yalnız `fast-auth.testnet.sign`, 300 TGas, 1 yocto deposit,
  `eddsa`. Sponsor bütçesi 0,35 test NEAR; iç transfer/ücret bütçesi 0,002 test NEAR.
  Mevcut protokol 85, gas fiyatı ≤1000000000 ve min satın alma fiyatı 1000000000
  yocto/gas şartları aranır. FastAuth paused/MPC/domain değerleri yeniden okunur.
- Bütçe protokolün imzalı maxFee garantisi değildir; son tutar cüzdanda da
  kontrol edilir. Gerçek yakılan giderler ayrıca doğrulanır. Bu aşama otomatik
  fonlama veya daha yüksek deposit ile tekrar deneme yapmaz.
- JWE ticket, JWT ve signed işlem yalnız işlem sırasında bellektedir. Yerel
  tekrar koruması sadece hesap başına durum ve işlem hash'lerini saklar.
  Kullanıcı kimliği/token/özel anahtar loglara veya kanıt dosyalarına yazılmaz.
- Web Lock + yerel kayıt cüzdan çağrısından önce alınır/yazılır. Timeout, iptal,
  sayfa yenileme veya belirsiz cüzdan yanıtında yeni ödeme/imza başlatılmaz.
  Bu tarayıcı profiliyle sınırlı, tek denemelik lab'dir; dağıtık tekilleştirme değil.
- İnceleme/Google tokenı süreyi aşarsa veya sonuç şekli beklenenden farklıysa
  durulur. Yenilemede ticket/token saklanmadığından belirsiz deneme elle
  mutabakat gerektirir; otomatik kurtarma veya token saklama eklenmedi.
- MPC sonucu şu an 64-byte `signature` dizisi biçimindedir. Gerçek deployment
  farklı biçim döndürürse yayın durur; sahte başarı verilmez. Sözleşme kaynak
  sürümüyle deployed bytecode eşitliği iddia edilmez.

## Doğrulama

- `LOCAL_TEST`: 40 dosyada **539 test geçti**. Gerçek jose RSA/JWE ve Node
  Ed25519 doğrulaması; dış RPC/Auth0/cüzdan sonuçları sentetiktir. Yanlış
  subject/audience/client/scope/fatxn, ek kişisel alan, bozuk imza, expiry,
  değiştirilmiş ticket/origin/nonce/fiyat, yanlış sponsor/işlem/receipt,
  tamamlanmamış iç işlem, çift deneme ve timeout retleri kapsandı.
- `LOCAL_STATIC`: katı auth-server tip kontrolü, lint, uygulama build geçti.
  v7 decode edilen Action'ın `enum` taşımadığı gerçek testte görüldü; kabul
  yalnız tek `transfer` alanı ve birebir yeniden kodlama ile doğrulanıyor.
  Auth0 SDK'nın undefined token döndürme olasılığı açıkça reddedildi.
- `LOCAL_TEST`: production modunda flag açıkken dört yeni POST adımı da
  404, çerez yok. Bu yerel production-mode kanıtıdır, canlı deploy değildir.
- `PROVIDER`: kullanıcı akışı tamamladı. Dış `fast-auth.testnet.sign` işlemi
  FINAL + başarılı; 300 TGas, 1 yocto deposit, EdDSA. Dönen imza ayrı salt
  okunur kontrolde SHA-256 işlem baytları ve anahtar ile kriptografik doğrulandı.
  Dış gider 0,003480349366895 test NEAR; önerilen bütçenin altında.
- `PROVIDER`: iç işlemin hash'i imzalanan baytlarla eşleşiyor; FINAL + başarılı,
  aynı Google hesabından kendisine tek 1 yocto Transfer ve beklenen açık anahtar.
  İç gider 0,0008349895375 test NEAR; 0,002 sınırının altında.
  Kullanıcının gerçek popup onay anı agent tarafından gözlenmiş sayılmadı.
- `UNPROVEN`: tekrarlanabilir ve çökmesiz Brave kabulü. Gerçek işlemleri
  doğrulamak için ek imza/ödeme gönderilmedi.
- `EXTERNAL_NOT_RUN`: cihaz kaydı, medya satın alma, izleme/yükleme, CI/deploy.

## Brave kapanması — 16 Eylül 2026

Kullanıcı iki kez bütün Brave pencerelerinin kapandığını bildirdi. macOS
DiagnosticReports'taki 16:02:48 ve 16:49:30 kayıtları okundu: Brave
153.1.95.101, CrBrowserMain, EXC_BAD_ACCESS/SIGSEGV ve aynı geçersiz adres.
İlk 17 stack offset'i aynı. Bu gerçek browser-process çökmesidir; normal
Auth0 popup kapanışı veya yalnız sayfa JavaScript hatası değildir.
Semboller ChromeMain olarak toplandığı için kesin tetikleyici belirlenemedi;
Google/Meteor, eklenti veya otomasyon etkileşimi kesin neden diye sunulmaz.

[Brave'in güncel kararlı sürümü](https://github.com/brave/brave-browser/releases/tag/v1.95.101)
kurulu sürümle aynı. [Aynı sürüm/macOS çökme kaydı](https://github.com/brave/brave-browser/issues/58939)
ve [daha eski cüzdan popup kapanma raporu](https://github.com/brave/brave-browser/issues/50705)
mevcut; bunlar aynı bug'ın kanıtı veya doğrulanmış çözüm değildir.
Ham crash raporları dışarı gönderilmedi, ayarlar/eklentiler/profil değiştirilmedi.

Zincir mutabakatında gerçek imzalı transferin tamamlandığı görüldü; popup
kapanması işlemin başarısız olduğu anlamına gelmedi. Dış/iç sonuçlar ve
bütçeler ayrıca doğrulandı. Kanıtlar: `live-signature-redacted.json`,
`live-inner-redacted.json`, `brave-crash-summary.json`, `result.json`.

16 Eylül kullanıcı talimatı: Brave çökmesi incelemesi ertelendi; tarayıcı
kararlılığı PASS sayılmıyor. Kullanıcı planın medya adımına devam edilmesini
istedi. Ardından açılan gate ve güncel sonraki adım:
[NEAR_AUTH_MEDIA_PREFLIGHT](./near-auth-media-preflight.md).
