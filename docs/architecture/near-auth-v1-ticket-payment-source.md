# NEAR Auth V1 — ürün bilet ödeme kaynağı

Gate: `NEAR_AUTH_V1_TICKET_PAYMENT_SOURCE`.
23 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

Amaç: fonlanmış Google/passkey hesabının mevcut USDC biletini, kullanıcıya
sponsor cüzdanı seçtirmeden satın alabilmesi için kaynak yolunu tamamlamak.
Kabul sınırı kaynak ve izole yerel testlerdir. Gerçek bağlantı, anahtar,
fonlama, imza, ödeme, deploy ve Production kabulü yapılmadı.

## Kullanıcı akışı

1. Watch sayfası mevcut NEAR hakkını sorgular; hak varsa mevcut oynatıcı açılır.
2. NEAR Auth kullanıcısı için ürün bilet bölümü servis durumunu ve kayıtlı
   işlemi okur. Bayrak/binding eksikse satın alma kapalı kalır.
3. Kullanıcı satın almayı seçer. Önce sunucudaki bekleyen işlem ve mevcut
   lab bilet korumaları kontrol edilir; sonra mevcut cihaz hazırlığı kullanılır.
   Bağımsız self-transfer demo kaydı okunmaz veya değiştirilmez.
4. Sunucu gerçek oturum hesabıyla mevcut fiyat/bakiye/cihaz ön kontrolünü yapar.
   Kullanıcı video, USDC tutarı ve hesabını görür; Google/passkey ile tam işlem
   için tek onay verir. Meteor veya sponsor cüzdanı ekranı yoktur.
5. Bridge önce MPC isteğini, ardından yalnız kayıttaki imzalı bilet işlemini
   gönderir. İki gönderim de kalıcı kayıtla bir kez sınırlandırılır.
6. Dış imza başarı sayılmaz. İç işlem, Market olayı, kullanıcının hakkı ve
   cihaz kaydı doğrulanınca `TICKET_SETTLED` olur; Watch kendi hak sorgusunu
   yenileyerek mevcut oynatıcı yoluna geçer.

Yeni oturum/hesap fonlama ekranı, kart tahsilatı, upload ürünü, çoklu varlık
ve hesap bağlama bu gate'te eklenmedi. Wallet yolu korunur. Kart V1 hedefidir;
hesap bağlama V1 dışında kalır.

## Kaynak değişiklikleri

- `workers/livepeer-bridge/src/mpc-sponsor.ts`: kayıtlı ticket için iç işlem
  gönderimi, hash ile salt-okunur uzlaştırma, ödeme/hak/cihaz kanıtı ve terminal
  durumla kullanıcı kilidinin çözülmesi. Gecikmiş dış MPC cevabının ileri
  iç işlem durumunu geri yazması atomik durum kontrolüyle engellendi.
- `workers/livepeer-bridge/src/mpc-entrypoint.ts`, `src/index.ts`: özel servis
  `executeTicket(accountId, operationId)` çağrısı. İstemci transaction/action
  veremez; public Bridge HTTP yönlendiricide bu yol açılmadı.
- `protocol/paid-media-livepeer-v1/mpc-sponsor.ts`: `TICKET_SUBMITTED`,
  `TICKET_SETTLED`, iç hash/gider alanları ve dar execute çağrısı.
- `apps/web/lib/near-auth-mpc-sponsor.ts`: mevcut ürün session/origin/hesap ve
  review kontrollerini kullanan prepare/execute yardımcıları.
- `apps/web/app/api/auth/ticket/route.ts`: yalnız prepare, submit, execute,
  status; bounded JSON, exact alanlar, ürün oturumu/origin ve private binding.
  İstemci sponsor/hesap/ağ veya key seçemez. Eksik binding için public fallback yok.
- `apps/web/lib/near-auth-ticket-client.ts`: mevcut bilet/cihaz korumaları,
  kullanıcı onayı ve durum takibi. JWT/review tarayıcı kalıcı deposuna yazılmaz.
- `apps/web/components/NearAuthTicketPayment.tsx`: tutarı gösteren onay,
  bekleyen işlem, devam ve salt-okunur durum kontrolü; belirsiz submit cevabında
  yeni satın alma düğmesini kapatan geçici bekleme durumu.
- `apps/web/components/LivepeerWatch.tsx`: NEAR Auth bölümü, doğru hesap/video
  için hak yenileme. Arka plan hak sorgusu açık onay bileşenini sökmez;
  yeni satın alma sorgu bitene kadar kapalıdır. Terminal bildirim işlem başına
  bir kez yeniler, kullanıcının manuel kontrolü ayrıca yenileyebilir.
- `apps/web/components/providers/WalletProvider.tsx`: mevcut ürün Auth0
  örneğinin dar bilet onayı; onay sırasında yöntem/hesap/oturum değişirse
  dönen token gönderim için kullanılmaz. Genel wallet adaptörü yapılmadı.
- Web testleri: `livepeer-watch.test.ts`, `near-auth-signing-server.test.ts`,
  `near-auth-ticket-client.test.ts`, `wallet-provider.test.ts`.
- Bridge testleri: `src/mpc-sponsor.test.ts`.
- `apps/web/scripts/near-auth-ux-browser-check.mjs`: mevcut izole harness'e
  ürün bilet başarı/reload ve bekleyen ödeme/reload senaryoları eklendi;
  kapalı bilet arayüzü beklentisi güncellendi.
- Bu rapor ve `near-auth-integration-status.md`.

Kontrat, dependency/lockfile, CI, wrangler/env/secret ayarları ve eski kullanıcı
kayıtları değişmedi. Git index ve kapsam dışı dirty dosyalar korundu.
Çalışan localhost sunucusu yeniden başlatılmadı. Commit/push yapılmadı.

## Ödeme ve tekrar kanıtı

İç gönderim yalnız kalıcı `MPC_VERIFIED` ticket kaydından kurulur. Hesap/amaç
kontrol edilir; ilk gönderimden önce güncel FullAccess nonce doğrulanır.
`TICKET_SUBMITTED` ve iç hash ağ çağrısından önce atomik yazılır. Eşzamanlı
çağrı veya restart aynı kaydı okuyabilir; ikinci broadcast yapamaz. Hash'i
ayırdıktan sonra kapanma, timeout ve `not found` yeni ödeme izni değildir.

Status çağrısı **para göndermez**. MPC imzası hazırsa açık kullanıcının ödeme
akışı execute çağırabilir; sayfa yeniden açılışında yalnız durum okunur ve
kullanıcının “Complete purchase” seçimi beklenir. İlk iç gönderim için MPC
kaydının oluşturulmasından itibaren beş dakikalık sınır vardır. Bu sınır
geçmiş gönderimin status doğrulamasını engellemez; yeni bir token istemek
veya otomatik yeniden imza almak için kullanılmaz.

`TICKET_SETTLED` koşulları mevcut lab bilet doğrulamasındaki ekonomik
invariantları korur: final iç hash/signer/key/nonce, USDC hedefi, tam action
bytes/gas/deposit, FT kullanılan tutar dönüşü, başarısız receipt olmaması,
Market `entitlement_purchased` olayında aynı kullanıcı/video/USDC/tutar,
aynı final blokta entitlement ve doğru playback certificate/key/duration.
İç gider mevcut 0,12 test NEAR sınırında tutulur; bu gerçek fiyat değildir.

Kullanıcının son işlem işaretçisi reload için saklanır; yalnız terminal
`TICKET_SETTLED` durumu yeni ekonomik işleme izin verir. Başarılı MPC tek
başına bu kilidi açmaz. İade (`0` kullanılmış USDC), yanlış olay/hesap/cihaz,
eksik hak veya belirsiz sonuç kilidi kaldırmaz. Otomatik tekrar ödeme/iade
motoru eklenmedi; başarısız/belirsiz işlerin manuel uzlaştırma sınırı korunur.

## Kapalı varsayılanlar ve canlı sınır

Yeni Web gönderimleri ayrıca `NEAR_AUTH_V1_TICKET_ENABLED=true`, iç Bridge
bilet gönderimi ayrıca `NEAR_AUTH_TICKET_ENABLED=true` ister. Önceki ürün
session/MPC bayrakları, testnet sınırı, ayrı sponsor hesabı/anahtarı, key epoch
ve bütçe kontrolleri de gereklidir. Hiçbir değer kaynakta veya çalışan
ortamda etkinleştirilmedi. Web Service binding adı `NEAR_AUTH_MPC` olarak
okunur; gerçek binding tanımı eklenmedi.

Mevcut MPC kaydının 256 kayıt/DO tavanı, tek dış istek sınırı ve epoch taşıma
kısıtı sürer. İlk kullanıcı hesabı/NEAR/USDC hazırlığı bu fonlanmış-hesap yolunun
kabulü değildir. Yeni cihaz/yenileme, upload ürünü ve kart ayrı kapsamdır.

## Doğrulama ve bulunan sorunlar

- **LOCAL_TEST:** Web **929 PASS / 49 dosya**; mevcut wallet/lab/upload
  regresyonları dahil. Sonraki tek UI değişikliği uzun hesap metninin satıra
  sığdırılmasıdır; iş mantığı değişmedi.
- **LOCAL_TEST:** Bridge tam paket **465 PASS / 3 skip**. Ek kapanma/geç cevap,
  eksik hak/yanlış cihaz ve public ticket yolu testleriyle son odaklı
  MPC/bilet paketi **33 PASS**.
- **LOCAL_TEST:** izole Brave harness **27 senaryo PASS**. Google/passkey
  sağlayıcısı, cüzdan, zincir ve medya yanıtları sentetik; kullanıcı profili
  veya gerçek para kullanılmadı. Başarı/reload tek submit/execute, pending/reload
  sıfır ek ödeme ve sıfır Meteor sponsor çağrısı doğrulandı.
- Tarayıcı kontrolünde başarı sonrası yenileme/remount döngüsü bulundu ve
  işlem başına yenilemeyle düzeltildi. Arka plan sorgusunun açık onayı
  iptal etmemesi ayrıca Web testinde doğrulandı.
- **LOCAL_STATIC:** Bridge tip, Web mevcut strict auth-helper tip, tam Web
  tip ve lint PASS. Yeni route'un OpenNext importu üçüncü taraf declaration
  hatalarını strict dependency kontrolüne taşıdı; SDK yükseltilmedi veya
  mevcut strict kapsam gevşetilmedi. Route, projenin mevcut tam tip kontrolü
  ve Next build'inde doğrulandı; strict helper kapsamı aynı kaldı.
- **LOCAL_STATIC:** ayrı kaynak kopyasında Web build **flag off/on PASS**;
  `/api/auth/ticket` derlendi. Gerçek `.next`, session secret ve localhost
  sunucusu korunur. İlk build yalnız sentetik public contract değerleri
  verilmediği için durdu; test ortamına bu değerler eklenince geçti.
- **LOCAL_STATIC:** Bridge Wrangler dry-run PASS; deploy değil.
- **LOCAL_STATIC:** Doküman build PASS; mevcut 500 kB chunk uyarısı sürer.
- **EXTERNAL_NOT_RUN:** gerçek Google/passkey ödeme onayı, Cloudflare özel
  binding/DO runtime, zincir gönderimi, gerçek satın alma/izleme, hosted/CI/
  Production ve yeni hesap fonlaması. Kontrat değişmedi; Rust testleri tekrarlanmadı.

Sonuç: fonlanmış hesap için ürün bilet kaynak yolu hazır; canlıya açma engeli
gerçek binding/sponsor/limit hazırlığı ve gerçek uçtan uca kabulün olmamasıdır.
**Tek sonraki gate: `NEAR_AUTH_V1_TICKET_PAYMENT_ACCEPTANCE_PREFLIGHT`.**
Önce gerekli bağlantı, hesap, bütçe ve kabul adımlarını somutlaştırır; kendisi
canlı ayar, para veya deploy yetkisi değildir. Upload entegrasyonuna bu gate'te
geçilmedi.
