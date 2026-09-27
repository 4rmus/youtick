# NEAR Auth V1 — yerel Worker runtime kaynağı

Gate: `NEAR_AUTH_V1_TICKET_RUNTIME_SOURCE`.
23 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Sonuç:** gerçek ürün ticket API'si, kurulu OpenNext request context kodu,
Cloudflare named Service binding ve mevcut Bridge SQLite Durable Object yolu
workerd motorunda çalıştı. 12 kontrol PASS; tüm yeniden başlatma ve kayıp
cevap senaryolarında **1 dış MPC + 1 iç bilet gönderimi** oluştu. Zincir ve
kimlik sağlayıcısı yanıtları sentetiktir; gerçek satın alma kabulü değildir.

## Değişen dosyalar

- `workers/livepeer-bridge/scripts/near-auth-ticket-runtime.mjs`: tek amaçlı,
  çalıştırılabilir native Worker runtime kontrolü.
- `docs/testing.md`: çalıştırma komutu, kapsam ve kanıt sınırı.
- Bu rapor ve `near-auth-integration-status.md`.

Uygulama/kontrat/ekonomik kurallar, dependency/lockfile, kalıcı env/wrangler
ayarları, kullanıcı cihaz/ödeme kayıtları ve Git index değişmedi. 3000
sunucusu yeniden başlatılmadı; cüzdan/tarayıcı açılmadı. Gerçek anahtar,
fonlama, CI, commit/push ve deploy yapılmadı. Test için oluşturulan anahtarlar
sentetiktir; dış ağ veya gerçek hesapla kullanılmaz.

## Test nasıl çalışıyor?

Repository kökünden, Node 24 ve mevcut Web/Bridge bağımlılıklarıyla:

```bash
node workers/livepeer-bridge/scripts/near-auth-ticket-runtime.mjs
```

Kurulu Wrangler üzerinden gelen Miniflare/workerd kullanılır; paket eklenmedi.
Gerçek `apps/web/app/api/auth/ticket/route.ts` ve Bridge kaynakları izole test
Worker'larına paketlenir. Web Worker, kurulu OpenNext 1.18.0
`runWithCloudflareRequestContext` ve `getCloudflareContext` uygulamalarını
kullanır. WorkerEntrypoint ve DO için Node stand-in yoktur.

Test wrapper'ı yalnız gerçek POST handler'ını Worker fetch'e bağlar. Next'in
`.env` modülü boş sentetik modülle, public build değerleri sentetik değerlerle
karşılanır; session/sponsor secret'ları bundle içine konmaz. Kurulu Wrangler
4.90.0'ın kendi Node uyumluluk katmanıyla dry-run paketleme yapılır. Bunlar
Next sunucu/render pipeline'ının tamamının çalıştırılması demek değildir.

Yerel port otomatik seçilir; 3000 kullanılmaz. `NEAR_AUTH_MPC` service binding'i
`runtime-bridge` içindeki `NearAuthMpcSponsor` entrypoint'ini hedefler. Mevcut
`LivepeerControl` aynı sınıf ve SQLite storage ile çalışır. Testin ürettiği
ayrı kalıcı dizin bütün runtime restart'larında aynen kullanılır.

Provider discovery, JWKS ve NEAR RPC istekleri outbound fixture içinde sonlanır;
tanınmayan istekler reddedilir, internete aktarılmaz. Session cookie gerçek
şifreleme, approval token gerçek RS256/JWKS kontrolünden geçer. Sentetik
alıcı ve sponsor Ed25519 imzaları ayrıca fixture tarafında doğrulanır.
Bu, gerçek Google/passkey login veya FastAuth/MPC sağlayıcı kabulü değildir.

## Geçen 12 kontrol

1. Kapalı varsayılanlar; gerçek ürün session cookie ve origin reddi.
2. Eksik özel binding durumunda kapalı kalma.
3. Gerçek Web review hazırlığı, JWKS onayı, yanlış subject ve eski token reddi.
4. Bridge mutasyonu kapalı veya günlük bütçe eksikken sıfır gönderim.
5. Eşzamanlı iki submit çağrısında native RPC/SQLite ile tek dış gönderim.
6. Dış gönderimin cevabı kaybolduktan sonra runtime restart; review olmadan
   aynı operation ID/hash'e ulaşma, ikinci dış gönderim yapmama.
7. Gerçek payload için doğrulanan MPC imzası; eşzamanlı iki execute çağrısında
   tek iç bilet gönderimi.
8. İç gönderim cevabı kaybı ve restart; gönderimler kapalıyken salt-okunur
   status ve aynı iç hash. Yeniden execute kapalı kalır.
9. Payment receipt tek başına kabul edilmez; entitlement eksikken reddedilir.
   Hak ve cihaz kanıtı tamamlanınca terminal sonuç, ardından bir başka restart.
10. Mevcut hak için tekrar bilet hazırlığı reddedilir; sayaçlar 1/1 kalır.
11. Bridge genel HTTP `/internal/mpc/submit`, `/status`, `/ticket` yolları 404;
    özel servis metotlarına public HTTP üzerinden erişilemez.
12. Testin kendi SQLite/storage dosyalarında raw approval JWT, sponsor private
    key, Web session secret ve kimlik subject'i bulunmaz.

Her fixture hatası ayrıca kaydedilip testi başarısız yapar; hatalı fixture
sessizce “zincir sonucu bilinmiyor” olarak başarılı sayılamaz. Test sonuçları
`tmp/near-auth-ticket-runtime-*/result.json` altında tutulur. Son başarılı
kanıt: `tmp/near-auth-ticket-runtime-9n5YTl/result.json`.

## Bulunan uyumluluk farkları

Ham esbuild paketi Worker'a doğrudan verildiğinde Node modül çözümlemesi ve
OpenNext'in beklediği process alanları eksik kaldı. Test, Worker hedefli
paket seçimi ve kurulu Wrangler'ın standart Node uyumluluk katmanıyla düzeltildi;
uygulama helper'ına özel process/env taklidi eklenmedi.

OpenNext'in mevcut `init.js` kodu binding'deki string vars/secret'ları
`process.env` içine taşıyor. Native test **mevcut 2025-03-25 Web compatibility
tarihiyle**, yeni populate-process-env bayrağı eklenmeden geçti. Ön kontroldeki
bu soru bu API/OpenNext runtime sınırında kapandı. Tam hosted artifact ve
release secret aktarımı hâlâ ayrı doğrulanmalıdır.

Runtime, yeni bir ekonomik kaynak hatası göstermedi. Miniflare + Wrangler
ile 12 kontrol PASS; `node --check` PASS. Derleme sırasında üçüncü taraf
paketlerden gelen mevcut `typeof ... === "null"` uyarısı fail sayılmadı.
Uygulama kodu değişmediği için Web/Bridge birim test paketleri, Rust testleri
ve tarayıcı suite'i tekrar çalıştırılmadı. Doküman build PASS; mevcut 500 kB chunk uyarısı sürer.

## Kanıt sınırı ve sonraki gate

Bu çalışma **LOCAL_TEST**: gerçek workerd/RPC/SQLite, gerçek route ve OpenNext
başlatıcısı; sentetik dış servisler. **EXTERNAL_NOT_RUN:** tam Next HTTP
sunucusunun Bridge'e bağlanması, mevcut 3000 oturumu, gerçek provider onayı,
sponsor fonlaması, zincir giderleri, kullanıcı satın alma/izleme, hosted/CI/
Production. Kaynak ve test başarısı bu kanıtların yerine geçmez.

**Tek sonraki gate: `NEAR_AUTH_V1_TICKET_LOCAL_ACCEPTANCE_SETUP`.** Önce gerçek
Next yerel sunucusunun özel Bridge binding'i ve kalıcı dizini somut kuruluma
bağlanmalı. Aynı gate içinde sponsor hesabı/public key/epoch, kullanıcı/yayın
çifti, net fonlama ihtiyacı ve önceki 0,70 test NEAR MPC rezervi önerisi
somutlaştırılır. Gerçek secret/hesap/fonlama veya mevcut 3000 runtime'ını
değiştiren adımlar ancak bu somut kapsam açıkça onaylandığında uygulanır;
kurulum kendiliğinden satın alma onayı değildir. Bu source gate bunları
başlatmadı. Hosted release wiring'i ilk yerel kabulün önkoşulu yapılmadı.
