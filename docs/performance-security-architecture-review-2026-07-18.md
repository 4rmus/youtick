# YouTick Performans, Güvenlik ve Mimari İnceleme Raporu

Tarih: 18 Temmuz 2026<br>
İncelenen sürüm: main, 77224924425b2b73b2d076f9663ec2d63aeb120d<br>
Kapsam: apps/web, contracts, workers, scripts, CI, operasyon ve güvenlik dokümanları<br>
Karar türü: Statik inceleme, yerel doğrulama, sınırlı canlı okuma ve güncel resmî kaynak araştırması

## 1. Yönetici özeti

YouTick’in mevcut repo tanımı olan public alpha ve not production-ready durumu teknik gerçeklikle uyumludur. Uygulamanın test ve modül ayrımı güçlüdür; yerel web, Worker ve kontrat testleri yeşildir, Web4 proxy cache’i canlıda çalışmaktadır. Buna rağmen ana para akışlarında, state ekonomisinde, KMS yönetim modelinde ve yayın zincirinde üretim engeli sayılması gereken riskler vardır.

En önemli sonuçlar:

1. Web sürümü acil güvenlik güncellemesi gerektiriyor. Kilitli Next.js 16.1.6 ve React Server Components 19.2.3, Mayıs 2026 güvenlik sürümünden önceki etkilenen aralıkta. Yalnız WAF ile güvenli hale getirilemez.
2. NFT kontratındaki sabit storage depozitoları gerçek state büyümesini karşılamıyor. Sınırsız metinler, profiller, ödeme kimlikleri ve grant listeleri kontrat bakiyesini ekonomik DoS’a açıyor.
3. wNEAR unwrap akışında, unwrap başarılı olduktan sonra callback başarısız olursa NEP-141 resolver’ın kullanıcıyı iade edecek wNEAR bakiyesi kalmayabilir; native NEAR kontratta sıkışabilir.
4. CI’ın test ettiği WASM ile mainnete gönderilen WASM aynı üretim zincirinden gelmiyor. Deploy betiği doğrudan mainneti varsayıyor ve bazı migrasyon hatalarını başarılı süreç gibi yutuyor.
5. 3/5 KMS matematiksel eşiği var; ancak beş operatör aynı Cloudflare hesabı ve dağıtım alanında. Tek hesap, CI veya sağlayıcı olayı bütün operatörleri aynı anda etkileyebilir.
6. KMS nonce, Storage auth challenge, rate-limit ve upload idempotency durumları atomik olmayan Workers KV read-then-write akışlarında. Paralel veya farklı bölge istekleri replay ve çift işlem üretebilir.
7. İlk cache-miss playback koddan çıkarılan üst sınırda yaklaşık 60 NEAR RPC alt isteğine çıkabiliyor. Beş KMS aynı RPC havuzuna güvendiği için performans maliyeti ile ortak güven kökü aynı yerde oluşuyor.
8. Storage Worker 100 MB multipart isteği request.formData ile belleğe alıp ikinci FormData oluşturuyor. Cloudflare isolate sınırı 128 MB; tek büyük istek bile bellek hatasına yaklaşabilir.
9. Canlı ilk bayt süresi sağlıklı görünse de ana sayfa yaklaşık 364 KB, watch rotası yaklaşık 523 KB Brotli JavaScript/CSS yüklüyor. Sentry ortak parçası tek başına yaklaşık 106 KB ve her rotada taşınıyor.
10. CI kapsamı geniş unit/integration testlere rağmen Playwright smoke, Web4 export, dependency audit, secret scan, reproducible WASM, gas/storage ve bundle bütçelerini zorunlu tutmuyor.
11. Claim rotası yeni bağlantılarda fragment kullansa da eski secret/key query parametrelerini hâlâ kabul ediyor. İlk HTTP isteği gerçekleştiği için hydration sonrası URL temizliği CDN, analytics veya hata izleme loglarındaki anahtar sızıntısını geri alamaz.
12. Tarayıcıdaki 500 MB upload hattı dosyayı, MP4 verisini, segment kopyalarını ve şifreli Blob’ları aynı anda bellekte tutabiliyor. Worker kullanımı UI donmasını azaltır; toplam heap baskısını ortadan kaldırmaz.

### Genel değerlendirme

| Alan | Durum | Kısa karar |
| --- | --- | --- |
| Kullanıcı fonu güvenliği | Kritik iyileştirme gerekli | wNEAR ve stablecoin callback/refund invariantları kapanmadan para akışı büyütülmemeli |
| Kontrat state ekonomisi | Kritik iyileştirme gerekli | Gerçek storage farkı ölçülmeli; input ve koleksiyon büyümesi sınırlandırılmalı |
| Web güvenliği | Acil yama gerekli | Next/React güvenlik sürümü release-blocker |
| Worker güvenliği | Yüksek risk | KV atomik işlerde kullanılıyor; açık relay ve onboarding capability yüzeyleri daraltılmalı |
| Performans | Orta-yüksek risk | Edge TTFB iyi; istemci bundle, 500 MB browser upload, RPC fan-out ve çift hedging darboğaz |
| Mimari | Yön doğru, sınırlar eksik | Storage, delivery ve KMS rol ayrımı doğru; tutarlılık ve yönetim alanları yeniden düzenlenmeli |
| Test kalitesi | Güçlü temel, kritik boşluklar | Yerel testler yeşil; gerçek FT callback, ölçek/gas, live transaction ve release provenance kapsanmıyor |
| Operasyon ve yayın | Kritik iyileştirme gerekli | Test edilen artifact ile deploy edilen artifact arasında kanıtlanabilir bağ yok |

## 2. Öncelik tanımı ve yayın kararı

- P0: Fon kaybı, ekonomik DoS, bilinen aktif güvenlik aralığı veya mainnet deploy bütünlüğü. Yeni üretim yayını öncesi kapanmalı.
- P1: Ölçekte güvenlik, kullanılabilirlik veya maliyet sorunu çıkaracak risk. Public alpha büyümeden önce kapanmalı.
- P2: Sertleştirme, sürdürülebilirlik ve verimlilik. P0/P1 sonrasında planlanmalı.

### Önerilen yayın kapısı

Yeni mainnet kontrat sürümü veya geniş kullanıcı açılımı şu P0 kapıları kapanmadan yapılmamalı:

- Next/React yaması ve dependency yeniden denetimi.
- State büyümesi için input sınırı ve gerçek storage muhasebesi.
- wNEAR fon koruma akışının yeniden tasarlanması ve sandbox invariant testleri.
- Tek, hash doğrulamalı CI WASM artifact’ı ile fail-closed deploy/migration.
- Legacy query-secret trafiğinin kapatılması veya güvenli, süreli migrasyonla hiçbir request/log yüzeyine anahtar düşmediğinin kanıtlanması.

## 3. İnceleme yöntemi ve sınırlar

### Yapılanlar

- Repo modülleri, paket manifestleri, lock dosyaları, CI ve deploy betikleri okundu.
- Web lint, Vitest, normal Next build, Web4 static export ve Playwright smoke çalıştırıldı.
- Dört Worker için TypeScript check ve Vitest çalıştırıldı.
- Üç NEAR kontratı için Cargo testleri; NFT kontratı için sandbox testleri çalıştırıldı.
- npm production ve full dependency auditleri incelendi.
- youtick.net üzerinde salt-okunur HTTP süreleri, cache/header davranışı ve asset boyutları ölçüldü.
- Güncel Vercel, Cloudflare, NEAR ve NEP kaynakları araştırıldı.
- Sınırlı secret pattern taraması yapıldı; izlenen dosyalarda açık secret bulunmadı.

### Yapılmayanlar

- Üretime yazan işlem, gerçek satın alma, upload, takedown veya anahtar rotasyonu yapılmadı.
- Canlı sisteme yük veya saldırı testi uygulanmadı.
- Haricî profesyonel akıllı kontrat denetimi yapılmadı.
- cargo-audit, cargo-deny, gitleaks, Trivy ve Semgrep araçları ortamda olmadığı için bu taramalar çalıştırılmadı.
- Canlı kontrat code hash’i, state snapshot’ı ve deploy key yönetimi doğrulanmadı.
- Playwright testi mocked/smoke düzeyinde; gerçek mainnet upload-buy-watch zinciri değildir.

Bu nedenle rapordaki canlı süreler anlık gözlemdir; kapasite sonucu veya SLO kanıtı değildir.

## 4. Doğrulama tabanı

### Yerel sonuçlar

| Yüzey | Sonuç |
| --- | --- |
| Web lint | Geçti |
| Web Vitest | 33 dosya, 265 test geçti |
| Web Playwright smoke | 2 test geçti |
| Next normal build | Geçti |
| Web4 static export | Geçti; static export header uyarısı ve Sentry dynamic dependency uyarısı verdi |
| KMS Worker | Check geçti, 48 test geçti |
| Web4 Proxy Worker | Check geçti, 17 test geçti |
| Storage API Worker | Check geçti, 29 test geçti |
| Media Delivery Worker | Check geçti, 16 test geçti |
| NFT kontratı unit | 49 test geçti |
| NFT kontratı sandbox | 31 test geçti, yaklaşık 261 saniye |
| Access Control kontratı | 8 test geçti |
| Operator Registry kontratı | 4 test geçti |
| Docs build | Geçti; 500 KB üstü VitePress chunk uyarısı verdi |
| Wiki check | Geçti, sıfır uyarı |

Toplam gözlenen başarılı test sayısı 469’dur. Bu sayı güvenlik kanıtı değildir; mevcut testlerin doğruladığı davranışların toplamıdır.

### Canlı ve bundle ölçümleri

| Ölçüm | Gözlem |
| --- | --- |
| youtick.net ana sayfa TTFB | Yaklaşık 0,28–0,32 saniye |
| Canlı proxy cache | HIT gözlendi; age ve immutable asset cache başlıkları mevcut |
| Ana sayfa asset sayısı | 19 JS/CSS asset |
| Canlı ana sayfa decoded asset | Yaklaşık 1,40 MB |
| Canlı ana sayfa wire | Yaklaşık 432 KB |
| Yerel Web4 ana sayfa | Yaklaşık 364 KB Brotli |
| Yerel Web4 discover | Yaklaşık 371 KB Brotli |
| Yerel Web4 watch | Yaklaşık 523 KB Brotli |
| Yerel Web4 upload | Yaklaşık 378 KB Brotli |
| Ortak Sentry içeren parça | Yaklaşık 106 KB Brotli |
| KMS-A deep health | Yaklaşık 2,3 saniye; 4 RPC’nin 3’ü sağlıklı |
| Storage provider health | ready true; fakat gerçek Lighthouse veri çağrısı yapmıyor |

Ana sonuç: Statik HTML ve edge cache hızlıdır. Baskın darboğaz sunucu render süresinden çok istemci başlangıç maliyeti, NEAR/KMS ağ fan-out’u, medya failover çoğaltması ve Worker bellek davranışıdır.

## 5. Öncelikli risk kaydı

| Kimlik | Öncelik | Alan | Bulgu | Ana etki |
| --- | --- | --- | --- | --- |
| WEB-01 | P0 | Web | Next 16.1.6 ve RSC 19.2.3 etkilenen güvenlik aralığında | DoS, proxy bypass, SSRF, cache poisoning, XSS sınıfı riskler |
| WEB-05 | P0 koşullu | Claim | Legacy gift anahtarı query parametresinde kabul ediliyor | CDN/analytics/Sentry/referrer loglarına secret sızıntısı |
| NEAR-01 | P0 | Kontrat | Sabit depozito ve sınırsız input gerçek state maliyetini karşılamıyor | Kontrat bakiyesinin storage’a kilitlenmesi, ekonomik DoS |
| NEAR-02 | P0 | Kontrat | wNEAR unwrap sonrası callback başarısızlığında iade garantisi yok | Kullanıcı fonunun kontratta sıkışması |
| REL-01 | P0 | Yayın | CI artifact’ı ile deploy WASM ayrık; migrasyon hatası yutuluyor | Yanlış kod, kalıcı deserialization arızası, sahte başarılı deploy |
| NEAR-03 | P1 | Kontrat | Stablecoin excess refund ve pool withdrawal XCC sonucu izlemiyor | Token iade/muhasebe kaybı |
| NEAR-04 | P1 | Kontrat/KMS | Pause mevcut grant ve operator erişimini durdurmuyor | Acil durdurmanın etkisiz kalması |
| NEAR-05 | P1 | Kontrat | Mint/grant indeksleri O(n), toplam büyüme O(n²) | Gas tavanı, satış ve playback doğrulama kesintisi |
| NEAR-06 | P1 | Kontrat | 50 anahtarlık batch 1.000 Tgas callback bütçesi ilan ediyor | 300 Tgas protokol sınırında çalışmayan özellik |
| NEAR-07 | P1 | Registry | Threshold aktif operator sayısından kopabiliyor | Erişilemez 3-of-5 konfigürasyonu |
| NEAR-08 | P1 | Standart | NEP-171 iddiası custom soulbound arayüzle uyuşmuyor | Wallet/indexer uyumsuzluğu ve yanlış ürün beyanı |
| WRK-01 | P1 | KMS | Beş operator aynı Cloudflare yönetim alanında | Tek hesap/CI/sağlayıcı arızası |
| WRK-02 | P1 | Worker state | KV nonce, challenge, rate-limit, idempotency için atomik değil | Replay, çift upload, kota aşımı |
| WRK-03 | P1 | KMS/RPC | İlk playback yaklaşık 60 RPC alt isteğine çıkabiliyor | Gecikme, maliyet, rate-limit ve ortak güven kökü |
| WRK-04 | P1 | Storage | 100 MB multipart gövde iki kez belleğe yaklaşıyor | 128 MB isolate sınırı ve 1102 |
| WRK-05 | P1 | Web4 | NEAR RPC ve Crust relay method/path/body sınırı zayıf | Maliyet ve DoS amaçlı açık sabit-hedef relay |
| WRK-06 | P1 | Media | Cache key query ile sınırsız çoğaltılabilir | Cache bypass ve origin egress artışı |
| WRK-07 | P1 | Media | Integrity tam gövdeyi buffer ediyor; bozuk ilk gateway’de duruyor | Bellek baskısı ve gereksiz playback kesintisi |
| WRK-08 | P1 | Media/Web | Browser ve Worker aynı segmenti ayrı hedge ediyor | Çift origin download ve gereksiz egress |
| WEB-02 | P1 | Onboarding | Private function-call key istemciye veriliyor; Turnstile fail-open | Botların ekonomik capability toplaması |
| WEB-03 | P1 | Web | Global provider ve monitoring her rotada | Büyük başlangıç bundle ve gereksiz RPC |
| WEB-04 | P1 | CSP | unsafe-inline ve geniş https kaynakları | XSS etkisini azaltan katmanın zayıflaması |
| WEB-06 | P1 | Upload | 500 MB dosya hattı bütün veriyi ve kopyaları bellekte tutuyor | Mobil/Safari tab crash, OOM ve uzun görevler |
| WEB-07 | P1 | Watch | Event ve ticket view’ları birden fazla bileşende tekrar çağrılıyor | Time-to-first-playable ve RPC maliyeti |
| WEB-08 | P1 | Fiyat | Fallback sağlayıcılar sıralı; hata halinde sabit 5 dolar fail-open | 15 saniye bekleme ve yanlış paid listing fiyatı |
| WEB-09 | P1 | Anahtar | Managed guest full key plaintext localStorage’da | XSS/extension compromise ile kalıcı hesap ele geçirme |
| CRYPTO-01 | P1 | Medya | AES-CTR içerik bütünlüğü sağlamıyor | Şifreli içeriğin fark edilmeden değiştirilmesi |
| CI-01 | P1 | CI | E2E, Web4 build, audit, secret, gas/storage, bundle kapıları yok | Yeşil CI ile kritik regresyon geçebilmesi |
| OPS-01 | P2 | Health | Health uçları pahalı veya yanlış-yeşil | Alarm yorgunluğu ve geç arıza tespiti |
| OPS-02 | P2 | KMS | Share rotation/backup aracı ve restore tatbikatı eksik | Eski share ve geri döndürülemez medya riski |
| ARCH-01 | P2 | Repo | Paketler ayrı lock ve sürüm politikasında | Dependency drift ve tekrarlı bakım |
| NEAR-09 | P2 | View | Pagination ve istatistikler O(N) | State büyüdükçe RPC/gas gecikmesi |
| DOC-01 | P2 | Doküman | Docs/MCP geliştirme zincirlerinde açık dependency bulguları | Geliştirici ve lokal araç yüzeyi |

## 6. P0 bulguların ayrıntısı

### WEB-01 — Next.js ve React Server Components güvenlik yaması

Repo kilidi Next.js 16.1.6 ve React 19.2.3 kullanıyor. Vercel’in 7 Mayıs 2026 güvenlik sürümü, Next 16.x için 16.2.5 ve altını; RSC 19.2.x için 19.2.5 ve altını etkilenen aralık olarak bildiriyor. Düzeltmeler en az Next 16.2.6 ve RSC 19.2.6 ile geldi; mevcut registry latest sürümleri daha ileride.

Etkilenen sınıflar middleware/proxy bypass, DoS, SSRF, cache poisoning ve XSS içeriyor. Web4 static export bazı server-only yolları daraltsa da repo aynı Next uygulamasının server/API yüzeylerini de taşıyor; ayrıca üretici açıkça WAF’ın tam çözüm olmadığını belirtiyor.

Kanıt:

- [apps/web/package.json](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/package.json)
- [apps/web/package-lock.json](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/package-lock.json)
- [Vercel Mayıs 2026 güvenlik sürümü](https://vercel.com/changelog/next-js-may-2026-security-release)

Eylem:

1. Next ve React/RSC’yi en son uyumlu patch seviyesine yükselt.
2. Lock dosyasını yeniden üret; npm audit production sonucunu sıfır yüksek bulgu hedefiyle tekrar çalıştır.
3. Normal build, Web4 export, Vitest ve Playwright smoke’u birlikte çalıştır.
4. Proxy/cache/auth route regresyon testleri ekle.

Kabul:

- Kilitli Next sürümü 16.2.6 veya üstü, RSC 19.2.6 veya üstü.
- npm audit production çıktısında Next/RSC kaynaklı high bulgu yok.
- İki build modu ve 267 web testi/smoke geçiyor.

### NEAR-01 — Gerçek storage maliyetini karşılamayan state büyümesi

Event alanları, profil alanları ve payment_id gibi kullanıcı kontrollü metinlerde yeterli byte sınırı yok. Event başlık ve açıklaması her ticket metadata’sına kopyalanıyor. NFT storage için sabit 0.01 NEAR, event için sabit 0.1 NEAR yaklaşımı gerçek storage farkına bağlı değil. Stablecoin ile mint yolu ek NEAR storage depozitosu alamıyor. Access Control owner grant vektörü de her kayıtla büyüyor.

Kanıt:

- [contracts/nft-ticket/src/market.rs:41](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/market.rs#L41)
- [contracts/nft-ticket/src/market.rs:596](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/market.rs#L596)
- [contracts/nft-ticket/src/market.rs:842](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/market.rs#L842)
- [contracts/nft-ticket/src/lib.rs:189](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/lib.rs#L189)
- [contracts/nft-ticket/src/views.rs:115](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/views.rs#L115)
- [contracts/access-control/src/lib.rs:179](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/access-control/src/lib.rs#L179)
- [NEAR storage saldırıları](https://docs.near.org/smart-contracts/security/storage)

Eylem:

1. Başlık, açıklama, CID, payment_id, profil ve grant sayısı için byte ve adet sınırı tanımla.
2. State değiştiren her yöntemde storage_usage öncesi/sonrası farkını ölç.
3. Pozitif farkı storage_byte_cost ile kullanıcıya yükle; fazlayı güvenli biçimde iade et.
4. Function-call key’in depozito bağlayamaması nedeniyle grant için ön ödemeli slot, sabit üst sınır ve expiry cleanup uygula.
5. Ticket metadata’sında event açıklamasını kopyalamak yerine event ID/CID referansı taşı.

Kabul:

- 100 KB, 1 MB ve 4 MB inputlar erken ve deterministik reddediliyor.
- 1, 100, 1.000 ve 10.000 kayıt testinde kullanılabilir kontrat bakiyesi saldırgan lehine azalmıyor.
- Her state büyümesi için storage invariant testi var.

### NEAR-02 — wNEAR unwrap callback fon koruma yarışı

Akış alınan wNEAR’ın tamamını near_withdraw ile yakıyor. Callback daha sonra event’i mutable state’ten yeniden okuyor ve event kaldırılmış/banlanmışsa ya da mint gas dışı kalırsa panic edebiliyor. Unwrap başarılıysa receiver kontratta artık resolver’ın kullanıcıya döndürebileceği wNEAR kalmayabilir; native NEAR ise YouTick kontratına geçmiş olur.

Kanıt:

- [contracts/nft-ticket/src/market.rs:694](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/market.rs#L694)
- [contracts/nft-ticket/src/market.rs:797](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/market.rs#L797)
- [contracts/nft-ticket/src/market.rs:957](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/market.rs#L957)
- [NEAR callback güvenliği](https://docs.near.org/smart-contracts/security/callbacks)
- [NEP-141](https://github.com/near/NEPs/blob/master/neps/nep-0141.md)

En küçük güvenli tasarım: wNEAR’ı unwrap etmeden stablecoin benzeri creator balance muhasebesine geçirmek, mint’i senkron tamamlamak ve kullanılmayan tutarı NEP-141 resolver’a döndürmektir.

Unwrap ürün gereği korunacaksa:

- Immutable purchase snapshot ve kalıcı pending purchase kaydı oluştur.
- Callback’i private, sonuç kontrollü ve panic-free yap.
- Her başarısız dalda native NEAR iadesini güvenli callback/retry ile tamamla.
- Aynı ödeme için tek completion/idempotency invariantı kur.

Kabul:

- Mock wrap.near ile unwrap başarılı/başarısız senaryoları var.
- Event remove, ban ve gas sınırı callback aralığında simüle ediliyor.
- Her dalda kullanıcı + kontrat + creator toplam fon invariantı korunuyor.

### REL-01 — Test edilen ve deploy edilen WASM aynı artifact değil

CI raw cargo wasm build çalıştırırken mainnet deploy betiği cargo-near tarafından üretilen target/near/youtick_nft.wasm dosyasını tüketiyor. Artifact upload, hash manifesti ve provenance yok. Betik doğrudan mainnet/youtick.near varsayıyor; deploy ile migrate ayrı transaction ve bazı deserialization/method hataları yakalanıp süreç başarılı bitiriliyor.

Kanıt:

- [.github/workflows/ci.yml:349](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/.github/workflows/ci.yml#L349)
- [scripts/deploy-nft-mainnet.mjs:8](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/scripts/deploy-nft-mainnet.mjs#L8)
- [scripts/deploy-nft-mainnet.mjs:17](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/scripts/deploy-nft-mainnet.mjs#L17)
- [scripts/deploy-nft-mainnet.mjs:64](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/scripts/deploy-nft-mainnet.mjs#L64)
- [contracts/nft-ticket/src/migrate.rs:49](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/migrate.rs#L49)
- [docs/operations/mainnet-deploy-runbook.md:53](operations/mainnet-deploy-runbook.md#L53)
- [NEAR upgrade ve migration](https://docs.near.org/smart-contracts/release/upgrade)

Eylem:

1. CI’da tek kanonik ve mümkün olan en tekrarlanabilir production WASM build’i oluştur.
2. Commit SHA, toolchain, WASM SHA-256 ve ABI bilgisini immutable artifact manifestine yaz.
3. Deploy yalnız CI artifact’ını ve beklenen hash eşleşmesini kabul etsin.
4. Network, contract, expected old hash ve exact confirmation zorunlu argüman olsun.
5. Migration hatası fatal olsun. Önceki WASM hash’i ve rollback prosedürü hazır tutulsun.
6. Büyük state migrasyonunu tek 300 Tgas tarama yerine versioned/chunked modele taşı.
7. Deploy sonrası RPC code hash, state invariant ve ABI smoke’u zorunlu yap.

## 7. NEAR ve sözleşme bulguları

### Stablecoin refund ve withdrawal

ft_on_transfer excess tutarı fire-and-forget ft_transfer ile iade etmeye çalışıp U128(0) dönüyor. Transfer başarısızsa standart resolver artık kullanılmayan tutarı geri veremez. USDC pool ledger XCC’den önce azaltılıyor ve callback restore yok; proposal XCC sonucu bilinmeden siliniyor. USDT komisyonu tutulduğu halde withdrawal yolu görünmüyor.

Kanıt:

- [market.rs:930](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/market.rs#L930)
- [tests.rs:681](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/tests.rs#L681)
- [treasury.rs:443](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/treasury.rs#L443)
- [timelock.rs:87](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/timelock.rs#L87)
- [treasury.rs:548](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/treasury.rs#L548)
- [NEAR FT standardı](https://docs.near.org/primitives/ft/standard)

Öneri: excess doğrudan resolver’a dönsün veya exact amount zorunlu olsun. Bütün withdrawal’lar pending → XCC → success commit / failure restore modeli kullansın. FT contract ID ledger anahtarına dahil edilsin.

### Pause semantiği

Access Control pause yalnız yeni grant issuance’ı engelliyor; verify_session_grant ve can_execute mevcut grant’lerde pause’u dikkate almıyor. Registry pause aktif operator listesini değiştirmiyor. KMS bu view’lara güveniyor ve olumlu sonucu 120 saniye cache’liyor.

Kanıt:

- [access-control/src/lib.rs:179](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/access-control/src/lib.rs#L179)
- [access-control/src/lib.rs:400](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/access-control/src/lib.rs#L400)
- [operator-registry/src/lib.rs:346](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/operator-registry/src/lib.rs#L346)
- [workers/youtick-kms/src/index.ts:757](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/youtick-kms/src/index.ts#L757)
- [workers/youtick-kms/src/index.ts:830](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/youtick-kms/src/index.ts#L830)

Öneri: Pause durumunda bütün authorization view’ları fail-closed dönsün; KMS aynı karar içinde pause truth’unu doğrulasın ve olumlu cache’i purge etsin.

### O(n²) indeksler ve 300 Tgas sınırı

Her mint owner token vektörünü, event token vektörünü; her grant owner grant vektörünü okuyup yeniden yazıyor. Tek işlem O(n), toplam büyüme O(n²). KMS hot path has_ticket de owner token’larını tarıyor. Gift ve onboarding batch’i 50 anahtar × 20 Tgas callback ile yalnız callback tarafında 1.000 Tgas ilan ediyor; protokol tavanı 300 Tgas.

Kanıt:

- [nft-ticket/src/nft.rs:11](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/nft.rs#L11)
- [nft-ticket/src/lib.rs:666](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/lib.rs#L666)
- [access-control/src/lib.rs:253](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/access-control/src/lib.rs#L253)
- [nft-ticket/src/lib.rs:1091](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/lib.rs#L1091)
- [nft-ticket/src/gift.rs:77](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/gift.rs#L77)
- [nft-ticket/src/onboarding.rs:57](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/onboarding.rs#L57)
- [NEAR gas](https://docs.near.org/protocol/transactions/gas)

Öneri:

- owner + event entitlement composite key ile has_ticket O(1) olsun.
- Persistent SDK collection ve benzersiz prefix kullan.
- Batch sınırı ölçülen küçük sayıya çekilsin veya cursor’lı chunk işlem kurulsun.
- 1, 100, 1.000, 10.000 kayıt gas/storage eğrisi CI bütçesine bağlansın.

### Registry threshold invariantı

Registry 3-of-5 ile sıfır operatör durumunda başlayabiliyor. Deactivate ID setini küçültmüyor; threshold doğrulaması aktif sayıyı değil tüm ID setini kullanıyor. Gerçek istemci ise yalnız aktif operatörleri çağırıyor.

Kanıt:

- [operator-registry/src/lib.rs:97](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/operator-registry/src/lib.rs#L97)
- [operator-registry/src/lib.rs:148](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/operator-registry/src/lib.rs#L148)
- [operator-registry/src/lib.rs:200](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/operator-registry/src/lib.rs#L200)

Kabul invariantı: 1 ≤ required_shares ≤ active_operators her state değişiminden sonra doğru kalmalı.

### NFT standardı ile ürün kararı

Kontrat custom soulbound ticket davranışı gösteriyor: nft_transfer panic ediyor, nft_transfer_call yok; buna rağmen approval state’i ve NEP-171 beyanları bulunuyor. Standard NFT iddiası ile devredilemez credential tasarımı aynı anda korunamaz.

Kanıt:

- [nft-ticket/src/nft.rs:3](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/nft.rs#L3)
- [nft-ticket/src/nft.rs:218](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/nft.rs#L218)
- [nft-ticket/src/nft.rs:253](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/nft.rs#L253)
- [docs/api/contract-methods.md:141](api/contract-methods.md#L141)
- [NEP-171](https://github.com/near/NEPs/blob/master/neps/nep-0171.md)

Karar:

- Soulbound credential ise NEP-171 ve transfer/approval iddialarını kaldır, custom standardı açık belgeleyip gereksiz state’i sil.
- Standart NFT ise near-contract-standards ile NEP-171/178 ve NEP-297 nft_mint event uyumluluğunu tamamla.

### Diğer kontrat tutarlılıkları

- Event removal events_price_usdc gibi yardımcı state’i temizlemiyor; CID reuse eski fiyatı geri getirebilir.
- Bazı direct/timelocked mint yolları cid_to_tokens indeksini doldurmuyor; takedown eksik kalabilir.
- Nominal pagination cursor’a kadar baştan tarıyor; total_count filtre için tüm event’leri geziyor.
- Purchase log sayacı artarken purchase_logs yazılmıyor; view ve count çelişiyor.
- get_creator_stats bütün event/ticket state’ini tarıyor, gift/admin mint’i satış gibi sayıyor ve stablecoin gelirini kapsamıyor.
- Upload-session refund state silindikten sonra callback/retry olmadan transfer ediliyor.

İlgili kanıt:

- [timelock.rs:250](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/timelock.rs#L250)
- [market.rs:144](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/market.rs#L144)
- [views.rs:46](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/views.rs#L46)
- [views.rs:81](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/views.rs#L81)
- [lib.rs:956](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/contracts/nft-ticket/src/lib.rs#L956)

### near-sdk sürüm stratejisi

Üç kontrat near-sdk 5.5.0 ve legacy feature kullanıyor. 18 Temmuz 2026 resmî release görünümünde latest 5.29.0’dır. Bu bulgu tek başına bilinen bir CVE iddiası değildir; uzun sürüm farkı, legacy collection düzeltmelerini ve bakım iyileştirmelerini kaçırma riskidir.

Doğrudan kör yükseltme yapılmamalı. Önce:

- Eski ve yeni SDK ile state serialization fixture karşılaştırması.
- Migration feature build ve production snapshot klonu.
- WASM boyut, gas ve storage farkı.
- Unit, sandbox ve ABI conformance.

Kaynak: [near-sdk-rs releases](https://github.com/near/near-sdk-rs/releases).

## 8. Workers güvenlik ve performans bulguları

### KMS operator bağımsızlığı

Shamir 3/5 paylaşım matematiği uygulanmış olsa da bütün operatörler aynı Cloudflare yönetim alanında. Tek hesap ele geçirilmesi, yanlış toplu deploy, CI secret sızıntısı veya hesap askıya alınması beşini birlikte etkiler.

Kanıt:

- [docs/public/transparency.md:15](public/transparency.md#L15)
- [workers/youtick-kms/wrangler.toml:33](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/youtick-kms/wrangler.toml#L33)
Öneri: En az üç operator farklı Cloudflare hesapları, deploy identity ve secret vault kullanmalı; mümkünse bir operator farklı sağlayıcı/control plane üzerinde olmalı. Registry geçişi kademeli ve audit log’lu yürütülmeli.

### KV atomik işlerde kullanılıyor

Nonce opsiyonel. Replay kontrolü, rate-limit, auth challenge tüketimi ve upload idempotency ayrı KV get/put işlemleriyle yürütülüyor. Cloudflare KV eventual consistency sağlar ve atomik read-modify-write için önerilmez.

Kanıt:

- [youtick-kms/src/index.ts:54](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/youtick-kms/src/index.ts#L54)
- [youtick-kms/src/index.ts:889](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/youtick-kms/src/index.ts#L889)
- [youtick-kms/src/index.ts:1558](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/youtick-kms/src/index.ts#L1558)
- [storage-api/src/index.ts:417](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/storage-api/src/index.ts#L417)
- [storage-api/src/index.ts:515](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/storage-api/src/index.ts#L515)
- [storage-api/src/index.ts:1035](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/storage-api/src/index.ts#L1035)
- [Cloudflare KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)

Hedef görev ayrımı:

- KV: read-heavy cache, config ve allow/deny list.
- SQLite-backed Durable Object: nonce, challenge, idempotency ve kesin küçük state transition.
- Workers Rate Limiting binding: yaklaşık abuse kontrolü; kesin para/kota muhasebesi değil.

Kabul: Aynı nonce/idempotency anahtarı ile 20 paralel ve farklı bölge isteği yalnız bir tüketim ve bir provider upload üretmeli.

### KMS RPC fan-out ve ortak güven kökü

Her KMS view çağrısı dört RPC endpoint’ini paralel çağırabiliyor. Retrieve sırasında session, ban, ticket ve creator kontrolleri ardışık. İstemci önce dört operator, 250 ms sonra beşinciyi başlatıyor. İlk cache-miss playback için üst sınır tahmini yaklaşık 60 RPC alt isteğidir.

Kanıt:

- [youtick-kms/src/index.ts:207](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/youtick-kms/src/index.ts#L207)
- [youtick-kms/src/index.ts:374](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/youtick-kms/src/index.ts#L374)
- [youtick-kms/src/index.ts:452](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/youtick-kms/src/index.ts#L452)
- [youtick-kms/src/index.ts:1838](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/youtick-kms/src/index.ts#L1838)
- [apps/web/lib/kms/client.ts:1139](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/kms/client.ts#L1139)

Öneri:

1. Ölçülen en iyi tek RPC ile başla; p95 bütçesi aşılınca ikinciyi hedge et.
2. Olumlu ticket sonucunda iki bağımsız final yanıt veya doğrulanabilir kanıt iste; ban any-true fail-safe kalabilir.
3. İstemci ilk anda tam üç operatörü çağırmalı; 4 ve 5 yalnız hata/gecikme sonrası.
4. Uzun vadede session, ban, ticket ve creator kararını tek authorization view’a birleştir.
5. Trace’e RPC call count, disagreement, finality, p50/p95/p99 ve cache age ekle.

### Storage Worker 100 MB bellek riski

Worker varsayılan 100 MB limiti istemciye yayıyor; request.formData ile bütün gövdeyi parse ediyor ve provider için ikinci FormData oluşturuyor. Web istemcisi zaten 4 MB parçalar üretiyor. Cloudflare isolate belleği 128 MB’dır.

Kanıt:

- [storage-api/src/index.ts:77](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/storage-api/src/index.ts#L77)
- [storage-api/src/index.ts:333](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/storage-api/src/index.ts#L333)
- [storage-api/src/index.ts:493](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/storage-api/src/index.ts#L493)
- [storage-api/src/index.ts:590](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/storage-api/src/index.ts#L590)
- [apps/web/hooks/useUpload.ts:23](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/hooks/useUpload.ts#L23)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

Öneri:

- Content-Length kontrolünü parse öncesine taşı.
- Parça üst sınırını mevcut davranışla uyumlu 4–8 MB yap.
- Uzunluğu bilinmeyen/chunked büyük isteği streaming parser yoksa reddet.
- R2 hot mirror gerekçelendirilirse kısa ömürlü presigned PUT ile Worker belleğini atla.
- Büyük video body’yi Storage API Worker üzerinden proxy eden tasarımı büyütme.

### Web4 açık relay yüzeyi

NEAR RPC yalnız cache edilecek view method’larını allowlist ediyor; diğer JSON-RPC method’ları yine sabit upstream’e geçiyor. Body tam okunuyor, boyut/timeout/rate-limit yok. Crust proxy geniş path ve method ile iletiyor. Bu kullanıcı kontrollü host SSRF değildir; sabit upstream’e kötüye kullanılabilir relay ve maliyet riskidir.

Kanıt:

- [web4-proxy/src/index.ts:123](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/web4-proxy/src/index.ts#L123)
- [web4-proxy/src/index.ts:309](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/web4-proxy/src/index.ts#L309)
- [web4-proxy/src/index.ts:351](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/web4-proxy/src/index.ts#L351)
- [web4-proxy/src/index.ts:382](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/web4-proxy/src/index.ts#L382)
- [web4-proxy/src/index.ts:393](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/web4-proxy/src/index.ts#L393)

Öneri: Exact RPC method/request type/contract/view method allowlist; transaction broadcast için ayrı auth route; JSON için 64 KB, Crust kontrol istekleri için 16–64 KB hard limit; upstream başına timeout ve toplam request budget.

### Media cache, integrity ve çift hedging

Media cache key bütün query parametrelerini korurken upstream yalnız pathname kullanıyor. Rastgele query aynı CID için sınırsız cache miss üretebilir. Integrity doğrulaması full body arrayBuffer alıyor; ilk 2xx gateway digest’i yanlışsa sonraki gateway denenmeden 502 dönüyor. Browser ayrıca Media Worker’ın kendi fallback zincirinin üstünde 150 ms aralıklı gateway hedging yapıyor.

Kanıt:

- [media-delivery/src/index.ts:102](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/media-delivery/src/index.ts#L102)
- [media-delivery/src/index.ts:140](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/media-delivery/src/index.ts#L140)
- [media-delivery/src/index.ts:169](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/media-delivery/src/index.ts#L169)
- [media-delivery/src/index.ts:336](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/media-delivery/src/index.ts#L336)
- [apps/web/lib/ipfs/gateway.ts:251](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/ipfs/gateway.ts#L251)
- [apps/web/lib/ipfs/gateway.ts:383](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/ipfs/gateway.ts#L383)
- [apps/web/lib/video-delivery.ts:22](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/video-delivery.ts#L22)

Öneri:

- Cache key’i normalize edilmiş pathname ve gerçekten gerekli allowlisted query ile oluştur.
- Event/root CID Cache-Tag ve global purge API kur.
- Digest mismatch’i gateway failure sayıp sonraki provider’ı dene.
- Doğrulanacak body için hard size sınırı; 4 MB chunk sözleşmesiyle hizala.
- Media Worker etkinse failover’ın tek sahibi Worker olsun; browser yalnız açık hata veya ölçülen p95 sonrası tek fallback yapsın.

### Onboarding capability dağıtımı

Web4 endpoint raw ed25519 private function-call key döndürüyor. Turnstile yalnız secret varsa çalışıyor; token GET query’de taşınıyor. Siteverify timeout, remoteip, hostname ve action kontrolü eksik. Rate-limit lokal Cache API sayacı.

Kanıt:

- [web4-proxy/src/index.ts:511](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/web4-proxy/src/index.ts#L511)
- [web4-proxy/src/index.ts:548](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/web4-proxy/src/index.ts#L548)
- [web4-proxy/src/index.ts:585](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/web4-proxy/src/index.ts#L585)
- [web4-proxy/src/index.ts:603](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/web4-proxy/src/index.ts#L603)
- [Cloudflare Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

Öneri: Production’da Turnstile secret yoksa fail-closed; GET yerine POST; remoteip/hostname/action/timeout; private key dağıtmak yerine sunucuda tek kullanımlık dar işlem imzalama. On-chain key izin ve ekonomik günlük limit ayrıca doğrulanmalı.

### Health ve observability

KMS health dört RPC, üç KV ve registry kontrolü yapıyor; halka açık ve rate-limit önünde. Web4 health origin’e dokunmadan ok dönebiliyor. Storage health secret/config varlığını kontrol ediyor ama gerçek provider erişimini ölçmüyor.

Öneri:

- Ucuz /live ve seyrek/cache’li/korumalı /ready veya /deep ayır.
- Worker route, colo, upstream, latency, cache, RPC disagreement, upload bytes, 1102 ve 429 alanlarıyla structured telemetry ekle.
- SLO’lar: playback authorization p95, ilk segment p95, upload completion p95, provider success, KMS quorum success, cache hit, RPC disagreement.
- [Cloudflare Workers observability](https://developers.cloudflare.com/workers/observability/) ile deployment marker ve percentile panelleri kur.

## 9. Web performans ve güvenlik bulguları

### Legacy gift secret query sızıntısı

Yeni GiftLinkGenerator fragment tabanlı bağlantı üretiyor; ancak claim rotası geriye dönük uyumluluk için secret ve key query parametrelerini de kabul ediyor. Query ilk HTTP isteğiyle edge/CDN, access log, analytics ve hata izleme yüzeylerine ulaşabilir. useEffect içindeki history.replaceState yalnız tarayıcı adresini sonradan temizler.

Kanıt:

- [apps/web/app/claim/page.tsx:35](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/claim/page.tsx#L35)
- [apps/web/components/GiftLinkGenerator.tsx:94](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/GiftLinkGenerator.tsx#L94)
- [apps/web/app/layout.tsx:160](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/layout.tsx#L160)
- [apps/web/instrumentation-client.ts:21](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/instrumentation-client.ts#L21)
- [apps/web/__tests__/integration/gift-claim-flow.test.ts:38](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/__tests__/integration/gift-claim-flow.test.ts#L38)

Karar:

- Legacy link kullanımı yoksa query fallback’i kaldır.
- Aktif eski link varsa kısa süreli edge migrationı yap: no-store, no-referrer, log redaksiyonu ve query’den fragment’e yönlendirme. Bitiş tarihi koy.
- Claim URL temizlenmeden analytics/Sentry başlatma.
- Sentry request URL ve breadcrumb’larında secret, key ve Turnstile parametrelerini maskele.
- Test yalnız fragment formatını başarılı kabul etsin.

Kabul: HAR, Cloudflare, GA ve Sentry örneklerinde anahtar hiçbir request URL’sinde görünmüyor.

### Global client maliyeti

Root layout her rotada wallet, query, optional EVM, dil, onboarding key başlangıcı ve analytics provider’larını yüklüyor. Ana ürün sayfalarının tamamı client boundary’den başlıyor. Dil provider’ı iki dil sözlüğünü, WalletProvider ise connector/auth/storage grafiğini global client bundle’a alıyor. Dört IPFS gateway için global preconnect var. Inline chunk reload script’i CSP unsafe-inline ihtiyacına katkı sağlıyor. Sentry client top-level import edildiği için monitoring kapalı olsa da büyük ortak chunk’a giriyor.

Kanıt:

- [apps/web/app/layout.tsx:99](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/layout.tsx#L99)
- [apps/web/app/layout.tsx:107](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/layout.tsx#L107)
- [apps/web/app/layout.tsx:115](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/layout.tsx#L115)
- [apps/web/app/layout.tsx:160](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/layout.tsx#L160)
- [apps/web/instrumentation-client.ts:1](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/instrumentation-client.ts#L1)
- [apps/web/next.config.ts:90](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/next.config.ts#L90)
- [apps/web/app/page.tsx:1](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/page.tsx#L1)
- [apps/web/components/providers/WalletProvider.tsx:3](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/providers/WalletProvider.tsx#L3)
- [apps/web/components/providers/LanguageContext.tsx:3](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/providers/LanguageContext.tsx#L3)

Eylem:

1. Sentry client’i build-time feature gate veya yalnız etkin DSN’de lazy import ile ayır.
2. EVM/wagmi/Defuse ve ödeme modüllerini yalnız ilgili rotada yükle.
3. Wallet ve onboarding provider’larını yalnız ihtiyacı olan route group’a taşı.
4. Preconnect’i gerçekten kullanılan birincil media host ile sınırla; diğerlerine dns-prefetch veya talep anında bağlantı.
5. Bundle bütçesi koy: ortak başlangıç JS ve route-specific JS ayrı takip edilsin.
6. Landing statik bölümlerini static/server component, yalnız CTA ve wallet etkileşimini client island yap.
7. Dil sözlüklerini locale bazında yükle.

Önerilen başlangıç hedefleri:

- Ana sayfa Brotli JS/CSS yüzde 25 azaltma: yaklaşık 364 KB → 275 KB altı.
- Watch başlangıç JS/CSS yaklaşık 523 KB → 400 KB altı.
- Monitoring kapalı build’de Sentry client ortak chunk’a girmemeli.

### Görsel dağıtımı

Web4’te global images.unoptimized kullanılıyor. Hero yaklaşık 626 KB, alt bölüm görseli yaklaşık 1 MB; png uzantılarına rağmen içerikleri JPEG ve hero için responsive sizes tanımı yok.

Kanıt:

- [apps/web/next.config.ts:44](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/next.config.ts#L44)
- [apps/web/components/landing/HeroSection.tsx:25](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/landing/HeroSection.tsx#L25)

Öneri: Build-time üretilmiş AVIF/WebP responsive varyantları veya Web4 uyumlu custom image loader. Mobil hero transferi için yaklaşık 150 KB altı başlangıç bütçesi.

### Onboarding her sayfada NEAR RPC üretiyor

OnboardingKeyInit her üretim sayfasında çağrılıyor, private function-call key’i sessionStorage’a yazıyor ve monitorTrialPool iki paralel NEAR view çağrısı yapıyor. Trial/claim dışındaki ziyaretçiler için bu iş gereksiz ağ ve capability yüzeyidir.

Kanıt:

- [apps/web/components/onboarding/OnboardingKeyInit.tsx:20](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/onboarding/OnboardingKeyInit.tsx#L20)
- [apps/web/components/onboarding/OnboardingKeyInit.tsx:74](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/onboarding/OnboardingKeyInit.tsx#L74)
- [apps/web/components/onboarding/OnboardingKeyInit.tsx:220](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/onboarding/OnboardingKeyInit.tsx#L220)
- [apps/web/app/api/onboarding-key/route.ts:95](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/api/onboarding-key/route.ts#L95)

Öneri: Yalnız trial/claim akışında ve kullanıcı aksiyonundan sonra başlat; capability private key dağıtımını kaldırma hedefiyle server-side tek işlem modeline geç.

### 500 MB browser upload bellek darboğazı

Ürün paid kullanıcıya 500 MB dosya sunuyor. Video Worker dosyanın tamamını arrayBuffer ile alıyor; MP4Box mdat verisini tutuyor. Main-thread fallback aynı davranışta. Segment kopyaları, payload birleştirme buffer’ları ve encrypted Blob’lar upload başlamadan önce birikebiliyor. Worker UI thread’ini rahatlatır; toplam browser heap tüketimini küçültmez.

Kanıt:

- [apps/web/components/UploadForm.tsx:27](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/UploadForm.tsx#L27)
- [apps/web/lib/video-delivery.worker.ts:95](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/video-delivery.worker.ts#L95)
- [apps/web/lib/video-delivery.ts:328](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/video-delivery.ts#L328)
- [apps/web/lib/video-delivery.ts:374](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/video-delivery.ts#L374)
- [apps/web/lib/video-delivery.ts:451](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/video-delivery.ts#L451)
- [apps/web/hooks/useUpload.ts:239](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/hooks/useUpload.ts#L239)

Öneri:

1. File.slice tabanlı artımlı MP4 parse.
2. En fazla 2–3 segmentlik bounded queue: package → encrypt → upload → release.
3. Bütün preparedSegments/files listesini bellekte tutmama.
4. Backpressure, abort cleanup ve idempotent resume.
5. Streaming tamamlanana kadar düşük bellekli/mobile cihazlarda üst limiti düşürme veya 500 MB desteğini desktop-only açıklama.

Kabul: 100 MB ve 500 MB gerçek dosyada Chrome heap ve Safari/iOS testi; peak heap dosyanın birkaç katına çıkmıyor, abort sonrası worker/buffer serbest kalıyor ve main-thread long task 50 ms altında kalıyor.

### Watch rotasında yinelenen RPC ve sıralı playback

Watch sayfası get_event, has_ticket ve creator profile çağırıyor. Creator works için önce count, sonra son 100 event alınıp client-side filtreleniyor. Player farklı query key ile has_ticket ve get_event çağrılarını tekrar ediyor; play tıklamasında event yeniden okunuyor. Ardından manifest ve KMS çözümü sıralı ilerliyor.

Kanıt:

- [apps/web/app/watch/page.tsx:60](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/watch/page.tsx#L60)
- [apps/web/app/watch/page.tsx:70](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/watch/page.tsx#L70)
- [apps/web/lib/hooks/useSessionState.ts:9](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/hooks/useSessionState.ts#L9)
- [apps/web/components/IpfsPlayer.tsx:239](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/IpfsPlayer.tsx#L239)
- [apps/web/components/IpfsPlayer.tsx:613](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/IpfsPlayer.tsx#L613)

Öneri: Tek canonical event ve access query key; event, manifestCid, accessMode ve hasAccess değerlerini player’a prop; manifest ve KMS authorization’ı metadata sonrası paralel; creator works için indexed get_events_by_creator view/indexer ve bu yan içeriği first-play yolundan erteleme.

Kabul: İlk watch yükünde get_event=1 ve has_ticket=1; play tıklamasında yeni get_event yok; son 100 event client taraması yok; time-to-first-playable p50/p95 izleniyor.

### Fiyat çözümleme gecikmeli ve finansal fail-open

Pyth başarısızlığından sonra Binance, CoinGecko ve CryptoCompare ayrı 5 saniye timeoutlarla sıralı deneniyor. Cache yoksa sabit 5 dolar dönüyor. Upload formu fiyatı mount ve dosya seçiminde ayrı çağırıyor.

Kanıt:

- [apps/web/lib/price.ts:47](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/price.ts#L47)
- [apps/web/lib/price.ts:127](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/price.ts#L127)
- [apps/web/components/UploadForm.tsx:88](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/UploadForm.tsx#L88)
- [apps/web/components/UploadForm.tsx:168](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/components/UploadForm.tsx#L168)

Öneri: Son bilinen fiyatı age bilgisiyle hemen göster; fallback sağlayıcılarını tek 2–3 saniyelik bütçede yarıştır; paid listing’de doğrulanmış güncel fiyat yoksa işlemi durdur; sabit fiyatı yalnız açık tahmini display için kullan; bütün tüketicileri tek React Query cache’ine bağla.

### Rate limiter güvenlik sınırı değil

Next API route’un in-memory/file RateLimiter uygulaması /tmp ve tek instance sınırını açıkça kabul ediyor; X-Forwarded-For güveni ayrıca edge’de normalize edilmezse spoof edilebilir. Turnstile secret yokluğunda doğrulama atlanıyor.

Kanıt:

- [apps/web/lib/rate-limiter.ts:1](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/rate-limiter.ts#L1)
- [apps/web/app/api/onboarding-key/route.ts:16](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/api/onboarding-key/route.ts#L16)
- [apps/web/app/api/onboarding-key/route.ts:25](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/api/onboarding-key/route.ts#L25)
- [apps/web/app/api/onboarding-key/route.ts:41](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/app/api/onboarding-key/route.ts#L41)

Öneri: Rate-limit’i trusted edge ve account/capability anahtarıyla uygula; ekonomik işlemlerde IP tek güven sinyali olmasın.

### CSP ve static export header farkı

CSP script/style için unsafe-inline, connect/img/media için geniş https izinleri kullanıyor. Next Web4 static export sırasında headers uygulanmadığı uyarısını veriyor. Canlı youtick.net proxy güvenlik başlıklarını ekliyor; fakat doğrudan Pages/IPFS/near.page yüzeylerinde aynı koruma garanti değil.

Kanıt:

- [apps/web/next.config.ts:8](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/next.config.ts#L8)
- [workers/web4-proxy/src/index.ts:54](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/workers/web4-proxy/src/index.ts#L54)

Öneri:

- CSP’yi önce Report-Only ile gerçek provider listesine daralt.
- Inline script’i haricî hash’li asset veya nonce/hash modeline geçir.
- connect-src, media-src ve img-src exact host allowlist kullan.
- Doğrudan originleri erişimden kaldır veya aynı header politikasını ayrı doğrula.

### CSP ile browser key custody birlikte ele alınmalı

Managed guest/trial secret key plaintext localStorage’a yazılıyor ve trial signer genel receiver/action kullanımına açık. Buna karşılık signless function-call key ve upload-session key method, allowance ve TTL ile sınırlandırılmış; bu doğru örnektir. Geniş connect-src https ve persistent full key birleşimi, başarılı bir XSS veya kötü niyetli extension’ın etkisini büyütür.

Kanıt:

- [apps/web/lib/keystore-v7.ts:25](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/keystore-v7.ts#L25)
- [apps/web/lib/managed-near-account.ts:92](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/managed-near-account.ts#L92)
- [apps/web/lib/trial-wallet.ts:39](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/trial-wallet.ts#L39)
- [apps/web/lib/signless-access-key.ts:34](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/signless-access-key.ts#L34)
- [apps/web/lib/upload-session-manager.ts:76](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/lib/upload-session-manager.ts#L76)

Öneri: Managed full key yerine method/allowance sınırlı function-call key. Full key zorunluysa passkey/user-presence, non-extractable signer veya üçüncü taraf scriptsiz ayrı güvenli origin değerlendirmesi. Migration sonunda localStorage’da full-access secret kalmamalı.

### Medya şifreleme bütünlüğü

Repo known issues dokümanı medya içeriğinin AES-CTR ile şifrelendiğini ve authenticated integrity sağlamadığını açıkça kabul ediyor. CID/full-body hash bazı yüzeylerde bütünlük verir; Range ve segment düzeyinde aynı garantiyi sürekli sağlamaz. Uzun vadede versioned manifest ile AES-GCM veya XChaCha20-Poly1305 gibi authenticated encryption gerekir.

Kanıt:

- [docs/operations/known-issues.md:200](operations/known-issues.md#L200)
- [docs/operations/known-issues.md:235](operations/known-issues.md#L235)

Geçiş, mevcut videoları kırmamak için encryptionVersion, per-segment nonce/tag ve geriye dönük decoder ile yapılmalı. Media Worker anahtar veya plaintext görmemeli.

### Dependency bulguları

18 Temmuz 2026 npm audit sonuçları:

- Web production: 52 bulgu; 11 high, 38 moderate, 3 low.
- Web tüm zincir: 60 bulgu; 3 critical, 14 high, 40 moderate, 3 low.
- Worker paketlerinin her biri: 6 bulgu; 5 high, 1 low. Bunlar ağırlıkla Wrangler/Miniflare/Vite geliştirme-test zincirinde.
- MCP server: 13 bulgu; eski MCP SDK’da DNS rebinding high dahil.
- Docs: 15 bulgu; Mermaid/DOMPurify/lodash/Rollup/Vite zinciri.

Vitest critical bulguları 4.0.0–4.0.x UI/network veya Windows browser mode koşullarına bağlıdır; CI’ın normal run modu doğrudan aynı saldırı yüzeyi değildir. Bu ayrım güncellemeyi ertelemek için değil, önceliği doğru vermek içindir.

Öneri:

- P0: Next/React.
- P1: Web production high zinciri ve MCP SDK.
- P2: Wrangler, docs ve dev araçları; dev server/UI’ları internete açmama.
- Dependabot/Renovate ile ayrı paketleri ortak security policy’de izleme.

## 10. CI ve test mimarisi

### Mevcut güçlü taraf

- Web, dört Worker ve üç kontrat için yerel test tabanı geniş.
- NFT sandbox testleri gerçek protokol davranışına yaklaşan önemli bir katman.
- Web normal build ve Web4 export ayrı script olarak mevcut.
- Worker check + test ayrımı temiz.

### Kritik boşluklar

CI web job’u lint, Vitest ve normal build çalıştırıyor; Playwright smoke ve Web4 export zorunlu değil. Vitest coverage yalnız lib altındaki TypeScript dosyalarını ölçüyor; TSX sayfa/bileşen/hook/API yüzeyleri kapsam dışında. Gift integration testi eski query-secret formatını geçerli davranış olarak bekleyerek URL sızıntısı regresyonunu maskeleyebilir.

Kanıt:

- [.github/workflows/ci.yml:119](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/.github/workflows/ci.yml#L119)
- [apps/web/vitest.config.ts:20](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/vitest.config.ts#L20)
- [apps/web/__tests__/integration/gift-claim-flow.test.ts:38](https://github.com/4rmus/youtick/blob/77224924425b2b73b2d076f9663ec2d63aeb120d/apps/web/__tests__/integration/gift-claim-flow.test.ts#L38)

CI ayrıca şu kapılara sahip değil:

- npm audit ve Rust advisory/policy.
- Secret scan.
- cargo fmt, clippy, audit/deny.
- Reproducible WASM artifact/hash.
- Migration feature build ve state snapshot testi.
- Contract gas/storage regression bütçesi.
- Frontend bundle budget ve Lighthouse/Web Vitals trendi.
- Worker bundle size, memory ve subrequest budget.
- Gerçek FT contract callback/refund sandbox testi.
- NEP conformance.
- Full upload → buy → watch → takedown staging smoke.

Change filter’ları scripts, mcp-servers ve bazı root/security yapılandırmalarını kapsamadığı için deploy scripti değişirken anlamlı testlerin tamamı atlanabilir.

### Önerilen CI sırası

1. Hızlı statik kapı: lint, fmt, clippy, type-check, secret scan.
2. Dependency kapısı: production high/critical deny; dev bulgular için süreli istisna dosyası.
3. Unit/integration: mevcut testler.
4. Web dağıtım: normal build + Web4 export + bundle budget + Playwright smoke.
5. Contract: unit + sandbox + real FT mocks + gas/storage invariant + migration snapshot.
6. Artifact: tek canonical WASM, hash manifest, SBOM/provenance.
7. Staging: upload-buy-watch-takedown ve KMS quorum/failover.
8. Mainnet approval: exact artifact hash, target account, old code hash, rollback hash.

## 11. Hedef mimari

Mevcut storage, delivery ve access ayrımı korunmalı; yeni bir mega Worker veya tek merkezi backend eklenmemeli.

    Browser
      |
      +-- Static UI --> Web4 Proxy --> Pages / Web4 origin
      |
      +-- Upload control --> Storage API
      |                      |
      |                      +-- Durable Object: intent, nonce, idempotency
      |                      +-- Lighthouse persistence
      |                      +-- Crust fallback
      |
      +-- Encrypted media --> Media Delivery
      |                       |
      |                       +-- canonical cache key + global purge tag
      |                       +-- Lighthouse / Crust / IPFS fallback
      |                       +-- optional encrypted R2 hot mirror
      |
      +-- Access request --> Independent KMS A..E
                              |
                              +-- Access Control / NFT / Registry final views
                              +-- staged RPC quorum, measured hedging

Mimari ilkeler:

1. Lighthouse kalıcı encrypted persistence adayıdır; KMS yerine geçmez.
2. Storage API kontrol düzlemidir; büyük video body proxy’si olmamalıdır.
3. Media Delivery dağıtım düzlemidir; AES key/share veya plaintext görmemelidir.
4. KMS access truth düzlemidir; operatorlar yönetimsel olarak bağımsız olmalıdır.
5. KV cache/config içindir; atomik state transition Durable Object’a taşınmalıdır.
6. R2 yalnız ölçülen egress/latency gerekçesi varsa encrypted hot mirror’dır.
7. D1 bugün gerekli değildir; ancak sorgulanabilir takedown/provider job/audit geçmişi ürün gereği olursa eklenebilir.
8. Failover’ın her kaynak türünde tek sahibi olmalıdır; browser ve Worker aynı isteği bağımsız hedge etmemelidir.

## 12. Darboğaz haritası ve ölçüm planı

| Darboğaz | Bugünkü tetikleyici | Beklenen belirti | İzlenecek metrik | Hedef |
| --- | --- | --- | --- | --- |
| Web başlangıç bundle | Global providers ve Sentry | Yavaş mobil parse/hydration | Route Brotli JS, long task, INP | Ana sayfa 275 KB altı |
| Onboarding RPC | Her production route | Gereksiz NEAR trafik | Ziyaret başına RPC count | Trial dışı sıfır |
| Browser upload heap | 500 MB tam buffer + segment kopyaları | Tab crash/OOM | Peak heap, long task, abort cleanup | 2–3 segment bounded |
| Watch tekrarları | Event/ticket aynı ekranda tekrar okunuyor | Geç first-playable | View count, first-playable p95 | get_event=1, has_ticket=1 |
| Fiyat fallback | 3 sağlayıcı × 5 sn sıralı | 15 sn gecikme/yanlış fiyat | Price age, fallback latency | 2–3 sn total, stale fail-closed |
| KMS RPC fan-out | 5 operator × 4 RPC × ardışık view | Playback authorization gecikmesi | RPC count, disagreement, p95 | Normalde tek RPC/operator |
| KMS operator fan-out | 4 hemen + 5. hedge | Fazla subrequest | Operator request count | 3 normal, 4/5 hata sonrası |
| Contract owner/event Vec | State büyüdükçe tam vektör yazma | Gas artışı ve OOG | gas per mint/grant | N’den bağımsız hot path |
| 50 key batch | 20 Tgas callback/key | 300 Tgas üstü | receipt gas | Ölçülen küçük batch |
| Storage multipart | 100 MB formData | 1102/memory | Memory P99/P999, 1102 | 4–8 MB part |
| Media full buffer | Raw full GET integrity | Isolate bellek baskısı | Body bytes, memory | Chunk hard limit |
| Query cache explosion | Rastgele query | Cache miss/egress | normalized key miss | 100 varyant = 1 fetch |
| Çift media hedging | 150 ms browser + Worker fallback | Aynı segment çift indirme | origin fetch/segment | 1 normal fetch |
| Deep health | Her monitor 4 RPC + KV | Maliyet ve alarm gecikmesi | health subrequest/latency | Ucuz live, seyrek deep |
| Migration full scan | Tüm event tek çağrı | 300 Tgas OOG | migration gas/chunk | Cursor’lı bounded chunk |

## 13. Uygulanabilir yol haritası

### Faz 0 — 0–72 saat: yayın engelleri

1. Next/React patch ve production dependency audit.
2. Mainnet deploy betiğini geçici olarak exact confirmation ve hash olmadan çalışmayacak hale getir.
3. wNEAR yeni alım akışını güvenli çözüm çıkana kadar feature gate/pause kararıyla sınırla.
4. Contract input boyutlarını ve en riskli state growth yollarını sert sınırla.
5. Web4 RPC/Crust body/method/path allowlist ve timeout ekle.
6. Production Turnstile eksikse onboarding endpoint’i fail-closed olsun.
7. Legacy gift query-secret desteğini kapat veya süreli edge migration ve log redaksiyonu uygula.

Çıkış ölçütü: P0 testleri, iki web build’i, Worker testleri ve contract sandbox yeşil; deploy artifact hash zinciri gösterilebilir.

### Faz 1 — 1–2 hafta: para ve atomiklik

1. wNEAR tasarımını düzelt ve fon invariant sandbox suite’i ekle.
2. Stablecoin exact/refund ve bütün withdrawal callback restore akışlarını tamamla.
3. Storage delta muhasebesi ve input/grant limitlerini uygula.
4. Nonce/challenge/idempotency state’ini Durable Object’a taşı.
5. Pause’u Access Control, Registry, KMS ve cache boyunca fail-closed yap.
6. CI’a dependency/secret/Web4/e2e/gas-storage kapıları ekle.
7. Managed guest full key saklama modelini dar kapsamlı function-call key veya user-presence signer’a taşı.

### Faz 2 — 2–4 hafta: performans ve ölçek

1. Sentry, EVM, wallet ve onboarding route-level lazy loading.
2. KMS tek-RPC-first ve 3-operator-first stratejisi.
3. O(1) entitlement ve bounded persistent collection migrationı.
4. Storage part limitini 4–8 MB; media integrity hard limitini 4 MB sözleşmesiyle hizala.
5. Media cache canonicalization, digest fallback ve tek failover sahibi.
6. live/ready/deep health ayrımı ve structured traces.
7. Browser upload’ı 2–3 segment bounded streaming kuyruğuna çevir.
8. Watch event/access sorgularını tekilleştir ve manifest/KMS hazırlığını paralelleştir.
9. Fiyat fallback’lerini tek bütçede yarıştır; paid listing’i stale/sabit fiyatta fail-closed yap.

### Faz 3 — 4–8 hafta: güven alanları ve recovery

1. KMS operatorlarını ayrı account/provider/CI/vault alanlarına dağıt.
2. Share re-encryption aracı, bağımsız şifreli backup ve restore tatbikatı.
3. Event-aware global purge/takedown zinciri.
4. Authenticated media encryption için versioned manifest pilotu.
5. Contract deploy governance: multisig/timelock veya açıkça belgelenmiş kilit politikası.
6. near-sdk kademeli migration ve NEP ürün kararının uygulanması.

### Faz 4 — 8–12 hafta: production readiness kanıtı

1. Staging’de gerçek upload-buy-watch-takedown zinciri.
2. KMS iki operator ve bir control-plane kaybı tatbikatı.
3. 1/100/1.000/10.000 contract scale gas/storage testi.
4. Worker 4 paralel sınır upload, cache stampede ve gateway corruption testi.
5. SLO ve hata bütçesi panelleri.
6. Bağımsız akıllı kontrat güvenlik denetimi ve bulgu kapanışı.

## 14. Kabul kriterleri

### Güvenlik

- Bilinen Next/RSC high güvenlik aralığı kapalı.
- npm production high/critical bulguları sıfır veya tarihli, sahibi belli istisna kaydında.
- Aynı nonce/idempotency ile 20 paralel istekte tek başarı.
- Gift secret hiçbir HTTP request URL, Cloudflare, GA veya Sentry kaydında görünmüyor.
- Managed account full-access secret localStorage’da bulunmuyor.
- Pause sonrası mevcut grant/KMS retrieval en geç tanımlı kısa cache penceresinde reddediliyor.
- wNEAR ve stablecoin bütün hata dallarında fon invariantı korunuyor.
- Secret scan ve deploy key dosya izin kontrolü CI’da.

### Performans

- Ana sayfa Brotli başlangıç varlığı 275 KB altı; watch 400 KB altı veya ölçümlü kabul gerekçesi var.
- Trial dışı rota başlangıcında onboarding RPC/capability çağrısı yok.
- 500 MB desktop upload bounded heap ile tamamlanıyor; düşük bellekli cihaz politikası açık ve test edilmiş.
- İlk watch yükünde get_event=1 ve has_ticket=1; play tıklamasında tekrar event view yok.
- Paid listing doğrulanmamış sabit fiyata dayanarak oluşturulamıyor.
- Normal playback authorization üç KMS ve operator başına tek tercih edilen RPC ile başlıyor.
- İlk segmentte normal durumda tek origin fetch.
- 100 query varyantı tek canonical media cache entry’ye denk geliyor.
- 4–8 MB parça üstünde Storage endpoint parse öncesi 413 veriyor.

### Kontrat ve yayın

- CI’ın ürettiği WASM SHA-256 ile mainnet deploy edilen code hash izlenebilir.
- Migration hatası non-zero exit ve otomatik yayın durdurma oluşturuyor.
- Previous code hash ve rollback prosedürü test edilmiş.
- 10.000 mint/grant testinde hot authorization path O(1) ve gas bütçesi içinde.
- NEP-171 veya custom soulbound ürün kararı doküman, ABI ve eventlerle tutarlı.

### Operasyon

- /live haricî bağımlılıksız ve ucuz; /ready gerçek gerekli bağımlılıkları; /deep seyrek sentetik işlevi ölçüyor.
- KMS quorum success, RPC disagreement, playback authorization, first segment, upload completion, cache hit ve provider status SLO’ları var.
- KMS share backup restore tatbikatı ve takedown global purge tatbikatı kayda alınmış.

## 15. Olumlu kontroller

İnceleme yalnız eksiklere odaklanmamalıdır. Mevcut güçlü taraflar:

- Worker upstream hostları sabit; doğrudan kullanıcı kontrollü host SSRF görülmedi.
- KMS signature, registry authority, CORS allowlist, AES-GCM share-at-rest ve share commitment doğrulaması olumlu.
- Ban/RPC hata davranışının önemli bölümü fail-closed tasarlanmış.
- Media path/CID doğrulaması, gateway timeout ve Range forwarding mevcut.
- Lighthouse API key browser’a çıkmıyor.
- Media Worker key share, AES key veya plaintext medya görmüyor.
- Web4 statik gövdeleri genel olarak stream ediyor ve canlı proxy security headers ekliyor.
- Yerel unit/integration/sandbox test tabanı güçlü ve modül sınırları okunabilir.
- Repo known-issues dokümanı merkezîleşme ve AES-CTR sınırlarını saklamadan belirtiyor.

## 16. Güncel resmî araştırma kaynakları

### NEAR

- [Security checklist](https://docs.near.org/smart-contracts/security/checklist)
- [Storage cost attacks](https://docs.near.org/smart-contracts/security/storage)
- [Cross-contract callback security](https://docs.near.org/smart-contracts/security/callbacks)
- [Collections](https://docs.near.org/smart-contracts/anatomy/collections)
- [Gas ve 300 Tgas sınırı](https://docs.near.org/protocol/transactions/gas)
- [Contract upgrade ve migration](https://docs.near.org/smart-contracts/release/upgrade)
- [Fungible token standardı](https://docs.near.org/primitives/ft/standard)
- [NEP-141](https://github.com/near/NEPs/blob/master/neps/nep-0141.md)
- [NEP-171](https://github.com/near/NEPs/blob/master/neps/nep-0171.md)
- [NEP-178](https://github.com/near/NEPs/blob/master/neps/nep-0178.md)
- [NEP-297](https://github.com/near/NEPs/blob/master/neps/nep-0297.md)
- [near-sdk-rs releases](https://github.com/near/near-sdk-rs/releases)

### Cloudflare

- [Workers limits ve 128 MB isolate belleği](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [Durable Object storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
- [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Cache-Tag purge](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/)
- [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Workers observability](https://developers.cloudflare.com/workers/observability/)
- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

### Web ve araç zinciri

- [Next.js Mayıs 2026 güvenlik sürümü](https://vercel.com/changelog/next-js-may-2026-security-release)
- [Vitest advisory GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp)
- [MCP SDK DNS rebinding advisory](https://github.com/advisories/GHSA-w48q-cv73-mx4w)

## 17. Son karar

YouTick’in temel yönü doğru: statik Web4 yüzeyi, ayrı storage kontrolü, ayrı encrypted media delivery ve 3/5 KMS access katmanı anlaşılır sorumluluk sınırları kuruyor. Sistemi yeniden yazmak veya tek bir merkezî backend’e toplamak gerekmiyor.

Öncelik daha fazla özellik değil; mevcut güven sınırlarını gerçek sistem özellikleriyle eşleştirmektir:

- Para akışlarında callback ve refund invariantı.
- State büyümesinde gerçek storage ekonomisi.
- KMS’de matematiksel eşik kadar yönetimsel bağımsızlık.
- Worker state geçişlerinde güçlü tutarlılık.
- Failover ve caching’de tek sahip.
- CI’dan mainnete kesintisiz artifact/hash kanıtı.
- İstemcide yalnız kullanılan özelliğin yüklenmesi.

Bu kapanışlardan sonra public alpha kontrollü büyütülebilir. P0’lar kapanmadan mainnet para akışını veya kullanıcı hacmini artırmak önerilmez.

## 18. Uygulama sonrası kapanış durumu — 18 Temmuz 2026

Bu bölüm raporun ilk ölçümünü değiştirmez; aynı gün uygulanan iyileştirmelerin yerel doğrulama durumunu kaydeder. Herhangi bir mainnet deploy yapılmadı. Bu nedenle aşağıdaki “kapandı” ifadeleri kod ve yerel test kapsamındadır; CI artifact’ının üretilmesi, onaylanması ve canlı hash doğrulaması ayrıca gereklidir.

### Kapanan bulgular

| Bulgu | Uygulanan kapanış |
|---|---|
| WEB-01 | Next 16.2.10, React/React DOM 19.2.7 ve eşleşen Next paketleri sabitlendi. Production build ve Web4 export geçti. |
| WEB-05 | Claim secret yalnız URL fragment’ından kabul ediliyor. Query-param ve HTTP(S) dışı URL’ler reddediliyor; fragment okunduktan sonra temizleniyor. |
| NEAR-01 | Event, profil, CID, metadata ve ödeme kimlikleri sınırlandı. Event/profil yazımları gerçek byte maliyetini tahsil ediyor; satın alma audit kaydı dahil bütün state artışı ölçülüyor ve bütçe üstünde işlem geri alınıyor. Token metadata’daki tekrar eden event açıklaması kaldırıldı. |
| NEAR-02 | Yeni wNEAR yolu unwrap callback’i kullanmadan senkron mint + token ledger muhasebesi yapıyor ve excess’i NEP-141 resolver’a döndürüyor. Eski sürümden bekleyen callback de hata halinde panik yerine wNEAR/native NEAR iadesi yapıyor. |
| REL-01 | CI tek canonical WASM ve SHA-256 manifest artifact’ı üretiyor. Deploy script’i network/contract/eski hash/açık onay/manifest doğrulaması istiyor, deploy sonrası code hash’i karşılaştırıyor ve migration hatasını yutmuyor. |
| NEAR-03 | Stablecoin excess doğrudan resolver’a dönüyor. Creator, USDC pool ve timelock’lu USDT/wNEAR commission withdrawal callback’leri başarısızlıkta ledger bakiyesini geri yüklüyor. |
| NEAR-04 | Access grant ve operator/relayer authorization view’ları pause sırasında fail-closed. |
| NEAR-06 | Gift ve onboarding batch üst sınırı 50’den 10’a indirildi; web doğrulaması aynı sınırla eşlendi. |
| NEAR-07 | Registry ilk operator ile geçerli 1/1 durumuna geliyor; threshold aktif operator sayısıyla eşleniyor ve gerekli share altına deactivation engelleniyor. |
| WRK-04 | Storage Worker varsayılan multipart sınırı 8 MB. `Content-Length` zorunlu ve `formData()` öncesi doğrulanıyor. |
| WRK-05 | Web4 NEAR RPC yalnız allowlist view çağrılarına açık; JSON/relay body 64 KB ile sınırlı. Crust relay exact PSA path ve method allowlist kullanıyor. |
| WRK-06 | Media cache key kullanıcı query parametrelerini taşımıyor; yalnız Worker’ın içerik versiyonu cache anahtarına giriyor. |
| WRK-07 | Integrity doğrulaması 8 MB ile sınırlı ve ilk gateway CID doğrulamasında başarısız olursa sıradaki gateway deneniyor. |
| WRK-08 | Media Worker yapılandırıldığında browser ayrıca origin hedge etmiyor; fallback’in tek sahibi Worker. |
| WEB-08 | Pyth sonrası fallback sağlayıcıları ortak 3 saniyelik bütçede yarışıyor. Güncel/doğrulanmış fiyat yoksa paid publish duruyor; sabit 5 dolar fail-open kaldırıldı. |
| NEAR-05 / NEAR-09 | Owner, CID, entitlement ve creator purchase/stat indeksleri kalıcı O(1) koleksiyonlara taşındı. 200 kayıtlık ardışık backfill/finalize migrasyonları eklendi; event pagination fiziksel slot penceresi kullanıyor. 100 ardışık mint için işlem başına 100 Tgas regresyon bütçesi test edildi. |
| NEAR-08 | Ürün sözleşmesi custom, non-transferable `youtick-ticket-1.0.0` olarak netleştirildi. Transfer ve approval ABI yüzeyi kaldırıldı; README, API ve hukuki metinler NEP-171/178 iddiasında bulunmuyor. |
| WRK-02 | Nonce, auth challenge, rate limit, idempotency ve onboarding signer lock state’i Durable Object transaction’larına taşındı. KV yalnız cache/veri kaydı rolünde kaldı. |
| WRK-03 | KMS authorization, event-ban ve access-pass kararını `get_playback_access_decision` tek kontrat snapshot’ından alıyor; tüm RPC’lere fan-out kaldırıldı ve ilk başarılı hedged RPC sonucu kullanılıyor. |
| WEB-02 | Private onboarding function-call key dağıtımı kaldırıldı. GET 410 dönüyor; tarayıcı yalnız allowlist işlem/argümanını POST ediyor, Turnstile + atomik kota/lock sonrası imza Node veya Web4 sunucu katmanında atılıyor. |
| WEB-03 | Global onboarding ve monitoring yükü kaldırıldı; EVM sağlayıcısı feature-flag ile dinamik. Kalan query/language/wallet sağlayıcıları global Navbar sözleşmesinin parçası. Web4 build için ölçülebilir Brotli bütçesi getirildi; güncel toplam 1.392.609 byte, en büyük chunk 215.532 byte. |
| WEB-04 | Web4 HTML yanıtlarında her istek için nonce üretilip script etiketlerine HTMLRewriter ile uygulanıyor; `script-src unsafe-inline` ve genel `https:` kaynakları kaldırıldı. Inline style yalnız görsel stil için kontrollü istisna olarak kaldı. |
| WEB-06 | Gerçekte streaming olmayan browser CMAF paketleme yolu 64 MB ile açıkça sınırlandı ve Worker aynı limiti enforce ediyor. Yanlış 500 MB ürün vaadi kaldırıldı; daha büyük dosya gelecekte server-side/presigned transcoding gerektirir. |
| WEB-07 | Watch rotasındaki canonical React Query event snapshot’ı player ve satın alma kartına aktarılıyor; iki alt bileşenin yinelenen `get_event` çağrıları kaldırıldı. |
| WEB-09 | Managed guest/trial full-access key’leri localStorage’dan sessionStorage’a taşındı. Eski kalıcı plaintext key okunduğunda kullanılmadan siliniyor. |
| CRYPTO-01 | Yeni segment ve init payload’ları bağımsız 96-bit IV + 128-bit tag ile AES-256-GCM olarak şifreleniyor. Manifest algoritmayı sürümlüyor; AES-CTR yalnız eski manifestleri okuyabilmek için tutuluyor. Tamper testi GCM değişikliğinin fail-closed olduğunu doğruluyor. |
| OPS-01 | KMS ve Storage için dış bağımlılıksız `/live`, gerçek yapılandırma/bağımlılık kontrolü yapan `/ready` ve seyrek sentetik `/deep` ayrımı eklendi. Eski health yolları uyumluluk alias’ı olarak kaldı. |
| ARCH-01 | Ayrı deploy edilen paketlerin ayrı lockfile tutması kanonik politika olarak belgelendi; Node 24 ve lockfile varlığı `check-dependency-policy.mjs` ile CI’da doğrulanıyor. |

### Kısmen kapanan veya operasyon kanıtı bekleyen bulgular

- CI-01: E2E, Web4 build, production audit, secret scan, dependency policy, bundle bütçesi, Rust fmt/clippy, sandbox, gas ölçek testi, WASM boyut bütçesi ve ABI hash’li canonical artifact kapıları kodda mevcut. Bunların GitHub Actions üzerindeki ilk temiz koşusu henüz bu çalışma kapsamında üretilmedi.
- REL-01: Yerel canonical WASM/ABI build ve deploy script doğrulandı; gerçek GitHub artifact’ı, kontrollü mainnet deploy ve deploy sonrası RPC hash kanıtı dış operasyon kapısıdır.
- OPS-02: Operatör başına şifreli KV backup, ayrı key-vault ve disposable namespace restore prosedürü `docs/operations/kms-share-recovery.md` içinde tanımlandı. Gerçek quarterly restore drill’i canlı operatör yetkisi gerektirdiği için uygulanmadı.
- DOC-01: Deploy edilen tüm npm yüzeylerinde critical production bulgusu sıfır ve CI audit kapısı var. Docs dev zinciri Mermaid 11.16’ya güncellendi; stabil VitePress zincirinde fix’i olmayan yalnız lokal dev-server odaklı 1 high / 3 moderate bulgu kaldı. Web’de wagmi 3 major gerektiren 1 high / 26 moderate waiver konusu devam ediyor.

### Bilinçli kapsam dışı ve dış operasyon kapıları

- WRK-01 kullanıcı kararıyla kapsam dışıdır; bağımsız KMS operatörü taşınması bu çalışmada yapılmadı.
- Büyük dosya (>64 MB) yükleme desteği güvenli olmayan browser yolunda açık bırakılmadı. Yeniden etkinleştirmek ayrı server-side/presigned transcoding projesidir.
- GitHub Actions, mainnet deploy/hash eşleşmesi ve gerçek KMS restore tatbikatı yerel kod değişikliğiyle kanıtlanamaz; yayın onayından önce ayrıca tamamlanmalıdır.

### Yerel doğrulama kanıtı

- Web: lint temiz; 34 dosyada 258 test geçti; Next production build ve Web4 export geçti. Bundle bütçesi 67 chunk / 1.392.609 Brotli byte toplam / 215.532 byte en büyük chunk ile geçti.
- Workers: Web4 23, media-delivery 18, KMS 48, storage-api 29 test; dört Worker type-check’i geçti.
- Contracts: nft-ticket 56, access-control 9, operator-registry 5 unit test; nft-ticket sandbox 31/31; Rust fmt, clippy ve cargo-near canonical WASM+ABI build geçti. WASM 2 MB bütçesinin altında.
- Supply chain: production `npm audit` sonucunda critical kalmadı. Kalan 1 high, wagmi 2’nin WalletConnect/Reown alt zincirindeki `ws` bulgusu; düzeltme wagmi 3 major migration’ı gerektirdiği için yayın öncesi açık waiver/migration kararı gerekir. Ayrıca 26 moderate bulgu bulunuyor.
- Yayın araçları: workflow YAML parse, deploy script syntax ve diff whitespace kontrolleri geçti.

### Güncel yayın kararı

WRK-01 hariç rapordaki kod düzeyi güvenlik/mimari açıkları kapatıldı veya güvenli bir üst sınırla devre dışı bırakıldı. Mainnet/public-alpha onayı yine verilmedi. En az bir temiz GitHub Actions koşusu, canonical WASM+ABI manifest/hash incelemesi, Durable Object migration’lı kontrollü Worker deploy’ları, kontrat migrasyon backfill’i, canlı RPC code-hash eşleşmesi ve KMS restore tatbikatı olmadan yayın tamamlanmış sayılmamalıdır.
