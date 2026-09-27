# NEAR Auth V1 — dönüş hedefi ve Chrome hesap kontrolü

Gate: `NEAR_AUTH_V1_REDIRECT_TARGET_ACCEPTANCE`.
25 Eylül 2026 — **PASS (Chrome / Google / mevcut upload hedefi)**.

## Kontrollü kapanış

Kullanıcının “önerdiğin gibi devam et” talebiyle aynı gate sürdürüldü.
Chrome'da başlangıç URL'si
`http://localhost:3000/upload?job=lp-fddf7a11-0dca-4705-ac0f-dedbcff308a4`
ve `2944…324c` hesabı gözlendi. Popup kimlik doğrulamadan kapatıldı; görünür
`Continue in this tab` düğmesine ajan bastı ve **aynı sekmenin** Auth0 giriş
sayfasına geçtiği doğrulandı. Kullanıcıya bu aşamada haber verildi; kullanıcı
eski Google hesabıyla giriş yapıp sayfayı değiştirmediğini teyit etti.

Aynı Chrome sekmesi **tam başlangıç URL'sine ve aynı `2944…324c` hesabına**
döndü. Job query'si korundu; OAuth code/state/error parametreleri yoktu.
Kontrollü deneme başlangıcından itibaren sunucuda **tek session POST 200**
görüldü. Reload aynı hedef ve hesabı korudu; session POST sayısı bir kaldı.
Böylece önceki kesintili gözlemde açık kalan upload-hedef dönüşü ve tek
oturum yazımı bu kontrollü Google denemesi için kapandı.

- **PROVIDER / yerel gerçek runtime:** UI'den aynı-sekme redirect başlatma,
  kullanıcı Google girişi, tam hedefe dönüş, doğru hesap, query temizliği,
  tek session write ve reload. Ortak client/provider ayarı değiştirilmedi.
- Üç Web gönderim bayrağı `false`; Bridge'in kayıtlı üç bayrağı `false` ve
  yerel Bridge kapalı kaldı. Sekiz config/kalıcı Bridge dosyasının hash'leri
  korundu. Runtime yeniden başlatılmadı.
- Yükleme sayfasının mevcut ödeme-durumu uyarısı ve 422 okuma cevapları
  sürüyor; bu login kabulünü bozmaz, ödeme veya upload kabulü değildir.
  Ajan ödeme, imza, dosya seçimi/yükleme veya bilet alımı başlatmadı.
- **LOCAL_STATIC:** yalnız bu rapor ve ana plan güncellendi; kaynak ve Git
  index korundu. Doküman build/kapsam kontrolü PASS; mevcut bundle uyarısı
  sürer. Kaynak testleri bu canlı gate'te tekrar çalıştırılmadı.
- **UNPROVEN:** aynı kontrollü hedef akışının passkey/watch/mobil/Safari ve
  hosted/Production çeşitleri; ayrıca bu URL'deki işin Google hesabına ait
  olduğu veya yüklemeye devam edilebildiği iddia edilmez.
- **EXTERNAL_NOT_RUN:** provider ayarı/iletişim, imza/ödeme/upload,
  runtime restart, CI/GitHub/deploy. Gerçek Google girişi yukarıda ayrı
  kaydedildi; yeni hesap, fonlama veya hesap bağlama yapılmadı.

Kapanış kanıtı:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-target-controlled-7ym8k4t1/`.
Chrome oturumu açık bırakıldı. Bu gate'in blocker'ı yok.
**Tek sonraki gate: `NEAR_AUTH_V1_LOCAL_RUNTIME_RECOVERY_PREFLIGHT` —
başlatılmadı.** Kapalı yerel Bridge ve ödeme-durumu uyarısı, mevcut kayıtlar
korunarak salt-okunur incelenecek; bu öneri runtime başlatma veya ödeme yetkisi değildir.

## Önceki kesintili inceleme — tarihsel COMPLETED_WITH_WARNINGS

**Eski Google hesabı doğrulandı:** kullanıcı doğru Google hesabıyla yeniden
giriş yaptığını bildirdi. Chrome'da `2944…324c` hesabı ve tam hedef
`/upload?job=lp-fddf7a11-0dca-4705-ac0f-dedbcff308a4` gözlendi. Reload sonrası
aynı hesap ve aynı bağlantı korundu. Kontrol sırasında yeni login başlatılmadı.

## Kanıt sınırı

Gate başında Brave bağlantısı giriş düğmesinde kesildi. Kullanıcının isteğiyle
tarayıcı işlemleri Chrome'a taşındı. Chrome'da önce farklı `3772…23d9` hesabı
görüldüğünde bunun doğru hesap olduğu varsayılmadı. Kullanıcı çalışmayı
durdurup eski Google hesabıyla giriş yaptığını bildirdi; taze kontrol doğru
`2944…324c` hesabını doğruladı.

Popup kapatma hazırlığı kesintisiz bir redirect denemesine tamamlanamadı.
Chrome'daki mevcut URL ve hesabın doğrulanması, provider → kök → callback →
hedef zincirinin tamamının gözlendiği anlamına gelmez. Yalnız ilgili iki
origin ve son 30 dakika için bakılan sınırlı tarayıcı geçmişi de redirect
modunu kanıtlamadı; auth kodları/ham query kaydedilmedi.
**Kontrollü redirect zinciri ve tek callback write hâlâ UNPROVEN.**

Hedef iş kimliği önceki passkey yüklemesinin bağlantısıdır. Google oturumuyla
bu URL'nin korunması, işin Google hesabına ait olduğunu veya yetkili devam,
ödeme/yayın/izleme kabulünü göstermez.

## Doğrulamalar

- Chrome sayfasında hesap `2944…324c`; tam job query'si korunmuş, OAuth
  code/state parametreleri yok. Reload aynı hesap/hedefi geri getirdi.
- Gate başlangıcından itibaren üç session POST 200 kaydı var; mevcut kontrol
  öncesi ve reload sonrası sayı üç kaldı. Kesintili dönemdeki üç yazım tek
  girişin tekrar işlenmesi olarak sınıflandırılmadı; kullanıcı hesap seçimi
  değişti. Yeni giriş tekrarı yapılarak araştırılmadı.
- Üç Web gönderim bayrağı false; Bridge'in kayıtlı bayrakları false ve gate
  başındaki endpoint kontrolünde Bridge kapalı. Bu gate'te restart/ayar yok.
  Sekiz runtime config/kalıcı Bridge dosyasının hash'leri aynı kaldı.
- UI'deki `Upload payment status could not be checked` uyarısı ve 422 durum
  okuma cevapları sürüyor. Bu giriş başarısızlığı veya yeni ödeme kanıtı değil.
- Yalnız bu rapor ve ana plan değişti. Kaynak ve Git index korundu; doküman
  build/kapsam kontrolü PASS, mevcut 500 kB bundle uyarısı sürer. Kaynak
  testleri yeniden çalıştırılmadı. Ödeme, imza, yeni upload, provider ayarı/
  iletişim, runtime restart veya CI/deploy yapılmadı.

Kanıt dizini: `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-target-acceptance-apc0pazg/`.
Mevcut Chrome oturumu açık bırakıldı. Hesap/hedef/reload kontrolünde blocker
yok; tam yönlendirme kabulünde gözlem eksiği var.
O aşamada aynı gate'in kontrollü kabulü açık bırakılmıştı; yukarıdaki kontrollü
kapanış Google/upload hedefi için bu eksik kanıtı tamamladı.
