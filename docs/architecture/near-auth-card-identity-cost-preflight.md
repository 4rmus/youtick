# Doğrudan kart, kimlik ve maliyet ön kontrolü

Gate: `NEAR_AUTH_CARD_IDENTITY_COST_PREFLIGHT`.
Tarih: 22 Eylül 2026. Sonuç: **COMPLETED_WITH_WARNINGS**.

Salt-okunur araştırma ve maliyet modeli tamamlandı. YouTick için kart sağlayıcısı
kabulü, sözleşmeli ücret, NEAR Auth üretim/giriş/imzalama kapsamı ve yeni kart
kodunun ölçümü yoktur. Bu sonuç canlı ödeme veya Production açılışı izni değildir.
Güncel sonraki tek gate: `NEAR_AUTH_V1_FLOW_ACCEPTANCE`.
[V1 akış raporundaki](./near-auth-v1-flow-acceptance.md) ilk-cihaz, tek-bilet
denemesi ve buyer oynatma engelleri kaynakta giderildi; eksik gerçek kabul bekliyor.
Kullanıcı kararıyla hesap bağlama V1'den çıkarıldı, V2'ye ertelendi. Cüzdan,
Google ve passkey bağımsız giriş seçenekleridir; her biriyle imza, yükleme,
satın alma ve izleme hedeflenir. Mainnet erişimi ve kart ticari teyitleri ayrı kalır.

## Kapsam ve doğrulama

- Amaç: [ürün kararlarını](./near-auth-integration-status.md) sağlayıcı belgeleri,
  mevcut kaynak ve güncel NEAR ücret parametreleriyle karşılaştırmak; bilineni,
  varsayımı ve dış teyit gerektiren noktayı ayırmak.
- Yazılabilir kaynaklar: yalnız bu rapor ve `near-auth-integration-status.md`.
  Ana ajan tek yazardır; alt ajan kullanılmadı.
- Uygulama, kontratlar, testler, bağımlılıklar, bayraklar, provider ayarları,
  kullanıcı/cüzdan kayıtları ve Git index kapsam dışıdır. Başvuru, ileti gönderme,
  abonelik, kart/kripto işlemi, fonlama, commit/push/CI/deploy yapılmaz.
- Kabul: üç kart adayında model/ücret boşlukları; kimlik sürekliliği sınırları;
  harcama, depolama, kullanıcıya aktarılan bakiye ve gönderici likiditesi ayrı
  maliyet tablosu; tutarlı sonraki gate ve başarılı doküman derlemesi.
- İş modeli varsayımı: önceki plandaki UK şirketi ve üçüncü taraf üreticilerin
  video sattığı pazaryeri. UK/TR/AB, yazılı teyitte ayrı sorgulanacak ülke
  örnekleridir; hedef ülke/hacim seçilmiş veya şirket uygunluğu doğrulanmış değildir.
  Stripe karşılaştırma dışında tutuldu.

Web arama aracı iki kez bağlantı hatası verdi. Resmî sayfalar doğrudan HTTPS ile
okundu; hata dönen eski Nuvei yolu yerine ana siteden bulunan güncel sayfa
kullanıldı. Sağlayıcı hesabına giriş veya form gönderimi yapılmadı. Yerel kaynak
kopyaları, erişim zamanı/hash'leri, hesaplama çıktısı ve başlangıç dosya hash'leri:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-card-cost-fidyppuv/`.
Bu geçici klasör kalıcı repo kanıtı değildir; aşağıdaki kaynak bağlantıları ve
ölçüm değerleri raporun kalıcı özetidir.

## 1. Kart sağlayıcıları

| Aday | Resmî belgede doğrulanan | YouTick için doğrulanmayan | Ön değerlendirme |
| --- | --- | --- | --- |
| Nuvei | Marketplace API, satıcı KYC/KYB kaydı, bölüştürme, payout yöntemleri ve dijital içerik çözümü | UK şirket kabulü, üretici ülke listesi, NEAR hak kaydı + paralel USDC yoluna izin, sözleşmedeki MoR/vergi rolü, ücret/rezerv | Çok üreticili ödeme işlevlerini doğrulamak için ilk görüşme adayı; seçilmiş sağlayıcı değildir. |
| Reach | UK reseller/MoR sözleşmesi, dijital ürün satışı, teknoloji ortaklarına API/webhook ve merchant onboarding | İçerik lisans zinciri, her üretici için onboarding/banka ödemesi veya alt hesap modeli, blockchain politikası ve özel Fee Schedule | MoR modeli için aday; YouTick'e settlement yapılması üreticilere settlement kanıtı değildir. |
| Zotlo | MoR ve ayrı kendi-PSP modeli; tek seferlik satış, ödeme/iade bildirimleri, açık standart tarife | Çok üreticili onboarding/split/payout, NEAR/USDC iş modeli kabulü, doğrulanabilir webhook ve işlem sorgusu sözleşmesi | Fiyatı görülebilen aday; uygunluk ve bildirim doğrulaması çözülmeden uygulama seçimi yapılmaz. |

Nuvei'nin [pazaryeri sayfası](https://www.nuvei.com/use-cases/marketplaces)
satıcı doğrulama, split ve payout yeteneklerini açıkça listeler.
[Dijital içerik sayfası](https://www.nuvei.com/use-cases/digital-content-subscriptions)
ürün türüne yakınlık sağlar. [MoR açıklaması](https://www.nuvei.com/posts/how-merchant-of-record-solutions-simplify-global-expansion-for-subscription-platforms)
YouTick'e özel marketplace sözleşmesinde aynı rolün verildiğini kanıtlamaz.
Okunan sayfalarda YouTick'e uygulanabilir sayısal fiyat teklifi bulunmadı.

Reach [dijital satış koşullarında](https://www.withreach.com/digital-terms-of-service)
satıcı/reseller olarak konumlanır. [Supplier sözleşmesinde](https://www.withreach.com/supplier-terms-of-service)
ücretler ayrı Fee Schedule'a bağlıdır; settlement ücret/vergi ve diğer borçlar
düşüldükten sonra supplier'a yapılır. Ürün sorunu veya supplier hatası kaynaklı
iade ve fraud dışındaki chargeback maliyetleri supplier'a kalabilir.
[Teknoloji ortaklığı](https://www.withreach.com/partners/partner-with-reach/technology-partners)
onboarding/API sunar; bu belgeler üreticilerin ayrı alıcı olarak kabul edildiğini
veya tüm sorumluluğun Reach'e geçtiğini göstermez.

Zotlo [standart fiyat sayfasında](https://zotlo.com/pricing) **%4,5 + 0,40 USD**,
kurulum/platform ücreti olmaması ve chargeback başına **20 USD** yayımlıyor.
Payout açıklaması aylık hesap dönemi kapanışından sonraki 30 günlük takvime
işaret ediyor; bunun her üreticiye uygulanan ayrı payout modeli olduğu kanıtlanmadı.
Standart tarife YouTick için kabul veya bağlayıcı teklif değildir; özel modelin
fiyatı, vergi matrahı, kur ve payout koşulları ayrıca teyit edilmelidir.
[MoR](https://docs.zotlo.com/welcome/merchant-of-record) ile
[kendi PSP hesabını bağlama](https://docs.zotlo.com/welcome/connect-your-psp)
aynı ürün değildir; ikinci modelde vergi ve ilgili operasyon sorumlulukları
işletmede kalır.

Zotlo [bildirim belgesi](https://docs.zotlo.com/integrating-zotlo/webhooks/webhooks-overview)
tekrar denemelerinden sonra olayın bırakılabileceğini söylüyor. Okunan güvenlik
bölümü IP/domain kontrolü ve requestID tekrar kontrolü öneriyor; kriptografik
imza doğrulaması tanımlamıyor. Bu, başka bir belgede hiç bulunmadığı iddiası
değildir. Tek başına requestID veya istemcinin verdiği veri ödeme kanıtı sayılmaz;
sağlayıcının desteklediği doğrulama ve yetkili işlem-durumu API'si teyit edilmelidir.
[Ödeme bildirimi](https://docs.zotlo.com/integrating-zotlo/webhooks/payments-webhook)
ücretsiz trial olaylarını da kapsayabilir; yalnız event adıyla hak verilmez.
[İade bildirimi](https://docs.zotlo.com/integrating-zotlo/webhooks/refunds-webhook)
başarılı iadeleri kapsar; pending/failed iade ve chargeback ayrı sorgulanmalıdır.

### Küçük bilet fiyatı kontrolü

Aşağıdaki hesap, Zotlo'nun açık tarifesini satış tutarına doğrudan uygulayan
aritmetik örnektir; YouTick teklifi veya vergi dahil net gelir hesabı değildir.
%5, mevcut kripto kontratındaki payla karşılaştırma içindir; kart komisyonu
seçilmiş değildir.

| Örnek satış | %4,5 + 0,40 USD | Örnek %5 platform payı | Platform payından kart gideri çıkarsa |
| --- | ---: | ---: | ---: |
| 2 USD | 0,49 USD | 0,10 USD | -0,39 USD |
| 10 USD | 0,85 USD | 0,50 USD | -0,35 USD |
| 20 USD | 1,30 USD | 1,00 USD | -0,30 USD |

Zincir, kimlik, medya, vergi, iade/itiraz ve payout giderleri daha eklenmedi.
Dolayısıyla kart giderinin mevcut %5 paydan karşılanacağı varsayımı kabul
edilemez. Toplam fiyat, üretici net payı ve sağlayıcı kesintileri birlikte
kararlaştırılmalı; tüketiciye ayrıca kart ek ücreti uygulanabileceği varsayılmamalı.

## 2. Google/passkey ve üretim sınırı

- Kurulu Web sürümleri: Auth0 SPA **2.26.0**, jose **6.2.12**, near-api-js **7.3.0**.
  Kaynak hâlâ development/testnet lab'idir; paket veya sağlayıcı değiştirilmedi.
- [NEAR Auth üretim başvurusu](https://docs.auth.near.org/home/apply)
  onaylı uygulama, üretim kimlik bilgileri ve sözleşme erişimi ister.
  [Ağ belgesi](https://docs.auth.near.org/resources/networks) testnet ile mainnet
  domain/audience/kontratlarını ayırır. Paylaşılan testnet client üretime taşınmaz.
  Bu gate'te YouTick'in üretim kabulü veya ticari tarifesi doğrulanmadı.
- [Auth0 passkey](https://auth0.com/docs/authenticate/database-connections/passkeys)
  özelliği database connection üzerinden sunulur. V1'de passkey kendi kimliğiyle
  giriş ve imza için kullanılır; Google hesabına eklenmesi şart değildir.
- Mevcut türetim `issuer + subject` içerir (`near-auth-account-preflight.ts`).
  Seçilen kimliğin login ve işlem onayında kendi hesabına bağlılığı korunur.
  Google/passkey/cüzdan kimlikleri ve hakları V1'de birleştirilmez; aynı e-posta
  hesapları eşitlemez. Her yolun upload/purchase kabulü ayrı kanıttır.
- [Auth0 fiyat tablosu](https://auth0.com/pricing): free 25.000 aktif kullanıcı,
  passkey dahil. Hesap bağlama V1'de istenmediğinden bu özelliğe bağlı ücretli
  paket V1 maliyetine zorunlu kalem olarak eklenmez. NEAR Auth'ın yönettiği
  tenant'ın gerçek tarifesi, kapasitesi ve üretim koşulları ayrıca doğrulanır;
  bütün kimlik/imza hizmeti için sıfır maliyet varsayılmaz.
- [Relayer belgesi](https://docs.auth.near.org/protocol/concepts/relayer)
  son işlemin gas'ının gönderici tarafından ödenmesini açıklar. İmzayı üreten
  ilk ücretli MPC çağrısı ayrıdır; mevcut kod bunu 300 TGas'lık dış çağrıyla yapar.
  Bir yönetilen relayer, ücretsiz MPC veya başlangıç hesap kredisi tahsisi kanıtlanmadı.

### Cihaz ve kart kaydı henüz hazır değil

`contracts/nft-ticket/src/lib.rs:ft_on_transfer` USDC gönderenine hak verir;
`entitlements` kaydı yalnız `bool` tutar. Kart siparişine göre hak kaydetme,
kaynak bazlı iade/itiraz ve aynı hak üzerindeki bağımsız kaynakların korunması
henüz uygulanmadı. Kart kayıt yetkisi kullanıcı imzası yerine geçemez.

`activate_playback_device` doğrudan hesap işlemi, 1 yoctoNEAR ve Ed25519 ister.
Web çağrısı 100 TGas ayırır. Mevcut Google imza hazırlığı self-transfer/bilet
içindir; genel kart-sonrası cihaz kaydı adaptörü değildir. Bu sebeple mevcut
fonlama, cihaz, kart kaydı ve Bridge okumalarının birleşik akışı **UNPROVEN**.
Geçerli cihazla tekrar kart alışverişinde MPC'nin atlanması mantıklı bir ürün
hedefidir; henüz ölçülmüş veya canlı kabul edilmiş değildir.

Mainnet, bu gate'te protokol **86**; testnet **85** döndürdü. İmza preflight'ı
85'i ve testnet provider adreslerini sabit kontrol ediyor. Bu bilinçli lab
sınırıdır; üretim uyumu ayrı kaynak kapsamı ister. Mevcut testnet başarıları
mainnet davranışı olarak aktarılmadı.

## 3. Güncel ücret parametreleri ve maliyet modeli

22 Eylül 2026, yaklaşık **08:29:52 UTC**; her ağda aynı final blok üzerinden
`block`, `gas_price` ve `EXPERIMENTAL_protocol_config` salt-okunur sorgulandı.

| Ağ | Final blok | Protokol | Gas fiyatı, yocto/gas | Min. gas ön alım fiyatı | Depolama, yocto/bayt |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mainnet | 216745664 | 86 | 100000000 | 1000000000 | 10000000000000000000 |
| Testnet | 269718753 | 85 | 100000000 | 1000000000 | 10000000000000000000 |

Mainnet blok hash'i: `7J6fYpJRUL8oGhodDR4reyG7uNeLxPmAsrTrtLcAoDSz`.
Testnet blok hash'i: `CQtzZtTGcWo8CzhJu85siasgMEVGMbwPBwLQzdKJRCY9`.
Sorgu kaynakları: `https://rpc.mainnet.near.org` ve `https://rpc.testnet.near.org`.
Bu ölçüm kullanıcı hesabı, bakiye veya ödeme sonucu kanıtı değildir.

[Ücret modeli](https://docs.near.org/protocol/transactions/gas) ile uyumlu olarak,
ölçülen fiyatta tüketilen 1 TGas **0,0001 NEAR**, önceden ayrılan 1 TGas ise
**0,001 NEAR** gerektirir. Ayırılan gas ile harcanan gas aynı değildir:

| Kalem | Harcama | Ön finansman/rezerv |
| --- | --- | --- |
| 20 TGas tüketen varsayımsal hak kaydı | 0,002 NEAR | Ayırılacak gas bütçesi henüz belirlenmedi. |
| Mevcut 100 TGas cihaz çağrısı | Gerçek tüketim ölçülmedi. | Yalnız ayrılan gas için 0,1 NEAR; dış işlem/deposit/diğer rezervler ayrıca. |
| Mevcut 300 TGas MPC isteği | Önceki testnet gözlemi 0,003480349366895 test NEAR; mainnet tarifesi değildir. | Yalnız ayrılan gas için 0,3 NEAR; lab kontrol sınırı 0,35 test NEAR, gerçekleşen ücret değildir. |
| Yeni hesap | Belgede 0,007 NEAR temel oluşturma bedeli; bütün oluşturma işlemi henüz ölçülmedi. | Hesapta bırakılan bakiye ayrıca. |
| 1.000 bayt yeni kontrat kaydı | Yakılan gas'tan ayrı. | 0,01 NEAR kilitlenir; gerçek kart/cihaz kayıt boyutu ölçülmedi. |

Depolama parametresi [resmî kuralla](https://docs.near.org/protocol/storage/storage-staking)
aynıdır. MPC gözlemi [önceki testnet raporundan](./near-auth-google-signing-lab.md)
alındı; bu gate'te yeni imza yapılmadı. Kullanıcı hesabına aktarılan NEAR,
YouTick'in otomatik geri alabileceği ortak rezerv değildir. Kullanıcının
kontrolündeki kalan bakiye ile gönderici hesabında kalan likidite ayrılmalıdır.

### Önceki yaklaşık 0,10 USD örneğinin eksik kalemi

Aşağıdaki **senaryo**, yeni kart akışının ölçümü veya fonlama izni değildir:
NEAR/USD = **4** varsayımı; temel hesap bedeli 0,007 NEAR; bir tarihsel testnet
MPC gözlemi; cihaz ve hak kaydı ayrı ayrı **20 TGas tüketiyor** varsayımı;
toplam yeni kayıt **1.000 bayt**. Ayrıca doğrudan cihaz çağrısını karşılamak için
kullanıcı hesabına **U = 0,12 NEAR** aktarılacağı varsayılmıştır. U doğrulanmış
asgari tutar değildir; 100 TGas ön alımı ve ek giderlerin ölçümü gerekir.

| İlk satın alan yeni kullanıcı | NEAR | Varsayımsal USD |
| --- | ---: | ---: |
| Temel hesap + MPC + iki çağrı için modellenen harcama | 0,014480349366895 | 0,0579 |
| Kontratta kilitlenecek depolama rezervi | 0,01 | 0,04 |
| U'dan cihaz gas'ı çıkınca kullanıcı hesabında kalan bakiye | 0,118 | 0,472 |
| Modellenen ilk nakit çıkışı/bağlanan tutar | 0,142480349366895 | **0,5699** |

Kullanıcı hesabındaki 0,002 NEAR cihaz gas'ı hem U hem harcama satırında
iki kez sayılmadı: toplam = hesap temel bedeli + MPC + hak çağrısı + depolama + U.
Önceki 0,10 USD örneği ilk iki satırın toplamıydı; kullanıcı hesabında bırakılan
bakiyeyi dışarıda tutuyordu. 0,57 USD de kesin veya toplam ürün maliyeti değildir:
ek hesap oluşturma gas'ı, farklı tüketim/fiyat, provider deposit/ücretleri,
kart, kimlik, medya, operasyon ve iade giderleri ayrıca kalır.

| Yalnız bu ilk satın alma senaryosu | Modellenen harcama, USD | Kilitli kontrat rezervi, USD | Kullanıcı hesaplarında kalan, USD | Toplam, USD |
| --- | ---: | ---: | ---: | ---: |
| 1.000 yeni ödeme yapan kullanıcı | 57,92 | 40 | 472 | 569,92 |
| 10.000 yeni ödeme yapan kullanıcı | 579,21 | 400 | 4.720 | 5.699,21 |

Bunlar aylık aktif kullanıcı sayısı veya büyüme tahmini değildir. Geçerli
cihazla sonraki farklı bilet için yalnız 20 TGas ve 500 bayt **varsayımı**
kullanılırsa 0,008 USD gas + 0,02 USD rezerv çıkar; yeni MPC/cihaz yenileme
gerekiyorsa eklenir. Kripto alıcısının USDC kayıt/aktarımı bu kart örneğine
eklenmedi; kart alıcısına USDC kaydı zorunlu tutulması ürün hedefi değildir.

Bu nakit dağılımını azaltmak için kullanıcı sahipliğini koruyan sponsorlu
cihaz yetkilendirmesi sonraki kaynak tasarımında değerlendirilebilir. Mevcut
doğrudan-hesap kontrolünü kaldırmak veya sponsor anahtarını kullanıcı anahtarı
saymak çözüm değildir; bu gate yeni cihaz protokolü uygulamadı.

### Diğer maliyetler ve canlı limit kararı

Toplam dönem gideri = gerçekleşen zincir gideri + kimlik/provider faturası +
kart tarifesi + iade/itiraz ve payout + uygulama/RPC + video hizmeti.
Depolama sermayesi, kullanıcı hesabına dağıtılan bakiye ve göndericinin eşzamanlı
işlemler için ön alım bakiyesi bu giderden ayrı nakit ihtiyacı olarak gösterilir.
Aktif kullanıcı, ödeme yapan kullanıcı, sipariş, cihaz yenileme ve izleme süresi
farklı sayaçlardır. Sağlayıcı teklifi olmadan toplam kullanıcı maliyeti kesinleşmez.

[Workers fiyatı](https://developers.cloudflare.com/workers/platform/pricing/)
hesap başına aylık en az 5 USD'den başlar; kullanım, Durable Objects/veri ve
diğer hizmetlerin toplamı ayrıca hesaplanır. Mevcut hesabın faturası okunmadı;
bu tutar her kullanıcıya veya her servise ayrı sabit ücret değildir.

Canlı sayısal fonlama/harcama limitleri **onaylanmadı**. U=0,12, lab 0,35 ve
senaryo işlem adedi otomatik transfer yetkisi değildir. Uygulama öncesinde:
yalnız doğrulanmış ücretli siparişle bir ilk hazırlık; aynı hesap/sipariş için
tek mantıksal işlem; belirsiz sonuçta sıfır yeni ödeme; günlük toplam ve
eşzamanlılık tavanı; başarısız işlem maliyeti ve düşük bakiye davranışı gerekir.
Sayısal tavanlar gerçek gas/deposit/kalıcı bayt ölçümü ve ticari teklif olmadan
üretim limiti diye ilan edilmez. Mevcut kapalı varsayımlar değişmedi.

## 4. Dış sponsorluk

[Faucet](https://docs.near.org/getting-started/faucet) testnet geliştirme
tokenı sağlar; mainnet maliyetinin kaynağı değildir.
[NEAR fonlama sayfası](https://www.near.org/funding) hibe/teşvik yolları sunar.
[Protocol Rewards](https://www.nearprotocolrewards.com/) program sırasında
aylık 10.000 USD'ye kadar destek duyurur; mevcut cohort odağı AI/agentic
altyapıdır, YouTick uygunluğu veya tahsisi kanıtlanmadı.
[Auth0 girişim programı](https://auth0.com/startups) uygun erken aşama şirketlere
bir yıl B2B Professional/100.000 MAU imkanı sunar; mevcut ücretli müşteriler ve
önceki katılımcılar için istisnalar vardır. NEAR Auth'ın yönettiği uygulamaya
bu kredinin uygulanabileceği teyit edilmedi. Gelir planında hibe/kredi **0**
varsayılır; destek gelirse bütçeye sonradan eklenir.

## 5. Yazılı teyit için hazır soru listesi

Hiçbiri gönderilmedi. Önceki UK şirket/ülke varsayımları ve hacimler teyit
edilerek alıcıya uygunlaştırılmalıdır. Sağlayıcıdan genel satış yanıtı yerine
aşağıdaki konulara sözleşme, ülke listesi, API belgesi ve kalemli fiyat istenir.

Kart sağlayıcısına:

1. Çok üreticili ücretli video pazaryeri; kartla doğrudan erişim satın alma;
   NEAR'da hesap bazlı, devredilmeyen izleme hakkı; ayrı mevcut USDC/kripto
   ödeme yolu açıklanarak iş modelinin yazılı kabulü. Kart kripto alımı değildir.
2. Gerçek sözleşme rolleri: MoR/reseller/supplier kim; içerik lisansı, vergi,
   fatura, fraud/chargeback ve müşteri desteğini kim üstlenir?
3. Üreticiler ayrı doğrulanıp ayrı banka hesaplarına ödenebilir mi? UK/TR/AB
   için alıcı ödeme kabulü ve üretici payout uygunluğu ayrı listelensin.
4. 2/10/20 USD örnek siparişlerde yüzdelik+sabit ücret, minimum aylık/hacim,
   kur, vergi matrahı, iade edilen/edilmeyen ücret, chargeback, payout ve rezerv
   dahil fiyat; hangi süreyle geçerli olduğu belirtilsin.
5. Ödeme/tahsilat, pending/failed refund ve chargeback durumları; imzalı bildirim
   doğrulama, yetkili işlem sorgusu, tekrar teslim ve kayıp olay uzlaştırması.
6. Değiştirilemeyen order ID/metadata ve doğru kullanıcı bağlama desteği;
   üretici ödemesinin bekleme/rezerv koşulları; test ortamı ve canlı kabul şartları.

NEAR Auth'a:

1. YouTick için üretim domain/client/audience/guard ve yetkili operatör;
   uygulama onayı, tarife, kapasite, SLA ve yayın koşulları.
2. Google ve passkey ile bağımsız kayıt/giriş ve işlem onayı için üretim
   desteği, RP ID ve aynı kimliğin yeniden girişte kendi hesabına dönmesi.
3. MPC isteği ile son işlemin gönderimi için ayrı gas/deposit/hizmet ücretleri;
   yönetilen relayer varsa kapsam, bütçe/rate limitleri, başarısız işlem faturası.
4. Auth0 ücretleri pakete dahil mi; startup kredisi uygulanır mı;
   başlangıç hesabı/MPC/gas desteği varsa miktar, süre ve sonrasındaki tarife.

## Sonuç ve sonraki gate

- **LOCAL_STATIC:** mevcut kaynak/sürüm, cihaz ve hak sınırı incelendi;
  maliyet modeli aritmetiği ve harcama/rezerv ayrımı kontrol edildi.
- **PROVIDER (salt-okunur):** resmî sayfalar erişim/hash ile kaydedildi;
  mainnet/testnet final blok ücret parametreleri okundu. Bu sınıf YouTick'in
  sağlayıcı tarafından kabul edildiğini veya hosted konfigürasyonu kanıtlamaz.
- **UNPROVEN:** kart iş modeli ve fiyat kabulü; üretici ülke/payout kapsamı;
  NEAR Auth üretim, bağımsız giriş yollarının tam akış kabulü; yeni kart/cihaz kodu ve ölçümü.
- **EXTERNAL_NOT_RUN:** sağlayıcı iletişimi/başvuru, kimlik veya cüzdan işlemi,
  ödeme/iade/fonlama, faucet/hibe talebi, uygulama testleri, CI ve deploy.
- Değişen kaynaklar yalnız bu rapor ve ana entegrasyon planıdır.

Araştırmanın blocker'ı yok; uygulama/canlı açılış için yukarıdaki dış teyitler
ve ölçülmüş kaynak kabulü gereklidir. Nuvei/Reach/Zotlo'dan hiçbiri seçilmedi.
**Tek sonraki gate: `NEAR_AUTH_V1_FLOW_ACCEPTANCE`.**
[Ana plandaki](./near-auth-integration-status.md) üç kaynak engeli yerelde
giderildi; bağımsız giriş yollarının yalnız eksik gerçek kabul adımları hazırlanır.
Tamamlanmış canlı testler tekrarlanmaz.
Hesap bağlama V1 koşulu değildir. Sağlayıcı ticari/üretim yanıtları için
`NEAR_AUTH_PROVIDER_WRITTEN_CONFIRMATION` ayrıca açık kalır; dışarı ileti
gönderme veya başvuru bu gate'in mevcut yetkisi değildir.
