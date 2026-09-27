# YouTick V1 — ayrı yerel hazırlık

27 Eylül 2026 · Gate: `YOUTICK_V1_ISOLATED_PREPARATION` · **COMPLETED_WITH_WARNINGS**

## Amaç ve kapsam

Mevcut cüzdanla çalışan kontrollü **testnet pilotunun yerel adayını** hazırlamak.
Kullanıcının güncel dizin adı **youtick-ver-1**; önceki “UTIC v1” önerisinin yerini alır.
Yalnız yeni dizinde seçili kod/test, repo rehberleri ve bu rapor değiştirilebilir.
Kaynak checkout, kaynak Git kayıtları/index, gizli ayarlar, tarayıcı ve canlı veri yasaktır.
Kabul: yedi ortak düzeltme, hedefli yerel testler, sosyal giriş/kart kodunun dışarıda kalması,
kaynak çalışma alanının korunması. Commit/push/CI/deploy/canlı kabul kapsam dışıdır.

## Yerel aday — LOCAL_STATIC

- Dizin: `/Users/arair/works/youtick-ver-1`; dal: `codex/youtick-ver-1`.
- HEAD/temel: `f71178263c5d264bef647feaae8a2b54618b1333`.
- Seçili kaynak: `2e28e570ea933ca471113e46306b286066befbd3`; bütün commit taşınmadı.
- Ayrı yerel clone: `--local --no-hardlinks --no-checkout`; alternates yok.
  `origin` yerel kaynak checkout'a işaret eder; uzaktan fetch/push yapılmadı, release ayarı değildir.
- Paket sürümleri/lock'lar, WalletProvider/Watch/Player/middleware, ağ ve feature flag varsayılanları
  temel sürümle aynı. Sosyal giriş UI/API, Auth0/jose/MPC uygulaması ve kart entegrasyonu eklenmedi.
- Kurulu bağımlılıklar bağımsız kopyalandı; kaynak cache'leri paylaşılmadı.
  Kopya bağımlılıklardaki symlink'ler yeni dizin içinde kalıyor; env/runtime/anahtar/ham günlük kopyalanmadı.
- `AGENTS.md` ve repo skill rehberleri korunan kaynaktan alındı; global agent ayarları değiştirilmedi.
  Eski temel-seçim raporu kaynak dizinde olduğu gibi bırakıldı.

## Uygulanan ortak düzeltmeler

| Grup | Sonuç |
|---|---|
| Compact uyum | Bridge compact relay/delegated playback okuması ve health version=1; paylaşılan çözücü/vektörler |
| Kontrat uyumu | Compact decoder/getter; JSON yolu, state ve token predecessor kuralları korunuyor; ABI regresyonu |
| Taslak koruma | Hazırlık/imza öncesi geçerli güncel taslak, ayrı yazma kontrolü, doğrulanmış kayıt ve güvenli hata mesajları |
| Teklif tazeliği | Hazırlık ve son broadcast öncesi kontrol; önceki belirsiz gönderim önce uzlaştırılır |
| Yayın yarışı | Yalnız on_chain_job_mismatch için aynı creator/job/generation=1 ACTIVE kaydına tek tekrar okuma |
| Başlık sınırı | Web/form, Bridge ve compact/Rust arasında ortak başlık/UTF-8 vektörleri |
| Anahtar/hesap koruma | Bozuk upload anahtarı okuması kaydı silmez; bozuk cihaz temizliği yalnız ilgili hesaba uygulanır |

Ortak protokol değişikliklerinin Web ve kontrat kontrollerini seçmesi için mevcut CI yol eşlemesi
iki satırla güncellendi; yerel regresyon eklendi. CI çalıştırılmadı.
Sosyal giriş readPreparedPlaybackDevice, product resume/intentAttempted, public-only quote ayarı
ve localhost release istisnası taşınmadı. Bağımsız salt-okunur değişiklik incelemesi **PASS**;
tam güvenlik denetimi veya canlı kabul değildir.

## Taze doğrulamalar — LOCAL_TEST

| Kontrol | Sonuç |
|---|---|
| Web hedefli 7 dosya | **231 test PASS** |
| Bridge index/playback 2 dosya | **176 PASS, 3 opt-in test SKIPPED** |
| CI güvenlik/yol eşlemesi | **17 test PASS** |
| Web tüm kaynak tipi ve değişen üç kaynakta ESLint | PASS |
| Bridge TypeScript | PASS |
| Rust 1.86.0 offline lib / paid_media_livepeer_v1 | **12 + 41 test PASS** |
| Rust fmt / clippy tüm hedefler, warnings=error | PASS |
| Market + Access yeni offline WASM/ABI build, cargo-near 0.17.0 | PASS |
| Yeni ABI doğrulaması / protokol | **Market 48, Access 26 yöntem PASS / OK** |
| Doküman build | PASS |
| Değişiklik boşluk kontrolü | PASS |

Web:
```sh
npm test -- --run __tests__/unit/livepeer-upload.test.ts __tests__/unit/livepeer-upload-status.test.ts \
  __tests__/unit/device-session.test.ts __tests__/unit/compact-upload.test.ts \
  __tests__/unit/livepeer-watch.test.ts __tests__/unit/wallet-provider.test.ts \
  __tests__/unit/livepeer-playback-v2.test.ts
./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/eslint lib/livepeer-upload.ts lib/device-session.ts components/LivepeerPaidUploadForm.tsx
```
Bridge: `npm test -- --run src/index.test.ts src/playback-v2.test.ts`, `npm run check`.
Repo: `node --test scripts/ci-security.test.mjs`,
`node scripts/check-paid-media-livepeer-v1-abi.mjs`,
`node scripts/check-paid-media-livepeer-v1.mjs`, `npm run build --prefix docs`.
Market: `cargo +1.86.0 test --offline --lib`, `cargo +1.86.0 test --offline --test paid_media_livepeer_v1`,
`cargo +1.86.0 fmt --all --check`, `cargo +1.86.0 clippy --offline --all-targets -- -D warnings`.
İki kontrat kendi dizininde `CARGO_NET_OFFLINE=true` ve yeni dizine özel PATH ile
`cargo +1.86.0 near build non-reproducible-wasm --locked`; eski artifact kullanılmadı.
0.17.0 araç kopyası `tmp/tools/bin/cargo-near`; SHA-256
`f28372c9351810b026d047f24fb36efdc1b8e146c35e6faad72cd1657fd4df79`.

Yeni artifact'lar:
- `contracts/nft-ticket/target/near/youtick_nft.wasm`: 388255 byte,
  SHA-256 `c7f06d1e4722f1a8014b0853a10b6a926e823fb05a6a40892e5327251d6cf90b`;
  ABI `youtick_nft_abi.json` aynı dizinde.
- `contracts/access-control/target/near/youtick_access_control.wasm`: 210442 byte,
  SHA-256 `773db9f20ee8f5a136346b856ea6a65d94721702a8ee8271e0d523b93d344937`;
  ABI `youtick_access_control_abi.json` aynı dizinde.
Bunlar yerel build; yayın veya deployed code hash kanıtı değildir.

## Uyarılar ve korunma

Web Vite gelecekteki CommonJS yapılandırmasına, doküman build'i 500 kB üzeri bundle'a
ilişkin engellemeyen uyarı verdi. Bridge'in üç yüksek-yük/kötüye-kullanım opt-in testi çalıştırılmadı.
İlk çalışma dizini hataları doğru dizinden giderildi; nihai kontroller yukarıda.
Önce-hata test koşusu yapılmadı; mevcut donor davranış regresyonları yeni adayda çalıştırıldı.

**Beklenmeyen araç davranışı:** ilk cargo-near 0.17.0 build'i şunları yazdı:
`Migrating config.toml from V1 to V2...`, `Migrating config.toml from V2 to V3...`.
Gösterdiği dış ayar yolu `/Users/arair/Library/Application Support/near-cli/config.toml`.
Ana ajanın yalnız metadata kontrolünde dosyanın değişiklik zamanı build başlangıcında:
`2026-09-27T15:01:58.992551+00:00`, 2718 byte; SHA-256
`7770bd5d39dec9ee7ace56fa9e6b271e3f9bf27eeb69e3d5953148251684e406`.
Yakında config yedeği bulunmadı. Ön özet olmadığından eski içeriği ve tam değişiklik farkı bilinmiyor.
İçerik/değerler görüntülenmedi; otomatik geri alma yapılmadı. Ek CLI başlatılmadı.
Bu kapsam dışı araç yan etkisi nedeniyle sonuç uyarılıdır; global ayarın korunduğu iddia edilmez.

Kaynak checkout'taki başlangıç **502 dosya + HEAD/index/ref** kontrolü: PASS; tümü aynı.
Yeni değişiklikler stage edilmedi/commit edilmedi; kaynak sosyal giriş çalışması ve iki ham günlük korunur.

## Çalıştırılmayanlar, engel ve sonraki gate

Çalıştırılmayan yerel kontroller: Web production build ve tarayıcı testleri; tam uygulama build'i iddia edilmez.
**EXTERNAL_NOT_RUN / UNPROVEN:** yeni uzak CI, tarayıcı/provider/testnet ödeme-yükleme,
Preview/Production, gerçek V1 cüzdan kabulü, güncel bağımlılık güvenlik taraması.
Mevcut release policy tarihli ve güncel compact kontrat için doğrulanmış değildir; değiştirilmedi.
Pilot için ayrı onaylı testnet/network ayarı ve güncel ABI/policy/canlı kabul gerekir.
Kaynak %5 oranı güncel canlı oranı kanıtlamaz. Gerçek para, hukuk/vergi/iade rolleri ve kart sağlayıcısı
yazılı kabulü ayrı açılış kapsamıdır. Bu yerel aday yayına hazır ilan edilmez.

**Tek sonraki gate:** `YOUTICK_V1_PRODUCT_DOCUMENTATION` — V1 özellikleri/kripto ödeme/YouTick rolünü
proje belgesi, landing, kullanım koşulları ve gizlilikte tutarlı anlatma.
Bu gate yalnız yerel hazırlıkta durur; otomatik commit/push/deploy veya dış iletişim yapılmaz.

## Ek — değişen açık dosyalar

Toplam **56 dosya**: 15 değişmiş takipli, 41 yeni (34 repo skill kaydı, 6 uyum/test dosyası, bu rapor).

```text
M .github/workflows/ci.yml
M AGENTS.md
M apps/web/__tests__/unit/device-session.test.ts
M apps/web/__tests__/unit/livepeer-upload-status.test.ts
M apps/web/__tests__/unit/livepeer-upload.test.ts
M apps/web/components/LivepeerPaidUploadForm.tsx
M apps/web/lib/device-session.ts
M apps/web/lib/livepeer-upload.ts
M contracts/nft-ticket/src/lib.rs
M contracts/nft-ticket/tests/paid_media_livepeer_v1.rs
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
? protocol/paid-media-livepeer-v1/compact-upload-vectors.json
? protocol/paid-media-livepeer-v1/compact-upload.ts
? protocol/paid-media-livepeer-v1/title.ts
? protocol/paid-media-livepeer-v1/upload-title-vectors.json
? docs/architecture/youtick-v1-isolated-preparation.md
```
