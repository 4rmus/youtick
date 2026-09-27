# NEAR Auth V1 — yerel bilet kabul kurulumu

Gate: `NEAR_AUTH_V1_TICKET_LOCAL_ACCEPTANCE_SETUP`.
23 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Sonuç:** kullanıcının açık onayıyla ayrı sponsor anahtarı macOS Anahtar
Zinciri'ne kaydedildi, mevcut localhost:3000 ürün sunucusu özel yerel Bridge
bağlantısıyla yeniden başlatıldı. Kullanıcının cüzdanda imzaladığı üç fonlama
FINAL olarak doğrulandı. Bilet satın alınmadı; Web ve Bridge ödeme bayrakları
**kapalı**. Google/passkey ile gerçek ürün satın alma/izleme kabulü hâlâ yapılmadı.

## Gerçek hazırlık ve kullanıcı onayı

İlk onay: ayrı sponsor anahtarı, yerel bağlantı/restart ve soteri.testnet'ten
0,80 test NEAR + iki alıcıya toplam 4 test USDC hazırlığı. Nihai gönderimleri
kullanıcı cüzdanda onayladı; ajan cüzdanın final imza düğmelerini kullanmadı.

İlk sponsor adı `mpc-v1.soteri.testnet` idi. Yeni alt hesabı oluşturacak
CreateAccount/Transfer/AddKey paketi Meteor tarafından **Add Full Access Key**
korumasıyla engellendi. Kullanıcı uyarıyı bildirdi; yeniden gönderilmedi.
Kontrolde alt hesap mevcut değildi. Eski `funding-sponsor.json` pending kaydı
silinmedi veya başarılı sayılmadı; cüzdan tarafından reddedilen hazırlığın
kanıtı olarak korundu. İki USDC işlemi o anda henüz başlatılmamıştı.

İkinci açık onayla aynı Anahtar Zinciri anahtarının standart NEAR-implicit
adresi kullanıldı. Yeni bir anahtar üretilmedi. Yeni sponsor fonlaması **yalnız
tek Transfer** içerir; cüzdana CreateAccount/AddKey action'ı verilmez. NEAR
protokolü bu adrese ilk transferde hesabı ve onun kendi access key'ini oluşturur.
Mevcut soteri.testnet hesabına key eklenmedi.
[NEAR hesap oluşturma kuralı](https://nomicon.io/DataStructures/Account#implicit-account-creation).

## Hazır hesaplar ve test çiftleri

| Rol | Hesap / hedef | Kurulum sonucu |
| --- | --- | --- |
| Sponsor | `e582a5e0dece7b0a61b37384d6dc9a4e46bc539ba8d0439803606c7fbe1f975c` | 0,80 test NEAR; storage sonrası 0,79818 NEAR; FullAccess key doğrulandı |
| Sponsor public key | `ed25519:GSuuhDkM9sqnvvF3MwkHmDgeN3znpbuvvv6jN79fengB` | Anahtar Zinciri'ndeki anahtarla eşleşiyor; epoch `local-v1` |
| Google alıcısı | `38aa1132e0400378a721898abba6229f3735c0ae1c5f68ac8bc2022736a2902d` | 2 test USDC; ilk kontrolde storage sonrası 0,127334069481146399999999 NEAR |
| Google hedefi | `lp-27897cc6-fd5c-4a7f-93ac-78f9c3dc4678` — youtick-promo-test | İlk kontrolde ACTIVE, 2 USDC, başka creator, alıcı hakkı false |
| Passkey alıcısı | `9db6cbd959c2ad427dc68b77b905edd0b8470431e3a3a9abebf0ee41a659d21a` | 2 test USDC; ilk kontrolde storage sonrası 0,126492990322741599999999 NEAR |
| Passkey hedefi | `lp-f263096b-8992-4fd8-afc4-7b4c758cfc82` — Player V2 1080 landscape | İlk kontrolde ACTIVE, 2 USDC, creator utick2.testnet, alıcı hakkı false |

İlk aday kontrolü: final blok **269860301**. Fonlama sonrası bakiye/access key
kontrolü: final blok **269862887**, hash
`AsWht2RExRZYyRx6J8b65K6FYeNq6CxtKUKNou65GAtH`. Protokol 85 gözlendi.
Alıcıların USDC storage kaydı zaten vardı; yeni alıcı hesabı veya kayıt
masrafı oluşturulmadı. Distance'a bu iki alıcı zaten erişebildiği için yeniden
satın alma hedefi yapılmadı. Kabul başlarken fiyat/hak/bakiye yeniden kontrol edilir.

## Fonlama kanıtı — bilet ödemesi değildir

Üç işlemin signer'ı `soteri.testnet`. FINAL durum, başarılı receipt'ler,
hedef/action ve son bakiyeler kontrol edildi:

| İşlem | Hash |
| --- | --- |
| Sponsora tek Transfer, 0,80 test NEAR | `EhJUxdtxccAdgg3zsooFYVVSEWohNHHWqvYgr7ueUJyd` |
| Google alıcısına ft_transfer, 2 test USDC | `FnkVSQwy1agbsuE3GWGw6SkogcatsJG5WrbccidvPkWj` |
| Passkey alıcısına ft_transfer, 2 test USDC | `3tfibRrESJ2mLjJsbxYk17sphnhe9wc5NmcfgsWsyStv` |

USDC gönderimleri 1 yocto deposit ve 30 Tgas ile hazırlandı. Sponsor başlangıç
nonce'u `269862673000000`; taze gönderimde zincir nonce'u yeniden okunacak.
Bu üç işlem MPC veya bilet gideri ölçümü değildir. Kurulumda yeni bilet hakkı
satın alınmadı ve kullanıcı hesapları birbirine bağlanmadı.

## Yerel runtime ve korunan sınırlar

- `apps/web/next.config.ts`: yalnız mevcut development/testnet/lab veya ürün
  guard'ı içinde `NEAR_AUTH_LOCAL_BINDINGS_CONFIG` verilirse o yerel config
  kullanılır. Verilmezse eski preview davranışı korunur; Production'da açılmaz.
- Web `NEAR_AUTH_MPC` binding'i `youtick-bridge-local-auth` Worker'ındaki
  `NearAuthMpcSponsor` girişine bağlanır. Yerel registry ve SQLite dizini
  `tmp/near-auth-ticket-local-setup/` altında; eski lab kayıtları taşınmaz.
- Mevcut Next'in ve ilgili API'nin source'u ayrı portlu gerçek Next sunucusunda
  çalıştırılarak, **çalışan bu yerel Bridge'e** status çağrısının null dönmesi
  doğrulandı. Read-only test yeni MPC kaydı/imzası/harcama oluşturmadı.
  Kontrol: `tmp/near-auth-ticket-local-setup/check-next.mjs`.
- Bridge programatik Wrangler başlangıcı için kurulu sürümün
  `build.nodejsCompatMode: 'v2'` ayarı gerekti; eksik olduğunda util çözümleme
  hatası nedeniyle Worker hazır olmuyordu. Uygulama SDK'sı/tarih yükseltilmedi.
- Geçici restart sırasında kalan yalnız bu gate'in Next süreçleri sonlandırıldı;
  yeni launcher Next'i ayrı süreç grubunda başlatır. İlgisiz süreç/sekme kapanmadı.
- Bazı bağımsız Node getPlatformProxy tanı denemeleri tamamlanmadı; bunlar PASS
  sayılmadı ve yalnız bu gate'in tanı süreçleri kapatıldı. Bağlantı kabulü,
  bunların yerine gerçek Next HTTP sunucusundaki başarılı çağrıya dayanır.
- Web session secret yalnız bellekte üretildi; yeniden Google/passkey girişi
  gerekir. Sponsor private key macOS Anahtar Zinciri'nde; Worker'a bellekte
  secret_text binding olarak geçer. Private key argv, env dosyası, public JSON
  veya uygulama bundle'ına yazılmaz.
- Keychain servis adı `youtick.local-mpc.testnet.v1`; saklama etiketi ilk
  taslaktan kalan `mpc-v1.soteri.testnet`. Bu etiket zincir hesabı değildir;
  gerçek signer yukarıdaki implicit adrestir. Başlatıcı public key eşleşmesini
  kontrol eder; Bridge de implicit adresin signer key'den türediğini zorunlu kılar.

Hazırlanan ama **etkinleştirilmemiş** bütçe: işlem başına 0,35 test NEAR,
global günlük 0,70 test NEAR rezerv, kullanıcı başına 1 deneme/gün,
minimum 0,05 test NEAR kullanılabilir sponsor bakiyesi. Bunlar gerçek gider
veya production fiyatı değildir.

Şu dört gönderim bayrağı false:
`NEAR_AUTH_V1_MPC_ENABLED`, `NEAR_AUTH_V1_TICKET_ENABLED`,
`NEAR_AUTH_MPC_ENABLED`, `NEAR_AUTH_TICKET_ENABLED`.
Upload ürünü, kart ve multi-asset açılmadı; hosted/provider ayarı/deploy yok.

## Değişen kaynak ve doğrulama

- `apps/web/next.config.ts` ve `__tests__/unit/near-auth-dev-runtime.test.ts`:
  onaylı yerel config yolu; default/Production sınırı testleri.
- `workers/livepeer-bridge/src/mpc-sponsor.ts` ve `src/mpc-sponsor.test.ts`:
  Meteor engeli için standart implicit sponsor desteği. Yalnız sponsor alanı
  genişletildi; 64 hex adres signer public key'e eşit olmalı. Market hâlâ
  named testnet hesabı, ekonomik bütçeler/nonce/approval kontrolleri aynı.
- Bu rapor ve ana plan.
- Yerel yardımcılar ve public kanıtlar: `tmp/near-auth-ticket-local-setup/`
  içindeki probe/start/funding runner'ları, public sponsor metadata'sı,
  funding işlem kayıtları ve `funding-verified.json`. Bunlar local/ignored
  artifact'lardır; GitHub'a yayımlanmış operasyon aracı değildir.

**LOCAL_TEST:** 34 odaklı Bridge testi, tüm Bridge paketi **470 PASS / 3 skip**,
12 Web dev-runtime testi, native Worker runtime **12 PASS**. Bridge tip ve
Web lint PASS. Ek uygulama ekonomik kaynakları değişmedi; tam Web/Rust
paketi ve browser suite'i tekrar çalıştırılmadı.

**Yerel runtime:** ayrı gerçek Next → çalışan gerçek yerel Bridge çağrısı PASS;
3000 ürün sunucusu ayakta. **PROVIDER / testnet:** yalnız kullanıcının
onayladığı üç fonlama ve salt-okunur zincir doğrulamaları. **EXTERNAL_NOT_RUN:**
Google/passkey ürün bilet satın alma/izleme, hosted/CI/Production. Doküman
build PASS; mevcut 500 kB chunk uyarısı sürer. Kapsam dışı dirty dosyalar ve index korunur.

## Tek sonraki gate

**`NEAR_AUTH_V1_TICKET_PAYMENT_ACCEPTANCE` — başlatılmadı.** İlk olarak doğru
Google hesabıyla giriş ve seçili video ön kontrolü; ardından yalnız bu yerel
iki-bilet test bütçesi için gönderim bayraklarının açılması ve kullanıcının
ödeme onayı gerekir. Fonlama onayı satın alma onayı yerine geçmez. Her bilette
aynı operation/dış/iç hash ve hak/cihaz kanıtı izlenir; belirsiz sonuçta
ikinci imza veya ödeme yapılmaz. Test bitince gönderimler kapatılır, kalıcı
kayıtlar ve Anahtar Zinciri girdisi korunur.
