# YouTick V1 — mevcut çalışmayı koruma ön kontrolü

27 Eylül 2026 · Aktif gate: `YOUTICK_V1_PRESERVATION_PREFLIGHT` · **COMPLETED_WITH_WARNINGS**

## Amaç ve sınır

Sosyal giriş çalışmalarını kaybetmeden, kullanıcı onayına sunulacak kesin kaydetme kapsamını hazırlamak.
Bu gate'te değiştirilebilir tek dosya bu rapordur. Mevcut kaynak, belge, test, skill, günlük,
Git dalı/index'i, ayarlar ve çalışan servis/tarayıcı durumu değiştirilemez.
Kabul: başlangıç envanteri, açık dosya listesi, temel sürüm/dal önerisi, hedefli yerel doğrulamalar
ve mevcut dosyaların korunması. Commit, push, yeni dal/dizin, CI, yayın veya dış iletişim yapılmaz.

## Kısa yol haritası

1. Mevcut sosyal giriş çalışmasının koruma kapsamı ve commit onayı — yalnız bu gate.
2. Onaylanan kayıt sonrasında sosyal giriş öncesi sürümü kanıtla seç; gerekli sonraki düzeltmeleri
   değerlendir; ayrı V1 dalını “UTIC v1” dizininde hazırla. Testnet ve gerçek açılışın kabulünü ayır.
3. V1 kapsamını proje belgeleri, landing page, kullanım koşulları ve gizlilik metninde tutarlı yaz.
4. Mevcut kripto akışı ve planlanan sosyal giriş/kart ödemesi için sağlayıcı soru paketini tamamla.
   Yazılı kabul, sanatçıya banka ödemesi, satıcı/vergi/iade sorumlulukları ve toplam maliyet netleşmeden
   kart entegrasyonuna başlama.

## Mevcut durum ve koruma kararı — LOCAL_STATIC

- Dal: `main`; HEAD: `f71178263c5d264bef647feaae8a2b54618b1333`; stage edilmiş değişiklik yok.
- Başlangıç: **38 değişmiş takipli + 204 yeni = 242 dosya**. Silinmiş takipli dosya yok.
- Yerelde önceden kaydedilmiş `origin/main`: `6739ec743850afe08b6bc1cade18091c71c723d4`;
  main bunun 2 commit gerisinde. Fetch yapılmadı; uzak sunucunun güncel hali doğrulanmadı.
- Önceki koruma dalı `codex/near-auth-v1-checkpoint-20260922`:
  `d8a808bae00419a803a983f09fc74398eb33d2e7`. Ana ajan, **başlangıçtaki 242 dosyanın**
  gerçek içeriklerini (yeni dosyalar dahil) bu commit ile karşılaştırdı:
  134 aynı, 35 farklı mevcut, 73 yeni. Dolayısıyla 108 dosyalık daha yeni çalışma bu eski kayıtla korunmuyor.
- Aynı 242 dosyanın yereldeki origin içeriğiyle karşılaştırması: 65 aynı, 51 farklı mevcut, 126 yeni.
  Bu sayılar tüm depo farkı veya canlı kabul değildir; yeni dosyalar “silinmiş” sayılmadı.
- Öneri: **mevcut HEAD üzerine** `codex/near-auth-preserve-20260927` koruma dalı.
  Bu ad yerelde yok; oluşturulmadı. Pull, rebase, reset veya eski checkpoint'e dönüş önerilmiyor.
  Origin ile örtüşen içerik bu koruma kaydında tekrar bulunabilir; öneri birleştirmeye hazır sürüm dalı değildir.
- Sosyal girişle ortak cüzdan düzeltmeleri birlikte korunmalı: hesap başına cihaz oturumu temizleme,
  upload taslağı/bekleyen işlem korumaları, oturum anahtarı kurtarmasında güvenli ret ve Bridge teklif
  tazeliği. Bunların V1'e taşınması sonraki gate'in kararıdır; bağımsız güvenlik denetimi tamamlandı denmez.

## Onaya sunulacak commit kapsamı

| Grup | Takipli | Yeni | Toplam |
|---|---:|---:|---:|
| Kaynak ve sürüm araçları | 22 | 59 | 81 |
| Testler ve test belgesi | 15 | 21 | 36 |
| NEAR Auth tarihli kanıt/plan | 0 | 85 | 85 |
| Repo kuralları ve skill kaynakları | 1 | 34 | 35 |
| Kart sağlayıcısı sonraki faz planları | 0 | 3 | 3 |
| **Mevcut çalışmadan önerilen** | **38** | **202** | **240** |
| Bu yeni rapor | 0 | 1 | 1 |
| **Önerilen commit toplamı** | **38** | **203** | **241** |

Yalnız Ek A'daki dosyalar, bu raporla birlikte açık yollar üzerinden kaydedilmek üzere önerilir.
`new-console-log.md` ve `new-console-log.md.save` korunur; ham günlük oldukları için commit önerisine
dahil edilmez. İçerikleri görüntülenmedi; yalnız bütünlük özeti alındı. Yok sayılan env/anahtar dosyaları, yerel runtime verisi ve tarayıcı
verisi kapsam dışıdır; okunmadı veya değiştirilmedi. Kaydetme çalışan servisleri ve yok sayılan verileri
yedeklemez. Dosya adlarında “acceptance/PASS” bulunması V1'in hazır olduğunun kanıtı değildir.

240 aday dosyada sınırlı, değerleri çıktıya taşımayan gizli veri örüntü kontrolü yapıldı.
İki PEM işareti bulundu: kaynakta anahtar biçimi ayrıştırma, testte o anda üretilen sentetik anahtar.
Gerçek anahtar/token saptanmadı; bu sınırlı tarama tüm olası gizli verilerin yokluğunu garanti etmez.
Ham günlükler onaylı kapsamın dışındadır. Hiçbir gizli değer rapora yazılmadı.

## Taze doğrulama — LOCAL_TEST

Node.js `24.19.0`; mevcut kurulu paketler kullanıldı; yükleme/güncelleme yok.
Web manifest/lock/kurulu paketler: Auth0 SPA `2.26.0`, jose `6.2.12` uyumlu.
near-api-js manifest aralığı `^7.0.3`; lock ve kurulu sürüm `7.3.0`, bu aralıkla uyumlu.
Ana ajanın bağımsız karşılaştırmasında Next `16.3.3` de uyumlu.

| Kontrol | Sonuç |
|---|---|
| `npm run test:near-auth-types --prefix apps/web` | PASS |
| Web: aşağıdaki hedefli mevcut testler | **25 dosya, 772 test PASS** |
| Korunan sürüm ve güvenlik araçları: aşağıdaki mevcut testler | **224 test PASS** |

Web komutu `apps/web` içinden çalıştırıldı:

```sh
npm test -- --run __tests__/unit/near-auth-*.test.ts \
  __tests__/unit/compact-upload.test.ts __tests__/unit/csp-proxy.test.ts \
  __tests__/unit/device-session.test.ts __tests__/unit/livepeer-upload-status.test.ts \
  __tests__/unit/livepeer-upload.test.ts __tests__/unit/livepeer-watch.test.ts \
  __tests__/unit/routes.test.ts __tests__/unit/wallet-provider.test.ts
```

Repo kökünden:

```sh
node --test scripts/ci-security.test.mjs scripts/release-metadata.test.mjs \
  scripts/cloudflare-release.test.mjs scripts/release-smoke.test.mjs \
  workers/livepeer-bridge/scripts/market-code-update.test.mjs
```

İlk Web komutu kök dizinde wildcard eşleşmediği için test başlamadan durdu; doğru çalışma dizininde
tekrar çalıştırılan komut geçti. Vite gelecekteki CommonJS yapılandırmasına ilişkin engellemeyen uyarı verdi.
Sürüm araçlarının sahte çağrı testleri gerçek Cloudflare/NEAR çağrısı değildir.

## Çalıştırılmayanlar ve sınırlar

- Tam Web/Bridge/kontrat testleri, build/lint, doküman build'i, browser/runtime testleri: bu envanter
  gate'inde kaynak değişmedi; yalnız yukarıdaki hedefli kontroller çalıştırıldı.
- CI, sağlayıcı, Preview, Production, gerçek testnet ödeme/yükleme ve mevcut cüzdanla canlı kabul:
  **EXTERNAL_NOT_RUN / UNPROVEN**.
- V1 temel sürümü seçilmedi; “UTIC v1” dizini veya V1 dalı oluşturulmadı.
- 26 Eylül tarihli mevcut entegrasyon kaydı cihaz kurtarma fazını kapatıyor.
  Tarihli kabul belgeleri tarihli kanıt olarak korundu; bu gate bunları yeniden canlı doğrulamadı.
  Kart sağlayıcısı/vergi rolü kaydı yazılı dış teyit bekliyor; seçilmiş sağlayıcı yok.
  Sağlayıcı soru paketi taslaktır, gönderilmemiştir; kart toplama ve sanatçıya banka ödeme yetkisi yoktur.
  Kullanıcının bu sohbet için cüzdan V1 yol haritası eski “sonraki gate” ifadelerinin önüne geçer;
  mevcut sosyal giriş durum belgesi değiştirilmedi.

## Koruma doğrulaması ve sonraki gate

Başlangıç HEAD'i, index dosyasının SHA-256 özeti ve 242 dosyanın SHA-256 özetleri bellekte alındı.
Hedefli kontroller ve bu rapor sonrasında başlangıç dosyalarının içeriği, HEAD ve index tekrar karşılaştırıldı: aynı.
Bu kontrol commit/yedek değildir. Tek yeni dosya bu rapor olmalıdır.
Ana ajanın bağımsız kontrolünde mevcut 500 takipli/yeni dosyanın özetleri, HEAD ve index aynı kaldı;
yalnız bu rapor eklendi.

**Engel:** commit için açık kullanıcı onayı bekleniyor; AGENTS.md ve görev talebi bunu şart koşuyor.
Önerilen commit mesajı: `chore: preserve NEAR Auth work before wallet V1 preparation`.
**Tek sonraki gate:** `YOUTICK_NEAR_AUTH_PRESERVATION_COMMIT` — yukarıdaki dal/241 dosya kapsamına
açık onayla yalnız koruma kaydı; push, V1 sürüm seçimi veya deploy bu onayın kapsamı değildir.

## Ek A — açık dosya listesi

Aşağıdaki her yol commit önerisinin ayrı bir girdisidir; klasör wildcard'ı veya geniş staging önerilmez.
`M`: başlangıçta değişmiş takipli dosya; `?`: başlangıçta yeni dosya.
Raporun kendi yolu da listeye eklenmiştir.

### Kaynak ve sürüm araçları (81)

```text
M .github/workflows/ci.yml
M apps/web/app/layout.tsx
M apps/web/app/profile/page.tsx
M apps/web/components/LivepeerPaidUploadForm.tsx
M apps/web/components/LivepeerPlayer.tsx
M apps/web/components/LivepeerWatch.tsx
M apps/web/components/Navbar.tsx
M apps/web/components/providers/WalletProvider.tsx
M apps/web/lib/device-session.ts
M apps/web/lib/livepeer-upload.ts
M apps/web/middleware.ts
M apps/web/next.config.ts
M apps/web/package-lock.json
M apps/web/package.json
M contracts/nft-ticket/src/lib.rs
M contracts/nft-ticket/tests/paid_media_livepeer_v1.rs
M docs/testnet-pilot-runbook.md
M scripts/check-paid-media-livepeer-v1-abi.mjs
M scripts/release-metadata.mjs
M workers/livepeer-bridge/scripts/market-code-update-public-testnet-policy.json
M workers/livepeer-bridge/src/index.ts
M workers/livepeer-bridge/vitest.config.ts
? apps/web/app/api/auth-lab/account/route.ts
? apps/web/app/api/auth-lab/session/route.ts
? apps/web/app/api/auth-lab/signing/route.ts
? apps/web/app/api/auth/account/route.ts
? apps/web/app/api/auth/device/route.ts
? apps/web/app/api/auth/session/route.ts
? apps/web/app/api/auth/ticket/route.ts
? apps/web/app/api/auth/upload/route.ts
? apps/web/app/auth-lab/page.tsx
? apps/web/app/auth/callback/page.tsx
? apps/web/components/AccountEntryButtons.tsx
? apps/web/components/AuthLabBoundary.tsx
? apps/web/components/NearAuthDeviceRecovery.tsx
? apps/web/components/NearAuthFunding.tsx
? apps/web/components/NearAuthLab.tsx
? apps/web/components/NearAuthSigning.tsx
? apps/web/components/NearAuthTicketPayment.tsx
? apps/web/components/NearAuthUpload.tsx
? apps/web/components/NearAuthUsdcFunding.tsx
? apps/web/lib/near-auth-account-preflight.ts
? apps/web/lib/near-auth-device-client.ts
? apps/web/lib/near-auth-device-server.ts
? apps/web/lib/near-auth-funding.ts
? apps/web/lib/near-auth-lab-session.ts
? apps/web/lib/near-auth-lab.ts
? apps/web/lib/near-auth-media-preflight.ts
? apps/web/lib/near-auth-mpc-sponsor.ts
? apps/web/lib/near-auth-product.ts
? apps/web/lib/near-auth-session-server.ts
? apps/web/lib/near-auth-session-settings.ts
? apps/web/lib/near-auth-signing-server.ts
? apps/web/lib/near-auth-signing.ts
? apps/web/lib/near-auth-ticket-client.ts
? apps/web/lib/near-auth-ticket-purchase.ts
? apps/web/lib/near-auth-upload-attempt.ts
? apps/web/lib/near-auth-upload-client.ts
? apps/web/lib/near-auth-upload-server.ts
? apps/web/lib/near-auth-upload-wallet.ts
? apps/web/lib/near-auth-usdc-server.ts
? apps/web/lib/near-auth-usdc.ts
? apps/web/scripts/near-auth-playback-browser-check.mjs
? apps/web/scripts/near-auth-ux-browser-check.mjs
? apps/web/tsconfig.near-auth.json
? contracts/nft-ticket/src/compact_upload.rs
? protocol/paid-media-livepeer-v1/compact-upload-vectors.json
? protocol/paid-media-livepeer-v1/compact-upload.ts
? protocol/paid-media-livepeer-v1/device-recovery.ts
? protocol/paid-media-livepeer-v1/mpc-sponsor.ts
? protocol/paid-media-livepeer-v1/title.ts
? protocol/paid-media-livepeer-v1/upload-title-vectors.json
? scripts/near-auth-payload-compatibility.cjs
? scripts/near-auth-provider-handoff/README.md
? scripts/near-auth-provider-handoff/package-lock.json
? scripts/near-auth-provider-handoff/package.json
? scripts/near-auth-provider-handoff/upstream/authorize-app.action.cjs
? workers/livepeer-bridge/scripts/near-auth-ticket-runtime.mjs
? workers/livepeer-bridge/src/mpc-entrypoint.ts
? workers/livepeer-bridge/src/mpc-sponsor.ts
? workers/livepeer-bridge/src/worker-entrypoint-test-stub.ts
```

### Testler ve test belgesi (36)

```text
M apps/web/__tests__/setup.ts
M apps/web/__tests__/unit/csp-proxy.test.ts
M apps/web/__tests__/unit/device-session.test.ts
M apps/web/__tests__/unit/livepeer-upload-status.test.ts
M apps/web/__tests__/unit/livepeer-upload.test.ts
M apps/web/__tests__/unit/livepeer-watch.test.ts
M apps/web/__tests__/unit/routes.test.ts
M apps/web/__tests__/unit/wallet-provider.test.ts
M docs/testing.md
M scripts/ci-security.test.mjs
M scripts/cloudflare-release.test.mjs
M scripts/release-metadata.test.mjs
M workers/livepeer-bridge/scripts/market-code-update.test.mjs
M workers/livepeer-bridge/src/index.test.ts
M workers/livepeer-bridge/src/playback-v2.test.ts
? apps/web/__tests__/unit/compact-upload.test.ts
? apps/web/__tests__/unit/near-auth-account.test.ts
? apps/web/__tests__/unit/near-auth-compact-flow.test.ts
? apps/web/__tests__/unit/near-auth-dev-runtime.test.ts
? apps/web/__tests__/unit/near-auth-device-client.test.ts
? apps/web/__tests__/unit/near-auth-device-ui.test.ts
? apps/web/__tests__/unit/near-auth-funding.test.ts
? apps/web/__tests__/unit/near-auth-lab.test.ts
? apps/web/__tests__/unit/near-auth-media.test.ts
? apps/web/__tests__/unit/near-auth-session.test.ts
? apps/web/__tests__/unit/near-auth-signing-client.test.ts
? apps/web/__tests__/unit/near-auth-signing-server.test.ts
? apps/web/__tests__/unit/near-auth-ticket-client.test.ts
? apps/web/__tests__/unit/near-auth-token-cache.test.ts
? apps/web/__tests__/unit/near-auth-upload-client.test.ts
? apps/web/__tests__/unit/near-auth-upload-wallet.test.ts
? apps/web/__tests__/unit/near-auth-usdc-client.test.ts
? apps/web/__tests__/unit/near-auth-usdc-server.test.ts
? scripts/near-auth-provider-handoff/prompt-size.test.mjs
? workers/livepeer-bridge/src/device-recovery.test.ts
? workers/livepeer-bridge/src/mpc-sponsor.test.ts
```

### NEAR Auth tarihli kanıt ve plan belgeleri (85)

```text
? docs/architecture/near-auth-account-preflight.md
? docs/architecture/near-auth-account-provisioning-plan.md
? docs/architecture/near-auth-account-provisioning.md
? docs/architecture/near-auth-brave-sponsor-crash.md
? docs/architecture/near-auth-browser-integration.md
? docs/architecture/near-auth-compact-deploy-preflight.md
? docs/architecture/near-auth-compact-live-acceptance-preflight.md
? docs/architecture/near-auth-compact-maintenance.md
? docs/architecture/near-auth-compact-market-deploy.md
? docs/architecture/near-auth-compact-release-guards-source.md
? docs/architecture/near-auth-compact-release-preflight.md
? docs/architecture/near-auth-compact-reopen.md
? docs/architecture/near-auth-compact-source-integration.md
? docs/architecture/near-auth-compact-upload-source.md
? docs/architecture/near-auth-creator-playback-reload-acceptance.md
? docs/architecture/near-auth-creator-playback.md
? docs/architecture/near-auth-fresh-account-provisioning.md
? docs/architecture/near-auth-fresh-account-upload-preflight.md
? docs/architecture/near-auth-google-signing-lab.md
? docs/architecture/near-auth-google-signing-preflight.md
? docs/architecture/near-auth-google-upload-local-runtime.md
? docs/architecture/near-auth-google-upload.md
? docs/architecture/near-auth-integration-status.md
? docs/architecture/near-auth-live-acceptance-preflight.md
? docs/architecture/near-auth-local-testnet-access.md
? docs/architecture/near-auth-local-ux-acceptance.md
? docs/architecture/near-auth-media-preflight.md
? docs/architecture/near-auth-payload-compatibility-plan.md
? docs/architecture/near-auth-prompt-size.md
? docs/architecture/near-auth-prompt-size.patch
? docs/architecture/near-auth-publication-polling-race-source.md
? docs/architecture/near-auth-publication-transient-error-review.md
? docs/architecture/near-auth-session-restore.md
? docs/architecture/near-auth-signing-freshness-source.md
? docs/architecture/near-auth-ticket-purchase.md
? docs/architecture/near-auth-upload-access-denied.md
? docs/architecture/near-auth-upload-approval-fix.md
? docs/architecture/near-auth-upload-attempt-reconciliation.md
? docs/architecture/near-auth-upload-authorization-diagnostics.md
? docs/architecture/near-auth-upload-draft-guards.md
? docs/architecture/near-auth-upload-rpc-fix.md
? docs/architecture/near-auth-upload-safety.md
? docs/architecture/near-auth-usdc-funding.md
? docs/architecture/near-auth-v1-device-recovery-acceptance-preflight.md
? docs/architecture/near-auth-v1-device-recovery-acceptance.md
? docs/architecture/near-auth-v1-device-recovery-archival-rpc-source.md
? docs/architecture/near-auth-v1-device-recovery-historical-state-acceptance-preflight.md
? docs/architecture/near-auth-v1-device-recovery-historical-state-acceptance.md
? docs/architecture/near-auth-v1-device-recovery-historical-state-preflight.md
? docs/architecture/near-auth-v1-device-recovery-historical-state-source.md
? docs/architecture/near-auth-v1-device-recovery-late-reconciliation-acceptance-preflight.md
? docs/architecture/near-auth-v1-device-recovery-late-reconciliation-acceptance.md
? docs/architecture/near-auth-v1-device-recovery-late-reconciliation-preflight.md
? docs/architecture/near-auth-v1-device-recovery-late-reconciliation-source.md
? docs/architecture/near-auth-v1-device-recovery-local-runtime-setup.md
? docs/architecture/near-auth-v1-device-recovery-preflight.md
? docs/architecture/near-auth-v1-device-recovery-runtime-refresh.md
? docs/architecture/near-auth-v1-device-recovery-source.md
? docs/architecture/near-auth-v1-flow-acceptance.md
? docs/architecture/near-auth-v1-local-runtime-recovery-preflight.md
? docs/architecture/near-auth-v1-local-runtime-recovery.md
? docs/architecture/near-auth-v1-mpc-sponsor-source.md
? docs/architecture/near-auth-v1-passkey-acceptance.md
? docs/architecture/near-auth-v1-passkey-redirect-acceptance.md
? docs/architecture/near-auth-v1-payment-flow-preflight.md
? docs/architecture/near-auth-v1-product-flow-preflight.md
? docs/architecture/near-auth-v1-redirect-callback-preflight.md
? docs/architecture/near-auth-v1-redirect-compatibility-preflight.md
? docs/architecture/near-auth-v1-redirect-provider-setup.md
? docs/architecture/near-auth-v1-redirect-root-acceptance.md
? docs/architecture/near-auth-v1-redirect-root-source.md
? docs/architecture/near-auth-v1-redirect-target-acceptance.md
? docs/architecture/near-auth-v1-session-ui-acceptance.md
? docs/architecture/near-auth-v1-session-ui-source.md
? docs/architecture/near-auth-v1-ticket-local-acceptance-setup.md
? docs/architecture/near-auth-v1-ticket-payment-acceptance-preflight.md
? docs/architecture/near-auth-v1-ticket-payment-acceptance.md
? docs/architecture/near-auth-v1-ticket-payment-source.md
? docs/architecture/near-auth-v1-ticket-runtime-source.md
? docs/architecture/near-auth-v1-upload-local-acceptance-setup.md
? docs/architecture/near-auth-v1-upload-payment-acceptance-preflight.md
? docs/architecture/near-auth-v1-upload-payment-acceptance.md
? docs/architecture/near-auth-v1-upload-payment-preflight.md
? docs/architecture/near-auth-v1-upload-payment-source.md
? docs/architecture/near-auth-v1-upload-quote-verification-source.md
```

### Repo kuralları ve skill kaynakları (35)

```text
M AGENTS.md
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
```

### Kart sağlayıcısı sonraki faz planları (3)

```text
? docs/architecture/near-auth-card-identity-cost-preflight.md
? docs/architecture/youtick-card-provider-enquiry.md
? docs/architecture/youtick-card-provider-tax-role-preflight.md
```

### Bu gate'in raporu (1)

```text
? docs/architecture/youtick-v1-preservation-preflight.md
```

## Ek B — korunan ancak commit dışında kalan ham günlükler (2)

```text
? new-console-log.md
? new-console-log.md.save
```
