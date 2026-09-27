# YouTick V1 — pilot politika ve operasyon hazırlığı

27 Eylül 2026 · Gate: `YOUTICK_V1_PILOT_POLICY_AND_OPERATIONS`
**COMPLETED_WITH_WARNINGS — yerel politika closeout hazır; gizlilik/canlı yayın gate'i ayrı açık.**

## Kapsam ve yapılanlar

Yalnız `apps/web/app/privacy/page.tsx`, `docs/testnet-pilot-runbook.md` ve bu yeni rapor yazılabilir.
Kod/kontrat/ödeme/release/ayar/env/secret, Git, eski checkout, browser/storage ve canlı veri yasaktır.
Deploy/CI rerun/harcama/upgrade/sözleşme kabulü/dış iletişim yapılmadı.

- Privacy'ye **YOUTICK LTD** işletmeci/veri sorumlusu ve `contact@youtick.net` eklendi.
  Dayanak kullanıcı beyanıdır (**OWNER_DECLARED**); hukuk/vergi yerleşimi veya DPA onayı değildir.
  `abuse@youtick.net` içerik-ihlal kanalı olarak kaldı, privacy kanalı yapılmadı.
  Mevcut dayanak/retention/transfer/provider rolü/haklar eksik kaydı korundu.
- Runbook pause açıklaması düzeltildi: yeni **ticket + ücretli upload job** transferi döner;
  mevcut entitlement/playback/job recovery ayrı kontrollerle sürer
  (Market `src/lib.rs:1279-1281,1309-1310`).
- Runbook'a tarihli **herkese açık testnet / 30 gün / toplam 100 USD** kararı eklendi.
  Başlangıç/bitiş UTC henüz yok; eski 14 günlük beta değil. Harcama/deploy yetkisi verilmedi.
  Public kaynakta rezerv 0, aylık dolar tavanı null; env'e 100 yazmak cap değildir
  (Bridge `src/index.ts:3257-3267`).

Kullanıcı plan/credit/cap'leri **bilmiyor**; sözleşmeler için “henüz yok sanırım, kontrol et” dedi.
Sonraki owner kararı: **“paketleri şu an check etmene gerek yok; kabul et ve devam et.”**
Paket/hesap kontrolü şimdilik ertelendi; mevcut hesap varsayımıyla yerel hazırlık devam eder.
Bu bir doğrulanmış plan/credit/cap veya sözleşme kabulü değildir; 30 gün/toplam 100 USD kararı değişmedi.
Koordinatör iki repo docs + V1 privacy/terms içinde yalnız taslak AUP/notlar buldu;
signed DPA/retention anlaşması dosyası saptamadı. Mail/downloads/tüm cihaz taranmadı.
**Dosya bulunmaması hiçbir sözleşmenin var olmadığı anlamına gelmez.**

## Güncel resmî kamu kanıtı — hesaba uygulanmış koşul değil

| Kaynak | Sınırlı sonuç |
|---|---|
| [Livepeer pricing](https://livepeer.studio/pricing) | Sandbox: 1.000 transcode / 60 storage / 5.000 delivery dakikası, 30 concurrent. Growth minimum 100 USD/ay. Kullanıcının Sandbox/Growth olduğu, kredi veya aşım davranışı doğrulanmadı |
| [Livepeer terms](https://livepeer.studio/terms-of-service) | Test kredileri ve aylık account-anniversary billing/vergiler söz konusu; seçilen 30 gün billing cycle ile kendiliğinden aynı değil. Hesap sözleşme/credit kanıtı yok |
| [Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/) | Pay-as-you-go hesap geneli usage-based threshold e-postası; kullanımı kapatmaz, harcama tavanı değildir |
| [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) | Paid minimum 5 USD/hesap/ay + aşım; Pages Functions aynı model. Gerçek hesap planı/usage bilinmiyor |
| [Cloudflare billing policy](https://developers.cloudflare.com/billing/understand/billing-policy/) | Kredi türü/uygulaması hesapta görülmeden indirim veya bütçeye sığma varsayılmaz |
| [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) | Main Agreement'e bağlı ve signed/otherwise agreed olabilir; public metin YouTick hesabının kabul/region/saklama kanıtı değil |

İki standart ücretli planın tam ücretleri aynı faturadönemine uygulanırsa **LP 100 + CF 5 = en az
105 USD**, vergi/aşım öncesi. Kredi/özel fiyat ve mevcut gerçek plan bilinmiyor; bu YouTick teklifi değil.
100 USD bütçesine uygunluk veya ücretsiz/ücretli hesap sonucu kesinleştirilmedi.
Cloudflare log/D1 kotaları ve kaynak upload limitleri toplu 100 USD cap'i değildir.

## Kapanacak somut bilgiler

| Açık kalem | Sorumlu | Kapanış kanıtı |
|---|---|---|
| Gerçek plan/dönem/credit | Owner, mevcut hesap görünümü | Livepeer/CF plan adı, billing dönemleri, mevcut usage/credit; tahakkuk verisi |
| Harcama tavanı ve açık maruziyet | Owner/operasyon | Provider'ın limit sonrası davranışı + transcode/storage/delivery/CF devam eden maliyet ve billing gecikmesi; toplam 100 USD için doğrulanmış üst sınır |
| Veri sözleşmeleri/retention | Owner/provider kayıtları | Hesaba uygulanmış agreement/DPA, saklama/silme/backup/region ve transfer kapsamı; kamu metni tek başına yeterli değil |
| Nihai notice/hak prosedürü | Owner + uygun değerlendirme | Amaç/dayanak/alıcı/süre/transfer/hak/şikâyet bilgileri ve kullanıcıya görünür metin |
| Pilot başlangıcı/canlı kabul | Owner/koordinatör | Ayrı GO/UTC kararı, korumalı exact paket ve wallet/media/withdraw/recovery kanıtı |

Manuel bütçe e-postası/gözlem hard cap değildir. Tahakkuk + açık iş/delivery/gecikme maruziyeti
üst sınırı doğrulanmadı; bu belirsizlik owner kararıyla yerel hazırlığın ön koşulu olmaktan kaldırıldı.
Gizlilik ve gerçek kullanım/yayın GO kararı ayrı gate'te açık; aşım harcaması veya deploy yetkisi doğmaz.
Sponsor test NEAR/token bakiyesi gerçek hizmet USD giderinden ayrı izlenir.
Yeni bütçe sistemi, yapay rezerv veya garantili “80/20 buffer” tasarlanmadı.

## Yerel doğrulama ve sınır

- Mevcut landing/legal render suite: **7 PASS**.
- Web mevcut compiler ile `tsc --noEmit --incremental false`: PASS.
- Privacy hedefli ESLint: PASS; yeni test/framework eklenmedi.
- `npm run build --prefix docs`: PASS; engellemeyen 500 kB bundle uyarısı.
  Bağlantı/boşluk/kapsam PASS: başlangıçtaki 382 dosyadan yalnız izinli privacy/runbook değişti,
  tek yeni dosya bu rapor. Eski 502 kaynak/Git ve hedef HEAD/index/dal/tag/remote/origin,
  global near-cli ayar özeti aynı; stage/commit yapılmadı.
- Geniş Web/Rust/CI/browser tekrarları veya provider hesap okumaları yapılmadı.
  Koordinatör yalnız resmî kamu kaynaklarını inceledi; bunlar **LOCAL_STATIC** araştırma,
  yerel kontroller **LOCAL_TEST**, hesap/sözleşme/cap/canlı kabul **UNPROVEN**.

Commit/push/yayın yapılmadı; bu privacy/runbook düzeltmeleri henüz GitHub/main/hosted değil.
[Readiness raporundaki](./youtick-v1-pilot-readiness.md) gerçek kullanım planı uygulanmadı.

### 27 Eylül owner kararına göre yerel kapanış

Aktif gate: `YOUTICK_V1_PILOT_POLICY_CLOSEOUT` — COMPLETED_WITH_WARNINGS.
Önceki kamu kaynakları ve yerel test/CI sonuçları tarihli kanıt olarak korundu.
`YOUTICK_V1_PROVIDER_ACCOUNT_READONLY` şimdilik ertelendi; yalnız plan bilinmiyor diye
yerel hazırlık durdurulmaz. Hesap/100 USD hard-cap kanıtı, tam gizlilik veya canlı pilot kabulü
elde edilmiş sayılmaz. Upgrade/topup/terms accept/ayar/silme/ileti/deploy yapılmadı.
Bu closeout yalnız iki belgeyi değiştirdi; privacy'nin önceki doğrulanmış içeriği aynı kaldı.
Son doküman build/bağlantı/7-yol kapsam/boşluk kontrolü PASS; bu closeout yalnız izinli iki
belgeyi değiştirdi, privacy dahil kalan 381 dosya ile HEAD/index/dal/tag/remote/origin aynı kaldı.

**Tek sonraki gate:** `YOUTICK_V1_PILOT_POLICY_CHECKPOINT_COMMIT` — açık kullanıcı onayı bekleniyor;
yalnız aşağıdaki yerel kayıt, push/PR/merge/CI/deploy yok. Bu gate'te stage/commit yapılmadı.

## Onaya hazır yerel kayıt — 7 açık yol

Dal: `codex/youtick-v1-integration-20260927`; mevcut HEAD
`b69a6089643c65a1a22ea019763a04c3ee744be5`.
Önerilen mesaj: `docs: close out V1 pilot policy preparation`.
Kapsam **2 değişmiş takipli + 5 yeni = 7 dosya**; yok sayılan temp/cache/env/anahtarlar hariç:

```text
M apps/web/app/privacy/page.tsx
M docs/testnet-pilot-runbook.md
? docs/architecture/youtick-v1-github-publication-preflight.md
? docs/architecture/youtick-v1-pilot-policy-and-operations.md
? docs/architecture/youtick-v1-pilot-readiness.md
? docs/architecture/youtick-v1-pr-merge-preflight.md
? docs/architecture/youtick-v1-pr-squash-merge.md
```
