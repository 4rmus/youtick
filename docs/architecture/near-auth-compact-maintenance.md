# Compact bakım kapanışı

Gate: `NEAR_AUTH_COMPACT_MAINTENANCE` — 18 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS**. Sistem bakımda bırakıldı;
Market kodu değiştirilmedi ve yeniden açılış yapılmadı.

## Uygulanan işlemler

- Taze başlangıç: 13 Published iş, aktif admission rezervasyonu yok,
  13/13 operator kaydı confirmed. Kaynak main `6739ec7`, CI 35276310906
  başarılı; code/key/rol/policy eşleşmeleri korundu.
- Kullanıcının `pause_new_purchases` imzasından sonra final blokta
  `new_purchases_paused=true` doğrulandı. İşlem hash'i paylaşılmadığından
  bu adımın ayrı makbuzu/ücreti raporlanmıyor; final durum kanıtı mevcut.
- [Korumalı kapalı yayın 35313295412](https://github.com/4rmus/youtick/actions/runs/35313295412)
  **PASS**. Paket exact `6739ec743850afe08b6bc1cade18091c71c723d4`,
  `closed` mod ve doğru hedeflerle, hash ve GitHub kaynak doğrulamasından
  geçirildikten sonra onaylandı. Yalnız mevcut public-testnet ortamı kullanıldı.
- `DEPLOY_PUBLIC_TESTNET_ENABLED` bu koşu için geçici açıldı ve başarıdan
  hemen sonra **false**'a döndürüldü. `DEPLOY_PREVIEW_ENABLED=false` korundu.
- Kullanıcının [freeze işlemi](https://testnet.nearblocks.io/txns/5b9VyJXGqYNNpQPMNGVGcKvne8c12vgFf2AJUkWj3CMt)
  RPC'de **FINAL / SuccessValue**: guardian
  `lp-arch-guardian-260809.youtick-dev-v3.testnet`, hedef mevcut Market,
  tek `freeze_bridge({})`, 30 Tgas ve 0 deposit. `bridge_frozen` olayı
  blok **269106002**'de yayımlandı. Makbuzların toplam tokens_burnt değeri
  **0,0002229733033215 test NEAR**; ilk pause ücreti buna dahil değildir.

## Kapalı runtime

| Bileşen | Sürüm |
| --- | --- |
| Web | `4de27b99-d20f-45e0-901d-714c03a929a1` |
| Bridge | `a0f8458e-5a9d-4e35-aa3f-01def357229e` |
| Read-model | `262668d3-abe5-4322-bb95-21d23919d1b8` |

Bridge ve read-model health sürümleri receipt ile eşleşiyor. Web sürümü
korumalı deploy receipt/smoke kaydından alınmıştır. Bridge **DISABLED**;
provider/operator mutation, yeni upload, sponsor quote/relay, playback/v2
ve webhook queue readiness alanları **false**. Bridge `compactUpload`
version **1**, doğru testnet/Market kimliği sunuyor; bu özellik şu anda kapalı.

Market hâlâ eski code hash'inde:
`5DsjPD8zDFjhMWF8ro1ATi9xWY1YjGATfw31hVc7H7y` / **376382 bayt**.
13 işin tamamı, platform USDC/NEAR bakiyeleri ve Access state başlangıçla
aynı. Guardian işlemlerinin storage/gas etkileri nedeniyle genel kontrat
hesap bakiyesi ve storage kullanımının aynı kaldığı iddia edilmez.

## Deploy için bakım snapshot'ı

Mevcut `market-code-update.mjs snapshot --target public-testnet` doğrulayıcısı
**PASS** verdi. Ayrı tam okuma aynı final blok ve state hash'ini doğruladı:

- Final blok: **269106149**.
- Blok hash: `bJtsp8h7i6sPLfgeXfsD9K6XunYrPwcLY5vA6BWhbzx`.
- Raw-state SHA-256:
  **`ed8ee8987d1001532d8a1e124991da11bf0851205fa4e8a9e26de6e5f6978fb7`**.
- `bridge_frozen=true`, `new_purchases_paused=true`.
- Yayın sayısı **13**; platform bakiyeleri **9340000 microUSDC / 0 yoctoNEAR**.
- Boş rezerv **0,886840968004289300000005 NEAR**; yeni kod için gereken
  **0,21909 NEAR** başlangıç payını karşılıyor. Bu pay harcama tavanı değildir.

Onay paketi: `tmp/near-auth-maintenance-sixnbjm3/market-deploy-review.json`.
Exact main/CI, WASM hash'i, policy hash'i ve yeni state hash'i dolu;
`authorized=false`. Yayından hemen önce tekrar eşleşmeleri gerekir;
state/main/policy değişirse eski paketin varsayımlarıyla ilerlenmez.

## Sınırlar ve yan etki

Gerçek cüzdan imzalarını kullanıcı yaptı; agent imza üretmedi. İş/taslak,
cihaz anahtarı veya kesinleşmiş outbox kayıtları temizlenmedi. Market deploy,
yeniden açılış, yeni ödeme/upload ve gerçek Google/MPC/HLS kabulü yapılmadı.

Yerel NEAR CLI 0.29.0'a `--version` sorulması aracın kendi config dosyasını
otomatik **V3→V4** taşıdı. Bu istenmeyen yerel format yan etkisi kaydedildi;
eski dosyanın tam yedeği olmadığı için tahmini bir geri yazma yapılmadı.
Bu sorgu zincire işlem göndermedi. Anahtar rotasyonu yapılmadı.

Repo kaynak değişikliği yalnız bu rapor ve güncel entegrasyon durumudur;
asıl çalışma alanının diğer dosyaları ve index'i korundu. Kanıtlar
`tmp/near-auth-maintenance-sixnbjm3/evidence/` altında. Doküman build ve
kapsam kontrolü geçti; uygulama kodu değişmediği için unit suite'leri
tekrarlanmadı. Kanıt sınıfları: **CI / PROVIDER / LOCAL_STATIC**; testnet
kapalı yayın gerçek Google veya Production kabulü değildir.

**Tek sonraki gate: `NEAR_AUTH_COMPACT_MARKET_DEPLOY`.** Ayrı açık onayla
inceleme paketindeki tek `DeployContract` işlemini korumalı workflow'dan
göndermek; yeni code hash, ham state eşitliği, bakiye/yayın sayısı ve compact
version=1 doğrulamak. **Sistem bakımda kalır; yeniden açılış bu gate'e dahil
değildir.** Bu sonraki gate henüz açılmadı.
