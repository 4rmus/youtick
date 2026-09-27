# Google ile işlem imzalama ön kontrolü

Gate: `NEAR_AUTH_GOOGLE_SIGNING_PREFLIGHT` — **COMPLETED_WITH_WARNINGS / kapalı**.
16 Eylül 2026. Akış, önerilen bütçe ve çevrimdışı uyumluluk hazır;
gerçek Google imza onayı veya zincir işlemi yapılmadı.

## Kapsam

Bu tur yalnız bu belgeyi ve `tmp/near-auth-signing-preflight/` içindeki
çevrimdışı kontrol/kanıt dosyalarını ekler. Uygulama kodu, paketler, mevcut
oturum, cüzdan anahtarları, provider ayarları, NEAR/D1 verileri korunur.
Kabul: somut tek işlem, imzayı isteyecek yol, ayrı hesap bütçeleri ve
başarı/ret koşulları belirlenir; mevcut SDK ile işlem formatı yerelde sınanır.

## En küçük pilot

Google kimliğinin mevcut implicit hesabından **aynı hesaba 1 yoctoNEAR**
gönder. Bu tutar 0,000000000000000000000001 NEAR'dır. Kendine gönderimde
asıl bakiye başka kişiye gitmez; işlem ücretleri yine harcanır.
Tek Transfer eylemi; yeni hesap/anahtar/kontrat/cihaz veya medya işlemi yoktur.

İki ayrı zincir işlemi vardır:

1. Kullanıcının seçtiği testnet sponsor cüzdanı `fast-auth.testnet.sign`
   isteğinin ücretini öder. Bu dış işlem Google hesabının imzası değildir.
2. Dönen MPC imzası yerelde doğrulandıktan sonra Google hesabının yukarıdaki
   kendine transferi gönderilir. Google ile işlem yeteneğini kanıtlayan budur.

Pilot, mevcut sabitlenmiş Meteor cüzdanını sponsor olarak kullanabilir;
sunucuda özel anahtar veya yeni relayer servisi gerektirmez. Sponsor kullanıcı
tarafından seçilir; eski `utick2.testnet` bağlantısı otomatik yetki sayılmaz.
Bu, cüzdan bilgisi gerektirmeyen nihai kullanıcı deneyiminin kabul testi değildir.
Ürün entegrasyonunda sponsor adımı sunucu tarafından karşılanacak ayrı iştir.

## Önerilen tek deneme bütçesi

| Kalem | Öneri |
| --- | --- |
| Dış `fast-auth.testnet.sign` | 300 TGas; 1 yoctoNEAR attached deposit |
| Sponsor hesabı bütçesi | Toplam en fazla 0,35 test NEAR; geçici gas ön ödemesi dahil |
| Google hesabı işlemi | Kendine 1 yoctoNEAR; ücret dahil en fazla 0,002 test NEAR |
| Mevcut Google hesabı bakiyesi | Canlı okumada 0,1 test NEAR; ek fonlama önerilmiyor |
| Deneme adedi | Bir dış imza isteği ve bir iç transfer; otomatik tekrar yok |

Bu rakamlar önceki 0,12 hesap hazırlama bütçesinden ayrıdır ve henüz harcama
yetkisi değildir. Son tutarlar ve sponsor cüzdanı kullanıcıya gösterilmelidir.
16 Eylül blok 268852255: protokol 85, gas fiyatı 100000000 yocto/gas,
minimum gas satın alma fiyatı 1000000000 yocto/gas. Bu fiyatla 300 TGas'ın
geçici ön ödemesi 0,30 NEAR'dır; son yakılan ücret bununla aynı değildir.
İade garantisi veya kesin son ücret iddia edilmez. Dış işlem hatasında da
ücret doğabilir. İmzadan önce fiyat/konfigürasyon ve cüzdan toplamı yeniden
kontrol edilir; bütçe aşılıyorsa durulur. NEAR işleminde imzalı `maxFee`
alanı bulunmadığı için bu sınırlar uygulama/cüzdan onay politikasıdır.

1 yocto önerisi [NEAR Auth imza örneği](https://docs.auth.near.org/home/guides/sign-transactions)
ve [MPC kaynak sabiti](https://github.com/near/mpc/blob/9228a528c31466c673a36142cfeeafba0a81f906/crates/near-mpc-contract-interface/src/deposits.rs)
ile uyumlu. Bu kaynak, deployed bytecode eşitliği veya canlı imzanın
başaracağı kanıtı değildir. Deployment daha fazla deposit istiyorsa otomatik
2 NEAR'a yükseltme yoktur. [Gas ön ödeme açıklaması](https://docs.near.org/protocol/transactions/gas).

## Uygulama için gerekli kontroller

- Mevcut Auth0 istemcisi ve v7 işlem üretimi kullanılsın. Bu pilot için
  uygulamaya v5/React SDK veya yeni bağımlılık eklemek gerekmiyor. Eski
  bağımsız SDK denemesi, istek biçimi ve bayt karşılaştırması için referanstır.
- Sunucu oturumundan aynı issuer/subject → anahtar → FullAccess hesabı
  doğrulansın. Yeni final blok/nonce alınsın. Tek işlem yalnız aynı hesaba
  1 yocto Transfer olabilir; istemcinin serbest hedef/tutarı kabul edilmesin.
- Kullanıcıya inceleme gösterildikten sonra açık düğmeyle Auth0 popup açılsın:
  audience `auth0.jwt.fast-auth.testnet`, scope `transaction:sign`,
  transaction alanı v7 Borsh baytlarının sayı dizisi. Mevcut oturum çerezi
  tek başına imzalama yetkisi olarak kullanılmasın.
- Gelen access JWT, sabit issuer/JWKS ile RS256, doğru signing audience,
  istemci, süre, `transaction:sign` scope ve mevcut oturum subject'i için
  sunucuda doğrulansın. `fatxn` yalnız geçerli byte dizisi olmalı ve onaylanan
  işlemin tamamıyla birebir eşleşmeli. SDK'nın yalnız JWT decode etmesi
  uygulama için yeterli doğrulama değildir.
- İşlem baytları onaydan sonra değişmesin. Gönderen/alıcı/anahtar/nonce/tutar
  ve testnet block hash tekrar denetlensin. Eski veya değişmiş işlemde yeni
  onay gerekir; var olan token farklı işleme taşınamaz.
- Sponsor yalnız sabit `fast-auth.testnet.sign` çağrısını gönderir:
  doğru guard, algoritma `eddsa`, tam onaylanmış baytlar, 300 TGas, 1 yocto.
  Bu API genel amaçlı imzalama/aracılık kapısı olarak açılmasın.
- Dış işlem `SuccessValue` döndü diye başarı sayılmasın. Guard reddinde boş
  sonuç/iade oluşabilir. Geçerli 64-byte Ed25519 imzası, **SHA-256(Borsh işlem)**
  ve türetilmiş anahtar ile yerelde doğrulanmadan iç işlem gönderilmesin.
- Dış işlem hash'i ve iç imzalı işlemin hash'i izlenerek belirsiz sonuç
  çözülsün; timeout/refresh/ikinci sekmede yeniden MPC isteği veya değişmiş
  nonce ile ikinci transfer gönderilmesin. Ham JWT log/depolamaya yazılmasın.
- İç işlem FINAL + başarı, beklenen tek Transfer ve hesabın son nonce/bakiyesi
  doğrulansın. Hesabın görünmesi veya cüzdan popup dönüşü tek başına kabul değil.

## Zincire giden kimlik verisi

İmza isteği `verify_payload` içinde Auth0 access JWT'sini zincire taşır.
Kimlik referansı (`sub`) ve işlem bilgisi halka açık ve kalıcı hâle gelebilir.
Token süresinin bitmesi zincir kaydını silmez. Bu, önceki salt okunur hesap
kontrolünden farklıdır ve gerçek imza öncesinde kullanıcıya açıkça gösterilmelidir.
Gerçek signing tokenının alanları henüz alınmadı; e-posta/profile alanı
bulunmayacağı garanti edilmez. Göndermeden önce gereksiz kişisel alanlar
kontrol edilmeli; varsa yayın durmalı. Bu gate hiçbir gerçek JWT yayınlamadı.
[JavaScript Provider davranışı](https://docs.auth.near.org/sdks/javascript-provider).

## Kanıt

- `LOCAL_STATIC`: Browser SDK 1.4.2, JS Provider 1.4.1 ve mevcut v7 7.3.0
  kaynakları incelendi. FastAuth kaynak referansı:
  [38dc894](https://github.com/Peersyst/fast-auth/blob/38dc894afbc94c198c207f52e6d01d695199eaa1/contracts/fa/src/lib.rs).
- `LOCAL_TEST`: `node tmp/near-auth-signing-preflight/offline-check.cjs` geçti.
  Beş kontrol: v5/v7 unsigned bayt/nonce eşitliği; gerçek SDK audience/scope/
  payload üretimi; sign action gas/deposit/baytları; sentetik Ed25519 imzası
  için yanlış digest/anahtarın reddi; signed v5/v7 baytlarının eşitliği.
  Auth0 mock'tur; sentetik JWT'nin RS256 geçerliliği iddia edilmez. Gerçek
  RPC ve broadcast testte kapalıdır; sentetik özel anahtar yalnız bellektedir.
- `PROVIDER`: aynı final blokta FastAuth paused=false, MPC doğru, domain=1,
  JWT router mevcut. MPC config sign minimum gas=15 TGas. Bu MPC'nin kendi
  minimumudur; JWT doğrulama ve callback'ler dahil FastAuth toplamı değildir.
  Google hesabının 0,1 bakiyesi ve FullAccess kaydı güncel olarak okundu.
- `EXTERNAL_NOT_RUN`: gerçek signing JWT, sponsor onayı, MPC imzası, iç
  transfer, medya, CI/deploy. Uygulama kodu değişmediği için önceki web
  test/build sonuçları yeniden çalıştırılmış gibi sunulmaz.

Kanıt: `tmp/near-auth-signing-preflight/evidence/`. Canlı maliyet/başarı ancak
tek gerçek pilotla ölçülebilir. Sonraki gate: `NEAR_AUTH_GOOGLE_SIGNING_LAB` —
bu kapalı akışı uygulayıp yerelde sınamak ve somut imza/bütçe/veri paylaşımı
incelemesini kullanıcıya sunmak. Otomatik başlatılmadı.
