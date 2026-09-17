# NEAR Auth — mimari değerlendirme ve güncel entegrasyon planı

17 Eylül 2026. Bu belge social login pilotunun tek güncel durum ve plan kaydıdır.
Eski gate raporları tarihsel kanıttır; onların sonraki-adım bölümleri otomatik
olarak güncel talimat veya yeni ödeme yetkisi oluşturmaz.

## Güncel karar

Gate: `NEAR_AUTH_ARCHITECTURE_PLAN_REVIEW` — **COMPLETED_WITH_WARNINGS**.
Mimari inceleme ve plan güncellemesi tamamlandı; uygulama düzeltmesi veya canlı
kabul yapılmadı. Kullanıcı son hatayı **Google onayında `access_denied`** olarak
doğruladı. Yeni hata açıklaması/payload alınmadı; 24 KB ayrıntısı 16 Eylül
[kayıtlı teşhisine](./near-auth-prompt-size.md) dayanır.

**NEAR Auth ile kontrollü pilota devam et.** Mevcut Auth0 SPA + jose + NEAR v7
yolunu koru; SDK değiştirmek veya uygulamayı v5'e indirmek mevcut hatayı çözmez.
Mevcut planın güçlü tarafı imza, ödeme ve medya otoritelerini ayırmasıdır.
Eksik tarafı, provider yaması sonrasındaki süre sınırlarıyla kullanıcı deneyimi
kabulünü yeterince kapsamamasıdır. Sağlayıcı yayını tek başına hazır olma ölçütü değildir.

**Güncel gate:** `NEAR_AUTH_COMPACT_SOURCE_INTEGRATION` — **COMPLETED_WITH_WARNINGS**.
[Son kaynak adayı ve doğrulama](./near-auth-compact-source-integration.md).
Main `72a96c7` üzerine ayrı Git adayında bütün onaylı geliştirmeler birleştirildi.
Zaten main'deki dört dosya ayrıldı; kapanış raporuyla aday 99 dosyalık farktır.
Asıl checkout ve index korundu. Temiz kurulumda UX betiğinin eksik tmp dizini
ve processing-reload zamanlama yarışı dar biçimde düzeltildi.

Adayda Web 775, Bridge 429 (3 atlanan), Bridge araçları 118, yayın/CI araçları
190, Market 52 + yerel sandbox 1, boyut matrisi 360 ve Brave 18 UX + 15
playback senaryosu geçti. Tip/lint, Rust fmt/clippy, Market/Access ABI,
OpenNext Web build ve Bridge dry-run geçti. Bunlar yerel kanıttır;
commit, GitHub CI veya deploy yapılmadı. Source blocker'ı yoktur.

**Tek sonraki gate:** `NEAR_AUTH_COMPACT_GIT_PUBLISH` — gözden geçirilmiş
adaydan tek commit, yeni kaynak dalına push ve taslak PR; otomatik PR CI
sonuçlarını izlemek. Henüz onaylanmadı veya başlatılmadı. Merge, deploy,
bakım ve ödeme kapsam dışıdır. İncelenebilir dosya manifesti, staged fark
ve PR metni entegrasyon raporundaki yerel aday paketindedir.
İlk gerçek Google kabulü localhost lab + yayımlanmış Bridge/Market üzerinden
olacak; gerçek `access_denied` sorununun giderildiği hâlâ kanıtlanmadı.
Aşağıdaki araştırmalar tarihsel kayıttır; onların sonraki-adım ifadeleri
bu güncel sıranın yerine geçmez.

### 17 Eylül karşı doğrulama: kısa mesaj adayına koşullu sonuç

Gate: `NEAR_AUTH_RESEARCH_RECHECK` — **COMPLETED_WITH_WARNINGS**.
Üç salt-okunur alt ajan önceki araştırmayı bağımsız denetledi; ana ajan yeni
boyut/kriptografi denemesi ve salt-okunur guard kontrolü yaptı. Bu gate yalnız
bu plan belgesini değiştirir. Uygulama, kontrat, test kaynakları, bağımlılıklar,
flag, provider ayarları, canlı veriler ve mevcut çalışma dosyaları korunur.
Kabul: önceki ölçümleri yeniden değerlendirmek, karşı örnek aramak ve kanıtın
sınırlarını düzeltmek. Bu gate yeni mesaj biçiminin uygulama kabulü değildir.

**Düzeltilen sonuç:** mesajın küçülmesi gösterildi; bütün desteklenen girdilerin
sığması ve üç katmanın güvenlik eşdeğerliği gösterilmedi. Önceki 4,7–6,4 KB
değerleri seçilmiş kısa sentetik kimlik alanları içindir. Kısa mesaj hâlâ
sağlayıcı değişikliği gerektirmeyebilecek bir adaydır; mevcut prototip için
genel boyut kabulü **başarısız**, entegrasyon/canlı kabul **UNPROVEN**.

Önceki `/tmp/youtick-compact-upload-wv3pn2p9/check.cjs`:

- Sıfır baytlı public key ile farklı bir hesap adresini, yer tutucu quote
  imzasını ve cihaz özetini kullanıyordu. Bunlar boyut örneğidir; gerçek hesap,
  teklif veya cihaz kabulü sayılmaz.
- Geri dönüş eşitliği ve Action'ın `fatxn` bayt aktarımını kontrol ediyordu;
  boyutları yalnız yazdırıyor, sınırlar için geçer/kaldı denetimi yapmıyordu.
- Kendi 2.048 bayt ek token bütçesi hesabı bazı örneklerde **7.739 bayta**
  ulaşıyordu. Bu gerçek JWT veya kanıtlı üst sınır değildir; yeterli pay
  bulunduğu iddiasını desteklemeyen bir uyarıdır.

Yeni ağsız denemede 5 başlık × 2 job uzunluğu × 4 gerçek biçimli test anahtar
grubu × 3 kimlik zarfı = **120 ölçüm** alındı. Hesap/anahtar eşleşmesi,
origin'e bağlı cihaz özeti, tam sayı ücret hesabı, yerelde geçerli Ed25519
quote/delegate imzaları ve RSA JWT imzası kullanıldı. Quote yeniden kurulduktan
sonra yerel imzası doğrulandı; değiştirilmiş tutar imzası reddedildi.
Saat yalnız test içinde sabittir; uygulamada geçmiş saatle token kabulü yoktur.

| Sentetik token zarfı | Ölçüm | 7.168 baytı aşan | En büyük JWT |
| --- | ---: | ---: | ---: |
| Kısa Google biçimi; API + userinfo audience dizisi | 40 | 0 | 6.889 |
| 255 karakterlik Google subject sınırını modelleyen zarf | 40 | 4 | 7.201 |
| Uygulamanın izin verdiği 512 karakter subject / 128 karakter client sınırları | 40 | 16 | 7.653 |

Son iki satır hipotetik sınır modelleridir; bu kullanıcıdan alınmış Auth0
tokenları değildir. Google'ın subject üst sınırının Auth0'nun nihai subject
biçimini birebir belirlediği veya mevcut client'ın 128 karakter olduğu iddia
edilmez. Ek `jti/gty` veya farklı header alanları da bu modele eklenmemiştir.
İlk satırın bile en büyük örnekte yalnız **279 bayt** payı vardır; bütün
sağlayıcı token profillerine yeterlilik çıkarılamaz.

Bu modellerde en büyük Auth0 `fields` boyutu **15.146 bayt**; delegate ve
MPC dış çağrı boyutları da uygulanan yerel sınır kontrollerini geçti. JWT
karşı örneklerinin bulunması başarılı bir **inceleme** sonucudur, aday için
PASS değildir. Gerçek Web parser'ları, Rust/Bridge compact decoder'ı, mevcut
quote anahtarı ve canlı hesap kullanılmadı; tam güvenlik eşdeğerliği yoktur.

**Ölçüm ve UX düzeltmeleri:**

- [Auth0'nun belgelenmiş 24 KB sınırı](https://auth0.com/docs/customize/forms/render)
  `fields` içindir. Eski deney bütün `{fields: ...}` seçeneklerini ölçüyordu;
  bu fixture'da fark 11 bayttır: 27.052 toplam → 27.041 `fields`. Önceki taşma
  teşhisi değişmez. Yeni deneme `fields` değerini ayrıca denetler.
- Compact örnek gerçek güven sınırı parser'ı değildir; bilinmeyen sürüm,
  fazla/eksik alan, UTF-8/Base64, sayısal sınır ve hesap/cihaz değiştirme
  retleri gerçek tüketicilerde sınanmalıdır. Tam 120 saniyeyi varsayan aday,
  daha kısa geçerli quote'i sessizce uzatamaz: ya dar kapsamı açıkça reddeder
  ya da gerçek bitişi taşır.
- Auth0'nun [form gösterim kodu](https://github.com/Peersyst/fast-auth/blob/38dc894afbc94c198c207f52e6d01d695199eaa1/packages/auth0/src/forms/shared/helpers/index.js#L188)
  function-call argümanlarını JSON olarak sunar; bizim kısa alanları genişletmez
  ve Base64 başlığı çözmez. "Başlık aynı görünür" yalnız YouTick'in kendi
  inceleme ekranı için hedef olabilir; sağlayıcı onay ekranı okunabilirliği
  ayrıca kabul edilmelidir.

**Yeni PROVIDER / salt-okunur kanıt:** 17 Eylül **07:10 UTC**, final blok
**268962571**, hash `6sydpHpPsK6EBF2UwdJtaLcAMzpQwMur7DVCfMuDfnNr`:
aynı doğrudan testnet guard `verify` sorgusunda 7.169 bayt sentetik JWT boyut
hatasıyla, 7.168 bayt sentetik JWT ise boyut aşımı olmadan geçersiz imzayla
reddedildi. Upstream Action SHA-256 değeri yine
`9476e322b93d1c0059bd27453295256b16476d7ce51ce362570b81cb476b631b`.
Hosted Action/form sürümü eşitliği ve gerçek Google tokenı **UNPROVEN**.

Kanıt: `/tmp/youtick-near-auth-recheck-5lst047p/` altında `stress.cjs`,
`stress-results.json`, `provider-read.json`. Betik sıfır çıkış koduyla boyut
karşı örneklerinin bulunduğunu doğrular; bütün JWT'lerin geçtiğini söylemez.
Mevcut provider handoff'un **10 testi PASS**; bunlar form yamasının testleridir,
compact uygulama kabulü değildir. Doküman derlemesi ve dosya koruma kontrolü
bu gate'in kapanış doğrulamasıdır.

**Tek sonraki gate değişmedi:** `NEAR_AUTH_PAYLOAD_COMPATIBILITY_PLAN`.
Kabulü sıkılaştırıldı: kısa mesaj için açık desteklenen veri/token bütçesi,
ölçülebilir pay, gerçek boyut assertion'ları, üç katmanda aynı canonical
veri/teklif imzası, bozuk girdi retleri ve okunabilir kullanıcı onayı gerekir.
Doğrulanmış JWT **7.168 baytı**, API toplam gövdesi/outer args kendi sınırlarını
aşıyorsa sponsor çağrısı sıfır olmalıdır. Bugünkü 32.768 karakterlik uygulama
token limiti guard'ın 7.168 bayt sınırının yerine geçmez.

Değişecek gerçek tüketiciler: Web upload mesaj üretimi, Google upload parser'ı,
Bridge relay ve playback-proof parser'ları, Market `ft_on_transfer`.
Mevcut imzalı proof/pending job byte'ları dönüştürülmez; eski kayıtların
uzlaştırma/oynatması ve yeni mesajın reload davranışı ayrı doğrulanır.
**EXTERNAL_NOT_RUN:** gerçek Google/passkey onayı, ücretli imza/ödeme,
upload/HLS, provider veya kontrat yayını, CI/deploy, commit/push/PR.
Uygulama değişmediği için Web/Bridge/kontrat suite'leri yeniden çalıştırılmadı.

### 17 Eylül ek inceleme: sponsor alternatifleri ve ikinci boyut engeli

Gate: `NEAR_AUTH_ALTERNATIVE_PATH_REVIEW` — **COMPLETED_WITH_WARNINGS**.
Kullanıcının sponsorun boyutu büyütüp büyütmediği sorusu üzerine iki alt ajan
salt-okunur karşılaştırma yaptı. Bu bölüm önceki "provider form yaması ardından
canlı kabul" varsayımını düzeltir. Yalnız bu plan belgesi güncellendi; kaynak,
kontrat, bağımlılık, flag veya canlı ayar değiştirilmedi.

İki sponsor adımı ayrıdır: Google/MPC imzasını ürettiren dış sponsor işlemi
Auth0 formuna iç içe eklenmez. Ancak upload relay için kullanılan
`sponsor_quote` ve `sponsor_quote_signature` **imzalanan mesajın içindedir** ve
boyutu önemli ölçüde artırır. Aynı veriyle delegate yerine normal transaction
kullanmak bu yükü kaldırmaz.

Mevcut fixture ve RSA2048 ile **LOCAL_TEST / sentetik** karşılaştırma:

| Temsilî işlem | Eski Auth0 form seçenekleri, bayt | Tam sentetik JWT, bayt |
| --- | ---: | ---: |
| Mevcut quote + cihaz, delegate | 27.052 | 10.586 |
| Aynı içerik, normal transaction | 27.023 | 10.629 |
| Quote çıkarılmış, cihaz korunmuş, normal transaction | 12.138 | 5.662 |
| Quote ve cihaz çıkarılmış, normal transaction | 9.051 | 4.586 |

Son iki satır yalnız boyut deneyidir; public pilotun kabul ettiği işlem değildir.
Sabit sentetik claim/header boyutları gerçek Auth0 tokenı boyutu sayılmaz.
En ağır 200 bayt kaçışlı başlıkta quotesiz normal işlemin JWT'si cihazla 8.556,
cihaz ayrıyken 7.480 bayttır; temsilî örneğin küçülmesi tüm desteklenen girdilere
yeterlilik kanıtı değildir. Yalnız cihazı ayırmak da mevcut quote'li temsili
delegate JWT'sini 9.510 bayta indirir; sorun devam eder.

**Yeni PROVIDER / salt-okunur kanıt:** 17 Eylül 2026 06:20 UTC, final blok
**268957871**, hash `CFoSGx7jmW89Q6QinQjdUqbahR2PTeg5voAmen8KwKR2`:
`auth0.jwt.fast-auth.testnet` üzerindeki saf `verify` metodu RPC
`query / call_function` ile çağrıldı. Aynı blokta 7.168 baytlık sentetik JWT
`[false, ""]`, 7.169 baytlık sentetik JWT
`[false, "JWT token exceeds maximum size limit"]` döndürdü. İlk sonuç sahte
imzanın reddidir, başarılı kimlik doğrulama değildir. Gerçek JWT, login,
transaction broadcast, imza, ödeme veya state yazımı kullanılmadı.

[Guard kaynağındaki 7.168 bayt sınırı](https://raw.githubusercontent.com/Peersyst/fast-auth/main/contracts/jwt-guards/base-jwt-guard/src/core.rs)
böylece çalışan testnet davranışıyla da doğrulandı; tüm deployed kodun kaynakla
eşit olduğu iddia edilmez. Mevcut temsilî delegate'in **yalnız `fatxn` alanının
base64url bölümü 9.815 bayttır**; diğer claim/header/imza eklenmeden bile sınırı
aşar. Form girintisi yaması `fatxn` içeriğini değiştirmediği için bu ikinci
engeli çözmez. Mainnet guard davranışı bu kontrolde ölçülmedi.

| Alternatif | Değerlendirme |
| --- | --- |
| Sponsorluğu koruyup yükleme mesajını küçültmek | Tercih edilen yerel araştırma. Tekrarlanan quote alanlarını daha kısa bir temsilden yeniden kurup aynı hesap, job, ücret, süre ve imza bağlarını doğrulamak mümkün olabilir. Mevcut Web/Bridge/Market mesaj biçimi değişir; önce ağsız prototip ve en büyük girdi ölçümü gerekir. Henüz uygulanmış/kanıtlanmış çözüm değildir. |
| Quotesiz normal upload; gas'ı Google hesabı ödesin | Boyutu azaltır, fakat Web `livepeer-upload.ts:401` bu yolu public V1'de kapatır; Market `lib.rs:1246` public policy altında quotesiz ödemeyi iade eder. Kontrat/politika ve ücret davranışı değişmeden açılamaz. Google/MPC dış imzası için ödeyici ihtiyacı ayrıca sürer. |
| Provider düzeltmesi | Mevcut form yamasına ek olarak gerçek JWT boyutu ve guard sınırı birlikte çözülmelidir. Daha verimli token temsili Action/guard/istemci uyumu ister; sınırı ölçmeden artırmak önerilmez. |
| Cihazı ayrı işlemle kaydetmek | Veri azalır ama tek başına iki sınırı çözmez; ek imza ve kurtarma adımı getirir. |
| Yerel oturum anahtarı veya yalnız hash imzası | Küçük kestirme değildir. FunctionCall anahtarı ödeme için gereken 1 yoctoNEAR'ı ekleyemez; FullAccess anahtarı güven modelini değiştirir. Mevcut guard tam `fatxn == sign_payload` bekler; hash/sıkıştırma karşı taraf desteği olmadan kullanılamaz. |

Tek sonraki gate yalnız yerel boyut/uyumluluk planıdır: mevcut sponsorlu
mesajı temel al, aynı güvenlik bağlarını koruyan kısa temsil adayını ölç;
200 bayt başlıkların tamamını, en uzun desteklenen kimlik/claim alanlarını,
form/JWT/API sınırlarını ve normal cihaz davranışını kapsa. Mevcut
`scripts/near-auth-provider-handoff/` düzeni yeniden kullanılabilir; canlı
kontrat değiştirilmez. Çıkışta somut mesaj biçimi, güvenlik eşdeğerliği,
ölçülmüş boyut payı ve gerekli explicit-path uygulama kapsamı verilir.
Başarısızsa provider protokol düzeltmesi veya ayrı sponsorsuz tasarım kararı
gerekir; otomatik alternatif ödeme/yükleme başlatılmaz.

## İnceleme kapsamı ve sorumluluk

- Kaynak: `f71178263c5d264bef647feaae8a2b54618b1333` tabanı ve üzerindeki mevcut
  yerel değişiklikler. Bu inceleme yalnız commit edilmiş main'i temsil etmez.
- Ana ajan entegrasyon, kaynak doğrulaması ve bu belgenin tek yazarıdır.
  Üç salt-okunur alt ajan kimlik/imza, upload/oynatma ve provider/SDK sınırlarını
  ayrı inceledi; bulgular ortak çağıranlar ve kontrat koşullarıyla uzlaştırıldı.
- Yazılabilir repo dosyası yalnız bu belgedir. Uygulama, testler, bağımlılıklar,
  kontratlar, Bridge, release, ortam ayarları ve mevcut kullanıcı dosyaları
  değiştirilemez. Sentetik inceleme denemeleri repo dışındaki geçici dizindedir.
- Kabul: bildirilen hatayı diğer risklerden ayırmak; kaynak/resmî belge kanıtı,
  uygulanabilir tek sonraki gate ve ayrı canlı/ürün kabul ölçütleri yazmak.
  Doğrulama: mevcut Web testleri, auth tip kontrolü, provider handoff testleri,
  doküman derlemesi ve kapsam dışı dosyaların hash karşılaştırması.

## Korunacak mimari ve kullanıcının gerçekte yaptığı işlem

```text
Google / sağlayıcının desteklediği passkey
  -> Auth0 kimliği -> doğrulanmış YouTick oturumu
  -> issuer + subject üzerinden MPC anahtarı -> NEAR hesabının zincir kontrolü

Upload taslağı + mevcut cihaz -> Bridge'in imzalı ücret teklifi
  -> tam delegate baytları için ayrı Google onayı
  -> seçilen sponsor cüzdanından NEAR Auth / MPC imza isteği
  -> doğrulanmış MPC imzası -> mevcut Bridge relay -> NEAR ücretli iş
  -> aynı job ile Livepeer upload/yayın -> mevcut V2 oynatıcı

Oynatma -> mevcut V3 cihaz yetkisi + NEAR sahiplik/entitlement kontrolü
  -> Bridge kısa süreli playback tokenı -> Livepeer HLS
```

Giriş oturumu işlem imzası veya video hakkı değildir. NEAR ekonomik/erişim
otoritesi, Bridge kontrol katmanı, Livepeer medya katmanı olarak kalır; D1
kimlikten hak üretemez. Google hesabı video sahibi, ayrı sponsor yalnız MPC
isteğinin ödeyenidir. MPC sponsoru ile upload delegate'ini zincire ileten
Bridge sponsoru farklı adımlardır. Mevcut ortak upload/oynatıcı yeniden kullanılır.

Kaynak sınırları: `apps/web/app/api/auth-lab/session/route.ts:72`,
`apps/web/lib/near-auth-account-preflight.ts:48`,
`apps/web/lib/near-auth-signing-server.ts:92`,
`apps/web/lib/near-auth-upload-wallet.ts:61` ve
`apps/web/components/NearAuthLab.tsx:98`. Satırlar bu inceleme anına aittir.

## Öncelikli bulgular

### 1. Bildirilen hata: provider onay formunun boyutu

Auth0 [form alanlarını 24 KB ile sınırlar](https://auth0.com/docs/customize/forms/render).
Repodaki hata kaydı `24576` bayt sınırını bildiriyor. Video dosyası Auth0'ya
gönderilmiyor; onay ekranına konan işlem argümanları girintili JSON nedeniyle
büyüyor. Bugünkü mevcut handoff testi temsilî delegate için **27.052 → 7.055**,
en ağır başlık örneği için **36.289 → 9.222** bayt ölçtü. Yama yalnız gösterim
girintisini kaldırıyor; işlem baytlarını, değerleri ve ret hakkını koruyor.

17 Eylül 06:01 UTC salt-okunur [upstream kaynak kontrolünde](https://raw.githubusercontent.com/Peersyst/fast-auth/main/packages/auth0/src/actions/authorize-app.action.js)
eski biçimlendirme sürüyor; SHA-256
`9476e322b93d1c0059bd27453295256b16476d7ce51ce362570b81cb476b631b`.
Bu, barındırılan Auth0 Action sürümünün kanıtı değildir. Gerçek yayın/kabul
**UNPROVEN**. `access_denied` tek başına her zaman boyut hatası demek değildir;
yeni farklı açıklama gelirse aynı teşhis otomatik uygulanmaz.

Bu form hatasının düzeltmesi mevcut sağlayıcı yamasıdır; dosyayı küçültmek, bakiye artırmak, imza
baytlarını kırpmak veya issuer değiştirmek değildir. Sağlayıcıdan tenant/Action
kimliği, kaynak revizyonu, yayın zamanı ve gerçek form kabulü gerekir.
Bu yama yukarıdaki ayrı JWT sınırını çözmez; tam akış için yeterli sayılmaz.

### 2. P2 — ortak Google imzasında son süre kontrolü eksik

`near-auth-signing-server.ts:131` tokenı doğruluyor, ardından zincir kontrolleri
yapıp geçerliliği yeniden denetlemeden sponsor çağrısı döndürüyor.
`near-auth-signing.ts:64-77` de inceleme süresini yalnız başta kontrol ediyor;
sponsor hesabı/cihaz beklemelerinin sonunda tekrar denetlemiyor. Upload'daki
`near-auth-upload-server.ts:123` ve `near-auth-upload-wallet.ts:63` bu korumayı
zaten içeriyor. Eksik olan kardeş self-transfer/bilet yollarıdır.

**LOCAL_TEST:** mevcut test düzeninin repo dışındaki kopyasında iki ek sentetik
deneme, token başlangıçta geçerliyken zincir kontrolünde saat 61 saniye ileri
alındığında normal imza ve bilet için sponsor çağrısının hâlâ üretildiğini gösterdi.
Gerçek token/sponsor/ağ kullanılmadı. Bu hata `access_denied` nedeni değildir;
geçersiz onay için gereksiz sponsor gideri riski yaratır.

### 3. P2 — quote'in kendi blok penceresi ön kontrolde eksik

`near-auth-upload-server.ts:54` ve Bridge
`workers/livepeer-bridge/src/index.ts:4252` mevcut bloğu delegate'in son bloğuyla
karşılaştırıyor. Market ise ayrıca **yürütme bloğu ≤ quote'in son bloğu** ister:
`contracts/nft-ticket/src/lib.rs:2103`. Quote'in saat süresinin dolmamış olması
bu ayrı zincir koşulunu karşılamaz.

**LOCAL_TEST:** quote son bloğu 1200, hazırlık bloğu 1199 ve delegate son bloğu
1399 iken güncel blok 1201'e ilerletildi. Quote/JWT saat süresi geçerli kaldı;
gerçek `authorizeGoogleUpload` sponsor çağrısı döndürdü. Market koşulu bu blokta
sağlanamaz. Google ön kontrolü ve ortak Bridge relay sınırında, yeni ücretli
gönderimden önce quote'in kendi blok penceresi de denetlenmeli. Mevcut işlemin
sonucunu uzlaştıran yol bu kontrolle engellenmemeli.

Bu, delegate için verilen **+200 blok toleransının hatalı olduğu** iddiası
değildir: Bridge aynı toleransı tanıyor (`index.ts:4034-4035`, `4260-4261`).
İlk bu yöndeki şüphe incelemede elendi. Kontrat sınırı gevşetilmeyecek. Ön
kontrol ile zincirde yürütme arasındaki ilerleme riski de tamamen yok olmaz.

### 4. Bilinçli pilot sınırları, ürün kabulünün yerine geçmiyor

- **Cüzdan gereksinimi sürüyor:** hesap hazırlama, test USDC fonlama ve MPC
  sponsor seçimi kullanıcıdan harici cüzdan istiyor. Google ile giriş geniş
  kitleye uygun finansman deneyimini tek başına sağlamıyor.
- **İlk cihaz ve ilk işlem:** upload/bilet kontrolü mevcut cihaz kaydında duruyor
  (`near-auth-upload-server.ts:75`, `near-auth-ticket-purchase.ts:101`). Aynı
  hesaptan ikinci upload ayrı kabul ister. Lab oynatıcı yalnız creator'a açık
  (`NearAuthLab.tsx:105`); buyer playback henüz ürün kabulü değil.
- **Güvenli durma, tamamlanmış kurtarma değil:** `outer_pending`,
  `outer_submitted`, `mpc_verified` kayıtları ikinci sponsor ücretini engelliyor;
  sonuncusu upload ödemesi başarısı anlamına gelmiyor. Süresi dolmuş tamamlamada
  otomatik kilit silmek yerine aynı işlemin salt-okunur uzlaştırılması gerekir.
- **Passkey hesabı:** anahtar issuer + subject'ten türetiliyor. Auth0 farklı
  kimlikleri [varsayılan olarak ayrı hesap sayar](https://auth0.com/docs/manage-users/user-accounts/user-account-linking).
  Passkey seçeneğinin görünmesi aynı Google hesabı, anahtar ve hakları kanıtlamaz.
  Aynı e-postadan otomatik birleştirme yapılmaz; sağlayıcının desteklediği
  bağlama/kurtarma yolu ve mevcut asıl kimliğin korunması doğrulanır.
- **Üretim kapalı:** mevcut lab yalnız development/testnet, API'ler ayrıca
  localhost ile sınırlı. Production için yalnız bayrak açmak yeterli değildir.
  [Onaylı uygulama ve production kimlik bilgileri](https://docs.auth.near.org/resources/networks)
  gerekir; ortak testnet client taşınmaz.

## Revize sıra — her satır ayrı gate, otomatik ilerleme yok

| Sıra | Gate / sorumlu | Çıkış ölçütü |
| --- | --- | --- |
| 0 | `NEAR_AUTH_PAYLOAD_COMPATIBILITY_PLAN` / tamamlandı | İzole prototip, boyut matrisi ve ortak imzalı örnekler yerelde geçti; canlı kabul değildir. |
| 0.1 | `NEAR_AUTH_COMPACT_UPLOAD_SOURCE` / tamamlandı | Ortak codec/decoder ve Google imza hazırlığı ana kaynakta bağlandı; yerel kontroller geçti, canlı yayın yapılmadı. |
| 1 | `NEAR_AUTH_SIGNING_FRESHNESS_SOURCE` / tamamlandı | Son süre/blok kontrolleri ile yeni gönderim durdurma ve eski işlem uzlaştırması yerelde doğrulandı. |
| 1.1 | `NEAR_AUTH_LOCAL_UX_ACCEPTANCE` / tamamlandı | 18 UX + 15 playback senaryosu yerelde geçti; gerçek imza/ödeme yoktur. |
| 2 | `NEAR_AUTH_COMPACT_RELEASE_PREFLIGHT` / tamamlandı | Kaynak adayı, iki source engeli, bakım ve compact sonrası geri dönüş sınırı kaydedildi. Engeller aşağıdaki source gate ile giderildi. |
| 2.1 | `NEAR_AUTH_COMPACT_RELEASE_GUARDS_SOURCE` / tamamlandı | CI tüketici seçimi ve policy güncellendi; 224 yerel test geçti, canlı bakım/gönderim yok. |
| 2.2 | `NEAR_AUTH_COMPACT_SOURCE_INTEGRATION` / tamamlandı | Ayrı main adayı, temiz paket kurulumu, son diff ve yerel doğrulamalar tamamlandı; GitHub değişmedi. |
| 2.3 | `NEAR_AUTH_COMPACT_GIT_PUBLISH` / tek sonraki gate, açık onay bekler | Tek commit, yeni dala push, taslak PR ve otomatik PR CI; merge/deploy/ödeme yok. |
| 2.4 | Korumalı compact yayın / ayrıca yetkilendirilecek | Nihai main/CI artifact'i, onaylı bakım, Market state eşitliği ve Bridge/Web sürüm-yetenek doğrulaması gerekir. |
| 3 | Mevcut Gate 4'ün kontrollü canlı kabulü / kullanıcı + ana ajan | Brave kararlılığı ve işlem uzlaştırmasından sonra aynı taslakla tek ödeme → yayın → creator playback → reload kanıtlanır. |
| 4 | Ürün kimliği ve finansman kararı / ürün sahibi + çözüm mimarı | Passkey bağlama/kurtarma, mevcut cüzdan kullanıcıları, masrafı ödeyen aktör ve sınırlar belirlenir. Yeni servis varsayılmaz. |
| 5 | Ürün akışlarının ayrı uygulama/kabul gate'leri | Önce mevcut cihazla ikinci işlem; sonra tek buyer purchase/playback; sonra onaylı passkey/yeni cihaz/kurtarma ve mobil tarayıcı kabulü. Her biri ayrı kapanır. |
| 6 | Production hazırlığı ve korumalı yayın | Onaylı provider ayarları, gerçek dağıtım ortamı, operasyon bütçesi ve mahremiyet kararı doğrulanır; exact SHA → CI → deploy → runtime kabulü izlenir. |

Yerel boyut araştırması provider değişikliği beklemeden ilerleyebilir; yerel
başarı canlı kabulü geçirmez. Form/JWT uyumu sağlanmadan canlı pilot bekler.
Kimliği değiştiren alternatif bir tenant/guard'a sessizce geçilmez.

## Boyut kararı sonrasındaki süre düzeltmesi gate'inin kapsamı

Amaç: geçerliliğini yitirmiş onay veya quote için yeni ücretli işleme
başlamamak. Aynı var olan kontrolleri tamamla; yeni servis/dependency veya genel
auth refactor'ı ekleme.

İzinli uygulama dosyaları: `apps/web/lib/near-auth-signing-server.ts`,
`apps/web/lib/near-auth-signing.ts`, `apps/web/lib/near-auth-upload-server.ts`,
`workers/livepeer-bridge/src/index.ts`; yalnız ilgili mevcut
`near-auth-signing-server.test.ts`, `near-auth-signing-client.test.ts`, gerekirse
`near-auth-upload-wallet.test.ts` ve Bridge `src/index.test.ts` testleri, bu belge.
Kontrat/ABI, WalletProvider, cihaz deposu, paketler, provider/config, release
ve canlı veriler kapsam dışıdır.

1. Ortak imza sunucusunda son zincir sorgusundan sonra doğrulanmış token ve
   inceleme son zamanını denetle; istemciye geçerlilik bilgisini aktar.
   Sponsor hesabı/cihaz beklemesinden sonra yeniden denetle; bu metadata'yı
   cüzdana işlem alanı olarak gönderme. İmza baytları aynen kalır.
2. Google upload ön kontrolüne ve ortak Bridge relay'in **yeni gönderim**
   kontrolüne quote'in geçerli blok aralığını ekle. Mevcut job/transaction
   uzlaştırmasını, toleransı ve kontratın son otoritesini koru.
3. Mevcut testlerde zaman/blok ilerlet: token ve inceleme sorgu/hesap beklemesinde
   sona ererse sponsor çağrısı **sıfır**; quote son bloğu aşılmışsa yeni sponsor
   veya relay gönderimi **sıfır**; geçerli sınır ve mevcut sonuç uzlaştırması
   çalışır. Normal cüzdan upload yolu da ortak Bridge testiyle korunur.
4. `docs/testing.md` komutlarıyla Web unit, auth tip kontrolü, lint; Bridge unit
   ve check çalıştır. Web build'i çalışan yerel sunucunun çıktısını bozmayan
   izole kopyada doğrula. Herhangi bir canlı imza/ödeme/deploy yapılmaz.

Bu düzeltme sponsor penceresinde kullanıcının ne kadar bekleyeceğini garanti
etmez. Sonraki canlı kabulde 60 saniyelik signing tokenı, en çok 120 saniyelik
quote, ayrı blok penceresi ve sponsor/MPC beklemeleri birlikte ölçülür. Geçmiş
saatle JWT doğrulamak veya süreyi gelişigüzel uzatmak çözüm kabul edilmez.

## Canlı ve ürün kabulüne eklenen koşullar

Canlı Gate 4'te aynı hesap/sponsor/dosya/taslak ve mevcut Brave cihazı korunur.
Önce kesinleşmiş job ve bilinen sponsor işlem hash'leri uzlaştırılır; güncel
hesap, bakiye, cihaz, nonce, blok ve quote yeniden okunur. Eski bütçe/izin yeni
işleme taşınmaz; güncel kesin tutar ve sınır kullanıcıya sunulur. İmzaları
kullanıcı verir. Belirsizlikte tekrar ödeme, yeni job veya provider asset yoktur.

Her adım için kimlik verisi içermeyen aşama, süre, kalan onay/quote zamanı,
blok sınırı ve işlem/job sonucu kaydedilir. JWT, subject, cookie veya özel
anahtar tanılama kaydına konmaz. Tek kullanıcı pilotu başarı oranı/SLA kanıtı
sayılmaz. Auth0 formu, sponsor, relay, upload, yayın ve HLS hataları ayrılır.

Ürün gate'lerinde izleyici hedefi **giriş → bilet → izle**; creator hedefi
**giriş → dosya ve ücret incelemesi → yükle → izle** olur. Laboratuvarın hesap
ve sponsor panelleri son kullanıcıya aynen taşınmaz. Gas/hesap hazırlığını
platform karşılayacaksa önce sağlayıcının mevcut relayer hizmeti ve mevcut
Bridge sınırları değerlendirilir; aktör, izinli işlemler, kullanıcı/job başına
bütçe, tekrar koruması ve kötüye kullanım limiti belirlenmeden yeni servis yazılmaz.
USDC finansmanı ayrı ürün kararıdır; bu plan kart ödemesi eklemez.

Passkey kabulü: Google → sağlayıcının desteklediği güvenli passkey ekleme →
çıkış → passkey → **aynı anahtar/NEAR hesabı ve haklar**; ayrıca farklı yöntemle
yeni kayıt, Google erişimi kaybı ve kayıp cihaz. Hesap kurtarma ile V3 oynatma
cihazı kaydı ayrı denetlenir; passkey girişi cihaz yetkisini otomatik taşımaz.
Bağlamada her iki hesabın kontrolü doğrulanır; issuer/primary subject değişiminin
fon/hak erişimine etkisi çözülmeden yöntem açılmaz. Mevcut cüzdan kullanıcıları
için bağlantı/migrasyon ayrıca onaylanır; eski hesaplar yerinde kalır.

Doğrudan Auth0 + v7 yaklaşımında issuer/audience, `fatxn`, türetim yolu ve MPC
cevabı uyumluluğunun sahibi YouTick'tir. Provider protokolü/paket değişiminde
mevcut token-cache, byte eşitliği, süre, ret ve boyut testleri yeniden koşulur.
Handoff fixture'ları tüm olası ID/JWT uzunluklarını kapsamaz; en uzun desteklenen
başlık/ID/claim birleşimi form, API ve MPC cevap sınırlarında birlikte ölçülür.
Mahremiyet kararı, işlem onay tokenındaki kimlik referansının zincirde kalıcı
görünmesini de kapsar; yeni tenant bu konuda kendiliğinden çözüm değildir.

## Bu incelemenin yeni kanıtı

- **LOCAL_TEST:** mevcut Web suite **46 dosya / 722 test PASS**;
  provider handoff **10 test PASS**. Yeni üç ağsız inceleme denemesi yukarıdaki
  iki kaynak boşluğunu yeniden üretti; düzeltme testi PASS anlamına gelmez.
  Denemeler repo dışında `/tmp/youtick-auth-review-gwp29w0n/` içindedir;
  gerçek RSA/JWT ve uygulama fonksiyonları, sahte zincir/sponsor kullanır.
- **LOCAL_STATIC:** `npm run test:near-auth-types`, doküman derlemesi/bağlantı
  kontrolü ve diff boşluk kontrolü PASS. VitePress'in 500 kB bundle uyarısı
  sürüyor. Başlangıçta hash'i alınan 360 dosyadan yalnız bu belge değişti;
  diğer 359 dosya aynı, yeni repo dosyası yok. İki alt ajanın son plan
  çapraz incelemesinde önemli çelişki bulunmadı.
- **PROVIDER / salt-okunur:** güncel resmî belgeler ve upstream kaynak okundu.
  Hosted Action yayını, bugünkü zincir/bakiye ve Brave durumu doğrulanmadı.
- **EXTERNAL_NOT_RUN:** gerçek Google/passkey/sponsor onayı, ödeme, upload,
  HLS, CI, Preview/Production, provider/config değişimi, dış mesaj, commit,
  push, PR, merge veya deploy. Kod değişmediği için yeni Web/Bridge build'i,
  Bridge/kontrat testleri ve tarayıcı kabulü çalıştırılmadı.

Bu gate'in plan tesliminde blocker yoktur. Canlı kabulün blocker'ları mevcut
form/JWT boyut uyumsuzluğu ve seçilecek düzeltmenin yayın/kabul kanıtıdır;
yukarıdaki yerel süre bulguları da canlı denemeden önce kapatılır.

## 16 Eylül gate kayıtları

Aşağıdaki sonuçlar tarihsel kanıttır. Yeni değerlendirme ve tek sonraki gate
yukarıdadır; geçmiş PASS sayıları bugünkü canlı kabul gibi okunmaz.

## Gate 1: sağlayıcı düzeltme paketi

Gate: `NEAR_AUTH_PROVIDER_PROMPT_HANDOFF`.
Yerel sonuç: **COMPLETED_WITH_WARNINGS**. Paket ve testler tamamlandı;
sağlayıcıda uygulanmış düzeltme ve canlı Google upload kabulü **UNPROVEN**.
Sağlayıcı yöneticisi/erişimi belirlenmiş değil. Paket dışarı gönderilmedi.

- Teslim paketi ve temiz kurulum: `scripts/near-auth-provider-handoff/README.md`
- Tek satırlık sağlayıcı yaması: `docs/architecture/near-auth-prompt-size.patch`
- [İlk hata analizi ve sentetik ölçüm](./near-auth-prompt-size.md)
- [Yerel test komutları](../testing.md#near-auth-provider-handoff-isolated-synthetic)

Sabit kaynak: Peersyst/fast-auth
`38dc894afbc94c198c207f52e6d01d695199eaa1` içindeki
`packages/auth0/src/actions/authorize-app.action.js`.
Kaynak SHA-256:
`9476e322b93d1c0059bd27453295256b16476d7ce51ce362570b81cb476b631b`.

Sağlayıcının onay formu, işlem argümanlarını girintili JSON ile büyütüyor.
Yama yalnız bu girintiyi kaldırıyor; imzalanan baytları, alanları veya yetki
kurallarını değiştirmiyor. [Auth0 alan sınırı 24 KB](https://auth0.com/docs/customize/forms/render).
Bu rapor çalışan sağlayıcının hangi kaynak sürümünü kullandığını doğrulamaz.

**LOCAL_TEST:** 10 test geçti. Gerçek yama `git apply --check` ve `git apply`
ile geçici kaynak kopyasına uygulandı; orijinal/yama/sonuç hash'leri doğrulandı.
Gösterilen bütün değerler, `fatxn` baytları, büyük sayı hassasiyeti, kullanıcı
reddi ve yanlış signing-audience reddi korundu. Testlerde ağ çağrısı yok.

Teslim arşivi yalnız altı açıkça seçilmiş dosyayı içerir. Çalışma alanı dışındaki
temiz bir dizine açılıp kendi lockfile'ıyla kurulduğunda aynı 10 test geçti;
uygulama veya eski `tmp/near-auth-spike` kurulumu kullanılmadı. Paket ve kanıt:
`tmp/near-auth-provider-handoff-gate1/near-auth-provider-handoff.tar.gz`,
`tmp/near-auth-provider-handoff-gate1/evidence/result.json`.

**LOCAL_STATIC:** doküman derlemesi, bağlantılar ve diff boşluk kontrolü geçti.
VitePress'in 500 kB üstü bundle uyarısı sürüyor; bir link/build hatası değil.
Başlangıçtaki kapsam dışı 60 dosyanın SHA-256 değerleri değişmedi.

| Sentetik başlık | Delegate: önce → sonra | Normal işlem: önce → sonra |
| --- | ---: | ---: |
| Temsilî | 27.052 → 7.055 | 27.023 → 7.026 |
| 200 bayt ASCII | 29.358 → 7.571 | 29.329 → 7.542 |
| 200 bayt Türkçe | 29.564 → 7.777 | 29.535 → 7.748 |
| 200 bayt kaçış karakterli | 36.289 → 9.222 | 36.260 → 9.193 |

Ölçümler UTF-8 ile bütün prompt seçenekleri içindir; Auth0 sınırı yerelde
taklit edilir. Gerçek kullanıcı payload'ı veya sağlayıcı kabulü değildir.
Önceki 27.101 → 7.104 ölçümü yer tutucu quote ID kullanıyordu; yeni fixture
her başlık için canonical quote ID'yi hesaplar. Ölçüm farkının nedeni budur.
Fixture quote imzası yine sentetiktir; geçerli canlı teklif sayılmaz.

## Gelinen aşama ve tarihsel kanıtlar

| Konu | Son kayıt / anlamı |
| --- | --- |
| Google giriş ve reload oturumu | [Oturum raporunda](./near-auth-session-restore.md) önceki gerçek kabul kayıtlı. Bu gate yeni giriş yapmadı. |
| Hesap ve basit Google/MPC imzası | [İmza raporunda](./near-auth-google-signing-lab.md) önceki başarılı zincir işlemi var; upload kabulü değildir. |
| Localhost CORS | [Runtime raporunda](./near-auth-google-upload-local-runtime.md) 16 Eylül OPTIONS 204 kayıtlı; ilk kaynak raporundaki engel tarihsel. Bugünkü CORS yeniden sorgulanmadı. |
| Google hesabının USDC hazırlığı | [RPC raporunda](./near-auth-upload-rpc-fix.md) blok 268880300: 600000 mikro test USDC, aynı taslak için ücretli iş yok. Güncel bakiye veya tekrar fonlama talimatı değildir. |
| Son somut Google upload hatası | `access_denied`, 24576 bayt prompt sınırı. Yerel yeniden üretim var; provider düzeltmesi doğrulanmadı. |
| Brave | [Çökme raporu](./near-auth-brave-sponsor-crash.md) ayrı bir kararlılık sorunu; prompt yamasının bunu çözdüğü iddia edilmez. |
| Upload / creator playback / reload | Bu Google pilotunda canlı kabul henüz yok. |

Güncel uygulama doğrudan Auth0 SPA SDK, jose ve `near-api-js` v7 kullanıyor.
Eski Browser/React SDK ve v5 uyarlama önerisi güncel uygulama planı değildir.
NEAR ekonomik/erişim otoritesi, Bridge kontrol katmanı, Livepeer medya katmanı
olarak kalır. Pilot aynı Google hesabı, sponsor, dosya/taslak ve mevcut Brave
profilini kullanır; ilk cihaz sınırı korunur.

## Gate 2: yerel yükleme güvenliği

Gate: `NEAR_AUTH_UPLOAD_SAFETY` — **COMPLETED_WITH_WARNINGS**.
[Değişiklikler, kanıtlar ve salt-okunur işlem uzlaştırması](./near-auth-upload-safety.md).
Doğrulanmış token süresi sponsor çağrısından önce yeniden denetleniyor;
belirsiz işlem kayıtları korunuyor. Google pilotunda ücretli işin kayıp/geçersiz
upload anahtarı değiştirilmeden duruluyor; mevcut cihaz yetkisi aranıyor.
Sponsor görünürlüğü ve fonlama panelinin ortak meşguliyet kilidi tamamlandı.

**LOCAL_TEST:** 46 dosya / 710 test PASS. **LOCAL_STATIC:** sıkı auth tip
kontrolü, lint ve ayrı kaynak kopyasında Web build PASS. Derleme uyarıları ve
canlı kabul sınırları gate raporunda kayıtlı. Sağlayıcı yayını **UNPROVEN**;
bu sonuç yeni canlı imza/ödeme veya Gate 3'e otomatik geçiş değildir.

## Gate 3: Google hesabıyla mevcut V2 oynatıcı

Gate: `NEAR_AUTH_CREATOR_PLAYBACK_SOURCE` — **COMPLETED_WITH_WARNINGS**.
[Kaynak, oturum sınırları ve yerel tarayıcı kanıtı](./near-auth-creator-playback.md).
Ortak oynatıcı Google lab'e bağlandı. Job bağlantıları ve redirect dönüşü
lab içinde kalır. Creator sahipliği ve mevcut V3 cihaz doğrulanır;
logout/401/hesap değişiminde sekmelerdeki oynatma durur, cihaz anahtarı korunur.

**LOCAL_TEST:** 722 unit test; ayrı Brave bağlamında 15 Google-lab senaryosu
ve normal cüzdan yolunun 5 mevcut senaryosu PASS. **LOCAL_STATIC:** auth
tip kontrolü, lint ve izole Web build PASS. Tarayıcı testlerinde kimlik,
zincir, token yanıtı ve medya surface'i sahtedir; gerçek HLS kabulü değildir.

## Gate 4: canlı kabul ön kontrolü — BLOCKED

Gate: `NEAR_AUTH_LIVE_ACCEPTANCE_PREFLIGHT`.
[Güncel salt-okunur kontroller ve devam koşulu](./near-auth-live-acceptance-preflight.md).
Sağlayıcı düzeltmesinin yayın kanıtı hâlâ **UNPROVEN**. Upstream dosya
16 Eylül 19:53 UTC kontrolünde eski biçimlendirmeyi içeriyor; bu gözlem
barındırılan Action sürümünü tek başına belirlemez. Keşif servisi HTTP 200.
Mevcut lab sekmesi giriş istiyor; aynı taslak final blok 268892356'da
henüz ücretli işe dönüşmemiş. Kurulu Brave 1.95.101; profilin gerçek
sponsor-pencere kararlılığı doğrulanmadı. Canlı imza/ödeme başlatılmadı.

Bu tarihsel ön kontrol mevcut büyük mesajın sağlayıcı yamasını bekliyordu.
Kısa mesaj yolu seçildiğinde bu yama zorunlu ön koşul değildir; uyumlu
Web/Bridge/Market yayını ve gerçek Google/MPC kabulü gerekir. Yerel süre
ve UX gate'leri tamamlandı. Güncel sıra bu belgenin üstündedir.

## Gate 1 sınırları ve tarihsel değişiklik kaydı

Gate 1 yalnız `scripts/near-auth-provider-handoff/` test paketini, bu durum
belgesini, prompt raporundaki kalıcı test bağlantısını, dört eski rapordaki
tarihsel notları ve `docs/testing.md` test komutunu kapsar. Mevcut sağlayıcı
yaması korunmuştur. Uygulama bağımlılıkları/kodu, cüzdan/cihaz depoları ve
çalışan yerel Web build'i değiştirilmedi.

**EXTERNAL_NOT_RUN:** yeni Google/sponsor onayı, ödeme, upload, playback,
provider değişikliği, dış iletişim, CI veya deploy. Commit/push/PR yapılmadı.
Uygulama kodu değişmediği için Web/Bridge/kontrat testleri ve build tekrar
çalıştırılmadı; önceki sonuçlar bu gate'in yeni testi gibi sunulmaz.
