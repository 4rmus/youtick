# İzleme oturumu ve oynatma kullanıcı deneyimi planı

> 12 Eylül 2026 belge uzlaştırması: genel kaynak/yayın durumu [current-state.md](./current-state.md), bu playback gate'inin son kabulü **§16** içindedir. Önceki source/teşhis/loop bölümleri tarihsel kayıttır; uygulanacak yeni talimat değildir. Modern player/1080p önerisi bu planın uygulanmış parçası değildir.

> 9 Eylül 2026 — Bu sohbetin teşhis ve planı, son Livepeer player değerlendirmesiyle birleştirilmiştir.
> Belge kaydı, uygulama veya canlı işlem onayı değildir.

- Analiz gate'i: `PLAYBACK_UX_DIAGNOSIS_AND_PLAN` — **COMPLETED_WITH_WARNINGS**.
- Belge kayıt gate'i: `PLAYBACK_UX_PLAN_SAVE` — **PASS / LOCAL_STATIC**.
- Uygulama durumu: **MAIN’DE / PUBLIC-TESTNET’E YAYIMLANDI; KABUL UYARILARLA KAPALI**. İlgili source/yayın ve §16 kabulü kayıtlıdır; fiziksel A/V ve bağımsız yetkisiz hesap HTTP kanıtı eksikleri PASS sayılmaz.
- Son kaynak gate’i: **`PLAYBACK_SINGLE_SIGNATURE_SOURCE` — COMPLETED_WITH_WARNINGS / LOCAL_STATIC + LOCAL_TEST** (bölüm 13). Önceki sekiz saatlik çözüm tarihsel kayıttır; public-testnet için bölüm 13 esas alınır.
- Son teşhis gate’i: **`PLAYBACK_MEDIA_TRACE` — COMPLETED_WITH_WARNINGS / PREVIEW + PROVIDER**. 10 Eylül yeni video incelemesi bölüm 14’tedir; eski video artık aktif hedef değildir.
- Son medya kaynak gate’i: **`PLAYBACK_MEDIA_FIX_SOURCE` — COMPLETED_WITH_WARNINGS**. Yeni `matrixxx` düzeltmesi bölüm 15’tedir; PR #194 ve public-testnet koşusu `34509663409` ile yayımlandı.
- Son kabul gate’i: **`PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE` — COMPLETED_WITH_WARNINGS / KAPALI**. Yayın, teknik ölçümler ve kullanıcı kabulü bölüm 16’nın son kapanış kaydındadır. Aktif veya otomatik başlatılacak sonraki gate yok. Fiziksel ≤150ms kalibrasyon UNPROVEN uyarısı korunur; bütün maddelerin PASS olduğu iddia edilmez.
- Tarihsel çalışma ve yerel kanıt arşivi: `/Users/arair/works/youtick-lp`; yeni kod alanı temiz main’den açılır.
- Kanonik bağlam: [public-testnet planı](./public-testnet-video-v1-plan.md), [kabul kaydı](./public-testnet-video-v1-acceptance.md), [AGENTS.md](https://github.com/4rmus/youtick/blob/b53e00e962b595f0edf4f1283c146d73d1f76b57/AGENTS.md), [test komutları](../testing.md).

## 1. Amaç, kapsam ve sınırlar

Bu playback gate’inde ölçülmüş test videosu: [matrixxx — public-testnet Watch](https://public-testnet.youtick.net/watch?job=lp-0ccc24cb-0b79-4eb7-a2ab-72e5fcbe43e6).

İş kimliği: `lp-0ccc24cb-0b79-4eb7-a2ab-72e5fcbe43e6`. Önceki bölümlerdeki eski video bulguları tarihsel kanıttır; güncel inceleme bölüm 14’tedir.

Hedef deneyim:

- Creator kendi videosunu ücretsiz ve ayrıca izleme imzası vermeden izler.
- Geçerli oturumu bulunan alıcı satın almada en fazla bir kullanıcı işlem onayı verir; ardından ek izleme imzası gerekmez.
- Aynı hesap ve tarayıcıdaki geçerli oturumda yenileme, videoya geri dönüş, Play/Pause ve ileri/geri sarma yeni cüzdan penceresi açmaz.
- Oynatma tokenı kullanıcı imzası istemeden, mevcut player ve ilerleme korunarak yenilenir.
- Sarma sonrasında görüntü ve ses birlikte devam eder.
- Satın almamış başka hesap ücretli içeriğe erişemez.

“İmzasız” kullanıcıya tekrar cüzdan onayı gösterilmemesidir; arka plandaki kimlik ve erişim doğrulaması devam eder. İlk bağlantı, yeni cihaz, çıkış ve gerçekten bitmiş oturum ayrı kimlik doğrulama koşullarıdır.

NEAR ekonomik ve izleme hakkı otoritesi, Livepeer medya katmanı, Bridge kontrol/yetkilendirme katmanı olarak kalır. Yalnız `accountId` bilmek kimlik kanıtı değildir. Feature flag'lerin kapalı varsayılanları değiştirilmez. Yeni servis, bağımlılık, genel oturum çatısı veya geniş refactor hedeflenmez.

Her görevde bir aktif gate yürütülür; kapanınca raporlanır ve durulur. Kullanıcı değişiklikleri korunur; yalnız açıkça belirlenen dosyalara dokunulur. Git yayını, CI tekrar çalıştırma, deploy, ödeme, upload, cüzdan imzası, provider/config/secret, NEAR ve D1 değişiklikleri gate'e özel açık onay gerektirir. Gerçek deploy yalnız korumalı GitHub workflow'larıyla yürür.

## 2. Tarihsel başlangıç teşhisi ve kanıt sınırı

İmza sorununun temel nedeni doğrulandı: satın alma cihaz oturumu oluşturmuyor; player açılırken ayrıca mesaj imzası isteniyor. Oturum yalnız sayfanın belleğinde tutulduğu için yenilemede kayboluyor. Donma ve ses kesilmesinin kök nedeni henüz kesinleşmedi.

### Sürüm ayrımı — 9 Eylül analizindeki gözlem

- Yerel HEAD: `d2d3b035ac1e3afa348f353b014339ab46290e16`; çalışma alanında 64 mevcut kullanıcı değişikliği vardı.
- Kayıtlı acceptance yayını: kaynak `89fd909e91575ff2334d87b301765c9f101fd9db`, [workflow 34347002954](https://github.com/4rmus/youtick/actions/runs/34347002954).
- Canlı Watch sayfasından okunan **20/20 JavaScript dosyası**, bu yayının yerel artifact dosyalarıyla SHA-256 bakımından eşleşti.
- GitHub'daki aynı kaynağın `device-session`, `WalletProvider`, `LivepeerPlayer`, `livepeer-playback`, `LivepeerWatch`, `livepeer-publication` dosyaları çalışma alanındaki dosyalarla birebir eşleşti. Market sözleşme kaynağı da eşleşti.
- Bridge health, kayıtlı `04b1ac24-dfe4-419f-9a75-9334845b1303` sürümünü ve açık V2 oynatma yetkilendirmesini döndürdü. Bridge kaynak farkı yalnız Queue retention koşulundaydı; izleme teşhisine taşınmadı.
- Cloudflare yönetim API'sindeki taze deployment okumaları 401 verdi. Bu analizde yüzde 100 trafik dağılımı yönetim API'sinden yeniden doğrulanmadı; Web için içerik hash'i, Bridge için health ve önceki yayın kaydı kullanıldı.

Bu gözlemler tarihli kanıttır; sonraki çalıştırmada değişmiş runtime'ın aynı olduğu varsayılmaz. Bütün dirty çalışma alanı canlı kabul edilmez. Kanıt sınıfları `LOCAL_STATIC`, `LOCAL_TEST`, `CI`, `PROVIDER`, `PREVIEW`, `PRODUCTION`, `EXTERNAL_NOT_RUN`, `UNPROVEN` olarak ayrılır. Buradaki public-testnet runtime gözlemleri `PREVIEW` sınıfındadır; Production/Mainnet kanıtı değildir.

### Sorun bazında teşhis

| Kullanıcı gözlemi | Doğrulanmış neden veya hipotez | Kod/canlı kanıtı | Eksik doğrulama |
| --- | --- | --- | --- |
| Creator kendi videosunda imza görüyor. | Creator zaten ücretsiz yetkilidir. İstenen imza cihaz kimliğini doğrulayan mesaj imzasıdır. | [Market creator yetkisi](https://github.com/4rmus/youtick/blob/b53e00e962b595f0edf4f1283c146d73d1f76b57/contracts/nft-ticket/src/lib.rs), `has_entitlement`; [device-session](https://github.com/4rmus/youtick/blob/b53e00e962b595f0edf4f1283c146d73d1f76b57/apps/web/lib/device-session.ts), `ensureDeviceSession`. Canlı final NEAR okumasında creator yetkili. | Creator etkileşiminin pencere/onay sayısı bu analizde yeniden ölçülmedi. |
| Satın alma sonrası cüzdan kendiliğinden açılıyor. | Satın alma yalnız bilet işlemini imzalar. Hak doğrulanınca player mount olur ve eksik cihaz oturumu için `signMessage` çağırır. | [Watch](https://github.com/4rmus/youtick/blob/b53e00e962b595f0edf4f1283c146d73d1f76b57/apps/web/components/LivepeerWatch.tsx), `buyLivepeerTicket` sonrası entitlement kontrolü; [Player](https://github.com/4rmus/youtick/blob/b53e00e962b595f0edf4f1283c146d73d1f76b57/apps/web/components/LivepeerPlayer.tsx), otomatik hazırlık effect'i. | Satın alma anından iframe hazır olana kadarki canlı zaman çizelgesi eksik. |
| İlk pencere boş; kapatıp Play'e basınca yeniden imza geliyor. | Otomatik hazırlık pencereyi açıklar. Boş kalmasının kesin nedeni doğrulanmadı. İptal, remount ve iframe yaşam döngüsü ayrı adaylardır. | Brave'deki mevcut konsolda 13 kez `Iframe not loaded`. Eşleşen canlı bundle bu hatayı, iframe artık yokken mesaj gönderildiğinde üretir. | Hatanın ilk boş pencereyle zaman ilişkisi ve cüzdan action-ready durumu eksik. |
| Yenileme veya geri dönüşte yeniden imza gerekiyor. | Sekiz saatlik cihaz yetkisi yalnız modül belleğindeki `Map` içinde; reload anahtarı kaybettiriyor. | `device-session.ts` ve mevcut `device-session.test.ts` reload sonrası kaybı açıkça doğrular. | Güvenli yeni saklama davranışı uygulanmadı veya Brave'de sınanmadı. |
| Tekrarlanan cüzdan çağrısı riski var. | Aynı anda başlayan oturum istekleri ortak bekleyen iş kullanmıyor. Çıkıştan sonra gelen imza yanıtı oturumu geri yazabiliyor. | Dosya yazmadan yerel yeniden üretim: iki eşzamanlı `ensureDeviceSession` çağrısı iki imza isteği ve iki anahtar oluşturdu; `clearDeviceSession` sonrası geç yanıt oturumu geri getirdi. | Bu yarışın kullanıcının ilk boş penceresine neden olduğu kanıtlanmadı. |
| Sararken donma ve ses kesilmesi oluyor. | Gözlenen anda tampon neredeyse tükenmiş; bunun ağ, yetki, segment ekleme/çözme, kalite geçişi veya kaynak medyadan hangisi olduğu belirsiz. | Brave'deki mevcut kayıtta currentTime 11,939456; tampon sonu 11,967036; yaklaşık 28 ms ileri veri, readyState 2, paused false. | Seek, token, sonraki segment, HLS hata/append ve ses olayları aynı zaman çizelgesinde eksik. |

Ek ayrımlar:

- `connect` bağlantı/seçim akışını, `signAndSendTransaction` ödeme onayını, `signMessage` NEP-413 cihaz belgesi imzasını başlatır. `getAccounts` kendi başına mesaj imzalatmaz.
- Normal Play ve sarma kontrolleri doğrudan cüzdan çağırmaz. Normal render tek başına tekrar nedeni değildir; `getWallet` sabit callback'tir. Hesap, iş, generation, playbackId veya retry attempt değişimi player hazırlığını yeniden başlatabilir.
- Başarılı token yenilemesi mevcut kaynak ve player kimliğini korur. Geçici ağ/429/5xx hatasında mevcut tokenı süre sonuna kadar koruyan sınırlı tekrar **zaten canlı pakettedir**; yeni iş olarak yeniden yazılmaz.
- Final blok **267796189** üzerinde creator `lp-arch-creator-260809.youtick-dev-v3.testnet` ve alıcı `soteri.testnet` yetkili; incelenen üçüncü hesap `lp-p3-creator-b-250825.youtick-dev-v3.testnet` yetkisizdi. Bu, üçüncü hesapta gerçek player testi yerine geçmez.
- Anonim ilk 720p segment isteği **401** döndü. Ana ve 720p playlistleri **HTTP 200**, fakat 104 baytlık `EXT-X-ERROR`/`ENDLIST` içeren, sıfır segmentli hata listesi döndürdü. HTTP 200 oynatılabilirlik kanıtı değildir; bu anonim sonucun yetkili Brave isteğinde de yaşandığı kanıtlanmadı.
- Kurulu HLS parser böyle bir hata playlistini manifest/level parsing hatasına dönüştürebilir. Zaman çizelgesi HTTP durumunun yanında güvenli hata sınıfını ve yanıtın gerçek playlist olup olmadığını kaydetmelidir.
- Brave konsolundaki `ERR_CONNECTION_RESET` gözlemleri raporlama uçlarındaydı; medya aktarımının aynı hatayı aldığı sonucuna varılmaz.

Yerel kanıt kayıtları: `tmp/public-testnet-real-upload-20260909/execution/receipt/public-testnet-deployment.json`, aynı klasörde `runtime-verification.json` ve `artifact/web-public-testnet.tar.gz`; önceki yayın gözlemi `tmp/matrixx-upload-check-20260909/report.md`. Bunlar mevcut kanıtlardır; kaydetme gate'i bunları yeniden üretmez.

## 3. Yayın hattı ve Livepeer oynatma seçenekleri

```text
Video dosyası → Livepeer'a doğrudan TUS yükleme
             → Livepeer Studio işleme ve saklama
             → Livepeer HLS medya dağıtımı (360p / 720p)
             → Brave'de Livepeer React Player

NEAR izleme hakkı → Bridge doğrulaması → kısa süreli oynatma JWT'si → Player
```

Bridge `asset/request-upload` üzerinden JWT korumalı VOD asset oluşturma yolunu kullanır. Video baytları tarayıcıya Livepeer/CDN'den gelir; Bridge yalnız kontrol/yetkilendirme yapar. Bu iş yüklenmiş videodur; RTMP/WebRTC canlı yayın akışı değildir.

Mevcut kaynak: `https://playback.livepeer.studio/asset/hls/{playbackId}/index.m3u8`. Test videosunun public playback kimliği `80a9z0vlt2s5bkp4`.

Kurulu oynatma zinciri: `@livepeer/react 4.3.6` → `@livepeer/core 3.3.1` → `@livepeer/core-web 5.2.6` → `hls.js 1.6.16`. YouTick resmî player bileşenlerinin görünümünü ve erişim hazırlığını düzenler. `preload="metadata"`, `videoQuality="auto"`, `capLevelToPlayerSize: true`, `onPlaybackEvents` ve JWT desteği zaten vardır. Kullanıcı kalite menüsü yoktur.

| Seçenek | Değerlendirme ve karar |
| --- | --- |
| Mevcut Livepeer React Player + HLS | **Tercih edilen yol.** Otomatik kalite, sarma, ses ve JWT desteği vardır. Player/provider değişimi için neden kanıtlanmadı. |
| Hazır iframe player (`lvpr.tv`) | Daha az arayüz kodu sağlayabilir. Hesap kimliği ve NEAR hakkını çözmez; kısa tokenın iframe içinde kesintisiz yenilenmesi ayrıca doğrulanmalıdır. İlk çözüm olarak seçilmedi. |
| Playback Info API'den bütün kaynakları vermek | Resmî örnek sunucuda playback info alıp `getSrc` ile player'a verir. Biz `getSrc(access.hlsUrl)` ile yalnız HLS veriyoruz; bu fonksiyon ağdan kaynak keşfetmez. Tam liste MP4 gibi başka kaynağı öne alabilir. Token yanıtı, kaynak izinleri ve korumalı fallback doğrulanmadan liste genişletilmez. |
| MP4 | SDK destekler; mevcut uygulama player'a MP4 vermiyor. Bu videoda uygun korumalı MP4 çıktısı ve kesintisiz token yenileme doğrulanmadı. Varsayılan fallback olarak eklenmez. |
| WebRTC / düşük gecikme | SDK canlı yayın için destekler. Yüklenmiş VOD'da sarma sorununa çözüm gerekçesi yoktur. |
| Tarayıcının kendi HLS oynatması | Kurulu SDK'nın native-only fallback yolunda JWT taşıma riski vardır: `xhrSetup` çalışmaz ve HLS kaynağı sonradan normal video kaynağına çevrilirken JWT query eklenmeyebilir. Ayrı uyumluluk kabulüdür; Brave donmasının nedeni veya tüm Safari sürümlerinin başarısızlığı olarak sunulmaz. |

Özel HLS yapılandırmasının değerlendirmesi:

- Resmî SDK `jwt` prop'u ile VOD HLS isteklerine güncel `Livepeer-Jwt` header'ı ekleyebilir. Bizim custom `xhrSetup` varsa SDK onu, yoksa kendi yolunu kullanır; header iki kez eklenmez.
- Custom yol ayrıca izinli host kontrolü ve token yoksa reddetme sağlar. Sırf SDK'da header desteği var diye bu güvenlik kontrolleri kaldırılmaz.
- `storage={null}` ses ve kalite gibi player tercihlerini saklamayı kapatır. Cihaz kimlik oturumunun reload'da kaybolmasının nedeni bu player ayarı değildir.
- Auto / sabit 360p / sabit 720p karşılaştırması medya teşhisine eklenir. Gerekirse aynı yetkili HLS ve aynı header ile kurulu `hls.js` kullanılarak sade bir teşhis karşılaştırması yapılır; yeni ürün oynatıcısı yazılmaz.
- Kalite menüsü gerekirse mevcut `VideoQualitySelect` bileşeniyle yapılabilir. Menü eklemek tek başına donma düzeltmesi değildir; kalıcı UI eklemesi bu teşhis için zorunlu değildir.

Resmî kaynaklar (9 Eylül kontrolü): [Livepeer UI Kit](https://github.com/livepeer/ui-kit), [VOD oynatma seçenekleri](https://github.com/livepeer/docs/blob/main/v2/solutions/livepeer-studio/video-on-demand/playback-asset.mdx), [JWT entegrasyonu](https://github.com/livepeer/docs/blob/main/v1/developers/guides/access-control-jwt.mdx), [Root seçenekleri](https://github.com/livepeer/docs/blob/main/v1/sdks/react/player/Root.mdx), [Video/HLS yapılandırması](https://github.com/livepeer/docs/blob/main/v1/sdks/react/player/Video.mdx), [kalite seçimi](https://github.com/livepeer/docs/blob/main/v1/sdks/react/player/VideoQualitySelect.mdx). Belgelerdeki yetenek ile kurulu sürümün gerçek davranışı ayrı doğrulanır.

## 4. Tercih edilen en küçük oturum çözümü

**Mevcut cihaz oturumunu ilk bağlantıda kur; sekiz saat boyunca güvenli biçimde koru; player'ın kendiliğinden cüzdan açmasını kaldır.**

### Bağlantı ve kimlik kanıtı

Kurulu `@hot-labs/near-connect 0.11.4` ve sabitlenmiş Meteor uygulaması `connect({signMessageParams})` / `signInAndSignMessage` destekler. Bugünkü parametresiz bağlantı yerine bu birleşik yol kullanılır. Bu yetenek kaynakla doğrulanmıştır; gerçek Brave pencere/onay sayısı kabul testinde ölçülür. [Sabit Meteor uygulaması](https://raw.githubusercontent.com/Meteor-Wallet/meteor_wallet_sdk/8c4ca0849244907551dbf7edbd65bd2db0189ccd/storage/meteor-near-connect-latest.js)

İlk seçimden önce hesap bilinmediği için mevcut hesap alanı zorunlu cihaz belgesi doğrudan kullanılamaz. Dar bir yeni sürüm eklenir:

- İmzalanan cihaz belgesi cihaz public key'i, ağ, Market, site, yalnız `play` yetkisi ve sabit sekiz saatlik süreyi bağlar.
- Seçilen hesap cüzdan kanıtından alınır ve izleme isteğindeki hesapla eşleştirilir. Bridge mesaj imzasını ve public key'in o hesaba ait final NEAR FullAccess anahtarı olduğunu doğrular.
- Hesap adı veya başarılı satın alma işlemi tek başına kimlik kanıtı sayılmaz.
- Mevcut sertifika sürümü geçişte kabul edilmeye devam eder. Yeni endpoint veya NEAR sözleşme değişikliği gerekmez; mevcut `/v2/playback-tokens` doğrulaması genişletilir.
- Birleşik bağlantıdan sonra gelen normal sign-in olayı ikinci oturum oluşturmaz. İmzalı yanıt tamamlanmadan oturum hazır gösterilmez.

### Güvenli saklama ve temizleme

Mevcut metin biçimli özel anahtar yerine **dışa aktarılamayan WebCrypto Ed25519 `CryptoKey`**, tarayıcının IndexedDB alanında saklanır. Yalnız public sertifika/proof metadatası serileştirilir; yeni bağımlılık eklenmez. [WebCrypto standardı](https://www.w3.org/TR/webcrypto/)

- Mevcut **8 saat** üst sınırı korunur; izledikçe uzamaz. Oynatma JWT'si **180 saniye** ve cihaz belgesinin kalan süresiyle sınırlı kalır.
- Kayıt hesap + ağ + Market + site kapsamıyla ayrılır. Çıkış, hesap değişimi ve süre sonunda temizlenir; açık sekmelerde eski player/bekleyen işler geçersizleştirilir.
- Aynı kapsamdaki eşzamanlı oturum hazırlıkları tek bekleyen işi paylaşır. Çıkış veya iptal sonrası gelen eski imza yanıtı oturumu tekrar yazamaz.
- Saklama/Ed25519 desteği yoksa, engellenmişse veya site verisi silinmişse açık metin fallback yapılmaz; yeniden kimlik doğrulama koşulu açık gösterilir.
- [Önceki tarayıcı anahtarı kararı](./phase-0-foundation.md) ve [Checkpoint 95](./transformation-progress.md) açık metin sessionStorage nedeniyle yalnız bellekte saklamaya geçmişti. Bu plan o kararı geri alınmış saymaz; uygulama gate'inde süreli, dışa aktarılamayan anahtar istisnası ve güvenlik gerekçesi açıkça belgelenir.
- Dışa aktarılamayan anahtar, sayfada çalışan kötü amaçlı kodun imza çağırmasını tek başına engellemez; hardware-backed saklama veya sınırsız güvenlik iddiası yoktur. Mevcut CSP/site/süre ve Bridge kontrolleri korunur.

### Player ve satın alma davranışı

- Player ve token yenilemesi yalnız mevcut geçerli cihaz oturumunu kullanır; arka planda `signMessage` başlatmaz.
- Eksik veya gerçekten sona ermiş oturumda ayrı **“Oturumu doğrula”** eylemi gösterilir. Cüzdan kapatılırsa otomatik tekrar açılmaz.
- Geçerli oturumdaki alıcı mevcut tek `ft_transfer_call` onayıyla satın alır; ardından ek izleme imzası gerekmez. Creator aynı yetkilendirme yolunda ücretsiz hak sahibi kalır.
- Eski sürümden gelen, yalnız cüzdanı bağlı fakat doğrulanmış cihaz oturumu olmayan kullanıcı için bir defalık kimlik doğrulama gerekir. İlk bağlantı/sona ermiş oturum koşulu açık gösterilir; “bağlı hesap” güvenli oturum kabul edilmez.
- Tokenın normal yenilenmesi ve geçici hata tekrarları mevcut mekanizmayla sürer. Kesin ret veya süre bitiminde oynatma kapanır; eski async yanıt erişimi yeniden açamaz.

V2 çıkışı yerel anahtarı temizler; bütün verilmiş medya tokenlarının dünyada anında iptal edildiği vaat edilmez. Önceden verilmiş JWT'nin üst ömrü 180 saniyedir. Legacy `revoke_subject_sessions` V2 sertifikasını iptal etmez; varsa eski zincir yetkisinin güvenli temizliği ayrı korunur. Wallet FullAccess anahtarının kaldırılması mevcut sertifika önbelleği nedeniyle en çok yaklaşık 60 saniye sonra yeniden kontrol edilebilir.

Anlamlı alternatif: yeni satın alma işlemindeki standart `ft_transfer_call.memo` alanına cihaz belgesinin hash'ini bağlamak. Bu, Bridge'de exact signer/action, memo, final receipt zinciri ve güncel entitlement doğrulaması gerektirir. Eski işlem hash'i yeni cihazı yetkilendiremez. Mevcut birleşik bağlantı yeteneği nedeniyle **ilk çözümden çıkarılmıştır**; otomatik kapsam genişletmesi değildir.

## 5. Uygulama gate'leri ve değiştirilebilecek dosyalar

Her gate başlamadan amaç, açık dosya listesi, yasak alanlar ve hedef kontroller tekrar belirlenir. Bu liste şimdi dosya değiştirme yetkisi vermez.

| Sıra | Gate | Değişiklik kapsamı | Kapanış ölçütü |
| --- | --- | --- | --- |
| **1 — yerelde kapandı (bölüm 10)** | **`PLAYBACK_SESSION_REUSE_SOURCE`** | Web cihaz oturumu, WalletProvider, Watch/Player oturum hazırlığı; Bridge sertifika doğrulaması; ilgili protokol, test ve mimari karar kayıtları. | Yerel testlerde reload sonrası oturum korunur; paralel hazırlık tek imza ister; geç yanıt çıkışı geri alamaz; player/renewal otomatik cüzdan açmaz. Brave'de yerel anahtar saklama ve export reddi doğrulanır. Gerçek cüzdan/provider kabulü ayrı kalır. |
| **2 — teşhis tamamlandı (bölüm 11)** | `PLAYBACK_MEDIA_TRACE` | Aynı mevcut video ve Brave; mevcut ölçüm koduna yalnız gerekli olaylar. Auto/360p/720p ve gerekirse aynı yetkili HLS ile sade hls.js karşılaştırması. Yeni asset, provider veya player ürünü yok. | Seek → sonraki segment isteği → yanıt türü → HLS hata/append → buffer zinciri token zamanlarıyla ilişkilendirilir. Yetkili medya/ses kanıtı yokken kök neden kesinleştirilmez; eksik en küçük kontrol raporlanır. |
| 3 — yalnız neden kanıtlanırsa | `PLAYBACK_MEDIA_FIX_SOURCE` | Ölçümün gösterdiği tek hata noktasına küçük düzeltme ve onu yakalayan test. Dosyalar trace sonucundan belirlenir; peşinen buffer/transcode/provider değişimi yok. | Yeniden üretilen hata hedef testte kapanır. Neden doğrulanmadıysa bu gate açılmaz; eksik medya kanıtı tamamlanmış sayılmaz. |
| 4 | `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE` | İncelenmiş kaynak, CI, korumalı yayın ve ayrıca onaylanan gerçek cüzdan/medya senaryoları. | Exact kaynak → CI → yayın → serving sürümü eşleşir; aşağıdaki kabul matrisi gerçek Brave/provider koşusunda geçer. Eksik senaryo PASS sayılmaz. |

İlk source gate'inin aday dosyaları:

- Web: `apps/web/lib/device-session.ts`, `apps/web/components/providers/WalletProvider.tsx`, `apps/web/components/LivepeerWatch.tsx`, `apps/web/lib/livepeer-playback.ts`, `apps/web/components/LivepeerPlayer.tsx` ve doğrudan ilgili mevcut unit testleri.
- Bridge/protokol: `workers/livepeer-bridge/src/index.ts`, `workers/livepeer-bridge/src/playback-v2.test.ts`, gerektiği ölçüde `protocol/paid-media-livepeer-v1/README.md` ve `schema.json`.
- Karar/kanıt: `docs/architecture/phase-0-foundation.md`, `docs/architecture/transformation-progress.md` ve bu planın gate kayıtları.
- Medya trace'i gerekirse `apps/web/lib/video-measurements.ts` ve mevcut player olay bağlantısını dar kapsamda genişletir. Native-only HLS desteği ayrı uyumluluk kabulüdür; mevcut Brave gate'i sessizce tüm tarayıcılara genişletilmez.

NEAR sözleşmesi, read-model/D1, upload/provider oluşturma akışı, bağımlılık/lock dosyaları ve release/config dosyaları ilk source gate'inin kapsamı dışındadır. Mevcut dirty iyileştirmeler ikinci defa yazılmaz; açık dosya kapsamı çakışıyorsa kullanıcı değişiklikleri korunarak izole aday kullanılır.

Yayında önce Bridge'in eski/yeni cihaz belgesini kabul eden sürümü, sonra Web yayımlanır. Git yayını/deploy/gerçek ödeme bu planın verilmiş onayı değildir; son gate için somut işlem paketi ayrıca sunulur.

## 6. Kabul testleri

Aşağıdaki sayılar **uygulama sonrası hedeflerdir**. “Açılma” uygulamanın başlattığı cüzdan arayüzü, “imza” kullanıcının onayladığı mesaj veya işlemdir. Cüzdan seçimi, kilit açma ve imza onayı kanıtta ayrı kaydedilir; kaynakta capability bulunması gerçek pencere sayısı yerine geçmez.

| Senaryo | Cüzdan açılması / tamamlanan kullanıcı imzası | Beklenen davranış |
| --- | --- | --- |
| Creator, geçerli oturum | **0 / 0** | Ücretsiz izleme. |
| Yeni alıcı, geçerli oturum ve yeterli USDC | **En fazla 1 / 1** | Yalnız satın alma; ardından izleme **0 / 0**. Token edinme/dönüştürme bu sayıya gizlenmez. |
| Mevcut alıcı, geçerli oturum | **0 / 0** | Doğrudan izleme. |
| Sayfa yenileme, videoya geri dönüş, Play/Pause | **0 / 0** | Aynı geçerli oturum yeniden kullanılır. |
| Oynatma tokenı yenilenmesi | **0 / 0** | Player, kaynak ve ilerleme korunur. |
| İlk bağlantı, yeni cihaz veya gerçekten bitmiş oturum | Kullanıcı eylemiyle **hedef 1 / 1**; otomatik **0 / 0** | Birleşik bağlantı ve kimlik doğrulama; gerçek Meteor/Brave sayısı ölçülür. |
| Hesap değişimi | Kendiliğinden **0 / 0** | Eski hesap derhal durur. Yeni hesabın geçerli kimlik oturumu ve hakkı ayrı kontrol edilir; yoksa yukarıdaki açık kimlik doğrulama adımı gerekir. |
| V2 oturumundan çıkış | **0 / 0** | Yerel yetki, player ve bekleyen işler temizlenir. Varsa legacy zincir yetkisi temizliği ayrı onay gerektirebilir; atlanmaz. |
| Satın almamış hesap, geçerli kimlik oturumu | **0 / 0** | İzleme reddedilir; başka hesabın kaydı kullanılamaz. |
| Kimlik penceresini kapatma | İlk açılış **1**, tamamlanan imza **0** | Otomatik tekrar **0**; yalnız yeni açık kullanıcı eylemiyle tekrar. |
| 20 ileri/geri sarma | **0 / 0** | Görüntü ve ses birlikte devam eder. |

### Donma ve ses için önerilen ölçülebilir eşikler

Bu değerler ölçülmüş başarı veya genel performans SLO'su değildir; kabul için önerilen hedeflerdir. Testte ağ profili kaydedilir ve karşılaştırmalar aynı koşullarda yapılır.

- Sabit bağlantıda 20 sarma: yarısı buffer içi, yarısı buffer dışı. Bırakma → ilerleyen ilk kare **p95 ≤2 saniye, en kötü ≤5 saniye**.
- Her sarma sonrası 10 saniye izlemede ilk toparlanma dışındaki **500 ms üzeri beklenmedik durma sayısı 0**; kalıcı ses kaybı **0**.
- Aynı player'da en az altı dakika ve iki gerçek token yenilemesi: kaynak/player yeniden kurulması **0**, beklenmedik zaman sıçraması **0**. Mevcut 4:09 video aynı player içinde tekrar oynatılabilir.
- Ölçülebilir ses/görüntü referansında fark **≤150 ms**. Referans yoksa A/V senkron kabulü `UNPROVEN` kalır.
- Auto, sabit 360p ve sabit 720p aynı medya/ağ koşulunda karşılaştırılır. Gerekirse kurulu hls.js ile sade karşılaştırma, aynı yetkili kaynak ve aynı token yenileme koşullarıyla yapılır; farklı hesap/token süresi sonucu yanıltmamalıdır.
- Geçici ağ/429/5xx hatasında henüz geçerli erişim ve player korunur. Kesin ret veya süre bitiminde kapanır; geç yanıt oynatmayı yeniden açmaz.
- Hata anında yalnız HTTP kodu değil `http200_error_playlist`, segment sayısı, güvenli HLS hata sınıfı ve buffer artışı izlenir. Raw URL/query, JWT/header, özel anahtar ve ham hata gövdesi kaydedilmez.

Mevcut `onPlaybackEvents` ve `performance` saatinden yararlanılır; yeni ölçüm bağımlılığı eklenmez. `seeking`, `seeked`, `waiting`, `playing`, ilk yeni kare ve token başlangıç/bitiş olayları ilişkilendirilir. Yalnız ağ/yetki normal kaldığı halde sorun sürüyorsa ilgili manifest ve başarısız segmentlerin ses/video zamanları, keyframe, segment süresi ve discontinuity incelenir. Ölçüm olmadan buffer artırma, yeniden kodlama veya provider değiştirme önerilmez.

### Yerel doğrulama komutları

[docs/testing.md](../testing.md) içindeki mevcut komutların odaklı kullanımı:

```bash
cd /Users/arair/works/youtick-lp/apps/web
npm test -- --run __tests__/unit/device-session.test.ts __tests__/unit/livepeer-playback.test.ts __tests__/unit/livepeer-playback-v2.test.ts __tests__/unit/wallet-provider.test.ts __tests__/unit/livepeer-watch.test.ts __tests__/unit/livepeer-publication.test.ts
npm run lint
npm run build

cd /Users/arair/works/youtick-lp/workers/livepeer-bridge
npm test -- --run src/playback-v2.test.ts src/playback.test.ts
npm run check

cd /Users/arair/works/youtick-lp
node scripts/check-paid-media-livepeer-v1.mjs
```

Medya ölçümü veya canary dosyası değişirse ilgili mevcut `video-measurements.test.ts` ve `npm run test:livepeer-canary` seçilir. Aynı testler değişiklik veya yeni bulgu yokken tekrarlanmaz; sırf belge kaydı için test/build yapılmaz.

Yeni regresyonlar: reload/geri dönüşte CryptoKey restore; private key export reddi; paralel ilk hazırlık; iptal/çıkış sırasında geç yanıt; yanlış hesap/ağ/Market/site; expired sertifika; birleşik ve normal sign-in olaylarının tek kurulumu; timer gerçekten ilerletilerek token yenilemede sıfır cüzdan; yetkisiz hesap reddi. Gerçek IndexedDB/WebCrypto davranışı yerel Brave'de doğrulanır; mock sonuç gerçek tarayıcı kanıtı sayılmaz.

Mevcut browser canary kısa süre oynatır, sessizdir ve turlar arasında yeni player kurar. Kesintisiz token yenileme, uzun izleme veya ses kabulü değildir. Mevcut live canary'nin asset/signing-key oluşturma yolu bu görev için çalıştırılmaz. Brave dışındaki tarayıcı sonucu Brave kabulü yerine geçmez.

## 7. Tamamlananlar, çalıştırılmayanlar ve kalan belirsizlik

9 Eylül analizinde tamamlananlar:

- `LOCAL_STATIC`: uçtan uca wallet → satın alma → entitlement → cihaz oturumu → player → token yenileme incelemesi; kurulu SDK ve resmî Livepeer seçeneklerinin karşılaştırılması.
- `LOCAL_TEST`: Web'de 5 dosya / **41 test PASS** (`device-session`, `livepeer-playback-v2`, `wallet-provider`, `livepeer-watch`, `livepeer-publication`); Bridge'de 2 dosya / **36 PASS, 3 skipped** (`playback-v2`, `playback`). Toplam **77 PASS / 3 skipped**; skip'ler isteğe bağlı abuse/load senaryolarıdır.
- İki cihaz oturumu yarışı dosya yazmayan yerel kontrolle yeniden üretildi. Mevcut testlerin geçmesi yeni UX hedefinin gerçekleştiği anlamına gelmez.
- `PREVIEW / PROVIDER`: Web paket eşleşmesi, Bridge health, final NEAR hak okumaları, anonim medya reddi örnekleri ve Brave'de önceden açık sayfanın mevcut konsol/ekran gözlemi.
- `git diff --check` geçti. Önceki analizde kod/dosya değişikliği yapılmadı.

Çalıştırılmayanlar: yeni ödeme, cüzdan imzası veya upload; yetkili manifest/segment zamanlama analizi; ölçümlü ses/sarma karşılaştırması; gerçek iki token yenilemesi kabulü; iframe/MP4/native-only HLS canlı kabulü; yeni CI/deploy; provider/config/secret/NEAR/D1 değişikliği; Production/Mainnet ve kapasite testi. Belge kaydı bunları çalıştırmaz.

Kalan belirsizlik: ilk boş cüzdan penceresi ile ses/donmanın eşzamanlı canlı kaydı eksik. Oturum anahtarı saklamasının yeni davranışı ve birleşik Meteor bağlantısındaki gerçek onay sayısı uygulanıp doğrulanmadı. Bunlar doğrulanmış oturum hataları için küçük source gate'ini engellemez; ilgili canlı kabul kapanmadan tam çözüm iddia edilmez.

**Teşhis/kayıt anındaki sonraki gate: `PLAYBACK_SESSION_REUSE_SOURCE`.** Aşağıdaki tarihli source kaydı artık güncel durumdur; belgeyi kaydetmek tek başına uygulama yetkisi vermemişti.

## 8. Tarihsel loop promptu — yeni çalışma talimatı değildir

Aşağıdaki prompt önceki uygulama aşamasının tarihsel kaydıdır; güncel kapanış §16'dadır. Dosyanın varlığı otomasyon kurmaz, uygulama başlatmaz veya yeni gate'e otomatik geçiş yetkisi vermez.

```text
Çalışma dizini: /Users/arair/works/youtick-lp
Kanonik plan: /Users/arair/works/youtick-lp/docs/architecture/playback-ux-plan.md

AGENTS.md, kanonik plan ve mevcut gate kaydını oku; tamamlanmış kanıtı
güncel kaynakla uzlaştır. İlk aktif gate: PLAYBACK_SESSION_REUSE_SOURCE.
Bu gate zaten kapalıysa yeniden uygulama; sonucu ve tek sonraki gate'i bildir.
Kullanıcı başka bir gate'i açıkça seçmedikçe sonraki gate'e geçme.

Aktif gate içinde döngü:
mevcut kanıtı oku → en küçük eksik düzeltmeyi yap → ilgili testi çalıştır
→ sonucu değerlendir → kabul kriterleri sağlanana kadar devam et.

- Amaç, açık dosya kapsamı, yasak alanlar ve kapanış ölçütlerini başta yaz.
- Kullanıcı değişikliklerini koru; yalnız gerekli dosyalara dokun.
- Mevcut Livepeer React Player + JWT korumalı HLS yolunu koru.
- Yeni servis, bağımlılık veya genel oturum çatısı ekleme.
- NEAR kimlik/izleme hakkı doğrulamasını kaldırma.
- Geçerli oturumda satın almada en fazla bir işlem onayı; sonraki izleme,
  yenileme ve sarmada sıfır ek cüzdan açılması/imza hedefini uygula.
- Medya gate'inde Auto/360p/720p ve gerekirse aynı yetkili HLS kaynağıyla
  sade oynatıcı karşılaştırması yap; bunu yeni ürün oynatıcısına genişletme.
- Ölçüm olmadan buffer, yeniden kodlama veya provider değişikliği yapma.
- Testleri docs/testing.md içinden seç; yeni değişiklik veya bulgu yoksa
  tamamlanmış kontrolleri tekrarlama. Yerel ve canlı kanıtı ayır.
- Mevcut onayları koru, aynı kapsam için yeniden onay isteme. Git yayını,
  deploy, ödeme, upload, cüzdan imzası ve canlı değişiklikler için mevcut
  açık onay yoksa somut işlem paketini hazırlayıp sınırda dur.
- Eksik keşfedilebilir bilgiyi kullanıcıya sormadan araştır. Sadece planı
  değiştiren ve keşfedilemeyen kararı veya gerçek erişim engelini bildir.
- En geç 60 saniyede kısa ilerleme bildir.

Gate kapanınca bu belgeye tarihli sonucu ve kanıtı ekle, raporla ve dur.
Sonraki gate'e otomatik geçme. Eksik canlı kanıtı PASS diye kapatma.

Sonuç: PASS / COMPLETED_WITH_WARNINGS / BLOCKED / FAILED.
Rapor: tamamlananlar, değişen dosyalar, kanıt, çalıştırılmayanlar,
varsa engel ve tek sonraki gate.
```

## 9. Belge kayıt sınırı

`PLAYBACK_UX_PLAN_SAVE` yalnız bu dosyayı oluşturur. Kullanıcı mevcut planın kaydedilmesini istemiştir; source uygulaması, yeni test, Git yayını, deploy veya canlı işlem yapılmaz. Kayıt doğrulaması belge içerik/kapsam kontrolü, diff/boşluk kontrolü ve mevcut dosyaların korunmasının karşılaştırılmasıdır.

**9 Eylül 2026 kayıt sonucu: PASS / LOCAL_STATIC.** Teşhis, çözüm, son Livepeer değerlendirmesi, kabul senaryoları ve loop promptu tek belgede kaydedildi. Bağımsız salt-okunur içerik kontrolü geçti; diff/boşluk kontrolünde hata yok. Önceden var olan 64 dosyanın SHA-256 değerleri ve HEAD korundu; tek yeni yol bu belgedir. Yeni test/build, uygulama veya canlı işlem çalıştırılmadı. Kayıt engeli yok; tek sonraki gate `PLAYBACK_SESSION_REUSE_SOURCE`, henüz başlatılmadı.


## 10. PLAYBACK_SESSION_REUSE_SOURCE — 9 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS. Gate kapandı; sonraki gate başlatılmadı.**
Kanıt sınıfı `LOCAL_STATIC + LOCAL_TEST`; gerçek cüzdan/provider ve yayın kabulü
`EXTERNAL_NOT_RUN / UNPROVEN` olarak kalır.

### Amaç, kapsam ve korunmuş başlangıç

Amaç: mevcut Livepeer React Player + JWT korumalı HLS yolunda cihaz oturumunu
reload/geri dönüşte yeniden kullanmak; player ve token yenilemesinden otomatik
cüzdan çağrısını kaldırmak. NEAR kimlik/izleme hakkı ve FullAccess anahtar
kontrolleri korunur. Tek yazan katılımcı ana agent'tır; subagent kullanılmadı.

Başlangıç HEAD `d2d3b035ac1e3afa348f353b014339ab46290e16`. Başlangıçtaki 65
mevcut değişiklik korunarak dosya kopyası üzerinde izole aday hazırlandı. Kendi
farkları aktarılmadan önce başlangıç dosyalarının SHA-256 değerleri karşılaştırıldı.
Aktarım sonrası 15 gate dosyası test edilmiş adayla birebir eşleşti; kapsam dışındaki
245 mevcut dosyanın SHA-256 değeri ve HEAD korundu. `git diff --check` ve tüm
gate dosyalarının boşluk kontrolü geçti. Bu gate mevcut dirty kaynak farklarının
yayın/CI/canlı kabulü değildir.

Değişen dosyalar (yalnız bu gate'in ek farkı):

- `apps/web/lib/device-session.ts`
- `apps/web/components/providers/WalletProvider.tsx`
- `apps/web/lib/livepeer-playback.ts`
- `apps/web/components/LivepeerPlayer.tsx`
- `apps/web/__tests__/unit/device-session.test.ts`
- `apps/web/__tests__/unit/wallet-provider.test.ts`
- `apps/web/__tests__/unit/livepeer-playback-v2.test.ts`
- `apps/web/scripts/device-session-browser-check.mjs` — yeni, yerel Brave kontrolü
- `workers/livepeer-bridge/src/index.ts`
- `workers/livepeer-bridge/src/playback-v2.test.ts`
- `protocol/paid-media-livepeer-v1/README.md`
- `docs/architecture/phase-0-foundation.md`
- `docs/architecture/transformation-progress.md`
- `docs/testing.md` — yerel Brave komutu
- `docs/architecture/playback-ux-plan.md` — bu kayıt

`LivepeerWatch`, satın alma yardımcısı ve mevcut satın alma testleri yeniden
uygulanmadı: V2 zaten tek `ft_transfer_call` kullanıyor. Ek imza, ortak token
hazırlama yolundaki oturum oluşturma çağrısından geliyordu. Protokol
`schema.json` dosyasında cihaz sertifikası şeması bulunmadığı için o dosyaya
ilgisiz ekleme yapılmadı; mevcut endpoint parser'ı ve protokol açıklaması güncellendi.

Yasak alanlar: NEAR sözleşmesi, read-model/D1, upload/provider oluşturma, yeni
servis/bağımlılık, lock dosyaları, feature flag varsayılanları, release/config,
secret ve canlı işlemler. Buffer, kalite, yeniden kodlama ve provider değişmedi.

### Tamamlanan düzeltme ve güvenlik kararı

- `connect({signMessageParams})` tek bağlantı akışında sürüm-2 cihaz belgesini
  imzalatır. Seçilen hesap signed-message yanıtından alınır; normal sign-in
  olayı ikinci oturum başlatmaz. Hesap, kayıt tamamlanmadan hazır gösterilmez.
  Gerçek Meteor pencere/onay sayısı henüz ölçülmedi.
- Cihaz anahtarı `generateKey('Ed25519', false, ['sign', 'verify'])` ile üretilir.
  Özel CryptoKey dışa aktarılamaz; IndexedDB structured clone ile saklanır.
  Saklanan diğer alanlar public sertifika/proof metadatasıdır. Raw özel anahtar,
  browser encryption key, localStorage/sessionStorage veya açık metin fallback yoktur.
- Kayıt hesap + ağ + Market + site kapsamındadır. Sekiz saat sabittir; reload
  ve izleme süreyi uzatmaz. Süresi bitmiş/geçersiz kayıt erişimde temizlenir.
  Çıkış/hesap değişimi kapsamın yerel kayıtlarını temizler ve açık player'ları
  durdurur. Askıya alınmış/kapalı tarayıcıda fiziksel temizlemenin o anda çalıştığı
  iddia edilmez; sona ermiş kayıt yeniden yetki vermez.
- Aynı sayfadaki eşzamanlı hazırlık tek bekleyen işi paylaşır. Abort ve yerel
  nesil kontrolüyle birlikte IndexedDB işleminde saklanan iptal sayacı, çıkıştan
  önceki yanıtın aynı veya başka sekmede tekrar yetki yazmasını engeller.
- Player/yenileme yalnız mevcut oturumu okur ve CryptoKey ile istek imzalar.
  Eksik, bitmiş veya desteklenmeyen oturumda ayrı **Verify session** eylemi ve
  açıklama gösterilir. İptal otomatik cüzdan tekrarına dönüşmez. Geçici token
  hatalarında mevcut player/kaynak korunur; kesin ret/çıkış/süre bitimi kapanır.
- Bridge sertifika sürüm 1 ve 2'yi kabul eder. V2 sertifika Market'i bağlar;
  proof hesabı istek hesabına eşit olmalıdır. Final NEAR FullAccess üyeliği,
  aynı bloktaki entitlement, publication ve provider JWT policy kontrolleri
  korunur. Sertifika önbelleği seçilen hesabı da bağlar; başka hesap aynı
  imzalı cihaz belgesiyle önbellek yetkisini devralamaz.
- Checkpoint 95'in açık metin saklama bulgusu tarihsel olarak korunur. Yeni,
  süreli istisna yalnız bu dışa aktarılamayan playback anahtarı içindir.
  Aynı-origin kötü amaçlı kodun imza API'sini kullanmasını engellediği veya
  hardware-backed olduğu iddia edilmez; CSP/site/TTL ve Bridge kontrolleri kalır.
  Yeni CodeQL değerlendirmesi çalıştırılmadı. Legacy zincir yetkisi temizliği
  korunur; V2 yerel çıkışı verilmiş JWT'leri dünyada anında iptal etmez.

### Kabul ve doğrulama kanıtı

Testler `docs/testing.md` komutlarından seçildi; kaynak/test düzeltmesi olmayan
geçmiş kontroller tekrar edilmedi. Aşağıdaki Web toplamı son başarılı odaklı
koşuların **81 ayrı testi**dir; tek tam-suite koşusu olduğu iddia edilmez.

| Kontrol | Sonuç / sınır |
| --- | --- |
| `npm test -- --run __tests__/unit/device-session.test.ts` | **18/18 PASS**. Reload, paralel tek imza, iki formatta export reddi, hesap/ağ/Market/site ayrımı, bozuk/bitmiş kayıt, iptal/çıkış/başka sekmede geç yanıt, bozuk wallet metadata, storage/Ed25519 desteği olmadan fail-closed. IDB adaptörü mock; Node WebCrypto gerçektir. |
| `npm test -- --run __tests__/unit/livepeer-playback-v2.test.ts` | **7/7 PASS**. İki gerçek timer ilerletmesiyle 150s ve 300s'de yenileme; sıfır wallet imzası. Eksik/bitmiş oturum, aktif player çıkışı, geç initial/renewal yanıtı reddi ve shadow uyumluluğu. |
| `npm test -- --run __tests__/unit/wallet-provider.test.ts` | **6/6 PASS**. Birleşik/normal sign-in olayları, kayıt bitmeden hesap yayınlanmaması, paralel connect, çıkış sırasında yanıtın reddi ve iptal sonrası otomatik tekrar olmaması. Wallet/React olayları mock'tur. |
| `npm test -- --run __tests__/unit/livepeer-playback.test.ts __tests__/unit/livepeer-watch.test.ts __tests__/unit/livepeer-publication.test.ts` | Aynı altı-dosyalı odaklı koşudaki **50/50 PASS**. JWT host/header, geçici hata ve expiry sınırı, mevcut satın alma/entitlement ve V2 tek USDC işlemi korunur. |
| `npm run lint` | **PASS**, son kaynakta hata/uyarı yok. |
| `npm run build` | **PASS**, yalnız yerel CI örnek kimlikleri: network=testnet, market=market.testnet, access=access.testnet. İlk secretsiz adayda zorunlu public kimliklerin eksikliği görüldü; mevcut CI değerleriyle tamamlandı. Next.js middleware/Edge Runtime bağımlılık uyarıları var; config değiştirilmedi. |
| Bridge: `npm test -- --run src/playback-v2.test.ts src/playback.test.ts` | **43 PASS, 3 SKIPPED**. V1/V2 uyumluluğu, yeni hesapla cache devralamama, yanlış Market/proof, FullAccess dışı anahtar, eksik entitlement ve bitmiş sertifika reddi. Üç mevcut opt-in abuse/load testi çalıştırılmadı. |
| Bridge: `npm run check` | **PASS**. Test matrisindeki sürüm literal türü de düzeltildi. |
| `node scripts/check-paid-media-livepeer-v1.mjs` | **PASS**: `paid-media-livepeer-v1 protocol: OK`. |
| `node scripts/device-session-browser-check.mjs` | **PASS / LOCAL_TEST**. macOS'ta gerçek Brave executable, Chromium **150.0.7871.101**, headless ve izole profil; yalnız localhost, wallet proof mock. Gerçek IDB/CryptoKey reload, export reddi, yanlış hesap, sekmeler arası temizleme ve geç yanıtın reddi geçti. |

Brave receipt: `parallelSingleCall=true`, `reloadSameCertificate=true`,
`nonExtractableBeforeAndAfterReload=true`, `pkcs8AndJwkExportRejected=true`,
`otherAccountDenied=true`, `crossTabClear=true`, `crossTabLateReplyRejected=true`.
Bu kontrol gerçek Meteor UI, provider medyası veya canlı CSP kabulü değildir.

### Çalıştırılmayanlar, engel ve tek sonraki gate

Git commit/push/PR/merge, CI/CodeQL tekrar koşusu, deploy, gerçek cüzdan imzası,
ödeme/upload, provider/config/secret, NEAR/D1 değişikliği, Production/Mainnet,
canlı Auto/360p/720p, ses/sarma ölçümü, altı dakikalık gerçek medya ve iki canlı
JWT yenilemesi yapılmadı. Yeni servis/bağımlılık eklenmedi.

Source gate engeli yok. Uyarılar: build'in bağımlılık uyarıları, üç kapsam dışı
opt-in test ve ayrı onaylı kabul gerektiren gerçek wallet/provider davranışı.
Bu nedenle sonuç `COMPLETED_WITH_WARNINGS`; kaynak gate'i kapalıdır.

**Tek sonraki gate: `PLAYBACK_MEDIA_TRACE`.** Bu çalıştırmada açılmadı.
Canlı imza gerektiren noktada ayrıca somut izin gerekir: mevcut `matrixx`
publication'ı, seçilmiş yetkili hesap, tek açık kimlik doğrulama adımı, mevcut
JWT korumalı HLS üzerinden Auto/360p/720p ve gerektiğinde aynı kaynakla sade
karşılaştırma; yeni ödeme, upload veya asset yok. Seçili hesap ve mevcut oturum
bir sonraki gate'in salt-okunur hazırlığında belirlenir. Bu paket yürütülmedi.
İleride yeni kaynağın yayın kabulü ayrıca seçilirse, önce geriye uyumlu Bridge,
sonra Web için exact kaynak/CI/korumalı workflow paketi gerekir; bu kayıt Git
veya deploy onayı değildir.


## 11. PLAYBACK_MEDIA_TRACE — 9 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS. Teşhis gate’i kapandı; medya kabulü geçmedi.**
Aynı mevcut asset’in teslim edilen HLS verisinde zaman damgası sürekliliği kusuru
ölçüldü. Bunun hangi provider üretim/segmentleme adımında oluştuğu ve düzeltme
mekanizması bu gate’te belirlenmiş veya uygulanmış değildir.

### Kapsam, ortam ve yöntem

- Amaç: sarma → segment isteği/yanıtı → HLS işleme/buffer → görüntü/ses çözme
  zincirini mevcut yetkili kaynak ve token yenilemeleriyle ilişkilendirmek.
- Tek değişen dosya bu kanonik plandır. Uygulama, test, provider, buffer,
  yeniden kodlama, bağımlılık, flag ve release/config dosyaları değişmedi.
  Başlangıçtaki 260 dosya hash’i kaydedildi; kayıt öncesi tümü korunmuştu.
- Brave İş profilinde zaten açık `matrixx` sayfası ve creator hesabı
  `lp-arch-creator-260809.youtick-dev-v3.testnet` kullanıldı. Publication:
  `lp-7518e5a3-fbd1-444a-909a-5dc8e037f70c`. Sayfa reload edilmedi; mevcut
  yetkili oturum kullanıldı. Yeni bağlantı, imza, ödeme veya upload başlatılmadı.
- İlk video snapshot: **14:06:26.991 UTC**; son toplu trace özeti:
  **14:18:19.925 UTC** (Türkiye 17:06–17:18). İlk durum: paused=true,
  currentTime=0, duration=248.705, 1280×720, buffer=[0.037912,11.970911],
  readyState=4, audio decoded bytes=8478, mute=false, volume=1.
- Çalışan sayfa `313-5f6127aab7943a29.js` chunk’ını ve **hls.js 1.6.16**
  kullanıyordu. Gerçek medya yolu `data-livepeer-source-type=hls`, `blob:` MSE.
  Önceki source gate’in yeni kodu yayımlanmadı; bu koşu onun canlı kabulü değildir.
  Taze bağımsız Web HTML okuması 403 verdi; deploy SHA/traffic dağılımı bu gate’te
  yeniden doğrulanmadı. Açık sayfanın gözlemi yeni deployment kanıtı sayılmaz.
- Ağ koşulu mevcut bağlantıydı; throttling uygulanmadı. Auto/360p/720p aynı
  mevcut player’da sıralı denendi. Kalite seçimi, kurulu Livepeer
  `VideoQualitySelect` bileşeninin kullandığı `setVideoQuality` kontrolüyle
  yapıldı; kalıcı kalite menüsü eklenmedi.
- Geçici DevTools gözlemi yalnız bellekte tutuldu: monotonic saat, video olayları,
  kare/ses çözme sayaçları, buffer aralıkları, XHR durum/boyut/zamanı ve mevcut
  `video_measurement` token olayları. Ham medya URL/query, JWT/header,
  özel anahtar veya ham hata gövdesi raporlanmadı. Ağ kancaları yeni token üretmedi.
- Gerekli karşılaştırmada sayfada zaten yüklü hls.js modülü kullanılarak geçici
  sade video oluşturuldu. **Aynı HLS kaynağı ve aynı mevcut JWT header getter’ı**
  kullanıldı. Yeni servis, script kaynağı, provider asset veya player ürünü yoktur.
  Sade instance’ın `FRAG_LOADED`, `FRAG_BUFFERED`, `BUFFER_CREATED` ve her
  SourceBuffer’ın `updateend` olayları ayrı kaydedildi.

### Auto / 360p / 720p gözlemi

Bu tablo bir kalite performans sıralaması veya 20-sarma kabulü değildir. Aynı
player’ın bozulmuş durumu sonraki kaliteye taşınabildiği için 720p sonucu
bağımsız temiz başlangıç ölçümü olarak sunulmaz.

| Deneme | Ölçülen davranış |
| --- | --- |
| Mevcut player, Auto | 60s sarma anında buffer [0.038,248.438]. `seeking` t=26771ms, ilk görüntü t=26785ms (mediaTime=59.971), `seeked/playing` t=26788ms. Görüntü 60→73.895s ilerlerken audio decoded bytes **277210’da sabit** kaldı. 5s’ye dönüşte ses sayacı tekrar arttı; sonraki ilerlemede yeniden durdu. |
| Mevcut player, 360p | Gerçek 640×360 görüntü doğrulandı. 60s sarma t=82977ms; aynı anda segment isteği; sonraki yanıt **850ms / HTTP 200 / 1,508,136 bytes**. Sonraki üç yanıt 728/951/1072ms, HTTP 200. Buna rağmen player t=86615ms’de **42.005s’de ended/paused** oldu; hedef 60s’ye ulaşamadı. |
| Mevcut player, 720p | Gerçek 1280×720 görüntü doğrulandı. Önceki bozulmuş duration nedeniyle 60s isteği 42.005s’ye sıkıştı. Sonraki segment **1214ms / HTTP 200 / 2,348,684 bytes**; player **8.672s’de ended** oldu. Önceki denemeden taşınan durum nedeniyle bu, bağımsız 720p QoE sonucu değildir. |
| Yeni sade hls.js instance, Auto | Aynı kusur bağımsız yeni instance’da tekrarlandı. Başlangıç duration=248.705; 60s sarma t=6717ms; ilerleyen video buffer’ına rağmen audio buffer ~11.97s’de kaldı. t=11359ms’de duration **42.004578s** oldu ve player **42.005s’de ended** oldu. React kontrolleri bu yeniden üretimde yoktu. |

İlk-kare callback’inin geç gelen eski bir seek için sonraki başka seek’in
karesini yakalayabildiği görüldü. Bu nedenle başarısız 60s denemelerindeki
gecikmiş callback’ler başarılı seek/TTFF sayılmadı; p95 hesaplanmadı.

### Manifest → ham segment → buffer kanıtı

Her iki yetkili rendition playlist’i:

- 25 segment, toplam **248.705s**, `EXT-X-ENDLIST` var.
- İlk beş süre: **12.095, 9.009, 9.009, 11.970, 9.009s**.
- **`EXT-X-DISCONTINUITY` sayısı 0**, `EXT-X-ERROR` yok.
- Master yalnız 360p ve 720p sunuyor; bildirilen bitrate değerleri
  1,076,744 ve 2,304,121 bit/s.

İki kalitede 0, 1, 2 ve 6 numaralı mevcut MPEG-TS segmentleri aynı yetkiyle
salt-okunur alındı. 188-byte TS paketlerinin payload başlangıçlarındaki PES
başlıklarından 33-bit PTS / 90000 okundu; ses/video PES stream türleri ayrı
sayıldı. Formül kurulu `hls.js/src/demux/tsdemuxer.ts` `parsePES` hesabıyla
karşılaştırıldı. Bu örnekleme sekiz segmenttir; bütün asset taraması değildir.
Ham segment dosyası veya erişim bilgisi diske kaydedilmedi.

| Segment no | 360p boyut / 720p boyut (byte) | Her iki kalitede ses ilk PTS | Her iki kalitede video ilk PTS |
| --- | --- | --- | --- |
| 0 | 1,833,752 / 4,806,784 | 1.462089s | 1.500000s |
| 1 | 1,308,480 / 3,019,844 | 1.417122s | 1.500000s |
| 2 | 1,287,988 / 2,674,488 | 1.410789s | 1.500000s |
| 6 | 1,729,600 / 3,801,172 | 1.410833s | 1.500000s |

Örneğin ilk segmentin ses PTS aralığı **1.462089–13.407800s**, sonraki
segmentinki **1.417122–10.398456s**. Zaman devam etmiyor, geriye sıfırlanıyor.
Video ilk PTS’si de örneklenen her segmentte tekrar 1.5s.

Sade instance’ın yeni SourceBuffer kanıtı:

| Olay | Video buffer | Audio buffer |
| --- | --- | --- |
| İlk append sonrası, t=2345ms | [0.038,12.038] | [0,11.967] |
| İlk dört segment sonrası, t=6716ms | **[0.038,42.005]** | **[0,11.967]** |
| 60s sarma sonrası erken bitiş, t=11359ms | [0.038,42.005] | [0,11.971] |

`FRAG_BUFFERED` başlangıçları: sn0=0; sn1=**−0.044967**;
sn2=**−0.051300**; sn3=**−0.057633**. Sarma sonrasında sn9/sn15/sn21 de
sıfıra yakın negatif başlangıçlarla işlendi. Audio `updateend` olayları geldiği
halde buffer bitişi 11.958–11.971s çevresinde kaldı; yeni video verisi ileriye
eklenirken sesin zaman aralığı ilerlemedi.

**Teşhis:** Bu asset’in teslim edilen HLS paketinde, segment sınırlarında ses
ve video timestamp dizisi sıfırlanıyor; playlist bunu discontinuity olarak
bildirmiyor. Bu medya kusuru, iki rendition’daki ham PTS ile ve React’ten
bağımsız sade player’da aynı audio-buffer/erken-bitiş davranışıyla doğrulandı.
Bu, tüm Livepeer servisinin veya bütün videoların bozuk olduğu iddiası değildir.
Provider’ın hangi üretim adımı/ayarının buna neden olduğu henüz `UNPROVEN`.

HLS sözleşmesi timestamp dizisi değiştiğinde discontinuity bildirimi ister:
[RFC 8216 §4.3.2.3](https://www.rfc-editor.org/rfc/rfc8216.html#section-4.3.2.3).
Bu kural ile ölçülen reset birlikte değerlendirilmiştir. Uygulanacak çözümün
her segmente körlemesine tag eklemek olduğu sonucuna geçilmedi.

### Ağ, yetki ve kanıt sınırı

- Geçici gözlemin yakaladığı 35 XHR sonlanması: **33 HTTP 200, 2 status 0**.
  Status 0 olayları istemci sarma/yeniden kurma ile aynı koşudaydı; server ret
  kodu olarak yorumlanmadı. Observer öncesindeki/in-flight bütün istekler bu
  sayıya dahil değildir. Rakam master/playlist ve ek PTS örnek okumalarını da kapsar.
- Yakalanan dört gerçek token yenilemesi tamamlandı:
  **1550.2ms, 1432.3ms, 1110.1ms, 1752.6ms**. Başlangıçlar aynı browser saatinde
  88237, 239235, 390234, 541276ms. Bu mevcut eski oturumun gerçek runtime
  kanıtıdır; yeni source kodunun veya kesintisiz altı dakika medya kabulünün
  kanıtı değildir. Donma anları bu başarılı yenilemelerle birlikte görüldü.
- Geçici original-player fatal HLS log gözleminde ve sade instance’ın HLS ERROR
  dinleyicisinde olay sayısı 0. Hata olayı olmaması, medya kabulü PASS değildir:
  buffer/PTS zinciri kusuru doğrudan gösteriyor.
- Ses kanıtı ayrı audio SourceBuffer ve decoder-byte ilerlemesidir. Fiziksel
  hoparlör çıktısı kaydedilmedi; kulakla/A-V referansıyla ≤150ms senkron kabulü
  `UNPROVEN`. Ağ profili kalibre edilmedi; kontrollü performans SLO’su üretilmedi.

### Temizlik, doğrulama ve tek sonraki gate

Geçici sade player kaldırıldı; timer/listener ve XHR/SourceBuffer/console
kancaları geri alındı, yardımcı runtime değişkenleri silindi. Asıl player
**Auto / 0:00 / paused=true** bırakıldı; konsol filtresi önceki boş durumuna
getirildi. Kullanıcının oturumu kapatılmadı ve sayfa reload edilmedi.

Uygulama/test kodu değişmediği için önceki Web/Bridge testleri, lint/build ve
canary tekrar çalıştırılmadı. Doğrulama bu gate’in gerçek Brave/provider
ölçümleri, PTS hesabının mevcut parser ile karşılaştırılması, belge kapsam ve
boşluk kontrolü ve diğer 259 dosyanın hash karşılaştırmasıdır.

Çalıştırılmayanlar: Git/CI/deploy; yeni cüzdan imzası, ödeme/upload; provider
ayar/asset/yeniden kodlama değişikliği; yeni servis/bağımlılık; NEAR/D1 mutation;
20 sarma, kontrollü ağ performansı, fiziksel ses/senkron kabulü; yeni source
sürümünün gerçek wallet/provider kabulü; Production/Mainnet.

Teşhis engeli yok. Uyarılar yukarıdaki örnekleme/performans/ses ve serving-SHA
sınırlarıdır. **Tek sonraki gate: `PLAYBACK_MEDIA_FIX_SOURCE`**, başlatılmadı.
Gate başında düzeltmenin üretildiği yer ve en küçük güvenli değişiklik
belirlenmeli: devamlı timestamp üretimi veya doğru discontinuity işaretlemesi
medya paketleyicisi/teslim edilen manifest sözleşmesiyle çözülmelidir. Repository
şu an bu provider playlist’ini üretmediğinden doğrudan değiştirilecek kaynak
satırı henüz saptanmadı. Provider yeniden işleme/asset müdahalesi gerekirse
exact asset, işlem, maliyet/yan etki ve geri dönüş paketi hazırlanıp açık onay
sınırında durulur. Bu kayıt provider işlemi veya geniş player workaround’u onayı değildir.


## 12. PLAYBACK_MEDIA_FIX_SOURCE — 9 Eylül 2026

**Sonuç: BLOCKED / PROVIDER_REPAIR_REQUIRED. Source düzeltmesi tamamlanmadı.**
Kullanıcı bu gate’i açıkça seçti. Önceki gate-seçimi engeli kalktı; yeni engel,
ready asset’in bozuk HLS çıktısını aynı kimliklerle onaracak doğrulanmış provider
operasyonu ve o operasyonun açık onayının bulunmamasıdır.

### Kapsam ve yapılan iş

Amaç: ölçülen timestamp kusurunun en küçük gerçek düzeltme noktasını bulmak;
Livepeer React Player + JWT HLS ve NEAR kimlik/hak kontrollerini korumak.
Değiştirilen dosyalar yalnız bu plan ve
playback-media-remediation-package.md (yerel arşiv: `/Users/arair/works/youtick-lp/docs/architecture/playback-media-remediation-package.md`).
Kod, test, profil, bağımlılık, buffer, feature flag, provider/config/secret,
NEAR/D1 ve release dosyaları değiştirilmedi. Tek yazan ana agent; subagent yok.

- Mevcut Web HLS header yolu ve Bridge `createUpload`/`readPlayback` akışı
  uçtan uca incelendi. Repo playlist/MPEG-TS üretmiyor; bu asset’in zamanlarını
  düzeltecek doğrulanmış bir yerel kod satırı bulunmadı. Yeni istemci loader’ı,
  proxy veya tüm playlist’lere koşulsuz tag ekleme yapılmadı.
- 14:30:35 UTC taze provider GET’leri: asset **200/ready**, playback **200/vod**,
  `jwt` policy, aynı asset `80a91cb9-d235-4331-b676-03b2e73dccdb`, playback
  `80a9z0vlt2s5bkp4`, project `53baeeda-930d-45be-bda6-a41090e6d25e`.
  Kaynak 17,070,370 byte; provider duration=248.581667s. Taze asset ID hash’i
  önceki kayıtlı NEAR asset hash’iyle eşleşti; NEAR bu tur yeniden sorgulanmadı.
  Bu metadata okuması HLS onarım kanıtı değildir.
- Sabitlenmiş resmi Studio kaynağı `72187ec428cdd41c81ff75556d77a609b2990695`
  incelendi: ready asset PATCH alanları medya yeniden paketlemesi sağlamıyor;
  retry yalnız failed asset + failed/cancelled task için. Normal hesapta
  `catalystPipelineStrategy` kaldırılıyor. Bunlar incelenen açık kaynak API
  sınırlarıdır; servis tarafının aynı SHA’yı çalıştırdığı iddia edilmez.
- Catalyst `56aff2d85fe064e610dc15d5793c23199267fb5b` manifest döngüsünün
  discontinuity bilgisini taşımaması provider incelemesine ipucu olarak eklendi.
  Canlı asset’in bu commit’le üretildiği veya reset’i bu satırın ürettiği
  doğrulanmadığından upstream patch hazırlayıp uygulanmış gibi sunulmadı.
- Tam hedef kimlikleri, kaynak referansları, destek için gönderilmeye hazır
  metin, paylaşılacak veri, maliyet/geri dönüş engelleri ve kapanış ölçütleri
  işlem paketine kaydedildi. Dışarı mesaj gönderilmedi.

### Doğrulama ve duruş sınırı

Kanıt: `LOCAL_STATIC` kaynak incelemesi + `PROVIDER` salt-okunur metadata.
Önceki gate’in ham PTS/Brave kanıtı yeniden çalıştırılmadı. Kod değişmediği için
`docs/testing.md` test/lint/build komutları tekrarlanmadı; aynı kusuru tekrar
ölçmek veya sağlıklı dosyalara test eklemek onarım sağlamaz.

Başlangıçtaki 260 dosyanın hash’i kaydedildi. Kayıt sonunda bu plan dışındaki
259 dosyanın hash’i ve HEAD korundu; yeni tek yol onarım paketi. Belge boşluk
ve explicit-path diff kontrolü geçti.

Çalıştırılmayanlar: retry/patch/reprocess, yeniden kodlama veya upload, ödeme,
Git/CI/deploy, cüzdan imzası, provider policy/config değişikliği, NEAR/D1 mutation,
provider’a mesaj, onarılmış medyanın canlı kabulü ve Production/Mainnet.

**Tek devam gate’i: `PLAYBACK_MEDIA_FIX_SOURCE`.** Kullanıcının “dışarıya talep
gönderme!” talimatıyla destek gönderimi adımı iptal edildi. Dış mesaj/form/talep
gönderilmeyecek; gönderim onayı yeniden sorulmayacak. Önceki mesaj taslağı yalnız
gönderilmemiş tarihsel kayıt olarak tutulur. Hiçbir dış talep gönderilmedi.

Bu düzeltme, onarımın tamamlandığı veya provider/canlı işlem yetkisi verildiği
anlamına gelmez. Aynı gate’in mevcut sınırları içinde dış iletişim gerektirmeyen
bir çözüm henüz doğrulanmadı. `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE` açılmadı.


## 13. PLAYBACK_SINGLE_SIGNATURE_SOURCE — 9 Eylül 2026

**COMPLETED_WITH_WARNINGS / LOCAL_STATIC + LOCAL_TEST.** Kullanıcının bu sohbette
uygulanmasını açıkça istediği güncel plan yerelde tamamlandı. Public-testnet
kaynak davranışı aşağıdadır; önceki 8 saat/ayrı kimlik imzası kayıtları bu hedef
ortamın güncel davranışı değildir. Canlı Web/Market/Bridge değişmedi.

### Uygulanan kullanıcı kararı

- İlk bağlantı yalnız hesabı seçer; ayrıca mesaj imzası istemez. Cüzdanın kendi
  hesap seçimi, bağlantı izni ve kilit açma ekranları imza sayısından ayrıdır.
- Alıcı bir USDC satın alma işlemini, creator mevcut sponsorlu yükleme delegate’ini
  bir kez imzalar. Aynı imzalı FT mesajı cihaz yetkisini de taşır.
- Her **yeni başarılı satın alma/yükleme**, aynı cihazın bitişini zincirdeki kabul
  zamanından itibaren **30 gün** yapar. 20. gündeki işlem bitişi 50. güne taşır;
  kalan süreye 30 gün biriktirilmez. Aynı anahtar yeni slot tüketmez.
- İzleme, sayfa yenileme, token yenileme, eski işlemin uzlaştırılması ve upload-key
  recovery süreyi uzatmaz. Başarısız/iptal/iade edilen ödeme kayıt oluşturmaz veya
  yenilemez. Belirsiz sonuçta otomatik ikinci ödeme yapılmaz.
- Hesap başına en fazla üç cihaz kaydı vardır. Dördüncü cihaz, son yetkilendirmesi
  en eski kaydı çıkarır. Süresi biten kayıtlar yeni kayıt sırasında temizlenir;
  okuma işlemleri kayıt veya sıralama değiştirmez.
- Süre dolması, çıkış ve site verisi kaybında ayrı kimlik imzası açılmaz. Creator
  dahil izleme sonraki gerçek satın alma/yükleme işlemine kadar bekler. Mevcut
  demo videoları için geçiş ve silme yapılmadı.

### Kaynak ve güvenlik

Mevcut IndexedDB/non-extractable WebCrypto cihaz anahtarı tekrar kullanıldı.
Anahtar ödeme imzasından önce, sponsorlu delegate kanıtı relay’den önce kaydedilir.
Yeni sürüm-3 cihaz belgesi hesabı, ağı, Market’i, siteyi, cihaz anahtarını, yalnız
`play` yetkisini ve sabit 30 günlük süreyi bağlar. Bitiş zamanı istemciden alınmaz.

FT mesajındaki isteğe bağlı `playback_session` alanı iki başarılı ödeme kolunda
aynı küçük Market yardımcısına gider. Raw storage kullanılır; Contract Borsh
veri düzeni, mevcut job/entitlement yapıları ve sponsor quote hash’i değişmez.
`get_playback_device(account_id, session_public_key)` sadece okuma metodudur.
Eski mesajlar ve diğer ortamlardaki V1/V2 yolları uyumludur. Web’de yeni davranış
mevcut `publicTestnetVideoV1 && enablePlaybackAuthorizerV2` koşuluyla sınırlıdır;
feature flag varsayılanları değiştirilmedi.

Bridge mevcut `/v2/playback-tokens` üzerinden cihazın imzasını, final Market
kaydını ve güncel izleme hakkını doğrular. Doğrudan ödemenin imzalayan anahtarı
Market kaydından; sponsorlu yüklemede aynı cihaz belgesini bağlayan geçerli
SignedDelegate’den alınır. Sponsorun anahtarı creator’ın anahtarı sayılmaz.
Güncel FullAccess kontrolü korunur; yeni cihaz yetkisi taşıyan relay, sınırlı
anahtarla yayınlanmaz. İşlemin eski 200 blok gönderim penceresi 30 günlük izleme
kanıtına uygulanmaz. Playback hiçbir delegate’i yeniden yayınlamaz.

Eksik/bitmiş zincir kaydı yerel anahtarı silmez; anahtar tek başına izleme yetkisi
vermez. Reload final zincir kaydını yeniden okur, bu yüzden kaybolmuş cüzdan
başarı yanıtı yenilenmiş yetkiyi kaybettirmez. Geçici RPC hatası mevcut tokenın
süresi dolmadan kontrollü tekrar yoluna gider; gerçek ret erişimi kapatır.

Sekmeler arası çıkış için mevcut kalıcı revision kullanıldı. Bildirim kanalı
player açılmadan önce de kurulur. Ödeme hazırlığı son adımda kalıcı anahtarı ve
nesli tekrar doğrular; kontrol sonrasında async hash işlemi kalmaz. Read,
broadcast’tan önce yeni revision görürse aktif player’ı da durdurur. Eski bir
bildirim yeni açık hazırlığı yanlışlıkla iptal etmez.

Yeni servis, bağımlılık, secret, işlem geçmişi arşivi, izleme aktivitesi kaydı,
D1 değişikliği veya provider/player değişimi yoktur. Mevcut en fazla 60 saniyelik
yetki önbelleği ve en fazla 180 saniyelik verilmiş medya tokenı sınırları korunur;
uzaktaki iptalin bütün verilmiş tokenları anında kapattığı iddia edilmez.

### Değişen dosyalar — yalnız bu gate’in farkları

- Web: `lib/device-session.ts`, `lib/livepeer-publication.ts`, `lib/livepeer-upload.ts`;
  `components/providers/WalletProvider.tsx`, `components/LivepeerPlayer.tsx`,
  `components/LivepeerWatch.tsx`, `components/LivepeerPaidUploadForm.tsx`.
- Web testleri: `__tests__/unit/device-session.test.ts`, `livepeer-playback-v2.test.ts`,
  `livepeer-publication.test.ts`, `livepeer-upload.test.ts`, `wallet-provider.test.ts`;
  `scripts/device-session-browser-check.mjs`.
- Market: `contracts/nft-ticket/src/lib.rs`, `contracts/nft-ticket/tests/paid_media_livepeer_v1.rs`.
- Bridge: `workers/livepeer-bridge/src/index.ts`, `src/index.test.ts`, `src/playback-v2.test.ts`.
- Protokol/kanıt: `scripts/check-paid-media-livepeer-v1-abi.mjs`,
  `protocol/paid-media-livepeer-v1/README.md`, bu belge.

### Doğrulama

| Kontrol | Sonuç / kanıt sınırı |
| --- | --- |
| Web: 7 odaklı test dosyası | **132 PASS**. Cihaz kalıcılığı, çapraz sekme, 30 günlük zincir yenilemesi, tek işlem imzası, sıfır izleme imzası ve geçici RPC hatasında tokenın korunması. |
| Bridge: playback-v2, playback, index | **155 PASS / 3 SKIPPED**. V1/V2/V3 uyumu, gün-29 soğuk okuma, sponsor proof, yetkisiz hesap/key/hash/süre reddi; üç eski opt-in abuse/load senaryosu çalıştırılmadı. |
| Market: lib + paid_media_livepeer_v1 | **45 PASS**. 20→50 gün, aynı cihaz, dördüncü cihaz, refund/replay, bozuk mesaj ve sponsor signer ayrımı. |
| Gerçek Brave, izole headless profil | **13 kontrol PASS / LOCAL_TEST**. Gerçek IndexedDB/WebCrypto, reload/export reddi, 20→50 gün ve iki sekme/logout yarışları; yalnız localhost ve mock wallet/chain, gerçek cüzdan veya canlı ödeme değil. |
| Web kaynak lint | **PASS**: `npm run lint -- --ignore-pattern '.open-next/**'`. Düz `npm run lint`, önceden bulunan üretilmiş `.open-next` dosyalarındaki 476 hata/19275 uyarıda takıldı; kaynak veya ESLint config’i bu nedenle değiştirilmedi. |
| Web kapalı-bayrak build | **PASS**. Mevcut CI örnek hesapları kullanıldı; Next middleware/Edge bağımlılık uyarıları var. |
| Bridge `npm run check` | **PASS**. |
| Market fmt, clippy, WASM build | **PASS**. Yerel host/non-reproducible WASM; yayın kanıtı değil. |
| Protokol + yeni üretilmiş ABI | **PASS**; Market 45, Access 26 metod. Yeni view’ün argümanları ve cihaz kayıt alanları kontrol edilir. |

Salt-okunur subagent incelemesinde bulunan son-hash/logout aralığı ve RPC hata
sınıflandırması düzeltildi. Broadcast’tan önceki read/logout sıralaması da testle
korundu. Tek yazan katılımcı ana agent; üç subagent salt-okunur kaldı.

Başlangıç HEAD `d2d3b035ac1e3afa348f353b014339ab46290e16` ve önceden mevcut dirty
çalışma alanı korundu. Gate öncesi kopyalar, dosya hash’leri ve yalnız bu gate’in
farkı `tmp/playback-single-signature-source-1788968080300157000/` altında.

Çalıştırılmayanlar: commit/push/PR/merge, CI/CodeQL, deploy, gerçek cüzdan imzası,
ödeme/upload, provider/config/secret, NEAR/D1 canlı değişikliği, Production/Mainnet,
kapasite ve medya onarım kabulü. Kaynak gate’inin engeli yok; canlı tek-imza ve
oynatma kabulü **EXTERNAL_NOT_RUN / UNPROVEN** olarak kalır.

**Tek sonraki gate: `PLAYBACK_SINGLE_SIGNATURE_RELEASE_PREFLIGHT`.** İncelenen
kaynağın yayın paketi hazırlanır; Market → Bridge → Web yayını ve gerçek Brave
kabulü ayrıca yetkilendirilir. Bu kaynak gate’i sonraki gate’i başlatmadı.


## 14. Yeni video: sarma sonrası senkron ve kısa süre — 10 Eylül 2026

**PLAYBACK_MEDIA_TRACE: COMPLETED_WITH_WARNINGS.** Kullanıcı eski videoyu
kapsamdan çıkardı; yeni `matrixxx` publication’ı
`lp-0ccc24cb-0b79-4eb7-a2ab-72e5fcbe43e6` üzerinde ilerlenmesini ve Livepeer
belgelerinin değerlendirilmesini istedi. Kaymanın ileri sarmadan sonra olduğunu,
oynatıcı süresinin de orijinalden kısa göründüğünü belirtti.

Tam ölçüm, yöntem, sınırlar ve kaynaklı öneriler:
playback-new-video-sync-analysis.md (yerel arşiv: `/Users/arair/works/youtick-lp/docs/architecture/playback-new-video-sync-analysis.md`).

- Taze provider metadata: **248.581667s**; 360p ve 720p HLS:
  **25 segment / 248.705s**; mevcut player: **30.037911s**.
- Yeni asset’in altı gerçek segmentinde video ilk PTS yeniden **1.5s**;
  ses de yaklaşık 1.41–1.46s’ye sıfırlanıyor. Playlist discontinuity sayısı 0.
  Eski videonun kanıtı yeni videoya varsayım olarak taşınmadı.
- Temiz hls.js instance’larında 60s’ye sarma: Auto’da duration **21.037911s**,
  360p’de **30.037911s** ve erken durma; 720p’de 6s sonra readyState=1,
  yeni kare/ses ilerlemesi yok. Audio buffer yaklaşık [0,11.967] aralığında kaldı.
- Kısa süre ve sarma sonrası ses bozulmasının ortak teknik açıklaması teslim
  edilen HLS’nin kesinti bildirimi olmayan timestamp reset’idir. Kesin provider
  üretim noktası, yerel orijinal dosya ve fiziksel A/V farkı henüz doğrulanmadı.
- Resmî Livepeer docs `de6026f63e2ec1bf11bb91f82facf1a86dbf2e39` incelendi:
  TUS, backend Playback Info/JWT ve React Player akışı uygun. API bu asset için
  HLS+VTT sunuyor, MP4 yok. iframe/WebRTC/buffer değişikliği bu kusuru çözmüş
  sayılmaz; mevcut yetkilendirme ve HLS yolu korunmalı.

Yalnız bu plan ve yeni analiz belgesi değişti. Başlangıçtaki diğer dosyalar
hash ile korundu; belge boşluk kontrolü geçti. Kod değişmediği için mevcut
testler/build tekrarlanmadı. Yeni ödeme/upload, cüzdan imzası, provider/config,
Git/CI/deploy, NEAR/D1 mutation ve dış destek talebi yapılmadı.

Geçici browser karşılaştırması kaldırıldı; asıl video 7.109323s’de duraklatılmış,
Auto durumda ve kullanıcının mevcut oturumu korunarak bırakıldı.
**Tek sonraki gate: `PLAYBACK_MEDIA_FIX_SOURCE` — yeni asset için.** Bu analiz
onarım veya tam medya kabulü değildir; eski video ve atlanan sentetik deney
tekrar açılmayacak, dışarıya talep gönderilmeyecek.


## 15. Yeni asset için PLAYBACK_MEDIA_FIX_SOURCE — 10 Eylül 2026

**COMPLETED_WITH_WARNINGS / LOCAL_STATIC + LOCAL_TEST + kontrollü PREVIEW/PROVIDER.**
Kullanıcının yeni asset için seçtiği source gate tamamlandı; deployment ve tam
canlı UX kabulü yapılmadı. Eski video ve iptal edilmiş dış iletişim açılmadı.

Detaylı kaynak, test ve gerçek medya kanıtı:
[playback-new-video-timeline-fix.md](./playback-new-video-timeline-fix.md).

- İki kalitedeki 50 segmentin tamamında saat sıfırlaması doğrulandı. Playlist
  SHA-256 `daa629f3156f8fe09843b69de756785d2cd823da0a0a0f7d202c41df541c0720`.
- Düzeltme yalnız playback `ef819lp2r3anecgq` ve bu tam playlist içeriğine bağlı.
  hls.js’nin mevcut playlist/segment loader noktalarıyla nominal başlangıçlar
  korunur; ses/video PTS ve DTS’ye aynı offset uygulanır. Playlist, medya payload’ı,
  kaynak buffer ve mevcut JWT/izinli host yolu korunur. Provider verisi değişmez.
- Kör discontinuity-ekleme adayı son süreyi ~2s uzattığı için bırakıldı.
  Son ortak-saat düzeltmesi gerçek videoda 248.784578s’de normal sona ulaştı.
- Son kaynak Auto/360p/720p’de 60s sarma sonrası 63.273/63.393/63.205s’ye ilerledi;
  süre 248.705s kaldı, audio/video buffer beraber ilerledi. Geri sarma ve son
  bölüme geçiş de ortak-ofset algoritmasıyla geçti. Fiziksel A/V ms farkı ölçülmedi.
- 42 odaklı Web testi, son yardımcı dosyada 13/13 tekrar kontrol, lint ve build
  geçti. Native Brave denemesi mevcut yetkili medya üzerinde geçici adaydı;
  uygulamanın yayımlanmış bundle’ı değiştirilmedi. Kontroller tekrar gerektiren
  her yeni değişiklik/bulgu için sınırlandırıldı.

Yedi değişen yol tam raporda listelenir. Uygulama alanı yalnız yeni HLS yardımcısı,
`livepeer-playback.ts`, `LivepeerPlayer.tsx` ve iki ilgili test dosyasıdır; ayrıca
bu plan ve kaynak sonuç belgesi güncellendi. Kullanıcı değişiklikleri izole aday
ve explicit-path diff ile korundu. Aktarım sonrası 7 dosya adayla birebir eşleşti;
267 kapsam dışı dosyanın hash’i, HEAD ve diff/boşluk kontrolü doğrulandı. Yeni
servis/bağımlılık veya genel çatı yoktur.

Sınırlar: tek ölçülmüş asset için uyumluluk; provider düzeldiğinde kaldırılmalı
veya yeniden doğrulanmalı. Native-only HLS ve fiziksel ses/senkron kabulü,
20 sarma p95 ve yeni yayında token/cüzdan kabulü ayrı kalır. Yeni ödeme/upload,
Git/CI/deploy, provider/config/secret, NEAR/D1 mutation ve dış mesaj yapılmadı.

**Tek sonraki gate: `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE`.** Git yayını ve
korumalı deployment için mevcut scope’ta açık onay alınmadan işlem yapılmaz;
bu source gate’i sonraki gate’e otomatik geçmedi.


## 16. PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE — 10 Eylül 2026

**Gate kapanışı: COMPLETED_WITH_WARNINGS. Git/deployment ve teknik tarayıcı ölçümleri PASS; manuel kullanıcı kabulü kaydedildi. Fiziksel kalibrasyon UNPROVEN.** Kullanıcı
bu gate’i seçti ve somut Git paketini ayrıca onayladı. Aşağıdaki ilk hazırlık
kaydı tarihsel; Git sonucu ve kesin deployment girdileri bölüm sonunda günceldir.

Somut altı dosyalık source/yayın/kabul paketi (yerel arşiv: `/Users/arair/works/youtick-lp/docs/architecture/playback-public-testnet-acceptance-preflight.md`).

- Main ve son public yayın kaynağı `9205c53fc92970e34e66f85b55ea89ebb0c81c50`.
  Eski source için CI `34486614251` ve yayın `34489775341` SUCCESS; yeni adayın
  CI veya commit’i henüz yok.
- Eski dirty çalışma alanı topluca taşınmadı. İzole main arşivine yalnız medya
  source gate’inin beş Web kaynak/test farkı ve sonuç belgesi uygulandı.
  Main’deki yeni hata tanılama testleri korundu; yalnız bir test ekleme bağlamı
  uzlaştırıldı. Main arşivindeki diğer 272 dosya birebir aynı.
- Main’in Next 16.3.3 kilit dosyasıyla izole `npm ci`, 49 odaklı test, lint,
  kapalı-bayrak build ve mevcut public-testnet acceptance config’iyle build PASS.
  Kök node_modules/package/lock değiştirilmedi. Önceki yerel Next 16.3.0 kanıtı
  yeni lock sürümünün yerine kullanılmadı.
- Oluşturulan acceptance config, son artifact’in
  `9a9711d7a3c64cd1befdc71576ba1d02d266b45748f41ceecd296db8d4bd99ed`
  hash’iyle aynı. Public/Preview deploy bayrakları false ve environment koruması
  salt-okunur doğrulandı; config değişmedi.
- Altı dosyalık patch/hash, önerilen branch/PR açıklaması, Git onay kapsamı,
  mevcut üç Worker’lı workflow’un etkileri ve gerçek medya kabul matrisi hazır.
  Source paketi yalnız yeni playback ID’nin dar uyumluluk düzeltmesidir.

Bu tur çalışma dizininde yalnız bu plan ve hazırlık belgesi değişti; izole aday
ve loglar task temp dizinindedir. Source/lock/HEAD/index ve mevcut kullanıcı
çalışması korunur. Yeni kaynak bağlamı nedeniyle ilgili kontroller çalıştırıldı;
canlı medya kanıtı gerekçesiz tekrar edilmedi.

Çalıştırılmayanlar: commit/push/PR/merge, yeni CI/rerun, deploy, canlı izleme/kabul,
yeni cüzdan imzası, ödeme/upload, provider/config/secret, NEAR/D1 mutation ve dış
mesaj. Eksik yayın ve fiziksel A/V/20-sarma/iki-yenileme kabulü tamamlandı sayılmaz.

### Git aşaması sonucu — kullanıcı onayı sonrası

- [PR #194](https://github.com/4rmus/youtick/pull/194), normal squash merge.
- Branch commit `207e1e073f57487e5e87cb62f4f4dcbb64017e6a`;
  [PR CI 34506193056](https://github.com/4rmus/youtick/actions/runs/34506193056) SUCCESS.
- Main `9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`;
  [main CI 34507547060](https://github.com/4rmus/youtick/actions/runs/34507547060) SUCCESS.
- Onaylanan altı dosyanın hash’i merge tree ile eşleşti; değişen yol kümesi tam
  olarak aynı. Force push, admin bypass, CI rerun veya deployment yok.
- Root çalışma alanının 275 dosyası Git aşaması boyunca korundu;
  root HEAD `d2d3b035ac1e3afa348f353b014339ab46290e16` değişmedi. Git işlemleri
  ayrı checkout’ta yürütüldü; bu plan ve hazırlık raporu yalnız yerel kayıt olarak güncellendi.

**Tek devam gate’i: `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE`.** Kesin onay paketi:
aynı public config ile `deploy-public-testnet.yml`, `ref=main`,
`sha=9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`, `ci_run_id=34507547060`, `mode=acceptance`,
`confirmation=DEPLOY_PUBLIC_TESTNET_acceptance`; tek dispatch, normal environment
onayı ve public deploy bayrağı false→true→false. Workflow read-model→Bridge→Web
geçişi yapar; ardından mevcut ödenmiş yeni video ile canlı kabul yürütülür.
Yeni ödeme, upload, cüzdan imzası, provider asset onarımı veya dış talep bu pakette yoktur.

Public/Preview deploy bayrakları false; son public yayın hâlâ `34489775341`
ve eski `9205c53` kaynağıdır. Yeni kodun deployment ve tam canlı kabulü henüz
yapılmadı. **Git onayı deployment yetkisi olarak kullanılmadı; deployment onayı bekleniyor.**

### Deployment onayı uygulandı — aynı gate

Kullanıcı kesin deployment paketini onayladı. Tek dispatch
[34509663409](https://github.com/4rmus/youtick/actions/runs/34509663409),
source `9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`, CI `34507547060`, acceptance.
Altı artifact için signer workflow + source digest doğrulaması ve manifest/lock/config
eşleşmesi PASS; normal public-testnet environment onayı verildi. Workflow sürüyor.
Public deploy bayrağı geçici true; koşu bitince false yapılacak. Preview false.
Canlı kabul henüz başlamadı; bu ilerleme kaydı PASS değildir.

### Deployment sonucu ve kullanıcı tarafından ertelenen tarayıcı kabulü

**Deployment PASS; tam gate BLOCKED.** Kullanıcı 10 Eylül 2026'da kalan
Brave ölçümü için “Tarayıcı ölçümünü sonraya bırak” dedi. Bu nedenle tam
medya/oturum kabulü kapatılmadı ve sonraki gate başlatılmadı. Önceki
WAITING_DEPLOY_AUTHORIZATION ve DEPLOYMENT_RUNNING kayıtları tarihseldir.

- Tek korumalı koşu [34509663409](https://github.com/4rmus/youtick/actions/runs/34509663409),
  attempt 1, SUCCESS. Kaynak `9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`,
  başarılı main CI `34507547060`, mevcut acceptance config hash'i aynı.
- Altı artifact'in signer workflow/source digest doğrulaması, manifest ve
  lock hash kontrolü PASS; normal environment onayı kullanıldı. Rerun/bypass yok.
- Managed traffic, üç yeni sürümde %100 ve deployment receipt ile eşleşiyor:
  Web `d6703271-5a81-47ff-acac-b14a4b57b12c`,
  Bridge `04e6808a-99b6-4ee1-9b19-393fb17a44c9`,
  read-model `1711c568-2a66-49c3-8ed0-602dc26abe75`.
- Bridge/read-model canlı health sürümleri eşleşti. Gerçek sunulan watch chunk
  `page-49c7fe4a9ab71f29.js`, SHA-256
  `d301be3b658057b494b5e3d1e93dd29d38df44ac7916e93041f5478912ffbf5b`,
  imzalı Web artifact'indeki dosyayla birebir aynı.
- Kök site fingerprint kontrolü workflow'da PASS. Preview managed deployment
  ve %100 sürüm dağılımı değişmedi. Public deploy bayrağı false→true→false;
  Preview false kaldı. Public acceptance/upload ayarları aynı kaldı.
- İlk gerçek Brave kontrolünde mevcut `soteri.testnet` oturumu reload sonrası
  ek cüzdan açılması gözlenmeden oynattı. Aynı yeni video önceden 30.037911s
  iken yayımlanan player **4:09** gösterdi, **0:27** konumuna ilerledi.
  Geçici medya düzeltmesi yüklenmedi. Bu kısa gözlem uzun oturum veya A/V kabulü değildir.

Ertelenen / UNPROVEN: yayımlanmış Auto/360p/720p karşılaştırması; 10 buffer içi +
10 buffer dışı sarma, p95/max ve durma eşikleri; aynı player'da en az 6 dakika ve
iki gerçek token yenilemesi; anonim/yetkisiz kimlik reddi; fiziksel A/V ≤150ms;
normal sona ulaşma. Önceki kontrollü source kanıtları bunların yerine kullanılmadı.

Ham yayın/ölçüm kaydı:
[acceptance-result.json](/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/playback-acceptance-m2nyenzb/acceptance-result.json),
[managed-runtime-verification.json](/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/playback-acceptance-m2nyenzb/managed-runtime-verification.json),
[deployment receipt](/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/playback-acceptance-m2nyenzb/deployed-receipt/public-testnet-deployment.json).
Python HTTP istemcisi health okumasında 403 aldı; curl ile gerçek health/chunk
okumaları başarılı oldu. Bu istemci farkı yayın arızası olarak raporlanmadı.
GitHub'ın artifact action Node 20→24 uyarısı koşuyu engellemedi; workflow değiştirilmedi.

Yerelde yalnız kanonik plan ve kabul hazırlık raporu güncellendi. Source,
package/lock, kök HEAD/index ve kullanıcı değişiklikleri korunur. Yeni kod
olmadığından önceki başarılı yerel test/lint/build tekrar edilmedi. Yeni ödeme,
upload, cüzdan imzası, provider asset işlemi, NEAR/D1 manuel mutasyonu veya dış
talep yapılmadı. Kullanıcının erteleme yanıtından sonra tarayıcı ölçümü sürdürülmedi.

**Tek devam gate'i: `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE` — yalnız ertelenen canlı
kabul.** Aynı kaynak ve yayın geçerliyse Git/CI/deploy tekrarı gerekmez. Otomatik
zamanlama veya sonraki gate'e geçiş yoktur.


### Tarayıcı kabulüne devam — 10 Eylül 2026, 17:53–18:12 UTC

Kullanıcı `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE` tarayıcı ölçümüne devam edilmesini
istedi. **Teknik ölçümler PASS; tam gate BLOCKED / iki kabul kanıtı UNPROVEN.**
Önceki kullanıcı-ertelemesi artık aktif engel değildir. Son yayın hâlâ
`34509663409` / `9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`, SUCCESS olarak doğrulandı.
Aynı yeni video ve Brave'in mevcut `soteri.testnet` oturumu kullanıldı.

- Yeni sekme, iki reload ve Discover → geri dönüş mevcut hesabı ve izleme
  hakkını korudu. Geri dönüş sonrası oynatma 26.591375s'ye ilerleyip video
  yüzeyinden duraklatıldı. Uygulamanın cüzdan imzası/işlem ölçüm olayı **0**;
  uzun oturumda ölçülen `window.open` çağrısı **0**, kullanıcıya cüzdan onayı yok.
- Gerçek yayımlanmış Livepeer React Player'da Auto/360p/720p seçimi ve sarma
  karşılaştırması: ilk ilerleyen kare **101 / 1870 / 1434 ms**. Sonraki 10s'de
  ses baytı ve video karesi arttı; süre **248.785–248.786s** civarında kaldı.
- **20 sarma, 10 buffer içi + 10 buffer dışı:** nearest-rank p95 **1957 ms**,
  en kötü **2750 ms**. Her örnek sonrası 10s izlendi; en uzun kare aralığı
  **133 ms**, 500ms üzeri durma yok; bütün örneklerde ses/kare ilerlemesi var.
  Ayrı alt gruplarda p95: buffer içi **124 ms**, buffer dışı **2750 ms**.
  Planın birleşik 20 örnek eşiği geçti; her alt grubun p95 ≤2s olduğu iddia edilmez.
- Aynı video DOM öğesi ve aynı medya kaynağında **380187 ms / 6 dakika 20 saniye**;
  **3 gerçek token yenilemesi HTTP 200**. Uygulamanın kendi renewal completed
  kayıtları da eşleşti. Bu aralıkta `emptied`/`loadstart`/`error` olayı yok.
  Sarma hedefleri dışındaki kendiliğinden zaman sıçramaları için ayrı sürekli
  zaman-farkı serisi tutulmadı; böyle bir nicel sıfır-sıçrama iddiası yapılmaz.
- Sonra normal `ended` olayı: **248.785453s**, currentTime=duration.
  JWT ve cookie göndermeden gerçek yüklenmiş HLS segmentine istek **401**;
  64 bayt hata yanıtı, medya erişimi reddedildi.

Yöntem/sınırlar: Geçici konsol ölçümü gerçek `<video>` üzerinde `currentTime`
ile sarar; `requestVideoFrameCallback` ile hedef sonrası ilerleyen ilk kareyi
ve sonraki 10s'nin kare aralıklarını ölçer. Pointer sürükleme/hit-target gecikmesi
ölçülmedi. Buffer sınıfı her sarma öncesi gerçek `buffered` aralıklarından çıkarıldı.
Buffer dolunca uzun oturum ölçümü bittikten sonra iki normal reload ile dış
örnekler 3+4+3 toplandı. Disk cache temizlenmedi; ağ, buffer, provider ve
uygulama kodu/ayarları değiştirilmedi. Sonuç bu bağlantı ve bu 20 örnek içindir.
Ses baytı/kare ilerlemesi fiziksel A/V farkını ölçmez.

İki ilk kalite örneğinde aynı 60s store isteği gerçek sarma başlatmadı; bu
örnekler dışlandı. Kalite değişiminden sonra farklı hedefler ve doğrudan medya
sarması ile düzeltildi. Ölçüm yardımcısını `eval` ile değiştirme denemesi CSP
engeline takıldı; CSP korunarak işlev doğrudan konsolda yeniden tanımlandı.
Bir reload'ın ilk görüntüsünde geçici ERR_CONNECTION_CLOSED vardı; yeniden
reload yapmadan sonraki okuma sayfanın ve oturumun normal geldiğini gösterdi.
Bunlar başarılı uygulama senaryosu veya kalıcı ürün hatası olarak sayılmadı.

**Kalanlar / UNPROVEN:**

1. Ölçülebilir ses/görüntü referansında **≤150 ms**. Referans verilmedi; kullanıcıya
   güncel kayma gözlemi soruldu, bu sonuç yazılırken yanıt gelmedi. Öznel kontrol
   yanıtı gelse bile tek başına milisaniye eşiğinin ölçümü değildir.
2. Bu videoya hakkı olmayan mevcut kimlikle gerçek browser/authorizer reddi.
   Yalnız aynı uygulamanın IndexedDB `sessions` kayıt anahtarları salt okunur
   incelendi: tek `account:soteri.testnet` ve bu hesap satın almış. Gizli anahtar
   okunmadı/dışa aktarılmadı; yeni kimlik, imza veya bilet oluşturulmadı.

Detaylı 20 satır, buffer aralıkları, saatler, kalite ve oturum sonuçları:
[browser-result.json](/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/playback-browser-acceptance-m1ysmztc/browser-result.json).
Kabul raporu (yerel arşiv: `/Users/arair/works/youtick-lp/docs/architecture/playback-public-testnet-acceptance-preflight.md`) ölçüm tablosunu içerir.
Geçici ölçüm nesnesi silindi, konsol filtresi `MEDIA_RACE` olarak geri kondu;
yalnız açılan ölçüm sekmesi kapatıldı, kullanıcının eski sekmesi korundu.

Yerelde yalnız bu plan ve kabul raporu değişti; kaynak kod/test/lock dosyaları
ve mevcut kullanıcı çalışması korunur. Yeni kaynak değişmediği için tamamlanmış
unit/lint/build/CI tekrar edilmedi. Yeni deploy/Git yayını, ödeme, upload,
cüzdan imzası, provider asset onarımı, NEAR/D1 manuel mutasyonu veya dış talep yok.
**Tek devam gate'i `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE`: yalnız eksik iki kabul
kanıtı.** Bu tur sonraki gate'i başlatmaz; tam hedef PASS/complete sayılmaz.


### Orijinal dosyayla A/V referans incelemesi — 10 Eylül 2026

Kullanıcı orijinal dosyanın yolunu verdi. **Referans incelemesi
COMPLETED_WITH_WARNINGS; tam gate BLOCKED.** Orijinal dosyanın eksikliği giderildi;
aktif eksikler ölçüm yolunun gecikme kalibrasyonu ve ayrı yetkisiz kimlik kabulüdür.

- Dosya: `/Users/arair/Desktop/youtick/demo-video/All I'm offering is the truth _ The Matrix [Open Matte].mp4`.
  **17.070.370 bayt**, SHA-256
  `dc84bb6d977eae06b213369f3c7229a5c184582952c9c4ef81fa070b0cfd52fb`.
- Kapsayıcı **248.681708s**; video **248.581667s**, 1280×720, 24000/1001 fps;
  AAC ses 48kHz, 5.1. Video süresi önceki provider metadata değeriyle eşleşiyor.
  Önceki gerçek HLS bitişi 248.785453s ile kapsayıcı farkı **103.745 ms**;
  bu fark A/V kayması değildir. Dosya değiştirilmedi.
- 5960 video karesinin zamanları sabit 1001/24000s adımda doğrulandı.
  11655 ses karesinde yalnız ilk çerçeveden sonra **2002/48000s = 41.708333ms**
  timestamp boşluğu var. İlk AAC frame 1024 örnek içerirken packet duration
  3026 örnek; sonraki zamanlar kesintisiz. Ham PCM birleştirmesi bu boşluğu
  atladığından referans eşleştirmesinde açıkça düzeltildi; medyaya uygulanmadı.

Aynı ödenmiş hesap ve gerçek yayımlanmış player'da sarma sonrası yaklaşık 4s'lik
beş ses/kare örneği alındı. Kısa WebAudio PCM ve `requestVideoFrameCallback`
kareleri yalnız yerel JSON'a kaydedildi. JWT, özel anahtar veya ham istek URL'si
kaydedilmedi. Orijinal dosya yalnız yerel ffmpeg ile PCM/gri karelere çözüldü;
yayın medyası yeniden kodlanmadı, dosya dışarı yüklenmedi.

| Kalite / hedef | Gerçek boyut | Ses korelasyonu | Tahmini ortanca ses gecikmesi |
| --- | --- | --- | --- |
| Auto / 60s | 1280×720 | 0.942 | 66.3 ms |
| Auto / 120s | 1280×720 | 0.938 | 37.8 ms |
| Auto / 210s | 1280×720 | 0.940 | 63.7 ms |
| 360p / 120s | 640×360 | 0.952 | 24.4 ms |
| 720p / 120s | 1280×720 | 0.952 | 15.3 ms |

Bunlar **kalibre edilmemiş tahminler**, fiziksel ≤150ms kabulü değildir.
Tek durağan kareler zaman açısından belirsizdi; kare dizisi birlikte eşleştirildi.
Kaynak kare adımı 41.708ms; benzer derecede iyi video eşleştirmeleri sonuca ek
hassasiyet getiriyor. JSON'daki near-best aralıkları güven aralığı değildir.
Geçici `ScriptProcessor` yolu player ses zincirine gecikme ekleyebilir; dolayısıyla
bu tahmin gerçek, değiştirilmemiş player çıkışının kesin gecikmesi olarak sunulmaz.

Bu araç gecikmesini ayırmak için orijinalin ağsız `data:` sayfasında aynı yöntemle
kalibrasyonu planlandı. Browser Use URL güvenlik politikası bu navigasyonu
reddetti; alternatif tarayıcı yolu veya güvenlik aşımı denenmedi. Boş yerel sekmeye
orijinal dosya seçilmedi/yüklenmedi. Bu sınır nedeniyle A/V kabulü UNPROVEN kalıyor.
Ayrı yetkisiz hesap/oturum bilgisi de henüz verilmedi; önceki anonim 401 kanıtı
bu farklı kabul maddesinin yerine kullanılmadı.

Kanıtlar: [reference-result.json](/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/playback-av-reference-4q83t1hn/reference-result.json),
[source-timing-result.json](/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/playback-av-reference-4q83t1hn/source-timing-result.json),
[browser-av-traces.json](/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/playback-av-reference-4q83t1hn/browser-av-traces.json).
Yerel analiz komutları ve NumPy eşleştirmesi aynı geçici kanıt klasöründedir;
yeni bağımlılık kurulmadı. Sonraki kayıt önceki başarılı 20-sarma/token kanıtlarını
tekrarlamaz veya geçersiz kılmaz.

İki geçici sekme kapatıldı; ses ölçüm yolu onlarla kaldırıldı, asıl kullanıcı
sekmesi korundu. Yerelde yalnız plan ve kabul raporu güncellendi. Source/test/lock
ve orijinal MP4 korunur; yeni kod olmadığından unit/lint/build tekrarlanmadı.
Yeni ödeme/upload/imza, Git/CI/deploy, provider onarımı, NEAR/D1 manuel mutasyonu
ve dış destek talebi yapılmadı.
**Tek devam gate'i: `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE` — kalibre A/V ve ayrı
mevcut yetkisiz kimlik kabulü.** Yeni onay gerektiren bir işlem kendiliğinden başlatılmaz.


### Kullanıcının yeniden deneme isteği — doğrudan medya kaydı

Kullanıcı engelin nedenini ve öneriyi sordu, yeniden denemeyi istedi.
**Yeniden deneme COMPLETED_WITH_WARNINGS; tam gate BLOCKED.** `data:` URL
kalibrasyon sayfası tekrar denenmedi; bu sayfayı açmak için farklı URL veya
başka tarayıcı yüzeyi kullanılmadı. Önceki ret, videodan/Livepeer'den değil
Browser Use URL politikasından kaynaklanıyordu.

[W3C Media Capture from DOM Elements](https://www.w3.org/TR/mediacapture-fromelement/)
incelendi. Mevcut yetkili video öğesinin `captureStream()` akışından
`MediaRecorder` ile üç kısa yerel WebM kaydı alındı. Bu yeni ölçüm, yerel
kalibrasyon sayfasını gerektirmez ve player sesini WebAudio/ScriptProcessor
çıkışına yönlendirmez. Kullanıcının orijinal MP4'ü dışarı yüklenmedi. JWT/NEAR
hak kontrolü korunarak aynı yeni video ve mevcut `soteri.testnet` kullanıldı.

| Seçim / sarma hedefi | Kayıt çözünürlüğü | Paket zamanlarıyla ortanca ses öndeliği | Örneklerde min–max |
| --- | --- | --- | --- |
| 720p / 120s | 1280×720 | 95.7ms | 85.7–106.7ms |
| 360p / 120s | 640×360 | 120.3ms | 110.3–131.3ms |
| Auto / 210s | 1280×720 | 110.7ms | 100.7–121.7ms |

Her kayıt yaklaşık 8s, 240 video karesi ve 133 ses karesi/paketi. Kayıtların
ses/görüntü packet sayıları decode frame sayılarıyla birebir eşleşti; video PTS
artan sırada. Ses eşleşmesi 0.942–0.993; video dizisi benzerliği 0.9984–0.9996.
Kaynak ilk ses paketinin 41.708333ms boşluğu ve kayıt içindeki ses PTS aralıkları
hesaba katıldı. Yakın video eşleşmelerine hassasiyetle üst değer 133.4ms altında;
bu aralık istatistiksel güven aralığı değildir. Kayıt örneklerinde 150ms aşılmadı.

FFmpeg, Chrome WebM kaydını incelerken Opus başlığı uyarıları verdi; sessizce
yok sayılmadı. Üç kaydın bütün ses/video packet→frame sayıları, ses örnek sayısı
ve içerik korelasyonu ayrıca doğrulandı. 360p rawvideo çözümünde düşük çıkış
zaman tabanı yuvarlaması uyarısı görüldü; analiz zamanları rawvideo mux saatinden
değil kayıt dosyasının ffprobe frame PTS'lerinden alındı, ham kare sayısı eşleşti.
Bu uyarılar provider çıktısına veya yayımlanmış koda atfedilmedi.

**Kapsam sınırı:** W3C'ye göre captured stream, medya öğesinin içeriğini temsil
eder; fiziksel ekran/hoparlör çıkışının kalibre kaydı değildir. Bu yüzden yeni
bulgu **kayıt içi A/V referans karşılaştırmasını** güçlendirir; fiziksel ≤150ms
maddesini kendiliğinden PASS yapmaz. Önceki ScriptProcessor 15–66ms ses-geriliği
tahminleri bununla birleştirilmez; iki farklı ölçüm yolu farklı sonuç verdi.

**Öneri:** Bu ölçümlere dayanarak yeni buffer, yeniden kodlama, player/provider
veya auth değişikliği yapma. Kalan kabul için ayrı mevcut satın almamış kimlikle
ret ve kalibre fiziksel çıkış doğrulaması gerekir. Bunların yerine yeni ödeme,
yeni oturum imzası veya önceden geçmiş test tekrarı yapılmaz.

Kanıt: [native-av-result.json](/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/playback-native-av-b93ns8r2/native-av-result.json).
Kısa kayıtlar ve çalıştırılabilir yerel eşleştirme/özet komutları aynı geçici
klasördedir. WebM yalnız ölçüm kopyasıdır; kaynak MP4/HLS veya provider asset'i
yeniden kodlanmadı/değiştirilmedi. Kod/dependency/config ve orijinal korunur.

Birden çok yerel ölçüm dosyası kaydı için verilen geçici otomatik indirme izni
bittiğinde **Sor (varsayılan)** durumuna geri getirildi; diğer site izinlerine
dokunulmadı. Geçici yardımcı ve ölçüm/ayar sekmeleri kaldırıldı, kullanıcı sekmesi
korundu. Repo'da yalnız plan ve kabul raporu güncellendi; yeni Git/CI/deploy,
ödeme/upload/cüzdan imzası, provider onarımı, NEAR/D1 manuel mutasyonu veya dış
talep yapılmadı. Başarılı 20 sarma/token serisi ve unit/lint/build tekrarlanmadı.
**Tek devam gate'i `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE` — kalan gerçek kabul.**


### Kullanıcı kabul bildirimi — başka hesapla satın alma ve izleme

Kullanıcı “başka bir hesapla satın alıp izledim, problem yok” bildirimini verdi.
Bu, gerçek kullanıcı deneyiminin olumlu sonucudur; kullanıcı bildirimi olarak
kaydedildi, aynı senaryo araçlarla tekrar çalıştırılmadı. Hesap adı, işlem ve
imza sayısı verilmediğinden bunlara ilişkin yeni sayısal kanıt iddia edilmez.
Yeni hesap da satın aldığı için bu bildirim **satın almamış hesap reddi** testi
sayılmaz. Hassas fiziksel ≤150ms ölçümü de kullanıcı gözlemiyle kanıtlanmış sayılmaz.

Öneri: mevcut düzeltmeyi koru; yeni player/buffer/provider/auth müdahalesi yapma.
Yeni ödeme yapmadan mevcut satın almamış bir hesapla erişim reddini tamamla.
Bu kontrol geçerse, fiziksel kalibrasyon eksikliğini açık uyarı olarak tutup
`COMPLETED_WITH_WARNINGS` kapanışını değerlendirmek önerilir. Bu bir kapanış
önerisidir; mevcut kabul kriterleri bu kayıtla değiştirilmedi, gate kapanmadı.

Bu tur yalnız plan ve kabul raporuna kullanıcı bildirimi eklendi. Kod, tarayıcı,
provider, Git/CI/deploy veya cüzdan işlemi yapılmadı; tamamlanmış testler
tekrarlanmadı. **Tek devam gate'i `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE`.**


### Nihai gate kapanışı — kullanıcı ret kontrolü sonrası

**`PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE`: COMPLETED_WITH_WARNINGS / KAPALI.**
Kullanıcı, “Bu videoyu hiç satın almamış bir hesapla sayfayı aç. Satın alma yapma.
Video oynuyor mu, yoksa satın alma mı istiyor?” kontrolüne **“denedim video
oynamıyor”** yanıtını verdi. Yanıt bu açık test bağlamında manuel satın almamış
hesap kontrolü olarak kaydedildi. Daha önce başka hesapla satın alıp sorunsuz
izlediğini bildirmişti. Böylece önceki koşullu uyarılı kapanış önerisi uygulandı;
aynı test için kullanıcıdan yeniden ödeme veya tekrar istenmedi.

Kapanış kanıtları:

- İncelenmiş kaynak `9ee5bc18cc48e500c6ec53b2a66296ad891dfde8`, main CI
  `34507547060`, korumalı yayın `34509663409`, artifact ve serving sürümü eşleşmesi.
- Süre yaklaşık 4:09; normal bitiş; Auto/360p/720p ses/kare ilerlemesi.
- 20 sarma: birleşik p95 1957ms, max 2750ms; sonraki 10s'de max kare aralığı 133ms.
- Aynı player/kaynakta 6 dakika 20s, üç gerçek token yenilemesi; ek cüzdan olayı yok.
- JWT'siz gerçek segment HTTP 401; satın almamış hesapta oynamama **kullanıcı bildirimi**.
- Başka hesapta satın alma sonrası sorunsuz izleme **kullanıcı bildirimi**.
- Doğrudan medya kaydı/orijinal karşılaştırması: ortanca ses öndeliği 720p 95.7ms,
  360p 120.3ms, Auto 110.7ms; incelenen kayıt örnekleri 150ms altında.

Açık uyarılar, PASS olarak sunulmayacak:

1. Fiziksel hoparlör/ekran çıkışının kalibre ≤150ms ölçümü yapılmadı; **UNPROVEN**.
   Kayıt içi medya eşleştirmesi ve kullanıcının sorunsuz deneyimi bununla eş tutulmaz.
2. Satın almamış hesap sonucunu kullanıcı bildirdi. Hesap adı, ret arayüz mesajı
   ve HTTP/authorizer kaydı paylaşılmadı; bunlar bağımsız araç doğrulaması olarak
   iddia edilmez. “Video oynamıyor” yanıtı tek başına belirli bir HTTP kodu değildir.
3. Kaynak düzeltmesi yalnız ölçülmüş playback ID/playlist hash'i içindir; bütün
   videolar veya sağlayıcının genel medya üretimi için kabul sonucu değildir.

Bu kapanış bütün nicel kriterlerin PASS olduğu veya bütün playback planının
uyarısız doğrulandığı anlamına gelmez. Önceki BLOCKED/eksik-girdi kayıtları
kronolojik kanıt olarak korunur; bu kapanış mevcut operasyonel durumdur.

Bu tur yalnız plan ve kabul raporu güncellendi. Yeni kod veya tarayıcı işlemi,
yeni ödeme/upload/imza, Git/CI/deploy, provider onarımı veya dış talep yapılmadı.
Tamamlanmış testler tekrarlanmadı; yalnız belge ve dosya-koruma kontrolü yapıldı.
**Sonraki gate: yok / tanımlanmadı.** Bu gate yeniden yürütülmeyecek ve başka bir
gate otomatik başlatılmayacak. Uyarılar yeni bir kullanıcı talebiyle ele alınabilir.
