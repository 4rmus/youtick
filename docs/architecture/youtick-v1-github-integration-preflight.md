# YouTick V1 — GitHub entegrasyon ön kontrolü

27 Eylül 2026 · Gate: `YOUTICK_V1_GITHUB_INTEGRATION_PREFLIGHT`
**COMPLETED_WITH_WARNINGS — plan hazır; uzak entegrasyon/yayın NO-GO.**

## Amaç, kapsam ve kabul

Cüzdan V1'in hedef son ağacını açık yollarla seçmek; sosyal giriş çalışmasını ayrı korumak.
Yazılabilir tek dosya bu rapordur. Mevcut 341 aday dosyası, eski kaynak checkout, Git/index/dal/remotes,
global ayarlar, env/secret/runtime ve sağlayıcı/zincir işlemleri yasaktır.
Kabul: iki/üç noktalı farkın ayrımı, A/M/D envanteri, korunacak güvenlik/tarih dosyaları,
sosyal çalışma kanıtı, repo kuralları ve sonraki yalnız yerel hazırlığın açık kapsamı.
Bu gate branch/merge/commit/PR/push/config/CI/deploy yapmaz, entegrasyon ağacı oluşturmaz.

| Kaynak | Kesin kayıt |
|---|---|
| Güncel GitHub main / plan tabanı | `6739ec743850afe08b6bc1cade18091c71c723d4` |
| Mevcut yerel V1 adayı | `ffa9e945f3507c368fe8e4e0bb0988e463f2f5fb` |
| Sosyal çalışma koruma kaydı | `2e28e570ea933ca471113e46306b286066befbd3` |
| Ortak ata | `f71178263c5d264bef647feaae8a2b54618b1333` |

Aday dizin `/Users/arair/works/youtick-ver-1`, dal `codex/youtick-ver-1`;
origin yerel `/Users/arair/works/youtick-lp-main` dizinidir, GitHub değildir.
V1 ve `codex/near-auth-preserve-20260927` branch ref'leri GitHub'da 27 Eylül sorgusunda 404:
ffa9e945 ve 2e28e570 commit sorguları da HTTP 422 / NoCommitFound verdi.
İkisi de yerel kayıt; sosyal çalışma için uzak yedek var denmez.
Ayrı onayla sosyal koruma kaydının yayımlanması değerlendirilebilir; kamuya açık repo için
gönderilecek içerik ayrıca hassas veri bakımından incelenmeli. Otomatik gönderilmez.

## Neden mevcut branch PR'ı tek başına yeterli değil?

Main tarafında **2**, aday tarafında **2** ayrı commit var.
Main → aday doğrudan son-ağaç farkı **145 yol: A41 / M30 / D74**.
Ortak atadan adayın üç noktalı PR farkı **71 yol**, **hiç D yok**.
Auth-lab ve Auth0/jose main'de sonradan eklendi; adayın tabanında hiç yoktu.
Sıradan merge, squash veya rebase/cherry-pick bu main-only dosya/bağımlılıkları bırakabilir.
“Branch'te yok” ile “main'den açıkça kaldırılan” aynı değildir.

Bu nedenle fresh-main tabanlı, açık silme ve içerik listesiyle hazırlanmış ayrı yerel entegrasyon gerekir.
Kör merge/cherry-pick, broad reset/read-tree/clean veya force-push çözümü kullanılmaz.
Main ilerlerse taban yeniden okunup plan ve ilgili kontroller yeniden değerlendirilir.

## Son ağaç kararı — LOCAL_STATIC

| Sınıf | Sayı / karar |
|---|---|
| Social runtime | 22 auth-lab route/component/lib yolu: aktif V1 ağacından çıkar |
| Social Web testleri | 13 yol: çıkar; ilgili gelecekteki faz koruma kaydında |
| Social browser/types | 3 yol: çıkar |
| Jose bağımlı compatibility script | `scripts/near-auth-payload-compatibility.cjs`: çıkar; wallet-only app'te jose yok |
| Tarihli sosyal belgeler | 30 yolu main'den koru; yalnız status belgesine dar tarihsel banner |
| Standalone handoff fixture | 5 yolu main'den byte-identical koru; dev-only fixture, sosyal V1 feature onayı değil |
| Main policy ve güvenlik regresyonları | Aşağıdaki iki dosyayı main'den aynen koru |
| Diğer seçili V1 kod/metin/testler | Ek A'daki candidate A/M içeriklerini açık yol bazında kullan |

Korunacak iki dosya:
`workers/livepeer-bridge/scripts/market-code-update-public-testnet-policy.json`,
`workers/livepeer-bridge/scripts/market-code-update.test.mjs`.
Adayı topluca kopyalamak main'deki 5Dsj… policy/allowance kaydını daha eski BwX8… kaydına döndürür,
iki güvenlik regresyonunu (biri üç alt vaka) kaldırır. Bu geri dönüş seçilmedi.
Main policy de tarihli ve bugünkü canlı kontrat için hazır sayılmaz; bu gate policy refresh/deploy yapmaz.

`docs/architecture/near-auth-integration-status.md` için planlanan tek banner:
tarihsel sosyal R&D kaydı / aktif V1 planı değil; mevcut V1 kapsamına, yerel koruma branch/SHA'sına
ve fixture'ların dev-only olduğuna açık işaret. Diğer 29 tarih belgesi değiştirilmez.
Handoff README kendi talimatlarını taşır; `docs/testing.md` candidate wallet-only haliyle kalır.
30 tarih belgesinin **40 gerçek yerel Markdown bağlantısı**, hedef dosya kümesinde bellekte kontrol edildi:
**0 eksik**. Tarihli code-block komutları aktif V1 komutu/işlem yetkisi sayılmaz.

74 ham D yolunun tamamı koruma commit'inde mevcut:
**51 aynı byte, 23 daha sonra değişmiş içerik**; eksik dosya yok.
23 yol için eski main sürümü ayrıca 6739ec7 tarihsel commit'inde bulunur.
Bu, yerel Git korumasıdır; uzak backup veya bütün sosyal dosyaların V1'e taşınması değildir.
Seçilen gerçek 39 silmenin tümü bu koruma denetiminin içindedir.

## GitHub gereklilikleri — koordinatörün güncel salt-okunur kanıtı

Main protected; classic branch-protection endpoint'inin 404 olması korumasızlık değil.
Etkin ruleset **20573948 / main-pr-ci**: PR gerekli, squash/rebase izinli;
required approving review sayısı **0**. Public-testnet environment reviewer'ı ayrı koşuldur;
PR için zorunlu reviewer=1 uydurulmaz.
`CI Gate`, integration_id=15368 ve strict required status checks ile zorunlu;
deletion/non-fast-forward engelli.

Kaynak CI Gate dependency-audit, rust-wasm-audit, detect-changes, web, bridge, contracts,
protocol, docs, codeql ve market-runtime-artifact sonuçlarını bekler.
Başarı/uygun skipped dışında failure bloklar; workflow veya güvenlik şartı zayıflatılmaz.
Doğrulanmış son exact-main/push CI `35276310906`, 6739ec7 success'tir;
başka head için dönen eski `33966040155` kullanılmadı.
Yeni integration/merge SHA için taze kontroller gerekir; yerel V1 testleri yeni tree/SHA CI'sı değildir.

Önceki [yayın ön kontrolü](./youtick-v1-pilot-release-preflight.md) ve
[yerel origin düzeltmesi](./youtick-v1-release-source-alignment.md) korunur.
CodeQL'in 22 Eylül hata mesajı bugün özelliğin kapalı olduğunu kanıtlamaz;
yeni exact CI/owner doğrulaması beklenir. Gizlilik, bütçe, artifact/provenance ve canlı kabul boşlukları sürer.
Bu gate'teki uzak bilgi yalnız ana ajanın GitHub okumalarıdır; yeni provider/NEAR çağrısı yapılmadı.

## Tek sonraki yerel hazırlık ve doğrulama

**Tek sonraki gate:** `YOUTICK_V1_GITHUB_INTEGRATION_SOURCE`.
Önerilen dal `codex/youtick-v1-integration-20260927`; **yerelde yok, oluşturulmadı**.
Fresh-main tabanında ayrı yerel çalışma hazırlanır; Ek A'nın içerikleri/deletion listesi uygulanır,
korunan main dosyaları yerinde bırakılır. Yalnız status banner'ı ayrıca yazılır;
bu rapor da plan kanıtı olarak alınır. Şu an hiçbir dosya silinmedi/branch değiştirilmedi.

Temel karar sayısı **108: A41 / M28 / D39**.
Status banner **M1** ekler: **109: A41 / M29 / D39**.
Bu yeni plan raporu **A1** ekler: **110: A42 / M29 / D39** (Ek A).
Sonraki gate'in kendi yeni kanıt belgesi bu sayıya dahil değildir; gerekirse ayrı açık yol olarak yazılır.
Runtime/sosyal import yokluğu, son-tree eşitliği ve korunacak main yolları kontrol edilir;
main policy/testlerini koruma gibi candidate'tan farklar için hedefli kontroller seçilir.
Ağaç tam eşleşse bile yeni SHA için CI kanıtı ayrıca gerekir.
Yerel hazırlık otomatik commit/push/PR/merge/CI/deploy veya uzak backup izni değildir.

Bu gate'te uygulama testleri yeniden çalıştırılmadı.
`npm run build --prefix docs` PASS; engellemeyen 500 kB bundle uyarısı.
Bağlantı/110-yol manifest/boşluk kontrolü PASS.
Tek yeni dosya bu rapor; mevcut 341 aday/502 eski-kaynak dosyası, HEAD/index/dal/tag/remote kayıtları
ve global near-cli ayar özeti aynı. Plan dalı yok; hiçbir entegrasyon işlemi uygulanmadı.

## Ek A — gelecekteki açık son-ağaç planı

`A`: main'e yeni, `M`: main'e göre değişecek, `D`: main'den açıkça çıkarılacak.
A/M byte kaynağı candidate ffa9e945'tir; istisnalar status banner (gelecek yerel düzenleme)
ve bu yeni preflight raporudur. Diğer main dosyaları korunur. Bu liste henüz uygulanmadı.

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
