# Compact yayın ve bakım ön kontrolü

Gate: `NEAR_AUTH_COMPACT_DEPLOY_PREFLIGHT` — 18 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS**. Bakım için incelenebilir paket hazır;
gerçek deploy henüz yetkilendirilmedi. [Güncel plan](./near-auth-integration-status.md).

## Değişmeyen yayın kaynağı

[PR #214](https://github.com/4rmus/youtick/pull/214) birleşti. Main:
`6739ec743850afe08b6bc1cade18091c71c723d4`.
[Main CI 35276310906](https://github.com/4rmus/youtick/actions/runs/35276310906),
attempt **1**, push/main ve **13/13 PASS**. Bu gate'te yeniden tetiklenmedi.
Artifact **10520678346** hâlâ saklanıyor ve süresi dolmamış:
`public-testnet-market-contract-6739ec743850afe08b6bc1cade18091c71c723d4`.

- Hedef: `video-market-v1-260907.youtick-dev-v3.testnet`, `CODE_UPDATE_ONLY`.
- Yeni WASM: **388291 bayt**, SHA-256
  `7ab01a3f15cc759df571b52c5b2d5dc7f0e032c7392ae41dc288fd4b58c7731c`.
- Yeni code hash: `9FvV8rRn1FQg15jHG4fNZPXjskdMTr6jZBVgNFZyb731`.
- Policy SHA-256:
  `c8216182dce897acc435c0bf88c718dcba8fff5a9dbe3d489d86b5d82dd90752`.

Önceki merge gate'inde WASM ve manifest GitHub attestation'ları exact main
ve `ci.yml` kaynağıyla doğrulandı. Bu gate'te artifact metadata'sı ve mevcut
`verify-artifact` yeniden kontrol edildi; kaynak/run/attempt/hedef/lock/hash
eşleşiyor. Bu değerler çalışan kontratın sürümü değildir.

## Taze canlı durum

**PROVIDER / yalnız okuma:** 17 Eylül **21:42:36 UTC** (18 Eylül Türkiye),
final blok **269052379**, hash
`HXtJfLHxmeAFbV2HRWaDqrwU84d315Gbj9XCXnhKhVWX`.
Kontrat kodu, tüm state anahtarları, işler, rezerv, governance ve Access
aynı bloktan okundu. State değerleri rapora dökülmedi; hash ve job listesi
tutuldu. Envanter kaynağı Market'in `livepeer-v1:jobs` anahtarlarıdır.

| Alan | Gözlem |
| --- | --- |
| Çalışan Market | `5DsjPD8zDFjhMWF8ro1ATi9xWY1YjGATfw31hVc7H7y`, 376382 bayt |
| `get_compact_upload_version` | MethodNotFound; yeni kod henüz yayınlanmamış |
| Bridge | `843cec7d-3ccf-4766-9499-f7c657106b65`, ENABLED; compact alanı yok |
| Bakım | `bridge_frozen=false`, `new_purchases_paused=false` |
| Market işleri / yayınlar | **13 / 13**; tüm işler Published, Authorized **0** |
| Bilinen Google taslağı | `lp-85827ca5-1d4a-4ce5-9dc4-814cac141d1d`: job null |
| Code/key/role/Access/USDC/quote beklentileri | Güncel source policy ile eşleşiyor; bakım bayrakları hariç |

Mevcut aktif ortam state hash'i
`3788a4166981988987b5c1f1b5b9c4fdb1aa431a586c54f7616ebd739c679d5c`.
**Deploy input'u olarak kullanılmayacak.** Guardian çağrıları state'i
değiştirir; bakım tamamlandıktan sonra taze hash alınması zorunludur.

### Yetkili Bridge durum sorguları

17 Eylül **21:47:41 UTC** iki GET çağrısı HTTP 200 verdi:

- Admission **OPEN**, rezervasyonlar **boş**, closure/provider failure yok.
- Operator outbox: **13 total / 13 confirmed**, invalid **0**, retry **0**,
  archive scan **false**. Kesinleşmemiş operator kaydı **0**.
- `pendingRecords=13` ve `uncommittedRecords=13`, **arşivlenmeyi bekleyen
  kesinleşmiş kayıtlar**dır. Bunlar bekleyen NEAR gönderimi değildir:
  kaynak `summarizeOperatorOutbox`, pending'i CONFIRMED kayıtların
  `archive.status=PENDING` alt kümesi olarak sayar. Arşivleme/silme yapılmadı.
- Eski aylık rezerv sayaçları mevcut; aktif rezervasyon veya yeni ücret
  olarak yorumlanmadı, sıfırlanmadı.

Token önce bulunamadığı için kimliksiz GET'ler 403/`operator_unauthorized`
döndü. Önceki proje betiğindeki referansla mevcut özel dosya bulundu ve
token yalnız bellekte, yalnız doğru Bridge host'una, redirectsiz GET için
kullanıldı. Değeri çıktı/artifact/dokümana yazılmadı. GitHub secret metadata'sı
**8 Eylül 2026 08:43:43 UTC / 11:43 Türkiye** tarihini gösteriyor; bu kayıt
o tarihten beri güncellenmemiş. Bu, GitHub'a eklenme zamanıdır; anahtarın
cihazda ilk üretildiği an ayrıca kanıtlanmadı. Önceki 16 Eylül durum sorguları
aynı mevcut erişimin kullanıldığı tarihsel kayıtlardır.

Bu iki endpoint sponsor relay kuyruğunun veya tarayıcıdaki bütün Google/MPC
denemelerinin tam envanteri değildir. Google taslağı için job null olması
sponsor ücretinin hiç ödenmediğini kanıtlamaz. Eski `outer_pending`,
`outer_submitted`, `mpc_verified`, imza, taslak ve cihaz kayıtları korunur;
yeniden gönderme/ödeme/kilit temizliği bu pakette yoktur.

## Bütçe düzeltmesi

Önceki raporlardaki **“0,1 NEAR azami deploy maliyeti” ifadesi doğru değildir**.
Source'taki `max_deploy_cost_yocto` yalnız işlem öncesi gerekli boş bakiye
hesabına eklenir. `DeployContract` eylemine bir NEAR harcama tavanı verilmez;
işlem sonunda ücretin 0,1'i aşmadığını denetleyen kontrol de yoktur.

| Kalem | NEAR |
| --- | ---: |
| Kod büyümesi | 11909 bayt |
| Ek depolama payı; bayt maliyeti `10^19` yoctoNEAR | **0,11909** |
| Source policy'nin ek işlem rezervi | **0,1** |
| Gerekli başlangıç boş rezerv | **0,21909** |
| Şimdiki boş rezerv | **0,887644594346020700000005** |
| Gerekli payın üzerindeki fark | **0,668554594346020700000005** |

Rezerv mevcut storage stake ve operasyon rezervi çıkarıldıktan sonraki
bakiyedir. Bu snapshot'ta yeni bakiye yüklemesi gerekmiyor. Depolama için
ayrılan tutar ile gerçek ağ ücreti aynı şey değildir; **0,21909 toplam
harcama tavanı değildir**. Guardian/admin çağrılarının ağ ücretleri ayrıca
cüzdanda incelenir; bu çağrılarda ekli transfer/deposit **0** planlanır.
Gerçek maliyet ve kullanılacak hesaplar imza/deploy öncesinde yeniden kontrol edilir.

## İncelenebilir bakım planı

Mevcut gözlemde aktif ücretli iş/rezervasyon yok; ayrı drain yayını şu anda
gereksizdir. İşler değişirse plan durur ve yeniden değerlendirilir. Drain,
mevcut ücretli medya işlerini sürdürebilir ancak sponsor relayer'ı kapatır;
bekleyen MPC/delegate denemeleri için otomatik kurtarma yolu sayılmaz.

**Tek sonraki gate: `NEAR_AUTH_COMPACT_MAINTENANCE`.** Açık onay kapsamı:

1. Ana SHA, CI, policy/code/key/allowance, 13 yayın ve boş rezervasyonlar
   yeniden okunur. Kullanıcı yeni upload/Google imzası başlatmaz; açık veya
   sonucu belirsiz cüzdan/relay işlemi görülürse kapatma başlatılmadan durulur.
   Aktif izleyici olmadığı kanıtlanmadı; bakım izleme erişimini etkileyebilir.
2. Guardian `lp-arch-guardian-260809.youtick-dev-v3.testnet`, aynı Market'e
   `pause_new_purchases({})` çağrısını **kullanıcı imzasıyla** yapar.
   Yeni bilet ve creator job ödemeleri iade edilerek durur. Eski runbook'taki
   “creator upload açık kalır” ifadesi bu gate'te düzeltildi.
3. Yalnız korumalı **Public Testnet Video**, exact SHA/CI ve `mode=closed`,
   `confirmation=DEPLOY_PUBLIC_TESTNET_closed` ile çalıştırılır. Gereken
   `DEPLOY_PUBLIC_TESTNET_ENABLED` anahtarı yalnız bu onaylı işlem için
   geçici açılıp sonunda false'a döner; Preview false kalır. Base config ve
   secret'lar yenilenmez. Korumalı environment onayı gereklidir.
4. Bu workflow mevcut **Web, Bridge ve read-model** Worker sürümlerini
   birlikte kapalı moda geçirir. Yeni kaynak kullanılır, fakat Market eski
   kodda kalır. Receipt ve gerçek versionId'ler, bütün gerekli Bridge
   readiness alanlarının false olması ve ilgisiz ana site doğrulanır.
   Yeni schema/migration, veri temizliği veya manuel D1 işlemi planlanmaz.
5. Guardian, işler hâlâ uzlaştırılmışsa `freeze_bridge({})` çağrısını yine
   **kullanıcı imzasıyla** yapar. Mevcut finalize/suspend de artık durur.
   İşlem belirsizse yeniden imzalama yerine salt-okunur uzlaştırma yapılır.
6. Bakım altında **yeni** raw-state/code/key/rezerv snapshot'ı ve hash alınır.
   Market deploy için exact WASM/policy/state/CI onay paketi tamamlanır ve
   bu bakım gate'i kapanır. **Market deploy veya yeniden açılış otomatik değildir.**

Sonraki ayrı deploy onayında `Public Testnet Market Code Update` tek
`DeployContract` gönderir; state/ekonomik bakiye/yayın sayısı eşitliği ve
compact version=1 doğrulanır. Ardından ayrıca onaylı admin
`unfreeze_bridge`/`unpause_new_purchases` imzaları ve korumalı acceptance
yayını gerekir. Yeni kompakt destek kapalı sürümde doğrulanmadan açılış yoktur.
İlk compact proof sonrasında eski Bridge'e dönüş yapılmaz; belirsiz Market
deploy'ında otomatik retry/rollback yoktur. Localhost Google kabulü bundan
sonra ayrı yürür; mevcut ödeme veya upload tekrarlanmaz.

Closed, drain ve acceptance config'leri mevcut doğrulayıcıyla yalnız yerelde
üretildi. İki deploy switch'i **false**, public-testnet environment korumalı
branch ve bir reviewer şartına sahip. Gerekli secret adları mevcut; GitHub'dan
secret değerleri alınmadı. Hiçbir workflow dispatch edilmedi.

## Kapanış ve sınırlar

Kanıt/onay taslağı: `tmp/near-auth-deploy-preflight-h7ix8673/`.
`approval-package.json` bakım adımlarını ve sayısal bütçeyi tutar;
deploy `expected_state_sha256` alanı kasıtlı **null** bırakılmıştır.
Bu tamamlanmış deploy talimatı değildir. Yerel config üretimi,
artifact doğrulaması, bütçe/alan karşılaştırmaları ve doküman build geçti.

Değişen kaynaklar yalnız bu rapor, güncel entegrasyon durumu ve runbook'taki
tek yanlış pause açıklamasıdır. Uygulama/workflow/policy kodu, sırlar ve asıl
Git index'i korunur. Yeni commit/push/CI/deploy, bakım çağrısı, ödeme, provider
mutasyonu, cihaz anahtarı veya tarayıcı profili değişimi yapılmadı.
Gerçek Google/MPC ve upload/HLS kabulü **UNPROVEN** kalır.

Bakım öncesi doğrulamaları tekrar etme şartıyla onay paketi hazırdır. Nihai
deploy state hash'i henüz yoktur; canlı ortam açık olduğundan bugün
Market code-update workflow'u doğru olarak reddetmelidir.
