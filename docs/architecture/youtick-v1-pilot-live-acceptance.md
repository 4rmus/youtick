# YouTick V1 — public-testnet canlı kabul kaydı

30 Eylül 2026 · Gate'ler: `YOUTICK_PILOT_LIVE_ACCEPTANCE`, `YOUTICK_UPLOAD_RECOVERY_DRAFT_GUARD_*`,
`YOUTICK_PILOT_LIVE_ACCEPTANCE_RECORD`
**COMPLETED_WITH_WARNINGS — cüzdanlı ana akışlar canlıda geçti; kurtarma ve iptal yollarında açık bulgular var.**

## Kapsam ve karar

- Public-testnet 29 Eylül 17:28 UTC'den beri `mode=acceptance`, `catalog_mode=current` ile açık.
  Owner 30 Eylül'de bunun **bilinçli** olduğunu teyit etti; önceki belgelerdeki NO-GO kaydı
  bu karardan önceye aittir.
- Owner (kurucu), 100 USD toplam bütçeyi pilot ön koşulu olmaktan çıkardı. Livepeer **Growth** planı
  aktif ve Cloudflare ödemesi yapılmış (**OWNER_DECLARED**; hesap okunmadı). Kodda uygulanmış dolar
  tavanı yoktur.
- Hesaplar: üretici `soteri.testnet` ve `utick.testnet`, alıcı `utick.testnet`/`soteri.testnet`,
  yetkisiz hesap `utick2.testnet`. İmza, ödeme ve upload adımlarını owner tarayıcıda yaptı;
  koordinatör her adımı salt-okunur NEAR RPC, D1 ve Bridge okumalarıyla doğruladı.

Market `video-market-v1-260907.youtick-dev-v3.testnet`, USDC
`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`. Tutarlar test USDC'dir (6 ondalık).

## Sonuçlar

| Senaryo | Kanıt | Sonuç |
| --- | --- | --- |
| Upload — `utick.testnet`, "Katalog Test" `lp-085ad02b-dac4-4b03-a7ee-5aed52f28293` | Tek `create_paid_job` (0,60 USDC); job 14:26:29 → provider ready 14:30:01 → NEAR yayın 14:30:12 UTC; tek `asset_id_hash`, `ACTIVE`; 17.070.370 bayt beklenen = doğrulanan | ✅ PRODUCTION |
| Satın alma — `soteri.testnet` ve `utick2.testnet` aynı yayına | Her biri tek 2,00 USDC ödeme; ikisinde de `has_entitlement=true`; üretici bakiyesi 5,88 → 9,68 (2 × 1,90, %95); Market +4,60 = 3,80 + 0,20 komisyon + 0,60 upload ücreti | ✅ PRODUCTION |
| Oynatma — iki alıcı ve üretici | Owner gözlemi; tarayıcı/cihaz listesi kaydedilmedi | ✅ OWNER_DECLARED |
| Yetkisiz erişim — `utick2.testnet`, `lp-759ba786-52fb-4e75-a38f-58409ae6b999` | `has_entitlement=false`, bakiye değişmedi; oynatmanın açılmadığı owner gözlemi | ✅ PRODUCTION + OWNER_DECLARED |
| Üretici çekimi — `utick.testnet` | 14:36:20 UTC tek `withdraw_creator_balance`, 9,68 USDC cüzdana; kontrat bakiyesi 0; Market bakiyesi uzlaştı | ✅ PRODUCTION |
| Upload sırasında yenileme — düzeltme öncesi, `lp-524cbcdb-88b9-44e4-8ea1-c1b4bb1f222b` | Job `Authorized`, ücret ödendi; yenileme sonrası farklı dosyayla "Check payment options" tek yerel taslağı ezdi; Resume çıkmadı, yeni upload `admission_denied` (aktif upload + günlük 2 sınırı) | ❌ FAILED → [#221](https://github.com/4rmus/youtick/pull/221) |
| Upload sırasında yenileme — düzeltme sonrası, `soteri.testnet` "Upload 2 Test" `lp-4693738b-74f6-49f9-9d60-8f25a23d744e` | Aynı sekmede yenileme → aynı dosya → Resume → Published (16:18:56 → 16:23:39 UTC); tek 0,60 ücret, tek job, tek asset; `utick.testnet` tek 2,00 ile satın aldı ve izledi | ✅ PRODUCTION |
| Katalog | Her adımdan sonra D1 `current_publications` ile aynı bloktaki NEAR `get_publications` alan alan eşleşti (18 → 19 → 20 yayın, 0 fark); v2 detay ve üretici listesinde yeni yayın görünür | ✅ PRODUCTION |

Düzeltme [#221](https://github.com/4rmus/youtick/pull/221) `70851d7` ile
[run 36739468576](https://github.com/4rmus/youtick/actions/runs/36739468576) üzerinden 16:06 UTC'de
yayınlandı (`acceptance`, `catalog_mode=current`; Web `885c6e85`, Bridge `f38f3017`, read-model
`9104c0e3`). `DEPLOY_PUBLIC_TESTNET_ENABLED` deploy için açıldı ve 16:06:55 UTC'de tekrar `false` yapıldı.

## Açık bulgular

1. **Yenileme sonrası "Your upload" kartı görünmedi.** Kurtarma dosya seçimiyle çalıştı, ancak kartın
   yönlendirme metni gözlenmedi. Yer işareti ödeme gönderilirken yazılıyor
   (`apps/web/lib/livepeer-upload.ts` `setUploadDraftFlag`); neden **UNPROVEN**.
2. **Bekleyen job yalnız tarayıcının yerel kaydıyla bulunuyor.** Taslak ve `livepeer-last-job` yer işareti
   yoksa (başka tarayıcı/cihaz, silinmiş site verisi) ödenmiş job arayüzden bulunamaz.
   `lp-524cbcdb-…` bu yüzden kurtarılamadı; 1 Ekim 14:37 UTC'de süresi dolar, kayıp 0,60 test USDC.
   Kalıcı çözüm üreticinin bekleyen job'unu zincirden veya Bridge'den bulmaktır.
3. **İptal oturum anahtarına bağlı.** "Cancel job (no refund)" yeni sekmede anahtar yoksa çalışmaz.
4. **Belge/kod uyumsuzluğu:** `near-auth-upload-safety.md`, kodda olmayan `allowUploadKeyReplacement`
   bayrağından söz ediyor.
5. **Geçmiş tarayıcısı ~199 bin blok geride.** Yeni katalog etkilenmez; satış/geçmiş raporları etkilenir.
6. **Copilot "AI findings" kontrolü** bir PR'da "model not supported" ile başarısız oldu; zorunlu değil,
   repo ayarıdır.

## Çalıştırılmayanlar

Yeni sekmede Resume (`replace_upload_key`), iptal, takedown → provider `404`, mobil/Safari ve diğer
tarayıcılar, provider hesabında asset sayısı okuması, yeni yayının katalogda ilk görünme gecikmesi
(90 s hedefi) — **EXTERNAL_NOT_RUN**.

**Tek sonraki gate:** `YOUTICK_UPLOAD_PENDING_JOB_DISCOVERY` — bulgu 1 ve 2: bekleyen ödenmiş job'u
yerel kayıttan bağımsız bulmak ve yenileme sonrası kartın görünmesini sağlamak.
