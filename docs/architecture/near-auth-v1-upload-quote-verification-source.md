# NEAR Auth V1 — açık anahtarla upload teklif doğrulaması

Gate: `NEAR_AUTH_V1_UPLOAD_QUOTE_VERIFICATION_SOURCE`.
23 Eylül 2026 — **PASS**.

**Yerel MPC, upload teklifini artık quote gizli anahtarı olmadan doğrulayabilir.**
Mevcut doğrulayıcıya standart Ed25519 açık anahtar yolu eklendi. Mevcut Market'in
kesinleşmiş kaydındaki açık anahtar, bootstrap politikasındaki adayla eşleşti.
Yerel kurulumun kaynak engeli giderildi; çalışan runtime henüz değiştirilmedi.

## Dar değişiklik ve güven sınırı

`workers/livepeer-bridge/src/index.ts` içindeki mevcut
`verifySponsoredUploadQuote` iki çağıran tarafından kullanılır: private MPC
upload girişi ve mevcut sponsored relay parser'ı. Ortak noktaya yalnız
`CREATOR_FEE_QUOTE_PUBLIC_KEY` desteği eklendi; yeni doğrulama servisi yok.

- Değer standart base64 olarak tam **32 bayt** Ed25519 public key olmalıdır.
  Gelen imza canonical base64 / **64 bayt** olmalıdır.
- Standart `crypto.subtle.importKey('raw', …, 'Ed25519', false, ['verify'])`
  ve `crypto.subtle.verify` mevcut canonical quote mesajında çalışır.
  [Cloudflare Web Crypto belgesi](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
  bu çalışma ortamının yerleşik kriptografi arayüzüdür; yeni paket eklenmedi.
- Public key alanı verilmişse bozuk/boş/yanlış anahtar veya imza reddedilir.
  Aynı ortamda geçerli private key bulunsa bile ona geri düşülmez.
- Public key alanı **hiç verilmemişse** mevcut private-key yolu korunur.
  Böylece mevcut hosted quote/relay ayarlarına bu gate'te değişiklik gerekmez.
  İki anahtar da eksikse doğrulama kapalıdır.
- Quote üretimi hâlâ private key gerektirir. Sadece public key verilmesi
  quote üretimini, MPC/upload gönderimini veya başka bir feature flag'i açmaz.
- Network, Market, creator/job, ücret, dosya boyutu, token, gas/deposit,
  version, quote hash ve zaman/blok pencere kontrolleri aynı yerde korunur.
  Public key HTTP/body'den alınmaz; güvenilen Worker ayarıdır. Yanlış ağ veya
  Market için geçerli imza bile mevcut bağlama kontrollerini geçemez.

Native upload testinde Worker'a quote private key **hiç verilmedi**. Sentetik
quote'ları imzalayan fixture yalnız test sürecinde kalır; Worker'da yalnız
public key, mevcut ayrı MPC sponsor test anahtarı ve kapalı/açık test limitleri
vardır. Gerçek kullanıcı anahtarı veya provider kullanılmadı.

## Taze zincir bağı — PROVIDER, salt-okunur

23 Eylül 2026 **13:36:20 UTC**, final blok **269894259**:

- Network: **testnet**.
- Market: `video-market-v1-260907.youtick-dev-v3.testnet`.
- Final hash: `A2KwQ6cU1XJ4cXH6uNHCRHzfsfikL3iNUYP3PVMw5UYk`.
- Kod hash'i: `9FvV8rRn1FQg15jHG4fNZPXjskdMTr6jZBVgNFZyb731`.
- State version **2**, quote key version **1**.
- Public key: `ed25519:HdPBv74UEaHnnPnkQNQaTtNPg6c3rzR1hSViHmhLfkiV`.
- Runtime için base64: `9wz8/GBL3XSpZmaQD4XLnqbYG7SWpiXWgTyQ+uL1+ZI=`.

Doğrudan public-key getter'ı olmadığı için yalnız `STATE` prefix'i okundu;
tek ve exact `STATE` kaydı zorunlu tutuldu. `Contract` v2 Borsh alanları
sınır kontrolleriyle tam çözüldü; 554 baytın tamamı tüketildi. Anahtar uzunluğu,
sürüm ve aynı bloktaki governance view alanları karşılaştırıldı. Ayrı
`get_quote_key_version` view sonucu da **1**. Public key ve sürüm mevcut
`public-testnet-bootstrap-policy.json` ile aynıdır. Ham state veya herhangi
bir gizli anahtar rapora yazılmadı.

State SHA-256: `037a78135abff34c12584cf5e4c5f5323211ff59534ee243efbda11b9faa64b1`.
Bu inceleme runtime'a yeni genel state parser'ı eklemez. Bu snapshot'ın
anahtar/Market/version bağı kanıtlandı; gelecekte rotation/kontrat değişiminde
eski snapshot sonsuza kadar doğru varsayılmayacak. Web'in güncel quote-version
kontrolü de korunur. Yeni quote veya zincir işlemi oluşturulmadı.

## Değişen dosyalar ve kanıt

- `workers/livepeer-bridge/src/index.ts`: bir env tipi alanı ve ortak
  doğrulayıcıda public-key yolu; ekonomik kurallar veya varsayılanlar değişmedi.
- `workers/livepeer-bridge/src/index.test.ts`: altı mevcut compact vektörle
  private key olmadan doğrulama; yanlış/boş/bozuk/kısa/canonical olmayan key,
  version/network/Market/signature, private fallback reddi ve quote üretme reddi.
- `workers/livepeer-bridge/scripts/near-auth-ticket-runtime.mjs`: gerçek
  Worker'a yalnız quote public key; eksik/bozuk/yanlış key ve version için
  bütçe harcamadan ret; mevcut restart/terminal/kapalı status senaryoları.
- `docs/testing.md`, bu rapor ve ana plan.

**LOCAL_TEST:** odaklı Bridge **145 PASS**; tam Bridge **505 PASS / 3 skip**.
**LOCAL_STATIC:** Bridge tip ve diff kontrolü PASS; near-api-js manifest,
lock ve kurulu sürüm **7.3.0** olarak aynı kaldı.
**LOCAL_TEST:** native upload **14 kontrol PASS**, 1 sentetik outer / 0 inner.
Gerçek ürün API, named Worker RPC ve SQLite DO çalıştı; private quote key
aktarılmadan imza doğrulama ve final job/cihaz settlement geçti. Native runner
upload relay veya Livepeer çalıştırmaz; bunlar gerçek kabul kanıtı değildir.
**LOCAL_TEST:** native ticket regresyonu **12 kontrol PASS**, 1 outer/1 inner;
`tmp/near-auth-ticket-runtime-Dexd01/result.json`.
**LOCAL_STATIC:** doküman build PASS; mevcut 500 kB bundle uyarısı sürer.
Başlangıç hash'leriyle yalnız yukarıdaki altı dosyanın değiştiği doğrulandı;
dosya silinmedi, index'e ekleme veya commit yapılmadı.
Web/UI/kontrat kodu değişmedi; Web/browser/Rust testleri yeniden çalıştırılmadı.

Kanıt dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-quote-public-source-rNiWkg/`.
Canlı okuma `chain-quote-key.json`; başlangıç kaynak hash'leri ve test logları
aynı dizinde. Native upload: `tmp/near-auth-upload-runtime-g82FND/result.json`.

## Kalan iş ve tek sonraki gate

**EXTERNAL_NOT_RUN:** gerçek yerel runtime restart/config, quote secret veya
MPC key aktarımı, günlük limit/counter değişimi, fonlama, quote/imza/ödeme/
upload, GitHub/CI/deploy. Kullanıcı dosyası/tarayıcısı ve mevcut kayıtlar korundu.

Kaynak gate'inin blocker'ı yok. **Tek sonraki gate:
`NEAR_AUTH_V1_UPLOAD_LOCAL_ACCEPTANCE_SETUP` — bu turda sürdürülmedi.**
Mevcut kapalı yerel Bridge'e yukarıdaki doğrulanmış public key ve version 1
verilecek; **quote private key gerekmiyor**. Aynı sponsor/key epoch/storage
korunarak kapalı bağlantı ve eski operation'lar kontrol edilecek. Seçili
Distance dosyası ve 2'şer test USDC kayıtları setup raporunda kalır; günlük
rezerv kuralı ve ayrıca gerçek upload onayı şartı değişmedi.
