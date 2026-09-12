# Current state

> 12 Eylül 2026 — kullanıcı onayıyla kontrollü testnet Video V1 uyarılı kapanışı.
> Son kaynak/test entegrasyonu: [`f28b3031cf860d5810c2cb9db0de8b255605f712`](https://github.com/4rmus/youtick/commit/f28b3031cf860d5810c2cb9db0de8b255605f712).
> Son kayıtlı davranış yayını b53e00e olarak korunur; PR #198 yalnız test/belge içerir, yeni deploy yok.
> Yükleme kayıtları önceki koşunun orijinal sekmelerinden kurtarıldı; iki ayrı
> hesapla oynatma 13:39–13:46 UTC arasında doğrulandı. 2+2 kabulünün son zincir snapshot'ı
> **12 Eylül 13:47:35.486 UTC**. Yeni ödeme, yükleme veya deploy yapılmadı.
> Dayanıklılık ön kontrolünün 15:58–16:12 UTC okumaları hedef yayın, provider,
> webhook ve kuyruk bağlantısını doğruladı; yeni canlı hata testi değildir.

## Şu anki hedef

Ana hedef genel mimari dönüşüm planındaki **Faz 3 — dayanıklı, devam edebilir yükleme**.
Güncel alt plan [Public Testnet Video V1](./public-testnet-video-v1-plan.md).
Önceki ürün gate'i `VIDEO_PUBLIC_TESTNET_LONG_UPLOAD_PUBLICATION_VERIFICATION_RELEASE`
**COMPLETED_WITH_WARNINGS / KAPALI**; 5 GB / 120 dakika yükleme ve yayın kabulü PASS.
**Kontrollü testnet Video V1 — COMPLETED_WITH_WARNINGS / KAPALI (§59).**
`VIDEO_PUBLIC_TESTNET_TWO_BY_TWO_ACCEPTANCE` — PASS / KAPALI.
İki üreticinin TUS aktarım işlemleri 160,934 saniye örtüştü. Soteri ve utick2,
iki ayrı Brave profilinde aynı anda en az 5 dakika izledi. Önceki eksikler kapandı;
güncel sonuç kabul §47, ilk koşunun uyarılı kaydı §46'dadır.
**Dayanıklılık ön kontrolü: `VIDEO_PUBLIC_TESTNET_RESILIENCE_PREFLIGHT` — PASS.**
**Önceki gate: `VIDEO_PUBLIC_TESTNET_TERMINAL_REPLAY_ACCEPTANCE` — PASS / KAPALI.**
M2 yayınına iki imzalı sentetik bildirim sırayla gönderildi; ayrı ACK'ler yaklaşık
10,4 ve 6,9 saniyede gözlendi. 60 saniyelik sessiz pencere ve son ACK sonrası
10 dakika gözlem tamamlandı. Yayınlar, bakiyeler, 23 asset, operator nonce/outbox,
Bridge sürümü ve açık yükleme kabulü korundu; iki kuyruk 0 mesaj / 0 bayt.
Güncel kanıt kabul §52; altı eski mesajın yedekli temizliği §51'de korunur.
Gerçek provider redelivery ve kesin ek fatura tutarı bu testle kanıtlanmaz.
**Kaynak entegrasyonu: PR #198 — PASS.** Public-testnet politika, ilk alarm,
restart ve tek finalize testleri main f28b303'te. PR/main CI başarılı; Bridge380PASS/3SKIP.
Preview otomatik yayını atlandı; yeni runtime yayını yapılmadı. Runtime bu incelemede yeniden ölçülmedi (§55).
**Son gate: `VIDEO_PUBLIC_TESTNET_V1_ACCEPTANCE_CLOSEOUT` — COMPLETED_WITH_WARNINGS / KAPALI.**
Kullanıcı §58'deki somut paketi “onaylıyorum” yanıtıyla kabul etti. Beş canlı hata
senaryosu ve ek sınır/biçim testleri DEFERRED_BY_USER_ACCEPTANCE olarak kaydedildi;
teknik kanıtları UNPROVEN kalır. Mevcut kullanıcı akışları ve önceki kabul edilmiş
uyarılar korunur. **Kabul döngüsü durdu; aktif veya sonraki V1 gate'i yok.**
Bu karar yalnız kontrollü testnet V1 içindir; tüm mimari fazlar veya Mainnet kapanışı değildir.
12 Eylül kullanıcı kararı: ilk sürüm kabulü **2 eşzamanlı yükleme + 2 eşzamanlı izleme**.
Önceki 3 yükleme önerisi bununla değişti; 1.000 eşzamanlı izleme testi kullanıcı
isteğiyle kapsamdan çıkarıldı. Canlı global yükleme sınırı değiştirilmedi.

Okuma sırası: exact GitHub main ve ilgili ortamın zamanlı kanıtı → bu kısa özet →
[Video V1 kabul günlüğü](./public-testnet-video-v1-acceptance.md) §59 → §58 → §57 → §55 → §52 → §47 →
[Playback planı](./playback-ux-plan.md) §16 → tarihsel plan/kapanış kayıtları.
Tarihsel “next gate”, FAILED veya NOT_DEPLOYED metinleri güncel çalışma seçimi değildir.

## Ürün ve yetki sınırları

- NEAR ödeme, iş, yayın, kazanç ve izleme hakkının otoritesidir.
- Livepeer doğrudan TUS yükleme, işleme, saklama ve JWT korumalı HLS dağıtımını sağlar.
- Bridge kontrol ve yetkilendirme katmanıdır; kaynak video tarayıcıdan doğrudan Livepeer’a gider.
- D1 yeniden üretilebilir Discover/Profile okuma verisidir; ekonomik otorite değildir.
- Public-testnet cihaz yetkisi yeni başarılı satın alma/yükleme işleminden itibaren
  **30 gün** sürer. İzleme, reload, token yenileme veya upload-key recovery süreyi uzatmaz.
  Önceki 8 saatlik oturum metinleri tarihsel/legacy davranıştır; güncel karar Playback §13'tedir.
- Kaynak feature flag'leri kapalı varsayılanlarını korur. Deploy anahtarının false olması
  çalışan public-testnet yüklemelerinin kapalı olduğu anlamına gelmez.

## Doğrulanmış kaynak ve kayıtlı kabul

`LOCAL_STATIC`, `LOCAL_TEST`, `CI`, `PROVIDER`, `PREVIEW`, `PRODUCTION`,
`EXTERNAL_NOT_RUN` ve `UNPROVEN` ayrı kanıt sınıflarıdır.
Aşağıdaki PREVIEW satırları özellikle **public-testnet** ortamını anlatır.

| Konu | Kanıt / sonuç | Sınır ve referans |
|---|---|---|
| Kaynak ve CI | Main `f28b303`; [CI 34710745980](https://github.com/4rmus/youtick/actions/runs/34710745980) success; PR #198 | `LOCAL_STATIC / CI`; yalnız test/belge entegrasyonu, yeni canlı kabul veya deploy değildir. |
| Korumalı yayın | [Public Testnet Video 34683764285](https://github.com/4rmus/youtick/actions/runs/34683764285) success; ilk deneme | 6 provenance + 2 SBOM doğrulandı. Yeni CI veya yayın bu belge gate'inde çalıştırılmadı. |
| Büyük dosya | Aynı 5.000.000.000 bayt / 7200,008008 sn kaynak ready/JWT → Published/ACTIVE → katalog HTTP 200 | `PREVIEW / PROVIDER`; yeni Bridge cutover sonrası 120,852844 sn. Kurtarmada yeni ödeme/upload/asset 0; yayınlar 7→8, önceki 7 yayın aynı. Kabul §45. |
| Kesintiden devam | M2 aynı dosya/iş/TUS üzerinden 33.554.432→269.467.407 bayt; yanlış dosya/hesap kontrolleri ve ilk 24 saatlik son tarih korundu | `PREVIEW / PROVIDER`; tek ödeme/asset/publication, uyarılı işlevsel kabul kapalı. Kabul §25. Genel başarı oranı veya eşzamanlı kapasite kanıtı değildir. |
| Cüzdan ve playback | #189 ödeme yetkili cihaz oturumu, #191 cold reload, #193 güvenli hata ölçümü, #194 ölçülen HLS zaman çizelgesi, #196 geç cüzdan dönüşü main'de | Son cüzdan koşusu 12/12 imzasız restore; Playback §16'da 20 sarma ve üç gerçek token yenilemesi. Farklı koşuların ölçümleri birleştirilmez. |
| Üretici çekimi | 5,88 testUSDC tek çekimle cüzdana geçti; kazanç 0; FINAL/FT/olay/bakiye ve Profile doğrulandı | `PREVIEW`, PASS. Gerçek ücret 0,000747676380855 testNEAR. Kabul §35. Mainnet muhasebe kabulü değildir. |
| Maliyet/hız | Kullanıcı kabulüyle COMPLETED_WITH_WARNINGS / KAPALI | İlk görüntü hızı, yeterli p95 örneği ve gerçek ek fatura maliyeti ertelendi; giderilmiş sayılmaz. Kabul §33. |
| Chrome/Edge ve yavaş ağ | Kullanıcı kabulüyle COMPLETED_WITH_WARNINGS / KAPALI | 7 ilk görüntü örneği ve Edge'de yaklaşık 450 sn aynı oynatıcı ilerlemesi. Ağ/tampon etkisi, Auto kalite toparlanması ve ölçüm sınırları ertelendi. Kabul §39. |
| Discover/veri akışı | Public-testnet kurulum, sürekli blok takibi, predecessor bağlantısı, sınırlı katalog okumaları ve önbellek yenilemesi main'de | B09/B10 ve PR #185–188 kayıtları. FASTNEAR yerel deneyi üretim veri kaynağının devralma kabulü değildir. NEAR geri dönüşü korunur. |

Son kayıtlı public-testnet sürümleri: Web `eadec555-d4fa-4469-a810-f10191b787f4`,
Bridge `0f45b81e-8f7d-485c-aad8-51e076910a3c`, read-model
`91063507-21ec-46df-8d56-2542b8d6e37b`; her biri %100. Servis edilen 16 Web JS
artifact ile eşleşti. Public yüklemeler açık bırakıldı, iki deploy anahtarı false.
Bu değerler yukarıdaki zamanlı kabul kaydına aittir; yeni işlem öncesinde yenilenir.
Eski Preview korunmuştur. **Production/mainnet açılışı bu kayıtla kanıtlanmaz**;
yeni bir Production yayını bu gate'te yapılmadı.

## Fazların durumu

Ana plan Faz 0–6, toplam **7 faz** içerir. Faz 3'ün kapanışından sonra **3 faz** kalır;
önceki fazların tüm dış doğrulamalarının tamamlandığı veya bir tamamlanma yüzdesi iddia edilmez.

| Faz | Durum |
|---|---|
| 0 — Mimari sınırlar | Pilot için büyük ölçüde hazır; bağımsız inceleme/sorumlular açık. |
| 1 — Cüzdan ve sözleşme güvenliği | Yerel/testnet/CI kanıtı güçlü; ana ağ yönetişimi ve bağımsız inceleme açık. |
| 2 — Oynatma ve kayıt ömrü | Gerçek oynatma/cihaz akışları ilerledi; arşivleme/temizlik ve Production kanıtı eksik. |
| 3 — Dayanıklı yükleme | Kontrollü testnet V1 kullanıcı onayıyla uyarılarla kapalı. Genel dayanıklılık ve mimari faz kapanışı ayrı; sonraki faza geçilmedi. |
| 4 — Olay/veri/muhasebe | Public-testnet veri akışı ve mali işlemler kanıtlı; genel faz ve mainnet muhasebesi açık. |
| 5 — Kapasite/maliyet/işletim | Kısmi; gerçek ölçek, alarm teslimi ve fatura uzlaştırması açık. |
| 6 — Denetim/kurtarma/mainnet | Dış denetim, tatbikat, yönetişim ve kademeli ana ağ açılışı tamamlanmadı. |

## Kalanlar ve kabul edilmiş ertelemeler

- Kontrollü testnet V1 kabulü kapalıdır. Beş canlı dayanıklılık ve ek sınır/biçim
  testleri kullanıcı onayıyla ertelendi; çözülmüş veya PASS sayılmaz (§59). Eski beta
  ve1.000izleyici kapsam dışı,2+2PASS korunur. V1 için açık kabul blocker'ı veya
  otomatik sıradaki gate yok; genel mimari/operasyon işleri ayrı kalır.
- Terminal replay öncesindeki 6 DLQ mesajı üç eski işe bağlandı; aynı işlerdeki
  tarihsel boyut/küçük resim sınırı hataları #192/#195/#197 ile düzeltilmişti.
  Tek tek özgün hata izi UNPROVEN. Altı eski mesajın yedekli seçici temizliği §51 ile tamamlandı.
- 5 GB yayının kabulü iki saat kesintisiz oynatma, diğer dosya biçimleri veya 5 GB+1 sınır testi değildir.
- Maliyet/hız, tarayıcı/yavaş ağ ve Playback gate'leri kullanıcı kabulüyle kapalıdır;
  ertelenen bulgular bunları kendiliğinden yeniden açmaz. Fiziksel A/V kalibrasyonu,
  bağımsız yetkisiz hesap HTTP kanıtı ve kesin ek provider maliyeti UNPROVEN kalır.
- Son uzun-video koşusundaki bir `admission_denied` kaydı hedef iş ile bağımsız
  ilişkilendirilemedi; hedef kendiliğinden yayımlandı. Bu uyarı düzeltilmiş sayılmaz.
- UploadJob arşiv/silme, 90 günlük temizlik ve operasyon doğrulamaları ayrı açık işlerdir.
  Tam sıfırdan read-model rebuild/RTO daha önce ertelendi; yeniden V1 çıkış şartı yapılmaz.
- Modern player/1080p konuşması ayrı bir öneridir; kaydedilmiş uygulama planı veya
  yapılmış geliştirme olarak sunulmaz. Bu kabulün profilleri 360p+720p'dir.

## Yeni çalışma alanına geçiş

2+2 kabulünde iki ayrı üreticinin 269.467.407 baytlık videoları Published/ACTIVE;
katalog ikisine HTTP 200 verdi. Yayınlar 8→10, önceki 8 yayın aynı; ilk koşunun
toplam ödemesi 1,20 testUSDC. Devamda ek ödeme veya yükleme yok. Orijinal
sekme kayıtları TUS işlem örtüşmesini 160,934 saniye olarak kanıtladı; bu,
382,627 saniyelik yayın öncesi iş örtüşmesinden farklıdır ve kesintisiz PATCH
baytı gönderimi iddiası değildir. İki ayrı hesapla en az 5 dakikalık oynatma,
toplam 4 başarılı yenileme ve 0 ölçülen medya hatası doğrulandı; akışlar kapatıldı.
Kesin ek provider maliyeti UNPROVEN kalır. Güncel kayıt kabul §47 ve
`tmp/video-two-by-two-evidence-recovery-20260912/receipt.json` içindedir;
ilk koşunun receipt dosyası tarihsel olarak değişmeden korunur.

Kullanıcı **eski klasörü silmeden arşiv tutmayı** ve başka klasörde temiz main'den
çalışmayı seçti. Yerel arşiv kökü: `/Users/arair/works/youtick-lp`.
Bu kökteki `agent/closed-preview-bootstrap-smoke` / `d2d3b035...` kodu güncel main
olarak kullanılmaz; eski kod/test/workflow parçaları yeni çalışma alanına taşınmaz.

12 Eylül güncellemesi: PR #198 ile üç canonical belge main'e taşındı; playback planındaki yerel kullanıcı değişikliği korunur. Aşağıdaki taşıma açıklaması önceki geçişin tarihsel kaydıdır.

Taşınacak dört belge bu dosya, `public-testnet-video-v1-plan.md`,
`public-testnet-video-v1-acceptance.md` ve `playback-ux-plan.md` dosyalarıdır.
Yerel güncelleme GitHub main'e otomatik geçmez: yeni klonda dört dosya ayrıca
aktarılmalı veya yalnız belge değişiklikleri ayrı Git yayınıyla main'e alınmalıdır.
Bu gate commit/push/PR/merge/deploy başlatmaz ve yeni klasörü oluşturmaz.

Tarihsel raporların düz kod biçimindeki mutlak yolları eski arşivi gösterir;
`tmp/...` kanıt yolları da bu arşiv köküne göre okunur. `/var/folders/...` bağlantıları
geçici yerel kanıttır; yeni klonda veya kalıcı arşivde bulunacağı varsayılmaz.
Market olay/D1 gelecek planı eski klasörde `docs/architecture/market-event-driven-read-model-plan.md`
olarak korunur; aktif gate veya üretim FASTNEAR geçişi değildir.

2 Eylül özetinin değişmemiş hali [önceki current-state kaydında](https://github.com/4rmus/youtick/blob/b53e00e962b595f0edf4f1283c146d73d1f76b57/docs/architecture/current-state.md),
uzun geçmiş [transformation-progress.md](./transformation-progress.md) içinde korunur.
Ana faz hedefi yerel arşivden ayrı `/Users/arair/Desktop/youtick/youtick-fazli-mimari-donusum-plani.md`
dosyasındadır; bu belge güncellemesi o hedef planını değiştirmez.
