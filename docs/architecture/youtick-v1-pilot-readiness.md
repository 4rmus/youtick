# YouTick V1 — public testnet pilot hazırlığı

27 Eylül 2026 · Gate: `YOUTICK_V1_PILOT_READINESS`
**COMPLETED_WITH_WARNINGS — hazırlık incelendi; pilot/yayın NO-GO.**

## Amaç ve sınır

Gizlilik, harcama/durdurma ve gerçek cüzdan kabulü için kapanacak somut işleri belirlemek.
Yalnız bu yeni rapor yazılabilir. Mevcut 381 dosya, eski 502 kaynak dosyası, Git/index/refs/origin,
privacy/terms/runbook/kod/ayar/env/secret, browser/storage ve canlı veri korunur.
Provider/NEAR/D1 okumaları, deploy, CI rerun, harcama, imza ve dış iletişim bu gate'te yapılmaz.
Yerel doğrulama yalnız `docs/testing.md:171` doküman build'i ve kapsam/bağlantı/bütünlük kontrolüdür.

Main **ad84ba294a95e2a644700d98032e78477767f3c5**, b69 ile aynı tree.
Exact main/push [CI 36337684370](https://github.com/4rmus/youtick/actions/runs/36337684370)
SUCCESS; artık CI geçişi engel değildir. Yerel HEAD b69'da kaldı; fetch/switch yapılmadı.
Merge/CI sonucu çalışan V1 veya canlı kabul değildir; protected yayın paketi/content-provenance
ve hosted kabul ayrıca doğrulanır.

## Kullanıcının kesin kararları ve kanıt sınırı

| Alan | Durum |
|---|---|
| Kapsam | **HERKESE AÇIK TESTNET PİLOTU**; davetli/sayısal katılımcı sınırı seçilmedi |
| Süre | **30 gün**; başlangıç UTC tarihi henüz belirlenmedi |
| Gerçek hizmet bütçesi | **Toplam 100 USD**; harcama/imza/deploy yetkisi değil, otomatik cap kanıtı değil |
| İşletmeci/veri sorumlusu | **YOUTICK LTD — OWNER_DECLARED**; uygulanacak hukuk/vergi yerleşimi/hukuk onayı çıkarılmaz |
| Destek/ihlal takibi | `contact@youtick.net` ve `abuse@youtick.net` aktif owner takibinde — OWNER_DECLARED; dış test ileti gönderilmedi |
| Sözleşme/veri politikası | Kullanıcının genel “evet”i DPA/retention/dayanak/transfer/hak prosedürü içeriğini kanıtlamaz; **UNPROVEN** |
| Yaş politikası | 18+ veya yaş doğrulama seçilmiş/uygulanmış sayılmaz; owner netleştirmeli |
| Sosyal giriş/kart/banka payout | Sonraki faz; sağlayıcı paketi taslak, gönderilmedi |

Öneri: 30 gün, owner'ın ayrı **GO ve başlangıç UTC kararıyla** sayılmalı; deployment/merge tarihi
otomatik başlangıç sayılmaz. Kaynakta public pilot için otomatik 30 günlük global kapanış yoktur.
Test USDC/test NEAR gerçek değersizdir; Livepeer/Cloudflare hizmetleri bu nedenle ücretsiz olmaz.

## Eksik / sorumlu / kapanış kanıtı / ayrı onay matrisi

| Eksik | Sorumlu | Kapanış kanıtı | Mutasyon varsa ayrı onay |
|---|---|---|---|
| Nihai gizlilik bildirimi | Owner + ilgili hukuk/provider değerlendirmesi | Controller iletişimi, amaç/dayanak, alıcı/rol/DPA, transfer, kategori bazında süre ve hak/şikâyet yolu; toplanmadan önce görülebilir metin | Privacy/policy kaynak değişikliği; dış iletişim ayrıca |
| Provider veri işleme/saklama | Owner + provider | Hesaba uygulanmış sözleşme/DPA/ayar; asset/player diagnostics/log/backup/region kapsamı | Provider hesap/ayar veya iletişim ayrı |
| 100 USD uygulanabilir harcama sınırı | Owner/operasyon | Gerçek Livepeer+CF tarife/usage, mevcut ücretler, açık iş/delivery maruziyeti ve billing gecikmesi; doğrulanmış cap/limit veya üst sınırı kanıtlı durdurma planı | Billing limit/ayar/servis değişikliği ayrı |
| Süre ve nöbet | Owner | Başlangıç/bitiş UTC, kullanım/harcama gözlem sıklığı, durduracak kişi ve escalation kanalı | Aktivasyon/stop/governance ayrı |
| Runbook yanlış pause açıklaması | Kaynak uygulayıcı + reviewer | Aşağıdaki 104. satırın gerçek upload+ticket pause davranışıyla dar düzeltmesi | Sonraki metin/kaynak gate'i |
| Exact yayın/rollback paketi | Koordinatör/owner | ad84 artifact içeriği/checksum/provenance, exact config/kimlik/policy ve compact-uyumlu geri dönüş sürümü | Protected workflow dispatch/ayar ayrı |
| Canlı wallet kabulü | Owner/katılımcılar | Aşağıdaki aynı account/job/publication bağlarına ait final receipt/view + gerçek medya kanıtı | Her gerçek imza/ödeme/upload action-time onayı |
| İçerik/yaş ve şikâyet | Owner | Hakları onaylı test eseri, uygulanacak yaş/moderasyon/şikâyet ve kaldırma prosedürü | Deklarasyon kullanıcıya ait; takedown/delete ayrı |

Küçük veya davetli test kişisel veri varsa gizlilikten muaf değildir. Public kapsam seçimi
yukarıdaki eksikleri kapatmaz; tahmini hukuki dayanak, saklama günü veya ülke uydurulmaz.

## Kaynakta gerçekten uygulanabilen sınırlar

| Kaynak/satır | Bulgu |
|---|---|
| `scripts/release-metadata.mjs:566-567`, Bridge `index.ts:3135-3138` | Public paket allowlist boş ister; creator sadece hesap biçimiyle kabul edilir. Public seçim uyumlu; davet/18+ kapısı var denmez |
| Market `src/lib.rs:1840-1875`, Bridge `index.ts:2704-2759` | 5 GB; creator başına UTC gününde iki yeni iş, bir aktif upload; Bridge toplam 10 aktif slot. Bunlar para/süre/izleyici cap'i değil |
| Bridge `index.ts:3257-3267` | Public için rezerv **0**, aylık dolar cap'i **null**; env'e 100 USD yazmak uygulanmış cap oluşturmaz |
| Bridge `index.ts:3241-3254`, `wrangler.toml:67-70` | Rate-limit binding zorunlu/fail-closed; kaynakta 30/60 ayarı. Hosted binding/etkin limit bu gate'te ölçülmedi; dolar cap'i değil |
| Bridge `index.ts:615-616,2837-2861` | 60 saniyelik pencerede iki ardışık provider-failure admission'ı AUTO_CLOSED yapabilir; finansal tavanın yerine geçmez |
| `scripts/release-metadata.mjs:37-54` | acceptance açar; drain yeni upload/relay'i kapatır, playback/işlemleri sürdürür; closed bütün paket kapılarını kapatır. İşleyen stream/asset anında yok olmaz |
| Market `src/lib.rs:543-564,1279-1281,1309-1310` | Guardian pause yeni **ücretli upload job'u ve ticket** transferini döndürür; mevcut haklar/aynı iş uzlaştırması ayrı |
| `docs/testnet-pilot-runbook.md:104` | “creator upload açık kalır” ifadesi üstteki gerçek kaynakla uyuşmuyor; açılmadan önce dar düzeltme gerekli, burada değiştirilmedi |
| `apps/web/app/privacy/page.tsx:8,13-18` | Bildirim tamamlanmadan veri toplama, browser anahtarları, server/SDK diagnostics ve açık hukuki bilgiler doğru şekilde ayrılmış; final metin değil |
| Bridge `index.ts:2359` | 14 gün yalnız cleanupEligibleAtMs hesabı; gerçek silme/backup/retention garantisi değil |

Eski 14 günlük/1 GB beta takvimi yeni 30 günlük public kararına uygulanmaz.
120 dakika süre limiti değildir; 30 günlük cihaz yetkisi bilet hakkının süresi değildir.

## Ölçülebilir harcama ve durdurma ölçütü

**100 USD gerçek toplam hizmet gideri** ile sponsor **TEST NEAR/token bakiyesi** ayrı izlenir.
Livepeer işleme/storage/delivery, Cloudflare Worker/D1/Queue/log ve varsa sabit ücretler;
aktif işler, devam eden delivery ve henüz tahakkuk etmemiş kullanım birlikte değerlendirilir.
Burada tarife/bakiye/dashboard okunmadı. Manuel gözlem tek başına hard cap değildir.

Kapanış için sembolik kontrol:
**doğrulanmış tahakkuk + ölçülmüş açık maruziyet üst sınırı ≤ 100 USD**.
Açık maruziyet, kabul edilmiş işler + gözlem/durdurma süresindeki delivery + billing gecikmesini kapsar.
Bu üst sınır bilinmiyorsa public GO yoktur; “80'de dur/20 yeter” gibi güvence verilmez.
Owner gözlem aralığını, maliyet verisinin gecikmesini ve provider cap/limit davranışını kanıtlamalı;
yeni bütçe sistemi veya sayı bu gate'te tasarlanmadı.

Durdurma kanıtı: yeni admission/quote/relay reddi, yeni ücretli job/ticket pause final receipt/view,
mevcut aynı job recovery korunması, provider create/send sayaçlarında artış olmaması.
Rate-limit/budget/policy/kimlik uyuşmazlığı, belirsiz maliyet, yetkisiz playback veya belirsiz broadcast
görülürse yeni harcama/ödemeler durdurulmalı; otomatik tekrar ödeme yapılmaz.
Canlı flag/governance işlemleri ayrı açık onay gerektirir.

Rollback: exact Web/Bridge sürümü, config hash ve kapalı sağlık/endpoint kanıtı;
**compact okuyucu ve eski job/device proof uyumu korunmalı**
(`docs/architecture/near-auth-compact-release-preflight.md:153-159`).
Kontrat state geri sarılmaz; anahtar/deneme/D1/DLQ kayıtları silinmez.
İhlalde token issuance/takedown/freeze sırası `docs/testnet-pilot-runbook.md:103-113`;
her yetkili işlem/event ve gerçek token TTL sonucu ayrı kanıtlanır.

## Minimum canlı kabul — plan, çalıştırılmadı

| Senaryo | Kabul kanıtı |
|---|---|
| Wallet/account | Desteklenen NEAR wallet/testnet doğru hesap; ret/disconnect/hesap değişimi başka hesabın anahtar/taslağını bozmaz |
| Ticket | Aynı publication/fiyat/token için tek onay; final zincir receipt + aynı buyer'ın entitlement view; redirect/imza tek başına yeterli değil |
| Playback/reload | Buyer ve creator gerçek medya açar/ilerler/reload olur; biletsiz üçüncü hesap reddedilir, ikinci ödeme istemez |
| Upload | Hakları kullanıcıca onaylı küçük kaynak; ayrı quote/ücret, final job, tek provider asset, Published/ACTIVE ve creator playback |
| Cancel | Uygun henüz başlamamış işte kullanıcı onayı; exact job/generation CANCELLED, yeni asset/ikinci ücret yok; otomatik refund vaadi yok |
| Recovery | Aynı dosya/fingerprint/job; tab/reload/yanlış dosya/iki tab + lost-response; yalnız mevcut transaction read/reconcile, yeni ödeme değil |
| Üretici çekimi | Ayrı kullanıcı onayıyla kendi NEAR cüzdanına test USDC çekimi; final receipt + kontrat/cüzdan bakiye uzlaşması; banka payout değil |
| Tarayıcı/cihaz | Hedef masaüstü/mobil listesi belirlenir; ilan edilen her kapsam gerçek wallet/media/reload ile ölçülür. Mobil/Safari iddiası ölçülmedikçe UNPROVEN |
| Durdurma/rollback | Yeni upload/ticket/issuance kapalı kanıtı; mevcut hak/iş uzlaştırma korunur; compact uyumlu exact sürüm ve kaynak kimlikleri |

Kaynak: `apps/web/lib/livepeer-publication.ts:224-275`, Market `src/lib.rs:1323-1345`;
upload `apps/web/lib/livepeer-upload.ts:708-746,1081-1103,1219-1256`;
çekim `apps/web/lib/livepeer-publication.ts:193-202`.
NEAR ödeme/erişim otoritesidir; Livepeer başarı cevabı final job/entitlement kanıtı değildir.
İlk gerçek imza/quote/ödeme/upload için exact kişi/eser/iş/tutar/limit scope'u yeniden onaylanır.

## Resmî kaynak sınırı ve sonuç

Koordinatörün [ICO bilgilendirme rehberi](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-be-informed/)
kontrolü iletişim/amaç/dayanak/alıcı/transfer/süre/haklar ve toplama anında şeffaflığı destekler;
DUAA sonrası rehber incelenmektedir. Link uygulanacak hukuku veya UK vergi yerleşimini belirlemez.

[Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) v6.4, 3 Nisan 2026,
müşterinin anlaşmasına bağlı işleyici hükümleri taşır; public sayfa YouTick hesabının
DPA/region/retention ayar veya kabul kanıtı değildir.

[Livepeer Studio privacy policy](https://livepeer.studio/privacy-policy) girişte user-registration
website kapsamını belirtir; buradan video asset/player diagnostics saklama süresi veya
YouTick'e uygulanmış medya DPA'sı çıkarılmaz.

Sağlayıcı paketi [taslak/gönderilmedi](./youtick-v1-provider-enquiry.md);
sosyal giriş/kart/banka ödeme sonraki faz. Bu gate yeni dış iletişim yetkisi vermedi.
Uygulama/kontrat/browser/geniş test, canlı health/RPC/D1, sözleşme görüşmesi veya harcama çalıştırılmadı.
Kanıt: kaynak/kararlar **LOCAL_STATIC / OWNER_DECLARED**; main CI **CI**;
gizlilik sözleşmeleri/cap/canlı kabul **UNPROVEN / EXTERNAL_NOT_RUN**.
Doküman build PASS (engellemeyen 500 kB bundle uyarısı); bağlantı/boşluk/kapsam kontrolü PASS.
Başlangıçtaki 381 aday ve eski 502 kaynak dosyası, HEAD/index/dal/tag/remote/origin ile
global near-cli ayar özeti aynı; yalnız bu yeni rapor eklendi. Stage/commit yapılmadı.

**Tek sonraki gate:** `YOUTICK_V1_PILOT_POLICY_AND_OPERATIONS` —
owner teyitli kimlik/contact ile privacy/runbook'u asgari düzeltme; provider veri işleme/cap ve
100 USD açık maruziyet kanıtını kapatma. Bilinmeyen dayanak/retention/transfer uydurulmaz;
dış iletişim/ayar/harcama/deploy ayrıca onaylı kapsam ister. Bu gate burada durur.
