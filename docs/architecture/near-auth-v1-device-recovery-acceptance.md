# NEAR Auth V1 — gerçek cihaz kurtarma kabulü

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ACCEPTANCE`.
26 Eylül 2026 — **PASS (localhost / public testnet / Chrome / Google / yeni cihaz)**.

**Mevcut bilet yeniden satın alınmadan yeni Chrome cihazı etkinleştirildi.**
Tek cihaz işlemi `DEVICE_SETTLED` oldu; eski cihaz korundu. Gönderimler
tekrar kapatıldıktan sonra sayfa yenilendi ve video **1920×1080**, **30,037333
saniye** boyunca hatasız oynadı. Son sayfa yenilemesi de yeni onay istemedi.
Bu sonuç süresi dolmuş cihaz yenilemesi veya passkey kabulü değildir.

## Yetki ve dar kapsam

Kullanıcı bu hesap için tek cihaz testini açıkça onayladı: sponsor rezerv
üst sınırı **0,35 test NEAR**, kullanıcı üst sınırı **0,12 test NEAR**
(1 yoctoNEAR dahil). Son Google/passkey işlem onayını kullanıcı verdi.
Sadece MPC/device yolu geçici açıldı; ticket/upload kapalı kaldı. Yeni
bilet, USDC aktarımı, fonlama, başka cihazı çıkarma veya deploy yapılmadı.

Kaynak ve index korunur. Repo değişikliği bu rapor ve ana plan; geçici
başlatıcı/kanıtlar ile yerel runtime metadata/registry değişimleri ve
onaylanan cihaz/işlem kayıtları ayrı kapsamdır. `youtick-near-auth` ve
`near-api-js` yönergeleri izlendi; provider onayı kullanıcıya bırakıldı.

## Hazırlık ve çalışma ortamı

- Hesap: `29445f46f23551e48c99869c2e34e3acb283902db8196da32cb3f6625872324c`.
  Chrome doğru hesabı ve mevcut bileti gösterdi; izleme cihazı eksikti.
  Eski tarayıcı kaydı silinmedi, ayrı profil veya kimlik birleştirme yok.
- Yayın: `lp-f263096b-8992-4fd8-afc4-7b4c758cfc82`, generation **1**,
  playback **5c69z8t8mhoyuaa8**; başlık `Player V2 1080 landscape`.
- Taze final blok **270300528**, zaman **2026-09-26T08:04:06.484Z**:
  mevcut hak true, ACTIVE, freeze false; 1 aktif cihaz / 2 boş yuva.
  Market kod hash'i önceki doğrulanmış deploy ile aynı.
- Google kullanılabilir bakiye **0,126495334478617799999999**; sponsor
  **0,7796063039625593** test NEAR. İki kontrol rezervi de karşılandı.
  Önceki dört operation settled ve aktif MPC kilidi yoktu.
- Aynı origin, sponsor, `local-v1`, kalıcı state ve **aynı Web session
  secret** korundu. Yeni giriş gerekmeyen oturum devamı doğrulandı.
- İlk kapatma girişiminde Web alt/proxy süreci kaldığından başlatıcı güvenli
  biçimde durdu. Yalnız bu kuruluma ait PID/registry portu ve session-key
  hash'i eşleşen süreçler kapatıldı; anahtar yalnız bellekte taşındı.
  Başarısız başlangıçlarda MPC/Market gönderimi yapılmadı.
- Kabul runtime'ında yalnız `MPC=true`, `DEVICE=true`; `TICKET=false`,
  `UPLOAD=false`. Sponsor günlük rezervi bellekte **0,35** ile bir denemeye
  sınırlandı; config dosyaları değiştirilmedi. 10 dakikalık otomatik kapatma
  koruması hazırdı; başarıdan sonra ayrıca hemen kapalı moda dönüldü.

## Kesinleşmiş işlem ve cihaz kanıtı

| Alan | Sonuç |
| --- | --- |
| Operation | `d1305aebe4ebb69254d59a7e3e25c4b304ecb5b914695ae90fd7d142e52fe5cd` |
| Dış MPC işlemi | [FzULQ33c…FgLE](https://testnet.nearblocks.io/txns/FzULQ33cjnR4HFc9iBGzR5V8oScLhJuUKAHqeixjFgLE) — FINAL, başarılı receipts |
| İç Market işlemi | [EEXUdVYF…K3uw](https://testnet.nearblocks.io/txns/EEXUdVYF5uJAjP5TaE9GRu8DvrsnV1f3Fhx6kW5pK3uw) — FINAL, başarılı receipts |
| İç eylem | Tam bir `activate_playback_device`; doğru Market, 100 Tgas, tam 1 yoctoNEAR |
| Sonuç | `DEVICE_SETTLED`, `amountUsdc:0`, payload/hash/hesap/nonce/args eşleşti |
| Yeni cihaz public key | `ed25519:91BfbX2yi62ncKuHmCh8Mb7QJM4V4CE3ekMSY74sUrYT` |
| Sertifika hash | `6018f4e9be6e55ba59a3c6e93968db39be78cf40996728fbf907ac00c860609b` |
| Yetki sonu | **26 Ekim 2026 08:13:00.081 UTC**, tam 30 gün |
| Cihazlar | **1 → 2 aktif**; eski Google cihaz kaydı aynen korundu; passkey hesabının cihaz kaydı aynı |
| Hak | Mevcut bilet hakkı hâlâ true |

Gerçek dış gas bedeli **0,0045007746806976 test NEAR**; sponsor bakiye
farkı da bu değer. Dış eylemde 1 yoctoNEAR bağlı olsa da net bakiye farkına
fazladan 1 eklenmedi. İç gas bedeli **0,0002588072718148 test NEAR**;
kullanıcı bakiye farkı buna 1 yoctoNEAR eklenmiş değer. Toplam net fark
**0,004759581952512400000001 test NEAR**, iki onaylı üst sınırın altında.
USDC ödeme eylemi yok; kullanıcıya görünen 2 USDC mevcut bilet fiyatıdır.

Yeni cihazın public key, sertifika, kullanıcı authorizing public key ve
süresi aynı final zincir snapshot'ında kontrol edildi. Tek başına MPC imzası
başarı sayılmadı. Dış/iç FINAL ve bütün receipt başarıları ayrıca salt-okunur
sorguyla doğrulandı; ham Auth0 JWT veya cookie kaydedilmedi.

## Chrome oynatma ve sayfa yenileme

Kullanıcı onayı sonrası mevcut sayfa oyuncuya geçti. İzinler kapatıldıktan
sonra aynı Chrome sekmesi yenilendi; doğru hesap ve oyuncu geri geldi.
Sessiz oynatmada gerçek video öğesi:

- Başlangıç: `paused:false`, `currentTime:0.011145`, `readyState:4`,
  **1920×1080**, `error:null`.
- Bitiş: `currentTime:30.037333`, `duration:30.037333`, `ended:true`,
  **1920×1080**, `error:null`.
- Son reload: `currentTime:0`, `paused:true`, `readyState:4`,
  **1920×1080**, `error:null`; yeni cihaz/Google onay düğmesi yok.

Video URL/JWT dışarı alınmadı. Son reload ses tercihini normal başlangıca
döndürdü; video duraklatılmış durumda kullanıcıya açık bırakıldı.

## Kapatma ve korunma

- Çalışan Web'de dört gönderim bayrağı **false**; Bridge kapalı binding'lerle
  yeniden kuruldu. Aynı session-key hash'i korunuyor.
- Son başlatıcı PID **32554**, Web CLI **32559**; Bridge
  `http://127.0.0.1:64575/`, Web `http://localhost:3000`.
- Başlangıçtaki dört operation kaydının hash'i aynı. Tek yeni
  `DEVICE_SETTLED` ile MPC kayıt sayısı **10 → 11**. Aktif kilit yok.
- Google son pointer'ı yeni cihaz operation'ına geçti; günlük hesap denemesi
  **1**, 26 Eylül global rezerv **0,35 test NEAR**, nonce
  **269862673000005**. Sayaçlar silinmedi/sıfırlanmadı. Passkey pointer ve
  günlük sayacı aynı.
- Kalıcı Bridge/Web/sponsor/başlatıcı config dosyaları ve paketler aynı.
  `runtime-public.json` yeni adres ve açıkça kapatılmış cihaz bayrağını
  içerir; registry normal süreç başlangıcıyla yenilendi. Actor kopyası
  read-only/immutable açıldı; SQLite integrity **ok**.

## Doğrulama ve sınırlar

**PROVIDER / gerçek public testnet:** kullanıcının onayı, tam dış/iç FINAL
receipts, cihaz/hak/bakiye ve korunmuş eski kayıtlar.
**Yerel gerçek Chrome:** ürün akışı, 1080p tam örnek oynatma ve iki reload;
yeni onay veya ödeme tekrarına gerek kalmadı.
**LOCAL_STATIC:** başlatıcı sözdizimi, dar kapsam, session/config/ledger
korunması; doküman build ve iki dosyalık kapsam/index kapanış kontrolleri
**PASS**. Mevcut doküman 500 kB bundle uyarısı sürer.
Kaynak değişmediğinden önceki sentetik test paketleri yeniden çalıştırılmadı.

**UNPROVEN / EXTERNAL_NOT_RUN:** passkey ile yeni cihaz, gerçek süre dolumu
sonrası aynı key yenileme, üç dolu cihazda replacement, mobil/Safari,
uzun video/token yenileme, hosted/production ve CI/deploy. Önceki pending
ödeme + expired-device uzlaştırma sınırı devam ediyor; bu hesap settled
olduğu için o sınır aşılmadı veya çözülmüş sayılmadı.

Kanıt:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-device-acceptance-igzjfj8y/`.
`chain-before.json`, `chain-safe.json`, `status-latest-safe.json`,
`final-receipts-safe.json`, `final-ledger-safe.json`, actor/hash snapshot'ları
ve dar runtime paketleri burada. Zincir okuma ve final doğrulama yardımcıları
salt-okunur; gönderim yalnız kullanıcı onaylı ürün akışından yapıldı.

Bu dar kabulde blocker yok. Açık uzlaştırma sınırı diğer cihaz testlerine
geçmeden ayrıca değerlendirilmeli.
**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_PREFLIGHT`
— başlatılmadı.** Bekleyen ödeme ile sonradan süresi dolmuş/kaybolmuş cihazın
ayrımını salt-okunur incelemek; yeni ödeme veya cihaz onayı başlatmak değil.
