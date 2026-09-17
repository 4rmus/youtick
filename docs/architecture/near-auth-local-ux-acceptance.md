# NEAR Auth yerel kullanıcı akışı kabulü

Gate: `NEAR_AUTH_LOCAL_UX_ACCEPTANCE`. Tarih: 17 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS / LOCAL_STATIC + LOCAL_TEST**.
Güncel sıra: [entegrasyon durumu](./near-auth-integration-status.md).

## Kapsam ve kabul

Amaç, önceki compact upload ve geçerlilik kontrollerini gerçek React
ekranları üzerinden sınamak: anlaşılır özet, açık onay, iptal, süre aşımı,
belirsiz işlem, aynı dosyayla devam ve yenileme sırasında ikinci ödeme engeli.
Masaüstü ve 320 piksel genişlikte görsel kontrol de kapsamdadır.

Başlangıçtaki 369 kaynak dosyası ve Git index kaydı koruma için saklandı.
İzinli değişiklikler mevcut lab/upload UI, imzalama istemcileri, ilgili
testler ve gate belgeleridir. Kontrat/ABI, Bridge, WalletProvider, cihaz
deposu, bağımlılıklar, flag varsayılanları ve canlı ayarlar kapsam dışıdır.
Gerçek Brave profiline bağlanılmadı; testler yeni ve geçici bağlamlarda çalıştı.

## Bulunan sorunlar ve dar düzeltmeler

- Dar ekranda uzun düğme yazıları taşıyordu. Yalnız lab içindeki düğmelerin
  yazısı satıra geçiyor; ortak düğme bileşeni değiştirilmedi.
- Upload ilerleme çizelgesi ekran genişliğine göre beş sütun seçiyor,
  masaüstündeki dar lab panelinde adımlar üst üste geliyordu. Mevcut CSS
  düzeni artık panelin genişliğine göre sütun sayısını seçiyor.
- Google iptali ve süre aşımı genel hata olarak gösteriliyordu. Ödeme
  öncesi iptal/geçersizlik açıkça anlatılıyor; sponsor ödemesinin başlamadığı
  belirtiliyor. `access_denied`, kullanıcı iptali olarak yorumlanmıyor.
- Normal imza yetkilendirme yanıtındaki `authorization_expired` nedeni
  istemcide kayboluyordu. Yalnız `authorize` aşamasında korunuyor;
  `complete` hatası ödeme yapılmadığı iddiasına dönüştürülmüyor.
- Cüzdan yanıtı kaybolduğunda upload genel hata gösteriyordu. İki Google
  imzalama yolunda da cüzdan çağrısı reddi `outer_unknown` olarak ele
  alınıyor. `outer_pending` kaydı korunuyor, kullanıcı mevcut işlemi
  kontrol etmeye yönlendiriliyor; yeniden imza/ödeme açılmıyor.

## Kanıt

| Kontrol | Sonuç |
| --- | --- |
| Web unit | 48 dosya / **775 test PASS** |
| Yeni Brave UX testi | **18 senaryo PASS** |
| Mevcut Brave playback testi | **15 senaryo PASS** |
| Auth tip kontrolü, lint | PASS |
| İzole Web build | PASS; sentetik testnet adresleri, kapalı flag varsayılanları |
| Doküman build, kapsam ve index kontrolü | PASS |

18 UX senaryosu: başarılı imza, mobil özet, Google iptali/zaman aşımı,
inceleme/onay bitişi, belirsiz işlem + reload, meşguliyet kilidi, upload
özeti iptali, eksik uyumlu deployment, upload Google iptali/zaman aşımı/onay
bitişi, mobil upload formu, processing + reload, bilet özeti/onayı,
upload belirsiz yanıt + reload ve yayınlandı + reload.

- Açık onay verilmeden Google/sponsor çağrısı yok. Upload özetinde örnek
  başlık, **0.600000 test USDC** toplam yükleme bedeli ve **2.250000 test
  USDC** bilet bedeli okunur; compact `yt:u1:` baytları kullanıcı özeti değildir.
- İptal, bilinen süre aşımı ve eksik uyumlu servis senaryolarında sponsor
  çağrısı **0**. Örnek bedeller test verisidir, canlı ödeme yetkisi değildir.
- Belirsiz sponsor yanıtında reload sonrası toplam sponsor çağrısı **1**;
  Google upload relay çağrısı **0**. Mevcut deneme kaydı ikinci imzayı engeller.
- Processing sırasında aynı kaynak dosyayla yenileme/devam aynı job'ı
  korur: toplam Google/sponsor/relay/TUS PATCH sayıları **1/1/1/1**.
- Bilet özetinde tutar, sözleşme, sponsor, ilk cihaz ve kimlik açıklaması
  görünür. Onaydan sonra sahte işlem doğrulanır; buyer HLS kabulü değildir.
- Mevcut 15 senaryo V3 cihaz anahtarının yenilemede korunmasını,
  logout/401/hesap değişikliği ve yetkisiz oynatma retlerini tekrar doğrular.
- Masaüstü ve dar ekran görüntüleri incelendi. Sayfa/düğme taşma ve adım
  sütunlarına sığma kontrolleri otomatik olarak da geçiyor.

Test gerçek lab, imzalama istemcisi, uploader, IndexedDB ve tarayıcı dosya
akışını kullanır. Auth0, cüzdan, sunucu/zincir, Bridge ve TUS sınırları sahtedir.
Yerel origin dışındaki istekler test yanıtlarıyla karşılanır veya engellenir;
beklenmeyen hedef/page error sayısı **0**. Gerçek Next API işleyicileri bu
tarayıcı testine dahil değildir; ayrı unit testler ve build kanıtı vardır.

Çalıştırma: [test komutları](../testing.md). Yeni betik
`apps/web/scripts/near-auth-ux-browser-check.mjs`; kurulu Brave ve ffmpeg gerekir.
Yeni bağımlılık eklenmedi. Tarayıcı motorunun bildirdiği sürüm `153.0.8010.37`;
bu sayı Brave ürün sürümü veya fiziksel mobil cihaz kabulü değildir.

Kanıt/yedek: `tmp/near-auth-local-ux-f3g6y9o0/`.
Son UX görüntüleri ve dialog metinleri: `tmp/near-auth-ux-run-8kh19w/`.
İlk başarısız UX kaydı: `tmp/near-auth-ux-run-FskMpP/`; dört akış geçmiş,
sekiz assertion kalmıştır. Bunların ikisi test senkronizasyonu/yanlış link
seçicisiydi; hepsi uygulama hatası olarak sayılmaz. Sonradan eklenen
processing senaryosundaki yanlış metin seçicisi de testte düzeltildi.

## Değişen dosyalar ve sınırlar

- `apps/web/components/NearAuthLab.tsx`
- `apps/web/components/NearAuthSigning.tsx`
- `apps/web/components/LivepeerPaidUploadForm.tsx`
- `apps/web/lib/near-auth-signing.ts`
- `apps/web/lib/near-auth-upload-wallet.ts`
- `apps/web/__tests__/unit/near-auth-signing-client.test.ts`
- `apps/web/__tests__/unit/near-auth-upload-wallet.test.ts`
- Yeni UX betiği, bu rapor, entegrasyon durumu ve `docs/testing.md`.

**EXTERNAL_NOT_RUN / UNPROVEN:** gerçek Google/passkey/MPC onayı, sponsor
penceresi kararlılığı, ücretli upload, gerçek HLS, fiziksel mobil cihaz,
CI, Preview, Production ve deploy. Kontrat/Bridge değişmedi; onların
suite'leri, ABI/WASM ve boyut matrisi bu gate'te yeniden çalıştırılmadı.
Build'de önceki Auth0 Edge/Next middleware uyarıları sürer. Yerel başarılı
akış, gerçek `access_denied` hatasının çözüldüğü kanıtı değildir.

Bu yerel gate'in blocker'ı yoktur. Gerçek kabul için uyumlu Web/Bridge/Market
sürümlerinin yayını ve güncel Google tokenıyla kontrollü deneme gereklidir.
Compact yolu sağlayıcıyla iş birliği/yama beklemeyi zorunlu kılmaz.

**Tek sonraki gate: `NEAR_AUTH_COMPACT_RELEASE_PREFLIGHT`.** Kaynak adayını,
sürüm uyumunu, korumalı yayın sırasını ve kabul/geri dönüş koşullarını
incelemeye hazır hale getirmek. Bu gate açılmadı; commit/push, CI tetikleme,
deploy ve canlı ödeme için yeni yetki verilmiş sayılmaz.
