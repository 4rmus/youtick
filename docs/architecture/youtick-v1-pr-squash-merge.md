# YouTick V1 — PR squash birleştirme kaydı

27 Eylül 2026 · Gate: `YOUTICK_V1_PR_SQUASH_MERGE`
**COMPLETED_WITH_WARNINGS — merge/main CI PASS; public pilot/deploy hâlâ NO-GO.**

## Amaç ve onaylı sınır

Kullanıcı [ön kontroldeki](./youtick-v1-pr-merge-preflight.md) kapsamı açıkça onayladı:
PR #215 ready, exact head/base ile SQUASH, repo politikasıyla yalnız uzak integration dalının
otomatik silinmesi ve yeni main/push CI. Koordinatörün “UYGULA” mesajına kadar yalnız okuma yapıldı.
Yazılabilir tek yeni dosya bu rapordur. Yerel kaynak/Git/remote/index/ayar/env/secret korunur.
Admin bypass, auto-merge, manuel branch silme, force, PR body/comment/review değişikliği,
manuel CI rerun, deploy ve provider/NEAR/wallet işlemleri kapsam dışıydı; yapılmadı.

## İşlem öncesi ve ready sonrası kontrol

- Head `b69a6089643c65a1a22ea019763a04c3ee744be5`;
  base/main `6739ec743850afe08b6bc1cade18091c71c723d4` sabit.
- PR OPEN/MERGEABLE/CLEAN; required CI Gate strict/app=15368 SUCCESS,
  PR CI `36335410156` attempt=1; CodeQL JS/TS/Rust ve aggregate başarılı.
- PR ref açık CodeQL alert=0; reviews/review comments/issue comments=0.
- Preview/public-testnet deploy flag'leri false; squash=true, auto-merge=false,
  delete_branch_on_merge=true. Bunlar değişmedi.
- Draft kaldırıldıktan sonra head/base/check/alert/review/flag/cleanup koşulları tekrar okundu;
  drift yok. Beklenmeyen approval requirement/bypass ihtiyacı çıkmadı.

İlk metadata toplamasında repo endpoint'inin fazla son slash'ı 404 verdi;
doğru salt-okunur endpointle giderildi. Kimlik/ayar değişikliği veya mutasyon denemesi olmadı.

## Kesin birleştirme kanıtı

[PR #215](https://github.com/4rmus/youtick/pull/215) **MERGED**, draft=false,
27 Eylül **17:38:19 UTC**. Tek ready işlemi ve tek synchronous squash çağrısı yapıldı;
`--match-head-commit b69a6089643c65a1a22ea019763a04c3ee744be5`,
`--admin` / `--auto` / `--delete-branch` kullanılmadı.

| Alan | Doğrulanan |
|---|---|
| Yeni main squash SHA | `ad84ba294a95e2a644700d98032e78477767f3c5` |
| Tek parent | `6739ec743850afe08b6bc1cade18091c71c723d4` |
| Tree | `852de579428cf56f733276e18d4d2215ee9f6989` |
| Ağaç eşitliği | Yerel b69 / PR virtual merge / yeni main aynı |
| Main | Yeni SHA; protected=true |
| Uzak integration dalı | `codex/youtick-v1-integration-20260927` GET 404; mevcut repo politikasının otomatik cleanup'ı |
| Yerel integration dalı | b69; silinmedi/switch edilmedi |
| Eski yerel V1 | ffa9e945; değişmedi |
| Sosyal koruma | 2e28e570; yerelde korundu, uzak backup gönderilmedi |

Uzak dal cleanup'ı manuel işlem değildi ve kod/history kaybı değildir:
birleştirilen ağaç main'de; eski main tarihi ve yerel V1/social kayıtları korunur.
Yerel origin eski checkout olarak kaldı; fetch/pull/rebase/reset veya yeni yerel commit yapılmadı.

## Yeni main CI — PR kanıtından ayrı

[Main CI 36337684370](https://github.com/4rmus/youtick/actions/runs/36337684370),
**push/main/ad84ba2**, 27 Eylül **17:38:22 UTC** otomatik başladı.
İlk snapshot in_progress; koordinatör terminal CI/artifact/Preview doğrulamasını üstlendi.
PR b69 CI'sı yeni main'in exact-SHA CI/artifact kanıtı gibi kullanılmadı.

Koordinatörün terminal doğrulaması: attempt=1, exact push/main/ad84;
COMPLETED/SUCCESS, son güncelleme **17:49:35 UTC**, **13/13 job SUCCESS**.
Retain exact Market runtime artifact bu kez çalıştı ve başarılı oldu.
Main-ref CodeQL Rust analysis `1847686716`, JS/TS `1847669041` exact ad84 üzerinde
results_count=0/error boş; main-ref açık alert sorgusu []. Bu sınırlı ref sonucu güvenlik sertifikası değildir.

Artifact metadata API'sinde yedi kayıt aynı SHA/run'a bağlı, non-expired ve digest alanları dolu:

| Artifact türü | ID |
|---|---|
| market-runtime-candidate | 10937372795 |
| access-contract | 10937638610 |
| public-testnet-market-contract | 10937813317 |
| public-testnet-market-runtime-candidate | 10937816782 |
| contract-sbom | 10937886439 |
| market-contract | 10937997900 |
| access-runtime-candidate | 10938246063 |

Yalnız metadata doğrulandı: artifact indirme, içerik checksum'ı veya bağımsız provenance
doğrulaması yapılmadı. Bu kayıtlar korunmuş release paketi/deployed WASM kabulü değildir.

[Preview 36338372742](https://github.com/4rmus/youtick/actions/runs/36338372742),
workflow_run/exact ad84, COMPLETED/SKIPPED. Beş işin tamamı SKIPPED:
Authorize current main, Build Bridge, Build Web, Assemble release artifact, Deploy Preview.
Son uzak doğrulamada main exact ad84, uzak integration ref yok ve iki deploy flag hâlâ false.
Ayar değiştirilmedi; korumalı public-testnet/production workflow dispatch edilmedi.

Ek PR AI koşusu `36335414013` desteklenmeyen model/CAPI400 hatasıyla başarısızdı;
zorunlu check değildi, source finding veya yapılmış AI review sayılmadı.
Rerun/model/settings değişikliği yapılmadı.

## Yerel koruma ve sınırlı kapanış

Başlangıçtaki 380 aday dosya ve eski 502 kaynak dosyası aynı byte'larda kaldı.
Her iki checkout'un HEAD/index/dal/tag/remote/origin kayıtları ve global near-cli ayar özeti aynı.
Yeni tek dosya bu rapor; eski iki local preflight raporu korundu. Stage/commit yapılmadı.

Rapor local/untracked'tir, birleştirilen commit'te yoktur; yeni commit/push ile eklenmedi.
Uygulama/Rust/browser/provider testleri yeniden başlatılmadı; yalnız bu belge derlemesi:
Doküman build PASS; engellemeyen 500 kB bundle uyarısı var.
False deploy flag mevcut eski testnet runtime'ının kapalı olduğunu göstermez.

**Tek sonraki gate:** `YOUTICK_V1_PILOT_READINESS` — public pilot öncesi gizlilik,
operasyon/sponsor bütçesi, canlı cüzdan/yükleme/oynatma kabulü ve korumalı yayın hazırlığı.
Kodun merge/CI başarısı pilot/production kabulü değildir; otomatik deploy veya canlı işlem yetkisi yoktur.
