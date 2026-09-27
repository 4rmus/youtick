# NEAR Auth V1 — ana uygulama akışı ön kontrolü

Gate: `NEAR_AUTH_V1_PRODUCT_FLOW_PREFLIGHT`.
22 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Öneri:** mevcut ana sayfalar ve bileşenler korunsun; tek aktif kullanıcı
kimliği altında cüzdan veya NEAR Auth seçilsin. Google/passkey hesabı ile
sponsor cüzdanı birbirine karıştırılmasın. Önce ortak giriş/oturum ve hesap
okuma bağlansın; ödeme yolları mevcut, dar işlem adaptörleriyle taşınsın.
Kullanıcıya sponsor seçtirmeyen ürün için arka plan göndericisi ayrıca gerekir.

Bu gate yalnız bu raporu ve ana planı değiştirir. Kaynak, bayraklar, bağımlılıklar,
provider/config, kullanıcı kayıtları, Git index, CI ve deploy kapsam dışıdır.
Kabul ölçütü: kullanıcı akışı, kaynak bağlantıları, eksikler, ilk uygulama
sınırı ve sonraki tek gate açık; doküman build geçer. Canlı test tekrarlanmaz.

## Korunan ürün kararları

- Cüzdan, Google ve passkey bağımsız seçeneklerdir. Google zorunlu değildir.
  Hesap bağlama, aynı e-postayla birleştirme ve yöntemler arası hak taşıma yoktur.
- Kripto satışın hesaplaşma varlığı USDC; NEAR ağ gideridir. Diğer varlıkların
  mevcut dönüşüm yolu ve kapalı varsayılanı korunur.
- Kartla doğrudan sipariş ve doğru NEAR hesabına hak yazma V1 ürün hedefidir;
  bu rapor kartı V2'ye ertelemez. Kart sağlayıcısı, sipariş doğrulaması ve
  ayrı fiat muhasebesi henüz uygulanmış değildir; kripto kabulü kart kabulü değildir.
- Ürün kullanıcısı sponsor cüzdanı seçmemelidir. İmza ve ücret onayı korunur;
  normal giderin toplam fiyata dahil edilmesi önceki ürün kararıdır. Testteki
  bütçe sınırları gerçek ücret veya ürün fiyatı olarak kullanılamaz.

## Sade kullanıcı akışı

| Adım | Kullanıcının gördüğü | Uygulamanın yapacağı |
| --- | --- | --- |
| Keşfet | Videoları girişsiz inceler. | Mevcut Discover ve yayın sorgusu. Girişte otomatik fonlama yok. |
| Giriş | `Google veya Passkey ile devam et` ve `Cüzdanla bağlan`. | İlk seçenek mevcut NEAR Auth ekranını açar; Google/passkey orada seçilir. İkinci seçenek mevcut cüzdan seçicisidir. |
| Hesabım | Aktif hesap, videolarım ve mevcut haklarım. | Doğrulanmış aktif hesabın verileri; sponsor veya arka planda açık başka cüzdanın verileri gösterilmez. |
| Satın al | Video, toplam tutar ve `Satın al`. Hak zaten varsa `İzle`. | İlk ücretli kullanımda hesap/USDC kaydı/bakiye hazırlığı; tek onaylı işlem ve kesinleşmiş hak. |
| Yükle | Dosya, başlık, bilet fiyatı, toplam gider, `Yükle`. | Mevcut upload formu; doğru creator hesabıyla ödeme → yükleme → işleme → yayın. |
| İzle | Aynı yayın ekranında oynatıcı ve kaldığı yerden devam. | NEAR hakkı ve mevcut cihaz doğrulanır. Yenileme yeni satın alma istemez. |
| Sonuç gecikirse | `İşleminiz kontrol ediliyor`; mevcut işlem durumu. | Aynı işlem/job uzlaştırılır; yeni ödeme veya yeni upload üretilmez. |

İlk uygulamada iki giriş düğmesi **üç giriş yöntemini** sunar. Mevcut istemci
`prompt: login` ile tek hosted ekrana gider; doğrudan Google ve doğrudan passkey
başlatan iki ayrı yönlendirme kaynakta doğrulanmış değildir. Ana ekrana aynı
pencereyi açan yanıltıcı iki ayrı düğme koymak yerine mevcut çalışan seçim
kullanılsın. Daha sonra doğrudan yönlendirme doğrulanırsa sunum değişebilir.

İşlem metinleri `Hesabınızla onaylayın`, `Bilet satın al`, `Videoyu yükle`
şeklinde yöntemden bağımsız olsun. UI'deki mevcut “Google” etiketinden giriş
yöntemi çıkarılmasın. Token/subject teknik ayrıntıları normal akışa taşınmasın;
mevcut kimlik referansının zincire gönderilmesine ilişkin gerekli açıklama ve
kullanıcının işlem onayı silinmesin.

## Kaynakta bulunan bağlantılar ve eksikler — LOCAL_STATIC

| Kaynak | Bugünkü durum | En küçük uygulama yönü |
| --- | --- | --- |
| `components/providers/WalletProvider.tsx`, `components/Navbar.tsx` | Ana uygulamanın accountId/connect/getWallet kaynağı yalnız cüzdan. Cüzdanın otomatik geri gelmesi hesabı değiştirebilir. | Mevcut provider içinde aktif giriş türünü ve doğrulanmış hesabı koordine et; ikinci cüzdan context'i kurma. NEAR Auth aktifken sponsor bağlantısı kullanıcı kimliğini değiştirmesin. |
| `app/layout.tsx`, `components/AuthLabBoundary.tsx`, `middleware.ts` | Lab normal Navbar/WalletProvider'dan ayrıdır; lab açıkken normal yollar lab'e yönlendirilir. | Ana uygulama entegrasyonu için ayrı, varsayılanı kapalı ürün modu. Lab izolasyonunu veya localhost güvenlik koşulunu genel olarak kaldırma. |
| `lib/near-auth-lab.ts`, `lib/near-auth-lab-session.ts`, `app/api/auth-lab/*` | Development/testnet/localhost kısıtı, 1 saatlik şifreli HttpOnly oturum, cookie Path=/api/auth-lab. Yalnız girişte NEAR hesabı oluşmayabilir. | Mevcut doğrulama yardımcılarını kullan; ürün auth API/callback yollarını ayrı tanımla. Giriş yapılmış olması ile zincir hesabının hazır olması ayrı tutulmalı. |
| `components/LivepeerPaidUploadForm.tsx`, `NearAuthUpload.tsx`, `lib/near-auth-upload-wallet.ts` | `LivepeerPaidUploadFormContent` zaten accountId/getWallet/connect alıyor. NEAR Auth adaptörü yalnız kontrollü upload delegate'ini destekliyor. | Aynı formu aktif kimliğe uygun adaptörle besle. Sponsor seçme ve test fonlama panellerini ürün formuna kopyalama. |
| `components/LivepeerWatch.tsx`, `lib/livepeer-publication.ts`, `lib/near-auth-signing.ts` | Normal satın alma buyLivepeerTicket(getWallet, accountId) çağırır; NEAR Auth bilet yolu ayrı hazırlanır/onaylanır/doğrulanır. | Aynı yayın/fiyat/hak ekranında aktif türe göre mevcut dar satın alma yolunu seç. Başarıda mevcut entitlement sorgusunu yenile ve oynatıcıyı aç. |
| `components/LivepeerPlayer.tsx`, `lib/device-session.ts` | `LivepeerPlayerContent` V2 yolunda geçerli cihazla genel cüzdan olmadan oynar; cihaz yenileme/aktivasyonu ayrıca cüzdan fonksiyonları kullanabilir. | Ortak oynatıcıyı koru. Yeni/süresi dolmuş cihazı sessizce yenileme; o giriş türünde desteklenen açık cihaz onayına yönlendir. |
| `app/profile/page.tsx`, `withdrawCreatorBalance` | Okuma ve para çekme aynı getWallet kaynağına bağlı. NEAR Auth upload adaptöründe signAndSendTransaction desteklenmiyor. | Aktif hesabın profilini/kazancını oku; NEAR Auth çekimi ayrıca dar işlem olarak eklenmeden çalışırmış gibi düğme sunma. Creator ürününün ücretli yayını için çekim yolu da tamamlanmalı. |

Sürüm doğrulaması: manifest, lockfile ve kurulu paketler mevcut mimariyle
uyumlu: Next **16.3.3**, Auth0 SPA **2.26.0**, near-connect **0.11.4**,
near-api-js **7.3.0**, jose **6.2.12**. Yeni SDK, yeni cüzdan kütüphanesi veya
paket yükseltmesi gerekmiyor. Eski upstream örnekleri bu API'lerin yerine geçmez.

## Oturum ve hesap değişiminin sınırı

Tek aktif kimlik olsun: cüzdan veya doğrulanmış NEAR Auth kimliği. Google ve
passkey için iki ayrı uygulama hesabı altyapısı kurulmasın; sağlayıcı farklı
kimlik döndürürse farklı NEAR hesabı olarak kalsın. Giriş yöntemini UI etiketi
veya e-posta eşitliğiyle tahmin ederek hesap birleştirme yapılmasın.

Mevcut cüzdan API'si genel amaçlı NEAR Auth cüzdanıymış gibi kullanılmasın.
Upload adaptörünün desteklemediği signMessage/çekim/çoklu işlem çağrıları
rastgele dış cüzdana düşmemeli. Özellikle sponsor accountId hiçbir zaman
creator, buyer veya profil accountId'sinin yerine geçirilmemeli.

Normal sayfalar kimliği yeni auth API'den geri yükleyebilir; cookie'yi bütün
siteye açmak şart değildir. Yeni auth API yolu seçilince cookie path de o
alanla eşleşmeli; HttpOnly, SameSite, HTTPS Secure, origin/issuer/audience ve
süre kontrolleri korunmalı. Callback sadece izin verilen aynı-site
`/watch?job=...`, `/upload` veya `/profile` hedefine dönebilmeli. Dış URL'ye
returnTo ve istemciden subject/NEAR hesabı kabul edilmemeli.

Hesap/yöntem değişince eski hesabın gecikmiş yanıtları, imza hazırlığı ve medya
istekleri iptal edilmeli; mevcut generation/abort/cache düzeni kullanılmalı.
Taslaklar, deneme kayıtları ve diğer hesabın cihaz anahtarları geniş temizliğe
uğramamalı. Normal wallet çıkışının mevcut yetki iptali ile NEAR Auth oturum
çıkışı aynı işlem sanılmamalı. Aynı origin'deki mevcut kayıtlar zorunlu isim
veya namespace değişikliğiyle kaybedilmemeli.

## Sponsor ve bakiye: ürün yayınının gerçek eksiği

Bugünkü testte iki ayrı gider yolu var:

1. NEAR Auth dış imza isteğini `fast-auth.testnet` hesabına gönderen Meteor
   cüzdanı: createGoogleUploadWallet ve runGoogleSigning bunu kullanıyor.
2. Upload delegate'ini gönderen mevcut Bridge/relayer: upload teklifindeki
   sponsor gideri bunun içindir. Bu relayer'ın bulunması, 1. adımın da arka
   planda otomatik yapıldığı anlamına gelmez.

Bridge kaynaklarında hazır bir NEAR Auth dış-imza gönderim yolu bulunmadı.
Kullanıcının sponsor seçimini gizlemek için bu eksik davranışı UI'de olmuş gibi
sunamayız. Önce mevcut Bridge/kalıcı işlem deseninde, doğrulanmış kimliğe ve
onaylanmış tek payload'a bağlı sınırlı gönderici kapsamı netleşmeli. Genel
arbitrary-transaction endpoint'i veya kullanıcı adına sınırsız imzalama yok.

Bu yolun kabulü: sunucunun belirlediği ağ/hedef/method/tutar ve kullanıcı onayı,
harcama sınırı, eşzamanlı taleplerde tek gönderim, süre dolunca durma, belirsiz
cevapta aynı işlemi takip ve yetersiz hizmet bakiyesinde yeni tahsilatı durdurma.
Sponsorun anahtarı tarayıcıya verilmez. Yeni mikroservis, yeni veritabanı veya
özel kuyruk varsayılmaz; var olan kalıcı kayıt yaklaşımı önce değerlendirilir.

İlk ücretli kullanımda hesap/USDC storage hazırlığı ve eksik bakiye ayrı
hesaplanmalı. Lab'in sabit **0,1 NEAR / 0,60 USDC** fonlama düğmeleri genel
checkout değildir: bilet kontrolü storage rezervinden sonra **0,12 NEAR**
ön bütçe ister; bu yüzden testte ek fonlama gerekti. **0,35 NEAR** sponsor ve
**0,12 NEAR** alıcı sınırları gerçekleşen ücret değildir. Ek hizmet bedeli
kontrattaki bilet fiyatına kendiliğinden eklenmez; fiyat/komisyon kararı ve
maliyet doğrulaması gerekir. Önceki toplam fiyat kararı korunur, henüz uygulandı
veya maliyet kesinleşti denmez.

## Kart ve diğer varlıklar

Kart V1 hedefi korunur, fakat bu source adımında hayali bir kart checkout'u
veya yalnız USDC yükleyen “kartla satın alma” ekranı eklenmez. Kart siparişi
sunucuda doğrulanmış kullanıcı/video/tutarla bağlı olmalı; tahsilat teyidi
sonrasında yetkili kontrat yoluyla o kullanıcıya hak verilmeli. Platformun
mevcut USDC transferiyle bilet alması müşteriye hak vermez. Bu kontrat/PSP
kapsamı önceki kart planında ayrı iş olarak açık kalır.

Mevcut MultiAssetPaymentPanel ve dönüşüm sonrası USDC/hak doğrulaması korunsun.
Kapalı varsayılan değişmesin; NEAR/USDT/diğer ağların desteklendiği, sağlayıcı
ve son hesaplaşma yolu doğrulanmadan kullanıcıya vaat edilmesin. Kart, MPC
sponsoru ve dönüşüm aynı hizmetmiş gibi birleştirilmesin.

## Uygulama sırası ve kabul

**Tek sonraki gate: `NEAR_AUTH_V1_SESSION_UI_SOURCE`.** İlk değişiklik yalnız
ana uygulamada giriş seçimi, geri yükleme, aktif hesap ve okuma ekranlarıdır.
Navbar/WalletProvider/layout-boundary/middleware, ortak auth yardımcıları ve
ayrı ürün auth/callback yolları dokunulabilecek alanlardır. Varsayılanı kapalı,
public-testnet ile sınırlı ürün modu tasarlanır; bu plan bayrak açma veya
provider allowlist/secret değiştirme yetkisi değildir. Eski lab bağımsız kalır.

İlk source kabulü:

- Kapalıyken normal cüzdan akışı ve lab koşulları aynı kalır.
- Google/passkey oturumu ana Navbar/profile'da aynı doğrulanmış hesabı gösterir;
  sponsor cüzdanı bağlanınca aktif kullanıcı değişmez. İki oturum varsa son
  açık kullanıcı seçimi esas alınır; arka planda restore edilen wallet baskın olmaz.
- Giriş, profil okuma, callback ve reload imza/fonlama başlatmaz. Zincirde hesabı
  olmayan kimlik giriş yapmış sayılır; ücretli hazırlık gerektiği açık gösterilir.
- Hesap değişimi/çıkış gecikmiş yanıtları engeller; taslaklar ve cihazlar korunur.
- Google/passkey ile desteklenmeyen para çekme veya ödeme çağrısı yanlış cüzdana
  yönlenmez. Kart/çoklu varlık ya da sponsor hizmeti hazırmış gibi gösterilmez.
- Testler mevcut wallet-provider, near-auth-lab/session/account, CSP ve uygun
  UI harness'lerinden genişletilir; yeni test altyapısı kurulmaz. Tip/lint ve
  ilgili build kontrolleri yapılır. Canlı provider/Preview kanıtı ayrıca gerekir.

Sonraki ödeme entegrasyonu bu gate'in otomatik devamı değildir. Arka plan
imza göndericisi ve fonlama/ücret sınırı netleşince mevcut upload/ticket yolları
normal sayfalara bağlanır; profile çekim ve cihaz yenileme eksikleri ayrıca
kapatılır. Ana sayfalarda cüzdan/Google/passkey ile gerçek işlem ve aynı cihaz
reload kabulü alınmadan ürün yayımlanmış sayılmaz. Kartlı V1 yayını için kart
sipariş yolu da ayrıca tamamlanmalıdır.

## Kanıt ve yayın sınırı

Bu rapor **LOCAL_STATIC** kaynak ön kontrolüdür. Önceki 882 test/20 UX ve
Google/passkey testnet kabulleri ilgili raporlardaki tarihsel kanıttır; bu gate
onları tekrar çalıştırmadı. Son GitHub kontrol noktası
`codex/near-auth-v1-checkpoint-20260922` / `d8a808b` olarak konuşmada kaydedildi;
bu yeni plan o commit'in içinde değildir. GitHub'a yeni gönderim yapılmadı.

Doküman build/bağlantı kontrolü uygulanır; kaynak testleri, provider ayarları,
yeni kullanıcı işlemi, CI ve deploy çalıştırılmaz. Planın blocker'ı yok;
sponsorsuz kullanıcı deneyimi, kart yolu ve gerçek ürün ortamı kabulü uygulama
öncesi açık bağımlılıklardır. **COMPLETED_WITH_WARNINGS** bu ayrımı ifade eder.
