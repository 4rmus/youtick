# Google upload — kısa mesaj kaynak entegrasyonu

Gate: `NEAR_AUTH_COMPACT_UPLOAD_SOURCE`. Tarih: 17 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS / LOCAL_STATIC + LOCAL_TEST**.
[Uyumluluk prototipi](./near-auth-payload-compatibility-plan.md) ana kaynağa
alındı ve Google yükleme imza hazırlığına bağlandı. Commit/push, CI, deploy,
gerçek Google onayı, sponsor ödemesi veya upload yapılmadı.
Güncel sıra: [entegrasyon durumu](./near-auth-integration-status.md).

## Kapsam ve değişiklik

Başlangıç: `f71178263c5d264bef647feaae8a2b54618b1333` ve mevcut yerel değişiklikler.
Prototipin 9 mevcut / 5 yeni dosyası için başlangıç hash'leri eşleşti;
yama önce `git apply --check` ile doğrulandı. Kullanıcı dosyaları yedeklendi;
geniş reset/restore/stash veya staging yapılmadı. Uygulama bağımlılıkları,
feature flag varsayılanları, provider/config ve canlı veriler kapsam dışı kaldı.

1. **Tek dönüştürme noktası:** Google `prepare-upload`, mevcut uzun mesajı
   önce aynı eski kontrollerden geçirir; ardından `yt:u1:` biçimini üretip
   tekrar çözer. İnceleme başlığı, dosya boyutu, bilet fiyatı, ücret, cihaz,
   şifreli bilet ve delegate bu son kısa mesajdan gelir. Normal cüzdanın
   mesaj üretimi değiştirilmedi; istemciye ikinci bir encoder kopyalanmadı.
2. **Onay özeti:** Google lab mevcut onayında açık başlık, upload ve bilet
   bedelleri, Google hesabı, sponsor ve cihaz süresi gösterilir. Tutarlar
   BigInt ile hesaplanır. Sağlayıcı ekranında ayrıntıların kodlanmış
   görünebileceği belirtilir; oradaki okunabilirlik canlı kabul sayılmaz.
3. **Ortak doğrulama:** Web/Bridge aynı TS codec'i kullanır. Market eşdeğer
   Borsh decoder ile açılan mesajı mevcut quote, ücret ve cihaz kontrollerine
   verir. Değişmez profil tablosu, gerçek quote ömrü, büyük tamsayılar ve
   orijinal compact delegate imzası korunur. Eski JSON/proof yolları kalır.
4. **Token sınırı:** ortak `verifyApproval`, 7.168 baytı aşan tokenı sponsor
   çağrısından önce reddeder. Ret login'i silmez ve ödeme denemesi kaydı açmaz.
   Boyut harness'i artık kaynak fixture'ları yeniden yazmaz; karşılaştırır ve
   yalnız `tmp/near-auth-payload-compatibility/` altına ölçüm kaydı yazar.

## Yayın uyumu: ücret başlamadan durma

Yeni Web'in eski servislerle ücretli işlem başlatmasını önlemek için:

- Market'e salt-okunur `get_compact_upload_version()` eklendi; bu kaynakta
  `1` döner. Kontratın kalıcı state düzenine alan eklenmedi.
- Bridge `/__health` yanıtı `compactUpload: { version: 1, network, market }`
  bilgisini verir. Bu tek başına açık/ödeme hazır anlamına gelmez.
- Google upload hazırlığında ve sponsor öncesi kontrolde aynı final bloktan
  Market sürümü, Bridge'in ağ/kontrat eşleşmesi, relay ve yeni upload hazırlığı
  aranır. Eksik/yanlış sürüm, yanlış ağ/kontrat veya kapalı servis durumunda
  `compact_upload_unavailable` ile durulur.
- Kullanıcıya yalnız hazırlık/onay aşamasında yeni sponsor ödemesi istenmediği
  söylenir. Sponsor sonrasındaki belirsiz tamamlama, mevcut ayrı uzlaştırma
  mesajını ve kilidi korur; ikinci ödeme önerilmez.

Bu gate çalışan Bridge/Market sürümlerini sorgulamadı veya değiştirmedi.
Yerel kaynağın hazır olması canlı hizmetin hazır olduğuna kanıt değildir.
Kısa mesaj desteği yayımlanmadan bu yolun kapalı kalması beklenen davranıştır.

## Yeni doğrulama

| Kanıt | Sonuç |
| --- | --- |
| Web unit | 48 dosya / 760 test PASS |
| Bridge unit | 427 PASS, mevcut 3 koşullu abuse/load testi SKIPPED |
| Market | 11 lib + 41 paid-media testi PASS |
| Boyut/imza matrisi | 360 sentetik senaryo PASS; ortak altı fixture değişmedi |
| Web auth tip kontrolü, lint, izole Web build | PASS |
| Bridge tip kontrolü ve izole `wrangler deploy --dry-run` | PASS; yayın yapılmadı |
| Rust fmt ve tüm hedeflerde clippy | PASS |
| Market WASM ve ABI | PASS; ABI Market 48 / Access 26 method |
| Mevcut protokol kaynak kontrolü | PASS |

Gerçek adaptör → gerçek imza sunucusu akışında, okunabilir özet ve Google'a
verilen baytlar aynı compact delegate'e bağlı; dönen imza ortak fixture ile
birebir eşleşir. Dış kimlik/zincir/MPC ve cüzdan yanıtları sahtedir. Uyumlu
servis baştan yoksa veya Google onayından sonra desteğini kaybederse sponsor
çağrısı ve ödeme denemesi kaydı sıfır kalır.

Eski/compact playback proof'ları 29. günde, eski quote süresi dolmuşken mevcut
cihaz kaydıyla çalışır. Tek gönderim, belirsiz sonuç uzlaştırması, tekrar
ücretinin iadesi, bozuk imza/veri ve origin retleri korunur. Bunlar gerçek
tarayıcı/Livepeer HLS veya zincir sandbox kabulü değildir.

Boyut matrisi en büyük tam JWT **6.673 bayt**, form `fields` **12.041 bayt**,
delegate **1.098 bayt** ölçtü. Ayrılmış 2.048 bayt token zarfıyla üst gözlem
7.130 bayttır. Bu ölçülen örnekler tüm olası claim dağılımlarının üst sınırı
değildir; gerçek 7.168 bayt kontrolü son güvencedir.

Rust 1.86.0 ve yönergedeki cargo-near 0.17.0 kullanıldı. Makinedeki 0.18.0
değiştirilmedi; resmî 0.17.0 arşivi SHA-256 kontrolüyle bu gate'in geçici
araç dizinine açıldı. Access kaynakları değiştirilmeden yalnız ABI karşılaştırma
girdisi üretildi; ortak derleme cache'i kullanıldı. Web build'i sentetik
testnet adresleri ve kapalı varsayılanlarla ayrı kaynak kopyasında çalıştı.
Mevcut Vite, Next middleware ve doküman bundle boyutu uyarıları sürer.

## Değişen dosyalar ve kanıt kaydı

- Ortak protokol: `protocol/paid-media-livepeer-v1/compact-upload.ts`,
  `compact-upload-vectors.json`.
- Google yolu: `apps/web/lib/near-auth-upload-server.ts`,
  `near-auth-upload-wallet.ts`, `near-auth-signing-server.ts`, `near-auth-lab.ts`;
  `apps/web/components/LivepeerPaidUploadForm.tsx`.
- Bridge: `workers/livepeer-bridge/src/index.ts`; relay ve playback parser'ları.
- Market: `contracts/nft-ticket/src/lib.rs`, `src/compact_upload.rs`;
  `scripts/check-paid-media-livepeer-v1-abi.mjs`.
- Testler: Web `compact-upload`, `near-auth-compact-flow`, `near-auth-signing-server`,
  `near-auth-upload-wallet`, `livepeer-upload-status`; Bridge `index`,
  `playback-v2`; Market `tests/paid_media_livepeer_v1.rs`.
- Ölçüm ve belgeler: `scripts/near-auth-payload-compatibility.cjs`,
  `docs/testing.md`, bu rapor ve güncel entegrasyon durumu.

Gate başlangıcı yedeği ve yeni kanıtlar:
`tmp/near-auth-compact-source-t9e3b6er/`. Boyut sonucu:
`tmp/near-auth-payload-compatibility/size-results.json`.
Git index değiştirilmedi; bu gate dışındaki başlangıç dosyaları hash ile korunur.

## Sınır ve tek sonraki gate

Kaynak entegrasyonunun blocker'ı yok. **EXTERNAL_NOT_RUN / UNPROVEN:** gerçek
Auth0 formu/Google imzası, ödeme, upload, HLS, NEAR sandbox uçtan uca kabulü,
CI, Preview/Production ve deploy. Sağlayıcı ayarı/Action/guard değiştirilmedi.
Yerel sonuç mevcut hatanın canlı ortamda giderildiği iddiası değildir.

**Tek sonraki gate: `NEAR_AUTH_SIGNING_FRESHNESS_SOURCE`.** Önceki incelemede
bulunan normal Google imzası/bilet süresi ile quote'in kendi blok penceresi
kontrollerini tamamlamak. Bu gate otomatik açılmadı. Ardından yerel UX ve
korumalı yayın/canlı kabul ayrı değerlendirilir; önceki taslak, imzalı proof,
cihaz ve belirsiz işlem kayıtları korunur.
