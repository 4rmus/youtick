# Google kimliği için NEAR test hesabı hazırlığı

Gate: `NEAR_AUTH_ACCOUNT_PROVISIONING_PLAN` — **PASS / plan tamamlandı**.
Tarih: 16 Eylül 2026. Hesap oluşturulmadı, transfer veya imza yapılmadı.

## Kapsam ve kabul

Bu gate yalnız bu plan belgesini ve `tmp/near-auth-provisioning-plan/evidence/`
altındaki kişisel veri içermeyen okuma kaydını değiştirir. Uygulama, paketler,
kontratlar, Bridge, D1, ortam ayarları ve önceki kirli dosyalar korunur.
Kabul: hesap oluşturma yolu, sınırlandırılmış bütçe, kontrol sırası ve imza
testinden farkı somut olarak belirlenir. Canlı mutasyon kabul kriteri değildir.

## Önerilen yol

İlk denemede mevcut Google kimliğinden türeyen Ed25519 anahtarının 64 karakterli
standart adresini kullan. Adres zaten anahtardan hesaplanır; bir hesap adı veya
yeni anahtar oluşturulmaz. Adrese **tek Transfer eylemi** ulaştığında NEAR hesabı
ve o anahtara ait FullAccess kaydı oluşturulur. Ek CreateAccount/AddKey eylemi
eklenmez. Bu davranış [NEAR protokolünde tanımlıdır](https://near.github.io/nearcore/DataStructures/Account.html#implicit-account-creation).

Bu ilk test için mevcut testnet cüzdanından kullanıcı tarafından imzalanan
tek transfer yeterlidir. Sponsor servisi veya sunucuda fonlama anahtarı
gerektirmez. Son kullanıcıya cüzdan kullandırmayan otomatik hesap hazırlama,
kimlik-imza deneyi geçtikten sonra ürün entegrasyonunun ayrı konusudur.

Adlandırılmış `.testnet` hesabı da mümkün; ancak isim seçimi ve ayrı oluşturma
işlemi getirir. NEAR Auth SDK `createAccount` yalnız işlem eylemini hazırlar;
tek başına hesabı oluşturup fonlamaz. [SDK referansı](https://docs.auth.near.org/sdks/browser-sdk)
ve [NEAR hesap adresi dokümanı](https://docs.near.org/protocol/accounts-contracts/account-id).

## Önerilen bütçe — henüz harcama yetkisi değil

| Kalem | Sınır |
| --- | --- |
| Ağa gönderilecek bakiye | Tam 0,1 test NEAR |
| Oluşturma/ağ giderleri için üst sınır | 0,02 test NEAR |
| Fonlayan hesaptan toplam çıkış üst sınırı | 0,12 test NEAR |
| İşlem adedi | Bir; belirsiz sonuçta yeniden gönderim yok |
| Ağ / varlık | Yalnız NEAR testnet / test NEAR; USDC ve kart yok |

0,1 bir protokol minimumu değil, bu deneme için seçilen başlangıç bakiyesidir.
0,02 kesin ücret teklifi değil, işlemi durdurma sınırıdır. İmzadan önce güncel
ücret/ön ödeme ihtiyacı kontrol edilir; sınır aşılıyorsa gönderilmez.
NEAR dokümanı hesap oluşturmanın normal transferden farklı ücret içerdiğini
ve peşin gas tutarının son ücretle aynı olmayabildiğini açıklar.
[Güncel ücret kuralları](https://docs.near.org/protocol/transactions/gas).

16 Eylül salt okunur testnet ölçümü: protokol 85; gas fiyatı 100000000 yocto/gas,
minimum gas satın alma fiyatı 1000000000 yocto/gas. Bu nedenle eski
"transfer neredeyse bedava" varsayımıyla bütçe belirlenmez. Bu bütçe MPC
imzasını, cihaz kaydını, video yüklemeyi veya satın almayı kapsamaz.

## Uygulama ve doğrulama sırası

1. Kapalı `/auth-lab` içinde geçerli Google oturumundan anahtarı yeniden türet.
   Kullanıcının girdiği anahtar veya eski cüzdan hesabı otorite olamaz.
2. Yeni kesinleşmiş blokta hesap keşfini, hedef `view_account` ve tam anahtar
   `view_access_key` sorgularını çalıştır. Mevcut eşleşme varsa yeni hesap
   fonlamasını durdur; uygun hesabı seçme kararı ver. Hedef adres varsa fakat
   anahtar yoksa/uyuşmuyorsa otomatik fonlama yapma.
3. Kullanıcıya tam hedef adresi, anahtarı, testnet bilgisini ve 0,1 / 0,12
   tutarlarını göster. Fonlayan cüzdanı kullanıcı seçsin. Önceden görünen
   `soteri.testnet` otomatik seçilmez ve Google hesabı sayılmaz.
4. Yalnız hedef adrese `Transfer(100000000000000000000000 yoctoNEAR)` hazırla.
   Kullanıcı cüzdan ekranında imzalar. Özel anahtar okunmaz, kopyalanmaz veya
   tarayıcı paketine/ortamına konmaz.
5. İşlem hash'ini takip et ve kesinleşmiş başarıyı doğrula. Zaman aşımında aynı
   işlemin durumunu çöz; tekrar transfer etme. Çift tıklama yeni işlem açmamalı.
6. Yeni kesinleşmiş blokta hesap varlığı, bakiye ve türetilen anahtarın
   FullAccess yetkisini doğrula. İndeksin güncellenmesi beklenmeden doğrudan
   NEAR sorgusu esas alınır.
7. Sayfa yenilenince aynı Google kimliği → aynı anahtar → aynı hesabın
   görünmesini doğrula. Bu noktada hesap hazırlığı gate'ini kapat.

Küçük sonraki uygulama kapsamı: mevcut lab bileşeni, mevcut sunucu preflight'ı,
gerekirse yalnız lab için işlem hazırlama yolu ve bunların testleri. Ana
WalletProvider'ı Google kimliğine dönüştürme veya medya akışına bağlama yok.
Mevcut v7 işlem eylemleri yeterlidir; bu aşama v5 SDK kurulumu gerektirmez.

## İmza testi neden ayrı?

Fonlayan cüzdanın transferi, Google kimliğinin MPC ile imza üretebildiğini
kanıtlamaz. Mevcut YouTick oturumu yalnız doğrulanmış kimliği saklar; Auth0
imza tokenını saklamaz ve kendi başına imzalama yetkisi vermez.

Sonraki imza gate'inde yeni, hedef işleme bağlı Auth0 isteği, MPC isteğini
ödeyecek yol ve gerçek deposit/gas sınırı ayrıca doğrulanmalı. Upstream
relayer örneğinin 2 NEAR deposit varsayılanı ölçülmüş ücret değildir; bu
plana otomatik eklenmez. JWT kimlik referansının zincir işlemindeki görünürlüğü
de imza adımının kapsamıdır. İmza başarısı olmadan izleme/yükleme hazır denmez.

İncelenen upstream örnekte relayer anahtarı `VITE_RELAYER_PRIVATE_KEY` üzerinden
istemciye veriliyor; bu örnek kopyalanmayacak. Kaynaklar sabit commit'tedir:
[örnek relayer](https://github.com/Peersyst/fast-auth/blob/38dc894afbc94c198c207f52e6d01d695199eaa1/examples/spa/src/services/fast-auth-relayer.ts),
[relayer yapılandırması](https://github.com/Peersyst/fast-auth/blob/38dc894afbc94c198c207f52e6d01d695199eaa1/apps/relayer/src/config/near.config.ts).

## Kanıt ve sonuç

- `LOCAL_STATIC`: mevcut lab oturumu, hesap kontrolü, v7 bağımlılığı ve upstream
  hesap oluşturma yolları incelendi. Bu gate'te uygulama kodu değişmedi.
- `PROVIDER`: blok 268839270'te önceki Google kontrolünde görülen anahtardan
  türetilen standart adres için `view_account` sonucu hesabın yokluğunu
  doğruladı. Bu, başka adlandırılmış hesapların hiç bulunmadığının kanıtı değildir.
  Ücret yapılandırması ve gas fiyatı aynı blok üzerinden okundu.
- `EXTERNAL_NOT_RUN`: hesap oluşturma, fonlama, MPC imzası, cihaz kaydı,
  ödeme, izleme/yükleme, CI ve deploy. Kod değişmediği için test/build tekrarlanmadı.
- Ham kimlik, gerçek anahtar/adres veya çerez dosyaya yazılmadı.
  Kayıt: `tmp/near-auth-provisioning-plan/evidence/read-only.json`.

Plan için blocker yok. Çalıştırma için fonlayan hesap seçimi, yeni hedef
kontrolü ve yukarıdaki kesin bütçeyle açık işlem onayı gerekir.
Tek sonraki gate: `NEAR_AUTH_ACCOUNT_PROVISIONING`; otomatik başlatılmadı.
