# Google upload — geçici publication hatası incelemesi

Gate: `NEAR_AUTH_PUBLICATION_TRANSIENT_ERROR_REVIEW` — 21 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS**. Aynı Google hesabının ücretli işi ve
ACTIVE yayını zincirde doğrulandı. Logdaki HTTP 409'un tam hata kodu yok;
yerelde yeniden üretilen yayın geçişi yarışı olası nedendir, canlı kök neden
kesinleştirilmiş değildir. Kullanıcı ayrıca hata kodu olmadığını bildirdi.

## Kapsam

Kullanıcı hesabı fonladığını, videoyu yükleyip imzaları verdiğini; publication
adımının önce hata gösterip sonra tamamlandığını bildirdi. Bu inceleme yeni
imza, transfer, quote, upload veya canlı reconcile isteği göndermedi.
Yalnız bu rapor ve entegrasyon durum belgesi değişir. Kaynaklar, dependency,
config, tarayıcı/storage, kullanıcı logu ve index korunur. Ana ajan tek başına
çalıştı; alt ajan açılmadı. Paylaşılan console kaydı güvenli ölçüm alanlarıyla
incelendi; token/imza/request payload kopyalanmadı.

## PROVIDER — ödeme işi ve yayın

21 Eylül **20:38:42 UTC**, final blok **269643805**,
hash `G2cCPSfscK8DD6QjSzKn6HjmwbZ3muS2mTWsqdHdWBaf`:

| Alan | Doğrulanan |
| --- | --- |
| Google hesabı | `29445f46f23551e48c99869c2e34e3acb283902db8196da32cb3f6625872324c` |
| Job / yayın kimliği | `lp-b16e1bcb-e98e-4005-ade7-99c63bdb558b` |
| Başlık | **Distance** |
| Kaynak boyutu | **9.452.298 bayt** |
| MediaJob durumu | **Published** |
| Yayın availability / generation | **ACTIVE / 1** |
| Job'a kaydedilen upload bedeli | **600000 mikro = 0,60 test USDC** |
| Bilet fiyatı | **2,00 USDC**; upload bedelinden ayrıdır |
| Google hesabı güncel USDC | **0** |
| Job oluşturulması | **20:31:46.725 UTC** |
| Yayın zamanı | **20:33:57.519 UTC** |

Job ve yayın aynı final blokta okundu. Ücretli işin zincirde oluşması ödeme
otoritesindeki kabul kanıtıdır; yalnız UI imza başarısı veya bakiye farkına
dayanılmadı. Fonlama/MPC/relay işlemlerinin tek tek makbuzları bu gate'te
uzlaştırılmadı; sponsorun toplam NEAR gideri veya tam transfer geçmişi için
ayrı kabul verilmez. Yeniden ödeme gerektiğine ilişkin kanıt yoktur.

## Kullanıcı logu — görülen hata ve toparlanma

Paylaşılan kayıt 272 satır; çoğu çağrı izidir. İki ölçüm ve bir HTTP hata
satırı vardır:

1. `state_observed: PROCESSING`.
2. `POST /v1/upload-intents` → **409 Conflict**.
3. `state_observed: PUBLICATION_OBSERVED`,
   `chainPublishedAtMs=1790022837519`.

Son zaman değeri zincirdeki yayının zamanı ile **birebir aynı**. Bu bağ,
logun doğrulanan yeni yayına ait olduğunu destekler. İki tarayıcı ölçümü
arasında **65,138 saniye** vardır. Zincirde job oluşturulmasından yayına
**130,794 saniye** geçmiştir. Bu süreler farklı saat kaynakları arasında
çıkarma yapılmadan hesaplandı; dosyanın toplam aktarım süresi bu logda yoktur.

HTTP satırının izi `requestLivepeerUploadIntent` →
`LivepeerPaidUploadForm` publication query → periyodik durum kontrolüdür.
İstek bu aşamada `recovery: reconcile` taşır; yeni ücret veya dosya upload'ı
başlatan ödeme yolu değildir. Bu endpoint sunucu tarafında mevcut işi
uzlaştırabilir; bu incelemede canlı endpoint tekrar çağrılmadı.

409 cevabının JSON `error` alanı logda bulunmuyor. Farklı hata kodları da
409'a eşlenebildiğinden durum kodu tek başına kesin kök neden değildir.

## LOCAL_STATIC / LOCAL_TEST — yeniden üretilen olası yarış

- Web önce zincirde job/yayın okur; henüz yayın görmezse Bridge reconcile
  çağrısı yapar: `apps/web/components/LivepeerPaidUploadForm.tsx:165`.
- Bridge önce final job okur ve `requireExactChainJob` çalıştırır:
  `workers/livepeer-bridge/src/index.ts:1294`.
- Bu kontrol yalnız `Authorized` kabul eder. Aynı doğru iş arada `Published`
  olursa `on_chain_job_mismatch` üretir: `index.ts:6028`.
- Kod HTTP **409** döner. Web bunu `verification_error` olarak gösterebilir:
  `LivepeerPaidUploadForm.tsx:84`.
- Sonraki periyodik zincir okuması aynı yayını görünce published ekranına
  geçer. `retry:false` yalnız sorgunun kendi retry'ını kapatır; ayrı refetch
  interval devam eder. Aralık **5–30 saniye** arasında artar.

Repo değiştirilmeden gerçek guard, HTTP sınıflandırıcısı ve UI fonksiyonu
bellekte derlenip sentetik eşleşen iş üzerinde çalıştırıldı: Authorized
kabulü → Published için 409/on_chain_job_mismatch → UI verification_error →
yayın verisi geldiğinde published. **LOCAL_TEST PASS**. Bu, canlı cevabın
aynı kodu içerdiği kanıtı değildir; diğer 409 sebepleri elenmiş sayılmaz.
Mevcut publication status suite **33 PASS**; yeni ürün düzeltmesi uygulanmadı.

## Önerilen dar düzeltme ve tek sonraki gate

**`NEAR_AUTH_PUBLICATION_POLLING_RACE_SOURCE`**: yayın geçişindeki geçici
çatışmayı kalıcı doğrulama hatası gibi göstermeyen dar kaynak düzeltmesi.
En küçük aday, yalnız ilgili hata sonrasında aynı job/creator için tek taze
zincir sorgusu yapıp yayın gerçekten doğrulanırsa başarıya geçmektir.
Yayın doğrulanmazsa gerçek uyuşmazlık/kimlik/cihaz/expiry hataları korunmalı;
bütün 409 cevapları sessizce başarıya çevrilmemelidir.

Regresyon: ilk zincir okuması yayınsız, Bridge Published geçişinde 409, ikinci
zincir okuması aynı ACTIVE yayın → hatalı kalıcı kırmızı durum yok; farklı
job/creator/gerçek sağlayıcı doğrulama hatası hâlâ reddedilir. Yeni ödeme,
quote, provider asset veya upload çağrısı sıfır kalır. Bu gate henüz açılmadı.

Bu inceleme için blocker yok; gerçek 409'un tam alt nedeni **UNPROVEN**.
Gerçek HLS oynatma, creator playback/reload ve ikinci cihaz kabulü yapılmadı.
Önceki başarısız hesabın denemesi ve hassas çıktı olayı bu başarıyla kapanmaz.

## Kanıt ve korunma

`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-publication-review-MyPOJQ/`:
`publications.json`, `job.json`, `log-summary.json`, `race-check.json`,
`status-tests.log`. Kullanıcının orijinal attachment'ı değiştirilmedi.
Değişen dosyalar: bu rapor ve `near-auth-integration-status.md`.
Doküman build/bağlantı **PASS**; mevcut bundle boyutu uyarısı sürüyor.
Kapsam dışındaki kaynaklar ve Git index başlangıç hash’leriyle aynı.
Kod değişmediğinden tüm suite/build'ler tekrar koşulmadı. İmza/ödeme/upload,
provider/config, CI/deploy ve Git yayın işlemleri **EXTERNAL_NOT_RUN**.
