# YouTick V1 — main tabanlı yerel entegrasyon

27 Eylül 2026 · Gate: `YOUTICK_V1_GITHUB_INTEGRATION_SOURCE`
**COMPLETED_WITH_WARNINGS — yerel kabul PASS; uzak CI/yayın hâlâ NO-GO.**

## Amaç ve kapsam

[Ön kontroldeki](./youtick-v1-github-integration-preflight.md) açık dosya planını güncel main
tabanına uygulamak; cüzdan V1 ağacını, sosyal geçmişi ve main güvenlik kontrollerini birlikte korumak.
Yalnız manifest dosyaları/silmeleri, tarihsel status banner'ı ve bu yeni rapor yazılabilir.
Tam Web kontrolünde bulunan iki eski metin beklentisi için ana ajan ayrıca Terms'in dar
faucet yönlendirmesini ve `active-ui-copy.test.ts` yolunu onayladı.
Diğer kaynak, eski checkout, global ayar, env/secret/runtime ve uzak işlemler yasaktır.
Kabul: beklenen ağacın byte/mode eşitliği, korunacak main dosyaları, sosyal runtime yokluğu,
yeni yerel testler ve açık kayıt kapsamı. Commit/push/PR/CI/deploy kapsam dışıdır.

## Oluşturulan yerel çalışma

- Dizin: `/Users/arair/works/youtick-ver-1`.
- Yeni dal: `codex/youtick-v1-integration-20260927`.
- HEAD / main tabanı: `6739ec743850afe08b6bc1cade18091c71c723d4`; yeni commit yok.
- V1 byte kaynağı: `ffa9e945f3507c368fe8e4e0bb0988e463f2f5fb`.
- Eski `codex/youtick-ver-1` pointer'ı ffa9e945'te; sosyal koruma kaydı
  `2e28e570ea933ca471113e46306b286066befbd3` yerinde kaldı.
- Origin hâlâ yerel eski checkout; GitHub'a gönderim yapılmadı.

Yeni dal exact main'den açıldı; merge/rebase/reset/read-tree/clean/stash kullanılmadı.
A/M içerikleri açık yol bazında byte/mode ile taşındı.
39 D dosyasının main byte/mode eşitliği **silmeden önce** kontrol edildi; yalnız bu yollar silindi.
Ön kontrol raporunun working-tree byte'ları aynen korundu.
Main ağacı + plan + onaylı iki istisna + bu rapor bellekte beklenen ağaç olarak kuruldu;
378 dosyalık son ağacın byte/mode kontrolü PASS; fazladan/eksik/beklenmeyen farklı dosya yok.

29 diğer tarih belgesi, 5 standalone handoff fixture ve 2 main Market policy/test dosyası
main ile byte-identical korundu. Status belgesine yalnız tarihsel/dev-only banner eklendi;
eski gövde aynı. Adayın eski policy'ye geri dönüşü ve main güvenlik regresyonlarının kaybı önlendi.
Aktif Web app/auth-lab, sosyal lib/UI/types/browser araçları ve jose bağımlı compatibility script çıkarıldı;
tarihsel belge/fixture rehberleri aktif sosyal özellik değildir.

## Tam Web kontrolünün bulduğu iki fark

İlk tam Web sonucu: **492 PASS, 2 FAIL** (35 dosya/494 test).
Bir test eski genel “non-refundable” metnini bekliyordu; biri kaldırılmış self-service faucet bağlantısını.
Önceki dar testlerin bu iki eski beklentiyi kapsamadığı açıkça görüldü.

Koordinatör onayıyla:
- Terms'e mevcut resmî NEAR/Circle linkleri, koşullu ücretsiz test tokenı yönlendirmesi ve
  **“If Near Testnet is offered”** koşulu eklendi. Token istenmedi; ağ/limit/miktar garantisi verilmedi.
  Gerçek para göndermeme uyarısı korundu.
- Eski waiver beklentisi gerçek davranışa bağlandı:
  otomatik upload/job iadesi yokluğu **ve** tam “Nothing in this notice excludes applicable statutory
  consumer rights” koruyucu cümlesi doğrulanıyor. Test atlanmadı veya zayıflatılmadı.

Bunlar candidate byte kaynağına göre iki açık istisnadır; public-video-discover testi aynı kaldı.
Terms zaten manifest M yoluydu; ek test M1 olarak eklendi.
Tarihli ön kontrol 110-yol planı değiştirilmedi; nihai kapsam **112: A43 / M30 / D39**.

## Taze doğrulamalar — LOCAL_TEST

| Kontrol | Sonuç |
|---|---|
| Tam Web suite | **35 dosya, 494 PASS** |
| Son koruyucu assertion sonrası tek active-ui-copy dosyası | **2 PASS**; tam suite sonucuna ek test sayısı olarak toplanmaz |
| Tam Bridge suite | **8 dosya, 436 PASS / 3 opt-in SKIPPED** |
| Main'den korunan Market code-update regresyonları | **34 PASS** |
| Web tüm kaynak tsc / dokunulan iki dosya ESLint | PASS |
| Bridge TypeScript | PASS |
| Gerçek Next 16.3.3 production build | PASS; compiled route manifest'inde auth route yok, Terms/Privacy mevcut |
| Doküman build | PASS |
| Son ağaç/112-yol manifest/bağlantı/boşluk ve koruma | PASS |

Çalıştırılan komutlar:
`npm test -- --run` (Web ve Bridge, kendi dizinlerinde);
`node --test workers/livepeer-bridge/scripts/market-code-update.test.mjs`;
`npm run check --prefix workers/livepeer-bridge`;
Web `./node_modules/.bin/tsc --noEmit --incremental false` ve
`./node_modules/.bin/eslint app/terms/page.tsx __tests__/unit/active-ui-copy.test.ts`;
`npm run build --prefix apps/web`, `npm run build --prefix docs`.

Next build yalnız process env'de synthetic `market.testnet` / `access.testnet`,
testnet/public-testnet, özellikler false, multi-asset off ve telemetry disabled kullandı.
Env dosyası kaydedilmedi; sahte font yanıtı veya offline build iddiası yok.
İlk eşzamanlı standalone tsc, build'in `.next/types` dosyalarını yenilemesi sırasında geçici eksik
dosya hatası verdi; build sonrası **sıralı typecheck PASS**. Kaynak düzeltmesi gerektirmedi.
Vite CommonJS / Next middleware / docs 500 kB bundle uyarıları engellemiyor.

173 release testi bu gate'te tekrar çalıştırılmadı: helper ve üç suite dosyası ffa9e945 ile byte-identical;
önceki 173 PASS tarihli LOCAL_TEST olarak kaldı.
Rust kaynağı candidate ile aynı; önceki 53 test/WASM/48-26 ABI kanıtı tarihli,
bu gate'te cargo-near veya yeni kontrat build'i yapılmadı.
Tarayıcı, uzak CI, provider, ödeme/upload/NEAR kabulü çalıştırılmadı.

## Koruma, açık engeller ve onaya hazır kayıt

Eski checkout'un 502 dosyası, HEAD/index/dal/tag/remote kayıtları ve global near-cli ayar özeti aynı.
Hedefte mevcut bütün dal/remote pointer'ları aynı; yalnız izinli yeni integration dalı eklendi.
Başlangıçtaki untracked preflight raporu byte-identical kaldı; eski V1 ve sosyal koruma kayıtları değişmedi.
Stage edilmiş değişiklik yok; yeni yerel branch dışında mevcut dal/remote pointer'ları korunur.
Bağımsız salt-okunur çekirdek incelemesi PASS; koordinatör son iki Terms/test düzeltmesini de kontrol etti.

Uzak PR/merge ve yeni SHA CI/artifact/provenance yoktur. CodeQL'in tarihli hatasının güncel CI'da
doğrulanması, public pilot öncesi gizlilik, bütçe ve canlı kabul hâlâ açıktır.
Sosyal çalışma yerel kayıtta; uzak backup var denmez. Mevcut aktif testnet runtime değiştirilmedi.

**Tek sonraki gate:** `YOUTICK_V1_GITHUB_INTEGRATION_COMMIT` — açık kullanıcı onayı bekleniyor.
Önerilen mesaj: `feat: integrate wallet V1 while preserving auth history`.
Onay yalnız aşağıdaki **112 yolluk yerel kayıt** içindir; push/PR/backup/CI/deploy izni değildir.

## Ek — nihai açık kayıt kapsamı

A: yeni dosya; M: main'e göre değiştirilmiş; D: main'den kaldırılmış.
Yok sayılan bağımlılık/cache/temp/build/env/anahtarlar kapsam dışıdır.

```text
A .agents/skills/near-api-js/references/api_patterns.md
A .agents/skills/near-api-js/references/contracts.md
A .agents/skills/near-api-js/references/key_management.md
A .agents/skills/near-api-js/references/meta_transactions.md
A .agents/skills/near-api-js/references/nep413.md
A .agents/skills/near-api-js/references/tokens_guide.md
A .agents/skills/near-api-js/SKILL.md
A .agents/skills/near-api-js/UPSTREAM.md
A .agents/skills/near-contract-audit/references/high-severity.md
A .agents/skills/near-contract-audit/references/low-severity.md
A .agents/skills/near-contract-audit/references/medium-severity.md
A .agents/skills/near-contract-audit/SKILL.md
A .agents/skills/near-contract-audit/UPSTREAM.md
A .agents/skills/near-dapp/references/create-near-app.md
A .agents/skills/near-dapp/references/near-connect-hooks.md
A .agents/skills/near-dapp/references/near-connect.md
A .agents/skills/near-dapp/SKILL.md
A .agents/skills/near-dapp/UPSTREAM.md
A .agents/skills/near-smart-contracts/rules/best-contract-tools.md
A .agents/skills/near-smart-contracts/rules/chain-signatures.md
A .agents/skills/near-smart-contracts/rules/security-storage-checks.md
A .agents/skills/near-smart-contracts/rules/state-collections.md
A .agents/skills/near-smart-contracts/rules/structure-near-bindgen.md
A .agents/skills/near-smart-contracts/rules/testing-integration-tests.md
A .agents/skills/near-smart-contracts/rules/upgrade-migration.md
A .agents/skills/near-smart-contracts/rules/xcc-promise-chaining.md
A .agents/skills/near-smart-contracts/rules/yield-resume.md
A .agents/skills/near-smart-contracts/SKILL.md
A .agents/skills/near-smart-contracts/UPSTREAM.md
A .agents/skills/SOURCES.md
A .agents/skills/upstream-lock.json
A .agents/skills/youtick-contract-review/SKILL.md
A .agents/skills/youtick-near-auth/SKILL.md
A .agents/skills/youtick-payment-flow/SKILL.md
M AGENTS.md
M apps/web/__tests__/unit/active-ui-copy.test.ts
M apps/web/__tests__/unit/compact-upload.test.ts
M apps/web/__tests__/unit/csp-proxy.test.ts
M apps/web/__tests__/unit/device-session.test.ts
M apps/web/__tests__/unit/landing.test.ts
M apps/web/__tests__/unit/livepeer-upload-status.test.ts
M apps/web/__tests__/unit/livepeer-upload.test.ts
D apps/web/__tests__/unit/near-auth-account.test.ts
D apps/web/__tests__/unit/near-auth-compact-flow.test.ts
D apps/web/__tests__/unit/near-auth-dev-runtime.test.ts
D apps/web/__tests__/unit/near-auth-funding.test.ts
D apps/web/__tests__/unit/near-auth-lab.test.ts
D apps/web/__tests__/unit/near-auth-media.test.ts
D apps/web/__tests__/unit/near-auth-session.test.ts
D apps/web/__tests__/unit/near-auth-signing-client.test.ts
D apps/web/__tests__/unit/near-auth-signing-server.test.ts
D apps/web/__tests__/unit/near-auth-token-cache.test.ts
D apps/web/__tests__/unit/near-auth-upload-wallet.test.ts
D apps/web/__tests__/unit/near-auth-usdc-client.test.ts
D apps/web/__tests__/unit/near-auth-usdc-server.test.ts
D apps/web/app/api/auth-lab/account/route.ts
D apps/web/app/api/auth-lab/session/route.ts
D apps/web/app/api/auth-lab/signing/route.ts
D apps/web/app/auth-lab/page.tsx
M apps/web/app/layout.tsx
M apps/web/app/privacy/page.tsx
M apps/web/app/terms/page.tsx
D apps/web/components/AuthLabBoundary.tsx
M apps/web/components/landing/landing-copy.ts
M apps/web/components/landing/ROICalculator.tsx
M apps/web/components/LivepeerPaidUploadForm.tsx
M apps/web/components/LivepeerPlayer.tsx
D apps/web/components/NearAuthFunding.tsx
D apps/web/components/NearAuthLab.tsx
D apps/web/components/NearAuthSigning.tsx
D apps/web/components/NearAuthUpload.tsx
D apps/web/components/NearAuthUsdcFunding.tsx
M apps/web/lib/device-session.ts
M apps/web/lib/livepeer-upload.ts
D apps/web/lib/near-auth-account-preflight.ts
D apps/web/lib/near-auth-funding.ts
D apps/web/lib/near-auth-lab-session.ts
D apps/web/lib/near-auth-lab.ts
D apps/web/lib/near-auth-media-preflight.ts
D apps/web/lib/near-auth-signing-server.ts
D apps/web/lib/near-auth-signing.ts
D apps/web/lib/near-auth-ticket-purchase.ts
D apps/web/lib/near-auth-upload-server.ts
D apps/web/lib/near-auth-upload-wallet.ts
D apps/web/lib/near-auth-usdc-server.ts
D apps/web/lib/near-auth-usdc.ts
M apps/web/middleware.ts
M apps/web/next.config.ts
M apps/web/package-lock.json
M apps/web/package.json
M apps/web/README.md
D apps/web/scripts/near-auth-playback-browser-check.mjs
D apps/web/scripts/near-auth-ux-browser-check.mjs
D apps/web/tsconfig.near-auth.json
M contracts/nft-ticket/src/lib.rs
M docs/architecture/near-auth-integration-status.md
A docs/architecture/youtick-v1-github-integration-preflight.md
A docs/architecture/youtick-v1-github-integration-source.md
A docs/architecture/youtick-v1-isolated-preparation.md
A docs/architecture/youtick-v1-pilot-release-preflight.md
A docs/architecture/youtick-v1-product-scope.md
A docs/architecture/youtick-v1-provider-enquiry.md
A docs/architecture/youtick-v1-release-source-alignment.md
M docs/README.md
M docs/testing.md
M protocol/paid-media-livepeer-v1/compact-upload.ts
A protocol/paid-media-livepeer-v1/title.ts
A protocol/paid-media-livepeer-v1/upload-title-vectors.json
M README.md
D scripts/near-auth-payload-compatibility.cjs
M workers/livepeer-bridge/src/index.test.ts
M workers/livepeer-bridge/src/index.ts
```
