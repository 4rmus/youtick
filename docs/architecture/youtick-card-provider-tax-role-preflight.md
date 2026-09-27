# YouTick kart sağlayıcısı ve vergi rolü ön kontrolü

Gate: `YOUTICK_CARD_PROVIDER_AND_TAX_ROLE_PREFLIGHT`.
Tarih: 26 Eylül 2026. **Sonuç: BLOCKED — yazılı dış teyit bekleniyor.**

Yerel karar ve soru paketi hazırdır. Ancak sağlayıcı kabulü, bağlayıcı teklif
ve şirkete özel vergi görüşü bulunmadığından satıcı/vergi rolü kesinleşmiş
sayılmaz. Kaynak taraması bunların yerine geçmez. Sağlayıcıya veya danışmana
ileti gönderilmedi; başvuru, hesap açılışı ve ödeme yapılmadı.

## Kapsam ve kabul

- Amaç: iki ürünün para akışını, önerilen ticari rolleri ve yazılı kabul
  koşullarını belirlemek; dış değerlendirmeye sunulabilir dosya hazırlamak.
- Yazılabilir dosyalar: bu belge, `youtick-card-provider-enquiry.md` ve
  `near-auth-integration-status.md` içindeki dar durum/bağlantı kaydı.
- Yasak kapsam: uygulama/kontrat/test kaynağı, bağımlılıklar, yapılandırma,
  secret, sağlayıcı hesabı, zincir/D1/canlı veri, tarayıcı ve Git index.
  Commit/push/CI/deploy ve dış iletişim yok. Ana ajan tek yazardır.
- Yerel kabul: gerçek/öneri/bilinmeyen ayrımı; iki ürün ve iki rol modeli;
  ülke/üretici/ücret soruları; sayısal hesabın ve doküman derlemesinin kontrolü.
- Gate kapanışı: şirket bilgileriyle desteklenmiş rol değerlendirmesi,
  model ve ülke bazında yazılı sağlayıcı kabulü, karşılaştırılabilir ücret
  çizelgesi ve vergi uzmanının yazılı değerlendirmesi. Bunlar henüz yoktur.
- Kanıt: kaynak incelemesi ve belge `LOCAL_STATIC`; belge derlemesi
  `LOCAL_TEST`; başvuru/gerçek ödeme `EXTERNAL_NOT_RUN`; ticari kabul,
  nihai vergi rolü ve kart entegrasyonu `UNPROVEN`.

## 1. Bilinenler ve doldurulacak bilgiler

| Alan | Durum ve dayanak |
| --- | --- |
| Şirket | Companies House'ta YOUTICK LTD / 17290900 eşleşti: Active, kuruluş 20 Haziran 2026, private limited company. [Resmî kayıt](https://find-and-update.company-information.service.gov.uk/company/17290900) 26 Eylül 2026 tarihinde doğrudan HTTPS ile okundu. |
| Kayıtlı adres | Suite 10956, 5 Brayford Square, London, United Kingdom, E1 0SG. Bu kayıt gerçek çalışma ofisini kanıtlamaz; kullanıcı fiziksel ofis durumundan emin değil. Sanal ofis olduğu da doğrulanmış değildir. |
| Yönetim ve personel | Kullanıcı beyanı: solo developer, şirketi Türkiye'den yönetiyor, personel yok. UK tescili gerçek yönetim ülkesinin yerine yazılmaz; vergi yerleşimi sonucu ayrıca değerlendirilir. |
| Hedef alıcı | Kullanıcı kararı: Türkiye, Avrupa ve UK. İlk AB ülkeleri ayrıca listelenecek; Avrupa'nın tamamı AB değildir. |
| İlk üreticiler | Kullanıcı beyanı: Türkiye ve bazı Avrupa ülkeleri. Hangi Avrupa ülkeleri olduğu ve üreticilerin birey/şirket statüsü henüz belirtilmedi; UK üretici başlangıcı varsayılmıyor. |
| Başlangıç fiyatı ve hacim | Kullanıcı beyanı: minimum bilet 2 USD, ilk aylarda düşük satış beklentisi. 2 USD'nin vergi dahil tüketici toplamı mı, vergi hariç içerik bedeli mi olduğu belirtilmedi. Kesin aylık adet/ciro uydurulmaz. |
| Ürünler | P1: üretici videosuna ücretli izleme erişimi. P2: üreticiye video yükleme/işleme/yayınlama hizmeti. |
| Giriş | Google ve passkey eklenmiş; kartla uçtan uca Production kabulü çıkarılamaz. |
| Mevcut pay | Yerel kontratta `platform_amount = amount.0 / 20`: %5. Kart tarifesi seçilmiş değildir. |
| Ödeme altyapısı | Mevcut kod USDC tahsilatı, üretici bakiyesi ve NEAR erişim kaydı kullanıyor. Yeni kart akışı uygulanmış değildir. |
| Eksik şirket bilgisi | Fiilî yönetim ülkesi Türkiye olarak beyan edildi. Fiziksel ofis durumu, UK/TR vergi yerleşimi değerlendirmesi ve mevcut VAT kayıtları açık. Personel yok bilgisi yeniden sorulmayacak. |
| Eksik ticari bilgi | İlk Avrupa üretici ülkeleri ve birey/şirket dağılımı; 2 USD alt sınırın vergi temeli, ortalama/azami bilet ve yükleme fiyatları; sayısal hacim ve istenen banka ödeme para birimleri. Düşük hacim beklentisi gerçekleşmiş satış sayılmayacak. |
| Eksik ürün bilgisi | İçerik türleri, erişim süresi, üretici lisansı ve moderasyon şartları. Onaylanmış politikalar olduğu varsayılmıyor. |

Önceki [ürün kararları](./near-auth-integration-status.md) ve
[22 Eylül maliyet incelemesi](./near-auth-card-identity-cost-preflight.md)
korunur. Eski belgedeki tarihli sonraki gate ifadeleri bugünkü sıra değildir.

## 2. Önerilen model ve sorumluluklar

**A — öncelik: gerçek MoR ile içerik dağıtımı.** Üretici gereken içerik
haklarını verir; YouTick bunları sözleşmeye uygun sunar; MoR müşteriye
yeniden satış yapar. Tüketici vergilerini yalnız kabul ettiği satış ve
ülkelerde kendi satıcılık rolü kapsamında yürütür. Bu, kabul bekleyen model
önerisidir; lisans zinciri kurulmuş veya vergi devredilmiş değildir.

**B — alternatif: pazaryeri ödeme sağlayıcısı ve dışarıdan vergi operasyonu.**
Sağlayıcı tahsilatı, doğrulanmış üretici hesaplarını ve banka ödemelerini
yönetir. YouTick'in VAT bakımından satıcı sayılması ayrıca değerlendirilir;
beyan işini muhasebeciye vermek sorumluluğu kendiliğinden kaldırmaz.
A kabul edilmezse B otomatik seçilmez; maliyeti ve sorumluluğu değerlendirilir.

| İş | A: MoR önerisi | B: pazaryeri ödeme sağlayıcısı |
| --- | --- | --- |
| İzleyiciye karşı satıcı | Sözleşmede adı belirtilen MoR | Gerçek sözleşmeye ve dijital platform kurallarına göre belirlenir |
| Tüketici VAT/KDV ve satış belgesi | MoR kapsamı ülke/ürün bazında yazılı teyit edilir | YouTick/ilgili sorumlu + dış vergi operasyonu; PSP üstlenmiş sayılmaz |
| İçerik lisansı, yayınlama ve destek | YouTick/üretici görevleri sözleşmede; MoR destek sınırı ayrıca | YouTick/üretici görevleri sözleşmede |
| Üretici doğrulama ve banka ödemesi | MoR'nin doğrudan üretici ödemesi yapabildiği teyit edilmedi | Sağlayıcının onayladığı üretici ve banka koridorları |
| İade, banka itirazı, negatif bakiye | MoR yönetebilir; ekonomik zarar sözleşmeyle YouTick'e dönebilir | Sağlayıcı ve üretici sözleşmelerine göre paylaşılır |
| Şirket vergisi ve üretici gelir vergisi | MoR hizmeti dışında ayrıca değerlendirilir | Ayrıca değerlendirilir |

P1 ve P2 için ayrı cevap istenir. Yükleme ücretini kabul eden sağlayıcı,
üçüncü taraf video satışını kabul etmiş sayılmaz. Üretici hesabı açan herkes
otomatik olarak ticari müşteri değildir; P2'nin B2B/B2C durumu doğrulanır.

Hedef para akışı: karttan normal para tahsilatı → vergi/gider/pay hesabı →
üreticiye banka ödemesi. MoR yalnız YouTick'e ödeme yapıyorsa doğrudan üretici
dağıtımı gereksinimi karşılanmamıştır; ayrı lisanslı ödeme düzeni ve maliyeti
belirlenir. Üreticilere ait fonları normal şirket hesabında tutma modeli
kendiliğinden kabul edilmez. Ödeme hizmeti kapsamı gerçek sözleşmeyle
incelenir. [FCA pazaryeri açıklaması](https://handbook.fca.org.uk/handbook/perg15/perg15s5?timeline=true)

## 3. Dört aday ve kabulde aranacak kanıt

Aşağıdaki resmî kaynaklar 26 Eylül 2026 tarihinde yeniden kontrol edildi.
Kamu belgesi, YOUTICK LTD'ye verilmiş ticari onay değildir.

| Aday | Kamu kaynağındaki dayanak | Yazılı kabulde kapanacak boşluk |
| --- | --- | --- |
| Reach | [Yeniden satış sözleşmesi](https://www.withreach.com/supplier-terms-of-service), [platform ortaklığı](https://www.withreach.com/partners/partner-with-reach/technology-partners) | Çok üreticili video ve iki ürünün kabulü; TR/AB/UK vergi rolü; supplier'a ödeme ile üretici başına ödemenin ayrımı; lisans zinciri; ücret ve zarar paylaşımı |
| Zotlo | [MoR modeli](https://docs.zotlo.com/welcome/merchant-of-record), [standart tarife](https://zotlo.com/pricing) | Pazaryeri, üretici kimlik doğrulaması ve doğrudan dağıtım; Türkiye B2C vergisi; NEAR/USDC açıklamasının kabulü; özel teklif |
| Mangopay | [UK şirket uygunluğu ve VAT sınırı](https://docs.mangopay.com/support), [ülke tablosu](https://docs.mangopay.com/guides/users/country-restrictions) | Türkiye ülke tablosunda engelli değil; bu ticari kabul veya TRY yerel ödeme garantisi değil. [Kripto bağlantısı ek incelemeye tabi](https://mangopay.com/prohibited-businesses). VAT operasyonu ayrıca kurulacak. |
| Nuvei for Platforms | [Ülke kabul tablosu](https://docs.platforms.nuvei.com/docs/how/countries/) Türkiye'yi ek inceleme gerektiren HIGH sınıfında listeliyor | Doğru sözleşme/ürün, gerçek kişi ve şirket üretici kabulü, TR banka ödeme koridoru/para birimi, vergi rolü ve ücretler |

**Hiçbir aday seçilmedi.** Dört adayın ileti durumu `GÖNDERİLMEDİ`, yanıt,
teklif ve YouTick'e özel kabul durumu `YOK`tur. Karşılaştırılabilir cevap
tablosu [İngilizce soru paketindedir](./youtick-card-provider-enquiry.md).
Stripe sağlayıcı olarak hariçtir; önerilen işlem yolunun Stripe'a bağımlı
olup olmadığı ayrıca açık sorulur. Altyapı hakkında kanıtsız garanti verilmez.

### 2 USD ve düşük başlangıç hacminin teklif seçimine etkisi

Başlangıç için aylık zorunlu minimumu ve hacim taahhüdü olmayan, düşük sabit
işlem ücretli teklif önceliklidir. Bu, sağlayıcılardan alınmış bir koşul
değil, teklif değerlendirme tercihidir. Tam üretici/payout/vergi kapsamı
belgelenmeden yalnız düşük fiyatla seçim yapılmaz.

[Zotlo'nun açık %4,5 + 0,40 USD tarifesi](https://zotlo.com/pricing)
2 USD tahsilata uygulanırsa 0,49 USD, yani %24,5 ödeme gideri çıkar. Brüt
tutarın %5'i yalnız 0,10 USD'dir; bu paydan ödeme gideri karşılanırsa
vergi ve diğer giderlerden önce bile 0,39 USD açık oluşur. Bu hesap YouTick
teklifi veya 2 USD için kesin vergi dahil fiyat kararı değildir.

Her adaydan hem 2 USD nihai tüketici tutarı hem 2 USD vergi hariç bedel
senaryosu için kesintiler istenir; gerçek müşteri ülkesinin vergisi ayrı
gösterilir. Ayrı aylık sabit ücreti `M`, gerçekleşen işlem sayısı `N` olan
bir teklifte bu ek bedelin işlem başına yükü `M / N` olur (N pozitifken).
Minimum fatura işlem ücretlerinden mahsup ediliyorsa iki kez gider yazılmaz;
ayrıca mı yoksa toplam alt sınır olarak mı uygulandığı sorulur.
Sıfır satış ayında doğan ücret de açıkça sorulur. Düşük hacim,
kurumsal sağlayıcının otomatik reddedileceği anlamına gelmez; şartlı teklif
gelmeden ekonomik uygunluk bilinmez.

2 USD alt sınırı bu gate'te yükseltilmez. Gerçek düşük tutarlı ödeme tarifesi
bulunamazsa maliyetin üretici hak edişindeki yeri ve belirli video paketleri
ayrıca kararlaştırılır; para yüklemeli genel kredi/cüzdan sistemi eklenmez.

## 4. Vergi uzmanına verilecek dar inceleme kapsamı

1. UK'de tescilli, Türkiye'den tek kişi tarafından yönetilen ve personeli
   olmayan şirketin UK/TR vergi yerleşimini ve VAT bakımından yerleşimini
   ayrı değerlendir. Kayıtlı Londra adresi gerçek ofis kanıtı değildir.
   Sadece UK tesciline dayanarak VAT eşiği veya yalnız Türkiye'de vergi
   sonucu varsayma; şirket vergisi, varsa çifte vergilendirme ve VAT farklı
   başlıklardır.
   [HMRC yerleşim rehberi](https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a)
2. P1'de üretici → YouTick → MoR → izleyici zincirini ve alternatif
   pazaryeri modelini değerlendir. Platformun ödeme/teslim/koşulları kontrol
   etmesi nedeniyle toplam satışta VAT sorumluluğu doğup doğmadığını belirt;
   yalnız %5 payın vergileneceği varsayılmasın.
   [HMRC dijital hizmetler](https://www.gov.uk/guidance/the-vat-rules-if-you-supply-digital-services-to-private-consumers)
3. MoR kapsamı dışında kalan AB B2C hizmetler için Non-Union OSS uygunluğunu
   ve gereken ülke kayıtlarını belirle. OSS bir vergi muafiyeti değildir.
   [Avrupa Komisyonu OSS](https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en)
4. Türkiye'den yönetim beyanını dikkate alarak Türkiye B2C elektronik
   hizmetler için KDV3/yerel kayıt ayrımını ve elektronik hizmet sunucusu
   sıfatını değerlendir. UK tescili nedeniyle şirketin Türkiye'de iş merkezi
   veya işyeri bulunmayan yabancı hizmet sunucusu olduğu varsayılmasın.
   [GİB düzenlemesi](https://gib.gov.tr/mevzuat/kanun/436/teblig/9085)
5. P2'nin tüketici/ticari müşteri ayrımını; platform hizmet bedelinin vergisini;
   içerik lisansı/gelir payının belge ve olası stopajını; ilgili platform
   raporlama yükümlülüklerinin uygulanıp uygulanmadığını yazılı belirt.
   [HMRC telif ve anlaşmalar](https://www.gov.uk/hmrc-internal-manuals/international-manual/intm153130)

Beklenen çıktı: her ürün ve hedef bölge için satıcı, vergi sorumlusu,
fatura/beyan düzeni ve gereken kayıtları gösteren imzalı veya doğrulanabilir
yazılı görüş. Hukuki danışmanın teyidi, sağlayıcının ticari kabulünün yerine
geçmez; sağlayıcının kabulü de bütün vergi sonuçlarını tek başına belirlemez.

## 5. Fiyat ve tüketici koşulları

Öneri: alıcıya baştan vergi dahil toplam fiyat; üreticiye vergi, gerçek ödeme
gideri ve YouTick payı sonrası hak ediş. %5'i bütün kart maliyetlerini kapsayan
oran veya brüt tutarın %95'ini üreticiye garanti eden vaat olarak kullanma.
Kart ek ücretine dayanma; zorunlu ücretleri son adımda ekleme.
[UK ek ücret rehberi](https://www.gov.uk/government/publications/payment-surcharges),
[CMA fiyat açıklaması](https://www.gov.uk/government/publications/price-transparency-cma209/providing-clear-and-accurate-information-about-prices-summary).

Yalnız örnek: toplam 12 USD, varsayımsal %20 VAT ve brüte uygulandığı
varsayılan %4,5 + 0,40 USD ödeme giderinde; vergi 2,00, ödeme gideri 0,94,
vergi hariç 10 USD'nin %5'i YouTick payı 0,50, üretici hak edişi 8,56 USD.
0,50 USD kâr değildir. İlave kur/payout/stopaj/hizmet vergisi/rezerv yok
varsayılmıştır. Tarife kaynağı [Zotlo](https://zotlo.com/pricing); YouTick
teklifi değildir. Ücretin matrahı ve yuvarlama gerçek sözleşmede belirlenecek.

P1 için politika hedefi: gereken açık onay ve saklanabilir sözleşme teyidi
sonrası yayın gerçekten başlayınca yalnız fikir değiştirmeye dayalı cayma
sınırlandırılır. Bozuk/teslim edilmeyen içerik, mükerrer tahsilat ve zorunlu
haklar korunur. Banka itirazının tamamen kaldırılamayacağı kabul edilir.
P2'nin devam eden hizmet ve tüketici statüsü ayrı incelenir.
[UK dijital satış açıklaması](https://www.gov.uk/online-and-distance-selling-for-businesses/online-selling),
[Türkiye mesafeli sözleşme rehberi](https://tuketici.ticaret.gov.tr/yayinlar/tuketici-bilgi-rehberi/mesafeli-sozlesmeler-hakkinda-bilgilendirme).
Sağlayıcının kendi iade koşulları bu politikayla karşılaştırılmalıdır.

## 6. Uygulamaya geçiş için değişmeyecek sınırlar

- Kart akışının hedefi kullanıcıya kripto satın aldırmak değildir. Üreticinin
  kart geliri banka parasıyla izlenir; USDC creator bakiyesine yazılmaz.
- Mevcut USDC ödeme yolu, NEAR erişim kaydı ve platformun ağ gideri sağlayıcıya
  açıklanır. Türkiye bakımından kart → kripto → ödeme modeli varsayılmaz;
  mevcut kripto yolunun ülke kapsamı ayrıca değerlendirilir.
  [TCMB düzenlemesi](https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB%2BTR/Main%2BMenu/Duyurular/Basin/2021/DUY2021-17)
- Kart siparişinin hesabı/video/tutarı/para birimi sunucuda bağlanır. Başarı
  sayfası ödeme kanıtı sayılmaz. Doğrulanmış sağlayıcı tahsilatı ve kalıcı
  sipariş uzlaştırması sonrası NEAR erişim kaydı hedeflenir.
- Gecikme veya tekrarlanan bildirim yeni tahsilat/hak/üretici ödemesi yaratmaz.
  İade yalnız ilgili sipariş kaynağını etkiler; bağımsız satın alma korunur.
- Mevcut NEAR kripto ekonomisi, nihai erişim otoritesi, Livepeer medya ve
  D1 türetilmiş katalog sınırları korunur. Kart kaydı yeni bir güven sınırıdır;
  burada uygulama, kontrat yetkisi veya migration onayı verilmez.
- Kart/kişisel veri zincire yazılmaz. Google/passkey oturumu, banka ödeme
  doğrulaması veya üretici kimlik kontrolünün yerine geçmez.

## 7. Kapanış kaydı

| Kabul kalemi | Sonuç |
| --- | --- |
| Rol önerisi, iki ürün, eksik şirket bilgileri | Hazır — LOCAL_STATIC |
| Şirket ve başlangıç koşulları | Resmî şirket kaydı okundu; Türkiye'den solo yönetim, personel yok, TR/Avrupa üreticiler, minimum 2 USD ve düşük hacim kullanıcı beyanıyla işlendi. Fiziksel ofis ve nihai vergi yerleşimi doğrulanmadı. |
| Sağlayıcı ve vergi danışmanı soru paketi | Hazır; gönderilmedi — LOCAL_STATIC |
| Örnek hesap, belge bağlantıları, kapsam ve index koruması | PASS: ondalık hesap doğru; yalnız üç izinli doküman değişti; diğer 497 görünür dosyanın hash'i ve Git index aynı |
| `npm run build --prefix docs` | PASS: sayfalar ve bağlantılar derlendi; 500 kB üzeri parça boyutu uyarısı var, hata yok |
| YouTick'e özel sağlayıcı kabulü ve ücret çizelgesi | YOK — UNPROVEN |
| Şirkete özel yazılı vergi rolü | YOK — UNPROVEN |
| Başvuru, ileti, ödeme, uygulama/CI/deploy | EXTERNAL_NOT_RUN |

**Tek sonraki gate: aynı `YOUTICK_CARD_PROVIDER_AND_TAX_ROLE_PREFLIGHT`** —
eksik şirket bilgileri ve yetkilendirilmiş dış değerlendirmeden gelecek
yazılı cevaplarla kapanış. Yeni entegrasyon veya ödeme gate'i başlatılmaz.
