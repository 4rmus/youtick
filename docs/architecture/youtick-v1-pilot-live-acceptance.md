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

## Yerel kayıt olmadan kurtarma — 30 Eylül 2026

Gate'ler: `YOUTICK_UPLOAD_PENDING_JOB_DISCOVERY_*`, `YOUTICK_UPLOAD_RECOVERY_LIVE_RECORD` — **PASS**.

[#223](https://github.com/4rmus/youtick/pull/223) (`6b7d59f`) Bridge'e üretici başına son ödenmiş job
kaydını ve `GET /v1/creators/:account/pending-upload` ucunu, Web'e bu ipucunu zincirde doğrulayan geri
dönüşü ekledi. [run 36756237995](https://github.com/4rmus/youtick/actions/runs/36756237995) ile 18:11 UTC'de
yayınlandı (Web `757a9815`, Bridge `7dc7aaa9`, read-model `8c42098c`; Next.js 16.3.6 derlemesi);
deploy anahtarı 18:12:15 UTC'de tekrar `false` yapıldı. Uç nokta canlıda 200/`no-store`/izinli-origin CORS,
geçersiz hesapta 400 döndü.

| Adım — `utick2.testnet`, "testtest" `lp-d8d4ad26-1f8c-4f15-9e8c-844f8230f673`, 28.683.934 bayt | Kanıt |
| --- | --- |
| Başlangıç (20:05 UTC) | USDC 1,20; Bridge kaydı `job_id: null` |
| Ödeme (20:12:14) | Tek sponsorlu `create_paid_job` 0,60 USDC; Bridge 20:13'te bu job'u döndürdü |
| Yerel kayıt silindi + yenileme | Owner `youtick:livepeer-*` localStorage/sessionStorage anahtarlarını sildi ve sayfayı yeniledi; "Your upload" kartı göründü (**OWNER_DECLARED**) |
| Resume (20:15:35) | `utick2.testnet` imzalı `replace_upload_key`; upload anahtarı `ed25519:B4rZ9424J3…` → `ed25519:546pwjJLPw…` |
| Yayın (20:19:41) | Operator `finalize_livepeer_publication` → `ACTIVE`, playback `c322z5aukzeppzf1`, tek `asset_id_hash`, doğrulanan = beklenen bayt |
| Ödeme uzlaşması | USDC 1,20 → 0,60 ve sabit; Market 40,64 → 41,24 ve sabit; bu job için üç işlem (ödeme, anahtar değişimi, yayın), ikinci ödeme yok |
| Katalog | 22 yayın, D1 ↔ aynı bloktaki NEAR 0 fark |

Önceki deneme (`soteri.testnet`, `lp-fcf7bc1a-2a07-47ba-911f-dcf1d48164ec`) Bridge kaydının relay'de
yazıldığını gösterdi; 17 MB kaynak owner müdahalesinden önce yayınlandığı için Resume adımını kapsamadı.
Bridge kaydı yayından sonra da job id'yi döndürür; Web yalnız `Authorized` job'u bekleyen sayar.

[#224](https://github.com/4rmus/youtick/pull/224) (Sahne UI) 18:39'da merge edildi ve Preview'a çıktı;
[#225](https://github.com/4rmus/youtick/pull/225) ile geri alındı (`c6a5375`, ağaç `6b7d59f` ile aynı).
Preview'ın revert deploy'u ilk denemede smoke'ta chunk 404 ile otomatik geri döndü, yeniden çalıştırmada
geçti (Web `605c1a4e`). Public-testnet #224'ü hiç almadı.

## Ödenmiş upload'dan vazgeçme ve ret nedeni — 1 Ekim 2026

Gate'ler: `YOUTICK_UPLOAD_ABANDON_PAID_JOB_*`, `YOUTICK_UPLOAD_ADMISSION_REASON_*`,
`YOUTICK_UPLOAD_ABANDON_AND_REASON_LIVE_RECORD` — **COMPLETED_WITH_WARNINGS**.

**Neden:** #221 koruması, NEAR'da `Authorized` kalan ödenmiş job varken yeni upload'ı 24 saate kadar
kilitliyordu; Bridge ise üreticinin aktif upload yerini 30 dakikada bırakır. Bridge iptali
(`/v1/upload-cancellations`) bunu çözmez: yalnız upload intent sonrası ve provider oluşturulmadan önce
(`AUTHORIZED`/`LEASED`) ve job'a bağlı anahtarla çalışır, NEAR'daki job iadesiz kayıt olarak `Authorized`
kalır (`protocol/paid-media-livepeer-v1/README.md`).

- [#227](https://github.com/4rmus/youtick/pull/227) (`2687ffb`): tarayıcıda hesap başına "vazgeçilen job"
  listesi ve "Abandon this paid upload (no refund)" düğmesi (uyarı, Resume yanı ve kart; onay sorusuyla).
  Vazgeçilen job yerel kayıttan ya da Bridge'den gelse de bekleyen sayılmaz; liste yazılamazsa kilit açılmaz.
  [run 36781278673](https://github.com/4rmus/youtick/actions/runs/36781278673) ile 30 Eylül 21:49 UTC'de
  yayınlandı (Web `fb305dad`, Bridge `737b4a86`, read-model `97692f17`).
- [#228](https://github.com/4rmus/youtick/pull/228) (`aaca646`): Bridge public preflight reddine `reason`
  (`active_upload` + üreticinin kendi upload yeri bitişi, `daily_limit` + sonraki 00:00 UTC, `capacity`
  zaman bilgisi olmadan, `source_too_large`) ve `retry_at_ms` ekler; hata kodu, HTTP 409 ve iç
  rezervasyon/relay yanıtları değişmez. Web nedeni yerel saatle gösterir ve hata çıkınca
  "Checking payment options…" yazısını temizler.
  [run 36841023208](https://github.com/4rmus/youtick/actions/runs/36841023208) ile 1 Ekim 09:15 UTC'de
  yayınlandı (Web `8a3f9101`, Bridge `c7f2069f`, read-model `92a103cd`).

Her iki deploy'da `DEPLOY_PUBLIC_TESTNET_ENABLED` owner tarafından açıldı, `public-testnet` ortamı owner
tarafından onaylandı ve deploy sonrası tekrar `false` yapıldı. Katalog her seferinde 22/22, 0 fark.

| Adım — `utick2.testnet`, "Test 4 Abandon" `lp-42c83a9d-56cd-4c6f-9294-ac17e1470d6e`, 17.070.370 bayt | Kanıt |
| --- | --- |
| Ödeme (07:22:05 UTC) | Tek sponsorlu `create_paid_job`, 0,60 USDC; Bridge kaydı bu job'u döndürdü |
| Yenileme + vazgeç | Kart göründü; "Abandon" + onay sonrası kart kalktı, "Check payment options" yeniden tıklanabilir oldu (**OWNER_DECLARED**) |
| Zincir | Job `Authorized` kaldı (son tarih 2 Ekim 07:22 UTC); ikinci ödeme yok, USDC 0'a indi, yayın sayısı 22 |
| Yeni upload denemesi (~07:39 UTC, owner USDC ekledikten sonra) | `/v1/upload-preflight` 409 `admission_denied`; cüzdan onayı istenmedi. Neden: aynı relay'in 30 dakikalık upload yeri (07:52 UTC'ye kadar). Ekran "Upload is not available…" ve "Checking payment options…" yazısını birlikte gösterdi — #228'in nedeni |
| #228 sonrası (09:16 UTC) | Public preflight `soteri.testnet` ve `utick2.testnet` için `{"available":true}`; yeni ret metinleri canlı paketteki `/upload` sayfasında |

Ret yanıtındaki `reason`/`retry_at_ms` canlıda gözlenmedi (iki hesap da uygundu): **LOCAL_TEST + CI**.
Vazgeçme onay sorusu ve kilit açılması yalnız owner gözlemiyle doğrulandı.

## Pilot sertleştirmesi, katalog kapasitesi ve dış izleme — 1 Ekim 2026

Gate'ler: `YOUTICK_PILOT_HARDENING_*`, `YOUTICK_CATALOG_CAPACITY_0009_MIGRATION`, `YOUTICK_OPS_RECORD` — **PASS**.

**Sertleştirme deploy'u.** Owner'ın 29 Eylül tarihli yerel çalışması güncel `main`'e taşınıp
[#232](https://github.com/4rmus/youtick/pull/232) (`6e8fd76`) ile birleştirildi ve
[run 36900934344](https://github.com/4rmus/youtick/actions/runs/36900934344) ile 17:47 UTC'de yayınlandı
(Web `06b55197`, Bridge `8a4ca7f1`, read-model `4bde92a3`). `DEPLOY_PUBLIC_TESTNET_ENABLED` owner tarafından
açıldı, `public-testnet` ortamı owner tarafından onaylandı ve 17:47:56 UTC'de tekrar `false` yapıldı.

| Canlı kontrol (PRODUCTION) | Sonuç |
| --- | --- |
| Güvenlik başlıkları (`/` ve `/api/*`) | HSTS `max-age=31536000`, `nosniff`, `strict-origin-when-cross-origin`, kısıtlayıcı `Permissions-Policy`; mevcut CSP korunur |
| NEAR RPC proxy | Aynı origin 200; `Origin: https://evil.example` → 403 "Cross-origin NEAR RPC request rejected" |
| Upload preflight | `{"available":true}`; upload akışı bozulmadı |
| Bridge / read-model / Web | `ok` / `ok` / 200; katalog 22/22, 0 fark |

İmzasız `creator_id` ile hesap kovası doldurma açığının kapandığı dışarıdan gözlenemez; kanıt kod, testler
ve CI'dır. Oynatıcının yeni `Permissions-Policy` altında tam ekran/PiP/kopyalama davranışı tarayıcıda
denenmedi.

**D1 `0009`.** 17:52:54 UTC Time Travel bookmark
`000000e6-0000094a-000050f7-124217711ab7007f3be94b5b9c2e4197` alındı; `wrangler d1 migrations apply --remote`
yalnız `0009_current_catalog_capacity.sql` çalıştırdı (5 komut). Sonrası: `migrations list` boş, kayıt
`id 9`; `current_catalog_state` `publication_count BETWEEN 0 AND 95`; satır korundu (22 yayın),
`current_publications` dokunulmadı. Sonraki cron yeni tabloya yazdı (blok 271108378 → 271108952); bağımsız
karşılaştırma 22/22, 0 fark; v2 `fresh`, 20 + 2 sayfa.

**Dış izleme.** Owner'ın UptimeRobot hesabında (ücretsiz plan, 5 dakikalık kontrol, hesap e-postasına
bildirim) dört monitör: Web HTTP (`public-testnet.youtick.net`), Bridge ve read-model `/__health` için
`"status":"ok"` yoksa alarm, v2 katalog için `"freshness":"fresh"` yoksa alarm. Kurulumdan sonra dördü de
Up. Geçmiş tarayıcısı gecikmesi, NEAR RPC hata oranı ve DLQ birikimi bu izlemenin kapsamı dışındadır;
#232'deki `pilot-alerts` workflow'u `PILOT_ALERTS_ENABLED` ve secret'lar olmadan çalışmaz (açılmadı).

## Geçmiş tarayıcısının durdurulması — 1–2 Ekim 2026

Gate'ler: `YOUTICK_HISTORY_SCANNER_LAG`, `YOUTICK_HISTORY_TARGETED_SCAN_*`, `YOUTICK_PAUSE_HISTORY_SCANNER_PR_AND_DEPLOY`,
`YOUTICK_SMOKE_INGESTION_FIX_PR_AND_DEPLOY` — **PASS**.

**Ölçüm (1 Ekim 20:05–20:08 UTC, PRODUCTION):** NEAR testnet ~102 blok/dk, ardışık tarayıcı ~64 blok/dk;
gecikme ~250 bin blok ve günde ~55 bin blok artıyor. `catalog_mode=current` ile Keşfet/Profil yeni
katalogu, bakiye ve bilet hakları NEAR'ı okur; tarayıcı tablolarını sunan API yoktur. Hedefli tarama tasarımı
ve salt-okunur dry-run ([#233](https://github.com/4rmus/youtick/pull/233)) aynı aralık için 249.786 bloğu
atlayıp 18 blok okumanın yeterli olduğunu, olay sayılarının canlı kabulle eşleştiğini gösterdi.

**Owner kararı (1 Ekim):** Bugün geçmiş verisine ihtiyaç olmadığı için hedefli yazıcı ertelendi; ardışık
tarayıcı durduruldu. Veri NEAR'da kalıcıdır; ihtiyaç doğarsa dry-run/yazıcı ile doldurulur.

| Adım | Kanıt |
| --- | --- |
| [#234](https://github.com/4rmus/youtick/pull/234) (`3ee14be`) | Public-testnet read-model `READ_MODEL_INGESTION_ENABLED` = mod açık **ve** Web current katalogu okumuyor; `off`/`shadow` geri açar |
| İlk deploy, [run 36926166783](https://github.com/4rmus/youtick/actions/runs/36926166783) | Smoke `release_smoke_read_model_mismatch` (smoke `ingestionEnabled`'ı hâlâ moda bağlıyordu) → otomatik geri dönüş, canlı sağlıklı kaldı |
| [#235](https://github.com/4rmus/youtick/pull/235) (`b7687f3`) | Kural `publicReadModelIngestionEnabled()` ile hem pakete hem smoke beklentisine bağlandı; mutasyon testleri iki yönde kırılıyor |
| Deploy, [run 36989630307](https://github.com/4rmus/youtick/actions/runs/36989630307) (2 Ekim 12:51 UTC) | Web `de3738ca`, Bridge `68489abd`, read-model `d60dc924`; smoke PASS; anahtar 12:52:06 UTC'de `false` |
| Canlı sonrası | Read-model `ingestionEnabled: false`, `stage: ENABLED`; tarayıcı watermark 12:52→12:54 **270932067** sabit; katalog 271228276→271228497 yenileniyor, 22/22, 0 fark; Bridge/Web `ok`/200 |

D1'deki geçmiş satırlar silinmedi. `catalog_mode=off`'a dönüşte v1 listesinin bayat olacağı runbook'a yazıldı.

## Açık bulgular

1. ~~Yenileme sonrası "Your upload" kartı görünmedi.~~ Yerel kayıt olmadan kart ve Resume yukarıdaki
   kabulde gözlendi; ilk gözlemin nedeni **UNPROVEN** kalır.
2. ~~Bekleyen job yalnız tarayıcının yerel kaydıyla bulunuyor.~~ #223 ile Bridge ipucu eklendi ve canlıda
   doğrulandı. Yalnız deploy sonrası relay'ler kayıtlıdır; `lp-524cbcdb-…` kapsam dışıdır (1 Ekim 14:37 UTC'de
   süresi dolar, kayıp 0,60 test USDC).
3. ~~İptal oturum anahtarına bağlı.~~ Kullanıcının asıl ihtiyacı (kilidi açmak) #227 "vazgeç" ile karşılandı.
   Bridge iptali hâlâ yalnız dar pencerede ve oturum anahtarıyla çalışır; bu davranış değişmedi.
4. ~~Belge/kod uyumsuzluğu.~~ `allowUploadKeyReplacement` ve `near-auth-*`/`NearAuth*` dosyaları #214 ile
   girip cüzdanlı V1 adayı #215 (`ad84ba2`) ile `main`'den çıkarıldı; kod hatası değil.
   [#230](https://github.com/4rmus/youtick/pull/230) `near-auth-upload-safety.md` başına bunu ve güncel cüzdan
   davranışını anlatan tarihli not ekledi. NEAR Auth çalışması yalnız yerel
   `codex/near-auth-preserve-20260927` dalındadır; 1 Ekim'de kalıp tabanlı sır taramasından sonra (bulgu yok)
   `main`'e birleştirilmeden uzak depoya yedeklendi (`f4cccd9`).
5. ~~Geçmiş tarayıcısı geride.~~ Tarayıcı yetişemeyecek şekilde tasarlanmıştı (~64 vs ~102 blok/dk) ve verisini
   kullanan yoktu; owner kararıyla `catalog_mode=current` iken durduruldu (#234, #235). Geçmiş raporu gerekirse
   hedefli tarama (#233) ile doldurulur.
6. **Copilot "AI findings" kontrolü** birden fazla PR'da "model not supported" ile başarısız oldu; zorunlu
   değil, repo ayarıdır.
7. **Vazgeçme Bridge'deki upload yerini boşaltmaz.** Vazgeçtikten sonra 30 dakikaya kadar yeni upload
   reddedilebilir; #228 ile kullanıcı artık nedeni ve tekrar deneme saatini görür.

## Çalıştırılmayanlar

Başka tarayıcı/cihazda Resume (aynı sekmede yerel kayıt silinerek taklit edildi), canlı ret nedeni metni,
iptal, takedown → provider `404`, mobil/Safari ve diğer
tarayıcılar, provider hesabında asset sayısı okuması, yeni yayının katalogda ilk görünme gecikmesi
(90 s hedefi) — **EXTERNAL_NOT_RUN**.

**Tek sonraki gate:** `YOUTICK_WORKTREE_CLEANUP_20261002` — bu oturumda birleşmiş worktree ve yerel dalları,
salt-okunur listeleme ve owner onayıyla kaldırmak.
