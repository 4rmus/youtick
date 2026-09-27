# NEAR Auth V1 — cihaz kurtarma kabul ön kontrolü

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ACCEPTANCE_PREFLIGHT`.
26 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Zincirde hak, boş cihaz yuvası, metot ve bakiye uygun; canlı kabul henüz
başlatılamaz. Web ve özel Bridge çalışmıyor.** Chrome'daki mevcut sayfa
`ERR_CONNECTION_REFUSED` gösteriyor. Bu gate sunucu başlatmadı, cihaz kaydı
üretmedi ve hiçbir imza/gönderim iznini açmadı.

## Kapsam ve kanıt

Yalnız bu rapor ve ana plan değişebilir. Kabul ölçütleri: dağıtılmış metot,
aynı final blokta hak/yayın/cihaz/bakiye, önceki işlem kilitleri ve kapalı
runtime sınırlarının belirlenmesi. Uygulama, kontrat, config, bağımlılık,
index, tarayıcı deposu ve Keychain özel anahtarları kapsam dışıdır.
`youtick-near-auth` ve `near-api-js` yönergeleri izlendi.

**Taze testnet okuması:** 26 Eylül 2026 07:33:09 UTC / 10:33:09 Türkiye.
Final blok **270297245**, hash
`3GccDiXdFnR8QLEpqkKv1JSuwqgasGUSRzULXd8tD9L6`;
blok zamanı `2026-09-26T07:33:05.069Z`.
`https://test.rpc.fastnear.com/` üzerinden yalnız view/query, block, gas ve
protocol okumaları yapıldı. İşlem gönderim metotları okuyucuda izinli değil.

## Dağıtılmış Market ve provider

- Market: `video-market-v1-260907.youtick-dev-v3.testnet`.
- Gerçek `view_code` baytları: **388291**. Hesap/code yanıtı ve baytlardan
  hesaplanan hash aynı: `9FvV8rRn1FQg15jHG4fNZPXjskdMTr6jZBVgNFZyb731`.
  Önceki [korumalı deploy kaydı](./near-auth-compact-market-deploy.md) ile
  eşleşiyor. WASM export listesinde `activate_playback_device` ve
  `get_playback_device` var. WASM çalıştırılmadı, kontrat çağrısı gönderilmedi.
- `bridge_frozen:false`, `new_purchases_paused:false`.
- Protocol **87**, gas price **100000000**, minimum gas purchase price
  **1000000000**; kaynakta izin verilen sınırlar içinde.
- FastAuth view: `paused:false`, `mpc_address:v1.signer-prod.testnet`,
  `mpc_domain_id:1`. Bu, Auth0 kullanıcı onayı veya MPC imza kabulü değildir.

## Hesap adayları

Google/passkey isimleri önceki kabul kayıtlarındaki eşleşmedir. Bu tur
Chrome'da aktif oturum hesabı taze doğrulanamadı; aşağıdakiler public zincir
hesaplarının mevcut durumudur.

| Aday | Kullanılabilir test NEAR¹ | Aktif cihaz / boş yuva | Hak ve yayın |
| --- | --- | --- | --- |
| Eski Google `29445f46…72324c` | 0.126495334478617799999999 | 1 / 2 | Ortak satın alınmış videoda hak true, ACTIVE; kendi yüklemesi Published/ACTIVE |
| Passkey `9db6cbd9…59d21a` | 0.125642147419375399999998 | 1 / 2 | Aynı satın alınmış videoda hak true, ACTIVE; kendi yüklemesi Published/ACTIVE |

¹ Bakiye eksi locked ve depolama rezervi. Her iki kullanıcı anahtarı
**FullAccess**; mevcut iç işlem kontrol rezervi **0.12 test NEAR** karşılanıyor.
Bu rezerv gerçek işlem ücreti tahmini değildir. Yeni fonlama yapılmadı.

Cihazlar aynı final bloktaki, tam hesaba bağlı Borsh kayıtlarından okundu.
Her hesapta tek 30 günlük aktif kayıt var; mevcut `authorizing_public_key`
**null**, önceki delegate upload ile uyumlu. Google cihaz süresi
**23 Ekim 2026 13:59:33 UTC**, passkey **24 Ekim 2026 20:24:21 UTC**.
Şu anda iki hesabın zincir cihaz kaydı da süresi dolmuş değil.
Tarayıcıdaki anahtarın bu kayda eşit olduğu veya farklı olduğu doğrulanmadı.

İlk kabul adayı: eski Google hesabı ve mevcut biletli hedef
`/watch?job=lp-f263096b-8992-4fd8-afc4-7b4c758cfc82`;
generation **1**, playback ID **5c69z8t8mhoyuaa8**, hak **true**, yayın
**ACTIVE**. İkinci hesabın testi aynı kabulden çıkarılmaz.

Mevcut Chrome anahtarı geçerliyse yeni kaynak yalnız oynatmayı yeniden
kontrol eder; bu gerçek cihaz aktivasyonunu kanıtlamaz. Gerçek yeni cihaz
kabulü için mevcut depoyu silmeden ayrı Chrome profili/cihaz gerekir.
Aynı anahtarla gerçek süre yenileme şu anki aktif kayıtlardan kanıtlanamaz;
saati değiştirerek veya kaydı silerek senaryo zorlanmaz.

## Korunmuş işlemler ve sponsor

Mevcut actor dosyasında WAL yoktu. Baytları kopyalama boyunca aynı kaldı;
yalnız geçici kopya read-only/immutable SQLite olarak açıldı, integrity **ok**.
**10 MPC kaydının hash'i önceki kurtarma kanıtıyla aynı:** iki
`TICKET_SETTLED`, iki `UPLOAD_SETTLED`, iki son-işlem pointer'ı, nonce ve üç
günlük sayaç kaydı. `mpc:active` yok. Bu yerel kalıcı kayıt kanıtıdır;
dört eski işlemin receipt'leri bu tur yeniden sorgulanmadı. Taze zincir
okumasında iki bilet hakkı ve iki Published yükleme ayrıca doğrulandı.

Sponsor `e582a5e0…1f975c` / `local-v1`: **FullAccess**, kullanılabilir bakiye
**0.7796063039625593 test NEAR**. Config işlem rezervi **0.35**, günlük tavan
**0.70**, minimum bakiye **0.05**, hesap başına günlük **1** deneme.
Tek işlem için 0.35 + 0.05 kontrolü geçiyor. Sayaçlar 23/24 Eylül tarihli;
silinmedi veya sıfırlanmadı. Mevcut limitler yeni harcama onayı değildir.
Özel anahtar veya Keychain içeriği okunmadı.

## Canlı kabul engeli ve sonraki kurulum sınırı

- Chrome'da önceki upload URL'si açık fakat siteye ulaşılamıyor. Sekme
  yeniden yüklenmedi/navigate edilmedi; giriş veya düğme onayı yapılmadı.
- Web **3000**, Bridge **61474**, eski registry debug portları **61480** ve
  **58062** kapalı. Eski Web PID 69538/69539 ve Bridge PID 95151 yok.
  Registry dosyaları mevcut ama çalışan servis kanıtı değil.
- Bridge config MPC/ticket/upload izinleri **false**, cihaz izni **yok →
  kapalı**. Web çalışmadığı için güncel çalışan Web env'i veya session
  continuity iddiası yok. Beş yerel config/metadata/başlatıcı dosyası korundu.
- Eski birleşik `start.mjs` config dosyalarını yeniden yazar ve Web için
  yeni rastgele session secret üretir. Önceki Bridge-only başlatıcı ise
  registry kaydının olmamasını bekler; mevcut stale registry ile doğrudan
  tekrar kullanılmamalı. Bu iki başlatıcı çalıştırılmadı.
- Sonraki kapalı kurulum aynı origin (`http://localhost:3000`), sponsor,
  epoch ve ekonomik kayıtları korumalı. Önceki geçici Web oturum anahtarının
  yeniden kullanılabildiği doğrulanmadı; yeniden giriş gerekebilir. Bu
  kullanıcı NEAR kimliğinin veya tarayıcı cihaz anahtarının değiştirilmesi
  anlamına gelmez. Yeni oturum ihtiyacı gizlenmemeli.
- İlk kurulumda cihaz dahil tüm gönderim izinleri kapalı kalmalı. Web'den
  yeni cihaz API'sinin status yanıtı, doğru hesap ve aynı settled pointer
  doğrulanmadan gerçek kabul veya harcama açılmamalı. Yeni kaynak Bridge'e
  yüklenmiş sayılmaz; önceki süreç `watch:false` idi ve artık yok.

Ön kontroldeki **pending ödeme + expired-device** tam kurtarma sınırı
sürüyor. Adayların yerel önceki işlemleri settled olduğu için bu sınırın
üzerinden atlanmıyor. Üç cihaz kontrolü eşzamanlı bağımsız zincir işlemlerine
karşı atomik değil; kabul öncesi tekrar okunmalı, paralel cihaz işlemi ve
başka cihazın yerini alma denenmemeli.

## Doğrulama ve sonuç

**PROVIDER / testnet read-only:** kod hash/export, final blok, provider
view'ları, hak/yayın, FullAccess/bakiye ve cihaz yuvaları.
**LOCAL_STATIC:** SQLite integrity/kayıt eşitliği, runtime yokluğu, kapalı
config ve kaynak başlatma sınırları. **LOCAL_TEST:** yeni uygulama testi
çalıştırılmadı; önceki kaynak gate'inin 1038 Web/529 Bridge/4 kontrat sonucu
burada yeni canlı kanıt sayılmaz. Doküman build, zincir okuma assert'leri ve
iki dosyalık kapsam kontrolü **PASS**. Actor/config baytları ve index aynı;
mevcut doküman 500 kB bundle uyarısı sürer.

**EXTERNAL_NOT_RUN / UNPROVEN:** servis başlatma/yeniden başlatma, güncel
Chrome oturumu ve cihaz key eşleşmesi, yeni login, key oluşturma/depo
silme, provider onayı, MPC/Market gönderimi, yeni oynatma, fonlama,
config/secret değişikliği, CI/deploy.

Kanıt dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-device-acceptance-preflight-njaejuuz/`.
Salt-okunur sorgu paketi `read-chain.mjs`, sonuç `chain-safe.json`, korunma
hash'leri ve actor kopyası bu dizindedir.

**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LOCAL_RUNTIME_SETUP`
— başlatılmadı.** Aynı verilerle Web + özel Bridge'i gönderimler kapalı
kurmak ve oturum/status bağlantısını doğrulamak; gerçek cihaz onayı ayrı
kabul gerektirir. Yerel servisler ve oturum doğrulanmadan canlı kabul NO-GO.
