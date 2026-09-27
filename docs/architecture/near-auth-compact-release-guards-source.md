# Compact yayın korumalarının kaynak düzeltmesi

Gate: `NEAR_AUTH_COMPACT_RELEASE_GUARDS_SOURCE` — 17 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS**. Ön kontroldeki iki source engeli giderildi;
canlı yayın yapılmadı. [Güncel sıra](./near-auth-integration-status.md).

## Kapsam ve değişiklik

Yalnız CI yol eşlemesi, mevcut public-testnet Market yayın politikası,
ilgili mevcut testler ve bu gate'in belgeleri değiştirildi. Ana ajan tek
yazıcıdır; bir salt-okunur alt ajan son diff ve test düzenini inceledi.
Uygulama/kontrat çalışma kodu, bağımlılıklar, deploy workflow'ları, feature
flag varsayılanları, anahtarlar ve canlı ayarlar değişmedi.

- `.github/workflows/ci.yml`: mevcut protocol dalına `web=true` ve
  `contracts=true` eklendi. Bridge/Protocol seçimi korunur. Ortak compact
  dosyalar değişince dört tüketici de kontrol edilir; docs-only seçim değişmez.
  Yeni workflow olayı veya deploy yetkisi eklenmedi.
- `scripts/ci-security.test.mjs`: workflow'un gerçek `case` bölümü iki compact
  dosya ve bir docs yolu için yerelde çalıştırılır. Beklenti compact için
  Web/Bridge/Contracts/Protocol, docs için yalnız Docs'tur.
- `market-code-update-public-testnet-policy.json`: yalnız mevcut kod hash'i
  ve beklenen Bridge anahtar allowance'ı güncellendi. Bunlar zincirdeki
  bakiyeyi veya anahtar yetkisini değiştiren işlemler değildir.
- `market-code-update.test.mjs`: gözden geçirilmiş policy değerleri ve
  korumaları sabitlendi; eski kod/allowance ve aktif runtime, gönderimden
  önce reddedilir. Sahte runtime allowance'ı dosya policy'sinden bağımsızdır;
  aktif runtime testinde dosya kapalı kalırken runtime açık döner.

## Taze salt-okunur dayanak

**PROVIDER:** 17 Eylül **20:38:13 UTC**, final blok **269045527**,
hash `2raKUCxD4usGEQ7VWhdG7DtRHY657T73oTRyaSJJe1zz`.
Hedef `video-market-v1-260907.youtick-dev-v3.testnet`.
Account, code, deploy/operator anahtarları, governance, Access, quote sürümü
ve USDC aynı blokta okundu; hedef/rol/anahtar kapsamları eşleşti.

| Alan | Önceki policy | Yeni policy / gözlenen |
| --- | --- | --- |
| Mevcut code hash | `BwX8m9esvWniSeE2VrWk5byRBSqAD313DYsVERZshVoY` | `5DsjPD8zDFjhMWF8ro1ATi9xWY1YjGATfw31hVc7H7y` |
| Bridge allowance, yoctoNEAR | `95517196951751100000000` | `95143292519868900000000` |

WASM boyutu **376382** olarak kaldı; okunan kodun SHA-256'sı
`0114e17392701d422570183b3bb9a0822d6b83bfb38928c07b55d2bf981f8774`.
Güncel policy dosyası SHA-256:
`c8216182dce897acc435c0bf88c718dcba8fff5a9dbe3d489d86b5d82dd90752`.

Canlı `bridge_frozen` ve `new_purchases_paused` **false**; policy'de ikisi
de **true kalır**. Açık ortamı yayına uygun saymak için koruma gevşetilmedi.
Azami deploy maliyeti **0,1 NEAR**, hedefler, roller, deploy public key,
operator public key/receiver/metotlar ve Access beklentileri korundu.
JSON karşılaştırması diğer bütün policy alanlarının aynı olduğunu doğrular.

Bu okuma bakım altında alınmış deploy snapshot'ı değildir; ham state hash'i
ve yeni WASM için yayın onayı üretilmedi. Operatörün sonraki kullanımları
allowance'ı değiştirebilir; gerçek yayından önce taze snapshot zorunludur.
Eşleşme bozulursa yayın yine durur; otomatik policy yenileme veya retry yoktur.

## Doğrulama

| Kanıt | Sonuç |
| --- | --- |
| Eski kaynakta yeni CI regresyonu | Beklendiği gibi FAIL; Web/Contracts seçilmiyor |
| Eski policy'de yeni baseline regresyonu | Beklendiği gibi FAIL; eski code hash |
| Düzeltme sonrası CI korumaları | **17 PASS** |
| Market code-update testleri | **34 PASS** |
| Mevcut yayın araçları | **173 PASS** |
| Doküman build, diff/kapsam ve index kontrolü | PASS |

**LOCAL_TEST:** toplam **224** test geçti. Eski kod, eski allowance ve
bakımı açık olmayan sahte runtime için deploy çağrısı **0**. Mevcut
tek-gönderim/state eşitliği ve belirsizlikte retry/rollback yapmama testleri
de geçti. Testlerde sentetik anahtarlar ve mock ağ/gönderim kullanıldı;
bu sonuçlar canlı kontrat güncellemesi değildir. Alt ajan yeni testlerde
kendi-kendini doğrulayan fixture veya kapsam genişlemesi bulmadı.

Komutlar [mevcut test rehberinden](../testing.md) seçildi. Kanıt/yedek dizini:
`tmp/near-auth-release-guards-4fg464fo/`. `reproduce-*.log` önceki başarısızlığı,
diğer test logları son geçişi, `runtime-read.json` ve `policy-check.json`
gözlemi/korunan alanları tutar. Önceki preflight kaynak snapshot'ı değiştirilmedi;
nihai entegrasyon bu gate'in düzeltmelerini de içermelidir.

## Değişen dosyalar ve sonraki sınır

- `.github/workflows/ci.yml`
- `scripts/ci-security.test.mjs`
- `workers/livepeer-bridge/scripts/market-code-update-public-testnet-policy.json`
- `workers/livepeer-bridge/scripts/market-code-update.test.mjs`
- Bu rapor ve `docs/architecture/near-auth-integration-status.md`.

Kaynak gate'inin blocker'ı yok. **EXTERNAL_NOT_RUN / UNPROVEN:** commit,
push/PR/merge, GitHub CI tetikleme, deploy, bakım/NEAR işlemi, config/key
değişimi, Google/MPC, ödeme ve gerçek upload/HLS. Uygulama veya kontrat kodu
değişmediğinden Web/Bridge unit, Rust/WASM, OpenNext, boyut matrisi ve Brave
testleri tekrar edilmedi. Önceki gate'lerin sonuçları yeni CI kanıtı değildir.

**Tek sonraki gate: `NEAR_AUTH_COMPACT_SOURCE_INTEGRATION`.** Güncel main
üzerindeki nihai adaya tüm onaylı source düzeltmelerini dahil etmek ve son
diff'i incelemek; commit/push/PR/merge ve CI işlemleri ayrı açık yetkiyle
yürütülür. Henüz açılmadı. [Yayın ön kontrolündeki](./near-auth-compact-release-preflight.md)
bakım sırası, ilk compact proof sonrası eski Bridge'e dönmeme ve localhost
Google kabulü sınırları geçerlidir; source düzeltmesi yayın izni değildir.
