# YouTick V1 — PR birleştirme ön kontrolü

27 Eylül 2026 · Gate: `YOUTICK_V1_PR_MERGE_PREFLIGHT`
**COMPLETED_WITH_WARNINGS — koşullu GO yalnız kod birleştirme; pilot/deploy NO-GO.**

## Amaç ve sınır

[PR #215](https://github.com/4rmus/youtick/pull/215) için exact kaynak/check/kuralları doğrulayıp
tek kullanıcı onayına sunulacak birleştirme kapsamını hazırlamak.
Yazılabilir tek dosya bu rapordur. Mevcut kaynak/Git/remote/index/ayar/env/secret/runtime korunur.
Bu ön kontrolde ready, merge, branch silme, PR yorum/gövde/review değişikliği, CI rerun, push veya deploy yapılmaz.
Kabul: güncel baş/base/CI/alert/flag kanıtı, açık method/STOP koşulları ve ayrı canlı kabul sınırı.

## Güncel kanıt — koordinatörün salt-okunur GitHub okumaları

| Alan | Doğrulanan |
|---|---|
| PR | OPEN, DRAFT, MERGEABLE/CLEAN; 112 dosya, 1 commit |
| Head | `b69a6089643c65a1a22ea019763a04c3ee744be5` |
| Base main | `6739ec743850afe08b6bc1cade18091c71c723d4` |
| Ruleset | PR gerekli; squash/rebase; zorunlu approving review=0; deletion/non-fast-forward engelli |
| Zorunlu check | CI Gate, integration_id=15368, strict policy; SUCCESS |
| PR review/yorum | reviewDecision boş; reviews/review comments/issue comments = [] |
| Deploy flag'leri | `DEPLOY_PREVIEW_ENABLED=false`, `DEPLOY_PUBLIC_TESTNET_ENABLED=false` |
| Repo birleştirme/cleanup | squash/rebase açık, merge commit/auto-merge kapalı; `delete_branch_on_merge=true` |

[CI 36335410156](https://github.com/4rmus/youtick/actions/runs/36335410156),
attempt=1, pull_request/head=b69; 27 Eylül **17:11:25 UTC** tamamlandı, SUCCESS.
12 job başarılı; main/push'a özel artifact retention job'ı uygun şekilde SKIPPED.
CodeQL JS/TS, Rust ve aggregate check başarılı. PR CI'sı yeni main release artifact'i değildir.

PR virtual merge commit'i `dd1719a41d63e3de6372ae46e4a9c5dc7d420626`;
parent'ları base 6739 + head b69. Tree `852de579428cf56f733276e18d4d2215ee9f6989`,
yerel b69 tree'siyle **aynı**. CI/analiz için yalnız head adı değil, test edilen ağacın eşitliği doğrulandı.

PR ref `refs/pull/215/merge` açık CodeQL alert sorgusu **[]**.
Rust analysis `1847604891` (17:09:18 UTC), JS/TS `1847591358` (17:03:01 UTC):
results_count=0, error boş, yukarıdaki virtual merge commit'i.
Bu yalnız **bu PR ref'i** için bildirilen açık alert olmamasıdır; repo geneli güvenlik sertifikası veya
tam bağımsız denetim değildir. 22 Eylül tarihli CodeQL hatası bu yeni koşuyu başarısız saydırmaz.

Ek [AI run 36335414013](https://github.com/4rmus/youtick/actions/runs/36335414013)
başarısız: CAPI 400 / istenen model desteklenmiyor. Zorunlu CI Gate'in parçası değil;
kaynak bulgusu veya yapılmış AI güvenlik incelemesi gibi gösterilmez. Hata gizlenmedi;
rerun/model/ayar değişikliği yapılmadı. GitHub'da insan approving review var denmez.

## Onaya sunulan exact işlem

**Tek sonraki gate:** `YOUTICK_V1_PR_SQUASH_MERGE` — açık kullanıcı onayı bekleniyor:

1. Exact head b69/base main 6739 için PR #215'in DRAFT durumunu kaldır.
2. Aynı PR'ı **SQUASH** ile main'e birleştir; head match b69 sabitlenir.
3. Mevcut repo politikasıyla **yalnız uzak `codex/youtick-v1-integration-20260927` dalının otomatik
   silinmesini** açıkça onayla. Yerel integration/V1/sosyal dallar ve commit'ler korunur.
4. Oluşacak **yeni main/push CI'sını** otomatik olarak çalışmasına bırak ve yeni SHA için ayrıca izle.

Bu scope admin bypass, auto-merge, force, başka branch silme, sosyal koruma branch'i gönderimi,
PR body/comment/review değişikliği, ayar/flag değişikliği, manuel CI rerun veya deploy içermez.
Manuel `--delete-branch` kullanılmaz; repo otomatik cleanup ayarı değiştirilmez.
Uzak dal cleanup'ı kod kaybı değildir: birleştirilen ağaç main'de, b69 ve V1/social kayıtlar yerelde kalır;
eski main/sosyal kod geçmişi main'in atalarında korunur. Daha yeni sosyal kayıt hâlâ yerel-only'dir.
Kullanıcı uzak dalın kalmasını istiyorsa **birleştirme yapılmaz**; plan/owner kararı gerekir,
geçici repo ayarı değişikliğiyle etrafından dolaşılmaz.

İşlemden hemen önce ve ready → merge arasında:
head/base, required check, yeni actionable alert/bulgu, iki deploy flag ve exact otomatik-cleanup
politikası tekrar okunur; onay otomatik uzak silmeyi de kapsamalıdır.
Head veya base ilerlerse, check gerekli başarıyı kaybederse, yeni bulgu çıkarsa veya flag değişirse
**STOP**; cleanup politika drift'inde de durulur; otomatik rebase/merge, bypass veya flag kapatma yapılmaz.
Ready zaten kaldırılmışsa mevcut durum uzlaştırılır; belirsiz merge sonucu sorgulanmadan tekrarlanmaz.
Rebase yöntemi izinli olsa da bu onayın seçimi SQUASH'tır.

Main push CI sonrası Preview workflow_run oluşabilir; flag=false iken authorize/deploy işi
SKIPPED kalmalı, sonucu ayrıca doğrulanmalı. Public-testnet/production/operator işleri manuel;
bu gate veya birleştirme bunları dispatch etmez. False deploy flag mevcut aktif testnet'in
kapalı olduğu anlamına gelmez.

## Birleştirme sonrası ayrı kanıt

Yeni squash commit SHA'sı şu an bilinmiyor. PR b69 CI başarısı yeni main/push exact-SHA
CI/artifact/provenance yerine kullanılamaz; yeni head/main/parent/tree ve main CI ayrıca ölçülür.
GitHub branch kuralları veya settings değiştirilmez. Provider/wallet/NEAR/media işlemi yapılmaz.

Gizlilik bildirimindeki açık bilgiler, operasyon/sponsor bütçesi, canlı cüzdan/yükleme/oynatma kabulü
ve ayrı onaylı manuel yayın kapanmadan pilot açılış GO değildir.
[Yerel entegrasyon kanıtı](./youtick-v1-github-integration-source.md) ve
[yayın ön kontrolü](./youtick-v1-pilot-release-preflight.md) tarihli kapsamlarıyla korunur.

## Yerel kapanış

Bu rapor yerel untracked dosyadır; b69/PR #215 içinde yoktur ve bu gate'te kaydedilmez/gönderilmez.
Uygulama testleri/CLI/cargo/provider çağrıları tekrarlanmadı.
Doküman build PASS (engellemeyen 500 kB bundle uyarısı); yerel bağlantı/boşluk/kapsam kontrolü PASS.
Mevcut 379 dosya (378 tracked + önceki publication preflight), eski kaynak 502,
HEAD/index/dal/tag/remote/origin ve global near-cli özeti aynı; yalnız bu rapor eklendi.
