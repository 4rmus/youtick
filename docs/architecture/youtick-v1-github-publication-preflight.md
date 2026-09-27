# YouTick V1 — GitHub'a gönderim ön kontrolü

27 Eylül 2026 · Gate: `YOUTICK_V1_GITHUB_PUBLICATION_PREFLIGHT`
**COMPLETED_WITH_WARNINGS — gönderim paketi hazır; açık kullanıcı onayı bekleniyor.**

## Amaç ve sınır

Kamuya açık repo için exact commit içeriğini ve draft PR metnini incelemek.
Yazılabilir tek dosya bu rapordur. Mevcut 378 dosya, Git/remote/index, ayarlar/env/secret,
eski kaynak checkout, tarayıcı/runtime ve sağlayıcı/zincir işlemleri yasaktır.
Kabul: yeni disclosure incelemesi, exact uzak hedef/kapsam, hazır PR metni, otomatik CI etkisi
ve tekrar denemede tek kayıt korunması. Bu gate gönderim, PR, CI veya deploy yapmaz.

## Onaya sunulan tek gönderim

- Hedef PUBLIC repo: `https://github.com/4rmus/youtick.git`.
- Exact commit: `b69a6089643c65a1a22ea019763a04c3ee744be5`; parent:
  `6739ec743850afe08b6bc1cade18091c71c723d4`.
- Yerel branch → aynı uzak branch: `codex/youtick-v1-integration-20260927`.
- **Draft PR**, base `main`, aşağıdaki başlık/gövde.
- Gönderim sonrası **otomatik yeni PR CI'sı** kapsam içinde olacak; manuel rerun değil.
- `codex/near-auth-preserve-20260927` / 2e28e570 ve eski V1 / ffa9e945 **gönderilmez**.
  Main'e doğrudan push, bütün branch/tag'ler, force, merge, deploy ve ayar değişikliği kapsam dışı.
- Yerel `origin` eski checkout'a işaret ediyor; değiştirilmez. Gelecek gönderim exact GitHub URL'sini
  açık refspec ile kullanmalı; yerel origin'e push yapılmaz.
- Bu yeni untracked rapor b69 commit'inde **yoktur**, gönderilecek içeriğe eklenmez;
  ön kontrol için yeni commit gerekmez.

## Kamuya açılacak içerik incelemesi — LOCAL_STATIC

Remote parent main'den reachable yeni history yalnız **b69 tek commit**.
112 yol: **43 A / 30 M / 39 D**. Yeni açıklama incelemesi
**73 A/M dosyanın 7.726 eklenen satırıyla** sınırlandı; main'deki değişmeyen tarih dosyaları yeni disclosure değil.
Yok sayılan env/credentials, browser/storage veya ham günlükler okunmadı.

Değerleri çıktıya çıkarmayan örüntü kontrolü:
literal private PEM, JWT, GitHub/AWS/API tokenı, NEAR private-key biçimi ve
literal secret assignment için **0 bulgu**.
İnceleme sırasında gerçek credential veya yeni secret/env dosyası saptanmadı.
Sentetik fixture/parser anahtar örnekleri gerçek sağlayıcı anahtarı sayılmaz;
değişmeyen public fixture'lar yeni disclosure değildir.
Bu sınırlı tarama bütün olası özel verilerin yokluğunu garanti etmez.

**Kullanıcının kamuya açıklama onayında göreceği maddi bilgiler:**
- [V1 ürün kapsamı](./youtick-v1-product-scope.md) ve [sağlayıcı taslağı](./youtick-v1-provider-enquiry.md):
  YOUTICK LTD / 17290900, Türkiye'den solo yönetim/personel yok beyanı, ticari fiyat/hacim planları
  ve açık hukuki/vergi/sağlayıcı rolleri.
- Gate raporları: yerel home/dizin adları (`/Users/arair/…`), branch/commit özetleri,
  global CLI config dosya yoluna ve bütünlük özetine ilişkin önceki yan etki kaydı.
  Config içeriği/değerleri veya anahtarlar açıklanmıyor.
- Kaynak/raporlar: public testnet hesap/kontrat kimlikleri, code/block/run kimlikleri,
  eski release/CI ve ayar özeti metadata'sı. Bunlar credential değildir; yine de operasyon bilgisi açığa çıkar.
- Değişmeyen 30 tarih belgesi ve beş fixture remote main'de zaten var;
  daha yeni özel sosyal çalışma branch'i bu tek push ile yayımlanmaz.

Bu gate hassas veya istenmeyen bilgiyi sessizce silmedi. Kullanıcı bu exact public kapsamı onaylamalı;
daraltma istenirse önce ayrıca yerel inceleme/düzenleme gerekir.

## Güncel uzak durum ve otomatik işler

Koordinatörün salt-okunur GitHub kontrolü: repo public, archived=false, default `main`;
main 6739ec7 protected. Hedef branch GET 404, b69 commit GET 422/NoCommitFound;
exact head branch/base main filtresinde açık PR yok.
`DEPLOY_PREVIEW_ENABLED=false` (7 Eylül), `DEPLOY_PUBLIC_TESTNET_ENABLED=false` (18 Eylül);
değerler değiştirilmedi.

Kaynak CI `pull_request` olayında draft dahil çalışır; `push` yalnız main/master için:
feature branch push tek başına bu CI'yı başlatmaz, draft PR açılışı **yeni CI başlatır**.
Preview deploy workflow'u main workflow_run + başarılı main/push koşusu + flag=true ister;
bu draft PR bir Preview deployment başlatmaz.
Public-testnet/production/operator iş akışları manual dispatch'tir; dispatch yapılmaz.
Yerel testler yeni PR/main exact-SHA CI'sının yerine geçmez; tarihli CodeQL hatasının güncel çözümü
UNPROVEN kalır. Default setup/permission/secret değişikliği veya kontrol zayıflatma önerilmedi.

## Gelecek gate'te güvenli tek kayıt

Gönderim ve PR oluşturma öncesi main/branch/PR durumu tekrar salt-okunur okunmalı.
Beklenen remote branch yoksa yalnız exact b69 branch gönderilir; remote head=b69 ise yeniden
göndermeden mevcut kayıt uzlaştırılır; başka head varsa **STOP**, force uygulanmaz.
Push sonucu belirsizse ref sorgusu; PR sonucu belirsizse exact head/base PR sorgusu yapılmadan
yeniden gönderim veya yeni PR denenmez. Mevcut aynı PR varsa yeniden açılmaz.
Main değişmişse güncel taban/koruma/scope yeniden değerlendirilir; otomatik rebase/merge yok.

## Hazır İngilizce PR metni

Başlık: **Prepare wallet-only V1 testnet candidate**

```markdown
## Summary

- Prepare controlled testnet V1 for existing NEAR wallets; social sign-in, card payments and bank payouts remain future work.
- Remove 39 active auth paths while preserving 30 historical documents, five standalone fixtures and main's Market policy/security regressions.
- Carry forward upload draft/key, quote freshness, compact/title and publication-race guards; align EN/TR landing, terms and privacy. No runtime configuration or feature-default changes.

## Checks

- [x] Web lint/test/build passed: full lint, 494 tests, typecheck and production build.
- [x] Bridge: 436 tests and typecheck; 34 Market code-update tests. Three optional Bridge tests skipped.
- [x] Docs build and final tree/path checks.
- [x] Bounded review of 73 added/modified files found no literal credentials; no private-key, env or secret files added.
- [ ] Bridge Wrangler dry-run was not run.
- [ ] Fresh exact-SHA CI, contract build and protocol checks are pending. Earlier unchanged-source evidence: 173 release tests, 53 Rust tests and Market/Access ABI checks (48/26 methods).

## Notes

Draft only; 112 changed paths. Local checks do not prove hosted, wallet/provider or production acceptance. Privacy details, operational budget and live pilot acceptance remain open. A 22 September CodeQL run failed with a “code scanning not enabled” message; present resolution is unproven and must be checked by new CI. No merge, deployment or settings change is requested.
```

Şablon Summary/Checks/Notes biçimi kullanıldı; Wrangler dry-run / yeni SHA
kontrat ve CI kontrolleri yapılmış gibi işaretlenmedi. Önceki Rust/release/ABI kanıtı tarihli olarak ayrıldı.
PR ne V1'in canlı olduğunu ne gizlilik/hukuk/sağlayıcı onayının tamamlandığını söyler.

## Yerel kapanış

Uygulama testleri tekrar çalıştırılmadı; kaynak byte'ları aynı kaldı.
Bu gate'te ek statik kontrol `npm run lint --prefix apps/web` **PASS (exit 0, uyarı yok)**;
494 Web testi/typecheck/production build ve diğer kontroller önceki entegrasyon gate'inin aynı byte kanıtıdır.
`npm run build --prefix docs` PASS; engellemeyen 500 kB bundle uyarısı.
Yerel bağlantı/kapsam koruması PASS: mevcut 378 aday / eski 502 kaynak dosyası,
HEAD/index/dal/tag/remote ve global near-cli özeti aynı kaldı.
Tek yeni dosya bu rapordur; commit/staging/push/PR/CI/provider işlemi yok.

**Tek sonraki gate:** `YOUTICK_V1_GITHUB_PUSH_DRAFT_PR` — exact b69 branch'in PUBLIC repo'ya
gönderimi + draft PR + otomatik PR CI'sı için açık kullanıcı onayı beklenir.
Bu onay sosyal backup, merge, deploy, manuel CI rerun veya ayar değişikliği kapsamına genişletilmez.
