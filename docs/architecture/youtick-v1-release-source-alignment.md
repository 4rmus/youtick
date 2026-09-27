# YouTick V1 — yayın kaynağı uyumu

27 Eylül 2026 · Gate: `YOUTICK_V1_RELEASE_SOURCE_ALIGNMENT` · **PASS (yerel düzeltme)**.
Genel pilot yayın kararı hâlâ **NO-GO**.

## Amaç, kapsam ve kabul

Mevcut public-testnet release config'in yalnız exact localhost origin yüzünden reddedilmesini düzeltmek.
Yazılabilir: `scripts/release-metadata.mjs`, iki mevcut release testi ve bu yeni rapor.
Diğer aday/kaynak dosyaları, eski ön kontrol raporu, Git, ayarlar, env/secret, runtime,
provider/zincir ve tarayıcı yazımları yasaktır.
Kabul: önce hata üretimi; en dar origin istisnası; olumsuz güvenlik vakaları; closed/acceptance/drain
paket uyumu; hedefli test ve doküman build; kapsam dışı dosyaların korunması.

## En küçük değişiklik — LOCAL_STATIC

16 Eylül tarihli `72a96c78635265b4506259ded38f8bf24058bbc2` değişikliğinin yalnız üç helper
parçası ve ilgili regresyonları tekrar kullanıldı; cherry-pick/Git yazımı yapılmadı.

- Sabit istisna: yalnız `http://localhost:3000`.
- Config üretimi bu exact string'i yalnız `public-testnet` ortamında kabul eder;
  diğer origin'ler mevcut HTTPS/path/query/credential kontrolünden geçer.
- Public config doğrulaması yalnız public site URL'si veya canonical
  `http://localhost:3000,https://public-testnet.youtick.net` çiftini kabul eder.
  Public site origin'i zorunlu; default liste yalnız public URL olarak kaldı.
- Preview/Production istisnası, başka port/host/joker veya sosyal giriş UI eklenmedi.
  Flags, ağlar, kimlikler, CI kontrolleri ve provider değişkenleri değiştirilmedi.

Helper farkı **4 eklenen / 2 kaldırılan satır, 3 parça**.
İki test dosyasıyla toplam kaynak/test farkı **74 eklenen / 2 kaldırılan satır**.
Ana ajanın bağımsız diff incelemesi PASS.

## Hata → düzeltme kanıtı — LOCAL_TEST

Önce yalnız ilgili test değişiklikleri uygulandı; helper eski haldeyken:

```sh
node --test --test-name-pattern='public-testnet packages an isolated|optional exact localhost|localhost lab origin|public packets build and verify|public lab origin' scripts/release-metadata.test.mjs scripts/cloudflare-release.test.mjs
```

**5 test: 1 PASS, 4 FAIL; exit 1.** Hatalar beklenen
`public_testnet_origins_invalid` ve mevcut HTTPS origin reddiydi;
olumsuz origin/Preview/Production testi zaten geçiyordu.

Üç helper parçası uygulandıktan sonra mevcut belgeli komut:

```sh
node --test scripts/release-metadata.test.mjs scripts/cloudflare-release.test.mjs scripts/release-smoke.test.mjs
```

**173 PASS, 0 FAIL, 0 SKIPPED; exit 0**, yaklaşık 56 saniye.
Bunlar yerel sentetik config/fixture/mock Wrangler/HTTP testleridir; gerçek deploy/provider çağrısı değildir.

Kontroller: diğer port, 127.0.0.1, IPv6, HTTPS localhost, credentials, path/son slash,
query/hash, benzer kötü host, farklı HTTPS origin ve joker reddi; public origin eksikse ret;
Preview/Production ret; default liste/diğer config alanları aynı;
closed/acceptance/drain paketi ve checksum round-trip; liste yalnız doğru Bridge'e aktarılır;
geçersiz ek port provider adımı başlamadan reddedilir.

## Gerçek config ile salt-okunur karşılaştırma

Koordinatörün mevcut GitHub `PUBLIC_TESTNET_RELEASE_CONFIG` GET sonucu,
değiştirilmeden **bellekte** yeni aday doğrulayıcıdan PASS geçti.
Config özeti aynı: `b47849704e184dd5764e178939a4b34f30ba6c3d67e97cf557a539ddd023f015`;
updated_at: 16 Eylül 15:46:33; exact localhost/public origin çifti.
Config nesnesi ve uzak değişken değiştirilmedi.

Bu, önceki [ön kontrolde](./youtick-v1-pilot-release-preflight.md) üretilmiş dar origin
reddini kapatır; çalışan runtime'ın yeni kodla yayımlandığını kanıtlamaz.
Eski ön kontrol raporu tarihli kanıt olarak aynen korundu.

## Doğrulama ve koruma

- `npm run build --prefix docs`: PASS; engellemeyen 500 kB bundle uyarısı.
- `git diff --check`: PASS.
- Başlangıçtaki 340 aday dosyadan yalnız izinli üç script değişti; eski ön kontrol raporu ve diğerleri aynı.
  HEAD/index/dal/tag/remote aynı. Eski kaynak 502 dosya/Git ve global near-cli ayar özeti de aynı;
  cargo-near çalıştırılmadı. Yeni alignment raporu dışında dosya eklenmedi.
- Uygulama/kontrat/CI-security testleri yeniden çalıştırılmadı; bu alanlar/workflow değişmedi.
- Commit/staging/push/CI tekrar/deploy/ödeme/upload/dış iletişim yapılmadı.

**Açık kalanlar:** uzak kaynak entegrasyonu ve hedef son ağaç incelemesi, exact-SHA main/push CI/artifact,
tarihli CodeQL hatasının güncel aday CI'sıyla doğrulanması, gizlilik, operasyon bütçesi ve canlı kullanıcı kabulü.
Bugünkü scanner durumunu kapalı veya güvenlik analizini başarılı saymıyoruz.
Bu yerel PASS diğer engelleri veya kontrat redeploy ihtiyacını kendiliğinden değiştirmez.

## Onaya hazır yerel kayıt

**Tek sonraki gate:** `YOUTICK_V1_RELEASE_ALIGNMENT_COMMIT` — AGENTS.md gereği
açık kullanıcı onayı bekleniyor; bu gate'te kayıt yapılmadı.
Dal `codex/youtick-ver-1`, mevcut HEAD `1169120503081a2ab1ab6b715afd70df49aae634`.
Önerilen mesaj: `fix: align V1 public-testnet release origins`.

Önerilen **5 dosya** (3 değişmiş takipli, 2 yeni); yalnız açık yollar:

```text
M scripts/release-metadata.mjs
M scripts/release-metadata.test.mjs
M scripts/cloudflare-release.test.mjs
? docs/architecture/youtick-v1-pilot-release-preflight.md
? docs/architecture/youtick-v1-release-source-alignment.md
```

İlk yeni rapor önceki gate'in korunmuş kaydıdır; bu gate onu değiştirmedi.
Yok sayılan temp/cache/dependency/artifact/env/anahtarlar kapsam dışı;
bu kayıt push, GitHub ayar değişikliği veya yayın onayı değildir.
