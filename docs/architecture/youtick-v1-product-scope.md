# YouTick V1 — ürün kapsamı ve açık sorumluluklar

27 Eylül 2026 · Gate: `YOUTICK_V1_PRODUCT_DOCUMENTATION` · **COMPLETED_WITH_WARNINGS**

## Amaç, kapsam ve kabul

Kontrollü cüzdan testnet pilotunu proje belgeleri, İngilizce/Türkçe landing,
kullanım koşulları ve gizlilik metninde aynı şekilde anlatmak.
Yalnız aşağıdaki metin/test dosyaları değiştirilebilir; ödeme/erişim mantığı, ücret hesapları,
kontratlar, flag/ağ varsayılanları, kaynak checkout ve global ayarlar kapsam dışıdır.
Kabul: hazır özelliklerle gelecek fazın ayrılması, pilot limit/ücret/çekim açıklaması,
hukuki/vergi rollerinin açık bırakılması, gerçek browser saklama bilgilerinin açıklanması,
hedefli testler ve yerel build. Bu belge hukuk onayı, yayın veya canlı kabul değildir.

## V1 ürün sınırı

| Konu | Kontrollü pilot |
|---|---|
| Giriş | Mevcut NEAR testnet cüzdanı |
| Bilet | Test USDC; en az 2 test USDC |
| Üretici yayını | Gerekli hakların beyanı, ayrı yükleme teklifi, cüzdan onayı, Livepeer işleme ve doğrulanmış yayın |
| Limit | Public-testnet politika için 5 GB; 24 saatlik yayın son tarihi yeniden başlatılamaz |
| Ücretler | Yükleme ayrı; varsa sponsor ücreti onay öncesi gösterilir; test NEAR ağ ücreti gerekebilir |
| Üretici payı | Kaynak kodda %95 üretici bakiyesi / %5 YouTick ücreti; landing hesabı örnek test tokenı simülasyonu |
| Çekim | Mevcut NEAR üretici bakiyesinden üreticinin kendi cüzdanına; banka ödemesi değil |
| Erişim | Bilet/entitlement doğrulamasından sonra oynatma; cihazın 30 günlük yetkisi bilet hakkının süresi değildir |
| Gelecek | Google/passkey sosyal giriş, kart ödeme ve banka payout V1'de sunulmuyor |

Test tokenlarının gerçek değeri yoktur; gerçek para ile ticari açılış ayrı bir gate.
Kaynak %5 oranı güncel canlı kontrat oranını kanıtlamaz. Limitler/özellikler kaynak politikasından
okundu; bu gate hosted pilotun açık veya çalışır olduğunu göstermiyor.
Başarılı yayın sürekli erişilebilirlik veya ömür boyu saklama vaadi değildir.
120 dakikalık video geçmişteki sınırlı yükleme örneğidir; kaynakta uygulanmış süre limiti
veya kesintisiz iki saat oynatma kanıtı olarak kullanılmaz.

## YouTick'in fiilî rolü

YouTick yayın/bilet arayüzünü ve erişim kontrol akışını işletir, platform ücretini kaynak modelde alır.
NEAR ödeme, iş, yayın ve entitlement otoritesidir; Livepeer medya işleme/aktarımı,
Cloudflare web ve Bridge kontrol hizmetlerini sağlar. YouTick'in bu faaliyetleri
“yalnız aracı, hiçbir sorumluluğu yok” şeklinde anlatılmaz.

Ticari satıcı/seller-of-record, merchant-of-record, vergi/KDV, fatura ve iade sorumluları
kesinleşmiş değildir. Bu soru kripto ile gerçek para satışına da uygulanır.
Önceki işletmeci kaydı şirket adını YOUTICK LTD olarak verir; bu gate güncel şirket
sicilini veya vergi yerleşimini doğrulamadı. Bir kayıtlı UK adresinden vergi yerleşimi çıkarılmaz.
Kart sağlayıcısı seçilmedi; sağlayıcı kabulü ve sanatçıya banka ödeme modeli yazılı teyit bekler.

## Kullanım koşulları ve iade sınırı

Yayıncı video/müzik/katılımcı haklarını sağlamalı ve orijinal dosyayı saklamalı.
Askıya alma/takedown ile Livepeer silme ayrı işlemlerdir; silme anında gerçekleşmeyebilir.
Tamamlanmış zincir işlemleri geri alınamayabilir. Mevcut akış işlenmiş yüklemeyi veya
iptal edilmiş işi otomatik iade etmez; reddedilmiş/yinelenen transferde token dönüşü
protokol davranışıdır, ticari iade garantisi değildir.
Genel “iade yok” veya kanuni tüketici haklarını kaldıran onay kullanılmadı.
Şikâyet: `contact@youtick.net`; içerik ihlali: `abuse@youtick.net`.

Gerçek para açılışından önce satıcı kimliği, vergi/fatura, iptal/iade ve ticari koşullar onaylanmalı.
Dijital içeriğin hemen sunulması için gereken tüketici bilgilendirme/onayı ayrıca tasarlanmalı;
bu gate yeni onay kutusu veya veri işleme davranışı eklemedi.

## Gizlilik: doğrulanan kaynak ve tamamlanacak bildirim

| Kategori | Kaynaktan doğrulanan davranış | Açık konu |
|---|---|---|
| Zincir | NEAR hesabı, işlemler ve kontrat kayıtları kamusal | Kullanıcıya açıklama ve taleplerin sınırları |
| Medya | Kaynak dosya doğrudan browser → Livepeer; Bridge kontrol ve herkese açık ilk-kare kapak servis eder | Provider saklama/silme süreleri ve anlaşmalar |
| IndexedDB | Cihaz anahtarları/sertifikalar, yetki bilgisi, watch progress | Gerçek kullanıcı saklama politikası ve silme/kurtarma yönlendirmesi |
| localStorage/sessionStorage | Upload taslağı/bookmark/tercihler, oturuma bağlı job key ve kurtarma kanıtı | Kategori bazında süreler ve bildirimin kapsamı |
| Token/telemetri | Kısa ömürlü playback token bellekte; yerel ölçüm console'da, player SDK koşullu Livepeer playback/session/cihaz tanılama gönderir | Gerçek network receipt, hosted log ve provider retention doğrulaması |
| Sunucu | Bridge job/kurtarma/kontrol kayıtları; operational log ve açık ise türetilmiş D1 katalog | Temizleme uygunluğu gerçek silinme kanıtı değildir |
| Alıcılar | Seçili wallet, NEAR RPC, Cloudflare ve Livepeer ilgili istek/metadatayı işleyebilir | Amaç bazlı hukuki dayanak, roller/DPA, transfer ve hak prosedürleri |

Browser verisini temizlemek kamusal zinciri silmez; anahtarları silmek upload/cihaz kurtarmasını bozabilir.
Kesin saklama günü, veri merkezi ülkesi, hukuki dayanak veya regulator kaydı uydurulmadı.
**Kamuya açık pilotta kişisel veri toplanmadan önce** nihai gizlilik bildirimi ve açık bilgiler
tamamlanmalıdır; bu gereklilik gerçek para fazına ertelenmez.
Sosyal giriş/kart sağlayıcıları mevcut V1'in işleyen veri alıcıları gibi gösterilmedi.

Koordinatörün bu gate'te resmî kaynak kontrolü (hukuki/vergi sonucu değil):
- [GOV.UK online selling](https://www.gov.uk/online-and-distance-selling-for-businesses/online-selling):
  dijital içeriğin hemen verilmesi ve iptal hakkı için belirli bilgilendirme/onay adımları vardır;
  genel otomatik hak kaybı metni yeterli sayılmaz.
- [GOV.UK digital-services VAT](https://www.gov.uk/guidance/the-vat-rules-if-you-supply-digital-services-to-private-consumers):
  platformun gerçek işlem kontrolü ve koşulları satıcı/vergi rolünü etkileyebilir; YouTick rolü ayrıca incelenmeli.
- [ICO right to be informed](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-be-informed/):
  amaç, hukuki dayanak, alıcı, süre, hak ve transfer açıklamaları gerekir.
  Rehber DUAA sonrası gözden geçirilmektedir; taslak metin eksik sözleşmeleri/bilgileri tamamlamaz.

## Değişiklik ve doğrulama

Bu gate'in değişen dosyaları:
`README.md`, `apps/web/README.md`, `docs/README.md`,
`apps/web/components/landing/landing-copy.ts`,
`apps/web/components/landing/ROICalculator.tsx`,
`apps/web/app/terms/page.tsx`, `apps/web/app/privacy/page.tsx`,
`apps/web/__tests__/unit/landing.test.ts`, bu yeni belge.
Tarihli kabul kayıtları ve önceki 56 dosyalık kaynak hazırlığı değiştirilmedi.
Landing şekli/CTA/hesaplama korunur; ROI bileşeninde yalnız iki başlık etiketi değişti.
AUP taslağı zaten sorumluluk sınırlarıyla tutarlıydı; değiştirilmedi.

| Kanıt | Sonuç |
|---|---|
| LOCAL_STATIC | Bilingual ürün/limit/gelecek ayrımı, koddan veri envanteri, resmî kaynaklar |
| LOCAL_TEST | Landing/routes 2 dosya 11 test PASS; legal sayfalar React server renderer ile okunabilir doğrulandı |
| LOCAL_TEST | Web tüm kaynak tsc, hedefli ESLint PASS |
| LOCAL_TEST | Gerçek Next 16.3.3 production build PASS; synthetic testnet ID, flag'ler kapalı, telemetry disabled yalnız process env |
| LOCAL_TEST | Doküman build PASS; yalnız onaylı 8 mevcut metin/test dosyası ve bu yeni belge değişti |
| EXTERNAL_NOT_RUN / UNPROVEN | Yeni CI, browser etkileşimi, provider/chain canlı kabul, yayın, ticari/hukuki onay |

Web build yeni dizinde normal font erişimini kullandı; sahte font yanıtı yok, offline build iddiası yok.
Build başarılı olsa da hosted yapılandırmayı veya provider kabulünü kanıtlamaz.
Vite CommonJS, Next middleware deprecation/Edge process.cwd ve docs bundle boyutu
uyarıları mevcut; bu metin gate'inde mimari veya bağımlılık değişikliği yapılmadı.
Önceki cargo-near global ayar yan etkisi yeniden tetiklenmedi; bu gate cargo-near çalıştırmadı.
Kaynak checkout'un 502 dosyası ve HEAD/index/dal/tag/remote kayıtları aynı; hedefin önceki 56 hazırlık dosyası aynı.
Hedef HEAD/index/dal/tag/remote kayıtları ve mevcut global near-cli ayar özeti aynı kaldı.
Uygulamanın kendi `refs/codex/turn-diffs` geçici kayıtları turn boyunca değişebilir; ajan Git yazımı yapmadı.
Commit/staging/push/deploy/dış iletişim veya ücret hesapları/flag'ler değişmedi.

**Engel:** kamuya açılmadan önce privacy amaç/dayanak/provider/süre/hak/transfer bilgileri;
gerçek para öncesi ayrıca satıcı/vergi/fatura/iade/koşullar ve canlı kabul tamamlanmalı.
Sağlayıcı paketi hazırlandı; taslak gönderilmedi, kart entegrasyonu başlatılmadı.
27 Eylül: [V1 sağlayıcı soru paketi](./youtick-v1-provider-enquiry.md) hazırlandı; **TASLAK — GÖNDERİLMEDİ**.
Sağlayıcı seçimi, yazılı kabul ve bağlayıcı fiyat teklifi yok; kart entegrasyonu başlamadı.

## Onaya hazır yerel kayıt

**Tek sonraki gate: `YOUTICK_V1_CHECKPOINT_COMMIT`** — açık kullanıcı onayı bekleniyor;
AGENTS.md gereği bu gate'te kayıt yapılmadı. Aşağıdaki kapsam yerel hazırlığı korumak içindir;
pilot yayını, hukuki onay, sağlayıcı kabulü, push veya deploy anlamına gelmez.

- Dal: `codex/youtick-ver-1`; temel HEAD: `f71178263c5d264bef647feaae8a2b54618b1333`.
- Önerilen mesaj: `feat: prepare wallet-only YouTick V1 testnet candidate`.
- **66 dosya: 23 değişmiş takipli + 43 yeni**; yalnız aşağıdaki açık yollar.
- Yok sayılan bağımlılık/cache/temp/WASM/ABI dosyaları, env/anahtarlar ve ham günlükler kapsam dışı.
- Eski gate sonuçları tarihli yerel kanıttır; güncel ticari/gizlilik ve canlı kabul boşlukları sürer.

```text
M .github/workflows/ci.yml
M AGENTS.md
M README.md
M apps/web/README.md
M apps/web/__tests__/unit/device-session.test.ts
M apps/web/__tests__/unit/landing.test.ts
M apps/web/__tests__/unit/livepeer-upload-status.test.ts
M apps/web/__tests__/unit/livepeer-upload.test.ts
M apps/web/app/privacy/page.tsx
M apps/web/app/terms/page.tsx
M apps/web/components/LivepeerPaidUploadForm.tsx
M apps/web/components/landing/ROICalculator.tsx
M apps/web/components/landing/landing-copy.ts
M apps/web/lib/device-session.ts
M apps/web/lib/livepeer-upload.ts
M contracts/nft-ticket/src/lib.rs
M contracts/nft-ticket/tests/paid_media_livepeer_v1.rs
M docs/README.md
M scripts/check-paid-media-livepeer-v1-abi.mjs
M scripts/ci-security.test.mjs
M workers/livepeer-bridge/src/index.test.ts
M workers/livepeer-bridge/src/index.ts
M workers/livepeer-bridge/src/playback-v2.test.ts
? .agents/skills/SOURCES.md
? .agents/skills/near-api-js/SKILL.md
? .agents/skills/near-api-js/UPSTREAM.md
? .agents/skills/near-api-js/references/api_patterns.md
? .agents/skills/near-api-js/references/contracts.md
? .agents/skills/near-api-js/references/key_management.md
? .agents/skills/near-api-js/references/meta_transactions.md
? .agents/skills/near-api-js/references/nep413.md
? .agents/skills/near-api-js/references/tokens_guide.md
? .agents/skills/near-contract-audit/SKILL.md
? .agents/skills/near-contract-audit/UPSTREAM.md
? .agents/skills/near-contract-audit/references/high-severity.md
? .agents/skills/near-contract-audit/references/low-severity.md
? .agents/skills/near-contract-audit/references/medium-severity.md
? .agents/skills/near-dapp/SKILL.md
? .agents/skills/near-dapp/UPSTREAM.md
? .agents/skills/near-dapp/references/create-near-app.md
? .agents/skills/near-dapp/references/near-connect-hooks.md
? .agents/skills/near-dapp/references/near-connect.md
? .agents/skills/near-smart-contracts/SKILL.md
? .agents/skills/near-smart-contracts/UPSTREAM.md
? .agents/skills/near-smart-contracts/rules/best-contract-tools.md
? .agents/skills/near-smart-contracts/rules/chain-signatures.md
? .agents/skills/near-smart-contracts/rules/security-storage-checks.md
? .agents/skills/near-smart-contracts/rules/state-collections.md
? .agents/skills/near-smart-contracts/rules/structure-near-bindgen.md
? .agents/skills/near-smart-contracts/rules/testing-integration-tests.md
? .agents/skills/near-smart-contracts/rules/upgrade-migration.md
? .agents/skills/near-smart-contracts/rules/xcc-promise-chaining.md
? .agents/skills/near-smart-contracts/rules/yield-resume.md
? .agents/skills/upstream-lock.json
? .agents/skills/youtick-contract-review/SKILL.md
? .agents/skills/youtick-near-auth/SKILL.md
? .agents/skills/youtick-payment-flow/SKILL.md
? apps/web/__tests__/unit/compact-upload.test.ts
? contracts/nft-ticket/src/compact_upload.rs
? docs/architecture/youtick-v1-isolated-preparation.md
? docs/architecture/youtick-v1-product-scope.md
? docs/architecture/youtick-v1-provider-enquiry.md
? protocol/paid-media-livepeer-v1/compact-upload-vectors.json
? protocol/paid-media-livepeer-v1/compact-upload.ts
? protocol/paid-media-livepeer-v1/title.ts
? protocol/paid-media-livepeer-v1/upload-title-vectors.json
```
