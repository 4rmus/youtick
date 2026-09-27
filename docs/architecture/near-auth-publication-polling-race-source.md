# Publication sorgusu — yayın geçişi yarışı düzeltmesi

Gate: `NEAR_AUTH_PUBLICATION_POLLING_RACE_SOURCE` — 21 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS / LOCAL_STATIC + LOCAL_TEST**.
Yerelde yeniden üretilen yayın geçişi için Web düzeltmesi tamamlandı.
Gerçek olayın 409 alt hata kodu hâlâ bilinmiyor; yeni canlı kabul yapılmadı.

## Kapsam ve uygulama

Ana ajan tek yazardır; alt ajan açılmadı. İzinli yollar yalnız ortak Web
upload formu, mevcut publication status testleri, bu rapor ve entegrasyon
planıdır. Bridge/kontrat, bağımlılık, config, flag, canlı veri, tarayıcı/cüzdan
kayıtları, kullanıcı logları ve Git index kapsam dışıdır.

`LivepeerPaidUploadForm.tsx` içindeki mevcut publication sorgusu:

1. Önceki zincir okuması yayınsızken Bridge mevcut işi reconcile eder.
2. Yalnız tam `on_chain_job_mismatch` hatasında, aynı job ve creator ile
   **bir ek `readLivepeerUploadProgress` kontrolü** yapılır. Bu kontrol mevcut
   job/publication view çağrılarını kullanır; React Query cached verisi değildir.
3. Dönen yayın kimliği ve creator aynı, generation **1**, availability
   **ACTIVE** ise yayın doğrulanmış sonuç olarak döner; hata ekranına geçilmez.
4. Yayın eksik/uyuşmaz veya ek okuma başarısızsa ilk hata aynen korunur.
   Diğer sağlayıcı, cihaz ve genel HTTP 409 hatalarında ek kontrol yapılmaz.

Yeni helper/servis/paket yok. Periyodik sorgu aralığı ve `retry:false` korunur.
Bridge yeniden çağrılmaz; ödeme, quote, imza ve dosya upload yolları çağrılmaz.
Mevcut normal cüzdan ve Google formu aynı sorgu düzeltmesini kullanır.
Yayın doğrulandıktan sonraki mevcut taslak temizliği davranışı değiştirilmedi;
bu gate gerçek tarayıcıda temizlik veya durum sorgusu tetiklemedi.

## Sınır

Bu Web düzeltmesi tarayıcı Network/console kaydındaki ilk **409** satırını
ortadan kaldırmaz. Etkisi, aynı yayın zincirde doğrulanabildiğinde kullanıcıya
doğrulama hatası göstermemektir. Bridge'in güvenlik kontrolleri aynen
kalır. Gerçek 409 farklı bir hata kodundan kaynaklandıysa bu dal onu maskelemez.
Önceki olayın tam canlı nedeninin kanıtlandığı iddia edilmez.

## Doğrulama

Mevcut test dosyası gerçek formun `queryFn` akışını kullanır; dış okumalar
sahtedir. Düzeltmeden önce **7 yeni test başarısız**, sonra aynı dosyanın
**44 testi PASS**. Yeni 11 regresyon şu koşulları kapsar:

- İlk okuma yayınsız, Bridge mismatch, ikinci okuma aynı ACTIVE yayın:
  başarılı sonuç; aynı job/creator ile iki okuma, yalnız bir Bridge çağrısı.
- Eksik yayın, farklı job, farklı creator, farklı generation, takedown veya
  başarısız ikinci okuma: ilk mismatch reddi korunur.
- Sağlayıcı doğrulama hatası, cihaz nonce reddi, genel HTTP 409:
  maskeleme ve ek zincir okuması yok.
- Yayın ilk okumada zaten mevcutsa Bridge çağrısı yok.
- Yeni ücretli iş yetkilendirme ve dosya upload çağrıları sıfır.

| Kanıt | Sonuç |
| --- | --- |
| LOCAL_TEST — Web tüm unit/integration suite | **48 dosya / 856 PASS** |
| LOCAL_STATIC — auth tip kontrolü | **PASS** |
| LOCAL_STATIC — lint | **PASS** |
| LOCAL_STATIC — izole Web build | **PASS** |
| LOCAL_STATIC — doküman build / bağlantılar | **PASS** |

Build ayrı kaynak kopyasında, sentetik testnet adresleriyle yapıldı;
çalışan sunucunun `.next` çıktısına yazılmadı. Mevcut Vite/Next ve doküman
bundle uyarıları hata sayılmaz. Bridge/kontrat değişmediği için testleri
tekrarlanmadı. Tarayıcı veya gerçek Google/MPC/ödeme/upload/HLS denemesi,
CI, deploy, provider/config ve Git yayın işlemleri **EXTERNAL_NOT_RUN**.

## Dosyalar, kanıt ve sonraki gate

Değişen dosyalar:

- `apps/web/components/LivepeerPaidUploadForm.tsx`.
- `apps/web/__tests__/unit/livepeer-upload-status.test.ts`.
- `docs/architecture/near-auth-publication-polling-race-source.md`.
- `docs/architecture/near-auth-integration-status.md`.

Başlangıç kopyaları ve test/build kayıtları:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-publication-race-source-nj6pvlt8/`.
Kaynak gate'inin blocker'ı yok. Yerel başarı canlı runtime/deploy veya
olayın kesin kök neden kanıtı değildir.

**Tek sonraki gate: `NEAR_AUTH_CREATOR_PLAYBACK_RELOAD_ACCEPTANCE`.**
Mevcut **Distance** yayını `lp-b16e1bcb-e98e-4005-ade7-99c63bdb558b` ile
aynı Google hesabı/cihaz üzerinde creator playback, gerçek HLS ve reload
kabulünü değerlendirmek. Yeni ödeme veya yeniden yükleme yok; bu gate açılmadı.
