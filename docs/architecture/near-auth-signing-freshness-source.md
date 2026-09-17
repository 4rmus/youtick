# Google imzası ve upload teklifinin son geçerlilik kontrolü

Gate: `NEAR_AUTH_SIGNING_FRESHNESS_SOURCE`. Tarih: 17 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS / LOCAL_STATIC + LOCAL_TEST**.
Güncel sıra: [entegrasyon durumu](./near-auth-integration-status.md).

## Kapsam ve kabul

Başlangıç `f71178263c5d264bef647feaae8a2b54618b1333` ve mevcut yerel değişikliklerdir.
İlk durumda 368 kaynak dosyasının içeriği ve hash'i, Git index ve durum kaydı
saklandı. Yalnız mevcut imzalama, upload ön kontrolü, ortak Bridge relay,
ilgili testler ve bu gate'in belgeleri değiştirildi. Kontrat/ABI, WalletProvider,
cihaz deposu, paketler, feature flag varsayılanları, provider/config ve canlı
veriler kapsam dışı kaldı. Commit, push, CI tekrar çalıştırma ve deploy yoktur.

Kabul: son beklemeler sırasında geçerlilik biterse yeni ücretli çağrı/gönderim
sıfır; mevcut iş ve sonucu belirsiz gönderimin sorgulanması korunur. İmza
baytları veya süreler değiştirilmez, eski token yeniden geçerli sayılmaz.

## Değişiklik

- **Normal Google imzası ve bilet:** sunucu, doğrulanmış token ile şifreli
  inceleme biletinin bitişlerinden erken olanını zincir sorguları bittiğinde
  tekrar kontrol eder. Bu son zaman istemciye `approvalExpiresAtMs` olarak
  döner. İstemci sponsor hesabı ve cihaz beklemelerinin sonunda süreyi tekrar
  denetler; metadata cüzdana işlem alanı olarak aktarılmaz. Geçersiz sürede
  sponsor çağrısı ve `outer_pending` kaydı oluşturulmaz.
- **Google upload:** account-key bloğu artık quote'in başlangıç/son bloğu
  içinde olmalıdır. Diğer ön kontroller tamamlandıktan sonra bir yeni final
  blok okumasıyla aynı aralık tekrar denetlenir; quote'in saat süresi de
  yeniden kontrol edilir. Hazırlık, yetkilendirme ve tamamlama aynı kontrolü
  kullanır. Eksik/geçersiz blok yüksekliği de kabul edilmez.
- **Ortak Bridge relay:** yeni gönderim ön kontrolü quote saat/blok sınırını
  ve delegate bitişini birlikte denetler. İmzalama ve kayıt beklemelerinden
  sonra, gönderim çağrısının hemen önünde yeni final blokla tekrar kontrol
  edilir. Hem normal cüzdan hem Google yolu aynı fonksiyondan geçer.
- **Uzlaştırma önce gelir:** zincirdeki mevcut job ve `BROADCAST` kaydı,
  yeni gönderimin süre kontrollerinden önce ele alınır. Quote süresi/blok
  penceresi bitse bile belirsiz işlem tekrar gönderilmeden sorgulanır.
  Son kontrolde duran hazırlanmış imzalı kayıt silinmez veya yeniden
  imzalanmaz; mevcut işlem incelemesi için korunur.

Quote'in son bloğu **dahildir**; delegate'in son bloğu mevcut kurala göre
geçilmez. Quote aralığı ile delegate'e tanınan **+200 blok tolerans** aynı
şey değildir; tolerans kaldırılmadı veya artırılmadı. Kontratın nihai yürütme
kontrolleri değiştirilmedi. JWT süresi uzatılmadı, geçmiş saatle doğrulama yoktur.

## Yeni kanıt

Yeni regresyonlar düzeltme öncesinde hatayı gösterdi: iki Web dosyasında 11,
Bridge'in mevcut üç upload varyantında 3 başarısız test. Bunlar ayrı hata
sayısı değil; eski davranışı yakalayan test sonuçlarıdır.

Düzeltme sonrası:

| Kontrol | Sonuç |
| --- | --- |
| Web unit | 48 dosya / 773 test PASS |
| Bridge unit | 429 PASS; mevcut 3 koşullu abuse/load testi SKIPPED |
| Web auth tip kontrolü ve lint | PASS |
| Bridge tip kontrolü | PASS |
| İzole Web build | PASS; sentetik testnet adresleri, kapalı varsayılanlar |
| İzole Bridge `wrangler deploy --dry-run` | PASS; yayın yapılmadı |
| Doküman derlemesi, diff/kapsam kontrolü | PASS; kapsam dışı 359 başlangıç dosyası korundu |

- Normal imza ve bilet tokenı/incelemesi zincir veya sponsor hesabı beklemesi
  sırasında bittiğinde sponsor çağrısı **0**, deneme kaydı **yok**.
- Son cihaz okuması sırasında süre dolması da yakalanıyor. Eksik/geçersiz
  onay son zamanı reddediliyor; başarılı istekte zaman metadata'sı cüzdana gitmiyor.
- Quote 1000–1200 aralığında ve delegate 1399'a kadar geçerliyken 999/1201
  reddediliyor; **1200 kabul ediliyor**. Son okuma sırasında 1201'e ilerleyen
  blok, ilk ön kontrol geçse bile upload yetkilendirmesini durduruyor.
- Bridge imzalama/kayıt beklemesinde quote zamanı veya blok sınırı bittiğinde
  yeni `send_tx` sayısı **0**; hazırlanmış `SIGNED` kayıt korunuyor.
- Normal/cihazlı/compact relay varyantlarında, daha önce tek gönderim yapılmış
  ve sonucu belirsizken quote süresi ile blok penceresi bitiyor. İstek ve
  otomatik alarm sorgusu `BROADCAST` kaydını koruyor, ikinci gönderim yapmıyor.
  Sonuç sonradan doğrulanınca aynı job uzlaştırılıyor. Gönderim toplamı **1**.
- Bridge'in mevcut playback testleri de geçti; quote'in eski olması mevcut
  cihazın oynatma kanıtını yeni bir ödeme veya imza zorunluluğuna dönüştürmüyor.

Zincir, kimlik, cüzdan ve medya yanıtları sahtedir. Bu sonuçlar gerçek
Google/MPC, NEAR veya HLS kabulü değildir. Vite, Next middleware ve doküman
bundle boyutu uyarıları sürmektedir.

## Değişen dosyalar

Kaynak:

- `apps/web/lib/near-auth-signing-server.ts`
- `apps/web/lib/near-auth-signing.ts`
- `apps/web/lib/near-auth-upload-server.ts`
- `workers/livepeer-bridge/src/index.ts`

Test:

- `apps/web/__tests__/unit/near-auth-signing-server.test.ts`
- `apps/web/__tests__/unit/near-auth-signing-client.test.ts`
- `apps/web/__tests__/unit/near-auth-compact-flow.test.ts`
- `workers/livepeer-bridge/src/index.test.ts`

Bu rapor ve güncel entegrasyon durumu dışında doküman değiştirilmedi.
Kanıt/yedek dizini: `tmp/near-auth-freshness-source-zmwd2oto/`.
`evidence/reproduce-*.log` önceki başarısızlığı, `target-*.log` odaklı kontrolleri,
`web-unit.log`, `bridge-unit.log` ve build/type/lint kayıtları son doğrulamayı tutar.

## Sınırlar ve tek sonraki gate

Yeni son blok okuması, Google upload kontrolünün her çağrısına bir; Bridge'de
yeni gönderim yoluna bir ilave salt-okunur RPC getirir. Mevcut job/başlamış
belirsiz gönderim dönüşleri bu yeni gönderim kontrolüne zorlanmaz.

Kontrol ile zincirde yürütülme arasında blok/zaman ilerleyebilir. Sponsor
cüzdanı açıldıktan sonraki kullanıcı beklemesi kontrolümüzün dışındadır.
Bu değişiklik mutlak ücret/başarı garantisi vermez; bilinen geçersiz onay veya
teklifle yeni çağrı başlatmayı önler ve belirsizlikte tekrar ödemeyi açmaz.

Kaynak gate'inin blocker'ı yok. **EXTERNAL_NOT_RUN / UNPROVEN:** gerçek Google
ve sponsor onayı, ödeme, upload/HLS, provider/kontrat değişimi, CI, Preview,
Production ve deploy. Kontrat veya mesaj biçimi değişmediği için Rust/WASM,
ABI ve boyut matrisi bu gate'te yeniden çalıştırılmadı.

**Tek sonraki gate: `NEAR_AUTH_LOCAL_UX_ACCEPTANCE`.** Ayrı Brave test
bağlamında sahte kimlik/zincir/cüzdan yanıtlarıyla okunabilir özet, iptal,
süre aşımı, bekleyen işlem ve reload davranışlarını kullanıcı akışı olarak
doğrulamak. Mevcut gerçek tarayıcı/cihaz durumuna dokunulmaz; canlı imza ve
ödeme içermez. Bu gate otomatik açılmadı.
