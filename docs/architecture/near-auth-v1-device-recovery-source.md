# NEAR Auth V1 — cihaz kurtarma kaynağı

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_SOURCE`.
26 Eylül 2026 — **COMPLETED_WITH_WARNINGS (LOCAL_STATIC / LOCAL_TEST)**.

Mevcut izleme hakkıyla sosyal cihaz etkinleştirme bağlantısı kaynakta
hazır. Kullanıcı önce cihazı hazırlar, sonra Google/passkey ile açıkça
onaylar. Yeni bilet veya USDC tahsilatı yok; doğrudan Market işlemi
1 yoctoNEAR ve kullanıcı hesabından ağ gideri gerektirir. MPC dış çağrısı
mevcut sponsor bütçesini kullanır. Canlı kabul veya dağıtım yapılmadı.

## Uygulanan sınırlar

- `/api/auth/device` yalnız `prepare`, `submit`, `execute`, `status` kabul
  eder. Ürün oturumu, aynı origin, sınırlı JSON gövdesi ve kesin alan listesi
  gerekir. Hesap oturumdan, sponsor ayardan türetilir. İstemciden ham işlem,
  sponsor veya farklı hesap kabul edilmez.
- Ayrı şifreli review; subject/origin, yayın generation/playback kimliği,
  cihaz sertifikası, signer/public key, nonce/block ve beş dakikalık süreye
  bağlıdır. Mevcut Auth0 `fatxn` doğrulaması onaylanan tam byte dizisini
  kontrol eder. Lab/ticket review cihaz onayı yerine kullanılamaz.
- Private MPC `device` amacı yalnız tek `activate_playback_device` çağrısı,
  Market alıcısı, 100 Tgas ve tam 1 yoctoNEAR kabul eder. `amountUsdc` yalnız
  bu amaçta `0`; ticket/upload pozitif miktar kontrolleri korunur.
- Web `NEAR_AUTH_V1_DEVICE_ENABLED` ve Bridge `NEAR_AUTH_DEVICE_ENABLED`
  ayrı, yokken kapalı izinlerdir. Mevcut MPC izni, sponsor/epoch, limitler ve
  yeterli NEAR bütçesi de gerekir. Hiçbir canlı izin veya bütçe değiştirilmedi.
- Ortak hesap kilidi, kalıcı nonce/bütçe ve tek gönderim kullanılır.
  İç gönderim yalnız saklanan operation ID ile `executeDevice` üzerinden
  yapılır. Hash gönderimden önce kaydedilir. Kayıp cevap veya yeniden
  başlatma ikinci gönderim üretmez. Status/reload sadece okur ve uzlaştırır.
- `DEVICE_SUBMITTED` ve `DEVICE_SETTLED` ortak durum sözleşmesine eklendi.
  Başarı için exact inner hash/işlem alanları, başarılı final receipts,
  mevcut hak ve doğru cihaz/key/sertifika/authorizing-key/30 gün gerekir.
  Cihaz kanıtı başarılı Market receipt bloğundan okunur; bugünkü süre dolumu
  tarihsel cihaz işleminin sonucunu değiştirmez. Tarihsel RPC verisi yoksa
  başarı uydurulmaz, kayıt korunur.
- Yayın/hak/freeze ve cihaz listesi Web hazırlık/onayında ve Bridge dış/iç
  gönderim öncesinde tekrar okunur. Satış durması ve yeni satın alımların
  durması mevcut hakkı olanı engellemez; takedown/freeze engeller.
- Market'in mevcut Borsh cihaz listesi tam hesap anahtarından, aynı final
  bloktan okunur. En fazla üç kayıt, biçim, süre ve tekrarlar doğrulanır.
  Süre karşılaştırması bilgisayar saatine değil o bloğun zamanına bağlıdır.
  Aynı anahtar yenilenebilir; dolu listede yeni anahtar kapalı kalır.
- Bekleyen ürün işlemi ve eski lab denemeleri yeni cihaz hazırlığından önce
  kontrol edilir. Cihaz zaten geçerliyse review/onay/gönderim yapılmadan
  oynatma yeniden denenir. Onay ve devam aşamaları mevcut anahtarı yalnız
  okur; eksik veya değişmiş anahtar yerine yenisini üretmez.
- Sosyal oynatıcıda dar cihaz paneli ve ayrı onay düğmesi vardır. Play,
  reload ve token yenileme imza istemez. Bilet/yükleme ekranlarında bekleyen
  cihaz işlemi satın alma diye sunulmaz. Genel wallet fallback açılmadı.

## Değişen dosyalar

| Alan | Dosyalar |
| --- | --- |
| Web cihaz yolu | `apps/web/lib/near-auth-device-server.ts`, `apps/web/lib/near-auth-device-client.ts`, `apps/web/app/api/auth/device/route.ts`, `apps/web/components/NearAuthDeviceRecovery.tsx` |
| Web mevcut bağlantılar | `apps/web/lib/near-auth-mpc-sponsor.ts`, `apps/web/lib/near-auth-signing-server.ts`, `apps/web/lib/device-session.ts`, `apps/web/components/LivepeerPlayer.tsx`, `apps/web/components/providers/WalletProvider.tsx`, `apps/web/components/NearAuthTicketPayment.tsx`, `apps/web/components/LivepeerPaidUploadForm.tsx` |
| Ortak sözleşme/politika | `protocol/paid-media-livepeer-v1/mpc-sponsor.ts`, `protocol/paid-media-livepeer-v1/device-recovery.ts` |
| Bridge | `workers/livepeer-bridge/src/mpc-sponsor.ts`, `workers/livepeer-bridge/src/mpc-entrypoint.ts`, `workers/livepeer-bridge/src/index.ts` |
| Web testleri | `apps/web/__tests__/unit/near-auth-device-client.test.ts`, `near-auth-device-ui.test.ts`, `near-auth-signing-server.test.ts`, `device-session.test.ts`, `wallet-provider.test.ts` (aynı dizin) |
| Bridge testleri | `workers/livepeer-bridge/src/device-recovery.test.ts`, `workers/livepeer-bridge/src/mpc-sponsor.test.ts` |
| Doküman | Bu rapor ve `docs/architecture/near-auth-integration-status.md` |

Kontrat, manifest/lockfile, canlı ayar, genel skill/agent ayarı ve index
kapsam dışıdır. near-api-js Web/Bridge lock ve kurulu sürüm 7.3.0; Auth0 SPA
2.26.0 korunur. Mevcut SDK transaction API'si ve Next route/client kuralları
incelendi; yeni bağımlılık veya state migration yok.

## Doğrulama

- **LOCAL_TEST:** Web `npm test -- --run`: **1038/1038**, 52 dosya.
  Yeni kontroller; kapalı izin/pending önce, mevcut key/no-op, onay sırasında
  hesap/key değişimi, açık devam, salt-okunur reload, çift tıklama, API
  origin/session/body, tam approval byte'ları ve eski akış uyumunu kapsar.
- **LOCAL_TEST:** Bridge `npm test -- --run`: **529 PASS, 3 SKIPPED**, 10 dosya.
  Üç mevcut isteğe bağlı yük/abuse testi çalıştırılmadı. Cihaz policy testleri
  Borsh serializer ile gerçek depo biçimini, üç slotu, süreyi ve saat kaymasını
  doğrular. MPC testleri dar action reddi, özel entrypoint, ayrı kapalı izin,
  tek dış/iç gönderim, restart/crash, final proof ve bekleyen kilidi kapsar.
- **LOCAL_TEST:** `cargo +1.86.0 test --test paid_media_livepeer_v1 explicit_device_activation`:
  **4 PASS**, 37 kapsam dışı filtrelendi; authority/deposit/sertifika,
  creator/suspended sales, no-op/yenileme, üç cihaz ve storage runway.
- **LOCAL_STATIC:** auth strict tip kontrolü, genel Web TypeScript,
  değişen Web dosyalarının lint'i ve Bridge `npm run check` PASS.
  ABI kontrolü PASS: Market 48, access 26. Doküman build ve 25 dosyalık
  kapsam kontrolü PASS; index ve kapsam dışı dosyalar korundu. Mevcut
  doküman 500 kB bundle uyarısı sürer. Testler sentetik hesap/anahtar ve mock
  RPC kullanır. Kapsam kanıtı:
  `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-device-recovery-source-uexouey7/scope.json`.

## Açık sınırlar

1. **Pending ödeme + süresi dolmuş cihaz:** eski ticket/upload uzlaştırması
   güncel cihaz kaydına bağlı. Final olmuş ticket için cihaz okuması null
   olduğunda kilidin kaldığı artık izole regresyonda doğrulandı. Yeni cihaz
   yolu bu kilidi silmez, ödemeyi tekrarlamaz veya başka işlemle değiştirmez.
   Bu kombinasyonun tam kurtarılması bu değişiklikle çözülmüş sayılmaz.
   İlk canlı kabul yalnız önceki işlemleri settled hesapla sınırlanmalı.
2. Cihaz sayısı gönderim öncesi yeniden okunur; bağımsız eşzamanlı zincir
   işlemlerine karşı atomik garanti değildir. Kontratın dördüncü cihazda
   en eskiyi çıkarma davranışı değişmedi. İlk kabul boş slot ve paralel
   cihaz işlemi olmaması koşuluyla hazırlanmalı; replacement onayı yok.
3. **EXTERNAL_NOT_RUN / UNPROVEN:** gerçek Chrome/Google/passkey cihaz
   onayı, yeni cihaz/yenileme ve oynatma, deployed Market ABI'si, bakiye ve
   slotlar, Auth0/provider kabulü, hosted ortam, CI/deploy. Web üretim build'i
   çalışan yerel sunucunun çıktısına dokunmamak için çalıştırılmadı.
   Kullanıcının tarayıcı deposu, gerçek anahtarları ve canlı işlemleri okunmadı.

Kaynak engeli yok; genel kurtarma ve canlı kabul yukarıdaki sınırlarla açık.
Resmî [NEAR Auth](https://docs.auth.near.org/) kimlik/onay modeline ve
[NEAR erişim anahtarları](https://docs.near.org/protocol/accounts-contracts/access-keys)
FullAccess/deposit ayrımına bakıldı; örnek SDK'ya geçilmedi. Bu inceleme
provider veya dağıtılmış kontrat kabulünün yerine geçmez.

**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ACCEPTANCE_PREFLIGHT`
— başlatılmadı.** Yalnız canlı kabul adayını, mevcut ABI/boş slot/hak/bakiye,
kapalı izinler ve bütçe sınırlarıyla hazırlamak; imza veya gönderim açmak değil.
