# Google hesabının video hakkı ön kontrolü

Gate: `NEAR_AUTH_MEDIA_PREFLIGHT` — **COMPLETED_WITH_WARNINGS / kapalı**.
Tarih: 16 Eylül 2026. Yerel uygulama ve salt okunur testnet kontrolü tamamlandı;
gerçek Google oturumuyla yeni ekranın tarayıcı kabulü yapılmadı.

## Amaç ve kapsam

Kullanıcı Brave çökmesi araştırmasını erteledi ve imza denemesinden sonra
plana devam edilmesini istedi. Google imzalı transfer zaten kesinleşti;
tekrar transfer veya imza başlatılmadı. Brave kararlılığı kanıtlanmış sayılmaz.

Mevcut Market `activate_playback_device` yolu, doğrudan Ed25519 imzası,
1 yoctoNEAR, yayının kaldırılmamış olması ve hesabın o videoda izleme hakkını
gerektiriyor. Bridge V3 cihazın yetkilendirici anahtarını FullAccess olarak
kontrol ediyor. Google/MPC imzası doğrudan hesap işlemi olarak bu sınırla
uyumlu; kendine transferin başarısı cihaz/medya kabulü değildir.

Bu gate'in değiştirilebilir dosyaları:

- `apps/web/lib/near-auth-media-preflight.ts` — yeni salt okunur kontrol.
- `apps/web/app/api/auth-lab/account/route.ts` — mevcut korumalı API'ye yayın sorgusu.
- `apps/web/components/NearAuthLab.tsx` — yayın kimliği ve sonuç ekranı.
- `apps/web/__tests__/unit/near-auth-media.test.ts` — yeni kontrolün testleri.
- `docs/architecture/near-auth-google-signing-lab.md` — kullanıcının erteleme kararı.
- Bu rapor; `tmp/near-auth-media-preflight/evidence/` yerel kanıtları.

Yasak/değişmeyen kapsam: WalletProvider, ödeme ve imza gönderimi, cihaz anahtarı
deposu, kontratlar, Bridge, D1, provider/secret/config, paketler ve feature flag
varsayılanları. Önceki commitlenmemiş dosyalar korundu; yalnız yukarıdaki
mevcut dosyalara dar ekleme yapıldı. Commit/push/PR/CI/deploy yapılmadı.

## Davranış ve kabul

- `/auth-lab` içinde kullanıcı video yayın kimliğini girip kontrolü başlatır.
  API: boş gövdeli `POST /api/auth-lab/account?publication=<id>`.
- Hesap, subject, anahtar veya token istemciden kabul edilmez. Hesap mevcut
  doğrulanmış HttpOnly oturumdan türetilir; önceki pilotun implicit hesabı
  kullanılır. Başka cüzdan hesabı veya eski satın alma taşınmaz.
- Development + açık lab flag + testnet + loopback + aynı origin korumaları
  aynen geçerlidir. Tek yayın parametresi, en fazla 128 karakter; ek/tekrarlı
  parametre ve dolu gövde reddedilir. Yanıtlar no-store'dur.
- Türetilmiş anahtar yeni kesinleşmiş blokta yeniden FullAccess kontrolünden
  geçer. Yapılandırılmış testnet Market hesabında kod bulunmalıdır. Sözleşme
  kodu bulunması belirli bir deployed kaynak sürümünün kanıtı değildir.
- Market kodu, yönetim durumu, yayın ve `has_entitlement` aynı kesinleşmiş
  blokta okunur. Medya okumaları ortak 10 saniyelik süreyle sınırlıdır;
  önceki hesap keşfinin ayrıca mevcut 20 saniyelik sınırı vardır.
- Eksik yayın, kaldırılmış yayın, durmuş Bridge ve hak yokluğu ayrı sonuçtur.
  Satışları durdurulmuş yayında mevcut izleme hakkı korunur.
- Bozuk/eksik yanıt, değişen blok, sınırlı anahtar ve servis hatası hiçbir
  zaman olumlu sonuç veya kesin hak yokluğu olarak gösterilmez.
- Olumlu sonuç yalnız izleme hakkı ön koşuludur. Bakiye, cihaz kapasitesi,
  cihaz kaydı, imza adaptörü veya gerçek playback hazır denmez;
  `playbackVerified=false` kalır. Özel anahtar oluşturulmaz/silinmez.

## Kanıt

- `LOCAL_TEST`: `npm test -- --run`: **41 dosya / 565 test PASS**;
  yeni kontrolde 26 senaryo. Kimlik/hesap ve dış RPC cevapları sentetiktir.
- `LOCAL_STATIC`: `npm run test:near-auth-types`, `npm run lint`,
  `npm run build` PASS. Derleme komutunda yalnız mevcut testnet placeholder
  public contract değerleri kullanıldı; ortam dosyası değiştirilmedi.
- Derleme uyarıları: middleware adlandırması ve Auth0/Next Edge Runtime
  uyumluluk uyarıları sürüyor. Bunlar bu gate'te düzeltilmedi; derlemenin
  geçmesi Cloudflare/Production kabulü değildir.
- `LOCAL_TEST`: yerel production sunucusunda lab flag açıkken yeni yayın
  sorgusu **404**, `Set-Cookie` yok. Canlı production kanıtı değildir.
- `PROVIDER`: yeni kontrol fonksiyonu gerçek testnet üzerinde çalıştırıldı.
  Hesap bilgisi, kullanıcının verdiği `CfXjRkCa5XBaTNC8RWpbDVm3aBQ8iQuVFZzhvXPFGkkM`
  işleminin FINAL/başarılı göndereninden alındı. Bu yeni Google oturumu veya
  tarayıcıdan uçtan uca API kabulü değildir.
  Market: `video-market-v1-260907.youtick-dev-v3.testnet`.
  Blok: **268856850**. Tek örnek yayın:
  `lp-7518e5a3-fbd1-444a-909a-5dc8e037f70c`.
  Yayın ACTIVE; `has_entitlement=false`; sonuç `entitlement_required`.
  Başka videolarda hak bulunmadığı iddia edilmez; bu video satın alma için
  kullanıcı tarafından seçilmiş veya onaylanmış sayılmaz.
- `EXTERNAL_NOT_RUN`: gerçek oturumla yeni ekran kabulü, satın alma, yeni
  cihaz kaydı, upload/playback, CI/deploy. Ham kimlik/token veya gerçek
  hesap/anahtar yeni kanıt dosyalarına yazılmadı.

Kanıtlar: `tmp/near-auth-media-preflight/evidence/provider-read.json`,
`production-closed.json`, `result.json`.

## Tek sonraki gate

`NEAR_AUTH_TICKET_PURCHASE_SOURCE`: mevcut USDC bilet satın alma + aynı
işlemde ilk cihaz yetkilendirme yolunu kapalı lab içinde Google imzasına
bağlamak ve yerelde test etmek. Genel amaçlı işlem API'si, kart sağlayıcısı
veya sözleşme değişikliği eklenmemeli. Eski self-transfer deneme kilidi veya
mevcut cihaz anahtarları sıfırlanmamalı.

Bu ön kontrol gate'inin yerel uygulaması için blocker yok. Canlı izleme için
kontrol edilen Google hesabı/video çiftinde izleme hakkı eksik. Gerçek satın
alma öncesi video, fiyat, testUSDC bakiyesi/kaydı, ilk cihaz kaydı ve her iki
hesabın ücret bütçesi somutlaştırılmalı; kullanıcı gerçek işlemi onaylamalı.
Bu gate ödeme yetkisi vermez ve sonraki gate otomatik açılmadı.

16 Eylül kullanıcı devam talimatıyla bu sonraki adım uygulandı:
[NEAR_AUTH_TICKET_PURCHASE_SOURCE](./near-auth-ticket-purchase.md).
