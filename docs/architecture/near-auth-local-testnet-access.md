# Yerel Google Auth denemesi için sınırlı testnet erişimi

Gate: `NEAR_AUTH_LOCAL_TESTNET_ACCESS_SOURCE` — **PASS / kaynak gate'i kapalı**.
16 Eylül 2026. Canlı izin/config/deploy yapılmadı; manuel upload henüz hazır sayılmaz.

## Amaç, kapsam ve kabul

Public-testnet Bridge izin listesinde mevcut public Web adresi korunarak
yalnız tam `http://localhost:3000` adresine isteğe bağlı izin verilebilmesi.
Yeni servis, yeni feature flag veya varsayılan olarak açık yerel erişim yok.

Bu gate'te değişen dosyalar:

- `scripts/release-metadata.mjs`
- `scripts/release-metadata.test.mjs`
- `scripts/cloudflare-release.test.mjs`
- Bu rapor.

`docs/architecture/near-auth-google-upload.md` içine yalnız devam bağlantısı
eklendi; bu önceki, henüz commitlenmemiş Auth belgesi ayrı yerel kapsamda kalır.
İleride yayımlanacak dar paket yukarıdaki üç release dosyası ve bu rapordur.

Kontratlar, Bridge kaynak kodu, deployment workflow'u, Web uygulaması,
secret/config dosyaları ve feature flag varsayılanları değiştirilmedi.
Önceki dirty dosyalar korundu; staging, commit/push/PR/merge, CI tekrar
çalıştırma, canlı config veya deploy yok. Video, cüzdan ve imzalar kullanıcıda.

## Davranış

Release config üreticisi yalnız public-testnet izin listesinde tam localhost
değerini HTTPS normalizasyonundan istisna tutar. Ortak public-testnet
doğrulayıcısı yalnız şu iki kanonik değeri kabul eder:

```text
https://public-testnet.youtick.net
http://localhost:3000,https://public-testnet.youtick.net
```

İlk değer mevcut varsayılandır. İkinci değer ancak config açıkça değişirse
kullanılır. Public Web adresinin yerine localhost koymak kabul edilmez.
Web adresi, Bridge adresi, JWT issuer ve çalışma modu aynen korunur.
Başka localhost portu, 127.0.0.1, IPv6 loopback, wildcard, kullanıcı bilgisi,
path, query, fragment veya başka HTTPS adresi public-testnet paketinde reddedilir.
Preview ve Production için HTTP istisnası yoktur.

Mevcut Bridge zaten izin listesi içindeki tam origin'i kontrol ediyor;
HTTP localhost kontrol zarfı biçimini de destekliyor. Bu nedenle Bridge
kodu değişmedi, yerel proxy veya Origin sahtelemesi eklenmedi.
Origin izni kimlik, ücret, imza veya upload yetki kontrollerini atlamaz.

## Kanıt

- `LOCAL_TEST`: önce yeni kabul testi mevcut HTTPS-only engeliyle FAIL oldu;
  dar düzeltmeden sonra odaklı 4 test PASS.
- `LOCAL_TEST`: `docs/testing.md` içindeki komut:
  `node --test scripts/release-metadata.test.mjs scripts/cloudflare-release.test.mjs scripts/release-smoke.test.mjs`
  **173 test PASS**, atlanan veya başarısız test yok.
- Son test kapsamı eklemesinden sonra `public packets build` odaklı testi
  ayrıca PASS: gerçek workflow'un kullandığı closed JSON input yolu üzerinden
  `closed`, `acceptance`, `drain` üretimi, manifest ve hash doğrulaması geçti.
- Standart liste ile üretilen config'in diğer bütün alanlarının byte-değeri
  korunuyor. İzin, taklit release sırasında yalnız doğru public-testnet
  Bridge için Wrangler argümanına taşınıyor. Hatalı üçüncü origin içeren
  artifact, hiçbir taklit Wrangler işlemi başlamadan reddediliyor.
- `LOCAL_STATIC`: `git diff --check` PASS. Temel kaynak:
  `f71178263c5d264bef647feaae8a2b54618b1333`.
- Testteki Cloudflare, deployment, smoke ve anahtar verileri sahtedir.
  Bu sonuçlar **CI / PROVIDER / PREVIEW / PRODUCTION** yayını sayılmaz.
- `EXTERNAL_NOT_RUN`: Web/Bridge build ve tüm uygulama testleri bu dar script
  değişiminde tekrarlanmadı. Gerçek deploy, config yazımı, upload, ödeme,
  Google/cüzdan imzası ve browser kabulü yapılmadı.

Yerel teslim: `tmp/near-auth-local-testnet-access/evidence/result.json` ve
yalnız üç release dosyasını içeren `release-source.patch`.

## Tek sonraki gate: kontrollü yayın

`NEAR_AUTH_LOCAL_TESTNET_ACCESS_RELEASE`: kullanıcı onayından sonra dar
release dosyalarını ve bu raporu temiz/güncel main tabanında ayrı PR ile
yayımlamak. Önceki yerel Auth dosyaları bu PR'a taşınmayacak.

Yayınlanacak yapılandırma değişikliği, GitHub'ın mevcut
`PUBLIC_TESTNET_RELEASE_CONFIG` JSON kaydındaki tek alan:

```json
{
  "bridge.ALLOWED_ORIGINS": {
    "before": "https://public-testnet.youtick.net",
    "after": "http://localhost:3000,https://public-testnet.youtick.net"
  }
}
```

Bu bir değişiklik tarifidir; workflow'a verilecek tam config değildir.
Tam kaydın diğer alanları ve closed-base yapısı korunmalı. Ayrı bir
`PUBLIC_TESTNET_ALLOWED_ORIGINS` GitHub değişkeni açmak yeterli değildir:
`.github/workflows/deploy-public-testnet.yml` mevcut JSON kaydını kullanır.

Exact main SHA ve başarılı push CI belirlendikten sonra yalnız korumalı
`Public Testnet Video` workflow'u kullanılmalı. Workflow Web, Bridge ve
read-model'i birlikte hazırlayıp yayımlar; yalnız tek Worker'a doğrudan
deploy önerilmiyor. O andaki onaylı public-testnet modu doğrulanıp korunmalı;
bu kaynak istisnası kendi başına hiçbir mutation flag'ini açmaz.

Yayın sonrası exact artifact/serving sürümü, health ve salt okunur OPTIONS
ile hem public Web hem localhost erişimi kontrol edilmeli. Ardından ayrı
yerel runtime hazırlığında doğru kontrat/Bridge değerleriyle mevcut Google
hesabının bakiye/kayıt durumları okunmalı. Dosya seçimi, yükleme ve imzalar
yine kullanıcı tarafından yapılacak; agent yeni ücretli iş başlatmayacak.

Kaynak gate'inde blocker yok. Canlı manuel denemenin engeli yayımlanmamış
izin/config ve henüz hazırlanmamış yerel runtime'dır. Commit/PR/merge,
canlı config ve korumalı deploy için `AGENTS.md` gereği açık onay beklenir.
