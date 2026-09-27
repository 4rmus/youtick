# Compact Market kod güncellemesi

Gate: `NEAR_AUTH_COMPACT_MARKET_DEPLOY` — 18 Eylül 2026.
Sonuç: **PASS**. Tek korumalı kod güncellemesi tamamlandı; sistem bakımda.

## Kaynak ve korumalı yayın

- Main: `6739ec743850afe08b6bc1cade18091c71c723d4`.
- Kaynak CI: **35276310906**, attempt **1**, başarılı push/main.
- [Market workflow 35315143547](https://github.com/4rmus/youtick/actions/runs/35315143547):
  authorize ve deploy işleri **PASS**; yeniden çalıştırılmadı.
- Hedef: `video-market-v1-260907.youtick-dev-v3.testnet`.
- WASM SHA-256:
  `7ab01a3f15cc759df571b52c5b2d5dc7f0e032c7392ae41dc288fd4b58c7731c`.
- Policy SHA-256:
  `c8216182dce897acc435c0bf88c718dcba8fff5a9dbe3d489d86b5d82dd90752`.
- Onaylanan raw-state hash:
  `ed8ee8987d1001532d8a1e124991da11bf0851205fa4e8a9e26de6e5f6978fb7`.

Dispatch öncesi ve korumalı environment onayından hemen önce state tekrar
okundu; hash aynıydı. Workflow'un onayladığı artifact dosyaları retained CI
paketiyle byte-for-byte eşleşti. Main/CI/hedef/policy/anahtar/bakım koşulları
ve kapalı Bridge doğrulandı. İki deploy switch'i gate boyunca **false** kaldı;
bu Market workflow'u Cloudflare yayın anahtarını açmayı gerektirmez.

## Kesinleşmiş tek işlem

[İşlem CduifvMT…MezA](https://testnet.nearblocks.io/txns/CduifvMTU5V6kDpxcVz8aJ5xnpgn4yYznTY6znm1MezA)
RPC'de **FINAL / SuccessValue** olarak doğrulandı. Signer ve receiver mevcut
Market hesabıdır; tam **bir `DeployContract`** eylemi vardır. Kullanıcı
cüzdanı veya admin/guardian imzası bu adımda kullanılmadı; korumalı workflow
mevcut environment deploy secret'ıyla imzaladı.

RPC eylemindeki code alanı tam WASM yerine 32 bayt SHA-256 temsilidir;
bu değer onaylı WASM hash'iyle eşleştirildi. Ayrıca gerçek `view_code`
baytları ayrı okunup hash'lendi. İkinci gönderim, retry veya rollback yoktur.

| Alan | Önce | Sonra |
| --- | --- | --- |
| Code hash | `5DsjPD8zDFjhMWF8ro1ATi9xWY1YjGATfw31hVc7H7y` | `9FvV8rRn1FQg15jHG4fNZPXjskdMTr6jZBVgNFZyb731` |
| WASM bayt | 376382 | 388291 |
| Raw-state hash | `ed8ee898…978fb7` | **Aynı** |
| Compact version | Metot yok | **1** |
| Yayın / Published iş | 13 / 13 | **13 / 13** |

Workflow final bloğu **269107515**. Bağımsız son okuma **269107750**,
hash `5byzYb3s7XQBaYGbLtZqpimYmTLhHgb2qNCssBrnB95z`.
Tüm işler, platform USDC/NEAR bakiyeleri, governance ve Access state
bakım snapshot'ıyla aynı. Anahtar kimlikleri/yetkileri ve operator nonce'u
korundu; deploy anahtarının nonce'u yalnız **1** arttı ve işlem nonce'uyla eşleşti.

## Gerçek maliyet ve kalan rezerv

- Makbuzların toplam `tokens_burnt`: **0,0028304169693413 test NEAR**.
  Market hesap bakiyesindeki azalma da bu tutarla eşleşti.
- Kod büyümesi: **11909 bayt**, ek storage payı **0,11909 NEAR**.
- Son boş rezerv: **0,764920551034948000000005 NEAR**; rezerv yeterli.

Depolama payı ile ağ ücreti ayrı kalemlerdir. Source'taki 0,1 NEAR değeri
bir ön kontrol rezervidir; harcama tavanı olarak uygulanmış gibi sunulmaz.
Yeni bakiye yükleme veya USDC ödeme yapılmadı.

## Bakım sürüyor

`bridge_frozen=true`, `new_purchases_paused=true`. Bridge sürümü
`a0f8458e-5a9d-4e35-aa3f-01def357229e`, **DISABLED** olarak kaldı;
upload, sponsor relay, playback ve mutation readiness kapalıdır.
Web/read-model için bu gate'te yeni deployment başlatılmadı.

Eski source policy'nin current-code alanı bu güncellemenin **öncesini**
tanımlar. Bu alan artık canlı kod hash'i değildir; aynı deploy'u yeniden
çalıştırma veya gelecek bir güncelleme için eski policy'yi uygun sayma.
İleride farklı bir Market yayını gerekirse taze policy/onay hazırlanır.
İlk compact proof sonrası eski Bridge'e dönüş yapılmaması kuralı korunur.

## Kapanış

Kanıtlar: `tmp/near-auth-market-deploy-ikcur8w4/` altında `receipt/`,
`evidence/transaction-summary.json`, `evidence/postcheck.json` ve
workflow/snapshot kayıtları. Kanıt sınıfları: **CI / PROVIDER / LOCAL_STATIC**.
Doküman build ve kaynak/index koruma kontrolü geçti. Uygulama kaynağı
değişmediğinden yerel unit suite'leri tekrar edilmedi.

Repo değişikliği yalnız bu rapor ve güncel entegrasyon durumudur; asıl
checkout'un diğer dosyaları ve index'i korundu. Commit/push/merge, yeni
Cloudflare yayını, yeniden açılış, gerçek Google/MPC, upload veya HLS kabulü
bu gate'te yapılmadı. Gerçek `access_denied` çözüm kabulü hâlâ **UNPROVEN**.

**Tek sonraki gate: `NEAR_AUTH_COMPACT_REOPEN`.** Ayrı açık onayla taze
doğrulama, kullanıcı admin `unfreeze_bridge` ve `unpause_new_purchases`
imzaları, ardından korumalı public-testnet acceptance yayını ve runtime
kontrolü. Yeni ödeme/upload denemesi bu yeniden açılışa dahil değildir.
Bu sonraki gate henüz açılmadı.
