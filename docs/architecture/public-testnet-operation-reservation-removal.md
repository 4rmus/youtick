# Public testnet sabit dolar rezervinin kaldırılması

9 Eylül 2026 · `PUBLIC_TESTNET_OPERATION_RESERVATION_REMOVAL_SOURCE`

**PASS / LOCAL_TEST — kaynak hazır, henüz yayımlanmadı.**
Kullanıcı aylık/video başına sabit dolar rezervinin kaldırılmasını istedi.
Önceki 5 → 15 USD bütçe artırma önerisi ve
`PLAYBACK_SINGLE_SIGNATURE_WALLET_ACCEPTANCE_UNBLOCK` bütçe paketi artık
kullanılmayacak.

## Karar ve kapsam

Public testnet yeni yüklemeleri aylık tahmini dolar toplamına göre reddetmez.
Her yeni işe yapay dolar maliyeti eklenmez. 5 GB dosya sınırı, creator başına
iki günlük deneme, creator başına bir aktif yükleme, toplam 10 aktif yükleme,
istek hızı, kimlik/ödeme doğrulaması, yayın süresi ve provider hata kontrolleri
korunur. Gerçek creator yükleme ücreti ve bilet fiyatı değişmez.

Değişiklik yalnız `VIDEO_ENVIRONMENT=public-testnet` yolundadır. Eski
Preview/beta bütçe politikası bu public testnet çalışmasının kapsamı değildir
ve değişmez. Yeni feature flag, servis, sayaç veya bağımlılık eklenmedi.

## Uygulama

- Aynı admission planını kullanan ödeme öncesi uygunluk ve gerçek rezerv
  yolları public testnet'te dolar tavanı olmadan çalışır.
- Public yeni rezervin tahmini dolar tutarı sıfırdır; bu, gerçek provider
  hizmetinin ücretsiz olduğu iddiası değildir. Eski veri biçimi korunur ve
  daha önceki aylık dolar toplamı artırılmaz.
- Geçmiş `monthly_budget_exceeded` kapanışı yeni public yüklemeyi engellemez.
  Başka bir nedenle, örneğin `provider_unavailable` ile kapanan kayıt reddetmeye
  devam eder. Eski rezerv, günlük deneme ve kota verilerini sıfırlamak gerekmez.
- Admission durum yanıtında public ortamın uygulanmayan bütçe ve iş rezervi
  ayarları `null` döner; eski aylık değer tarihsel kayıt olarak kalabilir.
- Public closed/acceptance/drain yayın ayarlarında pozitif dolar değeri
  zorunluluğu kaldırıldı. Önceki numeric alanlar eski yayın paketleriyle
  uyumluluk için kabul edilir, public runtime onları uygulamaz.

Bu nedenle yayında mevcut 5/5 değerini 15 dolara yükseltmek, sayaç sıfırlamak,
admission-reopen göndermek, D1 veya NEAR durumunu değiştirmek gerekmez.

## Kanıt

Başlangıç main: `cd7e485aa9451102d2b7273fa5632fa5142e3e5c`.
Dirty ana çalışma alanı korunarak bu SHA'dan ayrı candidate oluşturuldu.

| Doğrulama | Sonuç |
| --- | --- |
| Yeni regresyonlar, eski kaynak | 4 beklenen başarısızlık; mevcut sorunu yakaladı |
| Bridge `npm test -- --run` | 286 PASS, mevcut 3 opt-in senaryo SKIPPED |
| Public bütçe/kota odaklı son kontrol | 4 PASS |
| `node --test scripts/release-metadata.test.mjs scripts/cloudflare-release.test.mjs` | 150 PASS |
| Bridge `npm run check` | PASS |
| Wrangler deploy `--dry-run` | PASS; yalnız yerel paket |
| `git diff --check` | PASS |

Regresyonlar boş/kayıp bütçe ayarı, eski dolu 5/5 kaydı, eski aylık bütçe
kapanışı, ortak preflight/reserve yolu, günlük sayacın korunması ve provider
kapanışını kapsar. Public eşzamanlılık testinde aynı creator ikinci yüklemeyle
hemen reddedilir; başka creator'lar 10 slota kadar kabul edilir. 5 GB üstü
reddedilir. Eski ortamın pozitif bütçe ve aylık tavan testleri hâlâ geçer.

## Sınır ve sonraki gate

Değişen dosyalar: Bridge `src/index.ts` ve `src/index.test.ts`,
`scripts/release-metadata.mjs` ve testi, bu karar/sonuç belgesi.
Web, sözleşmeler, secret/config, canlı sayaçlar veya kullanıcı dosyaları
değişmedi. Commit, push, PR, merge, CI rerun, deploy, gerçek ödeme/yükleme ve
provider medya işlemi çalıştırılmadı.

Kaynak blocker'ı yok. Mevcut canlı sürüm hâlâ eski bütçe kontrolünü uygular;
cüzdan kabulü yayın sonrasına kadar tamamlanmış sayılmaz.

**Tek sonraki gate: `PUBLIC_TESTNET_OPERATION_RESERVATION_REMOVAL_RELEASE`.**
Hazır beş dosyanın commit/PR/CI/merge akışı ve yeni kesin main SHA'nın tek
korumalı public-testnet acceptance yayını. Market kod güncellemesi veya
bütçe/config değeri değişikliği gerekmez. Canlıda aynı ödenmemiş taslağın
preflight kabulü ve uygulanmayan dolar ayarlarının `null` olması doğrulanır;
gerçek cüzdan ödeme/yükleme kabulü ayrı kalır.
