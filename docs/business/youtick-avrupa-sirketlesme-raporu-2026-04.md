# Youtick Icin Avrupa Sirketlesme ve Yasal Zemin Degerlendirme Raporu

Tarih: 2026-04-04

## 1. Kisa sonuc

Youtick icin bugun en hizli, dengeli ve pratik secenek **Estonya OÜ** gorunuyor.

Bunun ana nedeni su:

- uzaktan sirket kurma akisi cok olgun
- dijital urun ve yazilim sirketi icin uygun
- erken asamada dusuk operasyon yukune izin veriyor
- EU icinde sozlesme, fatura, VAT ve veri uyumu tarafini daha duzgun kurmayi sagliyor
- dagitilmayan kar uzerinden degil, dagitilan kar uzerinden kurumlar vergisi mantigi ile nakit akisini korumaya yardim ediyor

Ama tek kosulla: Youtick kisa vadede kendini bir **kripto borsasi**, **saklama hizmeti**, ya da **odeme kurulusu** gibi konumlandirmamali. Mevcut urun mimarisi buna mecbur degil. Repo'daki aktif akis daha cok su kimlige oturuyor:

- sifreli video platformu
- creator marketplace
- NFT ticket ile erisim kontrolu
- zincir destekli ama esasen dijital icerik urunu

Bu nedenle benim ana onerim:

1. Ilk sirketi Estonya'da kur.
2. Youtick'i hukuken "creator-first dijital icerik platformu" olarak konumlandir.
3. Regule olabilecek odeme/kripto kisimlarini ya kapali tut ya da lisansli ucuncu taraflara birak.
4. Eger ileride kendi adina daha agir kripto/odeme faaliyeti yapacaksan, o parcayi ayri bir **Litvanya** sirketi veya lisansli partner yapisi altina al.

## 2. Youtick'in mevcut urun ve is modeli

Repo incelemesine gore Youtick'in bugunku urun omurgasi su:

- creator videoyu browser icinde sifreliyor
- video IPFS/Crust tarafina sifreli gidiyor
- erisim NFT ticket ile aciliyor
- anahtarlar multi-operator KMS mantigi ile tutuluyor
- creator gelirin buyuk kismini aliyor
- hediye linki ve trial hesap akislari var
- cross-chain checkout var ama varsayilan olarak kapali

Bu tespitler su dosyalara dayaniyor:

- `/Users/arair/works/youtick/README.md`
- `/Users/arair/works/youtick/docs/overview.md`
- `/Users/arair/works/youtick/docs/architecture/smart-contract.md`

Is modeli bugun su sekilde okunuyor:

- ana gelir kalemi: ticket/access satisi
- platform payi: dusuk komisyon
- hedef kitle: creator ve izleyici
- urun tipi: VOD + access platformu
- yardimci buyume motorlari: gift links, trial onboarding, ileride cross-chain checkout

Bu cok onemli bir nokta:

Youtick'i hukuken dogru anlatmak icin "NFT" kelimesini merkeze koymak yerine, "ucretli dijital icerige erisim saglayan platform" anlatimini merkeze koymak daha saglikli. Zincir burada urunun altyapisini guclendiriyor; urunun kendisi yalnizca kripto urunu degil.

## 3. Hukuki olarak nasil siniflanir?

Benim okuma bicimim su:

### Ana kimlik

**Dijital icerik platformu ve creator marketplace**

### Ikincil kimlik

**Kripto destekli erisim ve odeme altyapisi**

### Regulator acisindan riskli kisim

**Kendi adina para/kripto akisi yonetmeye basladigi an**

Yani su ayrim cok kritik:

- Eger Youtick sadece platformu sagliyor, erisim kurallarini yonetiyor ve odeme/kripto akisinda lisansli taraflara yaslaniyorsa risk daha yonetilebilir.
- Eger Youtick kullanici fonlarini kendi kontrol ediyor, swap yapiyor, saklama yapiyor, creator'a dagitim yapiyor veya transfer hizmeti veriyorsa risk seviyesi belirgin sekilde artar.

Bu nedenle bugunku mimarideki en kritik stratejik tercih sudur:

**Cross-chain checkout ve benzeri akislar hukuki gorus alinana kadar ana urunun merkezi yapilmamali.**

## 4. Avrupa'da mutlaka ele alinmasi gereken uyum basliklari

### 4.1 VAT ve faturalama

Youtick B2C dijital icerik satiyorsa, EU icinde musterinin bulundugu ulkenin KDV kurallari devreye girebilir. Bunun pratik cozum yolu cogu durumda **VAT OSS** duzenidir. Tek tek her ulkede kayit olmak yerine tek noktadan beyan kolayligi saglar.

Bu konu kritik cunku:

- creator ve platform gelirinin nasil faturalandirilacagi net olmali
- platformun seller of record olup olmayacagi belirlenmeli
- B2C dijital hizmet KDV akisi daha en bastan tasarlanmali

### 4.2 GDPR

Youtick su verileri isleyebilir:

- hesap verisi
- wallet/account baglantilari
- IP adresi ve cihaz verisi
- izleme ve erisim kayitlari
- creator ve izleyici iletisim bilgileri

Bu nedenle:

- privacy notice
- data retention kurali
- cookie ve tracking yapisi
- veri isleme envanteri
- DPA/alt isleyen sozlesmeleri

bastan kurulmalidir.

### 4.3 DSA

Youtick kullanici icerigi barindiran veya dagitan bir platform gibi de gorulebilir. Bu da su basliklari dogurur:

- illegal content bildirimi
- takedown sureci
- kullaniciya karar bildirimi
- iletisim noktasi
- icerik moderasyon kurallari
- tekrar eden ihlal yonetimi

Kucuk girisimler icin yukumluluk daha hafif olabilir ama "hic yok" degildir.

### 4.4 Tuketici hukuku

Youtick dijital icerik sattigi icin:

- satin alma oncesi acik bilgi verme
- iade/iptal ve erisim kurallari
- teknik gereksinimleri acikca anlatma
- destek ve sikayet kanali

gibi basliklari checkout ve kullanici sozlesmesine yerlestirmelidir.

### 4.5 Telif ve lisans

Bu baslik Youtick icin cok merkezi:

- creator'un icerigin sahibi oldugunu veya kullanma hakki oldugunu beyan etmesi
- muzik, video, gorsel ve performans haklarinin creator sorumlulugunda oldugunun acik yazilmasi
- ihlal bildirimi ve kaldirma sureci
- tekrar eden ihlallerde hesap kisitlama mekanizmasi

### 4.6 MiCA / kripto hizmet riski

Youtick'in mevcut urunu "yalnizca dijital icerige erisim" sinirinda kalirsa hukuki yuk daha yonetilebilir olabilir.

Ama su alanlar buyurse risk artar:

- platformun swap veya conversion akisinda merkez rol almasi
- kullanici varligini saklamasi
- creator odemelerini platformun kendi elinden dagitmasi
- kripto transferini hizmet olarak sunmasi

Bu durumda MiCA veya benzeri finansal lisans sinirlari masaya gelir. Bu nokta ozellikle cross-chain checkout icin ayri hukuki calisma ister.

## 5. Ulke karsilastirmasi

Asagidaki karsilastirma Youtick'in bugunku gercegine gore yapildi: erken asama, uzaktan yonetim, yazilim agirlikli urun, creator marketplace modeli ve kontrollu web3 kullanimi.

| Kriter | Estonya | Litvanya | Irlanda |
|---|---|---|---|
| Hizli kurulum | Cok guclu | Orta | Orta |
| Uzaktan yonetim | Cok guclu | Orta | Orta |
| Yazilim sirketi icin uygunluk | Cok guclu | Guclu | Cok guclu |
| Regule kripto/fintech tarafi buyurse | Orta | Cok guclu | Orta |
| Yatirimci ve kurumsal algi | Guclu | Orta | Cok guclu |
| Ilk asama operasyon sadeligi | Cok guclu | Orta | Orta |
| Sonuc | 1. tercih | 2. tercih | 3. tercih |

## 6. Estonya neden birinci tercih?

### Guclu yanlari

- e-Residency ve dijital sirket yonetimi cok olgun
- OÜ yapisi startup ve yazilim girisimi icin cok uygun
- erken asamada uzaktan yonetim kolay
- dagitilan kar uzerinden vergi mantigi nakit akisina yardim eder
- EU icinde sozlesme, fatura, OSS ve genel kurumsal cerceveyi daha temiz kurarsin

### Dikkat edilmesi gerekenler

- Estonya disindan yonetimde contact person ve hukuki adres gerekir
- sadece Estonya'da sirket kurmak, baska bir ulkede yonetim merkezi riskini otomatik sifirlamaz
- kripto/odeme tarafi buyurse Estonya tek basina en rahat yol olmayabilir
- bankacilik ve compliance sorulari yine de cikabilir

### Ne zaman en dogru secim?

Su durumda:

- hizli baslamak istiyorsan
- once urun, uyum ve gelir modelini oturtmak istiyorsan
- lisansli finansal faaliyet yerine platform isine odaklanmak istiyorsan
- tek kurucu veya kucuk ekip yapisindaysan

## 7. Litvanya neden ikinci tercih?

Litvanya benim gozlumde su senaryoda one cikiyor:

**Youtick ileride daha ciddi kripto/odeme/uyum katmani tasiyacaksa**

### Guclu yanlari

- kripto ve fintech tarafinda daha operasyonel bir ekosisteme sahip
- UAB yapisi tanidik ve kullanisli
- kucuk olcekli sirketler icin vergi avantajlari bulunabiliyor
- lisansli veya daha yakin denetimli modele gecmek istersen daha mantikli bir ikinci asama olabilir

### Zayif yanlari

- uzaktan kurulum Estonya kadar akici degil
- pratikte yerel destek ihtiyaci daha yuksek olabilir
- sirf hizli sirket kurup urune odaklanmak isteyen founder icin ilk gun maliyeti daha fazla hissedilebilir

### Ne zaman mantikli?

- regule checkout buyuteceksen
- kendi compliance kasini erken kurmak istiyorsan
- gelecekte lisansli faaliyet ihtimali yuksekse

## 8. Irlanda neden ucuncu tercih?

Irlanda kotu secenek degil. Tam tersine cok guclu bir secenek. Ama Youtick'in bugunku asamasi icin daha agir bir secenek.

### Guclu yanlari

- uluslararasi yatirimci ve partner algisi cok guclu
- Ingilizce hukuk ve sozlesme zemini pratik
- teknoloji ve IP sirketleri icin itibari yuksek
- trading income icin kurumlar vergisi orani cazip

### Zayif yanlari

- EEA resident director veya bond konusu operasyonu zorlastirir
- erken asama tek kurucu setup'inda gereksiz agirlik yaratabilir
- gunluk compliance ve sirket yonetimi daha pahali hissedilebilir

### Ne zaman mantikli?

- yakin donemde yatirim turu hedefliyorsan
- enterprise partnerlikleri agir basacaksa
- daha klasik bir Avrupa startup cercevesi istiyorsan

## 9. Benim net onerim

### Oneri 1

**Simdi Estonya OÜ kur.**

### Oneri 2

Youtick'i hukuken su anlatimla konumlandir:

**"Creator'larin sifreli video icerigini satabildigi dijital icerik ve erisim platformu."**

Su anlatimi ana mesaj yapma:

- "kripto borsasi"
- "wallet service"
- "custody platform"
- "swap hizmeti"

### Oneri 3

Asagidaki kisimlari ilk surumde lisansli partner veya dis servis mantiginda tut:

- fiat tahsilat
- stablecoin conversion
- saklama
- payout orchestration

### Oneri 4

Cross-chain checkout kismini ancak ayri hukuki not sonrasinda ac. Mevcut repo'da bu akis zaten feature flag ile kapali; bu iyi bir karar.

### Oneri 5

Eger 6-18 ay icinde su hedefler kesinlesirse:

- kendi adina daha ileri kripto akislarini acmak
- transfer/swap/checkout katmanini buyutmek
- lisansli bir modele yaklasmak

o zaman ikinci adimda **Litvanya** yapisini dusun.

## 10. Ilk 90 gun icin uygulanabilir yol haritasi

### Ilk 30 gun

- Estonya OÜ kurulumunu tamamla
- hukuki adres ve contact person hizmetini al
- muhasebe ve vergi danismani sec
- privacy policy, terms of use, creator agreement taslaklarini hazirla
- VAT/OSS akisini muhasebeciyle netlestir
- DSA icin notice-and-takedown surecini yaz

### 30-60 gun

- seller/creator onboarding kurallarini yaz
- telif ihlali bildirimi ve kaldirma formunu hazirla
- checkout ekraninda tuketici bilgilendirmelerini netlestir
- veri saklama surelerini ve log politikasini yaz
- alt isleyen/vendor listesini cikar

### 60-90 gun

- legal review ile cross-chain checkout sinirlarini netlestir
- creator payout modelini yazili hale getir
- ihtiyac varsa KYC/KYB tetiklerini belirle
- ic operasyonlar icin moderation ve abuse playbook hazirla

## 11. Ana riskler

### Risk 1: Sirket bir ulkede, yonetim baska ulkede

Eger fiili yonetim baska ulkede ise, yalnizca Estonya'da sirket kurmak tum vergi riskini tek basina cozmez. Bu konu ozellikle kurucu ve ekip baska bir ulkede aktif calisiyorsa vergi uzmani ile ayri degerlendirilmelidir.

### Risk 2: Platform mi, finansal hizmet mi?

Youtick urun dili ve operasyon akisi yanlis kurulursa platform olmaktan cikıp regule finansal hizmete benzeyebilir. Bunu basta dogru cizmek gerekir.

### Risk 3: Telif ve yasadisi icerik

Creator marketplace kurdugun an telif, ihlal bildirimi ve icerik moderasyonu ana operasyon konusu haline gelir.

### Risk 4: Tuketici iadesi ve dijital icerik kurallari

Checkout ekraninda ve sozlesmelerde bu kisim net kurulmazsa gereksiz uyusmazlik cikabilir.

## 12. Son soz

Bugunku urun ve repo mimarisine gore en mantikli yol su:

- **Ilk asama:** Estonya
- **Regule odeme/kripto buyurse:** Litvanya
- **Yatirimci ve kurumsal algi once gelirse:** Irlanda

Yani tek cümlelik tavsiyem:

**Youtick'i simdilik Estonya merkezli, dijital icerik odakli, non-custodial ve partner-destekli bir yapi olarak kur; finansal/regule kisimlari ya kapali tut ya da ayri katman olarak konumlandir.**

## 13. Kaynaklar

### Youtick repo kaynaklari

- `/Users/arair/works/youtick/README.md`
- `/Users/arair/works/youtick/docs/overview.md`
- `/Users/arair/works/youtick/docs/architecture/smart-contract.md`

### Resmi ve birincil kaynaklar

- Estonya e-Residency: https://www.e-resident.gov.ee/become-an-e-resident/
- Estonya contact person/legal address: https://learn.e-resident.gov.ee/hc/en-gb/articles/360000624858-Contact-person-legal-address
- Estonya kar dagitimi vergisi: https://www.emta.ee/en/business-client/taxes-and-payment/income-and-social-taxes/taxation-dividends
- Litvanya sirket kurulus e-guide: https://www.registrucentras.lt/jar/e-gidas_en/index.php?tipas=jaf
- Litvanya kurumlar vergisi kanunu (2026 konsolide metin): https://www.vmi.lt/evmi/documents/20142/391209/PMI%CC%A8%2Banglu%CC%A8%2Bk.%2Bnuo%2B2026-01-01%2Biki%2B2026-12-31.pdf/cb7fb577-499f-aec2-eabf-68d0677de4ac?t=1770032977656
- Irlanda sirket gorevlileri ve EEA director kurali: https://cro.ie/registration/company/incidental-obligations/company-officers/
- Irlanda corporation tax basis of charge: https://www.revenue.ie/en/companies-and-charities/corporation-tax-for-companies/corporation-tax/basis-of-charge.aspx
- EU VAT OSS: https://vat-one-stop-shop.ec.europa.eu/index_en
- Avrupa Komisyonu DSA genel sayfa: https://commission.europa.eu/strategy-and-policy/priorities-2019-2024/europe-fit-digital-age/digital-services-act_en
- Avrupa Komisyonu dijital icerik ve tuketici haklari ozeti: https://commission.europa.eu/law/law-topic/consumer-protection-law/consumer-contract-law/digital-contracts/digital-contract-rules_en
- GDPR kapsam anlatimi: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/application-regulation/who-does-data-protection-law-apply_en
- MiCA resmi metin: https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng
- Bank of Lithuania CASP yetkilendirme sayfasi: https://www.lb.lt/en/authorisation-of-crypto-asset-service-providers

## 14. Not

Bu rapor stratejik bir degerlendirmedir; resmi hukuk veya vergi gorusu degildir. Sirket kurulusu, vergi yerlesikligi, VAT yapisi, tuketici hukuku ve MiCA siniri icin Estonya veya secilecek ulkedeki yerel hukukcu ve vergi uzmani ile final kontrol yapilmalidir.
