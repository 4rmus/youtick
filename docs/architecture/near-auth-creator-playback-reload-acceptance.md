# Google creator playback ve reload — canlı kabul

Gate: `NEAR_AUTH_CREATOR_PLAYBACK_RELOAD_ACCEPTANCE` — **PASS**.
Kapanış: **22 Eylül 2026 Türkiye saati** (son zincir kontrolü 21 Eylül
21:00:20 UTC). Mevcut Distance yayını aynı Brave İş profili ve Google
hesabıyla açıldı; gerçek HLS oynatma ve bir sayfa yenilemesi sonrası erişim
ve oynatma doğrulandı. Kullanıcı “Video her şeyiyle harika çalışıyor” dedi.

## Kapsam

Yeni ödeme, fonlama, Google/MPC/cüzdan işlem imzası, upload veya cihaz kaydı
yapılmadı. Mevcut V3 cihazın olağan oynatma yetkilendirmesi kullanıldı.
Eski anahtar/kayıt temizliği, depolama dökümü veya yeni profil oluşturma yok.
Uygulamanın normal izleme konumu/oynatıcı tercihi kaydı çalışmaya devam etti.
Yalnız bu rapor ve entegrasyon durum belgesi değişir. Ana ajan tek başına
çalıştı; alt ajan açılmadı.

## PROVIDER — aynı yayın ve creator hakkı

- Job/yayın: `lp-b16e1bcb-e98e-4005-ade7-99c63bdb558b`, başlık **Distance**.
- Google hesabı:
  `29445f46f23551e48c99869c2e34e3acb283902db8196da32cb3f6625872324c`.
- Son final blok **269646064**, hash
  `7Eo25HvU2FngZSie73rByCjQ2X8uuKfWzyy8z7ktjosk`.
- Yayın sahibi bu hesapla eşleşiyor; availability **ACTIVE**, generation **1**;
  `has_entitlement=true`.
- Uygulama aynı job için “İzleme hakkı doğrulandı” mesajını gösterdi.

## Gerçek tarayıcı/medya kabulü

Açık bir YouTick sekmesi kalmadığı için mevcut Brave İş profilinde doğrudan
aynı yayının `/auth-lab?job=...` sayfası açıldı. Var olan Google oturumu
otomatik geri geldi; yeni giriş veya cüzdan onayı gerekmedi. Uygulama
creator/publication/mevcut V3 cihaz koşullarını geçerek oynatıcıyı açtı.

| Kontrol | Gözlenen kanıt |
| --- | --- |
| İlk medya hazırlığı | Süre **236,518 saniye**, readyState **4**, video **1280×720** |
| İlk oynatma | currentTime **24,461 saniye**, paused **false**, medya hatası yok |
| HLS kaliteleri | Etkin **Auto / 360p / 720p** seçenekleri; gözlenen seçim 720p |
| Yenileme öncesi | Konum **193,073 saniye / 3:13**, 720p, medya hatası yok |
| Bir sayfa yenilemesi | Google oturumu ve aynı yayın hakkı otomatik geri geldi |
| İzleme konumu | **Continue from 3:13** seçeneği geri geldi; tıklanınca oynatıcı 3:13 ve Pause gösterdi |
| Yenileme sonrası token | Mevcut cihazla ilk playback token isteği yaklaşık **1.242 ms** içinde tamamlandı |
| Yenileme sonrası medya | `first-frame` görüldü; ölçülen bir heartbeat'te **5.001 ms** oynatma |
| Hata ölçümü | İncelenen oynatma örneklerinde errors **0**, warnings **0** |
| Kullanıcı kabulü | Kullanıcı videonun her şeyiyle iyi çalıştığını bildirdi |

Brave'de video kaynağı MSE `blob` olarak görünür. HLS kanıtı yalnız bu
etikete dayanmaz: canlı oynatma, HLS kontrolcüsünden gelen 360p/720p kalite
listesi, mevcut player'ın doğrulanan Livepeer `index.m3u8` yolu ve başarılı
playback token/first-frame ölçümleri birlikte değerlendirilmiştir. Ham token,
JWT içeren URL veya ağ istek gövdesi rapora/kanıta alınmadı. HTTP manifest
ve segment yanıtları ayrı bir ağ dökümüyle arşivlenmedi.

Kullanıcı test sırasında oynatıcıyla da etkileşti. Yenileme sonrasındaki bir
son örnek 4,336 saniye ve paused=true gösterdi; bu, aradaki oynatma ölçümleriyle
birlikte kaydedildi. Konum örneklerinden kesintisiz oynatma veya bütün seek
kontrollerinin otomatik test edildiği sonucu çıkarılmadı.

## Kabul sınırları

Bu, **localhost Google lab + gerçek testnet Bridge/NEAR + gerçek Livepeer
medyası** kabulüdür; mock veya yalnız kaynak testi değildir. Public Web'de
Google girişinin açıldığı ya da Production/mainnet kabulü alındığı anlamına
gelmez. Uzun süreli token yenileme, mobil/Safari, buyer satın alma/oynatma,
ikinci cihaz, passkey ve hesap kurtarma bu gate'te test edilmedi.
Publication sorgusu düzeltmesinin yerel test kabulü ayrı rapordadır; eski
canlı 409'un kesin alt nedeni bu oynatma başarısıyla kanıtlanmış sayılmaz.
Eski başarısız upload denemesi ve hassas çıktı olayı ayrıca açık kalır.

## Dosyalar ve doğrulama

- `docs/architecture/near-auth-creator-playback-reload-acceptance.md`.
- `docs/architecture/near-auth-integration-status.md`.

Kanıt:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-playback-acceptance-3J8aKv/`.
`browser-acceptance.json` güvenli ölçümleri, `chain.json` final yayın/entitlement
kontrolünü içerir. Kaynak değişmediği için unit/build'ler tekrarlanmadı;
doküman build/bağlantı **PASS**, kapsam dışı dosyalar ve Git index korunmuştur.
Mevcut doküman bundle boyutu uyarısı sürer.
CI/deploy, provider/config, Git yayın işlemleri ve yeni ödeme/upload
**EXTERNAL_NOT_RUN**. Bu dar gate'in blocker'ı yoktur.

**Tek sonraki gate: `NEAR_AUTH_PRODUCT_IDENTITY_FUNDING_PLAN`.** Mevcut
planda sıradaki ürün kimliği/finansman kararını somutlaştırmak: kullanıcıya
sunulacak Google/sponsor deneyimi, masrafı ödeyen aktör ve limitler; passkey,
hesap sürekliliği ve kurtarma sınırları. Bu bir plan gate'idir; yeni finansal
işlem, servis veya provider geçişi yetkisi değildir. Henüz açılmadı.
