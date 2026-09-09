# Tek imza — yayın kaynağı hazır

9 Eylül 2026 · `PLAYBACK_SINGLE_SIGNATURE_RELEASE_SOURCE`

**Sonuç: COMPLETED_WITH_WARNINGS / LOCAL_STATIC + LOCAL_TEST.** Yeni korumalı
public-testnet Market güncelleme yolu ve tek-imza değişikliği güncel main’den
hazırlanan izole adayda tamamlandı. Git/CI yayını ve canlı deploy yapılmadı.

## Aday ve kapsam

- Taban: `89fd909e91575ff2334d87b301765c9f101fd9db`; kapanışta GitHub main aynıydı.
- Aday: `/Users/arair/works/youtick-lp/tmp/playback-single-signature-release-source-1788971147328571000/candidate`.
- Ana çalışma alanının kodu, branch/HEAD/index’i ve önceki 21 test edilmiş dosya
  korundu. Ana dizine yalnız bu rapor ve preflight raporuna devam bağlantısı yazıldı.
- Tek yazan katılımcı ana agent; subagent kullanılmadı.
- Önceki tek-imza paketinin 21 yoluna gerekli `apps/web/lib/livepeer-playback.ts`
  eklendi. Yerel Brave komutu main’in `docs/testing.md` dosyasına dar bir ek olarak
  taşındı. Eski çalışma alanı topluca kopyalanmadı.
- Main’deki Next **16.3.3**/lock, bounded UTF-8 RPC okuması, read-model,
  Cloudflare attestation/Queue/propagation düzeltmeleri korundu. Bridge’in public
  Queue retention koşulu main’deki 86400 saniye olarak bırakıldı.

## Yayın yolundaki değişiklik

- `.github/workflows/public-testnet-market-code-update.yml`: yalnız manuel ve
  ilk attempt’te çalışan yeni public workflow. `public-testnet` korumalı ortamı,
  reviewer/korumalı branch kontrolü ve `public-testnet-video` kilidi kullanılır.
- Girdiler: exact main `sha`, başarılı push CI `ci_run_id`, beklenen WASM ve state
  SHA-256, incelenmiş `policy_sha256`, `UPDATE_EXISTING_PUBLIC_TESTNET_MARKET_CODE`
  doğrulaması. Artifact hash, source/run/attempt ve CI attestation kontrol edilir;
  onaydan sonra main ve policy tekrar doğrulanır.
- `market-code-update.mjs`: mevcut kod paylaşılır; `--target` yalnız `preview`
  veya `public-testnet` kabul eder. Varsayılan Preview korunur. İki sözleşme ID’si
  sabittir; farklı hedef artifact’i diğer hedefte reddedilir.
- `.github/workflows/ci.yml`: aynı WASM/ABI derlemesinden ayrıca public hedefe
  bağlı `public-testnet-market-contract-<sha>` paketi üretilip doğrulanır ve
  attestation ile saklanır. Eski Market ve Access artifact yolları korunur.
- `market-code-update-public-testnet-policy.json`: yalnız
  `video-market-v1-260907.youtick-dev-v3.testnet`; Access ve operator da public
  hedeflere bağlıdır. Ödeme pause ve Bridge freeze zorunludur. Kod, key, state,
  quote, Access ve reserve beklentileri exact karşılaştırılır.
- Public deploy **yalnız** `PUBLIC_TESTNET_NEAR_RPC_URL` ve
  `PUBLIC_TESTNET_MARKET_DEPLOY_PRIVATE_KEY` kullanır. Preview/parent/operator/
  sponsor anahtarı yerine geçmez; hiçbir secret oluşturulmadı veya değeri okunmadı.
- Public Bridge health tamamen kapalı ve `DEPLOY_PUBLIC_TESTNET_ENABLED=false`
  değilse işlem gönderilmez. Doğru durumda tek `DeployContract`; init, migration,
  funding, key/Access değişikliği, otomatik retry veya rollback yoktur.
- Son kontrol, değişmeyen raw state/ekonomik kayıt/anahtarlar yanında yeni
  `get_playback_device` view’ünü aynı doğrulanan final blokta çağırır. Eksik view
  ya da belirsiz sonuç evidence üretir; ikinci işlem göndermez.

Yeni policy’nin kod/key/allowance değerleri preflight referansına dayanır. Beklenen
pause/freeze kapalı durumudur; workflow bunları kendisi değiştirmez. Gerçek
uygulamadan önce onaylı kapatma ve taze policy/state kontrolü gerekir. Policy’deki
**0.1 NEAR** deploy-cost tamponu operasyonel reserve kontrolüdür; NEAR’ın imzalı
bir maxFee alanı veya bu sohbette harcama onayı değildir.

## Yerel doğrulama

| Kontrol | Sonuç |
| --- | --- |
| Web 7 odaklı dosya | **132 PASS**; tek imza, 30 gün, reload, üç cihaz ve oturum yarışları. |
| Bridge playback-v2/playback/index | **155 PASS / 3 SKIPPED**; eski opt-in abuse/load testleri çalıştırılmadı. |
| Bridge script testleri | **113 PASS**, bunun içinde updater’ın **29** testi var; iki hedefin karışması, açık governance, yanlış key/state, tek gönderim ve belirsiz sonuç senaryoları. |
| Workflow/CI güvenlik testleri | **16 PASS**; yeni public workflow ve eski Preview yolu birlikte. |
| Market lib + paid-media | **45 PASS**; 30 gün yenileme, refund/replay ve cihaz sınırı. |
| Event katalog kontrolü | **1 PASS**; mevcut producer/consumer katalog uyumu korunuyor. |
| Gerçek yerel Brave | **13 kontrol PASS**, izole headless profil; gerçek IDB/WebCrypto, yalnız localhost/mock wallet ve chain. |
| Web lint + kapalı build | **PASS**, Next 16.3.3; bilinen middleware/Edge bağımlılık uyarıları. |
| Bridge TypeScript | **PASS**. |
| Market fmt + clippy + WASM | **PASS**, Rust 1.86.0 ve izole araç yolundaki cargo-near 0.17.0. |
| Protokol + üretilmiş ABI | **PASS**: Market 45, Access 26 metod. |
| YAML ve shell sözdizimi | **PASS**: CI + public workflow YAML, toplam 41 bash bloğu. `actionlint` kurulu değildi; çalıştırılmış sayılmaz. |

Toplam **462 farklı test PASS**, üç opt-in test skipped; Brave’in 13 kontrolü
ayrıdır. Updater’ın önceki odaklı koşusu 113 script testi içinde tekrar sayılmadı.

Yerel WASM **366597 bayt**, SHA-256
`e027842789723de974db17b04665e10aa7479303d971686ba00c43f3ce569f1c`.
Bu host build referansıdır; CI-attested veya yayımlanabilir kesin artifact değildir.

### Yerel araç yan etkisi

`cargo-near 0.17.0` build başlangıcında otomatik config migration çalıştırdı ve
`/Users/arair/Library/Application Support/near-cli/config.toml` dosyasını güncelledi
(mtime: 9 Eylül 2026 16:35:13 UTC). Öncesinde bu repo dışı dosyanın kopyası
alınmadığından önceki baytlar bilinmiyor; tahminî geri alma yapılmadı. Config
değerleri veya private key’ler rapora okunmadı. Bu, canlı NEAR/provider config
mutasyonu değildir; hiçbir transaction imzalanmadı/gönderilmedi. Bu yerel yan
etki nedeniyle sonuç uyarılıdır.

## Dosyalar ve duruş sınırı

Yeni release kodu/testi: CI workflow, yeni public Market workflow, ortak updater
ve testi, public policy, CI-security testi. Önceki tek-imza dosyaları ve gerekli
playback bağımlılığı da adayda bulunur. Tam dosya listesi ve patch, kanıt klasöründeki
`receipt.json`, `candidate-source-hashes.json` ve `candidate.patch` dosyalarındadır.

Kanıt klasörü:
`/Users/arair/works/youtick-lp/tmp/playback-single-signature-release-source-1788971147328571000`.

Kaynak gate’inin engeli yok. **R2’nin kaynak eksiği adayda kapandı**; henüz GitHub’a
yayımlanmadı. R1 (commit/main CI/attested release) ve R3 (dedicated public Market
deploy secret’ı ve key eşleşmesi) sonraki sınırlar olarak kalır.

Çalıştırılmayanlar: commit/push/PR/merge, CI dispatch/rerun, deploy, gerçek cüzdan,
ödeme/upload, secret yükleme/rotation, canlı NEAR/D1/provider değişikliği,
Production/Mainnet ve gerçek medya kabulü. Access’in mevcut public state’i yalnız
policy beklentisini belirlemek için salt-okunur sorgulandı.

**Tek sonraki gate: `PLAYBACK_SINGLE_SIGNATURE_RELEASE_PR`.** Bu izole adayın
incelenen farkları için Git yayını ve PR/CI doğrulaması; secret hazırlığı ve
Market → Bridge → Web canlı yayın ayrıca yetkilendirilir. Bu gate başlatılmadı.
