# Yeni videonun zaman çizelgesi: kaynak düzeltmesi

10 Eylül 2026 · `PLAYBACK_MEDIA_FIX_SOURCE` · **COMPLETED_WITH_WARNINGS**

Kaynak adayı tamamlandı. Mevcut yetkili medya üzerinde kontrollü Brave denemesi
başarılı; uygulamanın yayımlanmış sürümü değiştirilmedi. Provider’daki HLS
çıktısı da değiştirilmedi. Bu düzeltme YouTick’in hls.js tüketim yolundadır.

## Kapsam ve seçim

Yalnız publication `lp-0ccc24cb-0b79-4eb7-a2ab-72e5fcbe43e6`, playback
`ef819lp2r3anecgq` içindir. Eski video, atlanan FFmpeg/sentetik video deneyi ve
dış destek talebi açılmadı. Yeni servis, bağımlılık, player ürünü veya genel
medya dönüştürme çatısı eklenmedi. Tek yazan ana agent; subagent kullanılmadı.

Başlangıçta yeni asset’in **50 TS segmentinin tamamı** salt-okunur ölçüldü:
360p ve 720p’de 25’er segment; hepsinde ilk video PTS **135000 tick = 1.5s**,
ilk ses PTS **1.400922–1.462089s**. Böylece bütün sınırlardaki sıfırlama,
önceki altı-segment örneklemesinden daha güçlü kanıtla doğrulandı.
İki playlist’in tam içerik SHA-256’sı aynı:
`daa629f3156f8fe09843b69de756785d2cd823da0a0a0f7d202c41df541c0720`.
Playlist 25 segment / 248.705s; URI’ler yalnız `0.ts`…`24.ts` bağıl adlarıdır.

İlk, yalnız discontinuity işareti ekleyen aday sarma sorununu giderse de video
sonunda **250.721442s** üretti. Bu ek süre nedeniyle o aday bırakıldı; çalışma
alanına taşınmadı. Son çözüm playlist’i değiştirmez, segment saatlerini ortak
bir çizelgeye taşır.

## Son uygulama

- `createLivepeerHlsConfig`, yalnız yukarıdaki playback ID’de iki mevcut hls.js
  loader uzatma noktasını kullanır. Diğer videolarda varsayılan loader kalır.
- Playlist loader, tam SHA-256 eşleşince mevcut `EXTINF` sürelerinden nominal
  segment başlangıçlarını 90000 Hz tick olarak çıkarır. Playlist yanıtını
  değiştirmeden iletir. Başlangıçlar hls.js’nin sonradan değiştirebildiği
  `frag.start` alanından alınmaz.
- Segment loader yalnız bu player’ın doğrulanmış playlist URL’sine bağlı,
  bütün, cc=0 ve bilinen sıra numarasındaki segmenti ele alır. Gerçek TS paket
  yapısı ve gözlenen başlangıç saatleri de eşleşmelidir.
- Audio/video PES PTS ve varsa DTS alanlarına **aynı zaman ofseti** eklenir.
  Böylece mevcut ses-görüntü farkı ve PTS-DTS farkı korunur; saat dışındaki
  payload ve orijinal yanıt buffer’ı değişmez. Yeniden kodlama yapılmaz.
- Daha önce düzeltilmiş saatler, bozuk/uyumsuz veri, farklı/değişmiş playlist,
  partial segment veya discontinuity bildirilmiş fragment olduğu gibi geçer.
  Bu, genel MPEG-TS üreticisi değildir; PCR/taşıma alanları değiştirilmediğinden
  çıktı hls.js demux girdisi içindir, yeniden yayımlanacak TS dosyası değildir.
- Playlist hash kontrolündeki abort/destroy/yeni yükleme yarışı korunur;
  geç gelen yanıt ne doğrulama durumunu ne oynatıcıyı yeniden açar.
- Mevcut izinli host kontrolü ve güncel `Livepeer-Jwt` getter’ı aynı kalır.
  Medya byte’ları normal yetkili GET sonrasında bellekte işlenir. NEAR kimlik,
  entitlement, cihaz/oturum, ödeme ve token yenileme koduna müdahale yoktur.
- `LivepeerPlayer` HLS config’ini playback ID ile memoize eder; token getter’ı
  güncel ref’i kullanır. Başka videoya geçiş eski asset’in ayarını taşımaz.

Bilinen sınır: bu bir **tek asset için dar uyumluluk düzeltmesi**dir. Provider
paketleme kusurunun bütün gelecekteki asset’ler için çözüldüğü iddia edilmez.
Provider onarımı sonrası bu istisna kaldırılmalı veya yeniden doğrulanmalıdır.
Kimlik, playlist veya beklenen reset biçimi değişirse otomatik genişlemez.
Native-only HLS tarayıcıları bu hls.js yolunu kullanmayabilir; mevcut gate Brave’dir.

## Değişen dosyalar

1. `apps/web/lib/livepeer-hls-timeline.ts` — yeni, 112 satırlık sınırlı uyumluluk yardımcısı.
2. `apps/web/lib/livepeer-playback.ts` — playback ID’ye bağlı config bağlantısı.
3. `apps/web/components/LivepeerPlayer.tsx` — playback ID değişiminde doğru config.
4. `apps/web/__tests__/unit/livepeer-hls-timeline.test.ts` — yeni regresyonlar.
5. `apps/web/__tests__/unit/livepeer-playback.test.ts` — kapsam ve JWT koruması.
6. `docs/architecture/playback-ux-plan.md` — gate kaydı.
7. Bu belge.

## Doğrulama

`docs/testing.md` içindeki komutların odaklı kullanımı:

- `npm test -- --run __tests__/unit/livepeer-hls-timeline.test.ts __tests__/unit/livepeer-playback.test.ts __tests__/unit/livepeer-playback-v2.test.ts`: **42 PASS**.
  Son metadata regex ifadesinden sonra yeni dosyanın **13/13** kontrolü tekrar geçti.
- `npm run lint`: **PASS**, hata/uyarı yok.
- `npm run build`: **PASS**, mevcut CI örnek testnet hesaplarıyla kapalı-bayrak
  derlemesi. Next middleware/bağımlılık uyarıları canlı runtime kanıtı değildir.
- Paket düzeyindeki unit örnekleri gerçek byte alanlarını BigInt ile bağımsız
  oluşturur: ortak PTS/DTS kaydırması, bütün diğer byte’ların korunması,
  idempotence, bozuk marker/sync, yanlış playlist/player, değişmiş hash,
  partial/discontinuity/range-dışı sıra ve geç yanıt reddi sınanır.
  Bunlar iptal edilmiş sentetik video/FFmpeg deneyi değildir.

### Aynı gerçek asset ile kontrollü Brave kanıtı

Son kaynak dosyası TypeScript’ten JavaScript’e dönüştürülerek sayfada zaten
bulunan **hls.js 1.6.16** ile kontrollü kullanıldı. İlk konsola taşıma denemesinde
regex kaçış karakteri kaybı müdahaleyi devre dışı bıraktı; bu deneme başarı
sayılmadı. Kaçış gerektirmeyen eşdeğer `[0-9]` ifadesiyle son kaynak doğrulandı.
Normal kaynak kodu testleri de bu son ifadeyle geçti.

Aynı mevcut JWT ve HLS kullanıldı; her kalite yeni instance’da başlatıldı.
60s sarma sonrası 6s’deki son kaynak sonuçları:

| Kalite | Medya zamanı | Süre | Son audio/video buffer bitişleri | Durum |
| --- | --- | --- | --- | --- |
| Auto | 63.273s | 248.705s | 90.044 / 90.127s | readyState=4, ses ve kare ilerliyor |
| 360p | 63.393s | 248.705s | 102.055 / 102.127s | readyState=4, ses ve kare ilerliyor |
| 720p | 63.205s | 248.705s | 102.055 / 102.127s | readyState=4, ses ve kare ilerliyor |

Aynı ortak-ofset algoritmasının kenar kontrolü:

- 180s’ye sarma: ilerlemeye dönüş ~1001ms, audio ilerledi.
- 20s’ye geri sarma: ~302ms, audio ilerledi.
- 240s’ye sarma: ~3402ms, audio ilerledi.
- Gerçek sona ulaşma: **ended=true / 248.784578s**. Playlist toplamından fark
  yaklaşık **79.6ms**; bu değer A/V senkron farkı değildir. Kaynak metadata’sı
  248.581667s ayrıca korunur; kodlanmış ses padding’i/bitim farkı bağımsızdır.

42 test, TypeScript/build ve gerçek medya kontrolleri birlikte source davranışını
kanıtlar. Kontroller bütün video boyunca kesintisiz izleme veya 20 sarma p95
ölçümü değildir. Fiziksel dudak/ses eşleşmesi ve ≤150ms A/V kabulü `UNPROVEN`.
Bütün ürünün yeni yayınında gerçek cüzdan/yenileme kabulü yapılmış sayılmaz.

## Etki, temizlik ve yayın sınırı

Provider asset, playback ID, generation, NEAR publication/entitlement, kaynak
medya, CDN nesneleri ve cache ayarları değişmedi. Ağda orijinal HLS/TS kalır;
YouTick yalnız decoder’a verilen bellekteki PES saatlerini düzenler. Başka
istemci/iframe bu yayımlanmamış uygulama düzeltmesinden yararlanmış değildir.

Geçici player ve yardımcı runtime durumları kaldırıldı; yalnız asıl video kaldı.
Asıl video **7.109323s / paused / Auto** ve önceki `MEDIA_RACE` konsol filtresiyle
korundu. Yeni cüzdan imzası, ödeme, upload veya dış destek mesajı yoktur.

Dirty kaynak üzerinde doğrudan yeniden yazmak yerine izole dosya kopyası
kullanıldı. Aktarım explicit-path diff ile yapıldı. Yedi dosya test edilen adayla
birebir eşleşti; kapsam dışındaki 267 dosyanın hash’i ve HEAD korundu. Diff/boşluk
kontrolü geçti. Mevcut kullanıcı değişiklikleri korundu.

**Tek sonraki gate: `PLAYBACK_PUBLIC_TESTNET_ACCEPTANCE`.** Önce incelenmiş
source farkı için Git/CI ve korumalı public-testnet yayın paketi hazırlanır;
Git yayını/deploy açık onay gerektirir. Sonra yayımlanmış yeni Web’de gerçek
izleme, yenileme ve ses/sarma kabulü tamamlanır. Bu gate yayın yapmadı ve
provider’ın dosyalarını onardı iddiasında bulunmadı.
