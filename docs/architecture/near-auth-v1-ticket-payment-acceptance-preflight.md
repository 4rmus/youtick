# NEAR Auth V1 — bilet canlı kabul ön kontrolü

Gate: `NEAR_AUTH_V1_TICKET_PAYMENT_ACCEPTANCE_PREFLIGHT`.
23 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Öneri: ilk gerçek kabulü mevcut localhost ürün akışında yap.** Mevcut Bridge
kodunu ayrı yerel Worker olarak çalıştırıp Web'in özel servis çağrısını ona
bağla. Bu yeni mikroservis değildir; aynı Bridge'in yerel çalışmasıdır.
Önce sentetik zincir/anahtarla gerçek Worker RPC ve kalıcı DO davranışı
kanıtlanır; bundan sonra ayrı, açıkça onaylanmış testnet hazırlığı yapılır.
Hosted yayın bağlantısı bu ilk testin önkoşulu yapılmaz.

Bu gate yalnız rapor ve ana planı değiştirir. Hesap/fonlama, anahtar üretimi,
secret veya provider ayarı, tarayıcı oturumu, ödeme kaydı, localhost yeniden
başlatma, gerçek RPC/ödeme, GitHub ve deploy işlemi yapılmadı. Kaynak ve
kayıtlı yapılandırma okundu; Cloudflare hesabındaki secret'ların varlığı veya
canlı hesap bakiyeleri sorgulanmadı. Önceki source testleri tekrar çalıştırılmadı.

## Kaynakta doğrulanan durum

| Alan | Güncel kaynak kanıtı | Kabul öncesi gereken |
| --- | --- | --- |
| Ürün API/UI | `/api/auth/ticket`, Watch ve ürün kimliği hazır; kapalı varsayılan | Aynı runtime'da gerçek servis bağı ve ürün ayarları |
| Özel servis | `NearAuthMpcSponsor.submit/status/executeTicket` var | `NEAR_AUTH_MPC` binding'i tam bu named entrypoint'i hedeflemeli |
| Kalıcı kayıt | Mevcut `LivepeerControl`, ayrı MPC nesnesi | Yerel Bridge restart sonrası aynı storage/nonce/hash'i okumalı |
| Yerel Next hazırlığı | `next.config.ts` public-testnet ürün modunda OpenNext dev entegrasyonu açıyor; mevcut çağrı `persist:false` | Bu ayarı ödeme kaydının kalıcılık kanıtı sayma; Bridge için ayrı kalıcı yerel storage dizini kullan |
| Sponsor | Ayrı hesap/key/epoch ve bütçe zorunlu; hesap/anahtar kaynağa eklenmedi | Hesap adı, public key, epoch, fonlama kaynağı ve limitleri sonraki hazırlıkta somutlaştır |
| Kullanıcı | Fonlanmış Google veya passkey hesabı destekleniyor | Aynı cihaz, doğru aktif kimlik, satın alınmamış ve kullanıcıya ait olmayan yayın |
| Hosted yayın | Mevcut release şemalarında NEAR Auth alanları ve özel service binding yok | Hosted geçişten önce dar release wiring çalışması |

Cloudflare'ın [Service binding/RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)
ve [çoklu Worker yerel geliştirme](https://developers.cloudflare.com/workers/development-testing/multi-workers/)
yolu kullanılacak. Bunlar platform kabiliyetidir; bu repoda çalışan bağ
kanıtı değildir. Önceki Node WorkerEntrypoint stand-in testi ve Wrangler
dry-run gerçek RPC/DO runtime kabulü sayılmaz.

## İlk kabul ortamının kesin sınırı

- Web origin: **`http://localhost:3000`**; mevcut uygulama ve mevcut testnet
  Market/USDC kullanılır. Kullanıcının mevcut tarayıcı/cihaz kayıtları korunur.
- Aynı Bridge kaynağının yerel Worker örneği, dışarıya yeni public signer
  açmadan Web'e `NEAR_AUTH_MPC` üzerinden bağlanır. Web'e DO namespace'i verilmez.
- İlk runtime kaynak kontrolü farklı geçici portlar ve sentetik kimlikler
  kullanır; mevcut 3000 sunucusunu değiştirmez. Gerçek kabul hazırlığında
  gerekiyorsa 3000'in nasıl yeniden başlatılacağı ayrıca somutlaştırılır.
- Bridge ödemelerinin kalıcı dizini ayrıca seçilir. Restart/servis kapanmasında
  kayıtlar silinmez. Kullanıcının eski lab/demo kayıtları buraya taşınmaz.
- Ürün session anahtarı yalnız Web'e, sponsor private key yalnız Bridge'e
  aktarılır. Terminal/log/public config/artifact/istemci bundle'ına yazılmaz.
- Ayrı MPC sponsor hesabı ve FullAccess key gerekir; operator/upload-relayer
  veya kullanıcının Meteor anahtarı devralınmaz. Hesap adı/key bu raporda
  uydurulmadı; oluşturulmadı ve hiçbir mevcut cüzdandan para gönderilmedi.
- Web'deki `enabled` alanı yalnız Web flag/binding varlığını gösterir.
  Bridge sponsor/limit/protokol kontrolünün başarı kanıtı değildir.

Web ayarları: `NEAR_AUTH_V1_ENABLED`, `NEAR_AUTH_V1_CLIENT_ID`,
`NEAR_AUTH_V1_SESSION_SECRET`, `NEAR_AUTH_V1_ORIGIN`,
`NEAR_AUTH_V1_MPC_ENABLED`, `NEAR_AUTH_V1_TICKET_ENABLED`,
`NEAR_AUTH_V1_MPC_ACCOUNT_ID`. Lab kapalı; network testnet ve video environment
public-testnet olmalı. Mevcut testnet client kullanılabilirliği doğru
origin/session ve kullanıcı girişiyle yeniden doğrulanır; provider allowlist'i
bu gate'te okunmuş/değiştirilmiş sayılmaz.

Bridge ayarları: `NEAR_AUTH_MPC_ENABLED`, `NEAR_AUTH_TICKET_ENABLED`,
`NEAR_AUTH_MPC_ACCOUNT_ID`, `NEAR_AUTH_MPC_PRIVATE_KEY`,
`NEAR_AUTH_MPC_KEY_EPOCH` ve dört bütçe alanı. Testnet/Market bağı mevcut
kontratlara uymalı; D1 ödeme otoritesi yapılmaz. İlk runtime kontrolü kapalı varsayılanı doğrular. Başarılı gönderim senaryolarında
bayraklar yalnız izole sentetik ortamda açılır; gerçek dış ağa gönderim yoktur.

## Önerilen kabul bütçesi — harcama onayı değildir

İki bağımsız kimlikle en fazla birer satın alma: bir Google, bir passkey.
Canlı hazırlıkta kullanıcı ve yayınlar seçilip taze bakiye/hak kontrolü
alınmadan bu öneri etkinleştirilmez.

| Kalem | Öneri | Anlamı |
| --- | --- | --- |
| MPC işlem rezervi | 0,35 test NEAR | Kaynaktaki sabit tavan; gerçek gider değil |
| Global günlük MPC rezervi | 0,70 test NEAR | İki dış istek üst sınırı; yeni denemeler otomatik eklenmez |
| Hesap başına günlük deneme | 1 | İki ayrı kullanıcı için birer deneme |
| Sponsor minimum kullanılabilir bakiye | 0,05 test NEAR | Yeni rezerv ayrıldıktan sonra kalacak tutar |
| Sponsor ilk kullanılabilir bakiye hedefi | En az 0,75 test NEAR | Storage/locked düşüldükten sonra; toplam transfer tutarı değildir |
| Bilet | Kullanıcı başına 2 test USDC | Yalnız final fiyatı 2 USDC olan yayın seçilirse; iki bilet toplam 4 test USDC |
| Alıcı NEAR hazırlığı | Kullanıcı başına en az 0,12 test NEAR, storage rezervi sonrası | Mevcut kaynak ön koşulu; tamamının harcanacağı anlamına gelmez |

Bridge karşılıkları sırasıyla `NEAR_AUTH_MPC_OPERATION_YOCTO`,
`NEAR_AUTH_MPC_DAILY_YOCTO`, `NEAR_AUTH_MPC_ACCOUNT_DAILY_ATTEMPTS`,
`NEAR_AUTH_MPC_MIN_BALANCE_YOCTO` alanlarıdır. UTC günlük sayaç toplam rezervi
sayar, gerçek gideri değil. İki deneme tercihen aynı UTC gününde yürütülür;
gün değişti diye ek deneme yetkisi doğmaz. Sponsor account/storage kurulum
bedeli ayrı ölçülür; hedef kullanılabilir bakiye doğrudan gönderim tutarı
olarak sunulmaz. Kullanıcıya otomatik USDC/NEAR dağıtımı yoktur.

Bu tutarlar production fiyatı, yeni komisyon veya kullanıcı başı tahmini
maliyet değildir. Gerçek gider dış/iç hash, receipt ve bakiye farklarıyla
kaydedilecek; NEAR/USD kuru veya faucet sürekliliği varsayılmayacak.

## Kimlik ve yayın seçimi

Distance'ı yükleyen hesabı o videonun alıcısı yapma. Önceki kabulde Distance
hakkını edinmiş Google/passkey alıcılarına da aynı bileti tekrar aldırma.
Yeni, henüz fonlanmamış hesap zorunlu değildir: mevcut fonlanmış hesabın
**henüz hakkı olmayan başka bir yayınını** seçmek daha küçük testtir.

Geçmiş yayın kayıtları yalnız adaydır: Distance
`lp-b16e1bcb-e98e-4005-ade7-99c63bdb558b` ve passkey ile yayınlanan
`lp-27897cc6-fd5c-4a7f-93ac-78f9c3dc4678`. Bu gate'te bunların fiyatı,
aktifliği, sahibi, bakiyesi veya entitlement'ı yeniden sorgulanmadı.
Canlı hazırlıkta her kimlik/yayın çifti için aynı final blokta owner farklı,
entitlement false, satış ACTIVE, fiyat 2 USDC, doğru token/storage ve yeterli
bakiye kontrol edilmeli. Uygun çift yoksa satın alma başlamaz; sırf test için
tekrar upload veya hak sıfırlama yapılmaz. Google ve passkey hesapları bağlanmaz.

## Kabul adımları ve durma koşulları

1. **Sentetik gerçek runtime:** Web → named entrypoint → mevcut DO yolu;
   public HTTP reddi, kapalı/eksik ayar reddi, storage restart, aynı işlemde
   tek dış/iç gönderim ve varsayılan kapalı durum. Dış ağ yalnız fixture ile
   karşılanır; gerçek private key yoktur.
2. **Ayrı onaylı canlı hazırlık:** somut sponsor hesabı/public key/epoch,
   yukarıdaki limitler, gereken net fonlar, kullanıcı/yayın çifti ve origin.
   Gerekirse provider ayarı ayrıca açık kapsamla ele alınır. Uygulama source
   SHA/snapshot'ı kaydedilir; halen dirty kaynak doğrudan yayımlanmış sayılmaz.
3. **Google kabulü:** doğru hesabı kullanıcı seçer. Review'da video, 2 USDC
   ve hesap görünür. Kullanıcı sağlayıcı ekranında onay verir. Meteor sponsor
   bağlantısı veya ikinci sponsor imzası istenmemeli.
4. Dış hash, iç hash, operation ID, signer, public key/epoch, fiyat ve final
   blok kaydedilir. `MPC_VERIFIED` başarı değildir. `TICKET_SETTLED`, Market
   olayı, doğru alıcı hakkı ve cihaz doğrulanır; video görüntü/ses ilerler.
5. Reload ve yeniden giriş sonrasında aynı hakla oynatma; yeni imza/tahsilat
   yok. Salt-okunur kontrol dışarıya gönderim yapmamalı. Kullanıcı doğrulaması
   ile Google kabulü kaydedilir.
6. **Passkey kabulü:** uygun ayrı kimlik/yayın için aynı sınırlar; kullanıcı
   onayı passkey ile verdiğini doğrular. Önceki passkey lab kabulü yeni ürün
   sponsor yolunun kabulü yerine sayılmaz.
7. Test bitince gönderim kapatılır; session/status/hak okuma ve kanıt kayıtları
   korunur. Key/epoch değiştirerek veya kayıt silerek kilit aşılmaz.

Timeout, bilinmeyen sonuç, yanlış hesap, beş dakikalık ilk iç gönderim
penceresinin aşılması, receipt/hak/cihaz uyuşmazlığı veya bütçe yetersizliğinde
ikinci satın alma denenmez. Bilinen hash okunur. Gönderim öncesi kalıcı kayıt
sonrasında kapanma da otomatik yeniden broadcast izni değildir. Gerçek ödeme
sırasında kasıtlı arıza çıkartma zorunlu tutulmaz; fault senaryoları sentetik
runtime'da kanıtlanır, gerçek test yalnız normal akış ve reload'u doğrular.

## Hosted geçiş için ayrıca kaydedilen eksikler

Hedefler mevcut public-testnet hedefleridir: `youtick-web-public-testnet`
(`public-testnet.youtick.net`) ve `youtick-livepeer-bridge-public-testnet`.
Production/Preview'a veya yeni bir genel signer servisine geçiş önerilmez.

- `scripts/release-metadata.mjs` Web/Bridge alanlarını exact allowlist ile
  doğruluyor; yeni NEAR Auth alanları henüz bu şemada yok.
- `scripts/cloudflare-release.mjs` Web wrangler artifact'ını exact karşılaştırıyor
  ve public-testnet Web bootstrap'ını yeniden üretiyor. Yalnız kaynak
  wrangler dosyasına `services` eklemek yeterli değildir; üretilen ve doğrulanan
  pakette tam binding/entrypoint korunmalı.
- `componentArgs` Web'e runtime vars veya secrets-file aktarmıyor. Web session
  secret ve Bridge MPC private key için ayrı, güvenli aktarım yolu gerekir.
  Secret public manifest'e veya build ortamına gömülmemeli.
- Web compatibility tarihi `2025-03-25`; kaynak ürün ayarlarını `process.env`
  üzerinden okuyor. Cloudflare'ın otomatik env doldurma varsayılanı
  `2025-04-01` ve sonrasıdır. OpenNext'in paketlenmiş runtime'ı ayrıca sınanmalı;
  gerekirse dar flag veya mevcut env erişimi kullanılmalı. Bu, henüz canlıda
  gözlenmiş hata değil, doğrulanması gereken uyum sınırıdır.
  [Resmî process.env belgesi](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/).
- `.github/workflows/deploy-public-testnet.yml` yeni secret/env alanlarını
  taşımıyor. Bu değişiklikler ve release testleri hosted kaynak işinde beraber
  ele alınmalı. Gerçek yayın yalnız korumalı workflow ve açık onayla yürür.

Bu eksikler mevcut yerel ödeme source'unu geçersiz kılmaz; Next build,
Wrangler dry-run veya mock testlerinin hosted ödeme kanıtı olmadığını gösterir.
Yerel kabul için tüm yayın hattını şimdi genişletmek gerekmiyor.

## Sonuç ve tek sonraki gate

Ön kontrol **COMPLETED_WITH_WARNINGS**. Yalnız bu rapor ve ana plan değişti.
Doküman build PASS (mevcut 500 kB chunk uyarısıyla); uygulama testleri, canlı provider/chain/bakiye,
Cloudflare hesabı, yeni runtime kurulumu, CI ve deploy bu gate'te çalıştırılmadı.
Yerel kaynak bulguları LOCAL_STATIC; önceki test sayıları tarihsel LOCAL_TEST;
gerçek kabul EXTERNAL_NOT_RUN olarak kalır.

**Tek sonraki gate: `NEAR_AUTH_V1_TICKET_RUNTIME_SOURCE`.** Mevcut Next/Bridge
ile izole native Worker RPC/DO deneme runner'ı ve en küçük gerekli binding
bağlantısı; restart sonrası kalıcılık ve kapalı varsayılanların sentetik testi.
Değişebilir kapsam: yerel test runner'ı/fixture, ilgili bağlama yardımcısı ve
rapor; uygulama ekonomik kuralları, kalıcı ortam dosyaları, yeni gerçek
anahtar/fonlama, 3000 sunucusu ve deploy kapsam dışı. Paketlenmiş runtime'da
bulunan kaynak hatası varsa önce aynı dar kapsamda giderilir. Bu gate tek
başına gerçek hesap hazırlığı veya ödeme yetkisi değildir.
