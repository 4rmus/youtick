# YouTick Çok Açılı Değerlendirme - 2026-05-17

> Kapsam: mimari değerlendirme, yatırımcı gözü ve hedef kitle / ürün-pazar uyumu.
> Bu rapor `/Users/arair/works/youtick` içindeki yerel checkout'a, alt ajan
> analizlerine, repo kanıtlarına, yerel testlere ve seçili güncel pazar
> kaynaklarına dayanır.

## Varsayımlar ve Sınırlar

- Değerlendirme kaynağı yerel checkout'tur. `git status -sb` çıktısı
  `main...origin/main [behind 1]` gösterdiği için remote'daki bir commit bu
  rapora dahil değildir.
- Bu turda canlı Cloudflare veya NEAR production endpoint'leri yeniden
  doğrulanmadı. Dokümanlardaki canlı sistem iddiaları, güncel yerel testle
  desteklenmiyorsa tarihli iddia olarak ele alındı.
- Bu rapor hukuki, vergi, yatırım veya regülasyon tavsiyesi değildir. Ödeme,
  stablecoin, app-store ve içerik moderasyonu konuları ölçekli lansman öncesi
  uzman değerlendirmesi gerektirir.
- Ürün bugün "production-ready" değil, public alpha olarak anlatılmalı. Repo
  bunu `README.md:111-115` ve `docs/README.md:7-15` içinde açıkça söylüyor.

## Ajan Orkestrasyonu

| Şerit | Kapsam | Kullanılan çıktı |
|---|---|---|
| Mimari ajanı | Sistem haritası, güven sınırları, upload/playback/payment yolu, CI/docs hazırlığı | Mimari güçlü yanlar, riskler, darboğazlar, ana öneriler |
| Yatırımcı ajanı | Kategori, giriş noktası, savunulabilirlik, gelir modeli, GTM, yatırım soruları | Pre-seed tezi, iş riskleri, yatırımcı due diligence soruları |
| Hedef kitle ajanı | ICP, üretici değeri, izleyici değeri, copy netliği, onboarding sürtünmesi | En doğru ilk hedef kitle ve UX konumlandırması |
| Kanıt haritası ajanı | Repo/docs/kod üzerinden gerçek kabiliyet tablosu | Olgunluk notları ve drift adayları |

## Kapsam Tanımları

### 1. Mimari

Mimari inceleme şunları kapsar:

- Uygulama katmanı: `apps/web`, rotalar, wallet, upload, watch, discover, profile.
- Kontrat katmanı: `contracts/nft-ticket`, `access-control`, `operator-registry`.
- Worker katmanı: `workers/youtick-kms`, `storage-api`, `media-delivery`,
  `web4-proxy`.
- Ana akışlar: upload, KMS share saklama/geri alma, bilet satın alma, playback,
  gift/trial, Web4/static hosting.
- Operasyonel hazırlık: runbook'lar, launch gate'leri, testler ve drift riski
  taşıyan iddialar.

Başarı ölçütleri:

- Gerçek source-of-truth sınırlarını belirlemek.
- Yerel test sağlığını canlı E2E hazırlıktan ayırmak.
- Geniş refactor önermeden, fazlı ve somut öneriler çıkarmak.

### 2. Yatırımcı Gözü

Yatırımcı incelemesi şunları kapsar:

- Kategori ve wedge.
- Neden şimdi ve pazar çekimi.
- Gelir modeli ve take-rate kalitesi.
- Savunulabilirlik.
- Go-to-market ve traction hazırlığı.
- İş, regülasyon, platform ve operasyon riskleri.
- Yatırım öncesi sorulacak temel sorular.

Başarı ölçütleri:

- Teknik derinliği traction gibi satmamak.
- Bugün neyin fonlanabilir olduğunu ve neyin eksik kaldığını açık söylemek.
- Güncel creator/video monetization beklentileriyle karşılaştırmak.

### 3. Hedef Kitle / PMF

Hedef kitle incelemesi şunları kapsar:

- Üretici değeri.
- İzleyici değeri.
- En doğru ilk ICP.
- Onboarding, wallet ve ödeme sürtünmesi.
- Copy ve güven netliği.
- Açık keşif pazarı ile creator-led dağıtım farkı.

Başarı ölçütleri:

- En dar ama güçlü ilk pazarı belirlemek.
- Üretici ve izleyici tarafındaki sürtünmeleri ayrı görmek.
- Pratik konumlandırma ve UX sadeleştirme önerileri çıkarmak.

## Yönetici Özeti

YouTick'in bugünkü en güçlü kimliği "Web3 video platformu" değil. En güçlü
kimlik şudur:

**Bağımsız film, müzik, festival ve özel etkinlik üreticileri için biletli
dijital gösterim aracı.**

Web3 katmanı ilk cümle değil; güven, erişim ve kontrol altyapısıdır. Repo zaten
bu yöne işaret ediyor: landing copy, üreticinin film veya konser kaydını biletle
satabileceğini, fiyat belirleyip doğrudan kendi kitlesine sunabileceğini söylüyor
(`apps/web/lib/translations.ts:410-430`). Kullanım alanları da film, konser
kayıtları, festival pencereleri, albüm/video gösterimleri ve konuk/basın biletleri
etrafında kurulmuş (`apps/web/lib/translations.ts:476-489`).

Mimari açıdan YouTick, public-alpha seviyesindeki solo founder projesi için
oldukça derin. Sistem; browser encryption, NEAR sahiplik/erişim kuralları,
access grant, KMS threshold share, Lighthouse/IPFS persistence, media delivery
ve Web4 hosting arasında gerçek bir ayrım kuruyor (`README.md:31-52`,
`docs/public/architecture-overview.md:29-58`).

Yatırımcı gözüyle proje bugün bir traction hikayesi değil; **pre-seed teknik tez
ve net wedge** hikayesidir. Teknik kanıt güçlü, ticari kanıt hâlâ erken. Launch
plan da yakın dönem pitch'i pre-seed olarak konumlandırıyor ve küçük kullanıcı
sinyalinin ilk yatırım turu için yeterli olabileceğini söylüyor
(`docs/launch-plan-2026-05.md:18-24`, `docs/launch-plan-2026-05.md:47-56`).

Hedef kitle açısından en doğru ilk kullanıcı genel creator veya soğuk marketplace
izleyicisi değildir. En doğru ilk kullanıcı; hâlihazırda sıcak kitlesi olan ve
belirli bir release, gösterim, konser kaydı veya özel izleme satmak isteyen
film/müzik/festival üreticisidir.

## Kanıt Özeti

| Alan | Repo kanıtı | Okuma |
|---|---|---|
| Ürün durumu | `README.md:3-5`, `README.md:111-115`, `docs/README.md:7-15` | Public alpha, hybrid decentralized, production-ready değil |
| Ana ürün | `docs/overview.md:14-22`, `docs/overview.md:28-36` | Şifreli video yükleme, bilet satma/claim etme, KMS ile playback key toplama |
| Bileşen ayrımı | `README.md:41-52`, `docs/overview.md:69-83` | Web app, KMS, Storage API, Media Delivery, Web4 proxy, kontratlar |
| Upload akışı | `apps/web/hooks/useUpload.ts:31-40`, `apps/web/hooks/useUpload.ts:522-638` | Session, thumbnail, encryption, IPFS upload, KMS, mint, storage verify |
| Storage API | `workers/storage-api/src/index.ts:73-84`, `workers/storage-api/src/index.ts:272-345` | Lighthouse default, upload auth, intent token, upload guard |
| Media Delivery | `workers/media-delivery/src/index.ts:12-24`, `workers/media-delivery/src/index.ts:58-98` | Gateway fallback, cache, Range handling; key custody yok |
| KMS | `workers/youtick-kms/src/index.ts:1-20`, `workers/youtick-kms/src/index.ts:660-702` | Request signing, session grant/ticket check, fail-closed davranış |
| Payment | `apps/web/components/TicketPurchaseCard.tsx:292-330`, `apps/web/components/TicketPurchaseCard.tsx:377-654` | NEAR, USDC/USDT, Rhea, 1Click; guest paid path kapalı |
| Viewer gate | `apps/web/app/watch/page.tsx:57-66`, `apps/web/app/watch/page.tsx:240-280` | Creator/ticket/recent purchase varsa watch açılır; yoksa purchase card |
| Launch gate | `docs/launch-plan-2026-05.md:421-432` | Full 3-currency upload-buy-watch smoke hâlâ unchecked |

## Mimari Değerlendirme

### Güçlü Taraflar

Sistem sınırları büyük ölçüde doğru seçilmiş.

- NEAR, entitlement ve market state'in kaynağı.
- Tarayıcı medya dosyasını upload öncesi şifreliyor.
- Storage API, Lighthouse secret'ını tarayıcıdan gizliyor ve upload bütçesini
  koruyor.
- KMS worker'ları tam key değil, threshold share tutuyor.
- Media Delivery yalnızca şifreli byte taşıyor.
- Web4 proxy, static deploy sınırları için same-origin yol veriyor.

Bu, repo içinde anlatılan trust model için iyi bir mimari. Sistem tamamen
decentralized gibi davranmıyor; public architecture dokümanı hosting, operator
runtime, persistence redundancy ve emergency governance alanlarında merkezi
operasyonel kontrol olduğunu açıkça söylüyor
(`docs/public/architecture-overview.md:53-58`).

Upload tarafında da önemli güvenlik frenleri var. Sistem encrypted delivery
asset'lerini paketleyip yüklüyor, AES key'i KMS'e yazıyor, key'i geri alıp
doğruluyor ve bundan sonra NFT/event publish yoluna gidiyor
(`apps/web/hooks/useUpload.ts:556-638`).

### Riskli Alanlar

En büyük mimari risk tek bir modülün bozuk olması değil, operasyon yüzeyinin
geniş olması.

Playback'in çalışması için registry, access grant, KMS operator'ları, RPC, IPFS
gateway'leri, media-delivery, wallet/session state ve contract event aynı anda
doğru çalışmalı. Bu güçlü bir güven hikayesi sağlar; ama arıza noktalarını da
artırır.

Storage persistence diğer önemli risk. Mevcut upload yolunda storage-order veya
pin verification hataları bazı durumlarda videonun published kalmasına ve
"long-term persistence is not guaranteed" durumuna yol açabiliyor
(`apps/web/hooks/useUpload.ts:647-710`). Ücretsiz veya iç testlerde bu kabul
edilebilir; ücretli public içerikte daha sert gate veya draft state gerekir.

Payment yüzeyi alpha için geniş. NEAR, native USDC/USDT, Rhea, 1Click ve EVM
MetaMask yolları aynı ticket entitlement modeline bağlanıyor, fakat her ödeme
yolu ayrı failure mode ekliyor (`apps/web/components/TicketPurchaseCard.tsx:377-654`).

### Mimari Öneriler

1. **Her deploy için tek release evidence kaydı oluştur.**
   Registry threshold, beş KMS health check, Storage API `/provider-health`,
   Media Delivery read ve kısa upload-buy-watch sonucu tek yerde tutulmalı.
   Runbook zaten bu kapıyı tarif ediyor (`docs/release-runbook.md:62-90`,
   `docs/release-runbook.md:156-167`).

2. **Ücretli içerikte storage persistence kapısını sertleştir.**
   İlk adım: UI/runbook seviyesinde "pin/status görünmeden paid içerik live
   pazarlanmaz" kuralı. Sonraki adım: gerekirse app veya kontrat tarafında
   draft/published state.

3. **Alpha payment yollarını dar tut.**
   Public primary path NEAR wallet + native/direct stablecoin olsun. Rhea ve
   cross-chain 1Click açık feature flag ve ayrı smoke gate arkasında ilerlesin.

4. **Investor paylaşımı öncesi docs/code drift'ini kapat.**
   Kanıt haritası ajanı KMS cache dili, access-control README TTL, Crust fallback
   dili ve tarihli live claim'ler çevresinde drift adayları buldu. Bunlar core
   ürün blocker değil, ama diligence sırasında güveni zayıflatır.

5. **Refactor öncesi ölç.**
   Upload stage süresi, KMS share retrieve p95, gateway fallback oranı ve
   `has_ticket` token count etkisi ölçülmeli. Geniş rewrite ancak bir metric
   darboğazı kanıtlarsa düşünülmeli.

## Yatırımcı Gözüyle Değerlendirme

### Kategori

YouTick şu alanların kesişiminde duruyor:

- creator monetization,
- biletli video gösterimleri,
- protected direct-to-fan content,
- NFT/on-chain entitlement,
- Web3 ödeme yolları.

Crypto dışı yatırımcı için en doğru kategori adı:

**Direct-to-fan ticketed video screenings.**

Crypto katmanı ürün kategorisi değil; access infrastructure olarak anlatılmalı.

### Pazar Bağlamı

Goldman Sachs Research, creator economy'nin yaklaşık `$250B` seviyesinden 2027'ye
kadar `$480B` seviyesine yaklaşabileceğini tahmin etti. Aynı çerçevede
monetization araçları, veri/analitik, e-commerce ve platform ölçeği önemli
enablement alanları olarak öne çıkıyor.

Patreon 2025'te creator'lara `$10B` üstü ödeme ve `25M` üstü paid membership
bildirdi. Patreon ayrıca 4 Ağustos 2025 sonrası yeni creator'lar için processing
ve diğer ücretler hariç standard platform fee olarak `10%` gösteriyor.

Video odaklı platformlar da doğrudan monetization sunuyor. Vimeo OTT web-only
starter modelinde subscription, transaction ve free trial akışlarını destekliyor.
Uscreen de subscription, rental ve one-time sale akışlarını creator video
monetization ürününün merkezine koyuyor.

Bu pazarın gerçek ama boş olmadığını gösterir. YouTick'in kazanması için use case
dar olmalı: yüksek creator share ile korumalı, tekil, direct ticketed film/music
screening.

### Gelir Modeli

98/2 split creator acquisition için güçlü. Repo bunu hem user copy'de hem
kontrat mantığında tekrar ediyor (`apps/web/lib/translations.ts:455-474`,
`contracts/nft-ticket/src/lib.rs:202-213`,
`contracts/nft-ticket/src/market.rs:558-591`).

Yatırımcı endişesi basit: **2% take-rate tek başına şirketi taşımak için ince
kalabilir.**

Örneğin `100,000 USD` GMV sadece `2,000 USD` platform geliri üretir. Bunun
içinden support, moderation, storage, KMS operation, compliance ve payment
overhead çıkacaktır.

Erken planlanması gereken ek gelir yolları:

- card/fiat checkout service fee,
- festival/venue paketleri,
- premium hot delivery/cache,
- creator analytics,
- white-label screening page,
- compliance/moderation support tier,
- creator drop için managed launch package.

### Savunulabilirlik

Teknik savunulabilirlik inandırıcı: browser encryption, threshold KMS, operator
registry, on-chain ownership ve encrypted IPFS delivery gerçek bir sistem
oluşturuyor.

İş savunulabilirliği ise henüz kanıtlı değil. Open source ve Web3 tek başına moat
değil. Gerçek moat şu alanlardan gelmeli:

- güvenilir creator ilişkileri,
- tekrarlanan biletli gösterim etkinlikleri,
- içerik/legal operasyonu,
- izleyicinin checkout/playback deneyimine güvenmesi,
- satış ve retention analitiği.

### Yatırım Hazırlığı Skoru

| Boyut | Bugünkü okuma | Neden |
|---|---|---|
| Teknik kanıt | Güçlü | Mainnet odaklı kontratlar, worker'lar, KMS, testler, runbook'lar |
| Ürün netliği | Orta-yüksek | Film/müzik biletli gösterim hikayesi net, ama Web3 terimleri hâlâ baskınlaşabilir |
| Traction | Zayıf/bilinmiyor | Repo içinde güncel GMV, cohort, retention veya creator activation kanıtı yok |
| İş modeli | Orta | 98/2 güçlü acquisition hook; düşük take-rate ek gelir ister |
| Operasyonel hazırlık | Orta | Runbook/testler iyi; full live smoke ve monitoring hâlâ gate |
| Bugünkü fundability | Pre-seed thesis | Teknik tez + net wedge için iyi; revenue/traction raise için erken |

### Yatırımcının Soracağı Sorular

1. İlk 10 creator kim, ne yayınlayacaklar?
2. Gerçek mainnet ortamında kaç upload-buy-watch akışı geçti?
3. 30 gün sonunda GMV, conversion, repeat purchase, creator activation ve support
   yükü nedir?
4. Creator neden Vimeo/Patreon/Stripe/private video yerine YouTick kullansın?
5. Take-rate 2% kalırsa şirket nasıl para kazanacak?
6. Crypto dışı izleyici için card/fiat ödeme ne zaman default olacak?
7. KMS node'larını kim işletiyor ve ne zaman bağımsızlaşacaklar?
8. Takedown, refund, moderation ve abuse süreci nasıl işleyecek?
9. Native app-store payment kuralları NFT veya external payment unlock'ı sınırlarsa
   mobile strateji ne olacak?
10. Bağımsız security audit planı nedir?

## Hedef Kitle / PMF Değerlendirmesi

### En Doğru İlk ICP

En güçlü ilk ICP:

**Sıcak kitlesi olan, belirli bir online gösterim satmak isteyen bağımsız film
ekipleri, müzisyenler, konser/festival ekipleri, venue'ler ve kültür
üreticileri.**

Bu ICP'nin nedeni:

- Landing copy zaten film, konser kayıtları, festival pencereleri ve özel
  gösterimlere konuşuyor (`apps/web/lib/translations.ts:410-489`).
- Watch sayfası, kullanıcı belirli bir işi izleme niyetiyle geldiğinde en iyi
  çalışıyor; soğuk marketplace browsing için değil (`apps/web/app/watch/page.tsx:240-280`).
- Guest ve gift akışları basın, jüri, partner, supporter ve private screening
  senaryolarına uyuyor (`apps/web/lib/translations.ts:488-489`,
  `apps/web/app/trial/page.tsx:31-79`).

### Üretici Değeri

Üretici değeri net:

- film/konser/özel işi publish et,
- bilet fiyatını ve erişim türünü seç,
- creator share'i gör,
- odaklı watch page paylaş,
- yüksek paid-ticket payını koru.

Ana sürtünme zihinsel yük. Upload/publish bugün wallet, session, encryption,
IPFS/Lighthouse, KMS, NFT mint, storage verification ve blockchain cost gibi
çok sayıda kavramı görünür kılıyor. Değer gerçek, ama UI bunu şu dilde
çerçevelemeli:

`Eseri ekle -> bileti ayarla -> maliyeti gör -> gösterimi aç -> link paylaş`

Teknik adımlar ana hikaye değil, progress detayı olarak kalmalı.

### İzleyici Değeri

İzleyici değeri şu kadar sade olmalı:

`Bileti al -> bu eseri izle -> üreticiyi destekle`

Bugün izleyici yolu özellikle free/gift ve sıcak kitle senaryolarında güçlü.
Paid ve crypto dışı izleyici için wallet sürtünmesi hâlâ yüksek. Uygulama
guest/trial hesabın paid purchase yapmasını engelliyor ve gerçek wallet istiyor
(`apps/web/components/TicketPurchaseCard.tsx:624-627`).

Bu yüzden ilk lansman soğuk izleyicinin keşfedip dönüştüğü bir marketplace
senaryosuna dayanmaz. İlk lansman creator-led traffic'e dayanmalı: izleyici
zaten belirli release'i izlemek istiyor olmalı.

### Konumlandırma Önerisi

Public positioning:

**YouTick, film ve müzik üreticilerinin biletli dijital gösterimleri doğrudan
kendi izleyicisine satmasını sağlar.**

Ana cümle olarak kaçınılması gerekenler:

- Web3 video platformu
- NFT video marketplace
- Decentralized Netflix
- IPFS/KMS creator economy infrastructure

Bunlar ön kapı değil, açıklama katmanı olmalı.

## Öncelikler

### P0 - Public Alpha İddiası Öncesi

1. Mainnet'te full upload-buy-watch smoke çalıştır ve kaydet.
2. Launch gate'te açık görünen maddeleri kapat veya açıkça defer et:
   trial baseline counter, 3-currency smoke ve monitoring alert test
   (`docs/launch-plan-2026-05.md:421-432`).
3. Worker version, contract hash, KMS health, storage health ve smoke sonucunu
   içeren tek release evidence note üret.

### P1 - Investor Outreach Öncesi

1. Kısa bir public-alpha transparency/economics sayfası hazırla.
2. Kanıt haritası ajanının bulduğu açık docs drift'lerini düzelt.
3. Bir sayfalık investor metric planı ekle: creator activation, GMV, conversion,
   playback success, refund/support issue.
4. Pitch'i film/müzik biletli gösterim odağına daralt.

### P2 - Daha Geniş Creator Acquisition Öncesi

1. Upload copy ve progress dilini creator-language'a sadeleştir.
2. Purchase card'a kısa güven copy'si ekle: bilet bu eseri açar, işlem finaldir,
   içerik sahipliği devredilmez.
3. İlk crypto dışı checkout yolunu netleştir. En olası yol: worker + webhook
   fulfillment destekli card/fiat ödeme.
4. KMS latency, gateway fallback, upload stage time ve payment completion için
   operasyonel metric ekle.

## Yapılan Doğrulama

| Komut | Sonuç |
|---|---|
| `cd apps/web && npm test -- --run` | 32 dosya, 256 test geçti |
| `cd workers/storage-api && npm run check` | geçti |
| `cd workers/storage-api && npm test -- --run` | 29 test geçti |
| `cd workers/media-delivery && npm run check` | geçti |
| `cd workers/media-delivery && npm test -- --run` | 11 test geçti |
| `cd workers/youtick-kms && npm run check` | geçti |
| `cd workers/youtick-kms && npm test -- --run` | 48 test geçti |
| `cd workers/web4-proxy && npm run check` | geçti |
| `cd workers/web4-proxy && npm test -- --run` | 17 test geçti |
| `cd contracts/nft-ticket && cargo test` | 49 unit + 31 sandbox test geçti |
| `cd contracts/access-control && cargo test` | 8 test geçti; mevcut 2 `unused_mut` uyarısı var |
| `cd contracts/operator-registry && cargo test` | 4 test geçti |

Bu kontroller yerel modül sağlığını kanıtlar. Güncel canlı mainnet/Cloudflare
E2E hazırlığını tek başına kanıtlamaz.

## Kullanılan Dış Kaynaklar

- Goldman Sachs, creator economy TAM ve büyüme:
  <https://www.goldmansachs.com/insights/articles/the-creator-economy-could-approach-half-a-trillion-dollars-by-2027>
- Patreon creator fees:
  <https://support.patreon.com/hc/en-us/articles/11111747095181-Creator-fees-overview>
- Axios, Patreon ödeme/membership kilometre taşı:
  <https://www.axios.com/2025/08/05/patreon-10-billion-creator-economy-ai>
- Vimeo OTT pricing ve monetization:
  <https://vimeo.com/ott/pricing>
- Uscreen video monetization positioning:
  <https://www.uscreen.tv/video-monetization/>
- NEAR Intents overview:
  <https://docs.near.org/chain-abstraction/intents/overview>

## Son Sentez

YouTick, public-alpha biletli gösterimler için inandırıcı bir teknik temele
sahip. Mimari hikaye tutarlı: browser encryption, NEAR entitlement, KMS threshold
custody ve encrypted IPFS delivery.

Ana iş hikayesi ise bugün traction değil; keskin bir pre-seed wedge. Sıradaki en
iyi hamle geniş refactor değil. Sıradaki en iyi hamle, bir gerçek release evidence
paketi ve bir odaklı pazar paketi üretmek:

1. temiz bir canlı upload-buy-watch yolunu kanıtla,
2. ilk creator ICP'yi net göster,
3. 98/2 ekonomisini dürüst anlat,
4. Web3'ü güven katmanında tut,
5. ürünü "film ve müzik için biletli dijital gösterimler" olarak sat.
