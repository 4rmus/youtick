# Google hesabıyla mevcut V2 oynatıcı

Gate: `NEAR_AUTH_CREATOR_PLAYBACK_SOURCE`. Tarih: 16 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS**. Yerel kaynak ve sentetik tarayıcı kabulü
tamamlandı. Gerçek Google upload, yayın ve creator HLS oynatımı **UNPROVEN**.
Güncel sıra: [entegrasyon durumu](./near-auth-integration-status.md).

## Uygulanan davranış

- Normal `LivepeerPlayer` cüzdan bağlantısını alıp ortak
  `LivepeerPlayerContent` gövdesine verir. Lab aynı gövdeyi `getWallet`
  vermeden kullanır. İkinci bir player/surface veya medya motoru eklenmedi.
- Cüzdansız kullanım yalnız mevcut V2 akışını kullanır. Cihaz yetkisi yoksa
  yeniden kontrol sunulur; Google/sponsor imzası, yeni cihaz hazırlığı veya
  cihaz aktivasyonu düğmesi açılmaz. Normal cüzdan davranışı korunur.
- Lab, mevcut oturum kontrollü medya API'sini ve mevcut publication okumasını
  kullanır. Google hesabı, Market, publication kimliği, creator sahipliği,
  yayın durumu ve mevcut V3 cihaz yetkisi doğrulanmadan player açılmaz.
  `SALES_SUSPENDED` mevcut erişimi kesmez; `TAKEDOWN`, yanlış creator,
  eksik/geçersiz cihaz ve kapalı V2 oynatmayı durdurur.
- Oynatıcı yeniden denemesi, önce lab'in oturum/sahiplik/cihaz kontrolüne
  döner. Eski hesap bilgisiyle doğrudan token isteği tekrarlanmaz. V2'nin
  normal token yenilemesi mevcut cihaz anahtarını kullanır.
- Upload formunun ve kaydedilmiş upload durumunun yayın/durum bağlantıları
  `jobHref` üzerinden lab'de `/auth-lab?job=…` adresinde kalır. Normal
  `/upload` ve `/watch` varsayılanları korunur. Elle seçilen video da URL'ye
  yazılır; reload aynı yayını oturum kontrolünden sonra yeniden açar.
- Yönlendirmeli girişte yalnız 1–128 karakterlik geçerli job kimliği Auth0
  `appState` ile taşınır. Callback `/auth-lab` olarak sabit kalır; keyfi
  `returnTo`, dış URL, geçersiz job ve OAuth query ayrıntıları korunmaz.

## Oturum ve cihaz sınırı

Başarılı giriş/çıkış oturum yazımlarında ve istemcideki auth-lab 401
yanıtlarında mevcut `suspendDeviceSession()` kullanılır. İlgili hesap
kontrolünde değişiklik tespit edilirse aynı durdurma uygulanır. Bu işlem
anahtarı silmez; mevcut revision/BroadcastChannel mekanizmasıyla devam eden
oynatma ve yenilemeler durur.

Lab bu bildirimi dinler, oynatıcıyı kapatır, medya kontrolünü temizler ve
bekleyen okumaları iptal/geçersiz sayar. Sonradan gelen eski publication
cevabı oynatmayı yeniden açamaz. Diğer sekmede yeniden oynatma istenirse
sunucu oturumu tekrar doğrulanır. Çıkış, zincirdeki 30 günlük cihaz kaydını
silme işlemi değildir; oturum çerezinin süresi ile zincirdeki yetki süresi
birbirine karıştırılmaz.

Yeni endpoint, SDK, bağımlılık, sözleşme, Bridge veya WalletProvider değişikliği
yok. Eski imzalar yeniden kullanılmadı; gerçek cihaz veya cüzdan depolarına
test müdahalesi yapılmadı.

## Doğrulama

**LOCAL_TEST:** 46 dosya / **722 test PASS**. Yeni birim kontrolleri job'un
redirect/callback turunu, geçersiz dönüş verilerini, lab içinde kalan
bağlantıları, oturum yazımından sonra durdurmayı ve 401 yanıtlarını kapsar.

`node scripts/near-auth-playback-browser-check.mjs`: **15 senaryo PASS**.
Gerçek React bileşenleri, V2 istek imzası, WebCrypto, IndexedDB ve
BroadcastChannel; ayrı, geçici bir Brave bağlamında kullanıldı. Mevcut
Brave profili açılmadı/değiştirilmedi. Kimlik, zincir ve token yanıtları ile
medya surface'i test verisidir; dış ağ istekleri engellenir.

- WalletProvider olmadan creator oturumu ve V2 token yenilemesi.
- Reload sonrası aynı dışa aktarılamayan V3 anahtar.
- Yeniden denemede 401; iki sekmede logout ve yenileme zamanlayıcılarının durması.
- Yanlış creator, takedown, eksik/süresi geçmiş/eşleşmeyen cihaz, kapalı V2 ve
  provider okuma hatasında kapalı kalma; yeni cihaz aktivasyonu açmama.
- Hesap değişiminde eski player'ın durması; logout sonrası geciken cevabın
  oynatmayı canlandıramaması.
- Job bağlantısı değişimi ve elle seçilen videonun reload ile korunması.

`node scripts/player-device-browser-check.mjs`: normal cüzdan yolunun mevcut
**5 senaryosu PASS**. Buradaki cüzdan/zincir çağrıları da sahtedir.

**LOCAL_STATIC:** sıkı auth tip kontrolü, lint, ayrı kaynak kopyasında Web
build, doküman build ve diff boşluk kontrolü PASS. Web build sentetik testnet
ayarlarıyla ve kapalı lab ile çalıştı; çalışan sunucunun `.next` hedefinde
build çalıştırılmadı. Vite config, Next middleware/Edge ve bundle boyutu
uyarıları var; gerçek Edge/Cloudflare kabulü çıkarılmaz.

Komutlar [testing.md](../testing.md) içinde kayıtlıdır. Kanıt:
`tmp/near-auth-creator-playback-gate3/evidence/result.json`.

**Sınır:** testlerde gerçek HLS segmenti çözümlenmedi; başarılı token yanıtı
gerçek video oynatma kabulü sayılmaz. Google/OAuth sağlayıcısının canlı
callback ayarı, gerçek sponsor penceresi ve mevcut kullanıcı profilinin
kararlılığı bu gate'te test edilmedi.

## Değişen yüzey ve sonraki gate

Kaynak: `LivepeerPlayer`, `LivepeerPaidUploadForm`, `NearAuthLab`,
`NearAuthUpload`; `near-auth-lab`, `near-auth-signing`, `near-auth-funding`,
`near-auth-upload-wallet` istemcileri. Testler: ilgili dört unit dosyası ve
yeni yerel tarayıcı betiği. Test yönergesi, bu rapor ve güncel durum belgesi
güncellendi; Gate 2 raporuna tarihsel durum bağlantısı eklendi.

**EXTERNAL_NOT_RUN:** gerçek Google/cüzdan imzası, ödeme, upload, Livepeer
oynatımı, provider/config/NEAR/D1 mutasyonu, CI, deploy, commit/push/PR.

**Tek sonraki gate:** Gate 4 — kontrollü canlı kabul. Önce sağlayıcının
prompt düzeltmesine ait kaynak/yayın kanıtı ve mevcut Brave profilinin
ödeme onaysız kararlılık kontrolü gerekir. Aynı taslağın işlemleri, hesap,
cihaz, dosya ve güncel ücretleri yeniden uzlaştırılır; bütün gerçek imzaları
kullanıcı verir. Gate 4 başlatılmadı. Provider düzeltmesi **UNPROVEN** kalır.
