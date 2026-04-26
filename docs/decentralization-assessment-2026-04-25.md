# YouTick Decentralization Assessment — Solo Developer Plan

> Tarih: 2026-04-25  
> Kapsam: web app, NEAR kontratları, KMS worker, IPFS/Crust delivery, operasyon dokümanları  
> Amaç: Tek geliştiriciyle mainnet MVP çıkarırken merkeziyetsizliği gerçekçi biçimde artırmak

> 2026-04-26 notu: Bu rapordaki runbook/script uyumsuzluklarının bir bölümü
> dokümanlarda düzeltilmiştir. Güncel yayın kararı ve canlı mainnet kontrolü
> için [`mainnet-open-source-readiness-2026-04-26.md`](mainnet-open-source-readiness-2026-04-26.md)
> raporunu kaynak kabul et.

---

## 1. Kısa Sonuç

YouTick'in mimari yönü doğru: medya tarayıcıda şifreleniyor, erişim hakkı NEAR
üzerinde tutuluyor, KMS tek bir anahtar kasası olmaktan çıkıp 3-of-5 share
modeline taşınmış durumda. Bu, solo geliştirici için iyi bir MVP zemini.

Ama bugünkü canlı mainnet durumu henüz "merkeziyetsiz ve üretime hazır" değil.
İkinci derin kontrolde üç ayrı uyumsuzluk görüldü:

- `registry.youtick.near` içinde aktif KMS operatörü görünmüyor.
- KMS operatörleri için timelock teklifleri var, fakat henüz yürütülmemiş.
- KMS `/health` endpointleri cevap veriyor ama `ok: false`; sebep operatörün
  registry'de aktif olmaması.
- `access.youtick.near` içinde market ve registry referansları boş dönüyor.
- `trial_pool` sıfır, bu yüzden sponsorlu trial/free-ticket akışları fonlanmış
  kabul edilmemeli.
- Canlı KMS worker `/health` çıktısı repo'daki güncel worker kodundan farklı
  görünüyor; bu da worker'ların güncel source ile yeniden deploy edilmediğini
  düşündürüyor.
- Operasyon dokümanları ve bazı deploy scriptleri bazı yerlerde yeni timelock
  modelini, bazı yerlerde artık çalışmayan eski direct admin çağrılarını
  anlatıyor.

Bu yüzden bugünkü tavsiye:

**Public alpha olabilir, fakat gerçek creator ve ücretli şifreli içerik almadan
önce mainnet registry/KMS aktivasyonu tamamlanmalı.**

Ek not: merkeziyetsizlik yalnızca mimariyle değil, aynı mimarinin canlı zincir,
worker deploy'u ve runbook içinde tutarlı biçimde doğrulanabilmesiyle ölçülmeli.

---

## 2. Güncel Durum Özeti

| Alan | Durum | Yorum |
|---|---|---|
| NEAR settlement | Güçlü | Bilet sahipliği ve ödeme zincirde. NEAR'in validator ağı temel merkeziyetsizlik katmanını sağlıyor. |
| NFT / market kontratı | Orta | Core state zincirde, fakat owner hâlâ tek kontrol noktası. Timelock bunu yumuşatıyor. |
| Access contract | Kısmi | Session grant modeli doğru, ama canlı access referansları boş görünüyor. |
| Operator registry | Kısmi | Tasarım doğru, fakat canlı operatörler timelock yürütülene kadar aktif değil. |
| KMS | Kısmi | Kodda 3-of-5 share modeli iyi; canlı durumda registry aktivasyonu ve worker redeploy'u bekliyor. |
| Storage | Orta | IPFS/Crust iyi başlangıç, ama tek pinning sağlayıcısına güven azaltılmalı. |
| Frontend hosting | Orta-düşük | Web4 hedefi iyi, ama pratikte DNS/proxy/CDN ve deploy anahtarı hâlâ operasyonel merkez. |
| Governance | Düşük | Solo owner kabul edilebilir, fakat multisig/hardware key yol haritası net olmalı. |
| Open source readiness | Orta | Dokümanlar güçlü; lisans, CI ilk run ve runbook tutarlılığı tamamlanmalı. |

---

## 2.1 Derin Kontrol Bulguları

Bu bölüm raporun ikinci kontrolünde eklendi. Amaç, rapordaki iddiaları kod ve
canlı mainnet durumuyla karşılaştırmak.

| Bulgu | Kanıt | Etki | Aksiyon |
|---|---|---|---|
| KMS operator kayıtları aktif değil | `list_decryption_operators` boş dönüyor; `get_timelock(1)` operator teklifi gösteriyor | Şifreli upload/playback merkeziyetsiz KMS yolunda çalışmaz | Timelock ID `1-6` zamanı gelince yürütülmeli |
| Worker health source ile canlı deploy farklı | Canlı `/health` contract/operator detayları döndürüyor; repo source bu bilgileri health'ten kaldırmış | Canlı worker güncel hardening'i taşımıyor olabilir | Timelock sonrası 5 worker güncel source ile yeniden deploy edilmeli |
| Access referansları belirsiz | Canlı `get_market_contract` ve `get_registry_contract` boş string dönüyor; repo source içinde bu getter'lar görünmüyor | Access contract konfigürasyonu dışarıdan net doğrulanamıyor | Getter veya `get_config` eklenmeli; runbook buna göre güncellenmeli |
| nft-ticket runbook metotları kaynakla uyumsuzdu | 2026-04-25 kontrolünde runbook kaynakta olmayan nft-ticket config metotları öneriyordu | Operasyon adımı uygulanamaz veya yanlış güven verir | 2026-04-26 runbook güncellemesinde bu adımlar kaldırıldı |
| Registry bootstrap/deploy scriptleri eski | `scripts/bootstrap-registry-mainnet.js` direct `set_threshold_config` ve `upsert_decryption_operator`; `scripts/deploy-zero-trust-mainnet.js` direct `set_threshold_config` çağırıyor | Yeni kontrat bu çağrıları reddeder | Scriptler `propose_action` üretecek şekilde yenilenmeli |
| Access-control runbook direct çağrı öneriyor | Runbook `set_market_contract` ve `set_registry_contract` direct çağrılarını gösteriyor; source bu çağrıları timelock olmadan reddediyor | Mainnet kurulum adımı başarısız olur veya eksik kalır | Access ayarları da `propose_action` -> `execute_action` akışıyla yazılmalı |
| Release runbook eski metot adları içeriyordu | 2026-04-25 kontrolünde release runbook eski registry ve direct admin örnekleri içeriyordu | Tekrarlanabilir deploy zayıflar | 2026-04-26 güncellemesinde kısa release checklist olarak yeniden yazıldı |
| KV namespace ayrımı iyi | `workers/youtick-kms/wrangler.toml` içinde 5 operator için ayrı KV ID'leri var | Threshold modelini güçlendirir | Bu ayrım korunmalı; dış operatör planında da şart olmalı |
| VSS/share integrity eksikliği doğru belgelenmiş | `docs/adr/adr-005-vss-share-integrity.md` deferred diyor; `shares.ts` HMAC/VSS yapmıyor | Kötü share veren operator ayıklanamıyor | MVP sonrası doğru P2; raporda risk olarak kalmalı |

---

## 3. Merkezi Noktalar

### 3.1 Owner hesabı

En büyük merkezi nokta hâlâ owner yetkisi. Timelock iyi bir güvenlik freni, ama
tek owner key şu riskleri taşır:

- key kaybı,
- key çalınması,
- yanlış deploy,
- tek kişinin yanlış kararı.

Solo MVP için bu tamamen engel değil. Ama kullanıcı fonu ve creator geliri
arttıkça bu model zayıf kalır.

**Kısa vadeli iyileştirme:**

- owner full-access key'i günlük geliştirme makinesinden çıkar,
- deploy için ayrı, sınırlı kullanım prosedürü oluştur,
- her admin işlemi için timelock zorunlu kalsın,
- pending timelockları public olarak izlenebilir yap.

**Orta vadeli iyileştirme:**

- `youtick.near`, `registry.youtick.near`, `access.youtick.near` için multisig
  veya en azından ikinci onay gerektiren owner modeli planla.

### 3.2 KMS operatörleri

Kod tarafındaki hedef iyi: AES anahtarı tek worker'da durmuyor; tarayıcı anahtarı
share'lere bölüyor ve yeterli share gelince playback başlıyor.

Bugünkü sorun operasyonel: operatörler canlı registry'de aktif değil. Bu yüzden
tasarım güçlü olsa da gerçek sistem henüz o gücü kullanmıyor.

**Kısa vadeli iyileştirme:**

- Bekleyen operator timelocklarını zamanı gelince `execute_action` ile tamamla.
- `list_decryption_operators` sonucunda 5 aktif kayıt görmeden ücretli şifreli
  içerik alma.
- Her worker `/health` sonucunda `ok: true` görmeden launch yapma.

**Orta vadeli iyileştirme:**

- İlk başta 5 operatör aynı Cloudflare hesabında kalabilir, ama bunu
  "operasyonel yedeklilik" olarak anlat; tam merkeziyetsizlik olarak anlatma.
- İlk gerçek gelir sonrası 2 operatörü güvendiğin dış kişilere veya ayrı
  hesaplara taşı.
- Operatörleri farklı bölgeler, farklı secret yönetimi ve farklı deploy
  yetkileriyle ayır.

### 3.3 Cloudflare KV

KV hızlı cache için uygun, fakat tek-kullanımlık nonce gibi güçlü tutarlılık
isteyen işlerde dikkatli kullanılmalı. KV'nin doğası gereği farklı edge
noktalarında kısa süreli tutarsızlık olabilir.

**Kısa vadeli kabul:**

- Kısa TTL'li ticket/access cache için KV yeterli.
- Nonce replay riski düşük hacimli MVP için kabul edilebilir, ama raporda açık
  risk olarak kalmalı.

**İyileştirme:**

- Replay/nonce kontrolünü Durable Object'e taşı.
- KV'yi sadece cache olarak kullan; güvenlik kararının nihai kaydı olarak
  kullanma.

### 3.4 Storage ve gateway

IPFS/Crust kullanımı merkezi veri tabanından daha iyi. Ayrıca medya şifreli
olduğu için storage sağlayıcısı ham videoyu görmüyor.

Ama tek pinning sağlayıcısı ve birkaç gateway gerçek merkeziyetsizlik için
yeterli değil.

**Kısa vadeli iyileştirme:**

- Her upload sonrası tüm segmentlerin pin/order durumunu görünür yap.
- Creator'a "storage order partial/failed" durumunu saklama.
- İlk launch'ta küçük dosya ve kısa video ile başla.

**Orta vadeli iyileştirme:**

- Crust yanında ikinci pinning/persistence yolu ekle.
- Manifest içine birden fazla delivery adayı yaz.
- Periyodik CID health job ekle.

### 3.5 Frontend dağıtımı

Web4 hedefi doğru. Ancak kullanıcılar çoğunlukla `youtick.net` veya benzeri bir
alan adından gelecekse DNS, proxy, CDN ve deploy süreci hâlâ merkezi kalır.

**Kısa vadeli iyileştirme:**

- Web4 linkini görünür ve çalışır tut.
- Custom domain down olsa bile `youtick.near.page` çalışmalı.
- Build hash ve deployed commit bilgisini footer veya health endpointte göster.

---

## 4. Güncel Dokümanlarla Uyum

Bu rapordaki öneriler şu dokümanlarla uyumludur:

- NEAR access key modeli: Function Call key'ler belirli kontrat/metot ve gas
  allowance ile sınırlanabilir. Bu, upload session ve onboarding key modelini
  destekler.
- NEAR account modeli: Full-access key tam kontrol verir; bu yüzden owner key
  günlük kullanımda tutulmamalıdır.
- NEAR multisig modeli: Daha fazla kullanıcı fonu ve creator geliri oluştuğunda
  tek owner yerine multisig daha doğru yoldur.
- Cloudflare KV modeli: KV düşük gecikmeli cache için uygundur, ama güçlü
  tutarlılık gereken tek-kullanımlık güvenlik kararlarında dikkatli kullanılmalı.
- Cloudflare Durable Objects modeli: Tekil nesne etrafında daha güçlü tutarlılık
  ve sıralı işlem ihtiyacı için daha uygundur.

Kaynaklar:

- NEAR Access Keys: https://docs.near.org/protocol/access-keys
- NEAR API access keys: https://docs.near.org/api/rpc/access-keys
- NEAR account model: https://docs.near.org/protocol/accounts-contracts/account-model
- NEAR multisig example: https://docs.near.org/integrations/accounts
- Cloudflare KV consistency: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- Cloudflare Durable Objects: https://developers.cloudflare.com/durable-objects/

---

## 5. Güncellenmiş Skor

| Alan | Bugünkü canlı durum | Kod hedefi çalışınca | 3 aylık gerçekçi hedef |
|---|---:|---:|---:|
| Governance | 2/10 | 3/10 | 5/10 |
| Key management | 3/10 | 6/10 | 7/10 |
| Storage | 5/10 | 5/10 | 6/10 |
| RPC resilience | 6/10 | 6/10 | 7/10 |
| Frontend hosting | 4/10 | 4/10 | 6/10 |
| Access/session auth | 5/10 | 7/10 | 8/10 |
| Operator liveness | 2/10 | 6/10 | 7/10 |
| Browser security | 4/10 | 5/10 | 6/10 |

**Bugünkü CDI:** 3.7/10  
**Timelocklar yürütülüp KMS health yeşile dönünce:** 5.5/10  
**Solo geliştirici için 3 aylık makul hedef:** 6.5/10

Bu skor "ürün kötü" anlamına gelmez. Sadece bugünkü canlı sistemde tasarımın
tamamının henüz aktif olmadığını gösterir.

Skorun 3.9'dan 3.7'ye düşürülme nedeni mimarinin zayıflaması değil; canlı worker,
kontrat view'ları ve runbook arasında görülen tutarsızlıkların operasyonel
güveni azaltmasıdır.

---

## 6. Solo Geliştirici İçin Optimum Yol

### Faz 0 — Mainnet Aktivasyonu

Amaç: Kodda var olan merkeziyetsizlik katmanlarını gerçekten çalışır yapmak.

- Registry timelocklarını yürüt.
- 5 KMS operatörünü aktif hale getir.
- 5 KMS worker'ı güncel source ile yeniden deploy et.
- Worker `/health` sonuçlarını `ok: true` yap.
- Access contract market/registry referanslarını doğrulanabilir hale getir.
- Access contract için `get_config` veya açık `get_market_contract` /
  `get_registry_contract` view metotlarını ekle.
- Trial pool sıfırsa trial/free sponsor akışını ya fonla ya da UI'da kapalı
  göster.
- `NEXT_PUBLIC_KMS_URL` gibi eski env kalıntılarını temizle.
- Tek aktif mainnet runbook/script seti seç ve eski direct admin çağrılarını
  temizle.

Kabul kriteri:

- `list_decryption_operators` 5 aktif kayıt döner.
- `get_threshold_config` 5/3 döner.
- 5 KMS endpoint `ok: true` döner.
- KMS `/health` çıktısı güncel source ile uyumludur ve gereksiz kontrat/operator
  detayı sızdırmaz.
- Access config view'ları boş değer dönmez.
- Ücretli test video: upload, buy, watch akışı geçer.

### Faz 1 — Tek Owner Riskini Azalt

Amaç: Solo kalırken tek key felaketini azaltmak.

- Owner key'i secret manager veya hardware wallet düzenine taşı.
- Timelock bypass testlerini CI'da tut.
- Admin action explorer veya basit bir docs tablosu yayınla.
- Her admin action için "neden, ne zaman yürütülecek, nasıl geri alınır" notu
  tut.

Kabul kriteri:

- Owner doğrudan pause/withdraw/operator update yapamaz.
- Bekleyen timelocklar public olarak doğrulanabilir.

### Faz 2 — Operatör Ayrıştırma

Amaç: 5 worker aynı kişinin beş kopyası olmaktan çıksın.

- 5 operatörü en az 2 farklı Cloudflare hesabına böl.
- Her operatör için ayrı KV namespace, ayrı secret, ayrı deploy token kullan.
- İlk dış operatör rehberi yaz: nasıl deploy edilir, nasıl rotate edilir, nasıl
  health kontrol edilir.

Kabul kriteri:

- En az 2 operatör senden bağımsız credential/deploy alanında çalışır.
- Tek Cloudflare hesabı kapanırsa threshold tamamen düşmez.

### Faz 3 — Replay ve Cache Sertleştirme

Amaç: KV'yi sadece cache seviyesinde tutmak.

- Nonce/idempotency kontrolünü Durable Object'e taşı.
- KV TTL'leri operasyonel cache olarak kalsın.
- Access revoke/transfer durumlarında daha hızlı invalidation tasarla.

Kabul kriteri:

- Aynı nonce farklı edge noktalarında tekrar kullanılamaz.
- Ticket transfer/revoke sonrası playback yetkisi kısa sürede kapanır.

### Faz 4 — Storage Çeşitlendirme

Amaç: Crust tek pratik bağımlılık olmasın.

- İkinci pinning/persistence sağlayıcısı ekle.
- CID health monitor ekle.
- Creator dashboard'da storage sağlığı göster.

Kabul kriteri:

- Aynı manifest ve segmentler en az iki bağımsız persistence yoluyla korunur.
- Tek gateway/pinning sağlayıcısı bozulunca video tamamen kaybolmaz.

### Faz 5 — Governance Geçişi

Amaç: Gelir ve kullanıcı arttığında owner modelini olgunlaştırmak.

- Multisig owner planı hazırla.
- Kontrat upgrade ve emergency pause prosedürünü multisig'e bağla.
- KMS operator registry değişikliklerini tek kişilik işlem olmaktan çıkar.

Kabul kriteri:

- Yeni operator ekleme, threshold değişimi, pause/unpause ve owner transferi
  tek kişinin tek imzasına bağlı değildir.

---

## 7. Launch Eşiği

Gerçek creator almadan önce minimum eşik:

- [ ] 5 aktif KMS operator
- [ ] KMS health `ok: true`
- [ ] Canlı worker'lar repo source ile aynı health davranışını gösteriyor
- [ ] 3-of-5 share reconstruction test edildi
- [ ] Upload -> purchase -> watch smoke test geçti
- [ ] Access contract config'i boş dönmüyor veya açıkça gerekli değilse dokümanda gerekçesi var
- [ ] Mainnet runbook/scriptler artık doğrudan admin metotları önermiyor
- [ ] Known issues canlı durumu yansıtıyor
- [ ] Trial/free sponsor akışı fon durumuna göre açık veya kapalı
- [ ] Root lisans seçildi
- [ ] Public alpha metni "production-ready" demiyor

Bu eşik geçilmeden ana iddia şu olmalı:

> YouTick is in public alpha. Core contracts are on mainnet, and KMS/operator
> hardening is in progress.

Bu eşik geçildikten sonra:

> YouTick public alpha supports curated mainnet creator uploads with encrypted
> playback and registry-backed KMS operators.

---

## 8. Son Tavsiye

Solo geliştirici için en doğru strateji DAO, staking ve tam permissionless
operator modeline hemen atlamak değil. Önce şu üç şeyi sağlamlaştır:

1. KMS registry gerçek hayatta çalışsın.
2. Owner key hatası tek hamlede sistemi yıkamasın.
3. İçerik storage ve playback durumu creator'a dürüstçe gösterilsin.

Bu üçü tamamlandığında YouTick merkeziyetsizlik açısından "iddialı ama kırılgan
prototip" durumundan "dürüst public alpha" durumuna geçer.
